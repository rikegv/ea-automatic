import { describe, expect, it } from "vitest";
import { FRENTES_AO_NASCER, kitLiberado, podeAbrirCadastro, type EstadoFrente } from "./frentes";

describe("gate do Cadastro (§A.3 regra 3)", () => {
  it("não abre com nenhuma frente concluída", () => {
    const frentes: EstadoFrente[] = [
      { tipo: "AUDITORIA", concluida: false },
      { tipo: "EXAME", concluida: false },
    ];
    expect(podeAbrirCadastro(frentes)).toBe(false);
  });

  it("não abre com apenas uma das duas concluída (independência — regra 2)", () => {
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: false },
      ]),
    ).toBe(false);
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: false },
        { tipo: "EXAME", concluida: true },
      ]),
    ).toBe(false);
  });

  it("abre somente com AUDITORIA e EXAME concluídas", () => {
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
      ]),
    ).toBe(true);
  });
});

describe("nascimento paralelo (regra 1)", () => {
  it("AUDITORIA e EXAME nascem juntas; CADASTRO não", () => {
    expect(FRENTES_AO_NASCER).toEqual(["AUDITORIA", "EXAME"]);
    expect(FRENTES_AO_NASCER).not.toContain("CADASTRO_CONTRATO");
  });
});

describe("gate do kit (F9 / INT-4)", () => {
  it("libera somente com as TRÊS frentes concluídas", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ]),
    ).toBe(true);
  });

  it("bloqueia faltando o CADASTRO_CONTRATO (mesmo com Auditoria e Exame ok)", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: false },
      ]),
    ).toBe(false);
  });

  it("bloqueia faltando o CADASTRO_CONTRATO (frente ausente)", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
      ]),
    ).toBe(false);
  });

  it("bloqueia faltando a AUDITORIA", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: false },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ]),
    ).toBe(false);
  });

  it("bloqueia faltando o EXAME", () => {
    expect(
      kitLiberado([
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: false },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ]),
    ).toBe(false);
  });
});

/**
 * LIBERADO PARA CADASTRO SEM ASO (OST do ADM) — o gate aprende um status, e o bit `concluida` NÃO
 * é tocado.
 *
 * O que estes testes travam é a decisão central da frente: o EXAME libera o avanço de DUAS formas
 * (concluído de verdade, ou liberado sem ASO), e a segunda NÃO conclui a frente. A alternativa
 * recusada era carimbar `concluida = true` no status novo, que teria tirado a admissão da fila do
 * Exame e impedido o ASO de fechá-la depois.
 */
describe("Gate do Cadastro com o Exame liberado sem ASO", () => {
  const auditoriaOk: EstadoFrente = { tipo: "AUDITORIA", concluida: true, status: "ANALISE_OK" };

  it("ABRE o gate com o Exame liberado sem ASO, mesmo com a frente NÃO concluída", () => {
    const exame: EstadoFrente = {
      tipo: "EXAME",
      concluida: false,
      status: "LIBERADO_SEM_ASO",
    };
    expect(podeAbrirCadastro([auditoriaOk, exame])).toBe(true);
    // E o bit continua falso: é ele que mantém a admissão na fila do Exame.
    expect(exame.concluida).toBe(false);
  });

  it("NÃO abre com o Exame em qualquer outro status não concluído", () => {
    for (const status of ["A_AGENDAR", "AGENDADO", "AGUARDANDO_ASO", "ASO_PENDENTE", "CANCELADO"]) {
      expect(podeAbrirCadastro([auditoriaOk, { tipo: "EXAME", concluida: false, status }])).toBe(
        false,
      );
    }
  });

  it("NÃO abre com o Exame liberado se a AUDITORIA ainda não concluiu", () => {
    // A liberação é do EXAME e só dele: a Auditoria continua exigindo conclusão de verdade.
    expect(
      podeAbrirCadastro([
        { tipo: "AUDITORIA", concluida: false, status: "ANALISE_PENDENTE" },
        { tipo: "EXAME", concluida: false, status: "LIBERADO_SEM_ASO" },
      ]),
    ).toBe(false);
  });

  it("FAIL-CLOSED: sem o status informado, o gate se comporta como antes (só o bit)", () => {
    // É a rede da §A.26: um chamador que não passe o status recebe o comportamento antigo, que
    // BARRA. Errar para o lado de não avançar é visível na hora; errar para o lado de avançar não.
    expect(podeAbrirCadastro([auditoriaOk, { tipo: "EXAME", concluida: false }])).toBe(false);
    expect(podeAbrirCadastro([auditoriaOk, { tipo: "EXAME", concluida: true }])).toBe(true);
  });

  it("o KIT (gate F12) é liberado para quem está liberado sem ASO, com o Cadastro concluído", () => {
    // Decisão do diretor: o contrato TEM de sair. Não há linha nova no `kitLiberado`: ele reusa o
    // gate, então herdou a regra. Este teste é o que impede alguém de "consertar" isso depois.
    const frentes: EstadoFrente[] = [
      auditoriaOk,
      { tipo: "EXAME", concluida: false, status: "LIBERADO_SEM_ASO" },
      { tipo: "CADASTRO_CONTRATO", concluida: true, status: "CADASTRADO" },
    ];
    expect(kitLiberado(frentes)).toBe(true);
  });

  it("o KIT continua barrado enquanto o CADASTRO não concluiu", () => {
    expect(
      kitLiberado([
        auditoriaOk,
        { tipo: "EXAME", concluida: false, status: "LIBERADO_SEM_ASO" },
        { tipo: "CADASTRO_CONTRATO", concluida: false, status: "A_CADASTRAR" },
      ]),
    ).toBe(false);
  });
});
