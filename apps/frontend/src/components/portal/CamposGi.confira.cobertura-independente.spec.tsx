// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CampoExtraidoPortal } from "@ea/shared-types";
import { ConferenciaDocumento } from "./CamposGi";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), escrito A PARTIR DO REQUISITO da REPAGINAÇÃO do Portal, ANTES
 * do código, em paralelo à construção. Rodado agora, os casos do realce FALHAM, porque a derivação
 * ainda não existe na tela, e isso é o esperado: o teste diz o que a repaginação tem de entregar.
 *
 * ┌─ A REGRA DO "CONFIRA", derivada na TELA (não é dado, é realce) ──────────────────────────────┐
 * │ Um campo que a IA LEU (`lido=true`) mas com CONFIANÇA ABAIXO DO LIMIAR (0.85) ganha o realce  │
 * │ "confira" (coral): a IA leu, mas não com certeza, então o candidato deve olhar com atenção.   │
 * │ O realce é SÓ apresentação:                                                                    │
 * │   1. o campo continua EDITÁVEL (o realce nunca bloqueia a edição, veto do motor);             │
 * │   2. NÃO altera o valor submetido (não editado sai byte a byte como veio);                    │
 * │   3. NÃO persiste nada (é derivado na tela a cada render, some se a confiança subir).         │
 * │ Um campo lido com CONFIANÇA ALTA (>= 0.85) NÃO recebe o realce: veio bem lido, é conferência  │
 * │ comum. Um campo NÃO lido é outro realce (atenção/âmbar) e não é o alvo deste arquivo.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MARCADOR AFIRMÁVEL: o realce "confira" expõe `aria-invalid="true"` no input do campo (o mesmo
 * sinal semântico que o protótipo do Designer usa em `designer/Documento.tsx` para "confira"), e o
 * campo bem lido NÃO expõe. É por esse atributo, e não por classe/cor de hex, que o teste afirma o
 * realce: a paleta da repaginação pode mudar o coral, o SINAL de "olhe este campo" não pode sumir.
 *
 * §A.6: fixtures sintéticos, nenhum dado real. §A.11: sem travessão.
 */

afterEach(cleanup);

const LIMIAR = 0.85;

function campo(parcial: Partial<CampoExtraidoPortal> & { campo: string }): CampoExtraidoPortal {
  return {
    campo: parcial.campo,
    rotulo: parcial.rotulo ?? parcial.campo,
    valor: parcial.valor ?? "",
    confianca: parcial.confianca ?? 0.9,
    lido: parcial.lido ?? true,
  };
}

function montar(campos: CampoExtraidoPortal[], jaConfirmados: Record<string, string> = {}) {
  const aoConfirmar = vi.fn(async () => true);
  render(
    <ConferenciaDocumento
      nomeDocumento="RG"
      campos={campos}
      jaConfirmados={jaConfirmados}
      aoConfirmar={aoConfirmar}
      aoAvancar={() => {}}
      temProximo={false}
    />,
  );
  return { aoConfirmar };
}

const inputDe = (rotulo: RegExp) =>
  screen.getByRole("textbox", { name: rotulo }) as HTMLInputElement;

async function submeter(aoConfirmar: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: /Confirmar|Concluir|Continuar/i }));
  await waitFor(() => expect(aoConfirmar).toHaveBeenCalled());
  return aoConfirmar.mock.calls[0][0] as Array<{ campo: string; valor: string }>;
}
const valorDe = (p: Array<{ campo: string; valor: string }>, c: string) =>
  p.find((x) => x.campo === c)?.valor;

const BAIXA = campo({ campo: "rgOrgao", rotulo: "Orgao emissor", valor: "SSP", confianca: 0.5, lido: true });
const ALTA = campo({ campo: "rgNumero", rotulo: "Numero do RG", valor: "123456789", confianca: 0.97, lido: true });

describe("REQUISITO: campo lido com confiança BAIXA recebe o realce 'confira'", () => {
  it("um campo lido com confiança 0.5 expõe aria-invalid='true'", () => {
    montar([BAIXA]);
    expect(inputDe(/Orgao emissor/i).getAttribute("aria-invalid")).toBe("true");
  });

  it("um campo lido com confiança ALTA (0.97) NÃO recebe o realce", () => {
    montar([ALTA]);
    const aria = inputDe(/Numero do RG/i).getAttribute("aria-invalid");
    expect(aria === null || aria === "false").toBe(true);
  });

  it("no mesmo documento, só o de confiança baixa é realçado", () => {
    montar([BAIXA, ALTA]);
    expect(inputDe(/Orgao emissor/i).getAttribute("aria-invalid")).toBe("true");
    const alta = inputDe(/Numero do RG/i).getAttribute("aria-invalid");
    expect(alta === null || alta === "false").toBe(true);
  });
});

describe("REQUISITO: o limiar é 0.85, e 'abaixo' é estritamente menor", () => {
  it("exatamente 0.85 NÃO é confira: não está abaixo do limiar", () => {
    montar([campo({ campo: "pis", rotulo: "Numero do PIS", valor: "12345678901", confianca: LIMIAR, lido: true })]);
    const aria = inputDe(/Numero do PIS/i).getAttribute("aria-invalid");
    expect(aria === null || aria === "false").toBe(true);
  });

  it("logo abaixo do limiar (0.84) É confira", () => {
    montar([campo({ campo: "pis", rotulo: "Numero do PIS", valor: "12345678901", confianca: 0.84, lido: true })]);
    expect(inputDe(/Numero do PIS/i).getAttribute("aria-invalid")).toBe("true");
  });
});

describe("REQUISITO: o realce é SÓ apresentação, não muda o dado nem trava a edição", () => {
  it("o campo em confira continua EDITÁVEL (não fica disabled)", () => {
    montar([BAIXA]);
    const input = inputDe(/Orgao emissor/i);
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "SSP-SP" } });
    expect(input.value).toBe("SSP-SP");
  });

  it("não editado, o campo em confira é submetido com o valor ORIGINAL, byte a byte", async () => {
    const { aoConfirmar } = montar([BAIXA, ALTA]);
    const payload = await submeter(aoConfirmar);
    // O realce coral não remexe o valor: SSP e o número saem exatamente como vieram.
    expect(valorDe(payload, "rgOrgao")).toBe("SSP");
    expect(valorDe(payload, "rgNumero")).toBe("123456789");
    // E o realce não adiciona nem remove campo do envio.
    expect(payload.map((c) => c.campo).sort()).toEqual(["rgNumero", "rgOrgao"]);
  });

  it("data lida com confiança baixa: exibe BR, é confira, e sai em ISO original no submit", async () => {
    const dataBaixa = campo({
      campo: "rgDataEmissao",
      rotulo: "Data de emissao",
      valor: "2015-03-14",
      confianca: 0.4,
      lido: true,
    });
    const { aoConfirmar } = montar([dataBaixa]);
    const input = inputDe(/Data de emissao/i);
    expect(input.value).toBe("14/03/2015"); // display BR (invariante de data preservada)
    expect(input.getAttribute("aria-invalid")).toBe("true"); // realce confira
    const payload = await submeter(aoConfirmar);
    expect(valorDe(payload, "rgDataEmissao")).toBe("2015-03-14"); // submit ISO byte a byte
    expect(valorDe(payload, "rgDataEmissao")).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});
