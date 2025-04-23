import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { ChainHelper } from "../../lib/chain/helper";
import cliProgress from "cli-progress";
import { replacer } from "src/lib/utils";

interface Transaction {
  blockNumber: string;
  hash: string;
  gasUsed: string;
  timeStamp: string;
  input: string;
}

interface AnalysisResult {
  statistics: {
    totalTransactions: number;
    minBlockNumber: string;
    maxBlockNumber: string;
    minTimestamp: string;
    maxTimestamp: string;
    timeRangeHours: number;
    nonEmptyInputCount: number;
    emptyInputCount: number;
    highGasTransactionCount: number;
  };
  transactions: Array<{
    hash: string;
    blockNumber: string;
    gasUsed: string;
    analysis?: any;
    error?: string;
  }>;
}

async function main() {
  // 读取CSV文件
  const csvData = readFileSync("./data/all_transactions_7d_by_blocks.csv", "utf-8");
  
  // 解析CSV数据
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true
  }) as Transaction[];

  const total = records.length;
  
  // 获取区块号范围
  const blockNumbers = records.map(record => BigInt(record.blockNumber));
  const minBlockNumber = blockNumbers.reduce((min, current) => current < min ? current : min, blockNumbers[0]).toString();
  const maxBlockNumber = blockNumbers.reduce((max, current) => current > max ? current : max, blockNumbers[0]).toString();

  // 筛选gasUsed大于50w的交易
  const highGasThreshold = 500000;
  const highGasTransactions = records.filter(record => {
    const gasUsed = Number(record.gasUsed);
    return gasUsed > highGasThreshold;
  });

  // 统计时间范围
  const timestamps = records.map(record => new Date(record.timeStamp).getTime());
  const minTimestamp = timestamps.reduce((min, current) => Math.min(min, current), Infinity);
  const maxTimestamp = timestamps.reduce((max, current) => Math.max(max, current), -Infinity);
  const timeRange = maxTimestamp - minTimestamp;

  // 过滤掉input != "0x"的交易
  const nonEmptyInputTransactions = records.filter(record => record.input !== "0x");

  const result: AnalysisResult = {
    statistics: {
      totalTransactions: total,
      minBlockNumber,
      maxBlockNumber,
      minTimestamp: new Date(minTimestamp).toISOString(),
      maxTimestamp: new Date(maxTimestamp).toISOString(),
      timeRangeHours: Number((timeRange / (1000 * 3600)).toFixed(2)),
      nonEmptyInputCount: nonEmptyInputTransactions.length,
      emptyInputCount: total - nonEmptyInputTransactions.length,
      highGasTransactionCount: highGasTransactions.length
    },
    transactions: []
  };

  const helper = new ChainHelper(process.env.BASE_HTTP_URL3!);

  // 创建进度条
  const progressBar = new cliProgress.SingleBar({
    format: '进度: {bar} {percentage}% | {value}/{total} | 耗时: {duration}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  // 开始进度条
  progressBar.start(highGasTransactions.length, 0);

  // 分析每笔高gas交易
  for (let i = 0; i < highGasTransactions.length; i++) {
    const transaction = highGasTransactions[i];
    try {
      const {receipt} = await helper.downloadReceipt(transaction.hash);
      if(receipt.logs.length > 0) {
        const transactionResult = {
          hash: transaction.hash,
          blockNumber: transaction.blockNumber,
          gasUsed: transaction.gasUsed,
          analysis: helper.analyseReceipt(receipt)
        };
        result.transactions.push(transactionResult);
      }
    } catch (error) {
      console.error(`分析交易 ${transaction.hash} 时出错:`, error);
    }
    // 更新进度条
    progressBar.update(i + 1);
    // 每分析完一笔交易就写入一次文件
    writeFileSync("./data/transaction_analysis.json", JSON.stringify(result, replacer, 2));
  }

  // 停止进度条
  progressBar.stop();
}

main();
