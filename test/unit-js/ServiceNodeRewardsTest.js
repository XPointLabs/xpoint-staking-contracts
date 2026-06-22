const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const {
    blsScalar,
    expectBlsG1Equal,
    invalidBlsG1Long,
    invalidBlsG1Short,
    invalidBlsSignature,
    legacyG1,
    normalizeSeedData,
    zeroBlsG1,
} = require("./util");

async function verifySeedData(contractSN, seedEntry) {
    expectBlsG1Equal(contractSN.blsPubkey, seedEntry.blsPubkey);
    expect(contractSN.deposit).to.equal(BigInt(seedEntry.deposit));
    expect(contractSN.contributors.length).to.equal(seedEntry.contributors.length);
    for (let contributorIndex = 0; contributorIndex < contractSN.contributors.length; contributorIndex++) {
        expect(BigInt(contractSN.contributors[0].staker.addr)).to.equal(BigInt(seedEntry.contributors[contributorIndex].staker.addr));
        expect(contractSN.contributors[0].stakedAmount).to.equal(seedEntry.contributors[contributorIndex].stakedAmount);
    }
}

describe("ServiceNodeRewards Contract Tests", function () {
    let MockERC20;
    let mockERC20;
    let ServiceNodeRewards;
    let serviceNodeRewards;
    let owner;
    let foundationPool;

    const staking_req = 120000000000n;

    beforeEach(async function () {
        // Deploy a mock ERC20 token
        try {
            // Deploy a mock ERC20 token
            MockERC20 = await ethers.getContractFactory("MockERC20");
            mockERC20 = await MockERC20.deploy("XPoint", "XPNT", 240_000_000n * 1_000_000_000n);
        } catch (error) {
            console.error("Error deploying MockERC20:", error);
        }

        // Get signers
        [owner, foundationPool] = await ethers.getSigners();

        ServiceNodeRewardsMaster = await ethers.getContractFactory("ServiceNodeRewards");
        serviceNodeRewards = await upgrades.deployProxy(ServiceNodeRewardsMaster, 
            [ await mockERC20.getAddress(),              // token address
            await foundationPool.getAddress(),         // foundation pool address
            staking_req,                    // testnet staking requirement
            10,                             // max contributors
            1,                              // liquidator reward ratio
            1,                              // pool share of liquidation ratio
            8                               // recipient ratio
            ]);
    });

    it("Should deploy and set the correct owner", async function () {
        expect(await serviceNodeRewards.owner()).to.equal(owner.address);
    });

    it("Should have zero service nodes", async function () {
        expect(await serviceNodeRewards.totalNodes()).to.equal(0);
    });

    describe("Seeding the public key as owner", function () {

        describe("Should correctly seed public key list with a single item", async function () {
            beforeEach(async function () {
                let ed25519Generator = 1n;
                const seedData = [
                    {
                        blsPubkey: {
                            X: "0x0b5e634d0407c021e9e9dd9d03c4965810e236fef0955ab345e1d049a0438ec6",
                            Y: "0x1dbb7bf2b1f5340d4b5c466a0641b00cd3a9d9588c7bcad1c3158bdcc65c3332",
                        },
                        ed25519Pubkey: ed25519Generator++,
                        addedTimestamp: Math.floor(new Date().getTime() / 1000),
                        contributors: [
                            {
                                staker: {
                                    addr:        await owner.getAddress(),
                                    beneficiary: await owner.getAddress(),
                                },
                                stakedAmount: staking_req,
                            }
                        ]
                    },
                ];

                await serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData));
                expect(await serviceNodeRewards.totalNodes()).to.equal(1);
                let aggregate_pubkey = await serviceNodeRewards.aggregatePubkey();
                expectBlsG1Equal(aggregate_pubkey, seedData[0].blsPubkey);
                verifySeedData(await serviceNodeRewards.serviceNodes(1), seedData[0]);

                await serviceNodeRewards.start();
            });

            it("Test initiate leave is permitted", async function () {
                await serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1);
            });

            it("Rejects reward balance update without enough BLS signers", async function () {
                const invalidSignature = invalidBlsSignature();

                await expect(serviceNodeRewards.connect(owner).updateRewardsBalance(
                    owner.address,
                    1000,
                    invalidSignature,
                    [1]))
                    .to.be.revertedWithCustomError(serviceNodeRewards, "InsufficientBLSSignatures");
            });

            it("Rejects reward balance update for the zero recipient", async function () {
                const invalidSignature = invalidBlsSignature();

                await expect(serviceNodeRewards.connect(owner).updateRewardsBalance(
                    ethers.ZeroAddress,
                    1000,
                    invalidSignature,
                    []))
                    .to.be.revertedWithCustomError(serviceNodeRewards, "NullAddress");
            });

            it("Test repeated initiate leave is not permitted before waiting", async function () {
                await expect(serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1)).to.not.be.reverted;
                await network.provider.send("evm_increaseTime", [(60 * 60 * 1) - 1]);
                await expect(serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1)).to.be.reverted;
            });

            it("Test repeated initiate leave is permitted after waiting", async function () {
                await expect(serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1)).to.not.be.reverted;
                await network.provider.send("evm_increaseTime", [(60 * 60 * 1) - 0]);
                await expect(serviceNodeRewards.connect(owner).initiateExitBLSPublicKey(1)).to.not.be.reverted;
            });
        });

        it("Should correctly seed public key list with multiple items", async function () {
            let ed25519Generator = 1n;
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
                {
                    blsPubkey: {
                        X: "0x2ef6b73ab4486484de80681753a6a90c6a88a71f60aace9520fe6bb8bb8de34e",
                        Y: "0x29b8f2a87a758a89c394b121298b946dce9ada3226b5d008e54e54ddcd9e5227",
                    },
                    deposit: 2000,
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData));
            let aggregate_pubkey = await serviceNodeRewards.aggregatePubkey();
            expect(aggregate_pubkey.data).to.not.equal(zeroBlsG1().data);

            // NOTE: We know that the sentinel node is reserved at the 0th ID.
            // Hence the 2 service nodes we added are at ID 1 and 2.
            expect(await serviceNodeRewards.totalNodes()).to.equal(2);

            verifySeedData(await serviceNodeRewards.serviceNodes(1), seedData[0]);
            verifySeedData(await serviceNodeRewards.serviceNodes(2), seedData[1]);

            // NOTE: Recalculate the aggregate pubkey
            await serviceNodeRewards.rederiveTotalNodesAndAggregatePubkey();
            let recalc_aggregate_pubkey = await serviceNodeRewards.aggregatePubkey();
            expect(recalc_aggregate_pubkey.data).to.equal(aggregate_pubkey.data);
        });

        it("Should fail to seed public key list with duplicate items", async function () {
            let ed25519Generator = 1n;
            let ts = Math.floor(new Date().getTime() / 1000);
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: ts-100000,
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: ts,
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData)))
                .to.be.revertedWithCustomError(serviceNodeRewards, "BLSPubkeyAlreadyExists")
        });

        it("Fails when sum of contributor stakes do not add up the staking requirement", async function () {
            let ed25519Generator = 1n;
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req - 1n,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;
        });

        it("Fails if the Ed25519 pubkey is the zero key", async function () {
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: 0n,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;
        });

        it("Fails if the BLS pubkey is the zero key", async function () {
            let ed25519Generator = 1n;
            const seedData = [
                {
                    blsPubkey: zeroBlsG1(),
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;
        });

        it("Fails if the BLS pubkey encoding is too short", async function () {
            let ed25519Generator = 1n;
            const seedData = [
                {
                    blsPubkey: invalidBlsG1Short(),
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;
        });

        it("Fails if the BLS pubkey encoding is too long", async function () {
            let ed25519Generator = 1n;
            const seedData = [
                {
                    blsPubkey: invalidBlsG1Long(),
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;
        });

        it("Fails if the BLS pubkey is repeated", async function () {
            let ed25519Generator = 1n;
            let ts = Math.floor(new Date().getTime() / 1000);
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: ts-1,
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    deposit: 2000,
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: ts,
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner)
                                           .seedPublicKeyList(normalizeSeedData(seedData)))
                  .to
                  .be
                  .revertedWithCustomError(serviceNodeRewards, "BLSPubkeyAlreadyExists");
        });

        it("Fails if the Ed25519 pubkey is repeated", async function () {
            let ed25519Generator = 1n;
            let ts = Math.floor(new Date().getTime() / 1000);
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    ed25519Pubkey: ed25519Generator,
                    addedTimestamp: ts,
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
                {
                    blsPubkey: {
                        X: "0x2ef6b73ab4486484de80681753a6a90c6a88a71f60aace9520fe6bb8bb8de34e",
                        Y: "0x29b8f2a87a758a89c394b121298b946dce9ada3226b5d008e54e54ddcd9e5227",
                    },
                    deposit: 2000,
                    ed25519Pubkey: ed25519Generator,
                    addedTimestamp: ts-1,
                    contributors: [
                        {
                            staker: {
                                addr: "0x66d801a70615979d82c304b7db374d11c232db66",
                                beneficiary: "0x66d801a70615979d82c304b7db374d11c232db66",
                            },
                            stakedAmount: staking_req,
                        }
                    ]
                },
            ];

            await expect(serviceNodeRewards.connect(owner)
                                           .seedPublicKeyList(normalizeSeedData(seedData)))
                  .to
                  .be
                  .revertedWithCustomError(serviceNodeRewards, "Ed25519PubkeyAlreadyExists");
        });

        it("Fails if there are no contributors", async function () {
            let ed25519Generator = 1n;
            const seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    ed25519Pubkey: ed25519Generator++,
                    contributors: []
                },
            ];

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;
        });

        it("Supports 10 contributors", async function () {
            let ed25519Generator = 1n;
            seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    ed25519Pubkey: ed25519Generator++,
                    contributors: []
                },
            ];

            const contributorCount    = 10;
            const ethAddr             = "0x66d801a70615979d82c304b7db374d11c232db66";
            const stakePerContributor = staking_req / BigInt(contributorCount);
            for (let index = 0; index < contributorCount; index++) {
                seedData[0].contributors.push({staker: {addr: ethAddr, beneficiary: ethAddr}, stakedAmount: stakePerContributor});
            }

            await serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData));
            expect(await serviceNodeRewards.totalNodes()).to.equal(1);
            verifySeedData(await serviceNodeRewards.serviceNodes(1), seedData[0]);
        });

        it("Fails if there are 11 contributors (pre-migration Oxen has a 10 contributor limit)", async function () {
            let ed25519Generator = 1n;
            seedData = [
                {
                    blsPubkey: {
                        X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
                        Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
                    },
                    addedTimestamp: Math.floor(new Date().getTime() / 1000),
                    ed25519Pubkey: ed25519Generator++,
                    contributors: []
                },
            ];

            const contributorCount    = 11;
            const ethAddr             = "0x66d801a70615979d82c304b7db374d11c232db66";
            const stakePerContributor = staking_req / BigInt(contributorCount);
            for (let index = 0; index < contributorCount; index++) {
                seedData[0].contributors.push({staker: {addr: ethAddr, beneficiary: ethAddr}, stakedAmount: stakePerContributor});
            }

            await expect(serviceNodeRewards.connect(owner).seedPublicKeyList(normalizeSeedData(seedData))).to.be.reverted;

        });

        it("Should handle a production BLS12-381 seed chunk", async function () {
            const BLS12381Harness = await ethers.getContractFactory("BLS12381Harness");
            const blsHarness = await BLS12381Harness.deploy();
            const contract = await serviceNodeRewards.connect(owner);
            const nodeCount = 32;
            const now = Math.floor(new Date().getTime() / 1000);
            let ed25519Generator = 1n;
            let seedSns = [];

            for (let i = 0; i < nodeCount; i++) {
                const contributorCount = (i % 4) + 1;
                const baseStake = staking_req / BigInt(contributorCount);
                const remainder = staking_req - (baseStake * BigInt(contributorCount));
                let contributors = [];

                for (let j = 0; j < contributorCount; j++) {
                    const wallet = ethers.Wallet.createRandom();
                    contributors.push({
                        staker: {
                            addr: wallet.address,
                            beneficiary: wallet.address,
                        },
                        stakedAmount: j === contributorCount - 1 ? baseStake + remainder : baseStake,
                    });
                }

                seedSns.push({
                    blsPubkey: { data: await blsHarness.g1Mul(blsScalar(i)) },
                    ed25519Pubkey: ed25519Generator++,
                    addedTimestamp: now - i,
                    contributors,
                });
            }

            await contract.seedPublicKeyList(seedSns);
            expect(await serviceNodeRewards.totalNodes()).to.equal(nodeCount);

            const aggregatePubkey = await serviceNodeRewards.aggregatePubkey();
            expect(aggregatePubkey.data).to.not.equal(zeroBlsG1().data);

            const [ids, pubkeys] = await serviceNodeRewards.allServiceNodeIDs();
            expect(ids).to.deep.equal(Array.from({ length: nodeCount }, (_, index) => BigInt(index + 1)));
            expect(pubkeys.map(item => item.data)).to.deep.equal(seedSns.map(item => item.blsPubkey.data));

            const sn27 = await serviceNodeRewards.serviceNodes(27);
            expect(sn27.operator).to.equal(seedSns[26].contributors[0].staker.addr);
            expect(sn27.contributors.length).to.equal(seedSns[26].contributors.length);
            expect(sn27.addedTimestamp).to.equal(seedSns[26].addedTimestamp);
            expect(sn27.contributors).to.deep.equal(seedSns[26].contributors.map(item => [
                [item.staker.addr, item.staker.beneficiary],
                item.stakedAmount,
            ]));
        }).timeout(80000);
    });


    // These tests verify that staking requirements get checked if you bypass the multi-contrib
    // helper and submit directly into the rewards contract.
    describe("Direct rewards contract multi-contributor", function () {
        let submitter;
        let contributor;
        let contr_addr;
        let rewards_addr;
        const blsPubkey = legacyG1(
            BigInt("0x28852e6bd8fc98305370c1636e35d3b1fe30cb5d79e5392b1238f18a1f60a1ed"),
            BigInt("0x1d0a9ed200fc6762ce53b42d6c9173a11c233a8e41d634ec7014c00ebb5ed4b0"),
        );
        const blsSig = invalidBlsSignature();
        const snParams = {
            serviceNodePubkey: BigInt("0x3621a81c1ef05d48fc9be9dd590ab0869a70fa751e40d8fbebdb0d90e285dbd8"),
            serviceNodeSignature1: BigInt("0x9812e9d91f4e468c56f77fdbb6735b50c2c3590055efb38f26796a4630d4da42"),
            serviceNodeSignature2: BigInt("0x40779f125038351141f70f5e8d24cc1b70abcd466a28847551cc1496c13ae209"),
            fee: 0
        };
        const op_addr = "0x0123456789abcDEF0123456789abCDef01234567";

        beforeEach(async function () {
            await serviceNodeRewards.start();
            [submitter, contributor] = await ethers.getSigners();
            contr_addr = await contributor.getAddress();
            await mockERC20.transfer(submitter, staking_req);
            rewards_addr = await serviceNodeRewards.getAddress();
            await mockERC20.connect(submitter).approve(rewards_addr, staking_req);
        });

        const get_stakes = function(op_percent, contr_percent) {
            return [
                {
                    staker: {
                        addr:        op_addr,
                        beneficiary: op_addr,
                    },
                    stakedAmount: staking_req * BigInt(op_percent) / 100n,
                },
                {
                    staker: {
                        addr:        contr_addr,
                        beneficiary: contr_addr,
                    },
                    stakedAmount: staking_req * BigInt(contr_percent) / 100n,
                },
            ];
        };

        // These "allow" tests below are testing that we get rejected with
        // InvalidBLSProofOfPossession, which is simply because we aren't generating real BLS
        // signatures here (as the PoP signature depends on the actual rewards contract address),
        // but the staking validation checks happen *before* the PoP signature verification, so if
        // we get that far we consider it successful.

        it("allows 30% operator stake", async function () {
            await expect(serviceNodeRewards.connect(submitter).addBLSPublicKey(
                blsPubkey,
                blsSig,
                snParams,
                get_stakes(30, 70))).to.be.revertedWithCustomError(serviceNodeRewards, 'InvalidBLSProofOfPossession');
        });

        it("allows 25% operator stake", async function () {
            await expect(serviceNodeRewards.connect(submitter).addBLSPublicKey(
                blsPubkey,
                blsSig,
                snParams,
                get_stakes(25, 75))).to.be.revertedWithCustomError(serviceNodeRewards, 'InvalidBLSProofOfPossession');
        });

        it("rejects 24% operator stake", async function () {
            await expect(serviceNodeRewards.connect(submitter).addBLSPublicKey(
                blsPubkey,
                blsSig,
                snParams,
                get_stakes(24, 76))).to.be.revertedWithCustomError(serviceNodeRewards, "InsufficientOperatorContribution");
        });

        it("rejects too little staked", async function () {
            await expect(serviceNodeRewards.connect(submitter).addBLSPublicKey(
                blsPubkey,
                blsSig,
                snParams,
                get_stakes(25, 74))).to.be.revertedWithCustomError(serviceNodeRewards, "ContributionTotalMismatch");
        });

        it("rejects too much staked", async function () {
            await expect(serviceNodeRewards.connect(submitter).addBLSPublicKey(
                blsPubkey,
                blsSig,
                snParams,
                get_stakes(25, 76))).to.be.revertedWithCustomError(serviceNodeRewards, "ContributionTotalMismatch");
        });

    });
});
