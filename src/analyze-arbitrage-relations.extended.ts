// 🔼 插入以下 import 到文件顶部
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

// ✅ 可视化函数 - 触发协议分布 / 延迟分布
async function visualizeTriggerStatistics(relations: SwapArbitrageRelation[]) {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600 });

  const protocolCount: Record<string, number> = {};
  const timeDiffs: number[] = [];

  for (const rel of relations) {
    for (const trigger of rel.potentialTriggerSwaps) {
      protocolCount[trigger.swapProtocol] = (protocolCount[trigger.swapProtocol] || 0) + 1;
      if (trigger.timeDifference !== undefined) {
        timeDiffs.push(trigger.timeDifference);
      }
    }
  }

  // 绘制协议分布柱状图
  const protocolChart = await chartJSNodeCanvas.renderToBuffer({
    type: "bar",
    data: {
      labels: Object.keys(protocolCount),
      datasets: [
        {
          label: "Trigger Frequency by Protocol",
          data: Object.values(protocolCount),
          backgroundColor: "rgba(54, 162, 235, 0.6)"
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "Trigger Frequency per Protocol"
        }
      }
    }
  });

  writeFileSync(path.join(OUTPUT_DIR, 'trigger_protocols.png'), protocolChart);

  // 绘制触发延迟直方图
  const delayBins: number[] = Array(20).fill(0);
  for (const diff of timeDiffs) {
    const bin = Math.min(Math.floor(diff / 5), 19);
    delayBins[bin]++;
  }

  const delayChart = await chartJSNodeCanvas.renderToBuffer({
    type: "bar",
    data: {
      labels: delayBins.map((_, i) => `${i * 5}-${i * 5 + 4}`),
      datasets: [
        {
          label: "Trigger Delay (Tx Index Difference)",
          data: delayBins,
          backgroundColor: "rgba(255, 99, 132, 0.6)"
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: "Swap Trigger Delay Histogram"
        }
      }
    }
  });

  writeFileSync(path.join(OUTPUT_DIR, 'trigger_delay_histogram.png'), delayChart);
}

// 在 main 函数尾部调用
// await visualizeTriggerStatistics(flattenedTriggerRelations);