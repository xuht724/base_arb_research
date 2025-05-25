import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

// 定义数据文件和输出目录
const MERGED_DATA_FILE = path.join(process.cwd(), 'data', 'merged-analysis.json');
const OUTPUT_DIR = path.join(process.cwd(), 'analysis_results');

// 确保输出目录存在
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR);
}

// 接口定义 - 根据实际数据结构调整
interface SwapEvent {
  tokenIn: string;
  tokenOut: string;
  protocol: string;
  poolAddress: string;
  amountIn?: string;
  amountOut?: string;
  sender?: string;
  recipient?: string;
}

interface GraphTokenChange {
  token: string;
  amount: string;
}

interface ArbitrageTx {
  txHash: string;
  type: string; // 'begin' | 'inter' | 'end'
  transactionIndex: number;
  swapEvents: SwapEvent[];
  profit?: {
    token: string;
    amount: string;
  };
  previousTxHash?: string;
  interInfo?: {
    sender: string;
    profitToken: string;
    profitAmount: string;
  };
  graphTokenChanges?: GraphTokenChange[];
  involvedPools?: string[];
  from?: string;
  to?: string;
}

// 注意：SimpleSwapTx的结构与之前不同，它没有swapEvents数组
interface SimpleSwapTx {
  txHash: string;
  transactionIndex: number;
  protocol: string; 
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  from?: string;
  to?: string;
  gasUsed?: string;
  gasPrice?: string;
}

// SwapArbitrageRelation结构也不同
interface SwapArbitrageRelation {
  arbitrageTxHash: string;
  arbitrageTransactionIndex: number;
  potentialTriggerSwaps: {
    swapTxHash: string;
    swapTransactionIndex: number;
    swapProtocol: string;
    swapPoolAddress: string;
    timeDifference?: number;
  }[];
}

interface BlockAnalysis {
  arbitrageTxs: ArbitrageTx[];
  simpleSwapTxs: SimpleSwapTx[];
  swapArbitrageRelations: SwapArbitrageRelation[];
  stats?: {
    totalTransactions: number;
    swapTransactions: number;
    arbitrageTransactions: number;
    swapEvents: number;
  };
}

interface MergedData {
  blockAnalysis: Record<string, BlockAnalysis>;
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
}

// 1. 套利行为的总览统计
function summaryStats(arbitrageTxs: ArbitrageTx[]) {
  // 统计总数
  const totalArbitrageTxs = arbitrageTxs.length;
  
  // 类型分布
  const typeDistribution = arbitrageTxs.reduce((acc, tx) => {
    acc[tx.type] = (acc[tx.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // 盈利代币种类分布
  const profitTokenDistribution = arbitrageTxs.reduce((acc, tx) => {
    if (tx.profit && tx.profit.token) {
      const token = tx.profit.token;
      acc[token] = (acc[token] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // 单笔套利中涉及的swap次数分布
  const swapCountDistribution = arbitrageTxs.reduce((acc, tx) => {
    const swapCount = tx.swapEvents?.length || 0;
    acc[swapCount] = (acc[swapCount] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  // 各协议套利参与频率
  const protocolFrequency: Record<string, number> = {};
  arbitrageTxs.forEach(tx => {
    if (tx.swapEvents) {
      tx.swapEvents.forEach(event => {
        if (event.protocol) {
          protocolFrequency[event.protocol] = (protocolFrequency[event.protocol] || 0) + 1;
        }
      });
    }
  });
  
  // 套利者地址参与频率
  const arbitragerFrequency: Record<string, number> = {};
  arbitrageTxs.forEach(tx => {
    if (tx.interInfo && tx.interInfo.sender) {
      const sender = tx.interInfo.sender;
      arbitragerFrequency[sender] = (arbitragerFrequency[sender] || 0) + 1;
    } else if (tx.from) {
      // 如果没有interInfo，使用交易发送者地址
      arbitragerFrequency[tx.from] = (arbitragerFrequency[tx.from] || 0) + 1;
    }
  });
  
  return {
    totalArbitrageTxs,
    typeDistribution,
    profitTokenDistribution,
    swapCountDistribution,
    protocolFrequency,
    arbitragerFrequency
  };
}

// 2. 分析潜在触发交易画像 - 考虑新的数据结构
function analyzeTriggerSwapRelations(relations: SwapArbitrageRelation[]) {
  // 提取所有潜在触发交易
  const allTriggers: {
    swapPoolAddress: string,
    swapProtocol: string,
    timeDifference?: number
  }[] = [];
  
  relations.forEach(relation => {
    if (relation.potentialTriggerSwaps && relation.potentialTriggerSwaps.length > 0) {
      allTriggers.push(...relation.potentialTriggerSwaps);
    }
  });
  
  // 分析出现频率最高的池子
  const poolFrequency = allTriggers.reduce((acc, trigger) => {
    if (trigger.swapPoolAddress) {
      acc[trigger.swapPoolAddress] = (acc[trigger.swapPoolAddress] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // 触发交易的timeDifference分布
  const timeDifferenceDistribution: Record<string, number> = {};
  allTriggers.forEach(trigger => {
    if (trigger.timeDifference !== undefined) {
      // 创建时间区间：0-1秒，1-2秒，2-5秒，5-10秒，>10秒
      let timeRange = '';
      if (trigger.timeDifference <= 1) timeRange = '0-1s';
      else if (trigger.timeDifference <= 2) timeRange = '1-2s';
      else if (trigger.timeDifference <= 5) timeRange = '2-5s';
      else if (trigger.timeDifference <= 10) timeRange = '5-10s';
      else timeRange = '>10s';
      
      timeDifferenceDistribution[timeRange] = (timeDifferenceDistribution[timeRange] || 0) + 1;
    }
  });
  
  // 触发交易的protocol分布
  const triggerProtocolDistribution = allTriggers.reduce((acc, trigger) => {
    if (trigger.swapProtocol) {
      acc[trigger.swapProtocol] = (acc[trigger.swapProtocol] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  return {
    poolFrequency,
    timeDifferenceDistribution,
    triggerProtocolDistribution,
    allTriggers // 返回所有触发器数据用于可视化
  };
}

// 3. 微观逐笔追踪分析 - 适应新的数据结构
function traceTriggerCandidates(arb: ArbitrageTx, swapTxs: SimpleSwapTx[]) {
  // 只考虑可能的触发交易（transactionIndex小于套利交易的）
  const potentialTriggers = swapTxs.filter(swap => swap.transactionIndex < arb.transactionIndex);
  
  // 每个套利交易的首个swap
  const firstArbSwap = arb.swapEvents?.[0];
  
  if (!firstArbSwap) {
    return { arbTxHash: arb.txHash, hasCausality: false };
  }
  
  // 找到与套利首个swap使用相同池子的交易
  const samePoolTriggers = potentialTriggers.filter(swap => 
    swap.poolAddress === firstArbSwap.poolAddress
  );
  
  // 找到与套利首个swap反向操作的交易（可能创造套利空间）
  const reverseDirTriggers = samePoolTriggers.filter(swap => 
    swap.tokenIn === firstArbSwap.tokenOut && 
    swap.tokenOut === firstArbSwap.tokenIn
  );
  
  // 找到tokenOut与套利的tokenIn相近的交易
  const tokenMatchTriggers = potentialTriggers.filter(swap => 
    swap.tokenOut === firstArbSwap.tokenIn
  );
  
  return {
    arbTxHash: arb.txHash,
    hasCausality: samePoolTriggers.length > 0,
    samePoolCount: samePoolTriggers.length,
    reverseDirCount: reverseDirTriggers.length,
    tokenMatchCount: tokenMatchTriggers.length,
    // 最接近的触发交易（按时间顺序）
    closestTrigger: samePoolTriggers.length > 0 ? 
      samePoolTriggers[samePoolTriggers.length - 1].txHash : null
  };
}

// 主分析函数
function analyzeArbitrageSwapRelation(data: BlockAnalysis) {
  const arbitrageTxs = data.arbitrageTxs || [];
  const simpleSwapTxs = data.simpleSwapTxs || [];
  const relations = data.swapArbitrageRelations || [];

  // 1. 统计套利结构宏观指标
  const summary = summaryStats(arbitrageTxs);

  // 2. 分析触发交易画像
  const triggerAnalysis = analyzeTriggerSwapRelations(relations);

  // 3. 微观逐笔追踪分析
  const causalityTraces = arbitrageTxs.map(arb => 
    traceTriggerCandidates(arb, simpleSwapTxs)
  );
  
  return {
    summary,
    triggerAnalysis,
    causalityTraces
  };
}

// ✅ 可视化函数 - 触发协议分布 / 延迟分布
async function visualizeTriggerStatistics(relations: SwapArbitrageRelation[]) {
  console.log("开始生成可视化图表...");
  try {
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600 });

    const protocolCount: Record<string, number> = {};
    const timeDiffs: number[] = [];

    // 提取所有触发交易的数据
    for (const rel of relations) {
      if (rel.potentialTriggerSwaps) {
        for (const trigger of rel.potentialTriggerSwaps) {
          // 使用正确的字段名 swapProtocol
          if (trigger.swapProtocol) {
            protocolCount[trigger.swapProtocol] = (protocolCount[trigger.swapProtocol] || 0) + 1;
          }
          if (trigger.timeDifference !== undefined) {
            timeDiffs.push(trigger.timeDifference);
          }
        }
      }
    }

    console.log(`收集到 ${Object.keys(protocolCount).length} 个不同协议的触发交易`);
    console.log(`协议统计: ${JSON.stringify(protocolCount)}`);
    console.log(`收集到 ${timeDiffs.length} 个时间差数据`);

    // 绘制协议分布柱状图
    const protocolChart = await chartJSNodeCanvas.renderToBuffer({
      type: "bar",
      data: {
        labels: Object.keys(protocolCount),
        datasets: [
          {
            label: "Trigger Frequency by Protocol",
            data: Object.values(protocolCount),
            backgroundColor: "rgba(54, 162, 235, 0.6)"
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Frequency'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Protocol'
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: "Trigger Frequency per Protocol",
            font: {
              size: 18
            }
          },
          legend: {
            display: true,
            position: 'top'
          }
        }
      }
    });

    const protocolChartPath = path.join(OUTPUT_DIR, 'trigger_protocols.png');
    writeFileSync(protocolChartPath, protocolChart);
    console.log(`协议分布图表已保存到: ${protocolChartPath}`);

    // 绘制触发延迟直方图
    if (timeDiffs.length > 0) {
      const delayBins: number[] = Array(20).fill(0);
      for (const diff of timeDiffs) {
        const bin = Math.min(Math.floor(diff / 5), 19);
        delayBins[bin]++;
      }

      // 只保留有数据的bin，使图表更紧凑
      const nonZeroBins = delayBins.map((count, i) => ({ 
        label: `${i * 5}-${i * 5 + 4}`, 
        count 
      })).filter(bin => bin.count > 0);

      const delayChart = await chartJSNodeCanvas.renderToBuffer({
        type: "bar",
        data: {
          labels: nonZeroBins.map(bin => bin.label),
          datasets: [
            {
              label: "Trigger Delay (Tx Index Difference)",
              data: nonZeroBins.map(bin => bin.count),
              backgroundColor: "rgba(255, 99, 132, 0.6)"
            },
          ],
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Frequency'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Delay (Transaction Index Difference)'
              }
            }
          },
          plugins: {
            title: {
              display: true,
              text: "Swap Trigger Delay Histogram",
              font: {
                size: 18
              }
            },
            legend: {
              display: true,
              position: 'top'
            }
          }
        }
      });

      const delayChartPath = path.join(OUTPUT_DIR, 'trigger_delay_histogram.png');
      writeFileSync(delayChartPath, delayChart);
      console.log(`延迟分布图表已保存到: ${delayChartPath}`);
    } else {
      console.log("没有时间差数据，跳过延迟直方图绘制");
    }
  } catch (error) {
    console.error("生成可视化图表时出错:", error);
  }
}

// 分析合并的数据
function analyzeMergedData() {
  // 读取合并的数据文件
  console.log(`读取合并的数据文件: ${MERGED_DATA_FILE}`);
  
  try {
    const mergedDataStr = readFileSync(MERGED_DATA_FILE, 'utf8');
    const mergedData: MergedData = JSON.parse(mergedDataStr);
    
    console.log(`成功读取合并数据, 包含 ${mergedData.totalBlocks} 个区块从 ${mergedData.blockRange.start} 到 ${mergedData.blockRange.end}`);
    
    // 合并结果
    const allResults = {
      totalBlocksAnalyzed: 0,
      blockRange: { start: Infinity, end: 0 },
      aggregateSummary: {
        totalArbitrageTxs: 0,
        typeDistribution: {} as Record<string, number>,
        profitTokenDistribution: {} as Record<string, number>,
        swapCountDistribution: {} as Record<number, number>,
        protocolFrequency: {} as Record<string, number>,
        arbitragerFrequency: {} as Record<string, number>
      },
      aggregateTriggerAnalysis: {
        poolFrequency: {} as Record<string, number>,
        timeDifferenceDistribution: {} as Record<string, number>,
        triggerProtocolDistribution: {} as Record<string, number>
      },
      causalityStats: {
        totalArbitrages: 0,
        withCausality: 0,
        withReverseDir: 0,
        withTokenMatch: 0,
        causalityPercentage: 0,
        reverseDirPercentage: 0,
        tokenMatchPercentage: 0
      },
      blockAnalysis: {} as Record<number, any>
    };
    
    // 收集所有区块的SwapArbitrageRelation用于可视化
    const allRelations: SwapArbitrageRelation[] = [];
    
    // 处理每个区块
    for (const [blockNumberStr, blockData] of Object.entries(mergedData.blockAnalysis)) {
      try {
        const blockNumber = parseInt(blockNumberStr);
        console.log(`分析区块 ${blockNumber}`);
        
        // 收集此区块的关系数据用于可视化
        if (blockData.swapArbitrageRelations) {
          allRelations.push(...blockData.swapArbitrageRelations);
        }
        
        // 更新区块范围
        allResults.blockRange.start = Math.min(allResults.blockRange.start, blockNumber);
        allResults.blockRange.end = Math.max(allResults.blockRange.end, blockNumber);
        
        // 分析当前区块
        const blockAnalysis = analyzeArbitrageSwapRelation(blockData);
        allResults.blockAnalysis[blockNumber] = blockAnalysis;
        
        // 更新统计信息
        allResults.totalBlocksAnalyzed++;
        
        // 更新总体统计数据
        const summary = blockAnalysis.summary;
        allResults.aggregateSummary.totalArbitrageTxs += summary.totalArbitrageTxs;
        
        // 更新类型分布
        Object.entries(summary.typeDistribution).forEach(([type, count]) => {
          allResults.aggregateSummary.typeDistribution[type] = 
            (allResults.aggregateSummary.typeDistribution[type] || 0) + count;
        });
        
        // 更新盈利代币分布
        Object.entries(summary.profitTokenDistribution).forEach(([token, count]) => {
          allResults.aggregateSummary.profitTokenDistribution[token] = 
            (allResults.aggregateSummary.profitTokenDistribution[token] || 0) + count;
        });
        
        // 更新swap次数分布
        Object.entries(summary.swapCountDistribution).forEach(([count, frequency]) => {
          allResults.aggregateSummary.swapCountDistribution[Number(count)] = 
            (allResults.aggregateSummary.swapCountDistribution[Number(count)] || 0) + frequency;
        });
        
        // 更新协议频率
        Object.entries(summary.protocolFrequency).forEach(([protocol, frequency]) => {
          allResults.aggregateSummary.protocolFrequency[protocol] = 
            (allResults.aggregateSummary.protocolFrequency[protocol] || 0) + frequency;
        });
        
        // 更新地址频率
        Object.entries(summary.arbitragerFrequency).forEach(([address, frequency]) => {
          allResults.aggregateSummary.arbitragerFrequency[address] = 
            (allResults.aggregateSummary.arbitragerFrequency[address] || 0) + frequency;
        });
        
        // 更新触发分析数据
        const trigger = blockAnalysis.triggerAnalysis;
        
        // 池子频率
        Object.entries(trigger.poolFrequency).forEach(([pool, count]) => {
          allResults.aggregateTriggerAnalysis.poolFrequency[pool] = 
            (allResults.aggregateTriggerAnalysis.poolFrequency[pool] || 0) + count;
        });
        
        // 时间差分布
        Object.entries(trigger.timeDifferenceDistribution).forEach(([range, count]) => {
          allResults.aggregateTriggerAnalysis.timeDifferenceDistribution[range] = 
            (allResults.aggregateTriggerAnalysis.timeDifferenceDistribution[range] || 0) + count;
        });
        
        // 协议分布
        Object.entries(trigger.triggerProtocolDistribution).forEach(([protocol, count]) => {
          allResults.aggregateTriggerAnalysis.triggerProtocolDistribution[protocol] = 
            (allResults.aggregateTriggerAnalysis.triggerProtocolDistribution[protocol] || 0) + count;
        });
        
        // 更新因果关系统计
        blockAnalysis.causalityTraces.forEach(trace => {
          allResults.causalityStats.totalArbitrages++;
          if (trace.hasCausality) allResults.causalityStats.withCausality++;
          if (trace.reverseDirCount && trace.reverseDirCount > 0) allResults.causalityStats.withReverseDir++;
          if (trace.tokenMatchCount && trace.tokenMatchCount > 0) allResults.causalityStats.withTokenMatch++;
        });
        
      } catch (error) {
        console.error(`处理区块 ${blockNumberStr} 时出错:`, error);
      }
    }
    
    // 计算百分比，便于分析
    if (allResults.causalityStats.totalArbitrages > 0) {
      allResults.causalityStats.causalityPercentage = 
        allResults.causalityStats.withCausality / allResults.causalityStats.totalArbitrages;
      allResults.causalityStats.reverseDirPercentage = 
        allResults.causalityStats.withReverseDir / allResults.causalityStats.totalArbitrages;
      allResults.causalityStats.tokenMatchPercentage = 
        allResults.causalityStats.withTokenMatch / allResults.causalityStats.totalArbitrages;
    }
    
    // 生成可视化图表
    if (allRelations.length > 0) {
      console.log(`收集到 ${allRelations.length} 个套利-交易关系数据，准备生成可视化`);
      // 需要在这里调用可视化函数
      visualizeTriggerStatistics(allRelations)
        .then(() => console.log("可视化图表生成完成"))
        .catch(err => console.error("可视化生成错误:", err));
    } else {
      console.log("没有收集到套利-交易关系数据，跳过可视化");
    }
    
    return allResults;
    
  } catch (error) {
    console.error(`读取或分析合并数据时出错:`, error);
    throw error;
  }
}

// 主函数
async function main() {
  console.log('开始分析套利与交易关系...');
  
  // 检查合并文件是否存在
  if (!existsSync(MERGED_DATA_FILE)) {
    console.error(`错误: 合并数据文件不存在: ${MERGED_DATA_FILE}`);
    return;
  }
  
  const allResults = analyzeMergedData();
  
  // 创建输出文件名
  const outputFile = path.join(OUTPUT_DIR, `arbitrage_relation_analysis.json`);
  
  // 保存分析结果
  const replacer = (key: string, value: any) => {
    // 处理BigInt序列化
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  };
  
  writeFileSync(
    outputFile, 
    JSON.stringify(allResults, replacer, 2)
  );
  
  // 创建摘要文件，只包含总体统计数据
  const summaryFile = path.join(OUTPUT_DIR, `arbitrage_relation_summary.json`);
  
  // 从完整结果中移除详细的区块分析，只保留汇总数据
  const { blockAnalysis, ...summaryData } = allResults;
  
  writeFileSync(
    summaryFile,
    JSON.stringify(summaryData, replacer, 2)
  );
  
  console.log(`分析完成! 完整结果保存在: ${outputFile}`);
  console.log(`摘要结果保存在: ${summaryFile}`);
  console.log(`分析了 ${allResults.totalBlocksAnalyzed} 个区块，从 ${allResults.blockRange.start} 到 ${allResults.blockRange.end}`);
  console.log(`发现 ${allResults.aggregateSummary.totalArbitrageTxs} 个套利交易，其中 ${allResults.causalityStats.withCausality} 个有潜在的触发关系 (${(allResults.causalityStats.causalityPercentage * 100).toFixed(2)}%)`);
}

main();