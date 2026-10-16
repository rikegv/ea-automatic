import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ ITEM 1 (parte 2): O AUTO-MERGE HISTÓRICO SEM CPF, `reaproveitarCapturaSemCpf` ────────────────
 *
 * COBERTURA INDEPENDENTE §A.38/§A.40, escrita do REQUISITO (régua do diretor + travas do seguranca),
 * SEM copiar a implementação. É o par do `.dedup-sem-cpf.tester.spec.ts` (aquele cobre o colapso
 * DENTRO DO LOTE, no import service; este cobre a RÉGUA DE BANCO, na porta única do domínio).
 *
 * OS REQUISITOS QUE ESटA PORTA TEM DE CUMPRIR:
 *   (req 2) auto-merge SÓ por NOME + E-MAIL (normalizados), sobre ficha `cpf IS NULL` → reaproveita o id;
 *   (req 3) TELEFONE NÃO FUNDE: a chave do lookup não olha telefone, e sem e-mail devolve `null`;
 *   (req 4) NUNCA ficha rica: match exclui quem tem CPF, histórico (qualquer candidatura) ou retenção;
 *   (req 5) GUARDA LGPD: ficha `anonimizado_em` NÃO é alvo (lookup exige `anonimizado_em is null`), e o
 *           CPF nunca é escrito no reaproveitamento;
 *   (req 6) OVERWRITE: ao reaproveitar ficha viva, os campos vêm da planilha, MENOS o CPF.
 *
 * COMO OLHA, SEM BANCO: o `select` do lookup é capturado e RENDERIZADO (texto + parâmetros ligados),
 * então as cinco travas do WHERE são afirmáveis sem Postgres. O OVERWRITE passa por `this.editar`, que
 * é espionado: assim o teste prova que o dto do overwrite NÃO carrega `cpf` (nem `bancoTalentos`/
 * `origem`), sem precisar exercitar o update real. O caminho de runtime completo (composição do
 * `and`/`not exists`, contagem de linhas da guarda) é o que um `.integra.spec.ts` contra o Postgres
 * fecharia; aqui travamos a FORMA das travas e a forma do overwrite.
 *
 * §A.43/§A.6: nome/e-mail sintéticos (domínio de exemplo), nenhum dado real.
 */

const dialeto = new PgDialect();
function render(cond: unknown): { texto: string; params: unknown[] } {
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return { texto: texto.toLowerCase(), params };
}

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** Um db que GRAVA o where do lookup do reaproveitamento e devolve o match configurado (ou nenhum). */
function banco(match: { id: string } | null) {
  let whereCap: unknown;
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    const mesmo = () => c;
    c.from = mesmo;
    c.where = (w: unknown) => {
      whereCap = w;
      return c;
    };
    c.orderBy = mesmo;
    c.limit = mesmo;
    c.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(match ? [match] : []).then(ok, falha);
    return c;
  };
  const db = { select: vi.fn(() => chain()) };
  return {
    db,
    get where() {
      return whereCap;
    },
    selectChamado: () => (db.select as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
  };
}

/** Constrói o serviço com o db fingido e ESPIONA `editar` (o overwrite passa por ele). */
function servico(match: { id: string } | null) {
  const b = banco(match);
  const svc = new CandidatosService(
    b.db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
  const editarSpy = vi.fn(async () => ({ id: match?.id ?? "x" }) as never);
  (svc as unknown as { editar: unknown }).editar = editarSpy;
  return { svc, editarSpy, banco: b };
}

const DADOS_PLANILHA = {
  nome: "Teste Alfa",
  email: "alfa@exemplo.com",
  telefone: "11 90000-0000",
  dataNascimento: "1990-01-02",
  cidade: "Sao Paulo",
  uf: "SP",
};

describe("req 3: TELEFONE não funde / e-mail é obrigatório no auto-merge", () => {
  it("sem e-mail normalizado devolve null, NÃO consulta o banco e NÃO sobrescreve", async () => {
    const { svc, editarSpy, banco } = servico({ id: "hist-1" });
    const r = await svc.reaproveitarCapturaSemCpf(
      { nomeNorm: "teste alfa", emailNorm: "" },
      DADOS_PLANILHA,
      USER,
    );
    expect(r, "sem e-mail, telefone sozinho não pode fundir: devolve null").toBeNull();
    expect(banco.selectChamado(), "não deveria nem consultar o banco sem e-mail").toBe(0);
    expect(editarSpy).not.toHaveBeenCalled();
  });
});

describe("reqs 2/4/5: as travas do WHERE do lookup (seguranca)", () => {
  async function whereDoLookup() {
    const { svc, banco } = servico({ id: "hist-1" });
    await svc.reaproveitarCapturaSemCpf(
      { nomeNorm: "teste alfa", emailNorm: "alfa@exemplo.com" },
      DADOS_PLANILHA,
      USER,
    );
    return render(banco.where);
  }

  it("req 4/5: exige cpf IS NULL, anonimizado_em IS NULL e banco_talentos = false", async () => {
    const { texto, params } = await whereDoLookup();
    expect(texto, "req 4: só casa ficha sem CPF").toMatch(/"cpf"\s+is\s+null/);
    expect(texto, "req 5: ficha anonimizada nunca é alvo").toMatch(/"anonimizado_em"\s+is\s+null/);
    // `banco_talentos` viaja por parâmetro ligado (`= $n`), com `false` nos parâmetros.
    expect(texto, "req 4: ficha de banco de talentos nunca é alvo").toMatch(/"banco_talentos"\s*=\s*(\$\d+|false)/);
    const comparaBancoTalentosComFalse =
      /"banco_talentos"\s*=\s*false/.test(texto) || params.includes(false);
    expect(comparaBancoTalentosComFalse, "o lookup compara banco_talentos com false").toBe(true);
  });

  it("req 4: exige SEM histórico (not exists candidatura)", async () => {
    const { texto } = await whereDoLookup();
    expect(texto).toMatch(/not\s+exists\s*\(\s*select\s+1\s+from\s+"as_candidaturas"/);
  });

  it("req 2: casa por NOME (translate/lower, normalizado) E por E-MAIL (lower(trim))", async () => {
    const { texto, params } = await whereDoLookup();
    expect(texto, "nome por translate(lower(...))").toMatch(/translate\(lower\("as_candidatos"\."nome"\)/);
    expect(texto, "e-mail por lower(trim(coalesce(...)))").toMatch(/lower\(trim\(coalesce\("as_candidatos"\."email"/);
    // Os dois lados viajam por PARÂMETRO LIGADO (nome e e-mail normalizados).
    expect(params.map(String)).toContain("teste alfa");
    expect(params.map(String)).toContain("alfa@exemplo.com");
  });

  it("req 3: o WHERE do lookup NÃO menciona telefone", async () => {
    const { texto } = await whereDoLookup();
    expect(texto.includes("telefone"), "telefone não pode entrar no critério de fusão histórica").toBe(false);
  });
});

describe("reqs 2/6: com match, reaproveita e sobrescreve SEM tocar o CPF", () => {
  it("devolve o id do match e sobrescreve pela porta guardada `editar`", async () => {
    const { svc, editarSpy } = servico({ id: "hist-1" });
    const r = await svc.reaproveitarCapturaSemCpf(
      { nomeNorm: "teste alfa", emailNorm: "alfa@exemplo.com" },
      DADOS_PLANILHA,
      USER,
    );
    expect(r, "req 2: reaproveita o id da ficha histórica").toBe("hist-1");
    expect(editarSpy, "req 6: o overwrite acontece").toHaveBeenCalledTimes(1);
    const [id, dto] = editarSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe("hist-1");
    // req 5/6: o dto do overwrite NÃO carrega CPF (nem reclassifica origem/retenção).
    expect(dto, "req 5: CPF nunca é escrito no reaproveitamento").not.toHaveProperty("cpf");
    expect(dto).not.toHaveProperty("bancoTalentos");
    expect(dto).not.toHaveProperty("origem");
    // req 6: os campos vêm da planilha.
    expect(dto.nome).toBe(DADOS_PLANILHA.nome);
    expect(dto.email).toBe(DADOS_PLANILHA.email);
    expect(dto.telefone).toBe(DADOS_PLANILHA.telefone);
    expect(dto.cidade).toBe(DADOS_PLANILHA.cidade);
    expect(dto.uf).toBe(DADOS_PLANILHA.uf);
  });

  it("req 4: SEM match (ficha rica/anonimizada excluída pelo WHERE) devolve null e NÃO sobrescreve", async () => {
    const { svc, editarSpy } = servico(null);
    const r = await svc.reaproveitarCapturaSemCpf(
      { nomeNorm: "teste alfa", emailNorm: "alfa@exemplo.com" },
      DADOS_PLANILHA,
      USER,
    );
    expect(r, "sem match seguro, a importação cria ficha nova (null aqui)").toBeNull();
    expect(editarSpy).not.toHaveBeenCalled();
  });
});
