import { TaskStatus, TaskType } from '../../app/model/task';
import { Device } from './device';
export declare class Task {
    id: number;
    uuid: string;
    device: Device;
    status: TaskStatus;
    type: TaskType;
    payload: object;
    taskbind: string;
    snapshotbind: string;
    start: number;
    time: number;
}
