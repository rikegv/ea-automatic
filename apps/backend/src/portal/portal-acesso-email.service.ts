import { createHmac } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerStorage } from "@nestjs/throttler";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import {
  MOTIVOS_DA_TRAVA_DE_ACESSO,
  isValidCpf,
  normalizeCpf,
  type ConfirmacaoDeCodigoResposta,
  type IdentidadeDoAcessoResposta,
  type MotivoDaTravaDeAcesso,
  type SolicitacaoDeCodigoResposta,
  type TravaDeAcessoItem,
} from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  asCandidatos,
  asCandidaturas,
  portalAcessoCodigos,
  portalAcessoTravas,
  portalLinks,
  usuarios,
} from "../db/schema";
import {
  CODIGO_TENTATIVAS_LIMITE,
  CODIGO_TTL_MS,
  SOLICITACAO_JANELA_DIA_MS,
  SOLICITACAO_JANELA_MS,
  SOLICITACOES_POR_DIA,
  SOLICITACOES_POR_HORA,
  codigosIguais,
  decisaoDaIdentidade,
  divergencias,
  gerarCodigo,
  hashDoCodigo,
  hashDoEmail,
  normalizarEmail,
} from "../domain/portal-acesso-email";
import { corpoDoEmailDoCodigo } from "../domain/portal-envio";
import type { PortalMotivo } from "../domain/portal-evento";
import { AdmissoesService } from "../admissoes/admissoes.service";
import { FAROIS_FORA_DO_PAINEL } from "./portal-painel.service";
import { PortalCorreioService } from "./portal-correio.service";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * ══ A PORTA DE E-MAIL DO PORTAL ════════════════════════════════════════════════════════════════
 *
 * Contrato NORMATIVO: `docs/CONTRATO-PORTAL-ACESSO-EMAIL.md` (v2). Medição:
 * `docs/MAPA-ALCANCE-PORTAL-ACESSO-POR-EMAIL.md`. A régua pura está em
 * `domain/portal-acesso-email.ts`, e é lá que a precedência da decisão é provada.
 *
 * ┌─ ELA NÃO EMITE SESSÃO E NÃO ABRE O PORTAL. É ISSO QUE A DISTINGUE DA v1, QUE FOI VETADA ────┐
 * │ Ela prova a posse da CAIXA e, com isso, dispara o envio do LINK para aquela mesma caixa. A    │
 * │ chave de acesso continua sendo link + CPF + nascimento em `POST portal/identificar`, byte a   │
 * │ byte como antes. Nada aqui chama `cunharSessao`, e nada aqui insere em `portal_links`.        │
 * │                                                                                             │
 * │ A v1 ABRIA O PORTAL achando a admissão PELO CPF DIGITADO, e a auditoria provou a tomada de    │
 * │ conta: candidato sem CPF tem `cpf` NULO, nulo não discorda de nada, então a trava de           │
 * │ divergência era VAZIA justamente na população que a porta existe para atender. Quem tivesse a │
 * │ caixa de um candidato do funil digitava o CPF DE UM TERCEIRO e abria o prontuário dele.       │
 * │                                                                                             │
 * │ A CORREÇÃO É ESTRUTURAL, e está em `admissaoVivaDoCandidato`: a admissão vem do VÍNCULO do    │
 * │ registro (`as_candidaturas.admissao_id`), e NÃO EXISTE, em lugar nenhum deste arquivo, um     │
 * │ `select` de admissão ou de candidato por igualdade de CPF vindo do CORPO. O pior caso deixa   │
 * │ de ser "abro o prontuário de um terceiro" e passa a ser "escrevo um CPF errado na ficha de    │
 * │ funil de quem eu já tenho a caixa", que o time ainda tem de acatar.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A RESPOSTA DE `solicitar` É ÚNICA, BYTE A BYTE, e é a primeira linha do método ────────────┐
 * │ E-mail existente, inexistente, ambíguo, travado ou anonimizado devolvem o MESMO objeto. Ela  │
 * │ é calculada ANTES de qualquer consulta, molde de `recuperacao`                                │
 * │ (`portal-identidade.service.ts:1260`), para que nenhum caminho novo tenha por onde devolver   │
 * │ outra coisa: quem acrescentar um ramo amanhã vai ter de devolver `resposta`, porque não há    │
 * │ outro objeto ali para devolver.                                                               │
 * │                                                                                             │
 * │ E-MAIL NÃO É CHAVE DE IDENTIDADE, medido em produção: 6 endereços compartilhados por 12 CPFs, │
 * │ 5 deles com DOIS NOMES diferentes. Por isso ambíguo TRAVA em vez de escolher um, e por isso a │
 * │ confirmação do código não devolve NADA da pessoa, nem o nome mascarado (proibição O10).       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: este serviço NÃO loga e-mail, NÃO loga CPF, NÃO loga o código e NÃO loga a URL do link. O
 * `Logger` daqui escreve rótulo fixo e código de catálogo, nada mais. A trilha passa inteira por
 * `PortalTrilhaService`, que reduz por allowlist, e `candidato_hash` só é alimentado no ÚNICO ponto
 * onde existe CPF verificado (`PORTAL_IDENTIDADE_GRAVADA`).
 */

/**
 * O EXECUTOR DE CONSULTA: a conexão OU a transação, no mesmo apelido que `as/vagas`, `esteira` e
 * `admissoes` já usam. A transação do Drizzle NÃO é um `Database` (falta-lhe o `$client`), então sem
 * este tipo os métodos que servem aos dois lados só compilariam duplicados.
 */
type DbTransacao = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | DbTransacao;

/** Mensagem única de portal sem configuração. Mesma frase do `emitirComTrava`, e pelo mesmo motivo. */
const PORTAL_INDISPONIVEL = "Portal indisponível";

/**
 * A RECUSA, UMA SÓ, PARA TUDO (exigência O5 da auditoria: só dois desfechos de erro nesta porta).
 *
 * Código errado, código vencido, bilhete morto, CPF com dígito inválido, ficha anonimizada e trava
 * ativa devolvem ESTA frase, com ESTE corpo e ESTE status. Distinguir qualquer um deles contaria a
 * quem tenta algo sobre o nosso cadastro: que o e-mail existe, que o CPF confere, que a data bateu,
 * ou que aquela pessoa está sob disputa. O outro desfecho é o 503 de porta não configurada, que não
 * depende do que foi digitado e por isso não informa nada sobre ninguém.
 *
 * §A.11: sem travessão.
 */
const ACESSO_RECUSADO =
  "Não foi possível continuar. Confira os dados e tente de novo, ou procure o seu contato do RH.";

/**
 * ══ PRAZO DO BILHETE: A MESMA COLUNA `expira_em`, REESCRITA NA CONFIRMAÇÃO ═════════════════════
 *
 * O código vale 10 minutos porque esse é o tempo de a mensagem chegar e a pessoa digitar. Mas o passo
 * seguinte pede CPF e data de nascimento: amarrado ao MESMO relógio da emissão, quem confirmasse no
 * nono minuto teria sessenta segundos para achar o documento no celular, estouraria o prazo no meio
 * do formulário, e pediria outro código, gastando o teto de 3 por hora. Um acerto viraria três
 * tentativas.
 *
 * ┌─ POR QUE ESTENDER A MESMA COLUNA É SEGURO, e isto parece frouxo e não é ────────────────────┐
 * │ No instante da confirmação, `confirmado_em` JÁ está carimbado, e linha confirmada NÃO VOLTA a │
 * │ servir de código: a conferência do código exige `confirmado_em is null`. Então, depois da      │
 * │ confirmação, aquela coluna deixou de ser o prazo de um SEGREDO ADIVINHÁVEL de 6 dígitos e      │
 * │ passou a ser o prazo de um IDENTIFICADOR OPACO de 122 bits. São dois regimes de risco na vida  │
 * │ da MESMA linha, e é por isso que o número pode mudar sem afrouxar nada.                        │
 * │                                                                                             │
 * │ A TRAVA DE VERDADE CONTINUA SENDO A CONFERÊNCIA DE ESTADO, e ela é feita na MESMA consulta do │
 * │ passo da identidade: `confirmado_em is not null` E `invalidado_em is null` E `expira_em > now`.│
 * │ Faltando qualquer um dos três, estender o prazo seria mesmo um afrouxamento.                   │
 * │                                                                                             │
 * │ NENHUMA COLUNA NOVA E NENHUM SEGUNDO RELÓGIO: dois prazos para a mesma linha divergiriam no    │
 * │ primeiro ajuste, e o que sobraria valendo seria o mais frouxo dos dois.                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Fica em CONSTANTE DE CÓDIGO e não em variável de ambiente: prazo de credencial configurável é
 * prazo que alguém aumenta para "resolver" um suporte, e o contrato não o abriu.
 */
const BILHETE_TTL_MS = 15 * 60_000;
const BILHETE_TTL_MINUTOS = Math.round(BILHETE_TTL_MS / 60_000);

/**
 * TETO DE CANDIDATOS TRAVADOS POR E-MAIL AMBÍGUO.
 *
 * A ambiguidade é fato do dado, não gesto de quem chama, e travar TODOS os envolvidos é o que a
 * seção 5 do contrato pede (escolher um seria escolher a identidade de alguém). O teto existe para
 * o caso patológico: um endereço genérico de RH de cliente colado em duzentas fichas viraria
 * duzentas linhas de fila num único POST. Vinte é fila de trabalho; duzentas é despejo.
 */
const TRAVA_AMBIGUO_TETO = 20;

/** Formato de UUID, conferido ANTES de virar `where id = $1` numa rota PÚBLICA. Ver `identidade`. */
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O balde barato, em memória, que cobre o e-mail que não resolve para ninguém. Ver `solicitar`. */
const BALDE_SOLICITACAO = "portal-acesso-email";

/**
 * O BALDE DO PASSO DA IDENTIDADE (condição 4 da auditoria de código).
 *
 * `solicitar` tem dois baldes e `confirmar` tem o contador de 5 por código, mas `identidade` não
 * tinha nada: cada POST com um UUID bem formado ao acaso gastava a trava do Postgres, quatro
 * consultas e UM INSERT NA TRILHA. Não quebra confidencialidade (adivinhar o bilhete é 2^122), mas é
 * amplificação de log numa rota PÚBLICA, e quem enche a trilha apaga o sinal que ela existe para dar.
 *
 * A CHAVE É O HASH DO BILHETE, NUNCA O BILHETE CRU: o bilhete é credencial, e credencial não vira
 * chave de armazenamento compartilhado (o `ThrottlerStorage` guarda as chaves em memória e elas
 * aparecem em despejo de diagnóstico). Mesmo molde dos baldes de `portal-identidade.service.ts`, que
 * chaveiam pelo HASH do token e nunca pelo valor declarado.
 *
 * VINTE POR QUINZE MINUTOS, que é a janela do próprio bilhete: quem tem um bilhete de verdade erra o
 * CPF ou a data poucas vezes antes de travar por divergência, então vinte é folga larga para gente
 * de verdade e teto apertado para varredura.
 */
const BALDE_IDENTIDADE = "portal-acesso-identidade";
const IDENTIDADE_POR_JANELA = 20;

export interface FiltrosDaFilaDeTravas {
  /** Multiselect (§A.28). Vazio é "todos os motivos". */
  motivos?: string[];
  /** `ABERTA`, `DESTRAVADA` ou vazio para todas. */
  situacao?: string | null;
  /** Busca por PEDAÇO do nome do candidato do funil. Nunca por CPF, nunca por e-mail. */
  nome?: string | null;
}

@Injectable()
export class PortalAcessoEmailService {
  private readonly log = new Logger(PortalAcessoEmailService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly trilha: PortalTrilhaService,
    private readonly correio: PortalCorreioService,
    /**
     * O ENVIO DO LINK É REUSADO, E NÃO REESCRITO. `PortalEnvioService` já tem o recorte de farol
     * ESTRUTURAL dentro de `emitirComTrava`, a abstenção S15 (link vivo JÁ ABERTO não é reemitido,
     * sob pena de derrubar a sessão de quem está enviando documento naquele instante), a inércia
     * fail-closed do correio e a revogação compensatória quando o e-mail não sai. Um segundo
     * caminho de emissão aqui dentro perderia os quatro, e o primeiro a se perder seria a abstenção,
     * que é a que protege o candidato que já está do lado de dentro.
     */
    private readonly envio: PortalEnvioService,
    @Inject(ThrottlerStorage) private readonly throttle: ThrottlerStorage,
    /*
     * A PONTE DO CPF PENDENTE. Quando o candidato entra por e-mail e grava o CPF REAL, a admissão que
     * nasceu com marcador PROV (envio A&S sem CPF) é reapontada por `corrigirCpf`, reusado AQUI por
     * dentro (ator SISTEMA, sem a guarda Master do controller). `forwardRef` porque o `AdmissoesModule`
     * importa este módulo de volta (a liberação entrega o link). §A.38: rota pública que alcança CPF,
     * re-auditoria do `seguranca` obrigatória antes do deploy.
     */
    @Inject(forwardRef(() => AdmissoesService)) private readonly admissoes: AdmissoesService,
  ) {}

  // ══ CONFIGURAÇÃO: A PORTA NASCE INERTE ══════════════════════════════════════════════════════

  /**
   * O SEGREDO DO CÓDIGO, VARIÁVEL PRÓPRIA (`PORTAL_CODIGO_PEPPER`), e JAMAIS o da trilha.
   *
   * `PORTAL_LOG_PEPPER` deriva `candidato_hash` a partir do CPF, e a trilha é lida por gente do
   * time. Com o segredo compartilhado, quem enxerga um dos dois deriva o outro, e o sentido que
   * importa é o que parece inofensivo: com o pepper da trilha em mãos, um milhão de HMACs revela o
   * código vivo de qualquer pessoa. São 10^6 valores, então isto é um laço, não uma quebra.
   */
  private pepperDoCodigo(): string {
    return (this.config.get<string>("PORTAL_CODIGO_PEPPER") ?? "").trim();
  }

  /**
   * FAIL-CLOSED, molde de `emitirComTrava` (`portal-identidade.service.ts:430-437`).
   *
   * TRÊS exigências, e a falta de qualquer uma responde 503 ANTES de qualquer consulta:
   *  - `PORTAL_CODIGO_PEPPER`: sem ele o HMAC teria chave vazia, e a coluna "hasheada" voltaria a
   *    ser percorrível em um segundo. Não há fallback, e não pode haver;
   *  - `PORTAL_LOG_PEPPER`: sem ele a TRILHA não grava (`PortalTrilhaService.pepperObrigatorio`
   *    lança), e porta de acesso que não consegue registrar não deve conceder nada;
   *  - o CORREIO: sem ele o código não tem como chegar ao candidato. Emitir código que ninguém
   *    recebe deixaria uma credencial viva sem dono, que é o mesmo erro que a emissão de link se
   *    recusa a cometer.
   *
   * O 503 NÃO É ORÁCULO: ele não depende do que foi digitado, então responde igual para todo mundo,
   * inclusive para quem não digitou nada.
   */
  private exigirConfiguracao(): void {
    if (this.pepperDoCodigo() && this.trilha.configurada() && this.correio.configurado()) return;
    // §A.6: nenhuma variável é nomeada aqui, e nenhum valor é logado. Quem diagnostica usa
    // `PortalCorreioService.descrever`, que diz "ligado ou não" sem revelar conta, caixa nem chave.
    this.log.warn("porta de e-mail do portal recusada: pepper do codigo, pepper da trilha ou correio ausentes");
    throw new ServiceUnavailableException(PORTAL_INDISPONIVEL);
  }

  /** A recusa, uma só. Corpo com `mensagem` porque o cliente do frontend reescreve o `message` do 401. */
  private recusa(): UnauthorizedException {
    return new UnauthorizedException({ mensagem: ACESSO_RECUSADO, message: ACESSO_RECUSADO });
  }

  // ══ PASSO 1: SOLICITAR O CÓDIGO ═════════════════════════════════════════════════════════════

  /**
   * `POST portal/acesso-email/solicitar`. Resposta ÚNICA, sempre idêntica.
   *
   * ┌─ OS DOIS BALDES, E ELES NÃO SÃO REDUNDANTES ────────────────────────────────────────────────┐
   * │ (a) O BALDE EM MEMÓRIA (`ThrottlerStorage`), chaveado pelo HASH do e-mail, cobre o endereço  │
   * │     que NÃO RESOLVE para ninguém: ali nenhuma linha é criada, então uma contagem feita só na │
   * │     tabela daria orçamento infinito a quem varre endereços, e a trilha viraria o depósito.   │
   * │ (b) A CONTAGEM NA TABELA é a AUTORITATIVA dos 3 por hora e 10 por dia, porque ela sobrevive  │
   * │     a reinício. O balde de memória zera quando o processo cai, e um teto de mail bombing que │
   * │     zera no deploy não é teto.                                                               │
   * │                                                                                             │
   * │ RESÍDUO ACEITO E DECLARADO, na família do que a `recuperacao` já documenta: a chave do balde │
   * │ é ESCOLHIDA POR QUEM CHAMA (é o próprio endereço digitado), então alguém enche o balde do    │
   * │ e-mail de um terceiro e o silencia por uma hora. É exatamente o que o teto existe para fazer │
   * │ (limitar mensagens para aquela caixa), e a saída da vítima é o RH mandar o link à mão, que é  │
   * │ o caminho que já funciona hoje. Não há como fazer melhor sem uma credencial que quem está    │
   * │ tentando entrar, por definição, não tem.                                                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async solicitar(entrada: {
    email?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<SolicitacaoDeCodigoResposta> {
    // O DESFECHO É UM SÓ, E ELE É CALCULADO NA PRIMEIRA LINHA: ver o cabeçalho da classe. Fica aqui
    // para que nenhum caminho novo tenha por onde devolver outra coisa.
    const resposta: SolicitacaoDeCodigoResposta = {
      enviado: true,
      expiraEmMinutos: Math.round(CODIGO_TTL_MS / 60_000),
    };

    this.exigirConfiguracao();

    const email = normalizarEmail(entrada.email ?? "");
    // Endereço vazio ou sem `@` não resolve nada e não merece consulta. NÃO vira linha de trilha:
    // "alguém pediu código para um texto que não é e-mail" não localiza pessoa nenhuma, e é a
    // matéria-prima mais barata para inflar o log.
    if (!email.includes("@") || email.length < 5) return resposta;

    const segredo = this.pepperDoCodigo();
    const emailHash = hashDoEmail(email, segredo);
    const contexto = { ip: entrada.ip ?? null, userAgent: entrada.userAgent ?? null };

    // (a) O balde barato, ANTES de tocar o banco.
    const balde = await this.throttle.increment(
      `${BALDE_SOLICITACAO}:${emailHash}`,
      SOLICITACAO_JANELA_MS,
      SOLICITACOES_POR_HORA,
      SOLICITACAO_JANELA_MS,
      BALDE_SOLICITACAO,
    );
    if (balde?.isBlocked) {
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "ACESSO_EMAIL_TETO",
        janela: "HORA",
      });
      return resposta;
    }

    await this.registrar("PORTAL_ACESSO_EMAIL_SOLICITADO", contexto, {});

    // (b) A contagem durável, nas duas janelas.
    if (await this.tetoDeSolicitacoesEstourado(emailHash, contexto)) return resposta;

    /*
     * A RESOLUÇÃO, E ELA É POR E-MAIL DA FICHA DO FUNIL, NUNCA POR CPF.
     *
     * `anonimizado_em is null` no filtro, e não depois: ficha expurgada não é candidata a nada, e
     * lê-la para descartar depois é ler dado que a LGPD manda esquecer. Ela cai no mesmo silêncio do
     * e-mail inexistente, que é o desfecho certo.
     */
    const candidatos = await this.db
      .select({ id: asCandidatos.id })
      .from(asCandidatos)
      .where(
        and(
          sql`lower(trim(${asCandidatos.email})) = ${email}`,
          isNull(asCandidatos.anonimizadoEm),
        ),
      )
      .limit(TRAVA_AMBIGUO_TETO + 1);

    if (candidatos.length === 0) {
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "EMAIL_NAO_RESOLVEU",
      });
      return resposta;
    }

    if (candidatos.length > 1) {
      /*
       * E-MAIL AMBÍGUO: TRAVA, E NEM CHEGA A EMITIR CÓDIGO (contrato, seção 5).
       *
       * Escolher um dos candidatos seria escolher a identidade de alguém, e a medição de produção
       * mostra que isso não é hipótese: 5 dos 6 endereços compartilhados carregam DOIS NOMES. Todos
       * os envolvidos são travados, porque todos estão em disputa, e é o time que desempata.
       *
       * ┌─ ELE SAIU DO CAMINHO DA REQUISIÇÃO, e o motivo é o MESMO do correio ─────────────────────┐
       * │ O ramo fazia até `TRAVA_AMBIGUO_TETO` escritas SEQUENCIAIS antes de responder, e isso é   │
       * │ mensurável no relógio: a diferença de tempo dizia "este endereço está na base E pertence  │
       * │ a mais de uma pessoa", que é justamente o oráculo que a resposta única existe para fechar, │
       * │ sobre os 6 endereços compartilhados medidos em produção. A resposta é a mesma constante,   │
       * │ mas o CAMINHO não era, e canal de tempo é canal.                                          │
       * │                                                                                          │
       * │ E ELE NÃO INFLUENCIA A RESPOSTA, então não tem o que fazer no caminho dela: o desfecho já  │
       * │ está calculado na primeira linha do método, trave ou não trave.                            │
       * └─────────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const alvos = candidatos.slice(0, TRAVA_AMBIGUO_TETO).map((c) => c.id);
      void this.travarAmbiguo(alvos, contexto).catch((erro) => {
        // §A.6: só o nome da classe do erro, e a CONTAGEM. Nenhum id, nenhum endereço.
        this.log.error(
          `falha ao travar e-mail ambiguo (${alvos.length} candidato(s)): ${(erro as Error).name}`,
        );
      });
      return resposta;
    }

    const candidatoId = candidatos[0].id;

    // TRAVADO RECUSA COM A MESMA FRASE NEUTRA, e nem gasta um e-mail: enquanto a disputa não é
    // resolvida pelo time, a porta não anda para aquela pessoa.
    if (await this.travaAtiva(this.db, candidatoId)) {
      await this.bumparTrava(this.db, candidatoId);
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "TRAVA_ANTERIOR",
      });
      return resposta;
    }

    /*
     * ┌─ O CORREIO NÃO É ESPERADO DENTRO DA REQUISIÇÃO, E ISSO FECHA UM CANAL DE TEMPO ───────────┐
     * │ O corpo da resposta é idêntico byte a byte para todo e-mail, mas o CAMINHO não era: quem    │
     * │ não resolve retorna em uma consulta, e quem resolve fazia uma CHAMADA DE REDE AO GMAIL      │
     * │ antes de responder. A latência distingue os dois, e não há teto por IP nesta porta (o       │
     * │ backend escuta em loopback e todo mundo chega como `127.0.0.1`), então varrer dez mil        │
     * │ endereços custaria uma sonda de cronômetro cada.                                            │
     * │                                                                                            │
     * │ O `catch` EXPLÍCITO NÃO É ZELO: promessa solta que rejeita sem tratamento derruba o         │
     * │ processo com `unhandledRejection`. `emitirEEnviarCodigo` já não lança por conta própria     │
     * │ (ela embrulha o correio), e este `catch` é a rede contra o erro NÃO previsto, no mesmo       │
     * │ espírito do `try` do `entregar` do envio do link.                                            │
     * │                                                                                            │
     * │ A COMPENSAÇÃO CONTINUA DENTRO DO CAMINHO SOLTO: falhando o envio, a linha do código é       │
     * │ invalidada e a trilha registra `ENVIO_NAO_OCORREU`. Ela já vivia fora da transação, então   │
     * │ nada mudou de lugar.                                                                        │
     * │                                                                                            │
     * │ A FILA (BullMQ) SERIA O DESENHO DEFINITIVO, e o projeto já tem Redis isolado para isso: com │
     * │ fila, o envio ganha retentativa, back-off e visibilidade, e o processo pode cair no meio    │
     * │ sem perder a mensagem. Ela fica PROPOSTA e NÃO CONSTRUÍDA (§A.31, é decisão do diretor); o  │
     * │ caminho solto é a correção PROPORCIONAL enquanto o correio está inerte, porque hoje não há  │
     * │ mensagem nenhuma saindo para se perder.                                                     │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    void this.emitirEEnviarCodigo(candidatoId, email, emailHash, segredo, contexto).catch((erro) => {
      // §A.6: só o nome da classe do erro. A mensagem pode carregar o endereço ou o código.
      this.log.error(`falha inesperada ao emitir o codigo de acesso: ${(erro as Error).name}`);
    });
    return resposta;
  }

  /** As DUAS janelas do teto durável. Contadas sobre `criado_em`, que é o carimbo da EMISSÃO. */
  private async tetoDeSolicitacoesEstourado(
    emailHash: string,
    contexto: { ip: string | null; userAgent: string | null },
  ): Promise<boolean> {
    const agora = Date.now();
    const janelas: { rotulo: string; desde: Date; teto: number }[] = [
      { rotulo: "HORA", desde: new Date(agora - SOLICITACAO_JANELA_MS), teto: SOLICITACOES_POR_HORA },
      { rotulo: "DIA", desde: new Date(agora - SOLICITACAO_JANELA_DIA_MS), teto: SOLICITACOES_POR_DIA },
    ];

    for (const janela of janelas) {
      const [linha] = await this.db
        .select({ quantos: sql<number>`count(*)::int` })
        .from(portalAcessoCodigos)
        .where(
          and(
            eq(portalAcessoCodigos.emailHash, emailHash),
            gt(portalAcessoCodigos.criadoEm, janela.desde),
          ),
        );
      if ((linha?.quantos ?? 0) >= janela.teto) {
        await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
          motivoCodigo: "ACESSO_EMAIL_TETO",
          janela: janela.rotulo,
        });
        return true;
      }
    }
    return false;
  }

  /**
   * SORTEIA, GRAVA SÓ O HMAC, ENVIA. E o código NÃO SAI DESTE MÉTODO por nenhuma outra porta.
   *
   * ┌─ C9, A RÉGUA QUE NÃO SE CONTORNA ──────────────────────────────────────────────────────────┐
   * │ É PROIBIDO expor o código fora do e-mail, EM QUALQUER AMBIENTE. Não na resposta, não em log, │
   * │ não em campo "para teste", não na homologação. É por isso que a variável local é consumida   │
   * │ pelo composto do e-mail e pelo HMAC, e por mais nada: não há `this.log` que a alcance, e a   │
   * │ resposta da rota é uma constante calculada antes de ela existir.                              │
   * │                                                                                             │
   * │ Sem correio configurado a porta NÃO FUNCIONA, e isso é o correto, não um obstáculo.           │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * UM CÓDIGO VIVO POR CANDIDATO: emitir INVALIDA o anterior, na MESMA transação da inserção. Fora
   * da transação, dois pedidos simultâneos deixariam dois códigos vivos, e o teto de 5 tentativas
   * passaria a valer 10.
   *
   * O E-MAIL NÃO SAI DENTRO DA TRANSAÇÃO, de propósito: o correio é rede, e rede dentro de
   * transação segura conexão do banco pelo tempo do pior caso do Google. Falhando o envio, a linha é
   * invalidada em seguida, que é o mesmo desfecho compensatório do `entregar` do envio do link.
   */
  private async emitirEEnviarCodigo(
    candidatoId: string,
    email: string,
    emailHash: string,
    segredo: string,
    contexto: { ip: string | null; userAgent: string | null },
  ): Promise<void> {
    const codigo = gerarCodigo();
    const expiraEm = new Date(Date.now() + CODIGO_TTL_MS);

    const linhaId = await this.db.transaction(async (tx) => {
      await tx
        .update(portalAcessoCodigos)
        .set({ invalidadoEm: new Date() })
        .where(
          and(
            eq(portalAcessoCodigos.asCandidatoId, candidatoId),
            isNull(portalAcessoCodigos.invalidadoEm),
            isNull(portalAcessoCodigos.confirmadoEm),
          ),
        );

      const [criada] = await tx
        .insert(portalAcessoCodigos)
        .values({
          asCandidatoId: candidatoId,
          emailHash,
          codigoHash: hashDoCodigo(codigo, segredo),
          expiraEm,
        })
        .returning({ id: portalAcessoCodigos.id });
      return criada?.id ?? null;
    });

    if (!linhaId) {
      this.log.error("a emissao do codigo de acesso do portal nao devolveu linha");
      return;
    }

    let saiu = false;
    try {
      saiu = await this.correio.enviarCodigo(
        email,
        corpoDoEmailDoCodigo({
          codigo,
          expiraEm,
          minutosDeValidade: Math.round(CODIGO_TTL_MS / 60_000),
        }),
      );
    } catch (erro) {
      // §A.6: só o nome da classe do erro. A mensagem pode carregar o endereço.
      this.log.error(`excecao inesperada do correio na porta de e-mail: ${(erro as Error).name}`);
      saiu = false;
    }

    if (!saiu) {
      /*
       * NÃO DEIXE CREDENCIAL ÓRFÃ, mesma régua do `entregar` do envio do link: o código nasceu,
       * ninguém o recebeu, e ele já invalidou o anterior. Mantê-lo vivo seria uma senha de uso único
       * circulando sem dono, e o candidato pediria outro, gastando o teto por um código que nunca
       * chegou.
       */
      await this.db
        .update(portalAcessoCodigos)
        .set({ invalidadoEm: new Date() })
        .where(eq(portalAcessoCodigos.id, linhaId));
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "ENVIO_NAO_OCORREU",
      });
      return;
    }

    await this.registrar("PORTAL_ACESSO_EMAIL_ENVIADO", contexto, {});
  }

  // ══ PASSO 2: CONFIRMAR O CÓDIGO ═════════════════════════════════════════════════════════════

  /**
   * `POST portal/acesso-email/confirmar`. Devolve O BILHETE e NADA DA PESSOA.
   *
   * ┌─ O QUE ELE NÃO DEVOLVE, E A AUSÊNCIA É EXIGÊNCIA DA AUDITORIA (proibição O10) ─────────────┐
   * │ Sem nome, sem nome MASCARADO, sem cliente, sem cargo, sem e-mail, sem id de candidato. O    │
   * │ diretor pediu que este passo "puxasse os dados que já tem dele", e a auditoria proibiu: posse │
   * │ de caixa NÃO é prova de identidade, e cinco das caixas medidas pertencem a duas pessoas.     │
   * │ Devolver "Olá, M**** S****" confirmaria a quem digitou o endereço de um terceiro quem é o    │
   * │ dono daquele cadastro. Na prática o candidato vê os dados dele DENTRO do Portal, como já vê  │
   * │ hoje, depois de entrar pelo link com CPF e nascimento.                                       │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O BILHETE É O `id` DA LINHA DO CÓDIGO: opaco e REVOGÁVEL. Um JWS auto-suficiente precisaria de
   * uma lista de revogação para poder ser consumido uma vez só, e essa lista é justamente esta
   * linha. Ver o bloco da tabela em `db/schema/tables.ts`.
   *
   * A COMPARAÇÃO É EM TEMPO CONSTANTE (`codigosIguais`), sobre os DIGESTS, e o código cru nunca
   * entra num `===`.
   */
  async confirmar(entrada: {
    email?: string | null;
    codigo?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<ConfirmacaoDeCodigoResposta> {
    this.exigirConfiguracao();

    const contexto = { ip: entrada.ip ?? null, userAgent: entrada.userAgent ?? null };
    const email = normalizarEmail(entrada.email ?? "");
    const segredo = this.pepperDoCodigo();
    const emailHash = hashDoEmail(email, segredo);

    /*
     * O CÓDIGO VIVO MAIS RECENTE DAQUELE ENDEREÇO, e a chave é o HASH do e-mail e não o id do
     * candidato: quem confirma não escolhe de quem é o código. `confirmado_em is null` mantém o
     * bilhete de uso único (confirmar duas vezes não devolve dois bilhetes).
     */
    const [linha] = await this.db
      .select({
        id: portalAcessoCodigos.id,
        codigoHash: portalAcessoCodigos.codigoHash,
        expiraEm: portalAcessoCodigos.expiraEm,
        tentativas: portalAcessoCodigos.tentativas,
      })
      .from(portalAcessoCodigos)
      .where(
        and(
          eq(portalAcessoCodigos.emailHash, emailHash),
          isNull(portalAcessoCodigos.confirmadoEm),
          isNull(portalAcessoCodigos.invalidadoEm),
        ),
      )
      .orderBy(desc(portalAcessoCodigos.criadoEm))
      .limit(1);

    // NÃO HÁ CÓDIGO VIVO: mesma recusa de "código errado". Separar as duas diria a quem tenta se
    // aquele endereço tem um código em curso, ou seja, se ele existe na base.
    if (!linha) {
      await this.registrar("PORTAL_ACESSO_EMAIL_CODIGO_ERRADO", contexto, {
        motivoCodigo: "CODIGO_ERRADO",
      });
      throw this.recusa();
    }

    if (linha.expiraEm.getTime() <= Date.now()) {
      await this.db
        .update(portalAcessoCodigos)
        .set({ invalidadoEm: new Date() })
        .where(eq(portalAcessoCodigos.id, linha.id));
      await this.registrar("PORTAL_ACESSO_EMAIL_CODIGO_ERRADO", contexto, {
        motivoCodigo: "CODIGO_EXPIRADO",
      });
      throw this.recusa();
    }

    /*
     * A TENTATIVA É CONTADA NO BANCO, ANTES DA COMPARAÇÃO, e as duas coisas importam.
     *
     * NO BANCO porque `tentativas = tentativas + 1` é atômico: contado em TypeScript a partir do
     * valor lido, cinco pedidos simultâneos gravariam "1" cinco vezes, e o teto nunca fecharia. Foi
     * esse o furo que a trava da emissão de link fechou por outro caminho.
     *
     * ANTES porque uma contagem que só acontece quando o código está errado não conta a tentativa
     * que derrubou o processo no meio, e o atacante que corta a conexão depois de enviar o palpite
     * teria tentativas de graça.
     */
    const [contada] = await this.db
      .update(portalAcessoCodigos)
      .set({ tentativas: sql`${portalAcessoCodigos.tentativas} + 1` })
      .where(eq(portalAcessoCodigos.id, linha.id))
      .returning({ tentativas: portalAcessoCodigos.tentativas });
    const tentativaN = contada?.tentativas ?? linha.tentativas + 1;

    const acertou = codigosIguais(linha.codigoHash, hashDoCodigo(entrada.codigo ?? "", segredo));

    /*
     * NA QUINTA O CÓDIGO É DESTRUÍDO, NÃO SÓ BLOQUEADO, e é isso que sustenta os 6 dígitos.
     *
     * A conta da auditoria: 10 códigos por dia x 5 tentativas = 50 chutes em 10^6, ou ~1.380 dias
     * para 50% de chance, gerando 10 e-mails por dia na caixa da vítima. Tirar a destruição
     * invalidaria a conta e passaria a exigir 8 dígitos. "Bloqueado" volta a valer no dia em que
     * alguém conserte a contagem; `invalidado_em` não volta por conserto nenhum.
     *
     * DESTRÓI TAMBÉM QUANDO ACERTOU NA QUINTA, e isso é deliberado: o acerto no limite é
     * indistinguível do último chute de uma varredura, e conceder ali seria premiar exatamente o
     * caminho que o teto existe para fechar. O candidato legítimo pede outro código.
     */
    if (tentativaN >= CODIGO_TENTATIVAS_LIMITE) {
      await this.db
        .update(portalAcessoCodigos)
        .set({ invalidadoEm: new Date() })
        .where(eq(portalAcessoCodigos.id, linha.id));
    }

    if (!acertou || tentativaN >= CODIGO_TENTATIVAS_LIMITE) {
      await this.registrar("PORTAL_ACESSO_EMAIL_CODIGO_ERRADO", contexto, {
        motivoCodigo: "CODIGO_ERRADO",
        tentativaN,
      });
      throw this.recusa();
    }

    /*
     * A CONFIRMAÇÃO CARIMBA E REESCREVE O PRAZO, na mesma escrita. Ver o bloco de `BILHETE_TTL_MS`:
     * a partir daqui aquela coluna deixa de ser o prazo de um segredo de 6 dígitos e passa a ser o do
     * bilhete opaco, porque `confirmado_em` preenchido já tira a linha do caminho da conferência de
     * código (que exige `confirmado_em is null`).
     */
    const agora = new Date();
    await this.db
      .update(portalAcessoCodigos)
      .set({ confirmadoEm: agora, expiraEm: new Date(agora.getTime() + BILHETE_TTL_MS) })
      .where(eq(portalAcessoCodigos.id, linha.id));

    await this.registrar("PORTAL_ACESSO_EMAIL_CONFIRMADO", contexto, { tentativaN });

    // O NÚMERO DEVOLVIDO É O DO BILHETE (15), e não o do código (10): é ele que a tela mostra, então
    // ele tem de ser o prazo verdadeiro do passo seguinte.
    return { bilhete: linha.id, expiraEmMinutos: BILHETE_TTL_MINUTOS };
  }

  // ══ PASSO 3: A IDENTIDADE ═══════════════════════════════════════════════════════════════════

  /**
   * `POST portal/acesso-email/identidade`. Grava DUAS colunas e, havendo admissão viva pelo VÍNCULO,
   * pede o envio do link pelo caminho que já existe.
   *
   * ┌─ A ESCRITA ALCANÇA `cpf` E `data_nascimento`, E MAIS NADA ──────────────────────────────────┐
   * │ O `set` é escrito à mão com dois campos LITERAIS. Um `update` montado a partir do corpo é    │
   * │ veto automático no contrato, e a razão é a forma do dano: o corpo vem de quem quer que esteja │
   * │ do outro lado, e um campo a mais atravessando escreveria `banco_talentos` (vida eterna para  │
   * │ dado pessoal, §A.6), `origem` ou `anonimizado_em` na ficha de alguém.                         │
   * │                                                                                             │
   * │ E A PONTE PARA `candidatos` CONTINUA SENDO GESTO DO TIME. Este método NÃO chama              │
   * │ `criarPreAdmissaoDoFunil` nem `aplicarLiberacao`: o CPF chegando NÃO dispara o envio para a  │
   * │ admissão. Aquele gesto consome posição de vaga e tem porta declarada, com Master e aceite de │
   * │ reentrada (`candidatos.service.ts:1905-1920`); abri-la por um candidato autenticado só por   │
   * │ e-mail seria uma quarta porta não declarada. O humano fica no meio, por desenho.              │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A TRAVA É `pg_advisory_xact_lock` SOBRE O CPF NORMALIZADO, molde de `emitirComTrava`
   * (`portal-identidade.service.ts:492`): ela roda NO SERVIDOR Postgres, então serializa duas
   * INSTÂNCIAS do backend e não só duas requisições do mesmo processo, e o Postgres a solta sozinho
   * no commit ou no rollback. Sem ela, dois pedidos simultâneos com o MESMO CPF passariam os dois
   * pela consulta de `CPF_DE_OUTRO_CANDIDATO` (nenhum enxerga a escrita que o outro ainda não fez) e
   * o segundo colheria a violação de `uq_as_candidatos_cpf` como 500.
   *
   * O VALIDADOR DE CPF É `isValidCpf`, USADO DIRETO, e isso é decisão registrada. O invólucro da
   * casa (`CandidatosService.cpfOuNulo`) chama exatamente estas duas funções por dentro, mas LANÇA
   * `BadRequestException("O CPF não confere...")`, e nesta porta essa frase é um ORÁCULO: ela criaria
   * um TERCEIRO desfecho de erro, distinguindo "CPF malformado" de "não foi possível continuar",
   * quando a auditoria fechou a porta em DOIS (O5). Usar `normalizeCpf` + `isValidCpf` é usar o MESMO
   * validador, sem o invólucro que fala demais: continua não existindo um segundo validador de CPF.
   */
  async identidade(entrada: {
    bilhete?: string | null;
    cpf?: string | null;
    dataNascimento?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<IdentidadeDoAcessoResposta> {
    this.exigirConfiguracao();

    const contexto = { ip: entrada.ip ?? null, userAgent: entrada.userAgent ?? null };
    const bilhete = (entrada.bilhete ?? "").trim();

    /*
     * A FORMA DO BILHETE É CONFERIDA ANTES DE VIRAR `where id = $1`, e isso não é zelo: a coluna é
     * `uuid`, e texto qualquer não devolve zero linhas, DERRUBA a consulta no cast do Postgres. Numa
     * rota PÚBLICA isso é 500, e pior que o 500: a rota passaria a responder DIFERENTE conforme o
     * que foi digitado, virando o oráculo que ela existe para não ser. Mesma régua do
     * `jtiSemVerificar` (`portal-identidade.service.ts`).
     */
    /*
     * ┌─ E FORMATO INVÁLIDO NÃO VIRA LINHA DE TRILHA, pelo MESMO argumento do e-mail sem arroba ──┐
     * │ Registrar aqui era amplificação de log numa rota PÚBLICA: um POST com `bilhete: "x"` custa │
     * │ zero a quem chama e custava DOIS inserts ao banco (`portal_eventos` mais                    │
     * │ `portal_eventos_ip`), e ele acontecia ANTES do balde, então nada o limitava. O único freio  │
     * │ seria o balde global de `req.ip`, e no Portal todo mundo chega como `127.0.0.1`, ou seja é   │
     * │ um balde ÚNICO: o mesmo atacante enchia a trilha às centenas de milhares por dia e derrubava │
     * │ o portal inteiro de brinde.                                                                 │
     * │                                                                                            │
     * │ "ALGUÉM APRESENTOU UM BILHETE QUE NÃO É UM BILHETE" não localiza pessoa nenhuma, não dá     │
     * │ nome a ninguém e não responde pergunta nenhuma da Sala De Segurança. É a matéria-prima mais │
     * │ barata para inflar o log, exatamente como o texto sem arroba em `solicitar`, e log inflado  │
     * │ apaga o sinal que a trilha existe para dar.                                                 │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (!FORMATO_UUID.test(bilhete)) throw this.recusa();

    /*
     * O BALDE DO PASSO, E ELE É TOCADO DEPOIS DA CONFERÊNCIA DE FORMA E ANTES DE QUALQUER ESCRITA.
     *
     * A ordem é a defesa, e é a mesma da válvula de recuperação: fosse antes da conferência de forma,
     * o armazenamento do limitador viraria o novo lugar para despejar lixo (qualquer texto geraria uma
     * chave); fosse depois da trilha, a amplificação de log que ele existe para conter já teria
     * acontecido. Estourado, recusa com a MESMA frase de tudo o mais, e SEM linha de trilha: o
     * registro do estouro seria exatamente a escrita que o balde está impedindo.
     */
    const balde = await this.throttle.increment(
      `${BALDE_IDENTIDADE}:${this.hashDoBilhete(bilhete)}`,
      BILHETE_TTL_MS,
      IDENTIDADE_POR_JANELA,
      BILHETE_TTL_MS,
      BALDE_IDENTIDADE,
    );
    if (balde?.isBlocked) throw this.recusa();

    const cpf = normalizeCpf(entrada.cpf ?? "");
    const dataNascimento = (entrada.dataNascimento ?? "").trim().slice(0, 10);
    /*
     * `PROV` É RECUSA DE FORMATO, e a conferência é feita sobre o valor CRU porque `normalizeCpf`
     * tira as letras: `PROV1234567` normalizado é `1234567`, que já reprova no dígito verificador.
     * A linha continua aqui de propósito, explícita, porque identidade provisória é coisa de
     * DECLÍNIO (`domain/identidade-provisoria.ts`: só `DECLINOU` e `RESCISAO` podem receber uma), e
     * o dia em que o formato do provisório mudar é o dia em que uma conferência implícita falharia
     * em silêncio, deixando entrar pela porta do vivo o que é marca de encerrado.
     */
    const pareceProvisorio = /^\s*PROV/i.test(entrada.cpf ?? "");
    const cpfValido = !pareceProvisorio && isValidCpf(cpf);

    const desfecho = await this.db.transaction(async (tx) => {
      /*
       * OS TRÊS ESTADOS NA MESMA CONSULTA, e é essa consulta que faz a extensão do prazo na
       * confirmação ser segura (ver o bloco de `BILHETE_TTL_MS`):
       *   `confirmado_em is not null`  -> alguém digitou o código certo;
       *   `invalidado_em is null`      -> o bilhete não foi consumido nem destruído;
       *   `expira_em > now()`          -> está dentro da janela.
       * Faltando qualquer um, `bilheteVivo` é falso e nada mais é lido: é o degrau 1 da precedência.
       */
      const [codigo] = await tx
        .select({
          id: portalAcessoCodigos.id,
          asCandidatoId: portalAcessoCodigos.asCandidatoId,
        })
        .from(portalAcessoCodigos)
        .where(
          and(
            eq(portalAcessoCodigos.id, bilhete),
            isNotNull(portalAcessoCodigos.confirmadoEm),
            isNull(portalAcessoCodigos.invalidadoEm),
            gt(portalAcessoCodigos.expiraEm, new Date()),
          ),
        )
        .limit(1);

      const bilheteVivo = !!codigo;

      // DEGRAU 1 DA PRECEDÊNCIA, e ele vem primeiro para que ninguém SEM bilhete válido consiga
      // GRAVAR TRAVA no candidato de outra pessoa. Ver `decisaoDaIdentidade` no domínio.
      if (!bilheteVivo || !codigo) {
        return { tipo: "RECUSA" as const, motivo: "BILHETE_MORTO" as PortalMotivo };
      }

      const candidatoId = codigo.asCandidatoId;

      /*
       * A TRAVA DO POSTGRES, SOBRE O CPF NORMALIZADO. Ela vem DEPOIS do bilhete (não faz sentido
       * serializar quem não passou da porta) e ANTES de qualquer leitura que decida escrita.
       */
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${cpf}, 0))`);

      const [ficha] = await tx
        .select({
          id: asCandidatos.id,
          cpf: asCandidatos.cpf,
          dataNascimento: asCandidatos.dataNascimento,
          anonimizadoEm: asCandidatos.anonimizadoEm,
        })
        .from(asCandidatos)
        .where(eq(asCandidatos.id, candidatoId))
        .limit(1);

      /*
       * FICHA ANONIMIZADA: RECUSA NEUTRA, E FORA DA PRECEDÊNCIA DE PROPÓSITO.
       *
       * Ela não é trava, porque não há disputa a enfileirar: o registro está ENCERRADO por decisão de
       * retenção. Reescrever `cpf` e `data_nascimento` ali DESFARIA um expurgo de LGPD, e a
       * consequência é pior do que parece: a varredura de `RetencaoCandidatosService` (CTE
       * `pessoais_cicatrizados`) apaga de novo, então o dado sumiria sozinho depois e ninguém
       * conseguiria explicar por quê. É a MESMA cláusula que os outros escritores de `as_candidatos`
       * repetem à mão, porque não há guarda no schema nem trigger.
       */
      if (!ficha || ficha.anonimizadoEm) {
        return { tipo: "RECUSA" as const, motivo: "FICHA_ANONIMIZADA" as PortalMotivo };
      }

      const jaTravado = await this.travaAtiva(tx, candidatoId);

      /*
       * "EXISTE OUTRO CANDIDATO COM ESTE CPF?", NA MESMA FORMA DO `editar`
       * (`candidatos.service.ts:380`): `eq(cpf) and ne(id)`. Reusar a forma importa porque é ela que
       * o unique parcial `uq_as_candidatos_cpf` reflete, e uma pergunta escrita diferente aqui
       * responderia diferente do índice.
       *
       * ESTE `select` NÃO É BUSCA POR CPF DO CORPO PARA ACHAR PESSOA: ele confere COLISÃO sobre um
       * candidato JÁ determinado pelo bilhete, e a projeção é UMA coluna técnica. Nada do outro
       * candidato atravessa para a resposta, nem o id.
       */
      const [outro] = cpfValido
        ? await tx
            .select({ id: asCandidatos.id })
            .from(asCandidatos)
            .where(and(eq(asCandidatos.cpf, cpf), ne(asCandidatos.id, candidatoId)))
            .limit(1)
        : [];

      const decisao = decisaoDaIdentidade({
        bilheteVivo,
        cpfValido,
        jaTravado,
        cpfDeOutro: !!outro,
        divergentes: divergencias(
          { cpf, dataNascimento },
          { cpf: ficha.cpf, dataNascimento: ficha.dataNascimento },
        ),
      });

      if (decisao.tipo === "BILHETE_MORTO") {
        return { tipo: "RECUSA" as const, motivo: "BILHETE_MORTO" as PortalMotivo };
      }
      if (decisao.tipo === "CPF_INVALIDO") {
        return { tipo: "RECUSA" as const, motivo: "CPF_INVALIDO" as PortalMotivo };
      }
      if (decisao.tipo === "TRAVAR") {
        await this.travar(tx, candidatoId, decisao.motivo);
        return { tipo: "TRAVADO" as const, motivo: decisao.motivo };
      }

      /*
       * A ESCRITA. DUAS COLUNAS LITERAIS, `where` com `anonimizado_em is null` e ZERO LINHA VIRANDO
       * RECUSA EXPLÍCITA. As duas metades são necessárias, e é o veto A da ingestão do Digai escrito
       * de novo aqui: a cláusula sozinha atualizaria zero linhas EM SILÊNCIO, e o fluxo seguiria
       * dizendo que gravou. A leitura de cima protege contra o caso normal; esta cláusula protege
       * contra a CORRIDA com a varredura de retenção, que roda sozinha.
       */
      try {
        const gravadas = await tx
          .update(asCandidatos)
          .set({ cpf, dataNascimento, atualizadoEm: new Date() })
          .where(and(eq(asCandidatos.id, candidatoId), isNull(asCandidatos.anonimizadoEm)))
          .returning({ id: asCandidatos.id });
        if ((gravadas?.length ?? 0) === 0) {
          return { tipo: "RECUSA" as const, motivo: "FICHA_ANONIMIZADA" as PortalMotivo };
        }
      } catch (erro) {
        /*
         * O `catch` DO 23505 DESEMBOCA NA MESMA LINHA QUE A CONSULTA PRÉVIA, e o contrato exige
         * isso literalmente. A consulta de cima é a que dá a resposta boa (trava com motivo certo);
         * este `catch` é a REDE para a corrida que a trava do Postgres não cobre, por exemplo um
         * `as_candidatos` escrito por outro caminho com o mesmo CPF entre a consulta e o `update`.
         * Sem ele, a corrida sairia como 500, e 500 é informação.
         *
         * §A.6: a mensagem do Postgres NÃO é repassada nem logada. Ela traz o VALOR que violou o
         * índice, que aqui é o CPF.
         */
        if (this.ehViolacaoDeUnique(erro)) {
          await this.travar(tx, candidatoId, "CPF_DE_OUTRO_CANDIDATO");
          return { tipo: "TRAVADO" as const, motivo: "CPF_DE_OUTRO_CANDIDATO" as MotivoDaTravaDeAcesso };
        }
        throw erro;
      }

      /*
       * O BILHETE É CONSUMIDO NA MESMA TRANSAÇÃO DA ESCRITA. Uso único de verdade: sem isto, quem
       * guardasse o bilhete repetiria o passo e faria o sistema disparar e-mail de link quantas vezes
       * quisesse dentro dos 15 minutos, e cada disparo REVOGA o link anterior (decisão 4), o que
       * derrubaria a sessão de quem estivesse enviando documento. O candidato que precisar de novo
       * pede outro código.
       */
      await tx
        .update(portalAcessoCodigos)
        .set({ invalidadoEm: new Date() })
        .where(eq(portalAcessoCodigos.id, codigo.id));

      return { tipo: "GRAVADO" as const, candidatoId };
    });

    if (desfecho.tipo === "RECUSA") {
      /*
       * ┌─ `BILHETE_MORTO` NÃO VIRA LINHA DE TRILHA, NEM COM UUID BEM FORMADO (condição 4) ─────────┐
       * │ O balde por bilhete NÃO alcança este caso, e isso é da natureza dele: a chave é o hash do  │
       * │ bilhete APRESENTADO, então cada UUID novo abre um balde novo com os créditos inteiros. Quem │
       * │ sorteia um UUID por requisição nunca esbarra em teto nenhum, e cada tentativa custava um    │
       * │ insert em `portal_eventos` mais um em `portal_eventos_ip`.                                 │
       * │                                                                                          │
       * │ E A LINHA NÃO DIZIA NADA: "alguém apresentou um bilhete que não existe, ou que já foi usado, │
       * │ ou que venceu" não nomeia pessoa, não nomeia endereço e não responde pergunta nenhuma da    │
       * │ Sala De Segurança. É o mesmo argumento do e-mail sem arroba em `solicitar` e do formato     │
       * │ inválido logo acima: log inflado APAGA o sinal que a trilha existe para dar.               │
       * │                                                                                          │
       * │ AS OUTRAS RECUSAS CONTINUAM REGISTRANDO, e a assimetria é o ponto: `CPF_INVALIDO` e        │
       * │ `FICHA_ANONIMIZADA` só são alcançáveis com um bilhete VIVO na mão, que é credencial que o  │
       * │ balde limita e que só existe depois de o código certo ter sido digitado. Ali o volume é    │
       * │ pequeno por construção e cada linha diz algo sobre uma pessoa de verdade.                   │
       * └─────────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (desfecho.motivo !== "BILHETE_MORTO") {
        await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
          motivoCodigo: desfecho.motivo,
        });
      }
      throw this.recusa();
    }

    if (desfecho.tipo === "TRAVADO") {
      // O EVENTO NÃO NOMEIA O CAMPO, só o motivo de catálogo: dizer "o CPF divergiu" confirmaria a
      // quem tentou que o outro dado está certo. E `candidato_hash` fica NULO, porque este CPF NÃO
      // foi verificado (contrato, seção 7).
      await this.registrar("PORTAL_ACESSO_TRAVADO", contexto, { motivoCodigo: desfecho.motivo });
      throw this.recusa();
    }

    /*
     * O ÚNICO EVENTO DESTA PORTA COM `candidato_hash`, e é aqui porque é aqui que o CPF deixa de ser
     * palpite e passa a ser o dado da ficha. `PortalTrilhaService` deriva o hash com o pepper da
     * TRILHA; o CPF cru não é gravado nem logado.
     */
    await this.registrar("PORTAL_IDENTIDADE_GRAVADA", contexto, { cpf });

    /*
     * ┌─ A PONTE: O CPF REAL SUBSTITUI O MARCADOR PROVISÓRIO NA ESTEIRA ───────────────────────────┐
     * │ Candidato enviado à admissão SEM CPF nasceu com marcador PROV (envio A&S). Agora que ele     │
     * │ provou a identidade pelo e-mail+código e gravou o CPF REAL, a admissão viva vinculada é       │
     * │ REAPONTADA pelo `corrigirCpf` (ator SISTEMA), que já valida, trata duplicata, reaponta e apaga │
     * │ a linha PROV órfã. ISTO NÃO É A QUARTA PORTA DE ENVIO que o cabeçalho de `identidade` proíbe:  │
     * │ não consome posição, não cria admissão, não libera nada; só acerta a chave de uma admissão     │
     * │ que JÁ existe, estacionada em AGUARDANDO_LIBERACAO esperando exatamente este CPF.               │
     * │                                                                                              │
     * │ FALHA AQUI NÃO DERRUBA O FLUXO (mesma assimetria do `despacharLink`): o CPF já está gravado na │
     * │ ficha (o fato), a reconciliação é efeito. Colisão de CPF sem confirmação, corrida de farol ou  │
     * │ duplicata de vaga caem em ERRO de log (§A.6: só o nome da classe) e a admissão fica PROV para  │
     * │ um Master corrigir à mão. Nunca auto-confirmamos merge de duplicata sem humano.                │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    await this.reconciliarCpfProvisorioDaEsteira(desfecho.candidatoId, cpf);

    return this.despacharLink(desfecho.candidatoId, contexto);
  }

  /**
   * Reaponta a admissão viva de marcador PROVISÓRIO para o CPF REAL recém-gravado. Server-side, ator
   * SISTEMA (`corrigirCpf(..., null)`), fail-safe. Ver o bloco em `identidade`.
   */
  private async reconciliarCpfProvisorioDaEsteira(candidatoId: string, cpfReal: string): Promise<void> {
    try {
      // A ADMISSÃO VEM DO VÍNCULO, nunca de uma busca por CPF: este serviço público não toca coluna de
      // CPF da esteira (trava 1 de `portal-acesso-email.travas`). A decisão "é provisório?" e a troca
      // moram em `AdmissoesService.reconciliarCpfProvisorio` (ator SISTEMA, no-op se o CPF já é real).
      const admissaoId = await this.admissaoVivaDoCandidato(candidatoId);
      if (!admissaoId) return;
      await this.admissoes.reconciliarCpfProvisorio(admissaoId, cpfReal);
    } catch (erro) {
      // §A.6: só o nome da classe do erro; a mensagem pode carregar id ou CPF.
      this.log.error(`reconciliacao do CPF pendente nao ocorreu: ${(erro as Error).name}`);
    }
  }

  // ══ A SAÍDA: O LINK, PELO CAMINHO QUE JÁ EXISTE ═════════════════════════════════════════════

  /**
   * HAVENDO ADMISSÃO VIVA LIGADA AO CANDIDATO PELO VÍNCULO, pede o envio do link. Não havendo, o
   * time segue.
   *
   * ┌─ POR QUE ISTO NÃO CUNHA NADA E NÃO INSERE EM `portal_links` ────────────────────────────────┐
   * │ `portal_links` tem UM ponto de escrita no sistema, `PortalIdentidadeService`, e a auditoria  │
   * │ enumerou as escritas justamente para poder afirmar que não há outra. Abrir uma aqui, num     │
   * │ arquivo que roda para o PÚBLICO, poria um `insert` de credencial a uma linha de distância de │
   * │ quem mexesse neste método amanhã. `PortalEnvioService.enviarParaAdmissao` já orquestra tudo:  │
   * │ recorte de farol, abstenção S15, inércia do correio e revogação compensatória.                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * `LINK_ENVIADO` SÓ QUANDO O E-MAIL DE FATO SAIU. Abstenção (o candidato já tem link vivo e JÁ
   * ENTROU por ele) e falha caem em `DADOS_RECEBIDOS`, e essa escolha é deliberada nas duas pontas:
   * a porta de e-mail NÃO PODE forçar a emissão, sob pena de derrubar a sessão de quem está enviando
   * documento naquele instante, e dizer "link enviado" quando nada saiu mandaria a pessoa esperar
   * para sempre uma mensagem que não existe.
   */
  private async despacharLink(
    candidatoId: string,
    contexto: { ip: string | null; userAgent: string | null },
  ): Promise<IdentidadeDoAcessoResposta> {
    const admissaoId = await this.admissaoVivaDoCandidato(candidatoId);
    if (!admissaoId) return { situacao: "DADOS_RECEBIDOS" };

    const autorId = await this.autorDoLink(candidatoId, admissaoId);
    if (!autorId) {
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "SEM_AUTOR_PARA_O_LINK",
      });
      return { situacao: "DADOS_RECEBIDOS" };
    }

    /*
     * ┌─ A ORIGEM É `AUTOATENDIMENTO`, E É ELA QUE DESFAZ A AUTORIA FALSA (veto V3) ───────────────┐
     * │ O autor da emissão é o dono do REGISTRO (ver `autorDoLink`), e isso é defensável como        │
     * │ CUSTÓDIA e inaceitável como ATO. Enquanto a origem saía `AUTOMATICO`, que é o MESMO valor do │
     * │ gancho do funil, a trilha só sabia contar a segunda coisa: ninguém distinguia "o consultor   │
     * │ mandou o link" de "um candidato pediu e a emissão foi debitada no nome do consultor". O      │
     * │ valor próprio é o que separa as duas, e ele é o dado que a Sala De Segurança usa para não    │
     * │ ler autoria onde há custódia.                                                                │
     * │                                                                                            │
     * │ O VALOR VEM DO CONTRATO COMPARTILHADO (`ORIGENS_DE_ENVIO_DO_LINK`), e não foi inventado      │
     * │ aqui: `VALORES_FECHADOS.origem` (`domain/portal-evento.ts`) DERIVA daquela lista, então uma  │
     * │ palavra escrita só deste lado seria DESCARTADA em silêncio pela trilha, e o campo chegaria   │
     * │ vazio sem nada falhar. Alargar o catálogo é do coordenador (§A.39, dono único).               │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    /*
     * ┌─ O `try` NÃO É REDUNDANTE, E A AUSÊNCIA DELE FOI A SEGUNDA METADE DO VETO V2 ──────────────┐
     * │ `enviarParaAdmissao` LANÇA `NotFoundException` quando `destinatarioDaAdmissao` não acha a   │
     * │ admissão (o recorte de farol dele devolve nulo, `portal-envio.service.ts:118` e `:478`), e  │
     * │ estouro em `revogarLink` ou em `marcarEnvioDoLink` sobe do mesmo jeito. Sem este `try`, a   │
     * │ porta respondia 404 ou 500, com CORPO DIFERENTE do neutro e SEM linha de trilha, e no pior  │
     * │ caso DEPOIS de o e-mail já ter saído (o estouro do carimbo acontece adiante do envio).      │
     * │                                                                                            │
     * │ É O BURACO DO V2 REABERTO PELO CAMINHO DE ERRO: a resposta única e a trilha completa não    │
     * │ podem valer só no caminho felizmente previsto. O CPF já está gravado (é o fato), o envio é  │
     * │ o aviso, então falhar aqui cai em `DADOS_RECEBIDOS`, que é a verdade: recebemos os dados e o │
     * │ time segue. Mesma assimetria do gancho do funil, que engole exceção do envio de propósito.  │
     * │                                                                                            │
     * │ A CORRIDA QUE ISTO COBRE DE VERDADE: o farol muda entre `admissaoVivaDoCandidato` e a       │
     * │ emissão (alguém declinou no meio), e aí a admissão que existia deixa de ser encontrável.    │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    let resultado: Awaited<ReturnType<PortalEnvioService["enviarParaAdmissao"]>> | null = null;
    try {
      resultado = await this.envio.enviarParaAdmissao(admissaoId, autorId, "AUTOATENDIMENTO");
    } catch (erro) {
      // §A.6: só o nome da classe do erro. A mensagem pode carregar id, endereço ou URL.
      this.log.error(`excecao inesperada ao despachar o link do portal: ${(erro as Error).name}`);
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "ENVIO_NAO_OCORREU",
      });
      return { situacao: "DADOS_RECEBIDOS" };
    }

    if (!resultado.enviado) {
      // O CAMINHO DO ENVIO JÁ REGISTRA A PRÓPRIA TRILHA com o próprio código (`PORTAL_LINK_*`).
      // Aqui vai só o fato de que a porta de e-mail não terminou em link, sem duplicar aquele
      // vocabulário: mapear os códigos dele para os nossos criaria a segunda verdade de sempre.
      await this.registrar("PORTAL_ACESSO_EMAIL_RECUSADO", contexto, {
        motivoCodigo: "ENVIO_NAO_OCORREU",
      });
      return { situacao: "DADOS_RECEBIDOS" };
    }

    /*
     * ┌─ O SUCESSO REGISTRA, E COM TIPO PRÓPRIO (as duas metades do veto V2) ──────────────────────┐
     * │ A ausência do registro era metade do veto: as duas recusas deste método já registravam e o  │
     * │ sucesso voltava mudo, então "quantos candidatos entraram por autoatendimento e receberam o   │
     * │ link" era pergunta sem resposta.                                                             │
     * │                                                                                            │
     * │ A OUTRA METADE ERA O TIPO. Ele nasceu como `PORTAL_ACESSO_EMAIL_ENVIADO`, o MESMO do código │
     * │ de verificação, e as duas linhas saíam IDÊNTICAS em todos os campos: só a vizinhança         │
     * │ temporal as distinguia. Quem contasse entrega de CÓDIGO (que é o sinal de força bruta)       │
     * │ passava a contar entrega de LINK (que é operação funcionando) junto. `PORTAL_ACESSO_EMAIL_   │
     * │ ENVIADO` voltou a ser só o código, e o link tem o tipo dele.                                 │
     * │                                                                                            │
     * │ E ELE NÃO É O `PORTAL_LINK_ENVIADO` do carimbo: aquele é comum aos três caminhos de entrega, │
     * │ este é o desfecho DESTA porta, a única em que o pedido partiu do próprio candidato.          │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    await this.registrar("PORTAL_ACESSO_LINK_ENVIADO", contexto, {});

    /*
     * ┌─ O ENDEREÇO NÃO VOLTA, NEM MASCARADO, E A RAZÃO É QUE SÃO DOIS ENDEREÇOS (condição 1) ─────┐
     * │ Quem chamou provou posse de `as_candidatos.email`, a ficha do FUNIL. O link vai para         │
     * │ `candidatos.email`, a ficha da ADMISSÃO (é `destinatarioDaAdmissao` quem resolve, e ele lê   │
     * │ só aquela coluna). ELES PODEM SER DIFERENTES, e a máscara da casa devolve a PRIMEIRA letra,  │
     * │ a ÚLTIMA e o DOMÍNIO INTEIRO: seria entregar pedaço de um endereço de TERCEIRO a quem não    │
     * │ provou posse dele.                                                                           │
     * │                                                                                            │
     * │ A TELA DIZ A VERDADE SEM CARACTERES: "enviamos o link para o e-mail cadastrado na sua        │
     * │ admissão". Quem não recebe procura o RH, que é o caminho que já existe.                       │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    return { situacao: "LINK_ENVIADO" };
  }

  /**
   * A ADMISSÃO VEM DO VÍNCULO DO REGISTRO, E ESTA É A CORREÇÃO ESTRUTURAL DO VETO.
   *
   * `as_candidatos` -> `as_candidaturas.candidato_id` -> `as_candidaturas.admissao_id` ->
   * `admissoes`. ZERO igualdade de CPF vindo do corpo. Era exatamente ali que a v1 tomava conta: com
   * `cpf` nulo na ficha, nada divergia, e a busca global devolvia a admissão de um terceiro.
   *
   * O RECORTE DE FAROL É A LISTA REUSADA (`FAROIS_FORA_DO_PAINEL`, a mesma do painel, do envio e dos
   * pedidos de ajuda), e não uma cópia: cópia concorda com a original por coincidência, e a
   * divergência apareceria como credencial emitida para quem declinou. O `emitirComTrava` a aplica
   * de novo por dentro, e a repetição aqui é defesa em profundidade, não régua nova.
   *
   * A MAIS RECENTE quando houver mais de uma: é a que a pessoa está vivendo agora.
   */
  private async admissaoVivaDoCandidato(candidatoId: string): Promise<string | null> {
    const [linha] = await this.db
      .select({ admissaoId: admissoes.id })
      .from(asCandidaturas)
      .innerJoin(admissoes, eq(admissoes.id, asCandidaturas.admissaoId))
      .where(
        and(
          eq(asCandidaturas.candidatoId, candidatoId),
          isNotNull(asCandidaturas.admissaoId),
          notInArray(admissoes.farolGlobal, [...FAROIS_FORA_DO_PAINEL]),
        ),
      )
      .orderBy(desc(admissoes.criadoEm))
      .limit(1);
    return linha?.admissaoId ?? null;
  }

  /**
   * ══ QUEM ASSINA A EMISSÃO DO LINK, EM TRÊS DEGRAUS, E O ÚLTIMO É ABSTENÇÃO ═══════════════════
   *
   * O PROBLEMA: `portal_links.criado_por_id` é NOT NULL com FK para `usuarios`, e nesta porta NÃO HÁ
   * usuário interno agindo. Quem age é o candidato, que não é usuário do sistema.
   *
   * ┌─ POR QUE NÃO EXISTE E NÃO VAI EXISTIR UM USUÁRIO-SISTEMA AQUI ──────────────────────────────┐
   * │ O precedente do UUID nulo (`reconciliacao-drive.service.ts:251-256`) NÃO tem linha na tabela │
   * │ `usuarios`, então ele violaria a FK. E semear um foi RECUSADO pela auditoria: uma linha em    │
   * │ `usuarios` que não loga cria um sujeito de autoria sem dono para TODA a auditoria do EA, não  │
   * │ só para esta porta. Inventar autor para poder emitir é o que transformaria a trilha em ficção,│
   * │ e a §A.6 exige aceite sensível permanente e consultável, o que pressupõe autor REAL.          │
   * │                                                                                             │
   * │ A PRÓXIMA SESSÃO VAI OLHAR O DEGRAU 3 E QUERER "CONSERTAR" COM UM USUÁRIO-SISTEMA. Não é     │
   * │ conserto: é o que foi vetado. Abster-se é o comportamento seguro, mesmo raciocínio da §A.33   │
   * │ (não arquivar em vez de arquivar errado).                                                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * 1. `as_candidatos.criado_por_id`: o usuário que cadastrou aquela pessoa no funil, dono natural do
   *    registro. MEDIDO: 9 de 13 candidatos da homologação têm o campo preenchido.
   * 2. Não tendo (a coluna é nullable, `ON DELETE SET NULL`, e candidato importado costuma vir sem
   *    autor): o `criado_por_id` do `portal_links` mais RECENTE daquela admissão, isto é, quem já
   *    emitiu link para aquela pessoa antes.
   * 3. Nenhum dos dois: ABSTÉM-SE. O CPF e a data foram gravados, a resposta é `DADOS_RECEBIDOS`, a
   *    trilha registra `SEM_AUTOR_PARA_O_LINK`, e o time manda o link à mão, como faz hoje.
   *
   * O usuário é conferido ATIVO no degrau 1: autor desligado assinaria emissão nova, e a fila de
   * quem responde por aquele link passaria a apontar para quem já saiu da empresa.
   */
  private async autorDoLink(candidatoId: string, admissaoId: string): Promise<string | null> {
    const [ficha] = await this.db
      .select({ autorId: asCandidatos.criadoPorId })
      .from(asCandidatos)
      .innerJoin(usuarios, eq(usuarios.id, asCandidatos.criadoPorId))
      .where(and(eq(asCandidatos.id, candidatoId), eq(usuarios.ativo, true)))
      .limit(1);
    if (ficha?.autorId) return ficha.autorId;

    /*
     * O DEGRAU (b) TAMBÉM CONFERE `ativo` (veto V4), e a razão é a MESMA do degrau (a): autor
     * desligado assinaria emissão NOVA, e a fila de quem responde por aquele link passaria a apontar
     * para quem já saiu da empresa. Faltava aqui, e a assimetria era descuido, não desenho.
     */
    const [anterior] = await this.db
      .select({ autorId: portalLinks.criadoPorId })
      .from(portalLinks)
      .innerJoin(usuarios, eq(usuarios.id, portalLinks.criadoPorId))
      .where(and(eq(portalLinks.admissaoId, admissaoId), eq(usuarios.ativo, true)))
      .orderBy(desc(portalLinks.criadoEm))
      .limit(1);
    return anterior?.autorId ?? null;
  }

  // ══ A TRAVA: LEITURA, ESCRITA E A FILA DO TIME ══════════════════════════════════════════════

  /** Há trava ABERTA para este candidato? `destravado_em` nulo é o que define "aberta". */
  private async travaAtiva(exec: Executor, candidatoId: string): Promise<boolean> {
    const [linha] = await exec
      .select({ id: portalAcessoTravas.id })
      .from(portalAcessoTravas)
      .where(
        and(
          eq(portalAcessoTravas.asCandidatoId, candidatoId),
          isNull(portalAcessoTravas.destravadoEm),
        ),
      )
      .limit(1);
    return !!linha;
  }

  /**
   * GRAVA OU REFORÇA A TRAVA. Uma linha por candidato (`uq_portal_acesso_travas_candidato`).
   *
   * O `motivo_codigo` DA LINHA EXISTENTE NÃO É SOBRESCRITO, e é o degrau 2 da precedência em forma
   * de SQL: reavaliar apagaria da trilha o que de fato travou, que é justamente o que a fila precisa
   * saber para destravar com conhecimento. O que o reencontro move é `tentativas` (a insistência) e
   * `atualizado_em`.
   *
   * REABRE A TRAVA JÁ DESTRAVADA, porque o motivo voltou a acontecer: o time destravou, a pessoa
   * tentou de novo e discordou de novo, então a linha volta para a fila com o motivo NOVO. Sem isso
   * a segunda divergência passaria batida, e o destrave seria uma isenção permanente.
   */
  private async travar(
    exec: Executor,
    candidatoId: string,
    motivo: MotivoDaTravaDeAcesso,
  ): Promise<void> {
    const agora = new Date();
    await exec
      .insert(portalAcessoTravas)
      .values({ asCandidatoId: candidatoId, motivoCodigo: motivo, travadoEm: agora, tentativas: 1 })
      .onConflictDoUpdate({
        target: portalAcessoTravas.asCandidatoId,
        set: this.reforcoDaTrava(motivo, agora),
      });
  }

  /**
   * O `set` DO `on conflict`, EM UM LUGAR SÓ, porque ele serve aos DOIS escritores da trava (a de um
   * candidato e a do e-mail ambíguo, que grava várias de uma vez).
   *
   * Duas cópias desta régua divergiriam no primeiro ajuste, e a divergência apareceria do jeito mais
   * difícil de ver: uma porta preservando o motivo original e a outra sobrescrevendo, sobre a MESMA
   * linha, dependendo de por onde a pessoa tentou.
   *
   * O `case` MORA NO SQL, e não num `if` de TypeScript, porque a decisão precisa acontecer sobre a
   * linha que o Postgres tem na mão dentro do `on conflict`, e não sobre um valor lido antes. Ele
   * compara com o motivo LITERAL, nunca com `excluded`, e é isso que o mantém correto também no
   * `insert` de várias linhas do ambíguo.
   */
  private reforcoDaTrava(motivo: MotivoDaTravaDeAcesso, agora: Date) {
    return {
      tentativas: sql`${portalAcessoTravas.tentativas} + 1`,
      atualizadoEm: agora,
      // A REABERTURA: só quando a linha estava destravada. Trava viva preserva o motivo ORIGINAL
      // (degrau 2 da precedência: reavaliar apagaria da trilha o que de fato travou); trava já
      // destravada volta para a fila com o motivo NOVO, porque o motivo voltou a acontecer.
      motivoCodigo: sql`case when ${portalAcessoTravas.destravadoEm} is null then ${portalAcessoTravas.motivoCodigo} else ${motivo} end`,
      travadoEm: sql`case when ${portalAcessoTravas.destravadoEm} is null then ${portalAcessoTravas.travadoEm} else ${agora} end`,
      destravadoEm: null,
      destravadoPorId: null,
    };
  }

  /**
   * TRAVA TODOS OS HOMÔNIMOS DE UM E-MAIL AMBÍGUO, EM UM STATEMENT SÓ, e registra UMA linha.
   *
   * ┌─ UM STATEMENT, E NÃO UM LAÇO, e a razão é a escrita PARCIAL ────────────────────────────────┐
   * │ Com o laço, uma exceção no candidato `k` deixava `k-1` travas escritas, trilha nenhuma e um  │
   * │ 500 na cara de quem chamou, ou seja quebrava a resposta única E o rastro no mesmo gesto. Um   │
   * │ `insert` de várias linhas é atômico por si: ou as travas todas existem, ou nenhuma existe, e  │
   * │ a linha de trilha descreve um pedido que de fato aconteceu por inteiro.                       │
   * │                                                                                            │
   * │ O `on conflict` É O MESMO de `travar`, e o `case` continua correto com várias linhas porque o │
   * │ motivo é LITERAL (`EMAIL_AMBIGUO`) e não vem de `excluded`: reencontro só move `tentativas`;  │
   * │ linha já destravada volta para a fila com o carimbo novo.                                     │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A LINHA DE TRILHA É O VETO V1, E ELA NÃO É FORMALIDADE ────────────────────────────────────┐
   * │ Esta é a trava de MAIOR ALCANCE da frente, e era a única sem rastro. Um POST ANÔNIMO em      │
   * │ `solicitar` grava até `TRAVA_AMBIGUO_TETO` linhas em `portal_acesso_travas`, põe todas aquelas │
   * │ pessoas na fila do time e FECHA A PORTA para cada uma, e a Sala De Segurança não tinha UMA    │
   * │ linha para ler sobre isso. A §A.6 exige log sensível permanente e consultável, e "a fila      │
   * │ encheu e ninguém sabe de onde veio" é o oposto disso.                                         │
   * │                                                                                            │
   * │ UMA LINHA POR PEDIDO, e não uma por pessoa travada: o evento descreve o PEDIDO (que é um), e  │
   * │ a contagem por pessoa está na própria tabela, em `tentativas`. `candidato_hash` fica NULO,     │
   * │ como em toda esta porta: não há CPF verificado aqui.                                          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async travarAmbiguo(
    candidatoIds: string[],
    contexto: { ip: string | null; userAgent: string | null },
  ): Promise<void> {
    if (candidatoIds.length === 0) return;
    const agora = new Date();
    await this.db
      .insert(portalAcessoTravas)
      .values(
        candidatoIds.map((asCandidatoId) => ({
          asCandidatoId,
          motivoCodigo: "EMAIL_AMBIGUO" as MotivoDaTravaDeAcesso,
          travadoEm: agora,
          tentativas: 1,
        })),
      )
      .onConflictDoUpdate({
        target: portalAcessoTravas.asCandidatoId,
        set: this.reforcoDaTrava("EMAIL_AMBIGUO", agora),
      });

    await this.registrar("PORTAL_ACESSO_TRAVADO", contexto, { motivoCodigo: "EMAIL_AMBIGUO" });
  }

  /** Só a contagem de insistência, quando a porta recusa por trava já existente. */
  private async bumparTrava(exec: Executor, candidatoId: string): Promise<void> {
    await exec
      .update(portalAcessoTravas)
      .set({ tentativas: sql`${portalAcessoTravas.tentativas} + 1`, atualizadoEm: new Date() })
      .where(
        and(
          eq(portalAcessoTravas.asCandidatoId, candidatoId),
          isNull(portalAcessoTravas.destravadoEm),
        ),
      );
  }

  /**
   * A FILA DE TRAVAS, para a tela do time.
   *
   * §A.6, O QUE ELA NÃO CARREGA: sem CPF, sem e-mail, sem data de nascimento, sem valor informado e
   * sem campo divergente. O `nome` sai porque é dado que o time JÁ vê na Central de Candidatos, e é
   * o único jeito de a fila dizer de quem ela está falando.
   *
   * A BUSCA É POR NOME, e nunca por CPF: busca por CPF é o oráculo de existência que a identificação
   * do candidato fecha desde o primeiro dia, e ela não pode voltar pela tela do time.
   *
   * TODO FILTRO DE LISTA É MÚLTIPLO (§A.28): `motivos` chega já quebrado pelo `parseMulti` da
   * controller, e a cláusula vira `IN`. `situacao` é UM valor porque `ABERTA` e `DESTRAVADA` são o
   * complemento exato uma da outra, e somá-las é o mesmo que não filtrar.
   */
  async listarTravas(filtros: FiltrosDaFilaDeTravas = {}): Promise<TravaDeAcessoItem[]> {
    const condicoes = [];

    const motivos = (filtros.motivos ?? []).filter(Boolean);
    if (motivos.length > 0) {
      condicoes.push(inArray(portalAcessoTravas.motivoCodigo, motivos));
    }
    const situacao = (filtros.situacao ?? "").trim().toUpperCase();
    if (situacao === "ABERTA") condicoes.push(isNull(portalAcessoTravas.destravadoEm));
    if (situacao === "DESTRAVADA") condicoes.push(isNotNull(portalAcessoTravas.destravadoEm));
    const nome = (filtros.nome ?? "").trim();
    if (nome) condicoes.push(sql`${asCandidatos.nome} ilike ${`%${nome}%`}`);

    const linhas = await this.db
      .select({
        id: portalAcessoTravas.id,
        asCandidatoId: portalAcessoTravas.asCandidatoId,
        nome: asCandidatos.nome,
        motivoCodigo: portalAcessoTravas.motivoCodigo,
        travadoEm: portalAcessoTravas.travadoEm,
        tentativas: portalAcessoTravas.tentativas,
        destravadoEm: portalAcessoTravas.destravadoEm,
        destravadoPorNome: usuarios.nome,
      })
      .from(portalAcessoTravas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, portalAcessoTravas.asCandidatoId))
      .leftJoin(usuarios, eq(usuarios.id, portalAcessoTravas.destravadoPorId))
      .where(condicoes.length > 0 ? and(...condicoes) : undefined)
      // ABERTAS PRIMEIRO, mais recentes no topo: a fila é lista de TAREFA, e tarefa aberta vem antes
      // do histórico. `nulls first` porque `destravado_em` nulo É a tarefa aberta.
      .orderBy(sql`${portalAcessoTravas.destravadoEm} asc nulls first`, desc(portalAcessoTravas.travadoEm))
      .limit(500);

    return linhas.map((l) => ({
      id: l.id,
      asCandidatoId: l.asCandidatoId,
      nome: l.nome,
      motivoCodigo: l.motivoCodigo as MotivoDaTravaDeAcesso,
      travadoEm: l.travadoEm.toISOString(),
      tentativas: l.tentativas,
      destravadoEm: l.destravadoEm ? l.destravadoEm.toISOString() : null,
      destravadoPorNome: l.destravadoPorNome ?? null,
    }));
  }

  /**
   * O CATÁLOGO DOS FILTROS, servido por ENDPOINT e não derivado das linhas da página (§A.37).
   *
   * A lista vem de `MOTIVOS_DA_TRAVA_DE_ACESSO` (contrato compartilhado) em vez de ser recopiada
   * aqui, pelo mesmo argumento do `VALORES_FECHADOS` da trilha: duas cópias do mesmo vocabulário
   * divergem no primeiro código novo, e a que divergiria seria esta, que ninguém abre para
   * acrescentar motivo. A ORDEM é a do contrato, do mais comum para o mais raro, e não alfabética: a
   * tela mostra o filtro nesta ordem e quem opera procura primeiro o que mais acontece.
   */
  catalogoDeFiltrosDeTravas(): { motivos: readonly string[]; situacoes: readonly string[] } {
    return { motivos: MOTIVOS_DA_TRAVA_DE_ACESSO, situacoes: ["ABERTA", "DESTRAVADA"] };
  }

  /**
   * DESTRAVA. IDEMPOTENTE, molde de `desbloquearLink` (`portal-identidade.service.ts:804-816`):
   * destravar o que já está destravado NÃO move o carimbo, então o rastro guardado é o do PRIMEIRO
   * destrave e não o do último clique.
   *
   * O AUTOR VEM DA SESSÃO, NUNCA DO CORPO, e é a régua da seção 7 do contrato: autor vindo do corpo
   * é autor escolhido por quem age, ou seja, trilha que o próprio ator escreve.
   *
   * ┌─ O `motivoCodigo` DO CORPO É CONFERIDO CONTRA A TRAVA, E ISSO É MAIS QUE VALIDAÇÃO ─────────┐
   * │ Ele é de catálogo FECHADO (`MOTIVOS_DA_TRAVA_DE_ACESSO`), sem texto livre, e tem de ser o    │
   * │ MESMO motivo da linha. O gesto é de RECONHECIMENTO: "eu sei que esta trava é uma divergência │
   * │ de cadastro e eu a resolvi". Sem essa conferência, o destrave seria um botão que qualquer um  │
   * │ aperta sem olhar o que está desfazendo, e num caso (`CPF_DE_OUTRO_CANDIDATO`) o que se        │
   * │ desfaz é a proteção de DUAS pessoas disputando o mesmo CPF.                                   │
   * │                                                                                             │
   * │ ELE NÃO VIRA COLUNA: a tabela não tem campo de observação, de propósito (§A.6, quem opera    │
   * │ escreve o nome da pessoa em campo livre). Ele vive na TRILHA, em `motivoCodigo`, que já é     │
   * │ campo permitido pela allowlist.                                                               │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A TENTATIVA RECUSADA TAMBÉM VIRA LINHA DE TRILHA, e é exigência do contrato: a pergunta de
   * auditoria não é só "quem conseguiu", é "quem tentou". `TRAVA_JA_DESTRAVADA` é rotina (clique
   * duplo); `TRAVA_INEXISTENTE` é alguém apontando para um id que não existe, que é sinal.
   */
  async destravar(
    travaId: string,
    motivoCodigo: string,
    autor: { id: string },
  ): Promise<{ destravado: boolean }> {
    const [linha] = await this.db
      .select({
        id: portalAcessoTravas.id,
        motivoCodigo: portalAcessoTravas.motivoCodigo,
        destravadoEm: portalAcessoTravas.destravadoEm,
      })
      .from(portalAcessoTravas)
      .where(eq(portalAcessoTravas.id, travaId))
      .limit(1);

    if (!linha) {
      await this.registrar(
        "PORTAL_ACESSO_DESTRAVE_RECUSADO",
        { ip: null, userAgent: null },
        { motivoCodigo: "TRAVA_INEXISTENTE", autorId: autor.id },
      );
      return { destravado: false };
    }

    if (linha.destravadoEm || linha.motivoCodigo !== motivoCodigo) {
      await this.registrar(
        "PORTAL_ACESSO_DESTRAVE_RECUSADO",
        { ip: null, userAgent: null },
        {
          motivoCodigo: linha.destravadoEm ? "TRAVA_JA_DESTRAVADA" : (linha.motivoCodigo as PortalMotivo),
          autorId: autor.id,
        },
      );
      return { destravado: false };
    }

    const abertas = await this.db
      .update(portalAcessoTravas)
      .set({ destravadoEm: new Date(), destravadoPorId: autor.id, atualizadoEm: new Date() })
      .where(and(eq(portalAcessoTravas.id, travaId), isNull(portalAcessoTravas.destravadoEm)))
      .returning({ id: portalAcessoTravas.id });

    const destravado = (abertas?.length ?? 0) > 0;
    if (!destravado) {
      // CORRIDA: dois cliques simultâneos, e o segundo não achou linha aberta. Idempotente, e a
      // tentativa continua virando linha.
      await this.registrar(
        "PORTAL_ACESSO_DESTRAVE_RECUSADO",
        { ip: null, userAgent: null },
        { motivoCodigo: "TRAVA_JA_DESTRAVADA", autorId: autor.id },
      );
      return { destravado: false };
    }

    await this.registrar(
      "PORTAL_ACESSO_DESTRAVADO",
      { ip: null, userAgent: null },
      { motivoCodigo: linha.motivoCodigo as PortalMotivo, autorId: autor.id },
    );
    return { destravado: true };
  }

  // ══ AS PEÇAS ════════════════════════════════════════════════════════════════════════════════

  /**
   * A ÚNICA PORTA DE TRILHA DESTE ARQUIVO, e ela existe para que o `ip` completo e o `userAgent`
   * viajem sempre do mesmo jeito, sem ninguém esquecer o terceiro argumento de `registrar`.
   *
   * §A.6: `cru` pode conter PII (o CPF verificado, em um caso só), e a redução acontece dentro de
   * `montarEventoPortal`, por allowlist. Nada de e-mail, hash de e-mail, código ou nome atravessa a
   * allowlist, porque ela NÃO foi alargada.
   */
  private async registrar(
    tipo: Parameters<PortalTrilhaService["registrar"]>[0],
    contexto: { ip: string | null; userAgent: string | null },
    cru: Record<string, unknown>,
  ): Promise<void> {
    await this.trilha.registrar(
      tipo,
      { ...cru, ip: contexto.ip, userAgent: contexto.userAgent },
      contexto.ip ?? undefined,
    );
  }

  /**
   * O BILHETE VIRA CHAVE DE BALDE POR HMAC, e nunca em claro.
   *
   * O bilhete É credencial: ele vale por 15 minutos e troca CPF por link. O `ThrottlerStorage` guarda
   * as chaves EM MEMÓRIA e elas aparecem em despejo de diagnóstico, então usar o valor cru poria uma
   * credencial viva num lugar que ninguém trata como cofre. Mesmo cuidado dos baldes da identificação
   * (`portal-identidade.service.ts`), que chaveiam pelo HASH do token.
   *
   * O RÓTULO `bilhete` ENTRA NO HMAC pelo mesmo motivo do rótulo de `hashDoEmail`: com o mesmo
   * segredo e sem rótulo, o hash de um bilhete e o de um e-mail vivem no mesmo espaço, e um vale de
   * chave para o outro no dia em que alguém trocar os argumentos de lugar.
   */
  private hashDoBilhete(bilhete: string): string {
    return createHmac("sha256", this.pepperDoCodigo()).update(`bilhete:${bilhete}`).digest("hex");
  }

  /** 23505 = violação de unique. Só o código do driver; a mensagem NÃO é lida (ela traz o CPF). */
  private ehViolacaoDeUnique(erro: unknown): boolean {
    if (erro && typeof erro === "object") {
      const codigo = (erro as { code?: unknown }).code;
      if (typeof codigo === "string" && codigo === "23505") return true;
    }
    return false;
  }
}
