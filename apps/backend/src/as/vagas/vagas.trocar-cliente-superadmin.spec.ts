import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AS_VAGA_CAMPOS_DA_ADMISSAO, PAPEL, type AsVagaEdicaoNegada } from "@ea/shared-types";
import {
  asCandidaturaEntrevistas,
  asCandidaturas,
  asShortlists,
  usuarios,
  vagaBeneficio,
  vagaClienteCorrecoes,
  vagaConsultorTransferencias,
  vagaEdicoes,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import { camposTravadosNaEdicao } from "../../domain/vaga-edicao";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { EditarVagaDto } from "./vagas.dto";
import { VagasEdicaoService } from "./vagas-edicao.service";
import { VagasService } from "./vagas.service";
import { AdmissoesService } from "../../admissoes/admissoes.service";

/**
 * NEUTRALIZA o recálculo do sinalizador (função de MÓDULO, não colaborador de fornecedor): ela é
 * provada sem G.I/Drive pela análise de import de `regua/sinalizador.repo`, e aqui vira no-op só para
 * o banco fingido da Decisão 4 e do gate não precisar modelar toda a leitura da régua. Não afeta o
 * que o gate mede (os colaboradores de fornecedor injetados), que são espiados à parte.
 */
vi.mock("../../regua/sinalizador.repo", () => ({
  recalcularSinalizadorDaAdmissao: vi.fn(async () => undefined),
}));

/**
 * TESTER INDEPENDENTE (§A.38, §A.40): ITEM B DA OST CENTRAL DAS VAGAS (16/10/2026, REVERSÃO).
 *
 * REQUISITO (do briefing do coordenador, não do código): o SUPER_ADMIN (e SÓ ele) pode trocar o
 * CLIENTE (`codCliente`) de uma vaga JÁ LIBERADA mesmo com candidato já enviado para a admissão. Os
 * outros oito campos de `AS_VAGA_CAMPOS_DA_ADMISSAO` seguem travados para TODOS; qualquer outro papel
 * (MASTER, consultor/COMUM, nulo) continua com os NOVE travados, inclusive `codCliente`.
 *
 * As admissões vivas NÃO cascateiam: reencaixam uma a uma por `AdmissoesService.trocarCliente`, que
 * por decisão do diretor (decisões 1, 2 e 3 da OST) NÃO pode tocar G.I nem Drive.
 *
 * ESTE SPEC É ADVERSARIAL e usa MUTATION TESTING: cada bloco diz a MUTAÇÃO que ele mata. Escrito a
 * partir do requisito e do contrato de `@ea/shared-types`, com banco FINGIDO que avalia o predicado
 * do SQL (não devolve número fixo). §A.6: CPFs sintéticos de dígito válido; marcadores de texto livre.
 */

const VAGA = "11111111-1111-1111-1111-111111111111";
const AUTOR = "22222222-2222-2222-2222-222222222222";
const CONSULTOR_A = "33333333-3333-3333-3333-333333333333";
const RECRUITER_A = "55555555-5555-5555-5555-555555555555";
const CARGO = "77777777-7777-7777-7777-777777777777";
const CARGO_2 = "88888888-8888-8888-8888-888888888888";
const CPF_ATUAL = "52998224725";
const CPF_NOVO = "11144477735";

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARTE A: `camposTravadosNaEdicao(papel)` (domínio puro, mutation testing)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("A) camposTravadosNaEdicao: só o SUPER_ADMIN perde o codCliente do conjunto travado", () => {
  const SEM_CODCLIENTE = AS_VAGA_CAMPOS_DA_ADMISSAO.filter((c) => c !== "codCliente");

  it("SUPER_ADMIN: 8 campos, EXATAMENTE os da admissão menos codCliente, sem codCliente", () => {
    const r = camposTravadosNaEdicao("SUPER_ADMIN");
    expect(r).toHaveLength(8);
    expect(r).not.toContain("codCliente");
    expect([...r].sort()).toEqual([...SEM_CODCLIENTE].sort());
    // Mutação "tira outro campo além de codCliente": os 8 restantes têm de estar todos presentes.
    for (const c of SEM_CODCLIENTE) expect(r, c).toContain(c);
  });

  // Mutação "troca 'SUPER_ADMIN' por outro papel" OU "remove o filtro": qualquer papel que NÃO seja
  // exatamente a string 'SUPER_ADMIN' mantém os NOVE, com codCliente. A grade inclui as variações de
  // grafia que uma comparação frouxa (lowercase, trim, includes) deixaria passar por engano.
  const NAO_SUPER: (string | null | undefined)[] = [
    "MASTER",
    "COMUM",
    null,
    undefined,
    "",
    "super_admin",
    "superadmin",
    "SUPERADMIN",
    "SUPER_ADMIN ",
    " SUPER_ADMIN",
    "SUPER-ADMIN",
    "ADMIN",
    "SUPER_ADMIN_X",
  ];
  for (const papel of NAO_SUPER) {
    it(`papel ${JSON.stringify(papel)}: os NOVE campos, COM codCliente`, () => {
      const r = camposTravadosNaEdicao(papel);
      expect(r).toHaveLength(AS_VAGA_CAMPOS_DA_ADMISSAO.length);
      expect(r).toContain("codCliente");
      expect([...r].sort()).toEqual([...AS_VAGA_CAMPOS_DA_ADMISSAO].sort());
    });
  }

  it("todo papel do RBAC está coberto, e só SUPER_ADMIN afrouxa (sem papel novo escapar)", () => {
    for (const papel of PAPEL) {
      const r = camposTravadosNaEdicao(papel);
      if (papel === "SUPER_ADMIN") expect(r).not.toContain("codCliente");
      else expect(r).toContain("codCliente");
    }
  });

  it("devolve uma CÓPIA: mutar o retorno não corrompe AS_VAGA_CAMPOS_DA_ADMISSAO (fonte compartilhada)", () => {
    const antes = [...AS_VAGA_CAMPOS_DA_ADMISSAO];
    const r = camposTravadosNaEdicao("MASTER");
    (r as string[]).push("INVASOR");
    (r as string[]).length = 0;
    expect([...AS_VAGA_CAMPOS_DA_ADMISSAO]).toEqual(antes);
    // E uma segunda chamada não herda a mutação da primeira.
    expect(camposTravadosNaEdicao("MASTER")).toHaveLength(AS_VAGA_CAMPOS_DA_ADMISSAO.length);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// BANCO FINGIDO PARA O SERVIÇO DA EDIÇÃO (previa/editar), com papel
// ════════════════════════════════════════════════════════════════════════════════════════════════

const dialeto = new PgDialect();
const render = (cond: unknown): { sql: string; params: unknown[] } =>
  cond ? (dialeto.sqlToQuery(cond as SQL) as { sql: string; params: unknown[] }) : { sql: "", params: [] };

interface Escrita {
  tipo: "insert" | "update" | "delete";
  tabela: string;
  valores: unknown;
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
  const pessoas: Record<string, { ativo: boolean; papelAs: string | null }> = {};

  /** Conta "enviados para a admissão" AVALIANDO o predicado do SQL (situação ENVIADO OU admissão ligada). */
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

  const leitura = () => (campos?: Record<string, unknown>) => {
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
        return Promise.resolve(
          entrevistas.filter((e) => q.params.includes(e.etapa)).map((e) => ({ id: e.id })),
        );
      }
      if (tabela === getTableName(asShortlists)) return Promise.resolve([{ n: 0 }]);
      if (tabela === getTableName(usuarios)) {
        const id = Object.keys(pessoas).find((p) => q.params.includes(p));
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
    b.for = () => resolver();
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko);
    return b;
  };

  const exec = {
    select: leitura(),
    update: (t: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: async () => {
          escritas.push({ tipo: "update", tabela: getTableName(t as never), valores });
          if (getTableName(t as never) === getTableName(vagas)) Object.assign(vaga, valores);
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: async (valores: unknown) => {
        escritas.push({ tipo: "insert", tabela: getTableName(t as never), valores });
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
          escritas.push({ tipo: "delete", tabela, valores: apagados.map((a) => a.id) });
          return apagados;
        };
        return {
          returning: async () => apagar(),
          then: (ok: (v: unknown) => unknown) => Promise.resolve(apagar()).then(() => ok(undefined)),
        };
      },
    }),
  };

  const db = { ...exec, transaction: async (fn: (t: typeof exec) => Promise<unknown>) => fn(exec) };

  const etapas = catalogoDeEtapasFingido();
  const status = catalogoDeStatusFingido();
  const vagasService = new VagasService(db as never, etapas as never, status as never);
  const exigirCliente = vi.spyOn(vagasService, "exigirClienteExistente").mockResolvedValue(undefined);
  vi.spyOn(vagasService, "resolverCidade").mockResolvedValue(null);
  vi.spyOn(vagasService, "resolverLinhaServico").mockImplementation(async (id) => id ?? null);

  const service = new VagasEdicaoService(db as never, vagasService, etapas as never, status as never);
  return { service, vaga, escritas, exigirCliente, entrevistasRestantes: () => entrevistas };
}

const doTipo = (escritas: Escrita[], tabela: string, tipo?: Escrita["tipo"]) =>
  escritas.filter((e) => e.tabela === tabela && (!tipo || e.tipo === tipo));

async function negada(p: Promise<unknown>): Promise<AsVagaEdicaoNegada> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ConflictException);
    return (e as ConflictException).getResponse() as AsVagaEdicaoNegada;
  }
  throw new Error("esperava 409 (ConflictException)");
}

const editar = (s: VagasEdicaoService, dto: Record<string, unknown>, papel?: string | null) =>
  s.editar(VAGA, dto as unknown as EditarVagaDto, AUTOR, papel);

const ENVIADO: Candidatura = { id: "cand-env", situacao: "ENVIADO_PARA_ADMISSAO", posicaoLado: "OFICIAL" };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARTE B: `previa(id, papel)`: o campo camposTravadosPelaAdmissao segue o papel
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("B) previa: camposTravadosPelaAdmissao depende do papel quando há gente enviada", () => {
  it("enviados>0 + SUPER_ADMIN: trava os 8 campos, SEM codCliente", async () => {
    const { service } = montar({ candidaturas: [ENVIADO] });
    const p = await service.previa(VAGA, "SUPER_ADMIN");
    expect(p.enviadosParaAdmissao).toBe(1);
    expect(p.camposTravadosPelaAdmissao).toHaveLength(8);
    expect(p.camposTravadosPelaAdmissao).not.toContain("codCliente");
  });

  for (const papel of ["MASTER", "COMUM", null, undefined] as const) {
    it(`enviados>0 + ${JSON.stringify(papel)}: trava os 9 campos, COM codCliente`, async () => {
      const { service } = montar({ candidaturas: [ENVIADO] });
      const p = await service.previa(VAGA, papel);
      expect(p.enviadosParaAdmissao).toBe(1);
      expect([...p.camposTravadosPelaAdmissao].sort()).toEqual([...AS_VAGA_CAMPOS_DA_ADMISSAO].sort());
      expect(p.camposTravadosPelaAdmissao).toContain("codCliente");
    });
  }

  it("enviados=0: SEMPRE vazio, inclusive para SUPER_ADMIN (o afrouxamento só existe com a fronteira ativa)", async () => {
    for (const papel of ["SUPER_ADMIN", "MASTER", "COMUM", null] as const) {
      const { service } = montar({ candidaturas: [] });
      const p = await service.previa(VAGA, papel);
      expect(p.enviadosParaAdmissao).toBe(0);
      expect(p.camposTravadosPelaAdmissao, JSON.stringify(papel)).toEqual([]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARTE C: `editar` passo 5: a fronteira A&S/ADM por papel
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("C) editar passo 5: só o SUPER_ADMIN atravessa a fronteira trocando o cliente", () => {
  it("SUPER_ADMIN troca o cliente com gente enviada: NÃO recusa, segue ao passo 6 e grava vaga_cliente_correcoes", async () => {
    const { service, escritas } = montar({ candidaturas: [ENVIADO] });
    const r = await editar(service, { codCliente: "C002" }, "SUPER_ADMIN");
    expect(r).toEqual({ vagaId: VAGA, camposAlterados: 1, entrevistasRemovidas: 0 });
    const correcao = doTipo(escritas, getTableName(vagaClienteCorrecoes));
    expect(correcao).toHaveLength(1);
    expect(correcao[0]!.valores).toMatchObject({
      vagaId: VAGA,
      deCodCliente: "C001",
      paraCodCliente: "C002",
      porId: AUTOR,
    });
    // E o update da vaga de fato troca o codCliente (o afrouxamento não é só "não recusar").
    expect(doTipo(escritas, getTableName(vagas), "update")[0]!.valores).toMatchObject({ codCliente: "C002" });
  });

  for (const papel of ["MASTER", "COMUM", null, undefined] as const) {
    it(`${JSON.stringify(papel)} troca o cliente com gente enviada: CAMPO_DA_ADMISSAO com [codCliente], sem escrita`, async () => {
      const { service, escritas } = montar({ candidaturas: [ENVIADO] });
      const r = await negada(editar(service, { codCliente: "C002" }, papel));
      expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
      expect(r.campos).toEqual(["codCliente"]);
      expect(escritas).toEqual([]);
      // §A.6: a recusa não repete o valor do cliente nem qualquer marcador de texto livre.
      expect(JSON.stringify(r)).not.toContain("Marcador");
    });
  }

  it("SUPER_ADMIN AINDA é recusado em QUALQUER um dos outros 8 campos, um a um", async () => {
    const MUDANCA: Record<string, Record<string, unknown>> = {
      cargoId: { cargoId: CARGO_2 },
      salarioAbertura: { salarioAbertura: "1800.00" },
      horarioEscala: { horarioEscala: "12x36" },
      tempoContrato: { tempoContrato: "180" },
      motivo: { motivo: "Aumento De Quadro" },
      substituidoNome: { substituidoNome: "Outra Pessoa Sintetica" },
      substituidoCpf: { substituidoCpf: CPF_NOVO },
      localTrabalho: { localTrabalho: "Local Novo Marcador" },
    };
    // O mapa deste teste cobre os 8 que seguem travados (a lista menos codCliente): lista nova sem teste falha aqui.
    expect(Object.keys(MUDANCA).sort()).toEqual(
      [...AS_VAGA_CAMPOS_DA_ADMISSAO].filter((c) => c !== "codCliente").sort(),
    );
    for (const campo of Object.keys(MUDANCA)) {
      const { service, escritas } = montar({ candidaturas: [ENVIADO] });
      const r = await negada(editar(service, MUDANCA[campo]!, "SUPER_ADMIN"));
      expect(r.codigo, campo).toBe("CAMPO_DA_ADMISSAO");
      expect(r.campos, campo).toEqual([campo]);
      expect(escritas, campo).toEqual([]);
      const texto = JSON.stringify(r);
      expect(texto).not.toContain(CPF_NOVO);
      expect(texto).not.toContain("Marcador");
    }
  });

  it("SUPER_ADMIN trocando cliente E cargo: passa o cliente mas BLOQUEIA por [cargoId] (codCliente fora da recusa)", async () => {
    const { service, escritas } = montar({ candidaturas: [ENVIADO] });
    const r = await negada(editar(service, { codCliente: "C002", cargoId: CARGO_2 }, "SUPER_ADMIN"));
    expect(r.codigo).toBe("CAMPO_DA_ADMISSAO");
    expect(r.campos).toEqual(["cargoId"]);
    expect(r.campos).not.toContain("codCliente");
    expect(escritas).toEqual([]);
  });

  it("sem gente enviada: até o COMUM troca o cliente (a fronteira é o que trava, não o papel sozinho)", async () => {
    const { service, escritas } = montar({ candidaturas: [] });
    const r = await editar(service, { codCliente: "C002" }, "COMUM");
    expect(r.camposAlterados).toBe(1);
    expect(doTipo(escritas, getTableName(vagaClienteCorrecoes))).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARTE D(i): GATE ANTI-FORNECEDOR: a troca de cliente NA VAGA não dispara G.I nem Drive
// ════════════════════════════════════════════════════════════════════════════════════════════════

const CAMINHO_EDICAO = join(__dirname, "vagas-edicao.service.ts");
const CAMINHO_ADMISSOES = join(__dirname, "../../admissoes/admissoes.service.ts");

/** Importar de um módulo de G.I, Drive, Clicksign, fila do Pandapé ou Portal, por `from "..."`. */
const IMPORT_FORNECEDOR = /from\s+["'][^"']*\/(gi|drive|clicksign)\//i;

describe("D.i) editar: nenhum caminho da edição da vaga alcança G.I nem Drive", () => {
  it("o serviço de edição não IMPORTA nada de G.I, Drive, Clicksign, fila do Pandapé nem Portal", () => {
    const fonte = readFileSync(CAMINHO_EDICAO, "utf8");
    const linhasImport = fonte.split("\n").filter((l) => /^\s*import\b/.test(l));
    for (const l of linhasImport) {
      expect(l, l).not.toMatch(/\/(gi|drive|clicksign|pandape|portal)\b/i);
    }
  });

  it("a troca de cliente do SUPER_ADMIN só escreve em tabelas DE VAGA (nenhuma tabela de G.I/Drive)", async () => {
    const PERMITIDAS = new Set<string>(
      [
        vagas,
        vagaEdicoes,
        vagaClienteCorrecoes,
        vagaConsultorTransferencias,
        vagaMetaReducoes,
        vagaBeneficio,
        asCandidaturaEntrevistas,
      ].map((t) => getTableName(t)),
    );
    const { service, escritas } = montar({
      candidaturas: [ENVIADO],
      entrevistas: [{ id: "e1", candidaturaId: "cand-env", etapa: "ENTREVISTA_CLIENTE" }],
    });
    await editar(service, { codCliente: "C002", confirmarTrocaDeCliente: true }, "SUPER_ADMIN");
    expect(escritas.length).toBeGreaterThan(0);
    for (const e of escritas) expect(PERMITIDAS.has(e.tabela), `${e.tipo} ${e.tabela}`).toBe(true);
    // A troca apaga a entrevista com o cliente antigo (decisão 2), e isso é tudo o que ela "propaga".
    expect(doTipo(escritas, getTableName(asCandidaturaEntrevistas), "delete")).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARTE D(ii): GATE ANTI-FORNECEDOR: AdmissoesService.trocarCliente não toca G.I/fila/Drive/Clicksign
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("D.ii) AdmissoesService.trocarCliente: zero toque em G.I, Drive, Clicksign, fila e Portal", () => {
  it("o módulo admissoes.service NÃO importa de nenhum diretório de G.I, Drive nem Clicksign", () => {
    const fonte = readFileSync(CAMINHO_ADMISSOES, "utf8");
    const linhasImport = fonte.split("\n").filter((l) => /^\s*import\b/.test(l));
    for (const l of linhasImport) expect(l, l).not.toMatch(IMPORT_FORNECEDOR);
  });

  it("o CORPO do método não invoca nenhum colaborador de fornecedor (inspeção do método compilado)", () => {
    const corpo = AdmissoesService.prototype.trocarCliente.toString();
    // Sanidade: a inspeção pegou o método certo (ele referencia seus colaboradores legítimos).
    expect(corpo).toContain("transaction");
    expect(corpo).toContain("recalcularSinalizadorDaAdmissao");
    // Nenhum colaborador de fornecedor é acionado no corpo (identificadores, não substrings frágeis).
    const PROIBIDOS = [
      "pandapeQueue",
      "portalEnvio",
      "portalLinkRetry",
      "reguaCompletude",
      "enfileirar",
      "GiApi",
      "EnviarParaGi",
      "clicksign",
      "Clicksign",
      "Envelope",
      "arquivarAssinado",
    ];
    for (const p of PROIBIDOS) expect(corpo, p).not.toContain(p);
  });

  it("rodando o método ponta a ponta com espiões, NENHUM colaborador de fornecedor recebe chamada", async () => {
    // Espião que registra QUALQUER acesso a método, para o teste provar ZERO chamadas.
    const fazerEspiao = () => {
      const chamadas: string[] = [];
      const proxy = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "then" || typeof prop === "symbol") return undefined;
            return (..._a: unknown[]) => {
              chamadas.push(String(prop));
              return undefined;
            };
          },
        },
      );
      return { proxy, chamadas };
    };
    const pandapeQueue = fazerEspiao();
    const reguaCompletude = fazerEspiao();
    const portalEnvio = fazerEspiao();
    const portalLinkRetry = fazerEspiao();

    // Banco fingido mínimo: só o que `trocarCliente` lê/escreve diretamente. As duas funções puras
    // que ele chama (`carimboDoGrupo`, `recalcularSinalizadorDaAdmissao`) são provadas sem fornecedor
    // pela análise de import, e aqui são neutralizadas por mock para isolar o gate.
    const escritas: { tabela: string; tipo: string }[] = [];
    const adm = {
      id: VAGA,
      codCliente: "C001",
      cargoId: CARGO,
      candidatoCpf: CPF_ATUAL,
      farolGlobal: "EM_ADMISSAO",
    };
    const selectPorTabela = () => {
      let nome = "";
      const b: Record<string, unknown> = {};
      const rows = (): unknown[] => {
        if (nome === "frentes_admissao") return [{ tipo: "AUDITORIA", concluida: false }];
        if (nome === "clientes") return [{ codCliente: "C002", razaoSocial: "Cliente Novo Sintetico" }];
        if (nome === "cargos") return [{ id: CARGO_2, nome: "Cargo Novo" }];
        if (nome === "regua_documental") return [{ n: 1 }];
        return [];
      };
      b.from = (t: unknown) => {
        nome = getTableName(t as never);
        return b;
      };
      b.where = () => b;
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve(rows()).then(ok);
      return b;
    };
    const txExec = {
      update: (t: unknown) => ({
        set: () => ({
          where: async () => {
            escritas.push({ tabela: getTableName(t as never), tipo: "update" });
          },
        }),
      }),
      insert: (t: unknown) => ({
        values: async () => {
          escritas.push({ tabela: getTableName(t as never), tipo: "insert" });
        },
      }),
    };
    const db = {
      query: { admissoes: { findFirst: async () => ({ ...adm }) } },
      select: () => selectPorTabela(),
      transaction: async (fn: (t: typeof txExec) => Promise<unknown>) => fn(txExec),
    };

    const service = new AdmissoesService(
      db as never,
      pandapeQueue.proxy as never,
      reguaCompletude.proxy as never,
      portalEnvio.proxy as never,
      portalLinkRetry.proxy as never,
    );

    const r = await service.trocarCliente(
      VAGA,
      { codCliente: "C002", cargoId: CARGO_2 },
      { id: AUTOR, papel: "SUPER_ADMIN" } as never,
    );
    expect(r.ok).toBe(true);
    // Escreveu onde devia (admissão + trilha), e NENHUM espião de fornecedor foi tocado.
    expect(escritas.some((e) => e.tabela === "admissoes" && e.tipo === "update")).toBe(true);
    expect(pandapeQueue.chamadas, "pandapeQueue").toEqual([]);
    expect(reguaCompletude.chamadas, "reguaCompletude").toEqual([]);
    expect(portalEnvio.chamadas, "portalEnvio").toEqual([]);
    expect(portalLinkRetry.chamadas, "portalLinkRetry").toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// PARTE (DECISÃO 4): trocarCliente recusa graciosamente, SEM afetar outras admissões
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("Decisão 4) trocarCliente: recusa graciosa por admissão, sem cascata", () => {
  /** Monta um AdmissoesService com um banco mínimo, parametrizado pelo cenário da admissão/par. */
  function montarAdmissoes(opts: {
    frentes: { tipo: string; concluida: boolean }[];
    temRegua: boolean;
    admSobrepoe?: Partial<{ codCliente: string; cargoId: string }>;
  }) {
    const escritas: { tabela: string; tipo: string }[] = [];
    const adm = {
      id: VAGA,
      codCliente: opts.admSobrepoe?.codCliente ?? "C001",
      cargoId: opts.admSobrepoe?.cargoId ?? CARGO,
      candidatoCpf: CPF_ATUAL,
      farolGlobal: "EM_ADMISSAO",
    };
    const selectPorTabela = () => {
      let nome = "";
      const b: Record<string, unknown> = {};
      const rows = (): unknown[] => {
        if (nome === "frentes_admissao") return opts.frentes.map((f) => ({ ...f }));
        if (nome === "clientes") return [{ codCliente: "C002", razaoSocial: "Cliente Novo Sintetico" }];
        if (nome === "cargos") return [{ id: CARGO_2, nome: "Cargo Novo" }];
        if (nome === "regua_documental") return [{ n: opts.temRegua ? 1 : 0 }];
        return [];
      };
      b.from = (t: unknown) => {
        nome = getTableName(t as never);
        return b;
      };
      b.where = () => b;
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve(rows()).then(ok);
      return b;
    };
    const txExec = {
      update: (t: unknown) => ({ set: () => ({ where: async () => { escritas.push({ tabela: getTableName(t as never), tipo: "update" }); } }) }),
      insert: (t: unknown) => ({ values: async () => { escritas.push({ tabela: getTableName(t as never), tipo: "insert" }); } }),
    };
    const db = {
      query: { admissoes: { findFirst: async () => ({ ...adm }) } },
      select: () => selectPorTabela(),
      transaction: async (fn: (t: typeof txExec) => Promise<unknown>) => fn(txExec),
    };
    const service = new AdmissoesService(db as never);
    return { service, escritas };
  }

  it("as TRÊS frentes concluídas: recusa (ConflictException), sem escrever nada", async () => {
    const { service, escritas } = montarAdmissoes({
      frentes: [
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: true },
        { tipo: "CADASTRO_CONTRATO", concluida: true },
      ],
      temRegua: true,
    });
    await expect(
      service.trocarCliente(VAGA, { codCliente: "C002", cargoId: CARGO_2 }, { id: AUTOR, papel: "SUPER_ADMIN" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toEqual([]);
  });

  it("par NOVO sem régua documental: recusa (ConflictException), sem escrever nada", async () => {
    const { service, escritas } = montarAdmissoes({
      frentes: [{ tipo: "AUDITORIA", concluida: false }],
      temRegua: false,
    });
    await expect(
      service.trocarCliente(VAGA, { codCliente: "C002", cargoId: CARGO_2 }, { id: AUTOR, papel: "SUPER_ADMIN" } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toEqual([]);
  });

  it("admissão viva com régua do par novo: troca aplicada SÓ nesta admissão (update em admissoes, uma vez)", async () => {
    const { service, escritas } = montarAdmissoes({
      frentes: [
        { tipo: "AUDITORIA", concluida: true },
        { tipo: "EXAME", concluida: false },
      ],
      temRegua: true,
    });
    const r = await service.trocarCliente(
      VAGA,
      { codCliente: "C002", cargoId: CARGO_2 },
      { id: AUTOR, papel: "SUPER_ADMIN" } as never,
    );
    expect(r.ok).toBe(true);
    // Independência por-admissão: o método opera por `id` e escreve só na própria admissão + trilha.
    const updatesAdmissao = escritas.filter((e) => e.tabela === "admissoes" && e.tipo === "update");
    expect(updatesAdmissao).toHaveLength(1);
  });
});
