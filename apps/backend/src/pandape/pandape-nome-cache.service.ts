import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";

/**
 * ─ O NOME DO CANDIDATO NA GRADE, SEM ELE TOCAR O BANCO (decisão do diretor, 15/09/2026) ────────
 *
 * A fila mostra o nome de quem não virou admissão, porque uma lista de ids de ATS é ilegível para
 * quem trabalha. E a tabela `pandape_entrada` NÃO TEM coluna de nome e não pode ganhar uma (§A.6).
 * A saída é esta: um cache EM MEMÓRIA do processo, preenchido pelo WORKER (que já tem o nome à mão
 * quando consulta o pré-colaborador, sob o limiter da fila) e lido pela grade.
 *
 * A RÉGUA, que é o que torna isto minimização e não um cadastro paralelo:
 *  1. TETO com evicção (500), ALÉM do TTL. O backend roda por SEMANAS sob `systemd --user`: TTL sem
 *     teto vira um cadastro de nomes vivo no processo.
 *  2. TTL verificado na LEITURA, e a entrada vencida é REMOVIDA, não apenas ignorada.
 *  3. PROIBIDA qualquer serialização. A armadilha é concreta: o BullMQ grava o RETORNO do job no
 *     Redis (`returnvalue`), então o nome nunca é retorno de job, nunca entra em `job.data` e nunca
 *     em `updateProgress`. Worker e HTTP são o MESMO processo, então quem resolve escreve aqui
 *     direto e o controller lê daqui.
 *  4. ZERO log: este arquivo não tem nenhuma chamada de logger que receba o nome. Só contagem.
 *  5. ZERO banco, por construção.
 *  6. Limpeza no `onModuleDestroy`, junto do fechamento do worker.
 *  7. A resolução roda NO WORKER, sob o limiter de 800/300.000ms que já existe (o teto do Pandapé é
 *     compartilhado com o webhook que alimenta a folha, §A.5: é requisito de segurança, não
 *     performance). A grade lê SÓ o cache e mostra "não informado" enquanto não houver entrada.
 */
@Injectable()
export class PandapeNomeCacheService implements OnModuleDestroy {
  private readonly logger = new Logger("PandapeNomeCache");
  /** Ordem de inserção do Map é a ordem de chegada: é ela que dá a evicção FIFO de graça. */
  private readonly cache = new Map<string, { nome: string; expiraEm: number }>();

  /** TTL de MINUTOS, constante nomeada para a régua ser lida e não deduzida de um número solto. */
  static readonly TTL_MS = 10 * 60 * 1000;
  /** Teto de entradas vivas. Batido o teto, a MAIS ANTIGA sai. */
  static readonly TETO = 500;

  /** Guarda o nome resolvido no worker. Nome vazio é ignorado (não se guarda marcador nenhum). */
  guardar(idPrecollaborator: string, nome: string | undefined | null): void {
    const limpo = (nome ?? "").trim();
    if (!idPrecollaborator || !limpo) return;
    // Regravar move a entrada para o fim da ordem: quem chegou primeiro continua sendo o primeiro a
    // sair, e a entrada recém-vista não é evicta por antiguidade de uma gravação anterior.
    this.cache.delete(idPrecollaborator);
    this.cache.set(idPrecollaborator, { nome: limpo, expiraEm: Date.now() + PandapeNomeCacheService.TTL_MS });
    while (this.cache.size > PandapeNomeCacheService.TETO) {
      const maisAntigo = this.cache.keys().next();
      if (maisAntigo.done) break;
      this.cache.delete(maisAntigo.value);
    }
  }

  /** Lê. Entrada vencida é REMOVIDA na leitura (ponto 2 da régua), não só ignorada. */
  ler(idPrecollaborator: string): string | undefined {
    const e = this.cache.get(idPrecollaborator);
    if (!e) return undefined;
    if (e.expiraEm <= Date.now()) {
      this.cache.delete(idPrecollaborator);
      return undefined;
    }
    return e.nome;
  }

  /** Só a CONTAGEM, para o Diagnóstico. Nunca as chaves, nunca os valores. */
  tamanho(): number {
    return this.cache.size;
  }

  onModuleDestroy(): void {
    const n = this.cache.size;
    this.cache.clear();
    if (n > 0) this.logger.log(`Cache de nomes limpo: ${n} entrada(s) descartada(s).`);
  }
}
