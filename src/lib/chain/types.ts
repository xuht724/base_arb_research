import { ExtendedPoolInfo } from 'src/common/types';
import { Transaction, TransactionReceipt, Log } from 'viem';
import { GasInfo } from 'src/lib/chain/arb.helper';

export interface StandardSwapEvent {
  logIndex: any;
  poolAddress: string;
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  sender: string;
  recipient: string;
  ethFlag: boolean;
  blockNumber?: number;
  transactionIndex?: number;
  txFrom?: string;
  txTo?: string | null;
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
    sandwichDeduction?: string;
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
    gas: GasInfo;
    input: string;
    inputAnalysis: any;
    arbitrageInfo?: ArbitrageInfo;
    sandwichInfo?: SandwichAttack[]; 
    swapEvents: StandardSwapEvent[];
    tokenChanges: Record<string, string>;
    addressTokenChanges: Record<string, TokenBalanceChange[]>;
  }>;
  sandwichAttacks?: SandwichAttack[]; 
}




export interface TransactionAnalysis {
  transactions: any;
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

export interface SandwichAttack {
  blockNumber: number;
  attacker: string;
  front: StandardSwapEvent;
  back: StandardSwapEvent;
  victims: StandardSwapEvent[];
  profitToken: string;
  profitAmount: bigint;
}

export interface AssetFlow {
  txIndex: number;
  logIndex: number;
  from: string;
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
}

export interface AssetPair {
  token0: string;
  token1: string;
}

export interface SandwichConfidence {
  score: number;
  reasons: string[];
}

export interface EnhancedSandwichAttack {
  type: 'sandwich_attack';
  frontrun: AssetFlow;
  victim: AssetFlow;
  backrun: AssetFlow;
  profit: {
    token: string;
    amount: bigint;
    usdValue?: number;
  };
}

