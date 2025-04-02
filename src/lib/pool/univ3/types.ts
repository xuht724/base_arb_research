import type { DEX_EXCHANGE, PoolType } from "src/common/types";
import type {
  PoolInfo,
  PoolState,
  PoolStaticInfo,
} from "../pool";
export type UniV3Info = {
  poolType: PoolType.UNIV3;
  poolStaticInfo: UniV3StaticInfo;
  poolState: UniV3State;
} & PoolInfo;

export type UniV3StaticInfo = {
  poolId : string;
  token0: string;
  token1: string;
  tickSpacing: bigint;
  swapFee: bigint;
  factory: string;
  dexExchange: DEX_EXCHANGE;
} & PoolStaticInfo;

export type UniV3State = {
  isFull: boolean;
  tickLower: bigint;
  tickUpper: bigint;
  currentTick: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tickBitMap: Map<bigint, TickInfo>; // only record initialized tick info
} & PoolState;

export type TickInfo = {
  liquidityCross: bigint;
  liquidityNet: bigint;
  initialized: boolean;
};

// Swap State 用来记录当前的swap的状态
export type SwapState = {
  amountSpecifiedRemaining: bigint;
  amountCalculated: bigint;
  sqrtPriceX96: bigint;
  tick: bigint;
  liquidity: bigint;
};

export type StepState = {
  sqrtPriceStartX96: bigint;
  nextTick: bigint;
  sqrtPriceNextX96: bigint;
  amountIn: bigint;
  amountOut: bigint;
};

export type Slot0 = {
  sqrtPriceX96: bigint; // uint160
  tick: number; // int24
  observationIndex: number; // uint16
  observationCardinality: number; // uint16
  observationCardinalityNext: number; // uint16
  feeProtocol: number; // uint8
  unlocked: boolean; // bool
};
