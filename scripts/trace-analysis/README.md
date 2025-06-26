# Trace分析工具

这个工具用于分析以太坊交易的trace数据，可以帮助我们理解交易的执行流程和内部调用。

## 功能特点

- 解析交易trace数据
- 识别内部调用和函数调用
- 分析池子信息和代币交互
- 输出详细的调用树和参数信息

## 使用方法

1. 设置环境变量（可选）：
```bash
export RPC_URL="你的RPC节点URL"
export THE_GRAPH_API_KEY="你的The Graph API密钥"
```

2. 运行分析脚本：
```bash
ts-node analyze-trace.ts <trace文件路径>
```

例如：
```bash
ts-node analyze-trace.ts ../../data/trace/0x6f0f0298782190d84304a9aacc9504f9ecec8b60481973e623c1ecb5882c9820.json
```

## 输出说明

脚本会生成两个文件：
1. 原始trace文件
2. 分析后的结果文件（文件名后缀为`-analyzed.json`）

分析结果包含以下信息：
- 交易发起地址
- 交易目标地址
- 函数名称
- Gas使用量
- 内部调用信息
- 池子信息（如果涉及DEX交互）

## 注意事项

1. 确保有足够的RPC节点访问权限
2. 对于复杂的交易，分析可能需要一些时间
3. 某些特殊的合约调用可能无法完全解析 