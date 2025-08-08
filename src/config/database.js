const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

let supabase;

const connectDB = async () => {
  try {
    // MemfireDB (Supabase) 连接配置
    const supabaseUrl = process.env.MEMFIREDB_URL;
    const supabaseKey = process.env.MEMFIREDB_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      logger.warn('⚠️ MemfireDB 配置不完整，将使用内存模式运行');
      logger.warn('请设置 MEMFIREDB_URL 和 MEMFIREDB_ANON_KEY 环境变量');
      return; // 不退出，继续运行
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 测试连接
    const { data, error } = await supabase
      .from('poetry')
      .select('count')
      .limit(1);
    
    if (error) {
      // 如果表不存在，这是正常的，说明需要创建表
      if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
        logger.info('数据库连接成功，表结构将在首次使用时创建');
      } else {
        logger.error('数据库连接测试失败:', error);
      }
    } else {
      logger.info('📦 MemfireDB 连接成功');
    }
    
    // 表已存在，跳过初始化
    logger.info('📦 MemfireDB 连接成功');
    
  } catch (error) {
    logger.error('MemfireDB 连接失败:', error);
    logger.warn('⚠️ 将使用内存模式运行，数据不会持久化');
    // 不退出，继续运行
  }
};



/**
 * 获取 Supabase 客户端实例
 */
const getSupabase = () => {
  if (!supabase) {
    throw new Error('数据库未初始化');
  }
  return supabase;
};

/**
 * 执行原始SQL查询
 */
const executeSQL = async (sql, params = []) => {
  if (!supabase) {
    throw new Error('数据库未初始化');
  }
  
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: sql,
      sql_params: params
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    logger.error('SQL执行失败:', error);
    throw error;
  }
};

module.exports = { 
  connectDB, 
  getSupabase, 
  executeSQL 
}; 