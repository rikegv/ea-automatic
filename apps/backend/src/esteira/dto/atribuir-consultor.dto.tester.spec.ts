import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { AtribuirConsultorDto, AtribuirConsultorLoteDto } from "./atribuir-consultor.dto";

/**
 * Atribuição do consultor responsável (OST ajustes, Onda 2). A régua do diretor na borda: a ação é
 * do Master (gate no controller), e aqui provamos o formato — frente válida, ids de verdade, e o
 * `consultorId` que aceita `null` (desatribuir) mas recusa lixo.
 */

const CONS = "11111111-1111-4111-8111-111111111111";
const ID1 = "22222222-2222-4222-8222-222222222222";
const ID2 = "33333333-3333-4333-8333-333333333333";

function erros(cls: unknown, payload: unknown): string[] {
  const dto = plainToInstance(cls as never, payload);
  return validateSync(dto as object, { whitelist: true }).flatMap((e) =>
    Object.keys(e.constraints ?? {}),
  );
}

describe("AtribuirConsultorDto (individual)", () => {
  it("aceita um UUID de consultor", () => {
    expect(erros(AtribuirConsultorDto, { consultorId: CONS })).toEqual([]);
  });
  it("aceita null (desatribuir)", () => {
    expect(erros(AtribuirConsultorDto, { consultorId: null })).toEqual([]);
  });
  it("recusa um consultor que não é UUID", () => {
    expect(erros(AtribuirConsultorDto, { consultorId: "fulano" })).toContain("isUuid");
  });
});

describe("AtribuirConsultorLoteDto (em massa)", () => {
  it("aceita frente válida, dois ids e um consultor", () => {
    expect(
      erros(AtribuirConsultorLoteDto, { frente: "auditoria", admissaoIds: [ID1, ID2], consultorId: CONS }),
    ).toEqual([]);
  });

  it("aceita uma só admissão (a régua de massa é do botão, não do formato)", () => {
    expect(
      erros(AtribuirConsultorLoteDto, { frente: "exame", admissaoIds: [ID1], consultorId: CONS }),
    ).toEqual([]);
  });

  it("recusa frente fora de auditoria/exame/cadastro", () => {
    expect(
      erros(AtribuirConsultorLoteDto, { frente: "integracao", admissaoIds: [ID1], consultorId: CONS }),
    ).toContain("isIn");
  });

  it("recusa lista vazia e ids que não são UUID", () => {
    expect(
      erros(AtribuirConsultorLoteDto, { frente: "cadastro", admissaoIds: [], consultorId: CONS }),
    ).toContain("arrayMinSize");
    expect(
      erros(AtribuirConsultorLoteDto, { frente: "cadastro", admissaoIds: ["x"], consultorId: CONS }),
    ).toContain("isUuid");
  });

  it("aceita consultorId null no lote (desatribuição em massa)", () => {
    expect(
      erros(AtribuirConsultorLoteDto, { frente: "auditoria", admissaoIds: [ID1, ID2], consultorId: null }),
    ).toEqual([]);
  });
});
