import { sql } from "drizzle-orm";
import { SITUACOES_VIVAS } from "../../domain/candidatura";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A CORREÇÃO DE LGPD DO EXPURGO (vaga encerrada) ───────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é deliberado e tem motivo
 * registrado: na onda B1 o agente que construiu escolheu, de boa-fé, o mesmo nome de arquivo que o
 * `tester` havia escolhido, e sobrescreveu o teste em silêncio. Nome que ninguém mais escolheria é
 * a trava mais barata contra isso.
 *
 * ┌─ O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É ───────────────────────────────────────────────────┐
 * │ O filtro inteiro do expurgo mora DENTRO de uma consulta em SQL CRU. Um banco fingido que      │
 * │ devolve linhas prontas passa igual com o filtro certo ou errado, então parte da cobertura     │
 * │ desta frente é, por construção, ASSERÇÃO DE FORMA sobre o texto da consulta.                  │
 * │                                                                                              │
 * │ ASSERÇÃO DE FORMA DÁ FALSO POSITIVO, e já deu nesta fábrica: procurar uma palavra no texto    │
 * │ cru passa mesmo com a cláusula removida, porque o COMENTÁRIO que explica a regra usa as       │
 * │ mesmas palavras da regra. As três defesas contra isso vivem aqui:                             │
 * │   1. os comentários são APAGADOS antes de qualquer leitura (só o SQL executável é olhado);    │
 * │   2. a leitura é por CLÁUSULA, não por substring do texto inteiro: o `where` é partido nos    │
 * │      seus pedaços de topo, e cada afirmação é feita sobre O PEDAÇO CERTO (a proteção não      │
 * │      passa porque a palavra apareceu no relógio, e vice-versa);                               │
 * │   3. o contrato é EXERCITADO CONTRA MUTANTES (`MUTANTES`, abaixo), num spec próprio, então    │
 * │      um contrato frouxo demais fica VERMELHO por si, sem depender de alguém desconfiar.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado pessoal entra aqui. O que se lê é o TEXTO de uma consulta, nunca o resultado.
 */

// ── 1. LER A CONSULTA QUE O SERVIÇO MONTOU ──────────────────────────────────

/**
 * Reconstrói o texto da consulta a partir dos pedaços do objeto SQL do drizzle.
 *
 * RECURSIVO de propósito: um `sql.raw(...)` interpolado dentro do template NÃO vira um pedaço de
 * texto, vira outro objeto SQL ANINHADO. Uma leitura rasa devolveria a consulta com um buraco
 * exatamente onde mora a lista de situações, e o teste passaria verde afirmando o contrário do que
 * quer afirmar. É o mesmo helper do `retencao-candidatos.spec.ts`, copiado em vez de importado
 * porque aquele arquivo é um spec e importá-lo registraria os testes dele duas vezes.
 */
export function textoDaConsulta(q: unknown): string {
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no?.queryChunks)) return no.queryChunks.map(textoDaConsulta).join("");
  if (Array.isArray(no?.value)) return no.value.join("");
  return no?.value !== undefined ? String(no.value) : "";
}

/** Só o SQL que o banco executa: linha de comentário (--) fora, espaços colapsados, caixa baixa. */
export function sqlExecutavel(q: unknown): string {
  return textoDaConsulta(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Um serviço com `expurgar()`, que é tudo o que estas funções precisam saber dele. */
export interface ServicoDeExpurgo {
  expurgar(): Promise<number>;
}

/**
 * Roda UMA passada com um banco que só anota a consulta, e devolve o SQL executável.
 *
 * A afirmação de que houve UMA consulta só é parte do contrato: um expurgo partido em "buscar
 * depois atualizar" faria os ids das pessoas a expurgar circularem pela memória do processo, que é
 * exatamente o que o desenho recusa (§A.6).
 */
export async function sqlDaVarredura(
  criar: (db: never) => ServicoDeExpurgo,
): Promise<{ sql: string; quantasConsultas: number }> {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  } as never;

  await criar(db).expurgar();
  return {
    sql: consultas.length === 1 ? sqlExecutavel(consultas[0]) : "",
    quantasConsultas: consultas.length,
  };
}

// ── 2. PARTIR O `where` NAS CLÁUSULAS DE TOPO ───────────────────────────────

/**
 * ─ POR QUE PARTIR, EM VEZ DE PROCURAR NO TEXTO INTEIRO ─────────────────────────────────────────
 *
 * As duas metades da correção falam das MESMAS palavras: a proteção olha situação e vaga, e o
 * relógio olha situação e vaga. Um `expect(sql).toContain("encerrada_em")` fica verde com o relógio
 * certo E a proteção destruída, e fica verde com a proteção certa E o relógio errado. Quem afirma
 * sobre "o pedaço da proteção" e "o pedaço do relógio" separadamente não tem como se enganar assim.
 *
 * A PARTIÇÃO É CONSCIENTE DE PARÊNTESE E DE ASPAS: um ` and ` dentro de subconsulta não parte nada,
 * senão a própria proteção viraria três pedaços e cada afirmação olharia um caco.
 */
export function clausulasDoWhere(sqlTexto: string): string[] {
  const t = sqlTexto.toLowerCase();
  // ─ A LEITURA COMEÇA NO `update as_candidatos`, E NÃO NO PRIMEIRO CARACTERE ────────────────────
  //
  // A CONSULTA DEIXOU DE COMEÇAR PELO `update`. Desde a fundação da plataforma unificadora o
  // expurgo é UMA instrução só com CTE que modifica dado (`with alvo as (update ... returning id),
  // ... select count(*) from alvo`), porque três escritas separadas deixariam o candidato carimbado
  // como anonimizado com o identificador externo dele intacto, e a varredura nunca mais voltaria
  // naquela linha (§A.6).
  //
  // O EFEITO SOBRE ESTE PARSER É MECÂNICO E TOTAL: o `where` da régua passou a viver DENTRO de um
  // parêntese, então a busca por profundidade zero não o achava mais e TODAS as afirmações deste
  // contrato viravam "PROTECAO_AUSENTE". Ancorar no `update as_candidatos` devolve o mesmo
  // referencial de antes (a partir dali, o `where` da régua está de novo em profundidade zero) sem
  // afrouxar UMA linha do contrato: continua-se lendo a cláusula de topo DAQUELE update, e não uma
  // cláusula qualquer que apareça pelo caminho.
  const base = t.indexOf("update as_candidatos");
  const daRegua = base >= 0 ? t.slice(base) : t;
  const inicio = indiceDoWhereDeTopo(daRegua);
  if (inicio < 0) return [];
  const corpo = daRegua.slice(inicio + " where ".length);

  const pedacos: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;

  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i];
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (profundidade === 0 && corpo.startsWith(" and ", i)) {
        pedacos.push(atual.trim());
        atual = "";
        i += " and ".length - 1;
        continue;
      }
      // `returning` fecha o `where`: o que vem depois não é cláusula de filtro.
      if (profundidade === 0 && corpo.startsWith(" returning ", i)) break;
    }
    atual += c;
  }
  if (atual.trim()) pedacos.push(atual.trim());
  return pedacos;
}

/** O primeiro ` where ` que está FORA de qualquer parêntese: o da consulta, não o das subconsultas. */
function indiceDoWhereDeTopo(t: string): number {
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (profundidade === 0 && t.startsWith(" where ", i)) return i;
  }
  return -1;
}

/** A cláusula da PROTEÇÃO: o `not exists` que decide quem nunca é alcançado pelo expurgo. */
export function clausulaDaProtecao(sqlTexto: string): string {
  return clausulasDoWhere(sqlTexto).find((c) => c.startsWith("not exists")) ?? "";
}

/**
 * A cláusula do RELÓGIO: a que compara uma data com o prazo de retenção.
 *
 * Procurada pelo `interval`, e não pela posição, porque a ordem das cláusulas é escolha de quem
 * escreve e não é o que o requisito manda.
 */
export function clausulaDoRelogio(sqlTexto: string): string {
  return clausulasDoWhere(sqlTexto).find((c) => c.includes("interval '")) ?? "";
}

/**
 * ─ A CLÁUSULA DA RETENÇÃO, E POR QUE ELA PASSOU A SER LIDA POR SENTIDO ─────────────────────────
 *
 * A REGRA NÃO MUDOU (candidato de banco NÃO EXPIRA, decisão do diretor); MUDOU ONDE ELA MORA. Até a
 * migration 0112 a retenção era o valor `BANCO_TALENTOS` do enum de ORIGEM, e o contrato cobrava o
 * texto `c.origem <> 'banco_talentos'`. Hoje ela é `as_candidatos.banco_talentos`, coluna própria,
 * e cobrar o texto velho faria este acusador apontar uma REGRESSÃO QUE NÃO EXISTE, que é o pior
 * defeito possível num contrato: o time aprende a ignorar justamente o que protege a linha mais
 * perigosa do arquivo.
 *
 * E A COBRANÇA NÃO PODE VOLTAR A SER "o nome da coluna aparece no texto", porque as três maneiras
 * de errar a troca CITAM a coluna e nenhuma delas falha sozinha: `and c.banco_talentos` (sinal
 * invertido) anonimiza exatamente os protegidos; `is not null` é sempre verdadeiro numa coluna NOT
 * NULL; e a cláusula ausente tem o mesmo efeito da anterior. O que se lê aqui é o SENTIDO.
 */
function semLiterais(clausula: string): string {
  return clausula.replace(/'[^']*'/g, " ");
}

export function clausulaDaRetencao(sqlTexto: string): string {
  return clausulasDoWhere(sqlTexto).find((c) => /\bbanco_talentos\b/.test(semLiterais(c))) ?? "";
}

/** "A pessoa NÃO está marcada", em qualquer das formas que o Postgres aceita para isso. */
function exigeRetencaoDesmarcada(clausula: string): boolean {
  const c = semLiterais(clausula);
  return (
    /\b[a-z_]*\.?banco_talentos\s*(=|is)\s*false/.test(c) ||
    /\bnot\s+[a-z_]*\.?banco_talentos\b/.test(c) ||
    /\b[a-z_]*\.?banco_talentos\s+is\s+not\s+true/.test(c)
  );
}

/** "A pessoa ESTÁ marcada", que nesta cláusula é o sinal invertido: apaga só quem é protegido. */
function exigeRetencaoMarcada(clausula: string): boolean {
  const c = semLiterais(clausula);
  if (/\b[a-z_]*\.?banco_talentos\s*(=|is)\s*true/.test(c)) return true;
  if (/\bbanco_talentos\s+is\s+not\s+null/.test(c)) return true;
  const semNegacao = c.replace(/not\s+[a-z_]*\.?banco_talentos\b/g, " ");
  return /\b[a-z_]*\.?banco_talentos\b(?!\s*(=|is))/.test(semNegacao);
}

/**
 * ─ A CLÁUSULA TEM DE SER RESTRITIVA, E ISSO NÃO SE MEDE OLHANDO A COMPARAÇÃO ───────────────────
 *
 * As duas funções acima leem o SENTIDO da comparação, e param aí. Enquanto era só isso, estas duas
 * cláusulas passavam VERDES e desligavam a proteção inteira, cada uma de um jeito:
 *
 *   `and (c.banco_talentos = false or 1=1)`  a alternativa é sempre verdadeira, então a cláusula
 *                                            deixa de excluir alguém: todo protegido volta a ser
 *                                            alcançável, e a comparação certa continua no texto,
 *                                            visível na revisão de código, dizendo o contrário.
 *
 *   `and c.banco_talentos = false or true`   PIOR: o `or` tem precedência MENOR que o `and`, então
 *                                            ele não liga só esta cláusula, liga o `where` INTEIRO.
 *                                            O expurgo passa a alcançar TODO MUNDO, inclusive quem
 *                                            está em processo vivo e quem nem prazo tem, e a
 *                                            anonimização é irreversível.
 *
 * ┌─ A RÉGUA É SOBRE A CLÁUSULA DA RETENÇÃO, E NUNCA SOBRE O `where` INTEIRO ───────────────────┐
 * │ Um `or` legítimo pode existir DENTRO de um parêntese de outra cláusula do mesmo `where` (uma │
 * │ subconsulta que aceita duas situações, por exemplo), e reprovar isso mediria desenho. Por    │
 * │ isso a leitura é por PROFUNDIDADE: só o `or` que está em profundidade ZERO da cláusula da    │
 * │ retenção é alternativa DELA; tudo o que está dentro de parêntese é assunto de outra pessoa.  │
 * │                                                                                             │
 * │ O EMBRULHO REDUNDANTE É DESFEITO ANTES, e sem isso a régua não pegaria o primeiro mutante:   │
 * │ `(c.banco_talentos = false or 1=1)` é uma cláusula inteira entre parênteses, e o `or` dela   │
 * │ está em profundidade 1 por acidente de escrita, não por estar aninhado em outra condição.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function semEmbrulhoRedundante(clausula: string): string {
  let c = clausula.trim();
  // Só desembrulha quando o primeiro `(` é o par do ÚLTIMO `)`: `(a) or (b)` não é um embrulho.
  for (;;) {
    if (!c.startsWith("(") || !c.endsWith(")")) return c;
    let profundidade = 0;
    let emAspas = false;
    let fechouAntes = false;
    for (let i = 0; i < c.length - 1; i += 1) {
      const ch = c[i];
      if (ch === "'") emAspas = !emAspas;
      if (emAspas) continue;
      if (ch === "(") profundidade += 1;
      if (ch === ")") profundidade -= 1;
      if (profundidade === 0 && i > 0) {
        fechouAntes = true;
        break;
      }
    }
    if (fechouAntes) return c;
    c = c.slice(1, -1).trim();
  }
}

/** O texto da cláusula com todo conteúdo entre parênteses (e todo literal) trocado por espaço. */
function soOTopo(clausula: string): string {
  const c = semLiterais(semEmbrulhoRedundante(clausula));
  let profundidade = 0;
  let topo = "";
  for (const ch of c) {
    if (ch === "(") {
      profundidade += 1;
      topo += " ";
      continue;
    }
    if (ch === ")") {
      profundidade = Math.max(0, profundidade - 1);
      topo += " ";
      continue;
    }
    topo += profundidade === 0 ? ch : " ";
  }
  return topo;
}

/** "A cláusula tem uma ALTERNATIVA de topo", que é o que a torna não restritiva. */
export function temAlternativaDeTopo(clausula: string): boolean {
  return /\bor\b/.test(soOTopo(clausula));
}

/** A cláusula que exige AO MENOS UM processo encerrado (o `exists` simples). */
export function clausulaDoExistePlano(sqlTexto: string): string {
  return (
    clausulasDoWhere(sqlTexto).find((c) => c.startsWith("exists") && !c.includes("interval '")) ?? ""
  );
}

// ── 3. O CONTRATO ───────────────────────────────────────────────────────────

/** A lista de situações vivas, no formato em que ela aparece no SQL, DERIVADA do vocabulário. */
export const LISTA_DAS_VIVAS = SITUACOES_VIVAS.map((s) => `'${s.toLowerCase()}'`).join(", ");

/** Uma condição de "a vaga NÃO terminou", em qualquer das formas que o Postgres aceita. */
function exigeVagaNaoEncerrada(clausula: string): boolean {
  return (
    /encerra\s*(=|is)\s*false/.test(clausula) ||
    /not\s+[a-z_]*\.?encerra\b/.test(clausula) ||
    /encerra\s+is\s+not\s+true/.test(clausula)
  );
}

/**
 * Uma condição de "a vaga TERMINOU", que na PROTEÇÃO é o defeito que apaga gente em processo.
 *
 * O `not <alias>.encerra` É APAGADO ANTES DA LEITURA DO CASO NU, e essa linha nasceu de um vermelho
 * real deste arquivo: sem ela, a forma NEGADA (`not s.encerra`, que é a régua CERTA escrita de outro
 * jeito) era lida como se exigisse vaga encerrada, e o contrato reprovava uma consulta correta. Um
 * teste que morre com estilo mede desenho, e não a propriedade que o diretor pediu.
 */
function exigeVagaEncerrada(clausula: string): boolean {
  if (/encerra\s*(=|is)\s*true/.test(clausula)) return true;
  const semNegacao = clausula.replace(/not\s+[a-z_]*\.?encerra\b/g, " ");
  return /\b[a-z_]*\.?encerra\b(?!\s*(=|is))/.test(semNegacao);
}

/**
 * A LEITURA DO FATO DA ADMISSÃO ESTÁ FORA DA SUBTRAÇÃO DO PAPEL?
 *
 * MEDIDO PELO ANINHAMENTO, e não por ordem de palavras: procura-se um `or` de profundidade tal que
 * `admissao_id is not null` esteja de um lado e a exclusão do papel do outro. É o que distingue
 * "protege sempre, ou então vale a régua da vaga" de "protege só se a vaga não for da fila".
 */
function admissaoProtegeForaDoPapel(clausula: string): boolean {
  for (const grupo of gruposParentizados(clausula)) {
    const ramos = partirPorOr(grupo);
    if (ramos.length < 2) continue;
    const temORamoDoFato = ramos.some((r) => /^[a-z_]*\.?admissao_id\s+is\s+not\s+null$/.test(r.trim()));
    const temORamoDoPapel = ramos.some((r) => excluiAFilaDeRevisao(r));
    if (temORamoDoFato && temORamoDoPapel) return true;
  }
  return false;
}

/** Todo trecho entre parênteses do texto, do mais externo ao mais interno. */
function gruposParentizados(t: string): string[] {
  const grupos: string[] = [];
  const pilha: number[] = [];
  let emAspas = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") pilha.push(i);
    if (c === ")" && pilha.length > 0) grupos.push(t.slice((pilha.pop() as number) + 1, i));
  }
  return grupos;
}

/** Parte por `or` de PROFUNDIDADE ZERO, respeitando parênteses e aspas. */
function partirPorOr(t: string): string[] {
  const partes: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (profundidade === 0 && t.startsWith(" or ", i)) {
        partes.push(atual.trim());
        atual = "";
        i += 3;
        continue;
      }
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

/**
 * A FILA DE REVISÃO ESTÁ EXCLUÍDA DA PROTEÇÃO?
 *
 * TRÊS FORMAS, UMA PROPRIEDADE. `is distinct from 'REVISAO'` (a de produção, e a mais segura,
 * porque `<>` com NULL devolve NULL e NULL aqui DERRUBA a linha do `not exists`, isto é, tira a
 * proteção), `<>`/`!=` e `not in (...)`. Medir só a primeira seria medir o DESENHO de hoje, e um
 * contrato que morre de estilo ensina o time a ignorar o vermelho.
 */
/**
 * OS PAPÉIS QUE A PROTEÇÃO EXCLUI, lidos em qualquer das três formas de negar.
 *
 * Existe para a regra `PROTECAO_ESTREITA_ALEM_DE_REVISAO`: a subtração autorizada pelo diretor é de
 * UM papel, e de mais nenhum. Qualquer outro nome aqui é gente perdendo proteção sem decisão.
 */
function papeisExcluidos(clausula: string): string[] {
  const simples = [...clausula.matchAll(/papel\s+(?:is\s+distinct\s+from|<>|!=)\s*'([a-z_]+)'/g)].map(
    (m) => m[1],
  );
  const listas = [...clausula.matchAll(/papel\s+not\s+in\s*\(([^)]*)\)/g)].flatMap((m) =>
    [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]),
  );
  return [...new Set([...simples, ...listas])];
}

/** As listas POSITIVAS de papel, que são a forma perigosa: elas trocam exceção por whitelist. */
function listasPositivasDePapel(clausula: string): string[][] {
  return [...clausula.matchAll(/papel\s+in\s*\(([^)]*)\)/g)].map((m) =>
    [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]),
  );
}

function excluiAFilaDeRevisao(clausula: string): boolean {
  return (
    /papel\s+is\s+distinct\s+from\s+'revisao'/.test(clausula) ||
    /papel\s*(<>|!=)\s*'revisao'/.test(clausula) ||
    /papel\s+not\s+in\s*\([^)]*'revisao'/.test(clausula)
  );
}

/**
 * ─ O CONTRATO DA CORREÇÃO, EM REGRAS NOMEADAS ──────────────────────────────────────────────────
 *
 * Devolve a lista das VIOLAÇÕES. Vazia é o contrato cumprido. Cada regra é nomeada para o vermelho
 * dizer QUAL propriedade caiu, e não só "o SQL mudou".
 *
 * O QUE CADA REGRA PROTEGE está dito na string dela, porque é ela que o autor vai ler quando o
 * teste ficar vermelho, e não este comentário.
 */
export function violacoesDoContrato(sqlTexto: string): string[] {
  const v: string[] = [];
  const t = sqlTexto.toLowerCase();
  const protecao = clausulaDaProtecao(t);
  const relogio = clausulaDoRelogio(t);

  // ── A PROTEÇÃO ────────────────────────────────────────────────────────────
  if (!protecao) {
    v.push("PROTECAO_AUSENTE: não há cláusula `not exists` de topo. Sem ela o expurgo alcança quem está em processo.");
    return v;
  }
  if (!protecao.includes("as_vaga_status")) {
    v.push(
      "PROTECAO_SEM_CATALOGO: a proteção não faz join com `as_vaga_status`. Sem o catálogo não há como saber se a vaga ENCERROU, e a régua volta a ser a antiga.",
    );
  }
  if (!/\bencerra\b/.test(protecao)) {
    v.push(
      "PROTECAO_SEM_FLAG_ENCERRA: a proteção não lê o flag `encerra`. Quem fica vivo em vaga encerrada nunca começa a contar prazo, e o dado pessoal fica retido para sempre.",
    );
  }
  if (protecao.includes("recebe_candidato")) {
    v.push(
      "PROTECAO_LE_RECEBE_CANDIDATO: a proteção lê `recebe_candidato`, que é OUTRA pergunta. Status LIVRE do tipo Stand By tem `recebe_candidato = false` e `encerra = false`: vaga PAUSADA não é vaga TERMINADA, e ler o flag errado torna expurgável todo mundo numa vaga pausada.",
    );
  }
  if (!exigeVagaNaoEncerrada(protecao) || exigeVagaEncerrada(protecao)) {
    v.push(
      "PROTECAO_OLHA_A_VAGA_ERRADA: a proteção tem de exigir vaga NÃO encerrada. Exigindo vaga encerrada (ou não exigindo nada), quem está APROVADO numa vaga cancelada e ATIVO numa vaga aberta deixa de ser protegido, e o expurgo apaga alguém EM PROCESSO.",
    );
  }
  if (!/candidato_id\s*=\s*c\.id/.test(protecao)) {
    v.push(
      "PROTECAO_SEM_CORRELACAO: a proteção não se correlaciona com o candidato da linha (`k.candidato_id = c.id`). O alcance da proteção é a PESSOA, entre vagas, e nunca uma vaga só.",
    );
  }
  if (/\blimit\b/.test(protecao) || /\border\s+by\b/.test(protecao)) {
    v.push(
      "PROTECAO_OLHA_UMA_CANDIDATURA_SO: a proteção ordena ou limita. Ela tem de olhar TODAS as candidaturas da pessoa; olhando só a última, quem tem processo vivo em outra vaga é apagado.",
    );
  }
  /*
   * ─ A FILA DE REVISÃO DEIXOU DE PROTEGER (decisão do diretor) ─────────────────────────────────
   *
   * O QUE ESTA REGRA COBRA, e por que ela é uma regra e não um detalhe de escrita: o papel REVISAO
   * é a fila da vaga ESPELHADA do Pandapé, criada pela varredura sem cliente e sem posições. Ela
   * nasce com `encerra = false` e sem `encerrada_em`, então satisfaz DUAS das três pernas da
   * condição da proteção e abriga do expurgo, por tempo INDEFINIDO, todo mundo que a ingestão
   * pendurou nela. É a vaga que menos gente revisa, e enquanto ninguém a revisa o relógio não anda.
   *
   * A DIREÇÃO É INCOMUM NESTE ARQUIVO, e vale dizer em voz alta: todas as outras regras daqui
   * cobram MAIS proteção, porque o erro caro é apagar quem não devia. Esta cobra MENOS, porque o
   * erro que ela fecha é o oposto e igualmente proibido pela §A.6, reter dado pessoal para sempre.
   * Ela é, por construção, a única regra deste contrato que um "corrigi para o lado seguro" quebra.
   *
   * A LEITURA É PELO PAPEL, e aceita as três formas de dizer a mesma coisa (`is distinct from`,
   * `<>`/`!=` e `not in`), porque o requisito nomeia a PROPRIEDADE e não o desenho. O que ela NÃO
   * aceita é o código do status (`pendente_revisao`): ele é renomeável pelo diretor na tela, e no
   * dia do renome a exclusão pararia de valer sem nada falhar. Por isso o código é acusado à parte.
   */
  if (!excluiAFilaDeRevisao(protecao)) {
    v.push(
      "PROTECAO_ABRIGA_A_FILA_DE_REVISAO: a proteção não exclui o papel REVISAO. A vaga espelhada do Pandapé nasce na fila sem cliente, com `encerra = false` e sem `encerrada_em`, então ela protege do expurgo todo mundo pendurado nela enquanto ninguém a revisar, que é retenção INDEFINIDA de dado pessoal em massa (§A.6). O diretor decidiu que a fila de revisão NÃO protege mais.",
    );
  }
  /*
   * ─ A SUBTRAÇÃO É DE UM PAPEL SÓ, E O RESTO CONTINUA PROTEGIDO (achado do `seguranca`) ─────────
   *
   * A CLÁUSULA DE HOJE É UMA PROPRIEDADE (`encerra = false`), e ela protege TODO papel que não
   * encerra: RASCUNHO, ABERTURA, ENTREGA, REVISAO e TODA linha LIVRE que o diretor criar pela tela
   * (o "Stand By" é o exemplo canônico). O diretor autorizou tirar UM papel dessa proteção. Tirar
   * qualquer outro é gente perdendo proteção sem decisão de ninguém.
   *
   * O QUE ESTA REGRA PEGA, E O CONTRATO ANTIGO NÃO PEGAVA: a forma mais natural de implementar a
   * subtração errado é trocar a propriedade por uma LISTA POSITIVA, `s.papel in ('ABERTURA',
   * 'ENTREGA')`. Ela tira o REVISAO, sim, e leva junto o RASCUNHO e todo status LIVRE, sem uma
   * linha vermelha: a regra `PROTECAO_SEM_FLAG_ENCERRA` só exige que a palavra `encerra` APAREÇA,
   * e a lista positiva pode conviver com ela no mesmo texto.
   *
   * A LEITURA É TEXTUAL, E O LIMITE DISSO ESTÁ DITO: ela pega as formas enumeradas (negação de
   * papel diferente de REVISAO, e whitelist positiva que não inclui RASCUNHO e LIVRE). A exceção
   * legítima de quem ENTREGOU é uma igualdade (`papel = 'FECHAMENTO'`) dentro de um `or`, e não uma
   * whitelist, então ela não cai aqui; escrita como `papel in ('fechamento')`, também não, porque a
   * lista só de FECHAMENTO é reconhecida como aquela exceção.
   */
  const excluidos = papeisExcluidos(protecao).filter((x) => x !== "revisao");
  if (excluidos.length > 0) {
    v.push(
      `PROTECAO_ESTREITA_ALEM_DE_REVISAO: a proteção deixou de alcançar o(s) papel(éis) ${excluidos.join(", ")}. O diretor autorizou tirar UM papel da proteção, o REVISAO. Todo papel que não encerra (RASCUNHO, ABERTURA, ENTREGA e toda linha LIVRE que o diretor criar pela tela, do tipo Stand By) continua protegendo, e tirar outro é anonimizar gente em processo sem decisão de ninguém.`,
    );
  }
  for (const lista of listasPositivasDePapel(protecao)) {
    const ehAExcecaoDaEntrega = lista.length === 1 && lista[0] === "fechamento";
    if (!ehAExcecaoDaEntrega && (!lista.includes("rascunho") || !lista.includes("livre"))) {
      v.push(
        `PROTECAO_ESTREITA_ALEM_DE_REVISAO: a proteção passou a listar papéis (${lista.join(", ")}) em vez de ler a PROPRIEDADE. Lista positiva não é subtração: ela derruba tudo o que não foi lembrado, e o que não foi lembrado aqui é o RASCUNHO (que RECEBE candidato) e todo status LIVRE que o diretor criar pela tela. A régua é \`encerra = false\` MENOS o papel REVISAO, e nunca uma whitelist.`,
      );
    }
  }
  if (/'pendente_revisao'/.test(protecao)) {
    v.push(
      "PROTECAO_EXCLUI_A_REVISAO_POR_CODIGO: a exclusão da fila de revisão foi escrita com o CÓDIGO do status, e não com o PAPEL. O código é do catálogo e o diretor o renomeia pela tela; o papel é de sistema e tem índice único parcial. No dia do renome a fila volta a proteger, em silêncio.",
    );
  }
  /*
   * ─ QUEM JÁ FOI PARA A ADMISSÃO PROTEGE PELO FATO (achado do `seguranca`) ─────────────────────
   *
   * O CAMINHO DE DANO É FEITO SÓ DE CÓDIGO QUE JÁ EXISTE: a vaga espelhada nasce em REVISAO, é
   * liberada para ABERTURA, a pessoa é aprovada e ENVIADA PARA ADMISSÃO (situação viva, com
   * `admissao_id` gravado), e um Master devolve a vaga para a fila (`devolverParaFila`, que NÃO
   * confere candidatura viva dentro da vaga). Nesse instante a pessoa perde a proteção e é
   * anonimizada do lado de A&S ENQUANTO O CPF DELA SEGUE NA ADMISSÃO, que não tem retenção geral.
   *
   * O PROXY NÃO COBRE ISSO: a régua do carimbo deduz "foi contratado" de "a vaga fechou com papel
   * FECHAMENTO e entregou", e a vaga devolvida para a fila não fechou nada. O fato direto existe na
   * coluna e não estava sendo lido.
   *
   * A SEGUNDA AFIRMAÇÃO É A QUE IMPORTA, e ela é a que um "corrigi juntando tudo num and" quebra:
   * a leitura do fato tem de estar FORA do `and` que tira o papel REVISAO. Dentro dele, a devolução
   * para a fila desliga justamente a proteção que esta regra existe para dar, e o texto continua
   * citando `admissao_id`, o que é pior do que não citar.
   */
  if (!/admissao_id\s+is\s+not\s+null/.test(protecao)) {
    v.push(
      "PROTECAO_NAO_LE_A_ADMISSAO: a proteção não lê `k.admissao_id is not null`. Quem foi ENVIADO PARA ADMISSÃO está protegido hoje por PROXY (a vaga fechou e entregou), e o proxy não cobre a vaga DEVOLVIDA para a fila de revisão: ali a pessoa é anonimizada do lado de A&S enquanto o CPF dela segue inteiro na Admissão, que não tem retenção geral. Minimização zero, e irreversível.",
    );
  } else if (!admissaoProtegeForaDoPapel(protecao)) {
    v.push(
      "PROTECAO_LE_A_ADMISSAO_DENTRO_DA_SUBTRACAO: a consulta cita `admissao_id`, mas a leitura está SUBORDINADA à exclusão do papel REVISAO. Assim, a vaga devolvida para a fila desliga a proteção de quem já foi para a admissão, que é exatamente o caminho de dano que essa leitura existe para fechar, e o texto passa a AFIRMAR o contrário do que faz.",
    );
  }
  if (!protecao.includes(LISTA_DAS_VIVAS)) {
    v.push(
      `PROTECAO_SEM_LISTA_DERIVADA: a proteção não usa a lista derivada de SITUACOES_VIVAS (${LISTA_DAS_VIVAS}). Lista digitada à mão concorda com o vocabulário por coincidência, e para de concordar no dia em que uma situação nova nascer.`,
    );
  }

  // ── O RELÓGIO ─────────────────────────────────────────────────────────────
  if (!relogio) {
    v.push("RELOGIO_AUSENTE: não há cláusula com `interval`. Sem prazo, o expurgo é imediato.");
    return v;
  }
  if (!relogio.includes("encerrada_em")) {
    v.push(
      "RELOGIO_SEM_ENCERRAMENTO_DA_VAGA: o relógio não lê `vagas.encerrada_em`. Quem foi aprovado em 03/2024 numa vaga cancelada HOJE fica elegível NA HORA, retroativamente, e a varredura de 1h o anonimiza sem nenhuma carência. É irreversível.",
    );
  }
  if (relogio.includes("data_fechamento")) {
    v.push(
      "RELOGIO_LE_DATA_FECHAMENTO: o relógio lê `data_fechamento`, que vem do CORPO da requisição, é `@IsISO8601()` sem piso e pode ser anterior ao clique. Um COMUM cancelando com data de 2019 vira gatilho remoto de exclusão.",
    );
  }
  if (!relogio.includes("atualizado_em")) {
    v.push(
      "RELOGIO_SEM_SAIDA_SEM_EXITO: o relógio não lê `k.atualizado_em`. Quem foi DESCARTADO continua contando prazo do próprio descarte; trocar isso pelo encerramento da vaga muda o prazo de todo mundo que já saiu.",
    );
  }
  /*
   * ─ O PISO DA FILA DE REVISÃO (achado do `seguranca`) ─────────────────────────────────────────
   *
   * SEM ELE, A SUBTRAÇÃO DO PAPEL APRESSA UM EXPURGO IRREVERSÍVEL. Para a candidatura viva numa
   * vaga em REVISAO, `v.encerrada_em` é nulo e o relógio cai em `k.atualizado_em`. Para quem NASCEU
   * na fila isso está certo (é a data da ingestão). Para quem VOLTOU para a fila, não: enquanto a
   * vaga esteve aberta a proteção era incondicional e ninguém precisava tocar a linha, então
   * `k.atualizado_em` pode ter ANOS. No instante da devolução essa pessoa nasce com o prazo JÁ
   * VENCIDO e é anonimizada na varredura da hora seguinte, sem carência nenhuma.
   *
   * A FORMA É A MESMA QUE O ARQUIVO JÁ USOU PARA O ENCERRAMENTO: piso lido de um carimbo de
   * SERVIDOR (`as_vaga_status_eventos.em`), DENTRO do `greatest`, com queda para `k.atualizado_em`.
   * Dentro do `greatest` ele só empurra a data para frente; como argumento do `coalesce` de fora,
   * um nulo dele mudaria a queda inteira e o erro cairia para o lado de APAGAR.
   */
  if (!/as_vaga_status_eventos/.test(relogio)) {
    v.push(
      "RELOGIO_SEM_PISO_DA_FILA_DE_REVISAO: o relógio não lê a trilha de status (`as_vaga_status_eventos`). Quem VOLTA para a fila de revisão tem `k.atualizado_em` de anos atrás (enquanto a vaga esteve aberta, a proteção era incondicional e ninguém tocava a linha), então, no instante da devolução, a pessoa perde a proteção JÁ com o prazo vencido e é anonimizada na varredura seguinte, sem carência. É irreversível, e é o mesmo modo de falha que `vagas.encerrada_em` já resolveu para o encerramento.",
    );
  } else if (!/greatest\s*\([^;]*as_vaga_status_eventos/.test(relogio)) {
    v.push(
      "PISO_FORA_DO_GREATEST: o piso da fila de revisão não está dentro do `greatest`. Fora dele, um nulo do piso (vaga que não é da fila, ou vaga da fila sem evento, que é o caso de quem NASCEU nela) muda a queda inteira, e o erro passa a cair para o lado de APAGAR. Dentro do `greatest`, o piso só empurra a data para frente.",
    );
  }
  /*
   * O AGREGADO MEDIDO É O QUE EMBRULHA O `greatest`, e não "existe um `max` no texto": desde o piso
   * da fila de revisão, o relógio tem um `max(e.em)` LÁ DENTRO, na subconsulta da trilha. Procurar
   * a palavra solta deixaria o mutante `min(greatest(...))` passar batido, com o `max` do piso
   * respondendo pelo `max` que sumiu de fora.
   */
  const agregado = /\b(max|min)\s*\(\s*greatest\s*\(/.exec(relogio);
  const temMax = agregado ? agregado[1] === "max" : /\bmax\s*\(/.test(relogio);
  if (!temMax || /\bmin\s*\(/.test(relogio)) {
    v.push(
      "RELOGIO_SEM_MAX: o relógio tem de correr do encerramento MAIS RECENTE. Com `min`, quem foi visto pelo time no mês passado é apagado por causa de um processo de três anos atrás.",
    );
  }

  // ── O RESTO DA REGRA, QUE A CORREÇÃO NÃO PODE ATROPELAR ───────────────────
  const retencao = clausulaDaRetencao(t);
  if (!retencao) {
    v.push(
      "RETENCAO_NAO_LIDA: nenhuma cláusula de topo lê `banco_talentos`. Candidato de banco NÃO EXPIRA (decisão do diretor), e sem esta cláusula a proteção some inteira, em silêncio: o expurgo anonimiza quem o banco de talentos existe para guardar.",
    );
  } else {
    if (exigeRetencaoMarcada(retencao) || !exigeRetencaoDesmarcada(retencao)) {
      v.push(
        "RETENCAO_SENTIDO_INVERTIDO: a cláusula tem de alcançar quem NÃO está marcado (`c.banco_talentos = false`). Escrita pela presença, ela anonimiza EXATAMENTE E SOMENTE os protegidos, sem nada falhar e sem volta, e um teste de \"o expurgo funciona\" fica verde porque alguém foi expurgado.",
      );
    }
    if (temAlternativaDeTopo(retencao)) {
      v.push(
        "RETENCAO_NAO_RESTRITIVA: a cláusula da retenção tem um `or` de topo, então ela deixou de EXCLUIR alguém. Com `or 1=1` a proteção some com a comparação certa ainda escrita no texto; sem parênteses (`= false or true`), o `or` tem precedência menor que o `and` e liga o `where` INTEIRO, e aí o expurgo alcança todo mundo, inclusive quem está em processo vivo. Anonimizar quem devia ser preservado é irreversível.",
      );
    }
  }
  if (/'banco_talentos'/i.test(t)) {
    v.push(
      "RETENCAO_LE_A_ORIGEM_MORTA: a consulta compara `origem` com um valor que saiu do tipo na migration 0112. Isso derruba a varredura inteira com `invalid input value for enum`, e o expurgo para de rodar sem ninguém notar.",
    );
  }
  /*
   * ─ O PRAZO ENCOLHEU DE 2 ANOS PARA 6 MESES (decisão do diretor) ──────────────────────────────
   *
   * AS DUAS AFIRMAÇÕES SÃO NECESSÁRIAS, e a segunda é a que mata a mutação: só exigir "6 months"
   * deixa passar um texto que tenha OS DOIS intervalos (uma correção pela metade, ou uma segunda
   * cláusula de prazo esquecida num `or`), e nesse texto a régua efetiva pode ser a antiga. Recusar
   * o "2 years" explicitamente é o que faz o contrato ficar VERMELHO no dia em que alguém reverter
   * a decisão do diretor, que é justamente o cenário que este arquivo existe para pegar.
   */
  if (!t.includes("interval '6 months'")) {
    v.push("REGRESSAO_PRAZO: o prazo do diretor é de 6 MESES (`interval '6 months'`). Ele era de 2 anos e ENCOLHEU por decisão do diretor: alongá-lo de volta retém dado pessoal além do necessário (§A.6), e encurtá-lo mais torna elegível, na varredura da hora seguinte, gente que o time viu no mês passado. Nos dois sentidos o erro é caro, e a anonimização é irreversível.");
  }
  if (t.includes("interval '2 years'")) {
    v.push("PRAZO_ANTIGO_DE_VOLTA: a consulta ainda cita `interval '2 years'`, o prazo REVOGADO pelo diretor. Enquanto ele estiver no texto, o dado pessoal de quem parou há 6 meses continua retido por mais um ano e meio, e uma reversão parcial (os dois intervalos no mesmo `where`) não falha nada.");
  }
  /*
   * ─ A REGRA `REGRESSAO_SEM_PROCESSO_NAO_CONTA` FOI REVOGADA, E ELA ERA O DEFEITO ───────────────
   *
   * ELA COBRAVA, AQUI, a cláusula `exists (select 1 from as_candidaturas k where k.candidato_id =
   * c.id)`, escrita quando a régua era "sem processo encerrado não há prazo a contar". A régua
   * MUDOU por decisão registrada em `docs/MAPA-ALCANCE-FUNDACAO-PROD-E-2-FUROS.md` (FURO 1): aquela
   * cláusula é exatamente o que faz quem entra sem casar com vaga nenhuma NUNCA ter prazo, e o dado
   * pessoal dessa pessoa ficar retido para sempre, que é o que a LGPD proíbe.
   *
   * MANTÊ-LA SERIA UM CONTRATO QUE COBRA O FURO: ele acusaria como REGRESSÃO justamente a correção,
   * e o pior defeito possível num acusador é apontar regressão que não existe, porque o time aprende
   * a ignorar o vermelho que protege a linha mais perigosa do arquivo. O `tester` declarou esta
   * colisão em `retencao-sem-candidatura.tester-fake.ts` (`HERDADAS_REVOGADAS`) e, corretamente, NÃO
   * a apagou: quem implementa é que apaga. É o que esta remoção é.
   *
   * O QUE PASSA A COBRAR A POPULAÇÃO SEM CANDIDATURA é `violacoesDaRetencaoSemCandidatura`, no
   * arquivo vizinho, que herda este contrato inteiro e acrescenta a queda do relógio. Nada do que
   * este contrato protege foi afrouxado: a proteção da vaga não encerrada, o sentido da cláusula de
   * banco, a lista derivada das vivas, o prazo e o `max` continuam aqui.
   */
  return v;
}

// ── 4. A REFERÊNCIA E OS MUTANTES ───────────────────────────────────────────

/**
 * UMA implementação que cumpre o requisito, escrita AQUI e não em produção.
 *
 * ELA NÃO É A IMPLEMENTAÇÃO ESPERADA, e este ponto é importante: o requisito nomeia a propriedade,
 * não o desenho, e quem constrói pode escrever outra consulta que cumpra tudo. Esta existe por um
 * motivo só: dar ao contrato acima um texto SABIDAMENTE CORRETO para ele aprovar, e uma base de
 * onde derivar os mutantes que ele tem de reprovar. Sem isso, "meu teste pega o defeito?" seria
 * opinião.
 */
export const SQL_REFERENCIA = sqlExecutavel(sql`
  update as_candidatos c
     set nome = 'Candidato Expurgado',
         cpf = null,
         email = null,
         telefone = null,
         data_nascimento = null,
         anonimizado_em = now(),
         atualizado_em = now()
   where c.anonimizado_em is null
     and c.banco_talentos = false
     and not exists (
           select 1
             from as_candidaturas k
             join vagas v on v.id = k.vaga_id
             join as_vaga_status s on s.codigo = v.status
            where k.candidato_id = c.id
              and k.situacao in (${sql.raw(SITUACOES_VIVAS.map((s) => `'${s}'`).join(", "))})
              and (k.admissao_id is not null
                   or (s.papel is distinct from 'REVISAO'
                       and (s.encerra = false
                            or (s.papel = 'FECHAMENTO'
                                and coalesce(v.vagas_fechadas, 0)
                                    + coalesce(v.vagas_fechadas_banco, 0) > 0)
                            or v.encerrada_em is null))))
     and coalesce(
           (select max(greatest(
                       k.atualizado_em,
                       coalesce(
                         case when k.situacao in (${sql.raw(SITUACOES_VIVAS.map((s) => `'${s}'`).join(", "))}) then v.encerrada_em end,
                         k.atualizado_em),
                       coalesce(
                         case when s2.papel = 'REVISAO'
                              then (select max(e.em)
                                      from as_vaga_status_eventos e
                                     where e.vaga_id = v.id
                                       and e.para = v.status) end,
                         k.atualizado_em)))
              from as_candidaturas k
              join vagas v on v.id = k.vaga_id
              join as_vaga_status s2 on s2.codigo = v.status
             where k.candidato_id = c.id),
           greatest(c.criado_em, c.atualizado_em))
         <= now() - interval '6 months'
  returning c.id
`);

/** Um mutante: o que foi quebrado, o texto quebrado e a regra que TEM de acusar. */
export interface Mutante {
  nome: string;
  /** O dano que ele causaria em produção, para o spec não virar uma lista de trocas de string. */
  dano: string;
  sql: string;
  regraEsperada: string;
}

function trocar(de: string, para: string): string {
  const alvo = SQL_REFERENCIA.toLowerCase();
  const i = alvo.indexOf(de.toLowerCase());
  if (i < 0) throw new Error(`Mutante impossível: "${de}" não está na referência.`);
  return SQL_REFERENCIA.slice(0, i) + para + SQL_REFERENCIA.slice(i + de.length);
}

const VIVAS_NO_SQL = SITUACOES_VIVAS.map((s) => `'${s}'`).join(", ");
const CONDICAO_REFERENCIA =
  `(k.admissao_id is not null or (s.papel is distinct from 'REVISAO' and (s.encerra = false ` +
  `or (s.papel = 'FECHAMENTO' and coalesce(v.vagas_fechadas, 0) + coalesce(v.vagas_fechadas_banco, 0) > 0) ` +
  `or v.encerrada_em is null)))`;
const PROTECAO_REFERENCIA =
  `not exists ( select 1 from as_candidaturas k join vagas v on v.id = k.vaga_id ` +
  `join as_vaga_status s on s.codigo = v.status where k.candidato_id = c.id ` +
  `and k.situacao in (${VIVAS_NO_SQL}) and ${CONDICAO_REFERENCIA})`;
const PISO_REFERENCIA =
  `coalesce( case when s2.papel = 'REVISAO' then (select max(e.em) from as_vaga_status_eventos e ` +
  `where e.vaga_id = v.id and e.para = v.status) end, k.atualizado_em)`;
const RELOGIO_REFERENCIA =
  `(select max(greatest( k.atualizado_em, coalesce( case when k.situacao in (${VIVAS_NO_SQL}) ` +
  `then v.encerrada_em end, k.atualizado_em), ${PISO_REFERENCIA})) from as_candidaturas k ` +
  `join vagas v on v.id = k.vaga_id join as_vaga_status s2 on s2.codigo = v.status ` +
  `where k.candidato_id = c.id)`;

export const MUTANTES: Mutante[] = [
  {
    nome: "1. o relógio volta a ser só `k.atualizado_em`",
    dano: "aprovado em 2024 numa vaga cancelada hoje fica elegível na hora, sem carência, e a próxima varredura o apaga.",
    sql: trocar(
      RELOGIO_REFERENCIA,
      "(select max(k.atualizado_em) from as_candidaturas k where k.candidato_id = c.id)",
    ),
    regraEsperada: "RELOGIO_SEM_ENCERRAMENTO_DA_VAGA",
  },
  {
    nome: "2. o join lê `recebe_candidato` em vez de `encerra`",
    dano: "vaga PAUSADA (status LIVRE, Stand By) passa a contar como terminada, e todo mundo dentro dela vira expurgável.",
    sql: trocar("s.encerra = false", "s.recebe_candidato = true"),
    regraEsperada: "PROTECAO_LE_RECEBE_CANDIDATO",
  },
  {
    nome: "3. a cláusula protetora perde a condição da vaga",
    dano: "volta o buraco original: quem fica vivo em vaga encerrada nunca começa a contar prazo e retém CPF para sempre.",
    sql: trocar(
      PROTECAO_REFERENCIA,
      `not exists ( select 1 from as_candidaturas k where k.candidato_id = c.id and k.situacao in (${VIVAS_NO_SQL}))`,
    ),
    regraEsperada: "PROTECAO_SEM_CATALOGO",
  },
  {
    nome: "5. o relógio lê `data_fechamento` (o campo do corpo)",
    dano: "um COMUM cancelando com data de 2019 dispara a exclusão de quem estava naquela vaga.",
    sql: trocar("then v.encerrada_em end", "then v.data_fechamento end"),
    regraEsperada: "RELOGIO_LE_DATA_FECHAMENTO",
  },
  {
    nome: "6a. a proteção passa a olhar SÓ a candidatura da vaga encerrada",
    dano: "APROVADO em vaga cancelada e ATIVO em vaga aberta deixa de ser protegido: apaga alguém em processo.",
    sql: trocar("s.encerra = false", "s.encerra = true"),
    regraEsperada: "PROTECAO_OLHA_A_VAGA_ERRADA",
  },
  {
    nome: "6b. a proteção passa a olhar só a ÚLTIMA candidatura da pessoa",
    dano: "quem tem processo vivo numa vaga aberta, mas cuja última candidatura é de vaga encerrada, é apagado.",
    sql: trocar(
      PROTECAO_REFERENCIA,
      `not exists ( select 1 from as_candidaturas k join vagas v on v.id = k.vaga_id ` +
        `join as_vaga_status s on s.codigo = v.status where k.candidato_id = c.id ` +
        `and k.id = (select k2.id from as_candidaturas k2 where k2.candidato_id = c.id order by k2.atualizado_em desc limit 1) ` +
        `and k.situacao in (${VIVAS_NO_SQL}) and ${CONDICAO_REFERENCIA})`,
    ),
    regraEsperada: "PROTECAO_OLHA_UMA_CANDIDATURA_SO",
  },
  {
    nome: "8. o sinal da retenção se inverte",
    dano: "o expurgo anonimiza EXATAMENTE E SOMENTE quem está no banco de talentos, que é quem nunca poderia ser tocado. Irreversível, e uma prova de que `expurgar()` apaga alguém fica verde.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos = true"),
    regraEsperada: "RETENCAO_SENTIDO_INVERTIDO",
  },
  {
    nome: "9. a cláusula da retenção some",
    dano: "candidato de banco passa a expirar como qualquer outro, e a decisão do diretor deixa de existir sem nada falhar.",
    sql: trocar(" and c.banco_talentos = false", ""),
    regraEsperada: "RETENCAO_NAO_LIDA",
  },
  {
    nome: "10. a retenção ganha uma alternativa sempre verdadeira, entre parênteses",
    dano: "a comparação certa continua no texto, visível na revisão de código, e não exclui mais ninguém: todo mundo do banco de talentos volta a ser anonimizável.",
    sql: trocar("c.banco_talentos = false", "(c.banco_talentos = false or 1=1)"),
    regraEsperada: "RETENCAO_NAO_RESTRITIVA",
  },
  {
    nome: "11. a retenção ganha um `or true` SEM parênteses",
    dano: "o `or` tem precedência menor que o `and` e liga o `where` INTEIRO: o expurgo passa a alcançar TODO MUNDO, inclusive quem está em processo vivo e quem não tem prazo vencido. Irreversível.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos = false or true"),
    regraEsperada: "RETENCAO_NAO_RESTRITIVA",
  },
  {
    nome: "12. o prazo volta a ser de 2 anos",
    dano: "a decisão do diretor é REVOGADA em silêncio: o dado pessoal de quem parou há 6 meses fica retido por mais um ano e meio, e nada falha.",
    sql: trocar("interval '6 months'", "interval '2 years'"),
    regraEsperada: "PRAZO_ANTIGO_DE_VOLTA",
  },
  {
    nome: "12b. o prazo some do texto",
    dano: "sem o intervalo do diretor, o prazo vira o que quer que esteja escrito no lugar, e o expurgo passa a alcançar quem o time viu ontem.",
    sql: trocar("interval '6 months'", "interval '3 days'"),
    regraEsperada: "REGRESSAO_PRAZO",
  },
  {
    nome: "13. a fila de revisão volta a proteger",
    dano: "a vaga espelhada do Pandapé nasce sem cliente e ninguém a revisa: quem está pendurado nela fica com o dado pessoal retido por tempo INDEFINIDO, em massa e em silêncio, que é o furo que a decisão do diretor fecha.",
    sql: trocar("s.papel is distinct from 'REVISAO' and ", ""),
    regraEsperada: "PROTECAO_ABRIGA_A_FILA_DE_REVISAO",
  },
  {
    nome: "13b. a fila de revisão é excluída pelo CÓDIGO, e não pelo papel",
    dano: "funciona hoje e para de funcionar no dia em que o diretor renomear `PENDENTE_REVISAO` na tela do catálogo, sem nada falhar: a fila volta a proteger em silêncio.",
    sql: trocar("s.papel is distinct from 'REVISAO'", "v.status is distinct from 'PENDENTE_REVISAO'"),
    regraEsperada: "PROTECAO_ABRIGA_A_FILA_DE_REVISAO",
  },
  {
    nome: "14. a subtração vira lista positiva de papéis",
    dano: "tira o REVISAO e leva junto o RASCUNHO (que RECEBE candidato) e TODO status LIVRE que o diretor criar pela tela, do tipo Stand By: gente em processo vivo numa vaga só pausada passa a ser expurgável, sem decisão de ninguém.",
    sql: trocar(
      "s.papel is distinct from 'REVISAO'",
      "s.papel in ('ABERTURA', 'ENTREGA')",
    ),
    regraEsperada: "PROTECAO_ESTREITA_ALEM_DE_REVISAO",
  },
  {
    nome: "14b. a subtração tira também o RASCUNHO",
    dano: "a vaga em rascunho recebe candidato, e quem está dentro dela passa a ser anonimizado enquanto o processo está vivo.",
    sql: trocar(
      "s.papel is distinct from 'REVISAO'",
      "s.papel is distinct from 'REVISAO' and s.papel is distinct from 'RASCUNHO'",
    ),
    regraEsperada: "PROTECAO_ESTREITA_ALEM_DE_REVISAO",
  },
  {
    nome: "15. a leitura do FATO da admissão some",
    dano: "a vaga devolvida para a fila de revisão anonimiza, do lado de A&S, quem já foi ENVIADO PARA ADMISSÃO, enquanto o CPF dessa pessoa segue inteiro na Admissão, que não tem retenção geral. Minimização zero e irreversível.",
    sql: trocar("k.admissao_id is not null or ", ""),
    regraEsperada: "PROTECAO_NAO_LE_A_ADMISSAO",
  },
  {
    nome: "15b. a leitura da admissão vira subordinada à subtração do papel",
    dano: "o texto passa a CITAR `admissao_id` e a não proteger: na vaga devolvida para a fila, que é exatamente o caminho de dano, a proteção continua desligada.",
    sql: trocar(
      "(k.admissao_id is not null or (s.papel is distinct from 'REVISAO' and (s.encerra = false",
      "(s.papel is distinct from 'REVISAO' and (k.admissao_id is not null or s.encerra = false",
    ),
    regraEsperada: "PROTECAO_LE_A_ADMISSAO_DENTRO_DA_SUBTRACAO",
  },
  {
    nome: "16. o piso da fila de revisão some do relógio",
    dano: "quem VOLTA para a fila de revisão perde a proteção JÁ com o prazo vencido (o `atualizado_em` dele tem anos, porque enquanto a vaga esteve aberta ninguém precisou tocar a linha) e é anonimizado na varredura da hora seguinte, sem carência nenhuma.",
    sql: trocar(`, ${PISO_REFERENCIA}`, ""),
    regraEsperada: "RELOGIO_SEM_PISO_DA_FILA_DE_REVISAO",
  },
  {
    nome: "7. o relógio corre do encerramento MAIS ANTIGO (`min`)",
    dano: "quem o time viu no mês passado é apagado por causa de um processo de três anos atrás.",
    sql: trocar("max(greatest(", "min(greatest("),
    regraEsperada: "RELOGIO_SEM_MAX",
  },
];
