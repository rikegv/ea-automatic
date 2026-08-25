/**
 * DOMÍNIO PURO do SCHEDULER DA ASSINATURA (INT-4 / §A.5). Sem I/O: constantes de cadência, o prazo do
 * envelope e as regras testáveis. Espelha `domain/scheduler-pandape` e `domain/scheduler-vt-coleta`.
 *
 * O QUE ISTO FAZ: em cadência fixa o EA consulta os envelopes que estão AGUARDANDO_ASSINATURA na
 * Clicksign. Fechou, baixa o assinado e arquiva no Drive; foi cancelado, marca CANCELADO; passou do
 * prazo sem nenhum dos dois, marca EXPIRADO.
 *
 * §A.6: nada aqui toca CPF, nome ou URL. Só contagens, instantes e o id técnico do envelope.
 */

/**
 * CADÊNCIA: 2 minutos (decisão do diretor, 25/08/2026). Era 5.
 *
 * O QUE MUDOU. O ciclo deixou de servir só para arquivar assinado e marcar expirado: ele agora
 * alimenta o PAINEL DE ASSINATURA que a tela de gestão lê ("X de Y assinaram", em todas as linhas).
 * Antes a tela perguntava isso à Clicksign a cada abertura, 2 requisições por linha, 220 numa aba de
 * 110. Com o painel guardado, a cadência do tick virou o ATRASO MÁXIMO do que o operador vê, e 5
 * minutos era tempo demais para uma tela de cobrança.
 *
 * POR QUE 2 E NÃO 1. O ciclo custa 1 consulta por envelope aberto (~106 hoje), e o `/events` só é
 * chamado quando o `modified` do envelope mudou, então em regime o custo real é bem menor. A 2
 * minutos isso fica muito abaixo do teto de 50 req/10s, e ainda sobra balde para a tela e o disparo,
 * que dividem o mesmo limite. A 1 minuto a folga encolheria sem ganho perceptível: ninguém percebe a
 * diferença entre 60 e 120 segundos de atraso numa assinatura que leva horas.
 *
 * A URL do assinado (S3 presigned, ~5 min) nunca dependeu desta cadência: ela é obtida e consumida
 * DENTRO do mesmo ciclo (`arquivarAssinado` baixa síncrono).
 */
export const INTERVALO_MS = 2 * 60 * 1000;

/**
 * SCHEDULER PARADO: sem ciclo bem-sucedido há mais de 30 min (6 cadências). Tolera cadências perdidas
 * sem acender à toa. Só vale quando LIGADO: desligado é estado deliberado do diretor, não falha.
 */
export const LIMIAR_PARADO_MS = 30 * 60 * 1000;

/**
 * PRAZO DO ENVELOPE: 30 dias. É o MESMO número que o `ClicksignApiService.criarEnvelope` manda no
 * `deadline_at` do envelope. Ficam amarrados de propósito: o EA não pode considerar expirado antes da
 * Clicksign, nem manter "aguardando" para sempre um envelope que a Clicksign já abandonou.
 *
 * Por que o EA marca em vez de só perguntar: passado o prazo a Clicksign não devolve um status
 * terminal próprio (continua `running`), então sem esta regra o registro ficaria AGUARDANDO para
 * sempre, que era exatamente a dívida apontada no levantamento de 24/07.
 */
export const PRAZO_ENVELOPE_MS = 30 * 24 * 60 * 60 * 1000;

/** Estado persistido do scheduler (espelha a linha singleton `clicksign_scheduler_estado`). */
export interface EstadoScheduler {
  ligado: boolean;
  /** ISO do início do último ciclo (rodou, independente de sucesso). null = nunca rodou. */
  ultimoCicloEm: string | null;
  /** ISO do último ciclo BEM-SUCEDIDO (heartbeat do "vivo"). null = nunca concluiu. */
  ultimoCicloOkEm: string | null;
  /** Resultado do último ciclo. */
  varridas: number;
  assinados: number;
  expirados: number;
  falhas: number;
  /** Nota curta e sem PII do último ciclo (ex.: "inerte: sem token"). */
  nota: string | null;
}

/**
 * O scheduler está PARADO? Só quando LIGADO e sem ciclo bem-sucedido há mais que o limiar (ou nunca
 * concluiu). Desligado nunca está "parado" (é decisão do diretor, não falha).
 */
export function schedulerParado(estado: EstadoScheduler, agoraMs: number): boolean {
  if (!estado.ligado) return false;
  if (!estado.ultimoCicloOkEm) return true; // ligado e nunca concluiu um ciclo.
  const ultimo = new Date(estado.ultimoCicloOkEm).getTime();
  return agoraMs - ultimo > LIMIAR_PARADO_MS;
}

/**
 * O envelope passou do prazo? `enviadoEm` é o instante da ATIVAÇÃO (draft -> running).
 *
 * FAIL-SAFE deliberado: sem carimbo de envio (`null`), NUNCA expira. Envelope antigo, criado antes
 * desta entrega, não tem o carimbo e seria expirado em massa no primeiro ciclo se a regra fosse a
 * inversa. Quem não tem carimbo segue sendo consultado normalmente na Clicksign, que é a fonte da
 * verdade; só perde a detecção local de prazo.
 */
export function envelopeExpirado(enviadoEm: Date | string | null, agoraMs: number): boolean {
  if (!enviadoEm) return false;
  const enviado = new Date(enviadoEm).getTime();
  if (Number.isNaN(enviado)) return false;
  return agoraMs - enviado > PRAZO_ENVELOPE_MS;
}

/** Resultado de UM envelope processado no ciclo (base da agregação). */
export interface ResumoEnvelope {
  /** Fechou e foi arquivado neste ciclo. */
  assinado?: boolean;
  /** Marcado EXPIRADO neste ciclo. */
  expirado?: boolean;
  /** Deu erro (não derruba o ciclo; volta no próximo). */
  falha?: boolean;
}

/** Números agregados do ciclo. `varridas` = envelopes consultados. */
export function agregarCiclo(resumos: ResumoEnvelope[]): {
  varridas: number;
  assinados: number;
  expirados: number;
  falhas: number;
} {
  let varridas = 0;
  let assinados = 0;
  let expirados = 0;
  let falhas = 0;
  for (const r of resumos) {
    varridas += 1;
    if (r.assinado) assinados += 1;
    if (r.expirado) expirados += 1;
    if (r.falha) falhas += 1;
  }
  return { varridas, assinados, expirados, falhas };
}
