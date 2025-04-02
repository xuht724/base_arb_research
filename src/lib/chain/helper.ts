import { DEX_EXCHANGE, PoolType, Token } from "src/common/types";
import { ERC20ABI } from "../abi/erc20";
import { createPublicClient, http, Log, PublicClient } from "viem";
import { base } from "viem/chains";
import {
  TickInfo,
  UniV3Info,
  UniV3State,
  UniV3StaticInfo,
} from "src/lib/pool/univ3/types";
import { UniV3PoolABI } from "../abi/uniswap/univ3pool";
import { UniV3Pool } from "src/lib/pool/univ3/pool";
import { AEROV3PoolABI } from "../abi/aerodrome/aerov3pool";

const V3_MAX_TICK = 887272n;
const V3_MIN_TICK = -887272n;

function getV3Dex(factory: string): DEX_EXCHANGE {
  if(factory.toLowerCase() == "0x33128a8fc17869897dce68ed026d694621f6fdfd"){
    return DEX_EXCHANGE.UNISWAP;
  }else if(factory.toLowerCase() == "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a"){
    return DEX_EXCHANGE.AERODROME;
  }else{
    throw new Error("Unknown factory");
  }
}

export class ChainHelper {
  public readonly httpClient: PublicClient;

  constructor(url: string) {
    // 这里会因为库本身的问题，导致类型检查报错
    // @ts-ignore
    this.httpClient = createPublicClient({
      chain: base,
      transport: http(url),
    });
  }

  public async requestToken(address: string): Promise<Token> {
    try {
      let tokenContract = {
        address: address,
        abi: ERC20ABI,
      } as const;
      let callList = [
        {
          ...tokenContract,
          functionName: "decimals",
        },
        {
          ...tokenContract,
          functionName: "name",
        },
        {
          ...tokenContract,
          functionName: "symbol",
        },
      ] as any[];

      let tokenInfoRes = await this.httpClient.multicall({
        contracts: callList,
      });
      // console.log(tokenInfoRes);
      if (tokenInfoRes[0].status == "failure") {
        throw new Error("Error to get token ");
      }
      let decimals = tokenInfoRes[0].result as number;
      let name =
        tokenInfoRes[1].status == "success"
          ? (tokenInfoRes[1].result! as string)
          : undefined;
      let symbol =
        tokenInfoRes[1].status == "success"
          ? (tokenInfoRes[1].result! as string)
          : undefined;
      const token: Token = {
        address: address.toLowerCase(),
        decimals,
        name,
        symbol,
      };
      return token;
    } catch (error) {
      throw new Error("Fail to get token");
    }
  }

  public async batchCallUniV3Pool(
    v3List: string[],
    isFull: boolean = true,
    blockNumber?: bigint,
  ) {
    try {
      const res: UniV3Info[] = [];
      const staticInfos = await this.batchCallUniV3Static(v3List);
      const stateMap = await this.batchCallUniV3State(
        staticInfos,
        isFull,
        blockNumber,
      );
      for (const info of staticInfos) {
        const addr = info.poolId;
        if (stateMap.has(addr)) {
          const initialInfo: UniV3Info = {
            poolState: stateMap.get(addr)!,
            poolId: addr,
            poolStaticInfo: info,
            poolType: PoolType.UNIV3,
          };
          res.push(initialInfo);
        }
      }
      const pools: UniV3Pool[] = [];
      for (const info of res) {
        const pool = new UniV3Pool(info);
        pools.push(pool);
      }
      return pools;
    } catch (error) {
      // console.log(error)
      throw error;
    }
  }

  public async batchCallUniV3PoolByStatics(
    statics: UniV3StaticInfo[],
    isFull: boolean = true,
    blockNumber?: bigint,
    halfTicks: number = 25,
  ): Promise<UniV3Pool[]> {
    try {
      const pools: UniV3Pool[] = [];

      // 批量获取池的状态
      const stateMap = await this.batchCallUniV3State(
        statics,
        isFull,
        blockNumber,
        halfTicks,
      );

      // 构造 UniV3Pool 对象
      for (const staticInfo of statics) {
        const poolAddress = staticInfo.poolId.toLowerCase();

        if (stateMap.has(poolAddress)) {
          const poolState = stateMap.get(poolAddress)!;

          // 构造 UniV3Info
          const info: UniV3Info = {
            poolId: poolAddress,
            poolType: PoolType.UNIV3,
            poolStaticInfo: staticInfo,
            poolState: poolState,
          };

          // 实例化 UniV3Pool
          const pool = new UniV3Pool(info);
          pools.push(pool);
        } else {
          console.warn(`No state info found for address: ${poolAddress}`);
        }
      }

      return pools;
    } catch (error) {
      console.error("Error in batchCallUniV3PoolByStatics:", error);
      throw error;
    }
  }

  public async batchCallUniV3Static(
    v3List: string[],
  ): Promise<UniV3StaticInfo[]> {
    // 构建 multicall 的 contracts 参数
    const contracts = v3List
      .map((address: string) => {
        const contract = {
          address: address,
          abi: UniV3PoolABI,
        } as const;
        return [
          {
            ...contract,
            functionName: "token0",
          },
          {
            ...contract,
            functionName: "token1",
          },
          {
            ...contract,
            functionName: "fee",
          },
          {
            ...contract,
            functionName: "tickSpacing",
          },
          {
            ...contract,
            functionName: "factory",
          },
        ] as any[];
      })
      .flat();

    // 发起 multicall 请求
    const res = await this.httpClient.multicall({
      contracts: contracts,
    });

    const staticInfoList: UniV3StaticInfo[] = [];

    // 处理每个池子的结果
    for (let i = 0; i < v3List.length; i++) {
      const index = i * 5; // 每个池子有 5 个调用 (token0, token1, fee, tickSpacing, factory)

      // 检查是否有调用失败
      if (
        res[index].status === "failure" ||
        res[index + 1].status === "failure" ||
        res[index + 2].status === "failure" ||
        res[index + 3].status === "failure" ||
        res[index + 4].status === "failure"
      ) {
        console.error(`Error fetching static info for pool ${v3List[i]}`);
        continue; // 跳过当前池子
      }

      // 提取结果
      const token0 = res[index].result as string;
      const token1 = res[index + 1].result as string;
      const fee = res[index + 2].result as number;
      const tickSpacing = res[index + 3].result as number;
      const factory = res[index + 4].result as string;

      // 构建静态信息对象
      const info: UniV3StaticInfo = {
        poolId: v3List[i].toLowerCase(),
        token0: token0.toLowerCase(),
        token1: token1.toLowerCase(),
        factory: factory.toLowerCase(),
        tickSpacing: BigInt(tickSpacing),
        swapFee: BigInt(fee),
        dexExchange: getV3Dex(factory),
      };

      // 添加到结果列表
      staticInfoList.push(info);
    }

    return staticInfoList;
  }

  private async batchCallUniV3State(
    infos: UniV3StaticInfo[],
    isFull: boolean = true,
    blockNumber?: bigint,
    halfTicks: number = 25,
  ): Promise<Map<string, UniV3State>> {
    try {
      let promises: any[];

      // console.log('infos', infos);
      if (isFull) {
        promises = infos.map((info) =>
          this.callUniV3FullState(info, blockNumber).then(
            (result) => ({
              status: "fulfilled",
              value: result,
              poolId: info.poolId,
            }),
            (error) => ({
              status: "rejected",
              reason: error,
              poolId: info.poolId,
            }),
          ),
        );
      } else {
        promises = infos.map((info) =>
          this.callUniV3PartialState(info, halfTicks, blockNumber).then(
            (result) => ({
              status: "fulfilled",
              value: result,
              poolId: info.poolId,
            }),
            (error) => ({
              status: "rejected",
              reason: error,
              poolId: info.poolId,
            }),
          ),
        );
      }
      const results = await Promise.allSettled(promises);

      // console.log(results);
      // Filter out rejected promises and map fulfilled results to the Map
      const stateMap = new Map<string, UniV3State>();
      for (const result of results) {
        if (result.status === "fulfilled") {
          if ((result.value as any).status === "fulfilled") {
            const poolId = (result.value as any).poolId as string;
            // if(poolAddress == "0x89fe6c08bad08917dde1a09ef2a6b31e464e162e"){
            //   console.log(results);
            // }
            stateMap.set(
              poolId,
              (result.value as any).value as UniV3State,
            );
          }
        }
      }

      return stateMap;
    } catch (error) {
      console.error("Unexpected error:", error);
      // Return an empty map instead of undefined in case of unexpected errors
      return new Map<string, UniV3State>();
    }
  }

  public async callUniV3PartialState(
    info: UniV3StaticInfo,
    halfTicks: number,
    blockNumber?: bigint,
  ) {
    const address = info.poolId;
    const tickSpacing = info.tickSpacing;

    const v3PoolContract = {
      address: info.poolId,
      abi: UniV3PoolABI,
    } as const;

    try {
      const resList = await this.httpClient.multicall({
        contracts: [
          {
            ...v3PoolContract,
            functionName: "slot0",
          },
          {
            ...v3PoolContract,
            functionName: "liquidity",
          },
        ] as any[],
        blockNumber: blockNumber,
      });
      for (const res of resList) {
        if (res.status == "failure") {
          throw new Error("Fail to get v3 state info");
        }
      }
      let sqrtPriceX96 = (resList[0].result as any[])[0] as bigint;
      let currentTick = BigInt((resList[0].result as any[])[1]);
      let liquidity = resList[1].result as bigint;
      // console.log(balance0,balance1,sqrtPriceX96,currentTick, liquidity);

      const currentTickUpper =
        (currentTick / tickSpacing) * tickSpacing + tickSpacing;
      const currentTickLower = currentTickUpper - tickSpacing;
      const tickList = Array.from({ length: halfTicks * 2 }, (_, index) => {
        const offset = index - (halfTicks - 1);
        const newTick = currentTickLower + BigInt(offset) * tickSpacing;

        // 添加上下限的检查
        if (newTick <= V3_MAX_TICK && newTick >= V3_MIN_TICK) {
          return newTick;
        } else {
          return null; // 如果超过了上下限，不添加到数组中
        }
      }).filter((tick) => tick !== null) as bigint[];

      const tickLower = tickList[0];
      const tickUpper = tickList[tickList.length - 1];

      const contracts = tickList.map((tick) => ({
        ...v3PoolContract,
        functionName: "ticks",
        args: [tick],
      })) as any[];

      const tickLiquidityList = await this.httpClient.multicall({
        contracts: contracts,
        blockNumber: blockNumber,
      });

      const tickBitMap: Map<bigint, TickInfo> = new Map<bigint, TickInfo>();
      for (const [index, tickLiquidityRes] of tickLiquidityList.entries()) {
        if (tickLiquidityRes.status == "failure") {
          throw new Error("Call V3 tick liquidity failed");
        } else {
          const resultArray = tickLiquidityRes.result as any;
          const tick = tickList[index];
          const info: TickInfo = {
            liquidityCross: BigInt(resultArray[0]),
            liquidityNet: BigInt(resultArray[1]),
            initialized: Boolean(resultArray[7]),
          };
          if (info.initialized) {
            tickBitMap.set(tick, info);
          }
        }
      }

      const state: UniV3State = {
        isFull: false,
        tickUpper,
        tickLower,
        poolId: address.toLowerCase(),
        currentTick,
        sqrtPriceX96,
        liquidity,
        tickBitMap,
      };
      return state;
    } catch (error) {
      throw error;
    }
  }

  public async callUniV3FullState(
    info: UniV3StaticInfo,
    blockNumber?: bigint,
  ): Promise<UniV3State> {
    const address = info.poolId;
    const tickSpacing = info.tickSpacing;
    const token0Contract = {
      address: info.token0,
      abi: ERC20ABI,
    };
    const token1Contract = {
      address: info.token1,
      abi: ERC20ABI,
    };

    const v3PoolContract = {
      address: info.poolId,
      abi: UniV3PoolABI,
    } as const;

    const aeroV3PoolContract = {
      address: info.poolId,
      abi: AEROV3PoolABI
    } as const;
    

    try {
      const contracts: any[] = [];
      let poolContract;
      
      // 根据交易所类型选择合约
      if (info.dexExchange === DEX_EXCHANGE.AERODROME) {
        poolContract = aeroV3PoolContract;
      } else {
        poolContract = v3PoolContract;
      }

      // 添加基础状态查询
      contracts.push(
        {
          ...poolContract,
          functionName: "slot0",
        },
        {
          ...poolContract,
          functionName: "liquidity",
        }
      );
      
      const resList = await this.httpClient.multicall({
        contracts: contracts,
        blockNumber: blockNumber,
      });

      // 检查调用结果
      for (const [index, res] of resList.entries()) {
        if (res.status === "failure") {
          throw new Error(
            `Failed to get V3 state info for function: ${contracts[index].functionName}`,
          );
        }
      }

      // 解析基础状态数据
      let sqrtPriceX96 = (resList[0].result as any[])[0] as bigint;
      let currentTick = BigInt((resList[0].result as any[])[1]);
      let liquidity = resList[1].result as bigint;

      // 获取tick bitmap数据
      const minWord = Number((V3_MIN_TICK / tickSpacing) >> 8n);
      const maxWord = Number((V3_MAX_TICK / tickSpacing) >> 8n);

      const activeTicks: bigint[] = [];
      const wordsCall: any[] = [];
      const wordPositions: bigint[] = [];

      // 构建tick bitmap查询
      for (let wordPosition = minWord; wordPosition <= maxWord; wordPosition++) {
        wordsCall.push({
          ...poolContract,
          functionName: "tickBitmap",
          args: [wordPosition],
        });
        wordPositions.push(BigInt(wordPosition));
      }

      const bitmaps = await this.httpClient.multicall({
        contracts: wordsCall,
        blockNumber: blockNumber,
      });

      // 处理bitmap结果
      for (const [index, res] of bitmaps.entries()) {
        if (res.status == "failure") {
          throw new Error("Failed to get contract bitmap");
        } else {
          const tickBitmap = BigInt(res.result as bigint);
          const ticks = this.decodeTickBitmap(
            BigInt(tickBitmap),
            wordPositions[index],
            tickSpacing,
          );
          activeTicks.push(...ticks);
        }
      }
      // console.log(activeTicks);
      const tickBitMap = await this.batchGetTicks(
        activeTicks,
        info,
        blockNumber,
      );

      const state: UniV3State = {
        isFull: true,
        tickUpper: V3_MAX_TICK,
        tickLower: V3_MIN_TICK,
        poolId: address.toLowerCase(),
        currentTick,
        sqrtPriceX96,
        liquidity,
        tickBitMap,
      };
      return state;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  private async batchGetTicks(
    ticks: bigint[],
    info: UniV3StaticInfo,
    blockNumber?: bigint,
    batch: number = 1000,
  ): Promise<Map<bigint, TickInfo>> {
    const v3PoolContract = {
      address: info.poolId,
      abi: UniV3PoolABI,
    } as const;

    const aeroV3PoolContract = {
      address: info.poolId,
      abi: AEROV3PoolABI
    } as const;

    let poolContract;
      
    // 根据交易所类型选择合约
    if (info.dexExchange === DEX_EXCHANGE.AERODROME) {
      poolContract = aeroV3PoolContract;
    } else {
      poolContract = v3PoolContract;
    }

    const tickBitMap: Map<bigint, TickInfo> = new Map<bigint, TickInfo>();

    // Helper function to process a single batch
    const processBatch = async (tickBatch: bigint[]): Promise<void> => {
      const contracts = tickBatch.map((tick) => ({
        ...poolContract,
        functionName: "ticks",
        args: [tick],
      })) as any[];

      const tickLiquidityList = await this.httpClient.multicall({
        contracts: contracts,
        blockNumber: blockNumber,
      });

      for (const [index, tickLiquidityRes] of tickLiquidityList.entries()) {
        if (tickLiquidityRes.status === "failure") {
          throw new Error("Call V3 tick liquidity failed");
        } else {
          const resultArray = tickLiquidityRes.result as any;
          const tick = tickBatch[index];
          const info: TickInfo = {
            liquidityCross: BigInt(resultArray[0]),
            liquidityNet: BigInt(resultArray[1]),
            initialized: Boolean(resultArray[7]),
          };
          if (info.initialized) {
            tickBitMap.set(tick, info);
          }
        }
      }
    };

    // Split ticks into batches and process each batch sequentially
    for (let i = 0; i < ticks.length; i += batch) {
      const tickBatch = ticks.slice(i, i + batch);
      await processBatch(tickBatch);
    }

    return tickBitMap;
  }

  private decodeTickBitmap(
    tickBitmap: bigint,
    wordPosition: bigint,
    tickSpacing: bigint,
  ): bigint[] {
    const activeTicks: bigint[] = [];

    for (let i = 0n; i < 256n; i++) {
      // 检查每一位是否为 1
      if ((tickBitmap & (1n << BigInt(i))) !== 0n) {
        // 根据 wordPosition 和 tickSpacing 计算 tick 索引
        const tickIndex = (wordPosition * 256n + i) * tickSpacing;
        activeTicks.push(tickIndex);
      }
    }

    return activeTicks;
  }

  public async getLogs(
    addresses: `0x${string}`[],
    blockNumber: bigint
  ): Promise<Log[]> {
    try {
      const logs = await this.httpClient.getLogs({
        address: addresses,
        fromBlock: blockNumber,
        toBlock: blockNumber
      });
      return logs;
    } catch (error) {
      console.error("Error fetching logs:", error);
      throw error;
    }
  }
}

// test();
