/**
 * ─ A TRILHA DA VAGA: EM QUE PÉ ELA ESTÁ, LIDO E NUNCA GUARDADO ────────────────────────────────
 *
 * SÃO DOIS EIXOS INDEPENDENTES, E CONFUNDI-LOS É O DEFEITO QUE ESTA PEÇA EXISTE PARA NÃO REPETIR.
 * O diretor descreveu quatro coisas (processo seletivo concluído, vaga aberta, entregue ao ADM,
 * fechada) e elas NÃO são quatro degraus de uma fila. São duas perguntas diferentes, respondidas
 * por dados diferentes:
 *
 *   PROCESSO SELETIVO   a vaga já entregou o que prometeu?   DERIVADO, muda sozinho quando alguém
 *                                                            é alocado, e volta atrás se a meta subir.
 *   DESFECHO            como ela terminou?                   MARCADO À MÃO no fechamento, uma vez só.
 *
 * Desenhá-los como uma fila só faria a vaga que preencheu todas as posições parecer encerrada, que
 * é justamente o contrário do que o desenho pede: ela CONTINUA ABERTA (recebe candidato, aceita
 * correção, a meta ainda é editável) e só mostra que o processo acabou.
 *
 * NENHUMA ROTA NOVA, E ESTE É O PONTO. Tudo aqui sai do que a listagem de vagas JÁ TRAZ: o status,
 * a meta oficial, o carimbo `enviarParaAdmissao` e a ocupação derivada. Nada é buscado, nada é
 * contado por esta tela: a contagem de posições preenchidas vem de `preenchidas` (a régua validada
 * pelo diretor em 07/09), e é por isso que a trilha NUNCA pode discordar do cilindro da tabela.
 * Recalcular aqui criaria a segunda conta, que é como duas telas passam a dizer números diferentes.
 *
 * "ENVIADA PARA ADMISSÃO" É UMA INTENÇÃO DECLARADA, E A FRASE DIZ ISSO. O EA não sabe se a admissão
 * nasceu: a ponte com a esteira (`as_candidaturas.admissao_id`) está dormente. O rótulo registra o
 * que foi escolhido no fechamento e a frase de apoio avisa que confirmação não existe ainda, em vez
 * de fingir um fato. No dia da ponte, o estado passa a ser derivável de verdade e melhora sem
 * quebrar.
 *
 * §A.11 (sem travessão), §A.24 (title case nos rótulos, que são TAG; as frases são texto de apoio e
 * seguem escrita normal).
 */

import type { VagaListItem } from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";
import { preenchidas, vagaEncerrada, type VagaContagem } from "@/lib/as-vagas-ocupacao";
import { dataBr } from "@/lib/as-candidatos";

/** Onde o PROCESSO SELETIVO está. Derivado do status mais a contagem de posições entregues. */
export type TrilhaProcesso =
  | "RASCUNHO"
  | "VAGA_ABERTA"
  | "PROCESSO_CONCLUIDO"
  | "PROCESSO_ENCERRADO";

/** Como a vaga TERMINOU. Só existe depois do fechamento; antes dele, a resposta é "ainda não". */
export type TrilhaDesfecho =
  | "AINDA_NAO_ENCERRADA"
  | "ENVIADA_PARA_ADMISSAO"
  | "FINALIZADA_NA_AS"
  | "FECHADA_SEM_ENTREGA"
  | "CANCELADA";

/**
 * O RECORTE DA VAGA que a trilha lê. Ela reaproveita o `VagaContagem` da régua de ocupação em vez de
 * redeclarar os mesmos campos: assim, se aquela régua passar a ler um campo novo, a trilha herda a
 * exigência em vez de compilar com um objeto incompleto.
 */
export type VagaTrilha = VagaContagem &
  Pick<VagaListItem, "posicoesOficiais" | "enviarParaAdmissao" | "dataFechamento">;

/** Um lado da trilha, pronto para a tela: a etiqueta, o tom da pill e a frase que explica. */
export interface LadoDaTrilha<E> {
  estado: E;
  /** TAG, então title case (§A.24). */
  rotulo: string;
  tom: PillTone;
  /** Texto de apoio: escrita normal, sem travessão (§A.11/§A.24). */
  frase: string;
}

export interface TrilhaDaVaga {
  processo: LadoDaTrilha<TrilhaProcesso>;
  desfecho: LadoDaTrilha<TrilhaDesfecho>;
}

export const TRILHA_PROCESSO_ROTULO: Record<TrilhaProcesso, string> = {
  RASCUNHO: "Rascunho",
  VAGA_ABERTA: "Vaga Aberta",
  PROCESSO_CONCLUIDO: "Processo Seletivo Concluído",
  PROCESSO_ENCERRADO: "Processo Seletivo Encerrado",
};

export const TRILHA_DESFECHO_ROTULO: Record<TrilhaDesfecho, string> = {
  AINDA_NAO_ENCERRADA: "Ainda Não Encerrada",
  ENVIADA_PARA_ADMISSAO: "Enviada Para Admissão",
  FINALIZADA_NA_AS: "Finalizada Na A&S",
  FECHADA_SEM_ENTREGA: "Fechada Sem Entrega",
  CANCELADA: "Cancelada",
};

/**
 * O TOM DE CADA ESTADO (§A.12: o ícone da pill acompanha o estado real, e quem escolhe o ícone é o
 * tom). Êxito é check verde, trabalho em andamento é exclamação amarela, encerramento sem êxito é X
 * vermelho, e o neutro é o estado que ainda não é nenhum dos três.
 *
 * `PROCESSO_ENCERRADO` É NEUTRO DE PROPÓSITO, e não verde: quem diz se a vaga terminou BEM é o
 * desfecho, ao lado. Pintar o encerramento de verde diria "entregou" também na vaga que fechou sem
 * ninguém.
 */
export const TRILHA_PROCESSO_TOM: Record<TrilhaProcesso, PillTone> = {
  RASCUNHO: "nt",
  VAGA_ABERTA: "wn",
  PROCESSO_CONCLUIDO: "ok",
  PROCESSO_ENCERRADO: "nt",
};

export const TRILHA_DESFECHO_TOM: Record<TrilhaDesfecho, PillTone> = {
  AINDA_NAO_ENCERRADA: "nt",
  ENVIADA_PARA_ADMISSAO: "ok",
  FINALIZADA_NA_AS: "ok",
  FECHADA_SEM_ENTREGA: "nt",
  CANCELADA: "dg",
};

/**
 * O PLURAL CERTO, e ele custou uma correção na primeira leitura da tela: "com 1 posição oficial
 * preenchidas" apareceu na PS-2026-001, porque o substantivo concordava e o particípio não. As duas
 * peças andam juntas por isso, e quem escrever frase nova usa as duas.
 */
function posicoes(n: number): string {
  return n === 1 ? "1 posição oficial" : `${n} posições oficiais`;
}

function preenchidasTexto(n: number): string {
  return n === 1 ? "preenchida" : "preenchidas";
}

/**
 * EM QUE PÉ ESTÁ O PROCESSO SELETIVO.
 *
 * META NULA OU ZERO NUNCA CONCLUI, e isso é decisão de segurança da leitura, não descuido: sem meta
 * não há o que comparar, e `0 >= 0` diria "processo concluído" para uma vaga que não prometeu
 * posição nenhuma. Nesse caso ela continua sendo uma vaga aberta, que é o que ela é.
 */
export function processoDaVaga(v: VagaTrilha): TrilhaProcesso {
  if (v.status === "RASCUNHO") return "RASCUNHO";
  if (vagaEncerrada(v.status)) return "PROCESSO_ENCERRADO";
  const meta = v.posicoesOficiais;
  if (meta !== null && meta > 0 && preenchidas(v, "oficial") >= meta) return "PROCESSO_CONCLUIDO";
  return "VAGA_ABERTA";
}

/**
 * COMO A VAGA TERMINOU.
 *
 * A ORDEM DAS PERGUNTAS IMPORTA, e ela está escrita assim de propósito: CANCELADA vence tudo, porque
 * vaga cancelada não entregou nada, nem que alguém tenha marcado o envio para admissão antes de
 * cancelar. Depois vem a intenção declarada, e por último a contagem, que é o que separa "encerrou
 * entregando" de "encerrou sem ninguém".
 */
export function desfechoDaVaga(v: VagaTrilha): TrilhaDesfecho {
  if (!vagaEncerrada(v.status)) return "AINDA_NAO_ENCERRADA";
  if (v.status === "CANCELADA") return "CANCELADA";
  if (v.enviarParaAdmissao) return "ENVIADA_PARA_ADMISSAO";
  return preenchidas(v, "oficial") > 0 ? "FINALIZADA_NA_AS" : "FECHADA_SEM_ENTREGA";
}

function fraseDoProcesso(v: VagaTrilha, estado: TrilhaProcesso): string {
  const meta = v.posicoesOficiais;
  const feitas = preenchidas(v, "oficial");
  if (estado === "RASCUNHO") {
    return "A vaga ainda não foi publicada, então o processo seletivo não começou.";
  }
  if (estado === "PROCESSO_ENCERRADO") {
    return v.dataFechamento
      ? `O processo seletivo terminou em ${dataBr(v.dataFechamento)}.`
      : "O processo seletivo terminou.";
  }
  if (estado === "PROCESSO_CONCLUIDO") {
    const m = meta ?? 0;
    return `${posicoes(m)} ${preenchidasTexto(m)}. A vaga segue aberta para correção até alguém fechá-la.`;
  }
  if (meta === null) return "A vaga está aberta e ainda não tem meta de posições oficiais.";
  if (meta === 0) return "A vaga está aberta e não reservou posição oficial nenhuma.";
  return `A vaga está aberta, com ${feitas} de ${posicoes(meta)} ${preenchidasTexto(meta)}.`;
}

function fraseDoDesfecho(v: VagaTrilha, estado: TrilhaDesfecho): string {
  switch (estado) {
    case "AINDA_NAO_ENCERRADA":
      return "A vaga ainda não foi encerrada, então ela não tem desfecho registrado.";
    case "ENVIADA_PARA_ADMISSAO":
      /*
       * A RESSALVA É OBRIGATÓRIA, e não é excesso de zelo. Este estado é a INTENÇÃO registrada no
       * fechamento, e não a confirmação de que a admissão nasceu: o EA não tem como saber disso
       * hoje. Sem a frase, a tela afirmaria um fato que ela não mediu.
       */
      return "Intenção registrada no fechamento. O EA ainda não confirma a admissão: a ponte com a esteira admissional é frente separada.";
    case "FINALIZADA_NA_AS":
      return `Encerrada na Atração e Seleção, com ${posicoes(preenchidas(v, "oficial"))} ${preenchidasTexto(preenchidas(v, "oficial"))}, sem envio para admissão.`;
    case "FECHADA_SEM_ENTREGA":
      return "A vaga foi encerrada sem nenhuma posição oficial preenchida.";
    case "CANCELADA":
      return "A vaga foi cancelada.";
  }
}

/** Os dois lados da trilha, prontos para desenhar. É a única função que a tela precisa chamar. */
export function trilhaDaVaga(v: VagaTrilha): TrilhaDaVaga {
  const processo = processoDaVaga(v);
  const desfecho = desfechoDaVaga(v);
  return {
    processo: {
      estado: processo,
      rotulo: TRILHA_PROCESSO_ROTULO[processo],
      tom: TRILHA_PROCESSO_TOM[processo],
      frase: fraseDoProcesso(v, processo),
    },
    desfecho: {
      estado: desfecho,
      rotulo: TRILHA_DESFECHO_ROTULO[desfecho],
      tom: TRILHA_DESFECHO_TOM[desfecho],
      frase: fraseDoDesfecho(v, desfecho),
    },
  };
}
