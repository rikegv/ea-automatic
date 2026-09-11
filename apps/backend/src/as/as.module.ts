import { Module } from "@nestjs/common";
import { CandidatosController } from "./candidatos/candidatos.controller";
import { CandidatosService } from "./candidatos/candidatos.service";
import { RetencaoCandidatosService } from "./candidatos/retencao-candidatos.service";
import { EtapasFunilAdminController } from "./etapas/etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas/etapas-funil.controller";
import { EtapasFunilService } from "./etapas/etapas-funil.service";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento/motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento/motivos-cancelamento.controller";
import { MotivosCancelamentoVagaService } from "./motivos-cancelamento/motivos-cancelamento.service";
import { VagaStatusAdminController } from "./vaga-status/vaga-status-admin.controller";
import { VagaStatusController } from "./vaga-status/vaga-status.controller";
import { VagaStatusService } from "./vaga-status/vaga-status.service";
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
  /*
   * O CATÁLOGO DE STATUS DA VAGA (onda B2) repete a MESMA separação em duas classes, com uma razão a
   * mais para não afrouxar: reivindicar a leitura fecharia a pill de status, o filtro por status e o
   * seletor do movimento manual na Central de Vagas inteira. A escrita é
   * `@Roles("SUPER_ADMIN")` na `VagaStatusAdminController`, porque quem edita esta lista edita
   * TRAVAS (`recebeCandidato` e `movivelManualmente` decidem se vaga encerrada recebe gente e se a
   * vaga tem caminho de volta), e o menu sozinho não segura MASTER.
   */
  /*
   * O CATÁLOGO DE MOTIVOS DE CANCELAMENTO repete a MESMA separação em duas classes, e pela mesma
   * razão de segurança: a leitura (`MotivosCancelamentoVagaController`) é aberta a qualquer
   * autenticado, porque é ela que enche o seletor do modal de cancelar; a escrita
   * (`MotivosCancelamentoVagaAdminController`) é `@Roles("SUPER_ADMIN")`. Uma classe só fecharia o
   * seletor para o consultor COMUM, que é justamente quem cancela vaga.
   */
  controllers: [
    VagasController,
    CandidatosController,
    EtapasFunilController,
    EtapasFunilAdminController,
    MotivosCancelamentoVagaController,
    MotivosCancelamentoVagaAdminController,
    VagaStatusController,
    VagaStatusAdminController,
  ],
  // `RetencaoCandidatosService` é o expurgo por retenção (2 anos para descartado, banco não expira).
  // Fica no módulo e não em um agendador global pelo mesmo motivo do `ExpurgoService` da Admissão:
  // a regra pertence ao domínio que ela protege, e some junto com ele se o módulo for desligado.
  // `EtapasFunilService` é a fonte única do catálogo de etapas e a ÚNICA porta de escrita dele, o
  // que é o que torna o cache em memória de lá confiável. `VagasService` e `CandidatosService`
  // dependem dele: a etapa de nascimento, a validação do movimento e a ordem do funil saem daqui.
  // `MotivosCancelamentoVagaService` é o catálogo do cancelamento da vaga (onda B1) e a fonte que o
  // `VagasService` consulta para recusar motivo fora da lista ativa.
  // `VagaStatusService` é o catálogo de status da vaga (onda B2) e a ÚNICA porta de escrita dele, o
  // que é o que torna o cache em memória de lá confiável. `VagasService` e `CandidatosService`
  // dependem dele: TODO código gravado em `vagas.status` sai daqui, pelo PAPEL, e a trava de "esta
  // vaga recebe candidato?" também.
  providers: [
    VagasService,
    CandidatosService,
    RetencaoCandidatosService,
    EtapasFunilService,
    MotivosCancelamentoVagaService,
    VagaStatusService,
  ],
})
export class AsModule {}
