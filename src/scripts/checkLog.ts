import { replacer } from "src/lib/utils";
import { ChainHelper } from "../lib/chain/helper";

async function checkLogs() {
    const chainHelper = new ChainHelper("https://mainnet.base.org");
    
    const addresses = [
        "0xF6C0A374a483101e04EF5F7Ac9Bd15d9142BAC95",
        "0xF6062550e8711dd6A38Ca87299b14dCD6D45d783",
        "0x72AB388E2E2F6FaceF59E3C3FA2C4E29011c2D38"
    ] as `0x${string}`[];
    
    const blockNumber = 29021947n;
    
    try {
        const logs = await chainHelper.getLogs(addresses, blockNumber);
        console.log("Logs:", JSON.stringify(logs, replacer, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

checkLogs();

//0xb5c3cf4222b090df7f16084c28932c64bc74248536a16263f2cedf92f2644dd4
