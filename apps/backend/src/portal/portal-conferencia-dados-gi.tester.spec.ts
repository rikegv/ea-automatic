import { describe, expect, it, vi } from "vitest";
import { PortalDadosGiService } from "./portal-gi-gravacao.service";
import { portalConferencia, admissaoDadosGi } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), do REQUISITO, em paralelo a construcao. NAO escrevi o codigo.
 *
 * REQ 3 (C9): apos a confirmacao do candidato (POST /portal/dados-gi), a conferencia daquela
 * admissao tem os `campos` ANULADOS (`[]`) e `confirmado_em` carimbado. O valor autoritativo passa
 * a viver em `admissao_dados_gi`; a sugestao crua da IA nao pode seguir viva. O `veredito` sobrevive
 * de proposito (a tela ainda diz "ajustar" num reprovado), entao a anulacao NAO pode limpar veredito.
 *
 * A anulacao acontece na MESMA transacao da gravacao do GI: se uma some, some a outra (C9).
 *
 * §A.6: fixtures sinteticos.
 */

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

const ADM = "adm-gi-1";

function montar() {
  const txUpdates: Escrita[] = [];
  const txInserts: Escrita[] = [];
  const foraInserts: Escrita[] = [];
  let transacaoUsada = false;

  const update = (colecao: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      colecao.push({ tabela, valores });
      const fim = { where: async () => undefined, then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r) };
      return fim;
    },
  });
  const insert = (colecao: Escrita[]) => (tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      colecao.push({ tabela, valores });
      return { onConflictDoUpdate: async () => undefined, onConflictDoNothing: async () => undefined };
    },
  });

  const db = {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      transacaoUsada = true;
      const tx = { insert: insert(txInserts), update: update(txUpdates) };
      return cb(tx);
    },
    insert: insert(foraInserts),
    update: update(foraInserts),
  };

  const registrar = vi.fn(async () => {});
  const trilha = { registrar } as never;

  const svc = new PortalDadosGiService(db as never, trilha);
  return { svc, txUpdates, txInserts, foraInserts, get transacaoUsada() { return transacaoUsada; }, registrar };
}

const gravar = (svc: PortalDadosGiService) =>
  svc.gravar({
    admissaoId: ADM,
    jtiLink: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    campos: [{ campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confirmadoPorHumano: true }],
    ip: null,
  });

describe("REQ 3: a confirmacao do GI anula os campos da conferencia e carimba confirmado_em", () => {
  it("ha um update em portal_conferencia com campos=[] e confirmado_em preenchido", async () => {
    const ctx = montar();
    await gravar(ctx.svc);

    const anulacoes = [...ctx.txUpdates, ...ctx.foraInserts].filter((u) => u.tabela === portalConferencia);
    expect(anulacoes).toHaveLength(1);
    const set = anulacoes[0]!.valores;
    expect(set.campos).toEqual([]);
    expect(set.confirmadoEm).toBeInstanceOf(Date);
  });

  it("a anulacao NAO limpa o veredito (ele sobrevive para a tela dizer 'ajustar')", async () => {
    const ctx = montar();
    await gravar(ctx.svc);
    const set = ctx.txUpdates.find((u) => u.tabela === portalConferencia)!.valores;
    expect("veredito" in set).toBe(false);
  });

  it("a anulacao roda na MESMA transacao da gravacao do GI (C9)", async () => {
    const ctx = montar();
    await gravar(ctx.svc);
    expect(ctx.transacaoUsada).toBe(true);
    // Na mesma transacao: a gravacao em admissao_dados_gi e a anulacao em portal_conferencia.
    expect(ctx.txInserts.some((i) => i.tabela === admissaoDadosGi)).toBe(true);
    expect(ctx.txUpdates.some((u) => u.tabela === portalConferencia)).toBe(true);
  });
});
