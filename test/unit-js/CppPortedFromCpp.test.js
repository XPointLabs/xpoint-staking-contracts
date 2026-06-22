const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  blsG1,
  blsScalar,
  invalidBlsSignature,
  legacyG1,
  normalizeSeedData,
  zeroBlsG1,
} = require("./util");

const STAKING_REQUIREMENT = 120000000000n;

function factorial(number) {
  return number <= 1 ? number : number * factorial(number - 1);
}

function add(a, b) {
  return a + b;
}

function makeContributor(addr, amount = STAKING_REQUIREMENT) {
  return {
    staker: {
      addr,
      beneficiary: addr,
    },
    stakedAmount: amount,
  };
}

function makeSeedNode(x, y, ed25519Pubkey, contributorAddr, addedTimestamp) {
  return {
    blsPubkey: legacyG1(x, y),
    ed25519Pubkey,
    addedTimestamp,
    contributors: [makeContributor(contributorAddr)],
  };
}

const SEEDED_NODES = [
  {
    X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
    Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
  },
  {
    X: "0x2ef6b73ab4486484de80681753a6a90c6a88a71f60aace9520fe6bb8bb8de34e",
    Y: "0x29b8f2a87a758a89c394b121298b946dce9ada3226b5d008e54e54ddcd9e5227",
  },
  {
    X: "0x0b5e634d0407c021e9e9dd9d03c4965810e236fef0955ab345e1d049a0438ec6",
    Y: "0x1dbb7bf2b1f5340d4b5c466a0641b00cd3a9d9588c7bcad1c3158bdcc65c3332",
  },
];

describe("CPP port: basic.cpp", function () {
  it("Factorials are computed", async function () {
    expect(factorial(1)).to.equal(1);
    expect(factorial(2)).to.equal(2);
    expect(factorial(3)).to.equal(6);
    expect(factorial(10)).to.equal(3628800);
  });

  it("TempAddTest", async function () {
    expect(add(1, 2)).to.equal(3);
  });
});

describe("CPP port: basic_ethereum.cpp", function () {
  it("Get balance from local network", async function () {
    const [wallet] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(wallet.address);
    expect(balance).to.be.greaterThan(0n);
  });
});

describe("CPP port: rewards_contract.cpp (JS-feasible subset)", function () {
  let owner;
  let secondary;
  let foundationPool;
  let mockERC20;
  let serviceNodeRewards;
  let blsHarness;

  async function deployRewards() {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * 1_000_000_000n);

    [owner, secondary, foundationPool] = await ethers.getSigners();

    const ServiceNodeRewardsMaster = await ethers.getContractFactory("ServiceNodeRewards");
    serviceNodeRewards = await upgrades.deployProxy(ServiceNodeRewardsMaster, [
      await mockERC20.getAddress(),
      await foundationPool.getAddress(),
      STAKING_REQUIREMENT,
      10,
      0,
      0,
      1,
    ]);

    const BLS12381Harness = await ethers.getContractFactory("BLS12381Harness");
    blsHarness = await BLS12381Harness.deploy();
  }

  async function seedAndStart(nodes) {
    const timestamp = Math.floor(Date.now() / 1000);
    const seedData = nodes.map((node, index) =>
      makeSeedNode(node.X, node.Y, BigInt(index + 1), owner.address, timestamp)
    );
    await serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData));
    await serviceNodeRewards.connect(owner).start();
  }

  async function seedSigningNode(index = 0) {
    const timestamp = await time.latest();
    const seedData = [
      {
        blsPubkey: blsG1(index),
        ed25519Pubkey: BigInt(1000 + index),
        addedTimestamp: timestamp,
        contributors: [makeContributor(owner.address)],
      },
    ];

    await serviceNodeRewards.connect(owner).seedPublicKeyList(seedData);
    await serviceNodeRewards.connect(owner).start();
    return seedData[0];
  }

  async function signNetworkMessage(tagName, seedNode, timestampOrRewards, recipientAddress = undefined) {
    const hashToG2Tag = await serviceNodeRewards.hashToG2Tag();
    const tag = await serviceNodeRewards[tagName]();
    const encodedMessage = recipientAddress === undefined
      ? ethers.solidityPacked(["bytes32", "bytes", "uint256"], [tag, seedNode.blsPubkey.data, timestampOrRewards])
      : ethers.solidityPacked(["bytes32", "address", "uint256"], [tag, recipientAddress, timestampOrRewards]);
    const hashInput = ethers.solidityPacked(["bytes32", "bytes"], [hashToG2Tag, encodedMessage]);
    return { signature: await blsHarness.signHashToG2(hashInput, blsScalar(0)) };
  }

  beforeEach(async function () {
    await deployRewards();
  });

  it("Add several public keys and check aggregate pubkey", async function () {
    await seedAndStart([SEEDED_NODES[0], SEEDED_NODES[1]]);

    expect(await serviceNodeRewards.totalNodes()).to.equal(2);

    const aggregate = await serviceNodeRewards.aggregatePubkey();
    expect(aggregate.data).to.not.equal(zeroBlsG1().data);

    const node1 = await serviceNodeRewards.serviceNodes(1);
    const node2 = await serviceNodeRewards.serviceNodes(2);
    const sentinel = await serviceNodeRewards.serviceNodes(0);

    expect(node1.prev).to.equal(0);
    expect(node1.next).to.equal(2);
    expect(node2.prev).to.equal(1);
    expect(node2.next).to.equal(0);
    expect(sentinel.next).to.equal(1);
    expect(sentinel.prev).to.equal(2);
  });

  it("Initiate exit public key with correct signer", async function () {
    await seedAndStart([SEEDED_NODES[2]]);
    await expect(serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1)).to.not.be.reverted;
  });

  it("Initiate exit public key with incorrect signer", async function () {
    await seedAndStart([SEEDED_NODES[2]]);
    await expect(serviceNodeRewards.connect(secondary).initiateExitBLSPublicKey(1))
      .to.be.revertedWithCustomError(serviceNodeRewards, "CallerNotContributor");
  });

  it("Exit public key after wait time should fail if node has not initiated removal", async function () {
    await seedAndStart([SEEDED_NODES[2]]);
    await expect(serviceNodeRewards.connect(owner).exitBLSPublicKeyAfterWaitTime(1))
      .to.be.revertedWithCustomError(serviceNodeRewards, "LeaveRequestNotInitiatedYet");
  });

  it("Exit public key after wait time should fail if not enough time has passed", async function () {
    await seedAndStart([SEEDED_NODES[2]]);
    await serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1);

    await expect(serviceNodeRewards.connect(owner).exitBLSPublicKeyAfterWaitTime(1))
      .to.be.revertedWithCustomError(serviceNodeRewards, "LeaveRequestTooEarly");
  });

  it("Exit public key after wait time should succeed if enough time has passed", async function () {
    await seedAndStart([SEEDED_NODES[2]]);
    await serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1);

    await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 30]);
    await network.provider.send("evm_mine");

    await expect(serviceNodeRewards.connect(owner).exitBLSPublicKeyAfterWaitTime(1)).to.not.be.reverted;
    expect(await serviceNodeRewards.totalNodes()).to.equal(0);
  });

  it("Update rewards balance without enough signers reverts", async function () {
    await seedAndStart([SEEDED_NODES[2]]);

    const invalidSignature = invalidBlsSignature();
    await expect(serviceNodeRewards.connect(owner).updateRewardsBalance(
      owner.address,
      1000,
      invalidSignature,
      [1],
    )).to.be.revertedWithCustomError(serviceNodeRewards, "InsufficientBLSSignatures");
  });

  it("Liquidate node with valid aggregate BLS signature", async function () {
    const seedNode = await seedSigningNode();
    await mockERC20.transfer(await serviceNodeRewards.getAddress(), STAKING_REQUIREMENT);

    await network.provider.send("evm_increaseTime", [60 * 60 * 3]);
    await network.provider.send("evm_mine");

    const timestamp = await time.latest();
    const blsSignature = await signNetworkMessage("liquidateTag", seedNode, timestamp);

    await expect(serviceNodeRewards.connect(secondary).liquidateBLSPublicKeyWithSignature(
      seedNode.blsPubkey,
      timestamp,
      blsSignature,
      [],
    )).to.emit(serviceNodeRewards, "ServiceNodeLiquidated");

    expect(await serviceNodeRewards.totalNodes()).to.equal(0);
  });

  it("Exit node with valid aggregate BLS signature", async function () {
    const seedNode = await seedSigningNode();

    await network.provider.send("evm_increaseTime", [60 * 60 * 3]);
    await network.provider.send("evm_mine");

    const timestamp = await time.latest();
    const blsSignature = await signNetworkMessage("exitTag", seedNode, timestamp);

    await expect(serviceNodeRewards.connect(secondary).exitBLSPublicKeyWithSignature(
      seedNode.blsPubkey,
      timestamp,
      blsSignature,
      [],
    )).to.emit(serviceNodeRewards, "ServiceNodeExit");

    expect(await serviceNodeRewards.totalNodes()).to.equal(0);
  });

  it("Update rewards and claim flow with valid aggregate BLS signature", async function () {
    const rewardAmount = 1000n;
    const seedNode = await seedSigningNode();
    await mockERC20.transfer(await serviceNodeRewards.getAddress(), rewardAmount);

    const blsSignature = await signNetworkMessage("rewardTag", seedNode, rewardAmount, owner.address);
    await expect(serviceNodeRewards.connect(secondary).updateRewardsBalance(
      owner.address,
      rewardAmount,
      blsSignature,
      [],
    )).to.emit(serviceNodeRewards, "RewardsBalanceUpdated");

    const balanceBefore = await mockERC20.balanceOf(owner.address);
    await serviceNodeRewards.connect(owner).claimRewards();
    const balanceAfter = await mockERC20.balanceOf(owner.address);
    expect(balanceAfter - balanceBefore).to.equal(rewardAmount);
  });
});

describe("CPP port: rewards_contract.cpp seed validation subset", function () {
  let owner;
  let foundationPool;
  let mockERC20;
  let serviceNodeRewards;

  async function deployRewards() {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockERC20 = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * 1_000_000_000n);

    [owner, , foundationPool] = await ethers.getSigners();

    const ServiceNodeRewardsMaster = await ethers.getContractFactory("ServiceNodeRewards");
    serviceNodeRewards = await upgrades.deployProxy(ServiceNodeRewardsMaster, [
      await mockERC20.getAddress(),
      await foundationPool.getAddress(),
      STAKING_REQUIREMENT,
      10,
      1,
      1,
      8,
    ]);
  }

  beforeEach(async function () {
    await deployRewards();
  });

  function makeSeedEntry({ x, y, ed25519Pubkey, contributorAmount, contributorAddress }) {
    return {
      blsPubkey: legacyG1(x, y),
      ed25519Pubkey,
      addedTimestamp: Math.floor(Date.now() / 1000),
      contributors: [
        {
          staker: {
            addr: contributorAddress,
            beneficiary: contributorAddress,
          },
          stakedAmount: contributorAmount,
        },
      ],
    };
  }

  function makeSeedEntryWithContributors({ x, y, ed25519Pubkey, contributors }) {
    return {
      blsPubkey: legacyG1(x, y),
      ed25519Pubkey,
      addedTimestamp: Math.floor(Date.now() / 1000),
      contributors,
    };
  }

  it("fails if contributor stakes do not add up to the staking requirement", async function () {
    const seedData = [
      makeSeedEntry({
        x: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
        y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
        ed25519Pubkey: 1n,
        contributorAmount: STAKING_REQUIREMENT - 1n,
        contributorAddress: owner.address,
      }),
    ];

    await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(seedData)).to.be.reverted;
  });

  it("fails if the BLS pubkey is the zero key", async function () {
    const seedData = [
      makeSeedEntry({
        x: "0x0000000000000000000000000000000000000000000000000000000000000000",
        y: "0x0000000000000000000000000000000000000000000000000000000000000000",
        ed25519Pubkey: 1n,
        contributorAmount: STAKING_REQUIREMENT,
        contributorAddress: owner.address,
      }),
    ];

    await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(seedData)).to.be.reverted;
  });

  it("fails if the BLS pubkey is repeated", async function () {
    const firstPubkey = {
      x: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
      y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
    };
    const seedData = [
      makeSeedEntry({
        x: firstPubkey.x,
        y: firstPubkey.y,
        ed25519Pubkey: 1n,
        contributorAmount: STAKING_REQUIREMENT,
        contributorAddress: owner.address,
      }),
      makeSeedEntry({
        x: firstPubkey.x,
        y: firstPubkey.y,
        ed25519Pubkey: 2n,
        contributorAmount: STAKING_REQUIREMENT,
        contributorAddress: owner.address,
      }),
    ];

    await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(seedData))
      .to.be.revertedWithCustomError(serviceNodeRewards, "BLSPubkeyAlreadyExists");
  });

  it("fails if the Ed25519 pubkey is repeated", async function () {
    const seedData = [
      makeSeedEntry({
        x: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
        y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
        ed25519Pubkey: 1n,
        contributorAmount: STAKING_REQUIREMENT,
        contributorAddress: owner.address,
      }),
      makeSeedEntry({
        x: "0x2ef6b73ab4486484de80681753a6a90c6a88a71f60aace9520fe6bb8bb8de34e",
        y: "0x29b8f2a87a758a89c394b121298b946dce9ada3226b5d008e54e54ddcd9e5227",
        ed25519Pubkey: 1n,
        contributorAmount: STAKING_REQUIREMENT,
        contributorAddress: owner.address,
      }),
    ];

    await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(seedData))
      .to.be.revertedWithCustomError(serviceNodeRewards, "Ed25519PubkeyAlreadyExists");
  });

  it("fails if there are no contributors", async function () {
    const seedData = [
      makeSeedEntryWithContributors({
        x: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
        y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
        ed25519Pubkey: 1n,
        contributors: [],
      }),
    ];

    await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(seedData)).to.be.reverted;
  });

  it("supports 10 contributors", async function () {
    const contributorCount = 10;
    const contributorStake = STAKING_REQUIREMENT / BigInt(contributorCount);
    const seedData = [
      makeSeedEntryWithContributors({
        x: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
        y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
        ed25519Pubkey: 1n,
        contributors: Array.from({ length: contributorCount }, () => ({
          staker: {
            addr: owner.address,
            beneficiary: owner.address,
          },
          stakedAmount: contributorStake,
        })),
      }),
    ];

    await serviceNodeRewards.connect(owner).seedPublicKeyList(seedData);
    expect(await serviceNodeRewards.totalNodes()).to.equal(1);
  });

  it("fails if there are 11 contributors", async function () {
    const contributorCount = 11;
    const baseStake = STAKING_REQUIREMENT / BigInt(contributorCount);
    const remainder = STAKING_REQUIREMENT - (baseStake * BigInt(contributorCount));
    const seedData = [
      makeSeedEntryWithContributors({
        x: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
        y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
        ed25519Pubkey: 1n,
        contributors: Array.from({ length: contributorCount }, (_, index) => ({
          staker: {
            addr: owner.address,
            beneficiary: owner.address,
          },
          stakedAmount: index === contributorCount - 1 ? baseStake + remainder : baseStake,
        })),
      }),
    ];

    await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(seedData)).to.be.reverted;
  });
});
