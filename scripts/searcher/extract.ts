import * as fs from 'fs';
import * as path from 'path';
import { WETH_ADDRESS } from 'src/common/constants';
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

async function ensureDirectoryExists(dir: string) {
  try {
    await fs.promises.access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

async function extractTransactionsByAddress(
  batchesDir: string,
  targetAddress: string,
  outputDir: string,
  groupByBlock: boolean = false
) {
  try {
    console.log(`开始处理目录: ${batchesDir}`);
    console.log(`目标地址: ${targetAddress}`);
    console.log(`按区块分组: ${groupByBlock ? '是' : '否'}`);

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
    let currentBatchStartBlock = -1; // 初始化为-1，在第一个交易时设置
    let currentBatchTransactions: ProcessedArbitrageTransaction[] = [];
    const batchSummaries: BatchSummary[] = [];

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
        // 检查交易是否与目标地址相关
        // 如果是第一个匹配的交易，设置起始区块
        if (currentBatchStartBlock === -1) {
          currentBatchStartBlock = tx.blockNumber;
        }
        if (
          tx.transaction.to.toLowerCase() === targetAddress.toLowerCase()
        ) {

          const { poolsMatch, tokensMatch, amountsMatch } = tx.transaction.inputAnalysis.flags;
          const flag = (!poolsMatch) && (!tokensMatch) && (!amountsMatch);
          if (!flag) {
            continue;
          }

          // 转换gasUsed为数字
          const processedTx: ProcessedArbitrageTransaction = {
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp,
            transaction: {
              ...tx.transaction,
              gasUsed: parseInt(tx.transaction.gasUsed, 16),
              protocolCombination: extractProtocolCombination(tx.transaction.arbitrageInfo)
            }
          };

          matchedTransactions.push(processedTx);
          currentBatchTransactions.push(processedTx);
          matchesInFile++;

          // 根据groupByBlock参数决定是否按区块分组输出
          if (groupByBlock && processedTx.blockNumber - currentBatchStartBlock >= 10000) {
            // 对当前批次进行排序
            currentBatchTransactions.sort((a, b) => a.blockNumber - b.blockNumber);

            const batchEndBlock = currentBatchTransactions[currentBatchTransactions.length - 1].blockNumber;
            const batchOutputFile = path.join(outputDir, `batch_${currentBatchStartBlock}_${batchEndBlock}.json`);

            // 计算批次统计信息
            const batchSummary: BatchSummary = {
              startBlock: currentBatchStartBlock,
              endBlock: batchEndBlock,
              transactionCount: currentBatchTransactions.length
            };

            batchSummaries.push(batchSummary);

            // 将统计信息添加到批次数据中
            const batchData = {
              summary: batchSummary,
              transactions: currentBatchTransactions
            };

            console.log(`\n输出区块范围 ${currentBatchStartBlock}-${batchEndBlock} 的结果:`);
            console.log(`- 交易数量: ${currentBatchTransactions.length}`);
            console.log(`- 输出文件: ${batchOutputFile}`);

            await writeFile(
              batchOutputFile,
              JSON.stringify(batchData, null, 2),
              'utf-8'
            );

            // 重置当前批次
            currentBatchStartBlock = batchEndBlock + 1;
            currentBatchTransactions = [];
          }
        }
      }

      console.log(`  文件 ${file} 中:`);
      console.log(`  - 总交易数: ${transactionsInFile}`);
      console.log(`  - 匹配交易数: ${matchesInFile}`);
      console.log(`  - 当前累计匹配交易数: ${matchedTransactions.length}`);
    }

    // 处理剩余的交易
    if (currentBatchTransactions.length > 0) {
      currentBatchTransactions.sort((a, b) => a.blockNumber - b.blockNumber);
      const lastTx = currentBatchTransactions[currentBatchTransactions.length - 1];
      const finalBatchFile = path.join(outputDir, `batch_${currentBatchStartBlock}_${lastTx.blockNumber}.json`);

      // 计算最后一批的统计信息
      const batchSummary: BatchSummary = {
        startBlock: currentBatchStartBlock,
        endBlock: lastTx.blockNumber,
        transactionCount: currentBatchTransactions.length
      };

      batchSummaries.push(batchSummary);

      // 将统计信息添加到批次数据中
      const batchData = {
        summary: batchSummary,
        transactions: currentBatchTransactions
      };

      console.log(`\n输出最后一批结果 (区块范围 ${currentBatchStartBlock}-${lastTx.blockNumber}):`);
      console.log(`- 交易数量: ${currentBatchTransactions.length}`);
      console.log(`- 输出文件: ${finalBatchFile}`);

      await writeFile(
        finalBatchFile,
        JSON.stringify(batchData, null, 2),
        'utf-8'
      );
    }

    // 如果不按区块分组，输出所有交易到一个文件
    if (!groupByBlock) {
      const allTransactionsFile = path.join(outputDir, 'all_transactions.json');
      const allTransactionsData = {
        summary: {
          startBlock: matchedTransactions[0].blockNumber,
          endBlock: matchedTransactions[matchedTransactions.length - 1].blockNumber,
          transactionCount: matchedTransactions.length
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
    }

    // 输出汇总信息
    const summaryFile = path.join(outputDir, 'summary.json');
    const summary = {
      totalFilesProcessed,
      totalTransactionsProcessed,
      totalMatchedTransactions: matchedTransactions.length,
      batchCount: groupByBlock ? batchSummaries.length : 1,
      targetAddress,
      timestamp: new Date().toISOString(),
      batches: groupByBlock ? batchSummaries : [{
        startBlock: matchedTransactions[0].blockNumber,
        endBlock: matchedTransactions[matchedTransactions.length - 1].blockNumber,
        transactionCount: matchedTransactions.length
      }]
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
    console.log(`共输出 ${groupByBlock ? batchSummaries.length : 1} 个文件`);
  } catch (error) {
    console.error('处理过程中发生错误:', error);
  }
}

// 修改函数来提取套利周期的协议组合，返回字符串数组
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
        if (edge.protocol && !protocols.includes(edge.protocol)) {
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

// 使用示例
const batchesDir = '/home/os/haotian/base_arb_research/data/arbitrage_analysis_full/batches';
const targetAddress = '0x000000b5e5e21a745f7e7de7d7135c7a63db69f1'.toLowerCase(); // 替换为你要查找的地址
const outputDir = `/home/os/haotian/base_arb_research/data/matched_transactions_${targetAddress}`;

// 设置为false则不按区块分组，所有交易输出到一个文件
extractTransactionsByAddress(batchesDir, targetAddress, outputDir, false); 