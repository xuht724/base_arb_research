import { StandardSwapEvent } from '../chain/types';

/**
 * 分析交易input中的pool地址
 * @param input 交易input数据
 * @param swapEvents 交易事件列表
 * @returns 分析结果
 */
export function analyzePoolsInInput(
  input: `0x${string}`,
  swapEvents: StandardSwapEvent[]
): {
  total: number;
  found: number;
  details: Record<string, number>;
} {
  const lowerInput = input.toLowerCase();
  const details: Record<string, number> = {};
  let found = 0;
  const total = swapEvents.length;
  
  // 检查每个pool地址在input中出现的次数
  for (const event of swapEvents) {
    const poolAddress = event.poolAddress.toLowerCase().replace('0x', '');
    const count = (lowerInput.match(new RegExp(poolAddress, 'g')) || []).length;
    details[poolAddress] = count;
    if (count > 0) {
      found++;
    }
  }
  
  return {
    total,
    found,
    details
  };
}

/**
 * 分析交易input中的token地址
 * @param input 交易input数据
 * @param swapEvents 交易事件列表
 * @returns 分析结果
 */
export function analyzeTokensInInput(
  input: `0x${string}`,
  swapEvents: StandardSwapEvent[]
): {
  total: number;
  found: number;
  details: Record<string, number>;
} {
  const lowerInput = input.toLowerCase();
  const tokens = new Set<string>();
  const details: Record<string, number> = {};
  let found = 0;

  // 收集所有涉及的token
  for (const event of swapEvents) {
    tokens.add(event.tokenIn.toLowerCase().replace('0x', ''));
    tokens.add(event.tokenOut.toLowerCase().replace('0x', ''));
  }

  // 检查每个token在input中出现的次数
  for (const token of tokens) {
    const count = (lowerInput.match(new RegExp(token, 'g')) || []).length;
    details[token] = count;
    if (count > 0) {
      found++;
    }
  }

  return {
    total: tokens.size,
    found,
    details
  };
}

/**
 * 分析交易input中的amounts
 * @param input 交易input数据
 * @param swapEvents 交易事件列表
 * @returns 分析结果
 */
export function analyzeAmounts(
  input: `0x${string}`,
  swapEvents: StandardSwapEvent[]
): {
  inputAmounts: Array<{amount: bigint, found: boolean, hexFormat: string}>;
  outputAmounts: Array<{amount: bigint, found: boolean, hexFormat: string}>;
} {
  const inputAmounts: Array<{amount: bigint, found: boolean, hexFormat: string}> = [];
  const outputAmounts: Array<{amount: bigint, found: boolean, hexFormat: string}> = [];

  // 移除input的0x前缀
  const cleanInput = input.startsWith('0x') ? input.slice(2) : input;

  // 将amounts转换为hexstring
  for (const event of swapEvents) {
    const inputHex = event.amountIn.toString(16);
    const outputHex = event.amountOut.toString(16);

    inputAmounts.push({
      amount: event.amountIn,
      found: cleanInput.includes(inputHex),
      hexFormat: inputHex
    });

    outputAmounts.push({
      amount: event.amountOut,
      found: cleanInput.includes(outputHex),
      hexFormat: outputHex
    });
  }

  return { inputAmounts, outputAmounts };
}

/**
 * 综合分析交易input
 * @param input 交易input数据
 * @param swapEvents 交易事件列表
 * @returns 分析结果
 */
export function analyzeSwapInput(
  input: string,
  swapEvents: StandardSwapEvent[]
): {
  flags: {
    poolsMatch: boolean;    // 是否有pool地址匹配
    tokensMatch: boolean;   // 是否有token地址匹配
    amountsMatch: boolean;  // 是否有amounts匹配
  };
  poolAnalysis: {
    total: number;
    found: number;
    details: Record<string, number>;
  };
  tokenAnalysis: {
    total: number;
    found: number;
    details: Record<string, number>;
  };
  amounts: {
    inputAmounts: Array<{amount: bigint, found: boolean, hexFormat: string}>;
    outputAmounts: Array<{amount: bigint, found: boolean, hexFormat: string}>;
  };
} {
  const typedInput = input as `0x${string}`;
  
  const poolAnalysis = analyzePoolsInInput(typedInput, swapEvents);
  const tokenAnalysis = analyzeTokensInInput(typedInput, swapEvents);
  const amountsAnalysis = analyzeAmounts(typedInput, swapEvents);

  // 检查是否有任何amounts匹配
  const hasAmountsMatch = amountsAnalysis.inputAmounts.some(a => a.found) || 
                         amountsAnalysis.outputAmounts.some(a => a.found);
  
  return {
    flags: {
      poolsMatch: poolAnalysis.found > 0,
      tokensMatch: tokenAnalysis.found > 0,
      amountsMatch: hasAmountsMatch
    },
    poolAnalysis,
    tokenAnalysis,
    amounts: amountsAnalysis
  };
} 