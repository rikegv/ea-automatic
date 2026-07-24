import { ConflictException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { AuditoriaService } from "../auditoria/auditoria.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";

/**
 * QA da VALIDAÇÃO HUMANA e da sua PRECEDÊNCIA sobre a IA (OST B1, Blocos 3 e 4).
 *
 * O que esta suíte trava:
 *  - validar marca ENTREGUE + QUEM validou + QUANDO (a marcação que não existia);
 *  - o nome de quem validou vai para o motivo EXIBIDO, não fica só na trilha;
 *  - qualquer consultor pode validar (não há checagem de papel no serviço);
 *  - a trilha registra autor, tipo e estado anterior, sem PII (§A.6);
 *  - o conflito da reauditoria carrega o NOME, que é o que a tela precisa para perguntar.
 */

const USER: AuthUser = {
  id: "user-9",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const TIPO = { id: "tipo-rg", codigo: "RG", nome: "RG" };

function makeDb(estadoAtual?: string) {
  const upserts: Array<Record<string, unknown>> = [];
  const trilha: Array<Record<string, unknown>> = [];
  const db = {
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(TIPO) },
      documentosAdmissao: {
        findFirst: vi.fn(async () => (estadoAtual ? { estado: estadoAtual } : undefined)),
      },
      usuarios: {
        findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Ana Clara Souza", email: USER.email }),
      },
      admissoes: { findFirst: vi.fn().mockResolvedValue({ codCliente: "C-1", cargoId: "cargo-1" }) },
    },
    // O destino é reconhecido pelo FORMATO do values: a trilha tem `campo`, o documento tem `estado`.
    // Mais robusto que contar chamadas, porque o serviço pode ser exercitado várias vezes no mesmo teste.
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        if ("campo" in v) {
          trilha.push(v);
          return Promise.resolve(undefined);
        }
        upserts.push(v);
        return { onConflictDoUpdate: async () => undefined };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({ leftJoin: () => ({ where: () => Promise.resolve([]) }) }),
    })),
  };
  return { db, upserts, trilha };
}

function makeService(db: ReturnType<typeof makeDb>["db"]) {
  // Pós-veredito FALSO nesta suíte, de propósito: aqui o alvo é a marcação humana em si. Quem cobre
  // a integração real com conclusão de frente e Drive é `validacao-humana-fecha-regua.spec.ts`.
  const auditoria = {
    aplicarPosVeredito: vi
      .fn()
      .mockResolvedValue({ progresso: { completa: false, obrigatoriosTotal: 6 }, sinalizador: "PARCIAL" }),
  } as unknown as AuditoriaService;
  return new ValidacaoHumanaService(db as never, auditoria);
}

afterEach(() => vi.restoreAllMocks());

describe("ValidacaoHumanaService (OST B1, Blocos 3 e 4)", () => {
  it("valida: documento vira ENTREGUE e grava QUEM validou e QUANDO", async () => {
    const { db, upserts } = makeDb("INCONFORME");
    const svc = makeService(db);

    const out = await svc.validar("adm-1", TIPO.id, USER);

    expect(out.documento.estado).toBe("ENTREGUE");
    expect(upserts[0]).toMatchObject({ estado: "ENTREGUE", validadoPorId: "user-9" });
    expect(upserts[0].validadoEm).toBeInstanceOf(Date);
    expect(out.estadoAntes).toBe("INCONFORME");
  });

  it("o NOME de quem validou vai no motivo EXIBIDO, não só na trilha", async () => {
    const { db, upserts } = makeDb("PENDENTE");
    const svc = makeService(db);

    const out = await svc.validar("adm-1", TIPO.id, USER);

    expect(out.documento.observacao).toContain("Ana Clara Souza");
    expect(upserts[0].observacao).toContain("Ana Clara Souza");
    expect(out.validadoPor.nome).toBe("Ana Clara Souza");
  });

  it("QUALQUER consultor pode validar: o serviço não olha papel", async () => {
    const { db } = makeDb("INCONFORME");
    const svc = makeService(db);

    for (const papel of ["COMUM", "MASTER", "SUPER_ADMIN"] as const) {
      await expect(svc.validar("adm-1", TIPO.id, { ...USER, papel })).resolves.toBeTruthy();
    }
  });

  it("trilha grava autor, tipo e estado anterior, sem PII (§A.6)", async () => {
    const { db, trilha } = makeDb("INCONFORME");
    const svc = makeService(db);

    await svc.validar("adm-1", TIPO.id, USER);

    expect(trilha[0]).toMatchObject({
      admissaoId: "adm-1",
      campo: "validacao-humana:RG",
      valorAnterior: "INCONFORME",
      valorNovo: "ENTREGUE",
      autorId: "user-9",
    });
    expect(JSON.stringify(trilha)).not.toMatch(/\d{11}/); // nenhum CPF
  });

  it("o conflito da reauditoria carrega o NOME de quem validou (a tela pergunta com ele)", () => {
    const erro = ValidacaoHumanaService.conflitoValidacaoHumana("Ana Clara Souza");
    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.message).toContain("Ana Clara Souza");
    expect(erro.message).toContain("reanalisar");
  });
});
