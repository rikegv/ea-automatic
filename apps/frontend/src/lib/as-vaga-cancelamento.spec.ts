import { describe, expect, it } from "vitest";
import type { AsVagaCancelamentoBloqueado } from "@ea/shared-types";
import { ApiError } from "./api";
import {
  avisoDeProcessosEncerrados,
  cancelamentoBloqueadoPorCandidatos,
  fraseDoCancelamentoForcado,
  type AsVagaCancelamentoPrevia,
} from "./as-vaga-cancelamento";

/**
 * O QUE ESTE TESTE PROTEGE.
 *
 * 1. O RECONHECIMENTO DA RECUSA. Sem ele, o 409 estruturado do cancelamento cai no tratamento
 *    genérico e o consultor lê uma frase solta no lugar da LISTA de quem ainda está em processo,
 *    que é justamente o que o corpo estruturado existe para entregar. A falha é silenciosa: nada
 *    quebra, a tela só volta a ser pior.
 * 2. O AVISO DO FORÇAMENTO. Ele descreve um efeito IRREVERSÍVEL pela tela (encerrar as candidaturas
 *    vivas), e uma frase que deixe de dizer isso transforma um botão perigoso em um botão qualquer.
 */

const RECUSA: AsVagaCancelamentoBloqueado = {
  needsConfirmation: true,
  reason: "candidatosNaoEncerrados",
  message: "Esta vaga tem 2 candidatos com processo em aberto.",
  naoEncerrados: [
    {
      candidaturaId: "c1",
      candidatoId: "p1",
      candidatoNome: "Fulano De Tal",
      etapa: "CAPTACAO",
      situacao: "ATIVO",
    },
    {
      candidaturaId: "c2",
      candidatoId: "p2",
      candidatoNome: "Sicrano De Tal",
      etapa: "ENTREVISTA",
      situacao: "ALOCADO",
    },
  ],
  podeForcar: true,
};

describe("cancelamentoBloqueadoPorCandidatos (casa por `reason`, nunca por texto)", () => {
  it("reconhece o 409 estruturado e devolve a lista que a tela desenha", () => {
    const lido = cancelamentoBloqueadoPorCandidatos(new ApiError("Conflict", 409, RECUSA));
    expect(lido?.naoEncerrados).toHaveLength(2);
    expect(lido?.podeForcar).toBe(true);
  });

  it("reconhece a recusa que NÃO pode forçar, sem confundir com ausência de recusa", () => {
    const semForcar = { ...RECUSA, podeForcar: false };
    expect(cancelamentoBloqueadoPorCandidatos(new ApiError("Conflict", 409, semForcar))?.podeForcar).toBe(
      false,
    );
  });

  it("ignora outro status, outro `reason` e erro que não é da API", () => {
    expect(cancelamentoBloqueadoPorCandidatos(new ApiError("Conflict", 400, RECUSA))).toBeNull();
    expect(
      cancelamentoBloqueadoPorCandidatos(
        new ApiError("Conflict", 409, { ...RECUSA, reason: "candidatosPendentes" }),
      ),
    ).toBeNull();
    expect(cancelamentoBloqueadoPorCandidatos(new Error("caiu a rede"))).toBeNull();
  });

  /**
   * A OUTRA RECUSA DA MESMA ROTA (a vaga que já saiu de ABERTA) NÃO PODE SER CONFUNDIDA COM ESTA:
   * ela não tem lista nem `podeForcar`, e tratá-la como bloqueio abriria um modal vazio oferecendo
   * "cancelar assim mesmo" uma vaga que já está encerrada.
   */
  it("não confunde o 409 da vaga já encerrada com o bloqueio por candidatos", () => {
    const jaEncerrada = new ApiError("Conflict", 409, {
      message: "Esta vaga já foi encerrada. Recarregue a página.",
    });
    expect(cancelamentoBloqueadoPorCandidatos(jaEncerrada)).toBeNull();
  });

  /** Corpo pela metade é recusado: com o discriminador aceito e a lista ausente, a tela abriria a
      caixa dizendo que há gente em processo sem conseguir dizer quem. */
  it("recusa corpo pela metade, mesmo com o `reason` certo", () => {
    const semLista = { needsConfirmation: true, reason: "candidatosNaoEncerrados", message: "x", podeForcar: true };
    const semPodeForcar = { ...RECUSA, podeForcar: undefined };
    expect(cancelamentoBloqueadoPorCandidatos(new ApiError("Conflict", 409, semLista))).toBeNull();
    expect(cancelamentoBloqueadoPorCandidatos(new ApiError("Conflict", 409, semPodeForcar))).toBeNull();
  });
});

describe("fraseDoCancelamentoForcado (o efeito, dito antes do clique)", () => {
  it("diz que ENCERRA quem está em processo, e concorda no singular e no plural", () => {
    expect(fraseDoCancelamentoForcado(1)).toContain("a 1 pessoa que ainda está em processo");
    expect(fraseDoCancelamentoForcado(3)).toContain("as 3 pessoas que ainda estão em processo");
    expect(fraseDoCancelamentoForcado(2)).toContain("descartada");
  });

  it("não usa travessão (§A.11)", () => {
    expect(fraseDoCancelamentoForcado(2)).not.toContain("—");
  });
});

/**
 * ─ O AVISO DE PROCESSOS JÁ ENCERRADOS (peça 1 da onda B3) ──────────────────────────────────────
 *
 * O QUE ESTE BLOCO PROTEGE: a frase que descreve uma APROVAÇÃO como se fosse uma perda. O caso não
 * é teórico, foi medido na homologação com dado real: a vaga ABERTA da 3120 tem como único
 * "encerrado" um ENVIADO_PARA_ADMISSAO, que é o melhor desfecho que um processo pode ter. Uma
 * frase genérica ali ("1 candidato com processo já encerrado") faria o consultor decidir o
 * cancelamento lendo o contrário do que aconteceu, e nada falharia.
 */
function previa(porSituacao: AsVagaCancelamentoPrevia["porSituacao"]): AsVagaCancelamentoPrevia {
  return {
    vagaId: "v1",
    encerrados: porSituacao.reduce((a, l) => a + l.quantos, 0),
    porSituacao,
  };
}

describe("avisoDeProcessosEncerrados", () => {
  it("não mostra bloco nenhum quando não há processo encerrado", () => {
    expect(avisoDeProcessosEncerrados(previa([]))).toBeNull();
    expect(avisoDeProcessosEncerrados(null)).toBeNull();
  });

  it("não mostra bloco quando a quebra vem com contagem zerada", () => {
    expect(avisoDeProcessosEncerrados(previa([{ situacao: "DESCARTADO", quantos: 0 }]))).toBeNull();
  });

  // O CASO MEDIDO NA 3120, e o motivo de esta função existir.
  it("NÃO chama de encerrado sem êxito quem foi enviado para a admissão", () => {
    const aviso = avisoDeProcessosEncerrados(
      previa([{ situacao: "ENVIADO_PARA_ADMISSAO", quantos: 1 }]),
    );
    expect(aviso?.frase).toBe("Esta vaga tem 1 processo que já terminou, com a pessoa aprovada.");
    expect(aviso?.frase).not.toContain("sem contratação");
  });

  it("fala de aprovação no plural quando são vários com êxito", () => {
    const aviso = avisoDeProcessosEncerrados(
      previa([
        { situacao: "APROVADO", quantos: 2 },
        { situacao: "ENVIADO_PARA_ADMISSAO", quantos: 1 },
      ]),
    );
    expect(aviso?.frase).toBe("Esta vaga tem 3 processos que já terminaram, com as pessoas aprovadas.");
  });

  it("fala de saída sem contratação quando só há descarte e desistência", () => {
    const um = avisoDeProcessosEncerrados(previa([{ situacao: "DESCARTADO", quantos: 1 }]));
    expect(um?.frase).toBe("Esta vaga tem 1 processo que já terminou sem contratação.");
    const varios = avisoDeProcessosEncerrados(
      previa([
        { situacao: "DESCARTADO", quantos: 2 },
        { situacao: "DESISTIU", quantos: 1 },
      ]),
    );
    expect(varios?.frase).toBe("Esta vaga tem 3 processos que já terminaram sem contratação.");
  });

  it("separa as duas naturezas quando as duas existem, em vez de somar tudo numa palavra só", () => {
    const aviso = avisoDeProcessosEncerrados(
      previa([
        { situacao: "APROVADO", quantos: 1 },
        { situacao: "DESCARTADO", quantos: 2 },
      ]),
    );
    expect(aviso?.frase).toBe(
      "Esta vaga tem 3 processos que já terminaram: 1 com a pessoa aprovada e 2 sem contratação.",
    );
  });

  /* QUEM AINDA ESTÁ EM PROCESSO NÃO ENTRA NESTA CONTA, e a régua é a MESMA do backend
     (`candidaturaEncerradaParaCancelamento`). Contá-lo faria o aviso dizer que um processo vivo já
     acabou, bem em cima do botão que vai encerrá-lo. */
  it("ignora situação que NÃO encerra para o cancelamento", () => {
    const aviso = avisoDeProcessosEncerrados(
      previa([
        { situacao: "ATIVO", quantos: 5 },
        { situacao: "ALOCADO", quantos: 3 },
        { situacao: "DESCARTADO", quantos: 1 },
      ]),
    );
    expect(aviso?.frase).toBe("Esta vaga tem 1 processo que já terminou sem contratação.");
    expect(aviso?.linhas).toEqual([{ situacao: "DESCARTADO", quantos: 1 }]);
  });

  it("diz que o cancelamento não desfaz nenhum deles", () => {
    const aviso = avisoDeProcessosEncerrados(previa([{ situacao: "DESISTIU", quantos: 1 }]));
    expect(aviso?.nota).toContain("não muda nenhum deles");
  });

  // §A.11: travessão é proibido em qualquer texto que chegue ao usuário.
  it("nenhuma frase carrega travessão", () => {
    const aviso = avisoDeProcessosEncerrados(
      previa([
        { situacao: "APROVADO", quantos: 1 },
        { situacao: "DESISTIU", quantos: 1 },
      ]),
    );
    expect(aviso?.frase).not.toContain("—");
    expect(aviso?.nota).not.toContain("—");
  });
});
