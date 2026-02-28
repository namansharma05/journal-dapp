"use client";

import { SolanaProvider } from "@solana/react-hooks";
import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { store } from "../redux/store";

import { autoDiscover, createClient } from "@solana/client";

const client = createClient({
  endpoint: process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
  walletConnectors: autoDiscover(),
});

export function Providers({ children }: PropsWithChildren) {
  return (
    <Provider store={store}>
      <SolanaProvider client={client}>{children}</SolanaProvider>
    </Provider>
  );
}
