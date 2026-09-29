"use client";

/**
 * ─ CENTRAL DE AJUDA, O SUMÁRIO ─────────────────────────────────────────────────────────────────
 *
 * A porta de quem vai ESTUDAR: busca em cima, os módulos como blocos embaixo. A outra porta, a de
 * quem está travado agora, é o botão de ajuda da própria tela, e é ela que decide se o manual é
 * usado ou esquecido: ninguém para o que está fazendo para navegar até um menu.
 *
 * Sem tabela nesta tela de propósito: o sumário é uma lista de leitura, e transformar título e
 * resumo em colunas daria ordenação e filtro a um conteúdo que se lê de cima para baixo.
 */

import { useState } from "react";
import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { BuscaDeAjuda } from "@/components/ajuda/BuscaDeAjuda";
import { artigosPorModulo } from "@/ajuda/registro";
import { MODULO_AJUDA_LABEL } from "@/ajuda/tipos";

export default function CentralDeAjudaPage() {
  const [consulta, setConsulta] = useState("");
  const blocos = artigosPorModulo();
  const procurando = consulta.trim() !== "";

  return (
    <>
      <PageHead
        eyebrow="Ajuda"
        title="Central De Ajuda"
        subtitle="O manual do sistema: o passo a passo de cada tela, escrito para executar com o sistema aberto."
      />

      <GlassCard className="panel mb-5">
        <BuscaDeAjuda consulta={consulta} aoDigitar={setConsulta} />
      </GlassCard>

      {!procurando && (
        <div className="flex flex-col gap-5">
          {blocos.map(({ modulo, artigos }) => (
            <GlassCard key={modulo} className="panel">
              <h3 className="mb-1">{MODULO_AJUDA_LABEL[modulo]}</h3>
              <p className="psub mb-4">
                {artigos.length === 1 ? "1 artigo" : `${artigos.length} artigos`}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {artigos.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/ajuda/${a.slug}`}
                    className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
                  >
                    <Icon name="doc" className="mt-0.5 h-[18px] w-[18px] flex-none text-accent" />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{a.titulo}</span>
                      <span className="mt-1 block text-[12.5px] text-dim">{a.resumo}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
