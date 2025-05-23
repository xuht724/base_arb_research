// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;
import {Test, console} from "forge-std/Test.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-core/contracts/libraries/SwapMath.sol";
import "@uniswap/v3-core/contracts/libraries/LiquidityMath.sol";
import "@uniswap/v3-core/contracts/libraries/SqrtPriceMath.sol";
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
    
    function putStorage(address pool, uint160 sqrtPriceX96, int24 tick, int24 tickSpacing, uint24 fee, uint128 liquidity) public {
        uint256 beginGas = gasleft();

        // 使用pool地址作为key的基础，通过位移来区分不同的存储位置
        bytes32 key1 = bytes32(bytes20(pool)) | bytes32(uint256(1));
        bytes32 key2 = bytes32(bytes20(pool)) | bytes32(uint256(2));

        uint256 value1 = (uint256(sqrtPriceX96) << 96) | (uint256(uint24(tick)) << 72) | (uint256(uint24(tickSpacing)) << 48) | (uint256(fee) << 24);
        uint256 value2 = uint256(liquidity);

        assembly {
            tstore(key1, value1)
            tstore(key2, value2)
        }
    }

    function getStorage(address pool) public view returns (uint160 sqrtPriceX96, int24 tick, int24 tickSpacing, uint24 fee, uint128 liquidity) {
        uint256 beginGas = gasleft();
        bytes32 key1 = bytes32(bytes20(pool)) | bytes32(uint256(1));
        bytes32 key2 = bytes32(bytes20(pool)) | bytes32(uint256(2));

        uint256 value1;
        uint256 value2;

        uint256 beginGas2 = gasleft();
        assembly {
            value1 := tload(key1)
            value2 := tload(key2)
        }
        uint256 endGas2 = gasleft();
        console.log('getStorage V3 calculate value1 and value2 gas', beginGas2 - endGas2);

        sqrtPriceX96 = uint160(value1 >> 96);
        tick = int24(uint24(value1 >> 72));
        tickSpacing = int24(uint24(value1 >> 48));
        fee = uint24(value1 >> 24);
        liquidity = uint128(value2);
    }

    function putTicks(address pool, int24 nextTick, int128 liquidityNet, bool initialized) public {
        bytes32 key = bytes32(bytes20(pool)) | bytes32(uint256(uint24(nextTick))); // 直接拼接地址和tick值
        uint256 value = (uint256(uint128(liquidityNet)) << 8) | (initialized ? 1 : 0);
        assembly {
            tstore(key, value)
        }
    }

    function getTicks(address pool, int24 nextTick) public view returns (int128 liquidityNet, bool initialized, bool flag) {
        bytes32 key = bytes32(bytes20(pool)) | bytes32(uint256(uint24(nextTick))); // 直接拼接地址和tick值
        uint256 value;
        assembly {
            value := tload(key)
        }
        if(value == 0){
            flag = false;
        }
        liquidityNet = int128(uint128(value >> 8));
        initialized = (value & 0xFF) != 0;
        flag = true;
    }

    mapping(address => Counter.poolTypes) private poolTypesMapping;

    enum poolTypes {None, V3Pool, AerodromeV3Pool}

    function getSwapOut(address pool, uint256 input, bool zeroForOne) public returns (int256 output) {
        Counter.poolTypes poolType = poolTypesMapping[pool];
        if(poolType == poolTypes.V3Pool){
            output = V3Swap(pool, input, zeroForOne);
        }else if(poolType == poolTypes.AerodromeV3Pool){
            output = AerodromeV3Swap(pool, input, zeroForOne);
        }
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
        int24 tickSpacing;
        // console.log("tickSpacing", tickSpacing);
        uint24 fee;
        // console.log('fee',fee);

        // 获取池的状态
        //(state.sqrtPriceX96, state.tick, , , , , ) = uniV3Pool.slot0();
        uint256 beginGas = gasleft();
        (state.sqrtPriceX96, state.tick, tickSpacing, fee, state.liquidity) = getStorage(pool);
        uint256 endGas = gasleft();
        console.log('V3 getSlot0 gas', beginGas - endGas);

        // state.liquidity = uniV3Pool.liquidity();

        // console.log('sqrtPriceX96', state.sqrtPriceX96);
        // console.log('tick', state.tick);
        // console.log(state.liquidity);
        state.amountSpecifiedRemaining = int256(input);
        state.amountCalculated = 0;

        while (state.amountSpecifiedRemaining != 0) {
            int24 nextTick = getNextTick(state.tick, tickSpacing, zeroForOne);

            int128 liquidityNet;
            bool initialized;
            bool flag;

            uint256 beginGas2 = gasleft();
            (liquidityNet, initialized, flag) = getTicks(pool, nextTick);
            if(!flag){
                (, liquidityNet, , , , , , initialized) = uniV3Pool.ticks(nextTick);
                putTicks(pool, nextTick, liquidityNet, initialized);
            }
            uint256 endGas2 = gasleft();
            console.log('V3 getTicks gas', beginGas2 - endGas2);
            // (, liquidityNet, , , , , , initialized) = uniV3Pool.ticks(nextTick);
            // console.log(liquidityNet);
            // console.log(initialized);

            uint256 beginGas = gasleft();

            uint160 sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(nextTick);
            // console.log('getSqrtRatioAtTick', sqrtPriceNextX96);
            uint256 amountIn;
            uint256 amountOut;
            uint256 feeAmount;
            // console.log('liquidity', state.liquidity, 'sqrtPriceX96', state.sqrtPriceX96);
            // console.log('amountSpecifiedRemaining', state.amountSpecifiedRemaining);
            (state.sqrtPriceX96, amountIn, amountOut, feeAmount) = SwapMath
                .computeSwapStep(
                    state.sqrtPriceX96,
                    sqrtPriceNextX96,
                    state.liquidity,
                    state.amountSpecifiedRemaining,
                    fee
                );
            uint256 endGas = gasleft();
            console.log('V3 computeSwapStep gas', beginGas - endGas);

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
        
        console.log("final out", (-state.amountCalculated));
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

    function getAmount0Delta(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity,
        bool roundUp
    ) public pure returns (uint256 amount0) {
        if (sqrtRatioAX96 > sqrtRatioBX96) {
            (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);
        }

        uint256 numerator1 = uint256(liquidity) << 96;
        uint256 numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

        require(sqrtRatioAX96 > 0);

        return
            roundUp
                ? FullMath.mulDivRoundingUp(
                    FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96),
                    1,
                    sqrtRatioAX96
                )
                : FullMath.mulDiv(numerator1, numerator2, sqrtRatioBX96) / sqrtRatioAX96;
    }

    function getAmount1Delta(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity,
        bool roundUp
    ) public pure returns (uint256 amount1) {
        if (sqrtRatioAX96 > sqrtRatioBX96) {
            (sqrtRatioAX96, sqrtRatioBX96) = (sqrtRatioBX96, sqrtRatioAX96);
        }

        return
            roundUp
                ? FullMath.mulDivRoundingUp(
                    liquidity,
                    sqrtRatioBX96 - sqrtRatioAX96,
                    0x100000000
                )
                : FullMath.mulDiv(
                    liquidity,
                    sqrtRatioBX96 - sqrtRatioAX96,
                    0x100000000
                );
    }

    // function estimateToAmount(
    //     int24 targetTick,
    //     uint160 currentPriceX96,
    //     uint256 liquidity
    // ) public view returns (uint256) {
    //     uint256 sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(targetTick);
    //     bool zeroForOne = currentPriceX96 >= uint160(sqrtPriceNextX96);
    //     uint256 amountIn;
        
    //     if(zeroForOne){
    //         amountIn = getAmount0Delta(currentPriceX96, uint160(sqrtPriceNextX96), uint128(liquidity), true);
    //     } else {
    //         amountIn = getAmount1Delta(currentPriceX96, uint160(sqrtPriceNextX96), uint128(liquidity), true);
    //     }
        
    //     return amountIn;
    // }

    function getPoolDirection(address pool, bool isPool1Token0) public returns (uint160 sqrtPriceX96, uint256 priceX96, int24 tick, int24 tickSpacing, uint24 fee, uint128 liquidity){
        Counter.poolTypes poolType = poolTypesMapping[pool];
        if(poolType == poolTypes.None){
            if(isAerodromeV3Pool(pool)){
                poolTypesMapping[pool] = poolTypes.AerodromeV3Pool;
                poolType = poolTypes.AerodromeV3Pool;
            }
            else {
                poolTypesMapping[pool] = poolTypes.V3Pool;
                poolType = poolTypes.V3Pool;
            }
        }

        if (poolType == poolTypes.AerodromeV3Pool) {
            IAerodromeV3Pool aeroV3Pool = IAerodromeV3Pool(pool);
            (sqrtPriceX96, tick, , , , ) = aeroV3Pool.slot0();
            console.log('sqrtPriceX96', sqrtPriceX96);
            if (isPool1Token0) {
                // priceX96 = (sqrtPriceX96 * sqrtPriceX96) >> 96;
                priceX96 = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 192;
            } else {
                // priceX96 =
                //     (1 << 192) /
                //     ((sqrtPriceX96 * sqrtPriceX96) >> 96);
                priceX96 = (1 << 192) / ((uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 96);
            }
            tickSpacing = aeroV3Pool.tickSpacing();
            fee = aeroV3Pool.fee();
            liquidity = aeroV3Pool.liquidity();
        } else if (poolType == poolTypes.V3Pool) {
            IUniswapV3Pool uniV3Pool = IUniswapV3Pool(pool);
            (sqrtPriceX96, tick, , , , , ) = uniV3Pool.slot0();
            console.log('sqrtPriceX96', sqrtPriceX96);
            if (isPool1Token0) {
                // priceX96 = (sqrtPriceX96 * sqrtPriceX96) >> 96;
                priceX96 = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 96;
            } else {
                // priceX96 =
                //     (1 << 192) /
                //     ((sqrtPriceX96 * sqrtPriceX96) >> 96);
                priceX96 = (1 << 192) / ((uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> 96);
            }
            tickSpacing = uniV3Pool.tickSpacing();
            fee = uniV3Pool.fee();
            liquidity = uniV3Pool.liquidity();
        }
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

        int24 tick_1;
        int24 tick_2;

        int24 tickSpacing_1;
        int24 tickSpacing_2;

        uint24 fee_1;
        uint24 fee_2;

        uint128 liquidity_1;
        uint128 liquidity_2;

        (sqrtPriceX96_1, priceX96_1, tick_1, tickSpacing_1, fee_1, liquidity_1) = getPoolDirection(pool1, isPool1Token0);
        (sqrtPriceX96_2, priceX96_2, tick_2, tickSpacing_2, fee_2, liquidity_2) = getPoolDirection(pool2, isPool1Token0);

        // console.log("sqrtPriceX96_1", sqrtPriceX96_1);
        // console.log("sqrtPriceX96_2", sqrtPriceX96_2);
        // console.log("priceX96_1", priceX96_1);
        // console.log("priceX96_2", priceX96_2);

        // 确定交易方向
        address fromPool;
        address toPool;

        // console.log("pool1", pool1);
        // console.log("pool2", pool2);

        uint256 beginGas = gasleft();
        uint256 newToAmount;

        console.log("tick_1", tick_1);
        console.log("tick_2", tick_2);


        if (priceX96_1 > priceX96_2) {
            // console.log("fromPool is pool1");
            fromPool = pool1;
            toPool = pool2;
            putStorage(fromPool, sqrtPriceX96_1, tick_1, tickSpacing_1, fee_1, liquidity_1);
            putStorage(toPool, sqrtPriceX96_2, tick_2, tickSpacing_2, fee_2, liquidity_2);
            // newToAmount = estimateToAmount(tick_2, sqrtPriceX96_1, liquidity_1);
        } else {
            // console.log("fromPool is pool2");
            fromPool = pool2;
            toPool = pool1;
            putStorage(fromPool, sqrtPriceX96_2, tick_2, tickSpacing_2, fee_2, liquidity_2);
            putStorage(toPool, sqrtPriceX96_1, tick_1, tickSpacing_1, fee_1, liquidity_1);
            // newToAmount = estimateToAmount(tick_1, sqrtPriceX96_2, liquidity_2);
        }
        uint256 endGas = gasleft();
        console.log('V3 putStorage gas', beginGas - endGas);

        console.log("fromAmount", fromAmount);
        console.log("toAmount", toAmount);
        console.log("newToAmount", newToAmount);

        console.log("fromPool", fromPool);
        console.log("toPool", toPool);
        // 初始化变量
        uint256 startAmount = fromAmount;
        uint256 endAmount = toAmount;
        uint256 midAmount;
        uint256 midMidAmount;
        int256 midAmountProfit;
        int256 midMidAmountProfit;
        uint256 BINARY_COEFFICIENT = 1000;
        uint256 callCount = 0;
        uint256 MIN_PROFIT_IMPROVEMENT = 100; // 最小利润提升阈值，单位是0.01%

        while (startAmount < (endAmount - (endAmount / BINARY_COEFFICIENT))) {
            uint256 startGas = gasleft();
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

            // 计算利润提升幅度
            int256 profitImprovementbp;
            if (midAmountProfit > midMidAmountProfit) {
                profitImprovementbp = ((midAmountProfit - midMidAmountProfit) * 10000) / midAmountProfit;
                endAmount = midMidAmount;
                console.log('Profit improvement:', uint256(profitImprovementbp), 'bp');
            } else {
                profitImprovementbp = ((midMidAmountProfit - midAmountProfit) * 10000) / midMidAmountProfit;
                startAmount = midAmount;
                console.log('Profit improvement:', uint256(profitImprovementbp), 'bp');
            }

            // 如果利润提升幅度小于阈值，提前退出循环
            if (uint256(profitImprovementbp) < MIN_PROFIT_IMPROVEMENT) {
                console.log('Profit improvement too small, stopping search');
                break;
            }

            uint256 endGas = gasleft();
            console.log('calculate objective function gas', startGas - endGas);
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
        int256 intermediateAmount = getSwapOut(pool1, input, isPool1Token0);
        require(intermediateAmount > 0, "First swap failed");

        // console.log("intermediateAmount", intermediateAmount);
        // 第二步：在第二个池子中交易
        int256 finalAmount = getSwapOut(
            pool2,
            uint256(intermediateAmount),
            !isPool1Token0
        );
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
        int24 tickSpacing;
        uint24 fee;

        // 获取池的状态
        //(state.sqrtPriceX96, state.tick, , , , ) = aeroV3Pool.slot0();
        (state.sqrtPriceX96, state.tick, tickSpacing, fee, state.liquidity) = getStorage(pool);
        
        //state.liquidity = aeroV3Pool.liquidity();

        // console.log('sqrtPriceX96', state.sqrtPriceX96);
        // console.log('tick', state.tick);
        // console.log("fee", fee);
        // console.log("liquidity", state.liquidity);

        state.amountSpecifiedRemaining = int256(input);
        state.amountCalculated = 0;

        while (state.amountSpecifiedRemaining != 0) {
            int24 nextTick = getNextTick(state.tick, tickSpacing, zeroForOne);
            int128 liquidityNet;
            bool initialized;
            bool flag;

            (liquidityNet, initialized, flag) = getTicks(pool, nextTick);
            if(!flag){
                (, liquidityNet, , , , , , , , initialized) = aeroV3Pool.ticks(nextTick);
                putTicks(pool, nextTick, liquidityNet, initialized);
            }
            // (, liquidityNet, , , , , , , , initialized) = aeroV3Pool.ticks(nextTick);
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
