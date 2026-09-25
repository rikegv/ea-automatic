import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { PortalEnvioService } from "./portal-envio.service";

/**
 * O ENVIO DO LINK DO PORTAL: as duas LEITURAS (prévia nominal e busca de admissão sem link) e a
 * ESCRITA (o disparo manual do RH). Tudo do envio mora aqui, e em nenhuma outra classe.
 *
 * ══ POR QUE ELA NÃO NASCE SOB `portal/` (exigência S10) ════════════════════════════════════════
 *
 * Mesma decisão já tomada duas vezes na casa, em `portal-pendencias.controller.ts` e em
 * `portal-painel.controller.ts`: `portal/` é o prefixo que a BARREIRA do Fernando vai allowlistar
 * para o candidato na internet, e uma allowlist escrita por PREFIXO em vez de por caminho exporia
 * ao mundo a porta interna. O que as leituras devolvem já é o pior caso desse erro (LISTA NOMINAL
 * de candidatos, com o destino de cada um, um enumerador pronto sem precisar adivinhar UUID), e a
 * ESCRITA é pior ainda: ela EMITE E ENTREGA, por e-mail, uma credencial de acesso ao prontuário,
 * sem que quem a dispara precise sequer ver a URL que fabricou.
 *
 * ┌─ A ESCRITA VEIO DE `portal/links/*`, E A MUDANÇA FOI POR CAUSA DISSO ────────────────────────┐
 * │ O disparo nasceu dentro do `PortalLinksController` para herdar o coringa do menu (S12), e um │
 * │ teste independente mostrou o preço: aquela classe mora em `portal/links`, exatamente o       │
 * │ prefixo que a S10 manda evitar. As duas exigências parecem se contradizer, e não se          │
 * │ contradizem: a S12 não pede a classe velha, pede que o menu REIVINDIQUE a operação. Classe   │
 * │ própria sob `esteira/`, citada NOMINALMENTE no menu, cumpre as duas de uma vez.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ A REIVINDICAÇÃO NOMINAL É OBRIGATÓRIA (exigência S12) ══════════════════════════════════════
 *
 * `domain/menus.ts`, menu `portal-links`, `operacoes: [..., "PortalEnvioController.*"]`. O índice
 * do `MenuGuard` é por `Controller.handler`, e operação que NENHUM menu reivindica passa LIVRE.
 * Sem aquela linha, qualquer sessão autenticada leria nome e destino de candidato por aqui, e
 * DISPARARIA o e-mail com a credencial dentro. Há teste travando isso (`portal-envio-rbac`).
 *
 * ══ §A.6, O QUE ESTAS RESPOSTAS NÃO CARREGAM ══════════════════════════════════════════════════
 *
 * NENHUM E-MAIL EM CLARO: o destino volta MASCARADO (`f****o@empresa.com`), derivado na hora do
 * cadastro. Nenhum CPF, nem projetado nem buscável: a busca é por NOME, pela mesma razão da lista
 * do painel (busca por CPF é o oráculo de existência que a identificação do candidato fecha desde
 * o primeiro dia). E nenhuma URL de link, que é credencial.
 *
 * SEM `?admissaoId=` nas leituras, nem opcional, nem para depuração, pela mesma razão que o
 * `PortalPainelController` o recusa: quem entra na lista é o RECORTE que o servidor decide, e não
 * um id escolhido pelo chamador. Um parâmetro desses transformaria a busca numa consulta dirigida
 * a qualquer admissão da base.
 */
@Controller("esteira/portal/envio")
export class PortalEnvioController {
  constructor(private readonly envio: PortalEnvioService) {}

  /**
   * A PRÉVIA DO LOTE: nome e destino MASCARADO por pessoa, e quem fica de fora vem marcado.
   *
   * É a condição que a auditoria pôs para liberar o disparo em massa. Sem ela, "confirmar uma vez,
   * enviar N" tira o humano de N entregas de credencial de acesso a prontuário.
   *
   * ELA É LEITURA, E CONTINUA SENDO: quem dispara o lote é a saída em massa do funil, pelo gancho
   * de `registrarSaida`. Esta rota só mostra à tela quem vai receber, ANTES de o consultor
   * confirmar a saída.
   *
   * A LISTA DE IDS USA O MESMO `parseMulti` da Esteira e do painel do Portal, e não um segundo
   * separador: o parâmetro aceita repetição e vírgula, exatamente como todo filtro múltiplo do
   * sistema (§A.28). Um separador próprio aqui seria a segunda régua de uma coisa que já tem uma.
   *
   * `Cache-Control: no-store, private`, o mesmo das outras leituras do Portal: a resposta atravessa
   * o proxy do Next, e nem ele nem o disco do navegador guardam a lista nominal.
   */
  @Get("previa")
  previa(
    @Res({ passthrough: true }) res: Response,
    @Query("candidaturas") candidaturas?: string | string[],
  ) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.envio.previaDeCandidaturas(parseMulti(umSo(candidaturas)) ?? []);
  }

  /**
   * ADMISSÃO VIVA QUE AINDA NÃO TEM LINK NENHUM. É a porta que faltava para o caminho manual.
   *
   * A lista do Gerenciador sai de `from(portal_links)`, ou seja, só mostra quem JÁ tem link, e a
   * emissão só é clicável a partir de uma linha dela. Não havia, em tela nenhuma, por onde nascer
   * o PRIMEIRO link de uma admissão.
   *
   * ELA EXIGE UM TERMO DE BUSCA e tem TETO no servidor. Devolver "as primeiras N" com a caixa
   * vazia daria um enumerador de graça a qualquer sessão autenticada, que é o oposto do que o
   * recorte do painel faz questão de não ser.
   */
  @Get("sem-link")
  semLink(@Res({ passthrough: true }) res: Response, @Query("nome") nome?: string | string[]) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.envio.admissoesSemLink(umSo(nome));
  }

  /**
   * O DISPARO MANUAL, de UMA admissão. É o CAMINHO 2 da OST (o RH, pelo Gerenciador).
   *
   * ┌─ A ORIGEM É `MANUAL` POR CONSTRUÇÃO DA ROTA, E NÃO POR UM CAMPO DO CORPO ───────────────────┐
   * │ `origem` é o dado que responde ao item 4 da OST ("todo link aparece no Gerenciador,         │
   * │ INDEPENDENTE da origem"), e ele só vale alguma coisa se não puder ser escrito por quem      │
   * │ quiser. Havia um DTO aqui que aceitava a lista `["MANUAL"]`, e ele foi apagado: uma         │
   * │ allowlist de um item só é uma superfície de forjar origem que ainda não foi usada. Sem      │
   * │ corpo, não há o que validar nem o que forjar. O `AUTOMATICO` NUNCA chega por HTTP: quem o   │
   * │ carimba é o serviço, no gancho de `registrarSaida`.                                         │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: A URL NÃO VOLTA NESTA RESPOSTA, e a ausência é deliberada. A emissão crua
   * (`POST portal/links/:admissaoId`) devolve a URL porque quem a chama é quem vai entregá-la à
   * mão; aqui quem entrega é o correio, então devolver a credencial de novo seria espalhá-la sem
   * nenhum uso. O que volta é o desfecho, o destino MASCARADO e os prazos.
   *
   * `@CurrentUser()` é OBRIGATÓRIO: o carimbo do envio em `portal_links` guarda o AUTOR, e envio
   * sem autor é rastro pela metade, que não responde "quem".
   *
   * O SEGMENTO LITERAL `admissao/` vem do contrato que a tela já consome, e ele também separa esta
   * rota de qualquer caminho futuro de um segmento só sob o mesmo prefixo.
   *
   * ┌─ NÃO EXISTE ROTA DE LOTE AQUI, E A AUSÊNCIA É A DECISÃO ────────────────────────────────────┐
   * │ Ela existiu e foi APAGADA. O gancho do envio mora dentro do `registrarSaida` do A&S, e a    │
   * │ saída em massa que a tela já chama passa por ele PESSOA A PESSOA: o e-mail já sai por ali.  │
   * │ Uma rota de lote por cima seria um SEGUNDO disparo sobre as mesmas pessoas, e a segunda     │
   * │ emissão ainda mataria a sessão aberta pela primeira. O gancho é a PORTA ÚNICA do caminho    │
   * │ automático: um gesto, uma chamada, sem estado pela metade.                                  │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  @Post("admissao/:admissaoId")
  enviar(
    @Param("admissaoId", ParseUUIDPipe) admissaoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.envio.enviarParaAdmissao(admissaoId, user.id, "MANUAL");
  }
}

/**
 * PARÂMETRO REPETIDO CHEGA COMO ARRAY, e o tipo declarado não impede isso em tempo de execução.
 *
 * `?nome=a&nome=b` vira `["a","b"]` no Express, e aí qualquer `.trim()` dentro do serviço lança um
 * `TypeError`: 500 em rota autenticada, causado por entrada do cliente. Mesma normalização de
 * borda do `portal-painel.controller.ts`, e pela mesma razão: ficar com a ÚLTIMA ocorrência é
 * barato e previsível, tratar erro de driver não é.
 */
function umSo(valor?: string | string[]): string | undefined {
  if (Array.isArray(valor)) return valor.length ? String(valor[valor.length - 1]) : undefined;
  return valor;
}
