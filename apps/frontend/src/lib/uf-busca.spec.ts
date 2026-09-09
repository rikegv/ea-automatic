import { describe, expect, it } from "vitest";
import { UFS } from "@ea/shared-types";

/** Normaliza igual ao Select: minúsculas, sem acento. */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const opcoes = UFS.map((u) => ({ value: u.uf, label: u.uf, busca: u.nome }));
const filtra = (q: string) =>
  opcoes.filter(
    (o) => norm(o.label).includes(norm(q)) || norm(o.busca ?? "").includes(norm(q)),
  );

describe("UF: mostra a sigla e continua achando pelo nome", () => {
  it("a opção exibida é SÓ a sigla", () => {
    expect(opcoes.find((o) => o.value === "SP")?.label).toBe("SP");
  });

  it('procurar por "SP" acha São Paulo', () => {
    expect(filtra("SP").map((o) => o.value)).toContain("SP");
  });

  it('procurar por "São Paulo" continua achando, que é o que quebrou', () => {
    expect(filtra("São Paulo").map((o) => o.value)).toEqual(["SP"]);
  });

  it('procurar sem acento, "sao paulo", também acha', () => {
    expect(filtra("sao paulo").map((o) => o.value)).toEqual(["SP"]);
  });
});
