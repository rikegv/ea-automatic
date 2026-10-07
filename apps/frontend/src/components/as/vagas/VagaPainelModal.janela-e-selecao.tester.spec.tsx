// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AsCandidaturaItem,
  AsCandidaturasDaVagaPagina,
  AsOcupacaoVaga,
  VagaListItem,
} from "@ea/shared-types";

/**
 * ─ A PÁGINA NO SERVIDOR DESENHA SÓ A PÁGINA, E "TODOS DO FILTRO" COBRE O TOTAL (§A.38) ──────────
 *
 * ESCRITA POR OUTRA CABEÇA. Antes esta cobertura travava o render em janela (desenhar 80 de 150 no
 * cliente). A aba agora PAGINA NO SERVIDOR: o backend devolve só a página, e a invariante que o
 * diretor pinou (ec2ea83) é que "selecionar todos" e as contagens operam sobre o CONJUNTO INTEIRO do
 * filtro, nunca sobre a página.
 *
 * O REQUISITO QUE ESTE ARQUIVO TRAVA, com um total MUITO maior que a página:
 *   (a) o `<tbody>` desenha SÓ a página do servidor (`limite`), não as 2.509 de uma vez;
 *   (b) "selecionar todos do recorte" liga o modo "todos do filtro" e a barra conta o TOTAL (2.509),
 *       sem baixar as 2.509 linhas (o navegador nunca segura o conjunto inteiro).
 *
 * §A.6: dado sintético (nomes de catálogo, sem CPF). §A.11: sem travessão.
 */

const { buscarCandidaturasDaVaga } = vi.hoisted(() => ({ buscarCandidaturasDaVaga: vi.fn() }));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, buscarCandidaturasDaVaga };
});

// A paginação lê o token da sessão pelo `useAuth`; sem provider ele lançaria. Dublado com um token.
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

const TOTAL = 2509;
const PAGINA = 100; // espelha PAGINA_TAMANHO do componente; se ela mudar, este teste acusa.

/** O `resumo` é a ocupação da vaga INTEIRA (todas vivas em Triagem), não a página. */
const RESUMO: AsOcupacaoVaga = {
  vagaId: "vaga-1",
  posicoesOficiais: 200,
  ocupadas: 0,
  finalizadas: 0,
  finalizadasOficial: 0,
  finalizadasBanco: 0,
  livres: 200,
  emSelecao: TOTAL,
  fora: 0,
  excedida: false,
  porEtapa: { TRIAGEM: TOTAL },
  porDesfecho: {},
};

function linhaFake(i: number): AsCandidaturaItem {
  const n = String(i + 1).padStart(4, "0");
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
}

async function montar() {
  buscarCandidaturasDaVaga.mockImplementation(
    async (_vagaId: string, params: { offset?: number; limite?: number }): Promise<AsCandidaturasDaVagaPagina> => {
      const offset = params.offset ?? 0;
      const limite = params.limite ?? PAGINA;
      const itens = Array.from({ length: Math.min(limite, TOTAL - offset) }, (_, i) =>
        linhaFake(offset + i),
      );
      return {
        itens,
        total: TOTAL,
        limite,
        offset,
        truncado: offset + itens.length < TOTAL,
        ...(offset === 0 ? { resumo: RESUMO } : {}),
      };
    },
  );
  render(
    <VagaPainelModal vaga={VAGA} token="t" onClose={() => {}} onMudou={vi.fn()} abaInicial="candidatos">
      <p>A ficha da vaga</p>
    </VagaPainelModal>,
  );
  await waitFor(() => expect(linhasDesenhadas()).toBeGreaterThan(0));
}

afterEach(() => {
  cleanup();
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

describe("a página no servidor e o selecionar todos do filtro", () => {
  it("(a) o tbody desenha SÓ a página do servidor, não as 2.509 de uma vez", async () => {
    await montar();
    expect(linhasDesenhadas()).toBe(PAGINA);
  });

  it("(b) selecionar todos do recorte liga o modo e a barra conta o TOTAL, sem baixar as 2.509", async () => {
    await montar();
    expect(contadorDaBarra()).toBe(0);

    fireEvent.click(caixaDeTodos());

    // A régua do diretor: a seleção é sobre o CONJUNTO INTEIRO do filtro, não sobre a página.
    expect(contadorDaBarra()).toBe(TOTAL);
    // E a tabela continua desenhando só a página: ligar "todos" não força o render do conjunto.
    expect(linhasDesenhadas()).toBe(PAGINA);
  });

  it("a caixa do cabeçalho fica marcada quando o modo todos do filtro está ligado", async () => {
    await montar();
    fireEvent.click(caixaDeTodos());
    expect(caixaDeTodos().checked).toBe(true);
    // Clicar de novo limpa.
    fireEvent.click(caixaDeTodos());
    expect(contadorDaBarra()).toBe(0);
    expect(caixaDeTodos().checked).toBe(false);
  });
});
