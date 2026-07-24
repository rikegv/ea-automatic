import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { IsBoolean, IsOptional, IsUUID } from "class-validator";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { DocumentoArquivoService } from "./documento-arquivo.service";
import { ReauditoriaService } from "./reauditoria.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";

/** Corpo do pedido de reauditoria: o tipo do documento a reanalisar. */
export class ReauditarDocumentoDto {
  @IsUUID()
  tipoDocumentoId!: string;

  /**
   * Aceite explícito de sobrescrever uma VALIDAÇÃO HUMANA (OST B1 / Bloco 4). Sem ele, reauditar um
   * documento validado à mão devolve 409 com o nome de quem validou, e a tela pergunta antes.
   */
  @IsOptional()
  @IsBoolean()
  confirmarSobrescritaHumana?: boolean;
}

/** Corpo do pedido de validação humana. */
export class ValidarPorHumanoDto {
  @IsUUID()
  tipoDocumentoId!: string;
}

/** Corpo do pedido de DESCARTE de documento (Bloco 3). */
export class DescartarDocumentoDto {
  @IsUUID()
  tipoDocumentoId!: string;
}

/**
 * Reauditoria e VALIDAÇÃO HUMANA de UM documento (OST A / Bloco 5 e OST B1 / Blocos 3 e 4).
 * Operacional, SEM `@Roles`, igual à auditoria: quem opera a esteira (COMUM) reaudita e valida.
 * Individual de propósito, nunca em lote.
 *
 * Divide o prefixo com o `AuditoriaController` (mesma superfície na tela), em módulo próprio para não
 * criar ciclo entre AuditoriaModule e PandapeModule.
 */
@Controller("esteira/auditoria")
export class ReauditoriaController {
  constructor(
    private readonly reauditoria: ReauditoriaService,
    private readonly validacaoHumana: ValidacaoHumanaService,
    private readonly arquivos: DocumentoArquivoService,
  ) {}

  @Post(":admissaoId/reauditar")
  reauditar(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: ReauditarDocumentoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reauditoria.reauditar(admissaoId, dto.tipoDocumentoId, user, {
      confirmarSobrescritaHumana: dto.confirmarSobrescritaHumana === true,
    });
  }

  /** Validação humana: o consultor assume o documento como válido e o fluxo destrava. */
  @Post(":admissaoId/validar-humano")
  validarPorHumano(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: ValidarPorHumanoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.validacaoHumana.validar(admissaoId, dto.tipoDocumentoId, user);
  }

  /**
   * BLOCO 2 — o que dá para VISUALIZAR deste documento (0, 1 ou N arquivos: frente e verso, páginas
   * da CTPS). Responde 200 com `disponivel: false` quando a staging já não tem o arquivo: é estado
   * normal do fluxo (TTL de 48h ou régua fechada), não erro.
   *
   * §A.6: a resposta NÃO carrega caminho nem nome de arquivo original, só índice e rótulo do tipo.
   */
  @Get(":admissaoId/documento/:tipoDocumentoId/arquivos")
  listarArquivos(
    @Param("admissaoId") admissaoId: string,
    @Param("tipoDocumentoId") tipoDocumentoId: string,
  ) {
    return this.arquivos.listarArquivos(admissaoId, tipoDocumentoId);
  }

  /**
   * BLOCO 2 — serve UM arquivo INLINE, no mesmo padrão do `/kit/download` (que a tela já abre em aba
   * nova pelo `apiOpenInline`).
   *
   * §A.6, o requisito duro: os parâmetros são (admissão, tipo, ÍNDICE). Nenhum caminho vem do
   * cliente; quem resolve índice → caminho é o servidor, e a guarda de path traversal da staging é
   * reafirmada antes de abrir o arquivo.
   */
  @Get(":admissaoId/documento/:tipoDocumentoId/arquivo/:indice")
  async abrirArquivo(
    @Param("admissaoId") admissaoId: string,
    @Param("tipoDocumentoId") tipoDocumentoId: string,
    @Param("indice", ParseIntPipe) indice: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, mime, nomeExibicao } = await this.arquivos.abrirArquivo(
      admissaoId,
      tipoDocumentoId,
      indice,
    );
    res.set({
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${nomeExibicao}"`,
      // Documento de candidato não fica em cache de proxy nem de disco do navegador (§A.6).
      "Cache-Control": "no-store, private",
    });
    return new StreamableFile(stream);
  }

  /**
   * BLOCO 3 — DESCARTA o documento: staging, estado, marcas de dedup, validação humana e trilha.
   * Operacional, sem `@Roles`, igual ao reauditar e ao validar (a tela pede confirmação antes).
   */
  @Post(":admissaoId/descartar")
  descartar(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: DescartarDocumentoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.arquivos.descartar(admissaoId, dto.tipoDocumentoId, user);
  }
}
