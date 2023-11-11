pragma circom 2.0.0;

include "rollup-tx.circom";

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

    newRoot === root;
    nonceNewRoot === nonceRoot;

}

component main {public [oldRoot, newRoot, nonceOldRoot, nonceNewRoot, targetAddressList, nftIDList]} = Rollup(10, 64);
