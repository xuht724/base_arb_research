// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;
import {Test, console} from "forge-std/Test.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/SwapMath.sol";
import "@uniswap/v3-core/contracts/libraries/LiquidityMath.sol";

// 定义UniswapV3Pool的接口
interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function factory() external view returns (address);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function ticks(
        int24 tick
    )
        external
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool initialized
        );
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

// 定义AerodromeV3Pool的接口
interface IAerodromeV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function unstakedFee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function stakedLiquidity() external view returns (uint128);
    function factory() external view returns (address);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            bool unlocked
        );
    function ticks(
        int24 tick
    )
        external
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            int128 stakedLiquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            uint256 rewardGrowthOutsideX128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool initialized
        );
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

contract Counter {
    struct Slot0 {
        uint160 sqrtPriceX96;
        int24 tick;
        uint16 observationIndex;
        uint16 observationCardinality;
        uint16 observationCardinalityNext;
        uint8 feeProtocol;
        bool unlocked;
    }

    struct SwapState {
        uint160 sqrtPriceX96;
        int24 tick;
        uint128 liquidity;
        int256 amountSpecifiedRemaining;
        int256 amountCalculated;
    }

    function V3Swap(
        address pool,
        uint256 input,
        bool zeroForOne
    ) public returns (int256 output) {
        // We can use transient storage to reduce the gas cost
        // but currently we do not implement that

        // in this function, we only consder get out given in
        // console.log("pool", pool);
        IUniswapV3Pool uniV3Pool = IUniswapV3Pool(pool);
        SwapState memory state;
        int24 tickSpacing = uniV3Pool.tickSpacing();
        // console.log("tickSpacing", tickSpacing);
        uint24 fee = uniV3Pool.fee();
        // console.log('fee',fee);

        // 获取池的状态
        (state.sqrtPriceX96, state.tick, , , , , ) = uniV3Pool.slot0();

        state.liquidity = uniV3Pool.liquidity();

        // console.log(state.sqrtPriceX96);
        // console.log(state.tick);
        // console.log(state.liquidity);
        state.amountSpecifiedRemaining = int256(input);
        state.amountCalculated = 0;

        while (state.amountSpecifiedRemaining != 0) {
            int24 nextTick = getNextTick(state.tick, tickSpacing, zeroForOne);
            // console.log("nextTick", nextTick);
            int128 liquidityNet;
            bool initialized;

            (, liquidityNet, , , , , , initialized) = uniV3Pool.ticks(nextTick);
            // console.log(liquidityNet);
            // console.log(initialized);
            uint160 sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(nextTick);
            uint256 amountIn;
            uint256 amountOut;
            uint256 feeAmount;
            (state.sqrtPriceX96, amountIn, amountOut, feeAmount) = SwapMath
                .computeSwapStep(
                    state.sqrtPriceX96,
                    sqrtPriceNextX96,
                    state.liquidity,
                    state.amountSpecifiedRemaining,
                    fee
                );

            // console.log('state.sqrtPriceX96', state.sqrtPriceX96);
            // console.log('amountIn', amountIn);
            // console.log('feeAmount', feeAmount);

            state.amountSpecifiedRemaining -= (int256(amountIn + feeAmount));
            state.amountCalculated = state.amountCalculated - int256(amountOut);

            // console.log('state.amountSpecifiedRemaining',state.amountSpecifiedRemaining);
            // console.log('state.amountCalculated',state.amountCalculated);

            if (state.sqrtPriceX96 == sqrtPriceNextX96) {
                if (initialized) {
                    state.liquidity = LiquidityMath.addDelta(
                        state.liquidity,
                        liquidityNet
                    );
                }
                state.tick = zeroForOne ? nextTick - 1 : nextTick;
            } else if (state.sqrtPriceX96 != sqrtPriceNextX96) {
                state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
            }
        }
        // console.log("final out", (-state.amountCalculated));
        return (-state.amountCalculated);
    }

    function getNextTick(
        int24 tick,
        int24 tickSpacing,
        bool zeroForOne
    ) private pure returns (int24) {
        int24 currentTickLower;
        int24 currentTickUpper;

        // 处理负数取模的特殊情况
        if (tick < 0) {
            // 在 Solidity 中，负数取模的结果仍然是负数
            // 所以需要特殊处理，确保结果的行为与 TypeScript 一致
            int24 modResult = tick % tickSpacing;
            if (modResult != 0) {
                // 如果结果不为零，需要加上 tickSpacing 得到正确的偏移量
                currentTickLower = tick - (modResult + tickSpacing);
            } else {
                currentTickLower = tick;
            }
        } else {
            // 正数情况下，直接取模即可
            currentTickLower = tick - (tick % tickSpacing);
        }

        currentTickUpper = currentTickLower + tickSpacing;

        // 处理刚好在整数刻度上的情况
        if (tick % tickSpacing == 0) {
            currentTickLower = tick;
            currentTickUpper = tick + tickSpacing;
        }

        // 根据交易方向返回下一个 tick
        return zeroForOne ? currentTickLower : currentTickUpper;
    }

    function findOptimalArb(
        address pool1,
        address pool2,
        uint256 fromAmount,
        uint256 toAmount,
        bool isPool1Token0
    )
        public
        returns (
            bool flag,
            uint256 optInput,
            int256 optProfit,
            uint256 getOutCalls
        )
    {
        // 获取两个池子的价格
        uint160 sqrtPriceX96_1;
        uint160 sqrtPriceX96_2;

        uint256 priceX96_1;
        uint256 priceX96_2;

        if (isAerodromeV3Pool(pool1)) {
            IAerodromeV3Pool aeroV3Pool1 = IAerodromeV3Pool(pool1);
            (sqrtPriceX96_1, , , , , ) = aeroV3Pool1.slot0();
            if (isPool1Token0) {
                priceX96_1 = (sqrtPriceX96_1 * sqrtPriceX96_1) >> 96;
            } else {
                priceX96_1 =
                    (1 << 192) /
                    ((sqrtPriceX96_1 * sqrtPriceX96_1) >> 96);
            }
        } else {
            IUniswapV3Pool uniV3Pool1 = IUniswapV3Pool(pool1);
            (sqrtPriceX96_1, , , , , , ) = uniV3Pool1.slot0();
            if (isPool1Token0) {
                priceX96_1 = (sqrtPriceX96_1 * sqrtPriceX96_1) >> 96;
            } else {
                priceX96_1 =
                    (1 << 192) /
                    ((sqrtPriceX96_1 * sqrtPriceX96_1) >> 96);
            }
        }

        if (isAerodromeV3Pool(pool2)) {
            IAerodromeV3Pool aeroV3Pool2 = IAerodromeV3Pool(pool2);
            (sqrtPriceX96_2, , , , , ) = aeroV3Pool2.slot0();
            if (isPool1Token0) {
                priceX96_2 = (sqrtPriceX96_2 * sqrtPriceX96_2) >> 96;
            } else {
                priceX96_2 =
                    (1 << 192) /
                    ((sqrtPriceX96_2 * sqrtPriceX96_2) >> 96);
            }
        } else {
            IUniswapV3Pool uniV3Pool2 = IUniswapV3Pool(pool2);
            (sqrtPriceX96_2, , , , , , ) = uniV3Pool2.slot0();
            if (isPool1Token0) {
                priceX96_2 = (sqrtPriceX96_2 * sqrtPriceX96_2) >> 96;
            } else {
                priceX96_2 =
                    (1 << 192) /
                    ((sqrtPriceX96_2 * sqrtPriceX96_2) >> 96);
            }
        }

        // console.log("sqrtPriceX96_1", sqrtPriceX96_1);
        // console.log("sqrtPriceX96_2", sqrtPriceX96_2);
        // console.log("priceX96_1", priceX96_1);
        // console.log("priceX96_2", priceX96_2);

        // 确定交易方向
        address fromPool;
        address toPool;

        // console.log("pool1", pool1);
        // console.log("pool2", pool2);

        if (priceX96_1 > priceX96_2) {
            // console.log("fromPool is pool1");
            fromPool = pool1;
            toPool = pool2;
        } else {
            // console.log("fromPool is pool2");
            fromPool = pool2;
            toPool = pool1;
        }
        console.log("fromPool", fromPool);
        console.log("toPool", toPool);
        // 初始化变量
        uint256 startAmount = fromAmount;
        uint256 endAmount = toAmount;
        uint256 midAmount;
        uint256 midMidAmount;
        int256 midAmountProfit;
        int256 midMidAmountProfit;
        uint256 BINARY_COEFFICIENT = 100;
        uint256 callCount = 0;

        while (startAmount < (endAmount - (endAmount / BINARY_COEFFICIENT))) {
            midAmount = (startAmount + endAmount) / 2;
            midMidAmount = (midAmount + endAmount) / 2;

            midAmountProfit =
                int256(
                    getArbProfit(fromPool, toPool, midAmount, isPool1Token0)
                ) -
                int256(midAmount);
            midMidAmountProfit =
                int256(
                    getArbProfit(fromPool, toPool, midMidAmount, isPool1Token0)
                ) -
                int256(midMidAmount);

            callCount += 2;

            if (midAmountProfit > midMidAmountProfit) {
                endAmount = midMidAmount;
            } else {
                startAmount = midAmount;
            }
        }

        int256 finalProfit = int256(
            getArbProfit(fromPool, toPool, startAmount, isPool1Token0)
        ) - int256(startAmount);

        return (true, startAmount, finalProfit, callCount);
    }

    function isAerodromeV3Pool(address pool) internal view returns (bool) {
        // 检查池子是否实现了AerodromeV3Pool接口
        try IUniswapV3Pool(pool).factory() returns (address factory) {
            // 检查是否是AerodromeV3的factory地址
            return factory == 0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A;
        } catch {
            return false;
        }
    }

    function getArbProfit(
        address pool1,
        address pool2,
        uint256 input,
        bool isPool1Token0
    ) internal returns (uint256) {
        // 第一步：在第一个池子中交易
        // console.log("input", input);
        int256 intermediateAmount;
        if (isAerodromeV3Pool(pool1)) {
            intermediateAmount = AerodromeV3Swap(pool1, input, isPool1Token0);
        } else {
            intermediateAmount = V3Swap(pool1, input, isPool1Token0);
        }
        require(intermediateAmount > 0, "First swap failed");

        // console.log("intermediateAmount", intermediateAmount);
        // 第二步：在第二个池子中交易
        int256 finalAmount;
        if (isAerodromeV3Pool(pool2)) {
            finalAmount = AerodromeV3Swap(
                pool2,
                uint256(intermediateAmount),
                !isPool1Token0
            );
        } else {
            finalAmount = V3Swap(
                pool2,
                uint256(intermediateAmount),
                !isPool1Token0
            );
        }
        require(finalAmount > 0, "Second swap failed");

        // console.log("finalAmount", finalAmount);

        return uint256(finalAmount);
    }

    function AerodromeV3Swap(
        address pool,
        uint256 input,
        bool zeroForOne
    ) public returns (int256 output) {
        IAerodromeV3Pool aeroV3Pool = IAerodromeV3Pool(pool);
        SwapState memory state;
        int24 tickSpacing = aeroV3Pool.tickSpacing();
        uint24 fee = aeroV3Pool.fee();

        // console.log("fee", fee);

        // 获取池的状态
        (state.sqrtPriceX96, state.tick, , , , ) = aeroV3Pool.slot0();
        state.liquidity = aeroV3Pool.liquidity();
        // console.log("liquidity", state.liquidity);

        state.amountSpecifiedRemaining = int256(input);
        state.amountCalculated = 0;

        while (state.amountSpecifiedRemaining != 0) {
            int24 nextTick = getNextTick(state.tick, tickSpacing, zeroForOne);
            int128 liquidityNet;
            bool initialized;

            (, liquidityNet, , , , , , , , initialized) = aeroV3Pool.ticks(
                nextTick
            );
            uint160 sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(nextTick);
            uint256 amountIn;
            uint256 amountOut;
            uint256 feeAmount;
            (state.sqrtPriceX96, amountIn, amountOut, feeAmount) = SwapMath
                .computeSwapStep(
                    state.sqrtPriceX96,
                    sqrtPriceNextX96,
                    state.liquidity,
                    state.amountSpecifiedRemaining,
                    fee
                );

            state.amountSpecifiedRemaining -= (int256(amountIn + feeAmount));
            state.amountCalculated = state.amountCalculated - int256(amountOut);

            if (state.sqrtPriceX96 == sqrtPriceNextX96) {
                if (initialized) {
                    state.liquidity = LiquidityMath.addDelta(
                        state.liquidity,
                        liquidityNet
                    );
                }
                state.tick = zeroForOne ? nextTick - 1 : nextTick;
            } else if (state.sqrtPriceX96 != sqrtPriceNextX96) {
                state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
            }
        }
        return (-state.amountCalculated);
    }
}
