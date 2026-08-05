import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { AgendamentoExameDto } from "./dto/agendamento-exame.dto";
// Value import (não `import type`): o ValidationPipe precisa da CLASSE em runtime.
import { AgendamentoIntegracaoDto } from "./dto/agendamento-integracao.dto";
import { DeclinarDto } from "./dto/declinar.dto";
import { PausarDto } from "./dto/pausar.dto";
import { PatchStatusDto } from "./dto/patch-status.dto";
import { RelatorioClinicaDto } from "./dto/relatorio-clinica.dto";
import { EsteiraService } from "./esteira.service";

/**
 * Esteira/Faróis (F8). Operacional e autenticado, SEM @Roles: a esteira é visão coletiva (§A.3)
 * — consultores (COMUM) operam status em paralelo. As rotas de administração ficam noutro módulo.
 */
@Controller("esteira")
export class EsteiraController {
  constructor(private readonly esteira: EsteiraService) {}

  /** Detalhe SOMENTE LEITURA de uma admissão (item 4 — modal de visualização rápida). */
  @Get("admissao/:admissaoId")
  detalhe(@Param("admissaoId") admissaoId: string) {
    return this.esteira.detalhe(admissaoId);
  }

  /**
   * Declínio da admissão INTEIRA, acionável de qualquer frente (OST ajustes, item 3). Aplica o
   * efeito completo do declínio (farol DECLINOU + motivo + Auditoria "Declinou" + Exame "Cancelado"),
   * encerrando a admissão em todas as frentes (§A.16). Operacional (COMUM), como o resto da esteira.
   */
  @Patch("admissao/:admissaoId/declinar")
  declinar(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: DeclinarDto,
    @CurrentUser() user: AuthUser,
  ) {
    // `user.id` alimenta o autor da trilha do declínio (candidato_alteracoes_log).
    return this.esteira.declinarAdmissao(admissaoId, dto.motivoDeclinioId, user.id);
  }

  /**
   * PAUSA a admissão (OST admissão pausada). Operacional como o declínio: QUALQUER consultor pausa,
   * não é ação restrita. Sai da fila e dos automáticos; a auditoria continua.
   */
  @Patch("admissao/:admissaoId/pausar")
  pausar(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: PausarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.esteira.pausarAdmissao(admissaoId, dto.motivo, user.id);
  }

  /** RETOMA a admissão pausada. Volta exatamente de onde parou (a pausa não alterou nada). */
  @Patch("admissao/:admissaoId/retomar")
  retomar(@Param("admissaoId") admissaoId: string, @CurrentUser() user: AuthUser) {
    return this.esteira.retomarAdmissao(admissaoId, user.id);
  }

  /** Fila de uma frente com KPIs e catálogo de status (F7/F8). */
  @Get(":frente")
  listar(
    @Param("frente") frente: string,
    @Query("codCliente") codCliente?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("q") q?: string,
    @Query("pausadas") pausadas?: string,
  ) {
    return this.esteira.listar(frente, {
      codCliente: parseMulti(codCliente),
      status: parseMulti(status),
      from,
      to,
      q,
      // Card "Pausadas" clicável (§A.12): "1"/"true" liga o filtro que mostra SÓ as pausadas.
      pausadas: pausadas === "1" || pausadas === "true",
    });
  }

  /** Muda o status de uma frente; mantém o gate do Cadastro e a trilha de eventos. */
  @Patch("frentes/:frenteId/status")
  mudarStatus(
    @Param("frenteId") frenteId: string,
    @Body() dto: PatchStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.esteira.mudarStatus(frenteId, dto, user);
  }

  /**
   * Relatório da clínica (preview JSON). Recebe um lote de admissões e devolve uma linha por
   * candidato com empregador/CNPJ resolvidos (situação do vínculo). Operacional (COMUM).
   */
  @Post("relatorio-clinica/preview")
  relatorioClinicaPreview(@Body() dto: RelatorioClinicaDto) {
    return this.esteira.relatorioClinicaPreview(dto);
  }

  /**
   * Relatório da clínica (download CSV). Mesmas colunas do preview; separador ';' + BOM UTF-8 para
   * o Excel BR. §A.6: CPF/CNPJ vão só no arquivo, nunca em log.
   */
  @Post("relatorio-clinica")
  async relatorioClinicaCsv(
    @Body() dto: RelatorioClinicaDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { conteudo, nomeArquivo } = await this.esteira.relatorioClinicaCsv(dto);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    return new StreamableFile(Buffer.from(conteudo, "utf-8"));
  }

  /** Anexa o ASO do exame (só metadados — o binário não é persistido; §A.6). */
  @Post("exame/:admissaoId/aso")
  @UseInterceptors(FileInterceptor("file"))
  anexarAso(
    @Param("admissaoId") admissaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    // `user` é o autor do evento quando o ASO validado conclui a frente em APTO (transição pós-ASO).
    return this.esteira.anexarAso(admissaoId, file, user);
  }

  /** Ficha de apresentação da integração (modal do olho): contrato e benefícios, só leitura. */
  @Get("integracao/:admissaoId/apresentacao")
  apresentacaoIntegracao(@Param("admissaoId") admissaoId: string) {
    return this.esteira.apresentacaoIntegracao(admissaoId);
  }

  /** Agendamento da integração (modal da aba INTEGRAÇÃO) — devolve o registro atual ou null. */
  @Get("integracao/:admissaoId/agendamento")
  obterAgendamentoIntegracao(@Param("admissaoId") admissaoId: string) {
    return this.esteira.obterAgendamentoIntegracao(admissaoId);
  }

  /** Cadastra ou reagenda a integração. Não move a frente: o status é do consultor. */
  @Put("integracao/:admissaoId/agendamento")
  salvarAgendamentoIntegracao(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: AgendamentoIntegracaoDto,
  ) {
    return this.esteira.salvarAgendamentoIntegracao(admissaoId, dto);
  }

  /** Agendamento do exame (modal) — devolve o registro atual ou null. */
  @Get("exame/:admissaoId/agendamento")
  obterAgendamento(@Param("admissaoId") admissaoId: string) {
    return this.esteira.obterAgendamento(admissaoId);
  }

  /** Cadastra ou reagenda o agendamento do exame (modal da aba EXAME). */
  @Put("exame/:admissaoId/agendamento")
  salvarAgendamento(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: AgendamentoExameDto,
    @CurrentUser() user: AuthUser,
  ) {
    // `user` alimenta o autor do evento de status: salvar o agendamento agora move a frente para
    // AGENDADO automaticamente (OST Onda 2), e toda transição de frente tem autor na trilha.
    return this.esteira.salvarAgendamento(admissaoId, dto, user);
  }
}
