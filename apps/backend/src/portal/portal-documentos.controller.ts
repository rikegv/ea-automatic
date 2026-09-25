import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalSessaoGuard, type RequestComPortal } from "./portal-sessao.guard";

/**
 * Portal do Candidato, A LEITURA. Uma rota só: a trilha que a tela da Sol desenha ao abrir o link.
 *
 * MESMO MOLDE DO `PortalController`: `@Public()` porque quem opera é o CANDIDATO, que não é usuário
 * do sistema e não tem senha; `@Public()` só tira o JwtAuthGuard global do caminho, e quem autoriza
 * é o `PortalSessaoGuard` local, que verifica o bilhete Ed25519.
 *
 * ESTA ROTA PRECISA ENTRAR NA ALLOWLIST DA BARREIRA (item F7), como as duas de escrita. Rota nova
 * não avisada ao Fernando quebra em produção, em silêncio.
 *
 * ELA É A PRIMEIRA ROTA DO PORTAL QUE DEVOLVE DADO, e é por isso que o cabeçalho de cache está
 * aqui: as outras duas recebem. A resposta atravessa o proxy do Next e a barreira externa, e
 * qualquer um dos dois guardaria a lista de documentos de uma pessoa se não for proibido.
 */
@Controller("portal")
export class PortalDocumentosController {
  constructor(private readonly documentos: PortalDocumentosService) {}

  /**
   * A trilha da admissão DO BILHETE.
   *
   * SEM PARÂMETRO DE ADMISSÃO, nem opcional, nem para depuração: id de admissão é adivinhável por
   * enumeração e não é segredo, então um `?admissaoId=` aqui deixaria qualquer link válido ler a
   * lista de documentos de qualquer pessoa. A admissão vem do `req.portal`, escrito pelo guard a
   * partir do bilhete assinado, e de lugar nenhum mais.
   */
  @Get("documentos")
  @Public()
  @UseGuards(PortalSessaoGuard)
  trilha(@Req() req: RequestComPortal, @Res({ passthrough: true }) res: Response) {
    // Lista de documentos de candidato não fica em cache de proxy nem de disco do navegador (§A.6),
    // mesmo tratamento do arquivo servido pela reauditoria.
    res.set({ "Cache-Control": "no-store, private" });
    return this.documentos.trilha(req.portal!.admissaoId, {
      jtiLink: req.portal!.jtiLink,
      ip: this.ipDaBarreira(req),
    });
  }

  /**
   * IP do candidato, e ele só existe se a BARREIRA o escrever (item F1). Cópia deliberada do
   * `PortalController`: o valor NÃO decide nada, não limita e não autoriza, só alimenta a trilha,
   * onde entra hasheado com sal mensal. Sem `trust proxy`, o socket é sempre `127.0.0.1` e o
   * `x-forwarded-for` que chega é o que o cliente mandar.
   */
  private ipDaBarreira(req: RequestComPortal): string | null {
    const cabecalho = req.headers["x-forwarded-for"];
    const bruto = (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.split(",")[0]?.trim();
    if (!bruto) return null;
    return bruto.replace(/^::ffff:/, "").slice(0, 45);
  }
}
