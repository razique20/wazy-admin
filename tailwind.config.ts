import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        azure: {
          50: "#eff6fc",
          100: "#deecf9",
          200: "#c7e0f4",
          500: "#0078d4",
          600: "#106ebe",
          700: "#005a9e",
          800: "#004578",
          sidebar: "#ebf1f8",
        },
        accent: {
          blue: "#0078d4",
          gray: "#8a8f98",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
