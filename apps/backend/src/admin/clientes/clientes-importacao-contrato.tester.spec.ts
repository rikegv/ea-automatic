import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../db/client";
import { ClientesService } from "./clientes.service";
import {
  avaliarImportacao,
  resolverVinculoDaPlanilha,
  type GradeParaImportacao,
  type MapaColunasCliente,
} from "./clientes-importacao";

/**
 * ─ COBERTURA INDEPENDENTE do CONTRATO na importação de clientes (ITEM 3 da OST Clientes) ──────────
 *
 * O TESTER NÃO ESCREVEU O CÓDIGO (§A.38). Este arquivo prova os REQUISITOS do diretor, não a
 * suposição do autor. Sufixo `.tester.spec.ts` = dono único (§A.39).
 *
 * Três alvos, do mais puro ao mais integrado:
 *  1. `resolverVinculoDaPlanilha(contrato, filial)` — a régua pura texto->opção do catálogo.
 *  2. `avaliarImportacao(..., contratosExistentes)` — a régua da planilha com o 5º parâmetro novo.
 *  3. `confirmarImportacao(linhas)` — o roteamento criar vs somar vs recusar (db fingido + spy no create).
 *
 * §A.6: nenhuma mensagem de recusa pode conter CNPJ. §A.11: nenhum rótulo/motivo com travessão.
 * §A.24: rótulo de contrato em title case. Valores sintéticos.
 */

/** Um CNPJ bem formado só aparece aqui para PROVAR que NÃO vaza nas mensagens (§A.6). */
const PADRAO_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
/** Travessão em dash (U+2014), proibido em texto apresentável (§A.11). */
const EM_DASH = "—";

describe("resolverVinculoDaPlanilha: texto da planilha -> opção do catálogo (régua pura)", () => {
  it("contrato VAZIO (e só espaço) é VÁLIDO e sem vínculo: {opcaoId:null, rotulo:null, erro:null}", () => {
    expect(resolverVinculoDaPlanilha("", "")).toEqual({ opcaoId: null, rotulo: null, erro: null });
    expect(resolverVinculoDaPlanilha("   ", "9")).toEqual({ opcaoId: null, rotulo: null, erro: null });
  });

  it("Temporário com filial que existe no catálogo resolve TEMP_F{filial}", () => {
    const r = resolverVinculoDaPlanilha("Temporário", "1");
    expect(r.opcaoId).toBe("TEMP_F1");
    expect(r.erro).toBeNull();
    expect(r.rotulo).toBe("Temporário, filial 1");
  });

  it("Terceiro/terceirizado/terc resolvem TERCEIRO, com filial existente (TERC_F4)", () => {
    expect(resolverVinculoDaPlanilha("Terceiro", "4").opcaoId).toBe("TERC_F4");
    expect(resolverVinculoDaPlanilha("Terceirizado", "4").opcaoId).toBe("TERC_F4");
    // "terc" exato também é terceiro (atalho que o time escreve).
    expect(resolverVinculoDaPlanilha("terc", "4").opcaoId).toBe("TERC_F4");
    expect(resolverVinculoDaPlanilha("Terceiro", "4").rotulo).toBe("Terceirizado, filial 4");
  });

  it("Temporário/Terceiro SEM filial => erro 'Informe a filial do contrato ...'", () => {
    expect(resolverVinculoDaPlanilha("Temporário", "")).toEqual({
      opcaoId: null,
      rotulo: null,
      erro: "Informe a filial do contrato Temporário",
    });
    expect(resolverVinculoDaPlanilha("Terceiro", "   ").erro).toBe(
      "Informe a filial do contrato Terceirizado",
    );
  });

  it("Temporário/Terceiro com filial que NÃO existe no catálogo => 'Filial inválida para o contrato ...'", () => {
    // TERC_F9 não existe (só F1, F2, F4).
    expect(resolverVinculoDaPlanilha("Terceiro", "9")).toEqual({
      opcaoId: null,
      rotulo: null,
      erro: "Filial inválida para o contrato Terceirizado",
    });
    // TEMP_F3 não existe (só F1, F2, F4, F5, F7).
    expect(resolverVinculoDaPlanilha("Temporário", "3").erro).toBe(
      "Filial inválida para o contrato Temporário",
    );
  });

  it("Estágio resolve ESTAGIO, e a filial é IGNORADA (CNPJ fixo)", () => {
    const semFilial = resolverVinculoDaPlanilha("Estágio", "");
    expect(semFilial.opcaoId).toBe("ESTAGIO");
    expect(semFilial.erro).toBeNull();
    expect(semFilial.rotulo).toBe("Estágio");
    // Filial preenchida não muda nada nem vira erro.
    expect(resolverVinculoDaPlanilha("estagio", "99").opcaoId).toBe("ESTAGIO");
  });

  it("Interno resolve INTERNO_ADM por padrão, e INTERNO_NEAT quando o texto diz 'neat'", () => {
    const adm = resolverVinculoDaPlanilha("Interno", "");
    expect(adm.opcaoId).toBe("INTERNO_ADM");
    expect(adm.rotulo).toBe("Interno (ADM)");
    const neat = resolverVinculoDaPlanilha("Interno NEAT", "");
    expect(neat.opcaoId).toBe("INTERNO_NEAT");
    expect(neat.rotulo).toBe("Interno (NEAT)");
  });

  it("Fopag resolve FOPAG (filial ignorada)", () => {
    const r = resolverVinculoDaPlanilha("FOPAG", "");
    expect(r.opcaoId).toBe("FOPAG");
    expect(r.erro).toBeNull();
    expect(r.rotulo).toBe("Fopag");
  });

  it("texto DESCONHECIDO => erro 'Contrato inválido'", () => {
    expect(resolverVinculoDaPlanilha("CLT", "").erro).toBe("Contrato inválido");
    expect(resolverVinculoDaPlanilha("xyz", "1").erro).toBe("Contrato inválido");
  });

  it("§A.6/§A.11: nenhum rótulo nem motivo carrega CNPJ ou travessão", () => {
    const amostras = [
      resolverVinculoDaPlanilha("Temporário", "1"),
      resolverVinculoDaPlanilha("Terceiro", "4"),
      resolverVinculoDaPlanilha("Estágio", ""),
      resolverVinculoDaPlanilha("Interno NEAT", ""),
      resolverVinculoDaPlanilha("Fopag", ""),
      resolverVinculoDaPlanilha("Terceiro", "9"),
      resolverVinculoDaPlanilha("Temporário", ""),
      resolverVinculoDaPlanilha("CLT", ""),
    ];
    for (const a of amostras) {
      const texto = `${a.rotulo ?? ""} ${a.erro ?? ""}`;
      expect(PADRAO_CNPJ.test(texto)).toBe(false);
      expect(texto).not.toContain(EM_DASH);
    }
  });
});

// ── avaliarImportacao com o 5º parâmetro (contratosExistentes) ────────────────

/** Grade de 6 colunas: codigo, cnpj, razao, operacao, contrato, filial. */
const MAPA_CONTRATO: MapaColunasCliente = {
  colCodigo: 0,
  colCnpj: 1,
  colRazao: 2,
  colOperacao: 3,
  colContrato: 4,
  colFilial: 5,
};

function grade(linhas: string[][]): GradeParaImportacao {
  return { cabecalho: ["codigo", "cnpj", "razao", "operacao", "contrato", "filial"], linhas };
}

/** Linha completa sem contrato: [cod, cnpj, razao, op, contrato, filial]. */
function linha(cod: string, contrato = "", filial = ""): string[] {
  return [cod, "", `${cod} Ltda`, "", contrato, filial];
}

describe("avaliarImportacao: contrato válido entra com vínculo preenchido", () => {
  it("contrato válido => aEntrar com vinculoOpcaoId e contratoRotulo; texto cru preservado", () => {
    const r = avaliarImportacao(grade([linha("C1", "Temporário", "1")]), MAPA_CONTRATO, new Set());
    expect(r.aEntrar).toHaveLength(1);
    expect(r.recusadas).toHaveLength(0);
    expect(r.aEntrar[0]).toMatchObject({
      codCliente: "C1",
      contrato: "Temporário",
      filial: "1",
      vinculoOpcaoId: "TEMP_F1",
      contratoRotulo: "Temporário, filial 1",
    });
  });

  it("sem contrato => entra com vinculoOpcaoId e contratoRotulo nulos (comportamento antigo)", () => {
    const r = avaliarImportacao(grade([linha("C1")]), MAPA_CONTRATO, new Set());
    expect(r.aEntrar[0]).toMatchObject({ vinculoOpcaoId: null, contratoRotulo: null, contrato: null, filial: null });
  });
});

describe("avaliarImportacao: contrato inválido / filial => recusa com o motivo certo", () => {
  it("contrato desconhecido => 'Contrato inválido'", () => {
    const r = avaliarImportacao(grade([linha("C1", "CLT", "")]), MAPA_CONTRATO, new Set());
    expect(r.aEntrar).toHaveLength(0);
    expect(r.recusadas[0]).toMatchObject({ codCliente: "C1", motivo: "Contrato inválido" });
  });

  it("Temporário sem filial => 'Informe a filial do contrato Temporário'", () => {
    const r = avaliarImportacao(grade([linha("C1", "Temporário", "")]), MAPA_CONTRATO, new Set());
    expect(r.recusadas[0]?.motivo).toBe("Informe a filial do contrato Temporário");
  });

  it("Terceiro com filial inexistente => 'Filial inválida para o contrato Terceirizado'", () => {
    const r = avaliarImportacao(grade([linha("C1", "Terceiro", "9")]), MAPA_CONTRATO, new Set());
    expect(r.recusadas[0]?.motivo).toBe("Filial inválida para o contrato Terceirizado");
  });
});

describe("avaliarImportacao: código já existente cruzado com contrato", () => {
  it("existente SEM contrato => 'Código já cadastrado' (e entra em jaCadastrados)", () => {
    const r = avaliarImportacao(grade([linha("JA")]), MAPA_CONTRATO, new Set(["JA"]));
    expect(r.aEntrar).toHaveLength(0);
    expect(r.recusadas[0]).toMatchObject({ codCliente: "JA", motivo: "Código já cadastrado" });
    expect(r.jaCadastrados).toContain("JA");
  });

  it("existente COM contrato de tipo que o cliente NÃO tem => ENTRA (vai somar)", () => {
    const contratos = new Map<string, Set<string>>([["JA", new Set(["TERCEIRO"])]]);
    const r = avaliarImportacao(
      grade([linha("JA", "Temporário", "1")]),
      MAPA_CONTRATO,
      new Set(["JA"]),
      undefined,
      contratos,
    );
    expect(r.recusadas).toHaveLength(0);
    expect(r.aEntrar).toHaveLength(1);
    expect(r.aEntrar[0]).toMatchObject({ codCliente: "JA", vinculoOpcaoId: "TEMP_F1" });
    // NÃO entra em jaCadastrados: não foi recusado por já existir.
    expect(r.jaCadastrados).not.toContain("JA");
  });

  it("existente COM contrato de tipo que o cliente JÁ tem => recusa 'Cliente já tem o contrato <rótulo>' (§A.6 sem CNPJ)", () => {
    const contratos = new Map<string, Set<string>>([["JA", new Set(["TEMPORARIO"])]]);
    const r = avaliarImportacao(
      grade([linha("JA", "Temporário", "1")]),
      MAPA_CONTRATO,
      new Set(["JA"]),
      undefined,
      contratos,
    );
    expect(r.aEntrar).toHaveLength(0);
    const motivo = r.recusadas[0]?.motivo ?? "";
    expect(motivo).toBe("Cliente já tem o contrato Temporário, filial 1");
    expect(PADRAO_CNPJ.test(motivo)).toBe(false);
    expect(motivo).not.toContain(EM_DASH);
  });
});

describe("avaliarImportacao: dedup na planilha por CÓDIGO + TIPO", () => {
  it("mesmo código 2x com contratos DIFERENTES => AMBAS entram", () => {
    const r = avaliarImportacao(
      grade([
        linha("C1", "Temporário", "1"),
        linha("C1", "Terceiro", "4"),
      ]),
      MAPA_CONTRATO,
      new Set(),
    );
    expect(r.recusadas).toHaveLength(0);
    expect(r.aEntrar.map((l) => l.vinculoOpcaoId)).toEqual(["TEMP_F1", "TERC_F4"]);
  });

  it("mesmo código + MESMO tipo 2x => 2ª recusa 'Código e contrato repetidos na planilha'", () => {
    const r = avaliarImportacao(
      grade([
        linha("C1", "Temporário", "1"),
        linha("C1", "temporario", "1"),
      ]),
      MAPA_CONTRATO,
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(1);
    expect(r.recusadas[0]).toMatchObject({
      codCliente: "C1",
      motivo: "Código e contrato repetidos na planilha",
    });
  });

  it("mesmo código 2x SEM contrato => 2ª recusa 'Código repetido na planilha'", () => {
    const r = avaliarImportacao(
      grade([linha("C1"), linha("C1")]),
      MAPA_CONTRATO,
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(1);
    expect(r.recusadas[0]?.motivo).toBe("Código repetido na planilha");
  });
});

// ── confirmarImportacao: roteamento criar vs somar vs recusar ─────────────────

/**
 * Fake mínimo do Drizzle que confirmarImportacao precisa ANTES de chamar create: `codigosExistentes`
 * (select({cod}).from(clientes)) e `contratosExistentes` (select({cod,tipo}).from(clienteVinculos)),
 * ambos awaited direto no from(). Aqui os dois devolvem vazio: nenhum código/contrato preexistente,
 * então a avaliação deixa as linhas válidas passarem para o create, que é ESPIONADO.
 */
function servicoParaConfirmar() {
  const db = {
    select: vi.fn(() => ({ from: vi.fn(async () => [] as unknown[]) })),
  };
  const service = new ClientesService(db as unknown as Database);
  return service;
}

describe("confirmarImportacao: conta entraram, contratosSomados e recusadas", () => {
  it("roteia cada linha: cria, soma, recusa por régua e recusa por conflito do create", async () => {
    const service = servicoParaConfirmar();
    // create é a unidade testada à parte (clientes-create-contrato.tester.spec): aqui só se prova
    // que confirmarImportacao o chama e CONTA o retorno. O comportamento varia por código.
    const create = vi.spyOn(service, "create").mockImplementation(async (dto) => {
      if (dto.codCliente === "NEW1") {
        return { criado: true, contratoAdicionado: false, tipoServico: null } as never;
      }
      if (dto.codCliente === "SUM1") {
        return { criado: false, contratoAdicionado: true, tipoServico: "TERCEIRO" } as never;
      }
      // ERR1: o create recusa (ex.: corrida de PK / já tem o contrato).
      throw new ConflictException("O cliente ERR1 já tem o contrato Temporário.");
    });

    const { relatorio } = await service.confirmarImportacao([
      { codCliente: "NEW1", razaoSocial: "Novo Ltda", linha: 2 },
      { codCliente: "SUM1", razaoSocial: "Soma Ltda", contrato: "Terceiro", filial: "4", linha: 3 },
      // Régua pura recusa ANTES de chegar no create (contrato inválido).
      { codCliente: "BAD1", razaoSocial: "Ruim Ltda", contrato: "CLT", linha: 4 },
      { codCliente: "ERR1", razaoSocial: "Erro Ltda", contrato: "Temporário", filial: "1", linha: 5 },
    ] as never);

    expect(relatorio.entraram).toBe(1);
    expect(relatorio.contratosSomados).toBe(1);
    // BAD1 (régua) + ERR1 (conflito do create).
    const motivos = relatorio.recusadas.map((x) => x.motivo);
    expect(relatorio.recusadas).toHaveLength(2);
    expect(motivos).toContain("Contrato inválido");
    expect(motivos).toContain("O cliente ERR1 já tem o contrato Temporário.");
    // BAD1 nunca chega ao create; NEW1, SUM1 e ERR1 sim (3 chamadas).
    expect(create).toHaveBeenCalledTimes(3);
    // §A.6: nenhum motivo de recusa vaza CNPJ.
    for (const m of motivos) expect(PADRAO_CNPJ.test(m)).toBe(false);
  });

  it("linha de contrato inválido entra em recusadas e NÃO chama o create para ela", async () => {
    const service = servicoParaConfirmar();
    const create = vi.spyOn(service, "create").mockResolvedValue({
      criado: true,
      contratoAdicionado: false,
      tipoServico: null,
    } as never);

    const { relatorio } = await service.confirmarImportacao([
      { codCliente: "C1", razaoSocial: "Ok Ltda", linha: 2 },
      { codCliente: "C2", razaoSocial: "Faltou Filial Ltda", contrato: "Temporário", linha: 3 },
    ] as never);

    expect(relatorio.entraram).toBe(1);
    expect(relatorio.recusadas.map((x) => x.motivo)).toContain(
      "Informe a filial do contrato Temporário",
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
