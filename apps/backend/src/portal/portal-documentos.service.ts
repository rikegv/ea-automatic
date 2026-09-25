import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type {
  ConferenciaDoPasso,
  EstadoPassoPortal,
  ExigenciaDocumento,
  PassoDaTrilhaPortal,
  TrilhaDoCandidato,
  VereditoDoDocumento,
} from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissaoDadosGi,
  admissoes,
  candidatos,
  cargos,
  clientes,
  dicasDocumento,
  documentosAdmissao,
  portalConferencia,
  portalTermoAceite,
  reguaDocumental,
  tiposDocumento,
} from "../db/schema";
import { CAMPOS_GI } from "../domain/dados-gi-campos";
import { LIMITES_PORTAL, TIPOS_ACEITOS_PORTAL } from "../domain/portal-credencial";
import { compararDocumentosDaTrilha } from "../domain/ordem-dos-documentos";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * A TRILHA DA SOL: a única leitura que a tela do candidato faz ao abrir o link.
 *
 * NOME DO ARQUIVO, e ele não é acidente: `portal-trilha.service.ts` já existe e é o LOG do portal.
 * "Trilha" aqui é o TABULEIRO do candidato, coisa diferente, então o arquivo se chama
 * `portal-documentos`. Os dois convivem neste módulo, e confundi-los seria confundir o que o
 * candidato vê com o que a auditoria grava.
 *
 * ┌─ A FONTE DOS PASSOS É `documentos_admissao`, NUNCA `regua_documental` ────────────────────────┐
 * │ MEDIDO na admissão de homologação conferida: a régua daquele par (cliente + cargo) tem 32      │
 * │ linhas e a admissão tem 14 documentos. A emissão de credencial (`portal-credencial.service`,   │
 * │ predicado `naRegua`) EXIGE a linha de `documentos_admissao` existir, e responde "Este          │
 * │ documento não faz parte da sua lista" quando ela não existe.                                   │
 * │                                                                                                │
 * │ Montar a trilha pela régua faria a tela desenhar 18 casas que a MESMA API recusa no toque,     │
 * │ logo depois de dizer que eram dela. É o defeito que a tela promete e a emissão nega, e ele já  │
 * │ foi pago uma vez no modal de auditoria da esteira (o comentário está lá, em                    │
 * │ `components/esteira/AuditoriaDocsModal.tsx`).                                                  │
 * │                                                                                                │
 * │ A RÉGUA ENTRA, mas só para UMA coisa: trazer a `exigencia` daquele tipo no par                 │
 * │ (cliente + cargo) da admissão. Documento sem linha de régua correspondente sai como            │
 * │ `NAO_OBRIGATORIO`, que é o mais fraco dos três: um documento que a régua não cobra não pode    │
 * │ aparecer para o candidato como obrigação.                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NADA DE CONTAGEM NOVA. Quantas tentativas restam e se a pendência já caiu para o time saem de
 * `PortalCredencialService.situacaoParaATela`, que já é o formato exato deste contrato. Já existem
 * DOIS leitores daquele número (a emissão e a tela do time); um terceiro seria a terceira verdade
 * sobre o número que TRANCA a pessoa fora do documento, e a divergência só apareceria no dia em que
 * ela estivesse errada.
 *
 * §A.6, o que esta resposta NÃO carrega, e a ausência é o desenho: CPF, nome completo, id de
 * admissão, id de tipo de documento e id de cargo. O nome é recortado no SQL, então o nome completo
 * sequer entra neste processo.
 */
/**
 * ══ O CONTRATO DA DICA, EM TIPO LOCAL ATÉ O COORDENADOR PUBLICÁ-LO ════════════════════════════
 *
 * `packages/shared-types/src/index.ts` tem DONO ÚNICO (§A.39), e não é este agente. Estes dois
 * tipos ESTENDEM os do contrato acrescentando `dica`, e somem no dia em que o campo entrar lá:
 * é trocar as duas anotações de volta para `PassoDaTrilhaPortal` e `TrilhaDoCandidato`.
 *
 * ┌─ POR QUE O TEXTO VIAJA JUNTO COM A TRILHA, E NÃO NUMA CHAMADA POR DOCUMENTO ────────────────┐
 * │ 1. UMA SUPERFÍCIE PÚBLICA A MENOS. A tela do candidato é pública, atrás da barreira do      │
 * │    Fernando e de um guard de sessão próprio; uma rota nova ali é caminho novo a allowlistar, │
 * │    a limitar por taxa e a auditar. O campo a mais na resposta que ele JÁ recebe não é        │
 * │    superfície nova.                                                                          │
 * │ 2. MINIMIZAÇÃO DE VERDADE (§A.6). Viajando na trilha, o candidato só recebe as dicas dos     │
 * │    documentos DA ADMISSÃO DELE. Uma rota por documento, mesmo autenticada pela sessão dele,  │
 * │    responderia por qualquer código do catálogo, e viraria a enumeração da configuração       │
 * │    interna a partir de fora.                                                                 │
 * │ 3. O CUSTO É PEQUENO E MEDIDO. A régua média tem 11 documentos e a maior 32, e a dica tem    │
 * │    teto de 1000 caracteres: o pior caso é da ordem de 30 KB, o típico fica em 2 KB, e é UMA  │
 * │    consulta a mais (um `leftJoin` na que já existe), não N. O caminho por documento custaria │
 * │    uma ida ao servidor no 4G no instante em que a pessoa está com o documento na mão.        │
 * │ 4. A TELA NÃO PRECISA DE UM "TEM DICA?" SEPARADO: a presença do texto É a resposta. Campo    │
 * │    nulo, sem ícone; campo preenchido, ícone e o texto já na mão.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface PassoDaTrilhaComDica extends PassoDaTrilhaPortal {
  /** O texto que o diretor escreveu para este TIPO, ou nulo quando não há dica ativa. */
  dica: string | null;
}

export interface TrilhaDoCandidatoComDica extends TrilhaDoCandidato {
  passos: PassoDaTrilhaComDica[];
}

@Injectable()
export class PortalDocumentosService {
  private readonly log = new Logger(PortalDocumentosService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly credenciais: PortalCredencialService,
    private readonly trilhaLog: PortalTrilhaService,
    /**
     * A PERGUNTA "O LINK AINDA ESTÁ VIVO?" MORA NUM LUGAR SÓ (`PortalLinkVivoService`).
     *
     * Este serviço tinha uma CÓPIA da leitura num método privado. Ela não divergia da outra (mesma
     * `estadoDaLinha`, mesma `COLUNAS_DO_LINK`), e o ponto da consolidação é que ela não POSSA
     * divergir amanhã: duas leituras com a mesma forma são duas manutenções, e a que for esquecida
     * é a porta que fica aberta em silêncio.
     */
    private readonly linkVivo: PortalLinkVivoService,
  ) {}

  /**
   * Monta a trilha da admissão do BILHETE. Um argumento só, e quem o preenche é o controller com o
   * `req.portal.admissaoId`: não existe porta para o id vir do cliente (ameaça A15 pela leitura).
   *
   * `contexto` tem valor padrão de propósito: ele serve só ao registro do evento (link e IP), não
   * decide nada, e mantendo-o opcional a assinatura continua sendo "recebe a admissão e devolve a
   * trilha".
   */
  async trilha(
    admissaoId: string,
    contexto: { jtiLink?: string | null; ip?: string | null } = {},
  ): Promise<TrilhaDoCandidatoComDica> {
    // A REVOGAÇÃO VALE PARA A LEITURA TAMBÉM, e este era o outro lado do mesmo furo. CONTINUA
    // SENDO O PRIMEIRO PASSO, antes de qualquer consulta ao prontuário: link morto não lê cabeçalho
    // nenhum. A frase é a MESMA do "não encontrado" desta rota (itens F9 e L6), e quem a escolhe é
    // esta porta, não o serviço compartilhado.
    await this.linkVivo.exigirVivo(contexto, "Lista de documentos indisponível");

    const cabecalho = await this.cabecalho(admissaoId);
    const passos = await this.passos(admissaoId, cabecalho.codCliente, cabecalho.cargoId);
    // O termo já foi aceito? (bug 1) E o que o candidato já confirmou do GI? (reidratar a tela sem
    // depender do estado React volátil). §A.6: `dadosGiConfirmados` é PII do próprio candidato,
    // viaja só na trilha (no-store, private), nunca a log.
    const termoAceito = await this.termoAceito(admissaoId);
    const dadosGiConfirmados = await this.dadosGiConfirmados(admissaoId);

    await this.registrarAbertura(contexto);

    return {
      primeiroNome: cabecalho.primeiroNome,
      cargo: cabecalho.cargo,
      cliente: cabecalho.cliente,
      passos,
      // Os limites vêm do domínio, nunca de número escrito à mão: é com eles que a tela recusa o
      // arquivo grande ANTES de gastar uma das 25 credenciais do link.
      limites: {
        bytesMaxArquivo: LIMITES_PORTAL.BYTES_MAX_ARQUIVO,
        tiposAceitos: [...TIPOS_ACEITOS_PORTAL],
      },
      termoAceito,
      dadosGiConfirmados,
    };
  }

  /**
   * O termo de privacidade já foi aceito nesta admissão? A tela pula BOAS_VINDAS quando `true`
   * (bug 1: o termo reaparecia por ser estado React não persistido). Uma linha por admissão
   * (`portal_termo_aceite`, unique): a existência dela É a resposta.
   */
  private async termoAceito(admissaoId: string): Promise<boolean> {
    const [linha] = await this.db
      .select({ id: portalTermoAceite.id })
      .from(portalTermoAceite)
      .where(eq(portalTermoAceite.admissaoId, admissaoId))
      .limit(1);
    return linha != null;
  }

  /**
   * Os dados que o candidato JÁ confirmou (de `admissao_dados_gi`), para a tela reidratar
   * `camposVistos` no reload. A chave `campo` é a do VOCABULÁRIO DA EXTRAÇÃO (a mesma que a tela
   * usou ao conferir), traduzida da coluna pelo catálogo `CAMPOS_GI`, para os dois lados falarem o
   * mesmo idioma. Só campos preenchidos entram.
   *
   * §A.6: PII do próprio candidato, devolvida só aqui, nunca em log. A leitura é filtrada pela
   * allowlist do `CAMPOS_GI`: coluna sem entrada no catálogo NÃO atravessa.
   */
  private async dadosGiConfirmados(
    admissaoId: string,
  ): Promise<{ campo: string; rotulo: string; valor: string }[]> {
    const [linha] = await this.db
      .select()
      .from(admissaoDadosGi)
      .where(eq(admissaoDadosGi.admissaoId, admissaoId))
      .limit(1);
    if (!linha) return [];
    const registro = linha as unknown as Record<string, unknown>;
    const confirmados: { campo: string; rotulo: string; valor: string }[] = [];
    for (const [campo, def] of Object.entries(CAMPOS_GI)) {
      const bruto = registro[def.coluna];
      const valor = typeof bruto === "string" ? bruto.trim() : "";
      // Valor CANÔNICO (ISO, como a IA leu e como o G.I grava). A formatação para `DD/MM/AAAA` é da
      // TELA (`CamposGi`), display-only: o backend nunca emite BR, para o valor confirmado não mudar.
      if (valor.length > 0) confirmados.push({ campo, rotulo: def.rotulo, valor });
    }
    return confirmados;
  }

  /**
   * Cabeçalho: primeiro nome, cargo e cliente.
   *
   * O RECORTE DO NOME ACONTECE NO SQL (`split_part`), e não em JavaScript: mandar o nome completo
   * para a camada de cima e cortá-lo depois é ter o nome completo em memória, em log de erro e a um
   * `console.log` de distância do JSON. Cortado na consulta, o sobrenome não chega a existir aqui.
   *
   * `cliente` é o `nome_operacao`, que é como a operação chama o cliente. Nunca `razao_social` e
   * nunca `cnpj`: o candidato não tem por que receber o CNPJ de ninguém, e a razão social é o nome
   * do contrato, não o do lugar onde ele vai trabalhar.
   */
  private async cabecalho(admissaoId: string) {
    const [linha] = await this.db
      .select({
        primeiroNome: sql<string>`split_part(btrim(${candidatos.nome}), ' ', 1)`,
        cargo: sql<string>`coalesce(${cargos.nome}, '')`,
        cliente: sql<string>`coalesce(${clientes.nomeOperacao}, '')`,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      // LEFT JOIN nos dois: a pré-admissão do Pandapé chega SEM cliente e sem cargo (as colunas são
      // nuláveis desde a Liberação Admissional), e a trilha não pode estourar por causa disso. Sem
      // cargo não há régua, então a lista sai vazia e a tela mostra o que tem.
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .where(eq(admissoes.id, admissaoId))
      .limit(1);

    // Mensagem única e sem detalhe: a rota é pública, e dizer "admissão inexistente" a diferencia de
    // "admissão de outro", que é exatamente o oráculo que a frente inteira evita.
    if (!linha) throw new NotFoundException("Lista de documentos indisponível");
    return linha;
  }

  /**
   * As casas do tabuleiro, uma por documento DA ADMISSÃO.
   *
   * A régua entra por LEFT JOIN, e o vínculo tem precedência sobre o cliente, mesma resolução de
   * `ReguaCompletudeService.docsRegua`: o mesmo tipo pode estar definido nos dois níveis, e sem o
   * desempate o documento apareceria duas vezes na lista do candidato.
   */
  private async passos(
    admissaoId: string,
    codCliente: string | null,
    cargoId: string | null,
  ): Promise<PassoDaTrilhaComDica[]> {
    const linhas = await this.db
      .select({
        tipoDocumentoId: documentosAdmissao.tipoDocumentoId,
        codigo: tiposDocumento.codigo,
        nome: tiposDocumento.nome,
        estadoDocumento: documentosAdmissao.estado,
        exigencia: reguaDocumental.exigencia,
        clienteVinculoId: reguaDocumental.clienteVinculoId,
        dica: dicasDocumento.texto,
        // A CONFERÊNCIA PERSISTIDA (bugs 4/5/6): os campos que a IA leu, o veredito redigido e o
        // carimbo de confirmação. `null` em todas quando não houve envio julgado (leftJoin sem par).
        conferenciaCampos: portalConferencia.campos,
        conferenciaVeredito: portalConferencia.veredito,
        conferenciaConfirmadoEm: portalConferencia.confirmadoEm,
        conferenciaId: portalConferencia.id,
      })
      .from(documentosAdmissao)
      // AS DUAS CONDIÇÕES SÃO AS MESMAS DA EMISSÃO (veto D-1), e a segunda não é zelo: a emissão
      // procura o tipo por `codigo` E `ativo = true` (`portal-credencial.service.ts`). O catálogo é
      // VIVO (§A.3) e `admin/tipos-documento` INATIVA por flag, sem apagar as linhas de
      // `documentos_admissao` que já existiam. Sem o predicado, o tipo inativado continuava
      // aparecendo como casa PENDENTE, o candidato tocava, levava 400 "Este documento não faz parte
      // da sua lista" e gravava um `PORTAL_CREDENCIAL_RECUSADA` por toque.
      .innerJoin(
        tiposDocumento,
        and(
          eq(tiposDocumento.id, documentosAdmissao.tipoDocumentoId),
          eq(tiposDocumento.ativo, true),
        ),
      )
      .leftJoin(
        reguaDocumental,
        and(
          eq(reguaDocumental.tipoDocumentoId, documentosAdmissao.tipoDocumentoId),
          codCliente ? eq(reguaDocumental.codCliente, codCliente) : sql`false`,
          cargoId ? eq(reguaDocumental.cargoId, cargoId) : sql`false`,
          sql`(${reguaDocumental.clienteVinculoId} is null or ${reguaDocumental.clienteVinculoId} = (select ${admissoes.clienteVinculoId} from ${admissoes} where ${admissoes.id} = ${admissaoId}))`,
        ),
      )
      /*
       * A DICA DO TIPO, NA MESMA CONSULTA (menu de Dicas). `leftJoin` porque a esmagadora maioria
       * dos tipos não tem dica nenhuma, e documento sem dica continua sendo uma casa normal.
       *
       * O PREDICADO `ativo` É PARTE DO JOIN, e não um filtro no `where`: no `where` ele
       * transformaria o `leftJoin` em `innerJoin` na prática, e os documentos SEM dica sumiriam da
       * trilha do candidato. É o modo clássico de perder linha num `left join`, e aqui o preço
       * seria a tela dele ficar sem os documentos que ele precisa enviar.
       *
       * DICA INATIVADA NÃO FALA COM O CANDIDATO, mas continua guardada (a inativação é soft, o
       * texto não se perde). TIPO inativado também não: o `innerJoin` de cima já exige
       * `tipos_documento.ativo`, então o documento inteiro nem chega aqui.
       */
      .leftJoin(
        dicasDocumento,
        and(
          eq(dicasDocumento.tipoDocumentoId, documentosAdmissao.tipoDocumentoId),
          eq(dicasDocumento.ativo, true),
        ),
      )
      /*
       * A CONFERÊNCIA PERSISTIDA, POR (admissão + tipo). `leftJoin` porque a maioria das casas ainda
       * não teve envio julgado, e casa sem conferência continua sendo uma casa normal (a chave do
       * join casa a admissão da trilha com o tipo do documento).
       *
       * DISPLAY-ONLY (C10): esta linha NÃO alimenta contagem de teto, gate de fase nem "cabe outro
       * arquivo". O número que TRANCA vem de `portal_credenciais.reprovado_em`, lido por
       * `situacoesParaATela`, e nunca é recontado daqui.
       */
      .leftJoin(
        portalConferencia,
        and(
          eq(portalConferencia.admissaoId, documentosAdmissao.admissaoId),
          eq(portalConferencia.tipoDocumentoId, documentosAdmissao.tipoDocumentoId),
        ),
      )
      .where(eq(documentosAdmissao.admissaoId, admissaoId));

    const porTipo = new Map<string, (typeof linhas)[number]>();
    for (const l of linhas) {
      const atual = porTipo.get(l.tipoDocumentoId);
      // Vínculo vence cliente (§A.3 regra 4 com a precedência da Onda 3).
      if (!atual || (l.clienteVinculoId !== null && atual.clienteVinculoId === null)) {
        porTipo.set(l.tipoDocumentoId, l);
      }
    }

    // O LOTE, UMA VEZ SÓ, E NÃO UMA CHAMADA POR CASA. A versão unitária são duas consultas cada, e
    // a régua média tem 11 documentos (a maior tem 32): a tela que o candidato abre no 4G custava
    // até 64 idas ao banco para responder à mesma pergunta. O DONO DO NÚMERO CONTINUA SENDO O
    // MESMO (`PortalCredencialService`), e a régua é literalmente a mesma: o unitário virou caso
    // particular do lote. Recontar aqui seria a terceira verdade sobre o número que TRANCA a
    // pessoa fora do documento.
    const situacoes = await this.credenciais.situacoesParaATela(admissaoId);

    const passos: PassoDaTrilhaComDica[] = [];
    for (const linha of porTipo.values()) {
      const tentativas = this.credenciais.situacaoDe(situacoes, linha.tipoDocumentoId);
      // A MESMA FONTE DA EMISSÃO, PERGUNTADA (veto D-2). O estado do documento não sabe se existe
      // arquivo nosso ainda sem desfecho; quem sabe é o dono do número.
      const cabeOutroArquivo = await this.credenciais.cabeOutroArquivoNaPendencia(
        admissaoId,
        linha.tipoDocumentoId,
      );
      // A conferência persistida daquela casa. Sem linha no leftJoin (`conferenciaId` nulo) -> null.
      const veredito = (linha.conferenciaVeredito ?? null) as VereditoDoDocumento | null;
      // Valor CANÔNICO (ISO). Estes campos são EDITÁVEIS e o que o candidato confirma é reenviado ao
      // G.I (`admissao_dados_gi`), então o backend NÃO reformata aqui: formatar a data no valor que
      // faz round-trip mudaria o dado do G.I. Quem exibe `DD/MM/AAAA` e re-canoniza no envio é a tela
      // (`CamposGi`), display-only. Veto do `seguranca` (round-trip para o G.I), recorte corrigido.
      const campos = linha.conferenciaCampos ?? [];
      // Há campos lidos aguardando a confirmação do candidato: veredito não reprovado, ainda não
      // confirmado, e há campos. É a MESMA condição de `aguardandoConfirmacao`, reusada como sinal do
      // estado da casa (§ AJUSTE 2, `AGUARDANDO_VALIDACAO`), para alinhar 1:1 com o `envio.fase ===
      // "conferir"` que a tela reidrata.
      const aguardandoValidacao =
        veredito?.valido !== false &&
        linha.conferenciaConfirmadoEm == null &&
        campos.length > 0;
      const temConferencia = linha.conferenciaId != null;
      const conferencia: ConferenciaDoPasso | null = temConferencia
        ? {
            campos,
            aguardandoConfirmacao: aguardandoValidacao,
            // Só o veredito REPROVADO viaja (é o que a tela mostra em "ajustar"); aprovado/nulo -> null.
            veredito: veredito?.valido === false ? veredito : null,
          }
        : null;
      // REPROVADO NO PORTAL (a cura do bug 3/6): a IA reprovou e ainda há tentativa. Sem este sinal,
      // o documento fica preso em `AGUARDANDO_AUDITORIA` -> EM_ANALISE e a casa de "ajustar" nunca
      // reabre. DISPLAY-ONLY: a decisão de "há tentativa" é de `tentativas` (dono do número que
      // tranca), não de `portal_conferencia`.
      const reprovadoNoPortal = veredito?.valido === false && tentativas.restantes > 0;
      passos.push({
        codigoTipoDocumento: linha.codigo,
        nome: linha.nome,
        // Documento sem linha de régua sai como o mais fraco dos três: ele existe na admissão, mas
        // ninguém o cobra, e apresentá-lo como obrigação inventaria exigência que a régua não fez.
        exigencia: (linha.exigencia ?? "NAO_OBRIGATORIO") as ExigenciaDocumento,
        estado: estadoDoPasso(
          linha.estadoDocumento,
          tentativas.noTime,
          cabeOutroArquivo,
          reprovadoNoPortal,
          aguardandoValidacao,
        ),
        tentativas,
        // §A.6: texto de CONFIGURAÇÃO escrito pelo diretor, não dado de pessoa. Ele já foi
        // sanitizado na ESCRITA (`DicasDocumentoService.sanitizar`), então o que sai daqui é o
        // texto limpo e com teto, e não o que alguém colou no formulário.
        dica: linha.dica ?? null,
        conferencia,
      });
    }

    return passos.sort(ordemDaTrilha);
  }

  /*
   * ══ A LEITURA DO LINK SAIU DAQUI, DE PROPÓSITO (consolidação, 21/09/2026) ═══════════════════
   *
   * O método privado `exigirLinkVivo` vivia aqui e fazia, palavra por palavra, o que
   * `PortalLinkVivoService.exigirVivo` faz: a mesma projeção (`COLUNAS_DO_LINK`), o mesmo veredito
   * (`estadoDaLinha`, do domínio), a mesma trilha não fail-closed e a mesma frase de recusa. As
   * duas nunca divergiram; a consolidação é para que não possam divergir amanhã.
   *
   * O QUE NÃO MUDOU, e é o contrato desta porta: a conferência continua sendo o PRIMEIRO passo de
   * `trilha`, a recusa continua sendo `NotFoundException("Lista de documentos indisponível")`, a
   * MESMA frase do "admissão não encontrada" (para que um link morto não descubra por aqui se a
   * admissão existe), e a recusa continua gravando `PORTAL_LINK_RECUSADO` sem derrubar a resposta
   * quando o log falha.
   *
   * A GARANTIA ESTRUTURAL MUDOU DE ARQUIVO JUNTO COM A RÉGUA: `portal-documentos.spec.ts` e
   * `portal-link-bloqueio.spec.ts` afirmavam sobre o TEXTO deste arquivo ("a leitura mora aqui, e
   * espalha a constante"); hoje afirmam o mesmo sobre `portal-link-vivo.service.ts`, e ainda
   * travam que este arquivo NÃO voltou a ter leitura própria. Nada foi afrouxado.
   */

  /**
   * O EVENTO DE ABERTURA, e ele NÃO é fail-closed, ao contrário da emissão.
   *
   * A emissão se recusa a conceder sem trilha configurada, porque conceder escrita sem registro é
   * escrita sem dono. LER A PRÓPRIA LISTA é o oposto: ninguém pode ficar sem ver os documentos que
   * precisa enviar porque uma variável de ambiente faltou no servidor. Por isso não há checagem de
   * `configurada()` aqui, e a chamada vai dentro de um `try`: `registrar` LANÇA quando falta o
   * `PORTAL_LOG_PEPPER` (a falta de pepper é a única falha que ele não engole sozinho).
   *
   * §A.6: nada de nome, cargo, cliente, código de documento ou contagem de casas. Vai o `jti` do
   * link e o IP pelo caminho de sempre, que já hasheia com sal mensal e manda o endereço completo
   * para a tabela restrita. A contagem de passos foi deliberadamente deixada de fora: ela não
   * atravessa a allowlist de `montarEventoPortal`, e alargar a allowlist para um número que ninguém
   * pediu seria mexer em código validado por conveniência (§A.14, §A.26).
   */
  private async registrarAbertura(contexto: { jtiLink?: string | null; ip?: string | null }) {
    try {
      await this.trilhaLog.registrar(
        "PORTAL_LINK_ABERTO",
        { jtiLink: contexto.jtiLink ?? undefined },
        contexto.ip,
      );
    } catch (erro) {
      // Rótulo fixo, sem PII: a mensagem não repete nada da admissão.
      this.log.error("falha ao registrar a abertura do link do portal", erro as Error);
    }
  }
}

/**
 * O ESTADO DA CASA, derivado aqui e em lugar nenhum mais (a tela não remonta nada).
 *
 * A ORDEM DAS PERGUNTAS É A REGRA:
 *  1. `ENTREGUE` vence tudo, inclusive o teto. O caso real: o candidato errou três vezes, o time
 *     resolveu e o documento entrou. A contagem velha continua na tabela, e tratá-la como decisiva
 *     devolveria a casa roxa a quem já terminou.
 *  2. Teto atingido vence qualquer outra pendência: ali ele não envia mais, e a tela não pode
 *     convidá-lo a tentar.
 *  3. NÃO CABER OUTRO ARQUIVO vence o veredito (veto D-2). Existe arquivo nosso, chegado e ainda
 *     sem desfecho, então a casa é `EM_ANALISE`: a tela dela diz a coisa certa ("recebi o seu envio
 *     e estou conferindo") e NÃO oferece envio. Sem esta pergunta a casa saía `AJUSTAR`, com dois
 *     botões de envio, e a emissão recusava o toque com `ARQUIVO_JA_ENVIADO`.
 *  4. Só então o enum do banco decide entre "esperando julgamento" e "refaça este".
 *
 * O CAMINHO REAL DO DEFEITO, e ele não é hipótese: o candidato envia, a credencial fica confirmada
 * e não reprovada, e a AUDITORIA escreve `INCONFORME` (estado que o portal NUNCA escreve) sem tocar
 * `reprovado_em` nem `liberado_em`. O envio segue "em aberto" para a régua do arquivo único, e o
 * estado do documento, sozinho, não tem como saber disso. A casa mais usada do fluxo virava beco.
 *
 * NENHUM ESTADO NOVO NASCE AQUI: o contrato tem cinco (`ESTADOS_PASSO_PORTAL`) e o dono dele é o
 * coordenador. `EM_ANALISE` é o que já significa, do ponto de vista do candidato, exatamente isto.
 *
 * ══ O SINAL `reprovadoNoPortal`, e por que ele tem PRECEDÊNCIA sobre "em análise" ═══════════════
 *
 * O Portal NUNCA escreve `INCONFORME` no documento: a reprovação da IA só carimba `reprovado_em` na
 * credencial, e o documento fica em `AGUARDANDO_AUDITORIA`. Sem este sinal, a linha abaixo mapeava
 * `AGUARDANDO_AUDITORIA -> EM_ANALISE` e MASCARAVA o reprovado: a casa de "ajustar" (bug 3, o
 * substituir) nunca reabria, e o candidato via "em análise" para sempre. `reprovadoNoPortal`
 * (a IA reprovou E ainda há tentativa) força `AJUSTAR` ANTES do mapeamento de "em aberto".
 *
 * ══ O SINAL `aguardandoValidacao`, e por que ele tem PRECEDÊNCIA sobre "em análise" ══════════════
 *
 * Quando a IA JÁ leu e os campos estão prontos para o candidato confirmar (veredito não reprovado,
 * ainda não confirmado, há campos), a casa NÃO está mais "em análise": ela está pendente da AÇÃO
 * DELE, confirmar os dados lidos. É `AGUARDANDO_VALIDACAO`, e ele vem ANTES de `EM_ANALISE`. A
 * janela SEM leitura pronta (o envio chegou, a IA ainda não devolveu) continua `EM_ANALISE`.
 *
 * A CONDIÇÃO É EXATAMENTE a de `conferencia.aguardandoConfirmacao` (veredito não reprovado, não
 * confirmado, há campos), para alinhar 1:1 com o `envio.fase === "conferir"` que a tela reidrata.
 *
 * A PRECEDÊNCIA, explícita: ENTREGUE > noTime > (reprovadoNoPortal -> AJUSTAR) > (aguardandoValidacao
 * -> AGUARDANDO_VALIDACAO) > (em aberto -> EM_ANALISE) > INCONFORME/PENDENTE. O sinal vem de
 * `portal_conferencia`, mas quem diz "há tentativa" é o dono do número que tranca (`tentativas`),
 * nunca a conferência (C10).
 */
function estadoDoPasso(
  estadoDocumento: string,
  noTime: boolean,
  cabeOutroArquivo: boolean,
  reprovadoNoPortal: boolean,
  aguardandoValidacao: boolean,
): EstadoPassoPortal {
  if (estadoDocumento === "ENTREGUE") return "ACEITO";
  if (noTime) return "NO_TIME";
  if (reprovadoNoPortal) return "AJUSTAR";
  if (aguardandoValidacao) return "AGUARDANDO_VALIDACAO";
  if (estadoDocumento === "AGUARDANDO_AUDITORIA") return "EM_ANALISE";
  if (!cabeOutroArquivo) return "EM_ANALISE";
  if (estadoDocumento === "INCONFORME") return "AJUSTAR";
  return "PENDENTE";
}

/**
 * A ORDEM DECIDE O QUE O CANDIDATO FAZ PRIMEIRO, e por isso ela é do servidor.
 *
 * A RÉGUA MUDOU DE ENDEREÇO (OST da ordem dos 7, 21/09/2026): ela é `compararDocumentosDaTrilha`,
 * em `domain/ordem-dos-documentos.ts`, pura e testável sem banco. Duas razões, e a segunda é a
 * que obrigou:
 *
 *  1. a ordem é DECISÃO DO DIRETOR e vai mudar de novo; trocar de leitura tem de ser mexer numa
 *     função de poucas linhas, com as duas leituras escritas ao lado;
 *  2. ela deixou de ter um leitor só. A coluna "Documento Atual" do Gerenciador do Portal
 *     (`ReguaCompletudeService.proximoObrigatorioPendenteMap`) diz ao RH qual é o PRÓXIMO da fila
 *     desta mesma tela. Enquanto a régua era "por nome", o acordo entre as duas cabia num
 *     comentário; com uma lista fixa dentro, régua duplicada faria o RH cobrar um documento e o
 *     candidato estar olhando outro.
 */
const ordemDaTrilha = compararDocumentosDaTrilha;
