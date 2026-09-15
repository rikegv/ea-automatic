"use client";

/**
 * ─ FILA DE ENTRADAS DO PANDAPÉ (OST do diretor, 15/09/2026) ────────────────────────────────────
 *
 * A fila de "chegou do Pandapé e NÃO virou admissão no EA". É FILA DE TRABALHO, não relatório: a
 * pessoa abre, vê quem ficou de fora e por quê, e reprocessa dali mesmo. Zerou, sai da fila, pela
 * mesma régua da §A.19, e a régua mora no BACKEND: esta tela consome, não recalcula.
 *
 * ┌─ O CASO QUE ORIGINOU, e que explica cada coluna ────────────────────────────────────────────┐
 * │ O evento de uma candidata chegou às 15:59:57 com o CPF ainda zerado, porque o Pandapé dispara │
 * │ ANTES de a pessoa preencher. O job morreu em cinco tentativas dentro de dez segundos e        │
 * │ NINGUÉM FICOU SABENDO: não havia tela nenhuma onde a linha aparecesse. Dias depois o dado     │
 * │ ficou válido e ela continuou fora. Alguém chegou a reprocessar dois casos vizinhos no mesmo   │
 * │ dia e não a viu, porque o caso dela nem na lista de falhados entrava.                          │
 * │ Daí "Tentativas" e "Última Tentativa" serem colunas e não detalhe: é o que separa "acabou de  │
 * │ chegar" de "morreu cinco vezes e está parado desde terça".                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `candidatoNome` É OPCIONAL, E ISSO NÃO É CASO DE BORDA. Ele vem de um cache em memória do
 * processo, resolvido no worker sob o limitador de requisições, então depois de um restart a
 * MAIORIA das linhas não tem nome. A linha renderiza igual, com "não informado" (§A.11), e nunca
 * some: esconder a linha sem nome recriaria, na tela nova, exatamente o silêncio que ela veio
 * acabar. É por isso que o identificador do ATS aparece junto: sem nome resolvido, ele é o único
 * jeito de a pessoa saber de quem é a linha que está reprocessando.
 *
 * §A.6: aqui não há CPF nem qualquer dado pessoal além do nome exibido, que não é persistido nem
 * logado em lugar nenhum desta tela.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PandapeEntradaItem } from "@ea/shared-types";
import { PANDAPE_ENTRADA_DESFECHOS } from "@ea/shared-types";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { dataHoraBr } from "@/lib/as-candidatos";
import { cn } from "@/lib/cn";
import {
  NAO_INFORMADO,
  ajudaDesfecho,
  listarEntradasPandape,
  rankDesfecho,
  reprocessarEntradaPandape,
  rotuloDesfecho,
  rotuloMotivo,
  toneDesfecho,
} from "@/lib/pandape-entradas";

/** As opções do filtro vêm do ENUM do contrato, não das linhas carregadas (§A.37). */
const OPCOES_DESFECHO = PANDAPE_ENTRADA_DESFECHOS.map((d) => ({
  value: d,
  label: rotuloDesfecho(d),
}));

export default function EntradasPandapePage() {
  const { token } = useAuth();
  const [itens, setItens] = useState<PandapeEntradaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [desfechos, setDesfechos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      setItens(await listarEntradasPandape(token, desfechos));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar a fila de entradas.");
    } finally {
      setCarregando(false);
    }
  }, [token, desfechos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * ORDENAÇÃO CLICÁVEL (§A.29), pelo `useOrdenacao` que já existe. "Situação" é RANK, não texto: a
   * pergunta da fila é "o que está pior", e ordenar o rótulo em ordem alfabética responderia outra
   * coisa. Candidato ordena pelo nome quando ele existe, e quem ainda não tem nome resolvido cai
   * para o fim como qualquer vazio, sem sumir da lista.
   */
  const colunas = useMemo<ColOrd<PandapeEntradaItem>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (i) => i.candidatoNome ?? "" },
      { chave: "vaga", tipo: "texto", valor: (i) => i.idVacancy },
      { chave: "recebidoEm", tipo: "data", valor: (i) => i.recebidoEm },
      { chave: "situacao", tipo: "status", valor: (i) => rankDesfecho(i.desfecho) },
      { chave: "motivo", tipo: "texto", valor: (i) => (i.motivo ? rotuloMotivo(i.motivo) : "") },
      { chave: "tentativas", tipo: "numero", valor: (i) => i.tentativas },
      { chave: "ultimaTentativa", tipo: "data", valor: (i) => i.ultimaTentativaEm },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, itens);

  async function reprocessar(item: PandapeEntradaItem) {
    if (!token) return;
    setOcupado(item.id);
    setErro(null);
    setAviso(null);
    try {
      await reprocessarEntradaPandape(token, item.id);
      setAviso(
        "Reprocessamento enfileirado. A fila roda em segundo plano: atualize em alguns instantes para ver o resultado.",
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao reprocessar a entrada.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Entradas Do Pandapé"
        subtitle="O que o Pandapé enviou e ainda não virou admissão no EA. Resolveu, sai da fila."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-dim">
          {carregando
            ? "Carregando…"
            : `${itens.length} entrada${itens.length === 1 ? "" : "s"} na fila`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            title="Atualizar a fila"
            aria-label="Atualizar a fila"
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
          >
            <Icon name="refresh" className={cn("h-[19px] w-[19px]", carregando && "animate-spin")} />
          </button>
          {/* FILTRO ÚNICO, por Situação, escolha do diretor (§A.30). Multiselect pelo componente
              compartilhado (§A.28/§A.35): nenhum marcado significa todos. */}
          <FiltroTrigger count={desfechos.length} onLimpar={() => setDesfechos([])}>
            <FiltroCampo label="Situação">
              <MultiSelect
                ariaLabel="Filtrar por situação"
                values={desfechos}
                onChange={setDesfechos}
                options={OPCOES_DESFECHO}
                placeholder="Todas as situações"
              />
            </FiltroCampo>
          </FiltroTrigger>
        </div>
      </div>

      {aviso && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-ok">
          {aviso}
        </p>
      )}
      {erro && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* A largura mínima existe para a tabela ROLAR na horizontal em vez de espremer as
              colunas de texto (§A.20). As oito larguras somam 100%. */}
          <table className="ds-table min-w-[1180px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[20%]">
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="w-[10%]">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="recebidoEm" className="w-[13%]">
                  Chegou Em
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao" className="w-[15%]">
                  Situação
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="motivo" className="w-[14%]">
                  Motivo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="tentativas" className="w-[7%]">
                  Tentativas
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="ultimaTentativa" className="w-[13%]">
                  Última Tentativa
                </ColunaOrdenavel>
                <th className="w-[8%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    {desfechos.length
                      ? "Nenhuma entrada nesta situação."
                      : "Nenhuma entrada pendente. Tudo o que o Pandapé enviou virou admissão no EA."}
                  </td>
                </tr>
              ) : (
                ord.itens.map((i) => {
                  const tone = toneDesfecho(i.desfecho);
                  const rodando = ocupado === i.id;
                  return (
                    <tr key={i.id}>
                      <td>
                        {/* Nome quando o cache já resolveu; "não informado" quando não, SEMPRE com o
                            identificador do ATS abaixo, que é o que identifica a linha nesse caso. */}
                        <span
                          className={cn(
                            "block font-semibold",
                            !i.candidatoNome && "font-normal text-faint",
                          )}
                        >
                          {i.candidatoNome ?? NAO_INFORMADO}
                        </span>
                        <span className="block text-[12px] text-dim tabular-nums">
                          ID {i.idPrecollaborator ?? NAO_INFORMADO}
                        </span>
                      </td>
                      <td className="text-center text-dim tabular-nums">
                        {i.idVacancy ?? NAO_INFORMADO}
                      </td>
                      <td className="text-center text-dim tabular-nums">
                        {dataHoraBr(i.recebidoEm)}
                      </td>
                      <td className="text-center">
                        <StatusPill
                          tone={tone}
                          label={rotuloDesfecho(i.desfecho)}
                          title={ajudaDesfecho(i.desfecho)}
                        />
                      </td>
                      <td className="text-center text-dim">{rotuloMotivo(i.motivo)}</td>
                      <td className="text-center tabular-nums">{i.tentativas}</td>
                      <td className="text-center text-dim tabular-nums">
                        {dataHoraBr(i.ultimaTentativaEm)}
                      </td>
                      <td>
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => void reprocessar(i)}
                            disabled={rodando || !i.idPrecollaborator}
                            title={
                              i.idPrecollaborator
                                ? "Reprocessar este evento: o Pandapé é consultado de novo"
                                : "Sem identificador do Pandapé, não há o que reprocessar"
                            }
                            aria-label="Reprocessar a entrada"
                            className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:border-[var(--accent)] hover:text-accent disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-dim"
                          >
                            <Icon
                              name="refresh"
                              className={cn("h-4 w-4", rodando && "animate-spin")}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  );
}
