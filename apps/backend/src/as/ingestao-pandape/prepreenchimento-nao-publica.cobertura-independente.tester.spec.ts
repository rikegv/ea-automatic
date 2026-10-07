import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { novoResumo } from "./ingestao-ciclo";
import { IngestaoDeParaCliente } from "./ingestao-depara-cliente.service";
import { PROCEDENCIA_DA_PLANILHA } from "../../domain/as-planilha-prepreenchimento";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38): PRÉ-PREENCHER NÃO É PUBLICAR, E A VOLTA ESTÁVEL NÃO ESCREVE ──
 *
 * ESCRITO POR QUEM NÃO CONSTRUIU A FRENTE. O arquivo do autor
 * (`ingestao-prepreenchimento.backend.spec.ts`) já afirma as duas travas pelo lado POSITIVO (o
 * `coalesce` está lá, o `atualizado_em` não está). Este cobre o lado que falta, que é o que
 * sobrevive a uma refatoração de boa-fé:
 *
 *  1. a LISTA NEGATIVA FECHADA: o `set` do pré-preenchimento não nomeia NENHUMA das colunas de
 *     publicação, de papel, de encerramento, de recusa, de cliente nem o relógio da retenção.
 *     Afirmar "escreve estas dez" não impede uma décima primeira de aparecer com nome novo;
 *     afirmar "não escreve estas quinze" impede;
 *  2. PREENCHER O ÚLTIMO OBRIGATÓRIO NÃO LIBERA. É o cenário mais perigoso da frente, porque é o
 *     único em que "publicar agora" parece a coisa certa a fazer: a vaga fica COMPLETA e continua
 *     em REVISÃO, esperando o clique humano;
 *  3. a IDEMPOTÊNCIA MEDIDA NA GUARDA: a instrução carrega as CINCO condições `is null`, então a
 *     volta de 30 em 30 minutos sobre uma vaga já preenchida afeta ZERO linha. A varredura dá 48
 *     voltas por dia, e é essa guarda que as torna inofensivas;
 *  4. a PROCEDÊNCIA nasce atada à condição: cada `*_origem` só é carimbada no `case` do seu campo.
 *     Um carimbo fora da condição afirmaria "veio da planilha" sobre valor digitado por alguém.
 *
 * §A.6: dado SINTÉTICO (código 9xxxxx, cliente `CLI-TESTE-1`, cargo em UUID inventado).
 * §A.11: sem travessão.
 */

const dialeto = new PgDialect();
const VAGA_ID = "11111111-1111-4111-8111-111111111111";
const CARGO_ID = "99999999-9999-4999-8999-999999999999";

function bancoQueAnota(respostas: unknown[][]) {
  const fila = [...respostas];
  const instrucoes: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      return Promise.resolve(fila.shift() ?? []);
    },
  };
  return { db: db as never, instrucoes };
}

/** A linha do espelho com os CINCO campos resolvidos: o pior caso, o que mais escreve. */
const espelhoCompleto = {
  codigo_externo: "900001",
  nome_cliente: "ALFA SERVICOS LTDA",
  cod_cliente: "CLI-TESTE-1",
  confirmado: true,
  codigo_no_catalogo: "CLI-TESTE-1",
  natureza_planilha: "EFETIVA",
  linha_servico_id_planilha: 3,
  cargo_id_planilha: CARGO_ID,
  data_abertura_planilha: "2026-02-01",
  data_limite_planilha: "2026-03-15",
};

async function rodar(linhas: Record<string, unknown>[]) {
  const { db, instrucoes } = bancoQueAnota([linhas]);
  await new IngestaoDeParaCliente(db).resolverERegistrar(
    VAGA_ID,
    { idVacancy: 900001, reference: null },
    novoResumo(),
  );
  return instrucoes;
}

const updates = (instrucoes: { sql: string; params: unknown[] }[]) =>
  instrucoes.filter((i) => /^\s*update/i.test(i.sql));

/** O `update` do PRÉ-PREENCHIMENTO, reconhecido pela coluna que só ele escreve. */
const oDoPrePreenchimento = (instrucoes: { sql: string; params: unknown[] }[]) => {
  const u = updates(instrucoes).find((i) => /natureza_origem/.test(i.sql));
  expect(u, "o pré-preenchimento não mandou instrução nenhuma: o resto do arquivo não prova nada")
    .toBeDefined();
  return u!;
};

/** O recorte do `set` até o `where`: ali `coluna =` é ESCRITA, e não filtro. */
const setDe = (texto: string) => /set([\s\S]*?)\bwhere\b/i.exec(texto)?.[1] ?? "";
const whereDe = (texto: string) => texto.slice(texto.search(/\bwhere\b/i));

/**
 * A FONTE SEM COMENTÁRIO, e a remoção é obrigatória, não higiene.
 *
 * Este arquivo é dos mais comentados do repositório, e os comentários CITAM nominalmente as portas
 * que o código NÃO chama ("não conhece `liberarPendenteRevisao`"). Uma varredura sobre o texto cru
 * acusa a própria explicação como se fosse chamada: foi o primeiro resultado desta asserção, e é um
 * modo de falha JÁ REGISTRADO desta casa (varredura de fonte casando comentário).
 */
const FONTE = readFileSync(join(__dirname, "ingestao-depara-cliente.service.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A LISTA NEGATIVA FECHADA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o `set` do pré-preenchimento não alcança nada que publique, mova ou renove prazo", () => {
  /**
   * CADA UMA DESTAS COLUNAS TEM UM DANO PRÓPRIO, e é por isso que a lista é nominal:
   *  . `atualizado_em` é o RELÓGIO DO EXPURGO de quem está dentro da vaga. A varredura dá 48 voltas
   *    por dia: empurrá-lo renovaria a retenção de todo mundo, para sempre, sem nada ficar vermelho;
   *  . `status`, `status_manual_em`, `status_antes_*` movem PAPEL, e papel é o clique humano;
   *  . `cod_cliente` decide a régua documental e o NOME DA PASTA do prontuário no Drive, e
   *    arquivamento no Drive não se desfaz (§A.33). A planilha produz PROPOSTA, nunca cliente;
   *  . `recusada_em` é a decisão de quem recusou a vaga, e só o botão devolver a desfaz;
   *  . `encerrada_em`, `data_fechamento`, `vagas_fechadas*` são o retrato do fim da vaga;
   *  . `posicoes_oficiais` é a meta, que tem gate de Master e rastro próprio.
   */
  const PROIBIDAS = [
    "atualizado_em",
    "status",
    "status_manual_em",
    "status_manual_por_id",
    "cod_cliente",
    "recusada_em",
    "encerrada_em",
    "data_fechamento",
    "vagas_fechadas",
    "vagas_fechadas_banco",
    "posicoes_oficiais",
    "posicoes_banco",
    "data_reabertura",
    "data_limite_anterior",
    "cliente_proposto_estado",
  ];

  it("nenhuma das quinze colunas proibidas aparece no `set`", async () => {
    const u = oDoPrePreenchimento(await rodar([espelhoCompleto]));
    const set = setDe(u.sql);
    for (const coluna of PROIBIDAS) {
      const escreve = new RegExp(`(^|[\\s,"])${coluna}"?\\s*=`).test(set);
      expect(escreve, `o pré-preenchimento escreve em ${coluna}`).toBe(false);
    }
  });

  it("o `set` escreve EXATAMENTE as dez colunas da frente, e a cardinalidade é a auditoria", async () => {
    const u = oDoPrePreenchimento(await rodar([espelhoCompleto]));
    const atribuidas = [...setDe(u.sql).matchAll(/(?:^|,)\s*"?([a-z_]+)"?\s*=/g)].map((m) => m[1]);
    expect(new Set(atribuidas)).toEqual(
      new Set([
        "natureza",
        "natureza_origem",
        "linha_servico_id",
        "linha_servico_origem",
        "cargo_id",
        "cargo_origem",
        "data_abertura",
        "data_abertura_origem",
        "data_limite",
        "data_limite_origem",
      ]),
    );
    expect(atribuidas).toHaveLength(10);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. PREENCHER O ÚLTIMO OBRIGATÓRIO NÃO LIBERA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a vaga continua em REVISÃO mesmo quando o pré-preenchimento a completa", () => {
  it("com os CINCO campos resolvidos, sai UMA instrução de pré-preenchimento, e nenhuma de status", async () => {
    const instrucoes = await rodar([espelhoCompleto]);

    const doPre = updates(instrucoes).filter((i) => /natureza_origem/.test(i.sql));
    expect(doPre).toHaveLength(1);
    /* Nenhuma instrução, de nenhum tipo, escreve status ou papel. */
    for (const i of instrucoes) {
      expect(/\bset[\s\S]*\bstatus\s*=/i.test(i.sql), "alguma instrução escreveu status").toBe(
        false,
      );
      expect(/insert\s+into\s+as_vaga_status_eventos/i.test(i.sql)).toBe(false);
    }
  });

  it("o escritor não conhece NENHUMA das portas que movem a vaga (fonte)", () => {
    /*
     * O CANÁRIO VEM PRIMEIRO. A remoção dos comentários é agressiva de propósito, e sem o canário
     * uma expressão regular que apagasse o arquivo inteiro deixaria as asserções abaixo passando
     * por VAZIO: "não cita nada" é verdade trivial sobre texto nenhum.
     */
    expect(FONTE).toContain("prePreencher");
    expect(FONTE).toContain("coalesce");
    for (const proibido of [
      "liberarPendenteRevisao",
      "travaObrigatorios",
      "moverStatus",
      "VagasService",
      "as_vaga_status_eventos",
      "reguaDeAbertura",
    ]) {
      expect(FONTE.includes(proibido), `o escritor do pré-preenchimento cita ${proibido}`).toBe(
        false,
      );
    }
  });

  it("o escritor não tem Logger: quem conta é o ciclo, e o que ele conta é número (§A.6)", () => {
    expect(/Logger/.test(FONTE)).toBe(false);
    expect(/console\./.test(FONTE)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. A IDEMPOTÊNCIA MORA NA GUARDA, E A GUARDA É DAS CINCO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a volta de 30 em 30 minutos sobre vaga já preenchida afeta ZERO linha", () => {
  it("as cinco colunas entram no `where` com `is null`, em disjunção", async () => {
    const u = oDoPrePreenchimento(await rodar([espelhoCompleto]));
    const where = whereDe(u.sql);
    for (const coluna of [
      "natureza",
      "linha_servico_id",
      "cargo_id",
      "data_abertura",
      "data_limite",
    ]) {
      expect(
        new RegExp(`${coluna}"?\\s+is\\s+null`).test(where),
        `o \`where\` não exige ${coluna} nula: a volta passaria a reescrever o que uma pessoa preencheu`,
      ).toBe(true);
    }
    expect(/\bor\b/i.test(where), "as cinco condições não estão em disjunção").toBe(true);
    /* E o filtro da vaga continua lá: a instrução não pode valer para a tabela inteira. */
    expect(/\bid"?\s*=\s*\$\d/.test(where)).toBe(true);
  });

  it("as cinco colunas de valor são escritas por `coalesce`, nunca por atribuição direta", async () => {
    const u = oDoPrePreenchimento(await rodar([espelhoCompleto]));
    const set = setDe(u.sql);
    for (const coluna of [
      "natureza",
      "linha_servico_id",
      "cargo_id",
      "data_abertura",
      "data_limite",
    ]) {
      expect(
        new RegExp(`${coluna}"?\\s*=\\s*coalesce\\(\\s*"?${coluna}`, "i").test(set),
        `${coluna} é atribuída sem \`coalesce\`: o valor digitado por uma pessoa seria reescrito`,
      ).toBe(true);
    }
  });

  it("cada procedência é carimbada SÓ no `case` do seu próprio campo", async () => {
    const u = oDoPrePreenchimento(await rodar([espelhoCompleto]));
    const set = setDe(u.sql);
    const pares: [string, string][] = [
      ["natureza_origem", "natureza"],
      ["linha_servico_origem", "linha_servico_id"],
      ["cargo_origem", "cargo_id"],
      ["data_abertura_origem", "data_abertura"],
      ["data_limite_origem", "data_limite"],
    ];
    for (const [origem, valor] of pares) {
      const trecho = new RegExp(
        `${origem}"?\\s*=\\s*case\\s+when\\s+"?${valor}"?\\s+is\\s+null\\s+and\\s+\\$\\d+[^)]*?is\\s+not\\s+null[\\s\\S]*?else\\s+"?${origem}`,
        "i",
      );
      expect(
        trecho.test(set),
        `${origem} não está atada à condição do próprio campo: o carimbo afirmaria "veio da planilha" sobre valor digitado`,
      ).toBe(true);
    }
    expect(u.params).toContain(PROCEDENCIA_DA_PLANILHA);
  });

  it("espelho com os cinco campos VAZIOS não manda instrução de pré-preenchimento nenhuma", async () => {
    const instrucoes = await rodar([
      {
        ...espelhoCompleto,
        natureza_planilha: null,
        linha_servico_id_planilha: null,
        cargo_id_planilha: null,
        data_abertura_planilha: null,
        data_limite_planilha: null,
      },
    ]);
    expect(updates(instrucoes).some((i) => /natureza_origem/.test(i.sql))).toBe(false);
  });
});
