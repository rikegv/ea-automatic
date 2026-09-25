import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { admissoes } from "../db/schema";

/**
 * ─ PONTE A&S -> ADM, RISCO a: DEDUP POR `id_vacancy` (`tester` §A.38/§A.40) ─────────────────────
 *
 * O REQUISITO: criar duas admissões com o MESMO CPF e o MESMO `id_vacancy` VIVO tem de barrar na
 * segunda; a ponte trata a colisão como IDEMPOTÊNCIA (devolve a existente), não cria a segunda.
 * Duas admissões do mesmo CPF com `id_vacancy` DIFERENTES são permitidas (o candidato pode ter N
 * admissões, §A.3), e aí entra a trava de duplicidade viva com aceite, não o unique.
 *
 * O GUARDA-CHUVA ESTRUTURAL É O UNIQUE PARCIAL `uq_admissao_cpf_vaga_viva`. Este arquivo o TRAVA:
 * a idempotência da ponte só é possível porque o banco rejeita a segunda linha (23505). Se alguém
 * afrouxar o índice (tirar a parcialidade, trocar as colunas, esquecer um farol vivo), a
 * idempotência vira duplicata silenciosa, e é ISSO que estas asserções impedem de passar.
 *
 * O COMPORTAMENTO da ponte (traduzir 23505 em "devolve a existente") fica em `.todo`: ele depende
 * do método de criação a partir do funil, que é outra frente, e provar "banco rejeita e o service
 * devolve a existente" pede o round-trip real do Postgres, fora do alcance de um dublê.
 */

describe("ponte A&S -> ADM (risco a): o unique parcial que sustenta a dedup por vaga", () => {
  const idx = getTableConfig(admissoes).indexes.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (i: any) => i.config.name === "uq_admissao_cpf_vaga_viva",
  );

  it("o índice existe e é UNIQUE", () => {
    expect(idx).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((idx as any).config.unique).toBe(true);
  });

  it("a chave é (candidato_cpf, id_vacancy): é por VAGA que a segunda barra, não por CPF sozinho", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols = ((idx as any).config.columns ?? []).map((c: any) => c.name);
    expect(cols).toEqual(["candidato_cpf", "id_vacancy"]);
  });

  it("é PARCIAL: só com id_vacancy presente e só entre os farols VIVOS", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = (idx as any).config.where;
    expect(where).toBeTruthy();
    const sql = new PgDialect().sqlToQuery(where).sql;

    // `id_vacancy is not null`: admissão MANUAL do wizard (sem vaga) NUNCA é barrada por aqui.
    expect(sql).toMatch(/id_vacancy["\s]*is not null/i);
    // Os três farois vivos, inclusive a PRÉ-ADMISSÃO (`AGUARDANDO_LIBERACAO`): duas pré-admissões
    // da mesma vaga já colidem, antes mesmo de liberar. Terminais (declínio/rescisão/concluída)
    // ficam de fora, porque quem saiu vira processo NOVO (§A.16).
    for (const farol of ["EM_ADMISSAO", "BANCO_AGUARDAR", "AGUARDANDO_LIBERACAO"]) {
      expect(sql).toContain(farol);
    }
    // Nenhum farol TERMINAL entra no recorte vivo.
    for (const terminal of ["DECLINOU", "RESCISAO", "ADMISSAO_CONCLUIDA", "LIBERACAO_RECUSADA"]) {
      expect(sql).not.toContain(terminal);
    }
  });

  /**
   * COMPORTAMENTO DA PONTE (a fazer / de outra frente): a criação a partir do funil, ao pegar 23505
   * do índice acima, NÃO propaga o erro: consulta a admissão viva do mesmo (CPF + id_vacancy) e a
   * DEVOLVE (idempotência), sem criar a segunda nem consumir posição duas vezes. Dois id_vacancy
   * DIFERENTES do mesmo CPF passam pelo unique e caem na trava de duplicidade viva com aceite.
   */
  it.todo("a ponte traduz a colisão 23505 em idempotência: devolve a admissão viva existente");
  it.todo("dois id_vacancy diferentes do mesmo CPF passam o unique e vão para a trava com aceite");
});
