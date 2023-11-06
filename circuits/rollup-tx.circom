pragma circom 2.0.0;

include "verify-transfer-req.circom";
include "../node_modules/circomlib/circuits/smt/smtprocessor.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

template RollupTransactionVerifier(nLevels) {

    signal input targetAddress;
    signal input nftID;
    signal input transactionID;

    signal input Ax;
    signal input Ay;
    signal input S;
    signal input R8x;
    signal input R8y;

    signal input oldRoot;
    signal input newRoot;
    signal input siblings[nLevels];

    component transferRequestVerifier = VerifyTransferRequest();
    component smtVerifier = SMTProcessor(nLevels);
    component poseidon = Poseidon(2);

    transferRequestVerifier.targetAddress <== targetAddress;
    transferRequestVerifier.nftID <== nftID;
    transferRequestVerifier.transactionID <== transactionID;

    transferRequestVerifier.Ax <== Ax;
    transferRequestVerifier.Ay <== Ay;
    transferRequestVerifier.S <== S;
    transferRequestVerifier.R8x <== R8x;
    transferRequestVerifier.R8y <== R8y;

    poseidon.inputs[0] <== Ax;
    poseidon.inputs[1] <== Ay;

    smtVerifier.fnc[0] <== 0;
    smtVerifier.fnc[1] <== 1;
    smtVerifier.oldRoot <== oldRoot;
    smtVerifier.siblings <== siblings;
    smtVerifier.oldKey <== nftID;
    smtVerifier.oldValue <== poseidon.out;
    smtVerifier.isOld0 <== 0; 
    smtVerifier.newKey <== nftID;
    smtVerifier.newValue <== targetAddress;

    newRoot === smtVerifier.newRoot; 

}