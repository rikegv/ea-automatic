import { describe, expect, it } from "vitest";
import {
  DE_PARA_GI_VAZIO,
  codigoFuncionarioSinteticoGi,
  montarFuncionarioSelecao,
} from "../domain/portal-dados-gi";
import { PESSOA, contratacaoDeFolhaCompleta } from "./gi-automatico.arnes";

/**
 * CORREÇÃO DO PAYLOAD DO G.I (suporte do G.I, Gilberto, 16/10/2026), dois pontos:
 *
 *  1. `inclusaoOK` TEM DE SAIR SEMPRE `true`. O G.I roda uma rotina de LIMPEZA no primeiro acesso do dia
 *     que APAGA os registros com `inclusaoOK = 0` (false). O EA OMITIA o campo, ele chegava `false` (o
 *     default do contrato) e as pré-admissões eram varridas toda manhã (o "sumiço" das listas). É campo
 *     SEPARADO do `apiSincAdmissaoDigital` (§A.48): aquele decide a PROMOÇÃO, este a PERMANÊNCIA.
 *  2. `codigoFuncionario` TEM DE TER NO MÁXIMO 6 DÍGITOS. O EA mandava 10 (faixa `[1e9, 2e9)`), medido na
 *     chave da Tatiana `001-004-1246128578`, e os registros não casavam. A faixa passou a `[1e5, 1e6)`.
 *
 * Esta trava garante que nenhuma refatoração futura reintroduza `inclusaoOK` ausente/`false` nem o
 * `codigoFuncionario` de 10 dígitos.
 */
describe("payload do G.I: inclusaoOK sempre true + codigoFuncionario de 6 dígitos", () => {
  const opcoesReais = {
    apiSincAdmissaoDigital: false,
    codigoFuncionario: codigoFuncionarioSinteticoGi("cb615057-5029-4bd5-9997-d68b60f93ddc"),
  };

  it("inclusaoOK sai SEMPRE true, mesmo no payload mínimo", () => {
    const f = montarFuncionarioSelecao({} as never);
    expect(f.inclusaoOK).toBe(true);
  });

  it("inclusaoOK sai true no payload completo, e não depende de opcoes", () => {
    const cheio = montarFuncionarioSelecao(
      PESSOA,
      DE_PARA_GI_VAZIO,
      contratacaoDeFolhaCompleta(),
      opcoesReais,
    );
    expect(cheio.inclusaoOK).toBe(true);
    // ainda que alguém tente mexer no sincronismo, a inclusão não muda (campos distintos do contrato)
    const comApiSincTrue = montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, contratacaoDeFolhaCompleta(), {
      apiSincAdmissaoDigital: true,
      codigoFuncionario: 123456,
    });
    expect(comApiSincTrue.inclusaoOK).toBe(true);
  });

  it("codigoFuncionario sintético tem EXATAMENTE 6 dígitos, para muitos ids diferentes", () => {
    const ids = [
      "4e0ea210-88ac-43d7-afd1-1ce3c56f6d4d",
      "cb615057-5029-4bd5-9997-d68b60f93ddc",
      "5abd6681-836f-4bdf-ab2e-303f04b6754f",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "11111111-2222-3333-4444-555555555555",
    ];
    for (const id of ids) {
      const cod = codigoFuncionarioSinteticoGi(id);
      expect(Number.isInteger(cod)).toBe(true);
      expect(cod).toBeGreaterThanOrEqual(100_000);
      expect(cod).toBeLessThanOrEqual(999_999);
      expect(String(cod)).toHaveLength(6);
    }
  });

  it("codigoFuncionario sintético é ESTÁVEL por admissão (reenviar não cria chave nova)", () => {
    const id = "cb615057-5029-4bd5-9997-d68b60f93ddc";
    expect(codigoFuncionarioSinteticoGi(id)).toBe(codigoFuncionarioSinteticoGi(id));
  });
});
