import { io, Socket } from 'socket.io-client';

interface ClientToServerEvents {
    authUser: (user: string, device: string, callback: (res: number) => void) => void;
    hello: (data: any) => void;

    userGetTask: (callback: (tasks: Object) => void) => void;
    
}

const socket = io('ws://localhost:3001') as Socket<ClientToServerEvents>;

socket.on('connect', () => {
    socket.emit('authUser', 'casnine', 'cf5e8677aa674b6c9b0f7f863cdc77eb', (res) => {
        if (res) {
            console.log(res);

            socket.emit('hello', {
                test: 'test'
            });
        }
    });
});