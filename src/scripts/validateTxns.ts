import { parse, CastingContext } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

// 定义类型
interface Transaction {
  Txhash: string;
  Blockno: string;
  ContractAddress: string;
  'Value_IN(ETH)': number;
  'Value_OUT(ETH)': number;
  'TxnFee(ETH)': number;
  Status?: string;
  ErrCode?: string;
  Method?: string;
}

interface ValidationResult {
  txHash: string;
  block: string;
  contract: string;
  inputAmount: number;
  expectedOutput: number;
  actualOutput: number | null;
  match: boolean;
  error: string | null;
  gasUsed: number;
}

// 定义合约接口
interface CounterContract extends ethers.BaseContract {
  V3Swap: {
    (token: string, amount: bigint, direction: boolean): Promise<bigint>;
  };
}

// 配置参数
const CSV_PATHS = [
  '/Users/coldcoconut/Documents/GitHub/base_arb_research/data/1.csv',
  '/Users/coldcoconut/Documents/GitHub/base_arb_research/data/2.csv',
  '/Users/coldcoconut/Documents/GitHub/base_arb_research/data/3.csv'
];
const RPC_URL = process.env.BASE_HTTP_URL3 || 'http://localhost:8545'; // 使用环境变量或本地节点
const OUTPUT_DIR = '/Users/coldcoconut/Documents/GitHub/base_arb_research/artifacts';
const BLOCK_RANGE = { start: 27390527n, end: 27402527n };

// 创建输出目录
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. 加载所有CSV数据
const loadAllTransactions = (): Transaction[] => {
  return CSV_PATHS.flatMap(csvPath => {
    console.log(`Loading ${csvPath}...`);
    const data = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(data, {
      columns: true,
      skip_empty_lines: true,
      cast: (value: string, context: CastingContext) => {
        if (context.column === 'Value_IN(ETH)' || 
            context.column === 'Value_OUT(ETH)' ||
            context.column === 'TxnFee(ETH)') {
          return parseFloat(value) || 0;
        }
        return value;
      }
    });
    
    return records.filter((tx: Transaction) => 
      !tx.Status && !tx.ErrCode && tx.Method === 'Transfer'
    );
  });
};

// 2. 交易验证函数
const validateTransaction = async (
  provider: ethers.JsonRpcProvider,
  tx: Transaction,
  counter: CounterContract
): Promise<ValidationResult> => {
  const result: ValidationResult = {
    txHash: tx.Txhash,
    block: tx.Blockno,
    contract: tx.ContractAddress,
    inputAmount: tx['Value_IN(ETH)'],
    expectedOutput: tx['Value_OUT(ETH)'],
    actualOutput: null,
    match: false,
    error: null,
    gasUsed: tx['TxnFee(ETH)']
  };

  try {
    // 分叉到交易区块
    await provider.send('anvil_reset', [{
      forking: { 
        jsonRpcUrl: RPC_URL,
        blockNumber: Number(tx.Blockno) 
      }
    }]);

    // 模拟交易
    const inputAmountWei = ethers.parseEther(tx['Value_IN(ETH)'].toString());
    const actualOutputWei = await counter.V3Swap(
      tx.ContractAddress,
      inputAmountWei,
      true // 根据实际方向调整
    );

    // 转换单位并比较
    result.actualOutput = parseFloat(ethers.formatEther(actualOutputWei));
    result.match = Math.abs(result.actualOutput - result.expectedOutput) < 1e-6; // 允许微小浮点误差
    
  } catch (err: any) {
    result.error = err.message;
  }

  return result;
};

// 3. 主执行函数
const main = async () => {
  console.log('Starting validation...');
  
  // 初始化
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = await provider.getSigner();
  
  // 这里需要替换为实际的Counter合约ABI
  const counterAbi = [
    "function V3Swap(address token, uint256 amount, bool direction) external returns (uint256)"
  ];
  const counterBytecode = "0x608060405234801561001057600080fd5b50610291806100206000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c80636b0f8c6d14610030575b600080fd5b61004a600480360381019061004591906100f6565b610060565b60405161005791906101a0565b60405180910390f35b60008373ffffffffffffffffffffffffffffffffffffffff1663095ea7b3306040518163ffffffff1660e01b8152600401602060405180830381600087803b1580156100ab57600080fd5b505af11580156100bf573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906100e391906100c9565b50819050949350505050565b60008060006060848603121561010b57600080fd5b600061011986828701610156565b935050602061012a86828701610182565b925050604061013b86828701610142565b9150509250925092565b60008115159050919050565b6000819050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101818261015c565b9050919050565b60006101948261014d565b9050919050565b60006101a68261014d565b9050919050565b60006101b88261014d565b9050919050565b60006101ca8261014d565b9050919050565b60006101dc8261014d565b9050919050565b60006101ee8261014d565b9050919050565b60006102008261014d565b9050919050565b60006102128261014d565b9050919050565b60006102248261014d565b9050919050565b60006102368261014d565b9050919050565b60006102488261014d565b9050919050565b600061025a8261014d565b9050919050565b600061026c8261014d565b9050919050565b600061027e8261014d565b9050919050565b60006102908261014d565b905091905056fea2646970667358221220f3f8f2f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f364736f6c63430008000033";

  const Counter = new ethers.ContractFactory(counterAbi, counterBytecode, signer);
  const counter = await Counter.deploy() as CounterContract;
  await counter.waitForDeployment();

  // 加载交易数据
  const transactions = loadAllTransactions();
  console.log(`Total transactions to validate: ${transactions.length}`);

  // 并行验证（限制并发数）
  const BATCH_SIZE = 5;
  const results: ValidationResult[] = [];
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(tx => validateTransaction(provider, tx, counter))
    );
    results.push(...batchResults);
    console.log(`Processed ${Math.min(i + BATCH_SIZE, transactions.length)}/${transactions.length}`);
  }

  // 生成报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportJson = path.join(OUTPUT_DIR, `validation-${timestamp}.json`);
  const reportCsv = path.join(OUTPUT_DIR, `validation-${timestamp}.csv`);

  fs.writeFileSync(reportJson, JSON.stringify(results, null, 2));
  
  // CSV报告
  const csvHeader = Object.keys(results[0]).join(',');
  const csvRows = results.map(r => Object.values(r).join(','));
  fs.writeFileSync(reportCsv, [csvHeader, ...csvRows].join('\n'));

  // 打印摘要
  const passed = results.filter(r => r.match).length;
  const failed = results.filter(r => !r.match);
  console.log(`
    ========== 验证结果 ==========
    总交易数: ${transactions.length}
    验证通过: ${passed}
    验证失败: ${failed.length}
    成功率: ${(passed / transactions.length * 100).toFixed(2)}%
    报告已保存至:
    - JSON: ${reportJson}
    - CSV: ${reportCsv}
  `);

  // 输出失败详情
  if (failed.length > 0) {
    console.log('\n失败交易分析:');
    failed.slice(0, 5).forEach(f => {
      console.log(`
      TxHash: ${f.txHash}
      预期输出: ${f.expectedOutput}
      实际输出: ${f.actualOutput ?? 'N/A'}
      误差: ${f.actualOutput ? Math.abs(f.expectedOutput - f.actualOutput) : 'N/A'}
      错误: ${f.error || '输出不匹配'}
      `);
    });
  }
};

main().catch(console.error);

