import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { AS_MAXIMO_POR_LOTE } from "@ea/shared-types";
import { POSICAO_LADOS, SITUACOES_DE_SAIDA } from "../../domain/candidatura";
import * as dtosDoModulo from "./candidatos.dto";

/**
 * ─ O TETO E A VALIDAÇÃO DOS CORPOS EM MASSA (escrito ANTES do código, §A.40 regra 2) ────────────
 *
 * ┌─ POR QUE A RÉGUA MORA NO DTO, E NÃO NA TELA ───────────────────────────────────────────────┐
 * │ REGRA QUE VIVE APENAS NO NAVEGADOR NÃO É REGRA. Foi essa a lição do ajuste 7 do diretor: o  │
 * │ motivo do desvínculo era exigido só na tela, e qualquer chamada direta à rota gravava        │
 * │ desfecho sem motivo, deixando buraco justamente no evento que mais precisa de explicação.    │
 * │ Em MASSA o mesmo buraco é multiplicado pelo tamanho da seleção, de uma vez só.               │
 * │                                                                                             │
 * │ E O `@MinLength` SOZINHO NÃO BASTA: ele mede a string CRUA, então `"   "` passa com três     │
 * │ caracteres, o service apara na gravação e o motivo chega NULO ao banco. O corpo precisa ser  │
 * │ APARADO ANTES DE VALIDADO, que é a correção que a ação individual já recebeu em 09/09 e que  │
 * │ o lote não pode nascer sem.                                                                 │
 * │                                                                                             │
 * │ O TETO É BARREIRA, não regra de negócio: uma seleção com milhares de ids é erro de tela, e   │
 * │ o número é o mesmo do Alto Volume (`AS_MAXIMO_POR_LOTE`), lido da fonte única e nunca         │
 * │ redigitado aqui, senão o teto do corpo e o teto do vocabulário divergem em silêncio.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS NOMES DAS CLASSES SÃO PROPOSTA DESTE ARQUIVO, e é de propósito que ele os resolva por  ─┐
 * │ NOME em vez de importá-los: o contrato fixou os nomes dos MÉTODOS do service, não os das     │
 * │ classes de corpo. Enquanto elas não existirem, cada teste falha com uma frase que diz QUAL   │
 * │ classe falta, em vez de o arquivo inteiro morrer na importação. Se a construção escolher     │
 * │ outros nomes, é aqui que se ajusta, em uma linha por classe.                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Os quatro corpos, com a propriedade de lista que cada um carrega. */
const CORPOS = {
  adicionar: { classe: "AdicionarEmLoteDto", lista: "candidatoIds" },
  finalizar: { classe: "FinalizarPosicaoEmLoteDto", lista: "candidaturaIds" },
  saida: { classe: "RegistrarSaidaEmLoteDto", lista: "candidaturaIds" },
  mover: { classe: "MoverEtapaEmLoteDto", lista: "candidaturaIds" },
} as const;

/** O que cada corpo precisa ALÉM da lista para ser válido: é o mínimo de cada rota. */
const COMPLEMENTO: Record<string, Record<string, unknown>> = {
  AdicionarEmLoteDto: {},
  FinalizarPosicaoEmLoteDto: {},
  RegistrarSaidaEmLoteDto: { situacao: "DESCARTADO", motivo: "perfil não aderente" },
  MoverEtapaEmLoteDto: { etapa: "TRIAGEM" },
};

function classe(nome: string): new () => object {
  const alvo = (dtosDoModulo as unknown as Record<string, unknown>)[nome];
  if (typeof alvo !== "function") {
    throw new Error(
      `A classe ${nome} ainda não existe em candidatos.dto. Enquanto o grupo 1 não for construído, este teste é a especificação dela.`,
    );
  }
  return alvo as new () => object;
}

function erros(nome: string, corpo: Record<string, unknown>, campo?: string) {
  const instancia = plainToInstance(classe(nome), corpo) as object;
  const lista = validateSync(instancia, { whitelist: true });
  return campo ? lista.filter((e) => e.property === campo) : lista;
}

const ids = (quantos: number) => Array.from({ length: quantos }, () => randomUUID());

/**
 * ─ A GUARDA DO VOCABULÁRIO CONSTRUÍDO, e ela não é zelo: é uma armadilha MEDIDA ────────────────
 *
 * O `@ea/shared-types` é consumido de dois jeitos: o `typecheck` lê o CÓDIGO-FONTE (o `paths` do
 * tsconfig aponta para `src/index.ts`), e o TEMPO DE EXECUÇÃO lê o PACOTE CONSTRUÍDO
 * (`node_modules/@ea/shared-types` aponta para `dist`). Palavra nova no vocabulário, então, compila
 * VERDE e chega ao runtime como `undefined` enquanto ninguém rodar o build do pacote.
 *
 * E O ESTRAGO NÃO É UM ERRO BARULHENTO, É UMA VALIDAÇÃO QUE MUDA DE OPINIÃO. No class-validator
 * 0.14, `isIn(valor, undefined)` devolve `false` para TUDO (`Array.isArray(possibleValues) && ...`)
 * e `arrayMaxSize(lista, undefined)` também: um corpo decorado com uma constante ainda não
 * construída passa a RECUSAR toda chamada, com uma mensagem de lista vazia que não explica nada.
 *
 * Por isso a guarda vem ANTES de todo o resto: red aqui quer dizer "rode o build do
 * `@ea/shared-types`", e não "o corpo em massa está errado".
 */
describe("O vocabulário compartilhado precisa estar CONSTRUÍDO antes de decorar corpo nenhum", () => {
  it("o teto do lote chegou ao tempo de execução, e vale 200", () => {
    expect(AS_MAXIMO_POR_LOTE).toBe(200);
  });

  it("os lados da posição chegaram ao tempo de execução", () => {
    expect(POSICAO_LADOS).toEqual(["OFICIAL", "BANCO"]);
  });
});

/**
 * A lista lida DEFENSIVAMENTE, para o arquivo não morrer na coleta quando o pacote está desatualizado:
 * sem isto, um `for ... of undefined` derruba os quarenta casos e esconde a causa. A causa fica dita
 * no teste acima, sozinha.
 */
const LADOS: readonly string[] = Array.isArray(POSICAO_LADOS) ? POSICAO_LADOS : [];
const SAIDAS: readonly string[] = Array.isArray(SITUACOES_DE_SAIDA) ? SITUACOES_DE_SAIDA : [];

describe("O teto do lote vem da fonte única, e o corpo o respeita", () => {

  for (const [acao, { classe: nome, lista }] of Object.entries(CORPOS)) {
    const corpo = (valores: unknown) => ({ [lista]: valores, ...COMPLEMENTO[nome] });

    it(`${acao}: recusa a lista VAZIA, que é um pedido que não faz nada`, () => {
      expect(erros(nome, corpo([]), lista).length).toBeGreaterThan(0);
    });

    it(`${acao}: recusa a lista AUSENTE`, () => {
      expect(erros(nome, { ...COMPLEMENTO[nome] }, lista).length).toBeGreaterThan(0);
    });

    it(`${acao}: aceita o lote no teto exato de ${AS_MAXIMO_POR_LOTE}`, () => {
      expect(erros(nome, corpo(ids(AS_MAXIMO_POR_LOTE)))).toHaveLength(0);
    });

    it(`${acao}: recusa UM a mais que o teto`, () => {
      expect(erros(nome, corpo(ids(AS_MAXIMO_POR_LOTE + 1)), lista).length).toBeGreaterThan(0);
    });

    /** O id tem de ser UUID: uma lista com lixo dentro é seleção corrompida, não intenção. */
    it(`${acao}: recusa a lista com um id que não é UUID`, () => {
      expect(erros(nome, corpo([randomUUID(), "cand-1"]), lista).length).toBeGreaterThan(0);
    });

    it(`${acao}: aceita um lote pequeno e bem formado`, () => {
      expect(erros(nome, corpo(ids(3)))).toHaveLength(0);
    });
  }
});

describe("O motivo do desvínculo em massa tem a MESMA régua do individual", () => {
  const nome = CORPOS.saida.classe;
  const base = (over: Record<string, unknown>) => ({
    candidaturaIds: ids(2),
    situacao: "DESCARTADO",
    ...over,
  });

  it("recusa o lote SEM motivo: trinta desfechos sem explicação de uma vez só", () => {
    expect(erros(nome, base({}), "motivo").length).toBeGreaterThan(0);
  });

  it("recusa o motivo de UM caractere", () => {
    expect(erros(nome, base({ motivo: "x" }), "motivo").length).toBeGreaterThan(0);
  });

  /**
   * O CASO QUE JÁ ESCAPOU UMA VEZ na ação individual: `"   "` passa pelo `@MinLength(2)` cru, o
   * service apara na gravação, e o motivo chega NULO ao banco. O corpo tem de ser aparado ANTES de
   * validado, e é isto que este caso guarda.
   */
  it("recusa o motivo só de espaços, que viraria motivo NULO no banco", () => {
    expect(erros(nome, base({ motivo: "   " }), "motivo").length).toBeGreaterThan(0);
  });

  it("aceita o motivo escrito, e o guarda aparado", () => {
    const corpo = base({ motivo: "  perfil não aderente  " });
    expect(erros(nome, corpo, "motivo")).toHaveLength(0);
    const instancia = plainToInstance(classe(nome), corpo) as { motivo: string };
    expect(instancia.motivo).toBe("perfil não aderente");
  });

  /**
   * ALOCAR NÃO É SAIR, e a lista fechada é a segunda trava disso: nem corpo montado fora da tela
   * entra por aqui pedindo `ALOCADO`, que é a situação que consome posição e tem rota própria.
   */
  it("recusa ALOCADO como situação de saída em massa", () => {
    const recusa = erros(nome, base({ situacao: "ALOCADO", motivo: "qualquer" }), "situacao");
    expect(recusa.length).toBeGreaterThan(0);
  });

  for (const situacao of SAIDAS) {
    it(`aceita ${situacao}, que é saída pela régua do domínio`, () => {
      expect(erros(nome, base({ situacao, motivo: "perfil não aderente" }))).toHaveLength(0);
    });
  }
});

describe("Os demais corpos em massa recusam valor fora da lista fechada", () => {
  /**
   * ─ A ETAPA MUDOU DE LADO, E O TESTE MUDA COM ELA (etapas do funil viraram catálogo) ───────────
   *
   * O CASO DIZIA "o DTO recusa `ONBOARDING`", e isso deixou de ser verdade DE PROPÓSITO: a lista de
   * etapas é DADO DO DIRETOR (`as_etapas_funil`), e um `@IsIn` sobre uma constante congelada faria
   * as duas coisas erradas ao mesmo tempo, recusar a etapa que ele criou hoje e aceitar a que ele
   * inativou ontem. A recusa não sumiu: ela mudou de camada, para o `EtapasFunilService`, que é
   * quem pode consultar o catálogo VIVO (afirmado nos specs de `as/etapas`).
   *
   * O QUE O DTO AINDA GARANTE, e é o que estes dois casos passam a travar: a FORMA. Um `etapa` que
   * não é string, vazio, ou maior que a coluna, nunca chega ao service, porque nada disso pode ser
   * uma etapa em nenhum catálogo que o diretor monte.
   */
  it("mover etapa em massa recusa etapa vazia e etapa maior que a coluna (forma, não lista)", () => {
    expect(
      erros(CORPOS.mover.classe, { candidaturaIds: ids(2), etapa: "   " }, "etapa").length,
    ).toBeGreaterThan(0);
    expect(
      erros(CORPOS.mover.classe, { candidaturaIds: ids(2), etapa: "X".repeat(41) }, "etapa").length,
    ).toBeGreaterThan(0);
    expect(
      erros(CORPOS.mover.classe, { candidaturaIds: ids(2), etapa: 7 }, "etapa").length,
    ).toBeGreaterThan(0);
  });

  it("mover etapa em massa aceita etapa do catálogo, e também a que o diretor ainda vai criar", () => {
    expect(
      erros(CORPOS.mover.classe, { candidaturaIds: ids(2), etapa: "ENTREVISTA_CLIENTE" }),
    ).toHaveLength(0);
    // O DTO NÃO SABE, E NÃO DEVE SABER, quais etapas existem: quem decide é o catálogo, em runtime.
    expect(
      erros(CORPOS.mover.classe, { candidaturaIds: ids(2), etapa: "PROVA_PRATICA" }),
    ).toHaveLength(0);
  });

  it("finalizar posição em massa recusa lado fora de OFICIAL e BANCO", () => {
    expect(
      erros(CORPOS.finalizar.classe, { candidaturaIds: ids(2), lado: "RESERVA" }, "lado").length,
    ).toBeGreaterThan(0);
  });

  for (const lado of LADOS) {
    it(`finalizar posição em massa aceita o lado ${lado}`, () => {
      expect(
        erros(CORPOS.finalizar.classe, {
          candidaturaIds: ids(2),
          lado,
          cienteBancoComOficiaisAbertas: true,
        }),
      ).toHaveLength(0);
    });
  }

  /**
   * A CIÊNCIA CHEGA COMO STRING quando o corpo vem de formulário, e o `@IsBoolean` sozinho a
   * recusaria. É a mesma disciplina dos corpos individuais, e vale para os dois aceites.
   */
  it("a ciência de reentrada aceita a string do formulário e vira booleano", () => {
    const corpo = { candidatoIds: ids(2), cienteReentrada: "true" };
    expect(erros(CORPOS.adicionar.classe, corpo)).toHaveLength(0);
    const instancia = plainToInstance(classe(CORPOS.adicionar.classe), corpo) as {
      cienteReentrada: boolean;
    };
    expect(instancia.cienteReentrada).toBe(true);
  });

  it("a ciência do aviso de banco aceita a string do formulário e vira booleano", () => {
    const corpo = { candidaturaIds: ids(2), lado: "BANCO", cienteBancoComOficiaisAbertas: "true" };
    expect(erros(CORPOS.finalizar.classe, corpo)).toHaveLength(0);
    const instancia = plainToInstance(classe(CORPOS.finalizar.classe), corpo) as {
      cienteBancoComOficiaisAbertas: boolean;
    };
    expect(instancia.cienteBancoComOficiaisAbertas).toBe(true);
  });
});
