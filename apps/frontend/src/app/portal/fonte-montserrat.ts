import localFont from "next/font/local";

// Fonte oficial da marca (Montserrat, licenca OFL): titulos em Bold, texto em Regular.
// Arquivos locais em ./fonts: o build nao depende de acesso a internet (deploy on-premise).
//
// Consumido pelo `app/portal/layout.tsx`, que define a variavel CSS `--font-montserrat` na
// subarvore do portal real. A pele do Designer (paleta Soulan + Montserrat) veste toda a
// trilha do candidato sem tocar o layout raiz nem o globals.css.
export const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/montserrat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});
