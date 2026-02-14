"use client";

import React from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-conclave-border bg-conclave-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg text-conclave-accent">
            Conclave
          </Link>
          <nav className="flex items-center gap-4">
            {connected && (
              <>
                <Link
                  href="/rooms"
                  className="text-conclave-muted hover:text-white text-sm"
                >
                  Rooms
                </Link>
                <Link
                  href="/rooms/create"
                  className="text-conclave-muted hover:text-white text-sm"
                >
                  Create room
                </Link>
              </>
            )}
            <WalletMultiButton className="!bg-conclave-accent !text-conclave-dark hover:!opacity-90 !rounded-lg" />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-conclave-border py-4 text-center text-conclave-muted text-sm">
        Solana Devnet · Solana Graveyard Hackathon 2026
      </footer>
    </div>
  );
}
