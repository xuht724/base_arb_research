import { DEX_EXCHANGE, PoolInfo, PoolType, Token } from "src/common/types";
import { ERC20ABI } from "../abi/erc20";
import { Abi, createPublicClient, formatEther, formatUnits, http, Log, PublicClient, TransactionReceipt, decodeEventLog } from "viem";
import { base } from "viem/chains";
import path from 'path';
import fs from 'fs';
import { logTopicsMap, EventMapABI } from "src/common/events";
import { AnalysisResult, TransactionAnalysis } from "./types";
import { getProtocolType } from "./utils";
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

export interface TokenInfo {
  address: string;
  symbol?: string;
  decimals?: number;
}


export interface SwapEvent {
  tokenIn: TokenInfo & { amount: string };
  tokenOut: TokenInfo & { amount: string };
  protocol: string;
  poolAddress: string;
}

export interface TokenChange {
  token: string;
  symbol?: string;
  change: string;
}

export interface ArbitrageCycle {
  edges: Array<{
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    poolAddress: string;
    protocol: string;
  }>;
  profitToken: string;
  profitAmount: string;
  tokenChanges: Record<string, string>;
}

export interface ArbitrageInfo {
  type: 'begin' | 'inter' | 'backrun';
  arbitrageCycles: ArbitrageCycle[];
  profit: {
    token: string;
    symbol?: string;
    amount: string;
    formattedAmount?: string;
  };
  previousTxHash?: string;
  interInfo?: Array<{
    txHash: string;
    poolAddress: string;
    transactionIndex: number;
  }>;
}

export interface TransactionAnalysisResult {
  // 基本信息
  txHash: string;
  from: string;
  to: string;
  gasUsed: string;
  gasPrice: string;
  isEmptyInput: boolean;
  
  // 交易分析
  isArbitrage: boolean;
  swapEvents: SwapEvent[];
  
  // 套利相关信息（如果是套利交易）
  arbitrageInfo?: ArbitrageInfo;
  
  // 代币变化
  tokenChanges: Record<string, string>;
  addressTokenChanges: Record<string, TokenChange[]>;
  
  // 涉及的实体
  involvedPools: PoolInfo[];
  involvedTokens: TokenInfo[];
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
  totalSwapTxs: number;
  transactions: TransactionAnalysisResult[];
}

export interface CycleEdge {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  poolAddress: string;
  protocol: string;
}

export interface EdgeInfo {
  amountIn: bigint;
  amountOut: bigint;
  poolAddress: string;
  protocol: string;
}

export class AnalysisHelper {
  public readonly httpClient: PublicClient;
  private poolCache: { [key: string]: PoolInfo } = {};
  private tokenCache: { [key: string]: Token } = {};
  private readonly CACHE_FILE = path.join(__dirname, '../../../data/pool_cache.json');
  private readonly TOKEN_CACHE_FILE = path.join(__dirname, '../../../data/token_cache.json');
  constructor(url: string) {
    // @ts-ignore
    this.httpClient = createPublicClient({
      chain: base,
      transport: http(url),
    });
    this.loadCache();
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

      this.poolCache[lowerAddress] = poolInfo;
      this.saveCache();
      return poolInfo;
    } catch (error) {
      console.error(`Error getting pool info for ${address}:`, error);
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
        tokenInfoRes[1].status == "success"
          ? (tokenInfoRes[1].result! as string)
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

  public parseSwapEvent(log: Log, poolInfo: PoolInfo): StandardSwapEvent | null {
    const topic = log.topics[0];
    
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
          topics: log.topics,
        });
        
        const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = decoded.args;
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        // 计算token0的净流入量
        const netAmount0 = amount0In - amount0Out;
        if (netAmount0 > 0n) {
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
          poolAddress: log.address.toLowerCase(),
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase(),
          recipient: to.toLowerCase(),
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
          topics: log.topics,
        });
        
        const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = decoded.args;
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        // 计算token0的净流入量
        const netAmount0 = amount0In - amount0Out;
        if (netAmount0 > 0n) {
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
          poolAddress: log.address.toLowerCase(),
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase(),
          recipient: to.toLowerCase(),
        };
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
          topics: log.topics,
        });
        
        const { sender, recipient, amount0, amount1 } = decoded.args;
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        if (amount0 > 0n) {
          tokenIn = poolInfo.token0;
          tokenOut = poolInfo.token1;
          amountIn = amount0;
          amountOut = -amount1;
        } else {
          tokenIn = poolInfo.token1;
          tokenOut = poolInfo.token0;
          amountIn = amount1;
          amountOut = -amount0;
        }
        
        return {
          poolAddress: log.address.toLowerCase(),
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase(),
          recipient: recipient.toLowerCase(),
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
          topics: log.topics,
        });
        
        const { sender, recipient, amount0, amount1 } = decoded.args;
        
        let tokenIn: string;
        let tokenOut: string;
        let amountIn: bigint;
        let amountOut: bigint;
        
        if (amount0 > 0n) {
          tokenIn = poolInfo.token0;
          tokenOut = poolInfo.token1;
          amountIn = amount0;
          amountOut = -amount1;
        } else {
          tokenIn = poolInfo.token1;
          tokenOut = poolInfo.token0;
          amountIn = amount1;
          amountOut = -amount0;
        }
        
        return {
          poolAddress: log.address.toLowerCase(),
          protocol: poolInfo.protocol,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          sender: sender.toLowerCase(),
          recipient: recipient.toLowerCase(),
        };
      }

      default:
        return null;
    }
  }

  public parseERC20Transfer(log: Log): TokenTransfer | null {
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
        topics: log.topics,
      });

      const { from, to, value } = decoded.args;
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

  public async analyzeTokenTransfers(logs: Log[]): Promise<Map<string, TokenBalanceChange[]>> {
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
        if (!graph.has(swap.tokenIn)) {
            graph.set(swap.tokenIn, new Map());
        }
        const edges = graph.get(swap.tokenIn)!;
        
        const existingEdge = edges.get(swap.tokenOut);
        if (existingEdge) {
            edges.set(swap.tokenOut, {
                amountIn: existingEdge.amountIn + swap.amountIn,
                amountOut: existingEdge.amountOut + swap.amountOut,
                poolAddress: swap.poolAddress,
                protocol: swap.protocol
            });
        } else {
            edges.set(swap.tokenOut, {
                amountIn: swap.amountIn,
                amountOut: swap.amountOut,
                poolAddress: swap.poolAddress,
                protocol: swap.protocol
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
        for (const [nextToken] of edges) {
          if (dfs(nextToken)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(token);
      return false;
    };
    
    for (const token of graph.keys()) {
      if (!visited.has(token)) {
        if (dfs(token)) {
          return true;
        }
      }
    }
    
    return false;
  }

  public calculateSwapGraphTokenChanges(graph: Map<string, Map<string, EdgeInfo>>): Map<string, bigint> {
    const tokenChanges = new Map<string, bigint>();
    
    // 遍历图中的每个token
    for (const [from, edges] of graph.entries()) {
      // 初始化from token的变化量
      if (!tokenChanges.has(from)) {
        tokenChanges.set(from, 0n);
      }
      
      // 遍历所有出边
      for (const [to, edgeInfo] of edges.entries()) {
        // 初始化to token的变化量
        if (!tokenChanges.has(to)) {
          tokenChanges.set(to, 0n);
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
    let maxProfit = 0n;
    
    // 检查所有token的变化量
    for (const [token, change] of tokenChanges.entries()) {
      if (change < 0n) {
        return { isValid: false }; // 如果有任何token为负，直接返回false
      }
      if (change > 0n) {
        positiveCount++;
        if (change > maxProfit) {
          maxProfit = change;
          profitToken = token;
        }
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

  private async collectSwapEvents(receipt: TransactionReceipt): Promise<StandardSwapEvent[]> {
    const swapEvents: StandardSwapEvent[] = [];
    const swapTopics = new Set<string>([
      logTopicsMap.V2Swap,
      logTopicsMap.V3Swap,
      logTopicsMap.AeroV2Swap,
      logTopicsMap.PancakeV3Swap
    ]);

    for (const log of receipt.logs) {
      if (!log.topics[0] || !swapTopics.has(log.topics[0])) continue;

      const poolInfo = await this.requestPoolInfo(log.address);
      if (!poolInfo) continue;

      const swapEvent = this.parseSwapEvent(log, poolInfo);
      if (swapEvent) {
        swapEvents.push(swapEvent);
      }
    }

    return swapEvents;
  }

  private async collectInvolvedEntities(swapEvents: StandardSwapEvent[]): Promise<{
    poolsInfo: Array<{
      factory: string;
      protocol: string;
      token0: string;
      token1: string;
    }>;
    tokensInfo: TokenInfo[];
    involvedProtocols: string[];
  }> {
    const involvedPools = new Set<string>();
    const involvedTokens = new Set<string>();
    const involvedProtocols = new Set<string>();

    for (const swap of swapEvents) {
      involvedPools.add(swap.poolAddress);
      involvedTokens.add(swap.tokenIn);
      involvedTokens.add(swap.tokenOut);
      involvedProtocols.add(swap.protocol);
    }

    const poolsInfo = await Promise.all(
      Array.from(involvedPools).map(async (poolAddress) => {
        const poolInfo = await this.requestPoolInfo(poolAddress);
        return {
          factory: poolInfo?.factory || '',
          protocol: poolInfo?.protocol || '',
          token0: poolInfo?.token0 || '',
          token1: poolInfo?.token1 || ''
        };
      })
    );

    const tokensInfo = await Promise.all(
      Array.from(involvedTokens).map(async (tokenAddress) => {
        const tokenInfo = await this.requestTokenInfo(tokenAddress);
        return {
          address: tokenAddress,
          symbol: tokenInfo?.symbol
        };
      })
    );

    return {
      poolsInfo,
      tokensInfo,
      involvedProtocols: Array.from(involvedProtocols)
    };
  }

  private async formatSwapEvents(swapEvents: StandardSwapEvent[]): Promise<SwapEvent[]> {
    return Promise.all(swapEvents.map(async (swap) => {
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
  }

  private async determineArbitrageType(
    swapEvents: StandardSwapEvent[],
    currentTxIndex: number,
    blockTransactions: Array<{ txHash: string; transactionIndex: number; receipt: TransactionReceipt }>
  ): Promise<{
    type: 'begin' | 'inter' | 'backrun';
    previousTxHash?: string;
    interInfo?: Array<{ txHash: string; poolAddress: string; transactionIndex: number; }>;
  }> {
    // 获取当前交易涉及的池子
    const currentPools = new Set(swapEvents.map(e => e.poolAddress));
    
    // 查找前一笔交易
    const prevTx = blockTransactions.find(tx => tx.transactionIndex === currentTxIndex - 1);
    if (!prevTx) {
      return { type: 'begin' };
    }

    // 获取前一笔交易的swap事件
    const prevSwapEvents = await this.collectSwapEvents(prevTx.receipt);
    if (prevSwapEvents.length === 0) {
      return { type: 'begin' };
    }

    // 检查前一笔交易是否涉及相同的池子
    const prevPools = new Set(prevSwapEvents.map(e => e.poolAddress));
    const commonPools = new Set([...currentPools].filter(pool => prevPools.has(pool)));

    if (commonPools.size === 0) {
      return { type: 'begin' };
    }

    // 检查是否所有共同池子都在前一笔交易中
    const isBackrun = [...currentPools].every(pool => prevPools.has(pool));

    return {
      type: isBackrun ? 'backrun' : 'inter',
      previousTxHash: prevTx.txHash,
      interInfo: Array.from(commonPools).map(pool => ({
        txHash: prevTx.txHash,
        poolAddress: pool,
        transactionIndex: prevTx.transactionIndex
      }))
    };
  }

  public async analyzeBlockArbitrage(blockNumber: number): Promise<BlockArbitrageResult> {
    const transactions: TransactionAnalysisResult[] = [];
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

    // 使用filterLogs获取所有swap事件
    const logs = await this.httpClient.getLogs({
      fromBlock: BigInt(blockNumber),
      toBlock: BigInt(blockNumber),
      events: [
        EventMapABI.V2Swap,
        EventMapABI.V3Swap,
        EventMapABI.AeroV2Swap,
        EventMapABI.PancakeV3Swap
      ]
    });

    // 按交易哈希分组logs
    const txLogsMap = new Map<string, Log[]>();
    for (const log of logs) {
      const txLogs = txLogsMap.get(log.transactionHash) || [];
      txLogs.push(log);
      txLogsMap.set(log.transactionHash, txLogs);
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
    for (const { txHash, receipt, transactionIndex } of sortedTxDetails) {
      const swapEvents = await this.collectSwapEvents(receipt);
      if (swapEvents.length === 0) continue;

      const { poolsInfo, tokensInfo, involvedProtocols } = await this.collectInvolvedEntities(swapEvents);
      const formattedSwapEvents = await this.formatSwapEvents(swapEvents);

      const graph = this.buildSwapGraph(swapEvents);
      const { isValid, profitToken } = this.validateSwapGraphTokenChanges(graph);
      
      const tx = await this.httpClient.getTransaction({ hash: txHash as `0x${string}` });
      if (!tx) continue;

      const addressTokenChanges = await this.analyzeTokenTransfers(receipt.logs);
      const graphTokenChanges = this.calculateSwapGraphTokenChanges(graph);

      if (isValid && profitToken) {
        const { type, previousTxHash, interInfo } = await this.determineArbitrageType(
          swapEvents,
          transactionIndex,
          sortedTxDetails
        );

        // 获取profit token的信息
        const profitTokenInfo = await this.requestTokenInfo(profitToken);
        const profitAmount = graphTokenChanges.get(profitToken) || 0n;

        // 查找所有套利环
        const arbitrageCycles = this.findArbitrageCycles(swapEvents);

        transactions.push({
          txHash,
          from: tx.from.toLowerCase(),
          to: tx.to?.toLowerCase() || '',
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice?.toString() || '0',
          isEmptyInput: tx.input === '0x',
          isArbitrage: true,
          swapEvents: formattedSwapEvents,
          arbitrageInfo: {
            type,
            arbitrageCycles: arbitrageCycles.map(cycle => ({
              edges: cycle.edges.map(edge => ({
                tokenIn: edge.tokenIn,
                tokenOut: edge.tokenOut,
                amountIn: edge.amountIn.toString(),
                amountOut: edge.amountOut.toString(),
                poolAddress: edge.poolAddress,
                protocol: edge.protocol
              })),
              profitToken: cycle.profitToken,
              profitAmount: cycle.profitAmount.toString(),
              tokenChanges: this.formatTokenChanges(cycle.tokenChanges)
            })),
            profit: {
              token: profitToken,
              symbol: profitTokenInfo?.symbol,
              amount: profitAmount.toString(),
              formattedAmount: formatUnits(profitAmount, profitTokenInfo?.decimals || 18)
            },
            previousTxHash,
            interInfo
          },
          tokenChanges: this.formatTokenChanges(graphTokenChanges),
          addressTokenChanges: this.formatAddressTokenChanges(addressTokenChanges),
          involvedPools: poolsInfo,
          involvedTokens: tokensInfo,
          involvedProtocols
        });
      } else {
        transactions.push({
          txHash,
          from: tx.from.toLowerCase(),
          to: tx.to?.toLowerCase() || '',
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice?.toString() || '0',
          isEmptyInput: tx.input === '0x',
          isArbitrage: false,
          swapEvents: formattedSwapEvents,
          tokenChanges: this.formatTokenChanges(graphTokenChanges),
          addressTokenChanges: this.formatAddressTokenChanges(addressTokenChanges),
          involvedPools: poolsInfo,
          involvedTokens: tokensInfo,
          involvedProtocols
        });
      }

      // 更新pool的历史记录
      for (const swap of swapEvents) {
        poolSwapHistory.set(swap.poolAddress, txHash);
      }
    }

    return {
      blockNumber,
      blockInfo,
      totalArbitrageTxs: transactions.filter(tx => tx.isArbitrage).length,
      totalSwapTxs: transactions.length,
      transactions
    };
  }

  private findCycle(
    graph: Map<string, Map<string, EdgeInfo>>,
    startToken: string,
    currentToken: string,
    visited: Set<string>,
    path: string[],
    currentEdges: Array<{
      tokenIn: string;
      tokenOut: string;
      amountIn: bigint;
      amountOut: bigint;
      poolAddress: string;
      protocol: string;
    }>
  ): ArbitrageCycle | null {
    if (path.length > 0 && currentToken === startToken) {
      // 找到环，计算token变化
      const tokenChanges = new Map<string, bigint>();
      let profitToken: string | undefined;
      let maxProfit = 0n;

      // 计算每个token的净变化
      for (const edge of currentEdges) {
        const currentIn = tokenChanges.get(edge.tokenIn) || 0n;
        const currentOut = tokenChanges.get(edge.tokenOut) || 0n;
        tokenChanges.set(edge.tokenIn, currentIn - edge.amountIn);
        tokenChanges.set(edge.tokenOut, currentOut + edge.amountOut);
      }

      // 找出利润最大的token
      for (const [token, change] of tokenChanges.entries()) {
        if (change > maxProfit) {
          maxProfit = change;
          profitToken = token;
        }
      }

      // 验证是否所有token变化都非负
      for (const [token, change] of tokenChanges.entries()) {
        if (change < 0n) {
          return null;
        }
      }

      if (profitToken && maxProfit > 0n) {
        return {
          edges: currentEdges.map(edge => ({
            tokenIn: edge.tokenIn,
            tokenOut: edge.tokenOut,
            amountIn: edge.amountIn.toString(),
            amountOut: edge.amountOut.toString(),
            poolAddress: edge.poolAddress,
            protocol: edge.protocol
          })),
          profitToken,
          profitAmount: maxProfit.toString(),
          tokenChanges: this.formatTokenChanges(tokenChanges)
        };
      }
      return null;
    }

    if (visited.has(currentToken)) {
      return null;
    }

    visited.add(currentToken);
    path.push(currentToken);

    const graphEdges = graph.get(currentToken);
    if (graphEdges) {
      for (const [nextToken, edgeInfo] of graphEdges.entries()) {
        const cycle = this.findCycle(
          graph,
          startToken,
          nextToken,
          visited,
          path,
          [...currentEdges, {
            tokenIn: currentToken,
            tokenOut: nextToken,
            amountIn: edgeInfo.amountIn,
            amountOut: edgeInfo.amountOut,
            poolAddress: edgeInfo.poolAddress,
            protocol: edgeInfo.protocol
          }]
        );
        if (cycle) {
          return cycle;
        }
      }
    }

    visited.delete(currentToken);
    path.pop();
    return null;
  }

  private findArbitrageCycles(swapEvents: StandardSwapEvent[]): ArbitrageCycle[] {
    const cycles: ArbitrageCycle[] = [];
    const graph = new Map<string, Map<string, EdgeInfo>>();
    
    // 逐步添加边并检测环
    for (const swap of swapEvents) {
      // 添加新边到图中
      if (!graph.has(swap.tokenIn)) {
        graph.set(swap.tokenIn, new Map());
      }
      const edges = graph.get(swap.tokenIn)!;
      
      const existingEdge = edges.get(swap.tokenOut);
      if (existingEdge) {
        edges.set(swap.tokenOut, {
          amountIn: existingEdge.amountIn + swap.amountIn,
          amountOut: existingEdge.amountOut + swap.amountOut,
          poolAddress: swap.poolAddress,
          protocol: swap.protocol
        });
      } else {
        edges.set(swap.tokenOut, {
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
          poolAddress: swap.poolAddress,
          protocol: swap.protocol
        });
      }

      // 从当前token开始检测环
      const cycle = this.findCycle(
        graph,
        swap.tokenIn,
        swap.tokenIn,
        new Set(),
        [],
        []
      );

      if (cycle) {
        cycles.push(cycle);
        
        // 移除环中使用的边
        for (const edge of cycle.edges) {
          const edges = graph.get(edge.tokenIn);
          if (edges) {
            edges.delete(edge.tokenOut);
            // 如果这个token没有其他出边了，也移除这个token
            if (edges.size === 0) {
              graph.delete(edge.tokenIn);
            }
          }
        }
      }
    }

    return cycles;
  }

  public async analyzeTransaction(txHash: string): Promise<TransactionAnalysisResult | null> {
    try {
      const receipt = await this.httpClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!receipt) return null;

      const tx = await this.httpClient.getTransaction({ hash: txHash as `0x${string}` });
      if (!tx) return null;

      const swapEvents = await this.collectSwapEvents(receipt);
      if (swapEvents.length === 0) return null;

      const { poolsInfo, tokensInfo, involvedProtocols } = await this.collectInvolvedEntities(swapEvents);
      const formattedSwapEvents = await this.formatSwapEvents(swapEvents);

      const graph = this.buildSwapGraph(swapEvents);
      const { isValid, profitToken } = this.validateSwapGraphTokenChanges(graph);
      const graphTokenChanges = this.calculateSwapGraphTokenChanges(graph);
      const addressTokenChanges = await this.analyzeTokenTransfers(receipt.logs);

      if (isValid && profitToken) {
        const arbitrageCycles = this.findArbitrageCycles(swapEvents);
        const profitTokenInfo = await this.requestTokenInfo(profitToken);
        const profitAmount = graphTokenChanges.get(profitToken) || 0n;

        return {
          txHash,
          from: tx.from.toLowerCase(),
          to: tx.to?.toLowerCase() || '',
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice?.toString() || '0',
          isEmptyInput: tx.input === '0x',
          isArbitrage: true,
          swapEvents: formattedSwapEvents,
          arbitrageInfo: {
            type: 'begin', // 默认类型，可以根据需要修改
            arbitrageCycles: arbitrageCycles.map(cycle => ({
              edges: cycle.edges.map(edge => ({
                tokenIn: edge.tokenIn,
                tokenOut: edge.tokenOut,
                amountIn: edge.amountIn.toString(),
                amountOut: edge.amountOut.toString(),
                poolAddress: edge.poolAddress,
                protocol: edge.protocol
              })),
              profitToken: cycle.profitToken,
              profitAmount: cycle.profitAmount.toString(),
              tokenChanges: this.formatTokenChanges(cycle.tokenChanges)
            })),
            profit: {
              token: profitToken,
              symbol: profitTokenInfo?.symbol,
              amount: profitAmount.toString(),
              formattedAmount: formatUnits(profitAmount, profitTokenInfo?.decimals || 18)
            }
          },
          tokenChanges: this.formatTokenChanges(graphTokenChanges),
          addressTokenChanges: this.formatAddressTokenChanges(addressTokenChanges),
          involvedPools: poolsInfo,
          involvedTokens: tokensInfo,
          involvedProtocols
        };
      } else {
        return {
          txHash,
          from: tx.from.toLowerCase(),
          to: tx.to?.toLowerCase() || '',
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice?.toString() || '0',
          isEmptyInput: tx.input === '0x',
          isArbitrage: false,
          swapEvents: formattedSwapEvents,
          tokenChanges: this.formatTokenChanges(graphTokenChanges),
          addressTokenChanges: this.formatAddressTokenChanges(addressTokenChanges),
          involvedPools: poolsInfo,
          involvedTokens: tokensInfo,
          involvedProtocols
        };
      }
    } catch (error) {
      console.error(`Error analyzing transaction ${txHash}:`, error);
      return null;
    }
  }

  private formatTokenChanges(tokenChanges: Map<string, bigint> | Record<string, string>): Record<string, string> {
    if (tokenChanges instanceof Map) {
      return Object.fromEntries(
        Array.from(tokenChanges.entries()).map(([token, change]) => [
          token,
          change.toString()
        ])
      );
    }
    return tokenChanges;
  }

  private formatAddressTokenChanges(addressTokenChanges: Map<string, TokenBalanceChange[]>): Record<string, Array<{
    token: string;
    symbol?: string;
    change: string;
  }>> {
    return Object.fromEntries(
      Array.from(addressTokenChanges.entries()).map(([address, changes]) => [
        address,
        changes.map(change => ({
          token: change.token,
          symbol: change.symbol,
          change: change.change.toString()
        }))
      ])
    );
  }
}