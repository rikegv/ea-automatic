import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import type { AuthUser } from "../auth/auth.types";
import {
  bancoFingido,
  linhaFingida,
  usuarioFingido,
} from "../as/candidatos/fronteira-encerrada.tester-fake";
import { asCandidaturas } from "../db/schema";

/**
 * ─ O GANCHO DO ENVIO DO LINK NA LIBERAÇÃO, COBERTURA DE COMPORTAMENTO (`tester` §A.38/§A.40) ────
 *
 * O IRMÃO DE COMPORTAMENTO do `candidatos.envio-do-link.tester.spec.ts` (que é de COLOCAÇÃO). Aqui o
 * serviço REAL roda contra um dublê, e o que se prova é o requisito, não o texto:
 *
 *   (a) `AdmissoesService.liberar` chama `enviarParaAdmissao(admissaoId, autorId, "AUTOMATICO")`
 *       DEPOIS de liberar (admissão EM_ADMISSAO, frentes criadas).
 *   (b) um `enviarParaAdmissao` que LANÇA não derruba `liberar`.
 *   (c) um `enviarParaAdmissao` que devolve `enviado:false` também não derruba.
 *   (d) `CandidatosService.registrarSaida` cria a pré-admissão + grava `admissao_id` e NÃO emite.
 *   (e) `liberarEmLote` (Alto Volume) TAMBÉM emite, best-effort (comportamento provado em
 *       `admissoes.liberar-lote.spec.ts`; aqui cobrimos a liberação individual).
 *
 * §A.6: todo CPF/e-mail que circula é sintético (família reservada, verificador válido), e as
 * asserções de log provam que, na falha, só sai o CÓDIGO do motivo ou o NOME do erro, nunca PII.
 *
 * ┌─ POR QUE O DUBLÊ DO PORTAL É LIGADO PELO CONSTRUTOR ─────────────────────────────────────────┐
 * │ `portalEnvio` é o QUARTO parâmetro, `@Optional()`, de `AdmissoesService`. Scripts de carga e a │
 * │ maioria das specs constroem `new AdmissoesService(db)` sem ele, e aí o gancho da liberação     │
 * │ (`if (this.portalEnvio)`) NUNCA roda. Este arquivo injeta o dublê na posição 4, que é          │
 * │ exatamente o que o Nest faz, para o ramo do envio de fato executar.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const CPF_OK = "52998224725"; // dígito válido (mesmo dos demais specs de liberação)
const NOME = "Fulano Sintetico";
const EMAIL_SINTETICO = "fulano.detal@exemplo-sintetico.test";
const CARGO = "11111111-1111-4111-8111-111111111111";
const MASTER: AuthUser = {
  id: "u-master",
  email: "master@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};

/** DTO com os SETE obrigatórios da liberação preenchidos: o caminho passa reto até o gancho. */
const seteCompletos = {
  codCliente: "100",
  cargoId: CARGO,
  uniforme: { possui: false },
  sexo: "MASCULINO" as const,
  tipoContrato: "Interno",
  dataAdmissao: "2026-10-01",
  pacoteBeneficios: [{ beneficioId: "b1" }],
  vagaFolha: { escala: "12x36", salarioUnidade: "MENSAL" },
};

/** Nasceram as frentes (AUDITORIA+EXAME, regra 1): o insert do array com `tipo` em cada linha. */
function nasceuFrentes(inserts: unknown[]): boolean {
  return inserts.some(
    (v) =>
      Array.isArray(v) &&
      v.length >= 2 &&
      v.every((x) => x && typeof x === "object" && "tipo" in (x as object)),
  );
}

/**
 * Fake do Drizzle para o caminho feliz da `liberar`, no molde de
 * `admissoes.liberar-obrigatorios.tester.spec.ts`. O `select` sem join responde `[]` (régua, catálogo,
 * vínculos, grupo); com `leftJoin` responde `[]` (sem duplicata de CPF). Todo `insert` é capturado.
 * O `portalEnvio` entra na QUARTA posição do construtor, e o logger é substituído por um coletor para
 * as asserções de §A.6 e para não poluir a saída do teste.
 */
function montar(portalEnvio?: unknown) {
  const inserts: unknown[] = [];
  const logs: string[] = [];
  const capturarInsert = () => ({
    values: async (v: unknown) => {
      inserts.push(v);
    },
  });

  const selectComeco = () => {
    const from = () => {
      const comJoin: {
        leftJoin: () => typeof comJoin;
        where: (...a: unknown[]) => Promise<unknown[]>;
        limit: () => Promise<unknown[]>;
      } = {
        leftJoin: () => comJoin,
        where: async () => [],
        limit: async () => [],
      };
      return { ...comJoin, where: async () => [], limit: async () => [] };
    };
    return { from };
  };

  const tx = {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: capturarInsert,
    select: () => ({ from: () => ({ where: async () => [] }) }),
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
      candidatos: {
        findFirst: async () => ({ nome: NOME, cpf: CPF_OK, sexo: "MASCULINO", email: EMAIL_SINTETICO }),
      },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    select: selectComeco,
    insert: capturarInsert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  const service = new AdmissoesService(db as never, undefined, undefined, portalEnvio as never);
  (service as any).logger = {
    warn: (m: unknown) => logs.push(String(m)),
    error: (m: unknown) => logs.push(String(m)),
    log: () => {},
    debug: () => {},
    verbose: () => {},
  };

  return { service, inserts, logs };
}

describe("(a) o envio dispara na liberação, com origem AUTOMATICO e depois de liberar", () => {
  it("liberar chama enviarParaAdmissao(admissaoId, autorId, AUTOMATICO) uma vez, e as frentes nascem", async () => {
    const portal = { enviarParaAdmissao: vi.fn().mockResolvedValue({ enviado: true }) };
    const { service, inserts } = montar(portal);

    const r = await service.liberar("a1", seteCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    // A LIBERAÇÃO ACONTECEU de fato antes do aviso: sem esta linha o teste passaria num caminho que
    // nem chegou a liberar.
    expect(nasceuFrentes(inserts)).toBe(true);
    expect(portal.enviarParaAdmissao).toHaveBeenCalledTimes(1);
    expect(portal.enviarParaAdmissao).toHaveBeenCalledWith("a1", MASTER.id, "AUTOMATICO");
  });

  it("sem portalEnvio injetado, liberar funciona igual (o aviso é OPCIONAL, @Optional)", async () => {
    const { service, inserts } = montar(undefined);

    const r = await service.liberar("a1", seteCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(nasceuFrentes(inserts)).toBe(true);
  });
});

describe("(b) enviarParaAdmissao que LANÇA não derruba a liberação", () => {
  it("a liberação conclui (admissão EM_ADMISSAO, frentes criadas) mesmo com o envio lançando", async () => {
    const portal = {
      enviarParaAdmissao: vi.fn().mockRejectedValue(new Error("correio fora do ar")),
    };
    const { service, inserts, logs } = montar(portal);

    // NÃO LANÇA: se lançasse, esta linha rejeitaria e o teste quebraria aqui.
    const r = await service.liberar("a1", seteCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(nasceuFrentes(inserts)).toBe(true);
    expect(portal.enviarParaAdmissao).toHaveBeenCalledTimes(1);
    // §A.6: no erro inesperado sai só o NOME do erro ("Error"), nunca a mensagem (que pode trazer
    // detalhe) nem PII.
    const log = logs.join("\n");
    expect(log).not.toContain("correio fora do ar");
    expect(log).not.toContain(CPF_OK);
    expect(log).not.toContain(EMAIL_SINTETICO);
  });
});

describe("(c) enviarParaAdmissao que devolve enviado:false não derruba a liberação", () => {
  it("a liberação conclui e loga só o CÓDIGO do motivo (§A.6)", async () => {
    const portal = {
      enviarParaAdmissao: vi
        .fn()
        .mockResolvedValue({ enviado: false, motivo: "SEM_DESTINATARIO" }),
    };
    const { service, inserts, logs } = montar(portal);

    const r = await service.liberar("a1", seteCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(nasceuFrentes(inserts)).toBe(true);
    const log = logs.join("\n");
    expect(log).toContain("SEM_DESTINATARIO");
    expect(log).not.toContain(CPF_OK);
    expect(log).not.toContain(EMAIL_SINTETICO);
  });
});

describe("(d) registrarSaida cria a pré-admissão + grava admissao_id, e NÃO emite", () => {
  const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;
  const ADMISSAO = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  function cenario() {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
    });
    const admissoes = {
      vivasPorCpf: vi.fn().mockResolvedValue([]),
      criarPreAdmissaoDoFunil: vi.fn().mockResolvedValue({ admissaoId: ADMISSAO, jaExistia: false }),
    };
    // O dublê do envio com TODOS os métodos que o funil poderia tocar, para a asserção de
    // não-emissão ser sobre o espião, não sobre um objeto que estouraria.
    const portalSpy = {
      enviarParaAdmissao: vi.fn(),
      enviarParaCandidaturas: vi.fn(),
      revogarLinksDaReversao: vi.fn(),
    };
    (b.service as any).admissoes = admissoes;
    (b.service as any).envioDoPortal = portalSpy;
    return { b, admissoes, portalSpy };
  }

  it("a pré-admissão nasce, a candidatura aponta para ela, e nenhum link é emitido", async () => {
    const { b, admissoes, portalSpy } = cenario();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: ENVIO, motivo: "foi para a esteira" } as never,
      usuarioFingido("COMUM") as never,
    );

    // A saída aconteceu de fato e a pré-admissão nasceu.
    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
    expect(admissoes.criarPreAdmissaoDoFunil).toHaveBeenCalledTimes(1);

    // O elo foi gravado em `as_candidaturas.admissao_id` (a metade da ponte que a tela do funil lê).
    const elo = b.updates.find(
      (u) => u.tabela === asCandidaturas && "admissaoId" in u.valores,
    );
    expect(elo?.valores.admissaoId).toBe(ADMISSAO);

    // NÃO EMITE: nenhum caminho de envio do Portal é tocado na saída do funil.
    expect(portalSpy.enviarParaAdmissao).not.toHaveBeenCalled();
    expect(portalSpy.enviarParaCandidaturas).not.toHaveBeenCalled();
  });
});
