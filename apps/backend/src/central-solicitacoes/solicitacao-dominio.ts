import {
  SOLICITACAO_MENUS_CATALOGO,
  SOLICITACAO_STATUS_TERMINAIS,
  type SolicitacaoAcaoGestao,
  type SolicitacaoStatus,
} from "@ea/shared-types";

/**
 * REGRAS PURAS DA CENTRAL DE SOLICITAÇÕES (OST Central de Solicitações).
 *
 * Tudo aqui é função pura, testável sem banco: a validação do catálogo de telas/seções, o cálculo de
 * `diasParado` e a transição de status por ação da gestão. O service fica só com o I/O.
 */

/**
 * Resolve o rótulo da tela a partir do código do catálogo e CONFIRMA que o submenu pertence a ela.
 * Devolve `null` quando o par (código + submenu) não existe no catálogo compartilhado, que é o único
 * dono da lista (§A.39). O chamador transforma `null` em BadRequest.
 */
export function resolverMenuDoCatalogo(
  menuCodigo: string,
  submenu: string,
): { rotulo: string } | null {
  const tela = SOLICITACAO_MENUS_CATALOGO.find((m) => m.codigo === menuCodigo);
  if (!tela) return null;
  if (!tela.submenus.includes(submenu)) return null;
  return { rotulo: tela.rotulo };
}

/**
 * Dias que a solicitação está parada aguardando resolução. Status terminal (REPROVADO/CONCLUIDO)
 * congela em zero; caso contrário conta o número de dias inteiros de `criadoEm` até `agora`.
 * Nunca negativo (relógio adiantado em uma linha recém-criada devolve zero, não um número negativo).
 */
export function diasParado(
  status: SolicitacaoStatus,
  criadoEm: Date,
  agora: Date = new Date(),
): number {
  if (SOLICITACAO_STATUS_TERMINAIS.includes(status)) return 0;
  const ms = agora.getTime() - criadoEm.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/** O status de destino de cada ação da gestão. */
const STATUS_POR_ACAO: Record<SolicitacaoAcaoGestao, SolicitacaoStatus> = {
  APROVAR: "APROVADO",
  REPROVAR: "REPROVADO",
  ENVIAR_DUVIDA: "EM_DUVIDA",
  EM_ANDAMENTO: "EM_ANDAMENTO",
  CONCLUIR: "CONCLUIDO",
};

export function statusDaAcao(acao: SolicitacaoAcaoGestao): SolicitacaoStatus {
  return STATUS_POR_ACAO[acao];
}

/**
 * A mensagem padrão lançada na thread quando a gestão age sem escrever um corpo próprio. Sem
 * travessão (§A.11) e sem PII: descreve só o que a gestão fez, em pt-BR.
 */
const MENSAGEM_PADRAO_POR_ACAO: Record<SolicitacaoAcaoGestao, string> = {
  APROVAR: "A gestão aprovou esta solicitação.",
  REPROVAR: "A gestão reprovou esta solicitação.",
  ENVIAR_DUVIDA: "A gestão enviou uma dúvida sobre esta solicitação.",
  EM_ANDAMENTO: "A gestão iniciou o trabalho nesta solicitação.",
  CONCLUIR: "A gestão concluiu esta solicitação.",
};

export function mensagemPadraoDaAcao(acao: SolicitacaoAcaoGestao): string {
  return MENSAGEM_PADRAO_POR_ACAO[acao];
}

/**
 * Título e corpo da notificação enviada ao solicitante quando a gestão age. Textos em pt-BR, title
 * case no título (§A.24), sem travessão (§A.11). O corpo da dúvida leva a pergunta da gestão.
 */
export function notificacaoDaAcao(
  acao: SolicitacaoAcaoGestao,
  corpoDaGestao: string | undefined,
  menuRotulo: string,
): { titulo: string; corpo: string } {
  switch (acao) {
    case "APROVAR":
      return {
        titulo: "Solicitação Aprovada",
        corpo: `Sua solicitação sobre ${menuRotulo} foi aprovada pela gestão.`,
      };
    case "REPROVAR":
      return {
        titulo: "Solicitação Reprovada",
        corpo: `Sua solicitação sobre ${menuRotulo} foi reprovada pela gestão.`,
      };
    case "ENVIAR_DUVIDA":
      return {
        titulo: "Dúvida Da Gestão",
        corpo: corpoDaGestao
          ? `A gestão tem uma dúvida sobre sua solicitação de ${menuRotulo}: ${corpoDaGestao}`
          : `A gestão tem uma dúvida sobre sua solicitação de ${menuRotulo}.`,
      };
    case "EM_ANDAMENTO":
      return {
        titulo: "Solicitação Em Andamento",
        corpo: `Sua solicitação sobre ${menuRotulo} entrou em andamento.`,
      };
    case "CONCLUIR":
      return {
        titulo: "Solicitação Concluída",
        corpo: `Sua solicitação sobre ${menuRotulo} foi concluída.`,
      };
  }
}
