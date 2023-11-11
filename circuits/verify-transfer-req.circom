pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/eddsaposeidon.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template VerifyTransferRequest() {

    signal input targetAddress;
    signal input nftID;
    signal input nonce;

    signal input Ax;
    signal input Ay;
    signal input S;
    signal input R8x;
    signal input R8y;

    component eddsa = EdDSAPoseidonVerifier();
    component poseidon = Poseidon(3);

    poseidon.inputs[0] <== targetAddress;
    poseidon.inputs[1] <== nftID;
    poseidon.inputs[2] <== nonce;

    eddsa.enabled <== 1;
    eddsa.Ax <== Ax;
    eddsa.Ay <== Ay;
    eddsa.S <== S;
    eddsa.R8x <== R8x;
    eddsa.R8y <== R8y;
    eddsa.M <== poseidon.out;

}