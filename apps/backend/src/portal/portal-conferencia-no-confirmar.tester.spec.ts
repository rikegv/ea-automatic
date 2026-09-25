import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { portalCredenciais, documentosAdmissao } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), escrito do REQUISITO em paralelo a construcao (bugs de tela do
 * Portal). NAO escrevi o codigo que persiste a conferencia; provo o que a persistencia TEM de
 * garantir. Contrato novo: `ConferenciaDoPasso` (shared-types), `portal_conferencia`.
 *
 * O QUE ESTE ARQUIVO PROVA, pelo lado do `confirmar` (a escrita da conferencia):
 *  - REQ 4: o texto CRU do modelo (o que vai para `documentos_admissao.observacao`) NUNCA aparece
 *    no `veredito.mensagem` (lista fechada do EA). Nenhum INSERT persiste o motivo cru.
 *  - REQ 6: contar tentativa/teto vem SO de `portal_credenciais.reprovado_em`; persistir a
 *    conferencia NAO adiciona carimbo nem contagem.
 *  - REQ 8: reenviar o mesmo (idempotencia, `confirmado_em` ja setado) NAO regrava a conferencia.
 *  - REQ 2 (lado da escrita): um documento julgado grava `portal_conferencia` com os campos lidos e
 *    o veredito redigido + TTL (`expurgar_em`), para a trilha reconstruir o estado.
 *
 * IDENTIFICACAO DA ESCRITA POR SHAPE, e nao pelo simbolo da tabela: `portal_conferencia` ainda nao
 * existe no schema enquanto o backend constroi. Uma escrita de conferencia e a que carrega
 * `veredito` (o veredito redigido persistido). Isso NAO colide com nenhuma escrita existente do
 * caminho: a queda para o time (`portal_pendencias_no_time`) nao carrega `veredito`, e a observacao
 * e um UPDATE de `documentos_admissao`.
 *
 * §A.6: fixtures sem dado pessoal real. O motivo cru abaixo carrega um NOME de terceiro de proposito,
 * para provar que ele nao escapa para o que se persiste.
 */

/** O motivo CRU do modelo: carrega PII de terceiro e some na redacao. Mapeia para VENCIDO. */
const MOTIVO_CRU = "documento fora do prazo de validade em nome de MARIA TERCEIRA CPF 111.222.333-44";
/** A frase de lista fechada que o candidato deve ler (categoria VENCIDO). */
const FRASE_FECHADA = "Este documento está fora da validade. Envie um documento atualizado.";

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
}

function montar(opts: {
  jaConfirmado?: boolean;
  auditoria?: Record<string, unknown> | null;
  comCampos?: boolean;
  reprovacoesDepois?: number;
}) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  let reprovadoEmCarimbado = false;

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
      ? [{ reprovacoes: opts.reprovacoesDepois ?? 1 }]
      : chaves.includes("emAberto")
      ? [{ emAberto: 0 }]
      : chaves.includes("liberadoEm")
      ? []
      : chaves.includes("descricaoRegra")
      ? [{ descricaoRegra: "regra qualquer" }]
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
      portalCredenciais: {
        findFirst: async () => ({
          ...LINHA,
          confirmadoEm: opts.jaConfirmado ? new Date() : null,
        }),
      },
    },
    update: (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        const ehCarimboDeReprovacao = "reprovadoEm" in valores;
        let aplicou = true;
        if (ehCarimboDeReprovacao) {
          aplicou = !reprovadoEmCarimbado;
          if (aplicou) reprovadoEmCarimbado = true;
        }
        if (aplicou) updates.push({ tabela, valores });
        const fim = {
          where: () => fim,
          returning: async () => (aplicou ? [{ id: LINHA.id }] : []),
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
    consultarMetadado: async (objeto: string) => ({ objeto, bytes: 1024, contentType: "application/pdf" }),
    nomeDoBucket: () => "balde",
    corrigirContentType: async () => true,
    apagarObjeto: async () => true,
  };

  const leitor = {
    configurado: () => true,
    ler: async () => ({
      aceito: true,
      chegada: { tamanhoBytes: 1024 },
      auditoria: opts.auditoria === undefined ? null : opts.auditoria,
      sugestoes: opts.comCampos
        ? {
            origem: "IA_SUGESTAO",
            exigeConfirmacaoHumana: true,
            campos: [
              { campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confianca: 0.95, lido: true },
              { campo: "pis", rotulo: "PIS", valor: "", confianca: 0, lido: false },
            ],
          }
        : null,
    }),
  };

  const registrar = vi.fn(async () => {});
  const trilha = { configurada: () => true, registrar };

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    trilha as never,
  );
  return { svc, updates, inserts, registrar };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({ admissaoId: "adm-1", jtiLink: "jti-1", credencialId: "cred-1", avisoDoNavegador: true });

/**
 * Busca `needle` em qualquer valor STRING do objeto, recursiva, sem `JSON.stringify` (as escritas
 * carregam objetos `sql` circulares de drizzle, ex.: `atualizadoEm: sql\`now()\``).
 */
function contemTexto(valor: unknown, needle: string, vistos = new Set<unknown>()): boolean {
  if (typeof valor === "string") return valor.includes(needle);
  if (valor && typeof valor === "object") {
    if (vistos.has(valor)) return false;
    vistos.add(valor);
    for (const v of Object.values(valor as Record<string, unknown>)) {
      if (contemTexto(v, needle, vistos)) return true;
    }
  }
  return false;
}

/** Uma escrita de conferencia e a que persiste o veredito redigido. */
const escritasDeConferencia = (inserts: Escrita[]) =>
  inserts.filter((i) => "veredito" in i.valores || "campos" in i.valores);

const carimbosDeReprovacao = (updates: Escrita[]) =>
  updates.filter((u) => u.tabela === portalCredenciais && "reprovadoEm" in u.valores);

const REPROVADO = { valido: false, status: "INCONFORME", motivo: MOTIVO_CRU };
const APROVADO = { valido: true, status: "VALIDADO", motivo: "ok" };

describe("REQ 4: o motivo CRU do modelo nunca escapa para o que a tela reexibe", () => {
  it("o veredito devolvido usa a frase de lista fechada, nao o texto cru", async () => {
    const ctx = montar({ auditoria: REPROVADO, comCampos: true });
    const r = (await confirmar(ctx.svc)) as { veredito: { mensagem: string; codigo: string } | null };
    expect(r.veredito).toBeTruthy();
    expect(r.veredito!.mensagem).toBe(FRASE_FECHADA);
    expect(r.veredito!.mensagem).not.toContain("MARIA TERCEIRA");
    expect(r.veredito!.mensagem).not.toContain("111.222.333-44");
  });

  it("nenhum INSERT (conferencia inclusa) persiste o motivo cru; ele so vive na observacao do time", async () => {
    const ctx = montar({ auditoria: REPROVADO, comCampos: true });
    await confirmar(ctx.svc);

    for (const ins of ctx.inserts) {
      expect(contemTexto(ins.valores, "MARIA TERCEIRA")).toBe(false);
    }
    // A observacao (para o time, com cracha) e o UNICO lugar onde o motivo inteiro pode viver.
    const comMotivoCru = ctx.updates.filter((u) => contemTexto(u.valores, "MARIA TERCEIRA"));
    for (const u of comMotivoCru) {
      expect(u.tabela).toBe(documentosAdmissao);
      expect("observacao" in u.valores).toBe(true);
    }
  });

  it("PENDENTE (fix): a conferencia persistida carrega o veredito REDIGIDO, nunca o cru", async () => {
    const ctx = montar({ auditoria: REPROVADO, comCampos: true });
    await confirmar(ctx.svc);

    const conf = escritasDeConferencia(ctx.inserts);
    expect(conf.length).toBeGreaterThan(0); // RED ate a escrita de portal_conferencia existir
    for (const c of conf) {
      expect(JSON.stringify(c.valores)).not.toContain("MARIA TERCEIRA");
      expect(JSON.stringify(c.valores)).toContain(FRASE_FECHADA);
    }
  });
});

describe("REQ 6: o teto conta SO reprovado_em; persistir a conferencia nao muda contagem", () => {
  it("veredito negativo carimba a linha da credencial UMA vez, e so ela", async () => {
    const ctx = montar({ auditoria: REPROVADO, comCampos: true });
    await confirmar(ctx.svc);
    expect(carimbosDeReprovacao(ctx.updates)).toHaveLength(1);
  });

  it("uma eventual escrita de conferencia NAO e um segundo carimbo de reprovacao", async () => {
    const ctx = montar({ auditoria: REPROVADO, comCampos: true });
    await confirmar(ctx.svc);
    // Nenhuma escrita de conferencia pode tocar reprovado_em (isso duplicaria o teto).
    for (const c of escritasDeConferencia(ctx.inserts)) {
      expect("reprovadoEm" in c.valores).toBe(false);
    }
    expect(carimbosDeReprovacao(ctx.updates)).toHaveLength(1);
  });

  it("documento APROVADO nao carimba reprovacao mesmo persistindo conferencia", async () => {
    const ctx = montar({ auditoria: APROVADO, comCampos: true });
    await confirmar(ctx.svc);
    expect(carimbosDeReprovacao(ctx.updates)).toHaveLength(0);
  });
});

describe("REQ 8: reenviar o mesmo (idempotencia) nao regrava a conferencia", () => {
  it("confirmar sobre credencial ja confirmada devolve jaConfirmado e nao escreve conferencia", async () => {
    const ctx = montar({ jaConfirmado: true, auditoria: REPROVADO, comCampos: true });
    const r = (await confirmar(ctx.svc)) as { jaConfirmado: boolean };
    expect(r.jaConfirmado).toBe(true);
    expect(escritasDeConferencia(ctx.inserts)).toHaveLength(0);
    expect(carimbosDeReprovacao(ctx.updates)).toHaveLength(0);
  });
});

describe("REQ 2 (escrita): o documento julgado grava a conferencia para a trilha reconstruir", () => {
  it("PENDENTE (fix): confirmar de um reprovado grava portal_conferencia com campos + veredito + TTL", async () => {
    const ctx = montar({ auditoria: REPROVADO, comCampos: true });
    await confirmar(ctx.svc);

    const conf = escritasDeConferencia(ctx.inserts);
    expect(conf.length).toBeGreaterThan(0); // RED ate a escrita existir
    const c = conf[0]!.valores;
    // Os campos que a IA leu, o veredito redigido e o TTL (expurgar_em) tem de estar la.
    expect("campos" in c).toBe(true);
    expect("veredito" in c).toBe(true);
    expect("expurgarEm" in c || "expurgar_em" in c).toBe(true);
  });
});
