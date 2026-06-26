import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { AdmissoesService } from "./admissoes.service";
import { CreateAdmissaoDto } from "./dto/create-admissao.dto";

// Operacional do wizard (F6/F11). Autenticado, sem restrição de papel: a esteira é coletiva (§A.3).
@Controller("admissoes")
export class AdmissoesController {
  constructor(private readonly admissoes: AdmissoesService) {}

  @Get("candidato/:cpf")
  lookupCandidato(@Param("cpf") cpf: string) {
    return this.admissoes.lookupCandidato(cpf);
  }

  @Post()
  create(@Body() dto: CreateAdmissaoDto, @CurrentUser() user: AuthUser) {
    return this.admissoes.create(dto, user);
  }
}
