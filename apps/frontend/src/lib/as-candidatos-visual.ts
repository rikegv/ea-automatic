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
  ETAPA_TOM_PADRAO,
  consomePosicao,
  ehSaidaSemExito,
  type CandidaturaSituacao,
  type VagaStatusItem,
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
 * `tomDaSituacao` FICA AQUI e continua sendo DERIVADA do vocabulário fixo com REGRA (quem ocupa
 * posição, quem é saída sem êxito): situação de candidatura não é cadastro do diretor.
 *
 * `tomDoStatusVaga` TAMBÉM FICA AQUI, e deixou de ser um mapa: o STATUS DA VAGA virou catálogo
 * editável (onda B2), então a função passou a receber o catálogo e a ler a cor que o diretor
 * escolheu. Ela fica neste arquivo porque é isto que ele é, régua visual sem rede.
 */

/**
 * ─ TOM DA PILL POR STATUS DA VAGA: DE MAPA EXAUSTIVO PARA CONSULTA AO CATÁLOGO (onda B2) ───────
 *
 * AQUI MORAVA `TOM_STATUS_VAGA`, um `Record<VagaStatus, PillTone>` com os cinco status escritos à
 * mão. Ele SÓ COMPILAVA porque a lista era fechada; com o status virando catálogo do diretor, a
 * exaustividade que o TypeScript garantia deixou de existir, e o mapa passaria a ser mais uma cópia
 * que envelhece: o status novo cairia em `undefined` e a pill sairia SEM CLASSE DE COR, cinza e sem
 * ícone, sem nada falhar.
 *
 * QUEM ESCOLHE A COR AGORA É O DIRETOR, na coluna `tom` do catálogo, exatamente como já acontece com
 * as etapas do funil: a cor que ele escolhe no gerenciador é a cor que a pill mostra aqui, no card
 * da Central de Vagas e no seletor, sem três lugares para acertar.
 *
 * O FALLBACK É O NEUTRO (`ETAPA_TOM_PADRAO`), e NUNCA o vermelho: pela §A.12 o `dg` é RECUSA, e a
 * `StatusPill` põe o X vermelho nele. Um status que a tela ainda não conhece não é uma recusa.
 *
 * §A.12 SEGUE VALENDO: o ícone continua acompanhando o estado real, porque a `StatusPill` o deriva
 * do tom, e o tom agora vem da linha do catálogo em vez de um mapa local.
 *
 * O CATÁLOGO É PARÂMETRO OBRIGATÓRIO, e isso é deliberado: este arquivo é importado por componentes
 * de RENDERIZAÇÃO e não fala com a rede (ver o cabeçalho). Um default implícito o obrigaria a
 * conhecer o cliente HTTP; recebendo a lista de quem já a tem em mãos, ele continua sendo só régua.
 */
export function tomDoStatusVaga(codigo: string, catalogo: readonly VagaStatusItem[]): PillTone {
  return catalogo.find((s) => s.codigo === codigo)?.tom ?? ETAPA_TOM_PADRAO;
}
