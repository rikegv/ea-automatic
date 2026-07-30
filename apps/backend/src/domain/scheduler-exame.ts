/**
 * DOMÍNIO PURO do SCHEDULER DO EXAME (OST Onda 2, item 3). Sem I/O: cadência, limiar de "parado" e o
 * formato do estado persistido. Espelha `domain/scheduler-pandape`, `scheduler-vt-coleta` e
 * `scheduler-clicksign`, que são o molde consolidado dos verificadores internos.
 *
 * O QUE ELE FAZ. De hora em hora, olha as frentes de EXAME que estão esperando o ASO e ajusta o
 * status ao que o relógio já decidiu: exame que passou sem ASO vira "ASO Pendente"; previsão de ASO
 * posterior à data do exame vira "Aguardando Liberação Do ASO". As REGRAS não moram aqui, moram em
 * `domain/exame-status.ts`; aqui mora só o ritmo.
 *
 * §A.6: contagens e instantes. Nenhum dado pessoal.
 */

/**
 * CADÊNCIA: 1 hora (decisão do diretor: "verificador de hora em hora").
 *
 * Não fala com serviço externo nenhum: é banco local, então não disputa cota do Pandapé (§A.5) nem
 * do Drive. A hora cheia é folgada de sobra para um estado que muda por passagem de data e hora.
 */
export const INTERVALO_MS = 60 * 60 * 1000;

/**
 * SCHEDULER PARADO: sem ciclo bem-sucedido há mais de 4 horas (4 cadências). Tolera ciclo perdido,
 * acende se o loop morreu. Só vale quando LIGADO: desligado é decisão, não falha.
 */
export const LIMIAR_PARADO_MS = 4 * 60 * 60 * 1000;

/** Estado persistido (espelha a linha singleton `exame_scheduler_estado`). */
export interface EstadoScheduler {
  ligado: boolean;
  /** ISO do início do último ciclo (rodou, independente de sucesso). null = nunca rodou. */
  ultimoCicloEm: string | null;
  /** ISO do último ciclo BEM-SUCEDIDO (heartbeat do "vivo"). null = nunca concluiu. */
  ultimoCicloOkEm: string | null;
  /** Frentes de EXAME avaliadas no último ciclo. */
  varridas: number;
  /** Passaram a AGUARDANDO_ASO neste ciclo. */
  aguardando: number;
  /** Passaram a ASO_PENDENTE neste ciclo. */
  pendentes: number;
  falhas: number;
  /** Nota curta e sem PII do último ciclo. */
  nota: string | null;
}

/**
 * O scheduler está PARADO? Mesma regra dos outros três: só quando LIGADO e sem ciclo bem-sucedido
 * além do limiar. Nunca rodou e está ligado também conta como parado (o loop deveria ter rodado).
 */
export function schedulerParado(estado: EstadoScheduler, agoraMs: number): boolean {
  if (!estado.ligado) return false;
  const ultimo = estado.ultimoCicloOkEm ? new Date(estado.ultimoCicloOkEm).getTime() : null;
  if (ultimo === null) return true;
  return agoraMs - ultimo > LIMIAR_PARADO_MS;
}
