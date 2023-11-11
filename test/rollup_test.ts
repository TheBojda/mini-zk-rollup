import { newMemEmptyTrie, buildEddsa, buildPoseidon, buildBabyjub } from 'circomlibjs'
import { randomBytes } from 'crypto'
import { assert } from 'chai'
import { wasm as wasm_tester } from 'circom_tester'
import * as path from 'path'
import * as fs from 'fs'
import { ethers } from "hardhat"
import * as snarkjs from 'snarkjs'
import { RollupVerifier, Rollup } from "../typechain-types"
import { BigNumber } from '@ethersproject/bignumber'
import Logger from "logplease";

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
        nonce: number,
        signature: any
    }

    let eddsa
    let poseidon
    let trie
    let nonceTrie

    let verifyTransferCircuit
    let verifyRollupTransactionCircuit
    let rollupCircuit

    let rollupVerifier: RollupVerifier
    let rollup: Rollup

    let accounts: Account[] = []

    const buffer2hex = (buff) => {
        return BigNumber.from(buff).toHexString()
    }

    before(async () => {
        eddsa = await buildEddsa()
        poseidon = await buildPoseidon()
        trie = await newMemEmptyTrie()
        nonceTrie = await newMemEmptyTrie()

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

    const convertSiblings = (siblings: any[]) => {
        let result = []
        for (let i = 0; i < siblings.length; i++) result.push(trie.F.toObject(siblings[i]));
        while (result.length < 10) result.push(0);
        return result
    }

    const createTransferRequest = (owner: Account, target: Account, nftID: number, nonce: number): TransferRequest => {
        const transactionHash = poseidon([buffer2hex(target.address), nftID, buffer2hex(nonce)])
        const signature = eddsa.signPoseidon(owner.prvKey, transactionHash);
        return {
            ownerPubKey: owner.pubKey,
            targetAddress: target.address,
            nftID: nftID,
            nonce: nonce,
            signature: signature
        }
    }

    /*
    const logger = Logger.create("mini-zk-rollup", { showTimestamp: false });
    Logger.setLogLevel("INFO");

    it("Initializing the trie with NFTs", async () => {
        // generate 5 NFTs, and set the first account as owner
        for (let i = 1; i <= 5; i++) {
            await trie.insert(i, accounts[0].address)
            await nonceTrie.insert(i, 0)
        }
    })

    it("Test transfer verifier circuit", async () => {
        const transferRequest = await createTransferRequest(accounts[0], accounts[1], 1, 0)

        const inputs = {
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            nonce: buffer2hex(transferRequest.nonce),
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

    const transferNFT = async (from: Account, to: Account, nftID: number) => {
        // get the nonce for the NFT
        const nonce = BigNumber.from(nonceTrie.F.toObject((await nonceTrie.find(nftID)).foundValue)).toNumber()

        // creating transfer request
        const transferRequest = await createTransferRequest(from, to, nftID, nonce)

        // move the NFT to the new owner
        const nft_res = await trie.update(nftID, transferRequest.targetAddress)

        // increase nonce for the NFT
        const nonce_res = await nonceTrie.update(nftID, transferRequest.nonce + 1)

        // generate and check zkp
        let nft_siblings = convertSiblings(nft_res.siblings)
        let nonce_siblings = convertSiblings(nonce_res.siblings)

        const inputs = {
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            nonce: buffer2hex(transferRequest.nonce),
            Ax: eddsa.F.toObject(transferRequest.ownerPubKey[0]),
            Ay: eddsa.F.toObject(transferRequest.ownerPubKey[1]),
            R8x: eddsa.F.toObject(transferRequest.signature.R8[0]),
            R8y: eddsa.F.toObject(transferRequest.signature.R8[1]),
            S: transferRequest.signature.S,
            oldRoot: trie.F.toObject(nft_res.oldRoot),
            siblings: nft_siblings,
            nonceOldRoot: trie.F.toObject(nonce_res.oldRoot),
            nonceSiblings: nonce_siblings
        }

        const w = await verifyRollupTransactionCircuit.calculateWitness(inputs, true);

        await verifyRollupTransactionCircuit.checkConstraints(w);
        await verifyRollupTransactionCircuit.assertOut(w, {
            newRoot: trie.F.toObject(nft_res.newRoot),
            nonceNewRoot: trie.F.toObject(nonce_res.newRoot)
        });

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            "./build/rollup-tx-test_js/rollup-tx-test.wasm",
            "./build/rollup-tx-test.zkey");

        const vKey = JSON.parse(fs.readFileSync("build/rollup-tx-test_vkey.json").toString());
        const res2 = await snarkjs.groth16.verify(vKey, publicSignals, proof, logger);
        assert(res2)
    }

    it("Transfer 1st NFT from account 0 to account 1", async () => {
        await transferNFT(accounts[0], accounts[1], 1)
    })

    it("Transfer 1st NFT from account 1 to account 2", async () => {
        await transferNFT(accounts[1], accounts[2], 1)
    })
    */

    /*
    const batchTransferNFTs = async (transferRequestList: TransferRequest[]) => {
        let targetAddressList = []
        let nftIDList = []
        let nonceList = []
        let AxList = []
        let AyList = []
        let SList = []
        let R8xList = []
        let R8yList = []
        let siblingsList = []
        let nonceSiblingsList = []

        const oldRoot = trie.F.toObject(trie.root)
        const nonceOldRoot = nonceTrie.F.toObject(nonceTrie.root)

        for (const transferRequest of transferRequestList) {
            targetAddressList.push(buffer2hex(transferRequest.targetAddress))
            nftIDList.push(buffer2hex(transferRequest.nftID))
            nonceList.push(buffer2hex(transferRequest.nonce))
            AxList.push(eddsa.F.toObject(transferRequest.ownerPubKey[0]))
            AyList.push(eddsa.F.toObject(transferRequest.ownerPubKey[1]))
            SList.push(transferRequest.signature.S)
            R8xList.push(eddsa.F.toObject(transferRequest.signature.R8[0]))
            R8yList.push(eddsa.F.toObject(transferRequest.signature.R8[1]))

            const res = await trie.update(transferRequest.nftID, transferRequest.targetAddress)
            siblingsList.push(convertSiblings(res.siblings))

            const res2 = await nonceTrie.update(transferRequest.nftID, transferRequest.nonce + 1)
            nonceSiblingsList.push(convertSiblings(res2.siblings))
        }

        const newRoot = trie.F.toObject(trie.root)
        const nonceNewRoot = nonceTrie.F.toObject(nonceTrie.root)

        const inputs = {
            targetAddressList: targetAddressList,
            nftIDList: nftIDList,
            nonceList: nonceList,
            AxList: AxList,
            AyList: AyList,
            R8xList: R8xList,
            R8yList: R8yList,
            SList: SList,
            siblingsList: siblingsList,
            nonceSiblingsList: nonceSiblingsList,
            oldRoot: oldRoot,
            nonceOldRoot: nonceOldRoot,
            newRoot: newRoot,
            nonceNewRoot: nonceNewRoot
        }

        const w = await rollupCircuit.calculateWitness(inputs, true);
        await rollupCircuit.checkConstraints(w);

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            "./build/rollup_js/rollup.wasm",
            "./build/rollup.zkey");

        const vKey = JSON.parse(fs.readFileSync("build/rollup_vkey.json").toString());
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof, logger);
        assert(res)
    }

    it("Test the rollup", async () => {
        const transferRequest1 = await createTransferRequest(accounts[0], accounts[1], 2, 0)
        const transferRequest2 = await createTransferRequest(accounts[1], accounts[2], 2, 1)
        const transferRequest3 = await createTransferRequest(accounts[2], accounts[3], 2, 2)
        const transferRequest4 = await createTransferRequest(accounts[0], accounts[4], 3, 0)
        const transferRequest5 = await createTransferRequest(accounts[4], accounts[0], 3, 1)

        await batchTransferNFTs([transferRequest1, transferRequest2, transferRequest3, transferRequest4, transferRequest5])
    })
    */

    const generateBatchTransferZKP = async (_trie: any, _nonceTrie, transferRequestList: TransferRequest[]) => {
        let targetAddressList = []
        let nftIDList = []
        let nonceList = []
        let AxList = []
        let AyList = []
        let SList = []
        let R8xList = []
        let R8yList = []
        let siblingsList = []
        let nonceSiblingsList = []

        const oldRoot = _trie.F.toObject(_trie.root)
        const nonceOldRoot = _nonceTrie.F.toObject(_nonceTrie.root)

        for (const transferRequest of transferRequestList) {
            targetAddressList.push(buffer2hex(transferRequest.targetAddress))
            nftIDList.push(buffer2hex(transferRequest.nftID))
            nonceList.push(buffer2hex(transferRequest.nonce))
            AxList.push(eddsa.F.toObject(transferRequest.ownerPubKey[0]))
            AyList.push(eddsa.F.toObject(transferRequest.ownerPubKey[1]))
            SList.push(transferRequest.signature.S)
            R8xList.push(eddsa.F.toObject(transferRequest.signature.R8[0]))
            R8yList.push(eddsa.F.toObject(transferRequest.signature.R8[1]))

            const res = await _trie.update(transferRequest.nftID, transferRequest.targetAddress)
            siblingsList.push(convertSiblings(res.siblings))

            const res2 = await _nonceTrie.update(transferRequest.nftID, transferRequest.nonce + 1)
            nonceSiblingsList.push(convertSiblings(res2.siblings))
        }

        const newRoot = _trie.F.toObject(_trie.root)
        const nonceNewRoot = _nonceTrie.F.toObject(_nonceTrie.root)

        return await snarkjs.groth16.fullProve(
            {
                targetAddressList: targetAddressList,
                nftIDList: nftIDList,
                nonceList: nonceList,
                AxList: AxList,
                AyList: AyList,
                R8xList: R8xList,
                R8yList: R8yList,
                SList: SList,
                siblingsList: siblingsList,
                nonceSiblingsList: nonceSiblingsList,
                oldRoot: oldRoot,
                nonceOldRoot: nonceOldRoot,
                newRoot: newRoot,
                nonceNewRoot: nonceNewRoot
            },
            "./build/rollup_js/rollup.wasm",
            "./build/rollup.zkey");
    }

    /*
    it("Test the rollup verifier smart contract", async () => {
        const transferRequest1 = createTransferRequest(accounts[0], accounts[1], 4)
        const transferRequest2 = createTransferRequest(accounts[1], accounts[2], 4)
        const transferRequest3 = createTransferRequest(accounts[2], accounts[3], 4)
        const transferRequest4 = createTransferRequest(accounts[0], accounts[4], 5)
        const transferRequest5 = createTransferRequest(accounts[4], accounts[0], 5)

        const { proof, publicSignals } = await generateBatchTransferZKP(trie, [transferRequest1, transferRequest2, transferRequest3, transferRequest4, transferRequest5])

        const vKey = JSON.parse(fs.readFileSync("build/rollup_vkey.json").toString());
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        assert(res)

        // console.log(publicSignals)

        const res2 = await rollupVerifier.verifyProof(
            [proof.pi_a[0], proof.pi_a[1]],
            [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
            [proof.pi_c[0], proof.pi_c[1]],
            publicSignals
        )
        assert(res2)
    })
    */

    const BATCH_SIZE = 64;

    it("Test the rollup smart contract", async () => {
        trie = await newMemEmptyTrie()
        nonceTrie = await newMemEmptyTrie()
        let transferRequests = []
        for (let i = 1; i <= BATCH_SIZE; i++) {
            await trie.insert(i, accounts[0].address)
            await nonceTrie.insert(i, 0)
            transferRequests.push(createTransferRequest(accounts[0], accounts[1], i, 0))
        }

        const Rollup = await ethers.getContractFactory("Rollup");
        rollup = await Rollup.deploy(trie.F.toObject(trie.root), nonceTrie.F.toObject(nonceTrie.root), await rollupVerifier.getAddress());

        const { proof, publicSignals } = await generateBatchTransferZKP(trie, nonceTrie, transferRequests)

        await rollup.updateState(
            [proof.pi_a[0], proof.pi_a[1]],
            [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
            [proof.pi_c[0], proof.pi_c[1]],
            publicSignals
        )

        assert.equal(await rollup.getRoot(), trie.F.toObject(trie.root));
        assert.equal(await rollup.getNonceRoot(), nonceTrie.F.toObject(nonceTrie.root));
    })

    it("Rebuild trie from calldata", async () => {
        trie = await newMemEmptyTrie()

        for (let i = 1; i <= BATCH_SIZE; i++) {
            await trie.insert(i, accounts[0].address)
        }

        let root = trie.F.toObject(trie.root)

        const events = await rollup.queryFilter(rollup.filters.RootChanged)
        for (const event of events) {
            const tx = await event.provider.getTransaction(event.transactionHash)
            const pubSignals = rollup.interface.parseTransaction(tx).args.at(3)
            for (let i = 0; i < BATCH_SIZE; i++) {
                const address = pubSignals[4 + i];
                const nftID = pubSignals[(4 + BATCH_SIZE) + i];
                await trie.update(nftID, address)
            }
            const newRoot = trie.F.toObject(trie.root);
            assert.equal(pubSignals[0], root)
            assert.equal(pubSignals[1], newRoot)
            root = newRoot
        }
    })

    it("Calculate simple NFT transfer gas cost", async () => {
        const signers = await ethers.getSigners()
        const account0 = signers[0]
        const account1 = signers[1]

        const MyToken = await ethers.getContractFactory("MyToken");
        const myToken = await MyToken.deploy(account0);

        for (let i = 1; i <= BATCH_SIZE; i++) {
            await myToken.safeMint(account0, i)
        }

        for (let i = 1; i <= BATCH_SIZE; i++) {
            await myToken['safeTransferFrom(address,address,uint256)'](account0, account1, i)
        }
    })

})

/*
GAS measurements (BATCH_SIZE: 64):
MyToken NFT 		2 965 696
zkRollup	        1 146 822 (transactions stored in calldata)
Validium 	          253 353 (transactions are not stored in calldata)
*/