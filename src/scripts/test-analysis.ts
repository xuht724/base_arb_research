import { AnalysisHelper } from '../lib/chain/analysiswithallswap';
import fs from 'fs';
import path from 'path';

// 断点保护和进度显示功能
async function analyzeWithProtection(analysisHelper: AnalysisHelper, startBlock: number, count: number = 1) {
  const results = [];
  const MAX_BLOCKS_PER_BATCH = 10; // 每批最多分析的区块数，防止API限制
  
  // 确保不超过安全限制
  const actualCount = Math.min(count, 50); // 最多分析50个区块，防止过度请求
  console.log(`将分析从 ${startBlock} 开始的 ${actualCount} 个区块...`);
  
  // 计算需要分析的批次
  const batches = Math.ceil(actualCount / MAX_BLOCKS_PER_BATCH);
  
  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const batchStartIdx = batchIndex * MAX_BLOCKS_PER_BATCH;
    const batchSize = Math.min(MAX_BLOCKS_PER_BATCH, actualCount - batchStartIdx);
    
    console.log(`\n开始处理第 ${batchIndex + 1}/${batches} 批, 包含 ${batchSize} 个区块`);
    
    for (let i = 0; i < batchSize; i++) {
      const currentBlock = startBlock + batchStartIdx + i;
      console.log(`\n[${i + 1}/${batchSize}] 分析区块 ${currentBlock}...`);
      
      try {
        // 分析单个区块
        const result = await analysisHelper.analyzeBlockArbitrage(currentBlock);
        results.push(result);
        
        // 输出区块分析结果摘要
        console.log(`区块摘要:  交易总数: ${result.blockInfo.totalTransactions}, 所有Swap: ${result.allSwapTxs.length}, 单纯Swap: ${result.simpleSwapTxs.length}, 套利: ${result.arbitrageTxs.length}`);
        
        // 保存到文件
        saveResultToFile(result, currentBlock);
      } catch (error) {
        console.error(`分析区块 ${currentBlock} 时出错:`, error);
      }
    }
    
    // 批次之间休息，避免API限制
    if (batchIndex < batches - 1) {
      console.log(`\n批次间暂停5秒...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return results;
}

// 修复BigInt序列化问题的自定义replacer函数
function replacer(key: string, value: any) {
  // 如果值是BigInt，转换为字符串
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

// 将结果保存到文件
function saveResultToFile(result: any, blockNumber: number) {
  const outputDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `analysis-block-${blockNumber}.json`);
  
  // 使用自定义replacer函数处理BigInt
  fs.writeFileSync(outputFile, JSON.stringify(result, replacer, 2));
  
  console.log(`完整分析结果已保存到: ${outputFile}`);
}

// 创建关系可视化信息
function createRelationshipVisual(result: any) {
  // 为每个交易创建映射，便于查找
  const txMap = new Map();
  
  // 添加所有单纯Swap交易
  for (const swap of result.simpleSwapTxs) {
    txMap.set(swap.txHash, {
      type: 'SimpleSwap',
      index: swap.transactionIndex,
      protocol: swap.protocol,
      poolAddress: swap.poolAddress,
      tokenIn: swap.tokenIn,
      tokenOut: swap.tokenOut,
      relatedArbitrages: [] // 记录与此swap相关的套利交易
    });
  }
  
  // 添加所有套利交易
  for (const arb of result.arbitrageTxs) {
    txMap.set(arb.txHash, {
      type: 'Arbitrage',
      index: arb.transactionIndex,
      profit: arb.profit,
      swapCount: arb.swapEvents.length,
      pools: arb.swapEvents.map((s: any) => s.poolAddress),
      relatedSwaps: [] // 记录触发此套利的swap交易
    });
  }
  
  // 建立关系
  for (const relation of result.swapArbitrageRelations) {
    const arbTx = txMap.get(relation.arbitrageTxHash);
    
    if (arbTx) {
      for (const trigger of relation.potentialTriggerSwaps) {
        const swapTx = txMap.get(trigger.swapTxHash);
        
        if (swapTx) {
          // 建立双向关系
          arbTx.relatedSwaps.push({
            txHash: trigger.swapTxHash,
            poolAddress: trigger.poolAddress,
            timeDifference: trigger.timeDifference
          });
          
          swapTx.relatedArbitrages.push({
            txHash: relation.arbitrageTxHash,
            poolAddress: trigger.poolAddress,
            timeDifference: trigger.timeDifference
          });
        }
      }
    }
  }
  
  return txMap;
}

// 打印关系图表（简化版ASCII图）
function printRelationshipGraph(txMap: Map<string, any>) {
  // 按交易索引排序所有交易
  const sortedTxs = [...txMap.entries()].sort((a, b) => a[1].index - b[1].index);
  
  console.log('\n\n====== 交易关系图 ======');
  console.log('(S: 单纯Swap, A: 套利交易, →: 潜在触发关系)\n');
  
  const timelineItems = [];
  
  for (const [txHash, tx] of sortedTxs) {
    const shortHash = txHash.substring(0, 6) + '...' + txHash.substring(txHash.length - 4);
    let label = '';
    
    if (tx.type === 'SimpleSwap') {
      const tokenInSymbol = tx.tokenIn.symbol || tx.tokenIn.address.substring(0, 6) + '...';
      const tokenOutSymbol = tx.tokenOut.symbol || tx.tokenOut.address.substring(0, 6) + '...';
      
      label = `S:${shortHash} [${tx.protocol}] ${tokenInSymbol}→${tokenOutSymbol}`;
      
      if (tx.relatedArbitrages.length > 0) {
        label += ` (触发了 ${tx.relatedArbitrages.length} 个套利)`;
      }
    } else {
      const profitSymbol = tx.profit?.symbol || tx.profit?.token.substring(0, 6) + '...';
      const profitAmount = tx.profit?.formattedAmount || tx.profit?.amount;
      
      label = `A:${shortHash} [${tx.swapCount}个Swap] 利润: ${profitAmount} ${profitSymbol}`;
      
      if (tx.relatedSwaps.length > 0) {
        label += ` (由 ${tx.relatedSwaps.length} 个Swap触发)`;
      }
    }
    
    timelineItems.push({
      index: tx.index,
      txHash,
      label,
      type: tx.type
    });
  }
  
  // 按索引排序并打印时间线
  timelineItems.sort((a, b) => a.index - b.index);
  
  for (let i = 0; i < timelineItems.length; i++) {
    const item = timelineItems[i];
    console.log(`${item.index}: ${item.label}`);
    
    // 显示关系箭头
    if (item.type === 'SimpleSwap') {
      const tx = txMap.get(item.txHash);
      for (const related of tx.relatedArbitrages) {
        const targetItem = timelineItems.find(t => t.txHash === related.txHash);
        if (targetItem) {
          console.log(`   ↓ ---- 触发 (${related.timeDifference}个交易后) ---→ ${targetItem.index}`);
        }
      }
    }
  }
}

async function main() {
  try {
    // 使用环境变量或默认RPC URL初始化分析助手
    const rpcUrl = process.env.RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/Hlbk2P_Ak05o1rWZuwTmhUlY-UHYgEqz';
    console.log(`使用RPC URL: ${rpcUrl}`);
    
    const analysisHelper = new AnalysisHelper(rpcUrl);
    
    // 获取命令行参数
    const startBlock = process.argv[2] ? parseInt(process.argv[2]) : 30488000; // 默认区块号 
    const blockCount = process.argv[3] ? parseInt(process.argv[3]) : 1; // 默认只分析1个区块
    
    // 使用断点保护进行分析
    const results = await analyzeWithProtection(analysisHelper, startBlock, blockCount);
    
    if (results.length === 0) {
      console.log('没有成功分析任何区块');
      return;
    }
    
    // 详细输出最后一个区块的信息
    const lastResult = results[results.length - 1];
    
    console.log('\n===== 最后区块详细分析 =====');
    console.log(`区块号: ${lastResult.blockNumber}`);
    console.log(`区块时间: ${lastResult.blockInfo.timestamp}`);
    console.log(`总交易数: ${lastResult.blockInfo.totalTransactions}`);
    console.log(`Swap交易总数: ${lastResult.allSwapTxs.length}`);
    console.log(`单纯Swap交易数: ${lastResult.simpleSwapTxs.length}`);
    console.log(`套利交易数: ${lastResult.arbitrageTxs.length}`);
    console.log(`套利交易和Swap交易的关系数量: ${lastResult.swapArbitrageRelations.length}`);
    
    // 创建并打印关系可视化
    if (lastResult.allSwapTxs.length > 0) {
      const relationshipMap = createRelationshipVisual(lastResult);
      printRelationshipGraph(relationshipMap);
    }
    
    // 详细分析单纯Swap交易样本
    if (lastResult.simpleSwapTxs.length > 0) {
      console.log('\n===== 单纯Swap交易样本 =====');
      const sampleCount = Math.min(3, lastResult.simpleSwapTxs.length);
      
      for (let i = 0; i < sampleCount; i++) {
        const swap = lastResult.simpleSwapTxs[i];
        console.log(`\n交易: ${swap.txHash}`);
        console.log(`交易索引: ${swap.transactionIndex}`);
        console.log(`协议: ${swap.protocol}`);
        console.log(`池子地址: ${swap.poolAddress}`);
        console.log(`输入代币: ${swap.tokenIn.symbol || swap.tokenIn.address} (${swap.tokenIn.amount})`);
        console.log(`输出代币: ${swap.tokenOut.symbol || swap.tokenOut.address} (${swap.tokenOut.amount})`);
      }
    }
    
    // 详细分析套利交易样本
    if (lastResult.arbitrageTxs.length > 0) {
      console.log('\n===== 套利交易样本 =====');
      const sampleCount = Math.min(3, lastResult.arbitrageTxs.length);
      
      for (let i = 0; i < sampleCount; i++) {
        const arb = lastResult.arbitrageTxs[i];
        console.log(`\n交易: ${arb.txHash}`);
        console.log(`交易索引: ${arb.transactionIndex}`);
        console.log(`类型: ${arb.type}`);
        console.log(`Swap事件数量: ${arb.swapEvents.length}`);
        
        if (arb.profit) {
          console.log(`利润代币: ${arb.profit.symbol || arb.profit.token}`);
          console.log(`利润数量: ${arb.profit.formattedAmount || arb.profit.amount}`);
        }
        
        console.log('涉及的Swap:');
        for (let j = 0; j < Math.min(5, arb.swapEvents.length); j++) {
          const swap = arb.swapEvents[j];
          console.log(`  ${swap.tokenIn.symbol || swap.tokenIn.address} -> ${swap.tokenOut.symbol || swap.tokenOut.address} (${swap.protocol})`);
        }
      }
    }
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

main().catch(console.error); 