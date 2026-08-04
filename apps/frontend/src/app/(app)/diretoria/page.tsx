"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GlassCard } from "@/components/ui/GlassCard";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { deveCompararAnos } from "@/lib/comparativo-anual";
import { cn } from "@/lib/cn";

/**
 * CONTROLE GERENCIAL (OST do dashboard executivo + os 8 ajustes do diretor).
 *
 * UMA PÁGINA, SEM ROLAR. A altura é fechada em `calc(100vh - 68px)` (o respiro do AppShell) e
 * dividida em três faixas proporcionais: KPIs, cinco tabelas e dois gráficos. Quem rola é o CORPO de
 * cada tabela, nunca a página: é assim que 210 clientes e 284 cargos cabem numa tela só.
 *
 * TUDO É FILTRO E TUDO SE RELACIONA (regra central do diretor). Clicar num CARD DE KPI, numa linha de
 * tabela ou numa coluna de gráfico acrescenta aquele recorte ao filtro, o painel inteiro é recarregado
 * e todos os números passam a falar do mesmo conjunto. Clicar de novo no mesmo item desfaz. Os filtros
 * combinam. O card "Admissões Trabalhadas" é o LIMPAR TUDO: ele representa o conjunto inteiro, então
 * clicar nele zera qualquer recorte (decisão do diretor).
 *
 * OS FILTROS DE FORMULÁRIO VIVEM NUM MODAL, aberto pelo ícone de filtro no canto superior direito
 * (`FiltroTrigger`, o mesmo componente da Esteira, do Gerenciador e das Não Conformidades). Os
 * seletores usam `menuFit`, que dimensiona a lista pelo MAIOR rótulo: nome de cliente e de cargo
 * chegam a 61 caracteres e apareciam cortados quando a lista herdava a largura do campo.
 *
 * CORES: só tokens do sistema (`--ok`, `--danger`, `--accent`, `--warn`), que já existem nos dois
 * temas. Nada de cor fixa, então claro e escuro saem de graça.
 */
interface LinhaSegmento {
  chave: string;
  rotulo: string;
  total: number;
}
interface Painel {
  kpis: {
    trabalhadas: number;
    aguardandoLiberacao: number;
    emAdmissao: number;
    ativos: number;
    declinios: number;
  };
  segmentos: {
    cliente: LinhaSegmento[];
    farol: LinhaSegmento[];
    contrato: LinhaSegmento[];
    exame: LinhaSegmento[];
    cargo: LinhaSegmento[];
  };
  series: {
    porDia: { dia: number; total: number }[];
    mesAMes: { mes: number; atual: number; anterior: number }[];
  };
  anoCorrente: number;
}

/** Os filtros que o painel entende. Todos opcionais e combináveis. */
interface Filtros {
  de?: string;
  ate?: string;
  codCliente?: string;
  /** Um farol, ou vários separados por vírgula quando o recorte vem de um card de KPI. */
  farol?: string;
  contrato?: string;
  exame?: string;
  cargoId?: string;
  dia?: number;
  mes?: number;
  ano?: number;
}

/** Rótulo de tela de cada farol. Os VALORES são os do enum do sistema, sem invenção. */
const ROTULO_FAROL: Record<string, string> = {
  EM_ADMISSAO: "Em Admissão",
  BANCO_AGUARDAR: "Banco, Aguardar",
  ADMISSAO_CONCLUIDA: "Admissão Concluída",
  DECLINOU: "Declinou",
  RESCISAO: "Rescisão",
  AGUARDANDO_LIBERACAO: "Aguardando Liberação",
  LIBERACAO_RECUSADA: "Liberação Recusada",
};

/**
 * O RECORTE DE CADA CARD DE KPI, e por que ele pode ser uma LISTA de faróis.
 *
 * Cada card conta uma fatia do farol, e um deles conta mais de um valor. O card só pode filtrar
 * EXATAMENTE o que conta, senão o número do card e o número do painel filtrado se contradizem: clicar
 * em "Em Admissão" com 147 e ver o painel responder 146 é o tipo de divergência que derruba a
 * confiança no painel inteiro. Por isso o filtro `farol` do backend aceita lista.
 *
 * "Aguardando Liberação" NÃO leva `LIBERACAO_RECUSADA` junto: recusa é desfecho encerrado, não
 * espera, e somá-la mostrava no painel pré-admissões "a liberar" que já tinham sido tratadas
 * (correção pedida pelo diretor). O backend conta a mesma coisa, e a recusa segue visível na tabela
 * de Farol, onde é um status real e clicável.
 */
const KPI_FAROL = {
  aguardandoLiberacao: "AGUARDANDO_LIBERACAO",
  emAdmissao: "EM_ADMISSAO,BANCO_AGUARDAR",
  ativos: "ADMISSAO_CONCLUIDA",
  declinios: "DECLINOU",
} as const;

/**
 * Cor SEMÂNTICA de cada status, nos tokens do sistema: verde é desfecho bom, vermelho é encerrado
 * sem admissão, azul é em andamento, amarelo é espera. Vale igual nos dois temas.
 */
const TOM_FAROL: Record<string, string> = {
  ADMISSAO_CONCLUIDA: "var(--ok)",
  DECLINOU: "var(--danger)",
  RESCISAO: "var(--danger)",
  EM_ADMISSAO: "var(--accent)",
  BANCO_AGUARDAR: "var(--warn)",
  AGUARDANDO_LIBERACAO: "var(--warn)",
  LIBERACAO_RECUSADA: "var(--danger)",
};
const TOM_EXAME: Record<string, string> = {
  APTO: "var(--ok)",
  CANCELADO: "var(--danger)",
  A_AGENDAR: "var(--warn)",
  AGENDADO: "var(--accent)",
  ASO_PENDENTE: "var(--warn-2)",
};

const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Quebra o filtro de farol (um valor ou vários) na lista de faróis que ele representa. */
function listaFarol(valor?: string): string[] {
  return (valor ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function ControleGerencialPage() {
  const { token } = useAuth();
  const [dados, setDados] = useState<Painel | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(filtros)) {
        if (v !== undefined && v !== "") q.set(k, String(v));
      }
      setDados(await apiFetch<Painel>(`/gerencial?${q.toString()}`, { token }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Liga/desliga um filtro. Clicar no item já ativo desfaz, que é como se navega sem sair da tela. */
  const alternar = useCallback((campo: keyof Filtros, valor: string | number | undefined) => {
    setFiltros((atual) => {
      const igual = atual[campo] === valor;
      const novo = { ...atual };
      if (igual || valor === undefined || valor === "") delete novo[campo];
      else (novo as Record<string, unknown>)[campo] = valor;
      // Mês e ano andam juntos: sem o ano, "março" seria março de qualquer ano.
      if (campo === "mes" && (igual || valor === undefined)) delete novo.ano;
      return novo;
    });
  }, []);

  const limparTudo = useCallback(() => setFiltros({}), []);

  const semFiltro = Object.keys(filtros).length === 0;
  const faroisAtivos = useMemo(() => listaFarol(filtros.farol), [filtros.farol]);

  const filtrosAtivos = useMemo(() => {
    const itens: { campo: keyof Filtros; texto: string }[] = [];
    const s = dados?.segmentos;
    if (filtros.de || filtros.ate) {
      itens.push({
        campo: "de",
        texto: `Período ${filtros.de ?? "início"} a ${filtros.ate ?? "hoje"}`,
      });
    }
    if (filtros.codCliente) {
      const r = s?.cliente.find((l) => l.chave === filtros.codCliente)?.rotulo ?? filtros.codCliente;
      itens.push({ campo: "codCliente", texto: `Cliente: ${r}` });
    }
    if (faroisAtivos.length > 0) {
      const r = faroisAtivos.map((f) => ROTULO_FAROL[f] ?? f).join(" + ");
      itens.push({ campo: "farol", texto: `Farol: ${r}` });
    }
    if (filtros.contrato) {
      const r = s?.contrato.find((l) => l.chave === filtros.contrato)?.rotulo ?? filtros.contrato;
      itens.push({ campo: "contrato", texto: `Contrato: ${r}` });
    }
    if (filtros.exame) {
      const r = s?.exame.find((l) => l.chave === filtros.exame)?.rotulo ?? filtros.exame;
      itens.push({ campo: "exame", texto: `Exame: ${r}` });
    }
    if (filtros.cargoId) {
      const r = s?.cargo.find((l) => l.chave === filtros.cargoId)?.rotulo ?? "cargo";
      itens.push({ campo: "cargoId", texto: `Cargo: ${r}` });
    }
    if (filtros.dia) itens.push({ campo: "dia", texto: `Dia ${filtros.dia}` });
    if (filtros.mes) {
      itens.push({ campo: "mes", texto: `${MES_CURTO[filtros.mes - 1]}${filtros.ano ? `/${filtros.ano}` : ""}` });
    }
    return itens;
  }, [filtros, faroisAtivos, dados]);

  /** Contagem do badge do ícone: só os filtros que MORAM no modal (o padrão das demais telas). */
  const filtrosModal =
    (filtros.de || filtros.ate ? 1 : 0) +
    (filtros.codCliente ? 1 : 0) +
    (filtros.farol ? 1 : 0) +
    (filtros.contrato ? 1 : 0) +
    (filtros.exame ? 1 : 0) +
    (filtros.cargoId ? 1 : 0);

  const k = dados?.kpis;

  return (
    <div className="flex h-[calc(100vh-68px)] flex-col gap-3 overflow-hidden">
      {/* ── FAIXA 0: título, filtros e tema ──────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <h1 className="mr-auto min-w-0 truncate text-[21px] font-semibold leading-tight text-text">
          Controle Gerencial
        </h1>

        <FiltroTrigger count={filtrosModal} onLimpar={limparTudo} className="!h-10 !w-10">
          <FiltroCampo label="Período">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="Período de"
                className="ds-input"
                value={filtros.de ?? ""}
                max={filtros.ate || undefined}
                onChange={(e) => setFiltros((f) => ({ ...f, de: e.target.value || undefined }))}
              />
              <input
                type="date"
                aria-label="Período até"
                className="ds-input"
                value={filtros.ate ?? ""}
                min={filtros.de || undefined}
                onChange={(e) => setFiltros((f) => ({ ...f, ate: e.target.value || undefined }))}
              />
            </div>
          </FiltroCampo>
          <FiltroCampo label="Cliente">
            <Select
              value={filtros.codCliente ?? ""}
              onChange={(v) => alternar("codCliente", v || undefined)}
              placeholder="Todos"
              ariaLabel="Filtrar por cliente"
              menuFit
              options={(dados?.segmentos.cliente ?? []).map((l) => ({ value: l.chave, label: l.rotulo }))}
            />
          </FiltroCampo>
          <FiltroCampo label="Farol">
            <Select
              value={filtros.farol ?? ""}
              onChange={(v) => alternar("farol", v || undefined)}
              placeholder="Todos"
              ariaLabel="Filtrar por farol"
              menuFit
              options={(dados?.segmentos.farol ?? []).map((l) => ({
                value: l.chave,
                label: ROTULO_FAROL[l.chave] ?? l.rotulo,
                color: TOM_FAROL[l.chave],
              }))}
            />
          </FiltroCampo>
          <FiltroCampo label="Contrato">
            <Select
              value={filtros.contrato ?? ""}
              onChange={(v) => alternar("contrato", v || undefined)}
              placeholder="Todos"
              ariaLabel="Filtrar por contrato"
              menuFit
              options={(dados?.segmentos.contrato ?? []).map((l) => ({ value: l.chave, label: l.rotulo }))}
            />
          </FiltroCampo>
          <FiltroCampo label="Exame Admissional">
            <Select
              value={filtros.exame ?? ""}
              onChange={(v) => alternar("exame", v || undefined)}
              placeholder="Todos"
              ariaLabel="Filtrar por exame"
              menuFit
              options={(dados?.segmentos.exame ?? []).map((l) => ({
                value: l.chave,
                label: l.rotulo,
                color: TOM_EXAME[l.chave],
              }))}
            />
          </FiltroCampo>
          <FiltroCampo label="Cargo">
            <Select
              value={filtros.cargoId ?? ""}
              onChange={(v) => alternar("cargoId", v || undefined)}
              placeholder="Todos"
              ariaLabel="Filtrar por cargo"
              menuFit
              options={(dados?.segmentos.cargo ?? []).map((l) => ({ value: l.chave, label: l.rotulo }))}
            />
          </FiltroCampo>
        </FiltroTrigger>

        <ThemeToggle />
      </div>

      {/* Filtros ativos: o recorte fica explícito e some com um clique. */}
      {filtrosAtivos.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          {filtrosAtivos.map((f) => (
            <button
              key={f.campo}
              type="button"
              onClick={() => {
                setFiltros((atual) => {
                  const novo = { ...atual };
                  delete novo[f.campo];
                  if (f.campo === "de") delete novo.ate;
                  if (f.campo === "mes") delete novo.ano;
                  return novo;
                });
              }}
              className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11.5px] text-dim transition hover:border-border-strong hover:text-text"
              title="Remover este filtro"
            >
              {f.texto}
              <span className="text-[13px] leading-none text-faint">x</span>
            </button>
          ))}
          <button
            type="button"
            onClick={limparTudo}
            className="rounded-full px-2 py-0.5 text-[11.5px] text-faint underline-offset-2 hover:text-text hover:underline"
          >
            limpar tudo
          </button>
        </div>
      )}

      {erro && <div className="text-[12.5px] text-danger">{erro}</div>}

      {/* ── FAIXA 1: os cinco KPIs, cada um é um filtro ──────────────────────── */}
      <div className="grid shrink-0 grid-cols-5 gap-3">
        <Kpi
          icon="layers"
          valor={k?.trabalhadas}
          rotulo="Admissões Trabalhadas"
          tom="var(--accent)"
          // O conjunto inteiro: clicar aqui é o "limpar tudo" (decisão do diretor).
          selecionado={semFiltro}
          onClick={limparTudo}
          dica="Selecionar todas as admissões e limpar os filtros"
        />
        <Kpi
          icon="clock"
          valor={k?.aguardandoLiberacao}
          rotulo="Aguardando Liberação"
          tom="var(--warn)"
          selecionado={filtros.farol === KPI_FAROL.aguardandoLiberacao}
          onClick={() => alternar("farol", KPI_FAROL.aguardandoLiberacao)}
          dica="Filtrar as pré-admissões aguardando liberação"
        />
        <Kpi
          icon="doc"
          valor={k?.emAdmissao}
          rotulo="Em Admissão"
          tom="var(--accent-vivid)"
          selecionado={filtros.farol === KPI_FAROL.emAdmissao}
          onClick={() => alternar("farol", KPI_FAROL.emAdmissao)}
          dica="Filtrar as admissões em andamento"
        />
        <Kpi
          icon="check"
          valor={k?.ativos}
          rotulo="Total De Ativos"
          tom="var(--ok)"
          destaque
          selecionado={filtros.farol === KPI_FAROL.ativos}
          onClick={() => alternar("farol", KPI_FAROL.ativos)}
          dica="Filtrar as admissões concluídas"
        />
        <Kpi
          icon="x"
          valor={k?.declinios}
          rotulo="Total De Declínios"
          tom="var(--danger)"
          selecionado={filtros.farol === KPI_FAROL.declinios}
          onClick={() => alternar("farol", KPI_FAROL.declinios)}
          dica="Filtrar as admissões declinadas"
        />
      </div>

      {/* ── FAIXA 2: as cinco segmentações ───────────────────────────────────── */}
      <div className="grid min-h-0 flex-[1.15] grid-cols-5 gap-3">
        <Tabela
          titulo="Cliente"
          linhas={dados?.segmentos.cliente ?? []}
          ativos={filtros.codCliente ? [filtros.codCliente] : []}
          onClick={(c) => alternar("codCliente", c)}
        />
        <Tabela
          titulo="Farol"
          linhas={(dados?.segmentos.farol ?? []).map((l) => ({ ...l, rotulo: ROTULO_FAROL[l.chave] ?? l.rotulo }))}
          ativos={faroisAtivos}
          onClick={(c) => alternar("farol", c)}
          tons={TOM_FAROL}
        />
        <Tabela
          titulo="Contrato"
          linhas={dados?.segmentos.contrato ?? []}
          ativos={filtros.contrato ? [filtros.contrato] : []}
          onClick={(c) => alternar("contrato", c)}
        />
        <Tabela
          titulo="Exame Admissional"
          linhas={dados?.segmentos.exame ?? []}
          ativos={filtros.exame ? [filtros.exame] : []}
          onClick={(c) => alternar("exame", c)}
          tons={TOM_EXAME}
        />
        <Tabela
          titulo="Cargo"
          linhas={dados?.segmentos.cargo ?? []}
          ativos={filtros.cargoId ? [filtros.cargoId] : []}
          onClick={(c) => alternar("cargoId", c)}
        />
      </div>

      {/* ── FAIXA 3: os dois gráficos ────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <GraficoDia
          serie={dados?.series.porDia ?? []}
          ativo={filtros.dia}
          onClick={(d) => alternar("dia", d)}
        />
        <GraficoMes
          serie={dados?.series.mesAMes ?? []}
          anoCorrente={dados?.anoCorrente ?? new Date().getFullYear()}
          ativo={filtros.mes}
          onClick={(m, ano) => {
            setFiltros((atual) => {
              if (atual.mes === m) {
                const novo = { ...atual };
                delete novo.mes;
                delete novo.ano;
                return novo;
              }
              return { ...atual, mes: m, ano };
            });
          }}
        />
      </div>

      {carregando && !dados && <div className="text-[12.5px] text-dim">Carregando o painel…</div>}
    </div>
  );
}

/**
 * Um KPI grande, e também um FILTRO (ajuste 4 do diretor): clicar recorta o painel inteiro pelo que
 * o card conta, clicar de novo desfaz. O card de "Total De Ativos" mantém o anel verde de identidade
 * aprovado; a SELEÇÃO é marcada de outro jeito (moldura na cor do card e ícone sólido), para os dois
 * estados não se confundirem.
 */
function Kpi({
  icon,
  valor,
  rotulo,
  tom,
  destaque,
  selecionado,
  onClick,
  dica,
}: {
  icon: IconName;
  valor?: number;
  rotulo: string;
  tom: string;
  destaque?: boolean;
  selecionado: boolean;
  onClick: () => void;
  dica: string;
}) {
  const anel = selecionado || destaque;
  return (
    <GlassCard
      as="button"
      type="button"
      onClick={onClick}
      title={dica}
      aria-pressed={selecionado}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 text-left transition !p-3.5",
        anel && "!border-2",
        !selecionado && "hover:!border-[var(--border-strong)]",
      )}
      style={
        anel
          ? {
              borderColor: tom,
              boxShadow: selecionado
                ? `0 0 0 3px color-mix(in srgb, ${tom} 28%, transparent), 0 10px 30px -12px ${tom}`
                : `0 10px 30px -12px ${tom}`,
            }
          : undefined
      }
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition"
        style={
          selecionado
            ? { background: tom, color: "#fff" }
            : { background: `color-mix(in srgb, ${tom} 16%, transparent)`, color: tom }
        }
      >
        <Icon name={icon} />
      </div>
      <div className="min-w-0">
        <div className="font-manrope text-[26px] font-bold leading-none text-text">
          {/* Placeholder de carregamento. Nunca travessão (§A.11). */}
          {valor === undefined ? "..." : fmt(valor)}
        </div>
        {/* Sem `truncate` e sem tracking largo de propósito: o rótulo mais longo ("Admissões
            Trabalhadas") não cabia numa linha e vinha cortado, o que a §A.20 proíbe. Aqui ele
            quebra em duas linhas em vez de sumir. */}
        <div className="mt-1 text-[11.5px] uppercase leading-tight text-dim">{rotulo}</div>
      </div>
    </GlassCard>
  );
}

/**
 * Tabela de segmentação: maior para menor, com mini-barra por linha. O corpo rola sozinho, então a
 * lista inteira (210 clientes, 284 cargos) cabe sem a página rolar. `ativos` é uma LISTA porque o
 * farol pode vir de um card de KPI, que seleciona mais de um valor de uma vez.
 */
function Tabela({
  titulo,
  linhas,
  ativos,
  onClick,
  tons,
}: {
  titulo: string;
  linhas: LinhaSegmento[];
  ativos: string[];
  onClick: (chave: string) => void;
  tons?: Record<string, string>;
}) {
  const maior = linhas[0]?.total ?? 1;
  return (
    <GlassCard className="flex min-h-0 flex-col !p-0">
      <div className="flex shrink-0 items-baseline justify-between border-b border-border px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-text">{titulo}</h3>
        <span className="text-[11px] text-faint">{linhas.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {linhas.map((l) => {
          const cor = tons?.[l.chave] ?? "var(--accent-vivid)";
          const selecionado = ativos.includes(l.chave);
          return (
            <button
              key={l.chave}
              type="button"
              onClick={() => onClick(l.chave)}
              title={`${l.rotulo}: ${fmt(l.total)}`}
              className={cn(
                "relative block w-full border-b border-border px-3 py-1.5 text-left transition",
                selecionado ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              {/* Mini-barra que DISSOLVE no fim: proporção sem virar bloco de cor. */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 -z-[1] rounded-r"
                style={{
                  width: `${Math.max(2, (l.total / maior) * 100)}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${cor} 24%, transparent), transparent)`,
                }}
              />
              <span className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: cor }}
                  aria-hidden
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12px]",
                    selecionado ? "font-semibold text-text" : "text-dim",
                  )}
                >
                  {l.rotulo}
                </span>
                <span className="shrink-0 font-manrope text-[12.5px] font-semibold text-text">
                  {fmt(l.total)}
                </span>
              </span>
            </button>
          );
        })}
        {linhas.length === 0 && (
          <div className="px-3 py-4 text-[11.5px] text-faint">Sem dados neste recorte.</div>
        )}
      </div>
    </GlassCard>
  );
}

/**
 * A COLUNA CLICÁVEL DOS GRÁFICOS, e as duas coisas que o ajuste 6 corrigiu.
 *
 * 1. O ALVO DO CLIQUE AGORA É CONTÍGUO. Antes o respiro entre as colunas era `gap` do container, ou
 *    seja, faixa MORTA: num gráfico de 31 colunas de 17px com 3px de gap, um em cada sete cliques caía
 *    no vazio e não filtrava nada, que é exatamente o sintoma relatado. O respiro passou para DENTRO
 *    do botão, como padding: o visual é o mesmo e não existe mais pixel que não pertença a uma coluna.
 * 2. A RESPOSTA AGORA É VISÍVEL. O gráfico não filtra a si mesmo (senão a coluna clicada viraria a
 *    única do gráfico e não haveria como trocar de dia), então antes ele ficava igual depois do
 *    clique e parecia não ter acontecido nada. Agora a coluna selecionada acende e as demais apagam.
 *
 * A área de plotagem é um bloco `flex-1` PRÓPRIO, separado dos rótulos: a altura percentual da barra
 * passa a ser exata, em vez de disputar espaço com o número e ser espremida no topo da escala.
 */
function Coluna({
  onClick,
  titulo,
  selecionado,
  apagado,
  respiro,
  children,
}: {
  onClick: () => void;
  titulo: string;
  selecionado: boolean;
  apagado: boolean;
  respiro: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={selecionado}
      className={cn(
        "flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end gap-1 transition",
        respiro,
        apagado && "opacity-40 hover:opacity-90",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Valor COLADO NO TOPO DA PRÓPRIA BARRA. Zero não vira rótulo: seria ruído em 31 colunas.
 *
 * Antes o número era um item de fluxo no alto da coluna, então todos os valores se alinhavam numa
 * faixa única no topo do gráfico, longe da barra baixa que descreviam. Agora ele é filho absoluto
 * da barra, em `bottom-full`: a borda de baixo do número encosta na borda de cima da barra, então
 * ele acompanha a altura real de cada coluna. A área de plotagem reserva a altura do rótulo por
 * `padding-top` (ver PT_ROTULO), então a barra de 100% não empurra o número para fora do card, e a
 * altura percentual continua exata porque a porcentagem resolve contra o content box.
 *
 * `pointer-events-none` porque o número não quebra linha e transborda a largura da coluna: sem
 * isso, ele roubaria o clique da coluna vizinha (o alvo contíguo do ajuste 6).
 *
 * O corpo `miudo` é o do gráfico de dias, onde a coluna tem ~19px: a 9px, dois números de três
 * dígitos em colunas vizinhas encostavam um no outro. A 8px com tracking fechado eles respiram.
 */
const PT_ROTULO = "pt-[13px]";

function ValorColuna({ total, aceso, miudo }: { total: number; aceso: boolean; miudo?: boolean }) {
  if (total <= 0) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-full pb-[1px] whitespace-nowrap text-center font-semibold leading-[11px] tabular-nums",
        miudo ? "text-[8px] -tracking-[0.03em]" : "text-[9.5px]",
        aceso ? "text-text" : "text-dim",
      )}
    >
      {fmt(total)}
    </span>
  );
}

/** Colunas de 1 a 31, com o valor em cima de cada uma. */
function GraficoDia({
  serie,
  ativo,
  onClick,
}: {
  serie: { dia: number; total: number }[];
  ativo?: number;
  onClick: (dia: number) => void;
}) {
  const maior = Math.max(1, ...serie.map((s) => s.total));
  const total = serie.reduce((acc, s) => acc + s.total, 0);
  return (
    <GlassCard className="flex min-h-0 flex-col !p-3">
      <div className="mb-2 flex shrink-0 items-baseline justify-between">
        <h3 className="text-[12.5px] font-semibold text-text">Admissões Por Dia</h3>
        <span className="text-[11px] text-faint">{fmt(total)} no recorte</span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch">
        {serie.map((s) => {
          const selecionado = ativo === s.dia;
          return (
            <Coluna
              key={s.dia}
              onClick={() => onClick(s.dia)}
              titulo={`Dia ${s.dia}: ${fmt(s.total)}`}
              selecionado={selecionado}
              apagado={ativo !== undefined && !selecionado}
              respiro="px-[1.5px]"
            >
              <span className={cn("flex min-h-0 flex-1 items-end", PT_ROTULO)}>
                <span
                  className={cn(
                    "relative w-full rounded-t transition",
                    selecionado && "ring-1 ring-accent",
                  )}
                  style={{
                    height: `${Math.max(2, (s.total / maior) * 100)}%`,
                    background: selecionado
                      ? "var(--accent)"
                      : "linear-gradient(180deg, var(--accent-vivid), color-mix(in srgb, var(--accent-vivid) 25%, transparent))",
                    boxShadow: selecionado ? "0 6px 16px -6px var(--accent)" : undefined,
                  }}
                >
                  <ValorColuna total={s.total} aceso={selecionado} miudo />
                </span>
              </span>
              <span
                className={cn(
                  "text-center text-[9px] leading-[11px]",
                  selecionado ? "font-semibold text-text" : "text-faint",
                )}
              >
                {s.dia}
              </span>
            </Coluna>
          );
        })}
      </div>
    </GlassCard>
  );
}

/**
 * Mês a mês. Enquanto não houver DOIS anos com dado real no recorte, mostra só o ano corrente, e a
 * legenda acompanha (sem o ano anterior na tela).
 */
function GraficoMes({
  serie,
  anoCorrente,
  ativo,
  onClick,
}: {
  serie: { mes: number; atual: number; anterior: number }[];
  anoCorrente: number;
  ativo?: number;
  onClick: (mes: number, ano: number) => void;
}) {
  // Enquanto não houver DOIS anos com dado real, a barra do ano anterior não renderiza (a regra e o
  // porquê vivem em `lib/comparativo-anual`, com teste próprio).
  const comparar = deveCompararAnos(serie);

  const maior = Math.max(
    1,
    ...serie.flatMap((s) => (comparar ? [s.atual, s.anterior] : [s.atual])),
  );
  return (
    <GlassCard className="flex min-h-0 flex-col !p-3">
      <div className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold text-text">Mês A Mês, Admissões Trabalhadas</h3>
        <span className="flex items-center gap-2.5 text-[10.5px] text-faint">
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ background: "var(--accent-vivid)" }} />
            {anoCorrente}
          </span>
          {comparar && (
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm" style={{ background: "var(--faint)" }} />
              {anoCorrente - 1}
            </span>
          )}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch">
        {serie.map((s) => {
          const selecionado = ativo === s.mes;
          return (
            <Coluna
              key={s.mes}
              onClick={() => onClick(s.mes, anoCorrente)}
              titulo={
                comparar
                  ? `${MES_CURTO[s.mes - 1]}: ${fmt(s.atual)} em ${anoCorrente}, ${fmt(s.anterior)} em ${anoCorrente - 1}`
                  : `${MES_CURTO[s.mes - 1]}: ${fmt(s.atual)} em ${anoCorrente}`
              }
              selecionado={selecionado}
              apagado={ativo !== undefined && !selecionado}
              respiro="px-[3px]"
            >
              <span
                className={cn(
                  "flex min-h-0 flex-1 items-stretch justify-center gap-[3px]",
                  PT_ROTULO,
                )}
              >
                <span className={cn("flex h-full flex-col justify-end", comparar ? "w-1/2" : "w-3/5")}>
                  <span
                    className={cn(
                      "relative w-full rounded-t transition",
                      selecionado && "ring-1 ring-accent",
                    )}
                    style={{
                      height: `${Math.max(2, (s.atual / maior) * 100)}%`,
                      background: selecionado
                        ? "var(--accent)"
                        : "linear-gradient(180deg, var(--accent-vivid), color-mix(in srgb, var(--accent-vivid) 25%, transparent))",
                      boxShadow: selecionado ? "0 6px 16px -6px var(--accent)" : undefined,
                    }}
                  >
                    {/* Com os dois anos lado a lado a metade fica estreita, então o número usa o
                        corpo miúdo (o mesmo do gráfico de dias) para não encavalar no vizinho. */}
                    <ValorColuna total={s.atual} aceso={selecionado} miudo={comparar} />
                  </span>
                </span>
                {comparar && (
                  <span className="flex h-full w-1/2 flex-col justify-end">
                    <span
                      className="relative w-full rounded-t"
                      style={{
                        height: `${Math.max(1, (s.anterior / maior) * 100)}%`,
                        background:
                          "linear-gradient(180deg, color-mix(in srgb, var(--faint) 65%, transparent), transparent)",
                      }}
                    >
                      <ValorColuna total={s.anterior} aceso={selecionado} miudo />
                    </span>
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-center text-[10px] leading-[12px]",
                  selecionado ? "font-semibold text-text" : "text-faint",
                )}
              >
                {MES_CURTO[s.mes - 1]}
              </span>
            </Coluna>
          );
        })}
      </div>
    </GlassCard>
  );
}
