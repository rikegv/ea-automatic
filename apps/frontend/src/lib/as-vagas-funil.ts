/**
 * ─ A SEGUNDA FILEIRA DE KPIs DA CENTRAL DE VAGAS: QUANTA GENTE, E ONDE ──────────────────────────
 *
 * ┌─ O PONTO INTEIRO DESTE ARQUIVO: OS CARDS SAEM DO CATÁLOGO, NUNCA DE UMA LISTA À MÃO ────────┐
 * │ A fileira da Central de Candidatos tem CINCO blocos com rótulo, ícone e cor escritos no JSX, │
 * │ e o preço disso é conhecido: a etapa NOVA que o diretor cadastrar não ganha card e some      │
 * │ dentro do card de Aprovação, sem nada falhar e sem ninguém perceber. Aqui a lista de etapas  │
 * │ vem do catálogo (`as_etapas_funil`, o mesmo que a tela do diretor edita) e a de desfechos    │
 * │ vem de `CANDIDATURA_SITUACOES`, que é vocabulário fechado do sistema.                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ETAPA VAZIA APARECE COM ZERO, e é por isso que a lista NÃO é lida das chaves do mapa. O
 * `porEtapa` só traz chave com número dentro (é o contrato do backend), então derivar os cards dele
 * faria a etapa recém-criada sumir da tela justamente no dia em que o time precisa ver que ninguém
 * entrou nela ainda.
 *
 * FUNÇÕES PURAS, sem React e sem rede, no padrão do `lib/` da casa: a régua se testa direto
 * (`as-vagas-funil.spec.ts`), e a tela só desenha o que elas devolvem.
 *
 * §A.6: entram códigos de etapa, situações e contagens. Nenhum dado pessoal atravessa este módulo.
 */

import {
  CANDIDATURA_SITUACOES,
  CANDIDATURA_SITUACAO_LABEL,
  type AsEtapaFunil,
  type AsOcupacaoVaga,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import type { IconName } from "@/components/ui/Icon";
import { corDoTom, etapasOrdenadas } from "@/lib/as-etapas";

/**
 * UM CARD DA FILEIRA, já resolvido: rótulo, número, cor e ícone.
 *
 * `chave` É O CÓDIGO CRU (o da etapa ou o da situação), e ela existe para a peça 2.4: quando os
 * cards virarem filtro clicável, é este valor que o filtro de Etapa vai receber. Guardá la agora
 * custa nada e evita ter de refazer a montagem inteira depois.
 */
export interface CardDeFunil {
  chave: string;
  rotulo: string;
  valor: number;
  /** Variável de cor do tema, pronta para o `style` do card. */
  cor: string;
  icone: IconName;
  /**
   * ETAPA FORA DE CIRCULAÇÃO que ainda tem gente dentro. A tela marca o card para ele não passar por
   * etapa normal do funil: quem lê precisa saber que aquela fila não recebe mais ninguém e que
   * aquelas pessoas estão paradas onde não deveriam estar. Sempre `false` nos desfechos.
   */
  inativa?: boolean;
}

/**
 * A SOMA DAS VAGAS DO RECORTE, mapa a mapa.
 *
 * SOMA O QUE O FILTRO DEIXOU PASSAR, e não a base inteira, pela mesma razão que a primeira fileira
 * já conta assim: card dizendo "Triagem: 312" ao lado de uma tabela de quatro linhas é o card
 * contradizendo a tabela na mesma tela.
 */
export function somarFunil(vagas: readonly { ocupacao: AsOcupacaoVaga }[]): {
  porEtapa: Record<string, number>;
  porDesfecho: Record<string, number>;
} {
  const porEtapa: Record<string, number> = {};
  const porDesfecho: Record<string, number> = {};
  for (const v of vagas) {
    for (const [k, n] of Object.entries(v.ocupacao.porEtapa)) porEtapa[k] = (porEtapa[k] ?? 0) + n;
    for (const [k, n] of Object.entries(v.ocupacao.porDesfecho)) {
      porDesfecho[k] = (porDesfecho[k] ?? 0) + n;
    }
  }
  return { porEtapa, porDesfecho };
}

/**
 * OS CARDS DAS ETAPAS, NA ORDEM DO FUNIL, direto do catálogo do diretor.
 *
 * QUEM ENTRA: todas as etapas ATIVAS, com ou sem gente, mais as INATIVAS que ainda têm alguém
 * dentro. A inativa vazia fica de fora porque não recebe ninguém novo e não tem o que mostrar.
 *
 * ┌─ A INATIVA COM GENTE DENTRO NÃO É HIPÓTESE, É CAMINHO ABERTO NO BACKEND ────────────────────┐
 * │ INATIVAR não é EXCLUIR: a exclusão tem as três camadas de defesa, a inativação NÃO tem, e   │
 * │ isso é comportamento decidido e travado em teste. O diretor pode tirar de circulação uma     │
 * │ etapa que ainda tem gente viva parada nela, e essas pessoas continuam contadas em `porEtapa`,│
 * │ com a chave da etapa inativada, de propósito.                                                │
 * │                                                                                              │
 * │ POR ISSO O CATÁLOGO LIDO É O COMPLETO (`?incluirInativas=1`, que é o que `useEtapas` já      │
 * │ busca): com ele, a contagem aparece com o RÓTULO e a COR de verdade da etapa, marcada como   │
 * │ fora de circulação. Montando a fileira só com as ativas, essa gente sumiria da tela em       │
 * │ silêncio, sem erro nenhum, que é o pior desfecho possível para um indicador.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ÍCONE É O MESMO EM TODAS, e isso é deliberado: o catálogo do diretor tem cor, não tem ícone, e
 * um mapa de ícones por etapa escrito aqui seria a lista à mão que este arquivo existe para não ter,
 * com a etapa nova nascendo sem ícone. Quem distingue os cards é a COR que ele escolheu, mais a
 * ordem do funil. `users` é a gente parada naquela etapa.
 */
export function cardsDeEtapa(
  catalogo: readonly AsEtapaFunil[],
  contagem: Record<string, number>,
): CardDeFunil[] {
  return etapasOrdenadas(catalogo)
    .filter((e) => e.ativa || (contagem[e.codigo] ?? 0) > 0)
    .map((e) => ({
      chave: e.codigo,
      rotulo: e.rotulo,
      valor: contagem[e.codigo] ?? 0,
      cor: corDoTom(e.tom),
      icone: "users" as IconName,
      inativa: !e.ativa,
    }));
}

/**
 * O RÓTULO DO CARD, no PLURAL, porque card de contagem fala de um grupo e não de uma pessoa
 * ("Aprovados: 12", nunca "Aprovado: 12"). §A.24: é etiqueta, então title case.
 *
 * É UM MAPA PARCIAL DE PROPÓSITO, com fallback no rótulo compartilhado: situação nova no
 * vocabulário do sistema continua ganhando card, com o rótulo do singular até alguém escrever o
 * plural dela. Card feio, e nunca contagem invisível.
 */
const DESFECHO_ROTULO: Partial<Record<CandidaturaSituacao, string>> = {
  APROVADO: "Aprovados",
  ALOCADO: "Alocados",
  DESCARTADO: "Descartados Pela Seleção",
  DESISTIU: "Desistentes",
  ENVIADO_PARA_ADMISSAO: "Enviados Para Admissão",
};

/**
 * A COR E O ÍCONE DE CADA DESFECHO. Aqui um mapa escrito é legítimo, e a diferença para as etapas é
 * de natureza: a lista de situações é VOCABULÁRIO DO SISTEMA (fechado, com regra de negócio), não
 * cadastro do diretor. Ainda assim a lista dos cards vem de `CANDIDATURA_SITUACOES`, e não daqui:
 * situação nova aparece na fileira mesmo sem cor própria.
 *
 * §A.12: verde é êxito, vermelho é saída sem êxito. Aprovado, alocado e enviado para admissão são
 * os três desfechos BONS (o contrato diz isso com todas as letras: "desfecho" não quer dizer "saiu
 * mal"); descartado e desistiu são as saídas.
 */
const DESFECHO_VISUAL: Partial<Record<CandidaturaSituacao, { cor: string; icone: IconName }>> = {
  APROVADO: { cor: "var(--ok)", icone: "check" },
  ALOCADO: { cor: "var(--ok)", icone: "tag" },
  ENVIADO_PARA_ADMISSAO: { cor: "var(--ok)", icone: "arr" },
  DESCARTADO: { cor: "var(--danger)", icone: "x" },
  DESISTIU: { cor: "var(--danger)", icone: "logout" },
};

/**
 * OS CARDS DOS DESFECHOS, na ordem do vocabulário.
 *
 * `ATIVO` FICA DE FORA, e não por omissão: quem está ATIVO é quem está EM SELEÇÃO, e essa gente já
 * está contada, uma a uma, nos cards das etapas. Contá la aqui de novo somaria a mesma pessoa duas
 * vezes na mesma fileira.
 *
 * TODOS APARECEM, inclusive zerados, pelo mesmo motivo das etapas: a fileira é o mapa do que
 * aconteceu com quem passou pela vaga, e desfecho sem ninguém é uma informação, não um vazio.
 */
export function cardsDeDesfecho(contagem: Record<string, number>): CardDeFunil[] {
  return CANDIDATURA_SITUACOES.filter((s) => s !== "ATIVO").map((s) => {
    const visual = DESFECHO_VISUAL[s];
    return {
      chave: s,
      rotulo: DESFECHO_ROTULO[s] ?? CANDIDATURA_SITUACAO_LABEL[s],
      valor: contagem[s] ?? 0,
      cor: visual?.cor ?? "var(--dim)",
      icone: visual?.icone ?? ("layers" as IconName),
    };
  });
}
