interface CustomLoggerOptions {
    type: "json" | "pretty" | "hidden";
    prettyLogTimeZone: "UTC" | "local";
    name: string;
}
export declare const loggerOptions: (name: string) => CustomLoggerOptions;
export {};
