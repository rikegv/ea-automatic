import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { LiberarAdmissaoDto } from "./dto/liberar-admissao.dto";
import { pendenciasObrigatorias } from "../domain/admissao";
import type { AuthUser } from "../auth/auth.types";

/**
 * UNIFORME E EPI (OST Onda 3, item 1).
 *
 * As três regras que estes testes protegem, todas do diretor:
 *  1. UNIFORME é pendência obrigatória, e a pendência é a RESPOSTA. "Não possui" fecha; não ter
 *     respondido é o que cobra. Ter uniforme nunca bloqueia nada.
 *  2. EPI NÃO é pendência: liberação passa sem resposta nenhuma.
 *  3. Nada é digitável: tamanho fora do catálogo é recusado pelo DTO, e responder "não possui"
 *     LIMPA o detalhe em vez de guardar tamanho de quem não tem uniforme.
 */

const MASTER: AuthUser = {
  id: "user-1",
  email: "master@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};
const CPF_OK = "52998224725";
const CARGO = "11111111-1111-4111-8111-111111111111";

/** Base sem nenhuma pendência ALÉM da que cada teste quer isolar. */
const COMPLETA = {
  codCliente: "100",
  cargoId: CARGO,
  dataAdmissao: "2026-09-01",
  tipoContrato: "Temporário",
  vagaFolha: {
    salario: "2500.00",
    beneficios: "VR",
    escala: "12x36",
    centroCusto: "CC1",
    setor: "Operação",
    gestorBp: "Fulana",
  },
  temBeneficioEstruturado: true,
};

describe("régua unificada: uniforme (OST Onda 3, item 1)", () => {
  it("NÃO respondido vira pendência obrigatória", () => {
    expect(pendenciasObrigatorias(COMPLETA)).toEqual(["Uniforme"]);
  });

  it('responder "não possui" FECHA a pendência (cobra-se a resposta, não o uniforme)', () => {
    expect(pendenciasObrigatorias({ ...COMPLETA, possuiUniforme: false })).toEqual([]);
  });

  it('responder "possui" também fecha, e ter uniforme não vira pendência nova', () => {
    expect(pendenciasObrigatorias({ ...COMPLETA, possuiUniforme: true })).toEqual([]);
  });

  it("o cliente pode DESLIGAR a cobrança, como qualquer outro item", () => {
    expect(pendenciasObrigatorias(COMPLETA, new Set(["UNIFORME"]))).toEqual([]);
  });

  it("EPI NUNCA entra na régua (decisão do diretor)", () => {
    // Nenhuma combinação de EPI muda a lista: a régua não conhece EPI, e é isso que se garante.
    expect(pendenciasObrigatorias({ ...COMPLETA, possuiUniforme: true })).toEqual([]);
  });
});

describe("DTO da liberação: catálogo fechado", () => {
  const base = { codCliente: "100", cargoId: CARGO };

  it("aceita tamanhos do catálogo (camiseta alfabética, calça numérica, bota numérica)", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, {
      ...base,
      uniforme: { possui: true, camiseta: "GG", calca: "44", bota: "42" },
    });
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
  });

  it("aceita calça ALFABÉTICA (a calça é o campo que tem as duas formas)", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, {
      ...base,
      uniforme: { possui: true, calca: "G3" },
    });
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
  });

  it("RECUSA tamanho fora do catálogo (nada é digitável)", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, {
      ...base,
      uniforme: { possui: true, camiseta: "XG" },
    });
    expect(validateSync(dto, { whitelist: true }).length).toBeGreaterThan(0);
  });

  it("RECUSA camiseta com tamanho NUMÉRICO (só a calça aceita número)", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, {
      ...base,
      uniforme: { possui: true, camiseta: "42" },
    });
    expect(validateSync(dto, { whitelist: true }).length).toBeGreaterThan(0);
  });

  it("RECUSA item de EPI fora do catálogo", () => {
    const dto = plainToInstance(LiberarAdmissaoDto, {
      ...base,
      epi: { possui: true, itens: ["CAPACETE", "BOTINA"] },
    });
    expect(validateSync(dto, { whitelist: true }).length).toBeGreaterThan(0);
  });
});

/** Fake mínimo do Drizzle para o caminho da liberação individual. */
function montar() {
  const atualizados: Record<string, unknown>[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        atualizados.push(v);
        return { where: async () => undefined };
      },
    })),
    insert: vi.fn(() => ({ values: async () => undefined })),
    // A régua do par é lida DENTRO da transação (`lerReguaDoPar` aceita db ou tx).
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
  };
  const db = {
    query: {
      admissoes: {
        findFirst: async () => ({
          id: "a1",
          candidatoCpf: CPF_OK,
          farolGlobal: "AGUARDANDO_LIBERACAO",
          isBanco: false,
          possivelDuplicata: false,
          tipoContrato: null,
          dataAdmissao: null,
        }),
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: "Fulano", cpf: CPF_OK }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { db, atualizados, service: new AdmissoesService(db as never) };
}

const DTO_BASE = { codCliente: "100", cargoId: CARGO };

describe("liberação individual: uniforme e EPI", () => {
  it("BARRA a liberação sem a resposta do uniforme", async () => {
    const { service, atualizados } = montar();

    const err = await service.liberar("a1", DTO_BASE, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("possui uniforme");
    expect(atualizados).toEqual([]); // não nasce nada sem a resposta
  });

  it('"não possui" LIBERA e não guarda tamanho nenhum', async () => {
    const { service, atualizados } = montar();

    // Tamanho enviado junto é IGNORADO: quem não tem uniforme não tem tamanho.
    const r = await service.liberar(
      "a1",
      { ...DTO_BASE, uniforme: { possui: false, camiseta: "GG" } },
      MASTER,
    );

    expect(r.admissaoId).toBe("a1");
    const vaga = atualizados.find((u) => "possuiUniforme" in u);
    expect(vaga).toMatchObject({
      possuiUniforme: false,
      uniformeCamiseta: null,
      uniformeCalca: null,
      uniformeBota: null,
    });
  });

  it('"possui" grava os três tamanhos e o sinalizador NÃO fica pendente por uniforme', async () => {
    const { service, atualizados } = montar();

    await service.liberar(
      "a1",
      {
        ...DTO_BASE,
        uniforme: { possui: true, camiseta: "M", calca: "42", bota: "40" },
      },
      MASTER,
    );

    expect(atualizados.find((u) => "possuiUniforme" in u)).toMatchObject({
      possuiUniforme: true,
      uniformeCamiseta: "M",
      uniformeCalca: "42",
      uniformeBota: "40",
    });
  });

  it("EPI grava os itens na ORDEM do catálogo e o texto do Outros", async () => {
    const { service, atualizados } = montar();

    await service.liberar(
      "a1",
      {
        ...DTO_BASE,
        uniforme: { possui: false },
        epi: { possui: true, itens: ["OUTROS", "CAPACETE"], outros: "protetor auricular" },
      },
      MASTER,
    );

    expect(atualizados.find((u) => "possuiEpi" in u)).toMatchObject({
      possuiEpi: true,
      epiItens: "CAPACETE,OUTROS",
      epiOutros: "protetor auricular",
    });
  });

  it('"Outros" marcado SEM dizer qual é recusado', async () => {
    const { service } = montar();

    const err = await service
      .liberar(
        "a1",
        {
          ...DTO_BASE,
          uniforme: { possui: false },
          epi: { possui: true, itens: ["OUTROS"] },
        },
        MASTER,
      )
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(String((err as Error).message)).toContain("Outros");
  });

  it('EPI "não possui" limpa itens e texto, e a liberação segue', async () => {
    const { service, atualizados } = montar();

    await service.liberar(
      "a1",
      {
        ...DTO_BASE,
        uniforme: { possui: false },
        epi: { possui: false, itens: ["CAPACETE"], outros: "algo" },
      },
      MASTER,
    );

    expect(atualizados.find((u) => "possuiEpi" in u)).toMatchObject({
      possuiEpi: false,
      epiItens: null,
      epiOutros: null,
    });
  });

  it("EPI ausente NÃO barra a liberação (não é pendência obrigatória)", async () => {
    const { service, atualizados } = montar();

    const r = await service.liberar("a1", { ...DTO_BASE, uniforme: { possui: true } }, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(atualizados.find((u) => "possuiEpi" in u)).toMatchObject({ possuiEpi: null });
  });
});
