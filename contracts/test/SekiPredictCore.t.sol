// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SekiPredictCore} from "../src/SekiPredictCore.sol";
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

contract MockSEKI is ERC20 {
    constructor() ERC20("SEKI", "SEKI") {
        _mint(msg.sender, 1_000_000_000 ether);
    }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract SekiPredictCoreTest is Test {
    SekiPredictCore core;
    MockSEKI seki;
    address owner = address(this);
    address[] users;

    function setUp() public {
        seki = new MockSEKI();
        core = new SekiPredictCore(address(seki));
        for (uint i = 0; i < 8; i++) {
            address u = address(uint160(0x1000 + i));
            users.push(u);
            seki.mint(u, 1_000_000 ether);
            vm.prank(u);
            seki.approve(address(core), type(uint256).max);
        }
    }

    function _createBinary() internal returns (uint256 id) {
        id = core.createMarket("BTC>100k by Friday?", 2, 1 hours);
    }

    function test_BinaryHappyPath_WinnersSplit() public {
        uint256 id = _createBinary();
        // 4 users on YES (100, 200, 300, 400), 2 users on NO (500, 600)
        vm.prank(users[0]); core.bet(id, 1, 100 ether);
        vm.prank(users[1]); core.bet(id, 1, 200 ether);
        vm.prank(users[2]); core.bet(id, 1, 300 ether);
        vm.prank(users[3]); core.bet(id, 1, 400 ether);
        vm.prank(users[4]); core.bet(id, 2, 500 ether);
        vm.prank(users[5]); core.bet(id, 2, 600 ether);

        uint256 totalPool = 100 + 200 + 300 + 400 + 500 + 600;
        assertEq(core.optionTotal(id, 1), 1000 ether);
        assertEq(core.optionTotal(id, 2), 1100 ether);

        // close betting & propose YES
        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 1);

        // dispute window
        vm.warp(block.timestamp + 25 hours);
        core.finalize(id);

        // user[0] put 100 / yes_pool 1000 -> 10% of 2100 = 210
        uint256 before0 = seki.balanceOf(users[0]);
        vm.prank(users[0]); core.claim(id);
        assertEq(seki.balanceOf(users[0]) - before0, 210 ether);

        // user[3] put 400 -> 40% of 2100 = 840
        uint256 before3 = seki.balanceOf(users[3]);
        vm.prank(users[3]); core.claim(id);
        assertEq(seki.balanceOf(users[3]) - before3, 840 ether);

        // loser claims nothing
        vm.prank(users[4]);
        vm.expectRevert(bytes("nothing"));
        core.claim(id);

        totalPool; // silence
    }

    function test_BelowMinUniqueBettors_Refund() public {
        uint256 id = _createBinary();
        // only 3 unique bettors
        vm.prank(users[0]); core.bet(id, 1, 100 ether);
        vm.prank(users[1]); core.bet(id, 2, 200 ether);
        vm.prank(users[2]); core.bet(id, 1, 300 ether);

        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 1);
        vm.warp(block.timestamp + 25 hours);
        core.finalize(id);

        uint256 b0 = seki.balanceOf(users[0]);
        vm.prank(users[0]); core.claim(id);
        assertEq(seki.balanceOf(users[0]) - b0, 100 ether);

        uint256 b1 = seki.balanceOf(users[1]);
        vm.prank(users[1]); core.claim(id);
        assertEq(seki.balanceOf(users[1]) - b1, 200 ether);
    }

    function test_OwnerCancelDuringDispute_Refund() public {
        uint256 id = _createBinary();
        vm.prank(users[0]); core.bet(id, 1, 100 ether);
        vm.prank(users[1]); core.bet(id, 1, 200 ether);
        vm.prank(users[2]); core.bet(id, 2, 300 ether);
        vm.prank(users[3]); core.bet(id, 2, 400 ether);

        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 1);
        // cancel within window
        vm.warp(block.timestamp + 1 hours);
        core.cancelMarket(id);

        for (uint i = 0; i < 4; i++) {
            uint256 b = seki.balanceOf(users[i]);
            vm.prank(users[i]); core.claim(id);
            uint256 expected = i < 2 ? (i == 0 ? 100 ether : 200 ether) : (i == 2 ? 300 ether : 400 ether);
            assertEq(seki.balanceOf(users[i]) - b, expected);
        }
    }

    function test_CannotCancelAfterDisputeWindow() public {
        uint256 id = _createBinary();
        for (uint i = 0; i < 4; i++) {
            vm.prank(users[i]); core.bet(id, uint8((i % 2) + 1), 100 ether);
        }
        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 1);
        vm.warp(block.timestamp + 25 hours);
        vm.expectRevert(bytes("cannot cancel"));
        core.cancelMarket(id);
    }

    function test_VoidOutcome_Refund() public {
        uint256 id = _createBinary();
        for (uint i = 0; i < 4; i++) {
            vm.prank(users[i]); core.bet(id, 1, 100 ether);
        }
        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 0); // VOID
        vm.warp(block.timestamp + 25 hours);
        core.finalize(id);

        uint256 b = seki.balanceOf(users[0]);
        vm.prank(users[0]); core.claim(id);
        assertEq(seki.balanceOf(users[0]) - b, 100 ether);
    }

    function test_RaceMode_4Options() public {
        uint256 id = core.createMarket("Which horse?", 4, 1 hours);
        vm.prank(users[0]); core.bet(id, 1, 100 ether);
        vm.prank(users[1]); core.bet(id, 2, 200 ether);
        vm.prank(users[2]); core.bet(id, 3, 300 ether);
        vm.prank(users[3]); core.bet(id, 4, 400 ether);
        vm.prank(users[4]); core.bet(id, 3, 100 ether); // user5 on horse 3

        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 3);
        vm.warp(block.timestamp + 25 hours);
        core.finalize(id);

        uint256 totalPool = 100 + 200 + 300 + 400 + 100; // 1100
        // user2 stake 300 / pool3=400 -> 75% of 1100 = 825
        uint256 b2 = seki.balanceOf(users[2]);
        vm.prank(users[2]); core.claim(id);
        assertEq(seki.balanceOf(users[2]) - b2, (300 ether * 1100 ether) / 400 ether);

        // user4 stake 100 / pool3=400 -> 25% of 1100 = 275
        uint256 b4 = seki.balanceOf(users[4]);
        vm.prank(users[4]); core.claim(id);
        assertEq(seki.balanceOf(users[4]) - b4, (100 ether * 1100 ether) / 400 ether);

        totalPool;
    }

    function test_NoDoubleClaim() public {
        uint256 id = _createBinary();
        for (uint i = 0; i < 4; i++) {
            vm.prank(users[i]); core.bet(id, 1, 100 ether);
        }
        vm.warp(block.timestamp + 2 hours);
        core.proposeOutcome(id, 1);
        vm.warp(block.timestamp + 25 hours);
        core.finalize(id);

        vm.prank(users[0]); core.claim(id);
        vm.prank(users[0]);
        vm.expectRevert(bytes("claimed"));
        core.claim(id);
    }

    function test_CannotBetAfterClose() public {
        uint256 id = _createBinary();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(users[0]);
        vm.expectRevert(bytes("closed"));
        core.bet(id, 1, 100 ether);
    }

    function test_OnlyOwnerPropose() public {
        uint256 id = _createBinary();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(users[0]);
        vm.expectRevert();
        core.proposeOutcome(id, 1);
    }
}
