import { createReadStream } from "node:fs";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Roles } from "../auth/decorators";
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

  /**
   * Motor de extração (OST etapa 3): N PDFs da folha + kit selecionado → M kits por funcionário.
   * Só administração (Master / Super Admin). Multipart: campo 'files' (vários PDFs) + 'kitTipoId'.
   */
  @Post("processar")
  @Roles("MASTER", "SUPER_ADMIN")
  @UseInterceptors(FilesInterceptor("files", 40))
  processar(@Body("kitTipoId") kitTipoId: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.kit.processarMotor(kitTipoId, files);
  }

  /** Progresso do job de extração (polling da tela). Só administração. */
  @Get("processar/status/:jobId")
  @Roles("MASTER", "SUPER_ADMIN")
  statusProcessar(@Param("jobId") jobId: string) {
    return this.kit.statusMotor(jobId);
  }

  /**
   * Etapa 4: download individual do kit consolidado de um funcionário (PDF). Só administração.
   * Faz stream do binário vindo do ai-service, repassando o nome de arquivo (kit_<funcionario>.pdf).
   */
  @Get("processar/:jobId/funcionario/:indice")
  @Roles("MASTER", "SUPER_ADMIN")
  async downloadFuncionario(
    @Param("jobId") jobId: string,
    @Param("indice") indice: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType, contentDisposition } = await this.kit.downloadFuncionario(
      jobId,
      Number(indice),
    );
    res.set({ "Content-Type": contentType, "Content-Disposition": contentDisposition });
    return new StreamableFile(buffer);
  }

  /**
   * Reimporta PDFs para UM funcionário do resultado, anexando os documentos que faltavam. Só
   * administração. Multipart: campo 'files' (os PDFs que faltam). Devolve o resultado atualizado.
   */
  @Post("processar/:jobId/funcionario/:indice/reimportar")
  @Roles("MASTER", "SUPER_ADMIN")
  @UseInterceptors(FilesInterceptor("files", 40))
  reimportar(
    @Param("jobId") jobId: string,
    @Param("indice") indice: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.kit.reimportarFuncionario(jobId, Number(indice), files);
  }

  /** Etapa 4: download em lote (ZIP com um PDF por funcionário). Só administração. */
  @Get("processar/:jobId/zip")
  @Roles("MASTER", "SUPER_ADMIN")
  async downloadZip(
    @Param("jobId") jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType, contentDisposition } = await this.kit.downloadZip(jobId);
    res.set({ "Content-Type": contentType, "Content-Disposition": contentDisposition });
    return new StreamableFile(buffer);
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
