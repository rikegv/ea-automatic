/**
 * CAIXA ALTA NO NOME DO CANDIDATO (OST caixa alta + observações, Bloco 1).
 *
 * É transformação de EXIBIÇÃO, e só. O banco continua guardando o nome exatamente como chegou (do
 * Pandapé, da carga ou digitado no wizard), nenhuma rotina de gravação normaliza nada. Por isso a
 * regra vale de graça para os nomes que JÁ existem e para os que ainda vão chegar: quem transforma
 * é a tela, no momento de pintar.
 *
 * Consequência prática de ser só apresentação: os campos EDITÁVEIS (o input de nome do modal de
 * edição) NÃO passam por aqui. Se passassem, o consultor salvaria o valor em caixa alta de volta no
 * banco e a transformação deixaria de ser reversível.
 *
 * `toLocaleUpperCase("pt-BR")` em vez de `toUpperCase()`: o acento do português tem regra de caixa
 * própria ("josé" → "JOSÉ", "ção" → "ÇÃO"), e a versão neutra pode divergir dependendo do runtime.
 *
 * Entrada vazia/ausente devolve string vazia, para o chamador manter o seu próprio vazio
 * ("não informado", §A.11) com o `||` de sempre.
 */
export function caixaAlta(nome: string | null | undefined): string {
  return (nome ?? "").toLocaleUpperCase("pt-BR");
}
