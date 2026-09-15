import "reflect-metadata";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PandapeNomeCacheService } from "./pandape-nome-cache.service";
import { PandapeSyncService } from "./pandape-sync.service";
import { JOB_SYNC_CANDIDATE } from "./pandape.queue";
import type { PandapeApiService } from "./pandape-api.service";
import type { AdmissoesService } from "../admissoes/admissoes.service";
import type { AuditoriaService } from "../auditoria/auditoria.service";

/**
 * ─ O CACHE DE NOMES: A RÉGUA DOS OITO PONTOS, TRAVADA EM TESTE (ponto 8 da própria régua) ──────
 *
 * O nome do candidato aparece na grade da fila e NÃO PODE existir em lugar nenhum além da memória
 * deste processo. Não há coluna para ele, não há log que o receba e não há retorno de job que o
 * carregue. Os dois últimos são os que se esquece, e o segundo é o mais traiçoeiro: o BullMQ grava o
 * RETORNO de todo job no `returnvalue`, NO REDIS. Um `return { nome }` bem-intencionado publicaria
 * dado pessoal num armazenamento que ninguém audita.
 *
 * §A.6: o nome usado aqui é de FICÇÃO e existe só para provar que ele NÃO chega aonde não deve.
 */

const NOME_FICTICIO = "Fulano De Tal";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PandapeNomeCacheService: TTL, teto e evicção (pontos 1 e 2 da régua)", () => {
  it("guarda e lê", () => {
    const c = new PandapeNomeCacheService();
    c.guardar("PC-1", NOME_FICTICIO);
    expect(c.ler("PC-1")).toBe(NOME_FICTICIO);
  });

  /**
   * A ENTRADA VENCIDA É REMOVIDA, não apenas ignorada. Ignorar deixaria o nome VIVO na memória do
   * processo por tempo indeterminado, com a tela mostrando "não informado": pareceria correto e não
   * seria. O backend roda por SEMANAS sob `systemd --user`.
   */
  it("TTL vencido: some da leitura E sai do Map", () => {
    const c = new PandapeNomeCacheService();
    c.guardar("PC-1", NOME_FICTICIO);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + PandapeNomeCacheService.TTL_MS + 1);

    expect(c.ler("PC-1")).toBeUndefined();
    expect(c.tamanho()).toBe(0); // a prova de que REMOVEU, e não só deixou de devolver
  });

  /**
   * TETO COM EVICÇÃO, ALÉM DO TTL. Sem teto, um pico de eventos deixa um CADASTRO DE NOMES vivo no
   * processo até o TTL vencer um a um, e isso não cumpre minimização.
   */
  it("batido o teto, a entrada MAIS ANTIGA sai", () => {
    const c = new PandapeNomeCacheService();
    for (let i = 0; i < PandapeNomeCacheService.TETO + 10; i += 1) c.guardar(`PC-${i}`, `Nome ${i}`);

    expect(c.tamanho()).toBe(PandapeNomeCacheService.TETO);
    expect(c.ler("PC-0")).toBeUndefined(); // a primeira a entrar é a primeira a sair
    expect(c.ler(`PC-${PandapeNomeCacheService.TETO + 9}`)).toBe(
      `Nome ${PandapeNomeCacheService.TETO + 9}`,
    );
  });

  it("limpa tudo no encerramento do módulo (ponto 6)", () => {
    const c = new PandapeNomeCacheService();
    c.guardar("PC-1", NOME_FICTICIO);
    c.onModuleDestroy();
    expect(c.tamanho()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O NOME NÃO SAI DO PROCESSO: nem pelo log, nem pelo retorno do job (pontos 3 e 4 da régua)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

function makeDb() {
  return {
    query: {
      integracaoPandape: { findFirst: vi.fn().mockResolvedValue(undefined) },
      clientes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      cargos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(undefined) },
      usuarios: { findFirst: vi.fn().mockResolvedValue(undefined) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      candidatos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    insert: vi.fn(() => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) })),
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
  };
}

function novoSync(nomes: PandapeNomeCacheService) {
  const api = {
    estaAtivo: vi.fn(() => true),
    listarMudancas: vi.fn().mockResolvedValue([]),
    getPrecollaborator: vi.fn().mockResolvedValue({
      idPreCollaborator: "PC-1",
      idMatch: "M-1",
      idVacancy: "V-1",
      etapa: "DOCUMENTACAO",
      nome: NOME_FICTICIO,
      cpf: "52998224725",
      documents: [],
    }),
    getVacancy: vi.fn().mockResolvedValue(undefined),
    getMatch: vi.fn().mockResolvedValue(undefined),
    getFormulariosDocumentos: vi.fn().mockResolvedValue([]),
  } as unknown as PandapeApiService;
  const admissoes = {
    create: vi.fn().mockResolvedValue({ admissaoId: "adm-1" }),
    criarPreAdmissao: vi.fn().mockResolvedValue({ admissaoId: "pre-1" }),
    vivasPorCpf: vi.fn().mockResolvedValue([]),
    adotarEventoPandape: vi.fn().mockResolvedValue(undefined),
  } as unknown as AdmissoesService;
  const Ctor = PandapeSyncService as unknown as new (...args: unknown[]) => PandapeSyncService;
  return new Ctor(
    makeDb(),
    { get: () => undefined } as unknown as ConfigService,
    api,
    { enfileirarCandidato: vi.fn().mockResolvedValue(true) },
    admissoes,
    { auditarConjunto: vi.fn() } as unknown as AuditoriaService,
    { estaLigado: vi.fn().mockResolvedValue(true) },
    { registrarRecebimento: vi.fn(), registrarDesfecho: vi.fn(), registrarTentativa: vi.fn() },
    nomes,
  );
}

describe("o nome resolvido no worker não sai da memória", () => {
  it("o worker guarda o nome NO CACHE (é de lá que a grade lê)", async () => {
    const nomes = new PandapeNomeCacheService();
    await novoSync(nomes).processarCandidato("PC-1");
    expect(nomes.ler("PC-1")).toBe(NOME_FICTICIO);
  });

  /**
   * O RETORNO DO JOB VAI PARA O REDIS. Este teste roda o job inteiro, pela mesma porta que o worker
   * usa, e afirma sobre o que ele DEVOLVE: nada que contenha o nome. Um `return` de conveniência no
   * `sync-candidate` publicaria dado pessoal num armazenamento que ninguém audita.
   */
  it("o retorno de processarJob NÃO contém o nome (o BullMQ grava o retorno no Redis)", async () => {
    const nomes = new PandapeNomeCacheService();
    const svc = novoSync(nomes) as unknown as { processarJob(job: unknown): Promise<unknown> };

    const retorno = await svc.processarJob({
      name: JOB_SYNC_CANDIDATE,
      data: { idPrecollaborator: "PC-1" },
      attemptsMade: 0,
      opts: { attempts: 6 },
    });

    expect(JSON.stringify(retorno ?? null).toUpperCase()).not.toContain("FULANO");
    // E o nome ESTÁ no cache: a prova de que ele foi resolvido e mesmo assim não saiu pelo retorno.
    expect(nomes.ler("PC-1")).toBe(NOME_FICTICIO);
  });

  /** ZERO LOG (ponto 4). Nenhuma das três severidades pode receber uma string com o nome dentro. */
  it("nenhum log do caminho carrega o nome", async () => {
    const espioes = [
      vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined),
      vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined),
    ];

    const nomes = new PandapeNomeCacheService();
    await novoSync(nomes).processarCandidato("PC-1");
    nomes.onModuleDestroy();

    const tudo = espioes
      .flatMap((e) => e.mock.calls)
      .map((c) => JSON.stringify(c))
      .join(" ")
      .toUpperCase();
    expect(tudo).not.toContain("FULANO");
  });
});
