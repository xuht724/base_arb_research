import { ArbHelper } from "../src/lib/chain/arb.helper";

async function main() {
  const RPC_URL = process.env.BASE_HTTP_URL;
  const THE_GRAPH_API_KEY = process.env.THE_GRAPH_API_KEY;
  if (!RPC_URL || !THE_GRAPH_API_KEY) {
    throw new Error('RPC_URL or THE_GRAPH_API_KEY is not set');
  }
  const helper = new ArbHelper(RPC_URL, THE_GRAPH_API_KEY);
  const txHash = "0x9a3bdb6da2c92ea008f4b7c22478df5240c370a9247383eceb07f2e740b305d0";
  const transaction = await helper.httpClient.getTransaction({
    hash: txHash as `0x${string}`,
  });
  const receipt = await helper.httpClient.getTransactionReceipt({
    hash: txHash as `0x${string}`,
  });
  // 获取交易分析结果
  const analysis = await helper.analyzeTransaction(
    transaction,
    receipt,
    Number(transaction.blockNumber),
    new Map(),
    receipt.transactionIndex
  );
  console.log(analysis);
}
main();