import { Log } from "viem";
import type { DEX_EXCHANGE, PoolType, Swap, SwapAmtIn, SwapAmtOut } from "../../common/types";

// This can be used to initialize a pool
export type PoolInfo = {
  poolType: PoolType;
  poolId: string;
  poolStaticInfo: PoolStaticInfo;
  poolState: PoolState;
};

export type PoolStaticInfo = {
  poolId: string;
};

export type PoolState = {
  poolId: string;
};

export interface Pool {
  poolId: string;
  dexExchange: DEX_EXCHANGE;
  poolType: PoolType;
  tokens: string[];
  swapFee: bigint;

  getOutGivenIn(input: SwapAmtIn): Swap;
  getInGivenOut(output: SwapAmtOut): Swap;

  clone(): Pool;
  getPoolState(): PoolState;
  getStaticInfo(): PoolStaticInfo;
  getInitialInfo(): PoolInfo;
  exportToJSON(): string;

  isValidPool(): boolean;

  getPriceX96(tokenIn: string, tokenOut: string): bigint;
  getPriceX96AfterSwap(input: SwapAmtIn): [bigint, Swap];

  handleLog(log: Log): void;
}
