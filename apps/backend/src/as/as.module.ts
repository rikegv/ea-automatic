import { Module } from "@nestjs/common";
import { CandidatosController } from "./candidatos/candidatos.controller";
import { ComerciaisAdminController } from "./comerciais/comerciais-admin.controller";
import { ComerciaisService } from "./comerciais/comerciais.service";
import { CidadesController } from "./cidades/cidades.controller";
import { CidadesService } from "./cidades/cidades.service";
import { CandidatosService } from "./candidatos/candidatos.service";
import { RetencaoCandidatosService } from "./candidatos/retencao-candidatos.service";
import { EtapasFunilAdminController } from "./etapas/etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas/etapas-funil.controller";
import { EtapasFunilService } from "./etapas/etapas-funil.service";
import { LinhasServicoAdminController } from "./linhas-servico/linhas-servico-admin.controller";
import { LinhasServicoController } from "./linhas-servico/linhas-servico.controller";
import { LinhasServicoService } from "./linhas-servico/linhas-servico.service";
import { SegmentosAdminController } from "./segmentos/segmentos-admin.controller";
import { SegmentosController } from "./segmentos/segmentos.controller";
import { SegmentosService } from "./segmentos/segmentos.service";
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
  /*
   * ─ OS DOIS CATÁLOGOS DA ONDA E NÃO SÃO IGUAIS ENTRE SI, E A DIFERENÇA É §A.6 ────────────────
   *
   * `as-segmentos` SEGUE O MOLDE: duas classes, leitura ABERTA (`SegmentosController`) e escrita
   * `@Roles("SUPER_ADMIN")` (`SegmentosAdminController`). O ramo do cliente é lista inócua, e a
   * leitura aberta é o que permite ao seletor da ficha da vaga e ao filtro da Central funcionarem
   * para o consultor COMUM.
   *
   * `as-comerciais` TEM UMA CLASSE SÓ, e ela é a de ESCRITA, com a LEITURA DENTRO. O catálogo
   * guarda NOME DE PESSOA: uma controller de leitura aberta entregaria a folha inteira do time
   * comercial a qualquer sessão válida, inclusive aos COMUM da Admissão, com um `curl`. Quem
   * precisa da lista fora do gerenciador a recebe por superfície JÁ GATADA (`VagasService.opcoes`,
   * atrás do menu `as-vagas`, e a rota de opções do cadastro de cliente). Mesma régua de
   * `GerencialController.nomes` e `AltoVolumeController.pessoasDaLoja`.
   */
  /*
   * O CATÁLOGO DE LINHAS DE SERVIÇO (Onda C) repete a MESMA separação em duas classes, e aqui ela
   * custa mais caro do que nos outros: a linha de serviço é OBRIGATÓRIA para publicar vaga, então
   * reivindicar a leitura pelo menu de administração não deixaria um seletor vazio, travaria a
   * abertura de vaga inteira para o consultor COMUM. A escrita é `@Roles("SUPER_ADMIN")` na
   * `LinhasServicoAdminController`, porque quem edita esta lista edita a classificação da operação
   * inteira, e o menu sozinho não segura MASTER.
   *
   * `CidadesController` é SÓ LEITURA, e não tem contraparte de administração de propósito: não
   * existe CRUD de município. A fonte é o IBGE, carregado uma vez por script
   * (`db/carga-cidades-ibge.ts`), e uma tela de manutenção só criaria a chance de alguém "corrigir"
   * o nome de uma cidade e desmanchar o casamento com o código oficial.
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
    LinhasServicoController,
    LinhasServicoAdminController,
    SegmentosController,
    SegmentosAdminController,
    ComerciaisAdminController,
    CidadesController,
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
    // `LinhasServicoService` é a fonte única do catálogo de linhas de serviço e a ÚNICA porta de
    // escrita dele, o que é o que torna o cache em memória de lá confiável. O `VagasService` NÃO
    // depende dele por construtor (ver `resolverLinhaServico`): a régua é compartilhada como função
    // PURA, e a consulta é feita direto, para não mudar a assinatura que treze specs instanciam.
    LinhasServicoService,
    // `SegmentosService` e `ComerciaisService` são as fontes únicas dos catálogos da Onda E e as
    // ÚNICAS portas de escrita deles, o que é o que torna o cache em memória de lá confiável. O
    // `VagasService` e o `ClientesService` NÃO dependem deles por construtor: a régua é
    // compartilhada como função PURA (`segmentoEscolhido` / `comercialEscolhido`) e a consulta é
    // feita direto na tabela, exatamente como `resolverLinhaServico` já faz. Mudar a assinatura do
    // `VagasService` alcançaria as treze specs que o instanciam (§A.26), sem nenhum ganho.
    SegmentosService,
    ComerciaisService,
    // `CidadesService` serve a leitura por UF. A base vem do script de carga, nunca do IBGE em
    // tempo de request: a abertura de vaga não pode depender de um servidor externo estar no ar.
    CidadesService,
  ],
})
export class AsModule {}
