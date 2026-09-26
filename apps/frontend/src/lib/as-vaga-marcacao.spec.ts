import { describe, expect, it } from "vitest";
import { VAGA_OBRIGATORIOS } from "@ea/shared-types";
import { pendenciasComLinhaDeServico, PENDENCIA_LINHA_SERVICO } from "./as-linhas-servico";
import { ancorasObrigatorias, marcacaoDoCampo } from "./as-vaga-marcacao";

/** Um formulário com TUDO preenchido, do qual cada caso apaga só o que quer testar. */
const completo = {
  codCliente: "0001",
  codigo: "511805",
  nomeDivulgacao: "Advogada",
  cargoId: "7",
  posicoesOficiais: "10",
  natureza: "EFETIVA",
  sazonalidade: "PERMANENTE",
  linhaServicoId: "3",
  status: "ABERTA",
  dataAbertura: "2026-09-01",
  dataLimite: "2026-09-30",
};

describe("ancorasObrigatorias", () => {
  it("cobre toda a régua, a linha de serviço incluída", () => {
    const universo = ancorasObrigatorias();
    for (const p of VAGA_OBRIGATORIOS) expect(universo.has(p.ancora)).toBe(true);
    expect(universo.has(PENDENCIA_LINHA_SERVICO.ancora)).toBe(true);
  });
});

describe("marcacaoDoCampo", () => {
  it("campo da régua que está na lista de pendências fica Pendente", () => {
    const pendentes = pendenciasComLinhaDeServico({ ...completo, cargoId: "" });
    expect(marcacaoDoCampo("vaga-cargo", pendentes)).toBe("pendente");
  });

  it("campo da régua fora da lista fica Preenchido", () => {
    const pendentes = pendenciasComLinhaDeServico({ ...completo, cargoId: "" });
    expect(marcacaoDoCampo("vaga-cliente", pendentes)).toBe("preenchido");
  });

  // CAMPO QUE A RÉGUA NÃO COBRA NÃO GANHA MARCA, e isso é a trava contra o verde inventado: um
  // campo marcado `obrigatorio` no JSX e ausente da régua nunca apareceria na lista de pendências,
  // então "não está na lista" não pode, sozinho, significar "está preenchido".
  it("campo fora da régua não recebe marca", () => {
    const pendentes = pendenciasComLinhaDeServico(completo);
    expect(marcacaoDoCampo("vaga-posicoes-banco", pendentes)).toBeNull();
    expect(marcacaoDoCampo(undefined, pendentes)).toBeNull();
  });

  /**
   * ─ A INVARIANTE DA FRENTE F: A MARCAÇÃO É A LISTA DO TOPO, CAMPO A CAMPO ──────────────────────
   *
   * O defeito que esta frente existe para não criar é a lista do topo dizer uma coisa e o campo
   * dizer outra. O teste percorre a régua inteira e exige que o conjunto dos "pendente" seja
   * EXATAMENTE o conjunto das âncoras da lista, em três recortes diferentes de preenchimento.
   */
  it("o conjunto dos Pendente é exatamente a lista de pendências", () => {
    const recortes = [
      completo,
      { ...completo, codCliente: "", linhaServicoId: "", dataLimite: "" },
      // ZERO POSIÇÃO OFICIAL É VAZIO para a régua, e é o caso que uma segunda conta ("tem texto?")
      // erraria: o campo tem conteúdo e continua sendo pendência.
      { ...completo, posicoesOficiais: "0" },
      { codigo: "", codCliente: "" },
    ];
    for (const recorte of recortes) {
      const pendentes = pendenciasComLinhaDeServico(recorte);
      const esperado = new Set(pendentes.map((p) => p.ancora));
      const marcados = new Set(
        [...ancorasObrigatorias()].filter((a) => marcacaoDoCampo(a, pendentes) === "pendente"),
      );
      expect([...marcados].sort()).toEqual([...esperado].sort());
    }
  });
});
