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
        "warn-2": "var(--warn-2)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        display: ["var(--font-manrope)", "Manrope", "sans-serif"],
      },
      borderRadius: {
        glass: "var(--r)",
      },
      keyframes: {
        // Animações da tela de login (OST-EA-TELA-LOGIN) — portadas 1:1 do HTML de referência.
        "orb-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.12)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "orb-pulse": "orb-pulse 8s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
