import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { MotivosDeclinioService } from "./motivos-declinio.service";
import { CreateMotivoDeclinioDto, UpdateMotivoDeclinioDto } from "./motivos-declinio.dto";

@Controller("admin/motivos-declinio")
export class MotivosDeclinioController {
  constructor(private readonly motivos: MotivosDeclinioService) {}

  @Get()
  list() {
    return this.motivos.list();
  }

  @Post()
  create(@Body() dto: CreateMotivoDeclinioDto) {
    return this.motivos.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMotivoDeclinioDto) {
    return this.motivos.update(id, dto);
  }

  /** Reativa o motivo (volta às opções selecionáveis). */
  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.motivos.reativar(id);
  }

  /**
   * INATIVAÇÃO (não é exclusão física, §A.3/§A.6). A rota DELETE só seta `ativo=false`, preservando
   * os vínculos das admissões que já apontam para o motivo. Reversível.
   */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.motivos.inativar(id);
  }
}
