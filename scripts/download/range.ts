import axios from 'axios';

interface BlockResponse {
  status: string;
  message: string;
  result: string;
}

async function getBlockNumberByTimestamp(timestamp: number, apiKey: string): Promise<number> {
  try {
    const url = 'https://api.basescan.org/api';
    const params = {
      module: 'block',
      action: 'getblocknobytime',
      timestamp: timestamp,
      closest: 'before',
      apikey: apiKey
    };

    console.log('请求参数:', params);
    
    const response = await axios.get<BlockResponse>(url, { params });
    console.log('API响应:', response.data);

    if (response.data.status === '1' && response.data.result) {
      return parseInt(response.data.result);
    } else {
      throw new Error(`API Error: ${response.data.message} (Status: ${response.data.status})`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API请求失败:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        params: error.config?.params
      });
    }
    console.error('获取区块号失败:', error);
    throw error;
  }
}

async function main() {
  const apiKey = process.env.BASE_SCAN_API;
  if (!apiKey) {
    console.error('请设置 BASE_SCAN_API 环境变量');
    process.exit(1);
  }

  // 解析命令行参数
  const startDate = "2025-04-23";
  const endDate = "2025-05-01";

  // if (!startDate || !endDate) {
  //   console.error('请提供开始和结束日期，格式：YYYY-MM-DD');
  //   console.error('示例：bun run scripts/download/range.ts 2023-09-01 2024-05-01');
  //   process.exit(1);
  // }

  try {
    // 转换日期为时间戳
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

    console.log(`开始获取区块范围...`);
    console.log(`开始时间: ${new Date(startTimestamp * 1000).toLocaleString()}`);
    console.log(`结束时间: ${new Date(endTimestamp * 1000).toLocaleString()}`);
    console.log(`API密钥: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);

    // 获取开始和结束区块号
    const startBlock = await getBlockNumberByTimestamp(startTimestamp, apiKey);
    const endBlock = await getBlockNumberByTimestamp(endTimestamp, apiKey);

    console.log('\n区块范围:');
    console.log(`开始区块: ${startBlock}`);
    console.log(`结束区块: ${endBlock}`);
    console.log(`总区块数: ${endBlock - startBlock + 1}`);

    // 输出用于下载脚本的命令
    console.log('\n使用以下命令下载区块数据:');
    console.log(`bun run scripts/download-blocks.ts ${startBlock} ${endBlock}`);

  } catch (error) {
    console.error('执行失败:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
