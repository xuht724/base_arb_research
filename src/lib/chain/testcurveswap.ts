import { createPublicClient, http, parseAbiItem, decodeEventLog, type AbiEvent, type DecodeEventLogReturnType } from 'viem';
import { base } from 'viem/chains';

const RPC_URLS = [
    process.env.RPC_URL,
    'https://base-mainnet.g.alchemy.com/v2/Hlbk2P_Ak05o1rWZuwTmhUlY-UHYgEqz',
];
  
const rpcUrl = RPC_URLS.find(url => url) || 'https://base-mainnet.g.alchemy.com/v2/Hlbk2P_Ak05o1rWZuwTmhUlY-UHYgEqz';
  
console.log(`使用的RPC URL: ${rpcUrl}`);
  
const client = createPublicClient({
  chain: base,
  transport: http(rpcUrl)
});

const curveSwapEvents = [
    {
        name: 'TokenExchange',
        signature: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)'
    },
    {
        name: 'TokenExchangeUnderlying',
        signature: 'event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)'
    },
    {
        name: 'TokenExchange', // Crypto pools
        signature: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)'
    },
    {
        name: 'Exchange',
        signature: 'event Exchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)'
    },
    {
        name: 'ExchangeUnderlying',
        signature: 'event ExchangeUnderlying(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)'
    }
];

const BATCH_SIZE = 500n;
const MAX_BLOCKS = 2000n;

async function findRecentCurveSwaps() {
  const latest = await client.getBlockNumber();
  const fromBlock = latest - MAX_BLOCKS;
  
  const allLogs: any[] = [];
  const batchCount = Math.ceil(Number(MAX_BLOCKS) / Number(BATCH_SIZE));

  for (let batch = 0n; batch < BigInt(batchCount); batch++) {
    const batchFrom = fromBlock + batch * BATCH_SIZE;
    const batchTo = batchFrom + BATCH_SIZE - 1n > latest ? latest : batchFrom + BATCH_SIZE - 1n;
    
    console.log(`处理区块范围: ${batchFrom} 到 ${batchTo}`);

    for (const event of curveSwapEvents) {
      try {
        const abiItem = parseAbiItem(event.signature) as AbiEvent;
        const logs = await client.getLogs({
          event: abiItem,
          fromBlock: batchFrom,
          toBlock: batchTo
        });
        logs.forEach(log => {
          allLogs.push({ ...log, eventName: event.name, abiItem });
        });
      } catch (err) {
        console.error(`❌ Error fetching ${event.name}:`, err);
      }
    }
  }

  console.log(`🔍 Found ${allLogs.length} Curve swap events`);

  for (let i = 0; i < Math.min(5, allLogs.length); i++) {
    const log = allLogs[i];
    try {
      const decoded = decodeEventLog({
        abi: [log.abiItem],
        data: log.data,
        topics: log.topics
      }) as DecodeEventLogReturnType;
      console.log(`\n✅ [${log.eventName}] TX: ${log.transactionHash}`);
      console.dir(decoded.args, { depth: null });
      console.log(`→ View on explorer: https://basescan.org/tx/${log.transactionHash}`);
    } catch (e) {
      console.error('❌ decode error', e);
    }
  }
}

findRecentCurveSwaps().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
