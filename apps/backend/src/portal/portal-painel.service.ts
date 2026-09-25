import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  cargos,
  clientes,
  portalLinks,
  portalPendenciasNoTime,
} from "../db/schema";
import {
  ORIGENS_DE_ENVIO_DO_LINK,
  SEM_ORIGEM_DE_ENVIO,
  type OrigemDeEnvioDoLink,
} from "@ea/shared-types";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { COLUNAS_DO_LINK } from "./portal-link-colunas";
import {
  abaDoPainel,
  CARDS_DO_PAINEL,
  contarPainel,
  dataIsoDoFiltro,
  dentroDoIntervalo,
  diaLocalDoCarimbo,
  estadoDoLinkNoPainel,
  naAba,
  noCard,
  pontaPedida,
  recorteDaPagina,
  recorteDoCard,
  situacaoNoPainel,
  SITUACOES_DO_PAINEL,
  type CardDoPainel,
  type ContadoresDoPainel,
  type EstadoLinkPainel,
  type FatoDaAdmissaoNoPainel,
} from "../domain/portal-painel";

/**
 * A LIGAÇÃO ADMISSÃO -> CANDIDATO, EXTRAÍDA PARA UMA CONSTANTE E COM UM MOTIVO.
 *
 * A busca por nome obrigou a junção com `candidatos` em três consultas. Repetir a expressão em
 * cada uma espalharia a palavra "cpf" pelo arquivo, e a régua desta tela é que o CPF apareça UMA
 * vez, como CHAVE DE JUNÇÃO, nunca projetado e nunca buscado (a busca por CPF é o oráculo de
 * existência que a identificação do candidato fecha desde o primeiro dia). Uma constante mantém a
 * afirmação verificável: quem quiser saber onde o CPF é tocado olha esta linha, e só ela.
 */
const LIGA_CANDIDATO = eq(candidatos.cpf, admissoes.candidatoCpf);

/**
 * O GERENCIADOR DO PORTAL: os cinco contadores do funil e a lista de quem está onde.
 *
 * ┌─ ESTE SERVIÇO NÃO TEM CONTROLLER SOB `portal/`, E ISSO É A CONDIÇÃO MAIS DURA DA FRENTE ────┐
 * │ Ver o cabeçalho de `portal-painel.controller.ts`. Resumo: o time já resolveu esse dilema uma │
 * │ vez, em `portal-pendencias.controller.ts`, e resolveu CONTRA pendurar rota interna sob o     │
 * │ prefixo que a barreira vai allowlistar. Lá o erro exporia dois POST que exigem adivinhar um  │
 * │ UUID; aqui exporia um GET com a lista NOMINAL de candidatos, cargo, cliente e o estado de    │
 * │ cada um, que é o enumerador pronto.                                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6, O QUE ESTA TELA NÃO MOSTRA ──────────────────────────────────────────────────────────┐
 * │ Sem IP (em claro ou hasheado), sem `ua_hash`, sem geografia, SEM contagem de tentativa de    │
 * │ identificação falha e sem nenhuma listagem de evento: isso é a Sala De Segurança, de Master  │
 * │ e Super Admin. Sem BUSCA POR CPF, e a ausência é deliberada: o CPF é a chave que abre o      │
 * │ portal, e uma caixa de busca por CPF numa tela operacional é o oráculo de existência que a   │
 * │ identificação do candidato fecha desde o primeiro dia.                                       │
 * │                                                                                              │
 * │ O que SAI daqui é o que a operação precisa para agir: nome, cargo, cliente, em que documento │
 * │ a pessoa está, o progresso da régua obrigatória, se caiu para o time, o ÚLTIMO ACESSO e o    │
 * │ estado do link. Do bloqueio sai só o binário `SUSPENSO`, sem número e sem data de fim.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA RÉGUA NOVA. Quantos obrigatórios existem, quantos foram aceitos e qual é o próximo
 * pendente vêm todos de `ReguaCompletudeService`, que é a fonte única (§A.19). Recontar aqui seria
 * a segunda verdade sobre o número que decide se a pessoa concluiu.
 */

/** O funil, os cinco números do topo da tela. */
export type ResumoDoPainelPortal = ContadoresDoPainel;

/** Uma linha da lista. Tipo LOCAL: o contrato publicado em `shared-types` é do coordenador. */
export interface LinhaDoPainelPortal {
  admissaoId: string;
  nome: string;
  cargo: string;
  cliente: string;
  /**
   * ISO `aaaa-mm-dd`, ou `null`. `null` NÃO É ERRO: admissão de BANCO não tem data de admissão por
   * definição (§A.3), e a célula diz "não informado" (§A.11), nunca traço.
   */
  dataAdmissao: string | null;
  /** Próximo documento OBRIGATÓRIO pendente. `null` quando não falta nenhum. */
  documentoAtual: string | null;
  aceitos: number;
  obrigatorios: number;
  /** Caiu para o time (pendência sem reabertura). */
  noTime: boolean;
  /** ISO. `null` é "nunca acessou", e é o mesmo `null` que alimenta NÃO ACESSARAM. */
  ultimoAcessoEm: string | null;
  estadoLink: EstadoLinkPainel;
  /**
   * POR ONDE O LINK VIGENTE SAIU (`portal_links.envio_origem`, migration 0122), ou `null`.
   *
   * ┌─ É A ORIGEM DO LINK VIGENTE, E NÃO UM `max` SOBRE TODOS OS LINKS DA ADMISSÃO ──────────────┐
   * │ As duas outras colunas agregadas desta tela (`ultimoAcessoEm` e o `acessou` do funil) somam │
   * │ TODOS os links de propósito: o acesso pelo link antigo continua sendo acesso. Origem é o    │
   * │ oposto. Um `max` alfabético devolveria a origem de um link REVOGADO, e a coluna diria       │
   * │ "Manual" para uma admissão cujo link vivo nasceu automático. Por isso ela sai de            │
   * │ `estadoDoLinkVigente`, exatamente onde o `estadoLink` e o `linkJti` já saem: os três        │
   * │ descrevem a MESMA linha, que é a linha sobre a qual o consultor vai agir.                   │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `null` NÃO É ERRO: é o link antigo, emitido antes desta frente, entregue à mão pelo consultor.
   * A tela escreve "não informado" (§A.11) e o filtro tem opção própria para perguntar por eles.
   *
   * §A.6: é um RÓTULO FIXO de catálogo fechado. Não carrega endereço, nem URL, nem autor.
   */
  origemEnvio: OrigemDeEnvioDoLink | null;
  /**
   * O `jti` DO LINK VIGENTE (`linkJti` no contrato), que é o `id` da LINHA em `portal_links`.
   *
   * ELE EXISTE PORQUE AS AÇÕES SÃO POR LINHA, NÃO POR ADMISSÃO: revogar, bloquear e desbloquear
   * recebem o `jti`, e a tela só tem a admissão. Sem este campo, a tela teria de adivinhar qual
   * das N linhas de uma admissão reemitida é a vigente, ou pedir uma consulta a mais por clique.
   *
   * NÃO É O TOKEN, e a diferença é toda: o token é credencial assinada e volta UMA vez, na
   * emissão, sem ser persistido em claro (§A.6). Este é o identificador da linha, que não abre
   * porta nenhuma sozinho, e que a rota de revogar já recebe hoje.
   */
  linkJti: string | null;
}

export interface PaginaDoPainelPortal {
  itens: LinhaDoPainelPortal[];
  total: number;
  pagina: number;
  tamanho: number;
}

/**
 * OS FARÓIS QUE FICAM DE FORA DA FILA E DE TODOS OS CONTADORES, EM CÓDIGO (§A.16).
 *
 * `DECLINOU` e `RESCISAO` são a regra escrita: encerrado não deixa trabalho ativo e não conta como
 * pendência em NENHUM card, em NENHUMA superfície. Isso é garantido aqui, no servidor, e não por
 * filtro de tela.
 *
 * `LIBERACAO_RECUSADA` e `AGUARDANDO_LIBERACAO` entram junto pelo mesmo motivo que na Esteira
 * (`esteira.service.listar` usa exatamente esta lista): pré-admissão do Pandapé chega SEM cliente e
 * SEM cargo, logo sem régua, logo com ZERO obrigatório pendente. Contada aqui, ela entraria em
 * CONCLUÍRAM assim que alguém abrisse o link, exibindo conclusão de uma coleta que nem começou. A
 * recusada é terminal como o declínio.
 */
export const FAROIS_FORA_DO_PAINEL = [
  "DECLINOU",
  "RESCISAO",
  "AGUARDANDO_LIBERACAO",
  "LIBERACAO_RECUSADA",
] as const;

/**
 * O QUE A LISTA ACEITA. TUDO MÚLTIPLO (§A.28), menos a busca por nome e as pontas de intervalo.
 *
 * As listas chegam já quebradas pelo `parseMulti` da controller (o mesmo da Esteira), então aqui
 * elas são arranjo ou ausência, nunca texto com vírgula.
 */
export interface FiltrosDaListaDoPainel {
  aba?: string | null;
  /** Busca por PEDAÇO do nome do funcionário. Texto livre, sem catálogo. Nunca CPF. */
  nome?: string | null;
  clientes?: string[];
  cargos?: string[];
  documentos?: string[];
  situacoes?: string[];
  estadosLink?: string[];
  origens?: string[];
  /**
   * O CARD CLICADO, e ele é o recorte que ATRAVESSA A ABA (decisão do diretor nesta rodada).
   *
   * Vazio é "todos". Os valores são os quatro de `CARDS_DO_PAINEL`; qualquer outro é 400, e não
   * silêncio, pelo mesmo motivo do intervalo de datas.
   */
  recorte?: string | null;
  ultimoAcessoDe?: string | null;
  ultimoAcessoAte?: string | null;
  dataAdmissaoDe?: string | null;
  dataAdmissaoAte?: string | null;
  pagina?: number | string | null;
  tamanho?: number | string | null;
}

/**
 * O catálogo de opções de cada filtro de lista (§A.37), servido pelo backend.
 *
 * `type` e não `interface` de propósito: só o alias ganha índice implícito, e sem ele um teste que
 * varra as chaves do catálogo (`catalogo as Record<string, unknown>`) não compila.
 */
export type CatalogoDeFiltrosDoPainel = {
  clientes: { valor: string; rotulo: string }[];
  cargos: { valor: string; rotulo: string }[];
  documentos: { valor: string; rotulo: string }[];
  situacoes: { valor: string; rotulo: string }[];
  estadosLink: { valor: EstadoLinkPainel; rotulo: string }[];
  origens: { valor: string; rotulo: string }[];
};

/**
 * O VALOR ESPECIAL DO FILTRO DE DOCUMENTO (§A.37).
 *
 * A célula "documento atual" fica VAZIA quando não falta obrigatório nenhum, e sem uma opção para
 * esse caso não há como perguntar "quem já não tem o que enviar", que é metade da pergunta que a
 * coluna cria. O valor é um código, e não a frase da tela, para não amarrar consulta a rótulo.
 */
export const SEM_DOCUMENTO_PENDENTE = "__SEM_DOCUMENTO";

/**
 * OS RÓTULOS DA ORIGEM. Title case (§A.24), sem travessão (§A.11).
 *
 * O VALOR ESPECIAL (`SEM_ORIGEM_DE_ENVIO`) vem do CONTRATO, e não é redigitado aqui: ele é o
 * mesmo código que a tela manda de volta no filtro, e duas cópias de um código combinado entre
 * as duas pontas divergem no primeiro ajuste.
 *
 * OS TRÊS CÓDIGOS SÃO FIXOS, no molde do estado do link, e não derivados do que existe na base:
 * derivá-los faria a opção sumir da barra justamente no dia em que ninguém tivesse usado aquele
 * caminho ainda, que é quando alguém quer perguntar "e por ali, ninguém?". O `__SEM_ORIGEM` é a
 * exceção, e essa SIM só entra quando existe alguém nela, como manda o contrato: ele descreve um
 * passado que vai encolhendo, e opção que nunca traz linha é ruído.
 *
 * `Record<OrigemDeEnvioDoLink, string>` e não `Record<string, string>`: assim o dia em que um
 * quarto código nascer no contrato, ESTE ARQUIVO não compila enquanto o rótulo não existir.
 */
const ROTULO_DA_ORIGEM: Record<OrigemDeEnvioDoLink, string> = {
  AUTOMATICO: "Automático",
  MANUAL: "Manual",
  ENTREGA_A_MAO: "Entrega À Mão",
};

/**
 * O que o banco devolveu é um dos códigos do contrato? Fora do catálogo vira `null`.
 *
 * A coluna é `varchar(20)` e o TIPO da linha promete `OrigemDeEnvioDoLink | null`; sem esta
 * conferência a promessa seria um `as` torcendo para que as duas únicas escritas da coluna
 * (`marcarEnvioDoLink` e a emissão) nunca errem. Cair em `null` é a direção segura: a tela mostra
 * "não informado", que é o que ela já faz com o link antigo.
 */
function origemConhecida(valor: string | null | undefined): OrigemDeEnvioDoLink | null {
  if (!valor) return null;
  return (ORIGENS_DE_ENVIO_DO_LINK as readonly string[]).includes(valor)
    ? (valor as OrigemDeEnvioDoLink)
    : null;
}

/** Os rótulos do estado do link. Title case (§A.24), sem travessão (§A.11). */
const ROTULO_DO_ESTADO_DO_LINK: Record<EstadoLinkPainel, string> = {
  VIVO: "Vivo",
  VENCIDO: "Vencido",
  REVOGADO: "Revogado",
  SUSPENSO: "Suspenso",
  BLOQUEADO: "Bloqueado",
};

@Injectable()
export class PortalPainelService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly regua: ReguaCompletudeService,
  ) {}

  /**
   * OS CINCO CONTADORES, sobre TODO o recorte (encaminhados vivos), não sobre a página.
   *
   * Contador que respeita paginação não é contador, é o tamanho da página com outro nome. O custo
   * é proporcional ao número de admissões COM LINK EMITIDO, que é um subconjunto pequeno das 2.156
   * admissões da base e cresce com a adoção do portal, não com o histórico.
   */
  async resumo(): Promise<ResumoDoPainelPortal> {
    const encaminhados = await this.encaminhados();
    if (encaminhados.length === 0) return contarPainel([]);

    const ids = encaminhados.map((e) => e.admissaoId);
    // O PROGRESSO, E NÃO O CONTADOR DE PENDENTES (achado M1 da auditoria): os dois saem da mesma
    // consulta, mas só este traz o TOTAL da régua, e é o total que separa "coleta completa" de
    // "régua vazia". `obrigatoriosPendentesCountMap` pré-semeia zero para todo id, então um par
    // (cliente + cargo) sem nenhuma linha OBRIGATORIO responderia "zero pendentes" e a admissão
    // entraria em CONCLUÍRAM sem ter recebido um documento. São 6 casos vivos na produção.
    const progresso = await this.regua.progressoObrigatoriosMap(ids);
    const noTime = await this.admissoesNoTime(ids);

    const fatos: FatoDaAdmissaoNoPainel[] = encaminhados.map((e) => {
      const prog = progresso.get(e.admissaoId) ?? { entregues: 0, total: 0 };
      return {
        acessou: e.acessou,
        obrigatorios: prog.total,
        obrigatoriosPendentes: prog.total - prog.entregues,
        aceitos: prog.entregues,
        noTime: noTime.has(e.admissaoId),
      };
    });
    return contarPainel(fatos);
  }

  /**
   * A LISTA, RECORTADA NO SERVIDOR.
   *
   * ┌─ NENHUM PARÂMETRO DE ADMISSÃO, NEM OPCIONAL ────────────────────────────────────────────────┐
   * │ Mesma régua do `PortalDocumentosController`: quem entra na lista é decidido pelo RECORTE     │
   * │ (admissão viva COM link emitido), e não por um id que o chamador escolhe. Um `?admissaoId=`  │
   * │ aqui transformaria a tela de acompanhamento numa consulta dirigida a qualquer admissão da    │
   * │ base, inclusive as que o recorte exclui de propósito.                                        │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A ORDEM É O ENCAMINHAMENTO MAIS RECENTE PRIMEIRO, porque é ele que gera trabalho: quem acabou
   * de receber o link é quem ainda vai mexer, e quem recebeu há duas semanas já está resolvido ou
   * já está sendo cobrado por outro caminho.
   */
  async listar(entrada: FiltrosDaListaDoPainel = {}): Promise<PaginaDoPainelPortal> {
    const { limite, deslocamento } = recorteDaPagina(entrada);
    const condicoes = this.condicoesDeSql(entrada);
    // OS FILTROS QUE O BANCO NÃO SABE RESPONDER, resolvidos ANTES da página. Ver `idsQuePassam`.
    const derivados = await this.idsQuePassam(entrada, condicoes);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`count(distinct ${portalLinks.admissaoId})::int` })
      .from(portalLinks)
      .innerJoin(admissoes, eq(admissoes.id, portalLinks.admissaoId))
      .innerJoin(candidatos, LIGA_CANDIDATO)
      .where(
        and(
          notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]),
          inArray(portalLinks.admissaoId, derivados.ids),
          ...condicoes,
        ),
      );

    const pagina = await this.db
      .select({
        admissaoId: portalLinks.admissaoId,
        // `max` sobre TODOS os links da admissão, e não sobre o vigente: emitir um link novo revoga
        // o anterior e nasce sem carimbo, então olhar só o último apagaria o acesso que já houve.
        ultimoAcessoEm: sql<Date | null>`max(${portalLinks.ultimoAcessoEm})`,
        encaminhadoEm: sql<Date>`max(${portalLinks.criadoEm})`,
      })
      .from(portalLinks)
      .innerJoin(admissoes, eq(admissoes.id, portalLinks.admissaoId))
      .innerJoin(candidatos, LIGA_CANDIDATO)
      .where(
        and(
          notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]),
          inArray(portalLinks.admissaoId, derivados.ids),
          ...condicoes,
        ),
      )
      .groupBy(portalLinks.admissaoId)
      .orderBy(desc(sql`max(${portalLinks.criadoEm})`))
      .limit(limite)
      .offset(deslocamento);

    const ids = pagina.map((p) => p.admissaoId);
    if (ids.length === 0) {
      return {
        itens: [],
        total: total ?? 0,
        pagina: paginaPedida(deslocamento, limite),
        tamanho: limite,
      };
    }

    // OS MAPAS JÁ FORAM CALCULADOS no recorte inteiro (`idsQuePassam`) e são REUSADOS aqui: pedir
    // a régua de novo, só para a página, seria a segunda ida ao banco pelo mesmo número.
    const cabecalhos = await this.cabecalhos(ids);

    const itens: LinhaDoPainelPortal[] = pagina.map((linha) => {
      const cabecalho = cabecalhos.get(linha.admissaoId);
      const prog = derivados.progresso.get(linha.admissaoId) ?? { entregues: 0, total: 0 };
      const acesso = linha.ultimoAcessoEm;
      return {
        admissaoId: linha.admissaoId,
        nome: cabecalho?.nome ?? "não informado",
        cargo: cabecalho?.cargo ?? "não informado",
        cliente: cabecalho?.cliente ?? "não informado",
        // A coluna nova (§A.37: ela nasce com filtro e ordenação junto). Ausente é `null`, e a
        // tela escreve "não informado": admissão de banco não tem data, e isso não é pendência.
        dataAdmissao: cabecalho?.dataAdmissao ?? null,
        documentoAtual: derivados.proximos.get(linha.admissaoId) ?? null,
        aceitos: prog.entregues,
        obrigatorios: prog.total,
        noTime: derivados.noTime.has(linha.admissaoId),
        ultimoAcessoEm: acesso ? new Date(acesso).toISOString() : null,
        // Linha ausente é link morto, a mesma direção segura das quatro portas do candidato.
        estadoLink: derivados.estados.get(linha.admissaoId)?.estado ?? "REVOGADO",
        // A ORIGEM SAI DA MESMA LINHA QUE DECIDIU O ESTADO, e não de um agregado: ver a nota do
        // campo. Link antigo (anterior à migration 0122) vem nulo, e isso não é erro.
        origemEnvio: derivados.estados.get(linha.admissaoId)?.origem ?? null,
        linkJti: derivados.estados.get(linha.admissaoId)?.jti ?? null,
      };
    });

    return {
      itens,
      total: total ?? 0,
      pagina: paginaPedida(deslocamento, limite),
      tamanho: limite,
    };
  }

  /**
   * O CATÁLOGO DOS FILTROS (§A.37), e ele sai do RECORTE, nunca das linhas carregadas.
   *
   * Derivar as opções da página encolhe a lista assim que o primeiro valor é escolhido, e aí não
   * há como somar o segundo sem limpar o filtro. Aqui o catálogo é do universo do painel (admissão
   * viva COM link emitido) e NÃO muda com a aba nem com os outros filtros em vigor, que é o que
   * permite combinar dois clientes e três documentos na mesma pergunta.
   *
   * O catálogo de CLIENTE e CARGO é uma consulta só, distinta, sobre o recorte. O de DOCUMENTO sai
   * do dono do número (`ReguaCompletudeService`, §A.19), porque "documento atual" é derivado e não
   * existe como coluna. SITUAÇÃO e ESTADO DO LINK são de catálogo fechado, do domínio.
   */
  async catalogoDeFiltros(): Promise<CatalogoDeFiltrosDoPainel> {
    const pares = await this.db
      .selectDistinct({
        codCliente: admissoes.codCliente,
        cliente: sql<string>`coalesce(${clientes.nomeOperacao}, 'não informado')`,
        cargoId: admissoes.cargoId,
        cargo: sql<string>`coalesce(${cargos.nome}, 'não informado')`,
      })
      .from(portalLinks)
      .innerJoin(admissoes, eq(admissoes.id, portalLinks.admissaoId))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .where(notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]));

    const clientesMap = new Map<string, string>();
    const cargosMap = new Map<string, string>();
    for (const p of pares) {
      if (p.codCliente) clientesMap.set(p.codCliente, p.cliente);
      if (p.cargoId) cargosMap.set(p.cargoId, p.cargo);
    }

    const recorte = await this.encaminhados();
    const idsDoRecorte = recorte.map((r) => r.admissaoId);
    const proximos = await this.regua.proximoObrigatorioPendenteMap(idsDoRecorte);
    // A ORIGEM SAI DO LINK VIGENTE, pela MESMA função que a lista usa: o catálogo precisa
    // responder pelo que a COLUNA mostra, e a coluna mostra o vigente. Derivar do universo de
    // linhas de `portal_links` ofereceria a origem de links revogados, que a tela não exibe.
    const vigentes = await this.estadoDoLinkVigente(idsDoRecorte);
    const algumSemOrigem = idsDoRecorte.some((id) => (vigentes.get(id)?.origem ?? null) === null);
    const documentos = new Set<string>();
    let algumSemPendente = false;
    for (const nome of proximos.values()) {
      if (nome) documentos.add(nome);
      else algumSemPendente = true;
    }

    const emOrdem = (m: Map<string, string>) =>
      [...m.entries()]
        .map(([valor, rotulo]) => ({ valor, rotulo }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

    return {
      clientes: emOrdem(clientesMap),
      cargos: emOrdem(cargosMap),
      documentos: [
        ...[...documentos]
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .map((nome) => ({ valor: nome, rotulo: nome })),
        // O valor especial só entra quando EXISTE alguém nele: opção que nunca traz linha é ruído.
        ...(algumSemPendente
          ? [{ valor: SEM_DOCUMENTO_PENDENTE, rotulo: "Sem Documento Pendente" }]
          : []),
      ],
      situacoes: SITUACOES_DO_PAINEL.map((s) => ({ valor: s.valor, rotulo: s.rotulo })),
      // A ORIGEM: os três códigos fixos do contrato, mais a opção do link antigo quando ela tem
      // gente dentro (§A.37: o valor especial da coluna vira opção do filtro, senão metade da
      // pergunta que a coluna cria fica sem resposta).
      origens: [
        ...ORIGENS_DE_ENVIO_DO_LINK.map((valor) => ({ valor, rotulo: ROTULO_DA_ORIGEM[valor] })),
        // "NÃO INFORMADO", E NÃO "SEM ORIGEM" (achado 9 da auditoria). É a MESMA palavra que a
        // CÉLULA da coluna escreve para o link antigo, e é a mesma que a tela já usa no filtro.
        // Duas palavras para o mesmo estado, uma na célula e outra no filtro, vira pergunta de
        // suporte. Hoje a tela prefere o rótulo local dela e a divergência não aparece, o que é
        // PIOR e não melhor: ela fica dormente até alguém simplificar aquele fallback.
        //
        // Em Title Case porque aqui é OPÇÃO DE FILTRO, que é etiqueta (§A.24); na célula da tabela
        // ela é marcador de vazio e vai em caixa baixa (§A.11). É a mesma palavra nas duas caixas
        // que cada regra manda.
        ...(algumSemOrigem ? [{ valor: SEM_ORIGEM_DE_ENVIO, rotulo: "Não Informado" }] : []),
      ],
      estadosLink: (Object.keys(ROTULO_DO_ESTADO_DO_LINK) as EstadoLinkPainel[]).map((valor) => ({
        valor,
        rotulo: ROTULO_DO_ESTADO_DO_LINK[valor],
      })),
    };
  }

  // ══ OS FILTROS ═════════════════════════════════════════════════════════════════════════════

  /**
   * OS FILTROS QUE O BANCO RESPONDE, e só eles: cliente, cargo, nome e data de admissão.
   *
   * MÚLTIPLOS VIRAM `IN` (§A.28), e a busca por nome vira `ilike` por PEDAÇO, no mesmo molde da
   * Esteira. A busca é SÓ por nome: busca por CPF numa tela operacional é o oráculo de existência
   * que a identificação do candidato fecha desde o primeiro dia (§A.6).
   *
   * DATA INVÁLIDA É 400, NÃO SILÊNCIO: um intervalo que o servidor descarta devolveria a lista
   * inteira como se o recorte tivesse sido aplicado, que é a mentira da §A.28 ("filtro que a tela
   * oferece e a consulta ignora é pior que filtro nenhum").
   */
  private condicoesDeSql(f: FiltrosDaListaDoPainel): SQL[] {
    const condicoes: SQL[] = [];
    const clientesPedidos = (f.clientes ?? []).filter(Boolean);
    const cargosPedidos = (f.cargos ?? []).filter(Boolean);
    if (clientesPedidos.length) condicoes.push(inArray(admissoes.codCliente, clientesPedidos));
    if (cargosPedidos.length) condicoes.push(inArray(admissoes.cargoId, cargosPedidos));

    const busca = (f.nome ?? "").trim();
    if (busca) condicoes.push(ilike(candidatos.nome, `%${busca}%`));

    const de = this.dataDoFiltro(f.dataAdmissaoDe, "data de admissão");
    const ate = this.dataDoFiltro(f.dataAdmissaoAte, "data de admissão");
    if (de) condicoes.push(gte(admissoes.dataAdmissao, de));
    if (ate) condicoes.push(lte(admissoes.dataAdmissao, ate));
    return condicoes;
  }

  /**
   * O CARD PEDIDO, ou 400. Mesma régua do intervalo de datas, e pelo mesmo motivo.
   *
   * Valor fora do catálogo cair em "todos" devolveria MAIS linhas do que o pedido, e a tela
   * apresentaria o resultado como se o recorte tivesse sido aplicado. Filtro que a tela oferece e
   * a consulta ignora é pior que filtro nenhum, porque mente (§A.28).
   */
  private cardDoFiltro(valor: string | null | undefined): CardDoPainel | null {
    const card = recorteDoCard(valor);
    if (card === undefined) {
      throw new BadRequestException(
        `Recorte inválido: use um destes valores: ${CARDS_DO_PAINEL.join(", ")}.`,
      );
    }
    return card;
  }

  private dataDoFiltro(valor: string | null | undefined, campo: string): string | null {
    const normalizada = dataIsoDoFiltro(valor);
    if (normalizada === null && pontaPedida(valor)) {
      throw new BadRequestException(`Filtro de ${campo} inválido: use o formato aaaa-mm-dd.`);
    }
    return normalizada;
  }

  /**
   * OS FILTROS QUE O BANCO NÃO SABE RESPONDER, e a razão de eles virem ANTES da página.
   *
   * ┌─ ABA, SITUAÇÃO, DOCUMENTO ATUAL E ESTADO DO LINK SÃO DERIVADOS ─────────────────────────────┐
   * │ Nenhum dos quatro é coluna. Os três primeiros nascem da RÉGUA, que é do                     │
   * │ `ReguaCompletudeService` (§A.19, e recalcular aqui seria a segunda verdade sobre o número   │
   * │ que decide se a pessoa concluiu); o quarto nasce do domínio do link. Filtrar isso DEPOIS da │
   * │ página seria o defeito clássico: a página traria 25 linhas, o filtro esconderia 12, o total │
   * │ continuaria contando as 25, e a tela mentiria em cima de um número que ela mesma exibe.     │
   * │                                                                                             │
   * │ O CUSTO É CONHECIDO e é o mesmo do funil, que já roda em toda abertura de tela: o recorte   │
   * │ é "admissão viva COM link emitido", um subconjunto pequeno da base, que cresce com a adoção │
   * │ do portal e não com o histórico. Os filtros de SQL entram antes, então quanto mais recorte  │
   * │ a pessoa pede, menos isto trabalha.                                                          │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A ABA É SEMPRE APLICADA (`EM_ANDAMENTO` é o padrão): quem terminou a entrega sai da frente de
   * trabalho e volta na outra aba. Os CONTADORES não olham nada disto, de propósito: eles são do
   * universo inteiro, então o funil soma igual nas duas abas.
   */
  private async idsQuePassam(
    f: FiltrosDaListaDoPainel,
    condicoes: SQL[],
  ): Promise<{
    ids: string[];
    progresso: Map<string, { entregues: number; total: number }>;
    proximos: Map<string, string | null>;
    noTime: Set<string>;
    estados: Map<
      string,
      { estado: EstadoLinkPainel; jti: string | null; origem: OrigemDeEnvioDoLink | null }
    >;
  }> {
    const recorte = await this.encaminhados(condicoes);
    const ids = recorte.map((r) => r.admissaoId);
    const [progresso, proximos, noTime, estados] = await Promise.all([
      this.regua.progressoObrigatoriosMap(ids),
      this.regua.proximoObrigatorioPendenteMap(ids),
      this.admissoesNoTime(ids),
      this.estadoDoLinkVigente(ids),
    ]);

    const card = this.cardDoFiltro(f.recorte);
    const aba = abaDoPainel(f.aba);
    const situacoes = new Set((f.situacoes ?? []).filter(Boolean));
    const documentos = new Set((f.documentos ?? []).filter(Boolean));
    const estadosPedidos = new Set((f.estadosLink ?? []).filter(Boolean));
    const origensPedidas = new Set((f.origens ?? []).filter(Boolean));
    const acessoDe = this.dataDoFiltro(f.ultimoAcessoDe, "último acesso");
    const acessoAte = this.dataDoFiltro(f.ultimoAcessoAte, "último acesso");
    const filtraAcesso = acessoDe !== null || acessoAte !== null;

    const passam = recorte
      .filter((r) => {
        const prog = progresso.get(r.admissaoId) ?? { entregues: 0, total: 0 };
        const fato: FatoDaAdmissaoNoPainel = {
          acessou: r.acessou,
          obrigatorios: prog.total,
          obrigatoriosPendentes: prog.total - prog.entregues,
          aceitos: prog.entregues,
          noTime: noTime.has(r.admissaoId),
        };
        /*
         * O CARD ATRAVESSA A ABA, e é esta a decisão do diretor nesta rodada.
         *
         * Com recorte de card, a aba NÃO se aplica: o card varre o universo inteiro (encaminhados
         * vivos), finalizados incluídos. Era essa a causa do defeito medido: os dois que tinham
         * acessado estavam na aba CONCLUÍDO, a tabela vinha cortada pela aba de trabalho, e clicar
         * em "Acessaram" zerava a tabela enquanto o card dizia 2.
         *
         * SEM recorte de card, a aba continua valendo exatamente como valia.
         */
        if (card === null && !naAba(aba, fato)) return false;
        if (card !== null && !noCard(card, fato)) return false;
        if (situacoes.size && !situacoes.has(situacaoNoPainel(fato))) return false;
        if (documentos.size) {
          const atual = proximos.get(r.admissaoId) ?? null;
          if (!documentos.has(atual ?? SEM_DOCUMENTO_PENDENTE)) return false;
        }
        if (estadosPedidos.size) {
          if (!estadosPedidos.has(estados.get(r.admissaoId)?.estado ?? "REVOGADO")) return false;
        }
        if (origensPedidas.size) {
          // Origem ausente casa com o valor especial, e não com nada: sem isso não haveria como
          // perguntar pelos links antigos, que são a maioria enquanto o carimbo é novo.
          const origem = estados.get(r.admissaoId)?.origem ?? null;
          if (!origensPedidas.has(origem ?? SEM_ORIGEM_DE_ENVIO)) return false;
        }
        if (filtraAcesso) {
          // QUEM NUNCA ACESSOU FICA DE FORA de um intervalo de último acesso, e isso é o desenho:
          // carimbo ausente não cai em data nenhuma, e tratá-lo como "dentro" encheria o recorte
          // justamente de quem o filtro existe para excluir.
          const carimbo = r.ultimoAcessoEm;
          if (!carimbo) return false;
          if (!dentroDoIntervalo(diaLocalDoCarimbo(new Date(carimbo)), acessoDe, acessoAte)) {
            return false;
          }
        }
        return true;
      })
      .map((r) => r.admissaoId);

    return { ids: passam, progresso, proximos, noTime, estados };
  }

  // ══ AS CONSULTAS ═══════════════════════════════════════════════════════════════════════════

  /**
   * O RECORTE: uma linha por admissão VIVA que tem pelo menos um link emitido, e se ela já foi
   * acessada ALGUMA VEZ.
   *
   * `bool_or` sobre todos os links da admissão pelo mesmo motivo do `max` do último acesso: o link
   * vigente pode ser o terceiro, recém-emitido e sem carimbo, enquanto o candidato entrou pelo
   * primeiro. Olhar só o vigente devolveria um falso "não acessou", que é exatamente o erro que faz
   * o consultor reemitir o link e matar a sessão de quem está enviando documento.
   */
  private async encaminhados(
    // As MESMAS condições de SQL da lista, para que o recorte que alimenta os filtros derivados
    // seja o recorte já filtrado, e não a base inteira. O funil chama sem nenhuma, de propósito:
    // contador que respeita filtro não é contador, é o tamanho da tabela com outro nome.
    condicoes: SQL[] = [],
  ): Promise<{ admissaoId: string; acessou: boolean; ultimoAcessoEm: Date | null }[]> {
    return this.db
      .select({
        admissaoId: portalLinks.admissaoId,
        acessou: sql<boolean>`bool_or(${portalLinks.primeiroAcessoEm} is not null)`,
        ultimoAcessoEm: sql<Date | null>`max(${portalLinks.ultimoAcessoEm})`,
      })
      .from(portalLinks)
      .innerJoin(admissoes, eq(admissoes.id, portalLinks.admissaoId))
      .innerJoin(candidatos, LIGA_CANDIDATO)
      .where(and(notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]), ...condicoes))
      .groupBy(portalLinks.admissaoId);
  }

  /**
   * QUEM CAIU PARA O TIME E AINDA NÃO FOI REABERTO.
   *
   * As DUAS condições são necessárias, e nenhuma delas é redundante: `caiu_em` não nulo separa a
   * queda de verdade da linha que existe SÓ para carregar um destravamento preventivo do Master
   * (tentativas 0, queda que nunca houve), e `liberado_em` nulo é a "sem reabertura" do contador.
   * Reaberta, a pendência voltou para o candidato e não é mais intervenção humana em aberto.
   */
  private async admissoesNoTime(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const linhas = await this.db
      .selectDistinct({ admissaoId: portalPendenciasNoTime.admissaoId })
      .from(portalPendenciasNoTime)
      .where(
        and(
          inArray(portalPendenciasNoTime.admissaoId, ids),
          isNotNull(portalPendenciasNoTime.caiuEm),
          sql`${portalPendenciasNoTime.liberadoEm} is null`,
        ),
      );
    return new Set(linhas.map((l) => l.admissaoId));
  }

  /**
   * Nome, cargo e cliente da página.
   *
   * NOME COMPLETO, e aqui ele é legítimo: esta tela é INTERNA e autenticada, e é a mesma coluna que
   * o Gerenciador e a Esteira já mostram para o mesmo time. O recorte do primeiro nome existe do
   * outro lado, na trilha do CANDIDATO, que é resposta pública. CPF NÃO entra, nem projetado.
   *
   * `nome_operacao` como cliente, nunca `razao_social` nem `cnpj`: é o nome pelo qual a operação
   * chama o cliente, e é o que a pessoa que trabalha na esteira reconhece.
   */
  private async cabecalhos(ids: string[]) {
    const linhas = await this.db
      .select({
        admissaoId: admissoes.id,
        nome: candidatos.nome,
        cargo: sql<string>`coalesce(${cargos.nome}, 'não informado')`,
        cliente: sql<string>`coalesce(${clientes.nomeOperacao}, 'não informado')`,
        // COLUNA `date` no banco, então o driver devolve `aaaa-mm-dd` em texto e nada é convertido
        // aqui: virar `Date` traria fuso para uma data que não tem hora, e a célula erraria o dia.
        dataAdmissao: admissoes.dataAdmissao,
      })
      .from(admissoes)
      .innerJoin(candidatos, LIGA_CANDIDATO)
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .where(inArray(admissoes.id, ids));
    return new Map(linhas.map((l) => [l.admissaoId, l]));
  }

  /**
   * O ESTADO DO LINK VIGENTE de cada admissão da página.
   *
   * VIGENTE É O MAIS RECENTE, e não "o vivo": quando todos estão mortos, é o último que conta a
   * história certa (foi revogado? venceu?). O desempate é por `criado_em`, a mesma ordem que a
   * emissão usa quando revoga os anteriores.
   *
   * A régua do estado é `domain/portal-painel.ts`, que por sua vez chama o `estadoDaLinha` do
   * domínio da identidade. Nenhuma cópia nova de "o link está vivo?" nasce aqui.
   */
  private async estadoDoLinkVigente(
    ids: string[],
  ): Promise<
    Map<
      string,
      { estado: EstadoLinkPainel; jti: string | null; origem: OrigemDeEnvioDoLink | null }
    >
  > {
    const linhas = await this.db
      .select({
        admissaoId: portalLinks.admissaoId,
        criadoEm: portalLinks.criadoEm,
        id: portalLinks.id,
        // O CARIMBO DO ENVIO PEDIDO NA CHAMADA, e não dentro de `COLUNAS_DO_LINK`: aquela
        // constante é "o que DECIDE se o link está vivo", e envio não fecha porta nenhuma. É
        // exatamente o que o cabeçalho de `portal-link-colunas.ts` manda fazer.
        envioOrigem: portalLinks.envioOrigem,
        // A PROJEÇÃO DO ESTADO VEM DE UM LUGAR SÓ (`COLUNAS_DO_LINK`): coluna esquecida aqui vira
        // "sem restrição" dentro de `estadoDaLinha`, e o painel mentiria sobre o estado do link.
        ...COLUNAS_DO_LINK,
      })
      .from(portalLinks)
      .where(inArray(portalLinks.admissaoId, ids));

    /**
     * O DESEMPATE É DETERMINÍSTICO, e ele deixou de ser cosmético.
     *
     * A rodada 1 escolhia o vigente com `>` estrito e sem ordem: em empate de `criado_em`, ganhava
     * a linha que o banco devolvesse primeiro, que é ordem NÃO garantida. Enquanto daí só saía o
     * RÓTULO da coluna, o pior caso era mostrar "vencido" onde era "revogado". Agora sai também o
     * `linkJti`, que é o alvo dos botões de revogar, bloquear e desbloquear: o mesmo empate
     * passaria a AGIR SOBRE O LINK ERRADO, e o consultor veria o estado de um enquanto fecha o
     * outro. O critério é (`criado_em` mais recente, e no empate o maior `id`), que não depende da
     * ordem em que as linhas chegaram.
     */
    const vigente = new Map<string, (typeof linhas)[number]>();
    for (const l of linhas) {
      const atual = vigente.get(l.admissaoId);
      if (!atual || maisRecente(l, atual)) vigente.set(l.admissaoId, l);
    }

    const agoraMs = Date.now();
    const estados = new Map<
      string,
      { estado: EstadoLinkPainel; jti: string | null; origem: OrigemDeEnvioDoLink | null }
    >();
    for (const [admissaoId, linha] of vigente) {
      // O `jti` SAI DA MESMA LINHA que decidiu o estado, e não de uma segunda consulta: é ele que
      // a tela manda de volta em revogar, bloquear e desbloquear, e pegá-lo de outro lugar
      // arriscaria agir sobre uma linha diferente da que o consultor está vendo.
      estados.set(admissaoId, {
        estado: estadoDoLinkNoPainel(linha, agoraMs),
        jti: linha.id ?? null,
        origem: origemConhecida(linha.envioOrigem),
      });
    }
    return estados;
  }
}

/**
 * QUAL DAS DUAS LINHAS É A VIGENTE. Mais recente por `criado_em`; empatou, o maior `id` vence.
 *
 * O segundo critério não é capricho: sem ele o empate se resolve pela ordem de chegada das linhas,
 * que o Postgres não garante, e o `linkJti` devolvido ao lado do estado poderia apontar para outro
 * link a cada consulta.
 */
function maisRecente(
  candidata: { criadoEm: Date; id?: string | null },
  atual: { criadoEm: Date; id?: string | null },
): boolean {
  const diferenca = candidata.criadoEm.getTime() - atual.criadoEm.getTime();
  if (diferenca !== 0) return diferenca > 0;
  return (candidata.id ?? "") > (atual.id ?? "");
}

/** Devolve a página que o recorte representa, para a tela não ter de recalcular o deslocamento. */
function paginaPedida(deslocamento: number, limite: number): number {
  return Math.floor(deslocamento / limite) + 1;
}
