"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

export default function HomePage() {
  const { connected } = useWallet();

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-white mb-4">
        Private voting for DAOs
      </h1>
      <p className="text-conclave-muted text-lg mb-10">
        Conclave revives governance by solving the public voting problem. Commit your vote on-chain,
        reveal after the deadline — no one sees how you voted until it&apos;s over.
      </p>

      {!connected ? (
        <div className="card inline-block text-left">
          <p className="text-conclave-muted mb-4">
            Connect your wallet to create a room or join existing DAO rooms.
          </p>
          <p className="text-sm text-conclave-muted">
            Use the <strong className="text-white">Connect wallet</strong> button in the header.
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/rooms/create"
            className="btn-primary inline-flex items-center justify-center gap-2 py-3 px-6 text-base"
          >
            Create room
          </Link>
          <Link
            href="/rooms"
            className="btn-secondary inline-flex items-center justify-center gap-2 py-3 px-6 text-base"
          >
            Browse rooms
          </Link>
        </div>
      )}

      <section className="mt-20 text-left max-w-xl mx-auto">
        <h2 className="text-xl font-semibold text-white mb-3">How it works</h2>
        <ul className="space-y-2 text-conclave-muted">
          <li>· Create or join a room tied to your DAO&apos;s governance token.</li>
          <li>· Discuss in encrypted chat — only room members see messages.</li>
          <li>· Vote on proposals with commit–reveal: no one sees your choice until the deadline.</li>
          <li>· Reveal and tally on-chain after the deadline.</li>
        </ul>
      </section>
    </div>
  );
}
