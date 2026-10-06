import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import { VagasService } from "./vagas.service";
import { bancoDeStatus, erroDe, statusSemente, type LinhaStatus } from "./vaga-status.tester-fake";

/**
 * ─ A VAGA DO PANDAPÉ SÓ SAI DA FILA COMPLETA, E ATÉ LÁ ELA É EDITÁVEL ─────────────────────────
 *
 * ┌─ O BURACO QUE ESTE ARQUIVO FECHA, MEDIDO ANTES DE CONSTRUIR ────────────────────────────────┐
 * │ A liberação pedia SÓ O CLIENTE e não cobrava obrigatório nenhum: a vaga espelhada saía da   │
 * │ fila para o papel ABERTURA com código, cargo, natureza, linha de serviço, data de abertura  │
 * │ e PREVISÃO DE ENTREGA possivelmente vazios. Depois disso ninguém mais sabia que faltava     │
 * │ alguma coisa, porque a fila é o próprio estado: saiu, sumiu. E a régua da abertura não a    │
 * │ alcançava, porque `atualizar` exigia o papel RASCUNHO e `moverStatus` recusa publicar a vaga│
 * │ em revisão, então a LIBERAÇÃO era a única porta e era a única sem régua.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO ONZE OBRIGATÓRIOS, e não dez: `codCliente`, `codigo`, `nomeDivulgacao`, `cargoId`,
 * `posicoesOficiais`, `natureza`, `sazonalidade`, `linhaServicoId`, `status`, `dataAbertura` e
 * `dataLimite`. O último é a "Previsão de entrega" da tela, o campo do SLA, e é o que costuma ser
 * esquecido em qualquer contagem feita de cabeça.
 *
 * AS DUAS PORTAS SÃO MEDIDAS AQUI, e a divisão entre elas é o coração da frente:
 *   . `atualizar` (PATCH) passa a aceitar o papel REVISAO para ESCREVER CAMPO, e SEM MOVER A VAGA;
 *   . `liberarPendenteRevisao` (POST) recebe o formulário inteiro, cobra os onze e move, tudo numa
 *     transação só.
 *
 * §A.6: códigos de cliente, códigos de status e um id de usuário interno. Nenhum dado de candidato
 * entra neste arquivo, e o CPF do substituído não é exercitado em lugar nenhum dele.
 */

const USUARIO: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const CLIENTE = "CLI-A";
const CARGO = "11111111-1111-4111-8111-111111111111";
const BENEFICIO = "22222222-2222-4222-8222-222222222222";
const MOTIVO_CANCELAMENTO_ID = "33333333-3333-4333-8333-333333333333";
const MOTIVO_CANCELAMENTO = "Cliente desistiu";

/** O catálogo injetado, fingido, com a RÉGUA DE PRODUÇÃO dentro (molde do spec da correção). */
function catalogoDeStatusFingido(linhas: LinhaStatus[]) {
  const regua = new ReguaDeStatusDaVaga(linhas);
  return new Proxy(
    { regua: async () => regua },
    {
      get: (alvo, prop: string) => {
        if (prop in alvo) return (alvo as Record<string, unknown>)[prop];
        if (prop === "then") return undefined;
        return async (...args: unknown[]) => {
          const codigo = args.find((a) => typeof a === "string") as string | undefined;
          if (/codigo/i.test(prop) && /papel/i.test(prop)) return regua.codigoDoPapel(codigo as never);
          const linha = linhas.find((l) => l.codigo === codigo);
          if (linha) return { ...linha };
          return linhas.map((l) => ({ ...l }));
        };
      },
    },
  );
}

/**
 * OS CATÁLOGOS QUE O BANCO FINGIDO COMPARTILHADO NÃO SERVE.
 *
 * ELE É CRU DE PROPÓSITO (o comentário dele diz isso), e conhece cinco tabelas. A trilha, porém,
 * CONFERE a linha de serviço e o benefício contra os catálogos antes de gravar, e a conferência da
 * linha de serviço LANÇA quando não acha (é assim que "linha inexistente" é recusada em produção).
 * Sem estas duas listas, o vermelho falaria do dublê e não da régua. A envoltória intercepta
 * SOMENTE estas leituras; tudo o mais continua indo para o banco fingido original, inclusive
 * dentro da transação.
 */
const CATALOGOS: Record<string, Record<string, unknown>[]> = {
  as_linhas_servico: [{ id: 1, codigo: "OPERACAO", rotulo: "Operação", ordem: 1, ativo: true }],
  beneficios_catalogo: [{ id: BENEFICIO, ativo: true }],
  /*
   * O MOTIVO DE CANCELAMENTO ENTROU PELA PROPRIEDADE DO BLOCO (f), e a entrada não é decoração: o
   * `cancelar` confere o motivo contra o catálogo ATIVO antes de qualquer outra coisa, então, sem
   * esta linha, ele morreria em "motivo inválido" e o caso do encerramento ficaria VERDE sem nunca
   * ter chegado ao gate que ele existe para medir. Um teste de propriedade que não alcança a
   * guarda não é teste de propriedade, é um vácuo com nome bonito.
   */
  motivos_cancelamento_vaga: [{ id: MOTIVO_CANCELAMENTO_ID, nome: MOTIVO_CANCELAMENTO, ativo: true }],
};

function bancoComCatalogos(db: unknown): unknown {
  const respondido = (linhas: Record<string, unknown>[]): Record<string, unknown> => {
    const eu: Record<string, unknown> = {};
    for (const m of ["where", "limit", "orderBy", "groupBy", "innerJoin", "leftJoin", "for"]) {
      eu[m] = () => eu;
    }
    eu.then = (ok: (v: unknown) => unknown) => Promise.resolve(linhas).then(ok);
    return eu;
  };
  const envolver = (executor: Record<string, unknown>): Record<string, unknown> =>
    new Proxy(executor, {
      get(alvo, prop: string) {
        if (prop === "select") {
          return (proj?: unknown) => {
            const construtor = (alvo.select as (p?: unknown) => Record<string, unknown>)(proj);
            return new Proxy(construtor, {
              get(c, p: string) {
                if (p !== "from") return c[p];
                return (t: unknown) => {
                  const nome = getTableName(t as never);
                  return CATALOGOS[nome]
                    ? respondido(CATALOGOS[nome])
                    : (c.from as (x: unknown) => unknown)(t);
                };
              },
            });
          };
        }
        if (prop === "transaction") {
          return (fn: (tx: unknown) => Promise<unknown>) =>
            (alvo.transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>)((tx) =>
              fn(envolver(tx as Record<string, unknown>)),
            );
        }
        return alvo[prop];
      },
    });
  return envolver(db as Record<string, unknown>);
}

/** A vaga espelhada, no papel que o cenário pedir, com os campos que a régua lê. */
function vagaDe(status: string, campos: Record<string, unknown> = {}) {
  return {
    id: "vaga-1",
    codigo: "PS-DO-ATS",
    nomeDivulgacao: "Vaga espelhada do ATS",
    status,
    codCliente: null,
    cargoId: null,
    posicoesOficiais: 2,
    posicoesBanco: 0,
    natureza: null,
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: null,
    dataAbertura: null,
    dataLimite: null,
    abertoPorId: null,
    cidadeId: null,
    vagasFechadas: null,
    vagasFechadasBanco: null,
    dataFechamento: null,
    escolaridade: null,
    regioes: [],
    idiomas: [],
    testes: [],
    criadoEm: new Date("2026-09-15T12:00:00.000Z"),
    atualizadoEm: new Date("2026-09-15T12:00:00.000Z"),
    fechamentoForcadoPorId: null,
    fechamentoForcadoEm: null,
    fechamentoForcadoFaltavam: null,
    canceladaPorId: null,
    canceladaEm: null,
    cancelamentoMotivo: null,
    cancelamentoObservacao: null,
    ...campos,
  };
}

function cenario(papel: "REVISAO" | "RASCUNHO" | "ABERTURA", campos: Record<string, unknown> = {}) {
  const linhas = statusSemente();
  const regua = new ReguaDeStatusDaVaga(linhas);
  const codigo = regua.codigoDoPapel(papel);
  const banco = bancoDeStatus({
    status: linhas,
    clientes: [{ codCliente: CLIENTE }],
    vagas: [vagaDe(codigo, campos)],
  });
  const Construtor = VagasService as unknown as new (...a: unknown[]) => VagasService;
  const service = new Construtor(
    bancoComCatalogos(banco.db),
    catalogoDeEtapasFingido(),
    catalogoDeStatusFingido(linhas),
  );
  return {
    banco,
    service,
    vaga: banco.vagas[0],
    codigoDaFila: regua.codigoDoPapel("REVISAO"),
    codigoAbertura: regua.codigoDoPapel("ABERTURA"),
    codigoRascunho: regua.codigoDoPapel("RASCUNHO"),
  };
}

/**
 * O FORMULÁRIO COMPLETO, com os ONZE. O `codigo` é DIFERENTE do que está gravado na vaga de
 * propósito: o dublê compartilhado não sabe o que é `ne(id, ...)`, então um código igual ao da
 * própria vaga voltaria da trava de duplicidade como "já usado por ela mesma".
 */
const FORMULARIO_COMPLETO = {
  codCliente: CLIENTE,
  codigo: "PS-2026-901",
  nomeDivulgacao: "Operador de Loja",
  cargoId: CARGO,
  posicoesOficiais: 2,
  natureza: "EFETIVA",
  sazonalidade: "OPERACAO_PADRAO",
  linhaServicoId: 1,
  dataAbertura: "2026-09-01",
  dataLimite: "2026-09-30",
};

const escritasEm = (banco: ReturnType<typeof cenario>["banco"], tabela: string, tipo: string) =>
  banco.escritas.filter((e) => e.tabela === tabela && e.tipo === tipo);

// ── (a) EDITAR A VAGA NA FILA: ESCREVE CAMPO, NÃO MOVE A VAGA ────────────────────────────────

describe("o PATCH aceita a vaga em REVISAO para ESCREVER CAMPO, e nunca para movê-la", () => {
  it("grava o campo e mantém a vaga na fila", async () => {
    const { service, vaga, codigoDaFila } = cenario("REVISAO");
    await service.atualizar("vaga-1", { ...FORMULARIO_COMPLETO } as never, USUARIO.id);

    expect(vaga.codigo, "o campo digitado na revisão não foi gravado").toBe("PS-2026-901");
    expect(vaga.cargoId).toBe(CARGO);
    expect(vaga.dataLimite, "a previsão de entrega é campo como qualquer outro na edição").toBe(
      "2026-09-30",
    );
    expect(
      vaga.status,
      "A EDIÇÃO TIROU A VAGA DA FILA. A fila é o próprio estado: saindo por aqui, ela sai sem a régua dos onze, sem o cliente conferido e sem uma linha de trilha dizendo que saiu.",
    ).toBe(codigoDaFila);
  });

  it("IGNORA o `status` do corpo, que é a trava e não uma conveniência", async () => {
    const { service, vaga, banco, codigoDaFila, codigoAbertura } = cenario("REVISAO");
    await service.atualizar(
      "vaga-1",
      { ...FORMULARIO_COMPLETO, status: codigoAbertura } as never,
      USUARIO.id,
    );

    expect(
      vaga.status,
      "o corpo publicou a vaga por uma rota de EDIÇÃO. O papel REVISAO tem `daTrilha` DESLIGADO, então a trava do catálogo não protege esta porta.",
    ).toBe(codigoDaFila);
    expect(
      escritasEm(banco, "as_vaga_status_eventos", "insert"),
      "edição de campo não é passagem por status, e um evento inventado aqui mentiria na trilha",
    ).toHaveLength(0);
  });

  it("NÃO cobra os obrigatórios: o trabalho pela metade é salvável", async () => {
    const { service, vaga } = cenario("REVISAO");
    const erro = await erroDe(() =>
      service.atualizar("vaga-1", { nomeDivulgacao: "Só o nome, por enquanto" } as never, USUARIO.id),
    );
    expect(
      erro,
      "quem completa onze obrigatórios mais salário, benefícios e escala não termina em uma sentada: recusar o salvamento parcial devolve a pessoa ao Cancelar, que é onde tudo se perde.",
    ).toBeNull();
    expect(vaga.nomeDivulgacao).toBe("Só o nome, por enquanto");
  });

  it("PRESERVA `id_vacancy_pandape` ao editar: o PATCH não zera o que a varredura escreve", async () => {
    const { service, vaga, banco } = cenario("REVISAO", {
      idVacancyPandape: "VAGA-PANDAPE-9001",
      envioShortlist: "2026-08-10",
    });
    await service.atualizar("vaga-1", { ...FORMULARIO_COMPLETO } as never, USUARIO.id);

    expect(vaga.codigo, "o campo do formulário é gravado").toBe("PS-2026-901");
    expect(
      vaga.idVacancyPandape,
      "o PATCH em revisão zerou o id do Pandapé: a varredura perde a vaga e duplica",
    ).toBe("VAGA-PANDAPE-9001");
    expect(vaga.envioShortlist).toBe("2026-08-10");

    const naVaga = escritasEm(banco, "vagas", "update");
    expect(naVaga).toHaveLength(1);
    expect("idVacancyPandape" in naVaga[0].valores).toBe(false);
    expect("envioShortlist" in naVaga[0].valores).toBe(false);
  });
});

// ── (b) LIBERAR SEM OS ONZE: RECUSA COM A LISTA INTEIRA, E SEM ESCREVER NADA ─────────────────

describe("a liberação recusa a vaga incompleta, com a lista inteira, antes de qualquer escrita", () => {
  it("lista TODAS as pendências de uma vez, inclusive a Previsão de entrega", async () => {
    const { service } = cenario("REVISAO");
    const erro = (await erroDe(() =>
      service.liberarPendenteRevisao(
        "vaga-1",
        USUARIO,
        { ...FORMULARIO_COMPLETO, cargoId: undefined, natureza: undefined, dataLimite: undefined } as never,
      ),
    )) as { message?: string } | null;

    const frase = String(erro?.message ?? "");
    expect(erro, "a vaga incompleta saiu da fila").not.toBeNull();
    expect(frase, "falta o Cargo e a mensagem não diz").toContain("Cargo");
    /*
     * O ROTULO MUDOU EM 30/09/2026, e este canario foi quem pegou: "Natureza" virou "Tipo de
     * vaga", por decisao do diretor, e a asserção antiga exigia a palavra velha. Mantido o que o
     * teste SEMPRE quis dizer, que e "o campo que falta aparece na frase", so que com o nome que
     * a pessoa le na tela. O ARTIGO mudou junto ("falta O tipo de vaga", nao "a"), senao a
     * mensagem sairia em portugues torto.
     */
    expect(frase, "falta o Tipo de vaga e a mensagem não diz").toContain("Tipo de vaga");
    expect(
      frase,
      "a PREVISÃO DE ENTREGA é o obrigatório que costuma ser esquecido, e é o campo do SLA: sem ele na lista, a pessoa corrige duas vezes e descobre a terceira na terceira volta",
    ).toContain("Previsão de entrega");
  });

  it("não grava NADA, nem o cliente", async () => {
    const { service, banco, vaga, codigoDaFila } = cenario("REVISAO");
    await erroDe(() =>
      service.liberarPendenteRevisao(
        "vaga-1",
        USUARIO,
        { ...FORMULARIO_COMPLETO, dataLimite: undefined } as never,
      ),
    );

    expect(
      banco.escritas,
      "recusa que já gravou não é recusa: a vaga ficaria com o cliente e o formulário pela metade, ainda na fila, e a retentativa teria de adivinhar onde parou",
    ).toEqual([]);
    expect(vaga.codCliente).toBeNull();
    expect(vaga.status).toBe(codigoDaFila);
  });

  it("a vaga já publicada continua fora desta porta", async () => {
    const { service, banco } = cenario("ABERTURA");
    const erro = await erroDe(() =>
      service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never),
    );
    expect(
      erro,
      "o corpo completo não dispensa a fila: seria uma SEGUNDA porta para o papel ABERTURA",
    ).not.toBeNull();
    expect(banco.escritas).toEqual([]);
  });
});

// ── (c) LIBERAR COMPLETO: GRAVA OS CAMPOS E MOVE, NUMA TRANSAÇÃO SÓ ─────────────────────────

describe("a liberação completa grava o formulário E move a vaga, na mesma transação", () => {
  it("grava os onze e tira a vaga da fila", async () => {
    const { service, vaga, codigoAbertura } = cenario("REVISAO");
    await service.liberarPendenteRevisao(
      "vaga-1",
      USUARIO,
      { ...FORMULARIO_COMPLETO, beneficios: [{ beneficioId: BENEFICIO, valor: "200" }] } as never,
    );

    expect(vaga.status, "a vaga não foi para o código do papel ABERTURA").toBe(codigoAbertura);
    expect(vaga.codCliente).toBe(CLIENTE);
    expect(vaga.codigo).toBe("PS-2026-901");
    expect(vaga.cargoId).toBe(CARGO);
    expect(vaga.natureza).toBe("EFETIVA");
    expect(vaga.linhaServicoId).toBe(1);
    expect(vaga.dataAbertura).toBe("2026-09-01");
    expect(vaga.dataLimite).toBe("2026-09-30");
  });

  it("os campos e a saída da fila são UMA escrita, dentro da transação, com a trilha junto", async () => {
    const { service, banco, codigoDaFila, codigoAbertura } = cenario("REVISAO");
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    const naVaga = escritasEm(banco, "vagas", "update");
    expect(
      naVaga,
      "duas escritas deixariam a vaga preenchida e ainda na fila quando a segunda falhasse",
    ).toHaveLength(1);
    expect(naVaga[0].valores.status).toBe(codigoAbertura);
    expect(naVaga[0].valores.codigo).toBe("PS-2026-901");
    expect(
      naVaga[0].naTransacao,
      "escrita fora da transação sobrevive ao que a transação desfaz",
    ).toBe(true);

    const evento = escritasEm(banco, "as_vaga_status_eventos", "insert");
    expect(evento, "a saída da fila não deixou evento na trilha").toHaveLength(1);
    expect(evento[0].valores.de).toBe(codigoDaFila);
    expect(evento[0].valores.para).toBe(codigoAbertura);
    expect(evento[0].valores.porId, "autoria é trilha, nunca campo de formulário").toBe(USUARIO.id);
    expect(evento[0].naTransacao).toBe(true);
  });

  it("a decisão é tomada com a linha da vaga TRAVADA, e a escrita vem depois", async () => {
    const { service, banco } = cenario("REVISAO");
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    const trava = banco.ordem.indexOf("trava:vagas:tx");
    const escrita = banco.ordem.findIndex((o) => o.startsWith("update:vagas"));
    expect(trava, "a vaga não foi travada").toBeGreaterThanOrEqual(0);
    expect(
      trava,
      "entre o clique e a gravação alguém pode ter mexido na vaga: a régua tem de ler a linha travada",
    ).toBeLessThan(escrita);
  });

  it("o `status` no corpo não escolhe o destino: ele continua sendo o papel ABERTURA", async () => {
    const { service, vaga, codigoAbertura } = cenario("REVISAO");
    await service.liberarPendenteRevisao(
      "vaga-1",
      USUARIO,
      { ...FORMULARIO_COMPLETO, status: "CANCELADA" } as never,
    );
    expect(
      vaga.status,
      "o corpo escolheu o status: a liberação viraria a porta SEM RÉGUA para qualquer status, inclusive os que encerram a vaga",
    ).toBe(codigoAbertura);
  });

  /**
   * A LIBERAÇÃO PASSOU A SER O TERCEIRO ESCRITOR DE `posicoes_oficiais`, e os outros dois têm
   * rastro desde a auditoria de 09/09. A vaga na fila RECEBE CANDIDATO (`PENDENTE_REVISAO` tem
   * `recebeCandidato: true`), então baixar a meta por aqui sem rastro devolveria, por uma porta
   * nova, o desvio que aquela auditoria fechou: meta menor, `faltam` zerado e a vaga fechando sem
   * Master nem trilha.
   */
  it("baixar a meta na liberação deixa rastro, na mesma transação", async () => {
    const { service, banco } = cenario("REVISAO");
    await service.liberarPendenteRevisao(
      "vaga-1",
      USUARIO,
      { ...FORMULARIO_COMPLETO, posicoesOficiais: 1 } as never,
    );

    const rastro = escritasEm(banco, "vaga_meta_reducoes", "insert");
    expect(rastro, "a meta caiu de 2 para 1 e nada foi registrado").toHaveLength(1);
    expect(Object.values(rastro[0].valores)).toContain(USUARIO.id);
    expect(rastro[0].naTransacao).toBe(true);
  });

  it("o corpo SEM campos de vaga continua liberando pelo gesto antigo, sem apagar a vaga", async () => {
    const { service, vaga, codigoAbertura } = cenario("REVISAO", {
      ...FORMULARIO_COMPLETO,
      codCliente: CLIENTE,
      codigo: "PS-DO-ATS",
    });
    await service.liberarPendenteRevisao("vaga-1", USUARIO, {} as never);

    expect(vaga.status).toBe(codigoAbertura);
    expect(
      vaga.nomeDivulgacao,
      "a regra da trilha é `o corpo é completo`: aplicada a um corpo vazio, ela apagaria a vaga inteira na saída da fila",
    ).toBe("Operador de Loja");
    expect(vaga.cargoId).toBe(CARGO);
  });

  /**
   * ─ A LIBERAÇÃO PRESERVA `id_vacancy_pandape`, E ESSA É A CAUSA DA DUPLICAÇÃO DE VAGAS ─────────
   *
   * ┌─ O DEFEITO, MEDIDO NA PRODUÇÃO ────────────────────────────────────────────────────────────┐
   * │ A varredura do Pandapé reconhece a vaga existente pela coluna `id_vacancy_pandape`. A        │
   * │ liberação espalhava `camposDaTrilha` direto no UPDATE, e como NENHUM formulário manda         │
   * │ `idVacancyPandape` nem `envioShortlist` (os dois estão em `AS_VAGA_CAMPOS_NUNCA_EDITAVEIS`),  │
   * │ o montador os emitia como null e o UPDATE ZERAVA a coluna. Sem o id, a varredura não achava a │
   * │ vaga e criava uma DUPLICATA no ciclo seguinte (12 min depois).                                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O FORMULÁRIO DE COMPLETUDE NÃO TRAZ ESSES DOIS CAMPOS (eles não existem na tela), então o teste
   * é exatamente o caminho real: vaga com o id do Pandapé gravado, corpo completo SEM o id, e a
   * coluna tem de sair INTOCADA. `codigo` e `status`, que também estão na lista, continuam sendo
   * escritos de propósito (o código vem do corpo, o status vira o papel ABERTURA).
   */
  it("PRESERVA `id_vacancy_pandape` e `envio_shortlist`: a liberação não zera o que a varredura escreve", async () => {
    const { service, vaga, banco, codigoAbertura } = cenario("REVISAO", {
      idVacancyPandape: "VAGA-PANDAPE-9001",
      envioShortlist: "2026-08-10",
    });
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    expect(vaga.status, "a liberação não moveu a vaga").toBe(codigoAbertura);
    expect(vaga.codigo, "o código do formulário é escrito de propósito").toBe("PS-2026-901");
    expect(
      vaga.idVacancyPandape,
      "o id do Pandapé foi ZERADO na liberação: a varredura não acha a vaga e cria uma DUPLICATA",
    ).toBe("VAGA-PANDAPE-9001");
    expect(
      vaga.envioShortlist,
      "o envio da shortlist foi ZERADO na liberação, um carimbo que nenhum formulário de vaga escreve",
    ).toBe("2026-08-10");

    const naVaga = escritasEm(banco, "vagas", "update");
    expect(naVaga, "a liberação completa é uma escrita só").toHaveLength(1);
    expect(
      "idVacancyPandape" in naVaga[0].valores,
      "a chave foi para o `.set()`: escrever a coluna, mesmo que com o valor atual, é confiar no corpo, e o corpo não tem o campo",
    ).toBe(false);
    expect("envioShortlist" in naVaga[0].valores).toBe(false);
  });
});

// ── (e) A INVARIANTE: VAGA EM PROCESSO SEMPRE TEM CLIENTE ───────────────────────────────────

/**
 * ─ "VAGA EM PROCESSO SEMPRE TEM CLIENTE": A INVARIANTE, E POR QUE ELA PRECISA DE TESTE PRÓPRIO ─
 *
 * ┌─ ELA DEIXOU DE SER UMA CONVENIÊNCIA E PASSOU A SUSTENTAR COMPORTAMENTO ────────────────────┐
 * │ A transferência entre clientes (decisão 3) apaga a entrevista do CLIENTE quando a vaga de   │
 * │ origem e a de destino são de clientes DIFERENTES, e se ABSTÉM quando algum lado é NULO      │
 * │ ("não sei" não é "é outro"). Perguntar se o caso de origem NULA existe é perguntar se uma   │
 * │ candidatura com entrevista de cliente pode viver numa vaga sem cliente, e a resposta vem    │
 * │ desta invariante: marcar entrevista exige `papelDeVagaEmProcesso` (ABERTURA ou ENTREGA), e  │
 * │ nenhuma vaga chega a esses papéis sem cliente. Enquanto isto for verdade, aquele caso é     │
 * │ IMPOSSÍVEL por construção, e não apenas raro.                                                │
 * │                                                                                              │
 * │ SÃO DUAS PORTAS PARA O PAPEL ABERTURA, E AS DUAS ESTÃO AQUI. Uma sozinha não prova nada: a  │
 * │ trava da liberação já existia e ainda assim a vaga em revisão saía publicada pelo           │
 * │ `moverStatus`, que é o defeito que a `exigeReguaDeAbertura` fechou. Testar só uma delas é   │
 * │ afirmar a invariante olhando para metade do sistema.                                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE BLOCO MEDE AS DUAS PORTAS, UMA A UMA, E ISSO NÃO BASTA. `reabrir` grava o código de
 * abertura SEM OLHAR O CLIENTE, e só é seguro porque `fechar` e `cancelar` gateiam em
 * `papelDeVagaEmProcesso` num OUTRO ponto do arquivo: afrouxe aquele gate remoto e a invariante cai
 * aqui, em silêncio, sem nenhum destes casos ficar vermelho. É por isso que o bloco (f), logo
 * abaixo, afirma a PROPRIEDADE inteira em vez de mais um caso. Os dois se complementam: estes casos
 * dizem QUAL é a frase e QUANDO a recusa acontece; o de baixo diz que não sobrou porta nenhuma.
 */
describe("a invariante: nenhuma porta leva ao papel ABERTURA sem cliente", () => {
  it("a liberação recusa a vaga sem cliente, e a recusa vem ANTES de qualquer escrita", async () => {
    const { service, banco, vaga, codigoDaFila } = cenario("REVISAO");
    const erro = (await erroDe(() =>
      service.liberarPendenteRevisao(
        "vaga-1",
        USUARIO,
        { ...FORMULARIO_COMPLETO, codCliente: undefined } as never,
      ),
    )) as { message?: string } | null;

    expect(erro, "a vaga sem cliente saiu da fila: a invariante caiu").not.toBeNull();
    expect(
      String(erro?.message ?? ""),
      "a frase é o que diz ao consultor o que fazer: o vínculo do cliente é o que a revisão existe para resolver",
    ).toContain("Vincule o cliente desta vaga antes de liberar");
    expect(
      banco.escritas,
      "recusa que já gravou não é recusa: a vaga ficaria com o formulário pela metade, ainda na fila",
    ).toEqual([]);
    expect(vaga.status).toBe(codigoDaFila);
    expect(vaga.codCliente).toBeNull();
  });

  it("o corpo VAZIO não contorna a trava: a vaga da fila continua sem cliente gravado", async () => {
    // O GESTO ANTIGO (liberar sem mandar formulário) lê o cliente da LINHA TRAVADA. Sem ele lá, a
    // trava tem de valer igual: é o caminho em que ninguém digitou nada e é o mais fácil de acionar.
    const { service, banco, vaga, codigoDaFila } = cenario("REVISAO");
    const erro = await erroDe(() => service.liberarPendenteRevisao("vaga-1", USUARIO, {} as never));

    expect(erro).not.toBeNull();
    expect(banco.escritas).toEqual([]);
    expect(vaga.status).toBe(codigoDaFila);
  });

  /**
   * A SEGUNDA PORTA. `PENDENTE_REVISAO` não encerra (a vaga pode sair) e o papel ABERTURA é destino
   * manual de propósito, então sem a `exigeReguaDeAbertura` esta chamada publicaria a vaga espelhada
   * SEM CLIENTE por uma rota HTTP, com a trava da liberação intacta e inútil ao lado.
   */
  it("o movimento manual NÃO publica a vaga da fila: ela sai pela liberação, que confere o cliente", async () => {
    const { service, banco, vaga, codigoDaFila, codigoAbertura } = cenario("REVISAO");
    const erro = (await erroDe(() =>
      service.moverStatus("vaga-1", { status: codigoAbertura } as never, USUARIO),
    )) as { message?: string } | null;

    expect(erro, "o movimento manual virou a segunda porta para o papel ABERTURA").not.toBeNull();
    expect(String(erro?.message ?? "")).toContain("pendente de revisão");
    expect(vaga.status).toBe(codigoDaFila);
    expect(banco.escritas, "nem o movimento nem a trilha dele podem ter sido gravados").toEqual([]);
  });

  it("o movimento manual também não publica o RASCUNHO, que é a outra vaga sem cliente", async () => {
    const { service, banco, vaga, codigoRascunho, codigoAbertura } = cenario("RASCUNHO");
    const erro = (await erroDe(() =>
      service.moverStatus("vaga-1", { status: codigoAbertura } as never, USUARIO),
    )) as { message?: string } | null;

    expect(erro, "o rascunho publicou sem passar pela régua dos obrigatórios").not.toBeNull();
    expect(
      String(erro?.message ?? ""),
      "a recusa tem de ser a da régua de abertura, e não um erro de outra trava qualquer",
    ).toContain("rascunho");
    expect(vaga.status).toBe(codigoRascunho);
    expect(banco.escritas).toEqual([]);
  });

  it("a trilha de publicação do RASCUNHO cobra o cliente como qualquer outro obrigatório", async () => {
    const { service, banco, vaga, codigoRascunho, codigoAbertura } = cenario("RASCUNHO");
    const erro = (await erroDe(() =>
      service.atualizar(
        "vaga-1",
        { ...FORMULARIO_COMPLETO, codCliente: undefined, status: codigoAbertura } as never,
        USUARIO.id,
      ),
    )) as { message?: string } | null;

    expect(erro, "a trilha publicou uma vaga sem cliente").not.toBeNull();
    expect(
      String(erro?.message ?? ""),
      "`codCliente` é um dos onze obrigatórios, e a mensagem sai com a lista inteira",
    ).toContain("Cliente");
    expect(vaga.status).toBe(codigoRascunho);
    expect(banco.escritas).toEqual([]);
  });

  /** O CONTRASTE: sem ele, os cinco casos acima seriam satisfeitos por uma porta que barra tudo. */
  it("COM o cliente, a vaga sai da fila para o papel ABERTURA normalmente", async () => {
    const { service, vaga, codigoAbertura } = cenario("REVISAO");
    await service.liberarPendenteRevisao("vaga-1", USUARIO, { ...FORMULARIO_COMPLETO } as never);

    expect(vaga.status).toBe(codigoAbertura);
    expect(vaga.codCliente, "a vaga aberta sem cliente é o estado que não pode existir").toBe(
      CLIENTE,
    );
  });
});

// ── (f) A PROPRIEDADE, E NÃO MAIS UM CASO ───────────────────────────────────────────────────

/**
 * ─ "NENHUMA PORTA PÕE VAGA SEM CLIENTE EM PAPEL DE PROCESSO": A PROPRIEDADE ────────────────────
 *
 * ┌─ POR QUE ISTO EXISTE, E É ACHADO DO `seguranca`, não zelo ──────────────────────────────────┐
 * │ A invariante passou a SUSTENTAR COMPORTAMENTO (a transferência entre clientes se abstém      │
 * │ quando um dos lados é nulo, e o caso de origem nula só é impossível porque a invariante vale).│
 * │ Ela é ESTRUTURAL: não vem de uma trava só, vem da CADEIA de portas. E a auditoria achou onde │
 * │ a cadeia é frágil: DUAS portas chegam ao papel de processo SEM OLHAR O CLIENTE, e são        │
 * │ seguras por guardas que moram longe delas:                                                    │
 * │   . `reabrir` grava o código de abertura direto. Ela só não ressuscita vaga sem cliente       │
 * │     porque `fechar` e `cancelar` recusam quem não está em processo, então vaga sem cliente    │
 * │     nunca chega a CANCELADA para ser reaberta;                                                │
 * │   . a reabertura da INGESTÃO (`ingestao-repositorio.ts`) restaura o status guardado           │
 * │     conferindo só `existe` e `!encerra`, e nunca o cliente.                                    │
 * │ Depender de guarda remota já custou dois achados nesta frente. O teste de propriedade é o que │
 * │ fica vermelho quando alguém mexe LONGE daqui.                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ARGUMENTO É A CADEIA DE PORTAS, E NUNCA A MEDIÇÃO DO BANCO ──────────────────────────────┐
 * │ "Hoje não há vaga sem cliente na base" NÃO PROVA NADA sobre a invariante, e não é usado como │
 * │ evidência em lugar nenhum deste arquivo: a produção tem pouquíssimas vagas, e uma base que   │
 * │ por acaso está limpa continua limpa até o primeiro caminho novo. O que prova é que as portas  │
 * │ recusam, e é isso que é medido abaixo.                                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMO A PROPRIEDADE É AFIRMADA: para CADA status do catálogo como destino, por CADA porta de
 * `VagasService` que grava status, sobre uma vaga SEM CLIENTE nos dois papéis em que ela pode
 * legitimamente estar (RASCUNHO e REVISAO), o estado final nunca é papel de processo. O laço passa
 * pelo catálogo inteiro de propósito: um status NOVO com papel ABERTURA, cadastrado pelo diretor,
 * entra neste teste sozinho, sem ninguém lembrar de acrescentar um caso.
 */
describe("PROPRIEDADE: vaga sem cliente nunca alcança papel de processo, por porta nenhuma", () => {
  const SEMENTE = statusSemente();
  const papelDe = (codigo: unknown) => SEMENTE.find((l) => l.codigo === String(codigo))?.papel;
  const EM_PROCESSO = ["ABERTURA", "ENTREGA"];
  /** A vaga SEM CLIENTE só pode legitimamente estar nestes dois papéis. Ambos são exercitados. */
  const ORIGENS = ["RASCUNHO", "REVISAO"] as const;

  /** A guarda do laço: se o catálogo do fake deixar de ter papel de processo, o teste vira vácuo. */
  it("o catálogo exercitado TEM papel de processo (senão o laço abaixo não prova nada)", () => {
    expect(SEMENTE.filter((l) => EM_PROCESSO.includes(l.papel)).length).toBeGreaterThan(0);
    expect(SEMENTE.length).toBeGreaterThanOrEqual(6);
  });

  for (const origem of ORIGENS) {
    for (const destino of statusSemente()) {
      it(`${origem} sem cliente não vira ${destino.codigo} por porta nenhuma`, async () => {
        const { service, vaga } = cenario(origem);
        const semCliente = { ...FORMULARIO_COMPLETO, codCliente: undefined };

        // AS QUATRO PORTAS QUE ACEITAM UM DESTINO, cada uma tentando o mesmo código. O erro é
        // ENGOLIDO de propósito: o que se afirma é o ESTADO FINAL, e não qual trava recusou. Uma
        // porta que recusasse pelo motivo errado ainda assim não pode ter movido a vaga.
        await erroDe(() => service.moverStatus("vaga-1", { status: destino.codigo } as never, USUARIO));
        await erroDe(() =>
          service.atualizar("vaga-1", { status: destino.codigo } as never, USUARIO.id),
        );
        await erroDe(() =>
          service.atualizar("vaga-1", { ...semCliente, status: destino.codigo } as never, USUARIO.id),
        );
        await erroDe(() =>
          service.liberarPendenteRevisao("vaga-1", USUARIO, {
            ...semCliente,
            status: destino.codigo,
          } as never),
        );

        expect(
          EM_PROCESSO.includes(String(papelDe(vaga.status))),
          `a vaga SEM CLIENTE terminou em "${vaga.status}", que é papel de processo. A invariante "vaga em processo sempre tem cliente" caiu, e com ela a abstenção da transferência entre clientes passa a se aplicar a um caso REAL.`,
        ).toBe(false);
        expect(vaga.codCliente, "nenhuma porta pode ter inventado um cliente").toBeNull();
      });
    }
  }

  /**
   * ─ O CANÁRIO DOS ESCRITORES, PORQUE NEM TODA PORTA MORA NO `VagasService` ────────────────────
   *
   * A REABERTURA DA INGESTÃO ESCREVE STATUS DE VAGA FORA DESTE SERVIÇO, e ela restaura o
   * `status_antes_do_encerramento` conferindo só `existe` e `!encerra`, nunca o cliente. Ela não é
   * alcançável pelo dublê deste arquivo (é SQL cru contra outro repositório), e é justamente a
   * classe de porta que uma propriedade medida só aqui deixaria passar.
   *
   * ENTÃO O QUE SE TRAVA É A LISTA DE QUEM ESCREVE NA TABELA. Um arquivo NOVO gravando em `vagas`
   * quebra este caso e obriga quem o escreveu a responder a pergunta desta seção antes de seguir:
   * "esta porta pode pôr vaga sem cliente em papel de processo?". É um canário, e não uma prova de
   * comportamento: ele não diz que a porta nova está errada, diz que ninguém olhou ainda.
   *
   * POR QUE NÃO SE MEDE ISTO CONTRA O BANCO: a base pode estar limpa hoje e continuar limpa até o
   * primeiro caminho novo. O que prova a invariante é o conjunto de portas, e é ele que é pinado.
   */
  it("SÓ SEIS ARQUIVOS escrevem na tabela `vagas`, e cada um tem a sua resposta escrita aqui", () => {
    const raiz = join(__dirname, "..", "..");
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, entrada.name);
        if (entrada.isDirectory()) varrer(caminho);
        else if (
          entrada.name.endsWith(".ts") &&
          !/\.spec\.ts$|fake|tester|arnes/.test(entrada.name) &&
          /\.update\(vagas\)|update\s+vagas\s/.test(readFileSync(caminho, "utf8"))
        ) {
          arquivos.push(relative(raiz, caminho).replace(/\\/g, "/"));
        }
      }
    };
    varrer(raiz);

    expect(arquivos.sort()).toEqual([
      // ─ O DE/PARA DE CLIENTE DA PLANILHA (01/10/2026), E A RESPOSTA DELE É "NÃO ALCANÇA" ───────
      // Ele grava QUATRO colunas e nenhuma outra: `cliente_proposto`, `cliente_proposto_nome`,
      // `cliente_proposto_origem` e `cliente_proposto_estado`. NÃO escreve `status` (então não é
      // porta de entrada em papel nenhum), NÃO escreve `cod_cliente` (então não inventa cliente) e
      // NÃO escreve `atualizado_em` (que é o relógio do expurgo de quem está dentro da vaga).
      //
      // A COLUNA DELE É INERTE POR DESENHO, e isso foi exigência da auditoria desta frente: a
      // proposta da planilha não pode virar `vagas.cod_cliente`, porque aquele valor desce para a
      // pré-admissão SEM filtro de status e de lá decide a régua documental e a pasta do prontuário
      // no Drive. Há teste de fonte provando a lista FECHADA de escritores da proposta e a ausência
      // de leitores fora da tela de revisão (`as/depara-cliente/depara-cliente.escritores` e
      // `as/ingestao-pandape/depara-cliente.fonte-e-inercia`).
      "as/ingestao-pandape/ingestao-depara-cliente.service.ts",
      // A INGESTÃO. Reabre a vaga espelhada restaurando o status de antes do encerramento, SEM
      // olhar o cliente. Segura hoje porque o status guardado é o da própria vaga (que estava em
      // processo, logo com cliente) e o fallback é a FILA. Porta nova aqui exige releitura.
      "as/ingestao-pandape/ingestao-repositorio.ts",
      // A SHORTLIST. Grava só `envio_shortlist` e `atualizado_em`: não toca status nem cliente.
      "as/shortlists/shortlists.service.ts",
      // A DERIVAÇÃO. Só se move DENTRO do processo: ela retorna cedo quando o papel atual não é de
      // processo, então não é porta de ENTRADA e não alcança vaga sem cliente.
      "as/vagas/derivar-status-da-vaga.ts",
      // ─ A EDIÇÃO DA VAGA JÁ LIBERADA (05/10/2026), E A RESPOSTA É "NÃO ALCANÇA" ────────────────
      // NÃO escreve `status` (nem `status_manual_*`), então não é porta de entrada em papel nenhum;
      // só aceita vaga JÁ em papel de processo (ABERTURA/ENTREGA, conferido sob `for update`); e
      // RECUSA esvaziar `cod_cliente` (cliente novo conferido contra o catálogo). O DELETE apaga a
      // vaga inteira e só passa sem candidatura nem shortlist.
      "as/vagas/vagas-edicao.service.ts",
      // ─ O CARIMBO DO ACEITE DA PROPOSTA (01/10/2026), E A RESPOSTA É A MESMA ──────────────────
      // Ele grava UMA coluna: `cliente_proposto_estado = 'CONFIRMADO'`, quando uma pessoa aceita na
      // liberação exatamente o cliente que a planilha propôs. NÃO escreve `status`, NÃO escreve
      // `cod_cliente` e NÃO escreve `atualizado_em`. Quem move a vaga continua sendo a liberação, na
      // MESMA transação, com a régua dos obrigatórios e a trava de cliente medidas caso a caso acima:
      // este arquivo só registra a PROCEDÊNCIA do valor que ela gravou, para a pergunta "esse cliente
      // foi escolhido ou foi aceito?" ter resposta no dia em que uma linha da planilha estiver errada.
      "as/vagas/vagas-revisao-proposta.ts",
      // AS PORTAS COM RÉGUA. São as medidas caso a caso acima.
      "as/vagas/vagas.service.ts",
    ]);
  });

  /**
   * ─ O ELO REMOTO, TRAZIDO PARA DENTRO DO TESTE ────────────────────────────────────────────────
   *
   * `reabrir` não confere cliente, e não é defeito dela: ela desfaz um cancelamento, e vaga
   * cancelada veio de vaga em processo, que TEM cliente. O elo que sustenta isso é o gate de
   * `fechar` e de `cancelar`, e é ELE que este caso mede. Afrouxá-lo lá em cima faz a vaga sem
   * cliente virar CANCELADA, e a reabertura seguinte a publica sem que nada aqui reclame, se este
   * caso não existir.
   *
   * NÃO SE TESTA `reabrir` DIRETO SOBRE UMA VAGA CANCELADA SEM CLIENTE: aquele estado é
   * inalcançável, e um teste sobre estado inalcançável afirmaria uma guarda que ninguém escreveu,
   * nascendo vermelho e sendo "consertado" com um `if` que não protege nada.
   */
  for (const origem of ORIGENS) {
    it(`a vaga ${origem} sem cliente não chega a ser ENCERRADA, que é a entrada do reabrir`, async () => {
      // `posicoesOficiais: 0` É O QUE FAZ ESTE CASO MEDIR O GATE, e não outra trava: com a meta em
      // 2 e ninguém entregue, o `fechar` morreria na trava das posições e o caso ficaria verde sem
      // nunca ter chegado ao `papelDeVagaEmProcesso`. Com a meta zerada (e sem candidatura viva),
      // as demais travas passam e sobra exatamente a que se quer medir. MEDIDO POR MUTAÇÃO: com o
      // gate desligado, este caso fica VERMELHO.
      const { service, vaga } = cenario(origem, { posicoesOficiais: 0 });

      await erroDe(() =>
        service.fechar("vaga-1", { dataFechamento: "2026-09-20" } as never, USUARIO),
      );
      await erroDe(() =>
        service.cancelar(
          "vaga-1",
          { motivo: MOTIVO_CANCELAMENTO, dataCancelamento: "2026-09-20" } as never,
          USUARIO,
        ),
      );

      expect(
        SEMENTE.find((l) => l.codigo === vaga.status)?.encerra,
        `a vaga SEM CLIENTE foi encerrada a partir de "${origem}". Encerrada, ela vira entrada do \`reabrir\`, que grava o papel de abertura SEM conferir cliente: a invariante cai por um caminho de dois passos, e nenhuma trava de liberação é tocada.`,
      ).toBe(false);
    });
  }
});

// ── (d) REGRESSÃO: O RASCUNHO SE COMPORTA EXATAMENTE COMO ANTES ─────────────────────────────

describe("o papel RASCUNHO continua se comportando como antes", () => {
  it("salvar rascunho sem status não cobra obrigatório e não move a vaga", async () => {
    const { service, vaga, codigoRascunho } = cenario("RASCUNHO");
    const erro = await erroDe(() =>
      service.atualizar("vaga-1", { nomeDivulgacao: "Rascunho pela metade" } as never, USUARIO.id),
    );
    expect(erro).toBeNull();
    expect(vaga.status).toBe(codigoRascunho);
    expect(vaga.nomeDivulgacao).toBe("Rascunho pela metade");
  });

  it("PUBLICAR pelo rascunho continua cobrando a régua inteira", async () => {
    const { service, banco, codigoAbertura } = cenario("RASCUNHO");
    const erro = (await erroDe(() =>
      service.atualizar(
        "vaga-1",
        { ...FORMULARIO_COMPLETO, status: codigoAbertura, dataLimite: undefined } as never,
        USUARIO.id,
      ),
    )) as { message?: string } | null;

    expect(erro, "a trilha deixou publicar sem a previsão de entrega").not.toBeNull();
    expect(String(erro?.message ?? "")).toContain("Previsão de entrega");
    expect(banco.escritas, "a recusa da publicação continua acontecendo antes da escrita").toEqual(
      [],
    );
  });

  it("PUBLICAR pelo rascunho, com tudo preenchido, continua movendo a vaga", async () => {
    const { service, vaga, codigoAbertura } = cenario("RASCUNHO");
    await service.atualizar(
      "vaga-1",
      { ...FORMULARIO_COMPLETO, status: codigoAbertura } as never,
      USUARIO.id,
    );
    expect(vaga.status).toBe(codigoAbertura);
  });

  it("a vaga JÁ PUBLICADA continua recusada pela trilha de edição", async () => {
    const { service, banco } = cenario("ABERTURA");
    const erro = await erroDe(() =>
      service.atualizar("vaga-1", { nomeDivulgacao: "Não deveria entrar" } as never, USUARIO.id),
    );
    expect(
      erro,
      "aceitar o papel REVISAO não pode ter aberto a edição de vaga publicada: ela já está na mão do time e pode já ter sido divulgada",
    ).not.toBeNull();
    expect(banco.escritas).toEqual([]);
  });
});
