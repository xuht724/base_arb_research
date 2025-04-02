// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter public counter;
    // address constant WETH = 0x4200000000000000000000000000000000000006;
    // address constant USDC = 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913;

    function setUp() public {
        counter = new Counter();
    }

    // function testV3Swap() public {

        // counter.V3Swap(pool1, 100000000000000000000, true);
    // }

    function testArbOpportunity() public {
        // 设置输入范围
        uint256 baseInput = 0.0000001 ether;
        uint256 maxInput = 0.000001 ether;
        
        address pool1 = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
        address pool2 = 0x6c561B446416E1A00E8E93E221854d6eA4171372;
        // 记录初始余额
        // uint256 initialBalance = address(this).balance;
        
        // 执行套利
        (bool flag, uint256 optimalInput, int256 profit, uint256 getOutCalls) = counter.findOptimalArb(
            pool1,
            pool2,
            baseInput,
            maxInput,
            true
        );
        // 输出结果
        console.log("flag", flag);
        console.log("Optimal Input:", optimalInput);
        console.log("Expected Profit:", profit);
        console.log("Get Out Calls:", getOutCalls);
    }

    function testSwapAfterTx() public {
        // 创建特定区块和交易后的 fork
        uint256 forkId = vm.createFork(
            "https://base-mainnet.core.chainstack.com/1acdea40c9ad7f49fc2be9181c350461",
            "0xfc81de8bcd0a61bd3805e71e3b7d5234f88083b25397e44719f48eca54da2c09"
        );
        
        vm.selectFork(forkId);

        // 测试的池子地址
        address pool = 0xF68001b66Cb98345C05b2e3EFDEe1dB8Fc01A76c;
        
        // 设置输入金额 (0.000208297949983672 ETH)
        uint256 inputAmount = 208297949983672;  // 去掉小数点后18位
        
        // 调用swap函数测试
        int256 outputAmount = counter.V3Swap(
            pool,
            inputAmount,
            true  // 假设 WETH 是 token0，如果不是需要改为 false
        );
        
        // 输出结果
        console.log("Input WETH amount:", inputAmount);
        console.log("Output token amount:", outputAmount);
    }
}
