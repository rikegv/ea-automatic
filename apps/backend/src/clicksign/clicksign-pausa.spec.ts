import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClicksignSyncService } from "./clicksign-sync.service";
import { resolvePastaPaiId } from "../ai/drive-routing";

/**
 * PAUSA x CLICKSIGN (OST admissão pausada, ponto 4 dos 6).
 *
 * O que se prova aqui é o DISPARO do envelope: admissão pausada não cria envelope, e o corte
 * acontece ANTES de qualquer chamada à Clicksign. Isso importa porque o job `criar-envelope` pode
 * ter sido enfileirado ANTES da pausa (kit gerado, worker atrasado): se a checagem vivesse só no
 * enfileiramento, o envelope nasceria mesmo com a admissão pausada, e aí o estrago seria real
 * (envelope em `running` não tem cancelamento programático nesta conta, §A.5).
 *
 * A prova do TICK (pular envelope já existente sem cancelar) é de LISTA DE ALVOS, feita contra o
 * Postgres real no Bloco 6: o fake de `select` daqui ignora o WHERE, então um teste de unidade
 * "provaria" o filtro sem exercê-lo. Melhor um teste honesto do que um verde falso.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

/** Builder thenable que ignora a query e resolve um resultado fixo. */
function selectChain<T>(result: T) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "groupBy"]) b[m] = () => b;
  b.then = (res: (v: T) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}

/** `pausadaEm` é o que este spec varia; o resto é uma admissão pronta para assinar. */
function montar(pausadaEm: Date | null) {
  const criarEnvelope = vi.fn().mockResolvedValue({ id: "env-novo" });
  const api = {
    estaAtivo: () => true,
    criarEnvelope,
    anexarDocumento: vi.fn().mockResolvedValue({ id: "doc-1" }),
    adicionarSigner: vi.fn().mockResolvedValue({ id: "sig-1" }),
    criarRequirement: vi.fn().mockResolvedValue(undefined),
    ativarEnvelope: vi.fn().mockResolvedValue(undefined),
  };

  const adm = {
    id: "adm-1",
    codCliente: "16",
    tipoContrato: "Temporário",
    clicksignEnvelopeId: null,
    candidatoNome: "Maria Silva",
    candidatoCpf: "11144477735",
    candidatoEmail: "maria@e.com",
    clienteOperacao: "Loja Centro",
    pausadaEm,
  };
  // 1ª chamada: carregarAdmissao. 2ª: carregarFrentes (3 frentes concluídas = gate F9 aberto).
  const resultados: unknown[] = [
    [adm],
    [
      { tipo: "AUDITORIA", concluida: true },
      { tipo: "EXAME", concluida: true },
      { tipo: "CADASTRO_CONTRATO", concluida: true },
    ],
  ];
  let i = 0;
  const select = vi.fn().mockImplementation(() => selectChain(resultados[i++] ?? []));
  const setCalls: Record<string, unknown>[] = [];
  const update = vi.fn().mockImplementation(() => ({
    set: (v: Record<string, unknown>) => {
      setCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
  }));

  // Scheduler do tick (INT-4): o ciclo registra início/resultado; nos testes é inerte.
  const schedulerFake = {
    marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
    registrarCiclo: vi.fn().mockResolvedValue(undefined),
  };
  // Assinante da empresa (INT-4): nos testes, um representante fixo resolvido sem banco.
  const assinantesFake = {
    resolverConjunto: vi.fn().mockResolvedValue([
      {
        codCliente: null,
        nome: "Representante Soulan",
        email: "representante@soulan.com.br",
        cpf: "11144477735",
        ordem: 1,
        ativo: true,
      },
    ]),
  };
  const svc = new ClicksignSyncService(
    { select, update, query: {} } as never,
    {} as ConfigService,
    api as never,
    { enfileirarTick: vi.fn(), enfileirarCriarEnvelope: vi.fn() } as never,
    { dentroDaRaiz: vi.fn().mockReturnValue(true), salvar: vi.fn(), removerArquivo: vi.fn() } as never,
    { arquivarDrive: vi.fn() } as never,
    { gerar: vi.fn() } as never,
    drivePastaPaiFake as never,
    schedulerFake as never,
    assinantesFake as never,
  );
  const warn = vi
    .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
    .mockImplementation(() => undefined);
  return { svc, api, criarEnvelope, setCalls, warn };
}

describe("criarEnvelope x admissão PAUSADA (ponto 4 dos 6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("PAUSADA: não cria envelope, não chama a Clicksign e não grava status", async () => {
    const { svc, criarEnvelope, api, setCalls, warn } = montar(new Date("2026-07-27T12:00:00Z"));
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");

    expect(criarEnvelope).not.toHaveBeenCalled();
    expect(api.anexarDocumento).not.toHaveBeenCalled();
    expect(api.ativarEnvelope).not.toHaveBeenCalled();
    // Nada gravado: sem envelope criado, não há o que cancelar ao retomar.
    expect(setCalls).toHaveLength(0);
    expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).toMatch(/PAUSADA/i);
  });

  it("o corte é ANTES do gate F9: pausada nem chega a consultar a Clicksign", async () => {
    const { svc, api } = montar(new Date());
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    // Nenhum método da API tocado — o adiamento é total, não parcial.
    for (const [nome, fn] of Object.entries(api)) {
      if (typeof fn === "function" && nome !== "estaAtivo") {
        expect(fn as ReturnType<typeof vi.fn>, nome).not.toHaveBeenCalled();
      }
    }
  });

  /**
   * O contraste que dá sentido aos dois testes acima. A pausa é a ÚNICA coisa diferente entre este
   * caso e o primeiro, e o desfecho tem de ser observavelmente diferente.
   *
   * O discriminador é o ponto em que o fluxo para: PAUSADA retorna em silêncio no ponto 4; NÃO
   * pausada atravessa o ponto 4 e o gate F9, chega na leitura do kit e LANÇA "Kit ausente na
   * staging" (o arquivo não existe no ambiente de teste). Ou seja, o erro do kit é a prova de que
   * a pausa não barrou.
   */
  it("NÃO pausada: atravessa o ponto 4 e só para na leitura do kit (a pausa é a única diferença)", async () => {
    const { svc, warn } = montar(null);
    await expect(svc.criarEnvelope("adm-1", "/staging/kit.pdf")).rejects.toThrow(
      /Kit ausente na staging/,
    );
    // E não parou por pausa: nenhum aviso de PAUSADA foi emitido.
    expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).not.toMatch(/PAUSADA/i);
  });
});
