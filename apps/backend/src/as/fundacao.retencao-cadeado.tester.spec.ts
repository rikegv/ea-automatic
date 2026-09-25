import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { Papel } from "@ea/shared-types";
import * as schema from "../db/schema";
import { EditarCandidatoDto } from "./candidatos/candidatos.dto";
import { CandidatosService } from "./candidatos/candidatos.service";
import { envioDoPortalFingido } from "../portal/portal-envio.fake";

/**
 * ─ FECHAMENTO DA FUNDAÇÃO, PEÇA C: O CADEADO DA RETENÇÃO, NA CRIAÇÃO E NA EDIÇÃO ───────────────
 *
 * COBERTURA INDEPENDENTE (§A.38) escrita JUNTO com a construção (§A.40 regra 2), a partir do
 * requisito (`docs/MAPA-ALCANCE-FECHAMENTO-FUNDACAO.md`, seções 2 e 3) e não da implementação, que
 * ainda não existe.
 *
 * ┌─ O QUE O CADEADO GUARDA, e não é um campo de catálogo qualquer ─────────────────────────────┐
 * │ `banco_talentos` é a ÚNICA marca do módulo que concede VIDA ETERNA a dado pessoal: marcada, a│
 * │ pessoa nunca mais é alcançada pelo expurgo por prazo. Por isso só SUPER_ADMIN a coloca ou a  │
 * │ tira, e por isso toda TENTATIVA vira linha de trilha, inclusive a recusada.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FORMA DA GUARDA É "O CAMPO NÃO ENTRA NO OBJETO GRAVADO", e não "comparar e recusar" ─────┐
 * │ Comparar e recusar deixa TRÊS contornos abertos, e os três são exercitados aqui embaixo:     │
 * │   . `null` contra `undefined`: `@IsOptional()` deixa `null` passar, e uma guarda escrita     │
 * │     como `!== undefined` recusaria um salvamento que não muda nada;                          │
 * │   . o VALOR IGUAL: reenviar o mesmo valor não é mudança, e recusá-lo quebra todo salvamento  │
 * │     de ficha feito por um consultor COMUM;                                                   │
 * │   . a LEITURA E A ESCRITA NÃO SÃO ATÔMICAS: um COMUM com o formulário desatualizado manda o  │
 * │     valor velho e DESFAZ EM SILÊNCIO a decisão de um SUPER_ADMIN, devolvendo ao expurgo       │
 * │     irreversível alguém que havia sido tornado permanente. Campo fora do objeto gravado não  │
 * │     tem esse caminho, e é por isso que a asserção é sobre O QUE FOI ESCRITO.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ A ASSINATURA QUE ESTE ARQUIVO EXIGE, dita em um lugar só ───────────────────────────────────
 * `criar(dto, autor)` e `editar(id, dto, autor)`, com `autor` carregando `id` e `papel` (a forma do
 * `AuthUser` que a controller já recebe em `criar` e em `alocar`). A rota de editar NÃO recebe o
 * autor hoje, e passar a receber é mudança obrigatória do requisito (seção 2): sem ele não há papel
 * para conferir nem autor para registrar. Escolhendo a construção outra forma, é o adaptador logo
 * abaixo que muda, e não os dez casos.
 *
 * §A.6: todos os valores deste arquivo são INVENTADOS. Nenhum CPF, nome ou e-mail de pessoa real.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. O VOCABULÁRIO DESTE ARQUIVO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ID_CANDIDATO = "11111111-1111-4111-8111-111111111111";
const AUTOR_SUPER = { id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", papel: "SUPER_ADMIN" as Papel };
const AUTOR_COMUM = { id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", papel: "COMUM" as Papel };
const NOME_INVENTADO = "Zzqx Inventado Da Silva Ficticio";

/** Os nomes que a coluna da retenção pode ter no objeto gravado, nas duas convenções. */
const CHAVES_DA_RETENCAO = ["banco_talentos", "bancotalentos"];

function paraSnake(nome: string): string {
  return nome.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** Acha um campo do objeto gravado por qualquer uma das grafias aceitas. */
function campo(valores: Record<string, unknown>, nomes: string[]): { achou: boolean; valor: unknown } {
  for (const [k, v] of Object.entries(valores)) {
    if (nomes.includes(paraSnake(k))) return { achou: true, valor: v };
  }
  return { achou: false, valor: undefined };
}

function temRetencao(valores: Record<string, unknown>) {
  return campo(valores, CHAVES_DA_RETENCAO);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A TRILHA, DESCOBERTA PELA FORMA E NÃO PELO NOME
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE A TABELA É PROCURADA PELA FORMA ────────────────────────────────────────────────────
 *
 * O requisito fixa o QUE a trilha guarda (candidato, de, para, autor, resultado, carimbo), e não
 * como ela se chama. Um teste que morresse porque a construção escolheu `as_retencao_eventos` em
 * vez de `as_candidato_retencao_eventos` estaria medindo gosto. `resultado` é coluna que NÃO EXISTE
 * em nenhuma outra tabela do schema hoje (medido), então ela é a assinatura mais barata e a busca
 * não pode casar com a tabela errada por acidente.
 */
type TabelaDoSchema = Parameters<typeof getTableConfig>[0];

function tabelasDoSchema(): { nome: string; tabela: TabelaDoSchema }[] {
  const achadas: { nome: string; tabela: TabelaDoSchema }[] = [];
  for (const valor of Object.values(schema as Record<string, unknown>)) {
    try {
      achadas.push({ nome: getTableConfig(valor as TabelaDoSchema).name, tabela: valor as TabelaDoSchema });
    } catch {
      // Não é tabela do drizzle. Segue.
    }
  }
  return achadas;
}

function trilha() {
  const candidatas = tabelasDoSchema().filter(({ tabela }) => {
    const nomes = getTableConfig(tabela).columns.map((c) => c.name);
    return nomes.includes("resultado") && nomes.includes("candidato_id");
  });
  if (candidatas.length !== 1) {
    throw new Error(
      "FALTA CONSTRUIR: esperava EXATAMENTE UMA tabela de trilha da retenção (com `candidato_id` " +
        `e \`resultado\`). Achadas: ${JSON.stringify(candidatas.map((c) => c.nome))}. ` +
        "Requisito: seção 3 do mapa de alcance.",
    );
  }
  return { nome: candidatas[0]!.nome, config: getTableConfig(candidatas[0]!.tabela) };
}

/**
 * ─ AS COLUNAS PERMITIDAS, ENUMERADAS À MÃO ────────────────────────────────────────────────────
 *
 * A asserção é de SUBCONJUNTO: qualquer coluna fora desta lista fica vermelha, tenha ela o nome que
 * tiver. É assim que se pega o campo de observação que ninguém previu, e é por isso que a lista não
 * é derivada de nada: derivada, ela cresceria junto com o que vigia.
 */
const COLUNAS_PERMITIDAS_NA_TRILHA = [
  "id",
  "candidato_id",
  "de",
  "para",
  "autor_id",
  "resultado",
  // A AÇÃO (`MARCAR`/`DESMARCAR`) é DERIVADA de `de` e `para`, e entra na lista por um motivo só:
  // ela é LISTA FECHADA, conferida pelo caso seguinte. Coluna derivada não abre porta para dado
  // pessoal; coluna de texto aberto abre, e é essa a fronteira que esta lista guarda.
  "acao",
  // O CARIMBO, nas grafias que a casa usa. Qual das três é escolha de quem constrói.
  "em",
  "criado_em",
  "atualizado_em",
];

/** As colunas que NÃO precisam de lista fechada: booleano, id e data não são texto digitado. */
function ehDeTextoAberto(coluna: { name: string; columnType: string }, fechadas: string[]): boolean {
  if (!/varchar|text|char/i.test(coluna.columnType)) return false;
  return !fechadas.includes(coluna.name);
}

/** Reconstrói o texto de um objeto SQL do drizzle. `JSON.stringify` estoura: a estrutura é circular. */
function textoDoSql(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (Array.isArray(no)) return no.map(textoDoSql).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(textoDoSql).join(" ");
  if ("value" in o && "encoder" in o) return textoDoSql(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(textoDoSql).join(" ");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/** O texto de TODOS os CHECK da trilha, do schema e sem comentário. */
function checksDaTrilha(): string {
  return trilha()
    .config.checks.map((k) => `${k.name} ${textoDoSql((k as unknown as { value: unknown }).value)}`)
    .join(" ")
    .toLowerCase();
}

describe("a trilha da retenção guarda decisão, e NUNCA texto", () => {
  it("existe uma tabela de trilha, com candidato, de, para, autor e resultado", () => {
    const nomes = trilha().config.columns.map((c) => c.name);
    for (const esperada of ["candidato_id", "de", "para", "autor_id", "resultado"]) {
      expect(nomes, `falta a coluna ${esperada} em ${trilha().nome}`).toContain(esperada);
    }
  });

  /**
   * ─ O CAMPO DE OBSERVAÇÃO É ONDE O DADO PESSOAL ENTRA, e ele não pode existir ────────────────
   *
   * Quem opera escreve o NOME DA PESSOA na justificativa, sempre. Não havendo campo, não há onde
   * escrever, e essa é a única forma de garantia que não depende de ninguém lembrar da regra. O
   * requisito é explícito: nenhuma coluna de texto livre, nenhuma coluna de dado pessoal.
   */
  it("NÃO tem coluna nenhuma além das permitidas: sem observação, motivo ou justificativa", () => {
    const nomes = trilha().config.columns.map((c) => c.name);
    expect(
      nomes.filter((n) => !COLUNAS_PERMITIDAS_NA_TRILHA.includes(n)),
      "coluna fora do desenho da seção 3. Se for campo de texto, é onde o nome da pessoa vai " +
        "parar; se for outra coisa, precisa ser decidida e não acrescentada de carona",
    ).toEqual([]);
  });

  it("nenhuma coluna é de TEXTO LIVRE", () => {
    const deTexto = trilha()
      .config.columns.filter((c) => /(^|[^a-z])text/i.test((c as unknown as { columnType: string }).columnType))
      .map((c) => c.name);
    expect(
      deTexto,
      "coluna `text` numa trilha de decisão é um convite a escrever o nome da pessoa dentro dela",
    ).toEqual([]);
  });

  it("`de` e `para` são booleanos: a trilha registra a MESMA pergunta que o campo responde", () => {
    for (const nome of ["de", "para"]) {
      const c = trilha().config.columns.find((x) => x.name === nome)!;
      expect(
        (c as unknown as { columnType: string }).columnType,
        `${nome} precisa ser booleano, como o campo que ele registra`,
      ).toMatch(/boolean/i);
    }
  });

  it("`resultado` é lista FECHADA, com APLICADO e RECUSADO", () => {
    const c = trilha().config.columns.find((x) => x.name === "resultado")!;
    const valores = (c as unknown as { enumValues?: string[] }).enumValues;
    const checks = checksDaTrilha();
    const fechada =
      (valores && valores.length > 0) || (checks.includes("aplicado") && checks.includes("recusado"));
    expect(
      fechada,
      "resultado como texto aberto deixa nascer um terceiro estado sem dono, e a leitura de " +
        `auditoria passa a depender de quem digitou. CHECKs de hoje: "${checks}"`,
    ).toBe(true);
    if (valores) expect([...valores].sort()).toEqual(["APLICADO", "RECUSADO"]);
  });

  /**
   * ─ A REGRA QUE VALE PARA A COLUNA QUE AINDA NÃO EXISTE ──────────────────────────────────────
   *
   * A lista de permitidos acima guarda a porta de hoje. Esta guarda a de amanhã: TODA coluna de
   * texto desta tabela tem de ser lista FECHADA, por CHECK ou por enum. Texto sem lista fechada é,
   * na prática, o campo de observação que o requisito proíbe, com outro nome.
   */
  it("toda coluna de texto da trilha é lista FECHADA", () => {
    const checks = checksDaTrilha();
    const fechadas = trilha()
      .config.columns.filter((c) => {
        const enumValues = (c as unknown as { enumValues?: string[] }).enumValues;
        return (enumValues && enumValues.length > 0) || checks.includes(c.name);
      })
      .map((c) => c.name);
    const abertas = trilha()
      .config.columns.filter((c) =>
        ehDeTextoAberto(c as unknown as { name: string; columnType: string }, fechadas),
      )
      .map((c) => c.name);
    expect(
      abertas,
      "coluna de texto SEM lista fechada nesta tabela é o campo de justificativa de volta pela " +
        "porta dos fundos, e é nele que quem opera escreve o nome da pessoa",
    ).toEqual([]);
  });

  it("a trilha nasce carimbada pelo BANCO, e não por quem lembrar de passar a data", () => {
    // O NOME DO CARIMBO É ESCOLHA DE QUEM CONSTRÓI (`em`, `criado_em`): o requisito pede a DATA.
    const carimbos = trilha().config.columns.filter((c) =>
      /timestamp|date/i.test((c as unknown as { columnType: string }).columnType),
    );
    expect(
      carimbos.map((c) => c.name),
      "nenhuma coluna de data: a trilha responde QUEM e O QUE, e precisa responder QUANDO",
    ).not.toEqual([]);
    for (const c of carimbos) {
      expect(c.notNull, `${c.name} precisa ser NOT NULL`).toBe(true);
      expect(
        c.hasDefault,
        `${c.name} sem default depende de alguém lembrar de passar a data na escrita`,
      ).toBe(true);
    }
  });

  /**
   * ─ A FK DO CANDIDATO NÃO É CASCADE, E ISSO NÃO É DETALHE DE ESTILO ─────────────────────────
   *
   * O molde da casa (`as_vaga_status_eventos`) usa cascade porque aquele rastro é DA vaga. Este é
   * rastro de DECISÃO SOBRE DADO PESSOAL, e tem de sobreviver à linha: apagado o candidato, a
   * pergunta "quem tornou esta pessoa permanente, e quando" continua tendo resposta. Com cascade,
   * a resposta some junto com quem ela protegia.
   */
  it("a FK do candidato NÃO é cascade", () => {
    const fk = trilha().config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "candidato_id"),
    );
    expect(fk, "candidato_id sem FK: a trilha pode apontar para um id que não existe").toBeDefined();
    expect(
      fk!.onDelete,
      "cascade apaga a trilha junto com o candidato, e é justamente a trilha que precisa " +
        "sobreviver a ele",
    ).not.toBe("cascade");
    expect(fk!.onDelete).not.toBe("set null");
  });

  /**
   * ─ A FK DO AUTOR É `restrict`, E É A PERMANÊNCIA DO "QUEM" QUE MANDA AQUI ───────────────────
   *
   * `SET NULL` CONTRADIZ A PERMANÊNCIA DO "QUEM": apagado o usuário, a trilha passa a responder
   * "alguém", e uma trilha de decisão sobre dado pessoal que não sabe mais quem decidiu deixou de
   * ser trilha. O argumento a favor do `set null` era "não derrubar a escrita", e ele se resolve
   * igual com `restrict`, porque ninguém apaga usuário no meio de um insert.
   *
   * ESTE ARQUIVO JÁ EXIGIU O CONTRÁRIO, e o registro fica para ninguém reabrir a discussão: a
   * primeira redação do mapa pedia `set null`, e a correção (linhas 115 a 117 de
   * `docs/MAPA-ALCANCE-FECHAMENTO-FUNDACAO.md`) inverteu a régua com o argumento acima. A decisão é
   * do coordenador, está em disco, e quem quiser mudá-la muda o mapa primeiro.
   *
   * O CASO FICA VERMELHO TAMBÉM COM `cascade`, e por motivo ainda mais forte: ali a trilha some
   * inteira junto com o usuário, em vez de só perder o nome.
   */
  it("a FK do autor é RESTRICT: a trilha nunca passa a responder 'alguém'", () => {
    const fk = trilha().config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "autor_id"),
    );
    expect(fk, "autor_id sem FK: a trilha pode apontar para um usuário que não existe").toBeDefined();
    expect(
      fk!.onDelete,
      "`set null` apaga o AUTOR da decisão e deixa o evento órfão; `cascade` apaga o evento " +
        "inteiro. Nos dois casos a pergunta de auditoria (quem tornou esta pessoa permanente, e " +
        "quem a devolveu ao expurgo) fica sem resposta",
    ).toBe("restrict");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O BANCO FINGIDO: O QUE INTERESSA É O QUE FOI ESCRITO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

interface Escrita {
  tipo: "insert" | "update";
  tabela: string;
  valores: Record<string, unknown>;
}

/** Uma cadeia do drizzle que aceita qualquer encadeamento e resolve no resultado combinado. */
function cadeia(resultado: unknown[]): unknown {
  const alvo = (() => undefined) as unknown as object;
  return new Proxy(alvo, {
    get(_t, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(resultado).then(ok, err);
      }
      if (prop === "catch") return (f: (e: unknown) => unknown) => Promise.resolve(resultado).catch(f);
      if (prop === "finally") return (f: () => void) => Promise.resolve(resultado).finally(f);
      return () => cadeia(resultado);
    },
    apply() {
      return cadeia(resultado);
    },
  });
}

function nomeDaTabela(t: unknown): string {
  try {
    return getTableConfig(t as TabelaDoSchema).name;
  } catch {
    return "desconhecida";
  }
}

function bancoFingido(candidato: Record<string, unknown>) {
  const escritas: Escrita[] = [];
  const db: Record<string, unknown> = {
    query: { asCandidatos: { findFirst: () => Promise.resolve(candidato) } },
    /**
     * ─ A LEITURA DEVOLVE A PESSOA, PELA PROJEÇÃO QUE PEDIRAM ────────────────────────────────
     *
     * O cadeado apura a MUDANÇA REAL contra o valor que está NO BANCO, com a linha travada
     * (`select ... for update`), e um fake que devolvesse vazio faria o caminho morrer antes da
     * decisão que este arquivo mede. A projeção é resolvida COLUNA A COLUNA, e não devolvendo a
     * linha crua: quem constrói escolhe o apelido do campo (`{ atual: ... }`, `{ valor: ... }`), e
     * um fake que ignorasse o apelido devolveria `undefined` e faria o serviço CERTO parecer errado.
     */
    select: (projecao?: Record<string, unknown>) => {
      if (!projecao || typeof projecao !== "object") return cadeia([candidato]);
      const linha: Record<string, unknown> = {};
      for (const [apelido, coluna] of Object.entries(projecao)) {
        const nome = (coluna as { name?: string }).name;
        linha[apelido] = nome ? campo(candidato, [paraSnake(nome)]).valor : undefined;
      }
      return cadeia([linha]);
    },
    execute: () => Promise.resolve([]),
    insert: (t: unknown) => ({
      values: (v: unknown) => {
        const valores = (Array.isArray(v) ? v[0] : v) as Record<string, unknown>;
        escritas.push({ tipo: "insert", tabela: nomeDaTabela(t), valores });
        return cadeia([{ id: ID_CANDIDATO }]);
      },
    }),
    update: (t: unknown) => ({
      set: (v: Record<string, unknown>) => {
        escritas.push({ tipo: "update", tabela: nomeDaTabela(t), valores: v });
        return cadeia([{ id: ID_CANDIDATO }]);
      },
    }),
  };
  db.transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return { db, escritas };
}

/**
 * ─ O ADAPTADOR, e ele existe para que a forma da assinatura custe UMA linha, e não dez casos ──
 */
interface ServicoComCadeado {
  criar(dto: unknown, autor: unknown, ...resto: unknown[]): Promise<unknown>;
  editar(id: string, dto: unknown, autor: unknown, ...resto: unknown[]): Promise<unknown>;
}

function servico(candidato: Record<string, unknown>) {
  const { db, escritas } = bancoFingido(candidato);
  const s = new CandidatosService(db as never, {} as never, {} as never, envioDoPortalFingido() as never);
  // A leitura final (`ficha`) monta a resposta com consultas que este fake não serve, e ela NÃO é o
  // objeto do teste: o que interessa é o que foi ESCRITO. É o padrão dos specs vizinhos.
  vi.spyOn(s as unknown as { ficha: () => Promise<unknown> }, "ficha").mockResolvedValue({} as never);
  return { service: s as unknown as ServicoComCadeado, escritas };
}

/** Uma pessoa já cadastrada, com a retenção no estado que o caso precisa. */
function candidatoNoBanco(bancoTalentos: boolean): Record<string, unknown> {
  return {
    id: ID_CANDIDATO,
    nome: NOME_INVENTADO,
    cpf: null,
    email: null,
    telefone: null,
    dataNascimento: null,
    cidade: null,
    uf: null,
    origem: "MANUAL",
    bancoTalentos,
    anonimizadoEm: null,
    criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    atualizadoEm: new Date("2026-01-01T00:00:00.000Z"),
  };
}

async function editar(
  autor: { id: string; papel: Papel },
  dto: Record<string, unknown>,
  atual: boolean,
): Promise<{ escritas: Escrita[]; erro: unknown }> {
  const { service, escritas } = servico(candidatoNoBanco(atual));
  let erro: unknown = null;
  try {
    await service.editar(ID_CANDIDATO, dto, autor);
  } catch (e) {
    erro = e;
  }
  return { escritas, erro };
}

async function criar(
  autor: { id: string; papel: Papel },
  dto: Record<string, unknown>,
): Promise<{ escritas: Escrita[]; erro: unknown }> {
  const { service, escritas } = servico(candidatoNoBanco(false));
  let erro: unknown = null;
  try {
    await service.criar({ nome: NOME_INVENTADO, ...dto }, autor);
  } catch (e) {
    erro = e;
  }
  return { escritas, erro };
}

/**
 * ─ TUDO O QUE FOI ESCRITO NA PESSOA, SOMADO ─────────────────────────────────────────────────
 *
 * SOMADO, e não "a primeira escrita", porque o DESENHO É DE QUEM CONSTRÓI: a retenção pode ser
 * gravada no mesmo `set` da ficha ou por uma escrita própria, depois da leitura travada. As duas
 * formas cumprem o requisito, e um teste que olhasse só a primeira reprovaria a segunda, que é a
 * mais cuidadosa das duas.
 */
function gravadoNoCandidato(escritas: Escrita[]): Record<string, unknown> {
  return escritas
    .filter((e) => e.tabela === "as_candidatos")
    .reduce<Record<string, unknown>>((acc, e) => ({ ...acc, ...e.valores }), {});
}

function houveEscritaNoCandidato(escritas: Escrita[]): boolean {
  return escritas.some((e) => e.tabela === "as_candidatos");
}

function linhasDaTrilha(escritas: Escrita[]): Record<string, unknown>[] {
  let nome: string;
  try {
    nome = trilha().nome;
  } catch {
    return [];
  }
  return escritas.filter((e) => e.tabela === nome).map((e) => e.valores);
}

function resultadoDa(linha: Record<string, unknown>): unknown {
  return campo(linha, ["resultado"]).valor;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O SUPER_ADMIN MEXE, E A TRILHA REGISTRA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("SUPER_ADMIN marca e desmarca, com trilha", () => {
  it("marcar na EDIÇÃO grava o campo e registra APLICADO, com de, para e autor", async () => {
    const { escritas, erro } = await editar(AUTOR_SUPER, { bancoTalentos: true }, false);
    expect(erro).toBeNull();

    const gravado = temRetencao(gravadoNoCandidato(escritas));
    expect(gravado.achou, "o SUPER_ADMIN mexeu e o campo não foi gravado").toBe(true);
    expect(gravado.valor).toBe(true);

    const linhas = linhasDaTrilha(escritas);
    expect(linhas, "mexer na retenção sem trilha é conceder vida eterna sem rastro").toHaveLength(1);
    expect(resultadoDa(linhas[0]!)).toBe("APLICADO");
    expect(campo(linhas[0]!, ["de"]).valor ?? false).toBe(false);
    expect(campo(linhas[0]!, ["para"]).valor).toBe(true);
    expect(campo(linhas[0]!, ["autor_id", "autorid"]).valor).toBe(AUTOR_SUPER.id);
    expect(campo(linhas[0]!, ["candidato_id", "candidatoid"]).valor).toBe(ID_CANDIDATO);
  });

  it("DESMARCAR também é mexer, e registra APLICADO com de=true e para=false", async () => {
    const { escritas, erro } = await editar(AUTOR_SUPER, { bancoTalentos: false }, true);
    expect(erro).toBeNull();

    const gravado = temRetencao(gravadoNoCandidato(escritas));
    expect(gravado.achou).toBe(true);
    expect(gravado.valor).toBe(false);

    const linhas = linhasDaTrilha(escritas);
    expect(
      linhas,
      "tirar a retenção devolve a pessoa ao expurgo irreversível: é a decisão que mais precisa de " +
        "rastro, e não a que menos",
    ).toHaveLength(1);
    expect(resultadoDa(linhas[0]!)).toBe("APLICADO");
    expect(campo(linhas[0]!, ["de"]).valor).toBe(true);
    expect(campo(linhas[0]!, ["para"]).valor).toBe(false);
  });

  it("marcar já na CRIAÇÃO é permitido ao SUPER_ADMIN, e também registra", async () => {
    const { escritas, erro } = await criar(AUTOR_SUPER, { bancoTalentos: true });
    expect(erro).toBeNull();
    expect(temRetencao(gravadoNoCandidato(escritas)).valor).toBe(true);
    expect(linhasDaTrilha(escritas).map(resultadoDa)).toEqual(["APLICADO"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. QUEM NÃO É SUPER_ADMIN NÃO MEXE, NEM PELA EDIÇÃO NEM PELA CRIAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("COMUM tentando MUDAR a retenção: recusado, sem efeito e com rastro", () => {
  it("na EDIÇÃO, o campo NÃO entra no objeto gravado", async () => {
    const { escritas } = await editar(AUTOR_COMUM, { bancoTalentos: true }, false);
    const gravado = temRetencao(gravadoNoCandidato(escritas));
    expect(
      gravado.achou,
      "o campo entrou no `set`. Comparar e recusar deixa aberto o caminho do formulário " +
        "desatualizado, que DESFAZ em silêncio a decisão de um SUPER_ADMIN; o campo fora do objeto " +
        "gravado não tem esse caminho",
    ).toBe(false);
  });

  it("na EDIÇÃO, a tentativa vira linha RECUSADA na trilha", async () => {
    const { escritas } = await editar(AUTOR_COMUM, { bancoTalentos: true }, false);
    const linhas = linhasDaTrilha(escritas);
    expect(
      linhas,
      "a pergunta de auditoria não é só quem CONSEGUIU: tentativa repetida pelo mesmo autor é o " +
        "sinal de uso indevido, e sem esta linha ela não deixa vestígio nenhum (o protocolo proíbe " +
        "PII no log de acesso)",
    ).toHaveLength(1);
    expect(resultadoDa(linhas[0]!)).toBe("RECUSADO");
    expect(campo(linhas[0]!, ["para"]).valor).toBe(true);
    expect(campo(linhas[0]!, ["autor_id", "autorid"]).valor).toBe(AUTOR_COMUM.id);
  });

  /**
   * ─ O BURACO QUE A FRENTE EXISTE PARA FECHAR ─────────────────────────────────────────────────
   *
   * Sem este caso o cadeado da edição não vale nada: a tela de cadastrar oferece o campo, a rota
   * `POST /as/candidatos` não tem `@Roles`, e quem quisesse imortalizar alguém simplesmente
   * CADASTRARIA DE NOVO, com o campo marcado, sem passar pela edição uma única vez.
   */
  it("na CRIAÇÃO, a pessoa NÃO nasce marcada", async () => {
    const { escritas } = await criar(AUTOR_COMUM, { bancoTalentos: true });
    const gravado = temRetencao(gravadoNoCandidato(escritas));
    expect(
      gravado.achou === false || gravado.valor === false,
      "o COMUM cadastrou alguém já isento do expurgo para sempre. O cadeado da edição não fecha " +
        "porta nenhuma enquanto esta estiver aberta",
    ).toBe(true);
  });

  it("na CRIAÇÃO, a tentativa também vira linha RECUSADA", async () => {
    const { escritas } = await criar(AUTOR_COMUM, { bancoTalentos: true });
    expect(linhasDaTrilha(escritas).map(resultadoDa)).toEqual(["RECUSADO"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. O TRABALHO DO CONSULTOR NÃO PODE QUEBRAR, E ISSO É TÃO OBRIGATÓRIO QUANTO A RECUSA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE ESTES TRÊS CASOS SÃO DA MESMA IMPORTÂNCIA DOS DE CIMA ──────────────────────────────
 *
 * Um cadeado escrito com pressa recusa tudo o que ENCOSTA no campo, e o efeito prático não é
 * segurança: é o consultor COMUM não conseguir mais salvar a ficha de ninguém, porque o formulário
 * manda a ficha inteira, sempre, com o campo dentro. A guarda tem de distinguir MUDANÇA REAL de
 * salvamento que não muda nada, e a distinção é apurada contra o valor que está NO BANCO.
 */
describe("COMUM salvando a ficha sem mexer na retenção: passa, e sem trilha", () => {
  it("sem o campo no corpo: passa, e não gera linha na trilha", async () => {
    const { escritas, erro } = await editar(AUTOR_COMUM, { nome: NOME_INVENTADO }, false);
    expect(erro, "salvar a ficha sem tocar na retenção não pode falhar").toBeNull();
    expect(houveEscritaNoCandidato(escritas), "a edição nem chegou a gravar").toBe(true);
    expect(
      linhasDaTrilha(escritas),
      "trilha de tentativa em salvamento que não mudou nada enche a auditoria de ruído e esconde " +
        "as tentativas de verdade",
    ).toEqual([]);
  });

  it("com o valor IGUAL ao que está no banco: passa, e não gera linha", async () => {
    const { escritas, erro } = await editar(AUTOR_COMUM, { bancoTalentos: false }, false);
    expect(
      erro,
      "reenviar o mesmo valor NÃO é mudança. Recusar aqui quebra todo salvamento de ficha feito " +
        "por um consultor, porque o formulário manda a ficha inteira",
    ).toBeNull();
    expect(linhasDaTrilha(escritas)).toEqual([]);
  });

  it("com o valor IGUAL a `true` (a pessoa já era de banco): passa, e não gera linha", async () => {
    const { escritas, erro } = await editar(AUTOR_COMUM, { bancoTalentos: true }, true);
    expect(erro).toBeNull();
    expect(linhasDaTrilha(escritas)).toEqual([]);
  });

  /**
   * `null` NÃO É `undefined`, e o `@IsOptional()` deixa os dois passarem. Uma guarda escrita como
   * `!== undefined` trataria `null` como mudança e recusaria um salvamento que não muda nada.
   */
  it("com `null` no campo: passa como NÃO mudança, sem trilha e sem erro", async () => {
    const { escritas, erro } = await editar(AUTOR_COMUM, { bancoTalentos: null }, false);
    expect(erro).toBeNull();
    expect(
      linhasDaTrilha(escritas),
      "`null` não é decisão de ninguém: é o campo que a tela não preencheu. Virar linha de " +
        "RECUSADO enche a auditoria de ruído e esconde a tentativa de verdade, que é justamente o " +
        "que a trilha existe para deixar visível",
    ).toEqual([]);
    expect(temRetencao(gravadoNoCandidato(escritas)).achou).toBe(false);
  });

  /**
   * ─ `null` CHEGA AO SERVIÇO, e é isto que torna o caso acima obrigatório e não teórico ────────
   *
   * `@IsOptional()` do class-validator pula a validação para `undefined` E PARA `null`, então um
   * corpo com `"bancoTalentos": null` passa inteiro e desce. Uma guarda escrita como
   * `!== undefined` trata esse `null` como MUDANÇA e cai nos dois casos daqui.
   */
  it("o corpo com `null` passa pela validação: ele CHEGA ao serviço", () => {
    const corpo = plainToInstance(EditarCandidatoDto, { bancoTalentos: null });
    expect(
      validateSync(corpo as object).filter((e) => e.property === "bancoTalentos"),
      "mudou a validação: se `null` passar a ser recusado no corpo, os dois casos do `null` mudam " +
        "de forma, e o salvamento que não muda nada passa a falhar na porta de entrada",
    ).toEqual([]);
  });

  /**
   * ─ A FACE CARA DO MESMO DEFEITO ─────────────────────────────────────────────────────────────
   *
   * Com o SUPER_ADMIN, tratar `null` como mudança não para numa linha de ruído: escreve `null` numa
   * coluna NOT NULL. O banco recusa, a transação inteira cai, e o que o usuário vê é a ficha não
   * salvando, por causa de um campo que ele nem tocou.
   */
  it("SUPER_ADMIN mandando `null` não escreve `null` na coluna NOT NULL", async () => {
    const { escritas, erro } = await editar(AUTOR_SUPER, { bancoTalentos: null }, false);
    expect(erro).toBeNull();
    const gravado = temRetencao(gravadoNoCandidato(escritas));
    expect(
      gravado.achou === false || gravado.valor !== null,
      "o `set` leva `banco_talentos = null` para uma coluna NOT NULL: o banco derruba a transação " +
        "inteira, e a edição da ficha falha por um campo que ninguém mexeu",
    ).toBe(true);
    expect(linhasDaTrilha(escritas)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. O ESCRITOR ÚNICO DEIXA DE SER CONVENÇÃO E VIRA TRAVA (achado 2 do parecer do `seguranca`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O QUE FALTAVA, e o parecer acertou o alvo ───────────────────────────────────────────────────
 *
 * Tudo o que está acima mede o CAMINHO QUE EXISTE: a criação e a edição passam por `aplicarRetencao`
 * e por isso o COMUM não imortaliza ninguém. Nenhum caso acima fica vermelho se alguém acrescentar
 * `bancoTalentos` a um `.values()` ou a um `.set()` EM OUTRO LUGAR: a porta nova simplesmente não é
 * exercitada por teste nenhum, e o cadeado continua verde enquanto é contornado por fora.
 *
 * ┌─ E A PORTA NOVA JÁ TEM DATA ────────────────────────────────────────────────────────────────┐
 * │ A INGESTÃO da onda 4 insere candidato SEM usuário autor. `aplicarRetencao` exige um autor    │
 * │ (confere papel e grava a trilha com o id dele), então uma ingestão que precise marcar alguém │
 * │ vai ser tentada por fora, com o campo dentro do `insert`, e não há nada além de um comentário│
 * │ dizendo que isso é proibido. Comentário não fica vermelho.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE NÃO É BUSCA POR SUBSTRING, que o protocolo de LGPD (seção 1.1, item 3) reprova ────┐
 * │ Procurar `bancoTalentos` no texto acusaria LEITURA (`select({ bancoTalentos: ... })`), acusa-│
 * │ ria a linha do schema que DECLARA a coluna, e acusaria COMENTÁRIO: este próprio arquivo e o  │
 * │ serviço citam o campo dezenas de vezes, inclusive escrito como `"bancoTalentos": null`, que  │
 * │ é a grafia exata de uma chave de objeto. Uma régua assim nasceria vermelha e seria afrouxada │
 * │ no mesmo dia.                                                                                │
 * │                                                                                              │
 * │ A RÉGUA É DE CONTEXTO DE ESCRITA, e é o mesmo movimento da D1: em vez de procurar a palavra, │
 * │ acha-se o LUGAR onde escrever acontece e pergunta-se se o campo está lá dentro. No drizzle   │
 * │ esse lugar tem nome: o objeto passado a `.values(...)` (insert) e a `.set(...)` (update). Em │
 * │ SQL cru é a lista do `set`, entre o `set` e o `where`. Comentário de JS e de SQL sai antes.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o que se lê aqui é CÓDIGO-FONTE do repositório. Nenhum dado de pessoa entra neste arquivo.
 */

const RAIZ_SRC = join(__dirname, "..");

/** Todo `.ts` de produção sob `src/`: teste e infraestrutura de teste ficam de fora. */
function fontesDeProducao(): string[] {
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        if (entrada !== "node_modules") varrer(caminho);
        continue;
      }
      if (!entrada.endsWith(".ts")) continue;
      if (/\.spec\.ts$/.test(entrada) || /\.tester-fake\.ts$/.test(entrada)) continue;
      achados.push(caminho);
    }
  };
  varrer(RAIZ_SRC);
  return achados;
}

/**
 * Apaga comentário de JS (de linha e de bloco) E de SQL (`--`), que é o que torna a leitura honesta.
 *
 * Sem isto, a linha `corpo com "bancoTalentos": null` de um comentário do serviço seria lida como
 * chave de objeto, e a régua acusaria a explicação da regra em vez da violação dela.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/^\s*(\/\/|--).*$/, ""))
    .join("\n");
}

/** O trecho entre os parênteses de `.<metodo>(`, com os parênteses balanceados. */
function argumentosDe(fonte: string, metodo: string): string[] {
  const achados: string[] = [];
  const marca = `.${metodo}(`;
  let de = 0;
  for (;;) {
    const i = fonte.indexOf(marca, de);
    if (i < 0) return achados;
    let profundidade = 0;
    let j = i + marca.length - 1;
    for (; j < fonte.length; j += 1) {
      if (fonte[j] === "(") profundidade += 1;
      if (fonte[j] === ")") {
        profundidade -= 1;
        if (profundidade === 0) break;
      }
    }
    achados.push(fonte.slice(i + marca.length, j));
    de = i + marca.length;
  }
}

/** A coluna aparecendo como CHAVE de um objeto, nos dois estilos de nomenclatura. */
const CHAVE_DA_RETENCAO = /(^|[{,\s[])(bancoTalentos|"banco_talentos"|'banco_talentos'|banco_talentos)\s*:/;

/**
 * A coluna sendo ATRIBUÍDA na lista de um `set` de SQL cru, e as três amarras que isso exige.
 *
 * A PRIMEIRA VERSÃO DESTA FUNÇÃO ACUSOU `db/schema/tables.ts`, e o falso positivo ensina a régua:
 * ela procurava a palavra `set` no arquivo inteiro, casava com o `"set null"` de um `onDelete` de
 * chave estrangeira e engolia mil linhas até achar um `where` qualquer. Um acusador que aponta o
 * arquivo errado é pior que nenhum, porque ele é desligado no primeiro vermelho.
 *
 * As amarras, então: (1) só se lê DENTRO de template (é onde o SQL cru mora, e o `"set null"` de uma
 * opção de FK está entre aspas comuns); (2) o template tem de ser um `update`; (3) o que se procura
 * é a ATRIBUIÇÃO `banco_talentos =` no pedaço entre o `set` e o `where`, e nunca a simples menção,
 * que é exatamente como o expurgo LÊ a coluna, de forma legítima, no `where` dele.
 */
function escritaEmSqlCru(fonte: string): boolean {
  const templates = fonte.split("`").filter((_, i) => i % 2 === 1);
  for (const bruto of templates) {
    const t = bruto.toLowerCase().replace(/\s+/g, " ");
    if (!/\bupdate\b/.test(t)) continue;
    for (const m of t.matchAll(/\bupdate\b[\s\S]*?\bset\b([\s\S]*?)(\bwhere\b|\breturning\b|$)/g)) {
      if (/\bbanco_talentos\s*=/.test(m[1]!)) return true;
    }
  }
  return false;
}

/** Os lugares de ESCRITA da retenção num arquivo, já sem comentário. */
function escritasDaRetencao(fonte: string): string[] {
  const limpo = semComentarios(fonte);
  const lugares: string[] = [];
  for (const metodo of ["values", "set"]) {
    for (const argumento of argumentosDe(limpo, metodo)) {
      if (CHAVE_DA_RETENCAO.test(argumento)) lugares.push(`.${metodo}(...)`);
    }
  }
  if (escritaEmSqlCru(limpo)) lugares.push("lista do `set` em SQL cru");
  return lugares;
}

/**
 * ─ A EXCISÃO DO ESCRITOR LEGÍTIMO, e ela é medida antes de ser usada ──────────────────────────
 *
 * O corpo de `aplicarRetencao` é recortado do arquivo antes da leitura, e a permissão é DAQUELE
 * MÉTODO, não daquele arquivo: o `insert` de `criar` e o `update` de `editar` continuam sob a régua,
 * a três linhas de distância. Renomear ou mover o método faz a excisão falhar, e o caso logo abaixo
 * fica vermelho em vez de a permissão virar uma janela aberta em silêncio.
 */
const FONTE_DO_SERVICO = join(RAIZ_SRC, "as", "candidatos", "candidatos.service.ts");

function recortarAplicarRetencao(fonte: string): { fora: string; dentro: string } {
  const i = fonte.indexOf("private async aplicarRetencao(");
  if (i < 0) return { fora: fonte, dentro: "" };
  const abre = fonte.indexOf("{", i);
  let profundidade = 0;
  let j = abre;
  for (; j < fonte.length; j += 1) {
    if (fonte[j] === "{") profundidade += 1;
    if (fonte[j] === "}") {
      profundidade -= 1;
      if (profundidade === 0) break;
    }
  }
  return { fora: fonte.slice(0, i) + fonte.slice(j + 1), dentro: fonte.slice(abre, j + 1) };
}

describe("a retenção tem UM escritor, e isso é trava e não convenção", () => {
  /**
   * A CONTRAPROVA DA RÉGUA: ela tem de RECONHECER a escrita legítima. Uma régua que não vê o
   * escritor de verdade não veria escritor nenhum, e ficaria verde para sempre sem medir nada.
   */
  it("a régua reconhece a escrita que EXISTE, dentro de `aplicarRetencao`", () => {
    const { dentro } = recortarAplicarRetencao(semComentarios(readFileSync(FONTE_DO_SERVICO, "utf8")));
    expect(
      dentro,
      "o método `aplicarRetencao` não foi achado no serviço: renomeado ou movido, a excisão abaixo " +
        "vira uma janela aberta em silêncio",
    ).not.toBe("");
    expect(
      escritasDaRetencao(dentro),
      "a régua não enxerga nem o escritor legítimo: ela não estaria medindo escrita nenhuma",
    ).not.toEqual([]);
  });

  /**
   * ─ O CASO QUE PEGA A PORTA NOVA ─────────────────────────────────────────────────────────────
   *
   * Varre `src/` inteiro e exige ZERO escrita da retenção fora de `aplicarRetencao`. Acrescentar
   * `bancoTalentos: true` ao `.values()` do `insert` de `criar` (ou a qualquer insert de ingestão,
   * de carga, de importação) fica VERMELHO aqui, e quem o acrescentou é obrigado a decidir, no mesmo
   * commit, se aquela porta pode conceder vida eterna a dado pessoal sem papel e sem trilha.
   */
  it("NENHUM arquivo de produção escreve `banco_talentos` fora de `aplicarRetencao`", () => {
    const fora: string[] = [];
    for (const caminho of fontesDeProducao()) {
      const bruto = readFileSync(caminho, "utf8");
      const fonte =
        caminho === FONTE_DO_SERVICO ? recortarAplicarRetencao(bruto).fora : bruto;
      for (const lugar of escritasDaRetencao(fonte)) {
        fora.push(`${relative(RAIZ_SRC, caminho)} (${lugar})`);
      }
    }
    expect(
      fora,
      "escrita da retenção fora do escritor único. `banco_talentos` é a ÚNICA marca do módulo que " +
        "concede vida eterna a dado pessoal, e `aplicarRetencao` é o que confere o papel, trava a " +
        "linha e grava a trilha. Uma escrita por fora (a INGESTÃO da onda 4 insere SEM usuário " +
        "autor) concede isso sem papel, sem trilha e sem ninguém perceber. Sendo mesmo necessário " +
        "escrever daqui, o caminho é CHAMAR `aplicarRetencao`, e nunca listar a coluna no insert.",
    ).toEqual([]);
  });

  /**
   * O QUE ESTA RÉGUA NÃO PEGA, dito por escrito para ninguém confiar nela além do que ela mede:
   * escrita por chave COMPUTADA (`[coluna]: valor`) ou por espalhamento de um objeto montado em
   * outro lugar (`.values({ ...linha })`) não é visível na leitura do texto. Nenhuma das duas
   * aparece hoje no módulo, e as duas continuam cobertas pelo cadeado de comportamento das seções
   * anteriores quando o caminho passa pelo serviço. Fora dele, a defesa que resta é a revisão.
   */
  /**
   * ─ A METADE DO SQL CRU TAMBÉM É EXERCITADA, e nos DOIS sentidos ─────────────────────────────
   *
   * O expurgo LÊ `banco_talentos` no `where` dele, e isso é a proteção funcionando: uma régua que
   * confundisse leitura com escrita acusaria justamente a linha que preserva as pessoas, seria
   * desligada no primeiro vermelho e não protegeria mais nada. O que ela acusa é a ATRIBUIÇÃO.
   */
  it("no SQL cru, a régua separa LER no `where` de ESCREVER no `set`", () => {
    const leitura = "const q = sql`update as_candidatos c set nome = 'x' where c.banco_talentos = false`;";
    const escrita = "const q = sql`update as_candidatos set banco_talentos = true where id = 1`;";
    expect(
      escritasDaRetencao(leitura),
      "acusar a leitura do expurgo apontaria o arquivo errado, e acusador que erra o alvo é desligado",
    ).toEqual([]);
    expect(
      escritasDaRetencao(escrita),
      "a porta mais fácil de abrir por fora é um `update` em SQL cru, e ela tem de ficar vermelha",
    ).not.toEqual([]);
  });

  /** A grafia de coluna também é acusada quando entra num `insert` do drizzle, e não só a do TS. */
  it("a chave `banco_talentos` num `.values()` é acusada como a `bancoTalentos`", () => {
    expect(escritasDaRetencao(`db.insert(asCandidatos).values({ banco_talentos: true });`)).not.toEqual([]);
    expect(escritasDaRetencao(`db.insert(asCandidatos).values({ bancoTalentos: true });`)).not.toEqual([]);
    expect(
      escritasDaRetencao(`db.select({ bancoTalentos: asCandidatos.bancoTalentos }).from(asCandidatos);`),
      "LER a coluna é legítimo em qualquer lugar: a ficha, a lista e a tela precisam do valor",
    ).toEqual([]);
  });

  it("o espalhamento de objeto é reconhecido como ponto cego, e está declarado", () => {
    const comEspalhamento = `await tx.insert(asCandidatos).values({ ...linha });`;
    expect(
      escritasDaRetencao(comEspalhamento),
      "se um dia esta régua passar a enxergar espalhamento, o comentário acima deixa de valer e " +
        "precisa ser reescrito",
    ).toEqual([]);
  });
});
