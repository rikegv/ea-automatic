import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TESTER INDEPENDENTE (§A.38, §A.40 regra 2). Regras permanentes de UI aplicadas aos componentes do
 * CRUD da vaga liberada (o modal de exclusão novo e o modo `edicao` do `TrilhaDaVaga`), lidas pelo
 * REQUISITO, sem depender de como a tela foi montada:
 *
 *  - §A.11: o travessão (U+2014) é PROIBIDO no arquivo inteiro, comentário incluído (os dois
 *    arquivos que a frente toca hoje têm ZERO, e é essa a régua que se mantém);
 *  - §A.35: nenhum `<select>` nativo;
 *  - §A.41: o modal de exclusão tem saída visível ("Cancelar").
 */

const AQUI = __dirname;
const ARQUIVOS = ["ExcluirVagaModal.tsx", "TrilhaDaVaga.tsx", "VagaPainelModal.tsx"] as const;
const TRAVESSAO = "—";

const ler = (nome: string): string => readFileSync(join(AQUI, nome), "utf8");

describe("CRUD da vaga liberada: regras de UI", () => {
  it("o modal de exclusão existe com o nome combinado", () => {
    expect(existsSync(join(AQUI, "ExcluirVagaModal.tsx"))).toBe(true);
  });

  for (const nome of ARQUIVOS) {
    it(`${nome}: sem travessão U+2014 (§A.11)`, () => {
      const linhas = ler(nome)
        .split("\n")
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => l.includes(TRAVESSAO))
        .map(([n]) => n);
      expect(linhas, `linhas com travessão em ${nome}`).toEqual([]);
    });

    it(`${nome}: sem <select> nativo (§A.35)`, () => {
      const semComentario = ler(nome).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
      expect(semComentario).not.toMatch(/<select[\s>]/);
    });
  }

  it("ExcluirVagaModal: tem botão Cancelar (§A.41, modal não fica sem saída)", () => {
    expect(ler("ExcluirVagaModal.tsx")).toMatch(/Cancelar/);
  });
});
