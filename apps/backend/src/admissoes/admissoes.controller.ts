import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
  create(@Body() dto: CreateAdmissaoDto) {
    return this.admissoes.create(dto);
  }
}
