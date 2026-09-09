/**
 * ─ AS RÉGUAS DAS AÇÕES DO PAINEL DA VAGA (etapa 5 da tela unificada de vagas) ─────────────────
 *
 * A etapa 4 entregou o painel SÓ DE LEITURA. Esta etapa é a que AGE: alocar alguém na vaga, entregar
 * uma posição, mover no funil, abrir a ficha. Toda decisão de "esta ação está disponível agora?" mora
 * aqui, e não dentro do componente, por dois motivos:
 *
 *  1. ELAS PRECISAM DE TESTE. São perguntas de uma linha cada e erram em silêncio: uma ação oferecida
 *     onde o backend recusa vira um botão que só sabe falhar, e uma ação escondida onde o backend
 *     aceita vira um beco. As duas falhas são invisíveis na revisão de um componente de 400 linhas.
 *  2. ELAS SÃO ESPELHO DE UMA AUTORIDADE QUE É DO BACKEND. Cada função aqui aponta a trava que ela
 *     espelha. Quando as duas discordam, a autoridade é sempre a de lá, e é a mensagem dele que a
 *     tela mostra.
 *
 * NENHUMA LISTA NOVA DE SITUAÇÃO É ESCRITA NESTE ARQUIVO, e isso é regra e não estilo. O vocabulário
 * do funil (`candidaturaViva`, `ehSaidaSemExito`, `finalizaPosicao`, `consomePosicao`) já está
 * declarado em `@ea/shared-types`, lido pelo backend e pela tela. Uma segunda lista aqui concordaria
 * com a primeira por coincidência, e divergiria dela no dia em que uma situação nova entrasse em uma
 * das duas. Foi exatamente esse defeito que a etapa 4 pagou: a `ALOCADO` nasceu no vocabulário e
 * ficou de fora de três lugares que tinham a lista escrita à mão.
 *
 * §A.11 (sem travessão), §A.24 (title case só em título e etiqueta; frase de apoio é escrita normal).
 */

import {
  candidaturaViva,
  finalizaPosicao,
  POSICAO_LADOS,
  VAGA_STATUS,
  type CandidaturaSituacao,
  type PosicaoLado,
  type VagaListItem,
  type VagaStatus,
} from "@ea/shared-types";
import { preenchidas, vagaEncerrada, type LadoPosicoes, type VagaContagem } from "@/lib/as-vagas-ocupacao";

// ── OS DOIS LADOS DA META ───────────────────────────────────────────────────

/**
 * OS DOIS LADOS DA POSIÇÃO, agora REEXPORTADOS do vocabulário compartilhado.
 *
 * O PEDIDO QUE ESTAVA ESCRITO AQUI FOI ATENDIDO (09/09): o par subiu para `@ea/shared-types`, porque
 * deixou de ser assunto interno da gravação no momento em que a lista de alocados passou a mostrar
 * "oficial ou banco" em cada linha. Com ele lá, a cópia local perdeu a razão de existir, e o backend
 * (`domain/candidatura.ts`) fez o mesmo movimento no mesmo dia.
 *
 * DUAS LISTAS COM OS MESMOS DOIS VALORES concordam no dia em que são escritas e divergem na primeira
 * vez que alguém acrescenta um lado novo em uma só. Reexportar é o que impede isso, e mantém intacto
 * quem já lia daqui: todo o resto da tela continua importando deste arquivo.
 *
 * A CORRESPONDÊNCIA COM `LadoPosicoes` (o "oficial"/"banco" minúsculo da régua do cilindro) é feita em
 * `ladoDoCilindro`, uma vez só. Sem ela, cada chamada faria a tradução na mão, e uma delas erraria.
 */
export { POSICAO_LADOS };
export type { PosicaoLado };

/** ETIQUETA, então title case (§A.24). */
export const POSICAO_LADO_LABEL: Record<PosicaoLado, string> = {
  OFICIAL: "Posição Oficial",
  BANCO: "Posição De Banco",
};

/** O nome que a régua do cilindro (`as-vagas-ocupacao`) usa para o mesmo lado. */
export function ladoDoCilindro(lado: PosicaoLado): LadoPosicoes {
  return lado === "OFICIAL" ? "oficial" : "banco";
}

/**
 * O RÓTULO DO LADO VINDO DE UM CAMPO SOLTO (`string | null`), como o histórico da candidatura serve.
 *
 * O CONTRATO DO HISTÓRICO NÃO TIPA O LADO, e não é descuido: a coluna nasceu como TEXTO COM CHECK no
 * banco, e não como enum do Postgres, por uma limitação medida do migrador (valor criado por
 * `ALTER TYPE ... ADD VALUE` não pode ser usado na transação em que nasceu). O tipo honesto do que
 * trafega é `string`, e é a tela que precisa decidir o que fazer com um valor que não reconhece.
 *
 * VALOR DESCONHECIDO DEVOLVE NULO, e a linha do histórico simplesmente não mostra o lado. A
 * alternativa seria imprimir o valor cru, e aí um dia o consultor leria "BANCO" em caixa alta no meio
 * de uma frase em português, que é como um dado interno vaza para a tela sem nada falhar.
 */
export function rotuloDoLado(lado: string | null | undefined): string | null {
  const conhecido = POSICAO_LADOS.find((l) => l === lado);
  return conhecido ? POSICAO_LADO_LABEL[conhecido] : null;
}

/**
 * ─ O RÓTULO CURTO DO LADO, para a COLUNA que já se chama "Posição" (grupo 2) ──────────────────
 *
 * O LONGO CONTINUA SENDO O LONGO, e os dois existem porque respondem em contextos diferentes. Nos
 * CARTÕES da finalização, "Posição Oficial" e "Posição De Banco" são a frase inteira da escolha, e
 * ali o substantivo é necessário. Dentro de uma CÉLULA cujo cabeçalho já diz "Posição", repeti-lo é
 * dizer a mesma palavra duas vezes e cobrar por isso quase 100px de largura, que saem justamente da
 * coluna do nome (§A.20).
 *
 * NÃO É UMA SEGUNDA RÉGUA, são dois textos da MESMA régua: o catálogo continua sendo `POSICAO_LADOS`
 * e o valor desconhecido continua devolvendo nulo, exatamente como no rótulo longo. Lado novo entra
 * pelo mesmo lugar e falta nos dois mapas de uma vez, que é o comportamento que se quer.
 *
 * §A.24: é ETIQUETA de pill, então title case.
 */
export const POSICAO_LADO_LABEL_CURTO: Record<PosicaoLado, string> = {
  OFICIAL: "Oficial",
  BANCO: "Banco",
};

/** O rótulo curto a partir de um campo solto (`string | null`), na régua do `rotuloDoLado`. */
export function rotuloCurtoDoLado(lado: string | null | undefined): string | null {
  const conhecido = POSICAO_LADOS.find((l) => l === lado);
  return conhecido ? POSICAO_LADO_LABEL_CURTO[conhecido] : null;
}

/**
 * ─ A FRASE DO ACEITE QUE ATRAVESSOU UMA GUARDA (§A.3 regra 8) ─────────────────────────────────
 *
 * A TELA JÁ PROMETIA ISTO E NÃO ENTREGAVA. O modal de confirmação do banco diz ao consultor, com
 * estas palavras, que "o aceite fica registrado no histórico desta candidatura", e o histórico não
 * mostrava nada. Uma tela que promete trilha e não a exibe é pior do que nenhuma trilha, porque quem
 * confia nela para de conferir.
 *
 * A FRASE DIZ "NAQUELE MOMENTO", pelo mesmo motivo da trilha do fechamento forçado: `aceiteNumero` é
 * o estado CONGELADO no instante da decisão, e a vaga andou depois disso. No presente, a frase
 * afirmaria sobre um número que já não é o de agora.
 *
 * NÚMERO AUSENTE NÃO APAGA O ACEITE: o registro do que foi atravessado vale por si, e some só o
 * pedaço que não foi guardado. Guarda desconhecida devolve nulo, pelo mesmo motivo do `rotuloDoLado`.
 *
 * §A.6: o nome da guarda e um número de posições da vaga. Nenhum dado de candidato.
 * §A.24: isto é frase de apoio, então escrita normal, maiúscula só na primeira palavra.
 */
export function fraseDoAceite(aceite: string | null | undefined, numero: number | null): string | null {
  if (aceite === "BANCO_COM_OFICIAIS_ABERTAS") {
    if (numero === null || numero === undefined) {
      return "Ciente de que a vaga ainda tinha posição oficial aberta.";
    }
    return numero === 1
      ? "Ciente de que a vaga tinha 1 posição oficial aberta naquele momento."
      : `Ciente de que a vaga tinha ${numero} posições oficiais abertas naquele momento.`;
  }
  if (aceite === "REENTRADA") {
    return "Ciente de que o processo anterior desta pessoa nesta vaga já tinha sido encerrado.";
  }
  return null;
}

/** O RECORTE DA VAGA que estas réguas leem: a contagem do cilindro mais as duas metas. */
export type VagaAcoes = VagaContagem & Pick<VagaListItem, "posicoesOficiais" | "posicoesBanco">;

/**
 * A META DAQUELE LADO. Nula SÓ no oficial, e essa assimetria é do modelo: `posicoesOficiais` é
 * anulável (a vaga pode nascer sem meta definida, e o backend recusa aprovar nesse caso com uma frase
 * própria), enquanto `posicoesBanco` é um número que nasce zerado.
 */
export function metaDoLado(v: VagaAcoes, lado: PosicaoLado): number | null {
  return lado === "OFICIAL" ? v.posicoesOficiais : v.posicoesBanco;
}

/**
 * QUANTAS POSIÇÕES DAQUELE LADO JÁ ESTÃO PREENCHIDAS. DELEGA para `preenchidas`, a régua validada
 * pelo diretor em 07/09 que enche o cilindro da tabela, em vez de contar de novo: uma segunda conta
 * aqui é como o cilindro da tabela e o número do modal passariam a discordar na mesma tela.
 */
export function preenchidasDoLado(v: VagaAcoes, lado: PosicaoLado): number {
  return preenchidas(v, ladoDoCilindro(lado));
}

/**
 * QUANTAS POSIÇÕES OFICIAIS AINDA ESTÃO ABERTAS, para o aviso do banco poder ser dito ANTES do erro.
 *
 * É O MESMO NÚMERO DO BACKEND, e não uma segunda conta: `ocupacao.livres` é servido pelo contrato como
 * "a meta oficial menos quem ocupa posição DO LADO OFICIAL, com piso em zero", que é a definição do
 * `oficiaisAindaAbertas` que dispara o 409. Nulo quer dizer vaga sem meta oficial, e nesse caso não há
 * posição oficial aberta a defender.
 *
 * O AVISO DA TELA NÃO É A TRAVA. A trava é o 409 do backend, medido dentro da transação com a linha da
 * vaga travada. Este número serve para o consultor ver o que vai acontecer antes de clicar; se os dois
 * discordarem por uma corrida entre dois consultores, quem vale é o 409.
 */
export function oficiaisAbertas(v: VagaAcoes): number | null {
  return v.ocupacao?.livres ?? null;
}

// ── QUANDO CADA AÇÃO EXISTE ─────────────────────────────────────────────────

/**
 * ESTA VAGA RECEBE CANDIDATO NOVO? Espelha a trava 2 do backend (`vagaRecebeCandidato`), e a lista de
 * quem NÃO recebe é a MESMA de `VAGA_STATUS_ENCERRADOS` (ENTREGUE, FECHADA, CANCELADA), que a régua do
 * cilindro já declarava. Por isso esta função é uma negação e não uma lista: escrever os três status de
 * novo criaria a segunda cópia que a etapa 4 tomou o cuidado de não criar.
 *
 * O RASCUNHO RECEBE, e isso é do backend, não descuido: a vaga salva pela metade é estado legítimo de
 * trabalho, e barrar a alocação nela obrigaria o time a publicar antes de começar a captar.
 */
export function vagaRecebeCandidato(status: VagaStatus): boolean {
  return !vagaEncerrada(status);
}

/**
 * ESTA CANDIDATURA SE MOVE NO FUNIL?
 *
 * ┌─ A RÉGUA É DO DIRETOR: O ALOCADO CONTINUA NO FUNIL ────────────────────────────────────────┐
 * │ A resposta é `candidaturaViva`. Quem preencheu a posição não saiu do processo, e quem foi    │
 * │ aprovado nem desfecho teve: os dois continuam andando de etapa. Só quem saiu SEM ÊXITO       │
 * │ (descartado, desistiu) para de se mover, e o caminho dele é a reentrada.                     │
 * │                                                                                              │
 * │ ESTA FUNÇÃO JÁ RESPONDEU "SÓ EM SELEÇÃO", e o registro do porquê importa: ela espelhava a    │
 * │ trava antiga do `moverEtapa` (`if (c.situacao !== "ATIVO")`), que recusava o alocado com a    │
 * │ frase "já foi encerrada e não avança mais de etapa". A frase era FALSA, e o espelho estava    │
 * │ certo em não oferecer um botão que só sabia falhar. O que mudou é a autoridade do outro lado: │
 * │ a trava do backend passou a ser `candidaturaViva`, e a tela acompanha.                        │
 * │                                                                                              │
 * │ O TESTE DESTA FUNÇÃO É ESCRITO CONTRA A RÉGUA DO DIRETOR, e não contra o backend de ontem.   │
 * │ Ele afirmava `podeMoverNoFunil(s) === (s === "ATIVO")`, ou seja, cimentava como REQUISITO o   │
 * │ que o próprio autor documentou como defeito. Um teste assim não protege a régua, ele protege  │
 * │ o bug: no dia em que a régua certa chegasse, o teste é que quebraria.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA LISTA NOVA: `candidaturaViva` é do vocabulário compartilhado, lido pelo backend e pela
 * tela. Situação nova nasce viva por construção (a derivação é o complemento de `ehSaidaSemExito`).
 */
export function podeMoverNoFunil(s: CandidaturaSituacao): boolean {
  return candidaturaViva(s);
}

/**
 * ─ OS STATUS QUE A TRILHA DE PUBLICAÇÃO ACEITA (item 5, a porta que a auditoria vetou) ────────
 *
 * O SELETOR DE STATUS DO FORMULÁRIO OFERECIA "Fechada" E "Cancelada", e essa era uma porta que
 * ENCERRAVA A VAGA sem passar por trava nenhuma: nenhuma conferência de posição oficial, nenhum
 * papel de Master, nenhuma trilha. O mesmo estado que o `POST /fechar` só entrega depois da régua do
 * diretor saía daqui com um clique e um "Publicar". A auditoria de segurança vetou a frente por
 * causa disso, e a correção é a tela PARAR DE OFERECER O GESTO.
 *
 * RASCUNHO TAMBÉM NÃO ESTÁ AQUI, e pelo motivo que já valia: ele é o BOTÃO "Salvar Rascunho", não
 * uma escolha de status. Dois caminhos para o mesmo estado, e o segundo publicaria uma vaga chamando
 * a de rascunho.
 *
 * A LISTA É DERIVADA DO CATÁLOGO, e não escrita à mão: status novo entra na tela por construção, e
 * quem quiser tirá-lo de lá precisa dizer o nome dele aqui. O contrário (lista fixa) faria status
 * novo nascer invisível, que é o mesmo erro com o sinal trocado.
 *
 * A TELA NÃO É A TRAVA, e isto continua valendo aqui: quem recusa encerrar a vaga por este caminho é
 * o backend. Esta lista é o que a tela OFERECE.
 */
export const VAGA_STATUS_PUBLICACAO: readonly VagaStatus[] = VAGA_STATUS.filter(
  (s) => s !== "RASCUNHO" && s !== "FECHADA" && s !== "CANCELADA",
);

/**
 * ESTA CANDIDATURA AINDA ACEITA UMA DECISÃO? (descartar, desistir, enviar para a admissão)
 *
 * É `candidaturaViva`, a MESMA resposta de `podeMoverNoFunil` desde que a régua do alocado entrou.
 * AS DUAS FUNÇÕES CONTINUAM SEPARADAS DE PROPÓSITO, e fundi-las agora seria confundir concordância
 * com identidade: elas espelham travas DIFERENTES do backend (`moverEtapa` de um lado,
 * `registrarSaida` do outro), e o dia em que uma das duas ganhar uma condição própria é o dia em que
 * a fusão precisaria ser desfeita, com todos os chamadores já apontando para o nome errado.
 *
 * O MODAL é o mesmo dos dois casos, e é ele que decide o que mostrar dentro: o funil aparece para
 * quem se move, os desfechos aparecem para todo mundo que ainda aceita decisão.
 */
export function podeDecidir(s: CandidaturaSituacao): boolean {
  return candidaturaViva(s);
}

/**
 * ESTA CANDIDATURA PODE APROVAR?
 *
 * SÓ EM SELEÇÃO, E A RAZÃO É DE INTEGRIDADE, não de coerência de tela: `aprovar` NÃO exige candidatura
 * viva nem situação nenhuma no backend, então aprovar alguém que já está ALOCADO gravaria `APROVADO`
 * por cima da entrega, ou seja, DESFARIA a posição entregue com um clique que parece inofensivo.
 * Enquanto o modal escondia tudo de quem não era `ATIVO`, essa porta estava fechada por acidente; ao
 * abrir o modal para o alocado, ela precisa ser fechada de propósito.
 */
export function podeAprovar(s: CandidaturaSituacao): boolean {
  return s === "ATIVO";
}

/**
 * ESTA CANDIDATURA PODE ENTREGAR UMA POSIÇÃO?
 *
 * DUAS CONDIÇÕES, as duas do vocabulário compartilhado:
 *  - `candidaturaViva`: quem saiu sem êxito não entrega posição. É a trava 5 do backend, que recusa a
 *    finalização sobre linha morta e manda a pessoa pelo caminho da reentrada, onde o motivo e a data
 *    do descarte aparecem antes de alguém escolher de novo quem já foi recusado.
 *  - `!finalizaPosicao`: quem JÁ entregou não entrega de novo. O ALOCADO não some da lista (ele
 *    continua na vaga e o painel continua mostrando), mas oferecer "finalizar posição" para ele seria
 *    oferecer o estado em que ele já está.
 */
export function podeFinalizarPosicao(s: CandidaturaSituacao): boolean {
  return candidaturaViva(s) && !finalizaPosicao(s);
}
