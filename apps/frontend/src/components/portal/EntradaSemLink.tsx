"use client";

import { useState, type ReactNode } from "react";
import { AcessoPorEmail } from "@/components/portal/AcessoPorEmail";

/**
 * A ENTRADA DE QUEM CHEGOU SEM O LINK: o e-mail PRIMEIRO, o link como opção secundária.
 *
 * ┌─ POR QUE O E-MAIL ABRE DIRETO, E NÃO MAIS UMA ESCOLHA ENTRE DOIS CARTÕES IGUAIS ───────────┐
 * │ O candidato SEM link (e, no caso-alvo desta porta, sem CPF na ficha) é a MAIORIA de quem     │
 * │ cai aqui. A tela antiga oferecia dois caminhos com o mesmo peso ("Já Tenho O Link" e "Entrar │
 * │ Com Meu E-mail") e exigia um toque a mais de quase todo mundo. Agora a entrada ABRE JÁ no    │
 * │ caminho do e-mail, e "Já tenho o link" é um atalho SECUNDÁRIO, no rodapé do próprio passo do │
 * │ e-mail, para a minoria que tem o link em mãos. (Decisão do diretor, desenho iii.)            │
 * │                                                                                            │
 * │ NINGUÉM QUE TEM LINK É PREJUDICADO: quem abre com o fragmento (`#t=`, o                       │
 * │ `PORTAL_FRAGMENTO_LINK`) nem chega aqui, a página abre DIRETO na identificação de sempre e    │
 * │ este componente nem é montado. Esta tela só aparece para quem chegou SEM o fragmento.        │
 * │                                                                                            │
 * │ A INSTRUÇÃO DO LINK CHEGA PRONTA, por `instrucaoDoLink`, e isso é deliberado: aquele texto  │
 * │ é código já validado e continua morando na página, com as mesmas palavras e o mesmo ícone.  │
 * │ Ele foi ENVELOPADO, não reescrito (§A.14/§A.26). O caminho do link continua byte a byte o    │
 * │ de antes desta frente.                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11 sem travessão. §A.24: "Já tenho o link" e "Voltar" são ações de navegação, em escrita normal.
 */

type Caminho = "EMAIL" | "LINK";

export function EntradaSemLink({ instrucaoDoLink }: { instrucaoDoLink: ReactNode }) {
  const [caminho, setCaminho] = useState<Caminho>("EMAIL");

  if (caminho === "LINK") {
    return (
      <div className="flex flex-col gap-5">
        {instrucaoDoLink}
        <button
          type="button"
          onClick={() => setCaminho("EMAIL")}
          className="min-h-11 border-t border-portal-linha pt-4 text-sm font-semibold text-portal-muted"
        >
          Voltar
        </button>
      </div>
    );
  }

  return <AcessoPorEmail aoIrParaLink={() => setCaminho("LINK")} />;
}
