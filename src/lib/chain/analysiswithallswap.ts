import { DEX_EXCHANGE, PoolType, Token } from "src/common/types";
import { ERC20ABI } from "../abi/erc20";
import { Abi, createPublicClient, formatEther, formatUnits, http, Log, PublicClient, TransactionReceipt, decodeEventLog } from "viem";
import { base } from "viem/chains";
import path from 'path';
import fs from 'fs';
import { logTopicsMap, EventMapABI } from "src/common/events";
import { AnalysisResult, TransactionAnalysis, getProtocolType } from "./types";
import { PoolInfo } from "src/common/types";

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
            topics: log.topics,
          });
        
          const { tokenIn, tokenOut, amountIn, amountOut } = decoded.args;
        
          // 由于交易信息不在log中，我们使用默认值
          // 实际情况中可能需要通过其他方式获取sender和recipient
          const sender = 'unknown';
          const recipient = 'unknown';
        
          return {
            poolAddress: log.address.toLowerCase(),
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
    }//只找一个环
    
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

    // 使用filterLogs获取所有swap事件
    const logs = await this.httpClient.getLogs({
      fromBlock: BigInt(blockNumber),
      toBlock: BigInt(blockNumber),
      events: [
        EventMapABI.V2Swap,
        EventMapABI.V3Swap,
        EventMapABI.AeroV2Swap,
        EventMapABI.PancakeV3Swap,
        EventMapABI.BalancerVaultSwap
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
          const profitAmount = graphTokenChanges.get(profitToken) || 0n;

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
              amount: profitAmount.toString(),
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
}
