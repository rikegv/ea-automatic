"use client";

/**
 * CONTROLE GERENCIAL, visão ALTO VOLUME: a ANÁLISE por grupo de cliente e por projeto.
 *
 * A tela tem DUAS visões (pílula Grupo/Projeto) e, em cada uma, DUAS opções de layout para a área de
 * resultados (alternador Opção 1 / Opção 2):
 *  - OPÇÃO 1 (empilhado): cada grupo ou projeto selecionado mostra o próprio card de indicadores e a
 *    própria tabela por cargo logo abaixo, e o próximo repete.
 *  - OPÇÃO 2 (consolidado): primeiro os cards de todos os selecionados, e embaixo UMA tabela por cargo
 *    somando todos os selecionados.
 *
 * A VISÃO GRUPO seleciona um ou MAIS grupos de cliente (multiselect). O grupo não tem período, então
 * não há termômetro, e não tem meta por cargo: a coluna Vagas e a coluna Faltam da tabela por cargo
 * ficam "não informado" por linha, e a meta aparece só no Total (a meta é do grupo inteiro).
 *
 * A VISÃO PROJETO seleciona UM cliente (seletor único) e um ou MAIS projetos daquele cliente
 * (multiselect). Cada projeto tem meta por cargo, termômetro e preenchimento por cargo.
 *
 * §A.26: a tela é LEITURA. Um GET agregado por item (`/analise`), nenhuma escrita, nenhum botão que
 * mude estado. Trocar a seleção recarrega as análises dos itens escolhidos.
 *
 * §A.12/§A.20 nas tabelas, §A.24 title case em título e tag, §A.11 sem travessão, §A.28/§A.35
 * multiselect pelo componente compartilhado com busca, §A.29 ordenação clicável.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Pill } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NavDiretoria } from "@/components/diretoria/NavDiretoria";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface Projeto {
  id: string;
  codCliente: string;
  clienteRazaoSocial: string;
  clienteNomeOperacao: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  ativo: boolean;
}

interface LinhaCargo {
  cargoId: string | null;
  cargoNome: string;
  vagas: number;
  vinculadas: number;
  concluidas: number;
  cadastradas: number;
  emAndamento: number;
  pausadas: number;
  declinios: number;
  emBanco: number;
  faltam: number;
  percentual: number;
}

interface Analise {
  projeto: {
    id: string;
    nome: string;
    codCliente: string;
    clienteRazaoSocial: string;
    clienteNomeOperacao: string | null;
    dataInicio: string;
    dataFim: string;
    ativo: boolean;
  };
  termometro: {
    totalDias: number;
    decorridos: number;
    diasRestantes: number;
    /** Dias úteis que faltam para o projeto ABRIR, contando hoje. Zero depois que ele abriu. */
    diasParaInicio: number;
    situacao: "ok" | "atencao" | "critico" | "encerrado";
    percentualDecorrido: number;
  };
  totais: {
    vagas: number;
    vinculadas: number;
    concluidas: number;
    cadastradas: number;
    emAndamento: number;
    pausadas: number;
    declinios: number;
    emBanco: number;
    faltam: number;
    percentual: number;
  };
  porCargo: LinhaCargo[];
}

/**
 * A VISÃO POR GRUPO (grupo de CLIENTE, ex "CAGC Corifeu"). Outro recorte da mesma esteira: um grupo
 * junta vários CNPJs e tem uma META própria (cadastrada na tela de Clientes). Diferente do projeto, o
 * grupo NÃO tem período (sem termômetro) nem meta por cargo.
 */
interface GrupoDaDash {
  id: string;
  nome: string;
  ativo: boolean;
  /** Meta nula = grupo legado sem meta definida; a tela mostra o estado e aponta o caminho. */
  meta: number | null;
}

interface AnaliseGrupo {
  grupo: { id: string; nome: string; meta: number | null };
  totais: {
    /** A meta do grupo. Nula para grupo legado, e aí "faltam" também é nulo, nunca NaN. */
    meta: number | null;
    naEsteira: number;
    ativos: number;
    emBanco: number;
    concluidas: number;
    emAndamento: number;
    pausadas: number;
    declinios: number;
    /** `meta - naEsteira`, nulo quando a meta é nula. */
    faltam: number | null;
  };
  porCargo: {
    cargoId: string | null;
    cargoNome: string;
    naEsteira: number;
    concluidas: number;
    emAndamento: number;
    pausadas: number;
    declinios: number;
  }[];
}

/**
 * LINHA ÚNICA da tabela por cargo, que serve grupo e projeto. `vagas` e `faltam` são `null` quando o
 * recorte não tem meta por cargo (o grupo), e a célula mostra "não informado". O resto é contagem.
 */
interface LinhaCargoTabela {
  cargoId: string | null;
  cargoNome: string;
  vagas: number | null;
  naEsteira: number;
  concluidas: number;
  emAndamento: number;
  faltam: number | null;
  pausadas: number;
  declinios: number;
}
type TotalCargoTabela = Omit<LinhaCargoTabela, "cargoId" | "cargoNome">;

function fmtData(iso?: string | null): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function rotuloCliente(codCliente: string, nomeOperacao: string | null, razaoSocial: string): string {
  return `${codCliente} · ${nomeOperacao ?? razaoSocial}`;
}

/**
 * Cor do preenchimento por faixa. Vermelho abaixo de um terço, amarelo até perto, verde quando fechou.
 */
function corDoPreenchimento(pct: number): string {
  if (pct >= 100) return "var(--ok)";
  if (pct >= 66) return "var(--accent)";
  if (pct >= 33) return "var(--warn)";
  return "var(--danger)";
}

/** Percentual de cobertura: quanto das vagas abertas já está com a gente. Conta de desenho. */
function percentualDe(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}

const COR_TERMOMETRO: Record<Analise["termometro"]["situacao"], string> = {
  ok: "var(--ok)",
  atencao: "var(--warn)",
  critico: "var(--danger)",
  encerrado: "var(--danger)",
};

/** Trilho das barras: tema-aware pelos tokens, sem cor fixa que só funcione num dos dois temas. */
const TRILHO = "color-mix(in srgb, var(--text) 9%, transparent)";

/** Marcador de célula vazia (§A.11): nunca zero onde a verdade é "ninguém definiu". */
function NaoInformado() {
  return <span className="text-[12px] text-faint">não informado</span>;
}

/* ─ CONVERSÕES PARA A TABELA ÚNICA POR CARGO ──────────────────────────────────────────────────── */

function linhasCargoDoProjeto(dados: Analise): LinhaCargoTabela[] {
  return dados.porCargo.map((l) => ({
    cargoId: l.cargoId,
    cargoNome: l.cargoNome,
    vagas: l.vagas,
    naEsteira: l.vinculadas,
    concluidas: l.concluidas,
    emAndamento: l.emAndamento,
    faltam: l.faltam,
    pausadas: l.pausadas,
    declinios: l.declinios,
  }));
}
function totalCargoDoProjeto(dados: Analise): TotalCargoTabela {
  const t = dados.totais;
  return {
    vagas: t.vagas,
    naEsteira: t.vinculadas,
    concluidas: t.concluidas,
    emAndamento: t.emAndamento,
    faltam: t.faltam,
    pausadas: t.pausadas,
    declinios: t.declinios,
  };
}
function linhasCargoDoGrupo(a: AnaliseGrupo): LinhaCargoTabela[] {
  // O grupo NÃO tem meta por cargo: Vagas e Faltam por linha ficam nulos ("não informado"), e a meta
  // aparece só no Total, que é do grupo inteiro.
  return a.porCargo.map((l) => ({
    cargoId: l.cargoId,
    cargoNome: l.cargoNome,
    vagas: null,
    naEsteira: l.naEsteira,
    concluidas: l.concluidas,
    emAndamento: l.emAndamento,
    faltam: null,
    pausadas: l.pausadas,
    declinios: l.declinios,
  }));
}
function totalCargoDoGrupo(a: AnaliseGrupo): TotalCargoTabela {
  const t = a.totais;
  return {
    vagas: t.meta,
    naEsteira: t.naEsteira,
    concluidas: t.concluidas,
    emAndamento: t.emAndamento,
    faltam: t.faltam,
    pausadas: t.pausadas,
    declinios: t.declinios,
  };
}

/**
 * CONSOLIDAÇÃO (Opção 2). Soma as linhas por cargo de vários itens num conjunto só.
 *
 * Projeto: soma vagas e contagens; `faltam` por cargo e no total = soma(vagas) menos soma(na esteira).
 * Grupo: soma só as contagens (Vagas/Faltam por linha seguem nulos); a meta total = soma das metas,
 *   e o faltam total = soma(metas) menos soma(na esteira), nulo quando nenhum grupo tem meta.
 */
function chaveCargo(cargoId: string | null, cargoNome: string): string {
  return cargoId ?? `__${cargoNome}`;
}

function consolidarProjetos(lista: Analise[]): { linhas: LinhaCargoTabela[]; total: TotalCargoTabela } {
  const mapa = new Map<string, LinhaCargoTabela>();
  for (const d of lista) {
    for (const l of d.porCargo) {
      const k = chaveCargo(l.cargoId, l.cargoNome);
      const cur =
        mapa.get(k) ??
        ({
          cargoId: l.cargoId,
          cargoNome: l.cargoNome,
          vagas: 0,
          naEsteira: 0,
          concluidas: 0,
          emAndamento: 0,
          faltam: 0,
          pausadas: 0,
          declinios: 0,
        } as LinhaCargoTabela);
      cur.vagas = (cur.vagas ?? 0) + l.vagas;
      cur.naEsteira += l.vinculadas;
      cur.concluidas += l.concluidas;
      cur.emAndamento += l.emAndamento;
      cur.pausadas += l.pausadas;
      cur.declinios += l.declinios;
      mapa.set(k, cur);
    }
  }
  const linhas = [...mapa.values()].map((l) => ({ ...l, faltam: (l.vagas ?? 0) - l.naEsteira }));
  const soma = (f: (d: Analise) => number) => lista.reduce((a, d) => a + f(d), 0);
  const vagas = soma((d) => d.totais.vagas);
  const naEsteira = soma((d) => d.totais.vinculadas);
  return {
    linhas,
    total: {
      vagas,
      naEsteira,
      concluidas: soma((d) => d.totais.concluidas),
      emAndamento: soma((d) => d.totais.emAndamento),
      faltam: vagas - naEsteira,
      pausadas: soma((d) => d.totais.pausadas),
      declinios: soma((d) => d.totais.declinios),
    },
  };
}

function consolidarGrupos(lista: AnaliseGrupo[]): { linhas: LinhaCargoTabela[]; total: TotalCargoTabela } {
  const mapa = new Map<string, LinhaCargoTabela>();
  for (const a of lista) {
    for (const l of a.porCargo) {
      const k = chaveCargo(l.cargoId, l.cargoNome);
      const cur =
        mapa.get(k) ??
        ({
          cargoId: l.cargoId,
          cargoNome: l.cargoNome,
          vagas: null,
          naEsteira: 0,
          concluidas: 0,
          emAndamento: 0,
          faltam: null,
          pausadas: 0,
          declinios: 0,
        } as LinhaCargoTabela);
      cur.naEsteira += l.naEsteira;
      cur.concluidas += l.concluidas;
      cur.emAndamento += l.emAndamento;
      cur.pausadas += l.pausadas;
      cur.declinios += l.declinios;
      mapa.set(k, cur);
    }
  }
  const linhas = [...mapa.values()];
  const soma = (f: (a: AnaliseGrupo) => number) => lista.reduce((acc, a) => acc + f(a), 0);
  // META total: soma só as metas que existem. Nenhum grupo com meta deixa o total nulo (não zero).
  let metaTotal: number | null = null;
  for (const a of lista) {
    if (a.totais.meta !== null) metaTotal = (metaTotal ?? 0) + a.totais.meta;
  }
  const naEsteira = soma((a) => a.totais.naEsteira);
  return {
    linhas,
    total: {
      vagas: metaTotal,
      naEsteira,
      concluidas: soma((a) => a.totais.concluidas),
      emAndamento: soma((a) => a.totais.emAndamento),
      faltam: metaTotal === null ? null : metaTotal - naEsteira,
      pausadas: soma((a) => a.totais.pausadas),
      declinios: soma((a) => a.totais.declinios),
    },
  };
}

/**
 * Uma barra do cargo: rótulo em cima, barra arredondada embaixo, número à direita. Desenho na mão,
 * sem biblioteca de gráfico, tema-aware pelos tokens.
 */
function Barra({
  rotulo,
  valor,
  mostrarValor = true,
  largura,
  cor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  mostrarValor?: boolean;
  largura: number;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-dim" title={rotulo}>
          {rotulo}
        </span>
        {mostrarValor && (
          <span
            className={`shrink-0 tabular-nums ${destaque ? "text-[15px] font-semibold text-text" : "text-sm text-dim"}`}
          >
            {valor}
          </span>
        )}
      </div>
      <div className="mt-1 h-[14px] w-full overflow-hidden rounded-full" style={{ background: TRILHO }}>
        {largura > 0 && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${largura}%`, background: cor }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * PREENCHIMENTO DO CARGO em três barras (projeto): quanto o projeto contratou (vagas abertas), quanto
 * já está na esteira e quanto falta buscar. A escala é comum às três barras do card (o maior valor),
 * para elas se compararem entre si. Cada cargo tem escala própria.
 */
function BarrasDoCargo({ linha }: { linha: LinhaCargo }) {
  const { vagas, vinculadas } = linha;
  const falta = Math.max(0, linha.faltam);
  const excedente = Math.max(0, -linha.faltam);
  const cobertura = percentualDe(vinculadas, vagas);
  const completo = vagas > 0 && falta === 0;
  const cor = vagas === 0 ? "var(--accent)" : corDoPreenchimento(cobertura);

  const escala = Math.max(vagas, vinculadas, 1);
  const largura = (v: number) => (v <= 0 ? 0 : Math.max(3, Math.round((v / escala) * 100)));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text" title={linha.cargoNome}>
          {linha.cargoNome}
        </h4>
        {excedente > 0 && vagas > 0 && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{
              color: "var(--warn-2)",
              background: "color-mix(in srgb, var(--warn-2) 14%, transparent)",
            }}
          >
            Excedente +{excedente}
          </span>
        )}
        {completo ? (
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              color: "var(--completo)",
              background: "color-mix(in srgb, var(--completo) 16%, transparent)",
            }}
          >
            Completo
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
            style={{ color: cor, background: `color-mix(in srgb, ${cor} 15%, transparent)` }}
          >
            {vagas === 0 ? "Sem Meta" : `${cobertura}%`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Barra
          rotulo="Total De Vagas Do Projeto"
          valor={vagas}
          largura={largura(vagas)}
          cor={`color-mix(in srgb, var(--accent) 30%, transparent)`}
        />
        <Barra
          rotulo="Total De Vagas Na Esteira"
          valor={vinculadas}
          largura={largura(vinculadas)}
          cor={`linear-gradient(90deg, color-mix(in srgb, ${cor} 62%, transparent), ${cor})`}
          destaque
        />
        <Barra
          rotulo={
            vagas === 0
              ? "Sem Meta Cadastrada Para Este Cargo"
              : completo
                ? "Cargo Completo"
                : `Falta ${falta} Para Completar O Projeto`
          }
          valor={falta}
          mostrarValor={false}
          largura={completo ? 100 : largura(falta)}
          cor={
            completo
              ? `linear-gradient(90deg, color-mix(in srgb, var(--completo) 55%, transparent), var(--completo))`
              : `linear-gradient(90deg, color-mix(in srgb, var(--warn) 45%, transparent), color-mix(in srgb, var(--warn) 85%, transparent))`
          }
        />
      </div>
    </div>
  );
}

/**
 * MODAL DOS DECLÍNIOS: o peso dos declínios na entrega e o ranking por cargo. Recorta o mesmo GET que
 * já desenhou a tela, sem consulta nova. §A.6: contagem por cargo, sem nome e sem CPF.
 */
function ModalDeclinios({ dados, onClose }: { dados: Analise; onClose: () => void }) {
  const { declinios, vagas } = dados.totais;
  const pesoNaEntrega = percentualDe(declinios, vagas);
  const ranking = dados.porCargo
    .filter((l) => l.declinios > 0)
    .sort((a, b) => b.declinios - a.declinios || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"));
  const maior = ranking[0]?.declinios ?? 0;

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Análise Dos Declínios">
      <h2 className="mb-1 text-[19px] font-semibold text-text">Análise Dos Declínios</h2>
      <p className="mb-4 text-sm text-dim">
        {dados.projeto.nome}, quanto os declínios pesam na entrega e quais cargos mais perderam gente.
      </p>

      <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
          Peso Na Entrega Do Projeto
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[34px] font-semibold leading-none tabular-nums" style={{ color: "var(--danger)" }}>
            {pesoNaEntrega}%
          </span>
          <span className="text-sm text-dim">
            das {vagas} vagas do projeto se perderam por declínio ou rescisão, {declinios}{" "}
            {declinios === 1 ? "admissão" : "admissões"} ao todo
          </span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: TRILHO }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, pesoNaEntrega)}%`, background: "var(--danger)" }}
          />
        </div>
        <p className="mt-2 text-xs text-faint">
          É quanto da meta precisa ser buscado de novo. Não é o mesmo que a vaga estar aberta hoje:
          quem declinou pode já ter sido reposto por outra pessoa na esteira.
        </p>
      </div>

      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
        Declínios Por Cargo
      </h3>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-faint">Nenhum cargo com declínio neste projeto.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ranking.map((l) => (
            <div key={l.cargoId ?? l.cargoNome}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={l.cargoNome}>
                  {l.cargoNome}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-text">{l.declinios}</span>
                <span className="w-[64px] shrink-0 text-right text-xs tabular-nums text-faint">
                  {l.vagas > 0 ? `${percentualDe(l.declinios, l.vagas)}% do cargo` : "sem meta"}
                </span>
              </div>
              <div className="mt-1 h-[12px] w-full overflow-hidden rounded-full" style={{ background: TRILHO }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.round((l.declinios / Math.max(1, maior)) * 100))}%`,
                    background:
                      "linear-gradient(90deg, color-mix(in srgb, var(--danger) 45%, transparent), var(--danger))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

/**
 * MODAL EM BANCO: a quantidade de admissões em banco por cargo. Mesmo recorte do GET que desenhou a
 * tela, sem consulta nova. §A.6: contagem por cargo, sem nome e sem CPF.
 */
function ModalBanco({ dados, onClose }: { dados: Analise; onClose: () => void }) {
  const ranking = dados.porCargo
    .filter((l) => l.emBanco > 0)
    .sort((a, b) => b.emBanco - a.emBanco || a.cargoNome.localeCompare(b.cargoNome, "pt-BR"));
  const maior = ranking[0]?.emBanco ?? 0;

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Admissões Em Banco">
      <h2 className="mb-1 text-[19px] font-semibold text-text">Admissões Em Banco</h2>
      <p className="mb-4 text-sm text-dim">
        {dados.projeto.nome}, quantas admissões estão em banco aguardando, por cargo. Elas não contam
        no preenchimento das vagas.
      </p>

      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <span className="text-[34px] font-semibold leading-none tabular-nums" style={{ color: "var(--warn)" }}>
          {dados.totais.emBanco}
        </span>
        <span className="ml-3 text-sm text-dim">
          {dados.totais.emBanco === 1 ? "admissão em banco" : "admissões em banco"} no projeto
        </span>
      </div>

      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">Em Banco Por Cargo</h3>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-faint">Nenhuma admissão em banco neste projeto.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ranking.map((l) => (
            <div key={l.cargoId ?? l.cargoNome}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={l.cargoNome}>
                  {l.cargoNome}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-text">{l.emBanco}</span>
              </div>
              <div className="mt-1 h-[12px] w-full overflow-hidden rounded-full" style={{ background: TRILHO }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.round((l.emBanco / Math.max(1, maior)) * 100))}%`,
                    background:
                      "linear-gradient(90deg, color-mix(in srgb, var(--warn) 45%, transparent), var(--warn))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Card de contagem: RÓTULO em cima, VALOR grande embaixo. `textoValor` troca o número por um texto
 * ("Meta não definida", "não informado") onde um zero mentiria. `quebra` é a linha curta de apoio.
 */
function Balde({
  rotulo,
  valor,
  cor,
  onClick,
  dica,
  quebra,
  textoValor,
}: {
  rotulo: string;
  valor: number;
  cor?: string;
  onClick?: () => void;
  dica?: string;
  textoValor?: string;
  quebra?: string;
}) {
  const conteudo = (
    <div className="flex flex-1 flex-col justify-between gap-1.5">
      <div className="text-xs leading-snug text-dim">{rotulo}</div>
      <div>
        {textoValor ? (
          <div className="text-[15px] font-semibold leading-tight text-faint">{textoValor}</div>
        ) : (
          <div className="text-[30px] font-semibold leading-none tabular-nums" style={{ color: cor }}>
            {valor}
          </div>
        )}
        {quebra && <div className="mt-1.5 text-[11px] leading-snug text-faint">{quebra}</div>}
      </div>
    </div>
  );
  const base =
    "flex min-h-[84px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5";

  if (!onClick)
    return (
      <div className={base} title={dica}>
        {conteudo}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      title={dica}
      className={`${base} cursor-pointer text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface)]`}
    >
      {conteudo}
    </button>
  );
}

interface MeioBalde {
  rotulo: string;
  valor: number;
  cor: string;
  onClick?: () => void;
  dica?: string;
}

/** Card dividido no meio: dois desfechos (declínio e banco) empilhados no espaço de um balde só. */
function BaldeDividido({ cima, baixo }: { cima: MeioBalde; baixo: MeioBalde }) {
  const meio = (m: MeioBalde, borda: boolean) => {
    const conteudo = (
      <div className="flex flex-1 flex-col justify-between gap-1">
        <div className="text-xs leading-snug text-dim">{m.rotulo}</div>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: m.cor }}>
          {m.valor}
        </div>
      </div>
    );
    const cls = `flex flex-1 flex-col px-3 py-2 ${borda ? "border-b border-[var(--border)]" : ""}`;
    if (!m.onClick)
      return (
        <div className={cls} title={m.dica}>
          {conteudo}
        </div>
      );
    return (
      <button
        type="button"
        onClick={m.onClick}
        title={m.dica}
        className={`${cls} w-full cursor-pointer text-left transition hover:bg-[var(--surface)]`}
      >
        {conteudo}
      </button>
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
      {meio(cima, true)}
      {meio(baixo, false)}
    </div>
  );
}

/* ─ A TABELA ÚNICA POR CARGO (§A.12/§A.20/§A.29), reusada por grupo e projeto ──────────────────── */

function TabelaPorCargo({ linhas, total }: { linhas: LinhaCargoTabela[]; total: TotalCargoTabela }) {
  const colunas = useMemo<ColOrd<LinhaCargoTabela>[]>(
    () => [
      { chave: "cargo", tipo: "texto", valor: (l) => l.cargoNome },
      { chave: "vagas", tipo: "numero", valor: (l) => l.vagas },
      { chave: "naEsteira", tipo: "numero", valor: (l) => l.naEsteira },
      { chave: "concluidas", tipo: "numero", valor: (l) => l.concluidas },
      { chave: "emAndamento", tipo: "numero", valor: (l) => l.emAndamento },
      { chave: "faltam", tipo: "numero", valor: (l) => l.faltam },
      { chave: "pausadas", tipo: "numero", valor: (l) => l.pausadas },
      { chave: "declinios", tipo: "numero", valor: (l) => l.declinios },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, linhas);

  return (
    <div className="overflow-x-auto">
      <table className="ds-table w-full min-w-[920px] table-fixed">
        <thead>
          <tr>
            <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[240px]">
              Cargo
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="vagas" className="w-[110px]">
              Vagas
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="naEsteira" className="w-[120px]">
              Na Esteira
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="concluidas" className="w-[120px]">
              Concluídas
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="emAndamento" className="w-[140px]">
              Em Andamento
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="faltam" className="w-[120px]">
              Faltam
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="pausadas" className="w-[110px]">
              Pausadas
            </ColunaOrdenavel>
            <ColunaOrdenavel as="th" ord={ord} chave="declinios" className="w-[110px]">
              Declínios
            </ColunaOrdenavel>
          </tr>
        </thead>
        <tbody>
          {ord.itens.map((l) => (
            <tr key={l.cargoId ?? l.cargoNome}>
              <td className="font-semibold">{l.cargoNome}</td>
              <td className="text-center tabular-nums">
                {l.vagas === null ? <NaoInformado /> : l.vagas}
              </td>
              <td className="text-center tabular-nums">{l.naEsteira}</td>
              <td className="text-center font-semibold tabular-nums">{l.concluidas}</td>
              <td className="text-center tabular-nums">{l.emAndamento}</td>
              <td
                className="text-center font-semibold tabular-nums"
                style={l.faltam !== null && l.faltam < 0 ? { color: "var(--accent)" } : undefined}
                title={
                  l.faltam !== null && l.faltam < 0 ? `${-l.faltam} além da meta deste cargo` : undefined
                }
              >
                {l.faltam === null ? <NaoInformado /> : l.faltam}
              </td>
              <td className="text-center tabular-nums">{l.pausadas}</td>
              <td className="text-center tabular-nums">{l.declinios}</td>
            </tr>
          ))}
          <tr className="bg-[var(--surface)]">
            <td className="font-semibold">Total</td>
            <td className="text-center font-semibold tabular-nums">
              {total.vagas === null ? <NaoInformado /> : total.vagas}
            </td>
            <td className="text-center font-semibold tabular-nums">{total.naEsteira}</td>
            <td className="text-center font-semibold tabular-nums">{total.concluidas}</td>
            <td className="text-center font-semibold tabular-nums">{total.emAndamento}</td>
            <td className="text-center font-semibold tabular-nums">
              {total.faltam === null ? <NaoInformado /> : total.faltam}
            </td>
            <td className="text-center font-semibold tabular-nums">{total.pausadas}</td>
            <td className="text-center font-semibold tabular-nums">{total.declinios}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ─ CARD DE INDICADORES: GRUPO ────────────────────────────────────────────────────────────────── */

function CardGrupo({ a }: { a: AnaliseGrupo }) {
  const temMeta = a.totais.meta != null && a.totais.meta > 0;
  const pct = temMeta ? percentualDe(a.totais.naEsteira, a.totais.meta as number) : 0;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <GlassCard className="p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[17px] font-semibold text-text">{a.grupo.nome}</h2>
          <span className="text-sm text-dim">grupo de cliente</span>
        </div>

        {a.totais.meta == null && (
          <p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-faint">
            Este grupo ainda não tem meta definida, então as vagas que faltam ficam como não informado.{" "}
            <Link href="/admin/clientes" className="font-semibold text-accent hover:underline">
              Definir no cadastro de grupos
            </Link>
            .
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
          {a.totais.meta == null ? (
            <Balde rotulo="Total De Vagas Da Meta" valor={0} textoValor="Meta não definida" />
          ) : (
            <Balde rotulo="Total De Vagas Da Meta" valor={a.totais.meta} />
          )}
          <Balde
            rotulo="Total De Vagas Na Esteira"
            valor={a.totais.naEsteira}
            quebra={`${a.totais.ativos} ativos, ${a.totais.emBanco} em banco`}
            dica="Admissões vivas do grupo. O banco fica visível mas fora da conta da meta"
          />
          <Balde
            rotulo="Total De Admissões Concluídas"
            valor={a.totais.concluidas}
            cor="var(--ok)"
            dica="Cadastro concluído e sem integração pendente, a mesma régua do Gerenciador"
          />
          <Balde
            rotulo="Total Em Andamento"
            valor={a.totais.emAndamento}
            cor="var(--accent)"
            dica="Admissões do grupo em processo vivo que ainda não concluíram"
          />
          {a.totais.faltam == null ? (
            <Balde rotulo="Total De Vagas Que Faltam" valor={0} textoValor="não informado" cor="var(--warn)" />
          ) : (
            <Balde
              rotulo="Total De Vagas Que Faltam"
              valor={a.totais.faltam}
              cor="var(--warn)"
              dica="Meta do grupo menos o que já está na esteira"
            />
          )}
          <BaldeDividido
            cima={{ rotulo: "Declínios", valor: a.totais.declinios, cor: "var(--danger)" }}
            baixo={{ rotulo: "Em Banco", valor: a.totais.emBanco, cor: "var(--warn)" }}
          />
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col justify-between p-4">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">% Total Entregue</h3>
        {!temMeta ? (
          <div className="my-3">
            <span className="text-[15px] font-semibold leading-tight text-faint">Meta não definida</span>
            <p className="mt-1.5 text-xs text-faint">
              Defina a meta do grupo para acompanhar o percentual entregue.
            </p>
          </div>
        ) : (
          <>
            <div className="my-3">
              <span
                className="text-[34px] font-semibold leading-none tabular-nums"
                style={{ color: corDoPreenchimento(pct) }}
              >
                {pct}%
              </span>
            </div>
            <div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, pct)}%`, background: corDoPreenchimento(pct) }}
                />
              </div>
              <p className="mt-1.5 text-xs text-faint">
                {a.totais.naEsteira} de {a.totais.meta} vagas da meta
              </p>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

/* ─ CARD DE INDICADORES: PROJETO (com termômetro e os modais de declínio/banco) ───────────────── */

function CardProjeto({ dados }: { dados: Analise }) {
  const [modalDeclinios, setModalDeclinios] = useState(false);
  const [modalBanco, setModalBanco] = useState(false);

  const t = dados.termometro;
  const naoIniciou = (t.diasParaInicio ?? 0) > 0;
  const coberturaGeral = percentualDe(dados.totais.vinculadas, dados.totais.vagas);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_210px_320px]">
        <GlassCard className="p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[17px] font-semibold text-text">{dados.projeto.nome}</h2>
            <span className="text-sm text-dim">
              {rotuloCliente(
                dados.projeto.codCliente,
                dados.projeto.clienteNomeOperacao,
                dados.projeto.clienteRazaoSocial,
              )}
            </span>
            <span className="ml-auto text-sm text-dim">
              {fmtData(dados.projeto.dataInicio)} a {fmtData(dados.projeto.dataFim)}
            </span>
          </div>

          <p className="mb-3 text-xs text-faint">
            a conta fecha no total de vagas: em andamento + concluídas + faltam = {dados.totais.vagas}.
            tudo conta quem está vinculado a este projeto. declínios ficam fora da conta e contam o
            cliente {dados.projeto.codCliente} no período, como informação separada
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <Balde rotulo="Total De Vagas Do Projeto" valor={dados.totais.vagas} />
            <Balde
              rotulo="Total De Vagas Na Esteira"
              valor={dados.totais.vinculadas}
              quebra={`${dados.totais.vinculadas} ativos, ${dados.totais.emBanco} em banco`}
              dica={`${dados.totais.vinculadas} em processamento ativo e ${dados.totais.emBanco} aguardando em banco. O banco fica visível mas fora da conta das vagas: quem está em banco não é dono de vaga, então a vaga volta a faltar`}
            />
            <Balde
              rotulo="Total De Admissões Concluídas"
              valor={dados.totais.concluidas}
              cor="var(--ok)"
              dica="Cadastro concluído e sem integração pendente, a mesma régua do Gerenciador"
            />
            <Balde
              rotulo="Total Em Andamento"
              valor={dados.totais.emAndamento}
              cor="var(--accent)"
              dica="Vinculadas em processo vivo que ainda não concluíram"
            />
            <Balde
              rotulo="Total De Vagas Que Faltam"
              valor={dados.totais.faltam}
              cor="var(--warn)"
              dica="Total de vagas menos as concluídas e as que estão em andamento"
            />
            <BaldeDividido
              cima={{
                rotulo: "Declínios",
                valor: dados.totais.declinios,
                cor: "var(--danger)",
                onClick: dados.totais.declinios > 0 ? () => setModalDeclinios(true) : undefined,
                dica:
                  dados.totais.declinios > 0
                    ? "Ver o peso dos declínios no projeto e quais cargos mais declinaram"
                    : undefined,
              }}
              baixo={{
                rotulo: "Em Banco",
                valor: dados.totais.emBanco,
                cor: "var(--warn)",
                onClick: dados.totais.emBanco > 0 ? () => setModalBanco(true) : undefined,
                dica: dados.totais.emBanco > 0 ? "Ver a quantidade de admissões em banco por cargo" : undefined,
              }}
            />
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col justify-between p-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">% Total Entregue</h3>
          <div className="my-3">
            <span
              className="text-[34px] font-semibold leading-none tabular-nums"
              style={{ color: corDoPreenchimento(coberturaGeral) }}
            >
              {coberturaGeral}%
            </span>
          </div>
          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, coberturaGeral)}%`, background: corDoPreenchimento(coberturaGeral) }}
              />
            </div>
            <p className="mt-1.5 text-xs text-faint">
              {dados.totais.vinculadas} de {dados.totais.vagas} vagas do projeto
            </p>
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col justify-between p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">Prazo Do Projeto</h3>
            <Pill
              tone={
                t.situacao === "ok"
                  ? "ok"
                  : t.situacao === "atencao"
                    ? "wn"
                    : t.situacao === "critico"
                      ? "or"
                      : "dg"
              }
            >
              {t.situacao === "ok"
                ? "No Prazo"
                : t.situacao === "atencao"
                  ? "Atenção"
                  : t.situacao === "critico"
                    ? "Última Semana"
                    : "Encerrado"}
            </Pill>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[34px] font-semibold leading-none tabular-nums" style={{ color: COR_TERMOMETRO[t.situacao] }}>
                {naoIniciou ? t.diasParaInicio : t.diasRestantes < 0 ? 0 : t.diasRestantes}
              </span>
              <span className="text-sm text-dim">
                {naoIniciou
                  ? t.diasParaInicio === 1
                    ? "dia útil para começar"
                    : "dias úteis para começar"
                  : t.diasRestantes < 0
                    ? "o período já terminou"
                    : t.diasRestantes === 1
                      ? "dia útil até o fim"
                      : "dias úteis até o fim"}
              </span>
            </div>
          </div>

          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, t.percentualDecorrido)}%`, background: COR_TERMOMETRO[t.situacao] }}
              />
            </div>
            {!naoIniciou && (
              <p className="mt-1.5 text-xs text-faint">
                {t.decorridos} de {t.totalDias} dias úteis do período
              </p>
            )}
          </div>
        </GlassCard>
      </div>

      {modalDeclinios && <ModalDeclinios dados={dados} onClose={() => setModalDeclinios(false)} />}
      {modalBanco && <ModalBanco dados={dados} onClose={() => setModalBanco(false)} />}
    </>
  );
}

/* ─ PREENCHIMENTO POR CARGO (barras), só projeto ──────────────────────────────────────────────── */

function BlocoBarrasProjeto({ dados }: { dados: Analise }) {
  const coberturaGeral = percentualDe(dados.totais.vinculadas, dados.totais.vagas);
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">Preenchimento Por Cargo</h3>
        <span className="text-sm text-dim">
          total de vagas do projeto, quanto já está na esteira e quanto falta para completar. o
          percentual do card é o quanto das vagas do projeto já está na esteira
        </span>
        <span className="ml-auto text-sm text-dim">
          cobertura geral: <span className="font-semibold tabular-nums text-text">{coberturaGeral}%</span>
        </span>
      </div>

      {dados.porCargo.length === 0 ? (
        <p className="py-8 text-center text-faint">
          Nenhum cargo com vaga cadastrada nem admissão vinculada neste projeto.
        </p>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
          {dados.porCargo.map((l) => (
            <BarrasDoCargo key={l.cargoId ?? "sem-cargo"} linha={l} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/* ─ ALTERNADOR DE LAYOUT (Opção 1 / Opção 2) ──────────────────────────────────────────────────── */

function AlternadorLayout({ layout, setLayout }: { layout: "1" | "2"; setLayout: (v: "1" | "2") => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {(["1", "2"] as const).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => setLayout(op)}
            aria-pressed={layout === op}
            className={cn(
              "rounded-full px-5 py-1.5 text-sm font-semibold transition",
              layout === op ? "bg-[var(--accent)] text-white" : "text-dim hover:text-text",
            )}
          >
            {op === "1" ? "Opção 1" : "Opção 2"}
          </button>
        ))}
      </div>
      <span className="text-sm text-dim">
        {layout === "1"
          ? "Empilhado: cada selecionado com o próprio card e a própria tabela por cargo."
          : "Consolidado: os cards de todos os selecionados e uma tabela por cargo somando todos."}
      </span>
    </div>
  );
}

/* ─ A PÁGINA ───────────────────────────────────────────────────────────────────────────────────── */

export default function AltoVolumeAnalisePage() {
  const { token } = useAuth();

  /** Pílula Grupo/Projeto: abre em GRUPO por padrão (decisão do diretor). */
  const [visao, setVisao] = useState<"grupo" | "projeto">("grupo");
  /** Layout da área de resultados, compartilhado pelas duas visões. */
  const [layout, setLayout] = useState<"1" | "2">("1");

  // VISÃO PROJETO: um cliente (seletor único) e vários projetos daquele cliente (multiselect).
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [codCliente, setCodCliente] = useState("");
  const [projetosSelIds, setProjetosSelIds] = useState<string[]>([]);
  const [projetoAnalises, setProjetoAnalises] = useState<Record<string, Analise>>({});
  const [carregandoProj, setCarregandoProj] = useState(false);
  const [erroProj, setErroProj] = useState<string | null>(null);

  // VISÃO GRUPO: vários grupos (multiselect).
  const [grupos, setGrupos] = useState<GrupoDaDash[]>([]);
  const [gruposSelIds, setGruposSelIds] = useState<string[]>([]);
  const [grupoAnalises, setGrupoAnalises] = useState<Record<string, AnaliseGrupo>>({});
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [erroGrupo, setErroGrupo] = useState<string | null>(null);

  const carregarProjetos = useCallback(async () => {
    try {
      const rows = await apiFetch<Projeto[]>("/admin/alto-volume", { token });
      const ativos = rows.filter((p) => p.ativo);
      setProjetos(ativos);
      // Pré-seleciona o primeiro cliente e o primeiro projeto dele, para a tela não abrir vazia.
      if (ativos.length > 0) {
        setCodCliente(ativos[0].codCliente);
        setProjetosSelIds([ativos[0].id]);
      }
    } catch (e) {
      setErroProj(e instanceof Error ? e.message : "Erro ao carregar os projetos");
    }
  }, [token]);

  const carregarGrupos = useCallback(async () => {
    try {
      const rows = await apiFetch<GrupoDaDash[]>("/admin/grupos-cliente", { token });
      const ativos = rows.filter((g) => g.ativo);
      setGrupos(ativos);
      // Pré-seleciona o primeiro grupo (decisão do diretor): a visão grupo abre por padrão.
      setGruposSelIds((atual) => (atual.length === 0 && ativos.length > 0 ? [ativos[0].id] : atual));
    } catch (e) {
      setErroGrupo(e instanceof Error ? e.message : "Erro ao carregar os grupos");
    }
  }, [token]);

  useEffect(() => {
    if (token) void carregarProjetos();
  }, [token, carregarProjetos]);
  useEffect(() => {
    if (token) void carregarGrupos();
  }, [token, carregarGrupos]);

  // Busca a análise de CADA projeto selecionado em paralelo (Promise.all). Seleção vazia limpa o mapa.
  useEffect(() => {
    if (!token || projetosSelIds.length === 0) {
      setProjetoAnalises({});
      setCarregandoProj(false);
      return;
    }
    let cancelado = false;
    setCarregandoProj(true);
    setErroProj(null);
    Promise.all(
      projetosSelIds.map((id) =>
        apiFetch<Analise>(`/admin/alto-volume/${encodeURIComponent(id)}/analise`, { token }).then(
          (a) => [id, a] as const,
        ),
      ),
    )
      .then((pares) => {
        if (!cancelado) setProjetoAnalises(Object.fromEntries(pares));
      })
      .catch((e) => {
        if (!cancelado) {
          setProjetoAnalises({});
          setErroProj(e instanceof Error ? e.message : "Erro ao carregar a análise");
        }
      })
      .finally(() => {
        if (!cancelado) setCarregandoProj(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token, projetosSelIds]);

  // O mesmo para os grupos.
  useEffect(() => {
    if (!token || gruposSelIds.length === 0) {
      setGrupoAnalises({});
      setCarregandoGrupos(false);
      return;
    }
    let cancelado = false;
    setCarregandoGrupos(true);
    setErroGrupo(null);
    Promise.all(
      gruposSelIds.map((id) =>
        apiFetch<AnaliseGrupo>(`/admin/grupos-cliente/${encodeURIComponent(id)}/analise`, { token }).then(
          (a) => [id, a] as const,
        ),
      ),
    )
      .then((pares) => {
        if (!cancelado) setGrupoAnalises(Object.fromEntries(pares));
      })
      .catch((e) => {
        if (!cancelado) {
          setGrupoAnalises({});
          setErroGrupo(e instanceof Error ? e.message : "Erro ao carregar a análise do grupo");
        }
      })
      .finally(() => {
        if (!cancelado) setCarregandoGrupos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [token, gruposSelIds]);

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of projetos) {
      if (!mapa.has(p.codCliente)) {
        mapa.set(p.codCliente, rotuloCliente(p.codCliente, p.clienteNomeOperacao, p.clienteRazaoSocial));
      }
    }
    return [...mapa].map(([value, label]) => ({ value, label }));
  }, [projetos]);

  const projetosDoCliente = useMemo(
    () => projetos.filter((p) => p.codCliente === codCliente),
    [projetos, codCliente],
  );

  /** Trocar de CLIENTE escolhe o primeiro projeto dele, para a visão não ficar vazia. */
  function escolherCliente(cod: string) {
    setCodCliente(cod);
    const primeiro = projetos.find((p) => p.codCliente === cod);
    setProjetosSelIds(primeiro ? [primeiro.id] : []);
  }

  // Itens na ORDEM da seleção, só os que já responderam.
  const grupoItens = useMemo(
    () => gruposSelIds.map((id) => grupoAnalises[id]).filter((a): a is AnaliseGrupo => Boolean(a)),
    [gruposSelIds, grupoAnalises],
  );
  const projetoItens = useMemo(
    () => projetosSelIds.map((id) => projetoAnalises[id]).filter((d): d is Analise => Boolean(d)),
    [projetosSelIds, projetoAnalises],
  );
  const grupoConsol = useMemo(() => consolidarGrupos(grupoItens), [grupoItens]);
  const projetoConsol = useMemo(() => consolidarProjetos(projetoItens), [projetoItens]);

  return (
    <>
      {/* FAIXA DO TÍTULO, a mesma do Painel: título, navegação e tema, na mesma altura. */}
      <div className="mb-3 flex items-center gap-2">
        <h1 className="mr-auto min-w-0 truncate text-[21px] font-semibold leading-tight text-text">
          Controle Gerencial
        </h1>
        <NavDiretoria />
        <div aria-hidden className="h-10 w-10 shrink-0" />
        <ThemeToggle />
      </div>

      {/* PÍLULA Grupo/Projeto (decisão do diretor): abre em GRUPO. */}
      <div className="mb-5 inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {(["grupo", "projeto"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVisao(v)}
            aria-pressed={visao === v}
            className={cn(
              "rounded-full px-5 py-1.5 text-sm font-semibold transition",
              visao === v ? "bg-[var(--accent)] text-white" : "text-dim hover:text-text",
            )}
          >
            {v === "grupo" ? "Grupo" : "Projeto"}
          </button>
        ))}
      </div>

      {/* ══════════════ VISÃO POR GRUPO DE CLIENTE ══════════════ */}
      {visao === "grupo" && (
        <>
          <p className="mb-5 text-sm text-dim">
            Como os grupos de cliente estão indo: a meta de vagas de cada grupo e a situação das
            admissões dos CNPJs que ele reúne. O grupo não tem período, então aqui não há termômetro.
          </p>

          <GlassCard className="mb-5 flex flex-wrap items-center gap-3 p-4">
            <label className="flex items-start gap-2 text-sm text-dim">
              <span className="mt-2 whitespace-nowrap">Grupos</span>
              <div className="min-w-[320px]">
                <MultiSelect
                  values={gruposSelIds}
                  onChange={setGruposSelIds}
                  placeholder="Selecione um ou mais grupos"
                  ariaLabel="Grupos de cliente"
                  options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
                />
              </div>
            </label>
          </GlassCard>

          <AlternadorLayout layout={layout} setLayout={setLayout} />

          {erroGrupo && (
            <p
              className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erroGrupo}
            </p>
          )}

          {grupos.length === 0 ? (
            <GlassCard className="p-8 text-center text-faint">
              Nenhum grupo de cliente ativo para analisar. Cadastre um grupo na tela de Clientes.
            </GlassCard>
          ) : gruposSelIds.length === 0 ? (
            <GlassCard className="p-8 text-center text-faint">Selecione um ou mais grupos.</GlassCard>
          ) : carregandoGrupos && grupoItens.length === 0 ? (
            <GlassCard className="p-8 text-center text-faint">Carregando a análise…</GlassCard>
          ) : layout === "1" ? (
            grupoItens.map((a) => (
              <div key={a.grupo.id} className="mb-8">
                <CardGrupo a={a} />
                <GlassCard className="mt-4 overflow-hidden p-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-2 pt-1">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">Por Cargo</h3>
                    <span className="text-sm text-dim">
                      {a.grupo.nome}. Vagas e Faltam não existem por cargo no grupo: a meta é do grupo
                      inteiro e aparece só no Total.
                    </span>
                  </div>
                  <TabelaPorCargo linhas={linhasCargoDoGrupo(a)} total={totalCargoDoGrupo(a)} />
                </GlassCard>
              </div>
            ))
          ) : (
            <>
              <div className="mb-6 space-y-5">
                {grupoItens.map((a) => (
                  <CardGrupo key={a.grupo.id} a={a} />
                ))}
              </div>
              <GlassCard className="mb-5 overflow-hidden p-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-2 pt-1">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                    Por Cargo, Consolidado
                  </h3>
                  <span className="text-sm text-dim">
                    soma dos {grupoItens.length} grupos selecionados. Vagas e Faltam por cargo ficam
                    como não informado; a meta total aparece só no Total.
                  </span>
                </div>
                <TabelaPorCargo linhas={grupoConsol.linhas} total={grupoConsol.total} />
              </GlassCard>
            </>
          )}
        </>
      )}

      {/* ══════════════ VISÃO POR PROJETO ══════════════ */}
      {visao === "projeto" && (
        <>
          <p className="mb-5 text-sm text-dim">
            Como os projetos estão indo: preenchimento por cargo, situação das admissões e quanto tempo
            resta até o fim do período de cada um.
          </p>

          <GlassCard className="mb-5 flex flex-wrap items-center gap-3 p-4">
            <label className="flex items-center gap-2 text-sm text-dim">
              <span className="whitespace-nowrap">Cliente</span>
              <div className="min-w-[300px]">
                <Select
                  value={codCliente}
                  onChange={escolherCliente}
                  placeholder="Cliente"
                  ariaLabel="Cliente do projeto"
                  searchable
                  menuFit
                  options={clientes}
                />
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm text-dim">
              <span className="mt-2 whitespace-nowrap">Projetos</span>
              <div className="min-w-[300px]">
                <MultiSelect
                  values={projetosSelIds}
                  onChange={setProjetosSelIds}
                  placeholder="Selecione um ou mais projetos"
                  ariaLabel="Projetos de alto volume"
                  options={projetosDoCliente.map((p) => ({ value: p.id, label: p.nome }))}
                />
              </div>
            </label>
          </GlassCard>

          <AlternadorLayout layout={layout} setLayout={setLayout} />

          {erroProj && (
            <p
              className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erroProj}
            </p>
          )}

          {projetos.length === 0 ? (
            <GlassCard className="p-8 text-center text-faint">
              Nenhum projeto ativo para analisar. Cadastre um projeto no Alto Volume.
            </GlassCard>
          ) : projetosSelIds.length === 0 ? (
            <GlassCard className="p-8 text-center text-faint">
              Selecione um cliente e seus projetos.
            </GlassCard>
          ) : carregandoProj && projetoItens.length === 0 ? (
            <GlassCard className="p-8 text-center text-faint">Carregando a análise…</GlassCard>
          ) : layout === "1" ? (
            projetoItens.map((d) => (
              <div key={d.projeto.id} className="mb-8 space-y-4">
                <CardProjeto dados={d} />
                <BlocoBarrasProjeto dados={d} />
                <GlassCard className="overflow-hidden p-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-2 pt-1">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">Por Cargo</h3>
                    <span className="text-sm text-dim">{d.projeto.nome}</span>
                  </div>
                  <TabelaPorCargo linhas={linhasCargoDoProjeto(d)} total={totalCargoDoProjeto(d)} />
                </GlassCard>
              </div>
            ))
          ) : (
            <>
              <div className="mb-6 space-y-5">
                {projetoItens.map((d) => (
                  <CardProjeto key={d.projeto.id} dados={d} />
                ))}
              </div>
              <GlassCard className="mb-5 overflow-hidden p-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 pb-2 pt-1">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                    Por Cargo, Consolidado
                  </h3>
                  <span className="text-sm text-dim">
                    soma dos {projetoItens.length} projetos selecionados. Faltam por cargo é o total de
                    vagas menos o que já está na esteira.
                  </span>
                </div>
                <TabelaPorCargo linhas={projetoConsol.linhas} total={projetoConsol.total} />
              </GlassCard>
            </>
          )}
        </>
      )}
    </>
  );
}
