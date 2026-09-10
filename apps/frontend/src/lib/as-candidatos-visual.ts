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
 * ─ O TOM DA ETAPA MUDOU DE CASA: ELE VIVE EM `lib/as-etapas.ts` ────────────────────────────────
 *
 * AQUI HAVIA UM `Record<CandidaturaEtapa, PillTone>` com as cinco etapas escritas à mão, e o
 * comentário dele dizia, com todas as letras, que o `Record` existia para o COMPILADOR EXIGIR a cor
 * de toda etapa nova. Essa garantia morreu por decisão de modelo, não por descuido: a lista de
 * etapas passou a ser DADO DO DIRETOR (`as_etapas_funil`), e código não pode exigir entrada numa
 * lista que o usuário edita na tela.
 *
 * A COR AGORA É COLUNA DA TABELA (`tom`, da paleta fechada `ETAPA_TONS`), e quem resolve é
 * `tomDaEtapa(codigo, catalogo)`, em `lib/as-etapas.ts`, com FALLBACK explícito e testado no lugar
 * da exaustividade perdida. O `dg` continua fora da paleta pelo mesmo motivo de sempre (§A.12:
 * vermelho é recusa, e etapa de funil é posição, não julgamento), só que agora a exclusão está no
 * vocabulário compartilhado, valendo para o banco, para o serviço e para o seletor de cor de uma
 * vez só, em vez de valer por acordo entre três listas.
 *
 * `tomDaSituacao` e `tomDoStatusVaga` FICAM AQUI: as duas listas continuam sendo vocabulário fixo
 * com REGRA (quem ocupa posição, quem é saída sem êxito), e é justamente por isso que elas não
 * viraram catálogo editável.
 */

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

/** O tom de um status de vaga. Forma de função, para casar com `tomDaSituacao`. */
export function tomDoStatusVaga(s: VagaStatus): PillTone {
  return TOM_STATUS_VAGA[s];
}
