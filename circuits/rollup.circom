pragma circom 2.0.0;

include "rollup-tx.circom";

template Rollup(nLevels, nTransactions) {

    signal input oldRoot;
    signal input newRoot;

    signal input transactionIDList[nTransactions];
    signal input targetAddressList[nTransactions];
    signal input nftIDList[nTransactions];

    signal input AxList[nTransactions];
    signal input AyList[nTransactions];
    signal input SList[nTransactions];
    signal input R8xList[nTransactions];
    signal input R8yList[nTransactions];

    signal input siblingsList[nTransactions][nLevels];


    var root = oldRoot;
    component rollupVerifiers[nTransactions];
    for (var i = 0; i < nTransactions; i++) {
        rollupVerifiers[i] = RollupTransactionVerifier(nLevels);

        rollupVerifiers[i].targetAddress <== targetAddressList[i];
        rollupVerifiers[i].nftID <== nftIDList[i];
        rollupVerifiers[i].transactionID <== transactionIDList[i];

        rollupVerifiers[i].Ax <== AxList[i];
        rollupVerifiers[i].Ay <== AyList[i];
        rollupVerifiers[i].S <== SList[i];
        rollupVerifiers[i].R8x <== R8xList[i];
        rollupVerifiers[i].R8y <== R8yList[i];

        rollupVerifiers[i].siblings <== siblingsList[i];
        rollupVerifiers[i].oldRoot <== root;

        root = rollupVerifiers[i].newRoot;
    }

    newRoot === root;

}

component main {public [oldRoot, newRoot, targetAddressList, nftIDList]} = Rollup(10, 64);
