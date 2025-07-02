import { v4 as uuidv4 } from "uuid";

import { loggerOptions } from '../app/model/logger';
import { Logger } from "tslog";
const Log = new Logger(loggerOptions('orm'));

import * as dotenv from 'dotenv';
import { DataSource } from "typeorm";
import { Task } from "./entity/task";
import { User } from "./entity/user";
import { Device } from "./entity/device";
dotenv.config();

const host: string = process.env.DB_MYSQL_HOST!;
const port: number = Number(process.env.DB_MYSQL_PORT!);
const username: string = process.env.DB_MYSQL_USERNAME!;
const password: string = process.env.DB_MYSQL_PASSWORD!;
const database: string = process.env.DB_MYSQL_DATABASE!;

const MaaAppDataSource = new DataSource({
    type: 'mysql',
    host: host,
    port: port,
    username: username,
    password: password,
    database: database,
    synchronize: true,
    logging: false,
    entities: [
        Task,
        User,
        Device
    ]
})

MaaAppDataSource.initialize()
    .then(async () => {
        Log.info("Data Source has been initialized!")
    })
    .catch((err) => {
        Log.error("Error during Data Source initialization", err)
    });

export default MaaAppDataSource;