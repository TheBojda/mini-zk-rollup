pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/eddsa.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template VerifyTransferRequest() {
    signal input targetAddress;
    signal input nftID;
    signal input transactionID;

    signal input A[256];
    signal input R8[256];
    signal input S[256];

    signal output transactionHash;

    component eddsa = EdDSAVerifier(256);
    component poseidon = Poseidon(3);
    component bitify = Num2Bits(256);

    poseidon.inputs[0] <== targetAddress;
    poseidon.inputs[1] <== nftID;
    poseidon.inputs[2] <== transactionID;

    transactionHash <== poseidon.out;
    bitify.in <== poseidon.out;

    for (var i=0; i<256; i++) {
        eddsa.msg[i] <== bitify.out[i];
    }

    for (var i=0; i<256; i++) {
        eddsa.A[i] <== A[i];
    }

    for (var i=0; i<256; i++) {
        eddsa.R8[i] <== R8[i];
    }

    for (var i=0; i<256; i++) {
        eddsa.S[i] <== S[i];
    }
}