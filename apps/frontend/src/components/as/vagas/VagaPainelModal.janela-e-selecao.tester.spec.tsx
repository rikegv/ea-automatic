// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem, VagaListItem } from "@ea/shared-types";

/**
 * ─ A JANELA DE RENDER NÃO PODE QUEBRAR O "SELECIONAR TODOS" (cobertura independente, §A.38) ─────
 *
 * ESCRITA POR OUTRA CABEÇA, SEM LER A SUPOSIÇÃO DO AUTOR. O spec de recorte-e-seleção do painel usa
 * NOVE linhas, ABAIXO do limiar `JANELA_INICIAL = 80`, então nunca exercita o fatiamento: naquele
 * arquivo `ord.itens.slice(0, janela)` desenha a lista inteira, e um "selecionar todos" que, por
 * engano, operasse sobre as linhas DESENHADAS passaria verde ali.
 *
 * O REQUISITO QUE ESTE ARQUIVO TRAVA, com MAIS de 80 candidaturas:
 *   (a) "selecionar todos" marca TODAS (150), e não só as 80 pintadas no primeiro frame;
 *   (b) a barra da seleção conta o conjunto INTEIRO (150), não a janela;
 *   (c) a tabela NÃO desenha as 150 de uma vez: o `<tbody>` tem só `JANELA_INICIAL` linhas enquanto a
 *       revelação de segundo plano não andou (o fatiamento vale de verdade).
 *
 * POR QUE FAKE TIMERS: a revelação de segundo plano (cadeia de setTimeout) salta de 80 para 150 no
 * PRIMEIRO disparo (`JANELA_PASSO = 200`, capado em 150). Deixar o relógio real correr tornaria "(c)"
 * uma corrida: ou mede 80, ou mede 150, conforme a máquina. Congelando o tempo, a janela fica em 80
 * até eu mandar avançar, e o salto para 150 vira uma asserção A MAIS, em vez de um risco de flake.
 *
 * §A.6: dado sintético (nomes de catálogo, sem CPF). §A.11: sem travessão.
 */

const { painelDaVaga } = vi.hoisted(() => ({ painelDaVaga: vi.fn() }));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, painelDaVaga };
});

/** O catálogo de etapas vem da rede: dublado com a SEMENTE do vocabulário compartilhado. */
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
  const real =
    await vi.importActual<typeof import("@/lib/as-status-vaga")>("@/lib/as-status-vaga");
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

const VAGA = {
  id: "vaga-1",
  status: "ABERTA",
  codigo: "PS-2026-001",
  nomeDivulgacao: "Operador De Caixa",
  dataAbertura: "2026-08-20T12:00:00.000Z",
  abertoPorNome: "Ana",
  fechamentoForcado: null,
  metaReducoes: [],
  posicoesOficiais: 200,
  posicoesBanco: 0,
  vagasFechadas: null,
  vagasFechadasBanco: null,
  ocupacao: { finalizadasOficial: 0, finalizadasBanco: 0, ocupadas: 0, livres: 200 },
} as unknown as VagaListItem;

/**
 * 150 CANDIDATURAS, TODAS VIVAS (`ATIVO`). Vivas de propósito: `podeDecidir` é verdadeiro para elas,
 * logo `idsVisiveis` (a base do "selecionar todos") é o conjunto inteiro, sem caixa desabilitada
 * confundindo a contagem. É o número que separa a janela (80) do conjunto (150).
 */
const TOTAL = 150;
const JANELA_INICIAL = 80; // espelha a constante de produção; se ela mudar, este teste acusa.

const LISTA: AsCandidaturaItem[] = Array.from({ length: TOTAL }, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  return {
    id: `c${n}`,
    candidatoId: `p${n}`,
    candidatoNome: `Candidato ${n}`,
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
  } as AsCandidaturaItem;
});

/**
 * Monta o painel com o tempo CONGELADO e o carregamento assíncrono já resolvido, sem deixar a cadeia
 * de revelação andar. `advanceTimersByTimeAsync(0)` flusha os microtasks (a promessa de
 * `painelDaVaga`) e roda só os timers vencidos em 0ms, nunca o de 150ms da revelação.
 */
async function montar() {
  vi.useFakeTimers();
  painelDaVaga.mockResolvedValue({ candidaturas: LISTA });
  render(
    <VagaPainelModal vaga={VAGA} token="t" onClose={() => {}} onMudou={vi.fn()} abaInicial="candidatos">
      <p>A ficha da vaga</p>
    </VagaPainelModal>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function linhasDesenhadas(): number {
  return document.querySelectorAll("tbody tr").length;
}

function caixaDeTodos(): HTMLInputElement {
  return screen.getByLabelText(/^Selecionar todos/i) as HTMLInputElement;
}

/** O número que a BARRA DA SELEÇÃO mostra. Zero quando a barra nem existe (nada marcado). */
function contadorDaBarra(): number {
  const rotulo = screen.queryByText(/selecionadas:/i);
  if (!rotulo) return 0;
  const texto = rotulo.parentElement?.textContent ?? rotulo.textContent ?? "";
  const n = texto.match(/(\d+)/);
  return n ? Number(n[1]) : 0;
}

describe("a janela de render e o selecionar todos (mais de 80 candidaturas)", () => {
  it("(c) o tbody desenha só JANELA_INICIAL no primeiro frame, não as 150 de uma vez", async () => {
    await montar();
    // A prova do fatiamento: 80 linhas pintadas, não 150. O texto de apoio confirma o total.
    expect(linhasDesenhadas()).toBe(JANELA_INICIAL);
    expect(screen.getByText(/desenhadas/i).parentElement?.textContent ?? "").toContain(
      String(TOTAL),
    );
  });

  it("(a)+(b) selecionar todos marca AS 150 e a barra conta 150, com só 80 desenhadas", async () => {
    await montar();
    expect(linhasDesenhadas()).toBe(JANELA_INICIAL);
    expect(contadorDaBarra()).toBe(0);

    act(() => {
      caixaDeTodos().click();
    });

    // A régua central: "todos" opera sobre `ord.itens` INTEIRO, não sobre a janela de 80.
    expect(contadorDaBarra()).toBe(TOTAL);
    // E a tabela continua desenhando só 80: a seleção não force o render do conjunto inteiro.
    expect(linhasDesenhadas()).toBe(JANELA_INICIAL);
    // Toda linha DESENHADA está marcada (as 80 à vista refletem a seleção de 150).
    const marcadas = Array.from(
      document.querySelectorAll<HTMLInputElement>('tbody tr input[type="checkbox"]'),
    ).filter((c) => c.checked).length;
    expect(marcadas).toBe(JANELA_INICIAL);
  });

  it("o cabeçalho fica marcado porque TODO o conjunto (150) está selecionado, não só as 80 à vista", async () => {
    await montar();

    act(() => {
      caixaDeTodos().click();
    });

    // `todosVisiveisMarcados` compara contra `idsVisiveis` (as 150), então só fica marcado se o
    // conjunto inteiro entrou na seleção. Marcar só as 80 desenhadas deixaria esta caixa VAZIA.
    expect(caixaDeTodos().checked).toBe(true);
    expect(contadorDaBarra()).toBe(TOTAL);
  });

  it("deixar a revelação andar completa a janela até 150 sem mexer na seleção de 150", async () => {
    await montar();
    act(() => {
      caixaDeTodos().click();
    });
    expect(contadorDaBarra()).toBe(TOTAL);
    expect(linhasDesenhadas()).toBe(JANELA_INICIAL);

    // Avança o relógio: a cadeia de revelação salta de 80 para 150 (JANELA_PASSO cobre o resto).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(linhasDesenhadas()).toBe(TOTAL);
    // A seleção não foi tocada pela revelação, e agora as 150 desenhadas aparecem marcadas.
    expect(contadorDaBarra()).toBe(TOTAL);
    const marcadas = Array.from(
      document.querySelectorAll<HTMLInputElement>('tbody tr input[type="checkbox"]'),
    ).filter((c) => c.checked).length;
    expect(marcadas).toBe(TOTAL);
  });
});
