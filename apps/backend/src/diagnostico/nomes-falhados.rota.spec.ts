import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import type { MenusService } from "../auth/menus.service";
import { PandapeNomeCacheService } from "../pandape/pandape-nome-cache.service";
import { DiagnosticoController } from "./diagnostico.controller";
import { NomesDosFalhadosDto } from "./diagnostico.dto";
import { FilasDiagnosticoService } from "./filas.service";
import { NomesFalhadosService } from "./nomes-falhados.service";

/**
 * A ROTA DO LOTE DE NOMES (OST 30/09/2026): RBAC, o corpo que ela aceita, e o que ela NÃO aceita.
 *
 * O que estes casos seguram, e nenhum teste de service alcança:
 *  · RBAC vem da CLASSE, e o handler NÃO pode ter `@Roles` próprio: decorador de handler SOBRESCREVE
 *    o da classe (`reflector.getAllAndOverride`), então anotar por cima é como se afrouxa a porta sem
 *    parecer que se está afrouxando nada. O COMUM tem de levar 403 pelo guard REAL.
 *  · o id externo do pré-colaborador NÃO vem do cliente: quem traduz job → candidato é o servidor,
 *    lendo o `job.data`. Aceitar o id do corpo seria um oráculo de enumeração do ATS.
 *  · o teto do corpo, que impede um pedido de 5.000 jobs virar 5.000 requisições ao Pandapé.
 */

const POST = 1; // RequestMethod.POST
const ROTA = "filas/nomes";

function handlerDoLote(): { nome: string; fn: (...a: never[]) => unknown } {
  const proto = DiagnosticoController.prototype as unknown as Record<string, unknown>;
  const nome = Object.getOwnPropertyNames(proto).find((k) => {
    const fn = proto[k];
    return (
      typeof fn === "function" &&
      Reflect.getMetadata("path", fn) === ROTA &&
      Reflect.getMetadata("method", fn) === POST
    );
  });
  if (!nome) throw new Error(`Rota POST ${ROTA} não existe.`);
  return { nome, fn: proto[nome] as (...a: never[]) => unknown };
}

/** Fila falsa: o `jobId` é DESACOPLADO do id externo, senão o teste do oráculo passaria por acidente. */
function filaComFalhados(ids: string[]) {
  const jobs = ids.map((id, i) => ({
    id: `j${i + 1}`,
    name: "sync-candidate",
    data: { idPrecollaborator: id },
    failedReason: "CPF ausente no Pandapé",
    attemptsMade: 5,
    finishedOn: Date.now() - (i + 1) * 60_000,
  }));
  return {
    getJobCounts: vi.fn(async () => ({ active: 0, waiting: 0, failed: jobs.length, delayed: 0 })),
    getFailed: vi.fn(async (inicio = 0, fim = -1) =>
      jobs.slice(inicio, fim < 0 ? undefined : fim + 1),
    ),
  };
}

function montar(ids: string[]) {
  const fila = filaComFalhados(ids);
  const filas = new FilasDiagnosticoService(
    { filaBull: () => fila } as never,
    { filaBull: () => undefined } as never,
    { filaBull: () => undefined } as never,
  );
  const getPrecollaborator = vi.fn(async (id: string) => ({
    idPreCollaborator: id,
    // O NOME NÃO CARREGA O ID de propósito: nome que contivesse o id externo faria o teste de §A.6
    // ("o id não volta na resposta") falhar por artefato da fixture, não por defeito do código.
    name: "Candidato",
    surname: "Da Fila",
    // A ARMADILHA da §A.6: o tipo declara `cpf?`, então a fixture o carrega. Um spread o vazaria.
    cpf: "00000000191",
    vacancyJob: "Auxiliar de Limpeza",
  }));
  const getMatch = vi.fn(async () => ({ cpf: "00000000191" }));
  const nomes = new NomesFalhadosService(
    { getPrecollaborator, getMatch } as never,
    new PandapeNomeCacheService(),
  );
  const ctx = Object.create(DiagnosticoController.prototype) as Record<string, unknown>;
  ctx.filas = filas;
  ctx.nomesFalhados = nomes;
  ctx.logger = { log: vi.fn(), warn: vi.fn() };
  const { fn } = handlerDoLote();
  const chamar = (corpo: unknown) =>
    fn.call(ctx as never, corpo as never, { id: "u-1", papel: "MASTER" } as never) as Promise<{
      nomes: { jobId: string; nome: string }[];
      restantes: number;
    }>;
  return { chamar, getPrecollaborator, getMatch };
}

describe("POST /diagnostico/filas/nomes: RBAC", () => {
  it("o handler NÃO tem @Roles próprio: o RBAC é o da CLASSE, e não se sobrescreve", () => {
    const { nome, fn } = handlerDoLote();
    expect(Reflect.getMetadata(ROLES_KEY, fn), `${nome} não pode ter @Roles próprio`).toBeUndefined();
    expect(new Set(Reflect.getMetadata(ROLES_KEY, DiagnosticoController) as string[])).toEqual(
      new Set(["MASTER", "SUPER_ADMIN"]),
    );
  });

  it("o COMUM leva 403 no guard REAL, com o metadado REAL da rota", async () => {
    const guard = new RolesGuard(
      new Reflector(),
      { areasDoUsuario: async () => new Set(["ADM"]) } as unknown as MenusService,
      { areasDaOperacao: async () => ["ADM"] } as unknown as MenuAreasService,
    );
    const { fn } = handlerDoLote();
    const contexto = {
      getHandler: () => fn,
      getClass: () => DiagnosticoController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: "u-9", papel: "COMUM" } }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(contexto)).rejects.toThrow(ForbiddenException);
  });
});

describe("POST /diagnostico/filas/nomes: o corpo", () => {
  it("traduz jobId → candidato NO SERVIDOR e devolve só o par + restantes", async () => {
    const { chamar } = montar(["406998", "421114"]);
    const r = await chamar({ jobIds: ["j1", "j2"] });

    expect(r.restantes).toBe(0);
    expect(r.nomes.map((n) => n.jobId).sort()).toEqual(["j1", "j2"]);
    for (const n of r.nomes) expect(Object.keys(n).sort()).toEqual(["jobId", "nome"]);
  });

  it("O ORÁCULO: id externo no corpo é IGNORADO, e o id do corpo NUNCA é consultado", async () => {
    const { chamar, getPrecollaborator } = montar(["406998"]);
    await chamar({ jobIds: ["j1"], idPrecollaborator: "999999", ids: ["999999"] });

    expect(getPrecollaborator.mock.calls.map((c) => c[0])).toEqual(["406998"]);
  });

  it("jobId que não está na fila de falhados não vira chamada nem linha", async () => {
    const { chamar, getPrecollaborator } = montar(["406998"]);
    const r = await chamar({ jobIds: ["j1", "nao-existe"] });

    expect(r.nomes).toHaveLength(1);
    expect(getPrecollaborator.mock.calls.map((c) => c[0])).toEqual(["406998"]);
  });

  it("§A.6: nem CPF, nem vaga, nem id externo saem na resposta, e o getMatch não é chamado", async () => {
    const { chamar, getMatch } = montar(["406998"]);
    const bruto = JSON.stringify(await chamar({ jobIds: ["j1"] }));

    expect(getMatch).not.toHaveBeenCalled();
    expect(bruto).not.toContain("00000000191");
    expect(bruto).not.toMatch(/\d{11}/);
    expect(bruto.toLowerCase()).not.toContain("cpf");
    expect(bruto).not.toContain("Auxiliar de Limpeza");
    expect(bruto).not.toContain("406998");
  });
});

describe("NomesDosFalhadosDto: o teto do corpo", () => {
  const erros = async (corpo: unknown) =>
    (await validate(plainToInstance(NomesDosFalhadosDto, corpo))).flatMap((e) =>
      Object.keys(e.constraints ?? {}),
    );

  it("aceita a lista até o teto da lista da fila", async () => {
    const jobIds = Array.from({ length: FilasDiagnosticoService.LIMITE_LISTA }, (_, i) => `j${i}`);
    expect(await erros({ jobIds })).toEqual([]);
  });

  it("RECUSA acima do teto: pedido de 5.000 jobs não vira 5.000 requisições ao Pandapé", async () => {
    const jobIds = Array.from({ length: FilasDiagnosticoService.LIMITE_LISTA + 1 }, (_, i) => `j${i}`);
    expect(await erros({ jobIds })).toContain("arrayMaxSize");
  });

  it("RECUSA corpo sem lista, lista vazia e item que não é texto", async () => {
    expect(await erros({})).not.toEqual([]);
    expect(await erros({ jobIds: [] })).toContain("arrayNotEmpty");
    expect(await erros({ jobIds: [1, 2] })).toContain("isString");
    expect(await erros({ jobIds: [""] })).toContain("isNotEmpty");
  });
});
