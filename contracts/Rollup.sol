// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./RollupVerifier.sol";
import "hardhat/console.sol";

uint256 constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory input
    ) external pure returns (bool r);
}

contract Rollup {
    IVerifier public immutable verifier;

    event RootChanged(uint newRoot);

    uint root;

    constructor(uint _root, IVerifier _verifier) {
        root = _root;
        verifier = _verifier;
    }

    function updateState(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint _oldRoot,
        uint _newRoot,
        uint[16] calldata transactionList
    ) external {
        require(root == _oldRoot, "Invalid old root");

        uint256 hash = uint256(sha256(abi.encodePacked(transactionList)));
        hash = addmod(hash, 0, FIELD_SIZE);

        require(
            verifier.verifyProof(_pA, _pB, _pC, [hash, _oldRoot, _newRoot]),
            "Verification failed"
        );

        root = _newRoot;
        emit RootChanged(root);
    }

    function getRoot() public view virtual returns (uint) {
        return root;
    }

}
