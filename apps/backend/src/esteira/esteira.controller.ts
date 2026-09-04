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
import { SalvarIfractalDto } from "./dto/ifractal.dto";
import { AgendamentoIntegracaoLoteDto } from "./dto/agendamento-integracao-lote.dto";
import { DesconsiderarIntegracaoDto } from "./dto/desconsiderar-integracao.dto";
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
    @Query("projetoId") projetoId?: string,
    @Query("lojaId") lojaId?: string,
    @Query("status") status?: string,
    @Query("admissaoDe") admissaoDe?: string,
    @Query("admissaoAte") admissaoAte?: string,
    @Query("exameDe") exameDe?: string,
    @Query("exameAte") exameAte?: string,
    @Query("integracaoDe") integracaoDe?: string,
    @Query("integracaoAte") integracaoAte?: string,
    @Query("q") q?: string,
    @Query("pausadas") pausadas?: string,
  ) {
    return this.esteira.listar(frente, {
      codCliente: parseMulti(codCliente),
      // PROJETO (etapa 5): múltiplo desde o nascimento (§A.28), pelo mesmo `parseMulti` dos demais.
      // O valor `MATRIZ` viaja como qualquer outro e é interpretado no serviço.
      projetoId: parseMulti(projetoId),
      // LOJA: múltiplo como os demais (§A.28). Os valores `MATRIZ` e `ALOCAR_LOJA` viajam como
      // qualquer outro e são interpretados no serviço, onde viram ausência de loja com e sem
      // catálogo de lojas no cliente.
      lojaId: parseMulti(lojaId),
      status: parseMulti(status),
      admissaoDe,
      admissaoAte,
      exameDe,
      exameAte,
      integracaoDe,
      integracaoAte,
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

  /**
   * Agendamento EM MASSA da integração. Transacional: ou o lote inteiro entra, ou nada entra.
   * Sem `sobrescrever`, devolve 409 com os NOMES de quem já tem agendamento, para o consultor
   * confirmar antes de apagar o que estava marcado.
   */
  @Post("integracao/agendamento-lote")
  agendarIntegracaoEmLote(
    @Body() dto: AgendamentoIntegracaoLoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    // `user` alimenta o autor do evento de status: o lote move as frentes para AGENDADO, e toda
    // transição de frente tem autor na trilha.
    return this.esteira.agendarIntegracaoEmLote(dto, user);
  }

  /**
   * DESCONSIDERAR a integração: a admissão concluiu o onboarding sem passar por ela. Serve ao botão
   * da linha (um id) e à ação em massa (N ids), pelo mesmo caminho.
   */
  @Post("integracao/desconsiderar")
  desconsiderarIntegracao(
    @Body() dto: DesconsiderarIntegracaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.esteira.desconsiderarIntegracao(dto.admissaoIds, user);
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

  /** Cadastra ou reagenda a integração. Salvar completo já leva a frente para AGENDADO. */
  @Put("integracao/:admissaoId/agendamento")
  salvarAgendamentoIntegracao(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: AgendamentoIntegracaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    // `user` alimenta o autor do evento de status: salvar move a frente, e toda transição tem autor.
    return this.esteira.salvarAgendamentoIntegracao(admissaoId, dto, user);
  }

  /**
   * Grava login e senha do iFractal da admissão (aba IFRACTAL).
   *
   * SEM `@Roles`, como a edição de uniforme: preencher a credencial de ponto é trabalho do time do
   * ADM inteiro, não privilégio de administração. A rota continua atrás do `JwtAuthGuard` global e
   * do guard de menu, como toda rota da Esteira.
   */
  @Put("ifractal/:admissaoId")
  salvarIfractal(@Param("admissaoId") admissaoId: string, @Body() dto: SalvarIfractalDto) {
    return this.esteira.salvarIfractal(admissaoId, dto);
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
