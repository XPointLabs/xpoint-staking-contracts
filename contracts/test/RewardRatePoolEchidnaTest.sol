// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

import "../RewardRatePool.sol";

contract RewardRatePoolEchidnaTest is RewardRatePool {
    uint128 public fuzzBalance;
    uint128 public fuzzActiveStake;
    uint32 public fuzzElapsed;

    function setInputs(uint128 balance, uint128 activeStakeAmount, uint32 elapsed) external {
        fuzzBalance = balance;
        fuzzActiveStake = activeStakeAmount;
        fuzzElapsed = elapsed;
    }

    function echidna_capped_payout_never_exceeds_either_ceiling() external view returns (bool) {
        uint256 capped = calculateCappedPayoutAmount(fuzzBalance, fuzzActiveStake, fuzzElapsed);
        uint256 poolCeiling = calculatePayoutAmount(fuzzBalance, fuzzElapsed);
        uint256 stakeCeiling = (
            uint256(fuzzActiveStake) * ACTIVE_STAKE_ANNUAL_PAYOUT_RATE * fuzzElapsed
        ) / (BASIS_POINTS * 365 days);
        return capped <= poolCeiling && capped <= stakeCeiling;
    }

    function echidna_zero_stake_has_zero_emission() external view returns (bool) {
        return calculateCappedPayoutAmount(fuzzBalance, 0, fuzzElapsed) == 0;
    }

    function echidna_approved_network_examples() external pure returns (bool) {
        uint256 unit = 1e9;
        uint256 pool = 40_000_000 * unit;
        uint256 stakePerNode = 25_000 * unit;
        return
            calculateCappedPayoutAmount(pool, 3 * stakePerNode, 365 days) == 22_500 * unit &&
            calculateCappedPayoutAmount(pool, 100 * stakePerNode, 365 days) == 750_000 * unit &&
            calculateCappedPayoutAmount(pool, 500 * stakePerNode, 365 days) == 3_750_000 * unit &&
            calculateCappedPayoutAmount(pool, 748 * stakePerNode, 365 days) == 5_600_000 * unit;
    }
}
