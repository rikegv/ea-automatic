import { BadRequestException } from "@nestjs/common";
import { VAGA_STATUS_SEMENTE } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { asVagaStatusEventos, clientes, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { ReguaDeStatusDaVaga, type AsVagaStatusLinha } from "../vaga-status/vaga-status.service";
import { VagasService } from "../vagas/vagas.service";
import { IngestaoVarreduraService } from "./ingestao-varredura.service";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38): A INÉRCIA DA VARREDURA E O CAMINHO REAL DA LIBERAÇÃO ────────
 *
 * ESCRITO CONTRA O REQUISITO, POR QUEM NÃO ESCREVEU O CÓDIGO. Os dois blocos daqui cobrem os dois
 * pontos em que a cobertura existente afirma sobre uma peça VIZINHA da que roda em produção:
 *
 * ┌─ 1. A INÉRCIA É DO SERVIÇO, E NÃO DO LEITOR DA VARIÁVEL ─────────────────────────────────────┐
 * │ `lerDataDeCorte` já é medida, e ela devolve `null` direitinho. O requisito, porém, não é       │
 * │ "a função devolve null": é "sem a data, a varredura NÃO LÊ e NÃO ESCREVE nada". Quem decide    │
 * │ isso é `onModuleInit`, e nenhum teste o exercitava. Um `?? "2026-01-01"` no lugar da leitura,  │
 * │ ou a criação da fila ANTES da guarda, deixaria a função intacta e a varredura ligada.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 2. A LIBERAÇÃO COM O CLIENTE VINDO DO CORPO É O ÚNICO CAMINHO QUE A TELA USA ───────────────┐
 * │ A vaga espelhada nasce com `cod_cliente` NULO e não pode ser editada pela rota de atualização │
 * │ (ela só aceita vaga de papel RASCUNHO), então vincular o cliente acontece SÓ no corpo do      │
 * │ liberar. O contrato existente chama a porta com dois argumentos, sem corpo nenhum, e mede o   │
 * │ cenário em que a vaga JÁ tinha cliente: o caminho de produção não é exercitado em lugar       │
 * │ nenhum.                                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: dado sintético do começo ao fim, nenhum CPF, nome ou e-mail de gente. §A.11: sem travessão.
 */

// ── O CATÁLOGO DE STATUS, MONTADO COM A SEMENTE DE VERDADE ─────────────────────────────────────
//
// A semente, e não códigos inventados: é ela que a migration 0115 grava (há teste próprio casando as
// duas), então o `PENDENTE_REVISAO` e o código do papel ABERTURA daqui são os do banco.
const LINHAS: AsVagaStatusLinha[] = VAGA_STATUS_SEMENTE.map((s, i) => ({ id: i + 1, ...s }));
const REGUA = new ReguaDeStatusDaVaga(LINHAS);
const CODIGO_REVISAO = REGUA.codigoDoPapel("REVISAO");
const CODIGO_ABERTURA = REGUA.codigoDoPapel("ABERTURA");

const CATALOGO_FINGIDO = {
  regua: () => Promise.resolve(REGUA),
  listar: () => Promise.resolve(LINHAS),
  codigoDoPapel: (p: Parameters<typeof REGUA.codigoDoPapel>[0]) =>
    Promise.resolve(REGUA.codigoDoPapel(p)),
};

const USUARIO: AuthUser = {
  id: "00000000-0000-4000-8000-00000000abcd",
  email: "consultor.sintetico@exemplo.invalido",
  papel: "COMUM",
  senhaTemporaria: false,
};

const ID_DA_VAGA = "00000000-0000-4000-8000-0000000000aa";
const CLIENTE_DO_CORPO = "CLI-SINTETICO-1";

// ══ BLOCO 1: A VARREDURA NASCE INERTE ═════════════════════════════════════════════════════════

function servicoDaVarredura(valorDaVariavel: string | undefined, apiAtiva = true) {
  const chavesLidas: string[] = [];
  const toques: string[] = [];
  const config = {
    get: (chave: string) => {
      chavesLidas.push(chave);
      return chave === "PANDAPE_VARREDURA_DATA_CORTE" ? valorDaVariavel : undefined;
    },
  };
  const explodir = (nome: string) => () => {
    toques.push(nome);
    throw new Error(`a varredura inerte tocou ${nome}`);
  };
  const api = {
    estaAtivo: () => apiAtiva,
    vagasAtivas: explodir("api.vagasAtivas"),
    matchesDaVaga: explodir("api.matchesDaVaga"),
  };
  const repo = {
    vagaPorIdPandape: explodir("repo.vagaPorIdPandape"),
    escrever: explodir("repo.escrever"),
    encerrarAusentes: explodir("repo.encerrarAusentes"),
  };
  const http = { requisitar: explodir("http.requisitar") };
  const etapas = { etapaInicial: explodir("etapas.etapaInicial") };
  const svc = new IngestaoVarreduraService(
    config as never,
    api as never,
    repo as never,
    http as never,
    etapas as never,
  );
  return { svc, chavesLidas, toques };
}

describe("a varredura do Pandapé sem a data de corte configurada", () => {
  it.each([
    ["ausente", undefined],
    ["vazia", "   "],
    ["ilegível", "agora menos 90 dias"],
  ])("com a variável %s, NÃO liga fila, worker nem cadência", (_nome, valor) => {
    const { svc, toques } = servicoDaVarredura(valor as string | undefined);
    svc.onModuleInit();

    const interno = svc as unknown as Record<string, unknown>;
    expect(
      interno.queue,
      "a fila foi criada sem data de corte. Ligada, ela começa a colher as 137.654 inscrições vivas do passivo, e ninguém decidiu isso.",
    ).toBeUndefined();
    expect(interno.worker, "o worker subiu sem data de corte").toBeUndefined();
    expect(
      interno.timer,
      "a cadência de 30 minutos foi armada sem data de corte: a varredura roda sozinha na volta seguinte.",
    ).toBeUndefined();
    expect(interno.connection, "a conexão Redis da varredura foi aberta sem data de corte").toBeUndefined();
    expect(toques, "a varredura inerte tocou dependência de leitura ou de escrita").toEqual([]);
  });

  it("lê EXATAMENTE a variável do requisito, e não cai em nenhum valor padrão", () => {
    const { svc, chavesLidas } = servicoDaVarredura(undefined);
    svc.onModuleInit();
    expect(
      chavesLidas,
      "a varredura parou de perguntar por `PANDAPE_VARREDURA_DATA_CORTE`. A data é decisão do diretor e não tem default: um default faz a primeira volta colher o passivo inteiro.",
    ).toContain("PANDAPE_VARREDURA_DATA_CORTE");
    expect(
      (svc as unknown as Record<string, unknown>).dataDeCorte,
      "a varredura guardou uma data de corte que ninguém configurou: alguém pôs um default no caminho.",
    ).toBeUndefined();
  });

  it("disparar a volta na mão, com ela inerte, não enfileira nada e não lança", async () => {
    const { svc, toques } = servicoDaVarredura(undefined);
    svc.onModuleInit();
    await expect(svc.dispararVolta()).resolves.toBe(false);
    expect(toques).toEqual([]);
  });

  it("a SEGUNDA fechadura: montar as dependências sem corte LANÇA, em vez de chutar uma data", () => {
    const { svc } = servicoDaVarredura(undefined);
    svc.onModuleInit();
    expect(
      () => (svc as unknown as { deps: () => unknown }).deps(),
      "sem data de corte, montar as dependências do ciclo tem de falhar alto. Devolver um corte qualquer aqui ressuscitaria o `agora menos alguma coisa` no caminho de exceção, que é onde ninguém olha.",
    ).toThrow();
  });

  it("com a data configurada mas a integração SEM credencial, também fica inerte", () => {
    const { svc, toques } = servicoDaVarredura("2026-09-18T00:00:00Z", false);
    svc.onModuleInit();
    const interno = svc as unknown as Record<string, unknown>;
    expect(interno.queue).toBeUndefined();
    expect(interno.timer).toBeUndefined();
    expect(toques).toEqual([]);
  });
});

// ══ BLOCO 2: A LIBERAÇÃO PELO CAMINHO QUE A TELA USA ══════════════════════════════════════════

interface EscritaObservada {
  verbo: "update" | "insert";
  tabela: "vagas" | "eventos" | "outra";
  valores: Record<string, unknown>;
}

/**
 * O banco fingido da liberação, com UMA diferença que importa em relação ao dublê já existente: ele
 * distingue a consulta de CLIENTE da consulta de VAGA. Um dublê que devolve a mesma linha para
 * qualquer `select` faz a conferência do cliente contra o cadastro passar sempre, inclusive quando
 * ela é removida do código.
 */
function bancoDaLiberacao(opcoes: {
  vaga: { status: string; codCliente: string | null };
  clienteExiste: boolean;
}): { db: Database; escritas: EscritaObservada[]; consultasDeCliente: number } {
  const escritas: EscritaObservada[] = [];
  const estado = { consultasDeCliente: 0 };

  const nomeDaTabela = (t: unknown): EscritaObservada["tabela"] => {
    if (t === vagas) return "vagas";
    if (t === asVagaStatusEventos) return "eventos";
    return "outra";
  };

  const thenable = (resposta: unknown[]): Record<string, unknown> => {
    const eu: Record<string, unknown> = {};
    const seguir = () => eu;
    for (const m of ["where", "limit", "for", "orderBy", "innerJoin", "leftJoin", "returning"]) {
      eu[m] = seguir;
    }
    eu.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok);
    return eu;
  };

  const selectDe = () => ({
    from: (t: unknown) => {
      if (t === clientes) {
        estado.consultasDeCliente += 1;
        return thenable(opcoes.clienteExiste ? [{ cod: CLIENTE_DO_CORPO }] : []);
      }
      if (t === vagas) {
        return thenable([
          { id: ID_DA_VAGA, status: opcoes.vaga.status, codCliente: opcoes.vaga.codCliente },
        ]);
      }
      return thenable([]);
    },
  });

  const porta: Record<string, unknown> = {
    select: selectDe,
    selectDistinct: selectDe,
    update: (t: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        escritas.push({ verbo: "update", tabela: nomeDaTabela(t), valores });
        return thenable([]);
      },
    }),
    insert: (t: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        escritas.push({ verbo: "insert", tabela: nomeDaTabela(t), valores });
        return thenable([]);
      },
    }),
    delete: () => thenable([]),
    execute: () => Promise.resolve([]),
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(porta),
  };

  return {
    db: porta as unknown as Database,
    escritas,
    get consultasDeCliente() {
      return estado.consultasDeCliente;
    },
  } as { db: Database; escritas: EscritaObservada[]; consultasDeCliente: number };
}

function servicoDeVagas(db: Database): VagasService {
  return new VagasService(db, catalogoDeEtapasFingido() as never, CATALOGO_FINGIDO as never);
}

/**
 * A liberação é chamada e o erro é DEVOLVIDO em vez de propagado: a última linha do método monta a
 * resposta da listagem, que este dublê não serve, e o que se mede aqui são as ESCRITAS.
 */
async function liberar(
  svc: VagasService,
  corpo?: { codCliente?: string },
): Promise<{ erro: unknown }> {
  try {
    await svc.liberarPendenteRevisao(ID_DA_VAGA, USUARIO, corpo as never);
  } catch (e) {
    return { erro: e };
  }
  return { erro: null };
}

describe("liberar a vaga espelhada com o cliente vindo do CORPO, que é o caminho da tela", () => {
  it("grava o vínculo do cliente NA MESMA escrita que tira a vaga da fila", async () => {
    const banco = bancoDaLiberacao({
      vaga: { status: CODIGO_REVISAO, codCliente: null },
      clienteExiste: true,
    });
    await liberar(servicoDeVagas(banco.db), { codCliente: CLIENTE_DO_CORPO });

    const naVaga = banco.escritas.filter((e) => e.tabela === "vagas" && e.verbo === "update");
    expect(naVaga, "a liberação não escreveu na vaga").toHaveLength(1);
    expect(naVaga[0]?.valores.status, "a vaga não foi para o código do papel ABERTURA").toBe(
      CODIGO_ABERTURA,
    );
    expect(
      naVaga[0]?.valores.codCliente,
      "A VAGA SAIU DA FILA SEM O CLIENTE. A vaga espelhada nasce com `cod_cliente` nulo e não é editável pela rota de atualização: o corpo do liberar é o ÚNICO lugar em que o vínculo é gravado. Perdendo essa metade, a vaga vira uma vaga aberta que ninguém sabe a quem pertence, com as pessoas que ela já carrega penduradas num processo sem controlador, e a fila que existia para pegar isso já foi embora.",
    ).toBe(CLIENTE_DO_CORPO);
  });

  it("a trilha registra quem liberou pela SESSÃO, e o cliente que decidiu a liberação", async () => {
    const banco = bancoDaLiberacao({
      vaga: { status: CODIGO_REVISAO, codCliente: null },
      clienteExiste: true,
    });
    await liberar(servicoDeVagas(banco.db), { codCliente: CLIENTE_DO_CORPO });

    const evento = banco.escritas.find((e) => e.tabela === "eventos" && e.verbo === "insert");
    expect(evento, "a saída da fila não deixou evento na trilha").toBeDefined();
    expect(evento?.valores.de).toBe(CODIGO_REVISAO);
    expect(evento?.valores.para).toBe(CODIGO_ABERTURA);
    expect(
      evento?.valores.porId,
      "o autor da liberação não veio da sessão. Autoria é trilha, nunca campo de formulário.",
    ).toBe(USUARIO.id);
    expect(
      String(evento?.valores.observacao ?? ""),
      "o rastro não diz COM QUAL CLIENTE a vaga foi liberada, e a vaga pode ser revinculada depois: sem ele, `por que esta vaga foi liberada` fica sem resposta.",
    ).toContain(CLIENTE_DO_CORPO);
  });

  it("cliente do corpo que NÃO está no cadastro é recusado ANTES de qualquer escrita", async () => {
    const banco = bancoDaLiberacao({
      vaga: { status: CODIGO_REVISAO, codCliente: null },
      clienteExiste: false,
    });
    const { erro } = await liberar(servicoDeVagas(banco.db), { codCliente: "CLI-QUE-NAO-EXISTE" });

    expect(
      erro,
      "um código de cliente inexistente atravessou a liberação. Sem a conferência contra o cadastro ele chega à FK RESTRICT e vira 500 genérico no meio da transação, sem dizer a quem opera o que fazer.",
    ).toBeInstanceOf(BadRequestException);
    expect(
      banco.escritas,
      "a recusa aconteceu DEPOIS de escrever. Recusa que já gravou não é recusa.",
    ).toEqual([]);
  });

  it("corpo VAZIO sobre vaga sem cliente continua sendo recusa, e sem escrever nada", async () => {
    const banco = bancoDaLiberacao({
      vaga: { status: CODIGO_REVISAO, codCliente: null },
      clienteExiste: true,
    });
    const { erro } = await liberar(servicoDeVagas(banco.db), {});
    expect(erro, "liberou uma vaga sem cliente nenhum, nem no corpo nem no banco").not.toBeNull();
    expect(banco.escritas).toEqual([]);
  });

  it("o corpo não dispensa a fila: vaga fora do papel REVISAO não sai por esta porta", async () => {
    const banco = bancoDaLiberacao({
      vaga: { status: CODIGO_ABERTURA, codCliente: null },
      clienteExiste: true,
    });
    const { erro } = await liberar(servicoDeVagas(banco.db), { codCliente: CLIENTE_DO_CORPO });
    expect(
      erro,
      "a liberação com corpo virou uma SEGUNDA porta para o papel ABERTURA, sem a régua de obrigatórios da trilha.",
    ).not.toBeNull();
    expect(banco.escritas).toEqual([]);
  });
});

// ══ BLOCO 3: A AUSÊNCIA DO LOTE É REQUISITO, ENTÃO ELA É MEDIDA ═══════════════════════════════

describe("não existe liberação em LOTE, e a ausência é deliberada", () => {
  /**
   * O LOTE FOI VETADO PELA AUDITORIA: um cliente errado aplicado a centenas de vagas atribui
   * centenas de pessoas ao controlador errado de uma vez, e desfazer não desfaz o que já foi visto.
   * Requisito que só vive em comentário volta como "melhoria" na frente seguinte.
   */
  it("o serviço de vagas não expõe porta de liberação em lote", () => {
    const nomes = Object.getOwnPropertyNames(VagasService.prototype);
    const suspeitos = nomes.filter(
      (n) => /liberar/i.test(n) && /(lote|todas|varias|massa|bulk|emlote)/i.test(n),
    );
    expect(
      suspeitos,
      "apareceu uma porta de liberação em lote no serviço de vagas. Ela foi VETADA: a liberação é uma vaga por vez, porque é o cliente errado aplicado em massa que não tem desfazer.",
    ).toEqual([]);
  });

  it("a porta individual continua existindo, senão a afirmação acima mediria nada", () => {
    expect(typeof VagasService.prototype.liberarPendenteRevisao).toBe("function");
  });
});
