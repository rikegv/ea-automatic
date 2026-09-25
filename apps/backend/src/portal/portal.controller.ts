import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { Public } from "../auth/decorators";
import {
  ConfirmarEnvioDto,
  IdentificarNoPortalDto,
  PedirCredencialDto,
  RecuperacaoNoPortalDto,
} from "./portal.dto";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalSessaoGuard, type RequestComPortal } from "./portal-sessao.guard";

/**
 * Portal do Candidato, O CAMINHO DO ARQUIVO. Duas rotas, e o arquivo não passa por nenhuma delas.
 *
 * Rotas `@Public()` porque quem opera é o CANDIDATO, que não é usuário do sistema e não tem senha.
 * A proteção real é o `PortalSessaoGuard` local, mesmo padrão do VT e do webhook do Pandapé (§A.5):
 * `@Public()` só tira o JwtAuthGuard global do caminho, quem autoriza é o guard da rota.
 *
 * ESTAS DUAS ROTAS PRECISAM ENTRAR NA ALLOWLIST DA BARREIRA (item F7 do documento de regras), e a de
 * emitir credencial é a mais sensível de todas, porque é ela que autoriza escrita no nosso
 * armazenamento. Rota nova não avisada ao Fernando quebra em produção, em silêncio.
 *
 * SEM `@Throttle` DE ROTA, pelo mesmo motivo medido em `vt.controller.ts`: o balde global conta por
 * `req.ip`, o backend escuta em loopback atrás do proxy e TODO mundo chega como `127.0.0.1`, então
 * um `@Throttle` aqui não seria "por IP", seria um balde ÚNICO que derruba o portal inteiro. O
 * limite de ritmo de verdade é POR LINK e vive na emissão (`LIMITES_PORTAL.EMISSOES_POR_JANELA`);
 * o limite por IP é da barreira, que é quem enxerga o IP real. É o furo V1, que continua aberto e
 * é veto de saída: o balde global do portal precisa ser separado do da operação interna antes de
 * isto ir ao ar.
 */
@Controller("portal")
export class PortalController {
  constructor(
    private readonly credenciais: PortalCredencialService,
    private readonly identidade: PortalIdentidadeService,
  ) {}

  /**
   * A PORTA DE ENTRADA DO CANDIDATO: link + CPF + data de nascimento por uma sessão de 30 minutos.
   *
   * É A ÚNICA ROTA DO PORTAL SEM `Authorization: Bearer`, por definição: a sessão é justamente o
   * que ela emite. Isso tem uma consequência de produção que nenhum teste pega, e ela está escrita
   * no cabeçalho desta classe: o `OriginGuard` libera método mutante sem conferir origem APENAS
   * quando há Bearer. Sem ele, o caminho é a allowlist `ALLOWED_ORIGINS`, e a origem do portal
   * (o vhost da barreira) precisa estar lá. É o mesmo caminho por onde `POST /vt/identificar`
   * passa hoje, e é pendência de INFRA, não de código.
   *
   * SEM `@Throttle` de rota, pelo mesmo motivo medido no `vt.controller.ts` e repetido no
   * cabeçalho desta classe: o balde global conta por `req.ip`, e todo mundo chega como
   * `127.0.0.1`. O limite de verdade é POR LINK e POR CPF, e vive no serviço.
   */
  @Post("identificar")
  @Public()
  identificar(@Req() req: RequestComPortal, @Body() dto: IdentificarNoPortalDto) {
    return this.identidade.identificar({
      linkToken: dto.linkToken,
      cpf: dto.cpf,
      dataNascimento: dto.dataNascimento,
      ip: this.ipDaBarreira(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  /**
   * "Não Consigo Entrar". A válvula de recuperação da decisão 5.
   *
   * Sem ela o teto vira porta trancada para sempre: o candidato cuja data de nascimento está errada
   * NA NOSSA BASE nunca casa, gasta as cinco tentativas, espera, gasta mais cinco, e não tem
   * caminho nenhum que não seja adivinhar a data que o RH digitou errado.
   */
  @Post("recuperacao")
  @Public()
  recuperacao(@Req() req: RequestComPortal, @Body() dto: RecuperacaoNoPortalDto) {
    return this.identidade.recuperacao({
      linkToken: dto.linkToken,
      ip: this.ipDaBarreira(req),
    });
  }

  /**
   * Emite a credencial de escrita de UM arquivo. Sobe o objeto quem tem a URL: o navegador do
   * candidato, direto para o armazenamento do Google, uma vez só.
   */
  @Post("credencial")
  @Public()
  @UseGuards(PortalSessaoGuard)
  pedirCredencial(@Req() req: RequestComPortal, @Body() dto: PedirCredencialDto) {
    return this.credenciais.emitir({
      // A admissão e o link vêm do TOKEN, nunca do corpo: o candidato não escolhe por quem envia
      // nem em qual cota gastar.
      admissaoId: req.portal!.admissaoId,
      jtiLink: req.portal!.jtiLink,
      codigoTipoDocumento: dto.codigoTipoDocumento,
      contentType: dto.contentType,
      bytes: dto.bytes,
      ip: this.ipDaBarreira(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  /** Confirma a chegada pelo lado do servidor e dispara a leitura. A palavra do cliente não vale. */
  @Post("confirmar")
  @Public()
  @UseGuards(PortalSessaoGuard)
  confirmar(@Req() req: RequestComPortal, @Body() dto: ConfirmarEnvioDto) {
    return this.credenciais.confirmar({
      admissaoId: req.portal!.admissaoId,
      jtiLink: req.portal!.jtiLink,
      credencialId: dto.credencialId,
      avisoDoNavegador: dto.avisoDoNavegador ?? false,
      ip: this.ipDaBarreira(req),
    });
  }

  /**
   * IP do candidato, e ele só existe se a BARREIRA o escrever (item F1).
   *
   * Medido em `vt.service.ts`: sem `trust proxy`, o socket é sempre `127.0.0.1` e o
   * `x-forwarded-for` que chega é o que o CLIENTE mandar, forjado intacto. Por isso este valor NÃO
   * decide nada, nunca: ele não limita, não bloqueia e não autoriza. Ele só alimenta a trilha, e
   * mesmo ali entra hasheado com sal mensal, com o endereço completo indo para a tabela restrita.
   *
   * O dia em que a barreira mandar o cabeçalho próprio com o segredo combinado (F1), é aqui que ele
   * passa a ser lido, e só então o valor vira confiável para decisão.
   */
  private ipDaBarreira(req: RequestComPortal): string | null {
    const cabecalho = req.headers["x-forwarded-for"];
    const bruto = (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.split(",")[0]?.trim();
    if (!bruto) return null;
    return bruto.replace(/^::ffff:/, "").slice(0, 45);
  }
}
