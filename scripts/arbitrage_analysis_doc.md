# Arbitrage Analysis Documentation

## Data Files Description

This analysis includes two main files:
1. `arbitrage_analysis.csv` - Detailed arbitrage transaction data
2. `analysis_report.json` - Arbitrage analysis report

## CSV File Fields Description

### Basic Information Fields
- `total_transactions`: Total number of transactions between from address and to address
- `arbitrage_count`: Number of transactions successfully identified as arbitrage
- `arbitrage_rate`: Arbitrage rate (arbitrage count / total transactions)

### Profit Related Fields
- `total_profit`: Total profit (ETH)
- `average_profit`: Average profit per arbitrage (ETH)
- `total_gas_cost`: Total gas cost (ETH)
- `average_gas_cost`: Average gas cost per transaction (ETH)

### Gas Usage Related Fields
- `total_gas_used`: Total gas usage
- `average_gas_used`: Average gas usage per transaction

### Transaction Input Feature Fields
These fields represent the count of transactions with specific input features:
- `pools_match`: Transactions with only pool addresses in input
- `tokens_match`: Transactions with only token addresses in input
- `amounts_match`: Transactions with only input amounts
- `pools_and_tokens_match`: Transactions with pool and token addresses but no input amounts
- `pools_and_amounts_match`: Transactions with pool addresses and input amounts but no token addresses
- `tokens_and_amounts_match`: Transactions with token addresses and input amounts
- `all_match`: Transactions containing pool addresses, token addresses, and input amounts
- `all_not_match`: Transactions containing none of the above information

## JSON Report File Example

```json
{
  "timestamp": "2025-05-29T03:34:55.995Z",
  "startBlockNumber": 29289026,
  "endBlockNumber": 29634126,
  "totalAddresses": 20,
  "globalStats": {
    "flagStats": {
      "poolsMatch": 17296,
      "tokensMatch": 18,
      "amountsMatch": 0,
      "poolsAndTokensMatch": 26094,
      "poolsAndAmountsMatch": 20,
      "tokensAndAmountsMatch": 0,
      "allMatch": 74054,
      "allNotMatch": 40899
    }
  },
  "topAddresses": [
    {
      "address": "0x826fd727477547bd89d75f7941d35f525c04b5f5",
      "totalTransactions": 15133,
      "protocols": [
        "UniV2",
        "UniV3",
        "AeroV3",
        "PancakeV3",
        "AeroV2",
        "UniV4",
        "DackieV3",
        "AlienV3",
        "SolidV3",
        "PancakeV2"
      ],
      "profitStats": {
        "totalProfit": "10.388549393557410599",
        "averageProfit": "0.000686483142374771",
        "profitToCostRatio": "23109.00%"
      },
      "profitableRate": "67.01%"
    }
  ]
}
```

### JSON File Fields Description

#### Basic Information
- `timestamp`: Analysis report generation time
- `startBlockNumber`: Analysis start block
- `endBlockNumber`: Analysis end block
- `totalAddresses`: Total number of addresses analyzed

#### Filtered Address Information
- `topAddresses`: Arbitrage contract addresses (to)
  - `address`: Arbitrage initiator addresses (from)
  - `totalTransactions`: Total number of transactions
  - `protocols`: List of protocols used
  - `profitStats`: Profit statistics
    - `totalProfit`: Total profit
    - `averageProfit`: Average profit
    - `profitToCostRatio`: Profit to cost ratio
  - `profitableRate`: Rate of profitable transactions
