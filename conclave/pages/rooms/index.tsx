"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchRooms, fetchMyRooms, ApiRoom } from "../../lib/api";
import { useConclaveProgram } from "../../hooks/useConclaveProgram";

interface RoomItem {
  publicKey: string;
  name: string;
  authority: string;
  governanceMint: string;
  memberCount: number;
  proposalCount: number;
  createdAt: number;
  realmAddress: string | null;
}

function mapApiRoom(r: ApiRoom): RoomItem {
  // Check localStorage for realm address as fallback
  const localRealm = typeof window !== "undefined"
    ? localStorage.getItem(`conclave_realm_${r.address}`)
    : null;
  return {
    publicKey: r.address,
    name: r.name,
    authority: r.authority,
    governanceMint: r.governance_mint,
    memberCount: r.member_count,
    proposalCount: r.proposal_count,
    createdAt: r.created_at,
    realmAddress: r.realm_address || localRealm || null,
  };
}

type RoomTab = "my" | "all";

export default function RoomsListPage() {
  const { programReadOnly } = useConclaveProgram();
  const { publicKey: wallet, connected } = useWallet();
  const [allRooms, setAllRooms] = useState<RoomItem[]>([]);
  const [myRooms, setMyRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<RoomTab>("all");

  // Switch to "my" tab when wallet connects
  useEffect(() => {
    if (connected) setTab("my");
  }, [connected]);

  // Fetch all rooms from indexer (no dependency on programReadOnly)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRooms();
        if (cancelled) return;
        setAllRooms(data.map(mapApiRoom));
      } catch {
        // Fallback to on-chain if indexer is down and program is ready
        if (programReadOnly) {
          try {
            const accounts = await (programReadOnly.account as any).daoRoom.all();
            if (cancelled) return;
            setAllRooms(
              accounts.map((acc: any) => ({
                publicKey: acc.publicKey.toBase58(),
                name: acc.account.name,
                authority: acc.account.authority.toBase58(),
                governanceMint: acc.account.governanceMint.toBase58(),
                memberCount: acc.account.memberCount ?? 0,
                proposalCount: acc.account.proposalCount ?? 0,
                createdAt: Number(acc.account.createdAt ?? 0),
                realmAddress: null,
              })),
            );
          } catch (e: any) {
            if (!cancelled) setError(e?.message || "Failed to load rooms");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programReadOnly]);

  // Fetch my rooms: try indexer API, fallback to filtering allRooms by authority
  useEffect(() => {
    if (!wallet) {
      setMyRooms([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMyRooms(wallet.toBase58());
        if (!cancelled && data.length > 0) {
          setMyRooms(data.map(mapApiRoom));
          return;
        }
      } catch {
        // Indexer API failed — fall through to fallback
      }
      // Fallback: show rooms where current wallet is the creator
      if (!cancelled && allRooms.length > 0) {
        const walletStr = wallet.toBase58();
        const created = allRooms.filter((r) => r.authority === walletStr);
        setMyRooms(created);
      } else if (!cancelled) {
        setMyRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, allRooms]);

  const displayRooms = tab === "my" ? myRooms : allRooms;

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 relative">
      {/* Background blobs for this page too */}
      <div className="absolute top-20 -left-64 w-96 h-96 bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob z-0 pointer-events-none"></div>
      <div className="absolute bottom-0 -right-64 w-96 h-96 bg-conclave-blue/10 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000 z-0 pointer-events-none"></div>

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-conclave-text uppercase tracking-widest mb-2 flex items-center gap-4">
            <div className="w-3 h-3 bg-conclave-pink rounded-full shadow-[0_0_15px_rgba(255,77,141,0.8)] animate-pulse"></div>
            Governance Rooms
          </h1>
          <p className="text-sm text-conclave-textMuted uppercase tracking-widest font-medium">Join or create anonymous workspaces</p>
        </div>
        <Link href="/rooms/create" className="btn-primary shadow-[0_0_30px_rgba(237,224,212,0.15)] mt-4 md:mt-0">
          + Create Room
        </Link>
      </div>

      {/* Tabs */}
      {connected && (
        <div className="relative z-10 flex gap-4 mb-10 border-b border-white/10 pb-4">
          <button
            onClick={() => setTab("my")}
            className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all duration-300 ${tab === "my"
              ? "bg-conclave-pink text-conclave-dark shadow-[0_0_20px_rgba(255,77,141,0.4)] transform scale-105"
              : "bg-white/5 border border-white/10 text-conclave-textMuted hover:text-white hover:bg-white/10"
              }`}
          >
            My Rooms <span className="ml-2 bg-black/20 px-2 py-0.5 rounded-full">{myRooms.length}</span>
          </button>
          <button
            onClick={() => setTab("all")}
            className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all duration-300 ${tab === "all"
              ? "bg-conclave-blue text-conclave-dark shadow-[0_0_20px_rgba(0,184,241,0.4)] transform scale-105"
              : "bg-white/5 border border-white/10 text-conclave-textMuted hover:text-white hover:bg-white/10"
              }`}
          >
            All Rooms <span className="ml-2 bg-black/20 px-2 py-0.5 rounded-full">{allRooms.length}</span>
          </button>
        </div>
      )}

      {loading && <p className="text-conclave-muted">Loading rooms...</p>}
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {!loading && displayRooms.length === 0 && (
        <div className="card text-center text-conclave-muted">
          {tab === "my" ? (
            <>
              <p className="mb-4">You haven't joined any rooms yet.</p>
              <button
                onClick={() => setTab("all")}
                className="btn-secondary inline-block mr-3"
              >
                Browse all rooms
              </button>
              {/* <Link href="/rooms/create" className="btn-primary inline-block">
                Create a room
              </Link> */}
            </>
          ) : (
            <>
              <p className="mb-4">No rooms yet.</p>
              <Link href="/rooms/create" className="btn-primary inline-block">
                Create the first room
              </Link>
            </>
          )}
        </div>
      )}

      {!loading && displayRooms.length > 0 && (
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayRooms.map((room) => (
            <Link
              key={room.publicKey}
              href={`/rooms/${room.publicKey}`}
              className="group block relative rounded-3xl border border-white/10 bg-conclave-card/40 p-6 sm:p-8 backdrop-blur-md overflow-hidden transform transition-all duration-500 hover:scale-[1.02] hover:bg-white/5 hover:border-white/20 hover:shadow-[0_15px_40px_rgba(0,0,0,0.5)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-conclave-text/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-conclave-text uppercase tracking-wider">{room.name}</h2>
                    <div className="w-8 h-8 rounded-full bg-conclave-dark border border-white/20 flex items-center justify-center transform transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:bg-conclave-text group-hover:text-conclave-dark">
                      <span className="text-lg font-bold leading-none">&rarr;</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {room.realmAddress && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                        Realms Linked
                      </span>
                    )}
                    {tab === "my" && wallet && room.authority === wallet.toBase58() && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-conclave-yellow/10 text-conclave-yellow border border-conclave-yellow/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-conclave-yellow"></div>
                        Creator
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-conclave-textMuted uppercase tracking-widest border-b border-white/5 pb-2">
                      <span>Members</span>
                      <span className="text-conclave-text font-bold text-sm">{room.memberCount} <span className="text-[10px] font-normal text-conclave-textMuted">Anon</span></span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-conclave-textMuted uppercase tracking-widest border-b border-white/5 pb-2">
                      <span>Proposals</span>
                      <span className="text-conclave-text font-bold text-sm">{room.proposalCount}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/10">
                  <p className="text-[10px] text-conclave-textMuted uppercase tracking-widest font-mono truncate">
                    Mint <span className="text-conclave-text/70">{room.governanceMint}</span>
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
