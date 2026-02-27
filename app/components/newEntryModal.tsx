import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { closeNewEntryModal } from "../redux/slices/openNewEntryModal";
import { useWalletConnection } from "@solana/react-hooks";
import {
  createSolanaRpc,
  getProgramDerivedAddress,
  getBytesEncoder,
  getU32Encoder,
  getAddressEncoder,
  appendTransactionMessageInstruction,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  type TransactionSigner,
  type TransactionMessage,
  lamports,
} from "@solana/kit";
import {
  fetchMaybeJournalEntryCounterState,
  getCreateJournalEntryInstructionAsync,
  JOURNAL_PROGRAM_ADDRESS,
} from "../generated/journal";
import { createClient } from "../../server/client";
import { LAMPORTS_PER_SOL } from "@solana/client";

function NewEntryForm({ onClose }: { onClose: () => void }) {
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

  async function createNewEntry() {
    try {
      setIsLoading(true);
      setError(null);

      const rpc = createSolanaRpc("http://127.0.0.1:8899");
      const walletAddress = wallet!.account!.address;

      await rpc.requestAirdrop(walletAddress, lamports(LAMPORTS_PER_SOL * 10n)).send();

      console.log("Step 1: Get latest blockhash");
      const { value: latestBlockhash } = await rpc
        .getLatestBlockhash({ commitment: "confirmed" })
        .send();

      console.log("Blockhash:", latestBlockhash.blockhash);
      console.log("Wallet address:", walletAddress);

      let entryNumber = 0;

      try {
        console.log("Step 2: Derive journal counter PDA");
        const [journalCounterAccountPda] = await getProgramDerivedAddress({
          programAddress: JOURNAL_PROGRAM_ADDRESS,
          seeds: [
            getBytesEncoder().encode(
              new Uint8Array([
                106, 111, 117, 114, 110, 97, 108, 45, 99, 111, 117, 110, 116,
                101, 114,
              ])
            ),
          ],
        });

        console.log("Counter PDA:", journalCounterAccountPda);

        console.log("Step 3: Check if counter account already exists");
        const maybeCounterAccount = await fetchMaybeJournalEntryCounterState(
          rpc,
          journalCounterAccountPda
        );

        if (maybeCounterAccount?.exists) {
          entryNumber = maybeCounterAccount.data?.count ?? 0;
        }

        console.log("Entry number:", entryNumber);

        console.log("Step 4: Generate journal entry account PDA");
        const [journalEntryAccountPda] = await getProgramDerivedAddress({
          programAddress: JOURNAL_PROGRAM_ADDRESS,
          seeds: [
            new TextEncoder().encode("journal-entry"),
            getU32Encoder({ endian: "little" as any }).encode(entryNumber),
            getAddressEncoder().encode(walletAddress as any),
          ],
        });

        console.log("Entry PDA:", journalEntryAccountPda);

        console.log("Step 5: Build create journal entry instruction");
        const createEntryIx = await getCreateJournalEntryInstructionAsync({
          signer: walletSigner!,
          journalEntryCounterAccount: journalCounterAccountPda,
          journalEntryAccount: journalEntryAccountPda,
          title,
          message,
        });

        console.log("Step 6: Build transaction message");
        const transactionMessage = await pipe(
          createTransactionMessage({ version: 0 }),
          (tx) => setTransactionMessageFeePayerSigner(walletSigner!, tx),
          (tx) =>
            setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
          (tx) => appendTransactionMessageInstruction(createEntryIx, tx)
        );
        console.log("Transaction message built");

        console.log("Step 7: Sign and send transaction");
        const signature =
          await signAndSendTransactionMessageWithSigners(transactionMessage);
        console.log("Transaction sent with signature:", signature);

        const base58Signature =
          typeof signature === "string"
            ? signature
            : getBase58Decoder().decode(signature as any);

        setTxSignature(base58Signature);
        setTitle("");
        setMessage("");

        console.log("Transaction successful. Signature:", base58Signature);

        // Close modal after brief delay
        setTimeout(() => {
          onClose();
        }, 2000);
      } catch (err) {
        console.error("Error during transaction:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create journal entry";
        setError(errorMessage);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create journal entry";
      setError(errorMessage);
      console.error("Error creating journal entry:", err);
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
