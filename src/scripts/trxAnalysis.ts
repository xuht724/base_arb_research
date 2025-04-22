import { ChainHelper } from "../lib/chain/helper";
import * as fs from 'fs';
import * as path from 'path';

interface ProfitableTransaction {
    rank: number;
    trxHash: string;
    blockNumber: string;
    profit: string;
    l2Fee: string;
    netProfit: string;
    potentialArb: boolean;
    logNum: number;
}

interface TransactionData {
    summary: {
        totalTransactions: number;
        potentialArbCount: number;
        profitableTransactions: number;
        profitableRatio: string;
        totalProfit: string;
        totalL2Fee: string;
        totalNetProfit: string;
        averageProfit: string;
    };
    profitableTransactions: ProfitableTransaction[];
}

async function getTransactionIndexes(chainHelper: ChainHelper, txHashes: string[]) {
    const indexes = [];
    for (const hash of txHashes) {
        try {
            const tx = await chainHelper.httpClient.getTransaction({
                hash: hash as `0x${string}`
            });
            if (tx && tx.transactionIndex !== null) {
                indexes.push({
                    hash: hash,
                    index: tx.transactionIndex
                });
            }
        } catch (error) {
            console.error(`获取交易${hash}的index失败:`, error);
        }
    }
    return indexes;
}

async function main() {
    // 读取trx.json文件
    const trxDataPath = path.join(__dirname, 'trx.json');
    const trxData: TransactionData = JSON.parse(fs.readFileSync(trxDataPath, 'utf-8'));
    
    const url = process.env.BASE_HTTP_URL3!
    console.log("url", url);
  
    const helper = new ChainHelper(url);  
    // 获取所有盈利交易的哈希
    const txHashes = trxData.profitableTransactions.map(tx => tx.trxHash);
    
    // 获取交易索引
    const indexes = await getTransactionIndexes(helper, txHashes);
    
    // 输出结果
    console.log('交易索引信息：');
    indexes.forEach(item => {
        console.log(`交易哈希: ${item.hash}`);
        console.log(`交易索引: ${item.index}`);
        console.log('---');
    });
}

main().catch(console.error);


