import { Body, Controller, Post, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { gerarXlsxGenerico } from "../admissoes/relatorio-export";
import { RelatorioXlsxDto } from "./relatorio.dto";

/**
 * EXPORTAÇÃO GENÉRICA EM XLSX (OST das ondas, Onda 2). Uma porta só, reusada pelas telas que
 * replicam o Excel do Gerenciador: Auditoria, Exame, Cadastro, Integração e IFractal mandam as
 * colunas e as linhas que ESTÃO NA TELA (filtradas no browser), e o backend devolve a planilha.
 *
 * Autenticada (JwtAuthGuard global) e operação ABERTA (não reivindicada por menu): quem já vê a
 * tela pode exportar o que vê. §A.6: não grava nada, não loga linha; só formata o que recebe.
 *
 * O Gerenciador de Admissão segue com a sua rota própria (`/admissoes/relatorio`, server-side com
 * catálogo de colunas) e o Gerenciador do Portal tem a sua (`/portal/links/relatorio`, que resolve
 * o link vivo por candidato). Esta porta atende as telas cujo filtro vive no browser.
 */
@Controller("relatorio")
export class RelatorioController {
  @Post("xlsx")
  async xlsx(
    @Body() dto: RelatorioXlsxDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await gerarXlsxGenerico(dto.aba ?? "Dados", dto.colunas, dto.linhas ?? []);
    const nome = nomeSeguro(dto.nomeArquivo);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    });
    return new StreamableFile(buffer);
  }
}

/**
 * Nome do arquivo saneado para o header: tira o que quebraria o Content-Disposition (aspas, CR/LF,
 * barras) e garante a extensão .xlsx. Sem nome, cai num padrão datado para o time não sobrescrever
 * o arquivo da semana passada.
 */
function nomeSeguro(bruto?: string): string {
  const limpo = (bruto ?? "").replace(/[\r\n"\\/]+/g, "").trim();
  if (!limpo) {
    const a = new Date();
    const d2 = (n: number) => String(n).padStart(2, "0");
    return `relatorio-${a.getFullYear()}-${d2(a.getMonth() + 1)}-${d2(a.getDate())}.xlsx`;
  }
  return limpo.toLowerCase().endsWith(".xlsx") ? limpo : `${limpo}.xlsx`;
}
