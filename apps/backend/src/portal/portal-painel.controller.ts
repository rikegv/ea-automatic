import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { parseMulti } from "../common/parse-multi";
import { PortalPainelService } from "./portal-painel.service";

/**
 * PARÂMETRO REPETIDO CHEGA COMO ARRAY, e o tipo declarado não impede isso em tempo de execução.
 *
 * `?nome=a&nome=b` vira `["a","b"]` no Express, e aí qualquer `.trim()` ou `.split()` lança um
 * `TypeError` dentro do serviço: 500 em rota autenticada, causado por entrada do cliente. É a
 * mesma família do achado L1 (a página absurda que estourava o `OFFSET`), e a direção segura é a
 * mesma: normalizar na borda, ficando com a ÚLTIMA ocorrência, em vez de tratar erro de driver.
 */
function umSo(valor?: string | string[]): string | undefined {
  if (Array.isArray(valor)) return valor.length ? String(valor[valor.length - 1]) : undefined;
  return valor;
}

/**
 * O GERENCIADOR DO PORTAL: o funil da coleta e a lista de onde cada candidato está.
 *
 * ══ POR QUE ELA NÃO NASCE SOB `portal/`, E ISSO JÁ FOI DECIDIDO UMA VEZ ════════════════════════
 *
 * `portal-pendencias.controller.ts` tirou as rotas internas de `portal/` porque uma allowlist de
 * barreira escrita POR PREFIXO (em vez de por caminho) exporia ao mundo a porta interna. Lá o erro
 * exporia dois POST que ainda exigiriam adivinhar dois UUID. AQUI ele exporia **um GET com a lista
 * NOMINAL de candidatos**, com cargo, cliente, em que documento cada um está e o estado do link de
 * cada um: o enumerador pronto, sem precisar adivinhar nada. Por isso esta controller mora sob
 * `esteira/`, que é território autenticado, ao lado das rotas de auditoria que o mesmo time usa.
 *
 * ══ AS OPERAÇÕES SÃO REIVINDICADAS POR MENU, E SEM ISSO A ROTA FICA ABERTA ═════════════════════
 *
 * Não há `@Roles` aqui (acompanhar a coleta é trabalho de consultor, como emitir o link), então
 * quem governa é o MENU. O coringa `PortalLinksController.*` do menu `portal-links` NÃO alcança
 * classe nova: operação que nenhum menu reivindica passa LIVRE pelo `MenuGuard`. O registro está em
 * `domain/menus.ts`, no mesmo menu `portal-links`, e o teste `portal-painel.spec.ts` trava isso.
 *
 * ══ §A.6, O QUE ESTA RESPOSTA NÃO CARREGA ══════════════════════════════════════════════════════
 *
 * Sem IP (em claro ou hasheado), sem `ua_hash`, sem geografia, sem contagem de tentativa falha e
 * sem listagem de evento: isso é a Sala De Segurança, de Master e Super Admin. Sem busca por CPF.
 * Do bloqueio sai só o binário `SUSPENSO`, sem número e sem data de fim.
 */
@Controller("esteira/portal-painel")
export class PortalPainelController {
  constructor(private readonly painel: PortalPainelService) {}

  /**
   * Os cinco contadores do funil, sobre TODO o recorte (não sobre a página).
   *
   * `Cache-Control: no-store, private`, o mesmo de `portal-documentos.controller.ts`: a resposta
   * atravessa o proxy do Next, e nem ele nem o disco do navegador guardam o retrato da coleta.
   */
  @Get("contadores")
  contadores(@Res({ passthrough: true }) res: Response) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.painel.resumo();
  }

  /**
   * O CATÁLOGO DOS FILTROS (§A.37), servido por ENDPOINT e não derivado das linhas da página.
   *
   * Derivar as opções do que já foi carregado encolhe a lista assim que o primeiro valor é
   * escolhido, e aí não há como somar o segundo sem limpar o filtro. Aqui as opções saem do
   * RECORTE do painel, que é o mesmo universo dos contadores.
   */
  @Get("filtros")
  filtros(@Res({ passthrough: true }) res: Response) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.painel.catalogoDeFiltros();
  }

  /**
   * A lista, paginada com TETO NO SERVIDOR (`domain/portal-painel.ts`) e recortada pela ABA.
   *
   * TODO FILTRO DE LISTA É MÚLTIPLO (§A.28), pelo mesmo `parseMulti` que a Esteira usa: o
   * parâmetro aceita repetição e vírgula, e a cláusula vira `IN`. `nome` é BUSCA por pedaço, não
   * filtro de lista, e é a ÚNICA caixa de texto desta tela: busca por CPF é o oráculo de
   * existência que a identificação do candidato fecha desde o primeiro dia (§A.6).
   *
   * ┌─ `recorte` É O CARD CLICADO, E ELE É DO SERVIDOR DESDE ESTA RODADA ─────────────────────────┐
   * │ Ele não é filtro de lista: é UM valor, os cinco cards são mutuamente exclusivos na tela, e  │
   * │ vazio é "todos". Ele ATRAVESSA A ABA de propósito (decisão do diretor): com card, o recorte │
   * │ varre os encaminhados vivos inteiros, finalizados incluídos.                                │
   * │                                                                                             │
   * │ Antes ele era filtro de tela sobre a página, e isso produzia dois defeitos: a tabela zerava │
   * │ ao clicar num card cujos candidatos estavam na outra aba, e, passados 100 encaminhados, o   │
   * │ card passaria a recortar só a primeira página, mentindo em silêncio (§A.28). Resolvido no   │
   * │ servidor, o `total` da paginação passa a refletir o recorte, que é o que faz a tela paginar │
   * │ sobre o mesmo número que exibe.                                                             │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * CONTINUA SEM PARÂMETRO DE ADMISSÃO, nem opcional, nem para depuração: quem entra na lista é o
   * recorte do servidor (admissão viva COM link emitido), e um id escolhido pelo chamador
   * transformaria a tela de acompanhamento em consulta dirigida a qualquer admissão da base. Os
   * filtros abaixo RECORTAM o que o servidor já decidiu mostrar; nenhum deles ESCOLHE uma linha.
   */
  @Get("candidatos")
  candidatos(
    @Res({ passthrough: true }) res: Response,
    @Query("pagina") pagina?: string | string[],
    @Query("tamanho") tamanho?: string | string[],
    @Query("aba") aba?: string | string[],
    @Query("nome") nome?: string | string[],
    @Query("clientes") clientes?: string | string[],
    @Query("cargos") cargos?: string | string[],
    @Query("documentos") documentos?: string | string[],
    @Query("situacoes") situacoes?: string | string[],
    @Query("estadosLink") estadosLink?: string | string[],
    @Query("origens") origens?: string | string[],
    @Query("recorte") recorte?: string | string[],
    @Query("ultimoAcessoDe") ultimoAcessoDe?: string | string[],
    @Query("ultimoAcessoAte") ultimoAcessoAte?: string | string[],
    @Query("dataAdmissaoDe") dataAdmissaoDe?: string | string[],
    @Query("dataAdmissaoAte") dataAdmissaoAte?: string | string[],
  ) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.painel.listar({
      // Página e tamanho seguem crus: `recorteDaPagina` já normaliza lixo, inclusive array.
      pagina: pagina as string,
      tamanho: tamanho as string,
      aba: umSo(aba),
      nome: umSo(nome),
      clientes: parseMulti(umSo(clientes)),
      cargos: parseMulti(umSo(cargos)),
      documentos: parseMulti(umSo(documentos)),
      situacoes: parseMulti(umSo(situacoes)),
      estadosLink: parseMulti(umSo(estadosLink)),
      origens: parseMulti(umSo(origens)),
      // O CARD é UM só, e não lista: os cinco cards são mutuamente exclusivos na tela (clicar num
      // troca o recorte, não soma). Passá-lo por `parseMulti` sugeriria uma soma que a régua do
      // card não tem, e "acessaram + concluiram" não é pergunta que o funil responda.
      recorte: umSo(recorte),
      ultimoAcessoDe: umSo(ultimoAcessoDe),
      ultimoAcessoAte: umSo(ultimoAcessoAte),
      dataAdmissaoDe: umSo(dataAdmissaoDe),
      dataAdmissaoAte: umSo(dataAdmissaoAte),
    });
  }
}
