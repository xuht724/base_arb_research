// This script is to download 2 pool for (univ3 weth/usdc)
import { Token } from "src/common/types";
import { ChainHelper } from "src/lib/chain/helper";
import { UNISWAP_V3_WETH_USDC_3000, UNISWAP_V3_WETH_USDC_500 } from "src/common/constants";
import { writeFileSync } from "fs";
import { replacer } from "src/lib/utils";

async function main() {
  const url = process.env.BASE_HTTP_URL3!
  console.log("url", url);

  const helper = new ChainHelper(url);
  const begin = performance.now();
  const blockNumber = await helper.httpClient.getBlockNumber();

  const [
    pool1,
    pool2,
  ] = await helper.batchCallUniV3Pool([
    UNISWAP_V3_WETH_USDC_3000,
    UNISWAP_V3_WETH_USDC_500
  ],
    true,
    blockNumber
  );
  const end = performance.now();
  console.log("Call Base time cost", end - begin);

  console.log(pool1.getStaticInfo());
  console.log(pool2.getStaticInfo());

  const results = [
    pool1.exportToJSON(),
    pool2.exportToJSON(),
  ]
  writeFileSync(`./data/${blockNumber}_pools_snapshot.json`, JSON.stringify(results, replacer, 2))
}

main();
