import { useEffect, useState } from "react";
import { useWalletConnection } from "@solana/react-hooks";

interface JournalEntry {
  address: string;
  owner: string;
  title: string;
  message: string;
}

export function JournalList() {
  const { wallet, status } = useWalletConnection();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchEntries = async () => {
      if (status !== "connected" || !wallet) return;

      setLoading(true);
      try {
        const port = process.env.NEXT_PUBLIC_PORT || 3001;
        const owner = wallet.account.address;
        const response = await fetch(
          `http://localhost:${port}/fetch/journ-entries?owner=${owner}`
        );
        const data = await response.json();
        setEntries(data);
      } catch (error) {
        console.error("Error fetching entries:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [wallet, status]);

  if (status !== "connected") return null;

  return (
    <div className="max-w-3xl mx-auto mt-8 p-6">
      <h2 className="text-2xl font-bold mb-4">Your Journal Entries</h2>
      {loading ? (
        <p>Loading your entries...</p>
      ) : entries.length === 0 ? (
        <p>No journal entries found for this wallet.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div
              key={entry.address}
              className="p-4 bg-white rounded-lg shadow border border-gray-100"
            >
              <h3 className="text-xl font-semibold text-orange-600">
                {entry.title}
              </h3>
              <p className="mt-2 text-gray-700 whitespace-pre-wrap">
                {entry.message}
              </p>
              <div className="mt-4 text-[10px] text-gray-400 font-mono">
                PDA: {entry.address}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
