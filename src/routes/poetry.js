const express = require('express');
const multer = require('multer');
const router = express.Router();
const poetryController = require('../controllers/poetryController');
const { validatePoetryGeneration, validateFeedback } = require('../middleware/validation');

// 配置文件上传
const upload = multer({
  storage: multer.memoryStorage(), // 存储在内存中
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持上传图片文件'), false);
    }
  }
});

// 生成诗歌 - 添加文件上传中间件
router.post('/generate', upload.single('image'), validatePoetryGeneration, poetryController.generatePoetry);

// 获取诗歌列表
router.get('/', poetryController.getPoetryList);

// 获取热门诗歌
router.get('/popular', poetryController.getPopularPoetry);

// 获取统计信息
router.get('/stats', poetryController.getStats);

// 获取单首诗歌详情
router.get('/:id', poetryController.getPoetryById);

// 更新诗歌反馈
router.put('/:id/feedback', validateFeedback, poetryController.updateFeedback);

// 分享诗歌
router.post('/:id/share', poetryController.sharePoetry);

// 删除诗歌
router.delete('/:id', poetryController.deletePoetry);

module.exports = router; 