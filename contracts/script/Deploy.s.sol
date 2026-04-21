// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SekiPredictCore} from "../src/SekiPredictCore.sol";
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice For BSC Testnet we deploy a Mock SEKI alongside the core,
///         since real SEKI lives on BSC mainnet only.
contract MockSEKI is ERC20 {
    constructor(address mintTo) ERC20("SEKI (Test)", "tSEKI") {
        _mint(mintTo, 1_000_000_000 ether);
    }
}

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address sekiOverride = vm.envOr("SEKI_ADDRESS", address(0));

        vm.startBroadcast(pk);
        address seki = sekiOverride;
        if (seki == address(0)) {
            MockSEKI m = new MockSEKI(deployer);
            seki = address(m);
            console2.log("MockSEKI deployed:", seki);
        } else {
            console2.log("Using existing SEKI:", seki);
        }
        SekiPredictCore core = new SekiPredictCore(seki);
        console2.log("SekiPredictCore deployed:", address(core));
        console2.log("Owner/keeper:", deployer);
        vm.stopBroadcast();
    }
}
