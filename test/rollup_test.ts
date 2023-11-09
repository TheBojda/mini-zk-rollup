import { newMemEmptyTrie, buildEddsa, buildPoseidon, buildBabyjub } from 'circomlibjs'
import { randomBytes } from 'crypto'
import { assert } from "chai"
import { wasm as wasm_tester } from 'circom_tester'
import * as path from 'path'
import * as fs from 'fs'
import { ethers } from "hardhat"
import * as snarkjs from 'snarkjs'
import { RollupVerifier } from "../typechain-types"
import { BigNumber } from '@ethersproject/bignumber'

describe("mini-zk-rollup test", () => {

    interface Account {
        prvKey: any,
        pubKey: any,
        address: any
    }

    interface TransferRequest {
        ownerPubKey: any,
        targetAddress: any,
        nftID: number,
        transactionID: any
        signature: any
    }

    let eddsa
    let poseidon
    let trie

    let verifyTransferCircuit
    let verifyRollupTransactionCircuit
    let rollupCircuit

    let rollupVerifier: RollupVerifier

    let accounts: Account[] = []

    const createTransferRequest = (owner: Account, target: Account, nftID: number): TransferRequest => {
        const transactionID = randomBytes(30);
        const transactionHash = poseidon([buffer2hex(target.address), nftID, buffer2hex(transactionID)])
        const signature = eddsa.signPoseidon(owner.prvKey, transactionHash);
        return {
            ownerPubKey: owner.pubKey,
            targetAddress: target.address,
            nftID: nftID,
            transactionID: transactionID,
            signature: signature
        }
    }

    const buffer2hex = (buff) => {
        return BigNumber.from(buff).toHexString()
    }

    const getNFTOwner = async (nftID: number) => {
        return buffer2hex((await trie.find(nftID)).foundValue)
    }

    before(async () => {
        eddsa = await buildEddsa()
        poseidon = await buildPoseidon()
        trie = await newMemEmptyTrie()

        verifyTransferCircuit = await wasm_tester(path.join(__dirname, "circuits", "verify-transfer-req-test.circom"));
        verifyRollupTransactionCircuit = await wasm_tester(path.join(__dirname, "circuits", "rollup-tx-test.circom"));
        rollupCircuit = await wasm_tester(path.join(__dirname, "../circuits", "rollup.circom"));

        const RollupVerifier = await ethers.getContractFactory("RollupVerifier");
        rollupVerifier = await RollupVerifier.deploy();

        for (let i = 0; i < 5; i++) {
            // generate private and public eddsa keys, the public address is the poseidon hash of the public key
            const prvKey = randomBytes(32);
            const pubKey = eddsa.prv2pub(prvKey);
            accounts[i] = {
                prvKey: prvKey,
                pubKey: pubKey,
                address: trie.F.toObject(poseidon(pubKey))
            }
        }
    })

    it("Test transfer verifier circuit", async () => {
        const transferRequest = createTransferRequest(accounts[0], accounts[1], 1)

        const inputs = {
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            transactionID: buffer2hex(transferRequest.transactionID),
            Ax: eddsa.F.toObject(transferRequest.ownerPubKey[0]),
            Ay: eddsa.F.toObject(transferRequest.ownerPubKey[1]),
            R8x: eddsa.F.toObject(transferRequest.signature.R8[0]),
            R8y: eddsa.F.toObject(transferRequest.signature.R8[1]),
            S: transferRequest.signature.S,
        }

        const w = await verifyTransferCircuit.calculateWitness(inputs, true);

        await verifyTransferCircuit.checkConstraints(w);

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            "./build/verify-transfer-req-test_js/verify-transfer-req-test.wasm",
            "./build/verify-transfer-req-test.zkey");

        const vKey = JSON.parse(fs.readFileSync("build/verify-transfer-req-test_vkey.json").toString());
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        assert(res)
    })

    it("Initializing the trie with NFTs", async () => {
        // generate 5 NFTs, and set the first account as owner
        for (let i = 1; i <= 5; i++) {
            await trie.insert(i, accounts[0].address)
        }
    })

    const transferNFT = async (from: Account, to: Account, nftID: number) => {
        // creating transfer request
        const transferRequest = createTransferRequest(from, to, nftID)

        // move the NFT to the new owner
        const res = await trie.update(nftID, transferRequest.targetAddress)

        // check the new owner
        const newOwner = await trie.find(transferRequest.nftID)
        assert(newOwner, transferRequest.targetAddress)

        // generate and check zkp
        let siblings = res.siblings;
        for (let i = 0; i < siblings.length; i++) siblings[i] = trie.F.toObject(siblings[i]);
        while (siblings.length < 10) siblings.push(0);

        const inputs = {
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            transactionID: buffer2hex(transferRequest.transactionID),
            Ax: eddsa.F.toObject(transferRequest.ownerPubKey[0]),
            Ay: eddsa.F.toObject(transferRequest.ownerPubKey[1]),
            R8x: eddsa.F.toObject(transferRequest.signature.R8[0]),
            R8y: eddsa.F.toObject(transferRequest.signature.R8[1]),
            S: transferRequest.signature.S,
            oldRoot: trie.F.toObject(res.oldRoot),
            siblings: siblings
        }

        const w = await verifyRollupTransactionCircuit.calculateWitness(inputs, true);

        await verifyRollupTransactionCircuit.checkConstraints(w);
        await verifyRollupTransactionCircuit.assertOut(w, { newRoot: trie.F.toObject(res.newRoot) });

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            "./build/rollup-tx-test_js/rollup-tx-test.wasm",
            "./build/rollup-tx-test.zkey");

        const vKey = JSON.parse(fs.readFileSync("build/rollup-tx-test_vkey.json").toString());
        const res2 = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        assert(res2)
    }

    it("Transfer 1st NFT from account 0 to account 1", async () => {
        await transferNFT(accounts[0], accounts[1], 1)
    })

    it("Transfer 1st NFT from account 1 to account 2", async () => {
        await transferNFT(accounts[1], accounts[2], 1)
    })

    class Logger {

        error(s) {
            console.log(s)
        }

        info(s) {
            console.log(s)
        }

    }

    const batchTransferNFTs = async (transferRequestList: TransferRequest[]) => {
        let targetAddressList = []
        let nftIDList = []
        let transactionIDList = []
        let AxList = []
        let AyList = []
        let SList = []
        let R8xList = []
        let R8yList = []
        let siblingsList = []

        const oldRoot = trie.F.toObject(trie.root)

        for (const transferRequest of transferRequestList) {
            targetAddressList.push(buffer2hex(transferRequest.targetAddress))
            nftIDList.push(buffer2hex(transferRequest.nftID))
            transactionIDList.push(buffer2hex(transferRequest.transactionID))
            AxList.push(eddsa.F.toObject(transferRequest.ownerPubKey[0]))
            AyList.push(eddsa.F.toObject(transferRequest.ownerPubKey[1]))
            SList.push(transferRequest.signature.S)
            R8xList.push(eddsa.F.toObject(transferRequest.signature.R8[0]))
            R8yList.push(eddsa.F.toObject(transferRequest.signature.R8[1]))

            const res = await trie.update(transferRequest.nftID, transferRequest.targetAddress)

            let siblings = res.siblings;
            for (let i = 0; i < siblings.length; i++) siblings[i] = trie.F.toObject(siblings[i]);
            while (siblings.length < 10) siblings.push(0);

            siblingsList.push(siblings)
        }

        const newRoot = trie.F.toObject(trie.root)

        const inputs = {
            targetAddressList: targetAddressList,
            nftIDList: nftIDList,
            transactionIDList: transactionIDList,
            AxList: AxList,
            AyList: AyList,
            R8xList: R8xList,
            R8yList: R8yList,
            SList: SList,
            siblingsList: siblingsList,
            oldRoot: oldRoot,
            newRoot: newRoot
        }

        const w = await rollupCircuit.calculateWitness(inputs, true);

        await rollupCircuit.checkConstraints(w);


        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            "./build/rollup_js/rollup.wasm",
            "./build/rollup.zkey");

        const vKey = JSON.parse(fs.readFileSync("build/rollup_vkey.json").toString());
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof /*, new Logger()*/);
        assert(res)
    }

    it("Test the rollup", async () => {
        const transferRequest1 = createTransferRequest(accounts[0], accounts[1], 2)
        const transferRequest2 = createTransferRequest(accounts[1], accounts[2], 2)
        const transferRequest3 = createTransferRequest(accounts[2], accounts[3], 2)
        const transferRequest4 = createTransferRequest(accounts[0], accounts[4], 3)
        const transferRequest5 = createTransferRequest(accounts[4], accounts[0], 3)

        await batchTransferNFTs([transferRequest1, transferRequest2, transferRequest3, transferRequest4, transferRequest5])
    })

    const generateBatchTransferZKP = async (transferRequestList: TransferRequest[]) => {
        let targetAddressList = []
        let nftIDList = []
        let transactionIDList = []
        let AxList = []
        let AyList = []
        let SList = []
        let R8xList = []
        let R8yList = []
        let siblingsList = []

        const oldRoot = trie.F.toObject(trie.root)

        for (const transferRequest of transferRequestList) {
            targetAddressList.push(buffer2hex(transferRequest.targetAddress))
            nftIDList.push(transferRequest.nftID)
            transactionIDList.push(buffer2hex(transferRequest.transactionID))
            AxList.push(eddsa.F.toObject(transferRequest.ownerPubKey[0]))
            AyList.push(eddsa.F.toObject(transferRequest.ownerPubKey[1]))
            SList.push(transferRequest.signature.S)
            R8xList.push(eddsa.F.toObject(transferRequest.signature.R8[0]))
            R8yList.push(eddsa.F.toObject(transferRequest.signature.R8[1]))

            const res = await trie.update(transferRequest.nftID, transferRequest.targetAddress)

            let siblings = res.siblings;
            for (let i = 0; i < siblings.length; i++) siblings[i] = trie.F.toObject(siblings[i]);
            while (siblings.length < 10) siblings.push(0);

            siblingsList.push(siblings)
        }

        const newRoot = trie.F.toObject(trie.root)

        return await snarkjs.groth16.fullProve(
            {
                targetAddressList: targetAddressList,
                nftIDList: nftIDList,
                transactionIDList: transactionIDList,
                AxList: AxList,
                AyList: AyList,
                R8xList: R8xList,
                R8yList: R8yList,
                SList: SList,
                siblingsList: siblingsList,
                oldRoot: oldRoot,
                newRoot: newRoot
            },
            "./build/rollup_js/rollup.wasm",
            "./build/rollup.zkey");
    }

    it("Test the rollup verifier smart contract", async () => {
        const transferRequest1 = createTransferRequest(accounts[0], accounts[1], 4)
        const transferRequest2 = createTransferRequest(accounts[1], accounts[2], 4)
        const transferRequest3 = createTransferRequest(accounts[2], accounts[3], 4)
        const transferRequest4 = createTransferRequest(accounts[0], accounts[4], 5)
        const transferRequest5 = createTransferRequest(accounts[4], accounts[0], 5)

        const { proof, publicSignals } = await generateBatchTransferZKP([transferRequest1, transferRequest2, transferRequest3, transferRequest4, transferRequest5])

        const vKey = JSON.parse(fs.readFileSync("build/rollup_vkey.json").toString());
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        assert(res)

        const res2 = await rollupVerifier.verifyProof(
            [proof.pi_a[0], proof.pi_a[1]],
            [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
            [proof.pi_c[0], proof.pi_c[1]],
            publicSignals
        )
        assert(res2)
    })

})