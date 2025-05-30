// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";


contract CounterTest is Test {
    Counter public counter;
    // address constant WETH = 0x4200000000000000000000000000000000000006;
    // address constant USDC = 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913;

    function setUp() public {
        // 创建特定区块和交易后的 fork
        bytes32 txHash = 0x5d41ee83179defa0ac828f1dfcb47ff7140e9d7b55f4051aae549360bf61d34b;
        uint256 forkId = vm.createFork(
            "https://base-mainnet.core.chainstack.com/1acdea40c9ad7f49fc2be9181c350461",
            txHash
        );

        // target trx hash = 0xbd78bf43c2a3eca9168eafb8b6a8c579658281d8f1163a33e5f535e0f944c419
        
        vm.selectFork(forkId);
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
        // 测试的池子地址
        address pool1 = 0xa575dcdc023db26479379375731a05E8F580409E;
        address pool2 = 0x0197B7c77F8ecB9857f110e59bdFB401471dDD95;


        // uint256 inputAmount = 22168272018432617;  // 去掉小数点后18位
        
        // 添加状态检查
        // console.log("Current Block:", block.number);
        // console.log("Current Pool:", pool);

        uint256 baseInput = 0.001 ether;
        uint256 maxInput = 0.05 ether;

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
}
