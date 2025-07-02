import { Entity, Column, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from './task';
import { Device } from './device';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @OneToMany(() => Device, device => device.user, { cascade: true })
  devices!: Device[];
}