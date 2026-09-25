import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { DocumentoArquivoService } from "./documento-arquivo.service";
import { ReauditoriaService } from "./reauditoria.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";
import { MENSAGEM_RECUSA_REABERTURA } from "../domain/reabertura-documento";

/**
 * A GUARDA VIVE NAS TRÊS PORTAS, e é isso que esta suíte prova.
 *
 * "Guarda que mora em uma porta de três não é guarda": a porta esquecida vira o contorno pronto da
 * outra. As portas que devolvem documento de aprovado para pendente são duas, `descartar` e
 * `reauditar`, e a terceira, a validação humana, é provada aqui como porta que NÃO reabre (só grava
 * ENTREGUE), que é o motivo documentado de ela não carregar a guarda.
 *
 * §A.6: nenhum cenário desta suíte carrega CPF, nome de candidato ou URL.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const TIPO_RG = { id: "tipo-rg", codigo: "RG", nome: "RG" };

/** Os três estados que BARRAM, e o motivo que cada um tem de reportar. */
const BLOQUEIOS = [
  {
    nome: "envelope aguardando assinatura",
    admissao: { clicksignStatus: "AGUARDANDO_ASSINATURA", kitAssinaturaPath: null, kitAssinaturaEm: null },
    mensagem: MENSAGEM_RECUSA_REABERTURA.ENVELOPE_AGUARDANDO_ASSINATURA,
  },
  {
    nome: "contrato já assinado",
    admissao: { clicksignStatus: "ASSINADO", kitAssinaturaPath: null, kitAssinaturaEm: null },
    mensagem: MENSAGEM_RECUSA_REABERTURA.ENVELOPE_ASSINADO,
  },
  {
    nome: "kit já gerado e na fila",
    admissao: {
      clicksignStatus: "SEM_ENVELOPE",
      kitAssinaturaPath: "/staging/adm-1/kit.pdf",
      kitAssinaturaEm: new Date(),
    },
    mensagem: MENSAGEM_RECUSA_REABERTURA.KIT_NA_FILA_DE_ASSINATURA,
  },
];

/** db mínimo, comum às duas portas guardadas. Registra QUALQUER escrita, para provar que não houve. */
function montarDb(admissao: Record<string, unknown>) {
  const escritas: string[] = [];
  const db = {
    query: {
      tiposDocumento: { findFirst: vi.fn(async () => TIPO_RG) },
      admissoes: { findFirst: vi.fn(async () => ({ id: "adm-1", ...admissao })) },
      documentosAdmissao: { findFirst: vi.fn(async () => ({ estado: "ENTREGUE" })) },
    },
    update: vi.fn(() => {
      escritas.push("update");
      return { set: () => ({ where: async () => undefined }) };
    }),
    insert: vi.fn(() => {
      escritas.push("insert");
      return { values: async () => undefined };
    }),
    delete: vi.fn(() => {
      escritas.push("delete");
      return { where: async () => undefined };
    }),
    transaction: vi.fn(async () => {
      escritas.push("transaction");
    }),
  };
  return { db, escritas };
}

describe("PORTA 1 — `descartar` recusa a reabertura com contrato vivo", () => {
  for (const caso of BLOQUEIOS) {
    it(`recusa com ${caso.nome}`, async () => {
      const { db, escritas } = montarDb(caso.admissao);
      const staging = { listar: vi.fn(async () => []), removerArquivo: vi.fn() };
      const auditoria = { aplicarPosVeredito: vi.fn() };
      const svc = new DocumentoArquivoService(db as never, staging as never, auditoria as never);

      await expect(svc.descartar("adm-1", TIPO_RG.id, USER)).rejects.toThrow(ConflictException);
      await expect(svc.descartar("adm-1", TIPO_RG.id, USER)).rejects.toThrow(caso.mensagem);

      // A guarda vem ANTES de qualquer efeito: nada foi escrito, nada foi removido da staging.
      expect(escritas).toEqual([]);
      expect(staging.removerArquivo).not.toHaveBeenCalled();
      expect(auditoria.aplicarPosVeredito).not.toHaveBeenCalled();
    });
  }

  it("LIBERA quando não há envelope vivo nem kit na fila", async () => {
    const { db } = montarDb({
      clicksignStatus: "SEM_ENVELOPE",
      kitAssinaturaPath: null,
      kitAssinaturaEm: null,
      codCliente: null,
      cargoId: null,
      drivePastaUrl: null,
      driveAsoUrl: null,
    });
    const staging = { listar: vi.fn(async () => []), removerArquivo: vi.fn() };
    const auditoria = { aplicarPosVeredito: vi.fn() };
    const svc = new DocumentoArquivoService(db as never, staging as never, auditoria as never);

    const out = await svc.descartar("adm-1", TIPO_RG.id, USER);

    expect(out).toMatchObject({ reaberto: true, documento: { estado: "PENDENTE" } });
  });
});

describe("PORTA 2 — `reauditar` recusa a reabertura com contrato vivo", () => {
  for (const caso of BLOQUEIOS) {
    it(`recusa com ${caso.nome}`, async () => {
      const { db, escritas } = montarDb(caso.admissao);
      const auditoria = { auditarConjunto: vi.fn() };
      const staging = { listar: vi.fn(async () => []) };
      const pandape = { baixarArquivosDoTipo: vi.fn(), registrarArquivosColetados: vi.fn() };
      const validacaoHumana = { validadorDe: vi.fn(async () => undefined) };
      const svc = new ReauditoriaService(
        db as never,
        auditoria as never,
        staging as never,
        pandape as never,
        validacaoHumana as never,
      );

      await expect(svc.reauditar("adm-1", TIPO_RG.id, USER)).rejects.toThrow(ConflictException);
      await expect(svc.reauditar("adm-1", TIPO_RG.id, USER)).rejects.toThrow(caso.mensagem);

      // A guarda vem ANTES de tudo: nem a IA foi chamada, nem a validação humana foi consultada.
      expect(auditoria.auditarConjunto).not.toHaveBeenCalled();
      expect(validacaoHumana.validadorDe).not.toHaveBeenCalled();
      expect(escritas).toEqual([]);
    });
  }
});

describe("PORTA 3 — a validação humana NÃO é porta de reabertura", () => {
  it("só grava ENTREGUE, então nunca des-completa a régua (por isso não carrega a guarda)", async () => {
    const gravados: Array<Record<string, unknown>> = [];
    const db = {
      query: {
        tiposDocumento: { findFirst: vi.fn(async () => TIPO_RG) },
        documentosAdmissao: { findFirst: vi.fn(async () => ({ estado: "PENDENTE" })) },
        usuarios: { findFirst: vi.fn(async () => ({ nome: "Consultor" })) },
        // Sem cliente/cargo: o pós-veredito não roda, o teste fala só do write de estado.
        admissoes: { findFirst: vi.fn(async () => ({ id: "adm-1", codCliente: null, cargoId: null })) },
      },
      insert: vi.fn(() => ({
        values: (v: Record<string, unknown>) => {
          gravados.push(v);
          return {
            onConflictDoUpdate: (c: { set: Record<string, unknown> }) => {
              gravados.push(c.set);
              return Promise.resolve(undefined);
            },
          };
        },
      })),
    };
    // A trilha usa `insert(...).values(...)` sem conflito: o `values` acima devolve objeto, e o
    // await sobre ele resolve sem erro. É suficiente para inspecionar o que foi escrito.
    const svc = new ValidacaoHumanaService(db as never, { aplicarPosVeredito: vi.fn() } as never);

    await svc.validar("adm-1", TIPO_RG.id, USER);

    const estados = gravados.map((g) => g.estado).filter(Boolean);
    expect(estados.length).toBeGreaterThan(0);
    // NENHUM estado gravado por esta porta devolve o documento para trás.
    for (const estado of estados) expect(estado).toBe("ENTREGUE");
  });
});
