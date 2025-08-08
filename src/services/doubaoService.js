const https = require('https');
const logger = require('../utils/logger');

// 通用HTTPS请求函数
function makeHttpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (error) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

class DoubaoService {
  constructor() {
    this.apiKey = process.env.DOUBAO_API_KEY;
    this.baseURL = 'ark.cn-beijing.volces.com';
    this.model = 'doubao-1-5-thinking-vision-pro-250428';
    
    if (!this.apiKey) {
      logger.error('豆包API密钥未配置');
    }
  }

  /**
   * 直接根据图片生成诗歌（使用豆包图片接口）
   * @param {Buffer|string} imageInput - 图片二进制数据或URL地址
   * @param {string} style - 诗歌风格 (古风、现代、浪漫等)
   * @returns {Promise<Object>} 包含诗歌内容和图片分析的结果
   */
  async generatePoetryFromImage(imageInput, style = '古风') {
    try {
      const prompt = this.buildImagePoetryPrompt(style);
      
      // 判断输入类型：Buffer或URL字符串
      let imageUrl;
      if (Buffer.isBuffer(imageInput)) {
        // 如果是Buffer，转换为base64
        const base64Image = imageInput.toString('base64');
        imageUrl = `data:image/jpeg;base64,${base64Image}`;
      } else if (typeof imageInput === 'string') {
        // 如果是字符串，直接作为URL使用（OSS URL或其他HTTP URL）
        imageUrl = imageInput;
      } else {
        throw new Error('图片输入格式不正确，请提供Buffer或URL字符串');
      }
      
      logger.info('准备调用豆包API', { 
        style, 
        imageType: Buffer.isBuffer(imageInput) ? 'buffer' : 'url'
      });
      
      const postData = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一位才华横溢的诗人，擅长根据图片内容创作优美的诗歌。请仔细观察图片，然后创作一首符合指定风格的诗歌。同时给诗取个名字。'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        temperature: 0.8,
        max_tokens: 1000,
        top_p: 0.9
      });
      
      const options = {
        hostname: this.baseURL,
        port: 443,
        path: '/api/v3/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'poetry-app'
        },
        timeout: 30000
      };
      
      const response = await makeHttpsRequest(options, postData);

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      const result = response.data.choices[0].message.content.trim();
      
      // 打印豆包API返回的原始内容
      logger.info('豆包API返回原始内容:', { 
        style, 
        rawContent: result,
        contentLength: result.length
      });
      
      // 解析结果，提取诗歌内容和图片描述
      const parsedResult = this.parsePoetryResult(result);
      
      logger.info('图片诗歌生成成功', { 
        style, 
        poetryLength: parsedResult.poetry.length,
        hasDescription: !!parsedResult.imageDescription,
        title: parsedResult.title,
        poetryContent: parsedResult.poetry
      });
      
      return parsedResult;
    } catch (error) {
      logger.error('图片诗歌生成失败:', error.message);
      
      // 处理特定的图片格式错误
      if (error.message && error.message.includes('InvalidParameter.UnsupportedImageFormat')) {
        throw new Error('图片格式不支持，请使用JPEG、PNG等常见格式');
      } else if (error.message && error.message.includes('InvalidParameter.ImageTooLarge')) {
        throw new Error('图片文件过大，请压缩后重试');
      } else if (error.message && error.message.includes('401')) {
        throw new Error('API密钥无效，请检查配置');
      } else if (error.message && error.message.includes('429')) {
        throw new Error('API调用频率过高，请稍后重试');
      }
      
      throw new Error('诗歌生成失败，请稍后重试');
    }
  }

  /**
   * 构建图片诗歌生成提示词
   * @param {string} style - 诗歌风格
   * @returns {string} 完整的提示词
   */
  buildImagePoetryPrompt(style) {
    const stylePrompts = {
      '古风': '请以古风诗词的形式，创作一首优美的诗歌。要求：1. 使用古风词汇和表达方式 2. 意境优美，富有诗意 3. 字数控制在50-100字之间 4. 可以包含标题',
      '现代': '请以现代诗的形式，创作一首富有现代感的诗歌。要求：1. 语言简洁明了 2. 情感真挚 3. 字数控制在100-200字之间 4. 可以包含标题',
      '浪漫': '请以浪漫主义风格，创作一首充满浪漫情怀的诗歌。要求：1. 情感丰富，富有想象力 2. 语言优美动人 3. 字数控制在80-150字之间 4. 可以包含标题',
      '哲理': '请以哲理诗的形式，创作一首富有哲理的诗歌。要求：1. 思想深刻 2. 语言凝练 3. 字数控制在60-120字之间 4. 可以包含标题'
    };

    const stylePrompt = stylePrompts[style] || stylePrompts['古风'];
    
    return `请仔细观察这张图片，然后：

1. 首先简要描述图片内容（50字以内）
2. 然后根据图片内容，${stylePrompt}

请按照以下格式返回：

**图片描述：**
[图片内容描述]

**诗歌：**
[诗歌标题]
[诗歌内容]

**分析：**
[对图片的简要分析，包括色彩、构图、意境等]`;
  }

  /**
   * 解析诗歌生成结果
   * @param {string} result - 豆包API返回的结果
   * @returns {Object} 解析后的结果
   */
  parsePoetryResult(result) {
    try {
      logger.info('开始解析豆包返回结果:', { resultLength: result.length });
      
      // 尝试提取图片描述
      const descriptionMatch = result.match(/\*\*图片描述：\*\*\s*([\s\S]*?)(?=\*\*诗歌：\*\*|\*\*分析：\*\*|$)/);
      const imageDescription = descriptionMatch ? descriptionMatch[1].trim() : '这是一张美丽的图片，展现了丰富的视觉内容。';
      
      logger.info('提取的图片描述:', { imageDescription });
      
      // 尝试提取诗歌内容
      const poetryMatch = result.match(/\*\*诗歌：\*\*\s*([\s\S]*?)(?=\*\*分析：\*\*|$)/);
      let poetry = poetryMatch ? poetryMatch[1].trim() : result;
      
      logger.info('提取的诗歌内容:', { poetry });
      
      // 如果诗歌内容包含标题，提取标题
      const titleMatch = poetry.match(/^(.+?)\n/);
      const title = titleMatch ? titleMatch[1].trim() : null;
      
      logger.info('提取的标题:', { title });
      
      // 清理诗歌内容（去掉标题行）
      if (title) {
        poetry = poetry.replace(/^.+?\n/, '').trim();
      }
      
      // 如果标题为空或太短，尝试从诗歌内容中提取更有意义的标题
      if (!title || title.length < 2) {
        const firstLine = poetry.split('\n')[0];
        if (firstLine && firstLine.length > 2) {
          // 使用第一行作为标题
          return {
            poetry: poetry.split('\n').filter(line => line.trim()),
            imageDescription,
            analysis,
            title: firstLine.trim()
          };
        }
      }
      
      // 尝试提取分析内容
      const analysisMatch = result.match(/\*\*分析：\*\*\s*([\s\S]*?)$/);
      const analysis = analysisMatch ? analysisMatch[1].trim() : '图片分析：色彩丰富，构图和谐，具有很强的艺术感染力。';
      
      return {
        poetry: poetry.split('\n').filter(line => line.trim()),
        imageDescription,
        analysis,
        title
      };
    } catch (error) {
      logger.warn('解析诗歌结果失败，使用原始内容:', error.message);
      return {
        poetry: result.split('\n').filter(line => line.trim()),
        imageDescription: '这是一张美丽的图片，展现了丰富的视觉内容。',
        analysis: '图片分析：色彩丰富，构图和谐，具有很强的艺术感染力。',
        title: null
      };
    }
  }

  /**
   * 根据图片描述生成诗歌
   * @param {string} imageDescription - 图片描述
   * @param {string} style - 诗歌风格
   * @returns {Promise<Object>} 生成的诗歌
   */
  async generatePoetry(imageDescription, style = '古风') {
    try {
      const prompt = this.buildPoetryPrompt(imageDescription, style);
      
      const postData = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一位才华横溢的诗人，擅长根据描述创作优美的诗歌。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 1000,
        top_p: 0.9
      });

      const options = {
        hostname: this.baseURL,
        port: 443,
        path: '/api/v3/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'poetry-app'
        },
        timeout: 30000
      };

      const response = await makeHttpsRequest(options, postData);

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      const result = response.data.choices[0].message.content.trim();
      const parsedResult = this.parsePoetryResult(result);
      
      return parsedResult;
    } catch (error) {
      logger.error('诗歌生成失败:', error);
      throw new Error('诗歌生成失败，请稍后重试');
    }
  }

  /**
   * 构建诗歌生成提示词
   * @param {string} imageDescription - 图片描述
   * @param {string} style - 诗歌风格
   * @returns {string} 提示词
   */
  buildPoetryPrompt(imageDescription, style) {
    const stylePrompts = {
      '古风': '请以古风诗词的形式，创作一首优美的诗歌。要求：1. 使用古风词汇和表达方式 2. 意境优美，富有诗意 3. 字数控制在50-100字之间',
      '现代': '请以现代诗的形式，创作一首富有现代感的诗歌。要求：1. 语言简洁明了 2. 情感真挚 3. 字数控制在100-200字之间',
      '浪漫': '请以浪漫主义风格，创作一首充满浪漫情怀的诗歌。要求：1. 情感丰富，富有想象力 2. 语言优美动人 3. 字数控制在80-150字之间',
      '哲理': '请以哲理诗的形式，创作一首富有哲理的诗歌。要求：1. 思想深刻 2. 语言凝练 3. 字数控制在60-120字之间'
    };

    const stylePrompt = stylePrompts[style] || stylePrompts['古风'];
    
    return `根据以下图片描述，${stylePrompt}：

图片描述：${imageDescription}

请创作一首诗歌：`;
  }

  /**
   * 优化图片描述
   * @param {string} rawDescription - 原始图片描述
   * @returns {Promise<string>} 优化后的描述
   */
  async optimizeImageDescription(rawDescription) {
    try {
      const postData = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的图片分析专家，擅长简洁准确地描述图片内容。'
          },
          {
            role: 'user',
            content: `请优化以下图片描述，使其更加准确、简洁（50字以内）：

${rawDescription}`
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
        top_p: 0.9
      });

      const options = {
        hostname: this.baseURL,
        port: 443,
        path: '/api/v3/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'poetry-app'
        },
        timeout: 15000
      };

      const response = await makeHttpsRequest(options, postData);

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      logger.warn('优化图片描述失败，使用原始描述:', error.message);
      return rawDescription;
    }
  }

  /**
   * 检查API连接状态
   * @returns {Promise<boolean>} 连接状态
   */
  async checkConnection() {
    try {
      const postData = JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: '你好'
          }
        ],
        max_tokens: 10
      });

      const options = {
        hostname: this.baseURL,
        port: 443,
        path: '/api/v3/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'poetry-app'
        },
        timeout: 10000
      };

      const response = await makeHttpsRequest(options, postData);

      return response.status === 200;
    } catch (error) {
      logger.error('豆包API连接检查失败:', error.message);
      return false;
    }
  }
}

module.exports = new DoubaoService(); 