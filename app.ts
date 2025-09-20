import express, { NextFunction, Request, Response } from 'express';
import path, { resolve } from 'path';
import http from 'http';
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bodyParaser from 'body-parser';

import { Logger } from 'tslog';
const Log = new Logger({ name: 'app', hideLogPositionForProduction: true });

import createHttpError from 'http-errors';
import { sendClientMessage } from './utils/semd_msg';
import { MaaGetTaskReturnTask, MaaTask, TaskStatus, TaskType } from './app/model/task';
import { In, Repository } from 'typeorm';
import { User } from './orm/entity/user';
import MaaAppDataSource from './orm';
import { Task } from './orm/entity/task';
import { Device } from './orm/entity/device';
import { ListBucketsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import presigner from "@aws-sdk/s3-request-presigner";
import { Server as IOServer, Socket } from 'socket.io';
import * as promClient from 'prom-client';

import * as dotenv from 'dotenv';
import { EventEmitter } from 'stream';
import { envConfig } from './env';
dotenv.config();

const app = express();

const env = envConfig.server.nodeEnv;


app.use(cors());
app.use(bodyParaser.json({ limit: '50mb' }));
app.use(bodyParaser.urlencoded({ limit: '50mb', extended: true }));

const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'],
});

app.use((req: Request, res: Response, next: NextFunction) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
        end({ method: req.method, route: req.route?.path || req.path, code: res.statusCode });
    });
    next();
});

app.use(express.json({
    limit: '50mb',
    inflate: true,
    strict: true,
    type: 'application/json',
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// s3

class AWSS3Service {
    private readonly s3: S3Client;
    private readonly bucketName: string;

    constructor(bucketName: string) {
        this.bucketName = bucketName;
        this.s3 = new S3Client({
            region: envConfig.s3.region!,
            endpoint: envConfig.s3.endpoint!,
            credentials: {
                accessKeyId: envConfig.s3.accessKeyId!,
                secretAccessKey: envConfig.s3.secretAccessKey!
            }
        })
    }

    private createUploadCommand(
        key: string,
        contentType: string,
        options: {
            acl?: 'private' | 'public-read';
            metadata?: Record<string, string>;
        } = {}
    ) {
        return new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            ContentType: contentType,
            ACL: options.acl || 'public-read',
            Metadata: options.metadata
        });
    }

    /**
     * 将流数据转换为 Buffer
     * @param stream 
     * @returns 
     */
    private async streamToBuffer(stream: any): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }

    /**
     * 生成上传链接
     * @param key 
     * @param contentType 
     * @param options 
     * @returns 
     */
    public async generatePresignedUrl(
        key: string,
        contentType: string,
        options: {
            expiresIn?: number;
            acl?: 'private' | 'public-read';
            metadata?: Record<string, string>;
        } = {}
    ) {
        const command = this.createUploadCommand(key, contentType, options);

        try {
            return {
                signedUrl: await presigner.getSignedUrl(this.s3, command, {
                    expiresIn: options.expiresIn || 300
                }),
                objectKey: key,
                contentType
            };
        } catch (error) {
            throw new Error('Failed to generate upload link');
        }
    }

    /**
     * 上传文件
     * @param key 
     * @param buffer 
     * @param contentType 
     * @param options 
     * @returns 
     */
    async uploadFile(
        key: string,
        buffer: Buffer,
        contentType: string,
        options: {
            acl?: 'private' | 'public-read';
            metadata?: Record<string, string>;
        } = {}
    ) {
        const command = this.createUploadCommand(key, contentType, options);
        command.input.Body = buffer;

        try {
            const response = await this.s3.send(command);
            Log.info(`Uploaded file successfully: ${key}`);
            return response;
        } catch (error) {
            throw new Error('Failed to upload file' + error);
        }
    }
}

const picturesBucketName = envConfig.s3.bucket;
const defaultS3Service = new AWSS3Service(picturesBucketName);

// maa service

interface MaaTaskCache extends MaaTask {
    user: string;
    device: string;
    timeout: NodeJS.Timeout;
}

class MaaController {

    private userRepository: Repository<User> = MaaAppDataSource.getRepository(User);
    private deviceRepository: Repository<Device> = MaaAppDataSource.getRepository(Device);
    private taskRepository: Repository<Task> = MaaAppDataSource.getRepository(Task);

    // 内部由identity(username:deviceId)索引
    private pullTaskCache: Record<string, MaaTaskCache[]> = {}

    private static UserInitState = {
        DONE: 1,
        NO_DEVICE: 2,
        NO_USER_AND_DEVICE: 3
    } as const;

    /**
     * 清除缓存任务
     * @description 清除任务缓存并更新Task数据库状态
     * @param user 
     * @param device 
     * @param task 
     * @param status 
     */
    private async clearCachedTask(user: string, device: string, taskUuid: string, taskTimeout?: NodeJS.Timeout, status?: TaskStatus): Promise<void> {
        // const { uuid } = task;

        try {
            if (status) {
                const objTask = await this.taskRepository.findOne({
                    where: {
                        uuid: taskUuid,
                        device: {
                            deviceId: device
                        },
                    },
                    relations: {
                        device: true
                    }
                });

                if (objTask) {
                    objTask.status = status;
                    await this.taskRepository.save(objTask);
                }
            }

            if (taskTimeout) {
                clearTimeout(taskTimeout);
            }

            const cacheKey = `${user}:${device}`;
            if (this.pullTaskCache[cacheKey]) {
                this.pullTaskCache[cacheKey] = this.pullTaskCache[cacheKey].filter(t => t.uuid !== taskUuid);

                if (this.pullTaskCache[cacheKey].length === 0) {
                    delete this.pullTaskCache[cacheKey];
                }
            }
        } catch (error: any) {
            throw new Error(error);
        }
    }

    /**
     * 将Task添加进数据库
     * @description 字面意思
     * @param user 
     * @param device 
     * @param task 
     */
    private async addTaskToDatabase(user: string, device: string, task: MaaTask): Promise<void> {
        const objUser = await this.userRepository.findOne({
            where: { name: user }
        });

        if (!objUser) throw new Error(`User ${user} not found`);

        const objDevice = await this.deviceRepository.findOne({
            where: { deviceId: device, user: objUser }
        })

        if (!objDevice) throw new Error(`Device ${device} not found`);

        const objTask = new Task();
        Object.assign(objTask, {
            ...objTask,
            ...task
        })
        objTask.device = objDevice;

        this.taskRepository.save(objTask)
            .then(() => { })
            .catch((err) => {
                throw new Error(err);
            })
    }

    /**
     * 更新数据库中Task的状态，附带清除缓存中对应的Task
     * @param user 
     * @param device 
     * @param task 
     */
    private async updateTaskToDatabase(user: string, device: string, task: MaaTask): Promise<void> {

        const objTask = await this.taskRepository.findOne({
            where: {
                uuid: task.uuid,
                device: {
                    deviceId: device
                },
            },
            relations: {
                device: true
            }
        });

        if (objTask) {
            Object.assign(objTask, task);
            this.taskRepository.save(objTask)
                .then(() => Log.info("Task updated " + task.uuid))
                .catch(err => { throw new Error(err) })
        } else {
            throw new Error("Task not found")
        }
        this.clearCachedTask(user, device, task.uuid);
    }

    /**
     * 更新数据库中的任务
     * @param task
     */
    private async updateAreadySearchDatabaseTask(objTask: Task) {
        // Log.debug(objTask.payload)
        this.taskRepository.save(objTask)
            .then(() => Log.info("Task updated " + objTask.uuid))
            .catch(err => { throw new Error(err) })
    }

    constructor() { }

    /**
     * 用户推送的Task先推送至缓存，定时清除
     * @description 推送进缓存时写入数据库，status设置为PENDING，后续触发成功更新数据库，超时由`clearCachedTasks`更新数据库
     * @param user 
     * @param device 
     * @param tasks 
     */
    public async userPushCachedTasks(user: string, device: string, tasks: MaaTaskCache[]): Promise<void> {
        const ttl = 1000 * 10;

        tasks.forEach(task => {
            // task.status = TaskStatus.PENDING;
            task.timeout = setTimeout(() => {
                this.clearCachedTask(user, device, task.uuid, task.timeout, TaskStatus.TIMEOUT)
                    .then(() => {
                        busCaller.emit("MAA_TASK_STATUS_CHANGED", user, device, TaskStatus.TIMEOUT);
                        Log.info("Clear cached task " + task.uuid);
                    })
                    .catch(err => { throw new Error(err) });
            }, ttl);

            this.addTaskToDatabase(user, device, task)
                .then(() => {
                    if (this.pullTaskCache[`${user}:${device}`]) {
                        this.pullTaskCache[`${user}:${device}`].push(task);
                    } else {
                        this.pullTaskCache[`${user}:${device}`] = [task];
                    }
                })
                .catch(err => { throw new Error(err) })
        })

        // return this.pullTaskCache[`${user}:${device}`];
    }

    /**
     * Maa获取任务调用的接口
     * @description 从缓存中获取未被捕获的任务，若此接口被调用PENDING的Task会视为PROGRESSING状态并更新数据库
     * @param user 
     * @param device 
     * @returns 
     */
    public async maaGetTask(user: string, device: string): Promise<MaaGetTaskReturnTask[]> {
        const tasks = this.pullTaskCache[`${user}:${device}`] || [];
        // Log.debug("Maa get task " + tasks.map(t => t.uuid) + "tasks" + tasks.length);

        tasks.forEach(task => {
            task.status = TaskStatus.PROGRESSING;

            const { user, device, timeout, ...taskData } = task;

            clearTimeout(timeout);

            this.updateTaskToDatabase(user, device, taskData);
        })

        return tasks.map(({ user, device, uuid, timeout, ...task }) => ({
            id: uuid,
            ...task
        }));
    }

    /**
     * Maa汇报任务接口
     * @param user 
     * @param device 
     * @param taskUuid 
     * @param taskStatus 
     */
    public async maaReportTask(user: string, device: string, taskUuid: string, taskStatus: TaskStatus, taskPayload: any): Promise<boolean> {

        const objTask = await this.taskRepository.findOne({
            where: {
                uuid: taskUuid,
                device: {
                    deviceId: device
                },
            },
            relations: {
                device: true
            }
        });

        if (objTask) {
            objTask.time = new Date();
            Log.debug(`[${device}] [${taskUuid}] [${objTask.type}] [${objTask.status}] [${taskStatus}] [${objTask.time}] [${objTask.start}]`);
            switch (objTask.type) {
                case TaskType.CaptureImage:
                case TaskType.CaptureImageNow: {
                    objTask.status = taskStatus;

                    if (taskStatus === TaskStatus.SUCCESS) {
                        const base64Str = taskPayload;
                        objTask.time = new Date();
                        try {
                            const buffer = Buffer.from(base64Str, 'base64');
                            const key = `Arknights/task_report_2/${user}/${device}/${objTask.uuid}.png`;

                            defaultS3Service.uploadFile(key, buffer, 'image/png')
                                .then(() => {
                                    objTask.payload = `https://cn-sy1.rains3.com/mirror.casninezh.com/Arknights/task_report_2/${user}/${objTask.device.deviceId}/${objTask.uuid}.png`;
                                    this.updateAreadySearchDatabaseTask(objTask);
                                })
                                .catch(err => {
                                    objTask.status = TaskStatus.FAILED;
                                    objTask.payload = '';
                                    Log.error(err);
                                    this.updateAreadySearchDatabaseTask(objTask)
                                        .catch(err => {
                                            throw new Error(err);
                                        });
                                })
                        } catch (error) {
                            // Log.error(error);
                            throw new Error('Invalid base64 string');
                        }
                    }
                    
                    return true; // 添加 return 提前退出，防止进入 default
                }
                default: {
                    objTask.status = taskStatus;
                    objTask.payload = taskPayload;
                    Log.debug(`Task status ${objTask.status}`)
                    this.updateAreadySearchDatabaseTask(objTask)
                        .catch(err => {
                            throw new Error(err);
                        });
                    return true;
                }
            }
        } else {
            Log.warn(`Task ${taskUuid} not found`);
        }

        return false;
    }

    /**
     * 用户获取任务
     * @description 用户从数据库拉取任务列表，包含所有的任务
     * @param username 
     * @param deviceId 
     * @returns 
     */
    public async userGetTask(username: string, deviceId: string): Promise<MaaTask[]> {
        const user = await this.userRepository.findOne({
            where: { name: username },
            relations: {
                devices: {
                    tasks: true,
                },
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        const device = user.devices.find(d => d.deviceId === deviceId);

        if (!device) {
            throw new Error('Device not found');
        }

        return device.tasks;
    }

    /**
     * 用户获取任务（分页版本）
     * @description 用户从数据库拉取任务列表，支持分页加载
     * @param username 
     * @param deviceId 
     * @param offset 偏移量，从第几条开始获取
     * @param limit 获取任务数量限制
     * @returns 
     */
    public async userGetTasksPaginated(
        username: string,
        deviceId: string,
        offset: number = 0,
        limit: number = 50
    ): Promise<{ tasks: MaaTask[], totalCount: number }> {
        const user = await this.userRepository.findOne({
            where: { name: username },
            relations: {
                devices: true,
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        const device = user.devices.find(d => d.deviceId === deviceId);

        if (!device) {
            throw new Error('Device not found');
        }

        // 获取任务总数
        const totalCount = await this.taskRepository.count({
            where: {
                device: {
                    id: device.id
                }
            }
        });

        // 获取任务，按开始时间倒序排列，支持分页
        const tasks = await this.taskRepository.find({
            where: {
                device: {
                    id: device.id
                }
            },
            order: {
                start: "DESC"
            },
            skip: offset,
            take: limit
        });

        // 转换为MaaTask格式
        const maaTasks: MaaTask[] = tasks.map(task => ({
            uuid: task.uuid,
            status: task.status,
            type: task.type,
            payload: task.payload,
            taskbind: task.taskbind,
            snapshotbind: task.snapshotbind,
            start: task.start,
            time: task.time
        }));

        return {
            tasks: maaTasks,
            totalCount
        };
    }

    public async userInit(username: string, deviceId: string): Promise<typeof MaaController.UserInitState[keyof typeof MaaController.UserInitState]> {

        const user = await this.userRepository.findOne({
            where: { name: username },
            relations: {
                devices: true,
            }
        });

        if (user) {
            if (user.devices.find(d => d.deviceId === deviceId)) {
                return MaaController.UserInitState.DONE;
            } else {
                const device = new Device();
                device.deviceId = deviceId;
                device.user = user;
                user.devices.push(device);
                await this.userRepository.save(user);
                return MaaController.UserInitState.NO_DEVICE;
            }
        } else {
            const user = new User();
            user.name = username;
            const device = new Device();
            device.deviceId = deviceId;
            device.user = user;
            user.devices = user.devices || []; // init
            user.devices.push(device);
            await this.userRepository.save(user);
            return MaaController.UserInitState.NO_USER_AND_DEVICE;
        }
    }
}

const maaService = new MaaController();

class Caller extends EventEmitter {
    constructor() {
        super();
    }
}

const busCaller = new Caller();

// routers
const maaRouter = express.Router();

const MAA_USER_AGENT_REGEX = /^MaaWpfGui\/v\d+\.\d+\.\d+.*$/;

maaRouter.post('/getTask', (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.get('User-Agent') || '';
    if (!MAA_USER_AGENT_REGEX.test(userAgent)) {
        sendClientMessage.sendErrorMessage(res, 403, 'Forbidden: Invalid User-Agent', null);
        return;
    }
    const { user, device } = req.body;

    if (!user || !device) {
        sendClientMessage.sendErrorMessage(res, 400, 'Invalid request', null);
        return;
    }

    maaService.maaGetTask(user, device)
        .then(tasks => {
            const sendTasks = tasks.map(task => {
                let typeName = TaskType[task.type];
                // 处理LinkStart和Toolbox系列特殊值，将其转换为带连字符的格式
                switch (typeName) {
                    case "LinkStartBase":
                        typeName = "LinkStart-Base";
                        break;
                    case "LinkStartWakeUp":
                        typeName = "LinkStart-WakeUp";
                        break;
                    case "LinkStartCombat":
                        typeName = "LinkStart-Combat";
                        break;
                    case "LinkStartRecruiting":
                        typeName = "LinkStart-Recruiting";
                        break;
                    case "LinkStartMall":
                        typeName = "LinkStart-Mall";
                        break;
                    case "LinkStartMission":
                        typeName = "LinkStart-Mission";
                        break;
                    case "LinkStartAutoRoguelike":
                        typeName = "LinkStart-AutoRoguelike";
                        break;
                    case "LinkStartReclamationAlgorithm":
                        typeName = "LinkStart-ReclamationAlgorithm";
                        break;
                    case "ToolboxGachaOnce":
                        typeName = "Toolbox-GachaOnce";
                        break;
                    case "ToolboxGachaTenTimes":
                        typeName = "Toolbox-GachaTenTimes";
                        break;
                }
                return {
                    ...task,
                    type: typeName
                };
            });
            sendClientMessage.sendTaskMessage(res, 'OK', sendTasks);
            if (tasks.length > 0) {
                busCaller.emit('MAA_TASK_GOT', user, device, tasks);
                Log.info(`Got ${tasks.length} tasks from ${user}@${device}`);
            }
        })
        .catch(err => {
            sendClientMessage.sendErrorMessage(res, 400, 'Failed to get tasks', {});
            Log.error(err);
        });
})

maaRouter.post('/reportStatus', (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.get('User-Agent') || '';
    if (!MAA_USER_AGENT_REGEX.test(userAgent)) {
        sendClientMessage.sendErrorMessage(res, 403, 'Forbidden: Invalid User-Agent', null);
        return;
    }

    const { user, device, task } = req.body;
    if (!user || !device || !task) {
        sendClientMessage.sendErrorMessage(res, 400, 'Invalid request', {});
        return;
    }

    const reportStatus = () => {
        if (req.body.status === 'SUCCESS') {
            return TaskStatus.SUCCESS;
        } else {
            return TaskStatus.FAILED;
        }
    }

    maaService.maaReportTask(user, device, task, reportStatus(), req.body.payload)
        .then(() => {
            sendClientMessage.sendOKMessage(res, 'Task reported', {});
            // Log.debug(`Task ${task} reported, status: ${req.body.status} | ${reportStatus()}`);
            busCaller.emit('MAA_TASK_REPORTED', user, device, task, reportStatus());
        })
        .catch((err) => {
            Log.error(err);
            sendClientMessage.sendErrorMessage(res, 500, 'Internal server error', {});
        })
})

app.use(maaRouter);

// ws

interface ServerToClientEvents {
    // 收到任务
    MaaReceiveTask: (user: string, device: string, tasks: MaaTask[], callback: (res: number) => void) => void;
    // 汇报任务
    MaaReportTask: (user: string, device: string, task: string, status: TaskStatus, callback: (res: number) => void) => void;
    MaaTaskStatusChanged: (user: string, device: string, status: TaskStatus, callback: (res: number) => void) => void;
}

interface ClientToServerEvents {
    authUser: (user: string, device: string, callback: (res: number) => void) => void;
    hello: (data: any) => void;

    userGetTask: (callback: (res: number, tasks: MaaTask[]) => void) => void;
    userGetTasksPaginated: (offset: number, limit: number, callback: (res: number, data: { tasks: MaaTask[], totalCount: number }) => void) => void;
    userPushTask: (task: MaaTask, callback: (res: number) => void) => void;
}

interface InterServerEvents { }

interface SocketData {
    user: string;
    device: string;
}

class MaaWSServer {
    private controller: MaaController;
    private io = new IOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(3001, { cors: { origin: "*" } });
    private outerCaller: Caller;

    private static CallbackError = {
        INTERNAL_SERVER_ERROR: -1,
        TIME_OUT: -2,
    } as const;

    constructor(controller: MaaController, caller: Caller) {
        this.controller = controller;
        this.outerCaller = caller;
    }

    private innerTimeout<T>(promise: Promise<T>, delay: number) {
        const timeout = new Promise<T>((resolve, reject) => {
            setTimeout(() => reject(new Error('timeout')), delay)
        })
        return Promise.race([promise, timeout]);
    }

    private bindSubEvent(socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) {
        socket.on('hello', (data: any) => {
            Log.debug(`${socket.data.user} ${socket.data.device} hello ${JSON.stringify(data)}`);
        });

        socket.on('userGetTask', async (c: (res: number, tasks: MaaTask[]) => void) => {
            try {
                const tasks = await maaService.userGetTask(socket.data.user, socket.data.device);
                c(1, tasks);
            } catch (error) {
                Log.error("Failed to get task: " + error)
                c(-1, []);
            }
        })

        socket.on('userGetTasksPaginated', async (offset: number, limit: number, c: (res: number, data: { tasks: MaaTask[], totalCount: number }) => void) => {
            try {
                const result = await maaService.userGetTasksPaginated(socket.data.user, socket.data.device, offset, limit);
                c(1, result);
            } catch (error) {
                Log.error("Failed to get tasks: " + error)
                c(-1, { tasks: [], totalCount: 0 });
            }
        })

        socket.on('userPushTask', async (task: MaaTask, c: (res: any) => void) => {
            try {
                const taskCache: MaaTaskCache = {
                    ...task,
                    start: new Date(),
                    user: socket.data.user,
                    device: socket.data.device,
                    timeout: null as unknown as NodeJS.Timeout
                };
                await maaService.userPushCachedTasks(socket.data.user, socket.data.device, [taskCache])
                c(1);
            } catch (error) {
                Log.error("Failed to push task:", error);
                c(-1);
            }
        })
    }

    private callerTrigger() {
        this.outerCaller.on('MAA_TASK_GOT', (user, device, tasks: MaaTask[]) => {
            this.io.fetchSockets().then(sockets => {
                sockets.forEach(socket => {
                    if (socket.data.user === user && socket.data.device === device) {
                        socket.emit('MaaReceiveTask', user, device, tasks, (res) => { });
                    }
                });
            })
        })

        this.outerCaller.on('MAA_TASK_REPORTED', (user, device, task: string, status: TaskStatus) => {
            this.io.fetchSockets().then(sockets => {
                sockets.forEach(socket => {
                    if (socket.data.user === user && socket.data.device === device) {
                        socket.emit('MaaReportTask', user, device, task, status, (res) => { });
                    }
                });
            })
        })

        this.outerCaller.on('MAA_TASK_STATUS_CHANGED', (user, device, changedStatus: TaskStatus) => {
            this.io.fetchSockets().then(sockets => {
                sockets.forEach(socket => {
                    if (socket.data.user === user && socket.data.device === device) {
                        socket.emit('MaaTaskStatusChanged', user, device, changedStatus, (res: number) => { });
                    }
                });
            })
        })

        this.outerCaller.on('error', (error) => {
            Log.error('OuterCaller Error: ' + error);
        })
    }

    public init() {
        this.io.on('connection', (socket) => {
            Log.info("New connection: " + socket.id);

            socket.on('authUser', async (user: string, device: string, callback: (result: number) => void) => {
                const timeout = 10000;
                let completed = false;

                const timer = setTimeout(() => {
                    if (!completed) {
                        Log.warn(`Auth timeout for socket ${socket.id}`);
                        callback(MaaWSServer.CallbackError.TIME_OUT);
                        socket.disconnect();
                    }
                }, timeout);

                try {
                    const success = await this.controller.userInit(user, device);
                    completed = true;
                    clearTimeout(timer);

                    if (success) {
                        socket.data.user = user;
                        socket.data.device = device;
                    }

                    callback(success);
                    this.bindSubEvent(socket);

                } catch (err) {
                    completed = true;
                    clearTimeout(timer);
                    Log.error(`Auth error for socket ${socket.id}:`, err);
                    callback(MaaWSServer.CallbackError.INTERNAL_SERVER_ERROR);
                    socket.disconnect();
                }
            });
        })
        this.callerTrigger();
    }
}

const s = new MaaWSServer(maaService, busCaller);
s.init();

// error

app.use((req: Request, res: Response, next: NextFunction) => {
    next(createHttpError.NotFound(`Can not find the requested resource: ${req.url}`))
})

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    res.locals.message = err.message;
    res.locals.error = env === 'development' ? err : {};

    if (err instanceof SyntaxError && 'body' in err) {
        sendClientMessage.sendErrorMessage(res, 400, "Invalid JSON", {});
        Log.error(err.message);
        Log.debug(err);
    } else {
        sendClientMessage.sendErrorMessage(res, err.status || 500, err.message, {});
        Log.error(err.message);
        Log.debug(err);
    }
})

// start

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(envConfig.server.port);
app.set('port', port);
const mode = envConfig.server.mode;

/**
 * Create HTTP server.
 */


/**
 * Listen on provided port, on all network interfaces.
 */
if (mode === 'http') {
    const server = http.createServer(app);
    server.listen(port);
    server.on('error', onError);
    server.on('listening', () => onListening(server));
} else if (mode === 'https') {
    const httpsOptions = {
        key: fs.readFileSync(envConfig.ssl.keyPath),
        cert: fs.readFileSync(envConfig.ssl.certPath),
    };
    const server = https.createServer(httpsOptions, app);
    server.listen(port);
    server.on('error', onError);
    server.on('listening', () => onListening(server));
} else {
    Log.error('MODE not set');
    process.exit(1);
}

/**
 * Handle SIGINT
 */
process.on('SIGINT', async () => {
    Log.info("Server closed");
    process.exit(0);
});


/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val: any) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error: any) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening(server: http.Server | https.Server) {
    const addr = server.address();
    const bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr?.port;
    Log.info('Listening on ' + bind + ' in ' + process.env.MODE + ' mode');
}