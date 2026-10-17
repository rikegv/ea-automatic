import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { FiltroUploadPlanilha } from "../planilha/upload-erro.filter";
import { CriarMensagemDto, CriarSolicitacaoDto } from "./central-solicitacoes.dto";
import { EXT_POR_MIME, SolicitacoesService } from "./solicitacoes.service";

/**
 * TETO E TIPO DO PRINT, na porta de entrada (fecha o VETO da auditoria §A.38/§A.6):
 *  - `limits.fileSize` ABORTA o corpo antes de ele encher a RAM do processo (o `FileInterceptor`
 *    sem `limits` é INFINITO, molde de `OPCOES_UPLOAD_PLANILHA`). Teto de 10 MB, de sobra para um
 *    print, com folga sobre o corte bruto; `FiltroUploadPlanilha` devolve 400 limpo no estouro.
 *  - `fileFilter` recusa o que não for imagem (só os mimetypes de `EXT_POR_MIME`), então um PDF ou
 *    executável nem chega ao arquivamento no Drive. §A.6: só o mimetype é olhado, nunca o conteúdo.
 */
const OPCOES_UPLOAD_PRINT = {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (erro: Error | null, aceita: boolean) => void,
  ): void => {
    // `Object.hasOwn`, NUNCA o operador `in`: `in` anda na cadeia de protótipos, então um
    // Content-Type de `constructor`/`__proto__`/`toString` passaria por um objeto literal e deixaria
    // um binário qualquer chegar ao Drive. `hasOwn` só aceita as chaves REAIS do allowlist de imagem.
    if (Object.hasOwn(EXT_POR_MIME, file.mimetype)) return cb(null, true);
    cb(new BadRequestException("Envie uma imagem (PNG, JPG, WEBP ou GIF)."), false);
  },
};

/**
 * CENTRAL DE SOLICITAÇÕES, lado do usuário (OST Central de Solicitações). Qualquer usuário abre e
 * acompanha as próprias solicitações. Menu-gated por `SolicitacoesController.*` no menu
 * `central-solicitacoes` (§A.23: nasce só para o SUPER_ADMIN, o diretor libera quem usa).
 */
@Controller("solicitacoes")
export class SolicitacoesController {
  constructor(private readonly service: SolicitacoesService) {}

  /** Abre uma solicitação (multipart: tipo, menuCodigo, submenu, descricao + file obrigatório). */
  @Post()
  @UseFilters(FiltroUploadPlanilha)
  @UseInterceptors(FileInterceptor("file", OPCOES_UPLOAD_PRINT))
  criar(
    @Body() dto: CriarSolicitacaoDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.criar(dto, file, user);
  }

  /** As solicitações abertas pelo próprio usuário. */
  @Get("minhas")
  minhas(@CurrentUser() user: AuthUser) {
    return this.service.listarMinhas(user);
  }

  /** Detalhe de uma solicitação (dono ou SUPER_ADMIN). */
  @Get(":id")
  detalhe(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.detalhe(id, user);
  }

  /** Posta uma mensagem na thread (dono ou SUPER_ADMIN). */
  @Post(":id/mensagens")
  postarMensagem(
    @Param("id") id: string,
    @Body() dto: CriarMensagemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.postarMensagem(id, dto.corpo, user);
  }
}
