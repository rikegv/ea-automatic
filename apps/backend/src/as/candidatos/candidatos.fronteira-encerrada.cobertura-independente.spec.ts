import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  ehSaidaSemExito,
  finalizaPosicao,
} from "@ea/shared-types";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { bancoFingido, linhaFingida, usuarioFingido } from "./fronteira-encerrada.tester-fake";

/**
 * ─ A FRONTEIRA ENCERRADA→VIVA: A TERCEIRA PORTA, E A AUTORIDADE DE DESFAZER A ENTREGA ─────────
 *
 * COBERTURA INDEPENDENTE (§A.38): escrita pelo `tester`, que não escreveu o código, JUNTO com a
 * construção (§A.40 regra 2). É para ela estar VERMELHA enquanto o `backend` constrói.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, e nada disso é hipótese ───────────────────────────┐
 * │ 1. A TERCEIRA PORTA. `registrarSaida` com `ENVIADO_PARA_ADMISSAO` sobre candidatura JÁ       │
 * │    ENCERRADA era ACEITA: a linha morta ressuscitava, CONSUMIA posição da vaga e pulava a      │
 * │    ciência de reentrada, enquanto o modal da tela prometia, com todas as letras, que aquela   │
 * │    pessoa "vai voltar na lista de falhas". O caminho não tinha teste NENHUM.                  │
 * │ 2. A ASSIMETRIA ENTRE OS DOIS MODOS. O MESMO componente, com o MESMO texto, renderiza         │
 * │    "desvincular" e "enviar para admissão". A guarda existia num e faltava no outro, então a   │
 * │    tela dizia a verdade em metade dos cliques. Os dois lados são afirmados AQUI, no mesmo     │
 * │    arquivo, para a divergência não poder voltar sem quebrar.                                  │
 * │ 3. O DEFAULT SILENCIOSO. `exigeCandidaturaViva` era opcional, e o terceiro chamador HERDOU a  │
 * │    ausência sem nunca ter decidido. É assim que a próxima reincidência nasce.                 │
 * │ 4. DESFAZER ENTREGA SEM AUTORIDADE. Desvincular um ALOCADO é desfazer a entrega da vaga, e    │
 * │    era por ali que o gate de Master do fechamento ficava contornável em duas etapas.          │
 * │ 5. A MARCA DE POSIÇÃO PENDURADA. Quem volta EM SELEÇÃO não ocupa posição nenhuma, e um lado   │
 * │    herdado na linha é contagem silenciosa contra a meta de banco.                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O CONTRATO QUE ESTE ARQUIVO ASSUME, e ele veio do mapa, não do meu gosto ───────────────────
 * `registrarSaida(candidaturaId, dto, user)` e `registrarSaidaEmLote(dto, user)` passam a receber o
 * USUÁRIO INTEIRO, no padrão que a casa já tem em `vagas.service.fechar(id, dto, user)`. A trava de
 * autoridade mora no SERVICE, nunca em `@Roles` na rota: um `@Roles` no handler barraria o
 * desvínculo NORMAL do COMUM, que é regressão silenciosa e é o que o teste do COMUM aqui protege.
 *
 * §A.6: nenhum CPF, nenhum nome de pessoa e nenhuma URL entram neste arquivo. Ids internos, uma
 * situação do vocabulário compartilhado e um papel de sessão.
 */

const MOTIVO = "Perfil não aderente ao cliente";

/** As situações ENCERRADAS, derivadas da régua e nunca digitadas: saída nova cai aqui sozinha. */
const ENCERRADAS = CANDIDATURA_SITUACOES.filter((s) => !candidaturaViva(s));

/** Os dois modos do MESMO gesto de tela: desvincular (sem êxito) e enviar para a admissão. */
const DESVINCULOS = CANDIDATURA_SITUACOES.filter(ehSaidaSemExito);
const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;

async function recusaDe(chamada: () => Promise<unknown>): Promise<Error | null> {
  try {
    await chamada();
    return null;
  } catch (err) {
    return err as Error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. AS RÉGUAS DERIVADAS, para o arquivo não envelhecer calado
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o vocabulário que este arquivo percorre", () => {
  it("as situações encerradas são exatamente Descartado e Desistiu", () => {
    expect(ENCERRADAS).toEqual(["DESCARTADO", "DESISTIU"]);
  });

  /**
   * A GUARDA DO PRÓPRIO TESTE. Situação de saída nova entra na cobertura sem ninguém lembrar, e se
   * ela NÃO entrar, este teste avisa antes de o caminho novo nascer sem guarda, que é exatamente
   * como a terceira porta nasceu.
   */
  it("o envio para a admissão é o único desfecho que CONSUMA posição", () => {
    expect(DESVINCULOS).toEqual(["DESCARTADO", "DESISTIU"]);
    expect(finalizaPosicao(ENVIO)).toBe(true);
    expect(DESVINCULOS.some(finalizaPosicao)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A TERCEIRA PORTA FECHADA: enviar para a admissão NÃO ressuscita linha morta
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a terceira porta: enviar para a admissão sobre candidatura ENCERRADA", () => {
  for (const encerrada of ENCERRADAS) {
    /**
     * O TESTE QUE TEM DE FICAR VERMELHO CONTRA O CÓDIGO DE ANTES. Antes do conserto, esta chamada
     * era ACEITA: a linha ia a `ENVIADO_PARA_ADMISSAO`, o cilindro da vaga subia e a pessoa que
     * tinha saído do processo voltava ocupando uma posição, sem passar pela ciência de reentrada.
     */
    it(`é RECUSADA quando a candidatura está ${encerrada}`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: encerrada })],
      });

      const erro = await recusaDe(() =>
        b.service.registrarSaida(
          "cand-1",
          { situacao: ENVIO, motivo: MOTIVO } as never,
          usuarioFingido("MASTER") as never,
        ),
      );

      expect(erro).toBeInstanceOf(ConflictException);
      expect(erro?.message).toMatch(/encerrada/i);
    });

    /**
     * A RECUSA NÃO PODE SER "DE MENTIRA": nada pode ter sido escrito. Uma implementação que
     * recusasse DEPOIS de gravar deixaria a linha viva e o chamador achando que nada aconteceu, que
     * é pior do que aceitar, porque a tela mostra a recusa.
     */
    it(`não escreve NADA na candidatura ${encerrada} nem no histórico dela`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: encerrada })],
      });

      await recusaDe(() =>
        b.service.registrarSaida(
          "cand-1",
          { situacao: ENVIO, motivo: MOTIVO } as never,
          usuarioFingido("MASTER") as never,
        ),
      );

      expect(b.situacaoDe("cand-1")).toBe(encerrada);
      expect(b.updates.filter((u) => u.tabela === asCandidaturas)).toHaveLength(0);
      expect(b.inserts.filter((i) => i.tabela === asCandidaturaEtapas)).toHaveLength(0);
    });
  }

  /**
   * O CONTROLE POSITIVO, e ele é o que impede a correção de virar uma trava cega: quem está VIVO
   * continua sendo enviado para a esteira normalmente. Sem este teste, um `throw` incondicional
   * passaria em todos os testes acima e quebraria a operação inteira.
   */
  it("continua ACEITANDO quem está vivo, que é o caminho normal do dia a dia", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
    });

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: MOTIVO } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A SIMETRIA: o MESMO gesto é recusado nos DOIS modos
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE OS DOIS MODOS MORAM NO MESMO `describe` ─────────────────────────────────────────────
 *
 * Era a ASSIMETRIA que fazia a tela mentir: `AcoesEmMassaDaVaga` renderiza o MESMO modal, com o
 * MESMO aviso ("elas vão voltar na lista de falhas"), para "desvincular" e para "enviar para
 * admissão". Com a guarda em um só, o aviso era verdadeiro num clique e falso no outro, sem nada
 * na tela distinguir os dois.
 *
 * O LAÇO PERCORRE OS TRÊS DESFECHOS DE UMA VEZ, derivados da régua. Um desfecho novo entra aqui
 * sozinho, e é isso que impede a próxima porta de nascer sem guarda.
 */
describe("a simetria entre os dois modos do mesmo gesto", () => {
  const TODOS_OS_DESFECHOS = [...DESVINCULOS, ENVIO];

  for (const desfecho of TODOS_OS_DESFECHOS) {
    for (const encerrada of ENCERRADAS) {
      it(`${desfecho} sobre ${encerrada} é recusado, e a frase é a mesma em todos`, async () => {
        const b = bancoFingido({
          candidaturas: [linhaFingida({ id: "cand-1", situacao: encerrada })],
        });

        const erro = await recusaDe(() =>
          b.service.registrarSaida(
            "cand-1",
            { situacao: desfecho, motivo: MOTIVO } as never,
            usuarioFingido("MASTER") as never,
          ),
        );

        expect(erro).toBeInstanceOf(ConflictException);
        expect(erro?.message).toMatch(/encerrada/i);
      });
    }
  }

  /**
   * A RECUSA PRECISA DIZER O QUE FAZER. A frase é a única coisa que o consultor recebe, e uma que
   * só diga "não pode" manda a pessoa procurar um caminho que ela não sabe que existe. As DUAS
   * portas declaradas (reabrir e realocar com ciência) estão na frase, e a recusa aponta para elas.
   */
  it("a frase da recusa aponta o caminho de volta, em vez de só negar", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "DESCARTADO" })],
    });

    const erro = await recusaDe(() =>
      b.service.registrarSaida(
        "cand-1",
        { situacao: ENVIO, motivo: MOTIVO } as never,
        usuarioFingido("MASTER") as never,
      ),
    );

    expect(erro?.message).toMatch(/aloque|alocá|de volta/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. NO LOTE É FALHA POR LINHA, NUNCA QUEDA DO LOTE INTEIRO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o lote misto: três vivos e dois encerrados", () => {
  function cenarioMisto() {
    return bancoFingido({
      candidaturas: [
        linhaFingida({ id: "vivo-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
        linhaFingida({ id: "morto-1", situacao: "DESCARTADO" }),
        linhaFingida({ id: "vivo-2", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
        linhaFingida({ id: "morto-2", situacao: "DESISTIU" }),
        linhaFingida({ id: "vivo-3", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
      ],
      posicoesOficiais: 20,
    });
  }

  /**
   * ─ A LINHA RUIM ESTÁ NO MEIO DA SELEÇÃO, DE PROPÓSITO ─────────────────────────────────────────
   *
   * Uma implementação que aborte no primeiro erro passa num cenário em que o encerrado é o ÚLTIMO,
   * e reprova aqui. É esse arranjo que prova o `try/catch` POR LINHA: o `vivo-2` e o `vivo-3` vêm
   * DEPOIS do `morto-1`, e os dois têm de gravar.
   */
  it("grava os três vivos e devolve os dois encerrados em falhas", async () => {
    const b = cenarioMisto();

    const r = await b.service.registrarSaidaEmLote(
      {
        candidaturaIds: ["vivo-1", "morto-1", "vivo-2", "morto-2", "vivo-3"],
        situacao: ENVIO,
        motivo: MOTIVO,
      } as never,
      usuarioFingido("MASTER") as never,
    );

    expect(r.aplicadas).toBe(3);
    expect(r.falhas.map((f) => f.alvoId).sort()).toEqual(["morto-1", "morto-2"]);
  });

  /**
   * O QUE FOI GRAVADO NO BANCO, e não só o número devolvido. `aplicadas: 3` com quatro linhas
   * escritas seria um relatório bonito sobre um estrago, e o número é o que a tela mostra.
   */
  it("o estado gravado bate com o relatório: os encerrados continuam encerrados", async () => {
    const b = cenarioMisto();

    await b.service.registrarSaidaEmLote(
      {
        candidaturaIds: ["vivo-1", "morto-1", "vivo-2", "morto-2", "vivo-3"],
        situacao: ENVIO,
        motivo: MOTIVO,
      } as never,
      usuarioFingido("MASTER") as never,
    );

    expect(b.situacaoDe("vivo-1")).toBe(ENVIO);
    expect(b.situacaoDe("vivo-2")).toBe(ENVIO);
    expect(b.situacaoDe("vivo-3")).toBe(ENVIO);
    expect(b.situacaoDe("morto-1")).toBe("DESCARTADO");
    expect(b.situacaoDe("morto-2")).toBe("DESISTIU");
  });

  /**
   * A FALHA CARREGA O MOTIVO, e é ele que a tela mostra linha a linha no `ResultadoLoteModal`. Uma
   * falha com motivo vazio transforma a lista de exceções numa lista de ids, que não explica nada a
   * quem precisa decidir o que fazer com cada pessoa.
   */
  it("cada falha explica POR QUE aquela linha não entrou", async () => {
    const b = cenarioMisto();

    const r = await b.service.registrarSaidaEmLote(
      {
        candidaturaIds: ["morto-1", "vivo-1"],
        situacao: ENVIO,
        motivo: MOTIVO,
      } as never,
      usuarioFingido("MASTER") as never,
    );

    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]?.motivo).toMatch(/encerrada/i);
  });

  /** A simetria também no lote: o modo desvincular tem de se comportar igual. */
  it("o lote no modo desvincular falha pelas mesmas linhas, e pelo mesmo motivo", async () => {
    const b = cenarioMisto();

    const r = await b.service.registrarSaidaEmLote(
      {
        candidaturaIds: ["vivo-1", "morto-1", "morto-2"],
        situacao: "DESCARTADO",
        motivo: MOTIVO,
      } as never,
      usuarioFingido("MASTER") as never,
    );

    expect(r.aplicadas).toBe(1);
    expect(r.falhas.map((f) => f.alvoId).sort()).toEqual(["morto-1", "morto-2"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A CONFERÊNCIA VIRA ESTRUTURAL: nenhum chamador herda silêncio
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("os TRÊS chamadores decidem, e nenhum herda o default", () => {
  /**
   * ─ A PROVA COMPORTAMENTAL, que é a que vale ─────────────────────────────────────────────────
   *
   * A pergunta "o parâmetro é obrigatório?" só existe em tempo de COMPILAÇÃO, e nenhum teste de
   * runtime a responde (`Function.length` conta parâmetro opcional igual, e o método é `private`,
   * então nem por tipo se alcança de fora). O que se pode medir é a CONSEQUÊNCIA: os três caminhos
   * que gravam situação que ocupa posição recusam linha encerrada. Um chamador que passasse
   * `false` por descuido reprova aqui, ainda que o parâmetro seja obrigatório.
   */
  for (const encerrada of ENCERRADAS) {
    it(`aprovar recusa candidatura ${encerrada}`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: encerrada })],
      });
      const erro = await recusaDe(() => b.service.aprovar("cand-1", "user-1"));
      expect(erro).toBeInstanceOf(ConflictException);
      expect(erro?.message).toMatch(/encerrada/i);
    });

    it(`finalizar posição recusa candidatura ${encerrada}`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: encerrada })],
      });
      const erro = await recusaDe(() =>
        b.service.finalizarPosicao("cand-1", { lado: "OFICIAL" } as never, "user-1"),
      );
      expect(erro).toBeInstanceOf(ConflictException);
      expect(erro?.message).toMatch(/encerrada/i);
    });
  }

  /**
   * ─ A PROVA ESTRUTURAL, e ela é DECLARADAMENTE fraca, por isso vem acompanhada ─────────────────
   *
   * O requisito "um chamador novo NÃO COMPILA sem escolher" vive na assinatura, e a assinatura só
   * existe no fonte. Este teste lê o fonte e exige que a opção NÃO seja opcional.
   *
   * O QUE ELE NÃO PEGA, e está escrito aqui para ninguém confiar demais nele: renomear a opção
   * passa, e um chamador novo passando `{ exigeCandidaturaViva: false }` passa. Quem pega o segundo
   * caso são os testes comportamentais logo acima; o primeiro caso quebra a compilação, que é o
   * gate do coordenador. A fraqueza é conhecida e delimitada, não ignorada.
   */
  it("o parâmetro `exigeCandidaturaViva` é OBRIGATÓRIO na assinatura, não opcional", () => {
    const fonte = readFileSync(join(__dirname, "candidatos.service.ts"), "utf8");
    const declaracao = fonte.match(
      /opcoes\??\s*:\s*\{\s*exigeCandidaturaViva\s*:\s*boolean\s*\}/,
    );

    expect(declaracao).not.toBeNull();
    expect(declaracao?.[0]).not.toMatch(/opcoes\?/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. DESVINCULAR UM ALOCADO EXIGE MASTER
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a autoridade de desfazer a entrega", () => {
  function comAlocado() {
    return bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
    });
  }

  for (const desvinculo of DESVINCULOS) {
    /**
     * O COMUM É RECUSADO, e o dano que isso fecha não é o desvínculo em si: é o gate de MASTER do
     * FECHAMENTO ficar contornável em duas etapas (desvincula a entrega, a vaga deixa de estar
     * cheia, e o que exigia Master passa a não exigir).
     */
    it(`recusa o COMUM desvinculando (${desvinculo}) quem está ALOCADO`, async () => {
      const b = comAlocado();

      const erro = await recusaDe(() =>
        b.service.registrarSaida(
          "cand-1",
          { situacao: desvinculo, motivo: MOTIVO } as never,
          usuarioFingido("COMUM") as never,
        ),
      );

      expect(erro).toBeInstanceOf(ForbiddenException);
      expect(b.situacaoDe("cand-1")).toBe("ALOCADO");
    });

    /**
     * ─ O TESTE QUE NÃO PODE REGREDIR, e é ele que explica a trava morar no SERVICE ──────────────
     *
     * TODO CONSULTOR desvincula quem está EM SELEÇÃO: é o gesto mais comum do módulo. Um
     * `@Roles("MASTER","SUPER_ADMIN")` no handler barraria ESTE caminho junto, e a operação
     * inteira pararia por uma trava que existia para outra coisa. Nada falharia em teste nenhum
     * que olhasse só o caso do ALOCADO.
     */
    it(`ACEITA o COMUM desvinculando (${desvinculo}) quem está EM SELEÇÃO`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: "ATIVO" })],
      });

      await b.service.registrarSaida(
        "cand-1",
        { situacao: desvinculo, motivo: MOTIVO } as never,
        usuarioFingido("COMUM") as never,
      );

      expect(b.situacaoDe("cand-1")).toBe(desvinculo);
    });
  }

  /** O SUPER_ADMIN é o que mais se esquece: quem escreve a trava pensa em MASTER e para ali. */
  for (const papel of ["MASTER", "SUPER_ADMIN"] as const) {
    it(`ACEITA o ${papel} desvinculando quem está ALOCADO`, async () => {
      const b = comAlocado();

      await b.service.registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO } as never,
        usuarioFingido(papel) as never,
      );

      expect(b.situacaoDe("cand-1")).toBe("DESCARTADO");
    });

    it(`ACEITA o ${papel} desvinculando quem está EM SELEÇÃO`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: "ATIVO" })],
      });

      await b.service.registrarSaida(
        "cand-1",
        { situacao: "DESISTIU", motivo: MOTIVO } as never,
        usuarioFingido(papel) as never,
      );

      expect(b.situacaoDe("cand-1")).toBe("DESISTIU");
    });
  }

  /**
   * A TRAVA É SOBRE DESFAZER ENTREGA, e não sobre "mexer em quem ocupa posição". O APROVADO
   * RESERVA posição e não a ENTREGOU, então o COMUM continua podendo desvinculá-lo. Se este teste
   * ficar vermelho, alguém trocou `finalizaPosicao` por `consomePosicao` na guarda, e a operação
   * perde um gesto que sempre foi dela.
   */
  it("o COMUM continua desvinculando quem está APROVADO, que reserva mas não entregou", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "APROVADO" })],
    });

    await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(b.situacaoDe("cand-1")).toBe("DESCARTADO");
  });

  /**
   * O ENVIO PARA A ADMISSÃO NÃO É DESVÍNCULO, e continua sendo de qualquer consultor a partir de um
   * ALOCADO: ele AVANÇA a entrega em vez de desfazê-la. Confundir os dois transformaria a trava
   * nova numa parede no meio do fluxo normal da esteira.
   */
  it("o COMUM continua ENVIANDO para a admissão quem está ALOCADO", async () => {
    const b = comAlocado();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: MOTIVO } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
  });

  /** No LOTE a mesma autoridade vale: o papel não pode se perder no caminho do laço. */
  it("no lote, o COMUM não desvincula os ALOCADOS, e eles voltam em falhas", async () => {
    const b = bancoFingido({
      candidaturas: [
        linhaFingida({ id: "ativo-1", situacao: "ATIVO" }),
        linhaFingida({ id: "alocado-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
      ],
    });

    const r = await b.service.registrarSaidaEmLote(
      {
        candidaturaIds: ["ativo-1", "alocado-1"],
        situacao: "DESCARTADO",
        motivo: MOTIVO,
      } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(r.aplicadas).toBe(1);
    expect(r.falhas.map((f) => f.alvoId)).toEqual(["alocado-1"]);
    expect(b.situacaoDe("alocado-1")).toBe("ALOCADO");
  });
});
