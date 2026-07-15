import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, Roles } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { DecidirLiberacaoDto, RegistrarNc3Dto, SolicitarLiberacaoDto } from "./dto/nc.dto";
import { NaoConformidadesService } from "./nao-conformidades.service";

/**
 * Não Conformidades (Fase 2C). Tela acessível a TODOS os consultores (visão coletiva de gestão,
 * §A.3) — sem @Roles na maioria. Só a DECISÃO da liberação por diretoria exige supervisão
 * (Master/Super Admin).
 */
@Controller("nao-conformidades")
export class NaoConformidadesController {
  constructor(private readonly nc: NaoConformidadesService) {}

  @Get()
  listar(
    @Query("q") q?: string,
    @Query("tipo") tipo?: string,
    @Query("consultorId") consultorId?: string,
    @Query("situacao") situacao?: string,
    @Query("codCliente") codCliente?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.nc.listar({
      q,
      tipo: parseMulti(tipo),
      consultorId: parseMulti(consultorId),
      situacao: parseMulti(situacao),
      codCliente: parseMulti(codCliente),
      from,
      to,
    });
  }

  /** NC-3 manual (Cadastro incompleto) — flags manuais até kit/assinatura existirem (F9/INT-4). */
  @Post("cadastro")
  registrarNc3(@Body() dto: RegistrarNc3Dto, @CurrentUser() user: AuthUser) {
    return this.nc.registrarNc3(dto, user);
  }

  @Patch(":id/resolver")
  resolver(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.nc.resolver(id, user);
  }

  /** Via 2 — consultor flaga liberação por determinação da diretoria + motivo. */
  @Patch(":id/liberacao")
  solicitarLiberacao(
    @Param("id") id: string,
    @Body() dto: SolicitarLiberacaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.nc.solicitarLiberacao(id, dto, user);
  }

  /** Supervisão (Master/Super Admin) aprova/reprova a liberação por diretoria. */
  @Patch(":id/liberacao/decisao")
  @Roles("MASTER", "SUPER_ADMIN")
  decidirLiberacao(
    @Param("id") id: string,
    @Body() dto: DecidirLiberacaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.nc.decidirLiberacao(id, dto, user);
  }
}
