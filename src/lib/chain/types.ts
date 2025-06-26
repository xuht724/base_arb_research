import { ExtendedPoolInfo } from 'src/common/types';
import { Transaction, TransactionReceipt, Log } from 'viem';

export interface StandardSwapEvent {
  poolAddress: string;
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  sender: string;
  recipient: string;
  ethFlag: boolean;
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
  decimals?: number;
  change: bigint;
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

export interface TransactionAnalysis {
  hash: string;
  blockNumber: string;
  logNum: number;
  potentialArb: boolean;
  effectiveGasPrice: string;
  gasUsed: string;
  l2Fee: string;
  profit: string;
  pools: ExtendedPoolInfo[];
  protocols: string[];
  tokens: string[];
  involvedPools: string[];
  involvedProtocols: string[];
}

export interface AnalysisResult {
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

export interface ArbitrageInfo {
  type: 'begin' | 'inter';
  isBackrun: boolean;
  arbitrageCycles: ArbitrageCycle[];
  cyclesLength: number;
  profit: {
    token: string;
    symbol?: string;
    amount: string;
    formattedAmount?: string;
  };
  interInfo?: Array<{
    txHash: string;
    poolAddress: string;
    transactionIndex: number;
  }>;
}

export interface BlockAnalysisResult {
  blockNumber: number;
  timestamp: Date;
  transactions: Array<{
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
  }>;
}

