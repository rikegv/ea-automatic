import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AS_VAGA_CAMPOS_DA_ADMISSAO, type AsVagaEdicaoNegada } from "@ea/shared-types";
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
import { VAGA_EDICAO_CAMPOS_DA_TRILHA } from "../../domain/vaga-edicao";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { EditarVagaDto } from "./vagas.dto";
import { VagasEdicaoService } from "./vagas-edicao.service";
import { VagasService } from "./vagas.service";

/**
 * TESTER INDEPENDENTE, RODADA 2 (§A.38, §A.40): o SERVIÇO da edição e da exclusão da vaga liberada,
 * escrito contra as 7 decisões do diretor e a EMENDA do mapa (`docs/MAPA-CRUD-VAGA-LIBERADA.md`),
 * cobrindo o que o spec do autor (`vagas-edicao.backend.spec.ts`) não alcança.
 *
 * O BANCO FINGIDO É MAIS ESTRITO que o do autor em três pontos, porque é onde a regra mora:
 *  - a contagem de "enviados para a admissão" AVALIA o predicado do SQL (situação ENVIADO **ou**
 *    `admissao_id` preenchido), em vez de devolver um número fixo;
 *  - as entrevistas são filtradas pelas ETAPAS que o SQL pede (só as de entrega ao cliente);
 *  - o `delete` das entrevistas apaga só os ids que o SQL nomeia.
 *
 * §A.6: CPFs sintéticos de dígito válido; os marcadores de texto livre são strings de teste.
 */

const VAGA = "11111111-1111-1111-1111-111111111111";
const AUTOR = "22222222-2222-2222-2222-222222222222";
const CONSULTOR_A = "33333333-3333-3333-3333-333333333333";
const CONSULTOR_B = "44444444-4444-4444-4444-444444444444";
const RECRUITER_A = "55555555-5555-5555-5555-555555555555";
const CARGO = "77777777-7777-7777-7777-777777777777";
const CARGO_2 = "88888888-8888-8888-8888-888888888888";
const CPF_ATUAL = "52998224725";
const CPF_NOVO = "11144477735";

const dialeto = new PgDialect();
const render = (cond: unknown): { sql: string; params: unknown[] } =>
  cond ? (dialeto.sqlToQuery(cond as SQL) as { sql: string; params: unknown[] }) : { sql: "", params: [] };

interface Escrita {
  tipo: "insert" | "update" | "delete";
  tabela: string;
  valores: unknown;
  naTransacao: boolean;
}

interface Candidatura {
  id: string;
  situacao: string;
  posicaoLado: string | null;
  admissaoId?: string | null;
}

interface Entrevista {
  id: string;
  candidaturaId: string;
  etapa: string;
}

interface Cenario {
  status?: string;
  vaga?: Record<string, unknown>;
  candidaturas?: Candidatura[];
  entrevistas?: Entrevista[];
  shortlists?: number;
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
    solicitanteNome: "Solicitante Antigo Marcador",
    solicitanteTelefone: "11900001111",
    solicitanteEmail: "antigo@homolog.local",
    dataSolicitacao: null,
    dataAlinhamento: null,
    dataRealinhamento: null,
    envioShortlist: null,
    consultorId: CONSULTOR_A,
    recruiterId: RECRUITER_A,
    tempoContrato: "90",
    motivo: "Substituição",
    justificativaMotivo: "Justificativa Antiga Marcador",
    tipoSubstituicao: null,
    substituidoNome: "Pessoa Sintetica",
    substituidoCpf: CPF_ATUAL,
    localTrabalho: "Local Antigo Marcador",
    regiaoEstado: null,
    regioes: null,
    regioesOutras: null,
    horarioEscala: "6x1",
    modeloTrabalho: null,
    detalheHibrido: null,
    confidencial: false,
    divulgarEmpresa: true,
    faixaEtaria: null,
    genero: "INDIFERENTE",
    idiomas: null,
    idiomasExigidos: null,
    idiomasOutros: null,
    cursosConhecimentos: "Cursos Antigos Marcador",
    testes: null,
    testesOutro: null,
    experiencia: "Experiencia Antiga Marcador",
    atribuicoes: "Atribuicoes Antigas Marcador",
    perfilComportamental: "Perfil Antigo Marcador",
    ambiente: "Ambiente Antigo Marcador",
    etapasPs: null,
    etapasPsOutra: null,
    observacoes: "Observacoes Antigas Marcador",
    encerradaEm: null,
    dataFechamento: null,
    criadoEm: new Date("2026-09-01T12:00:00Z"),
    atualizadoEm: new Date("2026-09-01T12:00:00Z"),
    ...c.vaga,
  };
}

function montar(c: Cenario = {}) {
  const vaga = vagaBase(c);
  let existe = true;
  const escritas: Escrita[] = [];
  const candidaturas = c.candidaturas ?? [];
  let entrevistas = [...(c.entrevistas ?? [])];
  const pessoas: Record<string, { ativo: boolean; papelAs: string | null }> = {
    [CONSULTOR_B]: { ativo: true, papelAs: "CONSULTOR" },
  };

  /** A contagem de enviados AVALIANDO o predicado que o SQL de verdade carrega. */
  const contarEnviados = (q: { sql: string; params: unknown[] }) => {
    const porSituacao =
      /"situacao" = \$\d+/.test(q.sql) && q.params.includes("ENVIADO_PARA_ADMISSAO");
    const porAdmissao = /"admissao_id" is not null/.test(q.sql);
    const ehOu = /\bor\b/i.test(q.sql);
    return candidaturas.filter((x) => {
      const a = porSituacao && x.situacao === "ENVIADO_PARA_ADMISSAO";
      const b = porAdmissao && !!x.admissaoId;
      return ehOu ? a || b : a && b;
    }).length;
  };

  const leitura = (dentro: boolean) => (campos?: Record<string, unknown>) => {
    let tabela = "";
    let cond: unknown = null;
    const chaves = Object.keys(campos ?? {});
    const resolver = (): Promise<unknown[]> => {
      const q = render(cond);
      if (tabela === getTableName(vagas)) return Promise.resolve(existe ? [{ ...vaga }] : []);
      if (tabela === getTableName(vagaBeneficio)) return Promise.resolve(c.beneficios ?? []);
      if (tabela === getTableName(asCandidaturas)) {
        if (chaves.includes("n")) {
          const n = q.sql.includes("admissao_id") ? contarEnviados(q) : candidaturas.length;
          return Promise.resolve([{ n }]);
        }
        if (chaves.includes("quantas")) {
          return Promise.resolve(
            candidaturas.map((x) => ({ situacao: x.situacao, posicaoLado: x.posicaoLado, quantas: 1 })),
          );
        }
      }
      if (tabela === getTableName(asCandidaturaEntrevistas)) {
        // Só as etapas que o SQL pede. Etapa fora da lista não volta.
        return Promise.resolve(
          entrevistas.filter((e) => q.params.includes(e.etapa)).map((e) => ({ id: e.id })),
        );
      }
      if (tabela === getTableName(asShortlists)) return Promise.resolve([{ n: c.shortlists ?? 0 }]);
      if (tabela === getTableName(usuarios)) {
        const id = Object.keys(pessoas).find((p) => q.params.includes(p));
        return Promise.resolve(id ? [{ id, ...pessoas[id] }] : []);
      }
      return Promise.resolve([]);
    };
    void dentro;
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
    b.for = () => resolver();
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko);
    return b;
  };

  const montarExec = (dentro: boolean) => ({
    select: leitura(dentro),
    update: (t: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: async () => {
          escritas.push({ tipo: "update", tabela: getTableName(t as never), valores, naTransacao: dentro });
          if (getTableName(t as never) === getTableName(vagas)) Object.assign(vaga, valores);
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: async (valores: unknown) => {
        escritas.push({ tipo: "insert", tabela: getTableName(t as never), valores, naTransacao: dentro });
      },
    }),
    delete: (t: unknown) => ({
      where: (cond: unknown) => {
        const tabela = getTableName(t as never);
        const apagar = () => {
          let apagados: { id: string }[] = [];
          if (tabela === getTableName(asCandidaturaEntrevistas)) {
            const ids = render(cond).params;
            apagados = entrevistas.filter((e) => ids.includes(e.id)).map((e) => ({ id: e.id }));
            entrevistas = entrevistas.filter((e) => !ids.includes(e.id));
          }
          if (tabela === getTableName(vagas)) existe = false;
          escritas.push({ tipo: "delete", tabela, valores: apagados.map((a) => a.id), naTransacao: dentro });
          return apagados;
        };
        return {
          returning: async () => apagar(),
          then: (ok: (v: unknown) => unknown) => Promise.resolve(apagar()).then(() => ok(undefined)),
        };
      },
    }),
  });

  const tx = montarExec(true);
  const db = { ...montarExec(false), transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };

  const etapas = catalogoDeEtapasFingido();
  const status = catalogoDeStatusFingido();
  const vagasService = new VagasService(db as never, etapas as never, status as never);
  const exigirCliente = vi.spyOn(vagasService, "exigirClienteExistente").mockResolvedValue(undefined);
  vi.spyOn(vagasService, "consultorDeDestino").mockImplementation(async (id: string) => {
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
  return { service, vaga, escritas, exigirCliente, entrevistasRestantes: () => entrevistas };
}

const doTipo = (escritas: Escrita[], tabela: string, tipo?: Escrita["tipo"]) =>
  escritas.filter((e) => e.tabela === tabela && (!tipo || e.tipo === tipo));
const trilha = (escritas: Escrita[]) =>
  doTipo(escritas, getTableName(vagaEdicoes)).flatMap((e) => e.valores as Record<string, unknown>[]);
const updateDaVaga = (escritas: Escrita[]) =>
  doTipo(escritas, getTableName(vagas), "update")[0]?.valores as Record<string, unknown> | undefined;

async function negada(p: Promise<unknown>): Promise<AsVagaEdicaoNegada> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ConflictException);
    return (e as ConflictException).getResponse() as AsVagaEdicaoNegada;
  }
  throw new Error("esperava 409");
}

const editar = (s: VagasEdicaoService, dto: Record<string, unknown>) =>
  s.editar(VAGA, dto as unknown as EditarVagaDto, AUTOR);

const ENVIADO: Candidatura = { id: "cand-env", situacao: "ENVIADO_PARA_ADMISSAO", posicaoLado: "OFICIAL" };

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DECISÃO 3: A FRONTEIRA A&S / ADM, NO RESULTADO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Um valor DIFERENTE do atual para cada campo copiado à admissão. */
const MUDANCA_POR_CAMPO: Record<string, Record<string, unknown>> = {
  codCliente: { codCliente: "C002", confirmarTrocaDeCliente: true },
  cargoId: { cargoId: CARGO_2 },
  salarioAbertura: { salarioAbertura: "1800.00" },
  horarioEscala: { horarioEscala: "12x36" },
  tempoContrato: { tempoContrato: "180" },
  motivo: { motivo: "Aumento De Quadro" },
  substituidoNome: { substituidoNome: "Outra Pessoa Sintetica" },
  substituidoCpf: { substituidoCpf: CPF_NOVO },
  localTrabalho: { localTrabalho: "Local Novo Marcador" },
};

describe("decisão 3: com gente enviada à admissão, cada campo copiado é recusado, um a um", () => {
  it("o mapa deste teste cobre a lista inteira do contrato (lista nova sem teste falha aqui)", () => {
    expect(Object.keys(MUDANCA_POR_CAMPO).sort()).toEqual([...AS_VAGA_CAMPOS_DA_ADMISSAO].sort());
  });

  for (const campo of AS_VAGA_CAMPOS_DA_ADMISSAO) {
    it(`${campo}: CAMPO_DA_ADMISSAO com exatamente [${campo}], sem escrita e sem valor na resposta`, async () => {
      const { service, escritas } = montar({ candidaturas: [ENVIADO] });
      const r = await negada(editar(service, MUDANCA_POR_CAMPO[campo]!));
      expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
      expect(r.campos).toEqual([campo]);
      expect(escritas).toEqual([]);
      const texto = JSON.stringify(r);
      expect(texto).not.toContain(CPF_NOVO);
      expect(texto).not.toContain(CPF_ATUAL);
      expect(texto).not.toContain("Marcador");
    });
  }
});

describe("decisão 3: quem conta como 'enviado para a admissão'", () => {
  it("situação ENVIADO_PARA_ADMISSAO sem admissão ligada conta", async () => {
    const { service } = montar({ candidaturas: [{ ...ENVIADO, admissaoId: null }] });
    const r = await negada(editar(service, { salarioAbertura: "1800.00" }));
    expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
  });

  it("admissão ligada com outra situação (ex. DESISTIU depois do envio) TAMBÉM conta", async () => {
    const { service } = montar({
      candidaturas: [{ id: "c1", situacao: "DESISTIU", posicaoLado: null, admissaoId: "adm-1" }],
    });
    const r = await negada(editar(service, { salarioAbertura: "1800.00" }));
    expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
  });

  it("ALOCADO sem admissão não conta: o salário muda", async () => {
    const { service, escritas } = montar({
      candidaturas: [{ id: "c1", situacao: "ALOCADO", posicaoLado: "OFICIAL", admissaoId: null }],
    });
    await editar(service, { salarioAbertura: "1800.00" });
    expect(updateDaVaga(escritas)?.salarioAbertura).toBe("1800.00");
  });

  it("a prévia diz os campos travados quando há admissão ligada sem a situação de envio", async () => {
    const { service } = montar({
      candidaturas: [{ id: "c1", situacao: "ATIVO", posicaoLado: null, admissaoId: "adm-1" }],
    });
    const p = await service.previa(VAGA);
    expect(p.enviadosParaAdmissao).toBe(1);
    expect([...p.camposTravadosPelaAdmissao].sort()).toEqual([...AS_VAGA_CAMPOS_DA_ADMISSAO].sort());
  });
});

describe("decisão 3: no RESULTADO, não no corpo", () => {
  it("devolver o MESMO valor em outro formato não é mudança (salário '1500' x '1500.00', CPF igual)", async () => {
    const { service, escritas } = montar({ candidaturas: [ENVIADO] });
    const r = await editar(service, {
      salarioAbertura: "1500",
      substituidoCpf: CPF_ATUAL,
      codCliente: " C001 ",
      horarioEscala: " 6x1 ",
    });
    expect(r.camposAlterados).toBe(0);
    expect(escritas).toEqual([]);
  });

  it("vínculo para ESTAGIO mantém o tempo de contrato mas apaga motivo e substituído: recusado por eles", async () => {
    const { service, escritas } = montar({ candidaturas: [ENVIADO] });
    const r = await negada(editar(service, { vinculo: "ESTAGIO" }));
    expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
    expect(r.campos).toEqual(expect.arrayContaining(["motivo", "substituidoNome", "substituidoCpf"]));
    expect(r.campos).not.toContain("tempoContrato");
    expect(escritas).toEqual([]);
  });

  it("a fronteira vem ANTES da troca de cliente: confirmada ou não, nenhuma entrevista é apagada", async () => {
    const { service, escritas, entrevistasRestantes } = montar({
      candidaturas: [ENVIADO],
      entrevistas: [{ id: "e1", candidaturaId: "cand-env", etapa: "ENTREVISTA_CLIENTE" }],
    });
    const r = await negada(editar(service, { codCliente: "C002", confirmarTrocaDeCliente: true }));
    expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
    expect(entrevistasRestantes()).toHaveLength(1);
    expect(escritas).toEqual([]);
  });

  it("campo fora da lista muda, e o update NÃO toca nenhum campo da admissão", async () => {
    const { service, escritas } = montar({ candidaturas: [ENVIADO] });
    await editar(service, { dataLimite: "2026-12-01", observacoes: "Nova" });
    const set = updateDaVaga(escritas)!;
    for (const c of AS_VAGA_CAMPOS_DA_ADMISSAO) expect(set).not.toHaveProperty(c);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DECISÃO 2: TROCA DE CLIENTE
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("decisão 2: trocar o cliente", () => {
  const ENTREVISTAS: Entrevista[] = [
    { id: "e-cli-1", candidaturaId: "c1", etapa: "ENTREVISTA_CLIENTE" },
    { id: "e-cli-2", candidaturaId: "c2", etapa: "ENTREVISTA_CLIENTE" },
    { id: "e-soulan", candidaturaId: "c1", etapa: "ENTREVISTA_SOULAN" },
  ];
  const CANDS: Candidatura[] = [
    { id: "c1", situacao: "ATIVO", posicaoLado: null },
    { id: "c2", situacao: "ATIVO", posicaoLado: null },
  ];

  it("sem entrevista: troca sem pedir confirmação, grava a correção e a trilha, não apaga nada", async () => {
    const { service, escritas } = montar({ candidaturas: CANDS });
    const r = await editar(service, { codCliente: "C002" });
    expect(r).toEqual({ vagaId: VAGA, camposAlterados: 1, entrevistasRemovidas: 0 });
    expect(doTipo(escritas, getTableName(asCandidaturaEntrevistas), "delete")).toEqual([]);
    expect(doTipo(escritas, getTableName(vagaClienteCorrecoes))[0]!.valores).toMatchObject({
      vagaId: VAGA,
      deCodCliente: "C001",
      paraCodCliente: "C002",
      porId: AUTOR,
    });
    const linhas = trilha(escritas);
    expect(linhas).toContainEqual(
      expect.objectContaining({ campo: "codCliente", de: "C001", para: "C002", valorOmitido: false }),
    );
    expect(linhas.map((l) => l.campo)).not.toContain("entrevistasRemovidas");
  });

  it("só entrevista fora da entrega ao cliente: não pede confirmação e não apaga", async () => {
    const { service, entrevistasRestantes } = montar({
      candidaturas: CANDS,
      entrevistas: [ENTREVISTAS[2]!],
    });
    const r = await editar(service, { codCliente: "C002" });
    expect(r.entrevistasRemovidas).toBe(0);
    expect(entrevistasRestantes()).toHaveLength(1);
  });

  it("a confirmação conta SÓ as de entrega ao cliente", async () => {
    const { service, escritas } = montar({ candidaturas: CANDS, entrevistas: ENTREVISTAS });
    const r = await negada(editar(service, { codCliente: "C002" }));
    expect(r).toMatchObject({ codigo: "CONFIRMAR_TROCA_DE_CLIENTE", entrevistas: 2 });
    expect(escritas).toEqual([]);
  });

  it("confirmada: apaga exatamente as 2 de entrega ao cliente, mantém a da Soulan, e a contagem vai à trilha", async () => {
    const { service, escritas, entrevistasRestantes } = montar({
      candidaturas: CANDS,
      entrevistas: ENTREVISTAS,
    });
    const r = await editar(service, { codCliente: "C002", confirmarTrocaDeCliente: true });
    expect(r.entrevistasRemovidas).toBe(2);
    expect(entrevistasRestantes().map((e) => e.id)).toEqual(["e-soulan"]);
    expect(trilha(escritas)).toContainEqual(
      expect.objectContaining({ campo: "entrevistasRemovidas", para: "2", valorOmitido: false }),
    );
    expect(doTipo(escritas, getTableName(vagaClienteCorrecoes))).toHaveLength(1);
    expect(escritas.every((e) => e.naTransacao)).toBe(true);
  });

  it("cliente antigo NULO: não é troca entre dois clientes, nada é apagado nem confirmado", async () => {
    const { service, escritas, entrevistasRestantes } = montar({
      vaga: { codCliente: null },
      candidaturas: CANDS,
      entrevistas: ENTREVISTAS,
    });
    const r = await editar(service, { codCliente: "C002" });
    expect(r.entrevistasRemovidas).toBe(0);
    expect(entrevistasRestantes()).toHaveLength(3);
    expect(doTipo(escritas, getTableName(vagaClienteCorrecoes))[0]!.valores).toMatchObject({
      deCodCliente: null,
      paraCodCliente: "C002",
    });
  });

  it("o mesmo cliente com espaço em volta não é troca", async () => {
    const { service, escritas } = montar({ candidaturas: CANDS, entrevistas: ENTREVISTAS });
    const r = await editar(service, { codCliente: "  C001  " });
    expect(r.camposAlterados).toBe(0);
    expect(escritas).toEqual([]);
  });

  it("a confirmação sem troca não apaga nada", async () => {
    const { service, entrevistasRestantes, escritas } = montar({
      candidaturas: CANDS,
      entrevistas: ENTREVISTAS,
    });
    await editar(service, { observacoes: "Nova", confirmarTrocaDeCliente: true });
    expect(entrevistasRestantes()).toHaveLength(3);
    expect(doTipo(escritas, getTableName(vagaClienteCorrecoes))).toEqual([]);
  });

  it("cliente que não existe: recusa sem escrita e sem apagar entrevista", async () => {
    const { service, escritas, exigirCliente, entrevistasRestantes } = montar({
      candidaturas: CANDS,
      entrevistas: ENTREVISTAS,
    });
    exigirCliente.mockRejectedValueOnce(new NotFoundException("Cliente não encontrado."));
    await expect(
      editar(service, { codCliente: "C999", confirmarTrocaDeCliente: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(escritas).toEqual([]);
    expect(entrevistasRestantes()).toHaveLength(3);
  });

  it("cliente null: BadRequest, sem escrita", async () => {
    const { service, escritas } = montar();
    await expect(editar(service, { codCliente: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(escritas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DECISÕES 5 E 6: POSIÇÕES, POR LADO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const de = (n: number, situacao: string, lado: string | null): Candidatura[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${situacao}-${lado}-${i}`, situacao, posicaoLado: lado }));

describe("decisões 5 e 6: posições, régua por lado", () => {
  it("3 entregues no BANCO, banco 3 para 1: ABAIXO_DO_ENTREGUE mesmo confirmado, sem escrita", async () => {
    const { service, escritas } = montar({
      vaga: { posicoesBanco: 3 },
      candidaturas: de(3, "ALOCADO", "BANCO"),
    });
    const r = await negada(editar(service, { posicoesBanco: 1, confirmarAbaixoDoAlocado: true }));
    expect(r.codigo).toBe("ABAIXO_DO_ENTREGUE");
    expect(escritas).toEqual([]);
  });

  it("entregue OFICIAL não é compensado por sobra de banco", async () => {
    const { service, escritas } = montar({
      vaga: { posicoesOficiais: 5, posicoesBanco: 5 },
      candidaturas: de(2, "ENVIADO_PARA_ADMISSAO", null),
    });
    const r = await negada(editar(service, { posicoesOficiais: 1, confirmarAbaixoDoAlocado: true }));
    expect(r.codigo).toBe("ABAIXO_DO_ENTREGUE");
    expect(escritas).toEqual([]);
  });

  it("entregues no banco NÃO seguram a meta oficial: oficial 5 para 1 passa e vai ao rastro", async () => {
    const { service, escritas } = montar({
      vaga: { posicoesOficiais: 5, posicoesBanco: 3 },
      candidaturas: de(3, "ALOCADO", "BANCO"),
    });
    await editar(service, { posicoesOficiais: 1 });
    expect(doTipo(escritas, getTableName(vagaMetaReducoes))[0]!.valores).toMatchObject({
      deOficiais: 5,
      paraOficiais: 1,
      porId: AUTOR,
    });
  });

  it("aprovados no BANCO, banco 3 para 1: pede confirmação; confirmada, rastro do banco", async () => {
    const sem = montar({ vaga: { posicoesBanco: 3 }, candidaturas: de(2, "APROVADO", "BANCO") });
    const r = await negada(editar(sem.service, { posicoesBanco: 1 }));
    expect(r.codigo).toBe("CONFIRMAR_ABAIXO_DO_ALOCADO");
    expect(sem.escritas).toEqual([]);

    const com = montar({ vaga: { posicoesBanco: 3 }, candidaturas: de(2, "APROVADO", "BANCO") });
    await editar(com.service, { posicoesBanco: 1, confirmarAbaixoDoAlocado: true });
    expect(doTipo(com.escritas, getTableName(vagaMetaReducoes))[0]!.valores).toMatchObject({
      deBanco: 3,
      paraBanco: 1,
      porId: AUTOR,
    });
  });

  it("alocados no OFICIAL não pedem confirmação para baixar só o BANCO", async () => {
    const { service, escritas } = montar({
      vaga: { posicoesOficiais: 3, posicoesBanco: 2 },
      candidaturas: de(3, "APROVADO", "OFICIAL"),
    });
    await editar(service, { posicoesBanco: 0 });
    expect(doTipo(escritas, getTableName(vagaMetaReducoes))).toHaveLength(1);
  });

  it("redução só do banco, sem ninguém, vai ao rastro (decisão 6: TODA redução)", async () => {
    const { service, escritas } = montar({ vaga: { posicoesBanco: 4 } });
    await editar(service, { posicoesBanco: 2 });
    expect(doTipo(escritas, getTableName(vagaMetaReducoes))[0]!.valores).toMatchObject({
      deBanco: 4,
      paraBanco: 2,
    });
  });

  it("aumento num lado e redução no outro: vai ao rastro", async () => {
    const { service, escritas } = montar({ vaga: { posicoesOficiais: 5, posicoesBanco: 4 } });
    await editar(service, { posicoesOficiais: 8, posicoesBanco: 1 });
    expect(doTipo(escritas, getTableName(vagaMetaReducoes))).toHaveLength(1);
  });

  it("posições null no corpo não apagam a meta", async () => {
    const { service, escritas } = montar();
    const r = await editar(service, { posicoesOficiais: null, posicoesBanco: null });
    expect(r.camposAlterados).toBe(0);
    expect(escritas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EXCLUSÃO E DECISÃO 4
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("exclusão: só sem candidatura e sem shortlist", () => {
  it("UMA candidatura, mesmo descartada, recusa; nada é gravado nem apagado", async () => {
    const { service, escritas } = montar({
      candidaturas: [{ id: "c1", situacao: "DESCARTADO", posicaoLado: null }],
    });
    const erro = await service.excluir(VAGA, AUTOR).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      podeExcluir: false,
      candidaturas: 1,
      shortlists: 0,
    });
    expect(escritas).toEqual([]);
  });

  it("só uma shortlist também recusa", async () => {
    const { service, escritas } = montar({ shortlists: 1 });
    await expect(service.excluir(VAGA, AUTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toEqual([]);
  });

  it("vaga vazia: o registro nasce ANTES do delete, os dois na transação", async () => {
    const { service, escritas } = montar();
    await service.excluir(VAGA, AUTOR);
    const ordem = escritas.map((e) => `${e.tipo}:${e.tabela}`);
    expect(ordem).toEqual([`insert:${getTableName(vagaExclusoes)}`, `delete:${getTableName(vagas)}`]);
    expect(escritas.every((e) => e.naTransacao)).toBe(true);
  });

  it("o instantâneo não leva texto livre nem contato do solicitante (§A.6, E-1/E-6)", async () => {
    const { service, escritas } = montar();
    await service.excluir(VAGA, AUTOR);
    const texto = JSON.stringify(doTipo(escritas, getTableName(vagaExclusoes))[0]!.valores);
    expect(texto).not.toContain("Marcador");
    expect(texto).not.toContain("11900001111");
    expect(texto).not.toContain("antigo@homolog.local");
    expect(texto).not.toContain(CPF_ATUAL);
  });

  it("vaga inexistente: 404, sem escrita", async () => {
    const { service, escritas } = montar();
    await service.excluir(VAGA, AUTOR);
    escritas.length = 0;
    await expect(service.excluir(VAGA, AUTOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(escritas).toEqual([]);
  });
});

describe("decisão 4: a prévia da exclusão", () => {
  it("vaga criada à mão (sem número do Pandapé, ou em branco): voltaPelaVarredura falso", async () => {
    for (const idVacancyPandape of [null, "", "   "]) {
      const { service } = montar({ vaga: { idVacancyPandape } });
      const p = await service.exclusaoPrevia(VAGA);
      expect(p.voltaPelaVarredura, JSON.stringify(idVacancyPandape)).toBe(false);
    }
  });

  it("com candidatura: podeExcluir falso, com a contagem", async () => {
    const { service } = montar({ candidaturas: de(2, "ATIVO", null), shortlists: 1 });
    await expect(service.exclusaoPrevia(VAGA)).resolves.toMatchObject({
      podeExcluir: false,
      candidaturas: 2,
      shortlists: 1,
      voltaPelaVarredura: true,
    });
  });

  it("vaga do Pandapé SEM gente: excluir é permitido (decisão 4), e a vaga sai", async () => {
    const { service, escritas } = montar({ vaga: { idVacancyPandape: "9001" } });
    await service.excluir(VAGA, AUTOR);
    expect(doTipo(escritas, getTableName(vagas), "delete")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DECISÃO 1: SÓ VAGA EM PROCESSO, TAMBÉM NA PRÉVIA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("decisão 1: a prévia concorda com a rota", () => {
  for (const [status, editavel] of [
    ["ABERTA", true],
    ["ENTREGUE", true],
    ["FECHADA", false],
    ["CANCELADA", false],
    ["RASCUNHO", false],
    ["PENDENTE_REVISAO", false],
  ] as const) {
    it(`${status}: editavel=${editavel}`, async () => {
      const { service } = montar({ status });
      const p = await service.previa(VAGA);
      expect(p.editavel).toBe(editavel);
      expect(p.motivoNaoEditavel === null).toBe(editavel);
    });
  }

  it("status fora do catálogo é recusado (fail-closed)", async () => {
    const { service, escritas } = montar({ status: "STATUS_QUE_NAO_EXISTE" });
    const r = await negada(editar(service, { observacoes: "x" }));
    expect(r.codigo).toBe("VAGA_NAO_EDITAVEL");
    expect(escritas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CORPO: CHAVE AUSENTE MANTÉM, NULL LIMPA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const TEXTO_LIVRE_COM_VALOR = [
  "solicitanteNome",
  "solicitanteTelefone",
  "solicitanteEmail",
  "justificativaMotivo",
  "localTrabalho",
  "cursosConhecimentos",
  "experiencia",
  "atribuicoes",
  "perfilComportamental",
  "ambiente",
  "observacoes",
] as const;

describe("corpo: ausente mantém, null limpa", () => {
  it("corpo vazio: nada muda, nada é gravado", async () => {
    const { service, escritas } = montar();
    const r = await editar(service, {});
    expect(r.camposAlterados).toBe(0);
    expect(escritas).toEqual([]);
  });

  it("chave presente com undefined é ausente", async () => {
    const { service, escritas } = montar();
    const r = await editar(service, { observacoes: undefined, cargoId: undefined, salarioAbertura: undefined });
    expect(r.camposAlterados).toBe(0);
    expect(escritas).toEqual([]);
  });

  for (const campo of TEXTO_LIVRE_COM_VALOR) {
    it(`${campo}: null limpa, e a trilha diz só 'alterado'`, async () => {
      const { service, escritas } = montar();
      await editar(service, { [campo]: null });
      expect(updateDaVaga(escritas)?.[campo]).toBeNull();
      const linha = trilha(escritas).find((l) => l.campo === campo);
      expect(linha).toMatchObject({ de: null, para: null, valorOmitido: true });
    });
  }

  it("salário null no SERVIÇO limpa (campo não obrigatório)", async () => {
    const { service, escritas } = montar();
    await editar(service, { salarioAbertura: null });
    expect(updateDaVaga(escritas)?.salarioAbertura).toBeNull();
  });
});

/**
 * O CONTRATO "null limpa" PASSA PELO PIPE DE VERDADE ANTES DE CHEGAR AO SERVIÇO. O `main.ts` usa
 * `ValidationPipe({ whitelist, forbidNonWhitelisted, transform: true })`: um `@Transform` que troca
 * `null` por `undefined` transforma "limpar" em "manter", em silêncio.
 */
describe("corpo pelo ValidationPipe de produção: o null sobrevive até o serviço", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const passar = (corpo: Record<string, unknown>) =>
    pipe.transform(corpo, { type: "body", metatype: EditarVagaDto }) as Promise<Record<string, unknown>>;

  it("corpo vazio continua vazio (nenhum padrão de classe vira campo 'enviado')", async () => {
    const saida = await passar({});
    expect(Object.entries(saida).filter(([, v]) => v !== undefined)).toEqual([]);
  });

  it("observacoes: null chega como null", async () => {
    const saida = await passar({ observacoes: null });
    expect(saida.observacoes).toBeNull();
  });

  it("substituidoCpf: null chega como null", async () => {
    const saida = await passar({ substituidoCpf: null });
    expect(saida.substituidoCpf).toBeNull();
  });

  it("salarioAbertura: null chega como null (senão limpar o salário vira 'manter')", async () => {
    const saida = await passar({ salarioAbertura: null });
    expect(saida.salarioAbertura).toBeNull();
  });

  it("ponta a ponta: salário null pelo pipe e pelo serviço é LIMPO na vaga", async () => {
    const corpo = await passar({ salarioAbertura: null });
    const { service, escritas } = montar();
    await editar(service, corpo);
    expect(updateDaVaga(escritas)?.salarioAbertura).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// A TRILHA PELO FLUXO DO SERVIÇO (§A.6, E-1)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("trilha pelo serviço: nenhum valor de texto livre, nenhum CPF", () => {
  it("editar todo texto livre e o CPF de uma vez: a trilha tem os campos, nenhum valor", async () => {
    const { service, escritas } = montar();
    const corpo: Record<string, unknown> = {
      solicitanteNome: "Solicitante Novo Marcador",
      solicitanteTelefone: "11988887777",
      solicitanteEmail: "novo@homolog.local",
      justificativaMotivo: "Justificativa Nova Marcador",
      localTrabalho: "Local Novo Marcador",
      horarioEscala: "Escala Nova Marcador",
      cursosConhecimentos: "Cursos Novos Marcador",
      experiencia: "Experiencia Nova Marcador",
      atribuicoes: "Atribuicoes Novas Marcador",
      perfilComportamental: "Perfil Novo Marcador",
      ambiente: "Ambiente Novo Marcador",
      observacoes: "Observacoes Novas Marcador",
      nomeDivulgacao: "Nome Divulgacao Marcador",
      motivo: "Motivo Novo Marcador",
      substituidoNome: "Substituido Novo Marcador",
      substituidoCpf: CPF_NOVO,
      faixaEtaria: "Faixa Marcador",
    };
    await editar(service, corpo);
    const linhas = trilha(escritas);
    const texto = JSON.stringify(linhas);
    expect(texto).not.toContain("Marcador");
    expect(texto).not.toContain(CPF_NOVO);
    expect(texto).not.toContain(CPF_ATUAL);
    expect(texto).not.toContain("11988887777");
    expect(texto).not.toContain("11900001111");
    expect(texto).not.toContain("homolog.local");
    expect(texto).not.toContain("Pessoa Sintetica");
    for (const campo of Object.keys(corpo)) {
      const linha = linhas.find((l) => l.campo === campo);
      expect(linha, campo).toMatchObject({ de: null, para: null, valorOmitido: true });
    }
  });

  it("toda linha da trilha tem vaga, autor e um campo do CHECK", async () => {
    const { service, escritas } = montar();
    await editar(service, { dataLimite: "2026-12-01", observacoes: "x", consultorId: CONSULTOR_B, posicoesOficiais: 7 });
    const linhas = trilha(escritas);
    expect(linhas.length).toBeGreaterThanOrEqual(4);
    for (const l of linhas) {
      expect(l).toMatchObject({ vagaId: VAGA, porId: AUTOR });
      expect(VAGA_EDICAO_CAMPOS_DA_TRILHA as readonly string[]).toContain(l.campo);
      for (const k of ["de", "para"]) expect(l[k] === null || typeof l[k] === "string", k).toBe(true);
    }
  });

  it("CPF inválido do substituído é recusado sem repetir o número", async () => {
    const { service, escritas } = montar();
    const invalido = "12345678900";
    const erro = await editar(service, { substituidoCpf: invalido }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((erro as BadRequestException).getResponse())).not.toContain(invalido);
    expect(escritas).toEqual([]);
  });

  it("CAMPO_NUNCA_EDITAVEL não repete o valor tentado", async () => {
    const { service } = montar();
    const r = await negada(editar(service, { idVacancyPandape: "77777-MARCADOR" }));
    expect(r.codigo).toBe("CAMPO_NUNCA_EDITAVEL");
    expect(r.campos).toEqual(["idVacancyPandape"]);
    expect(JSON.stringify(r)).not.toContain("MARCADOR");
  });

  it("envioShortlist diferente é CAMPO_NUNCA_EDITAVEL", async () => {
    const { service } = montar();
    const r = await negada(editar(service, { envioShortlist: "2026-09-15" }));
    expect(r.campos).toEqual(["envioShortlist"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// DECISÃO 7: CONSULTOR
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("decisão 7: consultor", () => {
  it("consultor igual ao atual não gera transferência nem trilha", async () => {
    const { service, escritas } = montar();
    await editar(service, { consultorId: CONSULTOR_A, observacoes: "x" });
    expect(doTipo(escritas, getTableName(vagaConsultorTransferencias))).toEqual([]);
    expect(trilha(escritas).map((l) => l.campo)).not.toContain("consultorId");
  });

  it("consultor recusado pelo destino: nada é gravado", async () => {
    const { service, escritas } = montar();
    await expect(
      editar(service, { consultorId: "99999999-9999-9999-9999-999999999999" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(escritas).toEqual([]);
  });

  it("consultor ausente do corpo mantém o atual", async () => {
    const { service, escritas } = montar();
    await editar(service, { observacoes: "x" });
    expect(updateDaVaga(escritas)).not.toHaveProperty("consultorId");
    expect(updateDaVaga(escritas)).not.toHaveProperty("recruiterId");
  });
});
