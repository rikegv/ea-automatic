import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AsVagaStatusLinha } from "../vaga-status/vaga-status.service";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";
import {
  ACEITE_REABERTURA_SEM_ORIGEM,
  CENARIO_ANTIGO,
  CENARIO_NORMAL,
  CENARIO_NOVO,
  CODIGO_ABERTURA,
  EVENTO_1,
  EVENTO_2,
  MASTER,
  COMUM,
  SUPER,
  T0,
  VAGA,
  bancoDoReabrir,
  candidaturaDe,
  escritasEm,
  eventoDeCancelamento,
  explicar,
  pessoa,
  portaDe,
  violacoesDoReabrir,
  vivaDe,
  type BancoDoReabrir,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ REABRIR VAGA CANCELADA (B3): O REQUISITO, ESCRITO ANTES DO CÓDIGO (§A.40, regra 2) ───────────
 *
 * ESTE ARQUIVO É DO `tester`, E NÃO DE QUEM CONSTRUIU. A régua da §A.38 é essa: teste do próprio
 * autor pega REGRESSÃO bem e pega MAL-ENTENDIDO DE REQUISITO mal, porque ele codifica exatamente a
 * suposição que gerou o código. O que está afirmado aqui é o REQUISITO do diretor mais os dois
 * vetos do `seguranca`, e nada do que a implementação vier a fazer é lido como definição.
 *
 * O REQUISITO, palavra por palavra do diretor:
 *   - botão "Reabrir Vaga" na vaga cancelada, SÓ MASTER. O comum recebe AVISO, não botão escondido;
 *   - ao reabrir, a LISTA de quem estava, e o Master SELECIONA quais voltam (não todos);
 *   - cada selecionado volta para a SITUAÇÃO DE ORIGEM gravada; os não selecionados ficam
 *     descartados;
 *   - cancelamento ANTIGO, sem origem gravada: o sistema AVISA que não sabe onde estavam, e eles
 *     voltam como "em seleção", nunca entrega;
 *   - status volta ao papel ABERTURA, trilha registra, e SÓ vaga CANCELADA reabre;
 *   - LGPD: o candidato reativado tem o prazo de expurgo PARADO.
 *
 * OS DOIS VETOS DO `seguranca`, que mudaram o requisito depois de o mapa ficar pronto:
 *   - o discriminador NÃO é "a lista veio vazia": o cancelamento NORMAL grava evento com ZERO
 *     pessoas dentro, e tratá-lo como antigo oferece para ressurreição quem a SELEÇÃO recusou;
 *   - são TRÊS estados de origem, não um booleano.
 *
 * ┌─ ONDE MORA A AFIRMAÇÃO, e por que ela não está toda aqui ───────────────────────────────────┐
 * │ O contrato executável vive em `reabrir-vaga.tester-fake.ts` (`violacoesDoReabrir`), e é ele  │
 * │ que este arquivo aplica sobre a produção. O contrato foi ele próprio testado, contra uma     │
 * │ implementação de referência e QUINZE mutantes, em                                            │
 * │ `vagas.reabrir-contrato.comportamental.spec.ts`: sem aquilo, "meu teste pega o defeito?"      │
 * │ seria opinião. Os `it` focados abaixo repetem, um a um, os quatro itens que o diretor exigiu  │
 * │ nominalmente, para o VERMELHO dizer qual deles caiu sem ninguém ter de ler a lista inteira.   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** O catálogo com ABERTURA renomeada: ver a nota do `codigoAbertura` no fake. */
const ABERTURA_RENOMEADA = "ABERTURA_2026";

function catalogoRenomeado() {
  const linhas: AsVagaStatusLinha[] = linhasDeStatusFingidas().map((l) =>
    l.papel === "ABERTURA" ? { ...l, codigo: ABERTURA_RENOMEADA } : l,
  );
  const regua = new ReguaDeStatusDaVaga(linhas);
  return {
    listar: async () => linhas,
    regua: async () => regua,
    codigoDoPapel: async (papel: AsVagaStatusLinha["papel"]) => regua.codigoDoPapel(papel),
  };
}

const servico = (banco: BancoDoReabrir, catalogo: unknown = catalogoDeStatusFingido()) =>
  new VagasService(banco.db as never, catalogoDeEtapasFingido() as never, catalogo as never);

const porta = (banco: BancoDoReabrir, catalogo?: unknown) => portaDe(servico(banco, catalogo));

const comCancelamentoNovo = () =>
  bancoDoReabrir({ pessoas: CENARIO_NOVO(), eventos: [eventoDeCancelamento(EVENTO_1)] });

describe("reabrir vaga: o requisito inteiro, aplicado sobre a produção", () => {
  it("nenhuma regra do contrato é violada", async () => {
    const v = await violacoesDoReabrir((banco) => porta(banco));
    expect(v, `o reabrir de produção violou o requisito:${explicar(v)}`).toEqual([]);
  });

  /**
   * A MESMA RODADA, COM O CÓDIGO DO PAPEL ABERTURA RENOMEADO.
   *
   * ELA NÃO É REDUNDANTE, e a razão foi medida neste mesmo diretório: a semente chama o status de
   * abertura de `"ABERTA"`, que é EXATAMENTE o literal que a armadilha escreve à mão. Rodando só na
   * semente, hardcode e resolução pelo papel gravam a mesma coisa, e a regra que existe para pegar
   * o literal passa verde sobre ele. É o defeito que a B2 matou, chegando pela porta do teste.
   */
  it("com o código do papel ABERTURA renomeado, nada muda: o destino vem do catálogo", async () => {
    const v = await violacoesDoReabrir(
      (banco) => porta(banco, catalogoRenomeado()),
      ABERTURA_RENOMEADA,
    );
    expect(v, `o destino do reabrir está preso a um literal:${explicar(v)}`).toEqual([]);
  });
});

describe("1. a seleção: quem o Master escolheu volta, e SÓ ele", () => {
  it("escolher 2 de 5 reativa exatamente 2, e os outros 3 continuam DESCARTADO", async () => {
    const banco = comCancelamentoNovo();
    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana", "cand-Bia"] }, MASTER);

    expect(vivaDe(banco, "Ana")?.situacao, "quem saiu ATIVO volta EM SELEÇÃO").toBe("ATIVO");
    expect(vivaDe(banco, "Bia")?.situacao, "quem saiu ALOCADO volta ALOCADO").toBe("ALOCADO");
    expect(vivaDe(banco, "Bia")?.posicaoLado, "e volta para o lado que ocupava").toBe("OFICIAL");

    for (const id of ["cand-Eli", "cand-Caio", "cand-Dora"]) {
      expect(candidaturaDe(banco, id)?.situacao, `${id} não foi escolhido`).not.toBe("ATIVO");
      expect(candidaturaDe(banco, id)?.situacao, `${id} não foi escolhido`).not.toBe("ALOCADO");
    }
    // INTOCADOS, e não só "não reativados": qualquer escrita mexe no relógio de retenção deles.
    for (const id of ["cand-Eli", "cand-Caio", "cand-Dora", "cand-Flavia"]) {
      const alcancou = escritasEm(banco, "as_candidaturas").flatMap((e) => e.alcancou);
      expect(alcancou, `${id} foi alcançado por uma escrita`).not.toContain(id);
    }
  });

  it("quem saiu ATIVO com lado pendurado volta EM SELEÇÃO, nunca alocado", async () => {
    const banco = comCancelamentoNovo();
    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Eli"] }, MASTER);
    /*
     * MEDIDO NA BASE: existe candidatura `ATIVO` com `posicao_lado = OFICIAL`, porque a reversão do
     * envio devolve a pessoa para ATIVO sem limpar o lado. Deduzir "tem lado, logo estava alocado"
     * fabrica uma ENTREGA que nunca houve e enche o cilindro oficial da vaga.
     */
    expect(vivaDe(banco, "Eli")?.situacao).toBe("ATIVO");
  });
});

describe("2. o cancelamento ANTIGO: sem origem gravada, volta EM SELEÇÃO", () => {
  it("a prévia avisa que o sistema não sabe onde cada um estava", async () => {
    const banco = bancoDoReabrir({ pessoas: CENARIO_ANTIGO(), eventos: [] });
    const previa = await porta(banco).previa(VAGA, MASTER);

    expect(previa.origem, "não há evento de cancelamento nenhum").toBe("SEM_ORIGEM");
    for (const c of previa.candidaturas) {
      expect(c.situacaoOrigem, `${c.candidaturaId} não tem origem gravada`).toBeNull();
      expect(c.posicaoLadoOrigem, `${c.candidaturaId} não tem lado gravado`).toBeNull();
    }
    expect(
      previa.candidaturas.map((c) => c.candidaturaId),
      "quem DESISTIU por vontade própria nunca é oferecido",
    ).not.toContain("cand-Desistente");
  });

  it("o selecionado volta ATIVO e SEM posição, mesmo com lado pendurado na linha", async () => {
    const banco = bancoDoReabrir({ pessoas: CENARIO_ANTIGO(), eventos: [] });
    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Velha"] }, MASTER);

    const volta = vivaDe(banco, "Velha");
    expect(volta?.situacao, "ATIVO é o estado que não afirma nada além de 'está em processo'").toBe(
      "ATIVO",
    );
    /*
     * ─ O QUE ESTE TESTE NÃO EXIGE, E A RETRATAÇÃO É MEDIDA ─────────────────────────────────────
     *
     * A primeira redação exigia aqui `posicaoLado === null`, com o argumento de que a vaga passaria
     * a mostrar uma posição oficial tomada por quem voltou só EM SELEÇÃO. O argumento é FALSO:
     * `ocupadasPorLado` é alimentado por consulta filtrada por `SITUACOES_QUE_CONSOMEM_POSICAO`
     * (candidatos.service, ~1592), e `ATIVO` não está nela. Lado pendurado em linha ATIVA não conta
     * em cilindro nenhum, e a linha `ATIVO` com lado OFICIAL já EXISTE na base, criada pela reversão
     * do envio, que não limpa o lado de propósito. Exigir a limpeza seria inventar requisito (§A.31).
     */
    expect(volta?.situacao, "nunca ALOCADO").not.toBe("ALOCADO");
    expect(volta?.situacao, "nunca APROVADO").not.toBe("APROVADO");
  });

  it("a escolha a dedo fica registrada como aceite (§A.3 regra 8)", async () => {
    const banco = bancoDoReabrir({ pessoas: CENARIO_ANTIGO(), eventos: [] });
    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Velha"] }, MASTER);
    const aceites = escritasEm(banco, "as_candidatura_etapas").map((e) => e.valores.aceite);
    expect(aceites, "no SEM_ORIGEM o Master RE-ESCOLHE a pessoa, não desfaz um gesto").toContain(
      ACEITE_REABERTURA_SEM_ORIGEM,
    );
  });
});

describe("3. o cancelamento NORMAL: evento gravado, ninguém encerrado por ele", () => {
  /**
   * O VETO DO `seguranca`, E É O TESTE QUE MAIS FÁCIL PASSARIA VERDE POR ENGANO.
   *
   * Medido no `cancelar`: o evento da trilha é inserido SEMPRE, e as candidaturas só são encerradas
   * dentro do `if (forcado)`. Logo, cancelar uma vaga que ninguém segurava gera um evento com ZERO
   * pessoas apontando para ele. Quem ler "lista vazia" como "cancelamento antigo" vai oferecer para
   * ressurreição exatamente quem a SELEÇÃO descartou POR MÉRITO.
   */
  it("a prévia vem VAZIA, e não com os descartados por mérito da mesma vaga", async () => {
    const banco = bancoDoReabrir({
      pessoas: CENARIO_NORMAL(),
      eventos: [eventoDeCancelamento(EVENTO_1)],
    });
    const previa = await porta(banco).previa(VAGA, MASTER);

    expect(previa.candidaturas.map((c) => c.candidaturaId)).toEqual([]);
    expect(previa.origem, "o discriminador é EXISTE EVENTO, nunca A LISTA VEIO VAZIA").toBe(
      "NINGUEM_DESCARTADO",
    );
  });

  it("e o servidor RECUSA restaurar quem a seleção recusou, mesmo com o id na mão", async () => {
    const banco = bancoDoReabrir({
      pessoas: CENARIO_NORMAL(),
      eventos: [eventoDeCancelamento(EVENTO_1)],
    });
    await expect(
      porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Recusada"] }, MASTER),
    ).rejects.toThrow();
    expect(escritasEm(banco, "as_candidaturas")).toEqual([]);
  });
});

describe("4. o escopo é o ÚLTIMO cancelamento, e só ele", () => {
  /**
   * O SEGUNDO ACHADO DO `seguranca`. Ler TODOS os eventos da vaga deixa o Master restaurar gente de
   * cancelamentos anteriores: a capacidade da vaga estoura, porque a restauração não passa pela
   * trava de ocupação da alocação, e antes disso o unique parcial `uq_as_candidaturas_viva` derruba
   * a transação inteira.
   */
  it("a prévia traz só quem saiu no último, e não quem saiu no primeiro", async () => {
    const banco = bancoDoReabrir({
      posicoesOficiais: 1,
      pessoas: [
        pessoa("Ana", "DESCARTADO", {
          saidas: [
            {
              vagaStatusEventoId: EVENTO_1,
              situacaoOrigem: "ALOCADO",
              posicaoLadoOrigem: "OFICIAL",
              ocorridoEm: new Date("2026-09-01T10:00:00.000Z"),
            },
          ],
        }),
        pessoa("Ana", "DESCARTADO", {
          id: "cand-Ana-2",
          saidas: [
            { vagaStatusEventoId: EVENTO_2, situacaoOrigem: "ALOCADO", posicaoLadoOrigem: "OFICIAL" },
          ],
        }),
      ],
      eventos: [
        eventoDeCancelamento(EVENTO_1, new Date("2026-09-01T10:00:00.000Z")),
        eventoDeCancelamento(EVENTO_2, T0),
      ],
    });
    const ids = (await porta(banco).previa(VAGA, MASTER)).candidaturas.map((c) => c.candidaturaId);
    expect(ids).toEqual(["cand-Ana-2"]);
  });
});

describe("4b. a capacidade da vaga é conferida, porque a restauração não passa pela trava", () => {
  /**
   * A RESTAURAÇÃO É O PRIMEIRO CAMINHO QUE VAI DE ENCERRADA PARA VIVA, e ele NÃO passa por
   * `mudarSituacaoOcupandoPosicao`, que é onde mora a trava de ocupação. Sem uma conferência
   * própria, o Master traz de volta mais gente ALOCADA do que a vaga tem posição, o cilindro estoura
   * acima da meta, e o gate de Master do `fechar` (que existe para impedir fechar com posição em
   * aberto) fica contornável pela ponta oposta.
   *
   * A VAGA AQUI TEM UMA POSIÇÃO OFICIAL e DUAS pessoas que saíram ALOCADAS no mesmo cancelamento,
   * que é exatamente o que um cancelamento forçado produz quando a meta foi reduzida depois.
   */
  it("restaurar dois ALOCADOS numa vaga de uma posição é RECUSADO, e nada é gravado", async () => {
    const banco = bancoDoReabrir({
      posicoesOficiais: 1,
      posicoesBanco: 0,
      pessoas: [
        pessoa("Uma", "DESCARTADO", {
          posicaoLado: "OFICIAL",
          saidas: [
            { vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ALOCADO", posicaoLadoOrigem: "OFICIAL" },
          ],
        }),
        pessoa("Outra", "DESCARTADO", {
          posicaoLado: "OFICIAL",
          saidas: [
            { vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ALOCADO", posicaoLadoOrigem: "OFICIAL" },
          ],
        }),
      ],
      eventos: [eventoDeCancelamento(EVENTO_1)],
    });

    await expect(
      porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Uma", "cand-Outra"] }, MASTER),
    ).rejects.toThrow();
    expect(escritasEm(banco, "as_candidaturas"), "a operação é atômica").toEqual([]);
    expect(escritasEm(banco, "vagas"), "e a vaga não chega a ser reaberta").toEqual([]);
  });

  it("mas restaurar UMA cabe, e a vaga reabre", async () => {
    const banco = bancoDoReabrir({
      posicoesOficiais: 1,
      posicoesBanco: 0,
      pessoas: [
        pessoa("Uma", "DESCARTADO", {
          posicaoLado: "OFICIAL",
          saidas: [
            { vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ALOCADO", posicaoLadoOrigem: "OFICIAL" },
          ],
        }),
        pessoa("Outra", "DESCARTADO", {
          posicaoLado: "OFICIAL",
          saidas: [
            { vagaStatusEventoId: EVENTO_1, situacaoOrigem: "ALOCADO", posicaoLadoOrigem: "OFICIAL" },
          ],
        }),
      ],
      eventos: [eventoDeCancelamento(EVENTO_1)],
    });

    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Uma"] }, MASTER);
    expect(vivaDe(banco, "Uma")?.situacao).toBe("ALOCADO");
    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });
});

describe("5. RBAC: a recusa do COMUM vem do SERVIDOR, não da tela", () => {
  it("o COMUM leva 403 do service e não escreve nada", async () => {
    const banco = comCancelamentoNovo();
    await expect(
      porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, COMUM),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(banco.escritas, "recusa que já escreveu não é recusa").toEqual([]);
  });

  it("a recusa DIZ que só o Master reabre, para a tela avisar em vez de esconder o botão", async () => {
    const banco = comCancelamentoNovo();
    try {
      await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, COMUM);
      expect.unreachable("o COMUM reabriu a vaga");
    } catch (e) {
      const corpo = (e as ForbiddenException).getResponse();
      const texto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
      expect(texto.toLowerCase(), "o consultor precisa saber a quem pedir").toContain("master");
    }
  });

  /**
   * O SUPER_ADMIN PASSA, E ESTE É O TESTE QUE FALTA EM QUASE TODA SUÍTE DE RBAC.
   *
   * O `RolesGuard` NÃO promove o SUPER_ADMIN sozinho: ele confere `required.includes(user.papel)` e
   * LANÇA (roles.guard.ts:46) antes da linha que trata o SUPER_ADMIN. Um `@Roles("MASTER")` sozinho
   * barra o diretor, e um teste que só afirme "o COMUM leva 403" fica VERDE com o diretor barrado.
   */
  it("o MASTER e o SUPER_ADMIN reabrem", async () => {
    for (const user of [MASTER, SUPER]) {
      const banco = comCancelamentoNovo();
      await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, user);
      expect(banco.vaga.status, `${user.papel} foi barrado`).toBe(CODIGO_ABERTURA);
    }
  });

  it("o papel vindo no CORPO não promove ninguém", async () => {
    const banco = comCancelamentoNovo();
    await expect(
      porta(banco).reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana"], papel: "MASTER", user: { papel: "SUPER_ADMIN" } },
        COMUM,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(banco.escritas).toEqual([]);
  });
});
