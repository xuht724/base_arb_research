import json
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
import seaborn as sns
from collections import defaultdict
import numpy as np
from web3 import Web3
from functools import lru_cache

# 设置matplotlib字体
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['axes.unicode_minus'] = False

# ERC20 ABI for symbol
ERC20_ABI = [
    {
        "constant": True,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    }
]

# 初始化Web3
w3 = Web3(Web3.HTTPProvider('https://base-mainnet.core.chainstack.com/1acdea40c9ad7f49fc2be9181c350461'))

# 缓存token symbol查询结果
@lru_cache(maxsize=1000)
def get_token_symbol(token_address):
    try:
        # 检查是否是原生ETH
        if token_address.lower() == "0x4200000000000000000000000000000000000006":
            return "WETH"
            
        # 创建合约实例
        contract = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=ERC20_ABI)
        
        # 调用symbol方法
        symbol = contract.functions.symbol().call()
        return symbol
    except Exception as e:
        print(f"Error getting symbol for token {token_address}: {str(e)}")
        return "UNKNOWN"

def load_transaction_data(file_path):
    with open(file_path, 'r') as f:
        data = json.load(f)
    return data['transactions']

def analyze_daily_profits(transactions):
    # 将数据转换为DataFrame
    df = pd.DataFrame(transactions)
    
    # 转换时间戳为datetime
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df['date'] = df['timestamp'].dt.date
    
    # 按日期分组计算每日交易数和利润
    daily_stats = df.groupby('date').agg({
        'hash': 'count',
        'profit': lambda x: sum(float(p) for p in x)
    }).rename(columns={'hash': 'transaction_count'})
    
    return daily_stats

def analyze_pool_profits(transactions):
    # 创建池子组合利润统计
    pool_set_profits = defaultdict(float)
    pool_set_counts = defaultdict(int)
    pool_set_txs = defaultdict(list)
    pool_set_tokens = defaultdict(set)
    pool_set_protocols = defaultdict(set)
    
    for tx in transactions:
        profit = float(tx['profit'])
        # 将池子列表转换为排序后的元组，作为唯一键
        pool_set = tuple(sorted(tx['involvedPools']))
        pool_set_profits[pool_set] += profit
        pool_set_counts[pool_set] += 1
        
        # 记录token和protocol信息
        pool_set_tokens[pool_set].update(tx['tokens'])
        pool_set_protocols[pool_set].update(tx['involvedProtocols'])
        
        pool_set_txs[pool_set].append({
            'hash': tx['hash'],
            'profit': profit,
            'timestamp': tx['timestamp'],
            'blockNumber': tx['blockNumber'],
            'tokens': tx['tokens'],
            'protocols': tx['involvedProtocols']
        })
    
    # 计算每个pool set的详细统计信息
    pool_stats = []
    for pool_set, txs in pool_set_txs.items():
        profits = [tx['profit'] for tx in txs]
        # 按利润排序交易
        sorted_txs = sorted(txs, key=lambda x: x['profit'], reverse=True)
        
        # 获取token信息
        tokens = list(pool_set_tokens[pool_set])
        token_info = [{
            'address': token,
            'symbol': get_token_symbol(token)
        } for token in tokens]
        
        stats = {
            'pool_set': list(pool_set),
            'total_profit': pool_set_profits[pool_set],
            'transaction_count': pool_set_counts[pool_set],
            'avg_profit': np.mean(profits),
            'median_profit': np.median(profits),
            'max_profit': max(profits),
            'min_profit': min(profits),
            'std_profit': np.std(profits),
            'tokens': token_info,
            'protocols': list(pool_set_protocols[pool_set]),
            'top_transactions': sorted_txs[:5],  # 记录前5笔最大利润的交易
            'daily_stats': {}
        }
        
        # 计算每日统计
        daily_profits = defaultdict(list)
        for tx in txs:
            date = tx['timestamp'].split()[0]
            daily_profits[date].append(tx['profit'])
        
        for date, profits in daily_profits.items():
            stats['daily_stats'][date] = {
                'count': len(profits),
                'total_profit': sum(profits),
                'avg_profit': np.mean(profits)
            }
        
        pool_stats.append(stats)
    
    # 按总利润排序
    return sorted(pool_stats, key=lambda x: x['total_profit'], reverse=True)

def plot_daily_stats(daily_stats):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
    
    # 绘制每日交易数
    daily_stats['transaction_count'].plot(kind='bar', ax=ax1)
    ax1.set_title('Daily Arbitrage Transaction Count')
    ax1.set_xlabel('Date')
    ax1.set_ylabel('Transaction Count')
    plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45)
    
    # 绘制每日利润
    daily_stats['profit'].plot(kind='bar', ax=ax2)
    ax2.set_title('Daily Arbitrage Profit')
    ax2.set_xlabel('Date')
    ax2.set_ylabel('Profit (ETH)')
    plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45)
    
    plt.tight_layout()
    plt.savefig('daily_arb_stats.png')
    plt.close()

def export_pool_stats(pool_stats):
    # 导出详细统计信息到JSON文件
    with open('pool_stats_analysis.json', 'w') as f:
        json.dump({
            'analysis_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_pool_sets': len(pool_stats),
            'pool_stats': pool_stats
        }, f, indent=2)
    
    # 打印前10个最赚钱的池子组合的摘要信息
    print("\n=== Top 10 Most Profitable Pool Sets ===")
    for i, stats in enumerate(pool_stats[:10], 1):
        print(f"\n{i}. Pool Set: {', '.join(stats['pool_set'])}")
        print(f"   Total Profit: {stats['total_profit']:.6f} ETH")
        print(f"   Transaction Count: {stats['transaction_count']}")
        print(f"   Average Profit: {stats['avg_profit']:.6f} ETH")
        print(f"   Max Profit: {stats['max_profit']:.6f} ETH")
        token_str = ', '.join(f"{t['symbol']}({t['address'][:8]}...)" for t in stats['tokens'])
        print(f"   Tokens: {token_str}")
        print(f"   Protocols: {', '.join(stats['protocols'])}")
        print(f"   Top Transaction: {stats['top_transactions'][0]['hash']} ({stats['top_transactions'][0]['profit']:.6f} ETH)")

def main():
    # 加载数据
    transactions = load_transaction_data('../data/transaction_analysis_result_2.json')
    
    # 分析每日数据
    daily_stats = analyze_daily_profits(transactions)
    plot_daily_stats(daily_stats)
    
    # 分析池子数据
    pool_stats = analyze_pool_profits(transactions)
    export_pool_stats(pool_stats)
    
    # 打印每日统计信息
    print("\n=== Daily Statistics ===")
    print(daily_stats)

if __name__ == "__main__":
    main() 