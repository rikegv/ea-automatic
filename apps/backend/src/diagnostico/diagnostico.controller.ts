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
  AcaoLigarPastaDto,
  AcaoZerarPendenciaDto,
  AcaoReauditarDto,
  AcaoRearquivarDto,
  AcaoRepullDto,
  SchedulerToggleDto,
} from "./diagnostico.dto";
import { AiClientService } from "../ai/ai-client.service";
import { idDaPastaUrl, urlDaPasta } from "../ai/drive-routing";

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
    private readonly ai: AiClientService,
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

  /**
   * LIGA a admissão a uma pasta que JÁ EXISTE no Drive (OST da duplicação, item 5).
   *
   * Grava `drive_pasta_url`, limpa o motivo de falha e, com isso, a admissão SAI do card "Régua
   * Fechada Sem Pasta" na hora. Serve para o caso em que o prontuário existe e só o link se perdeu,
   * que era trabalho de fábrica e agora o diretor resolve sozinho pela tela.
   *
   * A pasta é CONFERIDA no Drive antes de gravar: link inválido ou pasta inexistente vira erro
   * claro, e não um link quebrado gravado na admissão. Não move nem apaga nada (§A.6).
   */
  @Post("acao/ligar-pasta")
  async ligarPasta(@Body() dto: AcaoLigarPastaDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "ligar-pasta", dto.admissaoId);
    const folderId = idDaPastaUrl(dto.pasta);
    if (!folderId) {
      return { ok: false, motivo: "Link ou id de pasta inválido. Cole o link da pasta do Drive." };
    }
    const conferida = await this.ai.validarPastaDrive(folderId);
    if (!conferida.valido) {
      return {
        ok: false,
        motivo: `A pasta não foi encontrada no Drive${conferida.motivo ? ` (${conferida.motivo})` : ""}.`,
      };
    }
    const url = urlDaPasta(folderId);
    await this.db.execute(sql`
      UPDATE admissoes
         SET drive_pasta_url = ${url},
             drive_falha_motivo = NULL,
             drive_falha_em = NULL,
             atualizado_em = now()
       WHERE id = ${dto.admissaoId}
    `);
    this.logger.log(`Admissão ${dto.admissaoId} ligada à pasta ${folderId} pelo Diagnóstico.`);
    return { ok: true, pastaUrl: url };
  }

  /**
   * ZERA a pendência de arquivamento de uma admissão (decisão do diretor).
   *
   * O diretor identifica que o caso está resolvido e fecha o sinal ele mesmo, sem fábrica. Só apaga
   * o MOTIVO da admissão: documento, pasta e veredito ficam como estão. A baixa é REGISTRADA em
   * `candidato_alteracoes_log` (quem, quando, e qual motivo foi baixado), então nada some sem
   * trilha. Se o problema não estiver resolvido de verdade, o próximo arquivamento acende de novo,
   * que é o comportamento certo: o sinal reflete o estado, não uma marcação manual permanente.
   */
  @Post("acao/zerar-pendencia")
  async zerarPendencia(@Body() dto: AcaoZerarPendenciaDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "zerar-pendencia", dto.admissaoId);
    const [atual] = (await this.db.execute(sql`
      SELECT drive_falha_motivo FROM admissoes WHERE id = ${dto.admissaoId} LIMIT 1
    `)) as unknown as Array<{ drive_falha_motivo: string | null }>;
    if (!atual) return { ok: false, motivo: "Admissão não encontrada." };
    if (!atual.drive_falha_motivo) return { ok: true, jaEstavaZerada: true };

    await this.db.execute(sql`
      UPDATE admissoes
         SET drive_falha_motivo = NULL, drive_falha_em = NULL, atualizado_em = now()
       WHERE id = ${dto.admissaoId}
    `);
    // Trilha permanente e consultável, no mesmo log de alterações da admissão.
    await this.db.execute(sql`
      INSERT INTO candidato_alteracoes_log (admissao_id, campo, valor_anterior, valor_novo, autor_id)
      VALUES (${dto.admissaoId}, 'drive_falha_motivo', ${atual.drive_falha_motivo}, NULL, ${user.id})
    `);
    this.logger.log(`Pendência de arquivamento zerada na admissão ${dto.admissaoId}.`);
    return { ok: true, zerada: true };
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
