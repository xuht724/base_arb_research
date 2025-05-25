import json
import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict
from typing import Dict, List, Tuple
import numpy as np

class ArbitrageAnalyzer:
    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.all_blocks = []
        self.df = None
        
    def load_data(self):
        """Load all block data"""
        print("Loading data...")
        for filename in os.listdir(self.data_dir):
            if filename.startswith('arbitrage_blocks_') and filename.endswith('.json'):
                file_path = os.path.join(self.data_dir, filename)
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    self.all_blocks.extend(data['blocks'])
        print(f"Loading complete, total {len(self.all_blocks)} blocks")
        
    def process_data(self):
        """Process data into DataFrame format"""
        print("Processing data...")
        records = []
        for block in self.all_blocks:
            for tx in block.get('arbitrageTxs', []):
                record = {
                    'blockNumber': block['blockNumber'],
                    'txHash': tx['txHash'],
                    'type': tx['type'],
                    'to': tx['to'],
                    'profitToken': tx['profit']['token'],
                    'profitSymbol': tx['profit'].get('symbol', 'UNKNOWN'),
                    'profitAmount': float(tx['profit']['amount']),
                    'profitFormatted': float(tx['profit'].get('formattedAmount', 0)),
                    'gasUsed': float(tx.get('gasUsed', 0))
                }
                records.append(record)
        
        self.df = pd.DataFrame(records)
        print("Data processing complete")
        
        # Print unique profit symbols for debugging
        print("\nUnique profit symbols in data:")
        print(self.df['profitSymbol'].unique())
        
    def analyze_arb_types(self) -> Dict:
        """Analyze arbitrage type statistics"""
        print("\n=== Arbitrage Type Analysis ===")
        
        # Group by type and profitSymbol
        type_stats = self.df.groupby(['type', 'profitSymbol']).agg({
            'txHash': 'count',
            'profitAmount': 'sum',
            'profitFormatted': 'sum'
        }).rename(columns={
            'txHash': 'Transaction Count',
            'profitAmount': 'Raw Profit',
            'profitFormatted': 'Formatted Profit'
        })
        
        print("\nTransaction count by type and token:")
        print(type_stats['Transaction Count'])
        
        print("\nProfit by type and token:")
        print(type_stats['Formatted Profit'])
        
        return type_stats
        
    def analyze_profit_tokens(self) -> Dict:
        """Analyze profit token distribution"""
        print("\n=== Profit Token Analysis ===")
        token_stats = self.df.groupby(['profitToken', 'profitSymbol']).agg({
            'txHash': 'count',
            'profitAmount': 'sum',
            'profitFormatted': 'sum'
        }).rename(columns={
            'txHash': 'Transaction Count',
            'profitAmount': 'Raw Profit',
            'profitFormatted': 'Formatted Profit'
        })
        
        print("\nTransaction count and profit by token:")
        print(token_stats)
        
        return token_stats
        
    def analyze_addresses(self) -> pd.DataFrame:
        """Analyze arbitrage address statistics"""
        print("\n=== Address Analysis ===")
        
        # Filter for WETH transactions
        weth_df = self.df[self.df['profitSymbol'].str.contains('ETH', case=False, na=False)]
        
        if weth_df.empty:
            print("Warning: No ETH transactions found!")
            return pd.DataFrame()
        
        # Group by address and type for WETH
        address_stats = weth_df.groupby(['to', 'type']).agg({
            'txHash': 'count',
            'profitAmount': 'sum',
            'profitFormatted': 'sum'
        }).rename(columns={
            'txHash': 'Transaction Count',
            'profitAmount': 'Raw Profit',
            'profitFormatted': 'Formatted Profit'
        })
        
        # Calculate total WETH transactions per address
        address_totals = weth_df.groupby('to')['txHash'].count().sort_values(ascending=False)
        
        print("\nTop 10 most active ETH arbitrage addresses:")
        print(address_totals.head(10))
        
        return address_stats
        
    def analyze_gas_usage(self):
        """Analyze gas usage statistics"""
        print("\n=== Gas Usage Analysis ===")
        
        # Calculate gas usage statistics by type
        gas_stats = self.df.groupby('type').agg({
            'gasUsed': ['count', 'mean', 'median', 'min', 'max', 'std']
        }).round(2)
        
        print("\nGas usage statistics by type:")
        print(gas_stats)
        
        return gas_stats
        
    def plot_block_distribution(self):
        """Plot block distribution"""
        print("\n=== Generating Block Distribution Plot ===")
        plt.figure(figsize=(15, 6))
        
        # Create block groups of 100
        self.df['blockGroup'] = self.df['blockNumber'] // 100 * 100
        
        # Count transactions by block group and type
        block_type_counts = self.df.groupby(['blockGroup', 'type']).size().unstack(fill_value=0)
        
        # Plot stacked bar chart
        bars = block_type_counts.plot(kind='bar', stacked=True)
        plt.title('Block Arbitrage Transaction Distribution')
        plt.xlabel('Block Number (Grouped by 100)')
        plt.ylabel('Transaction Count')
        plt.legend(title='Arbitrage Type')
        plt.xticks(rotation=45)
        
        # Add value labels on top of stacked bars
        for c in bars.containers:
            # Add labels
            labels = [f'{int(v):,}' if v > 0 else '' for v in c.datavalues]
            bars.bar_label(c, labels=labels, label_type='center')
        
        plt.tight_layout()
        
        # Save plot
        output_dir = os.path.join(self.data_dir, 'analysis_results')
        os.makedirs(output_dir, exist_ok=True)
        plt.savefig(os.path.join(output_dir, 'block_distribution.png'))
        print(f"Block distribution plot saved to: {output_dir}/block_distribution.png")
        
    def plot_weth_comparison(self):
        """Plot WETH comparison between inter and begin"""
        print("\n=== Generating ETH Comparison Plot ===")
        
        # Filter for ETH transactions
        eth_df = self.df[self.df['profitSymbol'].str.contains('ETH', case=False, na=False)]
        
        if eth_df.empty:
            print("Warning: No ETH transactions found! Skipping ETH comparison plot.")
            return
        
        # Create figure with two subplots
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        # Plot transaction count comparison
        type_counts = eth_df.groupby('type')['txHash'].count()
        if not type_counts.empty:
            bars1 = type_counts.plot(kind='bar', ax=ax1)
            ax1.set_title('ETH Transaction Count by Type')
            ax1.set_xlabel('Arbitrage Type')
            ax1.set_ylabel('Transaction Count')
            ax1.tick_params(axis='x', rotation=0)
            
            # Add value labels on top of bars
            for bar in bars1.patches:
                height = bar.get_height()
                ax1.text(bar.get_x() + bar.get_width()/2., height,
                        f'{int(height):,}',
                        ha='center', va='bottom')
        
        # Plot profit comparison
        type_profits = eth_df.groupby('type')['profitFormatted'].sum()
        if not type_profits.empty:
            bars2 = type_profits.plot(kind='bar', ax=ax2)
            ax2.set_title('ETH Profit by Type')
            ax2.set_xlabel('Arbitrage Type')
            ax2.set_ylabel('Profit (ETH)')
            ax2.tick_params(axis='x', rotation=0)
            
            # Add value labels on top of bars
            for bar in bars2.patches:
                height = bar.get_height()
                ax2.text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:,.4f}',
                        ha='center', va='bottom')
        
        plt.tight_layout()
        
        # Save plot
        output_dir = os.path.join(self.data_dir, 'analysis_results')
        os.makedirs(output_dir, exist_ok=True)
        plt.savefig(os.path.join(output_dir, 'eth_comparison.png'))
        print(f"ETH comparison plot saved to: {output_dir}/eth_comparison.png")
        
    def plot_gas_comparison(self):
        """Plot gas usage comparison between inter and begin"""
        print("\n=== Generating Gas Usage Comparison Plot ===")
        
        # Plot 1: Average gas usage comparison
        plt.figure(figsize=(10, 6))
        gas_means = self.df.groupby('type')['gasUsed'].mean()
        if not gas_means.empty:
            bars = gas_means.plot(kind='bar')
            plt.title('Average Gas Usage by Type')
            plt.xlabel('Arbitrage Type')
            plt.ylabel('Gas Used')
            plt.xticks(rotation=0)
            
            # Add value labels on top of bars
            for bar in bars.patches:
                height = bar.get_height()
                plt.text(bar.get_x() + bar.get_width()/2., height,
                        f'{int(height):,}',
                        ha='center', va='bottom')
        
        plt.tight_layout()
        
        # Save average gas usage plot
        output_dir = os.path.join(self.data_dir, 'analysis_results')
        os.makedirs(output_dir, exist_ok=True)
        plt.savefig(os.path.join(output_dir, 'average_gas_usage.png'))
        print(f"Average gas usage plot saved to: {output_dir}/average_gas_usage.png")
        
        # Plot 2: Gas usage distribution for both types
        plt.figure(figsize=(15, 6))
        
        # Create subplots for inter and begin
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        # Plot inter arbitrage gas usage distribution
        inter_gas = self.df[self.df['type'] == 'inter']['gasUsed']
        if not inter_gas.empty:
            sns.histplot(data=inter_gas, bins=50, ax=ax1)
            ax1.set_title('Inter Arbitrage Gas Usage Distribution')
            ax1.set_xlabel('Gas Used')
            ax1.set_ylabel('Count')
            
            # Add mean and median lines
            mean_gas = inter_gas.mean()
            median_gas = inter_gas.median()
            ax1.axvline(mean_gas, color='r', linestyle='--', label=f'Mean: {int(mean_gas):,}')
            ax1.axvline(median_gas, color='g', linestyle='--', label=f'Median: {int(median_gas):,}')
            ax1.legend()
        
        # Plot begin arbitrage gas usage distribution
        begin_gas = self.df[self.df['type'] == 'begin']['gasUsed']
        if not begin_gas.empty:
            sns.histplot(data=begin_gas, bins=50, ax=ax2)
            ax2.set_title('Begin Arbitrage Gas Usage Distribution')
            ax2.set_xlabel('Gas Used')
            ax2.set_ylabel('Count')
            
            # Add mean and median lines
            mean_gas = begin_gas.mean()
            median_gas = begin_gas.median()
            ax2.axvline(mean_gas, color='r', linestyle='--', label=f'Mean: {int(mean_gas):,}')
            ax2.axvline(median_gas, color='g', linestyle='--', label=f'Median: {int(median_gas):,}')
            ax2.legend()
        
        plt.tight_layout()
        
        # Save distribution plot
        plt.savefig(os.path.join(output_dir, 'gas_usage_distribution.png'))
        print(f"Gas usage distribution plot saved to: {output_dir}/gas_usage_distribution.png")
        
        # Close all figures
        plt.close('all')
        
    def save_results(self):
        """Save analysis results"""
        output_dir = os.path.join(self.data_dir, 'analysis_results')
        os.makedirs(output_dir, exist_ok=True)
        
        # Save type statistics
        type_stats = self.analyze_arb_types()
        type_stats.to_csv(os.path.join(output_dir, 'arb_type_stats.csv'))
        
        # Save token statistics
        token_stats = self.analyze_profit_tokens()
        token_stats.to_csv(os.path.join(output_dir, 'token_stats.csv'))
        
        # Save address statistics
        address_stats = self.analyze_addresses()
        if not address_stats.empty:
            address_stats.to_csv(os.path.join(output_dir, 'address_stats.csv'))
            
        # Save gas usage statistics
        gas_stats = self.analyze_gas_usage()
        gas_stats.to_csv(os.path.join(output_dir, 'gas_usage_stats.csv'))
        
        print(f"\nAnalysis results saved to directory: {output_dir}")

def main():
    # Set data directory
    data_dir = os.path.join(os.path.dirname(__file__), '../data/block_range_analysis')
    
    # Create analyzer instance
    analyzer = ArbitrageAnalyzer(data_dir)
    
    # Execute analysis
    analyzer.load_data()
    analyzer.process_data()
    
    # Generate analysis results
    analyzer.analyze_arb_types()
    analyzer.analyze_profit_tokens()
    analyzer.analyze_addresses()
    analyzer.analyze_gas_usage()
    analyzer.plot_block_distribution()
    analyzer.plot_weth_comparison()
    analyzer.plot_gas_comparison()
    
    # Save results
    analyzer.save_results()

if __name__ == "__main__":
    main() 