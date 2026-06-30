import { createReadStream } from "node:fs";
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { KitService } from "./kit.service";

/**
 * Gerador de kit (F9, Fase 4). Operacional, SEM @Roles: consultores (COMUM) geram o kit. O download
 * é por token de uso imediato; o kit é expurgado por TTL (1h) pelo StagingPurgeService.
 */
@Controller("kit")
export class KitController {
  constructor(private readonly kit: KitService) {}

  /** Gera o kit a partir do PDF-mãe (multipart 'file'). */
  @Post(":admissaoId/gerar")
  @UseInterceptors(FileInterceptor("file"))
  gerar(@Param("admissaoId") admissaoId: string, @UploadedFile() file: Express.Multer.File) {
    return this.kit.gerar(admissaoId, file);
  }

  /** Histórico dos kits gerados (F9 — UX da tela do Gerador). Metadados, sem CPF (§A.6). */
  @Get("historico")
  historico() {
    return { items: this.kit.listarHistorico() };
  }

  /**
   * Faz stream do kit gerado. `?inline=1` abre no navegador (visualização em nova aba); sem ele,
   * dispara o "salvar como" (download). Mesmo token nos dois casos.
   */
  @Get("download/:token")
  download(
    @Param("token") token: string,
    @Res({ passthrough: true }) res: Response,
    @Query("inline") inline?: string,
  ): StreamableFile {
    const { caminho, nomeArquivo } = this.kit.resolverDownload(token);
    const disposicao = inline ? "inline" : "attachment";
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposicao}; filename="${nomeArquivo}"`,
    });
    return new StreamableFile(createReadStream(caminho));
  }
}
