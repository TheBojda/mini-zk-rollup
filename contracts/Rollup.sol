// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./RollupVerifier.sol";
import "hardhat/console.sol";

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[132] memory input
    ) external pure returns (bool r);
}

contract Rollup {
    IVerifier public immutable verifier;

    event RootChanged(uint newRoot, uint newNonceRoot);

    uint root;
    uint nonceRoot;

    constructor(uint _root, uint _nonceRoot, IVerifier _verifier) {
        root = _root;
        nonceRoot = _nonceRoot;
        verifier = _verifier;
    }

    function updateState(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[132] calldata _pubSignals
    ) external {
        require(root == _pubSignals[0], "Invalid old root");
        require(nonceRoot == _pubSignals[2], "Invalid old nonce root");
        require(
            verifier.verifyProof(_pA, _pB, _pC, _pubSignals),
            "Verification failed"
        );

        root = _pubSignals[1];
        nonceRoot = _pubSignals[3];
        emit RootChanged(root, nonceRoot);
    }

    function getRoot() public view virtual returns (uint) {
        return root;
    }

    function getNonceRoot() public view virtual returns (uint) {
        return nonceRoot;
    }
}
