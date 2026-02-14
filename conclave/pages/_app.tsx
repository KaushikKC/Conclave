import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import { WalletContext } from "../contexts/WalletContext";
import Layout from "../components/Layout";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-conclave-dark">
        <div className="text-conclave-muted">Loading...</div>
      </div>
    );
  }

  return (
    <WalletContext>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </WalletContext>
  );
}
