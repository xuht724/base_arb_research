import json
import os
import requests
from typing import Dict, List, Any
import time
from dataclasses import dataclass
from datetime import datetime
from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

@dataclass
class SwapEvent:
    tokenIn: str
    tokenOut: str
    amountIn: str
    amountOut: str
    poolAddress: str
    protocol: str

@dataclass
class InputAnalysis:
    pathAnalysis: Dict[str, Any]
    tokenAnalysis: Dict[str, Any]
    amounts: Dict[str, List[Dict[str, Any]]]

@dataclass
class ArbitrageCycle:
    edges: List[Dict[str, Any]]
    profitToken: str
    profitAmount: str
    tokenChanges: Dict[str, str]

@dataclass
class ArbitrageInfo:
    type: str
    isBackrun: bool
    arbitrageCycles: List[ArbitrageCycle]
    cyclesLength: int
    profit: Dict[str, str]
    interInfo: List[Dict[str, Any]]

@dataclass
class ArbitrageTransaction:
    txHash: str
    blockNumber: int
    txIndex: int
    profit: str
    type: str
    input: str
    from_address: str  # 改名避免与Python关键字冲突
    to: str
    gasUsed: str
    gasPrice: str
    addressTokenChanges: List[Dict[str, Any]]
    swapEvents: List[SwapEvent]
    arbitrageInfo: ArbitrageInfo
    inputAnalysis: List[InputAnalysis]

class SearcherInputAnalyzer:
    def __init__(self, api_key: str, api_url: str, model: str = "anthropic/claude-3-opus-20240229"):
        self.api_key = api_key
        self.api_url = api_url
        self.model = model
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def load_analysis_data(self, file_path: str) -> Dict[str, Any]:
        """加载分析数据文件"""
        with open(file_path, 'r') as f:
            return json.load(f)

    def convert_swap_events(self, events_data: List[Dict[str, Any]]) -> List[SwapEvent]:
        """转换swap事件数据"""
        return [SwapEvent(**event) for event in events_data]

    def convert_input_analysis(self, analysis_data: List[Dict[str, Any]]) -> List[InputAnalysis]:
        """转换input分析数据"""
        return [InputAnalysis(**analysis) for analysis in analysis_data]

    def convert_arbitrage_cycles(self, cycles_data: List[Dict[str, Any]]) -> List[ArbitrageCycle]:
        """转换套利周期数据"""
        return [ArbitrageCycle(**cycle) for cycle in cycles_data]

    def convert_arbitrage_info(self, info_data: Dict[str, Any]) -> ArbitrageInfo:
        """转换套利信息数据"""
        # 转换套利周期
        cycles = self.convert_arbitrage_cycles(info_data.get('arbitrageCycles', []))
        # 创建ArbitrageInfo对象
        return ArbitrageInfo(
            type=info_data.get('type', 'unknown'),  # 添加默认值
            isBackrun=info_data.get('isBackrun', False),  # 添加默认值
            arbitrageCycles=cycles,
            cyclesLength=info_data['cyclesLength'],
            profit=info_data['profit'],
            interInfo=info_data.get('interInfo', [])
        )

    def convert_transaction(self, tx_data: Dict[str, Any]) -> ArbitrageTransaction:
        """转换交易数据"""
        # 处理from字段
        tx_data['from_address'] = tx_data.pop('from')
        # 转换swap事件
        tx_data['swapEvents'] = self.convert_swap_events(tx_data['swapEvents'])
        # 转换input分析
        tx_data['inputAnalysis'] = self.convert_input_analysis(tx_data['inputAnalysis'])
        # 转换套利信息
        tx_data['arbitrageInfo'] = self.convert_arbitrage_info(tx_data['arbitrageInfo'])
        # 创建交易对象
        return ArbitrageTransaction(**tx_data)

    def format_swap_events(self, events: List[SwapEvent]) -> str:
        """格式化swap事件为易读的字符串"""
        formatted = "Swap Events:\n"
        for i, event in enumerate(events, 1):
            formatted += f"{i}. {event.protocol} Swap:\n"
            formatted += f"   From: {event.tokenIn}\n"
            formatted += f"   To: {event.tokenOut}\n"
            formatted += f"   Amount In: {event.amountIn}\n"
            formatted += f"   Amount Out: {event.amountOut}\n"
            formatted += f"   Pool: {event.poolAddress}\n"
        return formatted

    def format_arbitrage_info(self, info: ArbitrageInfo) -> str:
        """格式化套利信息为易读的字符串"""
        formatted = "Arbitrage Info:\n"
        formatted += f"Cycles Length: {info.cyclesLength}\n"
        formatted += f"Profit: {info.profit['amount']} ({info.profit['token']})\n"
        
        formatted += "\nArbitrage Cycles:\n"
        for i, cycle in enumerate(info.arbitrageCycles, 1):
            formatted += f"\nCycle {i}:\n"
            for j, edge in enumerate(cycle.edges, 1):
                formatted += f"  Step {j}:\n"
                formatted += f"    From: {edge['tokenIn']}\n"
                formatted += f"    To: {edge['tokenOut']}\n"
                formatted += f"    Amount In: {edge['amountIn']}\n"
                formatted += f"    Amount Out: {edge['amountOut']}\n"
                formatted += f"    Pool: {edge['poolAddress']}\n"
                formatted += f"    Protocol: {edge['protocol']}\n"
        
        return formatted

    def format_input_analysis(self, analysis: InputAnalysis) -> str:
        """格式化input分析结果为易读的字符串"""
        formatted = "Input Analysis:\n"
        formatted += f"Paths Found: {analysis.pathAnalysis['found']}/{analysis.pathAnalysis['total']}\n"
        formatted += f"Tokens Found: {analysis.tokenAnalysis['found']}/{analysis.tokenAnalysis['total']}\n"
        
        formatted += "\nPath Details:\n"
        for path, count in analysis.pathAnalysis['details'].items():
            formatted += f"  {path}: {count}\n"
        
        formatted += "\nToken Details:\n"
        for token, count in analysis.tokenAnalysis['details'].items():
            formatted += f"  {token}: {count}\n"
        
        formatted += "\nAmounts:\n"
        formatted += "Input Amounts:\n"
        for amount in analysis.amounts['inputAmounts']:
            formatted += f"  {amount['amount']} (Found: {amount['found']})\n"
            if 'hexFormat' in amount:
                formatted += f"    Hex: {amount['hexFormat']}\n"
        
        formatted += "\nOutput Amounts:\n"
        for amount in analysis.amounts['outputAmounts']:
            formatted += f"  {amount['amount']} (Found: {amount['found']})\n"
            if 'hexFormat' in amount:
                formatted += f"    Hex: {amount['hexFormat']}\n"
        
        return formatted

    def create_prompt(self, txs: List[ArbitrageTransaction]) -> str:
        """创建用于分析多个交易的prompt"""
        prompt = f"""作为一个区块链交易分析专家，请分析以下套利交易的input数据。我会提供多个交易作为参考，请用中文回答，并按照以下格式输出：

1. 推测的input数据结构（使用方括号表示每个字段的字节长度）：
[字段1长度] [字段2长度] [字段3长度] ...

如果无法推测出完整结构，请说明原因：
- 原因1
- 原因2
...

2. 字段解释：
- 字段1：xxx
- 字段2：xxx
...

3. 总结：
- 关键发现1
- 关键发现2
...
- 如果无法推测结构，请说明：
  * 可能的原因
  * 需要哪些额外信息
  * 建议的下一步分析方向

请保持回答简洁准确，避免冗余信息。

交易数量: {len(txs)}

"""

        for i, tx in enumerate(txs, 1):
            prompt += f"\n交易 {i}:\n"
            prompt += f"TX Hash: {tx.txHash}\n"
            prompt += f"Block Number: {tx.blockNumber}\n"
            prompt += f"Transaction Index: {tx.txIndex}\n"
            prompt += f"Profit: {tx.profit}\n"
            prompt += f"Gas Used: {tx.gasUsed}\n"
            prompt += f"Gas Price: {tx.gasPrice}\n\n"

            prompt += self.format_arbitrage_info(tx.arbitrageInfo)
            prompt += "\n"
            prompt += self.format_swap_events(tx.swapEvents)
            prompt += "\n"
            prompt += self.format_input_analysis(tx.inputAnalysis[0])
            prompt += "\n"
            prompt += f"原始Input数据:\n{tx.input}\n"
            prompt += "="*80 + "\n"

        return prompt

    def analyze_transactions(self, txs: List[ArbitrageTransaction]) -> Dict[str, Any]:
        """使用大模型分析多个交易"""
        prompt = self.create_prompt(txs)
        
        # 打印prompt
        print("\n" + "="*80)
        print("Prompt:")
        print("="*80)
        print(prompt)
        print("="*80 + "\n")
        
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.3,  # 降低温度以获得更稳定的输出
            "max_tokens": 40000,  # 增加token限制以允许更详细的分析
            "top_p": 0.95,      # 添加top_p参数以控制输出的多样性
            "frequency_penalty": 0.1,  # 轻微惩罚重复内容
            "presence_penalty": 0.1    # 轻微鼓励新内容
        }

        try:
            response = requests.post(self.api_url, headers=self.headers, json=payload)
            response.raise_for_status()
            result = response.json()
            return {
                "txHashes": [tx.txHash for tx in txs],
                "analysis": result["choices"][0]["message"]["content"],
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            print(f"分析交易时出错: {str(e)}")
            return None

    def analyze_searcher(self, searcher_address: str, analysis_data: Dict[str, Any], max_txs: int = 5) -> List[Dict[str, Any]]:
        """分析特定searcher的示例交易
        
        Args:
            searcher_address: searcher的地址
            analysis_data: 分析数据
            max_txs: 最大分析交易数量，默认5笔
        """
        if searcher_address not in analysis_data["searchers"]:
            print(f"未找到地址 {searcher_address} 的数据")
            return []

        searcher_data = analysis_data["searchers"][searcher_address]
        results = []

        try:
            # 转换所有交易数据
            txs = []
            for tx_data in searcher_data["exampleTxs"][:max_txs]:
                tx = self.convert_transaction(tx_data)
                txs.append(tx)
            
            # 一次性分析所有交易
            result = self.analyze_transactions(txs)
            if result:
                results.append(result)
            
        except Exception as e:
            print(f"处理searcher {searcher_address} 的交易时出错: {str(e)}")

        return results

    def save_analysis_results(self, results: List[Dict[str, Any]], output_file: str, searcher_data: Dict[str, Any]):
        """保存分析结果到文件"""
        # 保存纯文本格式
        txt_file = output_file
        with open(txt_file, 'w', encoding='utf-8') as f:
            # 写入 searcher 统计信息
            f.write("Searcher 统计信息:\n")
            f.write(f"总交易数: {searcher_data['totalTxs']}\n")
            f.write(f"Inter 交易数: {searcher_data['interTxs']}\n")
            f.write(f"Begin 交易数: {searcher_data['beginTxs']}\n")
            
            # 计算并格式化 WETH 利润
            weth_profit = float(searcher_data['wethProfit']) / 1e18  # 转换为 WETH 单位
            f.write(f"总 WETH 利润: {weth_profit:.4f} WETH\n")
            
            # 计算平均每笔交易利润
            avg_profit = weth_profit / searcher_data['totalTxs']
            f.write(f"平均每笔交易利润: {avg_profit:.6f} WETH\n")
            f.write("="*80 + "\n\n")
            
            # 写入分析结果
            for result in results:
                f.write(f"分析时间: {result['timestamp']}\n")
                f.write("="*80 + "\n")
                f.write(result['analysis'])
                f.write("\n" + "="*80 + "\n\n")

def main():
    # 配置
    API_KEY = os.getenv("OPENROUTER_API_KEY")
    API_URL = "https://openrouter.ai/api/v1/chat/completions"
    MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-pro-preview")
    ANALYSIS_FILE = "data/arbitrage_analysis/inter_dominant_analysis.json"
    OUTPUT_DIR = "data/searcher_analysis"
    MAX_TXS = int(os.getenv("MAX_TXS", "5"))  # 每个searcher最多分析的交易数

    if not API_KEY:
        print("请设置 OPENROUTER_API_KEY 环境变量")
        return

    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 初始化分析器
    analyzer = SearcherInputAnalyzer(API_KEY, API_URL, MODEL)

    # 加载分析数据
    analysis_data = analyzer.load_analysis_data(ANALYSIS_FILE)

    # 分析每个searcher
    for searcher_address in list(analysis_data["searchers"].keys())[:5]:
        print(f"\n分析 searcher: {searcher_address}")
        results = analyzer.analyze_searcher(searcher_address, analysis_data, MAX_TXS)
        
        if results:
            output_file = os.path.join(OUTPUT_DIR, f"{searcher_address}_analysis.txt")
            analyzer.save_analysis_results(results, output_file, analysis_data["searchers"][searcher_address])
            print(f"分析结果已保存到: {output_file}")

if __name__ == "__main__":
    main() 