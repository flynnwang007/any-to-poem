const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDB } = require('./config/database');
const logger = require('./utils/logger');

// 路由导入
const imageRoutes = require('./routes/image');
const poetryRoutes = require('./routes/poetry');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3008;

// 安全中间件
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',  // 原来的端口
    'http://localhost:5173',  // uni-app H5开发端口
    'http://localhost:8080',  // 其他可能的开发端口
    'http://127.0.0.1:5173',
    'http://192.168.0.106:3008',  // 开发机器IP地址
    'http://192.168.0.106:5173',  // 前端开发服务器IP地址
    // 真机调试配置 - 允许所有来源
    '*',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));

// 限流中间件
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制每个IP 15分钟内最多100个请求
  message: '请求过于频繁，请稍后再试'
});
app.use('/api/', limiter);

// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static('uploads'));

// 路由 - 保持简洁配置
app.use('/api/images', imageRoutes);
app.use('/api/poetry', poetryRoutes);
app.use('/api/users', userRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: '万物可作诗 API'
  });
});

// 环境变量检查（仅开发环境）
app.get('/debug/env', (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    res.status(200).json({
      PORT: process.env.PORT,
      OSS_REGION: process.env.OSS_REGION,
      OSS_BUCKET_NAME: process.env.OSS_BUCKET_NAME,
      OSS_BASE_URL: process.env.OSS_BASE_URL,
      OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID ? '已设置' : '未设置',
      OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET ? '已设置' : '未设置',
      DOUBAO_API_KEY: process.env.DOUBAO_API_KEY ? '已设置' : '未设置',
      MEMFIREDB_URL: process.env.MEMFIREDB_URL ? '已设置' : '未设置',
      MEMFIREDB_ANON_KEY: process.env.MEMFIREDB_ANON_KEY ? '已设置' : '未设置',
      NODE_ENV: process.env.NODE_ENV
    });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: '接口不存在',
    path: req.originalUrl 
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('应用错误:', err);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 启动服务器
async function startServer() {
  try {
    // 连接数据库
    await connectDB();
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 万物可作诗 API 服务启动成功`);
      logger.info(`📍 服务地址: http://localhost:${PORT}`);
      logger.info(`🌐 网络地址: http://192.168.0.106:${PORT}`);
      logger.info(`🔍 健康检查: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app; 