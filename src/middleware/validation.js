const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * 验证诗歌生成请求
 */
const validatePoetryGeneration = (req, res, next) => {
  // 检查是否有上传的文件
  const hasFile = req.file && req.file.buffer;
  const hasImageUrl = req.body.imageUrl;
  const hasImageBuffer = req.body.imageBuffer;
  
  if (!hasFile && !hasImageUrl && !hasImageBuffer) {
    logger.warn('诗歌生成请求验证失败: 请提供图片文件、图片数据或图片URL');
    return res.status(400).json({
      error: '请求参数错误',
      details: '请提供图片文件、图片数据或图片URL'
    });
  }
  
  // 移除自动转base64的逻辑，让控制器处理文件上传到OSS
  
  const schema = Joi.object({
    imageBuffer: Joi.string().optional().messages({
      'string.empty': '图片数据不能为空'
    }),
    imageUrl: Joi.string().uri().optional().messages({
      'string.uri': '请提供有效的图片URL'
    }),
    style: Joi.string().valid('古风', '现代', '浪漫', '哲理').default('古风').messages({
      'any.only': '诗歌风格必须是：古风、现代、浪漫、哲理'
    }),
    userId: Joi.string().optional()
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    logger.warn('诗歌生成请求验证失败:', error.details[0].message);
    return res.status(400).json({
      error: '请求参数错误',
      details: error.details[0].message
    });
  }
  
  next();
};

/**
 * 验证反馈更新请求
 */
const validateFeedback = (req, res, next) => {
  const schema = Joi.object({
    rating: Joi.number().min(1).max(5).optional().messages({
      'number.min': '评分必须在1-5之间',
      'number.max': '评分必须在1-5之间'
    }),
    comment: Joi.string().max(500).optional().messages({
      'string.max': '评论不能超过500字'
    }),
    isLiked: Joi.boolean().optional()
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    logger.warn('反馈更新请求验证失败:', error.details[0].message);
    return res.status(400).json({
      error: '请求参数错误',
      details: error.details[0].message
    });
  }
  
  next();
};

/**
 * 验证图片URL上传请求
 */
const validateImageUrlUpload = (req, res, next) => {
  const schema = Joi.object({
    imageUrl: Joi.string().uri().required().messages({
      'string.uri': '请提供有效的图片URL',
      'any.required': '请提供图片URL'
    }),
    folder: Joi.string().default('poetry').messages({
      'string.empty': '文件夹名称不能为空'
    })
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    logger.warn('图片URL上传请求验证失败:', error.details[0].message);
    return res.status(400).json({
      error: '请求参数错误',
      details: error.details[0].message
    });
  }
  
  next();
};

module.exports = {
  validatePoetryGeneration,
  validateFeedback,
  validateImageUrlUpload
}; 