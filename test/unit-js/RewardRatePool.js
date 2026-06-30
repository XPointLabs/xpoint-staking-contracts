const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const XPNT_UNIT = 1_000_000_000n;
const YEAR = 365n * 24n * 60n * 60n;
const POOL_BALANCE = 40_000_000n * XPNT_UNIT;
const STAKING_REQUIREMENT = 25_000n * XPNT_UNIT;

describe("RewardRatePool capped emission", function () {
    let owner;
    let beneficiary;
    let token;
    let stakeProvider;
    let rewardRatePool;

    beforeEach(async function () {
        [owner, beneficiary] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * XPNT_UNIT);

        const MockActiveStakeProvider = await ethers.getContractFactory("MockActiveStakeProvider");
        stakeProvider = await MockActiveStakeProvider.deploy(0);

        const RewardRatePool = await ethers.getContractFactory("RewardRatePool");
        rewardRatePool = await upgrades.deployProxy(
            RewardRatePool,
            [beneficiary.address, await token.getAddress()],
        );
        await rewardRatePool.initializeV2(await stakeProvider.getAddress());

        await token.approve(await rewardRatePool.getAddress(), POOL_BALANCE);
        await rewardRatePool.deposit(POOL_BALANCE);
    });

    it("uses the approved pool and active-stake annual caps", async function () {
        expect(await rewardRatePool.VERSION()).to.equal(2);
        expect(await rewardRatePool.ANNUAL_SIMPLE_PAYOUT_RATE()).to.equal(140);
        expect(await rewardRatePool.ACTIVE_STAKE_ANNUAL_PAYOUT_RATE()).to.equal(300);
        expect(await rewardRatePool.BASIS_POINTS()).to.equal(1000);
        expect(await rewardRatePool.activeStakeProvider()).to.equal(await stakeProvider.getAddress());
    });

    it("initializes V2 atomically through the ERC-1967 proxy admin", async function () {
        const [, , attacker] = await ethers.getSigners();
        const RewardRatePool = await ethers.getContractFactory("RewardRatePool");
        const v1StateProxy = await upgrades.deployProxy(
            RewardRatePool,
            [beneficiary.address, await token.getAddress()],
        );

        await expect(v1StateProxy.connect(attacker).initializeV2(await stakeProvider.getAddress()))
            .to.be.revertedWithCustomError(v1StateProxy, "UnauthorizedV2Initializer")
            .withArgs(attacker.address);

        const upgraded = await upgrades.upgradeProxy(
            await v1StateProxy.getAddress(),
            RewardRatePool,
            { call: { fn: "initializeV2", args: [await stakeProvider.getAddress()] } },
        );
        expect(await upgraded.activeStakeProvider()).to.equal(await stakeProvider.getAddress());
    });

    it("matches the approved early-network emission examples", async function () {
        const examples = [
            [3n, 22_500n],
            [100n, 750_000n],
            [500n, 3_750_000n],
            [748n, 5_600_000n],
        ];

        for (const [nodes, annualXpnt] of examples) {
            await stakeProvider.setTotalActiveStake(nodes * STAKING_REQUIREMENT);
            expect(await rewardRatePool.annualEmission()).to.equal(annualXpnt * XPNT_UNIT);
        }
    });

    it("emits nothing while there is no active stake", async function () {
        const lastPaid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(lastPaid + YEAR);

        expect(await rewardRatePool.calculateReleasedAmount()).to.equal(0);
        await expect(rewardRatePool.payoutReleased()).to.emit(rewardRatePool, "FundsReleased").withArgs(0);
        expect(await token.balanceOf(beneficiary.address)).to.equal(0);
    });

    it("pays the active-stake cap after one year at three nodes", async function () {
        await stakeProvider.setTotalActiveStake(3n * STAKING_REQUIREMENT);
        const lastPaid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(lastPaid + YEAR);

        const expected = 22_500n * XPNT_UNIT;
        await expect(rewardRatePool.payoutReleased()).to.emit(rewardRatePool, "FundsReleased").withArgs(expected);
        expect(await token.balanceOf(beneficiary.address)).to.equal(expected);
    });

    it("pays the 14 percent pool cap once active stake reaches 748 nodes", async function () {
        await stakeProvider.setTotalActiveStake(748n * STAKING_REQUIREMENT);
        const lastPaid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(lastPaid + YEAR);

        const expected = 5_600_000n * XPNT_UNIT;
        await expect(rewardRatePool.payoutReleased()).to.emit(rewardRatePool, "FundsReleased").withArgs(expected);
        expect(await token.balanceOf(beneficiary.address)).to.equal(expected);
    });

    it("returns the capped two-minute reward rate consumed by the backend", async function () {
        await stakeProvider.setTotalActiveStake(100n * STAKING_REQUIREMENT);
        const annual = 750_000n * XPNT_UNIT;
        expect(await rewardRatePool.rewardRate()).to.equal((annual * 120n) / YEAR);
    });

    it("checkpoints the old provider before changing the active-stake source", async function () {
        await stakeProvider.setTotalActiveStake(3n * STAKING_REQUIREMENT);
        const lastPaid = await rewardRatePool.lastPaidOutTime();

        const MockActiveStakeProvider = await ethers.getContractFactory("MockActiveStakeProvider");
        const replacement = await MockActiveStakeProvider.deploy(100n * STAKING_REQUIREMENT);
        const expectedOldAccrual = (22_500n * XPNT_UNIT) / 2n;
        await time.setNextBlockTimestamp(lastPaid + YEAR / 2n);

        await expect(rewardRatePool.setActiveStakeProvider(await replacement.getAddress()))
            .to.emit(rewardRatePool, "FundsReleased")
            .withArgs(expectedOldAccrual)
            .and.to.emit(rewardRatePool, "ActiveStakeProviderUpdated")
            .withArgs(await replacement.getAddress());

        expect(await token.balanceOf(beneficiary.address)).to.equal(expectedOldAccrual);
        expect(await rewardRatePool.activeStakeProvider()).to.equal(await replacement.getAddress());
    });

    it("checkpoints accrued emission before accepting a new deposit", async function () {
        await stakeProvider.setTotalActiveStake(748n * STAKING_REQUIREMENT);
        const lastPaid = await rewardRatePool.lastPaidOutTime();

        await token.approve(await rewardRatePool.getAddress(), POOL_BALANCE);
        const expectedRelease = 2_800_000n * XPNT_UNIT;
        await time.setNextBlockTimestamp(lastPaid + YEAR / 2n);
        await expect(rewardRatePool.deposit(POOL_BALANCE))
            .to.emit(rewardRatePool, "FundsReleased")
            .withArgs(expectedRelease);

        expect(await token.balanceOf(beneficiary.address)).to.equal(expectedRelease);
        expect(await token.balanceOf(await rewardRatePool.getAddress())).to.equal(
            2n * POOL_BALANCE - expectedRelease,
        );
    });

    it("never releases more than the remaining reward pool", async function () {
        await stakeProvider.setTotalActiveStake(10_000n * STAKING_REQUIREMENT);
        const lastPaid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(lastPaid + 8n * YEAR);

        await expect(rewardRatePool.payoutReleased())
            .to.emit(rewardRatePool, "FundsReleased")
            .withArgs(POOL_BALANCE);
        expect(await token.balanceOf(await rewardRatePool.getAddress())).to.equal(0);
        expect(await rewardRatePool.totalPaidOut()).to.equal(POOL_BALANCE);
    });

    it("exposes pure pool-only and capped payout helpers", async function () {
        expect(await rewardRatePool.calculatePayoutAmount(100_000n, YEAR)).to.equal(14_000n);
        expect(await rewardRatePool.calculateCappedPayoutAmount(100_000n, 10_000n, YEAR)).to.equal(3_000n);
        expect(await rewardRatePool.calculateCappedPayoutAmount(100_000n, 100_000n, YEAR)).to.equal(14_000n);
    });
});
