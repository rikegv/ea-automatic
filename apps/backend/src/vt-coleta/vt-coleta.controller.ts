import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators";
import { VtColetaQueueService } from "./vt-coleta-queue.service";
import { VtLinkService, type LinkVtGerado } from "./vt-link.service";

/**
 * Coleta de formulário de VT (§A.17 etapa 3 / INT-2), disparo MANUAL pela ficha da admissão.
 *
 * Sem `@Public()`: exige sessão (JwtAuthGuard global). Qualquer consultor autenticado pode disparar a
 * busca do VT de um candidato (mesma régua da esteira/ficha); a operação não é reivindicada por um
 * menu, então passa pelo MenuGuard como trabalho aberto.
 *
 * Padrão ASSÍNCRONO (enfileira + 202), igual ao resto da integração: a varredura roda no worker BullMQ
 * (concorrência 1, sob o limiter do Drive), e não segura a requisição do consultor. O resultado do
 * casamento aparece no prontuário/esteira quando o job conclui.
 */
@Controller("vt-coleta")
export class VtColetaController {
  constructor(
    private readonly fila: VtColetaQueueService,
    private readonly link: VtLinkService,
  ) {}

  /** Enfileira a busca do VT desta admissão na pasta coletiva. Responde 202 (aceito, roda no worker). */
  @Post("admissao/:id/buscar")
  @HttpCode(202)
  async buscar(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() _user: AuthUser,
  ): Promise<{ enfileirado: boolean }> {
    const enfileirado = await this.fila.enfileirarScanAdmissao(id);
    return { enfileirado };
  }

  /**
   * Gera o link assinado do formulário de VT para o candidato desta admissão. Mesma régua de acesso do
   * `buscar` (sessão exigida pelo JwtAuthGuard global; sem `@Public`, passa pelo MenuGuard como trabalho
   * aberto). §A.6: o link contém o token e NÃO é logado. 503 se o gerador não está configurado, 422 se
   * o candidato não tem CPF/data de nascimento.
   */
  @Post("admissao/:id/gerar-link")
  @HttpCode(200)
  async gerarLink(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() _user: AuthUser,
  ): Promise<LinkVtGerado> {
    return this.link.gerarParaAdmissao(id);
  }
}
