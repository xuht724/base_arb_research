import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ArbHelper } from '../../src/lib/chain/arb.helper';
import { TraceHelper, TraceCall } from '../../src/lib/trace/trace.helper';
import { BASE_CHAIN_ID } from '../../src/common/constants';
import { replacer } from 'src/lib/utils';

// 配置
const RPC_URL = process.env.BASE_HTTP_URL || 'https://mainnet.base.org';
const THE_GRAPH_API_KEY = process.env.THE_GRAPH_API_KEY || '';

function formatDecodedFunctions(decodedFunctions: any[]): string {
    let result = '';
    decodedFunctions.forEach((item, index) => {
        if (item.poolInfo) {
            const tokens = item.poolInfo.tokens.map((token: string, i: number) => {
                const symbol = item.poolInfo.tokenSymbols?.[i] || token;
                return `[${symbol}]`;
            }).join('-');
            
            // 格式化输入参数
            const inputs = item.function.inputs.map((input: any) => 
                `${input.name}=${JSON.stringify(input.value, replacer)}`
            ).join(', ');
            
            // 格式化输出参数
            const outputs = item.function.outputs.map((output: any) => 
                `${output.name}=${JSON.stringify(output.value, replacer)}`
            ).join(', ');
            
            // 添加 gasUsed 信息
            const gasUsed = item.gasUsed ? ` gasUsed=${Number(item.gasUsed)}` : '';
            
            result += `[${index}] ${tokens} ${item.address} ${item.poolInfo.protocol} ${item.function.name}(${inputs}) => (${outputs})${gasUsed}\n`;
        }
    });
    return result;
}

async function analyzeTrace(traceFilePath: string) {
    try {
        console.log('开始分析trace文件:', traceFilePath);
        
        // 读取trace文件
        const traceData = JSON.parse(readFileSync(traceFilePath, 'utf-8')) as TraceCall;
        console.log('成功读取trace数据');
        
        // 初始化helper
        console.log('初始化分析工具...');
        const arbHelper = new ArbHelper(RPC_URL, THE_GRAPH_API_KEY);
        const traceHelper = new TraceHelper(arbHelper);
        
        // 分析trace
        console.log('开始解码trace数据...');
        const analysisResult = await traceHelper.analyzeTrace(traceData);
        console.log('trace解码完成');
        
        // 生成简洁的分析报告
        const report = formatDecodedFunctions(analysisResult.decodedFunctions);
        
        // 保存文本格式的分析报告
        const textOutputPath = traceFilePath.replace('.json', '-analyzed.txt');
        writeFileSync(textOutputPath, report);
        console.log(`分析报告已保存到: ${textOutputPath}`);
        
    } catch (error) {
        console.error('分析trace时发生错误:', error);
    }
}

// 使用示例
const traceFilePath = join(__dirname, '../../data/trace/0x6f0f0298782190d84304a9aacc9504f9ecec8b60481973e623c1ecb5882c9820.json');

analyzeTrace(traceFilePath); 