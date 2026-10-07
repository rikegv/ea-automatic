import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { DeParaClienteService } from "./depara-cliente.service";

/**
 * ─ A TERCEIRA PASSADA DA SINCRONIZAÇÃO: O PRÉ-PREENCHIMENTO NO ESPELHO ─────────────────────────
 *
 * ┌─ O QUE ESTE ARQUIVO PROVA ───────────────────────────────────────────────────────────────────┐
 * │ 1. A PASSADA ESTÁVEL ESCREVE ZERO. A planilha igual à de ontem produz NENHUMA instrução de    │
 * │    escrita, pelo `is distinct from` em JS antes da ida ao banco. Sem isso, 263 códigos viram  │
 * │    263 escritas a cada volta da sincronização, para sempre;                                    │
 * │ 2. A LINHA NOVA NASCE COM O PRÉ-PREENCHIMENTO NO `insert`, e não só na terceira passada: a     │
 * │    passada que CRIA é a única que sabe que a linha é nova, e a terceira pula linha inexistente; │
 * │ 3. A LINHA CONFIRMADA CONTINUA RECEBENDO: a confirmação humana desta tabela é sobre o CLIENTE, │
 * │    e cargo/data são atributo da VAGA, ortogonais ao vínculo;                                    │
 * │ 4. O CARGO VIAJA COMO `cargo_id` DO CATÁLOGO DO EA, nunca como o TEXTO da célula (§A.6).        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM POSTGRES, E ISSO ESTÁ DECLARADO: o que se mede é a INSTRUÇÃO compilada com o `PgDialect` real,
 * no mesmo molde do `depara-cliente.sincronizacao.backend.spec.ts`.
 *
 * §A.6: todo dado é SINTÉTICO. Empresa inventada, códigos `CLI-TESTE-n`, chaves 9xxxxx, cargos em
 * UUID inventado. Nenhum CPF, nenhum nome de pessoa, nenhum salário, nada da planilha real.
 */

const dialeto = new PgDialect();
const CARGO_ID = "99999999-9999-4999-8999-999999999999";
const CARGO_NOME = "ANALISTA DE TESTE SINTETICO";

const CATALOGO_DE_CLIENTES = [
  { cod_cliente: "CLI-TESTE-1", razao_social: "ALFA SERVICOS LTDA", nome_operacao: null },
];
const CATALOGO_DE_CARGOS = [{ id: CARGO_ID, nome: CARGO_NOME, ativo: true }];
const CATALOGO_DE_LINHAS = [{ id: 3, codigo: "ALTO_VOLUME" }];

/**
 * O banco fingido, respondendo por FORMA da consulta.
 *
 * A ORDEM DOS RAMOS IMPORTA: `from cargos` e `from as_linhas_servico` vêm ANTES do ramo genérico,
 * senão os catálogos novos cairiam no `[]` e o pré-preenchimento sairia vazio em todo teste, o que
 * deixaria este arquivo verde afirmando nada.
 */
function bancoFingido(existentes: Record<string, unknown>[] = []) {
  const instrucoes: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      if (/from\s+cargos/i.test(c.sql)) return Promise.resolve(CATALOGO_DE_CARGOS);
      if (/from\s+as_linhas_servico/i.test(c.sql)) return Promise.resolve(CATALOGO_DE_LINHAS);
      if (/from\s+clientes/i.test(c.sql)) return Promise.resolve(CATALOGO_DE_CLIENTES);
      if (/from\s+"?as_depara_cliente_vaga"?/i.test(c.sql)) return Promise.resolve(existentes);
      return Promise.resolve([]);
    },
  };
  return { db: db as never, instrucoes };
}

/** A planilha fingida, com as quatro colunas novas do pré-preenchimento. */
function planilhaFingida(
  linhas: {
    codigo: string | null;
    cliente: string | null;
    cargo?: string | null;
    status?: string | null;
    tipoVaga?: string | null;
    celulaAtendimento?: string | null;
    dataAbertura?: string | null;
    slaEntrega?: string | null;
  }[],
) {
  return {
    estaAtiva: () => true,
    ler: () =>
      Promise.resolve({
        totalLinhas: linhas.length,
        linhas: linhas.map((l) => ({
          codigo: l.codigo,
          cliente: l.cliente,
          cargo: l.cargo ?? null,
          status: l.status ?? null,
          tipoVaga: l.tipoVaga ?? null,
          celulaAtendimento: l.celulaAtendimento ?? null,
          dataAbertura: l.dataAbertura ?? null,
          slaEntrega: l.slaEntrega ?? null,
        })),
      }),
  } as never;
}

/** A LINHA DA PLANILHA COMPLETA, com os quatro valores que o de/para reconhece. */
const LINHA_COMPLETA = {
  codigo: "900001",
  cliente: "ALFA SERVICOS LTDA",
  cargo: CARGO_NOME,
  status: "Aberto",
  tipoVaga: "Efetiva",
  celulaAtendimento: "ALTO VOLUME",
  dataAbertura: "01/02/2026",
  slaEntrega: "15/03/2026",
};

/** A linha JÁ gravada no espelho, com o pré-preenchimento IGUAL ao que a planilha diz. */
const linhaExistente = (over: Record<string, unknown> = {}) => ({
  id: 7,
  codigo_externo: "900001",
  nome_cliente: "ALFA SERVICOS LTDA",
  cod_cliente: "CLI-TESTE-1",
  casamento: "EXATO",
  status_planilha: "ABERTO",
  confirmado: false,
  ativo: true,
  natureza_planilha: "EFETIVA",
  linha_servico_id_planilha: 3,
  cargo_id_planilha: CARGO_ID,
  data_abertura_planilha: "2026-02-01",
  data_limite_planilha: "2026-03-15",
  ...over,
});

const escritas = (instrucoes: { sql: string; params: unknown[] }[]) =>
  instrucoes.filter((i) => /^\s*(insert|update)/i.test(i.sql));

const doPrePreenchimento = (instrucoes: { sql: string; params: unknown[] }[]) =>
  escritas(instrucoes).filter((i) => /natureza_planilha/.test(i.sql));

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A PASSADA ESTÁVEL ESCREVE ZERO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a passada estável escreve ZERO", () => {
  it("planilha IGUAL ao espelho: nenhuma instrução de escrita, nem de status, nem de palpite", async () => {
    /*
     * ┌─ O DEFEITO QUE ISTO IMPEDE É DE CUSTO, E ELE CRESCE SOZINHO ─────────────────────────────┐
     * │ A sincronização roda de hora em hora sobre 263 códigos. Uma terceira passada que escrevesse │
     * │ sempre somaria 263 `update` por volta, para sempre, e cada um deles empurra o                │
     * │ `atualizado_em` do ESPELHO, que é o que alguém usaria para responder "quando esta tradução   │
     * │ mudou?". O carimbo passaria a dizer "agora", sempre, e deixaria de responder qualquer coisa. │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: tirar o `prePreenchimentoMudou` e mandar o `update` sempre, confiando só
     * no `is distinct from` do `where` (que evitaria a ESCRITA no banco, mas não a IDA ao banco).
     */
    const { db, instrucoes } = bancoFingido([linhaExistente()]);
    const planilha = planilhaFingida([LINHA_COMPLETA]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(escritas(instrucoes), "a passada estável escreveu").toEqual([]);
    expect(resumo.linhasAtualizadas).toBe(0);
    /* E ela de fato VIU o pré-preenchimento: o teste não é verde por não ter lido nada. */
    expect(resumo.prePreenchimentosComValor).toBe(1);
  });

  it("UM dos cinco campos mudou: UMA instrução, e ela carrega o valor NOVO", async () => {
    /*
     * O par do teste acima. Sem ele, a forma mais fácil de ficar verde ali seria nunca escrever, e o
     * espelho ficaria congelado no primeiro valor para sempre, que é o pior dos dois mundos: a
     * planilha corrigida nunca chegaria à vaga.
     */
    const { db, instrucoes } = bancoFingido([linhaExistente()]);
    const planilha = planilhaFingida([{ ...LINHA_COMPLETA, slaEntrega: "20/03/2026" }]);

    await new DeParaClienteService(db, planilha).sincronizar();

    const pre = doPrePreenchimento(instrucoes);
    expect(pre).toHaveLength(1);
    expect(pre[0]?.params, "o valor novo não foi gravado").toContain("2026-03-20");
    expect(pre[0]?.sql, "a escrita do espelho não é condicional").toContain("is distinct from");
  });

  it("a `date` vinda do driver como `Date` não conta como mudança", async () => {
    /*
     * ┌─ O DEFEITO MAIS FÁCIL DE NÃO VER DESTA FRENTE ──────────────────────────────────────────┐
     * │ O driver devolve `date` como string OU como `Date`, dependendo da configuração. Comparando  │
     * │ `Date` com a string `AAAA-MM-DD` do domínio, TODA volta diria "mudou", e a passada estável   │
     * │ voltaria a escrever 263 vezes por hora, com os MESMOS valores. Verde em teste, caro em        │
     * │ produção, e indistinguível de funcionamento normal.                                          │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { db, instrucoes } = bancoFingido([
      linhaExistente({
        data_abertura_planilha: new Date("2026-02-01T00:00:00Z"),
        data_limite_planilha: new Date("2026-03-15T00:00:00Z"),
      }),
    ]);
    const planilha = planilhaFingida([LINHA_COMPLETA]);

    await new DeParaClienteService(db, planilha).sincronizar();

    expect(doPrePreenchimento(instrucoes), "a data em `Date` virou escrita inútil").toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A LINHA NOVA, E A LINHA CONFIRMADA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a linha nova nasce preenchida, e a confirmada continua recebendo", () => {
  it("linha NOVA: o `insert` já leva os cinco valores, resolvidos contra o catálogo", async () => {
    /*
     * Sem isto, um código recém-lançado na planilha ficaria sem pré-preenchimento até a volta
     * seguinte, e "chegou na próxima hora" é um atraso que ninguém investiga e que ninguém explica.
     */
    const { db, instrucoes } = bancoFingido([]);
    const planilha = planilhaFingida([LINHA_COMPLETA]);

    await new DeParaClienteService(db, planilha).sincronizar();

    const insert = escritas(instrucoes).find((i) => /^\s*insert/i.test(i.sql));
    expect(insert?.params).toContain("EFETIVA");
    expect(insert?.params, "a célula não virou `id` do catálogo").toContain(3);
    expect(insert?.params, "o cargo não virou `id` do catálogo").toContain(CARGO_ID);
    expect(insert?.params).toContain("2026-02-01");
    expect(insert?.params).toContain("2026-03-15");
    /* §A.6: o TEXTO da célula não atravessa, em nenhum dos campos. */
    expect(insert?.params, "o texto do cargo foi gravado").not.toContain(CARGO_NOME);
    expect(insert?.params, "o texto da célula foi gravado").not.toContain("ALTO VOLUME");
    expect(insert?.params, "o texto do tipo de vaga foi gravado").not.toContain("Efetiva");
    expect(insert?.params, "o texto da data foi gravado").not.toContain("01/02/2026");
  });

  it("linha CONFIRMADA continua recebendo cargo e data frescos", async () => {
    /*
     * ┌─ A CONFIRMAÇÃO DESTA TABELA É SOBRE O CLIENTE, E SÓ SOBRE ELE ──────────────────────────┐
     * │ A pessoa que confirmou carimbou "este código é deste cliente". Ela não carimbou o cargo    │
     * │ nem a data de abertura, que são atributo da VAGA e mudam por conta própria. Congelar os     │
     * │ cinco campos na confirmação faria o espelho envelhecer em silêncio, e é a mesma razão pela  │
     * │ qual o `status_planilha` também é escrito fora do caminho do palpite.                       │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { db, instrucoes } = bancoFingido([
      linhaExistente({ confirmado: true, cargo_id_planilha: null }),
    ]);
    const planilha = planilhaFingida([LINHA_COMPLETA]);

    await new DeParaClienteService(db, planilha).sincronizar();

    const pre = doPrePreenchimento(instrucoes);
    expect(pre, "a linha confirmada deixou de receber o pré-preenchimento").toHaveLength(1);
    expect(pre[0]?.params).toContain(CARGO_ID);
    /* E a confirmação NÃO é reaberta por isso: nada de `confirmado_em` nesta instrução. */
    expect(pre[0]?.sql).not.toContain("confirmado_em");
  });

  it("linha AMBÍGUA de cliente é pulada na terceira passada, como na segunda", async () => {
    /*
     * A ambiguidade de CLIENTE desliga a linha (a planilha passou a dizer duas coisas sobre o
     * código), e tocá-la aqui poluiria a instrução única que mede o desligamento. É outra coisa da
     * abstenção POR CAMPO do pré-preenchimento, que já se resolveu em nulo dentro do domínio puro.
     */
    const { db, instrucoes } = bancoFingido([linhaExistente({ cargo_id_planilha: null })]);
    const planilha = planilhaFingida([
      LINHA_COMPLETA,
      { ...LINHA_COMPLETA, cliente: "OUTRA EMPRESA SINTETICA LTDA" },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.linhasDesligadasPorAmbiguidade).toBe(1);
    expect(doPrePreenchimento(instrucoes), "a linha ambígua foi tocada").toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O RESUMO É CONTAGEM
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o resumo conta, e não nomeia (§A.6)", () => {
  it("o resumo NÃO carrega valor cru das quatro colunas novas, e segue todo numérico", async () => {
    /*
     * §A.6 NA SUPERFÍCIE MENOS VIGIADA DESTA FRENTE. O resumo é devolvido por rota E vai para o log,
     * que é permanente e está fora do alcance do expurgo. As quatro colunas novas são TEXTO LIVRE
     * digitado por gente, e nesta casa texto livre de ATS já chegou com nome de pessoa dentro (achado
     * R1 do `seguranca`): o canário abaixo entra pela coluna de tipo de vaga e não pode sair.
     *
     * NOTE QUE O VALOR CANARINHO NÃO CASA NO DE/PARA, de propósito: além de não vazar, ele prova que
     * texto desconhecido vira `NAO_CASOU` (abstenção) e NÃO vira ambiguidade, porque ausência de
     * informação reconhecível não é uma segunda opinião. Por isso a contagem de ambíguos é ZERO aqui,
     * e é o teste seguinte que mede a ambiguidade de verdade.
     */
    const CANARIO = "CANARIO-NAO-PODE-SAIR-9z9z9z";
    const { db } = bancoFingido([]);
    const planilha = planilhaFingida([
      { ...LINHA_COMPLETA, cliente: `ALFA SERVICOS LTDA`, tipoVaga: "Efetiva" },
      { ...LINHA_COMPLETA, cliente: `ALFA SERVICOS LTDA`, tipoVaga: `Estágio ${CANARIO}` },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    /* Texto desconhecido é ABSTENÇÃO, não contradição: nada de ambiguidade contada aqui. */
    expect(resumo.prePreenchimentosAmbiguosPorCampo).toBe(0);
    expect(JSON.stringify(resumo)).not.toContain(CANARIO);
    for (const [campo, valor] of Object.entries(resumo)) {
      if (campo === "falha") continue;
      expect(typeof valor, `o resumo tem campo não numérico: ${campo}`).toBe("number");
    }
  });

  it("DOIS tipos reconhecidos no mesmo código: o campo se abstém, e a abstenção é CONTADA", async () => {
    const { db, instrucoes } = bancoFingido([]);
    const planilha = planilhaFingida([
      LINHA_COMPLETA,
      { ...LINHA_COMPLETA, tipoVaga: "Estágio" },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.prePreenchimentosAmbiguosPorCampo).toBe(1);
    const insert = escritas(instrucoes).find((i) => /^\s*insert/i.test(i.sql));
    /* O TIPO não foi escolhido, e os OUTROS QUATRO campos sobreviveram: abstenção por CAMPO. */
    expect(insert?.params, "o tipo contraditório foi escolhido").not.toContain("EFETIVA");
    expect(insert?.params, "a ambiguidade do tipo apagou o cargo").toContain(CARGO_ID);
    expect(insert?.params, "a ambiguidade do tipo apagou a célula").toContain(3);
  });
});
