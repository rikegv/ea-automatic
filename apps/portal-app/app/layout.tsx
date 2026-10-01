// ROOT LAYOUT do app proprio do Portal. So a casca minima: html/body + globals.css (tokens e
// @tailwind). A PELE do candidato (fonte Montserrat, fundo claro) vive no layout ANINHADO de
// /portal (app/portal/layout.tsx), reusado da operacao, espelhando a estrutura do EA. NAO ha
// AuthProvider nem ThemeProvider (o root layout do EA os injeta, e sao o que dispara
// /api/auth/refresh a toa; aqui nao existem).
import "@/app/globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Portal do Candidato · Soulan",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
