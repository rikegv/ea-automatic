import type { Config } from "tailwindcss";
import base from "../frontend/tailwind.config";

// Reusa INTEGRALMENTE o tema/preset Soulan do frontend (mesmo design, nenhuma divergencia), so
// reescrevendo o `content` para o escopo do candidato: a tela /portal, os componentes do portal
// e as libs que ela importa. Globs relativos ao root deste app (apps/portal-app), onde o
// tailwind roda. Content enxuto deixa o CSS do portal menor; nao afeta o bundle JS.
const config: Config = {
  ...base,
  content: [
    "./app/**/*.{ts,tsx}",
    "../frontend/src/app/portal/**/*.{ts,tsx}",
    "../frontend/src/components/portal/**/*.{ts,tsx}",
    "../frontend/src/lib/**/*.{ts,tsx}",
  ],
};

export default config;
