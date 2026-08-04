import { describe, expect, it, vi } from "vitest";
import { CHAVE_INTEGRACAO, clienteExigeIntegracao } from "./integracao-obrigatoria.repo";

/**
 * A REGRA DO CLIENTE na frente INTEGRAÇÃO (decisão do diretor): todo cliente nasce EXIGINDO
 * integração, e a equipe desmarca quem não exige.
 *
 * O que este teste trava é o DEFAULT, que é a parte fácil de quebrar numa refatoração: ausência de
 * linha tem de valer `true`. Se um dia alguém trocar por "só exige quem tem linha marcada", a
 * frente para de nascer para 234 clientes de uma vez, em silêncio, e ninguém percebe até faltar
 * trabalho na fila.
 */

/** Fake do drizzle: devolve as linhas combinadas para o `select ... where`. */
function fakeDb(linhas: unknown[]) {
  const where = vi.fn(async () => linhas);
  return {
    db: { select: () => ({ from: () => ({ where }) }) } as never,
    where,
  };
}

describe("clienteExigeIntegracao", () => {
  it("cliente SEM linha de configuração EXIGE integração (o default do diretor)", async () => {
    const { db } = fakeDb([]);
    expect(await clienteExigeIntegracao(db, "56002")).toBe(true);
  });

  it("linha explícita com obrigatorio=false TIRA o cliente da frente", async () => {
    const { db } = fakeDb([{ obrigatorio: false }]);
    expect(await clienteExigeIntegracao(db, "56002")).toBe(false);
  });

  it("linha explícita com obrigatorio=true mantém a exigência", async () => {
    const { db } = fakeDb([{ obrigatorio: true }]);
    expect(await clienteExigeIntegracao(db, "56002")).toBe(true);
  });

  it("sem cliente (pré-admissão) NÃO exige: não há regra a aplicar, e não se adivinha", async () => {
    const { db, where } = fakeDb([{ obrigatorio: true }]);
    expect(await clienteExigeIntegracao(db, null)).toBe(false);
    expect(await clienteExigeIntegracao(db, undefined)).toBe(false);
    expect(await clienteExigeIntegracao(db, "")).toBe(false);
    // E nem chega a consultar o banco.
    expect(where).not.toHaveBeenCalled();
  });

  it("a chave usada na tabela compartilhada é INTEGRACAO", () => {
    expect(CHAVE_INTEGRACAO).toBe("INTEGRACAO");
  });
});
