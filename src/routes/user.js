const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * 用户服务健康检查
 * GET /api/users/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'user-service',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

/**
 * 获取匿名用户信息（简化版）
 * GET /api/users/profile
 */
router.get('/profile', (req, res) => {
  res.json({
    success: true,
    data: {
      id: 'anonymous',
      username: '匿名用户',
      avatar: null,
      createdAt: new Date().toISOString()
    }
  });
});

module.exports = router; 