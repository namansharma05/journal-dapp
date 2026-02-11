import express from "express";
import dotenv from "dotenv";
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
  getBase64Codec,
} from "@solana/kit";
import { createClient } from "./client.ts";
import {
  getInitializeCounterInstructionAsync,
  fetchJournalEntryCounterState,
} from "./app/generated/journal/index.ts";

dotenv.config();

const app = express();

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

    const journalCounterAccountPda = createCounterAccountIx.accounts[1].address;
    const counterAccount = await fetchJournalEntryCounterState(client.rpc, journalCounterAccountPda);
    console.log("Counter Account Data:", counterAccount.data);
    console.log("Current Count:", counterAccount.data.count);
  } catch (error) {
    console.error(error);
    // res.status(500).json({ message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
  }
}


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

initializeCounter();