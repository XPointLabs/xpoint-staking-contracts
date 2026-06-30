// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

contract MockActiveStakeProvider {
    uint256 public totalActiveStake;

    constructor(uint256 initialActiveStake) {
        totalActiveStake = initialActiveStake;
    }

    function setTotalActiveStake(uint256 newActiveStake) external {
        totalActiveStake = newActiveStake;
    }
}
