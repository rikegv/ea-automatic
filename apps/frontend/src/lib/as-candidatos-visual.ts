/**
 * O TOM VISUAL DA CENTRAL DE CANDIDATOS, em um lugar só.
 *
 * §A.12: o ícone da pill acompanha o ESTADO REAL, nunca é fixo. Quem escolhe o ícone é a
 * `StatusPill` a partir do tom, então basta o tom estar certo aqui: êxito é check verde, trabalho em
 * andamento é exclamação amarela, encerrado sem êxito é X vermelho.
 *
 * Este arquivo é separado do cliente HTTP de propósito: ele é importado por componentes de
 * renderização, e não deveria arrastar junto o módulo que fala com a rede.
 */

import {
  consomePosicao,
  ehSaidaSemExito,
  type CandidaturaEtapa,
  type CandidaturaSituacao,
  type VagaStatus,
} from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";

/**
 * A SITUAÇÃO manda no tom, porque ela é o que diz se o processo deu certo, segue vivo ou acabou.
 *  - Aprovado, Alocado e Enviado Para Admissão: êxito, check verde.
 *  - Descartado: encerrado sem êxito, X vermelho.
 *  - Desistiu: também encerrado sem êxito, e vermelho pelo mesmo motivo. A pessoa saiu, e pintar de
 *    neutro faria a fila parecer viva onde ela não está.
 *  - Em Seleção: trabalho em andamento, exclamação amarela.
 *
 * ─ POR QUE O MAPA PASSOU A SER DERIVADO, e o que ele consertou (etapa 5) ──────────────────────
 *
 * `ALOCADO` NÃO TINHA RAMO e caía no `return "wn"` do fim, ou seja, a ENTREGA da posição aparecia com
 * a exclamação amarela de "trabalho em andamento". Pela §A.12 o ícone acompanha o estado real, e
 * alocado é entrega: quem preencheu a posição é êxito, e a pill precisa dizer isso.
 *
 * A CORREÇÃO NÃO É ACRESCENTAR `ALOCADO` À LISTA, é PARAR DE TER UMA LISTA. As duas perguntas já
 * estão respondidas no vocabulário compartilhado, lidas pelo backend e pela tela: `consomePosicao`
 * (aprovado mais quem finaliza) e `ehSaidaSemExito`. Derivando delas, situação nova nasce com tom
 * coerente por construção, em vez de esperar alguém lembrar de voltar aqui. Foi o esquecimento de
 * lembrar que produziu este defeito.
 */
export function tomDaSituacao(s: CandidaturaSituacao): PillTone {
  if (consomePosicao(s)) return "ok";
  if (ehSaidaSemExito(s)) return "dg";
  return "wn";
}

/**
 * CADA ETAPA COM A SUA COR, e a cor mora em UM MAPA (decisão do diretor).
 *
 * Antes eram duas cores para cinco etapas (verde na Aprovação, azul em todo o resto), então bater o
 * olho não dizia onde a pessoa estava: quatro das cinco etapas do funil eram visualmente a mesma
 * coisa. Agora cada etapa tem tom próprio, e o tom cresce com o avanço no funil: neutro na entrada,
 * azul quando o trabalho começa, amarelo e laranja nas entrevistas, verde na Aprovação.
 *
 * ─ POR QUE UM `Record` E NÃO UM `if` ────────────────────────────────────────────────────────────
 *
 * A LISTA DE ETAPAS VAI MUDAR (o diretor já decidiu a próxima), e é o `Record<CandidaturaEtapa, …>`
 * que faz a mudança custar uma linha em vez de uma releitura de tela: quem acrescentar etapa nova ao
 * vocabulário compartilhado tem o TypeScript exigindo a entrada aqui, no lugar certo, e a tela toda
 * (pill da lista, ficha, painel da vaga, modal de mover) segue lendo daqui sem ser tocada. Cor
 * espalhada em condicional pelas telas obrigaria a peça seguinte a caçar cada uma.
 *
 * ─ A PALETA, e o tom que NÃO se usa ─────────────────────────────────────────────────────────────
 *
 * Os tons são os do design system (`PillTone`), sem nenhuma cor escrita à mão, então os dois temas
 * saem de graça: cada tom já tem o seu par claro/escuro em `globals.css`. `dg` (vermelho) fica DE
 * FORA de propósito: pela §A.12 ele é recusa, e a `StatusPill` põe o X vermelho nele. Etapa de funil
 * é posição, não julgamento; pintar uma de vermelho diria que a pessoa foi reprovada por estar nela.
 * Sobram cinco tons utilizáveis para as cinco etapas de hoje, ou seja, a paleta fecha EXATA e não
 * sobra tom para uma sexta etapa (ver a nota de entrega).
 */
export const TOM_ETAPA: Record<CandidaturaEtapa, PillTone> = {
  /** Entrou na base e ainda não foi trabalhada: neutro, porque nada aconteceu com ela ainda. */
  CAPTACAO: "nt",
  /** O trabalho começou, e azul é o tom de informação do sistema. */
  TRIAGEM: "in",
  /** Em avaliação dentro de casa. */
  ENTREVISTA_SOULAN: "wn",
  /** Em avaliação no cliente, um passo adiante da anterior, e o laranja lê como esse passo. */
  ENTREVISTA_CLIENTE: "or",
  /** Fim bom do caminho: verde, como já era antes deste ajuste. */
  APROVACAO: "ok",
};

/** O tom de uma etapa do funil. Forma de função, para casar com `tomDaSituacao`. */
export function tomDaEtapa(e: CandidaturaEtapa): PillTone {
  return TOM_ETAPA[e];
}

/**
 * TOM DA PILL POR STATUS DA VAGA (§A.12: o ícone acompanha o estado real, nunca é fixo).
 *
 * SUBIU DA CENTRAL DE VAGAS PARA CÁ, sem alterar um único valor (§A.26): o resumo da vaga passou a
 * ser mostrado também DENTRO da Central de Candidatos (o modal sobreposto do "Ver vaga"), e duas
 * cópias do mesmo mapa fariam a mesma vaga aparecer com cores diferentes em duas telas. A Central de
 * Vagas importa daqui e continua chamando o mapa de `TOM_STATUS`, como sempre chamou.
 *
 * Entregue é o êxito da vaga (check verde); aberta é trabalho em andamento (exclamação amarela);
 * cancelada é o X vermelho; fechada é encerramento neutro; vaga banco é estado próprio, em azul.
 * RASCUNHO é neutro de propósito: não é trabalho em andamento (a vaga nem foi publicada) nem êxito
 * nem encerramento. É a vaga que ainda não começou.
 */
export const TOM_STATUS_VAGA: Record<VagaStatus, PillTone> = {
  RASCUNHO: "nt",
  ABERTA: "wn",
  ENTREGUE: "ok",
  FECHADA: "nt",
  CANCELADA: "dg",
};

/** O tom de um status de vaga. Forma de função, para casar com `tomDaEtapa` e `tomDaSituacao`. */
export function tomDoStatusVaga(s: VagaStatus): PillTone {
  return TOM_STATUS_VAGA[s];
}
