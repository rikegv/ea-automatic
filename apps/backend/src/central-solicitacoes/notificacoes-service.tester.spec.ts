import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Papel } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import { notificacoes } from "../db/schema";
import { NotificacoesService } from "./notificacoes.service";

/**
 * ─ NOTIFICAÇÕES: O SININHO QUE PINGA ATÉ "ESTOU CIENTE" (cobertura independente, §A.38) ─────────
 *
 * ┌─ POR QUE ESTE FAKE INTERPRETA O `where`, EM VEZ DE DEVOLVER LINHAS PRONTAS ──────────────────┐
 * │ O REQUISITO 6 É UM FILTRO: "só as pendentes (cienteEm IS NULL) DO usuário". Um banco fingido  │
 * │ que devolvesse a lista pronta responderia IGUAL com o filtro certo e com o filtro errado      │
 * │ (devolver as de todo mundo, ou devolver as já cientes), e as duas falhas mais caras passariam │
 * │ VERDES: vazar notificação alheia e o sininho que nunca para de pingar. Um teste que não       │
 * │ consegue ficar vermelho não mede nada.                                                        │
 * │                                                                                               │
 * │ ENTÃO O FAKE LÊ A CONDIÇÃO DO DRIZZLE (medida em 0.38: `eq` vira ` = ` + Param, `isNull` vira  │
 * │ ` is null`, `and` junta com ` and `) e a aplica sobre linhas de verdade, em memória. O `and`   │
 * │ é conjunção; ` or ` faz o fake LANÇAR, porque lido como conjunção ele filtraria demais e       │
 * │ deixaria um teste verde por engano (fail-closed, no molde de `reabrir-vaga.tester-fake`).      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: fixtures com ids técnicos e textos neutros, sem PII de candidato.
 */

// ── Leitor da condição do drizzle ──────────────────────────────────────────
interface Restricao {
  coluna: string;
  op: "eq" | "isnull";
  valor?: unknown;
}
const ehColuna = (v: unknown): v is { name: string; table: unknown } =>
  !!v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string" && !!(v as { table?: unknown }).table;
const ctor = (v: unknown): string | undefined => (v as { constructor?: { name?: string } })?.constructor?.name;
const ehParam = (v: unknown): boolean => ctor(v) === "Param";
const ehStr = (v: unknown): boolean => ctor(v) === "StringChunk";
const textoStr = (v: unknown): string => String((v as { value: string[] }).value.join(""));

function coletar(cond: unknown, out: Restricao[] = []): Restricao[] {
  const chunks = (cond as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return out;
  for (const c of chunks) {
    if (ehStr(c) && textoStr(c).toLowerCase().includes(" or ")) {
      throw new Error("O fake das notificações não interpreta ` or `: fail-closed (ver cabeçalho).");
    }
  }
  const col = chunks.find(ehColuna) as { name: string } | undefined;
  if (col) {
    const ops = chunks.filter(ehStr).map(textoStr).join("").toLowerCase();
    if (ops.includes("is null")) {
      out.push({ coluna: col.name, op: "isnull" });
    } else if (ops.includes("=")) {
      const param = chunks.find(ehParam) as { value: unknown } | undefined;
      out.push({ coluna: col.name, op: "eq", valor: param?.value });
    } else {
      throw new Error(`operador não suportado pelo fake: "${ops}"`);
    }
    return out;
  }
  for (const c of chunks) {
    if (ehStr(c)) continue;
    if (Array.isArray(c)) {
      c.forEach((x) => coletar(x, out));
      continue;
    }
    coletar(c, out);
  }
  return out;
}

// ── Banco fingido das notificações, com store de verdade ────────────────────
interface LinhaNotif {
  id: string;
  usuarioId: string;
  titulo: string;
  corpo: string;
  rota: string | null;
  solicitacaoId: string | null;
  cienteEm: Date | null;
  criadoEm: Date;
}

function dbParaJs(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(notificacoes)) {
    const col = v as { name?: string };
    if (col && typeof col.name === "string") map[col.name] = k;
  }
  return map;
}

function casa(row: LinhaNotif, restricoes: Restricao[], mapa: Record<string, string>): boolean {
  for (const r of restricoes) {
    const prop = mapa[r.coluna];
    const val = (row as unknown as Record<string, unknown>)[prop];
    if (r.op === "isnull") {
      if (!(val === null || val === undefined)) return false;
    } else if (val !== r.valor) {
      return false;
    }
  }
  return true;
}

function bancoNotif(rowsInit: LinhaNotif[]) {
  const rows = rowsInit.map((r) => ({ ...r }));
  const mapa = dbParaJs();
  const filtrar = (cond: unknown): LinhaNotif[] => {
    const r = cond ? coletar(cond) : [];
    return rows.filter((row) => casa(row, r, mapa));
  };

  const selectBuilder = (projection: Record<string, unknown> | undefined) => {
    let cond: unknown;
    let lim: number | undefined;
    const b: Record<string, unknown> = {
      from: () => b,
      where: (c: unknown) => {
        cond = c;
        return b;
      },
      orderBy: () => b,
      limit: (n: number) => {
        lim = n;
        return b;
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        let f = filtrar(cond)
          .slice()
          .sort((a, b2) => b2.criadoEm.getTime() - a.criadoEm.getTime());
        if (lim !== undefined) f = f.slice(0, lim);
        if (projection && "count" in projection) {
          return Promise.resolve([{ count: f.length }]).then(res, rej);
        }
        return Promise.resolve(f).then(res, rej);
      },
    };
    return b;
  };

  const updateBuilder = () => {
    let setVals: Partial<LinhaNotif> = {};
    let cond: unknown;
    const aplicar = (): LinhaNotif[] => {
      const alvo = filtrar(cond);
      alvo.forEach((row) => Object.assign(row, setVals));
      return alvo;
    };
    const b: Record<string, unknown> = {
      set: (v: Partial<LinhaNotif>) => {
        setVals = v;
        return b;
      },
      where: (c: unknown) => {
        cond = c;
        return b;
      },
      returning() {
        return Promise.resolve(aplicar().map((r) => ({ id: r.id })));
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(aplicar()).then(res, rej);
      },
    };
    return b;
  };

  const db: Record<string, unknown> = {
    select: (p: Record<string, unknown>) => selectBuilder(p),
    update: () => updateBuilder(),
    transaction: (cb: (tx: unknown) => unknown) => cb(db),
  };
  return { db, rows };
}

const usuario = (id: string, papel: Papel = "COMUM"): AuthUser => ({
  id,
  email: `${id}@homolog.local`,
  papel,
  senhaTemporaria: false,
});

function linha(over: Partial<LinhaNotif>): LinhaNotif {
  return {
    id: "n-x",
    usuarioId: "A",
    titulo: "Solicitação Aprovada",
    corpo: "Sua solicitação foi aprovada.",
    rota: "/central-solicitacoes",
    solicitacaoId: "sol-1",
    cienteEm: null,
    criadoEm: new Date("2026-10-17T12:00:00.000Z"),
    ...over,
  };
}

function montar(rows: LinhaNotif[]) {
  const { db, rows: store } = bancoNotif(rows);
  return { service: new NotificacoesService(db as never), store };
}

describe("pendentes: só as SEM ciência, só do usuário atual (req.6)", () => {
  it("devolve a pendente do usuário, exclui a JÁ CIENTE e a de OUTRO usuário", async () => {
    const { service } = montar([
      linha({ id: "n-A-pend", usuarioId: "A", cienteEm: null }),
      linha({ id: "n-A-ciente", usuarioId: "A", cienteEm: new Date("2026-10-16T00:00:00.000Z") }),
      linha({ id: "n-B-pend", usuarioId: "B", cienteEm: null }),
    ]);
    const lista = await service.pendentes(usuario("A"));
    const ids = lista.map((n) => n.id);
    expect(ids).toContain("n-A-pend");
    expect(ids).not.toContain("n-A-ciente");
    expect(ids).not.toContain("n-B-pend");
    expect(ids).toHaveLength(1);
  });

  it("PINGA A CADA FETCH: a pendente continua aparecendo em buscas repetidas (sem ciência)", async () => {
    const { service } = montar([linha({ id: "n1", usuarioId: "A", cienteEm: null })]);
    const primeira = await service.pendentes(usuario("A"));
    const segunda = await service.pendentes(usuario("A"));
    expect(primeira.map((n) => n.id)).toEqual(["n1"]);
    expect(segunda.map((n) => n.id)).toEqual(["n1"]);
  });

  it("devolve a rota (deep link) da notificação", async () => {
    const { service } = montar([linha({ id: "n1", usuarioId: "A", rota: "/central-solicitacoes" })]);
    const lista = await service.pendentes(usuario("A"));
    expect(lista[0].rota).toBe("/central-solicitacoes");
  });
});

describe("marcarCiente: baixa persistida, e o sininho PARA (req.6)", () => {
  it("dá ciência e a pendente some do próximo fetch do MESMO usuário", async () => {
    const { service } = montar([linha({ id: "n1", usuarioId: "A", cienteEm: null })]);
    expect((await service.pendentes(usuario("A"))).map((n) => n.id)).toEqual(["n1"]);
    const r = await service.marcarCiente("n1", usuario("A"));
    expect(r).toEqual({ ok: true });
    expect(await service.pendentes(usuario("A"))).toHaveLength(0);
  });

  it("a baixa é persistida no servidor: o store carimba cienteEm (não é supressão local)", async () => {
    const { service, store } = montar([linha({ id: "n1", usuarioId: "A", cienteEm: null })]);
    await service.marcarCiente("n1", usuario("A"));
    const row = store.find((r) => r.id === "n1");
    expect(row?.cienteEm).toBeInstanceOf(Date);
  });

  it("dar ciência de novo é idempotente (não lança, não muda nada visível)", async () => {
    const { service } = montar([linha({ id: "n1", usuarioId: "A", cienteEm: null })]);
    await service.marcarCiente("n1", usuario("A"));
    await expect(service.marcarCiente("n1", usuario("A"))).resolves.toEqual({ ok: true });
  });
});

describe("marcarCiente: ninguém dá baixa na notificação de outro (req.6)", () => {
  it("um usuário NÃO marca ciente a notificação de OUTRO: 404 (não revela a existência)", async () => {
    const { service, store } = montar([linha({ id: "n-B", usuarioId: "B", cienteEm: null })]);
    await expect(service.marcarCiente("n-B", usuario("A"))).rejects.toBeInstanceOf(NotFoundException);
    // e a notificação de B segue intacta (não foi baixada por A)
    expect(store.find((r) => r.id === "n-B")?.cienteEm).toBeNull();
  });

  it("notificação inexistente também é 404", async () => {
    const { service } = montar([linha({ id: "n1", usuarioId: "A" })]);
    await expect(service.marcarCiente("nao-existe", usuario("A"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("contagem: o badge do sininho conta só as pendentes do usuário (req.6)", () => {
  it("conta as pendentes de A, ignorando as cientes e as de B", async () => {
    const { service } = montar([
      linha({ id: "n1", usuarioId: "A", cienteEm: null }),
      linha({ id: "n2", usuarioId: "A", cienteEm: null }),
      linha({ id: "n3", usuarioId: "A", cienteEm: new Date("2026-10-16T00:00:00.000Z") }),
      linha({ id: "n4", usuarioId: "B", cienteEm: null }),
    ]);
    expect(await service.contagem(usuario("A"))).toEqual({ count: 2 });
  });
});
