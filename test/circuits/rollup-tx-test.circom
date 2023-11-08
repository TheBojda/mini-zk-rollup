pragma circom 2.0.0;
include "../../circuits/rollup-tx.circom";

component main {public [Ax,Ay]} = RollupTransactionVerifier(10);