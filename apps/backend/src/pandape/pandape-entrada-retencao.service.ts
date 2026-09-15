import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";

/**
 * EXPURGO DA FILA DE ENTRADAS: 30 DIAS, UMA REGRA SÓ PARA AS DUAS CLASSES DE LINHA (decisão do
 * diretor, 15/09/2026).
 *
 *  . linha RESOLVIDA: 30 dias contados de `resolvido_em`;
 *  . linha NÃO RESOLVIDA (FALHOU, ADIADO, INERTE, NAO_ENFILEIRADO, DESCARTADO_DUPLICADO, e o
 *    RECEBIDO que ficou preso): 30 dias SEM MOVIMENTO, contados de `ultima_tentativa_em`, ou de
 *    `recebido_em` quando nunca houve tentativa nenhuma.
 *
 * ┌─ POR QUE A SEGUNDA CLASSE EXISTE, e ela é a mais importante das duas (§A.6) ──────────────────┐
 * │ Uma regra contada só de `resolvido_em` alcançaria apenas quem ENTROU no EA. A linha de quem     │
 * │ NUNCA virou admissão ficaria retida INDEFINIDAMENTE, e essa pessoa é justamente o titular com   │
 * │ o vínculo mais fraco com o Grupo Soulan: guardar para sempre o identificador do ATS de quem     │
 * │ nunca virou colaborador é o oposto de minimização. A rotina NASCE cobrindo as duas, porque      │
 * │ subir cobrindo uma só criaria um passivo que ninguém lembraria de revisitar.                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A linha existe para que um evento não desapareça em silêncio enquanto ele ainda é trabalho de
 * alguém. Passados 30 dias sem ninguém mexer, ela deixou de ser trabalho de qualquer jeito: o
 * pré-colaborador do caso real foi reprocessado em DIAS, não em meses.
 *
 * AQUI SE DELETA, e não se anonimiza, ao contrário do expurgo da Central de Candidatos: lá a linha
 * sustenta a contagem de um processo seletivo passado e apagá-la mentiria num indicador; aqui a
 * linha não sustenta contagem nenhuma (a admissão que nasceu tem vida própria, com o seu
 * `integracao_pandape`), e o que sobraria depois de tirar os ids seria uma linha vazia.
 *
 * O RELÓGIO DA PENDENTE É A TENTATIVA, e SÓ ela: enquanto alguém re-tenta, `ultima_tentativa_em`
 * anda e a linha nunca vence. `ultimo_evento_em` NÃO entra na conta, de propósito: o Pandapé
 * dispara a cada mudança de etapa, e deixar o ATS "falar" segurar a linha faria um evento sobre o
 * qual ninguém nunca agiu ser retido indefinidamente, que é exatamente o que a regra dos 30 dias
 * existe para impedir. O corte apaga MAIS do que apagaria com o evento na conta, e essa é a direção
 * segura para a §A.6; mexer nisto muda retenção de dado e não é ajuste de implementação.
 *
 * O PADRÃO É O DO `RetencaoCandidatosService`: sweep in-process a cada hora, `timer.unref()`, e a
 * falha da varredura vira LOG, nunca exceção solta. Promessa rejeitada sem captura é
 * `unhandledRejection`, e no Node 20 isso MATA O PROCESSO: sob `systemd --user` com restart, vira
 * crash-loop e leva junto Esteira, Admissões e Clicksign, que não têm nada a ver com isto.
 */
@Injectable()
export class PandapeEntradaRetencaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("PandapeEntradaRetencao");
  private timer?: NodeJS.Timeout;
  private static readonly INTERVALO_MS = 60 * 60 * 1000;
  /** O prazo do diretor, nomeado para a régua ser lida e não deduzida do SQL. */
  private static readonly RETENCAO = "30 days";

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  onModuleInit(): void {
    this.varrer();
    this.timer = setInterval(() => this.varrer(), PandapeEntradaRetencaoService.INTERVALO_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private varrer(): void {
    void this.expurgar().catch((err: unknown) => {
      // §A.6: SÓ a mensagem. Nem o objeto do erro, nem o `detail` do Postgres, nem a query.
      this.logger.error(
        `Falha na varredura de retenção da fila de entradas: ${
          err instanceof Error ? err.message : "erro sem mensagem"
        }`,
      );
    });
  }

  /** Uma passada. Devolve quantas linhas saíram. */
  async expurgar(): Promise<number> {
    const corte = sql.raw(PandapeEntradaRetencaoService.RETENCAO);
    const linhas = await this.db.execute(sql`
      delete from pandape_entrada
       -- UMA EXPRESSÃO SÓ para as duas classes: a linha resolvida conta do carimbo de resolução, e a
       -- pendente conta do ÚLTIMO MOVIMENTO (tentativa, ou a chegada quando nunca houve tentativa).
       -- O coalesce dá a ordem de precedência e nunca devolve nulo, porque recebido_em é NOT NULL:
       -- não existe linha sem relógio, que seria linha retida para sempre por omissão.
       where coalesce(resolvido_em, ultima_tentativa_em, recebido_em)
             <= now() - interval '${corte}'
      returning id
    `);
    const n = Array.isArray(linhas)
      ? linhas.length
      : ((linhas as { length?: number }).length ?? 0);
    // Só a CONTAGEM vai para o log (§A.6).
    if (n > 0) this.logger.log(`Fila de entradas: ${n} linha(s) expurgada(s) por retenção.`);
    return n;
  }
}
