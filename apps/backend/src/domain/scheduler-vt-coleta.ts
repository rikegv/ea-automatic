/**
 * DOMÍNIO PURO do SCHEDULER DA COLETA DE VT (§A.17 etapa 3 / INT-2). Sem I/O: constantes de cadência
 * e as regras testáveis (scheduler parado, agregação do ciclo). Espelha `domain/scheduler-pandape`.
 *
 * O QUE ISTO FAZ: um app externo (Firebase) deposita os PDFs de Vale-Transporte numa pasta coletiva
 * do Drive. Em cadência fixa (e sob disparo manual), o EA varre a pasta, casa cada PDF a uma admissão
 * viva pelo CPF do nome do arquivo e o arquiva no prontuário. A dedup por md5 garante que um arquivo
 * já processado nunca é reprocessado.
 *
 * §A.6: nada aqui toca CPF, nome de arquivo ou URL. Só contagens e instantes.
 */

/**
 * CADÊNCIA: 15 minutos. A varredura fala com o Drive (INT-2), não com o Pandapé, então não disputa o
 * teto compartilhado de 1.000 req/5min (§A.5). 15 min é folgado para o candidato ver o VT chegar ao
 * prontuário sem varrer a pasta coletiva à toa.
 */
export const INTERVALO_MS = 15 * 60 * 1000;

/**
 * SCHEDULER PARADO: sem ciclo bem-sucedido há mais de 60 min (4 cadências). Tolera cadências perdidas
 * (um ciclo lento não é morte), mas acende se o loop morreu. Só vale quando LIGADO: desligado é estado
 * deliberado do diretor, não falha.
 */
export const LIMIAR_PARADO_MS = 60 * 60 * 1000;

/** Estados possíveis de um item da coleta (espelha a coluna `vt_coleta.status`). */
export type StatusColeta =
  | "CASADO"
  | "SEM_ADMISSAO"
  | "MULTIPLO"
  | "NOME_FORA_PADRAO"
  | "NAO_PDF"
  | "ERRO";

/** Status que contam como "não casou" (arquivo varrido sem destino). */
export const STATUS_SEM_CASAR: StatusColeta[] = ["SEM_ADMISSAO", "MULTIPLO", "NOME_FORA_PADRAO"];

/** Estado persistido do scheduler (espelha a linha singleton `vt_coleta_scheduler_estado`). */
export interface EstadoScheduler {
  ligado: boolean;
  /** ISO do início do último ciclo (rodou, independente de sucesso). null = nunca rodou. */
  ultimoCicloEm: string | null;
  /** ISO do último ciclo BEM-SUCEDIDO (heartbeat do "vivo"). null = nunca concluiu. */
  ultimoCicloOkEm: string | null;
  /** Resultado do último ciclo. */
  varridas: number;
  novos: number;
  semAdmissao: number;
  falhas: number;
  abortado: boolean;
  /** Nota curta e sem PII do último ciclo. */
  nota: string | null;
}

/**
 * Resultado de UM item processado no ciclo. `novo` = virou CASADO NESTE ciclo (arquivado agora);
 * `jaProcessado` = pulado por já estar CASADO (idempotência).
 */
export interface ResumoItemColeta {
  status: StatusColeta;
  novo: boolean;
  jaProcessado?: boolean;
  /** Foi arquivado no Drive neste ciclo. */
  arquivado?: boolean;
  /** Deu baixa no FORMULARIO_VT (estava na régua). */
  deuBaixa?: boolean;
}

/** Números agregados de um ciclo, a partir dos resumos por item. */
export interface AgregadoCiclo {
  varridas: number;
  novos: number;
  semAdmissao: number;
  falhas: number;
  ignorados: number;
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
 * Agrega o ciclo a partir dos resumos por item. `varridas` = itens processados. `novos` = casamentos
 * feitos neste ciclo. `semAdmissao` = arquivos varridos sem destino (sem admissão, múltiplo ou nome
 * fora do padrão). `falhas` = itens com erro. `ignorados` = não-PDF e já processados (idempotência).
 */
export function agregarCiclo(resumos: ResumoItemColeta[]): AgregadoCiclo {
  let varridas = 0;
  let novos = 0;
  let semAdmissao = 0;
  let falhas = 0;
  let ignorados = 0;
  for (const r of resumos) {
    varridas += 1;
    if (r.novo) novos += 1;
    if (STATUS_SEM_CASAR.includes(r.status)) semAdmissao += 1;
    if (r.status === "ERRO") falhas += 1;
    if (r.status === "NAO_PDF" || r.jaProcessado) ignorados += 1;
  }
  return { varridas, novos, semAdmissao, falhas, ignorados };
}
