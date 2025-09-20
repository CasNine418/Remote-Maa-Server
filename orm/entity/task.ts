import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TaskStatus, TaskType } from '../../app/model/task';
import { User } from './user';
import { Device } from './device';

@Entity()
export class Task {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    uuid!: string;

    @ManyToOne(() => Device, device => device.tasks)
    device!: Device;

    @Column()
    status!: TaskStatus;

    @Column()
    type!: TaskType;

    @Column()
    payload!: string;

    @Column()
    taskbind!: string;

    @Column()
    snapshotbind!: string;

    @Column('datetime')
    start!: Date;

    @Column('datetime')
    time!: Date;
}