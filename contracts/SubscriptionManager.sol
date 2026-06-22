// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";

import "./interfaces/IRewardPoolDeposit.sol";
import "./interfaces/IOpsBudgetEscrow.sol";

/**
 * @title SubscriptionManager
 * @dev Giftable XPNT subscription purchases keyed by a blinded recipient alias instead of the
 * raw Session ID. The contract only sees the opaque alias and an issuer signature over it.
 */
contract SubscriptionManager is Initializable, Ownable2StepUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable, EIP712Upgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant VERSION = 1;
    uint16 public constant BPS = 10_000;
    uint16 public constant REWARDS_BPS = 4_000;
    uint16 public constant RESERVE_BPS = 2_000;
    uint16 public constant OPS_BPS = 4_000;
    bytes32 public constant ALIAS_GRANT_TYPEHASH = keccak256("AliasGrant(bytes32 recipientAlias,uint64 validUntil)");

    error NullAddress();
    error ZeroAlias();
    error InvalidPlanConfiguration();
    error InvalidPurchaseRef();
    error PurchaseRefAlreadyUsed(bytes32 purchaseRef);
    error UnknownPlan(uint16 planId);
    error InactivePlan(uint16 planId);
    error InvalidPeriods(uint8 requested, uint8 maxAllowed);
    error InvalidMaxPeriods();
    error AliasGrantExpired(uint64 validUntil, uint64 currentTime);
    error InvalidAliasSignature();
    error MinExpectedPaidUntilNotMet(uint64 expected, uint64 actual);

    struct Plan {
        uint128 priceAtomic;
        uint32 durationSeconds;
        bool active;
        bool exists;
    }

    struct SubscriptionState {
        uint64 paidUntil;
    }

    struct PurchaseQuote {
        uint256 totalAmount;
        uint256 rewardAmount;
        uint256 reserveAmount;
        uint256 opsAmount;
        uint64 oldPaidUntil;
        uint64 newPaidUntil;
    }

    IERC20 public xpnt;
    IRewardPoolDeposit public rewardPool;
    IOpsBudgetEscrow public opsEscrow;
    address public permanentTreasurySafe;
    address public aliasSigner;
    uint8 public maxPeriodsPerPurchase;

    mapping(uint16 => Plan) public plans;
    mapping(bytes32 => SubscriptionState) public subscriptions;
    mapping(bytes32 => bool) public usedPurchaseRefs;

    event PlanSet(uint16 indexed planId, uint128 priceAtomic, uint32 durationSeconds, bool active);
    event RewardPoolUpdated(address indexed previousRewardPool, address indexed newRewardPool);
    event OpsEscrowUpdated(address indexed previousOpsEscrow, address indexed newOpsEscrow);
    event PermanentTreasurySafeUpdated(address indexed previousSafe, address indexed newSafe);
    event AliasSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event MaxPeriodsPerPurchaseUpdated(uint8 previousValue, uint8 newValue);
    event SubscriptionPurchased(
        bytes32 indexed recipientAlias,
        address indexed payer,
        uint16 indexed planId,
        uint8 periods,
        uint256 totalAmount,
        uint256 rewardAmount,
        uint256 reserveAmount,
        uint256 opsAmount,
        uint64 oldPaidUntil,
        uint64 newPaidUntil,
        bytes32 purchaseRef
    );

    function initialize(
        address xpnt_,
        address rewardPool_,
        address opsEscrow_,
        address permanentTreasurySafe_,
        address aliasSigner_
    ) public initializer {
        if (
            xpnt_ == address(0) ||
            rewardPool_ == address(0) ||
            opsEscrow_ == address(0) ||
            permanentTreasurySafe_ == address(0) ||
            aliasSigner_ == address(0)
        ) revert NullAddress();

        xpnt = IERC20(xpnt_);
        rewardPool = IRewardPoolDeposit(rewardPool_);
        opsEscrow = IOpsBudgetEscrow(opsEscrow_);
        permanentTreasurySafe = permanentTreasurySafe_;
        aliasSigner = aliasSigner_;
        maxPeriodsPerPurchase = 12;

        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("DeepSubscriptionManager", "1");
    }

    function setPlan(uint16 planId, uint128 priceAtomic, uint32 durationSeconds, bool active) external onlyOwner {
        if (priceAtomic == 0 || durationSeconds == 0) revert InvalidPlanConfiguration();

        plans[planId] = Plan({
            priceAtomic: priceAtomic,
            durationSeconds: durationSeconds,
            active: active,
            exists: true
        });

        emit PlanSet(planId, priceAtomic, durationSeconds, active);
    }

    function setRewardPool(address newRewardPool) external onlyOwner {
        if (newRewardPool == address(0)) revert NullAddress();
        emit RewardPoolUpdated(address(rewardPool), newRewardPool);
        rewardPool = IRewardPoolDeposit(newRewardPool);
    }

    function setOpsEscrow(address newOpsEscrow) external onlyOwner {
        if (newOpsEscrow == address(0)) revert NullAddress();
        emit OpsEscrowUpdated(address(opsEscrow), newOpsEscrow);
        opsEscrow = IOpsBudgetEscrow(newOpsEscrow);
    }

    function setPermanentTreasurySafe(address newSafe) external onlyOwner {
        if (newSafe == address(0)) revert NullAddress();
        emit PermanentTreasurySafeUpdated(permanentTreasurySafe, newSafe);
        permanentTreasurySafe = newSafe;
    }

    function setAliasSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert NullAddress();
        emit AliasSignerUpdated(aliasSigner, newSigner);
        aliasSigner = newSigner;
    }

    function setMaxPeriodsPerPurchase(uint8 newValue) external onlyOwner {
        if (newValue == 0) revert InvalidMaxPeriods();
        emit MaxPeriodsPerPurchaseUpdated(maxPeriodsPerPurchase, newValue);
        maxPeriodsPerPurchase = newValue;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function purchaseForAlias(
        bytes32 recipientAlias,
        uint16 planId,
        uint8 periods,
        uint64 aliasValidUntil,
        bytes32 purchaseRef,
        uint64 minExpectedPaidUntil,
        bytes calldata aliasSignature
    ) external whenNotPaused nonReentrant {
        if (recipientAlias == bytes32(0)) revert ZeroAlias();
        if (purchaseRef == bytes32(0)) revert InvalidPurchaseRef();
        if (usedPurchaseRefs[purchaseRef]) revert PurchaseRefAlreadyUsed(purchaseRef);

        Plan memory plan = plans[planId];
        if (!plan.exists) revert UnknownPlan(planId);
        if (!plan.active) revert InactivePlan(planId);
        if (periods == 0 || periods > maxPeriodsPerPurchase) revert InvalidPeriods(periods, maxPeriodsPerPurchase);

        uint64 currentTime = SafeCast.toUint64(block.timestamp);
        if (currentTime > aliasValidUntil) revert AliasGrantExpired(aliasValidUntil, currentTime);
        _validateAliasGrant(recipientAlias, aliasValidUntil, aliasSignature);

        PurchaseQuote memory quote = _quotePurchase(recipientAlias, planId, periods, currentTime);
        if (quote.newPaidUntil < minExpectedPaidUntil) {
            revert MinExpectedPaidUntilNotMet(minExpectedPaidUntil, quote.newPaidUntil);
        }

        usedPurchaseRefs[purchaseRef] = true;
        subscriptions[recipientAlias].paidUntil = quote.newPaidUntil;

        xpnt.safeTransferFrom(msg.sender, address(this), quote.totalAmount);
        _distributePurchase(quote.rewardAmount, quote.reserveAmount, quote.opsAmount);

        _emitSubscriptionPurchased(recipientAlias, planId, periods, purchaseRef, quote);
    }

    function activeUntil(bytes32 recipientAlias) external view returns (uint64) {
        return subscriptions[recipientAlias].paidUntil;
    }

    function isActive(bytes32 recipientAlias) external view returns (bool) {
        return subscriptions[recipientAlias].paidUntil > block.timestamp;
    }

    function aliasGrantDigest(bytes32 recipientAlias, uint64 validUntil) external view returns (bytes32) {
        return _hashAliasGrant(recipientAlias, validUntil);
    }

    function _validateAliasGrant(bytes32 recipientAlias, uint64 validUntil, bytes calldata aliasSignature) internal view {
        bytes32 digest = _hashAliasGrant(recipientAlias, validUntil);
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, aliasSignature);
        if (err != ECDSA.RecoverError.NoError || recovered != aliasSigner) revert InvalidAliasSignature();
    }

    function _quotePurchase(bytes32 recipientAlias, uint16 planId, uint8 periods, uint64 currentTime) internal view returns (PurchaseQuote memory quote) {
        Plan memory plan = plans[planId];
        if (!plan.exists) revert UnknownPlan(planId);
        if (!plan.active) revert InactivePlan(planId);
        if (periods == 0 || periods > maxPeriodsPerPurchase) revert InvalidPeriods(periods, maxPeriodsPerPurchase);

        quote.totalAmount = uint256(plan.priceAtomic) * uint256(periods);
        quote.rewardAmount = (quote.totalAmount * REWARDS_BPS) / BPS;
        quote.reserveAmount = (quote.totalAmount * RESERVE_BPS) / BPS;
        quote.opsAmount = quote.totalAmount - quote.rewardAmount - quote.reserveAmount;

        quote.oldPaidUntil = subscriptions[recipientAlias].paidUntil;
        uint64 basePaidUntil = quote.oldPaidUntil > currentTime ? quote.oldPaidUntil : currentTime;
        quote.newPaidUntil = basePaidUntil + uint64(plan.durationSeconds) * uint64(periods);
    }

    function _distributePurchase(uint256 rewardAmount, uint256 reserveAmount, uint256 opsAmount) internal {
        if (rewardAmount > 0) {
            xpnt.forceApprove(address(rewardPool), rewardAmount);
            rewardPool.deposit(rewardAmount);
        }

        if (reserveAmount > 0) {
            xpnt.safeTransfer(permanentTreasurySafe, reserveAmount);
        }

        if (opsAmount > 0) {
            xpnt.forceApprove(address(opsEscrow), opsAmount);
            opsEscrow.depositCurrentEpoch(opsAmount);
        }
    }

    function _emitSubscriptionPurchased(
        bytes32 recipientAlias,
        uint16 planId,
        uint8 periods,
        bytes32 purchaseRef,
        PurchaseQuote memory quote
    ) internal {
        emit SubscriptionPurchased(
            recipientAlias,
            msg.sender,
            planId,
            periods,
            quote.totalAmount,
            quote.rewardAmount,
            quote.reserveAmount,
            quote.opsAmount,
            quote.oldPaidUntil,
            quote.newPaidUntil,
            purchaseRef
        );
    }

    function _hashAliasGrant(bytes32 recipientAlias, uint64 validUntil) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ALIAS_GRANT_TYPEHASH, recipientAlias, validUntil)));
    }
}