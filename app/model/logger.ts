interface CustomLoggerOptions {
    type: "json" | "pretty" | "hidden";
    prettyLogTimeZone: "UTC" | "local";
    name: string;
}

export const loggerOptions = (name: string): CustomLoggerOptions => {
    return {
        type: "pretty",
        prettyLogTimeZone: "local",
        name: name,
    }
}