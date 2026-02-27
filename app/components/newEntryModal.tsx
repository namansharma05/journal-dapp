import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { closeNewEntryModal } from "../redux/slices/openNewEntryModal";
import { useWalletConnection } from "@solana/react-hooks";
import {
  createSolanaRpc,
  getProgramDerivedAddress,
  getBytesEncoder,
  appendTransactionMessageInstruction,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  type TransactionSigner,
  sendAndConfirmTransactionFactory,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import {
  fetchMaybeJournalEntryCounterState,
  getCreateJournalEntryInstructionAsync,
  getInitializeCounterInstructionAsync,
} from "../generated/journal";
import { createClient } from "../../server/client";

function NewEntryForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { wallet } = useWalletConnection();

  function addressToBytes(address: string): Uint8Array {
    // Decode base58 → 32-byte public key
    const ALPHABET =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    let decoded = BigInt(0);
    for (const char of address) {
      decoded = decoded * BigInt(58) + BigInt(ALPHABET.indexOf(char));
    }

    const bytes = new Uint8Array(32);
    for (let i = 31; i >= 0; i--) {
      bytes[i] = Number(decoded & BigInt(0xff));
      decoded = decoded >> BigInt(8);
    }

    return bytes; // Returns exactly 32 bytes!
  }

  async function createNewEntry() {
    try {
      setIsLoading(true);
      setError(null);

      if (!wallet?.account) {
        setError("Wallet not connected");
        return;
      }

      const rpc = createSolanaRpc("http://127.0.0.1:8899");
      const rpcSubscriptions = createSolanaRpcSubscriptions(
        "ws://127.0.0.1:8900"
      );

      const walletAddress = wallet.account.address;

      console.log("Step 1: Get latest blockhash");
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      console.log("Blockhash:", latestBlockhash.blockhash);
      console.log("Wallet address:", walletAddress);

      // Create a TransactionSigner from wallet account
      const signer: TransactionSigner = {
        address: walletAddress,
      } as TransactionSigner;

      let entryNumber = 0;
      let counterExists = false;

      try {
        const client = await createClient();
        console.log("Step 2: Get initialize counter instruction");
        const initializeCounterIx = await getInitializeCounterInstructionAsync({
          signer: client.wallet,
        });

        const journalCounterAccountPda =
          initializeCounterIx.accounts[1].address;

        console.log("Counter PDA:", journalCounterAccountPda);

        console.log("Step 3: Check if counter account already exists");
        const maybeCounterAccount = await fetchMaybeJournalEntryCounterState(
          rpc,
          journalCounterAccountPda
        );

        if (maybeCounterAccount) {

          // Check if it has the expected structure
          if (maybeCounterAccount.exists) {
            entryNumber = maybeCounterAccount.data?.count ?? 0;
            counterExists = true;
          } else {
            entryNumber = 0;
            counterExists = false;
          }
        }

        console.log(
          "Entry number:",
          entryNumber,
          "Counter exists:",
          counterExists
        );
		console.log("counter account ix:", initializeCounterIx);

        console.log("Step 4: Generate journal entry account PDA");
        const journalEntryAccountPda = await getProgramDerivedAddress({
          programAddress: initializeCounterIx.programAddress,
          seeds: [
            "journal-entry",
            getBytesEncoder().encode(new Uint8Array([entryNumber])),
            getBytesEncoder().encode(addressToBytes(walletAddress)),
          ],
        });

        console.log("Entry PDA:", journalEntryAccountPda);

        console.log("Step 5: Build create journal entry instruction");
        const createEntryIx = await getCreateJournalEntryInstructionAsync({
          signer,
          journalEntryCounterAccount: journalCounterAccountPda,
          journalEntryAccount: journalEntryAccountPda[0],
          title,
          message,
        });

        console.log("Step 6: Build transaction message");
        const transactionMessage = await pipe(
          createTransactionMessage({ version: 0 }),
          (tx) => setTransactionMessageFeePayerSigner(signer, tx),
          (tx) =>
            setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
          (tx) => appendTransactionMessageInstruction(createEntryIx, tx)
        );
        console.log("Transaction message built");

        console.log("Step 7: Sign transaction message");
        const signedTransaction =
          await signTransactionMessageWithSigners(transactionMessage);
        console.log("Transaction signed");

		console.log("Step 8: Assert transaction is valid");
      assertIsSendableTransaction(signedTransaction);
      assertIsTransactionWithBlockhashLifetime(signedTransaction);

		console.log("Step 9: Send and confirm transaction");
		// Send transaction using RPC
		const sentSignature = await rpc
		  .sendTransaction(signedTransaction, {commitment: "confirmed", skipPreflight: true})
		  .send();
  
		console.log("Transaction sent. Signature:", sentSignature);
      } catch (err) {
        console.log(
          "Counter account not found (expected for first entry):",
          err
        );
        entryNumber = 0;
        counterExists = false;
      }

      //   console.log("Step 6: Determine instructions to include");
      //   const instructions = counterExists
      //     ? [createEntryIx]
      //     : [initializeCounterIx, createEntryIx];

      //   console.log(
      //     "Instructions to send:",
      //     instructions.length,
      //     counterExists ? "(counter exists)" : "(initializing counter)"
      //   );

      //   console.log("Step 9: Assert transaction is valid");
      //   assertIsSendableTransaction(transaction);
      //   assertIsTransactionWithBlockhashLifetime(transaction);


      //   // Confirm transaction
      //   console.log("Waiting for confirmation...");
      //   const confirmationResult = await rpc
      //     .confirmTransaction(sentSignature, "finalized")
      //     .send();

      //   console.log("Confirmation result:", confirmationResult);

      //   if (confirmationResult.value.err) {
      //     throw new Error(
      //       `Transaction failed: ${JSON.stringify(confirmationResult.value.err)}`
      //     );
      //   }

      //   // Get signature from transaction as well (should match)
      //   const txSignature = getSignatureFromTransaction(transaction);
      //   console.log("Signature from transaction:", txSignature);

      //   setTxSignature(sentSignature);
      //   setTitle("");
      //   setMessage("");

      //   // Close modal after brief delay
      //   setTimeout(() => {
      //     onClose();
      //   }, 2000);
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
