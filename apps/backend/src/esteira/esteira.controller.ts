import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { PatchStatusDto } from "./dto/patch-status.dto";
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
    return this.esteira.listar(frente, { codCliente, status, from, to, q });
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

  /** Anexa o ASO do exame (só metadados — o binário não é persistido; §A.6). */
  @Post("exame/:admissaoId/aso")
  @UseInterceptors(FileInterceptor("file"))
  anexarAso(
    @Param("admissaoId") admissaoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.esteira.anexarAso(admissaoId, file);
  }
}
