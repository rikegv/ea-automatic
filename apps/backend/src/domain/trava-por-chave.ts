/**
 * TRAVA EM MEMÓRIA POR CHAVE (OST da duplicação, item 4). Serializa execuções que disputam o mesmo
 * recurso, sem travar as demais.
 *
 * O PROBLEMA QUE ELA FECHA. O arquivamento no Drive resolve a pasta do prontuário procurando por
 * nome. Duas execuções simultâneas da MESMA admissão (o Re-pull fura a idempotência da fila de
 * propósito, então dois cliques viram dois jobs) procuravam ao mesmo tempo, as duas não achavam
 * nada, e as duas criavam. É a causa provada das duplicatas do acervo, todas nascidas com 8 a 65
 * segundos de diferença.
 *
 * A âncora pelo link resolve o caso de quem JÁ tem pasta. Esta trava resolve o outro, que a âncora
 * não alcança: a PRIMEIRA vez, quando ainda não há link nenhum para ancorar. Com ela, a segunda
 * execução espera a primeira terminar, e aí já encontra o link gravado.
 *
 * Em memória, e isso basta: o backend é um processo só (`ea-backend`, loopback). Se um dia houver
 * mais de uma instância, a trava precisa virar lock no Postgres ou no Redis, e este comentário é o
 * aviso. A chave nunca é PII: usa-se o id da admissão.
 */
export class TravaPorChave {
  private readonly emCurso = new Map<string, Promise<void>>();
  private readonly aguardando = new Map<string, number>();

  /** Roda `fn` garantindo que ninguém mais roda com a MESMA chave ao mesmo tempo. */
  async executar<T>(chave: string, fn: () => Promise<T>): Promise<T> {
    this.aguardando.set(chave, (this.aguardando.get(chave) ?? 0) + 1);
    const anterior = this.emCurso.get(chave);
    let liberar!: () => void;
    // Registra a MINHA vez antes de esperar a anterior: quem chegar depois espera por mim.
    this.emCurso.set(
      chave,
      new Promise<void>((resolve) => {
        liberar = resolve;
      }),
    );
    // Falha da execução anterior não pode travar a fila: ela libera a vez do mesmo jeito.
    if (anterior) await anterior.catch(() => undefined);
    try {
      return await fn();
    } finally {
      liberar();
      const restantes = (this.aguardando.get(chave) ?? 1) - 1;
      if (restantes <= 0) {
        // Ninguém mais na fila desta chave: não deixa o mapa crescer sem limite.
        this.aguardando.delete(chave);
        this.emCurso.delete(chave);
      } else {
        this.aguardando.set(chave, restantes);
      }
    }
  }

  /** Quantas chaves têm execução em curso ou fila (só para teste e diagnóstico). */
  get tamanho(): number {
    return this.emCurso.size;
  }
}
