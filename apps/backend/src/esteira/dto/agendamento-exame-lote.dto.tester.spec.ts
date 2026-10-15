import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { AgendamentoExameLoteDto } from "./agendamento-exame.dto";

/**
 * O lote do exame (OST das ondas, Onda 3) herda os campos do agendamento individual e acrescenta a
 * lista de admissões. A régua do diretor, provada na borda: "agendar em massa" exige MAIS DE UM
 * selecionado, e os campos do agendamento continuam obrigatórios (data, endereços, previsão do ASO).
 */

const ENDERECO_OK = { clinicaId: "11111111-1111-4111-8111-111111111111", local: "Centro", horario: "09:00" };
const BASE = {
  data: "2026-08-18",
  enderecos: [ENDERECO_OK],
  previsaoAso: "2026-08-25",
};
const ID1 = "22222222-2222-4222-8222-222222222222";
const ID2 = "33333333-3333-4333-8333-333333333333";

function erros(payload: unknown) {
  const dto = plainToInstance(AgendamentoExameLoteDto, payload);
  return validateSync(dto, { whitelist: true }).flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe("AgendamentoExameLoteDto", () => {
  it("aceita dois ou mais candidatos com os campos do agendamento preenchidos", () => {
    expect(erros({ ...BASE, admissaoIds: [ID1, ID2] })).toEqual([]);
  });

  it("recusa UM só candidato: agendar em massa é para MAIS DE UM", () => {
    const e = erros({ ...BASE, admissaoIds: [ID1] });
    expect(e).toContain("arrayMinSize");
  });

  it("recusa lista vazia e ids que não são UUID", () => {
    expect(erros({ ...BASE, admissaoIds: [] })).toContain("arrayMinSize");
    expect(erros({ ...BASE, admissaoIds: ["a", "b"] })).toContain("isUuid");
  });

  it("continua exigindo os campos do agendamento (previsão do ASO obrigatória)", () => {
    const semPrevisao = { data: BASE.data, enderecos: BASE.enderecos, admissaoIds: [ID1, ID2] };
    expect(erros(semPrevisao)).toContain("isDateString");
  });
});
