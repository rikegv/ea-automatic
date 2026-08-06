import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { LiberarAdmissaoDto } from "../admissoes/dto/liberar-admissao.dto";
import { MAPA_GRAFIAS, normalizarTipoContrato } from "./tipo-contrato";

/**
 * TRAVA DE ENTRADA DO TIPO DE CONTRATO (incidente de 06/08/2026).
 *
 * O que estes testes seguram, e é exatamente o que custou um contrato assinado preso:
 *  - abreviação da carga CONVERTE, não é barrada (fluxo legítimo continua entrando);
 *  - grafia desconhecida é RECUSADA (não vira a 14ª grafia da base);
 *  - vazio e ausente seguem válidos (tipo é pendência da régua, não trava de liberação);
 *  - toda grafia do MAPA_GRAFIAS resolve para uma canônica, sem exceção.
 */

/** Valida um DTO do jeito que o ValidationPipe valida (transform: true), e devolve o resultado. */
function validar(payload: Record<string, unknown>) {
  const dto = plainToInstance(LiberarAdmissaoDto, {
    codCliente: "1002",
    cargoId: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    ...payload,
  });
  const erros = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, erros, mensagens: erros.flatMap((e) => Object.values(e.constraints ?? {})) };
}

describe("normalizarTipoContrato", () => {
  it("converte a abreviação da carga para a grafia canônica", () => {
    expect(normalizarTipoContrato("TERC.")).toBe("Terceirizado");
    expect(normalizarTipoContrato("TEMP.")).toBe("Temporário");
    expect(normalizarTipoContrato("APREN.")).toBe("Jovem Aprendiz");
    expect(normalizarTipoContrato("ESTA.")).toBe("Estágio");
  });

  it("tolera caixa, acento e espaço em volta", () => {
    expect(normalizarTipoContrato("temporario")).toBe("Temporário");
    expect(normalizarTipoContrato("  TEMPORÁRIO  ")).toBe("Temporário");
    expect(normalizarTipoContrato("fopag")).toBe("Fopag");
    expect(normalizarTipoContrato("terc")).toBe("Terceirizado");
  });

  it("devolve undefined para ausente e vazio: sem tipo é estado legítimo", () => {
    expect(normalizarTipoContrato(undefined)).toBeUndefined();
    expect(normalizarTipoContrato(null)).toBeUndefined();
    expect(normalizarTipoContrato("   ")).toBeUndefined();
  });

  it("devolve null para grafia desconhecida, que é o que aciona a recusa", () => {
    expect(normalizarTipoContrato("PJ")).toBeNull();
    expect(normalizarTipoContrato("Efetivo")).toBeNull();
    expect(normalizarTipoContrato("ESTA. FOPAG")).toBeNull(); // ambígua de propósito
  });

  it("toda grafia do mapa tem destino canônico", () => {
    for (const grafia of Object.keys(MAPA_GRAFIAS)) {
      expect(normalizarTipoContrato(grafia)).toBe(MAPA_GRAFIAS[grafia]);
    }
  });
});

describe("DTO com a trava (LiberarAdmissaoDto)", () => {
  it("ACEITA a abreviação e grava a canônica", () => {
    const { erros, dto } = validar({ tipoContrato: "TERC." });
    expect(erros).toHaveLength(0);
    expect(dto.tipoContrato).toBe("Terceirizado");
  });

  it("ACEITA a canônica sem mexer nela", () => {
    const { erros, dto } = validar({ tipoContrato: "Jovem Aprendiz" });
    expect(erros).toHaveLength(0);
    expect(dto.tipoContrato).toBe("Jovem Aprendiz");
  });

  it("RECUSA grafia desconhecida, com a lista do que vale na mensagem", () => {
    const { erros, mensagens } = validar({ tipoContrato: "PJ" });
    expect(erros.length).toBeGreaterThan(0);
    expect(mensagens.join(" ")).toContain("Temporário");
  });

  it("ACEITA ausência do campo: liberar sem tipo continua valendo", () => {
    const { erros, dto } = validar({});
    expect(erros).toHaveLength(0);
    expect(dto.tipoContrato).toBeUndefined();
  });
});
