import "reflect-metadata";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * ─ GATE DOS 6 OBRIGATORIOS DA LIBERACAO ADMISSIONAL (item 6, `tester` independente §A.38/§A.40) ─
 *
 * O REQUISITO. Na Liberacao Admissional, SEIS campos sao obrigatorios para LIBERAR: Cargo, Sexo,
 * Tipo de contrato, Data de admissao, Pacote de beneficios e Escala. Faltando qualquer um deles:
 *  . usuario COMUM: a liberacao RECUSA (400/409), com a lista dos que faltam nos ROTULOS, sem PII;
 *  . MASTER/SUPER_ADMIN sem `aceiteObrigatoriosFaltantes`: tambem RECUSA;
 *  . MASTER/SUPER_ADMIN COM `aceiteObrigatoriosFaltantes: true`: LIBERA, e grava um RASTRO
 *    consultavel (quem, quando, quais dos 6 faltavam), §A.6 (id do usuario + chaves + timestamp,
 *    nada de CPF/nome/valor).
 * As DEMAIS pendencias da esteira (Salario, Setor, Gestor/BP, Uniforme, Centro de custo) NAO travam
 * a liberacao: so os 6 travam.
 *
 * VERIFICACAO INDEPENDENTE. Este arquivo NAO escreveu o gate; o codigo de producao esta em outra
 * sessao (`aplicarLiberacao` e o DTO do `liberar`). Ele afirma o COMPORTAMENTO do requisito. Antes
 * do gate existir, os cenarios de recusa (2 e 3) FALHAM (hoje `liberar` so sinaliza a pendencia e
 * nasce a admissao); depois do gate, PASSAM. Os cenarios 1 e 5 sao guarda de nao-regressao: passam
 * antes e depois, e travam quem, ao construir o gate, barrar o que nao deve barrar.
 *
 * §A.11: sem travessao no texto. §A.6: nenhuma asercao expoe CPF/nome como esperado.
 */

const CPF_OK = "52998224725"; // digito valido (mesmo dos demais specs de liberacao)
const NOME = "Fulano Sintetico";
const CARGO = "11111111-1111-4111-8111-111111111111";

const COMUM: AuthUser = { id: "u-comum", email: "comum@ea.local", papel: "COMUM", senhaTemporaria: false };
const MASTER: AuthUser = { id: "u-master", email: "master@ea.local", papel: "MASTER", senhaTemporaria: false };
const SUPER: AuthUser = { id: "u-super", email: "super@ea.local", papel: "SUPER_ADMIN", senhaTemporaria: false };

type Opts = {
  admTipoContrato?: string | null;
  admDataAdmissao?: string | null;
  candidatoSexo?: string | null;
  /** Outras admissoes vivas do mesmo CPF (trava de duplicidade). Vazio = sem duplicata. */
  vivas?: Record<string, unknown>[];
};

/**
 * Fake do Drizzle para o caminho da `liberar`, no molde de `admissoes.duplicidade-cpf.spec.ts`.
 * O `select` sem join responde `[]` (regua vazia, catalogo vazio, vinculos vazios, grupo vazio); o
 * `select` com `leftJoin` responde `vivas` (a trava de duplicidade). Todo `insert` (na tx e no db) e
 * CAPTURADO, para as asercoes de rastro e de ausencia de PII olharem exatamente o que foi persistido.
 */
function montar(opts: Opts = {}) {
  const { admTipoContrato = null, admDataAdmissao = null, candidatoSexo = null, vivas = [] } = opts;
  const transacoes = { n: 0 };
  const inserts: unknown[] = [];
  const capturarInsert = () => ({ values: async (v: unknown) => { inserts.push(v); } });

  const selectComeco = () => {
    const from = () => {
      const comJoin: {
        leftJoin: () => typeof comJoin;
        where: (...a: unknown[]) => Promise<unknown[]>;
        limit: () => Promise<unknown[]>;
      } = {
        leftJoin: () => comJoin,
        where: async () => vivas,
        limit: async () => vivas,
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
          tipoContrato: admTipoContrato,
          dataAdmissao: admDataAdmissao,
        }),
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: NOME, cpf: CPF_OK, sexo: candidatoSexo }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    select: selectComeco,
    insert: capturarInsert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes.n += 1;
      return fn(tx);
    },
  };

  return { service: new AdmissoesService(db as never), transacoes, inserts };
}

/** DTO base: passa por tudo que NAO e o gate dos 6 (CPF valido, uniforme respondido, sem duplicata). */
const base = { codCliente: "100", cargoId: CARGO, uniforme: { possui: false } };

/** DTO com os 6 obrigatorios preenchidos pela tela. */
const seisCompletos = {
  ...base,
  sexo: "MASCULINO" as const,
  tipoContrato: "Interno",
  dataAdmissao: "2026-10-01",
  pacoteBeneficios: [{ beneficioId: "b1" }],
  vagaFolha: { escala: "12x36" },
};

describe("Liberacao Admissional: gate dos 6 obrigatorios (item 6)", () => {
  // ── Cenario 1: os 6 preenchidos liberam normal, nascendo as frentes (guarda de nao-regressao) ──
  it("com os 6 preenchidos, LIBERA e nasce as frentes (como hoje)", async () => {
    const { service, transacoes, inserts } = montar();

    const r = await service.liberar("a1", seisCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
    // Nascimento paralelo (regra 1 / F12): um insert de frentes, com `tipo` em cada linha.
    const nasceuFrentes = inserts.some(
      (v) => Array.isArray(v) && v.length >= 2 && v.every((x) => x && typeof x === "object" && "tipo" in x),
    );
    expect(nasceuFrentes).toBe(true);
  });

  // ── Cenario 2: COMUM faltando algum dos 6 RECUSA, com a lista nos rotulos, sem PII ──
  it("COMUM faltando 5 dos 6: RECUSA (400/409), lista os rotulos, sem PII, nada nasce", async () => {
    // Faltam Sexo, Tipo de contrato, Data de admissao, Pacote de beneficios e Escala. Cargo presente.
    const { service, inserts } = montar();

    const err = await service.liberar("a1", base, COMUM).catch((e: Error) => e);

    // RBAC-fail do COMUM e 403 ForbiddenException (refinamento do coordenador: papel primeiro,
    // independente do flag). A recusa por FALTA de aceite (Master/Super) segue 409. Aceitos os tres.
    expect(
      err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException,
    ).toBe(true);
    const corpo = JSON.stringify((err as BadRequestException).getResponse());
    // A lista dos que faltam, pelos ROTULOS (nao pelas chaves canonicas).
    for (const rotulo of ["Sexo", "Tipo de contrato", "Data de admissão", "Pacote de benefícios", "Escala"]) {
      expect(corpo).toContain(rotulo);
    }
    // §A.6: a recusa nao repete CPF nem nome do candidato.
    expect(corpo).not.toContain(CPF_OK);
    expect(corpo).not.toContain(NOME);
    // Nada foi persistido com a autoria do usuario (a admissao nao nasceu).
    expect(JSON.stringify(inserts)).not.toContain(COMUM.id);
  });

  it("COMUM: o aceite NAO abre excecao para ele (segue recusando mesmo com o flag)", async () => {
    const { service } = montar();

    const err = await service
      .liberar("a1", { ...base, aceiteObrigatoriosFaltantes: true } as never, COMUM)
      .catch((e: Error) => e);

    // COMUM nao escapa nem com o flag: 403 ForbiddenException (papel checado antes do aceite).
    expect(
      err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException,
    ).toBe(true);
  });

  // ── Cenario 3: MASTER/SUPER sem aceite, faltando algum, tambem RECUSA ──
  it("MASTER faltando algum, SEM aceite: RECUSA (o gate nao e so para COMUM)", async () => {
    const { service } = montar();

    const err = await service.liberar("a1", base, MASTER).catch((e: Error) => e);

    expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
    const corpo = JSON.stringify((err as BadRequestException).getResponse());
    expect(corpo).toContain("Escala");
    expect(corpo).not.toContain(CPF_OK);
  });

  it("SUPER_ADMIN faltando algum, SEM aceite: tambem RECUSA", async () => {
    const { service } = montar();

    const err = await service.liberar("a1", base, SUPER).catch((e: Error) => e);

    expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
  });

  // ── Cenario 4: MASTER/SUPER COM aceite, faltando algum, LIBERA e grava o rastro sem PII ──
  it("MASTER COM aceite, faltando algum: LIBERA (nasce a admissao)", async () => {
    const { service, transacoes } = montar();

    const r = await service.liberar("a1", { ...base, aceiteObrigatoriosFaltantes: true } as never, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("o aceite grava um RASTRO com a AUTORIA e SEM PII (§A.6: id do usuario, nunca CPF/nome)", async () => {
    const { service, inserts } = montar();

    await service.liberar("a1", { ...base, aceiteObrigatoriosFaltantes: true } as never, MASTER);

    const persistido = JSON.stringify(inserts);
    // Quem: o id do usuario que aceitou aparece no que foi persistido (a autoria do rastro).
    expect(persistido).toContain(MASTER.id);
    // §A.6: o rastro nao carrega CPF nem nome do candidato.
    expect(persistido).not.toContain(CPF_OK);
    expect(persistido).not.toContain(NOME);
  });

  // ── Cenario 5: as DEMAIS pendencias nao travam. So os 6 travam. ──
  it("os 6 presentes e SO as demais faltando (Salario, Setor, Gestor/BP, Centro de custo): LIBERA", async () => {
    const { service, transacoes } = montar();

    // vagaFolha traz so a Escala (um dos 6). Salario, Setor, Gestor/BP e Centro de custo ausentes.
    const r = await service.liberar("a1", seisCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("Sexo herdado do candidato (sem dto.sexo) conta como preenchido: nao trava", async () => {
    const { service, transacoes } = montar({ candidatoSexo: "FEMININO" });

    // Os outros 5 vem no dto; o Sexo ja esta no candidato. O gate nao deve cobrar o que ja existe.
    const dto = {
      ...base,
      tipoContrato: "Interno",
      dataAdmissao: "2026-10-01",
      pacoteBeneficios: [{ beneficioId: "b1" }],
      vagaFolha: { escala: "12x36" },
    };
    const r = await service.liberar("a1", dto, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  // ── O que exige contrato/DB real, deixado como TODO honesto para o coordenador ──
  it.todo(
    "o rastro e CONSULTAVEL (endpoint/tabela de trilha) com quem+quando+quais dos 6: exige a tabela real e um leitor, fora do fake puro",
  );
  it.todo(
    "o rastro registra as CHAVES canonicas exatas dos campos que faltavam (SEXO, ESCALA, ...): depende do contrato do log que a outra sessao definir",
  );
});
