import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PortalArmazenamentoService } from "./portal-armazenamento.service";
import { PortalController } from "./portal.controller";
import { PortalCorreioService } from "./portal-correio.service";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalDadosGiController } from "./portal-dados-gi.controller";
import { PortalDadosGiService } from "./portal-gi-gravacao.service";
import { PortalDocumentosController } from "./portal-documentos.controller";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalEmissorService } from "./portal-emissor.service";
import { PortalEnvioController } from "./portal-envio.controller";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { PortalLinksController } from "./portal-links.controller";
import { PortalLinkVivoService } from "./portal-link-vivo.service";
import { PortalPainelController } from "./portal-painel.controller";
import { PortalPainelService } from "./portal-painel.service";
import { PortalPedidosAjudaController } from "./portal-pedidos-ajuda.controller";
import { PortalPedidosAjudaService } from "./portal-pedidos-ajuda.service";
import { PortalLeitorService } from "./portal-leitor.service";
import { PortalPendenciasController } from "./portal-pendencias.controller";
import { PortalPendenciasService } from "./portal-pendencias.service";
import { PortalSessaoGuard } from "./portal-sessao.guard";
import { PortalTermoController } from "./portal-termo.controller";
import { PortalTermoService } from "./portal-termo.service";
import { PortalTrilhaService } from "./portal-trilha.service";
import { PortalVtController } from "./portal-vt.controller";
import { ReguaModule } from "../regua/regua.module";
import { VtLinkModule } from "../vt-coleta/vt-link.module";

/**
 * Portal do Candidato, caminho do arquivo.
 *
 * NENHUMA DEPENDÊNCIA DE `AiModule` AQUI, e a ausência é desenho: quem lê o arquivo é a SEGUNDA
 * instância do `ai-service`, com ambiente magro, usuário de sistema próprio e sem credencial de
 * banco (exigência 4). Ligar o portal ao `AiModule` de hoje colocaria o processo que abre arquivo
 * hostil ao lado das chaves da casa, que foi justamente o achado da auditoria.
 *
 * O EMISSOR É A PEÇA NOVA, e ele substitui a chave privada que assinava a URL dentro deste
 * processo. `PortalEmissorService` é o único ponto por onde o EA fala com quem assina, e o
 * `PortalArmazenamentoService` passou a depender dele em vez de carregar credencial de conta de
 * serviço. Nenhuma chave do Google vive mais neste módulo: o que vive é a chave Ed25519 que cunha o
 * BILHETE, e ela não assina URL nenhuma.
 *
 * O MÓDULO SOBE INERTE. Sem `PORTAL_GCS_BUCKET`, sem `PORTAL_EMISSOR_URL`, sem a chave do bilhete,
 * sem `PORTAL_LOG_PEPPER` e sem a chave pública da sessão, nada aqui lança no boot: as rotas
 * simplesmente se recusam a conceder. O balde ainda não existe, e o EA não pode deixar de subir por
 * causa disso.
 */
@Module({
  // `ReguaModule` entra pelo GERENCIADOR, e é a única dependência nova: o painel precisa saber
  // quantos obrigatórios existem e quantos foram aceitos, e esse número tem UM dono
  // (`ReguaCompletudeService`, §A.19). Recontar dentro do portal seria a segunda verdade sobre a
  // régua, que é exatamente a divergência que aquele serviço foi extraído para eliminar.
  // `VtLinkModule` entra pela PONTE DO VT, e o alcance dele é UM provider, `VtLinkService`. A
  // frase é conferível, não é promessa: no Nest, importar um módulo torna injetável TUDO que ele
  // EXPORTA, e o `VtLinkModule` exporta uma coisa só. Foi exatamente para poder dizer isto sem
  // mentir que o emissor saiu dos providers do `VtColetaModule` (que exporta também o scheduler
  // da coleta, o `SolicitacaoVtService`, dono da escrita em `solicitacoes_vt`, e os órfãos):
  // importar o módulo grande teria posto os três ao alcance do caminho PÚBLICO do candidato. O
  // comentário equivalente em `as/as.module.ts` afirmou "UMA PORTA SÓ" quando eram três, e a
  // auditoria pegou; aqui o número está na lista de `exports` do outro arquivo.
  // `portal-so-uma-porta-do-vt.tester.spec.ts` trava as duas metades (o módulo exporta um só, e
  // o portal não alcança os outros serviços da coleta).
  imports: [ConfigModule, ReguaModule, VtLinkModule],
  // DUAS CONTROLLERS, DOIS PÚBLICOS. `PortalController` é do CANDIDATO (`@Public()` + guard de
  // sessão, na allowlist da barreira); `PortalPendenciasController` é do TIME (autenticado, sob
  // `esteira/`, jamais alcançável de fora). Ver o cabeçalho de cada uma.
  // TRÊS CONTROLLERS. `PortalDocumentosController` é a LEITURA do candidato (mesma dupla
  // `@Public()` + guard de sessão do `PortalController`, e também na allowlist da barreira). Fica
  // em arquivo próprio porque é a única rota do portal que DEVOLVE dado, e o que vale para ela
  // (cabeçalho de cache, ausência de parâmetro de admissão) não vale para as de escrita.
  // QUATRO CONTROLLERS. `PortalLinksController` é a EMISSÃO e a REVOGAÇÃO do link, do TIME:
  // autenticada, sem `@Public()`, governada por menu (§A.23). Ela mora sob `portal/links`, e a
  // allowlist da barreira é POR CAMINHO justamente para que ela não seja alcançável de fora.
  // CINCO CONTROLLERS. `PortalPainelController` é o GERENCIADOR, do time: autenticado e sob
  // `esteira/`, jamais sob `portal/`. Ela devolve a lista NOMINAL de candidatos, então uma
  // allowlist de barreira escrita por prefixo a exporia como enumerador pronto. Ver o cabeçalho.
  // SEIS CONTROLLERS. `PortalEnvioController` é o ENVIO do link, leitura E escrita: a prévia
  // nominal, a busca de admissão sem link e o disparo manual. Ela é classe nova porque o caminho
  // do contrato (`esteira/portal/envio/*`) não cabe no prefixo do painel, e por ser classe nova
  // ela PRECISOU ser reivindicada explicitamente pelo menu `portal-links` em `domain/menus.ts`: o
  // `MenuGuard` indexa por `Controller.handler`, e o coringa das irmãs não alcança classe nova.
  // O DISPARO ESTEVE DENTRO DO `PortalLinksController` e saiu de lá: aquela classe mora sob
  // `portal/`, o prefixo que a barreira allowlista para a internet, e rota que emite E entrega
  // credencial não pode morar ali (S10). Reivindicação nominal resolve a S12 sem o prefixo errado.
  // SETE CONTROLLERS. `PortalVtController` é a PONTE PARA O FORMULÁRIO DE VT, do candidato:
  // mesma dupla `@Public()` + guard de sessão das outras rotas dele, sob `portal/`, e também na
  // allowlist da barreira. Ela devolve um link cujo token viaja em QUERY STRING, ao contrário do
  // resto do portal, e o cabeçalho da classe explica em voz alta por que isso é assim e o que
  // foi feito a respeito (§A.6).
  // OITO CONTROLLERS. `PortalDadosGiController` é a GRAVAÇÃO dos dados do GI que o candidato validou
  // (Portal→GI, peça 2): mesma dupla `@Public()` + `PortalSessaoGuard` das outras rotas do
  // candidato, sob `portal/`, e também na allowlist da barreira (por CAMINHO). Ela RECEBE PII do
  // candidato e grava em `admissao_dados_gi`; o cabeçalho da classe e o serviço explicam as travas.
  // NOVE CONTROLLERS. `PortalTermoController` é a GRAVAÇÃO do aceite do termo de privacidade (bug
  // 1): mesma dupla `@Public()` + `PortalSessaoGuard` das outras rotas do candidato, sob `portal/`,
  // e também na allowlist da barreira (por CAMINHO). PII-free: grava só admissão + carimbo + jti.
  controllers: [
    PortalController,
    PortalDocumentosController,
    PortalDadosGiController,
    PortalTermoController,
    PortalVtController,
    PortalEnvioController,
    PortalLinksController,
    PortalPainelController,
    // DEZ CONTROLLERS. `PortalPedidosAjudaController` é a LEITURA dos pedidos de ajuda para entrar
    // (evento `PORTAL_RECUPERACAO_SOLICITADA` agregado por link), do TIME: autenticada e sob
    // `esteira/`, jamais sob `portal/`, pelo mesmo motivo do painel (a resposta é NOMINAL). Classe
    // nova, então reivindicada NOMINALMENTE pelo menu `portal-links` em `domain/menus.ts`: o coringa
    // das irmãs não a alcança, e operação que nenhum menu reivindica passa livre pelo `MenuGuard`.
    PortalPedidosAjudaController,
    PortalPendenciasController,
  ],
  providers: [
    PortalArmazenamentoService,
    // O CORREIO é o primeiro emissor de e-mail do EA, e ele NASCE INERTE: sem a conta de serviço,
    // a chave e a caixa remetente, `configurado()` diz não e o envio RECUSA sem emitir link. O
    // escopo `gmail.send` e a caixa delegada são destrave do diretor.
    PortalCorreioService,
    PortalCredencialService,
    // GRAVAÇÃO dos dados do GI validados pelo candidato (peça 2). Escreve `admissao_dados_gi` e o
    // rastro PII-free do aceite; é o único ponto de escrita dessa tabela pelo candidato.
    PortalDadosGiService,
    PortalDocumentosService,
    PortalEmissorService,
    // O ENVIO só ORQUESTRA: toda escrita em `portal_links` continua sendo do
    // `PortalIdentidadeService`, e é isso que mantém a lista de pontos de escrita enumerável.
    PortalEnvioService,
    PortalIdentidadeService,
    PortalLeitorService,
    // A PERGUNTA "O LINK AINDA ESTÁ VIVO?", INJETÁVEL. Ela nasceu de um veto: a ponte do VT
    // cunhava um token IRREVOGÁVEL, com CPF dentro, sem nunca olhar a linha do link. O veredito
    // continua sendo `estadoDaLinha`, do domínio, e a projeção continua sendo `COLUNAS_DO_LINK`:
    // este provider não tem régua própria, só põe a mesma pergunta ao alcance de quem precisar.
    PortalLinkVivoService,
    PortalPainelService,
    // A LEITURA dos pedidos de ajuda para entrar. Serviço PRÓPRIO, e não um método do painel, porque
    // o painel tem condição travada em teste de NÃO ler `portal_eventos` (o contador dele é carimbo
    // na linha), e esta leitura existe justamente para ler a trilha.
    PortalPedidosAjudaService,
    PortalTrilhaService,
    PortalPendenciasService,
    PortalSessaoGuard,
    // GRAVAÇÃO do aceite do termo de privacidade (bug 1). Escreve `portal_termo_aceite` (PII-free,
    // sem TTL); é o único ponto de escrita dessa tabela.
    PortalTermoService,
  ],
  // `PortalEnvioService` é EXPORTADO porque o gancho do caminho automático mora em `as/`: é o
  // ramo de `ENVIADO_PARA_ADMISSAO` de `registrarSaida` que dispara o envio, e é a reversão dele
  // que revoga o link. Ver o comentário da importação em `as/as.module.ts`.
  exports: [PortalTrilhaService, PortalIdentidadeService, PortalEnvioService],
})
export class PortalModule {}
