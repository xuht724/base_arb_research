import { ChainHelper } from "src/lib/chain/helper";
import { replacer } from "src/lib/utils";
import { writeFileSync } from "fs";

async function main() {
  const UNISWAP_V3_WETH_HENLO = "0xF68001b66Cb98345C05b2e3EFDEe1dB8Fc01A76c";
  const AERODROME_V3_WETH_HENLO = "0xa1B6F148F208FFe9Eb04C68BcBFEa3525f2536d6";

  const helper = new ChainHelper(process.env.BASE_HTTP_URL3!);
  // const blockNumber = 27394526n;
  const blockNumber = 27397610n;
  
  // const trxIndex = 58;
  const trxIndex = 16;

  const pools = await helper.batchCallUniV3Pool([
    UNISWAP_V3_WETH_HENLO,
    AERODROME_V3_WETH_HENLO
  ], true, blockNumber);

  // download logs
  const logs = await helper.getLogs([UNISWAP_V3_WETH_HENLO, AERODROME_V3_WETH_HENLO], blockNumber + 1n);
  console.log(logs);
  
  for (const log of logs) {
    if (log.transactionIndex && log.transactionIndex < trxIndex) {
      for (const pool of pools) {
        if(pool.poolId === log.address) {
          pool.handleLog(log);
        }
      }
    }
  }

  const results = [
    pools[0].exportToJSON(),
    pools[1].exportToJSON(),
  ]
  writeFileSync(`./data/${blockNumber}_pools_snapshot.json`, JSON.stringify(results, replacer, 2))
}
main()