import { describe, expect, it, vi } from "vitest";
import { nascerCadastroEIntegracao } from "./nascimento-cadastro";
import { frentesAdmissao } from "../db/schema";

/**
 * ITEM 1 DA OST DOS 3 AJUSTES — a Integração nasce JUNTO com o Cadastro.
 *
 * O que este arquivo trava é a porta única. O Cadastro nasce em TRÊS caminhos (status manual,
 * auto-conclusão da Auditoria pela I.A e conclusão do Exame pelo ASO), e a §A.26 nasceu justamente
 * de um deles ter sido esquecido numa mudança anterior. Testar a função é testar os três de uma vez.
 */

/** Fake do insert do Drizzle: registra o que foi inserido e devolve o id de uma frente nova. */
function montar(opts: { conflita?: boolean } = {}) {
  const inseridos: Record<string, unknown>[] = [];
  const tx = {
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inseridos.push(v);
        return {
          onConflictDoNothing: () => ({
            // `conflita` simula a frente que JÁ existia: o Postgres engole o insert e o
            // `returning` volta vazio, que é o caminho do relê.
            returning: async () => (opts.conflita ? [] : [{ id: `f-${v.tipo}` }]),
          }),
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({ where: async () => [{ id: "cadastro-existente" }] }),
    })),
  };
  return { tx, inseridos };
}

const AGORA = new Date("2026-08-18T12:00:00Z");

describe("nascerCadastroEIntegracao", () => {
  it("cliente que EXIGE integração: nascem as DUAS frentes, na mesma chamada", async () => {
    const { tx, inseridos } = montar();

    const r = await nascerCadastroEIntegracao(tx as never, {
      admissaoId: "a1",
      agora: AGORA,
      exigeIntegracao: true,
    });

    expect(inseridos.map((i) => i.tipo)).toEqual(["CADASTRO_CONTRATO", "INTEGRACAO"]);
    expect(r.integracaoNasceu).toBe(true);
    expect(r.cadastroId).toBe("f-CADASTRO_CONTRATO");
  });

  it("a Integração nasce IGUAL a qualquer outra: A_AGENDAR, aberta, sem marcação nenhuma", async () => {
    const { tx, inseridos } = montar();

    await nascerCadastroEIntegracao(tx as never, {
      admissaoId: "a1",
      agora: AGORA,
      exigeIntegracao: true,
    });

    // Nada de campo extra que a distinga de quem chegou pelo caminho antigo: quem olha a fila não
    // consegue dizer por qual porta a pessoa entrou, que é exatamente o pedido do diretor.
    expect(inseridos[1]).toEqual({
      admissaoId: "a1",
      tipo: "INTEGRACAO",
      status: "A_AGENDAR",
      concluida: false,
      dataInicio: AGORA,
    });
  });

  it("cliente que NÃO exige: nasce SÓ o Cadastro, e a Integração não é sequer tentada", async () => {
    const { tx, inseridos } = montar();

    const r = await nascerCadastroEIntegracao(tx as never, {
      admissaoId: "a1",
      agora: AGORA,
      exigeIntegracao: false,
    });

    expect(inseridos.map((i) => i.tipo)).toEqual(["CADASTRO_CONTRATO"]);
    expect(r.integracaoNasceu).toBe(false);
    // É esta metade que mantém o carimbo `concluiSemIntegracao` alcançável na conclusão do Cadastro.
  });

  it("as duas frentes usam `onConflictDoNothing`: dois cliques simultâneos não duplicam", async () => {
    const { tx } = montar({ conflita: true });

    const r = await nascerCadastroEIntegracao(tx as never, {
      admissaoId: "a1",
      agora: AGORA,
      exigeIntegracao: true,
    });

    // Conflito nas duas: nada nasceu de novo, e o id do Cadastro vem da releitura, não de um erro.
    expect(r.integracaoNasceu).toBe(false);
    expect(r.cadastroId).toBe("cadastro-existente");
  });

  it("o alvo do conflito é o unique (admissão + tipo), não a chave primária", async () => {
    const alvos: unknown[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: () => ({
          onConflictDoNothing: (cfg: { target: unknown[] }) => {
            alvos.push(cfg.target);
            return { returning: async () => [{ id: "f1" }] };
          },
        }),
      })),
    };

    await nascerCadastroEIntegracao(tx as never, {
      admissaoId: "a1",
      agora: AGORA,
      exigeIntegracao: true,
    });

    for (const alvo of alvos) {
      expect(alvo).toEqual([frentesAdmissao.admissaoId, frentesAdmissao.tipo]);
    }
    expect(alvos).toHaveLength(2);
  });
});
