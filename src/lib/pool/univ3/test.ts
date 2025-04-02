import Web3, { HttpProvider } from "web3";
import { expect, test } from "bun:test";
import { base, mainnet } from "viem/chains";
import {
  createPublicClient,
  http,
  PublicClient,
  parseUnits,
  encodePacked,
  formatUnits,
  getAddress,
} from "viem";
import { UniV3QuoterV2ABI } from "src/lib/abi/uniswap/uniswapQuoter";
import { Token } from "src/common/types";
import { ChainHelper } from "src/lib/chain/helper";
import { UNISWAP_V3_WETH_USDC_3000 } from "src/common/constants";

class Helper {
  web3: Web3;
  private readonly httpClient: PublicClient;

  constructor(url: string) {
    this.web3 = new Web3(new HttpProvider(url));
  }

  private encodePath(
    isZeroForOne: boolean,
    token0: string,
    token1: string,
    fee: number,
  ) {
    let type_list = ["address", "uint24", "address"];
    let token_fee_list: any[] = [];
    if (isZeroForOne) {
      token_fee_list = [token0, fee, token1];
    } else {
      token_fee_list = [token1, fee, token0];
    }
    const path = encodePacked(type_list, token_fee_list);
    return path;
  }

  public async quoteV3Out(
    indexIn: number,
    indexOut: number,
    tokenIn: string,
    tokenOut: string,
    fee: bigint,
    amountIn: bigint,
    blockNumber?: bigint,
  ) {
    let isZeroForOne = indexIn === 0 ? true : false;
    // console.log(isZeroForOne);
    let token0 = indexIn === 0 ? tokenIn : tokenOut;
    let token1 = indexIn === 0 ? tokenOut : tokenIn;

    let path = this.encodePath(isZeroForOne, token0, token1, Number(fee));

    let quoteContract = new this.web3.eth.Contract(
      UniV3QuoterV2ABI,
      "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    );
    let res = await quoteContract.methods
      .quoteExactInput(path, amountIn)
      .call(undefined, blockNumber);
    return res.amountOut;
  }
}

async function main() {
  const address = getAddress(UNISWAP_V3_WETH_USDC_3000);
  const url = process.env.BASE_HTTP_URL!
  console.log("url", url);

  const helper = new ChainHelper(url);
  const web3Helper = new Helper(url);
  const begin = performance.now();
  const [pool] = await helper.batchCallUniV3Pool([address], true);
  const end = performance.now();
  console.log("Call Base time cost", end - begin);

  const blockNumber = undefined;

  const indexIn = 0;
  const indexOut = 1;
  const tokenIn = await helper.requestToken(pool.tokens[indexIn]);
  const tokenOut = await helper.requestToken(pool.tokens[indexOut]);
  const swapAmountNumber = parseUnits("1", tokenIn.decimals);

  const calculationRes = pool.getOutGivenIn({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: swapAmountNumber,
  });

  console.log(
    "input",
    formatUnits(swapAmountNumber, tokenIn.decimals),
    tokenIn.symbol,
    "output",
    formatUnits(calculationRes.amountOut, tokenOut.decimals),
    tokenOut.symbol,
  );

  console.log("State length", pool.exportToJSON().length);

  const quoteOut = (await web3Helper.quoteV3Out(
    indexIn,
    indexOut,
    tokenIn.address,
    tokenOut.address,
    pool.swapFee,
    swapAmountNumber,
    blockNumber,
  )) as bigint;
  console.log("quoteOut", formatUnits(quoteOut, tokenOut.decimals));
}

main();
