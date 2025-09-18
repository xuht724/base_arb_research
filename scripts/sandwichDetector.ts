import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, Transaction, TransactionReceipt, Log } from 'viem';
import { mainnet } from 'viem/chains';
import * as dotenv from 'dotenv';
dotenv.config();

import { ArbHelper } from '../src/lib/chain/arb.helper';
import { StandardSwapEvent, SandwichAttack } from '../src/lib/chain/types';
import { ChainConstants, ChainType } from '../src/common/constants';


function bigintReplacer(key: string, value: any) {
  return typeof value === 'bigint' ? value.toString() : value;
}

export class PatternBasedSandwichDetector {
  private readonly WETH: string;
  private readonly MAX_GAP_TRANSACTIONS = 5;

  constructor(chain: ChainType = 'ethereum') {
    this.WETH = ChainConstants.getTokenAddress(chain, 'WETH')!;
  }

  public detectSandwichAttacks(txResults: any[]): SandwichAttack[] {
    const allSwaps: StandardSwapEvent[] = [];
    for (const txResult of txResults) {
      if (!txResult || !txResult.swapEvents) continue;
      allSwaps.push(...txResult.swapEvents);
    }
  
    const swapsByPool = this.groupSwapsByPool(allSwaps);
    const attacks: SandwichAttack[] = [];
  
    for (const [poolAddress, poolSwaps] of swapsByPool.entries()) {
      const sorted = this.filterAndSort(poolSwaps);
      const poolSandwiches = this.findSandwichesInPool(sorted);
      attacks.push(...poolSandwiches);
    }
  
    return attacks.filter(a => a.profitToken.toLowerCase() === this.WETH.toLowerCase());

  }

  private groupSwapsByPool(swaps: StandardSwapEvent[]): Map<string, StandardSwapEvent[]> {
    const map = new Map<string, StandardSwapEvent[]>();
    for (const swap of swaps) {
      const pool = swap.poolAddress.toLowerCase();
      if (!map.has(pool)) map.set(pool, []);
      map.get(pool)!.push(swap);
    }
    return map;
  }

  private filterAndSort(swaps: StandardSwapEvent[]): StandardSwapEvent[] {
    return swaps
      .filter(s => s.transactionIndex !== undefined && s.logIndex !== undefined)
      .sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber! - b.blockNumber!;
        if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex! - b.transactionIndex!;
        return a.logIndex! - b.logIndex!;
      });
  }
  
  private findVictimsBetween(
    front: StandardSwapEvent, 
    back: StandardSwapEvent, 
    allSwaps: StandardSwapEvent[]
  ): StandardSwapEvent[] {
    const victims: StandardSwapEvent[] = [];
  
    for (const swap of allSwaps) {
      // 跳过front和back本身
      if (this.isSameEvent(swap, front) || this.isSameEvent(swap, back)) continue;
      
      // 检查是否在front和back之间（使用logIndex比较）
      if (!(front.logIndex! < swap.logIndex! && swap.logIndex! < back.logIndex!)) continue;
      
      // 检查是否与front有相同的代币对（受害者应该是相同方向的交易）
      if (swap.tokenIn.toLowerCase() === front.tokenIn.toLowerCase() && 
          swap.tokenOut.toLowerCase() === front.tokenOut.toLowerCase()) {
        victims.push(swap);
      }
    }
  
    return victims;
  }
  
  private isSameEvent(eventA: StandardSwapEvent, eventB: StandardSwapEvent): boolean {
    return eventA.transactionIndex === eventB.transactionIndex && 
           eventA.logIndex === eventB.logIndex &&
           eventA.blockNumber === eventB.blockNumber;
  }
  
  private findSandwichesInPool(swaps: StandardSwapEvent[]): SandwichAttack[] {
    const attacks: SandwichAttack[] = [];
    const MAX_GAP_TX = 5;
  
    for (let i = 0; i < swaps.length; i++) {
      const front = swaps[i];
      for (let j = i + 1; j < Math.min(swaps.length, i + MAX_GAP_TX + 1); j++) {
        const back = swaps[j];
  
        if (!this.isValidSandwichPair(front, back)) continue;
  
        const victims = this.findVictimsBetween(front, back, swaps);
        if (victims.length === 0) continue;
  
        const profitAmount = back.amountOut - front.amountIn;
        if (profitAmount <= 0n) continue;
  
        attacks.push({
          blockNumber: front.blockNumber!,
          attacker: front.sender,
          front,
          back,
          victims,
          profitToken: front.tokenIn, 
          profitAmount
        });
      }
    }
  
    return attacks;
  }
  

 
  private isValidSandwichPair(front: StandardSwapEvent, back: StandardSwapEvent): boolean {
    return (
      front.sender === back.sender &&
      front.transactionIndex! <= back.transactionIndex! &&
      front.poolAddress.toLowerCase() === back.poolAddress.toLowerCase() &&
      front.tokenIn.toLowerCase() === back.tokenOut.toLowerCase() // 可选：保证资金流闭环
    );
  }
  


  public static async detectSandwichForBlock(blockNumber: number, ethRpcUrl: string, theGraphApiKey: string) {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(ethRpcUrl),
    });
  
    // 修复：ArbHelper构造函数只需要url和API key
    const arbHelper = new ArbHelper(ethRpcUrl, theGraphApiKey);
    const detector = new PatternBasedSandwichDetector('ethereum');
  
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    const txResults: any[] = [];
  
    // 分析区块中的所有交易
    for (let i = 0; i < block.transactions.length; i++) {
      const txHash = block.transactions[i];
      try {
        const tx = await client.getTransaction({ hash: txHash });
        const receipt = await client.getTransactionReceipt({ hash: txHash });
        
        // 修复：analyzeTransaction只需要5个参数
        const result = await arbHelper.analyzeTransaction(
          tx,
          receipt,
          blockNumber,
          new Map(),
          i
        );
        
        if (result) {
          // 添加缺失的 from 和 to 字段
          result.from = tx.from;
          result.to = tx.to || undefined;
          
          // 确保 swapEvents 中的交易也有这些信息
          if (result.swapEvents) {
            result.swapEvents = result.swapEvents.map((event: StandardSwapEvent) => ({
              ...event,
              blockNumber: blockNumber,
              transactionIndex: i,
              txFrom: tx.from,
              txTo: tx.to || null
            }));
          }
          
          txResults.push(result);
        }
      } catch (e) {
        console.warn(`[WARN] Failed to analyze tx ${txHash}: ${e.message}`);
      }
    }

    // 在分析结果上检测三明治攻击
    const attacks = detector.detectSandwichAttacks(txResults);
    console.log(`[Block ${blockNumber}] Detected ${attacks.length} global sandwich attacks`);

    // 保存结果
    const outputDir = path.join(process.cwd(), 'output', 'sandwich_detector');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(outputDir, `block_${blockNumber}_attacks.json`),
      JSON.stringify({
        block: blockNumber,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        totalTransactions: block.transactions.length,
        attacks
      }, bigintReplacer, 2)
    );

    return attacks;
  }
}


if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: ts-node patternBasedSandwichDetector.ts <blockNumber> [endBlock]');
    console.error('Examples:');
    console.error('  Single: ts-node patternBasedSandwichDetector.ts 22327989');
    console.error('  Range:  ts-node patternBasedSandwichDetector.ts 22327989 22385194');
    process.exit(1);
  }

  const startblocok = parseInt(args[0]);
 

  const ethRpcUrl = process.env.ETH_HTTP_URL;
  const theGraphApiKey = process.env.THE_GRAPH_API_KEY;
  
  if (!ethRpcUrl || !theGraphApiKey) {
    console.error('Missing required environment variables: ETH_HTTP_URL or THE_GRAPH_API_KEY');
    process.exit(1);
  }

  const startBlock = parseInt(args[0]);
  const endBlock = args[1] ? parseInt(args[1]) : startBlock;
  
  if (isNaN(startBlock) || isNaN(endBlock)) {
    console.error('Invalid block numbers');
    process.exit(1);
  }

  // 简单的循环处理
  async function processBlocks() {
    for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
      try {
        console.log(`Processing block ${blockNumber} (${blockNumber - startBlock + 1}/${endBlock - startBlock + 1})`);
        await PatternBasedSandwichDetector.detectSandwichForBlock(blockNumber, ethRpcUrl!, theGraphApiKey!);
        
        // 可选：添加延迟避免RPC限制
        if (blockNumber < endBlock) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒延迟
        }
      } catch (error) {
        console.error(`Failed to process block ${blockNumber}: ${error.message}`);
        // 继续处理下一个区块
      }
    }
    console.log('Done!');
  }

  processBlocks().catch(console.error);
}