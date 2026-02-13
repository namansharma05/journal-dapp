import express from "express";
import dotenv from "dotenv";
import cors  from "cors";
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
} from "@solana/kit";
import { createClient } from "./client.ts";
import {
  getInitializeCounterInstructionAsync,
  fetchMaybeJournalEntryCounterState,
} from "../app/generated/journal/index.ts";

dotenv.config();

const app = express();

app.use(cors());

const PORT = process.env.NEXT_PUBLIC_PORT;

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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/create/journal-entry", (req, res) => {
  const { title, message} = req.body;
  console.log("title", title);
  console.log("message", message);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  initializeCounter();
});