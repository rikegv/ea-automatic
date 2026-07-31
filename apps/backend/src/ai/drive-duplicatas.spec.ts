import { describe, expect, it } from "vitest";
import { csvIds, duplicatasAcesas, listaIds } from "./drive-duplicatas";

/**
 * A REGRA QUE ESTE TESTE TRAVA (decisão do diretor). Ele baixou o sinal das pastas duplicadas SEM
 * apagá-las no Drive: assume a remoção manual e não quer o aviso aceso no meio tempo. Como o sinal é
 * derivado (todo arquivamento e toda reconciliação reconferem o Drive e regravam o que acharam), sem
 * memória do que foi baixado o aviso voltaria na primeira varredura e desfaria a decisão dele.
 */
describe("duplicatas do Drive: o que ainda acende", () => {
  it("duplicata baixada pelo diretor NÃO reacende (a pasta continua no Drive)", () => {
    expect(duplicatasAcesas(["pastaA", "pastaB"], "pastaA,pastaB")).toEqual([]);
  });

  it("duplicata NOVA acende, mesmo com outras já baixadas: sobre ela ninguém decidiu", () => {
    expect(duplicatasAcesas(["pastaA", "pastaNova"], "pastaA")).toEqual(["pastaNova"]);
  });

  it("sem nada baixado, tudo o que o Drive achou acende (comportamento original)", () => {
    expect(duplicatasAcesas(["pastaA", "pastaB"], null)).toEqual(["pastaA", "pastaB"]);
  });

  it("preserva a ordem de quem encontrou e não repete id", () => {
    expect(duplicatasAcesas(["pastaB", "pastaA", "pastaB"], "")).toEqual(["pastaB", "pastaA"]);
  });

  it("lista vazia vira null na coluna: ausência de sinal, não string vazia", () => {
    expect(csvIds([])).toBeNull();
    expect(csvIds(["pastaA", "pastaB"])).toBe("pastaA,pastaB");
  });

  it("a leitura da coluna tolera nulo, vazio e espaço", () => {
    expect(listaIds(null)).toEqual([]);
    expect(listaIds("")).toEqual([]);
    expect(listaIds(" pastaA , pastaB ")).toEqual(["pastaA", "pastaB"]);
  });
});
