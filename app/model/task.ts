export enum TaskStatus {
    SUCCESS = 0,
    PENDING = 1,
    PROGRESSING = 2,
    FAILED = 3,
    CANCELED = 4,
    TIMEOUT = 5,
}

export enum MaaReportTaskStatus {
    SUCCESS = "SUCCESS",
    FAILED = "FAILED",
}

export enum TaskType {
    CaptureImage = 0,
    CaptureImageNow = 1,
    HeartBeat = 2,
    StopTask = 3,
    LinkStart = 4,
    LinkStartBase = 5,
    LinkStartWakeUp = 6,
    LinkStartCombat = 7,
    LinkStartRecruiting = 8,
    LinkStartMall = 9,
    LinkStartMission = 10,
    LinkStartAutoRoguelike = 11,
    LinkStartReclamationAlgorithm = 12,
    ToolboxGachaOnce = 13,
    ToolboxGachaTenTimes = 14
}

export interface MaaTask {
    uuid: string;
    status: TaskStatus;
    type: TaskType;
    payload: any;
    taskbind: string | false;
    snapshotbind: string | false;
    start: Date;
    time: Date;
}

export interface MaaGetTaskReturnTask {
    id: string;
    status: TaskStatus;
    type: TaskType;
    payload: any;
    taskbind: string | false;
    snapshotbind: string | false;
    start: Date;
    time: Date;
}