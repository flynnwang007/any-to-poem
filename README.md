# 万物可作诗 - 后端API服务

## 项目简介
这是"万物可作诗"应用的后端API服务，基于 Node.js + Express 构建，集成了豆包大模型的图片处理能力和阿里云OSS存储服务。

## 核心功能
- 📸 图片上传与处理（支持阿里云OSS）
- 🎨 基于豆包大模型的图片诗歌生成
- 💾 诗歌数据存储与管理
- 👤 用户数据管理
- 📊 数据统计与分析

## 技术架构

### 主要技术栈
- **运行时**: Node.js (>=16.0.0)
- **框架**: Express.js
- **数据库**: MemfireDB (基于 Supabase)
- **AI服务**: 豆包大模型 API
- **文件存储**: 阿里云OSS
- **缓存**: Redis (可选)
- **文件处理**: Sharp, Multer

### API接口
- `POST /api/poetry/generate` - 生成诗歌（支持图片URL）
- `POST /api/images/upload` - 上传图片到OSS
- `POST /api/images/upload-url` - 从URL上传图片到OSS
- `GET /api/poetry` - 获取诗歌列表
- `GET /api/poetry/:id` - 获取诗歌详情
- `PUT /api/poetry/:id/feedback` - 更新反馈
- `POST /api/poetry/:id/share` - 分享诗歌
- `DELETE /api/poetry/:id` - 删除诗歌

## 环境配置

### 必需的环境变量
复制 `env.example` 为 `.env` 并配置以下变量：

```bash
# 豆包API配置 (必需)
DOUBAO_API_KEY=your_doubao_api_key_here

# 数据库配置 (必需)
MEMFIREDB_URL=your_memfiredb_url_here
MEMFIREDB_ANON_KEY=your_memfiredb_anon_key_here

# 阿里云OSS配置 (必需)
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=your_oss_access_key_id_here
OSS_ACCESS_KEY_SECRET=your_oss_access_key_secret_here
OSS_BUCKET_NAME=your_bucket_name_here
OSS_BASE_URL=https://your-bucket-name.oss-cn-hangzhou.aliyuncs.com

# 服务器配置
PORT=3008
NODE_ENV=development

# 前端URL (CORS配置)
FRONTEND_URL=http://localhost:3000
```

### 获取豆包API密钥
1. 访问 [豆包官网](https://www.doubao.com/)
2. 注册并登录账号
3. 进入API管理页面
4. 创建API密钥
5. 将密钥配置到 `DOUBAO_API_KEY` 环境变量

### 配置阿里云OSS
1. 登录 [阿里云控制台](https://oss.console.aliyun.com/)
2. 创建OSS Bucket
3. 获取AccessKey ID和AccessKey Secret
4. 配置Bucket权限为公共读
5. 将配置信息填入环境变量

## 安装与运行

### 安装依赖
```bash
npm install
```

### 开发模式运行
```bash
npm run dev
```

### 生产模式运行
```bash
npm start
```

### 运行测试
```bash
npm test
```

## 项目结构
```
backend/
├── src/
│   ├── app.js                 # 应用入口文件
│   ├── config/
│   │   └── database.js        # 数据库配置
│   ├── controllers/
│   │   └── poetryController.js # 诗歌控制器
│   ├── middleware/
│   │   └── validation.js      # 数据验证中间件
│   ├── models/
│   │   └── Poetry.js          # 诗歌数据模型
│   ├── routes/
│   │   ├── image.js           # 图片相关路由（OSS集成）
│   │   ├── poetry.js          # 诗歌相关路由
│   │   └── user.js            # 用户相关路由
│   ├── services/
│   │   ├── doubaoService.js   # 豆包API服务
│   │   ├── ossService.js      # 阿里云OSS服务
│   │   └── imageRecognitionService.js # 图像识别服务(备用)
│   └── utils/
│       └── logger.js          # 日志工具
├── package.json
└── README.md
```

## API使用示例

### 上传图片到OSS
```bash
# 方式1：直接上传文件
curl -X POST http://localhost:3008/api/images/upload \
  -F "image=@/path/to/your/image.jpg"

# 方式2：从URL上传
curl -X POST http://localhost:3008/api/images/upload-url \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/image.jpg",
    "folder": "poetry"
  }'
```

### 生成诗歌（使用OSS图片URL）
```bash
curl -X POST http://localhost:3008/api/poetry/generate \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/poetry/image.jpg",
    "style": "古风",
    "userId": "user123"
  }'
```

### 响应格式
```json
{
  "success": true,
  "data": {
    "poetry": {
      "id": "poetry_id",
      "content": "生成的诗歌内容",
      "style": "古风",
      "length": 100
    },
    "imageRecognition": {
      "description": "图片描述",
      "labels": [],
      "objects": []
    },
    "generation": {
      "processingTime": 2500,
      "model": "doubao-pro"
    }
  }
}
```

## 开发说明

### OSS集成优势
- **安全性**：AccessKey不暴露给前端
- **统一管理**：后端统一处理文件命名和路径
- **权限控制**：可以添加用户权限验证
- **错误处理**：统一处理上传失败情况
- **日志记录**：记录所有上传操作

### 豆包图片接口优势
- 直接处理图片，无需额外的图像识别服务
- 减少API调用次数，提高响应速度
- 降低系统复杂度和维护成本
- 更好的图片内容理解能力

### 错误处理
- 所有API都包含完整的错误处理
- 开发环境下会返回详细错误信息
- 生产环境下只返回用户友好的错误消息

### 日志记录
- 使用 Winston 进行结构化日志记录
- 记录所有API调用和错误信息
- 支持不同环境的日志级别配置

## 部署说明

### Docker部署
```bash
# 构建镜像
docker build -t poetry-app-backend .

# 运行容器
docker run -p 3008:3008 --env-file .env poetry-app-backend
```

### 环境要求
- Node.js >= 16.0.0
- 豆包API密钥
- MemfireDB 数据库
- 阿里云OSS存储
- Redis (可选，用于缓存)

## 许可证
MIT License 