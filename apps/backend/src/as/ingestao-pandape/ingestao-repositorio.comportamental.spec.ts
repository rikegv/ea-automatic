import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  MUTANTES_DO_REPOSITORIO,
  SQL_INSERT_REFERENCIA,
  SQL_UPDATE_REFERENCIA,
  bancoFingido,
  consultaQueCasa,
  escritorQueEngoleARecusa,
  escritorQueRecusaTudo,
  violacoesDaDistincaoDeZeroLinha,
  violacoesDoRepositorioDeCandidato,
} from "./ingestao-repositorio.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE DO LADO DO BANCO DA INGESTÃO (§A.38) ─────────────────────────────────
 *
 * ESCRITO PELO `tester`, QUE NÃO ESCREVEU O REPOSITÓRIO. Ele fecha, com afirmação, três lacunas que
 * o contrato do ciclo (`ingestao-varredura.comportamental.spec.ts`) declarava não alcançar, e uma
 * quarta que só existe porque o `backend` a resolveu melhor do que a régua original:
 *
 *   1. `origem = 'PANDAPE'` é carimbada pelo REPOSITÓRIO, e não pelo ciclo. Ela não é dado do item:
 *      é a assinatura de quem escreve, e o ciclo é o mesmo código para qualquer fonte. Por isso ela
 *      NÃO entra em `COLUNAS_PERMITIDAS`, que governa a projeção do CICLO: misturar as duas coisas
 *      foi o que criou a divergência, e a separação é o conserto dela;
 *   2. a comparação campo a campo está no SQL, e não num `if` do TypeScript;
 *   3. a guarda `anonimizado_em is null` impede a RE-IDENTIFICAÇÃO de quem o expurgo anonimizou;
 *   4. as DUAS causas de "zero linha afetada" são distinguidas, e a recusa não passa por sucesso.
 *
 * §A.6: nada de dado real. O que se lê é o TEXTO da instrução, já com os valores reduzidos a `$1`
 * pelo driver, e a linha sintética não tem dono.
 */

/** O repositório real, com os catálogos fora do caminho: a escrita do candidato não os consulta. */
function repositorio(db: never): IngestaoRepositorio {
  return new IngestaoRepositorio(db, null as never, null as never);
}

/** As duas instruções que o repositório REAL manda ao Postgres ao criar e ao atualizar a pessoa. */
async function instrucoesDeProducao(): Promise<{ insert: string; update: string }> {
  const aoCriar = bancoFingido([
    { quando: /insert\s+into\s+as_candidatos/, devolve: [{ id: "id-sintetico" }] },
  ]);
  await repositorio(aoCriar.db).escrever({
    tabela: "as_candidatos",
    acao: "insert",
    valores: { nome: "Pessoa Sintetica De Teste", cpf: null, email: null, telefone: null },
  });

  const aoAtualizar = bancoFingido([]);
  await repositorio(aoAtualizar.db).escrever({
    tabela: "as_candidatos",
    acao: "update",
    onde: { id: "00000000-0000-4000-8000-000000000001" },
    comparaAntes: ["nome", "cpf", "email", "telefone", "data_nascimento"],
    valores: { nome: "Pessoa Sintetica De Teste", cpf: null, email: null, telefone: null },
  });

  const insert = consultaQueCasa(aoCriar.consultas, /insert\s+into\s+as_candidatos/);
  const update = consultaQueCasa(aoAtualizar.consultas, /update\s+as_candidatos/);
  expect(insert, "o repositório não emitiu insert em `as_candidatos`").not.toBeNull();
  expect(update, "o repositório não emitiu update em `as_candidatos`").not.toBeNull();
  return { insert: insert as string, update: update as string };
}

// ── 1. O CONTRATO SE PROVA ANTES DE ACUSAR ALGUÉM ──────────────────────────────────────────────

describe("o contrato do repositório, exercitado contra referência e mutantes", () => {
  it("APROVA um par de instruções sabidamente correto", () => {
    expect(
      violacoesDoRepositorioDeCandidato(SQL_INSERT_REFERENCIA, SQL_UPDATE_REFERENCIA),
    ).toEqual([]);
  });

  it.each(MUTANTES_DO_REPOSITORIO)(
    "REPROVA o mutante $nome, pela regra certa",
    ({ insert, update, regraEsperada, dano }) => {
      const violacoes = violacoesDoRepositorioDeCandidato(insert, update);
      expect(
        violacoes.filter((x) => x.startsWith(`${regraEsperada}:`)),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it("REPROVA quem engole a recusa da ficha anonimizada", async () => {
    const v = await violacoesDaDistincaoDeZeroLinha(escritorQueEngoleARecusa());
    expect(v.filter((x) => x.startsWith("ANONIMIZADA_PASSA_POR_SUCESSO:"))).not.toEqual([]);
  });

  it("REPROVA quem trata a reentrega idêntica como erro", async () => {
    const v = await violacoesDaDistincaoDeZeroLinha(escritorQueRecusaTudo());
    expect(v.filter((x) => x.startsWith("REENTREGA_IDENTICA_LANCA:"))).not.toEqual([]);
  });
});

// ── 2. O REPOSITÓRIO DE PRODUÇÃO ───────────────────────────────────────────────────────────────

describe("o repositório de produção, medido contra o requisito", () => {
  it("carimba `origem = PANDAPE` no insert, e NÃO a reescreve na atualização", async () => {
    const { insert, update } = await instrucoesDeProducao();
    const violacoes = violacoesDoRepositorioDeCandidato(insert, update);
    expect(
      violacoes.filter(
        (x) =>
          x.startsWith("ORIGEM_NAO_CARIMBADA:") ||
          x.startsWith("ORIGEM_FORA_DO_VOCABULARIO:") ||
          x.startsWith("ORIGEM_REESCRITA_NA_ATUALIZACAO:") ||
          x.startsWith("SEM_INSERT_NOMINAL:"),
      ),
    ).toEqual([]);
  });

  it("a comparação campo a campo vive no SQL, e cobre TODAS as colunas escritas", async () => {
    const { insert, update } = await instrucoesDeProducao();
    const violacoes = violacoesDoRepositorioDeCandidato(insert, update);
    expect(
      violacoes.filter(
        (x) => x.startsWith("COMPARACAO_FORA_DO_SQL:") || x.startsWith("COMPARACAO_INCOMPLETA:"),
      ),
    ).toEqual([]);
  });

  it("o update recusa a ficha ANONIMIZADA, e não a re-identifica", async () => {
    const { insert, update } = await instrucoesDeProducao();
    const violacoes = violacoesDoRepositorioDeCandidato(insert, update);
    expect(violacoes.filter((x) => x.startsWith("GUARDA_DA_ANONIMIZACAO_AUSENTE:"))).toEqual([]);
  });

  it("nenhum carimbo e nenhum `banco_talentos` citados no SQL", async () => {
    const { insert, update } = await instrucoesDeProducao();
    const violacoes = violacoesDoRepositorioDeCandidato(insert, update);
    expect(
      violacoes.filter(
        (x) => x.startsWith("CARIMBO_CITADO_NO_SQL:") || x.startsWith("BANCO_TALENTOS_NO_SQL:"),
      ),
    ).toEqual([]);
  });

  it("cumpre o contrato inteiro do lado do banco, sem nenhuma violação", async () => {
    const { insert, update } = await instrucoesDeProducao();
    expect(violacoesDoRepositorioDeCandidato(insert, update)).toEqual([]);
  });

  it("distingue as DUAS causas de zero linha: a reentrega passa, a anonimizada LANÇA", async () => {
    expect(await violacoesDaDistincaoDeZeroLinha((db) => repositorio(db))).toEqual([]);
  });

  /**
   * A PROVA DE QUE A GUARDA MORDE O CÓDIGO REAL, e não só a referência.
   *
   * O contrato é aplicado à instrução DE PRODUÇÃO com o carimbo de origem retirado dela. Se ficasse
   * verde, o vermelho dos mutantes teria provado apenas que o contrato acusa o texto que eu mesmo
   * escrevi, que é a forma mais comum de um acusador não valer nada.
   */
  it("apagar o carimbo de origem DA INSTRUÇÃO REAL fica vermelho", async () => {
    const { insert, update } = await instrucoesDeProducao();
    const semOrigem = insert.replace(/,\s*origem/i, "").replace(/,\s*'PANDAPE'/i, "");
    expect(semOrigem).not.toEqual(insert);
    expect(
      violacoesDoRepositorioDeCandidato(semOrigem, update).filter((x) =>
        x.startsWith("ORIGEM_NAO_CARIMBADA:"),
      ),
    ).not.toEqual([]);
  });

  it("apagar a guarda da anonimização DA INSTRUÇÃO REAL fica vermelho", async () => {
    const { insert, update } = await instrucoesDeProducao();
    const semGuarda = update.replace(/and\s+anonimizado_em\s+is\s+null/i, "");
    expect(semGuarda).not.toEqual(update);
    expect(
      violacoesDoRepositorioDeCandidato(insert, semGuarda).filter((x) =>
        x.startsWith("GUARDA_DA_ANONIMIZACAO_AUSENTE:"),
      ),
    ).not.toEqual([]);
  });
});
