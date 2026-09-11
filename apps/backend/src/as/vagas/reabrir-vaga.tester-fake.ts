import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import {
  candidaturaViva,
  type AsVagaReabrirOrigem,
  type AsVagaReabrirPrevia,
  type CandidaturaEtapa,
  type CandidaturaSituacao,
  type PosicaoLado,
} from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import {
  asCandidaturaEtapas,
  asCandidaturas,
  asCandidatos,
  asVagaStatusEventos,
  vagas,
} from "../../db/schema";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A REABERTURA DE VAGA CANCELADA (onda B3) ─────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é deliberado e tem motivo
 * registrado: na onda B1 o agente que construiu escolheu, de boa-fé, o mesmo nome de arquivo que o
 * `tester` havia escolhido, e sobrescreveu o teste em silêncio. Nome que ninguém mais escolheria é
 * a trava mais barata contra isso.
 *
 * ┌─ POR QUE ESTE FAKE INTERPRETA O `where`, EM VEZ DE DEVOLVER LINHAS PRONTAS ──────────────────┐
 * │ A PERGUNTA CENTRAL DESTA FRENTE É UM FILTRO: "quem saiu NAQUELE cancelamento". Um banco       │
 * │ fingido que devolve a lista pronta responde IGUAL com o filtro certo (a referência ao evento) │
 * │ e com o filtro errado (o TEXTO do motivo de descarte), e as duas armadilhas mais caras da     │
 * │ onda (ressuscitar quem desistiu por vontade própria, e misturar dois cancelamentos) passariam │
 * │ VERDES. Um teste que não consegue ficar vermelho não está medindo nada.                       │
 * │                                                                                               │
 * │ ENTÃO O FAKE LÊ A CONDIÇÃO DO DRIZZLE e a aplica sobre linhas de verdade, em memória. Ele     │
 * │ entende `eq`, `ne`, `in`, `not in`, `is null`, `is not null` e `like`/`ilike`, em CONJUNÇÃO.   │
 * │ TUDO QUE ELE NÃO ENTENDE, ELE DENUNCIA LANÇANDO: condição com ` or `, comparação entre duas   │
 * │ colunas e operador desconhecido param o teste com uma frase, em vez de virarem "sem filtro".  │
 * │ Fail-closed é a única direção segura aqui: um filtro lido como ausente deixa o fake devolver   │
 * │ linha demais, e um teste que devia pegar o defeito fica VERDE.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE MUDOU DESDE A PRIMEIRA ESCRITA DESTE ARQUIVO (e por que ele encolheu) ────────────────┐
 * │ A VERSÃO INTERROMPIDA GUARDAVA CADA VALOR SOB SETE APELIDOS, porque as três colunas da saída │
 * │ ainda não tinham nome e eram procuradas em `as_candidaturas`. Elas agora existem, com nome    │
 * │ definitivo, E EM OUTRA TABELA: `as_candidatura_etapas.vaga_status_evento_id`,                 │
 * │ `.situacao_origem` e `.posicao_lado_origem` (schema/tables.ts). A diferença NÃO é cosmética:   │
 * │ o conjunto do reabrir é uma consulta ao HISTÓRICO (o evento de saída), e não à linha viva da  │
 * │ candidatura. Um fake que continuasse procurando na candidatura reprovaria a implementação     │
 * │ CERTA. Os apelidos morreram junto com a dúvida.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: as fixtures carregam CPF, e-mail e telefone DE PROPÓSITO. É a única forma de o teste do
 * corpo da prévia ter o que provar: uma prévia montada espalhando a linha inteira manda dado pessoal
 * para a tela, e só um fixture que TENHA esse dado consegue pegar isso.
 */

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. LER A CONDIÇÃO DO DRIZZLE
// ────────────────────────────────────────────────────────────────────────────────────────────────

const NOME_DA_TABELA = Symbol.for("drizzle:Name");

/** Uma restrição de topo: uma coluna, um operador e os valores que ele compara. */
export interface Restricao {
  /** `tabela.coluna`, sempre qualificado: `id` e `situacao` existem em mais de uma tabela. */
  coluna: string;
  /** Todas as colunas do pedaço. Mais de uma é comparação coluna-a-coluna, que o fake recusa. */
  colunas: string[];
  /** O operador cru como o drizzle o escreve: ` = `, ` in `, ` is not null `, ` like `... */
  op: string;
  valores: unknown[];
}

/** A condição que o drizzle reduz a `false` (é o que `inArray(col, [])` vira). Ver `casa`. */
export const CONDICAO_IMPOSSIVEL = "<condição sempre falsa>";

const nomeDe = (v: unknown): string | undefined =>
  (v as { constructor?: { name?: string } })?.constructor?.name;

const textoDoChunk = (c: unknown): string => String((c as { value: string[] }).value.join(""));

function ehColuna(v: unknown): v is { name: string; table: Record<symbol, string> } {
  const c = v as { name?: unknown; table?: unknown };
  return !!c && typeof c === "object" && typeof c.name === "string" && !!c.table;
}

function nomeQualificado(c: { name: string; table: Record<symbol, string> }): string {
  return `${String(c.table[NOME_DA_TABELA])}.${c.name}`;
}

/**
 * O VALOR DE UM PEDAÇO DA CONDIÇÃO.
 *
 * `Param` é o caso comum (`eq`, `in`). O `String` EMBRULHADO é o caso do `like`: o drizzle passa o
 * padrão como `new String(...)`, e uma leitura que só conhecesse `Param` devolveria a condição de
 * texto SEM o padrão, o que faria o fake casar tudo e um filtro por texto passar despercebido.
 * (Medido contra o drizzle 0.38: `like(col, "Vaga cancelada:%")` chega como objeto `String`.)
 */
function valorDoPedaco(c: unknown): { tem: boolean; valor?: unknown } {
  const nome = nomeDe(c);
  if (nome === "Param") return { tem: true, valor: (c as { value: unknown }).value };
  if (nome === "String") return { tem: true, valor: String(c) };
  return { tem: false };
}

/**
 * Parte a condição nas restrições de topo. LANÇA no ` or `, e a recusa é a defesa: ver o cabeçalho.
 *
 * A FORMA REAL DO `and`, medida e não suposta: `and(a, b, c)` chega como `["(", SQL, ")"]`, e o SQL
 * de dentro como `[SQL, " and ", SQL, " and ", SQL]`. Por isso a função desce dois níveis antes de
 * achar folha nenhuma, e por isso a checagem do ` or ` roda em TODO nível: um `or` aninhado dentro
 * de um `and` só aparece no nível de dentro.
 */
export function restricoesDe(cond: unknown, saida: Restricao[] = []): Restricao[] {
  const chunks = (cond as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return saida;

  for (const c of chunks) {
    if (nomeDe(c) !== "StringChunk") continue;
    if (textoDoChunk(c).toLowerCase().includes(" or ")) {
      throw new Error(
        "O fake do reabrir não interpreta condição com ` or `: lida como conjunção, ela filtraria DEMAIS e deixaria um teste verde por engano. Ajuste o fake antes de usar `or` na consulta.",
      );
    }
  }

  /*
   * A CONDIÇÃO SEM COLUNA NENHUMA. `inArray(coluna, [])` NÃO vira "sem filtro": o drizzle o reduz
   * ao literal `false`, e o Postgres não devolve linha alguma. Um fake que ignorasse este caso
   * responderia com a TABELA INTEIRA justamente no caminho "ninguém foi selecionado", que é onde
   * mora o defeito de §A.6 mais silencioso da onda. Foi medido, não deduzido.
   */
  if (chunks.every((c) => nomeDe(c) === "StringChunk")) {
    const texto = chunks.map(textoDoChunk).join("").trim().toLowerCase();
    if (texto === "false") {
      saida.push({ coluna: CONDICAO_IMPOSSIVEL, colunas: [], op: "false", valores: [] });
    }
    return saida;
  }

  const colunas = chunks.filter(ehColuna);
  if (colunas.length > 0) {
    const op: string[] = [];
    const valores: unknown[] = [];
    for (const c of chunks) {
      if (ehColuna(c)) continue;
      if (Array.isArray(c)) {
        for (const p of c) {
          const v = valorDoPedaco(p);
          if (v.tem) valores.push(v.valor);
        }
        continue;
      }
      if (nomeDe(c) === "StringChunk") {
        op.push(textoDoChunk(c));
        continue;
      }
      const v = valorDoPedaco(c);
      if (v.tem) {
        valores.push(v.valor);
        continue;
      }
      // Uma subconsulta aninhada dentro da comparação: desce nela.
      restricoesDe(c, saida);
    }
    saida.push({
      coluna: nomeQualificado(colunas[0]),
      colunas: colunas.map(nomeQualificado),
      op: op.join(" ").toLowerCase(),
      valores,
    });
    return saida;
  }

  for (const c of chunks) {
    if (Array.isArray(c)) c.forEach((x) => restricoesDe(x, saida));
    else restricoesDe(c, saida);
  }
  return saida;
}

/**
 * ─ A CHAVE DE ORDENAÇÃO DE UM ARGUMENTO DE `orderBy` ───────────────────────────────────────────
 *
 * ESTA FUNÇÃO NASCEU DE UM FALSO VERMELHO DO PRÓPRIO FAKE, e o registro fica porque o modo de falha
 * é o pior que existe num dublê: o `orderBy` e o `limit` eram `() => b`, isto é, a ordenação e o
 * corte eram IGNORADOS. A consulta de produção que escolhe O ÚLTIMO cancelamento da vaga é
 * `orderBy(desc(em)).limit(1)`, e o fake devolvia o PRIMEIRO evento do fixture: a produção, que
 * estava certa, foi acusada de misturar cancelamentos.
 *
 * E A DIREÇÃO CONTRÁRIA É PIOR: com `limit` ignorado, uma implementação que lesse TODOS os eventos
 * seria indistinguível da que lê um, e o teste do escopo (o segundo que o `seguranca` mais queria
 * ver) passaria VERDE sobre o defeito. Dublê que ignora cláusula não é neutro: ele mente para os
 * dois lados.
 */
function chaveDeOrdem(
  arg: unknown,
): { coluna: { name: string; table: Record<symbol, string> }; desc: boolean } | null {
  if (ehColuna(arg)) return { coluna: arg, desc: false };
  const chunks = (arg as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return null;
  const coluna = chunks.find(ehColuna);
  if (!coluna) return null;
  const texto = chunks
    .filter((c) => nomeDe(c) === "StringChunk")
    .map(textoDoChunk)
    .join(" ")
    .toLowerCase();
  return { coluna, desc: texto.includes("desc") };
}

/** Comparação suficiente para o que estas consultas ordenam: texto e data. Nulo vai para o fim. */
function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), "pt-BR");
}

/** Todas as colunas que a condição menciona, qualificadas. É o que prova "o filtro NÃO é por texto". */
export function colunasDoWhere(cond: unknown): string[] {
  return [...new Set(restricoesDe(cond).flatMap((r) => r.colunas))];
}

/** Todos os textos literais que a condição compara. É o que pega o `like 'Vaga cancelada%'`. */
export function literaisDoWhere(cond: unknown): string[] {
  return restricoesDe(cond)
    .flatMap((r) => r.valores)
    .filter((v): v is string => typeof v === "string");
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. AS LINHAS EM MEMÓRIA
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Uma linha guardada por TABELA. As chaves são as do DRIZZLE (camelCase), e a leitura normaliza:
 * é isso que deixa `.select({ v: vagas })` devolver um objeto que o `list()` de produção consegue
 * ler (`v.criadoEm.toISOString()`) sem o fake ter de manter duas cópias de cada linha.
 */
export type Registro = Record<string, Record<string, unknown>>;

const normalizar = (s: string) => s.replace(/_/g, "").toLowerCase();

/** As colunas que uma leitura pediu e o fixture não conhece. Vazio é o fake acompanhando o schema. */
export const colunasDesconhecidas = new Set<string>();

function ler(registro: Registro, coluna: { name: string; table: Record<symbol, string> }): unknown {
  const tabela = String(coluna.table[NOME_DA_TABELA]);
  const linha = registro[tabela];
  if (!linha) return undefined;
  const alvo = normalizar(coluna.name);
  for (const [k, v] of Object.entries(linha)) if (normalizar(k) === alvo) return v;
  colunasDesconhecidas.add(`${tabela}.${coluna.name}`);
  return undefined;
}

function escrever(linha: Record<string, unknown>, chave: string, valor: unknown): void {
  const alvo = normalizar(chave);
  for (const k of Object.keys(linha)) {
    if (normalizar(k) === alvo) {
      linha[k] = valor;
      return;
    }
  }
  linha[chave] = valor;
}

export const T0 = new Date("2026-09-10T12:00:00.000Z");
export const VAGA = "vaga-1";

export const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
export const MASTER: AuthUser = { ...COMUM, id: "user-master", papel: "MASTER" };
export const SUPER: AuthUser = { ...COMUM, id: "user-super", papel: "SUPER_ADMIN" };

/** O texto que o cancelamento grava hoje no motivo de descarte. É o MARCADOR ANTIGO, e é frágil. */
export const MOTIVO_DO_CANCELAMENTO = "Cliente cancelou a solicitação";
export const TEXTO_DA_SAIDA = `Vaga cancelada: ${MOTIVO_DO_CANCELAMENTO}`;

export const EVENTO_1 = "evt-cancelamento-1";
export const EVENTO_2 = "evt-cancelamento-2";

/**
 * O ACEITE DA REABERTURA SEM ORIGEM, escrito AQUI e não importado de `domain/candidatura`.
 *
 * POR QUE UMA CÓPIA, E ELA É DELIBERADA: quando este arquivo foi escrito o valor ainda não existia
 * em `ACEITES_REGISTRAVEIS` (ele chegou com a migration 0105, que estende o CHECK da coluna), e
 * importar o que não existe deixaria o repositório inteiro sem compilar por causa de um teste. A
 * cópia FICOU depois que o valor nasceu, e o motivo mudou: ela é a afirmação INDEPENDENTE do
 * `tester` sobre qual deve ser o valor (§A.38). Importar do domínio tornaria a asserção tautológica,
 * e renomear o aceite passaria despercebido.
 *
 * A CÓPIA NÃO VIRA SEGUNDA FONTE DA VERDADE porque `vagas.reabrir-rota.spec.ts` confronta as duas:
 * ela tem de estar em `ACEITES_REGISTRAVEIS` E no CHECK que alguma migration construiu. Gravar o
 * literal sem pôr o nome na lista, ou sem a migration, faz o Postgres recusar a linha em produção,
 * com a transação já aberta e a vaga a meio caminho de reabrir.
 */
export const ACEITE_REABERTURA_SEM_ORIGEM = "REABERTURA_SEM_ORIGEM";

/** O evento de saída no histórico da candidatura, com o retrato da origem. */
export interface DadosDaSaida {
  /** O evento de status que causou a saída. `null` é a saída ANTIGA, sem marcador. */
  vagaStatusEventoId?: string | null;
  situacaoOrigem?: "ATIVO" | "ALOCADO" | null;
  posicaoLadoOrigem?: PosicaoLado | null;
  situacao?: CandidaturaSituacao;
  motivo?: string | null;
  ocorridoEm?: Date;
}

/** Uma pessoa do cenário: a candidatura viva, a pessoa e os eventos do histórico dela. */
export interface Pessoa {
  candidatura: Record<string, unknown>;
  candidato: Record<string, unknown>;
  etapas: Record<string, unknown>[];
}

/**
 * UMA CANDIDATURA, no estado em que o banco a guarda, mais o histórico dela.
 *
 * `posicaoLado` (o lado ATUAL, na candidatura) é DIFERENTE de `posicaoLadoOrigem` (o lado gravado
 * no evento de saída), e a distinção é uma armadilha inteira: existe hoje na base uma linha `ATIVO`
 * com `posicao_lado = OFICIAL`, porque a reversão do envio não limpa o lado. Adivinhar "tem lado,
 * logo estava alocado" é falso, e por isso a 0104 GRAVA a origem em vez de deduzi-la.
 */
export function pessoa(
  nome: string,
  situacao: CandidaturaSituacao,
  extras: {
    id?: string;
    candidatoId?: string;
    motivoDescarte?: string | null;
    posicaoLado?: PosicaoLado | null;
    etapa?: CandidaturaEtapa;
    atualizadoEm?: Date;
    /** §A.6: a retenção já passou por esta pessoa. Nome trocado, CPF e contatos apagados. */
    anonimizado?: boolean;
    /** Os eventos de saída. Vazio é candidatura que nunca saiu. */
    saidas?: DadosDaSaida[];
  } = {},
): Pessoa {
  const id = extras.id ?? `cand-${nome}`;
  const candidatoId = extras.candidatoId ?? `pessoa-${nome}`;
  const etapa = extras.etapa ?? "APROVACAO";
  return {
    candidatura: {
      id,
      candidatoId,
      vagaId: VAGA,
      etapa,
      situacao,
      motivoDescarte: extras.motivoDescarte ?? null,
      posicaoLado: extras.posicaoLado ?? null,
      alocadoEm: T0,
      alocadoPorId: COMUM.id,
      admissaoId: null,
      idMatchPandape: null,
      ultimoContatoEm: null,
      criadoEm: T0,
      atualizadoEm: extras.atualizadoEm ?? T0,
    },
    // §A.6: o dado pessoal está aqui DE PROPÓSITO. Ver o cabeçalho.
    candidato: extras.anonimizado
      ? {
          id: candidatoId,
          nome: "Candidato Expurgado",
          cpf: null,
          email: null,
          telefone: null,
          dataNascimento: null,
          origem: "CAPTACAO",
          cidade: "São Paulo",
          uf: "SP",
          anonimizadoEm: new Date("2026-02-01T10:00:00.000Z"),
        }
      : {
          id: candidatoId,
          nome,
          cpf: "12345678901",
          email: `${nome.toLowerCase()}@exemplo.com`,
          telefone: "11999990000",
          dataNascimento: "1990-01-01",
          origem: "CAPTACAO",
          cidade: "São Paulo",
          uf: "SP",
          anonimizadoEm: null,
        },
    etapas: (extras.saidas ?? []).map((s, i) => ({
      id: `etapa-${id}-${i + 1}`,
      candidaturaId: id,
      etapaDe: null,
      etapaPara: etapa,
      situacao: s.situacao ?? "DESCARTADO",
      vagaDe: null,
      vagaPara: null,
      motivo: s.motivo === undefined ? TEXTO_DA_SAIDA : s.motivo,
      porId: MASTER.id,
      posicaoLado: null,
      aceite: null,
      aceiteNumero: null,
      vagaStatusEventoId: s.vagaStatusEventoId ?? null,
      situacaoOrigem: s.situacaoOrigem ?? null,
      posicaoLadoOrigem: s.posicaoLadoOrigem ?? null,
      ocorridoEm: s.ocorridoEm ?? T0,
      criadoEm: s.ocorridoEm ?? T0,
    })),
  };
}

/** O evento daquele cancelamento, como a trilha da vaga o guarda. */
export const eventoDeCancelamento = (id: string, quando = T0): Record<string, unknown> => ({
  id,
  vagaId: VAGA,
  de: CODIGO_ABERTURA,
  para: CODIGO_CANCELAMENTO,
  porId: MASTER.id,
  em: quando,
  observacao: `Cancelamento: ${MOTIVO_DO_CANCELAMENTO}`,
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O BANCO FINGIDO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Todas as colunas de `as_candidatura_etapas`, em nulo. Ver o uso no `insert`. */
const MOLDE_DA_ETAPA: Record<string, unknown> = {
  id: null,
  candidaturaId: null,
  etapaDe: null,
  etapaPara: null,
  situacao: null,
  vagaDe: null,
  vagaPara: null,
  motivo: null,
  porId: null,
  posicaoLado: null,
  aceite: null,
  aceiteNumero: null,
  vagaStatusEventoId: null,
  situacaoOrigem: null,
  posicaoLadoOrigem: null,
  ocorridoEm: null,
  criadoEm: null,
};

export interface Escrita {
  tabela: string;
  tipo: "update" | "insert";
  valores: Record<string, unknown>;
  where: unknown;
  naTransacao: boolean;
  /** Os ids das linhas que o `update` de fato alcançou. É o que responde "tocou candidatura?". */
  alcancou: string[];
}

export interface Leitura {
  tabela: string;
  where: unknown;
}

export interface BancoDoReabrir {
  db: unknown;
  vaga: Record<string, unknown>;
  pessoas: Pessoa[];
  eventos: Record<string, unknown>[];
  escritas: Escrita[];
  ordem: string[];
  leituras: Leitura[];
}

/**
 * O ERRO DO POSTGRES QUANDO DUAS CANDIDATURAS VIVAS DA MESMA PESSOA CAEM NA MESMA VAGA.
 *
 * O FAKE IMITA O UNIQUE PARCIAL `uq_as_candidaturas_viva`, E ISSO NÃO É CAPRICHO: sem ele, uma
 * implementação que reative alguém que JÁ VOLTOU à vaga por outro caminho passa VERDE aqui e
 * DERRUBA A TRANSAÇÃO INTEIRA em produção, levando junto a reabertura de todo mundo. O fake tem de
 * conseguir reproduzir a queda, senão o teste que a cobre não existe de verdade.
 */
export class ViolacaoDeUniqueFingida extends Error {
  readonly code = "23505";
  readonly constraint = "uq_as_candidaturas_viva";
  constructor(candidatoId: string) {
    super(
      `duplicate key value violates unique constraint "uq_as_candidaturas_viva" (candidato ${candidatoId})`,
    );
  }
}

export function bancoDoReabrir(cenario: {
  status?: string;
  encerradaEm?: Date | null;
  pessoas?: Pessoa[];
  eventos?: Record<string, unknown>[];
  posicoesOficiais?: number;
  posicoesBanco?: number;
}): BancoDoReabrir {
  const estado: BancoDoReabrir = {
    db: null,
    vaga: {
      id: VAGA,
      codigo: "PS-2026-999",
      nomeDivulgacao: "Vaga de teste",
      status: cenario.status ?? CODIGO_CANCELAMENTO,
      posicoesOficiais: cenario.posicoesOficiais ?? 5,
      posicoesBanco: cenario.posicoesBanco ?? 2,
      vagasFechadas: 2,
      vagasFechadasBanco: 1,
      dataFechamento: "2026-09-10",
      canceladaPorId: MASTER.id,
      canceladaEm: T0,
      cancelamentoMotivo: MOTIVO_DO_CANCELAMENTO,
      cancelamentoObservacao: "o cliente avisou por e-mail",
      cancelamentoForcadoPorId: MASTER.id,
      cancelamentoForcadoEm: T0,
      cancelamentoForcadoSeguravam: 2,
      encerradaEm: cenario.encerradaEm === undefined ? T0 : cenario.encerradaEm,
      fechamentoForcadoPorId: null,
      fechamentoForcadoEm: null,
      fechamentoForcadoFaltavam: null,
      codCliente: 1,
      cargoId: "cargo-1",
      abertoPorId: null,
      consultorId: null,
      recruiterId: null,
      escolaridade: null,
      regioes: [],
      idiomas: [],
      testes: [],
      etapasPs: [],
      criadoEm: T0,
      atualizadoEm: T0,
    },
    pessoas: cenario.pessoas ?? [],
    eventos: cenario.eventos ?? [],
    escritas: [],
    ordem: [],
    leituras: [],
  };

  /**
   * O PACOTE JUNTADO de uma pessoa. O fake NÃO executa `join`: ele entrega candidatura, pessoa e
   * evento de saída no MESMO registro, então uma consulta que parta de qualquer uma das três acha o
   * que precisa. A limitação está declarada: consulta que dependa da SEMÂNTICA do join (um `left
   * join` que precise devolver linha com o lado direito nulo) não é representável aqui.
   */
  const comEtapa = (p: Pessoa, etapa?: Record<string, unknown>): Registro => ({
    as_candidaturas: p.candidatura,
    as_candidatos: p.candidato,
    ...(etapa ? { as_candidatura_etapas: etapa } : {}),
  });

  const registrosDe = (tabela: string): Registro[] => {
    if (tabela === "vagas") return [{ vagas: estado.vaga }];
    if (tabela === "as_vaga_status_eventos")
      return estado.eventos.map((e) => ({ as_vaga_status_eventos: e }));
    if (tabela === "as_candidatura_etapas")
      return estado.pessoas.flatMap((p) => p.etapas.map((e) => comEtapa(p, e)));
    if (tabela === "as_candidaturas" || tabela === "as_candidatos")
      return estado.pessoas.map((p) =>
        // A SAÍDA MARCADA é a que acompanha a candidatura quando a consulta parte dela; na falta
        // dela, a última do histórico. É o que imita o `left join` do caminho oposto.
        comEtapa(p, p.etapas.find((e) => e.vagaStatusEventoId) ?? p.etapas[p.etapas.length - 1]),
      );
    return [];
  };

  let naTransacao = false;

  /** Aplica as restrições sobre uma linha. Conjunção: toda restrição tem de casar. */
  const casa = (registro: Registro, cond: unknown): boolean => {
    if (cond === undefined || cond === null) return true;
    for (const r of restricoesDe(cond)) {
      if (r.coluna === CONDICAO_IMPOSSIVEL) return false;
      if (r.colunas.length > 1) {
        throw new Error(
          `O fake do reabrir não interpreta comparação entre duas colunas no \`where\` (${r.colunas.join(" vs ")}). Ele filtraria errado em silêncio.`,
        );
      }
      const [tabela, coluna] = r.coluna.split(".");
      const valor = ler(registro, {
        name: coluna,
        table: { [NOME_DA_TABELA]: tabela } as Record<symbol, string>,
      });
      const op = r.op;
      if (op.includes("is not null")) {
        if (valor === null || valor === undefined) return false;
      } else if (op.includes("is null")) {
        if (valor !== null && valor !== undefined) return false;
      } else if (op.includes("not in")) {
        if (r.valores.includes(valor)) return false;
      } else if (op.includes(" in ")) {
        if (!r.valores.includes(valor)) return false;
      } else if (op.includes("<>") || op.includes("!=")) {
        if (valor === r.valores[0]) return false;
      } else if (op.includes("like")) {
        const padrao = String(r.valores[0] ?? "");
        const re = new RegExp(
          `^${padrao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`,
          "i",
        );
        if (typeof valor !== "string" || !re.test(valor)) return false;
      } else if (op.includes("=")) {
        if (valor !== r.valores[0]) return false;
      } else {
        throw new Error(
          `O fake do reabrir não conhece o operador "${op.trim()}" (coluna ${r.coluna}). Um operador lido como "sem filtro" deixa o fake devolver linha demais, e o teste fica verde por engano.`,
        );
      }
    }
    return true;
  };

  const projetar = (registro: Registro, proj: unknown, tabela: string, grupo = 1): unknown => {
    if (!proj || typeof proj !== "object") return { ...(registro[tabela] ?? {}) };
    const saida: Record<string, unknown> = {};
    for (const [chave, alvo] of Object.entries(proj as Record<string, unknown>)) {
      if (ehColuna(alvo)) {
        saida[chave] = ler(registro, alvo);
        continue;
      }
      const nome = (alvo as Record<symbol, string>)?.[NOME_DA_TABELA];
      // `.select({ v: vagas })`: a tabela inteira sob um apelido.
      if (nome) {
        saida[chave] = { ...(registro[String(nome)] ?? {}) };
        continue;
      }
      // O que sobra é uma expressão (`count(*)::int`). Só a contagem aparece nas consultas do
      // módulo, e é ela que a ocupação derivada lê.
      saida[chave] = grupo;
    }
    return saida;
  };

  const fabricaDeSelect = () => (proj?: unknown) => {
    let tabela = "";
    let cond: unknown = undefined;
    let agrupar: unknown[] | null = null;
    let ordenar: unknown[] = [];
    let corte: number | null = null;
    const b: Record<string, unknown> = {};

    const resolver = () => {
      const linhas = registrosDe(tabela).filter((r) => casa(r, cond));
      estado.leituras.push({ tabela, where: cond });
      // A ORDEM E O CORTE SÃO APLICADOS DE VERDADE. Ver `chaveDeOrdem`.
      const chaves = ordenar.map(chaveDeOrdem).filter((k) => k !== null);
      if (chaves.length > 0) {
        linhas.sort((r1, r2) => {
          for (const k of chaves) {
            const n = comparar(ler(r1, k.coluna), ler(r2, k.coluna));
            if (n !== 0) return k.desc ? -n : n;
          }
          return 0;
        });
      }
      if (corte !== null && !agrupar) linhas.splice(corte);
      if (!agrupar) return linhas.map((r) => projetar(r, proj, tabela));
      const grupos = new Map<string, Registro[]>();
      for (const r of linhas) {
        const chave = agrupar
          .map((c) => (ehColuna(c) ? String(ler(r, c)) : ""))
          .join("|");
        grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
      }
      return [...grupos.values()].map((g) => projetar(g[0], proj, tabela, g.length));
    };

    b.from = (t: unknown) => {
      tabela = String((t as Record<symbol, string>)[NOME_DA_TABELA]);
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = (c: unknown) => {
      cond = c;
      return b;
    };
    b.for = (modo: string) => {
      estado.ordem.push(modo === "update" ? `trava:${tabela}` : `for-${modo}:${tabela}`);
      return b;
    };
    b.limit = (n?: number) => {
      corte = typeof n === "number" ? n : null;
      return b;
    };
    b.offset = () => b;
    b.orderBy = (...cols: unknown[]) => {
      ordenar = cols;
      return b;
    };
    b.groupBy = (...cols: unknown[]) => {
      agrupar = cols;
      return b;
    };
    b.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => resolver())
        .then(r, j);
    return b;
  };

  /** O unique parcial das vivas, imitado. Ver `ViolacaoDeUniqueFingida`. */
  const conferirUniqueDasVivas = (): void => {
    const vistos = new Map<string, number>();
    for (const p of estado.pessoas) {
      const situacao = p.candidatura.situacao as CandidaturaSituacao;
      if (!candidaturaViva(situacao)) continue;
      const chave = `${String(p.candidatura.candidatoId)}|${String(p.candidatura.vagaId)}`;
      const n = (vistos.get(chave) ?? 0) + 1;
      vistos.set(chave, n);
      if (n > 1) throw new ViolacaoDeUniqueFingida(String(p.candidatura.candidatoId));
    }
  };

  const registrar = (t: unknown) => {
    const tabela = String((t as Record<symbol, string>)[NOME_DA_TABELA]);
    return {
      set: (valores: Record<string, unknown>) => ({
        /*
         * O `where` do `update` é AGUARDÁVEL **E** TEM `returning`, como o drizzle de verdade: a
         * restauração da candidatura usa `update ... returning { id }` para saber QUAIS linhas o
         * `where` de fato alcançou, e um fake sem isso reprovaria a produção por limitação dele.
         */
        where: (cond: unknown) => {
          const alvos = registrosDe(tabela).filter((r) => casa(r, cond));
          for (const r of alvos) {
            const linha = r[tabela];
            if (linha) for (const [k, v] of Object.entries(valores)) escrever(linha, k, v);
          }
          const ids = alvos.map((r) => String(r[tabela]?.id ?? ""));
          estado.escritas.push({
            tabela,
            tipo: "update",
            valores,
            where: cond,
            naTransacao,
            alcancou: ids,
          });
          estado.ordem.push(`update:${tabela}${naTransacao ? ":tx" : ""}`);
          if (tabela === "as_candidaturas") conferirUniqueDasVivas();
          const pronto = Promise.resolve(undefined);
          return {
            then: pronto.then.bind(pronto),
            catch: pronto.catch.bind(pronto),
            finally: pronto.finally.bind(pronto),
            returning: async () => ids.map((id) => ({ id })),
          };
        },
      }),
      values: (valores: Record<string, unknown>) => {
        const id = `${tabela}-inserida-${estado.escritas.length + 1}`;
        if (tabela === "as_vaga_status_eventos") estado.eventos.push({ id, ...valores });
        if (tabela === "as_candidatura_etapas") {
          const dona = estado.pessoas.find((p) => p.candidatura.id === valores.candidaturaId);
          /*
           * O MOLDE COMPLETO ANTES DOS VALORES: a linha inserida tem TODAS as colunas da tabela, as
           * não escritas em nulo, como o banco faz. Sem ele, uma consulta posterior que filtrasse
           * por uma coluna que o `insert` não citou acharia `undefined` e o alarme de
           * `colunasDesconhecidas` culparia o schema por uma limitação do fake.
           */
          dona?.etapas.push({ ...MOLDE_DA_ETAPA, id, ...valores });
        }
        if (tabela === "as_candidaturas") {
          estado.pessoas.push({
            candidatura: { id, ...valores },
            candidato:
              estado.pessoas.find((p) => p.candidatura.candidatoId === valores.candidatoId)
                ?.candidato ?? { id: valores.candidatoId, nome: "Desconhecido" },
            etapas: [],
          });
          conferirUniqueDasVivas();
        }
        estado.escritas.push({
          tabela,
          tipo: "insert",
          valores,
          where: null,
          naTransacao,
          alcancou: [id],
        });
        estado.ordem.push(`insert:${tabela}${naTransacao ? ":tx" : ""}`);
        const pronto = Promise.resolve(undefined);
        return {
          then: pronto.then.bind(pronto),
          catch: pronto.catch.bind(pronto),
          finally: pronto.finally.bind(pronto),
          returning: async () => [{ id, ...valores }],
        };
      },
    };
  };

  const tx = {
    select: fabricaDeSelect(),
    update: registrar,
    insert: registrar,
    execute: async () => [],
    query: { vagas: { findFirst: async () => ({ ...estado.vaga }) } },
  };
  const db = {
    select: fabricaDeSelect(),
    update: registrar,
    insert: registrar,
    execute: async () => [],
    query: { vagas: { findFirst: async () => ({ ...estado.vaga }) } },
    transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      naTransacao = true;
      estado.ordem.push("abre-transacao");
      try {
        return await fn(tx);
      } finally {
        naTransacao = false;
      }
    },
  };
  estado.db = db;
  return estado;
}

/** As escritas de uma tabela. */
export const escritasEm = (banco: BancoDoReabrir, tabela: string): Escrita[] =>
  banco.escritas.filter((e) => e.tabela === tabela);

/** A candidatura VIVA daquela pessoa naquela vaga, se houver. É por aqui que o contrato pergunta. */
export function vivaDe(banco: BancoDoReabrir, nome: string): Record<string, unknown> | undefined {
  return banco.pessoas
    .map((p) => p.candidatura)
    .find(
      (c) =>
        c.candidatoId === `pessoa-${nome}` &&
        c.vagaId === VAGA &&
        candidaturaViva(c.situacao as CandidaturaSituacao),
    );
}

/** A linha original daquela candidatura, viva ou não. */
export const candidaturaDe = (
  banco: BancoDoReabrir,
  id: string,
): Record<string, unknown> | undefined =>
  banco.pessoas.map((p) => p.candidatura).find((c) => c.id === id);

/** O catálogo de status, com os cinco papéis de sistema. Reusa o fake já auditado das ondas B1/B2. */
export const CATALOGO_DE_STATUS = catalogoDeStatusFingido();
export const CODIGO_ABERTURA = linhasDeStatusFingidas().find((l) => l.papel === "ABERTURA")!.codigo;
export const CODIGO_CANCELAMENTO = linhasDeStatusFingidas().find(
  (l) => l.papel === "CANCELAMENTO",
)!.codigo;
export const CODIGO_ENTREGA = linhasDeStatusFingidas().find((l) => l.papel === "ENTREGA")!.codigo;
export const CODIGO_FECHAMENTO = linhasDeStatusFingidas().find(
  (l) => l.papel === "FECHAMENTO",
)!.codigo;

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. OS CENÁRIOS
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ─ AS SEIS PESSOAS DO CANCELAMENTO NOVO, E CADA UMA EXISTE POR UM DEFEITO QUE ELA PEGA ─────────
 *
 * ANA saiu NAQUELE cancelamento, estava ATIVO. VOLTA como ATIVO.
 * BIA saiu NAQUELE cancelamento, estava ALOCADO no lado OFICIAL. VOLTA como ALOCADO, no OFICIAL.
 * CAIO DESISTIU por vontade própria, dez horas antes, e o motivo dele é digitado à mão. NÃO VOLTA.
 *   (Existe na base agora: `DESISTIU` com motivo "desnvicular da vaga para teste".)
 * DORA foi descartada À MÃO com o texto "Vaga cancelada: ..." digitado por alguém, e o evento de
 *   saída dela NÃO aponta para cancelamento nenhum. NÃO VOLTA: o texto é campo livre.
 * ELI saiu naquele cancelamento estando `ATIVO`, mas com `posicao_lado = OFICIAL` pendurado da
 *   reversão de um envio. VOLTA como ATIVO, NUNCA como ALOCADO. (Existe na base agora.)
 * FLAVIA está `APROVADO`: ela NÃO segurava o cancelamento, então não saiu nele e não está no
 *   conjunto. É a pessoa VIVA numa vaga ENCERRADA que a §A.6 já discutiu, e a reabertura não pode
 *   tocar na linha dela.
 */
export const CENARIO_NOVO = (): Pessoa[] => [
  pessoa("Ana", "DESCARTADO", {
    motivoDescarte: TEXTO_DA_SAIDA,
    saidas: [{ vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ATIVO" }],
  }),
  pessoa("Bia", "DESCARTADO", {
    motivoDescarte: TEXTO_DA_SAIDA,
    posicaoLado: "OFICIAL",
    saidas: [
      { vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ALOCADO", posicaoLadoOrigem: "OFICIAL" },
    ],
  }),
  pessoa("Caio", "DESISTIU", {
    motivoDescarte: "desnvicular da vaga para teste",
    atualizadoEm: new Date("2026-09-10T02:00:00.000Z"),
    saidas: [
      {
        situacao: "DESISTIU",
        motivo: "desnvicular da vaga para teste",
        ocorridoEm: new Date("2026-09-10T02:00:00.000Z"),
      },
    ],
  }),
  pessoa("Dora", "DESCARTADO", {
    motivoDescarte: "Vaga cancelada: combinado com o cliente",
    atualizadoEm: new Date("2026-09-09T09:00:00.000Z"),
    saidas: [
      {
        motivo: "Vaga cancelada: combinado com o cliente",
        ocorridoEm: new Date("2026-09-09T09:00:00.000Z"),
      },
    ],
  }),
  pessoa("Eli", "DESCARTADO", {
    motivoDescarte: TEXTO_DA_SAIDA,
    posicaoLado: "OFICIAL",
    saidas: [{ vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ATIVO" }],
  }),
  pessoa("Flavia", "APROVADO", { atualizadoEm: new Date("2026-03-01T09:00:00.000Z") }),
];

/** Quem TEM de estar na prévia do `EVENTO_1`, e mais ninguém. */
export const QUEM_VOLTA = ["cand-Ana", "cand-Bia", "cand-Eli"];
/** Quem NUNCA pode aparecer, e o motivo de cada um está no cenário. */
export const QUEM_NAO_VOLTA = ["cand-Caio", "cand-Dora", "cand-Flavia"];
/**
 * ─ O CANCELAMENTO NORMAL: EVENTO EXISTE, E ELE NÃO DESCARTOU NINGUÉM ───────────────────────────
 *
 * ESTE CENÁRIO É O VETO DO `seguranca`, E É O QUE MAIS FÁCIL PASSA VERDE POR ENGANO. Medido no
 * `cancelar`: o evento da trilha é inserido SEMPRE (`vagas.service.ts:1495-1508`), mas as
 * candidaturas só são encerradas DENTRO do `if (forcado)` (`:1519-1521`). Logo, o cancelamento
 * NORMAL, o da vaga que ninguém segurava, produz um evento com ZERO pessoas apontando para ele.
 *
 * A IMPLEMENTAÇÃO NATURAL E ERRADA É: "consultei o evento, veio vazio, então isto deve ser um
 * cancelamento antigo, então ofereço todos os DESCARTADO da vaga". O resultado é oferecer para
 * ressurreição exatamente quem a SELEÇÃO recusou POR MÉRITO, num cancelamento que não descartou
 * ninguém. Por isso a vaga aqui TEM descartados antigos dentro: é o isca do defeito.
 *
 * O DISCRIMINADOR É "EXISTE EVENTO DE CANCELAMENTO?", NUNCA "A LISTA VEIO VAZIA".
 */
export const CENARIO_NORMAL = (): Pessoa[] => [
  pessoa("Recusada", "DESCARTADO", {
    motivoDescarte: "perfil não aderente",
    atualizadoEm: new Date("2026-05-02T10:00:00.000Z"),
    saidas: [
      {
        motivo: "perfil não aderente",
        ocorridoEm: new Date("2026-05-02T10:00:00.000Z"),
      },
    ],
  }),
  pessoa("Reprovado", "DESCARTADO", {
    motivoDescarte: "reprovado na entrevista com o cliente",
    atualizadoEm: new Date("2026-06-11T10:00:00.000Z"),
  }),
  // A pessoa que continua APROVADA é quem explica por que o cancelamento NÃO foi forçado: ninguém
  // segurava (`seguraOCancelamento` é ATIVO e ALOCADO), então ninguém foi encerrado junto.
  pessoa("Aprovada", "APROVADO", { atualizadoEm: new Date("2026-06-20T10:00:00.000Z") }),
];

/**
 * O CANCELAMENTO ANTIGO, QUE HOJE É O ÚNICO QUE EXISTE (medição M1 do mapa: `as_vaga_status_eventos`
 * tem ZERO linhas e há 2 vagas CANCELADA). Não há evento, então não há marcador, e o sistema NÃO
 * SABE quem saiu por causa dele nem onde cada pessoa estava. Quem for selecionado volta EM SELEÇÃO,
 * e a escolha fica registrada como ACEITE, porque ali o Master está REESCOLHENDO a pessoa, e não
 * desfazendo um gesto do sistema.
 */
export const CENARIO_ANTIGO = (): Pessoa[] => [
  pessoa("Velha", "DESCARTADO", { motivoDescarte: TEXTO_DA_SAIDA, posicaoLado: "OFICIAL" }),
  pessoa("Outra", "DESCARTADO", { motivoDescarte: "Vaga cancelada: qualquer coisa" }),
  pessoa("Desistente", "DESISTIU", { motivoDescarte: "achou outro emprego" }),
  // §A.6: a vaga cancelada há mais de dois anos tem gente que a retenção JÁ ANONIMIZOU.
  pessoa("Fantasma", "DESCARTADO", {
    motivoDescarte: TEXTO_DA_SAIDA,
    anonimizado: true,
    atualizadoEm: new Date("2024-01-05T10:00:00.000Z"),
  }),
];

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 5. A PORTA, RESOLVIDA POR NOME
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** A porta que qualquer implementação (a real ou a de referência) tem de oferecer. */
export interface PortaDoReabrir {
  previa(vagaId: string, user: AuthUser): Promise<AsVagaReabrirPrevia>;
  reabrir(vagaId: string, dto: Record<string, unknown>, user: AuthUser): Promise<unknown>;
}

export type FabricaDoReabrir = (banco: BancoDoReabrir) => PortaDoReabrir;

/** Os nomes plausíveis de cada método. A construção escolhe um; o teste não fica refém da escolha. */
export const NOMES_DA_PREVIA = [
  "previaDeReabertura",
  "previaDoReabrir",
  "previaReabertura",
  "reaberturaPrevia",
  "reabrirPrevia",
  "candidatosParaReabrir",
] as const;
export const NOMES_DO_REABRIR = ["reabrir", "reabrirVaga"] as const;

/**
 * RESOLVE O MÉTODO POR NOME, e não o chama direto, pela mesma razão do `vagas.cancelar.spec.ts`:
 * enquanto ele não existir, cada teste falha com uma frase que DIZ o que falta, em vez de o
 * `typecheck` do repositório inteiro ficar vermelho por causa deste arquivo. A lista de nomes é
 * generosa de propósito: vermelho por NOME ESCOLHIDO DIFERENTE é vermelho por ACOPLAMENTO, não por
 * defeito, e ele custa uma rodada inteira para ser lido certo.
 */
export function metodo<T>(alvo: object, nomes: readonly string[], oQueE: string): T {
  const dono = alvo as unknown as Record<string, unknown>;
  for (const n of nomes) {
    const f = dono[n];
    if (typeof f === "function") return (f as (...a: unknown[]) => unknown).bind(alvo) as T;
  }
  throw new Error(
    `${oQueE} ainda não existe em ${alvo.constructor.name}. Procurei por: ${nomes.join(", ")}. Enquanto a construção não chegar, este arquivo é a especificação dele; se o nome escolhido for outro, acrescente-o à lista (o vermelho é de ACOPLAMENTO, não de defeito).`,
  );
}

/** A porta de uma implementação de produção, montada a partir do service. */
export const portaDe = (service: object): PortaDoReabrir => ({
  previa: metodo(service, NOMES_DA_PREVIA, "A prévia do reabrir"),
  reabrir: metodo(service, NOMES_DO_REABRIR, "A reabertura da vaga"),
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 6. O CONTRATO: O QUE SE EXIGE DE QUALQUER IMPLEMENTAÇÃO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Uma violação nomeada, com o dano que ela causa em produção escrito junto. */
export interface Violacao {
  regra: string;
  dano: string;
}

const erro = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

/** As colunas citadas pelo `where` de uma escrita, para as regras que falam da CLÁUSULA. */
const colunasDaEscrita = (e: Escrita): string[] => (e.where ? colunasDoWhere(e.where) : []);

/**
 * ─ O CONTRATO INTEIRO, EXECUTÁVEL ──────────────────────────────────────────────────────────────
 *
 * Devolve a lista das VIOLAÇÕES. Vazia é o requisito cumprido. Cada regra é nomeada para o vermelho
 * dizer QUAL propriedade caiu, e não só "alguma coisa mudou".
 *
 * ELE RODA DUAS VEZES, e é isso que o torna confiável: contra a implementação de PRODUÇÃO
 * (`vagas.reabrir.comportamental.spec.ts`) e contra a de REFERÊNCIA mais os MUTANTES
 * (`vagas.reabrir-contrato.comportamental.spec.ts`). Um contrato frouxo aprova um mutante, e ali
 * ele fica vermelho por si.
 */
export async function violacoesDoReabrir(
  fabrica: FabricaDoReabrir,
  /**
   * ─ O CÓDIGO DO PAPEL ABERTURA, PARAMETRIZADO, E ISTO É UM PONTO CEGO QUE O PRÓPRIO TESTE ACHOU ─
   *
   * A SEMENTE CHAMA O STATUS DE ABERTURA DE `"ABERTA"`, que é EXATAMENTE o literal que a armadilha
   * escreve à mão. Rodando com a semente, "resolveu pelo papel" e "digitou o literal" produzem a
   * MESMA gravação, e a regra `DESTINO_NAO_E_O_PAPEL_DE_ABERTURA` passa verde sobre o defeito que
   * ela existe para pegar. Foi assim que o mutante 8 escapou na primeira rodada deste arquivo.
   *
   * RODANDO COM O CÓDIGO RENOMEADO, os dois caminhos divergem e a regra volta a medir alguma coisa.
   * É o mesmo argumento da B2, agora aplicado ao teste em vez de ao código: o catálogo é do diretor,
   * e o código é renomeável.
   */
  codigoAbertura: string = CODIGO_ABERTURA,
): Promise<Violacao[]> {
  const v: Violacao[] = [];
  const anotar = (regra: string, dano: string) => v.push({ regra, dano });

  const montar = (ajuste: Parameters<typeof bancoDoReabrir>[0] = {}) => {
    const banco = bancoDoReabrir({
      pessoas: CENARIO_NOVO(),
      eventos: [eventoDeCancelamento(EVENTO_1)],
      ...ajuste,
    });
    return { banco, porta: fabrica(banco) };
  };

  // ── A. A PRÉVIA: QUEM SAIU NAQUELE CANCELAMENTO ─────────────────────────────
  {
    const { porta } = montar();
    const previa = await porta.previa(VAGA, MASTER);
    const ids = previa.candidaturas.map((c) => c.candidaturaId);

    if (ids.includes("cand-Caio")) {
      anotar(
        "RESSUSCITA_QUEM_DESISTIU",
        "a pessoa que DESISTIU por vontade própria, com motivo digitado à mão, volta viva para uma vaga que ela recusou. Existe na base hoje: `DESISTIU` com motivo 'desnvicular da vaga para teste' numa vaga cancelada dez horas depois.",
      );
    }
    if (ids.includes("cand-Dora")) {
      anotar(
        "RESSUSCITA_DESCARTE_MANUAL",
        "quem foi descartado À MÃO com o texto 'Vaga cancelada: X' volta junto. O motivo de descarte é campo LIVRE, digitável: qualquer um o reproduz sem querer, e o conjunto passa a ser definido por texto de operação.",
      );
    }
    if (ids.includes("cand-Flavia")) {
      anotar(
        "OFERECE_QUEM_NAO_SAIU",
        "uma candidatura que NUNCA saiu (APROVADO, que não segura o cancelamento) aparece na lista de quem volta. Reativar quem já está vivo não desfaz nada e reescreve a situação real de alguém que foi aprovado de verdade.",
      );
    }
    for (const id of QUEM_VOLTA) {
      if (!ids.includes(id)) {
        anotar(
          "PREVIA_INCOMPLETA",
          `${id} saiu naquele cancelamento e não apareceu na prévia. Quem o cancelamento derrubou tem de poder voltar, senão a reabertura não desfaz o que o cancelamento fez.`,
        );
      }
    }

    // ── B. A ORIGEM É LIDA, NUNCA ADIVINHADA ──────────────────────────────────
    const eli = previa.candidaturas.find((c) => c.candidaturaId === "cand-Eli");
    if (eli && eli.situacaoOrigem !== "ATIVO") {
      anotar(
        "INVENTA_ENTREGA",
        "a pessoa saiu ATIVO com `posicao_lado = OFICIAL` pendurado da reversão de um envio, e a prévia a devolve como ALOCADA. Adivinhar 'tem lado, logo estava alocado' INVENTA uma entrega que nunca houve, e existe uma linha assim na base agora.",
      );
    }
    if (eli && eli.posicaoLadoOrigem !== null) {
      anotar(
        "INVENTA_LADO",
        "o lado de origem foi lido do `posicao_lado` ATUAL da candidatura, e não do `posicao_lado_origem` GRAVADO na saída. O lado atual sobrevive à reversão do envio, então ele descreve o passado, não a saída.",
      );
    }
    const bia = previa.candidaturas.find((c) => c.candidaturaId === "cand-Bia");
    if (bia && (bia.situacaoOrigem !== "ALOCADO" || bia.posicaoLadoOrigem !== "OFICIAL")) {
      anotar(
        "PERDE_A_ENTREGA",
        "quem estava ALOCADO no lado OFICIAL não volta com a alocação. A vaga reaberta passa a mostrar uma posição vazia que estava ocupada, e o cilindro mente.",
      );
    }
    if (previa.origem !== "COM_ORIGEM") {
      anotar(
        "ORIGEM_MENTE_PARA_MENOS",
        `todas as saídas deste cancelamento têm origem gravada e a prévia respondeu \`${String(previa.origem)}\`. A tela avisaria o diretor de uma perda que não existe, e no caminho SEM_ORIGEM ela ainda devolveria todo mundo EM SELEÇÃO, jogando fora as alocações que o sistema sabia recompor.`,
      );
    }
    if (previa.podeReabrir !== true) {
      anotar(
        "PODE_REABRIR_NEGA_MASTER",
        "o Master vê `podeReabrir: false`. O botão fica inerte para quem tem a autoridade.",
      );
    }

    /*
     * MOTIVO E DATA DA SAÍDA, exigência do `seguranca`: sem eles o Master escolhe RECONHECENDO
     * NOME, que é o mesmo gesto que a ciência de reentrada existe para impedir. "Descartado por
     * perfil não aderente em 03/2025" e "descartado no dia do cancelamento" não podem ser a mesma
     * linha na tela.
     */
    for (const c of previa.candidaturas.map((x) => x as unknown as Record<string, unknown>)) {
      if (!("motivoSaida" in c) || !("saidaEm" in c)) {
        anotar(
          "PREVIA_SEM_MOTIVO_E_DATA",
          `${String(c.candidaturaId)} veio sem \`motivoSaida\`/\`saidaEm\`. O Master passa a decidir por reconhecimento de nome, e é exatamente isso que a ciência de reentrada existe para impedir.`,
        );
        break;
      }
      if (!("anonimizado" in c)) {
        anotar(
          "PREVIA_SEM_MARCA_DE_ANONIMIZADO",
          `${String(c.candidaturaId)} veio sem \`anonimizado\`. Quem a retenção já expurgou apareceria clicável, e restaurá-lo desfaria o apagamento pela porta dos fundos (§A.6).`,
        );
        break;
      }
    }
    const ana = previa.candidaturas.find((c) => c.candidaturaId === "cand-Ana");
    if (ana && ana.saidaEm === null) {
      anotar(
        "SAIDA_EM_VAZIA_COM_EVENTO",
        "a saída tem evento gravado, com data, e a prévia devolveu `saidaEm: null`. A data está no histórico; não devolvê-la é jogar fora o dado que distingue a saída recente da antiga.",
      );
    }

    // §A.6: a prévia viaja para a tela e não pode levar dado pessoal além do nome.
    for (const c of previa.candidaturas) {
      const proibidas = Object.keys(c).filter((k) => /cpf|email|telefone|nascimento/i.test(k));
      if (proibidas.length > 0) {
        anotar(
          "PREVIA_VAZA_DADO_PESSOAL",
          `a prévia carrega ${proibidas.join(", ")}. §A.6: a tela precisa do nome para o diretor escolher, e de mais nada.`,
        );
      }
    }
  }

  // ── C. O CONJUNTO NÃO É POR TEXTO, DITO SOBRE A CONSULTA ────────────────────
  {
    const { banco, porta } = montar();
    await porta.previa(VAGA, MASTER);
    const doConjunto = banco.leituras.filter(
      (l) => l.tabela === "as_candidaturas" || l.tabela === "as_candidatura_etapas",
    );
    if (doConjunto.length === 0) {
      anotar(
        "PREVIA_NAO_CONSULTA_O_CONJUNTO",
        "a prévia não leu `as_candidaturas` nem `as_candidatura_etapas`. Sem consulta não há conjunto, e a lista veio de outro lugar.",
      );
    }
    const colunas = doConjunto.flatMap((l) => colunasDoWhere(l.where));
    const literais = doConjunto.flatMap((l) => literaisDoWhere(l.where));
    if (colunas.some((c) => /motivo_descarte|\.motivo$/.test(c))) {
      anotar(
        "CONJUNTO_POR_TEXTO",
        "o conjunto é filtrado pelo TEXTO do motivo, que é campo LIVRE e digitável à mão. Ele não distingue dois cancelamentos da mesma vaga, e casa com quem alguém descartou escrevendo a mesma frase.",
      );
    }
    if (literais.some((l) => /vaga cancelada/i.test(l))) {
      anotar(
        "CONJUNTO_POR_FRASE_LITERAL",
        "a consulta compara com a frase 'Vaga cancelada'. Mudar o texto do motivo em produção quebra a reabertura em silêncio, e ninguém liga uma coisa à outra.",
      );
    }
    if (!colunas.some((c) => /vaga_status_evento_id/.test(c))) {
      anotar(
        "CONJUNTO_SEM_REFERENCIA_AO_EVENTO",
        "havendo evento de cancelamento gravado, o filtro não citou `as_candidatura_etapas.vaga_status_evento_id`. Sem ele não há como saber QUAL cancelamento derrubou cada pessoa, e a segunda reabertura da mesma vaga traz gente da primeira.",
      );
    }
  }

  // ── D. O ESCOPO É O ÚLTIMO CANCELAMENTO, E SÓ ELE ───────────────────────────
  {
    const banco = bancoDoReabrir({
      /*
       * A MESMA PESSOA, DUAS CANDIDATURAS, DOIS CANCELAMENTOS: ela saiu no primeiro, foi realocada
       * depois da reabertura (candidatura nova, que é o que a reentrada cria) e saiu de novo no
       * segundo. A vaga tem UMA posição oficial, e é isso que torna o erro caro: a restauração NÃO
       * passa pela trava de capacidade da alocação, então trazer os dois conjuntos de uma vez põe
       * duas pessoas numa vaga de uma. E, antes disso, esbarra no unique parcial das vivas.
       */
      posicoesOficiais: 1,
      pessoas: [
        pessoa("Ana", "DESCARTADO", {
          saidas: [
            {
              vagaStatusEventoId: EVENTO_1,
              situacaoOrigem: "ALOCADO",
              posicaoLadoOrigem: "OFICIAL",
              ocorridoEm: new Date("2026-09-01T10:00:00.000Z"),
            },
          ],
        }),
        pessoa("Ana", "DESCARTADO", {
          id: "cand-Ana-2",
          saidas: [
            {
              vagaStatusEventoId: EVENTO_2,
              situacaoOrigem: "ALOCADO",
              posicaoLadoOrigem: "OFICIAL",
            },
          ],
        }),
      ],
      eventos: [
        eventoDeCancelamento(EVENTO_1, new Date("2026-09-01T10:00:00.000Z")),
        eventoDeCancelamento(EVENTO_2, T0),
      ],
    });
    const porta = fabrica(banco);
    const ids = (await porta.previa(VAGA, MASTER)).candidaturas.map((c) => c.candidaturaId);
    if (ids.length !== 1 || ids[0] !== "cand-Ana-2") {
      anotar(
        "MISTURA_CANCELAMENTOS",
        `a prévia devolveu ${JSON.stringify(ids)} em vez de só o conjunto do ÚLTIMO cancelamento. Ler TODOS os eventos da vaga (e não o último) deixa o Master restaurar gente de cancelamentos anteriores: a capacidade da vaga estoura, porque a restauração não passa pela trava da alocação, e antes disso o unique parcial das candidaturas vivas derruba a transação inteira.`,
      );
    }
    const e = await erro(() =>
      porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana", "cand-Ana-2"] }, MASTER),
    );
    if (e instanceof ViolacaoDeUniqueFingida) {
      anotar(
        "REATIVACAO_ESTOURA_O_UNIQUE",
        "reativar as duas saídas da mesma pessoa na mesma vaga bateu no unique parcial `uq_as_candidaturas_viva`. Em produção isso é um 23505 que derruba a transação inteira: ninguém é reaberto, e o que chega na tela é erro de banco.",
      );
    }
  }

  // ── E. A REABERTURA COM SELEÇÃO ─────────────────────────────────────────────
  {
    const { banco, porta } = montar();
    await porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana", "cand-Bia"] }, MASTER);

    const ana = vivaDe(banco, "Ana");
    const bia = vivaDe(banco, "Bia");
    const eli = candidaturaDe(banco, "cand-Eli")!;

    if (ana?.situacao !== "ATIVO") {
      anotar(
        "NAO_VOLTA_PARA_A_ORIGEM_ATIVO",
        `quem saiu ATIVO não voltou viva como ATIVO (ficou ${String(ana?.situacao ?? "sem candidatura viva")}). A pessoa reaparece num estado que ela nunca teve, ou não reaparece.`,
      );
    }
    if (bia?.situacao !== "ALOCADO") {
      anotar(
        "NAO_VOLTA_PARA_A_ORIGEM_ALOCADO",
        `quem saiu ALOCADO não voltou viva como ALOCADO (ficou ${String(bia?.situacao ?? "sem candidatura viva")}). A posição entregue some do cilindro da vaga reaberta.`,
      );
    }
    if (bia?.situacao === "ALOCADO" && bia.posicaoLado !== "OFICIAL") {
      anotar(
        "VOLTA_ALOCADA_SEM_LADO",
        "quem voltou ALOCADA está sem o lado da posição. `ocupadasPorLado` conta pelo lado: sem ele a pessoa ocupa a vaga e não aparece em cilindro nenhum.",
      );
    }
    if (eli.situacao !== "DESCARTADO") {
      anotar(
        "REATIVA_QUEM_NAO_FOI_ESCOLHIDO",
        "quem estava no conjunto mas NÃO foi selecionado voltou junto. A escolha do Master é a lista, e não o conjunto inteiro.",
      );
    }
    if (ana && ana.motivoDescarte !== null) {
      anotar(
        "MOTIVO_DE_DESCARTE_NAO_LIMPO",
        "a pessoa volta VIVA carregando o motivo pelo qual saiu. A ficha dela passa a dizer que ela foi descartada por uma vaga que voltou a existir.",
      );
    }

    for (const e of escritasEm(banco, "as_candidaturas")) {
      if (e.tipo !== "update") continue;
      const colunas = colunasDaEscrita(e);
      if (colunas.length === 0) {
        anotar(
          "REATIVACAO_SEM_CLAUSULA",
          "um `update` sem `where` varreria a tabela inteira e alcançaria candidatura de outras vagas.",
        );
      } else if (!colunas.includes("as_candidaturas.id")) {
        anotar(
          "REATIVACAO_POR_VAGA_E_NAO_POR_ID",
          `o \`update\` alcança por ${colunas.join(", ")} em vez de pelo \`id\` de cada selecionado. Um \`where vaga_id = ...\` toca TODA candidatura da vaga, inclusive a de quem o Master NÃO escolheu, e o carimbo de \`atualizado_em\` reinicia em silêncio os dois anos de retenção do dado pessoal de quem já saiu (§A.6).`,
        );
      }
      if (!e.naTransacao) {
        anotar(
          "REATIVACAO_FORA_DA_TRANSACAO",
          "a reativação está fora da transação: se a gravação da vaga reverter, a pessoa fica viva numa vaga que continua cancelada.",
        );
      }
      for (const id of e.alcancou) {
        if (QUEM_NAO_VOLTA.includes(id) || id === "cand-Eli") {
          anotar(
            "ESCRITA_ALCANCA_QUEM_NAO_FOI_ESCOLHIDO",
            `a escrita alcançou ${id}, que não foi selecionado. Qualquer escrita nele, inclusive um carimbo de cortesia, mexe no relógio do expurgo de quem já saiu (§A.6).`,
          );
        }
      }
    }

    if (escritasEm(banco, "as_candidatura_etapas").length < 2) {
      anotar(
        "REATIVACAO_SEM_EVENTO_NA_LINHA_DO_TEMPO",
        "a volta não virou evento no histórico de cada candidatura. Depois dela, a linha do tempo mostra uma saída sem nenhum retorno, e o processo passa a ter buraco.",
      );
    }
    for (const e of escritasEm(banco, "as_candidatura_etapas")) {
      if (e.valores.situacao) {
        anotar(
          "RETORNO_GRAVADO_COMO_DESFECHO",
          `o evento do RETORNO gravou \`situacao: ${String(e.valores.situacao)}\`. \`tipoDoEvento\` (domain/candidatura-historico) deriva DESFECHO de \`situacao\` preenchida, e ela vence os outros testes: a linha do tempo passa a mostrar a VOLTA como mais um ENCERRAMENTO, logo depois do encerramento de verdade, e quem ler a ficha entende o oposto do que aconteceu. É também o que mantém esta linha fora do conjunto do próximo reabrir.`,
        );
      }
      if (e.valores.aceite) {
        anotar(
          "ACEITE_NO_CAMINHO_COM_ORIGEM",
          `o retorno gravou o aceite \`${String(e.valores.aceite)}\` num cancelamento COM origem gravada. Ali o sistema está DESFAZENDO O PRÓPRIO GESTO, com o retrato de onde cada um estava: não há guarda destravada, e um aceite que aparece sempre deixa de significar alguma coisa quando alguém for auditar quantas vezes a guarda foi atravessada.`,
        );
      }
    }

    const naVaga = escritasEm(banco, "vagas");
    if (naVaga.length !== 1) {
      anotar(
        "VAGA_GRAVADA_MAIS_DE_UMA_VEZ",
        `a vaga recebeu ${naVaga.length} gravações. O estado 'reaberta pela metade' não pode existir nem por um instante.`,
      );
    }
    const gravado: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(naVaga[0]?.valores ?? {})) gravado[normalizar(k)] = val;

    if (gravado.status !== codigoAbertura) {
      anotar(
        "DESTINO_NAO_E_O_PAPEL_DE_ABERTURA",
        `a vaga foi para ${String(gravado.status)}. O destino é sempre o código do papel ABERTURA, resolvido no servidor pelo catálogo, e nunca o literal "ABERTA".`,
      );
    }
    if (!("status" in gravado) || !("encerradaem" in gravado)) {
      anotar(
        "STATUS_E_ENCERRADA_EM_EM_GRAVACOES_DIFERENTES",
        "o status e o `encerrada_em` não saíram no MESMO `update`. Limpar o carimbo sem mover o status (ou o contrário) cria um zumbi: vaga encerrada sem data de encerramento, que o relógio do expurgo lê como 'prazo sem início', e ela fica retendo dado pessoal para sempre.",
      );
    }
    for (const campo of [
      "canceladaem",
      "canceladaporid",
      "cancelamentomotivo",
      "cancelamentoobservacao",
      "cancelamentoforcadoporid",
      "cancelamentoforcadoem",
      "cancelamentoforcadoseguravam",
      "datafechamento",
      "vagasfechadas",
      "vagasfechadasbanco",
      "encerradaem",
    ]) {
      if (!(campo in gravado)) {
        anotar(
          `NAO_LIMPA_${campo.toUpperCase()}`,
          `o campo \`${campo}\` não foi tocado na reabertura. Ele descreve um encerramento que deixou de valer e vai continuar sendo lido: contador de dias, cilindro de ocupação e, no caso do \`encerrada_em\`, o relógio do expurgo (§A.6). A cópia do fato sobrevive em \`as_vaga_status_eventos.observacao\`, e é por isso que limpar aqui é o combinado do \`cancelar\`, não uma escolha nova.`,
        );
      } else if (gravado[campo] !== null) {
        anotar(
          `LIMPEZA_PARCIAL_${campo.toUpperCase()}`,
          `\`${campo}\` foi gravado como ${JSON.stringify(gravado[campo])} em vez de nulo. Vaga viva com carimbo de encerramento é o pior dos dois estados: ela anda e continua contando como terminada.`,
        );
      }
    }

    const trilha = escritasEm(banco, "as_vaga_status_eventos");
    if (trilha.length !== 1) {
      anotar(
        "REABERTURA_SEM_TRILHA",
        `a reabertura gravou ${trilha.length} eventos de status. Desfazer um encerramento sem trilha é mudança de estado sem autor, e a limpeza acima leva embora a única cópia do fato.`,
      );
    } else if (!trilha[0].naTransacao) {
      anotar(
        "TRILHA_FORA_DA_TRANSACAO",
        "a trilha está fora da transação: ela some quando a transação reverte, e sobra uma vaga reaberta sem ninguém responsável.",
      );
    } else {
      const valores = Object.values(trilha[0].valores);
      if (!valores.includes(MASTER.id)) {
        anotar(
          "TRILHA_SEM_AUTOR_DA_SESSAO",
          "o evento da reabertura não registra quem reabriu, vindo da sessão.",
        );
      }
      if (!valores.includes(codigoAbertura)) {
        anotar("TRILHA_SEM_DESTINO", "o evento não diz para onde a vaga voltou.");
      }
      if (!valores.includes(CODIGO_CANCELAMENTO)) {
        anotar(
          "TRILHA_SEM_ORIGEM",
          "o evento não diz de ONDE a vaga voltou. A linha do tempo passa a ter um 'virou ABERTA' sem dizer que antes ela estava cancelada.",
        );
      }
    }

    /*
     * QUEM JÁ VOLTOU NÃO É OFERECIDO DE NOVO, e isto é PROPRIEDADE, não mecanismo: cada
     * implementação pode consegui-la de um jeito (filtrar quem está vivo, não carimbar o marcador no
     * retorno, gravar o retorno sem situação). O que não pode é a pessoa reaparecer na lista, porque
     * escolhê-la seria uma escolha condenada: ela já está viva, e reativá-la de novo bate no unique
     * parcial das candidaturas vivas e derruba a transação inteira.
     */
    const depois = await porta.previa(VAGA, MASTER);
    for (const id of ["cand-Ana", "cand-Bia"]) {
      if (depois.candidaturas.some((c) => c.candidaturaId === id)) {
        anotar(
          "RETORNO_VOLTA_AO_CONJUNTO",
          `${id} foi restaurada e continua aparecendo na lista de quem pode voltar. O Master a seleciona de novo, e a segunda reativação bate no unique parcial \`uq_as_candidaturas_viva\`: a transação inteira cai, e ninguém do lote volta.`,
        );
      }
    }

    const trava = banco.ordem.indexOf("trava:vagas");
    const grava = banco.ordem.findIndex((g) => g.startsWith("update:vagas"));
    if (trava < 0) {
      anotar(
        "SEM_LOCK_NA_VAGA",
        "a decisão foi tomada sem `SELECT ... FOR UPDATE` na linha da vaga. Duas reaberturas simultâneas, ou uma reabertura no meio de um cancelamento, decidem sobre a fotografia errada.",
      );
    } else if (grava >= 0 && grava < trava) {
      anotar("GRAVA_ANTES_DE_TRAVAR", "a gravação aconteceu antes do lock, que então não protege nada.");
    }
  }

  // ── F. O ID FORA DO CONJUNTO É RECUSADO, NÃO IGNORADO ───────────────────────
  {
    for (const [caso, id] of [
      ["quem desistiu por vontade própria", "cand-Caio"],
      ["quem foi descartado à mão com o mesmo texto", "cand-Dora"],
      ["quem continua APROVADO e nunca saiu", "cand-Flavia"],
      ["uma candidatura de outra vaga", "cand-de-outra-vaga"],
    ] as const) {
      const { banco, porta } = montar();
      const e = await erro(() => porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana", id] }, MASTER));
      if (e === null) {
        anotar(
          "ACEITA_ID_FORA_DO_CONJUNTO",
          `um id fora do conjunto (${caso}) passou sem recusa. Ignorar em silêncio é pior que recusar: o Master mandou reativar duas pessoas, o sistema reativa uma e diz que deu tudo certo.`,
        );
      }
      if (banco.escritas.length > 0) {
        anotar(
          "RECUSA_DEIXA_MEIA_MUDANCA",
          `a recusa (${caso}) gravou ${banco.escritas.length} vez(es). Recusa que já escreveu não é recusa.`,
        );
      }
      if (vivaDe(banco, "Ana")) {
        anotar(
          "RECUSA_REATIVA_O_RESTO",
          "a recusa reativou os ids válidos do mesmo pedido. A operação é atômica: ou vale a lista inteira, ou nada.",
        );
      }
    }
  }

  // ── G. §A.6: O CAMINHO EM QUE NINGUÉM É SELECIONADO NÃO TOCA CANDIDATURA ────
  {
    for (const [caso, corpo] of [
      ["lista vazia", { candidaturaIds: [] }],
      ["sem a chave", {}],
    ] as const) {
      const { banco, porta } = montar();
      await erro(() => porta.reabrir(VAGA, corpo as Record<string, unknown>, MASTER));
      const tocou = escritasEm(banco, "as_candidaturas");
      if (tocou.length > 0) {
        anotar(
          "TOCA_CANDIDATURA_SEM_SELECAO",
          `reabrir sem trazer ninguém (${caso}) escreveu em \`as_candidaturas\` (${tocou.length} vez(es), alcançando ${JSON.stringify(tocou.flatMap((t) => t.alcancou))}). O RELÓGIO DO EXPURGO conta do \`atualizado_em\` da candidatura de quem está descartado: qualquer escrita, inclusive um carimbo de cortesia, EMPURRA DOIS ANOS de retenção de dado pessoal de gente que já saiu (§A.6). É o defeito mais silencioso da onda: nada falha, ninguém percebe, e o dado fica.`,
        );
      }
      if (escritasEm(banco, "as_candidatura_etapas").length > 0) {
        anotar(
          "HISTORICO_SEM_SELECAO",
          `reabrir sem trazer ninguém (${caso}) escreveu no histórico de candidatura. Ninguém se moveu: não há evento a registrar.`,
        );
      }
    }
  }

  // ── H. §A.6: QUEM VOLTA FICA PROTEGIDO, E QUEM FICA NÃO É MEXIDO ────────────
  {
    const { banco, porta } = montar();
    await porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);
    const ana = vivaDe(banco, "Ana");
    const vagaViva = banco.vaga.encerradaEm === null && banco.vaga.status === codigoAbertura;
    if (!ana || !vagaViva) {
      anotar(
        "REATIVADO_NAO_FICA_PROTEGIDO",
        `depois da volta, situação viva=${String(ana?.situacao)}, status da vaga=${String(banco.vaga.status)}, encerrada_em=${String(banco.vaga.encerradaEm)}. A proteção do expurgo é 'situação VIVA em vaga NÃO ENCERRADA' (\`retencao-candidatos.service\`): faltando qualquer metade, o prazo de dois anos CONTINUA CORRENDO para alguém que voltou a estar em processo, e a varredura o anonimiza no meio da seleção.`,
      );
    }
    const naoEscolhida = candidaturaDe(banco, "cand-Eli")!;
    if (Number(naoEscolhida.atualizadoEm) !== Number(T0)) {
      anotar(
        "RELOGIO_DE_QUEM_FICOU_FOI_MEXIDO",
        `o \`atualizado_em\` de quem NÃO foi selecionado mudou (${String(naoEscolhida.atualizadoEm)}). Para quem está DESCARTADO é ele o relógio do expurgo: mexer nele EMPURRA a retenção do dado pessoal de quem já saiu, e a §A.6 pede minimização, não prorrogação.`,
      );
    }
    const flavia = candidaturaDe(banco, "cand-Flavia")!;
    const flaviaIntacta =
      flavia.situacao === "APROVADO" &&
      Number(flavia.atualizadoEm) === Number(new Date("2026-03-01T09:00:00.000Z"));
    if (!flaviaIntacta) {
      anotar(
        "APROVADA_FOI_TOCADA",
        "a candidatura APROVADA, que não saiu no cancelamento, foi alterada pela reabertura. Ela não é do conjunto: o que a reabertura faz por ela é devolver a vaga ao mundo dos vivos, e isso já basta para o expurgo voltar a protegê-la, sem escrever uma linha na candidatura dela.",
      );
    }
  }

  // ── I. RBAC: O REABRIR NÃO TEM VERSÃO NORMAL ────────────────────────────────
  {
    const { banco, porta } = montar();
    const e = await erro(() => porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, COMUM));
    if (e === null) {
      anotar(
        "COMUM_REABRE",
        "o COMUM reabriu a vaga. É o OPOSTO do `fechar` e do `cancelar`, que são do consultor: desfazer um encerramento é do Master, e o service reconfere além do guard da rota.",
      );
    } else if (!(e instanceof ForbiddenException)) {
      anotar(
        "RECUSA_DO_COMUM_NAO_E_403",
        `a recusa do COMUM veio como ${(e as Error)?.constructor?.name}. Ela precisa ser 403 com mensagem, e não um erro genérico: o botão não se esconde, o sistema DIZ que só o Master reabre.`,
      );
    }
    if (banco.escritas.length > 0) {
      anotar(
        "COMUM_ESCREVE",
        `a recusa do COMUM gravou ${banco.escritas.length} vez(es) antes de recusar.`,
      );
    }
  }
  {
    const { banco, porta } = montar();
    const e = await erro(() =>
      porta.reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana"], papel: "SUPER_ADMIN", user: { papel: "MASTER" } },
        COMUM,
      ),
    );
    if (e === null || banco.escritas.length > 0) {
      anotar(
        "PAPEL_VEM_DO_CORPO",
        "um `papel` mandado no CORPO promoveu o COMUM. A autoridade é o `AuthUser` da sessão, sempre.",
      );
    }
  }
  {
    for (const user of [MASTER, SUPER]) {
      const { banco, porta } = montar();
      const e = await erro(() => porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, user));
      if (banco.vaga.status !== codigoAbertura) {
        anotar(
          "MASTER_OU_SUPER_BARRADO",
          `o ${user.papel} não conseguiu reabrir (${String((e as Error)?.message ?? "sem erro, e mesmo assim a vaga não mudou")}). A régua é 'MASTER e SUPER_ADMIN', e o \`RolesGuard\` NÃO promove o SUPER_ADMIN sozinho: ele confere \`required.includes(papel)\` e LANÇA antes de chegar na linha que trata o SUPER_ADMIN (roles.guard.ts:46). Um \`@Roles("MASTER")\` sozinho barra o diretor, e um teste que só afirme "o COMUM leva 403" passa verde com ele.`,
        );
      }
    }
  }

  // ── J. A ORIGEM É SÓ O PAPEL DE CANCELAMENTO ────────────────────────────────
  {
    for (const [papel, codigo] of [
      ["ENTREGA", CODIGO_ENTREGA],
      ["FECHAMENTO", CODIGO_FECHAMENTO],
      ["ABERTURA", codigoAbertura],
    ] as const) {
      const { banco, porta } = montar({ status: codigo });
      const e = await erro(() => porta.reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER));
      if (e === null || banco.escritas.length > 0) {
        anotar(
          "ORIGEM_ACEITA_OUTRO_PAPEL",
          `a vaga no papel ${papel} foi reaberta por este caminho. Reabrir desfaz um CANCELAMENTO: aplicá-lo à vaga ENTREGUE apaga a entrega e zera os contadores de quem foi contratado de verdade; aplicá-lo à FECHADA desfaz um fechamento que tem régua própria.`,
        );
      }
    }
  }

  // ── K. O DESTINO NÃO VEM DO CORPO ───────────────────────────────────────────
  {
    const { banco, porta } = montar();
    await erro(() =>
      porta.reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana"], status: CODIGO_ENTREGA, destino: CODIGO_ENTREGA },
        MASTER,
      ),
    );
    if (banco.vaga.status === CODIGO_ENTREGA) {
      anotar(
        "DESTINO_VEM_DO_CORPO",
        "o corpo escolheu o destino e a vaga foi parar em ENTREGUE. O destino é sempre `codigoDoPapel('ABERTURA')`, resolvido no servidor: pelo corpo, esta rota vira a porta sem régua para qualquer status, inclusive os que encerram.",
      );
    }
  }

  // ── L. O CANCELAMENTO NORMAL: EVENTO SEM NINGUÉM DENTRO ─────────────────────
  {
    const banco = bancoDoReabrir({
      pessoas: CENARIO_NORMAL(),
      eventos: [eventoDeCancelamento(EVENTO_1)],
    });
    const porta = fabrica(banco);
    const previa = await porta.previa(VAGA, MASTER);
    const ids = previa.candidaturas.map((c) => c.candidaturaId);

    if (ids.length > 0) {
      anotar(
        "VAZIO_VIRA_ANTIGO",
        `o cancelamento NORMAL (evento gravado, ninguém encerrado por ele) devolveu ${JSON.stringify(ids)} em vez de lista vazia. O discriminador usado foi "a lista veio vazia, logo é cancelamento antigo", e ele oferece para ressurreição exatamente QUEM A SELEÇÃO RECUSOU POR MÉRITO ("perfil não aderente", "reprovado na entrevista"). O discriminador é "EXISTE EVENTO DE CANCELAMENTO?", medido no \`cancelar\`: o evento é inserido SEMPRE, e as candidaturas só são encerradas dentro do \`if (forcado)\`.`,
      );
    }
    if (previa.origem !== "NINGUEM_DESCARTADO") {
      anotar(
        "ORIGEM_NAO_DISTINGUE_O_NORMAL",
        `a prévia respondeu \`${String(previa.origem)}\` num cancelamento que não descartou ninguém. São TRÊS estados, e o booleano de antes escondia justamente este: \`NINGUEM_DESCARTADO\` é o que faz a tela dizer "não há nada a desfazer" em vez de mostrar uma lista de gente que saiu por outro motivo.`,
      );
    }

    const e = await erro(() => porta.reabrir(VAGA, { candidaturaIds: ["cand-Recusada"] }, MASTER));
    if (e === null || banco.escritas.some((x) => x.tabela === "as_candidaturas")) {
      anotar(
        "REABRE_QUEM_A_SELECAO_RECUSOU",
        "o reabrir aceitou restaurar quem foi descartado POR MÉRITO num cancelamento que não descartou ninguém. Não basta a prévia esconder: o servidor é a autoridade, e a lista de ids vem do cliente.",
      );
    }
  }

  // ── M. O CANCELAMENTO ANTIGO, SEM ORIGEM GRAVADA (hoje, o ÚNICO que existe) ─
  {
    const banco = bancoDoReabrir({ pessoas: CENARIO_ANTIGO(), eventos: [] });
    const porta = fabrica(banco);
    const previa = await porta.previa(VAGA, MASTER);
    const ids = previa.candidaturas.map((c) => c.candidaturaId);

    if (ids.length === 0) {
      anotar(
        "ANTIGO_NAO_OFERECE_NINGUEM",
        "no cancelamento ANTIGO, sem evento gravado, a prévia veio vazia. Hoje esse é o ÚNICO caminho que existe (`as_vaga_status_eventos` tem zero linhas e há duas vagas canceladas): a reabertura nasceria inútil no primeiro clique do diretor.",
      );
    }
    if (ids.includes("cand-Desistente")) {
      anotar(
        "ANTIGO_OFERECE_QUEM_DESISTIU",
        "no caminho antigo a lista inclui quem DESISTIU por vontade própria. Sem marcador, a única leitura honesta é 'o cancelamento descarta', e DESCARTADO é o que ele escreve: ressuscitar uma desistência falseia um fato da pessoa, e é literalmente o caso que o diretor registrou no DIARIO.",
      );
    }
    for (const c of previa.candidaturas) {
      if (c.situacaoOrigem !== null || c.posicaoLadoOrigem !== null) {
        anotar(
          "INVENTA_ORIGEM_QUE_NAO_FOI_GRAVADA",
          `a saída não tem origem gravada e a prévia respondeu ${String(c.situacaoOrigem)}/${String(c.posicaoLadoOrigem)}. Isso é adivinhação, e ela erra sempre que a pessoa tinha lado pendurado (a 'Velha' do cenário tem).`,
        );
      }
    }
    if (previa.origem !== "SEM_ORIGEM") {
      anotar(
        "ORIGEM_MENTE_PARA_MAIS",
        `não há evento de cancelamento nenhum e a prévia respondeu \`${String(previa.origem)}\`. A tela deixa o diretor escolher achando que a pessoa volta para onde estava, e ela volta para outro lugar.`,
      );
    }

    // §A.6: quem a retenção já anonimizou aparece MARCADO, e o servidor RECUSA restaurá-lo.
    const fantasma = previa.candidaturas.find((c) => c.candidaturaId === "cand-Fantasma");
    if (!fantasma) {
      anotar(
        "ANONIMIZADO_SUMIU_DA_LISTA",
        "a pessoa já expurgada não aparece na lista. Sumir faz o Master procurar para sempre alguém que ele lembra que estava ali; aparecer MARCADA e recusada explica o que aconteceu.",
      );
    } else if (fantasma.anonimizado !== true) {
      anotar(
        "ANONIMIZADO_NAO_MARCADO",
        "a pessoa já expurgada aparece como qualquer outra, clicável. O Master a seleciona sem saber, e a tela convida alguém a redigitar os dados para 'consertar o fantasma'.",
      );
    }
    const negada = await erro(() =>
      porta.reabrir(VAGA, { candidaturaIds: ["cand-Fantasma"] }, MASTER),
    );
    if (negada === null || escritasEm(banco, "as_candidaturas").length > 0) {
      anotar(
        "RESTAURA_ANONIMIZADO",
        "o servidor restaurou uma candidatura de candidato JÁ ANONIMIZADO. Devolvê-la a um processo VIVO a protege de novo pela cláusula do expurgo: o apagamento da LGPD é DESFEITO pela porta dos fundos, e a linha volta a ser retida sem nunca mais vencer (§A.6).",
      );
    }

    await erro(() => porta.reabrir(VAGA, { candidaturaIds: ["cand-Velha"] }, MASTER));
    const volta = vivaDe(banco, "Velha");
    if (volta?.situacao !== "ATIVO") {
      anotar(
        "ORIGEM_NULA_NAO_VIRA_ATIVO",
        `sem origem gravada, a volta foi para ${String(volta?.situacao ?? "lugar nenhum")}. A régua é ATIVO: é o estado que NÃO afirma nada além de 'está em processo'. Voltar como ALOCADO ocuparia uma posição oficial que ninguém provou que ela tinha, e encheria o cilindro com uma entrega que talvez nunca tenha existido.`,
      );
    }
    /*
     * ─ O LADO PENDURADO NÃO VIRA REGRA, E A RETRATAÇÃO É MEDIDA ────────────────────────────────
     *
     * A primeira redação deste arquivo EXIGIA que a volta EM SELEÇÃO limpasse o `posicao_lado`
     * pendurado, com o argumento de que a vaga passaria a mostrar uma posição oficial tomada. O
     * argumento é FALSO, e foi medido: quem alimenta `ocupadasPorLado` é uma consulta filtrada por
     * `SITUACOES_QUE_CONSOMEM_POSICAO` (candidatos.service, linha ~1592), e `ATIVO` não está nela.
     * O lado pendurado numa linha ATIVA não conta em cilindro nenhum.
     *
     * E EXIGIR A LIMPEZA SERIA INVENTAR REQUISITO (§A.31): a linha `ATIVO` com lado OFICIAL já
     * EXISTE na base hoje, criada pela reversão do envio, que não limpa o lado de propósito. Limpar
     * ou não limpar aqui é escolha de quem constrói, e fica como pergunta no relatório, não como
     * teste vermelho.
     */
    const eventos = escritasEm(banco, "as_candidatura_etapas");
    if (!eventos.some((x) => x.valores.aceite === ACEITE_REABERTURA_SEM_ORIGEM)) {
      anotar(
        "SEM_ORIGEM_SEM_ACEITE",
        `o retorno no caminho SEM_ORIGEM não gravou o aceite \`${ACEITE_REABERTURA_SEM_ORIGEM}\` (gravou ${JSON.stringify(eventos.map((x) => x.valores.aceite ?? null))}). Ali o Master não está desfazendo um gesto do sistema: ele está RE-ESCOLHENDO uma pessoa que o sistema não sabe se saiu por causa do cancelamento. §A.3 regra 8: decisão que atravessa uma guarda vira log permanente e consultável, senão daqui a três meses ninguém sabe quem mandou aquela pessoa voltar nem sob que aviso.`,
      );
    }
  }

  return v;
}

/** Só os nomes das regras violadas. É o que os specs comparam. */
export const regrasVioladas = (v: Violacao[]): string[] => v.map((x) => x.regra);

/** A mensagem que o vermelho mostra: a regra E o dano, para o autor não precisar caçar contexto. */
export const explicar = (v: Violacao[]): string =>
  v.map((x) => `\n  • ${x.regra}: ${x.dano}`).join("");

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 7. A IMPLEMENTAÇÃO DE REFERÊNCIA (e os mutantes que ela gera)
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Os desvios que cada mutante aplica. Um por vez, como manda o roteiro. */
export interface DesvioDaReferencia {
  conjuntoPorTexto?: boolean;
  ignoraSituacaoDeOrigem?: boolean;
  aceitaIdForaDoConjunto?: boolean;
  carimbaSemSelecao?: boolean;
  semReconferenciaDePapel?: boolean;
  naoLimpaEncerradaEm?: boolean;
  encerradaEmComoData?: boolean;
  aceitaPapelEntrega?: boolean;
  literalDeStatus?: boolean;
  reativaConjuntoInteiro?: boolean;
  vazioViraAntigo?: boolean;
  atualizaPorVagaId?: boolean;
  restauraAnonimizado?: boolean;
  semAceiteSemOrigem?: boolean;
  todosOsEventos?: boolean;
  retornoComoDesfecho?: boolean;
  ofereceQuemJaVoltou?: boolean;
}

/** Uma linha do conjunto, já resolvida: é o que a prévia projeta e o que a volta consome. */
interface LinhaDoConjunto {
  candidaturaId: string;
  candidatoId: string;
  candidatoNome: string;
  etapaOrigem: string;
  situacaoOrigem: "ATIVO" | "ALOCADO" | null;
  posicaoLadoOrigem: PosicaoLado | null;
  motivoSaida: string | null;
  saidaEm: string | null;
  anonimizado: boolean;
}

/**
 * ─ UMA implementação que cumpre o requisito, escrita AQUI e NÃO em produção ────────────────────
 *
 * ELA NÃO É A IMPLEMENTAÇÃO ESPERADA, e o ponto é esse: o requisito nomeia a PROPRIEDADE, não o
 * desenho, e quem constrói pode escrever outra coisa que cumpra tudo. Esta existe por um motivo só:
 * dar ao contrato acima um comportamento SABIDAMENTE CORRETO para ele aprovar, e uma base de onde
 * derivar os mutantes que ele tem de reprovar. Sem isso, "meu teste pega o defeito?" é opinião.
 */
/**
 * O CONSTRUTOR DE CONSULTA DO FAKE, tipado para a referência conseguir encadear como o drizzle.
 * Ele é aguardável (`PromiseLike`) em qualquer ponto da cadeia, que é como o drizzle se comporta.
 */
interface ConstrutorFingido extends PromiseLike<unknown[]> {
  from(t: unknown): ConstrutorFingido;
  leftJoin(t: unknown, c?: unknown): ConstrutorFingido;
  innerJoin(t: unknown, c?: unknown): ConstrutorFingido;
  where(c: unknown): ConstrutorFingido;
  orderBy(...c: unknown[]): ConstrutorFingido;
  limit(n?: number): ConstrutorFingido;
  groupBy(...c: unknown[]): ConstrutorFingido;
  for(modo: string): ConstrutorFingido;
}

export function referenciaDoReabrir(
  banco: BancoDoReabrir,
  desvio: DesvioDaReferencia = {},
  codigoAbertura: string = CODIGO_ABERTURA,
): PortaDoReabrir {
  const db = banco.db as {
    select: (p?: unknown) => ConstrutorFingido;
    update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => Promise<void> } };
    insert: (t: unknown) => {
      values: (v: unknown) => Promise<unknown> & { returning: () => Promise<{ id: string }[]> };
    };
    transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  };

  const podeReabrir = (user: AuthUser) => user.papel === "MASTER" || user.papel === "SUPER_ADMIN";

  const cancelamentosDaVaga = () =>
    [...banco.eventos]
      .filter((e) => e.para === CODIGO_CANCELAMENTO && e.vagaId === VAGA)
      .sort((a, b) => Number(new Date(String(b.em))) - Number(new Date(String(a.em))));

  const comoTexto = (v: unknown): string | null =>
    v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v);

  /**
   * O CONJUNTO E O ESTADO DA ORIGEM, juntos, porque são a MESMA decisão: o discriminador é a
   * EXISTÊNCIA do evento, e não o tamanho da lista.
   */
  const lerConjunto = async (
    vagaId: string,
  ): Promise<{ linhas: LinhaDoConjunto[]; origem: AsVagaReabrirOrigem }> => {
    const eventos = cancelamentosDaVaga();
    const evento = eventos[0];

    const pelaCandidatura = async (): Promise<LinhaDoConjunto[]> => {
      const linhas = (await db
        .select({
          candidaturaId: asCandidaturas.id,
          candidatoId: asCandidaturas.candidatoId,
          candidatoNome: asCandidatos.nome,
          etapaOrigem: asCandidaturas.etapa,
          motivoSaida: asCandidaturas.motivoDescarte,
          saidaEm: asCandidaturas.atualizadoEm,
          anonimizadoEm: asCandidatos.anonimizadoEm,
        })
        .from(asCandidaturas)
        .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
        // SÓ `DESCARTADO`: é o que o cancelamento escreve. `DESISTIU` é vontade da pessoa.
        .where(and(eq(asCandidaturas.vagaId, vagaId), eq(asCandidaturas.situacao, "DESCARTADO")))
        .orderBy(asCandidatos.nome)) as unknown as Record<string, unknown>[];
      return linhas.map((l) => ({
        candidaturaId: String(l.candidaturaId),
        candidatoId: String(l.candidatoId),
        candidatoNome: String(l.candidatoNome),
        etapaOrigem: String(l.etapaOrigem),
        situacaoOrigem: null,
        posicaoLadoOrigem: null,
        motivoSaida: comoTexto(l.motivoSaida),
        saidaEm: comoTexto(l.saidaEm),
        anonimizado: l.anonimizadoEm !== null && l.anonimizadoEm !== undefined,
      }));
    };

    if (!evento) return { linhas: await pelaCandidatura(), origem: "SEM_ORIGEM" };

    const filtro = desvio.conjuntoPorTexto
      ? and(
          eq(asCandidaturas.vagaId, vagaId),
          isNotNull(asCandidaturas.motivoDescarte),
          like(asCandidaturas.motivoDescarte, "Vaga cancelada:%"),
        )
      : and(
          eq(asCandidaturas.vagaId, vagaId),
          // O MUTANTE LÊ TODOS OS EVENTOS DA VAGA; a referência lê SÓ O ÚLTIMO.
          desvio.todosOsEventos
            ? inArray(
                asCandidaturaEtapas.vagaStatusEventoId,
                eventos.map((e) => String(e.id)),
              )
            : eq(asCandidaturaEtapas.vagaStatusEventoId, String(evento.id)),
        );

    const linhas = (await db
      .select({
        candidaturaId: asCandidaturas.id,
        candidatoId: asCandidaturas.candidatoId,
        candidatoNome: asCandidatos.nome,
        etapaOrigem: asCandidaturaEtapas.etapaPara,
        situacaoOrigem: asCandidaturaEtapas.situacaoOrigem,
        posicaoLadoOrigem: asCandidaturaEtapas.posicaoLadoOrigem,
        motivoSaida: asCandidaturaEtapas.motivo,
        saidaEm: asCandidaturaEtapas.ocorridoEm,
        anonimizadoEm: asCandidatos.anonimizadoEm,
      })
      .from(asCandidaturaEtapas)
      .innerJoin(asCandidaturas, eq(asCandidaturas.id, asCandidaturaEtapas.candidaturaId))
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(filtro)
      .orderBy(asCandidatos.nome)) as unknown as Record<string, unknown>[];

    /*
     * O DISCRIMINADOR. Havendo evento e NINGUÉM apontando para ele, o cancelamento foi o NORMAL:
     * não há nada a desfazer, e cair no caminho antigo aqui ofereceria quem a seleção recusou.
     */
    if (linhas.length === 0) {
      if (desvio.vazioViraAntigo) return { linhas: await pelaCandidatura(), origem: "SEM_ORIGEM" };
      return { linhas: [], origem: "NINGUEM_DESCARTADO" };
    }

    const vivos = new Set(
      banco.pessoas
        .filter((p) => candidaturaViva(p.candidatura.situacao as CandidaturaSituacao))
        .map((p) => String(p.candidatura.candidatoId)),
    );

    return {
      // QUEM JÁ VOLTOU NÃO É OFERECIDO: escolhê-lo é escolha condenada pelo unique das vivas.
      linhas: linhas
        .filter((l) => desvio.ofereceQuemJaVoltou || !vivos.has(String(l.candidatoId)))
        .map((l) => ({
        candidaturaId: String(l.candidaturaId),
        candidatoId: String(l.candidatoId),
        candidatoNome: String(l.candidatoNome),
        etapaOrigem: String(l.etapaOrigem),
        situacaoOrigem: (l.situacaoOrigem ?? null) as "ATIVO" | "ALOCADO" | null,
        posicaoLadoOrigem: (l.posicaoLadoOrigem ?? null) as PosicaoLado | null,
        motivoSaida: comoTexto(l.motivoSaida),
        saidaEm: comoTexto(l.saidaEm),
        anonimizado: l.anonimizadoEm !== null && l.anonimizadoEm !== undefined,
      })),
      origem: "COM_ORIGEM",
    };
  };

  return {
    async previa(vagaId, user) {
      const { linhas, origem } = await lerConjunto(vagaId);
      return {
        vagaId,
        candidaturas: linhas.map((l) => ({
          candidaturaId: l.candidaturaId,
          candidatoId: l.candidatoId,
          candidatoNome: l.candidatoNome,
          etapaOrigem: l.etapaOrigem as CandidaturaEtapa,
          situacaoOrigem: l.situacaoOrigem,
          posicaoLadoOrigem: l.posicaoLadoOrigem,
          motivoSaida: l.motivoSaida,
          saidaEm: l.saidaEm,
          anonimizado: l.anonimizado,
        })),
        origem,
        podeReabrir: podeReabrir(user),
      };
    },

    async reabrir(vagaId, dto, user) {
      if (!desvio.semReconferenciaDePapel && !podeReabrir(user)) {
        throw new ForbiddenException({
          needsConfirmation: false,
          reason: "reabrirEhDeMaster",
          message: "Só o Master reabre uma vaga cancelada. Peça a reabertura a quem tem esse papel.",
        });
      }
      const ids = Array.isArray(dto.candidaturaIds) ? (dto.candidaturaIds as string[]) : [];
      const observacao = typeof dto.observacao === "string" ? dto.observacao.trim() : null;

      await db.transaction(async (txCru) => {
        const tx = txCru as typeof db;
        const [vaga] = (await tx
          .select({ id: vagas.id, status: vagas.status })
          .from(vagas)
          .where(eq(vagas.id, vagaId))
          .for("update")) as unknown as { id: string; status: string }[];
        if (!vaga) throw new BadRequestException("Vaga não encontrada.");

        const papeisAceitos = desvio.aceitaPapelEntrega
          ? [CODIGO_CANCELAMENTO, CODIGO_ENTREGA]
          : [CODIGO_CANCELAMENTO];
        if (!papeisAceitos.includes(vaga.status)) {
          throw new ConflictException(
            "Só uma vaga cancelada é reaberta por aqui. Recarregue a página.",
          );
        }

        const { linhas: conjunto, origem } = await lerConjunto(vagaId);
        const porId = new Map(conjunto.map((l) => [l.candidaturaId, l]));
        if (!desvio.aceitaIdForaDoConjunto) {
          const fora = ids.filter((id) => !porId.has(id));
          if (fora.length > 0) {
            throw new ConflictException(
              "Há candidatura fora do conjunto deste cancelamento. Recarregue a página.",
            );
          }
        }
        if (!desvio.restauraAnonimizado && ids.some((id) => porId.get(id)?.anonimizado)) {
          throw new ConflictException(
            "Há candidato já expurgado por retenção nesta seleção. Ele não volta ao processo: os dados dele foram apagados e não podem ser recuperados por aqui.",
          );
        }

        const escolhidos = desvio.reativaConjuntoInteiro
          ? conjunto.map((l) => l.candidaturaId)
          : ids;

        for (const id of escolhidos) {
          const linha = porId.get(id);
          if (!linha) continue;
          const destinoDaPessoa = desvio.ignoraSituacaoDeOrigem
            ? "ALOCADO"
            : ((linha.situacaoOrigem ?? "ATIVO") as CandidaturaSituacao);
          const lado =
            destinoDaPessoa === "ALOCADO" ? (linha.posicaoLadoOrigem ?? "OFICIAL") : null;
          await tx
            .update(asCandidaturas)
            .set({
              situacao: destinoDaPessoa,
              motivoDescarte: null,
              posicaoLado: lado,
              atualizadoEm: new Date(),
            })
            /*
             * POR ID, NUNCA POR `vaga_id`: um `where vaga_id = ...` alcançaria quem o Master NÃO
             * escolheu e reiniciaria o relógio de retenção dele (§A.6).
             */
            .where(
              desvio.atualizaPorVagaId
                ? eq(asCandidaturas.vagaId, vagaId)
                : eq(asCandidaturas.id, id),
            );
          await tx.insert(asCandidaturaEtapas).values({
            candidaturaId: id,
            etapaDe: null,
            etapaPara: linha.etapaOrigem,
            situacao: desvio.retornoComoDesfecho ? destinoDaPessoa : null,
            motivo: "Vaga reaberta",
            porId: user.id,
            // O ACEITE SÓ NO CAMINHO SEM ORIGEM: ali o Master RE-ESCOLHE a pessoa.
            aceite:
              origem === "SEM_ORIGEM" && !desvio.semAceiteSemOrigem
                ? ACEITE_REABERTURA_SEM_ORIGEM
                : null,
          });
        }

        if (desvio.carimbaSemSelecao && escolhidos.length === 0) {
          await tx
            .update(asCandidaturas)
            .set({ atualizadoEm: new Date() })
            .where(eq(asCandidaturas.vagaId, vagaId));
        }

        const destino = desvio.literalDeStatus ? "ABERTA" : codigoAbertura;
        await tx
          .update(vagas)
          .set({
            status: destino,
            canceladaEm: null,
            canceladaPorId: null,
            cancelamentoMotivo: null,
            cancelamentoObservacao: null,
            cancelamentoForcadoPorId: null,
            cancelamentoForcadoEm: null,
            cancelamentoForcadoSeguravam: null,
            dataFechamento: null,
            vagasFechadas: null,
            vagasFechadasBanco: null,
            ...(desvio.naoLimpaEncerradaEm
              ? {}
              : { encerradaEm: desvio.encerradaEmComoData ? new Date() : null }),
            atualizadoEm: new Date(),
          })
          .where(eq(vagas.id, vagaId));

        await tx.insert(asVagaStatusEventos).values({
          vagaId,
          de: CODIGO_CANCELAMENTO,
          para: destino,
          porId: user.id,
          observacao,
        });
      });
      return { id: vagaId };
    },
  };
}

/** Um mutante: o que foi quebrado, o dano em produção e a regra que TEM de acusar. */
export interface Mutante {
  nome: string;
  dano: string;
  desvio: DesvioDaReferencia;
  regraEsperada: string;
}

export const MUTANTES: Mutante[] = [
  {
    nome: "1. o conjunto volta a ser por TEXTO do motivo",
    dano: "quem DESISTIU por vontade própria e quem foi descartado à mão com a mesma frase voltam vivos para a vaga, e dois cancelamentos da mesma vaga viram um conjunto só.",
    desvio: { conjuntoPorTexto: true },
    regraEsperada: "CONJUNTO_POR_TEXTO",
  },
  {
    nome: "2. a situação de origem é ignorada e todo mundo volta ALOCADO",
    dano: "o sistema INVENTA entrega: quem estava só ATIVO reaparece ocupando posição oficial, e o cilindro da vaga passa a mostrar gente entregue que nunca foi.",
    desvio: { ignoraSituacaoDeOrigem: true },
    regraEsperada: "NAO_VOLTA_PARA_A_ORIGEM_ATIVO",
  },
  {
    nome: "3. o reabrir aceita id fora do conjunto",
    dano: "o Master manda reativar cinco, o sistema reativa três e responde sucesso. A diferença só aparece quando alguém der falta da pessoa.",
    desvio: { aceitaIdForaDoConjunto: true },
    regraEsperada: "ACEITA_ID_FORA_DO_CONJUNTO",
  },
  {
    nome: "4. o caminho 'ninguém selecionado' passa a carimbar `atualizado_em`",
    dano: "empurra DOIS ANOS de retenção de dado pessoal de quem já saiu, em silêncio (§A.6). Nada falha e ninguém percebe.",
    desvio: { carimbaSemSelecao: true },
    regraEsperada: "TOCA_CANDIDATURA_SEM_SELECAO",
  },
  {
    nome: "5. o service deixa de reconferir o papel (fica só o `@Roles` da rota)",
    dano: "qualquer caminho interno que não passe pelo guard reabre vaga sem autoridade, e o consultor volta a desfazer encerramento.",
    desvio: { semReconferenciaDePapel: true },
    regraEsperada: "COMUM_REABRE",
  },
  {
    nome: "6. `encerrada_em` deixa de ser limpo",
    dano: "a vaga volta a andar carregando o instante em que encerrou. O relógio do expurgo não APRESSA ninguém por causa disso (o `greatest` só empurra a data para frente), mas a coluna passa a descrever um estado que não existe, e mente de novo no dia em que a vaga encerrar outra vez.",
    desvio: { naoLimpaEncerradaEm: true },
    regraEsperada: "NAO_LIMPA_ENCERRADAEM",
  },
  {
    nome: "7. a origem passa a aceitar o papel ENTREGA",
    dano: "a vaga ENTREGUE é 'reaberta': a entrega é apagada, os contadores de quem foi contratado de verdade são zerados e o encerramento com régua própria some.",
    desvio: { aceitaPapelEntrega: true },
    regraEsperada: "ORIGEM_ACEITA_OUTRO_PAPEL",
  },
  {
    nome: "8. o destino é o literal 'ABERTA' em vez do papel do catálogo",
    dano: "o status da vaga é catálogo do diretor desde a B2. Renomeado o código, a reabertura grava um status que não existe: a vaga some das filas e a FK recusa a gravação. É exatamente o defeito que a B2 matou.",
    desvio: { literalDeStatus: true },
    regraEsperada: "DESTINO_NAO_E_O_PAPEL_DE_ABERTURA",
  },
  {
    nome: "9. a seleção é ignorada e o conjunto inteiro volta",
    dano: "o Master escolheu 2 de 5 e o sistema ressuscita os 5. Quem ele descartou de propósito volta vivo para a vaga, e a escolha dele vira enfeite de tela.",
    desvio: { reativaConjuntoInteiro: true },
    regraEsperada: "REATIVA_QUEM_NAO_FOI_ESCOLHIDO",
  },
  {
    nome: "10. lista vazia é lida como 'cancelamento antigo'",
    dano: "o cancelamento NORMAL gera evento SEM ninguém dentro (medido: o evento é inserido sempre, as saídas só no `if (forcado)`). Tratar vazio como antigo oferece para ressurreição quem a SELEÇÃO recusou por mérito.",
    desvio: { vazioViraAntigo: true },
    regraEsperada: "VAZIO_VIRA_ANTIGO",
  },
  {
    nome: "11. a reativação alcança por `vaga_id` em vez de por `id`",
    dano: "o `update` toca TODA candidatura da vaga, inclusive a de quem o Master não escolheu, e o carimbo de `atualizado_em` reinicia em silêncio os dois anos de retenção do dado pessoal dela (§A.6).",
    desvio: { atualizaPorVagaId: true },
    regraEsperada: "REATIVACAO_POR_VAGA_E_NAO_POR_ID",
  },
  {
    nome: "12. o servidor aceita restaurar candidato já anonimizado",
    dano: "o apagamento da LGPD é desfeito pela porta dos fundos: a linha volta a um processo VIVO, passa a ser protegida pela cláusula do expurgo e nunca mais vence.",
    desvio: { restauraAnonimizado: true },
    regraEsperada: "RESTAURA_ANONIMIZADO",
  },
  {
    nome: "13. o caminho SEM_ORIGEM deixa de gravar o aceite",
    dano: "a decisão mais frágil do reabrir (escolher a dedo quem volta, sem o sistema saber se essa pessoa saiu por causa do cancelamento) deixa de ter log permanente e consultável, contra a §A.3 regra 8.",
    desvio: { semAceiteSemOrigem: true },
    regraEsperada: "SEM_ORIGEM_SEM_ACEITE",
  },
  {
    nome: "16. o evento do RETORNO é gravado como DESFECHO (com `situacao` preenchida)",
    dano: "`tipoDoEvento` deriva DESFECHO de `situacao` preenchida: a linha do tempo da ficha mostra a VOLTA como mais um encerramento, logo depois do encerramento de verdade, e quem ler entende o oposto do que aconteceu.",
    desvio: { retornoComoDesfecho: true },
    regraEsperada: "RETORNO_GRAVADO_COMO_DESFECHO",
  },
  {
    nome: "17. quem já voltou continua sendo oferecido na lista",
    dano: "o Master seleciona de novo alguém que já está vivo na vaga, e a segunda reativação bate no unique parcial `uq_as_candidaturas_viva`: a transação cai inteira e ninguém do lote volta.",
    desvio: { ofereceQuemJaVoltou: true },
    regraEsperada: "RETORNO_VOLTA_AO_CONJUNTO",
  },
  {
    nome: "15. `encerrada_em` é gravado com a data de agora em vez de nulo",
    dano: "o par do mutante 6, pela outra ponta: a coluna SAI no update e sai preenchida. A vaga reaberta continua dizendo que encerrou, e agora dizendo que encerrou HOJE, o que é pior do que o carimbo velho.",
    desvio: { encerradaEmComoData: true },
    regraEsperada: "LIMPEZA_PARCIAL_ENCERRADAEM",
  },
  {
    nome: "14. o conjunto lê TODOS os eventos de cancelamento da vaga",
    dano: "o Master restaura gente de cancelamentos anteriores: a capacidade da vaga estoura (a restauração não passa pela trava da alocação) e o unique parcial das vivas derruba a transação inteira.",
    desvio: { todosOsEventos: true },
    regraEsperada: "MISTURA_CANCELAMENTOS",
  },
];
