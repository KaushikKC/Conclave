import Head from "next/head";
import Link from "next/link";

export default function ArchitecturePage() {
    return (
        <div className="relative pb-40 overflow-visible px-6">
            <Head>
                <title>Architecture | Conclave</title>
            </Head>

            {/* Background Blobs for depth - keeping these as they look premium */}
            <div className="absolute top-0 -left-64 w-[500px] h-[500px] bg-conclave-pink/10 rounded-full mix-blend-screen filter blur-[120px] animate-blob z-0"></div>
            <div className="absolute bottom-0 -right-64 w-[500px] h-[500px] bg-conclave-blue/10 rounded-full mix-blend-screen filter blur-[120px] animate-blob animation-delay-2000 z-0"></div>

            <div className="relative z-10">
                {/* Header */}
                <div className="py-20 text-center">
                    <div className="inline-block px-4 py-1.5 rounded-full border border-conclave-pink/30 bg-conclave-pink/5 mb-6">
                        <span className="text-[10px] uppercase tracking-[0.3em] font-black text-conclave-pink">
                            System Design
                        </span>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-4 italic">
                        Architecture
                    </h1>
                    <p className="text-conclave-textMuted uppercase tracking-widest text-[10px] md:text-xs max-w-2xl mx-auto leading-loose">
                        A high-level overview of the Conclave stack: from ZK-privacy layers to Solana on-chain logic.
                    </p>
                </div>

                {/* Diagram Container */}
                <div className="space-y-12">
                    {/* Layer 1: Client */}
                    <section className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-conclave-pink/20 to-conclave-blue/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                        <div className="relative bg-conclave-card/40 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-1px bg-conclave-pink"></div>
                                <h2 className="text-sm font-black uppercase tracking-[0.4em] text-conclave-pink">Client Layer (Browser / PWA)</h2>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                {[
                                    { title: "Chat Room", icon: "💬" },
                                    { title: "Proposals & Vote", icon: "🗳️" },
                                    { title: "Members + ZK", icon: "👤" },
                                    { title: "Treasury Mgmt", icon: "🏛️" },
                                    { title: "Realms Link", icon: "🔗" }
                                ].map((item, i) => (
                                    <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:bg-white/10 transition-all hover:-translate-y-1 group/item">
                                        <span className="text-2xl mb-2 group-hover/item:scale-125 transition-transform">{item.icon}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{item.title}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Privacy Layer - Inner Box */}
                            <div className="mt-10 pt-10 border-t border-white/5">
                                <div className="bg-conclave-pink/5 border border-conclave-pink/20 rounded-2xl p-6">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-conclave-pink/80 mb-6 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-conclave-pink animate-pulse"></span>
                                        Privacy Layer (In-Browser Only)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="bg-conclave-dark/50 border border-white/5 rounded-xl p-4">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-conclave-text/60 mb-3 border-b border-white/5 pb-2">Encryption</h4>
                                            <ul className="text-[11px] space-y-1 text-conclave-text/80 font-mono">
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> TweetNaCl (NaCl)</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> X25519 key deriv</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> secretbox (XSalsa)</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Group key per room</li>
                                            </ul>
                                        </div>
                                        <div className="bg-conclave-dark/50 border border-white/5 rounded-xl p-4">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-conclave-text/60 mb-3 border-b border-white/5 pb-2">Voting Commitment</h4>
                                            <ul className="text-[11px] space-y-1 text-conclave-text/80 font-mono">
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> sha256(choice‖nonce)</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Quadratic Support</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Client-side Hashing</li>
                                            </ul>
                                        </div>
                                        <div className="bg-conclave-dark/50 border border-white/5 rounded-xl p-4">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-conclave-text/60 mb-3 border-b border-white/5 pb-2">ZK Membership</h4>
                                            <ul className="text-[11px] space-y-1 text-conclave-text/80 font-mono">
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Semaphore identity</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Poseidon Merkle</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Groth16 Proof</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Gasless Proofs</li>
                                            </ul>
                                        </div>
                                        <div className="bg-conclave-dark/50 border border-white/5 rounded-xl p-4">
                                            <h4 className="text-[9px] font-bold uppercase tracking-widest text-conclave-text/60 mb-3 border-b border-white/5 pb-2">Session Keys</h4>
                                            <ul className="text-[11px] space-y-1 text-conclave-text/80 font-mono">
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Ephemeral Keypairs</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> No Wallet Approval</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Relayer Broadcast</li>
                                                <li className="flex items-center gap-2"><span className="text-conclave-pink">›</span> Auto-expiry</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Connection line to next layer */}
                        <div className="flex justify-center h-12">
                            <div className="w-px bg-gradient-to-b from-conclave-pink to-conclave-blue h-full"></div>
                        </div>
                    </section>

                    {/* Layer 2: Solana Program */}
                    <section className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-conclave-blue/20 to-conclave-green/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                        <div className="relative bg-conclave-card/60 border border-white/10 rounded-3xl p-8 backdrop-blur-xl overflow-hidden">
                            {/* Program ID Header */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-1px bg-conclave-blue"></div>
                                    <h2 className="text-sm font-black uppercase tracking-[0.4em] text-conclave-blue">Conclave Anchor Program (Solana)</h2>
                                </div>
                                <div className="px-4 py-2 rounded-lg bg-black/40 text-[10px] font-mono text-conclave-blue/80 border border-conclave-blue/20 shadow-[0_0_20px_rgba(0,184,241,0.1)]">
                                    E5HrS48LBddCwXGdq4ULPB8...mu9eRiPQieU
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                {/* Accounts Area */}
                                <div className="lg:col-span-5 space-y-8">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4 px-2">Accounts (PDAs)</h3>
                                    <div className="space-y-4">
                                        {[
                                            { name: "DaoRoom", sub: ["auth", "mint", "name", "counts"] },
                                            { name: "Member", sub: ["wallet", "encrypted_group_key"] },
                                            { name: "Message", sub: ["ciphertext", "sender", "ts"] },
                                            { name: "Proposal", sub: ["vote_mode", "total_credits"] },
                                            { name: "VoteCommitment", sub: ["commitment: [u8;32]"] }
                                        ].map((acc, i) => (
                                            <div key={i} className="bg-conclave-blue/5 border border-conclave-blue/20 rounded-xl p-4 hover:bg-conclave-blue/10 transition-colors group/acc">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-bold text-conclave-blue">{acc.name}</span>
                                                    <span className="text-[8px] bg-conclave-blue/20 px-1.5 py-0.5 rounded text-conclave-blue uppercase font-bold tracking-tighter">PDA</span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                    {acc.sub.map((s, idx) => (
                                                        <span key={idx} className="text-[9px] text-conclave-text/40 font-mono">#{s}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Instructions Area */}
                                <div className="lg:col-span-4 space-y-8">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4 px-2">Instructions (16)</h3>
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {[
                                            "create_room", "join_room", "create_proposal", "cast_vote",
                                            "reveal_vote", "reveal_quadratic_vote", "finalize_proposal",
                                            "send_message", "init_treasury", "execute_proposal_action",
                                            "create_session", "update_member_key"
                                        ].map((ix, i) => (
                                            <div key={i} className="bg-white/5 border border-white/5 px-4 py-2 rounded-xl text-[11px] font-mono text-conclave-text/70 hover:text-white hover:border-white/20 transition-all flex items-center justify-between group/ix">
                                                <span>{ix}</span>
                                                <span className="text-[8px] opacity-0 group-hover/ix:opacity-100 text-conclave-blue transition-opacity font-bold">INVOKE</span>
                                            </div>
                                        ))}
                                        <div className="text-center text-[9px] text-conclave-textMuted font-bold uppercase py-4 border-t border-white/5 mt-2 tracking-[0.2em]">Plus 4 Custom Error Handlers</div>
                                    </div>
                                </div>

                                {/* Events Area */}
                                <div className="lg:col-span-3 space-y-8">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4 px-2">Events (11 Emitted)</h3>
                                    <div className="space-y-4">
                                        {[
                                            "RoomCreated", "MemberJoined", "ProposalCreated",
                                            "VoteCast", "VoteRevealed", "MessageSent",
                                            "TreasuryFunded", "ActionExecuted"
                                        ].map((ev, i) => (
                                            <div key={i} className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-conclave-green/70 hover:text-conclave-green transition-colors cursor-default">
                                                <div className="w-1.5 h-1.5 rounded-full bg-conclave-green shadow-[0_0_8px_#00C9A7]"></div>
                                                {ev}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Connection line to next layer */}
                        <div className="flex justify-center h-12">
                            <div className="w-px bg-gradient-to-b from-conclave-blue to-conclave-green h-full"></div>
                        </div>
                    </section>

                    {/* Layer 3: Indexer & Integrations */}
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Indexer */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-conclave-green/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                            <div className="relative bg-conclave-card/40 border border-white/10 rounded-3xl p-8 backdrop-blur-xl h-full flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-10 h-1px bg-conclave-green"></div>
                                        <h2 className="text-sm font-black uppercase tracking-[0.4em] text-conclave-green">Indexer Service</h2>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="flex gap-4">
                                            <div className="px-3 py-1 bg-black/40 border border-white/10 rounded-full text-[9px] font-bold tracking-widest text-conclave-textMuted uppercase italic">Express</div>
                                            <div className="px-3 py-1 bg-black/40 border border-white/10 rounded-full text-[9px] font-bold tracking-widest text-conclave-textMuted uppercase italic">SQLite</div>
                                            <div className="px-3 py-1 bg-black/40 border border-white/10 rounded-full text-[9px] font-bold tracking-widest text-conclave-textMuted uppercase italic">Vercel</div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {[
                                                "GET /rooms/:address", "GET /rooms/:address/messages",
                                                "GET /proposals/:address", "GET /reputation/:wallet",
                                                "GET /members/:wallet/rooms", "GET /reputation/batch"
                                            ].map((route, i) => (
                                                <div key={i} className="text-[10px] font-mono p-3 bg-conclave-dark/80 border border-white/5 rounded-xl text-conclave-green/90 group/route hover:border-conclave-green/30 transition-all">
                                                    {route}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-conclave-textMuted uppercase tracking-widest leading-relaxed mt-10 border-t border-white/5 pt-6">
                                    CRON-synced SQLite store hosted on Vercel Serverless.
                                </p>
                            </div>
                        </div>

                        {/* Integration Boxes */}
                        <div className="space-y-8 flex flex-col">
                            {/* Realms */}
                            <div className="relative bg-conclave-card/40 border border-white/10 rounded-3xl p-8 backdrop-blur-xl flex-1 group hover:border-conclave-yellow/30 transition-all">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-6 h-1px bg-conclave-yellow"></div>
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-conclave-yellow">Realms Governance</h3>
                                </div>
                                <div className="text-[11px] space-y-3 font-mono text-white/50">
                                    <p className="flex gap-3 items-start"><span className="text-conclave-yellow">❯</span> <span>SPL Governance SDK (v3) Integration</span></p>
                                    <p className="flex gap-3 items-start"><span className="text-conclave-yellow">❯</span> <span>TokenOwnerRecord verification for gated access</span></p>
                                    <p className="flex gap-3 items-start"><span className="text-conclave-yellow">❯</span> <span>Automatic Proposal Sync for DAOs</span></p>
                                </div>
                            </div>

                            {/* Solana Blinks */}
                            <div className="relative bg-conclave-card/40 border border-white/10 rounded-3xl p-8 backdrop-blur-xl flex-1 group hover:border-conclave-blue/30 transition-all">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-6 h-1px bg-conclave-blue"></div>
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-conclave-blue">Solana Actions / Blinks</h3>
                                </div>
                                <div className="text-[11px] space-y-3 font-mono text-white/50">
                                    <p className="flex gap-3 items-start"><span className="text-conclave-blue">❯</span> <span>Action Endpoint: /api/actions/vote/:pda</span></p>
                                    <p className="flex gap-3 items-start"><span className="text-conclave-blue">❯</span> <span>Manual Anchor Discriminator Injection</span></p>
                                    <p className="flex gap-3 items-start"><span className="text-conclave-blue">❯</span> <span>Supports Twitter, Discord, & Telegram Voting</span></p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Layer 4: Developer SDK */}
                    <section className="relative group">
                        <div className="relative bg-white/[0.01] border border-dashed border-white/10 rounded-[2.5rem] p-12 text-center hover:bg-white/[0.03] transition-all">
                            <div className="inline-flex items-center gap-4 mb-12 bg-conclave-dark px-6 py-3 border border-white/10 rounded-full shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                                <div className="w-2 h-2 rounded-full bg-conclave-green animate-pulse"></div>
                                <span className="text-xs font-black text-conclave-text tracking-[0.3em] uppercase">npm install conclave-sdk</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                                <div className="text-left space-y-4">
                                    <h4 className="text-[10px] font-black tracking-widest text-conclave-pink italic uppercase border-b border-conclave-pink/20 pb-2">Client Core</h4>
                                    <p className="text-[11px] text-conclave-textMuted leading-relaxed font-medium">Full wrapper for Anchor instructions, provider management, and transaction construction.</p>
                                </div>
                                <div className="text-left space-y-4">
                                    <h4 className="text-[10px] font-black tracking-widest text-conclave-yellow italic uppercase border-b border-conclave-yellow/20 pb-2">PDA Engine</h4>
                                    <p className="text-[11px] text-conclave-textMuted leading-relaxed font-medium">Optimistic derivation for rooms, members, and proposal accounts with full TS safety.</p>
                                </div>
                                <div className="text-left space-y-4">
                                    <h4 className="text-[10px] font-black tracking-widest text-conclave-blue italic uppercase border-b border-conclave-blue/20 pb-2">Shared Crypto</h4>
                                    <p className="text-[11px] text-conclave-textMuted leading-relaxed font-medium">TweetNaCl group-key implementations for seamless inter-op with browser clients.</p>
                                </div>
                                <div className="text-left space-y-4">
                                    <h4 className="text-[10px] font-black tracking-widest text-conclave-green italic uppercase border-b border-conclave-green/20 pb-2">Tapestry Graph</h4>
                                    <p className="text-[11px] text-conclave-textMuted leading-relaxed font-medium">Identity verification layers and anonymous social graph integration points.</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer info */}
                <div className="pt-32 pb-10 text-center">
                    <Link href="/" className="text-[10px] uppercase tracking-[0.5em] font-black text-conclave-text/20 hover:text-conclave-pink transition-all">
                        &larr; Return to Workspace
                    </Link>
                </div>
            </div>
        </div>
    );
}
