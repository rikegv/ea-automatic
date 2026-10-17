import "reflect-metadata";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../db/client";
import { ClientesService } from "./clientes.service";

/**
 * ─ COBERTURA INDEPENDENTE do `ClientesService.create` reescrito (OST "Clientes", 17/10/2026) ──────
 *
 * Decisão do diretor: "mesmo cliente, 2 contratos". O `cod_cliente` CONTINUA sendo chave única
 * (§A.3): dois contratos do MESMO cliente NÃO duplicam o código, usam `cliente_vinculos` (um vínculo
 * por tipo de serviço). O `create(dto)` ganhou `dto.vinculoOpcaoId` opcional (id de `VINCULO_OPCOES`)
 * e três saídas deliberadas, mais as duas portas de conferência do catálogo.
 *
 * O TESTER NÃO ESCREVEU O CÓDIGO (§A.38): este arquivo prova o REQUISITO, não a suposição do autor.
 * Sufixo `.tester.spec.ts` = dono único (§A.39).
 *
 * COMO SE FINGE O BANCO: `create` usa `db.query.clientes.findFirst` (achar o código), um `db.insert`
 * com `values(...).returning()` (gravar o cliente novo) e um `db.select().from().where()` (a trava
 * "o cliente já tem ESSE tipo de contrato?" no caminho do código existente). `definirVinculo` é
 * ESPIONADO na instância (não se re-mocka o caminho interno dele, que é outra frente): o que importa
 * aqui é SE/COM-QUÊ ele foi chamado e o contrato de retorno do `create`.
 *
 * §A.6: a mensagem de recusa do contrato duplicado NÃO pode conter CNPJ (o rótulo do catálogo leva,
 * a mensagem não). Os valores usados são sintéticos.
 */

/** Um CNPJ qualquer bem formado, só para provar que NÃO vaza na mensagem (§A.6). */
const PADRAO_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;

interface OpcoesFake {
  /** Cliente já cadastrado com esse código (ou null = código novo). */
  existente?: Record<string, unknown> | null;
  /** O select da trava devolve um vínculo do MESMO tipo? (true = cliente já tem o contrato). */
  jaTemVinculo?: boolean;
}

/**
 * Fake mínimo do Drizzle para o `create`. Guarda os `values(...)` que chegam ao insert (para provar
 * que os 6 campos de padrão são gravados) e devolve a linha inserida no `returning()`.
 */
function bancoFake({ existente = null, jaTemVinculo = false }: OpcoesFake = {}) {
  const inseridos: Record<string, unknown>[] = [];
  const findFirst = vi.fn(async () => existente ?? undefined);
  const db = {
    query: {
      clientes: { findFirst },
    },
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        inseridos.push(vals);
        return { returning: vi.fn(async () => [{ ...vals }]) };
      }),
    })),
    // A trava "jaTem" do caminho do código existente: select({id}).from(clienteVinculos).where(and).
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => (jaTemVinculo ? [{ id: "vinc-existente" }] : [])),
      })),
    })),
  };
  return { db, inseridos, findFirst };
}

function servico(opcoes: OpcoesFake = {}) {
  const { db, inseridos, findFirst } = bancoFake(opcoes);
  const service = new ClientesService(db as unknown as Database);
  // Espiona definirVinculo: não exercita o caminho interno (entidadesSoulan/upsert), só registra a
  // chamada. O `tipoServico` do retorno do create vem do `opcao`, não deste espião.
  const definir = vi
    .spyOn(service, "definirVinculo")
    .mockResolvedValue({ ok: true, tipoServico: "TEMPORARIO" } as never);
  return { service, inseridos, findFirst, definir };
}

const BASE = {
  codCliente: "NOVO-1",
  razaoSocial: "Cliente Sintético Ltda",
};

describe("ClientesService.create — mesmo código, dois contratos (OST 17/10/2026)", () => {
  it("(a) código NOVO, sem vinculoOpcaoId: cria o cliente e NÃO chama definirVinculo", async () => {
    const { service, definir } = servico({ existente: null });
    const r = await service.create({ ...BASE } as never);
    expect(r).toMatchObject({ criado: true, contratoAdicionado: false, tipoServico: null });
    expect(definir).not.toHaveBeenCalled();
  });

  it("(b) código NOVO, com vinculoOpcaoId válido: cria o cliente e aplica o vínculo", async () => {
    const { service, definir } = servico({ existente: null });
    // TEMP_F1 -> TEMPORARIO.
    const r = await service.create({ ...BASE, vinculoOpcaoId: "TEMP_F1" } as never);
    expect(r).toMatchObject({ criado: true, contratoAdicionado: false, tipoServico: "TEMPORARIO" });
    expect(definir).toHaveBeenCalledTimes(1);
    expect(definir).toHaveBeenCalledWith("NOVO-1", "TEMP_F1");
  });

  it("(c) código EXISTE, sem vinculoOpcaoId: recusa com ConflictException (duplicata pura)", async () => {
    const { service, definir } = servico({ existente: { codCliente: "CLI-999", razaoSocial: "Já Existe" } });
    await expect(service.create({ codCliente: "CLI-999", razaoSocial: "Já Existe" } as never)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.create({ codCliente: "CLI-999", razaoSocial: "Já Existe" } as never),
    ).rejects.toThrow("cod_cliente já cadastrado");
    expect(definir).not.toHaveBeenCalled();
  });

  it("(d) código EXISTE, contrato de OUTRO tipo: NÃO recusa, adiciona o vínculo", async () => {
    const { service, definir } = servico({
      existente: { codCliente: "CLI-999", razaoSocial: "Cliente Dois" },
      jaTemVinculo: false,
    });
    // TERC_F1 -> TERCEIRO (cliente, neste cenário, ainda não tem TERCEIRO).
    const r = await service.create({ codCliente: "CLI-999", razaoSocial: "Cliente Dois", vinculoOpcaoId: "TERC_F1" } as never);
    expect(r).toMatchObject({ criado: false, contratoAdicionado: true, tipoServico: "TERCEIRO" });
    // O cliente existente é espalhado no retorno (campos preservados).
    expect((r as Record<string, unknown>).razaoSocial).toBe("Cliente Dois");
    expect(definir).toHaveBeenCalledTimes(1);
    expect(definir).toHaveBeenCalledWith("CLI-999", "TERC_F1");
  });

  it("(e) código EXISTE, contrato do MESMO tipo: recusa com mensagem citando código e rótulo, SEM CNPJ (§A.6)", async () => {
    const { service, definir } = servico({
      existente: { codCliente: "CLI-999", razaoSocial: "Cliente Dois" },
      jaTemVinculo: true,
    });
    const chamada = () =>
      service.create({ codCliente: "CLI-999", razaoSocial: "Cliente Dois", vinculoOpcaoId: "TERC_F1" } as never);
    await expect(chamada()).rejects.toThrow(ConflictException);

    // Captura a mensagem para as asserções de conteúdo.
    let msg = "";
    try {
      await chamada();
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe("O cliente CLI-999 já tem o contrato Terceirizado.");
    expect(msg).toContain("CLI-999");
    expect(msg).toContain("Terceirizado");
    // §A.6: nenhum CNPJ na mensagem (o rótulo do catálogo TERC_F1 carrega "59.051.086/0001-24").
    expect(PADRAO_CNPJ.test(msg)).toBe(false);
    expect(msg).not.toContain("59.051.086");
    expect(definir).not.toHaveBeenCalled();
  });

  it("(f) vinculoOpcaoId inválido: BadRequestException, para código NOVO e para código EXISTENTE", async () => {
    // Código novo com id fora do catálogo.
    const novo = servico({ existente: null });
    await expect(novo.service.create({ ...BASE, vinculoOpcaoId: "NAO_EXISTE" } as never)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      novo.service.create({ ...BASE, vinculoOpcaoId: "NAO_EXISTE" } as never),
    ).rejects.toThrow("Opção de vínculo inválida.");
    // A conferência é cedo: nem chega a procurar o código nem a inserir.
    expect(novo.findFirst).not.toHaveBeenCalled();
    expect(novo.definir).not.toHaveBeenCalled();

    // Código existente com id fora do catálogo: mesma recusa 400 (antes de qualquer trava de conflito).
    const existe = servico({ existente: { codCliente: "CLI-999", razaoSocial: "X" }, jaTemVinculo: true });
    await expect(
      existe.service.create({ codCliente: "CLI-999", razaoSocial: "X", vinculoOpcaoId: "NAO_EXISTE" } as never),
    ).rejects.toThrow(BadRequestException);
    expect(existe.definir).not.toHaveBeenCalled();
  });

  it("grava os 6 campos de padrão no insert do create (chegam ao values(...))", async () => {
    const { service, inseridos } = servico({ existente: null });
    const dto = {
      codCliente: "NOVO-2",
      razaoSocial: "Cliente Com Padrões Ltda",
      cnpj: "11.222.333/0001-81",
      nomeOperacao: "Operação Sintética",
      empresaGrupo: "SOULAN ADM",
      regiao: "SP-CAPITAL",
      descricaoRegiao: "São Paulo capital zona leste",
      beneficiosPadrao: "VR, VT",
      escalaPadrao: "12x36",
      enderecoPadrao: "Rua Sintética, 100",
      // vinculoOpcaoId é destruturado FORA do corpo do insert; não pode aparecer nos values.
      vinculoOpcaoId: "TEMP_F1",
    };
    await service.create(dto as never);
    expect(inseridos).toHaveLength(1);
    const vals = inseridos[0]!;
    for (const campo of [
      "empresaGrupo",
      "regiao",
      "descricaoRegiao",
      "beneficiosPadrao",
      "escalaPadrao",
      "enderecoPadrao",
    ] as const) {
      expect(vals[campo]).toBe(dto[campo]);
    }
    // O id do vínculo NÃO é coluna de cliente: não vaza para o insert.
    expect(vals).not.toHaveProperty("vinculoOpcaoId");
  });
});
