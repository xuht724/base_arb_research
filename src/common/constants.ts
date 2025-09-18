import { ProtocolType } from "./types";

// ===== Chain IDs =====
export const ETH_CHAIN_ID = 1;
export const BASE_CHAIN_ID = 8453;

// ===== Tick Boundaries =====
export const V3_MAX_TICK = 887272n;
export const V3_MIN_TICK = -887272n;

// ===== Token Addresses =====
// --- Ethereum Mainnet ---
export const ETH_WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const ETH_USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".toLowerCase();
export const ETH_USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7".toLowerCase();
export const ETH_DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f".toLowerCase();
export const ETH_3CRV_TOKEN = "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490".toLowerCase();

// --- Base Chain ---
export const BASE_WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
export const BASE_USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const BASE_USDbC_ADDRESS = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca";
export const BASE_DAI_ADDRESS = "0x50c5725949a6f0c72e6c4a641f24049a917db0cb";
export const BASE_VIRTUAL_ADDRESS = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b";

// ===== Curve Pool Addresses =====
export const ETH_CURVE_3POOL_ADDRESS = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7"; // Ethereum Curve 3Pool
export const ETH_CURVE_GAUGE_3POOL = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A"; // 3Pool Liquidity Gauge

// ===== Router / Pool Addresses =====
export const UNISWAP_V3_WETH_USDC_500 = "0xd0b53D9277642d899DF5C87A3966A349A798F224";
export const UNISWAP_V3_WETH_USDC_3000 = "0x6c561B446416E1A00E8E93E221854d6eA4171372";

// ===== DEX Factory Addresses =====
// --- Base Chain ---
export const BASE_UNISWAP_V2_FACTORY = "0x8909dc15e40173ff4699343b6eb8132c65e18ec6";
export const BASE_UNISWAP_V3_FACTORY = "0x33128a8fc17869897dce68ed026d694621f6fdfd";
export const BASE_AERODROME_V2_FACTORY = "0x420dd381b31aef6683db6b902084cb0ffece40da";
export const BASE_AERODROME_V3_FACTORY = "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a";
export const BASE_SOLIDV3_FACTORY = "0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687";
export const BASE_DACKIE_V3_FACTORY = "0xb5620f90e803c7f957a9ef351b8db3c746021bea";
export const BASE_ALIEN_V3_FACTORY = "0x0fd83557b2be93617c9c1c1b6fd549401c74558c";
export const BASE_PANCAKE_V2_FACTORY = "0xfda619b6d20975be80a10332cd39b9a4b0faa8bb";
export const BASE_PANCAKE_V3_FACTORY = "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865";
export const BASE_UNISWAP_V4_POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";

// --- Ethereum Mainnet ---
export const ETH_UNISWAP_V2_FACTORY = "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f";
export const ETH_UNISWAP_V3_FACTORY = "0x1f98431c8ad98523631ae4a59f267346ea31f984";
export const ETH_SUSHISWAP_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac";
export const ETH_PANCAKESWAP_V2_FACTORY = "0x1097053fd2ea711dad45caccc45eff7548fcb362";
export const ETH_PANCAKESWAP_V3_FACTORY = "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865";
export const ETH_UNISWAP_V4_POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90".toLowerCase();

// ===== Registry / Vaults =====
export const ETH_CURVE_REGISTRY = "0x90e00ace148ca3b23ac1bc8c240c2a7dd9c2d7f5";
export const ETH_BALANCER_V2_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
export const BASE_BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8"; // Same address as mainnet due to create2


// ===== Special Contracts =====
export const UNISWAP_FEE_ON_TRANSFER_FEE_DETECTOR = "0xcf6220e4496b091a6b391d48e770f1fbac63e740";
export const BASE_UNISWAP_FEE_COLLECTOR = "0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14";

// ===== Factory-to-Protocol Mapping =====
export const FACTORY_MAP: { [factory: string]: string } = {
  // Base Chain
  [BASE_UNISWAP_V2_FACTORY.toLowerCase()]: ProtocolType.UNISWAPV2,
  [BASE_UNISWAP_V3_FACTORY.toLowerCase()]: ProtocolType.UNISWAPV3,
  [BASE_AERODROME_V2_FACTORY.toLowerCase()]: ProtocolType.AERODROMEV2,
  [BASE_AERODROME_V3_FACTORY.toLowerCase()]: ProtocolType.AERODROMEV3,
  [BASE_SOLIDV3_FACTORY.toLowerCase()]: ProtocolType.SOLIDSWAP,
  [BASE_DACKIE_V3_FACTORY.toLowerCase()]: ProtocolType.DACKIEV3,
  [BASE_ALIEN_V3_FACTORY.toLowerCase()]: ProtocolType.ALIENV3,
  [BASE_PANCAKE_V2_FACTORY.toLowerCase()]: ProtocolType.PANCAKEV2,
  [BASE_PANCAKE_V3_FACTORY.toLowerCase()]: ProtocolType.PANCAKEV3,
  [BASE_UNISWAP_V4_POOL_MANAGER.toLowerCase()]: ProtocolType.UNISWAPV4,
  // Ethereum Mainnet
  [ETH_UNISWAP_V2_FACTORY.toLowerCase()]: ProtocolType.UNISWAPV2,
  [ETH_UNISWAP_V3_FACTORY.toLowerCase()]: ProtocolType.UNISWAPV3,
  [ETH_SUSHISWAP_FACTORY.toLowerCase()]: ProtocolType.SUSHISWAP,
  [ETH_PANCAKESWAP_V2_FACTORY.toLowerCase()]: ProtocolType.PANCAKEV2,
  [ETH_PANCAKESWAP_V3_FACTORY.toLowerCase()]: ProtocolType.PANCAKEV3,
  [ETH_BALANCER_V2_VAULT.toLowerCase()]: ProtocolType.BALANCERV2,
  [ETH_UNISWAP_V4_POOL_MANAGER.toLowerCase()]: ProtocolType.UNISWAPV4,
};

// ===== Chain Type Definition =====
export type ChainType = 'ethereum' | 'base';

// ===== Chain Constants Helper Class =====
export class ChainConstants {
  // Token address mapping
  private static TOKEN_ADDRESSES: Record<ChainType, Record<string, string>> = {
    ethereum: {
      WETH: ETH_WETH_ADDRESS,
      USDC: ETH_USDC_ADDRESS,
      USDT: ETH_USDT_ADDRESS,
      DAI: ETH_DAI_ADDRESS,
    },
    base: {
      WETH: BASE_WETH_ADDRESS,
      USDC: BASE_USDC_ADDRESS,
      USDbC: BASE_USDbC_ADDRESS,
      DAI: BASE_DAI_ADDRESS,
    },
  };

  // Contract address mapping
  private static CONTRACT_ADDRESSES: Record<ChainType, Record<string, string>> = {
    ethereum: {
      BALANCER_VAULT: ETH_BALANCER_V2_VAULT,
      UNISWAP_V4_POOL_MANAGER: ETH_UNISWAP_V4_POOL_MANAGER,
    },
    base: {
      BALANCER_VAULT: BASE_BALANCER_VAULT,
      UNISWAP_V4_POOL_MANAGER: BASE_UNISWAP_V4_POOL_MANAGER,
    },
  };

  // Get token address by chain and token symbol
  public static getTokenAddress(chainType: ChainType, token: string): string | undefined {
    return this.TOKEN_ADDRESSES[chainType]?.[token];
  }

  public static getV4SubgraphUrl(chainType: ChainType): string {
    if (chainType === 'ethereum') {
      return "https://gateway.thegraph.com/api/subgraphs/id/DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G";
    } else if (chainType === 'base') {
      return "https://gateway.thegraph.com/api/subgraphs/id/HNCFA9TyBqpo5qpe6QreQABAA1kV8g46mhkCcicu6v2R";
    }else{
      throw new Error('Unsupported chain type');
    }
  }


  // Get contract address by chain and contract name
  public static getContractAddress(chainType: ChainType, contract: string): string | undefined {
    return this.CONTRACT_ADDRESSES[chainType]?.[contract];
  }

  // Check if address is WETH for given chain
  public static isWETH(chainType: ChainType, address: string): boolean {
    const wethAddress = this.getTokenAddress(chainType, 'WETH');
    return wethAddress ? address.toLowerCase() === wethAddress.toLowerCase() : false;
  }

  // Get protocol by factory address
  public static getProtocolByFactory(factory: string): string {
    return FACTORY_MAP[factory.toLowerCase()] || 'Unknown';
  
  }
}
