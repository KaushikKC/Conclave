/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      fs: false,
      path: false,
      crypto: false,
      // snarkjs uses worker_threads in Node.js; not needed in browser
      ...(!isServer && { worker_threads: false }),
    };
    return config;
  },
  async headers() {
    return [
      {
        // Solana Actions / Blinks: CORS required for /.well-known/actions.json
        source: "/.well-known/actions.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        // CORS for all action API routes (wallets, Dialect, dial.to call these)
        source: "/api/actions/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, x-blockchain-ids, x-action-version",
          },
          { key: "X-Action-Version", value: "2.1.3" },
          {
            key: "X-Blockchain-Ids",
            value: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
