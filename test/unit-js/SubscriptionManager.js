const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const XPNT_UNIT = 1_000_000_000n;
const MONTH = 30 * 24 * 60 * 60;
const CLAIM_WINDOW = 14 * 24 * 60 * 60;

describe("SubscriptionManager and OpsBudgetEscrow", function () {
    let token;
    let rewardRatePool;
    let opsBudgetEscrow;
    let subscriptionManager;
    let owner;
    let payer;
    let aliasSigner;
    let opsClaimer;
    let reserveSafe;
    let rewardBeneficiary;

    async function signAliasGrant(recipientAlias, validUntil) {
        const network = await ethers.provider.getNetwork();
        const domain = {
            name: "DeepSubscriptionManager",
            version: "1",
            chainId: Number(network.chainId),
            verifyingContract: await subscriptionManager.getAddress(),
        };
        const types = {
            AliasGrant: [
                { name: "recipientAlias", type: "bytes32" },
                { name: "validUntil", type: "uint64" },
            ],
        };
        return aliasSigner.signTypedData(domain, types, {
            recipientAlias,
            validUntil,
        });
    }

    beforeEach(async function () {
        [owner, payer, aliasSigner, opsClaimer, reserveSafe, rewardBeneficiary] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * XPNT_UNIT);
        await token.transfer(payer.address, 10_000n * XPNT_UNIT);

        const RewardRatePool = await ethers.getContractFactory("RewardRatePool");
        rewardRatePool = await upgrades.deployProxy(RewardRatePool, [rewardBeneficiary.address, await token.getAddress()]);
        const MockActiveStakeProvider = await ethers.getContractFactory("MockActiveStakeProvider");
        const activeStakeProvider = await MockActiveStakeProvider.deploy(25_000n * XPNT_UNIT);
        await rewardRatePool.initializeV2(await activeStakeProvider.getAddress());

        const epochZeroTimestamp = await time.latest();
        const OpsBudgetEscrow = await ethers.getContractFactory("OpsBudgetEscrow");
        opsBudgetEscrow = await upgrades.deployProxy(OpsBudgetEscrow, [
            await token.getAddress(),
            await rewardRatePool.getAddress(),
            opsClaimer.address,
            epochZeroTimestamp,
            MONTH,
            CLAIM_WINDOW,
        ]);

        const SubscriptionManager = await ethers.getContractFactory("SubscriptionManager");
        subscriptionManager = await upgrades.deployProxy(SubscriptionManager, [
            await token.getAddress(),
            await rewardRatePool.getAddress(),
            await opsBudgetEscrow.getAddress(),
            reserveSafe.address,
            aliasSigner.address,
        ]);

        await opsBudgetEscrow.setSubscriptionManager(await subscriptionManager.getAddress());
        await subscriptionManager.setPlan(1, 1_000n * XPNT_UNIT, MONTH, true);
        await token.connect(payer).approve(await subscriptionManager.getAddress(), ethers.MaxUint256);
    });

    it("splits a purchase 40/20/40 and extends the alias subscription", async function () {
        const recipientAlias = ethers.id("opaque-alias-1");
        const validUntil = (await time.latest()) + 3600;
        const aliasSignature = await signAliasGrant(recipientAlias, validUntil);
        const purchaseRef = ethers.id("purchase-ref-1");

        const tx = await subscriptionManager.connect(payer).purchaseForAlias(
            recipientAlias,
            1,
            1,
            validUntil,
            purchaseRef,
            0,
            aliasSignature,
        );
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        const expectedPaidUntil = BigInt(block.timestamp + MONTH);

        expect(await subscriptionManager.activeUntil(recipientAlias)).to.equal(expectedPaidUntil);
        expect(await subscriptionManager.isActive(recipientAlias)).to.equal(true);
        expect(await token.balanceOf(await rewardRatePool.getAddress())).to.equal(400n * XPNT_UNIT);
        expect(await token.balanceOf(reserveSafe.address)).to.equal(200n * XPNT_UNIT);
        expect(await token.balanceOf(await opsBudgetEscrow.getAddress())).to.equal(400n * XPNT_UNIT);

        const epochId = await opsBudgetEscrow.currentEpochId();
        const epoch = await opsBudgetEscrow.epochs(epochId);
        expect(epoch.deposited).to.equal(400n * XPNT_UNIT);
        expect(epoch.claimed).to.equal(0);
        expect(epoch.swept).to.equal(false);
    });

    it("rejects purchases with an invalid alias signature", async function () {
        const recipientAlias = ethers.id("opaque-alias-2");
        const validUntil = (await time.latest()) + 3600;
        const purchaseRef = ethers.id("purchase-ref-invalid-sig");
        const wrongSignature = await payer.signTypedData(
            {
                name: "DeepSubscriptionManager",
                version: "1",
                chainId: Number((await ethers.provider.getNetwork()).chainId),
                verifyingContract: await subscriptionManager.getAddress(),
            },
            {
                AliasGrant: [
                    { name: "recipientAlias", type: "bytes32" },
                    { name: "validUntil", type: "uint64" },
                ],
            },
            {
                recipientAlias,
                validUntil,
            },
        );

        await expect(
            subscriptionManager.connect(payer).purchaseForAlias(
                recipientAlias,
                1,
                1,
                validUntil,
                purchaseRef,
                0,
                wrongSignature,
            )
        ).to.be.revertedWithCustomError(subscriptionManager, "InvalidAliasSignature");
    });

    it("allows partial ops claims and sweeps the remainder into rewards after the deadline", async function () {
        const recipientAlias = ethers.id("opaque-alias-3");
        const validUntil = (await time.latest()) + 3600;
        const aliasSignature = await signAliasGrant(recipientAlias, validUntil);
        const purchaseRef = ethers.id("purchase-ref-ops-window");

        await subscriptionManager.connect(payer).purchaseForAlias(
            recipientAlias,
            1,
            1,
            validUntil,
            purchaseRef,
            0,
            aliasSignature,
        );

        const epochId = await opsBudgetEscrow.currentEpochId();
        await time.increase(MONTH + 1);

        await expect(
            opsBudgetEscrow.connect(opsClaimer).claimClosedEpoch(epochId, 100n * XPNT_UNIT, opsClaimer.address)
        ).to.emit(opsBudgetEscrow, "EpochClaimed").withArgs(epochId, opsClaimer.address, 100n * XPNT_UNIT);

        expect(await token.balanceOf(opsClaimer.address)).to.equal(100n * XPNT_UNIT);
        expect(await token.balanceOf(await opsBudgetEscrow.getAddress())).to.equal(300n * XPNT_UNIT);

        await time.increase(CLAIM_WINDOW + 1);

        await expect(opsBudgetEscrow.connect(payer).sweepExpiredEpoch(epochId))
            .to.emit(opsBudgetEscrow, "EpochSwept")
            .withArgs(epochId, 300n * XPNT_UNIT);

        const rewardPoolBalance = await token.balanceOf(await rewardRatePool.getAddress());
        const rewardBeneficiaryBalance = await token.balanceOf(rewardBeneficiary.address);

        expect(await token.balanceOf(await opsBudgetEscrow.getAddress())).to.equal(0);
        expect(rewardPoolBalance + rewardBeneficiaryBalance).to.equal(700n * XPNT_UNIT);
        expect(rewardBeneficiaryBalance).to.be.greaterThan(0n);
    });
});
