import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { RetencaoCandidatosService } from "./candidatos/retencao-candidatos.service";

/**
 * ─ FUNDAÇÃO, PEÇA 2: A IDENTIDADE EXTERNA CAI JUNTO COM A PESSOA ANONIMIZADA ───────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção (§A.40, regra 2), a partir do
 * requisito (`docs/MAPA-ALCANCE-FUNDACAO-UNIFICADORA.md`, seção 5) e da exigência D1 do parecer do
 * `seguranca`: *todo identificador externo novo nasce dentro do expurgo, no mesmo commit, com
 * teste que enumera a lista completa de colunas identificadoras*.
 *
 * ┌─ POR QUE ESTE É O ARQUIVO MAIS CARO DA FRENTE ──────────────────────────────────────────────┐
 * │ Ele é o único que ALTERA CÓDIGO VALIDADO (§A.26). O expurgo de hoje é UMA escrita, e por     │
 * │ isso atômico de graça. Ele passa a alcançar DUAS tabelas, e duas escritas soltas falham pelo │
 * │ meio: a pessoa fica anonimizada e a identidade externa dela SOBREVIVE, com o id do ATS       │
 * │ intacto, apontando para uma linha que não identifica mais ninguém. É o pior desfecho         │
 * │ possível, porque do ponto de vista do serviço nada falhou: a contagem volta, o log não       │
 * │ acusa, e a varredura seguinte nem olha aquela linha de novo (ela já tem `anonimizado_em`).   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O TESTE NÃO ESCOLHE O DESENHO, E ISSO É DELIBERADO ────────────────────────────────────────┐
 * │ Há dois jeitos certos de fazer isto: UMA instrução só (a CTE que modifica dado, atômica por  │
 * │ construção e sem ids circulando pela memória do processo, que é o desenho que o arquivo do   │
 * │ serviço já defende por escrito) ou DUAS escritas dentro de uma transação explícita. O que a  │
 * │ cobertura recusa é o terceiro caminho: duas escritas SOLTAS. Por isso a atomicidade aqui é   │
 * │ medida derrubando a PRIMEIRA e a ÚLTIMA instrução, seja ela uma ou sejam duas, e nunca       │
 * │ exigindo `db.transaction`.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE BANCO FINGIDO MEDE, E O QUE ELE NÃO MEDE, dito antes de alguém descobrir ───────┐
 * │ ELE NÃO MEDE O FILTRO. Quem é elegível é decidido por um `where` em SQL cru, e banco fingido │
 * │ devolve o que quiser para qualquer filtro. Essa metade já está coberta, e bem, por           │
 * │ `retencao-lgpd.tester-fake.ts` e pelos dois specs comportamentais ao lado dele, que leem a   │
 * │ FORMA da consulta cláusula por cláusula. Repetir aquilo aqui seria uma terceira régua.       │
 * │                                                                                              │
 * │ ELE MEDE DUAS COISAS QUE AQUELES NÃO ALCANÇAM:                                                │
 * │   1. O QUE SOBRA DEPOIS. Aplicar de verdade o `set` da consulta e procurar o VALOR REAL do    │
 * │      fixture no estado final é o único jeito de pegar a coluna identificadora ESQUECIDA.      │
 * │      (Protocolo LGPD, seção 1.1: teste de expurgo procura o valor real e exige que ele NÃO    │
 * │      esteja lá, nunca o marcador. Procurar "Candidato Expurgado" fica verde com o CPF         │
 * │      intacto na linha de baixo.)                                                              │
 * │   2. A ATOMICIDADE, exercitada e não lida: a instrução escreve num RASCUNHO e só publica no   │
 * │      fim, que é a semântica de verdade. Um serviço com duas escritas soltas deixa a primeira  │
 * │      publicada quando a segunda estoura, e fica VERMELHO aqui.                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: TODOS os valores deste arquivo são INVENTADOS. Nenhum CPF, nome, e-mail ou telefone de
 * pessoa real entra aqui, e o domínio dos e-mails é `.invalido`, que não existe e não se resolve.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. OS VALORES INVENTADOS, QUE SÃO O QUE O TESTE PROCURA NA SAÍDA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ ESTES SÃO OS VALORES QUE NÃO PODEM SOBRAR, e é por eles que se procura ─────────────────────
 *
 * Cada um é uma agulha reconhecível: nenhum é substring do outro, nenhum aparece por acaso num
 * JSON, e todos são impossíveis de confundir com um marcador de anonimização.
 */
const ALVO = {
  nome: "Zzqx Inventado Da Silva Ficticio",
  cpf: "00000000272",
  email: "zzqx.inventado@exemplo.invalido",
  telefone: "11900090009",
  data_nascimento: "1991-02-03",
  identificadorPandape: "PRECOLLAB-INVENTADO-4242",
  identificadorDigai: "DIGAI-INVENTADO-8484",
} as const;

/**
 * ─ A PESSOA QUE JÁ ESTAVA ANONIMIZADA ANTES DESTA PASSADA (caminho P3 do parecer) ─────────────
 *
 * Ela NÃO é elegível por prazo nenhum: o `update` não a alcança, porque o predicado dele é
 * `anonimizado_em is null` e ela já tem o carimbo. Mesmo assim a identidade externa e o id de match
 * que ficaram ANEXADOS A ELA DEPOIS do expurgo têm de sumir na varredura seguinte, e é isso que
 * torna a rotina CICATRIZANTE. Sem essa metade, uma ingestão futura que casasse por CPF com alguém
 * já expurgado criaria identificador que NUNCA MAIS seria varrido, em silêncio.
 */
const CICATRIZ = {
  identificador: "PRECOLLAB-INVENTADO-5151",
} as const;

/** A pessoa que NÃO é expurgada nesta passada. O que é dela não pode ser tocado. */
const VIZINHO = {
  nome: "Wwky Vizinho Ficticio",
  cpf: "00000000353",
  identificador: "PRECOLLAB-INVENTADO-9999",
} as const;

/** O relógio da retenção, congelado no fixture. É ele que o `matches_nulados` não pode carimbar. */
const ATUALIZADO_EM_ORIGINAL = "2023-04-05T06:07:08.000Z";

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. O BANCO FINGIDO, COM INSTRUÇÃO ATÔMICA E TRANSAÇÃO DE VERDADE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

interface LinhaCandidato {
  id: string;
  elegivel: boolean;
  [coluna: string]: unknown;
}

interface LinhaIdentidade {
  id: string;
  candidato_id: string;
  fonte: string;
  identificador: string;
}

interface LinhaCandidatura {
  id: string;
  candidato_id: string;
  [coluna: string]: unknown;
}

interface Estado {
  candidatos: LinhaCandidato[];
  identidades: LinhaIdentidade[];
  candidaturas: LinhaCandidatura[];
}

function clonar(e: Estado): Estado {
  return {
    candidatos: e.candidatos.map((c) => ({ ...c })),
    identidades: e.identidades.map((i) => ({ ...i })),
    candidaturas: e.candidaturas.map((k) => ({ ...k })),
  };
}

function publicar(destino: Estado, origem: Estado): void {
  destino.candidatos = origem.candidatos;
  destino.identidades = origem.identidades;
  destino.candidaturas = origem.candidaturas;
}

/** Reconstrói o texto de um objeto SQL do drizzle, PARÂMETROS INCLUÍDOS (o padrão da casa). */
function textoDoSql(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (no instanceof Date) return no.toISOString();
  if (Array.isArray(no)) return no.map(textoDoSql).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(textoDoSql).join("");
  if ("value" in o && "encoder" in o) return textoDoSql(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(textoDoSql).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/** Só o SQL executável: linha de comentário fora, espaços colapsados. */
function executavel(q: unknown): string {
  return textoDoSql(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `dataNascimento` e `data_nascimento` são a MESMA coluna: o fake não escolhe o estilo de quem escreve. */
function paraSnake(nome: string): string {
  return nome.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * O primeiro ` where ` em profundidade zero A PARTIR DE UM PONTO.
 *
 * "A partir de um ponto", e não "de topo", porque o `update` pode viver DENTRO de uma CTE, e nesse
 * caso o `where` dele nunca está na profundidade zero da instrução inteira. Ancorar no começo do
 * comando devolve o referencial certo nas duas formas.
 */
function indiceDoWhere(texto: string, desde: number, ate: number): number {
  const t = texto.toLowerCase();
  let profundidade = 0;
  let emAspas = false;
  for (let i = desde; i < ate; i += 1) {
    const c = t[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (profundidade <= 0 && t.startsWith(" where ", i)) return i;
  }
  return -1;
}

/** Parte a lista do `set` nas vírgulas de TOPO: `coalesce(a, b)` não vira dois campos. */
function atribuicoesDoSet(trecho: string): [string, unknown][] {
  const pares: [string, unknown][] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  const empurrar = () => {
    const m = atual.match(/^\s*"?([a-z_0-9]+)"?\s*=\s*([\s\S]+)$/i);
    atual = "";
    if (!m) return;
    const cru = m[2]!.trim();
    let valor: unknown = cru;
    if (/^null$/i.test(cru)) valor = null;
    else if (/^now\(\)$/i.test(cru)) valor = "2026-09-17T12:00:00.000Z";
    else if (/^'[\s\S]*'$/.test(cru)) valor = cru.slice(1, -1);
    pares.push([paraSnake(m[1]!), valor]);
  };
  for (let i = 0; i < trecho.length; i += 1) {
    const c = trecho[i]!;
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (c === "," && profundidade === 0) {
        empurrar();
        continue;
      }
    }
    atual += c;
  }
  empurrar();
  return pares;
}

const PADRAO_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

interface Registro {
  sql: string;
  /** A unidade de trabalho: `raiz` quer dizer FORA de transação. */
  unidade: "raiz" | "transacao";
}

interface BancoFingido {
  db: unknown;
  estado: Estado;
  instrucoes: Registro[];
}

/**
 * ─ O INTERPRETADOR, CRU E HONESTO SOBRE O QUE COBRE ───────────────────────────────────────────
 *
 * Ele entende o que o requisito nomeia, e nas DUAS formas (comandos separados ou uma CTE só):
 *   . `update ... as_candidatos ... set ...`: aplica o SET de verdade nas linhas que o FIXTURE
 *     marcou elegíveis (quem é elegível NÃO é medido aqui, ver o cabeçalho do arquivo);
 *   . `delete from as_identidades_externas ...`: apaga pelos uuid citados na cláusula, ou pelos
 *     candidatos anonimizados nesta mesma instrução quando a cláusula é correlacionada;
 *   . `delete` SEM cláusula nenhuma: apaga TUDO, que é o defeito que o caso do vizinho pega.
 *
 * A ORDEM É SEMPRE update DEPOIS delete, independentemente da ordem no texto, porque na CTE o
 * apagamento se correlaciona com o `returning` da anonimização: as duas metades enxergam o MESMO
 * instante, e ler o texto de cima para baixo inverteria isso.
 */
function bancoFingido(
  inicial: Estado,
  falharNa?: (n: number, sql: string) => boolean,
): BancoFingido {
  const estado = clonar(inicial);
  const instrucoes: Registro[] = [];

  function aplicarEm(alvo: Estado, texto: string): Record<string, unknown>[] {
    const t = texto.toLowerCase();

    // ANTES do `update`, e a ordem é o ponto: no banco, todas as CTEs enxergam o MESMO retrato,
    // o de antes da anonimização desta passada. Lida depois, esta lista engoliria o `alvo` e um
    // serviço que só citasse `ja_anonimizados` passaria verde por acidente.
    const jaAnonimos = alvo.candidatos
      .filter((c) => c.anonimizado_em)
      .map((c) => c.id.toLowerCase());

    let anonimizados: string[] = [];
    const iUpdate = t.search(/update\s+"?as_candidatos"?/);
    if (iUpdate >= 0) {
      const iSet = t.indexOf(" set ", iUpdate);
      const iWhere = indiceDoWhere(texto, iSet + 1, texto.length);
      const trecho = texto.slice(iSet + " set ".length, iWhere > iSet ? iWhere : undefined);
      const pares = atribuicoesDoSet(trecho);
      const atingidas = alvo.candidatos.filter((c) => c.elegivel && !c.anonimizado_em);
      for (const linha of atingidas) for (const [col, valor] of pares) linha[col] = valor;
      anonimizados = atingidas.map((c) => c.id.toLowerCase());
    }

    /**
     * O segmento do comando termina onde o PRÓXIMO comando começa, senão o `where` do vizinho seria
     * lido como se fosse deste, e o comando SEM cláusula passaria despercebido.
     */
    function fimDoComando(desde: number): number {
      const proximos = [t.indexOf("update ", desde + 1), t.indexOf("delete from ", desde + 1)]
        .filter((i) => i > 0)
        .sort((a, b) => a - b);
      return proximos.length ? proximos[0]! : texto.length;
    }

    /**
     * ─ QUEM A CLÁUSULA ALCANÇA, E A LEITURA AQUI É LITERAL DE PROPÓSITO ────────────────────────
     *
     * A cláusula pode citar DUAS listas, e elas são DISJUNTAS: quem está sendo anonimizado AGORA
     * (`alvo`) e quem JÁ ESTAVA anonimizado antes desta passada (`ja_anonimizados`, a metade
     * cicatrizante). O fake resolve cada menção SEPARADAMENTE, e nunca as soma por conveniência:
     * somar sempre faria o teste da cicatrização passar VERDE num serviço que só citasse `alvo`,
     * que é exatamente o defeito que o caminho P3 do parecer descreve.
     */
    function alvosDaClausula(clausula: string, todos: string[]): Set<string> {
      const citados = (clausula.match(PADRAO_UUID) ?? []).map((u) => u.toLowerCase());
      if (citados.length) return new Set(citados);
      const c = clausula.toLowerCase();
      const citaAlvo = /\balvo\b/.test(c);
      const citaJa = /ja_anonimizados|anonimizado_em\s+is\s+not\s+null/.test(c);
      if (!citaAlvo && !citaJa) return new Set(todos);
      return new Set([...(citaAlvo ? anonimizados : []), ...(citaJa ? jaAnonimos : [])]);
    }

    const iDelete = t.search(/delete\s+from\s+"?as_identidades_externas"?/);
    if (iDelete >= 0) {
      const fim = fimDoComando(iDelete);
      const iWhere = indiceDoWhere(texto, iDelete, fim);
      const todos = alvo.identidades.map((i) => i.candidato_id.toLowerCase());
      // SEM cláusula: apaga a tabela inteira. É defeito, e o fake o executa de propósito para o
      // caso do vizinho ficar vermelho em vez de passar por engano.
      const alvos =
        iWhere < 0 ? new Set(todos) : alvosDaClausula(texto.slice(iWhere, fim), todos);
      alvo.identidades = alvo.identidades.filter((i) => !alvos.has(i.candidato_id.toLowerCase()));
    }

    // ─ O `matches_nulados` (caminho P4): o id da pessoa no ATS sai da CANDIDATURA ───────────────
    // A tabela é outra, o dono do dado é o mesmo. O fake aplica o SET de verdade para que o teste
    // possa procurar o VALOR REAL no estado final e, principalmente, para que a coluna que NÃO
    // pode ser escrita (`atualizado_em`, o relógio da retenção) apareça se alguém a acrescentar.
    const iUpdateK = t.search(/update\s+"?as_candidaturas"?/);
    if (iUpdateK >= 0) {
      const fim = fimDoComando(iUpdateK);
      const iSet = t.indexOf(" set ", iUpdateK);
      const iWhere = indiceDoWhere(texto, iSet + 1, fim);
      const trecho = texto.slice(iSet + " set ".length, iWhere > iSet ? iWhere : fim);
      const pares = atribuicoesDoSet(trecho);
      const todos = alvo.candidaturas.map((k) => k.candidato_id.toLowerCase());
      const alvos = iWhere < 0 ? new Set(todos) : alvosDaClausula(texto.slice(iWhere, fim), todos);
      for (const linha of alvo.candidaturas) {
        if (!alvos.has(linha.candidato_id.toLowerCase())) continue;
        for (const [col, valor] of pares) linha[col] = valor;
      }
    }

    return [{ count: anonimizados.length }];
  }

  /**
   * UMA INSTRUÇÃO, e ela é ATÔMICA POR CONSTRUÇÃO: escreve num rascunho, publica no fim. É esta
   * função que dá sentido ao teste da atomicidade, e um fake que escrevesse direto no estado
   * responderia IGUAL para a CTE e para as duas escritas soltas.
   */
  function executar(texto: string, base: Estado, unidade: "raiz" | "transacao") {
    instrucoes.push({ sql: texto, unidade });
    if (falharNa?.(instrucoes.length, texto)) {
      return Promise.reject(Object.assign(new Error("falha simulada do banco"), { code: "40001" }));
    }
    const rascunho = clonar(base);
    let saida: Record<string, unknown>[];
    try {
      saida = aplicarEm(rascunho, texto);
    } catch (e) {
      return Promise.reject(e);
    }
    publicar(base, rascunho);
    return Promise.resolve(saida);
  }

  /** O construtor do drizzle, para a construção poder usar `db.delete(tabela).where(...)`. */
  function construtor(base: Estado, unidade: "raiz" | "transacao") {
    const encadear = (montar: (clausula: string) => string): Record<string, unknown> => {
      const passo = (clausula: string): Record<string, unknown> => {
        const p = () => executar(montar(clausula), base, unidade);
        return {
          where: (c: unknown) => passo(`${clausula} ${executavel(c)}`.trim()),
          returning: () => p(),
          then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => p().then(ok, err),
          catch: (f: (e: unknown) => unknown) => p().catch(f),
        };
      };
      return passo("");
    };

    return {
      execute: (q: unknown) => executar(executavel(q), base, unidade),
      delete: (t: unknown) => {
        const nome = getTableConfig(t as never).name;
        return encadear((c) => `delete from ${nome}${c ? ` where ${c}` : ""}`);
      },
      update: (t: unknown) => {
        const nome = getTableConfig(t as never).name;
        return {
          set: (valores: Record<string, unknown>) => {
            const corpo = Object.entries(valores)
              .map(([k, v]) => `${paraSnake(k)} = ${v === null ? "null" : `'${textoDoSql(v)}'`}`)
              .join(", ");
            return encadear((c) => `update ${nome} set ${corpo}${c ? ` where ${c}` : ""}`);
          },
        };
      },
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
          then: (ok: (v: unknown) => unknown) => Promise.resolve([]).then(ok),
        }),
      }),
    } as Record<string, unknown>;
  }

  const db = construtor(estado, "raiz");

  /**
   * A TRANSAÇÃO TAMBÉM PUBLICA SÓ NO FIM: o corpo escreve num rascunho, e o rascunho só vira o
   * estado quando a função inteira terminou bem. É o outro desenho aceito pelo contrato.
   */
  db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const rascunho = clonar(estado);
    const saida = await fn(construtor(rascunho, "transacao"));
    publicar(estado, rascunho);
    return saida;
  };

  return { db, estado, instrucoes };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O FIXTURE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ID_ALVO = "11111111-1111-4111-8111-111111111111";
const ID_VIZINHO = "22222222-2222-4222-8222-222222222222";
const ID_CICATRIZ = "33333333-3333-4333-8333-333333333333";

function estadoInicial(): Estado {
  return {
    candidatos: [
      {
        id: ID_ALVO,
        elegivel: true,
        nome: ALVO.nome,
        cpf: ALVO.cpf,
        email: ALVO.email,
        telefone: ALVO.telefone,
        data_nascimento: ALVO.data_nascimento,
        cidade: "Cidade Inventada",
        uf: "SP",
        origem: "MANUAL",
        anonimizado_em: null,
      },
      {
        id: ID_VIZINHO,
        elegivel: false,
        nome: VIZINHO.nome,
        cpf: VIZINHO.cpf,
        email: null,
        telefone: null,
        data_nascimento: null,
        cidade: "Outra Cidade Inventada",
        uf: "SP",
        origem: "MANUAL",
        anonimizado_em: null,
      },
      {
        // JÁ ANONIMIZADO numa passada anterior, e NÃO elegível por prazo nenhum: o `update` não o
        // alcança. O que ficou pendurado nele depois do expurgo é o caminho P3.
        id: ID_CICATRIZ,
        elegivel: false,
        nome: "Candidato Expurgado",
        cpf: null,
        email: null,
        telefone: null,
        data_nascimento: null,
        cidade: "Terceira Cidade Inventada",
        uf: "SP",
        origem: "MANUAL",
        anonimizado_em: "2024-01-01T00:00:00.000Z",
      },
    ],
    identidades: [
      // A MESMA PESSOA COM DUAS IDENTIDADES, de fontes diferentes, que é o caso que a tabela
      // existe para permitir. As DUAS têm de cair.
      { id: "i1", candidato_id: ID_ALVO, fonte: "PANDAPE", identificador: ALVO.identificadorPandape },
      { id: "i2", candidato_id: ID_ALVO, fonte: "DIGAI", identificador: ALVO.identificadorDigai },
      { id: "i3", candidato_id: ID_VIZINHO, fonte: "PANDAPE", identificador: VIZINHO.identificador },
      // ANEXADA DEPOIS DA ANONIMIZAÇÃO: é o identificador que nunca mais seria varrido.
      { id: "i4", candidato_id: ID_CICATRIZ, fonte: "PANDAPE", identificador: CICATRIZ.identificador },
    ],
    candidaturas: [
      { id: "k1", candidato_id: ID_ALVO, atualizado_em: ATUALIZADO_EM_ORIGINAL },
      { id: "k2", candidato_id: ID_CICATRIZ, atualizado_em: ATUALIZADO_EM_ORIGINAL },
      { id: "k3", candidato_id: ID_VIZINHO, atualizado_em: ATUALIZADO_EM_ORIGINAL },
    ],
  };
}

async function expurgar(
  falharNa?: (n: number, sql: string) => boolean,
): Promise<{ banco: BancoFingido; erro: unknown }> {
  const banco = bancoFingido(estadoInicial(), falharNa);
  let erro: unknown = null;
  try {
    await new RetencaoCandidatosService(banco.db as never).expurgar();
  } catch (e) {
    erro = e;
  }
  return { banco, erro };
}

/** Tudo o que sobrou no banco, como texto, para procurar a agulha dentro. */
function sobrou(banco: BancoFingido): string {
  return JSON.stringify(banco.estado);
}

/** Quantas instruções a varredura dispara quando nada falha. É o que a atomicidade usa de âncora. */
async function quantasInstrucoes(): Promise<number> {
  const { banco } = await expurgar();
  return banco.instrucoes.length;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A IDENTIDADE CAI JUNTO, E SÓ A DELA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("anonimizar uma pessoa apaga as identidades externas dela", () => {
  it("as DUAS identidades da pessoa expurgada somem, inclusive a da segunda fonte", async () => {
    const { banco, erro } = await expurgar();
    expect(erro, "o expurgo não podia falhar neste caso").toBeNull();
    expect(
      banco.estado.identidades.filter((i) => i.candidato_id === ID_ALVO),
      "identidade externa que sobrevive à anonimização é o id do ATS retido para sempre, numa " +
        "linha que não identifica mais ninguém e que nenhum log acusa (seção 5 do mapa)",
    ).toEqual([]);
  });

  /**
   * ─ O CASO QUE PEGA O `delete` SEM CLÁUSULA, e ele não é hipotético ──────────────────────────
   *
   * "Apagar as identidades" escrito às pressas vira `delete from as_identidades_externas`, que
   * funciona perfeitamente no banco de homologação (uma linha, a da pessoa expurgada) e apaga a
   * tabela inteira em produção. O vizinho está aqui só para isso.
   */
  it("a identidade de OUTRA pessoa não é tocada", async () => {
    const { banco } = await expurgar();
    expect(
      banco.estado.identidades.map((i) => i.candidato_id),
      "o expurgo alcança a pessoa que venceu o prazo, e ninguém mais",
    ).toEqual([ID_VIZINHO]);
  });

  it("o vizinho continua inteiro: o expurgo não anonimiza quem não venceu o prazo", async () => {
    const { banco } = await expurgar();
    const vizinho = banco.estado.candidatos.find((c) => c.id === ID_VIZINHO)!;
    expect(vizinho.cpf).toBe(VIZINHO.cpf);
    expect(vizinho.anonimizado_em ?? null).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. AS DUAS ESCRITAS CAEM JUNTAS OU NENHUMA (o risco declarado na seção 5 do mapa)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a anonimização e o apagamento são atômicos, e isso é EXERCITADO, não lido", () => {
  /**
   * O CASO PRINCIPAL: a ÚLTIMA instrução falha. Sendo uma instrução só, nada foi publicado, e a
   * afirmação é trivialmente verdadeira. Sendo duas soltas, a primeira já está publicada e o
   * desfecho é o pior possível: pessoa anonimizada com o identificador externo dela intacto.
   */
  it("falhando a ÚLTIMA instrução, NADA é publicado", async () => {
    const total = await quantasInstrucoes();
    const { banco, erro } = await expurgar((n) => n === total);
    expect(erro, "a falha do banco tem de chegar a quem chamou, e não ser engolida").not.toBeNull();

    const alvo = banco.estado.candidatos.find((c) => c.id === ID_ALVO)!;
    expect(
      alvo.cpf,
      "a anonimização ficou publicada e a identidade externa sobreviveu: as duas metades não " +
        "estão na mesma unidade atômica",
    ).toBe(ALVO.cpf);
    expect(alvo.anonimizado_em ?? null).toBeNull();
    expect(
      banco.estado.identidades.map((i) => i.id).sort(),
      "nenhuma metade pode sobreviver a uma falha no meio",
    ).toEqual(["i1", "i2", "i3", "i4"]);
  });

  /** O simétrico: falhando a PRIMEIRA, nada acontece. A ORDEM é escolha de quem constrói. */
  it("falhando a PRIMEIRA instrução, NADA é publicado", async () => {
    const { banco, erro } = await expurgar((n) => n === 1);
    expect(erro).not.toBeNull();
    expect(banco.estado.candidatos.find((c) => c.id === ID_ALVO)!.cpf).toBe(ALVO.cpf);
    expect(banco.estado.identidades).toHaveLength(4);
  });

  /**
   * ─ A UNIDADE ATÔMICA, DITA DIRETAMENTE ──────────────────────────────────────────────────────
   *
   * Duas escritas soltas no banco raiz são o único desenho recusado: cada uma publica na hora, e
   * a segunda a estourar deixa a primeira de pé. UMA instrução só (a CTE) ou duas dentro de
   * transação passam igual, e é assim que tem de ser: o requisito é a atomicidade, não a técnica.
   */
  it("ou é UMA instrução só, ou todas estão dentro de transação", async () => {
    const { banco } = await expurgar();
    const soltas = banco.instrucoes.filter((i) => i.unidade === "raiz");
    expect(
      soltas.length <= 1,
      `${soltas.length} escritas soltas fora de transação: ${JSON.stringify(
        soltas.map((s) => s.sql.slice(0, 70)),
      )}`,
    ).toBe(true);
  });

  /** A prova de que a identidade é alcançada pela MESMA varredura, e não por uma rotina à parte. */
  it("a varredura alcança a tabela de identidades externas", async () => {
    const { banco } = await expurgar();
    expect(
      banco.instrucoes.some((i) => /as_identidades_externas/i.test(i.sql)),
      `instruções de hoje: ${JSON.stringify(banco.instrucoes.map((i) => i.sql.slice(0, 90)))}`,
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4.1. A VARREDURA É CICATRIZANTE (caminho P3 do parecer do seguranca)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE ESTE BLOCO EXISTE, e ele é o que faltava na primeira entrega ───────────────────────
 *
 * O caminho P3 veio de VETO, e correção de LGPD sem teste não sobrevive à próxima refatoração: a
 * CTE `ja_anonimizados` é UMA LINHA, some numa limpeza, e o defeito que ela evita é invisível.
 *
 * O DEFEITO, inteiro: o `update` do expurgo tem `anonimizado_em is null` no predicado, então quem
 * já foi anonimizado NUNCA MAIS é visitado. Uma identidade externa anexada DEPOIS (uma ingestão
 * futura que case por CPF com alguém já expurgado, um reprocessamento antigo que reentregue) fica
 * pendurada numa linha que a varredura não olha mais. É identificador do ATS retido PARA SEMPRE,
 * sem nada falhar, sem log nenhum acusar.
 *
 * A PROTEÇÃO PRECISA DAS DUAS PONTAS, e a segunda é tão importante quanto: a cicatrizante não pode
 * alcançar quem NÃO está anonimizado. Uma cláusula frouxa aqui apaga a identidade externa de gente
 * VIVA, em processo, que é o defeito oposto e pior: irreversível e contra quem não devia nada.
 */
describe("a varredura CICATRIZA o rastro de quem JÁ estava anonimizado (P3)", () => {
  it("identidade anexada DEPOIS da anonimização some na varredura seguinte", async () => {
    const { banco, erro } = await expurgar();
    expect(erro).toBeNull();
    expect(
      banco.estado.identidades.filter((i) => i.candidato_id === ID_CICATRIZ),
      "a pessoa não é elegível por prazo nenhum, e é justamente por isso que só a cicatrizante a " +
        "alcança: sem a CTE `ja_anonimizados` este identificador nunca mais seria varrido",
    ).toEqual([]);
    expect(banco.estado.identidades.map((i) => i.identificador)).not.toContain(
      CICATRIZ.identificador,
    );
  });

  it("a cicatrizante NÃO alcança identidade de quem NÃO está anonimizado", async () => {
    const { banco } = await expurgar();
    const vizinho = banco.estado.candidatos.find((c) => c.id === ID_VIZINHO)!;
    expect(vizinho.anonimizado_em ?? null, "o fixture precisa continuar honesto").toBeNull();
    expect(
      banco.estado.identidades.map((i) => i.id),
      "alargar a cicatrizante para alcançar quem está vivo é o defeito oposto, e pior: apaga o " +
        "identificador de gente em processo, sem volta",
    ).toEqual(["i3"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4.2. O IDENTIFICADOR DO ATS NÃO MORA MAIS NA CANDIDATURA (o antigo caminho P4)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O QUE ACONTECEU COM O BLOCO QUE VIVIA AQUI, dito por escrito para ninguém achar que sumiu ──
 *
 * Havia aqui três casos medindo que o expurgo NULAVA `as_candidaturas.id_match_pandape`. Eles
 * morreram COM A COLUNA: o fechamento da fundação derruba `as_candidatos.id_candidate_pandape` e
 * `as_candidaturas.id_match_pandape` (seção 4 do mapa de alcance), porque a identidade externa
 * passou a ter UM dono dentro do módulo A&S, que é `as_identidades_externas`.
 *
 * ┌─ E É EXATAMENTE ISSO QUE O `seguranca` VETOU NA PRIMEIRA VERSÃO DO MAPA ────────────────────┐
 * │ A PROVA DE REGRESSÃO MORRE JUNTO COM A COLUNA. Apagadas as duas, a enumeração da D1 encolhe,│
 * │ a asserção some, e nada impede que a próxima fonte nasça como uma coluna nova de            │
 * │ `as_candidatos` chamada `id_candidate_digai`. Uma lista de nomes PROIBIDOS também não pega  │
 * │ isso, porque ninguém consegue proibir o nome que ainda não foi inventado.                   │
 * │                                                                                             │
 * │ POR ISSO A D1 VIROU ESTRUTURAL, logo abaixo: em vez de listar o proibido, ela lista o que é │
 * │ PERMITIDO nas duas tabelas e exige que não haja mais nada. Coluna nova, com o nome que for, │
 * │ nasce VERMELHA e obriga quem a acrescenta a decidir, no mesmo commit, se ela é identificador│
 * │ e para onde ela vai.                                                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A EXIGÊNCIA D1: A LISTA COMPLETA DAS COLUNAS IDENTIFICADORAS, E NENHUMA SOBREVIVE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ A LISTA É DIGITADA À MÃO, E ISSO É A TRAVA, NÃO O DESCUIDO ─────────────────────────────────
 *
 * Derivá-la de uma constante de produção a faria ENCOLHER junto com ela: apagado o item, o caso
 * some em silêncio e a suíte fica verde com a coluna retida. O laço que varre o schema, logo
 * abaixo, é a outra metade: ele acusa a coluna identificadora NOVA que ninguém acrescentou aqui.
 */
const COLUNAS_IDENTIFICADORAS = [
  ["as_candidatos", "nome", ALVO.nome],
  ["as_candidatos", "cpf", ALVO.cpf],
  ["as_candidatos", "email", ALVO.email],
  ["as_candidatos", "telefone", ALVO.telefone],
  ["as_candidatos", "data_nascimento", ALVO.data_nascimento],
] as const;

/** As tabelas que a D1 varre. Tabela nova com identificador entra aqui, e não numa segunda régua. */
const TABELAS_COM_IDENTIFICADOR = ["as_candidatos", "as_candidaturas"] as const;

/**
 * ─ A D1 ESTRUTURAL: A LISTA DO QUE É PERMITIDO, E NADA ALÉM ───────────────────────────────────
 *
 * ┌─ POR QUE A LISTA É DE PERMITIDOS, E NÃO DE PROIBIDOS ──────────────────────────────────────┐
 * │ Uma lista de nomes proibidos (`pandape`, `digai`, `rg`) só pega o nome que alguém previu, e │
 * │ o buraco que o `seguranca` apontou é justamente o NOME QUE NINGUÉM PREVIU: apagadas as duas │
 * │ gavetas velhas, a próxima fonte nasce como `id_candidate_digai`, `codigo_ats`, `ref_externa`│
 * │ ou qualquer palavra, numa coluna de `as_candidatos`, e nenhuma régua de nome a acusa.        │
 * │                                                                                             │
 * │ ENTÃO A RÉGUA É DE SUBCONJUNTO: estas duas tabelas têm EXATAMENTE as colunas abaixo. Coluna │
 * │ nova, qualquer que seja o nome, fica VERMELHA aqui, e quem a acrescentou é obrigado a       │
 * │ decidir na mesma hora se ela é identificador, se entra no expurgo, ou se o lugar dela é     │
 * │ `as_identidades_externas`, que é o ÚNICO destino permitido para identificador externo       │
 * │ dentro do módulo A&S (seção 4 do mapa).                                                     │
 * │                                                                                             │
 * │ O CUSTO DISSO É UM VERMELHO A CADA COLUNA NOVA, e o custo é o ponto: acrescentar coluna em  │
 * │ tabela de dado pessoal passa a exigir uma linha de decisão, em vez de passar batido.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const COLUNAS_PERMITIDAS: Record<string, string[]> = {
  as_candidatos: [
    "id",
    "nome",
    "cpf",
    "email",
    "telefone",
    "data_nascimento",
    "cidade",
    "uf",
    "origem",
    // A RETENÇÃO, que saiu de dentro da origem (seção 1 do mapa). Booleano, e não identifica ninguém.
    "banco_talentos",
    "criado_por_id",
    "anonimizado_em",
    "criado_em",
    "atualizado_em",
  ],
  as_candidaturas: [
    "id",
    "candidato_id",
    "vaga_id",
    "etapa",
    "situacao",
    "motivo_descarte",
    "alocado_em",
    "alocado_por_id",
    "ultimo_contato_em",
    "admissao_id",
    "posicao_lado",
    "criado_em",
    "atualizado_em",
  ],
};

describe("nenhuma coluna identificadora sobrevive à anonimização (D1)", () => {
  /**
   * O TESTE PROCURA O VALOR REAL E EXIGE QUE ELE NÃO ESTEJA LÁ, e nunca o marcador (protocolo
   * LGPD, seção 1.1). Afirmar `nome === 'Candidato Expurgado'` fica verde com o CPF, o telefone e
   * o e-mail intactos na mesma linha, porque a coluna conferida foi a única que alguém lembrou.
   */
  it.each(COLUNAS_IDENTIFICADORAS)(
    "o valor de %s.%s não sobrevive em lugar nenhum",
    async (tabela, coluna, valor) => {
      const { banco } = await expurgar();
      expect(
        sobrou(banco).includes(valor),
        `o valor de "${tabela}.${coluna}" continua no banco depois do expurgo`,
      ).toBe(false);
    },
  );

  /** O identificador externo é dado pessoal pelo protocolo (seção 1), e some pela linha inteira. */
  it.each([ALVO.identificadorPandape, ALVO.identificadorDigai])(
    "o identificador externo %s não sobrevive",
    async (identificador) => {
      const { banco } = await expurgar();
      expect(sobrou(banco).includes(identificador)).toBe(false);
    },
  );

  /**
   * ─ O QUE FICA, E FICA DE PROPÓSITO ──────────────────────────────────────────────────────────
   *
   * Cidade e UF sozinhas não identificam ninguém e sustentam a estatística regional, e a LINHA do
   * candidato é preservada porque apagá-la levaria junto as candidaturas e a contagem de aprovados
   * das vagas passadas. Sem este caso, "apaga tudo" passaria em todos os anteriores.
   */
  it("a linha do candidato PERMANECE, anonimizada, e a cidade fica", async () => {
    const { banco } = await expurgar();
    const alvo = banco.estado.candidatos.find((c) => c.id === ID_ALVO);
    expect(alvo, "anonimizar não é apagar: a linha sustenta a contagem histórica").toBeDefined();
    expect(alvo!.cidade).toBe("Cidade Inventada");
    expect(
      alvo!.anonimizado_em,
      "sem o carimbo, a mesma pessoa é reprocessada em toda varredura",
    ).not.toBeNull();
  });

  /**
   * ─ O LAÇO QUE ACUSA A COLUNA IDENTIFICADORA NOVA (D1, a metade que não encolhe) ─────────────
   *
   * Ele varre o SCHEMA DE VERDADE e cobra que toda coluna com cara de identificador esteja na
   * lista acima. Coluna nova de identidade (um `id_candidate_digai`, um `rg`) nasce VERMELHA aqui,
   * que é exatamente o que a exigência D1 pede: o identificador externo novo nasce dentro do
   * expurgo, no mesmo commit.
   */
  it.each(TABELAS_COM_IDENTIFICADOR)("toda coluna identificadora de %s está enumerada aqui", (nomeTabela) => {
    const tabela = Object.values(schema as Record<string, unknown>).find((v) => {
      try {
        return getTableConfig(v as never).name === nomeTabela;
      } catch {
        return false;
      }
    });
    const nomes = getTableConfig(tabela as never).columns.map((c) => c.name);
    const identificadoras = nomes.filter((n) =>
      /nome|cpf|email|telefone|celular|nascimento|pandape|digai|rg$|cnh|documento|identificador/i.test(
        n,
      ),
    );
    const enumeradas = COLUNAS_IDENTIFICADORAS.filter(([t]) => t === nomeTabela).map(
      ([, c]) => c as string,
    );
    expect(
      identificadoras.filter((n) => !enumeradas.includes(n)),
      "coluna identificadora fora da enumeração do expurgo (exigência D1 do parecer do seguranca)",
    ).toEqual([]);
  });
  /**
   * ─ A METADE ESTRUTURAL, QUE É A QUE SOBREVIVE À MORTE DAS COLUNAS ──────────────────────────
   *
   * O laço acima depende de a coluna ter CARA de identificador. Este não depende de nada: ele
   * compara o conjunto REAL de colunas com o conjunto PERMITIDO, e qualquer coisa a mais é
   * vermelha, com o nome que tiver. É ele que pega o `id_candidate_digai` de amanhã, e é ele que
   * responde ao veto do `seguranca` sobre a prova que morreria junto com as gavetas velhas.
   */
  it.each(TABELAS_COM_IDENTIFICADOR)(
    "%s não tem NENHUMA coluna além das permitidas (D1 estrutural)",
    (nomeTabela) => {
      const tabela = Object.values(schema as Record<string, unknown>).find((v) => {
        try {
          return getTableConfig(v as never).name === nomeTabela;
        } catch {
          return false;
        }
      });
      const nomes = getTableConfig(tabela as never).columns.map((c) => c.name);
      expect(
        nomes.filter((n) => !COLUNAS_PERMITIDAS[nomeTabela]!.includes(n)),
        `coluna nova em ${nomeTabela}. Sendo identificador externo, o lugar dela é ` +
          `as_identidades_externas, que é o único destino permitido no módulo A&S; sendo dado ` +
          `pessoal, ela entra no expurgo NO MESMO COMMIT (exigência D1). Não sendo nenhum dos ` +
          `dois, basta acrescentá-la a COLUNAS_PERMITIDAS, e a decisão fica registrada.`,
      ).toEqual([]);
    },
  );

  /** As duas gavetas velhas, ditas pelo nome: é o que a seção 4 do mapa manda derrubar. */
  it("as duas colunas de identificador do ATS foram DERRUBADAS", () => {
    const nomesDe = (nomeTabela: string) => {
      const t = Object.values(schema as Record<string, unknown>).find((v) => {
        try {
          return getTableConfig(v as never).name === nomeTabela;
        } catch {
          return false;
        }
      });
      return getTableConfig(t as never).columns.map((c) => c.name);
    };
    expect(nomesDe("as_candidatos")).not.toContain("id_candidate_pandape");
    expect(nomesDe("as_candidaturas")).not.toContain("id_match_pandape");
  });

  /**
   * O DESTINO ÚNICO CONTINUA EXISTINDO, e esta linha é o par da de cima: uma régua que só proíbe,
   * sem dizer para onde o dado vai, empurra quem constrói de volta para a coluna paralela.
   */
  it("o único destino permitido para identificador externo continua de pé", () => {
    const t = Object.values(schema as Record<string, unknown>).find((v) => {
      try {
        return getTableConfig(v as never).name === "as_identidades_externas";
      } catch {
        return false;
      }
    });
    expect(t, "sumiu a tabela de identidades externas: o dado volta a não ter casa").toBeDefined();
    expect(getTableConfig(t as never).columns.map((c) => c.name)).toContain("identificador");
  });
});
