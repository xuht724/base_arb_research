import { PrismaClient, Block } from '../../../generated/prisma';
import { TransactionReceipt } from 'viem';
import { reviver } from '../utils';

export class BlockRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async saveBlock(
    blockNumber: number,
    blockHash: string,
    parentHash: string,
    timestamp: Date,
    gasUsed: string,
    gasLimit: string,
    baseFeePerGas: string | null,
    miner: string,
    transactions: any[],
    receipts: TransactionReceipt[]
  ): Promise<void> {
    await this.prisma.block.create({
      data: {
        id: blockNumber,
        blockNumber,
        blockHash,
        parentHash,
        timestamp,
        gasUsed,
        gasLimit,
        baseFeePerGas,
        miner,
        trxNumber: transactions.length,
        transactions: transactions as any,
        receipts: receipts as any,
      },
    });
  }

  async getBlock(blockNumber: number): Promise<Block | null> {
    const block = await this.prisma.block.findUnique({
      where: { blockNumber },
    });
    
    if (!block) return null;

    // 使用reviver恢复BigInt
    return {
      ...block,
      transactions: JSON.parse(JSON.stringify(block.transactions), reviver),
      receipts: JSON.parse(JSON.stringify(block.receipts), reviver),
    };
  }

  async getBlocks(startBlock: number, endBlock: number): Promise<Block[]> {
    const blocks = await this.prisma.block.findMany({
      where: {
        blockNumber: {
          gte: startBlock,
          lte: endBlock,
        },
      },
      orderBy: { blockNumber: 'asc' },
    });

    // 使用reviver恢复BigInt
    return blocks.map(block => ({
      ...block,
      transactions: JSON.parse(JSON.stringify(block.transactions), reviver),
      receipts: JSON.parse(JSON.stringify(block.receipts), reviver),
    }));
  }

  async getLatestBlockNumber(): Promise<number | null> {
    const latestBlock = await this.prisma.block.findFirst({
      orderBy: { blockNumber: 'desc' },
      select: { blockNumber: true },
    });
    return latestBlock?.blockNumber ?? null;
  }

  async getBlockRange(): Promise<{ min: number | null; max: number | null }> {
    const [min, max] = await Promise.all([
      this.prisma.block.findFirst({
        orderBy: { blockNumber: 'asc' },
        select: { blockNumber: true },
      }),
      this.prisma.block.findFirst({
        orderBy: { blockNumber: 'desc' },
        select: { blockNumber: true },
      }),
    ]);

    return {
      min: min?.blockNumber ?? null,
      max: max?.blockNumber ?? null,
    };
  }

  async getBlockGaps(): Promise<{
    minBlock: number | null;
    maxBlock: number | null;
    missingBlocks: number[];
    isContinuous: boolean;
  }> {
    const { min, max } = await this.getBlockRange();
    
    if (min === null || max === null) {
      return {
        minBlock: null,
        maxBlock: null,
        missingBlocks: [],
        isContinuous: true
      };
    }

    // 获取所有已存在的区块号
    const existingBlocks = await this.prisma.block.findMany({
      where: {
        blockNumber: {
          gte: min,
          lte: max
        }
      },
      select: { blockNumber: true },
      orderBy: { blockNumber: 'asc' }
    });

    const existingBlockNumbers = new Set(existingBlocks.map(b => b.blockNumber));
    const missingBlocks: number[] = [];

    // 检查每个区块号是否存在
    for (let i = min; i <= max; i++) {
      if (!existingBlockNumbers.has(i)) {
        missingBlocks.push(i);
      }
    }

    return {
      minBlock: min,
      maxBlock: max,
      missingBlocks,
      isContinuous: missingBlocks.length === 0
    };
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async saveBlocks(blocks: Array<{
    blockNumber: number;
    blockHash: string;
    parentHash: string;
    timestamp: Date;
    gasUsed: string;
    gasLimit: string;
    baseFeePerGas: string | null;
    miner: string;
    transactions: any[];
    receipts: any[];
  }>): Promise<void> {
    // 分批处理，每批100个区块
    const BATCH_SIZE = 100;
    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE);
      await this.prisma.block.createMany({
        data: batch.map(block => ({
          id: block.blockNumber,
          blockNumber: block.blockNumber,
          blockHash: block.blockHash,
          parentHash: block.parentHash,
          timestamp: block.timestamp,
          gasUsed: block.gasUsed,
          gasLimit: block.gasLimit,
          baseFeePerGas: block.baseFeePerGas,
          miner: block.miner,
          trxNumber: block.transactions.length,
          transactions: block.transactions,
          receipts: block.receipts,
        })),
        skipDuplicates: true,
      });
    }
  }

  async getContinuousBlockRanges(): Promise<Array<{ start: number; end: number; count: number }>> {
    const { min, max } = await this.getBlockRange();
    
    if (min === null || max === null) {
      return [];
    }

    // 获取所有已存在的区块号
    const existingBlocks = await this.prisma.block.findMany({
      where: {
        blockNumber: {
          gte: min,
          lte: max
        }
      },
      select: { blockNumber: true },
      orderBy: { blockNumber: 'asc' }
    });

    const blockNumbers = existingBlocks.map(b => b.blockNumber);
    const ranges: Array<{ start: number; end: number; count: number }> = [];
    
    if (blockNumbers.length === 0) {
      return ranges;
    }

    let currentStart = blockNumbers[0];
    let currentEnd = blockNumbers[0];
    let currentCount = 1;

    for (let i = 1; i < blockNumbers.length; i++) {
      if (blockNumbers[i] === blockNumbers[i - 1] + 1) {
        // 连续区块
        currentEnd = blockNumbers[i];
        currentCount++;
      } else {
        // 不连续，保存当前范围并开始新的范围
        ranges.push({
          start: currentStart,
          end: currentEnd,
          count: currentCount
        });
        currentStart = blockNumbers[i];
        currentEnd = blockNumbers[i];
        currentCount = 1;
      }
    }

    // 添加最后一个范围
    ranges.push({
      start: currentStart,
      end: currentEnd,
      count: currentCount
    });

    return ranges;
  }
} 