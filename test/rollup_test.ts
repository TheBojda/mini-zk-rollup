import { newMemEmptyTrie, buildEddsa, buildPoseidon, buildBabyjub } from 'circomlibjs'
import { randomBytes } from 'crypto'
import { assert } from "chai";
import { wasm as wasm_tester } from 'circom_tester';
import * as path from 'path';
import { ethers } from "hardhat";


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

    let accounts: Account[] = []

    const createTransferRequest = (owner: Account, target: Account, nftID: number): TransferRequest => {
        const transactionID = randomBytes(32);
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


    const verifyTransferRequest = async (request: TransferRequest): Promise<boolean> => {
        // verify the transaction signature
        const transactionHash = poseidon([buffer2hex(request.targetAddress), request.nftID, buffer2hex(request.transactionID)])
        if (!eddsa.verifyPoseidon(transactionHash, request.signature, request.ownerPubKey))
            return false;

        // check ownership
        const ownerAddress = await poseidon(request.ownerPubKey)
        const nftOwnerAddress = await trie.find(request.nftID)
        if (ownerAddress != nftOwnerAddress)
            return false;

        return true;
    }

    const buffer2hex = (buff) => {
        return ethers.BigNumber.from(buff).toHexString()
    }

    before(async () => {
        eddsa = await buildEddsa()
        poseidon = await buildPoseidon()
        trie = await newMemEmptyTrie()

        verifyTransferCircuit = await wasm_tester(path.join(__dirname, "circuits", "verify-transfer-req-test.circom"));
        verifyRollupTransactionCircuit = await wasm_tester(path.join(__dirname, "circuits", "rollup-tx-test.circom"));

        for (let i = 0; i < 5; i++) {
            // generate private and public eddsa keys, the public address is the poseidon hash of the public key
            const prvKey = randomBytes(32);
            const pubKey = eddsa.prv2pub(prvKey);
            accounts[i] = {
                prvKey: prvKey,
                pubKey: pubKey,
                address: poseidon(pubKey)
            }
        }
    })

    it("Test transfer verifier circuit", async () => {
        const transferRequest = createTransferRequest(accounts[0], accounts[1], 1)

        const w = await verifyTransferCircuit.calculateWitness({
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            transactionID: buffer2hex(transferRequest.transactionID),
            Ax: eddsa.F.toObject(transferRequest.ownerPubKey[0]),
            Ay: eddsa.F.toObject(transferRequest.ownerPubKey[1]),
            R8x: eddsa.F.toObject(transferRequest.signature.R8[0]),
            R8y: eddsa.F.toObject(transferRequest.signature.R8[1]),
            S: transferRequest.signature.S,
        }, true);

        await verifyTransferCircuit.checkConstraints(w);
    })

    it("Initializing the trie with NFTs", async () => {
        // generate 5 NFTs, and set the first account as owner
        for (let i = 1; i <= 5; i++) {
            await trie.insert(i, accounts[0].address)
        }
    })

    it("Test rollup transaction verifier circuit", async () => {
        const transferRequest = createTransferRequest(accounts[0], accounts[1], 1)

        const res = await trie.find(transferRequest.nftID);

        let siblings = res.siblings;
        for (let i = 0; i < siblings.length; i++) siblings[i] = trie.F.toObject(siblings[i]);
        while (siblings.length < 10) siblings.push(0);

        const w = await verifyRollupTransactionCircuit.calculateWitness({
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            transactionID: buffer2hex(transferRequest.transactionID),
            Ax: eddsa.F.toObject(transferRequest.ownerPubKey[0]),
            Ay: eddsa.F.toObject(transferRequest.ownerPubKey[1]),
            R8x: eddsa.F.toObject(transferRequest.signature.R8[0]),
            R8y: eddsa.F.toObject(transferRequest.signature.R8[1]),
            S: transferRequest.signature.S,
            root: trie.F.toObject(trie.root),
            siblings: siblings
        }, true);

        await verifyRollupTransactionCircuit.checkConstraints(w);
    })

    it("Transfer 1. NFT from account 0 to account 1", async () => {
        // creating transfer request
        const transferRequest = createTransferRequest(accounts[0], accounts[1], 1)

        // verifying transfer request, and check ownership
        assert(verifyTransferRequest(transferRequest))

        // move the NFT to the new owner
        await trie.update(1, transferRequest.targetAddress)

        // check the new owner
        const newOwner = await trie.find(transferRequest.nftID)
        assert(newOwner, transferRequest.targetAddress)
    })

})