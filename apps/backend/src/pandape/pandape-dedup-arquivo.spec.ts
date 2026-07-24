import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { PandapeSyncService } from "./pandape-sync.service";
import type { PandapeApiService } from "./pandape-api.service";
import type { PandapeQueueService } from "./pandape-queue.service";
import type { AdmissoesService } from "../admissoes/admissoes.service";
import type { AuditoriaService } from "../auditoria/auditoria.service";
import { decidirColeta, hashArquivo, precisaAuditarConjunto } from "./dedup-arquivo";

/**
 * QA da DEDUP POR ARQUIVO + varredura retroativa (OST dedup + carga, Bloco 6).
 *
 * O que esta suíte prova:
 *  1. arquivo com hash JÁ CONHECIDO não é re-baixado nem re-auditado;
 *  2. arquivo NOVO num tipo que já tem documento dispara RE-AUDITORIA do conjunto inteiro;
 *  3. a carga rodando duas vezes não duplica marca nem re-audita o que já está íntegro;
 *  4. o REPROCESSO derruba a trava por tipo (ENTREGUE do fluxo antigo volta a ser auditado), mas
 *     NUNCA derruba a idempotência;
 *  5. §A.6: a marca persistida não carrega nome de arquivo nem URL.
 *
 * Toda a rede é mockada (nenhuma chamada real ao Pandapé nem à IA).
 */

const TIPO = { id: "tipo-rg", codigo: "RG", nome: "RG" };
const ADMISSAO = "adm-1";
const PRECOLLAB = "PC-1";
const URL_A = "https://pandape.example.com/docs/a?token=naoexpira";
const URL_B = "https://pandape.example.com/docs/b?token=naoexpira";

interface RespostaFake {
  ok: boolean;
  status: number;
  headers: { get: () => string | null };
  arrayBuffer?: () => Promise<ArrayBufferLike>;
}

/** Conteúdo distinto por URL: é o que dá hashes distintos, como no acervo real. */
function fetchPorUrl(conteudos: Record<string, string>) {
  return vi.fn(async (url: string): Promise<RespostaFake> => {
    const texto = conteudos[url];
    if (texto === undefined) return { ok: false, status: 404, headers: { get: () => null } };
    return {
      ok: true,
      status: 200,
      headers: { get: (): string | null => null },
      arrayBuffer: async () => new TextEncoder().encode(texto).buffer,
    };
  });
}

/**
 * db mock com STORE REAL das marcas de arquivo (`documento_arquivos_coletados`) e do estado do
 * documento, para exercitar o ciclo repetido de verdade: o que a primeira rodada grava, a segunda lê.
 */
function makeDb(
  inicial: { estadoDoc?: string; marcas?: string[]; tipos?: Array<{ id: string; codigo: string }> } = {},
) {
  const tipos = inicial.tipos ?? [TIPO];
  const marcas: Array<{ tipoDocumentoId: string; hashConteudo: string; tamanhoBytes: number }> = (
    inicial.marcas ?? []
  ).map((h) => ({ tipoDocumentoId: tipos[0].id, hashConteudo: h, tamanhoBytes: 3 }));
  let estadoDoc = inicial.estadoDoc;

  // O serviço resolve o TIPO (tiposDocumento.findFirst) imediatamente antes de consultar as marcas
  // daquele tipo, um formulário por vez. O mock acompanha essa ordem para conseguir filtrar as marcas
  // por tipo, que é o que a chave única real faz.
  let chamadasTipo = 0;
  let tipoAtual = tipos[0];
  const select = vi.fn(() => ({
    from: () => ({
      where: () =>
        Promise.resolve(
          marcas
            .filter((m) => m.tipoDocumentoId === tipoAtual.id)
            .map((m) => ({ hashConteudo: m.hashConteudo })),
        ),
    }),
  }));
  const valuesRecebidos: unknown[][] = [];
  const insert = vi.fn(() => ({
    values: (linhas: Array<{ tipoDocumentoId: string; hashConteudo: string; tamanhoBytes: number }>) => {
      valuesRecebidos.push(linhas);
      return {
        onConflictDoNothing: async () => {
          for (const l of linhas) {
            // unique(admissao, TIPO, hash): o mesmo arquivo em dois tipos entra nos dois.
            const jaTem = marcas.some(
              (m) => m.hashConteudo === l.hashConteudo && m.tipoDocumentoId === l.tipoDocumentoId,
            );
            if (!jaTem) marcas.push(l);
          }
        },
      };
    },
  }));
  const db = {
    query: {
      integracaoPandape: { findFirst: vi.fn() },
      clientes: { findFirst: vi.fn() },
      cargos: { findFirst: vi.fn() },
      tiposDocumento: {
        findFirst: vi.fn(async () => {
          tipoAtual = tipos[chamadasTipo % tipos.length];
          chamadasTipo += 1;
          return tipoAtual;
        }),
      },
      usuarios: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-sys",
          email: "sys@soulan.com.br",
          papel: "SUPER_ADMIN",
        }),
      },
      documentosAdmissao: {
        findFirst: vi.fn(async () => (estadoDoc ? { id: "doc-1", estado: estadoDoc } : undefined)),
      },
    },
    select,
    insert,
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  };
  return {
    db,
    marcas,
    valuesRecebidos,
    setEstadoDoc: (e: string | undefined) => {
      estadoDoc = e;
    },
  };
}

function makeService(db: ReturnType<typeof makeDb>["db"], forms: unknown[]) {
  const api = {
    estaAtivo: vi.fn(() => true),
    getFormulariosDocumentos: vi.fn().mockResolvedValue(forms),
  } as unknown as PandapeApiService;
  const auditoria = {
    auditarConjunto: vi.fn().mockResolvedValue({
      resultado: { status: "VALIDADO", motivo: "Documento legível." },
      documento: { tipoDocumentoId: TIPO.id, estado: "ENTREGUE" },
      progresso: { completa: false },
    }),
  } as unknown as AuditoriaService;
  const svc = new PandapeSyncService(
    db as never,
    { get: () => undefined } as unknown as ConfigService,
    api,
    {} as unknown as PandapeQueueService,
    {} as unknown as AdmissoesService,
    auditoria,
    { estaLigado: vi.fn().mockResolvedValue(true) } as never,
  );
  return { svc, auditoria, api };
}

/** Formulário no formato da v3 (o NOME do formulário é o tipo). */
function form(links: string[]) {
  return [{ name: "RG", documents: links.map((link) => ({ link, name: "arquivo.pdf" })) }];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dedup por arquivo — regras puras", () => {
  it("acervo idêntico ao já marcado → PULA SEM BAIXAR (inclusive no reprocesso: idempotência)", () => {
    const base = { hashesConhecidos: 2, arquivosNoPandape: 2, estadoAtual: "ENTREGUE" };
    expect(decidirColeta({ ...base, reprocessar: false })).toBe("PULAR_SEM_BAIXAR");
    expect(decidirColeta({ ...base, reprocessar: true })).toBe("PULAR_SEM_BAIXAR");
  });

  it("quantidade diferente da marcada → BAIXA (pode ter chegado arquivo novo)", () => {
    expect(
      decidirColeta({
        estadoAtual: "ENTREGUE",
        hashesConhecidos: 1,
        arquivosNoPandape: 2,
        reprocessar: false,
      }),
    ).toBe("BAIXAR");
  });

  it("INCONFORME e AGUARDANDO_AUDITORIA nunca ficam presos na trava", () => {
    for (const estadoAtual of ["INCONFORME", "AGUARDANDO_AUDITORIA"]) {
      expect(
        decidirColeta({ estadoAtual, hashesConhecidos: 1, arquivosNoPandape: 1, reprocessar: false }),
      ).toBe("BAIXAR");
    }
  });

  it("ENTREGUE do fluxo ANTIGO (sem marca): pull normal pula, REPROCESSO baixa", () => {
    const base = { estadoAtual: "ENTREGUE", hashesConhecidos: 0, arquivosNoPandape: 1 };
    expect(decidirColeta({ ...base, reprocessar: false })).toBe("PULAR_SEM_BAIXAR");
    expect(decidirColeta({ ...base, reprocessar: true })).toBe("BAIXAR");
  });

  it("conjunto só é re-auditado com arquivo novo, sem marca anterior ou auditoria não concluída", () => {
    expect(precisaAuditarConjunto({ novos: 1, hashesConhecidosAntes: 2 })).toBe(true);
    expect(precisaAuditarConjunto({ novos: 0, hashesConhecidosAntes: 0 })).toBe(true);
    expect(
      precisaAuditarConjunto({
        novos: 0,
        hashesConhecidosAntes: 2,
        estadoAtual: "AGUARDANDO_AUDITORIA",
      }),
    ).toBe(true);
    expect(
      precisaAuditarConjunto({ novos: 0, hashesConhecidosAntes: 2, estadoAtual: "ENTREGUE" }),
    ).toBe(false);
  });

  it("hash é SHA-256 do conteúdo: estável, e conteúdo diferente muda a marca", () => {
    const a = hashArquivo(Buffer.from("conteudo-a"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashArquivo(Buffer.from("conteudo-a"))).toBe(a);
    expect(hashArquivo(Buffer.from("conteudo-b"))).not.toBe(a);
  });
});

describe("dedup por arquivo — pull do Pandapé", () => {
  it("arquivo com hash JÁ CONHECIDO não é re-baixado nem re-auditado", async () => {
    const conhecido = hashArquivo(Buffer.from("arquivo-a"));
    const { db } = makeDb({ estadoDoc: "ENTREGUE", marcas: [conhecido] });
    const fetchSpy = fetchPorUrl({ [URL_A]: "arquivo-a" });
    vi.stubGlobal("fetch", fetchSpy);
    const { svc, auditoria } = makeService(db, form([URL_A]));

    const resumo = await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auditoria.auditarConjunto).not.toHaveBeenCalled();
    expect(resumo.tipos[0]).toMatchObject({ codigo: "RG", acao: "PULADO_SEM_BAIXAR", novos: 0 });
  });

  it("arquivo NOVO em tipo que já tem documento → RE-AUDITA o conjunto inteiro", async () => {
    const conhecido = hashArquivo(Buffer.from("arquivo-a"));
    const { db, marcas } = makeDb({ estadoDoc: "ENTREGUE", marcas: [conhecido] });
    vi.stubGlobal("fetch", fetchPorUrl({ [URL_A]: "arquivo-a", [URL_B]: "arquivo-b" }));
    const { svc, auditoria } = makeService(db, form([URL_A, URL_B]));

    const resumo = await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB);

    // O veredito é do CONJUNTO: chegando o verso, a peça inteira volta para a IA (não só o novo).
    expect(auditoria.auditarConjunto).toHaveBeenCalledTimes(1);
    const arquivos = (auditoria.auditarConjunto as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(arquivos).toHaveLength(2);
    expect(resumo.tipos[0]).toMatchObject({ acao: "AUDITADO", novos: 1, jaConhecidos: 1 });
    // A marca do arquivo novo foi persistida; a antiga não duplicou.
    expect(marcas).toHaveLength(2);
  });

  it("carga rodando DUAS VEZES não duplica marca nem re-audita (idempotência)", async () => {
    const { db, marcas, setEstadoDoc } = makeDb(); // base zerada: admissão nunca coletada
    vi.stubGlobal("fetch", fetchPorUrl({ [URL_A]: "arquivo-a", [URL_B]: "arquivo-b" }));
    const { svc, auditoria } = makeService(db, form([URL_A, URL_B]));

    const r1 = await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB, { reprocessar: true });
    expect(r1.tipos[0]).toMatchObject({ acao: "AUDITADO", novos: 2, jaConhecidos: 0 });
    expect(marcas).toHaveLength(2);
    setEstadoDoc("ENTREGUE"); // a auditoria da 1ª rodada gravou o veredito

    const r2 = await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB, { reprocessar: true });

    expect(auditoria.auditarConjunto).toHaveBeenCalledTimes(1); // NÃO auditou de novo
    expect(marcas).toHaveLength(2); // NÃO duplicou marca
    expect(r2.tipos[0]).toMatchObject({ acao: "PULADO_SEM_BAIXAR", novos: 0, jaConhecidos: 2 });
  });

  it("REPROCESSO re-audita o ENTREGUE do fluxo ANTIGO (sem marca), que o pull normal pularia", async () => {
    const semMarca = { estadoDoc: "ENTREGUE" };
    vi.stubGlobal("fetch", fetchPorUrl({ [URL_A]: "arquivo-a" }));

    const normal = makeDb(semMarca);
    const svcNormal = makeService(normal.db, form([URL_A]));
    await svcNormal.svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB);
    expect(svcNormal.auditoria.auditarConjunto).not.toHaveBeenCalled();

    const reproc = makeDb(semMarca);
    const svcReproc = makeService(reproc.db, form([URL_A]));
    const resumo = await svcReproc.svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB, {
      reprocessar: true,
    });
    expect(svcReproc.auditoria.auditarConjunto).toHaveBeenCalledTimes(1);
    expect(resumo.tipos[0]).toMatchObject({ acao: "AUDITADO", novos: 1, jaConhecidos: 0 });
  });

  it("§A.6: a marca persistida tem só digest e tamanho — nunca nome de arquivo nem URL", async () => {
    const { db, valuesRecebidos } = makeDb();
    vi.stubGlobal("fetch", fetchPorUrl({ [URL_A]: "arquivo-a" }));
    const { svc } = makeService(db, form([URL_A]));

    await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB);

    const gravado = JSON.stringify(valuesRecebidos);
    expect(gravado).not.toContain("naoexpira");
    expect(gravado).not.toContain("pandape.example.com");
    expect(gravado).not.toContain("arquivo.pdf");
    expect(Object.keys(valuesRecebidos[0][0] as object).sort()).toEqual([
      "admissaoId",
      "hashConteudo",
      "tamanhoBytes",
      "tipoDocumentoId",
    ]);
  });

  it("MESMO arquivo em DOIS tipos → marca nos dois (achado do piloto: um PDF servia a dois formulários)", async () => {
    // Um PDF único que o candidato subiu em dois formulários. Com a chave única antiga (admissão +
    // arquivo) o segundo tipo ficava SEM marca e voltava a ser re-auditado em todo ciclo.
    const TIPO_A = { id: "tipo-rg", codigo: "RG" };
    const TIPO_B = { id: "tipo-cpf", codigo: "CPF" };
    const { db, marcas } = makeDb({ tipos: [TIPO_A, TIPO_B] });
    vi.stubGlobal("fetch", fetchPorUrl({ [URL_A]: "mesmo-conteudo", [URL_B]: "mesmo-conteudo" }));
    const forms = [
      { name: "RG", documents: [{ link: URL_A, name: "arquivo.pdf" }] },
      { name: "CPF", documents: [{ link: URL_B, name: "arquivo.pdf" }] },
    ];
    const { svc } = makeService(db, forms);

    await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB);

    expect(marcas).toHaveLength(2);
    expect(marcas.map((m) => m.tipoDocumentoId).sort()).toEqual(["tipo-cpf", "tipo-rg"]);
    expect(marcas[0].hashConteudo).toBe(marcas[1].hashConteudo); // mesmo arquivo, dois destinos
  });

  it("BLOCO 4 (OST B1): a coleta AUTOMÁTICA e o LOTE NUNCA sobrescrevem validação humana", async () => {
    // Sem exceção e sem confirmação possível: num job de fila não há ninguém para confirmar nada.
    // Nem o arquivo é baixado. A reauditoria MANUAL é o único caminho que passa por cima.
    const { db } = makeDb({ estadoDoc: "ENTREGUE" });
    db.query.documentosAdmissao.findFirst = vi.fn(async () => ({
      id: "doc-1",
      estado: "ENTREGUE",
      validadoEm: new Date(),
      validadoPorId: "user-9",
    }));
    const fetchSpy = fetchPorUrl({ [URL_A]: "arquivo-a" });
    vi.stubGlobal("fetch", fetchSpy);
    const { svc, auditoria } = makeService(db, form([URL_A]));

    // reprocessar=true é o modo do LOTE, o mais agressivo que existe: nem ele passa.
    const resumo = await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB, { reprocessar: true });

    expect(auditoria.auditarConjunto).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resumo.tipos[0]).toMatchObject({ acao: "PULADO_VALIDACAO_HUMANA" });
  });

  it("auditoria que FALHA não grava marca (o ciclo seguinte tenta de novo)", async () => {
    const { db, marcas } = makeDb();
    vi.stubGlobal("fetch", fetchPorUrl({ [URL_A]: "arquivo-a" }));
    const { svc, auditoria } = makeService(db, form([URL_A]));
    (auditoria.auditarConjunto as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("IA fora"));

    const resumo = await svc.puxarDocumentosDaAdmissao(ADMISSAO, PRECOLLAB);

    expect(marcas).toHaveLength(0);
    expect(resumo.tipos[0]).toMatchObject({ acao: "FALHA" });
  });
});
