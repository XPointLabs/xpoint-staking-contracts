const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("XPNT token metadata and Session reward invariant boundaries", function () {
    this.timeout(120000);

    it("deploys XPoint with XPNT ticker, 9 decimals, and Session-equivalent genesis supply", async function () {
        const [owner] = await ethers.getSigners();
        const XPNT = await ethers.getContractFactory("XPNT");
        const supply = 240_000_000n * 1_000_000_000n;

        const token = await XPNT.deploy(supply, owner.address, ethers.ZeroAddress, ethers.ZeroAddress);

        expect(await token.name()).to.equal("XPoint");
        expect(await token.symbol()).to.equal("XPNT");
        expect(await token.decimals()).to.equal(9);
        expect(await token.totalSupply()).to.equal(supply);
        expect(await token.balanceOf(owner.address)).to.equal(supply);
    });

    it("keeps the Session reward pool payout constants unchanged for XPNT", async function () {
        const [owner] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const token = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * 1_000_000_000n);
        const RewardRatePool = await ethers.getContractFactory("RewardRatePool");
        const pool = await upgrades.deployProxy(RewardRatePool, [owner.address, await token.getAddress()]);

        expect(await pool.ANNUAL_SIMPLE_PAYOUT_RATE()).to.equal(151);
        expect(await pool.BASIS_POINTS()).to.equal(1000);
        expect(await pool.calculatePayoutAmount(100_000n, 365n * 24n * 60n * 60n)).to.equal(15_100n);
    });
});
