import { Body, Controller, Get, Logger, Param, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { ReauditoriaService } from "../reauditoria/reauditoria.service";
import { PandapeApiService } from "../pandape/pandape-api.service";
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
import { FilasDiagnosticoService, type NomeFila } from "./filas.service";
import {
  AcaoLigarPastaDto,
  AcaoZerarDuplicataDto,
  AcaoZerarPendenciaDto,
  AcaoReauditarDto,
  AcaoRearquivarDto,
  AcaoRepullDto,
  SchedulerToggleDto,
  AcaoJobDto,
  TestarDependenciaDto,
} from "./diagnostico.dto";
import { AiClientService } from "../ai/ai-client.service";
import { idDaPastaUrl, urlDaPasta } from "../ai/drive-routing";
import { csvIds, listaIds } from "../ai/drive-duplicatas";

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
    private readonly filas: FilasDiagnosticoService,
    private readonly pandapeApi: PandapeApiService,
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

  /**
   * ZERA o sinal de PASTA DUPLICADA de uma admissão (decisão do diretor).
   *
   * O QUE ELE DECIDIU. As pastas extras continuam no Drive e ele passa a removê-las à mão, no tempo
   * dele; o que sai é o AVISO. Esta ação faz exatamente isso e nada além: **não apaga, não move e não
   * renomeia nada no Drive** (§A.6, contrato do módulo), não toca em documento, pasta-âncora nem
   * veredito. A admissão sai do card na hora.
   *
   * POR QUE OS IDS NÃO SÃO SIMPLESMENTE APAGADOS. O sinal é DERIVADO: rearquivamento e reconciliação
   * reconferem o Drive, achariam as mesmas pastas e regravariam o aviso, desfazendo a decisão na
   * varredura seguinte. Por isso os ids migram para `drive_duplicatas_baixadas`, que é a memória de
   * "não acenda estas de novo enquanto existirem". Duplicata NOVA (id que ele nunca viu) acende
   * normalmente, e id de pasta apagada some da memória na reconciliação.
   *
   * TRILHA: quem baixou e quando ficam em `candidato_alteracoes_log`, permanente e consultável, no
   * mesmo padrão do "zerar pendência".
   */
  @Post("acao/zerar-duplicata")
  async zerarDuplicata(@Body() dto: AcaoZerarDuplicataDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "zerar-duplicata", dto.admissaoId);
    const [atual] = (await this.db.execute(sql`
      SELECT drive_duplicatas, drive_duplicatas_baixadas
        FROM admissoes WHERE id = ${dto.admissaoId} LIMIT 1
    `)) as unknown as Array<{
      drive_duplicatas: string | null;
      drive_duplicatas_baixadas: string | null;
    }>;
    if (!atual) return { ok: false, motivo: "Admissão não encontrada." };
    const acesas = listaIds(atual.drive_duplicatas);
    if (acesas.length === 0) return { ok: true, jaEstavaZerada: true };

    // A memória acumula: uma duplicata baixada antes continua baixada, sem repetir id.
    const baixadas = csvIds([...new Set([...listaIds(atual.drive_duplicatas_baixadas), ...acesas])]);
    await this.db.execute(sql`
      UPDATE admissoes
         SET drive_duplicatas = NULL,
             drive_duplicatas_baixadas = ${baixadas},
             atualizado_em = now()
       WHERE id = ${dto.admissaoId}
    `);
    await this.db.execute(sql`
      INSERT INTO candidato_alteracoes_log (admissao_id, campo, valor_anterior, valor_novo, autor_id)
      VALUES (${dto.admissaoId}, 'drive_duplicatas', ${atual.drive_duplicatas}, NULL, ${user.id})
    `);
    this.logger.log(
      `Sinal de pasta duplicada zerado na admissão ${dto.admissaoId} ` +
        `(${acesas.length} pasta[s] permanecem no Drive, remoção manual pelo diretor).`,
    );
    return { ok: true, zeradas: acesas.length };
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
  // ── ONDA 1 do diagnóstico detalhado: as dependências deixam de ser só um rótulo ──────────────

  /**
   * DETALHE DA FILA: as três (`pandape-sync`, `clicksign-sync`, `vt-coleta-scan`) com a contagem
   * somada e a LISTA dos jobs falhados, cada um com o motivo real. É o que responde, sem acionar a
   * fábrica, a pergunta que o card sozinho não respondia: "degradado por causa de quê?".
   */
  @Get("filas")
  filasDetalhe() {
    return this.filas.estado();
  }

  /**
   * QUEM É O ALVO de um job falhado, resolvido na hora. Para o Pandapé, vai à API buscar nome e
   * vaga do pré-colaborador que não entrou; para os demais, devolve o candidato da admissão.
   *
   * §A.6: devolve NOME (aceitável) e vaga, nunca o CPF. O incidente mostrou por que isto precisa
   * existir: o job era o único rastro de um candidato real, e limpar sem olhar apagaria a pessoa.
   */
  @Get("filas/:fila/:jobId/alvo")
  async alvoDoJob(@Param("fila") fila: NomeFila, @Param("jobId") jobId: string) {
    const dados = await this.filas.dadosDoJob(fila, jobId);
    if (fila === "pandape-sync" && dados.idPrecollaborator) {
      const pc = await this.pandapeApi
        .getPrecollaborator(String(dados.idPrecollaborator))
        .catch(() => undefined);
      if (!pc) {
        return {
          tipo: "pandape",
          id: String(dados.idPrecollaborator),
          indisponivel: "Não foi possível consultar o Pandapé agora. Tente de novo em instantes.",
        };
      }
      return {
        tipo: "pandape",
        id: String(dados.idPrecollaborator),
        nome: [pc.name, pc.surname].filter(Boolean).join(" ").trim() || "não informado",
        vaga: pc.vacancyJob ?? "não informada",
        etapa: pc.currentFolderName ?? "não informada",
        admissaoPrevista: pc.admissionDate ?? null,
      };
    }
    if (dados.admissaoId) {
      const [row] = await this.db.execute<{ nome: string; cod_cliente: string | null }>(sql`
        select c.nome, a.cod_cliente
          from admissoes a join candidatos c on c.cpf = a.candidato_cpf
         where a.id = ${String(dados.admissaoId)}::uuid
      `);
      return {
        tipo: "admissao",
        id: String(dados.admissaoId),
        nome: row?.nome ?? "não informado",
        cliente: row?.cod_cliente ?? "não informado",
      };
    }
    return { tipo: "ciclo", id: jobId, nome: "Ciclo automático, sem candidato associado" };
  }

  /**
   * LIMPAR o job falhado. DESTRUTIVA: o job costuma ser o único rastro do que ele carregava (§A.26),
   * então a tela confirma antes e oferece "ver dados do alvo" ao lado. Aqui só se registra e remove.
   */
  @Post("acao/limpar-job")
  async limparJob(@Body() dto: AcaoJobDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "limpar-job", `${dto.fila}/${dto.jobId}`);
    return this.filas.limparJob(dto.fila, dto.jobId);
  }

  /** REPROCESSAR o job falhado: volta para a fila com o mesmo payload. Não destrutiva. */
  @Post("acao/reprocessar-job")
  async reprocessarJob(@Body() dto: AcaoJobDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "reprocessar-job", `${dto.fila}/${dto.jobId}`);
    return this.filas.reprocessarJob(dto.fila, dto.jobId);
  }

  /**
   * TESTAR AGORA uma dependência, pelo caminho REAL e ignorando o cache de 5 minutos do snapshot.
   * Existe porque "verificado há 4 minutos" não serve a quem acabou de mexer na credencial.
   */
  @Post("acao/testar-dependencia")
  async testarDependencia(@Body() dto: TestarDependenciaDto, @CurrentUser() user: AuthUser) {
    this.registrarTrilha(user, "testar-dependencia", dto.nome);
    return this.diagnostico.testarDependencia(dto.nome);
  }

  private registrarTrilha(user: AuthUser, acao: string, admissaoId: string, tipoId?: string) {
    // Reusa o logger (persistido no journal, consultável). Uma tabela própria seria o passo pleno.
    // Aqui já fica quem disparou (user.id), o quê e quando (o timestamp do log).
    this.logger.log(
      `[DIAGNOSTICO][trilha] acao=${acao} admissao=${admissaoId}${tipoId ? ` tipo=${tipoId}` : ""} por=${user.id} (${user.papel})`,
    );
  }
}
