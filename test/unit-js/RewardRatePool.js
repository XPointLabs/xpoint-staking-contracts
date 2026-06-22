const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const STAKING_TEST_AMNT = 15000000000000

describe("RewardRatePool Contract Tests", function () {
    let MockERC20;
    let mockERC20;
    let ServiceNodeRewards;
    let serviceNodeRewards;
    let RewardRatePool;
    let rewardRatePool;
    const principal = 100000;
    const bigAtomicPrincipal = ethers.parseUnits(principal.toString(), 9);
    const seconds_in_day = 24*60*60;
    const seconds_in_year = 365 * seconds_in_day;
    const seconds_in_2_minutes = 2*60;

    async function depositToPool(amount) {
        await mockERC20.approve(await rewardRatePool.getAddress(), amount);
        await rewardRatePool.deposit(amount);
    }

    beforeEach(async function () {
        // Deploy a mock ERC20 token
        try {
            // Deploy a mock ERC20 token
            MockERC20 = await ethers.getContractFactory("MockERC20");
            mockERC20 = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * 1_000_000_000n);
        } catch (error) {
            console.error("Error deploying MockERC20:", error);
        }

        ServiceNodeRewards = await ethers.getContractFactory("MockServiceNodeRewards");
        serviceNodeRewards = await ServiceNodeRewards.deploy(mockERC20, STAKING_TEST_AMNT);

        // NOTE: Set the serviceNodeRewards contract as the recipient of rewards
        RewardRatePool = await ethers.getContractFactory("RewardRatePool");
        rewardRatePool = await upgrades.deployProxy(RewardRatePool, [await serviceNodeRewards.getAddress(), await mockERC20.getAddress()]);
    });

    it("Should have the correct payout rate", async function () {
        await expect(await rewardRatePool.ANNUAL_SIMPLE_PAYOUT_RATE())
            .to.equal(151);
    });

    it("should calculate 15.1% payout correctly", async function () {
        await expect(await rewardRatePool.calculatePayoutAmount(principal, seconds_in_year))
            .to.equal((principal * 0.151).toFixed(0));
    });

    it("should calculate 15.1% released correctly", async function () {
        await time.setNextBlockTimestamp(await time.latest() + 42)
        await depositToPool(bigAtomicPrincipal);
        await expect(await rewardRatePool.calculateReleasedAmount())
            // Newly deposited funds only start accruing from the checkpointed deposit time.
            .to.equal(0);
    });

    it("should calculate reward rate", async function () {
        await time.setNextBlockTimestamp(await time.latest() + 1)
        await depositToPool(bigAtomicPrincipal);
        const expectedRate = await rewardRatePool.calculatePayoutAmount(bigAtomicPrincipal, BigInt(seconds_in_2_minutes));
        await expect(await rewardRatePool.rewardRate())
            .to.equal(expectedRate);
    });

    it("should should be ~14.017% with daily withdrawals", async function () {
        await depositToPool(bigAtomicPrincipal);
        let t = await rewardRatePool.lastPaidOutTime();
        let total_paid = 0;
        for (let i = 0; i < 365; i++) {
            t += BigInt(seconds_in_day);
            await time.setNextBlockTimestamp(t);
            await rewardRatePool.payoutReleased();
        }
        await expect(await rewardRatePool.calculateReleasedAmount())
            .to.equal(bigAtomicPrincipal * BigInt("14017916502388") / BigInt("100000000000000"));
    });

    it("should should be ~14.098% with monthly withdrawals", async function () {
        await depositToPool(bigAtomicPrincipal);
        let t = await rewardRatePool.lastPaidOutTime();
        let total_paid = 0;
        for (let i = 0; i < 12; i++) {
            t += BigInt(seconds_in_year / 12);
            await time.setNextBlockTimestamp(t);
            await rewardRatePool.payoutReleased();
        }
        await expect(await rewardRatePool.calculateReleasedAmount())
            .to.equal(bigAtomicPrincipal * BigInt("14097571610714") / BigInt("100000000000000"));
    });

    it("should be able to release funds to the rewards contract", async function () {
        await depositToPool(bigAtomicPrincipal);
        expect(await mockERC20.balanceOf(rewardRatePool)).to.equal(bigAtomicPrincipal);

        // NOTE: Advance time and test the payout release
        let last_paid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(last_paid + BigInt(seconds_in_year));
        await expect(await rewardRatePool.payoutReleased()).to
                                                           .emit(rewardRatePool, 'FundsReleased')
                                                           .withArgs(15100000000000);

        // NOTE: Advance time again and test the payout release
        last_paid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(last_paid + BigInt(seconds_in_year));
        await expect(await rewardRatePool.payoutReleased()).to
                                                           .emit(rewardRatePool, 'FundsReleased')
                                                           .withArgs(12819900000000); // (10000 - 15.1%) * 15.1%
    });

    it("checkpoints old accrual before accepting a new deposit", async function () {
        await depositToPool(bigAtomicPrincipal);

        const lastPaid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(lastPaid + BigInt(seconds_in_year / 2));

        await mockERC20.approve(await rewardRatePool.getAddress(), bigAtomicPrincipal);
        const depositTx = await rewardRatePool.deposit(bigAtomicPrincipal);
        const receipt = await depositTx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        const elapsed = BigInt(block.timestamp) - lastPaid;
        const expectedRelease = await rewardRatePool.calculatePayoutAmount(bigAtomicPrincipal, elapsed);

        await expect(depositTx)
            .to.emit(rewardRatePool, "FundsReleased")
            .withArgs(expectedRelease);

        expect(await mockERC20.balanceOf(await serviceNodeRewards.getAddress())).to.equal(expectedRelease);
        expect(await mockERC20.balanceOf(rewardRatePool)).to.equal(2n * bigAtomicPrincipal - expectedRelease);
        expect(await rewardRatePool.totalPaidOut()).to.equal(expectedRelease);
    });

    it("caps payout to the available balance after very long inactivity", async function () {
        await depositToPool(bigAtomicPrincipal);

        const lastPaid = await rewardRatePool.lastPaidOutTime();
        await time.setNextBlockTimestamp(lastPaid + BigInt(seconds_in_year * 7));

        await expect(await rewardRatePool.payoutReleased())
            .to.emit(rewardRatePool, "FundsReleased")
            .withArgs(bigAtomicPrincipal);

        expect(await mockERC20.balanceOf(await serviceNodeRewards.getAddress())).to.equal(bigAtomicPrincipal);
        expect(await mockERC20.balanceOf(rewardRatePool)).to.equal(0n);
        expect(await rewardRatePool.totalPaidOut()).to.equal(bigAtomicPrincipal);
    });
});
