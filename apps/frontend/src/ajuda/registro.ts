/**
 * ─ O QUE A TELA PERGUNTA AO MANUAL ─────────────────────────────────────────────────────────────
 *
 * Três perguntas, e só três: "quem ensina ESTA tela?" (o botão de ajuda), "o que existe, por
 * módulo?" (o sumário) e "quem é este slug?" (a página do artigo). A lista bruta vem do barril
 * gerado; a lógica fica aqui, para o barril poder ser regravado por comando sem levar nada embaixo.
 */

import { FAMILIA_POR_CODIGO } from "./conteudo/familias.gerado";
import { ARTIGOS as ARTIGOS_CRUS } from "./conteudo/registro.gerado";
import { artigosDaRotaEm } from "./rotas";
import { MODULOS_AJUDA, type Artigo, type ModuloAjuda } from "./tipos";

/**
 * ─ A FAMÍLIA É SOMADA AQUI, UMA VEZ, E NINGUÉM MAIS PRECISA SABER QUE ELA EXISTE ────────────────
 *
 * ┌─ POR QUE A SOMA MORA NO REGISTRO, E NÃO NO TIPO ────────────────────────────────────────────┐
 * │ O desenho original previa `preRequisitos: Array<string | { daFamilia: true }>`, ou seja, o    │
 * │ marcador viajando dentro da lista. Funciona, e custa caro do lado errado: SEIS consumidores   │
 * │ (a tela do artigo, o painel lateral, o índice da busca, o realce do resultado, a cobertura e  │
 * │ as fixtures dos testes) passariam a ter de estreitar uma união antes de ler um texto. Cada um  │
 * │ deles é um lugar onde alguém esquece o marcador e o bloco compartilhado desaparece em         │
 * │ silêncio, que é o mesmo modo de falha que a família existe para eliminar.                     │
 * │                                                                                               │
 * │ RESOLVENDO AQUI, `preRequisitos` e `seDerErrado` continuam sendo LISTAS DE TEXTO para todo     │
 * │ mundo, e a família é detalhe de como o conteúdo foi escrito, não do que a tela lê.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * FAMÍLIA DESCONHECIDA NÃO É SILENCIADA: o artigo sai com o bloco dele, e a varredura de coerência
 * acusa o código órfão. Aqui não é lugar de derrubar a tela do manual por erro de conteúdo.
 *
 * A ORDEM É FIXA: bloco da FAMÍLIA primeiro, bloco do ARTIGO depois. O comum antes do particular, que
 * é a ordem em que a pessoa lê.
 */
export function artigoResolvido(artigo: Artigo): Artigo {
  if (!artigo.familia) return artigo;
  const familia = FAMILIA_POR_CODIGO[artigo.familia];
  if (!familia) return artigo;
  return {
    ...artigo,
    // `Set` no pré-requisito: artigo que repete um item da família não desenha a mesma linha duas
    // vezes. Em `seDerErrado` a chave é o SINTOMA, pela mesma razão, e o do artigo GANHA do da
    // família (quem escreveu o artigo sabia algo mais específico sobre aquele sintoma).
    preRequisitos: [...new Set([...familia.preRequisitos, ...artigo.preRequisitos])],
    seDerErrado: [
      ...familia.seDerErrado.filter(
        (f) => !artigo.seDerErrado.some((a) => a.sintoma === f.sintoma),
      ),
      ...artigo.seDerErrado,
    ],
  };
}

/**
 * OS ARTIGOS JÁ RESOLVIDOS, e é esta a lista que todo mundo consome. O barrel cru fica dentro deste
 * módulo de propósito: quem importar `registro.gerado` direto recebe o artigo SEM a família, e o
 * bloco compartilhado não aparece.
 */
export const ARTIGOS: Artigo[] = ARTIGOS_CRUS.map(artigoResolvido);

/** O artigo daquele endereço, ou nada. */
export function artigoPorSlug(slug: string): Artigo | undefined {
  return ARTIGOS.find((a) => a.slug === slug);
}

/**
 * QUEM ENSINA ESTA TELA, sobre o registro real. A regra de casamento (rota exata antes de prefixo)
 * mora em `rotas.ts`, porque o DETECTOR DE CONTROLE ÓRFÃO precisa dela sobre uma lista injetada, e
 * duas cópias divergiriam: o detector mediria a tela contra um artigo que este painel não mostra.
 */
export function artigosDaRota(rota: string): Artigo[] {
  return artigosDaRotaEm(ARTIGOS, rota);
}

/** Os módulos que têm artigo, na ordem do sumário. Módulo vazio não vira bloco vazio na tela. */
export function artigosPorModulo(): Array<{ modulo: ModuloAjuda; artigos: Artigo[] }> {
  return MODULOS_AJUDA.map((modulo) => ({
    modulo,
    artigos: ARTIGOS.filter((a) => a.modulo === modulo).sort((x, y) =>
      x.titulo.localeCompare(y.titulo, "pt-BR"),
    ),
  })).filter((bloco) => bloco.artigos.length > 0);
}
