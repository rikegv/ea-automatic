import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { VagaFolhaInputDto } from "./create-admissao.dto";

/**
 * Validação do campo `salario` no DTO real, do jeito que o ValidationPipe global roda (transform +
 * validate). Prova o Bloco 2: formato válido normaliza e passa; inválido é barrado ANTES do banco
 * (vira 400), nunca 22P02/"Erro ao liberar".
 */
function validar(salario: unknown) {
  const dto = plainToInstance(VagaFolhaInputDto, { salario });
  const erros = validateSync(dto, { whitelist: true });
  return { dto, erros };
}

describe("VagaFolhaInputDto.salario — validação real (Bloco 2)", () => {
  it.each([
    ["2500", "2500.00"],
    ["2500,00", "2500.00"],
    ["2.500,00", "2500.00"],
    ["R$ 2.500,00", "2500.00"],
    ["2 500,00", "2500.00"],
    ["2.500", "2500.00"],
  ])("aceita '%s' e normaliza para '%s'", (entrada, canonico) => {
    const { dto, erros } = validar(entrada);
    expect(erros).toHaveLength(0);
    expect(dto.salario).toBe(canonico);
  });

  it("campo ausente/vazio é opcional (não bloqueia, vira pendência)", () => {
    expect(validar(undefined).erros).toHaveLength(0);
    expect(validar("").erros).toHaveLength(0);
    expect(validar(undefined).dto.salario).toBeUndefined();
  });

  it.each(["abc", "R$ dez mil", "1,2,3", "-2500", "2.500.reais"])(
    "REJEITA '%s' com mensagem clara (400, não 500)",
    (entrada) => {
      const { erros } = validar(entrada);
      expect(erros.length).toBeGreaterThan(0);
      const msg = JSON.stringify(erros[0].constraints);
      expect(msg).toMatch(/Salário inválido/i);
    },
  );
});
