# ReMote MAA Backend Service

MAA (明日方舟助手) 远程控制后端服务，提供任务管理、实时通信和文件存储功能。

## 技术栈

- Node.js + TypeScript
- Express.js
- Socket.IO
- TypeORM
- AWS SDK
- MySQL/MariaDB (通过TypeORM)

## 快速开始

### 环境要求

- Node.js >= 16 （AWS SDK 现在已经不支持Node16LTS，若可以请使用Node^18）
- npm 或 pnpm
- 数据库 (MySQL/MariaDB/PostgreSQL等TypeORM支持的数据库)

### 安装

```bash
git clone https://github.com/CasNine418/Remote-Maa-Server.git
cd <project-directory>
npm install
```

### 配置

1. 复制 `.env.example` 到 `.env`
2. 根据需要修改配置项

具体声明可以查看env.ts文件

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

### 启动

```bash
npm run start
```

服务将监听配置文件中指定的端口。

## API文档

### REST API

- `POST /getTask` - 获取待执行任务
- `POST /reportStatus` - 汇报任务执行状态

### WebSocket

通过WebSocket连接可以实现实时通信，支持任务推送、状态更新等功能。

## 项目结构

```
.
├── app.ts              # 主应用文件
├── orm/                # 数据库实体和配置
├── utils/              # 工具函数
├── env.ts              # 环境配置处理
└── ...
```

## 开发

## 配置说明

环境变量配置项:

- `PORT` - 服务端口
- `MODE` - 运行模式 (http/https)
- `DATABASE_MYSQL_*` - 数据库配置
- `OSS_S3_*` - AWS S3配置
- `SSL_*` - SSL证书路径 (HTTPS模式下)

## 贡献

欢迎提交Issue和Pull Request。

## 许可证

[MIT License](LICENSE)