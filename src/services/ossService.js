const OSS = require('ali-oss');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const path = require('path');

class OSSService {
  constructor() {
    // 检查环境变量
    const requiredEnvVars = [
      'OSS_REGION',
      'OSS_ACCESS_KEY_ID', 
      'OSS_ACCESS_KEY_SECRET',
      'OSS_BUCKET_NAME',
      'OSS_BASE_URL'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      logger.warn(`OSS配置不完整，缺少: ${missingVars.join(', ')}`);
    }
    
    this.client = new OSS({
      region: process.env.OSS_REGION,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      bucket: process.env.OSS_BUCKET_NAME,
      secure: true, // 使用HTTPS
      timeout: 60000, // 60秒超时
      retryMax: 3, // 最大重试次数
      retryDelay: 1000 // 重试延迟
    });
    
    this.bucketName = process.env.OSS_BUCKET_NAME;
    this.baseUrl = process.env.OSS_BASE_URL;
    
    if (!this.bucketName || !this.baseUrl) {
      logger.warn('OSS配置不完整，请检查环境变量');
    }
  }

  /**
   * 简单文件上传（不处理图片）
   * @param {Buffer} fileBuffer - 文件二进制数据
   * @param {string} filename - 文件名
   * @param {string} folder - 存储文件夹
   * @param {string} contentType - 内容类型
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFile(fileBuffer, filename, folder = 'files', contentType = 'application/octet-stream') {
    try {
      // 生成完整文件名
      const fullFilename = `${folder}/${Date.now()}_${filename}`;
      
      // 设置上传头信息
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // 缓存1年
        'x-oss-storage-class': 'Standard', // 标准存储
        'x-oss-forbid-overwrite': 'false' // 允许覆盖同名文件
      };

      // 设置元数据
      const meta = {
        originalName: filename,
        processedBy: 'poetry-app',
        uploadTime: new Date().toISOString(),
        uploadMethod: 'simple'
      };
      
      // 上传到OSS
      const result = await this.client.put(fullFilename, fileBuffer, {
        headers,
        meta
      });

      const fileUrl = `${this.baseUrl}/${fullFilename}`;
      
      logger.info('文件上传OSS成功', {
        filename: fullFilename,
        size: fileBuffer.length,
        url: fileUrl,
        etag: result.etag
      });

      return {
        success: true,
        data: {
          filename: fullFilename,
          originalName: filename,
          size: fileBuffer.length,
          mimetype: contentType,
          url: fileUrl,
          ossUrl: result.url,
          etag: result.etag
        }
      };

    } catch (error) {
      logger.error('文件上传OSS失败:', error);
      throw new Error('文件上传失败，请稍后重试');
    }
  }

  /**
   * 上传图片到OSS（普通上传）
   * @param {Buffer} imageBuffer - 图片二进制数据
   * @param {string} originalName - 原始文件名
   * @param {string} folder - 存储文件夹，默认为 'poetry'
   * @returns {Promise<Object>} 上传结果
   */
  async uploadImage(imageBuffer, originalName, folder = 'poetry') {
    try {
      let processedBuffer;
      
      // 尝试处理图片，如果失败则使用原图
      try {
        processedBuffer = await sharp(imageBuffer)
          .resize(800, 800, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch (sharpError) {
        logger.warn('图片处理失败，使用原图:', sharpError.message);
        processedBuffer = imageBuffer;
      }

      // 生成唯一文件名
      const ext = '.jpg';
      const filename = `${folder}/${Date.now()}_${uuidv4()}${ext}`;
      
      // 设置上传头信息
      const headers = {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // 缓存1年
        'x-oss-storage-class': 'Standard', // 标准存储
        'x-oss-forbid-overwrite': 'false' // 允许覆盖同名文件
      };

      // 设置元数据
      const meta = {
        originalName: originalName,
        processedBy: 'poetry-app',
        uploadTime: new Date().toISOString()
      };
      
      // 上传到OSS
      const result = await this.client.put(filename, processedBuffer, {
        headers,
        meta
      });

      const imageUrl = `${this.baseUrl}/${filename}`;
      
      logger.info('图片上传OSS成功', {
        filename,
        size: processedBuffer.length,
        url: imageUrl,
        etag: result.etag
      });

      return {
        success: true,
        data: {
          filename,
          originalName,
          size: processedBuffer.length,
          mimetype: 'image/jpeg',
          url: imageUrl,
          ossUrl: result.url,
          etag: result.etag
        }
      };

    } catch (error) {
      logger.error('图片上传OSS失败:', {
        error: error.message,
        code: error.code,
        status: error.status,
        requestId: error.requestId,
        hostId: error.hostId,
        stack: error.stack
      });
      
      // 如果是签名错误，尝试多种解决方案
      if (error.code === 'SignatureDoesNotMatch') {
        logger.warn('检测到签名错误，尝试多种解决方案');
        
        // 方案1: 尝试使用最简化的配置重新上传
        try {
          const simpleResult = await this.client.put(filename, processedBuffer);
          const imageUrl = `${this.baseUrl}/${filename}`;
          logger.info('使用简化配置上传成功', { filename, url: imageUrl });
          
          return {
            success: true,
            data: {
              filename,
              originalName,
              size: processedBuffer.length,
              mimetype: 'image/jpeg',
              url: imageUrl,
              ossUrl: simpleResult.url,
              etag: simpleResult.etag
            }
          };
        } catch (retryError) {
          logger.warn('简化配置上传失败:', retryError.message);
        }
        
        // 方案2: 尝试重新初始化客户端
        try {
          logger.info('尝试重新初始化OSS客户端');
          this.client = new OSS({
            region: process.env.OSS_REGION,
            accessKeyId: process.env.OSS_ACCESS_KEY_ID,
            accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
            bucket: process.env.OSS_BUCKET_NAME,
            secure: true,
            timeout: 60000
          });
          
          const retryResult = await this.client.put(filename, processedBuffer);
          const imageUrl = `${this.baseUrl}/${filename}`;
          logger.info('重新初始化客户端后上传成功', { filename, url: imageUrl });
          
          return {
            success: true,
            data: {
              filename,
              originalName,
              size: processedBuffer.length,
              mimetype: 'image/jpeg',
              url: imageUrl,
              ossUrl: retryResult.url,
              etag: retryResult.etag
            }
          };
        } catch (reinitError) {
          logger.error('重新初始化客户端后上传也失败:', reinitError.message);
        }
      }
      
      // 如果是其他错误，记录详细信息
      if (error.code === 'NoSuchBucket') {
        throw new Error('OSS存储桶不存在，请检查配置');
      } else if (error.code === 'AccessDenied') {
        throw new Error('OSS访问被拒绝，请检查权限配置');
      } else if (error.code === 'InvalidAccessKeyId') {
        throw new Error('OSS访问密钥无效，请检查配置');
      }
      
      throw new Error('图片上传失败，请稍后重试');
    }
  }

  /**
   * 分片上传图片到OSS（适用于大文件）
   * @param {Buffer} imageBuffer - 图片二进制数据
   * @param {string} originalName - 原始文件名
   * @param {string} folder - 存储文件夹，默认为 'poetry'
   * @param {Function} progressCallback - 进度回调函数
   * @returns {Promise<Object>} 上传结果
   */
  async multipartUploadImage(imageBuffer, originalName, folder = 'poetry', progressCallback = null) {
    try {
      // 处理图片（压缩、调整大小）
      const processedBuffer = await sharp(imageBuffer)
        .resize(800, 800, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // 生成唯一文件名
      const ext = '.jpg';
      const filename = `${folder}/${Date.now()}_${uuidv4()}${ext}`;
      
      // 创建临时文件用于分片上传
      const fs = require('fs').promises;
      const os = require('os');
      const tempPath = require('path').join(os.tmpdir(), `temp_${uuidv4()}.jpg`);
      
      await fs.writeFile(tempPath, processedBuffer);

      // 设置上传头信息
      const headers = {
        'x-oss-storage-class': 'Standard',
        'x-oss-forbid-overwrite': 'false'
      };

      // 设置元数据
      const meta = {
        originalName: originalName,
        processedBy: 'poetry-app',
        uploadTime: new Date().toISOString(),
        uploadMethod: 'multipart'
      };

      // 进度回调函数
      const progress = (p, checkpoint) => {
        if (progressCallback) {
          progressCallback({
            percentage: Math.round(p * 100),
            checkpoint: checkpoint
          });
        }
        logger.debug('上传进度:', { percentage: Math.round(p * 100) });
      };

      // 开始分片上传
      const result = await this.client.multipartUpload(filename, tempPath, {
        progress,
        headers,
        meta,
        parallel: 4, // 并发分片数
        partSize: 1024 * 1024 // 分片大小：1MB
      });

      // 清理临时文件
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        logger.warn('清理临时文件失败:', cleanupError.message);
      }

      const imageUrl = `${this.baseUrl}/${filename}`;
      
      logger.info('图片分片上传OSS成功', {
        filename,
        size: processedBuffer.length,
        url: imageUrl,
        etag: result.etag,
        parts: result.parts?.length || 1
      });

      return {
        success: true,
        data: {
          filename,
          originalName,
          size: processedBuffer.length,
          mimetype: 'image/jpeg',
          url: imageUrl,
          ossUrl: result.url,
          etag: result.etag,
          uploadMethod: 'multipart'
        }
      };

    } catch (error) {
      logger.error('图片分片上传OSS失败:', error);
      
      // 处理特定错误
      if (error.code === 'ConnectionTimeoutError') {
        throw new Error('上传超时，请检查网络连接');
      } else if (error.code === 'RequestTimeoutError') {
        throw new Error('请求超时，请稍后重试');
      } else if (error.code === 'NoSuchBucket') {
        throw new Error('OSS存储桶不存在，请检查配置');
      }
      
      throw new Error('图片上传失败，请稍后重试');
    }
  }

  /**
   * 直接上传图片到OSS（不处理图片）
   * @param {Buffer} imageBuffer - 图片二进制数据
   * @param {string} originalName - 原始文件名
   * @param {string} folder - 存储文件夹，默认为 'poetry'
   * @returns {Promise<Object>} 上传结果
   */
  async uploadImageDirect(imageBuffer, originalName, folder = 'poetry') {
    try {
      // 生成唯一文件名
      const ext = path.extname(originalName) || '.jpg';
      const filename = `${folder}/${Date.now()}_${uuidv4()}${ext}`;
      
      // 设置上传头信息
      const headers = {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // 缓存1年
        'x-oss-storage-class': 'Standard', // 标准存储
        'x-oss-forbid-overwrite': 'false' // 允许覆盖同名文件
      };

      // 设置元数据
      const meta = {
        originalName: originalName,
        processedBy: 'poetry-app',
        uploadTime: new Date().toISOString(),
        uploadMethod: 'direct'
      };
      
      // 直接上传到OSS，不处理图片
      const result = await this.client.put(filename, imageBuffer, {
        headers,
        meta
      });

      const imageUrl = `${this.baseUrl}/${filename}`;
      
      logger.info('图片直接上传OSS成功', {
        filename,
        size: imageBuffer.length,
        url: imageUrl,
        etag: result.etag
      });

      return {
        success: true,
        data: {
          filename,
          originalName,
          size: imageBuffer.length,
          mimetype: 'image/jpeg',
          url: imageUrl,
          ossUrl: result.url,
          etag: result.etag,
          uploadMethod: 'direct'
        }
      };

    } catch (error) {
      logger.error('图片直接上传OSS失败:', error);
      throw new Error('图片上传失败，请稍后重试');
    }
  }

  /**
   * 从URL上传图片到OSS
   * @param {string} imageUrl - 图片URL
   * @param {string} folder - 存储文件夹
   * @returns {Promise<Object>} 上传结果
   */
  async uploadImageFromUrl(imageUrl, folder = 'poetry') {
    try {
      const axios = require('axios');
      
      // 下载图片
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30秒超时
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const imageBuffer = Buffer.from(response.data);
      const originalName = `image_${Date.now()}.jpg`;
      
      // 根据文件大小选择上传方式
      const fileSize = imageBuffer.length;
      const threshold = 5 * 1024 * 1024; // 5MB阈值
      
      if (fileSize > threshold) {
        // 大文件使用分片上传
        logger.info('文件较大，使用分片上传', { size: fileSize });
        return await this.multipartUploadImage(imageBuffer, originalName, folder);
      } else {
        // 小文件使用普通上传
        return await this.uploadImage(imageBuffer, originalName, folder);
      }

    } catch (error) {
      logger.error('从URL上传图片失败:', error.message);
      
      // 处理特定错误
      if (error.code === 'ECONNABORTED') {
        throw new Error('下载图片超时，请检查网络连接');
      } else if (error.response?.status === 404) {
        throw new Error('图片URL不存在');
      } else if (error.response?.status >= 400) {
        throw new Error(`下载图片失败: HTTP ${error.response.status}`);
      }
      
      throw new Error('图片上传失败，请稍后重试');
    }
  }

  /**
   * 删除OSS中的图片
   * @param {string} filename - 文件名
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteImage(filename) {
    try {
      await this.client.delete(filename);
      
      logger.info('图片删除OSS成功', { filename });
      return true;

    } catch (error) {
      logger.error('图片删除OSS失败:', error);
      return false;
    }
  }

  /**
   * 获取图片信息
   * @param {string} filename - 文件名
   * @returns {Promise<Object>} 图片信息
   */
  async getImageInfo(filename) {
    try {
      const result = await this.client.head(filename);
      
      return {
        success: true,
        data: {
          filename,
          size: result.res.headers['content-length'],
          lastModified: result.res.headers['last-modified'],
          etag: result.res.headers['etag'],
          contentType: result.res.headers['content-type'],
          meta: result.meta
        }
      };

    } catch (error) {
      logger.error('获取图片信息失败:', error);
      throw new Error('获取图片信息失败');
    }
  }

  /**
   * 检查OSS连接状态
   * @returns {Promise<boolean>} 连接状态
   */
  async checkConnection() {
    try {
      await this.client.list({
        'max-keys': 1
      });
      return true;
    } catch (error) {
      logger.error('OSS连接检查失败:', error);
      return false;
    }
  }

  /**
   * 获取图片访问URL
   * @param {string} filename - 文件名
   * @returns {string} 完整的访问URL
   */
  getImageUrl(filename) {
    return `${this.baseUrl}/${filename}`;
  }

  /**
   * 生成带签名的临时访问URL
   * @param {string} filename - 文件名
   * @param {number} expires - 过期时间（秒），默认1小时
   * @returns {string} 带签名的临时URL
   */
  getSignedUrl(filename, expires = 3600) {
    try {
      return this.client.signatureUrl(filename, {
        expires: expires
      });
    } catch (error) {
      logger.error('生成签名URL失败:', error);
      return this.getImageUrl(filename); // 降级到普通URL
    }
  }
}

module.exports = new OSSService(); 