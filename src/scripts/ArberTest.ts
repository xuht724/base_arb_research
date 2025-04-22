import { readFileSync } from "fs"
import { USDC_ADDRESS, WETH_ADDRESS } from "src/common/constants";
import { ArbFinder } from "src/lib/arbFinder/arbFinder";
import { PoolUtils } from "src/lib/pool/utils";
import { reviver } from "src/lib/utils";
import { formatEther, parseEther } from "viem";


function load2Pool(blockNumber: number) {
  const fileName = `./data/${blockNumber}_pools_snapshot.json`;
  const data = JSON.parse(readFileSync(fileName).toString(), reviver);
  const pool1 = PoolUtils.createPoolFromJSON(data[0]);
  const pool2 = PoolUtils.createPoolFromJSON(data[1]);
  if(pool1 && pool2){
    return [pool1,pool2]
  }else{
    throw new Error("Wrong pool data");
  }
}

function main(){
  const [pool1,pool2] = load2Pool(27397610);
  console.log(pool1.getStaticInfo());
  console.log(pool2.getStaticInfo());

  const baseInput = parseEther('0.001');
  const maxInput = parseEther('0.03');
  console.log("===Tender Search===")
  console.log("Range", formatEther(baseInput),'->',formatEther(maxInput));
  

  const res= ArbFinder.find2poolArbByTenderSearch(
    WETH_ADDRESS,
    "0x23a96680ccde03bd4bdd9a3e9a0cb56a5d27f7c9",
    baseInput,
    maxInput,
    pool1,
    pool2
  )
  console.log(res);
  console.log('optInput', formatEther(res.optInput));
  console.log('optProfit', formatEther(res.optProfit));

  // console.log("===My Algo===")
  // const res2= ArbFinder.find2poolArbByMyalgo(
  //   WETH_ADDRESS,
  //   USDC_ADDRESS,
  //   baseInput,
  //   maxInput,
  //   pool1,
  //   pool2
  // )
  // console.log(res2);
  // console.log('optInput', formatEther(res2.optInput));
  // console.log('optProfit', formatEther(res2.optProfit));


} 
main();

// -1187325852n
// -449529336n