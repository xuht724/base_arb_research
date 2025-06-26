import fs from 'fs';
import path from 'path';
import { analyzeArbitrageInput } from '../src/lib/arbAnalyzer/inputAnalyzer';
import { ArbitrageCycle, BlockAnalysisResult } from '../src/lib/chain/types';
import { replacer } from 'src/lib/utils';
import { createPublicClient, formatEther, http } from 'viem';
import { ChainHelper } from '../src/lib/chain/helper';
import { base } from 'viem/chains';

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const ANALYZE_SINGLE_BATCH = false; // 设置为true时只分析第一个batch文件
const TEST_MODE = process.argv.includes('--test');
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

function formatGasCost(gasCost: bigint): string {
  return formatEther(gasCost);
}

function formatGasUsed(gasUsed: bigint): string {
  return gasUsed.toString();
}

interface SwapEvent {
  poolAddress: string;
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  sender: string;
  recipient: string;
  ethFlag: boolean;
}

interface InputAnalysis {
  flags: {
    poolsMatch: boolean;
    tokensMatch: boolean;
    amountsMatch: boolean;
  };
}

interface ArbitrageInfo {
  type: string;
  isBackrun: boolean;
  arbitrageCycles: Array<{
    edges: Array<{
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      amountOut: string;
      poolAddress: string;
      protocol: string;
    }>;
    profitToken: string;
    profitAmount: string;
    tokenChanges: Record<string, string>;
  }>;
  profit: {
    token: string;
    amount: string;
  };
}

interface Transaction {
  hash: string;
  index: number;
  from: string;
  input: string;
  to: string;
  gasPrice: string;
  gasUsed: string;
  nonce: string;
  swapEvents: SwapEvent[];
  inputAnalysis: InputAnalysis;
  arbitrageInfo: ArbitrageInfo;
}

interface BatchData {
  startBlock: number;
  endBlock: number;
  arbitrageTransactions: {
    blockNumber: number;
    timestamp: string;
    transaction: Transaction;
  }[];
}

interface AddressStats {
  totalTransactions: number;
  protocols: Set<string>;
  totalGasCost: bigint;
  totalProfit: bigint;
  profitableTransactions: number;
  totalGasUsed: bigint;
  fromAddresses: Map<string, {
    arbitrageCount: number;
    totalTransactions: number;
    arbitrageRate: number;
    flagStats: {
      poolsMatch: number;
      tokensMatch: number;
      amountsMatch: number;
      poolsAndTokensMatch: number;
      poolsAndAmountsMatch: number;
      tokensAndAmountsMatch: number;
      allMatch: number;
      allNotMatch: number;
    };
    profitStats: {
      totalProfit: bigint;
      averageProfit: bigint;
      totalGasCost: bigint;
      averageGasCost: bigint;
      totalGasUsed: bigint;
      averageGasUsed: bigint;
    };
  }>;
  beginTransactions: number;
  interTransactions: number;
  cyclesStats: {
    totalCyclesCount: number;  // 所有交易中的 cycles 总数
    totalEdgesCount: number;   // 所有 edges 的总数
    cyclesPerTxDistribution: Map<number, number>;  // 每个交易中 cycles 数量的分布
    edgesPerCycleDistribution: Map<number, number>;  // 每个 cycle 中 edges 数量的分布
  };
  topCyclesTransactions: Array<{
    originalTx: Transaction;
    blockNumber: number;
    timestamp: string;
    cyclesCount: number;
    profit: bigint;
    gasCost: bigint;
    gasUsed: bigint;
  }>;
  flagStats: {
    poolsMatch: number;
    tokensMatch: number;
    amountsMatch: number;
    poolsAndTokensMatch: number;
    poolsAndAmountsMatch: number;
    tokensAndAmountsMatch: number;
    allMatch: number;
    allNotMatch: number;
  };
  topTransactions: Array<{
    originalTx: Transaction;
    blockNumber: number;
    timestamp: string;
    profit: bigint;
    gasCost: bigint;
    gasUsed: bigint;
  }>;
  topBeginTransactions: Array<{
    originalTx: Transaction;
    blockNumber: number;
    timestamp: string;
    profit: bigint;
    gasCost: bigint;
    gasUsed: bigint;
  }>;
  topInterTransactions: Array<{
    originalTx: Transaction;
    blockNumber: number;
    timestamp: string;
    profit: bigint;
    gasCost: bigint;
    gasUsed: bigint;
  }>;
}

async function analyzeBatches() {
  const RPC_URL = process.env.BASE_HTTP_URL!;
  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL)
  });
  const batchesDir = path.join(__dirname, '../data/arbitrage_analysis_full/batches');
  const batchFiles = fs.readdirSync(batchesDir)
    .filter(file => file.endsWith('.json'))
    .sort();

  if (TEST_MODE) {
    console.log('Running in test mode, analyzing only 5 batches...');
    batchFiles.splice(1);
  }

  const addressStats: Record<string, AddressStats> = {};
  let startBlockNumber = Infinity;
  let endBlockNumber = 0;

  // 在处理每个batch文件之前，添加一个Map来存储每个地址的nonce信息
  const addressNonceMap = new Map<string, {
    startNonce: number | null;
    endNonce: number | null;
  }>();

  // 处理每个batch文件
  for (const file of batchFiles) {
    console.log(`Processing ${file}...`);
    const batchData: BatchData = JSON.parse(
      fs.readFileSync(path.join(batchesDir, file), 'utf-8')
    );

    // 更新区块范围
    startBlockNumber = Math.min(startBlockNumber, batchData.startBlock);
    endBlockNumber = Math.max(endBlockNumber, batchData.endBlock);

    // 收集所有from地址
    for (const arbTx of batchData.arbitrageTransactions) {
      const fromAddress = arbTx.transaction.from.toLowerCase();
      if (!addressNonceMap.has(fromAddress)) {
        addressNonceMap.set(fromAddress, {
          startNonce: null,
          endNonce: null
        });
      }
    }

    for (const arbTx of batchData.arbitrageTransactions) {
      const tx = arbTx.transaction;
      
      // 只处理WETH利润的交易
      if (tx.arbitrageInfo.profit.token.toLowerCase() !== WETH_ADDRESS.toLowerCase()) {
        continue;
      }

      const toAddress = tx.to.toLowerCase();
      const fromAddress = tx.from.toLowerCase();

      if (!addressStats[toAddress]) {
        addressStats[toAddress] = {
          totalTransactions: 0,
          protocols: new Set(),
          totalGasCost: BigInt(0),
          totalProfit: BigInt(0),
          profitableTransactions: 0,
          totalGasUsed: BigInt(0),
          fromAddresses: new Map(),
          beginTransactions: 0,
          interTransactions: 0,
          cyclesStats: {
            totalCyclesCount: 0,
            totalEdgesCount: 0,
            cyclesPerTxDistribution: new Map(),
            edgesPerCycleDistribution: new Map()
          },
          topCyclesTransactions: [],
          flagStats: {
            poolsMatch: 0,
            tokensMatch: 0,
            amountsMatch: 0,
            poolsAndTokensMatch: 0,
            poolsAndAmountsMatch: 0,
            tokensAndAmountsMatch: 0,
            allMatch: 0,
            allNotMatch: 0
          },
          topTransactions: [],
          topBeginTransactions: [],
          topInterTransactions: []
        };
      }

      const stats = addressStats[toAddress];
      stats.totalTransactions++;

      // 更新from地址统计
      if (!stats.fromAddresses.has(fromAddress)) {
        stats.fromAddresses.set(fromAddress, {
          arbitrageCount: 0,
          totalTransactions: 0,
          arbitrageRate: 0,
          flagStats: {
            poolsMatch: 0,
            tokensMatch: 0,
            amountsMatch: 0,
            poolsAndTokensMatch: 0,
            poolsAndAmountsMatch: 0,
            tokensAndAmountsMatch: 0,
            allMatch: 0,
            allNotMatch: 0
          },
          profitStats: {
            totalProfit: BigInt(0),
            averageProfit: BigInt(0),
            totalGasCost: BigInt(0),
            averageGasCost: BigInt(0),
            totalGasUsed: BigInt(0),
            averageGasUsed: BigInt(0)
          }
        });
      }

      const fromStats = stats.fromAddresses.get(fromAddress)!;
      fromStats.arbitrageCount++;

      // 更新flag统计
      const { poolsMatch, tokensMatch, amountsMatch } = tx.inputAnalysis.flags;
      if (poolsMatch && !tokensMatch && !amountsMatch) {
        fromStats.flagStats.poolsMatch++;
        stats.flagStats.poolsMatch++;
      }
      if (tokensMatch && !poolsMatch && !amountsMatch) {
        fromStats.flagStats.tokensMatch++;
        stats.flagStats.tokensMatch++;
      }
      if (amountsMatch && !poolsMatch && !tokensMatch) {
        fromStats.flagStats.amountsMatch++;
        stats.flagStats.amountsMatch++;
      }
      if (poolsMatch && tokensMatch && !amountsMatch) {
        fromStats.flagStats.poolsAndTokensMatch++;
        stats.flagStats.poolsAndTokensMatch++;
      }
      if (poolsMatch && amountsMatch && !tokensMatch) {
        fromStats.flagStats.poolsAndAmountsMatch++;
        stats.flagStats.poolsAndAmountsMatch++;
      }
      if (tokensMatch && amountsMatch && !poolsMatch) {
        fromStats.flagStats.tokensAndAmountsMatch++;
        stats.flagStats.tokensAndAmountsMatch++;
      }
      if (poolsMatch && tokensMatch && amountsMatch) {
        fromStats.flagStats.allMatch++;
        stats.flagStats.allMatch++;
      } else if (!poolsMatch && !tokensMatch && !amountsMatch) {
        fromStats.flagStats.allNotMatch++;
        stats.flagStats.allNotMatch++;
      }

      // 更新profit和gas统计
      const profit = BigInt(tx.arbitrageInfo.profit.amount);
      const gasUsed = BigInt(tx.gasUsed);
      const gasCost = gasUsed * BigInt(tx.gasPrice);

      fromStats.profitStats.totalProfit += profit;
      fromStats.profitStats.totalGasCost += gasCost;
      fromStats.profitStats.totalGasUsed += gasUsed;

      // 收集协议信息
      tx.swapEvents.forEach(event => {
        if (event.protocol !== 'Unknown') {
          stats.protocols.add(event.protocol);
        }
      });

      // 计算gas成本和使用量
      stats.totalGasCost += gasCost;
      stats.totalGasUsed += gasUsed;

      // 计算利润
      const profitFrom = BigInt(tx.arbitrageInfo.profit.amount);
      stats.totalProfit += profitFrom;

      if (profitFrom > gasCost) {
        stats.profitableTransactions++;
      }

      // 更新top交易
      stats.topTransactions.push({
        originalTx: tx,
        blockNumber: arbTx.blockNumber,
        timestamp: arbTx.timestamp,
        profit: profitFrom,
        gasCost,
        gasUsed
      });

      // 更新交易类型统计
      if (tx.arbitrageInfo.type === 'begin') {
        stats.beginTransactions++;
        stats.topBeginTransactions.push({
          originalTx: tx,
          blockNumber: arbTx.blockNumber,
          timestamp: arbTx.timestamp,
          profit: profitFrom,
          gasCost,
          gasUsed
        });
      } else if (tx.arbitrageInfo.type === 'inter') {
        stats.interTransactions++;
        stats.topInterTransactions.push({
          originalTx: tx,
          blockNumber: arbTx.blockNumber,
          timestamp: arbTx.timestamp,
          profit: profitFrom,
          gasCost,
          gasUsed
        });
      }

      // 在处理交易时添加 cycles 统计
      const cyclesCount = tx.arbitrageInfo.arbitrageCycles.length;
      stats.cyclesStats.totalCyclesCount += cyclesCount;

      // 更新每个交易中 cycles 数量的分布
      const currentCyclesCount = stats.cyclesStats.cyclesPerTxDistribution.get(cyclesCount) || 0;
      stats.cyclesStats.cyclesPerTxDistribution.set(cyclesCount, currentCyclesCount + 1);

      // 添加当前交易到 topCyclesTransactions
      stats.topCyclesTransactions.push({
        originalTx: tx,
        blockNumber: arbTx.blockNumber,
        timestamp: arbTx.timestamp,
        cyclesCount,
        profit: profitFrom,
        gasCost,
        gasUsed
      });

      // 统计每个 cycle 中的 edges 数量
      tx.arbitrageInfo.arbitrageCycles.forEach(cycle => {
        const edgesCount = cycle.edges.length;
        stats.cyclesStats.totalEdgesCount += edgesCount;
        
        // 更新每个 cycle 中 edges 数量的分布
        const currentEdgesCount = stats.cyclesStats.edgesPerCycleDistribution.get(edgesCount) || 0;
        stats.cyclesStats.edgesPerCycleDistribution.set(edgesCount, currentEdgesCount + 1);
      });
    }
  }

  // 在最后统一获取nonce信息
  console.log('\n开始获取地址 nonce 信息...');
  console.log(`区块范围: ${startBlockNumber} - ${endBlockNumber}`);
  console.log(`需要处理的地址数量: ${addressNonceMap.size}`);

  const BATCH_SIZE = 10; // 每批处理的地址数量
  const addresses = Array.from(addressNonceMap.keys());
  let processedCount = 0;

  // 将地址分批处理
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batchAddresses = addresses.slice(i, i + BATCH_SIZE);
    const promises = batchAddresses.map(async (address) => {
      try {
        const [startNonce, endNonce] = await Promise.all([
          client.getTransactionCount({
            address: address as `0x${string}`,
            blockNumber: BigInt(startBlockNumber)
          }),
          client.getTransactionCount({
            address: address as `0x${string}`,
            blockNumber: BigInt(endBlockNumber)
          })
        ]);

        const nonceInfo = addressNonceMap.get(address)!;
        nonceInfo.startNonce = Number(startNonce);
        nonceInfo.endNonce = Number(endNonce);
        return true;
      } catch (error) {
        console.error(`获取地址 ${address} 的 nonce 信息失败:`, error);
        return false;
      }
    });

    // 等待当前批次的所有请求完成
    const results = await Promise.all(promises);
    processedCount += batchAddresses.length;
    console.log(`已处理 ${processedCount}/${addressNonceMap.size} 个地址 (成功: ${results.filter(Boolean).length}/${batchAddresses.length})`);
  }

  console.log('\n开始更新地址统计信息...');
  // 更新所有地址的统计信息
  for (const [address, stats] of Object.entries(addressStats)) {
    for (const [fromAddress, fromStats] of stats.fromAddresses) {
      const nonceInfo = addressNonceMap.get(fromAddress);
      if (nonceInfo && nonceInfo.startNonce !== null && nonceInfo.endNonce !== null) {
        fromStats.totalTransactions = nonceInfo.endNonce - nonceInfo.startNonce + 1;
        fromStats.arbitrageRate = fromStats.arbitrageCount / fromStats.totalTransactions;
      }

      // 计算平均值
      if (fromStats.arbitrageCount > 0) {
        fromStats.profitStats.averageProfit = fromStats.profitStats.totalProfit / BigInt(fromStats.arbitrageCount);
        fromStats.profitStats.averageGasCost = fromStats.profitStats.totalGasCost / BigInt(fromStats.arbitrageCount);
        fromStats.profitStats.averageGasUsed = fromStats.profitStats.totalGasUsed / BigInt(fromStats.arbitrageCount);
      }
    }
  }

  console.log('开始生成报告...');
  // 生成主分析报告
  const report = {
    timestamp: new Date().toISOString(),
    testMode: TEST_MODE,
    startBlockNumber,
    endBlockNumber,
    totalAddresses: Object.keys(addressStats).length,
    globalStats: {
      flagStats: Object.entries(addressStats).reduce((acc, [, stats]) => {
        acc.poolsMatch += stats.flagStats.poolsMatch;
        acc.tokensMatch += stats.flagStats.tokensMatch;
        acc.amountsMatch += stats.flagStats.amountsMatch;
        acc.poolsAndTokensMatch += stats.flagStats.poolsAndTokensMatch;
        acc.poolsAndAmountsMatch += stats.flagStats.poolsAndAmountsMatch;
        acc.tokensAndAmountsMatch += stats.flagStats.tokensAndAmountsMatch;
        acc.allMatch += stats.flagStats.allMatch;
        acc.allNotMatch += stats.flagStats.allNotMatch;
        return acc;
      }, {
        poolsMatch: 0,
        tokensMatch: 0,
        amountsMatch: 0,
        poolsAndTokensMatch: 0,
        poolsAndAmountsMatch: 0,
        tokensAndAmountsMatch: 0,
        allMatch: 0,
        allNotMatch: 0
      })
    },
    topAddresses: Object.entries(addressStats)
      .sort(([, a], [, b]) => Number(b.totalProfit - a.totalProfit))
      .map(([address, stats]) => ({
        address,
        totalTransactions: stats.totalTransactions,
        protocols: Array.from(stats.protocols),
        cyclesStats: {
          averageCyclesPerTx: (stats.cyclesStats.totalCyclesCount / stats.totalTransactions).toFixed(2),
          averageEdgesPerCycle: (stats.cyclesStats.totalEdgesCount / stats.cyclesStats.totalCyclesCount).toFixed(2),
          totalCyclesCount: stats.cyclesStats.totalCyclesCount,
          totalEdgesCount: stats.cyclesStats.totalEdgesCount,
          cyclesPerTxDistribution: Object.fromEntries(stats.cyclesStats.cyclesPerTxDistribution),
          edgesPerCycleDistribution: Object.fromEntries(stats.cyclesStats.edgesPerCycleDistribution)
        },
        gasStats: {
          totalGasUsed: formatGasUsed(stats.totalGasUsed),
          averageGasUsed: formatGasUsed(stats.totalGasUsed / BigInt(stats.totalTransactions)),
          totalGasCost: formatGasCost(stats.totalGasCost),
          averageGasCost: formatGasCost(stats.totalGasCost / BigInt(stats.totalTransactions))
        },
        profitStats: {
          totalProfit: formatEther(stats.totalProfit),
          averageProfit: formatEther(stats.totalProfit / BigInt(stats.totalTransactions)),
          profitToCostRatio: Number(stats.totalProfit * BigInt(100) / stats.totalGasCost).toFixed(2) + '%'
        },
        profitableRate: (stats.profitableTransactions / stats.totalTransactions * 100).toFixed(2) + '%',
        fromAddresses: Object.fromEntries(
          Array.from(stats.fromAddresses.entries()).map(([addr, data]) => [
            addr,
            {
              arbitrageCount: data.arbitrageCount,
              totalTransactions: data.totalTransactions,
              arbitrageRate: data.arbitrageRate.toFixed(4),
              flagStats: data.flagStats,
              profitStats: {
                totalProfit: formatEther(data.profitStats.totalProfit),
                averageProfit: formatEther(data.profitStats.averageProfit),
                totalGasCost: formatGasCost(data.profitStats.totalGasCost),
                averageGasCost: formatGasCost(data.profitStats.averageGasCost),
                totalGasUsed: formatGasUsed(data.profitStats.totalGasUsed),
                averageGasUsed: formatGasUsed(data.profitStats.averageGasUsed)
              }
            }
          ])
        ),
        transactionTypes: {
          begin: {
            count: stats.beginTransactions,
            percentage: (stats.beginTransactions / stats.totalTransactions * 100).toFixed(2) + '%'
          },
          inter: {
            count: stats.interTransactions,
            percentage: (stats.interTransactions / stats.totalTransactions * 100).toFixed(2) + '%'
          }
        },
        flagStats: stats.flagStats,
        topTransactions: stats.topTransactions
          .sort((a, b) => Number(b.profit - a.profit))
          .slice(0, 5)
          .map(tx => ({
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp,
            hash: tx.originalTx.hash,
            profit: formatEther(tx.profit),
            gasCost: formatGasCost(tx.gasCost),
            gasUsed: formatGasUsed(tx.gasUsed),
            netProfit: formatEther(tx.profit - tx.gasCost),
            inputAnalysis: tx.originalTx.inputAnalysis,
            arbitrageInfo: tx.originalTx.arbitrageInfo
          })),
        topCyclesTransactions: stats.topCyclesTransactions
          .sort((a, b) => Number(b.profit - a.profit))
          .slice(0, 5)
          .map(tx => ({
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp,
            hash: tx.originalTx.hash,
            cyclesCount: tx.cyclesCount,
            profit: formatEther(tx.profit),
            gasCost: formatGasCost(tx.gasCost),
            gasUsed: formatGasUsed(tx.gasUsed),
            netProfit: formatEther(tx.profit - tx.gasCost),
            inputAnalysis: tx.originalTx.inputAnalysis,
            arbitrageInfo: tx.originalTx.arbitrageInfo
          }))
      })),
  };

  // 生成 inter 主导地址的简化分析报告
  const interDominantAddresses = Object.entries(addressStats)
    .filter(([, stats]) => stats.interTransactions > stats.beginTransactions)
    .sort(([, a], [, b]) => Number(b.totalProfit - a.totalProfit))
    .slice(0, 20);

  const interReport = {
    timestamp: new Date().toISOString(),
    testMode: TEST_MODE,
    startBlockNumber,
    endBlockNumber,
    totalAddresses: interDominantAddresses.length,
    globalStats: {
      flagStats: interDominantAddresses.reduce((acc, [, stats]) => {
        acc.poolsMatch += stats.flagStats.poolsMatch;
        acc.tokensMatch += stats.flagStats.tokensMatch;
        acc.amountsMatch += stats.flagStats.amountsMatch;
        acc.poolsAndTokensMatch += stats.flagStats.poolsAndTokensMatch;
        acc.poolsAndAmountsMatch += stats.flagStats.poolsAndAmountsMatch;
        acc.tokensAndAmountsMatch += stats.flagStats.tokensAndAmountsMatch;
        acc.allMatch += stats.flagStats.allMatch;
        acc.allNotMatch += stats.flagStats.allNotMatch;
        return acc;
      }, {
        poolsMatch: 0,
        tokensMatch: 0,
        amountsMatch: 0,
        poolsAndTokensMatch: 0,
        poolsAndAmountsMatch: 0,
        tokensAndAmountsMatch: 0,
        allMatch: 0,
        allNotMatch: 0
      })
    },
    topAddresses: interDominantAddresses.map(([address, stats]) => ({
      address,
      totalTransactions: stats.totalTransactions,
      protocols: Array.from(stats.protocols),
      gasStats:{
        totalGasUsed: formatGasUsed(stats.totalGasUsed),
        averageGasUsed: formatGasUsed(stats.totalGasUsed / BigInt(stats.totalTransactions)),
        totalGasCost: formatGasCost(stats.totalGasCost),
        averageGasCost: formatGasCost(stats.totalGasCost / BigInt(stats.totalTransactions))
      },
      profitStats: {
        totalProfit: formatEther(stats.totalProfit),
        averageProfit: formatEther(stats.totalProfit / BigInt(stats.totalTransactions)),
        profitToCostRatio: Number(stats.totalProfit * BigInt(100) / stats.totalGasCost).toFixed(2) + '%'
      },
      profitableRate: (stats.profitableTransactions / stats.totalTransactions * 100).toFixed(2) + '%',
      fromAddresses: Object.fromEntries(
        Array.from(stats.fromAddresses.entries()).map(([addr, data]) => [
          addr,
          {
            arbitrageCount: data.arbitrageCount,
            totalTransactions: data.totalTransactions,
            arbitrageRate: data.arbitrageRate.toFixed(4),
            flagStats: data.flagStats,
            profitStats: {
              totalProfit: formatEther(data.profitStats.totalProfit),
              averageProfit: formatEther(data.profitStats.averageProfit),
              totalGasCost: formatGasCost(data.profitStats.totalGasCost),
              averageGasCost: formatGasCost(data.profitStats.averageGasCost),
              totalGasUsed: formatGasUsed(data.profitStats.totalGasUsed),
              averageGasUsed: formatGasUsed(data.profitStats.averageGasUsed)
            }
          }
        ])
      ),
      transactionTypes: {
        begin: {
          count: stats.beginTransactions,
          percentage: (stats.beginTransactions / stats.totalTransactions * 100).toFixed(2) + '%'
        },
        inter: {
          count: stats.interTransactions,
          percentage: (stats.interTransactions / stats.totalTransactions * 100).toFixed(2) + '%'
        }
      },
      topTransactions: stats.topTransactions
        .sort((a, b) => Number(b.profit - a.profit))
        .slice(0, 5)
        .map(tx => ({
          blockNumber: tx.blockNumber,
          timestamp: tx.timestamp,
          hash: tx.originalTx.hash,
          profit: formatEther(tx.profit),
          gasCost: formatGasCost(tx.gasCost),
          gasUsed: formatGasUsed(tx.gasUsed),
          netProfit: formatEther(tx.profit - tx.gasCost),
          inputAnalysis: tx.originalTx.inputAnalysis,
          arbitrageInfo: tx.originalTx.arbitrageInfo
        }))
    })),
  };

  // 生成 begin 主导地址的简化分析报告
  const beginDominantAddresses = Object.entries(addressStats)
    .filter(([, stats]) => stats.beginTransactions >= stats.interTransactions)
    .sort(([, a], [, b]) => Number(b.totalProfit - a.totalProfit))
    .slice(0, 20);

  const beginReport = {
    timestamp: new Date().toISOString(),
    testMode: TEST_MODE,
    startBlockNumber,
    endBlockNumber,
    totalAddresses: beginDominantAddresses.length,
    globalStats: {
      flagStats: beginDominantAddresses.reduce((acc, [, stats]) => {
        acc.poolsMatch += stats.flagStats.poolsMatch;
        acc.tokensMatch += stats.flagStats.tokensMatch;
        acc.amountsMatch += stats.flagStats.amountsMatch;
        acc.poolsAndTokensMatch += stats.flagStats.poolsAndTokensMatch;
        acc.poolsAndAmountsMatch += stats.flagStats.poolsAndAmountsMatch;
        acc.tokensAndAmountsMatch += stats.flagStats.tokensAndAmountsMatch;
        acc.allMatch += stats.flagStats.allMatch;
        acc.allNotMatch += stats.flagStats.allNotMatch;
        return acc;
      }, {
        poolsMatch: 0,
        tokensMatch: 0,
        amountsMatch: 0,
        poolsAndTokensMatch: 0,
        poolsAndAmountsMatch: 0,
        tokensAndAmountsMatch: 0,
        allMatch: 0,
        allNotMatch: 0
      })
    },
    topAddresses: beginDominantAddresses.map(([address, stats]) => ({
      address,
      totalTransactions: stats.totalTransactions,
      protocols: Array.from(stats.protocols),
      gasStats:{
        totalGasUsed: formatGasUsed(stats.totalGasUsed),
        averageGasUsed: formatGasUsed(stats.totalGasUsed / BigInt(stats.totalTransactions)),
        totalGasCost: formatGasCost(stats.totalGasCost),
        averageGasCost: formatGasCost(stats.totalGasCost / BigInt(stats.totalTransactions))
      },
      profitStats: {
        totalProfit: formatEther(stats.totalProfit),
        averageProfit: formatEther(stats.totalProfit / BigInt(stats.totalTransactions)),
        profitToCostRatio: Number(stats.totalProfit * BigInt(100) / stats.totalGasCost).toFixed(2) + '%'
      },
      profitableRate: (stats.profitableTransactions / stats.totalTransactions * 100).toFixed(2) + '%',
      fromAddresses: Object.fromEntries(
        Array.from(stats.fromAddresses.entries()).map(([addr, data]) => [
          addr,
          {
            arbitrageCount: data.arbitrageCount,
            totalTransactions: data.totalTransactions,
            arbitrageRate: data.arbitrageRate.toFixed(4),
            flagStats: data.flagStats,
            profitStats: {
              totalProfit: formatEther(data.profitStats.totalProfit),
              averageProfit: formatEther(data.profitStats.averageProfit),
              totalGasCost: formatGasCost(data.profitStats.totalGasCost),
              averageGasCost: formatGasCost(data.profitStats.averageGasCost),
              totalGasUsed: formatGasUsed(data.profitStats.totalGasUsed),
              averageGasUsed: formatGasUsed(data.profitStats.averageGasUsed)
            }
          }
        ])
      ),
      transactionTypes: {
        begin: {
          count: stats.beginTransactions,
          percentage: (stats.beginTransactions / stats.totalTransactions * 100).toFixed(2) + '%'
        },
        inter: {
          count: stats.interTransactions,
          percentage: (stats.interTransactions / stats.totalTransactions * 100).toFixed(2) + '%'
        }
      },
      topTransactions: stats.topTransactions
        .sort((a, b) => Number(b.profit - a.profit))
        .slice(0, 5)
        .map(tx => ({
          blockNumber: tx.blockNumber,
          timestamp: tx.timestamp,
          hash: tx.originalTx.hash,
          profit: formatEther(tx.profit),
          gasCost: formatGasCost(tx.gasCost),
          gasUsed: formatGasUsed(tx.gasUsed),
          netProfit: formatEther(tx.profit - tx.gasCost),
          inputAnalysis: tx.originalTx.inputAnalysis,
          arbitrageInfo: tx.originalTx.arbitrageInfo
        }))
    })),
  };

  // 保存分析结果
  const outputPath = path.join(__dirname, '../data/arbitrage_analysis_full/analysis_report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  const interReportPath = path.join(__dirname, '../data/arbitrage_analysis_full/inter_analysis.json');
  fs.writeFileSync(interReportPath, JSON.stringify(interReport, null, 2));

  const beginReportPath = path.join(__dirname, '../data/arbitrage_analysis_full/begin_analysis.json');
  fs.writeFileSync(beginReportPath, JSON.stringify(beginReport, null, 2));

  console.log(`Analysis complete. Reports saved to:`);
  console.log(`- Main report: ${outputPath}`);
  console.log(`- Inter analysis: ${interReportPath}`);
  console.log(`- Begin analysis: ${beginReportPath}`);
}

analyzeBatches().catch(console.error); 