import { sql } from "drizzle-orm";
import { sqlExecutavel } from "./retencao-lgpd.tester-fake";
import {
  avaliarPredicado,
  ctesDaConsulta,
  marcadorDoNome,
  reguaDoAlvo,
  selectFinal,
} from "./retencao-sem-candidatura.tester-fake";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA O FURO 3: O TEXTO LIVRE SOBREVIVIA À ANONIMIZAÇÃO ───────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é o mesmo dos dois arquivos
 * vizinhos, e pelo mesmo motivo registrado neles: nome que ninguém mais escolheria é a trava mais
 * barata contra dois agentes gravarem o mesmo arquivo em silêncio.
 *
 * ┌─ O BURACO QUE ESTE ARQUIVO FECHA, E ELE FOI MEDIDO, NÃO DEDUZIDO ──────────────────────────┐
 * │ As CTEs `contatos_expurgados` e `motivos_expurgados` nasceram SEM COBERTURA, e o `backend`   │
 * │ declarou isso. O motivo é estrutural: todo o contrato de forma que protege o expurgo ancora  │
 * │ no `update as_candidatos` do `alvo` e afirma sobre as cláusulas do `where` DELE. As duas     │
 * │ CTEs novas escrevem em OUTRAS TABELAS, então ficam inteiramente fora do alcance dele.        │
 * │                                                                                             │
 * │ MEDIDO: apagadas as duas CTEs do arquivo de produção, a suíte de retenção inteira (91        │
 * │ testes, quatro arquivos) continuou VERDE. O terceiro furo de LGPD podia ser reaberto por     │
 * │ refatoração sem uma única linha vermelha.                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A BOMBA DE ORDENAÇÃO, e ela é a razão de CADA leitura deste arquivo ser por PREDICADO ─────┐
 * │ A instrução tem hoje QUATRO escritas (o `alvo`, a cicatrização do dado pessoal, o resumo do  │
 * │ contato e o motivo de descarte), e a ORDEM das CTEs é escolha de quem constrói, nunca        │
 * │ requisito. Contrato que lê "a terceira CTE" ou "o segundo update" reprova implementação      │
 * │ CORRETA no dia em que alguém reordenar, e é assim que um acusador vira ruído que o time      │
 * │ aprende a ignorar, justamente no arquivo mais perigoso da base.                              │
 * │                                                                                             │
 * │ ENTÃO NADA AQUI É LIDO POR POSIÇÃO. Cada CTE é achada pelo que ELA FAZ (a tabela em que      │
 * │ escreve), e as afirmações recaem sobre O PEDAÇO CERTO do `where` dela. O contrato é          │
 * │ exercitado contra uma referência REORDENADA e contra uma referência com as CTEs RENOMEADAS,  │
 * │ e tem de aprovar as duas: é a prova de que ele não depende nem da ordem nem do nome.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal entra aqui. O que se lê é o TEXTO de uma consulta, nunca o resultado, e
 * as linhas sintéticas carregam frases inventadas, sem telefone, sem e-mail, sem CPF e sem dono.
 */

// ── 1. ACHAR CADA CTE PELO QUE ELA FAZ ──────────────────────────────────────

/**
 * A CTE que ESCREVE na tabela dada, achada pelo `update`, e nunca pela posição nem pelo nome.
 *
 * `update <tabela>` e não a simples menção da tabela: `as_candidaturas` é LIDA pelas subconsultas
 * do `alvo` e do relógio, e procurar o nome dela devolveria a CTE do prazo, fazendo todas as
 * afirmações seguintes caírem sobre o bloco errado e ficarem verdes com o furo aberto.
 */
export function cteQueEscreveEm(
  sqlTexto: string,
  tabela: string,
): { nome: string; corpo: string } | null {
  const re = new RegExp(`\\bupdate\\s+${tabela}\\b`);
  return ctesDaConsulta(sqlTexto.toLowerCase()).find((c) => re.test(c.corpo)) ?? null;
}

/** A CTE que APAGA linhas da tabela dada, se houver. Serve para distinguir "não fez" de "apagou". */
export function cteQueApagaDe(sqlTexto: string, tabela: string): { nome: string } | null {
  const re = new RegExp(`\\bdelete\\s+from\\s+${tabela}\\b`);
  return ctesDaConsulta(sqlTexto.toLowerCase()).find((c) => re.test(c.corpo)) ?? null;
}

/** O primeiro ` where ` de PROFUNDIDADE ZERO do corpo: o da escrita, não o das subconsultas. */
function indiceDoWhere(corpo: string): number {
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (profundidade === 0 && corpo.startsWith(" where ", i)) return i;
  }
  return -1;
}

/** O `set` da escrita: o que vai ser gravado, sem o `where` que decide em quem. */
export function setDaEscrita(corpo: string): string {
  const b = corpo.toLowerCase();
  const i = b.indexOf(" set ");
  if (i < 0) return "";
  const fim = indiceDoWhere(b);
  return b.slice(i + " set ".length, fim < 0 ? b.length : fim).trim();
}

/** O `where` da escrita: quem ela alcança, mais a guarda de "há o que expurgar". */
export function whereDaEscrita(corpo: string): string {
  const b = corpo.toLowerCase();
  const i = indiceDoWhere(b);
  return i < 0 ? "" : b.slice(i + " where ".length).trim();
}

/** As cláusulas de topo de um predicado, partidas no ` and ` de profundidade zero. */
export function clausulasDeTopo(predicado: string): string[] {
  const pedacos: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < predicado.length; i += 1) {
    const c = predicado[i];
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (profundidade === 0 && predicado.startsWith(" and ", i)) {
        pedacos.push(atual.trim());
        atual = "";
        i += " and ".length - 1;
        continue;
      }
    }
    atual += c;
  }
  if (atual.trim()) pedacos.push(atual.trim());
  return pedacos;
}

/**
 * ─ AS DUAS METADES DE UM `where` DE EXPURGO, SEPARADAS ─────────────────────────────────────────
 *
 * A separação existe porque as duas metades respondem a perguntas DIFERENTES, e misturá-las é o
 * falso positivo mais provável deste arquivo:
 *   . o ALCANCE diz EM QUEM se escreve (o `alvo` desta passada mais quem já está carimbado);
 *   . a GUARDA diz SE HÁ O QUE ESCREVER (sem ela, a passada reescreve a base inteira de hora em
 *     hora, para sempre, sem nenhuma mudança de valor).
 * Uma afirmação sobre "o where" fica verde com o alcance certo e a guarda destruída, e vice-versa.
 *
 * O critério de partição é a presença de SUBCONSULTA: quem decide em quem se escreve precisa ler
 * outra tabela (as listas `alvo` e `ja_anonimizados`); a guarda olha a coluna da própria linha.
 */
export function alcanceDaEscrita(corpo: string): string {
  return clausulasDeTopo(whereDaEscrita(corpo))
    .filter((c) => /\bselect\b/.test(c))
    .join(" and ");
}

export function guardaDaEscrita(corpo: string): string {
  return clausulasDeTopo(whereDaEscrita(corpo))
    .filter((c) => !/\bselect\b/.test(c))
    .join(" and ");
}

/** O literal que a escrita grava numa coluna, se ela gravar algum literal. */
export function literalGravado(corpo: string, coluna: string): string | null {
  const m = new RegExp(`\\b${coluna}\\s*=\\s*'([^']*)'`).exec(setDaEscrita(corpo));
  return m ? m[1] : null;
}

/** O literal com que a guarda COMPARA uma coluna, se ela comparar com algum. */
export function literalNaGuarda(corpo: string, coluna: string): string | null {
  const m = new RegExp(
    `\\b${coluna}\\s*(?:<>|!=|is\\s+distinct\\s+from)\\s*'([^']*)'`,
  ).exec(guardaDaEscrita(corpo));
  return m ? m[1] : null;
}

/** "A escrita NULA esta coluna", em qualquer das formas que o Postgres aceita. */
export function nulaColuna(corpo: string, coluna: string): boolean {
  return new RegExp(`\\b${coluna}\\s*=\\s*null\\b`).test(setDaEscrita(corpo));
}

/** "A escrita toca esta coluna de algum jeito". */
export function tocaColuna(corpo: string, coluna: string): boolean {
  return new RegExp(`\\b${coluna}\\s*=`).test(setDaEscrita(corpo));
}

/**
 * O ALCANCE COBRE AS DUAS POPULAÇÕES?
 *
 * A pergunta é semântica e tem DUAS respostas certas para a segunda metade: a lista `alvo` desta
 * passada, e quem JÁ está carimbado. A segunda pode vir pelo nome da CTE que a materializa OU por
 * uma subconsulta escrita ali mesmo, e as duas cumprem o requisito: o que não pode é a escrita
 * alcançar só o `alvo`, porque a varredura NUNCA volta a uma linha carimbada e o que foi escrito
 * DEPOIS da anonimização ficaria retido para sempre, em silêncio.
 */
export function alcancaOAlvo(corpo: string): boolean {
  return /\balvo\b/.test(alcanceDaEscrita(corpo));
}

export function alcancaOsJaAnonimizados(corpo: string): boolean {
  const a = alcanceDaEscrita(corpo);
  return /\bja_anonimizados\b/.test(a) || /anonimizado_em\s+is\s+not\s+null/.test(a);
}

// ── 2. AS LINHAS SINTÉTICAS (§A.6) ──────────────────────────────────────────

/**
 * §A.6: frases INVENTADAS, sem telefone, sem e-mail, sem CPF e sem dono. Elas existem só para que a
 * guarda seja AVALIADA em vez de lida, e nunca saem deste arquivo.
 *
 * Em MINÚSCULAS de propósito: o contrato lê o SQL em caixa baixa, e a comparação com o marcador
 * gravado precisa ser feita no mesmo referencial.
 */
export const RESUMO_SINTETICO = "contato de teste sintetico sem dado de ninguem";
export const MOTIVO_SINTETICO = "motivo de teste sintetico sem dado de ninguem";

/** Um contato cujo texto livre AINDA está lá. A passada TEM de alcançá-lo. */
export function linhaComTextoLivre(): Record<string, string | null> {
  return { resumo: RESUMO_SINTETICO };
}

/** Um contato JÁ expurgado. A passada NÃO pode tocá-lo de novo. */
export function linhaComResumoJaExpurgado(marcador: string): Record<string, string | null> {
  return { resumo: marcador };
}

/** Uma candidatura cujo motivo de descarte AINDA está lá. */
export function linhaComMotivo(): Record<string, string | null> {
  return { motivo_descarte: MOTIVO_SINTETICO };
}

/** Uma candidatura que já saiu sem motivo registrado. A passada NÃO pode tocá-la. */
export function linhaSemMotivo(): Record<string, string | null> {
  return { motivo_descarte: null };
}

/**
 * Um evento do histórico que AINDA tem o motivo digitado, e que carrega a TRILHA DO ACEITE.
 *
 * O aceite vai na linha sintética de propósito: é ele que não pode ser expurgado, e tê-lo aqui
 * deixa visível, no ponto da avaliação, que a guarda olha o `motivo` e nunca o aceite.
 */
export function linhaComMotivoNoHistorico(): Record<string, string | null> {
  return { motivo: MOTIVO_SINTETICO, aceite: "guarda-sintetica-de-teste" };
}

/** Um evento do histórico já expurgado, com a trilha do aceite intacta. Não pode ser tocado. */
export function linhaSemMotivoNoHistorico(): Record<string, string | null> {
  return { motivo: null, aceite: "guarda-sintetica-de-teste" };
}

// ── 3. O CONTRATO DO FURO 3, EM REGRAS NOMEADAS ─────────────────────────────

/**
 * Devolve a lista das VIOLAÇÕES. Vazia é o contrato cumprido. Cada regra carrega, na própria
 * string, o dano que ela causa em produção: é essa frase que alguém vai ler no vermelho.
 *
 * ELE NÃO REPETE O CONTRATO VIZINHO. A régua do prazo, a proteção do banco de talentos, a proteção
 * da vaga não encerrada, o relógio e a cicatrização do dado pessoal continuam cobrados por
 * `violacoesDaRetencaoSemCandidatura`. O que se afirma aqui é SÓ o terceiro furo, mais as duas
 * propriedades que ele não pode derrubar de lado (a contagem do log e o relógio do expurgo).
 */
export function violacoesDoTextoLivre(sqlTexto: string): string[] {
  const v: string[] = [];
  const t = sqlTexto.toLowerCase();

  v.push(...violacoesDoResumoDoContato(t));
  v.push(...violacoesDoMotivoDeDescarte(t));
  v.push(...violacoesDoMotivoDoHistorico(t));
  v.push(...violacoesDaContagem(t));
  return v;
}

/**
 * ─ O MOTIVO NO HISTÓRICO: A CÓPIA DO MESMO TEXTO, NA TABELA AO LADO ────────────────────────────
 *
 * ┌─ POR QUE ESTA TERCEIRA ESCRITA EXISTE, e ela não é escopo novo ─────────────────────────────┐
 * │ `gravarSaidaDaCandidatura` (`encerrar-candidatura.ts`) escreve a MESMA STRING nos dois        │
 * │ lugares, na MESMA transação: `as_candidaturas.motivo_descarte` e `as_candidatura_etapas.      │
 * │ motivo`. O schema diz, com todas as letras, que a repetição é PROPOSITAL (a candidatura       │
 * │ guarda o motivo do desfecho ATUAL, sobrescrito numa reentrada; o histórico guarda o motivo    │
 * │ DAQUELE evento, que continua verdadeiro depois).                                              │
 * │                                                                                               │
 * │ NULAR NUM LUGAR E DEIXAR A CÓPIA NO OUTRO É MINIMIZAÇÃO APARENTE, que é exatamente o defeito  │
 * │ que a CTE do `motivo_descarte` existe para fechar: a frase digitada sobrevive à anonimização  │
 * │ na tabela ao lado, e nada falha do ponto de vista do serviço. Pior: a varredura NUNCA volta a │
 * │ uma linha carimbada, então nenhuma passada futura alcança aquele texto.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E AQUI MORA UMA COISA QUE NÃO PODE SER EXPURGADA, na MESMA tabela ─────────────────────────┐
 * │ `aceite` e `aceite_numero` são a TRILHA DO ACEITE DE PASSAGEM (§A.3 regra 8), e a §A.6 exige │
 * │ que ela seja PERMANENTE E CONSULTÁVEL. Elas não são dado pessoal: são um nome de guarda, um  │
 * │ lado e um número, com o autor saindo de `por_id`, que é usuário INTERNO. O recorte está       │
 * │ escrito no schema e foi exigido pela auditoria de segurança.                                  │
 * │                                                                                               │
 * │ O ERRO QUE A PRÓXIMA PESSOA VAI COMETER É APAGÁ-LAS JUNTO, POR SIMETRIA: a mão que escreve   │
 * │ `motivo = null` está a três colunas de `aceite`, na mesma tabela, no mesmo `set`, e "já que   │
 * │ estamos limpando o histórico" é a frase mais natural do mundo. O dano é o oposto do que a     │
 * │ limpeza quer: apaga-se a prova de que alguém passou por cima de um aviso, que é a decisão     │
 * │ mais cara de desfazer do módulo, e não se minimiza dado nenhum, porque ali não há dado        │
 * │ pessoal para minimizar. Por isso a regra tem mutante próprio.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function violacoesDoMotivoDoHistorico(t: string): string[] {
  const v: string[] = [];
  const cte = cteQueEscreveEm(t, "as_candidatura_etapas");

  if (!cte) {
    if (cteQueApagaDe(t, "as_candidatura_etapas")) {
      v.push(
        "HISTORICO_APAGADO_EM_VEZ_DE_EXPURGADO: a varredura APAGA a linha do histórico em vez de nular o texto. Ela leva junto o que aconteceu (a etapa, o desfecho, quem decidiu e quando) e, principalmente, a TRILHA DO ACEITE, que a §A.6 exige permanente e consultável. Só o `motivo` é dado pessoal ali; o resto é fato de processo.",
      );
      return v;
    }
    v.push(
      "SEM_EXPURGO_DO_MOTIVO_DO_HISTORICO: a varredura não toca `as_candidatura_etapas.motivo`. `gravarSaidaDaCandidatura` escreve a MESMA string nesta coluna e em `as_candidaturas.motivo_descarte`, na mesma transação, e o schema diz que a repetição é proposital. Nular uma e deixar a cópia é minimização APARENTE: a frase digitada sobrevive à anonimização na tabela ao lado, e a varredura nunca volta a uma linha carimbada para consertar.",
    );
    return v;
  }

  // ── A LINHA QUE PREOCUPA MAIS DO QUE A PRÓPRIA CTE ───────────────────────
  for (const coluna of ["aceite", "aceite_numero"]) {
    if (tocaColuna(cte.corpo, coluna)) {
      v.push(
        `ACEITE_EXPURGADO: a escrita toca \`${coluna}\`, que é a TRILHA DO ACEITE DE PASSAGEM (§A.3 regra 8) e a §A.6 exige PERMANENTE E CONSULTÁVEL. Ela não é dado pessoal: é um nome de guarda, um lado e um número, com o autor saindo de \`por_id\`, que é usuário INTERNO. Apagá-la por simetria com o \`motivo\` destrói a prova de que alguém passou por cima de um aviso, que é a decisão mais cara de desfazer do módulo, e não minimiza dado nenhum, porque ali não há dado pessoal para minimizar.`,
      );
    }
  }

  // Nenhum outro carimbo do evento se mexe: `ocorrido_em` e `criado_em` dizem QUANDO o fato
  // aconteceu, e reescrevê-los de hora em hora moveria o evento no tempo. `as_candidatura_etapas`
  // não tem `atualizado_em`, e a regra cobre os três para que ela sobreviva a uma coluna nova.
  for (const coluna of ["ocorrido_em", "criado_em", "atualizado_em"]) {
    if (tocaColuna(cte.corpo, coluna)) {
      v.push(
        `HISTORICO_TOCA_O_CARIMBO_DO_EVENTO: a escrita grava \`${coluna}\`. A CTE roda sobre todo evento de todo anonimizado em TODA passada, então o carimbo do fato passaria a dizer \`agora\` para coisa que aconteceu há anos, e a ordem real dos eventos se perderia.`,
      );
    }
  }

  if (!nulaColuna(cte.corpo, "motivo")) {
    const marcador = literalGravado(cte.corpo, "motivo");
    if (marcador) {
      v.push(
        "HISTORICO_COM_MARCADOR_EM_VEZ_DE_NULO: a escrita grava um marcador em `as_candidatura_etapas.motivo`, e a coluna é ANULÁVEL. Ela é a cópia do `motivo_descarte` e segue a MESMA régua dele: nulo já significa `sem motivo registrado`, e um marcador inventaria um terceiro estado que as telas de histórico passariam a EXIBIR como se fosse o motivo do evento.",
      );
    } else {
      v.push(
        "HISTORICO_NAO_E_NULADO: a escrita não nula `as_candidatura_etapas.motivo`. O texto livre do desfecho segue inteiro no histórico depois da anonimização.",
      );
    }
  }

  v.push(
    ...violacoesDoAlcance(cte.corpo, {
      semAlvo:
        "HISTORICO_NAO_ALCANCA_O_ALVO: a escrita não alcança quem está sendo anonimizado AGORA. O motivo digitado fica inteiro no histórico de quem acabou de ter o CPF nulado, e a passada seguinte também não o alcança.",
      semJaAnonimizados:
        "HISTORICO_NAO_ALCANCA_OS_JA_ANONIMIZADOS: a escrita alcança só o `alvo` da passada. A varredura NUNCA volta a uma linha carimbada, então evento gravado DEPOIS da anonimização (uma reentrada, uma reabertura de vaga) ou antes desta correção existir fica retido PARA SEMPRE, em silêncio.",
    }),
  );

  const guarda = guardaDaEscrita(cte.corpo);
  if (!guarda) {
    v.push(
      "HISTORICO_REESCREVE_A_BASE_INTEIRA: não há guarda de `há o que expurgar`. A passada roda de hora em hora sobre TODO evento de TODA pessoa já anonimizada, gravando nulo por cima de nulo, e esta é a tabela que mais cresce do módulo: um evento por movimento de etapa, por pessoa, por vaga.",
    );
  } else {
    if (avaliarPredicado(guarda, linhaComMotivoNoHistorico()) !== true) {
      v.push(
        "HISTORICO_NAO_ALCANCA_O_TEXTO_LIVRE: o evento que AINDA tem o motivo digitado não satisfaz a guarda, então ele nunca é nem tocado.",
      );
    }
    if (avaliarPredicado(guarda, linhaSemMotivoNoHistorico()) !== false) {
      v.push(
        "HISTORICO_REESCREVE_A_BASE_INTEIRA: o evento que já está sem motivo também satisfaz a guarda. A passada grava nulo por cima de nulo em todo o histórico de toda pessoa anonimizada, a cada hora.",
      );
    }
  }
  return v;
}

/** O resumo do contato: a linha FICA, o texto some, e o marcador é o DELE, não o do nome. */
function violacoesDoResumoDoContato(t: string): string[] {
  const v: string[] = [];
  const cte = cteQueEscreveEm(t, "as_contatos");

  if (!cte) {
    if (cteQueApagaDe(t, "as_contatos")) {
      v.push(
        "CONTATO_APAGADO_EM_VEZ_DE_EXPURGADO: a varredura APAGA a linha do contato em vez de substituir o texto. O `tipo`, o `ocorrido_em` e o `registrado_por_id` são fato de PROCESSO (houve ligação naquele dia, feita por aquele consultor), da mesma natureza das candidaturas que a linha do candidato preserva. Apagar destrói a prova de que o trabalho aconteceu, e a leitura de esforço da candidatura junto, sem minimizar NADA além do que a substituição do texto já minimiza.",
      );
      return v;
    }
    v.push(
      "SEM_EXPURGO_DO_RESUMO: a varredura não toca `as_contatos.resumo`. É o terceiro furo inteiro: o que o consultor DIGITA continua sendo dado pessoal, e é onde ele aparece na prática (o telefone que alguém anotou na frase, o nome do parente com quem se falou). Nular o CPF e deixar isso na linha ao lado é minimização APARENTE: a pessoa continua identificável e localizável, e nada falha.",
    );
    return v;
  }

  // ── O MODO DE FALHA MAIS CARO DOS DOIS ARQUIVOS ──────────────────────────
  //
  // `as_contatos.resumo` é NOT NULL (`db/schema/tables.ts`). Um `set resumo = null` não expurga
  // errado: ele DERRUBA A INSTRUÇÃO INTEIRA com violação de NOT NULL, e a instrução é UMA só. Cai
  // junto o expurgo do `alvo`, a cicatrização do dado pessoal, o apagamento das identidades
  // externas e o motivo de descarte. A varredura que morre é a varredura que não expurga NINGUÉM,
  // e ela morre de hora em hora, em silêncio, virando uma linha de log que ninguém lê.
  if (nulaColuna(cte.corpo, "resumo")) {
    v.push(
      "RESUMO_NULADO_EM_COLUNA_NOT_NULL: a escrita faz `resumo = null`, e a coluna é NOT NULL. Isso não expurga errado, DERRUBA A VARREDURA INTEIRA: a instrução é uma só, então caem junto o expurgo do prazo, a cicatrização do dado pessoal e o apagamento das identidades externas. Ninguém é expurgado nunca mais, de hora em hora, sem nada falhar do ponto de vista do serviço.",
    );
  }

  const marcadorDoResumo = literalGravado(cte.corpo, "resumo");
  if (!marcadorDoResumo) {
    if (!nulaColuna(cte.corpo, "resumo")) {
      v.push(
        "RESUMO_SEM_MARCADOR: a escrita não grava um marcador em `resumo`. A coluna é NOT NULL, então o expurgo aqui é SUBSTITUIÇÃO por um texto fixo, e não anulação.",
      );
    }
  } else {
    const marcadorDoNomeNoAlvo = marcadorDoNome(reguaDoAlvo(t));
    if (marcadorDoNomeNoAlvo && marcadorDoResumo === marcadorDoNomeNoAlvo.toLowerCase()) {
      v.push(
        "MARCADOR_DO_RESUMO_CONFUNDIDO_COM_O_DO_NOME: o resumo do contato recebe o MESMO marcador que o nome do candidato. São constantes separadas de propósito, porque são campos de naturezas diferentes lidos em TELAS diferentes: um é o nome de uma pessoa na lista, o outro é o resumo de uma ligação no histórico da candidatura. Com um marcador só, a linha do histórico passa a dizer o marcador do NOME onde se espera a frase do contato, e quem ler a tela conclui que o campo foi preenchido errado, e não que ele foi expurgado.",
      );
    }
    const conferido = literalNaGuarda(cte.corpo, "resumo");
    if (conferido && conferido !== marcadorDoResumo) {
      v.push(
        "MARCADOR_DO_RESUMO_DIVERGENTE: a guarda compara `resumo` com um literal diferente do que a escrita grava. A divergência não falha, ela escolhe um de dois lados ruins: ou a guarda nunca casa com o que foi escrito e TODO contato de TODA pessoa anonimizada é reescrito a cada hora, para sempre, ou ela casa com o texto errado e a linha que precisa ser limpa nunca é alcançada. O marcador tem de ser UMA constante, interpolada nos dois lugares.",
      );
    }
  }

  v.push(
    ...violacoesDoAlcance(cte.corpo, {
      semAlvo:
        "RESUMO_NAO_ALCANCA_O_ALVO: a escrita não alcança quem está sendo anonimizado AGORA. O texto livre de quem acabou de ser expurgado fica inteiro na linha ao lado do CPF nulado.",
      semJaAnonimizados:
        "RESUMO_NAO_ALCANCA_OS_JA_ANONIMIZADOS: a escrita alcança só o `alvo` da passada. A varredura NUNCA volta a uma linha carimbada, então contato registrado DEPOIS da anonimização (ou antes desta correção existir) fica retido PARA SEMPRE, em silêncio. É o mesmo argumento que já obriga a cicatrização do dado pessoal e o apagamento das identidades externas a olharem as duas populações.",
    }),
  );

  const guarda = guardaDaEscrita(cte.corpo);
  const referencia = marcadorDoResumo ?? "resumo expurgado";
  if (!guarda) {
    v.push(
      "RESUMO_REESCREVE_A_BASE_INTEIRA: não há guarda de `há o que expurgar`. A passada roda de hora em hora sobre TODO contato de TODA pessoa já anonimizada, gravando por cima do que já está certo: o custo passa a crescer com a base, e não com o defeito.",
    );
  } else {
    if (avaliarPredicado(guarda, linhaComTextoLivre()) !== true) {
      v.push(
        "RESUMO_NAO_ALCANCA_O_TEXTO_LIVRE: o contato que AINDA tem a frase digitada não satisfaz a guarda, então ele nunca é nem tocado. O `set` mais correto do mundo não alcança a linha que a guarda deixou de fora.",
      );
    }
    if (avaliarPredicado(guarda, linhaComResumoJaExpurgado(referencia)) !== false) {
      v.push(
        "RESUMO_REESCREVE_A_BASE_INTEIRA: o contato JÁ expurgado também satisfaz a guarda. A passada roda de hora em hora sobre toda a base de anonimizados, gravando por cima do que já está certo.",
      );
    }
  }
  return v;
}

/** O motivo de descarte: vai a NULO, e o nulo é uma DECISÃO, não um detalhe. */
function violacoesDoMotivoDeDescarte(t: string): string[] {
  const v: string[] = [];
  const cte = cteQueEscreveEm(t, "as_candidaturas");

  if (!cte) {
    v.push(
      "SEM_EXPURGO_DO_MOTIVO: a varredura não toca `as_candidaturas.motivo_descarte`. É texto livre digitado pelo operador, da mesma natureza do resumo do contato e com a mesma exposição: a frase sobrevive à anonimização e mantém identificável quem já teve o CPF nulado.",
    );
    return v;
  }

  // ── A DECISÃO DE FORMA QUE ESTE BLOCO TRAVA ──────────────────────────────
  //
  // A coluna é ANULÁVEL, e nula JÁ QUER DIZER ALGUMA COISA no vocabulário da tabela: "saiu sem
  // motivo registrado". É o estado em que a candidatura NASCE e o estado para o qual
  // `restaurar-candidatura` a devolve. Um marcador aqui inventaria um TERCEIRO estado, que toda
  // tela que testa `motivoDescarte &&` passaria a EXIBIR, e o marcador apareceria na tela COMO SE
  // FOSSE o motivo pelo qual a pessoa foi descartada. A assimetria com o `resumo` (que recebe
  // marcador) não é inconsistência: lá a coluna é NOT NULL e não há nulo para gravar.
  if (!nulaColuna(cte.corpo, "motivo_descarte")) {
    const marcador = literalGravado(cte.corpo, "motivo_descarte");
    if (marcador) {
      v.push(
        "MOTIVO_COM_MARCADOR_EM_VEZ_DE_NULO: a escrita grava um marcador em `motivo_descarte`, e a coluna é ANULÁVEL. Nulo já significa `saiu sem motivo registrado` no vocabulário da tabela, que é o estado em que a candidatura nasce e para onde `restaurar-candidatura` a devolve. O marcador inventa um TERCEIRO estado, que toda tela que testa `motivoDescarte &&` passa a EXIBIR, e ele aparece na tela como se fosse o motivo do descarte.",
      );
    } else {
      v.push(
        "MOTIVO_NAO_E_NULADO: a escrita não nula `motivo_descarte`. O texto livre do descarte segue inteiro depois da anonimização.",
      );
    }
  }

  v.push(
    ...violacoesDoAlcance(cte.corpo, {
      semAlvo:
        "MOTIVO_NAO_ALCANCA_O_ALVO: a escrita não alcança quem está sendo anonimizado AGORA. O motivo digitado fica inteiro na candidatura de quem acabou de ter o CPF nulado.",
      semJaAnonimizados:
        "MOTIVO_NAO_ALCANCA_OS_JA_ANONIMIZADOS: a escrita alcança só o `alvo` da passada. A varredura NUNCA volta a uma linha carimbada, então motivo escrito DEPOIS da anonimização (ou antes desta correção existir) fica retido PARA SEMPRE, em silêncio.",
    }),
  );

  // ── O QUE NÃO PODE MUDAR DE LADO, E É O EFEITO COLATERAL MAIS CARO ───────
  //
  // `as_candidaturas.atualizado_em` é INSUMO DO RELÓGIO do expurgo (o `max(greatest(...))` do
  // `alvo`). Esta CTE roda sobre toda candidatura de todo anonimizado em TODA passada: empurrar o
  // carimbo adiante mexeria no PRAZO DE GENTE por efeito colateral de uma faxina, e para pior, em
  // silêncio e de hora em hora.
  if (tocaColuna(cte.corpo, "atualizado_em")) {
    v.push(
      "MOTIVO_TOCA_O_RELOGIO_DO_EXPURGO: a escrita grava `atualizado_em`. Essa coluna é INSUMO DO RELÓGIO do expurgo, e a CTE roda sobre toda candidatura de todo anonimizado em toda passada: o prazo de retenção de gente passaria a ser empurrado adiante por efeito colateral de uma faxina, de hora em hora.",
    );
  }

  const guarda = guardaDaEscrita(cte.corpo);
  if (!guarda) {
    v.push(
      "MOTIVO_REESCREVE_A_BASE_INTEIRA: não há guarda de `há o que expurgar`. A passada roda de hora em hora sobre TODA candidatura de TODA pessoa já anonimizada, gravando nulo por cima de nulo.",
    );
  } else {
    if (avaliarPredicado(guarda, linhaComMotivo()) !== true) {
      v.push(
        "MOTIVO_NAO_ALCANCA_O_TEXTO_LIVRE: a candidatura que AINDA tem o motivo digitado não satisfaz a guarda, então ela nunca é nem tocada.",
      );
    }
    if (avaliarPredicado(guarda, linhaSemMotivo()) !== false) {
      v.push(
        "MOTIVO_REESCREVE_A_BASE_INTEIRA: a candidatura que já está sem motivo também satisfaz a guarda. A passada grava nulo por cima de nulo em toda a base de anonimizados, a cada hora.",
      );
    }
  }
  return v;
}

/** As duas populações, para as duas escritas, com a mesma régua e mensagens próprias. */
function violacoesDoAlcance(
  corpo: string,
  msg: { semAlvo: string; semJaAnonimizados: string },
): string[] {
  const v: string[] = [];
  if (!alcancaOAlvo(corpo)) v.push(msg.semAlvo);
  if (!alcancaOsJaAnonimizados(corpo)) v.push(msg.semJaAnonimizados);
  return v;
}

/**
 * A CONTAGEM DO LOG NÃO PODE ABSORVER AS CTEs NOVAS.
 *
 * O que se reporta é quantas PESSOAS foram anonimizadas nesta passada. As linhas cicatrizadas (o
 * resumo substituído, o motivo nulado) alcançam todo mundo que já está carimbado, em TODA passada:
 * somá-las faria o número do log oscilar sem ninguém ter sido expurgado, e o log deixaria de servir
 * para qualquer coisa. A CTE do prazo é achada pelo PREDICADO dela, e nunca pelo nome.
 */
function violacoesDaContagem(t: string): string[] {
  const cteDoPrazo = ctesDaConsulta(t).find(
    (c) =>
      /\bupdate\s+as_candidatos\b/.test(c.corpo) &&
      /anonimizado_em\s+is\s+null/.test(c.corpo) &&
      !/anonimizado_em\s+is\s+not\s+null/.test(c.corpo),
  );
  const final = selectFinal(t);
  if (!cteDoPrazo || !final) return [];
  if (new RegExp(`from\\s+${cteDoPrazo.nome}\\b`).test(final)) return [];
  return [
    "CONTAGEM_NAO_SAI_DO_ALVO: a contagem que vai ao log não é lida da CTE do prazo. As CTEs de texto livre alcançam todo mundo que já está carimbado em toda passada, então o número passaria a oscilar sem ninguém ter sido expurgado.",
  ];
}

// ── 4. A REFERÊNCIA E OS MUTANTES ───────────────────────────────────────────

const VIVAS_NO_SQL = "'ativo', 'aprovado'";

/**
 * O CORPO DAS CTEs, cada uma numa constante, para que a REFERÊNCIA possa ser MONTADA EM QUALQUER
 * ORDEM. É essa montagem que transforma "meu contrato não depende de posição" de promessa em prova.
 *
 * ELA NÃO É A IMPLEMENTAÇÃO ESPERADA. O requisito nomeia a propriedade, não o desenho: quem constrói
 * pode escrever outra consulta que cumpra tudo. Esta existe por um motivo só, o mesmo dos arquivos
 * vizinhos: dar ao contrato um texto SABIDAMENTE CORRETO para aprovar, e uma base de onde derivar os
 * mutantes que ele tem de reprovar. Sem isso, "meu teste pega o defeito?" seria opinião.
 */
const CTE_ALVO = `alvo as (
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
           select 1 from as_candidaturas k
            where k.candidato_id = c.id
              and k.situacao in (${VIVAS_NO_SQL}))
     and coalesce(
           (select max(k.atualizado_em) from as_candidaturas k where k.candidato_id = c.id),
           greatest(c.criado_em, c.atualizado_em))
         <= now() - interval '2 years'
  returning c.id
  )`;

const CTE_JA_ANONIMIZADOS = `ja_anonimizados as (
    select id from as_candidatos where anonimizado_em is not null
  )`;

const CTE_IDENTIDADES = `identidades_apagadas as (
    delete from as_identidades_externas
     where candidato_id in (select id from alvo)
        or candidato_id in (select id from ja_anonimizados)
  )`;

const CTE_PESSOAIS = `pessoais_cicatrizados as (
  update as_candidatos
     set nome = 'Candidato Expurgado',
         cpf = null,
         email = null,
         telefone = null,
         data_nascimento = null
   where anonimizado_em is not null
     and (nome is distinct from 'Candidato Expurgado'
          or cpf is not null
          or email is not null
          or telefone is not null
          or data_nascimento is not null)
  )`;

const CTE_CONTATOS = `contatos_expurgados as (
  update as_contatos
     set resumo = 'Resumo Expurgado'
   where candidatura_id in (
           select k.id from as_candidaturas k
            where k.candidato_id in (select id from alvo)
               or k.candidato_id in (select id from ja_anonimizados))
     and resumo is distinct from 'Resumo Expurgado'
  )`;

const CTE_MOTIVOS = `motivos_expurgados as (
  update as_candidaturas
     set motivo_descarte = null
   where (candidato_id in (select id from alvo)
          or candidato_id in (select id from ja_anonimizados))
     and motivo_descarte is not null
  )`;

/**
 * A CÓPIA DO MESMO TEXTO, na tabela do histórico.
 *
 * O `set` lista SÓ o `motivo`. `aceite` e `aceite_numero` moram três colunas ao lado, na mesma
 * tabela, e é justamente por isso que a referência os deixa de fora de forma visível: a trilha do
 * aceite é permanente por exigência da §A.6, e apagá-la "já que estamos limpando o histórico" é o
 * erro que esta referência existe para tornar impossível de escrever sem ficar vermelho.
 */
const CTE_HISTORICO = `motivos_do_historico_expurgados as (
  update as_candidatura_etapas
     set motivo = null
   where candidatura_id in (
           select k.id from as_candidaturas k
            where k.candidato_id in (select id from alvo)
               or k.candidato_id in (select id from ja_anonimizados))
     and motivo is not null
  )`;

/** Monta a consulta com as CTEs na ORDEM DADA. O `select` final é sempre o mesmo. */
export function montarReferencia(ctes: string[]): string {
  return sqlExecutavel(
    sql.raw(`with ${ctes.join(",\n  ")}\n  select count(*)::int as n from alvo`),
  );
}

/** A ordem "natural", a mesma em que a produção escreve hoje. */
export const SQL_REFERENCIA_TEXTO_LIVRE = montarReferencia([
  CTE_ALVO,
  CTE_JA_ANONIMIZADOS,
  CTE_IDENTIDADES,
  CTE_PESSOAIS,
  CTE_CONTATOS,
  CTE_MOTIVOS,
  CTE_HISTORICO,
]);

/**
 * A MESMA consulta, com as CTEs REORDENADAS. O contrato tem de aprovar as duas, e é isso que prova
 * que ele isola cada escrita pelo que ela FAZ, e nunca pela posição dela na instrução.
 */
export const SQL_REFERENCIA_REORDENADA = montarReferencia([
  CTE_ALVO,
  CTE_JA_ANONIMIZADOS,
  CTE_HISTORICO,
  CTE_MOTIVOS,
  CTE_CONTATOS,
  CTE_PESSOAIS,
  CTE_IDENTIDADES,
]);

/**
 * A MESMA consulta, com as duas CTEs novas RENOMEADAS. O contrato tem de aprovar também, e é isso
 * que prova que ele não depende do NOME que alguém escolheu: o nome é documentação, e documentação
 * muda numa refatoração sem que a regra mude.
 */
export const SQL_REFERENCIA_RENOMEADA = montarReferencia([
  CTE_ALVO,
  CTE_JA_ANONIMIZADOS,
  CTE_IDENTIDADES,
  CTE_PESSOAIS,
  CTE_CONTATOS.replace("contatos_expurgados as (", "faxina_do_texto_do_contato as ("),
  CTE_MOTIVOS.replace("motivos_expurgados as (", "faxina_do_motivo as ("),
  CTE_HISTORICO.replace("motivos_do_historico_expurgados as (", "faxina_do_historico as ("),
]);

/** Um mutante: o que foi quebrado, o dano em produção, o texto quebrado e a regra que TEM de acusar. */
export interface MutanteDoTextoLivre {
  nome: string;
  dano: string;
  sql: string;
  regraEsperada: string;
}

function trocar(de: string, para: string): string {
  const alvo = SQL_REFERENCIA_TEXTO_LIVRE.toLowerCase();
  const i = alvo.indexOf(de.toLowerCase());
  if (i < 0) throw new Error(`Mutante impossível: "${de}" não está na referência do furo 3.`);
  /*
   * ─ O TRECHO TEM DE SER ÚNICO, E ESTA GUARDA JÁ PEGOU DOIS ERROS MEUS ───────────────────────
   *
   * As CTEs de faxina são quase idênticas por construção (mesma régua, mesmo alcance, tabelas
   * diferentes), então um trecho curto casa em DUAS delas e o `indexOf` muta a PRIMEIRA. O mutante
   * continua vermelho, mas pelo motivo ERRADO, medindo outra CTE que não a que ele diz medir: é o
   * defeito clássico do mutante, e ele não falha, ele engana. Ambiguidade aqui é erro de teste, e
   * erro de teste explode na hora em que o arquivo é carregado, não na revisão de alguém.
   */
  if (alvo.indexOf(de.toLowerCase(), i + 1) >= 0) {
    throw new Error(
      `Mutante ambíguo: "${de}" aparece mais de uma vez na referência do furo 3, e o mutante ` +
        `alteraria a primeira ocorrência, que pode não ser a CTE que ele diz medir. Alongue o ` +
        `trecho com o contexto que o torna único (o final da guarda costuma bastar).`,
    );
  }
  return (
    SQL_REFERENCIA_TEXTO_LIVRE.slice(0, i) +
    para +
    SQL_REFERENCIA_TEXTO_LIVRE.slice(i + de.length)
  );
}

const CONTATOS_INTEIRO = sqlExecutavel(sql.raw(CTE_CONTATOS));
const MOTIVOS_INTEIRO = sqlExecutavel(sql.raw(CTE_MOTIVOS));

const HISTORICO_INTEIRO = sqlExecutavel(sql.raw(CTE_HISTORICO));

export const MUTANTES_DO_TEXTO_LIVRE: MutanteDoTextoLivre[] = [
  {
    nome: "1. a CTE do resumo do contato some",
    dano: "é o terceiro furo inteiro, de volta: o telefone que alguém anotou na frase do contato sobrevive à anonimização, e a pessoa continua localizável pela linha ao lado do CPF nulado.",
    sql: trocar(`${CONTATOS_INTEIRO}, `, ""),
    regraEsperada: "SEM_EXPURGO_DO_RESUMO",
  },
  {
    nome: "2. a CTE do motivo de descarte some",
    dano: "a frase digitada no descarte sobrevive à anonimização, com a mesma exposição do resumo do contato.",
    sql: trocar(`, ${MOTIVOS_INTEIRO}`, ""),
    regraEsperada: "SEM_EXPURGO_DO_MOTIVO",
  },
  {
    nome: "3. o resumo é NULADO numa coluna NOT NULL",
    dano: "o pior dos dois arquivos: não expurga errado, DERRUBA A VARREDURA INTEIRA. A instrução é uma só, então caem junto o expurgo do prazo, a cicatrização e o apagamento das identidades. Ninguém é expurgado nunca mais, de hora em hora, em silêncio.",
    sql: trocar("set resumo = 'Resumo Expurgado'", "set resumo = null"),
    regraEsperada: "RESUMO_NULADO_EM_COLUNA_NOT_NULL",
  },
  {
    nome: "4. o resumo recebe o marcador do NOME",
    dano: "a linha do histórico da candidatura passa a dizer o marcador do nome onde se espera a frase do contato, e quem lê a tela conclui que o campo foi preenchido errado, e não que ele foi expurgado.",
    sql: trocar("set resumo = 'Resumo Expurgado'", "set resumo = 'Candidato Expurgado'"),
    regraEsperada: "MARCADOR_DO_RESUMO_CONFUNDIDO_COM_O_DO_NOME",
  },
  {
    nome: "5. o marcador gravado no resumo diverge do conferido pela guarda",
    dano: "a guarda nunca casa com o que a escrita grava, e TODO contato de TODA pessoa anonimizada é reescrito a cada hora, para sempre, sem nenhuma mudança de valor.",
    sql: trocar("and resumo is distinct from 'Resumo Expurgado'", "and resumo is distinct from 'Texto Expurgado'"),
    regraEsperada: "MARCADOR_DO_RESUMO_DIVERGENTE",
  },
  {
    nome: "6. o resumo alcança só o `alvo`, e esquece quem já está carimbado",
    dano: "é o caso do contato registrado DEPOIS da anonimização: a varredura nunca volta a uma linha carimbada, então aquele texto fica retido para sempre, em silêncio.",
    // A cauda ` and resumo is distinct from` é o que torna o trecho único: a CTE do histórico tem
    // um alcance IDÊNTICO, e sem a cauda este mutante alteraria ela, medindo a CTE errada.
    sql: trocar(
      " or k.candidato_id in (select id from ja_anonimizados)) and resumo is distinct from",
      ") and resumo is distinct from",
    ),
    regraEsperada: "RESUMO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
  },
  {
    nome: "7. o motivo alcança só o `alvo`, e esquece quem já está carimbado",
    dano: "mesmo caso, na outra tabela: motivo escrito depois da anonimização, ou antes desta correção existir, fica retido para sempre.",
    // O TRECHO PROCURADO É LONGO DE PROPÓSITO: a CTE das identidades externas tem uma linha quase
    // idêntica, e ela vem ANTES. Um trecho curto mutaria a CTE errada e o mutante mediria outra
    // coisa, ficando verde ou vermelho pelo motivo errado, que é o defeito clássico de mutante.
    sql: trocar(
      " or candidato_id in (select id from ja_anonimizados)) and motivo_descarte is not null",
      ") and motivo_descarte is not null",
    ),
    regraEsperada: "MOTIVO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
  },
  {
    nome: "8. o resumo esquece o `alvo` e só cicatriza o passado",
    dano: "o texto livre de quem está sendo anonimizado AGORA fica inteiro na linha ao lado do CPF nulado, e a passada seguinte também não o alcança, porque ele passa a depender do carimbo que só a passada anterior escreveu.",
    sql: trocar(
      "k.candidato_id in (select id from alvo) or k.candidato_id in (select id from ja_anonimizados)) and resumo is distinct from",
      "k.candidato_id in (select id from ja_anonimizados)) and resumo is distinct from",
    ),
    regraEsperada: "RESUMO_NAO_ALCANCA_O_ALVO",
  },
  {
    nome: "9. o motivo de descarte recebe um MARCADOR em vez de nulo",
    dano: "inventa um terceiro estado numa coluna cujo nulo já significa `saiu sem motivo registrado`. Toda tela que testa `motivoDescarte &&` passa a EXIBIR o marcador, como se ele fosse o motivo pelo qual a pessoa foi descartada.",
    sql: trocar("set motivo_descarte = null", "set motivo_descarte = 'Motivo Expurgado'"),
    regraEsperada: "MOTIVO_COM_MARCADOR_EM_VEZ_DE_NULO",
  },
  {
    nome: "10. a guarda do resumo some",
    dano: "a passada grava por cima de todo contato de toda pessoa anonimizada a cada hora: o custo passa a crescer com a base, e não com o defeito.",
    sql: trocar(" and resumo is distinct from 'Resumo Expurgado'", ""),
    regraEsperada: "RESUMO_REESCREVE_A_BASE_INTEIRA",
  },
  {
    nome: "11. a guarda do motivo some",
    dano: "a passada grava nulo por cima de nulo em toda candidatura de toda pessoa anonimizada, de hora em hora.",
    sql: trocar(" and motivo_descarte is not null", ""),
    regraEsperada: "MOTIVO_REESCREVE_A_BASE_INTEIRA",
  },
  {
    nome: "12. a guarda do resumo inverte, e passa a alcançar só quem já foi expurgado",
    dano: "a linha que AINDA tem a frase digitada nunca é tocada, e a que já está limpa é reescrita para sempre. O `set` correto não alcança o que a guarda deixou de fora.",
    sql: trocar("and resumo is distinct from 'Resumo Expurgado'", "and resumo = 'Resumo Expurgado'"),
    regraEsperada: "RESUMO_NAO_ALCANCA_O_TEXTO_LIVRE",
  },
  {
    nome: "13. a CTE do motivo carimba `atualizado_em`",
    dano: "essa coluna é INSUMO DO RELÓGIO do expurgo, e a CTE roda sobre toda candidatura de todo anonimizado em toda passada: o prazo de retenção de gente passaria a ser empurrado adiante por efeito colateral de uma faxina.",
    sql: trocar("set motivo_descarte = null", "set motivo_descarte = null, atualizado_em = now()"),
    regraEsperada: "MOTIVO_TOCA_O_RELOGIO_DO_EXPURGO",
  },
  {
    nome: "14. a contagem do log passa a sair da cicatrização do dado pessoal",
    dano: "as CTEs de faxina alcançam todo mundo que já está carimbado em toda passada: o log anunciaria um expurgo por hora, para sempre, sem ninguém ter sido expurgado.",
    sql: trocar("select count(*)::int as n from alvo", "select count(*)::int as n from ja_anonimizados"),
    regraEsperada: "CONTAGEM_NAO_SAI_DO_ALVO",
  },
  {
    nome: "15. o contato é APAGADO em vez de ter o texto substituído",
    dano: "destrói a prova de que o trabalho aconteceu (houve ligação naquele dia, feita por aquele consultor) e a leitura de esforço da candidatura junto, sem minimizar nada além do que a substituição do texto já minimizaria.",
    sql: trocar(
      "update as_contatos set resumo = 'Resumo Expurgado' where candidatura_id in",
      "delete from as_contatos where candidatura_id in",
    ),
    regraEsperada: "CONTATO_APAGADO_EM_VEZ_DE_EXPURGADO",
  },
  {
    nome: "16. a CTE do motivo no HISTÓRICO some",
    dano: "é o quarto furo da mesma classe: `gravarSaidaDaCandidatura` escreve a MESMA string nas duas tabelas, na mesma transação, então nular só o `motivo_descarte` deixa a cópia intacta no histórico. Minimização aparente, e a varredura nunca volta a uma linha carimbada para consertar.",
    sql: trocar(`, ${HISTORICO_INTEIRO}`, ""),
    regraEsperada: "SEM_EXPURGO_DO_MOTIVO_DO_HISTORICO",
  },
  {
    nome: "17. o histórico alcança só o `alvo`, e esquece quem já está carimbado",
    dano: "evento gravado DEPOIS da anonimização (uma reentrada, uma reabertura de vaga) ou antes desta correção existir fica retido para sempre, em silêncio.",
    sql: trocar(
      " or k.candidato_id in (select id from ja_anonimizados)) and motivo is not null",
      ") and motivo is not null",
    ),
    regraEsperada: "HISTORICO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
  },
  {
    nome: "18. o histórico esquece o `alvo` e só cicatriza o passado",
    dano: "o motivo digitado fica inteiro no histórico de quem acabou de ter o CPF nulado, e a passada seguinte também não o alcança.",
    sql: trocar(
      "k.candidato_id in (select id from alvo) or k.candidato_id in (select id from ja_anonimizados)) and motivo is not null",
      "k.candidato_id in (select id from ja_anonimizados)) and motivo is not null",
    ),
    regraEsperada: "HISTORICO_NAO_ALCANCA_O_ALVO",
  },
  {
    nome: "19. o motivo do histórico recebe um MARCADOR em vez de nulo",
    dano: "inventa um terceiro estado na cópia do `motivo_descarte`, e as telas de histórico passam a EXIBIR o marcador como se ele fosse o motivo do evento.",
    sql: trocar("set motivo = null", "set motivo = 'Motivo Expurgado'"),
    regraEsperada: "HISTORICO_COM_MARCADOR_EM_VEZ_DE_NULO",
  },
  {
    nome: "20. o ACEITE é apagado junto, por simetria",
    dano: "É O ERRO QUE A PRÓXIMA PESSOA VAI COMETER, e ele é o oposto de uma limpeza: `aceite` está a três colunas do `motivo`, no mesmo `set`, e `já que estamos limpando o histórico` é a frase mais natural do mundo. Ele apaga a prova de que alguém passou por cima de um aviso, que a §A.6 exige PERMANENTE e consultável, e não minimiza dado nenhum, porque ali não há dado pessoal: é um nome de guarda, um lado e um número, com o autor saindo de `por_id`, que é usuário INTERNO.",
    sql: trocar("set motivo = null", "set motivo = null, aceite = null"),
    regraEsperada: "ACEITE_EXPURGADO",
  },
  {
    nome: "21. o NÚMERO do aceite é apagado junto",
    dano: "sem o número, o log do aceite deixa de ser auditável: confirmar o aviso com UMA posição oficial aberta e confirmar com CINCO são decisões diferentes, e é o número que distingue as duas. Apagar só ele deixa a trilha de pé com a aparência de íntegra, que é pior do que apagá-la inteira.",
    sql: trocar("set motivo = null", "set motivo = null, aceite_numero = null"),
    regraEsperada: "ACEITE_EXPURGADO",
  },
  {
    nome: "22. a linha do HISTÓRICO é apagada em vez de ter o texto nulado",
    dano: "leva junto o que aconteceu (a etapa, o desfecho, quem decidiu e quando) e a TRILHA DO ACEITE inteira. É a forma mais completa de destruir a prova enquanto se acredita estar minimizando dado.",
    sql: trocar(
      "update as_candidatura_etapas set motivo = null where candidatura_id in",
      "delete from as_candidatura_etapas where candidatura_id in",
    ),
    regraEsperada: "HISTORICO_APAGADO_EM_VEZ_DE_EXPURGADO",
  },
  {
    nome: "23. a CTE do histórico carimba `ocorrido_em`",
    dano: "a CTE roda sobre todo evento de todo anonimizado em toda passada: o carimbo do fato passaria a dizer `agora` para coisa que aconteceu há anos, e a ordem real dos eventos, que é o que a tabela existe para guardar, se perderia.",
    sql: trocar("set motivo = null", "set motivo = null, ocorrido_em = now()"),
    regraEsperada: "HISTORICO_TOCA_O_CARIMBO_DO_EVENTO",
  },
  {
    nome: "24. a guarda do histórico some",
    dano: "a passada grava nulo por cima de nulo em todo evento de toda pessoa anonimizada, de hora em hora, e esta é a tabela que mais cresce do módulo: um evento por movimento de etapa, por pessoa, por vaga.",
    sql: trocar(" and motivo is not null", ""),
    regraEsperada: "HISTORICO_REESCREVE_A_BASE_INTEIRA",
  },
];
