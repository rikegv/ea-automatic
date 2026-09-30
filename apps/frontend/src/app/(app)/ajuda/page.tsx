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
 *
 * ┌─ O MÓDULO NASCE RECOLHIDO, E ISSO VIROU NECESSIDADE QUANDO O MANUAL CRESCEU ─────────────────┐
 * │ Com 37 peças, listar tudo cabia. Com 184, não cabe: só o Soul ADM tem 87 artigos, e o sumário │
 * │ virava uma parede de cartões em que ninguém achava nada. O diretor pediu o par "Mostrar Todos" │
 * │ e "Recolher", e o segundo é o que faltava: dava para abrir e não dava para voltar.             │
 * │                                                                                                │
 * │ CADA MÓDULO GUARDA O PRÓPRIO ESTADO, e não há um estado só para a tela: quem está estudando a  │
 * │ esteira abre o Soul ADM e deixa os outros três fechados, que é o recorte que ele quer ver.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A BUSCA ESVAZIA OS BLOCOS, E NÃO O CONTRÁRIO ──────────────────────────────────────┐
 * │ Procurando, a pessoa não quer módulo: quer o artigo. Os blocos somem inteiros durante a busca, │
 * │ então o estado de recolhido nem entra na conta, e ninguém precisa abrir módulo para achar o     │
 * │ resultado de uma busca.                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { useState } from "react";
import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { BuscaDeAjuda } from "@/components/ajuda/BuscaDeAjuda";
import { artigosPorModulo } from "@/ajuda/registro";
import { MODULO_AJUDA_LABEL, type ModuloAjuda } from "@/ajuda/tipos";

/**
 * QUANTOS ARTIGOS O MÓDULO MOSTRA FECHADO.
 *
 * Seis, e o número tem razão: são TRÊS LINHAS na grade de duas colunas, o bastante para a pessoa
 * reconhecer do que o módulo trata sem que o bloco vire parede. Quatro deixaria o Começar Aqui, que
 * tem 14, parecendo pequeno demais para valer a leitura; doze devolveria o problema que o diretor
 * pediu para resolver.
 */
const PREVIA = 6;

export default function CentralDeAjudaPage() {
  const [consulta, setConsulta] = useState("");
  /** UM estado por módulo, e não um para a tela: ver o comentário do topo. */
  const [abertos, setAbertos] = useState<Partial<Record<ModuloAjuda, boolean>>>({});
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
          {blocos.map(({ modulo, artigos }) => {
            const aberto = abertos[modulo] === true;
            const cabeInteiro = artigos.length <= PREVIA;
            const visiveis = aberto || cabeInteiro ? artigos : artigos.slice(0, PREVIA);
            return (
              <GlassCard key={modulo} className="panel">
                <h3 className="mb-1">{MODULO_AJUDA_LABEL[modulo]}</h3>
                <p className="psub mb-4">
                  {artigos.length === 1 ? "1 artigo" : `${artigos.length} artigos`}
                  {!cabeInteiro && !aberto ? `, mostrando ${visiveis.length}` : ""}
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {visiveis.map((a) => (
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

                {/*
                 * O BOTÃO SÓ EXISTE QUANDO HÁ O QUE ESCONDER. Módulo que cabe inteiro na prévia não
                 * ganha um controle que não faria nada, pela mesma razão que o botão de ajuda não
                 * aparece em tela sem artigo: controle que não muda nada ensina que o controle não
                 * serve.
                 *
                 * §A.24: "Mostrar Todos" e "Recolher" são RÓTULOS, então vêm em title case. A setinha
                 * que gira é a mesma do resto da casa (a ficha do cliente e o Alto Volume), para o
                 * gesto ser reconhecido sem ninguém precisar aprender nada novo aqui.
                 */}
                {!cabeInteiro && (
                  <button
                    type="button"
                    onClick={() => setAbertos((s) => ({ ...s, [modulo]: !aberto }))}
                    aria-expanded={aberto}
                    aria-label={
                      aberto
                        ? `Recolher ${MODULO_AJUDA_LABEL[modulo]}`
                        : `Mostrar todos os artigos de ${MODULO_AJUDA_LABEL[modulo]}`
                    }
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold text-dim transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)] hover:text-accent"
                  >
                    <span
                      className={`inline-block leading-none transition-transform ${aberto ? "rotate-90" : ""}`}
                    >
                      ›
                    </span>
                    {aberto ? "Recolher" : `Mostrar Todos (${artigos.length})`}
                  </button>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </>
  );
}
