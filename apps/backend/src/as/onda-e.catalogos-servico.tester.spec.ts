import { BadRequestException } from "@nestjs/common";
import { getTableName, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ComerciaisService, comercialEscolhido } from "./comerciais/comerciais.service";
import { SegmentosService, segmentoEscolhido } from "./segmentos/segmentos.service";
import { VagasService } from "./vagas/vagas.service";

/**
 * ─ ONDA E: O QUE OS DOIS CATÁLOGOS FAZEM QUANDO ALGUÉM ERRA ────────────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` a partir do REQUISITO e dos ACHADOS da
 * auditoria do mapa. Cobre os quatro pontos em que este catálogo NÃO pode copiar o molde, e o mais
 * caro deles é o primeiro.
 *
 * ┌─ 1. ID INVÁLIDO OU INATIVO **LANÇA**, E NUNCA VIRA `null` ───────────────────────────────────┐
 * │ Este é o teste mais valioso da onda, e o motivo é a própria regra da herança: `null` SIGNIFICA │
 * │ HERDAR. Um id descartado em silêncio (o `?? null` que qualquer um escreve sem pensar) não vira │
 * │ erro: vira HERANÇA SILENCIOSA. O consultor escolhe "Saúde", salva, a tela recarrega mostrando  │
 * │ o segmento do CLIENTE, e ele conclui que o sistema não salvou, ou pior, não repara. É a "etapa │
 * │ fantasma" de 10/09 entrando por outra porta.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 2. HOMÔNIMO ENTRA, E A RECUSA NÃO DIZ NOME (§A.6) ──────────────────────────────────────────┐
 * │ Duas pessoas chamadas "Ana Silva" no comercial são duas pessoas. E a mensagem de recusa vai    │
 * │ para log de exceção: nome de pessoa em log é o que a §A.6 proíbe, e uma recusa do tipo "já     │
 * │ existe uma comercial inativa com esse nome" CONTA, para quem só tentou cadastrar alguém, que   │
 * │ uma ex-funcionária de mesmo nome passou por aqui.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 3. A TRAVA DE USO CONTA **DUAS** TABELAS ───────────────────────────────────────────────────┐
 * │ O molde conta usos só em `vagas`, porque a linha de serviço só existe lá. Estes dois são       │
 * │ usados em `clientes` **e** em `vagas`, e o caso que escapa é o do catálogo usado SÓ POR        │
 * │ CLIENTE: contando só vagas, o serviço deixa passar e o banco recusa depois, virando erro cru   │
 * │ em vez de frase.                                                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 4. A INVARIANTE ENTRE DOIS MÓDULOS: INATIVO EM USO NÃO PODE FICAR INVISÍVEL ────────────────┐
 * │ Ou a inativação RECUSA o catálogo em uso, ou o filtro da Central OFERECE o inativo. Se nenhuma │
 * │ das duas valer, existe vaga que nenhum filtro alcança, e ninguém descobre. O caso abaixo não   │
 * │ escolhe o desenho: ele cobra que os dois módulos CONCORDEM.                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: os nomes usados são inventados ("Ana Exemplo", "Bruno Exemplo"). Nenhum nome real, nenhum
 * CPF, nenhum dado de produção.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O BANCO DE MENTIRA COM MEMÓRIA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE COM MEMÓRIA, e não uma fila de respostas prontas ────────────────────────────────────
 *
 * "Criar dois homônimos" e "a segunda leitura já mostra o que a primeira escreveu" são afirmações
 * sobre DUAS chamadas, e um dublê sem memória responde a segunda com o mundo de antes da primeira:
 * o cache que não invalida (o defeito clássico deste molde) passaria verde.
 *
 * ELE INTERPRETA O `where` DE FORMA CRUA, e isso é o que separa medir de fingir: a cláusula é
 * renderizada com o `PgDialect` de verdade, os parâmetros são recolocados no texto, e as
 * comparações de igualdade são aplicadas às linhas. Uma contagem que consulte a tabela ERRADA
 * devolve zero aqui, que é exatamente o que precisa acontecer.
 *
 * O LIMITE, DECLARADO: ele entende `=` e `is null` unidos por `and`. Não entende junção, `or` nem
 * subconsulta. Nenhum dos dois catálogos precisa disso, e o dia em que precisar, este dublê tem de
 * crescer junto em vez de ser contornado.
 */
type Linha = Record<string, unknown>;

function bancoComMemoria(estado: Record<string, Linha[]>) {
  const dialeto = new PgDialect();

  const textoDe = (cond: unknown): string => {
    if (cond === undefined || cond === null) return "";
    try {
      // O `sql`${x}`` EMBRULHA COLUNA E EXPRESSÃO PELO MESMO CAMINHO: `sqlToQuery` recusa uma
      // `Column` crua, e a seleção destes serviços é feita quase toda de colunas cruas. Sem o
      // embrulho, toda projeção virava nulo e o dublê "perdia" as linhas que ele mesmo guardava.
      const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
      return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
    } catch {
      return "";
    }
  };

  const casa = (linha: Linha, clausula: string): boolean => {
    if (!clausula.trim()) return true;
    const igualdades = [...clausula.matchAll(/"[\w$]+"\."([\w$]+)"\s*=\s*('?)([^'\s)]+)\2/g)];
    for (const [, coluna, , valor] of igualdades) {
      const atual = linha[camel(coluna)] ?? linha[coluna] ?? null;
      if (String(atual) !== String(valor)) return false;
    }
    for (const [, coluna] of clausula.matchAll(/"[\w$]+"\."([\w$]+)"\s+is\s+null/gi)) {
      if ((linha[camel(coluna)] ?? linha[coluna] ?? null) !== null) return false;
    }
    return true;
  };

  /** A resposta de um `select`: agregado quando a seleção pede, linhas quando não pede. */
  const responder = (selecao: Record<string, unknown>, linhas: Linha[]): Linha[] => {
    const chaves = Object.entries(selecao ?? {});
    const agregada = chaves.find(([, v]) => /count\(|max\(/i.test(textoDe(v)));
    if (agregada) {
      const [chave, expr] = agregada;
      const texto = textoDe(expr);
      if (/count\(/i.test(texto)) return [{ [chave]: linhas.length }];
      const coluna = /"[\w$]+"\."([\w$]+)"/.exec(texto)?.[1] ?? "ordem";
      const max = linhas.reduce((m, l) => Math.max(m, Number(l[camel(coluna)] ?? 0)), 0);
      return [{ [chave]: max }];
    }
    // A PROJEÇÃO É A DA SELEÇÃO, e não a linha inteira: devolver colunas que a consulta não pediu
    // esconderia uma seleção incompleta (o campo que a construção esqueceu de trazer).
    return linhas.map((l) => {
      const saida: Linha = {};
      for (const [chave, expr] of chaves) {
        const coluna = /"[\w$]+"\."([\w$]+)"/.exec(textoDe(expr))?.[1];
        saida[chave] = coluna ? (l[camel(coluna)] ?? null) : null;
      }
      return saida;
    });
  };

  function cadeiaSelect(selecao: Record<string, unknown>) {
    let tabela = "";
    let clausula = "";
    const c: Record<string, unknown> = {};
    for (const m of ["innerJoin", "leftJoin", "groupBy", "limit", "offset", "orderBy"]) c[m] = () => c;
    c.from = (t: unknown) => {
      tabela = nomeDaTabela(t);
      return c;
    };
    c.where = (cond: unknown) => {
      clausula = textoDe(cond);
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve(responder(selecao, (estado[tabela] ?? []).filter((l) => casa(l, clausula))));
    return c;
  }

  const db: Record<string, unknown> = {
    select: (sel: unknown) => cadeiaSelect((sel ?? {}) as Record<string, unknown>),
    selectDistinct: (sel: unknown) => cadeiaSelect((sel ?? {}) as Record<string, unknown>),
    selectDistinctOn: (_on: unknown, sel: unknown) =>
      cadeiaSelect((sel ?? {}) as Record<string, unknown>),
    insert: (t: unknown) => {
      const tabela = nomeDaTabela(t);
      return {
        values: (v: Linha) => {
          const linhas = (estado[tabela] ??= []);
          const nova = { id: linhas.reduce((m, l) => Math.max(m, Number(l.id)), 0) + 1, ...v };
          linhas.push(nova);
          return {
            returning: (sel: Record<string, unknown>) => Promise.resolve(responder(sel, [nova])),
            then: (r: (v: unknown) => unknown) => r([nova]),
          };
        },
      };
    },
    update: (t: unknown) => {
      const tabela = nomeDaTabela(t);
      let valores: Linha = {};
      const enc: Record<string, unknown> = {
        set: (v: Linha) => {
          valores = v;
          return enc;
        },
        where: (cond: unknown) => {
          const clausula = textoDe(cond);
          const atingidas = (estado[tabela] ?? []).filter((l) => casa(l, clausula));
          for (const l of atingidas) Object.assign(l, valores);
          return {
            returning: (sel: Record<string, unknown>) => Promise.resolve(responder(sel, atingidas)),
            then: (r: (v: unknown) => unknown) => r(atingidas),
          };
        },
      };
      return enc;
    },
    delete: (t: unknown) => {
      const tabela = nomeDaTabela(t);
      return {
        where: (cond: unknown) => {
          const clausula = textoDe(cond);
          estado[tabela] = (estado[tabela] ?? []).filter((l) => !casa(l, clausula));
          return Promise.resolve([]);
        },
      };
    },
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}

function nomeDaTabela(t: unknown): string {
  try {
    return getTableName(t as never);
  } catch {
    return "";
  }
}

function camel(coluna: string): string {
  return coluna.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());
}

const SEGMENTOS: Linha[] = [
  { id: 7, codigo: "VAREJO", rotulo: "Varejo", ordem: 1, ativo: true },
  { id: 9, codigo: "SAUDE", rotulo: "Saúde", ordem: 2, ativo: false },
];
const COMERCIAIS: Linha[] = [
  { id: 3, rotulo: "Ana Exemplo", ordem: 1, ativo: true },
  { id: 5, rotulo: "Bruno Exemplo", ordem: 2, ativo: false },
];

const copia = (linhas: Linha[]): Linha[] => linhas.map((l) => ({ ...l }));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A RÉGUA DA ESCOLHA: LANÇA, NUNCA DEVOLVE `null` POR ENGANO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ OS CASOS SÃO ESCRITOS À MÃO, um por um, e NÃO derivados de uma lista ───────────────────────
 * É a correção do ponto cego de 11/09: laço sobre constante encolhe junto com ela, em silêncio.
 * Cada catálogo tem o seu bloco digitado, e apagar um deles é uma remoção visível no diff.
 */
describe("a régua da escolha do SEGMENTO lança em vez de devolver nulo", () => {
  const lista = [
    { id: 7, codigo: "VAREJO", rotulo: "Varejo", ordem: 1, ativo: true },
    { id: 9, codigo: "SAUDE", rotulo: "Saúde", ordem: 2, ativo: false },
  ];

  it("ausente PASSA e devolve nulo: é o rascunho que ainda não escolheu", () => {
    expect(segmentoEscolhido(lista, null)).toBeNull();
    expect(segmentoEscolhido(lista, undefined)).toBeNull();
  });

  it("devolve o segmento ATIVO escolhido", () => {
    expect(segmentoEscolhido(lista, 7)?.id).toBe(7);
  });

  /**
   * O `null` AQUI SERIA HERANÇA SILENCIOSA, e é por isso que o caso cobra a EXCEÇÃO e não um valor.
   */
  it("id INEXISTENTE lança, e não vira nulo (que significaria HERDAR)", () => {
    expect(() => segmentoEscolhido(lista, 404)).toThrow(BadRequestException);
  });

  it("id INATIVO lança, e não vira nulo: a FK deixaria passar", () => {
    expect(() => segmentoEscolhido(lista, 9)).toThrow(BadRequestException);
  });
});

describe("a régua da escolha do COMERCIAL lança em vez de devolver nulo", () => {
  const lista = [
    { id: 3, codigo: "", rotulo: "Ana Exemplo", ordem: 1, ativo: true },
    { id: 5, codigo: "", rotulo: "Bruno Exemplo", ordem: 2, ativo: false },
  ] as never;

  it("ausente PASSA e devolve nulo: é o rascunho que ainda não escolheu", () => {
    expect(comercialEscolhido(lista, null)).toBeNull();
    expect(comercialEscolhido(lista, undefined)).toBeNull();
  });

  it("devolve o comercial ATIVO escolhido", () => {
    expect(comercialEscolhido(lista, 3)?.id).toBe(3);
  });

  it("id INEXISTENTE lança, e não vira nulo (que significaria HERDAR)", () => {
    expect(() => comercialEscolhido(lista, 404)).toThrow(BadRequestException);
  });

  it("id INATIVO lança, e não vira nulo", () => {
    expect(() => comercialEscolhido(lista, 5)).toThrow(BadRequestException);
  });

  /**
   * §A.6: A FRASE NÃO PODE CITAR O NOME. Mensagem de exceção vai para log, e nome de pessoa em log
   * é o que a régua proíbe. Quem lê a frase acabou de escolher a pessoa no seletor: o nome não
   * acrescenta nada que ele já não veja, e acrescenta uma linha de log com dado pessoal dentro.
   */
  it("nenhuma das duas frases de recusa cita o nome da pessoa", () => {
    for (const id of [404, 5]) {
      let frase = "";
      try {
        comercialEscolhido(lista, id);
      } catch (e) {
        frase = (e as Error).message;
      }
      expect(frase, `id ${id}`).not.toContain("Ana Exemplo");
      expect(frase, `id ${id}`).not.toContain("Bruno Exemplo");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. HOMÔNIMO ENTRA (e o catálogo de segmento continua recusando nome repetido)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o catálogo de COMERCIAIS aceita homônimos", () => {
  /**
   * DUAS PESSOAS DE MESMO NOME SÃO DUAS PESSOAS, e o `unique` do molde recusaria a segunda. Pior:
   * a recusa teria de dizer com quem colidiu, revelando o nome de alguém que talvez já tenha saído.
   */
  it("duas pessoas com o MESMO nome entram as duas, com ids diferentes", async () => {
    const db = bancoComMemoria({ as_comerciais: [] });
    const svc = new ComerciaisService(db as never);
    const a = await svc.criar({ rotulo: "Ana Exemplo" });
    const b = await svc.criar({ rotulo: "Ana Exemplo" });
    expect(a.id).not.toBe(b.id);
    expect(b.rotulo).toBe("Ana Exemplo");
  });

  it("a segunda aparece na leitura seguinte (o cache invalida na escrita)", async () => {
    const db = bancoComMemoria({ as_comerciais: [] });
    const svc = new ComerciaisService(db as never);
    await svc.criar({ rotulo: "Ana Exemplo" });
    await svc.criar({ rotulo: "Ana Exemplo" });
    expect((await svc.listar()).length).toBe(2);
  });

  /**
   * O CONTRASTE, e ele importa: o SEGMENTO é catálogo de processo, e dois "Varejo" convivendo é
   * defeito. A diferença entre os dois catálogos é o dado que eles guardam, não o gosto de quem
   * escreveu, e sem este caso a régua do comercial pareceria aplicável aos dois.
   */
  it("o catálogo de SEGMENTOS continua recusando nome repetido", async () => {
    const db = bancoComMemoria({ as_segmentos: [] });
    const svc = new SegmentosService(db as never);
    await svc.criar({ rotulo: "Varejo" });
    await expect(svc.criar({ rotulo: "Varejo" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A TRAVA DE USO CONTA AS **DUAS** TABELAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** O estado completo para as travas: catálogos, mais as duas tabelas que apontam para eles. */
function estadoComUso(opcoes: {
  clientesComSegmento?: number | null;
  clientesComComercial?: number | null;
  vagasComSegmento?: number | null;
  vagasComComercial?: number | null;
}) {
  return {
    as_segmentos: copia(SEGMENTOS).map((s) => ({ ...s, ativo: true })),
    as_comerciais: copia(COMERCIAIS).map((c) => ({ ...c, ativo: true })),
    clientes:
      opcoes.clientesComSegmento || opcoes.clientesComComercial
        ? [
            {
              codCliente: "57269",
              razaoSocial: "EDITORA EXEMPLO S.A.",
              segmentoId: opcoes.clientesComSegmento ?? null,
              comercialId: opcoes.clientesComComercial ?? null,
            },
          ]
        : [],
    vagas:
      opcoes.vagasComSegmento || opcoes.vagasComComercial
        ? [
            {
              id: "vaga-1",
              codigo: "PS-001",
              segmentoId: opcoes.vagasComSegmento ?? null,
              comercialId: opcoes.vagasComComercial ?? null,
            },
          ]
        : [],
  };
}

/** A operação que tira de circulação, seja qual for o nome que a construção deu a ela. */
async function tirarDeCirculacao(svc: object, id: number): Promise<unknown> {
  const s = svc as Record<string, (id: number) => Promise<unknown>>;
  if (typeof s.remover === "function") return s.remover(id);
  return s.inativar(id);
}

describe("tirar de circulação um catálogo EM USO é recusado com frase, nunca com erro cru", () => {
  /**
   * ─ O CASO QUE ESCAPA DO MOLDE ────────────────────────────────────────────────────────────────
   * O molde conta usos só em `vagas`. Estes dois catálogos são usados em `clientes` TAMBÉM, e o
   * segmento usado SÓ POR CLIENTE é o caso que uma cópia literal do molde deixa passar: o serviço
   * autoriza, o banco recusa pela FK, e a tela mostra erro de banco em vez da frase que diz o que
   * fazer.
   */
  it("SEGMENTO usado só por CLIENTE é recusado (o molde contaria só vagas e deixaria passar)", async () => {
    const db = bancoComMemoria(estadoComUso({ clientesComSegmento: 7 }));
    await expect(tirarDeCirculacao(new SegmentosService(db as never), 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("SEGMENTO usado só por VAGA é recusado", async () => {
    const db = bancoComMemoria(estadoComUso({ vagasComSegmento: 7 }));
    await expect(tirarDeCirculacao(new SegmentosService(db as never), 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("COMERCIAL usado só por CLIENTE é recusado", async () => {
    const db = bancoComMemoria(estadoComUso({ clientesComComercial: 3 }));
    await expect(tirarDeCirculacao(new ComerciaisService(db as never), 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("COMERCIAL usado só por VAGA é recusado", async () => {
    const db = bancoComMemoria(estadoComUso({ vagasComComercial: 3 }));
    await expect(tirarDeCirculacao(new ComerciaisService(db as never), 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * §A.6 NA FRASE DE RECUSA: ela diz QUANTOS, e nada mais. Nunca o nome da pessoa, nunca o código
   * do cliente, nunca a razão social, nunca o código da vaga. A frase vai para a tela E para o log.
   */
  it("a frase da recusa devolve CONTAGEM, e não identificador de ninguém", async () => {
    const db = bancoComMemoria(estadoComUso({ clientesComComercial: 3, vagasComComercial: 3 }));
    let frase = "";
    try {
      await tirarDeCirculacao(new ComerciaisService(db as never), 3);
    } catch (e) {
      frase = (e as Error).message;
    }
    expect(frase, "a recusa precisa explicar o que houve").not.toBe("");
    for (const vazamento of ["Ana Exemplo", "57269", "EDITORA EXEMPLO", "PS-001", "vaga-1"]) {
      expect(frase, `a frase vazou \`${vazamento}\``).not.toContain(vazamento);
    }
    expect(/\d/.test(frase), "a frase precisa dizer QUANTOS, senão ninguém sabe o tamanho do problema").toBe(true);
  });

  /** O contraponto: sem uso nenhum, a operação PASSA. Sem ele, "recusa tudo" passaria nos quatro. */
  it("sem uso nenhum, tirar de circulação FUNCIONA", async () => {
    const db = bancoComMemoria(estadoComUso({}));
    await expect(tirarDeCirculacao(new SegmentosService(db as never), 7)).resolves.toBeTruthy();
    const db2 = bancoComMemoria(estadoComUso({}));
    await expect(tirarDeCirculacao(new ComerciaisService(db2 as never), 3)).resolves.toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A INVARIANTE ENTRE OS DOIS MÓDULOS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("inativo EM USO nunca fica invisível ao filtro da Central De Vagas", () => {
  /**
   * ─ O CASO NÃO ESCOLHE O DESENHO: ELE COBRA QUE OS DOIS MÓDULOS CONCORDEM ─────────────────────
   *
   * São dois desenhos aceitáveis, e cada um fecha o buraco de um jeito:
   *   A. A INATIVAÇÃO RECUSA o catálogo em uso ("passe a carteira antes"). Então inativo implica
   *      zero uso, e o filtro pode oferecer só os ativos sem perder vaga nenhuma.
   *   B. A INATIVAÇÃO PERMITE, e aí o filtro TEM de oferecer os inativos em uso, senão a vaga de
   *      quem saiu da empresa deixa de ser alcançável por qualquer pergunta da tela.
   *
   * O QUE NÃO PODE É NENHUM DOS DOIS, e essa combinação é fácil de produzir sem querer: basta
   * alguém afrouxar a trava da inativação ("a pessoa saiu, eu quero tirar do seletor agora") sem
   * saber que o filtro do outro módulo conta com ela. O vermelho aqui é o aviso de que a dupla
   * deixou de se sustentar.
   */
  it("ou a inativação recusa o comercial em uso, ou o filtro oferece o inativo", async () => {
    const db = bancoComMemoria(estadoComUso({ clientesComComercial: 3, vagasComComercial: 3 }));
    const inativacaoRecusa = await tirarDeCirculacao(new ComerciaisService(db as never), 3).then(
      () => false,
      () => true,
    );
    if (inativacaoRecusa) return;

    const payload = (await opcoesDaCentral()) as { comerciais?: { id: number }[] };
    expect(
      (payload.comerciais ?? []).map((c) => c.id),
      "a inativação permite inativar em uso E o filtro só oferece ativos: a vaga fica invisível",
    ).toContain(5);
  });

  it("ou a inativação recusa o segmento em uso, ou o filtro oferece o inativo", async () => {
    const db = bancoComMemoria(estadoComUso({ clientesComSegmento: 7, vagasComSegmento: 7 }));
    const inativacaoRecusa = await tirarDeCirculacao(new SegmentosService(db as never), 7).then(
      () => false,
      () => true,
    );
    if (inativacaoRecusa) return;

    const svc = new SegmentosService(bancoComMemoria({ as_segmentos: copia(SEGMENTOS) }) as never);
    expect(
      (await svc.listar(true)).map((s) => s.id),
      "a leitura precisa saber devolver os inativos para o filtro alcançá-los",
    ).toContain(9);
  });
});

/** O payload de opções da Central, com os dois catálogos servidos pelo banco de mentira. */
async function opcoesDaCentral(): Promise<unknown> {
  const db = bancoComMemoria({
    as_segmentos: copia(SEGMENTOS),
    as_comerciais: copia(COMERCIAIS),
  });
  const stub = new Proxy(
    {},
    { get: (_a, p) => (String(p) === "then" ? undefined : () => Promise.resolve([])) },
  );
  const Ctor = VagasService as unknown as new (...args: unknown[]) => VagasService;
  const svc = new Ctor(db, stub, stub, stub, stub);
  return svc.opcoes();
}

