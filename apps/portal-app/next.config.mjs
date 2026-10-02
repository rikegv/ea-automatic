/** @type {import('next').NextConfig} */

// APP PROPRIO DO PORTAL DO CANDIDATO (Fase 1 do Portal publico).
//
// Build Next enxuto que contem SO a tela do candidato (rota raiz = a mesma /portal do EA,
// reusada via alias @/*). Conserta POR CONSTRUCAO o vazamento do /_next/static/*: como este
// build so compila a rota do candidato, nenhum chunk das rotas (app)/* do EA (ex.: o 3708 com
// texto de artigo de menu restrito) nasce aqui. A prova esta no app-build-manifest.json.

// Destino da API: backend loopback. Em HOMOLOGACAO, BACKEND_ORIGIN=http://127.0.0.1:3111.
// Default 3011 por paridade com o config do frontend (apps/frontend/next.config.mjs).
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:3011";

// basePath VEM DE VARIAVEL DE AMBIENTE (autorizado pelo diretor): troca de endereco publico
// depois SEM rebuild de codigo. Default VAZIO (basePath omitido): o portal responde na rota
// /portal DE VERDADE (app/portal/page.tsx), e os assets em public/portal/* nascem em
// /portal/logo.webp, exatamente o caminho ABSOLUTO que o codigo compartilhado da operacao pede.
// Um basePath nao-vazio empilharia o prefixo com a subpasta public/portal e quebraria o logo
// (/portal/portal/logo.webp = 404); por isso o default e vazio e a variavel so e usada quando
// o diretor precisar mover o endereco para um prefixo de proxy dedicado.
const basePath = process.env.PORTAL_BASE_PATH ?? "";

// ALLOWLIST NOMINAL das rotas @Public do Portal do candidato, derivada dos controllers
// @Public() em apps/backend/src/portal/*.controller.ts. SEM CURINGA /api/:path*: por isso
// /api/portal/links (emite link de prontuario, sem @Public), /api/auth/* e esteira/* NAO tem
// rewrite e morrem no app (404). Cada rota e um match EXATO, sem :path*.
const rotasPublicasDoPortal = [
  "identificar", // portal.controller.ts        POST @Public
  "recuperacao", // portal.controller.ts        POST @Public
  "credencial", // portal.controller.ts         POST @Public
  "confirmar", // portal.controller.ts          POST @Public
  "termo", // portal-termo.controller.ts        POST @Public
  "dados-gi", // portal-dados-gi.controller.ts  POST @Public
  "documentos", // portal-documentos.controller.ts GET @Public
  "vt-link", // portal-vt.controller.ts         GET  @Public
  "acesso-email/solicitar", // portal-acesso-email.controller.ts POST @Public
  "acesso-email/confirmar", // portal-acesso-email.controller.ts POST @Public
  "acesso-email/identidade", // portal-acesso-email.controller.ts POST @Public
];

const nextConfig = {
  distDir: process.env.PORTAL_DIST_DIR || ".next",
  reactStrictMode: true,
  // basePath so e declarado quando nao-vazio (Next exige comecar com "/" e nao terminar com "/").
  ...(basePath ? { basePath } : {}),
  // Proxy same-origin: APENAS as rotas @Public acima. basePath:false mantem o source na raiz da
  // origem (/api/portal/...), porque o browser chama /api absoluto independente do basePath.
  async rewrites() {
    return rotasPublicasDoPortal.map((rota) => ({
      source: `/api/portal/${rota}`,
      destination: `${backendOrigin}/api/portal/${rota}`,
      basePath: false,
    }));
  },
  // So o DOCUMENTO (/portal) nao e cacheado (mesma regra do config do frontend): sem isso, apos
  // um deploy o candidato reabre a HTML velha do cache apontando chunks /_next/static ja
  // removidos. Os assets imutaveis /_next/static NAO entram nesta regra.
  async headers() {
    return [
      {
        source: "/portal",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/portal/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
