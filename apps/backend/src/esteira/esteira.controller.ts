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
import { DeclinarDto } from "./dto/declinar.dto";
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

  /** Fila de uma frente com KPIs e catálogo de status (F7/F8). */
  @Get(":frente")
  listar(
    @Param("frente") frente: string,
    @Query("codCliente") codCliente?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("q") q?: string,
  ) {
    return this.esteira.listar(frente, {
      codCliente: parseMulti(codCliente),
      status: parseMulti(status),
      from,
      to,
      q,
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
  anexarAso(@Param("admissaoId") admissaoId: string, @UploadedFile() file: Express.Multer.File) {
    return this.esteira.anexarAso(admissaoId, file);
  }

  /** Agendamento do exame (modal) — devolve o registro atual ou null. */
  @Get("exame/:admissaoId/agendamento")
  obterAgendamento(@Param("admissaoId") admissaoId: string) {
    return this.esteira.obterAgendamento(admissaoId);
  }

  /** Cadastra ou reagenda o agendamento do exame (modal da aba EXAME). */
  @Put("exame/:admissaoId/agendamento")
  salvarAgendamento(@Param("admissaoId") admissaoId: string, @Body() dto: AgendamentoExameDto) {
    return this.esteira.salvarAgendamento(admissaoId, dto);
  }
}
