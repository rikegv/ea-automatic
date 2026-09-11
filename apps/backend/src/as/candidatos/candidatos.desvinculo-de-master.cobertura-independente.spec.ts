import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CANDIDATURA_SITUACOES, candidaturaViva, finalizaPosicao } from "@ea/shared-types";
import {
  SITUACOES_CUJO_DESVINCULO_E_DE_MASTER,
  desvinculoEhDeMaster,
} from "../../domain/candidatura";
import { bancoFingido, linhaFingida, usuarioFingido } from "./fronteira-encerrada.tester-fake";

/**
 * ─ DESCARTAR QUEM JÁ ENTREGOU É DE MASTER, E REVERTER O ENVIO CONTINUA DE QUALQUER UM ─────────
 *
 * COBERTURA INDEPENDENTE (§A.38). O AUTOR DO CONSERTO FOI O COORDENADOR, então aqui o testador é
 * o outro lado de verdade: quem escreveu a régua não é quem confere se ela fecha.
 *
 * ┌─ O CONSERTO, E A MEDIÇÃO QUE O JUSTIFICOU ──────────────────────────────────────────────────┐
 * │ `desvinculoEhDeMaster` deixou de ser o literal `"ALOCADO"` e passou a DERIVAR de              │
 * │ `finalizaPosicao`, alcançando também `ENVIADO_PARA_ADMISSAO`.                                 │
 * │                                                                                              │
 * │ O QUE ESTAVA ERRADO NÃO ERA A FALTA DE SIMETRIA, era o LADO em que a folga estava: descartar  │
 * │ um enviado DESFAZ uma entrega e é IRREVERSÍVEL, porque depois do descarte o                   │
 * │ `reverterEnvioParaAdmissao` responde "não há envio a reverter" para TODO MUNDO, Master        │
 * │ inclusive. A ação MAIOR e sem volta era a única sem trava; a MENOR e reversível já pedia      │
 * │ Master.                                                                                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE, ANTES DE TUDO, PARA IMPEDIR ───────────────────────────────────┐
 * │ QUE A DECISÃO DO DIRETOR SOBRE O ERRO DE CLIQUE SEJA APAGADA POR UMA DERIVAÇÃO.              │
 * │                                                                                             │
 * │ REVERTER O ENVIO É DE QUALQUER CONSULTOR, porque mandar a pessoa errada para a esteira é     │
 * │ erro de clique, e erro de clique se desfaz no minuto seguinte. Hoje isso é verdade por       │
 * │ ESTRUTURA (`reverterEnvioParaAdmissao` é método próprio, com `update` próprio, que NÃO       │
 * │ consulta esta régua), e estrutura não é promessa: basta alguém "unificar os dois caminhos     │
 * │ que fazem quase a mesma coisa" para a decisão virar um 403 para o consultor.                 │
 * │                                                                                             │
 * │ E O TESTE DISSO É PARTICULARMENTE FÁCIL DE ESCREVER ERRADO: a situação de partida das duas   │
 * │ operações é a MESMA (`ENVIADO_PARA_ADMISSAO`). O que muda é o VERBO. Um teste que só         │
 * │ afirmasse "o COMUM não mexe em quem foi enviado" ficaria verde e estaria dizendo o contrário │
 * │ do que o diretor decidiu.                                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids internos, situações do vocabulário e papéis de sessão. Nada de candidato.
 */

const MOTIVO = "Perfil não aderente ao cliente";
const DESCARTE = "DESCARTADO" as const;
const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;

/** As situações VIVAS que NÃO entregaram posição: o desvínculo delas continua de qualquer um. */
const VIVAS_SEM_ENTREGA = CANDIDATURA_SITUACOES.filter(
  (s) => candidaturaViva(s) && !finalizaPosicao(s),
);

const PAPEIS_DE_MASTER = ["MASTER", "SUPER_ADMIN"] as const;

async function recusaDe(chamada: () => Promise<unknown>): Promise<Error | null> {
  try {
    await chamada();
    return null;
  } catch (err) {
    return err as Error;
  }
}

function comCandidatura(situacao: string, posicaoLado: string | null = null) {
  return bancoFingido({
    candidaturas: [linhaFingida({ id: "cand-1", situacao, posicaoLado })],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A RÉGUA É DERIVADA, e não uma segunda lista
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a régua de quem exige Master é DERIVADA de quem entrega posição", () => {
  /**
   * A LISTA NÃO É DIGITADA EM LUGAR NENHUM, e é isso que faz uma situação nova que ENTREGUE posição
   * cair nesta trava no mesmo dia. O teste compara a constante exportada com a derivação feita aqui
   * a partir do vocabulário: se alguém voltar a escrever a lista à mão, as duas divergem na primeira
   * situação nova e este teste avisa antes de a porta nascer aberta.
   */
  it("a constante exportada é exatamente o filtro por finalizaPosicao", () => {
    expect([...SITUACOES_CUJO_DESVINCULO_E_DE_MASTER]).toEqual(
      CANDIDATURA_SITUACOES.filter(finalizaPosicao),
    );
  });

  it("hoje ela é ALOCADO e ENVIADO PARA ADMISSÃO, e não só o ALOCADO", () => {
    expect([...SITUACOES_CUJO_DESVINCULO_E_DE_MASTER]).toEqual([
      "ALOCADO",
      "ENVIADO_PARA_ADMISSAO",
    ]);
  });

  /**
   * O APROVADO FICA DE FORA, e a distinção é a que sustenta o conserto: ele RESERVA posição e não a
   * ENTREGOU. Se alguém trocar `finalizaPosicao` por `consomePosicao` "para pegar tudo que ocupa", o
   * COMUM perde um gesto que sempre foi dele, e a suíte de autoridade não notaria a diferença sem
   * este caso.
   */
  it("o APROVADO não entra: ele reserva posição, não entregou", () => {
    expect(desvinculoEhDeMaster("APROVADO")).toBe(false);
    expect(desvinculoEhDeMaster("ATIVO")).toBe(false);
  });

  /** Quem já saiu não tem entrega a desfazer: a recusa dele vem de outra guarda, não desta. */
  it("as situações encerradas não são assunto desta régua", () => {
    expect(desvinculoEhDeMaster("DESCARTADO")).toBe(false);
    expect(desvinculoEhDeMaster("DESISTIU")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O CONSERTO: o COMUM não descarta quem já foi ENVIADO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("descartar quem já entregou", () => {
  for (const entregue of SITUACOES_CUJO_DESVINCULO_E_DE_MASTER) {
    it(`recusa o COMUM descartando quem está ${entregue}`, async () => {
      const b = comCandidatura(entregue, "OFICIAL");

      const erro = await recusaDe(() =>
        b.service.registrarSaida(
          "cand-1",
          { situacao: DESCARTE, motivo: MOTIVO } as never,
          usuarioFingido("COMUM") as never,
        ),
      );

      expect(erro).toBeInstanceOf(ForbiddenException);
      expect(b.situacaoDe("cand-1")).toBe(entregue);
    });

    /** A recusa é ANTES da escrita: nada gravado, nem na linha nem no histórico. */
    it(`a recusa de ${entregue} não escreve nada antes de negar`, async () => {
      const b = comCandidatura(entregue, "OFICIAL");

      await recusaDe(() =>
        b.service.registrarSaida(
          "cand-1",
          { situacao: DESCARTE, motivo: MOTIVO } as never,
          usuarioFingido("COMUM") as never,
        ),
      );

      expect(b.updates).toHaveLength(0);
      expect(b.inserts).toHaveLength(0);
    });

    for (const papel of PAPEIS_DE_MASTER) {
      /** O SUPER_ADMIN é o que mais se esquece: quem escreve a trava pensa em MASTER e para ali. */
      it(`ACEITA o ${papel} descartando quem está ${entregue}`, async () => {
        const b = comCandidatura(entregue, "OFICIAL");

        await b.service.registrarSaida(
          "cand-1",
          { situacao: DESCARTE, motivo: MOTIVO } as never,
          usuarioFingido(papel) as never,
        );

        expect(b.situacaoDe("cand-1")).toBe(DESCARTE);
      });
    }
  }

  /**
   * ─ OS DOIS CASOS ESCRITOS À MÃO, E A MEDIÇÃO QUE MOSTROU QUE ELES FALTAVAM ───────────────────
   *
   * O laço acima DERIVA os casos de `SITUACOES_CUJO_DESVINCULO_E_DE_MASTER`, e derivar é certo: é o
   * que faz uma situação nova que entregue posição cair na cobertura sozinha.
   *
   * MAS A DERIVAÇÃO TEM UM MODO DE FALHA QUE EU SÓ VI MEDINDO. Rodei a suíte contra a régua ANTIGA
   * (o literal `"ALOCADO"`), e o caso do `ENVIADO_PARA_ADMISSAO` NÃO FICOU VERMELHO: ele
   * simplesmente DEIXOU DE EXISTIR, porque a lista que gera os casos é a mesma lista sob teste. Um
   * teste derivado de X não consegue reprovar o encolhimento de X: ele encolhe junto, em silêncio.
   *
   * ESTES DOIS CASOS SÃO ESCRITOS À MÃO DE PROPÓSITO, e é a única redundância deliberada do arquivo.
   * Encolher a régua passa a deixar vermelho aqui, com o nome do caso que sumiu.
   */
  it("ESCRITO À MÃO: o COMUM não descarta quem está ENVIADO PARA ADMISSÃO", async () => {
    const b = comCandidatura("ENVIADO_PARA_ADMISSAO", "BANCO");

    const erro = await recusaDe(() =>
      b.service.registrarSaida(
        "cand-1",
        { situacao: DESCARTE, motivo: MOTIVO } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(b.situacaoDe("cand-1")).toBe("ENVIADO_PARA_ADMISSAO");
  });

  it("ESCRITO À MÃO: o COMUM não descarta quem está ALOCADO", async () => {
    const b = comCandidatura("ALOCADO", "OFICIAL");

    const erro = await recusaDe(() =>
      b.service.registrarSaida(
        "cand-1",
        { situacao: DESCARTE, motivo: MOTIVO } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(b.situacaoDe("cand-1")).toBe("ALOCADO");
  });

  it("ESCRITO À MÃO: o MASTER descarta quem está ENVIADO PARA ADMISSÃO", async () => {
    const b = comCandidatura("ENVIADO_PARA_ADMISSAO", "BANCO");

    await b.service.registrarSaida(
      "cand-1",
      { situacao: DESCARTE, motivo: MOTIVO } as never,
      usuarioFingido("MASTER") as never,
    );

    expect(b.situacaoDe("cand-1")).toBe(DESCARTE);
  });

  /**
   * ─ A FRASE DA RECUSA NÃO PODE NOMEAR UMA SITUAÇÃO SÓ, e isto JÁ REGREDIU UMA VEZ ────────────
   *
   * Enquanto a trava era só o `ALOCADO`, a recusa dizia "já alocado" e era exata. Ao passar a cobrir
   * também o `ENVIADO_PARA_ADMISSAO`, a frase ficou para trás e passou a MENTIR em metade dos casos:
   * "Alocado" é uma situação com pill própria na tela, e quem tentasse tirar da vaga alguém que está
   * na esteira leria que a pessoa está "já alocada", conferiria a tela, veria outra coisa e
   * concluiria que o sistema se confundiu. Em lote a frase É a linha do relatório de falhas,
   * repetida uma vez por pessoa.
   *
   * O TESTE AFIRMA A PROPRIEDADE, e não o texto: a MESMA frase sai para os DOIS estados, e ela não
   * nomeia nenhum dos dois. É isso que continua valendo no dia em que um terceiro entregar posição.
   */
  it("a recusa diz o FATO (posição entregue), e não nomeia nenhuma situação", async () => {
    const frases: string[] = [];

    for (const entregue of ["ALOCADO", "ENVIADO_PARA_ADMISSAO"] as const) {
      const b = comCandidatura(entregue, "OFICIAL");
      const erro = await recusaDe(() =>
        b.service.registrarSaida(
          "cand-1",
          { situacao: DESCARTE, motivo: MOTIVO } as never,
          usuarioFingido("COMUM") as never,
        ),
      );
      frases.push(erro?.message ?? "");
    }

    // A MESMA frase nos dois estados: uma frase que mudasse com a situação voltaria a poder mentir.
    expect(frases[0]).toBe(frases[1]);
    expect(frases[0]).toMatch(/entregue/i);
    expect(frases[0]).toMatch(/master/i);
    // E NÃO nomeia nenhuma das duas situações, que é a regressão que já aconteceu.
    expect(frases[0]).not.toMatch(/alocad/i);
    expect(frases[0]).not.toMatch(/admiss/i);
  });

  /**
   * ─ O QUE NÃO PODE REGREDIR, PRIMEIRA METADE ─────────────────────────────────────────────────
   * TODO CONSULTOR desvincula quem está EM SELEÇÃO e quem está APROVADO. É a operação do dia a dia,
   * e é ela que um `@Roles` no handler (ou um `consomePosicao` no lugar do `finalizaPosicao`)
   * quebraria sem que nenhum teste de autoridade notasse.
   */
  for (const viva of VIVAS_SEM_ENTREGA) {
    it(`ACEITA o COMUM desvinculando quem está ${viva}`, async () => {
      const b = comCandidatura(viva);

      await b.service.registrarSaida(
        "cand-1",
        { situacao: DESCARTE, motivo: MOTIVO } as never,
        usuarioFingido("COMUM") as never,
      );

      expect(b.situacaoDe("cand-1")).toBe(DESCARTE);
    });
  }

  it("as vivas sem entrega são exatamente Em Seleção e Aprovado", () => {
    expect(VIVAS_SEM_ENTREGA).toEqual(["ATIVO", "APROVADO"]);
  });

  /**
   * O ENVIO PARA A ADMISSÃO A PARTIR DE UM ALOCADO CONTINUA SENDO DE QUALQUER CONSULTOR: ele AVANÇA
   * a entrega em vez de desfazê-la. A trava é sobre DESFAZER, e confundir os dois transformaria a
   * correção numa parede no meio do fluxo normal da esteira.
   */
  it("o COMUM continua avançando um ALOCADO para a admissão", async () => {
    const b = comCandidatura("ALOCADO", "OFICIAL");

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: MOTIVO } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
  });

  /** No LOTE a autoridade não pode se perder no caminho do laço: é falha POR LINHA. */
  it("no lote, o COMUM descarta os vivos e os entregues voltam em falhas", async () => {
    const b = bancoFingido({
      candidaturas: [
        linhaFingida({ id: "ativo-1", situacao: "ATIVO" }),
        linhaFingida({ id: "enviado-1", situacao: ENVIO, posicaoLado: "OFICIAL" }),
        linhaFingida({ id: "alocado-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
      ],
    });

    const r = await b.service.registrarSaidaEmLote(
      {
        candidaturaIds: ["ativo-1", "enviado-1", "alocado-1"],
        situacao: DESCARTE,
        motivo: MOTIVO,
      } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(r.aplicadas).toBe(1);
    expect(r.falhas.map((f) => f.alvoId).sort()).toEqual(["alocado-1", "enviado-1"]);
    expect(b.situacaoDe("enviado-1")).toBe(ENVIO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O QUE NÃO PODE REGREDIR: REVERTER O ENVIO É DE QUALQUER CONSULTOR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("reverter o envio continua sendo de qualquer consultor", () => {
  /**
   * ─ O TESTE CENTRAL DESTE ARQUIVO: MESMO ESTADO, DOIS VERBOS, DUAS AUTORIDADES ────────────────
   *
   * A candidatura está `ENVIADO_PARA_ADMISSAO` nos dois casos. DESCARTAR é de Master (desfaz a
   * entrega e destrói a volta); REVERTER é de qualquer um (desfaz o envio e DEVOLVE a pessoa ao
   * funil). Um teste que confundisse os dois ficaria verde afirmando o oposto da decisão do
   * diretor, e é por isso que os dois verbos aparecem lado a lado aqui.
   */
  it("o COMUM reverte o envio de quem ele NÃO pode descartar", async () => {
    const b = comCandidatura(ENVIO, "OFICIAL");

    // O mesmo estado, o verbo que exige Master: recusado.
    const erro = await recusaDe(() =>
      b.service.registrarSaida(
        "cand-1",
        { situacao: DESCARTE, motivo: MOTIVO } as never,
        usuarioFingido("COMUM") as never,
      ),
    );
    expect(erro).toBeInstanceOf(ForbiddenException);

    // O mesmo estado, o verbo do erro de clique: passa, e a pessoa volta ao funil.
    await b.service.reverterEnvioParaAdmissao("cand-1", "user-comum");
    expect(b.situacaoDe("cand-1")).toBe("ATIVO");
  });

  /**
   * A REVERSÃO NÃO RECEBE USUÁRIO, E ISSO É O QUE A MANTÉM ABERTA. Ela recebe o `porId` (uma
   * string, para a trilha), e não um `AuthUser` com papel. Este teste chama com uma string e grava:
   * no dia em que alguém trocar a assinatura para pedir o usuário inteiro, a compilação quebra aqui
   * antes de o 403 aparecer para o consultor.
   */
  it("a reversão é chamada com o id do autor, sem papel nenhum na assinatura", async () => {
    const b = comCandidatura(ENVIO, "BANCO");

    await b.service.reverterEnvioParaAdmissao("cand-1", "user-comum");

    expect(b.situacaoDe("cand-1")).toBe("ATIVO");
    const evento = b.eventoDe("cand-1");
    expect(evento?.porId).toBe("user-comum");
  });

  /**
   * DEPOIS DO DESCARTE NÃO HÁ ENVIO A REVERTER, e é isto que torna o descarte IRREVERSÍVEL e
   * justifica a trava do conserto. O teste mede a afirmação que a auditoria usou como argumento, em
   * vez de confiar nela: nem o MASTER recupera a pessoa por esta porta depois do descarte.
   */
  for (const papel of ["COMUM", ...PAPEIS_DE_MASTER] as const) {
    it(`depois do descarte, nem o ${papel} reverte: a porta some para todos`, async () => {
      const b = comCandidatura("DESCARTADO", "OFICIAL");
      void papel; // a reversão não olha papel: é exatamente esse o ponto.

      const erro = await recusaDe(() =>
        b.service.reverterEnvioParaAdmissao("cand-1", "user-1"),
      );

      expect(erro).not.toBeNull();
      expect(b.situacaoDe("cand-1")).toBe("DESCARTADO");
    });
  }

  /** A reversão também não alcança quem está ALOCADO: o alvo dela é ESTREITO, e continua sendo. */
  it("a reversão continua alcançando só quem foi enviado, e não o alocado", async () => {
    const b = comCandidatura("ALOCADO", "OFICIAL");

    const erro = await recusaDe(() => b.service.reverterEnvioParaAdmissao("cand-1", "user-1"));

    expect(erro).not.toBeNull();
    expect(b.situacaoDe("cand-1")).toBe("ALOCADO");
  });
});
