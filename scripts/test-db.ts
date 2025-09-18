import { BlockRepository } from "../src/lib/db/block.repository";

async function checkDB() {
  const repo = new BlockRepository();
  try {
    console.log("检查数据库连接...");
    const range = await repo.getBlockRange();
    console.log('数据库区块范围:', range);
    
    if (range.min && range.max) {
      const testStart = range.min;
      const testEnd = Math.min(range.min + 9, range.max);
      console.log(`建议测试范围: ${testStart} 到 ${testEnd}`);
      
      // 检查这些区块是否存在
      const blocks = await repo.getBlocks(testStart, testEnd);
      console.log(`找到 ${blocks.length} 个区块`);
      
      if (blocks.length > 0) {
        console.log(`第一个区块: ${blocks[0].blockNumber}`);
        console.log(`最后一个区块: ${blocks[blocks.length - 1].blockNumber}`);
        console.log(`第一个区块交易数: ${blocks[0].trxNumber}`);
      }
    }
  } catch (error) {
    console.error('数据库连接错误:', error.message);
  } finally {
    await repo.close();
  }
}

checkDB(); 