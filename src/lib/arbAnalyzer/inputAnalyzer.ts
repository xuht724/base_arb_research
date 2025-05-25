import { ArbitrageCycle } from '../chain/types';

/**
 * 分析套利路径在input中出现的次数
 * @param input 交易input数据
 * @param arbitrageCycle 套利路径信息
 * @returns 分析结果
 */
export function analyzeArbitragePathInInput(
  input: `0x${string}`,
  arbitrageCycle: ArbitrageCycle
): {
  total: number;
  found: number;
  details: Record<string, number>;
} {
  const lowerInput = input.toLowerCase();
  const details: Record<string, number> = {};
  let found = 0;
  const total = arbitrageCycle.edges.length;
  
  // 检查每个边的pool地址在input中出现的次数
  for (const edge of arbitrageCycle.edges) {
    // 移除pool地址的0x前缀
    const poolAddress = edge.poolAddress.toLowerCase().replace('0x', '');
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
 * 分析input和output token在input中出现的次数
 * @param input 交易input数据
 * @param arbitrageCycle 套利路径信息
 * @returns 分析结果
 */
export function analyzeTokensInInput(
  input: `0x${string}`,
  arbitrageCycle: ArbitrageCycle
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
  for (const edge of arbitrageCycle.edges) {
    // 移除token地址的0x前缀
    tokens.add(edge.tokenIn.toLowerCase().replace('0x', ''));
    tokens.add(edge.tokenOut.toLowerCase().replace('0x', ''));
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
 * 分析input数据中的amounts
 * @param input 交易input数据
 * @param arbitrageCycle 套利路径信息
 * @returns 分析结果
 */
export function analyzeAmounts(
  input: `0x${string}`,
  arbitrageCycle: ArbitrageCycle
): {
  inputAmounts: Array<{amount: string, found: boolean, hexFormat: string}>;
  outputAmounts: Array<{amount: string, found: boolean, hexFormat: string}>;
} {
  const inputAmounts: Array<{amount: string, found: boolean, hexFormat: string}> = [];
  const outputAmounts: Array<{amount: string, found: boolean, hexFormat: string}> = [];

  // 移除input的0x前缀
  const cleanInput = input.startsWith('0x') ? input.slice(2) : input;

  // 将amounts转换为hexstring，保持原始位数
  for (const edge of arbitrageCycle.edges) {
    const inputHex = BigInt(edge.amountIn).toString(16);
    const outputHex = BigInt(edge.amountOut).toString(16);

    inputAmounts.push({
      amount: edge.amountIn,
      found: cleanInput.includes(inputHex),
      hexFormat: inputHex
    });

    outputAmounts.push({
      amount: edge.amountOut,
      found: cleanInput.includes(outputHex),
      hexFormat: outputHex
    });
  }

  return { inputAmounts, outputAmounts };
}

/**
 * 综合分析套利交易
 * @param input 交易input数据
 * @param arbitrageCycle 套利路径信息
 * @returns 分析结果
 */
export function analyzeArbitrageInput(
  input: string,
  arbitrageCycle: ArbitrageCycle
): {
  pathAnalysis: {
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
    inputAmounts: Array<{amount: string, found: boolean, hexFormat: string}>;
    outputAmounts: Array<{amount: string, found: boolean, hexFormat: string}>;
  };
} {
  const typedInput = input as `0x${string}`;
  
  return {
    pathAnalysis: analyzeArbitragePathInInput(typedInput, arbitrageCycle),
    tokenAnalysis: analyzeTokensInInput(typedInput, arbitrageCycle),
    amounts: analyzeAmounts(typedInput, arbitrageCycle)
  };
} 