import { ArbHelper } from "../src/lib/chain/arb.helper";
import { ChainHelper } from "../src/lib/chain/helper";
import { ExtendedPoolInfo } from "src/common/types";
import fs from 'fs';
import path from 'path';
import axios from "axios";
import { replacer } from "src/lib/utils";

const GRAPH_API_URL = 'https://gateway.thegraph.com/api/subgraphs/id/HNCFA9TyBqpo5qpe6QreQABAA1kV8g46mhkCcicu6v2R';
const API_KEY = process.env.THE_GRAPH_API_KEY;

interface PoolCache {
  [key: string]: ExtendedPoolInfo;
}

const cachePath = '/home/os/haotian/base_arb_research/data/extended_pool_cache.json';
async function loadCache(): Promise<PoolCache> {
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
  const cacheDir = path.dirname(cachePath);

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, replacer, 2));
}

async function getPoolById(poolId: string): Promise<ExtendedPoolInfo | null> {
  const query = `
    {
      pool(id: "${poolId}") {
        hooks
        id
        token0 {
          id
        }
        token1 {
          id
        }
      }
    }
  `;

  try {
    const response = await axios.post(GRAPH_API_URL, 
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );

    const result = response.data;

    if (result.errors) {
      console.error('GraphQL错误:', result.errors);
      return null;
    }

    const pool = result.data.pool;
    if (!pool) return null;

    return {
      tokens: [
        pool.token0.id.toLowerCase(),
        pool.token1.id.toLowerCase()
      ],
      protocol: 'uniswap',
      poolType: 'v4',
      poolAddress: pool.id,
      poolId: pool.id
    };
  } catch (error) {
    console.error(`获取池子 ${poolId} 信息时出错:`, error);
    return null;
  }
}

async function cacheAllV4Pools(cache: PoolCache) {
  let skip = 700;
  const first = 100;
  let hasMore = true;
  let newPoolsCount = 0;

  console.log('开始下载UniswapV4池子数据...');

  while (hasMore) {
    const query = `
      {
        pools(first: ${first}, skip: ${skip}) {
          token0 {
            id
          }
          token1 {
            id
          }
          id
          hooks
        }
      }
    `;

    try {
      const response = await axios.post(GRAPH_API_URL,
        { query },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
          }
        }
      );

      const result = response.data;

      if (result.errors) {
        console.error('GraphQL错误:', result.errors);
        break;
      }

      const pools = result.data.pools;
      if (!pools || pools.length === 0) {
        hasMore = false;
        continue;
      }

      // 处理这一批次的池子
      for (const pool of pools) {
        const poolId = pool.id.toLowerCase();

        // 如果池子已经在缓存中，跳过
        if (cache[poolId]) {
          console.log(`池子 ${poolId} 已经在缓存中，跳过`);
          continue;
        }

        const poolInfo: ExtendedPoolInfo = {
          tokens: [
            pool.token0.id.toLowerCase(),
            pool.token1.id.toLowerCase()
          ],
          protocol: 'UniV4',
          poolType: 'v4',
          poolAddress: pool.id,
          poolId: pool.id
        };

        cache[poolId] = poolInfo;
        newPoolsCount++;
      }

      // 每处理完一批就保存缓存
      if (newPoolsCount > 0) {
        await saveCache(cache);
        console.log(`已保存 ${newPoolsCount} 个新池子到缓存`);
        newPoolsCount = 0;
      }

      console.log(`已处理 ${skip + pools.length} 个池子`);
      skip += pools.length;

      // 如果返回的池子数量小于请求数量，说明已经到达末尾
      if (pools.length < first) {
        hasMore = false;
      }

    } catch (error) {
      console.error(`获取池子列表时出错:`, error);
      break;
    }
  }

  console.log('UniswapV4池子数据下载完成！');
}

async function main() {
  if (!API_KEY) {
    console.error('请设置GRAPH_API_KEY环境变量');
    process.exit(1);
  }

  try {
    console.log("开始缓存UniswapV4池子信息...");

    // 加载缓存
    const cache = await loadCache();

    // 下载所有池子数据
    await cacheAllV4Pools(cache);

    console.log("\n所有UniswapV4池子信息缓存完成！");
  } catch (error) {
    console.error("缓存过程中出错:", error);
  }

  // const poolId = "0x02e32abac3e640668dff9492e0fd0d252af9c0f3b93b1e28219486356d7da0a9";
  // const poolInfo = await getPoolById(poolId);
  // console.log(poolInfo);

}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
export {
  getPoolById,
  cacheAllV4Pools
}; 