// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./RollupVerifier.sol";
import "hardhat/console.sol";

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[130] memory input
    ) external pure returns (bool r);
}

contract Rollup {
    uint constant BATCH_SIZE = 64;

    event RootChanged(uint newRoot);

    IVerifier public immutable verifier;

    uint root = 0;
    mapping(uint => bool) public transactionHashes;

    constructor(uint _root, IVerifier _verifier) {
        root = _root;
        verifier = _verifier;
    }

    function updateState(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[130] calldata _pubSignals
    ) external {
        require(verifier.verifyProof(_pA, _pB, _pC, _pubSignals), "Verification failed");
        require(root == _pubSignals[0], "Invalid old root");
/*
        for (uint i = 2; i < 2 + BATCH_SIZE; i++) {
            require(!transactionHashes[_pubSignals[i]], "Transaction hash is already used");
            transactionHashes[_pubSignals[i]] = true;
        }
*/
        root = _pubSignals[1];
        emit RootChanged(root);
    }

    function getRoot() public view virtual returns (uint) {
        return root;
    }
}
