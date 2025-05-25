/**
 * 套利交易分析脚本
 * 
 * 功能流程：
 * 1. 分析所有批处理文件中的套利交易
 * 2. 筛选出WETH利润的套利交易
 * 3. 按searcher合约地址分组统计
 * 4. 找出inter交易数大于begin交易数的searcher
 * 5. 从这些searcher中选择代表性的套利交易（按利润排序）
 * 6. 使用analyzeArbitrageInput分析这些交易的输入数据
 * 7. 将分析结果输出到JSON文件
 * 
 * 输出格式：
 * {
 *   "statistics": {
 *     "totalSearchers": number,
 *     "totalTransactions": number,
 *     "totalWethProfit": string,
 *     "interDominantSearchers": number
 *   },
 *   "searchers": {
 *     [address: string]: {
 *       "totalTxs": number,
 *       "interTxs": number,
 *       "beginTxs": number,
 *       "wethProfit": string,
 *       "exampleTxs": Array<{
 *         "txHash": string,
 *         "blockNumber": number,
 *         "profit": string,
 *         "type": string,
 *         "input": string,
 *         "swapEvents": Array<{
 *           "tokenIn": string,
 *           "tokenOut": string,
 *           "amountIn": string,
 *           "amountOut": string,
 *           "poolAddress": string,
 *           "protocol": string
 *         }>,
 *         "arbitrageInfo": {
 *           "type": string,
 *           "isBackrun": boolean,
 *           "arbitrageCycles": Array<{
 *             "edges": Array<{
 *               "tokenIn": string,
 *               "tokenOut": string,
 *               "amountIn": string,
 *               "amountOut": string,
 *               "poolAddress": string,
 *               "protocol": string
 *             }>
 *           }>,
 *           "profit": {
 *             "token": string,
 *             "amount": string
 *           }
 *         },
 *         "inputAnalysis": {
 *           "pathAnalysis": {...},
 *           "tokenAnalysis": {...},
 *           "amounts": {...}
 *         }
 *       }>
 *     }
 *   }
 * }
 */

import fs from 'fs';
import path from 'path';
import { analyzeArbitrageInput } from '../src/lib/arbAnalyzer/inputAnalyzer';
import { ArbitrageCycle, BlockAnalysisResult } from '../src/lib/chain/types';
import { replacer } from 'src/lib/utils';

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const ANALYZE_SINGLE_BATCH = false; // 设置为true时只分析第一个batch文件

interface SearcherStats {
  totalTxs: number;
  interTxs: number;
  beginTxs: number;
  wethProfit: string;
  exampleTxs: Array<{
    txHash: string;
    blockNumber: number;
    txIndex: number;
    profit: string;
    type: string;
    input: string;
    from: string;
    to: string;
    gasUsed: string;
    gasPrice: string;
    addressTokenChanges: Array<{
      address: string;
      token: string;
      change: string;
    }>;
    swapEvents: Array<{
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      amountOut: string;
      poolAddress: string;
      protocol: string;
    }>;
    arbitrageInfo: {
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
      }>;
      profit: {
        token: string;
        amount: string;
      };
    };
    inputAnalysis?: any;
  }>;
}

interface AnalysisResult {
  statistics: {
    totalSearchers: number;
    totalTransactions: number;
    totalWethProfit: string;
    interDominantSearchers: number;
  };
  searchers: Record<string, SearcherStats>;
}

async function* readArbitrageTransactions() {
  const batchesDir = path.join(process.cwd(), 'data/arbitrage_analysis/batches');
  const files = await fs.promises.readdir(batchesDir);
  const batchFiles = files.filter(f => f.startsWith('batch_') && f.endsWith('.json'));
  
  // 如果设置了单batch分析，只处理第一个文件
  const filesToProcess = ANALYZE_SINGLE_BATCH ? [batchFiles[0]] : batchFiles;
  
  for (const file of filesToProcess) {
    try {
      const filePath = path.join(batchesDir, file);
      console.log(`正在读取文件: ${file}`);
      
      const content = await fs.promises.readFile(filePath, 'utf-8');
      let data;
      try {
        data = JSON.parse(content);
      } catch (e) {
        console.error(`解析文件 ${file} 失败:`, e);
        continue;
      }

      if (!data || typeof data !== 'object') {
        console.error(`文件 ${file} 的数据格式不正确`);
        continue;
      }

      if (!Array.isArray(data.blocks) || !Array.isArray(data.arbitrageTransactions)) {
        console.error(`文件 ${file} 中未找到blocks或arbitrageTransactions数组`);
        continue;
      }

      console.log(`文件 ${file} 中包含 ${data.arbitrageTransactions.length} 笔套利交易`);
      
      const blockMap = new Map<number, BlockAnalysisResult>();
      data.blocks.forEach((block: BlockAnalysisResult) => {
        blockMap.set(block.blockNumber, block);
      });
      
      for (const arbTx of data.arbitrageTransactions) {
        if (!arbTx || !arbTx.transaction || !arbTx.transaction.arbitrageInfo) continue;
        
        // 只处理WETH利润的交易
        const profit = arbTx.transaction.arbitrageInfo.profit;
        if (profit.token.toLowerCase() !== WETH_ADDRESS.toLowerCase()) continue;
        
        try {
          const block = blockMap.get(arbTx.blockNumber);
          if (!block) {
            console.error(`未找到区块 ${arbTx.blockNumber} 的信息`);
            continue;
          }

          const fullTx = block.transactions.find(tx => tx.hash === arbTx.transaction.hash);
          if (!fullTx) {
            console.error(`未在区块 ${arbTx.blockNumber} 中找到交易 ${arbTx.transaction.hash}`);
            continue;
          }

          yield {
            txHash: arbTx.transaction.hash,
            blockNumber: arbTx.blockNumber,
            txIndex: fullTx.index,
            input: fullTx.input,
            type: arbTx.transaction.arbitrageInfo.type,
            profit: profit.amount,
            from: fullTx.from,
            to: fullTx.to || 'unknown',
            gasUsed: fullTx.gasUsed.toString(),
            gasPrice: fullTx.gasPrice.toString(),
            addressTokenChanges: Object.entries(fullTx.addressTokenChanges || {}).map(([address, changes]) => 
              changes.map(change => ({
                address,
                token: change.token,
                change: change.change.toString()
              }))
            ).flat(),
            arbitrageInfo: arbTx.transaction.arbitrageInfo,
            swapEvents: fullTx.swapEvents || []
          };
        } catch (e) {
          console.error(`处理交易 ${arbTx.transaction.hash} 时出错:`, e);
          continue;
        }
      }
    } catch (e) {
      console.error(`处理文件 ${file} 时出错:`, e);
      continue;
    }
  }
}

async function main() {
  console.log('开始分析套利交易...\n');
  if (ANALYZE_SINGLE_BATCH) {
    console.log('注意：当前设置为只分析第一个batch文件\n');
  }
  
  const searcherStats: Record<string, SearcherStats> = {};
  let totalTxs = 0;
  let totalWethProfit = BigInt(0);
  
  try {
    for await (const tx of readArbitrageTransactions()) {
      totalTxs++;
      totalWethProfit += BigInt(tx.profit);
      
      const searcher = tx.to?.toLowerCase() || 'unknown';
      if (!searcherStats[searcher]) {
        searcherStats[searcher] = {
          totalTxs: 0,
          interTxs: 0,
          beginTxs: 0,
          wethProfit: '0',
          exampleTxs: []
        };
      }
      
      const stats = searcherStats[searcher];
      stats.totalTxs++;
      stats.wethProfit = (BigInt(stats.wethProfit) + BigInt(tx.profit)).toString();
      
      if (tx.type === 'inter') {
        stats.interTxs++;
      } else if (tx.type === 'begin') {
        stats.beginTxs++;
      }
      
      // 收集示例交易（按利润排序）
      if (stats.exampleTxs.length < 5) {
        const exampleTx = {
          txHash: tx.txHash,
          blockNumber: tx.blockNumber,
          txIndex: tx.txIndex,
          profit: tx.profit,
          type: tx.type,
          input: tx.input,
          from: tx.from,
          to: tx.to || 'unknown',
          gasUsed: tx.gasUsed,
          gasPrice: tx.gasPrice,
          addressTokenChanges: tx.addressTokenChanges,
          swapEvents: tx.swapEvents.map(event => ({
            tokenIn: event.tokenIn,
            tokenOut: event.tokenOut,
            amountIn: event.amountIn.toString(),
            amountOut: event.amountOut.toString(),
            poolAddress: event.poolAddress,
            protocol: event.protocol
          })),
          arbitrageInfo: tx.arbitrageInfo,
          inputAnalysis: tx.arbitrageInfo.arbitrageCycles.map((cycle: ArbitrageCycle) => 
            analyzeArbitrageInput(tx.input, cycle)
          )
        };
        
        stats.exampleTxs.push(exampleTx);
        // 按利润排序
        stats.exampleTxs.sort((a, b) => Number(BigInt(b.profit) - BigInt(a.profit)));
      }
    }
  } catch (e) {
    console.error('分析过程中出错:', e);
  }
  
  // 筛选出inter > begin的searcher
  const interDominantSearchers = Object.entries(searcherStats)
    .filter(([_, stats]) => stats.interTxs > stats.beginTxs);
  
  // 准备输出结果
  const result: AnalysisResult = {
    statistics: {
      totalSearchers: Object.keys(searcherStats).length,
      totalTransactions: totalTxs,
      totalWethProfit: totalWethProfit.toString(),
      interDominantSearchers: interDominantSearchers.length
    },
    searchers: {}
  };
  
  // 只保留inter > begin的searcher
  for (const [address, stats] of interDominantSearchers) {
    result.searchers[address] = stats;
  }
  
  // 输出到文件
  const outputPath = path.join(process.cwd(), 'data/arbitrage_analysis/inter_dominant_analysis.json');
  await fs.promises.writeFile(outputPath, JSON.stringify(result, replacer, 2));
  
  console.log(`\n分析完成，结果已保存到: ${outputPath}`);
  console.log(`总交易数: ${totalTxs}`);
  console.log(`总WETH利润: ${totalWethProfit.toString()}`);
  console.log(`Inter主导的Searcher数量: ${interDominantSearchers.length}`);
}

main().catch(console.error); 