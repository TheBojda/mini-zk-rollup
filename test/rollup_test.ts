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
    let babyJub

    let verifyTransferCircuit

    let accounts: Account[] = []

    const createTransferRequest = (owner: Account, target: Account, nftID: number): TransferRequest => {
        const transactionID = randomBytes(32);
        const transactionHash = poseidon([buffer2hex(target.address), nftID, buffer2hex(transactionID)])
        poseidon.F.toString(transactionHash, 16) // don't ask why is this needed
        poseidon.F.toRprLE(transactionHash)
        const signature = eddsa.signPedersen(owner.prvKey, transactionHash);
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
        const transactionHash = poseidon([request.targetAddress, request.nftID, request.transactionID])
        if (!eddsa.verifyPedersen(transactionHash, request.signature, request.ownerPubKey))
            return false;

        // check ownership
        const ownerAddress = await poseidon(request.ownerPubKey)
        const nftOwnerAddress = await trie.find(request.nftID)
        if (ownerAddress != nftOwnerAddress)
            return false;

        return true;
    }

    const buffer2bits = (buff) => {
        const res = [];
        for (let i = 0; i < buff.length; i++) {
            for (let j = 0; j < 8; j++) {
                if ((buff[i] >> j) & 1) {
                    res.push(1n);
                } else {
                    res.push(0n);
                }
            }
        }
        return res;
    }

    const buffer2hex = (buff) => {
        return ethers.BigNumber.from(buff).toHexString()
    }

    before(async () => {
        eddsa = await buildEddsa()
        poseidon = await buildPoseidon()
        trie = await newMemEmptyTrie()
        babyJub = await buildBabyjub()

        verifyTransferCircuit = await wasm_tester(path.join(__dirname, "circuits", "verify-transfer-req-test.circom"));

        for (let i = 0; i < 5; i++) {
            // generate private and public eddsa keys, the public address is the poseidon hash of the public key
            const prvKey = randomBytes(32);
            const pubKey = eddsa.prv2pub(prvKey);
            accounts[i] = {
                prvKey: prvKey,
                pubKey: pubKey,
                address: await poseidon(pubKey)
            }
        }
    })

    it("EdDSA signature test", async () => {
        const msg = await poseidon([1, 2]);
        const signature = eddsa.signPedersen(accounts[0].prvKey, msg);

        const pSignature = eddsa.packSignature(signature);
        const uSignature = eddsa.unpackSignature(pSignature);

        assert(eddsa.verifyPedersen(msg, uSignature, accounts[0].pubKey));
    })

    it("Test transfer verifier circuit", async () => {
        const transferRequest = createTransferRequest(accounts[0], accounts[1], 1)

        const pPubKey = babyJub.packPoint(transferRequest.ownerPubKey);
        const pSignature = eddsa.packSignature(transferRequest.signature);
        const r8Bits = buffer2bits(pSignature.slice(0, 32));
        const sBits = buffer2bits(pSignature.slice(32, 64));
        const aBits = buffer2bits(pPubKey);

        const w = await verifyTransferCircuit.calculateWitness({
            targetAddress: buffer2hex(transferRequest.targetAddress),
            nftID: transferRequest.nftID,
            transactionID: buffer2hex(transferRequest.transactionID),
            A: aBits, R8: r8Bits, S: sBits
        }, true);

        await verifyTransferCircuit.checkConstraints(w);
    })

    it("Initializing the trie with NFTs", async () => {
        // generate 5 NFTs, and set the first account as owner
        for (let i = 1; i <= 5; i++) {
            await trie.insert(i, accounts[0].address)
        }
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