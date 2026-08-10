import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth.types";
import { CurrentUser } from "../../auth/decorators";
import { AltoVolumeService } from "./alto-volume.service";
import {
  CreateGrupoDto,
  CreateProjetoDto,
  CreateVagaDto,
  UpdateGrupoDto,
  UpdateProjetoDto,
  UpdateVagaDto,
} from "./alto-volume.dto";

/**
 * ALTO VOLUME (onda 1): cadastro de projeto, grupos de entrada e vagas por cargo.
 *
 * RBAC POR OPERAÇÃO, na régua que o sistema já fixou depois do incidente da Liberação: NENHUM
 * `@Roles` em classe, LER é dado de trabalho e fica aberto a qualquer autenticado, ESCREVER é
 * governado pelo MENU (`alto-volume`, ver `domain/menus`).
 *
 * POR QUE A LEITURA NASCE ABERTA, e isto é decisão de desenho, não descuido: na onda 2 o modal da
 * Liberação vai listar os projetos do cliente para o consultor escolher. O consultor COMUM não terá
 * o menu `alto-volume` (que é do Gerencial, §A.23), então reivindicar a leitura por menu faria o
 * seletor tomar 403 na cara dele. É exatamente o que aconteceu com o dropdown do Gerador de Kit e
 * com cliente e cargo sumindo da Liberação. Aberto na leitura, fechado na escrita.
 *
 * ORDEM DAS ROTAS: as literais (`grupos/…`, `vagas/…`) vêm ANTES das de `:id`. O Nest casa na ordem
 * de declaração, e é a mesma precaução que a `AdmissoesController` documenta para `liberar-lote`.
 */
@Controller("admin/alto-volume")
export class AltoVolumeController {
  constructor(private readonly altoVolume: AltoVolumeService) {}

  // ── Leitura (aberta a qualquer autenticado) ───────────────────────────────

  @Get()
  list() {
    return this.altoVolume.list();
  }

  @Get(":id")
  obter(@Param("id") id: string) {
    return this.altoVolume.obter(id);
  }

  // ── Escrita de GRUPO e VAGA (rotas literais primeiro) ─────────────────────

  @Patch("grupos/:grupoId")
  atualizarGrupo(@Param("grupoId") grupoId: string, @Body() dto: UpdateGrupoDto) {
    return this.altoVolume.atualizarGrupo(grupoId, dto);
  }

  @Delete("grupos/:grupoId")
  removerGrupo(@Param("grupoId") grupoId: string) {
    return this.altoVolume.removerGrupo(grupoId);
  }

  @Patch("vagas/:vagaId")
  atualizarVaga(@Param("vagaId") vagaId: string, @Body() dto: UpdateVagaDto) {
    return this.altoVolume.atualizarVaga(vagaId, dto);
  }

  @Delete("vagas/:vagaId")
  removerVaga(@Param("vagaId") vagaId: string) {
    return this.altoVolume.removerVaga(vagaId);
  }

  // ── Escrita de PROJETO ────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateProjetoDto, @CurrentUser() user: AuthUser) {
    return this.altoVolume.create(dto, user);
  }

  @Post(":id/grupos")
  criarGrupo(@Param("id") id: string, @Body() dto: CreateGrupoDto) {
    return this.altoVolume.criarGrupo(id, dto);
  }

  @Post(":id/vagas")
  criarVaga(@Param("id") id: string, @Body() dto: CreateVagaDto) {
    return this.altoVolume.criarVaga(id, dto);
  }

  /** Reativa o projeto (volta às opções selecionáveis da liberação, onda 2). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.altoVolume.reativar(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProjetoDto) {
    return this.altoVolume.update(id, dto);
  }

  /**
   * INATIVAÇÃO (exclusão lógica). O DELETE só seta `ativo=false`: grupos, vagas e os vínculos já
   * feitos permanecem, e o projeto continua consultável. Reversível pela reativação.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.altoVolume.inativar(id);
  }
}
