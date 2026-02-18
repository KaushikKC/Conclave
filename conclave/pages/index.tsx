import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function HomePage() {
  const { connected } = useWallet();

  return (
    <div className="relative min-h-screen flex flex-col items-center overflow-auto pb-20 pt-20">
      {/* Hero Section Container */}
      <section className="relative w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center z-10 py-20">
        {/* Pill Badge */}
        <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-2 backdrop-blur-md hover:bg-white/10 transition-colors cursor-default">
          <div className="h-2 w-2 rounded-full bg-conclave-accent animate-pulse shadow-[0_0_10px_#FF4D8D]"></div>
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-conclave-text/80">
            Built on Realms &times; Solana
          </span>
        </div>

        {/* Floating Elements */}
        <div className="absolute top-10 left-0 lg:-left-20 w-24 h-24 md:w-32 md:h-32 bg-[#9D4EDD] rounded-xl transform -rotate-12 shadow-2xl z-20 flex items-center justify-center border border-white/10 hover:scale-110 hover:rotate-0 transition-all duration-500 cursor-pointer group">
          <div className="w-20 h-20 rounded-full border-4 border-black/20 flex items-center justify-center group-hover:animate-spin-slow">
            <div className="w-6 h-6 bg-black/20 rounded-full"></div>
          </div>
        </div>

        <div className="absolute top-20 right-0 lg:-right-24 w-28 h-28 md:w-36 md:h-36 bg-conclave-text rounded-sm transform rotate-6 shadow-2xl z-20 flex flex-col items-center justify-center border border-white/10 hover:scale-110 hover:-rotate-3 transition-all duration-500 cursor-pointer">
          <span className="text-conclave-dark font-black text-xl">NO</span>
          <span className="text-conclave-dark font-black text-3xl tracking-tighter">
            BIAS
          </span>
        </div>

        <div className="absolute bottom-20 left-4 lg:-left-32 w-24 h-24 md:w-40 md:h-32 bg-conclave-card rounded-xl transform rotate-[-6deg] shadow-2xl z-0 flex items-center justify-center border border-white/10 hover:scale-110 hover:rotate-3 transition-all duration-500 cursor-pointer">
          <span className="text-conclave-green font-black text-3xl tracking-widest rotate-[-5deg] border-2 border-conclave-green px-2 py-1 rounded">
            ANON
          </span>
        </div>

        <div className="absolute bottom-40 right-4 lg:-right-16 w-20 h-20 md:w-24 md:h-24 bg-conclave-blue rounded-[2rem] transform rotate-12 shadow-2xl z-0 flex items-center justify-center opacity-80 hover:scale-110 hover:rotate-45 transition-all duration-500 cursor-pointer">
          <div className="w-full h-full bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.2)_25%,rgba(0,0,0,0.2)_50%,transparent_50%,transparent_75%,rgba(0,0,0,0.2)_75%,rgba(0,0,0,0.2)_100%)] bg-[length:10px_10px]"></div>
        </div>

        {/* Main Heading */}
        <h1 className="heading-hero text-conclave-text mb-8 relative z-10 leading-[0.85] select-none mix-blend-screen">
          <span className="block text-[12vw] md:text-[8rem] tracking-tighter">
            CONCLAVE
          </span>
          <span className="block text-[5vw] md:text-[3rem] text-transparent bg-clip-text bg-gradient-to-r from-conclave-pink via-conclave-yellow to-conclave-blue mt-4 opacity-100 tracking-normal font-bold">
            ANONYMOUS DAO WORKSPACE
          </span>
        </h1>

        <p className="max-w-xl mx-auto text-sm md:text-base text-conclave-textMuted uppercase tracking-[0.15em] mb-12 font-medium leading-loose">
          Where your vote speaks louder than your identity.
          <br />
          Private voting. Encrypted chat. Zero surveillance.
        </p>

        {!connected ? (
          <div className="flex flex-col items-center gap-6 relative z-30">
            <div className="transform scale-110 hover:scale-110 transition-transform duration-300">
              <WalletMultiButton className="!bg-conclave-text !text-conclave-dark !font-bold !uppercase !tracking-widest !rounded-full !px-10 !py-5 hover:!scale-105 transition-transform shadow-[0_0_40px_rgba(237,224,212,0.3)] !h-auto" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6 relative z-30">
            <Link
              href="/rooms/create"
              className="btn-primary shadow-[0_0_30px_rgba(237,224,212,0.2)]"
            >
              Create Room
            </Link>
            <Link href="/rooms" className="btn-secondary">
              Browse Rooms
            </Link>
          </div>
        )}
      </section>

      {/* Why Anonymous Governance */}
      <section className="w-full px-6 mt-24 relative z-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-12 px-4">
          <div className="w-3 h-3 bg-conclave-pink rounded-full shadow-[0_0_10px_rgba(255,77,141,0.5)]"></div>
          <h2 className="text-2xl font-black text-conclave-text uppercase tracking-widest">
            Why anonymity matters
          </h2>
          <div className="h-px bg-white/10 flex-1"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
          <div className="rounded-xl border border-white/10 p-8 bg-white/[0.02] hover:bg-white/5 transition-all">
            <div className="text-3xl mb-4">{">"}</div>
            <h3 className="text-lg font-bold text-conclave-text mb-3">Eliminate groupthink</h3>
            <p className="text-sm text-conclave-textMuted leading-relaxed">
              When votes are visible, members follow the majority. Commit-reveal ensures
              every vote is independent and unbiased.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 p-8 bg-white/[0.02] hover:bg-white/5 transition-all">
            <div className="text-3xl mb-4">{"#"}</div>
            <h3 className="text-lg font-bold text-conclave-text mb-3">Protect whistleblowers</h3>
            <p className="text-sm text-conclave-textMuted leading-relaxed">
              Anonymous aliases per room mean your identity is never linked across
              discussions. Speak freely without fear of retaliation.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 p-8 bg-white/[0.02] hover:bg-white/5 transition-all">
            <div className="text-3xl mb-4">{"!"}</div>
            <h3 className="text-lg font-bold text-conclave-text mb-3">Extends Realms</h3>
            <p className="text-sm text-conclave-textMuted leading-relaxed">
              Extends your Realms DAO with private voting and encrypted discussion.
              Link any Realms governance to get anonymous, verifiable decision-making.
            </p>
          </div>
        </div>
      </section>

      {/* How it works Section - Grid Style */}
      <section className="w-full px-6 mt-32 relative z-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-16 px-4">
          <div className="w-3 h-3 bg-conclave-text rounded-full shadow-[0_0_10px_rgba(237,224,212,0.5)]"></div>
          <h2 className="text-2xl font-black text-conclave-text uppercase tracking-widest">
            How it works
          </h2>
          <div className="h-px bg-white/10 flex-1"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-t border-l border-white/10">
          {/* Step 1 */}
          <div className="group hover:bg-white/5 transition-all duration-300 border-r border-b border-white/10 p-10 h-80 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-conclave-pink/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <span className="block text-6xl font-black text-white/5 mb-4 group-hover:text-conclave-pink transition-colors relative z-10">
              01
            </span>
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-conclave-text uppercase tracking-widest mb-4">
                Create
              </h3>
              <p className="text-xs text-conclave-textMuted leading-relaxed tracking-wide uppercase">
                Start a token-gated room.
                <br />
                Share an invite link.
                <br />
                Members join anonymously.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="group hover:bg-white/5 transition-all duration-300 border-r border-b border-white/10 p-10 h-80 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-conclave-yellow/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <span className="block text-6xl font-black text-white/5 mb-4 group-hover:text-conclave-yellow transition-colors relative z-10">
              02
            </span>
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-conclave-text uppercase tracking-widest mb-4">
                Discuss
              </h3>
              <p className="text-xs text-conclave-textMuted leading-relaxed tracking-wide uppercase">
                End-to-end encrypted chat.
                <br />
                Self-destructing messages.
                <br />
                Anonymous aliases.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="group hover:bg-white/5 transition-all duration-300 border-r border-b border-white/10 p-10 h-80 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-conclave-green/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <span className="block text-6xl font-black text-white/5 mb-4 group-hover:text-conclave-green transition-colors relative z-10">
              03
            </span>
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-conclave-text uppercase tracking-widest mb-4">
                Vote
              </h3>
              <p className="text-xs text-conclave-textMuted leading-relaxed tracking-wide uppercase">
                Commit a secret hash.
                <br />
                No one sees your intent.
                <br />
                Zero influence, zero bias.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="group hover:bg-white/5 transition-all duration-300 border-r border-b border-white/10 p-10 h-80 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-conclave-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <span className="block text-6xl font-black text-white/5 mb-4 group-hover:text-conclave-blue transition-colors relative z-10">
              04
            </span>
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-conclave-text uppercase tracking-widest mb-4">
                Reveal
              </h3>
              <p className="text-xs text-conclave-textMuted leading-relaxed tracking-wide uppercase">
                Deadline passes. Reveal.
                <br />
                On-chain tally.
                <br />
                Verifiable on Explorer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="w-full px-6 mt-32 relative z-10 max-w-5xl mx-auto mb-20">
        <div className="flex items-center gap-4 mb-12 px-4">
          <div className="w-3 h-3 bg-conclave-yellow rounded-full shadow-[0_0_10px_rgba(255,204,0,0.5)]"></div>
          <h2 className="text-2xl font-black text-conclave-text uppercase tracking-widest">
            Built for
          </h2>
          <div className="h-px bg-white/10 flex-1"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4">
          <div className="rounded-xl border border-white/10 p-6 bg-white/[0.02] hover:bg-white/5 transition-all">
            <h3 className="text-sm font-bold text-conclave-text uppercase tracking-widest mb-2">Realms DAOs with sensitive votes</h3>
            <p className="text-xs text-conclave-textMuted leading-relaxed">
              Link your Realms DAO for treasury allocations, hiring decisions, protocol
              upgrades — votes free from whale pressure and social dynamics.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-6 bg-white/[0.02] hover:bg-white/5 transition-all">
            <h3 className="text-sm font-bold text-conclave-text uppercase tracking-widest mb-2">Whistleblower coordination</h3>
            <p className="text-xs text-conclave-textMuted leading-relaxed">
              Anonymous encrypted channels where identity can never be linked.
              Different alias in every room. Self-destructing messages.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-6 bg-white/[0.02] hover:bg-white/5 transition-all">
            <h3 className="text-sm font-bold text-conclave-text uppercase tracking-widest mb-2">Private Realms governance</h3>
            <p className="text-xs text-conclave-textMuted leading-relaxed">
              Realms-verified rooms ensure only DAO members participate.
              Encrypted discussions stay within the governance group. No leaks.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-6 bg-white/[0.02] hover:bg-white/5 transition-all">
            <h3 className="text-sm font-bold text-conclave-text uppercase tracking-widest mb-2">Fair community decisions</h3>
            <p className="text-xs text-conclave-textMuted leading-relaxed">
              Commit-reveal prevents bandwagon voting. Every member's voice carries
              equal weight, regardless of social standing.
            </p>
          </div>
        </div>
      </section>

      {/* Tech Stack Footer */}
      <section className="w-full px-6 relative z-10 max-w-5xl mx-auto mb-10">
        <div className="flex flex-wrap justify-center gap-4 text-[10px] uppercase tracking-[0.2em] text-conclave-textMuted/50">
          <span>Powered by Realms</span>
          <span>&middot;</span>
          <span>Solana</span>
          <span>&middot;</span>
          <span>Anchor</span>
          <span>&middot;</span>
          <span>NaCl Encryption</span>
          <span>&middot;</span>
          <span>Commit-Reveal</span>
          <span>&middot;</span>
          <span>Token-Gated</span>
        </div>
      </section>
    </div>
  );
}
