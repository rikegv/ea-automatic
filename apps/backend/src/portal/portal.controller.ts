import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/decorators";
import {
  ConfirmarEnvioDto,
  IdentificarNoPortalDto,
  PedirCredencialDto,
  RecuperacaoNoPortalDto,
} from "./portal.dto";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalRitmoGuard, PortalRitmoSessaoGuard } from "./portal-ritmo.guard";
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
 * AS QUATRO ROTAS DESTA CLASSE TÊM LIMITE DE RITMO PRÓPRIO, e o `@SkipThrottle()` que acompanha
 * cada uma é metade da correção: elas SAEM do balde global (`req.ip`, 120 por minuto, compartilhado
 * com a operação interna) e passam a contar num balde PRÓPRIO. É assim que um laço contra o Portal
 * deixa de devolver 429 na cara dos consultores, que era o furo V1 e veto de saída.
 *
 * ┌─ E `credencial` E `confirmar` ENTRARAM TAMBÉM, o que a primeira versão desta frente errou ──┐
 * │ A conclusão de que "quem alcança essas duas já passou pela identificação" É FALSA para o    │
 * │ efeito de COTA, e a auditoria pegou: o `ThrottlerGuard` é o PRIMEIRO APP_GUARD              │
 * │ (`app.module.ts`), então ele CONTA ANTES de o `PortalSessaoGuard` recusar. Um laço contra    │
 * │ `POST portal/credencial` SEM token nenhum esgotava o balde `default` e devolvia 429 aos     │
 * │ consultores. O guard de sessão protege o DADO; ele não protege a COTA.                      │
 * │                                                                                             │
 * │ ELAS USAM O PERFIL COM SESSÃO (`PortalRitmoSessaoGuard`), com números maiores, porque o uso  │
 * │ legítimo é outro: o domínio já permite 25 arquivos por link e 10 emissões por minuto.       │
 * │ A ORDEM DOS GUARDS IMPORTA: o de ritmo vem ANTES do de sessão, senão o trabalho de verificar │
 * │ o bilhete aconteceria antes do freio, que é o que o freio existe para evitar.                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O limite de ritmo POR LINK continua onde estava (`LIMITES_PORTAL.EMISSOES_POR_JANELA`), e os
 * tetos por CPF e por link da identificação também: o guard é o freio de VOLUME por endereço, não
 * o substituto de nenhum deles.
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
   * O RITMO POR IP É DO `PortalRitmoGuard` (balde próprio, fora do global). O limite que DECIDE
   * sobre esta rota continua sendo o do serviço, POR LINK e POR CPF: o guard só contém volume.
   */
  @Post("identificar")
  @Public()
  @SkipThrottle()
  @UseGuards(PortalRitmoGuard)
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
  @SkipThrottle()
  @UseGuards(PortalRitmoGuard)
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
  @SkipThrottle()
  @UseGuards(PortalRitmoSessaoGuard, PortalSessaoGuard)
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
  @SkipThrottle()
  @UseGuards(PortalRitmoSessaoGuard, PortalSessaoGuard)
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
