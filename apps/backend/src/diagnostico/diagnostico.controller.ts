import { Body, Controller, Get, Logger, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { ReauditoriaService } from "../reauditoria/reauditoria.service";
import { PandapeQueueService } from "../pandape/pandape-queue.service";
import { PandapeSchedulerService } from "../pandape/pandape-scheduler.service";
import { VtColetaSchedulerService } from "../vt-coleta/vt-coleta-scheduler.service";
import { ClicksignSchedulerService } from "../clicksign/clicksign-scheduler.service";
import { ExameSchedulerService } from "../esteira/exame-scheduler.service";
import { Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { DiagnosticoService } from "./diagnostico.service";
import {
  AcaoReauditarDto,
  AcaoRearquivarDto,
  AcaoRepullDto,
  SchedulerToggleDto,
} from "./diagnostico.dto";

/**
 * TELA DE DIAGNÓSTICO (OST). Acesso restrito a MASTER/SUPER_ADMIN (`@Roles` na classe): a tela mostra
 * dado sensível de sistema e dispara ações de reprocessamento. O menu "diagnostico" entra no catálogo
 * (grupo ADMIN) para a regra de liberação por perfil, mas, como a controller é admin-only, marcá-lo
 * para um COMUM não concede acesso (fail-closed pelo RolesGuard, mesmo padrão de "usuarios").
 *
 * AÇÕES (Bloco 5): reusam os caminhos que JÁ existem (reauditar, pós-veredito de arquivamento, fila do
 * pull). Sempre POR ALVO, nunca em massa a partir da tela. A trilha (quem disparou, quando) é logada.
 */
@Roles("MASTER", "SUPER_ADMIN")
@Controller("diagnostico")
export class DiagnosticoController {
  private readonly logger = new Logger("Diagnostico");
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly diagnostico: DiagnosticoService,
    private readonly reauditoria: ReauditoriaService,
    private readonly auditoria: AuditoriaService,
    private readonly fila: PandapeQueueService,
    private readonly scheduler: PandapeSchedulerService,
    private readonly vtColetaScheduler: VtColetaSchedulerService,
    private readonly clicksignScheduler: ClicksignSchedulerService,
    private readonly exameScheduler: ExameSchedulerService,
  ) {}

  /** Snapshot completo (sinais + dependências + última coleta + histórico + alerta). */
  @Get()
  snapshot() {
    return this.diagnostico.snapshot();
  }

  /** Só o resumo do alerta, barato (badge/popup da sidebar). */
  @Get("alerta")
  alerta() {
    return this.diagnostico.alertaLeve();
  }

  /** Bloco 5: reauditar UM documento preso (por alvo). Reusa `ReauditoriaService` (dedup + gate). */
  @Post("acao/reauditar")
  async reauditar(@Body() dto: AcaoReauditarDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "reauditar", dto.admissaoId, dto.tipoDocumentoId);
    const r = await this.reauditoria.reauditar(dto.admissaoId, dto.tipoDocumentoId, user);
    return { ok: true, estado: r?.documento?.estado, origem: r?.reauditoria?.origemArquivos };
  }

  /** Bloco 5: rearquivar no Drive (por alvo). Reusa o pós-veredito (arquiva se a régua fechou). */
  @Post("acao/rearquivar")
  async rearquivar(@Body() dto: AcaoRearquivarDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "rearquivar", dto.admissaoId);
    const pos = await this.auditoria.aplicarPosVeredito(dto.admissaoId, user);
    return {
      ok: true,
      arquivado: Boolean(pos.arquivado),
      pastaUrl: pos.arquivado?.pastaUrl,
      aviso: pos.avisoDrive,
    };
  }

  /** Bloco 5: re-pull de uma admissão (por alvo), pela fila BullMQ (espaçamento/backoff). */
  @Post("acao/repull")
  async repull(@Body() dto: AcaoRepullDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "repull", dto.admissaoId);
    const [row] = (await this.db.execute(sql`
      SELECT id_precollaborator FROM integracao_pandape WHERE admissao_id = ${dto.admissaoId} LIMIT 1
    `)) as unknown as Array<{ id_precollaborator: string | null }>;
    if (!row?.id_precollaborator) {
      return { ok: false, motivo: "Admissão não veio do Pandapé (sem idPreCollaborator); nada a re-puxar." };
    }
    const ok = await this.fila.enfileirarPullDocumentos(dto.admissaoId, row.id_precollaborator, {
      reprocessar: true,
      jobIdSufixo: `diag-${Date.now().toString(36)}`,
    });
    return { ok, enfileirado: ok };
  }

  /**
   * Bloco 5: LIGA/DESLIGA o scheduler de re-consulta, sem deploy. Persistido → vale no próximo ciclo.
   * É o freio do Rike se o scheduler começar a causar problema.
   */
  @Post("scheduler/toggle")
  async schedulerToggle(@Body() dto: SchedulerToggleDto, @CurrentUser() user: AuthUser) {
    this.logger.log(
      `[DIAGNOSTICO][trilha] acao=scheduler-${dto.ligado ? "ligar" : "desligar"} por=${user.id} (${user.papel})`,
    );
    await this.scheduler.definirLigado(dto.ligado);
    return { ok: true, ligado: dto.ligado };
  }

  /**
   * Bloco 5/6: dispara UM ciclo do scheduler AGORA (enfileira no worker), para operar sob demanda e
   * para provar o incremental. No-op se o scheduler estiver desligado (respeita o freio).
   */
  @Post("scheduler/rodar-agora")
  async schedulerRodarAgora(@CurrentUser() user: AuthUser) {
    this.logger.log(`[DIAGNOSTICO][trilha] acao=scheduler-rodar-agora por=${user.id} (${user.papel})`);
    const r = await this.scheduler.dispararCiclo();
    return { ok: r.enfileirado, ...r };
  }

  /**
   * §A.17 etapa 3: LIGA/DESLIGA o scheduler da coleta de VT, sem deploy. Persistido → vale no próximo
   * ciclo. É o freio do diretor se a varredura começar a causar problema.
   */
  @Post("vt-coleta/toggle")
  async vtColetaToggle(@Body() dto: SchedulerToggleDto, @CurrentUser() user: AuthUser) {
    this.logger.log(
      `[DIAGNOSTICO][trilha] acao=vt-coleta-${dto.ligado ? "ligar" : "desligar"} por=${user.id} (${user.papel})`,
    );
    await this.vtColetaScheduler.definirLigado(dto.ligado);
    return { ok: true, ligado: dto.ligado };
  }

  /**
   * §A.17 etapa 3: dispara UM ciclo da coleta de VT AGORA (enfileira no worker). No-op se o scheduler
   * estiver desligado (respeita o freio).
   */
  @Post("vt-coleta/rodar-agora")
  async vtColetaRodarAgora(@CurrentUser() user: AuthUser) {
    this.logger.log(`[DIAGNOSTICO][trilha] acao=vt-coleta-rodar-agora por=${user.id} (${user.papel})`);
    const r = await this.vtColetaScheduler.dispararCiclo();
    return { ok: r.enfileirado, ...r };
  }

  /**
   * INT-4: LIGA/DESLIGA o scheduler da assinatura, sem deploy. Persistido → vale no próximo ciclo.
   * É o freio do diretor sobre o polling da Clicksign.
   */
  @Post("clicksign/toggle")
  async clicksignToggle(@Body() dto: SchedulerToggleDto, @CurrentUser() user: AuthUser) {
    this.logger.log(
      `[DIAGNOSTICO][trilha] acao=clicksign-${dto.ligado ? "ligar" : "desligar"} por=${user.id} (${user.papel})`,
    );
    await this.clicksignScheduler.definirLigado(dto.ligado);
    return { ok: true, ligado: dto.ligado };
  }

  /**
   * INT-4: dispara UM ciclo do tick da assinatura AGORA (enfileira no worker). No-op se o scheduler
   * estiver desligado (respeita o freio).
   */
  @Post("clicksign/rodar-agora")
  async clicksignRodarAgora(@CurrentUser() user: AuthUser) {
    this.logger.log(`[DIAGNOSTICO][trilha] acao=clicksign-rodar-agora por=${user.id} (${user.papel})`);
    const r = await this.clicksignScheduler.dispararCiclo();
    return { ok: r.enfileirado, ...r };
  }

  @Post("exame/toggle")
  async exameToggle(@Body() dto: SchedulerToggleDto, @CurrentUser() user: AuthUser) {
    this.logger.log(
      `[DIAGNOSTICO][trilha] acao=exame-${dto.ligado ? "ligar" : "desligar"} por=${user.id} (${user.papel})`,
    );
    await this.exameScheduler.definirLigado(dto.ligado);
    return { ok: true, ligado: dto.ligado };
  }

  /**
   * Dispara UM ciclo do verificador de status do Exame AGORA. Ao contrário dos outros três, ele NÃO
   * enfileira: o ciclo é banco local, sem serviço externo nem cota, então roda direto e o retorno já
   * traz o que ele fez. Respeita o freio: desligado, é no-op.
   */
  @Post("exame/rodar-agora")
  async exameRodarAgora(@CurrentUser() user: AuthUser) {
    this.logger.log(`[DIAGNOSTICO][trilha] acao=exame-rodar-agora por=${user.id} (${user.papel})`);
    const r = await this.exameScheduler.rodarCiclo();
    return { ok: r.ligado, ...r };
  }

  /** Trilha da ação: quem, quando, o quê. §A.6: id de usuário e de admissão, nada de PII. */
  private registrarTrilha(user: AuthUser, acao: string, admissaoId: string, tipoId?: string) {
    // Reusa o logger (persistido no journal, consultável). Uma tabela própria seria o passo pleno.
    // Aqui já fica quem disparou (user.id), o quê e quando (o timestamp do log).
    this.logger.log(
      `[DIAGNOSTICO][trilha] acao=${acao} admissao=${admissaoId}${tipoId ? ` tipo=${tipoId}` : ""} por=${user.id} (${user.papel})`,
    );
  }
}
