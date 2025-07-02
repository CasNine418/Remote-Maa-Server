import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { User } from './user';
import { Task } from './task';

@Entity()
export class Device {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  deviceId!: string;

  @ManyToOne(() => User, user => user.devices)
  user!: User;

  @OneToMany(() => Task, task => task.device, { cascade: true })
  tasks!: Task[];
}