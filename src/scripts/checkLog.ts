import { replacer } from "src/lib/utils";
import { ChainHelper } from "../lib/chain/helper";

async function checkLogs() {
    const chainHelper = new ChainHelper("https://mainnet.base.org");
    
    const addresses = [
        "0x72ab388e2e2f6facef59e3c3fa2c4e29011c2d38",
        "0xf6062550e8711dd6a38ca87299b14dcd6d45d783",
        "0xf6c0a374a483101e04ef5f7ac9bd15d9142bac95"
    ] as `0x${string}`[];
    
    const blockNumber = 29224626n;
    
    try {
        const logs = await chainHelper.getLogs(addresses, blockNumber);
        console.log("Logs:", JSON.stringify(logs, replacer, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

checkLogs();

//0xb5c3cf4222b090df7f16084c28932c64bc74248536a16263f2cedf92f2644dd4

//0x075afe817061a77a2b32d79b092c1bcd1bc518b6cd20a9303d930d57207096bb