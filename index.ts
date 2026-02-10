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
} from "@solana/kit";
import { createClient } from "./client.ts";
import  {getInitializeCounterInstructionAsync}  from "./app/generated/journal/index.ts";

dotenv.config();

const app = express();

const PORT = process.env.NEXT_PUBLIC_PORT;

app.get("/", (req, res) => {
  res.json({ message: "hello world!" });
});

app.post("/initialize-counter", async (req, res) => {
  try {
    const client = await createClient();

    const [{ value: latestBlockhash }] = await Promise.all([
      client.rpc.getLatestBlockhash().send(),
    ]);

    const createCounterAccountIx = await getInitializeCounterInstructionAsync({
      signer: client.wallet,
    });

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
    res.json({
      message: "Counter initialized successfully",
      signature: signature,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
