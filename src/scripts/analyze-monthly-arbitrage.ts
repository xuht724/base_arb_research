import { ArbHelper } from '../lib/chain/arb.helper';
import fs from 'fs';
import path from 'path';

// 配置参数
const CONFIG = {
  // RPC配置
  RPC_URL: process.env.RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/XkS09_sZZA5Z4QzZWCk2C",
  THE_GRAPH_API_KEY: process.env.THE_GRAPH_API_KEY || 'HNCFA9TyBqpo5qpe6QreQABAA1kV8g46mhkCcicu6v2R',
  
  // 分析参数
  BLOCKS_PER_DAY: 43200, // Base链大约每2秒一个区块，一天约43200个区块
  DAYS_TO_ANALYZE: 30, // 分析30天
  MAX_BLOCKS_PER_BATCH: 10, // 每批处理的区块数
  BATCH_DELAY_MS: 2000, // 批次间延迟（毫秒）
  
  // 输出配置
  OUTPUT_DIR: path.join(__dirname, '../../data/monthly-analysis'),
  SUMMARY_FILE: 'monthly-arbitrage-summary.json',
  DAILY_STATS_FILE: 'daily-arbitrage-stats.json'
};

// 修复BigInt序列化问题的自定义replacer函数
function replacer(key: string, value: any) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

// 确保输出目录存在
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }
}

// 保存区块分析结果
function saveBlockResult(result: any, blockNumber: number) {
  const outputFile = path.join(CONFIG.OUTPUT_DIR, `block-${blockNumber}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(result, replacer, 2));
  return outputFile;
}

// 保存每日统计
function saveDailyStats(stats: any[]) {
  const outputFile = path.join(CONFIG.OUTPUT_DIR, CONFIG.DAILY_STATS_FILE);
  fs.writeFileSync(outputFile, JSON.stringify(stats, replacer, 2));
  console.log(`每日统计已保存到: ${outputFile}`);
}

// 保存月度总结
function saveMonthlySummary(summary: any) {
  const outputFile = path.join(CONFIG.OUTPUT_DIR, CONFIG.SUMMARY_FILE);
  fs.writeFileSync(outputFile, JSON.stringify(summary, replacer, 2));
  console.log(`月度总结已保存到: ${outputFile}`);
}

// calculateDailyStats 增强版
function calculateDailyStats(dayResults: any[]) {
  const totalTransactions = dayResults.reduce((sum, result) => 
    sum + (result?.transactions?.length || 0), 0);

  const totalArbitrageTransactions = dayResults.reduce((sum, result) => 
    sum + (result?.transactions?.filter((tx: any) => tx.arbitrageInfo)?.length || 0), 0);

  const totalSwapEvents = dayResults.reduce((sum, result) => 
    sum + result?.transactions?.reduce((txSum: number, tx: any) => 
      txSum + (tx.swapEvents?.length || 0), 0) || 0, 0);

  // 协议/币种使用频率统计
  const protocolStats: { [key: string]: number } = {};
  const tokenStats: { [key: string]: number } = {};

  dayResults.forEach(result => {
    result?.transactions?.forEach((tx: any) => {
      tx.swapEvents?.forEach((swap: any) => {
        protocolStats[swap.protocol] = (protocolStats[swap.protocol] || 0) + 1;
        tokenStats[swap.tokenIn] = (tokenStats[swap.tokenIn] || 0) + 1;
        tokenStats[swap.tokenOut] = (tokenStats[swap.tokenOut] || 0) + 1;
      });
    });
  });

  // 总利润（WETH）
  let totalProfitWETH = 0n;
  dayResults.forEach(result => {
    result?.transactions?.forEach((tx: any) => {
      if (tx.arbitrageInfo?.profit?.token?.toLowerCase() === '0x4200000000000000000000000000000000000006') {
        totalProfitWETH += BigInt(tx.arbitrageInfo.profit.amount || '0');
      }
    });
  });

  // 平均套利路径长度
  const arbitragePathLengths = dayResults.flatMap(result =>
    result.transactions
      .filter((tx: any) => tx.arbitrageInfo)
      .map((tx: any) => tx.swapEvents?.length || 0)
  );
  const averageArbitragePathLength = arbitragePathLengths.length > 0
    ? (arbitragePathLengths.reduce((a, b) => a + b, 0) / arbitragePathLengths.length).toFixed(2)
    : '0';

  // 套利地址活跃度（Zipf 分布）
  const arbitrageAddressCounts: { [address: string]: number } = {};
  dayResults.forEach(result => {
    result.transactions
      .filter((tx: any) => tx.arbitrageInfo)
      .forEach((tx: any) => {
        const addr = tx.sender?.toLowerCase();
        if (addr) {
          arbitrageAddressCounts[addr] = (arbitrageAddressCounts[addr] || 0) + 1;
        }
      });
  });
  const topArbitrageAddresses = Object.entries(arbitrageAddressCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  // Gas 使用差异
  let totalGasArb = 0n, countArb = 0;
  let totalGasNonArb = 0n, countNonArb = 0;

  dayResults.forEach(result => {
    result.transactions.forEach((tx: any) => {
      const gas = BigInt(tx.receipt?.gasUsed || 0);
      if (tx.arbitrageInfo) {
        totalGasArb += gas; countArb++;
      } else {
        totalGasNonArb += gas; countNonArb++;
      }
    });
  });
  const averageGasArbitrage = countArb > 0 ? (totalGasArb / BigInt(countArb)).toString() : '0';
  const averageGasNonArbitrage = countNonArb > 0 ? (totalGasNonArb / BigInt(countNonArb)).toString() : '0';

  return {
    totalTransactions,
    totalArbitrageTransactions,
    totalSwapEvents,
    arbitrageRate: totalTransactions > 0 ? (totalArbitrageTransactions / totalTransactions * 100).toFixed(2) + '%' : '0%',
    protocolStats,
    tokenStats,
    totalProfitWETH: totalProfitWETH.toString(),
    averageArbitragePathLength,
    topArbitrageAddresses,
    averageGasArbitrage,
    averageGasNonArbitrage,
    blocksAnalyzed: dayResults.length
  };
}


// 分析单个区块
async function analyzeBlock(arbHelper: ArbHelper, blockNumber: number): Promise<any> {
  try {
    console.log(`分析区块 ${blockNumber}...`);
    
    // 获取区块数据
    const blockData = await arbHelper.getBlockWithReceipts(blockNumber);
    if (!blockData) {
      console.log(`无法获取区块 ${blockNumber} 数据`);
      return null;
    }
    
    // 分析区块
    const result = await arbHelper.analyzeBlock(
      blockData.blockNumber,
      blockData.timestamp,
      blockData.transactions,
      blockData.receipts
    );
    
    if (result) {
      const arbitrageTxCount = result.transactions.filter(tx => tx.arbitrageInfo).length;
      console.log(`区块 ${blockNumber}: ${result.transactions.length} 交易, ${arbitrageTxCount} 套利`);
    }
    
    return result;
  } catch (error) {
    console.error(`分析区块 ${blockNumber} 时出错:`, error);
    return null;
  }
}

// 分析一天的数据
async function analyzeDay(arbHelper: ArbHelper, startBlock: number, day: number): Promise<any[]> {
  console.log(`\n=== 开始分析第 ${day} 天 (从区块 ${startBlock} 开始) ===`);
  
  const dayResults = [];
  const blocksToAnalyze = Math.min(CONFIG.BLOCKS_PER_DAY, 100); // 限制每天最多分析100个区块用于测试
  
  // 分批处理区块
  const batches = Math.ceil(blocksToAnalyze / CONFIG.MAX_BLOCKS_PER_BATCH);
  
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const batchStart = batchIndex * CONFIG.MAX_BLOCKS_PER_BATCH;
    const batchSize = Math.min(CONFIG.MAX_BLOCKS_PER_BATCH, blocksToAnalyze - batchStart);
    
    console.log(`处理第 ${batchIndex + 1}/${batches} 批 (${batchSize} 个区块)`);
    
    // 并行处理批次内的区块
    const batchPromises = [];
    for (let i = 0; i < batchSize; i++) {
      const blockNumber = startBlock + batchStart + i;
      batchPromises.push(analyzeBlock(arbHelper, blockNumber));
    }
    
    const batchResults = await Promise.all(batchPromises);
    dayResults.push(...batchResults.filter(result => result !== null));
    
    // 批次间延迟
    if (batchIndex < batches - 1) {
      console.log(`批次间暂停 ${CONFIG.BATCH_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY_MS));
    }
  }
  
  return dayResults;
}

// 主分析函数
async function analyzeMonthlyArbitrage(startBlockNumber?: number) {
  console.log('开始月度套利分析...');
  console.log(`配置: ${CONFIG.DAYS_TO_ANALYZE} 天, 每天最多 ${CONFIG.BLOCKS_PER_DAY} 个区块`);
  
  // 初始化ArbHelper
  const arbHelper = new ArbHelper(CONFIG.RPC_URL, CONFIG.THE_GRAPH_API_KEY);
  
  // 确保输出目录存在
  ensureOutputDir();
  
  // 如果没有指定起始区块，获取最新区块号
  let currentBlock = startBlockNumber;
  if (!currentBlock) {
    try {
      const latestBlock = await arbHelper.httpClient.getBlockNumber();
      currentBlock = Number(latestBlock) - (CONFIG.DAYS_TO_ANALYZE * CONFIG.BLOCKS_PER_DAY);
      console.log(`使用起始区块: ${currentBlock} (最新区块: ${latestBlock})`);
    } catch (error) {
      console.error('无法获取最新区块号:', error);
      return;
    }
  }
  
  const dailyStats = [];
  const allResults = [];
  
  // 逐天分析
  for (let day = 1; day <= CONFIG.DAYS_TO_ANALYZE; day++) {
    const dayStartBlock = currentBlock + (day - 1) * CONFIG.BLOCKS_PER_DAY;
    
    try {
      const dayResults = await analyzeDay(arbHelper, dayStartBlock, day);
      allResults.push(...dayResults);
      
      // 计算当日统计
      const dayStats = calculateDailyStats(dayResults);
      dailyStats.push({
        day,
        startBlock: dayStartBlock,
        endBlock: dayStartBlock + CONFIG.BLOCKS_PER_DAY - 1,
        ...dayStats
      });
      
      console.log(`第 ${day} 天完成: ${dayStats.totalTransactions} 交易, ${dayStats.totalArbitrageTransactions} 套利`);
      
      // 保存每日统计
      saveDailyStats(dailyStats);
      
    } catch (error) {
      console.error(`分析第 ${day} 天时出错:`, error);
    }
  }
  
  // 生成月度总结
  const monthlySummary = {
    analysisConfig: {
      startBlock: currentBlock,
      daysAnalyzed: CONFIG.DAYS_TO_ANALYZE,
      totalBlocksAnalyzed: allResults.length
    },
    overallStats: calculateDailyStats(allResults),
    dailyBreakdown: dailyStats,
    topProtocols: Object.entries(
      dailyStats.reduce((acc: any, day) => {
        Object.entries(day.protocolStats).forEach(([protocol, count]) => {
          acc[protocol] = (acc[protocol] || 0) + count;
        });
        return acc;
      }, {})
    ).sort(([,a], [,b]) => (b as number) - (a as number)).slice(0, 10),
    
    topTokens: Object.entries(
      dailyStats.reduce((acc: any, day) => {
        Object.entries(day.tokenStats).forEach(([token, count]) => {
          acc[token] = (acc[token] || 0) + count;
        });
        return acc;
      }, {})
    ).sort(([,a], [,b]) => (b as number) - (a as number)).slice(0, 20)
  };
  
  // 保存月度总结
  saveMonthlySummary(monthlySummary);
  
  console.log('\n=== 月度分析完成 ===');
  console.log(`总交易数: ${monthlySummary.overallStats.totalTransactions}`);
  console.log(`套利交易数: ${monthlySummary.overallStats.totalArbitrageTransactions}`);
  console.log(`套利率: ${monthlySummary.overallStats.arbitrageRate}`);
  console.log(`总Swap事件: ${monthlySummary.overallStats.totalSwapEvents}`);
  console.log(`分析的区块数: ${monthlySummary.analysisConfig.totalBlocksAnalyzed}`);
}

// 命令行参数处理
async function main() {
  const args = process.argv.slice(2);
  let startBlock: number | undefined;
  
  if (args.length > 0) {
    startBlock = parseInt(args[0]);
    if (isNaN(startBlock)) {
      console.error('起始区块号必须是数字');
      process.exit(1);
    }
  }
  
  try {
    await analyzeMonthlyArbitrage(startBlock);
  } catch (error) {
    console.error('分析过程中出现错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

export { analyzeMonthlyArbitrage, CONFIG }; 