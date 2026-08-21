import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators";
import { VtColetaQueueService } from "./vt-coleta-queue.service";
import { VtLinkService, type LinkVtGerado } from "./vt-link.service";
import { SolicitacaoVtService } from "./solicitacao-vt.service";
import { OrfaoVtService } from "./orfao-vt.service";
import { CasarOrfaoDto, ResolverOrfaoDto } from "./casar-orfao.dto";
import { SolicitarLoteDto } from "./solicitar-lote.dto";

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
    private readonly solicitacao: SolicitacaoVtService,
    private readonly orfaos: OrfaoVtService,
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
  /**
   * SOLICITA um novo VT: gera o link E REGISTRA o pedido (quem, quando).
   *
   * É o caminho NOVO, e a diferença para o `gerar-link` logo abaixo é exatamente esta: aquele emite
   * a credencial e não deixa rastro (comportamento de sempre, preservado); este grava a solicitação.
   * Os dois convivem por decisão do diretor.
   */
  /** VT ÓRFÃO: dono, hora de chegada e o MOTIVO exato de cada formulário que não casou. */
  @Get("orfaos")
  listarOrfaos() {
    return this.orfaos.listar();
  }

  /** Busca a admissão alvo do casamento manual, por CPF parcial ou por nome. */
  @Get("orfaos/buscar-admissao")
  buscarAdmissao(@Query("q") q: string) {
    return this.orfaos.buscarAdmissoes(q ?? "");
  }

  /**
   * CASA À MÃO um órfão com a admissão escolhida. Passa pelo MESMO caminho do automático, então
   * obedece à regra da onda 2: admissão concluída grava o VT sem dar baixa na régua.
   */
  @Post("orfaos/casar")
  @HttpCode(200)
  casarOrfao(@Body() dto: CasarOrfaoDto) {
    return this.orfaos.casarManual(dto.md5, dto.admissaoId);
  }

  /**
   * DISPENSA o alerta de um órfão. Não trata nada e não toca no arquivo: só tira o sinal da tela,
   * para sempre. É o par do casamento manual, com efeito deliberadamente diferente.
   */
  @Post("orfaos/resolver")
  @HttpCode(200)
  resolverOrfao(@Body() dto: ResolverOrfaoDto, @CurrentUser() user: AuthUser) {
    return this.orfaos.dispensarSinal(dto.md5, user);
  }

  @Post("admissao/:id/solicitar")
  @HttpCode(200)
  async solicitar(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.solicitacao.solicitar(id, user);
  }

  /** Pedidos em LOTE: devolve nome, CPF e link de cada um, para o relatório do time. */
  @Post("solicitar-lote")
  @HttpCode(200)
  async solicitarLote(@Body() dto: SolicitarLoteDto, @CurrentUser() user: AuthUser) {
    return this.solicitacao.solicitarEmLote(dto.admissaoIds, user);
  }

  /** Histórico de pedidos de uma admissão (quem pediu, quando, se já respondeu). */
  @Get("admissao/:id/solicitacoes")
  async solicitacoes(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.solicitacao.historico(id);
  }

  @Post("admissao/:id/gerar-link")
  @HttpCode(200)
  async gerarLink(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() _user: AuthUser,
  ): Promise<LinkVtGerado> {
    return this.link.gerarParaAdmissao(id);
  }
}
