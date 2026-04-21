// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Oracle interface for resolving event-based markets.
/// outcome = 0 means UNRESOLVED or VOID (refund). >=1 = winning option index (1-based).
interface IEventOracle {
    function outcomeOf(uint256 marketId) external view returns (uint8 outcome, bool finalized);
}
