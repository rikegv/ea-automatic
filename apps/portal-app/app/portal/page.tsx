// ROTA /portal DE VERDADE (sem basePath): a MESMA tela do candidato de
// apps/frontend/src/app/portal/page.tsx, reexportada sem duplicar codigo (opcao a).
//
// Servir em /portal real (em vez de raiz + basePath=/portal) alinha o app 1:1 com a operacao:
// o codigo compartilhado referencia os assets em caminho ABSOLUTO (/portal/logo-soulan-novo.webp,
// /portal/sol.svg), que so resolvem quando NAO ha basePath. Com basePath=/portal, o Next empilhava
// o prefixo com a subpasta public/portal e servia o logo em /portal/portal/logo.webp (404),
// quebrando a imagem. Aqui public/portal/logo.webp nasce em /portal/logo.webp, exatamente o que o
// codigo pede.
export { default } from "@/app/portal/page";
