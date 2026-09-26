import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  asCandidaturaEntrevistas,
  asCandidaturaEtapas,
  asCandidaturas,
  vagas,
} from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";
import { CandidatosService } from "./candidatos.service";

/**
 * ─ TRANSFERIR PARA VAGA DE OUTRO CLIENTE APAGA A ENTREVISTA DO CLIENTE (cobertura independente) ─
 *
 * ESTE ARQUIVO É DO `tester`, ESCRITO ANTES DO CÓDIGO (§A.40 regra 2), contra o REQUISITO do
 * diretor: "ao transferir para vaga de OUTRO cliente, a entrevista da etapa de ENTREGA AO CLIENTE é
 * APAGADA; a entrevista INTERNA (Soulan) é PRESERVADA; cliente igual não apaga nada".
 *
 * ┌─ POR QUE O REQUISITO EXISTE, E POR QUE ELE É DE DADO E NÃO DE TELA ────────────────────────────┐
 * │ A entrevista com o cliente é um compromisso COM AQUELE CLIENTE, numa data e num horário que    │
 * │ aquele cliente marcou. Transferida a pessoa para a vaga de OUTRO cliente, o compromisso não    │
 * │ existe mais, e ele NÃO some sozinho: `as_candidatura_entrevistas` é ligado à CANDIDATURA, e a  │
 * │ candidatura é a MESMA LINHA depois da troca (a troca muda `vaga_id`, e nada mais). O resultado │
 * │ é uma entrevista viva, na agenda da semana (o índice `idx_..._agenda` existe para essa          │
 * │ leitura), chamando o time para um compromisso com um cliente que saiu do processo.              │
 * │                                                                                                 │
 * │ A INTERNA NÃO SE APAGA PELA MESMA LÓGICA, invertida: a entrevista da Soulan é com a SOULAN.    │
 * │ Ela continua valendo com a pessoa em qualquer vaga, e apagá-la jogaria fora uma triagem já     │
 * │ feita, que é trabalho que teria de ser refeito.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ARMADILHA CENTRAL, E ELA É UMA CLÁUSULA `where` ────────────────────────────────────────────┐
 * │ O gesto natural de quem constrói é apagar as entrevistas DA CANDIDATURA e seguir. Isso passa   │
 * │ no caso de cliente diferente, passa na revisão de código, e DESTRÓI a entrevista interna em    │
 * │ toda troca entre clientes. A metade que se esquece é a que PRESERVA, e é por isso que os dois  │
 * │ lados são medidos aqui, e não só o que a OST nomeia.                                            │
 * │                                                                                                 │
 * │ QUEM DIZ QUAL ETAPA É "DO CLIENTE" É O CATÁLOGO (`codigosDeEntregaAoCliente`, o flag           │
 * │ `entrega_ao_cliente` da migration 0130), e nunca um literal `"ENTREVISTA_CLIENTE"` escrito     │
 * │ aqui: a lista é do diretor, e um literal pararia de funcionar no dia em que ele marcasse outra │
 * │ etapa, em silêncio, deixando a entrevista morta viva de novo.                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids técnicos, códigos de etapa, códigos de cliente e datas. Nenhum nome real, nenhum CPF.
 */

const AGORA = new Date("2026-09-26T12:00:00.000Z");
const dialeto = new PgDialect();

/** O texto SQL de uma cláusula, com os parâmetros já substituídos (molde do spec vizinho). */
function textoDe(cond: unknown): string {
  if (cond === undefined || cond === null) return "";
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
}

/** A etapa de ENTREGA AO CLIENTE e a INTERNA, as duas vindas do catálogo fingido, nunca de literal. */
const ETAPA_DO_CLIENTE = "ENTREVISTA_CLIENTE";
const ETAPA_INTERNA = "ENTREVISTA_SOULAN";

interface EntrevistaFingida {
  id: string;
  candidaturaId: string;
  etapa: string;
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * ─ O BANCO FINGIDO DA TROCA, COM AS ENTREVISTAS DENTRO ──────────────────────────────────────────
 *
 * ELE MODELA O QUE ESTE REQUISITO TOCA: as DUAS vagas (com o `cod_cliente` de cada uma, que é o dado
 * novo da comparação), a candidatura e as ENTREVISTAS dela, que é o que o dublê vizinho
 * (`candidatos.transferencia-de-vaga.spec.ts`) não modela e por isso não pode medir.
 *
 * O `delete` É INTERPRETADO DE VERDADE, e não só registrado: a cláusula é renderizada em SQL e as
 * linhas são removidas conforme ela. É isso que separa medir de fingir. Um `delete` que apagasse
 * tudo da candidatura deixa o caso da entrevista PRESERVADA vermelho, que é o ponto do arquivo.
 */
function bancoDaTroca(cenario: {
  clienteDaOrigem?: string | null;
  clienteDoDestino?: string | null;
  entrevistas?: string[];
  etapaDaCandidatura?: string;
  situacao?: string;
}) {
  const origem = {
    id: "vaga-A",
    codigo: "PS-A",
    nomeDivulgacao: "Vaga A",
    status: "ABERTA",
    codCliente: cenario.clienteDaOrigem === undefined ? "CLI-1" : cenario.clienteDaOrigem,
    posicoesOficiais: 5,
    posicoesBanco: 0,
  };
  const destino = {
    id: "vaga-B",
    codigo: "PS-B",
    nomeDivulgacao: "Vaga B",
    status: "ABERTA",
    codCliente: cenario.clienteDoDestino === undefined ? "CLI-2" : cenario.clienteDoDestino,
    posicoesOficiais: 5,
    posicoesBanco: 0,
  };
  const porId = new Map([
    [origem.id, origem],
    [destino.id, destino],
  ]);

  const candidatura = {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: origem.id,
    etapa: cenario.etapaDaCandidatura ?? ETAPA_DO_CLIENTE,
    situacao: cenario.situacao ?? "ATIVO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
  };

  const entrevistas: EntrevistaFingida[] = (cenario.entrevistas ?? []).map((etapa, i) => ({
    id: `ent-${i + 1}`,
    candidaturaId: candidatura.id,
    etapa,
  }));

  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  /** As cláusulas de `delete` que a produção emitiu, para o relatório de um vermelho dizer o porquê. */
  const delecoes: string[] = [];

  /** A vaga que uma cláusula está pedindo, reconhecida pelo id que aparece no texto dela. */
  const vagaDaClausula = (cond: unknown) => {
    const texto = textoDe(cond);
    for (const [id, linha] of porId) if (texto.includes(id)) return linha;
    return destino;
  };

  const select = vi.fn((selecao?: Record<string, unknown>) => {
    const pedeOcupadas = Boolean(selecao && "ocupadas" in selecao);
    let tabela: unknown = null;
    let cond: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = (c: unknown) => {
      cond = c;
      return b;
    };
    // A leitura final (`candidatura()`) termina em `orderBy` e devolve a linha já com nomes.
    b.orderBy = () =>
      Promise.resolve([
        {
          c: { ...candidatura },
          candidatoNome: "Pessoa Inventada",
          vagaCodigo: destino.codigo,
          vagaNome: destino.nomeDivulgacao,
          autor: "Consultor",
        },
      ]);
    b.for = () => Promise.resolve([{ ...vagaDaClausula(cond) }]);
    b.limit = () => Promise.resolve(tabela === vagas ? [{ ...vagaDaClausula(cond) }] : []);
    b.then = (r: (v: unknown) => unknown) => {
      if (pedeOcupadas) return Promise.resolve([{ ocupadas: 0 }]).then(r);
      // A LEITURA DA VAGA DE ORIGEM, se a construção a fizer por `select` em vez de `query`.
      if (tabela === vagas) return Promise.resolve([{ ...vagaDaClausula(cond) }]).then(r);
      if (tabela === asCandidaturaEntrevistas) {
        return Promise.resolve(entrevistas.map((e) => ({ ...e }))).then(r);
      }
      // A conferência de "esta pessoa já está nesta vaga": vazia.
      return Promise.resolve([]).then(r);
    };
    return b;
  });

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (v: Record<string, unknown>) => {
      lista.push({ tabela, valores: v });
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        catch: pronto.catch.bind(pronto),
        finally: pronto.finally.bind(pronto),
        returning: async () => [{ id: `linha-${lista.length}` }],
      };
    },
    onConflictDoUpdate: async () => undefined,
  });

  /**
   * O `delete`, HONRANDO A CLÁUSULA. Reconhece os dois formatos possíveis sem exigir um deles: a
   * lista de etapas a apagar (`in (...)`) e a lista a PRESERVAR (`not in (...)`). O que ele NÃO
   * perdoa é a cláusula que só fala da candidatura: ali ele apaga tudo, e o caso da entrevista
   * interna preservada fica vermelho, que é exatamente o defeito que este arquivo existe para pegar.
   */
  const apagar = vi.fn((tabela: unknown) => ({
    where: (cond: unknown) => {
      const texto = textoDe(cond);
      const removidas: EntrevistaFingida[] = [];
      if (tabela === asCandidaturaEntrevistas) {
        delecoes.push(texto);
        const negada = /not\s+in|<>|!=/i.test(texto);
        const citadas = [ETAPA_DO_CLIENTE, ETAPA_INTERNA].filter((e) => texto.includes(e));
        for (let i = entrevistas.length - 1; i >= 0; i -= 1) {
          const e = entrevistas[i];
          if (!texto.includes(e.candidaturaId)) continue;
          const casa =
            citadas.length === 0 ? true : negada ? !citadas.includes(e.etapa) : citadas.includes(e.etapa);
          if (casa) removidas.push(...entrevistas.splice(i, 1));
        }
      }
      /*
       * AGUARDÁVEL **E** COM `returning`, como o Drizzle de verdade. A produção CONTA o que apagou
       * (para o rastro dizer o tamanho do que aconteceu), então um dublê sem `returning` reprovaria
       * o código por uma limitação dele, e não por um defeito.
       */
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        catch: pronto.catch.bind(pronto),
        finally: pronto.finally.bind(pronto),
        returning: async () => removidas.map((e) => ({ id: e.id })),
      };
    },
  }));

  const query = {
    asCandidaturas: { findFirst: vi.fn().mockResolvedValue(candidatura) },
    vagas: {
      findFirst: vi.fn(async (args?: { where?: unknown }) => ({ ...vagaDaClausula(args?.where) })),
    },
  };

  const tx = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    delete: apagar,
    query,
  };
  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    delete: apagar,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query,
  };

  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );

  return { service, updates, inserts, delecoes, entrevistas, candidatura };
}

const etapasVivas = (b: ReturnType<typeof bancoDaTroca>) => b.entrevistas.map((e) => e.etapa).sort();

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. CLIENTE DIFERENTE: A DO CLIENTE MORRE, A INTERNA FICA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("transferir para vaga de OUTRO cliente", () => {
  /**
   * AS DUAS METADES NO MESMO CASO, DE PROPÓSITO. Medi-las em testes separados deixaria passar a
   * implementação que apaga TUDO (o caso "apagou a do cliente" ficaria verde sozinho), e é
   * exatamente essa a implementação mais provável de sair de um briefing que só nomeia a metade
   * que apaga.
   */
  it("apaga a entrevista de ENTREGA AO CLIENTE e PRESERVA a interna", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-2",
      entrevistas: [ETAPA_DO_CLIENTE, ETAPA_INTERNA],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    expect(etapasVivas(b), `cláusulas de delete emitidas: ${JSON.stringify(b.delecoes)}`).toEqual([
      ETAPA_INTERNA,
    ]);
  });

  /** SÓ A DO CLIENTE: ela some, e a troca não fica dependendo de haver uma interna ao lado. */
  it("com só a entrevista do cliente marcada, ela some", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-2",
      entrevistas: [ETAPA_DO_CLIENTE],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    expect(etapasVivas(b)).toEqual([]);
  });

  /** SÓ A INTERNA: nada é apagado, e a limpeza não pode "aproveitar a viagem". */
  it("com só a entrevista interna marcada, NADA é apagado", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-2",
      entrevistas: [ETAPA_INTERNA],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    expect(etapasVivas(b)).toEqual([ETAPA_INTERNA]);
  });

  /**
   * A BORDA VAZIA. Ela não é zelo: uma implementação que leia a entrevista e trabalhe sobre o
   * resultado sem conferir a ausência derruba a troca INTEIRA com `undefined`, e o gesto que o
   * diretor pediu para melhorar passa a falhar para a maioria das candidaturas, que não tem
   * entrevista nenhuma marcada.
   */
  it("sem entrevista nenhuma, a troca acontece normalmente", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-2",
      entrevistas: [],
    });

    await expect(b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1")).resolves.toBeDefined();
    expect(b.updates.find((u) => u.tabela === asCandidaturas)?.valores).toMatchObject({
      vagaId: "vaga-B",
    });
  });

  /**
   * ─ A LIMPEZA NÃO PODE MEXER NA ETAPA DA PESSOA ────────────────────────────────────────────────
   *
   * Quem estava na Entrevista Cliente CONTINUA na Entrevista Cliente na vaga nova: a etapa é do
   * funil, a entrevista é um compromisso. Uma construção que "arrumasse" a etapa junto com a
   * entrevista mexeria na invariante central da troca (`A ETAPA NÃO ENTRA NESTE set`), que é código
   * validado e tem teste próprio, e estaria mudando o lugar da pessoa no funil sem ninguém pedir.
   */
  it("a etapa da candidatura NÃO é alterada pela limpeza", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-2",
      entrevistas: [ETAPA_DO_CLIENTE],
      etapaDaCandidatura: ETAPA_DO_CLIENTE,
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    const gravado = b.updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
    expect(Object.keys(gravado), "a troca grava a vaga, e não a etapa").not.toContain("etapa");
  });

  /** A TROCA E O RASTRO CONTINUAM INTEIROS: a limpeza é acréscimo, não substituição. */
  it("a troca continua gravando a vaga nova e o rastro", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-2",
      entrevistas: [ETAPA_DO_CLIENTE],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B", motivo: "cliente mudou" }, "user-1");

    expect(b.inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores).toMatchObject({
      vagaDe: "vaga-A",
      vagaPara: "vaga-B",
      porId: "user-1",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. MESMO CLIENTE: NADA É APAGADO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("transferir entre vagas do MESMO cliente", () => {
  /**
   * ─ O OUTRO LADO DO REQUISITO, E ELE É O QUE PROTEGE O TRABALHO JÁ FEITO ───────────────────────
   *
   * Mover alguém da vaga de Operador para a de Auxiliar do MESMO cliente é o caso comum da
   * operação, e ali a entrevista com aquele cliente CONTINUA VALENDO: é a mesma empresa, o mesmo
   * entrevistador, a mesma agenda. Apagar teria de ser remarcado à mão, e a pessoa perderia o
   * lugar na fila de quem já foi visto.
   *
   * SEM ESTE CASO, a implementação mais simples (apagar sempre) passaria no bloco de cima inteiro.
   */
  it("NADA é apagado quando as duas vagas são do mesmo cliente", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-1",
      entrevistas: [ETAPA_DO_CLIENTE, ETAPA_INTERNA],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    expect(etapasVivas(b), `cláusulas de delete emitidas: ${JSON.stringify(b.delecoes)}`).toEqual(
      [ETAPA_DO_CLIENTE, ETAPA_INTERNA].sort(),
    );
  });

  /** E A TROCA ACONTECE IGUAL: não apagar nada não pode virar "não fazer nada". */
  it("a troca entre vagas do mesmo cliente continua acontecendo", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: "CLI-1",
      clienteDoDestino: "CLI-1",
      entrevistas: [ETAPA_DO_CLIENTE],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    expect(b.updates.find((u) => u.tabela === asCandidaturas)?.valores).toMatchObject({
      vagaId: "vaga-B",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A BORDA DO CLIENTE NÃO RESOLVIDO (fail-closed)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ A DECISÃO SAIU, E ELA RESOLVEU NA RAIZ (diretor, 26/09/2026) ────────────────────────────────
 *
 * ┌─ O QUE SE PERGUNTAVA AQUI, E POR QUE A PERGUNTA DEIXOU DE EXISTIR ─────────────────────────┐
 * │ Este bloco era um PEDIDO DE DECISÃO: com `cod_cliente` NULO dos dois lados, a transferência  │
 * │ apaga a entrevista do cliente ou preserva? As duas leituras eram defensáveis (nulo é "não    │
 * │ sei" e destruir é irreversível, contra duas incógnitas não serem "o mesmo cliente").         │
 * │                                                                                               │
 * │ O DIRETOR NÃO ESCOLHEU UM DOS DOIS LADOS: ele mandou a vaga NÃO SER LIBERADA sem cliente.    │
 * │ Com isso o dilema não é decidido, ele DEIXA DE EXISTIR, que é a melhor forma de fechar uma   │
 * │ pergunta destas.                                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CADEIA QUE TORNA A ORIGEM NULA IMPOSSÍVEL, e ela é ESTRUTURAL, não estatística (a auditoria de
 * segurança corrigiu o coordenador neste ponto: contar vagas no banco não prova invariante, ainda
 * mais com produção em zero vagas):
 *
 *   1. as ÚNICAS portas de entrada no papel de processo são a trilha (`atualizar`), a liberação da
 *      revisão e o `moverStatus`;
 *   2. o `moverStatus` recusa RASCUNHO e REVISAO (`exigeReguaDeAbertura`), e as outras duas cobram
 *      `codCliente` pela régua dos onze obrigatórios;
 *   3. nenhum escritor põe `cod_cliente` de volta em nulo (`corrigirLiberacaoDaRevisao` só grava
 *      valor não vazio);
 *   4. marcar entrevista exige `papelDeVagaEmProcesso`.
 *
 * Logo: entrevista de cliente NUNCA convive com vaga sem cliente, e a ORIGEM nula deste cenário não
 * é rara, é inalcançável. A propriedade está travada em `vagas.liberar-vaga-completa.spec.ts`,
 * bloco (f), que a mede porta por porta em vez de caso a caso.
 *
 * O QUE CONTINUA EXISTINDO, e é o recorte que o coordenador tinha errado: o DESTINO nulo é
 * alcançável, porque `trocarVaga` libera o destino por `recebeCandidato`, e tanto RASCUNHO quanto
 * PENDENTE DE REVISÃO recebem candidato. Mover alguém PARA uma vaga sem cliente acontece, e é por
 * isso que a abstenção segue valendo naquela direção: ali não há entrevista de cliente a apagar,
 * porque a pessoa vinha de uma vaga em processo e vai para uma que ainda não é processo.
 */
describe("a origem sem cliente é IMPOSSÍVEL por construção (decisão do diretor: não se libera vaga sem cliente)", () => {
  it("o cenário de origem nula, se ele existisse, preservaria a entrevista interna e a do cliente", async () => {
    const b = bancoDaTroca({
      clienteDaOrigem: null,
      clienteDoDestino: null,
      entrevistas: [ETAPA_DO_CLIENTE, ETAPA_INTERNA],
    });

    await b.service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "user-1");

    /*
     * A AFIRMAÇÃO MUDOU DE LADO, E O MOTIVO É O ARGUMENTO ACIMA, NÃO A CONVENIÊNCIA DE FICAR VERDE.
     *
     * Enquanto a pergunta estava aberta, este caso exigia o apagamento, para ficar VERMELHO e cobrar
     * a decisão. Com a decisão tomada na raiz, o que resta a medir é o comportamento da abstenção,
     * e ele é o certo: sem saber o cliente, não se destrói nada.
     *
     * ISTO NÃO É O TESTE QUE SUSTENTA A REGRA. Quem sustenta é o bloco (f) de
     * `vagas.liberar-vaga-completa.spec.ts`, que prova que nenhuma porta põe vaga sem cliente em
     * papel de processo. Este aqui apenas documenta o que aconteceria no cenário inalcançável, para
     * que a mudança futura daquela regra apareça aqui também.
     */
    expect(etapasVivas(b)).toEqual([ETAPA_DO_CLIENTE, ETAPA_INTERNA]);
  });
});
