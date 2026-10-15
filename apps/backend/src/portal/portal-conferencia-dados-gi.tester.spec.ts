import { describe, expect, it, vi } from "vitest";
import { PortalDadosGiService } from "./portal-gi-gravacao.service";
import { portalConferencia, admissaoDadosGi } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), do REQUISITO. NAO escrevi o codigo.
 *
 * REQ 3 (C9), REESCRITO EM 15/10/2026 (conserto da anulacao, Rike via b3; pareceres de seguranca e
 * tester): apos a confirmacao de UM documento (POST /portal/dados-gi com `tipoDocumento`), a conferencia
 * DAQUELE documento, e so ela, tem os `campos` zerados (`[]`) e `confirmado_em` carimbado. O valor
 * autoritativo passa a viver em `admissao_dados_gi`.
 *
 * ⚠️ A ANULACAO E ESCOPADA AO DOCUMENTO CONFIRMADO, NUNCA A ADMISSAO NEM "por chave contra todas as
 * conferencias". O front confirma UM documento por vez e manda o CODIGO do tipo. As chaves de extracao
 * NAO sao unicas por documento (`pis` sai de CTPS e de PIS_PASEP; `nomeCompleto`/`dataNascimento`/
 * `cidadeNascimento` de varios) e a conferencia guarda o CATALOGO INTEIRO do tipo, entao anular por
 * admissao (o bug original) ou por chave (a 1a tentativa deste conserto) ou (1) escondia o documento que
 * o candidato nunca confirmou, ou (2) auto-confirmava um documento irmao que compartilha uma chave
 * (GAP#1 do seguranca/tester), ou (3) deixava um documento com campo compartilhado deduplicado preso
 * "pendente" para sempre (GAP#7 do tester). Escopar ao documento confirmado fecha os tres.
 *
 * `veredito` sobrevive de proposito ("ajustar" num reprovado). Tudo na MESMA transacao (C9). §A.6: sintetico.
 */

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

const ADM = "adm-gi-1";

function montar(conferencias: Array<{ id: string; codigo: string }>) {
  const txUpdates: Escrita[] = [];
  const txInserts: Escrita[] = [];
  const foraInserts: Escrita[] = [];
  let transacaoUsada = false;

  const update = (colecao: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      colecao.push({ tabela, valores });
      return { where: async () => undefined };
    },
  });
  const insert = (colecao: Escrita[]) => (tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      colecao.push({ tabela, valores });
      return { onConflictDoUpdate: async () => undefined, onConflictDoNothing: async () => undefined };
    },
  });
  // A leitura das conferencias vivas da admissao (join com tipos_documento para trazer o codigo). O
  // escopo por `admissao_id` esta no `.where`; a escolha do documento confirmado e por codigo no servico.
  const select = () => ({ from: () => ({ innerJoin: () => ({ where: async () => conferencias }) }) });

  const db = {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      transacaoUsada = true;
      return cb({ insert: insert(txInserts), update: update(txUpdates), select });
    },
    insert: insert(foraInserts), // fora da transacao: o rastro do aceite
  };

  const registrar = vi.fn(async () => {});
  const svc = new PortalDadosGiService(db as never, { registrar } as never);
  return {
    svc,
    txUpdates,
    txInserts,
    get transacaoUsada() {
      return transacaoUsada;
    },
  };
}

// O candidato confirma UM documento (como a tela faz, "um documento por vez"), ou o passo FINAL sem tipo.
const gravar = (svc: PortalDadosGiService, tipoDocumento?: string) =>
  svc.gravar({
    admissaoId: ADM,
    jtiLink: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    campos: [{ campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confirmadoPorHumano: true }],
    tipoDocumento,
    ip: null,
  });

const anulacoes = (ctx: ReturnType<typeof montar>) =>
  ctx.txUpdates.filter((u) => u.tabela === portalConferencia);

describe("REQ 3: a confirmacao de UM documento zera A CONFERENCIA DAQUELE documento, e so ela", () => {
  it("confirmar o RG zera a conferencia do RG: campos=[] + confirmado_em", async () => {
    const ctx = montar([{ id: "conf-rg", codigo: "RG" }]);
    await gravar(ctx.svc, "RG");
    expect(anulacoes(ctx)).toHaveLength(1);
    const set = anulacoes(ctx)[0]!.valores;
    expect(set.campos).toEqual([]);
    expect(set.confirmadoEm).toBeInstanceOf(Date);
  });

  it("⚠️ GAP#1: confirmar a CTPS NAO toca a conferencia do PIS_PASEP (chave `pis` compartilhada)", async () => {
    // So a conferencia do PIS_PASEP esta viva. A CTPS tambem le `pis`, mas confirmar a CTPS NAO pode
    // auto-confirmar o PIS_PASEP: a anulacao e por DOCUMENTO, nao por chave.
    const ctx = montar([{ id: "conf-pis", codigo: "PIS_PASEP" }]);
    await gravar(ctx.svc, "CTPS");
    expect(anulacoes(ctx)).toHaveLength(0);
  });

  it("confirmar a CTPS entre varias conferencias faz UM unico update (nao zera a admissao toda)", async () => {
    const ctx = montar([
      { id: "conf-ctps", codigo: "CTPS" },
      { id: "conf-pis", codigo: "PIS_PASEP" },
      { id: "conf-rg", codigo: "RG" },
    ]);
    await gravar(ctx.svc, "CTPS");
    expect(anulacoes(ctx)).toHaveLength(1);
    expect(anulacoes(ctx)[0]!.valores.campos).toEqual([]);
  });

  it("⚠️ GAP#7: o documento confirmado SEMPRE completa, mesmo com campos compartilhados deduplicados", async () => {
    // O full-clear da conferencia do documento confirmado nao depende de QUAIS chaves vieram no POST
    // (o front pode ter deduplicado nomeCompleto/dataNascimento), entao a conferencia nunca fica presa
    // "pendente para sempre" por residuo compartilhado.
    const ctx = montar([{ id: "conf-rg", codigo: "RG" }]);
    await gravar(ctx.svc, "RG");
    const set = anulacoes(ctx)[0]!.valores;
    expect(set.campos).toEqual([]);
    expect(set.confirmadoEm).toBeInstanceOf(Date);
  });

  it("o passo FINAL (sem tipoDocumento) NAO anula conferencia nenhuma, mas grava o dossie", async () => {
    const ctx = montar([{ id: "conf-rg", codigo: "RG" }]);
    await gravar(ctx.svc); // sem tipoDocumento
    expect(anulacoes(ctx)).toHaveLength(0);
    expect(ctx.txInserts.some((i) => i.tabela === admissaoDadosGi)).toBe(true);
  });

  it("codigo fora do catalogo (sem conferencia viva daquele tipo): nada e anulado (fail-closed)", async () => {
    const ctx = montar([{ id: "conf-rg", codigo: "RG" }]);
    await gravar(ctx.svc, "INEXISTENTE");
    expect(anulacoes(ctx)).toHaveLength(0);
  });

  it("a anulacao NAO limpa o veredito (ele sobrevive para a tela dizer 'ajustar')", async () => {
    const ctx = montar([{ id: "conf-rg", codigo: "RG" }]);
    await gravar(ctx.svc, "RG");
    expect("veredito" in anulacoes(ctx)[0]!.valores).toBe(false);
  });

  it("a anulacao roda na MESMA transacao da gravacao do GI (C9)", async () => {
    const ctx = montar([{ id: "conf-rg", codigo: "RG" }]);
    await gravar(ctx.svc, "RG");
    expect(ctx.transacaoUsada).toBe(true);
    expect(ctx.txInserts.some((i) => i.tabela === admissaoDadosGi)).toBe(true);
    expect(ctx.txUpdates.some((u) => u.tabela === portalConferencia)).toBe(true);
  });
});
