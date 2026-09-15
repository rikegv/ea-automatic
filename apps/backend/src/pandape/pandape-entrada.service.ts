import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  PandapeEntradaDesfecho,
  PandapeEntradaItem,
  PandapeEntradaMotivo,
  PandapeEntradaOrigem,
} from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { pandapeEntrada } from "../db/schema";
import { desfechoEncerra, pendenteDeAdmissao } from "../domain/pandape-entrada";
import { PandapeNomeCacheService } from "./pandape-nome-cache.service";

/** O que a porta sabe no instante em que o evento chega: identificadores do ATS e nada mais. */
export interface RecebimentoDeEntrada {
  idPrecollaborator: string;
  idMatch?: string;
  idVacancy?: string;
  origem: PandapeEntradaOrigem;
  /** Etapa do ATS, quando o payload a traz. Rótulo de processo, não atributo de pessoa. */
  etapa?: string;
}

/** O que o worker sabe quando termina: o que aconteceu, por quê, e o que nasceu disso. */
export interface DesfechoDeEntrada {
  idPrecollaborator: string;
  desfecho: PandapeEntradaDesfecho;
  motivo?: PandapeEntradaMotivo;
  admissaoId?: string;
  idMatch?: string;
  idVacancy?: string;
}

/**
 * Filtros da grade. UM só, por escolha do diretor (§A.30): a SITUAÇÃO. Ele é MULTISELECT (§A.28),
 * então a lista vira `in` e a ausência vira "sem filtro". Motivo, origem e vaga são colunas da tela
 * e NÃO são filtráveis: filtro que a tela não oferece é construção além da OST (§A.31).
 */
export interface FiltrosDeEntrada {
  desfecho?: string[];
  /** Por padrão a tela é a FILA: só o que ainda é trabalho de alguém. */
  somentePendentes?: boolean;
  limite?: number;
}

/**
 * ─ O PONTO ÚNICO DE ESCRITA DA FILA DE ENTRADAS DO PANDAPÉ (OST 15/09/2026) ────────────────────
 *
 * Dois momentos, dois métodos: CHEGOU (`registrarRecebimento`, na porta, ANTES de enfileirar) e
 * TERMINOU (`registrarDesfecho`, no worker, num sítio só). Não é organização: é o requisito. Cada
 * caminho gravando do seu jeito é como o `processarCandidato` chegou a ter três saídas silenciosas
 * que terminavam o job em VERDE sem ninguém saber que existiu uma pessoa ali.
 *
 * §A.6 EM TRÊS LINHAS, e elas são a razão de este arquivo ser curto:
 *  . só identificadores do ATS entram; nome, CPF, e-mail e payload não têm coluna para onde ir;
 *  . `motivo` é CÓDIGO de conjunto fechado, classificado a partir da exceção, nunca a exceção;
 *  . o log daqui carrega contagem e `idPrecollaborator` (id de SISTEMA), jamais dado de pessoa.
 */
@Injectable()
export class PandapeEntradaService {
  private readonly logger = new Logger("PandapeEntradaService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly nomes: PandapeNomeCacheService,
  ) {}

  /**
   * O EVENTO VIRA LINHA, e isso acontece ANTES de ele virar job.
   *
   * A ORDEM É O REQUISITO: gravar depois de enfileirar abre uma janela em que o job já existe e a
   * linha não, e o worker pode terminar tentando carimbar o desfecho de uma linha que ainda não
   * nasceu. É a mesma classe de erro da INT-4, onde notificar antes de gravar o envelope duplicava o
   * envelope na retentativa (§A.5).
   *
   * RE-ENTREGA NÃO DUPLICA e NÃO REABRE: o `on conflict` mantém `origem` (IMUTÁVEL, §4-B/13),
   * mantém `recebido_em` (o instante da PRIMEIRA chegada, que é o que ordena a fila) e NÃO mexe em
   * linha já resolvida. O Pandapé dispara a cada mudança de etapa; reabrir encheria a fila de ruído.
   */
  async registrarRecebimento(ev: RecebimentoDeEntrada): Promise<void> {
    await this.db
      .insert(pandapeEntrada)
      .values({
        idPrecollaborator: ev.idPrecollaborator,
        idMatch: ev.idMatch ?? null,
        idVacancy: ev.idVacancy ?? null,
        origem: ev.origem,
        desfecho: "RECEBIDO",
      })
      .onConflictDoUpdate({
        target: pandapeEntrada.idPrecollaborator,
        set: {
          // Identificador que chegou vazio da primeira vez e veio preenchido agora é ganho; o
          // inverso (sobrescrever com nulo) apagaria informação.
          idMatch: sql`coalesce(excluded.id_match, ${pandapeEntrada.idMatch})`,
          idVacancy: sql`coalesce(excluded.id_vacancy, ${pandapeEntrada.idVacancy})`,
          // CARIMBA O EVENTO, NÃO A TENTATIVA. `tentativas` conta só tentativa de transformar o
          // evento em admissão: somar aqui os disparos de mudança de etapa do Pandapé faria uma
          // linha resolvida exibir "tentativas: 12" sem ninguém ter tentado nada doze vezes.
          ultimoEventoEm: new Date(),
          atualizadoEm: new Date(),
        },
      });
  }

  /**
   * O EVENTO TERMINOU, e é aqui que o silêncio acaba.
   *
   * O CARIMBO `resolvido_em` É DECIDIDO PELA RÉGUA (`desfechoEncerra`), nunca por quem chama: é o
   * carimbo que tira a linha da fila, e deixar essa decisão espalhada recria a divergência que a
   * §A.19 eliminou. FALHOU e ADIADO não carimbam: continuam sendo trabalho de alguém.
   *
   * LINHA JÁ RESOLVIDA NÃO REGRIDE. Um evento de etapa que chegue depois do sucesso só incrementa
   * as tentativas; sem isso, o primeiro webhook de mudança de etapa após a admissão nascer jogaria
   * a pessoa de volta na fila.
   *
   * SEM LINHA PRÉVIA, CRIA. Acontece no reprocesso de um job antigo, de antes desta tabela existir
   * (o botão do Diagnóstico chama `job.retry()`, §A.39): a origem então é MANUAL, porque foi um
   * humano que pediu, e é a única situação em que MANUAL nasce.
   */
  async registrarDesfecho(d: DesfechoDeEntrada): Promise<void> {
    const encerra = desfechoEncerra(d.desfecho);
    const agora = new Date();
    await this.db
      .insert(pandapeEntrada)
      .values({
        idPrecollaborator: d.idPrecollaborator,
        idMatch: d.idMatch ?? null,
        idVacancy: d.idVacancy ?? null,
        origem: "MANUAL",
        desfecho: d.desfecho,
        motivo: d.motivo ?? null,
        admissaoId: d.admissaoId ?? null,
        tentativas: 1,
        ultimaTentativaEm: agora,
        ultimoEventoEm: agora,
        resolvidoEm: encerra ? agora : null,
      })
      .onConflictDoUpdate({
        target: pandapeEntrada.idPrecollaborator,
        set: {
          desfecho: sql`case when ${pandapeEntrada.resolvidoEm} is null then excluded.desfecho else ${pandapeEntrada.desfecho} end`,
          motivo: sql`case when ${pandapeEntrada.resolvidoEm} is null then excluded.motivo else ${pandapeEntrada.motivo} end`,
          admissaoId: sql`coalesce(excluded.admissao_id, ${pandapeEntrada.admissaoId})`,
          idMatch: sql`coalesce(excluded.id_match, ${pandapeEntrada.idMatch})`,
          idVacancy: sql`coalesce(excluded.id_vacancy, ${pandapeEntrada.idVacancy})`,
          tentativas: sql`${pandapeEntrada.tentativas} + 1`,
          ultimaTentativaEm: agora,
          resolvidoEm: encerra
            ? sql`coalesce(${pandapeEntrada.resolvidoEm}, ${agora})`
            : pandapeEntrada.resolvidoEm,
          atualizadoEm: agora,
        },
      });
    // §A.6: id do ATS (id de SISTEMA) e código. Nenhum dado de pessoa, nenhuma mensagem de erro.
    this.logger.log(
      `Entrada Pandapé ${d.idPrecollaborator}: ${d.desfecho}${d.motivo ? ` (${d.motivo})` : ""}.`,
    );
  }

  /**
   * ─ DESFECHO FRACO: REGISTRA SEM APAGAR NADA (vetos V4 e RES-1 da auditoria) ──────────────────
   *
   * DESFECHO FRACO é o que aconteceu ANTES de qualquer tentativa de virar admissão: o `add` do
   * BullMQ descartado por jobId ocupado, e a fila indisponível. Os dois são informação, mas
   * informação de MENOR valor do que a que a linha já carrega.
   *
   * POR ISSO ELES NÃO PASSAM PELO `registrarDesfecho`, e a diferença é concreta em produção: uma
   * linha pendente em `ADIADO` com `SEM_CPF_NA_ORIGEM` viraria "Duplicado" (ou "Não enfileirado")
   * com motivo NULO na próxima re-entrega do Pandapé, e a coluna Motivo deixaria de dizer à pessoa
   * O QUE RESOLVER. Um operador olhando a tela no meio de uma queda de Redis é exatamente quem mais
   * precisa que aquela coluna esteja dizendo a verdade. E `tentativas` não pode andar aqui: ela
   * conta tentativa de transformar o evento em admissão, e não houve nenhuma.
   *
   * ESCREVE SÓ SOBRE LINHA AINDA SEM HISTÓRIA (`desfecho = RECEBIDO`), e carimba o evento. Onde já
   * há um desfecho de verdade, não toca em nada além do instante do último evento.
   */
  private async carimbarDesfechoFraco(
    idPrecollaborator: string,
    desfecho: "DESCARTADO_DUPLICADO" | "NAO_ENFILEIRADO",
  ): Promise<void> {
    await this.db
      .update(pandapeEntrada)
      .set({
        desfecho: sql`case when ${pandapeEntrada.desfecho} = 'RECEBIDO' then ${desfecho}::pandape_entrada_desfecho else ${pandapeEntrada.desfecho} end`,
        ultimoEventoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(
        and(
          eq(pandapeEntrada.idPrecollaborator, idPrecollaborator),
          isNull(pandapeEntrada.resolvidoEm),
        ),
      );
  }

  /** O BullMQ descartou o enfileiramento porque o jobId ainda estava ocupado (veto V4). */
  async registrarDescarteDuplicado(idPrecollaborator: string): Promise<void> {
    await this.carimbarDesfechoFraco(idPrecollaborator, "DESCARTADO_DUPLICADO");
  }

  /**
   * A fila não aceitou o evento (Redis fora) e NENHUM job chegou a existir (RES-1).
   *
   * Mesmo padrão do descarte, e pelo mesmo motivo: o cenário é uma queda de Redis com o Pandapé
   * re-entregando, e é aí que apagar o motivo de uma linha que já tinha diagnóstico dói mais.
   */
  async registrarNaoEnfileirado(idPrecollaborator: string): Promise<void> {
    await this.carimbarDesfechoFraco(idPrecollaborator, "NAO_ENFILEIRADO");
  }

  /**
   * TENTATIVA INTERMEDIÁRIA (exigência 11): o job falhou mas AINDA VAI RE-TENTAR. Só incrementa o
   * contador e carimba o instante. Marcar `FALHOU` aqui faria a fila mentir ao contrário do buraco
   * original: a linha iria a FALHOU na PRIMEIRA das seis tentativas, e a tela mostraria como perdido
   * um evento que vai nascer daqui a uma hora.
   */
  async registrarTentativa(idPrecollaborator: string): Promise<void> {
    await this.db
      .update(pandapeEntrada)
      .set({
        tentativas: sql`${pandapeEntrada.tentativas} + 1`,
        ultimaTentativaEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(
        and(
          eq(pandapeEntrada.idPrecollaborator, idPrecollaborator),
          isNull(pandapeEntrada.resolvidoEm),
        ),
      );
  }

  /**
   * A GRADE. `pendenteDeAdmissao` é a régua ÚNICA: o recorte "ainda é trabalho" NÃO é reescrito aqui
   * em SQL com outra redação (§A.19). O `where` de banco existe só para não trazer a tabela inteira,
   * e o filtro autoritativo roda sobre a linha carregada.
   */
  async listar(f: FiltrosDeEntrada = {}): Promise<PandapeEntradaItem[]> {
    const condicoes = [];
    if (f.somentePendentes !== false) condicoes.push(isNull(pandapeEntrada.resolvidoEm));
    if (f.desfecho?.length) {
      condicoes.push(inArray(pandapeEntrada.desfecho, f.desfecho as PandapeEntradaDesfecho[]));
    }

    const linhas = await this.db
      .select()
      .from(pandapeEntrada)
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(pandapeEntrada.recebidoEm))
      .limit(Math.min(Math.max(f.limite ?? 500, 1), 2000));

    return linhas
      .filter((l) =>
        f.somentePendentes === false
          ? true
          : pendenteDeAdmissao({ desfecho: l.desfecho, resolvidoEm: l.resolvidoEm }),
      )
      .map((l) => {
        // O nome vem do CACHE EM MEMÓRIA, nunca do banco (não há coluna, e não pode passar a haver).
        // Ausente enquanto a resolução não chegou: a tela mostra "não informado" (§A.11).
        const nome = this.nomes.ler(l.idPrecollaborator);
        const item: PandapeEntradaItem = {
          id: l.id,
          idPrecollaborator: l.idPrecollaborator,
          idVacancy: l.idVacancy,
          origem: l.origem,
          desfecho: l.desfecho,
          motivo: l.motivo,
          tentativas: l.tentativas,
          recebidoEm: l.recebidoEm.toISOString(),
          ultimaTentativaEm: l.ultimaTentativaEm?.toISOString() ?? null,
          resolvidoEm: l.resolvidoEm?.toISOString() ?? null,
          admissaoId: l.admissaoId,
        };
        return nome ? { ...item, candidatoNome: nome } : item;
      });
  }

  /** Uma linha pelo id da tabela (o reprocesso precisa do `idPrecollaborator` dela). */
  async porId(id: string) {
    return this.db.query.pandapeEntrada.findFirst({ where: eq(pandapeEntrada.id, id) });
  }
}
