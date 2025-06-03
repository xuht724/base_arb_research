export const BASE_CHAIN_ID = 8453;
export const V3_MAX_TICK = 887272n;
export const V3_MIN_TICK = -887272n;

export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
export const USDbC_ADDRESS = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca";
export const USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const VIRTUAL_ADDRESS = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b";
export const AERODROME_ADDRESS = "0x940181a94a35a4569e4529a3cdfb74e38fd98631";
export const DAI_ADDRESS = "0x50c5725949a6f0c72e6c4a641f24049a917db0cb";
export const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";

// DEX Constants
export const UNISWAP_V2_FACTORY = "0x8909dc15e40173ff4699343b6eb8132c65e18ec6";
export const UNISWAP_V3_FACTORY = "0x33128a8fc17869897dce68ed026d694621f6fdfd";
export const AERODORME_V2_FACTORY = "0x420dd381b31aef6683db6b902084cb0ffece40da";
export const AERODORME_V3_FACTORY = "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a";
export const SOLIDV3_FACTORY = "0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687";
export const DACKIE_V3_FACTORY = "0xb5620f90e803c7f957a9ef351b8db3c746021bea";
export const ALIEN_V3_FACTORY = "0x0fd83557b2be93617c9c1c1b6fd549401c74558c";
export const PANCAKE_V2_FACTORY = "0xfda619b6d20975be80a10332cd39b9a4b0faa8bb";
export const PANCAKE_V3_FACTORY = "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865";
// 已知的factory地址映射
export const FACTORY_MAP: { [key: string]: string } = {
  [UNISWAP_V2_FACTORY.toLowerCase()]: 'UniV2', // Uniswap V2
  [UNISWAP_V3_FACTORY.toLowerCase()]: 'UniV3', // Uniswap V3
  [AERODORME_V2_FACTORY.toLowerCase()]: 'AeroV2', // Aerodrome V2
  [AERODORME_V3_FACTORY.toLowerCase()]: 'AeroV3', // Aerodrome V3
  [SOLIDV3_FACTORY.toLowerCase()]: 'SolidV3', // Solid V3
  [PANCAKE_V2_FACTORY.toLowerCase()]: 'PancakeV2', // Pancake V2
  [PANCAKE_V3_FACTORY.toLowerCase()]: 'PancakeV3', // Pancake V3
  [ALIEN_V3_FACTORY.toLowerCase()]: 'AlienV3', // Alien V3
  [DACKIE_V3_FACTORY.toLowerCase()]: 'DackieV3', // Dackie V3
};

export const UNISWAP_V3_WETH_USDC_500 = "0xd0b53D9277642d899DF5C87A3966A349A798F224";
export const UNISWAP_V3_WETH_USDC_3000 = "0x6c561B446416E1A00E8E93E221854d6eA4171372";
export const UNISWAP_FEE_ON_TRANSFER_FEE_DETECTOR = "0xcf6220e4496b091a6b391d48e770f1fbac63e740";

export const BASE_UNISWAP_FEE_COLLECTOR =
  "0x7ffc3dbf3b2b50ff3a1d5523bc24bb5043837b14";
