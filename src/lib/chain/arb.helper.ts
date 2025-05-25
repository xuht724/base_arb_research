import { DEX_EXCHANGE, ExtendedPoolInfo, PoolType, Token } from "src/common/types";
import { ERC20ABI } from "../abi/erc20";
import { Abi, createPublicClient, formatEther, formatUnits, http, Log, PublicClient, TransactionReceipt, decodeEventLog, Transaction } from "viem";
import { base } from "viem/chains";
import path from 'path';
import fs from 'fs';
import { logTopicsMap, EventMapABI } from "src/common/events";
import { ArbitrageCycle, CycleEdge, EdgeInfo, StandardSwapEvent, TokenBalanceChange, TokenTransfer, ArbitrageInfo, BlockAnalysisResult } from "./types";
import { getProtocolType } from "./utils";
import { replacer } from "../utils";

export class ArbHelper {
  public readonly httpClient: PublicClient;
  private extendedPoolCache: { [key: string]: ExtendedPoolInfo } = {};
  private tokenCache: { [key: string]: Token } = {};
  private readonly EXTENDED_POOL_CACHE_FILE = path.join(__dirname, '../../../data/extended_pool_cache.json');
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
      if (fs.existsSync(this.EXTENDED_POOL_CACHE_FILE)) {
        const data = fs.readFileSync(this.EXTENDED_POOL_CACHE_FILE, 'utf-8');
        this.extendedPoolCache = JSON.parse(data);
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
      fs.writeFileSync(this.EXTENDED_POOL_CACHE_FILE, JSON.stringify(this.extendedPoolCache, null, 2));
      fs.writeFileSync(this.TOKEN_CACHE_FILE, JSON.stringify(this.tokenCache, null, 2));
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  public async requestPoolInfo(address: string): Promise<ExtendedPoolInfo | null> {
    const lowerAddress = address.toLowerCase();
    if (this.extendedPoolCache[lowerAddress]) {
      return this.extendedPoolCache[lowerAddress];
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

      const factoryAddress = factory.result ? (factory.result as unknown as string).toLowerCase() : 'Unknown';
      const protocol = factoryAddress ? getProtocolType(factoryAddress) : 'Unknown';

      const poolInfo: ExtendedPoolInfo = {
        tokens: [
          (token0.result as unknown as string).toLowerCase(),
          (token1.result as unknown as string).toLowerCase()
        ],
        factory: factoryAddress,
        protocol: protocol,
        poolType: 'v2v3' // 默认类型
      };

      this.extendedPoolCache[lowerAddress] = poolInfo;
      this.saveCache();
      return poolInfo;
    } catch (error) {
      console.error(`Error getting pool info for ${address}:`, error);
      return null;
    }
  }

  public async requestExtendedPoolInfo(address: string): Promise<ExtendedPoolInfo | null> {
    const lowerAddress = address.toLowerCase();
    if (this.extendedPoolCache[lowerAddress]) {
      return this.extendedPoolCache[lowerAddress];
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

      const factoryAddress = factory.result ? (factory.result as unknown as string).toLowerCase() : 'Unknown';
      const protocol = factoryAddress ? getProtocolType(factoryAddress) : 'Unknown';

      const poolInfo: ExtendedPoolInfo = {
        tokens: [
          (token0.result as unknown as string).toLowerCase(),
          (token1.result as unknown as string).toLowerCase()
        ],
        factory: factoryAddress,
        protocol: protocol,
        poolType: 'v2v3' // 默认类型
      };

      this.extendedPoolCache[lowerAddress] = poolInfo;
      this.saveCache();
      return poolInfo;
    } catch (error) {
      console.error(`Error getting extended pool info for ${address}:`, error);
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

  public parseSwapEvent(log: Log, poolInfo: ExtendedPoolInfo): StandardSwapEvent | null {
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
          tokenIn = poolInfo.tokens[0];
          tokenOut = poolInfo.tokens[1];
          amountIn = amount0In;
          amountOut = amount1Out;
        } else {
          // token0净流出，说明token1是输入代币
          tokenIn = poolInfo.tokens[1];
          tokenOut = poolInfo.tokens[0];
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
          tokenIn = poolInfo.tokens[0];
          tokenOut = poolInfo.tokens[1];
          amountIn = amount0In;
          amountOut = amount1Out;
        } else {
          // token0净流出，说明token1是输入代币
          tokenIn = poolInfo.tokens[1];
          tokenOut = poolInfo.tokens[0];
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
          tokenIn = poolInfo.tokens[0];
          tokenOut = poolInfo.tokens[1];
          amountIn = amount0;
          amountOut = -amount1;
        } else {
          tokenIn = poolInfo.tokens[1];
          tokenOut = poolInfo.tokens[0];
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
          tokenIn = poolInfo.tokens[0];
          tokenOut = poolInfo.tokens[1];
          amountIn = amount0;
          amountOut = -amount1;
        } else {
          tokenIn = poolInfo.tokens[1];
          tokenOut = poolInfo.tokens[0];
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
      // console.error('Error parsing ERC20 transfer:', error);
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
        // 如果缓存中有代币信息，则使用缓存中的信息
        const cachedToken = this.tokenCache[transfer.token];
        if (cachedToken) {
          transfer.decimals = cachedToken.decimals;
          transfer.symbol = cachedToken.symbol;
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

  public findArbitrageCycles(swapEvents: StandardSwapEvent[]): ArbitrageCycle[] {
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
  public validateSwapGraphTokenChanges(graph: Map<string, Map<string, EdgeInfo>>): { isValid: boolean; profitToken?: string } {
    const tokenChanges = this.calculateSwapGraphTokenChanges(graph);
    
    let positiveCount = 0;
    let profitToken: string | undefined;

    // 检查所有token的变化量
    for (const [token, change] of tokenChanges.entries()) {
      if (change < 0n) {
        return { isValid: false }; // 如果有任何token为负，直接返回false
      }
      if (change > 0n) {
        positiveCount++;
        profitToken = token;
      }
    }
    
    // 必须恰好有一个token为正，其他token都大于等于0
    return { 
      isValid: true,
      profitToken
    };
  }



  public formatTokenChanges(tokenChanges: Map<string, bigint> | Record<string, string>): Record<string, string> {
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

  public formatAddressTokenChanges(addressChanges: Map<string, TokenBalanceChange[]>): Record<string, TokenBalanceChange[]> {
    return Object.fromEntries(addressChanges.entries());
  }

  public getArbitrageInfo(
    swapEvents: StandardSwapEvent[],
  ):{
    arbitrageCycles: ArbitrageCycle[],
    isArbitrage: boolean,
  }{
    const arbitrageCycles = this.findArbitrageCycles(swapEvents);
    const flag = this.validateSwapGraphTokenChanges(this.buildSwapGraph(swapEvents));

    const isArbitrage = arbitrageCycles.length > 0 && flag.isValid;
    return {
      arbitrageCycles,
      isArbitrage,
    };
  }

  public async getBlockReceipts(blockNumber: number): Promise<any[]> {
    try {
      const receipts = await this.httpClient.request({
        method: 'eth_getBlockReceipts' as any,
        params: [`0x${blockNumber.toString(16)}`]
      });
      return receipts as any[];
    } catch (error) {
      console.error(`Error getting block receipts for block ${blockNumber}:`, error);
      return [];
    }
  }

  public async getBlock(blockNumber: number) {
    const block = await this.httpClient.getBlock({
      blockNumber: BigInt(blockNumber),
      includeTransactions: false  
    });
    return block;
  }

  public async getBlockWithReceipts(blockNumber: number): Promise<{
    blockNumber: number;
    blockHash: string;
    parentHash: string;
    timestamp: Date;
    gasUsed: string
    gasLimit: string;
    baseFeePerGas: string | null;
    miner: string;
    transactions: any[];
    receipts: any[];
  } | null> {
    try {
      // 获取区块信息
      const block = await this.httpClient.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: true
      });

      // 获取区块receipts
      const receipts = await this.getBlockReceipts(blockNumber);

      return {
        blockNumber: Number(block.number),
        blockHash: block.hash,
        parentHash: block.parentHash,
        timestamp: new Date(Number(block.timestamp) * 1000),
        gasUsed: block.gasUsed.toString(),
        gasLimit: block.gasLimit.toString(),
        baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
        miner: block.miner,
        transactions: block.transactions,
        receipts
      };
    } catch (error) {
      console.error(`Error getting block info for block ${blockNumber}:`, error);
      return null;
    }
  }

  public async getBlocksWithReceipts(blockNumbers: number[]): Promise<Array<{
    blockNumber: number;
    blockHash: string;
    parentHash: string;
    timestamp: Date;
    gasUsed: string;
    gasLimit: string;
    baseFeePerGas: string | null;
    miner: string;
    transactions: any[];
    receipts: any[];
  } | null>> {
    try {
      // 批量获取区块信息
      const blockPromises = blockNumbers.map(blockNumber => 
        this.httpClient.getBlock({
          blockNumber: BigInt(blockNumber),
          includeTransactions: true
        })
      );
      const blocks = await Promise.all(blockPromises);

      // 批量获取receipts
      const receiptPromises = blockNumbers.map(blockNumber => 
        this.getBlockReceipts(blockNumber)
      );
      const receipts = await Promise.all(receiptPromises);

      // 组合结果并序列化
      return blocks.map((block, index) => {
        if (!block) return null;
        
        // 使用replacer序列化数据
        const serializedBlock = JSON.parse(JSON.stringify(block, replacer));
        const serializedReceipts = JSON.parse(JSON.stringify(receipts[index], replacer));
        
        return {
          blockNumber: Number(serializedBlock.number),
          blockHash: serializedBlock.hash,
          parentHash: serializedBlock.parentHash,
          timestamp: new Date(Number(serializedBlock.timestamp) * 1000),
          gasUsed: serializedBlock.gasUsed,
          gasLimit: serializedBlock.gasLimit,
          baseFeePerGas: serializedBlock.baseFeePerGas ?? null,
          miner: serializedBlock.miner,
          transactions: serializedBlock.transactions,
          receipts: serializedReceipts
        };
      });
    } catch (error) {
      console.error(`Error getting blocks info:`, error);
      return blockNumbers.map(() => null);
    }
  }

  private async analyzeTransaction(
    tx: Transaction,
    receipt: TransactionReceipt,
    blockNumber: number,
    previousTransactions: Map<string, { txHash: string; index: number }[]>, // poolAddress -> Array<{txHash, index}>
    currentIndex: number
  ): Promise<{
    hash: string;
    index: number;
    from: string;
    to?: string;
    gasPrice: string;
    gasUsed: string;
    input: string;
    arbitrageInfo?: ArbitrageInfo;
    swapEvents: StandardSwapEvent[];
    tokenChanges: Record<string, string>;
    addressTokenChanges: Record<string, TokenBalanceChange[]>;
  } | null> {
    if (!tx || typeof tx === 'string') return null;

    // 解析交易中的所有swap事件
    const swapEvents: StandardSwapEvent[] = [];
    const swapTopics = new Set<string>([
      logTopicsMap.V2Swap,
      logTopicsMap.V3Swap,
      logTopicsMap.AeroV2Swap,
      logTopicsMap.PancakeV3Swap
    ]);

    // 收集交易中涉及的池子
    const involvedPools = new Set<string>();
    const previousPoolTxs = new Map<string, { txHash: string; index: number }>(); // poolAddress -> {txHash, index}

    for (const log of receipt.logs as Log[]) {
      if (!log.topics[0] || !swapTopics.has(log.topics[0])) continue;

      const poolInfo = await this.requestPoolInfo(log.address);
      if (!poolInfo) continue;

      involvedPools.add(log.address.toLowerCase());
      
      // 检查这个池子之前是否有交易
      const previousTxs = previousTransactions.get(log.address.toLowerCase());
      if (previousTxs && previousTxs.length > 0) {
        // 获取最后一笔交易
        const lastTx = previousTxs[previousTxs.length - 1];
        previousPoolTxs.set(log.address.toLowerCase(), lastTx);
      }

      // 解析 swap 事件
      const swapEvent = this.parseSwapEvent(log, poolInfo);
      if (swapEvent) {
        swapEvents.push(swapEvent);
      }
    }

    // 如果交易中有swap事件，分析是否是套利交易
    if (swapEvents.length > 0) {
      // 构建交易图
      const graph = this.buildSwapGraph(swapEvents);
      const { isValid, profitToken } = this.validateSwapGraphTokenChanges(graph);
      const graphTokenChanges = this.calculateSwapGraphTokenChanges(graph);
      const addressTokenChanges = await this.analyzeTokenTransfers(receipt.logs);

      if (isValid && profitToken) {
        const arbitrageCycles = this.findArbitrageCycles(swapEvents);
        const profitAmount = graphTokenChanges.get(profitToken) || 0n;

        // 确定套利类型
        let arbitrageType: 'begin' | 'inter' = 'begin';
        let isBackrun = false;
        const interInfo: Array<{ txHash: string; poolAddress: string; transactionIndex: number }> = [];

        if (previousPoolTxs.size > 0) {
          arbitrageType = 'inter';
          
          // 检查是否是backrun
          // 如果所有涉及的池子的最后一笔交易索引都是当前交易索引的前一个，则认为是backrun
          const isAllPreviousIndex = Array.from(previousPoolTxs.values()).every(
            ({ index }) => index === currentIndex - 1
          );
          isBackrun = isAllPreviousIndex;

          // 收集inter信息
          for (const [poolAddress, { txHash, index }] of previousPoolTxs.entries()) {
            interInfo.push({
              txHash,
              poolAddress,
              transactionIndex: index
            });
          }
        }

        return {
          hash: tx.hash,
          index: currentIndex,
          from: tx.from.toLowerCase(),
          to: tx.to?.toLowerCase(),
          gasPrice: tx.gasPrice?.toString() || '0',
          gasUsed: receipt.gasUsed.toString(),
          input: tx.input,
          arbitrageInfo: {
            type: arbitrageType,
            isBackrun,
            arbitrageCycles,
            cyclesLength: arbitrageCycles.length,
            profit: {
              token: profitToken,
              amount: profitAmount.toString()
            },
            interInfo: arbitrageType === 'inter' ? interInfo : undefined
          },
          swapEvents,
          tokenChanges: this.formatTokenChanges(graphTokenChanges),
          addressTokenChanges: this.formatAddressTokenChanges(addressTokenChanges)
        };
      }
    }

    return {
      hash: tx.hash,
      index: currentIndex,
      from: tx.from.toLowerCase(),
      to: tx.to?.toLowerCase(),
      gasPrice: tx.gasPrice?.toString() || '0',
      gasUsed: receipt.gasUsed.toString(),
      input: tx.input,
      swapEvents,
      tokenChanges: {},
      addressTokenChanges: {}
    };
  }

  public async analyzeBlock(
    blockNumber: number,
    timestamp: Date,
    transactions: Transaction[],
    receipts: TransactionReceipt[]
  ): Promise<BlockAnalysisResult | null> {
    try {
      // 用于跟踪每个池子的交易历史
      const poolTransactionHistory = new Map<string, { txHash: string; index: number }[]>();
      const analyzedTransactions = [];

      // 顺序处理每笔交易
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const receipt = receipts[i];
        if (!receipt) continue;

        // 分析当前交易
        const analysis = await this.analyzeTransaction(tx, receipt, blockNumber, poolTransactionHistory, i);
        if (analysis) {
          analyzedTransactions.push(analysis);
          
          // 更新池子交易历史
          if (analysis.swapEvents) {
            for (const event of analysis.swapEvents) {
              const poolAddress = event.poolAddress.toLowerCase();
              if (!poolTransactionHistory.has(poolAddress)) {
                poolTransactionHistory.set(poolAddress, []);
              }
              poolTransactionHistory.get(poolAddress)!.push({
                txHash: tx.hash,
                index: i
              });
            }
          }
        }
      }

      return {
        blockNumber,
        timestamp,  
        transactions: analyzedTransactions
      };
    } catch (error) {
      console.error(`Error analyzing block ${blockNumber}:`, error);
      return null;
    }
  }

}