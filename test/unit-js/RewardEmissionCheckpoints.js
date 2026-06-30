const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { legacyG1, normalizeSeedData } = require("./util");

const STAKING_REQUIREMENT = 120_000_000_000n;

describe("ServiceNodeRewards emission checkpoints", function () {
    let owner;
    let token;
    let rewardPool;
    let rewards;

    beforeEach(async function () {
        [owner] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * 1_000_000_000n);

        const MockRewardPoolCheckpoint = await ethers.getContractFactory("MockRewardPoolCheckpoint");
        rewardPool = await MockRewardPoolCheckpoint.deploy();

        const TestnetServiceNodeRewards = await ethers.getContractFactory("TestnetServiceNodeRewards");
        rewards = await upgrades.deployProxy(TestnetServiceNodeRewards, [
            await token.getAddress(),
            await rewardPool.getAddress(),
            STAKING_REQUIREMENT,
            10,
            1,
            1,
            8,
        ]);
        await rewards.initializeV2();
    });

    function seedNode() {
        return {
            blsPubkey: legacyG1(
                "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
            ),
            ed25519Pubkey: 1n,
            addedTimestamp: Math.floor(Date.now() / 1000),
            contributors: [{
                staker: { addr: owner.address, beneficiary: owner.address },
                stakedAmount: STAKING_REQUIREMENT,
            }],
        };
    }

    it("tracks exact active stake and checkpoints before seed, requirement change, and exit", async function () {
        await rewards.seedPublicKeyList(normalizeSeedData([seedNode()]));
        expect(await rewards.totalNodes()).to.equal(1);
        expect(await rewards.totalActiveStake()).to.equal(STAKING_REQUIREMENT);
        expect(await rewardPool.checkpointCount()).to.equal(1);

        const newRequirement = 150_000_000_000n;
        await rewards.setStakingRequirement(newRequirement);
        expect(await rewards.stakingRequirement()).to.equal(newRequirement);
        expect(await rewards.totalActiveStake()).to.equal(STAKING_REQUIREMENT);
        expect(await rewardPool.checkpointCount()).to.equal(2);

        await rewards.start();
        await rewards.exitNodeBySNID([1]);
        expect(await rewards.totalNodes()).to.equal(0);
        expect(await rewards.totalActiveStake()).to.equal(0);
        expect(await rewardPool.checkpointCount()).to.equal(3);
    });

    it("rederives active stake from the node list", async function () {
        await rewards.seedPublicKeyList(normalizeSeedData([seedNode()]));
        await rewards.rederiveTotalNodesAndAggregatePubkey();

        expect(await rewards.totalNodes()).to.equal(1);
        expect(await rewards.totalActiveStake()).to.equal(STAKING_REQUIREMENT);
        expect(await rewardPool.checkpointCount()).to.equal(2);
    });

    it("allows the proxy admin to run the V2 reinitializer atomically", async function () {
        const TestnetServiceNodeRewards = await ethers.getContractFactory("TestnetServiceNodeRewards");
        const v1StateProxy = await upgrades.deployProxy(TestnetServiceNodeRewards, [
            await token.getAddress(),
            await rewardPool.getAddress(),
            STAKING_REQUIREMENT,
            10,
            1,
            1,
            8,
        ]);

        const upgraded = await upgrades.upgradeProxy(
            await v1StateProxy.getAddress(),
            TestnetServiceNodeRewards,
            { call: { fn: "initializeV2", args: [] } },
        );
        expect(await upgraded.totalActiveStake()).to.equal(0);
        await expect(upgraded.initializeV2()).to.be.revertedWithCustomError(
            upgraded,
            "InvalidInitialization",
        );
    });
});
