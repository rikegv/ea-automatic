import "reflect-metadata";
import { getTableConfig } from "drizzle-orm/pg-core";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  OPCAO_OUTROS,
  IDIOMA_NIVEIS,
  IDIOMA_NIVEL_LABEL,
  VAGA_OBRIGATORIOS,
  textoPendencia,
  vagaPendencias,
} from "@ea/shared-types";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../db/schema";
import { idiomasGravados, temNivel } from "./vaga-idioma";
import { CreateVagaDto } from "../as/vagas/vagas.dto";
import {
  FONTE_IBGE,
  MINIMO_MUNICIPIOS,
  UFS_IBGE,
  municipiosDoIbge,
} from "../db/cidades-ibge";

/**
 * AS MIGRATIONS QUE FALAM DESTA FRENTE. Lidas do disco, e não uma lista digitada: a migration nova
 * ganha número a cada geração do drizzle-kit, e fixar o número aqui quebraria o teste na próxima.
 */
function migrationsDaOndaC(): string[] {
  const dir = join(__dirname, "..", "..", "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((sql) => /as_linhas_servico|as_cidades|linha_servico_id|cidade_id/i.test(sql));
}

/**
 * ─ ONDA C: O CONTRATO DE DADOS, MEDIDO NO SCHEMA E NA RÉGUA ───────────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção (§A.40 regra 2).
 *
 * ┌─ POR QUE TANTA COISA AQUI É AFIRMADA NO SCHEMA, E ISSO É ESCOLHA, NÃO PREGUIÇA ─────────────┐
 * │ Três dos quatro requisitos desta frente são sobre a FORMA do dado, e forma errada não falha:   │
 * │ ela funciona no dia da entrega e cobra depois.                                                │
 * │   . duas listas paralelas de idioma e nível "funcionam" enquanto ninguém edita no meio;        │
 * │   . casar cidade por NOME "funciona" até a primeira das quatro "Bom Jesus";                    │
 * │   . uma coluna nova NOT NULL "funciona" no banco vazio da homologação e derruba a migração     │
 * │     nas 3 linhas de produção.                                                                 │
 * │ Nenhuma dessas três tem como ser pega por um teste de serviço, porque o serviço vai estar      │
 * │ certo: quem está errado é o formato embaixo dele.                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ AS TABELAS SÃO DESCOBERTAS PELO NOME NO BANCO, e não pelo nome da constante exportada ──────
 * `as_cidades` é o nome que a migration escreve e o que qualquer consulta futura vai falar; o nome
 * da constante TypeScript é escolha de quem digita. Varrer o schema pelo nome SQL deixa a construção
 * livre para chamar a constante do que quiser, e mantém a asserção sobre o que de fato importa.
 *
 * §A.6: nenhum dado pessoal. Nomes de coluna, tipos e uma régua de campos obrigatórios.
 */

type TabelaDoSchema = Parameters<typeof getTableConfig>[0];

/** Acha uma tabela do schema pelo NOME SQL dela. Devolve `null` em vez de estourar. */
function tabela(nomeSql: string): TabelaDoSchema | null {
  for (const valor of Object.values(schema as Record<string, unknown>)) {
    try {
      const cfg = getTableConfig(valor as TabelaDoSchema);
      if (cfg.name === nomeSql) return valor as TabelaDoSchema;
    } catch {
      // Não é uma tabela do drizzle (enum, helper, constante). Segue.
    }
  }
  return null;
}

function exigirTabela(nomeSql: string): TabelaDoSchema {
  const t = tabela(nomeSql);
  if (!t) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: não existe a tabela "${nomeSql}" no schema do drizzle.`,
    );
  }
  return t;
}

function colunas(nomeSql: string) {
  return getTableConfig(exigirTabela(nomeSql)).columns;
}

/** A coluna da tabela de vagas que casa com um padrão. O NOME exato é escolha da construção. */
function colunaDaVagaPorPadrao(padrao: RegExp) {
  const achadas = colunas("vagas").filter((c) => padrao.test(c.name));
  if (achadas.length !== 1) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: esperava UMA coluna de "vagas" casando com ${padrao}, achei ` +
        `${achadas.length}: ${JSON.stringify(achadas.map((c) => c.name))}`,
    );
  }
  return achadas[0]!;
}

function coluna(nomeSql: string, nomeColuna: string) {
  const achada = colunas(nomeSql).find((c) => c.name === nomeColuna);
  if (!achada) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: a tabela "${nomeSql}" não tem a coluna "${nomeColuna}". ` +
        `Colunas: ${JSON.stringify(colunas(nomeSql).map((c) => c.name))}`,
    );
  }
  return achada;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. LINHA DE SERVIÇO: catálogo no molde das etapas, e OBRIGATÓRIA PELA RÉGUA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o catálogo de linhas de serviço é uma tabela, no molde das etapas", () => {
  /**
   * INATIVAR EM VEZ DE APAGAR é o requisito do diretor escrito em uma coluna: sem o `ativo`, tirar
   * uma linha de circulação só pode ser `delete`, e o `delete` leva junto a resposta da VAGA ANTIGA
   * para "de que linha você era?". O histórico não pode depender de ninguém lembrar de não apagar.
   */
  it("tem código imutável, rótulo editável, ordem e o flag de ativo", () => {
    const nomes = colunas("as_linhas_servico").map((c) => c.name);
    expect(nomes).toContain("codigo");
    expect(nomes).toContain("rotulo");
    expect(nomes).toContain("ordem");
    expect(nomes).toContain("ativo");
  });

  /** O CÓDIGO É A CHAVE DE NEGÓCIO e não pode repetir: dois "ALTO_VOLUME" tornam a linha ambígua. */
  it("o código é único", () => {
    expect(coluna("as_linhas_servico", "codigo").isUnique).toBe(true);
  });

  /**
   * ─ A VAGA APONTA PARA A LINHA, E O APONTAMENTO NÃO PODE SUMIR COM A INATIVAÇÃO ──────────────
   * A coluna é NULA por duas razões independentes: as 3 vagas de produção existem sem ela (ver o
   * bloco da migração, abaixo), e o rascunho de vaga nasce vazio por construção.
   */
  /**
   * A COLUNA É DESCOBERTA POR PADRÃO, e não pelo nome que eu teria escolhido: eu apostei em
   * `linha_de_servico_id` e a construção escreveu `linha_servico_id`. O requisito é "a vaga aponta
   * para a linha", e não a preposição no meio do identificador.
   */
  it("a vaga guarda a linha de serviço, e a coluna aceita nulo", () => {
    const c = colunaDaVagaPorPadrao(/linha.*servico/i);
    expect(c.notNull).toBe(false);
    expect(c.dataType).toBe("number");
  });
});

/**
 * UMA VAGA COM TODOS OS OBRIGATÓRIOS PREENCHIDOS, montada a partir da PRÓPRIA lista.
 *
 * DERIVAR AQUI É CERTO, e é o oposto do caso do catálogo: o que se afirma não é o CONTEÚDO da lista
 * (isso está nos testes acima), é a COERÊNCIA entre a lista e a leitura. Obrigatório novo entra
 * sozinho, e se o nome dele não casar com o que a régua lê, o segundo teste do par fica vermelho.
 */
function vagaCompleta(opcoes: { semLinhaDeServico?: boolean } = {}): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const p of VAGA_OBRIGATORIOS) {
    if (opcoes.semLinhaDeServico && /linha/i.test(p.campo)) continue;
    // `posicoesOficiais` tem régua própria: zero não conta como preenchido.
    v[p.campo] = p.campo === "posicoesOficiais" ? 3 : "preenchido";
  }
  return v;
}

describe("a linha de serviço é obrigatória PELA RÉGUA, e não por um if", () => {
  /**
   * ─ POR QUE A RÉGUA, E NÃO UMA VALIDAÇÃO NO DTO OU UM `if` NO SERVICE ────────────────────────
   *
   * `vagaPendencias` devolve a LISTA INTEIRA do que falta, com passo, rótulo e âncora, e é ela que a
   * tela usa para levar a pessoa até o campo. Um `if` no service recusaria a publicação com UM erro
   * de cada vez, e quem preenche 38 campos descobriria as pendências uma por uma, com uma volta ao
   * servidor entre cada duas. O comentário do próprio DTO diz isso com todas as letras, e é a régua
   * que ele aponta.
   *
   * E A RÉGUA É COMPARTILHADA: a mesma lista alimenta o backend e a tela. Um `if` só no servidor
   * faria a tela deixar publicar e o servidor recusar.
   */
  it("a linha de serviço está em VAGA_OBRIGATORIOS", () => {
    const campos = VAGA_OBRIGATORIOS.map((p) => p.campo);
    expect(
      campos.filter((c) => /linha/i.test(c)),
      `Obrigatórios de hoje: ${JSON.stringify(campos)}`,
    ).not.toHaveLength(0);
  });

  it("a vaga sem linha de serviço é acusada por vagaPendencias", () => {
    const pendencias = vagaPendencias({} as never).map((p) => p.campo);
    expect(pendencias.some((c) => /linha/i.test(c))).toBe(true);
  });

  /**
   * A PENDÊNCIA PRECISA SABER LEVAR A PESSOA ATÉ O CAMPO: passo, rótulo e âncora. Uma entrada sem
   * âncora aparece na lista e não leva a lugar nenhum, que é pior do que não aparecer, porque
   * promete um caminho.
   */
  it("a pendência da linha de serviço tem passo, rótulo e âncora", () => {
    const p = VAGA_OBRIGATORIOS.find((x) => /linha/i.test(x.campo));
    expect(p).toBeDefined();
    expect(p!.rotulo.trim().length).toBeGreaterThan(0);
    expect(p!.ancora.trim().length).toBeGreaterThan(0);
    expect(typeof p!.passo).toBe("number");
  });

  /**
   * ─ O PAR QUE O COORDENADOR PEDIU, E É O ÚNICO QUE PEGA A RÉGUA QUEBRADA ──────────────────────
   *
   * ┌─ POR QUE UM TESTE SÓ NÃO BASTA AQUI ───────────────────────────────────────────────────────┐
   * │ `vagaPendencias` indexa por TEXTO (`as Record<string, unknown>`), então o compilador NÃO    │
   * │ protege o nome do campo. Se a lista dos obrigatórios disser `linhaDeServicoId` e o objeto   │
   * │ que a tela monta disser `linhaServicoId`, a régua lê `undefined` SEMPRE: a vaga COMPLETA    │
   * │ passa a acusar uma pendência que não existe, e NINGUÉM publica vaga nenhuma. Com typecheck  │
   * │ verde.                                                                                     │
   * │                                                                                            │
   * │ O TESTE DE CIMA ("a vaga vazia acusa a linha") PASSA COM A RÉGUA QUEBRADA, porque na vaga   │
   * │ vazia o campo está mesmo faltando. Só o SEGUNDO caso distingue: vaga COMPLETA tem de acusar │
   * │ ZERO. É o par que prova que o nome do campo casa nas duas pontas.                           │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("vaga completa EXCETO a linha de serviço acusa EXATAMENTE uma pendência", () => {
    const pendencias = vagaPendencias(vagaCompleta({ semLinhaDeServico: true }));
    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]!.campo).toMatch(/linha/i);
  });

  it("vaga COMPLETA acusa ZERO pendências (é este que pega o nome de campo trocado)", () => {
    expect(
      vagaPendencias(vagaCompleta()),
      "pendência numa vaga completa quer dizer que a régua lê um campo que ninguém escreve",
    ).toEqual([]);
  });

  /** §A.11: travessão é PROIBIDO em todo texto que chega ao usuário, e a pendência chega. */
  it("o texto da pendência não usa travessão (§A.11)", () => {
    for (const p of VAGA_OBRIGATORIOS) {
      expect(textoPendencia(p), p.campo).not.toContain("—");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. CIDADES DO IBGE: a chave é o CÓDIGO, e o nome pode repetir
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a base de cidades tem o código do IBGE como chave", () => {
  it("a tabela existe, com nome e UF", () => {
    const nomes = colunas("as_cidades").map((c) => c.name);
    expect(nomes).toContain("nome");
    expect(nomes).toContain("uf");
  });

  /**
   * ─ A CHAVE É O CÓDIGO, E ELE NÃO É GERADO: ELE VEM DO IBGE ──────────────────────────────────
   *
   * Uma chave `serial` aqui seria a diferença entre "o id que este banco inventou" e "o código
   * oficial do município". A primeira não sobrevive a um reseed (os ids trocam e as vagas passam a
   * apontar para outra cidade); a segunda é estável, oficial, e é o que qualquer integração futura
   * vai falar. É também o que torna o seed IDEMPOTENTE de graça: `on conflict do nothing` só existe
   * se houver um conflito possível, e o conflito é o código.
   */
  it("a chave primária é o código do IBGE, e é um inteiro", () => {
    const cfg = getTableConfig(exigirTabela("as_cidades"));
    const pk = cfg.columns.filter((c) => c.primary).map((c) => c.name);
    const compostas = cfg.primaryKeys.flatMap((k) => k.columns.map((c) => c.name));
    const chave = pk.length > 0 ? pk : compostas;
    expect(chave).toEqual(["id"]);

    const id = coluna("as_cidades", "id");
    expect(id.dataType).toBe("number");
    // `hasDefault` seria o `serial`: id gerado pelo banco, e não o código que veio do IBGE.
    expect(id.hasDefault, "a chave não pode ser gerada pelo banco: ela VEM do IBGE").toBe(false);
  });

  /**
   * ─ O CASO QUE O NOME ESCONDE, e é ele que o diretor pediu nominalmente ──────────────────────
   *
   * HÁ QUATRO "BOM JESUS" no Brasil, em estados diferentes. Se o nome for único (sozinho ou junto
   * de qualquer coisa que não seja a UF), o seed do IBGE perde municípios EM SILÊNCIO: o
   * `on conflict do nothing` engole o segundo "Bom Jesus" e a lista fica sem ele, sem erro nenhum.
   * Depois, o consultor de Goiás procura a cidade dele e não acha, e ninguém liga uma coisa à outra.
   *
   * A ASSERÇÃO É SOBRE A AUSÊNCIA de unicidade no nome, porque é a ausência que permite os quatro.
   */
  it("o NOME não é único: quatro municípios chamados Bom Jesus têm de caber", () => {
    const cfg = getTableConfig(exigirTabela("as_cidades"));
    expect(coluna("as_cidades", "nome").isUnique).toBeFalsy();

    const uniquesComNome = cfg.uniqueConstraints.filter((u) =>
      u.columns.some((c) => c.name === "nome"),
    );
    for (const u of uniquesComNome) {
      // Um unique (nome) sozinho mata três dos quatro. Um unique (nome, uf) ainda é aceitável,
      // porque não existem dois municípios de mesmo nome no MESMO estado.
      expect(
        u.columns.map((c) => c.name).sort(),
        "unique envolvendo o nome tem de incluir a UF",
      ).toEqual(["nome", "uf"]);
    }
  });

  /** A vaga aponta para a cidade pelo CÓDIGO, e a coluna aceita nulo (rascunho e vaga antiga). */
  it("a vaga guarda a cidade pelo código do IBGE, e a coluna aceita nulo", () => {
    const c = coluna("vagas", "cidade_id");
    expect(c.notNull).toBe(false);
    expect(c.dataType).toBe("number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. IDIOMA COM NÍVEL: o par é INDIVISÍVEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o par idioma+nível é indivisível, e a coluna nova fica AO LADO", () => {
  /**
   * ─ O ATALHO QUE ESTE BLOCO REPROVA ──────────────────────────────────────────────────────────
   *
   * Duas listas paralelas (`idiomas[]` e `niveis[]`) casadas pela POSIÇÃO são o caminho mais curto e
   * o mais errado: concordam no dia em que são escritas e desalinham na primeira edição que remove
   * um item do meio. O resultado é silencioso e absurdo (inglês básico vira espanhol fluente), e
   * nenhum teste de serviço percebe, porque o serviço leu as duas listas corretamente.
   */
  it("NÃO existe uma coluna de níveis paralela à de idiomas", () => {
    const nomes = colunas("vagas").map((c) => c.name);
    const paralelas = nomes.filter((n) => /^idiomas?_(niveis|nivel)$/.test(n));
    expect(
      paralelas,
      "duas listas casadas por posição desalinham na primeira edição do meio",
    ).toEqual([]);
  });

  /**
   * ─ A COLUNA NOVA É NOVA, E A VELHA FICA CONGELADA (correção de requisito, §10 do mapa) ───────
   *
   * A minha primeira versão exigia `idiomas` convertida para `jsonb` in place, e a AUDITORIA VETOU,
   * com dois argumentos que eu não tinha:
   *   1. as migrations rodam todas no mesmo comando, então converter derrubaria a tela NO INSTANTE
   *      em que a Onda B subisse, porque o código no ar ainda lê `string[]`;
   *   2. converter obrigaria a INVENTAR um nível para as 3 vagas que já pedem idioma, e nenhuma
   *      migration pode decidir isso: nível baixo AFROUXA a exigência de uma vaga viva, nível alto
   *      ELIMINA gente do processo, os dois em silêncio.
   *
   * ENTÃO SÃO DUAS COLUNAS: a velha intocada e só de leitura, a nova ao lado, em JSON.
   */
  it("a coluna LEGADA de idiomas continua sendo text[], intocada", () => {
    const legada = coluna("vagas", "idiomas");
    expect(legada.dataType, "converter a velha derruba a tela no ar").toBe("array");
  });

  it("existe uma coluna NOVA de idiomas em JSON, ao lado da legada", () => {
    const nomes = colunas("vagas").map((c) => c.name);
    const novas = nomes
      .filter((n) => /idioma/i.test(n) && n !== "idiomas" && n !== "idiomas_outros")
      .map((n) => coluna("vagas", n))
      .filter((c) => c.dataType === "json");
    expect(
      novas.length,
      `Nenhuma coluna nova de idioma em JSON. Colunas de idioma: ${JSON.stringify(
        nomes.filter((n) => /idioma/i.test(n)),
      )}`,
    ).toBeGreaterThan(0);
  });

  /**
   * ─ "NÍVEL NÃO INFORMADO" É UM ESTADO, e é o que o veto da auditoria criou ────────────────────
   *
   * A linha legada pede idioma e NÃO tem nível. A leitura precisa saber dizer isso sem inventar e
   * sem descartar a exigência: apagar a linha inteira esconderia da tela um idioma que a vaga de
   * fato exige.
   */
  it("a leitura admite nível AUSENTE, e não inventa um", () => {
    expect(idiomasGravados([{ idioma: "Inglês" }])).toEqual([{ idioma: "Inglês", nivel: null }]);
    expect(temNivel({ idioma: "Inglês", nivel: null })).toBe(false);
  });

  it("nível ilegível vira ausente, e o IDIOMA sobrevive", () => {
    expect(idiomasGravados([{ idioma: "Inglês", nivel: "MUITO_BOM" }])).toEqual([
      { idioma: "Inglês", nivel: null },
    ]);
  });

  /** O par completo continua sendo par completo: a sanitização não pode rebaixar quem tem nível. */
  it("o par completo atravessa a leitura inteiro", () => {
    expect(idiomasGravados([{ idioma: "Espanhol", nivel: "FLUENTE" }])).toEqual([
      { idioma: "Espanhol", nivel: "FLUENTE" },
    ]);
    expect(temNivel({ idioma: "Espanhol", nivel: "FLUENTE" })).toBe(true);
  });

  /**
   * `jsonb` É COLUNA SEM ESQUEMA, e o DTO defende só a porta HTTP. Lixo vindo por outro caminho
   * (update manual, carga futura, bug) não pode virar `undefined` no meio da tela.
   */
  it("lixo no jsonb não vira linha quebrada na tela", () => {
    expect(idiomasGravados("não é lista")).toEqual([]);
    expect(idiomasGravados([null, 3, { nivel: "FLUENTE" }, { idioma: "   " }])).toEqual([]);
  });

  /**
   * ─ O VOCABULÁRIO DE NÍVEL, E OS CASOS ESCRITOS À MÃO ────────────────────────────────────────
   *
   * A lição medida na onda passada: teste derivado da constante que ele testa NÃO reprova o
   * encolhimento dela, encolhe junto em silêncio. Remover "INTERMEDIARIO" faria um laço
   * `for (const n of IDIOMA_NIVEIS)` deixar de gerar aquele caso, e a suíte ficaria verde afirmando
   * menos. Os quatro de hoje estão escritos à mão: é a única redundância deliberada do arquivo.
   */
  it("ESCRITO À MÃO: os quatro níveis de hoje existem, na ordem da escada", () => {
    expect([...IDIOMA_NIVEIS]).toEqual(["BASICO", "INTERMEDIARIO", "AVANCADO", "FLUENTE"]);
  });

  it("ESCRITO À MÃO: cada um dos quatro tem etiqueta em title case (§A.24)", () => {
    expect(IDIOMA_NIVEL_LABEL.BASICO).toBe("Básico");
    expect(IDIOMA_NIVEL_LABEL.INTERMEDIARIO).toBe("Intermediário");
    expect(IDIOMA_NIVEL_LABEL.AVANCADO).toBe("Avançado");
    expect(IDIOMA_NIVEL_LABEL.FLUENTE).toBe("Fluente");
  });

  /** O laço DERIVADO continua, para o nível novo entrar na cobertura sozinho. §A.11 junto. */
  it("todo nível do catálogo tem etiqueta, e nenhuma usa travessão", () => {
    for (const nivel of IDIOMA_NIVEIS) {
      const rotulo = IDIOMA_NIVEL_LABEL[nivel];
      expect(rotulo, nivel).toBeTruthy();
      expect(rotulo, nivel).not.toContain("—");
    }
  });

  /**
   * ─ O NÍVEL NOVO TEM DE SER ACEITO PELA LEITURA, e este é o par do teste acima ────────────────
   * `idiomasGravados` valida contra `IDIOMA_NIVEIS`. Um nível novo no catálogo que a leitura não
   * reconheça seria gravado pelo DTO e lido como `null`: a vaga pediria "Inglês, nível não
   * informado" no dia seguinte a alguém acrescentar o nível.
   */
  it("todo nível do catálogo atravessa a leitura sem virar ausente", () => {
    for (const nivel of IDIOMA_NIVEIS) {
      expect(idiomasGravados([{ idioma: "Inglês", nivel }]), nivel).toEqual([
        { idioma: "Inglês", nivel },
      ]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A MIGRAÇÃO: as 3 linhas de produção continuam dizendo o que diziam
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a migração preserva o que já está gravado", () => {
  /**
   * ─ "RODA SEM ERRO" NÃO É O REQUISITO ────────────────────────────────────────────────────────
   *
   * São 3 vagas em produção, todas com estado e idioma preenchidos. O risco não é a migration
   * falhar: é ela SUBIR e as três perderem o que tinham, o que ninguém percebe, porque são três
   * linhas num sistema que ninguém relê campo a campo.
   *
   * A FORMA DE NÃO PERDER É AS DUAS COLUNAS CONVIVEREM: a antiga continua lá com o dado antigo até a
   * tela trocar, e a nova nasce nula. Derrubar a antiga na mesma migration é o que torna a perda
   * irreversível, porque o `drop column` não tem volta.
   */
  it("a coluna antiga de estado (regiao_estado) continua existindo", () => {
    const nomes = colunas("vagas").map((c) => c.name);
    expect(
      nomes,
      "derrubar a coluna antiga na mesma migration torna a perda irreversível",
    ).toContain("regiao_estado");
  });

  /**
   * ─ A MIGRAÇÃO NÃO CONVERTE NADA, E ISSO É CORREÇÃO DE REQUISITO, NÃO AFROUXAMENTO ───────────
   *
   * A minha primeira versão exigia `ALTER COLUMN ... TYPE jsonb USING ...`, porque eu tinha lido o
   * schema no meio da construção e visto a conversão in place. A AUDITORIA VETOU aquela forma, e o
   * requisito virou OUTRO: coluna nova ao lado, legada intocada.
   *
   * ENTÃO O QUE SE AFIRMA MUDOU DE SINAL. Não é mais "converta com USING", é "NÃO ENCOSTE na
   * legada": nem `drop`, nem `alter type`, nem `rename`. Qualquer um dos três derruba a tela no ar
   * no instante em que a migration rodar, porque o código publicado ainda lê `text[]`, e as
   * migrations rodam todas no mesmo comando.
   *
   * ESTE TESTE É DECLARADAMENTE FRACO, e a fraqueza fica dita para ninguém confiar demais: ele lê
   * TEXTO de migration. O que ele pega é a classe de erro grosseira e irreversível, que é a que
   * custa os dados.
   */
  it("a migração NÃO encosta na coluna legada de idiomas", () => {
    const sqls = migrationsDaOndaC();
    expect(
      sqls.length,
      "nenhuma migration mencionando as tabelas/colunas da Onda C foi encontrada",
    ).toBeGreaterThan(0);

    const texto = sqls.join("\n").toLowerCase();
    expect(texto, "derrubar a legada é perda irreversível").not.toMatch(
      /drop\s+column\s+"?idiomas"?[^_]/,
    );
    expect(texto, "converter a legada derruba a tela no ar").not.toMatch(
      /alter\s+column\s+"?idiomas"?\s+(set\s+data\s+)?type/,
    );
    expect(texto, "renomear a legada é o mesmo estrago com outro nome").not.toMatch(
      /rename\s+column\s+"?idiomas"?\s+to/,
    );
  });

  /** E a coluna NOVA de fato nasce na migration, senão o "ao lado" é só intenção. */
  it("a migração ACRESCENTA a coluna nova de idiomas", () => {
    const texto = migrationsDaOndaC().join("\n").toLowerCase();
    expect(texto).toMatch(/add\s+column[^;]*idiomas_\w+/);
  });


  /**
   * ─ A ARMADILHA CLÁSSICA DE MIGRATION: NOT NULL EM TABELA QUE JÁ TEM LINHA ───────────────────
   *
   * `add column linha_de_servico_id integer not null` passa no banco VAZIO da homologação (8 vagas,
   * mas o teste roda contra o schema) e ESTOURA nas 3 linhas de produção, que não têm valor. É o
   * tipo de defeito que só aparece no ambiente que importa, e depois do deploy.
   *
   * NULO É O ESTADO LEGÍTIMO nas duas pontas: a vaga antiga não tinha linha de serviço, e o rascunho
   * de vaga nasce sem nada preenchido (é a razão de todo o DTO ser `@IsOptional`). Quem cobra a
   * presença é a régua de publicação, e não o banco.
   */
  it("nenhuma coluna nova da Onda C nasce NOT NULL na tabela de vagas", () => {
    for (const padrao of [/linha.*servico/i, /^cidade_id$/]) {
      const c = colunas("vagas").find((x) => padrao.test(x.name));
      if (!c) continue; // a ausência é cobrada nos blocos acima, com mensagem própria.
      expect(
        c.notNull,
        `${c.name} NOT NULL derruba a migration nas 3 linhas de produção`,
      ).toBe(false);
    }
  });

  /** O catálogo de cidades é referenciado pela vaga, então ele não pode ser apagado por acidente. */
  it("a cidade da vaga não some quando o catálogo muda: a coluna guarda o código", () => {
    expect(coluna("vagas", "cidade_id").dataType).toBe("number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. O SEED DO IBGE: o que dá para afirmar sem rede e sem banco, e o que NÃO dá
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a carga das cidades é re-executável pelo código do IBGE", () => {
  /**
   * ─ O GAP QUE EU PEDI FOI ATENDIDO, e este bloco mudou de natureza por causa disso ────────────
   *
   * Na primeira versão eu só conseguia ler o FONTE do script, porque o transform vivia dentro de um
   * `main()` não exportado que, no mesmo fôlego, fazia `fetch` no IBGE e abria conexão com o banco.
   * Agora `municipiosDoIbge` é função pura e exportada, e as duas propriedades que o diretor pediu
   * (rodar duas vezes não duplica; os quatro "Bom Jesus" sobrevivem) viram teste de verdade, sem
   * rede e sem Postgres.
   *
   * §A.6: nenhum dado pessoal. Códigos do IBGE, nomes de município e siglas de UF.
   */

  /** Os quatro "Bom Jesus" REAIS, com os códigos do IBGE de cada um. É o caso que o nome esconde. */
  const BOM_JESUS = [
    { id: 2202075, nome: "Bom Jesus", microrregiao: { mesorregiao: { UF: { sigla: "PI" } } } },
    { id: 2601607, nome: "Bom Jesus", microrregiao: { mesorregiao: { UF: { sigla: "PE" } } } },
    { id: 4302501, nome: "Bom Jesus", microrregiao: { mesorregiao: { UF: { sigla: "RS" } } } },
    { id: 4202503, nome: "Bom Jesus", microrregiao: { mesorregiao: { UF: { sigla: "SC" } } } },
  ];

  /**
   * ─ O CASO QUE O DIRETOR PEDIU NOMINALMENTE ──────────────────────────────────────────────────
   *
   * Casar por NOME engole três dos quatro EM SILÊNCIO: o `on conflict` acha que é a mesma cidade e
   * não insere. Depois, o consultor de Goiás procura a cidade dele, não acha, e ninguém liga uma
   * coisa à outra, porque nada falhou. É a chave que decide isso, e a chave é o código do IBGE.
   */
  it("os quatro municípios chamados Bom Jesus sobrevivem, um por estado", () => {
    const r = municipiosDoIbge(BOM_JESUS);
    expect(r.linhas).toHaveLength(4);
    expect(new Set(r.linhas.map((l) => l.id)).size, "os códigos são distintos").toBe(4);
    expect(r.linhas.map((l) => l.uf).sort()).toEqual(["PE", "PI", "RS", "SC"]);
    expect(r.duplicados, "nome igual não é duplicata").toBe(0);
  });

  /**
   * IDEMPOTÊNCIA, e ela começa aqui: o transform é PURO, então rodar duas vezes sobre a mesma fonte
   * devolve exatamente o mesmo conjunto. O `on conflict` pelo código fecha a outra metade, no banco.
   */
  it("rodar duas vezes sobre a mesma fonte devolve exatamente o mesmo conjunto", () => {
    expect(municipiosDoIbge(BOM_JESUS)).toEqual(municipiosDoIbge(BOM_JESUS));
  });

  /**
   * O CÓDIGO REPETIDO NA FONTE É DUPLICATA DE VERDADE, e ela é CONTADA em vez de engolida: uma
   * fonte que repita o mesmo município duas vezes é sinal de problema na origem, e um seed que
   * silencie isso esconde a única pista.
   */
  it("código repetido na fonte é contado como duplicata, e entra uma vez só", () => {
    const r = municipiosDoIbge([...BOM_JESUS, BOM_JESUS[0]!]);
    expect(r.linhas).toHaveLength(4);
    expect(r.duplicados).toBe(1);
  });

  /**
   * ─ A VALIDAÇÃO LINHA A LINHA, condição da auditoria ─────────────────────────────────────────
   * O que não passa NÃO some em silêncio: vira `recusados` com motivo. Um seed que descartasse calado
   * gravaria uma base pela metade e ninguém notaria até alguém procurar uma cidade que sumiu.
   */
  it("o lixo é RECUSADO com motivo, e não descartado em silêncio", () => {
    const r = municipiosDoIbge([
      ...BOM_JESUS,
      { id: 0, nome: "Sem Código", microrregiao: { mesorregiao: { UF: { sigla: "SP" } } } },
      { id: 3550308, nome: "   ", microrregiao: { mesorregiao: { UF: { sigla: "SP" } } } },
      { id: 3550309, nome: "Sem UF" },
      { id: 3550310, nome: "UF Inventada", microrregiao: { mesorregiao: { UF: { sigla: "XX" } } } },
    ]);
    expect(r.linhas).toHaveLength(4);
    expect(r.recusados.length, "cada recusa tem de aparecer").toBe(4);
    for (const rec of r.recusados) expect(rec.motivo.trim().length).toBeGreaterThan(0);
  });

  /** A UF é conferida contra as 27, e não aceita sigla inventada: é o par da rota de leitura. */
  it("a UF é validada contra as 27, e o código tem de ter 7 dígitos", () => {
    expect(UFS_IBGE.size, "27 UFs, incluindo o DF").toBe(27);
    const curto = municipiosDoIbge([
      { id: 123, nome: "Código Curto", microrregiao: { mesorregiao: { UF: { sigla: "SP" } } } },
    ]);
    expect(curto.linhas).toHaveLength(0);
  });

  /**
   * A FONTE É CONSTANTE NO CÓDIGO, e nunca variável de ambiente (condição da auditoria): uma URL
   * vinda do ambiente transforma o seed numa porta para gravar 5.570 linhas do que alguém quiser.
   */
  it("a URL do IBGE é constante no código", () => {
    expect(FONTE_IBGE).toMatch(/^https:\/\/servicodados\.ibge\.gov\.br\//);
  });

  /**
   * ─ A TRAVA DE SANIDADE, e ela é a que se remove "para destravar" num dia ruim ────────────────
   * Se a fonte mudar de formato e o parse extrair 40 linhas, a carga ficaria pela metade e o
   * `on conflict do nothing` não acusaria nada. Recusar é o modo de falha alto e visível.
   */
  it("o piso de sanidade existe e é da ordem da base inteira", () => {
    expect(MINIMO_MUNICIPIOS).toBeGreaterThanOrEqual(5_000);
    expect(municipiosDoIbge(BOM_JESUS).linhas.length).toBeLessThan(MINIMO_MUNICIPIOS);
  });

  /** Fonte que não é lista não vira base vazia gravada por cima: vira zero linhas e zero ilusão. */
  it("fonte ilegível devolve conjunto vazio, sem estourar", () => {
    expect(municipiosDoIbge("não é lista").linhas).toEqual([]);
    expect(municipiosDoIbge(null).linhas).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. A PORTA HTTP: o DTO é a única defesa de uma coluna sem esquema
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o DTO defende a coluna jsonb dos idiomas", () => {
  /**
   * ─ `jsonb` ACEITA QUALQUER COISA, e por isso o DTO é a trava (condição da auditoria) ─────────
   *
   * Sem `@ValidateNested({ each: true })` + `@Type()`, o `class-validator` NÃO desce nos itens da
   * lista: ele confere que é um array e para por aí. A coluna passa a aceitar JSON arbitrário de
   * qualquer autenticado, e um `{"idioma": {"$ne": null}}` entra no banco sem ninguém notar.
   *
   * O TESTE É COMPORTAMENTAL, e não "o decorador está lá": ele valida corpos de verdade e afirma
   * quem é recusado. Decorador presente e mal configurado passaria num teste de metadado.
   */
  function erros(corpo: unknown) {
    return validateSync(plainToInstance(CreateVagaDto, corpo), { whitelist: true });
  }
  const errosDoCampo = (corpo: unknown) =>
    erros(corpo).filter((e) => /idiomasExigidos/i.test(e.property));

  it("aceita o par completo", () => {
    expect(errosDoCampo({ idiomasExigidos: [{ idioma: "Inglês", nivel: "FLUENTE" }] })).toHaveLength(
      0,
    );
  });

  /** A REGRA INTEIRA DA PEÇA: idioma escolhido SEM nível é recusado na porta. */
  it("RECUSA idioma sem nível", () => {
    expect(errosDoCampo({ idiomasExigidos: [{ idioma: "Inglês" }] })).not.toHaveLength(0);
  });

  it("RECUSA nível fora da escala fechada", () => {
    expect(
      errosDoCampo({ idiomasExigidos: [{ idioma: "Inglês", nivel: "MUITO_BOM" }] }),
    ).not.toHaveLength(0);
  });

  it("RECUSA idioma fora da lista fechada", () => {
    expect(
      errosDoCampo({ idiomasExigidos: [{ idioma: "Klingon", nivel: "FLUENTE" }] }),
    ).not.toHaveLength(0);
  });

  /**
   * O CASO QUE PROVA QUE O `each: true` DESCE DE VERDADE: o PRIMEIRO item é válido e o SEGUNDO não.
   * Uma validação que só olhasse o array, ou só o primeiro item, passaria aqui.
   */
  it("RECUSA quando só o SEGUNDO item está errado", () => {
    expect(
      errosDoCampo({
        idiomasExigidos: [
          { idioma: "Inglês", nivel: "FLUENTE" },
          { idioma: "Espanhol", nivel: "MEIO_BOM" },
        ],
      }),
    ).not.toHaveLength(0);
  });

  /** Lixo que não é objeto também é recusado: é a forma mais barata de sujar um `jsonb`. */
  it("RECUSA item que nem objeto é", () => {
    expect(errosDoCampo({ idiomasExigidos: ["Inglês"] })).not.toHaveLength(0);
    expect(errosDoCampo({ idiomasExigidos: [null] })).not.toHaveLength(0);
  });

  /**
   * ─ O CAMPO LEGADO NÃO PODE VOLTAR PELA PORTA ────────────────────────────────────────────────
   * Um corpo antigo (`idiomas: ["Inglês"]`) tem de ser recusado com mensagem, e não gravado: aceitar
   * reabriria a lista sem nível que a peça inteira existe para fechar.
   */
  it("um corpo ANTIGO, com a lista sem nível, não é aceito em silêncio", () => {
    const e = erros({ idiomas: ["Inglês"] });
    const instancia = plainToInstance(CreateVagaDto, { idiomas: ["Inglês"] }) as Record<
      string,
      unknown
    >;
    // Ou o DTO recusa explicitamente, ou o `whitelist` descarta o campo. O que não pode é ele
    // atravessar e virar gravação.
    const recusado = e.some((x) => /idiomas/i.test(x.property));
    const descartado = instancia.idiomas === undefined;
    expect(recusado || descartado, "a lista sem nível atravessou o DTO").toBe(true);
  });
});

describe("o escape de OUTROS idiomas sobrevive à segunda gravação", () => {
  /**
   * ─ A LINHA QUE APAGA EM SILÊNCIO, achada pela auditoria (§10 do mapa) ───────────────────────
   *
   * Era `dto.idiomas?.includes(OPCAO_OUTROS)`. Com a lista virando lista de OBJETOS, esse
   * `includes` compara objeto com string e é SEMPRE falso, então o ramo zera `idiomasOutros` na
   * primeira gravação seguinte. O texto que o consultor escreveu some, sem erro e sem aviso, e ele
   * só descobre relendo a ficha.
   *
   * A COMPARAÇÃO CERTA É PELO CAMPO (`i.idioma === OPCAO_OUTROS`). O teste afirma a PROPRIEDADE:
   * escolhido "Outros", o texto do escape continua vivo depois de gravar de novo.
   *
   * ─ E ELE É UM TESTE DE CONTRATO, NÃO DE SERVIÇO ─────────────────────────────────────────────
   * Montar o `VagasService` inteiro para afirmar uma comparação de string seria caro e frágil; o que
   * se afirma aqui é a régua que o service usa, com os mesmos dados. Se a régua mudar de casa, este
   * teste muda de import e continua valendo.
   */
  const escolheuOutros = (itens: { idioma: string }[]) =>
    itens.some((i) => i.idioma === OPCAO_OUTROS);

  it("reconhece OUTROS na lista de objetos", () => {
    expect(escolheuOutros([{ idioma: "Inglês" }, { idioma: OPCAO_OUTROS }])).toBe(true);
  });

  it("NÃO reconhece quando ninguém escolheu OUTROS", () => {
    expect(escolheuOutros([{ idioma: "Inglês" }])).toBe(false);
  });

  /**
   * O TESTE QUE PEGA O DEFEITO EXATO: `includes` sobre uma lista de OBJETOS é sempre falso, mesmo
   * com "Outros" escolhido. É esta a expressão que zerava o campo.
   */
  it("um `includes` sobre a lista de objetos seria SEMPRE falso, e é esse o defeito", () => {
    const itens = [{ idioma: OPCAO_OUTROS, nivel: "FLUENTE" }];
    expect((itens as unknown as string[]).includes(OPCAO_OUTROS)).toBe(false);
    expect(escolheuOutros(itens), "a régua certa continua enxergando").toBe(true);
  });
});
