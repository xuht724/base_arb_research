# 以太坊套利数据分析指南

本指南将帮助您使用 `ArbHelper` 类分析以太坊（Base链）一个月的套利数据。

## 前置要求

### 1. 安装依赖
```bash
npm install axios
```

### 2. 配置API密钥

您需要以下API密钥：

- **Alchemy API Key**: 用于访问Base链RPC节点
  - 注册地址: https://www.alchemy.com/
  - 创建Base Mainnet应用并获取API密钥

- **The Graph API Key**: 用于查询UniswapV4池信息
  - 注册地址: https://thegraph.com/
  - 获取API密钥

### 3. 设置环境变量

创建 `.env` 文件：
```bash
# RPC Configuration
RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# The Graph API Key  
THE_GRAPH_API_KEY=YOUR_GRAPH_API_KEY

# Analysis Configuration (可选)
DAYS_TO_ANALYZE=30
BLOCKS_PER_DAY=43200
MAX_BLOCKS_PER_BATCH=10
BATCH_DELAY_MS=2000
```

## 运行分析

### 方法1: 使用预构建的月度分析脚本

```bash
# 分析最近30天的数据
npx ts-node src/scripts/analyze-monthly-arbitrage.ts

# 从指定区块开始分析
npx ts-node src/scripts/analyze-monthly-arbitrage.ts 12345678
```

### 方法2: 自定义分析脚本

创建您自己的分析脚本：

```typescript
import { ArbHelper } from './src/lib/chain/arb.helper';

async function customAnalysis() {
  // 初始化ArbHelper
  const arbHelper = new ArbHelper(
    'https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY',
    'YOUR_GRAPH_API_KEY'
  );
  
  // 分析单个区块
  const blockNumber = 12345678;
  const blockData = await arbHelper.getBlockWithReceipts(blockNumber);
  
  if (blockData) {
    const result = await arbHelper.analyzeBlock(
      blockData.blockNumber,
      blockData.timestamp,
      blockData.transactions,
      blockData.receipts
    );
    
    console.log('分析结果:', result);
  }
}

customAnalysis();
```

## 输出文件

分析完成后，结果将保存在 `data/monthly-analysis/` 目录下：

### 1. 每日统计文件
- `daily-arbitrage-stats.json`: 每日套利统计数据

### 2. 月度总结文件  
- `monthly-arbitrage-summary.json`: 月度套利总结报告

### 3. 区块详细数据
- `block-{blockNumber}.json`: 每个区块的详细分析结果

## 分析结果说明

### 套利交易信息
```typescript
interface ArbitrageInfo {
  type: 'begin' | 'inter';           // 套利类型：开始型或中间型
  isBackrun: boolean;                // 是否为backrun套利
  arbitrageCycles: ArbitrageCycle[]; // 套利环路
  cyclesLength: number;              // 环路数量
  profit: {                          // 利润信息
    token: string;                   // 利润代币地址
    amount: string;                  // 利润数量
  };
  interInfo?: Array<{               // 中间型套利的触发信息
    txHash: string;
    poolAddress: string;
    transactionIndex: number;
  }>;
}
```

### 交易事件信息
```typescript
interface StandardSwapEvent {
  poolAddress: string;    // 池子地址
  protocol: string;       // 协议名称
  tokenIn: string;        // 输入代币
  tokenOut: string;       // 输出代币
  amountIn: bigint;       // 输入数量
  amountOut: bigint;      // 输出数量
  sender: string;         // 发送者
  recipient: string;      // 接收者
  ethFlag?: boolean;      // 是否涉及ETH
}
```

## 支持的协议

当前支持以下DEX协议的套利分析：

- **Uniswap V2/V3**
- **Aerodrome V2/V3** 
- **PancakeSwap V3**
- **Curve Finance** (多种池类型)
- **Balancer V2**
- **UniswapV4** (实验性支持)

## 支持的Curve事件类型

- `CurveTokenExchange`: 标准Curve交换事件 (int128 IDs)
- `CurveTokenExchange2`: 使用uint256 IDs的交换事件
- `CurveTokenExchange3`: 包含费用和价格信息的交换事件

## 性能优化建议

### 1. 批处理配置
- `MAX_BLOCKS_PER_BATCH`: 每批处理的区块数（建议10-20）
- `BATCH_DELAY_MS`: 批次间延迟（建议2000-5000ms）

### 2. 内存管理
- 大量数据分析时建议增加Node.js内存限制：
```bash
node --max-old-space-size=8192 dist/scripts/analyze-monthly-arbitrage.js
```

### 3. 网络优化
- 使用高质量的RPC提供商
- 考虑使用多个RPC端点进行负载均衡

## 故障排除

### 常见错误

1. **RPC限制错误**
   - 减少 `MAX_BLOCKS_PER_BATCH`
   - 增加 `BATCH_DELAY_MS`

2. **内存不足**
   - 增加Node.js内存限制
   - 减少分析的天数

3. **API密钥错误**
   - 检查环境变量设置
   - 确认API密钥有效性

### 调试模式

启用详细日志：
```bash
DEBUG=* npx ts-node src/scripts/analyze-monthly-arbitrage.ts
```

## 数据分析示例

### 查看套利统计
```typescript
// 读取月度总结
const summary = JSON.parse(fs.readFileSync('data/monthly-analysis/monthly-arbitrage-summary.json', 'utf8'));

console.log('套利率:', summary.overallStats.arbitrageRate);
console.log('总利润:', summary.overallStats.totalProfitWETH);
console.log('热门协议:', summary.topProtocols);
```

### 分析特定交易
```typescript
// 读取区块数据
const blockData = JSON.parse(fs.readFileSync('data/monthly-analysis/block-12345678.json', 'utf8'));

// 筛选套利交易
const arbitrageTxs = blockData.transactions.filter(tx => tx.arbitrageInfo);
console.log('套利交易:', arbitrageTxs);
```

## 扩展功能

### 添加新的DEX协议
1. 在 `events.ts` 中添加新的事件主题
2. 在 `arb.helper.ts` 的 `parseSwapEvent` 方法中添加解析逻辑
3. 更新协议识别逻辑

### 自定义分析指标
1. 修改 `calculateDailyStats` 函数
2. 添加新的统计维度
3. 更新输出格式

## 注意事项

1. **数据量**: 一个月的完整分析可能产生大量数据，请确保有足够的存储空间
2. **API限制**: 注意RPC提供商的请求限制，适当调整批处理参数
3. **网络稳定性**: 长时间运行需要稳定的网络连接
4. **成本**: 大量API调用可能产生费用，请注意监控使用量

## 联系支持

如果遇到问题，请检查：
1. 环境变量配置
2. API密钥有效性
3. 网络连接状态
4. Node.js版本兼容性 