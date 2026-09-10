import { Module } from "@nestjs/common";
import { CandidatosController } from "./candidatos/candidatos.controller";
import { CandidatosService } from "./candidatos/candidatos.service";
import { RetencaoCandidatosService } from "./candidatos/retencao-candidatos.service";
import { EtapasFunilAdminController } from "./etapas/etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas/etapas-funil.controller";
import { EtapasFunilService } from "./etapas/etapas-funil.service";
import { VagasController } from "./vagas/vagas.controller";
import { VagasService } from "./vagas/vagas.service";

/**
 * MÓDULO DE ATRAÇÃO E SELEÇÃO. Nasce ISOLADO: tabela própria (`vagas`), rota própria (`as/...`),
 * menu em grupo e área próprios, e NENHUMA dependência de módulo da Admissão. É a mesma disciplina
 * que deixou o Alto Volume nascer sem quebrar Esteira, Gerenciador e Controle Gerencial.
 */
@Module({
  /*
   * DUAS CONTROLLERS PARA O CATÁLOGO DE ETAPAS, e a separação é de SEGURANÇA, não de organização: o
   * `MenuGuard` resolve por NOME DE CLASSE, então uma classe só (reivindicada pelo menu de
   * administração) fecharia junto o `GET /as/etapas` e daria 403 no funil para o consultor COMUM.
   * `EtapasFunilController` é a leitura, aberta a qualquer autenticado; `EtapasFunilAdminController`
   * é a escrita, `@Roles("SUPER_ADMIN")`. Afirmado em `etapas-funil-menu.spec.ts`.
   */
  controllers: [
    VagasController,
    CandidatosController,
    EtapasFunilController,
    EtapasFunilAdminController,
  ],
  // `RetencaoCandidatosService` é o expurgo por retenção (2 anos para descartado, banco não expira).
  // Fica no módulo e não em um agendador global pelo mesmo motivo do `ExpurgoService` da Admissão:
  // a regra pertence ao domínio que ela protege, e some junto com ele se o módulo for desligado.
  // `EtapasFunilService` é a fonte única do catálogo de etapas e a ÚNICA porta de escrita dele, o
  // que é o que torna o cache em memória de lá confiável. `VagasService` e `CandidatosService`
  // dependem dele: a etapa de nascimento, a validação do movimento e a ordem do funil saem daqui.
  providers: [VagasService, CandidatosService, RetencaoCandidatosService, EtapasFunilService],
})
export class AsModule {}
