// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

library BLS12381 {
    uint256 internal constant G1_LENGTH = 128;
    uint256 internal constant G2_LENGTH = 256;
    uint256 internal constant PAIR_LENGTH = G1_LENGTH + G2_LENGTH;

    address internal constant G1_ADD = address(uint160(0x0b));
    address internal constant G1_MSM = address(uint160(0x0c));
    address internal constant PAIRING = address(uint160(0x0f));
    address internal constant MAP_FP2_TO_G2 = address(uint160(0x11));

    bytes32 internal constant SCALAR_MINUS_ONE =
        0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000000;

    struct G1Point {
        bytes data;
    }

    struct G2Point {
        bytes data;
    }

    error InvalidBLS12381G1Length(uint256 actual);
    error InvalidBLS12381G2Length(uint256 actual);
    error InvalidBLS12381Pubkey();
    error BLS12381PrecompileFailed(address precompile);

    function generatorG1() internal pure returns (G1Point memory) {
        return G1Point(
            hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1"
        );
    }

    function zeroG1() internal pure returns (G1Point memory) {
        return G1Point(new bytes(G1_LENGTH));
    }

    function key(G1Point memory point) internal pure returns (bytes memory) {
        return point.data;
    }

    function eq(G1Point memory left, G1Point memory right) internal pure returns (bool) {
        return keccak256(left.data) == keccak256(right.data);
    }

    function isZero(G1Point memory point) internal pure returns (bool) {
        if (point.data.length != G1_LENGTH) {
            return false;
        }

        for (uint256 i = 0; i < G1_LENGTH; ) {
            if (point.data[i] != 0) {
                return false;
            }
            unchecked { i += 1; }
        }

        return true;
    }

    function isUnsetOrZero(G1Point memory point) internal pure returns (bool) {
        return point.data.length == 0 || isZero(point);
    }

    function requireValidG1(G1Point memory point) internal view {
        if (point.data.length != G1_LENGTH) {
            revert InvalidBLS12381G1Length(point.data.length);
        }
        if (isZero(point)) {
            revert InvalidBLS12381Pubkey();
        }

        // A no-op addition validates curve/subgroup encoding through the precompile.
        g1Add(point, zeroG1());
    }

    function requireValidG2(G2Point memory point) internal pure {
        if (point.data.length != G2_LENGTH) {
            revert InvalidBLS12381G2Length(point.data.length);
        }
    }

    function g1Add(G1Point memory left, G1Point memory right) internal view returns (G1Point memory) {
        if (isUnsetOrZero(left)) {
            if (right.data.length != G1_LENGTH) {
                revert InvalidBLS12381G1Length(right.data.length);
            }
            return right;
        }
        if (isUnsetOrZero(right)) {
            if (left.data.length != G1_LENGTH) {
                revert InvalidBLS12381G1Length(left.data.length);
            }
            return left;
        }
        if (left.data.length != G1_LENGTH) {
            revert InvalidBLS12381G1Length(left.data.length);
        }
        if (right.data.length != G1_LENGTH) {
            revert InvalidBLS12381G1Length(right.data.length);
        }

        return G1Point(_staticCall(G1_ADD, abi.encodePacked(left.data, right.data), G1_LENGTH));
    }

    function negate(G1Point memory point) internal view returns (G1Point memory) {
        if (isUnsetOrZero(point)) {
            return zeroG1();
        }
        if (point.data.length != G1_LENGTH) {
            revert InvalidBLS12381G1Length(point.data.length);
        }

        return G1Point(_staticCall(G1_MSM, abi.encodePacked(point.data, SCALAR_MINUS_ONE), G1_LENGTH));
    }

    function hashToG2(bytes memory message) internal view returns (G2Point memory) {
        bytes32 digest = keccak256(message);
        bytes memory input = abi.encodePacked(bytes32(0), digest, bytes32(0), bytes32(0));
        return G2Point(_staticCall(MAP_FP2_TO_G2, input, G2_LENGTH));
    }

    function pairing2(
        G1Point memory g1a,
        G2Point memory g2a,
        G1Point memory g1b,
        G2Point memory g2b
    ) internal view returns (bool) {
        if (g1a.data.length != G1_LENGTH) revert InvalidBLS12381G1Length(g1a.data.length);
        if (g1b.data.length != G1_LENGTH) revert InvalidBLS12381G1Length(g1b.data.length);
        requireValidG2(g2a);
        requireValidG2(g2b);

        bytes memory result = _staticCall(PAIRING, abi.encodePacked(g1a.data, g2a.data, g1b.data, g2b.data), 32);
        uint256 ok;
        assembly {
            ok := mload(add(result, 0x20))
        }
        return ok != 0;
    }

    function _staticCall(
        address precompile,
        bytes memory input,
        uint256 outputLength
    ) private view returns (bytes memory output) {
        output = new bytes(outputLength);
        bool success;
        assembly {
            success := staticcall(gas(), precompile, add(input, 0x20), mload(input), add(output, 0x20), outputLength)
        }
        if (!success) {
            revert BLS12381PrecompileFailed(precompile);
        }
    }
}
