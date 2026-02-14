"use client";

import React from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-conclave-dark text-conclave-text font-sans selection:bg-conclave-pink selection:text-white">

      {/* Fixed Grid Background provided by globals.css */}

      {/* Top Grid Border Line - Fixed to viewport */}
      <div className="fixed top-0 left-0 right-0 h-px bg-white/10 z-[60]"></div>

      <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-conclave-dark border-b border-white/10">
        {/* Container for the main nav bar */}
        <div className="max-w-7xl mx-auto h-full border-x border-white/10 grid grid-cols-[100px_1fr_100px] md:grid-cols-[140px_1fr_140px] relative">

          {/* Left: Logo */}
          <div className="border-r border-white/10 flex items-center justify-center h-full hover:bg-white/5 transition-colors group cursor-pointer bg-conclave-dark relative z-20">
            <Link href="/" className="text-3xl grayscale group-hover:grayscale-0 transition-all transform group-hover:scale-110">
              ❤️
            </Link>
          </div>

          {/* Center: Navigation */}
          <nav className="flex items-center justify-center gap-4 md:gap-8 h-full px-4 md:px-8 relative overflow-hidden bg-conclave-dark">
            <Link href="/" className="nav-link text-[10px] md:text-xs font-bold tracking-[0.2em] hover:text-white transition-colors relative group">
              HOME
              <span className="absolute -bottom-1 left-0 w-full h-[2px] bg-conclave-pink scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
            </Link>
            <span className="text-conclave-green/50 text-[8px]">•</span>
            <Link href="/rooms" className="nav-link text-[10px] md:text-xs font-bold tracking-[0.2em] hover:text-white transition-colors relative group">
              ROOMS
              <span className="absolute -bottom-1 left-0 w-full h-[2px] bg-conclave-yellow scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
            </Link>
            {connected && (
              <>
                <span className="text-conclave-yellow/50 text-[8px]">•</span>
                <Link href="/rooms/create" className="nav-link text-[10px] md:text-xs font-bold tracking-[0.2em] hover:text-white transition-colors relative group">
                  CREATE
                  <span className="absolute -bottom-1 left-0 w-full h-[2px] bg-conclave-blue scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                </Link>
              </>
            )}
          </nav>

          {/* Right: Wallet Action - Strictly contained */}
          <div className="border-l border-white/10 flex items-center justify-center h-full hover:bg-white/5 transition-colors bg-conclave-dark relative z-20 overflow-hidden">
            <div className="w-full h-full flex items-center justify-center p-2">
              {/* Using a wrapper to force the button to respect the container */}
              <div className="scale-[0.6] md:scale-90 origin-center text-[10px]">
                <WalletMultiButton className="!h-10 !px-4 !bg-transparent !border !border-conclave-text !rounded-full !text-conclave-text !text-[10px] !font-bold !uppercase !tracking-widest hover:!text-white transition-all flex items-center justify-center gap-2 whitespace-nowrap" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-20 relative z-10 w-full max-w-7xl mx-auto border-x border-white/10 min-h-screen bg-conclave-dark">
        {/* Color Strips Decoration - Now part of the main scrollable content */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-6 flex h-12 z-0 pointer-events-none opacity-80 mix-blend-screen">
          <div className="w-3 md:w-4 bg-conclave-pink h-full shadow-[0_0_15px_rgba(255,77,141,0.5)]"></div>
          <div className="w-3 md:w-4 bg-conclave-yellow h-full shadow-[0_0_15px_rgba(255,200,0,0.5)]"></div>
          <div className="w-3 md:w-4 bg-conclave-green h-full shadow-[0_0_15px_rgba(0,201,167,0.5)]"></div>
          <div className="w-3 md:w-4 bg-conclave-blue h-full shadow-[0_0_15px_rgba(0,184,241,0.5)]"></div>
        </div>

        {children}
      </main>

      <footer className="w-full max-w-7xl mx-auto border-x border-b border-t border-white/10 py-12 text-center bg-conclave-dark relative z-10">
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="h-px w-20 bg-white/10"></div>
          <p className="text-conclave-text/40 text-[10px] uppercase tracking-[0.3em]">Solana Devnet · 2026</p>
          <div className="h-px w-20 bg-white/10"></div>
        </div>
      </footer>
    </div>
  );
}
