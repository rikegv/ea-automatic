import { describe, expect, it } from "vitest";
import type { VagaStatusPapel } from "@ea/shared-types";
import {
  deriveStatusDaVaga,
  movimentoPodeMudarAEntrega,
  narrativaDaDerivacao,
  papelDeVagaEmProcesso,
} from "./vaga-status-derivado";

/**
 * ─ A REGRA DO DIRETOR, AFIRMADA SOBRE A FUNÇÃO PURA (Frente B da Central de Vagas) ──────────────
 *
 * O CONCEITO: a VAGA tem quatro estados (Aberta, Entregue, Fechada, Cancelada); todo o resto é
 * movimentação do CANDIDATO. O estado da vaga DERIVA de onde os candidatos estão, SEM EXIGIR ORDEM,
 * e o time TAMBÉM move a vaga à mão, com o manual GRUDANDO.
 *
 * A FUNÇÃO É PURA, então tudo aqui é decisão, não infraestrutura: quem lê o funil, trava a linha e
 * grava é o `derivarStatusDaVaga`, e os testes DELE vivem em `as/vagas/`.
 */

const ABERTA = "ABERTA";
const ENTREGUE = "ENTREGUE";

const base = {
  atual: ABERTA,
  papelAtual: "ABERTURA" as VagaStatusPapel,
  manual: false,
  temCandidatoComCliente: false,
  codigoAbertura: ABERTA,
  codigoEntrega: ENTREGUE,
};

describe("a derivação alterna ABERTA e ENTREGUE pelo funil", () => {
  it("alguém com o cliente: a vaga ABERTA vira ENTREGUE", () => {
    expect(deriveStatusDaVaga({ ...base, temCandidatoComCliente: true })).toBe(ENTREGUE);
  });

  it("ninguém mais com o cliente: a vaga ENTREGUE volta a ser ABERTA", () => {
    expect(
      deriveStatusDaVaga({ ...base, atual: ENTREGUE, papelAtual: "ENTREGA" }),
    ).toBe(ABERTA);
  });

  /**
   * `null` É "NÃO MEXE", e o caso mais frequente dele é este: gravar o status que já está lá
   * encheria a trilha de linhas que não contam nada, exatamente como o `moverStatus` recusa fazer.
   */
  it("o status já é o derivado: devolve `null` em vez de regravar", () => {
    expect(deriveStatusDaVaga(base)).toBeNull();
    expect(
      deriveStatusDaVaga({
        ...base,
        atual: ENTREGUE,
        papelAtual: "ENTREGA",
        temCandidatoComCliente: true,
      }),
    ).toBeNull();
  });

  /**
   * ─ SEM EXIGIR ORDEM, e é requisito explícito do diretor ──────────────────────────────────────
   *
   * A pergunta é de PRESENÇA ("existe alguém com o cliente?"), nunca de PROGRESSÃO ("a etapa
   * anterior foi cumprida?"). O funil é LIVRE desde 27/08, então o candidato que pula da Captação
   * direto para a Entrevista Cliente entrega a vaga do mesmo jeito, e a função não tem como saber
   * (nem precisa) por onde ele passou: ela não recebe caminho nenhum, só o SIM ou NÃO.
   */
  it("não recebe ordem nem caminho: a entrada é presença, e só", () => {
    const comPulo = deriveStatusDaVaga({ ...base, temCandidatoComCliente: true });
    const semPulo = deriveStatusDaVaga({ ...base, temCandidatoComCliente: true });
    expect(comPulo).toBe(semPulo);
    expect(Object.keys(base)).not.toContain("etapaAnterior");
  });
});

describe("o movimento MANUAL gruda: a derivação não o desfaz", () => {
  /**
   * É O CONTRATO DO §A.3 APLICADO AQUI: o automático deriva, o manual é pegajoso. O time move a
   * vaga à mão porque sabe de algo que o funil não conta (o cliente pediu para segurar), e uma
   * derivação que desfizesse isso na primeira movimentação de candidato viraria ruído.
   */
  it("com o carimbo manual, NENHUMA combinação do funil move a vaga", () => {
    for (const temCandidatoComCliente of [true, false]) {
      for (const [atual, papelAtual] of [
        [ABERTA, "ABERTURA"],
        [ENTREGUE, "ENTREGA"],
      ] as [string, VagaStatusPapel][]) {
        expect(
          deriveStatusDaVaga({ ...base, manual: true, atual, papelAtual, temCandidatoComCliente }),
          `manual em ${atual} com cliente=${temCandidatoComCliente}`,
        ).toBeNull();
      }
    }
  });

  /**
   * O PEGAJOSO É O CARIMBO, E NÃO O VALOR, e este teste é o que impede a "simplificação" de volta
   * para uma lista de estados manuais (como o `FAROL_MANUAL` da admissão): `ABERTA` e `ENTREGUE`
   * são alcançáveis pelos DOIS caminhos, então o mesmo `atual` responde COISAS DIFERENTES conforme
   * o carimbo. Uma lista de estados não teria como distinguir os dois.
   */
  it("o MESMO estado responde diferente conforme o carimbo, que é o ponto", () => {
    const cenario = { ...base, temCandidatoComCliente: true };
    expect(deriveStatusDaVaga({ ...cenario, manual: false })).toBe(ENTREGUE);
    expect(deriveStatusDaVaga({ ...cenario, manual: true })).toBeNull();
  });
});

describe("a derivação NÃO alcança desfecho, pré-publicação nem status do diretor", () => {
  /**
   * CADA AUSÊNCIA É UMA DECISÃO, e o dano de cada uma é próprio: derivar do RASCUNHO PUBLICARIA a
   * vaga sem os obrigatórios; da REVISAO publicaria sem o cliente que a varredura não trouxe; de
   * FECHAMENTO/CANCELAMENTO RESSUSCITARIA um desfecho por movimento de candidato; e do LIVRE
   * apagaria uma escolha do time que ninguém pediu para desfazer.
   */
  it.each(["RASCUNHO", "REVISAO", "FECHAMENTO", "CANCELAMENTO", "LIVRE"] as VagaStatusPapel[])(
    "papel %s: devolve `null` mesmo com gente com o cliente",
    (papelAtual) => {
      expect(
        deriveStatusDaVaga({
          ...base,
          atual: "QUALQUER",
          papelAtual,
          temCandidatoComCliente: true,
        }),
      ).toBeNull();
    },
  );

  it("os dois papéis EM PROCESSO são ABERTURA e ENTREGA, e mais nenhum", () => {
    const todos: VagaStatusPapel[] = [
      "LIVRE",
      "RASCUNHO",
      "ABERTURA",
      "ENTREGA",
      "FECHAMENTO",
      "CANCELAMENTO",
      "REVISAO",
    ];
    expect(todos.filter(papelDeVagaEmProcesso)).toEqual(["ABERTURA", "ENTREGA"]);
  });
});

describe("o atalho: só deriva quem TOCA uma etapa de entrega", () => {
  const entrega = new Set(["ENTREVISTA_CLIENTE"]);

  it("movimento entre etapas fora da entrega não muda a resposta, então não deriva", () => {
    expect(movimentoPodeMudarAEntrega(["CAPTACAO", "TRIAGEM"], entrega)).toBe(false);
  });

  it("ENTRAR na entrega deriva", () => {
    expect(movimentoPodeMudarAEntrega(["TRIAGEM", "ENTREVISTA_CLIENTE"], entrega)).toBe(true);
  });

  it("SAIR da entrega deriva: é o caso de a vaga voltar para ABERTA", () => {
    expect(movimentoPodeMudarAEntrega(["ENTREVISTA_CLIENTE", "APROVACAO"], entrega)).toBe(true);
  });

  /**
   * CATÁLOGO SEM ETAPA DE ENTREGA É FAIL-CLOSED NA DIREÇÃO CERTA: nada deriva, e a vaga fica
   * ABERTA, que é o estado que não afirma entrega nenhuma. O erro cai para o lado de não declarar
   * entregue o que não foi.
   */
  it("sem etapa de entrega no catálogo, nada deriva", () => {
    expect(movimentoPodeMudarAEntrega(["ENTREVISTA_CLIENTE"], new Set())).toBe(false);
  });

  it("etapa ausente (nula) não quebra e não deriva sozinha", () => {
    expect(movimentoPodeMudarAEntrega([null, undefined], entrega)).toBe(false);
  });
});

describe("a narrativa da trilha", () => {
  /**
   * ELA PRECISA DIZER QUE FOI AUTOMÁTICA: o `por_id` do evento guarda quem MOVEU O CANDIDATO, e sem
   * a frase a linha do tempo afirmaria que aquela pessoa moveu a VAGA, que é gesto diferente.
   */
  it("diz que o status foi DERIVADO, nos dois sentidos", () => {
    expect(narrativaDaDerivacao(true)).toContain("derivado");
    expect(narrativaDaDerivacao(false)).toContain("derivado");
    expect(narrativaDaDerivacao(true)).not.toBe(narrativaDaDerivacao(false));
  });

  // §A.11: travessão PROIBIDO em todo texto apresentável. §A.6: vocabulário de processo, sem PII.
  it("não tem travessão e não fala de pessoa", () => {
    for (const frase of [narrativaDaDerivacao(true), narrativaDaDerivacao(false)]) {
      expect(frase).not.toContain("—");
      expect(frase.toLowerCase()).not.toContain("cpf");
    }
  });
});
