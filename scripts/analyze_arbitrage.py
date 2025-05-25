import json
import os
import argparse
from collections import defaultdict
from typing import Dict, List, Set, Tuple
from dataclasses import dataclass
from pathlib import Path

@dataclass
class TxExample:
    tx_hash: str
    block_number: int
    input_data: str
    type: str
    profit: float = 0.0

@dataclass
class SearcherStats:
    total_txs: int = 0
    inter_txs: int = 0
    begin_txs: int = 0
    empty_input_count: int = 0
    total_gas_cost: int = 0
    example_txs: List[TxExample] = None
    weth_profits: List[float] = None
    total_profit: float = 0.0

    def __post_init__(self):
        if self.example_txs is None:
            self.example_txs = []
        if self.weth_profits is None:
            self.weth_profits = []

    @property
    def avg_gas_cost(self) -> float:
        return self.total_gas_cost / self.total_txs if self.total_txs > 0 else 0

WETH_ADDRESS = "0x4200000000000000000000000000000000000006"

def analyze_arbitrage_files(directory: str, output_file: str = None):
    # 获取所有文件并按名称排序
    files = sorted([f for f in os.listdir(directory) if f.startswith('arbitrage_blocks_') and f.endswith('.json')])
    
    if not files:
        print("没有找到套利数据文件")
        return

    # 获取区块范围
    first_file = files[0]
    last_file = files[-1]
    start_block = int(first_file.split('_')[2])
    end_block = int(last_file.split('_')[3].split('.')[0])
    
    print(f"分析区块范围: {start_block} - {end_block}")
    
    # 用于存储每个searcher的统计信息
    searcher_stats: Dict[str, SearcherStats] = defaultdict(SearcherStats)
    
    # 处理每个文件
    for file_name in files:
        file_path = os.path.join(directory, file_name)
        print(f"处理文件: {file_name}")
        
        with open(file_path, 'r') as f:
            data = json.load(f)
            
            for block in data.get('blocks', []):
                block_number = block.get('blockNumber', 0)
                for tx in block.get('arbitrageTxs', []):
                    to_address = tx.get('to', '').lower()
                    if not to_address:
                        continue
                    
                    stats = searcher_stats[to_address]
                    stats.total_txs += 1
                    
                    # 统计gas成本
                    stats.total_gas_cost += int(tx.get('gasUsed', 0))
                    
                    # 检查是否是空input
                    if tx.get('isEmptyInput', False):
                        stats.empty_input_count += 1
                    
                    # 收集示例交易
                    if len(stats.example_txs) < 5 and tx.get('input'):
                        profit = tx.get('profit', {})
                        profit_amount = float(profit.get('formattedAmount', 0)) if profit.get('token') == WETH_ADDRESS else 0
                        stats.example_txs.append(TxExample(
                            tx_hash=tx.get('txHash', ''),
                            block_number=block_number,
                            input_data=tx.get('input', ''),
                            type=tx.get('type', ''),
                            profit=profit_amount
                        ))
                    
                    # 检查是否是inter或begin交易
                    if tx.get('type') == 'inter':
                        stats.inter_txs += 1
                    elif tx.get('type') == 'begin':
                        stats.begin_txs += 1
                    
                    # 检查WETH利润
                    profit = tx.get('profit', {})
                    if profit.get('token') == WETH_ADDRESS:
                        profit_amount = float(profit.get('formattedAmount', 0))
                        stats.weth_profits.append(profit_amount)
                        stats.total_profit += profit_amount
    
    # 准备输出内容
    output_lines = []
    inter_begin_lines = []
    
    output_lines.append("\n分析结果:")
    output_lines.append("=" * 80)
    
    # 添加总体统计
    total_searchers = len(searcher_stats)
    total_txs = sum(stats.total_txs for stats in searcher_stats.values())
    total_profit = sum(stats.total_profit for stats in searcher_stats.values())
    
    output_lines.append(f"\n总体统计:")
    output_lines.append(f"总Searcher数量: {total_searchers}")
    output_lines.append(f"总交易数: {total_txs}")
    output_lines.append(f"总WETH利润: {total_profit:,.8f} ETH")
    output_lines.append(f"平均每个Searcher交易数: {total_txs/total_searchers:,.2f}")
    output_lines.append(f"平均每个Searcher利润: {total_profit/total_searchers:,.8f} ETH")
    
    # 按交易数排序的前10个searcher
    output_lines.append("\n按交易数排序的前10个Searcher:")
    output_lines.append("-" * 80)
    for searcher, stats in sorted(searcher_stats.items(), key=lambda x: x[1].total_txs, reverse=True)[:10]:
        output_lines.append(f"Searcher: {searcher}")
        output_lines.append(f"交易数: {stats.total_txs}, WETH利润: {stats.total_profit:,.8f} ETH")
    
    # 按利润排序的前10个searcher
    output_lines.append("\n按WETH利润排序的前10个Searcher:")
    output_lines.append("-" * 80)
    for searcher, stats in sorted(searcher_stats.items(), key=lambda x: x[1].total_profit, reverse=True)[:10]:
        output_lines.append(f"Searcher: {searcher}")
        output_lines.append(f"WETH利润: {stats.total_profit:,.8f} ETH, 交易数: {stats.total_txs}")
    
    output_lines.append("\n详细统计:")
    output_lines.append("=" * 80)
    
    # 详细统计信息
    for searcher, stats in sorted(searcher_stats.items(), key=lambda x: x[1].total_txs, reverse=True):
        # 准备searcher的统计信息
        searcher_lines = []
        searcher_lines.append(f"\nSearcher Contract: {searcher}")
        searcher_lines.append(f"总交易数: {stats.total_txs}")
        searcher_lines.append(f"Inter交易数: {stats.inter_txs}")
        searcher_lines.append(f"Begin交易数: {stats.begin_txs}")
        searcher_lines.append(f"空Input交易数: {stats.empty_input_count}")
        searcher_lines.append(f"平均Gas成本: {stats.avg_gas_cost:,.0f}")
        searcher_lines.append(f"WETH利润交易数: {len(stats.weth_profits)}")
        if stats.weth_profits:
            searcher_lines.append(f"WETH总利润: {stats.total_profit:,.8f} ETH")
            searcher_lines.append(f"平均每笔利润: {stats.total_profit/len(stats.weth_profits):,.8f} ETH")
        
        searcher_lines.append("\n示例交易:")
        for i, tx in enumerate(stats.example_txs[:5], 1):
            searcher_lines.append(f"{i}. 交易哈希: {tx.tx_hash}")
            searcher_lines.append(f"   区块号: {tx.block_number}")
            searcher_lines.append(f"   交易类型: {tx.type}")
            searcher_lines.append(f"   利润: {tx.profit:,.8f} ETH")
            searcher_lines.append(f"   Input: {tx.input_data}")
        
        # 如果inter交易数大于begin交易数，添加到inter_begin_lines
        if stats.inter_txs > stats.begin_txs:
            inter_begin_lines.extend(searcher_lines)
            inter_begin_lines.append("\n" + "=" * 80)
        
        # 添加到主输出
        output_lines.extend(searcher_lines)
    
    # 输出主结果
    output_content = "\n".join(output_lines)
    print(output_content)
    
    # 如果指定了输出文件，则写入文件
    if output_file:
        with open(output_file, 'w') as f:
            f.write(output_content)
        print(f"\n分析结果已保存到: {output_file}")
        
        # 保存inter > begin的searcher信息
        inter_begin_file = output_file.replace('.txt', '_inter_begin.txt')
        with open(inter_begin_file, 'w') as f:
            f.write("\n".join(inter_begin_lines))
        print(f"Inter > Begin的Searcher信息已保存到: {inter_begin_file}")

def main():
    parser = argparse.ArgumentParser(description='分析套利交易数据')
    parser.add_argument('--data-dir', type=str, default='../data/block_range_analysis',
                      help='数据文件目录路径')
    parser.add_argument('--output', type=str, default=None,
                      help='输出文件路径（可选）')
    
    args = parser.parse_args()
    
    # 获取脚本所在目录的绝对路径
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # 构建数据目录的绝对路径
    data_dir = os.path.abspath(os.path.join(script_dir, args.data_dir))
    
    analyze_arbitrage_files(data_dir, args.output)

if __name__ == "__main__":
    main() 