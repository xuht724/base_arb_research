import { Pool } from "../pool/pool";

class Finder {
  public find2poolArbByTenderSearch(
    baseToken: string,
    interToken: string,
    fromAmount: bigint,
    toAmount: bigint,
    pool1: Pool,
    pool2: Pool,
  ): {
    flag: boolean,
    optInput: bigint,
    optProfit: bigint,
    getOutCalls: number, // Add this to return value
  } {
    // Determine direction based on price difference
    let price1 = pool1.getPriceX96(baseToken, interToken);
    let price2 = pool2.getPriceX96(baseToken, interToken);

    let fromPool: Pool;
    let toPool: Pool;
    let priceProduct: bigint;

    if (price1 > price2) {
      fromPool = pool1;
      toPool = pool2;
      priceProduct = price1 * (1n << 192n) / price2
    } else {
      fromPool = pool2;
      toPool = pool1;
      priceProduct = price2 * (1n << 192n) / price1
    }

    // if (priceProduct <= (1n << 192n)) {
    //   console.log(priceProduct);
    //   console.log(1n << 192n);
    //   throw new Error("No Arb");
    // }
    // console.log(priceProduct);
    // console.log(1n << 192n);

    // Add counter for getOut calls
    let getOutCallCount = 0;

    function getOut(input: bigint) {
      // Increment counter each time getOut is called
      getOutCallCount++;

      const out1 = fromPool.getOutGivenIn({
        tokenIn: baseToken,
        tokenOut: interToken,
        amountIn: input
      });
      // console.log(out1);

      if (out1.amountOut === 0n) {
        throw new Error("Too high or too low amount in");
      }
      const out2 = toPool.getOutGivenIn({
        tokenIn: interToken,
        tokenOut: baseToken,
        amountIn: out1.amountOut
      })
      // console.log(out2);
      // console.log('profit', out2.amountOut - out1.amountIn);
      return out2.amountOut;
    }


    function printOut(input: bigint) {
      const out1 = fromPool.getOutGivenIn({
        tokenIn: baseToken,
        tokenOut: interToken,
        amountIn: input
      });
      console.log("out1",out1);

      if (out1.amountOut === 0n) {
        throw new Error("Too high or too low amount in");
      }
      const out2 = toPool.getOutGivenIn({
        tokenIn: interToken,
        tokenOut: baseToken,
        amountIn: out1.amountOut
      })
      console.log("out2",out2);
      console.log('profit', out2.amountOut - out1.amountIn);
      return out2.amountOut;
    }

    // let baseProfit = getOut(fromAmount) - fromAmount;
    // if (baseProfit < 0n) {
    //   return {
    //     flag: false,
    //     optInput: -1n,
    //     optProfit: -1n,
    //     getOutCalls: getOutCallCount
    //   }
    // }

    let startAmount: bigint = fromAmount
    let endAmount: bigint = toAmount;

    let midAmountProfit: bigint;
    let midMidProfit: bigint;
    const BINARY_COEFFICIENT: bigint = 10000n;
    
    
    while (startAmount < (endAmount - (endAmount / BINARY_COEFFICIENT))) {
      let midAmount: bigint = (startAmount + endAmount) / 2n;
      let midMidAmount : bigint = (midAmount + endAmount) / 2n;
      midAmountProfit = getOut(midAmount) - midAmount;
      midMidProfit = getOut(midMidAmount) - midMidAmount;

      if(midAmountProfit > midMidProfit){
        endAmount = midMidAmount;
      }else{
        startAmount = midAmount;
      }
    }

    let profit = getOut(startAmount) - startAmount;
    printOut(startAmount);
    return {
      flag: true,
      optInput: startAmount,
      optProfit: profit,
      getOutCalls: getOutCallCount
    }
  }

  public find2poolArbByMyalgo(
    baseToken: string,
    interToken: string,
    fromAmount: bigint,
    toAmount: bigint,
    pool1: Pool,
    pool2: Pool,
  ): {
    flag: boolean,
    optInput: bigint,
    optProfit: bigint,
    getOutCalls: number, // Add this to return value
  } {
    // Determine direction based on price difference
    let price1 = pool1.getPriceX96(baseToken, interToken);
    let price2 = pool2.getPriceX96(baseToken, interToken);

    let fromPool: Pool;
    let toPool: Pool;
    let priceProduct: bigint;

    if (price1 > price2) {
      fromPool = pool1;
      toPool = pool2;
      priceProduct = price1 * (1n << 192n) / price2
    } else {
      fromPool = pool2;
      toPool = pool1;
      priceProduct = price2 * (1n << 192n) / price1
    }

    // if (priceProduct <= (1n << 192n)) {
    //   console.log(priceProduct);
    //   console.log(1n << 192n);
    //   throw new Error("No Arb");
    // }
    // console.log(priceProduct);
    // console.log(1n << 192n);

    // Add counter for getOut calls
    let getOutCallCount = 0;

    function getOut(input: bigint) {
      // Increment counter each time getOut is called
      getOutCallCount++;

      const out1 = fromPool.getOutGivenIn({
        tokenIn: baseToken,
        tokenOut: interToken,
        amountIn: input
      });
      // console.log(out1);

      if (out1.amountOut === 0n) {
        throw new Error("Too high or too low amount in");
      }
      const out2 = toPool.getOutGivenIn({
        tokenIn: interToken,
        tokenOut: baseToken,
        amountIn: out1.amountOut
      })
      // console.log(out2);
      // console.log('profit', out2.amountOut - out1.amountIn);
      return out2.amountOut;
    }

    // let baseProfit = getOut(fromAmount) - fromAmount;
    // if (baseProfit < 0n) {
    //   return {
    //     flag: false,
    //     optInput: -1n,
    //     optProfit: -1n,
    //     getOutCalls: getOutCallCount
    //   }
    // }

    let startAmount: bigint = fromAmount
    let endAmount: bigint = toAmount;
    let midAmount: bigint = (startAmount + endAmount) / 2n;
    let startAmountProfit: bigint = 0n;
    let endAmountProfit: bigint = 0n;
    let midAmountProfit: bigint;
    let midLeftAmountProfit: bigint;
    let midRightAmountProfit: bigint;

    let globalAmountProfit = getOut(startAmount) - startAmount;
    let optInput = startAmount;
    const BINARY_COEFFICIENT: bigint = 100n;

    while (startAmount < (endAmount - (endAmount / BINARY_COEFFICIENT))) {
      startAmountProfit = getOut(startAmount) - startAmount;
      endAmountProfit = getOut(endAmount) - endAmount;
      midAmountProfit = getOut(midAmount) - midAmount;
      if (midAmountProfit > globalAmountProfit) {
        globalAmountProfit = midAmountProfit;
        optInput = midAmount;
      }
      if (startAmountProfit > globalAmountProfit) {
        globalAmountProfit = startAmountProfit;
        optInput = startAmount;
      }
      if (endAmountProfit > globalAmountProfit) {
        globalAmountProfit = endAmountProfit;
        optInput = endAmount;
      }
      if (
        midAmountProfit > startAmountProfit &&
        midAmountProfit > endAmountProfit
      ) {
        let midLeft =
          (midAmount * (BINARY_COEFFICIENT - 1n)) / BINARY_COEFFICIENT;
        let midRight =
          (midAmount * (BINARY_COEFFICIENT + 1n)) / BINARY_COEFFICIENT;
        midLeftAmountProfit = getOut(midLeft) - midLeft;
        midRightAmountProfit = getOut(midRight) - midRight;
        if (midLeftAmountProfit > midRightAmountProfit) {
          endAmount = midAmount;
        } else if (midLeftAmountProfit < midRightAmountProfit) {
          startAmount = midAmount;
        } else {
          break;
        }
      } else if (
        midAmountProfit > startAmountProfit &&
        midAmountProfit <= endAmountProfit
      ) {
        startAmount = midAmount;
      } else {
        endAmount = midAmount;
      }
      midAmount = (startAmount + endAmount) / 2n;
    }

    let profit = getOut(optInput) - optInput;
    return {
      flag: true,
      optInput: optInput,
      optProfit: profit,
      getOutCalls: getOutCallCount
    }
  }
}

export const ArbFinder = new Finder();
