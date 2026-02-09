import express from "express";
import dotenv from "dotenv";
import {createSolanaRpc, createSolanaRpcSubscriptions, sendTransactionWithoutConfirmingFactory } from "@solana/kit";
import { todo } from "node:test";

dotenv.config();

const app = express();

const PORT = process.env.NEXT_PUBLIC_PORT;

app.get("/", (req, res) => {
  res.json({ message: "hello world!" });
});

let client: Client;
function createClient(): Client {
    if (!client) {
        client = {
            rpc: createSolanaRpc('http://127.0.0.1:8899'),
            rpcSubscriptions: createSolanaRpcSubscriptions('ws://127.0.0.1:8900'),
        };
    }
    return client;
}


app.post("/initialize-counter", async(req, res) => {
  try {
    const client = createClient();
    const transaction = todo;
    const sendTransaction = sendTransactionWithoutConfirmingFactory({rpc: client.rpc});
    await sendTransaction(transaction, { commitment: "confirmed"});
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
