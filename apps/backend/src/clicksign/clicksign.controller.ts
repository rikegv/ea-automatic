import { createReadStream } from "node:fs";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, Public } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { InternalTokenGuard } from "../pandape/internal-token.guard";
import { ClicksignGestaoService } from "./clicksign-gestao.service";
import { ClicksignSchedulerService } from "./clicksign-scheduler.service";
import { ClicksignSyncService } from "./clicksign-sync.service";

/** Body do reenvio por correção. Em multipart, `aceiteDuplaCorrecao` chega como string. */
interface ReenviarCorrecaoBody {
  aceiteDuplaCorrecao?: boolean | string;
}

/** Abas válidas da tela de gerenciamento de assinatura. */
const ABAS = ["abertos", "assinados", "aptos"] as const;
type Aba = (typeof ABAS)[number];

/**
 * Rotas da assinatura Clicksign (INT-4 / F9).
 *
 *  • POST /internal/clicksign/tick — disparo EXTERNO do polling. Fora do JWT (`@Public()`), protegido
 *    pelo segredo compartilhado via `InternalTokenGuard` (reuso da Fase 5). Só ENFILEIRA o `poll-tick`
 *    e responde 202. DEIXOU DE SER O ÚNICO CAMINHO: o `ClicksignSchedulerService` agora agenda o tick
 *    dentro do Nest, então esta rota fica como disparo manual/externo, não como dependência de cron.
 *    Ela respeita o liga/desliga do scheduler, igual ao disparo da tela de diagnóstico.
 *
 *  • GET /clicksign/envelopes — lista da tela de gerenciamento (menu "assinaturas").
 *  • POST /clicksign/disparar-lote — disparo em massa das admissões selecionadas na fila.
 *  • POST /clicksign/:admissaoId/cancelar — cancela o envelope (best-effort no provedor, autoritativo
 *    no EA).
 *  • POST /clicksign/:admissaoId/reenviar-correcao — cancela, regenera o kit e dispara envelope novo.
 *
 * As quatro operações de tela são reivindicadas pelo menu "assinaturas" (`domain/menus`), então o
 * `MenuGuard` barra quem não tem o menu. O tick é `@Public()` e não é assunto de menu.
 */
@Controller()
export class ClicksignController {
  constructor(
    private readonly sync: ClicksignSyncService,
    private readonly gestao: ClicksignGestaoService,
    private readonly scheduler: ClicksignSchedulerService,
  ) {}

  @Post("internal/clicksign/tick")
  @Public()
  @UseGuards(InternalTokenGuard)
  @HttpCode(202)
  async tick(): Promise<{ enfileirado: boolean; ligado: boolean }> {
    // Passa pelo scheduler (e não direto na fila) para respeitar o liga/desliga: com o freio puxado,
    // nem o disparo externo enfileira.
    return this.scheduler.dispararCiclo();
  }

  /** Lista da tela de gerenciamento. `aba` inválida cai em `abertos` (a aba de trabalho). */
  @Get("clicksign/envelopes")
  listar(@Query("aba") aba?: string) {
    const escolhida: Aba = (ABAS as readonly string[]).includes(aba ?? "")
      ? (aba as Aba)
      : "abertos";
    return this.gestao.listar(escolhida);
  }

  /**
   * DISPARO EM LOTE: o consultor seleciona várias admissões da fila "Prontos para solicitar" e
   * dispara de uma vez. É o único caminho que cria envelope e manda e-mail.
   *
   * Não recebe arquivo: o kit já veio anexado pelo botão "Enviar para assinatura" do Gerador de Kit.
   * O modal de upload que existia aqui foi eliminado, porque pedia ao consultor um arquivo que o
   * sistema já tinha.
   */
  @Post("clicksign/disparar-lote")
  dispararLote(@Body() body: { admissaoIds?: string[] }, @CurrentUser() user: AuthUser) {
    return this.gestao.dispararLote(body?.admissaoIds ?? [], user);
  }

  /** DISPARO INDIVIDUAL: dispara UMA assinatura sem passar pela seleção em lote. */
  @Post("clicksign/:admissaoId/disparar")
  disparar(@Param("admissaoId") admissaoId: string, @CurrentUser() user: AuthUser) {
    return this.gestao.dispararUm(admissaoId, user);
  }

  /**
   * TROCA O KIT: cancela o que existe (nas duas frentes) e desanexa o kit atual. O kit novo entra
   * pelo Gerador de Kit, botão "Enviar para assinatura".
   */
  @Post("clicksign/:admissaoId/trocar-kit")
  trocarKit(@Param("admissaoId") admissaoId: string, @CurrentUser() user: AuthUser) {
    return this.gestao.trocarKit(admissaoId, user);
  }

  /**
   * Abre o KIT ANEXADO (olho da tela). Faz stream do PDF que está na staging; some quando o envelope
   * é ASSINADO, porque a partir daí o documento vive no prontuário do Drive.
   */
  @Get("clicksign/:admissaoId/kit")
  async verKit(
    @Param("admissaoId") admissaoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const alvo = await this.gestao.caminhoDoKit(admissaoId);
    if (!alvo) {
      throw new NotFoundException(
        "Kit não está mais anexado. Depois de assinado, o documento fica no prontuário do Drive.",
      );
    }
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="kit.pdf"`,
    });
    return new StreamableFile(createReadStream(alvo.caminho));
  }

  /** CANCELA o envelope atual da admissão. Não regenera kit nem dispara envelope novo. */
  @Post("clicksign/:admissaoId/cancelar")
  cancelar(@Param("admissaoId") admissaoId: string, @CurrentUser() user: AuthUser) {
    return this.gestao.cancelar(admissaoId, user);
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
