import { describe, expect, it } from "vitest";
import {
  FABRICIO_FORA_DO_LOTE,
  entraNoLoteDeReprocesso,
} from "./portal-reprocesso-lote";

/** A régua do lote: quem entra no reprocesso ao prontuário, e as exclusões que protegem a meta. */
describe("entraNoLoteDeReprocesso", () => {
  const vivo = { admissaoId: "adm-viva", farolGlobal: "EM_ADMISSAO", confirmado: true, reprovado: false };

  it("entra: admissão viva, objeto confirmado e não reprovado", () => {
    expect(entraNoLoteDeReprocesso(vivo)).toBe(true);
  });

  it("entra: BANCO_AGUARDAR também é viva", () => {
    expect(entraNoLoteDeReprocesso({ ...vivo, farolGlobal: "BANCO_AGUARDAR" })).toBe(true);
  });

  it("NÃO entra: objeto não confirmado (chegada não provada)", () => {
    expect(entraNoLoteDeReprocesso({ ...vivo, confirmado: false })).toBe(false);
  });

  it("NÃO entra: objeto reprovado pela IA", () => {
    expect(entraNoLoteDeReprocesso({ ...vivo, reprovado: true })).toBe(false);
  });

  it("NÃO entra: Fabricio (resolvido à mão, fora do lote por decisão)", () => {
    expect(entraNoLoteDeReprocesso({ ...vivo, admissaoId: FABRICIO_FORA_DO_LOTE })).toBe(false);
  });

  it("NÃO entra: DECLINOU (§A.16, encerrado não tem prontuário ativo)", () => {
    expect(entraNoLoteDeReprocesso({ ...vivo, farolGlobal: "DECLINOU" })).toBe(false);
  });

  it("NÃO entra: RESCISAO (§A.16)", () => {
    expect(entraNoLoteDeReprocesso({ ...vivo, farolGlobal: "RESCISAO" })).toBe(false);
  });
});
