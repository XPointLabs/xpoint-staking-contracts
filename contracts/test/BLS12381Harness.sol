// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.26;

import "../libraries/BLS12381.sol";

contract BLS12381Harness {
    address private constant G1_MSM = address(uint160(0x0c));
    address private constant G2_MSM = address(uint160(0x0e));

    function hashToG2(bytes calldata message) external view returns (bytes memory) {
        return BLS12381.hashToG2(message).data;
    }

    function g1Mul(bytes32 scalar) external view returns (bytes memory) {
        return _staticCall(G1_MSM, abi.encodePacked(BLS12381.generatorG1().data, scalar), BLS12381.G1_LENGTH);
    }

    function signHashToG2(bytes calldata message, bytes32 scalar) external view returns (bytes memory) {
        BLS12381.G2Point memory hashPoint = BLS12381.hashToG2(message);
        return _staticCall(G2_MSM, abi.encodePacked(hashPoint.data, scalar), BLS12381.G2_LENGTH);
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
        require(success, "BLS precompile failed");
    }
}
