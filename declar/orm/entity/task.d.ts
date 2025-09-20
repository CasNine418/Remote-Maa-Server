import { TaskStatus, TaskType } from '../../app/model/task';
import { Device } from './device';
export declare class Task {
    id: number;
    uuid: string;
    device: Device;
    status: TaskStatus;
    type: TaskType;
    payload: string;
    taskbind: string;
    snapshotbind: string;
    start: Date;
    time: Date;
}
