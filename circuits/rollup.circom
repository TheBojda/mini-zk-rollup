pragma circom 2.0.0;

include "rollup-tx.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

template Rollup(nLevels, nTransactions) {

    signal input oldRoot;
    signal input newRoot;

    signal input nonceOldRoot;
    signal input nonceNewRoot;

    signal input nonceList[nTransactions];
    signal input targetAddressList[nTransactions];
    signal input nftIDList[nTransactions];

    signal input AxList[nTransactions];
    signal input AyList[nTransactions];
    signal input SList[nTransactions];
    signal input R8xList[nTransactions];
    signal input R8yList[nTransactions];

    signal input siblingsList[nTransactions][nLevels];
    signal input nonceSiblingsList[nTransactions][nLevels];

    signal input transactionListHash;
    signal input oldStateHash;
    signal input newStateHash;

    // verify the transactions in the transaction list, and calculate the new roots

    var root = oldRoot;
    var nonceRoot = nonceOldRoot;
    component rollupVerifiers[nTransactions];
    for (var i = 0; i < nTransactions; i++) {
        rollupVerifiers[i] = RollupTransactionVerifier(nLevels);

        rollupVerifiers[i].targetAddress <== targetAddressList[i];
        rollupVerifiers[i].nftID <== nftIDList[i];
        rollupVerifiers[i].nonce <== nonceList[i];

        rollupVerifiers[i].Ax <== AxList[i];
        rollupVerifiers[i].Ay <== AyList[i];
        rollupVerifiers[i].S <== SList[i];
        rollupVerifiers[i].R8x <== R8xList[i];
        rollupVerifiers[i].R8y <== R8yList[i];

        rollupVerifiers[i].siblings <== siblingsList[i];
        rollupVerifiers[i].oldRoot <== root;

        rollupVerifiers[i].nonceSiblings <== nonceSiblingsList[i];
        rollupVerifiers[i].nonceOldRoot <== nonceRoot;

        root = rollupVerifiers[i].newRoot;
        nonceRoot = rollupVerifiers[i].nonceNewRoot;
    }

    // compute sha256 hash of the transaction list

    component sha = Sha256(nTransactions * 2 * 32 * 8);
    component address2bits[nTransactions];
    component nftid2bits[nTransactions];
    
    var c = 0;
    
    for(var i=0; i<nTransactions; i++) {
        address2bits[i] = Num2Bits(32 * 8);
        address2bits[i].in <== targetAddressList[i];
        for(var j=0; j<32 * 8; j++) {
            sha.in[c] <== address2bits[i].out[(32 * 8) - 1 - j];
            c++;
        }
    }

    for(var i=0; i<nTransactions; i++) {
        nftid2bits[i] = Num2Bits(32 * 8);
        nftid2bits[i].in <== nftIDList[i];
        for(var j=0; j<32 * 8; j++) {
            sha.in[c] <== nftid2bits[i].out[(32 * 8) - 1 - j];
            c++;
        }
    }

    component bits2num = Bits2Num(256);
    for(var i=0; i<256; i++) {
        bits2num.in[i] <== sha.out[255 - i];
    }

    // check the constraints

    transactionListHash === bits2num.out;
    newRoot === root;
    nonceNewRoot === nonceRoot;

    component oldStateHasher = Poseidon(2);
    oldStateHasher.inputs[0] <== oldRoot;
    oldStateHasher.inputs[1] <== nonceOldRoot;

    component newStateHasher = Poseidon(2);
    newStateHasher.inputs[0] <== newRoot;
    newStateHasher.inputs[1] <== nonceNewRoot;

    oldStateHash === oldStateHasher.out;
    newStateHash === newStateHasher.out;

}

component main {public [oldStateHash, newStateHash, transactionListHash]} = Rollup(10, 8);
