import { createPublicClient, decodeEventLog, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

// 使用更可靠的RPC选项
const RPC_URLS = [
  process.env.RPC_URL,
  'https://base-mainnet.g.alchemy.com/v2/Hlbk2P_Ak05o1rWZuwTmhUlY-UHYgEqz',
  'https://base.publicnode.com',
];

// 使用第一个可用的RPC URL
const rpcUrl = RPC_URLS.find(url => url) || 'https://base-mainnet.g.alchemy.com/v2/Hlbk2P_Ak05o1rWZuwTmhUlY-UHYgEqz';

console.log(`使用的RPC URL: ${rpcUrl}`);

const client = createPublicClient({
  chain: base,
  transport: http(rpcUrl)
});

// Base链上的Balancer Vault地址
const BALANCER_VAULT_ADDRESS = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

// Balancer Swap事件ABI
const balancerSwapABI = [{
  anonymous: false,
  inputs: [
    { indexed: true, name: 'poolId', type: 'bytes32' },
    { indexed: true, name: 'tokenIn', type: 'address' },
    { indexed: true, name: 'tokenOut', type: 'address' },
    { indexed: false, name: 'amountIn', type: 'uint256' },
    { indexed: false, name: 'amountOut', type: 'uint256' }
  ],
  name: 'Swap',
  type: 'event'
}] as const;

// Swap事件的签名
const SWAP_EVENT_SIGNATURE = '0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b';

// Balancer解码函数 - 可用于您的analysis.helper.ts中
function decodeBalancerSwap(log: any, poolInfoMap: any = {}) {
  try {
    const decoded = decodeEventLog({
      abi: balancerSwapABI,
      data: log.data,
      topics: log.topics,
    });
    
    const { poolId, tokenIn, tokenOut, amountIn, amountOut } = decoded.args;
    
    // 获取交易发起人 (对于Balancer, 这需要单独查询交易详情来获取)
    // 这里简化处理，实际中可能需要查询transaction sender
    const sender = '0x0000000000000000000000000000000000000000'; // 示例地址
    const recipient = '0x0000000000000000000000000000000000000000'; // 示例地址
    
    // 当前池子信息，如果需要更多信息可以从poolInfoMap获取
    const poolInfo = poolInfoMap[poolId] || {
      protocol: 'Balancer'
    };
    
    return {
      poolId: poolId.toLowerCase(),
      poolAddress: log.address.toLowerCase(),
      protocol: poolInfo.protocol || 'Balancer',
      tokenIn: tokenIn.toLowerCase(),
      tokenOut: tokenOut.toLowerCase(),
      amountIn,
      amountOut,
      sender,
      recipient,
    };
  } catch (error) {
    console.error('解码Balancer Swap事件出错:', error);
    return null;
  }
}

// 用于检查特定交易的函数
async function checkSpecificTransaction(txHash: `0x${string}`) {
  console.log(`正在查找交易: ${txHash}`);
  
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    
    console.log(`交易已找到！区块号: ${receipt.blockNumber}`);
    
    let foundSwapEvent = false;
    for (const log of receipt.logs) {
      // 检查是否是Balancer Vault合约的日志
      if (log.address.toLowerCase() === BALANCER_VAULT_ADDRESS.toLowerCase()) {
        console.log('找到Balancer Vault的日志');
        
        // 检查是否是Swap事件
        if (log.topics[0] === SWAP_EVENT_SIGNATURE) {
          console.log('找到Swap事件！');
          
          // 使用我们的解码函数
          const decodedSwap = decodeBalancerSwap(log);
          
          console.log('✅ 解码的Balancer Swap事件:');
          console.dir(decodedSwap, { depth: null });
          foundSwapEvent = true;
        }
      }
    }
    
    if (!foundSwapEvent) {
      console.log('此交易中未找到Balancer Swap事件');
    }
    
    return foundSwapEvent;
  } catch (error) {
    console.error('获取交易时出错:', error);
    return false;
  }
}

// 分块获取日志以遵守500区块的限制
async function fetchLogsInChunks(fromBlock: bigint, toBlock: bigint, chunkSize = 200n) {
  const allLogs = [];
  let currentFromBlock = fromBlock;

  while (currentFromBlock <= toBlock) {
    const currentToBlock = currentFromBlock + chunkSize > toBlock 
      ? toBlock 
      : currentFromBlock + chunkSize;
    
    console.log(`获取从区块 ${currentFromBlock} 到 ${currentToBlock} 的日志`);
    
    try {
      const logs = await client.getLogs({
        address: BALANCER_VAULT_ADDRESS,
        event: parseAbiItem('event Swap(bytes32 indexed poolId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)'),
        fromBlock: currentFromBlock,
        toBlock: currentToBlock
      });
      
      allLogs.push(...logs);
      console.log(`在此区块范围内找到 ${logs.length} 个日志`);
    } catch (error) {
      console.error(`获取区块范围 ${currentFromBlock}-${currentToBlock} 的日志时出错:`, error);
    }
    
    // 移动到下一个区块段
    currentFromBlock = currentToBlock + 1n;
  }
  
  return allLogs;
}

// 主函数
(async () => {
  try {
    // 1. 首先尝试检查特定的交易哈希
    const specificTxHash = '0x6547b61dac68b65beb684b66ef9931dfcae9d9d9b87286bcaba43e5f22f957aa' as `0x${string}`;
    const found = await checkSpecificTransaction(specificTxHash);
    
    // 2. 如果未找到特定的交易，则尝试获取最近的交易作为示例
    if (!found) {
      console.log('\n原始交易未找到，正在查找Base链上最近的Balancer Swap事件...');
      
      // 获取最新的区块号
      const latestBlock = await client.getBlockNumber();
      console.log(`最新区块: ${latestBlock}`);
      
      // 限制为最近的500个区块（约15分钟）
      const fromBlock = latestBlock - 500n;
      const toBlock = latestBlock;
      
      console.log(`搜索从区块 ${fromBlock} 到 ${toBlock} 的Swap事件`);
      
      // 分块获取日志
      const logs = await fetchLogsInChunks(fromBlock, toBlock);
      
      if (logs.length === 0) {
        console.log('指定区块范围内未找到Balancer Swap事件');
        return;
      }
      
      console.log(`总共找到 ${logs.length} 个Balancer Swap事件!`);
      
      // 显示前3个事件
      const eventsToShow = Math.min(3, logs.length);
      
      for (let i = 0; i < eventsToShow; i++) {
        const log = logs[i];
        console.log(`\n✅ 事件 ${i + 1}:`);
        console.log(`交易哈希: ${log.transactionHash}`);
        console.log(`区块号: ${log.blockNumber}`);
        
        // 使用解码函数
        const decodedSwap = decodeBalancerSwap(log);
        console.dir(decodedSwap, { depth: null });
        
        console.log(`\n在浏览器中查看此交易: https://basescan.org/tx/${log.transactionHash}`);
      }
      
      console.log('\n您可以将这个decodeBalancerSwap函数集成到您的analysis.helper.ts文件中');
      console.log('示例用法: case logTopicsMap.BalancerSwap: { return decodeBalancerSwap(log, poolInfoMap); }');
    }
  } catch (error) {
    console.error('主进程出错:', error);
  }
})();
