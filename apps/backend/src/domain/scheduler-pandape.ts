/**
 * DOMÍNIO PURO do SCHEDULER DE RE-CONSULTA DO PANDAPÉ (OST scheduler). Sem I/O: constantes de
 * cadência e as regras testáveis (scheduler parado, teto de segurança de IA, agregação do ciclo).
 * O serviço faz o trabalho; aqui moram as decisões.
 *
 * O BURACO QUE ISTO FECHA: o pull do Pandapé só dispara NA LIBERAÇÃO. Documento que o candidato
 * anexa DEPOIS não entra sozinho (o Pandapé não avisa envio de documento, só mudança de etapa). O
 * scheduler re-consulta as admissões VIVAS de origem Pandapé em cadência fixa; a dedup por arquivo
 * (SHA-256, `documento_arquivos_coletados`) garante que só o que é novo é baixado e auditado.
 *
 * §A.6: nada aqui toca CPF, nome de arquivo ou URL. Só contagens e instantes.
 */

/**
 * CADÊNCIA: 12 minutos. Decisão dentro da faixa 10 a 15 min pedida pelo diretor. Escolhido o meio da
 * faixa: com ~45 admissões vivas de origem Pandapé e 1 chamada de listagem por admissão, são ~18,75
 * chamadas por janela de 5 min (45 x 5/12), ou 1,9% do teto COMPARTILHADO de 1.000 req/5min (§A.5) que
 * o webhook do G.Infor também consome. Folga larga sobre o teto e latência máxima de 12 min para um
 * documento anexado após a liberação ser puxado.
 */
export const SCHEDULER_INTERVALO_MS = 12 * 60 * 1000;

/**
 * SCHEDULER PARADO: sem ciclo bem-sucedido há mais de 45 min (≈ 3,75 cadências). Tolera uma ou duas
 * cadências perdidas (um ciclo lento não é morte), mas acende antes de uma hora se o loop morreu. O
 * sinal só vale quando o scheduler está LIGADO: desligado é estado deliberado do diretor, não falha.
 */
export const SCHEDULER_LIMIAR_PARADO_MS = 45 * 60 * 1000;

/**
 * TETO DE SEGURANÇA DE IA POR CICLO (Bloco 3): 40 auditorias por ciclo. O scheduler roda sozinho e
 * repetidamente; um erro (dedup quebrada, acervo reaberto em massa) queimaria quota em escala, sem
 * ninguém olhando. Em regime normal um ciclo faz QUASE ZERO auditoria (a dedup pula o que já veio;
 * só documento NOVO custa), então 40 é folgado para um pico real de anexos novos (ex.: 5 candidatos
 * subindo 8 tipos cada) e ao mesmo tempo um freio bem abaixo de esvaziar a quota. Batido o teto, o
 * ciclo PARA e registra, em vez de continuar auditando.
 */
export const SCHEDULER_TETO_IA_POR_CICLO = 40;

/** Estado persistido do scheduler (espelha a linha singleton `pandape_scheduler_estado`). */
export interface EstadoScheduler {
  ligado: boolean;
  /** ISO do início do último ciclo (rodou, independente de sucesso). null = nunca rodou. */
  ultimoCicloEm: string | null;
  /** ISO do último ciclo BEM-SUCEDIDO (heartbeat do "vivo"). null = nunca concluiu. */
  ultimoCicloOkEm: string | null;
  /** Resultado do último ciclo (Bloco 4). */
  varridas: number;
  novos: number;
  falhas: number;
  /** Ciclo interrompido pelo teto de segurança de IA (Bloco 3). */
  abortado: boolean;
  /** Nota curta e sem PII do último ciclo. */
  nota: string | null;
}

/**
 * O scheduler está PARADO? Só quando LIGADO e sem ciclo bem-sucedido há mais que o limiar (ou nunca
 * concluiu um ciclo). Desligado nunca está "parado" (é decisão do diretor, não falha). Inerte sem
 * token também não conta como parado: quem trata isso é a dependência Pandapé do Bloco 3.
 */
export function schedulerParado(estado: EstadoScheduler, agoraMs: number): boolean {
  if (!estado.ligado) return false;
  if (!estado.ultimoCicloOkEm) return true; // ligado e nunca concluiu um ciclo.
  const ultimo = new Date(estado.ultimoCicloOkEm).getTime();
  return agoraMs - ultimo > SCHEDULER_LIMIAR_PARADO_MS;
}

/** Resultado por tipo que a agregação consome (subconjunto do ResumoTipoPull do pull). */
export interface TipoAgregavel {
  novos: number;
  acao: string;
}

/** Números agregados de um ciclo, a partir dos resumos de pull de cada admissão. */
export interface AgregadoCiclo {
  varridas: number;
  novos: number;
  auditorias: number;
  falhas: number;
}

/**
 * Agrega o ciclo a partir dos resumos por admissão. `varridas` = admissões efetivamente varridas
 * (não inertes). `novos` = arquivos com hash inédito baixados. `auditorias` = tipos que foram
 * auditados (é o custo de IA, o que o teto do Bloco 3 conta). `falhas` = tipos com falha de auditoria.
 */
export function agregarCiclo(
  resumos: Array<{ inerte?: boolean; tipos: TipoAgregavel[] }>,
): AgregadoCiclo {
  let varridas = 0;
  let novos = 0;
  let auditorias = 0;
  let falhas = 0;
  for (const r of resumos) {
    if (r.inerte) continue;
    varridas += 1;
    for (const t of r.tipos) {
      novos += t.novos;
      if (t.acao === "AUDITADO") auditorias += 1;
      if (t.acao === "FALHA") falhas += 1;
    }
  }
  return { varridas, novos, auditorias, falhas };
}
