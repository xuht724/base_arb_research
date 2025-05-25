import { BlockRepository } from "../src/lib/db/block.repository";
import { ArbHelper } from "../src/lib/chain/arb.helper";

async function main() {
  const rpcUrl = process.env.BASE_HTTP_URL!;
  const helper = new ArbHelper(rpcUrl);
  const blockRepo = new BlockRepository();

  try {
    const ranges = await blockRepo.getContinuousBlockRanges();
    
    console.log(`\n数据库中共有 ${ranges.length} 个连续区块段：`);
    console.log('----------------------------------------');
    
    for (const range of ranges) {
      const startBlock = await helper.getBlock(range.start);
      const endBlock = await helper.getBlock(range.end);
      
      console.log(`\n区块范围: ${range.start} - ${range.end}`);
      console.log(`区块数量: ${range.count}`);
      console.log(`开始时间: ${new Date(Number(startBlock.timestamp) * 1000).toLocaleString()}`);
      console.log(`结束时间: ${new Date(Number(endBlock.timestamp) * 1000).toLocaleString()}`);
      console.log('----------------------------------------');
    }

  } catch (error) {
    console.error("分析过程中出错:", error);
  } finally {
    await blockRepo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 