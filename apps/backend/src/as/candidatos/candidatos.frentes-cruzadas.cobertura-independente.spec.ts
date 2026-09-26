import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { CandidatosService } from "./candidatos.service";
import { bancoDaReprovacao, linhaDaReprovacao } from "./reprovacao-cliente.tester-fake";
import { restaurarCandidatura } from "./restaurar-candidatura";

/**
 * ─ AS FRENTES SE CRUZAM, E NINGUÉM MEDIU O CRUZAMENTO (cobertura independente, §A.38) ──────────
 *
 * ESTE ARQUIVO É DO `tester`. Cada frente desta sessão foi construída por um agente diferente, e
 * cada um mediu MUITO BEM a sua: a derivação tem três specs, a shortlist tem 22 testes, a
 * transferência tem 17. O que NENHUM deles pôde medir é o que só existe quando duas frentes se
 * encontram, porque o autor de uma não sabia da outra.
 *
 * OS TRÊS CRUZAMENTOS AQUI:
 *   1. TRANSFERIR (Frente D) ALGUÉM DE UMA VAGA CANCELADA (Frente B). É a promessa central do
 *      cancelamento novo ("continua encontrável para ser transferido ou realocado depois"), e ela
 *      não tem UM teste: nem no lado da leitura que OFERECE a pessoa, nem no lado do gesto.
 *   2. TRANSFERIR (Frente D) QUEM ESTÁ NUMA SHORTLIST JÁ ENVIADA (Frente E). A lista é CONGELADA,
 *      então o transferido não pode sumir dela, e o REENVIO daquela vaga não pode incluí-lo.
 *   3. A PRETENSÃO SALARIAL (Frente E) E A VOLTA AO PROCESSO. A coluna nasceu no MESMO `set` do
 *      `motivo_descarte`, e só um dos dois é apagado na volta.
 *
 * §A.6: nomes inventados, ids técnicos. Nenhum CPF.
 */

const AGORA = new Date("2026-09-20T10:00:00.000Z");

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** O texto de um filtro do Drizzle, para afirmar sobre a CLÁUSULA sem depender do formato dela. */
function textoDe(filtro: unknown): string {
  const visto = new Set<unknown>();
  const partes: string[] = [];
  const desce = (n: unknown) => {
    if (n === null || n === undefined || visto.has(n)) return;
    if (typeof n === "string") {
      partes.push(n);
      return;
    }
    if (typeof n !== "object") return;
    visto.add(n);
    for (const v of Object.values(n as Record<string, unknown>)) desce(v);
    if (Array.isArray(n)) for (const v of n) desce(v);
  };
  desce(filtro);
  return partes.join(" ");
}

const envioDoPortalFingido = () => ({ enviarParaCandidaturas: async () => ({ recusados: [] }) });

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A PROMESSA DO CANCELAMENTO: QUEM FICOU VIVO NA VAGA MORTA CONTINUA ALCANÇÁVEL
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("1. transferir alguém que está VIVO numa vaga CANCELADA (Frente B x Frente D)", () => {
  /**
   * ┌─ POR QUE ESTE TESTE É A FRENTE B INTEIRA, E NÃO UM DETALHE ────────────────────────────────┐
   * │ O diretor revogou a trava que barrava o cancelamento com gente dentro, e o que ele comprou  │
   * │ no lugar foi ESTA promessa: "quem está em processo vai para a etapa Stand By, VIVO, e       │
   * │ continua encontrável para ser transferido ou realocado depois".                              │
   * │                                                                                             │
   * │ O CANCELAMENTO CUMPRE A METADE DELE (não descarta ninguém, e isso TEM teste). A outra        │
   * │ metade mora AQUI, em dois lugares que o autor do cancelamento não tocou: a LEITURA que       │
   * │ oferece a pessoa (`transferiveisPara`) e o GESTO que a move (`trocarVaga`). Bastaria um dos  │
   * │ dois passar a exigir vaga de origem viva, com a melhor das intenções, para a promessa virar  │
   * │ letra morta SEM NENHUM TESTE FICAR VERMELHO.                                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  function bancoDaLeitura() {
    let clausula = "";
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = (w: unknown) => {
      clausula = textoDe(w);
      return b;
    };
    b.orderBy = () => Promise.resolve([]);

    const db = {
      select: vi.fn(() => b),
      query: { vagas: { findFirst: vi.fn().mockResolvedValue({ id: "vaga-B" }) } },
    };
    const service = new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    );
    return { service, clausulaAtual: () => clausula };
  }

  it("a lista de transferíveis NÃO filtra pelo status da vaga de ORIGEM", async () => {
    const { service, clausulaAtual } = bancoDaLeitura();
    await service.transferiveisPara("vaga-B");

    const c = clausulaAtual().toLowerCase();
    /*
     * O RECORTE É DE SITUAÇÃO DA CANDIDATURA, e nunca de estado da VAGA: quem sobreviveu ao
     * cancelamento está VIVO, e é isso que o basta. Uma cláusula sobre `vagas.status`,
     * `encerrada_em` ou um join com a tabela de status esconderia exatamente quem a Frente B
     * prometeu manter alcançável.
     */
    for (const s of SITUACOES_VIVAS) expect(clausulaAtual()).toContain(s);
    expect(
      c,
      "filtrar por status da vaga de origem esconderia quem sobreviveu ao cancelamento, que é a promessa da Frente B.",
    ).not.toContain("status");
    expect(c).not.toContain("encerrada_em");
  });

  function bancoDaTroca(cenario: { vagaDeOrigem?: string; statusDoDestino?: string } = {}) {
    const candidatura = {
      id: "cand-1",
      candidatoId: "pessoa-1",
      // A VAGA DE ORIGEM FOI CANCELADA, e a pessoa foi para o Stand By, viva.
      vagaId: cenario.vagaDeOrigem ?? "vaga-cancelada",
      etapa: "STAND_BY",
      situacao: "ALOCADO" as const,
      motivoDescarte: null,
      posicaoLado: "OFICIAL",
      alocadoEm: AGORA,
      atualizadoEm: AGORA,
      ultimoContatoEm: null,
    };
    const destino = {
      id: "vaga-B",
      status: cenario.statusDoDestino ?? "ABERTA",
      posicoesOficiais: 5,
      posicoesBanco: 0,
      /*
       * O CLIENTE DO DESTINO É O MESMO DA ORIGEM AQUI, E ISSO É ESCOLHA DE CENÁRIO.
       *
       * A decisão 3 do diretor fez a transferência entre clientes DIFERENTES apagar a entrevista da
       * etapa de entrega ao cliente. Este arquivo não mede aquilo: ele mede QUAIS TABELAS a troca
       * escreve e que a vaga de ORIGEM encerrada não barra a saída. Deixar os dois clientes iguais
       * mantém cada teste medindo uma coisa só, em vez de arrastar o apagamento para dentro de uma
       * asserção que fala de outro assunto.
       *
       * QUEM MEDE A DECISÃO 3 é `candidatos.transferencia-entre-clientes.cobertura-independente`,
       * com cenário próprio para cliente igual, cliente diferente e cliente nulo.
       */
      codCliente: "CLI-1",
    };

    const travas: string[] = [];
    const updates: Escrita[] = [];
    const inserts: Escrita[] = [];

    const select = vi.fn((selecao?: Record<string, unknown>) => {
      const pedeOcupadas = Boolean(selecao && "ocupadas" in selecao);
      const b: Record<string, unknown> = {};
      b.from = () => b;
      b.where = () => b;
      b.innerJoin = () => b;
      b.leftJoin = () => b;
      b.orderBy = () =>
        Promise.resolve([
          {
            c: { ...candidatura, vagaId: "vaga-B" },
            candidatoNome: "Fulano",
            vagaCodigo: "PS-2",
            vagaNome: "Vaga B",
            autor: "Consultor",
          },
        ]);
      b.for = () => {
        travas.push(destino.id);
        return Promise.resolve([destino]);
      };
      b.limit = () => Promise.resolve([]);
      b.then = (r: (v: unknown) => unknown) =>
        Promise.resolve(pedeOcupadas ? [{ ocupadas: 0 }] : []).then(r);
      return b;
    });

    const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        lista.push({ tabela, valores });
        return { where: async () => undefined };
      },
      values: (v: Record<string, unknown>) => {
        lista.push({ tabela, valores: v });
        return Promise.resolve(undefined);
      },
    });

    const tx = {
      select,
      update: vi.fn(registrar(updates)),
      insert: vi.fn(registrar(inserts)),
      query: {
        asCandidaturas: { findFirst: vi.fn().mockResolvedValue(candidatura) },
        // A vaga de ORIGEM, que a troca passou a ler para comparar o cliente (decisão 3).
        vagas: { findFirst: vi.fn().mockResolvedValue({ codCliente: "CLI-1" }) },
      },
    };
    const db = {
      select,
      update: vi.fn(registrar(updates)),
      insert: vi.fn(registrar(inserts)),
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      query: {
        asCandidaturas: { findFirst: vi.fn().mockResolvedValue(candidatura) },
        // A vaga de ORIGEM, que a troca passou a ler para comparar o cliente (decisão 3).
        vagas: { findFirst: vi.fn().mockResolvedValue({ codCliente: "CLI-1" }) },
      },
    };

    const service = new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    );
    return { service, travas, updates, inserts };
  }

  it("o gesto PASSA: a vaga de origem cancelada não é consultada nem barra a saída", async () => {
    const { service, updates, travas } = bancoDaTroca();

    await service.trocarVaga(
      "cand-1",
      { vagaId: "vaga-B", motivo: "vaga cancelada, realocação" } as never,
      "user-comum",
    );

    expect(updates.filter((u) => u.tabela === asCandidaturas)[0].valores).toMatchObject({
      vagaId: "vaga-B",
    });
    /*
     * SÓ A VAGA DE DESTINO É TRAVADA, e é isso que prova que a de ORIGEM não foi consultada no
     * caminho da decisão. Se um dia alguém acrescentar um `FOR UPDATE` na origem para perguntar o
     * status dela, esta asserção quebra ANTES de a promessa da Frente B quebrar em produção.
     */
    expect(travas).toEqual(["vaga-B"]);
  });

  it("a etapa STAND_BY viaja com a pessoa: a transferência não mexe no funil", async () => {
    const { service, updates, inserts } = bancoDaTroca();

    await service.trocarVaga("cand-1", { vagaId: "vaga-B" } as never, "user-comum");

    const set = updates.filter((u) => u.tabela === asCandidaturas)[0].valores;
    expect(Object.keys(set)).not.toContain("etapa");
    expect(inserts.filter((i) => i.tabela === asCandidaturaEtapas)[0].valores).toMatchObject({
      etapaPara: "STAND_BY",
      vagaDe: "vaga-cancelada",
      vagaPara: "vaga-B",
    });
  });

  /**
   * O SENTIDO CONTRÁRIO CONTINUA FECHADO: a vaga ENCERRADA não RECEBE ninguém. Sem esta metade, o
   * "cancelar não descarta" viraria a porta para mover gente PARA dentro de uma vaga morta.
   */
  it("transferir PARA uma vaga cancelada é recusado, e nada é gravado", async () => {
    const { service, updates, inserts } = bancoDaTroca({ statusDoDestino: "CANCELADA" });

    await expect(
      service.trocarVaga("cand-1", { vagaId: "vaga-B" } as never, "user-comum"),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A SHORTLIST É CONGELADA, E A TRANSFERÊNCIA NÃO A DESCONGELA
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("2. transferir quem está numa SHORTLIST já enviada (Frente E x Frente D)", () => {
  /**
   * ┌─ O REQUISITO: "conjunto congelado no envio; mudou a lista, é REENVIO" ─────────────────────┐
   * │ O que o cliente recebeu naquele dia é FATO. Transferir a pessoa para outra vaga DEPOIS não  │
   * │ desfaz o envio, então o item NÃO pode ser apagado, e o gesto de transferir NÃO pode escrever │
   * │ em `as_shortlist_itens`.                                                                     │
   * │                                                                                             │
   * │ O RISCO É REAL E É DE BOA INTENÇÃO: a leitura da shortlist junta pelo `candidatura_id` e     │
   * │ mostra a ETAPA ATUAL. Alguém vendo "um candidato da shortlist da vaga A aparecendo com vaga  │
   * │ B" pode concluir que é inconsistência e "consertar" limpando o item. O teste declara que     │
   * │ aquilo é o comportamento CERTO.                                                              │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a transferência NÃO escreve em nenhuma tabela de shortlist", async () => {
    const candidatura = {
      id: "cand-1",
      candidatoId: "pessoa-1",
      vagaId: "vaga-A",
      etapa: "SHORTLIST",
      situacao: "ATIVO" as const,
      motivoDescarte: null,
      posicaoLado: null,
      alocadoEm: AGORA,
      atualizadoEm: AGORA,
      ultimoContatoEm: null,
    };
    const tocadas: unknown[] = [];

    const select = vi.fn((selecao?: Record<string, unknown>) => {
      const pedeOcupadas = Boolean(selecao && "ocupadas" in selecao);
      const b: Record<string, unknown> = {};
      b.from = () => b;
      b.where = () => b;
      b.innerJoin = () => b;
      b.leftJoin = () => b;
      b.orderBy = () =>
        Promise.resolve([
          {
            c: { ...candidatura, vagaId: "vaga-B" },
            candidatoNome: "Fulano",
            vagaCodigo: "PS-2",
            vagaNome: "Vaga B",
            autor: null,
          },
        ]);
      b.for = () =>
        Promise.resolve([
          { id: "vaga-B", status: "ABERTA", posicoesOficiais: 5, posicoesBanco: 0 },
        ]);
      b.limit = () => Promise.resolve([]);
      b.then = (r: (v: unknown) => unknown) =>
        Promise.resolve(pedeOcupadas ? [{ ocupadas: 0 }] : []).then(r);
      return b;
    });

    const registrar = (tabela: unknown) => {
      tocadas.push(tabela);
      return {
        set: () => ({ where: async () => undefined }),
        values: () => Promise.resolve(undefined),
      };
    };

    const tx = {
      select,
      update: vi.fn(registrar),
      insert: vi.fn(registrar),
      query: {
        asCandidaturas: { findFirst: async () => candidatura },
        // A vaga de ORIGEM, que a troca passou a ler para comparar o cliente (decisão 3).
        vagas: { findFirst: async () => ({ codCliente: "CLI-1" }) },
      },
    };
    const db = {
      select,
      update: vi.fn(registrar),
      insert: vi.fn(registrar),
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      query: {
        asCandidaturas: { findFirst: async () => candidatura },
        // A vaga de ORIGEM, que a troca passou a ler para comparar o cliente (decisão 3).
        vagas: { findFirst: async () => ({ codCliente: "CLI-1" }) },
      },
    };

    const service = new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    );

    await service.trocarVaga("cand-1", { vagaId: "vaga-B" } as never, "user-comum");

    /*
     * A AFIRMAÇÃO É POR IDENTIDADE E É EXAUSTIVA, e não uma busca por substring do nome: o gesto
     * escreve em DUAS tabelas, a candidatura e o histórico de etapas, e em mais NENHUMA. Qualquer
     * escrita nova (numa tabela de shortlist ou em outra) quebra esta lista, que é o que faz o
     * teste valer alguma coisa em vez de passar por o fake não ter onde escrever.
     */
    expect(new Set(tocadas)).toEqual(new Set([asCandidaturas, asCandidaturaEtapas]));
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. REPROVAR PELO CLIENTE NUMA VAGA QUE JÁ ACABOU
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("3. reprovar pelo cliente alguém de uma vaga ENCERRADA (Frente E x Frente B)", () => {
  /**
   * ┌─ O CAMINHO FECHADO, E ELE ESTÁ CERTO ──────────────────────────────────────────────────────┐
   * │ Depois do CANCELAMENTO com o Stand By configurado (que é o banco de hoje, migration 0130),  │
   * │ quem estava com o cliente foi movido para o Stand By. O Stand By NÃO é etapa de entrega,    │
   * │ então o gesto fica indisponível pela guarda de etapa. É a resposta certa pela razão certa:  │
   * │ não há mais cliente a quem reprovar.                                                         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("depois do cancelamento, quem foi para o Stand By não é reprovável pelo cliente", async () => {
    const { service, updates, inserts } = bancoDaReprovacao({
      vagaStatus: "CANCELADA",
      candidaturas: [linhaDaReprovacao({ etapa: "STAND_BY", situacao: "ATIVO" })],
      etapas: ["CAPTACAO", "TRIAGEM", "ENTREVISTA_SOULAN", "ENTREVISTA_CLIENTE", "APROVACAO"],
    });

    await expect(
      service.reprovarPeloCliente("cand-1", { motivo: "cliente recusou" } as never, "user-1"),
    ).rejects.toThrow();

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  /**
   * ┌─ O CAMINHO ABERTO, E ELE É O DEFEITO (teste VERMELHO de propósito, §A.38) ─────────────────┐
   * │ `reprovarPeloCliente` NÃO OLHA O ESTADO DA VAGA. As guardas dele são três, e todas são      │
   * │ sobre a CANDIDATURA: existe, está viva, está em etapa de entrega. Nenhuma pergunta se a     │
   * │ vaga ainda existe como processo.                                                             │
   * │                                                                                              │
   * │ O CENÁRIO É O CAMINHO FELIZ DA FRENTE B, e não uma borda inventada:                          │
   * │   1. a vaga fica ENTREGUE porque o candidato está na Entrevista Cliente;                     │
   * │   2. ele é contratado e a vaga FECHA a partir da entrega (o caminho que a Frente B abriu);   │
   * │   3. a trava 5 do fechamento NÃO barra um `ALOCADO` (para ela, ALOCADO é TRATADO), então a   │
   * │      pessoa continua na Entrevista Cliente, viva, numa vaga FECHADA;                         │
   * │   4. um clique em "reprovado pelo cliente" a devolve para a Captação de uma vaga terminada.  │
   * │                                                                                              │
   * │ O QUE SOBRA DISSO: um ALOCADO (que CONSOME POSIÇÃO) parado na primeira etapa do funil de um  │
   * │ processo encerrado, contado pelos KPIs de funil da vaga, com a linha do tempo dizendo que o  │
   * │ cliente o reprovou DEPOIS de a vaga ter fechado entregando a posição dele. A derivação de    │
   * │ status não corrige nada (ela sai no papel FECHAMENTO), então nada acusa.                      │
   * │                                                                                              │
   * │ A MESMA FRESTA EXISTE EM `moverEtapa` e em `marcarEntrevista`, e nos três o remédio é o      │
   * │ mesmo: perguntar `papelDeVagaEmProcesso` sobre a vaga da candidatura, que é a régua que o    │
   * │ `fechar`, o `cancelar` e a shortlist já usam. `moverEtapa` é código VALIDADO e anterior a    │
   * │ esta sessão (§A.26); `reprovarPeloCliente` NASCEU AGORA, e é sobre ele que este teste        │
   * │ afirma. O `tester` REPORTA; quem decide o alcance do conserto é o diretor.                    │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a reprovação pelo cliente é RECUSADA numa vaga FECHADA, e ninguém é movido", async () => {
    const { service, updates, inserts } = bancoDaReprovacao({
      vagaStatus: "FECHADA",
      candidaturas: [linhaDaReprovacao({ etapa: "ENTREVISTA_CLIENTE", situacao: "ALOCADO" })],
    });

    await expect(
      service.reprovarPeloCliente("cand-1", { motivo: "cliente recusou" } as never, "user-1"),
      "a vaga FECHADA não tem processo vivo: devolver alguém ao começo do funil dela cria um ALOCADO em Captação num processo terminado, e nada no sistema acusa.",
    ).rejects.toThrow();

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. A PRETENSÃO SALARIAL E A VOLTA AO PROCESSO
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("3. a PRETENSÃO SALARIAL fica pendurada na candidatura que VOLTA ao processo", () => {
  /**
   * ┌─ O DEFEITO, E ELE É O ARGUMENTO DO PRÓPRIO ARQUIVO APLICADO À COLUNA NOVA ─────────────────┐
   * │ `restaurar-candidatura.ts` já explica, em bloco próprio, por que o `motivo_descarte` VAI A  │
   * │ NULO na volta:                                                                              │
   * │                                                                                             │
   * │   "`gravarSaidaDaCandidatura` escreve situação E motivo no MESMO `set`. Restaurar só a      │
   * │    situação deixaria uma candidatura VIVA carregando [...] como motivo de descarte, e esse  │
   * │    campo é exposto no `AsCandidaturaItem`: toda tela que o leia mostraria a explicação de um │
   * │    desfecho que não vale mais, sem erro e sem aviso."                                        │
   * │                                                                                             │
   * │ A FRENTE E ACRESCENTOU `pretensao_salarial` NAQUELE MESMO `set` (`encerrar-candidatura.ts`) │
   * │ e NAQUELE MESMO `AsCandidaturaItem` (`candidatos.service.ts`, a projeção do item). A volta   │
   * │ NÃO foi atualizada: o motivo some, o NÚMERO fica.                                            │
   * │                                                                                             │
   * │ E O ESTRAGO É MAIOR AQUI DO QUE NO MOTIVO, por duas razões que se somam:                     │
   * │   1. É DADO FINANCEIRO DE PESSOA (§A.6). O próprio `exigirPretensaoQuandoOMotivoPede`       │
   * │      RECUSA o valor quando o motivo não o pede, com a palavra "minimização". Uma candidatura │
   * │      VIVA sem motivo nenhum carregando o número é a violação exata que aquela guarda existe  │
   * │      para evitar, chegando pela outra ponta.                                                  │
   * │   2. O NÚMERO FICA SEM CONTEXTO. O motivo que o explicava ("pede pretensão") foi apagado na  │
   * │      mesma escrita, então a tela mostra um salário pretendido sem dizer de onde ele veio.     │
   * │                                                                                             │
   * │ QUANDO ISTO ACONTECE NA OPERAÇÃO: pessoa descartada por motivo marcado "pede pretensão", e   │
   * │ depois trazida de volta pela reabertura da vaga (`vagas.service.reabrir`) ou pela reversão    │
   * │ do envio para a admissão. Os dois caminhos passam por aqui ou pelo irmão, e nenhum dos dois  │
   * │ limpa a coluna.                                                                               │
   * │                                                                                             │
   * │ ESTE TESTE NASCEU VERMELHO (26/09, 02:52) e passou a verde com a correção de UMA LINHA      │
   * │ (`pretensaoSalarial: null` no `set` da restauração), aplicada em `restaurar-candidatura.ts`  │
   * │ no mesmo dia, 02:55. ELE FICA porque a linha é fácil de sumir numa refatoração e o defeito   │
   * │ não faz barulho: nada falha, a tela só passa a exibir um salário que ninguém coletou para    │
   * │ aquele processo.                                                                              │
   * │                                                                                              │
   * │ A OUTRA PORTA DE VOLTA, `reverterEnvioParaAdmissao`, FOI CONFERIDA E NÃO TEM O PROBLEMA, e   │
   * │ a razão é de régua, não de sorte: `ENVIADO_PARA_ADMISSAO` está FORA de                       │
   * │ `SITUACOES_COM_MOTIVO_DE_CATALOGO`, então aquele caminho tem `motivo === null`, cai no ramo   │
   * │ "não pede" e RECUSA o valor. A coluna nunca é escrita por ali, logo não há o que limpar.      │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a restauração apaga a pretensão junto com o motivo, e não só o motivo", async () => {
    const escritas: Escrita[] = [];
    const tx = {
      update: () => ({
        set: (valores: Record<string, unknown>) => {
          escritas.push({ tabela: asCandidaturas, valores });
          return { where: () => ({ returning: async () => [{ id: "cand-1" }] }) };
        },
      }),
      insert: () => ({ values: async () => undefined }),
    };

    await restaurarCandidatura(
      tx as never,
      {
        id: "cand-1",
        situacaoAtual: "DESCARTADO",
        etapaDestino: "ENTREVISTA_CLIENTE",
        situacao: "ATIVO",
        posicaoLadoOrigem: null,
      } as never,
      { motivo: "Vaga reaberta", porId: "user-master", vagaStatusEventoId: null } as never,
    );

    const set = escritas[0].valores;
    expect(set.motivoDescarte, "o motivo já é apagado hoje, e é a referência da régua").toBeNull();
    expect(
      set,
      "a pretensão salarial foi gravada no MESMO `set` da saída e é exposta no MESMO item de leitura; a volta tem de desfazer as duas, ou a candidatura VIVA fica com dado financeiro de um desfecho que não vale mais (§A.6).",
    ).toHaveProperty("pretensaoSalarial", null);
  });
});
