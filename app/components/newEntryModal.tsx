"use client";
import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { closeNewEntryModal } from "../redux/slices/openNewEntryModal";
import { useWalletConnection } from "@solana/react-hooks";
import {
  createSolanaRpc,
  compileTransaction,
  getProgramDerivedAddress,
  getAddressEncoder,
  getU32Encoder,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  type TransactionSigner,
  lamports,
} from "@solana/kit";
import {
  fetchMaybeJournalEntryCounterState,
  getCreateJournalEntryInstructionAsync,
  JOURNAL_PROGRAM_ADDRESS,
} from "../generated/journal";
import { incrementRefreshTrigger } from "../redux/slices/journal";
import { createClient } from "../../server/client";
import { LAMPORTS_PER_SOL } from "@solana/client";

function NewEntryForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { wallet } = useWalletConnection();
  const dispatch = useAppDispatch();

  const walletSigner = useMemo(() => {
    if (!wallet?.account || !wallet?.sendTransaction) return undefined;
    const signer = {
      address: wallet.account.address,
      async signAndSendTransactions(transactions: any, config = {}) {
        if (transactions.length === 0) return [];
        console.log("Transaction being sent to wallet:", transactions[0]);
        // Delegate to the wallet's sendTransaction method
        const signature = await wallet.sendTransaction!(
          transactions[0] as any,
          config
        );
        const signatureBytes =
          typeof signature === "string"
            ? getBase58Encoder().encode(signature)
            : signature;
        return [signatureBytes as any];
      },
    };
    return signer as unknown as TransactionSigner;
  }, [wallet]);

  const stringifyWithBigInt = (obj: any, indent = 2) => {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === "bigint") return value.toString();
        if (value instanceof Error) {
          const error: any = {};
          Object.getOwnPropertyNames(value).forEach((prop) => {
            error[prop] = (value as any)[prop];
          });
          return error;
        }
        return value;
      },
      indent
    );
  };

  async function createNewEntry() {
    try {
      setIsLoading(true);
      setError(null);

      const rpc = createSolanaRpc(
        process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
      );
      const walletAddress = wallet!.account!.address;

      const balanceResponse = await rpc.getBalance(walletAddress).send();
      const balance = balanceResponse.value;
      console.log("Current wallet balance:", balance, "lamports");

      if (balance < lamports(LAMPORTS_PER_SOL / 20n)) {
        console.log("Low balance, requesting airdrop...");
        try {
          await rpc
            .requestAirdrop(walletAddress, lamports(LAMPORTS_PER_SOL * 1n))
            .send();
        } catch (e) {
          console.warn("Airdrop failed:", e);
          if (balance === 0n) {
            throw new Error(
              "Insufficient balance and airdrop failed. Please get some devnet SOL from https://faucet.solana.com/"
            );
          }
        }
      }

      const { value: latestBlockhash } = await rpc
        .getLatestBlockhash({ commitment: "confirmed" })
        .send();

      let entryNumber = 0;

      const [journalCounterAccountPda] = await getProgramDerivedAddress({
        programAddress: JOURNAL_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode("journal-counter")],
      });

      const maybeCounterAccount = await fetchMaybeJournalEntryCounterState(
        rpc,
        journalCounterAccountPda
      );

      if (maybeCounterAccount?.exists) {
        entryNumber = maybeCounterAccount.data?.count ?? 0;
      }

      const [journalEntryAccountPda] = await getProgramDerivedAddress({
        programAddress: JOURNAL_PROGRAM_ADDRESS,
        seeds: [
          new TextEncoder().encode("journal-entry"),
          getU32Encoder({ endian: "little" as any }).encode(entryNumber),
          getAddressEncoder().encode(walletAddress as any),
        ],
      });

      const createEntryIx = await getCreateJournalEntryInstructionAsync({
        signer: walletSigner!,
        journalEntryCounterAccount: journalCounterAccountPda,
        journalEntryAccount: journalEntryAccountPda,
        title,
        message,
      });

      const transactionMessage = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(walletSigner!, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstruction(createEntryIx, tx)
      );

      // Simulation
      const transaction = compileTransaction(transactionMessage);
      const wireTransaction = getBase64EncodedWireTransaction(transaction);
      const simulation = await rpc
        .simulateTransaction(wireTransaction, {
          commitment: "confirmed",
          sigVerify: false,
          encoding: "base64",
        } as any)
        .send();

      if (simulation.value.err) {
        throw new Error(
          `Simulation failed: ${stringifyWithBigInt(simulation.value.err)}`
        );
      }

      const signature =
        await signAndSendTransactionMessageWithSigners(transactionMessage);

      const base58Signature =
        typeof signature === "string"
          ? signature
          : getBase58Decoder().decode(signature as any);

      setTxSignature(base58Signature);

      // Wait for confirmation before refreshing
      console.log("Waiting for transaction confirmation...");
      let confirmed = false;
      let attempts = 0;
      while (!confirmed && attempts < 30) {
        const statuses = await rpc
          .getSignatureStatuses([base58Signature as any])
          .send();
        const status = statuses.value[0];
        if (
          status &&
          (status.confirmationStatus === "confirmed" ||
            status.confirmationStatus === "finalized")
        ) {
          confirmed = true;
          console.log("Transaction confirmed!");
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;
        }
      }

      setTitle("");
      setMessage("");

      dispatch(incrementRefreshTrigger());

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error("Error creating journal entry:", err);
      const errorMessage =
        err instanceof Error ? err.message : stringifyWithBigInt(err, 0);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
      <div className="w-[60%] md:w-[50%] lg:w-[35%] bg-white p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm font-semibold">New Entry</div>
          <div
            onClick={onClose}
            className="text-sm cursor-pointer hover:text-gray-600"
          >
            ✕
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {txSignature && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            Transaction confirmed! Signature: {txSignature.slice(0, 20)}...
          </div>
        )}

        <form>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Title (max 50 characters)
            </label>
            <input
              type="text"
              id="title"
              required
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400"
              disabled={isLoading}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="message" className="block text-sm font-medium mb-2">
              Message (max 100 characters)
            </label>
            <textarea
              id="message"
              required
              maxLength={100}
              onChange={(e) => setMessage(e.target.value)}
              value={message}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              disabled={isLoading}
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => createNewEntry()}
              disabled={
                title?.length === 0 || message?.length === 0 || isLoading
              }
              className={
                title?.length > 0 && message?.length > 0 && !isLoading
                  ? "px-4 py-2 bg-orange-400 text-white rounded-md hover:bg-orange-500 transition"
                  : "px-4 py-2 bg-orange-300 text-white rounded-md cursor-not-allowed"
              }
            >
              {isLoading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function NewEntryModal() {
  const { wallet } = useWalletConnection();
  const dispatch = useAppDispatch();
  const showEntryModal = useAppSelector((state) => state.openNewEntryModal);

  return (
    <>
      {showEntryModal ? (
        wallet && wallet.account ? (
          <NewEntryForm onClose={() => dispatch(closeNewEntryModal())} />
        ) : (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="w-[60%] md:w-[50%] lg:w-[35%] bg-white p-6 rounded-lg shadow-lg">
              <p className="text-center mb-4">
                Please connect your wallet first.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => dispatch(closeNewEntryModal())}
                  className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}
    </>
  );
}
