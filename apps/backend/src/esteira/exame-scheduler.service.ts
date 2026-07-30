import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  documentosAdmissao,
  exameAgendamento,
  exameAgendamentoEndereco,
  exameSchedulerEstado,
  frentesAdmissao,
  frenteStatusEventos,
  tiposDocumento,
} from "../db/schema";
import { admissaoOperavel } from "../domain/admissao";
import { statusAutomaticoExame, type StatusEsperaAso } from "../domain/exame-status";
import { INTERVALO_MS, type EstadoScheduler } from "../domain/scheduler-exame";

const CHAVE = "exame";

/** Status de onde o verificador PODE mover. Fora daqui ele não encosta. */
const STATUS_GOVERNADOS = ["AGENDADO", "AGUARDANDO_ASO", "ASO_PENDENTE"] as const;

/**
 * VERIFICADOR DO STATUS DO EXAME (OST Onda 2, item 3), de hora em hora.
 *
 * O PROBLEMA. A frente EXAME tinha um "Agendado" só cobrindo dois mundos opostos: quem tem exame
 * amanhã e quem fez o exame semana passada e não mandou o ASO. A fila não distinguia espera normal de
 * atraso, e o atraso só aparecia se alguém abrisse admissão por admissão.
 *
 * POR QUE SEM FILA, diferente dos outros três schedulers. Pandapé, VT e Clicksign enfileiram no
 * BullMQ porque falam com serviço EXTERNO sob cota (§A.5) e precisam de limiter e backoff. Este aqui
 * só lê e escreve o banco local: fila seria cerimônia sem ganho, e mais uma peça para quebrar. O
 * molde mantido é o que importa: `setInterval` in-process, estado persistido com liga/desliga lido a
 * cada ciclo, heartbeat do "vivo" e card no Diagnóstico.
 *
 * O QUE ELE NÃO TOCA, de propósito:
 *  - frente CONCLUÍDA ou CANCELADA: decisão humana, e APTO é o fim da linha;
 *  - status fora de `STATUS_GOVERNADOS` (A_AGENDAR não tem data para julgar);
 *  - admissão NÃO OPERÁVEL (`admissaoOperavel`): encerrada ou PAUSADA. Marcar de atrasada quem está
 *    pausado por decisão seria cobrar trabalho que o próprio diretor mandou parar.
 *
 * As REGRAS não moram aqui: moram em `domain/exame-status.ts`, puras e testadas com relógio injetado.
 * Este serviço é só o laço, a leitura e a escrita.
 *
 * §A.6: log e estado levam contagens e id de admissão, nunca nome, CPF ou dado de clínica.
 */
@Injectable()
export class ExameSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ExameSchedulerService");
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.rodarCiclo(), INTERVALO_MS);
    // UM ciclo logo após o boot, ao contrário dos outros três schedulers, e por um motivo concreto:
    // o "parado" é calculado por ausência de ciclo bem-sucedido, então sem esta primeira rodada o
    // card do Diagnóstico ficaria VERMELHO por até uma hora depois de cada deploy, avisando de uma
    // falha que não existe. Aqui isso é barato: o ciclo é banco local, sem serviço externo nem cota
    // (é justamente o que dispensou a fila). O atraso de 30s deixa a aplicação subir primeiro.
    setTimeout(() => void this.rodarCiclo(), 30_000).unref?.();
    this.timer.unref?.();
    this.logger.log(
      `Scheduler de status do Exame inicializado (cadência ${INTERVALO_MS / 60000} min).`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * UM ciclo. Nunca lança (o interval não pode derrubar o processo) e nunca roda duas vezes em
   * paralelo (a trava `rodando` cobre o ciclo lento que encavala no próximo tique).
   */
  async rodarCiclo(agora = new Date()): Promise<{
    ligado: boolean;
    varridas: number;
    aguardando: number;
    pendentes: number;
  }> {
    const vazio = { ligado: true, varridas: 0, aguardando: 0, pendentes: 0 };
    if (this.rodando) return { ...vazio, ligado: true };
    this.rodando = true;
    try {
      const estado = await this.estado();
      if (!estado.ligado) return { ...vazio, ligado: false };

      await this.db
        .insert(exameSchedulerEstado)
        .values({ chave: CHAVE, ultimoCicloEm: agora })
        .onConflictDoUpdate({
          target: exameSchedulerEstado.chave,
          set: { ultimoCicloEm: agora },
        });

      const candidatas = await this.candidatas();
      let aguardando = 0;
      let pendentes = 0;
      let falhas = 0;

      for (const c of candidatas) {
        try {
          const alvo = statusAutomaticoExame(
            {
              data: c.data,
              // TODOS os horários do dia. O domínio usa o ÚLTIMO como referência do atraso: com
              // três endereços, o exame só terminou depois do último, e marcar atrasado quem ainda
              // está no roteiro seria falso.
              horarios: c.horarios,
              previsaoAso: c.previsaoAso,
              asoAnexado: c.asoAnexado,
            },
            agora,
          );
          if (!alvo || alvo === c.status) continue;
          await this.aplicar(c, alvo, agora);
          if (alvo === "AGUARDANDO_ASO") aguardando += 1;
          else pendentes += 1;
        } catch {
          falhas += 1;
        }
      }

      const nota = `varridas=${candidatas.length}, aguardando=${aguardando}, pendentes=${pendentes}`;
      await this.db
        .insert(exameSchedulerEstado)
        .values({
          chave: CHAVE,
          ultimoCicloOkEm: agora,
          ultimoCicloVarridas: candidatas.length,
          ultimoCicloAguardando: aguardando,
          ultimoCicloPendentes: pendentes,
          ultimoCicloFalhas: falhas,
          ultimoCicloNota: nota,
        })
        .onConflictDoUpdate({
          target: exameSchedulerEstado.chave,
          set: {
            ultimoCicloOkEm: agora,
            ultimoCicloVarridas: candidatas.length,
            ultimoCicloAguardando: aguardando,
            ultimoCicloPendentes: pendentes,
            ultimoCicloFalhas: falhas,
            ultimoCicloNota: nota,
          },
        });

      if (aguardando + pendentes > 0) this.logger.log(`Ciclo do Exame: ${nota}.`);
      return { ligado: true, varridas: candidatas.length, aguardando, pendentes };
    } catch (err) {
      this.logger.warn(
        `Ciclo do Exame falhou: ${err instanceof Error ? err.message : "erro"}. O próximo tenta de novo.`,
      );
      return { ...vazio, ligado: true };
    } finally {
      this.rodando = false;
    }
  }

  /** Frentes de EXAME que o verificador pode julgar agora, já com agendamento e presença do ASO. */
  private async candidatas(): Promise<
    Array<{
      frenteId: string;
      admissaoId: string;
      status: string;
      data: string | null;
      /** TODOS os horários do dia (um por endereço). A regra usa o ÚLTIMO. */
      horarios: (string | null)[];
      previsaoAso: string | null;
      asoAnexado: boolean;
    }>
  > {
    const linhas = await this.db
      .select({
        frenteId: frentesAdmissao.id,
        admissaoId: frentesAdmissao.admissaoId,
        status: frentesAdmissao.status,
        farolGlobal: admissoes.farolGlobal,
        pausadaEm: admissoes.pausadaEm,
        agendamentoId: exameAgendamento.id,
        data: exameAgendamento.data,
        previsaoAso: exameAgendamento.previsaoAso,
      })
      .from(frentesAdmissao)
      .innerJoin(admissoes, eq(admissoes.id, frentesAdmissao.admissaoId))
      .leftJoin(exameAgendamento, eq(exameAgendamento.admissaoId, frentesAdmissao.admissaoId))
      .where(
        and(
          eq(frentesAdmissao.tipo, "EXAME"),
          eq(frentesAdmissao.concluida, false),
          inArray(frentesAdmissao.status, [...STATUS_GOVERNADOS]),
        ),
      );

    const operaveis = linhas.filter((l) => admissaoOperavel(l.farolGlobal, l.pausadaEm));
    const comAso = await this.asoAnexadoSet(operaveis.map((l) => l.admissaoId));
    // MULTI-ENDEREÇO (OST Onda 2): os horários vêm da tabela filha, um por endereço. A regra do
    // atraso já sabia lidar com a lista desde que nasceu; o que faltava era a lista existir.
    const horariosPorAgendamento = await this.horariosPorAgendamento(
      operaveis.map((l) => l.agendamentoId).filter((id): id is string => Boolean(id)),
    );
    return operaveis.map((l) => ({
      frenteId: l.frenteId,
      admissaoId: l.admissaoId,
      status: l.status,
      data: l.data,
      horarios: l.agendamentoId ? (horariosPorAgendamento.get(l.agendamentoId) ?? []) : [],
      previsaoAso: l.previsaoAso,
      asoAnexado: comAso.has(l.admissaoId),
    }));
  }

  /** Horários de cada agendamento (um por endereço), em UMA consulta. */
  private async horariosPorAgendamento(ids: string[]): Promise<Map<string, (string | null)[]>> {
    const mapa = new Map<string, (string | null)[]>();
    if (ids.length === 0) return mapa;
    const linhas = await this.db
      .select({
        agendamentoId: exameAgendamentoEndereco.agendamentoId,
        horario: exameAgendamentoEndereco.horario,
      })
      .from(exameAgendamentoEndereco)
      .where(inArray(exameAgendamentoEndereco.agendamentoId, ids));
    for (const l of linhas) {
      const lista = mapa.get(l.agendamentoId) ?? [];
      lista.push(l.horario);
      mapa.set(l.agendamentoId, lista);
    }
    return mapa;
  }

  /** Admissões com o ASO registrado (qualquer estado que não seja PENDENTE = o documento chegou). */
  private async asoAnexadoSet(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "ASO"),
    });
    if (!tipo) return new Set();
    const linhas = await this.db
      .select({ admissaoId: documentosAdmissao.admissaoId })
      .from(documentosAdmissao)
      .where(
        and(
          inArray(documentosAdmissao.admissaoId, ids),
          eq(documentosAdmissao.tipoDocumentoId, tipo.id),
          ne(documentosAdmissao.estado, "PENDENTE"),
        ),
      );
    return new Set(linhas.map((l) => l.admissaoId));
  }

  /** Move a frente e registra o evento. Autor nulo: a transição é do SISTEMA, e a trilha diz isso. */
  private async aplicar(
    c: { frenteId: string; admissaoId: string; status: string },
    alvo: StatusEsperaAso,
    agora: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(frentesAdmissao)
        .set({ status: alvo, atualizadoEm: agora })
        .where(eq(frentesAdmissao.id, c.frenteId));
      await tx.insert(frenteStatusEventos).values({
        admissaoId: c.admissaoId,
        frenteId: c.frenteId,
        tipo: "EXAME",
        deStatus: c.status,
        paraStatus: alvo,
        reversao: false,
        autorId: null,
      });
    });
  }

  /** Estado atual (cria a linha singleton na primeira leitura). */
  async estado(): Promise<EstadoScheduler> {
    const [row] = await this.db
      .select()
      .from(exameSchedulerEstado)
      .where(eq(exameSchedulerEstado.chave, CHAVE));
    if (!row) {
      await this.db.insert(exameSchedulerEstado).values({ chave: CHAVE }).onConflictDoNothing();
      return {
        ligado: true,
        ultimoCicloEm: null,
        ultimoCicloOkEm: null,
        varridas: 0,
        aguardando: 0,
        pendentes: 0,
        falhas: 0,
        nota: null,
      };
    }
    return {
      ligado: row.ligado,
      ultimoCicloEm: row.ultimoCicloEm ? row.ultimoCicloEm.toISOString() : null,
      ultimoCicloOkEm: row.ultimoCicloOkEm ? row.ultimoCicloOkEm.toISOString() : null,
      varridas: row.ultimoCicloVarridas,
      aguardando: row.ultimoCicloAguardando,
      pendentes: row.ultimoCicloPendentes,
      falhas: row.ultimoCicloFalhas,
      nota: row.ultimoCicloNota,
    };
  }

  /** Liga/desliga sem deploy (lido a cada ciclo), no padrão dos outros schedulers. */
  async definirLigado(ligado: boolean): Promise<{ ligado: boolean }> {
    await this.db
      .insert(exameSchedulerEstado)
      .values({ chave: CHAVE, ligado })
      .onConflictDoUpdate({ target: exameSchedulerEstado.chave, set: { ligado } });
    return { ligado };
  }

  /** Só para o diagnóstico exibir sem recalcular: quantas frentes estão em cada status de espera. */
  async contagemEspera(): Promise<{ aguardando: number; pendentes: number }> {
    const [row] = await this.db
      .select({
        aguardando: sql<number>`count(*) filter (where ${frentesAdmissao.status} = 'AGUARDANDO_ASO')::int`,
        pendentes: sql<number>`count(*) filter (where ${frentesAdmissao.status} = 'ASO_PENDENTE')::int`,
      })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.tipo, "EXAME"));
    return { aguardando: row?.aguardando ?? 0, pendentes: row?.pendentes ?? 0 };
  }
}
