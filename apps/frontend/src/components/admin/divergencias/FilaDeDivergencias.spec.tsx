// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DivergenciaDaIngestaoItem } from "@ea/shared-types";

/**
 * ─ A FILA DE DIVERGÊNCIAS: o que está no JSX e nenhum teste de função pega ─────────────────────
 *
 * ┌─ POR QUE ESTE TESTE É DE COMPONENTE ────────────────────────────────────────────────────────┐
 * │ A régua desta tela é o GESTO: "Manter o EA" fecha a linha sem escrever no dado, e "Adotar o    │
 * │ Pandapé" ESCREVE, pelo caminho humano normal, com autor e trilha. Disparar a adoção sem        │
 * │ confirmação não quebra build nenhum e não falha teste de função: ela simplesmente move a       │
 * │ pessoa de etapa, ou altera a vaga, por um clique que a pessoa não pretendia dar.               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O filtro múltiplo é testado aqui pelo CLIQUE (duas opções marcadas SOMAM as duas populações), e
 * não só pela função de recorte: o defeito clássico é a tela mandar um valor só para um filtro que
 * aceita lista, e aí a função está certa e a tela mente.
 */

const { listarDivergenciasDaIngestao, listarOpcoesDeDivergencia, manterOEa, adotarOAts } =
  vi.hoisted(() => ({
    listarDivergenciasDaIngestao: vi.fn(),
    listarOpcoesDeDivergencia: vi.fn(),
    manterOEa: vi.fn(),
    adotarOAts: vi.fn(),
  }));

vi.mock("@/lib/divergencias-ingestao", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/divergencias-ingestao")>(
      "@/lib/divergencias-ingestao",
    );
  return { ...real, listarDivergenciasDaIngestao, listarOpcoesDeDivergencia, manterOEa, adotarOAts };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "t", isAdmin: true, usuario: null, temMenu: () => true }),
}));

import { estadoDoFiltro, urlDaFila, type FiltrosDeDivergencia } from "@/lib/divergencias-ingestao";
import { FilaDeDivergencias } from "./FilaDeDivergencias";

/** Os filtros da última chamada à fila: é por eles que se prova o que a tela pediu ao servidor. */
function ultimosFiltros(): FiltrosDeDivergencia {
  const chamadas = listarDivergenciasDaIngestao.mock.calls;
  return chamadas[chamadas.length - 1]?.[1] as FiltrosDeDivergencia;
}

function item(over: Partial<DivergenciaDaIngestaoItem>): DivergenciaDaIngestaoItem {
  return {
    id: "d1",
    escopo: "CANDIDATURA",
    campo: "etapa",
    campoRotulo: "Etapa Do Funil",
    valorEa: "TRIAGEM",
    valorAts: "ENTREVISTA",
    candidaturaId: "c1",
    candidatoNome: "Ana Pendente",
    vagaId: "v1",
    vagaNome: "Operador De Loja",
    clienteNome: "Cliente Alfa",
    ocorrencias: 3,
    primeiraEm: "2026-09-20T10:00:00.000Z",
    ultimaEm: "2026-09-28T10:00:00.000Z",
    resolvidoEm: null,
    resolvidoPorNome: null,
    decisao: null,
    ...over,
  };
}

const ANA = item({ id: "a" });
const BRUNO = item({
  id: "b",
  escopo: "VAGA",
  campo: "vaga_posicoes_oficiais",
  campoRotulo: "Posições Da Vaga",
  candidatoNome: "Bruno Pendente",
  clienteNome: "Cliente Beta",
  vagaId: "v2",
  vagaNome: "Fiscal De Caixa",
  valorEa: null,
  valorAts: "PS-2026-009",
  ocorrencias: 1,
  ultimaEm: "2026-09-27T10:00:00.000Z",
});
const CARLA = item({
  id: "c",
  campo: "situacao",
  campoRotulo: "Situação",
  candidatoNome: "Carla Resolvida",
  resolvidoEm: "2026-09-26T10:00:00.000Z",
  resolvidoPorNome: "Consultora",
  decisao: "MANTIDO_EA",
  ocorrencias: 1,
  ultimaEm: "2026-09-26T10:00:00.000Z",
});

/** Os nomes de candidato na ordem em que a tabela os desenha. */
function linhas(): string[] {
  const corpo = document.querySelector("tbody");
  return Array.from(corpo?.querySelectorAll("tr") ?? []).map(
    (tr) => tr.querySelector("td")?.textContent?.trim() ?? "",
  );
}

/** Os KPIs vêm do SERVIDOR e são contados SEM filtro: de propósito eles não batem com as 3 linhas. */
const KPIS = { abertas: 7, resolvidas: 2, reincidentes: 4 };

beforeEach(() => {
  vi.clearAllMocks();
  listarDivergenciasDaIngestao.mockResolvedValue({ itens: [ANA, BRUNO, CARLA], kpis: KPIS });
  listarOpcoesDeDivergencia.mockResolvedValue({
    clientes: [
      { value: "Cliente Alfa", label: "Cliente Alfa" },
      { value: "Cliente Beta", label: "Cliente Beta" },
    ],
    vagas: [
      { value: "v1", label: "Operador De Loja" },
      { value: "v2", label: "Fiscal De Caixa" },
    ],
  });
  manterOEa.mockResolvedValue(CARLA);
  adotarOAts.mockResolvedValue(CARLA);
});

afterEach(() => cleanup());

describe("a tabela", () => {
  it("desenha as nove colunas da fila, com Valor No EA e Valor No Pandapé separados", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    const cabecalhos = Array.from(document.querySelectorAll("thead th")).map((th) =>
      th.textContent?.trim(),
    );
    expect(cabecalhos).toEqual([
      "Candidato",
      "Cliente",
      "Vaga",
      "Campo",
      "Valor No EA",
      "Valor No Pandapé",
      "Ocorrências",
      "Detectado Em",
      "Ações",
    ]);
  });

  it("abre na ordem da fila: pendente primeiro, detecção mais recente no topo", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toEqual(["Ana Pendente", "Bruno Pendente", "Carla Resolvida"]));
  });

  it("valor ausente aparece como “não informado”, nunca vazio nem glifo (§A.11)", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));
    // O `valorEa` do Bruno é nulo: a célula tem a palavra, e o valor do Pandapé continua visível.
    expect(screen.getAllByText("não informado").length).toBeGreaterThan(0);
    expect(screen.getByText("PS-2026-009")).toBeTruthy();
  });

  it("a linha resolvida mostra a decisão em vez das ações, e a pendente mostra as duas ações", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));
    expect(screen.getAllByLabelText("Manter o EA")).toHaveLength(2);
    expect(screen.getAllByLabelText("Adotar o Pandapé")).toHaveLength(2);
    expect(screen.getByText("Mantido O EA")).toBeTruthy();
  });
});

describe("ordenação clicável no cabeçalho (§A.29)", () => {
  it("o primeiro clique ordena por candidato e o segundo inverte", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    const candidato = screen.getByRole("button", { name: /candidato/i });
    fireEvent.click(candidato);
    expect(linhas()).toEqual(["Ana Pendente", "Bruno Pendente", "Carla Resolvida"]);
    fireEvent.click(candidato);
    expect(linhas()).toEqual(["Carla Resolvida", "Bruno Pendente", "Ana Pendente"]);
  });
});

/** O último `estado` que a tela pediu ao servidor. */
function ultimoEstado(): string {
  const chamadas = listarDivergenciasDaIngestao.mock.calls;
  const filtros = chamadas[chamadas.length - 1]?.[1] as { situacoes: string[] };
  return estadoDoFiltro(filtros.situacoes);
}

describe("KPI clicável como filtro (§A.12)", () => {
  it("mostra o número DO SERVIDOR, e não a contagem das linhas carregadas", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    // Três linhas na tabela, e os cards mostram 7, 2 e 4: o card é o filtro, então ele conta o
    // conjunto inteiro. Contar na tela faria cada card mostrar o total de si mesmo.
    expect(screen.getByRole("button", { name: /pendentes/i }).textContent).toContain("7");
    expect(screen.getByRole("button", { name: /resolvidas/i }).textContent).toContain("2");
    expect(screen.getByRole("button", { name: /reincidentes/i }).textContent).toContain("4");
  });

  it("o card de situação alterna o `estado` pedido ao servidor, e o segundo clique volta atrás", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));
    expect(ultimoEstado()).toBe("ABERTAS");

    const resolvidas = screen.getByRole("button", { name: /resolvidas/i });
    fireEvent.click(resolvidas);
    await waitFor(() => expect(ultimoEstado()).toBe("RESOLVIDAS"));
    expect(resolvidas.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(resolvidas);
    await waitFor(() => expect(ultimoEstado()).toBe("ABERTAS"));
    expect(resolvidas.getAttribute("aria-pressed")).toBe("false");
  });

  it("dois cards ligados SOMAM as duas populações (`TODAS`), em vez de trocar uma pela outra", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: /pendentes/i }));
    await waitFor(() => expect(ultimoEstado()).toBe("ABERTAS"));
    fireEvent.click(screen.getByRole("button", { name: /resolvidas/i }));
    await waitFor(() => expect(ultimoEstado()).toBe("TODAS"));
  });

  it("o card de reincidentes recorta por ocorrências maior que 1", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: /reincidentes/i }));
    expect(linhas()).toEqual(["Ana Pendente"]);
  });
});

describe("filtro do modal de filtros", () => {
  it("marcar dois campos manda os DOIS ao servidor, em vez de a segunda escolha trocar a primeira", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getByLabelText("Abrir filtros"));
    fireEvent.click(await screen.findByLabelText("Filtrar por campo"));

    fireEvent.click(await screen.findByRole("option", { name: "Etapa Do Funil" }));
    await waitFor(() =>
      expect(urlDaFila(ultimosFiltros())).toContain("campo=etapa&"),
    );

    fireEvent.click(await screen.findByRole("option", { name: "Código Da Vaga" }));
    await waitFor(() =>
      expect(urlDaFila(ultimosFiltros())).toContain("campo=etapa%2Cvaga_codigo&"),
    );

    // As duas opções ficam marcadas ao mesmo tempo: é isso que "múltiplo" significa na tela.
    expect(screen.getByRole("option", { name: "Etapa Do Funil" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "Código Da Vaga" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  /**
   * CLIENTE E VAGA VÃO AO SERVIDOR, e a tela RECARREGA. A consulta da fila tem `limit 500`: recortar
   * na tela esconderia, sem aviso, as divergências daquele cliente que ficaram fora do teto.
   */
  it("marcar dois CLIENTES manda os dois ao servidor e recarrega a fila", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));
    const antes = listarDivergenciasDaIngestao.mock.calls.length;

    fireEvent.click(screen.getByLabelText("Abrir filtros"));
    fireEvent.click(await screen.findByLabelText("Filtrar por cliente"));

    fireEvent.click(await screen.findByRole("option", { name: "Cliente Beta" }));
    await waitFor(() => expect(urlDaFila(ultimosFiltros())).toContain("cliente=Cliente+Beta"));

    fireEvent.click(await screen.findByRole("option", { name: "Cliente Alfa" }));
    await waitFor(() =>
      expect(urlDaFila(ultimosFiltros())).toContain("cliente=Cliente+Beta%2CCliente+Alfa"),
    );
    // Duas escolhas, duas recargas: o filtro não é recorte de tela.
    expect(listarDivergenciasDaIngestao.mock.calls.length).toBe(antes + 2);
  });

  it("marcar uma VAGA manda o id ao servidor e recarrega a fila", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getByLabelText("Abrir filtros"));
    fireEvent.click(await screen.findByLabelText("Filtrar por vaga"));
    fireEvent.click(await screen.findByRole("option", { name: "Fiscal De Caixa" }));

    await waitFor(() => expect(urlDaFila(ultimosFiltros())).toContain("vaga=v2"));
  });

  /**
   * O SEGUNDO FILTRO NÃO EXISTE, e este teste é o que garante isso: a resposta do servidor é
   * desenhada COMO VEIO. Se a tela recortasse por cima, as três linhas do dublê (que são de clientes
   * diferentes) virariam uma, e aí teríamos duas réguas para o mesmo recorte, divergindo no primeiro
   * ajuste e divergindo justamente em quem aparece na fila.
   */
  it("escolher cliente NÃO refaz o recorte na tela: a lista do servidor é desenhada como veio", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getByLabelText("Abrir filtros"));
    fireEvent.click(await screen.findByLabelText("Filtrar por cliente"));
    fireEvent.click(await screen.findByRole("option", { name: "Cliente Beta" }));

    await waitFor(() => expect(urlDaFila(ultimosFiltros())).toContain("cliente=Cliente+Beta"));
    // O dublê devolve as MESMAS três linhas, de clientes diferentes, e todas continuam na tela.
    expect(linhas()).toEqual(["Ana Pendente", "Bruno Pendente", "Carla Resolvida"]);
  });

  /**
   * SETE OPÇÕES, e o número importa: o filtro é derivado do enum do contrato, então o veto que tirou
   * `motivo_descarte` da fila tirou junto a opção do filtro, sem ninguém precisar editar esta tela.
   * Uma lista redigitada aqui ofereceria um campo que a rota recusa com 400.
   */
  it("o filtro de Campo oferece os SETE campos do contrato, sem o motivo do descarte", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getByLabelText("Abrir filtros"));
    fireEvent.click(await screen.findByLabelText("Filtrar por campo"));

    const opcoes = await screen.findAllByRole("option");
    expect(opcoes).toHaveLength(7);
    expect(opcoes.map((o) => o.textContent)).not.toContain("Motivo Do Descarte");
  });

  it("o catálogo de cliente e vaga vem do endpoint, não das linhas carregadas (§A.37)", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(listarOpcoesDeDivergencia).toHaveBeenCalledWith("t"));

    fireEvent.click(screen.getByLabelText("Abrir filtros"));
    fireEvent.click(await screen.findByLabelText("Filtrar por vaga"));
    expect(await screen.findByRole("option", { name: "Operador De Loja" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Fiscal De Caixa" })).toBeTruthy();
  });
});

describe("as duas decisões", () => {
  it("“Manter o EA” resolve a linha direto, sem confirmação, porque não escreve no dado", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getAllByLabelText("Manter o EA")[0]);
    await waitFor(() => expect(manterOEa).toHaveBeenCalledWith("t", "a"));
    expect(adotarOAts).not.toHaveBeenCalled();
  });

  it("“Adotar o Pandapé” NÃO dispara no clique da linha: abre a confirmação primeiro", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getAllByLabelText("Adotar o Pandapé")[0]);
    expect(adotarOAts).not.toHaveBeenCalled();

    const painel = await screen.findByRole("dialog");
    // O modal diz o que vai de onde para onde, com os DOIS valores (§A.24: título em title case).
    expect(within(painel).getByText("Adotar O Pandapé")).toBeTruthy();
    expect(within(painel).getByText("TRIAGEM")).toBeTruthy();
    expect(within(painel).getByText("ENTREVISTA")).toBeTruthy();
    // §A.41: saída visível. Cancelar fecha sem aplicar nada.
    expect(within(painel).getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("cancelar a confirmação fecha o painel e não escreve nada", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getAllByLabelText("Adotar o Pandapé")[0]);
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(adotarOAts).not.toHaveBeenCalled();
  });

  it("confirmar aplica a adoção, com a decisão do ATS", async () => {
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(linhas()).toHaveLength(3));

    fireEvent.click(screen.getAllByLabelText("Adotar o Pandapé")[1]);
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Adotar o Pandapé" }));

    await waitFor(() => expect(adotarOAts).toHaveBeenCalledWith("t", "b"));
    expect(manterOEa).not.toHaveBeenCalled();
  });
});

describe("os quatro campos que NÃO são adotáveis", () => {
  /**
   * O SERVIDOR DEVOLVE 409 NESTES CINCO DE PROPÓSITO: não existe caminho humano que aceite o estado
   * em que a divergência nasce. Oferecer o botão e explicar o erro depois transformaria uma recusa
   * conhecida em falha de tela, então a linha mostra "Manter o EA" e o caminho real no lugar do
   * outro botão. Este teste é o que impede o botão de voltar por um ajuste de célula.
   */
  const NAO_ADOTAVEIS = [
    { campo: "situacao", rotulo: "Situação", caminho: /ficha do candidato/i },
    { campo: "vaga_codigo", rotulo: "Código Da Vaga", caminho: /editar vaga/i },
    { campo: "vaga_nome_divulgacao", rotulo: "Nome Da Vaga", caminho: /editar vaga/i },
    { campo: "vaga_cidade", rotulo: "Cidade Da Vaga", caminho: /editar vaga/i },
  ] as const;

  it.each(NAO_ADOTAVEIS)(
    "$campo não desenha o botão de adotar, e diz o caminho real no lugar dele",
    async ({ campo, rotulo, caminho }) => {
      listarDivergenciasDaIngestao.mockResolvedValue({
        itens: [item({ id: "x", campo, campoRotulo: rotulo })],
        kpis: KPIS,
      });
      render(<FilaDeDivergencias />);
      /*
       * ESPERA PELA AÇÃO, E NÃO PELA CONTAGEM DE LINHAS: enquanto carrega, a tabela desenha UMA
       * linha ("Carregando…"), então `toHaveLength(1)` passava antes de a resposta chegar e o teste
       * media a tela vazia. Foi assim que este caso falhou de forma intermitente.
       */
      await screen.findByLabelText("Manter o EA");
      expect(linhas()).toHaveLength(1);

      expect(screen.queryByLabelText("Adotar o Pandapé")).toBeNull();
      expect(screen.getByText(caminho)).toBeTruthy();
    },
  );

  it("na mesma lista, a linha adotável mostra o botão e a não adotável não", async () => {
    listarDivergenciasDaIngestao.mockResolvedValue({
      itens: [ANA, item({ id: "y", campo: "situacao", campoRotulo: "Situação" })],
      kpis: KPIS,
    });
    render(<FilaDeDivergencias />);
    await waitFor(() => expect(screen.getAllByLabelText("Manter o EA")).toHaveLength(2));
    expect(linhas()).toHaveLength(2);
    expect(screen.getAllByLabelText("Adotar o Pandapé")).toHaveLength(1);
  });
});
