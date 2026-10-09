import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * DESTRAVAMENTO DA LIBERAÇÃO ADMISSIONAL SEM CPF (continuidade do 66a0302, decisão do diretor).
 *
 * A liberação tem uma trava de CPF PRÓPRIA, separada do envio de A&S (`ponteViva`). Antes ela barrava
 * tudo que `isValidCpf` reprova, e o marcador PROVISÓRIO ("CPF Pendente") é reprovado por construção,
 * então quem foi enviado SEM CPF ficava estacionado em AGUARDANDO_LIBERACAO. A régua de negócio mudou:
 *   (a) CPF AUSENTE (marcador PROV) LIBERA e entra na esteira como CPF Pendente; o CPF real chega
 *       depois pelo portal e reaponta via `corrigirCpf` (ator SISTEMA, já existente);
 *   (b) CPF REAL com dígito verificador errado (erro de digitação, não ausência) CONTINUA barrado.
 *
 * `ehCpfProvisorio` é a FONTE ÚNICA do marcador (mesmo mecanismo do 66a0302, sem caminho paralelo).
 * §A.6: nenhum CPF entra em log nem na mensagem de erro.
 */

const MASTER: AuthUser = {
  id: "user-1",
  email: "master@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};
const CARGO = "11111111-1111-4111-8111-111111111111";
const CPF_VALIDO = "52998224725"; // verificador fecha
const CPF_REAL_INVALIDO = "52998224726"; // 11 dígitos, verificador NÃO fecha (caso b)
const CPF_PENDENTE = "PROV0ABCDEF"; // marcador: 11 chars, começa com PROV (caso a)

// GATE DOS OBRIGATÓRIOS-PARA-LIBERAR (item 6) preenchido, para exercitar SÓ a trava de CPF.
const DTO = {
  codCliente: "100",
  cargoId: CARGO,
  uniforme: { possui: false },
  sexo: "MASCULINO" as const,
  tipoContrato: "Interno",
  dataAdmissao: "2026-10-01",
  vagaFolha: { salarioUnidade: "MENSAL", escala: "12x36", beneficios: "VR" },
};

/** Viva do mesmo CPF, que a trava de duplicidade consultaria SE ela rodasse. */
const VIVA = {
  clienteRazao: "Cliente Um Ltda",
  clienteOperacao: "Operação Norte",
  cargoNome: "Auxiliar de Limpeza",
  farolGlobal: "EM_ADMISSAO",
};

/**
 * Fake do Drizzle no caminho da liberação individual, com o CPF da pré-admissão PARAMETRIZADO.
 * `vivas` são as outras admissões vivas do mesmo CPF (o que a trava de duplicidade leria).
 */
function montar(cpf: string, vivas: Record<string, unknown>[] = []) {
  const transacoes = { n: 0 };
  const tx = {
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    insert: vi.fn(() => ({ values: async () => undefined })),
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
  };
  const db = {
    query: {
      admissoes: {
        findFirst: async () => ({
          id: "a1",
          candidatoCpf: cpf,
          farolGlobal: "AGUARDANDO_LIBERACAO",
          isBanco: false,
          possivelDuplicata: false,
          tipoContrato: null,
          dataAdmissao: null,
        }),
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: "Fulano", cpf }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    // Sem join = régua do par (vazia). Com leftJoin = a trava de duplicidade (devolve `vivas`).
    select: vi.fn(() => ({
      from: () => {
        const comJoin: { leftJoin: () => typeof comJoin; where: () => Promise<unknown[]> } = {
          leftJoin: () => comJoin,
          where: async () => vivas,
        };
        return { ...comJoin, where: async () => [] };
      },
    })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes.n += 1;
      return fn(tx);
    },
  };
  return { service: new AdmissoesService(db as never), transacoes };
}

describe("liberação individual sem CPF: marcador PROVISÓRIO passa, CPF real inválido não", () => {
  it("(a) CPF AUSENTE (marcador PROV): LIBERA e nasce na esteira (CPF Pendente)", async () => {
    const { service, transacoes } = montar(CPF_PENDENTE);

    const r = await service.liberar("a1", DTO, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1); // a admissão nasceu: a trava de CPF NÃO barrou o marcador
  });

  it("(a) com marcador PROV, a trava de DUPLICIDADE é pulada: libera mesmo havendo 'outra viva'", async () => {
    // Sem CPF não há o que deduplicar. Se a trava rodasse, lançaria 409 e NÃO abriria transação;
    // como libera (transação = 1, sem throw), está provado que o caminho de dedup foi pulado.
    const { service, transacoes } = montar(CPF_PENDENTE, [VIVA]);

    const r = await service.liberar("a1", DTO, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("(b) CPF REAL com dígito errado: BARRA (dígito verificador), sem abrir transação", async () => {
    const { service, transacoes } = montar(CPF_REAL_INVALIDO);

    const err = await service.liberar("a1", DTO, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toContain("dígito verificador");
    expect(transacoes.n).toBe(0);
  });

  it("CPF REAL válido continua liberando como sempre (regressão)", async () => {
    const { service, transacoes } = montar(CPF_VALIDO);

    const r = await service.liberar("a1", DTO, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("§A.6: a mensagem do caso (b) NÃO repete o CPF", async () => {
    const { service } = montar(CPF_REAL_INVALIDO);

    const err = (await service.liberar("a1", DTO, MASTER).catch((e) => e)) as BadRequestException;

    expect(err.message).not.toContain(CPF_REAL_INVALIDO);
  });
});
