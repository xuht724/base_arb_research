import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

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

interface RawTransaction {
  hash: string;
  index: number;
  from: string;
  input: string;
  to: string;
  gasPrice: string;
  gasUsed: string;
  swapEvents: SwapEvent[];
  inputAnalysis: any;
  arbitrageInfo: any;
}

interface ProcessedTransaction {
  hash: string;
  index: number;
  from: string;
  input: string;
  to: string;
  gasPrice: string;
  gasUsed: number;
  swapEvents: SwapEvent[];
  inputAnalysis: any;
  arbitrageInfo: any;
  protocolCombination: string[];
}

interface RawArbitrageTransaction {
  blockNumber: number;
  timestamp: string;
  transaction: RawTransaction;
}

interface ProcessedArbitrageTransaction {
  blockNumber: number;
  timestamp: string;
  transaction: ProcessedTransaction;
}

interface BatchData {
  startBlock: number;
  endBlock: number;
  arbitrageTransactions: RawArbitrageTransaction[];
}

interface BatchSummary {
  startBlock: number;
  endBlock: number;
  transactionCount: number;
}

// 目标协议组合
const TARGET_PROTOCOL_COMBINATIONS = [
  'UniV2_UniV2',
  'AeroV2_AeroV2', 
  'AeroV2_UniV2',
  'UniV2_AeroV2',
  'UniV2_UniV2_AeroV2',
  'UniV2_AeroV2_UniV2',
  'AeroV2_UniV2_UniV2',
  'AeroV2_AeroV2_UniV2',
  'AeroV2_UniV2_AeroV2',
];

async function ensureDirectoryExists(dir: string) {
  try {
    await fs.promises.access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

// 提取套利周期的协议组合，返回字符串数组
function extractProtocolCombination(arbitrageInfo: any): string[] {
  if (!arbitrageInfo || !arbitrageInfo.arbitrageCycles || arbitrageInfo.arbitrageCycles.length === 0) {
    return ['Unknown'];
  }

  const protocolCombinations: string[] = [];
  
  // 遍历所有套利周期
  for (const cycle of arbitrageInfo.arbitrageCycles) {
    const protocols: string[] = [];
    
    if (cycle.edges && cycle.edges.length > 0) {
      // 提取每个边的协议
      for (const edge of cycle.edges) {
        if (edge.protocol) {
          protocols.push(edge.protocol);
        }
      }
    }

    // 如果没有找到协议，添加Unknown
    if (protocols.length === 0) {
      protocolCombinations.push('Unknown');
    } else {
      // 按字母顺序排序并连接
      protocolCombinations.push(protocols.sort().join('_'));
    }
  }

  return protocolCombinations;
}

// 检查交易是否包含目标协议组合
function hasTargetProtocolCombination(protocolCombinations: string[]): boolean {
  return protocolCombinations.some(combination => 
    TARGET_PROTOCOL_COMBINATIONS.includes(combination)
  );
}

async function extractTransactionsByProtocol(
  batchesDir: string,
  outputDir: string
) {
  try {
    console.log(`开始处理目录: ${batchesDir}`);
    console.log(`目标协议组合: ${TARGET_PROTOCOL_COMBINATIONS.join(', ')}`);

    // 确保输出目录存在
    await ensureDirectoryExists(outputDir);

    // 读取所有batch文件
    const files = await readdir(batchesDir);
    const batchFiles = files.filter(file => file.startsWith('batch_') && file.endsWith('.json'));
    console.log(`找到 ${batchFiles.length} 个batch文件`);

    // 存储所有匹配的交易
    const matchedTransactions: ProcessedArbitrageTransaction[] = [];
    let totalTransactionsProcessed = 0;
    let totalFilesProcessed = 0;

    // 统计每种协议组合的交易数量
    const protocolStats: { [key: string]: number } = {};
    TARGET_PROTOCOL_COMBINATIONS.forEach(protocol => {
      protocolStats[protocol] = 0;
    });

    // 处理每个batch文件
    for (const file of batchFiles) {
      totalFilesProcessed++;
      const filePath = path.join(batchesDir, file);
      console.log(`\n处理文件 (${totalFilesProcessed}/${batchFiles.length}): ${file}`);

      const fileContent = await readFile(filePath, 'utf-8');
      const batchData: BatchData = JSON.parse(fileContent);
      const transactionsInFile = batchData.arbitrageTransactions.length;
      totalTransactionsProcessed += transactionsInFile;

      let matchesInFile = 0;

      // 检查每个交易
      for (const tx of batchData.arbitrageTransactions) {
        // 提取协议组合
        const protocolCombinations = extractProtocolCombination(tx.transaction.arbitrageInfo);
        
        // 检查是否包含目标协议组合
        if (hasTargetProtocolCombination(protocolCombinations)) {
          // 转换gasUsed为数字
          const processedTx: ProcessedArbitrageTransaction = {
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp,
            transaction: {
              ...tx.transaction,
              gasUsed: parseInt(tx.transaction.gasUsed, 16),
              protocolCombination: protocolCombinations
            }
          };

          matchedTransactions.push(processedTx);
          matchesInFile++;

          // 统计协议组合
          protocolCombinations.forEach(combination => {
            if (TARGET_PROTOCOL_COMBINATIONS.includes(combination)) {
              protocolStats[combination]++;
            }
          });
        }
      }

      console.log(`  文件 ${file} 中:`);
      console.log(`  - 总交易数: ${transactionsInFile}`);
      console.log(`  - 匹配交易数: ${matchesInFile}`);
      console.log(`  - 当前累计匹配交易数: ${matchedTransactions.length}`);
    }

    // 按区块号排序
    matchedTransactions.sort((a, b) => a.blockNumber - b.blockNumber);

    // 输出所有交易到一个文件
    const allTransactionsFile = path.join(outputDir, 'protocol_arbitrage_transactions.json');
    const allTransactionsData = {
      summary: {
        startBlock: matchedTransactions.length > 0 ? matchedTransactions[0].blockNumber : 0,
        endBlock: matchedTransactions.length > 0 ? matchedTransactions[matchedTransactions.length - 1].blockNumber : 0,
        transactionCount: matchedTransactions.length,
        protocolStatistics: protocolStats
      },
      transactions: matchedTransactions
    };

    console.log(`\n输出所有交易到一个文件:`);
    console.log(`- 总交易数量: ${matchedTransactions.length}`);
    console.log(`- 输出文件: ${allTransactionsFile}`);

    await writeFile(
      allTransactionsFile,
      JSON.stringify(allTransactionsData, null, 2),
      'utf-8'
    );

    // 输出汇总信息
    const summaryFile = path.join(outputDir, 'protocol_summary.json');
    const summary = {
      totalFilesProcessed,
      totalTransactionsProcessed,
      totalMatchedTransactions: matchedTransactions.length,
      targetProtocolCombinations: TARGET_PROTOCOL_COMBINATIONS,
      protocolStatistics: protocolStats,
      timestamp: new Date().toISOString(),
      summary: {
        startBlock: matchedTransactions.length > 0 ? matchedTransactions[0].blockNumber : 0,
        endBlock: matchedTransactions.length > 0 ? matchedTransactions[matchedTransactions.length - 1].blockNumber : 0,
        transactionCount: matchedTransactions.length
      }
    };

    await writeFile(
      summaryFile,
      JSON.stringify(summary, null, 2),
      'utf-8'
    );

    console.log('\n处理完成!');
    console.log(`总共处理了 ${totalFilesProcessed} 个文件`);
    console.log(`总共处理了 ${totalTransactionsProcessed} 个交易`);
    console.log(`找到 ${matchedTransactions.length} 个匹配的交易`);
    console.log(`结果已保存到目录: ${outputDir}`);
    
    console.log('\n协议组合统计:');
    Object.entries(protocolStats).forEach(([protocol, count]) => {
      console.log(`- ${protocol}: ${count} 笔交易`);
    });
    
  } catch (error) {
    console.error('处理过程中发生错误:', error);
  }
}

// 使用示例
const batchesDir = '/home/os/haotian/base_arb_research/data/arbitrage_analysis_full/batches';
const outputDir = '/home/os/haotian/base_arb_research/data/protocol_arbitrage_transactions';

// 执行提取
extractTransactionsByProtocol(batchesDir, outputDir); 