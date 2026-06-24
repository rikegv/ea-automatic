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
};

export default nextConfig;
