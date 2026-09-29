import { Body, Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/decorators";
import { AceitarTermoDto } from "./portal.dto";
import { PortalTermoService } from "./portal-termo.service";
import { PortalRitmoSessaoGuard } from "./portal-ritmo.guard";
import { PortalSessaoGuard, type RequestComPortal } from "./portal-sessao.guard";

/**
 * Portal do Candidato: a GRAVAÇÃO do aceite do termo de privacidade (bug 1).
 *
 * MESMO MOLDE do `PortalDadosGiController`: `@Public()` porque quem opera é o CANDIDATO (não é
 * usuário, não tem senha); o `@Public()` só tira o `JwtAuthGuard` global, e quem autoriza é o
 * `PortalSessaoGuard` local, que verifica o bilhete Ed25519 e escreve `req.portal`.
 *
 * ESTA ROTA PRECISA ENTRAR NA ALLOWLIST DA BARREIRA POR CAMINHO, como as outras de escrita do
 * portal. Rota nova não avisada ao Fernando quebra em produção, em silêncio.
 *
 * SEM PARÂMETRO DE ADMISSÃO como origem: a admissão vem do `req.portal`, escrito pelo guard a
 * partir do bilhete assinado, e de lugar nenhum mais. O corpo pode trazer `admissaoId` só para o
 * serviço RECUSAR quando ele divergir da sessão (defesa em profundidade).
 *
 * LIMITE DE RITMO: `@SkipThrottle()` mais `PortalRitmoSessaoGuard`, ANTES do guard de sessão. Esta
 * rota está na allowlist da barreira e é ALCANÇÁVEL SEM CREDENCIAL, e o `ThrottlerGuard` global
 * conta ANTES de o guard de sessão recusar: sem isto, um laço aqui esgotava o balde `default` e
 * devolvia 429 aos consultores (veto 5 da auditoria do limitador).
 */
@Controller("portal")
export class PortalTermoController {
  constructor(private readonly termo: PortalTermoService) {}

  @Post("termo")
  @Public()
  @SkipThrottle()
  @UseGuards(PortalRitmoSessaoGuard, PortalSessaoGuard)
  aceitar(
    @Req() req: RequestComPortal,
    @Body() dto: AceitarTermoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // §A.6: prova de consentimento não fica em cache de proxy nem de disco, mesmo tratamento das
    // outras rotas do portal que devolvem/gravam.
    res.set({ "Cache-Control": "no-store, private" });
    return this.termo.aceitar({
      admissaoId: req.portal!.admissaoId,
      jtiLink: req.portal!.jtiLink,
      admissaoNoCorpo: dto.admissaoId,
    });
  }
}
