/**
 * REABERTURA DE DOCUMENTO JÁ APROVADO: a guarda, e o recorte de quem ainda pode reabrir.
 *
 * O PEDIDO (diretor): "se a IA aprovou um documento errado, qualquer consultor reabre a pendência
 * do documento pela plataforma". Correção manual do veredito da IA, operacional, sem papel especial.
 *
 * O QUE ESTA FUNÇÃO IMPEDE, e por que ela existe. Reabrir um documento DES-completa a régua
 * obrigatória, e régua incompleta recua a frente AUDITORIA, que fecha o gate do Cadastro (regra 3) e
 * derruba o Cadastro já nascido. Isso é o comportamento desejado enquanto a admissão está viva. Passa
 * a ser DANO quando o contrato já saiu para assinatura: o envelope da Clicksign é externo ao EA, não
 * se desfaz por recuo de frente, e o kit na fila aponta para um pacote de documentos que acabou de
 * mudar debaixo dele.
 *
 * ══ A GUARDA É POR `admissoes.clicksign_status`, NÃO PELO FAROL ═══════════════════════════════════
 *
 * O farol `ADMISSAO_CONCLUIDA` é flag MANUAL até a INT-4 (§A.3): qualquer um o marca, qualquer um o
 * deixa de marcar, e uma admissão com contrato em assinatura pode estar com o farol em EM_ADMISSAO.
 * Guarda por farol, portanto, é guarda que passa. O `clicksign_status` é escrito pelo pipeline da
 * assinatura (INT-4) contra o estado REAL do envelope, e é ele que responde à única pergunta que
 * importa aqui: existe contrato vivo lá fora amarrado a estes documentos?
 *
 * `CANCELADO` e `EXPIRADO` LIBERAM de propósito: são envelopes mortos, e o reenvio por correção
 * (§A.5) depende justamente de poder mexer nos documentos depois de cancelar o envelope errado.
 *
 * O KIT NA FILA também barra. `kit_assinatura_path`/`kit_assinatura_em` marcam o kit já materializado
 * esperando o disparo do envelope; o envelope ainda não existe (`SEM_ENVELOPE`), então o teste de
 * status sozinho deixaria passar. Reabrir aqui produziria um envelope nascendo com o pacote antigo.
 *
 * ONDE ELA É CHAMADA: nas DUAS portas que devolvem documento a pendente E, sobretudo, NO EFEITO.
 *
 * A contagem mudou de três para duas porque a validação humana só escreve ENTREGUE: ela avança, e
 * não há o que guardar nela. E o EFEITO entrou na lista por veto da auditoria: o recuo mora no
 * pós-veredito COMPARTILHADO (`AuditoriaService.recuarAuditoria`), então guardar só as portas
 * deixava um caminho de um clique passar por fora (upload comum sobre documento já ENTREGUE).
 * Porta que
 * escreve `documentos_admissao.estado` para trás sem passar por aqui torna a guarda contornável, que
 * é o mesmo que não existir.
 *
 * ══ DOIS LIMITES MEDIDOS QUE ESTA FRENTE **NÃO** RESOLVE, registrados para não se perderem ═══════
 *
 * 1. A STAGING JÁ PODE NÃO EXISTIR. Ela é expurgada no fechamento da régua e tem TTL de 48h (§A.6).
 *    Reabrir um documento aprovado há mais de 48h costuma deixar ZERO arquivo para reauditar, e
 *    `ReauditoriaService.reauditar` cai em `BadRequestException` ("anexe o arquivo novamente").
 *    Reabrir continua funcionando: quem some é o arquivo, não a pendência.
 * 2. A REABERTURA NÃO DEVOLVE TENTATIVA AO CANDIDATO. O teto de tentativas do Portal vive em
 *    `portal_pendencias_no_time`, e só `solicitarReenvio`/`zerarTentativas` movem aquele marco.
 *    Documento reaberto de candidato que estourou o teto segue sem caminho pelo Portal, e o reenvio
 *    tem de ser solicitado à parte.
 *
 * §A.6: opera sobre status e carimbos de tempo. Nenhum dado pessoal, nenhuma URL.
 */

/** Por que a reabertura foi recusada. Código estável, para a tela decidir o que dizer. */
export type MotivoRecusaReabertura =
  | "ENVELOPE_AGUARDANDO_ASSINATURA"
  | "ENVELOPE_ASSINADO"
  | "KIT_NA_FILA_DE_ASSINATURA";

/** O pedaço da admissão que decide a reabertura. Só status e carimbos (§A.6). */
export interface EstadoDaAdmissaoParaReabertura {
  clicksignStatus: string | null;
  kitAssinaturaPath: string | null;
  kitAssinaturaEm: Date | null;
}

export interface VereditoDeReabertura {
  pode: boolean;
  motivo?: MotivoRecusaReabertura;
  /** Texto pronto para a tela. Sem travessão (§A.11). */
  mensagem?: string;
}

/** Os status de envelope que BARRAM a reabertura (os demais são envelope morto ou inexistente). */
const ENVELOPE_VIVO: Record<string, MotivoRecusaReabertura> = {
  AGUARDANDO_ASSINATURA: "ENVELOPE_AGUARDANDO_ASSINATURA",
  ASSINADO: "ENVELOPE_ASSINADO",
};

export const MENSAGEM_RECUSA_REABERTURA: Record<MotivoRecusaReabertura, string> = {
  ENVELOPE_AGUARDANDO_ASSINATURA:
    "Este contrato já foi enviado para assinatura. Cancele o envelope na Gestão Das Assinaturas " +
    "antes de reabrir a pendência do documento.",
  ENVELOPE_ASSINADO:
    "Este contrato já foi assinado. A pendência do documento não pode ser reaberta por aqui: " +
    "trate a correção pelo reenvio por correção.",
  KIT_NA_FILA_DE_ASSINATURA:
    "O kit deste candidato já foi gerado e está na fila de assinatura. Remova o kit da fila antes " +
    "de reabrir a pendência do documento.",
};

/**
 * A pendência deste documento pode ser reaberta? Função PURA, chamada pelas duas portas e pelo
 * efeito (`recuarAuditoria`), que é onde o dano de verdade acontece.
 *
 * FAIL-CLOSED na ordem: basta um impedimento para recusar, e o primeiro encontrado é o reportado.
 */
export function podeReabrirDocumento(
  estado: EstadoDaAdmissaoParaReabertura,
): VereditoDeReabertura {
  const porEnvelope = estado.clicksignStatus ? ENVELOPE_VIVO[estado.clicksignStatus] : undefined;
  if (porEnvelope) {
    return { pode: false, motivo: porEnvelope, mensagem: MENSAGEM_RECUSA_REABERTURA[porEnvelope] };
  }

  if (estado.kitAssinaturaPath != null || estado.kitAssinaturaEm != null) {
    return {
      pode: false,
      motivo: "KIT_NA_FILA_DE_ASSINATURA",
      mensagem: MENSAGEM_RECUSA_REABERTURA.KIT_NA_FILA_DE_ASSINATURA,
    };
  }

  return { pode: true };
}

/**
 * A admissão está VIVA para efeito de recuo de frente?
 *
 * O RECUO NÃO REESCREVE HISTÓRICO, e este é o recorte que protege a carga. §A.16 e §A.19: admissão
 * finalizada (`ADMISSAO_CONCLUIDA`) e encerrada (`DECLINOU`/`RESCISAO`) não são recalculadas nem
 * entram em fila. As 1.432 concluídas e os 724 declínios da importação têm frente e documento em
 * estado combinado por regra de carga, não por fluxo vivo; deixar o recuo alcançá-las faria uma
 * reauditoria avulsa devolver admissão encerrada para a fila da Auditoria.
 *
 * Consequência conhecida e deliberada: reabrir um documento de admissão finalizada muda o documento
 * e NÃO mexe na frente. É o mesmo princípio de "histórico intacto" do §A.16.
 */
export function admissaoVivaParaRecuo(farolGlobal: string | null): boolean {
  return farolGlobal === "EM_ADMISSAO" || farolGlobal === "BANCO_AGUARDAR";
}
