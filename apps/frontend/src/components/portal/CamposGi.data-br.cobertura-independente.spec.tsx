// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CampoExtraidoPortal } from "@ea/shared-types";
import { ConferenciaDocumento } from "./CamposGi";

/**
 * TESTER INDEPENDENTE (§A.38), escrito A PARTIR DO REQUISITO, em paralelo à construção.
 *
 * AJUSTE 1 do Portal (data em `DD/MM/AAAA`) é DISPLAY-ONLY e vive no FRONTEND (veto do `seguranca`).
 * Aqui está a prova COMPORTAMENTAL na `ConferenciaDocumento`, a peça onde o candidato VÊ o que a IA
 * leu e CONFIRMA. A régua, do requisito:
 *
 *  1. o candidato VÊ a data em BR (`14/03/2015`) no campo;
 *  2. o que é SUBMETIDO é sempre ISO: campo de data NÃO editado sai com o ISO ORIGINAL, byte a byte
 *     (o G.I não muda); campo EDITADO sai em ISO canônico; o que NÃO é data passa intacto;
 *  3. o bloco "Você Já Confirmou" EXIBE em BR;
 *  4. o ponto que TRAVA a frente: NUNCA sai `DD/MM/AAAA` no que é submetido/persistido.
 *
 * §A.6: fixtures sintéticos. §A.11: sem travessão.
 */

afterEach(cleanup);

function campo(parcial: Partial<CampoExtraidoPortal> & { campo: string }): CampoExtraidoPortal {
  return {
    campo: parcial.campo,
    rotulo: parcial.rotulo ?? parcial.campo,
    valor: parcial.valor ?? "",
    confianca: parcial.confianca ?? 0.9,
    lido: parcial.lido ?? true,
  };
}

const DATA = campo({ campo: "rgDataEmissao", rotulo: "Data de emissao do RG", valor: "2015-03-14" });
const NOME = campo({ campo: "nomeMae", rotulo: "Nome da mae", valor: "Maria Simulada" });

const BR = /^\d{2}\/\d{2}\/\d{4}$/;

function montar(
  campos: CampoExtraidoPortal[],
  jaConfirmados: Record<string, string> = {},
) {
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

const botaoConfirmar = () => screen.getByRole("button", { name: /Confirmar|Concluir|Continuar/i });

async function submeter(aoConfirmar: ReturnType<typeof vi.fn>) {
  fireEvent.click(botaoConfirmar());
  await waitFor(() => expect(aoConfirmar).toHaveBeenCalled());
  return aoConfirmar.mock.calls[0][0] as Array<{ campo: string; valor: string }>;
}

const valorDe = (payload: Array<{ campo: string; valor: string }>, campoNome: string) =>
  payload.find((c) => c.campo === campoNome)?.valor;

describe("REQUISITO: o candidato VÊ a data em BR", () => {
  it("o campo de data lido exibe DD/MM/AAAA, e não o ISO cru", () => {
    montar([DATA]);
    const input = screen.getByRole("textbox", { name: /Data de emissao do RG/i }) as HTMLInputElement;
    expect(input.value).toBe("14/03/2015");
  });
});

describe("REQUISITO: o que é submetido é sempre ISO, nunca BR", () => {
  it("data NÃO editada é submetida com o ISO ORIGINAL, byte a byte", async () => {
    const { aoConfirmar } = montar([DATA]);
    const payload = await submeter(aoConfirmar);
    expect(valorDe(payload, "rgDataEmissao")).toBe("2015-03-14");
    expect(valorDe(payload, "rgDataEmissao")).not.toMatch(BR);
  });

  it("data EDITADA é submetida em ISO canônico", async () => {
    const { aoConfirmar } = montar([DATA]);
    const input = screen.getByRole("textbox", { name: /Data de emissao do RG/i });
    fireEvent.change(input, { target: { value: "20/12/2020" } });
    const payload = await submeter(aoConfirmar);
    expect(valorDe(payload, "rgDataEmissao")).toBe("2020-12-20");
    expect(valorDe(payload, "rgDataEmissao")).not.toMatch(BR);
  });

  it("campo que NÃO é data passa intacto (não editado e editado)", async () => {
    const { aoConfirmar } = montar([NOME]);
    // Sem editar, sai igual.
    let payload = await submeter(aoConfirmar);
    expect(valorDe(payload, "nomeMae")).toBe("Maria Simulada");

    cleanup();
    aoConfirmar.mockClear();
    const segundo = montar([NOME]);
    const input2 = screen.getByRole("textbox", { name: /Nome da mae/i });
    fireEvent.change(input2, { target: { value: "Ana Teste" } });
    payload = await submeter(segundo.aoConfirmar);
    expect(valorDe(payload, "nomeMae")).toBe("Ana Teste");
  });

  it("no documento misto, NENHUM valor submetido sai em formato brasileiro", async () => {
    const { aoConfirmar } = montar([DATA, NOME]);
    const payload = await submeter(aoConfirmar);
    for (const c of payload) {
      expect(c.valor, `${c.campo} nao pode ser submetido em BR`).not.toMatch(BR);
    }
    // E a data continua sendo uma data ISO de verdade.
    expect(valorDe(payload, "rgDataEmissao")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("REQUISITO: o bloco 'Você Já Confirmou' exibe em BR", () => {
  it("uma data já confirmada antes aparece em DD/MM/AAAA no resumo, nunca em ISO", () => {
    // O campo está em `jaConfirmados` (veio do backend em ISO), então vira REPETIDO: só exibido.
    montar([DATA], { rgDataEmissao: "2015-03-14" });
    expect(screen.getByText("14/03/2015")).toBeTruthy();
    expect(screen.queryByText("2015-03-14")).toBeNull();
  });
});
