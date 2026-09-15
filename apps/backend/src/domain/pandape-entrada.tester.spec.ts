import "reflect-metadata";
import { getTableConfig } from "drizzle-orm/pg-core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PANDAPE_ENTRADA_DESFECHOS } from "@ea/shared-types";
import * as schema from "../db/schema";

/**
 * ─ FILA DE ENTRADA DO PANDAPÉ: O CONTRATO DE DADOS E A RÉGUA PURA ────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção e ANTES dela (§A.40 regra 2).
 * Quando este arquivo nasceu, NADA disto existia: todo teste aqui FALHA de propósito, e quem
 * constrói faz passar. O autor destes testes não é o autor do código (§A.38).
 *
 * ┌─ O CASO MEDIDO CONTRA A PRODUÇÃO, que é o requisito em uma frase ───────────────────────────┐
 * │ Um evento chegou do Pandapé em 11/09 15:59:57, respondeu 202, o worker tentou 5 vezes em 10  │
 * │ segundos, todas estourando "CPF inválido" porque naquele instante o ATS devolvia 00000000000 │
 * │ (o evento sai ANTES de a pessoa preencher o formulário). Dias depois o dado ficou válido e   │
 * │ NINGUÉM re-tentou. O único rastro era um job no Redis, podado, e que terminou na lista        │
 * │ `completed` com `failedReason` preenchido: não aparecia nem entre os falhados.                │
 * │ O buraco NÃO é a falha. É o SILÊNCIO da falha, e a re-tentativa medida em segundos para um    │
 * │ dado que só fica pronto em dias.                                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE METADE DESTE ARQUIVO AFIRMA SOBRE O SCHEMA ────────────────────────────────────────
 * O requisito é "registro DURÁVEL". Durável é propriedade da FORMA do dado, não do serviço: um
 * serviço correto sobre uma tabela sem unique duplica a linha na segunda entrega do webhook, e
 * duplicar não falha, só polui a fila. E uma tabela que existe em TypeScript e não existe em
 * migration funciona na máquina de quem escreveu e não existe em produção.
 *
 * ─ A TABELA É DESCOBERTA PELO NOME SQL ───────────────────────────────────────────────────────
 * `pandape_entrada` é o nome que a migration escreve e o que qualquer consulta futura vai falar.
 * O nome da constante TypeScript é escolha de quem digita, e este arquivo não opina sobre ela.
 *
 * ─ O MÓDULO PURO É CARREGADO POR CAMINHO EM VARIÁVEL, DE PROPÓSITO ───────────────────────────
 * `domain/pandape-entrada.ts` ainda não existe. Import estático deixaria o `tsc --noEmit` do
 * backend inteiro vermelho por um arquivo ausente, e um typecheck vermelho por ausência esconde
 * o typecheck vermelho de verdade. Com o caminho em variável, o TS não resolve, o typecheck
 * segue verde, e a falta vira uma FALHA DE TESTE legível, que é onde ela deve aparecer.
 *
 * §A.6: nenhum dado pessoal em lugar nenhum deste arquivo. Os CPFs usados nos cenários de
 * classificação são de FICÇÃO (dígito verificador válido, pessoa inexistente) e existem só para
 * provar que o classificador NÃO os copia para dentro do motivo gravado.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Ferramentas de leitura do schema (mesmo padrão de `onda-c.contrato-de-dados.tester.spec.ts`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

type TabelaDoSchema = Parameters<typeof getTableConfig>[0];

const TABELA = "pandape_entrada";

function acharTabela(nomeSql: string): TabelaDoSchema | null {
  for (const valor of Object.values(schema as Record<string, unknown>)) {
    try {
      const cfg = getTableConfig(valor as TabelaDoSchema);
      if (cfg.name === nomeSql) return valor as TabelaDoSchema;
    } catch {
      // Não é tabela do drizzle (enum, helper, constante). Segue.
    }
  }
  return null;
}

function exigirTabela(nomeSql: string): TabelaDoSchema {
  const t = acharTabela(nomeSql);
  if (!t) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: não existe a tabela "${nomeSql}" no schema do drizzle. ` +
        `É ela que torna DURÁVEL o evento que hoje só vive como job no Redis.`,
    );
  }
  return t;
}

function colunas(nomeSql: string) {
  return getTableConfig(exigirTabela(nomeSql)).columns;
}

function coluna(nomeSql: string, nomeColuna: string) {
  const achada = colunas(nomeSql).find((c) => c.name === nomeColuna);
  if (!achada) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: a tabela "${nomeSql}" não tem a coluna "${nomeColuna}". ` +
        `Colunas presentes: ${JSON.stringify(colunas(nomeSql).map((c) => c.name))}`,
    );
  }
  return achada;
}

/** Valores do enum de uma coluna. Vazio quando a coluna não é um pgEnum. */
function valoresDoEnum(nomeSql: string, nomeColuna: string): string[] {
  const c = coluna(nomeSql, nomeColuna) as unknown as { enumValues?: readonly string[] };
  return [...(c.enumValues ?? [])];
}

/** Carrega um módulo que PODE NÃO EXISTIR ainda, com mensagem de contrato em vez de stack crua. */
async function carregarModulo(caminho: string): Promise<Record<string, unknown>> {
  try {
    return (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: o módulo "${caminho}" não existe (ou não carrega). ` +
        `Ele é a RÉGUA ÚNICA da fila: sem ele, cada tela recalcula "isto ainda está pendente?" ` +
        `do seu jeito, que é exatamente a divergência que a §A.19 proíbe. ` +
        `Erro original: ${err instanceof Error ? err.message : "desconhecido"}`,
    );
  }
}

async function funcaoDoDominio(nome: string): Promise<(...args: never[]) => unknown> {
  const mod = await carregarModulo("./pandape-entrada");
  const fn = mod[nome];
  if (typeof fn !== "function") {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: "domain/pandape-entrada.ts" não exporta a função "${nome}". ` +
        `Exportações encontradas: ${JSON.stringify(Object.keys(mod))}`,
    );
  }
  return fn as (...args: never[]) => unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A TABELA: uma linha por evento, e a linha SOBREVIVE à poda do Redis
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("pandape_entrada: o registro durável do que chegou do Pandapé", () => {
  /**
   * As onze colunas do requisito. Listadas uma a uma porque cada uma responde a uma pergunta que
   * hoje NÃO tem resposta: o que chegou, por onde, quando, o que aconteceu, por quê, quantas vezes
   * já tentamos, quando foi a última, quando parou de ser problema e qual admissão nasceu disso.
   */
  it("tem as colunas do requisito", () => {
    const nomes = colunas(TABELA).map((c) => c.name);
    for (const esperada of [
      "id_precollaborator",
      "id_match",
      "id_vacancy",
      "recebido_em",
      "origem",
      "desfecho",
      "motivo",
      "tentativas",
      "ultima_tentativa_em",
      "resolvido_em",
      "admissao_id",
    ]) {
      expect(nomes).toContain(esperada);
    }
  });

  /**
   * O ID É A CHAVE, E O UNIQUE É A PROVA DE QUE A RE-ENTREGA NÃO DUPLICA.
   *
   * O Pandapé reentrega o MESMO evento (o webhook é at-least-once, e o 503 da fila pede reenvio
   * de propósito). Hoje a não-duplicação mora no `jobId cand-<id>` (só enquanto o job está em voo)
   * e no unique de `integracao_pandape` (que só existe DEPOIS de a admissão nascer). Entre um e
   * outro há uma janela onde nada protege, e é justamente a janela em que a entrada vive: evento
   * recebido e admissão ainda inexistente. Sem unique aqui, a segunda entrega vira a segunda linha
   * e a fila passa a mostrar a mesma pessoa duas vezes.
   */
  it("o id_precollaborator é NOT NULL e ÚNICO (a re-entrega atualiza a linha, não cria outra)", () => {
    const c = coluna(TABELA, "id_precollaborator");
    expect(c.notNull).toBe(true);
    expect(c.isUnique).toBe(true);
  });

  /**
   * `admissao_id` NULO é o estado NORMAL desta tabela, não a exceção: a linha nasce justamente
   * quando a admissão ainda não existe. NOT NULL aqui inverteria o sentido da tabela.
   */
  it("admissao_id é NULO enquanto a admissão não nasceu", () => {
    expect(coluna(TABELA, "admissao_id").notNull).toBe(false);
  });

  /**
   * `resolvido_em` NULO é o que mantém a linha NA FILA. É o mesmo desenho da §A.19: a fila é o
   * próprio estado, não uma marcação que alguém precisa lembrar de apagar.
   */
  it("resolvido_em é nulo (é ele que diz se a linha ainda está na fila)", () => {
    expect(coluna(TABELA, "resolvido_em").notNull).toBe(false);
  });

  /**
   * O CONTADOR DE TENTATIVAS NASCE ZERO E NUNCA É NULO. Nulo aqui viraria `NaN` na tela, e um
   * contador que não conta é a diferença entre "chegou agora" e "estamos tentando há quatro dias",
   * que é a única informação que permite alguém agir.
   */
  it("tentativas é NOT NULL com default (contador, nunca nulo)", () => {
    const c = coluna(TABELA, "tentativas");
    expect(c.notNull).toBe(true);
    expect(c.hasDefault).toBe(true);
  });

  it("recebido_em é NOT NULL (o instante de chegada é o que ordena a fila)", () => {
    expect(coluna(TABELA, "recebido_em").notNull).toBe(true);
  });

  /**
   * OS DESFECHOS, EXATAMENTE, E NADA ALÉM. Enum e não texto livre porque texto livre vira seis
   * grafias do mesmo desfecho em três meses, e aí nenhuma contagem fecha. A lista é fechada de
   * propósito: um desfecho novo é decisão do diretor, não efeito colateral de um `update` novo.
   *
   * ERAM SEIS QUANDO ESTE TESTE NASCEU, e são DEZ. A contagem subiu por decisão do coordenador
   * (dono do vocabulário compartilhado) depois da auditoria de segurança, e os quatro que entraram
   * existem porque, sem eles, quatro saídas reais do worker não teriam valor legal a gravar e
   * cairiam em "OUTRO" ou, pior, ficariam presas em RECEBIDO para sempre:
   *   NAO_ENFILEIRADO      a fila não aceitou o evento (Redis fora) e o Pandapé vai reenviar
   *   DESCARTADO_DUPLICADO o BullMQ recusou o enfileiramento porque o jobId ainda estava ocupado
   *   INERTE               integração sem credencial: o worker não tinha o que consultar
   *   ADIADO               não resolveu ainda e vai ser re-tentado
   * O INTENTO do teste não mudou: a fonte da verdade é `PANDAPE_ENTRADA_DESFECHOS`, e a lista é
   * lida DE LÁ em vez de repetida aqui, para o enum do banco e o vocabulário não divergirem em
   * silêncio, que é o defeito que este teste sempre existiu para pegar.
   */
  it("desfecho é um pgEnum, e a MIGRATION SQL declara exatamente os valores do vocabulário", () => {
    const valores = valoresDoEnum(TABELA, "desfecho");
    expect(valores.length).toBeGreaterThan(0); // 0 = a coluna não é pgEnum (texto livre não serve)

    // A COMPARAÇÃO ÚTIL É CONTRA O SQL, e não contra o objeto Drizzle. Primeira versão desta
    // asserção comparava `valoresDoEnum(...)` com `PANDAPE_ENTRADA_DESFECHOS`, e era TAUTOLÓGICA:
    // `db/schema/enums.ts:461` constrói o pgEnum A PARTIR dessa mesma constante, então os dois lados
    // eram o mesmo objeto e nada podia divergir. A divergência que existe de verdade é outra: a
    // migration é escrita À MÃO (o `drizzle-kit generate` cospe um dump do schema inteiro porque os
    // snapshots param no 0079), e um valor esquecido no `CREATE TYPE` só apareceria no INSERT em
    // produção. É isso que se mede aqui.
    const sqlDaMigration = readdirSync(join(__dirname, "..", "..", "drizzle"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(__dirname, "..", "..", "drizzle", f), "utf8"))
      .find((txt) => txt.includes('CREATE TYPE "public"."pandape_entrada_desfecho"'));
    expect(sqlDaMigration, "nenhuma migration cria o tipo pandape_entrada_desfecho").toBeTruthy();

    const declarados = [
      ...(sqlDaMigration ?? "").matchAll(
        /CREATE TYPE "public"\."pandape_entrada_desfecho" AS ENUM\(([^)]*)\)/g,
      ),
    ]
      .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]))
      .sort();

    expect(declarados).toEqual([...PANDAPE_ENTRADA_DESFECHOS].sort());
    expect([...valores].sort()).toEqual(declarados);
  });

  /**
   * A ORIGEM separa "o Pandapé mandou" de "alguém clicou reprocessar". Sem ela, o reprocesso manual
   * some dentro do volume do webhook e ninguém consegue auditar quem mexeu.
   */
  it("origem é um enum com WEBHOOK, TICK e MANUAL", () => {
    const valores = valoresDoEnum(TABELA, "origem");
    expect(valores.length).toBeGreaterThan(0);
    expect([...valores].sort()).toEqual(["MANUAL", "TICK", "WEBHOOK"].sort());
  });

  /**
   * ─ §A.6, PROVADO NA FORMA E NÃO NA INTENÇÃO ────────────────────────────────────────────────
   * Esta tabela é a tentação perfeita: ela existe para mostrar numa tela quem não virou admissão,
   * e o caminho mais curto para a tela ficar boa é guardar o nome e o CPF aqui. Não pode. O nome
   * vem do candidato quando a admissão nasce; ANTES disso a fila mostra o id do ATS, que é id de
   * sistema e não atributo de pessoa. Guardar o payload "para depurar" é a mesma violação com
   * outro nome, e é pior, porque ninguém olha uma coluna de payload até ela vazar.
   */
  it("NENHUMA coluna de dado pessoal, de payload ou de URL (§A.6)", () => {
    const proibidas = /cpf|nome|name|sobrenome|surname|email|telefone|phone|payload|body|url|link|nascimento|birth/i;
    const violando = colunas(TABELA)
      .map((c) => c.name)
      .filter((n) => proibidas.test(n));
    expect(violando).toEqual([]);
  });

  /**
   * TABELA SEM MIGRATION É TABELA QUE SÓ EXISTE NA MÁQUINA DE QUEM ESCREVEU. O drizzle não cria
   * nada sozinho no boot: sem o SQL gerado, o serviço sobe, o webhook chega e o insert estoura
   * "relation does not exist" no exato momento em que o registro durável deveria acontecer.
   */
  it("existe migration SQL criando a tabela", () => {
    const dir = join(__dirname, "..", "..", "drizzle");
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"));
    expect(sqls.some((sql) => /pandape_entrada/i.test(sql))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A RÉGUA DA FILA: uma só, e é ela que tira a linha da tela
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Uma linha da tabela, como a régua a enxerga. Só o que a decisão precisa. */
interface LinhaEntrada {
  desfecho: string;
  resolvidoEm: Date | null;
}

async function pendente(linha: LinhaEntrada): Promise<boolean> {
  const fn = (await funcaoDoDominio("pendenteDeAdmissao")) as (l: LinhaEntrada) => boolean;
  return fn(linha);
}

describe("pendenteDeAdmissao: a régua ÚNICA de quem aparece na fila (§A.19)", () => {
  /**
   * RECEBIDO SEM DESFECHO é o caso que hoje é invisível: o webhook respondeu 202 e o worker ainda
   * não terminou, ou terminou e ninguém registrou. Fica na fila até alguém dizer o que aconteceu.
   */
  it("RECEBIDO ainda sem desfecho: FICA na fila", async () => {
    expect(await pendente({ desfecho: "RECEBIDO", resolvidoEm: null })).toBe(true);
  });

  it("FALHOU e ninguém resolveu: FICA na fila (é o caso que motivou a frente inteira)", async () => {
    expect(await pendente({ desfecho: "FALHOU", resolvidoEm: null })).toBe(true);
  });

  /**
   * ─ ZEROU, SAI DA FILA. A régua é a mesma da §A.19 e não é negociável por tela ───────────────
   * Os quatro desfechos abaixo significam "este evento terminou de ser problema". Deixar qualquer
   * um deles na fila transforma a lista de tarefa em relatório, e uma lista de tarefa que mostra
   * item já feito para de ser olhada em uma semana.
   *
   * PRE_ADMISSAO sai junto, e isto é decisão de requisito, não descuido: a pré-admissão JÁ NASCEU
   * no EA (é o que o reprocesso da candidata real produziu). Ela tem a própria fila, a Liberação
   * Admissional, e cobrar a mesma pendência em dois lugares é pedir que ninguém trabalhe em
   * nenhum dos dois.
   */
  it.each([
    ["ADMISSAO_CRIADA", "a admissão nasceu na esteira"],
    ["PRE_ADMISSAO", "nasceu em AGUARDANDO_LIBERACAO, e segue na fila da Liberação, não nesta"],
    ["ADOTADO", "o evento foi absorvido por uma admissão viva (B1), não há nada a criar"],
    ["NO_OP", "conhecido, nada mudou: não é pendência"],
  ])("%s resolvido: SAI da fila (%s)", async (desfecho) => {
    expect(await pendente({ desfecho, resolvidoEm: new Date("2026-09-15T12:00:00Z") })).toBe(false);
  });

  /**
   * ─ A INCOERÊNCIA TEM DE SER RESOLVIDA PARA O LADO SEGURO ───────────────────────────────────
   * Desfecho de sucesso sem `resolvido_em` é linha meio gravada: ou o update caiu no meio, ou
   * alguém gravou o desfecho e esqueceu o carimbo. O lado seguro é MOSTRAR, porque uma linha a
   * mais na fila custa um clique e uma linha a menos custa uma pessoa que nunca é admitida.
   */
  it("desfecho de sucesso SEM resolvido_em: fica na fila (linha incoerente não se esconde sozinha)", async () => {
    expect(await pendente({ desfecho: "ADMISSAO_CRIADA", resolvidoEm: null })).toBe(true);
  });

  /**
   * FALHOU com `resolvido_em` é o desfecho de quem falhou e depois foi resolvido por outro
   * caminho (reprocesso que nasceu por outro id, criação manual). Sai da fila: o carimbo manda.
   */
  it("FALHOU já carimbado como resolvido: SAI da fila", async () => {
    expect(await pendente({ desfecho: "FALHOU", resolvidoEm: new Date() })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O MOTIVO É CLASSIFICADO, e é isto que torna o vazamento IMPOSSÍVEL por construção
// ═══════════════════════════════════════════════════════════════════════════════════════════════

async function classificar(err: unknown): Promise<string> {
  const fn = (await funcaoDoDominio("classificarMotivo")) as (e: unknown) => string;
  return fn(err);
}

describe("classificarMotivo: código fechado, nunca a mensagem crua (§A.6)", () => {
  /**
   * ─ POR QUE CÓDIGO E NÃO MENSAGEM ───────────────────────────────────────────────────────────
   * Gravar `err.message` resolve a tela em uma linha e cria um vazamento permanente: a mensagem é
   * escrita por quem lançou, hoje e daqui a um ano, em qualquer camada, inclusive por uma
   * biblioteca de terceiro. Nenhuma revisão futura consegue garantir que ela não traga o CPF que
   * causou o erro. Um código de um conjunto fechado não tem como trazer, porque não vem de lá.
   * Esta é a diferença entre "tomamos cuidado" e "não é possível".
   */
  it("devolve um CÓDIGO em caixa alta, não uma frase", async () => {
    const codigo = await classificar(new Error("CPF inválido"));
    expect(codigo).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  /** O caso real: CPF zerado no ATS porque o evento sai antes de a pessoa preencher. */
  it("CPF inválido vira um código que fala de CPF (é o que a tela agrupa)", async () => {
    const codigo = await classificar(new Error("CPF inválido"));
    expect(codigo).toContain("CPF");
  });

  /**
   * ─ O TESTE QUE MAIS IMPORTA DESTE ARQUIVO ──────────────────────────────────────────────────
   * A mensagem abaixo é o pior caso plausível: alguém, algum dia, lança um erro com o CPF e o nome
   * dentro. Se o classificador repassar, a tabela vira um cadastro de dado pessoal sem que ninguém
   * tenha decidido isso. O CPF usado tem dígito válido e é de pessoa inexistente.
   */
  it("NUNCA copia dígitos, CPF nem nome da mensagem de erro para dentro do motivo", async () => {
    const codigo = await classificar(
      new Error("CPF 529.982.247-25 de Fulano De Tal inválido em criarPreAdmissao"),
    );
    expect(codigo).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    expect(codigo).not.toMatch(/\d{11}/);
    expect(codigo.toUpperCase()).not.toContain("FULANO");
    expect(codigo).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  /**
   * ERRO DESCONHECIDO TAMBÉM VIRA CÓDIGO. O caminho "não sei classificar" é o caminho por onde a
   * mensagem crua costuma voltar a entrar, e é o mais fácil de esquecer, porque quase nunca roda.
   */
  it("erro que não casa com nada conhecido ainda assim vira código, nunca a frase", async () => {
    const codigo = await classificar(new Error("Erro estranhíssimo do dia 11/09 com id 423673"));
    expect(codigo).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(codigo).not.toContain("423673");
  });

  /** Nem tudo que sobe é `Error`. String solta, objeto, undefined: tudo tem de sair classificado. */
  it.each([["string crua"], [42], [null], [undefined], [{ message: "objeto qualquer" }]])(
    "classifica valor não-Error (%s) sem estourar e sem repassar conteúdo",
    async (valor) => {
      const codigo = await classificar(valor);
      expect(codigo).toMatch(/^[A-Z][A-Z0-9_]*$/);
    },
  );
});
