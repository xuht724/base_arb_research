import { AnalysisHelper } from "../src/lib/chain/analysis.helper";
import fs from 'fs';
import path from 'path';

async function main() {
  const blockNumber = 29232581;
  const rpcUrl = process.env.BASE_HTTP_URL3!;
  const helper = new AnalysisHelper(rpcUrl);

  console.log(`\n=== 分析区块 ${blockNumber} 的套利交易 ===\n`);

  const result = await helper.analyzeBlockArbitrage(blockNumber);
  
  console.log(`发现 ${result.totalArbitrageTxs} 笔套利交易\n`);

  // 打印每个套利交易的详细信息
  for (const arb of result.arbitrageTxs) {
    console.log(`交易哈希: ${arb.txHash}`);
    console.log(`套利类型: ${arb.type}`);
    if (arb.previousTxHash) {
      console.log(`前序交易: ${arb.previousTxHash}`);
    }
    console.log("\n套利路径:");
    
    for (let i = 0; i < arb.swapEvents.length; i++) {
      const swap = arb.swapEvents[i];
      console.log(`${i + 1}. ${swap.tokenIn.symbol || swap.tokenIn.address} -> ${swap.tokenOut.symbol || swap.tokenOut.address}`);
      console.log(`   数量: ${swap.tokenIn.amount} -> ${swap.tokenOut.amount}`);
      console.log(`   协议: ${swap.protocol}`);
      console.log(`   池子: ${swap.poolAddress}`);
    }

    // 打印token变化信息
    console.log("\nSwap Graph中的Token变化量:");
    for (const [token, change] of Object.entries(arb.graphTokenChanges)) {
      const tokenInfo = arb.involvedTokens.find(t => t.address === token);
      console.log(`${tokenInfo?.symbol || token}: ${change}`);
    }

    console.log("\n地址代币变化量:");
    for (const [address, changes] of Object.entries(arb.addressTokenChanges)) {
      console.log(`\n地址: ${address}`);
      for (const change of changes) {
        console.log(`${change.symbol || change.token}: ${change.change}`);
      }
    }

    console.log("\n" + "=".repeat(80) + "\n");
  }

  // 保存结果到JSON文件
  const outputDir = path.join(__dirname, '../data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `arbitrage_block_${blockNumber}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

  console.log(`\n结果已保存到: ${outputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 