import { DEX_EXCHANGE, PoolType, Token } from "src/common/types";
import { ERC20ABI } from "../abi/erc20";
import { Abi, createPublicClient, formatEther, formatUnits, http, PublicClient, TransactionReceipt, decodeEventLog, parseAbiItem } from "viem";
import { base } from "viem/chains";
import * as path from 'path';
import * as fs from 'fs';
import { logTopicsMap, EventMapABI } from "src/common/events";
import { AnalysisResult, TransactionAnalysis, getProtocolType } from "./types";
import { PoolInfo } from "src/common/types";

// 定义包含topics的Log类型
interface LogWithTopics {
  address: string;
  blockHash: string;
  blockNumber: bigint;
  data: string;
  logIndex: number;
  transactionHash: string;
  transactionIndex: number;
  removed: boolean;
  topics: string[];
}

export interface StandardSwapEvent {
  poolAddress: string;
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  sender: string;
  recipient: string;
}

export interface TokenTransfer {
  token: string;
  from: string;
  to: string;
  amount: bigint;
  decimals: number;
  symbol?: string;
}

export interface TokenBalanceChange {
  token: string;
  symbol?: string;
  decimals: number;
  change: bigint;
}

export interface ArbitrageInfo {
  txHash: string;
  transactionIndex: number;
  type: 'begin' | 'inter' | 'backrun';
  swapEvents: Array<{
    tokenIn: {
      address: string;
      symbol?: string;
      amount: string;
    };
    tokenOut: {
      address: string;
      symbol?: string;
      amount: string;
    };
    protocol: string;
    poolAddress: string;
  }>;
  profit?: {
    token: string;
    symbol?: string;
    amount: string;
    formattedAmount?: string;
  };
  previousTxHash?: string;
  interInfo?: {
    txHash: string;
    poolAddress: string;
    transactionIndex: number;
  }[];
  graphTokenChanges: Record<string, string>;
  addressTokenChanges: Record<string, Array<{
    token: string;
    symbol?: string;
    change: string;
  }>>;
  from: string;
  to: string;
  gasUsed: string;
  gasPrice: string;
  isEmptyInput: boolean;
  input: string;
  involvedPools: Array<{
    address: string;
    protocol: string;
    token0: {
      address: string;
      symbol?: string;
    };
    token1: {
      address: string;
      symbol?: string;
    };
  }>;
  involvedTokens: Array<{
    address: string;
    symbol?: string;
  }>;
  involvedProtocols: string[];
}

export interface BlockArbitrageResult {
  blockNumber: number;
  blockInfo: {
    number: number;
    timestamp: string;
    totalTransactions: number;
    gasLimit: string;
    gasUsed: string;
    gasUsageRatio: string;
    baseFeePerGas?: string;
  };
  totalArbitrageTxs: number;
  totalSimpleSwapTxs: number;

  arbitrageTxs: ArbitrageInfo[];
  simpleSwapTxs: any[];

  allSwapTxs: {
    txHash: string;
    transactionIndex: number;
    isArbitrage: boolean;
    isSimpleSwap: boolean;
    swapEvents: StandardSwapEvent[];
  }[];

  swapArbitrageRelations: any[];
}

interface EdgeInfo {
  amountIn: bigint;
  amountOut: bigint;
}

export class AnalysisHelper {
  public readonly httpClient: PublicClient;
  private poolCache: { [key: string]: PoolInfo } = {};
  private tokenCache: { [key: string]: Token } = {};
  private readonly CACHE_FILE = path.join(__dirname, '../../../data/pool_cache.json');
  private readonly TOKEN_CACHE_FILE = path.join(__dirname, '../../../data/token_cache.json');
  private curvePoolTypes: Record<string, string> = {};

  constructor(url: string) {
    // @ts-ignore
    this.httpClient = createPublicClient({
      chain: base,
      transport: http(url),
    });
    this.loadCache();
    this.initCurvePoolTypes();
  }

  private loadCache() {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf-8');
        this.poolCache = JSON.parse(data);
      }
      if (fs.existsSync(this.TOKEN_CACHE_FILE)) {
        const data = fs.readFileSync(this.TOKEN_CACHE_FILE, 'utf-8');
        this.tokenCache = JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
  }

  private saveCache() {
    try {
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(this.poolCache, null, 2));
      fs.writeFileSync(this.TOKEN_CACHE_FILE, JSON.stringify(this.tokenCache, null, 2));
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  private initCurvePoolTypes() {
    // 这里可以添加已知的Curve池子地址和类型
    // 例如: this.curvePoolTypes['0x...'] = 'crypto';
    
    // Base上一些已知的Curve池子地址示例（如果有的话）
    // 这些需要根据实际情况填写
  }

  public async requestPoolInfo(address: string): Promise<PoolInfo | null> {
    const lowerAddress = address.toLowerCase();
    if (this.poolCache[lowerAddress]) {
      return this.poolCache[lowerAddress];
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

      const [token0, token1, factory] = await this.httpClient.multicall({
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
      const protocol = getProtocolType(factoryAddress);

      const poolInfo: PoolInfo = {
        token0: (token0.result as unknown as string).toLowerCase(),
        token1: (token1.result as unknown as string).toLowerCase(),
        factory: factoryAddress,
        protocol: protocol || 'Unknown'
      };

      // 检查是否为Curve池，如果是则尝试获取所有代币
      if (protocol === 'Curve' || poolInfo.factory.includes('curve')) {
        try {
          // 尝试获取Curve池子的所有代币
          const tokens = await this.getCurvePoolTokens(lowerAddress);
          if (tokens.length > 0) {
            poolInfo.tokens = tokens;
          }
        } catch (error) {
          console.warn(`获取Curve池 ${lowerAddress} 的代币列表失败:`, error);
        }
      }

      this.poolCache[lowerAddress] = poolInfo;
      this.saveCache();
      return poolInfo;
    } catch (error) {
      console.error(`Error getting pool info for ${address}:`, error);
      
      // 尝试检查是否为Curve池子
      try {
        // 尝试获取Curve池子的所有代币
        const tokens = await this.getCurvePoolTokens(lowerAddress);
        if (tokens.length >= 2) {
          // 如果找到至少两个代币，就创建一个Curve池子的PoolInfo
          const poolInfo: PoolInfo = {
            token0: tokens[0],
            token1: tokens[1],
            factory: '0x0000000000000000000000000000000000000000', // 未知工厂
            protocol: 'Curve',
            tokens: tokens
          };
          this.poolCache[lowerAddress] = poolInfo;
          this.saveCache();
          return poolInfo;
        }
      } catch (curveError) {
        // 忽略Curve相关错误
      }
      
      return null;
    }
  }

  public async requestTokenInfo(address: string): Promise<Token | null> {
    const lowerAddress = address.toLowerCase();
    if (this.tokenCache[lowerAddress]) {
      return this.tokenCache[lowerAddress];
    }
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
        tokenInfoRes[2].status == "success"
          ? (tokenInfoRes[2].result! as string)
          : undefined;
      const token: Token = {
        address: address.toLowerCase(),
        decimals,
        name,
        symbol,
      };
      this.tokenCache[lowerAddress] = token;
      this.saveCache();
      return token;
    } catch (error) {
      return null;
    }
  }

  public parseSwapEvent(log: LogWithTopics, poolInfo: PoolInfo): StandardSwapEvent | null {
    const topic = log.topics[0];
    const poolAddress = log.address.toLowerCase();
    
    switch (topic) {
      case logTopicsMap.V2Swap: {
        const v2SwapABI = [{
          anonymous: false,
          inputs: [
            { indexed: true, name: 'sender', type: 'address' },
            { indexed: false, name: 'amount0In', type: 'uint256' },
            { indexed: false, name: 'amount1In', type: 'uint256' },
            { indexed: false, name: 'amount0Out', type: 'uint256' },
            { indexed: false, name: 'amount1Out', type: 'uint256' },
            { indexed: true, name: 'to', type: 'address' }
          ],
          name: 'Swap',
          type: 'event'
        }] as const;

        const decoded = decodeEventLog({
          abi: v2SwapABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        
        const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = decoded.args as {
          sender: string;
          to: string;
          amount0In: bigint;
          amount1In: bigint;
          amount0Out: bigint;
          amount1Out: bigint;
        };
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        // 计算token0的净流入量
        const netAmount0 = amount0In - amount0Out;
        if (netAmount0 > BigInt(0)) {
          // token0净流入，说明token0是输入代币
          tokenIn = poolInfo.token0;
          tokenOut = poolInfo.token1;
          amountIn = amount0In;
          amountOut = amount1Out;
        } else {
          // token0净流出，说明token1是输入代币
          tokenIn = poolInfo.token1;
          tokenOut = poolInfo.token0;
          amountIn = amount1In;
          amountOut = amount0Out;
        }
        
        return {
          poolAddress: log.address.toLowerCase() as `0x${string}`,
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase() as `0x${string}`,
          recipient: to.toLowerCase() as `0x${string}`,
        };
      }

      case logTopicsMap.AeroV2Swap: {
        const aeroV2SwapABI = [{
          anonymous: false,
          inputs: [
            { indexed: true, name: 'sender', type: 'address' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: false, name: 'amount0In', type: 'uint256' },
            { indexed: false, name: 'amount1In', type: 'uint256' },
            { indexed: false, name: 'amount0Out', type: 'uint256' },
            { indexed: false, name: 'amount1Out', type: 'uint256' }
          ],
          name: 'Swap',
          type: 'event'
        }] as const;

        const decoded = decodeEventLog({
          abi: aeroV2SwapABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        
        const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = decoded.args as {
          sender: string;
          to: string;
          amount0In: bigint;
          amount1In: bigint;
          amount0Out: bigint;
          amount1Out: bigint;
        };
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        // 计算token0的净流入量
        const netAmount0 = amount0In - amount0Out;
        if (netAmount0 > BigInt(0)) {
          // token0净流入，说明token0是输入代币
          tokenIn = poolInfo.token0;
          tokenOut = poolInfo.token1;
          amountIn = amount0In;
          amountOut = amount1Out;
        } else {
          // token0净流出，说明token1是输入代币
          tokenIn = poolInfo.token1;
          tokenOut = poolInfo.token0;
          amountIn = amount1In;
          amountOut = amount0Out;
        }
        
        return {
          poolAddress: log.address.toLowerCase() as `0x${string}`,
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase() as `0x${string}`,
          recipient: to.toLowerCase() as `0x${string}`,
        };
      }
      
      
      case logTopicsMap.BalancerVaultSwap: {
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
      
        try {
          const decoded = decodeEventLog({
            abi: balancerSwapABI,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
        
          const { poolId, tokenIn, tokenOut, amountIn, amountOut } = decoded.args as {
            poolId: string;
            tokenIn: string;
            tokenOut: string;
            amountIn: bigint;
            amountOut: bigint;
          };
        
          // 由于交易信息不在log中，我们使用默认值
          // 实际情况中可能需要通过其他方式获取sender和recipient
          const sender = 'unknown';
          const recipient = 'unknown';
          
          // 从poolId中提取真正的pool address (前20个字节)
          // poolId是32字节的bytes32，而pool address是20字节
          const poolAddress = '0x' + poolId.slice(2, 42).toLowerCase();
        
          return {
            poolAddress: poolAddress, // 使用从poolId提取的pool address，而不是log.address
            protocol: poolInfo.protocol || 'Balancer',
            tokenIn: tokenIn.toLowerCase(),
            tokenOut: tokenOut.toLowerCase(),
            amountIn,
            amountOut,
            sender,
            recipient
          };
        } catch (error) {
          console.error('解码Balancer Swap事件出错:', error);
          console.error('问题日志:', log);
          return null;
        }
      }
      

      case logTopicsMap.V3Swap:
      case logTopicsMap.AeroV3Swap: {
        const v3SwapABI = [{
          anonymous: false,
          inputs: [
            { indexed: true, name: 'sender', type: 'address' },
            { indexed: true, name: 'recipient', type: 'address' },
            { indexed: false, name: 'amount0', type: 'int256' },
            { indexed: false, name: 'amount1', type: 'int256' },
            { indexed: false, name: 'sqrtPriceX96', type: 'uint160' },
            { indexed: false, name: 'liquidity', type: 'uint128' },
            { indexed: false, name: 'tick', type: 'int24' }
          ],
          name: 'Swap',
          type: 'event'
        }] as const;

        const decoded = decodeEventLog({
          abi: v3SwapABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        
        const { sender, recipient, amount0, amount1 } = decoded.args as {
          sender: string;
          recipient: string;
          amount0: bigint;
          amount1: bigint;
        };
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        if (amount0 > BigInt(0)) {
          tokenIn = poolInfo.token0;
          tokenOut = poolInfo.token1;
          amountIn = amount0;
          amountOut = BigInt(-1) * amount1;
        } else {
          tokenIn = poolInfo.token1;
          tokenOut = poolInfo.token0;
          amountIn = amount1;
          amountOut = BigInt(-1) * amount0;
        }
        
        return {
          poolAddress: log.address.toLowerCase() as `0x${string}`,
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase() as `0x${string}`,
          recipient: recipient.toLowerCase() as `0x${string}`,
        };
      }

      case logTopicsMap.PancakeV3Swap: {
        const pancakeV3SwapABI = [{
          anonymous: false,
          inputs: [
            { indexed: true, name: 'sender', type: 'address' },
            { indexed: true, name: 'recipient', type: 'address' },
            { indexed: false, name: 'amount0', type: 'int256' },
            { indexed: false, name: 'amount1', type: 'int256' },
            { indexed: false, name: 'sqrtPriceX96', type: 'uint160' },
            { indexed: false, name: 'liquidity', type: 'uint128' },
            { indexed: false, name: 'tick', type: 'int24' },
            { indexed: false, name: 'protocolFeesToken0', type: 'uint128' },
            { indexed: false, name: 'protocolFeesToken1', type: 'uint128' }
          ],
          name: 'Swap',
          type: 'event'
        }] as const;

        const decoded = decodeEventLog({
          abi: pancakeV3SwapABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        
        const { sender, recipient, amount0, amount1 } = decoded.args as {
          sender: string;
          recipient: string;
          amount0: bigint;
          amount1: bigint;
        };
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        if (amount0 > BigInt(0)) {
          tokenIn = poolInfo.token0;
          tokenOut = poolInfo.token1;
          amountIn = amount0;
          amountOut = BigInt(-1) * amount1;
        } else {
          tokenIn = poolInfo.token1;
          tokenOut = poolInfo.token0;
          amountIn = amount1;
          amountOut = BigInt(-1) * amount0;
        }
        
        return {
          poolAddress: log.address.toLowerCase() as `0x${string}`,
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase() as `0x${string}`,
          recipient: recipient.toLowerCase() as `0x${string}`,
        };
      }

      case logTopicsMap.CurveTokenExchange:
      case logTopicsMap.CurveTokenExchangeUnderlying:
      case logTopicsMap.CurveCryptoTokenExchange:
      case logTopicsMap.CurveTokenExchangeUnderlying4: {
        // 使用testcurveswap.ts中经过验证的正确逻辑
        // 定义所有可能的Curve事件签名
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

        // 尝试每种事件签名进行decode
        for (const event of curveSwapEvents) {
          try {
            const abiItem = parseAbiItem(event.signature);
            const decoded = decodeEventLog({
              abi: [abiItem],
              data: log.data,
              topics: log.topics as [`0x${string}`, ...`0x${string}`[]]
            });

            // 解析事件参数
            const args = decoded.args as any;
            const buyer = args.buyer;
            const sold_id = Number(args.sold_id);
            const tokens_sold = args.tokens_sold;
            const bought_id = Number(args.bought_id);
            const tokens_bought = args.tokens_bought;

            // 获取池子中的代币地址
            let tokenIn = '';
            let tokenOut = '';

            // 尝试从池子信息中获取代币地址
            if (poolInfo.tokens && Array.isArray(poolInfo.tokens)) {
              // 如果poolInfo中有tokens数组，直接使用
              if (sold_id < poolInfo.tokens.length) {
                tokenIn = poolInfo.tokens[sold_id];
              }
              if (bought_id < poolInfo.tokens.length) {
                tokenOut = poolInfo.tokens[bought_id];
              }
            } else {
              // 否则使用token0/token1（这只适用于2个代币的池子）
              if (sold_id === 0 && poolInfo.token0) {
                tokenIn = poolInfo.token0;
              } else if (sold_id === 1 && poolInfo.token1) {
                tokenIn = poolInfo.token1;
              }

              if (bought_id === 0 && poolInfo.token0) {
                tokenOut = poolInfo.token0;
              } else if (bought_id === 1 && poolInfo.token1) {
                tokenOut = poolInfo.token1;
              }
            }

            // 如果无法确定代币地址，尝试获取Curve池子的代币信息
            if (!tokenIn || !tokenOut) {
              // 如果poolInfo中没有足够的代币信息，记录警告但继续处理
              console.warn(`Curve池子 ${poolAddress} 的poolInfo中缺少代币信息，sold_id=${sold_id}, bought_id=${bought_id}`);
            }

            // 如果仍然无法确定代币地址，使用占位符并记录警告
            if (!tokenIn) {
              tokenIn = `unknown-curve-token-${sold_id}`;
              console.warn(`无法确定Curve交换中的输入代币: ${poolAddress}, sold_id=${sold_id}, 事件=${event.name}`);
            }

            if (!tokenOut) {
              tokenOut = `unknown-curve-token-${bought_id}`;
              console.warn(`无法确定Curve交换中的输出代币: ${poolAddress}, bought_id=${bought_id}, 事件=${event.name}`);
            }

            return {
              poolAddress,
              protocol: poolInfo.protocol || 'Curve',
              tokenIn,
              tokenOut,
              amountIn: tokens_sold,
              amountOut: tokens_bought,
              sender: buyer.toLowerCase() as `0x${string}`,
              recipient: buyer.toLowerCase() as `0x${string}`, // Curve默认接收者是买家自己
            };
          } catch (error) {
            // 如果这个事件签名不匹配，继续尝试下一个
            continue;
          }
        }

        // 如果所有事件签名都不匹配，记录错误
        console.error(`无法解码Curve交换事件: ${poolAddress}`);
        console.error('问题日志:', log);
        return null;
      }

      default:
        return null;
    }
  }
  
  
  public parseERC20Transfer(log: LogWithTopics): TokenTransfer | null {
    // ERC20 Transfer event topic
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    
    if (log.topics[0] !== TRANSFER_TOPIC) {
      return null;
    }

    const transferABI = [{
      anonymous: false,
      inputs: [
        { indexed: true, name: 'from', type: 'address' },
        { indexed: true, name: 'to', type: 'address' },
        { indexed: false, name: 'value', type: 'uint256' }
      ],
      name: 'Transfer',
      type: 'event'
    }] as const;

    try {
      const decoded = decodeEventLog({
        abi: transferABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });

      const { from, to, value } = decoded.args as {
        from: string;
        to: string;
        value: bigint;
      };
      return {
        token: log.address.toLowerCase(),
        from: from.toLowerCase(),
        to: to.toLowerCase(),
        amount: value,
        decimals: 18, // 默认值，后续会更新
        symbol: undefined // 默认值，后续会更新
      };
    } catch (error) {
      console.error('Error parsing ERC20 transfer:', error);
      return null;
    }
  }

  public async analyzeTokenTransfers(logs: LogWithTopics[]): Promise<Map<string, TokenBalanceChange[]>> {
    const transfers: TokenTransfer[] = [];
    const addressChanges = new Map<string, TokenBalanceChange[]>();

    // 解析所有Transfer事件
    for (const log of logs) {
      const transfer = this.parseERC20Transfer(log);
      if (transfer) {
        // 获取代币信息
        const tokenInfo = await this.requestTokenInfo(transfer.token);
        if (tokenInfo) {
          transfer.decimals = tokenInfo.decimals;
          transfer.symbol = tokenInfo.symbol;
        }
        transfers.push(transfer);
      }
    }

    // 统计每个地址的代币变化
    for (const transfer of transfers) {
      // 处理发送方
      if (transfer.from !== "0x0000000000000000000000000000000000000000") { // 排除铸造
        const fromChanges = addressChanges.get(transfer.from) || [];
        const existingChange = fromChanges.find(c => c.token === transfer.token);
        if (existingChange) {
          existingChange.change -= transfer.amount;
        } else {
          fromChanges.push({
            token: transfer.token,
            symbol: transfer.symbol,
            decimals: transfer.decimals,
            change: -transfer.amount
          });
        }
        addressChanges.set(transfer.from, fromChanges);
      }

      // 处理接收方
      if (transfer.to !== "0x0000000000000000000000000000000000000000") { // 排除销毁
        const toChanges = addressChanges.get(transfer.to) || [];
        const existingChange = toChanges.find(c => c.token === transfer.token);
        if (existingChange) {
          existingChange.change += transfer.amount;
        } else {
          toChanges.push({
            token: transfer.token,
            symbol: transfer.symbol,
            decimals: transfer.decimals,
            change: transfer.amount
          });
        }
        addressChanges.set(transfer.to, toChanges);
      }
    }

    return addressChanges;
  }

  public buildSwapGraph(swapEvents: StandardSwapEvent[]): Map<string, Map<string, EdgeInfo>> {
    const graph = new Map<string, Map<string, EdgeInfo>>();
    
    for (const swap of swapEvents) {
      // 只添加tokenIn到tokenOut的边
      if (!graph.has(swap.tokenIn)) {
        graph.set(swap.tokenIn, new Map());
      }
      const edges = graph.get(swap.tokenIn)!;
      
      // 如果已经存在这条边，累加amount
      const existingEdge = edges.get(swap.tokenOut);
      if (existingEdge) {
        edges.set(swap.tokenOut, {
          amountIn: existingEdge.amountIn + swap.amountIn,
          amountOut: existingEdge.amountOut + swap.amountOut
        });
      } else {
        edges.set(swap.tokenOut, {
          amountIn: swap.amountIn,
          amountOut: swap.amountOut
        });
      }
    }
    
    return graph;
  }

  private hasCycle(graph: Map<string, Map<string, EdgeInfo>>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (token: string): boolean => {
      if (recursionStack.has(token)) {
        return true; // 发现环
      }
      if (visited.has(token)) {
        return false;
      }
      
      visited.add(token);
      recursionStack.add(token);
      
      const edges = graph.get(token);
      if (edges) {
        for (const [nextToken] of Array.from(edges)) {
          if (dfs(nextToken)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(token);
      return false;
    };
    
    for (const token of Array.from(graph.keys())) {
      if (!visited.has(token)) {
        if (dfs(token)) {
          return true;
        }
      }
    }//只找一个环
    
    return false;
  }

  public calculateSwapGraphTokenChanges(graph: Map<string, Map<string, EdgeInfo>>): Map<string, bigint> {
    const tokenChanges = new Map<string, bigint>();
    
    // 遍历图中的每个token
    for (const [from, edges] of Array.from(graph.entries())) {
      // 初始化from token的变化量
      if (!tokenChanges.has(from)) {
        tokenChanges.set(from, BigInt(0));
      }
      
      // 遍历所有出边
      for (const [to, edgeInfo] of Array.from(edges.entries())) {
        // 初始化to token的变化量
        if (!tokenChanges.has(to)) {
          tokenChanges.set(to, BigInt(0));
        }
        
        // from token减少amountIn
        const fromChange = tokenChanges.get(from)!;
        tokenChanges.set(from, fromChange - edgeInfo.amountIn);
        
        // to token增加amountOut
        const toChange = tokenChanges.get(to)!;
        tokenChanges.set(to, toChange + edgeInfo.amountOut);
      }
    }
    
    return tokenChanges;
  }

  private validateSwapGraphTokenChanges(graph: Map<string, Map<string, EdgeInfo>>): { isValid: boolean; profitToken?: string } {
    const tokenChanges = this.calculateSwapGraphTokenChanges(graph);
    
    let positiveCount = 0;
    let profitToken: string | undefined;
    
    // 检查所有token的变化量
    for (const [token, change] of tokenChanges.entries()) {
      if (change < BigInt(0)) {
        return { isValid: false }; // 如果有任何token为负，直接返回false
      }
      if (change > BigInt(0)) {
        positiveCount++;
        profitToken = token;
      }
    }
    
    // 必须恰好有一个token为正，其他token都大于等于0
    return { 
      isValid: positiveCount === 1,
      profitToken
    };
  }

  public isArbitrageTransaction(swapEvents: StandardSwapEvent[]): boolean {
    if (swapEvents.length < 2) {
      return false; // 至少需要两个swap才能构成套利
    }
    
    const graph = this.buildSwapGraph(swapEvents);
    
    // 检查是否存在环且所有token变化量都为正
    return this.hasCycle(graph) && this.validateSwapGraphTokenChanges(graph).isValid;
  }

  private async fetchLogsInChunks(fromBlock: bigint, toBlock: bigint, events: any[], maxBlockRange = BigInt(500)): Promise<LogWithTopics[]> {
    const allLogs: LogWithTopics[] = [];
    
    // 分块处理，每次处理不超过maxBlockRange个区块
    for (let currentFromBlock = fromBlock; currentFromBlock <= toBlock; currentFromBlock += maxBlockRange - BigInt(1)) {
      const currentToBlock = currentFromBlock + maxBlockRange - BigInt(1) > toBlock 
        ? toBlock 
        : currentFromBlock + maxBlockRange - BigInt(1);
      
      console.log(`搜索区块范围: ${currentFromBlock} - ${currentToBlock}`);
      
      try {
        const logs = await this.httpClient.getLogs({
          fromBlock: currentFromBlock,
          toBlock: currentToBlock,
          events
        });
        
        allLogs.push(...logs);
      } catch (error) {
        console.error(`获取区块 ${currentFromBlock}-${currentToBlock} 的日志时出错:`, error);
      }
    }
    
    return allLogs;
  }

  public async analyzeBlockArbitrage(blockNumber: number): Promise<BlockArbitrageResult> {
    const allSwapTxs: {
        txHash: string;
        transactionIndex: number;
        isArbitrage: boolean;
        isSimpleSwap: boolean;
        swapEvents: StandardSwapEvent[];
      }[] = [];
      
    const arbitrageTxs: ArbitrageInfo[] = [];
    const simpleSwapTxs: any[] = [];
    const poolSwapHistory = new Map<string, string>();

    // 获取区块信息
    const block = await this.httpClient.getBlock({ blockNumber: BigInt(blockNumber) });
    const gasUsageRatio = (Number(block.gasUsed) * 100 / Number(block.gasLimit)).toFixed(2);
    const blockInfo = {
      number: Number(block.number),
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      totalTransactions: block.transactions.length,
      gasLimit: block.gasLimit.toString(),
      gasUsed: block.gasUsed.toString(),
      gasUsageRatio: `${gasUsageRatio}%`,
      baseFeePerGas: block.baseFeePerGas?.toString()
    };

    // 要查询的事件列表
    const events = [
      EventMapABI.V2Swap,
      EventMapABI.V3Swap,
      EventMapABI.AeroV2Swap,
      EventMapABI.PancakeV3Swap,
      EventMapABI.BalancerVaultSwap,
      // Curve事件 - 添加所有交换相关事件
      EventMapABI.CurveTokenExchange,
      EventMapABI.CurveTokenExchangeUnderlying,
      EventMapABI.CurveCryptoTokenExchange,
      EventMapABI.CurveTokenExchangeUnderlying4,
      // 注意：不添加AddLiquidity和RemoveLiquidity等非交换事件，因为我们只关注交换
    ];

    // 使用getLogs获取所有swap事件
    // 对于单个区块的查询，直接使用标准方法
    let logs;
    try {
      logs = await this.httpClient.getLogs({
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
        events
      });
    } catch (error) {
      console.error(`获取区块 ${blockNumber} 的日志时出错:`, error);
      
      // 如果出错，尝试使用分块方法（虽然对单区块来说通常不需要）
      logs = await this.fetchLogsInChunks(
        BigInt(blockNumber),
        BigInt(blockNumber),
        events
      );
    }

    // 按交易哈希分组logs
    const txLogsMap = new Map<string, LogWithTopics[]>();
    for (const log of logs) {
      // 确保transactionHash存在且不为null
      const txHash = log.transactionHash;
      if (txHash) {
        const txLogs = txLogsMap.get(txHash) || [];
        txLogs.push(log);
        txLogsMap.set(txHash, txLogs);
      }
    }

    // 获取所有交易的详细信息，并按 transactionIndex 排序
    const txDetails = await Promise.all(
      Array.from(txLogsMap.keys()).map(async (txHash) => {
        const receipt = await this.httpClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
        if (!receipt) return null;
        return {
          txHash,
          transactionIndex: receipt.transactionIndex,
          receipt
        };
      })
    );

    // 按 transactionIndex 排序
    const sortedTxDetails = txDetails
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null)
      .sort((a, b) => a.transactionIndex - b.transactionIndex);

    // 按顺序分析每个交易
    for (const { txHash, receipt } of sortedTxDetails) {
      const swapEvents: StandardSwapEvent[] = [];
      const txLogs = txLogsMap.get(txHash) || [];

      // 收集交易中的所有swap事件
      for (const log of txLogs) {
        const poolInfo = await this.requestPoolInfo(log.address);
        if (!poolInfo) continue;

        const swapEvent = this.parseSwapEvent(log, poolInfo);
        if (swapEvent) {
          swapEvents.push(swapEvent);
        }
      }

      // 如果交易包含swap事件，进行分析
      if (swapEvents.length > 0) {
        const graph = this.buildSwapGraph(swapEvents);
        const { isValid, profitToken } = this.validateSwapGraphTokenChanges(graph);
        
        // 判断是否为单纯的swap交易或套利交易
        const isArbitrage = isValid && !!profitToken;
        const isSimpleSwap = swapEvents.length === 1; // 只有一个swap事件就是简单swap

        // 添加到所有swap交易列表
        allSwapTxs.push({
          txHash,
          transactionIndex: receipt.transactionIndex,
          isArbitrage,
          isSimpleSwap,
          swapEvents
        });
        
        // 处理套利交易
        if (isArbitrage) {
          const tx = await this.httpClient.getTransaction({ hash: txHash as `0x${string}` });
          if (!tx) continue;

          const graphTokenChanges = this.calculateSwapGraphTokenChanges(graph);
          const addressTokenChanges = await this.analyzeTokenTransfers(receipt.logs);
          
          // 检查每个pool的历史记录
          let type: 'begin' | 'inter' | 'backrun' = 'begin';
          let previousTxHash: string | undefined;
          let isBackrun = true;
          const interInfo: { txHash: string; poolAddress: string; transactionIndex: number; }[] = [];

          for (const swap of swapEvents) {
            const lastTxHash = poolSwapHistory.get(swap.poolAddress);
            if (lastTxHash) {
              type = 'inter';
              if (lastTxHash !== previousTxHash) {
                isBackrun = false;
              }
              previousTxHash = lastTxHash;
              // 记录inter交易的信息
              const lastTxDetail = sortedTxDetails.find(tx => tx.txHash === lastTxHash);
              if (lastTxDetail) {
                interInfo.push({
                  txHash: lastTxHash,
                  poolAddress: swap.poolAddress,
                  transactionIndex: lastTxDetail.transactionIndex
                });
              }
            }
          }

          if (type === 'inter' && isBackrun) {
            type = 'backrun';
          }

          // 获取profit token的信息
          const profitTokenInfo = await this.requestTokenInfo(profitToken);
          const profitAmount = graphTokenChanges.get(profitToken) || BigInt(0);

          // 在创建 ArbitrageInfo 对象时进行类型转换
          const formattedSwapEvents = await Promise.all(swapEvents.map(async (swap) => {
            const tokenInInfo = await this.requestTokenInfo(swap.tokenIn);
            const tokenOutInfo = await this.requestTokenInfo(swap.tokenOut);
            
            return {
              tokenIn: {
                address: swap.tokenIn,
                symbol: tokenInInfo?.symbol,
                amount: formatUnits(swap.amountIn, tokenInInfo?.decimals || 18)
              },
              tokenOut: {
                address: swap.tokenOut,
                symbol: tokenOutInfo?.symbol,
                amount: formatUnits(swap.amountOut, tokenOutInfo?.decimals || 18)
              },
              protocol: swap.protocol,
              poolAddress: swap.poolAddress
            };
          }));

          // 确保 graphTokenChanges 不为空
          const formattedGraphTokenChanges = Object.fromEntries(
            Array.from(graphTokenChanges.entries()).map(([token, change]) => [
              token,
              change.toString()
            ])
          );

          // 确保 addressTokenChanges 不为空
          const formattedAddressTokenChanges = Object.fromEntries(
            Array.from(addressTokenChanges.entries()).map(([address, changes]) => [
              address,
              changes.map((change: TokenBalanceChange) => ({
                token: change.token,
                symbol: change.symbol,
                change: change.change.toString()
              }))
            ])
          );

          arbitrageTxs.push({
            txHash,
            transactionIndex: receipt.transactionIndex,
            type,
            swapEvents: formattedSwapEvents,
            profit: {
              token: profitToken,
              symbol: profitTokenInfo?.symbol,
              amount: formatUnits(profitAmount, profitTokenInfo?.decimals || 18),
              formattedAmount: formatUnits(profitAmount, profitTokenInfo?.decimals || 18)
            },
            previousTxHash,
            interInfo: type === 'inter' ? interInfo : undefined,
            graphTokenChanges: formattedGraphTokenChanges,
            addressTokenChanges: formattedAddressTokenChanges,
            from: tx.from.toLowerCase(),
            to: tx.to?.toLowerCase() || '',
            gasUsed: receipt.gasUsed.toString(),
            gasPrice: tx.gasPrice?.toString() || '0',
            isEmptyInput: tx.input === '0x',
            input: tx.input,
            involvedPools: [],
            involvedTokens: [],
            involvedProtocols: []
          });
        }
        // 处理单纯的swap交易
        else if (isSimpleSwap) {
          const tx = await this.httpClient.getTransaction({ hash: txHash as `0x${string}` });
          if (!tx) continue;
          
          // 收集Swap的详细信息
          const swap = swapEvents[0]; // 只有一个swap事件
          const tokenInInfo = await this.requestTokenInfo(swap.tokenIn);
          const tokenOutInfo = await this.requestTokenInfo(swap.tokenOut);
          
          const simpleSwapInfo = {
            txHash,
            transactionIndex: receipt.transactionIndex,
            protocol: swap.protocol,
            poolAddress: swap.poolAddress,
            tokenIn: {
              address: swap.tokenIn,
              symbol: tokenInInfo?.symbol,
              amount: formatUnits(swap.amountIn, tokenInInfo?.decimals || 18)
            },
            tokenOut: {
              address: swap.tokenOut,
              symbol: tokenOutInfo?.symbol, 
              amount: formatUnits(swap.amountOut, tokenOutInfo?.decimals || 18)
            },
            from: tx.from.toLowerCase(),
            to: tx.to?.toLowerCase() || '',
            gasUsed: receipt.gasUsed.toString(),
            gasPrice: tx.gasPrice?.toString() || '0'
          };
          
          simpleSwapTxs.push(simpleSwapInfo);
        }

        // 更新pool的历史记录 - 对所有包含swap事件的交易都进行更新
        for (const swap of swapEvents) {
          poolSwapHistory.set(swap.poolAddress, txHash);
        }
      }
    }

    // 分析swap交易和套利交易之间的关系
    const swapArbitrageRelations = this.analyzeSwapArbitrageRelations(simpleSwapTxs, arbitrageTxs);

    // 在返回结果之前，为每个套利交易添加详细信息
    for (const arb of arbitrageTxs) {
      const involvedPools = new Set<string>();
      const involvedTokens = new Set<string>();
      const involvedProtocols = new Set<string>();

      // 收集所有涉及的池子、代币和协议
      for (const swap of arb.swapEvents) {
        involvedPools.add(swap.poolAddress);
        involvedTokens.add(swap.tokenIn.address);
        involvedTokens.add(swap.tokenOut.address);
        involvedProtocols.add(swap.protocol);
      }

      // 获取所有池子的详细信息
      const poolsInfo = await Promise.all(
        Array.from(involvedPools).map(async (poolAddress) => {
          const poolInfo = await this.requestPoolInfo(poolAddress);
          const token0Info = await this.requestTokenInfo(poolInfo?.token0 || '');
          const token1Info = await this.requestTokenInfo(poolInfo?.token1 || '');
          return {
            address: poolAddress,
            protocol: poolInfo?.protocol || '',
            token0: {
              address: poolInfo?.token0 || '',
              symbol: token0Info?.symbol
            },
            token1: {
              address: poolInfo?.token1 || '',
              symbol: token1Info?.symbol
            }
          };
        })
      );

      // 获取所有代币的详细信息
      const tokensInfo = await Promise.all(
        Array.from(involvedTokens).map(async (tokenAddress) => {
          const tokenInfo = await this.requestTokenInfo(tokenAddress);
          return {
            address: tokenAddress,
            symbol: tokenInfo?.symbol
          };
        })
      );

      // 更新套利交易信息
      Object.assign(arb, {
        involvedPools: poolsInfo,
        involvedTokens: tokensInfo,
        involvedProtocols: Array.from(involvedProtocols)
      });
    }

    // 输出区块分析结果的简要信息
    console.log(`[Block ${blockNumber}] Total swaps: ${allSwapTxs.length}, simple swaps: ${simpleSwapTxs.length}, arbitrages: ${arbitrageTxs.length}`);

    return {
      blockNumber,
      blockInfo,
      totalArbitrageTxs: arbitrageTxs.length,
      totalSimpleSwapTxs: simpleSwapTxs.length,
      arbitrageTxs,
      simpleSwapTxs,
      allSwapTxs,
      swapArbitrageRelations
    };
  }

  private analyzeSwapArbitrageRelations(simpleSwapTxs: any[], arbitrageTxs: ArbitrageInfo[]) {
    const relations = [];
    
    // 按照交易索引排序
    const sortedSimpleSwaps = [...simpleSwapTxs].sort((a, b) => a.transactionIndex - b.transactionIndex);
    const sortedArbitrages = [...arbitrageTxs].sort((a, b) => a.transactionIndex - b.transactionIndex);
    
    // 对于每个套利交易，寻找之前的Swap交易可能引起的价格变化
    for (const arb of sortedArbitrages) {
      const potentialTriggerSwaps = [];
      
      // 查找发生在套利交易之前的简单swap交易
      const previousSwaps = sortedSimpleSwaps.filter(swap => 
        swap.transactionIndex < arb.transactionIndex
      );
      
      // 检查套利交易和简单swap交易使用的池子是否有重叠
      for (const swap of previousSwaps) {
        // 检查池子是否在套利交易中使用
        const poolAddressUsedInArb = arb.swapEvents.some(event => 
          event.poolAddress === swap.poolAddress
        );
        
        if (poolAddressUsedInArb) {
          potentialTriggerSwaps.push({
            swapTxHash: swap.txHash,
            transactionIndex: swap.transactionIndex,
            poolAddress: swap.poolAddress,
            protocol: swap.protocol,
            timeDifference: arb.transactionIndex - swap.transactionIndex // 交易索引差距
          });
        }
      }
      
      if (potentialTriggerSwaps.length > 0) {
        relations.push({
          arbitrageTxHash: arb.txHash,
          arbitrageTransactionIndex: arb.transactionIndex,
          potentialTriggerSwaps: potentialTriggerSwaps
        });
      }
    }
    
    return relations;
  }

  // 在AnalysisHelper类中添加新的方法，用于处理Curve池子
  private curvePoolABI = [
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'coins',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function'
    },
    // 支持最多8个代币的池子
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[2]', name: '', type: 'address[2]' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[3]', name: '', type: 'address[3]' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[4]', name: '', type: 'address[4]' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[5]', name: '', type: 'address[5]' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[6]', name: '', type: 'address[6]' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[7]', name: '', type: 'address[7]' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'coins',
      outputs: [{ internalType: 'address[8]', name: '', type: 'address[8]' }],
      stateMutability: 'view',
      type: 'function'
    }
  ] as const;

  // Curve池子代币缓存
  private curvePoolTokensCache: Record<string, string[]> = {};

  /**
   * 获取Curve池子中的代币信息
   * @param poolAddress 池子地址
   * @returns 池子中所有代币的地址数组
   */
  public async getCurvePoolTokens(poolAddress: string): Promise<string[]> {
    const lowerAddress = poolAddress.toLowerCase();
    
    // 检查缓存
    if (this.curvePoolTokensCache[lowerAddress]) {
      return this.curvePoolTokensCache[lowerAddress];
    }
    
    const tokens: string[] = [];
    
    try {
      // 首先尝试获取池子信息，如果已经缓存则直接使用
      const poolInfo = await this.requestPoolInfo(poolAddress);
      if (poolInfo && poolInfo.token0 && poolInfo.token1) {
        tokens.push(poolInfo.token0.toLowerCase());
        tokens.push(poolInfo.token1.toLowerCase());
        
        // 如果只有两个代币则返回
        if (tokens.length > 0) {
          this.curvePoolTokensCache[lowerAddress] = tokens;
          return tokens;
        }
      }
      
      // 如果没有从poolInfo获取到，尝试不同的方法获取池子代币
      // 方法1：尝试获取固定长度的代币数组
      for (let i = 2; i <= 8; i++) {
        try {
          const coinsResult = await this.httpClient.readContract({
            address: poolAddress as `0x${string}`,
            abi: this.curvePoolABI,
            functionName: 'coins',
          });
          
          if (Array.isArray(coinsResult)) {
            for (const tokenAddress of coinsResult) {
              if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
                tokens.push(tokenAddress.toLowerCase());
              }
            }
            break;
          }
        } catch (e) {
          // 方法2：尝试通过索引逐个获取代币
          try {
            // 尝试最多8个代币的池子
            for (let j = 0; j < 8; j++) {
              try {
                const tokenAddress = await this.httpClient.readContract({
                  address: poolAddress as `0x${string}`,
                  abi: this.curvePoolABI,
                  functionName: 'coins',
                  args: [BigInt(j)],
                }) as string;
                
                if (tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000') {
                  tokens.push(tokenAddress.toLowerCase());
                } else {
                  // 如果遇到无效地址，说明已经超出池子中的代币数量
                  break;
                }
              } catch (e2) {
                // 这个索引没有代币，说明已经获取了所有代币
                break;
              }
            }
            break;
          } catch (e2) {
            // 继续尝试下一个方法
            if (i === 8) {
              console.warn(`无法获取Curve池子 ${poolAddress} 的代币信息`);
            }
          }
        }
      }
      
      // 如果找到了代币，保存到缓存
      if (tokens.length > 0) {
        this.curvePoolTokensCache[lowerAddress] = tokens;
      }
      
      return tokens;
    } catch (error) {
      console.error(`获取Curve池子 ${poolAddress} 代币信息时出错:`, error);
      return tokens;
    }
  }

  /**
   * 识别Curve池子版本
   * @param poolAddress 池子地址
   * @returns 池子版本信息
   */
  public async identifyCurvePoolType(poolAddress: string): Promise<{
    version: string;
    isMetapool: boolean;
    numTokens: number;
  }> {
    const lowerAddress = poolAddress.toLowerCase();
    
    try {
      // 1. 获取池子代币数量
      const tokens = await this.getCurvePoolTokens(lowerAddress);
      const numTokens = tokens.length;
      
      // 2. 尝试识别池子版本
      let version = 'unknown';
      let isMetapool = false;
      
      // 尝试调用is_meta方法判断是否为Metapool
      try {
        const isMetaResult = await this.httpClient.readContract({
          address: poolAddress as `0x${string}`,
          abi: [{
            inputs: [],
            name: 'is_meta',
            outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
            stateMutability: 'view',
            type: 'function'
          }],
          functionName: 'is_meta',
        });
        
        isMetapool = Boolean(isMetaResult);
      } catch (e) {
        // 无法判断，默认为false
      }
      
      // 尝试根据代币数量和其他特征判断版本
      if (numTokens === 2) {
        version = 'plain';
      } else if (numTokens === 3) {
        version = isMetapool ? 'metapool' : 'tripool';
      } else if (numTokens === 4) {
        version = isMetapool ? 'metapool' : 'fourpool';
      } else if (numTokens > 4) {
        version = 'factory';
      }
      
      // 尝试检测是否为crypto池
      try {
        await this.httpClient.readContract({
          address: poolAddress as `0x${string}`,
          abi: [{
            inputs: [],
            name: 'price_oracle',
            outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
          }],
          functionName: 'price_oracle',
        });
        
        // 如果price_oracle方法存在，很可能是crypto池
        version = 'crypto';
      } catch (e) {
        // 不是crypto池
      }
      
      return {
        version,
        isMetapool,
        numTokens
      };
    } catch (error) {
      console.error(`识别Curve池子 ${poolAddress} 版本时出错:`, error);
      return {
        version: 'unknown',
        isMetapool: false,
        numTokens: 0
      };
    }
  }
}
