import { describe, expect, it } from "vitest";
import type { AsOcupacaoVaga } from "@ea/shared-types";
import {
  avisoDeProcessosEncerrados,
  avisoDoDestinoDoCancelamento,
  quantosVaoParaODestino,
  type AsVagaCancelamentoPrevia,
} from "./as-vaga-cancelamento";

/**
 * ─ O QUE ESTE TESTE PROTEGE, E O QUE ELE DEIXOU DE PROTEGER (Frente B) ─────────────────────────
 *
 * ┌─ DOIS BLOCOS FORAM REMOVIDOS, E O MOTIVO NÃO É "ELES FALHAVAM" ────────────────────────────┐
 * │ Eles cobriam `cancelamentoBloqueadoPorCandidatos` (o parser do 409                          │
 * │ `candidatosNaoEncerrados`) e `fraseDoCancelamentoForcado` (o aviso do forçamento). Os dois   │
 * │ PASSAVAM. O que mudou foi o REQUISITO: o backend revogou a trava de candidatos, aquele 409   │
 * │ deixou de ser lançado e o forçamento deixou de existir, então as duas funções saíram do      │
 * │ código e os testes delas descreviam um comportamento que o sistema não tem mais.             │
 * │                                                                                              │
 * │ TESTE DE COMPORTAMENTO EXTINTO NÃO É REDE DE PROTEÇÃO, É ÂNCORA: ele cimenta como requisito  │
 * │ a régua antiga, e é ele que quebra no dia em que a régua certa chega. O caso está escrito no │
 * │ `as-vaga-acoes` ("o teste protegia o bug, não a régua").                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ENTROU NO LUGAR: a conta de quem vai para o Stand By e a frase que a diz. As duas erram em
 * silêncio, que é a razão de elas serem função com teste em vez de expressão dentro do modal. Um
 * número inflado numa frase que explica efeito é pior do que a frase não existir.
 */

const OCUPACAO_BASE: AsOcupacaoVaga = {
  vagaId: "v1",
  posicoesOficiais: 3,
  ocupadas: 0,
  finalizadas: 0,
  finalizadasOficial: 0,
  finalizadasBanco: 0,
  livres: 3,
  emSelecao: 0,
  fora: 0,
  excedida: false,
  porEtapa: {},
  porDesfecho: {},
};

describe("quantosVaoParaODestino (a régua é `candidaturaViva`, a mesma do backend)", () => {
  it("soma quem está EM SELEÇÃO com os desfechos que continuam VIVOS", () => {
    const quantos = quantosVaoParaODestino({
      ...OCUPACAO_BASE,
      emSelecao: 4,
      porDesfecho: { APROVADO: 1, ALOCADO: 2, ENVIADO_PARA_ADMISSAO: 1 },
    });
    expect(quantos).toBe(8);
  });

  /**
   * QUEM SAIU SEM ÊXITO NÃO ENTRA, e este é o erro que a frase cometeria se a régua fosse "todo
   * mundo da vaga": o descartado de março apareceria na conta de quem "ainda está em processo", e o
   * consultor leria que vai mover gente que saiu faz meses. O backend também não os move.
   */
  it("ignora quem saiu SEM ÊXITO, que é quem o backend também não move", () => {
    const quantos = quantosVaoParaODestino({
      ...OCUPACAO_BASE,
      emSelecao: 2,
      porDesfecho: { DESCARTADO: 5, DESISTIU: 3, ALOCADO: 1 },
    });
    expect(quantos).toBe(3);
  });

  /**
   * A GUARDA CONTRA A CONTAGEM DUPLA. Pelo contrato, `ATIVO` nunca aparece em `porDesfecho` (ele já
   * está em `emSelecao`). Se um dia aparecer, somar os dois mapas contaria a mesma pessoa duas
   * vezes, e a tela afirmaria um número inflado sem nada falhar.
   */
  it("não conta o ATIVO duas vezes, mesmo se ele vier nos dois mapas", () => {
    const quantos = quantosVaoParaODestino({
      ...OCUPACAO_BASE,
      emSelecao: 2,
      porDesfecho: { ATIVO: 2, APROVADO: 1 },
    });
    expect(quantos).toBe(3);
  });

  it("ninguém na vaga é ZERO, e ocupação ausente é NULO, que são respostas diferentes", () => {
    expect(quantosVaoParaODestino(OCUPACAO_BASE)).toBe(0);
    expect(quantosVaoParaODestino(null)).toBeNull();
    expect(quantosVaoParaODestino(undefined)).toBeNull();
  });
});

describe("avisoDoDestinoDoCancelamento (informa o efeito, e nunca o forçamento)", () => {
  it("diz o destino e a quantidade, concordando no singular e no plural", () => {
    expect(avisoDoDestinoDoCancelamento(1).frase).toContain("1 pessoa ainda está em processo");
    expect(avisoDoDestinoDoCancelamento(1).frase).toContain("viva, e continua encontrável");
    expect(avisoDoDestinoDoCancelamento(3).frase).toContain("3 pessoas ainda estão em processo");
    expect(avisoDoDestinoDoCancelamento(3).frase).toContain("vivas, e continuam encontráveis");
  });

  it("nomeia a etapa de destino, que é a palavra que o histórico também usa", () => {
    for (const q of [null, 1, 4]) {
      expect(avisoDoDestinoDoCancelamento(q).frase).toContain("Stand By");
    }
  });

  /**
   * A GARANTIA É A METADE QUE IMPORTA. Quem lê que um monte de gente vai ser movida pergunta logo
   * em seguida se aquilo é um descarte, e era EXATAMENTE isso que o cancelamento fazia até a Frente
   * B. A nota responde antes de a pergunta existir.
   */
  it("a nota promete que NINGUÉM é descartado e que a situação não muda", () => {
    const { nota } = avisoDoDestinoDoCancelamento(2);
    expect(nota).toContain("Ninguém é descartado");
    expect(nota).toContain("continua entregue");
  });

  it("vaga sem ninguém diz isso, e ocupação desconhecida não afirma quantidade", () => {
    expect(avisoDoDestinoDoCancelamento(0).frase).toContain("não move nenhuma pessoa");
    expect(avisoDoDestinoDoCancelamento(null).frase).not.toMatch(/\d/);
  });

  it("nenhuma frase usa travessão (§A.11)", () => {
    for (const q of [null, 0, 1, 5]) {
      const { frase, nota } = avisoDoDestinoDoCancelamento(q);
      expect(frase).not.toContain("\u2014");
      expect(nota).not.toContain("\u2014");
    }
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
