import type { Config } from "tailwindcss";

/**
 * Preset Tailwind do Portal do Candidato (Soulan).
 * Uso no tailwind.config.ts do frontend:
 *   import soulan from "./tailwind/soulan-preset";
 *   export default { presets: [soulan], content: [...] } satisfies Config;
 */
const soulanPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Paleta oficial da marca
        soulan: {
          verde: "#AAD12F",
          "verde-claro": "#E8F9A0",
          "azul-escuro": "#002443",
          "azul-claro": "#59A4D8",
          "azul-medio": "#1A4895",
          "azul-suave": "#BFD7EA",
          "verde-agua": "#89D5C9",
          fundo: "#F5F5F5",
          coral: "#FF8864",
          bege: "#EFDCBD",
        },
        // Tokens semânticos do portal (derivados da paleta, contraste AA)
        portal: {
          ink: "#002443", // texto principal
          texto: "#3D5470", // texto secundário
          muted: "#5B6F86", // legendas
          linha: "#E1E7EE", // bordas
          primaria: "#1A4895",
          "primaria-hover": "#123670",
          "primaria-tint": "#EAF1FA",
          "ok-bg": "#F2F9DC",
          "ok-tx": "#4A6400",
          "at-bg": "#FFF1EA",
          "at-tx": "#A33F12",
          "at-ln": "#FFCBB3",
          "bege-tint": "#FBF5EA",
          "bege-tx": "#6B5320",
          "agua-tint": "#E7F6F3",
          "agua-tx": "#1E6B5F",
          wpp: "#1B7F45",
          "wpp-bg": "#F1FAF4",
          "wpp-ln": "#BFE3CC",
        },
      },
      fontFamily: {
        // carregada via next/font no layout do portal (variável --font-montserrat)
        montserrat: ["var(--font-montserrat)", "Montserrat", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "24px",
        "card-sm": "20px",
        btn: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,36,67,0.04), 0 12px 32px rgba(0,36,67,0.06)",
        btn: "0 6px 16px rgba(26,72,149,0.22)",
        chip: "0 8px 20px rgba(0,36,67,0.12)",
        doc: "0 14px 36px rgba(0,36,67,0.16)",
        "bottom-bar": "0 -8px 24px rgba(0,36,67,0.06)",
      },
      keyframes: {
        orbit: { to: { transform: "rotate(360deg)" } },
        "orbit-rev": { to: { transform: "rotate(-360deg)" } },
        scan: { "0%, 100%": { top: "8%" }, "50%": { top: "80%" } },
        wander: {
          "0%, 100%": { transform: "translate(-46px,-58px) rotate(-8deg)" },
          "25%": { transform: "translate(38px,-26px) rotate(6deg)" },
          "50%": { transform: "translate(-26px,22px) rotate(-4deg)" },
          "75%": { transform: "translate(42px,54px) rotate(8deg)" },
        },
        ring: {
          "0%": { transform: "translate(-50%,-50%) scale(.55)", opacity: "0.6" },
          "100%": { transform: "translate(-50%,-50%) scale(1.5)", opacity: "0" },
        },
        pop: {
          "0%": { transform: "scale(.3)", opacity: "0" },
          "70%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: { "0%": { backgroundPosition: "-160px 0" }, "100%": { backgroundPosition: "160px 0" } },
        bob: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-7px) scale(1.06)" },
        },
        rise: {
          "0%": { transform: "translateY(0)", opacity: "0" },
          "20%": { opacity: "1" },
          "100%": { transform: "translateY(-110px)", opacity: "0" },
        },
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        orbit: "orbit 16s linear infinite",
        "orbit-rev": "orbit-rev 11s linear infinite",
        scan: "scan 2.6s ease-in-out infinite",
        wander: "wander 5.2s ease-in-out infinite",
        ring: "ring 3.6s ease-out infinite",
        pop: "pop .6s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        bob: "bob 2.4s ease-in-out infinite",
        rise: "rise 3.2s ease-out infinite",
        "fade-in": "fade-in .4s ease-out both",
      },
    },
  },
};

export default soulanPreset;
