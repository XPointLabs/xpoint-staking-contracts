// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "./interfaces/IRewardPoolDeposit.sol";

/**
 * @title OpsBudgetEscrow
 * @dev Holds the monthly ops budget slice of XPNT subscription revenue. The designated ops claimer
 * can withdraw a closed epoch during its claim window, while any unclaimed remainder becomes
 * permissionlessly sweepable back into the reward pool after the deadline.
 */
contract OpsBudgetEscrow is Initializable, Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant VERSION = 1;

    error NullAddress();
    error InvalidEpochConfiguration();
    error UnauthorizedDepositor(address caller);
    error UnauthorizedClaimer(address caller);
    error ZeroAmount();
    error EpochStillOpen(uint64 epochId, uint64 closesAt);
    error ClaimWindowClosed(uint64 epochId, uint64 deadline);
    error ClaimWindowStillOpen(uint64 epochId, uint64 deadline);
    error EpochAlreadySwept(uint64 epochId);
    error AmountExceedsClaimable(uint256 requested, uint256 available);

    IERC20 public xpnt;
    IRewardPoolDeposit public rewardPool;
    address public subscriptionManager;
    address public opsClaimer;
    uint64 public epochZeroTimestamp;
    uint32 public epochDuration;
    uint32 public claimWindow;

    struct EpochState {
        uint128 deposited;
        uint128 claimed;
        bool swept;
    }

    mapping(uint64 => EpochState) public epochs;

    event SubscriptionManagerUpdated(address indexed previousManager, address indexed newManager);
    event OpsClaimerUpdated(address indexed previousClaimer, address indexed newClaimer);
    event RewardPoolUpdated(address indexed previousRewardPool, address indexed newRewardPool);
    event EpochDeposited(uint64 indexed epochId, uint256 amount);
    event EpochClaimed(uint64 indexed epochId, address indexed to, uint256 amount);
    event EpochSwept(uint64 indexed epochId, uint256 amount);

    modifier onlySubscriptionManager() {
        if (msg.sender != subscriptionManager) revert UnauthorizedDepositor(msg.sender);
        _;
    }

    function initialize(
        address xpnt_,
        address rewardPool_,
        address opsClaimer_,
        uint64 epochZeroTimestamp_,
        uint32 epochDuration_,
        uint32 claimWindow_
    ) public initializer {
        if (xpnt_ == address(0) || rewardPool_ == address(0) || opsClaimer_ == address(0)) revert NullAddress();
        if (epochDuration_ == 0 || claimWindow_ == 0 || epochZeroTimestamp_ > block.timestamp) {
            revert InvalidEpochConfiguration();
        }

        xpnt = IERC20(xpnt_);
        rewardPool = IRewardPoolDeposit(rewardPool_);
        opsClaimer = opsClaimer_;
        epochZeroTimestamp = epochZeroTimestamp_;
        epochDuration = epochDuration_;
        claimWindow = claimWindow_;

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
    }

    function setSubscriptionManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert NullAddress();
        emit SubscriptionManagerUpdated(subscriptionManager, newManager);
        subscriptionManager = newManager;
    }

    function setOpsClaimer(address newClaimer) external onlyOwner {
        if (newClaimer == address(0)) revert NullAddress();
        emit OpsClaimerUpdated(opsClaimer, newClaimer);
        opsClaimer = newClaimer;
    }

    function setRewardPool(address newRewardPool) external onlyOwner {
        if (newRewardPool == address(0)) revert NullAddress();
        emit RewardPoolUpdated(address(rewardPool), newRewardPool);
        rewardPool = IRewardPoolDeposit(newRewardPool);
    }

    function depositCurrentEpoch(uint256 amount) external onlySubscriptionManager nonReentrant {
        if (amount == 0) revert ZeroAmount();

        uint64 epochId = currentEpochId();
        epochs[epochId].deposited += SafeCast.toUint128(amount);
        xpnt.safeTransferFrom(msg.sender, address(this), amount);

        emit EpochDeposited(epochId, amount);
    }

    function claimClosedEpoch(uint64 epochId, uint256 amount, address to) external nonReentrant {
        if (msg.sender != opsClaimer) revert UnauthorizedClaimer(msg.sender);
        if (to == address(0)) revert NullAddress();
        if (amount == 0) revert ZeroAmount();

        (, uint64 closesAt, uint64 deadline) = _epochTimes(epochId);
        if (block.timestamp < closesAt) revert EpochStillOpen(epochId, closesAt);
        if (block.timestamp > deadline) revert ClaimWindowClosed(epochId, deadline);

        EpochState storage epoch = epochs[epochId];
        if (epoch.swept) revert EpochAlreadySwept(epochId);

        uint256 available = uint256(epoch.deposited) - uint256(epoch.claimed);
        if (amount > available) revert AmountExceedsClaimable(amount, available);

        epoch.claimed += SafeCast.toUint128(amount);
        xpnt.safeTransfer(to, amount);

        emit EpochClaimed(epochId, to, amount);
    }

    function sweepExpiredEpoch(uint64 epochId) external nonReentrant {
        (, , uint64 deadline) = _epochTimes(epochId);
        if (block.timestamp <= deadline) revert ClaimWindowStillOpen(epochId, deadline);

        EpochState storage epoch = epochs[epochId];
        if (epoch.swept) revert EpochAlreadySwept(epochId);

        epoch.swept = true;
        uint256 remaining = uint256(epoch.deposited) - uint256(epoch.claimed);
        if (remaining > 0) {
            xpnt.forceApprove(address(rewardPool), remaining);
            rewardPool.deposit(remaining);
        }

        emit EpochSwept(epochId, remaining);
    }

    function claimable(uint64 epochId) public view returns (uint256) {
        EpochState memory epoch = epochs[epochId];
        if (epoch.swept) {
            return 0;
        }
        return uint256(epoch.deposited) - uint256(epoch.claimed);
    }

    function currentEpochId() public view returns (uint64) {
        return SafeCast.toUint64((block.timestamp - epochZeroTimestamp) / epochDuration);
    }

    function epochTimes(uint64 epochId) external view returns (uint64 start, uint64 end, uint64 deadline) {
        return _epochTimes(epochId);
    }

    function _epochTimes(uint64 epochId) internal view returns (uint64 start, uint64 end, uint64 deadline) {
        uint64 duration = uint64(epochDuration);
        uint64 window = uint64(claimWindow);
        start = epochZeroTimestamp + epochId * duration;
        end = start + duration;
        deadline = end + window;
    }
}