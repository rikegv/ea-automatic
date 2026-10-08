import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pandapeEntrada } from "../db/schema";
import { PandapeEntradaService } from "./pandape-entrada.service";

/**
 * ─ `registrarDesfecho` DE VERDADE, CONTRA O POSTGRES, SEM PERSISTIR NADA (§A.38 integração) ─────
 *
 * COBERTURA INDEPENDENTE do conserto do "Received an instance of Date". O spec irmão
 * `pandape-entrada.resolvido-conflito.tester.spec.ts` trava a ASSINATURA no SQL montado, sem banco.
 * Este aqui exercita o SERVIÇO REAL e prova as semânticas de runtime que só o Postgres responde:
 *   (a) semeia uma entrada em ADIADO/CPF_INVALIDO não resolvida;
 *   (b) chama `registrarDesfecho({ desfecho: "PRE_ADMISSAO", admissaoId })`;
 *   (c) NÃO estoura, e a linha fica com `resolvido_em` carimbado e o `admissao_id` gravado;
 *   (d) regressão: a segunda chamada NÃO des-resolve (coalesce preserva o carimbo original) e NÃO
 *       sobrescreve o desfecho de uma linha já resolvida.
 * Mais a REPRODUÇÃO do estouro histórico: a Date interpolada crua no UPDATE rejeita com a mensagem.
 *
 * ─ POR QUE ATRÁS DE `DATABASE_URL`, E POR QUE ROLLBACK ─────────────────────────────────────────
 * A suíte não tem harness de banco vivo nem config de DB de teste, e NÃO se põe credencial em arquivo
 * versionado (§A.46): a URL vem só do ambiente, e sem ela o bloco inteiro é PULADO. Quando roda, TODO
 * efeito acontece dentro de uma transação que SEMPRE termina em rollback, então nada persiste no
 * banco apontado (o `publicar`/validação do coordenador roda com o stack de dev no ar).
 *
 * §A.6: ids de SISTEMA e de ficção, nenhum CPF/nome. O `admissao_id` reusa uma admissão QUE JÁ
 * EXISTE (select de leitura), só para satisfazer a FK; nada é criado, e o rollback descarta o resto.
 */

const DB_URL = process.env.DATABASE_URL;
const bloco = DB_URL ? describe : describe.skip;

/** Erro-sentinela: forçamos o rollback lançando-o ao fim do caminho feliz. */
class Rollback extends Error {}

/** Stub do cache de nomes: `registrarDesfecho` não o usa, mas o construtor o pede. */
const nomesStub = { ler: () => undefined } as unknown as ConstructorParameters<
  typeof PandapeEntradaService
>[1];

bloco("registrarDesfecho contra o Postgres (rolled back)", () => {
  let client: ReturnType<typeof postgres> | undefined;
  let db: PostgresJsDatabase | undefined;
  let indisponivel = false;

  beforeAll(async () => {
    try {
      client = postgres(DB_URL as string, { max: 1 });
      db = drizzle(client);
      await client`select 1`;
    } catch {
      // DATABASE_URL setada mas banco fora: pula em vez de pintar a suíte de vermelho por infra.
      indisponivel = true;
    }
  });

  afterAll(async () => {
    await client?.end({ timeout: 2 });
  });

  /** Roda `fn` numa transação e SEMPRE desfaz; devolve o controle só depois do rollback. */
  async function naTransacaoDesfeita(fn: (tx: PostgresJsDatabase) => Promise<void>): Promise<void> {
    try {
      await (db as PostgresJsDatabase).transaction(async (tx) => {
        await fn(tx as unknown as PostgresJsDatabase);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }

  function idDeTeste(sufixo: string): string {
    return `__teste_entrada_${sufixo}_${Date.now()}`;
  }

  async function lerLinha(tx: PostgresJsDatabase, id: string) {
    const [linha] = await tx
      .select()
      .from(pandapeEntrada)
      .where(eq(pandapeEntrada.idPrecollaborator, id));
    return linha;
  }

  async function algumaAdmissaoId(tx: PostgresJsDatabase): Promise<string | null> {
    const linhas = (await tx.execute(sql`select id from admissoes limit 1`)) as Array<{
      id: string;
    }>;
    return linhas[0]?.id ?? null;
  }

  it("(c) encerra sobre linha existente: não estoura, carimba resolvido_em e grava admissao_id", async (ctx) => {
    if (indisponivel) return ctx.skip();
    await naTransacaoDesfeita(async (tx) => {
      const id = idDeTeste("c");
      // (a) a linha que já existia, ainda pendente (o caso real: convite antes do CPF preencher).
      await tx
        .insert(pandapeEntrada)
        .values({ idPrecollaborator: id, origem: "WEBHOOK", desfecho: "ADIADO", motivo: "CPF_INVALIDO" });

      const admissaoId = await algumaAdmissaoId(tx);
      const svc = new PandapeEntradaService(tx as never, nomesStub);

      // (b) o UPDATE no caminho que estourava. Não pode lançar.
      await expect(
        svc.registrarDesfecho({ idPrecollaborator: id, desfecho: "PRE_ADMISSAO", admissaoId: admissaoId ?? undefined }),
      ).resolves.toBeUndefined();

      // (c) a linha saiu da fila (carimbada) e absorveu o id da admissão.
      const linha = await lerLinha(tx, id);
      expect(linha.resolvidoEm).not.toBeNull();
      expect(linha.desfecho).toBe("PRE_ADMISSAO");
      if (admissaoId) expect(linha.admissaoId).toBe(admissaoId);
    });
  });

  it("(d) segunda passada não des-resolve nem regride o desfecho de linha já resolvida", async (ctx) => {
    if (indisponivel) return ctx.skip();
    await naTransacaoDesfeita(async (tx) => {
      const id = idDeTeste("d");
      await tx
        .insert(pandapeEntrada)
        .values({ idPrecollaborator: id, origem: "WEBHOOK", desfecho: "ADIADO", motivo: "CPF_INVALIDO" });
      const svc = new PandapeEntradaService(tx as never, nomesStub);

      await svc.registrarDesfecho({ idPrecollaborator: id, desfecho: "PRE_ADMISSAO" });
      const carimbo = (await lerLinha(tx, id)).resolvidoEm;
      expect(carimbo).not.toBeNull();

      // Repetir o MESMO encerramento: coalesce preserva o carimbo original (não é "agora de novo").
      await svc.registrarDesfecho({ idPrecollaborator: id, desfecho: "PRE_ADMISSAO" });
      expect((await lerLinha(tx, id)).resolvidoEm?.getTime()).toBe(carimbo?.getTime());

      // Um desfecho que NÃO encerra chegando depois: linha resolvida não volta atrás.
      await svc.registrarDesfecho({ idPrecollaborator: id, desfecho: "FALHOU", motivo: "TIMEOUT" });
      const depois = await lerLinha(tx, id);
      expect(depois.desfecho).toBe("PRE_ADMISSAO");
      expect(depois.resolvidoEm?.getTime()).toBe(carimbo?.getTime());
    });
  });

  it("reprodução: a Date CRUA interpolada no UPDATE estoura com 'Received an instance of Date'", async (ctx) => {
    if (indisponivel) return ctx.skip();
    // Aqui o throw é o PRÓPRIO estouro do driver, e ele mesmo desfaz a transação. Não usamos a
    // sentinela: queremos que a rejeição real chegue ao `expect`.
    await expect(
      (db as PostgresJsDatabase).transaction(async (tx) => {
        const id = idDeTeste("bug");
        await tx
          .insert(pandapeEntrada)
          .values({ idPrecollaborator: id, origem: "WEBHOOK", desfecho: "ADIADO", motivo: "CPF_INVALIDO" });
        const agora = new Date();
        await tx
          .insert(pandapeEntrada)
          .values({ idPrecollaborator: id, origem: "MANUAL", desfecho: "PRE_ADMISSAO" })
          .onConflictDoUpdate({
            target: pandapeEntrada.idPrecollaborator,
            set: { resolvidoEm: sql`coalesce(${pandapeEntrada.resolvidoEm}, ${agora})` },
          });
      }),
    ).rejects.toThrow(/Received an instance of Date/);
  });
});
