import { Module } from "@nestjs/common";
import { AdmissoesModule } from "../admissoes/admissoes.module";
import { PandapeArquivosModule } from "../pandape/pandape-arquivos.module";
import { PortalModule } from "../portal/portal.module";
import { IngestaoHttp } from "./ingestao-pandape/ingestao-http";
import { IngestaoRepositorio } from "./ingestao-pandape/ingestao-repositorio";
import { IngestaoVarreduraService } from "./ingestao-pandape/ingestao-varredura.service";
import { CandidatosController } from "./candidatos/candidatos.controller";
import { ComerciaisAdminController } from "./comerciais/comerciais-admin.controller";
import { ComerciaisService } from "./comerciais/comerciais.service";
import { CidadesController } from "./cidades/cidades.controller";
import { CidadesService } from "./cidades/cidades.service";
import { CandidatosService } from "./candidatos/candidatos.service";
import { CandidatosImportService } from "./candidatos/candidatos-import.service";
import { DeparaEtapaExternaService } from "./depara/depara-etapa-externa.service";
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
  /*
   * ─ A ÚNICA IMPORTAÇÃO DESTE MÓDULO, E ELA NÃO DESFAZ O ISOLAMENTO ───────────────────────────
   *
   * `PandapeArquivosModule` é a FOLHA da integração (o comentário de lá explica por que ela existe):
   * não importa ninguém e carrega o `PandapeApiService`, que é o cliente HTTP com UMA instância e UM
   * cache de token. A varredura precisa dele, e importar a folha é o que impede duas coisas: um ciclo
   * de módulos (o `PandapeModule` importa `AdmissoesModule`) e uma SEGUNDA instância do cliente, que
   * dobraria a emissão de token e o consumo da cota compartilhada (§A.5).
   *
   * O ISOLAMENTO QUE O MÓDULO DECLARA CONTINUA INTEIRO: nenhuma dependência do módulo da ADMISSÃO
   * entra por aqui, e nada em `as/` passa a conhecer Esteira, Gerenciador ou Alto Volume.
   */
  /*
   * ─ A SEGUNDA IMPORTAÇÃO, E ELA MERECE SER DECLARADA EM VOZ ALTA ─────────────────────────────
   *
   * `PortalModule` é a PRIMEIRA dependência deste módulo com uma frente da ADMISSÃO, e o cabeçalho
   * acima dizia "NENHUMA". A frase valia enquanto o funil terminava em si mesmo; ela deixou de
   * valer no instante em que o diretor pediu que "Enviar Para Admissão" ENTREGASSE o link do
   * Portal ao candidato. O gancho tinha de morar no ramo de `ENVIADO_PARA_ADMISSAO` de
   * `registrarSaida` (e não em `mudarSituacaoOcupandoPosicao`, que também serve `aprovar` e
   * `alocar`), então é daqui que a chamada sai.
   *
   * O QUE O A&S USA É UMA PORTA SÓ, `PortalEnvioService`. O QUE ELE ALCANÇA SÃO TRÊS, E ISSO É
   * DIFERENTE: no Nest, importar um módulo torna injetável TUDO que ele EXPORTA, e o
   * `PortalModule` exporta `PortalTrilhaService`, `PortalIdentidadeService` e `PortalEnvioService`.
   * Ou seja, o dono de TODA escrita em `portal_links` (`emitirLink`, que REVOGA os anteriores, e
   * `revogarLink`) passou a estar a uma injeção de construtor de distância daqui.
   *
   * Nada em `as/` injeta as outras duas, e QUEM TRAVA ISSO É UM TESTE, não este comentário:
   * `as-porta-do-portal.tester.spec.ts` varre `as/` e falha se alguém importar
   * `PortalIdentidadeService` ou `PortalTrilhaService`. A barreira de módulo ficou mais fina, e o
   * desenho do `portal-envio.service.ts` se apoia em `portal_links` ter UM ponto de escrita.
   *
   * (Este parágrafo dizia "UMA PORTA SÓ" e estava ERRADO: achado da auditoria. Comentário que
   * mente sobre alcance é o modo de falha exato da §A.26.)
   *
   * O A&S não passa a conhecer Esteira, Gerenciador nem Alto Volume, não lê tabela da Admissão e
   * não escreve em `portal_links` (quem escreve é o `PortalIdentidadeService`, do outro lado).
   *
   * SEM CICLO DE MÓDULOS: `PortalModule` importa `ConfigModule` e `ReguaModule`, e nenhum dos dois
   * conhece `as/`. É a mesma conferência que a nota do `PandapeArquivosModule` faz abaixo.
   *
   * E O ACOPLAMENTO É INERTE HOJE: `as_candidaturas.admissao_id` ainda nasce nula, então o envio
   * automático devolve `SEM_ADMISSAO` e não faz nada. Ele liga sozinho no dia em que a ponte
   * A&S para Esteira escrever aquela coluna.
   */
  /*
   * ─ A PONTE A&S → ESTEIRA: `AdmissoesModule` (a ligação do funil com a Admissão) ─────────────
   *
   * O cabeçalho deste módulo dizia "NENHUMA dependência de módulo da Admissão", e a frase valeu
   * enquanto o funil terminava em si mesmo. Deixou de valer quando o diretor pediu a PONTE: o
   * candidato ENVIADO_PARA_ADMISSAO nasce como PRÉ-ADMISSÃO na Esteira. O `CandidatosService` usa
   * UMA porta só do núcleo, `AdmissoesService` (nascer a pré-admissão e contar a duplicidade viva
   * por CPF), no ramo `ENVIADO_PARA_ADMISSAO` de `registrarSaida`.
   *
   * SEM CICLO: `AdmissoesModule` importa `PandapeQueueModule` e `ReguaModule`, e nenhum dos dois
   * conhece `as/`. `AdmissoesModule` exporta só o `AdmissoesService` (o `ExpurgoService` fica
   * dentro), então o alcance novo é exatamente essa porta, e nada mais da Admissão entra aqui.
   */
  imports: [AdmissoesModule, PandapeArquivosModule, PortalModule],
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
    // `DeparaEtapaExternaService` resolve o nome de uma etapa vinda de fora (Pandapé, Digai) para a
    // etapa do funil ou para um desfecho, lendo a tabela de configuração `as_depara_etapa_externa`.
    // NASCE SEM CHAMADOR de propósito: a fundação da plataforma unificadora existe antes da
    // ingestão, e a porta nova ainda não abre. Fica registrado aqui para que ligar a ingestão seja
    // uma injeção de construtor, e não uma migration na frente do diretor.
    DeparaEtapaExternaService,
    CandidatosService,
    // Importação de candidatos por planilha (de/para de colunas por IA). Serviço PRÓPRIO, e não um
    // método no `CandidatosService`, para não acrescentar um quinto argumento de construtor às ~14
    // specs que o instanciam (§A.26). Reusa `criar` e `adicionarEmLote` daquele serviço.
    CandidatosImportService,
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
    /*
     * ─ A INGESTÃO DO PANDAPÉ POR VARREDURA (`as/ingestao-pandape`) ──────────────────────────────
     *
     * Três peças, e a separação é o que a torna auditável: o REPOSITÓRIO (único ponto de escrita no
     * banco, com as guardas de anonimização e a lista nominal de colunas), o HTTP (GET apenas, com
     * allowlist de caminho e o cache das pastas) e o SERVIÇO (a fila isolada, o worker e a cadência).
     *
     * ELA NASCE INERTE: sem `PANDAPE_VARREDURA_DATA_CORTE` no ambiente, nada é lido e nada é escrito.
     * A data de corte não tem default de propósito (ver o serviço): um default faria a primeira
     * subida começar a colher dado pessoal de 137 mil pessoas sem ninguém decidir isso.
     *
     * `VagaStatusService` e `EtapasFunilService` são consumidos daqui de dentro, e é por isso que as
     * três peças moram NESTE módulo em vez de num módulo próprio: os dois catálogos têm cache em
     * memória cuja confiabilidade vem de haver UMA instância, e um módulo novo com os mesmos
     * providers criaria a segunda.
     */
    IngestaoRepositorio,
    IngestaoHttp,
    IngestaoVarreduraService,
  ],
})
export class AsModule {}
