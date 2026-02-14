module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        heading: ["Outfit", "var(--font-geist-sans)", "system-ui", "sans-serif"], // Using sans for now, but distinct class
      },
      colors: {
        conclave: {
          dark: "#0D0D0D", // Deep charcoal
          text: "#EDE0D4", // Beige/Off-white
          textMuted: "rgba(237, 224, 212, 0.6)",
          card: "#161616",
          border: "rgba(255,255,255,0.08)",
          pink: "#FF4D8D",
          yellow: "#FFC800",
          green: "#00C9A7",
          blue: "#00B8F1",
        },
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
