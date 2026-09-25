// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PortalHeader } from "./PortalHeader";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), escrito A PARTIR DO REQUISITO da REPAGINAÇÃO do Portal.
 *
 * O QUE ESTE ARQUIVO TRAVA (veto V5, PII-free): o cabeçalho do Portal mostra SÓ o primeiro nome,
 * UMA inicial (uma letra) e cargo/cliente, e NUNCA o nome completo. É o cabeçalho que a repaginação
 * adota (`designer/PortalHeader`, consumido por `app/portal/page.tsx`), alimentado por um contrato
 * que carrega apenas `primeiroNome` (`TrilhaDoCandidato`/`Candidato`, sem campo de nome completo).
 *
 * A inicial deriva de `primeiroNome.charAt(0)`: UMA letra, nunca as iniciais de cada parte do nome
 * ("A", nunca "ABLS"). O teste prova isso passando até um nome com duas palavras e exigindo que o
 * avatar continue com UMA letra, o que trava o "inicial única" contra uma repaginação que troque
 * por iniciais compostas.
 *
 * §A.6: sem dado real. §A.11: o cabeçalho não pode conter travessão (o separador é o ponto médio).
 */

afterEach(cleanup);

const TRAVESSAO = String.fromCharCode(0x2014);

describe("REQUISITO V5: o cabeçalho mostra primeiro nome, inicial única e cargo/cliente", () => {
  it("mostra o primeiro nome", () => {
    render(<PortalHeader candidato={{ primeiroNome: "Ana", cargo: "Auxiliar De Producao", cliente: "Blue Skies" }} />);
    expect(screen.getByText("Ana")).toBeTruthy();
  });

  it("mostra o cargo e o cliente", () => {
    render(<PortalHeader candidato={{ primeiroNome: "Ana", cargo: "Auxiliar De Producao", cliente: "Blue Skies" }} />);
    expect(screen.getByText(/Auxiliar De Producao/)).toBeTruthy();
    expect(screen.getByText(/Blue Skies/)).toBeTruthy();
  });

  it("a inicial do avatar é UMA letra, a primeira do primeiro nome", () => {
    render(<PortalHeader candidato={{ primeiroNome: "Mariana", cargo: "Operadora", cliente: "Cliente X" }} />);
    const inicial = screen.getByText("M");
    expect(inicial.textContent).toBe("M");
    expect(inicial.textContent).toHaveLength(1);
  });
});

describe("REQUISITO V5: NUNCA nome completo, e a inicial é ÚNICA (não composta)", () => {
  it("mesmo com duas palavras no campo, a inicial continua sendo UMA letra", () => {
    // O contrato carrega só o primeiro nome; se por engano vier composto, o avatar ainda é charAt(0).
    render(<PortalHeader candidato={{ primeiroNome: "Ana Beatriz", cargo: "Operadora", cliente: "Cliente X" }} />);
    // A inicial é "A" sozinha, nunca "AB".
    expect(screen.getByText("A").textContent).toBe("A");
    expect(screen.queryByText("AB")).toBeNull();
  });

  it("não vaza sobrenome: um sobrenome que nunca foi passado não aparece", () => {
    render(<PortalHeader candidato={{ primeiroNome: "Ana", cargo: "Operadora", cliente: "Cliente X" }} />);
    expect(screen.queryByText(/Santos/)).toBeNull();
    expect(screen.queryByText(/Lima/)).toBeNull();
  });
});

describe("cabeçalho público (sem candidato) não mostra nome nem inicial", () => {
  it("sem `candidato`, nenhum nome de pessoa é renderizado", () => {
    render(<PortalHeader />);
    expect(screen.queryByText("Ana")).toBeNull();
    // O título institucional continua, mas nada de pessoa.
    expect(screen.getByText("Portal Do Candidato")).toBeTruthy();
  });
});

describe("§A.11: o cabeçalho não usa travessão", () => {
  it("nenhum texto do cabeçalho tem travessão", () => {
    render(<PortalHeader candidato={{ primeiroNome: "Ana", cargo: "Auxiliar", cliente: "Blue Skies" }} />);
    expect(document.body.textContent ?? "").not.toContain(TRAVESSAO);
  });
});
