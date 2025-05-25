import { ArbHelper } from "../src/lib/chain/arb.helper";
import { BlockRepository } from "../src/lib/db/block.repository";
import { StandardSwapEvent, TokenBalanceChange, BlockAnalysisResult } from "../src/lib/chain/types";
import { Transaction, TransactionReceipt, Log } from "viem";
import { formatUnits } from "viem";
import { logTopicsMap } from "src/common/events";
import path from 'path';
import fs from 'fs';
import { replacer } from "src/lib/utils";

interface BatchAnalysisResult {
  startBlock: number;
  endBlock: number;
  blocks: BlockAnalysisResult[];
  arbitrageTransactions: Array<{
    blockNumber: number;
    timestamp: Date;
    transaction: {
      hash: string;
      index: number;
      from: string;
      to?: string;
      gasPrice: string;
      gasUsed: string;
      arbitrageInfo: {
        type: 'begin' | 'inter';
        isBackrun: boolean;
        arbitrageCycles: any[];
        cyclesLength: number;
        profit: {
          token: string;
          symbol?: string;
          amount: string;
          formattedAmount?: string;
        };
        interInfo?: Array<{
          txHash: string;
          poolAddress: string;
          transactionIndex: number;
        }>;
      };
    };
  }>;
  statistics: {
    totalTransactions: number;
    arbitrageTransactions: number;
    beginArbitrageCount: number;
    interArbitrageCount: number;
    backrunArbitrageCount: number;
    totalProfit: string;
    totalGasUsed: string;
  };
}

async function main() {
  const rpcUrl = process.env.BASE_HTTP_URL!;
  const helper = new ArbHelper(rpcUrl);
  const blockRepo = new BlockRepository();

  // 获取起始和结束区块
  const startBlock = parseInt(process.argv[2] || "0");
  const endBlock = parseInt(process.argv[3] || "0");

  if (!startBlock || !endBlock) {
    console.error("请提供起始和结束区块号");
    process.exit(1);
  }

  if (startBlock > endBlock) {
    console.error(`错误：起始区块(${startBlock})不能大于结束区块(${endBlock})`);
    process.exit(1);
  }

  try {
    const totalBlocks = endBlock - startBlock + 1;
    console.log(`\n=== 开始分析区块 ${startBlock} 到 ${endBlock} 的套利交易 ===`);
    console.log(`总区块数: ${totalBlocks}`);
    
    // 创建结果目录
    const resultDir = path.join(__dirname, '../data/arbitrage_analysis');
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    console.log(`结果将保存到: ${resultDir}`);

    // 初始化总体统计信息
    const totalStatistics = {
      totalTransactions: 0,
      arbitrageTransactions: 0,
      beginArbitrageCount: 0,
      interArbitrageCount: 0,
      backrunArbitrageCount: 0,
      totalProfit: '0',
      totalGasUsed: '0'
    };

    // 按批次处理区块
    const batchSize = 1000; // 保持批处理大小为100
    const totalBatches = Math.ceil(totalBlocks / batchSize);
    const analysisBegin = performance.now();
    let processedBlocks = 0;
    let lastProgressUpdate = performance.now();

    // 格式化时间显示
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${hours}小时${minutes}分${remainingSeconds}秒`;
    };

    // 初始化summary对象
    const summary: any = {
      batches: [],
      totalStatistics: null,
      lastUpdate: null,
      processedBlocks: 0,
      totalBlocks: 0,
      totalTime: 0
    };

    for (let batchStart = startBlock; batchStart <= endBlock; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, endBlock);
      const currentBatch = Math.floor((batchStart - startBlock) / batchSize) + 1;
      
      console.log(`\n[批次 ${currentBatch}/${totalBatches}] 处理区块 ${batchStart} - ${batchEnd}`);
      
      // 1. 加载当前批次的区块数据
      console.log("1. 从数据库加载区块数据...");
      const loadStart = performance.now();
      const blocks = await blockRepo.getBlocks(batchStart, batchEnd);
      const loadEnd = performance.now();
      console.log(`✓ 加载完成: ${blocks.length} 个区块，耗时 ${((loadEnd - loadStart) / 1000).toFixed(2)} 秒`);

      // 2. 准备区块数据
      console.log("2. 准备区块数据...");
      const preparedBlocks = blocks.map(block => ({
        blockNumber: block.blockNumber,
        timestamp: new Date(Number(block.timestamp)),
        transactions: Array.isArray(block.transactions) ? block.transactions as unknown as Transaction[] : [],
        receipts: Array.isArray(block.receipts) ? block.receipts as unknown as TransactionReceipt[] : []
      }));
      console.log(`✓ 数据准备完成: ${preparedBlocks.length} 个区块`);

      // 清理原始数据
      blocks.length = 0;
      if (global.gc) global.gc();

      // 3. 分析当前批次的区块
      console.log("3. 开始分析区块...");
      const batchAnalysisStart = performance.now();
      const batchResult: BatchAnalysisResult = {
        startBlock: batchStart,
        endBlock: batchEnd,
        blocks: [],
        arbitrageTransactions: [],
        statistics: {
          totalTransactions: 0,
          arbitrageTransactions: 0,
          beginArbitrageCount: 0,
          interArbitrageCount: 0,
          backrunArbitrageCount: 0,
          totalProfit: '0',
          totalGasUsed: '0'
        }
      };

      // 使用Promise.all并行分析区块
      let analyzedBlocks = 0;
      const totalBlocksInBatch = preparedBlocks.length;
      const batchStartTime = performance.now();
      const concurrentLimit = 10; // 保持并发数为10
      const blockResults: BlockAnalysisResult[] = [];

      // 将区块分成每组10个的小批次
      for (let i = 0; i < preparedBlocks.length; i += concurrentLimit) {
        const currentBatch = preparedBlocks.slice(i, i + concurrentLimit);
        
        const batchPromises = currentBatch.map(async (block) => {
          const blockResult = await helper.analyzeBlock(
            block.blockNumber,
            block.timestamp,
            block.transactions,
            block.receipts
          );
          // 清理不需要的数据
          block.transactions = [];
          block.receipts = [];
          return blockResult;
        });

        // 等待当前批次完成
        const batchResults = await Promise.all(batchPromises);
        
        // 更新进度
        analyzedBlocks += currentBatch.length;
        const progress = (analyzedBlocks / totalBlocksInBatch * 100).toFixed(2);
        const elapsedTime = (performance.now() - batchStartTime) / 1000;
        const averageTimePerBlock = elapsedTime / analyzedBlocks;
        const remainingBlocks = totalBlocksInBatch - analyzedBlocks;
        const estimatedRemainingTime = averageTimePerBlock * remainingBlocks;
        
        console.log(`\r当前批次进度: ${progress}% (${analyzedBlocks}/${totalBlocksInBatch}) | 已用时间: ${formatTime(elapsedTime)} | 预计剩余: ${formatTime(estimatedRemainingTime)}`);
        
        // 只添加非空的结果
        for (const result of batchResults) {
          if (result) {
            blockResults.push(result);
          }
        }

        // 清理内存
        if (global.gc) global.gc();
      }

      // 清理preparedBlocks
      preparedBlocks.length = 0;
      if (global.gc) global.gc();

      // 处理分析结果
      for (const blockResult of blockResults) {
        if (blockResult) {
          batchResult.blocks.push(blockResult);
          batchResult.statistics.totalTransactions += blockResult.transactions.length;

          // 更新套利统计信息并提取套利交易
          for (const tx of blockResult.transactions) {
            if (tx.arbitrageInfo) {
              batchResult.statistics.arbitrageTransactions++;
              batchResult.statistics.totalGasUsed = (BigInt(batchResult.statistics.totalGasUsed) + BigInt(tx.gasUsed)).toString();
              
              if (tx.arbitrageInfo.profit.amount) {
                batchResult.statistics.totalProfit = (BigInt(batchResult.statistics.totalProfit) + BigInt(tx.arbitrageInfo.profit.amount)).toString();
              }

              if (tx.arbitrageInfo.type === 'begin') {
                batchResult.statistics.beginArbitrageCount++;
              } else {
                batchResult.statistics.interArbitrageCount++;
                if (tx.arbitrageInfo.isBackrun) {
                  batchResult.statistics.backrunArbitrageCount++;
                }
              }

              // 提取套利交易信息
              batchResult.arbitrageTransactions.push({
                blockNumber: blockResult.blockNumber,
                timestamp: blockResult.timestamp,
                transaction: {
                  hash: tx.hash,
                  index: tx.index,
                  from: tx.from,
                  to: tx.to,
                  gasPrice: tx.gasPrice,
                  gasUsed: tx.gasUsed,
                  arbitrageInfo: tx.arbitrageInfo
                }
              });
            }
          }
        }

        processedBlocks++;
        const now = performance.now();
        if (now - lastProgressUpdate > 5000) { // 每5秒更新一次进度
          const progress = (processedBlocks / totalBlocks * 100).toFixed(2);
          const elapsedTime = (now - analysisBegin) / 1000;
          const estimatedTotalTime = elapsedTime / (processedBlocks / totalBlocks);
          const remainingTime = estimatedTotalTime - elapsedTime;
          
          console.log(`进度: ${progress}% (${processedBlocks}/${totalBlocks})`);
          console.log(`已用时间: ${formatTime(elapsedTime)}`);
          console.log(`预计剩余时间: ${formatTime(remainingTime)}`);
          
          lastProgressUpdate = now;
        }
      }

      // 清理blockResults
      blockResults.length = 0;
      if (global.gc) global.gc();

      const batchAnalysisEnd = performance.now();
      const batchTime = (batchAnalysisEnd - batchAnalysisStart) / 1000;

      // 4. 保存当前批次的结果
      console.log("4. 保存分析结果...");
      const batchDir = path.join(resultDir, 'batches');
      if (!fs.existsSync(batchDir)) {
        fs.mkdirSync(batchDir, { recursive: true });
      }

      // 保存批次分析结果
      const batchFilename = `batch_${batchStart}_${batchEnd}.json`;
      fs.writeFileSync(
        path.join(batchDir, batchFilename),
        JSON.stringify(batchResult, replacer, 2)
      );

      // 更新summary文件
      const summaryFile = path.join(resultDir, 'analysis_summary.json');
      
      // 添加当前批次到summary
      summary.batches.push({
        batchNumber: currentBatch,
        startBlock: batchStart,
        endBlock: batchEnd,
        statistics: batchResult.statistics,
        arbitrageCount: batchResult.arbitrageTransactions.length,
        processingTime: batchTime
      });

      // 更新总体统计
      summary.totalStatistics = totalStatistics;
      summary.lastUpdate = new Date().toISOString();
      summary.processedBlocks = processedBlocks;
      summary.totalBlocks = totalBlocks;
      summary.totalTime = (batchAnalysisEnd - analysisBegin) / 1000;

      // 保存summary
      fs.writeFileSync(summaryFile, JSON.stringify(summary, replacer, 2));

      // 5. 更新总体统计信息
      totalStatistics.totalTransactions += batchResult.statistics.totalTransactions;
      totalStatistics.arbitrageTransactions += batchResult.statistics.arbitrageTransactions;
      totalStatistics.beginArbitrageCount += batchResult.statistics.beginArbitrageCount;
      totalStatistics.interArbitrageCount += batchResult.statistics.interArbitrageCount;
      totalStatistics.backrunArbitrageCount += batchResult.statistics.backrunArbitrageCount;
      totalStatistics.totalProfit = (BigInt(totalStatistics.totalProfit) + BigInt(batchResult.statistics.totalProfit)).toString();
      totalStatistics.totalGasUsed = (BigInt(totalStatistics.totalGasUsed) + BigInt(batchResult.statistics.totalGasUsed)).toString();
      
      console.log(`✓ 批次完成: ${preparedBlocks.length} 个区块，耗时 ${formatTime(batchTime)}`);
      console.log(`✓ 已保存批次分析结果到 ${batchFilename}`);
      console.log(`✓ 已更新分析总结文件`);
      console.log(`当前批次统计: ${batchResult.statistics.arbitrageTransactions} 笔套利交易`);
      console.log(`累计统计: ${totalStatistics.arbitrageTransactions} 笔套利交易`);

      // 6. 保存当前进度
      const progressResult = {
        startBlock,
        endBlock,
        currentBlock: batchEnd,
        processedBlocks,
        totalBlocks,
        analysisTime: batchAnalysisEnd - analysisBegin,
        statistics: totalStatistics,
        estimatedRemainingTime: formatTime((batchAnalysisEnd - analysisBegin) / (processedBlocks / totalBlocks) - (batchAnalysisEnd - analysisBegin) / 1000)
      };

      fs.writeFileSync(
        path.join(resultDir, 'progress.json'),
        JSON.stringify(progressResult, replacer, 2)
      );

      // 清理内存
      if (global.gc) global.gc();
    }

    const analysisEnd = performance.now();
    const totalTime = (analysisEnd - analysisBegin) / 1000;
    console.log(`\n=== 分析完成 ===`);
    console.log(`总耗时: ${formatTime(totalTime)}`);
    console.log(`平均速度: ${(totalBlocks / totalTime).toFixed(2)} 区块/秒`);

    // 保存最终结果
    const finalResult = {
      startBlock,
      endBlock,
      analysisTime: analysisEnd - analysisBegin,
      statistics: totalStatistics,
      batches: summary.batches,
      averageSpeed: totalBlocks / totalTime
    };

    const outputFile = path.join(resultDir, `final_summary_${startBlock}_${endBlock}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(finalResult, replacer, 2));
    console.log(`\n分析总结已保存到: ${outputFile}`);

    // 打印统计信息
    console.log("\n=== 分析统计信息 ===");
    console.log(`总交易数: ${totalStatistics.totalTransactions}`);
    console.log(`套利交易数: ${totalStatistics.arbitrageTransactions}`);
    console.log(`开始套利数: ${totalStatistics.beginArbitrageCount}`);
    console.log(`中间套利数: ${totalStatistics.interArbitrageCount}`);
    console.log(`Backrun套利数: ${totalStatistics.backrunArbitrageCount}`);
    console.log(`总利润: ${totalStatistics.totalProfit}`);
    console.log(`总Gas使用量: ${totalStatistics.totalGasUsed}`);

  } catch (error) {
    console.error("\n分析过程中出错:", error);
  } finally {
    await blockRepo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 