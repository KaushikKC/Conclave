import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

const slides = [
    {
        id: "hook",
        type: "hero",
        title: "Conclave",
        subtitle: "Where Your Vote Speaks Louder Than Your Identity",
        description: "Private governance for Realms DAOs. Commit–reveal voting, encrypted chat, ZK proof of membership.",
        color: "pink",
        elements: ["Commit–reveal", "Encrypted Chat", "ZK Membership"]
    },
    {
        id: "problem",
        type: "content",
        title: "DAO governance is broken",
        list: [
            {
                title: "Whale Watching",
                text: "Votes are public while the poll is open leading to herding and last-second flips.",
                icon: ""
            },
            {
                title: "Social Pressure",
                text: "Founders can see who voted against them, causing small holders to abstain.",
                icon: ""
            },
            {
                title: "Privacy Gap",
                text: "No mainstream DAO stack offers private deliberation + enforceable secret ballots.",
                icon: ""
            }
        ]
    },
    {
        id: "solution",
        type: "feature",
        title: "Realms + Privacy",
        content: "Conclave extends Realms with token-gated rooms, private voting, encrypted chat, and ZK-proofs.",
        features: [
            "Drop-in privacy for any Realm",
            "Commit-reveal: hide votes until tally",
            "E2E Encrypted Chat (NaCl)",
            "ZK Membership (Semaphore)"
        ]
    },
    {
        id: "functionalities",
        type: "grid",
        title: "What's inside Conclave",
        items: [
            { name: "Commit–reveal", desc: "Binding on-chain tally, no 'copy the whale'" },
            { name: "Quadratic Voting", desc: "Private preference strength" },
            { name: "Encrypted Chat", desc: "On-chain messages, member-only decryption" },
            { name: "Realms Integration", desc: "Link rooms, verify via TokenOwnerRecord" },
            { name: "Treasury (SOL)", desc: "Init, fund, and execute proposals" },
            { name: "ZK Membership", desc: "Prove membership without revealing wallet" },
            { name: "Session Keys", desc: "Gasless chat, better UX" },
            { name: "PWA + SDK", desc: "Installable app & npm package" }
        ]
    },
    {
        id: "diff",
        type: "tech",
        title: "Why we're different",
        details: [
            { name: "Others", desc: "Visible votes, public chat, connect wallet = identity." },
            { name: "Conclave", desc: "Commit-reveal, E2E encrypted rooms, ZK membership proof." },
            { name: "Ecosystem", desc: "We extend Realms, we don't ignore it. Full developer SDK on npm." }
        ]
    },
    {
        id: "realms",
        type: "hero",
        title: "Realms Track Fit",
        subtitle: "Governance Builders + Extensions",
        description: "Conclave is a complete governance system for Realms, linkage-native with on-chain execution.",
        cta: false
    },
    {
        id: "tech-live",
        type: "bullets",
        title: "Not a mockup — it's live",
        bullets: [
            { title: "Anchor program", text: "On Solana (devnet/mainnet-ready): rooms, members, proposals, vote commitments, messages, treasury, session keys" },
            { title: "Indexer", text: "(Node + SQLite): REST API; deployable to Vercel + cron for sync" },
            { title: "Frontend", text: "Next.js, wallet-adapter, TweetNaCl (encryption), Semaphore (ZK)" },
            { title: "PWA", text: "Installable; manifest + theme" },
            { title: "npm", text: "conclave-sdk @ npm — API client, PDAs, types" }
        ],
        footer: "You can install the SDK today and build a bot or dashboard. You can install the app and run a private vote in under a minute."
    },
    {
        id: "traction",
        type: "bullets",
        title: "Shipped",
        bullets: [
            { title: "conclave-sdk", text: "Published on npm — public dev tooling" },
            { title: "PWA", text: "Installable on desktop and mobile" },
            { title: "Realms integration", text: "Link realm, view proposals, verify membership, create Realm" },
            { title: "Full flow", text: "Create room → join → propose → commit → reveal → finalize → execute treasury" }
        ],
        footer: "This isn’t a concept. It’s a deployable privacy layer for Realms DAOs."
    },
    {
        id: "roadmap",
        type: "bullets",
        title: "What's next",
        bullets: [
            { title: "Today", text: "Private voting, encrypted chat, ZK proof, Realms link, treasury, SDK" },
            { title: "Next", text: "AI agents as delegates: agents with governance roles, reputation-weighted proposals, human veto for safety" }
        ],
        footer: "We’re building the stack where DAOs can run sensitive votes and discussions without leaking identity or preference — starting with Realms."
    },
    {
        id: "cta",
        type: "bullets",
        title: "Try it",
        bullets: [
            { title: "SDK", text: "npm install conclave-sdk @solana/web3.js" },
            { title: "Track", text: "Realms — Governance Builders + Realms Extensions" }
        ],
        cta: true,
        footer: "Conclave — the privacy layer Realms DAOs have been missing."
    }
];

export default function PitchDeck() {
    const [currentSlide, setCurrentSlide] = useState(0);

    const nextSlide = () => {
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(prev => prev + 1);
        }
    };

    const prevSlide = () => {
        if (currentSlide > 0) {
            setCurrentSlide(prev => prev - 1);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === " ") nextSlide();
            if (e.key === "ArrowLeft") prevSlide();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentSlide]);

    return (
        <div className="fixed inset-0 bg-conclave-dark text-conclave-text z-[9999] flex flex-col items-center justify-center overflow-hidden selection:bg-conclave-pink selection:text-white font-sans">
            <Head>
                <title>Pitch Deck | Conclave</title>
            </Head>

            {/* Background Decor */}
            <div className="absolute inset-0 z-0 opacity-20" style={{
                backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '40px 40px'
            }}></div>

            <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-20">
                <div
                    className="h-full bg-conclave-pink transition-all duration-500 ease-out"
                    style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                ></div>
            </div>

            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border border-white/20 rounded flex items-center justify-center font-black text-conclave-text text-lg">
                        C
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Pitch Deck v1.0</span>
                </div>
                <Link href="/" className="text-[10px] font-bold uppercase tracking-widest text-conclave-text/40 hover:text-white transition-colors">
                    Exit Deck
                </Link>
            </header>

            {/* Slides Container */}
            <main className="relative w-full max-w-6xl h-full flex items-center justify-center px-6 md:px-12">
                {slides.map((slide, idx) => (
                    <div
                        key={slide.id}
                        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${idx === currentSlide
                                ? "opacity-100 translate-x-0 scale-100 z-10"
                                : idx < currentSlide
                                    ? "opacity-0 -translate-x-32 scale-95 pointer-events-none -z-10"
                                    : "opacity-0 translate-x-32 scale-95 pointer-events-none -z-10"
                            }`}
                    >
                        <div className="w-full max-h-[85vh] overflow-y-auto no-scrollbar py-12">
                            {slide.type === "hero" && (
                                <div className="text-center max-w-4xl mx-auto">
                                    <div className={`w-24 h-px bg-conclave-pink mx-auto mb-10`}></div>
                                    <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-black tracking-tighter italic mb-4 leading-tight">
                                        {slide.title}
                                    </h1>
                                    <p className="text-lg md:text-2xl font-bold uppercase tracking-[0.2em] mb-8 text-conclave-text/80">
                                        {slide.subtitle}
                                    </p>
                                    <p className="text-sm md:text-base text-conclave-textMuted uppercase tracking-widest leading-loose max-w-2xl mx-auto mb-12">
                                        {slide.description}
                                    </p>
                                    {slide.elements && (
                                        <div className="flex flex-wrap justify-center gap-4">
                                            {slide.elements.map(e => (
                                                <span key={e} className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 border border-white/10 px-4 py-1.5 rounded-full whitespace-nowrap">{e}</span>
                                            ))}
                                        </div>
                                    )}
                                    {slide.cta && (
                                        <div className="flex justify-center gap-6 mt-12">
                                            <Link href="/" className="px-10 py-4 bg-conclave-pink text-conclave-dark font-black uppercase tracking-widest rounded-full hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,77,141,0.3)]">
                                                Launch App
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}

                            {slide.type === "content" && (
                                <div className="w-full">
                                    <div className="mb-12">
                                        <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic mb-4">{slide.title}</h2>
                                        <div className="h-1 w-20 bg-conclave-yellow"></div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {slide.list?.map((item, i) => (
                                            <div key={i} className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-all">
                                                <h3 className="text-lg font-bold uppercase tracking-widest mb-4 text-conclave-yellow">{item.title}</h3>
                                                <p className="text-[13px] text-conclave-text/70 uppercase tracking-widest leading-loose">{item.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {slide.type === "feature" && (
                                <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                                    <div>
                                        <h2 className="text-4xl md:text-7xl font-black uppercase tracking-tighter italic mb-8">{slide.title}</h2>
                                        <p className="text-lg md:text-xl text-conclave-text/80 uppercase tracking-widest leading-loose italic mb-12 border-l-4 border-conclave-pink pl-8">
                                            {slide.content}
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        {slide.features?.map((f, i) => (
                                            <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl flex items-center justify-between group hover:border-conclave-pink/50 transition-all">
                                                <span className="text-xs font-black uppercase tracking-widest">{f}</span>
                                                <span className="text-conclave-pink opacity-0 group-hover:opacity-100 transition-opacity">❯</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {slide.type === "grid" && (
                                <div className="w-full">
                                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic mb-12 text-center">{slide.title}</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {slide.items?.map((item, i) => (
                                            <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 transition-all min-h-[140px] flex flex-col justify-center">
                                                <h3 className="text-[11px] font-black uppercase tracking-widest text-conclave-pink mb-3">{item.name}</h3>
                                                <p className="text-[10px] text-conclave-textMuted uppercase tracking-widest leading-relaxed">{item.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {slide.type === "tech" && (
                                <div className="w-full">
                                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic mb-12 text-center">{slide.title}</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                        {slide.details?.map((detail, i) => (
                                            <div key={i} className="space-y-4 p-8 bg-white/5 border border-white/10 rounded-2xl h-full">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-3xl font-black italic opacity-10">0{i + 1}</span>
                                                    <h3 className="text-base font-black uppercase tracking-widest text-white">{detail.name}</h3>
                                                </div>
                                                <p className="text-[12px] text-conclave-text/60 uppercase tracking-widest leading-relaxed border-t border-white/5 pt-4">{detail.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {slide.type === "bullets" && (
                                <div className="w-full max-w-4xl mx-auto">
                                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic mb-10">{slide.title}</h2>
                                    <div className="space-y-6 mb-12">
                                        {slide.bullets?.map((bullet, i) => (
                                            <div key={i} className="flex gap-4 items-start group">
                                                <div className="w-2 h-2 rounded-full bg-conclave-pink mt-2 shrink-0 group-hover:scale-150 transition-transform"></div>
                                                <div>
                                                    <span className="text-sm font-black uppercase tracking-widest text-white mr-2">{bullet.title}:</span>
                                                    <span className="text-sm text-conclave-text/70 uppercase tracking-widest leading-relaxed">{bullet.text}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {slide.footer && (
                                        <div className="p-8 border-l-2 border-white/10 bg-white/5 italic">
                                            <p className="text-sm md:text-base text-conclave-text/90 uppercase tracking-[0.15em] leading-[1.8]">
                                                "{slide.footer}"
                                            </p>
                                        </div>
                                    )}
                                    {slide.cta && (
                                        <div className="flex justify-center gap-6 mt-12">
                                            <Link href="/" className="px-10 py-4 bg-white text-conclave-dark font-black uppercase tracking-widest rounded-full hover:scale-105 transition-transform">
                                                Launch App
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </main>

            {/* Navigation Controls */}
            <footer className="absolute bottom-0 left-0 right-0 p-8 flex justify-between items-end z-20 pointer-events-none">
                <div className="pointer-events-auto">
                    <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mb-4">
                        {currentSlide + 1} / {slides.length}
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={prevSlide}
                            disabled={currentSlide === 0}
                            className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center hover:bg-white/5 transition-all disabled:opacity-20 cursor-pointer"
                        >
                            ←
                        </button>
                        <button
                            onClick={nextSlide}
                            disabled={currentSlide === slides.length - 1}
                            className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center hover:bg-white/5 transition-all disabled:opacity-20 cursor-pointer"
                        >
                            →
                        </button>
                    </div>
                </div>

                <div className="hidden md:block text-right opacity-30">
                    <p className="text-[8px] font-bold uppercase tracking-[0.5em] mb-1">Navigation Key</p>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em]">Arrows / Space</p>
                </div>
            </footer>

            {/* Decorative Blur Background Blobs */}
            <div className={`absolute top-1/4 -left-64 w-[600px] h-[600px] bg-conclave-pink/10 rounded-full blur-[150px] transition-all duration-1000 -z-10`}></div>
            <div className={`absolute bottom-1/4 -right-64 w-[600px] h-[600px] bg-conclave-blue/10 rounded-full blur-[150px] transition-all duration-1000 -z-10`}></div>
        </div>
    );
}
