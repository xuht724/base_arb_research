import { logTopicsMap } from "src/common/events";
import { AnalysisHelper } from "../src/lib/chain/analysis.helper";
import { formatEther, formatUnits } from "viem";

async function main() {
  // 检查命令行参数
  const txHash = process.argv[2];
  if (!txHash) {
    console.error('请提供交易哈希作为参数');
    console.error('使用方法: bun run scripts/analyze_tx.ts <txHash>');
    console.error('示例: bun run scripts/analyze_tx.ts 0xe83a3af22e28d4c7bf929ea3a4361a8df6380ea4aeddac044a13f3d22564dfa0');
    process.exit(1);
  }

  // 检查环境变量
  if (!process.env.BASE_HTTP_URL3) {
    console.error('请设置 BASE_HTTP_URL3 环境变量');
    process.exit(1);
  }

  const helper = new AnalysisHelper(process.env.BASE_HTTP_URL3);
  
  console.log(`\n🔍 分析交易: ${txHash}`);
  
  const result = await helper.analyzeTransaction(txHash);
  if (!result) {
    console.log("❌ 交易分析失败");
    return;
  }

  // 打印基本信息
  console.log("\n📝 交易基本信息:");
  console.log(`交易哈希: ${result.txHash}`);
  console.log(`发送方: ${result.from}`);
  console.log(`接收方: ${result.to}`);
  console.log(`Gas使用: ${result.gasUsed}`);
  console.log(`Gas价格: ${formatEther(BigInt(result.gasPrice))} ETH`);
  console.log(`Gas费用: ${formatEther(BigInt(result.gasUsed) * BigInt(result.gasPrice))} ETH`);
  console.log(`空输入: ${result.isEmptyInput ? "是" : "否"}`);

  // 打印涉及的协议
  console.log("\n🔄 涉及的协议:");
  result.involvedProtocols.forEach(protocol => console.log(`- ${protocol}`));

  // 打印涉及的代币
  console.log("\n💰 涉及的代币:");
  result.involvedTokens.forEach(token => 
    console.log(`- ${token.symbol || token.address}`)
  );

  // 打印Swap事件
  console.log("\n💱 Swap事件:");
  result.swapEvents.forEach((swap, index) => {
    console.log(`\n[${index + 1}] ${swap.protocol} - ${swap.poolAddress}`);
    console.log(`输入: ${swap.tokenIn.amount} ${swap.tokenIn.symbol || swap.tokenIn.address}`);
    console.log(`输出: ${swap.tokenOut.amount} ${swap.tokenOut.symbol || swap.tokenOut.address}`);
  });

  // 如果是套利交易
  if (result.isArbitrage && result.arbitrageInfo) {
    console.log("\n✨ 套利分析:");
    console.log(`类型: ${result.arbitrageInfo.type}`);
    
    if (result.arbitrageInfo.profit) {
      console.log(`\n💰 利润信息:`);
      console.log(`代币: ${result.arbitrageInfo.profit.symbol || result.arbitrageInfo.profit.token}`);
      console.log(`数量: ${result.arbitrageInfo.profit.formattedAmount || result.arbitrageInfo.profit.amount}`);
    }

    if (result.arbitrageInfo.arbitrageCycles) {
      console.log("\n🔄 套利环:");
      result.arbitrageInfo.arbitrageCycles.forEach((cycle, index) => {
        console.log(`\n环 ${index + 1}:`);
        console.log(`利润代币: ${cycle.profitToken}`);
        console.log(`利润数量: ${cycle.profitAmount}`);
        console.log("路径:");
        cycle.edges.forEach((edge, edgeIndex) => {
          console.log(`${edgeIndex + 1}. ${edge.tokenIn} -> ${edge.tokenOut} (${edge.amountIn} -> ${edge.amountOut}) ${edge.poolAddress}`);
        });
        console.log("代币变化:");
        Object.entries(cycle.tokenChanges).forEach(([token, change]) => {
          console.log(`- ${token}: ${change}`);
        });
      });
    }

    // 打印代币变化
    console.log("\n📊 代币变化:");
    Object.entries(result.tokenChanges).forEach(([token, change]) => {
      console.log(`- ${token}: ${change}`);
    });

    // 打印地址代币变化
    console.log("\n👥 地址代币变化:");
    Object.entries(result.addressTokenChanges).forEach(([address, changes]) => {
      console.log(`\n地址: ${address}`);
      changes.forEach(change => {
        console.log(`- ${change.symbol || change.token}: ${change.change}`);
      });
    });
  } else {
    console.log("\n❌ 非套利交易");
  }
}

main().catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
}); 