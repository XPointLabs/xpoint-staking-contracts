// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

contract MockRewardPoolCheckpoint {
    uint256 public checkpointCount;
    uint256 public totalDeposited;

    function checkpoint() external {
        checkpointCount++;
    }

    function deposit(uint256 amount) external {
        totalDeposited += amount;
    }
}
