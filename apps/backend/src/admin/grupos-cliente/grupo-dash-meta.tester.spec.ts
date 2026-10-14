import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { AtualizarGrupoClienteDto, CriarGrupoClienteDto } from "./grupos-cliente.dto";
import { GruposClienteService } from "./grupos-cliente.service";
import { gruposCliente } from "../../db/schema";

/**
 * COBERTURA INDEPENDENTE (§A.38) — META OBRIGATÓRIA DO GRUPO (Alto Volume por grupo).
 *
 * Escrita a partir do REQUISITO, não do código. O que o requisito manda:
 *  - criar grupo SEM meta é recusado; meta < 1 é recusada;
 *  - editar aceita meta nova (>= 1) e, ao salvar, carimba `atualizadoEm`;
 *  - a meta criada chega à gravação (persistência), e a meta só é escrita na edição quando veio.
 *
 * A trava da criação mora no DTO (decisão registrada no schema: "a trava fica no DTO, não no banco,
 * para o legado sobreviver"), então a recusa é testada no DTO real, do jeito que o ValidationPipe
 * global roda (transform + validate), igual ao padrão de `salario-dto.spec.ts`.
 */

function validarCriar(payload: Record<string, unknown>) {
  const dto = plainToInstance(CriarGrupoClienteDto, payload);
  return validateSync(dto, { whitelist: true });
}

function validarAtualizar(payload: Record<string, unknown>) {
  const dto = plainToInstance(AtualizarGrupoClienteDto, payload);
  return validateSync(dto, { whitelist: true });
}

describe("CriarGrupoClienteDto: a meta é OBRIGATÓRIA e tem de ser >= 1", () => {
  it("criar SEM meta é recusado (a meta não é opcional na criação)", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu" });
    expect(erros.length).toBeGreaterThan(0);
    expect(erros.some((e) => e.property === "meta")).toBe(true);
  });

  it("meta ZERO é recusada: grupo com meta zero não é meta, é grupo sem alvo", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu", meta: 0 });
    expect(erros.some((e) => e.property === "meta")).toBe(true);
  });

  it("meta NEGATIVA é recusada", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu", meta: -5 });
    expect(erros.some((e) => e.property === "meta")).toBe(true);
  });

  it("meta FRACIONADA é recusada (tem de ser inteiro)", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu", meta: 10.5 });
    expect(erros.some((e) => e.property === "meta")).toBe(true);
  });

  it("meta inteira >= 1 passa", () => {
    expect(validarCriar({ nome: "CAGC Corifeu", meta: 1 })).toHaveLength(0);
    expect(validarCriar({ nome: "CAGC Corifeu", meta: 164 })).toHaveLength(0);
  });

  it("a recusa da meta NÃO ecoa o valor enviado e diz o alvo mínimo (§A.6/mensagem útil)", () => {
    const erros = validarCriar({ nome: "CAGC Corifeu", meta: 0 });
    const texto = JSON.stringify(erros.find((e) => e.property === "meta")?.constraints);
    expect(texto).toContain("1");
  });
});

describe("AtualizarGrupoClienteDto: meta OPCIONAL no patch, mas válida quando vem", () => {
  it("patch SEM meta passa (edição parcial, meta é opcional)", () => {
    expect(validarAtualizar({ descricao: "novo texto" })).toHaveLength(0);
    expect(validarAtualizar({})).toHaveLength(0);
  });

  it("meta nova >= 1 no patch passa", () => {
    expect(validarAtualizar({ meta: 200 })).toHaveLength(0);
  });

  it("meta < 1 no patch é recusada, a MESMA régua da criação", () => {
    expect(validarAtualizar({ meta: 0 }).some((e) => e.property === "meta")).toBe(true);
    expect(validarAtualizar({ meta: -1 }).some((e) => e.property === "meta")).toBe(true);
  });
});

/**
 * ─ A META PERSISTE, E A EDIÇÃO CARIMBA `atualizadoEm` ────────────────────────────────────────────
 *
 * O DTO barra o valor inválido; aqui a prova é que o valor VÁLIDO chega ao banco e que a edição
 * carimba a data auditável. Banco falso que captura o que foi gravado.
 */
describe("GruposClienteService: a meta chega à gravação e a edição carimba a data", () => {
  it("criar GRAVA a meta recebida no insert", async () => {
    const inseridos: Record<string, unknown>[] = [];
    const db = {
      // `exigirNomeLivre` lê os nomes existentes; vazio = nome livre.
      select: vi.fn(() => ({ from: async () => [] })),
      insert: vi.fn(() => ({
        values: (v: Record<string, unknown>) => {
          inseridos.push(v);
          return { returning: async () => [{ id: "g-novo", ...v }] };
        },
      })),
    };
    const svc = new GruposClienteService(db as never);

    await svc.criar({ nome: "CAGC Corifeu", meta: 164 } as never);

    expect(inseridos).toHaveLength(1);
    expect(inseridos[0].meta).toBe(164);
  });

  it("editar com meta ESCREVE a meta e carimba `atualizadoEm`", async () => {
    let setValores: Record<string, unknown> | undefined;
    const db = {
      query: { gruposCliente: { findFirst: vi.fn().mockResolvedValue({ id: "g1", nome: "CAGC", meta: 100 }) } },
      update: vi.fn((tabela: unknown) => ({
        set: (v: Record<string, unknown>) => {
          setValores = { __tabela: tabela, ...v };
          return { where: () => ({ returning: async () => [{ id: "g1", ...v }] }) };
        },
      })),
    };
    const svc = new GruposClienteService(db as never);

    await svc.atualizar("g1", { meta: 220 });

    expect(setValores?.__tabela).toBe(gruposCliente);
    expect(setValores?.meta).toBe(220);
    expect(setValores?.atualizadoEm).toBeInstanceOf(Date);
  });

  it("editar SEM meta não escreve a coluna meta, mas ainda carimba `atualizadoEm`", async () => {
    let setValores: Record<string, unknown> | undefined;
    const db = {
      query: { gruposCliente: { findFirst: vi.fn().mockResolvedValue({ id: "g1", nome: "CAGC", meta: 100 }) } },
      update: vi.fn(() => ({
        set: (v: Record<string, unknown>) => {
          setValores = v;
          return { where: () => ({ returning: async () => [{ id: "g1", ...v }] }) };
        },
      })),
    };
    const svc = new GruposClienteService(db as never);

    await svc.atualizar("g1", { descricao: "só o texto" });

    expect("meta" in (setValores ?? {})).toBe(false);
    expect(setValores?.atualizadoEm).toBeInstanceOf(Date);
  });

  it("editar grupo inexistente é 404", async () => {
    const db = {
      query: { gruposCliente: { findFirst: vi.fn().mockResolvedValue(undefined) } },
    };
    const svc = new GruposClienteService(db as never);
    await expect(svc.atualizar("nao-existe", { meta: 10 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
