import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { closeNewEntryModal } from "../redux/slices/openNewEntryModal";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import { useWalletConnection } from "@solana/react-hooks";
import {
  Address,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getProgramDerivedAddress,
  getU32Encoder,
  getUtf8Encoder,
  getAddressEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signAndSendTransactionMessageWithSigners,
} from "@solana/kit";
import { getCreateJournalEntryInstructionAsync } from "../generated/journal/instructions/createJournalEntry";
import { fetchJournalEntryCounterState } from "../generated/journal/accounts/journalEntryCounterState";
import { JOURNAL_PROGRAM_ADDRESS } from "../generated/journal/programs/journal";

function NewEntryForm({
  account,
  onClose,
}: {
  account: any;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const { wallet } = useWalletConnection();

  // Get the transaction sending signer for the connected wallet
  const walletSigner = useWalletAccountTransactionSendingSigner(
    account,
    "solana:devnet" // Use localnet for local development
  );

  const handleCreateJournal = async () => {
    if (!wallet) {
      alert("Please connect your wallet first");
      return;
    }

    try {
      setIsLoading(true);
      setTxSignature(null);

      const httpProvider = "http://127.0.0.1:8899";
      const rpc = createSolanaRpc(httpProvider);

      console.log(`Established connection to ${httpProvider}`);

      // 1. Fetch the latest blockhash
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
      console.log(`Latest Blockhash: ${latestBlockhash.blockhash}`);

      // 2. Derive the counter PDA
      const [journalEntryCounterAccount] = await getProgramDerivedAddress({
        programAddress: JOURNAL_PROGRAM_ADDRESS,
        seeds: [getUtf8Encoder().encode("journal-counter")],
      });

      console.log(`Counter PDA: ${journalEntryCounterAccount}`);

      // 3. Fetch the current count
      const counterAccount = await fetchJournalEntryCounterState(
        rpc,
        journalEntryCounterAccount
      );

      const currentCount = counterAccount.data.count;
      console.log(`Current count: ${currentCount}`);

      // 4. Derive the journal entry PDA
      const [journalEntryAccount] = await getProgramDerivedAddress({
        programAddress: JOURNAL_PROGRAM_ADDRESS,
        seeds: [
          getUtf8Encoder().encode("journal-entry"),
          getU32Encoder({ endian: "little" as any }).encode(currentCount),
          getAddressEncoder().encode(account.address as Address),
        ],
      });

      console.log(`Journal Entry PDA: ${journalEntryAccount}`);

      // 5. Build the create journal entry instruction
      const createJournalEntryIx = await getCreateJournalEntryInstructionAsync({
        signer: walletSigner,
        title,
        message,
        journalEntryAccount,
      });

      console.log("Instruction created:", createJournalEntryIx);

      // 6. Build the transaction message
      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(walletSigner, tx),
        (tx) =>
          setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstruction(createJournalEntryIx, tx)
      );

      console.log("Transaction message built");

      // Sign and send the transaction using the accountSigner
      const signature =
        await signAndSendTransactionMessageWithSigners(transactionMessage);

      console.log("Transaction sent, signature:", signature);

      // Decode signature to base58
      const base58Signature = getBase58Decoder().decode(signature);
      setTxSignature(base58Signature);

      console.log(`✅ Transaction successful! Signature: ${base58Signature}`);

      // Clear form fields on success
      setTitle("");
      setMessage("");

      // Auto-close modal after 3 seconds
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error) {
      console.error("Failed to create journal entry:", error);
      alert(`Failed to create journal entry: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
      <div className="w-[60%] md:w-[50%] lg:w-[35%] bg-white p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm">New Entry</div>
          <div onClick={onClose} className="text-sm cursor-pointer">
            x
          </div>
        </div>

        {txSignature ? (
          <div className="mb-4 p-4 bg-green-100 border border-green-400 rounded-md">
            <p className="text-sm font-semibold text-green-800 mb-2">
              ✅ Journal entry created successfully!
            </p>
            <p className="text-xs text-green-700 break-all">
              Signature: {txSignature}
            </p>
          </div>
        ) : null}

        <form>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm mb-2">
              Title (max 50 characters)
            </label>
            <input
              type="text"
              id="title"
              required
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
              className="w-full px-3 py-2 border rounded-md"
              disabled={isLoading}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="message" className="block text-sm mb-2">
              Message (max 100 characters)
            </label>
            <textarea
              id="message"
              required
              maxLength={100}
              onChange={(e) => setMessage(e.target.value)}
              value={message}
              className="w-full px-3 py-2 border rounded-md"
              disabled={isLoading}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 mr-2 text-gray-600"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateJournal}
              disabled={
                title?.length === 0 || message?.length === 0 || isLoading
              }
              className={
                title?.length > 0 && message?.length > 0 && !isLoading
                  ? "px-4 py-2 bg-orange-400 text-white rounded-md hover:bg-orange-300 hover:duration-50"
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
  const { wallet, status } = useWalletConnection();

  const dispatch = useAppDispatch();
  const showEntryModal = useAppSelector((state) => state.openNewEntryModal);

  return (
    <>
      {showEntryModal ? (
        wallet && wallet.account ? (
          <NewEntryForm
            account={wallet.account}
            onClose={() => dispatch(closeNewEntryModal())}
          />
        ) : (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="w-[60%] md:w-[50%] lg:w-[35%] bg-white p-6 rounded-lg shadow-lg">
              <p className="text-center mb-4">
                Please connect your wallet first.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => dispatch(closeNewEntryModal())}
                  className="px-4 py-2 bg-gray-200 rounded-md"
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
