import { Abi, decodeFunctionData, decodeFunctionResult } from 'viem';
import { ArbHelper } from '../chain/arb.helper';
import { ExtendedPoolInfo } from 'src/common/types';
import { ERC20ABI } from '../abi/erc20';
import { UniV2PoolABI } from '../abi/uniswap/univ2pool';
import { UniV3PoolABI } from '../abi/uniswap/univ3pool';
import { AeroV2PoolABI } from '../abi/aerodrome/aerov2pool';
import { AEROV3PoolABI } from '../abi/aerodrome/aerov3pool';
import { UNIV4_POOL_MANAGER_ABI } from '../abi/uniswap/univ4poolmanager';

export interface TraceCall {
  from: string;
  to: string;
  input: string;
  output: string;
  gas: string;
  gasUsed: string;
  type: string;
  value?: string;
  calls?: TraceCall[];
}

export interface DecodedFunction {
  name: string;
  inputs: { name: string; value: any }[];
  outputs: { name: string; value: any }[];
}

export interface DecodedCall {
  from: string;
  to: string;
  functionName: string;
  args: any;
  output: any;
  gasUsed: string;
  type: string;
  poolInfo?: ExtendedPoolInfo & {
    tokenSymbols?: string[];
  };
  calls?: DecodedCall[];
  depth: number;
  decodedFunction?: DecodedFunction;
}

export interface TraceAnalysisResult {
  rootCall: DecodedCall;
  decodedFunctions: Array<{
    depth: number;
    address: string;
    function: DecodedFunction;
    poolInfo?: ExtendedPoolInfo & {
      tokenSymbols?: string[];
    };
    gasUsed: string;
  }>;
  gasUsed: string;
}

export class TraceHelper {
  private readonly arbHelper: ArbHelper;
  private readonly poolCache: Map<string, ExtendedPoolInfo & { tokenSymbols?: string[] }> = new Map();
  private readonly UNIV4_POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
  private decodedFunctions: Array<{
    depth: number;
    address: string;
    function: DecodedFunction;
    poolInfo?: ExtendedPoolInfo & {
      tokenSymbols?: string[];
    };
    gasUsed: string;
  }> = [];

  constructor(arbHelper: ArbHelper) {
    this.arbHelper = arbHelper;
  }

  private async getPoolInfo(address: string): Promise<(ExtendedPoolInfo & { tokenSymbols?: string[] }) | null> {
    const lowerAddress = address.toLowerCase();
    if (this.poolCache.has(lowerAddress)) {
      return this.poolCache.get(lowerAddress)!;
    }

    // 尝试获取池子信息
    const poolInfo = await this.arbHelper.requesV2V3PoolInfo(lowerAddress);
    if (poolInfo) {
      // 获取 token symbols
      const tokenSymbols = await Promise.all(
        poolInfo.tokens.map(async (token) => {
          try {
            const tokenInfo = await this.arbHelper.requestTokenInfo(token);
            return tokenInfo?.symbol || token;
          } catch {
            return token;
          }
        })
      );
      
      const enhancedPoolInfo = {
        ...poolInfo,
        tokenSymbols
      };
      
      this.poolCache.set(lowerAddress, enhancedPoolInfo);
      return enhancedPoolInfo;
    }

    // 尝试获取 Curve 池子信息
    const curvePoolInfo = await this.arbHelper.requestCurvePoolInfo(lowerAddress);
    if (curvePoolInfo) {
      // 获取 token symbols
      const tokenSymbols = await Promise.all(
        curvePoolInfo.tokens.map(async (token) => {
          try {
            const tokenInfo = await this.arbHelper.requestTokenInfo(token);
            return tokenInfo?.symbol || token;
          } catch {
            return token;
          }
        })
      );
      
      const enhancedPoolInfo = {
        ...curvePoolInfo,
        tokenSymbols
      };
      
      this.poolCache.set(lowerAddress, enhancedPoolInfo);
      return enhancedPoolInfo;
    }

    // 尝试获取 Uniswap V4 池子信息
    const v4PoolInfo = await this.arbHelper.requestUniswapV4PoolInfo(lowerAddress);
    if (v4PoolInfo) {
      // 获取 token symbols
      const tokenSymbols = await Promise.all(
        v4PoolInfo.tokens.map(async (token) => {
          try {
            const tokenInfo = await this.arbHelper.requestTokenInfo(token);
            return tokenInfo?.symbol || token;
          } catch {
            return token;
          }
        })
      );
      
      const enhancedPoolInfo = {
        ...v4PoolInfo,
        tokenSymbols
      };
      
      this.poolCache.set(lowerAddress, enhancedPoolInfo);
      return enhancedPoolInfo;
    }

    return null;
  }

  private getPoolABI(poolInfo: ExtendedPoolInfo): Abi {
    switch (poolInfo.protocol) {
      case 'UniV2':
      case 'PancakeV2':
        return UniV2PoolABI as Abi;
      case 'AeroV2':
        return AeroV2PoolABI as Abi;
      case 'UniV3':
      case 'Sol3':
      case 'PancakeV3':
      case 'AlienV3':
      case 'DackieV3':
        return UniV3PoolABI as Abi;
      case 'AeroV3':
        return AEROV3PoolABI as Abi;
      case 'UniV4':
        return UNIV4_POOL_MANAGER_ABI as Abi;
      default:
        return [];
    }
  }

  private async decodeCall(call: TraceCall, depth: number = 0): Promise<DecodedCall> {
    const poolInfo = await this.getPoolInfo(call.to);
    let abi: Abi = [];
    let functionName = 'unknown';
    let args: any = null;
    let output: any = null;
    let decodedFunction: DecodedFunction | undefined;

    // 特殊处理 V4 的情况
    if (call.to.toLowerCase() === this.UNIV4_POOL_MANAGER.toLowerCase()) {
      abi = UNIV4_POOL_MANAGER_ABI as Abi;
    } else if (poolInfo) {
      abi = this.getPoolABI(poolInfo);
    } else {
      // 如果是 ERC20 调用
      if (call.input.startsWith('0xa9059cbb') || // transfer
          call.input.startsWith('0x23b872dd') || // transferFrom
          call.input.startsWith('0x095ea7b3')) { // approve
        abi = ERC20ABI as Abi;
      } else {
        // 尝试使用 V2 和 V3 的 ABI 解码
        const possibleABIs = [
          UniV2PoolABI as Abi,
          UniV3PoolABI as Abi,
          AeroV2PoolABI as Abi,
          AEROV3PoolABI as Abi
        ];

        for (const possibleABI of possibleABIs) {
          try {
            if (call.input !== '0x') {
              const decodedInput = decodeFunctionData({
                abi: possibleABI,
                data: call.input as `0x${string}`
              });
              // 如果成功解码，使用这个 ABI
              abi = possibleABI;
              functionName = decodedInput.functionName;
              args = decodedInput.args;
              break;
            }
          } catch (error) {
            // 如果解码失败，继续尝试下一个 ABI
            continue;
          }
        }
      }
    }

    try {
      if (call.input !== '0x' && !args) {
        const decodedInput = decodeFunctionData({
          abi,
          data: call.input as `0x${string}`
        });
        functionName = decodedInput.functionName;
        args = decodedInput.args;
      }

      if (call.output !== '0x') {
        const decodedOutput = decodeFunctionResult({
          abi,
          data: call.output as `0x${string}`,
          functionName
        });
        output = decodedOutput;

        // 构建解码后的函数信息
        if (functionName !== 'unknown') {
          const abiItem = abi.find(item => 
            item.type === 'function' && item.name === functionName
          );
          
          if (abiItem && 'inputs' in abiItem && 'outputs' in abiItem) {
            decodedFunction = {
              name: functionName,
              inputs: abiItem.inputs.map((input, index) => ({
                name: input.name || `param${index}`,
                value: args[index]
              })),
              outputs: abiItem.outputs.map((output, index) => ({
                name: output.name || `return${index}`,
                value: Array.isArray(decodedOutput) ? decodedOutput[index] : decodedOutput
              }))
            };

            // 添加到解码函数列表，包含 gasUsed
            this.decodedFunctions.push({
              depth,
              address: call.to,
              function: decodedFunction,
              poolInfo: poolInfo || undefined,
              gasUsed: call.gasUsed
            });
          }
        }
      }
    } catch (error) {
      // 如果解码失败，保存原始数据
      functionName = 'unknown';
      args = call.input;
      output = call.output;
    }

    const decodedCall: DecodedCall = {
      from: call.from,
      to: call.to,
      functionName,
      args,
      output,
      gasUsed: call.gasUsed,
      type: call.type,
      poolInfo: poolInfo || undefined,
      depth,
      decodedFunction
    };

    if (call.calls && call.calls.length > 0) {
      decodedCall.calls = await Promise.all(
        call.calls.map(subCall => this.decodeCall(subCall, depth + 1))
      );
    }

    return decodedCall;
  }

  public async analyzeTrace(trace: TraceCall): Promise<TraceAnalysisResult> {
    this.decodedFunctions = []; // 重置解码函数列表
    const rootCall = await this.decodeCall(trace);
    
    return {
      rootCall,
      decodedFunctions: this.decodedFunctions,
      gasUsed: trace.gasUsed
    };
  }
} 