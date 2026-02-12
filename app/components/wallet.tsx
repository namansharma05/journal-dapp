import { useWalletConnection } from "@solana/react-hooks";

export function Wallet() {
  const { connectors, connect, disconnect, wallet, status } =
    useWalletConnection();

  const address = wallet?.account.address.toString();
  return (
    <main className="flex justify-center min-h-[40vh]">
      <section className="w-full max-w-3xl space-y-4 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-lg font-semibold">Wallet connection</p>
            <p className="text-sm text-muted">
              Pick any discovered connector and manage connect / disconnect in
              one spot.
            </p>
          </div>
          <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80">
            {status === "connected" ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => connect(connector.id)}
              disabled={status === "connecting"}
              className="group flex items-center justify-between rounded-xl border border-border-low bg-card px-4 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex flex-col">
                <span className="text-base">{connector.name}</span>
                <span className="text-xs text-muted">
                  {status === "connecting"
                    ? "Connecting…"
                    : status === "connected" &&
                        wallet?.connector.id === connector.id
                      ? "Active"
                      : "Tap to connect"}
                </span>
              </span>
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full bg-border-low transition group-hover:bg-primary/80"
              />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border-low pt-4 text-sm">
          <span className="rounded-lg border border-border-low bg-cream px-3 py-2 font-mono text-xs">
            {address ?? "No wallet connected"}
          </span>
          <button
            onClick={() => disconnect()}
            disabled={status !== "connected"}
            className="inline-flex items-center gap-2 rounded-lg border border-border-low bg-card px-3 py-2 font-medium transition hover:-translate-y-0.5 hover:shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            Disconnect
          </button>
        </div>
      </section>
    </main>
  );
}
