import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Papel } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import {
  notificacoes,
  solicitacaoMensagens,
  solicitacoes as solicitacoesTabela,
} from "../db/schema";
import { SolicitacoesService } from "./solicitacoes.service";

/**
 * ─ O SERVICE DAS SOLICITAÇÕES (cobertura independente, §A.38) ───────────────────────────────────
 *
 * O banco é FINGIDO e CAPTURA as escritas, porque os requisitos desta frente SÃO escritas: a
 * solicitação nasce NOVO e com o solicitante certo (req.2); a ação da gestão gera UMA mensagem da
 * gestão e UMA notificação para o SOLICITANTE, com a rota da tela (req.5). Um fake que só devolvesse
 * linhas prontas não conseguiria provar nenhuma das duas. Aqui o fake grava cada insert/update num
 * registro inspecionável, e devolve o mínimo para o service completar (o `detalhe` no fim do fluxo).
 *
 * §A.6: fixtures sem PII de candidato; ids técnicos e nomes de usuário interno.
 */

const NOME = Symbol.for("drizzle:Name");
const nomeDaTabela = (t: unknown): string => String((t as Record<symbol, string>)[NOME]);

interface Escrita {
  tabela: string;
  valores: Record<string, unknown>;
}

interface CenarioFake {
  /** O que o SELECT de `solicitacoes` devolve (o alvo/cabeçalho). `[]` para "não existe". */
  solicitacao?: Record<string, unknown> | null;
}

/**
 * Banco fingido, chainable e thenable, no molde dos `*.tester-fake` da casa. Captura inserts e
 * updates; os selects devolvem o cenário; a transação roda com o próprio fake como `tx`.
 */
function bancoFake(cenario: CenarioFake) {
  const inserts: Escrita[] = [];
  const updates: Escrita[] = [];

  const selectBuilder = () => {
    let fromT = "";
    const b: Record<string, unknown> = {
      from(t: unknown) {
        fromT = nomeDaTabela(t);
        return b;
      },
      innerJoin: () => b,
      leftJoin: () => b,
      where: () => b,
      orderBy: () => b,
      limit: () => b,
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        let linhas: unknown[] = [];
        if (fromT === nomeDaTabela(solicitacoesTabela)) {
          linhas = cenario.solicitacao ? [cenario.solicitacao] : [];
        } else if (fromT === nomeDaTabela(solicitacaoMensagens)) {
          linhas = [];
        }
        return Promise.resolve(linhas).then(res, rej);
      },
    };
    return b;
  };

  const insertBuilder = (t: unknown) => {
    const tabela = nomeDaTabela(t);
    const b: Record<string, unknown> = {
      values(v: Record<string, unknown>) {
        inserts.push({ tabela, valores: v });
        return b;
      },
      returning() {
        // A criação lê o id da solicitação recém-inserida.
        return Promise.resolve([{ id: "sol-1" }]);
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve([]).then(res, rej);
      },
    };
    return b;
  };

  const updateBuilder = (t: unknown) => {
    const tabela = nomeDaTabela(t);
    let setVals: Record<string, unknown> = {};
    const b: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        setVals = v;
        return b;
      },
      where: () => b,
      returning() {
        updates.push({ tabela, valores: setVals });
        return Promise.resolve([{ id: "sol-1" }]);
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        updates.push({ tabela, valores: setVals });
        return Promise.resolve([]).then(res, rej);
      },
    };
    return b;
  };

  const db: Record<string, unknown> = {
    select: () => selectBuilder(),
    insert: (t: unknown) => insertBuilder(t),
    update: (t: unknown) => updateBuilder(t),
    transaction: (cb: (tx: unknown) => unknown) => cb(db),
  };

  return { db, inserts, updates };
}

/** Constrói o service com o fake e dependências inertes (sem Drive, §A.6 placeholder). */
function montar(cenario: CenarioFake) {
  const { db, inserts, updates } = bancoFake(cenario);
  const ai = {} as never;
  const staging = {} as never;
  const config = { get: () => "" } as never; // sem SOLICITACOES_DRIVE_PARENT_ID: arquivamento inerte
  const service = new SolicitacoesService(db as never, ai, staging, config);
  return { service, inserts, updates };
}

const usuario = (id: string, papel: Papel): AuthUser => ({
  id,
  email: `${id}@homolog.local`,
  papel,
  senhaTemporaria: false,
});

const T_SOL = nomeDaTabela(solicitacoesTabela);
const T_MSG = nomeDaTabela(solicitacaoMensagens);
const T_NOTIF = nomeDaTabela(notificacoes);

const PAR_VALIDO = { menuCodigo: "esteira-admissional", submenu: "Auditoria" };
const DESCRICAO = "x".repeat(60);
const fakeFile = { mimetype: "image/png", originalname: "print.png", buffer: Buffer.from("x") } as Express.Multer.File;

describe("criar: guardas de domínio (req.1)", () => {
  it("par (tela, seção) FORA do catálogo é rejeitado, e NADA é inserido", async () => {
    const { service, inserts } = montar({});
    await expect(
      service.criar(
        { tipo: "BUG", menuCodigo: "esteira-admissional", submenu: "Fila", descricao: DESCRICAO },
        fakeFile,
        usuario("u1", "COMUM"),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inserts).toHaveLength(0);
  });

  it("SEM imagem é rejeitado com 'imagem obrigatória', e NADA é inserido", async () => {
    const { service, inserts } = montar({});
    await expect(
      service.criar({ tipo: "BUG", ...PAR_VALIDO, descricao: DESCRICAO }, undefined, usuario("u1", "COMUM")),
    ).rejects.toMatchObject({ message: expect.stringMatching(/imagem.*obrigat/i) });
    expect(inserts).toHaveLength(0);
  });
});

describe("criar: a solicitação nasce NOVO, do solicitante, com rótulo do catálogo (req.2)", () => {
  const cabCanonico = {
    id: "sol-1",
    tipo: "BUG",
    menuCodigo: "esteira-admissional",
    menuRotulo: "Esteira Admissional",
    submenu: "Auditoria",
    status: "NOVO",
    descricao: DESCRICAO,
    imagemDriveUrl: null,
    solicitanteId: "u1",
    solicitanteNome: "Consultor De Teste",
    criadoEm: new Date("2026-10-17T12:00:00.000Z"),
    atualizadoEm: new Date("2026-10-17T12:00:00.000Z"),
  };

  it("insere em `solicitacoes` com status NOVO e solicitanteId = usuário atual", async () => {
    const { service, inserts } = montar({ solicitacao: cabCanonico });
    await service.criar({ tipo: "BUG", ...PAR_VALIDO, descricao: DESCRICAO }, fakeFile, usuario("u1", "COMUM"));
    const insSol = inserts.find((i) => i.tabela === T_SOL);
    expect(insSol, "deve inserir na tabela de solicitações").toBeTruthy();
    expect(insSol?.valores.status).toBe("NOVO");
    expect(insSol?.valores.solicitanteId).toBe("u1");
  });

  it("o menuRotulo é RESOLVIDO do catálogo, não aceito do cliente", async () => {
    const { service, inserts } = montar({ solicitacao: cabCanonico });
    await service.criar(
      // mesmo se o cliente mandasse rótulo, o DTO nem tem esse campo; o par resolve o rótulo
      { tipo: "FUNCIONALIDADE", ...PAR_VALIDO, descricao: DESCRICAO },
      fakeFile,
      usuario("u1", "COMUM"),
    );
    const insSol = inserts.find((i) => i.tabela === T_SOL);
    expect(insSol?.valores.menuRotulo).toBe("Esteira Admissional");
    expect(insSol?.valores.menuCodigo).toBe("esteira-admissional");
  });
});

describe("aplicarAcao: mapeia status e exige corpo na dúvida (req.4)", () => {
  const alvo = {
    id: "sol-1",
    solicitanteId: "owner-1",
    menuRotulo: "Esteira Admissional",
    tipo: "BUG",
    menuCodigo: "esteira-admissional",
    submenu: "Auditoria",
    status: "NOVO",
    descricao: DESCRICAO,
    imagemDriveUrl: null,
    solicitanteNome: "Dona Da Solicitacao",
    criadoEm: new Date("2026-10-14T12:00:00.000Z"),
    atualizadoEm: new Date("2026-10-14T12:00:00.000Z"),
  };
  const gestor = usuario("gestor-1", "SUPER_ADMIN");

  const casos: Array<[Parameters<SolicitacoesService["aplicarAcao"]>[1], string]> = [
    ["APROVAR", "APROVADO"],
    ["REPROVAR", "REPROVADO"],
    ["ENVIAR_DUVIDA", "EM_DUVIDA"],
    ["EM_ANDAMENTO", "EM_ANDAMENTO"],
    ["CONCLUIR", "CONCLUIDO"],
  ];

  for (const [acao, status] of casos) {
    it(`${acao} grava status ${status}`, async () => {
      const { service, updates } = montar({ solicitacao: alvo });
      await service.aplicarAcao("sol-1", acao, acao === "ENVIAR_DUVIDA" ? "Qual tela?" : undefined, gestor);
      const upSol = updates.find((u) => u.tabela === T_SOL);
      expect(upSol?.valores.status).toBe(status);
    });
  }

  it("ENVIAR_DUVIDA SEM corpo é rejeitado, e NADA é escrito", async () => {
    const { service, updates, inserts } = montar({ solicitacao: alvo });
    await expect(service.aplicarAcao("sol-1", "ENVIAR_DUVIDA", undefined, gestor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.aplicarAcao("sol-1", "ENVIAR_DUVIDA", "   ", gestor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

describe("aplicarAcao: thread da gestão + UMA notificação ao solicitante (req.5)", () => {
  const alvo = {
    id: "sol-1",
    solicitanteId: "owner-1",
    menuRotulo: "Central De Vagas",
    tipo: "FUNCIONALIDADE",
    menuCodigo: "central-de-vagas",
    submenu: "Importação",
    status: "NOVO",
    descricao: DESCRICAO,
    imagemDriveUrl: null,
    solicitanteNome: "Dona Da Solicitacao",
    criadoEm: new Date("2026-10-14T12:00:00.000Z"),
    atualizadoEm: new Date("2026-10-14T12:00:00.000Z"),
  };
  const gestor = usuario("gestor-1", "SUPER_ADMIN");

  it("escreve UMA mensagem na thread, autorada pela GESTÃO (autorId = gestor)", async () => {
    const { service, inserts } = montar({ solicitacao: alvo });
    await service.aplicarAcao("sol-1", "APROVAR", undefined, gestor);
    const msgs = inserts.filter((i) => i.tabela === T_MSG);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].valores.autorId).toBe("gestor-1");
    expect(msgs[0].valores.solicitacaoId).toBe("sol-1");
  });

  it("escreve EXATAMENTE UMA notificação, para o SOLICITANTE (não o gestor), com a rota da tela", async () => {
    const { service, inserts } = montar({ solicitacao: alvo });
    await service.aplicarAcao("sol-1", "CONCLUIR", undefined, gestor);
    const notifs = inserts.filter((i) => i.tabela === T_NOTIF);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].valores.usuarioId).toBe("owner-1");
    expect(notifs[0].valores.usuarioId).not.toBe("gestor-1");
    expect(notifs[0].valores.rota).toBe("/central-solicitacoes");
  });

  it("a dúvida carrega a pergunta da gestão na notificação", async () => {
    const { service, inserts } = montar({ solicitacao: alvo });
    await service.aplicarAcao("sol-1", "ENVIAR_DUVIDA", "Qual cliente exatamente?", gestor);
    const notif = inserts.find((i) => i.tabela === T_NOTIF);
    expect(String(notif?.valores.corpo)).toContain("Qual cliente exatamente?");
  });
});

describe("detalhe: dono vê, terceiro NÃO, SUPER_ADMIN vê (req.7)", () => {
  const cab = {
    id: "sol-1",
    tipo: "BUG",
    menuCodigo: "esteira-admissional",
    menuRotulo: "Esteira Admissional",
    submenu: "Auditoria",
    status: "NOVO",
    descricao: DESCRICAO,
    imagemDriveUrl: null,
    solicitanteId: "owner-1",
    solicitanteNome: "Dona Da Solicitacao",
    criadoEm: new Date("2026-10-14T12:00:00.000Z"),
    atualizadoEm: new Date("2026-10-14T12:00:00.000Z"),
  };

  it("o DONO lê o próprio detalhe", async () => {
    const { service } = montar({ solicitacao: cab });
    const api = await service.detalhe("sol-1", usuario("owner-1", "COMUM"));
    expect(api.id).toBe("sol-1");
  });

  it("um TERCEIRO comum recebe 404 (não revela a existência)", async () => {
    const { service } = montar({ solicitacao: cab });
    await expect(service.detalhe("sol-1", usuario("intruso-9", "COMUM"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("um MASTER (não dono) também recebe 404: só o dono ou o SUPER_ADMIN", async () => {
    const { service } = montar({ solicitacao: cab });
    await expect(service.detalhe("sol-1", usuario("master-9", "MASTER"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("o SUPER_ADMIN lê qualquer detalhe", async () => {
    const { service } = montar({ solicitacao: cab });
    const api = await service.detalhe("sol-1", usuario("gestor-1", "SUPER_ADMIN"));
    expect(api.id).toBe("sol-1");
  });

  it("solicitação inexistente é 404", async () => {
    const { service } = montar({ solicitacao: null });
    await expect(service.detalhe("nao-existe", usuario("owner-1", "COMUM"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
