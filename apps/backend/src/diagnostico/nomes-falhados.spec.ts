import { describe, expect, it, vi } from "vitest";
import { PandapeNomeCacheService } from "../pandape/pandape-nome-cache.service";
import { NomesFalhadosService } from "./nomes-falhados.service";

/**
 * A BUSCA POR NOME NA FILA DEGRADADA (OST 30/09/2026), e as três regras que não podem cair:
 *  1. o CACHE é lido primeiro, e o que veio dele NÃO gasta cota do Pandapé (§A.5);
 *  2. falha da API em um id (ou em todos) devolve os que resolveram, NUNCA derruba o lote;
 *  3. o freio de cota PARA de consultar no orçamento, em vez de estourar o teto compartilhado com o
 *     webhook que alimenta a folha.
 * §A.6: a resposta é jobId + nome, e nada mais — o teste assere as CHAVES, não só os valores.
 */

function apiFake(
  porId: Record<string, { name?: string; surname?: string } | "erro" | undefined>,
) {
  const getPrecollaborator = vi.fn(async (id: string) => {
    const r = porId[id];
    if (r === "erro") throw new Error("Pandapé fora");
    return r as never;
  });
  return { getPrecollaborator } as never;
}

function alvo(jobId: string, id: string) {
  return { jobId, idPrecollaborator: id };
}

describe("NomesFalhadosService", () => {
  it("LÊ O CACHE PRIMEIRO e não gasta cota com quem já está lá", async () => {
    const cache = new PandapeNomeCacheService();
    cache.guardar("100", "Zelda Fitzgerald");
    const api = apiFake({ "200": { name: "Ada", surname: "Lovelace" } });
    const s = new NomesFalhadosService(api, cache);

    const r = await s.resolver([alvo("j1", "100"), alvo("j2", "200")]);

    expect(r).toEqual({
      nomes: [
        { jobId: "j1", nome: "Zelda Fitzgerald" },
        { jobId: "j2", nome: "Ada Lovelace" },
      ],
      restantes: 0,
    });
    // Só o que faltava foi à API.
    expect((api as unknown as { getPrecollaborator: { mock: { calls: unknown[] } } }).getPrecollaborator.mock.calls).toEqual([["200"]]);
  });

  it("GRAVA no mesmo cache, então o segundo lote custa ZERO chamada (a reabertura do modal)", async () => {
    const cache = new PandapeNomeCacheService();
    const api = apiFake({ "300": { name: "Grace", surname: "Hopper" } });
    const s = new NomesFalhadosService(api, cache);

    await s.resolver([alvo("j1", "300")]);
    const segundo = await s.resolver([alvo("j1", "300")]);

    expect(segundo.nomes).toEqual([{ jobId: "j1", nome: "Grace Hopper" }]);
    expect(cache.ler("300")).toBe("Grace Hopper");
    expect(
      (api as unknown as { getPrecollaborator: { mock: { calls: unknown[] } } }).getPrecollaborator.mock.calls,
    ).toHaveLength(1);
  });

  it("FALHA de um id NÃO derruba o lote: devolve os que resolveram", async () => {
    const api = apiFake({ "400": "erro", "401": { name: "Rosalind", surname: "Franklin" } });
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    const r = await s.resolver([alvo("j1", "400"), alvo("j2", "401")]);

    // O que falhou simplesmente NÃO vem na lista: sem placeholder, sem marcador de erro por item.
    expect(r.nomes).toEqual([{ jobId: "j2", nome: "Rosalind Franklin" }]);
  });

  it("API TODA FORA devolve lista vazia, não exceção (a tela segue mostrando os jobs sem nome)", async () => {
    const api = apiFake({ "500": "erro", "501": "erro" });
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    await expect(s.resolver([alvo("j1", "500"), alvo("j2", "501")])).resolves.toEqual({
      nomes: [],
      // Falha da API NÃO é recusa de cota: `restantes` é só o que o bucket barrou, senão a tela diria
      // "faltou resolver, peça o resto" para um caso em que pedir de novo gastaria cota sem ganho.
      restantes: 0,
    });
  });

  it("PRÉ-COLABORADOR SEM NOME não vira entrada (nem no cache, nem na resposta)", async () => {
    const cache = new PandapeNomeCacheService();
    const s = new NomesFalhadosService(apiFake({ "600": {} }), cache);

    expect(await s.resolver([alvo("j1", "600")])).toEqual({ nomes: [], restantes: 0 });
    expect(cache.tamanho()).toBe(0);
  });

  it("O MESMO idPrecollaborator em dois jobs custa UMA chamada e nomeia os dois", async () => {
    const api = apiFake({ "700": { name: "Katherine", surname: "Johnson" } });
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    const r = await s.resolver([alvo("j1", "700"), alvo("j2", "700")]);

    expect(r.nomes).toEqual([
      { jobId: "j1", nome: "Katherine Johnson" },
      { jobId: "j2", nome: "Katherine Johnson" },
    ]);
    expect(
      (api as unknown as { getPrecollaborator: { mock: { calls: unknown[] } } }).getPrecollaborator.mock.calls,
    ).toHaveLength(1);
  });

  it("O FREIO DE COTA (§A.5) PARA de consultar no orçamento, em vez de estourar o teto da folha", async () => {
    const quantos = NomesFalhadosService.ORCAMENTO_REQUISICOES + 20;
    const porId: Record<string, { name?: string }> = {};
    for (let i = 0; i < quantos; i += 1) porId[`id-${i}`] = { name: `Nome ${i}` };
    const api = apiFake(porId);
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    const r = await s.resolver(
      Array.from({ length: quantos }, (_, i) => alvo(`j-${i}`, `id-${i}`)),
    );

    const chamadas = (api as unknown as { getPrecollaborator: { mock: { calls: unknown[] } } })
      .getPrecollaborator.mock.calls.length;
    // A RECUSA É NA 151ª REQUISIÇÃO, independente de env e do estado da varredura (8b): a 150ª sai, a
    // seguinte não, e o que sobrou volta como `restantes` em vez de ser enfileirado.
    expect(chamadas).toBe(150);
    expect(chamadas).toBe(NomesFalhadosService.ORCAMENTO_REQUISICOES);
    expect(r.nomes).toHaveLength(NomesFalhadosService.ORCAMENTO_REQUISICOES);
    expect(r.restantes).toBe(quantos - NomesFalhadosService.ORCAMENTO_REQUISICOES);
  });

  it("o bucket é GLOBAL ao processo: a segunda abertura não ganha orçamento novo na mesma janela", async () => {
    const porId: Record<string, { name?: string }> = {};
    for (let i = 0; i < 200; i += 1) porId[`id-${i}`] = { name: `Nome ${i}` };
    const api = apiFake(porId);
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    // Primeiro lote gasta 100; o segundo pede outros 100 e só 50 passam (150 na janela).
    await s.resolver(Array.from({ length: 100 }, (_, i) => alvo(`j-${i}`, `id-${i}`)));
    const segundo = await s.resolver(
      Array.from({ length: 100 }, (_, i) => alvo(`j-${100 + i}`, `id-${100 + i}`)),
    );

    expect(segundo.nomes).toHaveLength(50);
    expect(segundo.restantes).toBe(50);
  });

  it("NUNCA chama o getMatch (§A.6): a fonte de CPF não entra neste caminho", async () => {
    const getMatch = vi.fn(async () => ({ cpf: "12345678901" }));
    const api = {
      getPrecollaborator: vi.fn(async () => ({ name: "Alan", surname: "Turing", cpf: "12345678901" })),
      getMatch,
    } as never;
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    const r = await s.resolver([alvo("j1", "900")]);

    expect(getMatch).not.toHaveBeenCalled();
    // E o CPF que o payload trazia não sobrevive à montagem campo por campo.
    expect(JSON.stringify(r)).not.toMatch(/\d{11}/);
    expect(r.nomes).toEqual([{ jobId: "j1", nome: "Alan Turing" }]);
  });

  it("O PIOR CASO MEDIDO (132 falhados, cache frio) cabe em UMA janela de orçamento", async () => {
    const porId: Record<string, { name?: string }> = {};
    for (let i = 0; i < 132; i += 1) porId[`id-${i}`] = { name: `Nome ${i}` };
    const api = apiFake(porId);
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    const r = await s.resolver(Array.from({ length: 132 }, (_, i) => alvo(`j-${i}`, `id-${i}`)));

    expect(r.nomes).toHaveLength(132);
    expect(132).toBeLessThanOrEqual(NomesFalhadosService.ORCAMENTO_REQUISICOES);
  });

  it("SÓ jobId e nome saem daqui (§A.6): nenhuma outra chave na resposta", async () => {
    const api = apiFake({ "800": { name: "Marie", surname: "Curie" } });
    const s = new NomesFalhadosService(api, new PandapeNomeCacheService());

    const r = await s.resolver([alvo("j1", "800")]);

    expect(Object.keys(r).sort()).toEqual(["nomes", "restantes"]);
    expect(Object.keys(r.nomes[0]!).sort()).toEqual(["jobId", "nome"]);
  });
});
