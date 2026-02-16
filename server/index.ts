import express from "express";
import dotenv from "dotenv";
import cors  from "cors";
import path from "path";
import { fileURLToPath } from "url";
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
  const { title, message } = req.body;
  try {
    const client = await createClient();

    const [{ value: latestBlockhash }] = await Promise.all([
      client.rpc.getLatestBlockhash().send(),
    ]);

    // 1. Derive the counter PDA (same as in initializeCounter)
    const [journalEntryCounterAccount] = await getProgramDerivedAddress({
      programAddress: JOURNAL_PROGRAM_ADDRESS,
      seeds: [getUtf8Encoder().encode("journal-counter")],
    });

    // 2. Fetch the current count to derive the journal entry PDA
    const maybeCounterAccount = await fetchMaybeJournalEntryCounterState(
      client.rpc,
      journalEntryCounterAccount
    );

    if (!maybeCounterAccount.exists) {
      return res.status(400).json({ error: "Counter not initialized" });
    }

    const currentCount = maybeCounterAccount.data.count;

    // 3. Derive the journal entry PDA: [b"journal-entry", count, signer]
    const [journalEntryAccount] = await getProgramDerivedAddress({
      programAddress: JOURNAL_PROGRAM_ADDRESS,
      seeds: [
        getUtf8Encoder().encode("journal-entry"),
        getU32Encoder().encode(currentCount),
        getAddressEncoder().encode(client.wallet.address),
      ],
    });

    console.log(`Creating journal entry at: ${journalEntryAccount}`);

    const createNewJournalentryIx = await getCreateJournalEntryInstructionAsync({
      signer: client.wallet,
      title,
      message,
      journalEntryAccount,
    });

    const transactionMessage = await pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(client.wallet, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstruction(createNewJournalentryIx, tx),
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
    console.log("Journal Entry Created. Signature:", signature);
    console.log("title", title);
    console.log("message", message);
    res.status(200).json({ message: "Journal entry created" });

  } catch (error) {
    console.error("Error creating journal entry:", error);
    return res.status(500).json({ error: "Failed to create journal entry" });
  }
});

app.get("/fetch/journ-entries", async (req, res) => {
  const owner = req.query.owner;
  try {
    console.log("owner is: ", owner);

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