import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import {
  incrementRefreshTrigger,
  setDeletingEntry,
  clearDeletingEntry,
} from "../redux/slices/journal";
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
import { Wallet } from "./wallet";
import { useWalletConnection } from "@solana/react-hooks";
import { LAMPORTS_PER_SOL } from "@solana/client";
import { getDeleteJournalEntryInstructionAsync } from "../generated/journal";

interface JournalEntry {
  owner: string;
  title: string;
  message: string;
  id: number;
  address: string;
}

export function DeleteEntry({
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
        onClick={() => dispatch(setDeletingEntry({ ...entry, index }))}
        className="px-4 py-2 bg-orange-400 rounded-xl cursor-pointer border hover:bg-orange-300 hover:duration-50"
      >
        Delete
      </button>
    </div>
  );
}

export function DeleteEntryModal() {
  const deletingEntry = useAppSelector((state) => state.journal.deletingEntry);
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { wallet } = useWalletConnection();

  const handleCancel = () => {
    console.log("Delete cancelled for entry:", deletingEntry);
    dispatch(clearDeletingEntry());
  };

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

  if (!deletingEntry) return null;

  const handleConfirm = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setTxSignature(null);

      const rpc = createSolanaRpc("http://127.0.0.1:8899");
      const walletAddress = wallet!.account!.address;

      await rpc
        .requestAirdrop(walletAddress, lamports(10n * LAMPORTS_PER_SOL))
        .send();

      const { value: latestBlockhash } = await rpc
        .getLatestBlockhash({ commitment: "confirmed" })
        .send();

      const deleteIx = await getDeleteJournalEntryInstructionAsync({
        signer: walletSigner!,
        count: deletingEntry.id,
      });

      const transactionMessage = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(walletSigner!, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstruction(deleteIx, tx)
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

      // Trigger list refresh
      dispatch(incrementRefreshTrigger());

      // Close modal after delay to show signature
      setTimeout(() => {
        dispatch(clearDeletingEntry());
      }, 2000);
    } catch (err) {
      console.error("Error Deleting Entry:", err);
      dispatch(clearDeletingEntry());
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-[50%] md:w-[50%] lg:w-[30%] bg-white p-6 rounded-2xl shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            Delete Entry #{deletingEntry.index}
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-500 hover:text-black transition"
          >
            ✕
          </button>
        </div>
        <div className="flex items-center justify-evenly">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl cursor-pointer border"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-orange-400 rounded-xl cursor-pointer border hover:bg-orange-300 hover:duration-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
