import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";

/**
 * PAINEL DA DIRETORIA (OST do dashboard executivo). Uma leitura só, agregada, sem PII.
 *
 * A REGRA CENTRAL, e o que ela impõe ao desenho: **tudo é filtro e tudo se relaciona**. Clicar numa
 * linha de tabela (um cliente, um farol, um cargo) ou numa coluna de gráfico (um dia, um mês) filtra
 * o painel INTEIRO, e os demais números recalculam. Por isso existe UM endpoint que devolve tudo a
 * partir do MESMO recorte: dois endpoints se desencontrariam na primeira combinação de filtros.
 *
 * A DATA DO EIXO É `data_admissao` (decisão do diretor), não `criado_em`. O motivo é medido: a base
 * inteira foi importada entre 13 e 30 de julho de 2026, então `criado_em` empilharia 2.400 admissões
 * em 18 dias e não diria nada. `data_admissao` é a data do negócio e cobre 99,7% das admissões; as
 * poucas sem data entram nos KPIs (que contam admissão, não dia) e ficam fora dos gráficos, porque
 * não há dia onde colocá-las.
 *
 * UM GRÁFICO NÃO FILTRA A SI MESMO. Clicar no dia 12 filtra KPIs e tabelas, mas o gráfico de dias
 * continua mostrando os 31, com o dia 12 destacado; senão a barra clicada viraria a única do gráfico
 * e não haveria como trocar de dia. Mesma regra para o mês.
 *
 * §A.6: só contagens, códigos e rótulos de catálogo (cliente, cargo, status). Nenhum dado pessoal.
 */
export interface FiltrosGerencial {
  /** Período por `data_admissao` (YYYY-MM-DD). */
  de?: string;
  ate?: string;
  codCliente?: string;
  /**
   * Farol. Aceita UM valor (clique na linha da tabela Farol) ou uma LISTA separada por vírgula
   * (clique num card de KPI). A lista existe porque três dos cinco KPIs são um CONJUNTO de faróis
   * (pré-admissões = AGUARDANDO_LIBERACAO + LIBERACAO_RECUSADA; em admissão = EM_ADMISSAO +
   * BANCO_AGUARDAR), e o card tem de filtrar exatamente o que ele conta, senão o número do card e o
   * número do painel filtrado se contradizem na cara do diretor.
   */
  farol?: string;
  tipoContrato?: string;
  /** Status da frente EXAME (APTO, CANCELADO, A_AGENDAR, ASO_PENDENTE, AGENDADO). */
  exame?: string;
  cargoId?: string;
  /** Dia do mês (1..31), vindo do clique na coluna do gráfico. */
  dia?: number;
  /** Mês (1..12), vindo do clique na coluna do gráfico mês a mês. */
  mes?: number;
  /** Ano do mês clicado (o gráfico mostra o corrente e o anterior). */
  ano?: number;
}

export interface LinhaSegmento {
  chave: string;
  rotulo: string;
  total: number;
}

@Injectable()
export class GerencialService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Condições do recorte. `exceto` deixa de fora o próprio eixo do gráfico que está sendo montado
   * (ver "um gráfico não filtra a si mesmo").
   */
  private condicoes(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL[] {
    const cond: SQL[] = [];
    if (f.de) cond.push(sql`a.data_admissao >= ${f.de}::date`);
    if (f.ate) cond.push(sql`a.data_admissao <= ${f.ate}::date`);
    if (f.codCliente) cond.push(sql`a.cod_cliente = ${f.codCliente}`);
    // Um valor vira igualdade; vários viram um OR entre parênteses. Sem `any()` de propósito: o
    // parâmetro seguiria como texto e o Postgres cobraria o cast do array, e um OR de igualdades usa
    // o mesmo índice sem pedir nada em troca.
    const farois = (f.farol ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (farois.length > 0) {
      const alternativas = farois
        .map((v) => sql`a.farol_global::text = ${v}`)
        .reduce((acc, c) => sql`${acc} or ${c}`);
      cond.push(sql`(${alternativas})`);
    }
    if (f.tipoContrato) {
      // "(não informado)" é um valor de tela para nulo/vazio, não um tipo de contrato do sistema.
      cond.push(
        f.tipoContrato === SEM_CONTRATO
          ? sql`coalesce(nullif(a.tipo_contrato, ''), null) is null`
          : sql`a.tipo_contrato = ${f.tipoContrato}`,
      );
    }
    if (f.exame) cond.push(sql`fe.status = ${f.exame}`);
    if (f.cargoId) cond.push(sql`a.cargo_id = ${f.cargoId}`);
    if (f.dia && exceto !== "dia") {
      cond.push(sql`extract(day from a.data_admissao) = ${f.dia}`);
    }
    if (f.mes && exceto !== "mes") {
      cond.push(sql`extract(month from a.data_admissao) = ${f.mes}`);
      if (f.ano) cond.push(sql`extract(year from a.data_admissao) = ${f.ano}`);
    }
    return cond;
  }

  /** Monta o `WHERE` do recorte (sempre com pelo menos uma condição verdadeira, para simplificar). */
  private onde(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL {
    const cond = this.condicoes(f, exceto);
    if (cond.length === 0) return sql`true`;
    return cond.reduce((acc, c) => sql`${acc} and ${c}`);
  }

  /**
   * A base do recorte. O LEFT JOIN na frente de EXAME não multiplica linha: existe no máximo uma
   * frente por (admissão + tipo), garantido por unique e conferido no acervo (zero duplicidade).
   */
  private base(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL {
    return sql`
      from admissoes a
      left join frentes_admissao fe on fe.admissao_id = a.id and fe.tipo = 'EXAME'
      left join frente_status_catalogo cat on cat.tipo = 'EXAME' and cat.codigo = fe.status
      left join clientes cl on cl.cod_cliente = a.cod_cliente
      left join cargos cg on cg.id = a.cargo_id
      where ${this.onde(f, exceto)}
    `;
  }

  /** Tudo o que o painel mostra, do MESMO recorte. */
  async painel(f: FiltrosGerencial) {
    const [kpis, cliente, farol, contrato, exame, cargo, porDia, mesAMes] = await Promise.all([
      this.kpis(f),
      this.segCliente(f),
      this.segFarol(f),
      this.segContrato(f),
      this.segExame(f),
      this.segCargo(f),
      this.seriePorDia(f),
      this.serieMesAMes(f),
    ]);
    return {
      kpis,
      segmentos: { cliente, farol, contrato, exame, cargo },
      series: { porDia, mesAMes },
      // O ano de referência do comparativo é resolvido pelo RELÓGIO, então em 2027 o painel passa a
      // comparar 2027 com 2026 sozinho, sem tocar em código (decisão do diretor).
      anoCorrente: new Date().getFullYear(),
    };
  }

  /**
   * Os CINCO números do topo. Cada um é uma fatia do farol, e juntos fecham o total: trabalhadas =
   * ativos + declínios + rescisões + em admissão + aguardando liberação.
   */
  private async kpis(f: FiltrosGerencial) {
    const [row] = (await this.db.execute(sql`
      select
        count(*)::int as trabalhadas,
        count(*) filter (where a.farol_global in ('AGUARDANDO_LIBERACAO','LIBERACAO_RECUSADA'))::int as aguardando_liberacao,
        count(*) filter (where a.farol_global in ('EM_ADMISSAO','BANCO_AGUARDAR'))::int as em_admissao,
        count(*) filter (where a.farol_global = 'ADMISSAO_CONCLUIDA')::int as ativos,
        count(*) filter (where a.farol_global = 'DECLINOU')::int as declinios
      ${this.base(f)}
    `)) as unknown as Array<{
      trabalhadas: number;
      aguardando_liberacao: number;
      em_admissao: number;
      ativos: number;
      declinios: number;
    }>;
    return {
      trabalhadas: row?.trabalhadas ?? 0,
      aguardandoLiberacao: row?.aguardando_liberacao ?? 0,
      emAdmissao: row?.em_admissao ?? 0,
      ativos: row?.ativos ?? 0,
      declinios: row?.declinios ?? 0,
    };
  }

  private async segCliente(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.cod_cliente as chave,
             coalesce(nullif(cl.nome_operacao, ''), cl.razao_social, a.cod_cliente) as rotulo,
             count(*)::int as total
      ${this.base(f)} and a.cod_cliente is not null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  private async segFarol(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.farol_global::text as chave, a.farol_global::text as rotulo, count(*)::int as total
      ${this.base(f)}
      group by 1 order by 3 desc
    `)) as unknown as LinhaSegmento[];
  }

  /**
   * Contrato. Agrupa pela COLUNA CRUA e rotula no TypeScript de propósito: o texto "(não informado)"
   * é um valor de TELA, e passá-lo como parâmetro dentro do `group by` viraria um placeholder
   * diferente do que está no `select`, o que o Postgres recusa (as duas expressões deixam de casar).
   */
  private async segContrato(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    const linhas = (await this.db.execute(sql`
      select nullif(a.tipo_contrato, '') as tipo, count(*)::int as total
      ${this.base(f)}
      group by 1 order by 2 desc
    `)) as unknown as Array<{ tipo: string | null; total: number }>;
    return linhas.map((l) => ({
      chave: l.tipo ?? SEM_CONTRATO,
      rotulo: l.tipo ?? SEM_CONTRATO,
      total: Number(l.total),
    }));
  }

  private async segExame(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select fe.status as chave,
             coalesce(cat.rotulo, fe.status) as rotulo,
             count(*)::int as total
      ${this.base(f)} and fe.status is not null
      group by 1, 2 order by 3 desc
    `)) as unknown as LinhaSegmento[];
  }

  private async segCargo(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    return (await this.db.execute(sql`
      select a.cargo_id::text as chave, cg.nome as rotulo, count(*)::int as total
      ${this.base(f)} and a.cargo_id is not null
      group by 1, 2 order by 3 desc, 2
    `)) as unknown as LinhaSegmento[];
  }

  /** Colunas 1 a 31: quantas admissões caem em cada dia do mês, dentro do recorte. */
  private async seriePorDia(f: FiltrosGerencial) {
    const linhas = (await this.db.execute(sql`
      select extract(day from a.data_admissao)::int as dia, count(*)::int as total
      ${this.base(f, "dia")} and a.data_admissao is not null
      group by 1 order by 1
    `)) as unknown as Array<{ dia: number; total: number }>;
    const porDia = new Map(linhas.map((l) => [Number(l.dia), Number(l.total)]));
    // Devolve os 31 dias SEMPRE, inclusive os zerados: o gráfico tem eixo fixo e não pode "encolher".
    return Array.from({ length: 31 }, (_, i) => ({ dia: i + 1, total: porDia.get(i + 1) ?? 0 }));
  }

  /** Doze meses do ano corrente ao lado do MESMO mês do ano anterior (comparativo do diretor). */
  private async serieMesAMes(f: FiltrosGerencial) {
    const linhas = (await this.db.execute(sql`
      select extract(year from a.data_admissao)::int as ano,
             extract(month from a.data_admissao)::int as mes,
             count(*)::int as total
      ${this.base(f, "mes")} and a.data_admissao is not null
      group by 1, 2 order by 1, 2
    `)) as unknown as Array<{ ano: number; mes: number; total: number }>;

    const anoCorrente = new Date().getFullYear();
    const chave = (ano: number, mes: number) => `${ano}-${mes}`;
    const mapa = new Map(linhas.map((l) => [chave(Number(l.ano), Number(l.mes)), Number(l.total)]));
    return Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      atual: mapa.get(chave(anoCorrente, i + 1)) ?? 0,
      anterior: mapa.get(chave(anoCorrente - 1, i + 1)) ?? 0,
    }));
  }
}

/** Rótulo de tela para admissão sem tipo de contrato. Não é status novo: é a ausência, nomeada. */
export const SEM_CONTRATO = "(não informado)";
