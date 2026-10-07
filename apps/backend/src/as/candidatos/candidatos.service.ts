import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AsCandidaturaEntrevista,
  AsCandidaturaEtapaItem,
  AsCandidatoFicha,
  AsCandidatoListItem,
  AsCandidatosKpis,
  AsCandidatosOpcoes,
  AsCandidatosPagina,
  AsCandidaturaEncerrada,
  AsCandidaturaItem,
  AsCandidaturaNaLista,
  AsCandidaturasDaVagaPagina,
  AsContatoItem,
  AsFalhaEmMassa,
  AsMotivoDescarte,
  AsOcupacaoVaga,
  AsPainelVaga,
  AsReentradaPrecisaCiencia,
  AsResultadoAcaoEmMassa,
  AsResultadoEmMassa,
  CandidaturaSituacao,
} from "@ea/shared-types";
import {
  CANDIDATURA_SITUACOES,
  SITUACOES_QUE_FINALIZAM_POSICAO,
  isValidCpf,
  motivoVemDoCatalogo,
  normalizeCpf,
} from "@ea/shared-types";
/*
 * O CATÁLOGO DE MOTIVOS DE DESCARTE chega como FUNÇÃO DE MÓDULO, e não por injeção de construtor
 * (ver o bloco de `exigirMotivoDoCatalogo`): este serviço tem cinco argumentos e é instanciado por
 * dezenas de specs, e um sexto por causa de uma LEITURA mudaria a assinatura que código já validado
 * usa (§A.26). Mesma escolha que `motivosDeCancelamentoAtivos` no `VagasService`.
 */
import { motivosDeDescarteAtivos } from "../motivos-descarte/motivos-descarte.service";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidatos,
  asCandidaturaEntrevistas,
  asCandidaturaEtapas,
  asCandidaturas,
  asContatos,
  asEtapasFunil,
  asRetencaoEventos,
  cargos,
  clientes,
  usuarios,
  vagas,
} from "../../db/schema";
import {
  movimentoPermitido,
  cabeMaisUm,
  decidirAlocacao,
  ACEITE_REENTRADA,
  kpisDoFunil,
  ocupacaoDaVaga,
  ocupadasPorLado,
  ACEITE_BANCO_COM_OFICIAIS_ABERTAS,
  SITUACOES_VIVAS,
  SITUACOES_QUE_CONSOMEM_POSICAO,
  candidaturaViva,
  consomePosicao,
  desvinculoEhDeMaster,
  finalizaPosicao,
  ladoDaCandidatura,
  ladoGravado,
  ocupaPosicao,
  podeReverterEnvio,
  SITUACAO_APOS_REVERTER_ENVIO,
  SITUACAO_QUE_A_REVERSAO_DESFAZ,
  oficiaisAindaAbertas,
  tetoDoLado,
  type PosicaoLado,
  type SituacaoQueOcupaPosicao,
} from "../../domain/candidatura";
import {
  camposComProcedenciaDaPlanilha,
  type CampoDoPrePreenchimento,
} from "../../domain/as-planilha-prepreenchimento";
import { ordenarLinhaDoTempo, tipoDoEvento } from "../../domain/candidatura-historico";
import { acaoDaRetencao } from "../../domain/retencao-evento";

/**
 * A TRANSAÇÃO COMO O DRIZZLE A ENTREGA, derivada do próprio tipo do cliente e nunca escrita à mão:
 * um apelido digitado divergiria do `Database` na primeira troca de driver. Mesma definição de
 * `encerrar-candidatura.ts`, pelo mesmo motivo.
 */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/*
 * A GRAVAÇÃO DA SAÍDA SAIU DAQUI E VIROU FUNÇÃO DE MÓDULO (ver o arquivo, que explica por quê): o
 * cancelamento FORÇADO da vaga precisa do MESMO gesto dentro da transação dele, e duas cópias da
 * saída divergiriam no primeiro ajuste. A régua não mudou uma vírgula.
 */
import { gravarSaidaDaCandidatura } from "./encerrar-candidatura";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { PortalEnvioService } from "../../portal/portal-envio.service";
import { AdmissoesService, type PreAdmissaoDoFunilInput } from "../../admissoes/admissoes.service";
import { VagaStatusService, type ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
/*
 * A DERIVAÇÃO DO STATUS DA VAGA (Frente B, ponto 2) É UMA ROTINA DE MÓDULO, e ela mora em
 * `as/vagas/` porque o dado que ela escreve é da VAGA. Importada como FUNÇÃO, e não injetada como
 * serviço, de propósito: ela recebe a `tx` de quem a chama e roda DENTRO da transação do fato que a
 * disparou. Um serviço com `db` próprio abriria uma segunda transação e o estado da vaga poderia
 * ficar para trás quando a escrita principal desse certo.
 */
import { derivarStatusDaVaga } from "../vagas/derivar-status-da-vaga";
/*
 * O ATALHO QUE IMPEDE A DERIVAÇÃO DE COBRAR UM LOCK POR GESTO. A prova de que ele não perde
 * movimento nenhum está no domínio, junto da função: só muda a resposta quem TOCA uma etapa de
 * entrega ao cliente.
 */
import {
  movimentoPodeMudarAEntrega,
  papelDeVagaEmProcesso,
} from "../../domain/vaga-status-derivado";
import type { AuthUser } from "../../auth/auth.types";
/*
 * OS DOIS NÚMEROS DA PÁGINA VÊM DO DTO, e não são redigitados aqui: o `@Max` do corpo e o teto que o
 * service aplica têm de ser O MESMO número, senão um corpo com `limite: 400` passaria a validação e
 * seria cortado em silêncio por um teto menor escrito no service. É valor, então a importação NÃO
 * pode ser `import type`.
 */
import { BUSCA_LIMITE_MAXIMO, BUSCA_LIMITE_PADRAO } from "./candidatos.dto";
import type {
  AdicionarEmLoteDto,
  AdicionarPorFiltroDto,
  AlocarEmVagaDto,
  BuscarCandidatosDto,
  CandidaturasDaVagaDto,
  CriarCandidatoDto,
  EditarCandidatoDto,
  FinalizarPosicaoDto,
  FinalizarPosicaoEmLoteDto,
  FinalizarPosicaoPorFiltroDto,
  MarcarEntrevistaDto,
  MoverEtapaDto,
  MoverEtapaEmLoteDto,
  MoverEtapaPorFiltroDto,
  RegistrarContatoDto,
  RegistrarSaidaDto,
  RegistrarSaidaEmLoteDto,
  RegistrarSaidaPorFiltroDto,
  ReprovarPeloClienteDto,
  TrocarVagaDto,
  TrocarVagaEmLoteDto,
  TrocarVagaPorFiltroDto,
} from "./candidatos.dto";

/**
 * CENTRAL DE CANDIDATOS (A&S, onda 1): a pessoa, a candidatura e o histórico.
 *
 * A OCUPAÇÃO DA VAGA É SEMPRE DERIVADA, NUNCA ARMAZENADA. Não existe coluna "ocupadas" em lugar
 * nenhum: toda vez que a pergunta é feita, as candidaturas são contadas. É a mesma decisão que a
 * vaga já tinha tomado com os contadores dela, pelo mesmo motivo: um contador guardado é um segundo
 * número, e dois números que deveriam ser iguais acabam discordando.
 *
 * §A.6, E ESTE MÓDULO É O CASO MAIS SENSÍVEL DO SISTEMA ATÉ AQUI, porque guarda dado pessoal de quem
 * AINDA NÃO É FUNCIONÁRIO. As regras aplicadas aqui, e o lugar exato de cada uma:
 *   1. CPF NUNCA EM LOG. Este arquivo não tem `Logger` nenhum, e é deliberado: sem logger não há
 *      como o CPF vazar por um `logger.debug` acrescentado com pressa numa correção futura.
 *   2. CPF NUNCA EM MENSAGEM DE ERRO. Toda frase de erro fala do CPF sem repetir o número, incluindo
 *      a de duplicidade, que é a que mais tentaria repetir ("o CPF X já existe").
 *   3. CPF NUNCA EM URL NEM EM QUERY STRING. A busca é POST e o número viaja no CORPO. Não existe
 *      rota GET de listagem neste módulo, para não sobrar a porta em que alguém acrescentaria
 *      `?cpf=` sem pensar.
 *   4. MINIMIZAÇÃO NO RETORNO. A LISTA não devolve CPF, e-mail, telefone nem data de nascimento:
 *      devolve `temCpf`, um booleano. O número sai só na FICHA de um candidato.
 *   5. GUARD DE ÁREA cobrindo tudo: a controller inteira é reivindicada pelo menu `as-candidatos`,
 *      leitura incluída, e o menu nasce só para o SUPER_ADMIN (§A.23).
 */
/**
 * O ID DO CANDIDATO, QUALIFICADO À MÃO, para uso DENTRO de subconsulta correlacionada.
 *
 * O PORQUÊ, MEDIDO E NÃO DEDUZIDO. Numa consulta de UMA tabela só, o drizzle renderiza a coluna
 * interpolada de formas diferentes conforme o lugar:
 *   - no WHERE, ele QUALIFICA: `where "as_candidaturas"."candidato_id" = "as_candidatos"."id"`, e a
 *     correlação funciona (foi assim que os filtros por vaga e "sem candidatura" sempre funcionaram);
 *   - na LISTA DO SELECT, ele NÃO qualifica: `where "candidato_id" = "id"`. Dentro da subconsulta os
 *     dois nomes resolvem contra `as_candidaturas`, a comparação vira `candidato_id = id` da própria
 *     tabela, nunca casa, e o contador dá SEMPRE ZERO. Medido: uma pessoa com candidatura ATIVA
 *     aparecia com 0.
 *
 * É o mesmo defeito do livreto de grupos e da tela do iFractal, os dois na lista do select (lá o
 * contador exibia o TOTAL DA BASE em todas as linhas, porque a comparação virava sempre verdadeira).
 *
 * Qualificar à mão vale para os três pontos, e não só para o quebrado: um filtro que hoje está certo
 * por causa de um detalhe de renderização não é um filtro que se possa confiar amanhã.
 */
const ID_DO_CANDIDATO = sql`${asCandidatos}.${sql.identifier("id")}`;

/**
 * A RECUSA DA REVERSÃO, EM UMA FRASE SÓ, porque ela é dita em DOIS lugares do mesmo método: na
 * leitura que decide e no `update` que só afeta a linha se ela ainda estiver enviada.
 *
 * DECLARADA AQUI, e não digitada duas vezes, pelo motivo de sempre: as duas respondem à MESMA
 * pergunta, e duas redações da mesma recusa divergem na primeira vírgula reescrita, fazendo a
 * mesma régua parecer duas dependendo de qual das duas o consultor esbarrou.
 *
 * ELA DIZ O QUE ACONTECEU E O QUE FAZER, porque quem a lê está no meio de uma correção: ou a tela
 * está desatualizada (outra pessoa já mexeu na linha), ou o clique foi na linha errada.
 */
const NAO_HA_ENVIO_A_REVERTER =
  "Esta candidatura não está enviada para admissão, então não há envio a reverter. Recarregue a página para ver a situação atual.";

/*
 * ─ O VALOR ESPECIAL "FORA DO FUNIL" DO FILTRO DE ETAPA (paginacao no servidor, 07/10/2026) ──────
 *
 * A tabela do painel da vaga nao mostra etapa de quem SAIU do funil: a etapa de uma candidatura
 * encerrada e memoria, nao posicao atual (`etapaVisivel` em `as-painel-recorte.ts`, no frontend).
 * Entao o filtro de etapa tambem fala essa lingua: este valor casa "quem saiu do funil", e o
 * servidor o traduz em `situacao NOT IN (vivas)`. O literal e o MESMO do frontend (`ETAPA_FORA_DO_FUNIL`):
 * e um valor de filtro que os dois lados trocam no corpo, entao tem de ser identico byte a byte.
 */
const ETAPA_FORA_DO_FUNIL = "__FORA_DO_FUNIL__";

@Injectable()
export class CandidatosService {
  /**
   * `EtapasFunilService` É A FONTE DA LISTA DE ETAPAS, e entra aqui por injeção porque ela deixou de
   * ser constante de código: é o diretor quem cadastra, renomeia e inativa. Este service usa o
   * catálogo em DOIS pontos, e os dois eram silenciosos antes: a etapa em que a candidatura NASCE
   * (que era o `DEFAULT` da coluna) e a validação da etapa de DESTINO (que era um `@IsIn` estático).
   */
  /**
   * O PRIMEIRO `Logger` DESTE ARQUIVO, e ele nasce com uma régua: §A.6, nada de nome, e-mail, CPF
   * nem id de pessoa nas mensagens. O que ele registra são CÓDIGOS de catálogo e nomes de classe
   * de erro, que é o mesmo limite que `portal-correio.service.ts` e `portal-emissor.service.ts`
   * já cumprem. Ele existe porque os dois ganchos do Portal ABSORVEM falha de propósito, e falha
   * absorvida sem registro é falha que ninguém descobre.
   */
  private readonly log = new Logger(CandidatosService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly etapas: EtapasFunilService,
    /**
     * O CATÁLOGO DE STATUS DA VAGA (onda B2). Ele responde a TRAVA 2 deste arquivo, "esta vaga
     * recebe candidato novo?", que antes era a função pura `vagaRecebeCandidato`.
     *
     * ┌─ A MUDANÇA QUE IMPORTA NÃO É A FONTE, É A SINCRONIA ────────────────────────────────────┐
     * │ A função pura podia ser chamada em qualquer lugar sem pensar. A régua é lida com UM       │
     * │ `await`, SEMPRE ANTES DA TRANSAÇÃO, e perguntada lá dentro SEM `await`. Os cinco pontos   │
     * │ que fazem esta pergunta continuam exatamente onde estavam: os DOIS que rodam sob o        │
     * │ `SELECT ... FOR UPDATE` continuam lá dentro (é a correção de 09/09, e tirá-los seria      │
     * │ decidir sobre uma fotografia velha) e os TRÊS que são pré-conferência de UX continuam     │
     * │ fora, sem substituir a travada.                                                          │
     * └─────────────────────────────────────────────────────────────────────────────────────────┘
     */
    private readonly statusVaga: VagaStatusService,
    /**
     * O ENVIO DO LINK DO PORTAL, e ele é a ÚNICA porta deste arquivo para uma frente da Admissão.
     *
     * ┌─ POR QUE UM SERVIÇO INTEIRO, E NÃO UM `update` daqui ───────────────────────────────────┐
     * │ Quem escreve em `portal_links` é UM arquivo só (`portal-identidade.service.ts`), e é     │
     * │ essa unicidade que torna auditável a régua do que pode ser gravado sobre um link. Este   │
     * │ arquivo sabe o funil, não sabe (e não deve saber) o que é um link vivo, o que é o prazo  │
     * │ de 72 horas nem o que pode ir para dentro de um e-mail.                                  │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * ELE É INERTE HOJE: `as_candidaturas.admissao_id` ainda nasce nula, então o envio devolve
     * `SEM_ADMISSAO` e não faz nada. Liga sozinho no dia da ponte A&S para Esteira.
     */
    private readonly envioDoPortal: PortalEnvioService,
    /**
     * A PONTE A&S → ESTEIRA. É a ÚNICA porta deste arquivo para o NÚCLEO da Admissão, usada só no ramo
     * `ENVIADO_PARA_ADMISSAO` de `registrarSaida`: nascer a pré-admissão (AGUARDANDO_LIBERACAO) e
     * computar a duplicidade viva por CPF. Não lê tabela da Admissão daqui, nem escreve nela por fora
     * deste serviço: quem grava é o `AdmissoesService`, do outro lado da porta.
     *
     * `@Optional()` pelo MESMO motivo do `pandapeQueue`/`reguaCompletude` do próprio `AdmissoesService`:
     * as ~14 specs deste módulo constroem `new CandidatosService(db, etapas, statusVaga, envioDoPortal)`
     * com quatro argumentos, e um quinto obrigatório quebraria todas de uma vez. Em PRODUÇÃO o
     * `AsModule` importa o `AdmissoesModule`, então ele está SEMPRE presente; ausente só em teste que
     * não exercita a ponte (o teste que a exercita passa um dublê no quinto argumento).
     */
    @Optional() private readonly admissoes?: AdmissoesService,
  ) {}

  // ── A PESSOA ──────────────────────────────────────────────────────────────

  /**
   * CADASTRAR, com DEDUP POR CPF.
   *
   * O DEDUP TEM DUAS CAMADAS, e as duas importam. A primeira é esta consulta, que existe para a
   * pessoa receber uma frase em português e o `candidatoId` de quem já está cadastrado, para a tela
   * poder oferecer "abrir o cadastro existente". SÓ O ID, e nunca o nome: ver `conflitoDeCpf`. A segunda é o UNIQUE PARCIAL no banco, que é o que
   * de fato garante: dois cliques simultâneos passam pela primeira camada juntos, e é a segunda que
   * derruba o segundo. Por isso a violação de unique é capturada e traduzida logo abaixo, em vez de
   * virar erro 500.
   *
   * §A.6: nem a consulta nem a mensagem repetem o número.
   *
   * ┌─ POR QUE O CADASTRO VIROU TRANSACIONAL, E ELE NÃO ERA ─────────────────────────────────────┐
   * │ A RETENÇÃO (`banco_talentos`) É A ÚNICA MARCA DO SISTEMA QUE CONCEDE VIDA ETERNA A DADO    │
   * │ PESSOAL, e ela tem cadeado de SUPER_ADMIN. Fechar só a EDIÇÃO deixaria a porta ao lado     │
   * │ escancarada: quem quisesse imortalizar alguém cadastraria a pessoa de novo, já marcada.    │
   * │                                                                                            │
   * │ E A TENTATIVA RECUSADA TAMBÉM VIRA LINHA DE TRILHA, que é o que obriga a transação: a      │
   * │ linha de `RECUSADO` precisa do `candidato_id`, que só existe DEPOIS do insert. Cadastro    │
   * │ gravado com a trilha da tentativa perdida é o modo de falha da §A.33 aplicado aqui: do     │
   * │ ponto de vista do sistema nada falhou, e a tentativa some.                                 │
   * │                                                                                            │
   * │ O AUTOR CHEGA INTEIRO (`AuthUser`), E NÃO SÓ O `id`, porque aqui se confere PAPEL além de  │
   * │ registrar QUEM. A trilha (`criadoPorId`) continua vindo da sessão, nunca do corpo.         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async criar(dto: CriarCandidatoDto, autor: AuthUser): Promise<AsCandidatoFicha> {
    const cpf = this.cpfOuNulo(dto.cpf);

    if (cpf) {
      // §A.6: O NOME NÃO É SELECIONADO, e a ausência dele aqui é metade da guarda. A consulta
      // pedia `nome` só para compor a frase do 409, e o que não é selecionado não tem como vazar.
      const [existente] = await this.db
        .select({ id: asCandidatos.id })
        .from(asCandidatos)
        .where(eq(asCandidatos.cpf, cpf));
      if (existente) throw this.conflitoDeCpf(existente.id);
    }

    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(asCandidatos)
          .values({
            nome: dto.nome.trim(),
            cpf,
            email: texto(dto.email),
            telefone: texto(dto.telefone),
            dataNascimento: texto(dto.dataNascimento),
            cidade: texto(dto.cidade),
            uf: dto.uf ?? null,
            origem: dto.origem ?? "MANUAL",
            /*
             * `bancoTalentos` NÃO ESTÁ NESTA LISTA, E A AUSÊNCIA É A TRAVA, não um esquecimento.
             * A coluna tem UM escritor só, `aplicarRetencao`, que confere papel e grava a trilha na
             * mesma transação. Enquanto este `insert` não a listar, toda porta futura que insira
             * candidato sem passar por lá (a INGESTÃO da onda 4, que insere SEM usuário autor)
             * nasce PROIBIDA de conceder retenção, sem ninguém precisar lembrar disso.
             */
            criadoPorId: autor.id,
          })
          .returning({ id: asCandidatos.id });

        // A pessoa nasce SEM retenção (o default da coluna). Só há o que decidir quando o corpo
        // trouxe um BOOLEANO: aí o cadeado e a trilha entram, na MESMA transação do cadastro.
        // Sobre o teste ser por `typeof`, e não por `!== undefined`, ver `aplicarRetencao`.
        if (typeof dto.bancoTalentos === "boolean") {
          await this.aplicarRetencao(tx, row.id, dto.bancoTalentos, autor);
        }
        return row.id;
      });
    } catch (err) {
      // A SEGUNDA CAMADA DO DEDUP chegando: a corrida entre dois cadastros simultâneos com o mesmo
      // CPF. Sem esta tradução, o consultor veria um 500 e teria certeza de que o sistema quebrou.
      throw this.traduzirUnique(err);
    }

    return this.ficha(id);
  }

  /**
   * EDITAR a ficha. Mesmo dedup do cadastro, porque preencher o CPF depois é o caminho normal aqui:
   * a pessoa entra sem CPF na captação e informa o número quando o processo avança.
   *
   * ┌─ ESTA PORTA RE-IDENTIFICAVA QUEM O EXPURGO JÁ TINHA ANONIMIZADO (furo 2 de LGPD) ──────────┐
   * │ O `set` abaixo monta nome, CPF, e-mail, telefone e nascimento e gravava por `where eq(id)`, │
   * │ SEM OLHAR `anonimizado_em`. Uma edição depois do expurgo devolvia o dado pessoal à linha e  │
   * │ NADA FALHAVA: do ponto de vista do sistema foi um salvamento comum. O expurgo existe para   │
   * │ que aquele dado não esteja mais ali, e esta era a porta que o colocava de volta.            │
   * │                                                                                             │
   * │ A GUARDA TEM DUAS CAMADAS, E NENHUMA DAS DUAS BASTA SOZINHA:                                │
   * │   1. a RECUSA pela leitura, logo abaixo, que é a que impede o dado pessoal de sequer entrar │
   * │      num `set`, e a que dá ao consultor uma frase em vez de um salvamento mudo;             │
   * │   2. a CLÁUSULA `anonimizado_em is null` NO `where` mais a CONTAGEM DE LINHAS AFETADAS, que │
   * │      é a que vale contra a CORRIDA: leitura e escrita não são atômicas, e a varredura roda  │
   * │      de hora em hora. Quem decidisse só pela leitura de antes deixaria passar exatamente a  │
   * │      edição que começou meio segundo antes do expurgo.                                      │
   * │                                                                                             │
   * │ E A CLÁUSULA SOZINHA SERIA PIOR DO QUE NADA: ela atualizaria ZERO linhas EM SILÊNCIO, o     │
   * │ método seguiria, devolveria `ficha(id)` (a ficha velha) e a tela mostraria "salvo" para um  │
   * │ salvamento que não existiu. Salvamento que não salva é pior que erro, porque ninguém vai    │
   * │ atrás. Por isso QUEM DECIDE É A CONTAGEM DE LINHAS, e nunca a leitura de antes.             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A CICATRIZAÇÃO É A OUTRA METADE, e ela não mora aqui: a recusa protege o FUTURO, e o passado
   * (qualquer linha já re-identificada) é reparado pela varredura, em `RetencaoCandidatosService`,
   * CTE `pessoais_cicatrizados`. Uma metade sem a outra não fecha o furo.
   */
  async editar(id: string, dto: EditarCandidatoDto, autor: AuthUser): Promise<AsCandidatoFicha> {
    const atual = await this.db.query.asCandidatos.findFirst({ where: eq(asCandidatos.id, id) });
    if (!atual) throw new NotFoundException("Candidato não encontrado.");
    if (atual.anonimizadoEm) throw this.recusaPorAnonimizacao();

    const cpf = dto.cpf === undefined ? atual.cpf : this.cpfOuNulo(dto.cpf);
    if (cpf && cpf !== atual.cpf) {
      // §A.6: sem `nome` na projeção, pelo mesmo motivo do `criar`.
      const [outro] = await this.db
        .select({ id: asCandidatos.id })
        .from(asCandidatos)
        .where(and(eq(asCandidatos.cpf, cpf), ne(asCandidatos.id, id)));
      if (outro) throw this.conflitoDeCpf(outro.id);
    }

    try {
      await this.db.transaction(async (tx) => {
        const gravadas = await tx
          .update(asCandidatos)
          .set({
            nome: dto.nome?.trim() ?? atual.nome,
            cpf,
            email: dto.email === undefined ? atual.email : texto(dto.email),
            telefone: dto.telefone === undefined ? atual.telefone : texto(dto.telefone),
            dataNascimento:
              dto.dataNascimento === undefined ? atual.dataNascimento : texto(dto.dataNascimento),
            cidade: dto.cidade === undefined ? atual.cidade : texto(dto.cidade),
            uf: dto.uf === undefined ? atual.uf : (dto.uf ?? null),
            origem: dto.origem ?? atual.origem,
            /*
             * ─ `bancoTalentos` NÃO ENTRA NESTE `set`, E ESSA É A FORMA DA GUARDA ────────────────
             *
             * A retenção é escrita SÓ por `aplicarRetencao`, logo abaixo, e nunca junto do resto da
             * ficha. Guardar por "comparar e recusar" teria três contornos, e ficar FORA do `set`
             * mata os três de uma vez:
             *   1. `null` contra `undefined`: `@IsOptional()` deixa `null` passar, e uma guarda
             *      escrita como `!== undefined` recusaria um salvamento que não muda nada;
             *   2. o VALOR IGUAL: reenviar o mesmo valor não é mudança e não pode ser recusado,
             *      senão todo salvamento de formulário do consultor COMUM quebra;
             *   3. a LEITURA E A ESCRITA NÃO SÃO ATÔMICAS: um COMUM com o formulário desatualizado
             *      mandaria o valor velho e DESFARIA EM SILÊNCIO a decisão de um SUPER_ADMIN,
             *      devolvendo ao expurgo irreversível alguém que fora tornado permanente.
             */
            atualizadoEm: new Date(),
          })
          /*
           * A CLÁUSULA QUE O BANCO AVALIA NO INSTANTE DA ESCRITA. A conferência em memória, lá em
           * cima, não cobre a corrida: entre o `findFirst` e este `update` cabe a varredura de
           * retenção, e sem esta linha as duas requisições passariam juntas pela conferência e a
           * segunda regravaria o dado pessoal na pessoa que o expurgo acabou de anonimizar.
           */
          .where(and(eq(asCandidatos.id, id), isNull(asCandidatos.anonimizadoEm)))
          .returning({ id: asCandidatos.id });

        /*
         * ZERO LINHA AFETADA NÃO É SUCESSO, e é aqui que a segunda camada vira RECUSA VISÍVEL. A
         * linha existe (o `findFirst` a achou), então a única razão de o `update` não alcançá-la é
         * ela ter deixado de satisfazer a régua entre a leitura e a escrita. Seguir daqui devolveria
         * 200 com a ficha velha. Lançar dentro da transação também DESFAZ o `aplicarRetencao`, que
         * de outro modo gravaria trilha de uma edição que não aconteceu.
         */
        if (gravadas.length === 0) throw this.recusaPorAnonimizacao();

        if (typeof dto.bancoTalentos === "boolean") {
          await this.aplicarRetencao(tx, id, dto.bancoTalentos, autor);
        }
      });
    } catch (err) {
      // `traduzirUnique` devolve o próprio erro quando ele já é um `Error`, então a recusa acima
      // atravessa daqui inteira, com o status dela. Só violação de unique vira outra frase.
      throw this.traduzirUnique(err);
    }

    return this.ficha(id);
  }

  /**
   * ─ A RECUSA DE EDITAR UM CADASTRO JÁ ANONIMIZADO ──────────────────────────────────────────────
   *
   * §A.6 NA MENSAGEM, E ESTA É A PARTE MAIS FÁCIL DE ERRAR SEM PERCEBER: a frase natural de
   * escrever aqui ("o CPF 000... pertence a um cadastro expurgado") publicaria justamente o dado
   * que o expurgo apagou, e mensagem de erro é de onde o dado mais facilmente cai num log de
   * aplicação. Não entra CPF, nem nome, nem e-mail, nem telefone: a frase diz O QUE ACONTECEU e o
   * que a pessoa pode fazer, e nada mais.
   *
   * 409 E NÃO 400: o corpo enviado não tem defeito nenhum, quem mudou foi o ESTADO do cadastro.
   */
  private recusaPorAnonimizacao(): ConflictException {
    return new ConflictException(
      "Este cadastro foi anonimizado por prazo de retenção e não aceita mais edição. " +
        "Se a pessoa voltou a participar de um processo, cadastre-a de novo.",
    );
  }

  /**
   * ─ O ÚNICO ESCRITOR DE `as_candidatos.banco_talentos`, COM CADEADO E TRILHA ───────────────────
   *
   * A RETENÇÃO É A ÚNICA MARCA DO SISTEMA QUE CONCEDE VIDA ETERNA A DADO PESSOAL: marcada, a pessoa
   * nunca é alcançada pelo expurgo, e desmarcá-la a devolve a uma anonimização IRREVERSÍVEL que
   * apaga CPF, e-mail, telefone e nascimento. Por isso ela tem UM escritor, e ele é este.
   *
   * ┌─ POR QUE O VALOR ATUAL É LIDO AQUI DENTRO, COM A LINHA TRAVADA ────────────────────────────┐
   * │ O `SELECT ... FOR UPDATE` acontece na MESMA transação da escrita, e não na leitura que o    │
   * │ método chamador já fez. Duas requisições simultâneas sobre a mesma pessoa leriam o mesmo    │
   * │ valor velho lá fora, e a segunda gravaria por cima da primeira com a trilha contando uma    │
   * │ transição que nunca existiu ("de false para true" duas vezes). Travada a linha, a segunda   │
   * │ espera, relê e descobre que não há mudança nenhuma a fazer.                                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O TESTE DE ENTRADA É `typeof === "boolean"`, E NUNCA `!== undefined` ─────────────────────┐
   * │ `@IsOptional()` do class-validator pula a validação para `undefined` E PARA `null`, então um │
   * │ corpo com `"bancoTalentos": null` PASSA e desce até aqui. Lido como mudança, ele custa caro  │
   * │ nas duas pontas: para quem NÃO é SUPER_ADMIN vira uma linha de `RECUSADO` que ninguém        │
   * │ decidiu, enchendo a auditoria de ruído e escondendo a tentativa de verdade; para quem É,     │
   * │ leva `null` a uma coluna NOT NULL, o banco derruba a transação inteira e a ficha para de     │
   * │ salvar por causa de um campo que ninguém tocou. `null` não é decisão: é o campo que a tela   │
   * │ não preencheu, e o chamador o descarta antes de chegar aqui.                                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ QUEM NÃO É SUPER_ADMIN NÃO ESCREVE, E A TENTATIVA REAL VIRA LINHA ────────────────────────┐
   * │ VALOR IGUAL AO DO BANCO NÃO É TENTATIVA: é o formulário devolvendo o que leu, e ele sai por │
   * │ cima sem trilha nenhuma. Registrá-lo encheria a tabela de ruído e esconderia a linha que    │
   * │ importa.                                                                                    │
   * │                                                                                             │
   * │ MUDANÇA REAL DE QUEM NÃO PODE VIRA `RECUSADO`, e a gravação NÃO acontece. A linha existe    │
   * │ porque a pergunta de auditoria não é só "quem conseguiu", é "QUEM TENTOU": tentativa        │
   * │ repetida pelo mesmo autor é o sinal de uso indevido, e o protocolo proíbe registrar isso no │
   * │ log de acesso, onde não pode haver PII.                                                     │
   * │                                                                                             │
   * │ A RECUSA NÃO DERRUBA O SALVAMENTO, e isso é deliberado: derrubar faria o formulário         │
   * │ desatualizado de um COMUM bloquear a edição do NOME de uma pessoa por causa de uma caixa    │
   * │ que ele nem sabe que existe. Quem impede o gesto antes dele acontecer é a TELA, que não     │
   * │ oferece o controle a quem não é SUPER_ADMIN, e o que garante que ele não teve efeito é esta │
   * │ guarda. A trilha é o que torna a recusa consultável em vez de silenciosa.                    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: a linha gravada tem um id de candidato, dois booleanos, um id de usuário e uma data.
   * Nenhum nome, nenhum CPF, nenhum texto livre, e nada disto vai para log.
   */
  private async aplicarRetencao(
    tx: DbTransaction,
    candidatoId: string,
    valor: boolean,
    autor: AuthUser,
  ): Promise<void> {
    const [linha] = await tx
      .select({ atual: asCandidatos.bancoTalentos })
      .from(asCandidatos)
      .where(eq(asCandidatos.id, candidatoId))
      .for("update");
    if (!linha) throw new NotFoundException("Candidato não encontrado.");

    // NÃO É MUDANÇA: sai por cima, sem escrita e sem trilha, para qualquer papel.
    if (linha.atual === valor) return;

    const podeMexer = autor.papel === "SUPER_ADMIN";
    if (podeMexer) {
      await tx
        .update(asCandidatos)
        .set({ bancoTalentos: valor, atualizadoEm: new Date() })
        .where(eq(asCandidatos.id, candidatoId));
    }

    // A MUDANÇA E A TRILHA CAEM JUNTAS: as duas escritas estão na mesma transação do chamador.
    // Marca sem trilha é a §A.33 aplicada aqui, e trilha sem marca mentiria sobre o que houve.
    await tx.insert(asRetencaoEventos).values({
      candidatoId,
      acao: acaoDaRetencao(valor),
      de: linha.atual,
      para: valor,
      autorId: autor.id,
      resultado: podeMexer ? "APLICADO" : "RECUSADO",
    });
  }

  /**
   * BUSCAR, e o resultado é DELIBERADAMENTE POBRE (§A.6, minimização).
   *
   * A lista devolve `temCpf`, um booleano, e nenhum identificador direto. A lista é a superfície que
   * mais circula (fica aberta na tela, entra em captura de tela, é a primeira coisa que alguém
   * pediria para exportar), e nada nela precisa do número: quem precisa é a ficha, que é uma pessoa
   * por vez e um clique deliberado.
   *
   * A BUSCA POR CPF É EXATA, sobre o CPF INTEIRO. Busca parcial por CPF ("termina em 789") seria
   * vazamento por sondagem: com poucas tentativas se confirma o número de alguém que se suspeita
   * estar na base.
   */
  async buscar(dto: BuscarCandidatosDto): Promise<AsCandidatosPagina> {
    /*
     * O TAMANHO DA PÁGINA, com o padrão ANTIGO preservado (200) e um TETO acima dele. O padrão fica
     * onde estava porque ele já era o que as telas recebiam; o que mudou é que agora ele é dizível
     * (`limite` na resposta) e ultrapassável por quem pedir, até o teto.
     *
     * O TETO É BARREIRA, NÃO REGRA DE NEGÓCIO, pelo mesmo argumento de `AS_MAXIMO_POR_LOTE`: sem
     * ele, `limite: 999999` transformaria a rota numa exportação da base inteira de dado pessoal
     * (§A.6). Quem precisa de mais de uma página pagina.
     */
    const limite = Math.min(Math.max(dto.limite ?? BUSCA_LIMITE_PADRAO, 1), BUSCA_LIMITE_MAXIMO);
    const offset = Math.max(dto.offset ?? 0, 0);

    const filtros = [];

    /*
     * ┌─ CPF PREENCHIDO E ILEGÍVEL AGORA RECUSA, E ANTES MENTIA DE DUAS FORMAS (ponto 15) ────────┐
     * │ O QUE HAVIA: `if (dto.cpf) { ...; if (!cpf) return []; }`. Duas mentiras, em direções      │
     * │ OPOSTAS, e nenhuma das duas dizia à pessoa o que estava errado:                            │
     * │                                                                                            │
     * │  1. `return []` SILENCIOSO: a tela mostrava "nenhum candidato encontrado", que é uma        │
     * │     RESPOSTA sobre a base ("esta pessoa não está cadastrada"), quando o fato era outro      │
     * │     ("o que você digitou não é um CPF"). Quem lê a tela conclui a coisa errada e cadastra   │
     * │     de novo alguém que já existe.                                                          │
     * │  2. O `if (dto.cpf)` TRUNCADO: o `@Transform` do DTO deixa só dígitos, então "abc" chega    │
     * │     como STRING VAZIA, que é falsa, e o filtro era simplesmente PULADO. A busca por um CPF  │
     * │     ilegível devolvia A BASE INTEIRA, que é a mentira contrária e a mais perigosa das duas. │
     * │                                                                                            │
     * │ A RÉGUA DE HOJE: o campo foi ENVIADO (`!== undefined`), então ou ele vira um CPF completo   │
     * │ e válido, ou a chamada é RECUSADA com uma frase. Nunca uma lista.                          │
     * │                                                                                            │
     * │ §A.6: a recusa NÃO repete o número recebido. O validador continua sendo um só               │
     * │ (`cpfOuNulo` → `isValidCpf`): não nasce aqui um segundo, que divergiria do primeiro.        │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (dto.cpf !== undefined) {
      const cpf = this.cpfOuNulo(dto.cpf);
      if (!cpf) {
        throw new BadRequestException(
          "Para buscar por CPF, informe os 11 dígitos. Para procurar pelo nome, use o campo de nome.",
        );
      }
      filtros.push(eq(asCandidatos.cpf, cpf));
    }

    const nome = dto.nome?.trim();
    if (nome) {
      // Sem acento e sem caixa, para "joao" achar "João". `unaccent` não está instalado no banco,
      // então a comparação é feita com `translate`, que resolve o alfabeto que interessa aqui.
      filtros.push(
        sql`translate(lower(${asCandidatos.nome}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
            like ${"%" + semAcento(nome) + "%"}`,
      );
    }
    if (dto.origem) filtros.push(eq(asCandidatos.origem, dto.origem));

    if (dto.vagaId) {
      filtros.push(
        sql`exists (select 1 from ${asCandidaturas}
                    where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                      and ${asCandidaturas.vagaId} = ${dto.vagaId})`,
      );
    }

    /**
     * QUEM NÃO ESTÁ EM VAGA NENHUMA: a lista de escolha do botão "Alocar candidato".
     *
     * ┌─ A RÉGUA VOLTOU A SER "SEM CANDIDATURA **VIVA**" (ponto 13, decisão do diretor) ──────────┐
     * │ O QUE ELA FOI POR UM TEMPO, e o dano medido: "sem candidatura NENHUMA". Com essa régua,    │
     * │ QUEM FOI DESCARTADO UMA VEZ NUNCA MAIS APARECIA em lista de alocação nenhuma, para sempre, │
     * │ mesmo estando livre. Não é hipótese: o diretor descartou uma pessoa e não a achou mais.    │
     * │                                                                                           │
     * │ O ARGUMENTO QUE SUSTENTAVA A RÉGUA APERTADA ERA O "TRAZER DE VOLTA", que nasce na LINHA da │
     * │ pessoa encerrada DENTRO DA VAGA em que ela saiu. Ele resolve UMA pergunta ("trazer de volta│
     * │ para ESTA vaga") e não resolve a outra ("alocar esta pessoa em QUALQUER vaga"): para achar │
     * │ alguém descartado na vaga A e levá-lo à vaga B seria preciso saber de cor em que vaga ele  │
     * │ tinha saído. Os dois caminhos não eram excludentes; um deles simplesmente não existia.     │
     * │                                                                                           │
     * │ A RÉGUA DE HOJE É A DA VIVACIDADE, e ela é a MESMA de `candidaturasAtivas` logo abaixo,    │
     * │ lida da MESMA constante (`SITUACOES_VIVAS`, derivada de `candidaturaViva`). Não existe uma │
     * │ terceira régua aqui: filtro e coluna discordando na mesma tela é o defeito que a constante │
     * │ única veio eliminar, e ele apareceria na primeira situação nova.                           │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * O QUE CONTINUA FORA, e é a metade que não pode afrouxar junto: quem tem candidatura VIVA
     * (`ATIVO`, `APROVADO`, `ALOCADO`, `ENVIADO_PARA_ADMISSAO`) NÃO aparece. Alocá-lo de novo seria
     * recusado pelo unique parcial `uq_as_candidaturas_viva` na vaga em que ele já está, e oferecê-lo
     * na lista faria a tela propor um gesto que o banco recusa.
     *
     * `not exists` E NÃO `count(...) = 0`: o Postgres para na primeira linha encontrada, enquanto a
     * contagem percorreria todas as candidaturas da pessoa para descobrir o mesmo.
     *
     * §A.6: o retorno é o MESMO da busca normal, com `temCpf` no lugar do número. A tela de escolha
     * mostra nome, cidade/UF e o booleano, e é tudo o que ela precisa para o consultor escolher.
     */
    if (dto.semCandidatura) {
      filtros.push(
        sql`not exists (select 1 from ${asCandidaturas}
                         where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                           and ${inArray(asCandidaturas.situacao, SITUACOES_VIVAS)})`,
      );
    }

    /*
     * ┌─ OS TRES FILTROS QUE SAIRAM DO NAVEGADOR PARA A BASE (paginacao no servidor, 07/10/2026) ──┐
     * │ escopo, cliente e etapa recortavam a tela em `linhasSemCard` (`as/candidatos/page.tsx`), e  │
     * │ nunca houve como aplica-los no navegador sobre 83 mil linhas que ele nao segura mais. Entram │
     * │ na BASE (`filtros`), nunca em `filtrosLista`: por isso valem para a lista E para os KPIs (o   │
     * │ `kpisDaBusca` recebe `and(...filtros)`), e trocar aba/cliente/etapa muda cards e tabela        │
     * │ JUNTOS. A regua de casamento e a MESMA do client-side, so que traduzida para predicado de     │
     * │ PESSOA (a unidade da pagina, Opcao A): a pessoa entra se TIVER a candidatura que casa.         │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */

    /*
     * ESCOPO. O client-side decide a LINHA por `candidatura === null || situacao === "ATIVO"`
     * (`emAndamento`), e a unidade aqui e a PESSOA, entao o predicado pergunta se a pessoa TEM a linha
     * que casa o escopo:
     *   - `andamento`: a pessoa nao tem candidatura NENHUMA (a linha "sem funil", que fica em
     *     andamento, nunca no historico) OU tem ao menos uma `ATIVO`;
     *   - `historico`: a pessoa tem ao menos uma candidatura com desfecho (`situacao <> 'ATIVO'`).
     * A regua de `emAndamento` olha so `ATIVO`, nao `candidaturaViva`, de proposito: quem esta
     * APROVADO/ALOCADO/ENVIADO ja recebeu decisao e mora no Historico, que e exatamente onde os cards
     * de desfecho o contam. Ausente, nao recorta: a base inteira, como antes desta frente.
     */
    if (dto.escopo === "andamento") {
      filtros.push(
        sql`(not exists (select 1 from ${asCandidaturas}
                          where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO})
             or exists (select 1 from ${asCandidaturas}
                         where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                           and ${asCandidaturas.situacao} = ${"ATIVO"}))`,
      );
    } else if (dto.escopo === "historico") {
      filtros.push(
        sql`exists (select 1 from ${asCandidaturas}
                     where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                       and ${asCandidaturas.situacao} <> ${"ATIVO"})`,
      );
    }

    /*
     * CLIENTE pelo NOME DE EXIBICAO, a MESMA expressao da projecao do funil
     * (`coalesce(nome_operacao, razao_social)`), e nao pelo `codCliente`: o client-side `fCliente`
     * casava `l.candidatura?.clienteNome === fCliente`, e a opcao do seletor vem desse mesmo nome. O
     * join a `clientes` e INNER de proposito: so casa um nome concreto, e candidatura sem cliente
     * (vaga em revisao) nunca iguala um nome, entao a pessoa sem cliente sai quando o filtro esta
     * ativo, que e o comportamento de antes.
     */
    const cliente = dto.cliente?.trim();
    if (cliente) {
      filtros.push(
        sql`exists (select 1 from ${asCandidaturas}
                     join ${vagas} on ${vagas.id} = ${asCandidaturas.vagaId}
                     join ${clientes} on ${clientes.codCliente} = ${vagas.codCliente}
                     where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                       and coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial}) = ${cliente})`,
      );
    }

    /*
     * ETAPA pelo CODIGO, com o alcance SO-VIVOS do client-side `fEtapa`: ele exigia
     * `candidaturaViva(situacao)` E `etapa = <valor>`, lido da MESMA constante `SITUACOES_VIVAS` que a
     * coluna e o filtro "sem candidatura" ja usam (uma regua so, nunca uma terceira copia). Filtrar
     * "Triagem" traz junto quem foi APROVADO ou ALOCADO estando na Triagem, e nunca quem foi
     * descartado la, exatamente como a tela fazia.
     */
    const etapa = dto.etapa?.trim();
    if (etapa) {
      filtros.push(
        sql`exists (select 1 from ${asCandidaturas}
                     where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                       and ${inArray(asCandidaturas.situacao, SITUACOES_VIVAS)}
                       and ${asCandidaturas.etapa} = ${etapa})`,
      );
    }

    /*
     * ┌─ OS FILTROS DE CARD ENTRAM SÓ NA LISTA, NUNCA NO KPI (06/10/2026) ─────────────────────────┐
     * │ Clicar num card passou a filtrar a LISTA pela BASE INTEIRA (antes era só sobre a página     │
     * │ carregada, e quem não estava nela sumia). MAS os KPIs continuam contados sobre a base SEM    │
     * │ este filtro: clicar num card NÃO pode zerar os outros cards. Por isso a régua do card entra  │
     * │ num array SEPARADO (`filtrosLista`), e o `kpisDaBusca` logo abaixo recebe `filtros` (a base),│
     * │ jamais `filtrosLista`.                                                                       │
     * │                                                                                             │
     * │ A RÉGUA É A DO `cardDaCandidatura` (a situação vence a etapa): card de ETAPA casa só         │
     * │ candidatura ATIVO naquela etapa; card de SITUAÇÃO casa a situação, em qualquer etapa. Os     │
     * │ dois são `exists` sobre as candidaturas da pessoa, então a pessoa entra na lista se, e só     │
     * │ se, TIVER a candidatura que casa, independente da página.                                   │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const filtrosLista = [...filtros];
    const cardEtapa = dto.filtroCardEtapa?.trim();
    if (cardEtapa) {
      filtrosLista.push(
        sql`exists (select 1 from ${asCandidaturas}
                    where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                      and ${asCandidaturas.etapa} = ${cardEtapa}
                      and ${asCandidaturas.situacao} = ${"ATIVO"})`,
      );
    }
    const cardSituacao = dto.filtroCardSituacao?.trim();
    if (cardSituacao) {
      filtrosLista.push(
        sql`exists (select 1 from ${asCandidaturas}
                    where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                      and ${asCandidaturas.situacao} = ${cardSituacao})`,
      );
    }

    const linhas = await this.db
      .select({
        id: asCandidatos.id,
        nome: asCandidatos.nome,
        origem: asCandidatos.origem,
        /*
         * A RETENÇÃO SAI NA LISTA, e isso NÃO é exceção ao §A.6: ela é CLASSIFICAÇÃO, no mesmo
         * nível de `origem` e do próprio `temCpf` logo abaixo, e não identificador de ninguém. O
         * que continua proibido no retorno de lista é identificador DIRETO (CPF, e-mail, telefone,
         * nascimento), e isto não muda nada disso. Ela precisa estar aqui porque a coluna, o filtro
         * e a ordenação da tela leem a lista, não a ficha.
         */
        bancoTalentos: asCandidatos.bancoTalentos,
        cidade: asCandidatos.cidade,
        uf: asCandidatos.uf,
        // O BOOLEANO NO LUGAR DO NÚMERO: a resposta que a tela precisa, sem o dado que ela não usa.
        temCpf: sql<boolean>`${asCandidatos.cpf} is not null`,
        criadoEm: asCandidatos.criadoEm,
        // A LISTA DAS VIVAS VEM DA CONSTANTE, e não escrita aqui dentro: era uma das cinco cópias
        // desta régua, e cópia concorda com a fonte por coincidência. `inArray` produz a mesma
        // cláusula `in (...)` de antes, com a coluna qualificada do mesmo jeito.
        candidaturasAtivas: sql<number>`(
          select count(*)::int from ${asCandidaturas}
           where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
             and ${inArray(asCandidaturas.situacao, SITUACOES_VIVAS)})`,
        /*
         * ─ QUANTOS EXISTEM DE VERDADE, na MESMA ida ao banco (ponto 15) ─────────────────────────
         *
         * `count(*) over ()` é a contagem da consulta INTEIRA, antes do `limit`, devolvida em toda
         * linha. É o que permite dizer "200 de 1.480" sem uma segunda consulta e sem o risco de as
         * duas verem bases diferentes: um `select count(*)` separado rodaria em outro instante, e
         * duas leituras de instantes diferentes é como uma tela passa a mostrar total menor que a
         * própria lista.
         *
         * §A.6: é um NÚMERO. Não identifica ninguém, e é exatamente o que falta para a tela parar
         * de mentir por omissão.
         */
        total: sql<number>`count(*) over ()`,
      })
      .from(asCandidatos)
      // A LISTA LEVA OS FILTROS DE CARD (`filtrosLista`); os KPIs abaixo levam só a base (`filtros`).
      .where(filtrosLista.length > 0 ? and(...filtrosLista) : undefined)
      /*
       * A ORDENACAO VIAJA AO SERVIDOR (07/10/2026). O DESEMPATE POR `id` NÃO É ENFEITE e por isso o
       * builder SEMPRE o anexa: sem ele, duas pessoas cadastradas no MESMO instante (uma importação
       * de planilha grava em lote) têm ordem indefinida entre uma página e a seguinte, e a mesma
       * linha pode aparecer duas vezes ou sumir no meio da paginação. Ausente, o builder devolve
       * `criadoEm desc, id desc`, que é exatamente a ordem de antes.
       */
      .orderBy(...this.ordenacaoDaBusca(dto))
      .limit(limite)
      .offset(offset);

    /*
     * ┌─ O CORTE DEIXA DE MENTIR (ponto 15) ───────────────────────────────────────────────────────┐
     * │ O QUE HAVIA: `.limit(200)` fixo, com ordenação por data de criação, e um ARRAY como         │
     * │ resposta. Quem chamasse sem filtro recebia os 200 mais RECENTES e nada dizia que havia mais │
     * │ alguém: a tela de alocação mostrava uma lista completa, e ela era uma janela. O candidato   │
     * │ cadastrado no ano passado simplesmente não existia para quem procurava pela rolagem.        │
     * │                                                                                            │
     * │ A CORREÇÃO NÃO É "SUBIR O LIMITE": qualquer teto escolhido volta a mentir na base seguinte. │
     * │ O que muda é a RESPOSTA: ela passa a carregar `total` (quantos existem), `limite`, `offset` │
     * │ e `truncado`. O consumidor que ignora o corte deixa de conseguir ignorá-lo sem saber, e a   │
     * │ tela tem o que dizer ("mostrando 200 de 1.480, refine a busca").                            │
     * │                                                                                            │
     * │ O TETO CONTINUA EXISTINDO, e continua sendo barreira: ele impede a consulta sem filtro de   │
     * │ despejar a base inteira de dado pessoal no navegador (§A.6, minimização). O que ele não     │
     * │ pode mais é fazer isso em silêncio.                                                        │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const total = Number(linhas[0]?.total ?? 0);

    /*
     * ┌─ O FUNIL VEM AQUI, EM SEGUNDA CONSULTA, E ISSO E O CONSERTO DO 429 ───────────────────────┐
     * │ A Central de Candidatos montava as colunas de funil pedindo o PAINEL DE CADA VAGA, uma     │
     * │ requisicao por vaga: 483 chamadas por carregamento contra um teto de 120 por 60s, e a tela │
     * │ passou a responder 429 ao proprio time. Pior, ao estourar o estado de candidaturas ficava  │
     * │ VAZIO e TODA pessoa aparecia como "Vaga Nao Alocada", com vaga ou sem.                     │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const funilPorPessoa = await this.funilDaPagina(
      linhas.map((l) => l.id),
      dto.semCandidatura === true,
    );

    /*
     * ┌─ OS KPIS CONTAM O CONJUNTO FILTRADO INTEIRO, NUNCA A PAGINA (06/10/2026) ──────────────────┐
     * │ `total` acima ja e o numero real de candidatos. Os cards de etapa/situacao precisavam do    │
     * │ mesmo tratamento: a tela os derivava das linhas CARREGADAS, entao com 200 de 81 mil o time  │
     * │ lia "95 em Captacao" quando sao dezenas de milhares. Estas agregacoes rodam sobre os MESMOS  │
     * │ `filtros` do `buscar`, antes do `limit`, num join candidatos+candidaturas, e devolvem a      │
     * │ quebra da BASE filtrada. §A.6: sao agregados, nenhum identificado desce.                     │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * SEM FUNIL, SEM KPI: a chamada `semCandidatura: true` oferece gente para alocacao e nao tem
     * coluna de funil (ver `funilDaPagina`); contar etapa/situacao ali seria trabalho jogado fora.
     *
     * ┌─ O KPI SO VEM NA PRIMEIRA PAGINA (`offset === 0`), uma vez por filtro (07/10/2026) ───────┐
     * │ O group-by pesado conta o conjunto filtrado INTEIRO e nao muda entre paginas do MESMO      │
     * │ filtro, entao recalcula-lo a cada "carregar mais" seria trabalho repetido. `offset === 0`  │
     * │ <=> o filtro mudou (a tela volta ao topo), que e exatamente quando o KPI precisa refazer.  │
     * │ `total` (o `count(*) over()`) continua vindo em TODA pagina, barato, entao a tela nunca     │
     * │ fica sem o numero real. O KPI segue contado sobre `filtros` (a base), jamais `filtrosLista`.│
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const kpis =
      dto.semCandidatura || offset > 0
        ? undefined
        : await this.kpisDaBusca(filtros.length > 0 ? and(...filtros) : undefined);

    const itens: AsCandidatoListItem[] = linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      origem: l.origem,
      // NOT NULL com default no banco, então não há nulo a tratar: o `Boolean` é só a fronteira
      // de tipo do driver, igual ao `temCpf` logo abaixo.
      bancoTalentos: Boolean(l.bancoTalentos),
      cidade: l.cidade,
      uf: l.uf,
      temCpf: Boolean(l.temCpf),
      candidaturasAtivas: Number(l.candidaturasAtivas ?? 0),
      criadoEm: l.criadoEm.toISOString(),
      /*
       * LISTA VAZIA E A RESPOSTA CERTA PARA QUEM NAO ESTA EM VAGA NENHUMA, e nao campo ausente: e
       * assim que a tela pinta "Vaga Nao Alocada" por um FATO, em vez de por falha de carregamento.
       * O campo some do objeto, e so ele, quando o funil nao foi pedido (ver `funilDaPagina`).
       */
      ...(funilPorPessoa ? { candidaturas: funilPorPessoa.get(l.id) ?? [] } : {}),
    }));

    return {
      itens,
      total,
      limite,
      offset,
      // TRUNCADO É DERIVADO, e nunca um flag gravado à parte: dois números que deveriam concordar
      // discordam no primeiro ajuste. Sobrou alguém além do que esta página mostra?
      truncado: offset + itens.length < total,
      // AUSENTE quando nao calculado (chamada `semCandidatura`), nunca `{}`: ver o tipo.
      ...(kpis ? { kpis } : {}),
    };
  }

  /*
   * A QUEBRA POR ETAPA E POR SITUACAO DO CONJUNTO FILTRADO INTEIRO, em DUAS agregacoes baratas.
   *
   * O JOIN e `candidatos INNER candidaturas`, e as DUAS agregacoes partem do MESMO filtro recebido,
   * que e o `and(...filtros)` montado pelo `buscar`. Como os filtros referem colunas de
   * `as_candidatos` (cpf, nome, origem) e subconsultas em `ID_DO_CANDIDATO` (`as_candidatos.id`), o
   * join precisa ter a tabela de candidatos como fonte para elas resolverem. §A.6: o `select` so
   * pede o codigo da etapa/situacao e um `count`, nenhum identificador.
   */
  private async kpisDaBusca(filtro: SQL | undefined): Promise<AsCandidatosKpis> {
    /*
     * ┌─ `porEtapa` CONTA SÓ QUEM ESTÁ EM SELEÇÃO (`situacao = 'ATIVO'`), e isso RESTAURA O CONTRATO ─┐
     * │ A RÉGUA é a mesma de `kpisDoFunil` e do `cardDaCandidatura`: a SITUAÇÃO vence a etapa. Toda   │
     * │ candidatura tem uma etapa gravada, inclusive a descartada (é ela que diz ONDE a saída         │
     * │ aconteceu), então contar por etapa SEM olhar a situação enchia o card de etapa com gente que  │
     * │ já saiu: APROVACAO mostrava 393 com ZERO ATIVO, e o clique no card (que filtra ATIVO naquela  │
     * │ etapa) trazia vazio. Com o `'ATIVO'` aqui, o número do card volta a bater com o que o clique  │
     * │ encontra, e a invariante `soma(porEtapa) === emSelecao` passa a valer no servidor.           │
     * │                                                                                             │
     * │ `porSituacao` FICA COMO ESTÁ (agrupa por situação, TODAS), porque é justamente ele que conta  │
     * │ os desfechos (APROVADO, DESCARTADO, etc.). Só o `porEtapa` ganha o recorte de seleção.       │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const filtroEmSelecao = and(
      ...(filtro ? [filtro] : []),
      eq(asCandidaturas.situacao, "ATIVO"),
    );
    const porEtapaLinhas = await this.db
      .select({
        chave: asCandidaturas.etapa,
        quantidade: sql<number>`count(*)::int`,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(filtroEmSelecao)
      .groupBy(asCandidaturas.etapa);

    const porSituacaoLinhas = await this.db
      .select({
        chave: asCandidaturas.situacao,
        quantidade: sql<number>`count(*)::int`,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(filtro)
      .groupBy(asCandidaturas.situacao);

    const porEtapa: Record<string, number> = {};
    for (const l of porEtapaLinhas) porEtapa[l.chave] = Number(l.quantidade ?? 0);
    const porSituacao: Record<string, number> = {};
    for (const l of porSituacaoLinhas) porSituacao[l.chave] = Number(l.quantidade ?? 0);

    return { porEtapa, porSituacao };
  }

  /*
   * ─ A ORDENACAO DA BUSCA, TRADUZIDA EM ORDER BY (paginacao no servidor, 07/10/2026) ─────────────
   *
   * ┌─ CORRELACIONADA, NUNCA JOIN NA CONSULTA PAGINADA ──────────────────────────────────────────┐
   * │ A unidade da pagina e PESSOA (Opcao A do plano). Ordenar por coluna de CANDIDATURA (vaga,    │
   * │ cliente, cargo, etapa, situacao, ultimo contato) usa um VALOR REPRESENTATIVO por pessoa, numa │
   * │ subconsulta correlacionada. Um JOIN aqui seria a armadilha E-6: `total` (`count(*) over()`)  │
   * │ passaria a contar candidaturas e o `limit` a cortar candidaturas, e uma pessoa com 118        │
   * │ candidaturas estouraria a pagina sozinha. Por isso NENHUMA destas expressoes toca o `from`/   │
   * │ `join` da consulta paginada: elas vivem so no `order by`.                                     │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NULOS AO FIM nas DUAS direcoes (`nulls last`): etapa de quem saiu do funil e contato que nunca
   * houve nao sobem ao topo so por serem nulos. O Postgres poe nulo primeiro no `desc`, entao o
   * `nulls last` e explicito. O DESEMPATE por `id desc` e SEMPRE anexado (ver `buscar`).
   *
   * etapa e situacao ordenam pelo CATALOGO, nunca pelo texto: etapa pela `ordem` de `as_etapas_funil`
   * (a MESMA ordem do funil que o diretor define), situacao por `array_position` na lista do dominio.
   * §A.6: tudo isto e chave de coluna e codigo de catalogo, nenhum dado pessoal entra na ordenacao.
   */
  private ordenacaoDaBusca(dto: BuscarCandidatosDto): SQL[] {
    const desempate = desc(asCandidatos.id);
    const dir = dto.direcao === "asc" ? sql`asc` : sql`desc`;
    const ordenar = (expr: SQL) => [sql`${expr} ${dir} nulls last` as SQL, desempate];

    const porCandidato = sql`${asCandidaturas.candidatoId} = ${asCandidatos.id}`;
    const vivas = inArray(asCandidaturas.situacao, SITUACOES_VIVAS);
    const posicoesSituacao = sql.join(
      CANDIDATURA_SITUACOES.map((s) => sql`${s}`),
      sql`, `,
    );

    switch (dto.ordenarPor) {
      case "candidato":
        return ordenar(sql`${asCandidatos.nome}`);
      case "criadoEm":
        return ordenar(sql`${asCandidatos.criadoEm}`);
      case "ultimoContato":
        return ordenar(
          sql`(select max(${asCandidaturas.ultimoContatoEm}) from ${asCandidaturas} where ${porCandidato})`,
        );
      case "etapa":
        return ordenar(
          sql`(select min(${asEtapasFunil.ordem}) from ${asCandidaturas}
                 join ${asEtapasFunil} on ${asEtapasFunil.codigo} = ${asCandidaturas.etapa}
                where ${porCandidato} and ${vivas})`,
        );
      case "situacao":
        return ordenar(
          sql`(select min(array_position(array[${posicoesSituacao}]::text[], ${asCandidaturas.situacao}::text))
                 from ${asCandidaturas} where ${porCandidato})`,
        );
      case "vaga":
        return ordenar(
          sql`(select min(${vagas.codigo}) from ${asCandidaturas}
                 join ${vagas} on ${vagas.id} = ${asCandidaturas.vagaId} where ${porCandidato})`,
        );
      case "cliente":
        return ordenar(
          sql`(select min(coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial})) from ${asCandidaturas}
                 join ${vagas} on ${vagas.id} = ${asCandidaturas.vagaId}
                 left join ${clientes} on ${clientes.codCliente} = ${vagas.codCliente} where ${porCandidato})`,
        );
      case "cargo":
        return ordenar(
          sql`(select min(${cargos.nome}) from ${asCandidaturas}
                 join ${vagas} on ${vagas.id} = ${asCandidaturas.vagaId}
                 left join ${cargos} on ${cargos.id} = ${vagas.cargoId} where ${porCandidato})`,
        );
      default:
        // AUSENTE: a ordem de antes, intacta (`criadoEm desc, id desc`).
        return [desc(asCandidatos.criadoEm), desc(asCandidatos.id)];
    }
  }

  /*
   * ─ AS OPCOES DOS FILTROS, DA BASE DE CANDIDATOS E NAO DE `/as/vagas` (06/10/2026) ───────────────
   *
   * Os clientes, cargos e vagas DISTINTOS que aparecem NAS CANDIDATURAS. Desacopla a Central de
   * Candidatos do `/as/vagas` filtrado pela Central de Vagas, que so traz liberadas e encolhia estes
   * filtros (a vaga em revisao, 94% da base, nao aparecia). §A.37: a opcao do filtro vem de endpoint,
   * nunca das linhas carregadas. §A.6: so rotulo e codigo de catalogo, nenhum dado pessoal.
   *
   * TRES CONSULTAS DISTINTAS, e nao uma com tres colunas: uma vaga sem cliente nao pode sumir da
   * lista de vagas so porque o cliente dela e nulo, e distinct sobre a tripla daria uma linha por
   * combinacao. Cada eixo e um `distinct` proprio, com os nulos descartados onde nao fazem sentido.
   */
  async opcoes(): Promise<AsCandidatosOpcoes> {
    const clientesLinhas = await this.db
      .selectDistinct({
        codCliente: clientes.codCliente,
        nome: sql<string>`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial})`,
      })
      .from(asCandidaturas)
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .innerJoin(clientes, eq(clientes.codCliente, vagas.codCliente))
      .orderBy(sql`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial})`);

    const cargosLinhas = await this.db
      .selectDistinct({ id: cargos.id, nome: cargos.nome })
      .from(asCandidaturas)
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .innerJoin(cargos, eq(cargos.id, vagas.cargoId))
      .orderBy(cargos.nome);

    const vagasLinhas = await this.db
      .selectDistinct({
        id: vagas.id,
        codigo: vagas.codigo,
        nome: vagas.nomeDivulgacao,
      })
      .from(asCandidaturas)
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .orderBy(vagas.nomeDivulgacao);

    return {
      clientes: clientesLinhas.map((l) => ({ codCliente: l.codCliente, nome: l.nome })),
      cargos: cargosLinhas.map((l) => ({ id: l.id, nome: l.nome })),
      vagas: vagasLinhas.map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome })),
    };
  }

  /** A FICHA: o único lugar em que o CPF e os dados de contato saem do backend. */
  async ficha(id: string): Promise<AsCandidatoFicha> {
    const c = await this.db.query.asCandidatos.findFirst({ where: eq(asCandidatos.id, id) });
    if (!c) throw new NotFoundException("Candidato não encontrado.");

    return {
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      email: c.email,
      telefone: c.telefone,
      dataNascimento: c.dataNascimento,
      cidade: c.cidade,
      uf: c.uf,
      origem: c.origem,
      /** A marca de retenção: é ela que a ficha mostra, e é ela que só SUPER_ADMIN muda. */
      bancoTalentos: c.bancoTalentos,
      criadoEm: c.criadoEm.toISOString(),
      anonimizadoEm: c.anonimizadoEm ? c.anonimizadoEm.toISOString() : null,
      candidaturas: await this.candidaturasDoCandidato(id),
    };
  }

  // ── A CANDIDATURA ─────────────────────────────────────────────────────────

  /**
   * ALOCAR a pessoa numa vaga. Nasce em `CAPTACAO` e `ATIVO`, e ATIVO NÃO CONSOME POSIÇÃO: por isso
   * alocar não passa pela trava 1. Uma vaga de 10 recebe 40 currículos sem travar, que é o normal.
   *
   * TRAVA 2 (vaga fechada) e TRAVA 3 (duplicata) atuam aqui. A trava 3 tem duas camadas, como o
   * dedup do CPF: a consulta, que produz a frase legível, e o UNIQUE PARCIAL `uq_as_candidaturas_viva`
   * do banco, que é o que de fato garante contra o duplo clique. Sem o unique, dois cliques rápidos
   * criariam duas linhas e a contagem de posições ocupadas passaria a mentir.
   *
   * A REENTRADA EM VAGA JÁ ENCERRADA É PERMITIDA, COM AVISO (ajuste do diretor). A trava 3 deixou de
   * ser "esta pessoa não pode aparecer duas vezes nesta vaga" e passou a ser "esta pessoa não pode
   * estar DUAS VEZES VIVA nesta vaga". Quem foi DESCARTADO ou DESISTIU no passado volta, e o passado
   * fica: a linha anterior NÃO é reaproveitada nem apagada, nasce uma candidatura nova na etapa
   * INICIAL do catálogo (era "em CAPTACAO", e deixou de ser uma palavra de código quando as etapas
   * viraram dado do diretor) e o histórico continua consultável, que é o ponto todo de deixá-lo lá.
   *
   * A RECUSA DA PRIMEIRA TENTATIVA NÃO É BUROCRACIA. Alocar quem já foi descartado naquela mesma vaga
   * costuma ser engano (a pessoa foi escolhida de novo numa lista sem que ninguém lembrasse do
   * descarte), e a decisão muda conforme o MOTIVO e a DATA do descarte anterior. O 409 devolve os
   * dois, e o consultor decide com eles na tela em vez de descobrir depois.
   *
   * ALOCA POR `id` DO CANDIDATO, E NÃO EXIGE CPF (ajuste 2 do diretor). A chave da tabela sempre foi
   * o `id`; o CPF é opcional desde o primeiro dia, e nada neste caminho o lê. O beco sem saída não
   * estava aqui: estava em NÃO EXISTIR uma lista de onde escolher a pessoa sem passar pelo dedup por
   * CPF. Quem abriu essa porta foi o filtro `semCandidatura` da busca, logo acima. Este método fica
   * como está, e este parágrafo existe para que a garantia seja EXPLÍCITA: quem acrescentar aqui uma
   * exigência de CPF fecha o beco de novo.
   */
  async alocar(
    candidatoId: string,
    dto: AlocarEmVagaDto,
    alocadoPorId: string,
  ): Promise<AsCandidaturaItem> {
    const candidato = await this.db.query.asCandidatos.findFirst({
      where: eq(asCandidatos.id, candidatoId),
    });
    if (!candidato) throw new NotFoundException("Candidato não encontrado.");

    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, dto.vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    // TRAVA 2: vaga encerrada não recebe candidato novo. A pergunta é feita ao CATÁLOGO, pelo flag
    // `recebeCandidato`, e não a uma lista de três códigos escrita aqui.
    const regua = await this.statusVaga.regua();
    if (!regua.recebeCandidato(vaga.status)) {
      throw new ConflictException("Esta vaga está Fechada e não recebe candidato novo.");
    }

    // TRAVA 3, primeira camada: a frase legível e o aviso de reentrada. A garantia é o unique
    // parcial, logo abaixo. A régua de quem está vivo e quem só esteve é do domínio
    // (`decidirAlocacao`), e NÃO é reescrita aqui: uma segunda lista de situações neste arquivo
    // divergiria da primeira no dia em que o vocabulário mudasse.
    const anteriores = await this.db
      .select({
        id: asCandidaturas.id,
        situacao: asCandidaturas.situacao,
        motivo: asCandidaturas.motivoDescarte,
        encerradaEm: asCandidaturas.atualizadoEm,
      })
      .from(asCandidaturas)
      .where(
        and(
          eq(asCandidaturas.candidatoId, candidatoId),
          eq(asCandidaturas.vagaId, dto.vagaId),
        ),
      );

    const decisao = decidirAlocacao(anteriores);
    if (decisao.tipo === "JA_ESTA") {
      throw new ConflictException("Esta pessoa já está nesta vaga.");
    }
    if (decisao.tipo === "REENTRADA" && !dto.cienteReentrada) {
      throw this.reentradaPrecisaCiencia(decisao.anterior);
    }

    /*
     * ┌─ O ACEITE DE REENTRADA PASSA A SER GRAVADO (decisão do diretor, §A.3 regra 8) ─────────────┐
     * │ ATÉ AQUI ELE ERA PEDIDO NA TELA, LIDO PARA DECIDIR E JOGADO FORA. `ACEITE_REENTRADA` existe │
     * │ no domínio desde a migration 0097, e a própria migration anotava que NINGUÉM o escrevia: a  │
     * │ decisão de trazer de volta quem já tinha saído daquela vaga não deixava rastro nenhum de     │
     * │ quem decidiu, nem de quando, que é exatamente a pergunta que a regra 8 manda poder responder.│
     * │                                                                                             │
     * │ O GATILHO É A GUARDA TER DISPARADO, e não o flag do corpo ter vindo: chega-se a esta linha  │
     * │ com `REENTRADA` apenas quando existia processo encerrado naquela vaga E a ciência veio       │
     * │ (sem ela, a linha acima já lançou). Um corpo montado fora da tela que mande a ciência sempre │
     * │ NÃO produz aceite nenhum em quem entra na vaga pela primeira vez.                            │
     * │                                                                                             │
     * │ SEM `aceiteNumero`: aqui não há estado numérico a fotografar (o do banco é "quantas oficiais │
     * │ estavam abertas"). Quem, quando e qual guarda bastam, e a coluna é nulável de propósito.     │
     * │                                                                                             │
     * │ §A.6: um nome de guarda e nada mais. O motivo do encerramento anterior NÃO é copiado para o  │
     * │ evento novo, ele já está gravado na candidatura antiga, que continua no histórico.           │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const aceiteDaReentrada = decisao.tipo === "REENTRADA" ? { aceite: ACEITE_REENTRADA } : {};

    /*
     * ─ ONDE A CANDIDATURA NASCE: UM DONO SÓ, E ELE É O CATÁLOGO ──────────────────────────────────
     *
     * ERAM TRÊS DONOS CONCORDANDO POR COINCIDÊNCIA: o `DEFAULT 'CAPTACAO'` da coluna (que era quem
     * de fato decidia), a mesma palavra escrita à mão no estado inicial da tela de cadastro, e
     * ninguém em lugar nenhum sabendo que os dois existiam. Com a etapa virando dado do diretor,
     * o default do banco viraria um segundo dono capaz de apontar para uma etapa INATIVADA, em
     * silêncio, e a FK só reclamaria se a etapa tivesse sido apagada, o que ela nunca é.
     *
     * O DEFAULT FOI REMOVIDO NA MIGRATION 0100 e a etapa passa a ser LIDA e PASSADA aqui. Se
     * nenhuma estiver marcada como inicial, isto lança com a frase que diz o que fazer, ANTES de
     * abrir a transação: melhor recusar o cadastro do que criar candidatura sem lugar no funil.
     */
    const etapaInicial = await this.etapas.etapaInicial();

    // OS INSUMOS DA DERIVAÇÃO, ANTES DA TRANSAÇÃO (ver `insumosDaDerivacao`). A `regua` já foi lida
    // lá em cima para a trava 2; ler de novo custa nada (o serviço serve de cache) e mantém a régua
    // desta rotina vindo de um lugar só.
    const { regua: reguaDerivacao, etapasDeEntrega } = await this.insumosDaDerivacao();

    let id: string;
    try {
      /*
       * A CANDIDATURA E O PRIMEIRO EVENTO DO HISTORICO NASCEM NA MESMA TRANSAÇÃO, e não é zelo
       * decorativo: candidatura sem evento de ENTRADA apareceria na ficha como uma linha do tempo
       * vazia, dizendo que a pessoa nunca entrou em lugar nenhum. Ou as duas escritas, ou nenhuma.
       */
      id = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(asCandidaturas)
          .values({
            candidatoId,
            vagaId: dto.vagaId,
            etapa: etapaInicial.codigo,
            alocadoPorId,
          })
          .returning({ id: asCandidaturas.id, etapa: asCandidaturas.etapa });

        await tx.insert(asCandidaturaEtapas).values({
          candidaturaId: row.id,
          // ENTRADA: `etapaDe` nula é o que diz "nasceu aqui", em vez de "veio de algum lugar".
          etapaDe: null,
          etapaPara: row.etapa,
          situacao: null,
          porId: alocadoPorId,
          // NA MESMA TRANSAÇÃO da candidatura: ou a reentrada e o aceite dela existem os dois, ou
          // não existe nenhum dos dois. Aceite sem o fato que ele autorizou não é trilha.
          ...aceiteDaReentrada,
        });

        /*
         * O STATUS DA VAGA ACOMPANHA (Frente B, ponto 2). Na alocação a derivação quase nunca muda
         * nada (a candidatura NASCE na etapa INICIAL, que não é de entrega), e ela está aqui pela
         * mesma razão de a etapa inicial ser dado do diretor: no dia em que ele marcar a etapa
         * inicial como de entrega, ou criar uma etapa inicial diferente, o caminho já acompanha.
         * Custa um `exists` só quando a vaga está em papel derivável.
         */
        if (movimentoPodeMudarAEntrega([row.etapa], etapasDeEntrega)) {
          await derivarStatusDaVaga(tx, dto.vagaId, reguaDerivacao, etapasDeEntrega, alocadoPorId);
        }

        return row.id;
      });
    } catch (err) {
      // TRAVA 3, segunda camada: o duplo clique que passou pelas duas consultas ao mesmo tempo.
      throw this.traduzirUnique(err);
    }

    return this.candidatura(id);
  }

  /**
   * MOVER DE ETAPA, pela régua do domínio. A etapa é onde a pessoa está no funil, e mudá-la NÃO muda
   * a situação: quem foi para `APROVACAO` continua `ATIVO` até alguém aprovar de fato. Isso é o que
   * mantém a etapa e a ocupação independentes, e é por isso que chegar na última etapa do funil não
   * consome posição nenhuma.
   *
   * O MOVIMENTO É LIVRE desde 27/08 (decisão do diretor): qualquer etapa para qualquer outra, para a
   * frente, para trás e com pulo, porque a operação real não é linear. A régua está em
   * `movimentoPermitido`, no domínio, e a justificativa inteira mora lá.
   *
   * ┌─ QUEM SE MOVE: TODA CANDIDATURA VIVA, e não só a `ATIVO` (correção do modelo de posição) ──┐
   * │ A RÉGUA ERA `situacao !== "ATIVO"`, com a frase "já foi encerrada e não avança mais". Ela   │
   * │ MENTIA para o `APROVADO` desde sempre (ser aprovado não encerra processo nenhum) e passaria │
   * │ a mentir para o `ALOCADO`, que é o estado que o diretor definiu como o oposto disso: o      │
   * │ alocado PREENCHE a posição e CONTINUA no funil.                                            │
   * │                                                                                            │
   * │ A RÉGUA CERTA É `candidaturaViva`, a MESMA fonte única do `shared-types` que a ocupação da  │
   * │ vaga e a trava de duplicata já leem. Uma segunda lista aqui divergiria dela no primeiro dia │
   * │ em que o vocabulário ganhasse uma situação nova, e é este módulo que já pagou por isso.     │
   * │                                                                                            │
   * │ A CONTAGEM DA VAGA CONTINUA FORA DE ALCANCE, que é a garantia que a régua antiga protegia:  │
   * │ mover de etapa escreve SÓ a coluna `etapa`, e a ocupação deriva de `situacao`. Andar no     │
   * │ funil não desfaz aprovação nenhuma nem solta posição nenhuma, com qualquer régua das duas.  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  /**
   * ─ OS DOIS INSUMOS DE CATÁLOGO DA DERIVAÇÃO DE STATUS DA VAGA (Frente B) ──────────────────────
   *
   * LIDOS SEMPRE ANTES DA TRANSAÇÃO, e é a mesma régua que o resto deste arquivo já segue: são dois
   * catálogos de meia dúzia de linhas, servidos de cache, que não têm nada a ver com a linha travada
   * da vaga. Buscá-los lá dentro só alongaria o tempo com a trava segurada, e abriria a porta para
   * alguém, um dia, "aproveitar a viagem" e puxar a vaga junto por fora do lock.
   *
   * OS DOIS EM PARALELO porque são independentes: um responde "o que é ABERTURA e o que é ENTREGA",
   * o outro "quais etapas significam estar com o cliente".
   */
  private async insumosDaDerivacao(): Promise<{
    regua: ReguaDeStatusDaVaga;
    etapasDeEntrega: ReadonlySet<string>;
  }> {
    const [regua, etapasDeEntrega] = await Promise.all([
      this.statusVaga.regua(),
      this.etapas.codigosDeEntregaAoCliente(),
    ]);
    return { regua, etapasDeEntrega };
  }

  async moverEtapa(
    candidaturaId: string,
    dto: MoverEtapaDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");
    if (!candidaturaViva(c.situacao)) {
      throw new ConflictException(
        "Esta candidatura foi encerrada sem êxito e não anda mais no funil. Para trazer a pessoa de volta, aloque-a de novo na vaga.",
      );
    }

    // OS INSUMOS DA DERIVAÇÃO, ANTES DA TRANSAÇÃO (ver `insumosDaDerivacao`). Eles subiram para cá
    // porque a guarda da VAGA, logo abaixo, precisa da régua de papéis, e ela é a PRIMEIRA recusa.
    const { regua, etapasDeEntrega } = await this.insumosDaDerivacao();

    /*
     * ┌─ A VAGA PRECISA ESTAR EM PROCESSO (decisão 4 do diretor, que AUTORIZOU tocar aqui) ───────┐
     * │ ESTA FRESTA ESTAVA DOCUMENTADA E ABERTA. O bloco do `reprovarPeloCliente` dizia, com todas │
     * │ as letras, "o `moverEtapa` TEM A MESMA FRESTA E NÃO É TOCADO AQUI: ele é código VALIDADO   │
     * │ (§A.26), e o alcance do conserto é decisão do diretor". O diretor decidiu.                  │
     * │                                                                                            │
     * │ O QUE UM CLIQUE PRODUZIA: o caminho não é borda inventada, é o caminho FELIZ da Frente B.  │
     * │ A vaga fica ENTREGUE com alguém na Entrevista Cliente, a pessoa é contratada e a vaga      │
     * │ FECHA; a trava do fechamento não barra um `ALOCADO` (para ela, ALOCADO é TRATADO), então   │
     * │ ele continua VIVO na Entrevista Cliente de uma vaga FECHADA. Movê-lo grava um evento de    │
     * │ funil dentro de um processo terminado, contado pelos KPIs, e NADA ACUSA: a derivação de    │
     * │ status sai no papel FECHAMENTO e não corrige coisa alguma.                                  │
     * │                                                                                            │
     * │ A FORMA É COPIADA de `reprovarPeloCliente` e `marcarEntrevista`, e não reinventada: mesma  │
     * │ `papelDeVagaEmProcesso`, mesma pré-conferência FORA da transação, mesmo 409. Uma segunda   │
     * │ lista de papéis vivos garantiria a divergência no dia em que um papel novo entrasse em uma │
     * │ só delas.                                                                                   │
     * │                                                                                            │
     * │ ALCANCE MEDIDO ANTES DE ESCREVER (§A.27), e a lista de chamadores é COMPLETA: a rota       │
     * │ `PATCH .../etapa` da controller e o `moverEtapaEmLote`, e mais nada. Os OUTROS escritores  │
     * │ de `as_candidaturas.etapa` NÃO passam por aqui e seguem intocados: o Stand By do           │
     * │ cancelamento da vaga (`vagas.service.moverVivosParaODestino`), a volta da reprovação       │
     * │ (`reprovarPeloCliente`, que tem a própria guarda), a restauração da reabertura e a         │
     * │ sincronização do Pandapé escrevem a coluna DIRETO. Nenhum caminho interno do sistema       │
     * │ depende de mover etapa em vaga fora de processo.                                            │
     * │                                                                                            │
     * │ NO LOTE A RECUSA É POR LINHA, e não do lote inteiro: `emLote` envolve cada chamada num     │
     * │ `try/catch` e devolve a frase em `falhas[].motivo` (`motivoDaFalha` aproveita a mensagem   │
     * │ da `HttpException` inteira). Nada de 500, e as demais linhas seguem.                        │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const vagaDaCandidatura = await this.db.query.vagas.findFirst({
      where: eq(vagas.id, c.vagaId),
    });
    if (!vagaDaCandidatura) throw new NotFoundException("Vaga da candidatura não encontrada.");
    if (!papelDeVagaEmProcesso(regua.linha(vagaDaCandidatura.status).papel)) {
      throw new ConflictException(
        `Esta vaga está em "${regua.rotulo(vagaDaCandidatura.status)}" e não tem processo em andamento. A vaga acabou, então não é possível mover ninguém no funil dela.`,
      );
    }

    /*
     * A ÚNICA RECUSA QUE SOBROU: mover para a etapa em que a pessoa JÁ ESTÁ. Com o funil livre não há
     * mais "avanço não permitido" a explicar, então a frase deixou de mandar recarregar a página:
     * quem clicou na etapa atual não está com a tela desatualizada, está clicando no próprio lugar.
     */
    if (!movimentoPermitido(c.etapa, dto.etapa)) {
      throw new BadRequestException("Esta candidatura já está nesta etapa.");
    }

    /*
     * A ETAPA DE DESTINO EXISTE E ESTÁ ATIVA? Esta checagem substitui o `@IsIn` que morava no DTO, e
     * ela precisa ser de RUNTIME e contra o catálogo VIVO: a lista é do diretor, então a única
     * resposta correta é a de agora, não a de quando o processo subiu.
     *
     * É A SEGUNDA DE TRÊS CAMADAS, e nenhuma sobra: o DTO garante a FORMA, esta garante a REGRA (a
     * etapa existe E recebe gente nova), e a FK do banco garante a INTEGRIDADE mesmo para quem
     * escrever por fora da aplicação. Como `CandidaturaEtapa` virou `string`, o compilador deixou de
     * recusar "TRIGEM" e são estas três que seguram o lugar dele.
     */
    await this.etapas.exigirEtapaAtiva(dto.etapa);


    /*
     * O MOVIMENTO E O REGISTRO DELE, NA MESMA TRANSAÇÃO. A coluna `etapa` é sobrescrita, então o
     * evento é a ÚNICA memória de que a pessoa esteve na etapa anterior: gravar um sem o outro
     * perderia o caminho justamente no gesto que o cria.
     */
    await this.db.transaction(async (tx) => {
      await tx
        .update(asCandidaturas)
        .set({ etapa: dto.etapa, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, candidaturaId));

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: c.etapa,
        etapaPara: dto.etapa,
        // MOVIMENTO: `situacao` nula. Mover de etapa não muda situação, e essa independência é o que
        // mantém a ocupação da vaga fora do alcance desta operação.
        situacao: null,
        porId,
      });

      /*
       * ─ O STATUS DA VAGA ACOMPANHA (Frente B, ponto 2) ──────────────────────────────────────────
       *
       * ESTE É O GATILHO PRINCIPAL DA DERIVAÇÃO: mover alguém PARA a Entrevista Cliente entrega a
       * vaga, e mover o último que estava lá PARA FORA a devolve para Aberta. Sem exigir ordem: o
       * funil é livre desde 27/08, então o pulo da Captação direto para a Entrevista Cliente conta
       * igual.
       *
       * NA MESMA TRANSAÇÃO do movimento, e não depois: estado de vaga que pode ficar para trás
       * quando a escrita deu certo é o mesmo defeito que "rastro que pode faltar não é rastro".
       */
      if (movimentoPodeMudarAEntrega([c.etapa, dto.etapa], etapasDeEntrega)) {
        await derivarStatusDaVaga(tx, c.vagaId, regua, etapasDeEntrega, porId);
      }
    });

    return this.candidatura(candidaturaId);
  }

  /**
   * ─ REPROVADO PELO CLIENTE: A PESSOA VOLTA PARA A ETAPA INICIAL (Frente E, ponto 12) ───────────
   *
   * O GESTO NÃO EXISTIA. Até aqui, quando o cliente recusava alguém, o consultor tinha dois
   * caminhos e os dois eram ruins: DESCARTAR a pessoa (que ENCERRA o processo dela, e o cliente
   * recusar para UMA vaga não é a pessoa sair da base) ou MOVER de etapa à mão (que funciona, e não
   * deixa dito que foi o cliente quem recusou). Este gesto é o terceiro, e é o que o diretor pediu.
   *
   * ┌─ É MOVIMENTO, E NUNCA DESFECHO, e essa é a decisão que governa o método inteiro ─────────────┐
   * │ A pessoa continua VIVA: ela volta ao começo do funil e pode ser apresentada de novo, para    │
   * │ esta vaga ou para outra. Por isso a `situacao` NÃO é tocada, `motivo_descarte` NÃO é escrito │
   * │ e o evento entra em `as_candidatura_etapas` com `situacao` NULA, que é o que `tipoDoEvento`  │
   * │ lê para classificá-lo como MOVIMENTO.                                                        │
   * │                                                                                              │
   * │ CONSEQUÊNCIA QUE IMPORTA E QUE NÃO É ÓBVIA: a POSIÇÃO da vaga não é mexida. Quem consome     │
   * │ posição é a SITUAÇÃO (`consomePosicao`), e ela não muda aqui. Então este caminho NÃO precisa │
   * │ do `SELECT ... FOR UPDATE` da trava 4 (não há "ainda cabe mais um?" a responder), exatamente │
   * │ como o `moverEtapa` logo acima.                                                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O DESTINO VEM DO CATÁLOGO, E NUNCA DE UM LITERAL ───────────────────────────────────────────┐
   * │ A etapa de volta é a marcada `inicial` em `as_etapas_funil` (0100), que é a MESMA fonte de   │
   * │ onde a candidatura NASCE. Escrever `"CAPTACAO"` aqui criaria um segundo dono da pergunta     │
   * │ "onde é o começo do funil", capaz de divergir do primeiro no dia em que o diretor marcasse   │
   * │ outra etapa como inicial, e a pessoa reprovada voltaria para um começo que já não é o começo.│
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ SÓ REPROVA O CLIENTE QUEM ESTAVA COM O CLIENTE, e a lista também é do catálogo ────────────┐
   * │ A guarda é `entrega_ao_cliente` (a marca que a Frente B criou na 0130), e não uma segunda    │
   * │ lista escrita aqui. Sem ela, "reprovado pelo cliente" seria gravável sobre quem está na      │
   * │ Captação, e a contagem do indicador passaria a incluir reprovação que nenhum cliente fez.    │
   * │                                                                                              │
   * │ FAIL-CLOSED SOBRE O CONJUNTO VAZIO: catálogo sem nenhuma etapa marcada recusa TODO MUNDO,    │
   * │ com a frase dizendo o que configurar. É o mesmo lado seguro que a derivação de status já     │
   * │ escolhe (sem etapa marcada, nunca afirma entrega).                                            │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O STATUS DA VAGA ACOMPANHA, E ESTE É O EFEITO MAIS CARO DE ESQUECER (§A.27): tirar da Entrevista
   * Cliente o ÚLTIMO candidato que estava lá faz a vaga deixar de estar ENTREGUE e voltar a ABERTA.
   * É a mesma rotina do `moverEtapa`, na mesma transação, e não uma segunda cópia dela.
   *
   * §A.6: o evento leva QUEM, QUANDO, DE ONDE, PARA ONDE e uma frase de processo opcional. Nenhum
   * CPF, nenhum nome de candidato, nenhum log.
   */
  async reprovarPeloCliente(
    candidaturaId: string,
    dto: ReprovarPeloClienteDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");
    if (!candidaturaViva(c.situacao)) {
      throw new ConflictException(
        "Esta candidatura foi encerrada sem êxito e não anda mais no funil. Para trazer a pessoa de volta, aloque-a de novo na vaga.",
      );
    }

    // OS INSUMOS DE CATÁLOGO, TODOS ANTES DA TRANSAÇÃO, pela régua deste arquivo: são listas de
    // meia dúzia de linhas servidas de cache, e buscá-las lá dentro só alongaria o tempo com a
    // trava da vaga segurada pela derivação.
    const { regua, etapasDeEntrega } = await this.insumosDaDerivacao();

    /*
     * ┌─ A VAGA PRECISA ESTAR EM PROCESSO (achado do `tester`, cobertura independente §A.38) ────┐
     * │ AS TRÊS GUARDAS DESTE MÉTODO ERAM TODAS SOBRE A CANDIDATURA (existe, está viva, está em   │
     * │ etapa de entrega), e NENHUMA perguntava se a VAGA ainda é um processo. O caminho não é    │
     * │ borda inventada, é o caminho FELIZ da Frente B: a vaga fica ENTREGUE com alguém na        │
     * │ Entrevista Cliente, a pessoa é contratada e a vaga FECHA a partir da entrega; a trava 5   │
     * │ do fechamento não barra um `ALOCADO` (para ela, ALOCADO é TRATADO), então ela continua    │
     * │ VIVA na Entrevista Cliente de uma vaga FECHADA.                                            │
     * │                                                                                           │
     * │ O QUE UM CLIQUE PRODUZIA ALI: um `ALOCADO` (que CONSOME POSIÇÃO) devolvido à Captação de  │
     * │ um processo terminado, contado pelos KPIs de funil, com a linha do tempo afirmando que o  │
     * │ cliente o reprovou DEPOIS de a vaga ter fechado entregando a posição dele. E NADA ACUSA:  │
     * │ a derivação de status sai no papel FECHAMENTO e não corrige coisa alguma.                  │
     * │                                                                                           │
     * │ A RÉGUA É A MESMA QUE O `fechar`, O `cancelar` E A SHORTLIST JÁ USAM, e não uma quarta:   │
     * │ `papelDeVagaEmProcesso` (ABERTURA ou ENTREGA). Escrever aqui uma segunda lista de papéis  │
     * │ vivos garantiria a divergência no dia em que um papel novo entrasse em uma só delas.      │
     * │                                                                                           │
     * │ PRÉ-CONFERÊNCIA, FORA DA TRANSAÇÃO, e isso é coerente e não afrouxamento: este gesto NÃO  │
     * │ consome posição (a situação não muda), então não há corrida a serializar. É o mesmo lugar │
     * │ das outras pré-conferências deste arquivo, e a recusa chega como 409 antes de qualquer    │
     * │ lock ser segurado.                                                                         │
     * │                                                                                           │
     * │ O `moverEtapa` TEM A MESMA FRESTA E NÃO É TOCADO AQUI: ele é código VALIDADO e anterior a │
     * │ esta frente (§A.26), e alargar o conserto até ele muda o comportamento de um gesto que o  │
     * │ time usa todo dia. O achado foi reportado; o alcance do conserto é decisão do diretor.    │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const vagaDaCandidatura = await this.db.query.vagas.findFirst({
      where: eq(vagas.id, c.vagaId),
    });
    if (!vagaDaCandidatura) throw new NotFoundException("Vaga da candidatura não encontrada.");
    if (!papelDeVagaEmProcesso(regua.linha(vagaDaCandidatura.status).papel)) {
      throw new ConflictException(
        `Esta vaga está em "${regua.rotulo(vagaDaCandidatura.status)}" e não tem processo em andamento. Não é possível registrar reprovação pelo cliente nela.`,
      );
    }

    if (!etapasDeEntrega.has(c.etapa)) {
      throw new BadRequestException(
        "Só é possível registrar reprovação pelo cliente para quem está numa etapa de entrega ao cliente. Marque a etapa na tela de Etapas Do Funil, ou mova a pessoa para ela antes.",
      );
    }

    const destino = await this.etapas.etapaInicial();
    /*
     * A ETAPA INICIAL PODE SER A PRÓPRIA ETAPA DE ENTREGA, e isso não é hipótese absurda: o
     * catálogo é do diretor, e nada no banco impede que a MESMA linha esteja marcada `inicial` e
     * `entrega_ao_cliente`. Sem esta recusa, o gesto gravaria um movimento de A para A, que é
     * evento que não conta nada e que o `moverEtapa` já recusa pela mesma função.
     */
    if (!movimentoPermitido(c.etapa, destino.codigo)) {
      throw new BadRequestException(
        "A etapa inicial do funil é a mesma em que esta pessoa está, então não há para onde voltar. Revise as etapas na tela de Etapas Do Funil.",
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(asCandidaturas)
        .set({ etapa: destino.codigo, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, candidaturaId));

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: c.etapa,
        etapaPara: destino.codigo,
        // MOVIMENTO: `situacao` NULA. Reprovar pelo cliente não encerra ninguém, e escrever
        // situação aqui transformaria o gesto num desfecho que o diretor não pediu.
        situacao: null,
        motivo: texto(dto.motivo),
        // O MARCADOR. É ele, e não o texto acima, que responde "quantos o cliente reprovou".
        reprovadoPeloCliente: true,
        porId,
      });

      /*
       * A DERIVAÇÃO RODA SEMPRE NESTE CAMINHO, e o `movimentoPodeMudarAEntrega` é redundante aqui
       * POR CONSTRUÇÃO (a guarda acima já exigiu que a ORIGEM fosse etapa de entrega). Ele fica
       * assim mesmo, pela mesma forma do `moverEtapa`: é a rotina de módulo que decide quando
       * derivar, em UM lugar só, e um caminho que a chamasse direto seria o primeiro a divergir no
       * dia em que a régua do atalho mudar.
       */
      if (movimentoPodeMudarAEntrega([c.etapa, destino.codigo], etapasDeEntrega)) {
        await derivarStatusDaVaga(tx, c.vagaId, regua, etapasDeEntrega, porId);
      }
    });

    return this.candidatura(candidaturaId);
  }

  /**
   * APROVAR: a operação que CONSOME POSIÇÃO, e onde vivem as travas 1 e 4.
   *
   * ┌─ A TRAVA 4, QUE É A QUE MAIS IMPORTA E A QUE SE COSTUMA ERRAR ─────────────────────────────┐
   * │                                                                                            │
   * │ O CENÁRIO: dois consultores aprovam o 10º e o 11º candidato de uma vaga de 10 ao mesmo      │
   * │ tempo. Cada um lê "9 ocupadas", cada um conclui "ainda cabe", os dois gravam, e a vaga fecha│
   * │ com 11. Isso funciona em toda demonstração e falha na primeira sexta-feira movimentada.     │
   * │                                                                                            │
   * │ POR QUE UMA CONSULTA SOLTA ANTES DO INSERT NÃO RESOLVE: ela responde sobre o passado. Entre │
   * │ o `select count(*)` e o `update`, a outra transação faz exatamente a mesma coisa, e as duas │
   * │ leram um estado em que ainda cabia.                                                        │
   * │                                                                                            │
   * │ COMO ESTÁ RESOLVIDO AQUI, e a ordem é a regra inteira:                                     │
   * │   1. abre a TRANSAÇÃO;                                                                     │
   * │   2. trava a LINHA DA VAGA com `SELECT ... FOR UPDATE`;                                    │
   * │   3. SÓ DEPOIS conta as ocupadas;                                                          │
   * │   4. decide e grava;                                                                       │
   * │   5. fecha a transação, e só aí a linha da vaga é liberada.                                │
   * │                                                                                            │
   * │ A vaga é o RECURSO DISPUTADO, então é a linha dela que serializa a disputa. A segunda       │
   * │ transação fica bloqueada no passo 2 até a primeira terminar, e quando ela finalmente conta, │
   * │ conta o número JÁ ATUALIZADO: cai na trava 1 e recebe a mensagem de vaga cheia. As duas     │
   * │ requisições continuam sendo atendidas; o que não acontece é as duas passarem.               │
   * │                                                                                            │
   * │ TRAVAR A LINHA DA CANDIDATURA NÃO RESOLVERIA: são candidaturas DIFERENTES, e dois locks em  │
   * │ linhas diferentes não se enxergam. É a vaga que precisa ser travada, e é o `FOR UPDATE` na  │
   * │ vaga que faz a fila existir.                                                               │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async aprovar(candidaturaId: string, porId: string): Promise<AsCandidaturaItem> {
    /*
     * ┌─ AS DUAS GUARDAS QUE FALTAVAM AQUI (achado da auditoria, 08/09) ──────────────────────────┐
     * │ ATÉ AQUI A APROVAÇÃO NÃO CONFERIA SITUAÇÃO NENHUMA, e as duas consequências eram caras:   │
     * │                                                                                          │
     * │ 1. APROVAR QUEM JÁ FOI ENTREGUE DESFAZIA A ENTREGA. `ALOCADO` virava `APROVADO`, a        │
     * │    contagem de entregues CAÍA, o cilindro da tela esvaziava e a vaga que estava completa  │
     * │    voltava a exigir um Master para fechar. Quem barra isso é a régua de não retroceder    │
     * │    entrega, que mora no caminho travado e vale para TODO chamador, não só para este.      │
     * │                                                                                          │
     * │ 2. APROVAR UM DESCARTADO RESSUSCITAVA A LINHA MORTA e pulava a ciência de reentrada, que  │
     * │    é exatamente o buraco que a finalização de posição fechou com `exigeCandidaturaViva` e │
     * │    que a aprovação nunca recebeu. Quem foi recusado e volta a ser escolhido tem UM         │
     * │    caminho, o da `alocar`, que mostra o motivo e a data do encerramento anterior.         │
     * │                                                                                          │
     * │ É O MECANISMO QUE JÁ EXISTE, e não um segundo: a mesma opção da `finalizarPosicao`,       │
     * │ conferida DENTRO da transação, sob a linha da vaga já travada.                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    await this.mudarSituacaoOcupandoPosicao(candidaturaId, "APROVADO", null, porId, undefined, {
      exigeCandidaturaViva: true,
    });
    return this.candidatura(candidaturaId);
  }

  /**
   * ─ FINALIZAR POSIÇÃO: a posição da vaga é ENTREGUE, com nome e sobrenome ──────────────────────
   *
   * O QUE ELA RESOLVE. Até aqui, o ÚNICO jeito de dizer "esta posição foi preenchida" era FECHAR a
   * vaga com um número digitado à mão, e fechar bloqueia: a vaga entregue para de receber candidato
   * (o flag `recebeCandidato` do catálogo). Quem tinha 5 posições e entregou a primeira ficava entre
   * mentir o número ou fechar cedo demais. Com esta operação, entregar uma posição é um fato por pessoa, e a
   * vaga continua aberta enquanto sobrar posição.
   *
   * ELA NÃO É UMA SAÍDA, e é por isso que ela não passa pelo `registrarSaida`: o candidato ALOCADO
   * CONTINUA NO FUNIL. O `@IsIn` do `RegistrarSaidaDto` recusa `ALOCADO` de propósito, então nem
   * corpo montado fora da tela entra por lá.
   *
   * ELA PASSA PELO CAMINHO TRAVADO, e isto é a regra mais cara deste arquivo: `ALOCADO` consome
   * posição, então gravá-lo por fora de `mudarSituacaoOcupandoPosicao` reabriria a corrida entre dois
   * consultores que o `SELECT ... FOR UPDATE` do passo 2 existe para fechar. O comentário de 30
   * linhas da `aprovar`, logo acima, explica por que uma consulta solta antes do update não resolve.
   *
   * SEM MOTIVO, de propósito (`null`): entregar a posição é o desfecho bem-sucedido, e não tem
   * justificativa a dar. Quem precisa de motivo é a saída, que encerra o processo de alguém.
   *
   * ┌─ SÓ CANDIDATURA VIVA FINALIZA POSIÇÃO, e esta trava faltava (achado da auditoria) ─────────┐
   * │ SEM ELA, uma candidatura DESCARTADA ia direto a `ALOCADO`. Quem foi descartado e volta a    │
   * │ ser escolhido tem UM caminho, o da `alocar`: ela mostra o MOTIVO e a DATA do descarte e     │
   * │ exige a ciência de reentrada, porque escolher de novo quem já foi recusado costuma ser      │
   * │ engano de lista. Finalizar posição por cima da linha morta pulava essa conversa inteira e   │
   * │ ainda ressuscitava a candidatura ENCERRADA em vez de abrir a nova que o histórico espera.   │
   * │                                                                                            │
   * │ O DADO NUNCA CHEGOU A FICAR TORTO, e é isso que faz disto uma correção de RECUSA e não de   │
   * │ integridade: o índice parcial `uq_as_candidaturas_viva` já impedia duas vivas do mesmo par  │
   * │ pessoa/vaga. O que ele NÃO impedia era o caso da pessoa sem outra candidatura viva ali, e   │
   * │ nesse caso a linha morta virava ALOCADO consumindo posição, sem ninguém ser avisado.        │
   * │                                                                                            │
   * │ A RÉGUA É `candidaturaViva`, do domínio, a MESMA da `trocarVaga`. Não se escreve aqui uma   │
   * │ segunda lista de quem está vivo: ela divergiria da primeira no dia em que o vocabulário     │
   * │ mudasse, que é o defeito que este módulo já pagou cinco vezes.                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async finalizarPosicao(
    candidaturaId: string,
    dto: FinalizarPosicaoDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    try {
      await this.mudarSituacaoOcupandoPosicao(
        candidaturaId,
        "ALOCADO",
        null,
        porId,
        {
          lado: dto.lado ?? "OFICIAL",
          cienteBancoComOficiaisAbertas: dto.cienteBancoComOficiaisAbertas === true,
        },
        // TRAVA 5, PRIMEIRA CAMADA (ver o parágrafo "SÓ CANDIDATURA VIVA FINALIZA", acima).
        { exigeCandidaturaViva: true },
      );
    } catch (err) {
      /*
       * TRAVA 5, SEGUNDA CAMADA: a mesma divisão de trabalho da `alocar`, e pelo mesmo motivo.
       *
       * A primeira camada recusa com a frase de gente; esta traduz a violação do índice parcial
       * `uq_as_candidaturas_viva` na fresta que a primeira não cobre. A fresta é estreita e existe:
       * a `alocar` NÃO trava a linha da vaga, então ela pode criar a segunda candidatura viva do
       * par pessoa/vaga entre a leitura desta transação e a gravação dela. Sem esta camada, aquele
       * encontro chega na tela como 500 com erro cru de banco, em vez da frase que a `alocar`
       * devolveria no mesmo caso.
       *
       * `traduzirUnique` DEVOLVE O ERRO INTACTO quando não reconhece a restrição, então as recusas
       * legítimas de dentro da transação (vaga cheia, aviso do banco, candidatura não encontrada)
       * passam por aqui sem mudar de forma nem de status.
       */
      throw this.traduzirUnique(err);
    }
    return this.candidatura(candidaturaId);
  }

  /**
   * ─ TROCAR A VAGA DA CANDIDATURA (item 5 do diretor) ──────────────────────────────────────────
   *
   * ┌─ ELA É DE QUALQUER CONSULTOR DESDE A FRENTE D, e esta linha dizia o contrário ─────────────┐
   * │ Estava escrito aqui "só MASTER e SUPER_ADMIN", e o `@Roles("MASTER","SUPER_ADMIN")` da rota │
   * │ SAIU na Frente D, por decisão do diretor: o time operacional faz a gestão das vagas, e      │
   * │ transferir alguém da vaga A para a B é gesto de gestão, não de exceção.                     │
   * │                                                                                            │
   * │ POR QUE A FRASE VELHA ERA PERIGOSA E NÃO SÓ FEIA: comentário que descreve uma trava         │
   * │ REVOGADA é lido pela próxima sessão como verdade, e ela passa a raciocinar (e a construir)  │
   * │ apoiada num papel que ninguém mais exige. É a mesma classe de defeito que a §A.26 existe    │
   * │ para pegar, com a agravante de estar num arquivo que todo mundo abre.                       │
   * │                                                                                            │
   * │ O QUE RESTRINGE HOJE é o menu `as-candidatos`, no `MenuGuard`. As travas que sobrevivem     │
   * │ estão AQUI no service, onde sempre estiveram, e elas dependem do ESTADO da linha, não do    │
   * │ papel: candidatura viva, vaga de destino que recebe candidato, pessoa que já está no        │
   * │ destino e teto de posições do destino.                                                      │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O QUE ELA É, E O QUE ELA NÃO É ───────────────────────────────────────────────────────────┐
   * │ CORRIGE, não recomeça. O candidato foi alocado na vaga ERRADA, e o único caminho era o      │
   * │ "Trazer De Volta", que cria uma SEGUNDA candidatura e devolve a pessoa para a Captação.     │
   * │ Aquilo está certo para RECOMEÇO e errado para CORREÇÃO: o processo não recomeçou, ele       │
   * │ estava anotado no lugar errado. Aqui a MESMA linha muda de vaga e a ETAPA fica onde estava. │
   * │                                                                                            │
   * │ OS DOIS CAMINHOS CONVIVEM DE PROPÓSITO: este mantém, aquele duplica.                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ POR QUE NÃO HÁ CONTAGEM A ATUALIZAR, e este é o achado da investigação (§A.27) ───────────┐
   * │ A ocupação NUNCA é armazenada: `ocupacaoDaVaga` conta as linhas APROVADO/ENVIADO_PARA_ADMISSAO toda    │
   * │ vez que alguém pergunta. Então trocar o `vagaId` já deixa as DUAS vagas certas na leitura   │
   * │ seguinte, sem ninguém decrementar a origem nem incrementar o destino. Não existe contador   │
   * │ para dessincronizar, e é exatamente por isso que o módulo recusou guardar um desde o        │
   * │ primeiro dia.                                                                              │
   * │                                                                                            │
   * │ O CILINDRO DA CENTRAL DE VAGAS TAMBÉM NÃO SE MOVE: ele lê `vagas_fechadas`, o contador do   │
   * │ FECHAMENTO, e não as candidaturas.                                                         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A CONCORRÊNCIA: TRAVA SÓ O DESTINO ───────────────────────────────────────────────────────┐
   * │ A origem apenas PERDE um ocupante, e perder ocupante não viola restrição nenhuma: não há o  │
   * │ que proteger lá. Travar as duas vagas abriria risco de DEADLOCK (duas trocas em sentidos    │
   * │ opostos travando na ordem inversa) sem comprar garantia alguma. O recurso disputado é a     │
   * │ vaga de DESTINO, e é a linha dela que serializa a disputa, como na aprovação.               │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async trocarVaga(
    candidaturaId: string,
    dto: TrocarVagaDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    /*
     * O CATÁLOGO ANTES DA TRANSAÇÃO, e a régua é SÍNCRONA lá dentro. O STATUS DA VAGA DE DESTINO
     * continua sendo lido sob o `SELECT ... FOR UPDATE`, logo abaixo, e trocar essa leitura travada
     * por uma solta aqui em cima desfaria a corrida que o lock existe para fechar.
     */
    const regua = await this.statusVaga.regua();
    // O SEGUNDO INSUMO DA DERIVAÇÃO (ver `insumosDaDerivacao`).
    const etapasDeEntrega = await this.etapas.codigosDeEntregaAoCliente();
    // A VAGA DE ORIGEM, GUARDADA PARA DEPOIS DO COMMIT. Ver o bloco da derivação, no fim do método.
    let vagaDeOrigem: string | null = null;
    await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");

      // TRAVA 4 DESTA OPERAÇÃO: só candidatura VIVA troca. Quem já saiu do processo não tem vaga a
      // corrigir, tem processo a recomeçar, e para isso existe o "Trazer De Volta".
      if (!candidaturaViva(c.situacao)) {
        throw new ConflictException(
          "Esta candidatura já foi encerrada e não troca de vaga. Para trazer a pessoa de volta, use Trazer De Volta, que abre um processo novo.",
        );
      }

      if (c.vagaId === dto.vagaId) {
        throw new BadRequestException("Esta candidatura já está nesta vaga.");
      }

      // ── A LINHA DA VAGA DE DESTINO É TRAVADA ANTES DE QUALQUER CONTAGEM. Daqui até o fim da
      // transação, nenhuma outra aprovação ou troca nesta mesma vaga passa deste ponto.
      const [destino] = await tx
        .select({
          id: vagas.id,
          status: vagas.status,
          posicoesOficiais: vagas.posicoesOficiais,
          // O CLIENTE ENTROU NESTA PROJEÇÃO por causa da entrevista do cliente (decisão 3). Ele é
          // lido SOB A TRAVA, junto do resto, e não numa segunda consulta solta.
          codCliente: vagas.codCliente,
        })
        .from(vagas)
        .where(eq(vagas.id, dto.vagaId))
        .for("update");
      if (!destino) throw new NotFoundException("Vaga de destino não encontrada.");

      // TRAVA 1: a vaga de destino recebe candidato? O flag do catálogo responde, sobre o status
      // lido AQUI, sob a linha travada.
      if (!regua.recebeCandidato(destino.status)) {
        throw new ConflictException(
          "Esta vaga não recebe candidato: ela está encerrada. Escolha uma vaga aberta.",
        );
      }

      /*
       * TRAVA 3, ANTES DO UNIQUE: a pessoa já tem candidatura VIVA na vaga de destino?
       *
       * O índice parcial `uq_as_candidaturas_viva` barraria isso de qualquer jeito, e é ele a
       * autoridade. A consulta existe para a frase: sem ela o consultor receberia um erro de banco
       * traduzido genericamente, em vez de "esta pessoa já está nesta vaga".
       */
      const [jaEsta] = await tx
        .select({ id: asCandidaturas.id })
        .from(asCandidaturas)
        .where(
          and(
            eq(asCandidaturas.candidatoId, c.candidatoId),
            eq(asCandidaturas.vagaId, dto.vagaId),
            inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
          ),
        );
      if (jaEsta) {
        throw new ConflictException(
          "Esta pessoa já está nesta vaga. Não dá para trocar para uma vaga em que ela já tem processo aberto.",
        );
      }

      /*
       * TRAVA 2: cabe mais um no destino? SÓ QUANDO A CANDIDATURA CONSOME POSIÇÃO.
       *
       * Candidatura ATIVO não ocupa nada (`consomePosicao`), então exigir posição livre para movê-la
       * repetiria o erro que a trava 1 existe para evitar: 40 currículos numa vaga de 10 é o normal
       * da operação, e travar a ENTRADA significaria só poder olhar 10 pessoas para escolher 10.
       * Quem consome posição passa pela mesma contagem da aprovação, e QUEM SÃO ELES NÃO SE DIGITA
       * AQUI: a contagem lê `SITUACOES_QUE_CONSOMEM_POSICAO`, a mesma lista de que `consomePosicao`
       * é derivada. Com a lista escrita à mão, a pergunta do `if` e a pergunta do SQL eram duas, e
       * bastava uma situação nova entrar em uma delas para a trava contar menos gente do que existe.
       *
       * ┌─ ESTA CONTAGEM AINDA É TOTAL, E A DA MUDANÇA DE SITUAÇÃO NÃO É MAIS. É deliberado ─────┐
       * │ A separação por lado de 08/09 alcançou `mudarSituacaoOcupandoPosicao`, que é onde os    │
       * │ dois defeitos foram MEDIDOS. Aqui, a troca de vaga (correção de Master) continua        │
       * │ medindo o TOTAL contra a meta oficial, e a consequência é conhecida e estreita: mover   │
       * │ para outra vaga alguém que está no BANCO pode ser recusado por uma meta oficial cheia,  │
       * │ mesmo que a vaga de destino tenha reserva sobrando. É uma RECUSA (fail-closed), nunca   │
       * │ uma posição a mais, e nenhuma linha em produção tem lado BANCO hoje.                    │
       * │                                                                                        │
       * │ NÃO FOI MEXIDO AQUI PORQUE ESTE CAMINHO NÃO TEM TESTE NENHUM e é código validado        │
       * │ (§A.26): a correção é a mesma de lá (contar com `group by posicao_lado`, ler            │
       * │ `posicoes_banco` do destino e usar `tetoDoLado` com `ladoDaCandidatura(c.posicaoLado)`),│
       * │ e ela está reportada ao coordenador para virar decisão do diretor, com teste junto.     │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (consomePosicao(c.situacao)) {
        const [{ ocupadas }] = await tx
          .select({ ocupadas: sql<number>`count(*)::int` })
          .from(asCandidaturas)
          .where(
            and(
              eq(asCandidaturas.vagaId, dto.vagaId),
              inArray(asCandidaturas.situacao, SITUACOES_QUE_CONSOMEM_POSICAO),
              // A exclusão é por segurança de borda: a candidatura ainda está na vaga ANTIGA neste
              // ponto, então ela não entraria nesta contagem de qualquer forma.
              ne(asCandidaturas.id, candidaturaId),
            ),
          );

        if (!cabeMaisUm(Number(ocupadas), destino.posicoesOficiais)) {
          if (destino.posicoesOficiais === null || destino.posicoesOficiais === undefined) {
            throw new ConflictException(
              "A vaga de destino ainda não tem o número de posições definido. Informe as posições dela antes de mover alguém já aprovado.",
            );
          }
          const n = destino.posicoesOficiais;
          throw new ConflictException(
            n === 1
              ? "A vaga de destino tem 1 posição e ela já está preenchida. Esta pessoa ocupa posição, então a troca deixaria a vaga acima do limite."
              : `A vaga de destino tem ${n} posições e as ${n} já estão preenchidas. Esta pessoa ocupa posição, então a troca deixaria a vaga acima do limite.`,
          );
        }
      }

      await tx
        .update(asCandidaturas)
        // A ETAPA NÃO ENTRA NESTE `set`, e é a garantia central da operação: quem estava na
        // Entrevista Cliente continua na Entrevista Cliente, na vaga certa.
        .set({ vagaId: dto.vagaId, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, candidaturaId));

      /*
       * O RASTRO (opção b, decisão do diretor), na MESMA transação.
       *
       * É a única operação do módulo que muda a que VAGA a candidatura pertence, mantendo linha e
       * etapa. Sem o evento, uma correção de Master em dado VIVO não deixaria marca nenhuma, e daqui
       * a três meses ninguém saberia que a pessoa esteve em outra vaga.
       *
       * `etapaPara` RECEBE A ETAPA ATUAL, que não mudou: é o que deixa explícito na linha do tempo
       * que a troca NÃO mexeu na etapa.
       */
      /*
       * ─ TRANSFERÊNCIA ENTRE CLIENTES APAGA A ENTREVISTA DO CLIENTE (decisão 3 do diretor) ──────
       *
       * ┌─ POR QUE SÓ A DO CLIENTE, E NUNCA A INTERNA ────────────────────────────────────────────┐
       * │ A PESSOA É A MESMA. A entrevista SOULAN aconteceu (ou está marcada) com o nosso time, e  │
       * │ ela continua valendo de pé em qualquer vaga: apagá-la faria o consultor remarcar uma     │
       * │ conversa que já teve. A entrevista com o CLIENTE é com AQUELE cliente, e ela não          │
       * │ sobrevive à mudança de cliente: manter é deixar na agenda da semana um compromisso com   │
       * │ quem não vai mais receber esta pessoa.                                                    │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * QUEM SÃO AS ETAPAS DE ENTREGA VEM DO CATÁLOGO (`entrega_ao_cliente`), e nunca de uma
       * segunda lista escrita aqui: é a MESMA fonte que a derivação de status e a reprovação pelo
       * cliente já leem. Conjunto VAZIO não apaga nada, e esse é o lado seguro: catálogo sem etapa
       * marcada não pode significar "apague todas".
       *
       * ┌─ CLIENTE DESCONHECIDO NÃO APAGA NADA, E ISSO É DECISÃO ─────────────────────────────────┐
       * │ `vagas.cod_cliente` é NULÁVEL de propósito (a carga importou vaga sem cliente resolvido),│
       * │ então `null !== "X"` é "não sei", e não "é outro". Apagar sobre desconhecimento          │
       * │ destruiria a entrevista de uma vaga cujo cliente talvez seja o MESMO, e destruir é        │
       * │ irreversível. Abster-se é o comportamento seguro.                                         │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * NA MESMA TRANSAÇÃO do `update` do `vagaId`, e não depois: fora dela, uma falha parcial
       * deixaria a entrevista VIVA apontando para o cliente novo, que é exatamente o estado que
       * este bloco existe para impedir.
       */
      const clienteDaOrigem = await tx.query.vagas.findFirst({ where: eq(vagas.id, c.vagaId) });
      const trocouDeCliente =
        !!clienteDaOrigem?.codCliente &&
        !!destino.codCliente &&
        clienteDaOrigem.codCliente !== destino.codCliente;

      let entrevistasRemovidas = 0;
      if (trocouDeCliente && etapasDeEntrega.size > 0) {
        const removidas = await tx
          .delete(asCandidaturaEntrevistas)
          .where(
            and(
              eq(asCandidaturaEntrevistas.candidaturaId, candidaturaId),
              inArray(asCandidaturaEntrevistas.etapa, [...etapasDeEntrega]),
            ),
          )
          .returning({ id: asCandidaturaEntrevistas.id });
        entrevistasRemovidas = removidas.length;
      }

      /*
       * A TRILHA DIZ O QUE ACONTECEU, NO MOLDE DE `narrativaDoCancelamento`: CONTAGEM e rótulo de
       * processo, NUNCA nome, NUNCA data da entrevista apagada, NUNCA nada do candidato (§A.6). E
       * nada no logger: este arquivo não tem um, de propósito.
       *
       * A FRASE DO CONSULTOR VEM PRIMEIRO e a do sistema depois, pelo mesmo motivo que a narrativa
       * do cancelamento põe o motivo na frente: quem lê a linha do tempo procura primeiro o porquê
       * humano, e o efeito automático é a consequência dele.
       */
      const partes: string[] = [];
      const motivoDoConsultor = texto(dto.motivo);
      if (motivoDoConsultor) partes.push(motivoDoConsultor);
      if (entrevistasRemovidas > 0) {
        partes.push(
          entrevistasRemovidas === 1
            ? "Transferência para outro cliente: 1 entrevista com o cliente foi removida. A entrevista interna foi mantida."
            : `Transferência para outro cliente: ${entrevistasRemovidas} entrevistas com o cliente foram removidas. A entrevista interna foi mantida.`,
        );
      }

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: null,
        etapaPara: c.etapa,
        situacao: null,
        vagaDe: c.vagaId,
        vagaPara: dto.vagaId,
        motivo: partes.length > 0 ? partes.join(" ") : null,
        porId,
      });

      /*
       * ─ O STATUS DAS DUAS VAGAS ACOMPANHA, E ELAS SÃO DERIVADAS EM MOMENTOS DIFERENTES ─────────
       *
       * O DESTINO VAI AQUI, DENTRO DA TRANSAÇÃO: a linha dele JÁ ESTÁ TRAVADA (trava 2 desta
       * operação), então o `FOR UPDATE` da rotina é o mesmo lock, já nosso.
       *
       * ┌─ A ORIGEM VAI DEPOIS DO COMMIT, E ISSO É PREVENÇÃO DE DEADLOCK, NÃO DESLEIXO ──────────┐
       * │ Travar a origem AQUI significaria pedir um segundo lock de vaga segurando o primeiro, e │
       * │ em ordem que este método não controla (o destino já foi travado). Duas trocas           │
       * │ simultâneas em sentidos opostos (A->B e B->A) travariam uma na outra: o Postgres        │
       * │ detecta e ABORTA uma delas, então a correção de um Master viraria um erro 500 sem       │
       * │ nenhuma razão visível.                                                                   │
       * │                                                                                          │
       * │ E O ATRASO É INÓCUO, que é o que torna a escolha defensável: a derivação é IDEMPOTENTE  │
       * │ (pergunta presença e grava só quando o destino difere), então uma falha aqui não         │
       * │ corrompe nada, só deixa a vaga de origem um movimento atrás, até o próximo gesto de      │
       * │ candidato nela. O FATO (a pessoa trocou de vaga) já está commitado, e derivar a origem   │
       * │ dentro da mesma transação faria uma troca legítima ser desfeita por um efeito.            │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      /*
       * A TROCA NÃO MEXE NA ETAPA (é a garantia central da operação, ver o `set` acima), então a
       * MESMA etapa responde pelas DUAS vagas: se a pessoa não está com o cliente, tirá-la de uma
       * vaga e pô-la na outra não muda a entrega de nenhuma das duas.
       */
      if (movimentoPodeMudarAEntrega([c.etapa], etapasDeEntrega)) {
        await derivarStatusDaVaga(tx, dto.vagaId, regua, etapasDeEntrega, porId);
        vagaDeOrigem = c.vagaId;
      }
    });

    if (vagaDeOrigem) {
      await this.db.transaction(async (tx) => {
        await derivarStatusDaVaga(tx, vagaDeOrigem as string, regua, etapasDeEntrega, porId);
      });
    }

    return this.candidatura(candidaturaId);
  }

  /**
   * REGISTRAR SAÍDA, de QUALQUER etapa: DESCARTADO, DESISTIU ou ENVIADO_PARA_ADMISSAO.
   *
   * `ENVIADO_PARA_ADMISSAO` É A SAÍDA DIFERENTE e vai pelo caminho travado, porque ela consome posição como a
   * aprovação. `DESCARTADO` e `DESISTIU` liberam posição em vez de consumir, então não precisam da
   * trava: elas nunca fazem a vaga estourar.
   *
   * ┌─ QUEM ESCOLHE O CAMINHO É A RÉGUA, e não o nome da situação (achado do tester, 08/09) ─────┐
   * │ ERA `dto.situacao === "ENVIADO_PARA_ADMISSAO"`, uma comparação com um nome digitado, e o    │
   * │ perigo estava a UMA linha de distância: bastava alguém acrescentar `"ALOCADO"` à lista de   │
   * │ saídas, achando que unificava as rotas, para a alocação cair no `update` direto. Sem        │
   * │ `FOR UPDATE`, sem `cabeMaisUm`, sem lado e sem aceite: vaga de 5 aceitando 6 alocados, em   │
   * │ silêncio, porque a trava não teria sido burlada, apenas não consultada.                     │
   * │                                                                                            │
   * │ PERGUNTANDO A `ocupaPosicao` (que é `consomePosicao` com o tipo estreitado), toda situação   │
   * │ que consome posição entra no caminho travado SOZINHA, no dia em que for criada.             │
   * │                                                                                            │
   * │ HOJE A RESPOSTA É IDÊNTICA À DE ANTES, e é isso que faz disto correção sem mudança de       │
   * │ comportamento: das três saídas aceitas, só `ENVIADO_PARA_ADMISSAO` consome posição.         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  /**
   * ─ O MOTIVO DO DESVÍNCULO É CONFERIDO CONTRA O CATÁLOGO `motivos_descarte` (Frente A, ponto 7) ─
   *
   * ┌─ POR QUE A CONFERÊNCIA NÃO PODE VIVER SÓ NA TELA ──────────────────────────────────────────┐
   * │ O vocabulário de descarte se formou, e o diretor fechou a lista. Um seletor no navegador,   │
   * │ sozinho, é a mesma régua que já furou aqui uma vez: até o ajuste 7, o motivo era exigido    │
   * │ só na tela e qualquer chamada direta à rota gravava desfecho sem motivo. Catálogo que vive  │
   * │ apenas no combobox é texto livre com aparência de lista.                                    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O RECORTE É A PARTE QUE MAIS IMPORTA, E ELE SAI DO VOCABULÁRIO COMPARTILHADO ─────────────┐
   * │ `SITUACOES_COM_MOTIVO_DE_CATALOGO` é `DESCARTADO` e `DESISTIU`: o DESVÍNCULO, que a tela    │
   * │ trata como um gesto só ("Desvincular Da Vaga") e cujo vocabulário é o que o diretor ditou.  │
   * │                                                                                            │
   * │ `ENVIADO_PARA_ADMISSAO` FICA DE FORA, e isto é §A.26, não esquecimento: ali o mesmo campo   │
   * │ pede PROSA ("o que fechou o processo e o que a admissão precisa saber"). Conferi-lo contra  │
   * │ "Reprovado, Faltante, Desistente..." recusaria o envio para a esteira de TODA pessoa        │
   * │ aprovada, derrubando a ponte A&S para Admissão, que é código validado em produção.          │
   * │                                                                                            │
   * │ A LISTA MORA NO `shared-types` para a tela e o servidor lerem a MESMA: se a tela decidisse  │
   * │ sozinha quando mostrar seletor e quando mostrar caixa de texto, o dia em que o recorte      │
   * │ mudasse seria o dia em que a tela passaria a oferecer o que a rota recusa.                  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O HISTÓRICO ANTIGO NÃO É TOCADO, E ESSE É O RISCO QUE A FRENTE TINHA ─────────────────────┐
   * │ `motivo_descarte` guardou TEXTO LIVRE por toda a vida da coluna, e a migration NÃO o        │
   * │ reescreve. Esta conferência é de ESCRITA NOVA e roda numa ÚNICA porta (`registrarSaida`):   │
   * │ nenhuma LEITURA compara o que está gravado com o catálogo, não existe FK e não existe       │
   * │ `restrict`, então "reprovado na entrevista com o cliente", de junho, continua legível na    │
   * │ ficha, no histórico e no relatório da vaga. É o mesmo desenho de `vagas.cancelamento_       │
   * │ motivo`. Provado em `motivos-descarte.saida.spec.ts`.                                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OS OUTROS ESCRITORES DE `motivo_descarte` CONTINUAM FORA, cada um por uma razão própria, e a
   * lista é completa (a pergunta "quem mais escreve este dado?" foi respondida por varredura):
   *   . `vagas.service.cancelar` grava `"Vaga cancelada: <motivo>"` pelo `gravarSaidaDaCandidatura`,
   *     com o motivo JÁ conferido contra o OUTRO catálogo (`motivos_cancelamento_vaga`). Conferir
   *     aqui faria o sistema recusar a si mesmo.
   *   . A ingestão externa (`ingestao-ciclo`) grava `as_depara_etapa_externa.motivo_padrao`, que é
   *     CONFIGURAÇÃO revisada por admin, e não digitação de consultor.
   *   . `restaurar-candidatura` e a reversão do envio NULAM o campo; não escrevem motivo.
   *   . `registrarSaidaEmLote` NÃO é porta nova: ele chama esta mesma `registrarSaida`, linha a
   *     linha, então o lote herda a conferência sem nenhuma segunda régua.
   *
   * A CONSULTA É A MESMA DO SELETOR (`motivosDeDescarteAtivos`), e roda ANTES de qualquer transação:
   * motivo fora da lista é erro de CORPO, não conflito de estado, e recusar antes é a diferença entre
   * um 400 imediato e um lock segurado à toa. Mesmo desenho de `VagasService.cancelar`.
   *
   * §A.6: a frase de recusa carrega vocabulário de processo. Nenhum CPF, nenhum nome, nenhum log.
   */
  /*
   * ─ ELA PASSOU A DEVOLVER A LINHA DO CATÁLOGO, e a mudança de retorno é o ponto (Frente E) ─────
   *
   * Antes ela devolvia `void` e servia a UMA pergunta ("este motivo está na lista?"). Agora são
   * DUAS, e a segunda é "este motivo PEDE A PRETENSÃO SALARIAL?" (`pedePretensao`, migration 0131).
   *
   * A CONSULTA CONTINUA SENDO UMA SÓ, e é por isso que a resposta sobe em vez de virar um segundo
   * método com um segundo `select`: duas leituras do mesmo catálogo, em pontos diferentes do mesmo
   * gesto, podem ler estados diferentes se o diretor salvar a tela de administração no meio, e aí o
   * motivo seria aceito por uma e classificado pela outra.
   *
   * `null` QUER DIZER "ESTA SAÍDA NÃO TEM MOTIVO DE CATÁLOGO", e não "não achei": o recorte
   * (`SITUACOES_COM_MOTIVO_DE_CATALOGO`) continua sendo só o DESCARTE, e sair antes é o que mantém
   * o `ENVIADO_PARA_ADMISSAO` escrevendo PROSA, como a ponte A&S para Admissão exige (§A.26).
   */
  private async exigirMotivoDoCatalogo(dto: RegistrarSaidaDto): Promise<AsMotivoDescarte | null> {
    if (!motivoVemDoCatalogo(dto.situacao)) return null;
    const ativos = await motivosDeDescarteAtivos(this.db);
    const escolhido = ativos.find((m) => m.nome === dto.motivo);
    if (escolhido) return escolhido;
    throw new BadRequestException("Motivo de saída inválido. Escolha um motivo da lista.");
  }

  /**
   * ─ A PRETENSÃO SALARIAL: EXIGIDA QUANDO O MOTIVO PEDE, RECUSADA QUANDO NÃO (ponto 9) ──────────
   *
   * ┌─ A LIGAÇÃO É PELA MARCA DO CATÁLOGO, E NÃO PELO NOME DO MOTIVO, EM CAMADA NENHUMA ──────────┐
   * │ `motivos_descarte` é gerenciável pelo diretor: ele cria, RENOMEIA e inativa pela tela. Um    │
   * │ `motivo === "Pretensão Salarial"` aqui pararia de funcionar no dia em que ele corrigisse a   │
   * │ grafia, SEM NADA FALHAR: o campo simplesmente deixaria de ser pedido, e o dado deixaria de   │
   * │ ser coletado em silêncio, que é o pior tipo de defeito que existe. Quem responde é o         │
   * │ booleano `pedePretensao` da linha, e a OST diz isso com todas as letras.                      │
   * │                                                                                              │
   * │ E O NOME NÃO SERVIRIA NEM HOJE: a semente da 0129 tem seis motivos e nenhum deles é          │
   * │ "pretensão salarial". Comparar por nome exigiria INVENTAR um, que é o que a §A.31 recusa.    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ AS DUAS METADES, E A SEGUNDA É A QUE SE ESQUECE ───────────────────────────────────────────┐
   * │ 1. O MOTIVO PEDE E O VALOR NÃO VEIO -> 400. Sem isto, a regra viveria só no navegador, e     │
   * │    qualquer chamada direta à rota gravaria o desfecho sem o número que ele existe para       │
   * │    explicar. É letra por letra o furo que o ajuste 7 já pagou neste mesmo DTO.                │
   * │ 2. O MOTIVO NÃO PEDE E O VALOR VEIO -> 400. Esta é §A.6 antes de ser higiene: sem ela, o     │
   * │    campo é uma gaveta de salário aberta em QUALQUER desfecho, e o sistema passa a guardar    │
   * │    dado financeiro de pessoa que ninguém mandou guardar. Minimização é recusar o que não se  │
   * │    pediu, não só deixar de pedir.                                                             │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * SÍNCRONA E PURA, sobre a linha que a consulta acima já trouxe: ela não vai ao banco, então roda
   * ANTES de qualquer transação, como toda recusa de CORPO deste arquivo. Motivo errado é 400
   * imediato, nunca um lock segurado à toa.
   *
   * §A.6: as duas frases falam do CAMPO e NUNCA repetem o valor recebido. Um erro que devolvesse o
   * número faria o dado financeiro viajar na resposta e, dali, para qualquer log de cliente HTTP, que
   * é a mesma razão pela qual a recusa de CPF duplicado não repete o CPF.
   */
  private exigirPretensaoQuandoOMotivoPede(
    dto: RegistrarSaidaDto,
    motivo: AsMotivoDescarte | null,
  ): void {
    const pede = motivo?.pedePretensao === true;
    const veio = dto.pretensaoSalarial !== undefined && dto.pretensaoSalarial !== null;

    if (pede && !veio) {
      throw new BadRequestException(
        "Este motivo pede a pretensão salarial do candidato. Informe o valor pretendido.",
      );
    }
    if (!pede && veio) {
      throw new BadRequestException(
        "Este motivo não pede pretensão salarial. Escolha o motivo que pede o valor, ou envie o desfecho sem ele.",
      );
    }
  }

  async registrarSaida(
    candidaturaId: string,
    dto: RegistrarSaidaDto,
    user: AuthUser,
  ): Promise<AsCandidaturaItem> {
    // QUEM vem da SESSÃO inteira, e não só o id: a autoria continua sendo `user.id`, e o PAPEL é o
    // que a trava do desvínculo de ALOCADO consulta, mais abaixo. Ver o bloco dela.
    const porId = user.id;

    /*
     * AS DUAS CONFERÊNCIAS DE CORPO, NA ORDEM, E ANTES DE QUALQUER TRANSAÇÃO: o motivo está na
     * lista ativa, e a pretensão acompanha (ou não acompanha) o que aquele motivo pede. A segunda
     * consome a LINHA que a primeira já trouxe, para o catálogo ser lido UMA vez só.
     */
    const motivoEscolhido = await this.exigirMotivoDoCatalogo(dto);
    this.exigirPretensaoQuandoOMotivoPede(dto, motivoEscolhido);

    if (ocupaPosicao(dto.situacao)) {
      /*
       * ┌─ A PONTE A&S → ESTEIRA, PASSO 1: O GESTO DE ENVIAR EXIGE CPF VÁLIDO ────────────────────┐
       * │ A pré-admissão nasce pela CHAVE DE IDENTIDADE do candidato (o CPF, §A.3), e a régua de   │
       * │ CPF da liberação (`travarDuplicidadeDeCpf`, `uq_admissao_cpf_vaga_viva`) se apoia nela.  │
       * │ Sem CPF válido, enviar criaria uma admissão sem sobre o que essas travas raciocinarem.   │
       * │                                                                                         │
       * │ TRAVA SÓ O GESTO DE ENVIO, e não o funil: candidato entra e anda no funil sem CPF        │
       * │ (o cadastro o faz opcional, de propósito). É AQUI, no avanço para a esteira, que o dado  │
       * │ passa a ser exigido, porque é aqui que ele começa a ser necessário.                      │
       * │                                                                                         │
       * │ FAIL-CLOSED, mensagem própria, e §A.6: o CPF NÃO entra na frase de erro nem em log algum │
       * │ (este ramo já loga só o código do motivo). A validação roda ANTES de consumir a posição:│
       * │ recusar depois deixaria a posição consumida sem admissão do outro lado.                  │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const ponte = await this.dadosDaPonteParaAdmissao(candidaturaId);
      const cpf = normalizeCpf(ponte?.candidato.cpf ?? "");
      if (!isValidCpf(cpf)) {
        throw new BadRequestException(
          "Este candidato não tem CPF válido. Preencha o CPF antes de enviar para admissão.",
        );
      }

      await this.mudarSituacaoOcupandoPosicao(
        candidaturaId,
        dto.situacao,
        texto(dto.motivo),
        porId,
        // SEM ESCOLHA DE LADO: o avanço para a esteira não escolhe de que lado da meta a posição
        // sai, ele herda o lado JÁ GRAVADO na candidatura (ver o bloco do lado, no caminho travado).
        undefined,
        /*
         * ┌─ A TERCEIRA PORTA, FECHADA (decisão do diretor, Onda B) ────────────────────────────────────┐
         * │ ESTE CHAMADOR NÃO LIGAVA A CONFERÊNCIA, e os outros dois ligavam. O efeito era uma          │
         * │ RESSURREIÇÃO: enviar para a admissão uma candidatura JÁ ENCERRADA reescrevia a linha morta  │
         * │ como `ENVIADO_PARA_ADMISSAO`, que CONSOME POSIÇÃO da vaga, sem Master, sem aceite de        │
         * │ reentrada e sem a conversa que a `alocar` existe para ter. A fronteira de encerrada para    │
         * │ viva tem DUAS portas declaradas (a restauração do reabrir e a reentrada com aceite), e esta │
         * │ era uma terceira, não declarada.                                                            │
         * │                                                                                             │
         * │ A TELA VOLTA A DIZER A VERDADE DE GRAÇA: o aviso do lote ("vão voltar na lista de falhas")  │
         * │ já era verdadeiro no modo DESVINCULAR e falso neste, com o MESMO texto e o MESMO componente.│
         * │ Com a conferência ligada, o backend recusa e a pessoa realmente volta na lista de falhas.   │
         * │ Nenhum texto precisou mudar.                                                                │
         * └─────────────────────────────────────────────────────────────────────────────────────────────┘
         */
        { exigeCandidaturaViva: true },
        /*
         * ┌─ O RETRATO DA PROCEDÊNCIA VAI JUNTO, E É ESTE O CAMINHO QUE FALTAVA (0147) ───────┐
         * │ 273 DE 394 ENVIOS (69%) SAEM POR AQUI, de vaga ainda em PENDENTE_REVISAO, sem     │
         * │ nunca passar pelo "Liberar Vaga" (medido pelo `seguranca`). Como a trilha de      │
         * │ procedência só era escrita na liberação, no caminho DOMINANTE não ficava           │
         * │ registrado quem agiu sobre valores vindos da planilha.                             │
         * │                                                                                    │
         * │ ISTO SÓ ACRESCENTA REGISTRO: nenhum status muda, nenhum papel muda, nenhuma        │
         * │ liberação dispara, e a régua de quem pode enviar fica como está (§A.47, o gatilho  │
         * │ da esteira não se mexe).                                                           │
         * │                                                                                    │
         * │ O RETRATO VEM DA MESMA LEITURA QUE A PONTE JÁ FEZ, logo acima, e é por isso que    │
         * │ ele descreve o instante do envio: a partir desta frente a gravação humana LIMPA a  │
         * │ procedência na vaga, então perguntar depois responderia sobre o estado de HOJE.    │
         * │                                                                                    │
         * │ `?? []` NÃO É DEFENSIVO À TOA: `ponte` é tipada como nula, e aqui ela nunca é (o   │
         * │ CPF acima já teria lançado). O vazio é o valor certo nos dois casos, e é ele que   │
         * │ mantém o denominador da contagem.                                                  │
         * └────────────────────────────────────────────────────────────────────────────────────┘
         */
        ponte?.procedenciaDaPlanilha ?? [],
      );

      /*
       * ┌─ A PONTE A&S → ESTEIRA, PASSO 2: NASCE A PRÉ-ADMISSÃO E A CANDIDATURA APONTA PARA ELA ──┐
       * │ A posição já foi consumida (o fato); a ponte é EFEITO, e mora FORA da transação da       │
       * │ posição pelo mesmo motivo do envio do link logo abaixo: uma falha aqui não desfaz uma    │
       * │ saída consumada. A pré-admissão nasce em AGUARDANDO_LIBERACAO (nunca `create`), então as  │
       * │ frentes/régua e o dedup de CPF por vínculo ficam para o `aplicarLiberacao`, onde já moram.│
       * │                                                                                          │
       * │ IDEMPOTÊNCIA: `criarPreAdmissaoDoFunil` captura o unique parcial `uq_admissao_cpf_vaga_   │
       * │ viva` e devolve a admissão viva existente do par (CPF + idVacancy). O `admissao_id` é     │
       * │ regravado com esse id, então repetir não duplica nem deixa a candidatura sem ponte.       │
       * │                                                                                          │
       * │ `possivelDuplicata` é conta AO VIVO (mesmo critério do Pandapé): já há admissão viva do   │
       * │ CPF cujo par de vaga não dá para casar com segurança. NÃO bloqueia, só sinaliza na tela.  │
       * │                                                                                          │
       * │ EM PRODUÇÃO `this.admissoes` está SEMPRE presente (o `AsModule` importa o `AdmissoesModule`│
       * │ ); o guard existe só para o teste que constrói o serviço sem a ponte (ver o construtor).  │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (this.admissoes && ponte) {
        const vivas = await this.admissoes.vivasPorCpf(cpf);
        const possivelDuplicata =
          vivas.length > 0 && (!ponte.idVacancy || vivas.some((v) => !v.idVacancy));
        const { admissaoId } = await this.admissoes.criarPreAdmissaoDoFunil({
          candidato: {
            cpf,
            nome: ponte.candidato.nome,
            email: ponte.candidato.email,
            telefone: ponte.candidato.telefone,
            dataNascimento: ponte.candidato.dataNascimento,
          },
          codCliente: ponte.codCliente,
          cargoId: ponte.cargoId,
          idVacancy: ponte.idVacancy,
          vagaFolha: ponte.vagaFolha,
          possivelDuplicata,
        });
        // A ÚNICA escrita de `as_candidaturas.admissao_id` no sistema: a ponte. Fora da transação da
        // posição de propósito (o comentário acima). §A.6: só o id técnico da admissão.
        await this.db
          .update(asCandidaturas)
          .set({ admissaoId, atualizadoEm: new Date() })
          .where(eq(asCandidaturas.id, candidaturaId));
      }

      /*
       * O LINK DO PORTAL NÃO SAI AQUI. Nesta hora a admissão é pré-admissão em AGUARDANDO_LIBERACAO,
       * farol que a emissão recusa (fica fora do recorte, SEM_ADMISSAO), então ninguém libera acesso
       * ao prontuário de quem ainda não foi liberado. O aviso ao candidato nasce na LIBERAÇÃO
       * (`AdmissoesService.liberar`), quando a admissão já virou EM_ADMISSAO. A escrita de
       * `as_candidaturas.admissao_id` acima é o único elo gravado nesta etapa (§A.6: só o id técnico).
       */
      return this.candidatura(candidaturaId);
    }

    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");

    /*
     * ┌─ QUEM JÁ SAIU NÃO SAI DE NOVO, e esta guarda faltava SÓ NESTE CAMINHO ──────────────────┐
     * │ O CAMINHO TRAVADO já recusa a repetição (`c.situacao === novaSituacao`) e a linha morta   │
     * │ (`exigeCandidaturaViva`), e a `moverEtapa`, a `trocarVaga` e a finalização de posição      │
     * │ perguntam todas por `candidaturaViva`. O desvínculo simples era o único que não perguntava │
     * │ nada: descartar quem já estava descartado passava, SOBRESCREVIA o `motivo_descarte`        │
     * │ anterior e carimbava um segundo desfecho na linha do tempo de um processo encerrado.       │
     * │                                                                                           │
     * │ EM MASSA ISSO DEIXA DE SER TEÓRICO: uma seleção grande costuma trazer junto quem já saiu,  │
     * │ e sem esta recusa o lote apagaria em silêncio o motivo real de cada um deles.              │
     * │                                                                                           │
     * │ A RÉGUA É `candidaturaViva`, a MESMA fonte dos outros caminhos, e AGORA OS DOIS CAMINHOS   │
     * │ DESTE MÉTODO A CONSULTAM: o avanço para a esteira (`ENVIADO_PARA_ADMISSAO`) passou a ligar │
     * │ a mesma exigência no caminho travado (decisão do diretor, Onda B), então não há mais uma   │
     * │ saída que ressuscite linha morta.                                                          │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (!candidaturaViva(c.situacao)) {
      throw new ConflictException(
        "Esta candidatura já foi encerrada e não recebe um segundo desfecho. Para trazer a pessoa de volta, aloque-a de novo na vaga.",
      );
    }

    /*
     * ┌─ DESVINCULAR QUEM ESTÁ ALOCADO É AÇÃO DE MASTER (decisão do diretor, Onda B) ────────────┐
     * │ ALOCADO É ENTREGA: é ele que enche o cilindro da vaga. Desvincular um alocado DESFAZ uma  │
     * │ entrega, e era por aqui que o gate de Master do CANCELAMENTO ficava contornável em dois   │
     * │ passos: o consultor desvinculava os alocados, a vaga deixava de ter gente segurando, e a  │
     * │ trava que só um Master poderia forçar nem chegava a ser consultada.                       │
     * │                                                                                          │
     * │ É O GATE DO CANCELAMENTO, E NÃO O DO FECHAMENTO, e a primeira redação desta caixa dizia   │
     * │ "fechamento", errado. A auditoria mediu o contrário: o fechamento só pede Master quando   │
     * │ `faltam = meta - entregues` é POSITIVO, então desvincular um entregue AUMENTA o que falta │
     * │ e torna o fechamento MAIS difícil, nunca mais fácil. Quem afrouxava era o cancelamento,   │
     * │ cuja trava conta quem SEGURA (`seguraOCancelamento`: ATIVO e ALOCADO), e foi medido ao    │
     * │ vivo: sem esta guarda o COMUM desvinculava os alocados, descartava os ativos (gesto       │
     * │ legítimo dele) e cancelava com ZERO segurando, sem Master nenhum ser consultado.          │
     * │                                                                                          │
     * │ O REGISTRO DO ERRO FICA, e não é zelo: é por raciocínio de comentário que o próximo a     │
     * │ mexer desfaz uma trava. Quem lesse "protege o fechamento" mediria contra o fechamento,    │
     * │ veria que não protege nada, e removeria a guarda com toda a razão aparente do mundo.      │
     * │                                                                                          │
     * │ A AUTORIZAÇÃO MORA AQUI, E NUNCA EM `@Roles` NA ROTA, pelo mesmo argumento já escrito no  │
     * │ `fechar` e no `cancelar` das vagas: TODO CONSULTOR desvincula quem está EM SELEÇÃO, e um  │
     * │ `@Roles("MASTER","SUPER_ADMIN")` no handler barraria o desvínculo normal do COMUM, que é  │
     * │ regressão silenciosa. O que vira de Master é o desvínculo do ALOCADO, e quem sabe a       │
     * │ situação real é o servidor, depois de ler a linha.                                       │
     * │                                                                                          │
     * │ SÓ O ALOCADO, e não todo mundo que `finalizaPosicao`: `ENVIADO_PARA_ADMISSAO` também      │
     * │ entrega, e ele TAMBÉM entrou na trava (decisão do diretor, depois da auditoria medir que  │
     * │ DESCARTAR um enviado destrói o acesso à porta própria de desfazer: depois do descarte, o  │
     * │ `reverterEnvioParaAdmissao` responde "não há envio a reverter" para todo mundo, Master    │
     * │ inclusive). REVERTER continua sendo de QUALQUER consultor, e por construção: aquele é      │
     * │ método próprio, com `update` próprio, que não consulta esta régua nem recebe papel.       │
     * │                                                                                          │
     * │ §A.6: a recusa é frase de PROCESSO. Nenhum nome, nenhum CPF, nada da pessoa, porque no    │
     * │ lote ela volta na lista de falhas e a tela copia aquele relatório inteiro.                │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (desvinculoEhDeMaster(c.situacao) && !this.podeDesvincularEntregue(user)) {
      /*
       * A FRASE NÃO CITA A SITUAÇÃO, e isso é correção de um defeito que a própria régua criou:
       * enquanto a trava era só o `ALOCADO`, dizer "já alocado" era exato. Ao passar a cobrir também
       * o `ENVIADO_PARA_ADMISSAO`, a frase ficou para trás e passou a MENTIR para metade dos casos:
       * "alocado" é uma situação específica, com pill própria na tela, e quem tentasse tirar da vaga
       * alguém que está na esteira leria que a pessoa está "já alocada", conferiria a tela, veria
       * outra coisa, e concluiria que o sistema se confundiu. Em lote dói mais, porque esta frase É
       * a linha do relatório de falhas, repetida uma vez por pessoa.
       *
       * A redação fala do FATO que a trava protege (a posição foi entregue), que é verdade nos dois
       * estados e continua verdade no dia em que um terceiro entregar posição.
       */
      throw new ForbiddenException(
        "Tirar da vaga um candidato cuja posição já foi entregue é ação de Master. Peça o desvínculo a quem tem esse papel.",
      );
    }

    /*
     * A SAÍDA E O DESFECHO NO HISTÓRICO, NA MESMA TRANSAÇÃO. `etapaPara` recebe a etapa em que a
     * pessoa ESTAVA (`c.etapa`), e é isso que faz "descartado na Triagem" existir como frase: depois
     * desta gravação a etapa some da leitura viva da tela (peça P1), e sem o evento o lugar onde a
     * decisão foi tomada se perderia para sempre.
     */
    // OS INSUMOS DA DERIVAÇÃO, ANTES DA TRANSAÇÃO (ver `insumosDaDerivacao`).
    const { regua, etapasDeEntrega } = await this.insumosDaDerivacao();

    await this.db.transaction(async (tx) => {
      await gravarSaidaDaCandidatura(
        tx,
        /*
         * O LADO VAI JUNTO para o evento guardar o RETRATO da origem (`posicao_lado_origem`). Ele
         * não muda nada nesta saída: quem lê o retrato é a reabertura da vaga, e ela só enxerga
         * evento com marcador de cancelamento, que esta saída NÃO tem (o sexto argumento fica no
         * padrão, nulo). Saída registrada por gente não volta em lote.
         */
        { id: candidaturaId, etapa: c.etapa, situacao: c.situacao, posicaoLado: c.posicaoLado },
        dto.situacao,
        texto(dto.motivo),
        porId,
        null,
        /*
         * ─ A PRETENSÃO SALARIAL (ponto 9), NA MESMA TRANSAÇÃO DO DESFECHO ──────────────────────
         *
         * ELA SÓ CHEGA AQUI DEPOIS DE `exigirPretensaoQuandoOMotivoPede` TER PASSADO, e a régua já
         * garantiu as duas metades: o valor existe quando o motivo o pede, e NÃO existe quando ele
         * não pede. Por isso aqui não há nenhum `if`: o que vier está certo por construção.
         *
         * NA MESMA TRANSAÇÃO, e não num `update` depois: o valor só faz sentido ao lado do motivo
         * que o pediu, e gravá-los em dois tempos admitiria o desfecho gravado com a pretensão
         * perdida, que é a metade do fato que explica a outra.
         *
         * ESTE CAMINHO É O ÚNICO QUE A ESCREVE, e a prova é o recorte: a pretensão só é aceita no
         * DESCARTE (`SITUACOES_COM_MOTIVO_DE_CATALOGO`), o descarte NÃO ocupa posição
         * (`ocupaPosicao` é falso para ele), e por isso ele nunca passa pelo caminho travado. O
         * outro chamador de `gravarSaidaDaCandidatura` (o cancelamento da vaga) não passa o
         * parâmetro, então não toca a coluna.
         */
        dto.pretensaoSalarial ?? undefined,
      );

      /*
       * O STATUS DA VAGA ACOMPANHA (Frente B, ponto 2). Descartar ou registrar a desistência do
       * ÚLTIMO candidato que estava com o cliente tira a vaga de ENTREGUE e a devolve para ABERTA,
       * que é exatamente o que o time precisa ver: voltou a ser vaga a preencher.
       *
       * AQUI A VAGA AINDA NÃO ESTAVA TRAVADA (este é o caminho SIMPLES, que não conta posição de
       * propósito), então é a própria rotina que adquire o lock. Ela não conta nada: pergunta
       * presença e grava, e a saída já foi gravada acima, na mesma transação.
       */
      if (movimentoPodeMudarAEntrega([c.etapa], etapasDeEntrega)) {
        await derivarStatusDaVaga(tx, c.vagaId, regua, etapasDeEntrega, porId);
      }
    });

    return this.candidatura(candidaturaId);
  }

  /**
   * ─ REVERTER O ENVIO PARA A ADMISSÃO: desfazer o erro recente, rápido ────────────────────────────
   *
   * DE QUALQUER CONSULTOR, sem `@Roles` (decisão do diretor), e o motivo é operacional: mandar a
   * pessoa errada para a esteira é erro de clique, e erro de clique tem de ser desfeito por quem o
   * cometeu, no minuto seguinte. Exigir um Master transformaria trinta segundos numa espera, e a
   * espera é onde a pessoa errada segue ocupando posição de uma vaga que precisa dela.
   *
   * ┌─ ELA VAI PELO CAMINHO SIMPLES, E NÃO PELO TRAVADO, e a escolha tem TRÊS razões ─────────────┐
   * │ 1. NÃO HÁ O QUE TRAVAR. O caminho travado existe para responder "ainda cabe mais um?" com a  │
   * │    linha da vaga segurada (trava 4). A reversão LIBERA posição: ela não tem como fazer a     │
   * │    vaga estourar, e não há corrida entre dois consultores a serializar, porque a soma que    │
   * │    dois deles produziriam continua sendo menos ocupação, nunca mais.                         │
   * │                                                                                             │
   * │ 2. A TRAVA 7 RECUSARIA, E ELA ESTÁ CERTA. `ENVIADO_PARA_ADMISSAO` finaliza posição e `ATIVO` │
   * │    não, que é LETRA POR LETRA a condição de recusa dela. A trava não foi afrouxada, contornada│
   * │    por parâmetro nem consultada de outro jeito: ela segue incondicional no caminho em que    │
   * │    mora, e o teste que a afirma continua verde.                                              │
   * │                                                                                             │
   * │ 3. É A PORTA QUE A PRÓPRIA TRAVA MANDA USAR. A frase dela diz "se a pessoa saiu do processo, │
   * │    registre a saída dela", e o desvínculo (que também desfaz uma entrega, de um ALOCADO) já  │
   * │    passa por aqui, pelo caminho simples, com teste próprio afirmando que ele NÃO trava a     │
   * │    linha da vaga. A reversão é o mesmo formato: verbo EXPLÍCITO, alvo ESTREITO e rastro,     │
   * │    e não efeito colateral de um verbo que queria dizer outra coisa, que é o que a trava 7    │
   * │    existe para impedir.                                                                      │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O ALVO É ESTREITO: só `ENVIADO_PARA_ADMISSAO` (`podeReverterEnvio`). Aceitar de qualquer
   * situação faria desta rota uma segunda porta para desfazer alocação e aprovação, sem motivo, sem
   * ciência e sem passar por lugar nenhum que conte posição, que é exatamente a porta que a trava 7
   * fechou.
   *
   * A POSIÇÃO LIBERA SOZINHA, e nada a mais é escrito para isso: a ocupação é sempre DERIVADA da
   * situação (`consomePosicao`), nunca guardada. O `posicao_lado` gravado na linha NÃO é limpo, de
   * propósito e pela mesma razão do desvínculo: quem segura posição é a situação, e o lado que
   * sobra é a memória de onde a pessoa estava, útil no dia em que ela for enviada de novo.
   *
   * §A.6: o evento leva QUEM (`por_id`), QUANDO (`ocorrido_em`, do banco) e a ETAPA em que a pessoa
   * volta a ficar. Nada de CPF, nada de nome, nada de URL.
   */
  async reverterEnvioParaAdmissao(candidaturaId: string, porId: string): Promise<AsCandidaturaItem> {
    /*
     * A ADMISSÃO LIGADA À CANDIDATURA, LIDA DENTRO DA TRANSAÇÃO e usada DEPOIS dela. Lê-la de novo
     * lá fora responderia sobre um instante posterior ao da reversão, e a linha pode ter andado.
     */
    let admissaoDoEnvio: string | null = null;

    /*
     * A LEITURA QUE DECIDE MORA DENTRO DA TRANSAÇÃO, junto da gravação que ela autoriza. É o que o
     * caminho travado já faz, e custa a mesma ida ao banco: decidir fora e gravar dentro responde
     * sobre um instante anterior ao da escrita.
     *
     * SEM `FOR UPDATE` na linha da candidatura, e isso é deliberado: duas reversões simultâneas da
     * MESMA candidatura escrevem o mesmo `ATIVO` (a segunda é ineficaz, não destrutiva) e não há
     * contagem a furar, porque a ocupação é derivada. O lock existiria para evitar um segundo
     * registro na trilha, e uma trilha com um evento repetido é preferível a um padrão de lock novo
     * neste arquivo, que ninguém mais usa nesta camada.
     */
    await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");

      /*
       * A RECUSA DIZ O QUE ACONTECEU E O QUE FAZER, porque quem a lê está no meio de uma correção:
       * a tela pode estar desatualizada (outra pessoa já reverteu) ou o consultor pode ter clicado
       * na linha errada. "Operação inválida" mandaria ele adivinhar qual dos dois.
       */
      if (!podeReverterEnvio(c.situacao)) throw new ConflictException(NAO_HA_ENVIO_A_REVERTER);

      /*
       * A ETAPA NÃO ENTRA NESTE `set`, e é a garantia central da operação: a pessoa volta para a
       * ÚLTIMA ETAPA em que estava porque essa etapa nunca saiu da linha. Ver o bloco da régua em
       * `domain/candidatura.ts`.
       *
       * ┌─ O `motivo_descarte` É LIMPO, e isto COMPLETA a reversão em vez de acrescentar a ela ───┐
       * │ O CAMPO É O MOTIVO DAQUELE DESFECHO. Desfeito o desfecho, o motivo PERDEU O REFERENTE:  │
       * │ a linha volta VIVA carregando a justificativa de um envio que não existe mais, e o campo│
       * │ é exposto no `AsCandidaturaItem`. Toda tela que o leia passa a mostrar a explicação de  │
       * │ um fato desfeito, sem erro e sem aviso, com cara de informação boa.                     │
       * │                                                                                        │
       * │ É A MESMA INCOERÊNCIA que a guarda do desvínculo já recusa uma linha acima (descartar   │
       * │ quem já estava descartado SOBRESCREVIA o motivo original): o campo tem de descrever o   │
       * │ ESTADO ATUAL da linha, e não um estado anterior.                                        │
       * │                                                                                        │
       * │ NENHUMA TRILHA SE PERDE, e é isso que torna a limpeza segura: o evento do envio, com o  │
       * │ motivo, a etapa e o autor, continua em `as_candidatura_etapas`, intocado. O que sai da  │
       * │ linha viva é a CÓPIA mutável; a memória do fato fica no histórico, que é onde ela mora. │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      /*
       * ┌─ A SITUAÇÃO ENTRA NO `where`, e é ela que faz a leitura valer no instante da ESCRITA ───┐
       * │ SEM ELA, o `update` filtra só por `id` e NÃO RELÊ a situação. Uma reversão concorrente  │
       * │ com a `finalizarPosicao` ou a `aprovar` da MESMA candidatura termina com a linha em     │
       * │ `ALOCADO` e um evento "voltou para a seleção" no histórico, ou o inverso.               │
       * │                                                                                        │
       * │ NÃO É FURO DE TRAVA, e a distinção importa: a reversão só SUBTRAI ocupação, então       │
       * │ nenhuma ordem de execução infla contagem nenhuma. O que fica errado é a TRILHA          │
       * │ CONTRADIZENDO A LINHA, e trilha que contradiz o estado é pior do que trilha ausente,    │
       * │ porque quem a consulta para de conferir.                                                │
       * │                                                                                        │
       * │ É A GUARDA DE CIMA, ESCRITA DE NOVO NO LUGAR ONDE ELA DECIDE. A de cima serve para dar  │
       * │ a frase certa a quem clicou; esta é a que vale contra a corrida, porque o banco a       │
       * │ avalia no mesmo instante em que grava. Uma não substitui a outra.                        │
       * │                                                                                        │
       * │ MESMO PADRÃO DO VÍNCULO DA SALA DE ESPERA (`sala-espera.service.ts`), e sem lock novo:  │
       * │ um `FOR UPDATE` aqui seria um padrão que nenhum outro ponto desta camada usa, para      │
       * │ resolver o que uma cláusula do `where` já resolve.                                       │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const [revertida] = await tx
        .update(asCandidaturas)
        .set({
          situacao: SITUACAO_APOS_REVERTER_ENVIO,
          motivoDescarte: null,
          /*
           * ┌─ A MARCA DA POSIÇÃO É LIMPA AQUI TAMBÉM (conserto 2, Onda B) ────────────────────┐
           * │ ESTA LINHA FALTAVA, e o dano foi MEDIDO em produção de homologação, não deduzido:  │
           * │ quem estava no BANCO, teve o envio revertido e voltou para a seleção, CARREGAVA a  │
           * │ marca antiga. A aprovação seguinte lê a marca herdada e mede a pessoa contra a     │
           * │ META DE BANCO: numa vaga com 4 posições OFICIAIS livres e o banco cheio, a         │
           * │ aprovação era recusada com "as 3 posições de banco já estão preenchidas". Erro     │
           * │ incompreensível para quem operou, porque a vaga tinha lugar sobrando.              │
           * │                                                                                    │
           * │ O INVARIANTE É UM SÓ, E AGORA VALE NAS DUAS PORTAS: quem está EM SELEÇÃO NÃO       │
           * │ CARREGA MARCA DE POSIÇÃO. O `restaurar-candidatura` já o cumpria desde o conserto  │
           * │ C; esta era a outra porta que devolve alguém para a seleção, e ela o violava.      │
           * │ Invariante cumprido por uma porta só é invariante que a outra desmente.            │
           * │                                                                                    │
           * │ E NÃO SE PERDE MEMÓRIA NENHUMA: o lado que a pessoa ocupava está gravado no EVENTO │
           * │ da entrega, em `as_candidatura_etapas`, que é onde o histórico mora. O que some é   │
           * │ só o campo do ESTADO ATUAL, e o estado atual é "em seleção, sem posição", que é a  │
           * │ verdade. O argumento antigo de "apagar também seria escolha" valia enquanto ele    │
           * │ não tinha consequência medida; agora tem.                                          │
           * └────────────────────────────────────────────────────────────────────────────────────┘
           */
          posicaoLado: null,
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(asCandidaturas.id, candidaturaId),
            eq(asCandidaturas.situacao, SITUACAO_QUE_A_REVERSAO_DESFAZ),
          ),
        )
        .returning({ id: asCandidaturas.id });

      /*
       * NÃO AFETOU LINHA NENHUMA: alguém mudou a situação entre a leitura e a escrita. A saída é
       * RECUSAR, e não tratar como no-op, por duas razões:
       *
       *   1. É A MESMA RÉGUA DA GUARDA DE CIMA, e a mesma régua tem de dar a mesma resposta. Uma
       *      recusa quando a leitura pega a mudança e um silêncio quando a escrita pega a MESMA
       *      mudança seria a régua respondendo duas coisas dependendo do relógio.
       *   2. NO-OP DEVOLVERIA 200 com a candidatura ainda enviada, e a tela diria "revertido" sobre
       *      um envio que continua de pé. Quem clicou em desfazer merece saber que não desfez.
       *
       * O `throw` DESFAZ A TRANSAÇÃO INTEIRA, e é isso que impede o evento órfão: nenhum registro
       * de "voltou para a seleção" sobrevive a uma reversão que não aconteceu.
       */
      if (!revertida) throw new ConflictException(NAO_HA_ENVIO_A_REVERTER);

      /*
       * O RASTRO, na MESMA transação: ou a reversão e o registro dela existem os dois, ou não existe
       * nenhum dos dois. Uma reversão sem evento seria uma pessoa que voltou do envio sem que
       * ninguém conseguisse dizer quem a trouxe de volta, e o envio dela continuaria no histórico
       * como o último fato conhecido.
       *
       * `etapaPara` RECEBE A ETAPA ATUAL, que é a etapa em que a pessoa VOLTA A FICAR (é a mesma
       * coisa, e é por isso que ela não precisou ser buscada em lugar nenhum). `situacao` recebe
       * `ATIVO`, que é o que faz este evento se ler como "voltou para a seleção" e não como um
       * movimento de funil.
       */
      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: null,
        etapaPara: c.etapa,
        situacao: SITUACAO_APOS_REVERTER_ENVIO,
        motivo: null,
        porId,
      });

      admissaoDoEnvio = c.admissaoId ?? null;
    });

    /*
     * ┌─ DESFEZ O ENVIO, O LINK MORRE JUNTO (decisão 4 do diretor nesta frente) ─────────────────┐
     * │ A pessoa VOLTOU PARA A SELEÇÃO. Deixar vivo o link que o envio gerou manteria o           │
     * │ prontuário dela aberto para coleta de documento de uma admissão que não está mais            │
     * │ acontecendo, e o candidato continuaria recebendo tela de "envie seus documentos" depois de │
     * │ o processo ter sido desfeito. Pior: o próximo envio EMITIRIA outro link, e o primeiro       │
     * │ continuaria valendo por até 72 horas, porque só a emissão da MESMA admissão revoga.         │
     * │                                                                                            │
     * │ ESTE CAMINHO NÃO PASSA POR `registrarSaida`: `reverterEnvioParaAdmissao` é `update`         │
     * │ próprio, e foi por isso que a auditoria o apontou em separado. Sem esta chamada, a          │
     * │ revogação valeria só pela porta que ninguém usa para desfazer.                              │
     * │                                                                                            │
     * │ FORA DA TRANSAÇÃO, E DEPOIS DELA, de propósito: a reversão é o fato e não pode ser         │
     * │ desfeita por uma falha ao revogar o link (mesma assimetria do gancho do envio). E a         │
     * │ revogação escreve em OUTRA tabela, por outro serviço, com o handle de conexão dele: metê-la │
     * │ dentro desta transação exigiria passar a `tx` para fora do módulo, que é o começo de o      │
     * │ A&S segurar lock em tabela da Admissão.                                                     │
     * │                                                                                            │
     * │ CÓDIGO PRÓPRIO NA TRILHA (`ENVIO_REVERTIDO`): não foi revogação manual (ninguém clicou em  │
     * │ revogar link) nem substituição (nenhum link novo nasceu). Contá-la como manual inflaria o  │
     * │ número que a Sala De Segurança lê como incidente.                                           │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * IDEMPOTENTE DE GRAÇA: `revogarLinksDaAdmissao` só toca link ainda não revogado, então
     * reverter duas vezes não move carimbo nem grava evento repetido. Sem admissão ligada (o caso
     * de hoje, enquanto a ponte não existe) não há o que revogar e nada é feito.
     */
    if (admissaoDoEnvio) {
      try {
        await this.envioDoPortal.revogarLinksDaReversao(admissaoDoEnvio, porId);
      } catch (erro) {
        // §A.6: só o nome da classe do erro. A reversão já aconteceu e não volta atrás.
        this.log.error(`falha ao revogar o link do portal apos reverter o envio: ${(erro as Error).name}`);
      }
    }

    return this.candidatura(candidaturaId);
  }

  // ── AS AÇÕES EM MASSA ─────────────────────────────────────────────────────

  /**
   * ─ AS QUATRO AÇÕES EM MASSA, e a regra que vale para todas: LOTE PARCIAL ───────────────────────
   *
   * ┌─ ELAS NÃO IMPLEMENTAM NADA. Elas CHAMAM as ações individuais, uma por vez ─────────────────┐
   * │ NENHUM DOS QUATRO MÉTODOS MONTA `update`, conta ocupação ou abre transação. Cada linha       │
   * │ passa pelo MESMO método que a tela individual chama, com as MESMAS travas, e é isso que faz  │
   * │ a recusa que o consultor lê no relatório do lote ser letra por letra a mesma da ação de uma  │
   * │ pessoa só. Um `update ... where id in (...)` seria rápido, elegante, e faria a vaga de 5     │
   * │ aceitar 30: quem serializa a disputa é a LINHA DA VAGA travada dentro de cada transação, e   │
   * │ ela só serializa quem passa por ela.                                                         │
   * │                                                                                             │
   * │ O LAÇO É SEQUENCIAL (`for...of` com `await`), e isso é requisito de SEGURANÇA, não estilo:   │
   * │ o pool tem `max = 10` (`db/client.ts`), então trinta transações concorrentes disputando a    │
   * │ MESMA linha de vaga é starvation de pool com locks segurados. O sintoma não seria o lote     │
   * │ falhar: seria o backend inteiro parar. `Promise.all` e `map` assíncrono estão proibidos aqui.│
   * │                                                                                             │
   * │ UMA TRANSAÇÃO POR LINHA, e NÃO uma para o lote: transação única seguraria o lock da vaga     │
   * │ durante o lote inteiro (nenhum outro consultor entraria naquela vaga) e mataria o lote        │
   * │ parcial, porque o erro da linha 17 desfaria as 16 que já tinham dado certo.                  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NÃO EXISTE PRÉ-CONFERÊNCIA de "cabe todo mundo?" (decisão do diretor). Qualquer contagem feita
   * antes do laço roda FORA da trava e responde sobre um instante que já passou: outro consultor pode
   * ocupar a última posição entre a conta e a gravação. A verdade é o RESULTADO do lote.
   *
   * ADICIONAR E FINALIZAR POSIÇÃO SÃO DOIS VERBOS (decisão do diretor), e a diferença é a meta da
   * vaga: adicionar traz para o funil e NÃO consome posição; finalizar ENTREGA a posição.
   */

  /**
   * ADICIONAR CANDIDATOS À VAGA EM MASSA. Cada linha é uma `alocar`, com as travas dela.
   *
   * A VAGA É CONFERIDA UMA VEZ, ANTES DO LAÇO, e ela é a ÚNICA coisa conferida antes: vaga encerrada
   * é um problema DA VAGA, não das linhas, e devolver trinta falhas idênticas dizendo a mesma coisa
   * não é resultado, é ruído. O pedido inteiro é recusado, e nada é gravado.
   *
   * ISSO NÃO É A PRÉ-CONFERÊNCIA PROIBIDA: o que não se pode antecipar é a OCUPAÇÃO (que muda a cada
   * linha e só é verdade sob a trava). O status da vaga continua sendo conferido POR LINHA também,
   * dentro da `alocar`, então uma vaga fechada no meio do lote para de receber na linha seguinte.
   */
  async adicionarEmLote(
    vagaId: string,
    dto: AdicionarEmLoteDto,
    user: AuthUser,
  ): Promise<AsResultadoEmMassa> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    // ESTA CONFERÊNCIA CONTINUA SENDO A DE UX, e não substitui a de dentro da `alocar`: ela recusa o
    // lote inteiro por um problema DA VAGA, para o consultor não receber trinta falhas idênticas.
    // A régua travada continua rodando por linha, lá dentro.
    const regua = await this.statusVaga.regua();
    if (!regua.recebeCandidato(vaga.status)) {
      throw new ConflictException("Esta vaga está Fechada e não recebe candidato novo.");
    }

    // O ALVO DA FALHA AQUI É O CANDIDATO, e não a candidatura: quando a linha falha, a candidatura
    // ainda não existe. É por isso que o campo do contrato se chama `alvoId` e não `candidaturaId`.
    return this.emLote(dto.candidatoIds, (candidatoId) =>
      this.alocar(candidatoId, { vagaId, cienteReentrada: dto.cienteReentrada }, user.id),
    );
  }

  /**
   * FINALIZAR POSIÇÃO EM MASSA: N posições ENTREGUES, uma transação travada por linha.
   *
   * É AQUI QUE A META DA VAGA É CONSUMIDA, e é por isso que este é o método em que o laço sequencial
   * importa mais: a linha 6 de um lote de 30 numa vaga de 5 só sabe que não cabe porque as 5
   * anteriores JÁ GRAVARAM. Contar antes do laço responderia "cabem 5" trinta vezes.
   *
   * A VAGA DO CORPO, QUANDO VEM, é conferida duas vezes e por motivos diferentes: uma vez ANTES do
   * laço (vaga encerrada recusa o lote inteiro, um problema só) e uma vez POR LINHA (a candidatura
   * que não pertence àquela vaga é uma seleção misturada, e a linha é recusada sozinha). Sem o campo,
   * a vaga de cada linha continua saindo da própria candidatura, sob a trava, como na ação individual.
   */
  async finalizarPosicaoEmLote(
    dto: FinalizarPosicaoEmLoteDto,
    porId: string,
  ): Promise<AsResultadoEmMassa> {
    const daVaga = dto.vagaId;
    if (daVaga) {
      // A MESMA PRÉ-CONFERÊNCIA DE UX do lote de alocação: recusa o lote inteiro por um problema DA
      // VAGA. A conferência que vale continua sendo a de dentro de `mudarSituacaoOcupandoPosicao`,
      // sob a linha travada, e ela roda por linha.
      const regua = await this.statusVaga.regua();
      const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, daVaga) });
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");
      if (!regua.recebeCandidato(vaga.status)) {
        throw new ConflictException(
          "Esta vaga já foi encerrada e não recebe posição nova. Recarregue a página para ver o estado atual da vaga.",
        );
      }
    }

    return this.emLote(dto.candidaturaIds, async (candidaturaId) => {
      if (daVaga) await this.confirmarQueEDaVaga(candidaturaId, daVaga);
      await this.finalizarPosicao(
        candidaturaId,
        {
          lado: dto.lado,
          cienteBancoComOficiaisAbertas: dto.cienteBancoComOficiaisAbertas,
        },
        porId,
      );
    });
  }

  /**
   * DESVINCULAR EM MASSA, e ENVIAR PARA ADMISSÃO em massa: as duas são a mesma `registrarSaida`.
   *
   * O MOTIVO É UM SÓ PARA A SELEÇÃO e é gravado em CADA linha, porque é o desfecho comum que originou
   * o lote. Obrigatório no corpo (§ do ajuste 7): trinta desfechos sem explicação de uma vez só é
   * exatamente o buraco que a exigência no DTO existe para não abrir.
   *
   * `ENVIADO_PARA_ADMISSAO` CONSOME POSIÇÃO e vai pelo caminho travado, linha a linha, como no
   * individual: quem escolhe a porta é a régua (`ocupaPosicao`), não o nome da situação.
   */
  async registrarSaidaEmLote(
    dto: RegistrarSaidaEmLoteDto,
    user: AuthUser,
  ): Promise<AsResultadoEmMassa> {
    /*
     * ─ O LOTE NÃO ACEITA MOTIVO QUE PEDE PRETENSÃO SALARIAL (decisão 5, escolha do coordenador) ─
     *
     * ┌─ O QUE ACONTECIA ANTES, E POR QUE "deixar falhar" NÃO ERA UMA SAÍDA ────────────────────┐
     * │ O corpo do lote NÃO tem campo de pretensão, e a régua individual exige o valor quando o  │
     * │ motivo o pede. Resultado: escolher um motivo marcado `pedePretensao` fazia TODAS as       │
     * │ trinta linhas falharem, uma a uma, com a mesma frase, depois de trinta transações abertas │
     * │ à toa. O consultor recebia um relatório de trinta erros idênticos e nenhuma pista do que  │
     * │ fazer.                                                                                    │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * ┌─ E A OUTRA SAÍDA POSSÍVEL SERIA PIOR: PERGUNTAR O VALOR UMA VEZ E APLICAR A N PESSOAS ───┐
     * │ PRETENSÃO SALARIAL É VALOR INDIVIDUAL. Um número perguntado uma vez e gravado em trinta  │
     * │ linhas seria dado financeiro FALSO em vinte e nove pessoas, dentro do campo que existe    │
     * │ justamente para explicar o desfecho de cada uma. Gravar mentira é pior do que recusar, e  │
     * │ §A.6 (minimização) empurra para o mesmo lado: não se coleta por lote o que é de um só.    │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * A RECUSA É DO LOTE INTEIRO E VEM ANTES DE QUALQUER LINHA, e isso é coerente com a régua da
     * casa: o lote PARCIAL existe para o problema que é DE UMA LINHA (esta pessoa está alocada,
     * aquela já saiu). Este problema é DA SELEÇÃO, igual ao da vaga encerrada no lote de alocação,
     * e problema de seleção derruba a seleção, com uma frase só e nada gravado.
     *
     * O RECORTE É O MESMO DA RÉGUA INDIVIDUAL (`motivoVemDoCatalogo`), e não uma segunda lista:
     * `ENVIADO_PARA_ADMISSAO` fica de fora porque ali o campo pede PROSA, e conferi-lo contra o
     * catálogo derrubaria a ponte A&S para Admissão, que é código validado.
     *
     * §A.6: a frase fala do MOTIVO e do gesto, e nunca de candidato nenhum.
     */
    if (motivoVemDoCatalogo(dto.situacao)) {
      const ativos = await motivosDeDescarteAtivos(this.db);
      const escolhido = ativos.find((m) => m.nome === dto.motivo);
      if (escolhido?.pedePretensao === true) {
        throw new BadRequestException(
          "Este motivo pede a pretensão salarial, e a pretensão salarial é de cada pessoa. Por isso ele só pode ser usado no desvínculo individual: desvincule uma pessoa por vez informando o valor de cada uma, ou escolha outro motivo para o lote.",
        );
      }
    }

    /*
     * O USUÁRIO INTEIRO DESCE PARA CADA LINHA, e não só o id dele, porque a trava do desvínculo de
     * ALOCADO lê o PAPEL. O lote NÃO reconfere nada por conta própria: ele chama a MESMA
     * `registrarSaida` da ação individual, com a MESMA trava, e é isso que faz a recusa do relatório
     * ser letra por letra a mesma da tela de uma pessoa só.
     *
     * A RECUSA É FALHA DA LINHA, e nunca do lote: um COMUM que selecionou trinta pessoas, das quais
     * três estão alocadas, desvincula as vinte e sete e recebe as três de volta em `falhas`, com a
     * frase de processo. Derrubar o lote inteiro por causa delas jogaria fora o trabalho que já
     * estava certo, que é justamente o que o lote parcial existe para não fazer.
     */
    return this.emLote(dto.candidaturaIds, (candidaturaId) =>
      this.registrarSaida(candidaturaId, { situacao: dto.situacao, motivo: dto.motivo }, user),
    );
  }

  /**
   * MOVER NO FUNIL EM MASSA, e SÓ isto: `moverEtapa`, N vezes. A troca de vaga tem lote PRÓPRIO
   * (`trocarVagaEmLote`, logo abaixo), porque o destino dela é uma vaga e não uma etapa.
   *
   * ┌─ ESTA CAIXA DIZIA QUE A TROCA DE VAGA NUNCA TERIA LOTE. O DIRETOR DECIDIU O CONTRÁRIO ─────┐
   * │ OST de 30/09/2026, em palavras dele: "todas as ações que existem no modal ganham versão em │
   * │ massa, não deixem nenhuma só individual".                                                  │
   * │                                                                                            │
   * │ O FATO TÉCNICO QUE ESTAVA ESCRITO AQUI CONTINUA VERDADEIRO, e é por isso que ele não foi   │
   * │ apagado e sim RESPONDIDO em `trocarVagaEmLote`: a troca trava a linha da vaga de DESTINO e  │
   * │ confere o TETO dela dentro da transação, então o teto se esgota NO MEIO do lote e só metade │
   * │ da seleção entra. O que mudou é que isso é RESULTADO RELATADO por linha, e não acidente.    │
   * │                                                                                            │
   * │ DEIXAR A FRASE VELHA SERIA PIOR QUE APAGÁ-LA: a próxima sessão a leria como decisão viva e  │
   * │ tiraria o lote da troca por coerência com um comentário.                                   │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  moverEtapaEmLote(dto: MoverEtapaEmLoteDto, porId: string): Promise<AsResultadoEmMassa> {
    return this.emLote(dto.candidaturaIds, (candidaturaId) =>
      this.moverEtapa(candidaturaId, { etapa: dto.etapa }, porId),
    );
  }

  /**
   * ─ TROCAR A VAGA EM MASSA (item 1 da OST de 30/09/2026): `trocarVaga`, N vezes ────────────────
   *
   * ┌─ ELA NASCE CONTRARIANDO UMA DECISÃO ESCRITA, E ISSO PRECISA FICAR DITO ────────────────────┐
   * │ O `moverEtapaEmLote`, a controller e o DTO diziam, em caixa, que a troca de vaga NÃO teria  │
   * │ versão em massa, e o argumento era técnico e correto: o teto da vaga de DESTINO se esgota   │
   * │ NO MEIO do lote, então a seleção de trinta entra até a vaga encher e o resto não entra.     │
   * │                                                                                            │
   * │ O DIRETOR DECIDIU QUE TODAS AS AÇÕES DO MODAL GANHAM LOTE (OST de 30/09), e o argumento     │
   * │ técnico virou o RELATÓRIO em vez de virar proibição: quem não entrou volta em `falhas`, com │
   * │ a frase do teto, LINHA POR LINHA. "Metade movida" deixa de ser surpresa e passa a ser a     │
   * │ resposta na tela, que é exatamente o que a exigência do lote parcial pede.                  │
   * │                                                                                            │
   * │ O QUE NÃO MUDOU, e é o que segura a operação: nenhuma régua foi reescrita aqui. Cada linha  │
   * │ é uma `trocarVaga`, com a linha da vaga de destino TRAVADA e o teto contado DENTRO da       │
   * │ transação daquela linha. Uma pré-contagem de "cabem todos?" antes do laço responderia sobre │
   * │ um instante que já passou, e é o mesmo motivo pelo qual `finalizarPosicaoEmLote` não a tem. │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A PRÉ-CONFERÊNCIA DA VAGA DE DESTINO É DE UX, e é a MESMA das outras duas em massa: vaga que não
   * recebe candidato é problema DA VAGA, não das linhas, e devolver trinta falhas idênticas dizendo a
   * mesma coisa não é relatório, é ruído. O pedido inteiro é recusado e NADA é gravado. Ela não
   * substitui a trava de dentro da `trocarVaga`, que continua conferindo o status POR LINHA, sob a
   * linha travada: uma vaga fechada no meio do lote para de receber na linha seguinte.
   *
   * §A.6: as falhas voltam por ID de candidatura, com motivo de PROCESSO, pelo `motivoDaFalha` que
   * todos os lotes deste service compartilham. Nenhum nome, nenhum CPF, nenhum texto sobre a pessoa.
   */
  async trocarVagaEmLote(dto: TrocarVagaEmLoteDto, porId: string): Promise<AsResultadoEmMassa> {
    const regua = await this.statusVaga.regua();
    const destino = await this.db.query.vagas.findFirst({ where: eq(vagas.id, dto.vagaId) });
    if (!destino) throw new NotFoundException("Vaga de destino não encontrada.");
    if (!regua.recebeCandidato(destino.status)) {
      throw new ConflictException(
        "Esta vaga não recebe candidato: ela está encerrada. Escolha uma vaga aberta.",
      );
    }

    return this.emLote(dto.candidaturaIds, (candidaturaId) =>
      this.trocarVaga(candidaturaId, { vagaId: dto.vagaId, motivo: dto.motivo }, porId),
    );
  }

  /**
   * O LAÇO, EM UM LUGAR SÓ: sequencial, com `try/catch` POR LINHA.
   *
   * `aplicadas` CONTA O QUE FOI EFETIVADO, e não o que foi tentado: ele só sobe depois de a ação
   * individual voltar sem lançar, que é depois de a transação daquela linha ter fechado.
   *
   * O ERRO DE UMA LINHA NÃO ABORTA O LOTE (decisão 1 do diretor): a linha volta em `falhas` com o
   * motivo, e as demais SEGUEM. A linha ruim costuma estar no MEIO da seleção, e uma implementação
   * que abortasse no primeiro erro faria o consultor descobrir, depois de selecionar trinta pessoas,
   * que nada foi feito.
   */
  private async emLote(
    alvos: readonly string[],
    acao: (alvoId: string) => Promise<unknown>,
  ): Promise<AsResultadoEmMassa> {
    const falhas: AsFalhaEmMassa[] = [];
    let aplicadas = 0;

    // `for...of` COM `await`: uma linha por vez, de propósito (ver o cabeçalho da seção).
    for (const alvoId of alvos) {
      try {
        await acao(alvoId);
        aplicadas += 1;
      } catch (err) {
        falhas.push({ alvoId, motivo: this.motivoDaFalha(err) });
      }
    }

    return { aplicadas, falhas };
  }

  /**
   * ─ O MOTIVO QUE VOLTA NA FALHA, E O QUE ELE NUNCA PODE CARREGAR (§A.6) ────────────────────────
   *
   * ┌─ ESTE É O RISCO QUE SÓ EXISTE NO LOTE ─────────────────────────────────────────────────────┐
   * │ NA AÇÃO INDIVIDUAL, a recusa de reentrada é uma resposta de erro sobre UMA pessoa que o     │
   * │ consultor acabou de escolher, e ela traz o motivo do descarte anterior de propósito, porque │
   * │ é com ele na frente que a decisão se toma. EM MASSA, a MESMA frase repetida trinta vezes é  │
   * │ um RELATÓRIO DE DADO PESSOAL indo para o toast, para a área de transferência e para o log   │
   * │ de qualquer cliente HTTP no caminho. A falha carrega o ID e um motivo de PROCESSO, e nada    │
   * │ mais: sem CPF, sem nome, sem o texto livre que alguém escreveu sobre outra pessoa.          │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A FRASE DA TRAVA É APROVEITADA INTEIRA nos demais casos, e isso é deliberado: as travas de
   * ocupação distinguem meta ausente, banco zerado e banco cheio, e reescrever isso aqui criaria uma
   * segunda régua para dizer a mesma coisa, que é como as duas passam a divergir.
   *
   * O QUE NÃO É `HttpException` VIRA FRASE GENÉRICA, e essa é a segunda metade da guarda: erro cru de
   * banco traz o VALOR que violou a restrição (o CPF, no índice de candidato) no texto, e repassá-lo
   * publicaria o número dentro de um relatório que a tela copia inteiro.
   */
  private motivoDaFalha(err: unknown): string {
    if (!(err instanceof HttpException)) {
      return "Não foi possível concluir esta linha. Tente de novo.";
    }

    const corpo = err.getResponse();
    const razao =
      typeof corpo === "object" && corpo !== null
        ? (corpo as { reason?: string }).reason
        : undefined;

    /*
     * A ÚNICA RECUSA DO MÓDULO QUE MONTA A FRASE COM TEXTO LIVRE DE ALGUÉM. Ela é reconhecida pelo
     * `reason` do corpo, e não pelo texto da mensagem: o corpo é contrato (`AsReentradaPrecisaCiencia`),
     * a frase é redação, e casar por frase quebraria em silêncio na primeira vírgula reescrita.
     */
    if (razao === "reentradaAposEncerramento") {
      return "Esta pessoa já esteve nesta vaga e o processo anterior foi encerrado. Confirme a ciência da reentrada para trazê-la de volta.";
    }

    return err.message;
  }

  /*
   * ─ AS ACOES EM MASSA POR FILTRO, SEM TETO (decisao do diretor, 07/10/2026) ──────────────────────
   *
   * ┌─ POR QUE O SERVIDOR RESOLVE O CONJUNTO, E DEPOIS USA O MESMO `emLote` ─────────────────────┐
   * │ O diretor quer agir sobre TODOS do filtro, sem o teto de 200. Entao a tela manda o FILTRO,  │
   * │ nao a lista, e estes metodos resolvem os ids (do conjunto INTEIRO) e os entregam ao MESMO    │
   * │ `emLote` das acoes com lista: UMA TRANSACAO POR LINHA, sequencial. Isso NAO burla o teto: o   │
   * │ teto era barreira de PAYLOAD (lista gigante no corpo), e aqui o corpo e so o filtro. A         │
   * │ seguranca do lote continua inteira porque o `emLote` nao mudou, e e ele quem a garante (pool  │
   * │ `max=10`, lock da vaga serializado linha a linha). Processar "500 por transacao" seria MENOS   │
   * │ seguro que a transacao-por-linha que ja existe: uma transacao de 500 seguraria o lock da vaga  │
   * │ o lote inteiro e mataria o lote parcial. §A.38: a autorizacao e a trava sao as da UNITARIA,    │
   * │ reaplicadas por linha (o `registrarSaidaPorFiltro` recebe o `AuthUser`, nao so o id).         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O retorno e `AsResultadoAcaoEmMassa` (`{ afetados, falharam }`): num conjunto de milhares, a lista
   * de falhas com motivo seria relatorio de dado pessoal indo ao cliente (§A.6). O modo LISTA (`*EmLote`)
   * continua devolvendo o resultado rico com as falhas por linha, que a selecao manual sabe mapear.
   */

  /** `{ aplicadas, falhas }` do `emLote` vira `{ afetados, falharam }` do contrato por filtro. */
  private resultadoDaAcaoEmMassa(r: AsResultadoEmMassa): AsResultadoAcaoEmMassa {
    return { afetados: r.aplicadas, falharam: r.falhas.length };
  }

  /** DESVINCULAR por filtro (DESCARTADO/DESISTIU, status em massa): `registrarSaida` sobre todo o conjunto da vaga. ENVIAR PARA ADMISSAO e recusado aqui (manda credencial, so nominal). */
  async registrarSaidaPorFiltro(
    dto: RegistrarSaidaPorFiltroDto,
    user: AuthUser,
  ): Promise<AsResultadoAcaoEmMassa> {
    /*
     * STATUS EM MASSA SIM, CREDENCIAL NAO (decisao do diretor, 07/10/2026). As tres saidas entram pela
     * MESMA `registrarSaida`, mas duas sao ACAO DE STATUS (DESCARTADO, DESISTIU: descarte, encerram o
     * processo e nada mandam para fora) e uma MANDA CREDENCIAL: `ENVIADO_PARA_ADMISSAO` nasce a
     * pre-admissao e DISPARA o link de acesso ao prontuario (o Portal, §A.47). Enviar credencial so
     * pode ser NOMINAL, pessoa por pessoa, com a previa do caminho de lote por ids (`registrarSaidaEmLote`),
     * nunca "todos do filtro" de uma vez.
     *
     * A GUARDA VIVE AQUI, EM CODIGO, e vem ANTES de qualquer linha, nao na disciplina da tela: mesmo
     * espirito da §A.33 (defesa em profundidade, a trava mora no servico e nao em quem edita o front).
     * O `registrarSaidaEmLote` (NOMINAL, por ids, com a previa) segue aceitando `ENVIADO_PARA_ADMISSAO`
     * normalmente; o que esta porta recusa e so o modo "por filtro", sem teto, sobre o conjunto inteiro.
     */
    if (dto.situacao === "ENVIADO_PARA_ADMISSAO") {
      throw new ForbiddenException(
        "Enviar para admissão manda credencial de acesso ao prontuário e só pode ser feito de forma nominal, pessoa por pessoa, nunca em massa por filtro. Selecione as pessoas e envie uma a uma.",
      );
    }

    // MESMA GUARDA DO LOTE (`registrarSaidaEmLote`): motivo que pede pretensao e individual, entao
    // recusa o pedido inteiro antes de qualquer linha. Duplicada aqui de proposito para nao tocar o
    // caminho de lote ja validado (§A.26); a frase e a mesma porque a regra e a mesma.
    if (motivoVemDoCatalogo(dto.situacao)) {
      const ativos = await motivosDeDescarteAtivos(this.db);
      const escolhido = ativos.find((m) => m.nome === dto.motivo);
      if (escolhido?.pedePretensao === true) {
        throw new BadRequestException(
          "Este motivo pede a pretensão salarial, e a pretensão salarial é de cada pessoa. Por isso ele só pode ser usado no desvínculo individual: desvincule uma pessoa por vez informando o valor de cada uma, ou escolha outro motivo para o lote.",
        );
      }
    }
    const ids = await this.idsDaVaga(dto.filtro.vagaId, dto.filtro);
    const r = await this.emLote(ids, (candidaturaId) =>
      this.registrarSaida(candidaturaId, { situacao: dto.situacao, motivo: dto.motivo }, user),
    );
    return this.resultadoDaAcaoEmMassa(r);
  }

  /** MOVER NO FUNIL por filtro: `moverEtapa` sobre todo o conjunto da vaga. */
  async moverEtapaPorFiltro(
    dto: MoverEtapaPorFiltroDto,
    porId: string,
  ): Promise<AsResultadoAcaoEmMassa> {
    const ids = await this.idsDaVaga(dto.filtro.vagaId, dto.filtro);
    const r = await this.emLote(ids, (candidaturaId) =>
      this.moverEtapa(candidaturaId, { etapa: dto.etapa }, porId),
    );
    return this.resultadoDaAcaoEmMassa(r);
  }

  /** TROCAR A VAGA por filtro: `trocarVaga` sobre o conjunto da vaga de ORIGEM (`filtro.vagaId`). */
  async trocarVagaPorFiltro(
    dto: TrocarVagaPorFiltroDto,
    porId: string,
  ): Promise<AsResultadoAcaoEmMassa> {
    // A MESMA PRE-CONFERENCIA DE UX do `trocarVagaEmLote`: vaga de DESTINO encerrada recusa o pedido
    // inteiro. A trava do destino continua rodando por linha, dentro da `trocarVaga`.
    const regua = await this.statusVaga.regua();
    const destino = await this.db.query.vagas.findFirst({ where: eq(vagas.id, dto.vagaId) });
    if (!destino) throw new NotFoundException("Vaga de destino não encontrada.");
    if (!regua.recebeCandidato(destino.status)) {
      throw new ConflictException(
        "Esta vaga não recebe candidato: ela está encerrada. Escolha uma vaga aberta.",
      );
    }
    const ids = await this.idsDaVaga(dto.filtro.vagaId, dto.filtro);
    const r = await this.emLote(ids, (candidaturaId) =>
      this.trocarVaga(candidaturaId, { vagaId: dto.vagaId, motivo: dto.motivo }, porId),
    );
    return this.resultadoDaAcaoEmMassa(r);
  }

  /** FINALIZAR POSICAO por filtro: `finalizarPosicao` sobre todo o conjunto da vaga. */
  async finalizarPosicaoPorFiltro(
    dto: FinalizarPosicaoPorFiltroDto,
    porId: string,
  ): Promise<AsResultadoAcaoEmMassa> {
    const vagaId = dto.filtro.vagaId;
    const regua = await this.statusVaga.regua();
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    if (!regua.recebeCandidato(vaga.status)) {
      throw new ConflictException(
        "Esta vaga já foi encerrada e não recebe posição nova. Recarregue a página para ver o estado atual da vaga.",
      );
    }
    const ids = await this.idsDaVaga(vagaId, dto.filtro);
    const r = await this.emLote(ids, (candidaturaId) =>
      this.finalizarPosicao(
        candidaturaId,
        { lado: dto.lado, cienteBancoComOficiaisAbertas: dto.cienteBancoComOficiaisAbertas },
        porId,
      ),
    );
    return this.resultadoDaAcaoEmMassa(r);
  }

  /** ADICIONAR A VAGA por filtro: `alocar` sobre todos os DISPONIVEIS (gente fora da vaga). */
  async adicionarPorFiltro(
    dto: AdicionarPorFiltroDto,
    user: AuthUser,
  ): Promise<AsResultadoAcaoEmMassa> {
    const vagaId = dto.filtro.vagaId;
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    const regua = await this.statusVaga.regua();
    if (!regua.recebeCandidato(vaga.status)) {
      throw new ConflictException("Esta vaga está Fechada e não recebe candidato novo.");
    }
    const ids = await this.idsDosDisponiveis(vagaId, dto.filtro.busca);
    const r = await this.emLote(ids, (candidatoId) =>
      this.alocar(candidatoId, { vagaId, cienteReentrada: dto.cienteReentrada }, user.id),
    );
    return this.resultadoDaAcaoEmMassa(r);
  }

  /*
   * Os ids dos CANDIDATOS DISPONIVEIS para a vaga (a fonte da adicao por filtro): quem NAO tem
   * candidatura VIVA nesta vaga. E a uniao exata das duas fontes da aba Candidatos Disponiveis
   * (quem esta solto + quem esta vivo em OUTRA vaga): as duas sao "sem viva AQUI". `busca` casa o
   * nome. §A.6: devolve so o id do candidato (UUID), nenhum dado pessoal.
   */
  private async idsDosDisponiveis(vagaId: string, busca?: string): Promise<string[]> {
    const cond: SQL[] = [
      sql`not exists (select 1 from ${asCandidaturas}
                       where ${asCandidaturas.candidatoId} = ${asCandidatos.id}
                         and ${asCandidaturas.vagaId} = ${vagaId}
                         and ${inArray(asCandidaturas.situacao, SITUACOES_VIVAS)})`,
    ];
    const termo = busca?.trim();
    if (termo) {
      cond.push(
        sql`translate(lower(${asCandidatos.nome}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
            like ${"%" + semAcento(termo) + "%"}`,
      );
    }
    const linhas = await this.db
      .select({ id: asCandidatos.id })
      .from(asCandidatos)
      .where(and(...cond));
    return linhas.map((l) => l.id);
  }

  /**
   * QUEM PODE DESFAZER UMA ENTREGA. O papel é lido da SESSÃO, nunca do corpo, e é reconferido a cada
   * requisição: a tela esconder o botão é conveniência, o servidor é a autoridade.
   *
   * MESMA FORMA DO `fechar` E DO `cancelar` das vagas (`vagas.service.ts`), de propósito: três
   * jeitos diferentes de perguntar "é Master?" divergem na primeira vez que o papel mudar de nome.
   */
  private podeDesvincularEntregue(user: AuthUser): boolean {
    return user.papel === "MASTER" || user.papel === "SUPER_ADMIN";
  }

  /**
   * A LINHA PERTENCE À VAGA QUE A TELA AFIRMOU? Só roda quando o corpo mandou a vaga.
   *
   * É UMA CONFERÊNCIA DE PERTENCIMENTO, e NÃO uma contagem: ela não decide se cabe mais um (isso é da
   * trava, sob o lock, dentro da transação daquela linha). Ela recusa a seleção MISTURADA, que é uma
   * tela desatualizada ou um corpo montado à mão, e a recusa é da LINHA, não do lote.
   */
  private async confirmarQueEDaVaga(candidaturaId: string, vagaId: string): Promise<void> {
    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");
    if (c.vagaId !== vagaId) {
      throw new ConflictException(
        "Esta candidatura não é da vaga selecionada. Recarregue a página e refaça a seleção.",
      );
    }
  }

  /**
   * O SNAPSHOT DO ENVIO PARA A ESTEIRA: candidato + vaga da candidatura, no formato que
   * `AdmissoesService.criarPreAdmissaoDoFunil` consome. Leitura pura, usada só no ramo
   * `ENVIADO_PARA_ADMISSAO` de `registrarSaida`.
   *
   * VOLTOU A SER `private` EM 02/10/2026. Ela tinha sido tornada pública para a ponte da varredura
   * do Pandapé reusar este mapeamento em vez de ter a própria cópia; a ponte foi removida (o único
   * gatilho que envia para admissão é o da esteira, e não o das ATS) e sobrou um chamador só, aqui
   * dentro. Visibilidade aberta sem chamador de fora é convite a um segundo escritor de admissão.
   *
   * O MAPEAMENTO vaga → folha é conservador: só o que a vaga SABE. Salário é o de fechamento (o
   * negociado) com o de abertura como recurso; escala vem do horário/escala; cliente e cargo podem vir
   * NULOS (vaga sem de/para resolvido, §A.5), e nesse caso viram pendência na Liberação, nunca um
   * `cod_cliente` inventado. Setor, gestor BP e departamento a vaga não tem: chegam vazios e viram
   * pendência (regra 5). §A.6: nenhum CPF é logado; o CPF do substituído segue só como valor a gravar.
   */
  private async dadosDaPonteParaAdmissao(candidaturaId: string): Promise<
    | {
        candidato: {
          cpf: string | null;
          nome: string;
          email: string | null;
          telefone: string | null;
          dataNascimento: string | null;
        };
        codCliente: string | null;
        cargoId: string | null;
        idVacancy: string | null;
        vagaFolha: PreAdmissaoDoFunilInput["vagaFolha"];
        /**
         * O RETRATO DA PROCEDÊNCIA (0147): quais campos desta vaga estão, NESTE instante, com o
         * carimbo `PLANILHA`. NOME DE CAMPO apenas, vocabulário fechado, §A.6.
         *
         * ELE SAI DAQUI, e não de uma segunda consulta, porque esta leitura JÁ traz a vaga da
         * candidatura e é feita no gesto do envio. Uma consulta à parte leria a mesma linha de novo
         * para responder sobre o mesmo instante, e seria uma segunda chance de divergir.
         */
        procedenciaDaPlanilha: CampoDoPrePreenchimento[];
      }
    | null
  > {
    const [linha] = await this.db
      .select({
        candCpf: asCandidatos.cpf,
        candNome: asCandidatos.nome,
        candEmail: asCandidatos.email,
        candTelefone: asCandidatos.telefone,
        candNascimento: asCandidatos.dataNascimento,
        codCliente: vagas.codCliente,
        cargoId: vagas.cargoId,
        idVacancy: vagas.idVacancyPandape,
        salarioAbertura: vagas.salarioAbertura,
        salarioFechamento: vagas.salarioFechamento,
        horarioEscala: vagas.horarioEscala,
        centroCusto: vagas.centroCusto,
        tempoContrato: vagas.tempoContrato,
        motivo: vagas.motivo,
        substituidoNome: vagas.substituidoNome,
        substituidoCpf: vagas.substituidoCpf,
        localTrabalho: vagas.localTrabalho,
        // AS CINCO PROCEDÊNCIAS (0146), para o retrato do instante do envio. Elas NÃO vão para a
        // admissão: a ponte copia valor de vaga, e procedência é rastro, não dado de folha.
        naturezaOrigem: vagas.naturezaOrigem,
        linhaServicoOrigem: vagas.linhaServicoOrigem,
        cargoOrigem: vagas.cargoOrigem,
        dataAberturaOrigem: vagas.dataAberturaOrigem,
        dataLimiteOrigem: vagas.dataLimiteOrigem,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidaturas.candidatoId, asCandidatos.id))
      .innerJoin(vagas, eq(asCandidaturas.vagaId, vagas.id))
      .where(eq(asCandidaturas.id, candidaturaId));
    if (!linha) return null;

    return {
      candidato: {
        cpf: linha.candCpf,
        nome: linha.candNome,
        email: linha.candEmail,
        telefone: linha.candTelefone,
        dataNascimento: linha.candNascimento,
      },
      codCliente: linha.codCliente,
      cargoId: linha.cargoId,
      idVacancy: linha.idVacancy,
      vagaFolha: {
        salario: linha.salarioFechamento ?? linha.salarioAbertura,
        escala: linha.horarioEscala,
        centroCusto: linha.centroCusto,
        setor: null,
        gestorBp: null,
        departamento: null,
        tempoContrato: linha.tempoContrato,
        motivo: linha.motivo,
        substituidoNome: linha.substituidoNome,
        substituidoCpf: linha.substituidoCpf,
        endereco: linha.localTrabalho,
      },
      procedenciaDaPlanilha: camposComProcedenciaDaPlanilha(linha),
    };
  }

  /**
   * O CAMINHO TRAVADO, UM SÓ, para toda situação que ocupa posição da vaga.
   *
   * UM CAMINHO SÓ É DELIBERADO: duplicar a sequência lock/conta/decide para cada uma delas
   * garantiria que uma das cópias perderia a trava na primeira correção feita só na outra. A trava
   * mais importante do módulo mora em UM lugar.
   *
   * `ALOCADO` ENTROU NA ASSINATURA, e é por aqui que a finalização de posição vai passar quando a
   * rota dela existir (etapa 2). Um caminho novo que gravasse `ALOCADO` fora daqui reabriria
   * exatamente a corrida entre dois consultores que o `FOR UPDATE` do passo 2 existe para fechar,
   * e o comentário da `aprovar` descreve em 30 linhas por que uma consulta solta não resolve.
   */
  private async mudarSituacaoOcupandoPosicao(
    candidaturaId: string,
    novaSituacao: SituacaoQueOcupaPosicao,
    motivo: string | null,
    porId: string,
    /*
     * A ESCOLHA DE LADO É EXPLÍCITA, INCLUSIVE QUANDO NÃO HÁ ESCOLHA: `undefined` significa "herda o
     * lado já gravado na candidatura", e quem não escolhe é obrigado a escrever isso no ponto de
     * chamada. Opcional aqui não daria: parâmetro opcional não pode preceder obrigatório, e o de
     * baixo passou a ser obrigatório de propósito (ver o bloco seguinte).
     */
    posicao: { lado: PosicaoLado; cienteBancoComOficiaisAbertas: boolean } | undefined,
    /*
     * ┌─ A EXIGÊNCIA DE CANDIDATURA VIVA É OBRIGATÓRIA NA ASSINATURA, e isto é a correção que ────┐
     * │   IMPEDE A REINCIDÊNCIA (decisão do diretor, Onda B)                                      │
     * │                                                                                           │
     * │ ELA NASCEU OPCIONAL, e o DEFAULT SILENCIOSO ERA O DEFEITO. Este método tem três            │
     * │ chamadores; dois ligavam a conferência e o terceiro, o avanço para a esteira, HERDOU a     │
     * │ ausência sem ninguém decidir nada: enviar para a admissão uma candidatura ENCERRADA        │
     * │ ressuscitava a linha morta consumindo posição da vaga, sem Master e sem aceite. Não foi    │
     * │ uma trava burlada, foi uma trava não consultada, que é o mesmo modo de falha que já custou │
     * │ caro neste arquivo.                                                                       │
     * │                                                                                           │
     * │ OBRIGATÓRIA, O PRÓXIMO A CONSTRUIR É FORÇADO A ESCOLHER, e a escolha fica ESCRITA no ponto │
     * │ de chamada, onde quem lê o caminho a enxerga. Um chamador novo que não decida nada não     │
     * │ compila, em vez de nascer com a porta aberta e nenhum teste vermelho.                      │
     * │                                                                                           │
     * │ QUEM LIGA HOJE: os TRÊS. A aprovação (auditoria de 08/09), a finalização de posição e o    │
     * │ avanço para a esteira (Onda B). A opção continua existindo porque ela é uma pergunta       │
     * │ legítima de um caminho futuro, e não um vestígio: o que deixou de existir é a resposta     │
     * │ dada por omissão.                                                                         │
     * │                                                                                           │
     * │ DENTRO DA TRANSAÇÃO, E NÃO ANTES DELA: a leitura que decide é a mesma que já existe aqui,  │
     * │ sob a linha da vaga travada. Uma consulta solta custaria uma ida a mais ao banco para      │
     * │ responder sobre um instante anterior ao da gravação.                                      │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    opcoes: { exigeCandidaturaViva: boolean },
    /**
     * ─ O RETRATO DA PROCEDÊNCIA DA VAGA, SÓ NO ENVIO PARA A ADMISSÃO (0147) ────────────────────
     *
     * Quais campos daquela vaga estavam com carimbo `PLANILHA` no instante do envio. NOME DE CAMPO
     * apenas, vocabulário fechado (§A.6: nada de candidato, nada de CPF, nada de valor).
     *
     * ┌─ POR QUE PARÂMETRO PRÓPRIO, E NÃO UM CAMPO DENTRO DE `opcoes` ──────────────────────────┐
     * │ `opcoes` é o conjunto das GUARDAS que o chamador liga ou desliga, e a sua forma literal é │
     * │ lida por um teste de fonte (`candidatos.fronteira-encerrada.cobertura-independente`) que │
     * │ existe para provar que `exigeCandidaturaViva` nunca volte a ser opcional, porque foi a    │
     * │ omissão dele que ressuscitava candidatura morta. Pendurar um dado de TRILHA ali misturaria│
     * │ duas coisas de naturezas diferentes e quebraria aquela prova por um motivo que não tem    │
     * │ nada a ver com o que ela afirma.                                                          │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * OPCIONAL, E AQUI O DEFAULT SILENCIOSO É SEGURO, ao contrário do que aconteceu com
     * `exigeCandidaturaViva` (o bloco acima conta a história): lá a omissão DESLIGAVA uma trava;
     * aqui ela só deixa a coluna NULA, que é exatamente o significado correto para os outros dois
     * chamadores. `aprovar` e `finalizarPosicao` NÃO são envio para a admissão, e carimbar o
     * retrato neles faria a linha do tempo afirmar uma medição que ninguém fez, que é a mesma razão
     * de `posicao_lado` entrar condicionalmente.
     *
     * LISTA VAZIA NÃO É AUSÊNCIA: `[]` quer dizer "envio medido, nenhum campo veio da planilha", e
     * é ela que dá o denominador da contagem. Ver a prosa da coluna no schema.
     */
    procedenciaDaPlanilha?: readonly CampoDoPrePreenchimento[],
  ): Promise<void> {
    /*
     * O CATÁLOGO ANTES DA TRANSAÇÃO. ISTO NÃO MOVE A TRAVA 2 PARA FORA DO LOCK, e a diferença é a
     * que a auditoria de 09/09 deixou escrita logo abaixo: o que se lê aqui é o CATÁLOGO (uma lista
     * de meia dúzia de linhas, servida de cache, que não tem nada a ver com esta vaga); o que se lê
     * sob o `SELECT ... FOR UPDATE` é o STATUS DA VAGA, que é o dado disputado. A régua devolvida é
     * síncrona, então lá dentro não sobra `await` de catálogo para alguém, um dia, "aproveitar a
     * viagem" e puxar a vaga junto por fora do lock.
     */
    const regua = await this.statusVaga.regua();
    // O SEGUNDO INSUMO DA DERIVAÇÃO, pela mesma régua e no mesmo lugar (ver `insumosDaDerivacao`).
    const etapasDeEntrega = await this.etapas.codigosDeEntregaAoCliente();
    await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");
      if (c.situacao === novaSituacao) {
        throw new ConflictException(
          "Esta candidatura já está nesta situação. Recarregue a página.",
        );
      }
      // TRAVA 5: quem saiu do processo não tem posição a entregar, tem processo a recomeçar, e o
      // recomeço passa pela `alocar`, que é onde a ciência de reentrada é pedida.
      if (opcoes.exigeCandidaturaViva && !candidaturaViva(c.situacao)) {
        throw new ConflictException(
          "Esta candidatura já foi encerrada e não recebe posição. Para trazer a pessoa de volta, aloque-a de novo na vaga, que é onde o sistema mostra o motivo do encerramento anterior.",
        );
      }

      /*
       * ┌─ TRAVA 7: A ENTREGA NÃO ANDA PARA TRÁS, e esta vale para TODO chamador ────────────────┐
       * │ O CASO CONCRETO, medido na auditoria: aprovar alguém que já estava `ALOCADO`. A posição │
       * │ entregue virava posição apenas RESERVADA, `finalizadasOficial` CAÍA, o cilindro da tela │
       * │ esvaziava e a vaga que já tinha entregue tudo voltava a precisar de um Master para      │
       * │ fechar. Nada falhava, nada avisava, e o número simplesmente mudava.                     │
       * │                                                                                        │
       * │ POR QUE ELA NÃO É UMA OPÇÃO DO CHAMADOR, como a trava 5: porque não existe chamador     │
       * │ para quem desfazer uma entrega esteja certo. Deixá-la ligada por parâmetro seria pedir  │
       * │ que o próximo caminho novo lembrasse de ligá-la, e foi exatamente assim que a aprovação │
       * │ ficou sem a trava 5.                                                                   │
       * │                                                                                        │
       * │ A RÉGUA É `finalizaPosicao`, do vocabulário compartilhado, nos DOIS lados da pergunta:  │
       * │ recusa só quando a situação ATUAL entrega e a NOVA não entrega. Por construção ela não  │
       * │ alcança nenhum caminho legítimo de hoje: o avanço do alocado para a esteira entrega dos │
       * │ dois lados e passa, e aprovar quem está `ATIVO` não parte de entrega nenhuma.           │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (finalizaPosicao(c.situacao) && !finalizaPosicao(novaSituacao)) {
        throw new ConflictException(
          "Esta candidatura já entregou a posição da vaga, e a entrega não volta atrás por aqui. Se a pessoa saiu do processo, registre a saída dela.",
        );
      }

      // ── PASSO 2 DA TRAVA 4: a LINHA DA VAGA é travada ANTES de qualquer contagem. Daqui até o
      // fim da transação, nenhuma outra aprovação nesta mesma vaga passa deste ponto.
      const [vaga] = await tx
        .select({
          id: vagas.id,
          status: vagas.status,
          posicoesOficiais: vagas.posicoesOficiais,
          // A META DE BANCO entra na leitura porque ela é metade do teto: quem finaliza posição no
          // banco é medido contra oficiais mais banco (`tetoDoLado`).
          posicoesBanco: vagas.posicoesBanco,
        })
        .from(vagas)
        .where(eq(vagas.id, c.vagaId))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");

      /*
       * ┌─ TRAVA 2, AGORA TAMBÉM AQUI: A VAGA ENCERRADA NÃO RECEBE POSIÇÃO (auditoria, 09/09) ───┐
       * │ O STATUS JÁ ERA LIDO NESTE `SELECT ... FOR UPDATE` E NINGUÉM O CONFERIA. A `alocar` e a │
       * │ `trocarVaga` aplicavam a régua do status; o CAMINHO TRAVADO, que é por onde passam      │
       * │ a finalização de posição, a aprovação e o avanço para a esteira, lia o campo e seguia   │
       * │ adiante. Uma vaga `FECHADA`, `CANCELADA` ou `ENTREGUE` continuava recebendo entrega.    │
       * │                                                                                        │
       * │ O DANO NÃO ERA COSMÉTICO, e ele é silencioso: o fechamento CONGELA `vagas_fechadas` e   │
       * │ `vagas_fechadas_banco` com a contagem do instante em que encerrou, e é esse carimbo que │
       * │ a vaga encerrada mostra. Toda posição finalizada depois disso move a ocupação DERIVADA  │
       * │ e não move o carimbo: os dois números passam a discordar, sem nada falhar e sem nada    │
       * │ avisar, num processo que a operação considera terminado.                                │
       * │                                                                                        │
       * │ E O GATE DE MASTER VIRAVA CONTORNÁVEL EM DUAS ETAPAS: o Master força o fechamento com   │
       * │ posição oficial em aberto (a exceção fica registrada em nome dele, como deve), e depois │
       * │ despeja-se alocação na vaga já fechada, onde nenhuma trava do fechamento roda de novo.  │
       * │                                                                                        │
       * │ A RÉGUA É A MESMA DA `alocar`, vinda do CATÁLOGO e não redigitada: uma segunda lista de │
       * │ status encerrados neste arquivo divergiria da primeira na correção seguinte.            │
       * │                                                                                        │
       * │ AQUI, E NÃO ANTES DA TRANSAÇÃO: o status que decide é o mesmo que a gravação vai usar,  │
       * │ sob a linha travada. Uma consulta solta antes do lock responderia sobre o instante      │
       * │ anterior, e é exatamente essa a corrida que o `FOR UPDATE` deste passo existe para      │
       * │ fechar: o fechamento que chega no meio espera, e quem chegar depois lê a vaga encerrada.│
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (!regua.recebeCandidato(vaga.status)) {
        throw new ConflictException(
          "Esta vaga já foi encerrada e não recebe posição nova. Recarregue a página para ver o estado atual da vaga.",
        );
      }

      /*
       * ── PASSO 3: contar POR LADO, agora que a linha está travada.
       *
       * A CONTAGEM EXCLUI A PRÓPRIA CANDIDATURA, senão mover quem já estava aprovado contaria a
       * mesma pessoa duas vezes e seria recusado por ela mesma numa vaga cheia.
       *
       * A LISTA É A CONSTANTE `SITUACOES_QUE_CONSOMEM_POSICAO`, e esta é a cópia que mais custava
       * caro das cinco: é ESTA contagem que a trava 1 usa para decidir se ainda cabe alguém. Uma
       * situação nova que consumisse posição e não estivesse escrita aqui faria a vaga aceitar gente
       * a mais em silêncio, com a trava intacta e a conta errada.
       *
       * ┌─ POR QUE ELA VIROU UM `group by posicao_lado` (defeito MEDIDO, corrigido em 08/09) ────┐
       * │ ERA UM `count(*)` SEM LADO, e esse número único era medido contra DOIS tetos            │
       * │ diferentes. Na vaga real de homologação (5 oficiais, 20 de banco) isso produzia dois    │
       * │ erros ao mesmo tempo:                                                                  │
       * │   1. o AVISO do banco contava o total, então ele dizia 5, 4, 3, 2, 1 e SUMIA na quinta  │
       * │      alocação de banco, com as 5 oficiais ainda vazias;                                 │
       * │   2. com 20 no banco, o candidato do lado OFICIAL era medido em 20 contra 5 e recusado  │
       * │      com "as 5 posições já estão preenchidas", tendo ZERO posição oficial preenchida.   │
       * │      A vaga travava justamente para o que ela existe para fazer.                        │
       * │                                                                                        │
       * │ AGORA CADA LADO É MEDIDO CONTRA A OCUPAÇÃO DELE. Para as linhas de hoje nada muda: com  │
       * │ `posicao_lado` nulo em todas, `ocupadas.OFICIAL` é exatamente o `count(*)` de antes     │
       * │ (`ladoDaCandidatura` dobra o nulo em OFICIAL) e `ocupadas.BANCO` é zero.                │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const linhasOcupadas = await tx
        .select({
          lado: asCandidaturas.posicaoLado,
          quantas: sql<number>`count(*)::int`,
        })
        .from(asCandidaturas)
        .where(
          and(
            eq(asCandidaturas.vagaId, c.vagaId),
            inArray(asCandidaturas.situacao, SITUACOES_QUE_CONSOMEM_POSICAO),
            ne(asCandidaturas.id, candidaturaId),
          ),
        )
        .groupBy(asCandidaturas.posicaoLado);

      // O NULO NÃO VIRA UM TERCEIRO LADO: quem o dobra em OFICIAL é o domínio, em um lugar só.
      const ocupadas = ocupadasPorLado(linhasOcupadas);

      /*
       * ─ DE QUAL LADO DA META ESTA POSIÇÃO SAI ────────────────────────────────────────────────
       *
       * QUANDO A OPERAÇÃO ESCOLHE (a finalização de posição), vale a escolha do consultor. QUANDO
       * ELA NÃO ESCOLHE (a aprovação e o avanço para a esteira), vale o lado JÁ GRAVADO na
       * candidatura, e nulo vale `OFICIAL`.
       *
       * LER O LADO GRAVADO NÃO É ZELO, É O QUE IMPEDE UM BECO SEM SAÍDA: quem foi alocado no BANCO
       * de uma vaga com as oficiais cheias seria medido contra a meta oficial ao avançar para a
       * esteira, e o avanço seria recusado numa vaga que tem reserva de sobra. A pessoa ficaria
       * presa no estado em que entrou.
       *
       * HOJE A COLUNA É NULA EM TODAS AS LINHAS, então este bloco devolve `OFICIAL` para todo mundo
       * e a régua continua sendo exatamente a de antes. Ele só muda de resposta para as linhas que
       * a finalização com lado BANCO criar daqui para frente.
       */
      const lado: PosicaoLado = posicao?.lado ?? ladoDaCandidatura(c.posicaoLado);

      /*
       * O AVISO DO BANCO (decisão do diretor): ele AVISA e NÃO BLOQUEIA.
       *
       * Alocar no banco enquanto sobra posição OFICIAL é decisão legítima e cara de reverter, então
       * o consultor recebe o número na frente e decide. A ciência volta no corpo, como a da
       * reentrada, e a segunda chamada passa.
       *
       * SÓ VALE PARA A ESCOLHA EXPLÍCITA (`posicao` presente): quando o lado vem do que já está
       * gravado, a decisão já foi tomada e confirmada uma vez, e repetir o aviso a cada avanço da
       * mesma pessoa transformaria a confirmação em clique automático.
       */
      // A CONTA É SOBRE AS OFICIAIS, e não sobre o total: é o lado OFICIAL que continua aberto
      // quando alguém vai para o banco, e era o total que fazia o aviso sumir na quinta alocação.
      const oficiaisAbertas = oficiaisAindaAbertas(ocupadas.OFICIAL, vaga.posicoesOficiais);
      const guardaDoBancoDispara = posicao?.lado === "BANCO" && oficiaisAbertas > 0;
      if (guardaDoBancoDispara && !posicao.cienteBancoComOficiaisAbertas) {
        throw this.bancoComOficiaisAbertas(oficiaisAbertas);
      }

      /*
       * O QUE VAI PARA O LOG DE ACEITE, e ele só existe quando uma guarda foi DE FATO destravada.
       *
       * `cienteBancoComOficiaisAbertas` sozinho não basta como gatilho: um corpo montado fora da
       * tela pode mandar a ciência sempre, e registrar "aceite" onde o aviso nem apareceu encheria a
       * trilha de linhas que não descrevem decisão nenhuma. O gatilho é a guarda ter disparado
       * (`guardaDoBancoDispara`) E a ciência ter vindo, que é exatamente o caso em que o consultor
       * leu o número e passou por cima dele.
       */
      const aceiteRegistrado =
        guardaDoBancoDispara && posicao.cienteBancoComOficiaisAbertas
          ? // O NOME DA GUARDA VEM DO DOMÍNIO, e não é digitado aqui: é o mesmo nome de que o CHECK
            // do banco é derivado, e duas escritas do mesmo nome divergem na primeira guarda nova.
            { aceite: ACEITE_BANCO_COM_OFICIAIS_ABERTAS, aceiteNumero: oficiaisAbertas }
          : {};

      // ── PASSO 4: decidir, com a régua do domínio, e gravar. A ocupação medida é a DO LADO, contra
      // o teto DAQUELE lado: uma contagem e um teto que respondem sobre a mesma coisa.
      const teto = tetoDoLado(lado, vaga.posicoesOficiais, vaga.posicoesBanco);
      if (!cabeMaisUm(ocupadas[lado], teto)) {
        // META AUSENTE não é vaga cheia, é vaga sem meta: a frase precisa dizer o que fazer.
        if (vaga.posicoesOficiais === null || vaga.posicoesOficiais === undefined) {
          throw new ConflictException(
            "Esta vaga ainda não tem o número de posições definido. Informe as posições da vaga antes de aprovar.",
          );
        }
        /*
         * A TRAVA 1, com a frase que o diretor definiu para o lado OFICIAL, intocada.
         *
         * O LADO BANCO GANHA FRASE PRÓPRIA porque o teto dele é outro, e ela fala SÓ do número de
         * banco: com o teto próprio, quem é recusado na reserva de uma vaga de 5 oficiais e 20 de
         * banco esbarrou em 20, e citar os 5 oficiais mandaria o consultor conferir o campo errado.
         *
         * BANCO ZERO TEM FRASE PRÓPRIA porque é um problema diferente: não é reserva cheia, é
         * reserva que ninguém dimensionou, e "as 0 já estão preenchidas" não é português nem
         * instrução. Antes, o teto cumulativo deixava essa alocação consumir uma posição OFICIAL em
         * silêncio, que é justamente o que a separação por lado veio acabar.
         */
        const n = vaga.posicoesOficiais;
        if (lado === "BANCO") {
          const banco = vaga.posicoesBanco ?? 0;
          if (banco === 0) {
            throw new ConflictException(
              "Esta vaga não tem posição de banco reservada. Defina as posições de banco da vaga antes de alocar alguém na reserva.",
            );
          }
          throw new ConflictException(
            banco === 1
              ? "Esta vaga tem 1 posição de banco e ela já está preenchida. Aumente as posições de banco da vaga ou libere alguém."
              : `Esta vaga tem ${banco} posições de banco e as ${banco} já estão preenchidas. Aumente as posições de banco da vaga ou libere alguém.`,
          );
        }
        throw new ConflictException(
          n === 1
            ? "Esta vaga tem 1 posição e ela já está preenchida. Reprove alguém ou aumente as posições da vaga."
            : `Esta vaga tem ${n} posições e as ${n} já estão preenchidas. Reprove alguém ou aumente as posições da vaga.`,
        );
      }

      await tx
        .update(asCandidaturas)
        .set({
          situacao: novaSituacao,
          motivoDescarte: motivo ?? c.motivoDescarte,
          /*
           * O LADO SÓ É ESCRITO POR QUEM O ESCOLHEU, e é por isso que ele entra condicionalmente em
           * vez de sempre: a aprovação e o avanço para a esteira NÃO escolhem lado, e escrever
           * `OFICIAL` neles apagaria em silêncio o `BANCO` de quem já estava na reserva.
           */
          ...(posicao ? { posicaoLado: posicao.lado } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(asCandidaturas.id, candidaturaId));

      /*
       * O DESFECHO ENTRA NO HISTÓRICO DENTRO DA TRANSAÇÃO JÁ ABERTA, e portanto sob a mesma linha de
       * vaga travada da trava 4. Não há custo novo de concorrência: a transação existia, o insert só
       * entrou nela. Se a trava recusar, nada foi gravado, nem o estado nem o evento.
       *
       * ┌─ O ACEITE DO AVISO DE BANCO DEIXA LOG PERMANENTE (decisão do diretor, §A.3 regra 8) ───┐
       * │ ATÉ AQUI A CONFIRMAÇÃO ERA LIDA E JOGADA FORA. O consultor destravava a guarda mais     │
       * │ cara de desfazer do módulo (mandar alguém para a reserva com posição oficial em aberto) │
       * │ e não sobrava rastro nenhum de quem decidiu, quando, nem o que ele estava vendo.        │
       * │                                                                                        │
       * │ O EVENTO JÁ ERA GRAVADO AQUI: o que faltava era o QUALIFICADOR da decisão, não o        │
       * │ registro dela. Por isso o log estende esta linha em vez de abrir tabela nova, e por     │
       * │ isso ele nasce na mesma transação: ou o aceite e a mudança de situação existem os dois, │
       * │ ou não existe nenhum dos dois.                                                          │
       * │                                                                                        │
       * │ QUEM (`por_id`, usuário interno), QUANDO (`ocorrido_em`), O LADO (`posicao_lado`) e o   │
       * │ NÚMERO (`aceite_numero`: quantas posições oficiais estavam abertas no instante da       │
       * │ decisão). §A.6: nada de candidato, nada de CPF, nada de nome de pessoa, nada de URL.    │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: null,
        etapaPara: c.etapa,
        situacao: novaSituacao,
        motivo,
        porId,
        /*
         * O LADO SÓ ENTRA QUANDO ALGUÉM O ESCOLHEU, e pela mesma razão de a candidatura só o gravar
         * aí: a aprovação e o avanço para a esteira não escolhem lado, e carimbar `OFICIAL` neles
         * faria a linha do tempo afirmar uma decisão que ninguém tomou.
         */
        ...(posicao ? { posicaoLado: posicao.lado } : {}),
        ...aceiteRegistrado,
        /*
         * ─ O RETRATO DA PROCEDÊNCIA, SÓ QUANDO O CHAMADOR MEDIU (0147) ────────────────────────
         *
         * MESMA FORMA CONDICIONAL DO LADO E DO ACEITE, e pela mesma razão: chamador que não é o
         * envio para a admissão não mediu nada, e escrever `{}` nele afirmaria uma medição que não
         * aconteceu. A chave omitida deixa a coluna NULA, que é o estado "não é envio".
         *
         * O VAZIO, ESSE, É GRAVADO: quem mediu e não achou campo nenhum da planilha manda `[]`, e
         * é esse `[]` que dá o denominador da contagem ("de quantos envios, quantos saíram sobre
         * vaga pré-preenchida?"). A distinção entre `null` e `[]` é a mesma de `AUSENTE` x
         * `NAO_CASOU` no domínio do pré-preenchimento.
         *
         * §A.6: nomes de campo de vocabulário fechado. Quem agiu já está em `por_id`, da sessão.
         */
        ...(procedenciaDaPlanilha ? { procedenciaPlanilha: [...procedenciaDaPlanilha] } : {}),
      });

      /*
       * ─ O STATUS DA VAGA ACOMPANHA (Frente B, ponto 2) ──────────────────────────────────────────
       *
       * ESTE CAMINHO COBRE TRÊS GATILHOS DE UMA VEZ, e é por isso que a chamada mora AQUI e não nos
       * três chamadores: `aprovar`, `finalizarPosicao` e o avanço para a esteira. O que eles mudam é
       * a SITUAÇÃO, e situação decide quem é VIVO, que é metade da pergunta da derivação: enviar
       * para a admissão o último candidato que estava com o cliente tira a vaga de ENTREGUE.
       *
       * A VAGA JÁ ESTÁ TRAVADA por este método (passo 2 da trava 4), então o `FOR UPDATE` de lá
       * dentro é o mesmo lock, já nosso, e não custa espera nenhuma.
       */
      if (movimentoPodeMudarAEntrega([c.etapa], etapasDeEntrega)) {
        await derivarStatusDaVaga(tx, c.vagaId, regua, etapasDeEntrega, porId);
      }
    });
  }

  // ── O HISTÓRICO ───────────────────────────────────────────────────────────

  /**
   * Registrar contato. Pende da CANDIDATURA, nunca da pessoa: ver a tabela para o porquê.
   *
   * O CARIMBO DO ÚLTIMO CONTATO É ESCRITO AQUI, NA MESMA TRANSAÇÃO DO INSERT, e é o ajuste 1 do
   * diretor. Antes, o registro de contato não tocava a candidatura, e a coluna "último contato" da
   * listagem mostrava `atualizado_em`, que se move com etapa e com saída e NÃO se move com contato.
   *
   * NA MESMA TRANSAÇÃO porque as duas escritas são UM fato: contato gravado sem o carimbo faria a
   * listagem continuar mentindo, e carimbo sem o contato inventaria uma conversa que não existe no
   * histórico. Ou as duas, ou nenhuma.
   *
   * O CARIMBO SÓ ANDA PARA FRENTE (`greatest`), e isso importa porque `ocorrido_em` é a data do FATO,
   * não a da digitação: a ligação de ontem registrada hoje entra no histórico no lugar certo da linha
   * do tempo, mas NÃO pode puxar "falamos pela última vez em" para trás. Um `set` direto faria a
   * pessoa parecer mais fria do que está, que é justamente a leitura errada que a coluna existe para
   * evitar.
   *
   * `atualizado_em` NÃO É TOCADO, de propósito: são duas perguntas diferentes ("quando esta
   * candidatura andou" e "quando falamos com esta pessoa"), e responder as duas com um campo só
   * perderia uma delas.
   */
  async registrarContato(
    candidaturaId: string,
    dto: RegistrarContatoDto,
    registradoPorId: string,
  ): Promise<AsContatoItem> {
    const ocorridoEm = dto.ocorridoEm ? new Date(dto.ocorridoEm) : new Date();

    const contatoId = await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");

      const [row] = await tx
        .insert(asContatos)
        .values({
          candidaturaId,
          tipo: dto.tipo,
          resumo: dto.resumo.trim(),
          ocorridoEm,
          registradoPorId,
        })
        .returning({ id: asContatos.id });

      await tx
        .update(asCandidaturas)
        .set({
          ultimoContatoEm: sql`greatest(coalesce(${asCandidaturas.ultimoContatoEm}, ${ocorridoEm.toISOString()}::timestamptz), ${ocorridoEm.toISOString()}::timestamptz)`,
        })
        .where(eq(asCandidaturas.id, candidaturaId));

      return row.id;
    });

    const [item] = await this.listarContatos(candidaturaId, contatoId);
    return item;
  }

  /**
   * A LINHA DO TEMPO DAS ETAPAS de uma candidatura (peça P3 do bug 1).
   *
   * DO MAIS ANTIGO PARA O MAIS NOVO, ao contrário do histórico de contato logo abaixo, e a diferença
   * é de leitura: contato se lê "o que houve por último", caminho se lê "por onde a pessoa passou",
   * que é uma narrativa e só faz sentido do começo.
   *
   * A ORDENAÇÃO FINAL É DO DOMÍNIO (`ordenarLinhaDoTempo`), e não só do `order by`. O banco ordena
   * por tempo; o domínio desempata os eventos do MESMO instante colocando a entrada antes do
   * desfecho. Sem isso, alocar e descartar no mesmo segundo (que é o caso da semente do backfill)
   * mostraria a saída antes da entrada em metade das vezes.
   *
   * O TIPO DE CADA EVENTO NÃO VEM DO BANCO: é derivado aqui, pela mesma função que o teste afirma.
   */
  /**
   * ─ MARCAR (OU REMARCAR) A ENTREVISTA DA CANDIDATURA (Frente E, ponto 8) ───────────────────────
   *
   * UM GESTO SÓ PARA OS DOIS CASOS, e o `onConflictDoUpdate` é o que torna isso correto em vez de
   * conveniente: "já existe marcação para esta etapa?" é pergunta cuja resposta só vale no instante
   * da GRAVAÇÃO. Perguntá-la antes, com um `select`, e decidir entre `insert` e `update` reabre a
   * corrida entre dois consultores marcando ao mesmo tempo, e o segundo levaria violação de unique
   * na cara em vez de remarcar. O banco resolve os dois casos numa instrução.
   *
   * ┌─ A ETAPA VEM DO CORPO, E NÃO DA ETAPA ATUAL DA PESSOA ───────────────────────────────────────┐
   * │ Marcar a entrevista do CLIENTE enquanto a pessoa ainda está na etapa Soulan é o caso NORMAL: │
   * │ é para isso que se marca com antecedência. Deduzir a etapa da candidatura gravaria a         │
   * │ entrevista no lugar errado exatamente no caso que a OST manda prever.                        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AS TRÊS GUARDAS, e nenhuma sobra:
   *   1. A CANDIDATURA EXISTE E ESTÁ VIVA. Marcar entrevista para quem foi descartado é agendar com
   *      alguém que saiu do processo, e a linha do tempo dele passaria a ter um compromisso futuro.
   *   2. A ETAPA EXISTE, ESTÁ ATIVA E TEM ENTREVISTA (`exigirEtapaComEntrevista`, contra o catálogo
   *      VIVO). Substitui um `@IsIn` que congelaria em código a lista que o diretor edita.
   *   3. A FK do banco recusa em última instância, mesmo para quem escrever por SQL cru.
   *
   * NÃO EXISTE DESMARCAR, e a ausência é decisão (§A.31): a OST pediu o CAMPO para o time
   * preencher, e remarcar cobre a correção (data errada, hora errada, dia trocado). Cancelar uma
   * entrevista é gesto novo, com pergunta própria ("cancelou ou só mudou?"), e ele é PROPOSTA no
   * relatório, não código construído sem pedido.
   *
   * §A.6: grava id de candidatura, código de etapa, um instante e o id do usuário INTERNO da
   * sessão. Nenhum dado pessoal do candidato entra aqui, e não há log.
   */
  async marcarEntrevista(
    candidaturaId: string,
    dto: MarcarEntrevistaDto,
    porId: string,
  ): Promise<AsCandidaturaEntrevista[]> {
    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");
    if (!candidaturaViva(c.situacao)) {
      throw new ConflictException(
        "Esta candidatura foi encerrada e não recebe entrevista nova. Para retomar o processo, aloque a pessoa de novo na vaga.",
      );
    }

    /*
     * ┌─ A VAGA PRECISA ESTAR EM PROCESSO (achado do `tester`, o gêmeo do da reprovação) ────────┐
     * │ A MESMA FRESTA, PELA MESMA RAZÃO: as guardas deste método eram todas sobre a CANDIDATURA │
     * │ (existe, está viva) e sobre a ETAPA (tem entrevista no catálogo). Nenhuma perguntava se a │
     * │ vaga ainda é um processo, e o caminho é o mesmo caminho FELIZ da Frente B: um `ALOCADO`   │
     * │ continua vivo na Entrevista Cliente depois de a vaga FECHAR entregando a posição dele (a  │
     * │ trava do fechamento trata ALOCADO como TRATADO).                                          │
     * │                                                                                           │
     * │ O QUE UM CLIQUE PRODUZIA ALI: uma entrevista MARCADA PARA O FUTURO numa vaga terminada,   │
     * │ que entra na agenda da semana (o índice `idx_as_candidatura_entrevistas_agenda` existe    │
     * │ para essa leitura) e chama o time para um compromisso de um processo que acabou.           │
     * │                                                                                           │
     * │ A RÉGUA É A MESMA de `fechar`, `cancelar`, do envio de shortlist e da reprovação pelo     │
     * │ cliente: `papelDeVagaEmProcesso`. Nenhuma lista nova de papéis vivos é escrita aqui.      │
     * │                                                                                           │
     * │ A ORDEM É DELIBERADA: a guarda da VAGA vem ANTES da do catálogo de etapas. Quem clica numa │
     * │ vaga encerrada precisa ouvir que a VAGA acabou, e não que "a etapa não tem entrevista",   │
     * │ que mandaria a pessoa configurar catálogo para resolver um problema que não é de catálogo.│
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const regua = await this.statusVaga.regua();
    const vagaDaCandidatura = await this.db.query.vagas.findFirst({
      where: eq(vagas.id, c.vagaId),
    });
    if (!vagaDaCandidatura) throw new NotFoundException("Vaga da candidatura não encontrada.");
    if (!papelDeVagaEmProcesso(regua.linha(vagaDaCandidatura.status).papel)) {
      throw new ConflictException(
        `Esta vaga está em "${regua.rotulo(vagaDaCandidatura.status)}" e não tem processo em andamento. Não é possível marcar entrevista nela.`,
      );
    }

    await this.etapas.exigirEtapaComEntrevista(dto.etapa);

    const agendadaEm = new Date(dto.agendadaEm);

    await this.db
      .insert(asCandidaturaEntrevistas)
      .values({ candidaturaId, etapa: dto.etapa, agendadaEm, agendadaPorId: porId })
      /*
       * REMARCAR É ESTE `onConflictDoUpdate`, e o alvo é o MESMO par do unique do banco. O AUTOR É
       * REESCRITO junto com a data, de propósito: quem remarcou é quem responde por aquela
       * marcação, e manter o autor original diria que a entrevista das 15h foi marcada por alguém
       * que marcou outra coisa. `atualizado_em` é empurrado na mão porque `onConflictDoUpdate` não
       * dispara o default da coluna.
       */
      .onConflictDoUpdate({
        target: [asCandidaturaEntrevistas.candidaturaId, asCandidaturaEntrevistas.etapa],
        set: { agendadaEm, agendadaPorId: porId, atualizadoEm: new Date() },
      });

    return this.listarEntrevistas(candidaturaId);
  }

  /**
   * AS ENTREVISTAS DA CANDIDATURA, na ordem da agenda (a mais próxima primeiro).
   *
   * O AUTOR JÁ VEM RESOLVIDO EM NOME, numa consulta só, pela mesma razão do histórico de etapas: a
   * alternativa seria a tela pedir o nome de cada usuário depois, uma chamada por linha.
   *
   * ORDEM POR `agendada_em` ASCENDENTE, e não por criação: a pergunta que a ficha faz é "o que está
   * marcado para esta pessoa", e agenda se lê do próximo compromisso em diante.
   *
   * §A.6: devolve código de etapa, instante e o nome de um usuário INTERNO do EA. Nada do candidato.
   */
  async listarEntrevistas(candidaturaId: string): Promise<AsCandidaturaEntrevista[]> {
    const linhas = await this.db
      .select({ e: asCandidaturaEntrevistas, autor: usuarios.nome })
      .from(asCandidaturaEntrevistas)
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturaEntrevistas.agendadaPorId))
      .where(eq(asCandidaturaEntrevistas.candidaturaId, candidaturaId))
      .orderBy(asc(asCandidaturaEntrevistas.agendadaEm));

    return linhas.map((l) => ({
      id: l.e.id,
      candidaturaId: l.e.candidaturaId,
      etapa: l.e.etapa,
      agendadaEm: l.e.agendadaEm.toISOString(),
      agendadaPorNome: l.autor,
      atualizadoEm: l.e.atualizadoEm.toISOString(),
    }));
  }

  async listarHistoricoEtapas(candidaturaId: string): Promise<AsCandidaturaEtapaItem[]> {
    /*
     * OS DOIS JOINS DE VAGA existem para a linha do tempo poder DIZER O NOME das vagas na troca, em
     * vez de mostrar dois identificadores. `leftJoin` nos dois porque as colunas são nulas em todo
     * evento que não é troca, e porque o `ON DELETE SET NULL` permite que a vaga tenha sumido sem o
     * evento sumir junto.
     */
    const vagaDe = alias(vagas, "vaga_de_join");
    const vagaPara = alias(vagas, "vaga_para_join");

    const linhas = await this.db
      .select({
        h: asCandidaturaEtapas,
        autor: usuarios.nome,
        vagaDeNome: vagaDe.nomeDivulgacao,
        vagaDeCodigo: vagaDe.codigo,
        vagaParaNome: vagaPara.nomeDivulgacao,
        vagaParaCodigo: vagaPara.codigo,
      })
      .from(asCandidaturaEtapas)
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturaEtapas.porId))
      .leftJoin(vagaDe, eq(vagaDe.id, asCandidaturaEtapas.vagaDe))
      .leftJoin(vagaPara, eq(vagaPara.id, asCandidaturaEtapas.vagaPara))
      .where(eq(asCandidaturaEtapas.candidaturaId, candidaturaId))
      .orderBy(asCandidaturaEtapas.ocorridoEm);

    const eventos = linhas.map((l) => ({
      id: l.h.id,
      candidaturaId: l.h.candidaturaId,
      etapaDe: l.h.etapaDe,
      etapaPara: l.h.etapaPara,
      situacao: l.h.situacao,
      motivo: l.h.motivo,
      porNome: l.autor,
      /*
       * ─ O LOG DO ACEITE SAI NA RESPOSTA (§A.3 regra 8: permanente E CONSULTÁVEL) ──────────────
       *
       * ERA GRAVA-E-ESQUECE. A consulta acima já seleciona a tabela INTEIRA, então estes três
       * campos sempre chegaram do banco, e este `map` os DESCARTAVA. O aceite existia só para quem
       * abrisse o banco à mão, e "permanente" sem "consultável" cumpre metade da regra.
       *
       * E A TELA JÁ PROMETIA O CONTRÁRIO, com estas palavras: "o aceite fica registrado no
       * histórico desta candidatura". Uma tela que promete trilha e não a exibe é pior do que
       * trilha nenhuma, porque quem confia nela para de conferir.
       *
       * §A.6: sai o NOME DA GUARDA, o LADO e um NÚMERO, e o autor sai do `por_id`, que é usuário
       * interno. Nenhum dado de candidato, nenhum CPF, nenhuma URL. É o mesmo recorte com que o
       * `esteira.service` devolve os aceites de passagem.
       */
      posicaoLado: l.h.posicaoLado,
      aceite: l.h.aceite,
      aceiteNumero: l.h.aceiteNumero,
      vagaDe: l.h.vagaDe,
      vagaPara: l.h.vagaPara,
      // O rótulo cai para o CÓDIGO quando não há nome de divulgação, e para "não informado" (§A.11)
      // quando a vaga foi apagada e o SET NULL levou o ponteiro.
      vagaDeRotulo: l.vagaDeNome ?? l.vagaDeCodigo ?? null,
      vagaParaRotulo: l.vagaParaNome ?? l.vagaParaCodigo ?? null,
      /*
       * ─ O MARCADOR DA REPROVAÇÃO PELO CLIENTE (Frente E, ponto 12) ────────────────────────────
       *
       * `tipo` CONTINUA `MOVIMENTO` quando isto é `true`, e é de propósito: a pessoa volta para a
       * etapa inicial e segue VIVA, então o evento é mesmo um movimento. O que este campo faz é
       * deixar a linha do tempo DIZER a diferença entre "voltou para a Captação" e "o cliente
       * reprovou, e por isso voltou para a Captação", que são dois fatos para quem lê o histórico.
       *
       * ELE SOBREVIVE AO EXPURGO, e essa é a razão de ele existir em vez de se confiar no `motivo`
       * ao lado: a varredura de retenção NULA todo `motivo` desta tabela (§A.6, é texto livre sobre
       * a pessoa), e a contagem "quantos o cliente reprovou" não pode depender de uma frase que
       * desaparece com o tempo. É o mesmo critério que preserva `situacao`, `etapa_para` e `aceite`.
       */
      reprovadoPeloCliente: l.h.reprovadoPeloCliente,
      ocorridoEm: l.h.ocorridoEm,
    }));

    return ordenarLinhaDoTempo(eventos).map((e) => ({
      ...e,
      tipo: tipoDoEvento(e),
      ocorridoEm: e.ocorridoEm.toISOString(),
    }));
  }

  /**
   * O HISTÓRICO da candidatura, do mais recente para o mais antigo pelo que ACONTECEU (`ocorrido_em`),
   * e não pelo que foi digitado: ligação de ontem registrada hoje aparece no lugar dela na linha do
   * tempo, que é o que faz o histórico ser lido como história.
   */
  async listarContatos(candidaturaId: string, apenasId?: string): Promise<AsContatoItem[]> {
    const filtros = [eq(asContatos.candidaturaId, candidaturaId)];
    if (apenasId) filtros.push(eq(asContatos.id, apenasId));

    const linhas = await this.db
      .select({
        c: asContatos,
        autor: usuarios.nome,
      })
      .from(asContatos)
      .leftJoin(usuarios, eq(usuarios.id, asContatos.registradoPorId))
      .where(and(...filtros))
      .orderBy(desc(asContatos.ocorridoEm));

    return linhas.map(({ c, autor }) => ({
      id: c.id,
      candidaturaId: c.candidaturaId,
      tipo: c.tipo,
      resumo: c.resumo,
      ocorridoEm: c.ocorridoEm.toISOString(),
      registradoPorNome: autor,
      criadoEm: c.criadoEm.toISOString(),
    }));
  }

  // ── O PAINEL DA VAGA ──────────────────────────────────────────────────────

  /**
   * A OCUPAÇÃO DE UMA VAGA, calculada na hora, mais quem está nela.
   *
   * ESTA É A LEITURA, e ela NÃO é a trava. A trava conta de novo, dentro da transação e com a linha
   * travada, e é assim de propósito: o número que a tela mostra é uma fotografia de um instante, e
   * decidir a partir de uma fotografia é exatamente o defeito que a trava 4 existe para impedir.
   */
  async painelVaga(vagaId: string): Promise<AsPainelVaga> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    const candidaturas = await this.candidaturasDaVaga(vagaId);

    /*
     * O LADO DE CADA CANDIDATURA VEM DE UMA LEITURA PRÓPRIA, e não da lista acima, porque
     * `AsCandidaturaItem` (o que a tela recebe) não carrega `posicao_lado`: acrescentá-lo ali é
     * mudança de contrato, e o contrato não é deste caminho.
     *
     * A CONSULTA A MAIS CUSTA UMA IDA AO BANCO, e é o painel de UMA vaga, com dezenas de linhas.
     * O caso caro é a LISTAGEM, e lá o lado entrou no `group by` que já existia, sem consulta nova
     * (`vagas.service.ocupacaoPorVaga`).
     *
     * §A.6: duas colunas de processo. Nenhum dado de candidato sai desta consulta.
     */
    const lados = await this.db
      .select({
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
        // A ETAPA ENTRA NA MESMA LEITURA, e não em uma consulta a mais: `AsOcupacaoVaga` passou a
        // carregar a contagem do funil, e o painel entrega o MESMO contrato que a listagem. Uma
        // coluna a mais na projeção não custa ida ao banco nenhuma; devolver o contrato pela metade
        // custaria a fileira de KPIs zerada só nesta tela, que é o tipo de divergência que ninguém
        // percebe porque parece um dia parado.
        etapa: asCandidaturas.etapa,
      })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.vagaId, vagaId));

    const derivada = ocupacaoDaVaga(vaga.posicoesOficiais, lados);

    const ocupacao: AsOcupacaoVaga = {
      vagaId,
      posicoesOficiais: vaga.posicoesOficiais,
      ...derivada,
      // A MESMA LISTA, a segunda régua. Contar aqui de outro jeito seria a cópia que o módulo passou
      // uma frente inteira eliminando.
      ...kpisDoFunil(lados),
    };
    return { ocupacao, candidaturas };
  }

  /**
   * ─ A ABA VER CANDIDATOS, PAGINADA NO SERVIDOR (07/10/2026), IRMA de `painelVaga` ──────────────
   *
   * ┌─ POR QUE UM ENDPOINT NOVO, E NAO MEXER NO `painelVaga` ────────────────────────────────────┐
   * │ `painelVaga` traz TODAS as candidaturas de uma vez (ate 2.509 medidas), e e lido por        │
   * │ `abrirAcao` e pelo `CandidatosDaVagaModal` (modal de visualizacao simples), que dependem    │
   * │ disso. Esta rota e a versao PAGINADA so da aba Ver Candidatos: o servidor devolve a pagina   │
   * │ pedida, com o MESMO recorte que a tela fazia client-side (aba, busca, situacao, etapa).      │
   * │ `painelVaga` fica intacto (§A.26).                                                          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `resumo` (a ocupacao/funil da vaga INTEIRA, nao da pagina) so vem no `offset === 0`, uma vez por
   * filtro, pelo mesmo motivo do `kpis` da Central: contagem do conjunto inteiro nunca sai da pagina.
   * As contagens das abas e o "selecionar todos" da tela se apoiam nele, nunca nas linhas carregadas.
   *
   * §A.6: as candidaturas sao de UMA vaga autorizada, onde `AsCandidaturaItem` ja e permitido. A
   * busca e por NOME e viaja no CORPO (POST), nunca CPF, nunca query string. RBAC: a controller
   * inteira e reivindicada pelo menu `as-candidatos` (`MenuGuard`), igual a `painelVaga`.
   */
  async candidaturasDaVagaPagina(
    vagaId: string,
    dto: CandidaturasDaVagaDto,
  ): Promise<AsCandidaturasDaVagaPagina> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    const limite = Math.min(Math.max(dto.limite ?? BUSCA_LIMITE_PADRAO, 1), BUSCA_LIMITE_MAXIMO);
    const offset = Math.max(dto.offset ?? 0, 0);
    const cond = this.condicoesDaVaga(vagaId, dto);

    const linhas = await this.db
      .select({
        c: asCandidaturas,
        candidatoNome: asCandidatos.nome,
        vagaCodigo: vagas.codigo,
        vagaNome: vagas.nomeDivulgacao,
        autor: usuarios.nome,
        // `count(*) over ()`: o total do recorte INTEIRO, em toda pagina, sem segunda consulta. É o
        // mesmo recurso que o `buscar` da Central usa, e pela mesma razão de não ver bases diferentes.
        total: sql<number>`count(*) over ()`,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturas.alocadoPorId))
      .where(and(...cond))
      .orderBy(...this.ordenacaoDaVaga(dto))
      .limit(limite)
      .offset(offset);

    const total = Number(linhas[0]?.total ?? 0);
    // `l` carrega o `total` a mais, inofensivo: a tipagem estrutural de `candidaturaItemDaLinha`
    // ignora a propriedade excedente, e o campo nao entra no `AsCandidaturaItem` devolvido.
    const itens = linhas.map((l) => candidaturaItemDaLinha(l));
    // O RESUMO SO NA PRIMEIRA PAGINA: a ocupacao/funil da vaga inteira nao muda entre paginas do
    // mesmo filtro, e recalcula-la a cada "carregar mais" seria trabalho repetido.
    const resumo = offset === 0 ? await this.resumoDaVaga(vaga) : undefined;

    return {
      itens,
      total,
      limite,
      offset,
      truncado: offset + itens.length < total,
      ...(resumo ? { resumo } : {}),
    };
  }

  /**
   * ─ OS IDS DAS CANDIDATURAS QUE CASAM O FILTRO, SEM PII (07/10/2026) ───────────────────────────
   *
   * Para a selecao manual de um subconjunto grande sem baixar a tela inteira: a tela marca "todos do
   * filtro" e, quando a acao dispara, pede so os UUIDs. §A.6: devolve EXCLUSIVAMENTE o id da
   * candidatura (UUID), nenhum nome, nenhum CPF, nenhum texto de processo. Mesmo recorte da pagina.
   */
  async idsDaVaga(
    vagaId: string,
    filtro?: { aba?: string; busca?: string; filtroSituacao?: string[]; filtroEtapa?: string[] },
  ): Promise<string[]> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    const cond = this.condicoesDaVaga(vagaId, filtro ?? {});
    const linhas = await this.db
      .select({ id: asCandidaturas.id })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .where(and(...cond));
    return linhas.map((l) => l.id);
  }

  /*
   * O RECORTE DA VAGA, EM UM LUGAR SO: a MESMA régua serve a pagina, o ids-only e o modo-filtro das
   * acoes em massa. Uma régua só evita que as tres divirjam (o defeito que `as-painel-recorte.ts`
   * descreve, de tela contar um e banco contar outro).
   *
   * O tipo do parametro e ESTRUTURAL de proposito: tanto `RecorteDaVagaDto` quanto o alvo das acoes
   * em massa (`AlvoPorFiltroDaVagaDto`) o satisfazem, e os dois precisam da mesma clausula.
   */
  private condicoesDaVaga(
    vagaId: string,
    recorte: { aba?: string; busca?: string; filtroSituacao?: string[]; filtroEtapa?: string[] },
  ): SQL[] {
    const cond: SQL[] = [eq(asCandidaturas.vagaId, vagaId)];

    // `alocados` = quem ENTREGOU posicao (`finalizaPosicao`), a MESMA régua que define a aba na tela.
    // `candidatos` (default) nao restringe situacao: e a lista inteira da vaga.
    if (recorte.aba === "alocados") {
      cond.push(inArray(asCandidaturas.situacao, [...SITUACOES_QUE_FINALIZAM_POSICAO]));
    }

    const busca = recorte.busca?.trim();
    if (busca) {
      // A MESMA expressao da busca por nome da Central: sem acento, sem caixa, com `translate`.
      cond.push(
        sql`translate(lower(${asCandidatos.nome}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
            like ${"%" + semAcento(busca) + "%"}`,
      );
    }

    if (recorte.filtroSituacao && recorte.filtroSituacao.length > 0) {
      // Vocabulario fechado, mas quem casa e a clausula: situacao desconhecida nao acha linha, sem
      // derrubar a chamada. O cast satisfaz o tipo do enum sem travar valor fora da lista.
      cond.push(
        inArray(asCandidaturas.situacao, recorte.filtroSituacao as CandidaturaSituacao[]),
      );
    }

    if (recorte.filtroEtapa && recorte.filtroEtapa.length > 0) {
      const porEtapa = this.condicaoDeEtapaVisivel(recorte.filtroEtapa);
      if (porEtapa) cond.push(porEtapa);
    }

    return cond;
  }

  /*
   * A ETAPA VISIVEL, TRADUZIDA EM CLAUSULA, espelhando `etapaVisivel` do frontend: para quem esta
   * VIVO, a etapa dela; para quem SAIU, o valor especial "fora do funil". Filtrar por "Triagem" so
   * pode alcancar quem a tela MOSTRA em Triagem (vivo), e "fora do funil" alcanca so quem saiu.
   */
  private condicaoDeEtapaVisivel(etapas: string[]): SQL | undefined {
    const partes: SQL[] = [];
    const normais = etapas.filter((e) => e !== ETAPA_FORA_DO_FUNIL);
    if (normais.length > 0) {
      const casa = and(
        inArray(asCandidaturas.etapa, normais),
        inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
      );
      if (casa) partes.push(casa);
    }
    if (etapas.includes(ETAPA_FORA_DO_FUNIL)) {
      partes.push(notInArray(asCandidaturas.situacao, SITUACOES_VIVAS));
    }
    return partes.length > 0 ? or(...partes) : undefined;
  }

  /*
   * A ORDENACAO DA ABA VER CANDIDATOS. A unidade da pagina aqui e CANDIDATURA (sao de UMA vaga), entao
   * etapa e situacao ordenam DIRETO na linha (sem valor representativo). etapa pela `ordem` do
   * catalogo (subselect escalar, sem join, para nao mudar a unidade do `count`/`limit`), situacao por
   * `array_position`. Nulos ao fim, desempate por `id`, ausente = `alocadoEm desc` (a ordem do painel).
   */
  private ordenacaoDaVaga(dto: CandidaturasDaVagaDto): SQL[] {
    const desempate = desc(asCandidaturas.id);
    const dir = dto.direcao === "asc" ? sql`asc` : sql`desc`;
    const ordenar = (expr: SQL) => [sql`${expr} ${dir} nulls last` as SQL, desempate];
    const posicoesSituacao = sql.join(
      CANDIDATURA_SITUACOES.map((s) => sql`${s}`),
      sql`, `,
    );

    switch (dto.ordenarPor) {
      case "candidato":
        return ordenar(sql`${asCandidatos.nome}`);
      case "ultimoContato":
        return ordenar(sql`${asCandidaturas.ultimoContatoEm}`);
      case "etapa":
        return ordenar(
          sql`(select ${asEtapasFunil.ordem} from ${asEtapasFunil} where ${asEtapasFunil.codigo} = ${asCandidaturas.etapa})`,
        );
      case "situacao":
        return ordenar(
          sql`array_position(array[${posicoesSituacao}]::text[], ${asCandidaturas.situacao}::text)`,
        );
      default:
        return [desc(asCandidaturas.alocadoEm), desc(asCandidaturas.id)];
    }
  }

  /*
   * O RESUMO DA VAGA (ocupacao + funil), a MESMA derivacao do `painelVaga`, numa leitura propria para
   * NAO tocar aquele metodo (§A.26). Como ele, nada e armazenado: os numeros saem das candidaturas.
   */
  private async resumoDaVaga(vaga: {
    id: string;
    posicoesOficiais: number | null;
  }): Promise<AsOcupacaoVaga> {
    const lados = await this.db
      .select({
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
        etapa: asCandidaturas.etapa,
      })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.vagaId, vaga.id));

    const derivada = ocupacaoDaVaga(vaga.posicoesOficiais, lados);
    return {
      vagaId: vaga.id,
      posicoesOficiais: vaga.posicoesOficiais,
      ...derivada,
      ...kpisDoFunil(lados),
    };
  }

  /**
   * ─ QUEM PODE SER TRANSFERIDO PARA ESTA VAGA (Frente D, ponto 13, conjunto "b") ─────────────────
   *
   * A ABA "CANDIDATOS DISPONÍVEIS" da Gestão da Vaga tem DOIS conjuntos, e eles respondem a
   * perguntas diferentes:
   *   (a) QUEM ESTÁ SOLTO: a busca com `semCandidatura`, que devolve PESSOAS sem processo vivo.
   *   (b) QUEM JÁ ESTÁ EM OUTRA VAGA e pode ser TRAZIDO para esta, que é o que este método serve.
   *
   * ┌─ POR QUE ELE DEVOLVE CANDIDATURA, E NÃO PESSOA, e isso não é detalhe de tipo ──────────────┐
   * │ O QUE SE TRANSFERE É A CANDIDATURA, nunca a pessoa: é a LINHA que muda de vaga, mantendo a  │
   * │ etapa e o histórico (é isso que `trocarVaga` preserva). Uma lista de pessoas obrigaria a     │
   * │ tela a adivinhar QUAL processo mover de quem tem dois, e adivinhar errado moveria o processo │
   * │ de outra vaga sem ninguém pedir.                                                            │
   * │                                                                                             │
   * │ POR ISSO CADA LINHA JÁ VEM COM A VAGA ATUAL (`vagaId`, `vagaCodigo`, `vagaNome`), a etapa e  │
   * │ a situação: é exatamente o que o consultor precisa ler antes de puxar alguém de outra vaga,  │
   * │ e é o que a tela mostra para a transferência não ser um gesto às cegas.                      │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `trocarVaga` NÃO É DUPLICADO AQUI. Esta é uma LEITURA: ela não decide nada, não trava linha
   * nenhuma e não confere teto. Quem decide continua sendo o `trocarVaga`, dentro da transação, com
   * a vaga de destino travada, e é por isso que uma linha oferecida aqui ainda pode ser recusada lá
   * (a vaga encheu no intervalo). Antecipar aquelas travas nesta leitura seria a segunda cópia da
   * régua, e a cópia é que passaria a mentir quando a de verdade mudasse.
   *
   * O QUE ELE JÁ RECORTA, e são só os dois recortes que NÃO são corrida:
   *   1. SÓ CANDIDATURA VIVA (`SITUACOES_VIVAS`): quem encerrou não tem vaga a corrigir, tem
   *      processo a recomeçar, e para isso existe o "Trazer De Volta". É a mesma trava 4 do
   *      `trocarVaga`, lida da MESMA constante.
   *   2. NEM ESTA VAGA, NEM QUEM JÁ ESTÁ NELA: a linha desta vaga não se transfere para ela mesma, e
   *      a pessoa que já tem processo vivo aqui seria recusada pelo unique parcial
   *      `uq_as_candidaturas_viva`. Oferecer qualquer um dos dois seria propor um gesto que o banco
   *      recusa.
   *
   * §A.6: nenhum CPF, nenhum contato. `candidaturasPor` não seleciona o CPF nem com a tabela do
   * candidato no join, e esta leitura herda exatamente a mesma pobreza.
   */
  async transferiveisPara(vagaId: string): Promise<AsCandidaturaItem[]> {
    const destino = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!destino) throw new NotFoundException("Vaga não encontrada.");

    return this.candidaturasPor(
      and(
        inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
        ne(asCandidaturas.vagaId, vagaId),
        /*
         * A PESSOA QUE JÁ TEM PROCESSO VIVO NESTA VAGA SAI DA LISTA INTEIRA, e a correlação é pelo
         * CANDIDATO (não pela candidatura): quem está ATIVO aqui e ALOCADO na vaga B não pode ter a
         * linha da B trazida para cá, porque o unique parcial recusaria a segunda viva.
         */
        sql`not exists (select 1 from ${asCandidaturas} as viva_aqui
                         where viva_aqui.candidato_id = ${asCandidaturas.candidatoId}
                           and viva_aqui.vaga_id = ${vagaId}::uuid
                           and viva_aqui.situacao in (${sql.join(
                             SITUACOES_VIVAS.map((s) => sql`${s}`),
                             sql`, `,
                           )}))`,
      ),
    );
  }

  // ── LEITURAS INTERNAS ─────────────────────────────────────────────────────

  private async candidatura(id: string): Promise<AsCandidaturaItem> {
    const [item] = await this.candidaturasPor(eq(asCandidaturas.id, id));
    if (!item) throw new NotFoundException("Candidatura não encontrada.");
    return item;
  }

  private candidaturasDoCandidato(candidatoId: string): Promise<AsCandidaturaItem[]> {
    return this.candidaturasPor(eq(asCandidaturas.candidatoId, candidatoId));
  }

  private candidaturasDaVaga(vagaId: string): Promise<AsCandidaturaItem[]> {
    return this.candidaturasPor(eq(asCandidaturas.vagaId, vagaId));
  }

  /**
   * A leitura das candidaturas com a pessoa, a vaga e o autor JÁ RESOLVIDOS em nome, em uma consulta.
   *
   * §A.6: esta consulta NÃO seleciona o CPF, mesmo tendo a tabela do candidato disponível pelo join.
   * O nome basta para a tela da candidatura, e o que não é selecionado não tem como vazar.
   */
  /*
   * O TIPO DO FILTRO É `SQL`, E NÃO MAIS `ReturnType<typeof eq>`: o `and(...)` de que a leitura dos
   * transferíveis precisa devolve `SQL | undefined`, e a assinatura antiga só aceitava a igualdade
   * simples. É alargamento de PARÂMETRO, então nenhuma das três chamadas antigas muda de
   * comportamento: `eq(...)` continua sendo um `SQL`.
   */
  /**
   * AS CANDIDATURAS DAS PESSOAS DESTA PAGINA, em UMA consulta, na projecao MINIMA da lista.
   *
   * ┌─ SEGUNDA CONSULTA, E NUNCA JOIN NA CONSULTA PAGINADA (emenda E-6 do mapa) ────────────────┐
   * │ A busca conta com `count(*) over ()` e corta com `.limit(limite)` sobre LINHAS DE          │
   * │ CANDIDATO. Resolver o funil por JOIN ali troca as duas coisas de uma vez: `total` passa a  │
   * │ contar CANDIDATURAS e o `limite` passa a cortar CANDIDATURAS. Com o maximo medido em        │
   * │ producao, 118 candidaturas numa unica pessoa, uma pagina de 200 poderia entregar DUAS       │
   * │ PESSOAS, e o `truncado` mentiria na direcao contraria a que a Frente D consertou. Pior      │
   * │ ainda com join INTERNO: quem nao tem candidatura nenhuma desapareceria da BUSCA, e quem     │
   * │ procurasse por essa pessoa leria "nenhum candidato encontrado", que e uma resposta sobre a  │
   * │ base, e cadastraria de novo alguem que ja existe.                                           │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NAO E `candidaturasPor`, E A DIFERENCA E DE §A.6, NAO DE REUSO: aquela leitura devolve
   * `AsCandidaturaItem`, que carrega `motivoDescarte` (texto livre do consultor sobre a recusa) e
   * `pretensaoSalarial` (dado financeiro), autorizados para superficies de UMA pessoa ou de UMA
   * vaga. Esta rota e varredura de base, com 200 linhas por carga e cinco leitores. A projecao
   * daqui e a lista FECHADA de `AsCandidaturaNaLista`, e campo novo nela e decisao de §A.6.
   *
   * SEM FILTRO POR STATUS DA VAGA, e isso e deliberado: `vagaCodigo` e `vagaNome` vem da propria
   * consulta justamente porque a lista de `/as/vagas` e filtrada por status. Filtrar aqui apagaria
   * da coluna a vaga encerrada ou em revisao, e trocaria o 429 por uma cegueira mais discreta.
   *
   * O JOIN COM `vagas` E INTERNO de proposito: `vaga_id` e `not null` com FK `restrict`, entao
   * candidatura sem vaga nao existe no banco e um join externo cobriria um caso impossivel.
   */
  private async funilDaPagina(
    ids: string[],
    semCandidatura: boolean,
  ): Promise<Map<string, AsCandidaturaNaLista[]> | null> {
    /*
     * ┌─ QUEM PEDE "SEM CANDIDATURA" NAO RECEBE FUNIL, e o campo nem aparece na resposta ─────────┐
     * │ Tres dos cinco leitores desta rota chamam com `semCandidatura: true` para OFERECER gente   │
     * │ para alocacao, e NENHUM deles mostra coluna de funil. A regra do filtro e a VIVACIDADE,    │
     * │ entao quem aparece para eles pode ter candidatura MORTA: medido em producao, 1.645          │
     * │ candidaturas desceriam, e a consulta extra seria trabalho jogado fora e dado a mais no     │
     * │ navegador de uma superficie que nao o usa (§A.6, minimizacao).                             │
     * │                                                                                            │
     * │ E O CAMPO FICA AUSENTE, em vez de vir `[]`: ali vazio seria uma AFIRMACAO falsa ("esta     │
     * │ pessoa nao esta em vaga nenhuma") sobre quem pode ter candidatura encerrada. Ausente quer   │
     * │ dizer "nao foi pedido", que e o fato.                                                      │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (semCandidatura) return null;

    const funil = new Map<string, AsCandidaturaNaLista[]>();
    // PAGINA VAZIA NAO VAI AO BANCO: `in ()` seria uma consulta garantidamente sem resultado.
    if (ids.length === 0) return funil;

    const linhas = await this.db
      .select({
        id: asCandidaturas.id,
        candidatoId: asCandidaturas.candidatoId,
        vagaId: asCandidaturas.vagaId,
        etapa: asCandidaturas.etapa,
        situacao: asCandidaturas.situacao,
        ultimoContatoEm: asCandidaturas.ultimoContatoEm,
        vagaCodigo: vagas.codigo,
        vagaNome: vagas.nomeDivulgacao,
        /*
         * CLIENTE E CARGO VEM DAQUI, DO MESMO FUNIL, e nao mais do mapa de `/as/vagas` (06/10/2026).
         *
         * ┌─ POR QUE MUDOU DE FONTE ───────────────────────────────────────────────────────────────┐
         * │ A Central de Candidatos cruzava a `vagaId` de cada candidatura contra `GET /as/vagas`    │
         * │ para achar cliente/cargo. A Central de Vagas (05/10) passou a devolver so vaga LIBERADA, │
         * │ entao a vaga em revisao (94% da base) sumiu daquele mapa e o cargo passou a pintar       │
         * │ "nao informado" numa linha que TEM cargo. Trazer os dois do join com `vagas` que ja      │
         * │ monta `vagaNome` desacopla a tela e corrige a regressao de uma vez.                       │
         * └──────────────────────────────────────────────────────────────────────────────────────────┘
         *
         * `leftJoin`, e NAO inner: a vaga em revisao tem `cod_cliente`/`cargo_id` NULOS (o cliente so
         * nasce quando o time libera a vaga), e um inner apagaria a candidatura inteira, trocando a
         * regressao por uma cegueira pior. SEM filtro de status da vaga: o `innerJoin(vagas)` acima
         * ja traz a vaga em revisao, e e ela que interessa aqui.
         *
         * §A.6: cliente (operacao/razao) e cargo sao atributos da VAGA, nao dado pessoal do candidato.
         * `coalesce(nomeOperacao, razaoSocial)` e o mesmo rotulo que o resto do sistema usa.
         */
        clienteNome: sql<
          string | null
        >`coalesce(${clientes.nomeOperacao}, ${clientes.razaoSocial})`,
        cargoNome: cargos.nome,
      })
      .from(asCandidaturas)
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .leftJoin(clientes, eq(clientes.codCliente, vagas.codCliente))
      .leftJoin(cargos, eq(cargos.id, vagas.cargoId))
      .where(inArray(asCandidaturas.candidatoId, ids))
      // A MAIS RECENTE PRIMEIRO, a mesma ordem de `candidaturasPor`: a tela mostra a primeira.
      .orderBy(desc(asCandidaturas.alocadoEm));

    for (const l of linhas) {
      const dela = funil.get(l.candidatoId);
      const item: AsCandidaturaNaLista = {
        id: l.id,
        candidatoId: l.candidatoId,
        vagaId: l.vagaId,
        vagaCodigo: l.vagaCodigo,
        vagaNome: l.vagaNome,
        clienteNome: l.clienteNome,
        cargoNome: l.cargoNome,
        etapa: l.etapa,
        situacao: l.situacao,
        // TEXTO ISO, e nunca o `Date` cru do driver: a tela espera texto, e o erro de um objeto
        // atravessando apareceria so na renderizacao, longe daqui.
        ultimoContatoEm: l.ultimoContatoEm ? l.ultimoContatoEm.toISOString() : null,
      };
      if (dela) dela.push(item);
      else funil.set(l.candidatoId, [item]);
    }

    return funil;
  }

  private async candidaturasPor(filtro: SQL | undefined): Promise<AsCandidaturaItem[]> {
    const linhas = await this.db
      .select({
        c: asCandidaturas,
        candidatoNome: asCandidatos.nome,
        vagaCodigo: vagas.codigo,
        vagaNome: vagas.nomeDivulgacao,
        autor: usuarios.nome,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturas.alocadoPorId))
      .where(filtro)
      .orderBy(desc(asCandidaturas.alocadoEm));

    return linhas.map(({ c, ...l }) => ({
      id: c.id,
      candidatoId: c.candidatoId,
      candidatoNome: l.candidatoNome,
      vagaId: c.vagaId,
      vagaCodigo: l.vagaCodigo,
      vagaNome: l.vagaNome,
      etapa: c.etapa,
      situacao: c.situacao,
      motivoDescarte: c.motivoDescarte,
      alocadoEm: c.alocadoEm.toISOString(),
      alocadoPorNome: l.autor,
      atualizadoEm: c.atualizadoEm.toISOString(),
      // O CARIMBO DESNORMALIZADO, e é ele que mata o N+1: a alternativa seria um `max(ocorrido_em)`
      // de `as_contatos` POR LINHA, e com 200 linhas na tela isso é uma consulta por linha.
      ultimoContatoEm: c.ultimoContatoEm ? c.ultimoContatoEm.toISOString() : null,
      /*
       * ┌─ O LADO DA POSIÇÃO SOBE CRU, e o "cru" é a parte que importa ──────────────────────────┐
       * │ A COLUNA VAI COMO ESTÁ NO BANCO, e NÃO por `ladoDaCandidatura()`. Aquele helper existe  │
       * │ para a GRAVAÇÃO e coalesce nulo para OFICIAL, porque toda candidatura antiga foi        │
       * │ aprovada contra a meta oficial, que era a única que a trava conhecia.                    │
       * │                                                                                         │
       * │ NA LEITURA, coalescer seria MENTIR: quem está no funil sem ocupar posição nenhuma        │
       * │ apareceria como ocupante do lado oficial, e a lista de alocados passaria a mostrar como  │
       * │ entregue quem não entregou nada. Nulo aqui quer dizer "não ocupa posição", que é         │
       * │ diferente de "ocupa a oficial".                                                          │
       * │                                                                                         │
       * │ E NINGUÉM CONTA META POR AQUI: quem conta é a SITUAÇÃO, pela régua de ocupação. Este     │
       * │ campo é para a tela DIZER de que lado a pessoa está, nunca para somar.                   │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       */
      posicaoLado: ladoGravado(c.posicaoLado),
      /*
       * ─ A PRETENSÃO SALARIAL SOBE CRU (Frente E, ponto 9) ──────────────────────────────────────
       *
       * `numeric` VIAJA COMO STRING, e é assim que o driver o entrega: converter para `number` aqui
       * passaria dinheiro por ponto flutuante, que é o erro que `salarioAbertura` e o salário da
       * admissão já evitam da mesma forma. Quem formata é a tela.
       *
       * §A.6, E O RECORTE FOI CONFERIDO ANTES DE SUBIR: esta função serve a FICHA de uma pessoa, as
       * candidaturas de UMA vaga e os transferíveis de UMA vaga. A BUSCA da Central de Candidatos
       * NÃO passa por aqui (ela devolve `AsCandidatoListItem`, que reduz até o CPF a um booleano),
       * então o valor não desce em carga de listagem, que foi exatamente o defeito corrigido no
       * `substituidoCpf` em 22/09. Nulo é o normal: só quem foi descartado por um motivo marcado
       * `pedePretensao` tem valor aqui.
       */
      pretensaoSalarial: c.pretensaoSalarial,
    }));
  }

  // ── HIGIENE ───────────────────────────────────────────────────────────────

  /**
   * CPF normalizado, ou `null` quando não veio. Vazio é caso NORMAL aqui (a pessoa ainda não deu o
   * número), mas CPF PREENCHIDO E INVÁLIDO é erro: gravar onze dígitos quaisquer faria o dedup casar
   * a identidade errada, que é pior do que não casar.
   *
   * O VALIDADOR É O DO SHARED-TYPES (`isValidCpf`), o mesmo do resto do sistema. Não existe um
   * segundo validador de CPF neste módulo, e não deve existir: dois validadores divergem.
   *
   * §A.6: a mensagem NÃO REPETE O NÚMERO recebido, senão o dado pessoal viajaria na resposta de erro
   * e, dali, para qualquer log de cliente HTTP.
   */
  private cpfOuNulo(bruto?: string | null): string | null {
    const cpf = normalizeCpf(bruto ?? "");
    if (!cpf) return null;
    if (!isValidCpf(cpf)) {
      throw new BadRequestException("O CPF não confere. Confira os dígitos e informe de novo.");
    }
    return cpf;
  }

  /**
   * O CONFLITO DE CPF, com o `candidatoId` de quem já está cadastrado para a tela poder oferecer
   * "abrir o cadastro existente" em vez de deixar a pessoa procurando.
   *
   * ┌─ O NOME SAIU DAQUI, E ELE ERA UM ORÁCULO DE CPF PARA NOME (§A.6) ──────────────────────────┐
   * │ A frase dizia "Já existe um candidato cadastrado com este CPF: FULANO DE TAL". Ela cumpria │
   * │ a letra da régua (não repetia o número) e violava o propósito dela: quem SUBMETE um CPF    │
   * │ recebia de volta o NOME de quem o tem. Não é preciso ter acesso a ficha nenhuma para       │
   * │ perguntar, e o caminho é aberto pelas DUAS portas (`criar` e `editar`), então qualquer     │
   * │ usuário autenticado podia converter uma lista de CPFs numa lista de nomes, um a um, sem    │
   * │ nunca abrir uma tela. É a consulta de dado pessoal de terceiro por tentativa, e ela não    │
   * │ deixa rastro de leitura em lugar nenhum.                                                    │
   * │                                                                                             │
   * │ O QUE A TELA PRECISA É O ID, E SÓ ELE: é com o `candidatoId` que ela oferece "abrir o       │
   * │ cadastro existente", e quem abrir a ficha vê o nome LÁ, passando pelo controle de acesso da │
   * │ ficha, que é onde essa decisão pertence. O 409 deixa de ser uma porta paralela de leitura.  │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: nem NOME nem CPF. A frase mais natural de escrever aqui seria "o CPF 123.456.789-01 já
   * está cadastrado", e ela colocaria o número na resposta de erro, que é o lugar de onde ele mais
   * facilmente cai num log de cliente HTTP.
   *
   * A FRASE FICOU IGUAL À DO `traduzirUnique` NA PRIMEIRA METADE, e isso é bom: as duas camadas do
   * dedup (esta consulta e o unique do banco) passam a dizer a mesma coisa à pessoa, que é o que
   * elas sempre significaram.
   */
  private conflitoDeCpf(candidatoId: string): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: "Conflict",
      message:
        "Já existe um candidato cadastrado com este CPF. Abra o cadastro dele em vez de criar outro.",
      candidatoId,
    });
  }

  /**
   * A RECUSA DA PRIMEIRA TENTATIVA DE REENTRADA, com o que o consultor precisa para decidir.
   *
   * `needsConfirmation: true`, E A SIMETRIA COM A TRAVA DE ENCERRAMENTO DA VAGA É DE PROPÓSITO: lá o
   * campo é `false`, porque não existe "confirmar mesmo assim" (a vaga não fecha com gente em seleção
   * dentro). Aqui é `true`, porque existe. O campo diz a verdade sobre o que a tela pode oferecer, e
   * é por isso que ele não é sempre `true` nem sempre `false`.
   *
   * A MENSAGEM DIZ QUANDO E COMO, e não só "esta pessoa já esteve aqui". Descartada há uma semana por
   * perfil não aderente e desistente de seis meses atrás são decisões diferentes, e quem decide é o
   * consultor: sem a data e o motivo na frente dele, o aviso vira um clique automático.
   *
   * O CARIMBO É `atualizado_em` DA CANDIDATURA ANTERIOR, que é o momento em que a saída foi
   * registrada. Não existe coluna própria de "encerrada em" nesta tabela, e criar uma não estava no
   * pedido: quando existir, é só ela que muda de lugar aqui.
   *
   * §A.6: situação, data e motivo. SEM CPF, sem e-mail, sem telefone. O motivo é texto do PROCESSO
   * ("perfil não aderente"), escrito no descarte, e não ficha da pessoa.
   */
  private reentradaPrecisaCiencia(anterior: {
    situacao: CandidaturaSituacao;
    motivo: string | null;
    encerradaEm: Date | null;
  }): ConflictException {
    const situacao = anterior.situacao as AsCandidaturaEncerrada["situacao"];
    const quando = anterior.encerradaEm ? dataBr(anterior.encerradaEm) : null;

    const comoEQuando =
      situacao === "DESISTIU"
        ? `desistiu desta vaga${quando ? ` em ${quando}` : ""}`
        : `foi descartada desta vaga${quando ? ` em ${quando}` : ""}`;
    // PONTUAÇÃO FINAL DO MOTIVO REMOVIDA antes de emendar a frase: o motivo é texto livre digitado no
    // descarte e costuma terminar em ponto, o que produzia "próxima abertura.. A reentrada".
    const motivo = anterior.motivo?.replace(/[.;,\s]+$/, "") ?? null;
    const porque = motivo ? `, com o motivo registrado: ${motivo}` : ", sem motivo registrado";

    const corpo: AsReentradaPrecisaCiencia = {
      needsConfirmation: true,
      reason: "reentradaAposEncerramento",
      message:
        `Esta pessoa já ${comoEQuando}${porque}. ` +
        "A reentrada é permitida e o processo anterior fica no histórico. " +
        "Confirme que está ciente para alocar de novo.",
      anterior: {
        situacao,
        encerradaEm: anterior.encerradaEm ? anterior.encerradaEm.toISOString() : null,
        motivo: anterior.motivo,
      },
    };

    return new ConflictException(corpo);
  }

  /**
   * O AVISO DE ALOCAR NO BANCO COM POSIÇÃO OFICIAL AINDA ABERTA.
   *
   * `needsConfirmation: true`, e a simetria com o aviso de reentrada logo acima é de propósito: a
   * tela lê o mesmo campo para saber se pode oferecer "confirmar mesmo assim". Aqui é `true` porque
   * existe confirmação; na trava de encerramento da vaga é `false`, porque lá não existe. O campo
   * diz a verdade sobre o que a tela pode oferecer, e é por isso que ele não é sempre um dos dois.
   *
   * A FRASE DIZ O NÚMERO, e não só "ainda há posição oficial aberta": sobrar UMA posição e sobrarem
   * DOZE são decisões diferentes, e sem o número na frente o aviso vira clique automático. É a mesma
   * razão de o aviso de reentrada trazer a data e o motivo.
   *
   * §A.6: um número de posições da vaga e mais nada. Nenhum dado de candidato entra aqui.
   */
  private bancoComOficiaisAbertas(abertas: number): ConflictException {
    const quantas =
      abertas === 1 ? "1 posição oficial aberta" : `${abertas} posições oficiais abertas`;
    return new ConflictException({
      needsConfirmation: true,
      reason: "bancoComOficiaisAbertas",
      message:
        `Esta vaga ainda tem ${quantas}. ` +
        "Alocar no banco deixa a posição oficial em aberto. " +
        "Confirme que é isso mesmo que você quer.",
      oficiaisAbertas: abertas,
    });
  }

  /**
   * A VIOLAÇÃO DE UNIQUE virando frase de gente. É o que faz a corrida entre dois cliques chegar na
   * tela como explicação, e não como erro 500.
   *
   * §A.6: a mensagem do Postgres NÃO é repassada. Ela traz o VALOR que violou o índice (o CPF, no
   * caso de `uq_as_candidatos_cpf`), e repassá-la publicaria o número na resposta de erro.
   */
  private traduzirUnique(err: unknown): Error {
    const nome = String((err as { constraint_name?: string })?.constraint_name ?? "");
    if (nome === "uq_as_candidatos_cpf") {
      return new ConflictException(
        "Já existe um candidato cadastrado com este CPF. Recarregue a página e procure por ele.",
      );
    }
    // A FRASE CONTINUA CORRETA depois da troca pelo unique PARCIAL: o índice só existe para as
    // situações VIVAS, então violá-lo quer dizer exatamente que a pessoa JÁ ESTÁ na vaga, e não que
    // ela um dia esteve. O caso do "esteve" nunca chega aqui: ele é decidido antes, com o aviso.
    if (nome === "uq_as_candidaturas_viva") {
      return new ConflictException("Esta pessoa já está nesta vaga.");
    }
    /*
     * OS DOIS UNIQUES DO IDENTIFICADOR DO ATS SAÍRAM DAQUI porque as COLUNAS saíram (migration
     * 0112): identidade externa tem um dono só dentro do módulo A&S, `as_identidades_externas`.
     * Traduzir uma restrição que não existe mais seria manter uma frase que ninguém pode ver.
     */
    return err instanceof Error ? err : new Error("Falha ao gravar.");
  }
}

/**
 * A DATA COMO O CONSULTOR LÊ, no fuso de São Paulo.
 *
 * FUSO EXPLÍCITO, e não o do processo: o backend roda em UTC, e "25/08 às 21h" viraria 26/08 na
 * frase. Um dia de diferença no aviso muda a leitura de "foi ontem" para "foi anteontem".
 */
function dataBr(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Texto opcional: em branco é ausência, não string vazia gravada no banco. */
function texto(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Minúsculas sem acento, para a busca por nome casar "joao" com "João". */
function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * UMA LINHA DE CANDIDATURA VIRANDO `AsCandidaturaItem`, no MESMO formato de `candidaturasPor`.
 *
 * Ela existe para a aba Ver Candidatos paginada reusar o mapeamento sem TOCAR `candidaturasPor`
 * (\u00a7A.26, c\u00f3digo validado): aquele m\u00e9todo segue com o map inline dele, e esta fun\u00e7\u00e3o serve o
 * caminho novo. A r\u00e9gua de cada campo \u00e9 a mesma, inclusive o `posicaoLado` CRU por `ladoGravado`
 * (nulo quer dizer "n\u00e3o ocupa posi\u00e7\u00e3o", nunca "oficial por omiss\u00e3o") e a pretens\u00e3o como string.
 *
 * \u00a7A.6: a fun\u00e7\u00e3o s\u00f3 repassa o que a consulta j\u00e1 selecionou. Ela n\u00e3o vai ao banco e n\u00e3o seleciona
 * CPF; a superf\u00edcie de UMA vaga \u00e9 onde `AsCandidaturaItem` j\u00e1 \u00e9 autorizado.
 */
function candidaturaItemDaLinha(l: {
  c: typeof asCandidaturas.$inferSelect;
  candidatoNome: string;
  vagaCodigo: string | null;
  vagaNome: string | null;
  autor: string | null;
}): AsCandidaturaItem {
  const c = l.c;
  return {
    id: c.id,
    candidatoId: c.candidatoId,
    candidatoNome: l.candidatoNome,
    vagaId: c.vagaId,
    vagaCodigo: l.vagaCodigo,
    vagaNome: l.vagaNome,
    etapa: c.etapa,
    situacao: c.situacao,
    motivoDescarte: c.motivoDescarte,
    alocadoEm: c.alocadoEm.toISOString(),
    alocadoPorNome: l.autor,
    atualizadoEm: c.atualizadoEm.toISOString(),
    ultimoContatoEm: c.ultimoContatoEm ? c.ultimoContatoEm.toISOString() : null,
    posicaoLado: ladoGravado(c.posicaoLado),
    pretensaoSalarial: c.pretensaoSalarial,
  };
}
