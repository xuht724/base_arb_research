import fs, { readFileSync } from 'fs';
import path from 'path';
import { parse } from "csv-parse/sync";
interface Transaction {
  hash: string;
  blockNumber: string;
  gasUsed: string;
  gasPrice: string;
  analysis?: {
    trxHash: string;
    blockNumber: string;
    logNum: number;
    potentialArb: boolean;
    effectiveGasPrice: string;
    gasUsed: string;
    l2Fee: string;
    profit: string;
  };
  error?: string;
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
  transactions: Transaction[];
}

// 读取transaction_analysis.json文件
const filePath = './data/transaction_analysis.json';
const rawData = fs.readFileSync(filePath, 'utf-8');
const data: AnalysisResult = JSON.parse(rawData);


let totalFee = 0;
let totalProfit = 0;

// 遍历所有交易
for (const transaction of data.transactions) {
  if (transaction.analysis) {
    // 累加gas费用
    totalFee += parseFloat(transaction.analysis.l2Fee);
    // 累加利润
    totalProfit += parseFloat(transaction.analysis.profit);
  }
}

// 计算净收益
const netProfit = totalProfit - totalFee;

console.log('总gas费用:', totalFee.toFixed(8));
console.log('总利润:', totalProfit.toFixed(8));
console.log('净收益:', netProfit.toFixed(8));

// const csvData = readFileSync("./data/all_transactions_7d_by_blocks.csv", "utf-8");
  
// // 解析CSV数据
// const records = parse(csvData, {
//   columns: true,
//   skip_empty_lines: true
// }) as Transaction[];

// const total = records.length;

// // 计算所有交易的总gas费用
// const totalGasFee = records.reduce((sum, record) => {
//   const gasUsed = BigInt(record.gasUsed);
//   const gasPrice = BigInt(record.gasPrice);
//   return sum + (gasUsed * gasPrice);
// }, 0n);

// console.log('总gas费用(wei):', totalGasFee.toString());
// console.log('总gas费用(ETH):', (Number(totalGasFee) / 1e18).toFixed(8));

// fs.writeFileSync('./data/pair_analysis.json', JSON.stringify(result, null, 2));