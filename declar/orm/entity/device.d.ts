import { User } from './user';
import { Task } from './task';
export declare class Device {
    id: number;
    deviceId: string;
    user: User;
    tasks: Task[];
}
