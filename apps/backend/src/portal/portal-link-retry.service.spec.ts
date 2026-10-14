import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResultadoDoEnvioDoLink } from "@ea/shared-types";
import { PortalLinkRetryService } from "./portal-link-retry.service";
import { JOB_RETENTAR_EMISSAO } from "./portal-link.queue";

/**
 * ─ O SERVIÇO QUE TIRA A EMISSÃO DO SILÊNCIO, COBERTURA INDEPENDENTE (§A.38) ─────────────────────
 *
 * Escrito a partir do REQUISITO da frente A.1, no molde de `clicksign-queue.service.spec.ts`:
 * monta o serviço com dublês (SEM subir Redis/BullMQ, sem chamar onModuleInit), enfia a `Queue`
 * falsa no campo privado e espiona o `queue.add` e o `db.update`. O que se prova aqui é o
 * COMPORTAMENTO do CAMINHO DO GANCHO (registrarResultado / registrarExcecao):
 *
 *   SUCESSO            -> db.update LIMPA o estado (nulos / 0) e NÃO enfileira.
 *   (c) dado faltando  -> db.update CARIMBA (motivo + tentativa 1) e NÃO enfileira.
 *   (b) transitória    -> db.update CARIMBA e ENFILEIRA um job com jobId SEM ':'.
 *   (a) recusa legítima-> NADA: nem carimbo, nem trilha, nem fila.
 *   exceção no gancho  -> carimba EXCECAO_INESPERADA e enfileira (é (b)).
 *
 * E as duas tolerâncias que o requisito exige: a trilha não derruba o caminho (guarda do pepper
 * ausente + exceção da gravação engolida) e qualquer erro no registro é best-effort (não propaga).
 */

const ADM = "11111111-2222-3333-4444-555555555555";
const AUTOR = "u-autor";

const LIMPO = { portalLinkFalhaEm: null, portalLinkFalhaMotivo: null, portalLinkTentativas: 0 };

/** Resultado de emissão completo (a taxonomia só lê enviado+motivo; o resto é só para o tipo). */
function resultado(
  parcial: Pick<ResultadoDoEnvioDoLink, "enviado" | "motivo">,
): ResultadoDoEnvioDoLink {
  return {
    canal: "EMAIL",
    origem: "AUTOMATICO",
    destinoMascarado: null,
    enviadoEm: null,
    expiraEm: null,
    ...parcial,
  };
}

interface OpcoesDoMonte {
  comQueue?: boolean;
  trilhaConfigurada?: boolean;
  /** db.update(...).set(...).where(...) rejeita (simula banco fora): prova o best-effort. */
  updateQuebra?: boolean;
  /** trilha.registrar rejeita (simula pepper ausente lançando): prova que não propaga. */
  trilhaQuebra?: boolean;
}

function montar(opts: OpcoesDoMonte = {}) {
  const { comQueue = true, trilhaConfigurada = true, updateQuebra = false, trilhaQuebra = false } =
    opts;

  // db.update(tabela).set(payload).where(cond): captura cada payload de .set.
  const setPayloads: Array<Record<string, unknown>> = [];
  const where = vi.fn(() => (updateQuebra ? Promise.reject(new Error("db fora")) : Promise.resolve()));
  const set = vi.fn((payload: Record<string, unknown>) => {
    setPayloads.push(payload);
    return { where };
  });
  const update = vi.fn(() => ({ set }));
  const db = { update } as unknown as ConstructorParameters<typeof PortalLinkRetryService>[0];

  const config = { get: () => undefined } as unknown as ConstructorParameters<
    typeof PortalLinkRetryService
  >[1];

  const enviarParaAdmissao = vi.fn();
  const envio = { enviarParaAdmissao } as unknown as ConstructorParameters<
    typeof PortalLinkRetryService
  >[2];

  const configurada = vi.fn().mockReturnValue(trilhaConfigurada);
  const registrar = vi.fn(() =>
    trilhaQuebra ? Promise.reject(new Error("pepper ausente")) : Promise.resolve(),
  );
  const trilha = { configurada, registrar } as unknown as ConstructorParameters<
    typeof PortalLinkRetryService
  >[3];

  const svc = new PortalLinkRetryService(db, config, envio, trilha);

  const add = vi.fn().mockResolvedValue(undefined);
  if (comQueue) {
    (svc as unknown as { queue: { add: typeof add } }).queue = { add };
  }
  // Silencia e permite inspecionar o logger privado.
  const warn = vi.fn();
  const error = vi.fn();
  (svc as unknown as { log: object }).log = { warn, error, log: vi.fn() };

  return { svc, update, set, setPayloads, add, configurada, registrar, warn, error };
}

afterEach(() => vi.restoreAllMocks());

describe("registrarResultado: SUCESSO limpa o estado", () => {
  it("enviado:true -> db.update com nulos/0 e NÃO enfileira", async () => {
    const { svc, setPayloads, add } = montar();

    await svc.registrarResultado(ADM, AUTOR, resultado({ enviado: true, motivo: null }));

    expect(setPayloads).toHaveLength(1);
    expect(setPayloads[0]).toEqual(LIMPO);
    expect(add).not.toHaveBeenCalled();
  });
});

describe("registrarResultado: (c) dado faltando: carimba, NÃO retenta", () => {
  for (const motivo of ["SEM_EMAIL", "EMAIL_INVALIDO"] as const) {
    it(`${motivo} -> carimba (motivo + tentativa 1) e NÃO enfileira`, async () => {
      const { svc, setPayloads, add } = montar();

      await svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo }));

      expect(setPayloads).toHaveLength(1);
      expect(setPayloads[0]).toMatchObject({
        portalLinkFalhaMotivo: motivo,
        portalLinkTentativas: 1,
      });
      expect(setPayloads[0].portalLinkFalhaEm).toBeInstanceOf(Date);
      // Não limpa (não é sucesso) e não há retry para dado que não muda sozinho.
      expect(setPayloads[0]).not.toMatchObject(LIMPO);
      expect(add).not.toHaveBeenCalled();
    });
  }
});

describe("registrarResultado: (b) transitória: carimba E enfileira", () => {
  for (const motivo of ["CANAL_INDISPONIVEL", "FALHA_NO_ENVIO"] as const) {
    it(`${motivo} -> carimba e enfileira um job com jobId SEM ':'`, async () => {
      const { svc, setPayloads, add } = montar();

      await svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo }));

      expect(setPayloads).toHaveLength(1);
      expect(setPayloads[0]).toMatchObject({
        portalLinkFalhaMotivo: motivo,
        portalLinkTentativas: 1,
      });

      expect(add).toHaveBeenCalledTimes(1);
      const [nome, data, opcoes] = add.mock.calls[0] as [
        string,
        { admissaoId: string; autorId: string },
        { jobId: string },
      ];
      expect(nome).toBe(JOB_RETENTAR_EMISSAO);
      expect(data).toEqual({ admissaoId: ADM, autorId: AUTOR });
      // §A.5: jobId único e SEM ':' (BullMQ usa ':' de separador interno).
      expect(opcoes.jobId).not.toContain(":");
    });
  }
});

describe("registrarResultado: (a) recusa legítima: IGNORAR, nada acontece", () => {
  for (const motivo of [null, "LINK_VIVO_EM_USO", "ENVIADO_HA_POUCO", "SEM_ADMISSAO"] as const) {
    it(`${motivo ?? "null (fluxo-2)"} -> nem carimba, nem trilha, nem fila`, async () => {
      const { svc, update, add, registrar } = montar();

      await svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo }));

      expect(update).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      expect(registrar).not.toHaveBeenCalled();
    });
  }
});

describe("registrarExcecao: exceção no gancho é (b)", () => {
  it("carimba EXCECAO_INESPERADA, tentativa 1, e enfileira o retry", async () => {
    const { svc, setPayloads, add } = montar();

    await svc.registrarExcecao(ADM, AUTOR);

    expect(setPayloads).toHaveLength(1);
    expect(setPayloads[0]).toMatchObject({
      portalLinkFalhaMotivo: "EXCECAO_INESPERADA",
      portalLinkTentativas: 1,
    });
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe("trilha da falha (§A.6): grava só o código e não derruba o caminho", () => {
  it("quando configurada, grava o evento com o CÓDIGO do motivo e origem AUTOMATICO, sem PII", async () => {
    const { svc, registrar } = montar({ trilhaConfigurada: true });

    await svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo: "FALHA_NO_ENVIO" }));

    expect(registrar).toHaveBeenCalledTimes(1);
    const [tipo, dados] = registrar.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(tipo).toBe("PORTAL_LINK_EMISSAO_FALHOU");
    expect(dados).toMatchObject({ motivoCodigo: "FALHA_NO_ENVIO", origem: "AUTOMATICO" });
    // §A.6: nenhuma PII na trilha (sem admissaoId, autorId, e-mail, link, cpf).
    const chaves = Object.keys(dados).map((k) => k.toLowerCase());
    for (const proibido of ["cpf", "email", "link", "url", "token", "admissao", "autor"]) {
      expect(chaves, `campo ${proibido} vazou na trilha`).not.toContain(proibido);
    }
  });

  it("trilha NÃO configurada (pepper ausente) -> não chama registrar e não lança", async () => {
    const { svc, registrar, add } = montar({ trilhaConfigurada: false });

    await expect(
      svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo: "CANAL_INDISPONIVEL" })),
    ).resolves.toBeUndefined();

    expect(registrar).not.toHaveBeenCalled();
    // A fila ainda roda: carimbo e retry não dependem da trilha.
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("gravação da trilha que LANÇA é engolida: o caminho conclui e o retry é enfileirado", async () => {
    const { svc, add } = montar({ trilhaConfigurada: true, trilhaQuebra: true });

    await expect(
      svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo: "CANAL_INDISPONIVEL" })),
    ).resolves.toBeUndefined();

    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe("best-effort: erro ao registrar NÃO propaga (a liberação é o fato, §A.5)", () => {
  it("db.update que rejeita não faz registrarResultado lançar", async () => {
    const { svc, error } = montar({ updateQuebra: true });

    await expect(
      svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo: "FALHA_NO_ENVIO" })),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
  });

  it("sem fila (Redis fora no boot) -> no-op logado, NÃO chama queue.add, não lança", async () => {
    const { svc, add, warn } = montar({ comQueue: false });

    await expect(
      svc.registrarResultado(ADM, AUTOR, resultado({ enviado: false, motivo: "CANAL_INDISPONIVEL" })),
    ).resolves.toBeUndefined();

    expect(add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
