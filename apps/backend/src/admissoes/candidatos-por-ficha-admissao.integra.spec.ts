import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "../db/client";
import { admissoes, asCandidatos, asCandidaturas, candidatos, vagas } from "../db/schema";
import { FAROIS_FORA_DO_PAINEL } from "../portal/portal-painel.service";
import { AdmissoesService } from "./admissoes.service";

/**
 * COBERTURA INDEPENDENTE §A.38 (integração), o COMPORTAMENTO que o `tester` apontou faltar: a suíte da
 * troca da porta de e-mail (resolver pela ficha da ADMISSÃO) era 100% estrutural, e presença de token
 * não prova composição (um `or` no lugar do `and`, um `leftJoin` no lugar do `innerJoin`, a coluna
 * errada no bind ou um `selectDistinct` que não dedup passariam todos verdes). Aqui o SERVIÇO REAL
 * (`new AdmissoesService(tx)`, o mesmo construtor que os scripts de carga usam, todo o resto é
 * `@Optional`) roda contra o Postgres e prova as semânticas de runtime.
 *
 * ─ ATRÁS DE `DATABASE_URL`, SEMPRE EM ROLLBACK ────────────────────────────────────────────────────
 * No molde de `pandape/pandape-entrada.registrar-desfecho.integra.spec.ts`: sem `DATABASE_URL` o bloco
 * é PULADO (não pinta a suíte de vermelho por infra, §A.46 não põe credencial em arquivo versionado);
 * quando roda, TODO efeito acontece numa transação que SEMPRE termina em rollback, então nada persiste
 * no banco apontado.
 *
 * §A.6/§A.43: tudo é sintético, CPF de família reservada (começa com 9, descartado no rollback), e-mail
 * de domínio de homologação, nome sem palavra do léxico real. Nenhum dado de pessoa real.
 */

const DB_URL = process.env.DATABASE_URL;
const bloco = DB_URL ? describe : describe.skip;

/** Erro-sentinela: força o rollback ao fim do caminho feliz. */
class Rollback extends Error {}

bloco("candidatosDeFunilPorEmailDaFichaDeAdmissao contra o Postgres (rolled back)", () => {
  let client: ReturnType<typeof postgres> | undefined;
  let db: PostgresJsDatabase | undefined;
  let indisponivel = false;

  beforeAll(async () => {
    try {
      client = postgres(DB_URL as string, { max: 1 });
      db = drizzle(client);
      await client`select 1`;
    } catch {
      indisponivel = true;
    }
  });

  afterAll(async () => {
    await client?.end({ timeout: 2 });
  });

  /** Roda `fn` numa transação e SEMPRE desfaz. */
  async function naTransacaoDesfeita(fn: (tx: PostgresJsDatabase) => Promise<void>): Promise<void> {
    if (indisponivel) return;
    try {
      await (db as PostgresJsDatabase).transaction(async (tx) => {
        await fn(tx as unknown as PostgresJsDatabase);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }

  let seq = 0;
  const novaCpf = () => `9${String(Date.now()).slice(-7)}${String(seq++).padStart(3, "0")}`.slice(0, 11);
  const sufixo = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  const email = (tag: string) => `sintetico.${tag}.${sufixo}@homolog.local`;

  const FAROL_EXCLUIDO = [...FAROIS_FORA_DO_PAINEL];

  /**
   * Semeia uma cadeia funil->candidatura->admissão->ficha e devolve o id do candidato de FUNIL.
   * `fichaEmail` é o e-mail da ficha da ADMISSÃO (`candidatos.email`); `emailFunil` é o do funil
   * (`as_candidatos.email`), de propósito DIFERENTE, para provar que a resolução é pela ficha.
   * Reaproveita um candidato de funil existente quando `fcId` é passado (caso de 2 admissões/1 funil).
   */
  async function semear(
    tx: PostgresJsDatabase,
    opts: {
      fichaEmail: string;
      farol: string;
      anonimizado?: boolean;
      emailFunil?: string | null;
      fcId?: string;
    },
  ): Promise<string> {
    const cpf = novaCpf();
    const [vaga] = await tx.insert(vagas).values({ status: "RASCUNHO" }).returning({ id: vagas.id });
    await tx.insert(candidatos).values({ cpf, nome: "Pessoa Sintetica", email: opts.fichaEmail });
    const [adm] = await tx
      .insert(admissoes)
      .values({ candidatoCpf: cpf, farolGlobal: opts.farol as never })
      .returning({ id: admissoes.id });
    let fcId = opts.fcId;
    if (!fcId) {
      const [fc] = await tx
        .insert(asCandidatos)
        .values({
          nome: "Candidato Sintetico",
          email: opts.emailFunil ?? null,
          anonimizadoEm: opts.anonimizado ? new Date() : null,
        })
        .returning({ id: asCandidatos.id });
      fcId = fc.id;
    }
    await tx.insert(asCandidaturas).values({
      candidatoId: fcId,
      vagaId: vaga.id,
      etapa: "STAND_BY" as never,
      admissaoId: adm.id,
    });
    return fcId;
  }

  it("(a) exatamente UMA admissão viva com a ficha casando: resolve e devolve o id do FUNIL", async () => {
    await naTransacaoDesfeita(async (tx) => {
      const alvo = email("a");
      // O e-mail do FUNIL é OUTRO: se a resolução ainda olhasse o funil, não acharia pelo `alvo`.
      const fcId = await semear(tx, {
        fichaEmail: alvo,
        farol: "EM_ADMISSAO",
        emailFunil: email("a-funil-diferente"),
      });
      const svc = new AdmissoesService(tx as unknown as Database);
      const res = await svc.candidatosDeFunilPorEmailDaFichaDeAdmissao(alvo, FAROL_EXCLUIDO, 6);
      expect(res).toEqual([{ id: fcId }]);
    });
  });

  it("(b) ficha de funil ANONIMIZADA é excluída no filtro (cai no silêncio)", async () => {
    await naTransacaoDesfeita(async (tx) => {
      const alvo = email("b");
      await semear(tx, { fichaEmail: alvo, farol: "EM_ADMISSAO", anonimizado: true });
      const svc = new AdmissoesService(tx as unknown as Database);
      const res = await svc.candidatosDeFunilPorEmailDaFichaDeAdmissao(alvo, FAROL_EXCLUIDO, 6);
      expect(res).toEqual([]);
    });
  });

  it("(c) admissão em farol MORTO (DECLINOU) é excluída", async () => {
    await naTransacaoDesfeita(async (tx) => {
      const alvo = email("c");
      await semear(tx, { fichaEmail: alvo, farol: "DECLINOU" });
      const svc = new AdmissoesService(tx as unknown as Database);
      const res = await svc.candidatosDeFunilPorEmailDaFichaDeAdmissao(alvo, FAROL_EXCLUIDO, 6);
      expect(res).toEqual([]);
    });
  });

  it("(d) DOIS candidatos de funil distintos com a mesma ficha-email viva: devolve 2 (a porta trava)", async () => {
    await naTransacaoDesfeita(async (tx) => {
      const alvo = email("d");
      const fc1 = await semear(tx, { fichaEmail: alvo, farol: "EM_ADMISSAO" });
      const fc2 = await semear(tx, { fichaEmail: alvo, farol: "BANCO_AGUARDAR" });
      const svc = new AdmissoesService(tx as unknown as Database);
      const res = await svc.candidatosDeFunilPorEmailDaFichaDeAdmissao(alvo, FAROL_EXCLUIDO, 6);
      expect(res.map((r) => r.id).sort()).toEqual([fc1, fc2].sort());
      expect(res.length).toBe(2);
    });
  });

  it("(e) UM candidato de funil com DUAS admissões vivas: `selectDistinct` dedup para 1 (sem trava falsa)", async () => {
    await naTransacaoDesfeita(async (tx) => {
      const alvo = email("e");
      const fcId = await semear(tx, { fichaEmail: alvo, farol: "EM_ADMISSAO" });
      // Mesma pessoa de funil, SEGUNDA admissão viva com a mesma ficha-email (vaga/cpf novos).
      await semear(tx, { fichaEmail: alvo, farol: "BANCO_AGUARDAR", fcId });
      const svc = new AdmissoesService(tx as unknown as Database);
      const res = await svc.candidatosDeFunilPorEmailDaFichaDeAdmissao(alvo, FAROL_EXCLUIDO, 6);
      expect(res).toEqual([{ id: fcId }]);
    });
  });

  it("(f) e-mail inexistente não resolve ninguém", async () => {
    await naTransacaoDesfeita(async (tx) => {
      await semear(tx, { fichaEmail: email("f"), farol: "EM_ADMISSAO" });
      const svc = new AdmissoesService(tx as unknown as Database);
      const res = await svc.candidatosDeFunilPorEmailDaFichaDeAdmissao(
        email("f-inexistente"),
        FAROL_EXCLUIDO,
        6,
      );
      expect(res).toEqual([]);
    });
  });
});
