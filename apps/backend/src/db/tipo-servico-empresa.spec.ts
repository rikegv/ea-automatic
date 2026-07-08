import { describe, expect, it } from "vitest";
import { tipoServicoDeEmpresa } from "./seed-clientes-atualizada";

/**
 * Regra do diretor (OST estrutural): código "Empresa" da base → tipo de serviço.
 * 1,3=TEMPORARIO · 2=TERCEIRO · 4=ESTAGIO · 5,6=INTERNO · >6=FOPAG (documento = CNPJ do cliente).
 */
describe("tipoServicoDeEmpresa", () => {
  it.each([
    ["1", "TEMPORARIO"],
    ["3", "TEMPORARIO"],
    ["2", "TERCEIRO"],
    ["4", "ESTAGIO"],
    ["5", "INTERNO"],
    ["6", "INTERNO"],
    ["7", "FOPAG"],
    ["8", "FOPAG"],
    ["44", "FOPAG"],
  ])("empresa %s → %s", (codigo, esperado) => {
    expect(tipoServicoDeEmpresa(codigo)).toBe(esperado);
  });
});
