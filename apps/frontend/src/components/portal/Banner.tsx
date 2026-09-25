"use client";

import { BotaoFalarComRh } from "@/components/portal/Identificacao";

/**
 * O BANNER DO PORTAL, em TODAS as telas do candidato (pedido do diretor).
 *
 * O QUE ELE RESOLVE: a trilha não tinha cabeçalho nenhum, então quem abria o link no celular via
 * uma faixa de bolinhas e um cartão, sem nada dizendo de quem é a tela. A marca fica no topo, e o
 * nome do lugar embaixo dela.
 *
 * ELE É O ÚNICO PONTO DE MARCA DA TELA, de propósito: a logo centrada que ficava dentro do cartão
 * saiu, porque duas marcas na mesma dobra empurram o conteúdo para baixo sem dizer nada a mais. No
 * celular isso importa de verdade, que é onde a primeira dobra é curta.
 *
 * ELE NÃO É FIXO (`sticky`) NO CELULAR, e isso é escolha medida: quem já é fixo ali é o TABULEIRO,
 * e dois elementos grudados no topo comem a dobra inteira do aparelho. O banner rola junto com a
 * página e o tabuleiro continua colado no topo, exatamente como foi validado.
 *
 * O BOTÃO DO RH VEM NA VARIANTE COMPACTA. É por ele que "Fale com o RH" existe em toda tela sem
 * um botão de largura cheia disputando o lugar da ação principal de cada uma.
 *
 * ┌─ O "GRUPO SOULAN" DE CIMA SAIU DE VEZ (pedido do diretor) ──────────────────────────────────┐
 * │ Ele já sumia no CELULAR por medição: a 390px, com as duas linhas mais o botão do RH na mesma │
 * │ faixa, o título saía cortado como "Portal Do ...", que é a §A.20 sendo violada no primeiro   │
 * │ elemento que o candidato vê. Agora ele sai também no desktop, então a linha some do arquivo  │
 * │ em vez de ficar escondida por breakpoint: a logo ao lado já diz Soulan, e a faixa passa a    │
 * │ ter UM texto só.                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CENTRALIZAÇÃO É NA PÁGINA, NÃO NO ESPAÇO QUE SOBRA, e por isso é GRID e não flex ────────┐
 * │ Com a logo à esquerda e o botão do RH à direita, centralizar o título dentro do bloco do     │
 * │ meio o deixa visivelmente torto, porque a logo (~182px no desktop) e o botão (~110px) têm    │
 * │ larguras diferentes. As colunas laterais `1fr` recebem a MESMA largura por construção, então │
 * │ a coluna `auto` do meio cai no centro óptico da faixa, e não no meio da sobra.               │
 * │ NO CELULAR a grade é outra (`auto_1fr_auto`): a 390px não cabem três colunas equilibradas    │
 * │ (logo ~136px + botão ~95px + folgas deixam ~103px para o título), então ali o título segue   │
 * │ alinhado à esquerda, ocupando a sobra e QUEBRANDO EM DUAS LINHAS, nunca cortado. O `lg` é    │
 * │ que tem largura de sobra para o centro verdadeiro.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A FONTE É A DA PLATAFORMA INTEIRA: `font-display` é Manrope, a mesma família que o `globals.css`
 * aplica em `h1, h2, h3` e que o `PageHead` usa nos títulos das telas internas. Conferido, não
 * presumido, e por isso ela permanece.
 *
 * A COR É A DO TEMA, PRESA AO CLARO (`#0d2b45`, o `--text` do tema claro), e isso é deliberado: o
 * portal é "tema claro sempre" por decisão do diretor (ver o cabeçalho de `app/portal/page.tsx`),
 * com cores LITERAIS. Usar o token `var(--text)` aqui deixaria o título QUASE BRANCO sobre o
 * `bg-white` no navegador de quem tem o tema escuro salvo (o `data-theme` vive no `<html>`, que é
 * compartilhado com o app), que é exatamente o título ilegível que a ordem mandou evitar.
 *
 * §A.6: nada de dado pessoal aqui. §A.11 sem travessão. §A.24: "Portal Do Candidato" é título.
 */
export function BannerPortal() {
  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 lg:grid-cols-[1fr_auto_1fr] lg:gap-5 lg:px-10 lg:py-4">
        <img
          src="/logo-soulan.png"
          alt="Grupo Soulan"
          className="h-9 w-auto justify-self-start object-contain lg:h-12"
        />
        <p className="font-display min-w-0 border-l border-slate-200 pl-3 text-[14px] font-bold leading-tight text-[#0d2b45] lg:border-l-0 lg:pl-0 lg:text-center lg:text-[28px]">
          Portal Do Candidato
        </p>
        <BotaoFalarComRh variante="compacto" className="justify-self-end" />
      </div>
    </header>
  );
}
