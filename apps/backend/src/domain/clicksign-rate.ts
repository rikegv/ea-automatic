/**
 * CONTROLE DE RITMO DA CLICKSIGN (§A.5).
 *
 * O QUE ISTO RESOLVE. Em 25/08/2026 o log tinha **4.960 respostas 429**, 99,8% delas em GET. O teto
 * é 50 requisições por janela FIXA de 10 segundos, e TRÊS consumidores dividem o mesmo balde sem
 * saber um do outro:
 *   1. a tela Ass. Click, que buscava assinantes de 108 linhas (216 requisições em ~1,5s);
 *   2. o disparo de envelope, que gasta 10 requisições por contrato;
 *   3. o tick do cron, que varre ~107 envelopes a cada 5 minutos.
 * Quem chegava depois tomava 429, e o disparo de contrato era justamente quem mais sofria.
 *
 * POR QUE O LIMITADOR ANTIGO NÃO SERVIA: ele contava JOBS (18 por 10s) e cada job faz ~10
 * requisições, ou seja, autorizava 180 req/10s contra um teto de 50. Só não estourava por acidente,
 * porque a concorrência 1 e os ~10s de cada job seguravam na prática. Contar requisição é o único
 * jeito de a trava valer.
 *
 * COMO FUNCIONA. Janela alinhada às do provedor (múltiplos de 10s, que é como o `x-rate-limit-reset`
 * se comporta), com teto próprio ABAIXO do real: 35 de 50, 70%, deixando folga para o que o EA não
 * controla. Cheia a janela, o pedido espera a virada em vez de tomar 429.
 *
 * OS HEADERS MANDAM MAIS QUE A CONTA LOCAL. `x-rate-limit-remaining` e `x-rate-limit-reset` vêm em
 * toda resposta e são a verdade do servidor; a contagem local é só uma estimativa entre respostas.
 * Quando o servidor diz que a folga acabou, o limitador segura até o reset dele.
 *
 * A EXCEÇÃO QUE PRECISA EXISTIR: o `POST /notifications` tem BALDE PRÓPRIO, de 1 chamada por janela
 * de 60s POR ENVELOPE. Ele responde `remaining: 0` SEMPRE, por construção, já que o limite é 1.
 * Alimentar o limitador global com esse header faria o sistema inteiro parar 60 segundos a cada
 * notificação (erro cometido e medido: os 7 primeiros reenvios levaram 6 minutos em vez de segundos).
 * Por isso `alimentar()` recebe se a resposta veio dessa rota e, nesse caso, ignora os números dela.
 */

/** Teto do provedor, medido em produção (`x-rate-limit`). */
export const TETO_REAL = 50;

/** Teto que o EA se impõe: 70% do real, folga deliberada para o que não passa por aqui. */
export const TETO_EA = 35;

/** Tamanho da janela do provedor, em ms. O `x-rate-limit-reset` cai sempre em múltiplos disto. */
export const JANELA_MS = 10_000;

/** Abaixo desta folga informada pelo servidor, o limitador para e espera o reset. */
export const FOLGA_MINIMA = 5;

/** Uma rota é a do `notifications` (balde próprio, 1/60s por envelope)? */
export function ehRotaNotificacao(path: string): boolean {
  return path.endsWith("/notifications");
}

/** Índice da janela de 10s a que um instante pertence. Alinhado ao provedor. */
export function janelaDe(agoraMs: number): number {
  return Math.floor(agoraMs / JANELA_MS);
}

/**
 * Contador de janela deslizante por blocos fixos. Puro e sem timers: decide QUANTO esperar e quem
 * chama é que dorme. Isso o torna testável sem relógio falso e sem `setTimeout` pendurado.
 */
export class RitmoClicksign {
  private janela = -1;
  private usadas = 0;
  /** Instante (ms) até o qual o servidor mandou segurar. 0 = livre. */
  private seguraAte = 0;

  constructor(private readonly teto: number = TETO_EA) {}

  /**
   * Quanto esperar (ms) antes de mandar a próxima requisição. 0 = pode ir agora.
   *
   * Chamar isto CONSOME um slot da janela quando devolve 0, então cada chamada corresponde a uma
   * requisição de verdade. O chamador que esperar deve perguntar de novo depois de dormir.
   */
  aguardar(agoraMs: number): number {
    if (agoraMs < this.seguraAte) return this.seguraAte - agoraMs;

    const atual = janelaDe(agoraMs);
    if (atual !== this.janela) {
      this.janela = atual;
      this.usadas = 0;
    }
    if (this.usadas < this.teto) {
      this.usadas += 1;
      return 0;
    }
    // Janela cheia: espera a virada. +1ms para não cair na fronteira exata.
    return (this.janela + 1) * JANELA_MS - agoraMs + 1;
  }

  /**
   * Ensina o limitador com o que o SERVIDOR respondeu. É mais confiável que a conta local, porque
   * enxerga também o consumo que não passou por aqui.
   *
   * `rotaNotificacao` faz os números serem DESCARTADOS: aquele endpoint tem balde próprio de 1 por
   * minuto por envelope e sempre devolve `remaining: 0`, então obedecê-lo pararia o mundo.
   */
  alimentar(
    agoraMs: number,
    cabecalhos: { remaining: string | null; reset: string | null },
    rotaNotificacao: boolean,
  ): void {
    if (rotaNotificacao) return;

    // `Number(null)` e `Number("")` são ZERO, não NaN. Sem esta guarda, uma resposta SEM o header
    // (erro de rede, 502 de borda, resposta não autenticada) seria lida como "folga zero" e travaria
    // o sistema por uma janela inteira. Ausência de informação não é informação de escassez.
    const restante = numeroDoHeader(cabecalhos.remaining);
    if (restante === undefined) return;

    // O servidor conhece a folga real; a conta local passa a refletir isso.
    this.janela = janelaDe(agoraMs);
    this.usadas = Math.max(this.usadas, this.teto - Math.max(0, restante));

    if (restante > FOLGA_MINIMA) return;

    const resetSeg = numeroDoHeader(cabecalhos.reset);
    this.seguraAte = resetSeg === undefined ? agoraMs + JANELA_MS : resetSeg * 1000 + 100;
  }

  /**
   * Quanto esperar depois de um 429, em ms. Usa o `reset` do servidor em vez de um backoff cego: a
   * janela costuma virar em menos de 10 segundos, e esperar 5 segundos fixos pode cair na MESMA
   * janela cheia e tomar 429 de novo.
   */
  esperaDo429(agoraMs: number, reset: string | null): number {
    const resetSeg = numeroDoHeader(reset);
    if (resetSeg !== undefined) {
      const alvo = resetSeg * 1000 + 100;
      if (alvo > agoraMs) {
        this.seguraAte = alvo;
        return alvo - agoraMs;
      }
    }
    this.seguraAte = agoraMs + JANELA_MS;
    return JANELA_MS;
  }
}

/**
 * Lê um header numérico, distinguindo AUSENTE de ZERO. `Number(null)` e `Number("")` devolvem 0, e
 * confundir os dois faria o limitador tratar "não sei" como "acabou a folga".
 */
function numeroDoHeader(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
