import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { CANDIDATURA_SITUACOES, ehSaidaSemExito, finalizaPosicao } from "@ea/shared-types";
import { SITUACOES_DE_SAIDA, ocupacaoDaVaga } from "../../domain/candidatura";
import { CandidatosService } from "./candidatos.service";
import { RegistrarSaidaDto } from "./candidatos.dto";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";

/**
 * ─ DESVINCULAR O CANDIDATO DA VAGA: o mesmo mecanismo, com o nome que quem opera usa ────────────
 *
 * ┌─ POR QUE UM ARQUIVO PRÓPRIO, SE "O MECANISMO É O MESMO DE ANTES" ────────────────────────────┐
 * │ É JUSTAMENTE POR ISSO. Quando a apresentação muda e o mecanismo fica, ninguém escreve teste:  │
 * │ "não mexi na regra" é a frase que precede a regressão silenciosa. E a tela passou a PROMETER  │
 * │ três coisas em texto ("a posição volta a ficar livre", "o candidato volta para o banco de     │
 * │ candidatos", "o motivo fica no histórico") que NENHUM teste afirmava ponta a ponta.           │
 * │                                                                                              │
 * │ A PROMESSA DA TELA É REQUISITO, e não decoração: se a posição NÃO voltasse a ficar livre, a   │
 * │ vaga continuaria devendo uma entrega que ninguém mais consegue fazer, e o consultor leria na  │
 * │ tela que ela tinha voltado. Nada falharia.                                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. MOTIVO OBRIGATÓRIO NOS DOIS LADOS do desvínculo, no DTO, que é a barreira que vale para
 *      qualquer chamador (a tela é a primeira, não a única).
 *   2. DESVINCULAR UM ALOCADO PASSA, e isto é o par da trava 7 ("a entrega não volta atrás por
 *      aqui, registre a saída dela"): a frase da trava aponta para esta porta, então esta porta
 *      precisa de fato aceitar. Trava que manda para um caminho fechado é beco sem saída.
 *   3. A POSIÇÃO VOLTA A FICAR LIVRE na ocupação DERIVADA, inclusive com o `posicao_lado` ainda
 *      gravado na linha: quem conta é a SITUAÇÃO, e o lado que sobrou não pode segurar a posição.
 *   4. O MOTIVO E A ETAPA FICAM NO HISTÓRICO, com a etapa em que a pessoa ESTAVA.
 *   5. O CANDIDATO CONTINUA REALOCÁVEL, e a volta passa pela ciência de reentrada, mostrando o
 *      motivo do desvínculo.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

/** As duas saídas que TIRAM a pessoa da vaga, derivadas da régua, nunca digitadas aqui. */
const DESVINCULOS = CANDIDATURA_SITUACOES.filter(ehSaidaSemExito);

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function candidatura(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "ENTREVISTA_SOULAN",
    situacao: "ALOCADO",
    motivoDescarte: null,
    posicaoLado: "OFICIAL",
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    ...over,
  };
}

/**
 * O FAKE COM MEMÓRIA: o desvínculo ESCREVE na linha, e a alocação seguinte a LÊ como "anterior".
 * Sem memória, o teste da reentrada estaria afirmando sobre um estado que ninguém produziu.
 */
function makeDb(cenario: { candidatura?: Record<string, unknown> } = {}) {
  const c: Record<string, unknown> = { ...candidatura(), ...(cenario.candidatura ?? {}) };
  const vaga = { id: "vaga-1", status: "ABERTA", posicoesOficiais: 5, posicoesBanco: 0 };

  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const ordem: string[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.orderBy = () =>
      Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    b.groupBy = () => Promise.resolve([]);
    /** A consulta das candidaturas ANTERIORES da alocação termina no `where`, então cai aqui. */
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(
        tabela === asCandidaturas
          ? [
              {
                id: c.id,
                situacao: c.situacao,
                motivo: c.motivoDescarte,
                encerradaEm: c.atualizadoEm,
              },
            ]
          : [],
      ).then(r);
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
      if (tabela === asCandidaturas) Object.assign(c, valores);
      return { where: async () => undefined };
    },
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      inserts.push({ tabela, valores });
      const feito = {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [{ id: "cand-2", etapa: "CAPTACAO" }],
      };
      return feito;
    },
  }));

  const tx = {
    select,
    update,
    insert,
    query: { asCandidaturas: { findFirst: async () => ({ ...c }) } },
  };

  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      asCandidaturas: { findFirst: async () => ({ ...c }) },
      asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
      vagas: { findFirst: async () => vaga },
    },
  };

  return { service: new CandidatosService(db as never), linha: c, updates, inserts, ordem };
}

const daCandidatura = (updates: Escrita[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
const doHistorico = (inserts: Escrita[]) =>
  inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};

function validar(corpo: unknown) {
  return validateSync(plainToInstance(RegistrarSaidaDto, corpo), { whitelist: true });
}
const erroDe = (corpo: unknown, campo: string) =>
  validar(corpo).filter((e) => e.property === campo);

describe("o motivo do desvínculo é obrigatório NOS DOIS lados, no DTO", () => {
  it("as duas saídas cobertas são exatamente Descartado e Desistiu, derivadas da régua", () => {
    // Guarda do próprio teste: situação de saída nova entra na cobertura sem ninguém lembrar.
    expect(DESVINCULOS).toEqual(["DESCARTADO", "DESISTIU"]);
  });

  for (const situacao of DESVINCULOS) {
    it(`recusa ${situacao} SEM motivo: histórico com buraco justamente no evento que precisa explicar`, () => {
      expect(erroDe({ situacao }, "motivo")).toHaveLength(1);
    });

    it(`recusa ${situacao} com motivo de UM caractere só`, () => {
      expect(erroDe({ situacao, motivo: "x" }, "motivo")).toHaveLength(1);
    });

    /*
     * ┌─ O CASO DO MOTIVO SÓ COM ESPAÇOS, que o tester deixou preparado e agora está ATIVO ───────┐
     * │ O BURACO ERA REAL: `@MinLength(2)` media a string CRUA, então `"   "` passava com três    │
     * │ caracteres e o service o transformava em NULO (`texto()` apara antes de gravar). O        │
     * │ desfecho ia para o banco com `motivo_descarte` NULO, e a única barreira era o NAVEGADOR.  │
     * │                                                                                          │
     * │ A CORREÇÃO É NO DTO (`@Transform` aparando ANTES do `@MinLength`), e é ela que este teste │
     * │ guarda: sem ele, a próxima refatoração que tirar o `@Transform` volta a aceitar o espaço  │
     * │ em silêncio, e ninguém percebe até o histórico aparecer com buraco.                       │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    it(`recusa ${situacao} com motivo só de espaços, que viraria motivo NULO no banco`, () => {
      expect(erroDe({ situacao, motivo: "   " }, "motivo")).toHaveLength(1);
    });


    it(`aceita ${situacao} com motivo escrito`, () => {
      expect(erroDe({ situacao, motivo: "Perfil não aderente" }, "motivo")).toHaveLength(0);
    });
  }

  /*
   * ┌─ O TERCEIRO DESFECHO, QUE A COBERTURA NÃO ALCANÇAVA (achado do `tester`, 09/09) ───────────┐
   * │ O DTO DIZ, EM LETRAS MAIÚSCULAS, "OBRIGATÓRIO NOS TRÊS DESFECHOS", e a régua dele é         │
   * │ `SITUACOES_DE_SAIDA`, que tem TRÊS valores. Os testes acima derivam de `ehSaidaSemExito`,   │
   * │ que tem DOIS: `ENVIADO_PARA_ADMISSAO` não era validado contra o DTO em teste nenhum do      │
   * │ repositório, e a ausência de motivo nele nunca era exercitada.                              │
   * │                                                                                            │
   * │ POR QUE ISSO NÃO É ZELO ACADÊMICO: o argumento para AFROUXAR já está escrito no arquivo ao  │
   * │ lado. O `FinalizarPosicaoDto` justifica não pedir motivo porque entregar a posição é o      │
   * │ desfecho BEM-SUCEDIDO, e escrever "alocado" toda vez seria ruído. Enviar para a admissão é  │
   * │ igualmente bem-sucedido, e a tela já o separou em seção própria. Quem aplicar o mesmo       │
   * │ raciocínio aqui amanhã não encontra teste nenhum no caminho, e o histórico do desfecho que  │
   * │ TIRA a pessoa do funil nasce sem explicação.                                                │
   * │                                                                                            │
   * │ O TERCEIRO É DERIVADO, nunca digitado: é o que sobra de `SITUACOES_DE_SAIDA` depois das     │
   * │ duas de desvínculo. Desfecho novo cai aqui sozinho.                                         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const TERCEIRO = SITUACOES_DE_SAIDA.filter((s) => !ehSaidaSemExito(s));

  it("o terceiro desfecho é exatamente o envio para a admissão, derivado da régua", () => {
    expect(TERCEIRO).toEqual(["ENVIADO_PARA_ADMISSAO"]);
  });

  for (const situacao of TERCEIRO) {
    it(`recusa ${situacao} SEM motivo: avançar também é sair, e sair pede explicação`, () => {
      expect(erroDe({ situacao }, "motivo")).toHaveLength(1);
    });

    it(`recusa ${situacao} com motivo só de espaços, que viraria motivo NULO no banco`, () => {
      expect(erroDe({ situacao, motivo: "   " }, "motivo")).toHaveLength(1);
    });
  }

  it("a situação ALOCADO não entra por esta porta: desvincular não é alocar", () => {
    // Alocar consome posição e passa pelo caminho travado. Se `ALOCADO` entrasse aqui, ele cairia
    // no `update` direto, sem trava de ocupação, e a vaga de 5 aceitaria 6.
    expect(erroDe({ situacao: "ALOCADO", motivo: "qualquer" }, "situacao")).toHaveLength(1);
  });
});

describe("desvincular um ALOCADO: a porta que a trava da entrega manda usar", () => {
  it("a trava recusa DESFAZER a entrega por outro caminho, e MANDA registrar a saída", async () => {
    const { service } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });

    // Aprovar um ALOCADO desfaria a entrega, e a trava 7 recusa apontando para o desvínculo.
    const erro = await service
      .aprovar("cand-1", "user-1")
      .then(() => null)
      .catch((e: unknown) => e as ConflictException);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String((erro!.getResponse() as { message?: string })?.message)).toContain(
      "registre a saída dela",
    );
  });

  for (const situacao of DESVINCULOS) {
    it(`e a porta indicada ACEITA: ${situacao} desvincula quem estava ALOCADO`, async () => {
      const { service, updates } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });

      await service.registrarSaida(
        "cand-1",
        { situacao, motivo: "Vaga encolheu" } as never,
        "user-1",
      );

      expect(daCandidatura(updates)).toMatchObject({
        situacao,
        motivoDescarte: "Vaga encolheu",
      });
    });
  }

  it("grava o motivo e a ETAPA em que a pessoa estava, e não a etapa de saída", async () => {
    const { service, inserts } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO", etapa: "ENTREVISTA_CLIENTE" }),
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: "DESISTIU", motivo: "Recebeu outra proposta" } as never,
      "user-1",
    );

    // Depois da gravação a etapa some da leitura viva, e sem o evento o LUGAR onde a decisão foi
    // tomada se perderia: "desistiu na Entrevista Cliente" deixaria de existir como frase.
    expect(doHistorico(inserts)).toMatchObject({
      etapaDe: null,
      etapaPara: "ENTREVISTA_CLIENTE",
      situacao: "DESISTIU",
      motivo: "Recebeu outra proposta",
      porId: "user-1",
    });
  });

  it("desvincular NÃO passa pelo caminho que trava a linha da vaga, porque não consome posição", async () => {
    const { service, ordem } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });

    await service.registrarSaida("cand-1", { situacao: "DESCARTADO", motivo: "Não" } as never, "u");

    // A propriedade não é "o código é simples": é que LIBERAR posição não disputa recurso nenhum.
    // Quem entrega posição trava a vaga e conta; quem sai apenas devolve, e devolver não estoura
    // teto nenhum. Se um dia esta operação passar a travar a vaga, é sinal de que ela mudou de
    // natureza, e a mudança precisa ser deliberada.
    expect(ordem).toEqual([]);
  });
});

describe("a posição volta a ficar livre, que é o que a tela promete", () => {
  it("o ALOCADO desvinculado sai da conta, e a vaga de 5 volta a ter 5 livres", () => {
    const antes = ocupacaoDaVaga(5, [{ situacao: "ALOCADO", posicaoLado: "OFICIAL" }]);
    expect(antes).toMatchObject({ finalizadasOficial: 1, livres: 4 });

    // O `posicao_lado` CONTINUA GRAVADO na linha depois do desvínculo (o `update` escreve situação e
    // motivo, e não apaga o lado). Quem conta é a SITUAÇÃO, então o lado que sobrou não pode
    // segurar a posição: se a contagem olhasse o lado, a vaga ficaria devendo uma entrega para
    // sempre, com a tela dizendo que a posição tinha voltado.
    const depois = ocupacaoDaVaga(5, [{ situacao: "DESCARTADO", posicaoLado: "OFICIAL" }]);
    expect(depois).toMatchObject({ finalizadasOficial: 0, ocupadas: 0, livres: 5 });
  });

  it("vale para os dois motivos de desvínculo, e no lado do BANCO também", () => {
    for (const situacao of DESVINCULOS) {
      expect(ocupacaoDaVaga(5, [{ situacao, posicaoLado: "OFICIAL" }])).toMatchObject({
        finalizadasOficial: 0,
        livres: 5,
      });
      expect(ocupacaoDaVaga(5, [{ situacao, posicaoLado: "BANCO" }])).toMatchObject({
        finalizadasBanco: 0,
        livres: 5,
      });
    }
  });

  it("desvincular UMA pessoa não solta a posição das OUTRAS", () => {
    const o = ocupacaoDaVaga(5, [
      { situacao: "ALOCADO", posicaoLado: "OFICIAL" },
      { situacao: "DESCARTADO", posicaoLado: "OFICIAL" },
      { situacao: "ALOCADO", posicaoLado: "OFICIAL" },
    ]);
    expect(o).toMatchObject({ finalizadasOficial: 2, livres: 3 });
  });

  it("quem desvincula deixa de ENTREGAR posição, pela régua única do vocabulário", () => {
    // A ligação entre as duas metades: o que a ocupação conta é `finalizaPosicao`, e nenhuma das
    // saídas sem êxito entrega. Uma lista nova em qualquer um dos dois lados quebraria isto.
    for (const situacao of DESVINCULOS) expect(finalizaPosicao(situacao)).toBe(false);
  });
});

describe("o candidato continua visível e realocável depois do desvínculo", () => {
  it("a volta para a MESMA vaga pede ciência, e mostra o motivo do desvínculo", async () => {
    const { service } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });

    await service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: "Perfil não aderente" } as never,
      "user-1",
    );

    // A linha anterior NÃO é apagada nem reaproveitada: ela vira o histórico que a reentrada lê.
    const erro = await service
      .alocar("pessoa-1", { vagaId: "vaga-1" } as never, "user-1")
      .then(() => null)
      .catch((e: unknown) => e as ConflictException);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro!.getResponse()).toMatchObject({
      needsConfirmation: true,
      reason: "reentradaAposEncerramento",
      anterior: { situacao: "DESCARTADO", motivo: "Perfil não aderente" },
    });
  });

  it("com a ciência, a alocação passa e nasce uma candidatura NOVA, sem ressuscitar a antiga", async () => {
    const { service, inserts } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });

    await service.registrarSaida(
      "cand-1",
      { situacao: "DESISTIU", motivo: "Recebeu outra proposta" } as never,
      "user-1",
    );
    await service.alocar(
      "pessoa-1",
      { vagaId: "vaga-1", cienteReentrada: true } as never,
      "user-1",
    );

    const nova = inserts.filter((i) => i.tabela === asCandidaturas);
    expect(nova).toHaveLength(1);
    expect(nova[0].valores).toMatchObject({ candidatoId: "pessoa-1", vagaId: "vaga-1" });
    // E o processo NOVO nasce com o evento de entrada, e não herda a etapa nem o desfecho do antigo.
    const entrada = inserts.filter((i) => i.tabela === asCandidaturaEtapas).at(-1)?.valores ?? {};
    expect(entrada).toMatchObject({ etapaDe: null, etapaPara: "CAPTACAO", situacao: null });
  });

  it("enquanto a pessoa está ALOCADA, alocar de novo continua sendo duplicata, e não reentrada", async () => {
    const { service } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });

    const erro = await service
      .alocar("pessoa-1", { vagaId: "vaga-1" } as never, "user-1")
      .then(() => null)
      .catch((e: unknown) => e as ConflictException);

    // O contraste que prova que o desvínculo é o que muda a resposta: sem ele, é duplicata seca.
    const corpo = erro!.getResponse();
    expect(String((corpo as { message?: string })?.message ?? corpo)).toContain(
      "já está nesta vaga",
    );
  });
});
