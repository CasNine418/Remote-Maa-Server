export declare const envConfig: {
    readonly server: {
        readonly mode: "https" | "http";
        readonly nodeEnv: "production" | "development";
        readonly port: number;
    };
    readonly ssl: {
        readonly keyPath: string;
        readonly certPath: string;
    };
    readonly database: {
        readonly type: string;
        readonly host: string;
        readonly port: number;
        readonly username: string;
        readonly password: string;
        readonly database: string;
    };
    readonly s3: {
        readonly region: string;
        readonly endpoint: string;
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
        readonly bucket: string;
    };
};
export type EnvConfig = typeof envConfig;
