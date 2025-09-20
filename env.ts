import * as dotenv from 'dotenv';
import { Logger } from 'tslog';
const Log = new Logger({ name: 'env_config' });

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'MODE',
    'NODE_ENV',
    'PORT',
    'SSL_KEY_PATH',
    'SSL_CERT_PATH',
    'DB_MYSQL_TYPE',
    'DB_MYSQL_HOST',
    'DB_MYSQL_PORT',
    'DB_MYSQL_USERNAME',
    'DB_MYSQL_PASSWORD',
    'DB_MYSQL_DATABASE',
    'OSS_S3_REGION',
    'OSS_S3_ENDPOINT',
    'OSS_S3_ACCESS_KEY',
    'OSS_S3_SECRET_KEY',
    'OSS_S3_BUCKET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    Log.warn(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const criticalEnvVars = [
    'DB_MYSQL_HOST',
    'DB_MYSQL_USERNAME',
    'DB_MYSQL_PASSWORD',
    'DB_MYSQL_DATABASE',
    'OSS_S3_REGION',
    'OSS_S3_ENDPOINT',
    'OSS_S3_ACCESS_KEY',
    'OSS_S3_SECRET_KEY',
    'OSS_S3_BUCKET'
];

const missingCriticalEnvVars = criticalEnvVars.filter(envVar => !process.env[envVar]);

if (missingCriticalEnvVars.length > 0) {
    Log.error(`Missing critical environment variables: ${missingCriticalEnvVars.join(', ')}`);
    Log.error('Application cannot start without these critical variables');
    process.exit(1);
}

// Environment configuration with type safety
export const envConfig = {
    // Server configuration
    server: {
        mode: process.env.SERVER_MODE === '1' ? 'https' : 'http',
        nodeEnv: process.env.SERVER_NODE_ENV === '1' ? 'production' : 'development',
        port: parseInt(process.env.SERVER_PORT || '3000', 10),
    },

    // SSL configuration
    ssl: {
        keyPath: process.env.SSL_KEY_PATH || '',
        certPath: process.env.SSL_CERT_PATH || '',
    },

    // Database configuration
    database: {
        type: process.env.DB_TYPE || 'mysql',
        host: process.env.DB_HOST || '',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        username: process.env.DB_USERNAME || '',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || '',
    },

    // OSS/S3 configuration
    s3: {
        region: process.env.OSS_S3_REGION || '',
        endpoint: process.env.OSS_S3_ENDPOINT || '',
        accessKeyId: process.env.OSS_S3_ACCESS_KEY || '',
        secretAccessKey: process.env.OSS_S3_SECRET_KEY || '',
        bucket: process.env.OSS_S3_BUCKET || '',
    }
} as const;

// Type for our configuration
export type EnvConfig = typeof envConfig;

Log.info('Environment configuration loaded successfully');