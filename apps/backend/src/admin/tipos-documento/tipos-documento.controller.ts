import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { Roles } from "../../auth/decorators";
import { CreateTipoDocumentoDto, UpdateTipoDocumentoDto } from "./tipos-documento.dto";
import { TiposDocumentoService } from "./tipos-documento.service";

/**
 * Gestão do catálogo de documentos da régua documental. Só administração: quem classifica documento
 * é o time da administração, não o consultor.
 *
 * Rota SEPARADA de `GET /catalogos/tipos-documento` DE PROPÓSITO. Aquele endpoint alimenta a
 * Esteira/Auditoria e o Gerenciador, que precisam enxergar TODOS os tipos (inclusive inativos) para
 * resolver o nome de documentos de admissões antigas; filtrar lá quebraria a leitura do histórico.
 * Esta rota é a visão de gestão, e é ela que a tela da régua consome.
 */
@Roles("MASTER", "SUPER_ADMIN")
@Controller("admin/tipos-documento")
export class TiposDocumentoController {
  constructor(private readonly tipos: TiposDocumentoService) {}

  @Get()
  list() {
    return this.tipos.list();
  }

  @Post()
  create(@Body() dto: CreateTipoDocumentoDto) {
    return this.tipos.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTipoDocumentoDto) {
    return this.tipos.update(id, dto);
  }

  @Patch(":id/reativar")
  reativar(@Param("id") id: string) {
    return this.tipos.reativar(id);
  }

  /** INATIVAÇÃO, nunca exclusão física (§A.6): preserva as réguas e o histórico de documentos. */
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.tipos.inativar(id);
  }
}
