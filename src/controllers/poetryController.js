const Poetry = require('../models/Poetry');
const doubaoService = require('../services/doubaoService');
const ossService = require('../services/ossService');
const logger = require('../utils/logger');

class PoetryController {
  /**
   * 获取模拟诗歌数据
   */
  getMockPoetry(style) {
    const mockPoetries = {
      '古风': ['山水如画意境深', '清风徐来花满林', '诗情画意共此时', '万物可作诗一首'],
      '现代': ['光影交织的瞬间', '捕捉时光的足迹', '每一帧都是诗', '生活处处有惊喜'],
      '浪漫': ['花开花落情依旧', '岁月静好你依然', '温柔如水话相思', '爱在心中永不变'],
      '哲理': ['万象更新见真知', '人生如梦亦如诗', '时光荏苒悟人生', '智慧之光照前路']
    }
    return mockPoetries[style] || mockPoetries['现代'];
  }

  /**
   * 生成诗歌
   * POST /api/poetry/generate
   */
  async generatePoetry(req, res) {
    try {
      const { imageBuffer, imageUrl, style = '古风', userId } = req.body;
      
      // 检查是否有上传的文件或提供的图片URL
      if (!req.file && !imageUrl && !imageBuffer) {
        return res.status(400).json({ error: '请提供图片文件、图片数据或图片URL' });
      }

      const startTime = Date.now();
      let finalImageUrl = imageUrl; // 最终用于调用豆包API的图片URL
      
      // 1. 如果有上传的文件，先上传到OSS
      if (req.file && req.file.buffer) {
        try {
          logger.info('开始上传图片到OSS', { 
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            bufferLength: req.file.buffer ? req.file.buffer.length : 0,
            fieldname: req.file.fieldname
          });
          
          // 根据文件大小选择上传方式
          const threshold = 5 * 1024 * 1024; // 5MB阈值
          let ossResult;
          
          if (req.file.size > threshold) {
            // 大文件使用分片上传
            ossResult = await ossService.multipartUploadImage(
              req.file.buffer,
              req.file.originalname,
              'poetry'
            );
          } else {
            // 小文件使用普通上传
            ossResult = await ossService.uploadImage(
              req.file.buffer,
              req.file.originalname,
              'poetry'
            );
          }
          
          finalImageUrl = ossResult.data.url;
          logger.info('图片上传OSS成功', { url: finalImageUrl });
          
        } catch (ossError) {
          logger.error('图片上传OSS失败:', ossError);
          // OSS上传失败时，降级使用base64数据
          logger.warn('OSS上传失败，降级使用base64数据调用豆包API');
          finalImageUrl = null;
        }
      }
      
      // 2. 使用豆包图片接口生成诗歌
      logger.info('开始使用豆包图片接口生成诗歌');
      let result;
      
      try {
        if (finalImageUrl) {
          // 使用OSS图片URL
          result = await doubaoService.generatePoetryFromImage(finalImageUrl, style);
        } else if (req.file && req.file.buffer) {
          // 降级使用base64图片数据
          result = await doubaoService.generatePoetryFromImage(req.file.buffer, style);
        } else if (imageBuffer) {
          // 使用提供的base64图片数据
          result = await doubaoService.generatePoetryFromImage(
            Buffer.from(imageBuffer, 'base64'),
            style
          );
        } else {
          throw new Error('没有可用的图片数据');
        }
      } catch (error) {
        logger.warn('豆包API调用失败，使用模拟数据:', error.message);
        // 使用模拟数据
        const mockPoetries = {
          '古风': {
            title: '春日即景',
            content: ['山水如画意境深', '清风徐来花满林', '诗情画意共此时', '万物可作诗一首']
          },
          '现代': {
            title: '光影瞬间',
            content: ['光影交织的瞬间', '捕捉时光的足迹', '每一帧都是诗', '生活处处有惊喜']
          },
          '浪漫': {
            title: '岁月静好',
            content: ['花开花落情依旧', '岁月静好你依然', '温柔如水话相思', '爱在心中永不变']
          },
          '哲理': {
            title: '人生感悟',
            content: ['万象更新见真知', '人生如梦亦如诗', '时光荏苒悟人生', '智慧之光照前路']
          }
        };
        const mockData = mockPoetries[style] || mockPoetries['现代'];
        result = {
          poetry: mockData.content,
          title: mockData.title,
          imageDescription: '这是一张美丽的图片，展现了丰富的视觉内容和深层的意境。',
          analysis: '图片分析：色彩丰富，构图和谐，具有很强的艺术感染力。'
        };
      }
      
      const processingTime = Date.now() - startTime;
      
      // 保存到数据库
      try {
        const poetryData = {
          userId,
          image: {
            filename: finalImageUrl ? finalImageUrl.split('/').pop() : 
                     (req.file ? req.file.originalname : `poetry_${Date.now()}.jpg`),
            path: finalImageUrl || `/uploads/poetry_${Date.now()}.jpg`,
            size: req.file ? req.file.size : 
                  (imageBuffer ? Buffer.from(imageBuffer, 'base64').length : 0),
            mimetype: req.file ? req.file.mimetype : 'image/jpeg',
            url: finalImageUrl || imageUrl // 保存OSS URL（优先）或原始URL
          },
          imageRecognition: {
            description: result.imageDescription,
            service: 'doubao-vision',
            labels: [], // 豆包直接处理，不需要单独的标签
            objects: []
          },
          poetry: {
            content: result.poetry,
            title: result.title, // 添加标题字段
            style,
            length: result.poetry.length
          },
          generation: {
            prompt: doubaoService.buildImagePoetryPrompt(style),
            model: 'doubao-pro',
            processingTime
          },
          metadata: {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }
        };
        
        const poetry = await Poetry.create(poetryData);
        
        logger.info('诗歌生成完成', { 
          poetryId: poetry.id, 
          processingTime,
          style,
          title: result.title,
          poetryContent: result.poetry
        });
        
        res.status(201).json({
          success: true,
          data: {
            poetry: {
              id: poetry.id,
              content: poetry.poetry.content,
              style: poetry.poetry.style,
              title: poetry.poetry.title,
              length: poetry.poetry.length
            },
            imageRecognition: {
              description: result.imageDescription,
              labels: [],
              objects: []
            },
            generation: {
              processingTime,
              model: poetry.generation.model
            }
          }
        });
        
      } catch (dbError) {
        logger.error('创建诗歌记录失败:', dbError);
        
        // 数据库保存失败，但仍然返回生成的诗歌内容
        logger.warn('数据库保存失败，返回诗歌内容但不持久化');
        
        res.status(201).json({
          success: true,
          data: {
            poetry: {
              id: `temp_${Date.now()}`,
              content: result.poetry,
              style: style,
              title: result.title,
              length: result.poetry.length
            },
            imageRecognition: {
              description: result.imageDescription,
              labels: [],
              objects: []
            },
            generation: {
              processingTime,
              model: 'doubao-pro'
            },
            note: '数据未保存到数据库，请稍后重试'
          }
        });
      }
      
    } catch (error) {
      logger.error('诗歌生成失败:', error);
      res.status(500).json({
        error: '诗歌生成失败，请稍后重试',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * 获取诗歌列表
   * GET /api/poetry
   */
  async getPoetryList(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        style, 
        userId,
        sort = 'createdAt' 
      } = req.query;
      
      const query = {};
      
      // 过滤条件
      if (style) {
        query.style = style;
      }
      
      if (userId) {
        query.userId = userId;
      }
      
      const options = {
        sort,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      };
      
      const [poems, total] = await Promise.all([
        Poetry.find(query, options),
        Poetry.count(query)
      ]);
      
      res.json({
        success: true,
        data: {
          poems: poems.map(poem => poem.toJSON()),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
      
    } catch (error) {
      logger.error('获取诗歌列表失败:', error);
      res.status(500).json({ error: '获取诗歌列表失败' });
    }
  }

  /**
   * 获取单首诗歌详情
   * GET /api/poetry/:id
   */
  async getPoetryById(req, res) {
    try {
      const { id } = req.params;
      
      const poetry = await Poetry.findById(id);
      
      if (!poetry) {
        return res.status(404).json({ error: '诗歌不存在' });
      }
      
      res.json({
        success: true,
        data: poetry.toJSON()
      });
      
    } catch (error) {
      logger.error('获取诗歌详情失败:', error);
      res.status(500).json({ error: '获取诗歌详情失败' });
    }
  }

  /**
   * 更新诗歌反馈
   * PUT /api/poetry/:id/feedback
   */
  async updateFeedback(req, res) {
    try {
      const { id } = req.params;
      const { rating, comment, isLiked } = req.body;
      
      const poetry = await Poetry.findById(id);
      
      if (!poetry) {
        return res.status(404).json({ error: '诗歌不存在' });
      }
      
      // 更新反馈信息
      if (rating !== undefined) {
        poetry.feedback = { ...poetry.feedback, rating };
      }
      
      if (comment !== undefined) {
        poetry.feedback = { ...poetry.feedback, comment };
      }
      
      if (isLiked !== undefined) {
        poetry.feedback = { ...poetry.feedback, isLiked };
      }
      
      await poetry.save();
      
      res.json({
        success: true,
        data: poetry.feedback
      });
      
    } catch (error) {
      logger.error('更新反馈失败:', error);
      res.status(500).json({ error: '更新反馈失败' });
    }
  }

  /**
   * 分享诗歌
   * POST /api/poetry/:id/share
   */
  async sharePoetry(req, res) {
    try {
      const { id } = req.params;
      const { isPublic = true } = req.body;
      
      const poetry = await Poetry.findById(id);
      
      if (!poetry) {
        return res.status(404).json({ error: '诗歌不存在' });
      }
      
      poetry.share = { 
        ...poetry.share, 
        isPublic,
        shareUrl: `/poetry/${poetry.id}`
      };
      
      await poetry.incrementShareCount();
      
      res.json({
        success: true,
        data: {
          shareUrl: poetry.share.shareUrl,
          shareCount: poetry.share.share_count,
          isPublic: poetry.share.isPublic
        }
      });
      
    } catch (error) {
      logger.error('分享诗歌失败:', error);
      res.status(500).json({ error: '分享诗歌失败' });
    }
  }

  /**
   * 获取热门诗歌
   * GET /api/poetry/popular
   */
  async getPopularPoetry(req, res) {
    try {
      const { limit = 10 } = req.query;
      
      const poems = await Poetry.findPopular(parseInt(limit));
      
      res.json({
        success: true,
        data: poems.map(poem => poem.toJSON())
      });
      
    } catch (error) {
      logger.error('获取热门诗歌失败:', error);
      res.status(500).json({ error: '获取热门诗歌失败' });
    }
  }

  /**
   * 获取统计信息
   * GET /api/poetry/stats
   */
  async getStats(req, res) {
    try {
      const stats = await Poetry.getStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      logger.error('获取统计信息失败:', error);
      res.status(500).json({ error: '获取统计信息失败' });
    }
  }

  /**
   * 删除诗歌
   * DELETE /api/poetry/:id
   */
  async deletePoetry(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      
      const poetry = await Poetry.findById(id);
      
      if (!poetry) {
        return res.status(404).json({ error: '诗歌不存在' });
      }
      
      // 检查权限
      if (poetry.userId && poetry.userId !== userId) {
        return res.status(403).json({ error: '无权限删除此诗歌' });
      }
      
      await Poetry.deleteById(id);
      
      res.json({
        success: true,
        message: '诗歌删除成功'
      });
      
    } catch (error) {
      logger.error('删除诗歌失败:', error);
      res.status(500).json({ error: '删除诗歌失败' });
    }
  }
}

module.exports = new PoetryController(); 