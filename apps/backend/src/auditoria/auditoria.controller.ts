import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { AuditarDocumentoDto } from "./dto/auditar-documento.dto";
import { AuditoriaService } from "./auditoria.service";

/**
 * Auditoria documental incremental (F2 / Fase 4). Operacional, SEM @Roles: consultores (COMUM)
 * auditam documentos na esteira. O binário é efêmero (staging + Drive); só o status persiste (§A.6).
 */
@Controller("esteira/auditoria")
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  /** Audita um documento (multipart: file + tipoDocumentoId). */
  @Post(":admissaoId/documento")
  @UseInterceptors(FileInterceptor("file"))
  auditar(
    @Param("admissaoId") admissaoId: string,
    @Body() dto: AuditarDocumentoDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.auditoria.auditarDocumento(admissaoId, dto.tipoDocumentoId, file, user);
  }

  /** Progresso da régua obrigatória da admissão (barra "X de Y"). */
  @Get(":admissaoId/progresso")
  progresso(@Param("admissaoId") admissaoId: string) {
    return this.auditoria.progresso(admissaoId);
  }
}
