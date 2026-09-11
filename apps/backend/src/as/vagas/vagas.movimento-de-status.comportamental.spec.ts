import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { podeSairManualmente, podeSerDestinoManual } from "@ea/shared-types";
import { ROLES_KEY } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { VagasController } from "./vagas.controller";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import { VagasService } from "./vagas.service";
import {
  STAND_BY,
  bancoDeStatus,
  erroDe,
  metodoDe,
  statusSemente,
  type LinhaStatus,
} from "./vaga-status.tester-fake";

/**
 * ─ MOVER O STATUS DA VAGA PELA TELA (B2, item 5): O REQUISITO ANTES DO CÓDIGO (§A.40, regra 2) ──
 *
 * ┌─ AS DUAS GUARDAS RESPONDEM PERGUNTAS DIFERENTES, E PERDER QUALQUER UMA DELAS É CARO ────────┐
 * │ ORIGEM: só sai de status que NÃO ENCERRA. Sem esta, a vaga CANCELADA volta a andar, e com ela│
 * │ o carimbo de contagem abandonado, o contador de dias voltando a correr e uma trilha de       │
 * │ cancelamento afirmando um fato que já não vale. Reabrir vaga encerrada NÃO é mover status: é │
 * │ desfazer um encerramento, com trava e trilha próprias, e não está nesta onda.                │
 * │                                                                                             │
 * │ DESTINO: `ativo` E `movivelManualmente` E NÃO `encerra`. A dupla conferência é deliberada e  │
 * │ não é redundância: `movivelManualmente` é um flag que o DIRETOR edita, e sozinho ele seria a │
 * │ única coisa entre um clique e o estado TERMINAL, sem trava de candidato tratado, sem a de    │
 * │ posições oficiais, sem gate de Master, sem carimbos de contagem e sem data de fechamento.    │
 * │ Encerrar vaga tem duas portas, e as duas têm régua. Esta não pode virar a terceira.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CAMINHO DE VOLTA (item 6), QUE É A ARMADILHA MAIS CARA DA ONDA ──────────────────────────┐
 * │ As duas portas de encerramento (`fechar` e `cancelar`) exigem a vaga em ABERTA como ORIGEM.  │
 * │ Uma vaga movida para um status LIVRE (um "Stand By") fica, portanto, IMPOSSÍVEL DE FECHAR e  │
 * │ IMPOSSÍVEL DE CANCELAR se não puder voltar para o status de ABERTURA. Ela vira zumbi          │
 * │ permanente segurando candidatura viva, e ninguém percebe: não há erro, não há alerta, a vaga │
 * │ só nunca mais termina, e a pessoa dentro dela nunca é alcançada pelo expurgo (§A.6).         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O NOME DO MÉTODO NÃO É AFIRMADO: ele é resolvido pelo primeiro que existir, e a falha diz quais
 * foram procurados. O que está sob teste é a PROPRIEDADE, não o desenho.
 */

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** As linhas de sonda: cada uma isola UM dos três pedaços da régua de destino. */
const INATIVA: LinhaStatus = {
  ...STAND_BY,
  id: 91,
  codigo: "PAUSA_ANTIGA",
  rotulo: "Pausa Antiga",
  ativo: false,
};
const NAO_MOVIVEL: LinhaStatus = {
  ...STAND_BY,
  id: 92,
  codigo: "SO_LEITURA",
  rotulo: "Só Leitura",
  movivelManualmente: false,
};
/**
 * O LIVRE QUE ENCERRA, e ele existe no teste mesmo o catálogo proibindo criá-lo pela tela: a régua
 * do movimento não pode DEPENDER de o cadastro ter sido bem-feito. Linha vinda de carga, de SQL cru
 * ou de um CHECK que alguém removeu chega aqui do mesmo jeito, e é exatamente contra ela que a
 * segunda metade da conferência (`!encerra`) existe.
 */
const LIVRE_QUE_ENCERRA: LinhaStatus = {
  ...STAND_BY,
  id: 93,
  codigo: "ARQUIVADA",
  rotulo: "Arquivada",
  encerra: true,
  movivelManualmente: true,
};

const CATALOGO = () => [...statusSemente(), { ...STAND_BY }, INATIVA, NAO_MOVIVEL, LIVRE_QUE_ENCERRA];

/**
 * O CATÁLOGO INJETADO, FINGIDO, COM A RÉGUA DE VERDADE DENTRO.
 *
 * ┌─ POR QUE A RÉGUA AQUI É A DE PRODUÇÃO, e não uma imitação minha ────────────────────────────┐
 * │ AS DUAS GUARDAS DESTE ARQUIVO (origem e destino) podem ser removidas em DOIS lugares: no      │
 * │ `moverStatus` ou dentro da própria régua. Um dublê que respondesse `podeEntrar` por conta      │
 * │ própria deixaria a segunda metade sem cobertura: apagar o `!encerra` da régua manteria este    │
 * │ arquivo VERDE enquanto a vaga passava a terminar por um seletor. Então o que é fingido aqui é  │
 * │ o BANCO e o CACHE; a régua é a que roda em produção.                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O resto do serviço de catálogo continua respondido por proxy: o nome dos outros métodos é escolha
 * de quem constrói, e nenhum teste daqui é sobre eles.
 */
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

function cenario(statusDaVaga: string, linhas: LinhaStatus[] = CATALOGO()) {
  const banco = bancoDeStatus({
    status: linhas,
    vagas: [
      {
        id: "vaga-1",
        codigo: "PS-2026-999",
        nomeDivulgacao: "Vaga de teste",
        status: statusDaVaga,
        posicoesOficiais: 5,
        posicoesBanco: 0,
        vagasFechadas: null,
        vagasFechadasBanco: null,
        dataFechamento: null,
        escolaridade: null,
        regioes: [],
        idiomas: [],
        testes: [],
        criadoEm: new Date("2026-09-10T12:00:00.000Z"),
        atualizadoEm: new Date("2026-09-10T12:00:00.000Z"),
        fechamentoForcadoPorId: null,
        fechamentoForcadoEm: null,
        fechamentoForcadoFaltavam: null,
        canceladaPorId: null,
        canceladaEm: null,
        cancelamentoMotivo: null,
        cancelamentoObservacao: null,
      },
    ],
  });
  const Construtor = VagasService as unknown as new (...a: unknown[]) => VagasService;
  const service = new Construtor(
    banco.db,
    catalogoDeEtapasFingido(),
    catalogoDeStatusFingido(linhas),
  );
  return { banco, service, vaga: banco.vagas[0] };
}

const NOMES = [
  "moverStatus",
  "mudarStatus",
  "alterarStatus",
  "moverParaStatus",
  "atualizarStatus",
  "trocarStatus",
  "definirStatus",
];

/** O corpo, com o destino repetido nas três chaves plausíveis: o nome do campo é de quem constrói. */
const corpo = (destino: string) => ({ status: destino, destino, codigo: destino });

function mover(service: VagasService) {
  const chamar = metodoDe(service as unknown as object, NOMES);
  return (destino: string, user: AuthUser = COMUM) => chamar("vaga-1", corpo(destino), user);
}

// ── A RÉGUA, ANTES DE QUALQUER CÓDIGO: ela já está no vocabulário compartilhado ─────────────────

describe("a régua do movimento, no vocabulário compartilhado", () => {
  it("destino precisa das TRÊS condições, e nenhuma delas sozinha basta", () => {
    expect(podeSerDestinoManual(STAND_BY)).toBe(true);
    expect(podeSerDestinoManual(INATIVA), "inativo não é destino").toBe(false);
    expect(podeSerDestinoManual(NAO_MOVIVEL), "não movível não é destino").toBe(false);
    expect(
      podeSerDestinoManual(LIVRE_QUE_ENCERRA),
      "movível E que encerra seria a TERCEIRA porta do encerramento",
    ).toBe(false);
  });

  it("origem: só sai de quem não encerra", () => {
    expect(podeSairManualmente(STAND_BY)).toBe(true);
    expect(podeSairManualmente({ encerra: true }), "vaga encerrada não volta a andar").toBe(false);
  });
});

// ── O MOVIMENTO EM SI ───────────────────────────────────────────────────────

describe("o destino é conferido contra o catálogo", () => {
  it("move de ABERTA para um status LIVRE, ativo e movível", async () => {
    const { service, vaga, banco } = cenario("ABERTA");
    await mover(service)("STAND_BY");
    expect(vaga.status).toBe("STAND_BY");
    expect(banco.escritas.some((e) => e.tabela === "vagas" && e.tipo === "update")).toBe(true);
  });

  it("recusa destino INATIVO, e não grava nada", async () => {
    const { service, vaga, banco } = cenario("ABERTA");
    expect(await erroDe(() => mover(service)("PAUSA_ANTIGA"))).not.toBeNull();
    expect(vaga.status).toBe("ABERTA");
    expect(banco.escritas.filter((e) => e.tabela === "vagas")).toHaveLength(0);
  });

  it("recusa destino NÃO MOVÍVEL manualmente", async () => {
    const { service, vaga } = cenario("ABERTA");
    expect(await erroDe(() => mover(service)("SO_LEITURA"))).not.toBeNull();
    expect(vaga.status).toBe("ABERTA");
  });

  /**
   * A MUTAÇÃO 3 MORRE AQUI. Trocar a régua de destino por só `movivelManualmente`, sem o `!encerra`,
   * deixa esta linha passar: a vaga termina por um seletor, sem nenhuma das travas do fechamento.
   */
  it("recusa destino que ENCERRA, mesmo marcado como movível", async () => {
    const { service, vaga, banco } = cenario("ABERTA");
    expect(
      await erroDe(() => mover(service)("ARQUIVADA")),
      "um LIVRE marcado `encerra` é a terceira porta do encerramento, e ela não existe",
    ).not.toBeNull();
    expect(vaga.status).toBe("ABERTA");
    expect(banco.escritas.filter((e) => e.tabela === "vagas")).toHaveLength(0);
  });

  it("recusa os status de sistema que encerram (ENTREGUE, FECHADA, CANCELADA)", async () => {
    for (const destino of ["ENTREGUE", "FECHADA", "CANCELADA"]) {
      const { service, vaga } = cenario("ABERTA");
      expect(await erroDe(() => mover(service)(destino)), `${destino} não é destino manual`).not.toBeNull();
      expect(vaga.status).toBe("ABERTA");
    }
  });

  it("recusa destino que não existe no catálogo", async () => {
    const { service, vaga } = cenario("ABERTA");
    expect(await erroDe(() => mover(service)("INVENTADA"))).not.toBeNull();
    expect(vaga.status).toBe("ABERTA");
  });
});

describe("a origem é conferida: vaga encerrada não volta a andar", () => {
  /**
   * A MUTAÇÃO 2 MORRE AQUI. Sem a guarda de ORIGEM, a vaga CANCELADA sai do estado terminal por um
   * seletor: o carimbo de contagem fica abandonado, o contador de dias volta a correr e a trilha do
   * cancelamento passa a afirmar um fato que já não vale.
   */
  it.each(["ENTREGUE", "FECHADA", "CANCELADA"])("recusa mover a vaga %s", async (origem) => {
    const { service, vaga, banco } = cenario(origem);
    expect(await erroDe(() => mover(service)("STAND_BY"))).not.toBeNull();
    expect(vaga.status).toBe(origem);
    expect(banco.escritas.filter((e) => e.tabela === "vagas")).toHaveLength(0);
  });

  /**
   * ┌─ ESTA ASSERÇÃO FOI INVERTIDA PELO COORDENADOR, e a inversão é a decisão, não um conserto ───┐
   * │ ELA AFIRMAVA O CONTRÁRIO: que o RASCUNHO sai por aqui, "porque ele não encerra". A régua de │
   * │ origem, sozinha, de fato o libera. Só que o próprio achado deste arquivo (logo abaixo)      │
   * │ mostra o que isso produz: RASCUNHO pela metade virando vaga PUBLICADA, sem a régua dos      │
   * │ campos obrigatórios e sem a higiene de campo da trilha, inclusive o dígito do CPF do        │
   * │ substituído.                                                                               │
   * │                                                                                            │
   * │ E BARRAR SÓ O DESTINO `ABERTURA` NÃO FECHA NADA, SÓ ALONGA PARA DOIS PASSOS: o rascunho vai │
   * │ para "Stand By", o "Stand By" vai para "Aberta", a régua foi pulada do mesmo jeito, e a     │
   * │ trilha registra dois movimentos que parecem legítimos. Por isso a trava é na ORIGEM.        │
   * │                                                                                            │
   * │ O RASCUNHO TEM UMA PORTA SÓ, E É A QUE TEM A RÉGUA: a trilha de abertura. Este caminho não  │
   * │ é um atalho para publicar, é o gesto de mover uma vaga VIVA entre status do diretor.        │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("recusa mover a vaga em RASCUNHO, que publica pela trilha e não por aqui", async () => {
    const { service, vaga, banco } = cenario("RASCUNHO");
    expect(await erroDe(() => mover(service)("STAND_BY"))).not.toBeNull();
    expect(vaga.status).toBe("RASCUNHO");
    expect(banco.escritas.filter((e) => e.tabela === "vagas")).toHaveLength(0);
  });
});

/**
 * ─ O ACHADO: A SEGUNDA PORTA DA PUBLICAÇÃO, ABERTA PELA MESMA RÉGUA QUE FECHOU A DO ENCERRAMENTO ─
 *
 * ┌─ A CONTRADIÇÃO ESTÁ NO PRÓPRIO REQUISITO, e ela é simétrica à que ele já resolve ───────────┐
 * │ O item 5 protege o ENCERRAMENTO com a dupla conferência (`movivelManualmente` E `!encerra`), │
 * │ porque encerrar tem duas portas com régua e esta não pode ser a terceira. O item 6 exige que │
 * │ `ABERTURA` seja destino manual, senão a vaga que sai para um LIVRE nunca volta.              │
 * │                                                                                             │
 * │ AS DUAS COISAS JUNTAS ABREM UMA PORTA NOVA PARA **PUBLICAR**: `RASCUNHO` não encerra, então  │
 * │ a vaga sai dele por aqui; `ABERTA` é destino manual, então ela entra ali por aqui. O         │
 * │ resultado é um RASCUNHO PELA METADE virando VAGA PUBLICADA em um clique, SEM a régua dos     │
 * │ campos obrigatórios que a trilha de abertura cobra (`PATCH /as/vagas/:id`, que só publica    │
 * │ depois de conferir cliente, cargo, salário e o resto) e sem a higiene de campo dela          │
 * │ (inclusive a conferência de dígito do CPF do substituído, §A.6).                             │
 * │                                                                                             │
 * │ MEDIDO, NÃO DEDUZIDO: um rascunho com `codCliente`, `cargoId` e `salario` NULOS termina esta │
 * │ chamada com `status = "ABERTA"`, recebendo candidato (ABERTA.recebeCandidato é true) e na    │
 * │ fila da Central de Vagas.                                                                    │
 * │                                                                                             │
 * │ O TESTE AFIRMA A PROPRIEDADE, NÃO O CONSERTO: as duas saídas plausíveis (recusar a ORIGEM    │
 * │ `RASCUNHO`, ou cobrar os obrigatórios ao entrar no papel `ABERTURA`) o deixam verde, e a      │
 * │ escolha é de quem constrói, com o diretor. O `tester` devolve o gap, não o conserta (§A.38). │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("o rascunho pela metade não publica por este caminho", () => {
  it("um RASCUNHO sem os obrigatórios não termina ABERTA pelo movimento manual", async () => {
    const { service, vaga } = cenario("RASCUNHO");
    vaga.codCliente = null;
    vaga.cargoId = null;
    vaga.salario = null;
    vaga.posicoesOficiais = null;
    await erroDe(() => mover(service)("ABERTA"));
    expect(
      vaga.status,
      "publicar tem régua (a trilha de abertura confere os obrigatórios); este caminho não pode ser a segunda porta",
    ).toBe("RASCUNHO");
  });
});

describe("o caminho de volta: sem ele a vaga vira zumbi permanente", () => {
  it("a vaga em STAND_BY volta para ABERTA", async () => {
    const { service, vaga } = cenario("STAND_BY");
    await mover(service)("ABERTA");
    expect(
      vaga.status,
      "sem esta volta, a vaga não fecha, não cancela e segura candidatura viva para sempre",
    ).toBe("ABERTA");
  });
});

describe("a transação e a trilha", () => {
  it("trava a linha da vaga (SELECT FOR UPDATE) ANTES de gravar", async () => {
    const { service, banco } = cenario("ABERTA");
    await mover(service)("STAND_BY");
    const trava = banco.ordem.findIndex((g) => g.startsWith("trava:vagas"));
    const grava = banco.ordem.findIndex((g) => g === "update:vagas:tx");
    expect(trava, "a decisão tem de ser tomada COM a linha da vaga travada").toBeGreaterThanOrEqual(0);
    expect(grava).toBeGreaterThan(trava);
  });

  /**
   * A MUTAÇÃO 4 MORRE AQUI. Trilha gravada FORA da transação é trilha que some quando a transação
   * reverte, e vira o pior dos dois mundos: o status mudou e ninguém sabe quem mudou, ou a trilha
   * afirma um movimento que não aconteceu.
   */
  it("grava a trilha em `as_vaga_status_eventos`, DENTRO da mesma transação", async () => {
    const { banco, service } = cenario("ABERTA");
    await mover(service)("STAND_BY");
    const trilha = banco.escritas.filter((e) => e.tabela === "as_vaga_status_eventos");
    expect(trilha, "o movimento manual sem trilha é mudança de estado sem autor").toHaveLength(1);
    expect(trilha[0].naTransacao, "trilha fora da transação some quando a transação reverte").toBe(true);
    const valores = Object.values(trilha[0].valores);
    expect(valores, "a trilha diz DE onde a vaga saiu").toContain("ABERTA");
    expect(valores, "a trilha diz PARA onde ela foi").toContain("STAND_BY");
    expect(valores, "a trilha diz QUEM moveu, e o autor vem da sessão").toContain(COMUM.id);
  });

  it("a escrita do status também acontece dentro da transação", async () => {
    const { banco, service } = cenario("ABERTA");
    await mover(service)("STAND_BY");
    const naVaga = banco.escritas.filter((e) => e.tabela === "vagas");
    expect(naVaga).toHaveLength(1);
    expect(naVaga[0].naTransacao).toBe(true);
  });

  it("movimento recusado não deixa trilha (nada aconteceu, nada se registra)", async () => {
    const { banco, service } = cenario("CANCELADA");
    await erroDe(() => mover(service)("STAND_BY"));
    expect(banco.escritas.filter((e) => e.tabela === "as_vaga_status_eventos")).toHaveLength(0);
  });
});

// ── A ROTA ──────────────────────────────────────────────────────────────────

describe("a rota do movimento: PATCH /as/vagas/:id/status, sem @Roles", () => {
  const proto = VagasController.prototype as unknown as Record<string, unknown>;
  const handler = Object.getOwnPropertyNames(VagasController.prototype).find(
    (n) => n !== "constructor" && /status/i.test(n),
  );

  it("existe um handler de status na controller", () => {
    expect(
      handler,
      `nenhum handler de status em VagasController. Existem: ${Object.getOwnPropertyNames(VagasController.prototype).join(", ")}`,
    ).toBeDefined();
  });

  it("o caminho da rota é `:id/status`", () => {
    const caminho = Reflect.getMetadata("path", proto[handler as string] as object);
    expect(String(caminho)).toContain("status");
  });

  /**
   * SEM `@Roles`, E A AUSÊNCIA É A REGRA, NÃO ESQUECIMENTO: mover o status é do CONSULTOR, no mesmo
   * desenho do `fechar` e do `cancelar`. Quem controla quem entra no A&S é o menu `as-vagas`, que
   * reivindica a controller inteira. Um `@Roles("MASTER")` aqui barraria a operação normal de quem
   * opera a vaga, que é regressão silenciosa.
   */
  it("não há @Roles no handler nem na classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagasController)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, proto[handler as string] as object)).toBeUndefined();
  });

  /** O autor da trilha vem da SESSÃO, nunca do corpo: senão qualquer um assina o movimento alheio. */
  it("o handler recebe o usuário por decorador customizado (`@CurrentUser`)", () => {
    const md = Reflect.getMetadata("__routeArguments__", VagasController, handler as string) as
      | Record<string, { index: number }>
      | undefined;
    const custom = Object.keys(md ?? {}).filter((c) => c.includes("__customRouteArgs__"));
    expect(custom.length, "o autor da trilha não pode vir do corpo").toBeGreaterThan(0);
  });
});
