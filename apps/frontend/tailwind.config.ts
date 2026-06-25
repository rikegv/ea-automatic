import type { Config } from "tailwindcss";

/**
 * Tokens do DESIGN-SYSTEM.md expostos ao Tailwind como cores/raio/fontes.
 * Os valores reais vivem em CSS variables (globals.css), temáveis por [data-theme].
 */
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        dim: "var(--dim)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-vivid": "var(--accent-vivid)",
        "accent-2": "var(--accent-2)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        display: ["var(--font-manrope)", "Manrope", "sans-serif"],
      },
      borderRadius: {
        glass: "var(--r)",
      },
    },
  },
  plugins: [],
};

export default config;
