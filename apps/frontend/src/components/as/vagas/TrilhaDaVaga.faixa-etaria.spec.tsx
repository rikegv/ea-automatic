// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ A FAIXA ETÁRIA VIRA TEXTO LIVRE (OST da Central de Vagas, item 6) ────────────────────────────
 *
 * ┌─ O FUNDAMENTO, que é do diretor e não da fábrica ───────────────────────────────────────────┐
 * │ O campo NÃO alimenta indicador nenhum. Uniformidade de grafia serve para CONTAR e para        │
 * │ FILTRAR, e onde não se conta nem se filtra a lista fechada só cobra do time a tradução do que │
 * │ a vaga pede para a opção mais parecida, mais um segundo campo ("Outra") para o que ela não    │
 * │ cobria. Aberto o texto, o campo "Outra" perde a razão de existir e sai junto.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE **NÃO** MUDOU, e é o que este teste protege de um "conserto" futuro ─────────────────┐
 * │ O SERVIDOR NÃO FOI TOCADO: a coluna já é `varchar(80)` e o DTO já aceita texto com            │
 * │ `@MaxLength(80)`. O teto de 80 é dito na TELA (`maxLength`) justamente para a pessoa não      │
 * │ descobri-lo num 400 depois de escrever. Quem trocar o campo por um `textarea` sem teto        │
 * │ devolve o 400 para a operação, e é esta afirmação que fica vermelha.                          │
 * │                                                                                              │
 * │ NÃO HÁ DADO ANTIGO A MIGRAR: medido em produção E na homologação, ZERO vaga tem a faixa       │
 * │ preenchida. Nenhuma vaga existente perde valor ao virar texto.                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TESTE RENDERIZA a trilha em vez de ler a fonte: o que a OST pediu é um COMPORTAMENTO de campo
 * (digitar em vez de escolher), e o corpo que sai daqui é o que prova que o texto escrito chega
 * inteiro ao servidor, sem a costura de opção mais escape que existia antes.
 */

import type { AsVagaStatus } from "@/lib/as-status-vaga";
import type { CatalogosDaTrilha } from "./TrilhaDaVaga";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({ id: "vaga-1" })) }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

/** A cidade depende da UF do formulário e sairia buscando pela rede. Não é o assunto deste teste. */
vi.mock("@/lib/as-cidades", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-cidades")>("@/lib/as-cidades");
  return { ...real, useCidades: () => ({ cidades: [], carregando: false, erro: null }) };
});

import { TrilhaDaVaga } from "./TrilhaDaVaga";

const STATUS_ABERTA: AsVagaStatus = {
  id: 1,
  codigo: "ABERTA",
  rotulo: "Aberta",
  ordem: 1,
  tom: "ok",
  daTrilha: true,
  encerra: false,
  recebeCandidato: true,
  papel: null,
  ativo: true,
} as unknown as AsVagaStatus;

const CATALOGOS: CatalogosDaTrilha = {
  opcoes: {
    cargos: [{ id: "c1", nome: "Operador" }],
    clientes: [],
    beneficios: [],
    motivos: ["Aumento de quadro"],
    consultores: [],
    escalas: ["12x36"],
    comerciais: [],
  },
  contexto: { papelAs: "CONSULTOR", nome: "Fulano", contraparte: [] },
  segmentos: [],
  optClientes: [{ value: "1", label: "Cliente Um" }],
  optCargos: [{ value: "c1", label: "Operador" }],
  statusVaga: [STATUS_ABERTA],
  linhasAtivas: [],
  carregandoLinhas: false,
};

function montarNoPassoDoPerfil() {
  render(
    <TrilhaDaVaga
      modo={{ tipo: "nova" }}
      catalogos={CATALOGOS}
      token="t"
      onFechar={vi.fn()}
      onGravada={vi.fn()}
    />,
  );
  /* A NAVEGAÇÃO DA TRILHA É LIVRE (nenhum passo trava o avanço; quem cobra é o publicar), então
     chegar ao passo do perfil é clicar "Continuar" até lá. */
  for (let i = 0; i < 4; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a faixa etária da vaga", () => {
  it("é um campo para DIGITAR, e não mais uma lista para escolher", () => {
    montarNoPassoDoPerfil();

    const campo = screen.getByRole("textbox", { name: "Faixa etária" });
    expect(campo.tagName).toBe("INPUT");
    expect(screen.queryByRole("combobox", { name: "Faixa etária" })).toBeNull();
  });

  it("diz o teto de 80 caracteres na própria tela, que é o teto da coluna", () => {
    montarNoPassoDoPerfil();
    expect(screen.getByRole("textbox", { name: "Faixa etária" }).getAttribute("maxlength")).toBe(
      "80",
    );
  });

  /** Com o texto aberto, o campo de escape não tem mais o que cobrir. */
  it("não tem mais o campo de escape que a lista fechada exigia", () => {
    montarNoPassoDoPerfil();
    expect(screen.queryByText(/qual é a faixa etária/i)).toBeNull();
  });

  it("manda ao servidor exatamente o que foi escrito, sem tradução para opção nenhuma", async () => {
    montarNoPassoDoPerfil();
    const escrito = "de 25 a 40, com alguma folga";
    fireEvent.change(screen.getByRole("textbox", { name: "Faixa etária" }), {
      target: { value: escrito },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar Rascunho" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, opcoes] = apiFetch.mock.calls[0] as unknown as [
      string,
      { body?: { faixaEtaria?: string } },
    ];
    expect(opcoes.body?.faixaEtaria).toBe(escrito);
  });

  /** Campo vazio é AUSÊNCIA, e ausência não viaja como string vazia: a coluna fica nula. */
  it("não manda campo nenhum quando ninguém escreveu nada", async () => {
    montarNoPassoDoPerfil();
    fireEvent.click(screen.getByRole("button", { name: "Salvar Rascunho" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, opcoes] = apiFetch.mock.calls[0] as unknown as [
      string,
      { body?: { faixaEtaria?: string } },
    ];
    expect(opcoes.body?.faixaEtaria).toBeUndefined();
  });
});
