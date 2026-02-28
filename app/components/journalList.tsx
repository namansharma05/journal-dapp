import { useEffect, useState, useCallback } from "react";
import { useWalletConnection } from "@solana/react-hooks";
import { useAppSelector } from "../redux/hooks";
import {
  createSolanaRpc,
  getAddressEncoder,
  getBase58Decoder,
  getBase64Decoder,
  getBase64Encoder,
} from "@solana/kit";
import {
  JOURNAL_PROGRAM_ADDRESS,
  getJournalEntryStateDiscriminatorBytes,
  decodeJournalEntryState,
} from "../generated/journal";
import { DeleteEntry, DeleteEntryModal } from "./deleteEntry";
import { EditEntry, EditEntryModal } from "./editEntry";

interface JournalEntry {
  owner: string;
  title: string;
  message: string;
  id: number;
  address: string;
}

export function JournalList() {
  const { wallet, status } = useWalletConnection();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshTrigger = useAppSelector(
    (state) => state.journal.refreshTrigger
  );

  const fetchEntries = useCallback(async () => {
    if (!wallet?.account?.address) return;

    try {
      setLoading(true);
      const rpc = createSolanaRpc(
        process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com"
      );

      const discriminator = getJournalEntryStateDiscriminatorBytes();
      const ownerAddressBytes = getAddressEncoder().encode(
        wallet.account.address
      );

      const response = await rpc
        .getProgramAccounts(JOURNAL_PROGRAM_ADDRESS, {
          filters: [
            {
              memcmp: {
                offset: 0n,
                bytes: getBase58Decoder().decode(discriminator) as any,
                encoding: "base58",
              },
            },
            {
              memcmp: {
                offset: 8n,
                bytes: getBase58Decoder().decode(ownerAddressBytes) as any,
                encoding: "base58",
              },
            },
          ],
          encoding: "base64",
        })
        .send();

      const decodedEntries: JournalEntry[] = [];

      for (const accountInfo of response as any[]) {
        try {
          let data = accountInfo.account.data;

          // Handle various data formats from the RPC
          let finalData: Uint8Array;
          if (typeof data === "string") {
            // It's a base64 string
            const encoder = (getBase64Encoder as any)();
            finalData = encoder.encode(data);
          } else if (Array.isArray(data)) {
            // It's [base64_string, 'base64']
            const encoder = (getBase64Encoder as any)();
            finalData = encoder.encode(data[0]);
          } else {
            // Already a Uint8Array or other
            finalData = data;
          }

          const decoded = decodeJournalEntryState({
            address: accountInfo.pubkey,
            ...accountInfo.account,
            data: finalData,
          } as any);

          decodedEntries.push({
            owner: decoded.data.owner,
            title: decoded.data.title,
            message: decoded.data.message,
            id: decoded.data.id,
            address: accountInfo.pubkey,
          });
        } catch (err) {
          console.error(`Failed to decode account ${accountInfo.pubkey}:`, err);
        }
      }

      setEntries(decodedEntries);
    } catch (error) {
      console.error("Failed to fetch journal entries:", error);
    } finally {
      setLoading(false);
    }
  }, [wallet?.account?.address]);

  useEffect(() => {
    if (status === "connected") {
      fetchEntries();
    } else {
      setEntries([]);
    }
  }, [status, fetchEntries, refreshTrigger]);

  if (status !== "connected") return null;

  return (
    <section className="w-full max-w-3xl mx-auto mt-8 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Your Journal Entries</h2>
        <button
          onClick={() => fetchEntries()}
          disabled={loading}
          className="px-4 py-2 bg-orange-100 text-orange-600 rounded-md hover:bg-orange-200 transition text-sm font-medium"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-gray-500 italic">Loading your entries...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-gray-500">
            No journal entries found for this wallet.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Create your first entry above!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, index) => (
            <div
              key={index}
              className="group flex items-center justify-between rounded-xl border border-border-low bg-card px-4 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-bold text-gray-800">
                    {entry.title}
                  </h3>
                </div>
                <p className="mt-3 text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {entry.message}
                </p>
              </div>
              <div className="flex gap-2">
                <EditEntry entry={entry} index={index} />
                <DeleteEntry entry={entry} index={index} />
              </div>
            </div>
          ))}
        </div>
      )}
      <EditEntryModal />
      <DeleteEntryModal />
    </section>
  );
}
