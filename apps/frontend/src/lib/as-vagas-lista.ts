/**
 * ─ A LISTA DA CENTRAL DE VAGAS: BUSCA RÁPIDA, RECORTE POR ETAPA E PAGINAÇÃO ────────────────────
 *
 * Funções PURAS, sem React e sem rede, no padrão do `lib/` da casa: a régua se testa direto
 * (`as-vagas-lista.spec.ts`) e a tela só desenha o que elas devolvem.
 *
 * ┌─ POR QUE A BUSCA MUDOU DE ALCANCE ──────────────────────────────────────────────────────────┐
 * │ Ela cobria CÓDIGO e NOME DA VAGA, e o campo dizia isso com todas as letras. Quem procurava   │
 * │ "BMB" ou o nome do consultor não achava nada e concluía que a vaga não existia, quando ela   │
 * │ estava na tela, duas linhas abaixo. Agora o alvo é o TEXTO DA LINHA INTEIRA, montado com os  │
 * │ MESMOS rótulos que a célula mostra, inclusive o "não informado" (§A.11): o que está escrito  │
 * │ na tabela é o que a busca acha, sem uma segunda régua para o usuário decorar.                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: entram códigos, rótulos e contagens. Nenhum dado pessoal atravessa este módulo.
 */

import type { AsOcupacaoVaga } from "@ea/shared-types";

/**
 * NORMALIZA PARA COMPARAR: sem acento, sem caixa, sem borda em branco.
 *
 * É a MESMA normalização dos dois lados (termo e alvo), e é isso que faz "Aprovacao" achar
 * "Aprovação". Aplicar só de um lado é o defeito clássico: o usuário digita sem acento, o dado tem
 * acento, e a busca devolve vazio sem explicar por quê.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * O TEXTO BUSCÁVEL DE UMA LINHA: as células, na ordem em que aparecem, coladas com espaço.
 *
 * NULO E VAZIO SOMEM, em vez de virarem "undefined" no meio do alvo: quem monta a lista passa o
 * MESMO rótulo que a célula mostra (o "não informado" incluído), e o que não tem rótulo não entra.
 */
export function textoBuscavel(partes: readonly (string | number | null | undefined)[]): string {
  return normalizar(partes.filter((p) => p !== null && p !== undefined && p !== "").join(" "));
}

/**
 * A BUSCA RÁPIDA, com TODOS os pedaços do termo.
 *
 * CADA PALAVRA DIGITADA TEM DE APARECER, em qualquer lugar da linha e em qualquer ordem: "bmb
 * advogada" acha a linha do cliente BMB com cargo Advogada, que uma comparação de frase inteira
 * ("bmb advogada" como substring) NUNCA acharia, porque entre as duas células existem outras três.
 * Termo vazio não filtra nada.
 */
export function casaBusca(alvo: string, termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return true;
  return t.split(/\s+/).every((pedaco) => alvo.includes(pedaco));
}

/**
 * ─ O RECORTE POR ETAPA: A MESMA RÉGUA DO CARD, E ISSO NÃO É DETALHE ───────────────────────────
 *
 * ┌─ POR QUE `porEtapa` E NÃO `candidaturaViva` ────────────────────────────────────────────────┐
 * │ O CARD de etapa conta SÓ QUEM ESTÁ `ATIVO`: é o contrato de `AsOcupacaoVaga.porEtapa`       │
 * │ ("a situação vence a etapa"), e a invariante `soma(porEtapa) === emSelecao` amarra isso.     │
 * │ Quem já recebeu decisão (APROVADO, ALOCADO, ENVIADO_PARA_ADMISSAO) sai de `porEtapa` e vai   │
 * │ para `porDesfecho`, que é a OUTRA fileira de cards, ali do lado.                              │
 * │                                                                                              │
 * │ O CLIQUE NO CARD TEM DE TRAZER EXATAMENTE QUEM O CARD CONTOU. Recortar por "candidatura      │
 * │ viva" (o complemento de saída sem êxito) traria junto o aprovado e o alocado que ainda têm a  │
 * │ etapa gravada na linha: o card diria 1, a tabela mostraria 3, e as duas pessoas a mais já    │
 * │ estariam contadas nos cards de desfecho da mesma tela. Número que não bate com o que o       │
 * │ clique mostra é pior do que não ter clique.                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MAIS DE UMA ETAPA SOMA (é OU, não E): a vaga entra se tiver gente em QUALQUER uma das escolhidas,
 * que é o que "Triagem mais Aprovação" quer dizer numa fila. Exigir as duas ao mesmo tempo
 * responderia outra pergunta e devolveria quase sempre vazio.
 *
 * SELEÇÃO VAZIA É "TODAS", pelo mesmo motivo dos demais filtros da tela: sem isso, a tabela abriria
 * vazia esperando alguém marcar alguma coisa.
 *
 * A OCUPAÇÃO PODE NÃO TER CHEGADO (`?.`): na janela de minutos entre a publicação da tela nova e a
 * do backend, a vaga vem sem ocupação, e aqui isso significa "não tem ninguém nesta etapa", nunca
 * uma exceção que derruba a Central de Vagas inteira.
 */
export function temGenteNaEtapa(
  ocupacao: AsOcupacaoVaga | null | undefined,
  chaves: readonly string[],
): boolean {
  if (chaves.length === 0) return true;
  return chaves.some((k) => (ocupacao?.porEtapa?.[k] ?? 0) > 0);
}

/**
 * ─ O RECORTE POR DESFECHO: O GÊMEO DO DE CIMA, E A MESMA LIÇÃO ────────────────────────────────
 *
 * ┌─ POR QUE ELE É UMA FUNÇÃO SEPARADA, E NÃO O MESMO `temGenteNaEtapa` COM OUTRO MAPA ─────────┐
 * │ Porque os dois mapas contam gente DIFERENTE, e é exatamente aqui que se erra. `porEtapa` só  │
 * │ tem quem está `ATIVO`; `porDesfecho` só tem quem JÁ RECEBEU DECISÃO (aprovado, alocado,      │
 * │ descartado, desistente, enviado para admissão). A mesma pessoa nunca está nos dois.          │
 * │                                                                                              │
 * │ O CLIQUE NO CARD TEM DE TRAZER EXATAMENTE QUEM O CARD CONTOU, e o card de "Alocados" conta   │
 * │ por `porDesfecho`. Recortar por `porEtapa` traria a vaga que tem alguém em triagem e ninguém │
 * │ alocado: o card diria 0 e a tabela mostraria linha. Uma função por mapa, sem chave de tipo   │
 * │ no meio, é o que impede a troca silenciosa dos dois.                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MAIS DE UM DESFECHO SOMA (é OU, igual às etapas): "Alocados mais Desistentes" traz a vaga que tem
 * QUALQUER um dos dois. Exigir os dois ao mesmo tempo responderia outra pergunta.
 *
 * ┌─ ETAPA E DESFECHO ACESOS JUNTOS É "E", E A DECISÃO ESTÁ AQUI PARA NÃO FICAR IMPLÍCITA ──────┐
 * │ Dentro do MESMO grupo é OU; ENTRE os dois grupos é E, e quem faz o E é a tela, chamando as   │
 * │ duas funções em sequência (`temGenteNaEtapa(...) && temGenteNoDesfecho(...)`).               │
 * │                                                                                              │
 * │ POR TRÊS RAZÕES, e nenhuma é estética:                                                       │
 * │ 1. É COMO OS FILTROS DESTA TELA JÁ SE COMPÕEM, e isso já foi validado: o card de STATUS      │
 * │    (primeira faixa) e o filtro de ETAPA se somam por E hoje, "Abertas mais Triagem" mostra   │
 * │    as vagas abertas que têm alguém na triagem. Um terceiro grupo se comportando ao contrário │
 * │    faria a mesma tela responder de dois jeitos ao mesmo gesto.                                │
 * │ 2. COM "OU", ACENDER O SEGUNDO CARD AUMENTARIA A LISTA. Nenhum outro filtro desta tela faz   │
 * │    isso, e o usuário que acende dois cards está ESTREITANDO uma pergunta, não abrindo.        │
 * │ 3. É A PERGUNTA QUE OS DOIS GRUPOS JUNTOS FAZEM: "Triagem mais Alocados" quer dizer "as      │
 * │    vagas que já colocaram alguém E ainda têm gente na triagem", que é a fila de quem tem     │
 * │    trabalho pela frente com resultado no bolso. Como OU, seria uma união que nenhum dos dois │
 * │    cards explica.                                                                             │
 * │ Travado em `as-vagas-lista.spec.ts` ("etapa e desfecho acesos juntos é E").                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SELEÇÃO VAZIA É "TODAS" e a OCUPAÇÃO PODE NÃO TER CHEGADO (`?.`): as duas razões são as mesmas
 * documentadas em `temGenteNaEtapa`, logo acima.
 */
export function temGenteNoDesfecho(
  ocupacao: AsOcupacaoVaga | null | undefined,
  chaves: readonly string[],
): boolean {
  if (chaves.length === 0) return true;
  return chaves.some((k) => (ocupacao?.porDesfecho?.[k] ?? 0) > 0);
}

/** Quantas páginas a lista tem. Lista vazia continua tendo UMA página, a que mostra o vazio. */
export function totalDePaginas(quantos: number, porPagina: number): number {
  if (porPagina <= 0) return 1;
  return Math.max(1, Math.ceil(quantos / porPagina));
}

/**
 * A PÁGINA VÁLIDA, sempre dentro do intervalo.
 *
 * EXISTE PORQUE A LISTA ENCOLHE DEBAIXO DO USUÁRIO: ele está na página 4, filtra por um cliente e
 * sobram 12 linhas. Sem esta trava a tela mostraria uma página 4 que não existe mais, ou seja, uma
 * tabela vazia com a contagem dizendo que há 12 resultados.
 */
export function paginaValida(pagina: number, quantos: number, porPagina: number): number {
  return Math.min(Math.max(1, Math.trunc(pagina) || 1), totalDePaginas(quantos, porPagina));
}

/** A fatia da página pedida, já com a página corrigida pela `paginaValida`. */
export function fatiarPagina<T>(itens: readonly T[], pagina: number, porPagina: number): T[] {
  const p = paginaValida(pagina, itens.length, porPagina);
  return itens.slice((p - 1) * porPagina, p * porPagina) as T[];
}
