import { useState, useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import {
  incrementRefreshTrigger,
  clearEditingEntry,
  setEditingEntry,
} from "../redux/slices/journal";
import { useWalletConnection } from "@solana/react-hooks";
import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  type TransactionSigner,
} from "@solana/kit";
import {
  getCreateJournalEntryInstructionAsync,
  getUpdateJournalEntryInstructionAsync,
  JOURNAL_PROGRAM_ADDRESS,
} from "../generated/journal";
import { LAMPORTS_PER_SOL } from "@solana/client";

interface JournalEntry {
  owner: string;
  title: string;
  message: string;
  id: number;
  address: string;
}

export function EditEntry({
  entry,
  index,
}: {
  entry: JournalEntry;
  index: number;
}) {
  const dispatch = useAppDispatch();
  return (
    <div>
      <button
        onClick={() => dispatch(setEditingEntry({ ...entry, index }))}
        className="px-4 py-2 rounded-xl cursor-pointer border text-sm hover:bg-gray-100 transition"
      >
        Edit
      </button>
    </div>
  );
}

export function EditEntryModal() {
  const editingEntry = useAppSelector((state) => state.journal.editingEntry);
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { wallet } = useWalletConnection();

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

  useEffect(() => {
    if (editingEntry) {
      setTitle(editingEntry.title);
      setMessage(editingEntry.message);
    }
  }, [editingEntry]);

  if (!editingEntry) return null;

  const handleClose = () => {
    console.log("Closing modal for entry: ", editingEntry);
    dispatch(clearEditingEntry());
  };

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

  const handleSave = async () => {
    try {
      if (!walletSigner) {
        throw new Error("Wallet not connected or missing signing capabilities");
      }

      setIsLoading(true);
      setError(null);
      setTxSignature(null);

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

      const updateEntryIx = await getUpdateJournalEntryInstructionAsync({
        signer: walletSigner!,
        title,
        message,
        count: editingEntry.id,
      });

      const transactionMessage = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(walletSigner!, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstruction(updateEntryIx, tx)
      );

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
      console.log("Transaction sent with signature:", signature);

      const base58Signature =
        typeof signature === "string"
          ? signature
          : getBase58Decoder().decode(signature as any);

      setTxSignature(base58Signature);
      console.log("Transaction successful. Signature:", base58Signature);

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

      // Trigger list refresh
      dispatch(incrementRefreshTrigger());

      // Close modal after delay to show signature
      setTimeout(() => {
        dispatch(clearEditingEntry());
      }, 2000);
    } catch (e: any) {
      console.error("error while saving entry: ", e);
      // Detailed logging for tricky "Me: Unexpected error"
      try {
        const errorDetails = stringifyWithBigInt(e, 2);
        console.log("Error details:", errorDetails);
      } catch (logErr) {
        console.log("Could not stringify error object: ", e);
      }

      let errorMessage = "An unexpected error occurred";
      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === "string") {
        errorMessage = e;
      } else if (e && typeof e === "object" && e.message) {
        errorMessage = e.message;
      } else if (e && typeof e === "object") {
        errorMessage = stringifyWithBigInt(e, 0);
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-[90%] md:w-[60%] lg:w-[40%] bg-white p-6 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            Edit Entry #{editingEntry.index}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-black transition"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}
          {txSignature && (
            <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-xl text-sm break-all">
              Confirmed! {txSignature.slice(0, 20)}...
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold mb-1">Title</label>
            <input
              type="text"
              value={title}
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-orange-400 outline-none disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Message</label>
            <textarea
              value={message}
              maxLength={100}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isLoading}
              rows={4}
              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-orange-400 outline-none resize-none disabled:bg-gray-50"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={handleClose}
            className="px-6 py-2 rounded-xl border font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || title.length === 0 || message.length === 0}
            className="px-6 py-2 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition shadow-lg shadow-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
