import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { VagaFolhaInputDto } from "./create-admissao.dto";
import { normalizarSalarioParaDto } from "./valor-monetario-br";

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

/**
 * FORMA CANÔNICA DA API (OST do salário que "desconfigurava"). O caso real: o lápis do Gerenciador
 * carregava no campo o valor CRU do banco ("1806.00") e, ao salvar, o ponto era lido como separador
 * de milhar. O salário virava 180600,00 a cada salvamento, e a base acumulou 19 admissões assim.
 */
describe("forma canônica (o valor que a própria API devolve)", () => {
  it.each([
    ["1806.00", "1806.00"],
    ["472200.00", "472200.00"],
    ["2500.50", "2500.50"],
    ["1963.12", "1963.12"],
  ])("%s NÃO é multiplicado por 100 (ponto com 2 casas é decimal)", (entrada, esperado) => {
    expect(normalizarSalarioParaDto(entrada)).toBe(esperado);
  });

  it("a regra pt-BR do milhar continua valendo: ponto com TRÊS dígitos é milhar", () => {
    // É o desempate: milhar em pt-BR tem sempre três dígitos, decimal tem um ou dois.
    expect(normalizarSalarioParaDto("2.500")).toBe("2500.00");
    expect(normalizarSalarioParaDto("2.500,00")).toBe("2500.00");
    expect(normalizarSalarioParaDto("19.630,00")).toBe("19630.00");
  });

  it("salvar duas vezes seguidas dá o MESMO valor (idempotência, que era o defeito)", () => {
    const uma = normalizarSalarioParaDto("1806,00");
    expect(uma).toBe("1806.00");
    // O que a tela recarrega depois de salvar é exatamente `uma`; salvar de novo não pode mudar nada.
    expect(normalizarSalarioParaDto(uma)).toBe("1806.00");
    expect(normalizarSalarioParaDto(normalizarSalarioParaDto(uma))).toBe("1806.00");
  });
});
