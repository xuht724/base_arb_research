import { ArbHelper } from '../lib/chain/arb.helper';
import { TraceHelper } from '../lib/trace/trace.helper';
import fs from 'fs';
import path from 'path';

async function main() {
  // 初始化 helpers
  const arbHelper = new ArbHelper(
    'https://mainnet.base.org',
    process.env.THE_GRAPH_API_KEY || ''
  );
  const traceHelper = new TraceHelper(arbHelper);

  // 读取 trace 文件
  const traceDir = path.join(__dirname, '../../data/trace');
  const files = fs.readdirSync(traceDir);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    console.log(`分析文件: ${file}`);
    const traceData = JSON.parse(
      fs.readFileSync(path.join(traceDir, file), 'utf-8')
    );

    // 分析 trace
    const decodedTrace = await traceHelper.analyzeTrace(traceData);

    // 保存分析结果
    const outputDir = path.join(__dirname, '../../data/analyzed_trace');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(outputDir, file),
      JSON.stringify(decodedTrace, null, 2)
    );

    console.log(`分析完成: ${file}`);
  }
}

main().catch(console.error); 