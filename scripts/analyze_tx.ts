import { logTopicsMap } from "src/common/events";
import { AnalysisHelper } from "../src/lib/chain/analysis.helper";
import { formatEther, formatUnits } from "viem";

async function main() {
  const helper = new AnalysisHelper(process.env.BASE_HTTP_URL3!);
  
  // 要分析的交易哈希
  const txHash = "0x58bf9238276bd9b947e9786a92539f0aefc2511a73c5ff82ca282183646786bb";
  
  console.log(`分析交易: ${txHash}`);
  
  // 获取交易收据
  const receipt = await helper.httpClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (!receipt) {
    console.log("交易不存在");
    return;
  }
  
  console.log("\n交易详情:");
  console.log(`区块号: ${receipt.blockNumber}`);
  console.log(`交易序号: ${receipt.transactionIndex}`);
  console.log(`Gas使用: ${receipt.gasUsed}`);

  // 收集swap事件
  const swapEvents = [];
  for (const log of receipt.logs) {
    if(log.topics[0]== logTopicsMap.V2Swap || log.topics[0]== logTopicsMap.V3Swap || log.topics[0]== logTopicsMap.AeroV2Swap || log.topics[0]== logTopicsMap.PancakeV3Swap){
      const poolInfo = await helper.requestPoolInfo(log.address);
      if (!poolInfo) continue;
      
      const swapEvent = helper.parseSwapEvent(log, poolInfo);
      if (swapEvent) {
        swapEvents.push(swapEvent);
      }
    }
  }
  
  console.log("\nSwap事件:");
  for (const swap of swapEvents) {
    const tokenInInfo = await helper.requestTokenInfo(swap.tokenIn);
    const tokenOutInfo = await helper.requestTokenInfo(swap.tokenOut);
    console.log(`Pool: ${swap.poolAddress}`);
    console.log(`输入: ${formatUnits(swap.amountIn, tokenInInfo?.decimals || 18)} ${tokenInInfo?.symbol || swap.tokenIn}`);
    console.log(`输出: ${formatUnits(swap.amountOut, tokenOutInfo?.decimals || 18)} ${tokenOutInfo?.symbol || swap.tokenOut}`);
    console.log(`发送方: ${swap.sender}`);
    console.log(`接收方: ${swap.recipient}`);
    console.log("---");
  }
  
  // 检查是否为套利交易
  const isArbitrage = helper.isArbitrageTransaction(swapEvents);
  console.log(`\n是否为套利交易: ${isArbitrage ? "是" : "否"}`);
  
  if (isArbitrage) {
    // 构建swap graph并计算token变化
    const graph = helper.buildSwapGraph(swapEvents);
    const graphTokenChanges = helper.calculateSwapGraphTokenChanges(graph);
    
    console.log("\nSwap Graph中的Token变化量:");
    console.log(graphTokenChanges);

    // for (const [token, change] of graphTokenChanges.entries()) {
    //   const tokenInfo = await helper.requestTokenInfo(token);
    //   const formattedChange = formatUnits(change, tokenInfo?.decimals || 18);
    //   const sign = change > 0n ? "+" : "";
    //   console.log(`${tokenInfo?.symbol || token}: ${sign}${formattedChange}`);
    // }
  }
  
  // 分析ERC20 Transfer事件
  const tokenChanges = await helper.analyzeTokenTransfers(receipt.logs);
  
  console.log("\n地址代币变化量分析:");
  for (const [address, changes] of tokenChanges.entries()) {
    console.log(`\n地址: ${address}`);
    for (const change of changes) {
      const tokenInfo = await helper.requestTokenInfo(change.token);
      const formattedChange = formatUnits(change.change, change.decimals);
      const sign = change.change > 0n ? "+" : "";
      console.log(`${tokenInfo?.symbol || change.token}: ${sign}${formattedChange}`);
    }
  }
}

main().catch(console.error); 