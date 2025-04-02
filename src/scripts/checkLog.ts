import { replacer } from "src/lib/utils";
import { ChainHelper } from "../lib/chain/helper";

async function checkLogs() {
    const chainHelper = new ChainHelper("https://mainnet.base.org");
    
    const addresses = [
        "0xF68001b66Cb98345C05b2e3EFDEe1dB8Fc01A76c",
        "0xa1B6F148F208FFe9Eb04C68BcBFEa3525f2536d6"
    ] as `0x${string}`[];
    
    const blockNumber = 27394527n;
    
    try {
        const logs = await chainHelper.getLogs(addresses, blockNumber);
        console.log("Logs:", JSON.stringify(logs, replacer, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

checkLogs();
