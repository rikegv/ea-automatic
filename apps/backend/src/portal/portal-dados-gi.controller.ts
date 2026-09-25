import { Body, Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { GravarDadosGiDto } from "./portal.dto";
import { PortalDadosGiService } from "./portal-gi-gravacao.service";
import { PortalSessaoGuard, type RequestComPortal } from "./portal-sessao.guard";

/**
 * Portal do Candidato: a GRAVAÇÃO dos dados do GI que o candidato validou (Portal→GI, peça 2).
 *
 * MESMO MOLDE do `PortalController`/`PortalDocumentosController`: `@Public()` porque quem opera é o
 * CANDIDATO (não é usuário, não tem senha); o `@Public()` só tira o `JwtAuthGuard` global, e quem
 * autoriza é o `PortalSessaoGuard` local, que verifica o bilhete Ed25519 e escreve `req.portal`.
 *
 * ESTA ROTA PRECISA ENTRAR NA ALLOWLIST DA BARREIRA POR CAMINHO (item F7), como as outras de
 * escrita. Rota nova não avisada ao Fernando quebra em produção, em silêncio.
 *
 * SEM PARÂMETRO DE ADMISSÃO no corpo, nem opcional: id de admissão é adivinhável por enumeração, e
 * um `admissaoId` no corpo deixaria um link válido gravar dado na admissão de OUTRA pessoa. A
 * admissão vem do `req.portal`, escrito pelo guard a partir do bilhete assinado, e de lugar nenhum
 * mais.
 */
@Controller("portal")
export class PortalDadosGiController {
  constructor(private readonly dadosGi: PortalDadosGiService) {}

  @Post("dados-gi")
  @Public()
  @UseGuards(PortalSessaoGuard)
  gravar(
    @Req() req: RequestComPortal,
    @Body() dto: GravarDadosGiDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // §A.6: dado pessoal validado não fica em cache de proxy nem de disco do navegador, mesmo
    // tratamento da leitura da trilha.
    res.set({ "Cache-Control": "no-store, private" });
    return this.dadosGi.gravar({
      admissaoId: req.portal!.admissaoId,
      jtiLink: req.portal!.jtiLink,
      campos: dto.campos,
      ip: this.ipDaBarreira(req),
    });
  }

  /** IP do candidato, só existe se a BARREIRA o escrever. Cópia deliberada do `PortalController`. */
  private ipDaBarreira(req: RequestComPortal): string | null {
    const cabecalho = req.headers["x-forwarded-for"];
    const bruto = (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.split(",")[0]?.trim();
    if (!bruto) return null;
    return bruto.replace(/^::ffff:/, "").slice(0, 45);
  }
}
