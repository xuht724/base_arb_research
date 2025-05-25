import { AnalysisHelper } from "/Users/coldcoconut/Documents/GitHub/base_arb_research/src/lib/chain/analysis.helper.tx.ts";

async function main() {
  const helper = new AnalysisHelper("https://mainnet.base.org");
  const txHash = "0x805626c44b777d1e4da6216b90782818a3c4f37f1af12632e80b811a92dda7bb"; 

  const result = await helper.analyzeTransactionArbitrage(txHash);

  if (result) {
    console.log("✅ Arbitrage Detected:");
    console.dir(result, { depth: null });
  } else {
    console.log("❌ Not arbitrage or decode failed");
  }
}

main();
