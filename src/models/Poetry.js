const { getSupabase } = require('../config/database');
const logger = require('../utils/logger');

class Poetry {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id;
    this.image = data.image;
    this.imageRecognition = data.image_recognition;
    this.poetry = data.poetry;
    this.generation = data.generation;
    this.feedback = data.feedback;
    this.share = data.share;
    this.metadata = data.metadata;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  /**
   * 创建诗歌记录
   */
  static async create(poetryData) {
    try {
      const supabase = getSupabase();
      
      // 确保数据格式正确
      const insertData = {
        user_id: poetryData.userId || null,
        image: poetryData.image || {},
        image_recognition: poetryData.imageRecognition || {},
        poetry: poetryData.poetry || {},
        generation: poetryData.generation || {},
        feedback: poetryData.feedback || {},
        share: poetryData.share || { is_public: false, share_count: 0 },
        metadata: poetryData.metadata || {}
      };
      
      const { data, error } = await supabase
        .from('poetry')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        logger.error('数据库插入错误:', error);
        throw error;
      }
      
      return new Poetry(data);
    } catch (error) {
      logger.error('创建诗歌记录失败:', error);
      
      // 如果是表不存在错误，提供更明确的错误信息
      if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
        throw new Error('数据库表未创建，请先初始化数据库');
      }
      
      throw error;
    }
  }

  /**
   * 根据ID查找诗歌
   */
  static async findById(id) {
    try {
      const supabase = getSupabase();
      
      const { data, error } = await supabase
        .from('poetry')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      return data ? new Poetry(data) : null;
    } catch (error) {
      logger.error('查找诗歌失败:', error);
      throw error;
    }
  }

  /**
   * 查找诗歌列表
   */
  static async find(query = {}, options = {}) {
    try {
      const supabase = getSupabase();
      let queryBuilder = supabase.from('poetry').select('*');

      // 应用过滤条件
      if (query.style) {
        queryBuilder = queryBuilder.eq('poetry->style', query.style);
      }
      
      if (query.userId) {
        queryBuilder = queryBuilder.eq('user_id', query.userId);
      }

      // 应用排序
      if (options.sort) {
        switch (options.sort) {
          case 'popular':
            queryBuilder = queryBuilder.order('share->share_count', { ascending: false });
            break;
          case 'rating':
            queryBuilder = queryBuilder.order('feedback->rating', { ascending: false });
            break;
          default:
            queryBuilder = queryBuilder.order('created_at', { ascending: false });
        }
      } else {
        queryBuilder = queryBuilder.order('created_at', { ascending: false });
      }

      // 应用分页
      if (options.offset) {
        queryBuilder = queryBuilder.range(options.offset, options.offset + (options.limit || 10) - 1);
      } else if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      
      return data.map(item => new Poetry(item));
    } catch (error) {
      logger.error('查找诗歌列表失败:', error);
      throw error;
    }
  }

  /**
   * 统计诗歌数量
   */
  static async count(query = {}) {
    try {
      const supabase = getSupabase();
      let queryBuilder = supabase.from('poetry').select('id', { count: 'exact' });

      // 应用过滤条件
      if (query.style) {
        queryBuilder = queryBuilder.eq('poetry->style', query.style);
      }
      
      if (query.userId) {
        queryBuilder = queryBuilder.eq('user_id', query.userId);
      }

      const { count, error } = await queryBuilder;

      if (error) throw error;
      
      return count || 0;
    } catch (error) {
      logger.error('统计诗歌数量失败:', error);
      throw error;
    }
  }

  /**
   * 查找热门诗歌
   */
  static async findPopular(limit = 10) {
    try {
      const supabase = getSupabase();
      
      const { data, error } = await supabase
        .from('poetry')
        .select('*')
        .eq('share->is_public', true)
        .order('share->share_count', { ascending: false })
        .order('feedback->rating', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      return data.map(item => new Poetry(item));
    } catch (error) {
      logger.error('查找热门诗歌失败:', error);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  static async getStats() {
    try {
      const supabase = getSupabase();
      
      // 获取总数
      const { count: totalPoems } = await supabase
        .from('poetry')
        .select('id', { count: 'exact' });

      // 获取分享总数
      const { data: shareData } = await supabase
        .from('poetry')
        .select('share->share_count');

      const totalShares = shareData?.reduce((sum, item) => sum + (item.share?.share_count || 0), 0) || 0;

      // 获取平均评分
      const { data: ratingData } = await supabase
        .from('poetry')
        .select('feedback->rating')
        .not('feedback->rating', 'is', null);

      const avgRating = ratingData?.length > 0 
        ? ratingData.reduce((sum, item) => sum + (item.feedback?.rating || 0), 0) / ratingData.length 
        : 0;

      // 获取风格分布
      const { data: styleData } = await supabase
        .from('poetry')
        .select('poetry->style');

      const styles = [...new Set(styleData?.map(item => item.poetry?.style).filter(Boolean))];

      return {
        totalPoems: totalPoems || 0,
        totalShares,
        avgRating: Math.round(avgRating * 10) / 10,
        styles
      };
    } catch (error) {
      logger.error('获取统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 更新诗歌记录
   */
  async save() {
    try {
      const supabase = getSupabase();
      
      const updateData = {
        user_id: this.userId,
        image: this.image,
        image_recognition: this.imageRecognition,
        poetry: this.poetry,
        generation: this.generation,
        feedback: this.feedback,
        share: this.share,
        metadata: this.metadata,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('poetry')
        .update(updateData)
        .eq('id', this.id)
        .select()
        .single();

      if (error) throw error;
      
      Object.assign(this, new Poetry(data));
      return this;
    } catch (error) {
      logger.error('更新诗歌记录失败:', error);
      throw error;
    }
  }

  /**
   * 增加分享次数
   */
  async incrementShareCount() {
    try {
      const supabase = getSupabase();
      
      const { data, error } = await supabase
        .from('poetry')
        .update({
          'share->share_count': (this.share?.share_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.id)
        .select()
        .single();

      if (error) throw error;
      
      Object.assign(this, new Poetry(data));
      return this;
    } catch (error) {
      logger.error('增加分享次数失败:', error);
      throw error;
    }
  }



  /**
   * 删除诗歌记录
   */
  static async deleteById(id) {
    try {
      const supabase = getSupabase();
      
      const { error } = await supabase
        .from('poetry')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      return true;
    } catch (error) {
      logger.error('删除诗歌记录失败:', error);
      throw error;
    }
  }

  /**
   * 转换为JSON对象
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      image: this.image,
      imageRecognition: this.imageRecognition,
      poetry: this.poetry,
      generation: this.generation,
      feedback: this.feedback,
      share: this.share,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // 虚拟字段
      imageUrl: this.image?.filename ? `/uploads/${this.image.filename}` : null,
      shortContent: this.poetry?.content?.length > 100 
        ? this.poetry.content.substring(0, 100) + '...'
        : this.poetry?.content
    };
  }
}

module.exports = Poetry; 