// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuCatalogoItem, Papel } from "@ea/shared-types";

/**
 * ─ A RÉGUA DE HABILITAR A CAIXA, na tela que CONCEDE menu ──────────────────────────────────────
 *
 * ┌─ O DEFEITO QUE ESTES TESTES TRANCAM (medido em 26/09/2026) ─────────────────────────────────┐
 * │ A tela guardava a lista de bloqueio à mão, com DOIS códigos, enquanto o backend aplicava uma │
 * │ de ONZE mais a dos exclusivos do Super Admin. Divergiram, e o efeito era silencioso: a caixa │
 * │ aparecia marcável, o diretor marcava, a tela salvava sem reclamar e o servidor descartava.   │
 * │ Ninguém via erro, e a pessoa não recebia o acesso.                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A régua agora desce do servidor POR MENU, e o que estes testes afirmam é o cruzamento com o PAPEL
 * do alvo mais a presença do MOTIVO escrito. O motivo é metade da entrega: caixa desabilitada sem
 * explicação vira chamado, porque quem não pode marcar não descobre por quê.
 *
 * O ÚLTIMO CASO é o da COMPATIBILIDADE: enquanto o backend em pé ainda não devolve `restricao`, item
 * sem o campo tem de continuar MARCÁVEL. Lido como restrição, um `undefined` bloquearia a lista
 * inteira, e a tela que existe para abrir portas trancaria todas.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

import { ConfigMenusModal } from "./ConfigMenusModal";

function menu(
  codigo: string,
  restricao: MenuCatalogoItem["restricao"] | undefined,
  ordem: number,
): Record<string, unknown> {
  return {
    codigo,
    rotulo: codigo,
    href: `/${codigo}`,
    grupo: "ADMIN",
    ordem,
    areas: ["ADM"],
    ...(restricao ? { restricao } : {}),
  };
}

const CATALOGO = [
  menu("so-super", "SO_SUPER_ADMIN", 1),
  menu("nao-comum", "NAO_PARA_COMUM", 2),
  menu("livre", "NENHUMA", 3),
  menu("sem-campo", undefined, 4),
];

async function abrir(papel: Papel) {
  apiFetch.mockImplementation(async (path: string) =>
    path.endsWith("/menus/catalogo") ? CATALOGO : { codigos: [], areas: ["ADM"] },
  );
  render(
    <ConfigMenusModal
      usuario={{ id: "u1", nome: "Alvo", papel }}
      token="t"
      onClose={() => {}}
    />,
  );
  await waitFor(() => expect(screen.getByText("livre")).toBeTruthy());
}

/** A caixa daquela linha: a `label` inteira é o alvo do `title`, o input é quem carrega o disabled. */
function linha(codigo: string): { caixa: HTMLInputElement; label: HTMLElement } {
  const rotulo = screen.getByText(codigo);
  const label = rotulo.closest("label") as HTMLElement;
  return { caixa: label.querySelector("input") as HTMLInputElement, label };
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

describe("ConfigMenusModal, restrição de concessão por menu", () => {
  it("SO_SUPER_ADMIN fica desabilitado para alvo MASTER, com o motivo escrito", async () => {
    await abrir("MASTER");
    const { caixa, label } = linha("so-super");
    expect(caixa.disabled).toBe(true);
    expect(screen.getByText("somente super admin")).toBeTruthy();
    expect(label.getAttribute("title")).toContain("Restrito ao Super Admin");
  });

  it("SO_SUPER_ADMIN fica desabilitado para alvo COMUM, com o motivo escrito", async () => {
    await abrir("COMUM");
    const { caixa, label } = linha("so-super");
    expect(caixa.disabled).toBe(true);
    expect(screen.getByText("somente super admin")).toBeTruthy();
    expect(label.getAttribute("title")).toContain("Restrito ao Super Admin");
  });

  it("NAO_PARA_COMUM fica habilitado para MASTER e desabilitado para COMUM, com o motivo", async () => {
    await abrir("MASTER");
    expect(linha("nao-comum").caixa.disabled).toBe(false);
    expect(screen.queryByText("somente administração")).toBeNull();
    cleanup();

    await abrir("COMUM");
    const { caixa, label } = linha("nao-comum");
    expect(caixa.disabled).toBe(true);
    expect(screen.getByText("somente administração")).toBeTruthy();
    expect(label.getAttribute("title")).toContain("perfil Comum");
  });

  it("sem restrição fica habilitado para MASTER e para COMUM, e a lateral mostra a rota", async () => {
    for (const papel of ["MASTER", "COMUM"] as Papel[]) {
      await abrir(papel);
      expect(linha("livre").caixa.disabled).toBe(false);
      expect(screen.getByText("/livre")).toBeTruthy();
      cleanup();
    }
  });

  it("item que chega SEM o campo `restricao` é tratado como NENHUMA, e não bloqueia", async () => {
    await abrir("COMUM");
    expect(linha("sem-campo").caixa.disabled).toBe(false);
    expect(screen.getByText("/sem-campo")).toBeTruthy();
  });
});
