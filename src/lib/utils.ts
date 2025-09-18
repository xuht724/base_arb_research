import { logTopicsMap } from "src/common/events";

export function replacer(key: string, value: any): any {
  if (typeof value === "bigint") {
    return value.toString();
  } else if (value instanceof Map) {
    // Convert Map to a plain object
    const obj: { [key: string]: any } = {};
    value.forEach((v, k) => {
      obj[k.toString()] = v;
    });
    return obj;
  }
  return value;
}
export function reviver(key: string, value: any): any {
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value); // 将纯数字字符串替换成 bigint
  } else if (typeof value === "object") {
    // 递归调用 reviver 函数，处理嵌套的对象
    for (const k in value) {
      if (value.hasOwnProperty(k)) {
        value[k] = reviver(k, value[k]);
      }
    }
  }
  return value;
}
// 简化打印
const short = (x?: string, n = 6) => x ? `${x.slice(0,2+n)}…${x.slice(-n)}` : String(x);

// 识别系统/存款交易（不会阻断，只用于打标记）
const SYSTEM_FROM = '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0001';
const SYSTEM_TO_PREFIX = '0x420000000000000000000000000000000000';
function looksSystemOrDeposit(tx: any, receipt?: any) {
  const fromSys = tx?.from?.toLowerCase?.() === SYSTEM_FROM;
  const toSystem = tx?.to?.toLowerCase?.().startsWith(SYSTEM_TO_PREFIX);
  const isDepositType = tx?.type === 'deposit' || tx?.type === '0x7e';
  const hasDepositNonce = receipt && 'depositNonce' in receipt;
  const noSig = (tx?.r === '0x0' && tx?.s === '0x0' && (tx?.v === '0' || tx?.v === 0));
  return isDepositType || fromSys || toSystem || hasDepositNonce || noSig;
}

// 从你的 logTopicsMap（或手动列表）收集“已知的 Swap 事件 topic0”
function buildKnownSwapTopics(): Set<string> {
  const topics = new Set<string>();
  // 如果 logTopicsMap 里有 swap 事件签名，按你的结构加进去：
  try {
    // 示例：logTopicsMap.dex.uniswapV2.Swap = '0xd78a...'
    for (const ns of Object.values<any>(logTopicsMap || {})) {
      for (const maybe of Object.values<any>(ns || {})) {
        if (typeof maybe === 'string' && maybe.startsWith('0x') && maybe.length === 66) {
          topics.add(maybe.toLowerCase());
        }
      }
    }
  } catch {}
  // 没有映射也没关系，可临时硬编码常见的：
  topics.add('0xd78ad95fa46c994b6551d0da85fc275fe613d...'.slice(0,66).toLowerCase()); // UniswapV2 Swap
  topics.add('0xc42079a1...'.slice(0,66).toLowerCase()); // UniswapV3 Swap
  // TODO: Aerodrome/BaseSwap 的 Swap topic 也加上
  return topics;
}
const KNOWN_SWAP_TOPICS = buildKnownSwapTopics();

// 单条交易的 debug 行
export function debugTxAndReceipt(tx: any, receipt: any, opts: {showLogs?: number} = {}) {
  const idxTx = tx?.transactionIndex ?? tx?.index;
  const idxRc = receipt?.transactionIndex ?? receipt?.txIndex;
  const hashTx = (typeof tx === 'string' ? tx : tx?.hash) || '';
  const logs = receipt?.logs || [];
  const withLogs = Array.isArray(logs) ? logs.length : 0;
  const blockTx = tx?.blockNumber && Number(tx.blockNumber);
  const blockRc = receipt?.blockNumber && (typeof receipt.blockNumber === 'string'
    ? (receipt.blockNumber.startsWith('0x') ? parseInt(receipt.blockNumber, 16) : Number(receipt.blockNumber))
    : Number(receipt.blockNumber));

  const sys = looksSystemOrDeposit(tx, receipt) ? 'SYS' : 'USR';
  const matchIdx = (idxTx ?? null) === (idxRc ?? null);
  const matchBlk = (blockTx && blockRc) ? (Number(blockTx) === Number(blockRc)) : true;

  // 统计“已知的 swap topic”出现次数
  let knownSwapCount = 0;
  if (withLogs) {
    for (const lg of logs) {
      const t0 = lg?.topics?.[0]?.toLowerCase?.();
      if (t0 && KNOWN_SWAP_TOPICS.has(t0)) knownSwapCount++;
    }
  }

  console.log(
    `[TX] ${sys} hash=${short(hashTx)} idx=${idxTx} → receipt=${!!receipt} ` +
    `r.idx=${idxRc} r.logs=${withLogs} knownSwapLogs=${knownSwapCount} ` +
    `idxMatch=${matchIdx} blockMatch=${matchBlk} to=${short(tx?.to)}`
  );

  // 可选：展示前几条日志的地址和 topic0
  const show = Math.min(withLogs, opts.showLogs ?? 0);
  for (let i=0; i<show; i++) {
    const lg = logs[i];
    console.log(`  log[${i}] addr=${short(lg?.address)} topic0=${short(lg?.topics?.[0])}`);
  }

  // 返回给上层做进一步逻辑判断
  return { withLogs, knownSwapCount, matchIdx, matchBlk, isSystem: sys === 'SYS' };
}

// 一个区块的摘要
export function debugBlockSummary(blockNumber: number, txs: any[], receipts: any[]) {
  const txCnt = txs?.length || 0;
  const rcCnt = receipts?.length || 0;
  const txHashes = new Set((txs || []).map(t => (typeof t === 'string' ? t : t.hash)?.toLowerCase?.()).filter(Boolean));
  const rcHashes = new Set((receipts || []).map(r => (r.transactionHash || r.hash)?.toLowerCase?.()).filter(Boolean));
  let intersect = 0;
  for (const h of txHashes) if (rcHashes.has(h)) intersect++;

  console.log(`[BLOCK ${blockNumber}] tx=${txCnt} receipts=${rcCnt} tx∩rc(hash)=${intersect}`);
}
