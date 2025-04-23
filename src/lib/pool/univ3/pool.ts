import {
  DEX_EXCHANGE,
  PoolType,
  Swap,
  SwapAmtIn,
  SwapAmtOut,
} from "src/common/types";
import type { Pool, PoolState } from "src/lib/pool/pool";
import type {
  UniV3StaticInfo,
  UniV3Info,
  UniV3State,
  TickInfo,
  SwapState,
} from "./types";
import { decodeEventLog, hexToBigInt, Log } from "viem";
import { TickMath } from "./math/TickMath";
import { SwapMath } from "./math/SwapMath";
import { LiquidityMath } from "./math/LiquidityMath";
import { EventMapABI, logTopicsMap } from "src/common/events";

const TICK_LIMITATION = 50;

export class UniV3Pool implements Pool {
  public readonly poolAddress: string;
  public readonly poolId: string;
  public readonly dexExchange: DEX_EXCHANGE;
  public readonly poolType: PoolType = PoolType.UNIV3;
  public readonly tokens: string[];

  public readonly tickSpacing: bigint;
  public readonly swapFee: bigint;
  public readonly token0: string;
  public readonly token1: string;
  public readonly factory: string;
  private poolState: UniV3State;

  private readonly poolFeeDenominator: bigint = BigInt(1000000);

  constructor(info: UniV3Info) {
    this.poolId = info.poolStaticInfo.poolId;
    this.poolAddress = this.poolId;
    this.token0 = info.poolStaticInfo.token0;
    this.token1 = info.poolStaticInfo.token1;
    this.tokens = [this.token0, this.token1];
    this.factory = info.poolStaticInfo.factory;

    this.dexExchange = info.poolStaticInfo.dexExchange;
    this.swapFee = info.poolStaticInfo.swapFee;
    this.tickSpacing = info.poolStaticInfo.tickSpacing;
    this.poolState = info.poolState;
  }

  getOutGivenIn(input: SwapAmtIn): Swap {
    const tokenIn = input.tokenIn;
    const amountIn = input.amountIn;
    const tokenOut = input.tokenOut;
    const zeroSwap: Swap = {
      tokenIn,
      amountIn,
      tokenOut,
      amountOut: 0n,
    };
    if (amountIn <= 0n) {
      return zeroSwap;
    }
    const zeroForOne = this.getZeroForOne(tokenIn, tokenOut);
    try {
      const amountOut = this.getAmount(
        zeroForOne,
        amountIn, // amountSpecified
        true, // isGivenIn
      );
      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
      };
    } catch (error) {
      return zeroSwap;
    }
  }

  getInGivenOut(output: SwapAmtOut): Swap {
    const tokenIn = output.tokenIn;
    const amountOut = output.amountOut;
    const tokenOut = output.tokenOut;
    const zeroSwap: Swap = {
      tokenIn,
      amountIn: 0n,
      tokenOut,
      amountOut: 0n,
    };
    if (amountOut <= 0n) {
      return zeroSwap;
    }
    const zeroForOne = this.getZeroForOne(tokenIn, tokenOut);
    try {
      const amountIn = this.getAmount(
        zeroForOne,
        -amountOut, // amountSpecified (negative for givenOut)
        false, // isGivenIn
      );
      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
      };
    } catch (error) {
      return zeroSwap;
    }
  }

  clone(): Pool {
    throw new Error("Method not implemented.");
  }

  static createFromJSON(jsonString: string): UniV3Pool {
    const info = JSON.parse(jsonString, (key: string, value: any) => {
      if (typeof value === "string" && /^-?\d+$/.test(value)) {
        return BigInt(value); // 将纯数字字符串替换成 bigint
      }
      if (key === "tickBitMap") {
        // Reconstruct Map from array of [key, value] pairs
        const tickBitMap = new Map(
          (value as [string, any][]).map(([key, tickInfo]: [string, any]) => {
            // Reconstruct TickInfo object with bigint values
            return [
              BigInt(key),
              {
                liquidityCross: BigInt(tickInfo.liquidityCross),
                liquidityNet: BigInt(tickInfo.liquidityNet),
                initialized: tickInfo.initialized,
              },
            ];
          }),
        );
        return tickBitMap;
      }
      return value;
    });
    return new UniV3Pool(info);
  }

  getPoolState(): UniV3State {
    const clonedTickBitMap = new Map<bigint, TickInfo>(
      Array.from(this.poolState.tickBitMap.entries()).map(([key, value]) => [
        key,
        { ...value },
      ]),
    );

    const clonedState: UniV3State = {
      poolId: this.poolAddress,
      isFull: this.poolState.isFull,
      currentTick: this.poolState.currentTick,
      sqrtPriceX96: this.poolState.sqrtPriceX96,
      liquidity: this.poolState.liquidity,
      tickLower: this.poolState.tickLower,
      tickUpper: this.poolState.tickUpper,
      tickBitMap: clonedTickBitMap,
    };
    return clonedState;
  }
  getStaticInfo(): UniV3StaticInfo {
    const info: UniV3StaticInfo = {
      poolId: this.poolAddress,
      token0: this.token0,
      token1: this.token1,
      factory: this.factory,
      tickSpacing: this.tickSpacing,
      swapFee: this.swapFee,
      dexExchange: this.dexExchange,
    };
    return info;
  }
  getInitialInfo(): UniV3Info {
    const info: UniV3Info = {
      poolType: PoolType.UNIV3,
      poolId: this.poolAddress,
      poolStaticInfo: this.getStaticInfo(),
      poolState: this.getPoolState(),
    };
    return info;
  }

  exportToJSON(): string {
    const initialInfo = this.getInitialInfo();
    // Convert bigint values to strings before stringifying
    const jsonString = JSON.stringify(initialInfo, (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (key === "tickBitMap") {
        // Convert Map entries to an array of [key, value] pairs for serialization
        const entries = Array.from(
          (value as Map<string, TickInfo>).entries(),
        ).map(([key, tickInfo]: [any, any]) => {
          // Convert bigint values within TickInfo to strings
          return [
            key.toString(),
            {
              liquidityCross: tickInfo.liquidityCross.toString(),
              liquidityNet: tickInfo.liquidityNet.toString(),
              initialized: tickInfo.initialized,
            },
          ];
        });
        return entries;
      }
      return value;
    });
    return jsonString;
  }

  isValidPool(): boolean {
    return true;
  }

  updatePoolState(poolState: PoolState): void {
    throw new Error("Method not implemented.");
  }

  getPriceX96(tokenIn: string, tokenOut: string): bigint {
    let isZeroForOne: boolean;
    if (tokenIn == this.token0 && tokenOut == this.token1) {
      isZeroForOne = true;
    } else if (tokenIn == this.token1 && tokenOut == this.token0) {
      isZeroForOne = false;
    } else {
      throw new Error('Wrong token input')
    }

    const sqrtPriceX96 = this.poolState.sqrtPriceX96;
    let priceX96: bigint;
    if (isZeroForOne) {
      priceX96 = (this.poolFeeDenominator - this.swapFee) * (sqrtPriceX96 ** 2n >> 96n) / this.poolFeeDenominator;
    } else {
      priceX96 = (this.poolFeeDenominator - this.swapFee) * ((1n << 192n) / (sqrtPriceX96 ** 2n >> 96n)) / this.poolFeeDenominator;
    }
    // console.log('priceX96',priceX96);
    return priceX96;
  }

  getPriceX96AfterSwap(input: SwapAmtIn): [bigint, Swap] {
    throw new Error("Method not implemented.");
  }

  private getAmount(
    zeroForOne: boolean,
    amountSpecified: bigint,
    isGivenIn: boolean,
  ): bigint {
    const swapState: SwapState = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: 0n,
      sqrtPriceX96: this.poolState.sqrtPriceX96,
      tick: this.poolState.currentTick,
      liquidity: this.poolState.liquidity,
    };
    // if(this.poolAddress === '0xa1B6F148F208FFe9Eb04C68BcBFEa3525f2536d6'.toLowerCase()){
    //   console.log('swapState',swapState);
    // }

    let index = 0;

    while (swapState.amountSpecifiedRemaining !== 0n) {
      index += 1;

      const { nextTick, nextTickInfo } = this.nextInitializedTickWithinOneWord(
        swapState.tick,
        this.tickSpacing,
        zeroForOne,
      );

      const sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(nextTick);

      const stepRes = SwapMath.computeSwapStep(
        swapState.sqrtPriceX96,
        sqrtPriceNextX96,
        swapState.liquidity,
        swapState.amountSpecifiedRemaining,
        this.swapFee,
      );

      swapState.sqrtPriceX96 = stepRes.sqrtRatioNextX96;

      if (isGivenIn) {
        swapState.amountSpecifiedRemaining -=
          stepRes.amountIn + stepRes.feeAmount;
        swapState.amountCalculated -= stepRes.amountOut;
      } else {
        swapState.amountSpecifiedRemaining += stepRes.amountOut;
        swapState.amountCalculated += stepRes.amountIn + stepRes.feeAmount;
      }

      // 检查是否到达下一个 tick
      if (swapState.sqrtPriceX96 === sqrtPriceNextX96) {
        if (nextTickInfo.initialized) {
          let liquidityNet = nextTickInfo.liquidityNet;
          if (zeroForOne) liquidityNet = -liquidityNet;

          swapState.liquidity = LiquidityMath.addDelta(
            swapState.liquidity,
            liquidityNet,
          );
        }
        swapState.tick = zeroForOne ? nextTick - 1n : nextTick;
      } else {
        // 未到达下一个 tick，计算当前 tick
        swapState.tick = TickMath.getTickAtSqrtRatio(stepRes.sqrtRatioNextX96);
      }

      if (index >= TICK_LIMITATION) {
        throw new Error("Out of tick limitation");
      }
    }

    return isGivenIn
      ? -swapState.amountCalculated // amountOut
      : swapState.amountCalculated; // amountIn
  }

  private getZeroForOne(tokenIn: string, tokenOut: string): boolean {
    if (tokenIn === this.token0 && tokenOut === this.token1) {
      return true;
    } else if (tokenIn === this.token1 && tokenOut === this.token0) {
      return false;
    } else {
      throw new Error("Wrong input token address");
    }
  }

  private nextInitializedTickWithinOneWord(
    tick: bigint,
    tickSpacing: bigint,
    zeroForOne: boolean,
  ): {
    nextTick: bigint;
    nextTickInfo: TickInfo;
  } {
    // 如果 out of tick range 就throw error
    let currentTickLower =
      tick -
      (tick < 0 ? tickSpacing + (tick % tickSpacing) : tick % tickSpacing);
    let currentTickUpper = currentTickLower + tickSpacing;
    if (tick % tickSpacing === 0n) {
      currentTickLower = tick;
      currentTickUpper = tick + tickSpacing;
    }
    const nextTick = zeroForOne ? currentTickLower : currentTickUpper;
    // console.log('currentTickLower',currentTickLower,'currentTickUpper', currentTickUpper);
    // // check nextTick position
    // console.log('tick', tick, 'tickSpacing', tickSpacing, 'nextTick', nextTick);
    if (
      nextTick < this.poolState.tickLower ||
      nextTick > this.poolState.tickUpper
    ) {
      throw new Error("Out of tick range in current pool state");
    } else {
      // check if tick map include tick info
      // if not, return a zero tick info;
      const tickInfo = this.poolState.tickBitMap.get(nextTick);
      if (tickInfo) {
        return {
          nextTick,
          nextTickInfo: tickInfo,
        };
      } else {
        const zeroTickInfo: TickInfo = {
          liquidityCross: 0n,
          liquidityNet: 0n,
          initialized: false,
        };
        return {
          nextTick,
          nextTickInfo: zeroTickInfo,
        };
      }
    }
  }

  public handleLog(log: Log): void {
    const topic = log.topics[0];
    const address = log.address;
    if(address != this.poolAddress){
      throw new Error("Wrong pool address");
    }
    const data = log.data;

    if(topic == logTopicsMap.V3Swap){
      const res = decodeEventLog(
        {
          abi: [
            {
              anonymous: false,
              inputs: [
                {
                  indexed: true,
                  internalType: "address",
                  name: "sender",
                  type: "address",
                },
                {
                  indexed: true,
                  internalType: "address",
                  name: "recipient",
                  type: "address",
                },
                {
                  indexed: false,
                  internalType: "int256",
                  name: "amount0",
                  type: "int256",
                },
                {
                  indexed: false,
                  internalType: "int256",
                  name: "amount1",
                  type: "int256",
                },
                {
                  indexed: false,
                  internalType: "uint160",
                  name: "sqrtPriceX96",
                  type: "uint160",
                },
                {
                  indexed: false,
                  internalType: "uint128",
                  name: "liquidity",
                  type: "uint128",
                },
                {
                  indexed: false,
                  internalType: "int24",
                  name: "tick",
                  type: "int24",
                },
              ],
              name: "Swap",
              type: "event",
            }
          ],
          data,
          topics: log.topics,
        }
      )
      this.poolState.currentTick = BigInt(res.args.tick);
      this.poolState.sqrtPriceX96 = BigInt(res.args.sqrtPriceX96);
      this.poolState.liquidity = BigInt(res.args.liquidity);
    }else{
      throw new Error("Unsupported event");
    }
  }
}
