import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, Public } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { InternalTokenGuard } from "../pandape/internal-token.guard";
import { ClicksignSyncService } from "./clicksign-sync.service";

/** Body do reenvio por correção. Em multipart, `aceiteDuplaCorrecao` chega como string. */
interface ReenviarCorrecaoBody {
  aceiteDuplaCorrecao?: boolean | string;
}

/**
 * Rotas da assinatura Clicksign (INT-4 / F9).
 *
 *  • POST /internal/clicksign/tick — entrypoint do cron de polling. Fora do JWT (`@Public()`),
 *    protegido pelo segredo compartilhado via `InternalTokenGuard` (reuso da Fase 5). Só ENFILEIRA o
 *    `poll-tick` e responde 202; o trabalho roda no worker (fila + backoff, §A.5).
 *
 *  • POST /clicksign/:admissaoId/reenviar-correcao — rota OPERACIONAL. SEM @Roles, em paridade com o
 *    KitController (consultores COMUM geram/reenviam kit). Recebe o PDF-mãe corrigido (multipart
 *    'file'). Para admissões do Pandapé, exige aceite da dupla correção (409 needsConfirmation).
 */
@Controller()
export class ClicksignController {
  constructor(private readonly sync: ClicksignSyncService) {}

  @Post("internal/clicksign/tick")
  @Public()
  @UseGuards(InternalTokenGuard)
  @HttpCode(202)
  async tick(): Promise<{ enfileirado: true }> {
    await this.sync.enfileirarTick();
    return { enfileirado: true };
  }

  @Post("clicksign/:admissaoId/reenviar-correcao")
  @UseInterceptors(FileInterceptor("file"))
  reenviarCorrecao(
    @Param("admissaoId") admissaoId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ReenviarCorrecaoBody,
    @CurrentUser() user: AuthUser,
  ) {
    const aceite = body?.aceiteDuplaCorrecao === true || body?.aceiteDuplaCorrecao === "true";
    return this.sync.reenviarCorrecao(admissaoId, file, aceite, user);
  }
}
