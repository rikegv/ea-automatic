/** @type {import('next').NextConfig} */
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:3011";

const nextConfig = {
  reactStrictMode: true,
  // Proxy same-origin para a API (padrão CLAUDE.md §A.2): o browser fala só com o front.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
  // Portal do candidato: a HTML NUNCA pode ser cacheada pelo navegador. Sem isso, apos um
  // deploy o candidato reabre uma HTML velha do cache, que aponta para chunks /_next/static
  // imutaveis ja removidos, e os textos novos nao aparecem. O no-store forca o browser a
  // buscar sempre o documento fresco; os assets /_next/static seguem imutaveis (nao entram
  // nesta regra), entao so o documento deixa de ser cacheado.
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
