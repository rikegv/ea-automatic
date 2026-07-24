import { describe, expect, it, vi } from "vitest";
import { EsteiraService } from "./esteira.service";

/**
 * BLOCO 4 (OST visualização/descarte) — §A.6: NOME DE ARQUIVO FORA DE `documentos_admissao`.
 *
 * O upload manual de ASO pela aba Exame gravava `ASO anexado: {nome do arquivo} ({bytes})`, e era a
 * ÚNICA porta por onde nome de arquivo entrava no banco. Nome escolhido por quem envia carrega PII na
 * prática (já se viu CPF em nome de arquivo). O nome saiu; o tamanho ficou, porque serve para
 * conferir que o upload subiu inteiro e não identifica ninguém.
 *
 * O nome no DRIVE não muda (`{Nome do Tipo}_{nome do candidato}`): lá o nome da pessoa entra de
 * propósito, é o prontuário dela.
 */

const ASO = { id: "tipo-aso", codigo: "ASO", nome: "ASO" };

/** Arquivo com nome deliberadamente cheio de PII, para o teste ter o que procurar. */
const ARQUIVO = {
  originalname: "ASO_MARIA_DA_SILVA_CPF_52998224725.pdf",
  size: 91234,
  buffer: Buffer.from("%PDF-1.4"),
} as Express.Multer.File;

function montar() {
  const gravados: Array<Record<string, unknown>> = [];
  const db = {
    query: {
      admissoes: { findFirst: vi.fn().mockResolvedValue({ id: "adm-1" }) },
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(ASO) },
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
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  };
  const auditoria = {
    // I.A responde válido: caminho feliz, sem interferir no que este teste observa.
    classificarAso: vi.fn().mockResolvedValue({ status: "VALIDADO", valido: true }),
  };
  const svc = new EsteiraService(db as never, {} as never, auditoria as never);
  return { svc, gravados, auditoria };
}

describe("BLOCO 4 — observação do ASO não guarda nome de arquivo (§A.6)", () => {
  it("grava só o tamanho, nunca o nome do arquivo enviado", async () => {
    const ctx = montar();

    await ctx.svc.anexarAso("adm-1", ARQUIVO);

    const observacoes = ctx.gravados
      .map((g) => g.observacao)
      .filter((o): o is string => typeof o === "string");

    expect(observacoes.length).toBeGreaterThan(0);
    for (const obs of observacoes) {
      expect(obs).toBe("ASO anexado (91234 bytes)");
      // O que não pode estar lá, dito de forma explícita para o teste falhar alto se voltar:
      expect(obs).not.toContain("MARIA");
      expect(obs).not.toContain(".pdf");
      expect(obs).not.toMatch(/\d{11}/); // nenhum CPF
    }
  });

  it("o nome do arquivo continua chegando à I.A e ao retorno da tela (não é persistido)", async () => {
    const ctx = montar();

    const out = await ctx.svc.anexarAso("adm-1", ARQUIVO);

    // A I.A precisa do nome só pela EXTENSÃO (a staging monta `{TIPO}__{uuid}.{ext}`).
    expect(ctx.auditoria.classificarAso).toHaveBeenCalledWith(
      "adm-1",
      expect.objectContaining({ originalname: ARQUIVO.originalname }),
    );
    // O retorno é resposta HTTP para quem acabou de enviar, não linha de banco.
    expect(out.aso.nome).toBe(ARQUIVO.originalname);
  });
});
