// LAYOUT DO PORTAL DO CANDIDATO: aplica a fonte Montserrat (variavel --font-montserrat) e a
// paleta clara da marca APENAS na subarvore `/portal`, sem tocar o layout raiz nem o globals.css.
//
// A pagina (`page.tsx`) segue `"use client"` inteira, com a sua maquina de estado e a sua sessao
// PII-free intactas: este layout so veste a casca (fonte e fundo claro). A tecnica do modulo CSS
// (`estilos.raiz`) reassume os titulos, que o globals.css forca para Manrope, para a Montserrat.
//
// TEMA CLARO FIXO: `bg-soulan-fundo`/`text-portal-ink` sao hex literais do preset Soulan (nunca
// `var(--...)` do design system, que inverteria no modo escuro do aparelho), coerente com a
// decisao do diretor de o portal do candidato ser claro sempre.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { montserrat } from "./fonte-montserrat";
import estilos from "./portal.module.css";

export const metadata: Metadata = {
  title: "Portal do Candidato · Soulan",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${estilos.raiz} min-h-dvh bg-soulan-fundo font-montserrat text-portal-ink antialiased`}
      style={{ colorScheme: "light" }}
    >
      {children}
    </div>
  );
}
