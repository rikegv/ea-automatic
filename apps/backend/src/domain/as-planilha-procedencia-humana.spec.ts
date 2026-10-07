import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_DO_PRE_PREENCHIMENTO,
  COLUNA_DE_PROCEDENCIA_POR_CAMPO,
  COLUNA_DE_VALOR_POR_CAMPO,
  PROCEDENCIA_DA_PLANILHA,
  camposComProcedenciaDaPlanilha,
  procedenciaALimpar,
} from "./as-planilha-prepreenchimento";

/**
 * ─ A GRAVAÇÃO HUMANA LIMPA A PROCEDÊNCIA, E O CARIMBO PARA DE MENTIR AO CONTRÁRIO (0147) ────────
 *
 * O pré-preenchimento (0146) carimba `PLANILHA` no campo que ELE preencheu. Sem a limpeza, a pessoa
 * TROCA o valor na tela e o carimbo continua afirmando "este veio da planilha" sobre um valor que
 * alguém escolheu. Como a coluna existe para uma CONTAGEM ("quantas vagas herdaram o mesmo erro da
 * planilha?"), o carimbo sobrevivente conta dentro do estrago exatamente a vaga JÁ CORRIGIDA.
 *
 * A DECISÃO QUE ESTE ARQUIVO FIXA, e ela é a parte que se esquece: limpa quando MUDOU, nunca quando
 * apenas GRAVOU. A tela da revisão manda o formulário COMPLETO, então limpar por gravação zeraria as
 * cinco procedências no primeiro Salvar de qualquer campo, inclusive de um campo que não tem nada a
 * ver com os cinco.
 *
 * §A.6: nada aqui compara ou devolve dado pessoal. Os cinco campos são classificação de processo e
 * prazo, e o que sai da função é NOME DE COLUNA.
 */

/** A vaga gravada: os cinco valores de um lado, as cinco procedências do outro. */
const VAGA_DA_PLANILHA = {
  natureza: "EFETIVA",
  linhaServicoId: 3,
  cargoId: "11111111-1111-4111-8111-111111111111",
  dataAbertura: "2026-03-10",
  dataLimite: "2026-04-10",
  naturezaOrigem: PROCEDENCIA_DA_PLANILHA,
  linhaServicoOrigem: PROCEDENCIA_DA_PLANILHA,
  cargoOrigem: PROCEDENCIA_DA_PLANILHA,
  dataAberturaOrigem: PROCEDENCIA_DA_PLANILHA,
  dataLimiteOrigem: PROCEDENCIA_DA_PLANILHA,
};

/** O que `camposDaTrilha` emitiria para o formulário que devolve a vaga como ela está. */
const CORPO_IGUAL = {
  natureza: "EFETIVA",
  linhaServicoId: 3,
  cargoId: "11111111-1111-4111-8111-111111111111",
  dataAbertura: "2026-03-10",
  dataLimite: "2026-04-10",
};

describe("procedenciaALimpar: a edição humana limpa o carimbo DO CAMPO que mudou", () => {
  it("trocar o CARGO limpa `cargo_origem` e NÃO toca a procedência dos outros quatro", () => {
    const limpar = procedenciaALimpar(VAGA_DA_PLANILHA, {
      ...CORPO_IGUAL,
      cargoId: "22222222-2222-4222-8222-222222222222",
    });

    expect(limpar).toEqual({ cargoOrigem: null });
    // A limpeza é POR CAMPO: as outras quatro chaves nem existem no objeto, e chave ausente no
    // `.set()` do Drizzle deixa a coluna INTOCADA. Se elas aparecessem, trocar o cargo apagaria a
    // procedência do tipo de vaga, da célula e das duas datas de uma vez.
    expect(Object.keys(limpar)).toHaveLength(1);
    expect(limpar).not.toHaveProperty("naturezaOrigem");
    expect(limpar).not.toHaveProperty("linhaServicoOrigem");
    expect(limpar).not.toHaveProperty("dataAberturaOrigem");
    expect(limpar).not.toHaveProperty("dataLimiteOrigem");
  });

  it("SALVAR SEM MUDAR não limpa nada: abrir e salvar não é o mesmo gesto que trocar", () => {
    // A DECISÃO, medida aqui: o formulário devolve os cinco campos iguais, e nenhuma procedência
    // cai. Fosse por gravação, o primeiro Salvar de qualquer campo zeraria a contagem inteira.
    expect(procedenciaALimpar(VAGA_DA_PLANILHA, CORPO_IGUAL)).toEqual({});
  });

  it("ESVAZIAR o campo também limpa: trocar valor por nulo é mudança como qualquer outra", () => {
    const limpar = procedenciaALimpar(VAGA_DA_PLANILHA, { ...CORPO_IGUAL, dataLimite: null });
    expect(limpar).toEqual({ dataLimiteOrigem: null });
  });

  it("`\"\"` do formulário e `null` da coluna são o MESMO fato: não há mudança inventada", () => {
    const vagaSemCargo = { ...VAGA_DA_PLANILHA, cargoId: null, cargoOrigem: null };
    expect(procedenciaALimpar(vagaSemCargo, { ...CORPO_IGUAL, cargoId: "" })).toEqual({});
  });

  it("a `date` do driver como objeto `Date` compara igual ao texto ISO que o corpo manda", () => {
    // O driver devolve `date` como texto OU como `Date`, e os dois chegam. Sem a normalização, o
    // objeto nunca seria igual à string e TODA gravação limparia as duas datas.
    const comObjeto = { ...VAGA_DA_PLANILHA, dataAbertura: new Date("2026-03-10T00:00:00.000Z") };
    expect(procedenciaALimpar(comObjeto, CORPO_IGUAL)).toEqual({});
  });

  it("o número da linha de serviço compara com o texto do corpo, e trocar de célula limpa", () => {
    expect(procedenciaALimpar(VAGA_DA_PLANILHA, { ...CORPO_IGUAL, linhaServicoId: "3" })).toEqual({});
    expect(procedenciaALimpar(VAGA_DA_PLANILHA, { ...CORPO_IGUAL, linhaServicoId: 7 })).toEqual({
      linhaServicoOrigem: null,
    });
  });

  it("campo que a porta NÃO vai gravar é ignorado: coluna preservada não é coluna apagada", () => {
    // A edição da vaga liberada monta o `set` só com o que mudou. Se a ausência da chave contasse
    // como "virou undefined", editar uma observação limparia a procedência dos cinco campos.
    expect(procedenciaALimpar(VAGA_DA_PLANILHA, { codigo: "PS-1" })).toEqual({});
  });

  it("sem vaga ou sem corpo, nada se limpa (a liberação que só vincula o cliente)", () => {
    expect(procedenciaALimpar(VAGA_DA_PLANILHA, null)).toEqual({});
    expect(procedenciaALimpar(null, CORPO_IGUAL)).toEqual({});
  });

  it("os dois mapas cobrem os CINCO campos, e nenhum nome de coluna se repete", () => {
    expect(Object.keys(COLUNA_DE_VALOR_POR_CAMPO).sort()).toEqual(
      [...CAMPOS_DO_PRE_PREENCHIMENTO].sort(),
    );
    const procedencias = Object.values(COLUNA_DE_PROCEDENCIA_POR_CAMPO);
    expect(new Set(procedencias).size).toBe(procedencias.length);
  });
});

describe("camposComProcedenciaDaPlanilha: o retrato do instante, em nome de campo", () => {
  it("devolve só os campos carimbados, em ordem estável do vocabulário fechado", () => {
    const linha = {
      naturezaOrigem: PROCEDENCIA_DA_PLANILHA,
      linhaServicoOrigem: null,
      cargoOrigem: PROCEDENCIA_DA_PLANILHA,
      dataAberturaOrigem: null,
      dataLimiteOrigem: null,
    };
    expect(camposComProcedenciaDaPlanilha(linha)).toEqual(["natureza", "cargo"]);
  });

  it("vaga sem nenhum campo da planilha devolve LISTA VAZIA, e não nulo", () => {
    // O vazio é o denominador da contagem: ele diz "medimos e deu zero", que é diferente de "não
    // medimos" (a coluna nula do evento).
    expect(camposComProcedenciaDaPlanilha({})).toEqual([]);
    expect(camposComProcedenciaDaPlanilha(null)).toEqual([]);
  });

  it("valor FORA do vocabulário não conta como planilha: a pergunta é sobre a PLANILHA", () => {
    // O CHECK da 0146 tem um valor só hoje, mas existe para o segundo ("veio do ATS") passar por
    // alguém. Quando ele existir, esta função continua respondendo o que diz responder.
    expect(camposComProcedenciaDaPlanilha({ cargoOrigem: "ATS" })).toEqual([]);
  });
});

/**
 * ─ TESTE DE FONTE: AS COLUNAS `*_origem` NÃO SÃO CAMPO DE FORMULÁRIO ───────────────────────────
 *
 * `camposDaTrilha` é o montador do corpo, e a regra declarada dele é "o corpo é COMPLETO, campo
 * ausente é campo LIMPO". Uma procedência emitida por ele seria apagada por qualquer salvamento
 * parcial, em silêncio. É o mesmo modo de falha que o `id_vacancy_pandape` já pagou nesta casa, e
 * que terminou em vaga DUPLICATA criada pela varredura do Pandapé.
 *
 * O TESTE LÊ A FONTE, e não o objeto devolvido, porque a ausência é uma invariante do CÓDIGO: o
 * objeto de um dto específico poderia não trazer a chave por acidente do caso de teste.
 */
describe("fonte: a procedência nunca entra no montador do formulário nem na trilha da edição", () => {
  const raiz = join(__dirname, "..");
  const ler = (relativo: string) => readFileSync(join(raiz, relativo), "utf8");

  /** O corpo de `camposDaTrilha`, do `public camposDaTrilha(` até o método seguinte. */
  function corpoDoMontador(fonte: string): string {
    const inicio = fonte.indexOf("public camposDaTrilha(");
    expect(inicio).toBeGreaterThan(-1);
    const fim = fonte.indexOf("\n  private ", inicio);
    expect(fim).toBeGreaterThan(inicio);
    return fonte.slice(inicio, fim);
  }

  it("`camposDaTrilha` não emite NENHUMA das cinco colunas de procedência", () => {
    const corpo = corpoDoMontador(ler("as/vagas/vagas.service.ts"));
    for (const coluna of Object.values(COLUNA_DE_PROCEDENCIA_POR_CAMPO)) {
      expect(corpo).not.toContain(coluna);
    }
  });

  it("a lista de campos da trilha da edição também não as conhece (há CHECK no banco)", () => {
    // `VAGA_EDICAO_CAMPOS_DA_TRILHA` vira `ck_vaga_edicoes_campo`. Um nome de coluna de procedência
    // ali derrubaria a transação da edição inteira.
    const fonte = ler("domain/vaga-edicao.ts");
    for (const coluna of Object.values(COLUNA_DE_PROCEDENCIA_POR_CAMPO)) {
      expect(fonte).not.toContain(coluna);
    }
  });

  it("as TRÊS portas de gravação humana chamam `procedenciaALimpar`", () => {
    // A pergunta "quem mais escreve este dado?" respondida como lista fechada: `atualizar` e
    // `liberarPendenteRevisao` (as duas que espalham `camposDaTrilha` num UPDATE) e a edição da
    // vaga liberada. O `create` fica de fora de propósito: lá as colunas nascem nulas.
    const vagasService = ler("as/vagas/vagas.service.ts");
    // DUAS chamadas no `vagas.service` (`atualizar` e `liberarPendenteRevisao`) e UMA na edição.
    expect(vagasService.split("procedenciaALimpar(").length - 1).toBe(2);
    expect(ler("as/vagas/vagas-edicao.service.ts")).toContain("procedenciaALimpar(");
  });
});
