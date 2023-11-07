#!/usr/bin/env bash

mkdir -p build
mkdir -p dist
wget -nc https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_17.ptau -P ./build
[ ! -f ./build/rollup.r1cs ] && circom circuits/rollup.circom --wasm --r1cs -o ./build
[ ! -f ./build/rollup.zkey ] && npx snarkjs groth16 setup build/rollup.r1cs build/powersOfTau28_hez_final_17.ptau build/rollup.zkey
[ ! -f ./contracts/RollupVerifier.sol ] && npx snarkjs zkey export solidityverifier build/rollup.zkey contracts/RollupVerifier.sol
exit 0

