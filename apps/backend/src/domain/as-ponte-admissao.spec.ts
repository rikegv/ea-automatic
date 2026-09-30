import { describe, expect, it } from "vitest";
import { CANDIDATURA_SITUACOES, consomePosicao, type CandidaturaSituacao } from "@ea/shared-types";
import {
  desfechoDaIngestaoExterna,
  SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO,
} from "./as-ponte-admissao";

/**
 * ─ A RÉGUA DA PONTE, MEDIDA SEM BANCO E SEM NEST ───────────────────────────────────────────────
 *
 * O que se prova aqui é a decisão, e não o efeito: dada a situação que a linha de de/para resolveu,
 * nasce pré-admissão ou não. O efeito (a admissão criada, o `admissao_id` gravado) é medido no
 * adaptador e no ciclo, cada um no seu arquivo.
 */
describe("a régua da ponte A&S para a admissão", () => {
  it("SÓ `ENVIADO_PARA_ADMISSAO` pede a ponte", () => {
    const pedem = CANDIDATURA_SITUACOES.filter(
      (s) => desfechoDaIngestaoExterna(s).pedePonteParaAdmissao,
    );
    expect(pedem).toEqual(["ENVIADO_PARA_ADMISSAO"]);
  });

  /*
   * A ARMADILHA É EXATAMENTE ESTA, e é por isso que ela tem teste próprio: `APROVADO` e `ALOCADO`
   * também CONSOMEM POSIÇÃO da vaga, então é fácil confundir "ocupou posição" com "vai ser
   * admitido". Aprovar é decisão de seleção, alocar é entrega de posição, e nenhuma das duas diz que
   * a pessoa vai para a esteira. Uma lista mais larga abriria admissão para quem o time ainda está
   * conversando, e admissão criada é muito mais caro de desfazer do que etapa trocada.
   */
  it.each(["APROVADO", "ALOCADO"] as CandidaturaSituacao[])(
    "%s consome posição da vaga e NÃO pede a ponte",
    (situacao) => {
      expect(consomePosicao(situacao)).toBe(true);
      expect(desfechoDaIngestaoExterna(situacao).pedePonteParaAdmissao).toBe(false);
    },
  );

  it.each(["ATIVO", "DESCARTADO", "DESISTIU"] as CandidaturaSituacao[])(
    "%s não pede a ponte",
    (situacao) => {
      expect(desfechoDaIngestaoExterna(situacao).pedePonteParaAdmissao).toBe(false);
    },
  );

  /*
   * SITUAÇÃO AUSENTE É O ESTADO NORMAL de toda pasta que não é desfecho (o de/para pode resolver só
   * a etapa), e o fail-closed importa: pasta sem desfecho traduzido não pode virar admissão por
   * omissão. A régua da ingestão do Digai errou nesta direção uma vez, com um `??` que deixava o
   * DADO da linha decidir o que só o código pode decidir.
   */
  it.each([null, undefined])("situação ausente (%s) não pede a ponte, e não inventa desfecho", (v) => {
    const r = desfechoDaIngestaoExterna(v);
    expect(r.pedePonteParaAdmissao).toBe(false);
    expect(r.situacao).toBeNull();
  });

  it("a situação atravessa INTACTA: a régua acrescenta a segunda resposta, não muda a primeira", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(desfechoDaIngestaoExterna(s).situacao).toBe(s);
    }
  });

  it("a lista é fechada e só tem situações do vocabulário", () => {
    for (const s of SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO) {
      expect(CANDIDATURA_SITUACOES).toContain(s);
    }
  });
});
