import { ArbHelper } from "../../src/lib/chain/arb.helper";
import { BlockRepository } from "../../src/lib/db/block.repository";

const BATCH_SIZE = 10; // 每批处理的区块数量

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours}小时${minutes % 60}分${seconds % 60}秒`;
}

function formatProgress(current: number, total: number): string {
  const percentage = ((current / total) * 100).toFixed(2);
  return `${current}/${total} (${percentage}%)`;
}

async function main() {
  const startTime = Date.now();
  const rpcUrl = process.env.BASE_HTTP_URL!;
  const helper = new ArbHelper(rpcUrl);
  const blockRepo = new BlockRepository();

  // 获取起始和结束区块
  const startBlock = parseInt(process.argv[2] || "0");
  const endBlock = parseInt(process.argv[3] || "0");

  if (!startBlock || !endBlock) {
    console.error("请提供起始和结束区块号");
    process.exit(1);
  }

  if (startBlock > endBlock) {
    console.error(`错误：起始区块(${startBlock})不能大于结束区块(${endBlock})`);
    process.exit(1);
  }

  try {
    // 获取已下载的最新区块
    const currentStartBlock = startBlock;

    const totalBlocks = endBlock - currentStartBlock + 1;

    console.log(`开始下载区块 ${currentStartBlock} 到 ${endBlock}`);
    console.log(`总区块数: ${totalBlocks}`);

    let processedBlocks = 0;
    let successBlocks = 0;
    let failedBlocks = 0;

    // 按批次处理区块
    for (let batchStart = currentStartBlock; batchStart <= endBlock; batchStart += BATCH_SIZE) {
      const batchStartTime = Date.now();
      try {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endBlock);
        const batchSize = batchEnd - batchStart + 1;
        
        console.log(`\n处理区块 ${batchStart} 到 ${batchEnd}...`);
        console.log(`当前进度: ${formatProgress(processedBlocks, totalBlocks)}`);

        // 生成当前批次的区块号列表
        const blockNumbers = Array.from(
          { length: batchSize },
          (_, i) => batchStart + i
        );

        // 批量获取区块信息
        const blocksInfo = await helper.getBlocksWithReceipts(blockNumbers);
        
        // 过滤掉获取失败的区块
        const validBlocks = blocksInfo.filter((block): block is NonNullable<typeof block> => block !== null);
        const failedInBatch = batchSize - validBlocks.length;

        if (validBlocks.length > 0) {
          // 批量保存到数据库
          await blockRepo.saveBlocks(validBlocks);
          successBlocks += validBlocks.length;
          failedBlocks += failedInBatch;
        }

        processedBlocks += batchSize;
        const batchTime = Date.now() - batchStartTime;
        const totalTime = Date.now() - startTime;
        const avgTimePerBlock = totalTime / processedBlocks;
        const estimatedRemaining = avgTimePerBlock * (totalBlocks - processedBlocks);

        console.log(`批次耗时: ${formatTime(batchTime)}`);
        console.log(`平均每区块耗时: ${(avgTimePerBlock / 1000).toFixed(2)}秒`);
        console.log(`预计剩余时间: ${formatTime(estimatedRemaining)}`);
        console.log(`成功: ${successBlocks}, 失败: ${failedBlocks}`);

        // 添加延迟以避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`处理区块批次 ${batchStart} 时出错:`, error);
        failedBlocks += BATCH_SIZE;
        processedBlocks += BATCH_SIZE;
        // 继续处理下一批
        continue;
      }
    }

    const totalTime = Date.now() - startTime;
    console.log("\n下载完成");
    console.log(`总耗时: ${formatTime(totalTime)}`);
    console.log(`总区块数: ${totalBlocks}`);
    console.log(`成功: ${successBlocks}, 失败: ${failedBlocks}`);
    console.log(`成功率: ${((successBlocks / totalBlocks) * 100).toFixed(2)}%`);
    process.exit(0);
  } catch (error) {
    console.error("下载过程中出错:", error);
  } finally {
    await blockRepo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 