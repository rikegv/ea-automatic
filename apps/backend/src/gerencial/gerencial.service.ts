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
   * (clique num card de KPI). A lista existe porque um KPI é um CONJUNTO de faróis (em admissão =
   * EM_ADMISSAO + BANCO_AGUARDAR), e o card tem de filtrar exatamente o que ele conta, senão o
   * número do card e o número do painel filtrado se contradizem na cara do diretor. Pela mesma
   * regra, "Aguardando Liberação" filtra só `AGUARDANDO_LIBERACAO`, que é só o que ele conta.
   */
  farol?: string;
  /**
   * Card CONTRATO, que passou a ser POR STATUS (decisão do diretor; antes era por tipo de contrato).
   *
   * O valor carrega a TRILHA junto, porque o card consolida DUAS trilhas paralelas que vivem em
   * lugares diferentes: `CAD:<status da frente CADASTRO_CONTRATO>` ou `ASS:<clicksign_status>`. Sem
   * o prefixo, "CADASTRADO" e "ASSINADO" seriam ambíguos na hora de montar o filtro.
   */
  contrato?: string;
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
    if (f.contrato) {
      // `CAD:` lê a frente de Cadastro; `ASS:` lê o estado do envelope na admissão (INT-4).
      const sep = f.contrato.indexOf(":");
      const trilha = sep >= 0 ? f.contrato.slice(0, sep) : "";
      const valor = sep >= 0 ? f.contrato.slice(sep + 1) : "";
      if (trilha === "CAD" && valor) cond.push(sql`fc.status = ${valor}`);
      if (trilha === "ASS" && valor) cond.push(sql`a.clicksign_status::text = ${valor}`);
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
   * A base do recorte. Os LEFT JOIN nas frentes de EXAME e de CADASTRO não multiplicam linha: existe
   * no máximo uma frente por (admissão + tipo), garantido pelo unique `frentes_admissao_admissao_id_
   * tipo_unique` e conferido no acervo (zero duplicidade). A contagem do painel continua sendo uma
   * linha por admissão.
   */
  private base(f: FiltrosGerencial, exceto: "dia" | "mes" | null = null): SQL {
    return sql`
      from admissoes a
      left join frentes_admissao fe on fe.admissao_id = a.id and fe.tipo = 'EXAME'
      left join frente_status_catalogo cat on cat.tipo = 'EXAME' and cat.codigo = fe.status
      left join frentes_admissao fc on fc.admissao_id = a.id and fc.tipo = 'CADASTRO_CONTRATO'
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
   * Os CINCO números do topo. Cada um é uma fatia do farol.
   *
   * "AGUARDANDO LIBERAÇÃO" CONTA SÓ QUEM ESTÁ AGUARDANDO. `LIBERACAO_RECUSADA` ficava somada aqui e
   * inflava o card com caso ENCERRADO: recusa é desfecho, já foi tratada, e ninguém está esperando
   * decisão sobre ela. O painel mostrava duas admissões "a liberar" que não existiam como trabalho
   * (correção pedida pelo diretor). A recusa continua na tabela de Farol, porque lá é um status real
   * do acervo; o que ela não faz é entrar na contagem de pendência.
   *
   * Consequência aceita: os cards deixam de fechar a soma de `trabalhadas`, que já não fechava
   * (RESCISAO nunca teve card). `trabalhadas` é o total do recorte, não a soma dos outros quatro.
   */
  private async kpis(f: FiltrosGerencial) {
    const [row] = (await this.db.execute(sql`
      select
        count(*)::int as trabalhadas,
        count(*) filter (where a.farol_global = 'AGUARDANDO_LIBERACAO')::int as aguardando_liberacao,
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
   * CONTRATO POR STATUS (decisão do diretor). Antes este card quebrava por TIPO de contrato
   * (temporário, terceiro); agora mostra em que ponto do contrato cada admissão está, no mesmo
   * modelo do card de Exame.
   *
   * O card consolida DUAS TRILHAS PARALELAS, e isso muda como ele se lê:
   *  - CADASTRO, que é a frente `CADASTRO_CONTRATO` (A Cadastrar → Cadastrado);
   *  - ASSINATURA, que NÃO é frente: vive em `admissoes.clicksign_status` (INT-4).
   *
   * As duas correm ao mesmo tempo, então uma admissão pode estar Cadastrada E Assinada, e vai contar
   * nas duas linhas. As 4 linhas NÃO somam o total do recorte, e isso é correto: cada PAR fecha a sua
   * própria trilha. No acervo atual são 1.516 admissões nas duas condições, então tratar isso como
   * uma fila única exigiria inventar uma ordem entre trilhas que o processo não tem.
   *
   * ORDEM FIXA, de processo, e não por contagem: as quatro linhas são um caminho (a cadastrar,
   * cadastrado, aguardando assinatura, assinado) e ler fora de ordem não ajuda ninguém.
   *
   * Uma consulta só, com contagem condicional, sobre o MESMO recorte dos demais cards.
   */
  private async segContrato(f: FiltrosGerencial): Promise<LinhaSegmento[]> {
    const [l] = (await this.db.execute(sql`
      select
        count(*) filter (where fc.status = 'A_CADASTRAR')::int as a_cadastrar,
        count(*) filter (where fc.status = 'CADASTRADO')::int as cadastrado,
        count(*) filter (where a.clicksign_status::text = 'AGUARDANDO_ASSINATURA')::int as aguardando,
        count(*) filter (where a.clicksign_status::text = 'ASSINADO')::int as assinado
      ${this.base(f)}
    `)) as unknown as Array<{
      a_cadastrar: number;
      cadastrado: number;
      aguardando: number;
      assinado: number;
    }>;
    return [
      { chave: "CAD:A_CADASTRAR", rotulo: "A Cadastrar", total: Number(l?.a_cadastrar ?? 0) },
      { chave: "CAD:CADASTRADO", rotulo: "Cadastrado", total: Number(l?.cadastrado ?? 0) },
      {
        chave: "ASS:AGUARDANDO_ASSINATURA",
        rotulo: "Aguardando Assinatura",
        total: Number(l?.aguardando ?? 0),
      },
      { chave: "ASS:ASSINADO", rotulo: "Assinado", total: Number(l?.assinado ?? 0) },
    ];
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
