/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        conclave: {
          dark: "#0f1419",
          card: "#1a2332",
          border: "#2d3a4f",
          accent: "#00d4aa",
          muted: "#6b7c93",
        },
      },
    },
  },
  plugins: [],
};
