import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { AiClientService } from "../../ai/ai-client.service";
import { DrivePastaPaiService, extrairFolderId } from "../../ai/drive-pasta-pai.service";
import {
  UpsertPastaDriveDto,
  ValidarPastaDriveDto,
  type EscopoPastaPaiDto,
} from "./pastas-drive.dto";

/**
 * Gestão da PASTA-PAI do Drive por tabela (INT-2), tirando o roteamento do `.env`. Só administração
 * (§A.6/§A.2): consultor COMUM não acessa cadastro. A validação da pasta passa pelo ai-service
 * (caminho real: a credencial em uso enxerga a pasta?), então só se salva pasta comprovadamente
 * válida. §A.6: `folderId` é identificador do Drive, não PII.
 */
@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/pastas-drive")
export class PastasDriveController {
  constructor(
    private readonly pastas: DrivePastaPaiService,
    private readonly ai: AiClientService,
  ) {}

  /** Rótulo amigável derivado do par (escopo + chave) quando o corpo não traz um. Sem travessão (§A.11). */
  private rotuloDerivado(escopo: EscopoPastaPaiDto, chave: string): string {
    const c = chave.trim();
    if (escopo === "FOPAG") return `Fopag cliente ${c}`;
    // CONTRATO: primeira letra de cada palavra em maiúscula (ex.: "jovem aprendiz" -> "Jovem Aprendiz").
    const titulo = c
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
    return `Contrato ${titulo}`;
  }

  @Get()
  list() {
    return this.pastas.listar();
  }

  /**
   * Valida uma referência de pasta (URL do Drive ou id cru): extrai o id e checa no ai-service. Não
   * grava nada. Referência sem id extraível responde valido=false com motivo claro.
   */
  @Post("validar")
  async validar(@Body() dto: ValidarPastaDriveDto) {
    const folderId = extrairFolderId(dto.folderRef);
    if (!folderId) {
      return {
        valido: false,
        folderId: null,
        motivo: "Não reconheci uma pasta do Drive nesse link ou id. Cole o link da pasta ou o id.",
      };
    }
    const { valido, motivo } = await this.ai.validarPastaDrive(folderId);
    return { valido, folderId, motivo };
  }

  /**
   * Cria ou atualiza a pasta-pai do par (escopo + chave). Extrai o id, VALIDA (mesma checagem do
   * /validar) e só então persiste; referência inválida OU pasta reprovada pelo Drive responde 400 e
   * NÃO salva. O rótulo é derivado do par (§A.11, sem travessão).
   */
  @Put()
  async upsert(@Body() dto: UpsertPastaDriveDto) {
    const folderId = extrairFolderId(dto.folderRef);
    if (!folderId) {
      throw new BadRequestException(
        "Não reconheci uma pasta do Drive nesse link ou id. Cole o link da pasta ou o id.",
      );
    }
    const { valido, motivo } = await this.ai.validarPastaDrive(folderId);
    if (!valido) {
      throw new BadRequestException(motivo ?? "A pasta do Drive não pôde ser validada. Nada foi salvo.");
    }
    return this.pastas.upsert({
      escopo: dto.escopo,
      chave: dto.chave,
      folderId,
      rotulo: this.rotuloDerivado(dto.escopo, dto.chave),
    });
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.pastas.remover(id);
  }
}
