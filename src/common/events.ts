import { AbiEvent } from "viem";


// AeroV3Swap logs == V3Swap logs
export const logTopicsMap = {
  V2Swap: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
  V2Mint: "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f",
  V2Burn: "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496",
  AeroV2Swap:"0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b",
  AeroV3Swap:"0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  V3Swap: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  PancakeV3Swap:
    "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83",
  V3Mint: "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde",
  V3Burn: "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c",

  V2Created:
    "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
  V3Created:
    "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",

  OneInchOrderFilled:
    "0xb9ed0243fdf00f0545c63a0af8850c090d86bb46682baec4bf3c496814fe4f02",
  OneInchOrderCanceled:
    "0xcbfa7d191838ece7ba4783ca3a30afd316619b7f368094b57ee7ffde9a923db1",
  OneInchOrderFilledRFQ:
    "0xc3b639f02b125bfa160e50739b8c44eb2d1b6908e2b6d5925c6d770f2ca78127",

  UniOrderFill:
    "0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66",

  OneInchV6OrderFilled:
    "0xfec331350fce78ba658e082a71da20ac9f8d798a99b3c79681c8440cbfe77e07",
  OneInchV6OrderCanceled:
    "0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d",

  // balancer v2 related swap event
  BalancerVaultSwap:
    "0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b",
  BalancerVaultPoolBalanceChanged:
    "0xe5ce249087ce04f05a957192435400fd97868dba0e6a4b4c049abf8af80dae78",
  BalancerPoolSwapFeeChanged:
    "0xa9ba3ffe0b6c366b81232caab38605a0699ad5398d6cce76f91ee809e322dafc",
  
  // Curve事件
  CurveTokenExchange: "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140",
  CurveTokenExchangeUnderlying: "0xd013ca23e77a65003c2c659c5442c00c805371b7fc1ebd4c206c41d1536bd90b",
  // 更多Curve事件
  CurveAddLiquidity: "0x26f55a85081d24974e85c6c00045d0f0453991e95873f52bff0d21af4079a768",
  CurveRemoveLiquidity: "0x7c363854ccf79623411f8995b362bce5eddff18c927edc6f5dbbb5e05819a82c",
  CurveRemoveLiquidityOne: "0x5ad056f2e28a8cec232015406b843668c1e36cda598127ec3b8c59b8c72773a0",
  CurveRemoveLiquidityImbalance: "0x9878ca375e106f2a43c3ce99d8a7f5bb53dcbc7f220d786a4a64f2b58eaad389",
  // Crypto池事件
  CurveCryptoTokenExchange: "0x8d2a332135aad4639b9c2dfae908eb8bbdbc89a72a6810502aaf1e6df5f6b8fd",
  // Factory池特有事件
  CurveTokenExchangeUnderlying4: "0xd84721b231bebee334f84942126408364e65b4b836c6a6cd2bf16b47d7513707",
  // New Curve event types based on your implementation
  CurveTokenExchange2: "0xb2e76ae99761dc136e598d4a629bb347eccb9532a5f8bbd72e18467c3c34cc98",
  CurveTokenExchange3: "0x143f1f8e861fbdeddd5b46e844b7d3ac7b86a122f36e8c463859ee6811b1f29c",
  // UniswapV4 event
  UniswapV4Swap: "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc84",
} as const;

export const EventMapABI: { [key: string]: AbiEvent } = {
  V3Mint: {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "int24",
        name: "tickLower",
        type: "int24",
      },
      {
        indexed: true,
        internalType: "int24",
        name: "tickUpper",
        type: "int24",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "amount",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    name: "Mint",
    type: "event",
  },
  V3Burn: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "int24",
        name: "tickLower",
        type: "int24",
      },
      {
        indexed: true,
        internalType: "int24",
        name: "tickUpper",
        type: "int24",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "amount",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    name: "Burn",
    type: "event",
  },
  V3Swap: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "amount0",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "amount1",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "uint160",
        name: "sqrtPriceX96",
        type: "uint160",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "liquidity",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "int24",
        name: "tick",
        type: "int24",
      },
    ],
    name: "Swap",
    type: "event",
  },
  PancakeV3Swap: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "amount0",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "int256",
        name: "amount1",
        type: "int256",
      },
      {
        indexed: false,
        internalType: "uint160",
        name: "sqrtPriceX96",
        type: "uint160",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "liquidity",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "int24",
        name: "tick",
        type: "int24",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "protocolFeesToken0",
        type: "uint128",
      },
      {
        indexed: false,
        internalType: "uint128",
        name: "protocolFeesToken1",
        type: "uint128",
      },
    ],
    name: "Swap",
    type: "event",
  },
  AeroV2Swap:  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0Out",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1Out",
        type: "uint256",
      },
    ],
    name: "Swap",
    type: "event",
  },
  V2Swap: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1In",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0Out",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1Out",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "Swap",
    type: "event",
  },
  V2Mint: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    name: "Mint",
    type: "event",
  },
  V2Burn: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "Burn",
    type: "event",
  },
  UniOrderFill: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "orderHash",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "filler",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "swapper",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
    ],
    name: "Fill",
    type: "event",
  },
  OneInchV6Fill: {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "orderHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "remainingAmount",
        type: "uint256",
      },
    ],
    name: "OrderFilled",
    type: "event",
  },
  OneInchV6Cancel: {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "orderHash",
        type: "bytes32",
      },
    ],
    name: "OrderCancelled",
    type: "event",
  },
  OneInchV5Fill: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "orderHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "remaining",
        type: "uint256",
      },
    ],
    name: "OrderFilled",
    type: "event",
  },
  OneInchV5Cancel: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "maker",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "orderHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "remainingRaw",
        type: "uint256",
      },
    ],
    name: "OrderCanceled",
    type: "event",
  },
  BalancerVaultSwap: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "poolId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "contract IERC20",
        name: "tokenIn",
        type: "address",
      },
      {
        indexed: true,
        internalType: "contract IERC20",
        name: "tokenOut",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
    ],
    name: "Swap",
    type: "event",
  },
  BalancerVaultPoolBalanceChanged: {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "poolId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "liquidityProvider",
        type: "address",
      },
      {
        indexed: false,
        internalType: "contract IERC20[]",
        name: "tokens",
        type: "address[]",
      },
      {
        indexed: false,
        internalType: "int256[]",
        name: "deltas",
        type: "int256[]",
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "protocolFeeAmounts",
        type: "uint256[]",
      },
    ],
    name: "PoolBalanceChanged",
    type: "event",
  },
  BalancerPoolSwapFeeChanged: {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "swapFeePercentage",
        type: "uint256",
      },
    ],
    name: "SwapFeePercentageChanged",
    type: "event",
  },
  // Curve交换事件
  CurveTokenExchange: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "int128", name: "sold_id", type: "int128" },
      { indexed: false, internalType: "uint256", name: "tokens_sold", type: "uint256" },
      { indexed: false, internalType: "int128", name: "bought_id", type: "int128" },
      { indexed: false, internalType: "uint256", name: "tokens_bought", type: "uint256" }
    ],
    name: "TokenExchange",
    type: "event",
  },
  
  CurveTokenExchangeUnderlying: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "int128", name: "sold_id", type: "int128" },
      { indexed: false, internalType: "uint256", name: "tokens_sold", type: "uint256" },
      { indexed: false, internalType: "int128", name: "bought_id", type: "int128" },
      { indexed: false, internalType: "uint256", name: "tokens_bought", type: "uint256" }
    ],
    name: "TokenExchangeUnderlying",
    type: "event",
  },

  // 更多Curve事件
  CurveAddLiquidity: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: false, internalType: "uint256[]", name: "token_amounts", type: "uint256[]" },
      { indexed: false, internalType: "uint256[]", name: "fees", type: "uint256[]" },
      { indexed: false, internalType: "uint256", name: "invariant", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "token_supply", type: "uint256" }
    ],
    name: "AddLiquidity",
    type: "event",
  },

  CurveRemoveLiquidity: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: false, internalType: "uint256[]", name: "token_amounts", type: "uint256[]" },
      { indexed: false, internalType: "uint256[]", name: "fees", type: "uint256[]" },
      { indexed: false, internalType: "uint256", name: "token_supply", type: "uint256" }
    ],
    name: "RemoveLiquidity",
    type: "event",
  },

  CurveRemoveLiquidityOne: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: false, internalType: "uint256", name: "token_amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "coin_amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "token_supply", type: "uint256" }
    ],
    name: "RemoveLiquidityOne",
    type: "event",
  },

  CurveCryptoTokenExchange: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "uint256", name: "sold_id", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "tokens_sold", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "bought_id", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "tokens_bought", type: "uint256" }
    ],
    name: "TokenExchange",
    type: "event",
  },

  CurveTokenExchangeUnderlying4: {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "int128", name: "sold_id", type: "int128" },
      { indexed: false, internalType: "uint256", name: "tokens_sold", type: "uint256" },
      { indexed: false, internalType: "int128", name: "bought_id", type: "int128" },
      { indexed: false, internalType: "uint256", name: "tokens_bought", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "fee", type: "uint256" }
    ],
    name: "TokenExchangeUnderlying",
    type: "event",
  },
} as const;
