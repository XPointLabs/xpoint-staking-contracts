// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

import "../RewardRatePool.sol";

contract TestnetRewardRatePool is RewardRatePool {
    using SafeERC20 for IERC20;
    // Function to set the lastPaidOutTime (onlyOwner)
    function setLastPaidOutTime(uint256 _lastPaidOutTime) external onlyOwner {
        lastPaidOutTime = _lastPaidOutTime;
    }

    event XPNTWithdrawn(uint256 amount);

    // Function to withdraw XPNT tokens back to the owner
    function withdrawXPNT(uint256 amount) external onlyOwner {
        XPNT.safeTransfer(owner(), amount);
        emit XPNTWithdrawn(amount);
    }

}
