const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const ossService = require('../services/ossService');
const { validateImageUrlUpload } = require('../middleware/validation');

// 确保上传目录存在（用于临时存储）
const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

// 配置 multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB（支持大文件）
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

/**
 * 上传图片到OSS
 * POST /api/images/upload
 */
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    const { buffer, originalname, mimetype, size } = req.file;
    
    // 根据文件大小选择上传方式
    const threshold = 5 * 1024 * 1024; // 5MB阈值
    
    let result;
    if (size > threshold) {
      // 大文件使用分片上传
      logger.info('检测到大文件，使用分片上传', { 
        originalName: originalname, 
        size: size 
      });
      
      result = await ossService.multipartUploadImage(
        buffer, 
        originalname, 
        'poetry',
        (progress) => {
          // 这里可以通过WebSocket发送进度信息给前端
          logger.debug('上传进度:', progress);
        }
      );
    } else {
      // 小文件使用普通上传
      result = await ossService.uploadImage(buffer, originalname);
    }
    
    res.json(result);

  } catch (error) {
    logger.error('图片上传失败:', error);
    res.status(500).json({ 
      error: '图片上传失败，请稍后重试',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 分片上传图片到OSS（专门的大文件上传接口）
 * POST /api/images/upload-multipart
 */
router.post('/upload-multipart', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    const { buffer, originalname, mimetype, size } = req.file;
    
    // 强制使用分片上传
    const result = await ossService.multipartUploadImage(
      buffer, 
      originalname, 
      'poetry',
      (progress) => {
        // 进度回调
        logger.debug('分片上传进度:', progress);
      }
    );
    
    res.json(result);

  } catch (error) {
    logger.error('分片上传失败:', error);
    res.status(500).json({ 
      error: '图片上传失败，请稍后重试',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 从URL上传图片到OSS
 * POST /api/images/upload-url
 */
router.post('/upload-url', validateImageUrlUpload, async (req, res) => {
  try {
    const { imageUrl, folder = 'poetry' } = req.body;
    
    // 上传到OSS
    const result = await ossService.uploadImageFromUrl(imageUrl, folder);
    
    res.json(result);

  } catch (error) {
    logger.error('从URL上传图片失败:', error);
    res.status(500).json({ 
      error: '图片上传失败，请稍后重试',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 删除OSS中的图片
 * DELETE /api/images/:filename
 */
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({ error: '请提供文件名' });
    }

    const success = await ossService.deleteImage(filename);
    
    if (success) {
      res.json({
        success: true,
        message: '图片删除成功'
      });
    } else {
      res.status(500).json({ error: '图片删除失败' });
    }

  } catch (error) {
    logger.error('删除图片失败:', error);
    res.status(500).json({ error: '删除图片失败' });
  }
});

/**
 * 获取图片信息
 * GET /api/images/:filename
 */
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({ error: '请提供文件名' });
    }

    const imageUrl = ossService.getImageUrl(filename);
    
    res.json({
      success: true,
      data: {
        filename,
        url: imageUrl
      }
    });

  } catch (error) {
    logger.error('获取图片信息失败:', error);
    res.status(500).json({ error: '获取图片信息失败' });
  }
});

/**
 * 获取图片详细信息（包括元数据）
 * GET /api/images/:filename/info
 */
router.get('/:filename/info', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({ error: '请提供文件名' });
    }

    const result = await ossService.getImageInfo(filename);
    res.json(result);

  } catch (error) {
    logger.error('获取图片详细信息失败:', error);
    res.status(500).json({ error: '获取图片详细信息失败' });
  }
});

/**
 * 获取带签名的临时访问URL
 * GET /api/images/:filename/signed
 */
router.get('/:filename/signed', async (req, res) => {
  try {
    const { filename } = req.params;
    const { expires = 3600 } = req.query; // 默认1小时
    
    if (!filename) {
      return res.status(400).json({ error: '请提供文件名' });
    }

    const signedUrl = ossService.getSignedUrl(filename, parseInt(expires));
    
    res.json({
      success: true,
      data: {
        filename,
        signedUrl,
        expires: parseInt(expires)
      }
    });

  } catch (error) {
    logger.error('生成签名URL失败:', error);
    res.status(500).json({ error: '生成签名URL失败' });
  }
});

/**
 * 检查OSS连接状态
 * GET /api/images/health/oss
 */
router.get('/health/oss', async (req, res) => {
  try {
    const isConnected = await ossService.checkConnection();
    
    res.json({
      success: true,
      data: {
        connected: isConnected,
        service: 'aliyun-oss',
        bucket: process.env.OSS_BUCKET_NAME,
        region: process.env.OSS_REGION
      }
    });

  } catch (error) {
    logger.error('OSS健康检查失败:', error);
    res.status(500).json({ 
      error: 'OSS连接检查失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 保留原有的本地文件处理路由（作为备用）
/**
 * 上传图片到本地（备用方案）
 * POST /api/images/upload-local
 */
router.post('/upload-local', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    const { buffer, originalname, mimetype } = req.file;
    
    // 生成唯一文件名
    const timestamp = Date.now();
    const ext = path.extname(originalname);
    const filename = `poetry_${timestamp}${ext}`;
    const filepath = path.join(uploadDir, filename);

    // 处理图片（压缩、调整大小）
    const processedBuffer = await sharp(buffer)
      .resize(800, 800, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // 保存文件
    await fs.writeFile(filepath, processedBuffer);

    // 获取文件信息
    const stats = await fs.stat(filepath);

    res.json({
      success: true,
      data: {
        filename,
        originalName: originalname,
        size: stats.size,
        mimetype: 'image/jpeg',
        url: `/uploads/${filename}`
      }
    });

  } catch (error) {
    logger.error('本地图片上传失败:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

module.exports = router; 