import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AsVagaEdicaoNegada } from "@ea/shared-types";
import {
  asCandidaturaEntrevistas,
  asCandidaturas,
  asShortlists,
  usuarios,
  vagaBeneficio,
  vagaClienteCorrecoes,
  vagaConsultorTransferencias,
  vagaEdicoes,
  vagaExclusoes,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import type { EditarVagaDto } from "./vagas.dto";
import { VagasEdicaoService } from "./vagas-edicao.service";
import { VagasService } from "./vagas.service";

/**
 * O SERVIÇO DA EDIÇÃO E DA EXCLUSÃO DA VAGA JÁ LIBERADA, contra um banco fingido (backend, autor).
 *
 * O fingido conhece as tabelas que o serviço toca e responde por TABELA e pelo SQL da cláusula
 * (renderizado pelo dialeto de verdade), registrando cada escrita e se ela saiu da transação. Os
 * resolvedores de catálogo do `VagasService` que vão ao banco são dublados; `camposDaTrilha`, a
 * régua dos obrigatórios, a do excesso e a da redução de meta são as DE VERDADE.
 *
 * §A.6: o CPF usado é sintético, de dígito válido, e o teste confere que ele nunca chega à trilha.
 */

const VAGA = "11111111-1111-1111-1111-111111111111";
const AUTOR = "22222222-2222-2222-2222-222222222222";
const CONSULTOR_A = "33333333-3333-3333-3333-333333333333";
const CONSULTOR_B = "44444444-4444-4444-4444-444444444444";
const RECRUITER_A = "55555555-5555-5555-5555-555555555555";
const RECRUITER_B = "66666666-6666-6666-6666-666666666666";
const CARGO = "77777777-7777-7777-7777-777777777777";
const CPF_SINTETICO = "52998224725";

const dialeto = new PgDialect();
const sqlDe = (cond: unknown): string =>
  cond ? dialeto.sqlToQuery(cond as SQL).sql : "";

interface Escrita {
  tipo: "insert" | "update" | "delete";
  tabela: string;
  valores: unknown;
  naTransacao: boolean;
}

interface Cenario {
  status?: string;
  vaga?: Record<string, unknown>;
  enviados?: number;
  candidaturas?: { situacao: string; posicaoLado: string | null }[];
  entrevistas?: string[];
  shortlists?: number;
  usuarios?: Record<string, { ativo: boolean; papelAs: string | null }>;
  beneficios?: { beneficioId: string; valor: string | null }[];
}

function vagaBase(c: Cenario): Record<string, unknown> {
  return {
    id: VAGA,
    codigo: "PS-100",
    cargoId: CARGO,
    nomeDivulgacao: "Operador De Caixa",
    codCliente: "C001",
    idVacancyPandape: "9001",
    natureza: "OPERACIONAL",
    vinculo: "TEMPORARIO",
    status: c.status ?? "ABERTA",
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: 1,
    segmentoId: null,
    comercialId: null,
    cidadeId: null,
    posicoesOficiais: 5,
    posicoesBanco: 0,
    escolaridade: null,
    salarioAbertura: "1500.00",
    salarioFechamento: null,
    dataAbertura: "2026-09-01",
    dataLimite: "2026-10-30",
    abertoPorId: AUTOR,
    centroCusto: null,
    solicitanteNome: null,
    solicitanteTelefone: null,
    solicitanteEmail: null,
    dataSolicitacao: null,
    dataAlinhamento: null,
    dataRealinhamento: null,
    envioShortlist: null,
    consultorId: CONSULTOR_A,
    recruiterId: RECRUITER_A,
    tempoContrato: null,
    motivo: "Substituição",
    justificativaMotivo: null,
    tipoSubstituicao: null,
    substituidoNome: "Pessoa Sintetica",
    substituidoCpf: CPF_SINTETICO,
    localTrabalho: null,
    regiaoEstado: null,
    regioes: null,
    regioesOutras: null,
    horarioEscala: null,
    modeloTrabalho: null,
    detalheHibrido: null,
    confidencial: false,
    divulgarEmpresa: true,
    faixaEtaria: null,
    genero: "INDIFERENTE",
    idiomas: null,
    idiomasExigidos: null,
    idiomasOutros: null,
    cursosConhecimentos: null,
    testes: null,
    testesOutro: null,
    experiencia: null,
    atribuicoes: null,
    perfilComportamental: null,
    ambiente: null,
    etapasPs: null,
    etapasPsOutra: null,
    observacoes: null,
    encerradaEm: null,
    dataFechamento: null,
    criadoEm: new Date("2026-09-01T12:00:00Z"),
    atualizadoEm: new Date("2026-09-01T12:00:00Z"),
    ...c.vaga,
  };
}

function montar(c: Cenario = {}) {
  const vaga: Record<string, unknown> | null = vagaBase(c);
  let existe = true;
  const escritas: Escrita[] = [];
  const travas: string[] = [];
  const pessoas = c.usuarios ?? {
    [CONSULTOR_B]: { ativo: true, papelAs: "CONSULTOR" },
    [RECRUITER_B]: { ativo: true, papelAs: "RECRUITER" },
  };
  const candidaturas = c.candidaturas ?? [];

  const leitura = (dentro: boolean) => (campos?: Record<string, unknown>) => {
    let tabela = "";
    let cond: unknown = null;
    const chaves = Object.keys(campos ?? {});
    const resolver = (): Promise<unknown[]> => {
      const texto = sqlDe(cond);
      if (tabela === getTableName(vagas)) return Promise.resolve(existe ? [{ ...vaga }] : []);
      if (tabela === getTableName(vagaBeneficio)) return Promise.resolve(c.beneficios ?? []);
      if (tabela === getTableName(asCandidaturas)) {
        if (chaves.includes("n")) {
          const n = texto.includes("admissao_id") ? (c.enviados ?? 0) : candidaturas.length;
          return Promise.resolve([{ n }]);
        }
        if (chaves.includes("quantas")) {
          return Promise.resolve(candidaturas.map((x) => ({ ...x, quantas: 1 })));
        }
      }
      if (tabela === getTableName(asCandidaturaEntrevistas)) {
        return Promise.resolve((c.entrevistas ?? []).map((id) => ({ id })));
      }
      if (tabela === getTableName(asShortlists)) return Promise.resolve([{ n: c.shortlists ?? 0 }]);
      if (tabela === getTableName(usuarios)) {
        const id = Object.keys(pessoas).find((p) => texto && JSON.stringify(dialeto.sqlToQuery(cond as SQL).params).includes(p));
        return Promise.resolve(id ? [{ id, ...pessoas[id] }] : []);
      }
      return Promise.resolve([]);
    };
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = getTableName(t as never);
      return b;
    };
    b.where = (x: unknown) => {
      cond = x;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.groupBy = () => resolver();
    b.orderBy = () => b;
    b.limit = () => resolver();
    b.for = () => {
      travas.push(`${dentro ? "tx" : "db"}:${tabela}`);
      return resolver();
    };
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko);
    return b;
  };

  const montarExec = (dentro: boolean) => ({
    select: leitura(dentro),
    update: (t: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: async () => {
          escritas.push({ tipo: "update", tabela: getTableName(t as never), valores, naTransacao: dentro });
          if (getTableName(t as never) === getTableName(vagas)) Object.assign(vaga!, valores);
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: async (valores: unknown) => {
        escritas.push({ tipo: "insert", tabela: getTableName(t as never), valores, naTransacao: dentro });
      },
    }),
    delete: (t: unknown) => {
      const registrar = () => {
        escritas.push({ tipo: "delete", tabela: getTableName(t as never), valores: null, naTransacao: dentro });
        if (getTableName(t as never) === getTableName(vagas)) existe = false;
      };
      return {
        where: () => {
          const p = {
            returning: async () => {
              registrar();
              return (c.entrevistas ?? []).map((id) => ({ id }));
            },
            then: (ok: (v: unknown) => unknown) => {
              registrar();
              return Promise.resolve(undefined).then(ok);
            },
          };
          return p;
        },
      };
    },
  });

  const tx = montarExec(true);
  const db = { ...montarExec(false), transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };

  const etapas = catalogoDeEtapasFingido();
  const status = catalogoDeStatusFingido();
  const vagasService = new VagasService(db as never, etapas as never, status as never);
  const exigirCliente = vi.spyOn(vagasService, "exigirClienteExistente").mockResolvedValue(undefined);
  const destinoConsultor = vi
    .spyOn(vagasService, "consultorDeDestino")
    .mockImplementation(async (id: string) => {
      const p = pessoas[id];
      if (!p) throw new NotFoundException("Consultor de destino não encontrado.");
      if (!p.ativo || p.papelAs !== "CONSULTOR") throw new ConflictException("recusado");
      return { id, nome: "Pessoa" };
    });
  vi.spyOn(vagasService, "resolverCidade").mockResolvedValue(null);
  vi.spyOn(vagasService, "resolverLinhaServico").mockImplementation(async (id) => id ?? null);
  vi.spyOn(vagasService, "validaBeneficios").mockImplementation(async (itens) =>
    itens.map((i) => ({ beneficioId: i.beneficioId, valor: i.valor ?? null })),
  );

  const service = new VagasEdicaoService(db as never, vagasService, etapas as never, status as never);
  return { service, vaga, escritas, travas, exigirCliente, destinoConsultor };
}

const doTipo = (escritas: Escrita[], tabela: string, tipo?: Escrita["tipo"]) =>
  escritas.filter((e) => e.tabela === tabela && (!tipo || e.tipo === tipo));
const trilha = (escritas: Escrita[]) =>
  doTipo(escritas, getTableName(vagaEdicoes)).flatMap((e) => e.valores as Record<string, unknown>[]);

async function negada(p: Promise<unknown>): Promise<AsVagaEdicaoNegada> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ConflictException);
    return (e as ConflictException).getResponse() as AsVagaEdicaoNegada;
  }
  throw new Error("esperava 409");
}

const editar = (s: VagasEdicaoService, dto: Partial<EditarVagaDto>) =>
  s.editar(VAGA, dto as EditarVagaDto, AUTOR);

describe("editar: só vaga em processo, conferida sob a trava", () => {
  it("trava a linha da vaga dentro da transação", async () => {
    const { service, travas } = montar();
    await editar(service, { observacoes: "nova" });
    expect(travas).toEqual(["tx:vagas"]);
  });

  for (const status of ["FECHADA", "CANCELADA", "RASCUNHO", "PENDENTE_REVISAO"]) {
    it(`${status} é recusada com VAGA_NAO_EDITAVEL, sem escrita`, async () => {
      const { service, escritas } = montar({ status });
      const r = await negada(editar(service, { observacoes: "x" }));
      expect(r.codigo).toBe("VAGA_NAO_EDITAVEL");
      expect(escritas).toEqual([]);
    });
  }

  it("ENTREGUE (papel ENTREGA) edita", async () => {
    const { service } = montar({ status: "ENTREGUE" });
    await expect(editar(service, { observacoes: "x" })).resolves.toMatchObject({ camposAlterados: 1 });
  });
});

describe("editar: o formulário inteiro, sem mudança, não grava nada", () => {
  it("zero campos alterados é sucesso sem escrita", async () => {
    const { service, escritas, vaga } = montar();
    const corpo = { ...vaga, salarioAbertura: "1500", consultorId: CONSULTOR_A } as Record<string, unknown>;
    for (const k of ["id", "salarioFechamento", "abertoPorId", "centroCusto", "idiomas", "encerradaEm", "dataFechamento", "criadoEm", "atualizadoEm"]) delete corpo[k];
    const r = await editar(service, corpo as Partial<EditarVagaDto>);
    expect(r).toEqual({ vagaId: VAGA, camposAlterados: 0, entrevistasRemovidas: 0 });
    expect(escritas).toEqual([]);
  });

  it("campo ausente não apaga o gravado (diferente do `atualizar`)", async () => {
    const { service, escritas } = montar();
    await editar(service, { observacoes: "só isto" });
    const update = doTipo(escritas, getTableName(vagas), "update")[0]!.valores as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(["atualizadoEm", "observacoes"]);
  });

  it("nunca escreve status, código, número do Pandapé nem data_limite_anterior", async () => {
    const { service, escritas } = montar();
    await editar(service, { dataLimite: "2026-12-01", codigo: "ps-100", status: "ABERTA" });
    const update = doTipo(escritas, getTableName(vagas), "update")[0]!.valores as Record<string, unknown>;
    for (const proibido of ["status", "codigo", "idVacancyPandape", "dataLimiteAnterior", "statusManualEm"]) {
      expect(update).not.toHaveProperty(proibido);
    }
    expect(update.dataLimite).toBe("2026-12-01");
  });
});

describe("editar: campos que nunca se editam", () => {
  it("código ou status diferente do atual é CAMPO_NUNCA_EDITAVEL", async () => {
    const { service, escritas } = montar();
    const r = await negada(editar(service, { codigo: "PS-200", status: "ENTREGUE" }));
    expect(r.codigo).toBe("CAMPO_NUNCA_EDITAVEL");
    expect(r.campos).toEqual(expect.arrayContaining(["codigo", "status"]));
    expect(escritas).toEqual([]);
  });

  it("contraparte igual a um dos lados atuais é ignorada; outra pessoa é recusada", async () => {
    const ok = montar();
    await expect(editar(ok.service, { contraparteId: RECRUITER_A, observacoes: "x" })).resolves.toBeDefined();
    const ko = montar();
    const r = await negada(editar(ko.service, { contraparteId: RECRUITER_B }));
    expect(r.campos).toEqual(["contraparteId"]);
  });
});

describe("editar: a trilha (§A.6)", () => {
  it("campo fechado grava de/para; texto livre grava só 'alterado'", async () => {
    const { service, escritas } = montar();
    await editar(service, { dataLimite: "2026-12-01", observacoes: "texto com nome de gente" });
    const linhas = trilha(escritas);
    expect(linhas).toContainEqual(
      expect.objectContaining({ campo: "dataLimite", de: "2026-10-30", para: "2026-12-01", valorOmitido: false, porId: AUTOR, vagaId: VAGA }),
    );
    expect(linhas).toContainEqual(
      expect.objectContaining({ campo: "observacoes", de: null, para: null, valorOmitido: true }),
    );
  });

  it("o CPF do substituído nunca chega à trilha, nem quando o acoplamento o apaga", async () => {
    const { service, escritas } = montar();
    await editar(service, { vinculo: "EFETIVO" });
    const texto = JSON.stringify(trilha(escritas));
    expect(texto).not.toContain(CPF_SINTETICO);
    expect(texto).not.toContain("Pessoa Sintetica");
    const campos = trilha(escritas).map((l) => l.campo);
    expect(campos).toEqual(expect.arrayContaining(["vinculo", "substituidoCpf", "substituidoNome", "motivo"]));
  });
});

describe("editar: a fronteira A&S/ADM (decisão 3)", () => {
  it("com gente enviada à admissão, campo copiado não muda: CAMPO_DA_ADMISSAO", async () => {
    const { service, escritas } = montar({ enviados: 1 });
    const r = await negada(editar(service, { salarioAbertura: "1800" }));
    expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
    expect(r.campos).toEqual(["salarioAbertura"]);
    expect(escritas).toEqual([]);
  });

  it("o acoplamento conta: trocar o vínculo apaga o substituído, e isso é recusado", async () => {
    const { service } = montar({ enviados: 2 });
    const r = await negada(editar(service, { vinculo: "EFETIVO" }));
    expect(r.campos).toEqual(expect.arrayContaining(["substituidoCpf", "substituidoNome", "motivo"]));
  });

  it("campo fora da lista segue editável com gente enviada", async () => {
    const { service } = montar({ enviados: 3 });
    await expect(editar(service, { observacoes: "ok" })).resolves.toMatchObject({ camposAlterados: 1 });
  });
});

describe("editar: troca de cliente (decisão 2)", () => {
  it("com entrevista com o cliente: pede confirmação, sem escrita", async () => {
    const { service, escritas } = montar({ entrevistas: ["e1", "e2"] });
    const r = await negada(editar(service, { codCliente: "C002" }));
    expect(r).toMatchObject({ codigo: "CONFIRMAR_TROCA_DE_CLIENTE", entrevistas: 2 });
    expect(escritas).toEqual([]);
  });

  it("confirmada: apaga as entrevistas, grava a correção de cliente e a contagem na trilha", async () => {
    const { service, escritas, exigirCliente } = montar({ entrevistas: ["e1", "e2"] });
    const r = await editar(service, { codCliente: "C002", confirmarTrocaDeCliente: true });
    expect(r).toEqual({ vagaId: VAGA, camposAlterados: 1, entrevistasRemovidas: 2 });
    expect(exigirCliente).toHaveBeenCalledWith("C002");
    expect(doTipo(escritas, getTableName(asCandidaturaEntrevistas), "delete")).toHaveLength(1);
    expect(doTipo(escritas, getTableName(vagaClienteCorrecoes))[0]!.valores).toMatchObject({
      deCodCliente: "C001",
      paraCodCliente: "C002",
      porId: AUTOR,
    });
    expect(trilha(escritas)).toContainEqual(
      expect.objectContaining({ campo: "entrevistasRemovidas", de: null, para: "2", valorOmitido: false }),
    );
    expect(escritas.every((e) => e.naTransacao)).toBe(true);
  });

  it("cliente vazio é recusado", async () => {
    const { service } = montar();
    await expect(editar(service, { codCliente: "" })).rejects.toThrow();
  });
});

describe("editar: posições (decisões 5 e 6)", () => {
  const alocadas = [
    { situacao: "ALOCADO", posicaoLado: "OFICIAL" },
    { situacao: "ALOCADO", posicaoLado: "OFICIAL" },
    { situacao: "APROVADO", posicaoLado: "OFICIAL" },
    { situacao: "APROVADO", posicaoLado: "OFICIAL" },
  ];

  it("abaixo do entregue: ABAIXO_DO_ENTREGUE, mesmo confirmado", async () => {
    const { service, escritas } = montar({ candidaturas: alocadas });
    const r = await negada(editar(service, { posicoesOficiais: 1, confirmarAbaixoDoAlocado: true }));
    expect(r.codigo).toBe("ABAIXO_DO_ENTREGUE");
    expect(escritas).toEqual([]);
  });

  it("abaixo do alocado: pede confirmação; confirmada, grava em vaga_meta_reducoes", async () => {
    const sem = montar({ candidaturas: alocadas });
    const r = await negada(editar(sem.service, { posicoesOficiais: 3 }));
    expect(r).toMatchObject({ codigo: "CONFIRMAR_ABAIXO_DO_ALOCADO", alocados: 4, entregues: 2 });

    const com = montar({ candidaturas: alocadas });
    await editar(com.service, { posicoesOficiais: 3, confirmarAbaixoDoAlocado: true });
    expect(doTipo(com.escritas, getTableName(vagaMetaReducoes))[0]!.valores).toMatchObject({
      deOficiais: 5,
      paraOficiais: 3,
      deBanco: 0,
      paraBanco: 0,
      porId: AUTOR,
    });
  });

  it("aumento não grava redução", async () => {
    const { service, escritas } = montar({ candidaturas: alocadas });
    await editar(service, { posicoesOficiais: 8 });
    expect(doTipo(escritas, getTableName(vagaMetaReducoes))).toEqual([]);
  });
});

describe("editar: consultor e recruiter (decisão 7)", () => {
  it("troca de consultor confere o destino e grava a transferência", async () => {
    const { service, escritas, destinoConsultor } = montar();
    await editar(service, { consultorId: CONSULTOR_B });
    expect(destinoConsultor).toHaveBeenCalledWith(CONSULTOR_B);
    expect(doTipo(escritas, getTableName(vagaConsultorTransferencias))[0]!.valores).toMatchObject({
      deConsultorId: CONSULTOR_A,
      paraConsultorId: CONSULTOR_B,
      porId: AUTOR,
    });
  });

  it("recruiter sem papel de RECRUITER é recusado", async () => {
    const { service, escritas } = montar({
      usuarios: { [RECRUITER_B]: { ativo: true, papelAs: "CONSULTOR" } },
    });
    await expect(editar(service, { recruiterId: RECRUITER_B })).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toEqual([]);
  });

  it("recruiter válido grava só na trilha da edição", async () => {
    const { service, escritas } = montar();
    await editar(service, { recruiterId: RECRUITER_B });
    expect(trilha(escritas)).toContainEqual(
      expect.objectContaining({ campo: "recruiterId", de: RECRUITER_A, para: RECRUITER_B }),
    );
    expect(doTipo(escritas, getTableName(vagaConsultorTransferencias))).toEqual([]);
  });
});

describe("editar: semântica do corpo (ausente mantém, null limpa)", () => {
  it("null em campo opcional limpa e grava", async () => {
    const { service, escritas } = montar({ vaga: { observacoes: "antiga" } });
    await editar(service, { observacoes: null } as never);
    const update = doTipo(escritas, getTableName(vagas), "update")[0]!.valores as Record<string, unknown>;
    expect(update.observacoes).toBeNull();
  });

  it("null em campo obrigatório cai na régua dos obrigatórios e nada é gravado", async () => {
    const { service, escritas } = montar();
    await expect(editar(service, { cargoId: null } as never)).rejects.toThrow(/obrigatório/);
    expect(escritas).toEqual([]);
  });

  it("consultor null é 'sem responsável': aceito, com transferência e trilha", async () => {
    const { service, escritas, destinoConsultor } = montar();
    await editar(service, { consultorId: null } as never);
    expect(destinoConsultor).not.toHaveBeenCalled();
    expect(doTipo(escritas, getTableName(vagaConsultorTransferencias))[0]!.valores).toMatchObject({
      deConsultorId: CONSULTOR_A,
      paraConsultorId: null,
    });
    expect(trilha(escritas)).toContainEqual(
      expect.objectContaining({ campo: "consultorId", de: CONSULTOR_A, para: null }),
    );
  });

  it("regiaoEstado sem cidade é entrada do formulário", async () => {
    const { service, escritas } = montar();
    await editar(service, { regiaoEstado: "SP" });
    const update = doTipo(escritas, getTableName(vagas), "update")[0]!.valores as Record<string, unknown>;
    expect(update.regiaoEstado).toBe("SP");
  });
});

describe("excluir", () => {
  it("vaga com candidatura ou shortlist: 409 com as contagens, sem escrita", async () => {
    const { service, escritas } = montar({ candidaturas: [{ situacao: "ATIVO", posicaoLado: null }], shortlists: 1 });
    await expect(service.excluir(VAGA, AUTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toEqual([]);
  });

  it("vaga vazia: grava vaga_exclusoes sem texto livre nem CPF, e apaga a vaga", async () => {
    const { service, escritas } = montar();
    await service.excluir(VAGA, AUTOR);
    const registro = doTipo(escritas, getTableName(vagaExclusoes))[0]!.valores as Record<string, unknown>;
    expect(registro).toMatchObject({ vagaId: VAGA, codigo: "PS-100", idVacancyPandape: "9001", porId: AUTOR });
    const texto = JSON.stringify(registro.instantaneo);
    expect(texto).not.toContain(CPF_SINTETICO);
    expect(texto).not.toContain("Operador De Caixa");
    expect(texto).not.toContain("Pessoa Sintetica");
    expect(doTipo(escritas, getTableName(vagas), "delete")).toHaveLength(1);
  });

  it("violação de FK no delete vira 409 sem detalhe", async () => {
    const { service } = montar();
    const erro = Object.assign(new Error("fk"), { code: "23503", detail: "segredo" });
    (service as unknown as { db: { transaction: unknown } }).db.transaction = async () => {
      throw erro;
    };
    await expect(service.excluir(VAGA, AUTOR)).rejects.toBeInstanceOf(ConflictException);
  });

  it("prévia diz que a vaga do Pandapé volta pela varredura", async () => {
    const { service } = montar();
    await expect(service.exclusaoPrevia(VAGA)).resolves.toEqual({
      vagaId: VAGA,
      podeExcluir: true,
      candidaturas: 0,
      shortlists: 0,
      voltaPelaVarredura: true,
    });
  });
});

describe("prévia da edição", () => {
  it("traz os dois lados, a ocupação e os campos travados pela admissão", async () => {
    const { service } = montar({ enviados: 1, candidaturas: [{ situacao: "APROVADO", posicaoLado: null }] });
    const p = await service.previa(VAGA);
    expect(p).toMatchObject({
      editavel: true,
      enviadosParaAdmissao: 1,
      alocados: 1,
      entregues: 0,
      consultorId: CONSULTOR_A,
      recruiterId: RECRUITER_A,
    });
    expect(p.camposTravadosPelaAdmissao.length).toBeGreaterThan(0);
  });
});

/**
 * ─ A EDIÇÃO LIMPA A PROCEDÊNCIA DO CAMPO QUE ELA MUDOU (0146 + 0147) ───────────────────────────
 *
 * Esta é a TERCEIRA porta de gravação humana dos cinco campos pré-preenchidos (as outras duas, o
 * PATCH em revisão e a liberação, são medidas em `vagas.liberar-vaga-completa.spec.ts`). Sem a
 * limpeza, o carimbo `PLANILHA` sobrevive à correção e passa a afirmar "este veio da planilha" sobre
 * um valor que alguém escolheu, e a CONTAGEM de vagas que herdaram um erro da planilha passa a
 * incluir justamente as já corrigidas.
 *
 * ESTA PORTA JÁ GRAVA SÓ O QUE MUDOU, então aqui a régua coincide com o próprio `set`, e é por isso
 * que o segundo caso importa tanto: editar um campo que não é nenhum dos cinco NÃO pode encostar em
 * procedência nenhuma.
 */
describe("editar: a gravação humana limpa a procedência do campo que mudou", () => {
  const CARIMBOS = {
    naturezaOrigem: "PLANILHA",
    linhaServicoOrigem: "PLANILHA",
    cargoOrigem: "PLANILHA",
    dataAberturaOrigem: "PLANILHA",
    dataLimiteOrigem: "PLANILHA",
  };
  const CARGO_NOVO = "88888888-8888-8888-8888-888888888888";

  const setDaVaga = (escritas: Escrita[]) =>
    (doTipo(escritas, getTableName(vagas), "update")[0]?.valores ?? {}) as Record<string, unknown>;

  it("trocar o CARGO limpa `cargo_origem` e não toca a procedência dos outros quatro", async () => {
    const { service, escritas } = montar({ vaga: CARIMBOS });
    await editar(service, { cargoId: CARGO_NOVO });

    const set = setDaVaga(escritas);
    expect(set.cargoId).toBe(CARGO_NOVO);
    expect(set.cargoOrigem, "o carimbo sobreviveu à troca e passou a mentir").toBeNull();
    for (const outra of [
      "naturezaOrigem",
      "linhaServicoOrigem",
      "dataAberturaOrigem",
      "dataLimiteOrigem",
    ]) {
      expect(set, `a troca do cargo alcançou \`${outra}\``).not.toHaveProperty(outra);
    }
  });

  it("editar um campo QUE NÃO É dos cinco não limpa procedência nenhuma", async () => {
    const { service, escritas } = montar({ vaga: CARIMBOS });
    await editar(service, { observacoes: "só isto" });

    const set = setDaVaga(escritas);
    expect(Object.keys(set).sort()).toEqual(["atualizadoEm", "observacoes"]);
  });

  it("trocar a DATA LIMITE por outra limpa o carimbo dela", async () => {
    // ESVAZIAR não é exercitável NESTA porta, e isso é a régua e não uma lacuna: os cinco campos
    // estão entre os onze obrigatórios, e a vaga já liberada é conferida como vaga publicada, então
    // `travaObrigatorios` recusa o campo em branco antes de qualquer escrita. O caso do
    // esvaziamento vive na porta da REVISÃO, onde a régua não roda, e é medido no spec dela.
    const { service, escritas } = montar({ vaga: CARIMBOS });
    await editar(service, { dataLimite: "2026-12-15" });

    const set = setDaVaga(escritas);
    expect(set.dataLimite).toBe("2026-12-15");
    expect(set.dataLimiteOrigem).toBeNull();
  });

  it("a procedência NÃO entra na trilha da edição (`ck_vaga_edicoes_campo` a recusaria)", async () => {
    const { service, escritas } = montar({ vaga: CARIMBOS });
    await editar(service, { cargoId: CARGO_NOVO });

    // A limpeza é DERIVADA da gravação, não campo de formulário: um nome de coluna de procedência
    // na trilha derrubaria a transação inteira da edição pelo CHECK do banco.
    for (const linha of trilha(escritas)) {
      expect(String(linha.campo).endsWith("Origem")).toBe(false);
    }
    expect(trilha(escritas).map((l) => l.campo)).toEqual(["cargoId"]);
  });
});
