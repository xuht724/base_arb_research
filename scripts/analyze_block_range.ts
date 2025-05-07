import { AnalysisHelper } from "../src/lib/chain/analysis.helper";
import fs from 'fs';
import path from 'path';

interface BlockRange {
  startBlock: number;
  endBlock: number;
}

interface BlockResult {
  blockNumber: number;
  result: any;
  timestamp: string;
}

async function main() {
  const rpcUrl = process.env.BASE_HTTP_URL3!;
  const helper = new AnalysisHelper(rpcUrl);

  // 创建输出目录
  const outputDir = path.join(__dirname, '../data/block_range_analysis');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 设置区块范围
  const startBlock = 29304281; // 示例起始区块
  const endBlock = 29305281;   // 示例结束区块
  const blocksPerFile = 100;   // 每个文件存储的区块数

  console.log(`开始分析区块范围: ${startBlock} - ${endBlock}\n`);

  // 计算需要多少个文件
  const totalBlocks = endBlock - startBlock + 1;
  const totalFiles = Math.ceil(totalBlocks / blocksPerFile);

  // 分析每个区块范围
  for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
    const currentStartBlock = startBlock + fileIndex * blocksPerFile;
    const currentEndBlock = Math.min(currentStartBlock + blocksPerFile - 1, endBlock);
    
    console.log(`\n分析区块范围 ${currentStartBlock} - ${currentEndBlock} (${fileIndex + 1}/${totalFiles})`);
    
    const results: BlockResult[] = [];
    let totalArbitrageTxs = 0;

    // 检查是否存在已分析的文件
    const tempFile = path.join(outputDir, `temp_blocks_${currentStartBlock}_${currentEndBlock}.json`);
    if (fs.existsSync(tempFile)) {
      const tempData = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
      results.push(...tempData.results);
      totalArbitrageTxs = tempData.totalArbitrageTxs;
      console.log(`从临时文件恢复 ${results.length} 个区块的分析结果`);
    }

    // 分析当前范围内的每个区块
    for (let blockNumber = currentStartBlock; blockNumber <= currentEndBlock; blockNumber++) {
      // 检查是否已经分析过这个区块
      if (results.some(r => r.blockNumber === blockNumber)) {
        continue;
      }

      try {
        console.log(`[${new Date().toISOString()}] 分析区块 ${blockNumber} (${blockNumber - currentStartBlock + 1}/${currentEndBlock - currentStartBlock + 1})`);
        
        const result = await helper.analyzeBlockArbitrage(blockNumber);
        totalArbitrageTxs += result.totalArbitrageTxs;
        
        // 添加新的分析结果
        results.push({
          blockNumber,
          result,
          timestamp: new Date().toISOString()
        });

        console.log(`[${new Date().toISOString()}] 区块 ${blockNumber} 分析完成，发现 ${result.totalArbitrageTxs} 笔套利交易`);

        // 每分析一个区块就保存一次临时文件
        fs.writeFileSync(tempFile, JSON.stringify({
          startBlock: currentStartBlock,
          endBlock: currentEndBlock,
          totalBlocks: currentEndBlock - currentStartBlock + 1,
          totalArbitrageTxs,
          results
        }, null, 2));

        // 添加延迟以避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[${new Date().toISOString()}] 分析区块 ${blockNumber} 时出错:`, error);
        // 保存当前进度
        fs.writeFileSync(tempFile, JSON.stringify({
          startBlock: currentStartBlock,
          endBlock: currentEndBlock,
          totalBlocks: currentEndBlock - currentStartBlock + 1,
          totalArbitrageTxs,
          results
        }, null, 2));
        // 继续分析下一个区块
        continue;
      }
    }

    // 保存当前范围的最终结果
    const outputFile = path.join(outputDir, `arbitrage_blocks_${currentStartBlock}_${currentEndBlock}.json`);
    fs.writeFileSync(outputFile, JSON.stringify({
      startBlock: currentStartBlock,
      endBlock: currentEndBlock,
      totalBlocks: currentEndBlock - currentStartBlock + 1,
      totalArbitrageTxs,
      blocks: results.map(r => r.result)
    }, null, 2));

    // 删除临时文件
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    console.log(`[${new Date().toISOString()}] 区块范围 ${currentStartBlock} - ${currentEndBlock} 分析完成，发现 ${totalArbitrageTxs} 笔套利交易`);
  }

  // 保存汇总结果
  const summaryFile = path.join(outputDir, 'analysis_summary.json');
  const summary = {
    startBlock,
    endBlock,
    totalBlocks,
    totalFiles,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  console.log(`[${new Date().toISOString()}] 分析完成！汇总信息已保存到: ${summaryFile}`);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] 发生错误:`, error);
  process.exit(1);
}); 