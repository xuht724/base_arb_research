import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import matplotlib.font_manager as fm

def load_data(json_file):
    with open(json_file, 'r') as f:
        return json.load(f)

def extract_from_to_data(data):
    rows = []
    for address_info in data['topAddresses']:
        to_address = address_info['address']
        for from_address, stats in address_info['fromAddresses'].items():
            row = {
                'from_address': from_address,
                'to_address': to_address,
                'total_transactions': int(stats['totalTransactions']),
                'arbitrage_count': int(stats['arbitrageCount']),
                'arbitrage_rate': float(stats['arbitrageRate']),
                'total_profit': float(stats['profitStats']['totalProfit']),
                'average_profit': float(stats['profitStats']['averageProfit']),
                'total_gas_cost': float(stats['profitStats']['totalGasCost']),
                'average_gas_cost': float(stats['profitStats']['averageGasCost']),
                'total_gas_used': int(stats['profitStats']['totalGasUsed']),
                'average_gas_used': int(stats['profitStats']['averageGasUsed']),
                'pools_match': int(stats['flagStats']['poolsMatch']),
                'tokens_match': int(stats['flagStats']['tokensMatch']),
                'amounts_match': int(stats['flagStats']['amountsMatch']),
                'pools_and_tokens_match': int(stats['flagStats']['poolsAndTokensMatch']),
                'pools_and_amounts_match': int(stats['flagStats']['poolsAndAmountsMatch']),
                'tokens_and_amounts_match': int(stats['flagStats']['tokensAndAmountsMatch']),
                'all_match': int(stats['flagStats']['allMatch']),
                'all_not_match': int(stats['flagStats']['allNotMatch'])
            }
            rows.append(row)
    return pd.DataFrame(rows)

def setup_chinese_font():
    # 尝试设置中文字体
    chinese_fonts = ['WenQuanYi Micro Hei', 'Noto Sans CJK SC', 'Microsoft YaHei', 'SimHei']
    font_found = False
    
    for font in chinese_fonts:
        try:
            plt.rcParams['font.sans-serif'] = [font] + plt.rcParams['font.sans-serif']
            font_found = True
            print(f"使用字体: {font}")
            break
        except:
            continue
    
    if not font_found:
        print("警告: 未找到中文字体，将使用默认字体")
    
    plt.rcParams['axes.unicode_minus'] = False

def create_visualizations(df, output_dir):
    # 设置输出目录
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 设置中文字体
    setup_chinese_font()
    
    # 1. Total Profit 分布图
    plt.figure(figsize=(12, 6))
    sns.histplot(data=df, x='total_profit', bins=50)
    plt.title('Total Profit Distribution')
    plt.xlabel('Total Profit')
    plt.ylabel('Count')
    plt.savefig(output_dir / 'total_profit_distribution.png')
    plt.close()
    
    # 3. Arbitrage Rate 分布图
    plt.figure(figsize=(12, 6))
    sns.histplot(data=df, x='arbitrage_rate', bins=50)
    plt.title('Arbitrage Rate Distribution')
    plt.xlabel('Arbitrage Rate')
    plt.ylabel('Count')
    plt.savefig(output_dir / 'arbitrage_rate_distribution.png')
    plt.close()
    
    # 4. 散点图：Arbitrage Rate vs Total Profit
    plt.figure(figsize=(12, 6))
    sns.scatterplot(data=df, x='arbitrage_rate', y='total_profit')
    plt.title('Arbitrage Rate vs Total Profit')
    plt.xlabel('Arbitrage Rate')
    plt.ylabel('Total Profit')
    plt.savefig(output_dir / 'arbitrage_rate_vs_profit.png')
    plt.close()

def main():
    # 输入和输出路径
    input_file = './data/arbitrage_analysis_full/analysis_report.json'
    output_csv = './data/arbitrage_analysis_full/arbitrage_analysis_full.csv'
    output_dir = './data/arbitrage_analysis_full/visualizations'
    
    # 加载数据
    data = load_data(input_file)
    
    # 转换为DataFrame
    df = extract_from_to_data(data)
    
    # 保存为CSV，确保数值类型正确保存
    df.to_csv(output_csv, index=False, float_format='%.18f')
    print(f"CSV文件已保存到: {output_csv}")
    
    # 创建可视化
    create_visualizations(df, output_dir)
    print(f"可视化图表已保存到: {output_dir}")

if __name__ == "__main__":
    main() 