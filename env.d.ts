declare namespace NodeJS {
  export interface ProcessEnv {
    // Common
    MODE: '0' | '1'; // 0: http 1: https
    NODE_ENV: '0' | '1'; // 0: development 1: production
    PORT: string;

    // SSL (if https)
    SSL_KEY_PATH: string;
    SSL_CERT_PATH: string;

    // Database
    DB_MYSQL_TYPE: 'mysql';
    DB_MYSQL_HOST: string;
    DB_MYSQL_PORT: string;
    DB_MYSQL_USERNAME: string;
    DB_MYSQL_PASSWORD: string;
    DB_MYSQL_DATABASE: string;

    // OSS
    OSS_S3_REGION: string;
    OSS_S3_ACCESS_KEY: string;
    OSS_S3_SECRET_KEY: string;
    OSS_S3_BUCKET: string;
  }
}

export {};