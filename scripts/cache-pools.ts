import { ArbHelper } from "../src/lib/chain/arb.helper";
import { ChainHelper } from "../src/lib/chain/helper";
import {
  AERODORME_V2_FACTORY,
  AERODORME_V3_FACTORY,
  ALIEN_V3_FACTORY,
  DACKIE_V3_FACTORY,
  FACTORY_MAP,
  PANCAKE_V3_FACTORY,
  SOLIDV3_FACTORY,
  UNISWAP_V2_FACTORY,
  UNISWAP_V3_FACTORY,
} from "src/common/constants";
import { AeroV2FactoryABI } from "../src/lib/abi/aerodrome/v2factory";
import { UniV2FactoryABI } from "../src/lib/abi/uniswap/univ2factory";
import { getAddress, parseAbiItem, AbiEvent, Log } from "viem";
import fs from 'fs';
import path from 'path';
import { getProtocolType } from "src/lib/chain/utils";

interface PoolInfo {
  tokens: string[];
  factory: string;
  protocol: string;
  poolType: string;
}

interface PoolCache {
  [key: string]: PoolInfo;
}

async function loadCache(): Promise<PoolCache> {
  const cachePath = '/home/os/haotian/base_arb_research/data/extended_pool_cache.json';
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('无法加载缓存文件，将创建新的缓存');
  }
  return {};
}

async function saveCache(cache: PoolCache) {
  const cachePath = '/home/os/haotian/base_arb_research/data/extended_pool_cache.json';
  const cacheDir = path.dirname(cachePath);
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

async function cacheAeroV2Pools(chainHelper: ChainHelper, cache: PoolCache) {
  const factoryContract = {
    address: AERODORME_V2_FACTORY,
    abi: AeroV2FactoryABI,
  };

  // 获取所有池子数量
  const allPairsLengthResult = await chainHelper.httpClient.multicall({
    contracts: [
      {
        ...factoryContract,
        functionName: "allPoolsLength",
      },
    ] as any[],
  });

  if (allPairsLengthResult[0].status === "failure") {
    throw new Error("Failed to fetch allPoolsLength");
  }

  const allPairsLength = Number(allPairsLengthResult[0].result as bigint);
  console.log(`总池子数: ${allPairsLength}`);

  // 分批次获取池子地址
  const BATCH_SIZE = 1000;
  const pairAddresses: string[] = [];

  for (let i = 0; i < allPairsLength; i += BATCH_SIZE) {
    const batchEnd = Math.min(i + BATCH_SIZE, allPairsLength);
    console.log(`获取池子地址: ${i} 到 ${batchEnd - 1}`);

    const batchRequests = Array.from(
      { length: batchEnd - i },
      (_, index) => ({
        ...factoryContract,
        functionName: "allPools",
        args: [i + index],
      }),
    );

    const batchResults = await chainHelper.httpClient.multicall({
      contracts: batchRequests as any[],
    });

    batchResults.forEach((result, index) => {
      if (result.status === "failure") {
        console.warn(`获取池子地址失败: ${i + index}`);
      } else {
        pairAddresses.push(result.result as string);
      }
    });
  }

  console.log(`获取到 ${pairAddresses.length} 个池子地址`);

  // 分批次获取池子详细信息
  const INFO_BATCH_SIZE = 2000;
  for (let i = 0; i < pairAddresses.length; i += INFO_BATCH_SIZE) {
    const batchAddresses = pairAddresses.slice(i, i + INFO_BATCH_SIZE);
    console.log(`获取池子详细信息: ${i} 到 ${i + batchAddresses.length - 1}`);

    const poolInfoMap = await chainHelper.batchRequestPoolInfo(batchAddresses);
    let newPoolsCount = 0;

    // 更新缓存
    for (const [address, info] of poolInfoMap.entries()) {
      if (cache[address]) {
        console.log(`池子 ${address} 已经在缓存中，跳过`);
        continue;
      }

      cache[address] = {
        tokens: info.tokens,
        factory: info.factory || AERODORME_V2_FACTORY.toLowerCase(),
        protocol: info.protocol,
        poolType: 'v2v3'
      };
      newPoolsCount++;
    }

    // 每处理完一批就保存缓存
    if (newPoolsCount > 0) {
      await saveCache(cache);
      console.log(`已保存 ${newPoolsCount} 个新池子到缓存`);
    }
  }
}

async function cacheUniV2Pools(chainHelper: ChainHelper, cache: PoolCache) {
  const factoryContract = {
    address: UNISWAP_V2_FACTORY,
    abi: UniV2FactoryABI,
  };

  // 获取所有池子数量
  const allPairsLengthResult = await chainHelper.httpClient.multicall({
    contracts: [
      {
        ...factoryContract,
        functionName: "allPairsLength",
      },
    ] as any[],
  });

  if (allPairsLengthResult[0].status === "failure") {
    throw new Error("Failed to fetch allPairsLength");
  }

  const allPairsLength = Number(allPairsLengthResult[0].result as bigint);
  console.log(`总池子数: ${allPairsLength}`);

  // 分批次获取池子地址和信息
  const BATCH_SIZE = 2000;
  let newPoolsCount = 0;
  const startTime = performance.now();
  const startIndex = 1423700;
  const totalBatches = Math.ceil((allPairsLength - startIndex) / BATCH_SIZE);
  let completedBatches = 0;

  for (let i = startIndex; i < allPairsLength; i += BATCH_SIZE) {
    const batchEnd = Math.min(i + BATCH_SIZE, allPairsLength);
    completedBatches++;
    const progress = ((completedBatches / totalBatches) * 100).toFixed(2);
    
    // 计算预估剩余时间
    const elapsedTime = performance.now() - startTime;
    const avgTimePerBatch = elapsedTime / completedBatches;
    const remainingBatches = totalBatches - completedBatches;
    const estimatedRemainingTime = (avgTimePerBatch * remainingBatches) / 1000; // 转换为秒
    
    console.log(`处理池子: ${i} 到 ${batchEnd - 1} (进度: ${progress}%, 预估剩余时间: ${estimatedRemainingTime.toFixed(2)}秒)`);

    // 获取这一批次的池子地址
    const batchRequests = Array.from(
      { length: batchEnd - i },
      (_, index) => ({
        ...factoryContract,
        functionName: "allPairs",
        args: [i + index],
      }),
    );

    const batchResults = await chainHelper.httpClient.multicall({
      contracts: batchRequests as any[],
    });

    // 收集有效的池子地址
    const validPairAddresses: string[] = [];
    batchResults.forEach((result, index) => {
      if (result.status === "failure") {
        console.warn(`获取池子地址失败: ${i + index}`);
      } else {
        const address = (result.result as string).toLowerCase();
        if (!cache[address]) {
          validPairAddresses.push(address);
        }
      }
    });

    if (validPairAddresses.length > 0) {
      // 获取这些池子的详细信息
      const poolInfoMap = await chainHelper.batchRequestPoolInfo(validPairAddresses);

      // 更新缓存
      for (const [address, info] of poolInfoMap.entries()) {
        cache[address] = {
          tokens: info.tokens,
          factory: info.factory || UNISWAP_V2_FACTORY.toLowerCase(),
          protocol: info.protocol,
          poolType: 'v2v3'
        };
        newPoolsCount++;
      }

      // 每处理完一批就保存缓存
      if (newPoolsCount > 0) {
        await saveCache(cache);
        console.log(`已保存 ${newPoolsCount} 个新池子到缓存`);
        newPoolsCount = 0;
      }
    }
  }

  const totalTime = (performance.now() - startTime) / 1000;
  console.log(`UniV2池子缓存完成！总耗时: ${totalTime.toFixed(2)}秒`);
}

async function cacheV3Pools(chainHelper: ChainHelper, cache: PoolCache) {
  // 所有 V3 工厂地址和对应的事件
  const v3Factories = [
    {
      address: UNISWAP_V3_FACTORY,
      startBlock: 2284118n,
      event: "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    },
    {
      address: AERODORME_V3_FACTORY,
      startBlock: 0n,
      event: "event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)"
    },
    {
      address: SOLIDV3_FACTORY,
      startBlock: 0n,
      event: "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    },
    {
      address: PANCAKE_V3_FACTORY,
      startBlock: 0n,
      event: "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    },
    {
      address: ALIEN_V3_FACTORY,
      startBlock: 0n,
      event: "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    },
    {
      address: DACKIE_V3_FACTORY,
      startBlock: 0n,
      event: "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    },
  ];

  const blockBatch = 1000n;
  const currentBlockNumber = await chainHelper.httpClient.getBlockNumber();
  const startTime = performance.now();

  // 获取所有工厂地址
  const factoryAddresses = v3Factories.map(f => getAddress(f.address));

  // 获取最早的起始区块
  const earliestBlock = 2284118n;

  let currentBlock = earliestBlock;
  const totalBatches = Math.ceil(
    Number(currentBlockNumber - earliestBlock) / Number(blockBatch)
  );
  let completedBatches = 0;
  let newPoolsCount = 0;

  while (currentBlock < currentBlockNumber) {
    const toBlock =
      currentBlock + blockBatch > currentBlockNumber
        ? currentBlockNumber
        : currentBlock + blockBatch;

    const batchStartTime = performance.now();
    console.log(
      `同步区块 ${currentBlock} 到 ${toBlock}. 进度: ${completedBatches + 1}/${totalBatches}...`,
    );

    try {
      // 一次性获取所有工厂的事件
      const logs = await chainHelper.httpClient.getLogs({
        address: factoryAddresses,
        events: [
          parseAbiItem("event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"),
          parseAbiItem("event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)")
        ],
        fromBlock: currentBlock,
        toBlock: toBlock,
      });

      // 处理所有事件
      for (const log of logs) {
        const token0 = log.args.token0?.toLowerCase();
        const token1 = log.args.token1?.toLowerCase();
        const poolAddress = log.args.pool?.toLowerCase();
        if (!poolAddress || !token0 || !token1) continue;

        // 如果池子已经在缓存中，跳过
        if (cache[poolAddress]) {
          console.log(`池子 ${poolAddress} 已经在缓存中，跳过`);
          continue;
        }

        const factoryAddr = log.address.toLowerCase();
        const protocol = factoryAddr ? getProtocolType(factoryAddr) : 'Unknown';

        cache[poolAddress] = {
          tokens: [token0, token1],
          factory: factoryAddr,
          protocol,
          poolType: 'v2v3'
        };

        newPoolsCount++;
      }

      // 每处理完一批就保存缓存
      if (newPoolsCount > 0) {
        await saveCache(cache);
        console.log(`已保存 ${newPoolsCount} 个新池子到缓存`);
        newPoolsCount = 0;
      }

      completedBatches++;
      const batchEndTime = performance.now();
      const batchDuration = batchEndTime - batchStartTime;
      console.log(
        `区块 ${currentBlock} 到 ${toBlock} 完成，耗时 ${batchDuration.toFixed(2)} ms，处理了 ${logs.length} 个事件。`,
      );
    } catch (error) {
      console.error(
        `同步区块 ${currentBlock} 到 ${toBlock} 时出错: ${error.message}`,
      );
    }
    currentBlock = toBlock + 1n;
  }

  const totalEndTime = performance.now();
  const totalTime = totalEndTime - startTime;
  console.log(
    `所有 V3 池子同步完成，总耗时 ${(totalTime / 1000).toFixed(2)} 秒。`,
  );
}

async function main() {
  const rpcUrl = process.env.BASE_HTTP_URL!;
  const chainHelper = new ChainHelper(rpcUrl);

  try {
    console.log("开始缓存池子信息...");
    
    // 加载缓存
    const cache = await loadCache();
    
    // 1. 缓存 AeroV2 池子
    // console.log("\n=== 开始缓存 AeroV2 池子 ===");
    // await cacheAeroV2Pools(chainHelper, cache);
    
    // 2. 缓存 UniV2 池子
    console.log("\n=== 开始缓存 UniV2 池子 ===");
    await cacheUniV2Pools(chainHelper, cache);
    
    // 3. 缓存所有 V3 池子
    // console.log("\n=== 开始缓存所有 V3 池子 ===");
    // await cacheV3Pools(chainHelper, cache);

    console.log("\n所有池子信息缓存完成！");
  } catch (error) {
    console.error("缓存过程中出错:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 