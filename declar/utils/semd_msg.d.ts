import { Response } from "express";
declare class SendClientMessage {
    constructor();
    sendOKMessage<T, M>(res: Response, message: string, data: T, meta?: M): void;
    sendErrorMessage<T>(res: Response, status: number, message: string, data: T): void;
}
declare const sendClientMessage: SendClientMessage;
export { sendClientMessage, SendClientMessage };
