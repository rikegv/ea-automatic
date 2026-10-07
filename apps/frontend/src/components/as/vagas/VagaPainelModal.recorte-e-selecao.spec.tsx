// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  candidaturaViva,
  finalizaPosicao,
  type AsCandidaturaItem,
  type AsCandidaturasDaVagaPagina,
  type AsOcupacaoVaga,
  type VagaListItem,
} from "@ea/shared-types";

/**
 * ─ O RECORTE E A SELEÇÃO NO PAINEL DA VAGA, AGORA SERVER-SIDE (cobertura independente, §A.38) ───
 *
 * A aba Ver Candidatos deixou de janelar no cliente e passou a PAGINAR NO SERVIDOR: a busca por
 * nome, a situação e a etapa viram FILTRO server-side, as contagens das abas vêm do `resumo` (a
 * ocupação da vaga inteira) e a seleção em massa opera sobre o CONJUNTO INTEIRO do recorte.
 *
 * ┌─ A RÉGUA CENTRAL, pinada pelo diretor (invariante ec2ea83) ─────────────────────────────────┐
 * │ "Selecionar todos" e as contagens operam sobre o CONJUNTO INTEIRO do filtro, nunca sobre a    │
 * │ página. E mudar o recorte (ou de aba, ou de página) LIMPA a seleção manual: seleção que        │
 * │ sobrevive a um recorte que a escondeu é seleção invisível, e invisível é como o lote atinge    │
 * │ gente que ninguém está vendo.                                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MOCK IMITA O SERVIDOR: recebe o filtro, recorta uma base de nove candidaturas e devolve a
 * página, com o `resumo` da vaga inteira no offset 0. Assim os testes afirmam DUAS coisas de uma vez:
 * que a tela MANDA o filtro certo (os argumentos da chamada) e que ela MOSTRA o que o filtro devolve.
 *
 * §A.11 (sem travessão), §A.28 (filtro múltiplo), §A.35 (nada de `<select>` cru), §A.29 (ordenação),
 * §A.37 (opções de ENDPOINT, não das linhas).
 */

const { buscarCandidaturasDaVaga } = vi.hoisted(() => ({ buscarCandidaturasDaVaga: vi.fn() }));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, buscarCandidaturasDaVaga };
});

vi.mock("@/lib/auth-context", async () => {
  const real = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...real, useAuth: () => ({ token: "t" }) };
});

vi.mock("@/lib/as-etapas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-etapas")>("@/lib/as-etapas");
  const { ETAPAS_FUNIL_SEMENTE } = await vi.importActual<typeof import("@ea/shared-types")>(
    "@ea/shared-types",
  );
  const catalogo = ETAPAS_FUNIL_SEMENTE.map((e, i) => ({
    id: i + 1,
    codigo: e.codigo,
    rotulo: e.rotulo,
    ordem: e.ordem,
    tom: e.tom,
    inicial: e.ordem === 1,
    ativa: true,
  }));
  return {
    ...real,
    useEtapas: () => ({
      etapas: catalogo,
      ativas: catalogo,
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

vi.mock("@/lib/as-status-vaga", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-status-vaga")>("@/lib/as-status-vaga");
  return {
    ...real,
    useStatusVaga: () => ({
      status: [],
      ativos: [],
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

import { VagaPainelModal } from "./VagaPainelModal";
import { ETAPA_FORA_DO_FUNIL } from "@/lib/as-painel-recorte";
import { normalizar } from "@/lib/as-vagas-lista";

const VAGA = {
  id: "vaga-1",
  status: "ABERTA",
  codigo: "PS-2026-001",
  nomeDivulgacao: "Operador De Caixa",
  dataAbertura: "2026-08-20T12:00:00.000Z",
  abertoPorNome: "Ana",
  fechamentoForcado: null,
  metaReducoes: [],
  posicoesOficiais: 5,
  posicoesBanco: 2,
  vagasFechadas: null,
  vagasFechadasBanco: null,
  ocupacao: { finalizadasOficial: 1, finalizadasBanco: 0, ocupadas: 1, livres: 4 },
} as unknown as VagaListItem;

function candidatura(over: Partial<AsCandidaturaItem>): AsCandidaturaItem {
  return {
    id: "c0",
    candidatoId: "p0",
    candidatoNome: "Sem Nome",
    vagaId: "vaga-1",
    vagaCodigo: "PS-2026-001",
    vagaNome: "Operador De Caixa",
    etapa: "TRIAGEM",
    situacao: "ATIVO",
    posicaoLado: null,
    motivoDescarte: null,
    alocadoEm: "2026-09-01T12:00:00.000Z",
    alocadoPorNome: "Ana",
    atualizadoEm: "2026-09-02T12:00:00.000Z",
    ultimoContatoEm: null,
    ...over,
  } as AsCandidaturaItem;
}

const BASE: AsCandidaturaItem[] = [
  candidatura({ id: "c7", candidatoId: "p7", candidatoNome: "Gustavo Nóbrega", etapa: "TRIAGEM", situacao: "DESCARTADO" }),
  candidatura({ id: "c3", candidatoId: "p3", candidatoNome: "Cláudia Nogueira", etapa: "CAPTACAO", situacao: "ATIVO" }),
  candidatura({ id: "c9", candidatoId: "p9", candidatoNome: "Ícaro Machado", etapa: "ENTREVISTA_CLIENTE", situacao: "DESISTIU" }),
  candidatura({ id: "c1", candidatoId: "p1", candidatoNome: "Ana Paula Ribeiro", etapa: "TRIAGEM", situacao: "ATIVO" }),
  candidatura({ id: "c6", candidatoId: "p6", candidatoNome: "Fabiana Assunção", etapa: "APROVACAO", situacao: "ENVIADO_PARA_ADMISSAO", posicaoLado: "BANCO" }),
  candidatura({ id: "c4", candidatoId: "p4", candidatoNome: "Décio Araújo", etapa: "APROVACAO", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
  candidatura({ id: "c2", candidatoId: "p2", candidatoNome: "Bruno Carvalho", etapa: "TRIAGEM", situacao: "APROVADO" }),
  candidatura({ id: "c8", candidatoId: "p8", candidatoNome: "Helena Sá", etapa: "CAPTACAO", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
  candidatura({ id: "c5", candidatoId: "p5", candidatoNome: "Éder Gonçalves", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" }),
];

const ALOCADOS = ["Fabiana Assunção", "Décio Araújo", "Helena Sá"];

/** O `resumo` da vaga INTEIRA, derivado da base (as contagens das abas lem dele, não da página). */
const RESUMO: AsOcupacaoVaga = (() => {
  const porDesfecho: Record<string, number> = {};
  let emSelecao = 0;
  for (const c of BASE) {
    if (c.situacao === "ATIVO") emSelecao += 1;
    else porDesfecho[c.situacao] = (porDesfecho[c.situacao] ?? 0) + 1;
  }
  const finalizadas = BASE.filter((c) => finalizaPosicao(c.situacao)).length;
  return {
    vagaId: "vaga-1",
    posicoesOficiais: 5,
    ocupadas: finalizadas,
    finalizadas,
    finalizadasOficial: BASE.filter((c) => finalizaPosicao(c.situacao) && c.posicaoLado === "OFICIAL").length,
    finalizadasBanco: BASE.filter((c) => finalizaPosicao(c.situacao) && c.posicaoLado === "BANCO").length,
    livres: 5 - 1,
    emSelecao,
    fora: (porDesfecho.DESCARTADO ?? 0) + (porDesfecho.DESISTIU ?? 0),
    excedida: false,
    porEtapa: { CAPTACAO: 1, TRIAGEM: 1, ENTREVISTA_SOULAN: 1 },
    porDesfecho,
  };
})();

/** O servidor, imitado: aba, busca, situação, etapa e ordenação por candidato. */
type ParamsFake = {
  aba?: string;
  busca?: string;
  filtroSituacao?: string[];
  filtroEtapa?: string[];
  ordenarPor?: string;
  direcao?: "asc" | "desc";
  offset?: number;
  limite?: number;
};

function etapaVisivelFake(c: AsCandidaturaItem): string {
  return candidaturaViva(c.situacao) ? c.etapa : ETAPA_FORA_DO_FUNIL;
}

function paginaFake(params: ParamsFake): AsCandidaturasDaVagaPagina {
  let itens = [...BASE];
  if (params.aba === "alocados") itens = itens.filter((c) => finalizaPosicao(c.situacao));
  const busca = params.busca?.trim();
  if (busca) itens = itens.filter((c) => normalizar(c.candidatoNome).includes(normalizar(busca)));
  if (params.filtroSituacao?.length) itens = itens.filter((c) => params.filtroSituacao!.includes(c.situacao));
  if (params.filtroEtapa?.length) itens = itens.filter((c) => params.filtroEtapa!.includes(etapaVisivelFake(c)));
  if (params.ordenarPor === "candidato") {
    itens.sort((a, b) => a.candidatoNome.localeCompare(b.candidatoNome, "pt-BR"));
    if (params.direcao === "desc") itens.reverse();
  }
  const offset = params.offset ?? 0;
  const limite = params.limite ?? 100;
  const total = itens.length;
  const page = itens.slice(offset, offset + limite);
  return {
    itens: page,
    total,
    limite,
    offset,
    truncado: offset + page.length < total,
    ...(offset === 0 ? { resumo: RESUMO } : {}),
  };
}

async function montar(abaInicial: "candidatos" | "alocados" = "candidatos") {
  buscarCandidaturasDaVaga.mockImplementation(async (_vagaId: string, params: ParamsFake) =>
    paginaFake(params),
  );
  const onMudou = vi.fn();
  render(
    <VagaPainelModal vaga={VAGA} token="t" onClose={() => {}} onMudou={onMudou} abaInicial={abaInicial}>
      <p>A ficha da vaga</p>
    </VagaPainelModal>,
  );
  await waitFor(() => expect(linhasVisiveis().length).toBeGreaterThan(0));
  return { onMudou };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── OS OLHOS DO TESTE ─────────────────────────────────────────────────────────

function linhasVisiveis(): { nome: string; marcada: boolean; habilitada: boolean }[] {
  return Array.from(document.querySelectorAll("tbody tr")).map((tr) => {
    const caixa = tr.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const celulas = Array.from(tr.querySelectorAll("td"));
    const nome = (celulas[1]?.textContent ?? "").trim();
    return { nome, marcada: caixa?.checked === true, habilitada: caixa !== null && !caixa.disabled };
  });
}

function caixaDaLinha(nome: string): HTMLInputElement {
  const tr = Array.from(document.querySelectorAll("tbody tr")).find(
    (linha) => (Array.from(linha.querySelectorAll("td"))[1]?.textContent ?? "").trim() === nome,
  );
  const caixa = tr?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!caixa) throw new Error(`Não há linha à vista para "${nome}".`);
  return caixa;
}

function nomesVisiveis(): string[] {
  return linhasVisiveis().map((l) => l.nome);
}

function marcar(nome: string) {
  fireEvent.click(caixaDaLinha(nome));
}

function contadorDaBarra(): number {
  const rotulo = screen.queryByText(/selecionadas:/i);
  if (!rotulo) return 0;
  const texto = rotulo.parentElement?.textContent ?? rotulo.textContent ?? "";
  const n = texto.match(/(\d+)/);
  return n ? Number(n[1]) : 0;
}

function cabecalhoDeCandidato(): HTMLElement {
  return screen.getByRole("button", { name: "Candidato" });
}

function caixaDeTodos(): HTMLInputElement {
  return screen.getByLabelText(/^Selecionar todos/i) as HTMLInputElement;
}

function campoDeBusca(): HTMLInputElement {
  const achado = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((el) => {
    if (el.type === "checkbox" || el.type === "radio") return false;
    const nome = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`;
    return /nome/i.test(nome);
  });
  if (!achado) throw new Error("CONTRATO NÃO ATENDIDO: não existe campo de busca por NOME.");
  return achado;
}

function buscar(termo: string) {
  fireEvent.change(campoDeBusca(), { target: { value: termo } });
}

function gatilhoDoFiltro(assunto: RegExp, comoChamar: string): HTMLElement {
  const gatilhos = Array.from(document.querySelectorAll<HTMLElement>('button[aria-haspopup="listbox"]'));
  const achado = gatilhos.find((el) => assunto.test(el.getAttribute("aria-label") ?? ""));
  if (!achado) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: não existe filtro múltiplo de ${comoChamar}. ` +
        `Encontrados: ${JSON.stringify(gatilhos.map((el) => el.getAttribute("aria-label")))}`,
    );
  }
  return achado;
}

function filtrarPor(assunto: RegExp, comoChamar: string, rotulo: string) {
  const gatilho = gatilhoDoFiltro(assunto, comoChamar);
  fireEvent.click(gatilho);
  const lista = screen.getByRole("listbox");
  const opcao = within(lista)
    .getAllByRole("option")
    .find((el) => (el.textContent ?? "").trim() === rotulo);
  if (!opcao) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: o filtro de ${comoChamar} não oferece "${rotulo}". ` +
        `Ofereceu: ${JSON.stringify(within(lista).getAllByRole("option").map((el) => el.textContent?.trim()))}`,
    );
  }
  fireEvent.click(opcao);
  fireEvent.click(gatilho);
}

const porSituacao = (rotulo: string) => filtrarPor(/situa/i, "SITUAÇÃO", rotulo);
const porEtapa = (rotulo: string) => filtrarPor(/etapa/i, "ETAPA", rotulo);

function trocarPara(aba: "A Vaga" | "Ver Candidatos" | "Ver Candidatos Alocados") {
  const botao = screen
    .getAllByRole("button")
    .find((el) => (el.textContent ?? "").trim().startsWith(aba));
  if (!botao) throw new Error(`Aba "${aba}" não encontrada.`);
  fireEvent.click(botao);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A PÁGINA VEM DO SERVIDOR, E O RECORTE É FILTRO SERVER-SIDE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a página e o recorte vêm do servidor", () => {
  it("abre pedindo a aba candidatos, e desenha o que o servidor devolveu", async () => {
    await montar();
    expect(nomesVisiveis()).toHaveLength(BASE.length);
    const [, params] = buscarCandidaturasDaVaga.mock.calls[0] as unknown as [string, ParamsFake];
    expect(params.aba).toBe("candidatos");
  });

  it("a BUSCA viaja ao servidor e a tela mostra o que ele devolveu", async () => {
    await montar();
    buscar("claudia");
    await waitFor(() => expect(nomesVisiveis()).toEqual(["Cláudia Nogueira"]));
    const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
    expect(ultima[1].busca).toBe("claudia");
  });

  it("a SITUAÇÃO viaja ao servidor como filtroSituacao", async () => {
    await montar();
    porSituacao("Em Seleção");
    await waitFor(() => expect(nomesVisiveis()).toEqual(["Cláudia Nogueira", "Ana Paula Ribeiro", "Éder Gonçalves"]));
    const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
    expect(ultima[1].filtroSituacao).toEqual(["ATIVO"]);
  });

  it("a ETAPA viaja ao servidor como filtroEtapa, e a tela mostra a interseção", async () => {
    await montar();
    porSituacao("Em Seleção");
    porEtapa("Triagem");
    await waitFor(() => expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]));
    const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
    expect(ultima[1].filtroSituacao).toEqual(["ATIVO"]);
    expect(ultima[1].filtroEtapa).toEqual(["TRIAGEM"]);
  });

  it('"Fora Do Funil" é opção e o servidor a recebe, trazendo quem saiu', async () => {
    await montar();
    porEtapa("Fora Do Funil");
    await waitFor(() => expect(nomesVisiveis().sort()).toEqual(["Gustavo Nóbrega", "Ícaro Machado"]));
    const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
    expect(ultima[1].filtroEtapa).toEqual([ETAPA_FORA_DO_FUNIL]);
  });

  it("vazio por recorte diz que foi o RECORTE, e não que a vaga está vazia", async () => {
    await montar();
    buscar("zzz não existe ninguém");
    await waitFor(() => expect(nomesVisiveis()).toHaveLength(0));
    expect(screen.queryByText("Ninguém foi vinculado a esta vaga ainda.")).toBeNull();
    expect(screen.getAllByText(/recorte|filtro|busca/i).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A SELEÇÃO: TODOS DO FILTRO = TOTAL, E O RECORTE A LIMPA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a seleção opera sobre o conjunto do filtro", () => {
  it('"selecionar todos" conta o TOTAL do recorte, não a página', async () => {
    await montar();
    fireEvent.click(caixaDeTodos());
    // Sem filtro, o total é a base inteira.
    expect(contadorDaBarra()).toBe(BASE.length);
  });

  it('com filtro, "selecionar todos" conta o total do RECORTE', async () => {
    await montar();
    porSituacao("Em Seleção");
    await waitFor(() => expect(nomesVisiveis()).toHaveLength(3));

    fireEvent.click(caixaDeTodos());
    expect(contadorDaBarra()).toBe(3);
  });

  it("mudar o recorte LIMPA a seleção manual (nada sobrevive invisível)", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    expect(contadorDaBarra()).toBe(2);

    porEtapa("Triagem");
    await waitFor(() => expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro", "Bruno Carvalho"]));
    // A seleção foi limpa: o conjunto mudou, e marca de um recorte anterior seria invisível.
    expect(contadorDaBarra()).toBe(0);
  });

  it("a BUSCA também limpa a seleção manual", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    expect(contadorDaBarra()).toBe(1);
    buscar("bruno");
    await waitFor(() => expect(nomesVisiveis()).toEqual(["Bruno Carvalho"]));
    expect(contadorDaBarra()).toBe(0);
  });

  it("a caixa da linha encerrada nasce desabilitada; a da linha viva, habilitada", async () => {
    await montar();
    expect(caixaDaLinha("Gustavo Nóbrega").disabled).toBe(true); // DESCARTADO
    expect(caixaDaLinha("Ícaro Machado").disabled).toBe(true); // DESISTIU
    expect(caixaDaLinha("Ana Paula Ribeiro").disabled).toBe(false); // ATIVO
    expect(caixaDaLinha("Décio Araújo").disabled).toBe(false); // ALOCADO ainda decide
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. OS CONTROLES OBEDECEM AO DESIGN SYSTEM (§A.28/§A.35/§A.37)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("os controles obedecem ao design system", () => {
  it("os dois filtros são MultiSelect, e não <select> nativo", async () => {
    await montar();
    gatilhoDoFiltro(/situa/i, "SITUAÇÃO");
    gatilhoDoFiltro(/etapa/i, "ETAPA");
    expect(document.querySelectorAll("select")).toHaveLength(0);
  });

  it("o filtro de situação oferece o vocabulário da aba, não só o presente", async () => {
    await montar();
    const gatilho = gatilhoDoFiltro(/situa/i, "SITUAÇÃO");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());
    expect(rotulos).toEqual([
      "Em Seleção",
      "Aprovado",
      "Alocado",
      "Descartado",
      "Desistiu",
      "Enviado Para Admissão",
    ]);
  });

  it("o filtro de etapa oferece o catálogo do diretor (§A.37), não só as presentes", async () => {
    await montar("alocados");
    const gatilho = gatilhoDoFiltro(/etapa/i, "ETAPA");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());
    expect(rotulos).toContain("Triagem");
    expect(rotulos).toContain("Entrevista Soulan");
    expect(rotulos).toContain("Entrevista Cliente");
  });

  it('"Fora Do Funil" não é oferecido na aba de alocados, onde ninguém saiu', async () => {
    await montar("alocados");
    const gatilho = gatilhoDoFiltro(/etapa/i, "ETAPA");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());
    expect(rotulos).not.toContain("Fora Do Funil");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. CADA ABA TEM O SEU RECORTE, E A TROCA REFAZ A BUSCA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("cada aba tem o seu recorte", () => {
  it("a aba de alocados pede ao servidor a aba alocados e mostra só quem entregou", async () => {
    await montar("alocados");
    expect(nomesVisiveis().sort()).toEqual([...ALOCADOS].sort());
    const [, params] = buscarCandidaturasDaVaga.mock.calls[0] as unknown as [string, ParamsFake];
    expect(params.aba).toBe("alocados");
  });

  it("trocar de aba refaz a busca na aba nova, sem herdar o recorte nem a seleção", async () => {
    await montar();
    porEtapa("Triagem");
    await waitFor(() => expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro", "Bruno Carvalho"]));
    marcar("Ana Paula Ribeiro");
    expect(contadorDaBarra()).toBe(1);

    trocarPara("Ver Candidatos Alocados");

    // A aba nova nasce sem filtro (lista inteira de alocados) e sem seleção.
    await waitFor(() => expect(nomesVisiveis().sort()).toEqual([...ALOCADOS].sort()));
    expect(contadorDaBarra()).toBe(0);
    const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
    expect(ultima[1].aba).toBe("alocados");
    expect(ultima[1].filtroEtapa ?? []).toEqual([]);
  });

  it("a contagem da aba vem do resumo (a vaga inteira), não da página filtrada", async () => {
    await montar();
    porSituacao("Em Seleção"); // recorta a lista, mas não a contagem da aba
    await waitFor(() => expect(nomesVisiveis()).toHaveLength(3));

    const abaCandidatos = screen
      .getAllByRole("button")
      .find((el) => (el.textContent ?? "").trim().startsWith("Ver Candidatos") && !/Alocados/.test(el.textContent ?? "")) as HTMLElement;
    // A base tem nove candidaturas; o recorte mostra três, e a aba continua dizendo nove.
    expect(abaCandidatos.textContent).toContain(String(BASE.length));
  });

  it("a aba de alocados mostra a contagem de quem entregou posição", async () => {
    await montar();
    const abaAlocados = screen
      .getAllByRole("button")
      .find((el) => (el.textContent ?? "").trim().startsWith("Ver Candidatos Alocados")) as HTMLElement;
    expect(abaAlocados.textContent).toContain(String(ALOCADOS.length));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. §A.29: A ORDENAÇÃO VIAJA AO SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a ordenação é server-side (§A.29)", () => {
  it("clicar no cabeçalho Candidato manda ordenarPor ao servidor, e a lista volta ordenada", async () => {
    await montar();
    fireEvent.click(cabecalhoDeCandidato());
    await waitFor(() => {
      const nomes = nomesVisiveis();
      return expect(nomes[0]).toBe("Ana Paula Ribeiro");
    });
    const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
    expect(ultima[1].ordenarPor).toBe("candidato");
    expect(ultima[1].direcao).toBe("asc");
  });

  it("o segundo clique inverte a direção", async () => {
    await montar();
    fireEvent.click(cabecalhoDeCandidato());
    await waitFor(() => expect(nomesVisiveis()[0]).toBe("Ana Paula Ribeiro"));
    fireEvent.click(cabecalhoDeCandidato());
    await waitFor(() => {
      const ultima = buscarCandidaturasDaVaga.mock.calls.at(-1) as unknown as [string, ParamsFake];
      return expect(ultima[1].direcao).toBe("desc");
    });
    expect(nomesVisiveis()[0]).toBe("Ícaro Machado");
  });
});
