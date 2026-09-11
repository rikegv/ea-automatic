import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { POSICAO_LADOS, candidaturaViva } from "@ea/shared-types";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { restaurarCandidatura } from "./restaurar-candidatura";
import { bancoFingido, linhaFingida, usuarioFingido } from "./fronteira-encerrada.tester-fake";

/**
 * ─ O INVARIANTE, INTEIRO: QUEM ESTÁ EM SELEÇÃO NÃO CARREGA MARCA DE POSIÇÃO ───────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), e aqui ela cobre algo que NENHUM dos dois consertos cobre
 * sozinho: o invariante COMO INVARIANTE, nas duas portas ao mesmo tempo.
 *
 * ┌─ POR QUE UM ARQUIVO PARA ISTO, SE CADA CONSERTO JÁ TEM O SEU TESTE ────────────────────────┐
 * │ PORQUE O DEFEITO NÃO FOI "ESQUECERAM DE APAGAR UM CAMPO". O defeito foi um invariante        │
 * │ cumprido por UMA porta e desmentido pela OUTRA, e um invariante que vale em metade dos       │
 * │ caminhos não é um invariante, é uma coincidência. O `restaurar-candidatura` limpava desde o   │
 * │ conserto C; o `reverterEnvioParaAdmissao` não limpava, e ninguém comparou as duas.            │
 * │                                                                                              │
 * │ TESTE POR CONSERTO NÃO PEGA ISSO, por construção: cada um afirma a sua porta e fica verde.    │
 * │ A pergunta "as duas portas concordam?" não existe em nenhum dos dois arquivos, e é ela que    │
 * │ pega a TERCEIRA porta no dia em que alguém a abrir.                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E O TESTE QUE VALE POR TODOS OS OUTROS: O DANO, E NÃO A COLUNA ───────────────────────────┐
 * │ Afirmar `posicaoLado === null` afirma a LINHA DE CÓDIGO do conserto. O que o diretor perdeu   │
 * │ não foi uma coluna, foi uma APROVAÇÃO RECUSADA numa vaga com lugar sobrando: 4 posições       │
 * │ oficiais livres, o banco cheio, e um 409 dizendo "as 3 posições de banco já estão             │
 * │ preenchidas". O teste de ponta a ponta deste arquivo reproduz exatamente esse cenário e       │
 * │ afirma que a aprovação PASSA. Ele sobrevive a qualquer refatoração que troque o mecanismo do  │
 * │ conserto, porque afirma a consequência, e não a implementação.                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids internos, lados do vocabulário, nenhum dado de pessoa.
 */

const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;
const EM_SELECAO = "ATIVO" as const;

/** As situações VIVAS que não ocupam posição. É delas que o invariante fala. */
const SEM_POSICAO = ["ATIVO"] as const;

const updateDaCandidatura = (updates: { tabela: unknown; valores: Record<string, unknown> }[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. AS DUAS PORTAS QUE DEVOLVEM ALGUÉM PARA A SELEÇÃO, LADO A LADO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O CENSO DAS PORTAS, e ele é a parte deste arquivo que envelhece ────────────────────────────
 *
 * `as_candidaturas.situacao` tem QUATRO escritores, e só DOIS podem terminar com a pessoa EM
 * SELEÇÃO:
 *   1. `reverterEnvioParaAdmissao` (desfaz o envio, devolve ao funil)  → coberto abaixo;
 *   2. `restaurarCandidatura` (a volta do reabrir)                      → coberto abaixo.
 * Os outros dois NÃO alcançam o invariante, e isso é estrutural, não sorte:
 *   3. `mudarSituacaoOcupandoPosicao` só grava situação que OCUPA posição (é a assinatura dele);
 *   4. `gravarSaidaDaCandidatura` só grava DESFECHO, e quem está encerrado não está em seleção.
 *
 * O NASCIMENTO (`alocar`) É A QUINTA PORTA E NÃO ESTÁ COBERTA AQUI: a linha nasce EM SELEÇÃO com
 * `posicaoLado` vindo do DEFAULT da coluna (o `insert` não menciona o campo). O invariante vale ali
 * por schema, e não por teste meu. Está declarado em vez de silenciado.
 */
describe("as duas portas da volta à seleção concordam", () => {
  for (const lado of POSICAO_LADOS) {
    it(`porta 1, a reversão do envio: quem volta do lado ${lado} volta SEM marca`, async () => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ id: "cand-1", situacao: ENVIO, posicaoLado: lado })],
      });

      await b.service.reverterEnvioParaAdmissao("cand-1", "user-1");

      expect(b.updateDa("cand-1")).toMatchObject({ situacao: EM_SELECAO, posicaoLado: null });
      expect(b.linhas[0]?.posicaoLado).toBeNull();
    });

    it(`porta 2, a restauração do reabrir: quem volta do lado ${lado} volta SEM marca`, async () => {
      const updates: { tabela: unknown; valores: Record<string, unknown> }[] = [];
      const tx = {
        update: vi.fn((tabela: unknown) => ({
          set: (valores: Record<string, unknown>) => {
            updates.push({ tabela, valores });
            return { where: () => ({ returning: async () => [{ id: "cand-1" }] }) };
          },
        })),
        insert: vi.fn(() => ({ values: async () => undefined })),
      };

      await restaurarCandidatura(
        tx as never,
        {
          id: "cand-1",
          situacaoAtual: "DESCARTADO",
          etapaDestino: "TRIAGEM" as never,
          situacao: EM_SELECAO,
          posicaoLadoOrigem: lado,
        },
        { motivo: "Vaga reaberta.", porId: "user-1", vagaStatusEventoId: "evt-1" },
      );

      expect(updateDaCandidatura(updates)).toMatchObject({
        situacao: EM_SELECAO,
        posicaoLado: null,
      });
    });
  }

  /**
   * ─ A ASSERÇÃO QUE COMPARA AS DUAS PORTAS, e é ela que dá nome ao arquivo ────────────────────
   *
   * As duas escrevem a MESMA dupla `(situacao, posicaoLado)` para quem volta à seleção. Uma porta
   * que divergisse continuaria passando no teste dela e reprovaria aqui, que é exatamente o que
   * faltou quando o conserto C corrigiu uma delas e a outra ficou para trás por três ondas.
   */
  it("as duas portas escrevem a MESMA dupla para quem volta à seleção", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: ENVIO, posicaoLado: "BANCO" })],
    });
    await b.service.reverterEnvioParaAdmissao("cand-1", "user-1");
    const daReversao = b.updateDa("cand-1") ?? {};

    const updates: { tabela: unknown; valores: Record<string, unknown> }[] = [];
    const tx = {
      update: vi.fn((tabela: unknown) => ({
        set: (valores: Record<string, unknown>) => {
          updates.push({ tabela, valores });
          return { where: () => ({ returning: async () => [{ id: "cand-1" }] }) };
        },
      })),
      insert: vi.fn(() => ({ values: async () => undefined })),
    };
    await restaurarCandidatura(
      tx as never,
      {
        id: "cand-1",
        situacaoAtual: "DESCARTADO",
        etapaDestino: "TRIAGEM" as never,
        situacao: EM_SELECAO,
        posicaoLadoOrigem: "BANCO",
      },
      { motivo: "Vaga reaberta.", porId: "user-1", vagaStatusEventoId: "evt-1" },
    );
    const daRestauracao = updateDaCandidatura(updates);

    const dupla = (v: Record<string, unknown>) => ({
      situacao: v.situacao,
      posicaoLado: v.posicaoLado,
    });
    expect(dupla(daReversao)).toEqual(dupla(daRestauracao));
    expect(dupla(daReversao)).toEqual({ situacao: EM_SELECAO, posicaoLado: null });
  });

  /** A situação de que este invariante fala é VIVA: encerrado não está "em seleção". */
  it("o invariante fala de situação VIVA, e Em Seleção é a única sem posição", () => {
    expect(SEM_POSICAO).toEqual(["ATIVO"]);
    expect(SEM_POSICAO.every((s) => candidaturaViva(s))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O CONTRAPESO: quem CONTINUA ocupando não pode perder a marca
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o conserto não pode virar uma limpeza indiscriminada", () => {
  /**
   * QUEM VOLTA ALOCADO MANTÉM O LADO, e sem isto a correção vira estrago: uma vaga que cancelou com
   * gente no BANCO veria a reserva inteira voltar contra a meta OFICIAL, porque o domínio dobra o
   * nulo em OFICIAL (`ladoDaCandidatura`).
   */
  for (const lado of POSICAO_LADOS) {
    it(`a restauração de um ALOCADO do lado ${lado} preserva o lado`, async () => {
      const updates: { tabela: unknown; valores: Record<string, unknown> }[] = [];
      const tx = {
        update: vi.fn((tabela: unknown) => ({
          set: (valores: Record<string, unknown>) => {
            updates.push({ tabela, valores });
            return { where: () => ({ returning: async () => [{ id: "cand-1" }] }) };
          },
        })),
        insert: vi.fn(() => ({ values: async () => undefined })),
      };

      await restaurarCandidatura(
        tx as never,
        {
          id: "cand-1",
          situacaoAtual: "DESCARTADO",
          etapaDestino: "TRIAGEM" as never,
          situacao: "ALOCADO",
          posicaoLadoOrigem: lado,
        },
        { motivo: "Vaga reaberta.", porId: "user-1", vagaStatusEventoId: "evt-1" },
      );

      expect(updateDaCandidatura(updates).posicaoLado).toBe(lado);
    });
  }

  /**
   * AVANÇAR DE ENTREGA PARA ENTREGA NÃO MEXE NO LADO. Alocado no BANCO que vai para a esteira
   * continua no BANCO: ele nunca esteve em seleção, então o invariante deste arquivo não fala dele.
   * Escrever `OFICIAL` ali (ou limpar) mudaria o lado da entrega sem ninguém ter decidido nada.
   */
  it("avançar de ALOCADO para a esteira preserva o lado de quem estava no banco", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "BANCO" })],
      posicoesOficiais: 5,
      posicoesBanco: 20,
    });

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: "documentação ok" } as never,
      usuarioFingido("COMUM") as never,
    );

    expect(b.updateDa("cand-1")).not.toHaveProperty("posicaoLado");
    expect(b.linhas[0]?.posicaoLado).toBe("BANCO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O DANO MEDIDO, DE PONTA A PONTA: a aprovação seguinte volta a caber
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o dano que o conserto 2 fecha, reproduzido", () => {
  /**
   * ─ O CENÁRIO É O MEDIDO, NÚMERO POR NÚMERO ───────────────────────────────────────────────────
   *
   * Vaga com 4 posições OFICIAIS livres e o BANCO CHEIO (3 de 3). A pessoa estava no banco, teve o
   * envio revertido e voltou para a seleção.
   *
   * COM A MARCA PENDURADA (o código de antes): a aprovação lê `ladoDaCandidatura("BANCO")`, mede
   * contra o teto de banco, encontra 3 de 3 e recusa com 409 "as 3 posições de banco já estão
   * preenchidas". Erro incompreensível para quem operou, porque a vaga tem quatro lugares livres.
   *
   * COM A MARCA LIMPA: o lado cai em OFICIAL, a contagem oficial é ZERO contra um teto de 4, e a
   * aprovação passa.
   *
   * ESTE TESTE AFIRMA A CONSEQUÊNCIA, e não a coluna: ele continua valendo se o mecanismo do
   * conserto mudar, e é o único do repositório que liga as duas operações na ordem em que a
   * operação as faz.
   */
  function vagaComBancoCheioEOficiaisLivres(ladoDaPessoa: string | null) {
    return bancoFingido({
      posicoesOficiais: 4,
      posicoesBanco: 3,
      candidaturas: [
        linhaFingida({ id: "cand-1", situacao: ENVIO, posicaoLado: ladoDaPessoa }),
        linhaFingida({ id: "banco-1", situacao: "ALOCADO", posicaoLado: "BANCO" }),
        linhaFingida({ id: "banco-2", situacao: "ALOCADO", posicaoLado: "BANCO" }),
        linhaFingida({ id: "banco-3", situacao: "ALOCADO", posicaoLado: "BANCO" }),
      ],
    });
  }

  it("revertido do banco, a aprovação seguinte PASSA na vaga com oficiais livres", async () => {
    const b = vagaComBancoCheioEOficiaisLivres("BANCO");

    await b.service.reverterEnvioParaAdmissao("cand-1", "user-1");
    expect(b.linhas[0]?.situacao).toBe(EM_SELECAO);

    await b.service.aprovar("cand-1", "user-1");

    expect(b.situacaoDe("cand-1")).toBe("APROVADO");
  });

  /**
   * A PROVA DE QUE O CENÁRIO É O CERTO, e não um cenário frouxo que passaria de qualquer jeito:
   * com a marca de BANCO ainda na linha, a MESMA aprovação é recusada, com a MESMA frase que o
   * diretor viu. Aqui a marca é posta à mão, simulando a linha que o código de antes deixava.
   */
  it("com a marca de banco pendurada, a mesma aprovação é recusada, e com a frase medida", async () => {
    const b = vagaComBancoCheioEOficiaisLivres("BANCO");
    // A linha como o código de ANTES a deixava: em seleção, carregando a marca do banco.
    b.linhas[0]!.situacao = EM_SELECAO;
    b.linhas[0]!.posicaoLado = "BANCO";

    let erro: Error | null = null;
    try {
      await b.service.aprovar("cand-1", "user-1");
    } catch (err) {
      erro = err as Error;
    }

    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro?.message).toMatch(/3 posições de banco/i);
  });

  /**
   * O ESPELHO, e ele fecha a conta: quem volta SEM marca é medido contra a meta OFICIAL. Sem este
   * caso, o teste de cima poderia estar passando por qualquer motivo (uma folga de banco, um teto
   * mal montado), e não por o lado ter virado oficial.
   */
  it("sem marca, a pessoa é medida contra a meta OFICIAL, e não contra a de banco", async () => {
    const b = vagaComBancoCheioEOficiaisLivres(null);
    b.linhas[0]!.situacao = EM_SELECAO;

    await b.service.aprovar("cand-1", "user-1");

    // Nenhum lado escrito pela aprovação (ela não escolhe lado), e a situação avançou.
    expect(b.updateDa("cand-1")).not.toHaveProperty("posicaoLado");
    expect(b.situacaoDe("cand-1")).toBe("APROVADO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A MEMÓRIA NÃO SE PERDE, e é bom que isso seja medido em vez de prometido
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("apagar a marca do ESTADO não apaga a memória do histórico", () => {
  /**
   * ─ A JUSTIFICATIVA DO CONSERTO 2 DIZ QUE O LADO "ESTÁ NO EVENTO". ELA ESTÁ CERTA, COM UMA
   *   PRECISÃO QUE VALE ESCREVER ────────────────────────────────────────────────────────────────
   *
   * O evento que guarda o lado é o da ENTREGA (gravado por `mudarSituacaoOcupandoPosicao` quando
   * alguém ESCOLHEU o lado, isto é, na finalização de posição). O evento da REVERSÃO não grava lado
   * nenhum, e não deveria mesmo: ele descreve uma volta à seleção, em que lado não existe.
   *
   * A CONSEQUÊNCIA PRÁTICA, e é ela que o teste afirma: a reversão NÃO acrescenta nem apaga memória.
   * Quem quiser saber de que lado a pessoa estava lê o evento da entrega, que continua intacto.
   */
  it("o evento da reversão não inventa lado, e não é um desfecho", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: ENVIO, posicaoLado: "BANCO" })],
    });

    await b.service.reverterEnvioParaAdmissao("cand-1", "user-1");

    const evento = b.eventoDe("cand-1") ?? {};
    expect(evento).not.toHaveProperty("posicaoLado");
    expect(evento.situacao).toBe(EM_SELECAO);
  });

  /** A reversão escreve UM evento só, e não apaga nenhum: o histórico anterior segue inteiro. */
  it("a reversão acrescenta um evento e não remove nenhum", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: ENVIO, posicaoLado: "BANCO" })],
    });

    await b.service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(b.inserts.filter((i) => i.tabela === asCandidaturaEtapas)).toHaveLength(1);
  });
});
