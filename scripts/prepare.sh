#!/usr/bin/env bash

mkdir -p build
wget -nc https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_20.ptau -P ./build
[ ! -f ./build/verify-transfer-req-test.r1cs ] && circom test/circuits/verify-transfer-req-test.circom --wasm --r1cs -o ./build
[ ! -f ./build/verify-transfer-req-test.zkey ] && npx snarkjs groth16 setup build/verify-transfer-req-test.r1cs build/powersOfTau28_hez_final_20.ptau build/verify-transfer-req-test.zkey
[ ! -f ./build/verify-transfer-req-test_vkey.json ] && npx snarkjs zkey export verificationkey build/verify-transfer-req-test.zkey build/verify-transfer-req-test_vkey.json
[ ! -f ./build/rollup-tx-test.r1cs ] && circom test/circuits/rollup-tx-test.circom --wasm --r1cs -o ./build
[ ! -f ./build/rollup-tx-test.zkey ] && npx snarkjs groth16 setup build/rollup-tx-test.r1cs build/powersOfTau28_hez_final_20.ptau build/rollup-tx-test.zkey
[ ! -f ./build/rollup-tx-test_vkey.json ] && npx snarkjs zkey export verificationkey build/rollup-tx-test.zkey build/rollup-tx-test_vkey.json
[ ! -f ./build/rollup.r1cs ] && circom circuits/rollup.circom --wasm --r1cs -o ./build
[ ! -f ./build/rollup.zkey ] && npx snarkjs groth16 setup build/rollup.r1cs build/powersOfTau28_hez_final_20.ptau build/rollup.zkey
[ ! -f ./build/rollup_vkey.json ] && npx snarkjs zkey export verificationkey build/rollup.zkey build/rollup_vkey.json
[ ! -f ./contracts/RollupVerifier.sol ] && npx snarkjs zkey export solidityverifier build/rollup.zkey contracts/RollupVerifier.sol
sed -i -e 's/contract Groth16Verifier/contract RollupVerifier/g' contracts/RollupVerifier.sol
exit 0

