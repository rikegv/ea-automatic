import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/auth.types";
import { parseMulti } from "../common/parse-multi";
import { gerarXlsxGenerico, type LinhaRelatorio } from "../admissoes/relatorio-export";
import { DestravarAcessoDto } from "./portal-acesso-email.dto";
import { PortalAcessoEmailService } from "./portal-acesso-email.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { PortalPainelService } from "./portal-painel.service";
import {
  COLUNAS_RELATORIO_PORTAL,
  montarLinhaRelatorioPortal,
  precisaResolverLink,
} from "./portal-relatorio";

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
  constructor(
    private readonly painel: PortalPainelService,
    /**
     * A FILA DE TRAVAS DA PORTA DE E-MAIL ENTRA NESTA CLASSE, E NÃO EM UMA NOVA, e a razão é dupla
     * (contrato v2, seção 6):
     *  - esta classe está FORA do prefixo `portal/` que a barreira allowlista, o que é obrigatório
     *    para rota do TIME (o destrave desfaz uma proteção, e não pode ser alcançável de fora);
     *  - ela já é reivindicada POR NOME pelo menu `portal-links`, pelo coringa
     *    `PortalPainelController.*`, cuja restrição é `NENHUMA`, logo concedível a qualquer usuário,
     *    que é exatamente o que o diretor pediu para o destrave.
     *
     * CLASSE NOVA NASCERIA FAIL-OPEN, e isto é medido, não temido: o `MenuGuard` indexa por
     * `Controller.handler` e passa LIVRE por operação que nenhum menu reivindica. Uma controller
     * nova, sem `@Roles` (que é o que o diretor pediu), ficaria ABERTA a qualquer usuário
     * autenticado até alguém lembrar de reivindicá-la em `domain/menus.ts`, arquivo que outra sessão
     * está reescrevendo agora. Pendurando aqui, a cobertura já existe e nada precisa ser tocado lá.
     */
    private readonly acesso: PortalAcessoEmailService,
    /**
     * A EMISSÃO DO LINK (ação de COPIAR), reusada pela exportação em Excel (OST das ondas, Onda 2b):
     * o relatório resolve, por candidato VIVO, o MESMO link que o botão de copiar devolve, sem cunhar
     * link novo nem revogar nada. Mesmo serviço, mesma régua do diretor ("sempre o link vivo").
     */
    private readonly identidade: PortalIdentidadeService,
  ) {}

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

  /**
   * EXPORTAÇÃO EM EXCEL do Gerenciador do Portal (OST das ondas, Onda 2b). Mesmos filtros da lista
   * (sem paginação: leva TODO o recorte), com uma coluna a mais que as outras telas não têm: o LINK
   * VIVO de acesso de cada candidato, para envio em massa por WhatsApp.
   *
   * A REGRA PERMANENTE DO DIRETOR (link sempre vivo, NUNCA gerar link novo à toa) é cumprida aqui
   * assim: só as linhas cujo estado é VIVO têm o link resolvido, e para elas `emitirLinkParaCopiar`
   * REAPROVEITA o link existente (não cunha, não revoga, não grava trilha, é um não-evento). Linhas
   * sem link vivo recebem uma nota na célula e nenhum link é criado.
   *
   * §A.6: o arquivo carrega credencial (as URLs vivas), então vai pelo mesmo caminho de download
   * autenticado do botão de copiar, com `Cache-Control: no-store, private`; nada é logado nem
   * persistido aqui. Governada pelo menu `portal-links` (coringa `PortalPainelController.*`), como as
   * demais operações desta classe.
   */
  @Get("candidatos/relatorio")
  async candidatosRelatorio(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
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
  ): Promise<StreamableFile> {
    const linhas = await this.painel.todasAsLinhasParaRelatorio({
      aba: umSo(aba),
      nome: umSo(nome),
      clientes: parseMulti(umSo(clientes)),
      cargos: parseMulti(umSo(cargos)),
      documentos: parseMulti(umSo(documentos)),
      situacoes: parseMulti(umSo(situacoes)),
      estadosLink: parseMulti(umSo(estadosLink)),
      origens: parseMulti(umSo(origens)),
      recorte: umSo(recorte),
      ultimoAcessoDe: umSo(ultimoAcessoDe),
      ultimoAcessoAte: umSo(ultimoAcessoAte),
      dataAdmissaoDe: umSo(dataAdmissaoDe),
      dataAdmissaoAte: umSo(dataAdmissaoAte),
    });

    // LINK POR CANDIDATO: só para quem está VIVO, reaproveitando o link existente (não cunha nada).
    // Falha de emissão de uma linha não derruba o relatório: aquela célula fica sem link.
    const linhasXlsx: LinhaRelatorio[] = [];
    for (const l of linhas) {
      let url: string | null = null;
      if (precisaResolverLink(l)) {
        try {
          const emissao = await this.identidade.emitirLinkParaCopiar(l.admissaoId, user.id);
          // `reutilizado: true` = o link já existia e foi devolvido sem cunhar nem revogar. Só esse
          // caso vira URL no arquivo; qualquer outro (nada a reaproveitar) deixa a célula sem link.
          if (emissao.emitido?.reutilizado) url = emissao.emitido.link;
        } catch {
          // deixa a célula sem link; o consultor gera na tela pelo botão de copiar.
        }
      }
      linhasXlsx.push(montarLinhaRelatorioPortal(l, url));
    }

    const buffer = await gerarXlsxGenerico(
      "Gerenciador do Portal",
      COLUNAS_RELATORIO_PORTAL,
      linhasXlsx,
    );
    const a = new Date();
    const d2 = (n: number) => String(n).padStart(2, "0");
    const nomeArquivo = `gerenciador-portal-${a.getFullYear()}-${d2(a.getMonth() + 1)}-${d2(a.getDate())}.xlsx`;
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store, private",
    });
    return new StreamableFile(buffer);
  }

  // ══ A FILA DE TRAVAS DA PORTA DE E-MAIL (contrato v2, seção 6) ══════════════════════════════

  /**
   * A FILA: as travas de divergência da porta de e-mail, abertas primeiro.
   *
   * SEM `@Roles`, como o resto da classe: acompanhar e destravar é trabalho de consultor, e quem
   * governa é o MENU (`portal-links`, restrição `NENHUMA`), que já reivindica esta classe pelo
   * coringa. Ver o bloco do construtor.
   *
   * §A.6, O QUE ESTA RESPOSTA NÃO CARREGA: sem CPF, sem e-mail, sem data de nascimento, sem valor
   * informado e sem campo divergente. Sai o NOME, que é dado que o time já vê na Central de
   * Candidatos, e sem ele a fila não teria como dizer de quem está falando.
   *
   * `Cache-Control: no-store, private`, o mesmo das irmãs: a resposta atravessa o proxy do Next, e
   * nem ele nem o disco do navegador guardam a lista nominal.
   */
  @Get("travas")
  travas(
    @Res({ passthrough: true }) res: Response,
    @Query("motivos") motivos?: string | string[],
    @Query("situacao") situacao?: string | string[],
    @Query("nome") nome?: string | string[],
  ) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.acesso.listarTravas({
      // TODO FILTRO DE LISTA É MÚLTIPLO (§A.28), pelo MESMO `parseMulti` que a Esteira e o painel
      // usam: o parâmetro aceita repetição e vírgula, e a cláusula vira `IN`.
      motivos: parseMulti(umSo(motivos)),
      // `situacao` é UM valor: `ABERTA` e `DESTRAVADA` são o complemento exato uma da outra, e
      // somá-las é o mesmo que não filtrar. Vazio é "todas".
      situacao: umSo(situacao),
      nome: umSo(nome),
    });
  }

  /**
   * O CATÁLOGO DOS FILTROS DA FILA, por ENDPOINT e não derivado das linhas carregadas (§A.37).
   *
   * Derivar as opções da página encolhe a lista assim que o primeiro valor é escolhido, e aí não há
   * como somar o segundo sem limpar o filtro. Aqui as opções são o catálogo FECHADO do contrato, que
   * não depende de haver linha.
   */
  @Get("travas/filtros")
  filtrosDeTravas(@Res({ passthrough: true }) res: Response) {
    res.set({ "Cache-Control": "no-store, private" });
    return this.acesso.catalogoDeFiltrosDeTravas();
  }

  /**
   * DESTRAVA uma linha da fila. IDEMPOTENTE, e a tentativa RECUSADA também vira linha de trilha.
   *
   * O AUTOR VEM DA SESSÃO (`@CurrentUser`) E NUNCA DO CORPO: autor vindo do corpo é autor escolhido
   * por quem age, ou seja, trilha que o próprio ator escreve. É a régua da seção 7 do contrato, e a
   * mesma de `PORTAL_TETO_DESTRAVADO`.
   *
   * O CORPO LEVA SÓ `motivoCodigo`, de catálogo FECHADO e sem texto livre, e o serviço exige que ele
   * seja o MESMO motivo da linha: o gesto é de RECONHECIMENTO do que está sendo desfeito, e não um
   * botão que se aperta sem olhar. Ver o bloco de `destravar` no serviço.
   */
  @Post("travas/:id/destravar")
  destravarAcesso(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DestravarAcessoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acesso.destravar(id, dto.motivoCodigo, user);
  }
}
