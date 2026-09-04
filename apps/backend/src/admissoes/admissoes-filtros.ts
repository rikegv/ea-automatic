import { BadRequestException } from "@nestjs/common";
import { normalizeCpf, type FarolGlobal } from "@ea/shared-types";
import { and, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { admissaoConcluidaSql, admissaoEmAndamentoExclusivoSql } from "../db/expressoes-admissao";
import { admissoes, candidatos, clientes } from "../db/schema";

/**
 * O RECORTE DO GERENCIADOR, EM UM LUGAR SÓ (melhorias EAC, item 11c).
 *
 * Este arquivo não introduz regra nenhuma: é o mesmo bloco de condições que vivia dentro de
 * `admissoes.service.listar`, movido para cá byte a byte para que a LISTA e o RELATÓRIO EXPORTÁVEL
 * leiam o mesmo recorte. A OST do relatório pede "exporta o que está na tela filtrada, sem régua
 * paralela nova", e uma cópia das condições era exatamente a régua paralela: bastaria um ajuste
 * futuro num dos lados para o arquivo baixado mostrar um conjunto diferente do que o consultor
 * está vendo, sem ninguém perceber.
 *
 * §A.26: mexer aqui alcança a lista do Gerenciador E os KPIs dela. Alteração de condição neste
 * arquivo muda contagem de tela, não só o export.
 */
export interface ListarAdmissoesFiltros {
  q?: string;
  // Multi-select (Bloco B): OU dentro do mesmo filtro (inArray). Vazio/ausente = sem filtro.
  codCliente?: string[];
  cargoId?: string[];
  /**
   * GRUPO DE CLIENTE (cenário 2, etapa 4). Filtra pelo CARIMBO da admissão, e não pelo grupo de hoje
   * do cliente: é o que faz "as 164 do Corifeu" continuarem 164 quando uma loja mudar de grupo.
   * Entra no `base`, junto de cliente e cargo, porque é filtro de CONJUNTO: os KPIs contam sobre ele.
   */
  grupoClienteId?: string[];
  /**
   * PROJETO DE ALTO VOLUME (etapa 5). Aceita vários, e o valor especial `MATRIZ` significa "sem
   * projeto nenhum": é o caso da esmagadora maioria, e sem ele não haveria como perguntar "quem NÃO
   * é de projeto?", que é metade da pergunta. Entra no `base`, junto de cliente, cargo e grupo,
   * porque é filtro de CONJUNTO: os KPIs contam sobre ele.
   */
  projetoId?: string[];
  /**
   * LOJA / UNIDADE. Aceita várias, mais DOIS valores especiais que não são loja nenhuma:
   * `MATRIZ` (o cliente não tem loja cadastrada, caso normal) e `ALOCAR_LOJA` (o cliente tem lojas e
   * esta admissão não foi alocada, pendência). Entra no `base`, junto de cliente, cargo, grupo e
   * projeto, porque é filtro de CONJUNTO: os KPIs contam sobre ele.
   */
  lojaId?: string[];
  tipoContrato?: string[];
  farol?: string[];
  sinalizador?: string[];
  concluido?: boolean;
  comPendencias?: boolean;
  emAndamento?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  /**
   * ORDENAÇÃO da lista. Coluna fora da lista fechada (`COLUNAS_ORDENAVEIS_GERENCIADOR`) cai na ordem
   * padrão, em vez de virar erro ou consulta inventada.
   */
  ordenarPor?: string;
  direcao?: "asc" | "desc";
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

// "Com pendências obrigatórias" = sinalizador de preenchimento diferente de OK (falta campo-núcleo),
// MAS quem declinou/rescindiu NUNCA conta como pendência em nenhum card (regra permanente de
// importação, §A.3/Regra 2): pendência é de quem está no processo; o declínio saiu. Fica só como
// histórico. Mesma exclusão por farol que a Esteira aplica nas filas operacionais.
// PAUSA (OST admissão pausada, ponto 6 dos 6): pausada também não conta como pendência. Mesmo
// princípio do declínio, motivo diferente: o declínio saiu do processo, a pausada está no
// processo mas não vai ser trabalhada agora, e cobrar pendência dela é mandar o time gastar
// esforço no que está parado por decisão. Some da CONTAGEM, não da lista (o Gerenciador é a
// visão geral consultável, §A.19: é ali que a pausada continua encontrável).
export const comPendenciaSql = sql<boolean>`(${admissoes.sinalizadorPreenchimento} <> 'OK' AND ${admissoes.pausadaEm} IS NULL AND ${admissoes.farolGlobal} NOT IN ('DECLINOU', 'RESCISAO', 'AGUARDANDO_LIBERACAO', 'LIBERACAO_RECUSADA'))`;

/**
 * Monta as condições do Gerenciador a partir dos filtros da tela.
 *
 * - `base`: filtros de conjunto (cliente, cargo, contrato, sinalizador, período, busca). Os KPIs
 *   contam sobre ELE, porque os cards mostram a distribuição do conjunto e funcionam como botão de
 *   filtro (§A.12): se o card entrasse no próprio where, clicar num deles zeraria os outros.
 * - `listWhere`: `base` + os filtros de status (farol/concluído/pendências/em andamento), que valem
 *   só para as LINHAS. É o recorte que a tela exibe, e é o que o relatório exporta.
 */
export function condicoesDoFiltro(filtros: ListarAdmissoesFiltros): {
  base: SQL[];
  listWhere: SQL[];
} {
  const base: SQL[] = [];
  if (filtros.codCliente?.length) base.push(inArray(admissoes.codCliente, filtros.codCliente));
  if (filtros.cargoId?.length) base.push(inArray(admissoes.cargoId, filtros.cargoId));
  if (filtros.grupoClienteId?.length) {
    base.push(inArray(admissoes.grupoClienteId, filtros.grupoClienteId));
  }
  /*
   * PROJETO: `EXISTS` sobre `admissao_projeto`, que tem unique em `admissao_id` e por isso responde
   * sim ou não sem duplicar linha. MATRIZ é a AUSÊNCIA de vínculo, então é `NOT EXISTS`, e escolher
   * MATRIZ junto de projetos é OU, que é o que o multi-select promete.
   */
  if (filtros.projetoId?.length) {
    const ids = filtros.projetoId.filter((v) => v !== "MATRIZ");
    const querMatriz = filtros.projetoId.includes("MATRIZ");
    const condicoes: SQL[] = [];
    if (ids.length > 0) {
      condicoes.push(
        sql`EXISTS (SELECT 1 FROM admissao_projeto ap WHERE ap.admissao_id = ${admissoes.id}
              AND ap.projeto_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}))`,
      );
    }
    if (querMatriz) {
      condicoes.push(
        sql`NOT EXISTS (SELECT 1 FROM admissao_projeto ap WHERE ap.admissao_id = ${admissoes.id})`,
      );
    }
    if (condicoes.length === 1) base.push(condicoes[0]);
    else if (condicoes.length > 1) base.push(or(...condicoes)!);
  }
  /*
   * LOJA: três formas de condição, uma por desfecho da coluna. Id de loja é `IN` direto sobre a
   * chave estrangeira; MATRIZ e ALOCAR_LOJA nascem do MESMO `loja_id IS NULL`, separados por o
   * cliente ter ou não loja ATIVA cadastrada. A régua de "ativa" é a mesma do seletor da liberação:
   * cliente cujas lojas foram todas inativadas não tem onde alocar, então ele é MATRIZ.
   * Os três combinam por OU, que é o que o multi-select promete.
   */
  if (filtros.lojaId?.length) {
    const ids = filtros.lojaId.filter((v) => v !== "MATRIZ" && v !== "ALOCAR_LOJA");
    const querMatriz = filtros.lojaId.includes("MATRIZ");
    const querAlocar = filtros.lojaId.includes("ALOCAR_LOJA");
    const temLojaAtiva = sql`EXISTS (SELECT 1 FROM cliente_lojas cl
          WHERE cl.cod_cliente = ${admissoes.codCliente} AND cl.ativo = true)`;
    const condicoes: SQL[] = [];
    if (ids.length > 0) {
      condicoes.push(
        sql`${admissoes.lojaId} IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
      );
    }
    if (querMatriz) condicoes.push(sql`(${admissoes.lojaId} IS NULL AND NOT ${temLojaAtiva})`);
    if (querAlocar) condicoes.push(sql`(${admissoes.lojaId} IS NULL AND ${temLojaAtiva})`);
    if (condicoes.length === 1) base.push(condicoes[0]);
    else if (condicoes.length > 1) base.push(or(...condicoes)!);
  }
  if (filtros.tipoContrato?.length) base.push(inArray(admissoes.tipoContrato, filtros.tipoContrato));
  if (filtros.sinalizador?.length) {
    base.push(inArray(admissoes.sinalizadorPreenchimento, filtros.sinalizador as "PENDENTE"[]));
  }
  if (filtros.from) {
    if (!DATA_RE.test(filtros.from)) throw new BadRequestException("from inválido (YYYY-MM-DD)");
    base.push(gte(admissoes.dataAdmissao, filtros.from));
  }
  if (filtros.to) {
    if (!DATA_RE.test(filtros.to)) throw new BadRequestException("to inválido (YYYY-MM-DD)");
    base.push(lte(admissoes.dataAdmissao, filtros.to));
  }
  const q = filtros.q?.trim();
  if (q) {
    // Busca rápida (Bloco C): NOME, CPF e CLIENTE (razão/operação/código), tudo num campo só.
    const cpfDigits = normalizeCpf(q);
    const conds = [
      ilike(candidatos.nome, `%${q}%`),
      ilike(clientes.razaoSocial, `%${q}%`),
      ilike(clientes.nomeOperacao, `%${q}%`),
      ilike(clientes.codCliente, `%${q}%`),
    ];
    if (cpfDigits.length >= 3) conds.push(ilike(candidatos.cpf, `%${cpfDigits}%`));
    base.push(or(...conds)!);
  }

  // Filtros de status (farol/concluído/pendências/em andamento): só na lista, não nos KPIs.
  const listWhere: SQL[] = [...base];
  // PAUSA (OST da pausa, correção do diretor): "Admissão Pausada" entrou como mais uma opção do
  // MESMO seletor de status, então ela também chega aqui como filtro. Não é valor do enum
  // `farol_global` (é flag paralela), então é traduzida: marcar só "Pausada" filtra pela flag;
  // marcar junto de outros status vira OU, que é o comportamento que o multi-select promete.
  if (filtros.farol?.length) {
    const querPausadas = filtros.farol.includes("PAUSADA");
    const faroisReais = filtros.farol.filter((f) => f !== "PAUSADA") as FarolGlobal[];
    const condicoes = [
      ...(faroisReais.length ? [inArray(admissoes.farolGlobal, faroisReais)] : []),
      ...(querPausadas ? [isNotNull(admissoes.pausadaEm)] : []),
    ];
    if (condicoes.length === 1) listWhere.push(condicoes[0]);
    else if (condicoes.length > 1) listWhere.push(or(...condicoes)!);
  }
  // "Concluído" = terminou o Cadastro E NÃO tem integração PENDENTE. A expressão vive em
  // `db/expressoes-admissao` desde a onda 4 do Alto Volume (decisão do diretor), para o painel do
  // projeto contar o mesmo balde que o Gerenciador. "Em andamento" é o par exclusivo dela.
  if (filtros.concluido) listWhere.push(admissaoConcluidaSql);
  if (filtros.comPendencias) listWhere.push(comPendenciaSql);
  if (filtros.emAndamento) listWhere.push(admissaoEmAndamentoExclusivoSql);

  return { base, listWhere };
}

/** Açúcar: o `and(...)` do recorte, ou `undefined` quando não há filtro nenhum. */
export function whereDoFiltro(condicoes: SQL[]): SQL | undefined {
  return condicoes.length ? and(...condicoes) : undefined;
}
