// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ A PROPOSTA DE CLIENTE NA TRILHA DE LIBERAÇÃO ─────────────────────────────────────────────────
 *
 * O QUE ESTES TESTES PROTEGEM, e é a CONDIÇÃO C1 da auditoria: a proposta da planilha NÃO pode
 * chegar pré-preenchida no seletor de cliente. Pré-preenchida, ela fica indistinguível de um valor
 * escolhido por gente; quem libera não mexe no campo, o formulário completo grava o que estava lá, e
 * a trilha passa a AFIRMAR que uma pessoa conferiu uma escolha que ninguém olhou.
 *
 * O risco aqui não é caminho de código, é GESTO HUMANO DESATENTO, e é por isso que o teste mais
 * importante deste arquivo é o que afirma que o seletor NASCE VAZIO mesmo havendo proposta, e que o
 * corpo que vai ao servidor NÃO carrega cliente nenhum enquanto ninguém clicou em confirmar.
 *
 * O SEGUNDO ASSUNTO são os DOIS casos de cobertura, que têm de ser distinguíveis: proposta com
 * CÓDIGO do catálogo (158 das 470 vagas abertas) e proposta só com o NOME (154), porque o catálogo
 * `clientes` é da ADMISSÃO e 59 dos 95 nomes da planilha não existem lá.
 */

import type { VagaDetalhe } from "@ea/shared-types";
import type { AsVagaStatus } from "@/lib/as-status-vaga";
import type { CatalogosDaTrilha } from "./TrilhaDaVaga";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({ id: "vaga-1" })) }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

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
  papel: "ABERTURA",
  ativo: true,
} as unknown as AsVagaStatus;

const CATALOGOS: CatalogosDaTrilha = {
  opcoes: {
    cargos: [{ id: "c1", nome: "Operador" }],
    clientes: [
      {
        codCliente: "0123",
        rotulo: "Siderúrgica Do Catálogo",
        enderecoPadrao: null,
        escalaPadrao: null,
        solicitanteNome: null,
        solicitanteTelefone: null,
        solicitanteEmail: null,
      },
    ],
    beneficios: [],
    motivos: ["Aumento de quadro"],
    consultores: [],
    escalas: [],
    comerciais: [],
  },
  contexto: { papelAs: "CONSULTOR", nome: "Fulano", contraparte: [] },
  segmentos: [],
  optClientes: [
    { value: "0123", label: "Siderúrgica Do Catálogo" },
    { value: "0456", label: "Outro Cliente Cadastrado" },
  ],
  optCargos: [{ value: "c1", label: "Operador" }],
  statusVaga: [STATUS_ABERTA],
  linhasAtivas: [],
  carregandoLinhas: false,
} as unknown as CatalogosDaTrilha;

/** A vaga espelhada pela varredura: `codCliente` NULO, que é como ela nasce e continua nascendo. */
function vagaDaFila(proposta?: unknown): VagaDetalhe {
  return {
    id: "vaga-1",
    codigo: "998877",
    status: "PENDENTE_REVISAO",
    nomeDivulgacao: "Operador De Produção",
    codCliente: null,
    clienteNome: null,
    posicoesOficiais: 1,
    posicoesBanco: 0,
    beneficios: [],
    /* AS LISTAS PRECISAM EXISTIR: `estadoInicial` as percorre na montagem e o envio as filtra, e a
       vaga real sempre as traz (vazias quando ninguém escolheu nada). */
    idiomas: [],
    idiomasExigidos: [],
    etapasPs: [],
    genero: [],
    testes: [],
    regioes: [],
    ...(proposta === undefined ? {} : { propostaDeCliente: proposta }),
  } as unknown as VagaDetalhe;
}

const PROPOSTA_COM_CODIGO = {
  codClienteProposto: "0123",
  nomeClienteProposto: "SIDERURGICA EXEMPLO LTDA",
  origem: "PLANILHA_ID_VAGA",
  conferida: false,
};

const PROPOSTA_SO_NOME = {
  codClienteProposto: null,
  nomeClienteProposto: "GERDAU UNIDADE EXEMPLO",
  origem: "PLANILHA_REQUISICAO",
  conferida: false,
};

function montarLiberacao(proposta?: unknown) {
  render(
    <TrilhaDaVaga
      modo={{ tipo: "liberacao", vaga: vagaDaFila(proposta) }}
      catalogos={CATALOGOS}
      token="t"
      onFechar={vi.fn()}
      onGravada={vi.fn()}
    />,
  );
}

const seletorDeCliente = () => screen.getByRole("combobox", { name: "Cliente da vaga" });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a proposta de cliente, com código do catálogo", () => {
  it("NÃO pré-preenche o seletor: ele nasce vazio, como nascia antes desta frente", () => {
    montarLiberacao(PROPOSTA_COM_CODIGO);
    expect(seletorDeCliente().textContent).toContain("Selecionar cliente");
    expect(seletorDeCliente().textContent).not.toContain("Siderúrgica Do Catálogo");
  });

  it("aparece MARCADA COMO PROPOSTA, com o nome da planilha e o cliente do catálogo", () => {
    montarLiberacao(PROPOSTA_COM_CODIGO);
    const caixa = screen.getByTestId("proposta-de-cliente");
    expect(caixa.textContent).toContain("Proposta Da Planilha");
    expect(caixa.textContent).toContain("SIDERURGICA EXEMPLO LTDA");
    expect(caixa.textContent).toContain("Siderúrgica Do Catálogo");
    expect(caixa.textContent).toContain("Ninguém conferiu ainda");
  });

  /**
   * O TESTE QUE SEGURA A CONDIÇÃO C1 NA PONTA: sem clique em confirmar, o corpo que vai ao servidor
   * não carrega cliente. Quem passar a pré-preencher o campo quebra esta afirmação.
   */
  it("sem o clique de confirmar, o corpo salvo NÃO leva cliente nenhum", async () => {
    montarLiberacao(PROPOSTA_COM_CODIGO);
    fireEvent.click(screen.getByRole("button", { name: "Salvar sem liberar" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, opcoes] = apiFetch.mock.calls[0] as unknown as [
      string,
      { body?: { codCliente?: string } },
    ];
    expect(opcoes.body?.codCliente).toBeUndefined();
  });

  it("confirmar é um gesto próprio, e só ele escolhe o cliente no seletor", async () => {
    montarLiberacao(PROPOSTA_COM_CODIGO);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cliente" }));

    expect(seletorDeCliente().textContent).toContain("Siderúrgica Do Catálogo");
    expect(screen.getByTestId("proposta-de-cliente").textContent).toContain(
      "Cliente Confirmado",
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvar sem liberar" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, opcoes] = apiFetch.mock.calls[0] as unknown as [
      string,
      { body?: { codCliente?: string } },
    ];
    expect(opcoes.body?.codCliente).toBe("0123");
  });
});

describe("a proposta de cliente só com o nome", () => {
  it("diz QUEM é o cliente e deixa claro que falta o código, sem parecer o caso com código", () => {
    montarLiberacao(PROPOSTA_SO_NOME);
    const caixa = screen.getByTestId("proposta-de-cliente");
    expect(caixa.textContent).toContain("Proposta Sem Código No Catálogo");
    expect(caixa.textContent).toContain("GERDAU UNIDADE EXEMPLO");
    expect(caixa.textContent).not.toContain("Proposta Da Planilha");
  });

  it("não oferece confirmar, porque não há código para confirmar", () => {
    montarLiberacao(PROPOSTA_SO_NOME);
    expect(screen.queryByRole("button", { name: "Confirmar cliente" })).toBeNull();
  });

  /**
   * EXIGÊNCIA DA AUDITORIA: a tela NÃO oferece criar cliente. O catálogo é da Admissão, resolve a
   * régua documental e o nome da pasta do prontuário no Drive, e cliente criado às pressas por quem
   * libera vaga nasceria sem régua nenhuma.
   */
  it("em nenhum dos casos oferece CRIAR cliente, e manda para a administração", () => {
    montarLiberacao(PROPOSTA_SO_NOME);
    expect(screen.queryByRole("button", { name: /criar cliente/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cadastrar cliente/i })).toBeNull();
    expect(screen.getByTestId("proposta-de-cliente").textContent).toContain(
      "cadastrar cliente é da administração",
    );
  });
});

describe("a vaga sem proposta", () => {
  it("fica exatamente como está hoje: nenhuma caixa de proposta na tela", () => {
    montarLiberacao(undefined);
    expect(screen.queryByTestId("proposta-de-cliente")).toBeNull();
    expect(seletorDeCliente().textContent).toContain("Selecionar cliente");
  });

  it("proposta sem nome é recusada, e a tela não desenha caixa vazia", () => {
    montarLiberacao({ ...PROPOSTA_COM_CODIGO, nomeClienteProposto: "" });
    expect(screen.queryByTestId("proposta-de-cliente")).toBeNull();
  });
});

describe("as regras permanentes de texto", () => {
  /** §A.11: travessão PROIBIDO em qualquer texto de tela. */
  it("não escreve travessão em nenhum dos textos da proposta", () => {
    for (const p of [PROPOSTA_COM_CODIGO, PROPOSTA_SO_NOME]) {
      montarLiberacao(p);
      expect(screen.getByTestId("proposta-de-cliente").textContent ?? "").not.toContain("—");
      cleanup();
    }
  });

  /** §A.24: o botão é AÇÃO, então vai em escrita normal, e não em title case. */
  it("o botão de adotar a proposta é um comando, em escrita normal", () => {
    montarLiberacao(PROPOSTA_COM_CODIGO);
    expect(screen.getByRole("button", { name: "Confirmar cliente" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar Cliente" })).toBeNull();
  });
});
