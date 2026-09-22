import "reflect-metadata";
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
    expect(frase, "falta a Natureza e a mensagem não diz").toContain("Natureza");
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
