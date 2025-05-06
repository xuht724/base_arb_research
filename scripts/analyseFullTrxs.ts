import { createPublicClient, http, type PublicClient, type Abi } from 'viem';
import { logTopicsMap } from '../src/common/events';
import {
  UNISWAP_V2_FACTORY,
  UNISWAP_V3_FACTORY,
  AERODORME_V2_FACTORY,
  AERODORME_V3_FACTORY,
  SOLIDV3_FACTORY,
  PANCAKE_V3_FACTORY
} from '../src/common/constants';
import fs from 'fs';
import path from 'path';
import { base } from 'viem/chains';
import { replacer } from 'src/lib/utils';
import csvParser from "csv-parser";
import { ChainHelper } from 'src/lib/chain/helper';
interface PoolInfo {
  token0: string;
  token1: string;
  factory: string;
  protocol: string;
}

interface TransactionAnalysis {
  hash: string;
  blockNumber: string;
  logNum: number;
  potentialArb: boolean;
  effectiveGasPrice: string;
  gasUsed: string;
  l2Fee: string;
  profit: string;
  pools: PoolInfo[];
  protocols: string[];
  tokens: string[];
  involvedPools: string[];
  involvedProtocols: string[];
  timestamp: string | null;
}

interface AnalysisResult {
  transactions: TransactionAnalysis[];
  statistics: {
    totalTransactions: number;
    protocolCounts: { [key: string]: number };
    tokenCounts: { [key: string]: number };
    factoryCounts: { [key: string]: number };
    mostCommonTokenPairs: { [key: string]: number };
    totalProfit: string;
    totalGasUsed: string;
    totalL2Fee: string;
    potentialArbCount: number;
  };
}

const CACHE_FILE = path.join(__dirname, '../data/pool_cache.json');
const RESULT_FILE = path.join(__dirname, '../data/transaction_analysis_result_2.json');


let poolCache: { [key: string]: PoolInfo } = {};

// 已知的factory地址映射
const FACTORY_MAP: { [key: string]: string } = {
  [UNISWAP_V2_FACTORY.toLowerCase()]: 'UniV2', // Uniswap V2
  [UNISWAP_V3_FACTORY.toLowerCase()]: 'UniV3', // Uniswap V3
  [AERODORME_V2_FACTORY.toLowerCase()]: 'AeroV2', // Aerodrome V2
  [AERODORME_V3_FACTORY.toLowerCase()]: 'AeroV3', // Aerodrome V3
  [SOLIDV3_FACTORY.toLowerCase()]: 'SolidV3', // Solid V3
  [PANCAKE_V3_FACTORY.toLowerCase()]: 'PancakeV3', // Pancake V3
};

// 创建viem客户端
// @ts-ignore
const client: PublicClient = createPublicClient({
  transport: http(process.env.BASE_HTTP_URL3!),
  chain: base
});

// 获取协议类型
function getProtocolType(factory: string, eventType: string): string {
  // 首先尝试从factory地址推导
  const protocolFromFactory = FACTORY_MAP[factory.toLowerCase()];
  if (protocolFromFactory) {
    return protocolFromFactory;
  }

  // 如果无法从factory推导，则从事件类型推导
  if (eventType.includes('V2')) {
    return 'UnknownV2';
  } else if (eventType.includes('V3')) {
    return 'UnknownV3';
  }

  return 'Unknown';
}

// 加载缓存
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      poolCache = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading cache:', error);
  }
}

// 保存缓存
function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(poolCache, null, 2));
  } catch (error) {
    console.error('Error saving cache:', error);
  }
}

// 获取pool信息
async function getPoolInfo(address: string, eventType: string): Promise<PoolInfo | null> {
  const lowerAddress = address.toLowerCase();
  if (poolCache[lowerAddress]) {
    return poolCache[lowerAddress];
  }

  try {
    const abi: Abi = [
      {
        inputs: [],
        name: 'token0',
        outputs: [{ type: 'address', name: '' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'token1',
        outputs: [{ type: 'address', name: '' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'factory',
        outputs: [{ type: 'address', name: '' }],
        stateMutability: 'view',
        type: 'function',
      },
    ];

    // 使用multicall获取池子信息
    const [token0, token1, factory] = await client.multicall({
      contracts: [
        {
          address: lowerAddress as `0x${string}`,
          abi,
          functionName: 'token0',
        },
        {
          address: lowerAddress as `0x${string}`,
          abi,
          functionName: 'token1',
        },
        {
          address: lowerAddress as `0x${string}`,
          abi,
          functionName: 'factory',
        },
      ],
    });

    const factoryAddress = (factory.result as unknown as string).toLowerCase();
    const protocol = getProtocolType(factoryAddress, eventType);

    const poolInfo: PoolInfo = {
      token0: (token0.result as unknown as string).toLowerCase(),
      token1: (token1.result as unknown as string).toLowerCase(),
      factory: factoryAddress,
      protocol
    };

    poolCache[lowerAddress] = poolInfo;
    saveCache();
    return poolInfo;
  } catch (error) {
    console.error(`Error getting pool info for ${address}:`, error);
    return null;
  }
}

const helper = new ChainHelper(process.env.BASE_HTTP_URL3!);

// 分析交易
async function analyzeTransaction(hash: string, timestamp: string | null): Promise<TransactionAnalysis | null> {
  try {
    // 获取交易日志
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (!receipt) return null;
    const analysisResult = helper.analyseReceipt(receipt);
    if (!analysisResult.potentialArb) return null;

    const pools: PoolInfo[] = [];
    const protocols: string[] = [];
    const tokens: string[] = [];
    const involvedPools: string[] = [];
    const involvedProtocols: string[] = [];

    for (const log of receipt.logs) {
      const topic = log.topics[0];

      // 检查是否是目标事件
      const protocol = Object.entries(logTopicsMap).find(([_, value]) => value === topic)?.[0];
      if (protocol) {
        const poolInfo = await getPoolInfo(log.address, protocol);
        if (poolInfo) {
          pools.push(poolInfo);
          protocols.push(protocol);
          tokens.push(poolInfo.token0, poolInfo.token1);
          involvedPools.push(log.address.toLowerCase());
          involvedProtocols.push(poolInfo.protocol);
        }
      }
    }

    return {
      hash: hash,
      blockNumber: analysisResult.blockNumber.toString(),
      logNum: analysisResult.logNum,
      potentialArb: analysisResult.potentialArb,
      effectiveGasPrice: analysisResult.effectiveGasPrice.toString(),
      gasUsed: analysisResult.gasUsed.toString(),
      l2Fee: analysisResult.l2Fee,
      profit: analysisResult.profit,
      pools,
      protocols: [...new Set(protocols)],
      tokens: [...new Set(tokens)],
      involvedPools: [...new Set(involvedPools)],
      involvedProtocols: [...new Set(involvedProtocols)],
      timestamp: timestamp || null
    };
  } catch (error) {
    console.error(`Error analyzing transaction ${hash}:`, error);
    return null;
  }
}

// 主函数
async function main() {
  // 加载缓存
  loadCache();

  // 读取交易分析文件
  const analysisData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/transaction_analysis.json'), 'utf-8'));

  const filePath = path.join(__dirname, '../data/all_transactions_7d_by_blocks.csv');

  const trxs: any[] = [];


  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on("data", (row) => {
      trxs.push(row);
    })
    .on("end", async () => {
      console.log(`Finished reading ${filePath}`);
      console.log("results", trxs.length);

      const result: AnalysisResult = {
        transactions: [],
        statistics: {
          totalTransactions: 0,
          protocolCounts: {},
          tokenCounts: {},
          factoryCounts: {},
          mostCommonTokenPairs: {},
          totalProfit: '0',
          totalGasUsed: '0',
          totalL2Fee: '0',
          potentialArbCount: 0
        }
      };

      for (let [i, row] of trxs.entries()) {
        const hash = row.hash;
        console.log("hash", hash);
        const timestamp = row.timeStamp;
        if (hash) {
          try {
            const analysis = await analyzeTransaction(hash, timestamp);
            if (analysis) {
              result.transactions.push(analysis);

              // 更新统计信息
              analysis.protocols.forEach(protocol => {
                result.statistics.protocolCounts[protocol] = (result.statistics.protocolCounts[protocol] || 0) + 1;
              });

              analysis.tokens.forEach(token => {
                result.statistics.tokenCounts[token] = (result.statistics.tokenCounts[token] || 0) + 1;
              });

              analysis.pools.forEach(pool => {
                result.statistics.factoryCounts[pool.factory] = (result.statistics.factoryCounts[pool.factory] || 0) + 1;

                const tokenPair = `${pool.token0}-${pool.token1}`;
                result.statistics.mostCommonTokenPairs[tokenPair] = (result.statistics.mostCommonTokenPairs[tokenPair] || 0) + 1;
              });

              // 更新交易统计信息
              if (analysis.potentialArb) {
                result.statistics.potentialArbCount++;
              }
              // console.log(analysis.profit, analysis.l2Fee, analysis.gasUsed); 
              // console.log(analysis.profit, analysis.l2Fee, analysis.gasUsed);
              result.statistics.totalProfit = (Number(result.statistics.totalProfit) + Number(analysis.profit)).toString();
              result.statistics.totalGasUsed = (Number(result.statistics.totalGasUsed) + Number(analysis.gasUsed)).toString();
              result.statistics.totalL2Fee = (Number(result.statistics.totalL2Fee) + Number(analysis.l2Fee)).toString();

              // 保存中间结果

              result.statistics.totalTransactions = result.transactions.length;

              fs.writeFileSync(RESULT_FILE, JSON.stringify(result, replacer, 2));
              console.log(`已保存第 ${i + 1} 笔交易的分析结果`);
            }else{
              console.log(`第 ${i + 1} 笔交易没有潜在套利机会`);
            }

          } catch (error) {
            console.error(`Error fetching data for txHash ${hash}:`, error);
          }
        }

        // if(i === 10){
        //   console.log("测试完成，退出");
        //   break
        // }
        // if (txHash) {

        // }
        // break;
      }

      // // 保存最终结果
      fs.writeFileSync(RESULT_FILE, JSON.stringify(result, replacer, 2));
      console.log('分析完成，结果已保存到', RESULT_FILE);
    });





  // const totalTransactions = analysisData.transactions.length;
  // console.log(`开始分析 ${totalTransactions} 笔交易...`);

  // // 分析每笔交易
  // for (let i = 0; i < totalTransactions; i++) {
  //   const tx = analysisData.transactions[i];
  //   console.log(`处理第 ${i + 1}/${totalTransactions} 笔交易: ${tx.hash}`);

  // const analysis = await analyzeTransaction(tx);
  // if (analysis) {
  //   result.transactions.push(analysis);

  //   // 更新统计信息
  //   analysis.protocols.forEach(protocol => {
  //     result.statistics.protocolCounts[protocol] = (result.statistics.protocolCounts[protocol] || 0) + 1;
  //   });

  //   analysis.tokens.forEach(token => {
  //     result.statistics.tokenCounts[token] = (result.statistics.tokenCounts[token] || 0) + 1;
  //   });

  //   analysis.pools.forEach(pool => {
  //     result.statistics.factoryCounts[pool.factory] = (result.statistics.factoryCounts[pool.factory] || 0) + 1;

  //     const tokenPair = `${pool.token0}-${pool.token1}`;
  //     result.statistics.mostCommonTokenPairs[tokenPair] = (result.statistics.mostCommonTokenPairs[tokenPair] || 0) + 1;
  //   });

  //   // 更新交易统计信息
  //   if (analysis.potentialArb) {
  //     result.statistics.potentialArbCount++;
  //   }
  //   // console.log(analysis.profit, analysis.l2Fee, analysis.gasUsed); 
  //   // console.log(analysis.profit, analysis.l2Fee, analysis.gasUsed);
  //   result.statistics.totalProfit = (Number(result.statistics.totalProfit) + Number(analysis.profit)).toString();
  //   result.statistics.totalGasUsed = (Number(result.statistics.totalGasUsed) + Number(analysis.gasUsed)).toString();
  //   result.statistics.totalL2Fee = (Number(result.statistics.totalL2Fee) + Number(analysis.l2Fee)).toString();

  //   // 保存中间结果
  //   fs.writeFileSync(RESULT_FILE, JSON.stringify(result, replacer, 2));
  //   console.log(`已保存第 ${i + 1} 笔交易的分析结果`);
  // }
  // }



}

main().catch(console.error); 