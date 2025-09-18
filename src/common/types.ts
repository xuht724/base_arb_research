export const enum DEX_EXCHANGE {
  UNISWAP = "uniswap",
  AERODROME = "aerodrome",
  UNKNOWN = "unknown",
}
export const enum PoolType {
  UNIV2 = "univ2",
  UNIV3 = "univ3",
  AERODROMEV2 = "aerodromev2",
  AERODROMEV3 = "aerodromev3",
}
export const enum ProtocolType {
  UNISWAPV2 = "uniswapv2",
  UNISWAPV3 = "uniswapv3",
  UNISWAPV4 = "uniswapv4",
  AERODROMEV2 = "aerodromev2",
  AERODROMEV3 = "aerodromev3",
  SUSHISWAP = "sushiswap",
  SOLIDSWAP = "solidswap",
  DACKIEV3 = "dackiev3",
  ALIENV3 = "alienv3",
  PANCAKEV2 = "pancakev2",
  PANCAKEV3 = "pancakev3",
  CURVE = "curve",
  BALANCERV2 = "balancerv2",
}

export type Swap = {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
};

export type SwapAmtIn = {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
};

export type SwapAmtOut = {
  tokenIn: string;
  tokenOut: string;
  amountOut: bigint;
};

export type Token = {
  symbol?: string;
  name?: string;
  decimals: number;
  address: string;
};

export type PoolInfo = {
  token0: string;
  token1: string;
  factory: string;
  protocol: string;
}

export type ExtendedPoolInfo = {
  tokens: string[];  // 支持多个代币
  factory?: string;  // factory 变为可选
  protocol: string;  // 协议类型
  poolType?: string; // 池子类型，可选
  poolAddress?: string;
  poolId?: string;
}