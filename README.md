# ReMote MAA Backend Service

[English](https://github.com/CasNine418/Remote-Maa-Server/blob/master/README.md) | [中文](https://github.com/CasNine418/Remote-Maa-Server/blob/master/README_zh_CN.md)

MAA (MAA Assistant Arknights) remotely controls backend services, offering functionalities such as task management, real-time communication, and file storage.

## Tech Stack

- Node.js + TypeScript
- Express.js
- Socket.IO
- TypeORM
- AWS SDK
- MySQL/MariaDB (via TypeORM)

## Quick Start

### Environment Requirements

- Node.js >= 16 (AWS SDK no longer supports Node 16 LTS; if possible, use Node ^18)
- npm or pnpm
- Database (MySQL/MariaDB/PostgreSQL or other databases supported by TypeORM)

### Installation

```bash
git clone https://github.com/CasNine418/Remote-Maa-Server.git
cd <project-directory>
npm install
```

### Configuration

1. Copy `.env.example` to `.env`
2. Modify configuration items as needed

For specific declarations, refer to the env.ts file.

```env
# Common
MODE=1
NODE_ENV=development
PORT=3000

# CERT (HTTPS mode only)
SSL_KEY_PATH=/path/to/your/ssl/private.key
SSL_CERT_PATH=/path/to/your/ssl/certificate.crt

# Database
DB_MYSQL_TYPE=mysql
DB_MYSQL_HOST=localhost
DB_MYSQL_PORT=3306
DB_MYSQL_USERNAME=your_username
DB_MYSQL_PASSWORD=your_password
DB_MYSQL_DATABASE=your_database

# OSS (Object Storage Service)
OSS_S3_REGION=your_region
OSS_S3_ENDPOINT=https://your-s3-endpoint.com
OSS_S3_ACCESS_KEY=your_access_key
OSS_S3_SECRET_KEY=your_secret_key
OSS_S3_BUCKET=your_bucket_name
```

### Starting the Service

```bash
npm run start
```

The service will listen on the port specified in the configuration file.

## API Documentation

- `POST /getTask` - Retrieve pending tasks
- `POST /reportStatus` - Report task execution status

### WebSocket

Real-time communication can be achieved through WebSocket connections, supporting functionalities such as task pushing and status updates.

## Project Structure

```
.
├── app.ts              # Main application file
├── orm/                # Database entities and configurations
├── utils/              # Utility functions
├── env.ts              # Environment configuration handling
└── ...
```

## Development

## Configuration Descriptions

Environment variable configuration items:

- `PORT` - Service port
- `MODE` - Operation mode (http/https)
- `DATABASE_MYSQL_*` - Database configurations
- `OSS_S3_*` - AWS S3 configurations
- `SSL_*` - SSL certificate paths (HTTPS mode only)

## Contributions

Issues and Pull Requests are welcome.

## License

[MIT License](LICENSE)