/**
 * ONDE O POPOVER DE UM SELETOR CABE NA TELA (bug 14, correção de 07/09/2026).
 *
 * ┌─ O DEFEITO QUE ESTA FUNÇÃO EXISTE PARA CORRIGIR ──────────────────────────────────────────────┐
 * │ O `Select` e o `MultiSelect` abriam o menu SEMPRE para baixo do gatilho, em `position: fixed`, │
 * │ com a lista limitada a 240px e SEM NENHUM limite pela borda da tela. Perto do fim da página o  │
 * │ menu nascia parcialmente fora da janela, e porque é `fixed` rolar não o trazia de volta: o     │
 * │ listener de rolagem reposicionava o menu DE NOVO para baixo do gatilho, a cada rolagem. As     │
 * │ opções de baixo ficavam inalcançáveis, e foi exatamente esse o relato do time na Central de    │
 * │ Vagas ("a caixa abre pra baixo e o final fica escondido").                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CORREÇÃO TEM DUAS PARTES, e a ordem de importância entre elas não é a que parece:
 *
 *   1. O TETO DE ALTURA É O QUE CONSERTA O BUG. O menu nunca passa da borda da janela, porque a
 *      altura máxima dele é o espaço que existe de verdade. Sobrando conteúdo, ele ROLA POR DENTRO,
 *      e a última opção fica alcançável mesmo no pior caso. Isto sozinho já resolve o relato.
 *   2. A INVERSÃO PARA CIMA É CONFORTO, não conserto. Ela evita a lista de três linhas espremida
 *      no rodapé quando existe meia tela livre logo acima do gatilho.
 *
 * POR QUE A INVERSÃO É CONSERVADORA (`ALTURA_CONFORTAVEL`), e isto é deliberado: estes dois
 * componentes são o seletor padrão de DEZENAS de telas já validadas (§A.35), e inverter à toa mudaria
 * o comportamento de todas elas. A régua só inverte quando o espaço de baixo é APERTADO DE VERDADE e
 * o de cima é maior. Em tela normal, com o seletor no meio da página, nada muda: continua abrindo
 * para baixo, com o mesmo tamanho de antes.
 *
 * ANCORAGEM POR `bottom` QUANDO INVERTE, e não por um `top` calculado: com `position: fixed`,
 * `bottom` prende a borda INFERIOR do menu logo acima do gatilho, e o menu cresce para cima sozinho
 * conforme o conteúdo. Calcular o `top` exigiria medir a altura do menu ANTES de desenhá-lo, ou seja
 * um segundo passe de render, e o preço disso é o menu piscando na posição errada.
 *
 * O REMÉDIO JÁ EXISTIA NA CASA, e é isso que torna o defeito constrangedor em vez de difícil: o
 * `Combobox` (o seletor dos modais de filtro) inverte e limita a altura desde que nasceu, com esta
 * mesma régua escrita à mão dentro dele. O `Select` e o `MultiSelect` nunca ganharam a correção, e
 * por isso eram os dois únicos seletores do sistema em que a lista sumia no rodapé.
 *
 * O `Combobox` NÃO FOI TOCADO (§A.14/§A.26): ele funciona, e converter um componente validado para
 * ler daqui é mudança que ninguém pediu. Fica a proposta de convergir os três num dia de faxina.
 *
 * Função PURA, sem DOM e sem React, no padrão do resto de `lib/`: recebe o retângulo do gatilho e o
 * tamanho da janela, devolve números. É o que a deixa testável sem browser.
 */

/** Folga entre o gatilho e o menu. O mesmo respiro visual que já existia (`r.bottom + 6`). */
export const FOLGA_DO_GATILHO = 6;

/** Respiro mínimo até a borda da janela, para o menu não encostar no limite da tela. */
export const MARGEM_DA_JANELA = 8;

/**
 * A ALTURA A PARTIR DA QUAL O ESPAÇO DE BAIXO É "CONFORTÁVEL".
 *
 * 220px é, medido no componente, o campo de busca mais três a quatro opções: o suficiente para a
 * lista ser usável sem inverter. Abaixo disso a inversão passa a valer a pena, e é só aí que ela
 * acontece.
 */
export const ALTURA_CONFORTAVEL = 220;

/** O retângulo do gatilho, na forma mínima que a régua precisa (um `DOMRect` serve). */
export interface RetanguloGatilho {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

/** O tamanho da área visível da janela. */
export interface Janela {
  largura: number;
  altura: number;
}

export interface PosicaoPopover {
  /** Distância até o topo da janela. Presente só quando o menu abre PARA BAIXO. */
  top?: number;
  /** Distância até o rodapé da janela. Presente só quando o menu abre PARA CIMA. */
  bottom?: number;
  left: number;
  /** A largura do gatilho, que é a largura (ou a largura mínima) do menu. */
  largura: number;
  /** O teto de altura: é ele que impede o menu de passar da borda e liga a rolagem interna. */
  alturaMax: number;
  /** O teto de largura, para o menu não vazar pela direita nem no modo `menuFit`. */
  larguraMax: number;
  /** Abriu para cima? A tela usa só para depurar e para o teste afirmar a direção. */
  paraCima: boolean;
}

/**
 * Decide para que lado o menu abre e de quanto ele pode crescer.
 *
 * O TETO NUNCA FICA NEGATIVO NEM RIDÍCULO: um gatilho parcialmente fora da janela (durante uma
 * rolagem, por exemplo) devolveria espaço negativo, e um menu de altura negativa desapareceria. O
 * piso de 96px garante que sempre reste uma lista rolável, ainda que curta, em vez de nada.
 */
export function calcularPosicaoPopover(
  gatilho: RetanguloGatilho,
  janela: Janela,
): PosicaoPopover {
  const abaixo = janela.altura - gatilho.bottom - FOLGA_DO_GATILHO - MARGEM_DA_JANELA;
  const acima = gatilho.top - FOLGA_DO_GATILHO - MARGEM_DA_JANELA;

  // SÓ INVERTE QUANDO VALE A PENA: o espaço de baixo é apertado E o de cima é maior. Sem as duas
  // condições, o menu continua abrindo para baixo, como sempre abriu.
  const paraCima = abaixo < ALTURA_CONFORTAVEL && acima > abaixo;

  const espaco = paraCima ? acima : abaixo;
  const alturaMax = Math.max(96, Math.round(espaco));

  // A BORDA DA DIREITA TAMBÉM É BORDA. O menu pode ser mais largo que o gatilho (o modo `menuFit`),
  // e sem este limite ele vazaria para fora da janela num gatilho encostado à direita.
  const larguraMaxDisponivel = janela.largura - MARGEM_DA_JANELA * 2;
  const largura = Math.min(gatilho.width, larguraMaxDisponivel);
  const left = Math.round(
    Math.min(
      Math.max(gatilho.left, MARGEM_DA_JANELA),
      Math.max(MARGEM_DA_JANELA, janela.largura - largura - MARGEM_DA_JANELA),
    ),
  );

  return {
    ...(paraCima
      ? { bottom: Math.round(janela.altura - gatilho.top + FOLGA_DO_GATILHO) }
      : { top: Math.round(gatilho.bottom + FOLGA_DO_GATILHO) }),
    left,
    largura: Math.round(largura),
    alturaMax,
    larguraMax: Math.round(Math.max(0, janela.largura - left - MARGEM_DA_JANELA)),
    paraCima,
  };
}
