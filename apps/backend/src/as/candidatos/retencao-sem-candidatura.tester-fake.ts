import { sql } from "drizzle-orm";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import {
  clausulaDaProtecao,
  clausulaDoExistePlano,
  clausulaDoRelogio,
  clausulasDoWhere,
  semEmbrulhoRedundante,
  sqlExecutavel,
  violacoesDoContrato,
} from "./retencao-lgpd.tester-fake";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA O FURO 1: QUEM ENTRA SEM VAGA NUNCA EXPIRA ──────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é o mesmo do arquivo vizinho, e
 * pelo mesmo motivo registrado lá: nome que ninguém mais escolheria é a trava mais barata contra
 * dois agentes gravarem o mesmo arquivo em silêncio.
 *
 * ┌─ O REQUISITO, e ele REVOGA uma regra que o contrato vizinho ainda cobra ────────────────────┐
 * │ `docs/MAPA-ALCANCE-FUNDACAO-PROD-E-2-FUROS.md`, FURO 1: a retenção DEIXA DE DEPENDER de      │
 * │ haver candidatura. Quem entra e não casa com vaga nenhuma passa a expirar pelo prazo de 2    │
 * │ anos contado das datas do PRÓPRIO candidato.                                                │
 * │                                                                                             │
 * │ O CONTRATO VIZINHO CODIFICA O DEFEITO, e isso precisa ser dito em voz alta: a regra          │
 * │ `REGRESSAO_SEM_PROCESSO_NAO_CONTA` de `violacoesDoContrato` EXIGE a cláusula                 │
 * │ `exists (select 1 from as_candidaturas ...)`, que é exatamente a linha que o furo 1 manda    │
 * │ apagar. Ela foi escrita quando "sem processo encerrado não há prazo a contar" era a régua, e │
 * │ a régua mudou por decisão registrada no mapa. Enquanto ela existir, o contrato vizinho ficará│
 * │ VERMELHO no dia em que a correção subir, acusando uma regressão que é, na verdade, a         │
 * │ correção. QUEM IMPLEMENTAR TEM DE APAGAR AQUELA REGRA, e este arquivo NÃO a apaga de         │
 * │ propósito: o `tester` não edita o teste de outra frente para caber na implementação futura.  │
 * │ É por isso que `violacoesDaRetencaoSemCandidatura` HERDA o contrato vizinho inteiro e ignora │
 * │ UMA regra, nomeada em `HERDADAS_REVOGADAS`, com o motivo escrito ao lado.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE PARTE DESTA COBERTURA É LEITURA DE SQL, e o que se faz contra o falso positivo ────┐
 * │ O filtro inteiro do expurgo mora dentro de UMA consulta em SQL CRU, e não há Postgres em     │
 * │ memória nesta suíte (nem pglite nem pg-mem nas dependências, conferido). Um banco fingido    │
 * │ devolve as linhas que quiser, com o filtro certo ou errado, então não existe, para o FURO 1, │
 * │ asserção direta de "esta pessoa foi anonimizada".                                            │
 * │                                                                                             │
 * │ O QUE SE MEDE, ENTÃO, É O SENTIDO, E NUNCA A PRESENÇA DE UMA PALAVRA:                        │
 * │   1. o comentário é APAGADO antes de qualquer leitura (só o SQL executável é olhado);        │
 * │   2. a leitura é por CLÁUSULA de topo e, dentro do relógio, por ARGUMENTO do `coalesce`;     │
 * │   3. a régua da queda é o argumento de NULIDADE, que é semântica de verdade e não estilo:    │
 * │      `max()` sobre conjunto vazio devolve NULL, `NULL <= qualquer coisa` não é verdadeiro, e │
 * │      por isso quem não tem candidatura NUNCA é alcançado hoje. A correção só existe se       │
 * │      houver um valor de queda que NÃO dependa de `as_candidaturas`. É isso que se afirma;    │
 * │   4. o contrato é exercitado contra MUTANTES (`MUTANTES_SEM_CANDIDATURA`), então contrato    │
 * │      frouxo fica vermelho por si.                                                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal aqui. Nomes de coluna, situações e datas sintéticas.
 */

// ── 1. LEITURA DO RELÓGIO, POR ARGUMENTO ────────────────────────────────────

/**
 * O LADO ESQUERDO do relógio: a expressão de data que é comparada com o prazo.
 *
 * Partido no `<=` de PROFUNDIDADE ZERO, e não no primeiro que aparecer: a expressão da data tem
 * subconsulta dentro, e um `<=` de dentro dela partiria a leitura no lugar errado, deixando a
 * afirmação seguinte olhando um caco.
 */
export function ladoEsquerdoDoRelogio(relogio: string): string {
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < relogio.length; i += 1) {
    const c = relogio[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (profundidade === 0 && (relogio.startsWith("<=", i) || relogio.startsWith("<", i))) {
      return relogio.slice(0, i).trim();
    }
  }
  return "";
}

/** Os argumentos de topo de uma chamada, partidos na vírgula que está no nível da própria chamada. */
function argumentosDaChamada(corpo: string): string[] {
  const args: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i];
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (profundidade === 0 && c === ",") {
        args.push(atual.trim());
        atual = "";
        continue;
      }
    }
    atual += c;
  }
  if (atual.trim()) args.push(atual.trim());
  return args;
}

/**
 * TODAS as chamadas de uma função na expressão, cada uma já partida nos argumentos dela.
 *
 * TODAS, e não a primeira, porque o relógio de hoje JÁ TEM um `coalesce` dentro (o que escolhe
 * entre `v.encerrada_em` e `k.atualizado_em`). Ler só o primeiro faria a afirmação da queda cair
 * sobre a expressão errada e ficar verde com o furo aberto, que é o falso positivo mais provável
 * deste arquivo.
 */
export function chamadasDe(expr: string, funcao: string): string[][] {
  const t = expr.toLowerCase();
  const alvo = `${funcao}(`;
  const chamadas: string[][] = [];
  for (let i = t.indexOf(alvo); i >= 0; i = t.indexOf(alvo, i + 1)) {
    // A palavra tem de ser inteira: `xcoalesce(` não é `coalesce(`.
    const anterior = i > 0 ? t[i - 1] : " ";
    if (/[a-z0-9_]/.test(anterior)) continue;
    let profundidade = 0;
    let fim = -1;
    let emAspas = false;
    for (let k = i + alvo.length - 1; k < t.length; k += 1) {
      const c = t[k];
      if (c === "'") emAspas = !emAspas;
      if (emAspas) continue;
      if (c === "(") profundidade += 1;
      if (c === ")") {
        profundidade -= 1;
        if (profundidade === 0) {
          fim = k;
          break;
        }
      }
    }
    if (fim > 0) chamadas.push(argumentosDaChamada(t.slice(i + alvo.length, fim)));
  }
  return chamadas;
}

/**
 * ─ O QUE É UMA "QUEDA PARA AS DATAS DO PRÓPRIO CANDIDATO" ──────────────────────────────────────
 *
 * O ARGUMENTO É DE NULIDADE, E É ELE QUE FAZ A CORREÇÃO EXISTIR. Uma queda que continue lendo
 * `as_candidaturas` devolve NULL para quem não tem nenhuma, exatamente como hoje, e o prazo
 * continua sem NUNCA começar a correr. Então a queda só conta como queda se ela NÃO depender da
 * tabela que a pessoa não tem linha nenhuma.
 */
function ehQuedaParaOCandidato(arg: string): boolean {
  const a = arg.toLowerCase();
  if (/\bas_candidaturas\b/.test(a) || /\bselect\b/.test(a)) return false;
  return /\bc\.(criado_em|atualizado_em)\b/.test(a);
}

/** O `coalesce` do relógio que faz a queda, se houver algum. Devolve os argumentos dele. */
export function coalesceDaQueda(relogio: string): string[] | null {
  const esquerdo = semEmbrulhoRedundante(ladoEsquerdoDoRelogio(relogio));
  for (const args of chamadasDe(esquerdo, "coalesce")) {
    if (args.length >= 2 && ehQuedaParaOCandidato(args[args.length - 1])) return args;
  }
  return null;
}

// ── 1B. OS BLOCOS DE ESCRITA DA VARREDURA ───────────────────────────────────

/**
 * ─ A VARREDURA PASSOU A TER DOIS `update as_candidatos`, E LER O ERRADO INVERTE TUDO ───────────
 *
 * A resolução do VETO C (`docs/MAPA-ALCANCE-FUNDACAO-PROD-E-2-FUROS.md`) acrescenta a CICATRIZAÇÃO:
 * além de anonimizar quem venceu o prazo, a varredura RE-NULA o dado pessoal de toda linha que já
 * tem `anonimizado_em`. São escritas com predicados OPOSTOS (`is null` contra `is not null`) sobre a
 * MESMA tabela.
 *
 * O PARSER COMPARTILHADO ANCORA NO PRIMEIRO `update as_candidatos` que encontra, e a ordem das CTEs
 * é escolha de quem constrói. Se a cicatrização vier antes, todo o contrato herdado passaria a ler o
 * `where` dela e acusaria a régua inteira como destruída, reprovando uma implementação correta. Por
 * isso a régua do prazo é isolada AQUI, pelo que ela É (o predicado `anonimizado_em is null`), e
 * nunca pela posição.
 */
export function blocosDeEscritaEmCandidatos(sqlTexto: string): string[] {
  const t = sqlTexto.toLowerCase();
  const alvo = "update as_candidatos";
  const inicios: number[] = [];
  for (let i = t.indexOf(alvo); i >= 0; i = t.indexOf(alvo, i + 1)) inicios.push(i);

  /*
   * O BLOCO TERMINA ONDE A CTE DELE FECHA, e este detalhe decide se o contrato mede alguma coisa.
   * Cortar só no `update` seguinte faz o ÚLTIMO bloco varrer o resto da consulta inteira, e a
   * consulta de hoje tem, mais adiante, uma CTE que fala de `anonimizado_em is not null` (a que
   * apaga identidade externa). Com o corte errado, a varredura de HOJE pareceria já ter
   * cicatrização, e o contrato ficaria verde com o furo aberto, que é o falso positivo que este
   * arquivo inteiro existe para evitar.
   */
  return inicios.map((inicio, k) => {
    const limite = k + 1 < inicios.length ? inicios[k + 1] : sqlTexto.length;
    let profundidade = 0;
    let emAspas = false;
    for (let i = inicio; i < limite; i += 1) {
      const c = t[i];
      if (c === "'") emAspas = !emAspas;
      if (emAspas) continue;
      if (c === "(") profundidade += 1;
      if (c === ")") {
        profundidade -= 1;
        // O `)` que fecha a CTE em que este `update` mora: daqui para frente é assunto de outro.
        if (profundidade < 0) return sqlTexto.slice(inicio, i);
      }
    }
    return sqlTexto.slice(inicio, limite);
  });
}

/** O predicado do bloco é "ainda NÃO foi anonimizada"? */
function alcancaSoQuemNaoFoiAnonimizado(bloco: string): boolean {
  const b = bloco.toLowerCase();
  return /anonimizado_em\s+is\s+null/.test(b) && !/anonimizado_em\s+is\s+not\s+null/.test(b);
}

/** O predicado do bloco é "JÁ foi anonimizada"? É a cicatrização. */
function alcancaQuemJaFoiAnonimizado(bloco: string): boolean {
  return /anonimizado_em\s+is\s+not\s+null/.test(bloco.toLowerCase());
}

/**
 * A RÉGUA DO PRAZO: o `update` que decide QUEM passa a ser anonimizado agora.
 *
 * Achado pelo predicado, e não pela ordem. Sem nenhum candidato, devolve o texto inteiro, que é o
 * que faz o contrato herdado acusar a ausência em vez de ficar verde por não achar nada.
 */
export function reguaDoAlvo(sqlTexto: string): string {
  const blocos = blocosDeEscritaEmCandidatos(sqlTexto);
  return blocos.find(alcancaSoQuemNaoFoiAnonimizado) ?? sqlTexto;
}

/** A CICATRIZAÇÃO: a escrita que reconserta quem já está carimbado, se ela existir. */
export function blocoDaCicatrizacao(sqlTexto: string): string {
  return blocosDeEscritaEmCandidatos(sqlTexto).find(alcancaQuemJaFoiAnonimizado) ?? "";
}

/** O `set` de um bloco: o que vai ser gravado, sem o `where` que decide em quem. */
function trechoDoSet(bloco: string): string {
  const b = bloco.toLowerCase();
  const i = b.indexOf(" set ");
  if (i < 0) return "";
  const fim = indiceDoWhereDoBloco(b);
  return b.slice(i + " set ".length, fim < 0 ? b.length : fim);
}

/** O primeiro ` where ` fora de parêntese DENTRO do bloco. */
function indiceDoWhereDoBloco(b: string): number {
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < b.length; i += 1) {
    const c = b[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (profundidade === 0 && b.startsWith(" where ", i)) return i;
  }
  return -1;
}

/** "Esta coluna é zerada neste `set`", em qualquer das formas que o Postgres aceita. */
export function zeraColuna(bloco: string, coluna: string): boolean {
  return new RegExp(`\\b${coluna}\\s*=\\s*null\\b`).test(trechoDoSet(bloco));
}

/** O `where` de um bloco de escrita: quem a escrita alcança. */
export function trechoDoWhere(bloco: string): string {
  const b = bloco.toLowerCase();
  const i = indiceDoWhereDoBloco(b);
  return i < 0 ? "" : b.slice(i + " where ".length).trim();
}

/** O literal que a escrita grava em `nome`, se ela gravar algum. É o MARCADOR do expurgo. */
export function marcadorDoNome(bloco: string): string | null {
  const m = /\bnome\s*=\s*'([^']*)'/.exec(trechoDoSet(bloco));
  return m ? m[1] : null;
}

/** O literal com que a guarda COMPARA o nome, se ela comparar. */
export function marcadorNaGuarda(bloco: string): string | null {
  const m = /\bnome\s*(?:<>|!=|is\s+distinct\s+from)\s*'([^']*)'/.exec(trechoDoWhere(bloco));
  return m ? m[1] : null;
}

/** As QUATRO colunas que o expurgo ZERA. O `nome` não entra aqui porque ele é reescrito, não nulado. */
export const COLUNAS_PESSOAIS = ["cpf", "email", "telefone", "data_nascimento"];

/**
 * ┌─ O `nome` É DADO PESSOAL, E A PREMISSA CONTRÁRIA JÁ CUSTOU UM VETO ─────────────────────────┐
 * │ Este arquivo dizia, em comentário, que "o nome vira marcador e fica de fora". A frase é      │
 * │ verdadeira para quem ACABOU de passar pelo expurgo e FALSA exatamente na população que a     │
 * │ cicatrização existe para reparar: ela não é para quem passou pelo prazo, é para quem o       │
 * │ `editar` RE-IDENTIFICOU, e o `editar` grava o nome na MESMA instrução em que grava o CPF.    │
 * │ Quem reabre uma ficha expurgada digita o NOME de volta primeiro, porque é o campo de cima.   │
 * │                                                                                             │
 * │ MEDIDO CONTRA O BANCO pelo `seguranca`: linha carimbada, os quatro campos nulos e o nome     │
 * │ real de volta SAIU DA PASSADA COM O NOME INTACTO, e esta suíte ficou VERDE com o furo        │
 * │ aberto. A premissa estava no MEU contrato, então o contrato carimbou o defeito. É por isso   │
 * │ que a régua do nome, daqui em diante, tem mutante próprio: premissa em comentário morre na   │
 * │ refatoração seguinte, regra com mutante não.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const COLUNA_DO_NOME = "nome";

/**
 * ─ AVALIAR A GUARDA DA CICATRIZAÇÃO SOBRE UMA LINHA SINTÉTICA ──────────────────────────────────
 *
 * Interpretador mínimo do predicado (`and`, `or`, parênteses, `is null`, `is not null`, `=` e `<>`
 * contra literal). Ele existe porque as duas propriedades que o veto pede são de ALCANCE, e alcance
 * não se lê, se avalia:
 *   . a linha em que SÓ O NOME voltou TEM de ser alcançada (é o caso que escapava inteiro, porque a
 *     guarda de "há o que cicatrizar" não listava o nome, então a linha nunca era nem tocada);
 *   . a linha JÁ LIMPA NÃO pode ser alcançada (senão a passada reescreve a base inteira de hora em
 *     hora, que é o outro lado da divergência de marcador).
 *
 * `null` é DESCONHECIDO, e desconhecido reprova: o que o interpretador não entende não vira verde.
 */
export function avaliarPredicado(
  expr: string,
  linha: Record<string, string | null>,
): boolean | null {
  const e = semEmbrulhoRedundante(expr.trim().toLowerCase());

  const ou = partirPorOperador(e, "or");
  if (ou.length > 1) {
    const partes = ou.map((p) => avaliarPredicado(p, linha));
    if (partes.some((x) => x === true)) return true;
    return partes.some((x) => x === null) ? null : false;
  }
  const eh = partirPorOperador(e, "and");
  if (eh.length > 1) {
    const partes = eh.map((p) => avaliarPredicado(p, linha));
    if (partes.some((x) => x === false)) return false;
    return partes.some((x) => x === null) ? null : true;
  }

  const valor = (coluna: string): string | null | undefined => {
    const nome = coluna.replace(/^[a-z_]+\./, "");
    return nome in linha ? linha[nome] : undefined;
  };

  let m = /^([a-z_]+(?:\.[a-z_]+)?)\s+is\s+not\s+null$/.exec(e);
  if (m) {
    const v = valor(m[1]);
    return v === undefined ? null : v !== null;
  }
  m = /^([a-z_]+(?:\.[a-z_]+)?)\s+is\s+null$/.exec(e);
  if (m) {
    const v = valor(m[1]);
    return v === undefined ? null : v === null;
  }
  m = /^([a-z_]+(?:\.[a-z_]+)?)\s*(<>|!=|=|is\s+distinct\s+from)\s*'([^']*)'$/.exec(e);
  if (m) {
    const v = valor(m[1]);
    if (v === undefined) return null;
    // Comparação com NULL não é verdadeira no Postgres, e `is distinct from` é a exceção.
    const distinto = m[2] !== "=";
    if (v === null) return /is\s+distinct\s+from/.test(m[2]) ? true : null;
    return distinto ? v !== m[3] : v === m[3];
  }
  return null;
}

/** Parte a expressão no operador booleano de PROFUNDIDADE ZERO, respeitando aspas. */
function partirPorOperador(e: string, operador: string): string[] {
  const alvo = ` ${operador} `;
  const partes: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < e.length; i += 1) {
    const c = e[i];
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (profundidade === 0 && e.startsWith(alvo, i)) {
        partes.push(atual.trim());
        atual = "";
        i += alvo.length - 1;
        continue;
      }
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

/** Uma linha já carimbada em que SÓ o nome voltou. É o caso que escapava inteiro. */
export function linhaComSoONomeDeVolta(nomeReal: string): Record<string, string | null> {
  return {
    anonimizado_em: "2026-01-01T00:00:00Z",
    nome: nomeReal,
    cpf: null,
    email: null,
    telefone: null,
    data_nascimento: null,
  };
}

/** Uma linha já carimbada e JÁ LIMPA. A passada não pode tocá-la. */
export function linhaJaLimpa(marcador: string): Record<string, string | null> {
  return {
    anonimizado_em: "2026-01-01T00:00:00Z",
    nome: marcador,
    cpf: null,
    email: null,
    telefone: null,
    data_nascimento: null,
  };
}

/**
 * ─ AS CTEs, PARA SABER DE ONDE SAI A CONTAGEM DO LOG ───────────────────────────────────────────
 *
 * Devolve `{ nome, corpo }` de cada CTE, por casamento de parênteses. A contagem que vai ao log tem
 * de sair da CTE do PRAZO, e nunca da cicatrização: a cicatrização alcança todo mundo que já está
 * carimbado, em toda passada, para sempre. Contá-la faria o log anunciar um expurgo por hora sem
 * ninguém ter sido expurgado, e o número perderia todo o valor (o arquivo de produção já escreve
 * isso, e é a propriedade que não pode cair junto com a mudança).
 */
export function ctesDaConsulta(sqlTexto: string): { nome: string; corpo: string }[] {
  const t = sqlTexto.toLowerCase();
  const ctes: { nome: string; corpo: string }[] = [];
  const re = /(?:with|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/g;
  let m = re.exec(t);
  while (m) {
    const abre = m.index + m[0].length - 1;
    let profundidade = 0;
    let fim = -1;
    let emAspas = false;
    for (let i = abre; i < t.length; i += 1) {
      const c = t[i];
      if (c === "'") emAspas = !emAspas;
      if (emAspas) continue;
      if (c === "(") profundidade += 1;
      if (c === ")") {
        profundidade -= 1;
        if (profundidade === 0) {
          fim = i;
          break;
        }
      }
    }
    if (fim < 0) break;
    ctes.push({ nome: m[1], corpo: t.slice(abre + 1, fim) });
    re.lastIndex = fim;
    m = re.exec(t);
  }
  return ctes;
}

/** O `select` final, o que fica depois da última CTE e produz a contagem do log. */
export function selectFinal(sqlTexto: string): string {
  const ctes = ctesDaConsulta(sqlTexto);
  if (!ctes.length) return "";
  const ultimo = ctes[ctes.length - 1];
  const t = sqlTexto.toLowerCase();
  const i = t.lastIndexOf(ultimo.corpo);
  return i < 0 ? "" : t.slice(i + ultimo.corpo.length);
}

/**
 * ─ AVALIAR A EXPRESSÃO DA QUEDA, DE VERDADE, SOBRE DATAS SINTÉTICAS ────────────────────────────
 *
 * ISTO NÃO É LEITURA DE TEXTO: é um interpretador minúsculo da GRAMÁTICA QUE A QUEDA USA
 * (`greatest`, `least`, `coalesce`, `now()`, as duas datas do candidato e literal de data). Ele
 * existe para que a defesa do VETO B do `seguranca` seja MEDIDA e não argumentada: dada uma linha
 * com `criado_em` ANTIGO e `atualizado_em` RECENTE, a data de referência que a queda produz tem de
 * ser a RECENTE, e a pessoa NÃO pode ficar elegível.
 *
 * Expressão que ele não conhece devolve `null`, e `null` reprova: o desconhecido cai para o lado de
 * não apagar, que é a mesma direção de todo o resto deste arquivo.
 */
export function avaliarQueda(
  expr: string,
  linha: { criadoEm: Date; atualizadoEm: Date },
  agora: Date,
): Date | null {
  const e = expr.trim().toLowerCase().replace(/^\((.*)\)$/s, "$1").trim();

  const chamada = /^([a-z_]+)\s*\(([\s\S]*)\)$/.exec(e);
  if (chamada && ["greatest", "least", "coalesce", "max", "min"].includes(chamada[1])) {
    const args = argumentosDaChamada(chamada[2]).map((a) => avaliarQueda(a, linha, agora));
    if (chamada[1] === "coalesce") return args.find((a) => a !== null) ?? null;
    const validos = args.filter((a): a is Date => a !== null);
    if (!validos.length) return null;
    const tempos = validos.map((d) => d.getTime());
    const escolhido =
      chamada[1] === "least" || chamada[1] === "min" ? Math.min(...tempos) : Math.max(...tempos);
    return new Date(escolhido);
  }

  if (/^now\s*\(\s*\)$/.test(e)) return agora;
  if (/^[a-z_]*\.?criado_em$/.test(e)) return linha.criadoEm;
  if (/^[a-z_]*\.?atualizado_em$/.test(e)) return linha.atualizadoEm;
  const literal = /^(?:timestamptz|timestamp|date)?\s*'([^']+)'$/.exec(e);
  if (literal) {
    const d = new Date(literal[1]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ── 2. O CONTRATO DO FURO 1 ─────────────────────────────────────────────────

/**
 * A regra do contrato vizinho que o requisito REVOGA, e nenhuma outra.
 *
 * Ela está aqui NOMEADA, e não apagada lá, porque apagar teste de outra frente para caber numa
 * implementação futura é justamente o que o `tester` não faz. Quem implementar apaga.
 */
export const HERDADAS_REVOGADAS = ["REGRESSAO_SEM_PROCESSO_NAO_CONTA"];

/** §A.6: o nome que a linha sintética carrega. Inventado, sem dono, e nunca sai daqui. */
export const NOME_REAL_SINTETICO = "Fulano De Teste Sintetico";

/**
 * ─ O CONTRATO DO FURO 1, EM REGRAS NOMEADAS ───────────────────────────────────────────────────
 *
 * Devolve a lista das VIOLAÇÕES. Vazia é o contrato cumprido. Cada regra carrega, na própria
 * string, o dano que ela causa em produção: é essa frase que alguém vai ler no vermelho.
 *
 * ELE HERDA O CONTRATO VIZINHO INTEIRO, menos a regra revogada, e é assim que "o que NÃO pode
 * mudar" fica travado sem ser reescrito: a proteção da vaga não encerrada, o sentido da cláusula de
 * banco, a lista derivada das situações vivas, o prazo de 2 anos e o `max` do relógio continuam
 * cobrados pela régua que já existia.
 */
export function violacoesDaRetencaoSemCandidatura(sqlTexto: string): string[] {
  const inteiro = sqlTexto.toLowerCase();
  /*
   * A RÉGUA DO PRAZO É ISOLADA ANTES DE QUALQUER LEITURA, e é a cicatrização (VETO C) que obriga a
   * isso: a varredura passou a ter DOIS `update as_candidatos`, com predicados opostos. Ler o
   * bloco pela POSIÇÃO faria o contrato inteiro depender da ordem em que as CTEs foram escritas.
   */
  const t = reguaDoAlvo(inteiro);
  const v = violacoesDoContrato(t).filter(
    (x) => !HERDADAS_REVOGADAS.some((regra) => x.startsWith(regra)),
  );

  // ── A. O GATE QUE PRECISA SUMIR ───────────────────────────────────────────
  if (clausulaDoExistePlano(t)) {
    v.push(
      "GATE_DE_CANDIDATURA_PRESENTE: a régua ainda exige `exists (select 1 from as_candidaturas ...)`. Quem entra e não casa com vaga nenhuma nunca satisfaz essa cláusula, então o prazo NUNCA começa a correr e CPF, e-mail, telefone e data de nascimento ficam retidos PARA SEMPRE. É retenção indefinida, que é o que a LGPD proíbe.",
    );
  }

  // ── B. O RELÓGIO PRECISA CAIR PARA AS DATAS DO CANDIDATO ──────────────────
  const relogio = clausulaDoRelogio(t);
  if (!relogio) return v; // o contrato herdado já acusou RELOGIO_AUSENTE.

  const esquerdo = ladoEsquerdoDoRelogio(relogio);
  if (!esquerdo) {
    v.push(
      "RELOGIO_SEM_COMPARACAO: não há comparação de topo entre a data de referência e o prazo. Sem ela não existe régua de tempo nenhuma.",
    );
    return v;
  }

  const queda = coalesceDaQueda(relogio);
  if (!queda) {
    v.push(
      "RELOGIO_NAO_ALCANCA_QUEM_NAO_TEM_CANDIDATURA: a data de referência continua dependendo SÓ de `as_candidaturas`. `max()` sobre conjunto vazio devolve NULL, e `NULL <= now() - interval` não é verdadeiro: quem nunca se candidatou segue fora do expurgo para sempre, que é exatamente o furo 1. A queda tem de ser um valor que NÃO leia `as_candidaturas`.",
    );
    return v;
  }

  const fallback = queda[queda.length - 1];
  if (!/\bc\.atualizado_em\b/.test(fallback)) {
    v.push(
      "QUEDA_NAO_USA_O_ULTIMO_MOVIMENTO: a queda não lê `c.atualizado_em`. Contando só do `criado_em`, alguém cadastrado há 2 anos e editado ontem nasce com o prazo JÁ VENCIDO e é anonimizado na varredura da hora seguinte, sem carência. É irreversível, e é a mesma régua de último movimento que o ramo de quem TEM candidatura já usa.",
    );
  }
  if (/\bc\.criado_em\b/.test(fallback) && !/\bgreatest\s*\(/.test(fallback)) {
    v.push(
      "QUEDA_COMBINA_AS_DATAS_PELO_LADO_ERRADO: a queda lê as duas datas do candidato sem `greatest`. O `greatest` é a prova de que a correção não APRESSA ninguém: ele só empurra a data para frente, nunca para trás.",
    );
  }
  if (/\bleast\s*\(/.test(fallback) || /\bmin\s*\(/.test(fallback)) {
    v.push(
      "QUEDA_ADIANTA_O_PRAZO: a queda usa `least`/`min`, que puxa a data de referência para TRÁS. Ninguém pode ficar elegível MAIS CEDO do que ficaria antes da correção: o erro tem de cair para o lado de não apagar.",
    );
  }

  // ── C. O RAMO DE QUEM TEM CANDIDATURA NÃO PODE MUDAR ──────────────────────
  const primeiro = queda[0];
  if (!/\bmax\s*\(/.test(primeiro)) {
    v.push(
      "RAMO_DE_QUEM_TEM_CANDIDATURA_PERDEU_O_MAX: o primeiro argumento da queda deixou de ser o MÁXIMO sobre as candidaturas. Quem tem candidatura mantém EXATAMENTE o relógio de hoje, e trocar o `max` apaga quem o time viu no mês passado por causa de um processo de três anos atrás.",
    );
  }
  if (!primeiro.includes("encerrada_em")) {
    v.push(
      "RAMO_DE_QUEM_TEM_CANDIDATURA_PERDEU_O_ENCERRAMENTO_DA_VAGA: o primeiro argumento da queda não lê mais `vagas.encerrada_em`. Quem tem candidatura mantém EXATAMENTE o relógio de hoje, e sem esse carimbo alguém aprovado em 2024 numa vaga cancelada HOJE fica elegível na hora.",
    );
  }
  if (!/\bk\.atualizado_em\b/.test(primeiro)) {
    v.push(
      "RAMO_DE_QUEM_TEM_CANDIDATURA_PERDEU_A_SAIDA_SEM_EXITO: o primeiro argumento da queda não lê mais `k.atualizado_em`. Quem foi DESCARTADO continua contando prazo do próprio descarte.",
    );
  }
  if (!/\bas_candidaturas\b/.test(esquerdo)) {
    v.push(
      "RELOGIO_ESQUECEU_AS_CANDIDATURAS: a data de referência não olha mais `as_candidaturas`. A correção acrescenta a população que não tem candidatura, e NUNCA substitui o relógio de quem tem.",
    );
  }

  // ── D. AS DUAS PROTEÇÕES QUE O CONTRATO HERDADO NÃO COBRE ─────────────────
  const protecao = clausulaDaProtecao(t);
  if (protecao && !/papel\s*(=|in)/.test(protecao)) {
    v.push(
      "PROTECAO_PERDEU_A_ENTREGA: a proteção não olha mais o PAPEL do status. O flag `encerra` é verdadeiro em ENTREGA, FECHAMENTO e CANCELAMENTO: sem a exceção da ENTREGA, quem FOI CONTRATADO passa a ser expurgado, e o expurgo não protegeria nada ali, porque o CPF dessa pessoa continua na ADMISSÃO, que é outro módulo. Destrói o histórico da seleção e não minimiza dado nenhum.",
    );
  }
  if (protecao && !/encerrada_em\s+is\s+null/.test(protecao)) {
    v.push(
      "PROTECAO_PERDEU_O_FAIL_CLOSED: a proteção não trata mais a vaga encerrada SEM carimbo (`v.encerrada_em is null`). Vaga cuja hora de encerramento ninguém sabe é prazo sem data de início, e prazo sem início não pode começar vencido.",
    );
  }

  // ── E. A IDEMPOTÊNCIA DA VARREDURA ────────────────────────────────────────
  if (!/anonimizado_em\s+is\s+null/.test(t) || /anonimizado_em\s+is\s+not\s+null/.test(t)) {
    v.push(
      "REGRESSAO_SEM_GUARDA_DE_JA_ANONIMIZADO: a régua do prazo não exige mais `anonimizado_em is null`. Sem ela a varredura reescreve, de hora em hora, quem já foi expurgado, e o carimbo da anonimização passa a ser sempre o de agora: perde-se a data em que o dado pessoal saiu, que é justamente o que se precisa provar.",
    );
  }

  // ── F. A CICATRIZAÇÃO (resolução do VETO C do `seguranca`) ────────────────
  v.push(...violacoesDaCicatrizacao(inteiro));
  return v;
}

/**
 * ─ A SEGUNDA METADE DO FURO 2, E ELA MORA NA VARREDURA ─────────────────────────────────────────
 *
 * O `seguranca` VETOU o desenho que fechava o furo 2 só com a recusa em `editar`, e o coordenador
 * aceitou o veto inteiro. O motivo é o modo de falha, não a elegância: uma linha re-identificada
 * fica com `anonimizado_em` PREENCHIDO e com o dado pessoal de volta, e a régua do prazo nunca mais
 * volta nela (`anonimizado_em is null`). A re-identificação que escapar da recusa vira PERMANENTE e
 * SILENCIOSA, que é o mesmo modo de falha da §A.33 aplicado a dado pessoal.
 *
 * ENTÃO A VARREDURA PASSA A RECONSERTAR, no molde exato da CTE que já apaga a identidade externa de
 * quem está carimbado. A régua é: toda linha com `anonimizado_em is not null` sai da passada com
 * `cpf`, `email`, `telefone` e `data_nascimento` nulos.
 */
export function violacoesDaCicatrizacao(sqlTexto: string): string[] {
  const v: string[] = [];
  const t = sqlTexto.toLowerCase();
  const cicatriz = blocoDaCicatrizacao(t);

  if (!cicatriz) {
    v.push(
      "SEM_CICATRIZACAO_DA_PII: a varredura não re-nula o dado pessoal de quem JÁ tem `anonimizado_em`. A régua do prazo nunca volta a essas linhas, então toda re-identificação que escapar da recusa do `editar` fica PARA SEMPRE, e em silêncio: do ponto de vista do sistema nada falhou.",
    );
    return v;
  }

  /*
   * ─ O NOME PRIMEIRO, porque foi ele que escapou ────────────────────────────────────────────────
   *
   * A cicatrização REESCREVE o nome com o marcador (não o nula: a coluna sustenta a tela e o
   * histórico), e a guarda de "há o que cicatrizar" tem de OLHAR o nome, senão a linha em que só o
   * nome voltou nunca é sequer tocada. Os dois são medidos: o primeiro pelo `set`, o segundo
   * AVALIANDO a guarda sobre a linha sintética.
   */
  const alvo = reguaDoAlvo(t);
  const marcadorDoAlvo = marcadorDoNome(alvo);
  if (!marcadorDoAlvo) {
    v.push(
      "ALVO_NAO_MARCA_O_NOME: a régua do prazo não grava mais um marcador em `nome`. O nome é dado pessoal, e sem a reescrita ele sobrevive inteiro ao expurgo.",
    );
  }
  const marcadorDaCicatriz = marcadorDoNome(cicatriz);
  if (!marcadorDaCicatriz) {
    v.push(
      "CICATRIZACAO_NAO_RESTAURA_O_NOME: a cicatrização não reescreve `nome`. A CTE existe para reparar quem o `editar` RE-IDENTIFICOU, e o `editar` grava o nome na MESMA instrução em que grava o CPF: quem reabre ficha expurgada digita o NOME de volta primeiro, porque é o campo de cima. Zerar os quatro campos e deixar o nome real é reparo que não repara.",
    );
  }
  if (marcadorDoAlvo && marcadorDaCicatriz && marcadorDoAlvo !== marcadorDaCicatriz) {
    v.push(
      "MARCADOR_DIVERGENTE: o marcador que a cicatrização grava não é o mesmo que a régua do prazo grava. O marcador tem de ser UMA constante compartilhada: divergindo, a base passa a ter dois marcadores e a guarda de uma das duas escritas nunca casa com o que a outra escreveu.",
    );
  }
  const marcadorConferido = marcadorNaGuarda(cicatriz);
  if (marcadorConferido && marcadorDoAlvo && marcadorConferido !== marcadorDoAlvo) {
    v.push(
      "MARCADOR_DIVERGENTE: a guarda da cicatrização compara o nome com um literal diferente do que o expurgo grava. Toda linha carimbada passa a satisfazer a guarda, e a passada reescreve a base inteira de hora em hora, para sempre.",
    );
  }

  const guarda = trechoDoWhere(cicatriz);
  const referencia = marcadorDoAlvo ?? marcadorDaCicatriz ?? "Candidato Expurgado";
  const alcancaSoONome = avaliarPredicado(guarda, linhaComSoONomeDeVolta(NOME_REAL_SINTETICO));
  if (alcancaSoONome !== true) {
    v.push(
      "CICATRIZACAO_NAO_ALCANCA_SO_O_NOME: a linha carimbada em que SÓ o nome voltou não satisfaz a guarda, então ela nunca é tocada. É o caso que mais importa, porque é o mais provável: o nome é o primeiro campo que alguém digita ao reabrir uma ficha.",
    );
  }
  const alcancaQuemJaEstaLimpo = avaliarPredicado(guarda, linhaJaLimpa(referencia));
  if (alcancaQuemJaEstaLimpo !== false) {
    v.push(
      "CICATRIZACAO_REESCREVE_A_BASE_INTEIRA: a linha JÁ LIMPA também satisfaz a guarda. A passada roda de hora em hora sobre toda a base de anonimizados, gravando por cima do que já está certo, e o custo cresce com a base inteira em vez de com o defeito.",
    );
  }

  const faltando = COLUNAS_PESSOAIS.filter((coluna) => !zeraColuna(cicatriz, coluna));
  if (faltando.length) {
    v.push(
      `CICATRIZACAO_INCOMPLETA: a cicatrização não zera ${faltando.join(", ")}. Apagar TRÊS dos quatro campos deixa o dado pessoal de pé com a aparência de anonimizado, que é o pior dos dois mundos: ninguém audita de novo uma linha que já consta como expurgada.`,
    );
  }

  if (/atualizado_em\s*=/.test(trechoDoSet(cicatriz))) {
    v.push(
      "CICATRIZACAO_TOCA_O_ULTIMO_MOVIMENTO: a cicatrização escreve `atualizado_em`. Ela roda sobre toda linha carimbada em toda passada, então o carimbo de último movimento passaria a dizer `agora` para gente que ninguém toca há anos.",
    );
  }
  if (/anonimizado_em\s*=/.test(trechoDoSet(cicatriz))) {
    v.push(
      "CICATRIZACAO_RECARIMBA_A_DATA: a cicatrização reescreve `anonimizado_em = now()`. Ela roda de hora em hora sobre todo mundo que já está carimbado, então a data em que o dado pessoal SAIU viraria sempre a de agora, e a prova da retenção se perderia.",
    );
  }

  /*
   * A CONTAGEM DO LOG SAI DA RÉGUA DO PRAZO, E SÓ DELA. A cicatrização alcança todo mundo que já
   * está carimbado, em TODA passada: somá-la faria o log anunciar um expurgo por hora, para sempre,
   * sem ninguém ter sido expurgado. É a propriedade que o arquivo de produção já garante hoje, e
   * que a mudança não pode derrubar de lado.
   */
  const cteDoPrazo = ctesDaConsulta(t).find(
    (c) => c.corpo.includes("update as_candidatos") && alcancaSoQuemNaoFoiAnonimizado(c.corpo),
  );
  const final = selectFinal(t);
  if (cteDoPrazo && final && !new RegExp(`from\\s+${cteDoPrazo.nome}\\b`).test(final)) {
    v.push(
      "CONTAGEM_NAO_SAI_DO_ALVO: a contagem que vai ao log não é lida da CTE do prazo. Contando as linhas cicatrizadas, o número passa a oscilar em toda passada sem ninguém ter sido expurgado, e o log deixa de servir para qualquer coisa.",
    );
  }
  return v;
}

// ── 3. A REFERÊNCIA E OS MUTANTES ───────────────────────────────────────────

const VIVAS_NO_SQL = SITUACOES_VIVAS.map((s) => `'${s}'`).join(", ");

/**
 * UMA implementação que cumpre o requisito do furo 1, escrita AQUI e não em produção.
 *
 * ELA NÃO É A IMPLEMENTAÇÃO ESPERADA. O requisito nomeia a propriedade, não o desenho, e quem
 * constrói pode escrever outra consulta que cumpra tudo (a queda dentro do `select`, por exemplo,
 * em vez de fora: `max()` de conjunto vazio é NULL nos dois lugares). Esta existe por um motivo só:
 * dar ao contrato um texto SABIDAMENTE CORRETO para aprovar, e uma base de onde derivar os mutantes
 * que ele tem de reprovar. Sem isso, "meu teste pega o defeito?" seria opinião.
 */
export const SQL_REFERENCIA_SEM_CANDIDATURA = sqlExecutavel(sql`
  with alvo as (
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
              and k.situacao in (${sql.raw(VIVAS_NO_SQL)})
              and (s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null))
     and coalesce(
           (select max(greatest(
                         k.atualizado_em,
                         coalesce(
                           case when k.situacao in (${sql.raw(VIVAS_NO_SQL)}) then v.encerrada_em end,
                           k.atualizado_em)))
              from as_candidaturas k
              join vagas v on v.id = k.vaga_id
             where k.candidato_id = c.id),
           greatest(c.criado_em, c.atualizado_em))
         <= now() - interval '2 years'
  returning c.id
  ),
  cicatriz as (
  update as_candidatos
     set nome = 'Candidato Expurgado',
         cpf = null,
         email = null,
         telefone = null,
         data_nascimento = null
   where anonimizado_em is not null
     and (nome <> 'Candidato Expurgado'
          or cpf is not null
          or email is not null
          or telefone is not null
          or data_nascimento is not null)
  ),
  identidades_apagadas as (
    delete from as_identidades_externas
     where candidato_id in (select id from alvo)
        or candidato_id in (select id from as_candidatos where anonimizado_em is not null)
  )
  select count(*)::int as n from alvo
`);

/** Um mutante: o que foi quebrado, o dano em produção, o texto quebrado e a regra que TEM de acusar. */
export interface MutanteDaQueda {
  nome: string;
  dano: string;
  sql: string;
  regraEsperada: string;
}

function trocar(de: string, para: string): string {
  const alvo = SQL_REFERENCIA_SEM_CANDIDATURA.toLowerCase();
  const i = alvo.indexOf(de.toLowerCase());
  if (i < 0) throw new Error(`Mutante impossível: "${de}" não está na referência do furo 1.`);
  return (
    SQL_REFERENCIA_SEM_CANDIDATURA.slice(0, i) +
    para +
    SQL_REFERENCIA_SEM_CANDIDATURA.slice(i + de.length)
  );
}

const QUEDA_REFERENCIA = "greatest(c.criado_em, c.atualizado_em)";
const MAX_REFERENCIA =
  `(select max(greatest( k.atualizado_em, coalesce( case when k.situacao in (${VIVAS_NO_SQL}) ` +
  `then v.encerrada_em end, k.atualizado_em))) from as_candidaturas k join vagas v on v.id = k.vaga_id ` +
  `where k.candidato_id = c.id)`;

export const MUTANTES_SEM_CANDIDATURA: MutanteDaQueda[] = [
  {
    nome: "1. o gate de candidatura volta",
    dano: "é o furo original: quem entra e não casa com vaga nenhuma nunca satisfaz o `exists`, o prazo nunca começa e o CPF fica retido para sempre.",
    sql: trocar(
      " and c.banco_talentos = false",
      " and c.banco_talentos = false and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)",
    ),
    regraEsperada: "GATE_DE_CANDIDATURA_PRESENTE",
  },
  {
    nome: "2. a queda some, e o relógio volta a ser só o `max` sobre candidaturas",
    dano: "o gate sai do `where` e o furo continua inteiro, escondido na nulidade: `max()` de conjunto vazio é NULL, e `NULL <= now() - interval` não é verdadeiro. Ninguém sem candidatura é alcançado, e agora sem nenhuma cláusula que denuncie o motivo.",
    sql: trocar(`coalesce( ${MAX_REFERENCIA}, ${QUEDA_REFERENCIA})`, MAX_REFERENCIA),
    regraEsperada: "RELOGIO_NAO_ALCANCA_QUEM_NAO_TEM_CANDIDATURA",
  },
  {
    nome: "3. a queda continua lendo `as_candidaturas`",
    dano: "parece correção e não é: a segunda expressão também devolve NULL para quem não tem candidatura nenhuma, então o prazo segue sem começar.",
    sql: trocar(
      QUEDA_REFERENCIA,
      "(select max(k.criado_em) from as_candidaturas k where k.candidato_id = c.id)",
    ),
    regraEsperada: "RELOGIO_NAO_ALCANCA_QUEM_NAO_TEM_CANDIDATURA",
  },
  {
    nome: "4. a queda conta só do `criado_em`",
    dano: "quem foi cadastrado há 2 anos e editado ontem nasce com o prazo já vencido e é anonimizado na varredura seguinte, sem carência nenhuma.",
    sql: trocar(QUEDA_REFERENCIA, "c.criado_em"),
    regraEsperada: "QUEDA_NAO_USA_O_ULTIMO_MOVIMENTO",
  },
  {
    nome: "5. a queda usa `least` em vez de `greatest`",
    dano: "a data de referência anda para TRÁS, e gente fica elegível MAIS CEDO do que ficaria antes da correção. Anonimizar antes da hora é irreversível.",
    sql: trocar(QUEDA_REFERENCIA, "least(c.criado_em, c.atualizado_em)"),
    regraEsperada: "QUEDA_ADIANTA_O_PRAZO",
  },
  {
    nome: "6. a queda vira uma data fixa no passado",
    dano: "todo mundo sem candidatura fica elegível NA HORA, inclusive quem se cadastrou ontem: a varredura seguinte apaga a base inteira de quem ainda não casou com vaga.",
    sql: trocar(QUEDA_REFERENCIA, "timestamptz '2000-01-01'"),
    regraEsperada: "RELOGIO_NAO_ALCANCA_QUEM_NAO_TEM_CANDIDATURA",
  },
  {
    nome: "7. o ramo de quem TEM candidatura perde o encerramento da vaga",
    dano: "a correção do furo 1 atropela a correção anterior: quem foi aprovado em 2024 numa vaga cancelada hoje fica elegível na hora.",
    sql: trocar(MAX_REFERENCIA, "(select max(k.atualizado_em) from as_candidaturas k where k.candidato_id = c.id)"),
    regraEsperada: "RAMO_DE_QUEM_TEM_CANDIDATURA_PERDEU_O_ENCERRAMENTO_DA_VAGA",
  },
  {
    nome: "8. o relógio passa a ser SÓ a queda: as candidaturas somem da conta",
    dano: "o prazo de todo mundo passa a correr das datas do cadastro, e quem tem processo encerrado recente é apagado por causa de um cadastro velho.",
    sql: trocar(MAX_REFERENCIA, QUEDA_REFERENCIA),
    regraEsperada: "RELOGIO_ESQUECEU_AS_CANDIDATURAS",
  },
  {
    nome: "9. o sinal da cláusula de banco se inverte",
    dano: "o expurgo anonimiza EXATAMENTE E SOMENTE quem está no banco de talentos, que é quem nunca poderia ser tocado. Irreversível, e um teste de `o expurgo funciona` fica verde porque alguém foi expurgado.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos = true"),
    regraEsperada: "RETENCAO_SENTIDO_INVERTIDO",
  },
  {
    nome: "10. a cláusula de banco vira `is not null`",
    dano: "a coluna é NOT NULL, então a condição é sempre verdadeira: a proteção some inteira sem nada falhar, e o nome da coluna continua no texto enganando a revisão de código.",
    sql: trocar("c.banco_talentos = false", "c.banco_talentos is not null"),
    regraEsperada: "RETENCAO_SENTIDO_INVERTIDO",
  },
  {
    nome: "11. a cláusula de banco some",
    dano: "candidato de banco passa a expirar como qualquer outro, e a decisão do diretor deixa de existir em silêncio. É o mesmo efeito do `is not null`.",
    sql: trocar(" and c.banco_talentos = false", ""),
    regraEsperada: "RETENCAO_NAO_LIDA",
  },
  {
    nome: "12. a proteção da vaga não encerrada some",
    dano: "quem está em processo vivo numa vaga aberta volta a ser alcançável, e o expurgo apaga gente EM PROCESSO.",
    sql: trocar(
      `not exists ( select 1 from as_candidaturas k join vagas v on v.id = k.vaga_id join as_vaga_status s on s.codigo = v.status where k.candidato_id = c.id and k.situacao in (${VIVAS_NO_SQL}) and (s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null))`,
      `not exists ( select 1 from as_candidaturas k where k.candidato_id = c.id and k.situacao in (${VIVAS_NO_SQL}) and false)`,
    ),
    regraEsperada: "PROTECAO_SEM_CATALOGO",
  },
  {
    nome: "13. a exceção da ENTREGA some da proteção",
    dano: "quem FOI CONTRATADO passa a ser expurgado do lado de A&S, enquanto o CPF dele segue na ADMISSÃO: destrói o histórico da seleção e não minimiza dado nenhum.",
    sql: trocar(" or s.papel = 'ENTREGA'", ""),
    regraEsperada: "PROTECAO_PERDEU_A_ENTREGA",
  },
  {
    nome: "14. o fail-closed da vaga sem carimbo some",
    dano: "vaga marcada como encerrada sem `encerrada_em` passa a valer como prazo já vencido, e quem estava dentro dela é apagado sem carência.",
    sql: trocar(" or v.encerrada_em is null", ""),
    regraEsperada: "PROTECAO_PERDEU_O_FAIL_CLOSED",
  },
  {
    nome: "15. o prazo encolhe",
    dano: "o prazo do diretor é de 2 anos. Encolhido, o expurgo alcança gente que o time viu no mês passado.",
    sql: trocar("interval '2 years'", "interval '2 days'"),
    regraEsperada: "REGRESSAO_PRAZO",
  },
  {
    nome: "17. a cicatrização some",
    dano: "a linha re-identificada por uma edição que escape da recusa fica com dado pessoal de volta E com `anonimizado_em` preenchido: a régua do prazo nunca mais volta nela, e a re-identificação vira permanente e silenciosa.",
    sql: trocar(
      " cicatriz as ( update as_candidatos set nome = 'Candidato Expurgado', cpf = null, email = null, telefone = null, data_nascimento = null where anonimizado_em is not null and (nome <> 'Candidato Expurgado' or cpf is not null or email is not null or telefone is not null or data_nascimento is not null) ),",
      "",
    ),
    regraEsperada: "SEM_CICATRIZACAO_DA_PII",
  },
  {
    nome: "18. a cicatrização esquece o telefone",
    dano: "três dos quatro campos saem e a linha continua com telefone, com a aparência de anonimizada. Ninguém audita de novo uma linha que já consta como expurgada.",
    sql: trocar(" telefone = null, data_nascimento = null where anonimizado_em", " data_nascimento = null where anonimizado_em"),
    regraEsperada: "CICATRIZACAO_INCOMPLETA",
  },
  {
    nome: "19. a cicatrização recarimba a data da anonimização",
    dano: "ela roda de hora em hora sobre todo mundo que já está carimbado, então a data em que o dado pessoal saiu vira sempre a de agora e a prova da retenção se perde.",
    sql: trocar(
      " data_nascimento = null where anonimizado_em is not null",
      " data_nascimento = null, anonimizado_em = now() where anonimizado_em is not null",
    ),
    regraEsperada: "CICATRIZACAO_RECARIMBA_A_DATA",
  },
  {
    nome: "20. a contagem do log passa a sair da cicatrização",
    dano: "a cicatrização alcança todo mundo que já está carimbado, em toda passada: o log anunciaria um expurgo por hora, para sempre, sem ninguém ter sido expurgado.",
    sql: trocar("select count(*)::int as n from alvo", "select count(*)::int as n from cicatriz"),
    regraEsperada: "CONTAGEM_NAO_SAI_DO_ALVO",
  },
  {
    nome: "21. a cicatrização deixa o NOME de fora",
    dano: "é o furo que o `seguranca` mediu contra o banco: linha carimbada, quatro campos nulos e o nome real de volta sai da passada com o nome intacto. O `editar` grava o nome na mesma instrução do CPF, e quem reabre ficha expurgada digita o nome primeiro.",
    sql: trocar(" set nome = 'Candidato Expurgado', cpf = null, email = null, telefone = null, data_nascimento = null where anonimizado_em is not null", " set cpf = null, email = null, telefone = null, data_nascimento = null where anonimizado_em is not null"),
    regraEsperada: "CICATRIZACAO_NAO_RESTAURA_O_NOME",
  },
  {
    nome: "22. a guarda de `há o que cicatrizar` não olha o nome",
    dano: "o caso que escapa INTEIRO: a linha em que só o nome voltou não satisfaz a guarda, então ela nunca é nem tocada, e o `set` mais completo do mundo não a alcança.",
    sql: trocar("(nome <> 'Candidato Expurgado' or cpf is not null", "(cpf is not null"),
    regraEsperada: "CICATRIZACAO_NAO_ALCANCA_SO_O_NOME",
  },
  {
    nome: "23. o marcador GRAVADO pela cicatrização diverge do marcador do expurgo",
    dano: "a base passa a ter dois marcadores, e a guarda de uma das duas escritas deixa de casar com o que a outra escreveu.",
    sql: trocar(" set nome = 'Candidato Expurgado', cpf = null, email = null", " set nome = 'Candidato Anonimizado', cpf = null, email = null"),
    regraEsperada: "MARCADOR_DIVERGENTE",
  },
  {
    nome: "24. o marcador CONFERIDO pela guarda diverge do marcador do expurgo",
    dano: "toda linha carimbada passa a satisfazer a guarda, e a passada reescreve a base inteira de anonimizados de hora em hora, para sempre.",
    sql: trocar("(nome <> 'Candidato Expurgado' or cpf is not null", "(nome <> 'Candidato Anonimizado' or cpf is not null"),
    regraEsperada: "MARCADOR_DIVERGENTE",
  },
  {
    nome: "25. a guarda vira sempre verdadeira",
    dano: "sem o `há o que cicatrizar`, a passada grava por cima de toda a base de anonimizados a cada hora: o custo passa a crescer com a base, e não com o defeito.",
    sql: trocar(" and (nome <> 'Candidato Expurgado' or cpf is not null or email is not null or telefone is not null or data_nascimento is not null)", ""),
    regraEsperada: "CICATRIZACAO_REESCREVE_A_BASE_INTEIRA",
  },
  {
    nome: "26. a cicatrização carimba `atualizado_em`",
    dano: "ela roda sobre toda linha carimbada em toda passada, então o último movimento passa a dizer `agora` para gente que ninguém toca há anos.",
    sql: trocar(" data_nascimento = null where anonimizado_em is not null", " data_nascimento = null, atualizado_em = now() where anonimizado_em is not null"),
    regraEsperada: "CICATRIZACAO_TOCA_O_ULTIMO_MOVIMENTO",
  },
  {
    nome: "16. a guarda de quem já foi anonimizado some",
    dano: "a varredura reescreve de hora em hora quem já foi expurgado, e a data em que o dado pessoal saiu vira sempre a de agora: perde-se a prova.",
    sql: trocar(" where c.anonimizado_em is null and", " where"),
    regraEsperada: "REGRESSAO_SEM_GUARDA_DE_JA_ANONIMIZADO",
  },
];

/** Reexportado para o spec ler a consulta de produção pelo mesmo caminho do vizinho. */
export { clausulasDoWhere };
