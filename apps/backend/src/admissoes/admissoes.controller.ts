import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { AdmissoesService } from "./admissoes.service";
import { CreateAdmissaoDto } from "./dto/create-admissao.dto";
import { UpdateAdmissaoDto } from "./dto/update-admissao.dto";

// Operacional do wizard (F6/F11) e do Gerenciador (F10/F7). Autenticado, sem restrição de papel
// (esteira/gerenciador são coletivos — §A.3), EXCETO a deleção, que é destrutiva (Master/Super Admin).
@Controller("admissoes")
export class AdmissoesController {
  constructor(private readonly admissoes: AdmissoesService) {}

  /** F10/F7 — Gerenciador: lista paginada com filtros, busca global e KPIs. */
  @Get()
  listar(
    @Query("q") q?: string,
    @Query("codCliente") codCliente?: string,
    @Query("cargoId") cargoId?: string,
    @Query("tipoContrato") tipoContrato?: string,
    @Query("farol") farol?: string,
    @Query("sinalizador") sinalizador?: string,
    @Query("concluido") concluido?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.admissoes.listar({
      q,
      codCliente,
      cargoId,
      tipoContrato,
      farol,
      sinalizador,
      concluido: concluido === "true",
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("candidato/:cpf")
  lookupCandidato(@Param("cpf") cpf: string) {
    return this.admissoes.lookupCandidato(cpf);
  }

  /** F10 — campos editáveis (prefill do formulário de edição). */
  @Get(":id")
  obter(@Param("id") id: string) {
    return this.admissoes.obter(id);
  }

  @Post()
  create(@Body() dto: CreateAdmissaoDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.create(dto, user);
  }

  /** F10 — edita vaga/folha + contrato/data/matrícula/farol (não toca CPF/cod_cliente). */
  @Patch(":id")
  editar(@Param("id") id: string, @Body() dto: UpdateAdmissaoDto) {
    return this.admissoes.editar(id, dto);
  }

  /** F10 — deleta a admissão (ação destrutiva): só Master/Super Admin. */
  @Delete(":id")
  @Roles("MASTER", "SUPER_ADMIN")
  deletar(@Param("id") id: string) {
    return this.admissoes.deletar(id);
  }
}
