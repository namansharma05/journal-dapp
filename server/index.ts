import express from "express";
import dotenv from "dotenv";
import {
  createSolanaRpc,
  address,
  createKeyPairFromBytes,
  pipe,
  getProgramDerivedAddress,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  signTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  AccountRole,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import fs from "fs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

const rpcUrl = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const programIdStr = process.env.PROGRAM_ID;
if (!programIdStr) throw new Error("PROGRAM_ID not found in .env");
const programId = address(programIdStr);

const walletPath = process.env.WALLET_PATH;
if (!walletPath) throw new Error("WALLET_PATH not found in .env");

// Load wallet
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")));
const keypair = await createKeyPairFromBytes(secretKey);
const walletAddress = await getAddressFromPublicKey(keypair.publicKey);

console.log("Server Configuration:");
console.log("RPC URL:", rpcUrl);
console.log("Program ID:", programId);
console.log("Wallet Address:", walletAddress);

const rpc = createSolanaRpc(rpcUrl);

app.post("/initialize-counter", async (req, res) => {
  try {
    console.log("--- Initializing counter ---");

    // Derive PDA for journal-counter
    // Seeds: [b"journal-counter"]
    const [counterPda] = await getProgramDerivedAddress({
        programAddress: programId,
        seeds: [new TextEncoder().encode("journal-counter")],
    });

    console.log("Counter PDA:", counterPda);

    // Anchor discriminator for initialize_counter: 43596457e7ac237c
    const discriminator = new Uint8Array([0x43, 0x59, 0x64, 0x57, 0xe7, 0xac, 0x23, 0x7c]);

    const instruction = {
      programAddress: programId,
      accounts: [
        { address: walletAddress, role: AccountRole.WRITABLE_SIGNER },
        { address: counterPda, role: AccountRole.WRITABLE },
        { address: address("11111111111111111111111111111111"), role: AccountRole.READONLY },
      ],
      data: discriminator,
    };

    console.log("Instruction Accounts:");
    instruction.accounts.forEach((acc, i) => {
        console.log(`  Account ${i}: ${acc.address} (Role: ${acc.role})`);
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    console.log("Latest Blockhash:", latestBlockhash.blockhash);

    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (m: any) => setTransactionMessageFeePayer(walletAddress, m),
      (m: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m: any) => appendTransactionMessageInstruction(instruction, m)
    );

    console.log("Compiling and signing transaction...");
    const signedTransaction = await signTransaction([keypair], compileTransaction(transactionMessage));
    
    console.log("Sending and confirming transaction...");
    const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
    // @ts-ignore
    const signature = await rpc.sendTransaction(wireTransaction, { encoding: 'base64' }).send();
    console.log("Success! Signature:", signature);

    res.json({
      success: true,
      signature: signature,
      counterPda: counterPda,
    });
  } catch (error: any) {
    console.error("Error in /initialize-counter:");
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
