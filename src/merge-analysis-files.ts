import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

// 定义数据目录路径 - 更新为正确的子文件夹
const DATA_DIR = path.join(process.cwd(), 'data', 'analysis_block_30488600_50');
// 定义合并后的输出文件路径
const OUTPUT_FILE = path.join(process.cwd(), 'data', 'merged-analysis.json');

// 首先检查目录是否存在
function checkDirectory() {
  if (!existsSync(DATA_DIR)) {
    console.error(`错误: 目录不存在: ${DATA_DIR}`);
    return false;
  }
  console.log(`指定的目录存在: ${DATA_DIR}`);
  return true;
}

// 查找所有分析文件
function findAnalysisFiles(): string[] {
  const files = readdirSync(DATA_DIR);
  // 使用更宽松的过滤条件，查找所有可能的分析文件格式
  const analysisFiles = files
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(DATA_DIR, file));
  
  console.log(`找到的文件数量: ${analysisFiles.length}`);
  if (analysisFiles.length <= 5) {
    console.log("找到的文件:", analysisFiles.map(f => path.basename(f)));
  } else {
    console.log("部分文件示例:", analysisFiles.slice(0, 5).map(f => path.basename(f)));
  }
  
  return analysisFiles.sort((a, b) => {
    // 从文件名中提取区块号
    const getBlockNumber = (filename: string) => {
      const match = filename.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    };
    
    return getBlockNumber(a) - getBlockNumber(b);
  });
}

// 合并所有JSON文件
function mergeAnalysisFiles(files: string[]): any {
  // 创建保存合并数据的对象
  const mergedData: {
    blockAnalysis: Record<string, any>;
    totalBlocks: number;
    blockRange: {
      start: number;
      end: number;
    };
    stats: {
      totalTransactions: number;
      swapTransactions: number;
      arbitrageTransactions: number;
      swapEvents: number;
    };
  } = {
    blockAnalysis: {},
    totalBlocks: 0,
    blockRange: {
      start: Infinity,
      end: 0
    },
    stats: {
      totalTransactions: 0,
      swapTransactions: 0,
      arbitrageTransactions: 0,
      swapEvents: 0
    }
  };

  console.log(`开始合并 ${files.length} 个分析文件...`);

  // 处理每个文件
  files.forEach((file, index) => {
    try {
      console.log(`处理文件 ${index + 1}/${files.length}: ${path.basename(file)}`);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      
      // 尝试从文件名中提取区块号
      const blockNumberMatch = path.basename(file).match(/\d+/);
      const blockNumber = blockNumberMatch ? parseInt(blockNumberMatch[0]) : index;
      
      // 更新区块号范围
      mergedData.blockRange.start = Math.min(mergedData.blockRange.start, blockNumber);
      mergedData.blockRange.end = Math.max(mergedData.blockRange.end, blockNumber);
      
      // 存储区块分析数据
      mergedData.blockAnalysis[blockNumber.toString()] = data;
      
      // 更新统计数据
      mergedData.totalBlocks++;
      if (data.stats) {
        mergedData.stats.totalTransactions += data.stats.totalTransactions || 0;
        mergedData.stats.swapTransactions += data.stats.swapTransactions || 0;
        mergedData.stats.arbitrageTransactions += data.stats.arbitrageTransactions || 0;
        mergedData.stats.swapEvents += data.stats.swapEvents || 0;
      }
    } catch (error) {
      console.error(`处理文件 ${file} 时出错:`, error);
    }
  });

  return mergedData;
}

// 主函数
function main() {
  console.log('开始合并分析文件...');
  
  // 首先检查目录是否存在
  if (!checkDirectory()) {
    return;
  }
  
  // 查找所有分析文件
  const files = findAnalysisFiles();
  console.log(`找到 ${files.length} 个分析文件`);
  
  if (files.length === 0) {
    console.log('没有找到分析文件，退出程序');
    return;
  }
  
  // 合并文件
  const mergedData = mergeAnalysisFiles(files);
  
  // 保存合并后的数据
  const replacer = (key: string, value: any) => {
    // 处理BigInt序列化
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  };
  
  writeFileSync(
    OUTPUT_FILE, 
    JSON.stringify(mergedData, replacer, 2)
  );
  
  console.log(`合并完成! 结果保存在: ${OUTPUT_FILE}`);
  console.log(`合并了 ${mergedData.totalBlocks} 个区块从 ${mergedData.blockRange.start} 到 ${mergedData.blockRange.end}`);
  console.log('统计数据:', mergedData.stats);
}

main(); 