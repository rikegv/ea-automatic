/**
 * DOMÍNIO PURO do STATUS AUTOMÁTICO DO EXAME (OST Onda 2, item 3). Sem I/O, sem banco, sem relógio
 * próprio: o instante entra por parâmetro, então o teste controla o tempo e o resultado é
 * reprodutível.
 *
 * O QUE ISTO RESOLVE. A frente EXAME tinha um "Agendado" só, que cobria dois mundos opostos: quem
 * tem exame amanhã e quem fez o exame semana passada e não mandou o ASO. A fila não distinguia
 * espera normal de atraso, e o segundo caso só aparecia se alguém olhasse admissão por admissão.
 *
 * AS DUAS REGRAS, na ordem em que são avaliadas:
 *  1. **ASO_PENDENTE** quando a data e hora do exame JÁ PASSARAM e não há ASO anexado. É atraso.
 *  2. **AGUARDANDO_ASO** quando a previsão do ASO é POSTERIOR à data do exame. É espera esperada.
 * O atraso vem primeiro porque ele é sobre o que já aconteceu; a previsão é só uma promessa.
 *
 * A REFERÊNCIA DO ATRASO É O ÚLTIMO HORÁRIO DO DIA (conexão com o item 5, múltiplos endereços): com
 * três endereços no mesmo dia, o exame só terminou depois do último horário. Usar o primeiro marcaria
 * como atrasado quem ainda está no meio do roteiro. `horarios` recebe todos e a função usa o maior.
 *
 * §A.6: só datas, horas e um booleano. Nenhum dado pessoal entra aqui.
 */

import { STATUS_EXAME_ESPERA_ASO } from "@ea/shared-types";

/** Status que o verificador pode ATRIBUIR. Ele nunca conclui a frente (isso é do APTO). */
export type StatusEsperaAso = (typeof STATUS_EXAME_ESPERA_ASO)[number];

export interface EntradaStatusExame {
  /** Data do exame, ISO `YYYY-MM-DD`. */
  data?: string | null;
  /** Horários do dia, `HH:MM`. Um por endereço; a referência é o MAIOR (o último do dia). */
  horarios?: readonly (string | null | undefined)[];
  /** Previsão de entrega do ASO informada pela clínica, ISO `YYYY-MM-DD`. */
  previsaoAso?: string | null;
  /** Existe ASO anexado nesta admissão? */
  asoAnexado: boolean;
}

/**
 * O status que a frente DEVERIA ter agora, ou `undefined` quando não há mudança automática a fazer
 * (sem data, ou ASO já anexado, que é caso do APTO e não deste verificador).
 */
export function statusAutomaticoExame(
  entrada: EntradaStatusExame,
  agora: Date,
): StatusEsperaAso | undefined {
  // ASO anexado sai do domínio do verificador: quem decide dali para frente é o veredito da IA, que
  // leva a frente a APTO. O verificador nunca disputa esse caminho.
  if (entrada.asoAnexado) return undefined;
  if (!entrada.data) return undefined;

  const fim = instanteFinalDoExame(entrada.data, entrada.horarios);
  if (fim === undefined) return undefined;

  // Regra 1: o exame já terminou e não veio ASO. É atraso, e vence a previsão.
  if (agora.getTime() > fim) return "ASO_PENDENTE";

  // Regra 2: a clínica prometeu o ASO para DEPOIS do exame. A espera é normal, e fica visível.
  if (entrada.previsaoAso && entrada.previsaoAso > entrada.data) return "AGUARDANDO_ASO";

  return undefined;
}

/**
 * Instante em que o exame do dia TERMINA, em epoch ms: a data mais o ÚLTIMO horário informado.
 *
 * Sem horário nenhum, cai no fim do dia (23:59), que é a leitura conservadora: não se declara
 * atrasado quem pode ter exame às 18h de hoje. `undefined` quando a data não é uma data válida.
 */
export function instanteFinalDoExame(
  data: string,
  horarios?: readonly (string | null | undefined)[],
): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return undefined;
  const ultimo = ultimoHorario(horarios) ?? "23:59";
  const t = new Date(`${data}T${ultimo}:00`);
  const ms = t.getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/** O MAIOR horário `HH:MM` da lista (o último do dia), ou `undefined` se não há nenhum válido. */
export function ultimoHorario(
  horarios?: readonly (string | null | undefined)[],
): string | undefined {
  const validos = (horarios ?? []).filter(
    (h): h is string => typeof h === "string" && /^\d{2}:\d{2}$/.test(h),
  );
  if (validos.length === 0) return undefined;
  // Comparação de string funciona em `HH:MM` zero-padded, e é o que se quer: sem fuso, sem Date.
  return validos.reduce((maior, h) => (h > maior ? h : maior));
}
