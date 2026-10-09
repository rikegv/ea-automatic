import { Module } from "@nestjs/common";
import { AdmissoesModule } from "../admissoes/admissoes.module";
import { PandapeArquivosModule } from "../pandape/pandape-arquivos.module";
import { PortalModule } from "../portal/portal.module";
import { DigaiController } from "./digai/digai.controller";
import { DigaiFilaService } from "./digai/digai-fila.service";
import { DigaiImportacaoService } from "./digai/digai-importacao.service";
import { DigaiPollingController } from "./digai/digai-polling.controller";
import { DigaiRepositorio } from "./digai/digai-repositorio";
import { DigaiSchedulerService } from "./digai/digai-scheduler.service";
import { DigaiVarreduraService } from "./digai/digai-varredura.service";
import {
  DigaiWebhookController,
  PORTA_DA_FILA_DIGAI,
} from "./digai/digai-webhook.controller";
import { DigaiVagaRastreioService } from "./digai/digai-vaga-rastreio.service";
import { DeParaClienteController } from "./depara-cliente/depara-cliente.controller";
import { DeParaClienteSchedulerService } from "./depara-cliente/depara-cliente-scheduler.service";
import { DeParaClienteService } from "./depara-cliente/depara-cliente.service";
import { PlanilhaVivaService } from "./depara-cliente/planilha-viva.service";
import { IngestaoDeParaCliente } from "./ingestao-pandape/ingestao-depara-cliente.service";
import { VagasRevisaoPropostaController } from "./vagas/vagas-revisao-proposta.controller";
import { IngestaoDivergenciasController } from "./ingestao-pandape/ingestao-divergencias.controller";
import { IngestaoDivergenciasService } from "./ingestao-pandape/ingestao-divergencias.service";
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
import { CandidatosImportCurriculoService } from "./candidatos/candidatos-import-curriculo.service";
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
import { ShortlistsController } from "./shortlists/shortlists.controller";
import { ShortlistsService } from "./shortlists/shortlists.service";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento/motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento/motivos-cancelamento.controller";
import { MotivosCancelamentoVagaService } from "./motivos-cancelamento/motivos-cancelamento.service";
import { MotivosDescarteAdminController } from "./motivos-descarte/motivos-descarte-admin.controller";
import { MotivosDescarteController } from "./motivos-descarte/motivos-descarte.controller";
import { MotivosDescarteService } from "./motivos-descarte/motivos-descarte.service";
import { MotivosReenvioShortlistAdminController } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist-admin.controller";
import { MotivosReenvioShortlistController } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist.controller";
import { MotivosReenvioShortlistService } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist.service";
import { VagaStatusAdminController } from "./vaga-status/vaga-status-admin.controller";
import { VagaStatusController } from "./vaga-status/vaga-status.controller";
import { VagaStatusService } from "./vaga-status/vaga-status.service";
import { VagasController } from "./vagas/vagas.controller";
import { VagasService } from "./vagas/vagas.service";
import { VagasEdicaoService } from "./vagas/vagas-edicao.service";

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
    /*
     * A SHORTLIST DA VAGA (Frente E, pontos 10 e 11). CLASSE PRÓPRIA, e a separação é de TAMANHO e
     * NUNCA de permissão: ela é reivindicada pelo MESMO menu `as-vagas` que a `VagasController`
     * (ver `domain/menus`), então o alcance é idêntico. O que ela evita é acrescentar a shortlist a
     * um serviço de 4.400 linhas que treze specs instanciam (§A.26).
     */
    ShortlistsController,
    CandidatosController,
    EtapasFunilController,
    EtapasFunilAdminController,
    MotivosCancelamentoVagaController,
    MotivosCancelamentoVagaAdminController,
    // O catálogo de motivos de DESCARTE (Frente A, ponto 7). DUAS classes pela MESMA razão do par
    // acima: a leitura é aberta (o consultor precisa do seletor para descartar) e a escrita é
    // `@Roles("SUPER_ADMIN")`. Uma classe só fecharia o seletor do desfecho para quem opera.
    MotivosDescarteController,
    MotivosDescarteAdminController,
    MotivosReenvioShortlistController,
    MotivosReenvioShortlistAdminController,
    VagaStatusController,
    VagaStatusAdminController,
    LinhasServicoController,
    LinhasServicoAdminController,
    SegmentosController,
    SegmentosAdminController,
    ComerciaisAdminController,
    CidadesController,
    /*
     * ─ A INGESTAO DO DIGAI (`as/digai`) ────────────────────────────────────────────────────────
     *
     * DUAS CLASSES, E A SEPARACAO E DE AUTORIZACAO, nao de organizacao. `DigaiWebhookController` e
     * PUBLICA (`@Public()`) e protegida pelo guard de origem proprio, token-only e fail-closed:
     * quem chama e o fornecedor, que nao tem sessao. `DigaiController` e a operacao interna, com
     * `@Roles("SUPER_ADMIN")`, porque o `MenuGuard` e FAIL-OPEN para controller que nenhum menu
     * reivindica, e esta frente nao tem menu (menu novo e decisao do diretor, §A.23).
     *
     * O RECEPTOR MORA AQUI, e nao no modulo do Pandape, porque o contrato do `tester` varre a pasta
     * `as/digai`: fora dela, o arquivo nao herda nenhuma assercao de fonte (zero PII em log, sem
     * atalho de TLS, sem token em codigo).
     */
    DigaiWebhookController,
    DigaiController,
    /*
     * ─ O DISPARO MANUAL DA VARREDURA (`POST /internal/digai/tick`) ─────────────────────────────
     *
     * Terceira classe, e a separacao segue sendo de AUTORIZACAO: esta e `@Public()` protegida pelo
     * `InternalTokenGuard` (segredo compartilhado), porque quem chama e um processo e nao uma
     * sessao. Ela NAO e o unico caminho da varredura: a cadencia vive no `DigaiSchedulerService`,
     * dentro do Nest, pela licao do cron da Clicksign que nunca foi instalado.
     */
    DigaiPollingController,
    /*
     * ─ A FILA DE DIVERGENCIAS DA INGESTAO (OST de precedência, 30/09/2026) ─────────────────────
     *
     * CLASSE PRÓPRIA, e a separação é de TAMANHO e de PERMISSAO: ela é reivindicada pelo menu
     * `divergencias-ingestao`, que é SÓ dela, e não pelo menu de nenhuma outra tela de A&S. O
     * `MenuGuard` resolve por NOME DE CLASSE, então pendurar estas três rotas numa controller já
     * existente entregaria a fila a quem tem o menu daquela outra tela.
     */
    IngestaoDivergenciasController,
    /*
     * ─ O DE/PARA DE CLIENTE DA VAGA (planilha viva do time, 01/10/2026) ────────────────────────
     *
     * DUAS CLASSES, E A SEPARAÇÃO É DE PERMISSÃO, não de tamanho:
     *  . `DeParaClienteController` é a CURADORIA, reivindicada pelo menu ADMIN `depara-cliente-vaga`,
     *    que é só dela. Pendurar estas rotas numa controller já existente entregaria a escrita do
     *    catálogo a quem tem o menu daquela outra tela (o `MenuGuard` resolve por NOME DE CLASSE);
     *  . `VagasRevisaoPropostaController` é a LEITURA da proposta pela fila de revisão, reivindicada
     *    pelo menu `as-vagas-revisao`. Ela existe separada da `VagasController` porque a proposta tem
     *    lista branca de leitores: a Central de Vagas devolve `cod_cliente`, e o valor da planilha
     *    não pode viajar no mesmo objeto que ele.
     */
    DeParaClienteController,
    VagasRevisaoPropostaController,
  ],
  // `RetencaoCandidatosService` é o expurgo por retenção (6 MESES para descartado, banco não expira).
  // O prazo era 2 anos e mudou por decisão do diretor em 29/09/2026: candidatura viva em vaga que
  // ninguém revisou protegia a pessoa por tempo INDEFINIDO, e o relógio nunca começava a correr.
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
    // Editar e excluir a vaga JÁ LIBERADA (05/10/2026). Usa as peças do `VagasService`, não o `atualizar`.
    VagasEdicaoService,
    /*
     * `ShortlistsService` é o dono ÚNICO da escrita de `as_shortlists` e `as_shortlist_itens`, e o
     * SEGUNDO escritor de `vagas.envio_shortlist`. Os dois escritores daquele campo NÃO colidem,
     * por construção: a trilha de abertura só grava em vaga de papel RASCUNHO/REVISAO, e o envio de
     * shortlist só é aceito em vaga de papel ABERTURA/ENTREGA. A prova está no cabeçalho do serviço,
     * e a guarda que a sustenta está no `enviar`.
     */
    ShortlistsService,
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
    // Importação de candidatos por CURRÍCULO (.pdf/.docx, extração de VALOR por IA). Serviço PRÓPRIO,
    // pela mesma razão do import por planilha: reusa `criar` e `adicionarEmLote` sem acrescentar
    // argumento de construtor ao `CandidatosService` nem às specs dele (§A.26).
    CandidatosImportCurriculoService,
    RetencaoCandidatosService,
    EtapasFunilService,
    MotivosCancelamentoVagaService,
    // `MotivosDescarteService` é o catálogo do descarte do candidato. O `CandidatosService` NÃO
    // depende dele por CONSTRUTOR, e a ausência é deliberada: a validação do `registrarSaida` chega
    // pela função de módulo `motivosDeDescarteAtivos`, para não acrescentar um sexto argumento à
    // assinatura que dezenas de specs instanciam (§A.26). Mesma escolha de `motivosDeCancelamento
    // Ativos` no `VagasService`.
    MotivosDescarteService,
    // `MotivosReenvioShortlistService` é o catálogo do motivo de REENVIO de shortlist. Mesma
    // escolha do vizinho, e pela mesma razão: o `ShortlistsService` NÃO depende dele por construtor,
    // porque a conferência do envio chega pela função de módulo `motivosDeReenvioAtivos`, e um
    // terceiro argumento mudaria a assinatura que as specs da shortlist já instanciam (§A.26).
    MotivosReenvioShortlistService,
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
    /*
     * NAO HA PROVIDER DE PONTE PARA A ESTEIRA, e a ausencia e deliberada (02/10/2026): "o unico
     * gatilho que envia para admissao e o gatilho da esteira, e nao das ATS". A varredura atualiza o
     * funil e nada mais. Quem cria admissao e o webhook (`pandape/pandape-sync.service.ts`) e o
     * envio manual do funil (`candidatos.service.ts`, `registrarSaida`), cada um pelo seu gesto.
     */
    IngestaoVarreduraService,
    /*
     * A FILA DE DIVERGENCIAS. Ela mora neste módulo porque consome as MESMAS instâncias de
     * `CandidatosService` e `VagasService` que o funil usa: é por elas que `ADOTADO_ATS` aplica o
     * valor pelo CAMINHO HUMANO (`moverEtapa`, `alocar`, `editarPosicoes`), com autor, trilha e
     * derivação de status. Um módulo novo criaria um segundo escritor daqueles dados, que é
     * exatamente o defeito que a fila existe para matar.
     */
    IngestaoDivergenciasService,
    /*
     * ─ O DE/PARA DE CLIENTE: TRÊS PEÇAS, E ELE NASCE INERTE ────────────────────────────────────
     *
     * `PlanilhaVivaService` é a borda HTTP que pede a leitura ao `ai-service` (o backend não tem
     * biblioteca de Drive nem de planilha, e trazer uma arrastaria para cá uma credencial com escopo
     * de ESCRITA no Drive da empresa). `DeParaClienteService` é a curadoria: desdobra as linhas,
     * PROPÕE o cliente do catálogo e nunca religa o que o diretor desligou. `IngestaoDeParaCliente` é
     * o ÚNICO escritor da proposta na vaga, e ele não devolve cliente nenhum para o ciclo.
     *
     * SEM `AS_PLANILHA_VIVA_FILE_ID` NO AMBIENTE, NADA É LIDO E NADA É ESCRITO: a sincronização
     * responde que está inerte, e nenhuma proposta nasce. Não há identificador de planilha no código
     * (§A.5: sem insumo a porta nasce fechada, sem hardcode).
     */
    PlanilhaVivaService,
    DeParaClienteService,
    IngestaoDeParaCliente,
    /*
     * A CADÊNCIA DE UMA HORA (decisão do diretor, 01/10/2026). Ela mora NESTE módulo pela mesma razão
     * das outras peças: consome a MESMA instância da sincronização que a tela de curadoria usa, e um
     * módulo novo com o mesmo provider criaria um SEGUNDO escritor do catálogo, rodando de hora em
     * hora sobre o estado que o primeiro está mudando.
     *
     * ELA NASCE INERTE com a porta fechada: sem `AS_PLANILHA_VIVA_FILE_ID`, o intervalo nem é armado.
     */
    DeParaClienteSchedulerService,
    /*
     * ─ A INGESTAO DO DIGAI: SEIS PECAS, E ELA NASCE INERTE ─────────────────────────────────────
     *
     * `DigaiRepositorio` e o UNICO ponto de escrita no banco (com a guarda de anonimizacao, que e o
     * veto A do `seguranca`: a ingestao do Digai e o QUARTO escritor de `as_candidatos` e nasceria
     * sem a clausula). `DigaiImportacaoService` e a regra. `DigaiFilaService` e a fila isolada, com
     * o limiter que cabe no teto de 120 req/min do fornecedor. A controller do receptor consome a
     * fila pelo TOKEN, e nao pela classe, para nao criar ciclo de importacao.
     *
     * `DigaiVarreduraService` e o CICLO DO POLLING (a consulta periodica que passou a ser o caminho
     * vigente, decisao do diretor de 29/09/2026), e `DigaiSchedulerService` e a cadencia dele dentro
     * do Nest. O WEBHOOK FICA NO LUGAR e nao foi removido: ele funciona e e opcao futura, bastando
     * o cadastro do listener no painel do fornecedor. O que mudou foi qual dos dois esta ligado.
     *
     * TRES PORTOES, E NENHUM DELES E REDUNDANTE: sem `DIGAI_API_TOKEN` nada SAI para a rede, sem
     * `DIGAI_INGESTAO_ATIVA` nada e ESCRITO no banco, mesmo com credencial, e sem
     * `DIGAI_POLLING_ATIVO` a varredura nao dispara sozinha. O universo medido do
     * outro lado e de 12.445 pessoas, e uma integracao que comeca a escrever no dia em que o token
     * chega nao foi ligada, foi surpreendida.
     *
     * ELAS MORAM NESTE MODULO, e nao num modulo proprio, pela MESMA razao da ingestao do Pandape:
     * `VagaStatusService` e `EtapasFunilService` tem cache em memoria cuja confiabilidade vem de
     * haver UMA instancia, e um modulo novo com os mesmos providers criaria a segunda.
     */
    DigaiRepositorio,
    DigaiImportacaoService,
    DigaiVagaRastreioService,
    DigaiVarreduraService,
    DigaiFilaService,
    DigaiSchedulerService,
    { provide: PORTA_DA_FILA_DIGAI, useExisting: DigaiFilaService },
  ],
})
export class AsModule {}
