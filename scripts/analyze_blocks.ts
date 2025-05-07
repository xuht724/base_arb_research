import { AnalysisHelper } from "../src/lib/chain/analysis.helper";
import fs from 'fs';
import path from 'path';

interface TransactionAnalysis {
  txHash: string;
  blockNumber: number;
}

interface AnalysisResult {
  transactions: TransactionAnalysis[];
}

async function main() {
  const rpcUrl = process.env.BASE_HTTP_URL3!;
  const helper = new AnalysisHelper(rpcUrl);

  // 创建日志目录
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 读取交易分析结果文件
  const analysisResultPath = '/home/os/haotian/base_arb_research/data/transaction_analysis_result_2.json';
  const analysisResult: AnalysisResult = JSON.parse(fs.readFileSync(analysisResultPath, 'utf-8'));

  // 获取所有需要分析的区块号
  const blockNumbers = new Set(analysisResult.transactions.map(tx => tx.blockNumber));
  console.log(`需要分析 ${blockNumbers.size} 个区块\n`);

  // 创建输出目录
  const outputDir = path.join(__dirname, '../data/multi_block_analysis');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 分析每个区块
  const allResults = [];
  let processedBlocks = 0;

  for (const blockNumber of blockNumbers) {
    try {
      console.log(`分析区块 ${blockNumber} (${++processedBlocks}/${blockNumbers.size})`);
      
      const result = await helper.analyzeBlockArbitrage(blockNumber);
      console.log(`发现 ${result.totalArbitrageTxs} 笔套利交易`);
      
      // 保存单个区块的结果
      const blockOutputFile = path.join(outputDir, `arbitrage_block_${blockNumber}.json`);
      fs.writeFileSync(blockOutputFile, JSON.stringify(result, null, 2));

      allResults.push(result);

      console.log(`区块 ${blockNumber} 分析完成`);
    } catch (error) {
      console.error(`分析区块 ${blockNumber} 时出错:`, error);
      // 继续分析下一个区块
      continue;
    }

    break;
  }

  // 保存汇总结果
  const summaryOutputFile = path.join(outputDir, 'analysis_summary.json');
  fs.writeFileSync(summaryOutputFile, JSON.stringify({
    totalBlocks: blockNumbers.size,
    totalArbitrageTxs: allResults.reduce((sum, result) => sum + result.totalArbitrageTxs, 0),
    blocks: allResults
  }, null, 2));

  console.log(`\n分析完成！汇总结果已保存到: ${summaryOutputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 