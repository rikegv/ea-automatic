import { describe, expect, it } from "vitest";
import { RetencaoCandidatosService } from "./candidatos/retencao-candidatos.service";
import {
  clausulasDoWhere,
  sqlDaVarredura,
  temAlternativaDeTopo,
} from "./candidatos/retencao-lgpd.tester-fake";

/**
 * ─ FECHAMENTO DA FUNDAÇÃO, PEÇA B: O EXPURGO PASSA A LER O CAMPO NOVO, E O SENTIDO É TUDO ──────
 *
 * COBERTURA INDEPENDENTE (§A.38) escrita JUNTO com a construção (§A.40 regra 2), a partir do
 * requisito (`docs/MAPA-ALCANCE-FECHAMENTO-FUNDACAO.md`, seção 6): a linha que hoje diz
 * `origem <> 'BANCO_TALENTOS'` passa a ler `as_candidatos.banco_talentos`.
 *
 * ┌─ ESTA É A LINHA MAIS PERIGOSA DA FRENTE INTEIRA, e o mapa diz isso com todas as letras ─────┐
 * │ Errar o SENTIDO do booleano não deixa o expurgo sem efeito: INVERTE quem ele alcança. Em vez │
 * │ de poupar quem está no banco de talentos, a varredura passa a anonimizar EXATAMENTE essas    │
 * │ pessoas, e a poupar todas as outras. É irreversível, roda de hora em hora, e do ponto de     │
 * │ vista do serviço nada falha: a contagem volta, o log não acusa, a linha continua lá.         │
 * │                                                                                             │
 * │ POR ISSO OS DOIS SENTIDOS SÃO MEDIDOS SEMPRE JUNTOS. Um caso que só prova um lado fica VERDE │
 * │ com o booleano invertido, e é justamente o invertido que destrói o que devia ser preservado. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ARQUIVO MEDE, E O QUE ELE NÃO MEDE, dito antes de alguém descobrir ─────────────┐
 * │ O filtro do expurgo mora DENTRO de uma consulta em SQL cru, e banco fingido devolve o que    │
 * │ quiser para qualquer filtro: não há como exercitá-lo sem um Postgres. A leitura aqui é da    │
 * │ CLÁUSULA, partida do `where` de topo pelo mesmo parser que o resto da casa usa, e sobre ela  │
 * │ se AVALIA o predicado para os dois estados possíveis da pessoa. Não é substring no texto     │
 * │ inteiro: é o pedaço certo, avaliado.                                                        │
 * │                                                                                             │
 * │ E O CONTRATO É EXERCITADO CONTRA MUTANTES, logo abaixo, porque "meu teste pega o defeito?"   │
 * │ não pode ser opinião num arquivo cujo defeito é irreversível.                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado pessoal aqui. O que se lê é o TEXTO de uma consulta, nunca o resultado dela.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. LER A CLÁUSULA DA RETENÇÃO, E SÓ ELA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Os literais de texto saem antes de qualquer leitura: `'banco_talentos'` é VALOR, não coluna. */
function semLiterais(sqlTexto: string): string {
  return sqlTexto.replace(/'[^']*'/g, " ' ' ");
}

/** A cláusula de topo que fala da COLUNA de retenção. Ausente devolve string vazia. */
export function clausulaDaRetencao(sqlTexto: string): string {
  return clausulasDoWhere(sqlTexto).find((c) => /\bbanco_talentos\b/.test(semLiterais(c))) ?? "";
}

/**
 * ─ O PREDICADO AVALIADO, QUE É O QUE TORNA OS DOIS SENTIDOS MEDÍVEIS ──────────────────────────
 *
 * Devolve se a cláusula ALCANÇA (ou seja, deixa passar para a anonimização) uma pessoa com a
 * retenção `marcado`. As formas aceitas são todas as que o Postgres entende para a mesma coisa,
 * porque um teste que morre com estilo mede desenho e não a propriedade que o diretor pediu.
 */
export function alcanca(clausula: string, marcado: boolean): boolean {
  const s = semLiterais(clausula).replace(/\s+/g, " ").trim().toLowerCase();
  const col = "[a-z_]*\\.?banco_talentos";
  if (new RegExp(`${col}\\s+is\\s+not\\s+true`).test(s)) return !marcado;
  if (new RegExp(`${col}\\s+is\\s+not\\s+false`).test(s)) return marcado;
  if (new RegExp(`${col}\\s*(=|is)\\s*false`).test(s)) return !marcado;
  if (new RegExp(`${col}\\s*(<>|!=)\\s*true`).test(s)) return !marcado;
  if (new RegExp(`${col}\\s*(=|is)\\s*true`).test(s)) return marcado;
  if (new RegExp(`${col}\\s*(<>|!=)\\s*false`).test(s)) return marcado;
  if (new RegExp(`\\bnot\\s+${col}\\b`).test(s)) return !marcado;
  if (new RegExp(`\\b${col}\\b`).test(s)) return marcado; // referência nua: seleciona os MARCADOS.
  throw new Error(`forma não reconhecida de ler a retenção: "${clausula}"`);
}

/**
 * ─ O CONTRATO, EM REGRAS NOMEADAS ────────────────────────────────────────────────────────────
 *
 * Devolve a lista de VIOLAÇÕES. Vazia é o contrato cumprido. Cada regra é nomeada para o vermelho
 * dizer QUAL propriedade caiu, e não só "o SQL mudou".
 */
export function violacoesDaRetencao(sqlTexto: string): string[] {
  const v: string[] = [];
  const t = sqlTexto.toLowerCase();

  if (/'banco_talentos'/.test(t)) {
    v.push(
      "RETENCAO_LIDA_COMO_ORIGEM: a consulta compara `origem` com o literal 'BANCO_TALENTOS', que " +
        "deixou de existir no tipo do Postgres. Isso não poupa ninguém: estoura `invalid input " +
        "value for enum` e derruba a varredura inteira, de hora em hora.",
    );
  }

  const clausula = clausulaDaRetencao(t);
  if (!clausula) {
    v.push(
      "RETENCAO_NAO_LIDA: nenhuma cláusula de topo lê `banco_talentos`. Sem ela, quem está no " +
        "banco de talentos volta a expirar, e o banco de talentos existe justamente para que a " +
        "pessoa seja procurada daqui a três anos.",
    );
    return v;
  }

  /**
   * ─ LER O SENTIDO NÃO BASTA: A CLÁUSULA PRECISA EXCLUIR ALGUÉM ───────────────────────────────
   *
   * `alcanca`, logo abaixo, lê a COMPARAÇÃO, e uma comparação certa pode estar dentro de uma
   * cláusula que não restringe nada. `(c.banco_talentos = false or 1=1)` é sempre verdadeira, e
   * `c.banco_talentos = false or true` é pior: o `or` tem precedência menor que o `and`, liga o
   * `where` INTEIRO e o expurgo passa a alcançar todo mundo, inclusive quem está em processo vivo.
   * Nos dois casos a linha continua no texto, legível e tranquilizadora, dizendo o contrário do que
   * a consulta faz. A leitura é de PROFUNDIDADE ZERO da cláusula da retenção: `or` dentro de
   * parêntese é condição de outra pessoa, e reprová-lo mediria desenho.
   */
  if (temAlternativaDeTopo(clausula)) {
    v.push(
      "RETENCAO_NAO_RESTRITIVA: a cláusula da retenção tem um `or` de topo, então ela deixou de " +
        "EXCLUIR alguém. A comparação continua certa no texto e a proteção não existe mais: sem " +
        "parênteses o `or` ainda liga o `where` inteiro, e a anonimização é irreversível.",
    );
  }

  let alcancaMarcado: boolean;
  let alcancaNaoMarcado: boolean;
  try {
    alcancaMarcado = alcanca(clausula, true);
    alcancaNaoMarcado = alcanca(clausula, false);
  } catch (e) {
    v.push(`RETENCAO_FORMA_ESTRANHA: ${(e as Error).message}`);
    return v;
  }

  if (alcancaMarcado) {
    v.push(
      "RETENCAO_SENTIDO_INVERTIDO: a cláusula alcança quem TEM a retenção marcada. O expurgo " +
        "passaria a anonimizar exatamente quem deveria ser preservado para sempre, sem nada falhar " +
        "e sem volta.",
    );
  }
  if (!alcancaNaoMarcado) {
    v.push(
      "RETENCAO_ALCANCA_NINGUEM: a cláusula recusa também quem NÃO tem a retenção marcada. O " +
        "expurgo por prazo deixa de existir em silêncio, e o dado pessoal fica retido para sempre.",
    );
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O SQL DE VERDADE, LIDO DO SERVIÇO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

async function sqlDoExpurgo(): Promise<string> {
  const { sql, quantasConsultas } = await sqlDaVarredura(
    (db) => new RetencaoCandidatosService(db as never),
  );
  expect(
    quantasConsultas,
    "o expurgo tem de ser UMA instrução só: partido em duas, os ids das pessoas a expurgar passam " +
      "a circular pela memória do processo e as escritas deixam de cair juntas",
  ).toBe(1);
  return sql;
}

describe("o expurgo lê a RETENÇÃO, e nos DOIS sentidos", () => {
  it("pessoa COM a retenção marcada NÃO é alcançada, nem com prazo vencido", async () => {
    const clausula = clausulaDaRetencao(await sqlDoExpurgo());
    expect(
      clausula,
      "FALTA CONSTRUIR: a consulta não tem cláusula de topo sobre `banco_talentos` (seção 6 do " +
        "mapa de alcance)",
    ).not.toBe("");
    expect(
      alcanca(clausula, true),
      "candidato de banco NÃO EXPIRA (decisão do diretor). Alcançá-lo é anonimizar, de hora em " +
        "hora e sem volta, justamente quem o banco de talentos existe para guardar",
    ).toBe(false);
  });

  it("pessoa SEM a retenção, com prazo vencido, É alcançada", async () => {
    const clausula = clausulaDaRetencao(await sqlDoExpurgo());
    expect(clausula, "FALTA CONSTRUIR: não há cláusula de topo sobre `banco_talentos`").not.toBe("");
    expect(
      alcanca(clausula, false),
      "a cláusula poupou todo mundo: o expurgo por prazo deixou de existir, e o dado pessoal fica " +
        "retido para sempre sem ninguém perceber",
    ).toBe(true);
  });

  it("a consulta não fala mais do valor de origem que deixou de existir", async () => {
    expect(
      /'banco_talentos'/i.test(await sqlDoExpurgo()),
      "comparar `origem` com um valor que saiu do tipo derruba a varredura inteira com " +
        "`invalid input value for enum`",
    ).toBe(false);
  });

  it("o contrato inteiro está cumprido", async () => {
    expect(violacoesDaRetencao(await sqlDoExpurgo())).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. OS MUTANTES: o contrato acima tem de FICAR VERMELHO com o defeito dentro
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * UMA consulta SABIDAMENTE CORRETA, escrita AQUI e não em produção, só para dar ao contrato um
 * texto que ele tem de aprovar e uma base de onde derivar os defeitos que ele tem de reprovar.
 * Ela NÃO é a implementação esperada: o requisito nomeia a propriedade, não o desenho.
 */
const SQL_REFERENCIA =
  "update as_candidatos c set nome = 'Candidato Expurgado', cpf = null, anonimizado_em = now() " +
  "where c.anonimizado_em is null and c.banco_talentos = false " +
  "and exists (select 1 from as_candidaturas k where k.candidato_id = c.id) " +
  "and c.atualizado_em <= now() - interval '2 years' returning c.id";

function trocar(de: string, para: string): string {
  const i = SQL_REFERENCIA.indexOf(de);
  if (i < 0) throw new Error(`Mutante impossível: "${de}" não está na referência.`);
  return SQL_REFERENCIA.slice(0, i) + para + SQL_REFERENCIA.slice(i + de.length);
}

const MUTANTES: { nome: string; dano: string; sql: string; regra: string }[] = [
  {
    nome: "1. o sinal do booleano é INVERTIDO",
    dano: "o expurgo passa a anonimizar exatamente quem está no banco de talentos, de hora em hora, sem volta.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos = true"),
    regra: "RETENCAO_SENTIDO_INVERTIDO",
  },
  {
    nome: "2. a leitura vira uma referência NUA à coluna",
    dano: "mesma inversão, escrita do jeito que passa despercebido numa revisão de código.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos"),
    regra: "RETENCAO_SENTIDO_INVERTIDO",
  },
  {
    nome: "3. a cláusula da retenção SOME",
    dano: "quem está no banco de talentos volta a expirar em 2 anos, silenciosamente.",
    sql: trocar(" and c.banco_talentos = false", ""),
    regra: "RETENCAO_NAO_LIDA",
  },
  {
    nome: "4. a consulta volta a ler a ORIGEM",
    dano: "a varredura inteira estoura `invalid input value for enum` a cada passada, e ninguém olha o log do cron.",
    sql: trocar("c.banco_talentos = false", "c.origem <> 'BANCO_TALENTOS'"),
    regra: "RETENCAO_NAO_LIDA",
  },
  {
    nome: "5. a comparação é escrita como `<> false`",
    dano: "mesma inversão do mutante 1, escrita de um jeito que a revisão de código lê como se fosse a negação certa.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos <> false"),
    regra: "RETENCAO_SENTIDO_INVERTIDO",
  },
  {
    nome: "6. a cláusula ganha uma ALTERNATIVA sempre verdadeira, entre parênteses",
    dano: "a comparação certa segue no texto e não exclui mais ninguém: todo mundo do banco de talentos volta a ser anonimizável, e a revisão de código lê a linha como se ela protegesse.",
    sql: trocar("c.banco_talentos = false", "(c.banco_talentos = false or 1=1)"),
    regra: "RETENCAO_NAO_RESTRITIVA",
  },
  {
    nome: "7. a cláusula ganha um `or true` SEM parênteses",
    dano: "o `or` liga o `where` INTEIRO, por precedência: o expurgo alcança todo mundo, inclusive quem está em processo vivo e quem não tem prazo vencido. Irreversível.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos = false or true"),
    regra: "RETENCAO_NAO_RESTRITIVA",
  },
];

describe("os mutantes: o contrato pega o defeito, e isso é exercitado, não afirmado", () => {
  it("a referência SABIDAMENTE CORRETA passa sem violação", () => {
    expect(
      violacoesDaRetencao(SQL_REFERENCIA),
      "um contrato que reprova o texto certo é um contrato impossível de cumprir",
    ).toEqual([]);
  });

  it.each(MUTANTES)("$nome fica VERMELHO ($dano)", ({ sql, regra }) => {
    const violacoes = violacoesDaRetencao(sql);
    expect(
      violacoes.join(" | "),
      "o mutante passou pelo contrato: este arquivo não protegeria a linha mais perigosa da frente",
    ).toContain(regra);
  });

  /**
   * O CASO DO MUTANTE 1 DITO PELO AVESSO, porque é ele que justifica o arquivo inteiro: o texto
   * invertido tem de falhar na afirmação de PRESERVAR, e passar na de ALCANÇAR. É assim que se
   * prova que os dois sentidos não são a mesma afirmação escrita duas vezes.
   */
  it("o sinal invertido preserva quem devia ser expurgado e expurga quem devia ser preservado", () => {
    const invertido = clausulaDaRetencao(trocar("c.banco_talentos = false", "c.banco_talentos = true"));
    expect(alcanca(invertido, true)).toBe(true);
    expect(alcanca(invertido, false)).toBe(false);
  });
});
