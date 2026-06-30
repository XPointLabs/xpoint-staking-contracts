// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IActiveStakeProvider.sol";

/**
 * @title Reward Rate Pool Contract
 * @dev Limits annualized emission by both the remaining pool and active stake.
 */
contract RewardRatePool is Initializable, Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant VERSION = 2;
    bytes32 private constant ERC1967_ADMIN_SLOT =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    error NullAddress();
    error ZeroAmount();
    error UnauthorizedV2Initializer(address caller);

    IERC20 public XPNT;

    address public beneficiary;
    uint256 public totalPaidOut;
    uint256 public lastPaidOutTime;

    // Rates use tenths of a percent to preserve the existing public denominator.
    uint64 public constant ANNUAL_SIMPLE_PAYOUT_RATE = 140; // 14% of remaining pool
    uint64 public constant ACTIVE_STAKE_ANNUAL_PAYOUT_RATE = 300; // 30% of active stake
    uint64 public constant BASIS_POINTS = 1000;

    // Appended in V2 to preserve the V1 proxy storage layout.
    IActiveStakeProvider public activeStakeProvider;

    /**
     * @dev Sets the initial beneficiary and XPNT token address.
     * @param _beneficiary Address that will receive the payouts.
     * @param _xpnt Address of the XPNT ERC20 token contract.
     */
    function initialize(address _beneficiary, address _xpnt) public initializer {
        if (_beneficiary == address(0) || _xpnt == address(0)) revert NullAddress();
        beneficiary = _beneficiary;
        lastPaidOutTime = block.timestamp;
        XPNT = IERC20(_xpnt);
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
    }

    /// @notice Configures the on-chain source of exact active stake during a V1 -> V2 upgrade.
    function initializeV2(address provider) public reinitializer(2) {
        _requireOwnerOrProxyAdmin();
        if (provider == address(0)) revert NullAddress();
        activeStakeProvider = IActiveStakeProvider(provider);
        lastPaidOutTime = block.timestamp;
        emit ActiveStakeProviderUpdated(provider);
    }

    event Deposited(address indexed from, uint256 amount);
    event FundsReleased(uint256 amount);
    event BeneficiaryUpdated(address newBeneficiary);
    event ActiveStakeProviderUpdated(address newProvider);

    function payoutReleased() public nonReentrant {
        _payoutReleased();
    }

    /**
     * @dev Realizes the accrued payout before new funds are added.
     * This prevents freshly deposited funds from accruing rewards retroactively.
     */
    function deposit(uint256 amount) public nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _payoutReleased();
        XPNT.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function checkpoint() public nonReentrant {
        _payoutReleased();
    }

    function _payoutReleased() internal {
        uint256 currentBalance = XPNT.balanceOf(address(this));
        uint256 newTotalPaidOut = calculateReleasedAmount();
        uint256 released = newTotalPaidOut - totalPaidOut;
        if (released > currentBalance) {
            released = currentBalance;
            newTotalPaidOut = totalPaidOut + released;
        }
        totalPaidOut = newTotalPaidOut;
        lastPaidOutTime = block.timestamp;
        emit FundsReleased(released);
        if (released > 0) {
            XPNT.safeTransfer(beneficiary, released);
        }
    }

    function setBeneficiary(address newBeneficiary) public onlyOwner {
        if (newBeneficiary == address(0)) revert NullAddress();
        beneficiary = newBeneficiary;
        emit BeneficiaryUpdated(newBeneficiary);
    }

    /// @notice Changes the active-stake source after checkpointing under the old source.
    function setActiveStakeProvider(address newProvider) public onlyOwner nonReentrant {
        if (newProvider == address(0)) revert NullAddress();
        _payoutReleased();
        activeStakeProvider = IActiveStakeProvider(newProvider);
        emit ActiveStakeProviderUpdated(newProvider);
    }

    /// @notice Returns the current two-minute reward consumed by reward accrual services.
    function rewardRate() public view returns (uint256) {
        return calculateCappedPayoutAmount(XPNT.balanceOf(address(this)), activeStake(), 2 minutes);
    }

    function calculateTotalDeposited() public view returns (uint256) {
        return XPNT.balanceOf(address(this)) + totalPaidOut;
    }

    function calculateReleasedAmount() public view returns (uint256) {
        uint256 timeElapsed = block.timestamp - lastPaidOutTime;
        return totalPaidOut + calculateCappedPayoutAmount(
            XPNT.balanceOf(address(this)),
            activeStake(),
            timeElapsed
        );
    }

    /// @notice Returns the exact amount currently staked by active service nodes.
    function activeStake() public view returns (uint256) {
        if (address(activeStakeProvider) == address(0)) return 0;
        return activeStakeProvider.totalActiveStake();
    }

    /// @notice Returns the current annualized emission ceiling.
    function annualEmission() public view returns (uint256) {
        return calculateCappedPayoutAmount(XPNT.balanceOf(address(this)), activeStake(), 365 days);
    }

    /// @notice Calculates the 14% pool-balance ceiling, prorated by time.
    function calculatePayoutAmount(uint256 balance, uint256 timeElapsed) public pure returns (uint256) {
        return (balance * ANNUAL_SIMPLE_PAYOUT_RATE * timeElapsed) / (BASIS_POINTS * 365 days);
    }

    /// @notice Calculates min(14% of pool, 30% of active stake), prorated by time.
    function calculateCappedPayoutAmount(
        uint256 balance,
        uint256 activeStakeAmount,
        uint256 timeElapsed
    ) public pure returns (uint256) {
        uint256 poolPayout = calculatePayoutAmount(balance, timeElapsed);
        uint256 stakePayout = (
            activeStakeAmount * ACTIVE_STAKE_ANNUAL_PAYOUT_RATE * timeElapsed
        ) / (BASIS_POINTS * 365 days);
        return poolPayout < stakePayout ? poolPayout : stakePayout;
    }

    function _requireOwnerOrProxyAdmin() private view {
        address proxyAdmin;
        bytes32 slot = ERC1967_ADMIN_SLOT;
        assembly {
            proxyAdmin := sload(slot)
        }
        if (msg.sender != owner() && msg.sender != proxyAdmin) {
            revert UnauthorizedV2Initializer(msg.sender);
        }
    }
}
