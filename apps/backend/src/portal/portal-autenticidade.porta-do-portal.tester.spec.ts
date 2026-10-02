import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalCredencialService } from "./portal-credencial.service";
import { documentosAdmissao } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40 regra 2), escrito do REQUISITO, em paralelo a quem constroi.
 * NAO escrevi o codigo desta porta; provo o que ela TEM de garantir.
 *
 * A LACUNA QUE ESTE ARQUIVO FECHA. O canario
 * `auditoria/auditoria-autenticidade.portas-entregue.tester.spec.ts:23-28` registra POR ESCRITO que
 * a porta do Portal nao tinha teste nenhum, com o raciocinio de que ela "nunca escreve ENTREGUE".
 * Isso deixou de ser verdade: a confirmacao do candidato passou a escrever o destino do veredito
 * (`portal-credencial.service.ts`, bloco "O ESTADO AGORA AVANCA NO VALIDADO"), via `decidirDestino`.
 * Era exatamente o bug V12: o documento ficava preso em AGUARDANDO_AUDITORIA mesmo com veredito
 * VALIDADO, a regua nunca fechava e o contador marcava 0.
 *
 * O REQUISITO, nas quatro metades que o diretor enumerou:
 *  R1a  VALIDADO + sem suspeita  -> estado ENTREGUE (era AGUARDANDO_AUDITORIA, e e o bug V12).
 *  R1b  VALIDADO + COM suspeita  -> NAO vira ENTREGUE: fica AGUARDANDO_AUDITORIA com a marca
 *       `conferir_autenticidade = true` (vai para a conferencia HUMANA).
 *  R1c  INCONFORME e PENDENTE    -> o estado NAO muda, so a observacao e gravada.
 *  R1d  AS DUAS GUARDAS DO WHERE -> nunca por cima de `validado_por_id` preenchido, nunca por cima
 *       de documento que nao esta em AGUARDANDO_AUDITORIA (precedencia humana, §A.38).
 *
 * COMO A GUARDA DO `where` E PROVADA, e por que nao por leitura do codigo: o `where` e um objeto
 * `SQL` do drizzle, e um fake de banco nao o aplica. O teste RENDERIZA o predicado com o dialeto
 * real do Postgres e assere o texto e os parametros. Assim a prova vale sobre o SQL que o banco
 * receberia, nao sobre a intencao de quem escreveu.
 *
 * §A.6: nenhuma fixture carrega dado pessoal real. O motivo de autenticidade e descricao tecnica,
 * sem nada lido do documento, e o teste assere isso de novo aqui (defesa em profundidade com o
 * canario de PII da porta da esteira).
 */

const dialeto = new PgDialect();

const LINHA = {
  id: "cred-1",
  admissaoId: "adm-1",
  tipoDocumentoId: "tipo-1",
  objeto: "opaco/RG__uuid.pdf",
  contentType: "application/pdf",
  bytesConcedidos: 5 * 1024 * 1024,
  confirmadoEm: null as Date | null,
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
  where: unknown;
}

function montar(opts: { auditoria: Record<string, unknown> | null; comCampos?: boolean }) {
  const updates: Escrita[] = [];
  const inserts: Array<{ tabela: unknown; valores: Record<string, unknown> }> = [];

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
        ? [{ reprovacoes: 1 }]
        : chaves.includes("emAberto")
          ? [{ emAberto: 0 }]
          : chaves.includes("liberadoEm")
            ? []
            : // A LISTA DE REGRAS NAO PODE SER VAZIA: o bloco do veredito e guardado por
              // `regras.length > 0` (tipo sem regra e escalada ao humano, nao reprovacao).
              chaves.includes("descricaoRegra")
              ? [{ descricaoRegra: "O documento deve estar legivel.", categoria: "CONFORMIDADE" }]
              : chaves.includes("nome") && chaves.includes("cpf")
                ? [{ nome: "CANDIDATO TESTE", cpf: "00000000000" }]
                : chaves.includes("codigo") && chaves.includes("nome")
                  ? [{ codigo: "RG", nome: "RG" }]
                  : [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => Promise.resolve(linhas),
      then: (r: (v: unknown) => unknown) => Promise.resolve(linhas).then(r),
    };
    return builder;
  };

  const db = {
    select,
    query: {
      portalCredenciais: { findFirst: async () => ({ ...LINHA }) },
    },
    update: (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        const fim = {
          where: (w: unknown) => {
            updates.push({ tabela, valores, where: w });
            return fim;
          },
          returning: async () => [{ id: LINHA.id }],
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
        return fim;
      },
    }),
    insert: (tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
        return {
          onConflictDoNothing: async () => undefined,
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
  };

  const armazenamento = {
    consultarMetadado: async (objeto: string) => ({
      objeto,
      bytes: 1024,
      contentType: "application/pdf",
    }),
    nomeDoBucket: () => "balde",
    corrigirContentType: async () => true,
    apagarObjeto: async () => true,
  };

  const leitor = {
    configurado: () => true,
    ler: async () => ({
      aceito: true,
      chegada: { tamanhoBytes: 1024 },
      auditoria: opts.auditoria,
      sugestoes: opts.comCampos
        ? {
            origem: "IA_SUGESTAO",
            exigeConfirmacaoHumana: true,
            campos: [
              { campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confianca: 0.9, lido: true },
            ],
          }
        : null,
    }),
  };

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    { configurada: () => true, registrar: vi.fn(async () => {}) } as never,
  );
  return { svc, updates, inserts };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({
    admissaoId: "adm-1",
    jtiLink: "jti-1",
    credencialId: "cred-1",
    avisoDoNavegador: true,
  });

/**
 * A escrita do VEREDITO sobre `documentos_admissao`, que e a que carrega `observacao`. Distingue-se
 * da escrita da COLETA (`marcarEntregue`), que grava so `estado: AGUARDANDO_AUDITORIA` e roda antes.
 */
const escritasDoVeredito = (updates: Escrita[]) =>
  updates.filter((u) => u.tabela === documentosAdmissao && "observacao" in u.valores);

/** A escrita da COLETA: so `estado`, sem `observacao`. */
const escritaDaColeta = (updates: Escrita[]) =>
  updates.filter(
    (u) => u.tabela === documentosAdmissao && !("observacao" in u.valores) && "estado" in u.valores,
  );

/** Varre qualquer chave de conferencia de autenticidade e devolve o booleano gravado. */
function valorConferir(valores: Record<string, unknown>): boolean | undefined {
  for (const [k, v] of Object.entries(valores)) {
    if (/conferir.?autenticidade/i.test(k) && typeof v === "boolean") return v;
  }
  return undefined;
}

function motivoAutenticidade(valores: Record<string, unknown>): unknown {
  for (const [k, v] of Object.entries(valores)) {
    if (/autenticidade.?motivo/i.test(k)) return v;
  }
  return undefined;
}

const VALIDADO_LIMPO = {
  status: "VALIDADO",
  valido: true,
  motivo: "Documento legivel e dentro da validade.",
  autenticidadeSuspeita: false,
};

const VALIDADO_SUSPEITO = {
  status: "VALIDADO",
  valido: true,
  motivo: "Documento legivel e dentro da validade.",
  autenticidadeSuspeita: true,
  // Descricao TECNICA, sem nada lido do documento (§A.6).
  autenticidadeMotivo: "Brasao com bordas serrilhadas e fonte do timbre fora do padrao do orgao.",
};

const INCONFORME = {
  status: "INCONFORME",
  valido: false,
  motivo: "documento fora do prazo de validade",
};

const PENDENTE = {
  status: "PENDENTE",
  valido: false,
  motivo: "imagem ilegivel, nao foi possivel decidir",
};

// ── R1a: O BUG V12 ───────────────────────────────────────────────────────────────────────────

describe("R1a: VALIDADO sem suspeita vira ENTREGUE (o bug V12)", () => {
  it("a confirmacao do candidato grava estado=ENTREGUE em documentos_admissao", async () => {
    const ctx = montar({ auditoria: VALIDADO_LIMPO, comCampos: true });
    await confirmar(ctx.svc);

    const vereditos = escritasDoVeredito(ctx.updates);
    // Antes do conserto V12 NAO existia escrita de veredito nenhuma: o estado nunca avancava.
    expect(vereditos).toHaveLength(1);
    expect(vereditos[0]!.valores.estado).toBe("ENTREGUE");
  });

  it("o documento NAO fica preso em AGUARDANDO_AUDITORIA (que a tela chama Em Analise)", async () => {
    const ctx = montar({ auditoria: VALIDADO_LIMPO, comCampos: true });
    await confirmar(ctx.svc);

    // A COLETA ainda escreve AGUARDANDO_AUDITORIA, e isso e correto: ela roda ANTES do veredito.
    expect(escritaDaColeta(ctx.updates)[0]!.valores.estado).toBe("AGUARDANDO_AUDITORIA");
    // O que nao pode e o ESTADO FINAL do caminho continuar sendo AGUARDANDO_AUDITORIA.
    const vereditos = escritasDoVeredito(ctx.updates);
    expect(vereditos.map((v) => v.valores.estado)).not.toContain("AGUARDANDO_AUDITORIA");
  });

  it("no caminho feliz a marca de autenticidade NAO e tocada (a automacao nunca limpa, §A.38)", async () => {
    const ctx = montar({ auditoria: VALIDADO_LIMPO, comCampos: true });
    await confirmar(ctx.svc);

    for (const u of ctx.updates) {
      // nem true (nao ha suspeita) nem false (limpar e privilegio do humano).
      expect(valorConferir(u.valores)).toBeUndefined();
      expect(motivoAutenticidade(u.valores)).toBeUndefined();
    }
  });

  it("a observacao do veredito e gravada para quem opera", async () => {
    const ctx = montar({ auditoria: VALIDADO_LIMPO, comCampos: true });
    await confirmar(ctx.svc);
    expect(escritasDoVeredito(ctx.updates)[0]!.valores.observacao).toContain("Documento legivel");
  });
});

// ── R1b: O SUSPEITO NUNCA VIRA ENTREGUE ──────────────────────────────────────────────────────

describe("R1b: VALIDADO COM suspeita de autenticidade NAO vira ENTREGUE", () => {
  it("fica em AGUARDANDO_AUDITORIA e marca conferir_autenticidade=true", async () => {
    const ctx = montar({ auditoria: VALIDADO_SUSPEITO, comCampos: true });
    await confirmar(ctx.svc);

    const vereditos = escritasDoVeredito(ctx.updates);
    expect(vereditos).toHaveLength(1);
    expect(vereditos[0]!.valores.estado).toBe("AGUARDANDO_AUDITORIA");
    expect(valorConferir(vereditos[0]!.valores)).toBe(true);
  });

  it("NENHUMA escrita do caminho carimba ENTREGUE num documento sob suspeita", async () => {
    const ctx = montar({ auditoria: VALIDADO_SUSPEITO, comCampos: true });
    await confirmar(ctx.svc);

    expect(ctx.updates.some((u) => u.valores.estado === "ENTREGUE")).toBe(false);
    expect(ctx.inserts.some((i) => i.valores.estado === "ENTREGUE")).toBe(false);
  });

  it("o motivo da suspeita e gravado, e e PII-free (§A.6)", async () => {
    const ctx = montar({ auditoria: VALIDADO_SUSPEITO, comCampos: true });
    await confirmar(ctx.svc);

    const motivo = motivoAutenticidade(escritasDoVeredito(ctx.updates)[0]!.valores);
    expect(typeof motivo).toBe("string");
    const texto = motivo as string;
    expect(texto).not.toMatch(/\d{11}/); // CPF sem mascara
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF com mascara
    expect(texto).not.toMatch(/\d{2}\.\d{3}\.\d{3}-[\dxX]/); // RG formatado
    expect(texto).not.toContain("CANDIDATO TESTE");
  });
});

// ── R1c: INCONFORME e PENDENTE nao mexem no estado ───────────────────────────────────────────

describe("R1c: INCONFORME e PENDENTE nao mudam o estado, so a observacao", () => {
  for (const [rotulo, auditoria] of [
    ["INCONFORME", INCONFORME],
    ["PENDENTE", PENDENTE],
  ] as const) {
    it(`${rotulo}: a escrita do veredito grava observacao e NAO grava estado`, async () => {
      const ctx = montar({ auditoria, comCampos: true });
      await confirmar(ctx.svc);

      const vereditos = escritasDoVeredito(ctx.updates);
      expect(vereditos).toHaveLength(1);
      // O estado fica como a coleta deixou (AGUARDANDO_AUDITORIA, a fila do time).
      expect("estado" in vereditos[0]!.valores).toBe(false);
      expect(vereditos[0]!.valores.observacao).toBeTruthy();
      // E a marca de autenticidade nao entra: o reprovado ja puxa humano pelo fluxo normal.
      expect(valorConferir(vereditos[0]!.valores)).toBeUndefined();
    });

    it(`${rotulo}: nenhuma escrita do caminho carimba ENTREGUE`, async () => {
      const ctx = montar({ auditoria, comCampos: true });
      await confirmar(ctx.svc);
      expect(ctx.updates.some((u) => u.valores.estado === "ENTREGUE")).toBe(false);
    });
  }
});

// ── R1d: AS DUAS GUARDAS DO `where` ──────────────────────────────────────────────────────────

describe("R1d: as duas guardas do where (precedencia humana e documento ja resolvido)", () => {
  /** Renderiza o predicado com o dialeto real do Postgres: prova sobre o SQL, nao sobre a intencao. */
  function renderizar(where: unknown) {
    return dialeto.sqlToQuery(where as never);
  }

  for (const [rotulo, auditoria] of [
    ["VALIDADO", VALIDADO_LIMPO],
    ["VALIDADO suspeito", VALIDADO_SUSPEITO],
    ["INCONFORME", INCONFORME],
    ["PENDENTE", PENDENTE],
  ] as const) {
    it(`${rotulo}: o where exige estado = AGUARDANDO_AUDITORIA e validado_por_id is null`, async () => {
      const ctx = montar({ auditoria, comCampos: true });
      await confirmar(ctx.svc);

      const q = renderizar(escritasDoVeredito(ctx.updates)[0]!.where);
      const texto = q.sql.toLowerCase();

      // GUARDA 1: nunca por cima de documento que nao esta esperando auditoria.
      expect(q.params).toContain("AGUARDANDO_AUDITORIA");
      expect(texto).toContain('"estado"');
      // GUARDA 2: nunca por cima de veredito HUMANO.
      expect(texto).toMatch(/validado_por_id"?\s+is\s+null/);
      // E o escopo continua amarrado na admissao e no tipo da credencial da SESSAO.
      expect(q.params).toContain("adm-1");
      expect(q.params).toContain("tipo-1");
    });
  }
});
