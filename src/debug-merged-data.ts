import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// 定义数据文件路径
const MERGED_DATA_FILE = path.join(process.cwd(), 'data', 'merged-analysis.json');
const DEBUG_OUTPUT_FILE = path.join(process.cwd(), 'data', 'debug-data-structure.json');

// 主函数
function main() {
  console.log(`读取合并的数据文件: ${MERGED_DATA_FILE}`);
  
  try {
    // 读取合并数据
    const mergedDataStr = readFileSync(MERGED_DATA_FILE, 'utf8');
    const mergedData = JSON.parse(mergedDataStr);
    
    console.log(`成功读取合并数据，包含 ${mergedData.totalBlocks} 个区块`);
    
    // 提取第一个区块的数据结构信息
    const blockKeys = Object.keys(mergedData.blockAnalysis);
    console.log(`区块号列表: ${blockKeys.slice(0, 5).join(', ')}...等`);
    
    if (blockKeys.length > 0) {
      const firstBlockNumber = blockKeys[0];
      const firstBlockData = mergedData.blockAnalysis[firstBlockNumber];
      
      // 创建数据结构概览
      const dataStructure = {
        blockNumber: firstBlockNumber,
        dataStructure: {
          hasArbitrageTxs: !!firstBlockData.arbitrageTxs,
          arbitrageTxsCount: firstBlockData.arbitrageTxs?.length || 0,
          arbitrageTxsKeys: firstBlockData.arbitrageTxs?.[0] ? Object.keys(firstBlockData.arbitrageTxs[0]) : [],
          
          hasSimpleSwapTxs: !!firstBlockData.simpleSwapTxs,
          simpleSwapTxsCount: firstBlockData.simpleSwapTxs?.length || 0,
          simpleSwapTxsKeys: firstBlockData.simpleSwapTxs?.[0] ? Object.keys(firstBlockData.simpleSwapTxs[0]) : [],
          
          hasSwapArbitrageRelations: !!firstBlockData.swapArbitrageRelations,
          swapArbitrageRelationsCount: firstBlockData.swapArbitrageRelations?.length || 0,
          swapArbitrageRelationsKeys: firstBlockData.swapArbitrageRelations?.[0] ? Object.keys(firstBlockData.swapArbitrageRelations[0]) : [],
        },
        // 如果有样本数据，展示第一个样本
        sampleData: {
          firstArbitrageTx: firstBlockData.arbitrageTxs?.[0] || null,
          firstSimpleSwapTx: firstBlockData.simpleSwapTxs?.[0] || null,
          firstSwapArbitrageRelation: firstBlockData.swapArbitrageRelations?.[0] || null,
        }
      };
      
      // 如果有swapEvents，进一步检查它的结构
      if (firstBlockData.arbitrageTxs?.[0]?.swapEvents) {
        dataStructure.dataStructure.arbitrageTxSwapEventsKeys = Object.keys(firstBlockData.arbitrageTxs[0].swapEvents[0]);
      }
      
      if (firstBlockData.simpleSwapTxs?.[0]?.swapEvents) {
        dataStructure.dataStructure.simpleSwapTxSwapEventsKeys = Object.keys(firstBlockData.simpleSwapTxs[0].swapEvents[0]);
      }
      
      // 保存结构信息到文件
      writeFileSync(
        DEBUG_OUTPUT_FILE,
        JSON.stringify(dataStructure, null, 2)
      );
      
      console.log(`数据结构信息已保存到: ${DEBUG_OUTPUT_FILE}`);
      console.log('数据结构概览:');
      console.log(JSON.stringify(dataStructure.dataStructure, null, 2));
    } else {
      console.log('没有找到任何区块数据');
    }
    
  } catch (error) {
    console.error('读取或解析合并数据时出错:', error);
  }
}

main(); 