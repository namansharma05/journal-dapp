import express from "express";
import dotenv from "dotenv";
import cors  from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { address } from "@solana/addresses";
import {
  appendTransactionMessageInstruction,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  getProgramDerivedAddress,
  getU32Encoder,
  getUtf8Encoder,
  getAddressEncoder,
  getBase58Decoder,
  getBase58Encoder,
  getBase64Encoder,
  getBase64Decoder,
  getTransactionEncoder,
} from "@solana/kit";
import { createClient } from "./client.ts";
import {
  getInitializeCounterInstructionAsync,
  fetchMaybeJournalEntryCounterState,
  getCreateJournalEntryInstruction,
  getCreateJournalEntryInstructionAsync,
  JOURNAL_PROGRAM_ADDRESS,
  decodeJournalEntryState,
  getJournalEntryStateDiscriminatorBytes,
  fetchAllMaybeJournalEntryState,
} from "../app/generated/journal/index.ts";

import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from various possible locations
const possibleEnvPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, "..", ".env"),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break; // Load first one found
  }
}

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.NEXT_PUBLIC_PORT || 8000;
console.log(`Resolved PORT for server: ${PORT}`);

async function initializeCounter() {
  try {
    const client = await createClient();

    const [{ value: latestBlockhash }] = await Promise.all([
      client.rpc.getLatestBlockhash().send(),
    ]);

    const createCounterAccountIx = await getInitializeCounterInstructionAsync({
      signer: client.wallet,
    });

    const journalCounterAccountPda = createCounterAccountIx.accounts[1].address;

    // Check if the counter account already exists
    const maybeCounterAccount = await fetchMaybeJournalEntryCounterState(
      client.rpc,
      journalCounterAccountPda
    );

    if (maybeCounterAccount.exists) {
      console.log(
        "Counter Account already exists. Current Count:",
        maybeCounterAccount.data.count
      );
      return;
    }

    console.log("Initializing Counter Account...");
    console.log("createCounterAccountIx", createCounterAccountIx);

    const transactionMessage = await pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(client.wallet, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstruction(createCounterAccountIx, tx),
      (tx) => client.estimateAndSetComputeUnitLimit(tx)
    );

    const transaction = await signTransactionMessageWithSigners(
      transactionMessage
    );
    assertIsSendableTransaction(transaction);
    assertIsTransactionWithBlockhashLifetime(transaction);

    await client.sendAndConfirmTransaction(transaction, {
      commitment: "confirmed",
    });

    const signature = getSignatureFromTransaction(transaction);
    console.log("Counter Account Initialized. Signature:", signature);

    const counterAccount = await fetchMaybeJournalEntryCounterState(
      client.rpc,
      journalCounterAccountPda
    );
    if (counterAccount.exists) {
      console.log("Counter Account Data:", counterAccount.data);
      console.log("Current Count:", counterAccount.data.count);
    }
  } catch (error) {
    console.error("Error during counter initialization:", error);
  }
}

app.post("/create/journal-entry", async(req, res) => {
  const { title, message, signerAddress } = req.body;
  try {
    const client = await createClient();

    const [{ value: latestBlockhash }] = await Promise.all([
      client.rpc.getLatestBlockhash().send(),
    ]);

    // 1. Derive the counter PDA
    const [journalEntryCounterAccount] = await getProgramDerivedAddress({
      programAddress: JOURNAL_PROGRAM_ADDRESS,
      seeds: [getUtf8Encoder().encode("journal-counter")],
    });

    // 2. Fetch the current count
    const maybeCounterAccount = await fetchMaybeJournalEntryCounterState(
      client.rpc,
      journalEntryCounterAccount
    );

    if (!maybeCounterAccount.exists) {
      return res.status(400).json({ error: "Counter not initialized" });
    }

    const currentCount = maybeCounterAccount.data.count;

    // 3. Create a placeholder signer for the user (just the address)
    // This allows us to build the transaction message on the server.
    const userAddress = address(signerAddress);

    // 4. Derive the journal entry PDA: [b"journal-entry", count, user]
    const [journalEntryAccount] = await getProgramDerivedAddress({
      programAddress: JOURNAL_PROGRAM_ADDRESS,
      seeds: [
        getUtf8Encoder().encode("journal-entry"),
        getU32Encoder({ endian: 'little' as any }).encode(currentCount),
        getAddressEncoder().encode(userAddress),
      ],
    });

    // Log for debugging
    const userBalance = await client.rpc.getBalance(userAddress).send();
    console.log(`Preparing transaction. User: ${userAddress}, Balance: ${userBalance.value}, Count: ${currentCount}`);
    console.log(`Derived Journal Entry PDA: ${journalEntryAccount}`);

    console.log(`Preparing journal entry transaction for: ${userAddress}`);

    const createNewJournalentryIx = await getCreateJournalEntryInstructionAsync({
      signer: { address: userAddress } as any, // We only need the address to build the IX
      title,
      message,
      journalEntryAccount,
    });

    // 5. Build the transaction message
    // Server is the Fee Payer, User is the instruction signer.
    const transactionMessage = await pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(client.wallet, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstruction(createNewJournalentryIx, tx),
      async (tx) => {
        try {
          return await client.estimateAndSetComputeUnitLimit(tx);
        } catch (e: any) {
          console.error("Compute unit estimation failed. This usually means the transaction will fail on-chain.");
          if (e.cause && e.cause.context && e.cause.context.logs) {
              console.error("Simulation Logs:", e.cause.context.logs);
          } else if (e.message) {
              console.error("Error Message:", e.message);
          }
          throw e; 
        }
      }
    );

    // 6. Sign with the Server Wallet (Fee Payer)
    // This creates a partially signed transaction with the server's signature.
    const transaction = await signTransactionMessageWithSigners(
      transactionMessage
    );

    // 7. Serialize the transaction to wire format and return as base64
    const transactionBytes = getTransactionEncoder().encode(transaction as any);
    const fullBase64 = getBase64Decoder().decode(transactionBytes);

    res.status(200).json({ 
      transaction: fullBase64,
      message: "Transaction prepared. Please sign with your wallet." 
    });

  } catch (error) {
    console.error("Error preparing journal entry:", error);
    return res.status(500).json({ error: "Failed to prepare journal entry" });
  }
});

app.get("/fetch/journ-entries", async (req, res) => {
  const owner = req.query.owner;
  try {

    const client = await createClient();

    const discriminator = getJournalEntryStateDiscriminatorBytes();
    
    // 1. Setup filters (8-byte discriminator at offset 0)
    const filters: any[] = [
      {
        memcmp: {
          offset: 0n,
          bytes: getBase58Decoder().decode(discriminator),
        },
      },
    ];

    // 2. Add owner filter if provided (owner field starts at offset 8)
    if (owner && typeof owner === 'string') {
      filters.push({
        memcmp: {
          offset: 8n,
          bytes: owner,
        },
      });
    }

    // 3. Fetch accounts from the program with base64 encoding
    // This is required because journal entry accounts can be > 128 bytes,
    // which is the limit for base58 encoding in RPC responses.
    const accounts = await client.rpc
      .getProgramAccounts(JOURNAL_PROGRAM_ADDRESS, {
        filters,
        encoding: 'base64',
      })
      .send();

    // 4. Decode results
    const entries = accounts.map((account) => {
      const dataString = Array.isArray(account.account.data) 
        ? account.account.data[0] 
        : account.account.data;

      const decoded = decodeJournalEntryState({
        address: account.pubkey,
        programAddress: JOURNAL_PROGRAM_ADDRESS,
        ...account.account,
        data: getBase64Encoder().encode(dataString as string),
      } as any);

      return {
        address: decoded.address,
        ...decoded.data,
      };
    });

    console.log(`Fetched ${entries.length} entries`);
    return res.status(200).json(entries);

  } catch (error) {
    console.error("Error fetching journal entries:", error);
    return res.status(500).json({ error: "Failed to fetch journal entries" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  initializeCounter();
});