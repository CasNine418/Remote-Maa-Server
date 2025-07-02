import { Response } from "express";

class SendClientMessage {
    constructor() {}

    public sendOKMessage<T, M>(res: Response, message: string, data: T, meta?: M) {
        const responseMeta = {
            time: new Date(),
            ...(meta || {})
        };

        res.status(200).json({
            message,
            data,
            meta: responseMeta
        });
    }

    public sendErrorMessage<T>(res: Response, status: number, message: string, data: T) {
        res.status(status).json({
            message,
            data,
            meta: {
                time: new Date()
            }
        });
    }
}
const sendClientMessage = new SendClientMessage();

export { sendClientMessage, SendClientMessage };