import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { BeneficioAlocadoDto } from "./create-admissao.dto";

/**
 * Validação do campo `valor` do benefício (VR/VA e afins) no DTO real, do jeito que o ValidationPipe
 * global roda (transform + validate). Prova a OST do VR: o valor do benefício passa a ter a MESMA
 * tolerância pt-BR do salário (reusa `parseValorBR`), então "44", "44,00" e "R$ 44,00" chegam iguais,
 * e valor inválido vira 400 claro, nunca 500. Um `beneficioId` válido é fixado para isolar o `valor`.
 */
const BENEFICIO_ID = "11111111-1111-1111-1111-111111111111";

function validar(valor: unknown) {
  const dto = plainToInstance(BeneficioAlocadoDto, { beneficioId: BENEFICIO_ID, valor });
  const erros = validateSync(dto, { whitelist: true });
  const errosValor = erros.filter((e) => e.property === "valor");
  return { dto, erros, errosValor };
}

describe("BeneficioAlocadoDto.valor, tolerância pt-BR (OST do VR)", () => {
  it.each([
    ["44", 44],
    ["44,00", 44],
    ["R$ 44,00", 44],
    ["2.500,00", 2500],
    ["2 500,00", 2500],
    ["0", 0],
    ["0,00", 0],
  ])("aceita '%s' e normaliza para %s", (entrada, canonico) => {
    const { dto, errosValor } = validar(entrada);
    expect(errosValor).toHaveLength(0);
    expect(dto.valor).toBe(canonico);
  });

  it("aceita number direto (memória do pacote já vem numérica)", () => {
    const { dto, errosValor } = validar(44);
    expect(errosValor).toHaveLength(0);
    expect(dto.valor).toBe(44);
  });

  it("campo ausente/vazio é opcional (benefício sem valor, ex.: Seguro de vida)", () => {
    expect(validar(undefined).errosValor).toHaveLength(0);
    expect(validar("").errosValor).toHaveLength(0);
    expect(validar(undefined).dto.valor).toBeUndefined();
  });

  it.each(["abc", "R$ dez", "1,2,3", "-44", "44,reais"])(
    "REJEITA '%s' com mensagem clara (400, não 500)",
    (entrada) => {
      const { errosValor } = validar(entrada);
      expect(errosValor.length).toBeGreaterThan(0);
      const msg = JSON.stringify(errosValor[0].constraints);
      expect(msg).toMatch(/Valor do benefício inválido|não pode ser negativo/i);
    },
  );
});
