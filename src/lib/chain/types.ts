import { FACTORY_MAP } from 'src/common/constants';
import { PoolInfo } from 'src/common/types';
export interface TransactionAnalysis {
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

// 获取协议类型
export function getProtocolType(factory: string): string | null {
  // 首先尝试从factory地址推导
  const protocolFromFactory = FACTORY_MAP[factory.toLowerCase()];
  if (protocolFromFactory) {
    return protocolFromFactory;
  }
  return 'Unknown';
} 