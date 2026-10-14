import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortalArquivamentoService } from "./portal-arquivamento.service";
import { PortalArquivadorService, type PedidoDeArquivamento } from "./portal-arquivador.service";

/**
 * COBERTURA INDEPENDENTE (§A.38, agente `tester`, NÃO é o autor) do lado BACKEND do arquivador do
 * Portal. Prova GAPS que `portal-arquivamento.service.spec.ts` (autor) deixou em aberto:
 *
 *  - LOTE PARCIAL NO BACKEND: o autor provou o caminho feliz (falhas=0) e os ramos de inércia, mas
 *    nunca provou que uma resposta do arquivador COM `falhas>0` é REPORTADA (tentou=true, motivo=OK),
 *    e não tratada como erro. É o requisito "uma falha de um objeto não derruba os outros" visto do
 *    orquestrador. (O ai-service faz o laço; o backend precisa PROPAGAR o resultado parcial.)
 *  - §A.6 NO BACKEND: nenhum teste do autor prova que o LOG do orquestrador não carrega nome do
 *    candidato, CPF nem nome de objeto. O ai-service tem esse teste; o backend não tinha.
 *  - RESOLVESUBPASTA POR TIPO: o autor só exercitou DOCUMENTOS_PESSOAIS. Falta provar ASO->ASO,
 *    TERMO_BANCO->ADMISSAO, FORMULARIO_VT->BENEFICIOS no pedido montado.
 *  - CLIENTE configurado() REAL: o autor usou um FAKE (`configurado: () => false`). O
 *    `PortalArquivadorService.configurado()` de verdade (contra o ConfigService, sem URL/token,
 *    com espaço em branco) nunca foi exercitado, nem o `arquivar()` que lança sem configuração.
 */

type Linhas = Record<string, unknown>[];

function fakeDb(filas: Linhas[], updates: Array<Record<string, unknown>>) {
  const queue = [...filas];
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.groupBy = () => chain;
  chain.where = async () => queue.shift() ?? [];
  return {
    select: () => chain,
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: async () => {
          updates.push(vals);
        },
      }),
    }),
  } as never;
}

function config(map: Record<string, string>) {
  return { get: (k: string) => map[k] } as never;
}

const ADM = {
  id: "adm-1",
  codCliente: "16",
  tipoContrato: "Temporario",
  drivePastaUrl: null as string | null,
  candidatoNome: "joao da silva",
  clienteOperacao: "Operacao X",
};

function servico(opts: {
  credenciais?: Linhas;
  arquivarResp?: Partial<{ pastaUrl: string; arquivados: number; ignorados: number; falhas: number; motivoFalhas: string[] }>;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const arquivar = vi.fn(async (_p: PedidoDeArquivamento) => ({
    pastaUrl: opts.arquivarResp?.pastaUrl ?? "https://drive/PASTA",
    arquivados: opts.arquivarResp?.arquivados ?? 1,
    arquivosIds: [] as string[],
    ignorados: opts.arquivarResp?.ignorados ?? 0,
    pastaJaExistia: false,
    duplicatas: [] as string[],
    falhas: opts.arquivarResp?.falhas ?? 0,
    motivoFalhas: opts.arquivarResp?.motivoFalhas ?? [],
  }));
  const arquivador = { configurado: () => true, arquivar } as never;
  const armazenamento = { nomeDoBucket: () => "ea-portal-prod-entrada" } as never;
  const drivePastaPai = { resolver: async () => "PASTA_PAI_16" } as never;
  const cfg = config({ PORTAL_ARQUIVAMENTO_ARMADO: "true" });
  const db = fakeDb([[ADM], opts.credenciais ?? []], updates);
  const svc = new PortalArquivamentoService(db, cfg, arquivador, armazenamento, drivePastaPai);
  return { svc, arquivar, updates };
}

const CREDS = [
  { objeto: "obj-opaco-1", nomeTipo: "RG", codigoTipo: "RG" },
  { objeto: "obj-opaco-2", nomeTipo: "CPF", codigoTipo: "CPF" },
];

afterEach(() => {
  vi.restoreAllMocks();
});

// ── GAP: lote parcial propagado (falhas>0 é resultado OK, não erro) ──────────
describe("PortalArquivamentoService — lote parcial (backend)", () => {
  it("reporta falha parcial sem lançar: tentou=true, motivo=OK, falhas repassadas", async () => {
    const { svc } = servico({
      credenciais: CREDS,
      arquivarResp: { arquivados: 1, falhas: 1, motivoFalhas: ["ObjetoAusente"] },
    });
    const r = await svc.arquivarPortal("adm-1");
    expect(r.tentou).toBe(true);
    expect(r.motivo).toBe("OK");
    expect(r.objetos).toBe(2);
    expect(r.arquivados).toBe(1);
    expect(r.falhas).toBe(1);
  });

  it("self-heal grava o link mesmo com falha parcial (pasta existe, link não some)", async () => {
    const { svc, updates } = servico({
      credenciais: CREDS,
      arquivarResp: { arquivados: 1, falhas: 1 },
    });
    await svc.arquivarPortal("adm-1");
    expect(updates).toHaveLength(1);
    expect(updates[0].drivePastaUrl).toBe("https://drive/PASTA");
  });
});

// ── GAP: §A.6 — o log do orquestrador não carrega PII ────────────────────────
describe("PortalArquivamentoService — §A.6 (sem PII no log)", () => {
  it("o log do caminho feliz não contém nome do candidato, operação nem nome de objeto", async () => {
    const linhasLogadas: string[] = [];
    vi.spyOn(Logger.prototype, "log").mockImplementation((msg: unknown) => {
      linhasLogadas.push(String(msg));
    });
    vi.spyOn(Logger.prototype, "warn").mockImplementation((msg: unknown) => {
      linhasLogadas.push(String(msg));
    });
    const { svc } = servico({ credenciais: CREDS });
    await svc.arquivarPortal("adm-1");
    const texto = linhasLogadas.join("\n");
    expect(texto.length).toBeGreaterThan(0); // garante que algo foi logado (senão o teste é vazio)
    expect(texto.toLowerCase()).not.toContain("joao");
    expect(texto.toLowerCase()).not.toContain("silva");
    expect(texto.toLowerCase()).not.toContain("operacao x");
    expect(texto).not.toContain("obj-opaco-1");
    expect(texto).not.toContain("obj-opaco-2");
    // O id da admissão (não é PII) PODE aparecer, e é o que permite o diagnóstico.
    expect(texto).toContain("adm-1");
  });

  it("o log do erro no gatilho LIVE também não carrega nome do candidato", async () => {
    const linhasLogadas: string[] = [];
    vi.spyOn(Logger.prototype, "warn").mockImplementation((msg: unknown) => {
      linhasLogadas.push(String(msg));
    });
    const { svc } = servico({ credenciais: CREDS });
    (svc as unknown as { arquivador: { arquivar: () => Promise<never> } }).arquivador.arquivar =
      () => Promise.reject(new Error("joao da silva vazou no erro"));
    await svc.talvezArquivarDoVeredito("adm-1", "tipo-1");
    const texto = linhasLogadas.join("\n");
    // Só a CLASSE do erro (Error) e o id entram; a MENSAGEM do erro (que aqui carrega PII) não.
    expect(texto).toContain("adm-1");
    expect(texto.toLowerCase()).not.toContain("joao");
    expect(texto.toLowerCase()).not.toContain("silva");
  });
});

// ── GAP: resolveSubpasta — cada tipo cai na subpasta certa no pedido ─────────
describe("PortalArquivamentoService — subpasta por tipo (resolveSubpasta)", () => {
  it("roteia ASO->ASO, TERMO_BANCO->ADMISSAO, FORMULARIO_VT->BENEFICIOS e o resto->DOCUMENTOS_PESSOAIS", async () => {
    const creds = [
      { objeto: "o1", nomeTipo: "ASO", codigoTipo: "ASO" },
      { objeto: "o2", nomeTipo: "Termo de Banco", codigoTipo: "TERMO_BANCO" },
      { objeto: "o3", nomeTipo: "Formulario VT", codigoTipo: "FORMULARIO_VT" },
      { objeto: "o4", nomeTipo: "RG", codigoTipo: "RG" },
    ];
    const { svc, arquivar } = servico({ credenciais: creds });
    await svc.arquivarPortal("adm-1");
    const pedido = arquivar.mock.calls[0][0];
    const porObjeto = Object.fromEntries(pedido.itens.map((i) => [i.objeto, i.subpasta]));
    expect(porObjeto.o1).toBe("ASO");
    expect(porObjeto.o2).toBe("ADMISSAO");
    expect(porObjeto.o3).toBe("BENEFICIOS");
    expect(porObjeto.o4).toBe("DOCUMENTOS_PESSOAIS");
  });
});

// ── GAP: PortalArquivadorService.configurado() REAL (sem URL/token) ──────────
describe("PortalArquivadorService.configurado() (cliente real, não fake)", () => {
  function cliente(map: Record<string, string>) {
    return new PortalArquivadorService(config(map));
  }

  it("é falso sem URL e sem token", () => {
    expect(cliente({}).configurado()).toBe(false);
  });

  it("é falso só com URL (token ausente)", () => {
    expect(cliente({ PORTAL_ARQUIVADOR_URL: "http://localhost:8040" }).configurado()).toBe(false);
  });

  it("é falso só com token (URL ausente)", () => {
    expect(cliente({ PORTAL_ARQUIVADOR_TOKEN: "t" }).configurado()).toBe(false);
  });

  it("é falso quando URL/token são só espaço em branco (trim)", () => {
    expect(
      cliente({ PORTAL_ARQUIVADOR_URL: "   ", PORTAL_ARQUIVADOR_TOKEN: "   " }).configurado(),
    ).toBe(false);
  });

  it("é verdadeiro com URL e token", () => {
    expect(
      cliente({ PORTAL_ARQUIVADOR_URL: "http://localhost:8040", PORTAL_ARQUIVADOR_TOKEN: "t" }).configurado(),
    ).toBe(true);
  });

  it("arquivar() lança quando não configurado (quem chama trata como 'não arquivou ainda')", async () => {
    await expect(
      cliente({}).arquivar({ bucket: "b", parentFolderId: "p", pastaNome: "n", itens: [] }),
    ).rejects.toThrow(/nao configurado/i);
  });

  it("descrever() não vaza token nem URL, só o booleano", () => {
    const d = cliente({ PORTAL_ARQUIVADOR_URL: "http://x", PORTAL_ARQUIVADOR_TOKEN: "segredo" }).descrever();
    expect(d).toEqual({ configurado: true });
    expect(JSON.stringify(d)).not.toContain("segredo");
  });
});
