"use client";

import { Navbar } from "./components/navbar";
import { NewEntryModal } from "./components/newEntryModal";
import { Wallet } from "./components/wallet";

export default function Home() {
  return (
    <>
      <Navbar />
      <Wallet />
      <NewEntryModal />
    </>
  );
}
