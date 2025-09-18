/**
 * analyze-arbitrage.ts
 * --------------------------------------------
 * 目的：从数据库读取区块，在本地用 ArbHelper 做“找环→套利判定”，
 *       并用 PatternBasedSandwichDetector 做三明治检测；仅输出套利交易。
 *
 * 运行：bun run scripts/analyze-arbitrage.ts <START> <END>
 * 环境：
 *   - MYSQL_URL
 *   - BASE_HTTP_URL
 *   - THE_GRAPH_API_KEY
 *   - CHAIN=base|ethereum|...
 *   - DEBUG_ARBITRAGE=0|1            // 打印调试信息（可选）
 *   - REQUIRE_NONEMPTY_SWAPS=0|1     // 仅输出 swapEvents 非空的套利交易（可选）
 */

 //#region ───────────────────────────── 1. Imports ─────────────────────────────
import { ArbHelper } from "../src/lib/chain/arb.helper";
import { BlockRepository } from "../src/lib/db/block.repository";
import { StandardSwapEvent, TokenBalanceChange, BlockAnalysisResult, ArbitrageInfo, SandwichAttack } from "../src/lib/chain/types";
import { Transaction, TransactionReceipt, formatUnits } from "viem";
import * as path from 'path';
import * as fs from 'fs';
import { replacer } from "../src/lib/utils";
import { analyzeSwapInput } from "../src/lib/arbAnalyzer/swapEventAnalyzer";
import { performance } from "node:perf_hooks";
import { debugBlockSummary, debugTxAndReceipt } from "../src/lib/utils";
import { PatternBasedSandwichDetector } from "../scripts/sandwichDetector";
import type { ChainType } from "../src/common/constants";
//#endregion

//#region ───────────────────────────── 2. Types ────────────────────────────────
interface AnalysisResult {
  startBlock: number;
  endBlock: number;
  blocks: BlockAnalysisResult[];
  statistics: {
    totalBlocks: number;
    totalTransactions: number;
    arbitrageTransactions: number;
    beginArbitrageCount: number;
    interArbitrageCount: number;
    backrunArbitrageCount: number;
    totalProfit: string;
    totalGasUsed: string;
    averageGasPrice: string;
    averageProfit: string;
  };
  arbitrageTransactions: Array<{
    blockNumber: number;
    timestamp: Date;
    transaction: {
      hash: string;
      index: number;
      from: string;
      to?: string;
      gas: {
        gasPrice: string;
        effectiveGasPrice: string;
        gasUsed: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        baseFeePerGas: string;
        truePriorityFeePerGas: string;
      };
      input: string;
      inputAnalysis: any;
      arbitrageInfo: ArbitrageInfo;
      sandwichInfo?: SandwichAttack[];
      swapEvents: StandardSwapEvent[];
      tokenChanges: Record<string, string>;
      addressTokenChanges: Record<string, TokenBalanceChange[]>;
    };
  }>;
}
//#endregion

//#region ───────────────────────────── 3. Utils ────────────────────────────────
/** 格式化利润（默认18位；USDC/USDbC为6位） */
function formatProfit(amount: string, token: string): string {
  const amt = BigInt(amount);
  const t = token.toLowerCase();
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const USDbC = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca";
  const DAI = "0x50c5725949a6f0c72e6c4a641f24049a917db0cb";
  const decimals = t === USDC || t === USDbC ? 6 : t === DAI ? 18 : 18;
  return formatUnits(amt, decimals);
}

/** 秒→人类可读 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}小时${m}分${s}秒`;
}

/** 0x或字符串数字→number（undefined容错） */
function toNum(v: any): number | undefined {
  return typeof v === 'string' && v.startsWith('0x') ? parseInt(v, 16) :
         typeof v === 'string' ? Number(v) :
         (v ?? undefined);
}
//#endregion

//#region ───────────────────────── 4. Env & Global Flags ───────────────────────
const REQUIRE_NONEMPTY_SWAPS = process.env.REQUIRE_NONEMPTY_SWAPS === '1';
const DEBUG_ON = process.env.DEBUG_ARBITRAGE === '1';
//#endregion

//#region ───────────────────────────── 5. Main ────────────────────────────────
async function main() {
  // ── 5.1 环境检查 ───────────────────────────────────────────────────────────
  if (!process.env.MYSQL_URL) {
    console.error("请设置 MYSQL_URL 环境变量");
    process.exit(1);
  }
  const rpcUrl = process.env.BASE_HTTP_URL!;
  const theGraphApiKey = process.env.THE_GRAPH_API_KEY!;
  if (!rpcUrl || !theGraphApiKey) {
    console.error("请设置 BASE_HTTP_URL 和 THE_GRAPH_API_KEY 环境变量");
    process.exit(1);
  }

  // ── 5.2 组件初始化 ─────────────────────────────────────────────────────────
  const helper = new ArbHelper(rpcUrl, theGraphApiKey);
  const blockRepo = new BlockRepository();

  const chain = (process.env.CHAIN as ChainType) || 'base';
  const detector = new PatternBasedSandwichDetector(chain);

  // ── 5.3 CLI 参数解析 ───────────────────────────────────────────────────────
  const startBlock = parseInt(process.argv[2] || "0");
  const endBlock   = parseInt(process.argv[3] || "0");
  if (!startBlock || !endBlock) {
    console.error("请提供起始和结束区块号");
    process.exit(1);
  }
  if (startBlock > endBlock) {
    console.error(`错误：起始区块(${startBlock})不能大于结束区块(${endBlock})`);
    process.exit(1);
  }

  try {
    // ── 5.4 数据范围校验 ────────────────────────────────────────────────────
    const dbRange = await blockRepo.getBlockRange();
    console.log(`\n数据库中的区块范围: ${dbRange.min} - ${dbRange.max}`);
    if (dbRange.min === null || dbRange.max === null) {
      console.error("数据库中没有区块数据");
      process.exit(1);
    }
    if (startBlock < dbRange.min || endBlock > dbRange.max) {
      console.error(`请求的区块范围 ${startBlock}-${endBlock} 超出数据库范围 ${dbRange.min}-${dbRange.max}`);
      process.exit(1);
    }

    // ── 5.5 输出目录与统计容器 ──────────────────────────────────────────────
    const totalBlocks = endBlock - startBlock + 1;
    console.log(`\n=== 开始分析区块 ${startBlock} 到 ${endBlock} 的套利交易（接入 Sandwich 检测）===`);
    console.log(`总区块数: ${totalBlocks}`);

    const resultDir = path.join(__dirname, '../data/arbitrage_analysis_db');
    if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
    console.log(`结果将保存到: ${resultDir}`);

    const statistics = {
      totalBlocks: 0,
      totalTransactions: 0,
      arbitrageTransactions: 0,
      beginArbitrageCount: 0,
      interArbitrageCount: 0,
      backrunArbitrageCount: 0,
      totalProfit: '0',
      totalGasUsed: '0',
      averageGasPrice: '0',
      averageProfit: '0'
    };
    const arbitrageTransactions: AnalysisResult["arbitrageTransactions"] = [];
    const blocks: BlockAnalysisResult[] = [];

    const batchSize = 50;
    const totalBatches = Math.ceil(totalBlocks / batchSize);
    const analysisBegin = performance.now();
    let processedBlocks = 0;

    // ── 5.6 批次主循环 ──────────────────────────────────────────────────────
    for (let batchStart = startBlock; batchStart <= endBlock; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, endBlock);
      const currentBatch = Math.floor((batchStart - startBlock) / batchSize) + 1;
      console.log(`\n[批次 ${currentBatch}/${totalBatches}] 处理区块 ${batchStart} - ${batchEnd}`);

      // 5.6.1 读取
      console.log("1. 从数据库加载区块数据...");
      const t0 = performance.now();
      const dbBlocks = await blockRepo.getBlocks(batchStart, batchEnd);
      const t1 = performance.now();
      console.log(`✓ 加载完成: ${dbBlocks.length} 个区块，耗时 ${((t1 - t0) / 1000).toFixed(2)} 秒`);
      if (dbBlocks.length === 0) {
        console.log("跳过空批次");
        continue;
      }

      // 5.6.2 准备（时间单位兜底）
      console.log("2. 准备区块数据...");
      const preparedBlocks = dbBlocks.map(block => {
        const tsNum = Number(block.timestamp);
        const ts = new Date(tsNum > 1e12 ? tsNum : tsNum * 1000);
        return {
          blockNumber: block.blockNumber,
          timestamp: ts,
          transactions: Array.isArray(block.transactions) ? (block.transactions as unknown as Transaction[]) : [],
          receipts: Array.isArray(block.receipts) ? (block.receipts as unknown as TransactionReceipt[]) : []
        };
      });
      console.log(`✓ 数据准备完成: ${preparedBlocks.length} 个区块`);

      // [DEBUG-1] analyze 前抽样检查
      if (DEBUG_ON) {
        for (const b of preparedBlocks) {
          const txs = b.transactions as any[];
          const recs = b.receipts as any[];
          debugBlockSummary(b.blockNumber, txs, recs);

          const recByHash = new Map<string, any>();
          for (const r of recs || []) {
            const h = (r?.transactionHash || r?.hash || '').toLowerCase?.();
            if (h) recByHash.set(h, r);
          }
          for (let i = 0; i < Math.min(10, txs.length); i++) {
            const tx = txs[i];
            const h = (typeof tx === 'string' ? tx : tx.hash)?.toLowerCase?.();
            const rc = h ? recByHash.get(h) : undefined;
            debugTxAndReceipt(tx, rc, { showLogs: 2 });
          }
        }
      }

      // 5.6.3 分析
      console.log("3. 开始分析区块...");
      const batchStartAt = performance.now();
      const concurrentLimit = 5;
      const blockResults: BlockAnalysisResult[] = [];

      for (let i = 0; i < preparedBlocks.length; i += concurrentLimit) {
        const slice = preparedBlocks.slice(i, i + concurrentLimit);
        const batchResults = await Promise.all(
          slice.map(async (block) => {
            try {
              return await helper.analyzeBlock(
                block.blockNumber,
                block.timestamp,
                block.transactions,
                block.receipts
              );
            } catch (e) {
              console.error(`分析区块 ${block.blockNumber} 时出错:`, e);
              return null;
            }
          })
        );
        for (const r of batchResults) if (r) blockResults.push(r);
        if (global.gc) global.gc();
      }

      const batchEndAt = performance.now();
      const batchTime = (batchEndAt - batchStartAt) / 1000;

      // 5.6.4 处理结果（接入 Sandwich 检测）
      console.log("4. 处理分析结果...");
      for (const blockResult of blockResults) {
        if (!blockResult) continue;

        // [DEBUG-2] analyze 后统计
        if (DEBUG_ON) {
          const txs = blockResult.transactions;
          const withLogs  = txs.filter(t => (t as any)?.receipt?.logs?.length > 0).length;
          const withSwaps = txs.filter(t => (t as any)?.swapEvents?.length > 0).length;
          console.log(`[DEBUG][Block ${blockResult.blockNumber}] tx=${txs.length} withLogs=${withLogs} withSwapEvents=${withSwaps}`);

          const sampleTx = txs.find(t => (t as any)?.receipt?.logs?.length > 0);
          if (sampleTx) {
            const lg = (sampleTx as any).receipt.logs[0];
            console.log(`  sample log[0]: addr=${lg?.address} topic0=${lg?.topics?.[0]}`);
          }
          const sampleSwapTx = txs.find(t => (t as any)?.swapEvents?.length > 0);
          if (sampleSwapTx) {
            const se = (sampleSwapTx as any).swapEvents[0];
            console.log(`  sample swapEvent: pool=${se?.poolAddress} tokenIn=${se?.tokenIn} tokenOut=${se?.tokenOut} txIdx=${se?.transactionIndex} logIdx=${se?.logIndex}`);
          }
        }

        // ── 汇总基本统计 ─────────────────────────────────────────────────────
        blocks.push(blockResult);
        statistics.totalBlocks++;
        statistics.totalTransactions += blockResult.transactions.length;

        // ── 组装三明治检测输入 ───────────────────────────────────────────────
        const txResultsForDetector = blockResult.transactions.map(tx => ({
          ...tx,
          swapEvents: (tx.swapEvents || []).map(ev => ({
            ...ev,
            blockNumber: toNum(ev.blockNumber) ?? blockResult.blockNumber,
            transactionIndex: toNum(ev.transactionIndex) ?? toNum(tx.index),
            logIndex: toNum(ev.logIndex),
            sender: (ev as any).sender ?? tx.from,
            transactionHash: (ev as any).transactionHash ?? tx.hash,
            txHash: (ev as any).txHash ?? tx.hash,
          }))
        }));

        // ── 三明治检测（全局） ───────────────────────────────────────────────
        const attacks = detector.detectSandwichAttacks(txResultsForDetector);

        // 按 txHash 聚合
        const toTxHash = (e: any) => e.transactionHash ?? e.txHash;
        const attacksByTx = new Map<string, SandwichAttack[]>();
        for (const a of attacks) {
          const hFront = toTxHash(a.front);
          const hBack  = toTxHash(a.back);
          if (hFront) attacksByTx.set(hFront, [...(attacksByTx.get(hFront) ?? []), a]);
          if (hBack)  attacksByTx.set(hBack,  [...(attacksByTx.get(hBack)  ?? []), a]);
          for (const v of a.victims ?? []) {
            const hv = toTxHash(v);
            if (hv) attacksByTx.set(hv, [...(attacksByTx.get(hv) ?? []), a]);
          }
        }

        // ── 仅输出套利交易 ───────────────────
        for (const tx of blockResult.transactions) {
          if (!tx.arbitrageInfo) continue;
          if (REQUIRE_NONEMPTY_SWAPS && (!tx.swapEvents || tx.swapEvents.length === 0)) {
            
            continue;
          }

          statistics.arbitrageTransactions++;
          statistics.totalGasUsed = (BigInt(statistics.totalGasUsed) + BigInt(tx.gas.gasUsed)).toString();

          if (tx.arbitrageInfo.profit?.amount) {
            statistics.totalProfit = (BigInt(statistics.totalProfit) + BigInt(tx.arbitrageInfo.profit.amount)).toString();
          }
          if (tx.arbitrageInfo.type === 'begin') {
            statistics.beginArbitrageCount++;
          } else {
            statistics.interArbitrageCount++;
            if (tx.arbitrageInfo.isBackrun) statistics.backrunArbitrageCount++;
          }

          const formattedProfit =
            tx.arbitrageInfo.profit?.amount && tx.arbitrageInfo.profit?.token
              ? formatProfit(tx.arbitrageInfo.profit.amount, tx.arbitrageInfo.profit.token)
              : undefined;

          const sandwichInfo = attacksByTx.get(tx.hash) ?? [];

          arbitrageTransactions.push({
            blockNumber: blockResult.blockNumber,
            timestamp: blockResult.timestamp,
            transaction: {
              hash: tx.hash,
              index: tx.index,
              from: tx.from,
              to: tx.to,
              gas: tx.gas,
              input: tx.input,
              inputAnalysis: tx.inputAnalysis ?? analyzeSwapInput(tx.input, tx.swapEvents),
              arbitrageInfo: {
                ...tx.arbitrageInfo,
                profit: tx.arbitrageInfo.profit
                  ? { ...tx.arbitrageInfo.profit, formattedAmount: formattedProfit }
                  : tx.arbitrageInfo.profit
              },
              sandwichInfo,
              swapEvents: tx.swapEvents,
              tokenChanges: tx.tokenChanges,
              addressTokenChanges: tx.addressTokenChanges
            }
          });
        }

        processedBlocks++;
        const progress = (processedBlocks / totalBlocks * 100).toFixed(2);
        process.stdout.write(`\r进度: ${progress}% (${processedBlocks}/${totalBlocks}) | 批次耗时: ${formatTime(batchTime)}`);
      }

      if (global.gc) global.gc();
      console.log(`\n✓ 批次完成: ${preparedBlocks.length} 个区块，耗时 ${formatTime(batchTime)}`);
      console.log(`当前累计套利交易: ${statistics.arbitrageTransactions}`);
    }

    // ── 5.7 平均统计补充 ─────────────────────────────────────────────────────
    if (statistics.arbitrageTransactions > 0) {
      statistics.averageGasPrice = (BigInt(statistics.totalGasUsed) / BigInt(statistics.arbitrageTransactions)).toString();
      statistics.averageProfit   = (BigInt(statistics.totalProfit)   / BigInt(statistics.arbitrageTransactions)).toString();
    }

    const analysisEnd = performance.now();
    const totalTime = (analysisEnd - analysisBegin) / 1000;

    // ── 5.8 输出与简报 ───────────────────────────────────────────────────────
    console.log(`\n=== 分析完成 ===`);
    console.log(`总耗时: ${formatTime(totalTime)}`);
    console.log(`平均速度: ${(totalBlocks / totalTime).toFixed(2)} 区块/秒`);

    const result: AnalysisResult = {
      startBlock,
      endBlock,
      blocks,
      statistics,
      arbitrageTransactions
    };
 
    const outputFile  = path.join(resultDir, `analysis_${startBlock}_${endBlock}.json`);
    const summaryFile = path.join(resultDir, `summary_${startBlock}_${endBlock}.json`);

    fs.writeFileSync(outputFile,  JSON.stringify(result,  replacer, 2));
    fs.writeFileSync(summaryFile, JSON.stringify({
      startBlock,
      endBlock,
      analysisTime: analysisEnd - analysisBegin,
      statistics,
      arbitrageCount: arbitrageTransactions.length,
      averageSpeed: totalBlocks / totalTime
    }, replacer, 2));

    console.log(`分析结果已保存到: ${outputFile}`);
    console.log(`简报已保存到:     ${summaryFile}`);

    // ── 5.9 统计打印 ─────────────────────────────────────────────────────────
    console.log("\n=== 分析统计信息 ===");
    console.log(`总区块数: ${statistics.totalBlocks}`);
    console.log(`总交易数: ${statistics.totalTransactions}`);
    console.log(`套利交易数: ${statistics.arbitrageTransactions}`);
    console.log(`开始套利数: ${statistics.beginArbitrageCount}`);
    console.log(`中间套利数: ${statistics.interArbitrageCount}`);
    console.log(`Backrun套利数: ${statistics.backrunArbitrageCount}`);
    console.log(`总利润(wei): ${statistics.totalProfit}`);
    console.log(`总Gas使用量(wei): ${statistics.totalGasUsed}`);
    console.log(`平均Gas价格(粗略/wei): ${statistics.averageGasPrice}`);
    console.log(`平均利润(wei): ${statistics.averageProfit}`);

  } catch (error) {
    console.error("\n分析过程中出错:", error);
  } finally {
    await blockRepo.close();
  }
}
//#endregion

//#region ─────────────────────────── 6. Entry ────────────────────────────────
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
//#endregion

