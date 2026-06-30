// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

interface IActiveStakeProvider {
    function totalActiveStake() external view returns (uint256);
}
