// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PandapeEntradaItem } from "@ea/shared-types";

/**
 * ─ A SEÇÃO "CPF INVÁLIDO" DO DIAGNÓSTICO VEM DA pandape_entrada, NÃO DOS JOBS DO BULLMQ ──────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita a partir do requisito por quem não escreveu a tela.
 *
 * ┌─ O REQUISITO ────────────────────────────────────────────────────────────────────────────────┐
 * │ A lista de CPF inválido do Diagnóstico passa a vir da tabela durável `pandape_entrada` (motivo │
 * │ CPF_INVALIDO, `resolvido_em` nulo), e NÃO mais dos jobs `failed` do BullMQ. Motivo medido: o   │
 * │ backoff do sync-candidate virou 1h, então um CPF inválido fica ~31h em `delayed` e NUNCA em    │
 * │ `failed` -> some de qualquer leitura por fila. A entrada durável não some. Resolveu (carimbou  │
 * │ `resolvido_em`), SAI da seção.                                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A FILTRAGEM É NO FRONTEND (medido em `app/(app)/admin/diagnostico/page.tsx`: o memo `cpfInvalidos`
 * faz `.filter((i) => i.motivo === "CPF_INVALIDO" && i.resolvidoEm === null)` sobre o que
 * `listarEntradasPandape` devolve). Por isso o teste é de COMPONENTE: monta a página de verdade,
 * injeta uma lista com os três casos e prova que SÓ o pendente de CPF inválido é desenhado, que o
 * resolvido e o de outro motivo ficam de fora, e que o contador reflete 1.
 *
 * §A.6: os nomes são SINTÉTICOS, não há CPF em lugar nenhum da fixture, e os ids são de SISTEMA.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", async () => {
  // ApiError de verdade: a página decide a mensagem de erro por `instanceof`.
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "t", isAdmin: true, usuario: null, temMenu: () => true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/diagnostico",
  useSearchParams: () => new URLSearchParams(),
}));

// O painel de órfãos de VT faz a própria busca no mount; fora do escopo deste teste.
vi.mock("@/components/admin/PainelVtOrfaos", () => ({ PainelVtOrfaos: () => null }));

import DiagnosticoPage from "./page";

/** Snapshot completo o bastante para a página sair do estado "Carregando" e desenhar a seção. */
const SNAP = {
  geradoEm: "2026-10-07T12:00:00.000Z",
  sinais: [],
  fopagSemPasta: { chave: "fopag-sem-pasta", rotulo: "Cliente Fopag Sem Pasta", total: 0, itens: [] },
  dependencias: [],
  ultimaColeta: { quando: null, candidato: null, arquivos: 0, nota: "" },
  historico: [],
  scheduler: {
    ligado: true,
    parado: false,
    ultimoCicloEm: null,
    ultimoCicloOkEm: null,
    varridas: 0,
    novos: 0,
    falhas: 0,
    abortado: false,
    nota: null,
  },
  alerta: { aceso: false, total: 0, motivos: [] },
};

const PENDENTE = "Candidato Pendente Teste";
const RESOLVIDO = "Resolvido Nao Aparece Teste";
const OUTRO_MOTIVO = "Outro Motivo Nao Aparece Teste";

function item(over: Partial<PandapeEntradaItem>): PandapeEntradaItem {
  return {
    id: "e-0",
    idPrecollaborator: "900000",
    idVacancy: "V-900",
    candidatoNome: "Fulano De Ficcao",
    origem: "WEBHOOK",
    desfecho: "ADIADO",
    motivo: "CPF_INVALIDO",
    tentativas: 1,
    recebidoEm: "2026-10-05T09:00:00.000Z",
    ultimaTentativaEm: "2026-10-05T10:00:00.000Z",
    resolvidoEm: null,
    admissaoId: null,
    ...over,
  };
}

/** Os três casos do requisito: um entra, dois ficam de fora. */
const ENTRADAS: PandapeEntradaItem[] = [
  item({ id: "e1", idPrecollaborator: "900001", candidatoNome: PENDENTE, motivo: "CPF_INVALIDO", resolvidoEm: null }),
  // Mesmo motivo, mas JÁ resolvido: saiu da fila, não pode aparecer.
  item({
    id: "e2",
    idPrecollaborator: "900002",
    candidatoNome: RESOLVIDO,
    desfecho: "PRE_ADMISSAO",
    motivo: "CPF_INVALIDO",
    resolvidoEm: "2026-10-06T08:00:00.000Z",
  }),
  // Pendente, mas de OUTRO motivo: não é caso de CPF inválido.
  item({ id: "e3", idPrecollaborator: "900003", candidatoNome: OUTRO_MOTIVO, motivo: "SEM_DE_PARA", resolvidoEm: null }),
];

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((path: string) => {
    if (path === "/diagnostico") return Promise.resolve(SNAP);
    if (path.startsWith("/pandape-entradas")) return Promise.resolve(ENTRADAS);
    return Promise.resolve({});
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A tabela da seção "CPF Inválido", achada pelo cabeçalho de coluna que só ela tem. */
async function tabelaCpf(): Promise<HTMLTableElement> {
  const cabecalho = await screen.findByText("Recebido Em");
  const tabela = cabecalho.closest("table");
  if (!tabela) throw new Error("tabela da seção CPF Inválido não encontrada");
  return tabela as HTMLTableElement;
}

describe("Diagnóstico: seção CPF Inválido", () => {
  it("desenha SÓ o CPF_INVALIDO pendente; esconde o resolvido e o de outro motivo", async () => {
    render(<DiagnosticoPage />);

    const tabela = await tabelaCpf();
    // O pendente de CPF inválido está lá.
    expect(await within(tabela).findByText(PENDENTE)).toBeTruthy();
    // O resolvido (mesmo motivo) e o de outro motivo NÃO entram.
    expect(within(tabela).queryByText(RESOLVIDO)).toBeNull();
    expect(within(tabela).queryByText(OUTRO_MOTIVO)).toBeNull();
    // Por garantia, eles também não aparecem em nenhum outro canto da página.
    expect(screen.queryByText(RESOLVIDO)).toBeNull();
    expect(screen.queryByText(OUTRO_MOTIVO)).toBeNull();
  });

  it("o contador da seção mostra 1 (um pendente, não os três itens recebidos)", async () => {
    render(<DiagnosticoPage />);

    const titulo = await screen.findByRole("heading", { name: "CPF Inválido" });
    // heading -> div (eyebrow+h2) -> linha de cabeçalho (flex) que também carrega o StatusPill.
    const linhaCabecalho = titulo.parentElement?.parentElement;
    if (!linhaCabecalho) throw new Error("cabeçalho da seção CPF Inválido não encontrado");
    expect(within(linhaCabecalho as HTMLElement).getByText("1")).toBeTruthy();
  });

  it("só uma linha de dados na tabela (a régua é pendente + CPF_INVALIDO)", async () => {
    render(<DiagnosticoPage />);

    const tabela = await tabelaCpf();
    await within(tabela).findByText(PENDENTE);
    const linhas = within(tabela).getAllByText(/^ID 9000\d{2}$/);
    // Só o pendente (900001) tem linha; 900002 e 900003 ficaram de fora.
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toBe("ID 900001");
  });
});
