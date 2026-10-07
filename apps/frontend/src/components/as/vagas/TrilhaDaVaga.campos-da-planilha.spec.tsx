// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ A MARCA "DA PLANILHA, A CONFERIR" É POR CAMPO, E VEM DO SERVIDOR ─────────────────────────────
 *
 * O pedido do diretor é que quem libera a vaga saiba, CAMPO A CAMPO, o que está conferindo. Então o
 * que este teste assere não é a existência de um aviso: é que a marca aparece no campo que o
 * SERVIDOR listou, e NÃO aparece no vizinho que ninguém listou, dentro da mesma vaga.
 *
 * ELE RENDERIZA A TRILHA em vez de ler a fonte, porque o defeito que a frente evita é de TELA: um
 * campo pré-preenchido por máquina indistinguível de um escolhido por gente.
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

const STATUS_ABERTA = {
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

const CATALOGOS = {
  opcoes: {
    cargos: [{ id: "c1", nome: "Operador" }],
    clientes: [],
    beneficios: [],
    motivos: ["Aumento de quadro"],
    consultores: [],
    escalas: [],
    comerciais: [],
  },
  contexto: { papelAs: "CONSULTOR", nome: "Fulano", contraparte: [] },
  segmentos: [],
  optClientes: [{ value: "0123", label: "Cliente Do Catálogo" }],
  optCargos: [{ value: "c1", label: "Operador" }],
  statusVaga: [STATUS_ABERTA],
  linhasAtivas: [{ id: 7, rotulo: "Célula Um" }],
  carregandoLinhas: false,
} as unknown as CatalogosDaTrilha;

function vagaDaFila(campos?: unknown): VagaDetalhe {
  return {
    id: "vaga-1",
    codigo: "998877",
    status: "PENDENTE_REVISAO",
    nomeDivulgacao: "Operador De Produção",
    codCliente: null,
    clienteNome: null,
    cargoId: "c1",
    posicoesOficiais: 1,
    posicoesBanco: 0,
    beneficios: [],
    idiomas: [],
    idiomasExigidos: [],
    etapasPs: [],
    genero: [],
    testes: [],
    regioes: [],
    dataAbertura: "2026-10-01",
    dataLimite: "2026-10-20",
    ...(campos === undefined ? {} : { camposVindosDaPlanilha: campos }),
  } as unknown as VagaDetalhe;
}

function montarLiberacao(campos?: unknown) {
  render(
    <TrilhaDaVaga
      modo={{ tipo: "liberacao", vaga: vagaDaFila(campos) }}
      catalogos={CATALOGOS}
      token="t"
      onFechar={vi.fn()}
      onGravada={vi.fn()}
    />,
  );
}

/** A marca mora ao lado do rótulo, então a prova é o texto do contêiner do campo. */
function rotuloDoCampo(id: string): string {
  const el = document.getElementById(id);
  if (!el) throw new Error(`campo ${id} não está na tela`);
  return el.textContent ?? "";
}

const MARCA = "Da Planilha, A Conferir";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a marca de campo pré-preenchido pela planilha, na liberação da vaga", () => {
  it("marca SÓ os campos que o servidor listou, e deixa os vizinhos sem marca", () => {
    montarLiberacao(["cargo", "natureza"]);

    expect(rotuloDoCampo("vaga-cargo")).toContain(MARCA);
    expect(rotuloDoCampo("vaga-natureza")).toContain(MARCA);
    /* O VIZINHO DA MESMA VAGA, não listado: é ele que prova que a marca é POR CAMPO e não um aviso
       geral de "esta vaga foi pré-preenchida". */
    expect(rotuloDoCampo("vaga-linha-servico")).not.toContain(MARCA);
    expect(rotuloDoCampo("vaga-posicoes-oficiais")).not.toContain(MARCA);
  });

  it("marca as duas datas, que ficam no passo seguinte", () => {
    montarLiberacao(["dataAbertura", "dataLimite"]);
    /* A navegação da trilha é livre: chegar ao passo das datas é clicar "Continuar" uma vez. */
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(rotuloDoCampo("vaga-data-abertura")).toContain(MARCA);
    expect(rotuloDoCampo("vaga-previsao-entrega")).toContain(MARCA);
  });

  it("não marca nada quando o servidor não listou campo nenhum", () => {
    montarLiberacao([]);
    expect(screen.queryAllByTestId("marca-da-planilha")).toHaveLength(0);
    expect(rotuloDoCampo("vaga-cargo")).not.toContain(MARCA);
  });

  it("não marca nada quando o contrato vem ausente, e a tela fica como era", () => {
    montarLiberacao();
    expect(screen.queryAllByTestId("marca-da-planilha")).toHaveLength(0);
  });

  it("não marca nada fora do modo liberação, mesmo com a lista na vaga", () => {
    render(
      <TrilhaDaVaga
        modo={{ tipo: "clone", vaga: vagaDaFila(["cargo", "natureza"]) }}
        catalogos={CATALOGOS}
        token="t"
        onFechar={vi.fn()}
        onGravada={vi.fn()}
      />,
    );
    expect(screen.queryAllByTestId("marca-da-planilha")).toHaveLength(0);
  });

  it("deixa o valor editável: trocar o cargo não tira a marca, que é do servidor", () => {
    montarLiberacao(["cargo"]);
    /* O `Select` do DS é um botão que abre a lista (§A.35, nada de `<select>` cru). A marca não o
       desabilita: o valor segue trocável, e é isso que esta linha trava. */
    const seletor = screen.getByRole("button", { name: "Cargo da vaga" }) as HTMLButtonElement;
    expect(seletor.disabled).toBe(false);
    expect(seletor.getAttribute("aria-disabled")).not.toBe("true");
    /* A marca NÃO é limpa pela tela: quem limpa a origem é o servidor, na edição, e o campo sai da
       lista na PRÓXIMA leitura. Tela que apagasse a marca sozinha passaria a dizer o que o banco
       ainda não diz. */
    expect(rotuloDoCampo("vaga-cargo")).toContain(MARCA);
  });
});
