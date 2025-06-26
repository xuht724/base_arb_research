import { ArbHelper } from '../lib/chain/arb.helper';
import { logTopicsMap } from '../common/events';
import fs from 'fs';
import path from 'path';
import { replacer } from 'src/lib/utils';

async function main() {
  const RPC_URL = process.env.BASE_HTTP_URL;
  const THE_GRAPH_API_KEY = process.env.THE_GRAPH_API_KEY;
  if(!RPC_URL || !THE_GRAPH_API_KEY){
    throw new Error('RPC_URL or THE_GRAPH_API_KEY is not set');
  }
  const helper = new ArbHelper(RPC_URL, THE_GRAPH_API_KEY);

  // 要分析的区块范围
  const startBlock = 29288528; // 替换为实际的起始区块
  const endBlock = 29288625;   // 替换为实际的结束区块

  const results: any[] = [];

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    console.log(`Processing block ${blockNumber}...`);

    const block = await helper.getBlockWithReceipts(blockNumber);
    if (!block) continue;

    // 过滤出包含Balancer或Curve事件的交易
    const balancerCurveTxs = block.transactions.filter((tx: any) => {
      const receipt = block.receipts.find((r: any) => r.transactionHash === tx.hash);
      if (!receipt) return false;

      return receipt.logs.some((log: any) => {
        const topic = log.topics[0];
        return (
          topic === logTopicsMap.BalancerVaultSwap ||
          topic === logTopicsMap.CurveTokenExchange ||
          topic === logTopicsMap.CurveTokenExchange2 ||
          topic === logTopicsMap.CurveTokenExchange3 || 
          topic === logTopicsMap.UniswapV4Swap
        );
      });
    });

    // 分析每个交易
    for (const tx of balancerCurveTxs) {
      const receipt = block.receipts.find((r: any) => r.transactionHash === tx.hash);
      if (!receipt) continue;

      // 获取交易分析结果
      const analysis = await helper.analyzeTransaction(
        tx,
        receipt,
        blockNumber,
        new Map(),
        0
      );

      if (analysis?.arbitrageInfo) {
        results.push({
          blockNumber,
          txHash: tx.hash,
          ...analysis
        });
      }
    }
  }

  // 保存结果
  const outputPath = path.join(__dirname, '../../data/balancer_curve_arb.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, replacer, 2));
  console.log(`Results saved to ${outputPath}`);
}

main().catch(console.error); 