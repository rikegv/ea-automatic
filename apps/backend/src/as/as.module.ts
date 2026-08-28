import { Module } from "@nestjs/common";
import { CandidatosController } from "./candidatos/candidatos.controller";
import { CandidatosService } from "./candidatos/candidatos.service";
import { RetencaoCandidatosService } from "./candidatos/retencao-candidatos.service";
import { VagasController } from "./vagas/vagas.controller";
import { VagasService } from "./vagas/vagas.service";

/**
 * MÓDULO DE ATRAÇÃO E SELEÇÃO. Nasce ISOLADO: tabela própria (`vagas`), rota própria (`as/...`),
 * menu em grupo e área próprios, e NENHUMA dependência de módulo da Admissão. É a mesma disciplina
 * que deixou o Alto Volume nascer sem quebrar Esteira, Gerenciador e Controle Gerencial.
 */
@Module({
  controllers: [VagasController, CandidatosController],
  // `RetencaoCandidatosService` é o expurgo por retenção (2 anos para descartado, banco não expira).
  // Fica no módulo e não em um agendador global pelo mesmo motivo do `ExpurgoService` da Admissão:
  // a regra pertence ao domínio que ela protege, e some junto com ele se o módulo for desligado.
  providers: [VagasService, CandidatosService, RetencaoCandidatosService],
})
export class AsModule {}
