import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import type { ProgressoRegua, ResultadoAuditoria } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatoAlteracoesLog,
  candidatos,
  clientes,
  dadosVagaFolha,
  documentoArquivosColetados,
  documentosAdmissao,
  frentesAdmissao,
  frenteStatusEventos,
  integracaoPandape,
  regrasAuditoria,
  tiposDocumento,
} from "../db/schema";
import { AiClientService, familiaDaFalha, type ArquivoDrive } from "../ai/ai-client.service";
import {
  estadoAposFalha,
  familiaRetentavel,
  INTERVALOS_RETENTATIVA_MS,
  MOTIVO_FALHA_IA,
} from "../domain/falha-auditoria";
import { triarConjunto } from "./conteudo-documento";
import { idDaPastaUrl, montarNomePasta, resolveSubpasta } from "../ai/drive-routing";
import { duplicatasAcesas } from "../ai/drive-duplicatas";
import { filtrarPorSexo } from "../domain/documentos-por-sexo";
import {
  cadastroBancarioParaAuditoria,
  divergenciasReconhecidas,
  TIPO_COMPROVANTE_BANCARIO,
} from "../domain/cadastro-bancario";
import { TravaPorChave } from "../domain/trava-por-chave";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { recomputeFarolGlobal } from "../admissoes/farol";
import { calcSinalizadorPreenchimento, STATUS_INICIAL_FRENTE } from "../domain/admissao";
import { podeAbrirCadastro } from "../domain/frentes";
import { reversaoDerrubaCadastro } from "../domain/esteira";
import { admissaoVivaParaRecuo, podeReabrirDocumento } from "../domain/reabertura-documento";
import { clienteExigeIntegracao } from "../esteira/integracao-obrigatoria.repo";
import { nascerCadastroEIntegracao } from "../esteira/nascimento-cadastro";
import {
  ESTADO_AGUARDANDO_AUDITORIA,
  estadoDocumentoDeAuditoria,
  limitarMotivo,
} from "../domain/auditoria";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { StagingService } from "../staging/staging.service";
import { EnviarParaGiService } from "../gi/enviar-para-gi.service";
import { PandapeArquivosService, type AbortoBaixa } from "../pandape/pandape-arquivos.service";
import {
  limitar,
  motivoFalhaEnvioDrive,
  motivoPandapeSemTipos,
  MOTIVO_DRIVE,
  motivoEnvioParcial,
  somenteAprovadosVaoAoProntuario,
  tiposFaltantesNoArquivamento,
} from "../domain/drive-arquivamento";

/**
 * Precisa (re)arquivar no Drive? Sim quando ainda não há link (null) OU quando o link salvo é um
 * placeholder de MOCK (gerado com DRIVE_MOCK=on): esse link aponta para uma pasta inexistente e
 * resolve 404. Tratá-lo como "não arquivado" faz o próximo evento de documento regravar o link REAL
 * (self-heal), sem depender de limpeza manual do banco. Um link real (`/folders/<id>`) não re-arquiva.
 */
export function precisaArquivarDrive(url: string | null): boolean {
  return url == null || url.includes("/folders/MOCK-");
}

/**
 * Resultado do PÓS-VEREDITO (ver `aplicarPosVeredito`): tudo o que acontece DEPOIS de um documento
 * mudar de estado, independente de quem mudou (IA ou pessoa).
 */
export interface PosVeredito {
  progresso: ProgressoRegua;
  sinalizador: string;
  auditoriaAuto?: { status: string; gateAberto: boolean };
  arquivado?: { pastaUrl: string; pastaJaExistia?: boolean; ignorados?: number };
  /**
   * Preenchido quando a régua fechou mas o envio ao Drive FALHOU. É o canal que impede a falha
   * silenciosa: a tela mostra este texto no mesmo lugar do aviso de descarte. Ausente = nada a
   * avisar (arquivou, ou a régua ainda não fechou).
   */
  avisoDrive?: string;
  /**
   * O RECUO: preenchido quando a régua obrigatória DEIXOU de estar completa e a frente AUDITORIA
   * teve de voltar. Ausente quando não havia o que recuar (régua completa, frente já pendente,
   * admissão finalizada ou encerrada). Ver `recuarAuditoria`.
   */
  recuo?: RecuoDaAuditoria;
}

/** O que o recuo da AUDITORIA de fato desfez. Espelha `ResultadoDaReaberturaDeDocumento`. */
export interface RecuoDaAuditoria {
  /** A frente AUDITORIA voltou de concluída para `ANALISE_PENDENTE`. */
  frenteRecuou: boolean;
  /** A frente CADASTRO_CONTRATO, já nascida, foi derrubada junto (o gate da regra 3 fechou). */
  cadastroDerrubado: boolean;
  /** O farol global mudou de valor no recompute. */
  farolAtualizado: boolean;
}

/**
 * Desfecho do arquivamento. Os dois campos são independentes de propósito: o prontuário pode ter
 * subido E ainda assim faltar documento (o Pandapé não devolveu um tipo), caso em que `arquivado`
 * vem preenchido e `motivo` também. Perder o que EXISTE por causa do que falta seria pior.
 */
interface ResultadoArquivamento {
  arquivado?: { pastaUrl: string; pastaJaExistia?: boolean; ignorados?: number };
  /** Por que não concluiu (ou concluiu incompleto). Já gravado em `admissoes.drive_falha_motivo`. */
  motivo?: string;
}

/**
 * Opções do arquivamento. Nascem com UM caso e o default preserva o comportamento de sempre: sem
 * opção nenhuma, `arquivarNoDrive` faz exatamente o que fazia antes, expurgo da staging incluído.
 */
interface OpcoesArquivamento {
  /**
   * NÃO expurga a staging depois de subir. Existe para a criação de prontuário SOB DEMANDA, que roda
   * em admissão com documento obrigatório ainda PENDENTE: ali o binário que está na staging ainda vai
   * ser auditado, e apagá-lo seria perda irreversível. O fluxo normal (régua fechada) continua
   * expurgando, porque lá não sobrou documento nenhum para auditar.
   */
  preservarStaging?: boolean;
}

/**
 * Desfecho da criação de prontuário SOB DEMANDA (ação do Diagnóstico e do backfill). O formato é o
 * contrato acordado com a tela: `jaExistia` distingue "não fiz nada porque já havia" de "criei", e
 * `motivo` explica a recusa sem obrigar a tela a interpretar exceção.
 */
export interface ProntuarioSobDemanda {
  ok: boolean;
  pastaUrl?: string;
  jaExistia?: boolean;
  motivo?: string;
}

/**
 * Orquestração da auditoria documental incremental (F2 / INT-3, Fase 4). Por documento:
 * staging → IA → grava SÓ o estado/motivo (§A.3 regra 7) → recalcula sinalizador e progresso →
 * ao fechar a régua obrigatória, arquiva no Drive e expurga a staging. O CPF do candidato só
 * trafega para a chamada da IA, NUNCA é logado (§A.6).
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger("AuditoriaService");
  /** Serializa o arquivamento por admissão (OST da duplicação, item 4). Ver `TravaPorChave`. */
  private readonly travaArquivamento = new TravaPorChave();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly staging: StagingService,
    private readonly ai: AiClientService,
    private readonly reguaCompletude: ReguaCompletudeService,
    private readonly drivePastaPai: DrivePastaPaiService,
    private readonly pandapeArquivos: PandapeArquivosService,
    private readonly enviarParaGi: EnviarParaGiService,
  ) {}

  /** Carrega a admissão com o candidato e o cliente (sem expor nada em log). */
  private async carregarAdmissao(admissaoId: string) {
    const [adm] = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
        tipoContrato: admissoes.tipoContrato,
        dataAdmissao: admissoes.dataAdmissao,
        drivePastaUrl: admissoes.drivePastaUrl,
        driveAsoUrl: admissoes.driveAsoUrl,
        // Duplicatas que o diretor já baixou no Diagnóstico: o arquivamento reconfere o Drive e
        // acharia as mesmas pastas de novo, então precisa saber o que NÃO deve reacender.
        driveDuplicatasBaixadas: admissoes.driveDuplicatasBaixadas,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        // Sexo do candidato: condiciona a exigência do Reservista. O arquivamento passou a precisar
        // dele pelo mesmo motivo que a régua (OST do seletor de sexo), ver `tiposExigidosPorSexo`.
        candidatoSexo: candidatos.sexo,
        // DADOS BANCÁRIOS DIGITADOS (melhorias EAC, item 8). Só viajam para a auditoria do
        // comprovante bancário, e é o que finalmente dá conteúdo à regra "Os dados bancários devem
        // coincidir com os informados no cadastro", cadastrada desde sempre e até aqui letra morta:
        // a IA recebia nome e CPF e nada mais, então não tinha contra o que comparar.
        candidatoBanco: candidatos.banco,
        candidatoAgencia: candidatos.agencia,
        candidatoConta: candidatos.conta,
        clienteOperacao: clientes.nomeOperacao,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .where(eq(admissoes.id, admissaoId));
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    // cod_cliente/cargo_id são nuláveis desde a Liberação Admissional, mas o innerJoin em `clientes`
    // acima já descarta a pré-admissão (AGUARDANDO_LIBERACAO) — ela não tem cliente e nunca é
    // auditada. O guard torna o invariante explícito e estreita o tipo para o resto do método.
    if (!adm.codCliente || !adm.cargoId) {
      throw new NotFoundException("Admissão sem cliente/cargo (aguardando liberação).");
    }
    // Reafirma o não-nulo no tipo de retorno (o guard acima garante em runtime).
    return { ...adm, codCliente: adm.codCliente, cargoId: adm.cargoId };
  }

  /**
   * F2 — audita UM documento. Devolve o veredito, o estado persistido, o progresso da régua e o
   * sinalizador; inclui `arquivado` quando o fechamento da régua disparou o arquivamento no Drive.
   */
  async auditarDocumento(
    admissaoId: string,
    tipoDocumentoId: string,
    file: Express.Multer.File | undefined,
    user: AuthUser,
  ) {
    if (!file) throw new BadRequestException("Arquivo obrigatório (campo 'file')");
    return this.auditarBuffer(admissaoId, tipoDocumentoId, file, user);
  }

  /**
   * Auditoria de UM documento a partir de UM arquivo (upload manual ou 1 anexo do pull). É açúcar
   * sobre `auditarConjunto`: um documento de arquivo único é um conjunto de tamanho 1.
   */
  async auditarBuffer(
    admissaoId: string,
    tipoDocumentoId: string,
    arquivo: { buffer: Buffer; originalname: string },
    user: AuthUser,
  ) {
    return this.auditarConjunto(admissaoId, tipoDocumentoId, [arquivo], user);
  }

  /**
   * Núcleo da auditoria por CONJUNTO (BLOCO 1): recebe TODOS os arquivos do MESMO documento (frente e
   * verso de um CPF/RG/CNH, as páginas de uma CTPS) e faz UMA auditoria sobre a peça inteira, com UM
   * veredito e UM registro por (admissão + tipo). Antes cada arquivo era auditado isolado e o upsert
   * fazia o último vencer (gravava o verso e reprovava por dados que estavam na frente); agora a IA
   * julga o conjunto. Aceita qualquer fonte com buffer + nome, então o pull do Pandapé reusa a F2.
   */
  async auditarConjunto(
    admissaoId: string,
    tipoDocumentoId: string,
    arquivos: Array<{ buffer: Buffer; originalname: string }>,
    user: AuthUser,
  ) {
    if (arquivos.length === 0) throw new BadRequestException("Nenhum arquivo para auditar");
    const adm = await this.carregarAdmissao(admissaoId);

    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");

    const agora = new Date();

    // OST A / Bloco 1 — A TRIAGEM DE "PDF PROTEGIDO" SAIU DAQUI, de propósito. O critério que existia
    // neste ponto era a string `/Encrypt` no buffer, e ela aparece também em PDF cifrado APENAS por
    // permissões (impressão/cópia) ou assinado digitalmente, que abre sem senha nenhuma. Isso reprovou
    // a CTPS da Silvia, um documento bom. Detectar "exige senha para ABRIR" exige tentar abrir com
    // senha vazia, e quem faz isso é o ai-service com pypdf (ver `app/pdf_seguranca.py`), que devolve
    // o mesmo INCONFORME com motivo acionável sem gastar chamada de IA. Aqui não se adivinha mais.

    // ══ AS TENTATIVAS VELHAS: LISTADAS AGORA, APAGADAS SÓ DEPOIS, E SÓ SE O NOVO FOR APROVADO ══
    //
    // O QUE ISTO FECHA: o filtro "só sobe o ENTREGUE" (ver `arquivarNoDriveSemTrava`) resolve o tipo
    // reprovado que nunca foi reenviado, e NÃO resolvia o caso mais comum, que é reprovou, reenviou,
    // APROVOU. O estado vive em `documentos_admissao` e é POR TIPO; a pasta temporária é POR ARQUIVO
    // e guardava o histórico das tentativas, então os bytes da tentativa reprovada ficavam lá com o
    // MESMO código de tipo, passavam pelo filtro e subiam ao prontuário permanente junto do aprovado.
    //
    // ══ POR QUE A LIMPEZA NÃO ACONTECE AQUI, E ESTE PARÁGRAFO EXISTE PARA NINGUÉM "CONSERTAR" ═════
    //
    // Apagar as tentativas velhas ANTES de salvar o envio novo destrói o caminho principal da
    // operação, e isso foi medido no código da tela, não deduzido: `AuditoriaController` usa
    // `FileInterceptor("file")`, no SINGULAR; `auditarBuffer` embrulha esse arquivo único como um
    // conjunto de tamanho 1; e o `input` do modal da Esteira NÃO tem `multiple`, lê `files?.[0]` e,
    // depois do primeiro veredito, oferece o botão "Enviar novo arquivo". Ou seja: a tela CONVIDA o
    // consultor a mandar a FRENTE da carteira, receber a reprovação por falta do verso, e mandar o
    // VERSO numa segunda requisição. Limpando antes, a frente seria apagada para dar lugar ao verso,
    // e meio documento subiria ao prontuário permanente sem nada falhar e sem ninguém descobrir. É a
    // §A.33 pelo avesso: destruir o que se tem apostando no que ainda não chegou.
    //
    // A ORDEM CERTA, e ela é de ORDEM, não de lugar:
    //   1. listar aqui o que já existe daquele tipo, e só listar;
    //   2. salvar o conjunto novo e obter o veredito, como sempre;
    //   3. apagar a lista velha SOMENTE quando o veredito novo for VALIDADO (`descartarTentativasVelhas`).
    // Reprovou, não se apaga nada: trocar uma cópia possivelmente boa por uma pior, sem volta, é o
    // pior desfecho possível. E um conjunto incompleto (só o verso) não é aprovado, então o caso da
    // frente e verso nunca chega ao apagamento.
    //
    // CUSTO ACEITO PELO DIRETOR: aprovado o documento, o consultor PERDE a visualização das
    // tentativas velhas no modal. Fica o conjunto que o veredito exibido descreve.
    //
    // ══ O "DOCUMENTO ÚNICO" DO PORTAL NÃO TORNA ESTA GUARDA REDUNDANTE. NÃO A REMOVA ═════════════
    //
    // O diretor decidiu que o CANDIDATO manda frente e verso num arquivo só, e a régua está escrita e
    // testada em `domain/portal-arquivo-unico.ts`. Ela vale para o PORTAL, e só para ele.
    //
    // ESTE caminho continua recebendo VÁRIOS arquivos por tipo, por duas portas que não mudaram: o
    // CONSULTOR, que manda um arquivo por requisição e é convidado pela própria tela a mandar outro
    // depois do veredito (o "Enviar novo arquivo" do modal), e o PANDAPÉ, que traz vários anexos do
    // mesmo tipo vindos de fora. Remover esta guarda achando que o documento único a cobriu faria a
    // frente voltar a ser apagada pelo verso, exatamente como descrito acima, e sem nada falhar.
    const velhasDoTipo = await this.arquivosDaStagingDoTipo(admissaoId, tipo.codigo);

    // 1) Staging efêmera — cada arquivo do conjunto vai a disco e é descartado depois (§A.6). Salva
    //    TODOS, inclusive o que a triagem abaixo vai reprovar: o consultor precisa poder VISUALIZAR
    //    o que o candidato mandou para entender o veredito.
    const stagingPaths: string[] = [];
    for (const f of arquivos) {
      stagingPaths.push(await this.staging.salvar(admissaoId, tipo.codigo, f));
    }

    // OST motivo verdadeiro / Bloco 3 — TRIAGEM DE CONTEÚDO. O que chegou é mesmo um documento?
    // Responder EM TEXTO no formulário do Pandapé, em vez de anexar arquivo, é caso legítimo do
    // acervo (foi o que prendeu um Comprovante de Conta Bancária por 14h). Isso NÃO é falha de
    // sistema, é o arquivo que não serve, logo é VEREDITO: INCONFORME com motivo acionável e SEM
    // gastar chamada de IA. Mesma régua que já valia para o PDF protegido por senha.
    // Não-bloqueio: se ao menos um arquivo do conjunto serve, audita-se o que serve.
    const triagem = triarConjunto(arquivos.map((a, indice) => ({ ...a, indice })));
    const stagingAuditaveis = triagem.auditaveis.map((a) => stagingPaths[a.indice]);

    // 2) Regras ATIVAS do tipo (critério de validade — texto, sem PII).
    const regras = await this.db
      .select({ descricaoRegra: regrasAuditoria.descricaoRegra })
      .from(regrasAuditoria)
      .where(
        and(eq(regrasAuditoria.tipoDocumentoId, tipoDocumentoId), eq(regrasAuditoria.ativo, true)),
      );

    // 3) DESACOPLAMENTO (BLOCO B): grava a COLETA ANTES de auditar, com motivo explicativo (BLOCO 2:
    //    o AGUARDANDO diz por que ainda não auditou). Se a IA cair, a coleta PERMANECE gravada.
    //    `setWhere` protege um doc já ENTREGUE de ser rebaixado antes de a IA confirmar o novo veredito.
    //
    //    NÃO roda quando a triagem já reprovou o conjunto: sem chamada de IA não há o que proteger, e
    //    passar por AGUARDANDO_AUDITORIA, mesmo por um instante, contradiz a regra de que aquele
    //    estado é reservado a falha de SISTEMA (Bloco 3). O veredito é escrito direto.
    if (!triagem.motivoInconforme) {
      await this.db
        .insert(documentosAdmissao)
        .values({
          admissaoId,
          tipoDocumentoId,
          estado: ESTADO_AGUARDANDO_AUDITORIA,
          observacao: "Documento coletado, aguardando a análise por IA.",
        })
        .onConflictDoUpdate({
          target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
          set: {
            estado: ESTADO_AGUARDANDO_AUDITORIA,
            observacao: "Documento coletado, aguardando a análise por IA.",
            // O RELÓGIO DA PARADA NÃO PODE SER REINICIADO POR UMA NOVA TENTATIVA QUE FALHA IGUAL.
            // Provado ao vivo nesta OST: o documento preso recebeu um "Reauditar", falhou com o
            // MESMO 415, e o carimbo pulou de 14h para 0h. Se cada tentativa zerasse o relógio, o
            // marcador de tempo parado (Bloco 5) nunca cruzaria o limiar num documento que é
            // retentado de tempos em tempos, que é justamente o que fica preso para sempre.
            // Documento que JÁ estava aguardando preserva o carimbo original; qualquer transição
            // real de estado carimba normalmente.
            //
            // O "senão" usa `now()` do SQL, NÃO um Date do JS. Interpolar um `Date` cru dentro do
            // template `sql` do drizzle quebrava com "Received an instance of Date": ali o drizzle
            // não conhece o tipo da coluna e repassa o Date direto ao postgres.js, que não o
            // serializa. Isso derrubava TODO "Auditar" de documento válido com 500. `now()` resolve
            // no banco e não passa parâmetro nenhum. (O `${ESTADO_AGUARDANDO_AUDITORIA}` é string,
            // que o postgres.js serializa sem problema.)
            atualizadoEm: sql`case when ${documentosAdmissao.estado} = ${ESTADO_AGUARDANDO_AUDITORIA}
              then ${documentosAdmissao.atualizadoEm} else now() end`,
          },
          setWhere: ne(documentosAdmissao.estado, "ENTREGUE"),
        });
    }

    // 4) VEREDITO. Dois caminhos, um resultado só:
    //    a) triagem reprovou o conjunto inteiro → veredito determinístico, sem IA (Bloco 3);
    //    b) há arquivo auditável → IA, com retentativa só do que é transitório (Bloco 4).
    //    O CPF vai SÓ para a IA; nunca é logado. Todo o conjunto numa chamada, UM veredito.
    let resultado: ResultadoAuditoria;
    if (triagem.motivoInconforme) {
      this.logger.warn(
        `Conjunto sem arquivo auditável: veredito INCONFORME sem gastar IA. tipo=${tipo.codigo}, ` +
          `arquivos=${arquivos.length}.`,
      );
      resultado = {
        valido: false,
        status: "INCONFORME",
        motivo: triagem.motivoInconforme,
        camposConferidos: [],
      };
    } else {
      // Dados bancários digitados: só viajam quando o tipo É o comprovante bancário e o candidato
      // preencheu alguma coisa. É o que tira do papel a regra de coincidência (§A.6, minimização).
      const cadastroBancario = cadastroBancarioParaAuditoria(tipo.codigo, {
        banco: adm.candidatoBanco ?? undefined,
        agencia: adm.candidatoAgencia ?? undefined,
        conta: adm.candidatoConta ?? undefined,
      });
      try {
        resultado = await this.auditarComRetentativa({
          stagingPaths: stagingAuditaveis,
          tipoDocumentoCodigo: tipo.codigo,
          tipoDocumentoNome: tipo.nome,
          candidato: { nome: adm.candidatoNome, cpf: adm.candidatoCpf },
          ...(cadastroBancario ? { cadastroBancario } : {}),
          regras: regras.map((r) => ({ descricaoRegra: r.descricaoRegra })),
        });
      } catch (err) {
        // OST motivo verdadeiro / Bloco 1: o motivo passa a dizer a VERDADE para TODA família, não
        // só para quota. Antes daqui, qualquer falha que não fosse 429 deixava o documento exibindo
        // "aguardando a análise por IA", como se houvesse fila. Não há fila: ele está parado.
        // O estado depende da família (Bloco 3): ENTRADA é problema do arquivo e vira INCONFORME;
        // o resto é problema nosso e o documento continua COLETADO, sem veredito.
        await this.gravarFalhaDeAuditoria(admissaoId, tipoDocumentoId, err);
        throw err;
      }
    }

    // 5) IA respondeu → grava o veredito (SÓ status + motivo, cap 500, sem PII — §A.3 regra 7 / §A.6).
    const estado = estadoDocumentoDeAuditoria(resultado.status);
    const observacao = limitarMotivo(resultado.motivo);
    await this.db
      .insert(documentosAdmissao)
      .values({ admissaoId, tipoDocumentoId, estado, observacao })
      .onConflictDoUpdate({
        target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
        set: { estado, observacao, atualizadoEm: new Date() },
      });

    // 5.1) AS TENTATIVAS VELHAS SAEM AGORA, E SÓ SE ESTE VEREDITO FOI VALIDADO. Ver o bloco longo
    //      lá em cima, antes do salvamento: a ordem é listar, auditar, e só então apagar. Vem ANTES
    //      de `aplicarPosVeredito` porque é ele que dispara o arquivamento quando a régua fecha, e o
    //      byte velho não pode estar na pasta nesse instante.
    await this.descartarTentativasVelhas(
      admissaoId,
      tipoDocumentoId,
      tipo.codigo,
      resultado.status,
      velhasDoTipo,
      stagingPaths,
    );

    // 4.3) DIVERGÊNCIA BANCÁRIA (melhorias EAC, item 8): o comprovante bancário é o único tipo que
    // traz cadastro para comparar, e o que a IA apontou vira AVISO na admissão. Reescrito a cada
    // auditoria deste tipo, inclusive para LIMPAR: corrigido o dado e reauditado o documento, o aviso
    // some sozinho, sem ninguém precisar baixar nada à mão. Não toca estado de documento, régua,
    // farol nem KPI (§A.3 regra 5: marca, não impede).
    if (tipo.codigo === TIPO_COMPROVANTE_BANCARIO) {
      const divergencias = divergenciasReconhecidas(resultado.divergenciasCadastro);
      await this.db
        .update(admissoes)
        .set({
          divergenciaBancaria: divergencias.length ? divergencias.join(",") : null,
          atualizadoEm: agora,
        })
        .where(eq(admissoes.id, admissaoId));
      // §A.6: RÓTULO do campo divergente, jamais o valor de qualquer um dos lados, nem o CPF.
      if (divergencias.length) {
        this.logger.log(
          `Divergência bancária apontada pela auditoria (admissão ${admissaoId}): ${divergencias.join(", ")}.`,
        );
      }
    }

    // 4.4) ASO → o veredito da IA governa o gate de APTO da esteira (§ OST modal): VALIDADO (apto)
    // destrava; INCONFORME/PENDENTE mantém travado. É a I.A que valida, não um flag manual.
    if (tipo.codigo === "ASO") {
      await this.db
        .update(admissoes)
        .set({ asoValidado: resultado.status === "VALIDADO", atualizadoEm: agora })
        .where(eq(admissoes.id, admissaoId));
    }

    // 4.5) ASO VALIDADO → arquiva imediatamente na subpasta ASO do prontuário (Fase 4 ajustes
    // finais), sem esperar o fechamento da régua. O ASO é arquivo único: usa o primeiro do conjunto.
    let asoArquivado: { pastaUrl: string } | undefined;
    if (
      tipo.codigo === "ASO" &&
      resultado.status === "VALIDADO" &&
      precisaArquivarDrive(adm.driveAsoUrl)
    ) {
      asoArquivado = await this.arquivarAsoNoDrive(adm, stagingPaths[0], tipo.codigo, tipo.nome);
    }

    // 5 a 8) PÓS-VEREDITO, um ponto só: sinalizador, progresso, conclusão automática da frente e
    // arquivamento no Drive. Extraído para `aplicarPosVeredito` porque a VALIDAÇÃO HUMANA precisa do
    // MESMO tratamento (ver o comentário do método).
    const pos = await this.aplicarPosVeredito(admissaoId, user);

    return {
      resultado,
      documento: { tipoDocumentoId, estado },
      progresso: pos.progresso,
      sinalizador: pos.sinalizador,
      ...(asoArquivado ? { asoArquivado } : {}),
      ...(pos.auditoriaAuto ? { auditoriaAuto: pos.auditoriaAuto } : {}),
      ...(pos.arquivado ? { arquivado: pos.arquivado } : {}),
      // Falha de arquivamento chega à tela como AVISO, não como erro que apaga o que foi salvo.
      ...(pos.avisoDrive ? { avisoDrive: pos.avisoDrive } : {}),
    };
  }

  /**
   * CHAMADA À IA COM RETENTATIVA SELETIVA (OST motivo verdadeiro, Bloco 4).
   *
   * A política, em uma frase: **retenta o que pode melhorar sozinho, não retenta o que não muda**.
   *  - QUOTA e INDISPONIBILIDADE são transitórias (a janela de quota vira, o motor volta), então
   *    retentam **2 vezes**, com **2s e 6s** de intervalo, no máximo **3 tentativas** no total;
   *  - ENTRADA (415/422) é determinística: o MESMO arquivo dá o MESMO veredito, sempre. Retentar só
   *    queima chamada de IA e mantém o documento preso, então falha de primeira e vira INCONFORME;
   *  - CREDENCIAL não converge sem alguém trocar a credencial, e DESCONHECIDA não se retenta às
   *    cegas. Ambas falham de primeira e ficam visíveis como parada de sistema.
   *
   * Os intervalos são curtos de propósito: este é o SEGUNDO backoff da cadeia (o ai-service já
   * retentou o Vertex antes de responder) e, no upload manual, roda dentro da espera do consultor.
   * Quota longa não se resolve aqui, e não é para se resolver: quem garante que o documento não fica
   * esquecido é o marcador de tempo parado (`domain/auditoria-parada`).
   */
  private async auditarComRetentativa(
    payload: Parameters<AiClientService["auditarDocumento"]>[0],
  ): Promise<ResultadoAuditoria> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa <= INTERVALOS_RETENTATIVA_MS.length; tentativa += 1) {
      try {
        return await this.ai.auditarDocumento(payload);
      } catch (err) {
        ultimoErro = err;
        const familia = familiaDaFalha(err);
        const ehUltima = tentativa === INTERVALOS_RETENTATIVA_MS.length;
        if (!familiaRetentavel(familia) || ehUltima) throw err;
        const espera = INTERVALOS_RETENTATIVA_MS[tentativa];
        this.logger.warn(
          `Auditoria falhou por ${familia} (transitória): retentando em ${espera}ms ` +
            `(tentativa ${tentativa + 2} de ${INTERVALOS_RETENTATIVA_MS.length + 1}).`,
        );
        await new Promise((r) => setTimeout(r, espera));
      }
    }
    throw ultimoErro; // inalcançável: o laço só sai por `return` ou `throw`.
  }

  /**
   * GRAVA A FALHA NO DOCUMENTO com motivo VERDADEIRO (OST motivo verdadeiro, Blocos 1 e 3).
   *
   * Antes, só a quota reescrevia a observação; qualquer outra falha deixava a frase inicial
   * ("Documento coletado, aguardando a análise por IA") no lugar, sugerindo uma fila inexistente.
   * Agora toda família escreve o seu texto, e a família também decide o ESTADO:
   *  - ENTRADA  → INCONFORME. O motor respondeu; quem não serve é o arquivo. É veredito, não espera.
   *  - as demais → segue AGUARDANDO_AUDITORIA, porque a falha é NOSSA e o documento pode estar bom.
   *
   * A gravação NÃO rebaixa documento já ENTREGUE (mesma proteção do passo 3): uma falha de auditoria
   * não pode desfazer um veredito bom que já existia.
   *
   * PÚBLICA porque o ASO da aba Exame (`EsteiraService.anexarAso`) precisa do MESMO tratamento: até
   * esta OST, IA fora do ar deixava o ASO gravado como ENTREGUE, isto é, verde e sem veredito
   * nenhum. Reusar daqui garante que os dois caminhos escrevem o mesmo texto e o mesmo estado por
   * família, em vez de divergirem com o tempo.
   */
  async gravarFalhaDeAuditoria(
    admissaoId: string,
    tipoDocumentoId: string,
    err: unknown,
  ): Promise<void> {
    const familia = familiaDaFalha(err);
    const estado = estadoAposFalha(familia);
    this.logger.warn(
      `Auditoria não concluída: família=${familia}, estado gravado=${estado}. ` +
        `Motivo exibido ao consultor atualizado.`,
    );
    await this.db
      .update(documentosAdmissao)
      .set({
        estado,
        observacao: limitarMotivo(MOTIVO_FALHA_IA[familia]),
        // Mesmo motivo do upsert de coleta: falhar de novo do mesmo jeito NÃO é evento novo, então
        // não rejuvenesce o documento. Só a transição para INCONFORME carimba, porque aí o estado
        // mudou de verdade e a contagem de parada perde o sentido.
        ...(estado === "INCONFORME" ? { atualizadoEm: new Date() } : {}),
      })
      .where(
        and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
          ne(documentosAdmissao.estado, "ENTREGUE"),
        ),
      );
  }

  /**
   * PÓS-VEREDITO: tudo o que tem de acontecer DEPOIS de um documento mudar de estado, seja qual for
   * a mão que mudou.
   *
   * POR QUE EXISTE (OST visualização/descarte, Bloco 1). Estes quatro passos moravam DENTRO do
   * `auditarConjunto`, e por isso só rodavam quando quem dava o veredito era a IA. A validação
   * humana (`ValidacaoHumanaService.validar`) gravava ENTREGUE e parava ali: se ela fosse o
   * documento que FECHAVA a régua, a frente AUDITORIA não ia sozinha para "Análise Finalizada" e os
   * documentos NÃO subiam para o Drive. A admissão ficava com a régua completa e o fluxo parado, sem
   * nada na tela avisando. Com o pós-veredito num ponto só, os dois caminhos passam pelo mesmo lugar
   * e não têm como divergir de novo.
   *
   * Recarrega a admissão de propósito: o chamador pode ter alterado o estado do Drive no meio do
   * caminho (o ASO arquiva antes da régua fechar), e o que decide o arquivamento é o valor CORRENTE.
   *
   * Idempotente nos dois efeitos: `autoConcluirAuditoria` não reescreve frente já concluída, e
   * `precisaArquivarDrive` não re-arquiva quando já existe link real.
   */
  async aplicarPosVeredito(admissaoId: string, user: AuthUser): Promise<PosVeredito> {
    const adm = await this.carregarAdmissao(admissaoId);

    // Sinalizador da admissão (INCONFORMIDADE domina; senão o cálculo do wizard).
    const sinalizador = await this.recalcularSinalizador(admissaoId, adm);

    // Progresso da régua obrigatória.
    const progresso = await this.reguaCompletude.progresso(admissaoId, adm.codCliente, adm.cargoId);

    // Régua obrigatória completa → conclui a Auditoria AUTOMATICAMENTE (Fase 4 item 2): AUDITORIA
    // passa a ANALISE_OK, abre o gate do Cadastro (regra 3) e reavalia o farol (BANCO_AGUARDAR).
    let auditoriaAuto: { status: string; gateAberto: boolean } | undefined;
    let arquivado: { pastaUrl: string } | undefined;
    let avisoDrive: string | undefined;
    let recuo: RecuoDaAuditoria | undefined;
    if (!progresso.completa) {
      // O RAMO QUE NÃO EXISTIA (frente da reabertura de documento). Até aqui o pós-veredito só sabia
      // AVANÇAR: `if (progresso.completa)` e nada de `else`. A consequência era alcançável em
      // produção e silenciosa: qualquer caminho que devolvesse um obrigatório a pendente (o descarte
      // de documento, uma reauditoria que volta INCONFORME) deixava a AUDITORIA em `ANALISE_OK`,
      // concluída, com a régua obrigatória INCOMPLETA, e o gate do Cadastro aberto por uma conclusão
      // que já não se sustentava. Recuar é a outra metade da mesma regra 2/complemento do §A.3.
      recuo = await this.recuarAuditoria(admissaoId, user);
    }
    if (progresso.completa) {
      auditoriaAuto = await this.autoConcluirAuditoria(admissaoId, user);
      // Fechou a régua e ainda não arquivou? → arquiva no Drive e expurga a staging.
      if (precisaArquivarDrive(adm.drivePastaUrl)) {
        // FALHA DE ARQUIVAMENTO NÃO PODE SER SILENCIOSA NEM DESTRUTIVA (OST produção, Bloco 1).
        // O caso real: a régua fechou, a frente foi a "Análise Finalizada" na tela, e o envio ao
        // Drive morreu no 16º arquivo com um erro do Google. Como a exceção subia, a requisição da
        // validação humana terminava em erro DEPOIS de já ter gravado tudo, e o consultor ficava
        // com a tela dizendo "finalizada" e o prontuário vazio. Ninguém era avisado.
        // Agora: o que já foi persistido continua valendo, a staging NÃO é expurgada, a URL segue
        // nula (então a próxima ação na admissão tenta de novo) e o consultor recebe um AVISO.
        try {
          const resultado = await this.arquivarNoDrive(adm);
          arquivado = resultado.arquivado;
          // Motivo apurado lá dentro (sem pasta-pai, sem arquivo, 429, tipo não devolvido): já foi
          // GRAVADO na admissão e agora sobe à tela como aviso, com o texto real do que aconteceu.
          avisoDrive = resultado.motivo;
        } catch (err) {
          avisoDrive = await this.avisoFalhaDrive(err, adm.id);
        }
      }

      // ── GATILHO da peça 3 (Portal→GI), PONTO (a): a régua obrigatória fechou, a admissão está
      // completa do lado da auditoria. É aqui que o EA "manda a pessoa para a folha". HOJE É INERTE:
      // `EnviarParaGiService.enviar` é no-op sem GI configurado (fail-closed). Não lança e não
      // altera o pós-veredito: a auditoria não pode quebrar por causa de um envio que ainda não
      // existe. O cliente do GI é a peça 3. O ponto (b) é o botão manual do time.
      await this.enviarParaGi.enviar(admissaoId);
    }

    return {
      progresso,
      sinalizador,
      ...(auditoriaAuto ? { auditoriaAuto } : {}),
      ...(arquivado ? { arquivado } : {}),
      ...(avisoDrive ? { avisoDrive } : {}),
      ...(recuo ? { recuo } : {}),
    };
  }

  /**
   * O RECUO DA AUDITORIA: o espelho exato de `autoConcluirAuditoria`.
   *
   * QUANDO RODA: a régua obrigatória deixou de estar completa e a frente AUDITORIA ainda está
   * concluída. A frente volta a `ANALISE_PENDENTE`, `concluida: false`, `dataConclusao` nula, e o
   * evento em `frente_status_eventos` vai com **`reversao: true`**, que é o molde da Esteira para
   * recuo de etapa (`esteira.service`, transição de status).
   *
   * IDEMPOTENTE, e isso é requisito: reabrir dois documentos seguidos não recua duas vezes nem
   * duplica evento. A primeira chamada tira a frente de concluída; a segunda encontra a frente já
   * pendente e sai sem escrever nada.
   *
   * A FRENTE CADASTRO É DERRUBADA JUNTO, quando o gate da regra 3 fechar por causa deste recuo. O
   * predicado é `reversaoDerrubaCadastro`, que é a régua da casa para exatamente esta pergunta, e
   * não uma condição nova escrita aqui.
   *
   * DERRUBAR É RECUAR, NÃO APAGAR, e a escolha é deliberada. `frente_status_eventos.frente_id`
   * referencia `frentes_admissao` com ON DELETE CASCADE: apagar a linha do Cadastro levaria junto a
   * TRILHA de todas as transições dela, que é auditoria permanente (§A.6). Então o Cadastro volta ao
   * status inicial, não concluído, com evento de reversão, e o nascimento lazy o reencontra quando o
   * gate reabrir. Nada se perde e o gate fecha do mesmo jeito (`kitLiberado` exige o Cadastro
   * concluído).
   *
   * NÃO ALCANÇA ADMISSÃO FINALIZADA NEM ENCERRADA (`admissaoVivaParaRecuo`, §A.16/§A.19): a carga
   * histórica não é recalculada e quem declinou não volta para fila nenhuma.
   *
   * §A.6: opera por ids, status e datas. Nada de CPF, nome ou URL no log.
   */
  private async recuarAuditoria(admissaoId: string, user: AuthUser): Promise<RecuoDaAuditoria> {
    const nada: RecuoDaAuditoria = {
      frenteRecuou: false,
      cadastroDerrubado: false,
      farolAtualizado: false,
    };

    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm || !admissaoVivaParaRecuo(adm.farolGlobal)) return nada;

    /*
     * ┌─ A GUARDA PROTEGE O EFEITO, E NÃO SÓ AS PORTAS (veto da reauditoria de segurança) ────────┐
     * │ Ela já estava em `descartar` e em `reauditar`, e mesmo assim era CONTORNÁVEL, porque o    │
     * │ recuo mora no pós-veredito COMPARTILHADO: qualquer caminho que des-complete a régua o     │
     * │ dispara. O caminho medido tem um clique: o modal da Esteira oferece "Enviar novo arquivo" │
     * │ em documento JÁ ENTREGUE, o upload comum (`auditarConjunto`) faz upsert incondicional do  │
     * │ estado, a IA devolve INCONFORME, e o Cadastro caía com o envelope da Clicksign VIVO lá    │
     * │ fora, que é exatamente o dano que a guarda define.                                        │
     * │                                                                                            │
     * │ Barrado aqui, o recuo NÃO acontece e a frente fica como está: o documento muda, a esteira │
     * │ não. É a direção segura, porque desfazer uma frente com contrato em assinatura é o que    │
     * │ não tem volta. Vira WARN no log, sem PII (§A.6).                                           │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const veredito = podeReabrirDocumento({
      clicksignStatus: adm.clicksignStatus ?? null,
      kitAssinaturaPath: adm.kitAssinaturaPath ?? null,
      kitAssinaturaEm: adm.kitAssinaturaEm ?? null,
    });
    if (!veredito.pode) {
      this.logger.warn(
        `recuo da AUDITORIA barrado admissao=${admissaoId} motivo=${veredito.motivo ?? "nao informado"}`,
      );
      return nada;
    }

    const frentes = await this.db
      .select({
        id: frentesAdmissao.id,
        tipo: frentesAdmissao.tipo,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
      })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, admissaoId));

    const auditoria = frentes.find((f) => f.tipo === "AUDITORIA");
    // Nada a recuar: frente inexistente (pré-admissão) ou já pendente. É aqui que mora a
    // idempotência da reabertura repetida.
    if (!auditoria?.concluida) return nada;

    const paraStatus = STATUS_INICIAL_FRENTE.AUDITORIA;
    const cadastro = frentes.find((f) => f.tipo === "CADASTRO_CONTRATO");
    const cadastroAbertoAgora = podeAbrirCadastro(
      frentes.map((f) => ({ tipo: f.tipo, concluida: f.concluida, status: f.status })),
    );
    const derrubaCadastro =
      Boolean(cadastro) &&
      reversaoDerrubaCadastro("AUDITORIA", auditoria.status, paraStatus, cadastroAbertoAgora);
    // O Cadastro já no status inicial e não concluído não tem o que derrubar: derrubá-lo de novo
    // seria evento de reversão sem reversão nenhuma.
    const precisaMexerNoCadastro =
      derrubaCadastro &&
      cadastro !== undefined &&
      (cadastro.concluida || cadastro.status !== STATUS_INICIAL_FRENTE.CADASTRO_CONTRATO);

    await this.db.transaction(async (tx) => {
      const agora = new Date();
      await tx
        .update(frentesAdmissao)
        .set({
          status: paraStatus,
          concluida: false,
          dataConclusao: null,
          atualizadoEm: agora,
        })
        .where(eq(frentesAdmissao.id, auditoria.id));
      await tx.insert(frenteStatusEventos).values({
        admissaoId,
        frenteId: auditoria.id,
        tipo: "AUDITORIA",
        deStatus: auditoria.status,
        paraStatus,
        reversao: true,
        autorId: user.id,
      });

      if (precisaMexerNoCadastro && cadastro) {
        await tx
          .update(frentesAdmissao)
          .set({
            status: STATUS_INICIAL_FRENTE.CADASTRO_CONTRATO,
            concluida: false,
            dataConclusao: null,
            atualizadoEm: agora,
          })
          .where(eq(frentesAdmissao.id, cadastro.id));
        await tx.insert(frenteStatusEventos).values({
          admissaoId,
          frenteId: cadastro.id,
          tipo: "CADASTRO_CONTRATO",
          deStatus: cadastro.status,
          paraStatus: STATUS_INICIAL_FRENTE.CADASTRO_CONTRATO,
          reversao: true,
          autorId: user.id,
        });
      }
    });

    const farolAntes = adm.farolGlobal;
    const farolDepois = await recomputeFarolGlobal(this.db, admissaoId);

    this.logger.log(
      `Auditoria RECUADA por régua obrigatória incompleta (admissão ${admissaoId}): ` +
        `${auditoria.status} para ${paraStatus}` +
        `${precisaMexerNoCadastro ? ", Cadastro derrubado" : ""}.`,
    );

    return {
      frenteRecuou: true,
      cadastroDerrubado: precisaMexerNoCadastro,
      farolAtualizado: farolDepois !== null && farolDepois !== farolAntes,
    };
  }

  /**
   * Traduz uma falha de arquivamento em AVISO para o consultor, e registra o motivo real no log.
   *
   * O texto é dirigido a quem está na tela: diz que o veredito FOI salvo (senão a pessoa refaz o
   * trabalho à toa), que os documentos não se perderam, e que o sistema tenta de novo sozinho na
   * próxima ação. §A.6: o log leva o id da admissão e a família da falha, nunca nome nem CPF.
   */
  private async avisoFalhaDrive(err: unknown, admissaoId: string): Promise<string> {
    const familia = familiaDaFalha(err);
    const detalhe = err instanceof Error ? err.message : "erro";
    this.logger.error(
      `Arquivamento no Drive FALHOU (admissão ${admissaoId}): família=${familia}. ` +
        `Staging preservada e URL não gravada, então a próxima ação na admissão tenta de novo. ` +
        `Detalhe: ${detalhe}`,
    );
    // FIM DO SILÊNCIO: a exceção do envio também vira motivo gravado, e não só log e aviso de tela.
    await this.registrarFalhaDrive(admissaoId, motivoFalhaEnvioDrive(`${familia}, ${detalhe}`));
    return (
      "Auditoria concluída e salva, mas o envio ao Drive falhou: os documentos continuam guardados " +
      "aqui e o sistema tentará de novo na próxima ação desta admissão. Se insistir, avise a TI."
    );
  }

  /**
   * Classifica UM ASO pela IA para o gate de APTO da esteira. Devolve o veredito COMPLETO
   * (status + motivo), sem persistir estado de documento nem arquivar: quem grava é o chamador
   * (`EsteiraService.anexarAso`), que é dono da linha do ASO em `documentos_admissao`.
   *
   * O `motivo` VOLTA, e isso é a correção desta OST. Antes o retorno era só
   * `{ status, valido }`: a IA produzia a razão da reprovação (campo obrigatório do schema do
   * Gemini) e ela era descartada exatamente aqui, então o consultor recebia "inconforme" sem saber
   * o que corrigir. Nos demais caminhos (régua, reauditoria, Pandapé, termo de banco) o motivo
   * sempre foi gravado e exibido; o ASO era o único buraco.
   *
   * A STAGING AGORA SOBREVIVE À CLASSIFICAÇÃO, e isso também é deliberado. O `finally` que apagava
   * o arquivo tornava impossível VISUALIZAR o ASO recebido, enquanto todo documento da régua pode
   * ser aberto na tela (`DocumentoArquivoService`). Sem o arquivo não há como o consultor conferir
   * um ASO reprovado, que é justamente quando ele mais precisa olhar. Fica sob as MESMAS regras dos
   * outros documentos: TTL de 48h da staging e expurgo no fechamento da régua (§A.6).
   *
   * O ASO é ARQUIVO ÚNICO (a régua nunca pede frente e verso dele), então cada envio SUBSTITUI o
   * anterior na staging. Sem isso, reenviar o ASO acumularia peças que apareceriam como um conjunto
   * na visualização e subiriam duplicadas no arquivamento.
   */
  async classificarAso(admissaoId: string, arquivo: { buffer: Buffer; originalname: string }) {
    const adm = await this.carregarAdmissao(admissaoId);
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "ASO"),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento ASO não cadastrado");

    await this.limparStagingDoTipo(admissaoId, tipo.codigo);
    const stagingPath = await this.staging.salvar(admissaoId, tipo.codigo, arquivo);
    const regras = await this.db
      .select({ descricaoRegra: regrasAuditoria.descricaoRegra })
      .from(regrasAuditoria)
      .where(and(eq(regrasAuditoria.tipoDocumentoId, tipo.id), eq(regrasAuditoria.ativo, true)));
    const resultado = await this.ai.auditarDocumento({
      stagingPaths: [stagingPath],
      tipoDocumentoCodigo: tipo.codigo,
      tipoDocumentoNome: tipo.nome,
      candidato: { nome: adm.candidatoNome, cpf: adm.candidatoCpf },
      regras: regras.map((r) => ({ descricaoRegra: r.descricaoRegra })),
    });
    return {
      tipoDocumentoId: tipo.id,
      status: resultado.status,
      valido: resultado.status === "VALIDADO",
      motivo: resultado.motivo,
    };
  }

  /**
   * Apaga da staging os arquivos de UM tipo daquela admissão. Chamador ÚNICO: o reenvio do ASO
   * (`classificarAso`), onde o documento é de arquivo único e o novo substitui o anterior no mesmo
   * ato, sem veredito no meio.
   *
   * NÃO É O CAMINHO DA RÉGUA, e a diferença importa: `auditarConjunto` julga um CONJUNTO montado ao
   * longo de VÁRIAS requisições (a tela manda um arquivo por vez), então lá o descarte é condicionado
   * ao veredito e vive em `descartarTentativasVelhas`. Aqui não há conjunto a perder.
   *
   * Falha ao remover não derruba o fluxo: o TTL de 48h da staging pega o resto. §A.6: nada de
   * caminho no log.
   */
  private async limparStagingDoTipo(admissaoId: string, codigoTipo: string): Promise<void> {
    for (const a of await this.arquivosDaStagingDoTipo(admissaoId, codigoTipo)) {
      await this.staging.removerArquivo(a.caminho).catch(() => undefined);
    }
  }

  /**
   * Os arquivos que a staging tem daquele tipo, casando pelo código SANITIZADO, que é o que vai para
   * o nome do arquivo (`{codigo saneado}__{uuid}`). Mesma régua de `arquivarNoDriveSemTrava`.
   */
  private async arquivosDaStagingDoTipo(admissaoId: string, codigoTipo: string) {
    const alvo = codigoTipo.replace(/[^a-zA-Z0-9_-]/g, "_");
    return (await this.staging.listar(admissaoId)).filter((a) => a.codigoTipo === alvo);
  }

  /**
   * DESCARTA AS TENTATIVAS VELHAS DE UM TIPO, DEPOIS DE O NOVO VEREDITO SER **VALIDADO**.
   *
   * ══ A REGRA, E CADA CONDIÇÃO EXISTE POR UM CASO REAL ═══════════════════════════════════════════
   *
   *  - **SÓ COM VALIDADO.** Reprovou, nada é apagado: trocar uma cópia possivelmente boa pela pior,
   *    sem volta, é o pior desfecho. E é isto que protege o conjunto montado em várias requisições
   *    (frente e verso), porque conjunto incompleto não é aprovado. Ver o bloco longo em
   *    `auditarConjunto`, que mede isso no código da tela.
   *  - **O QUE ACABOU DE ENTRAR NUNCA SAI.** A staging deduplica por CONTEÚDO: reenviar os MESMOS
   *    bytes devolve o caminho que já existia, e ele aparece nas duas listas. Sem esta exclusão, o
   *    reenvio idêntico apagaria o próprio arquivo aprovado.
   *  - **QUEM APAGA O ARQUIVO APAGA A MARCA DE DEDUP JUNTO**, e este é o ponto que, sozinho, fabrica
   *    um beco sem saída. Sem limpar `documento_arquivos_coletados`, o estado vira "sem arquivo e sem
   *    caminho de volta": a varredura do Pandapé vê acervo idêntico ao marcado e decide
   *    `PULAR_SEM_BAIXAR`, e a reauditoria não encontra o que rebaixar. O molde é o
   *    `DocumentoArquivoService.descartar`, que faz as duas coisas no mesmo ato e pelo mesmo motivo.
   *    Apagamos as marcas do TIPO inteiro: os chamadores que mantêm marcas (a varredura do Pandapé e
   *    a reauditoria) regravam as do conjunto atual logo depois, e um tipo ENTREGUE sem marca é o
   *    caso já previsto em `decidirColeta`, que ele pula em vez de rebaixar à toa.
   *  - **O APAGAMENTO É CONTADO NO LOG.** Antes ele era silêncio absoluto. §A.6: quantidade e código
   *    de tipo, nunca caminho, nome de arquivo ou nome de pessoa.
   *
   * Falha ao remover não derruba o fluxo: o veredito já está gravado, e o TTL de 48h pega o resto.
   */
  private async descartarTentativasVelhas(
    admissaoId: string,
    tipoDocumentoId: string,
    codigoTipo: string,
    statusDoVeredito: string,
    velhas: Array<{ caminho: string }>,
    caminhosDoEnvioAtual: string[],
  ): Promise<void> {
    if (statusDoVeredito !== "VALIDADO") return;
    const atuais = new Set(caminhosDoEnvioAtual);
    const alvos = velhas.filter((a) => !atuais.has(a.caminho));
    if (alvos.length === 0) return;

    let removidos = 0;
    let falhas = 0;
    for (const a of alvos) {
      try {
        await this.staging.removerArquivo(a.caminho);
        removidos += 1;
      } catch {
        falhas += 1;
      }
    }

    if (removidos > 0) {
      await this.db
        .delete(documentoArquivosColetados)
        .where(
          and(
            eq(documentoArquivosColetados.admissaoId, admissaoId),
            eq(documentoArquivosColetados.tipoDocumentoId, tipoDocumentoId),
          ),
        )
        .catch(() => undefined);
    }

    // §A.6: contagem e código do tipo. Sem caminho, sem nome de arquivo, sem PII.
    this.logger.log(
      `Tentativas anteriores descartadas após veredito VALIDADO (admissão ${admissaoId}): ` +
        `tipo=${codigoTipo}, removidos=${removidos}${falhas > 0 ? `, falhas=${falhas}` : ""}, ` +
        `marcas de dedup do tipo apagadas.`,
    );
  }

  /**
   * Fase 4 item 2 — ao completar a régua obrigatória (todos os obrigatórios VALIDADO), conclui a
   * Auditoria SEM clique do consultor: AUDITORIA → ANALISE_OK (concluída), nascimento lazy do
   * Cadastro quando o gate abre (regra 3) e reavaliação do farol (item 1). Idempotente: se a
   * AUDITORIA já está concluída, não reescreve. O autor do evento é o consultor que disparou a
   * auditoria. (Régua completa = zero obrigatórios pendentes → consistente com a regra 9 — gate da
   * IA não avança com pendências obrigatórias.)
   */
  private async autoConcluirAuditoria(
    admissaoId: string,
    user: AuthUser,
  ): Promise<{ status: string; gateAberto: boolean }> {
    const frentes = await this.db
      .select({
        id: frentesAdmissao.id,
        tipo: frentesAdmissao.tipo,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
      })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, admissaoId));

    const auditoria = frentes.find((f) => f.tipo === "AUDITORIA");
    // O STATUS VAI JUNTO (OST "Liberado Para Cadastro Sem ASO"): o gate passou a reconhecer o EXAME
    // liberado sem ASO, e ele só o vê se o status chegar. Sem esta linha a I.A fecharia a Auditoria
    // de uma admissão já liberada e o Cadastro não nasceria, que é o caminho fail-closed.
    const estadoDepois = frentes.map((f) =>
      f.tipo === "AUDITORIA"
        ? { tipo: f.tipo, concluida: true, status: f.status }
        : { tipo: f.tipo, concluida: f.concluida, status: f.status },
    );
    const gateAberto = podeAbrirCadastro(estadoDepois);

    // Já concluída → nada a fazer (idempotente).
    if (!auditoria || auditoria.concluida) {
      return { status: auditoria?.status ?? "ANALISE_OK", gateAberto };
    }

    // Item 1: nascendo o Cadastro, nasce a Integração junto (só para cliente que exige). Leitura
    // FORA da transação, no mesmo padrão dos demais caminhos.
    const precisaNascerCadastro =
      gateAberto && !frentes.some((f) => f.tipo === "CADASTRO_CONTRATO");
    const alvo = precisaNascerCadastro
      ? await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) })
      : null;
    const exigeIntegracao = precisaNascerCadastro
      ? await clienteExigeIntegracao(this.db, alvo?.codCliente)
      : false;

    await this.db.transaction(async (tx) => {
      const agora = new Date();
      await tx
        .update(frentesAdmissao)
        .set({ status: "ANALISE_OK", concluida: true, dataConclusao: agora, atualizadoEm: agora })
        .where(eq(frentesAdmissao.id, auditoria.id));
      await tx.insert(frenteStatusEventos).values({
        admissaoId,
        frenteId: auditoria.id,
        tipo: "AUDITORIA",
        deStatus: auditoria.status,
        paraStatus: "ANALISE_OK",
        reversao: false,
        autorId: user.id,
      });
      // Nascimento lazy do Cadastro quando o gate abre (regra 3) e ainda não existe. A INTEGRAÇÃO
      // nasce junto (item 1 da OST dos 3 ajustes), pela MESMA porta única dos outros dois caminhos:
      // este é justamente o caminho que a §A.26 conta ter quebrado calado por ser esquecido.
      if (precisaNascerCadastro) {
        await nascerCadastroEIntegracao(tx, { admissaoId, agora, exigeIntegracao });
      }
    });

    await recomputeFarolGlobal(this.db, admissaoId);
    return { status: "ANALISE_OK", gateAberto };
  }

  /** GET progresso — barra "X de Y" da régua obrigatória. */
  async progresso(admissaoId: string): Promise<ProgressoRegua> {
    const adm = await this.carregarAdmissao(admissaoId);
    return this.reguaCompletude.progresso(admissaoId, adm.codCliente, adm.cargoId);
  }

  /**
   * SÓ O SINALIZADOR, e nada mais. É o `aplicarPosVeredito` **sem** o pós-veredito.
   *
   * POR QUE EXISTE, e por que é uma porta estreita de propósito (autorização do diretor, §A.26). O
   * ASO da aba Exame precisa atualizar o `sinalizador_preenchimento` NA HORA em que a I.A reprova,
   * senão a admissão continua exibindo "OK" com um ASO recusado dentro até alguém abrir a auditoria.
   * O caminho pronto para isso seria `aplicarPosVeredito`, mas ele faz mais três coisas: mede a
   * régua, **conclui a Auditoria sozinho** e **arquiva o prontuário no Drive**. O anexo de ASO nunca
   * disparou nenhuma dessas, e o diretor autorizou o ajuste com uma condição explícita: atualizar o
   * sinalizador **não pode** criar gatilho de conclusão nem de arquivamento.
   *
   * Então não se reusa o caminho largo. Este método chama só `recalcularSinalizador`, que lê os
   * documentos e a vaga e escreve UMA coluna (`admissoes.sinalizador_preenchimento`). Não toca
   * frentes, não toca farol, não mede régua, não fala com o Drive.
   *
   * Quem precisar do fluxo completo continua chamando `aplicarPosVeredito`: os dois caminhos existem
   * separados justamente para que ninguém ganhe o efeito do outro sem pedir.
   */
  async sinalizadorApenas(admissaoId: string): Promise<string> {
    return this.recalcularSinalizador(admissaoId, await this.carregarAdmissao(admissaoId));
  }

  /**
   * Recalcula `sinalizador_preenchimento`. Documento INCONFORME domina (→ INCONFORMIDADE, §A.3 — os
   * sinalizadores de auditoria pertencem à F2). Sem inconformidade, volta ao cálculo do wizard (F5).
   */
  private async recalcularSinalizador(
    admissaoId: string,
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
  ): Promise<string> {
    const docs = await this.db
      .select({ estado: documentosAdmissao.estado })
      .from(documentosAdmissao)
      .where(eq(documentosAdmissao.admissaoId, admissaoId));
    const temInconforme = docs.some((d) => d.estado === "INCONFORME");

    let sinalizador: string;
    if (temInconforme) {
      sinalizador = "INCONFORMIDADE";
    } else {
      const vaga = await this.db.query.dadosVagaFolha.findFirst({
        where: eq(dadosVagaFolha.admissaoId, admissaoId),
      });
      sinalizador = calcSinalizadorPreenchimento({
        candidato: { nome: adm.candidatoNome, cpf: adm.candidatoCpf },
        codCliente: adm.codCliente,
        cargoId: adm.cargoId,
        dataAdmissao: adm.dataAdmissao,
        tipoContrato: adm.tipoContrato,
        vagaFolha: { salario: vaga?.salario },
      });
    }

    await this.db
      .update(admissoes)
      .set({ sinalizadorPreenchimento: sinalizador as "PENDENTE", atualizadoEm: new Date() })
      .where(eq(admissoes.id, admissaoId));
    return sinalizador;
  }

  /**
   * Arquiva SÓ o ASO no Drive logo após a auditoria VALIDADO (Fase 4 ajustes finais — item 1). Mesmo
   * roteamento por contrato/cliente; sobe o arquivo na subpasta ASO do prontuário (pasta criada de
   * forma idempotente). Grava `drive_aso_url` (referência, não PII — §A.6) e remove o ASO da staging
   * para não duplicar no lote do fechamento da régua. Sem pasta-pai mapeada → não arquiva (log).
   */
  private async arquivarAsoNoDrive(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
    stagingPath: string,
    codigoTipo: string,
    nomeTipo: string,
  ): Promise<{ pastaUrl: string } | undefined> {
    const pastaPaiId = await this.drivePastaPai.resolver(adm.tipoContrato, adm.codCliente);
    if (!pastaPaiId) {
      this.logger.warn(
        `ASO não arquivado: sem pasta-pai do Drive para contrato/cliente da admissão ${adm.id}.`,
      );
      return undefined;
    }
    const arquivo: ArquivoDrive = {
      stagingPath,
      nomeFinal: `${nomeTipo}_${adm.candidatoNome.toUpperCase()}`,
      subpasta: resolveSubpasta(codigoTipo),
    };
    // ÂNCORA também aqui: o ASO vai para a MESMA pasta do prontuário, então usar o link já gravado
    // impede que o arquivamento do ASO abra uma segunda pasta quando roda junto com o dos documentos.
    const ancora = idDaPastaUrl(adm.drivePastaUrl) ?? idDaPastaUrl(adm.driveAsoUrl);
    const { pastaUrl } = await this.ai.arquivarDrive({
      parentFolderId: pastaPaiId,
      pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
      arquivos: [arquivo],
      ...(ancora ? { pastaId: ancora } : {}),
    });
    await this.db
      .update(admissoes)
      .set({ driveAsoUrl: pastaUrl, atualizadoEm: new Date() })
      .where(eq(admissoes.id, adm.id));
    await this.staging.removerArquivo(stagingPath);
    this.logger.log(`ASO arquivado no Drive (admissão ${adm.id}).`);
    return { pastaUrl };
  }

  /**
   * ARQUIVAMENTO DO ASO NO PRONTUÁRIO, PELOS DOIS CAMINHOS DO APTO.
   *
   * Nasceu para o APTO MANUAL (OST melhorias EAC, item 12) partindo de uma premissa que a base
   * desmentiu: a de que "o ASO já sobe sozinho quando a I.A o valida (passo 4.5)". O passo 4.5 vive
   * em `auditarConjunto`, que é o caminho da RÉGUA (tela de Auditoria). O ASO da operação real não
   * passa por ali: ele sobe na aba EXAME (`EsteiraService.anexarAso`), que chama `classificarAso`,
   * um classificador que de propósito não arquiva nada. Resultado medido em 13/08/2026: 186
   * admissões APTAS com ASO validado pela I.A e `drive_aso_url` nulo em TODAS, ou seja, nenhum ASO
   * jamais chegou à subpasta ASO do prontuário por este caminho.
   *
   * Por isso o método deixou de ser "do APTO manual" e passou a ser o ponto ÚNICO de arquivamento do
   * ASO, chamado pelos dois caminhos que levam a frente EXAME a APTO:
   *  - `mudarStatus`, quando um humano marca APTO na esteira;
   *  - `anexarAso`, quando o veredito da I.A conclui a frente sozinho (transição pós-ASO).
   *
   * IDEMPOTENTE E SEGURO POR CONSTRUÇÃO, porque os dois o chamam BEST-EFFORT depois da transição:
   *  - `precisaArquivarDrive` barra o re-arquivamento (não abre segunda pasta nem re-sobe);
   *  - sem ASO na staging (o APTO manual pode não ter documento nenhum), é no-op silencioso.
   * Nada aqui altera a frente nem o farol: é só o arquivo indo para a pasta do candidato.
   *
   * NÃO DUPLICA COM O FECHAMENTO DA RÉGUA, e o encaixe já existia esperando este gatilho:
   * `arquivarAsoNoDrive` remove o ASO da staging ao subir, então o lote do fechamento não o
   * reenvia, e `completarStagingParaArquivamento` já exclui o ASO dos faltantes quando
   * `drive_aso_url` está gravado, então o Pandapé também não é chamado para rebaixá-lo.
   */
  async arquivarAso(admissaoId: string): Promise<{ pastaUrl: string } | undefined> {
    const adm = await this.carregarAdmissao(admissaoId);
    if (!precisaArquivarDrive(adm.driveAsoUrl)) return undefined; // já arquivado (caminho da I.A).

    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "ASO"),
    });
    if (!tipo) return undefined;

    // O ASO é arquivo único; pega o da staging se existir. `codigoTipo` na staging é sanitizado, e
    // "ASO" já é alfanumérico, então casa direto.
    const aso = (await this.staging.listar(admissaoId)).find((a) => a.codigoTipo === "ASO");
    if (!aso) return undefined; // APTO manual sem ASO anexado: nada a arquivar.

    return this.arquivarAsoNoDrive(adm, aso.caminho, tipo.codigo, tipo.nome);
  }

  /**
   * CRIA O PRONTUÁRIO SOB DEMANDA, para a admissão que fechou a Auditoria À MÃO com documento
   * obrigatório ainda pendente. É a ação da tela de Diagnóstico (restrita a MASTER/SUPER_ADMIN) e o
   * caminho que o backfill reusa.
   *
   * O BURACO QUE ISTO FECHA, medido: o único gatilho de arquivamento é o pós-veredito, e lá ele mora
   * dentro do `if (progresso.completa)`. Quem conclui a frente pela esteira com obrigatório pendente
   * conclui de verdade, e o prontuário NUNCA nasce: sem registro de falha, sem sinal, sem nada em
   * tela nenhuma. São 31 admissões concluídas nessa situação.
   *
   * ANTI DUPLICAÇÃO EM DUAS CAMADAS, e nenhuma é opcional:
   *  1. admissão que JÁ tem pasta volta na hora, sem tocar no Drive (`jaExistia`);
   *  2. o arquivamento passa pela TRAVA por admissão e pela ÂNCORA do link, que é o que fecha a
   *     corrida entre duas execuções simultâneas (ver `arquivarNoDrive`).
   * Por isso rodar duas vezes seguidas não cria duas pastas.
   *
   * PRESERVA OS ARQUIVOS (decisão do diretor): aqui a régua está ABERTA, então o binário que está na
   * staging ainda vai ser auditado, e apagá-lo seria perda irreversível.
   *
   * NÃO abre porta nova de escrita de `drive_pasta_url`: quem grava continua sendo o
   * `arquivarNoDriveSemTrava`, o mesmo escritor do fluxo vivo.
   */
  async criarProntuarioSobDemanda(
    admissaoId: string,
    user: AuthUser | null,
  ): Promise<ProntuarioSobDemanda> {
    let adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>;
    try {
      adm = await this.carregarAdmissao(admissaoId);
    } catch (err) {
      // Admissão inexistente, ou ainda sem cliente/cargo: é recusa COM MOTIVO, não erro de servidor.
      // A tela precisa dizer o porquê, e não mostrar uma falha genérica.
      if (err instanceof NotFoundException) return { ok: false, motivo: err.message };
      throw err;
    }

    // CAMADA 1. `precisaArquivarDrive` é o mesmo predicado do fluxo vivo (link real = arquivado;
    // placeholder de MOCK = ainda não), então não nasce aqui uma segunda régua do que é "ter pasta".
    if (!precisaArquivarDrive(adm.drivePastaUrl)) {
      return { ok: true, jaExistia: true, ...(adm.drivePastaUrl ? { pastaUrl: adm.drivePastaUrl } : {}) };
    }

    try {
      // CAMADA 2: trava por admissão e âncora, ambas dentro do `arquivarNoDrive`.
      const resultado = await this.arquivarNoDrive(adm, { preservarStaging: true });
      if (!resultado.arquivado) {
        return { ok: false, motivo: resultado.motivo ?? "O prontuário não foi criado." };
      }
      await this.registrarTrilhaProntuario(adm.id, resultado.arquivado.pastaUrl, user);
      // §A.6: id de admissão e id de autor, nunca nome, CPF ou URL.
      this.logger.log(
        `Prontuário criado sob demanda (admissão ${adm.id}), staging PRESERVADA, ` +
          `por=${user?.id ?? "sistema"}.`,
      );
      return {
        ok: true,
        pastaUrl: resultado.arquivado.pastaUrl,
        // O prontuário pode nascer incompleto (é o esperado aqui, a régua está aberta): o motivo sobe
        // junto para a tela dizer o que faltou, sem transformar isso em recusa.
        ...(resultado.motivo ? { motivo: resultado.motivo } : {}),
      };
    } catch (err) {
      // Mesmo tratamento do fluxo vivo: motivo gravado na admissão, log sem PII, nada apagado.
      return { ok: false, motivo: await this.avisoFalhaDrive(err, adm.id) };
    }
  }

  /**
   * TRILHA da criação sob demanda: QUEM gerou e QUANDO, em `candidato_alteracoes_log`, que é a
   * tabela que o sistema já usa para ação fora do padrão e que a ficha da admissão já renderiza. O
   * log do serviço rotaciona e o diretor não consegue consultar, então ele não serve de trilha.
   *
   * §A.6: grava a referência do DRIVE (o mesmo valor que já vive em `admissoes.drive_pasta_url`, e
   * cuja persistência é a permitida), nunca URL externa, nome ou CPF. `autor_id` fica nulo quando
   * quem roda é o sistema (backfill), no que a coluna já prevê.
   *
   * FALHAR AQUI NÃO DESFAZ A PASTA, que já existe: vira ERRO no log, no mesmo princípio da
   * notificação da INT-4. Lançar não desfaria nada e ainda arriscaria uma segunda pasta na
   * retentativa.
   */
  private async registrarTrilhaProntuario(
    admissaoId: string,
    pastaUrl: string,
    user: AuthUser | null,
  ): Promise<void> {
    try {
      await this.db.insert(candidatoAlteracoesLog).values({
        admissaoId,
        campo: "prontuario_sob_demanda",
        valorAnterior: null,
        valorNovo: pastaUrl,
        autorId: user?.id ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Trilha da criação sob demanda NÃO gravada (admissão ${admissaoId}): ` +
          `${err instanceof Error ? err.message : "erro"}. A pasta foi criada e continua válida.`,
      );
    }
  }

  /**
   * Arquiva os documentos da staging no Drive (INT-2). Resolve a pasta-pai por contrato/cliente; se
   * não resolver, NÃO arquiva (deixa drivePastaUrl null e a staging viva até o TTL), logando sem PII.
   * Em sucesso, grava a URL da pasta (referência, não PII) e expurga a staging da admissão.
   *
   * ANTES DE ARQUIVAR, COMPLETA A STAGING (OST re-baixar do Pandapé). A staging tem TTL de 48h e a
   * régua pode fechar muito depois da coleta (o caso real: documento validado à mão dias depois).
   * Quando isso acontecia, este método achava a pasta vazia e devolvia `undefined` em silêncio.
   * Agora ele levanta os tipos ENTREGUES, vê o que não tem arquivo e re-baixa só esses do Pandapé.
   *
   * TODO desfecho que não conclui GRAVA O MOTIVO em `admissoes.drive_falha_motivo`, e a conclusão
   * limpa. Nunca mais falha calada.
   *
   * SÓ SOBE O QUE ESTÁ ENTREGUE (decisão do diretor). O lote é filtrado por VEREDITO antes de
   * qualquer outra conta: reprovado e não decidido ficam de fora do prontuário. Ver o bloco do
   * filtro em `arquivarNoDriveSemTrava`.
   */
  private async arquivarNoDrive(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
    opcoes?: OpcoesArquivamento,
  ): Promise<ResultadoArquivamento> {
    // TRAVA POR ADMISSÃO (OST da duplicação, item 4): duas execuções simultâneas da MESMA admissão
    // eram a causa provada das pastas duplicadas. A segunda espera a primeira e, quando chega a vez
    // dela, o link já está gravado e vira âncora. A releitura da admissão dentro da trava é o que
    // torna isso verdade: sem ela, a segunda ainda usaria o `adm` carregado ANTES da espera.
    return this.travaArquivamento.executar(adm.id, async () =>
      this.arquivarNoDriveSemTrava(await this.carregarAdmissao(adm.id), opcoes),
    );
  }

  private async arquivarNoDriveSemTrava(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
    opcoes?: OpcoesArquivamento,
  ): Promise<ResultadoArquivamento> {
    const pastaPaiId = await this.drivePastaPai.resolver(adm.tipoContrato, adm.codCliente);
    if (!pastaPaiId) {
      this.logger.warn(
        `Arquivamento ignorado: sem pasta-pai do Drive para contrato/cliente da admissão ${adm.id}.`,
      );
      await this.registrarFalhaDrive(adm.id, MOTIVO_DRIVE.SEM_PASTA_PAI);
      return { motivo: MOTIVO_DRIVE.SEM_PASTA_PAI };
    }

    // Completa a staging com o que faltar, re-baixando do Pandapé só os tipos ausentes. Devolve o
    // motivo quando o prontuário vai ficar incompleto (nada aqui escreve veredito de documento).
    const motivoIncompleto = await this.completarStagingParaArquivamento(adm);

    // ══ SÓ O APROVADO SOBE AO PRONTUÁRIO (decisão do diretor) ═══════════════════════════════════
    //
    // O filtro por VEREDITO é aplicado aqui, sobre o que está na pasta temporária. Antes, o lote era
    // TODO arquivo presente no instante do fechamento, sem consultar estado de documento nenhum, e
    // arquivo REPROVADO pela IA subia junto com os aprovados (ver
    // `somenteAprovadosVaoAoProntuario`, que carrega a régra inteira e a consequência intencional
    // sobre o documento facultativo reprovado).
    //
    // A ORDEM IMPORTA, E ELA É A METADE DIFÍCIL DESTA MUDANÇA: o filtro vem ANTES do cálculo de
    // `semArquivos`. A regra do diretor é que RÉGUA FECHADA SIGNIFICA PRONTUÁRIO CRIADO SEMPRE,
    // inclusive sem arquivo nenhum. Filtrar depois criaria a pasta contando arquivo reprovado como
    // se estivesse lá, ou seja, prontuário que se diz completo sem estar.
    //
    // A COMPARAÇÃO USA O CÓDIGO SANITIZADO, a mesma régua de `completarStagingParaArquivamento`:
    // o nome do arquivo na pasta é `{codigo saneado}__{uuid}`.
    const entreguesSanitizados = (await this.documentosEntregues(adm.id)).map((d) =>
      sanitizarCodigo(d.codigo),
    );
    const naStagingAgora = await this.staging.listar(adm.id);
    const arquivosStaging = somenteAprovadosVaoAoProntuario(naStagingAgora, entreguesSanitizados);
    const barrados = naStagingAgora.filter((a) => !arquivosStaging.includes(a));
    if (barrados.length > 0) {
      // O DESCARTE VIRA CONTAGEM NO LOG, E NÃO `drive_falha_motivo`. Régua fechada significa zero
      // obrigatório pendente: o que o filtro barrou é facultativo reprovado ou tentativa velha, e
      // gravar isso como falha acenderia o sinal do Diagnóstico à toa, treinando o time a ignorar o
      // sinal. O aviso de pasta sem arquivo continua sendo gravado pelo caminho de sempre, porque
      // `semArquivos` é calculado sobre a lista JÁ FILTRADA (logo abaixo).
      // §A.6: CÓDIGO de tipo e contagem, nunca nome de arquivo, caminho ou nome de pessoa.
      const codigos = [...new Set(barrados.map((a) => a.codigoTipo))].sort();
      this.logger.log(
        `Arquivamento filtrado por veredito (admissão ${adm.id}): ${barrados.length} arquivo(s) ` +
          `fora do prontuário por não estarem ENTREGUE. Tipos: ${codigos.join(", ")}.`,
      );
    }
    // RÉGUA FECHADA = PRONTUÁRIO EXISTE, SEMPRE (decisão do diretor). Antes, staging vazia fazia o
    // método voltar sem criar nada: a admissão ficava com a régua completa e SEM pasta no Drive, e
    // isso é exatamente "documento ausente impedindo a criação da pasta", que a regra proíbe. Quem
    // fechou a régua fez isso conscientemente. A pasta nasce com o que existe (às vezes nada) e o
    // motivo continua gravado, dizendo que o prontuário está incompleto.
    const semArquivos = arquivosStaging.length === 0;

    // Código → nome do tipo (para o nome final do arquivo) — sem PII.
    const tipos = await this.db
      .select({ codigo: tiposDocumento.codigo, nome: tiposDocumento.nome })
      .from(tiposDocumento);
    const nomePorCodigo = new Map(tipos.map((t) => [t.codigo, t.nome]));

    const arquivos: ArquivoDrive[] = arquivosStaging.map((a) => {
      const nomeTipo = nomePorCodigo.get(a.codigoTipo) ?? a.codigoTipo;
      return {
        stagingPath: a.caminho,
        nomeFinal: `${nomeTipo}_${adm.candidatoNome.toUpperCase()}`,
        subpasta: resolveSubpasta(a.codigoTipo),
      };
    });

    const resultado = await this.ai.arquivarDrive({
      parentFolderId: pastaPaiId,
      pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
      arquivos,
      // ÂNCORA (OST da duplicação): já tendo link, o Drive vai DIRETO nesta pasta e não procura por
      // nome. É o que fecha a corrida na raiz, porque quem não procura não cria uma segunda pasta.
      ...(idDaPastaUrl(adm.drivePastaUrl) ? { pastaId: idDaPastaUrl(adm.drivePastaUrl)! } : {}),
    });
    const { pastaUrl } = resultado;

    // O QUE FICA GRAVADO COMO AVISO, em ordem de importância. Nenhum deles impede a URL de ser
    // gravada: a pasta existe, e perder o link de uma pasta que existe foi a origem de todos os
    // casos que voltaram para a fila à toa.
    const duplicatasAcendendo = duplicatasAcesas(
      resultado.duplicatas,
      adm.driveDuplicatasBaixadas,
    );
    const parcial = (resultado.falhas ?? 0) > 0;
    const aviso = parcial
      ? motivoEnvioParcial(resultado.falhas!, resultado.motivoFalhas ?? [])
      : // O motivo apurado antes (Pandapé sem o tipo, 429, sem origem) é mais informativo que o
        // texto genérico, então ele vence; o genérico cobre só o caso de não haver motivo nenhum.
        (motivoIncompleto ?? (semArquivos ? MOTIVO_DRIVE.PASTA_CRIADA_SEM_ARQUIVO : undefined));

    // Grava a URL e o aviso (ou LIMPA o aviso anterior, quando tudo concluiu).
    await this.db
      .update(admissoes)
      .set({
        drivePastaUrl: pastaUrl,
        driveFalhaMotivo: aviso ? limitar(aviso) : null,
        driveFalhaEm: aviso ? new Date() : null,
        // DUPLICATAS (OST da duplicação): o arquivamento nunca trava por ambiguidade, escolhe a
        // pasta mais completa e deixa aqui as outras, para o diretor consolidar e apagar à mão.
        // Só grava quando o Drive devolveu alguma: um arquivamento limpo não apaga aviso anterior.
        // O que o diretor JÁ BAIXOU no Diagnóstico fica de fora: a pasta continua lá, ele assumiu a
        // remoção manual, e regravar o id aqui reacenderia o aviso que ele mandou apagar. Duplicata
        // nova (id que ele nunca viu) acende normalmente.
        ...(duplicatasAcendendo.length ? { driveDuplicatas: duplicatasAcendendo.join(",") } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(admissoes.id, adm.id));
    // A staging só é expurgada quando TUDO subiu: com falha parcial, o que não foi é justamente o
    // que a próxima tentativa precisa reenviar. Expurgar aqui perderia o arquivo de vez.
    //
    // `preservarStaging` é a segunda guarda, e é decisão do diretor: a criação de prontuário sob
    // demanda roda em admissão com obrigatório ainda PENDENTE, cujo binário ainda vai ser auditado.
    // Sem a opção, nada muda no caminho de sempre.
    if (!parcial && !opcoes?.preservarStaging) await this.staging.removerAdmissao(adm.id);
    // §A.6: contagens e id de admissão, nunca nome de arquivo nem de pessoa. `ignorados` é a medida
    // direta da duplicação EVITADA: a staging guarda uma cópia por auditoria do mesmo documento.
    this.logger.log(
      `Régua fechada: documentos arquivados no Drive (admissão ${adm.id}). ` +
        `enviados=${resultado.arquivados}, ignorados por já existirem=${resultado.ignorados ?? 0}, ` +
        `falhas=${resultado.falhas ?? 0}, ` +
        `pasta reutilizada=${resultado.pastaJaExistia ? "sim" : "não"}.`,
    );

    return {
      arquivado: {
        pastaUrl,
        ...(resultado.pastaJaExistia ? { pastaJaExistia: true } : {}),
        ...(resultado.ignorados ? { ignorados: resultado.ignorados } : {}),
      },
      // O aviso sobe à tela: prontuário criado, mas incompleto (parcial, sem arquivo ou faltando tipo).
      ...(aviso ? { motivo: aviso } : {}),
    };
  }

  /**
   * COMPLETA A STAGING ANTES DO ARQUIVAMENTO, re-baixando do Pandapé só os tipos que faltam.
   *
   * O BURACO QUE ISTO FECHA. O prontuário sempre foi montado a partir da staging efêmera, que tem TTL
   * de 48h (§A.6). A régua, porém, fecha quando fecha: um documento validado à mão dias depois da
   * coleta fechava a régua com a staging já expurgada, e o arquivamento subia uma pasta vazia ou nem
   * subia. Foi o que aconteceu com três admissões reais, sem uma linha de aviso em lugar nenhum.
   *
   * A REGRA DO QUE VAI PARA O DRIVE (decisão do diretor): TODO documento ENTREGUE, obrigatório E
   * facultativo. Se foi coletado e validado, vai.
   *
   * TRAVA CRÍTICA, NÃO NEGOCIÁVEL. Este caminho NÃO escreve em `documentos_admissao`. Ele não
   * reaudita, não chama a IA e não toca `estado`, `observacao`, `validado_por_id` nem `validado_em`.
   * Re-baixar é buscar o BINÁRIO que sumiu do disco, não julgar o documento de novo: o veredito da
   * pessoa que validou permanece exatamente como está. A garantia é estrutural (o
   * `PandapeArquivosService` não tem banco injetado) e está travada por teste com espião no `update`.
   *
   * TRAVAS DE COTA (§A.5, cota compartilhada com o webhook): só se pede o que falta; se nada falta, o
   * Pandapé NEM É CHAMADO; uma única chamada de API por admissão; downloads sequenciais; 429 aborta
   * na hora e vira motivo gravado, sem insistir.
   *
   * Devolve o MOTIVO quando o prontuário vai ficar incompleto, ou `undefined` quando está tudo lá.
   */
  /**
   * Os tipos de documento ENTREGUES da admissão, obrigatórios E facultativos. Uma consulta só, com
   * DOIS consumidores que precisam exatamente da mesma lista:
   *
   *  1. o FILTRO POR VEREDITO do arquivamento (só o aprovado sobe ao prontuário);
   *  2. o RE-BAIXAR do Pandapé, que precisa saber o que está entregue e não tem arquivo.
   *
   * Ficarem juntos é a garantia de que as duas pontas nunca divirjam sobre o que é "aprovado": o dia
   * em que uma delas passasse a aceitar um estado a mais seria o dia em que o prontuário voltaria a
   * receber o que a outra recusa.
   *
   * `validadoEm` vem junto porque documento validado à MÃO é aceito sem arquivo pelo consumidor 2.
   *
   * ESTE MÉTODO SÓ LÊ. §A.6: código de tipo e carimbo de tempo, sem PII.
   */
  private async documentosEntregues(
    admissaoId: string,
  ): Promise<{ codigo: string; validadoEm: Date | null }[]> {
    return this.db
      .select({ codigo: tiposDocumento.codigo, validadoEm: documentosAdmissao.validadoEm })
      .from(documentosAdmissao)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, documentosAdmissao.tipoDocumentoId))
      .where(
        and(eq(documentosAdmissao.admissaoId, admissaoId), eq(documentosAdmissao.estado, "ENTREGUE")),
      );
  }

  private async completarStagingParaArquivamento(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
  ): Promise<string | undefined> {
    // Tipos ENTREGUES da admissão (obrigatórios E facultativos). Só código de tipo, sem PII.
    // `validadoEm` vem junto: documento validado à MÃO é aceito SEM arquivo (ver `aceitosSemArquivo`).
    const linhasEntregues = await this.documentosEntregues(adm.id);
    const entregues = linhasEntregues.map((l) => l.codigo);
    const validadosAMao = linhasEntregues.filter((l) => l.validadoEm).map((l) => l.codigo);
    // MESMA CONDIÇÃO DE SEXO DA RÉGUA (OST do seletor de sexo, item 3). Sem isto, a linha do
    // Reservista marcada ENTREGUE à mão continuava sendo cobrada aqui mesmo depois de o sexo ser
    // corrigido para feminino: a régua parava de exigir, o arquivamento não, e o prontuário seguia
    // travado. A linha do documento NÃO é apagada, só deixa de ser exigida (decisão do diretor).
    const entreguesQueSeAplicam = filtrarPorSexo(entregues, adm.candidatoSexo);
    if (entreguesQueSeAplicam.length === 0) return undefined;

    // O nome do arquivo na staging usa o código SANITIZADO; a comparação tem de usar a mesma régua.
    const naStagingCru = new Set((await this.staging.listar(adm.id)).map((a) => a.codigoTipo));
    const naStaging = entreguesQueSeAplicam.filter((c) => naStagingCru.has(sanitizarCodigo(c)));

    const faltantes = tiposFaltantesNoArquivamento({
      entregues: entreguesQueSeAplicam,
      naStaging,
      // O ASO sobe sozinho ao ser validado e sai da staging logo depois: já está no prontuário.
      jaNoDrive: precisaArquivarDrive(adm.driveAsoUrl) ? [] : ["ASO"],
      // Validado à mão vale sem arquivo (decisão do diretor): não se pede ao Pandapé um binário que
      // a pessoa já decidiu dispensar, e o prontuário fecha sem ele em vez de travar para sempre.
      aceitosSemArquivo: validadosAMao,
    });
    if (faltantes.length === 0) return undefined; // staging completa: o Pandapé nem é chamado.

    const idPrecollaborator = (
      await this.db
        .select({ id: integracaoPandape.idPrecollaborator })
        .from(integracaoPandape)
        .where(eq(integracaoPandape.admissaoId, adm.id))
    )[0]?.id;
    if (!idPrecollaborator) {
      // Admissão manual (ou sem vínculo Pandapé): não há de onde re-baixar. Antes isso era silêncio
      // absoluto; agora é motivo gravado e sinal aceso, que é a proteção possível para este caso.
      this.logger.warn(
        `Arquivamento incompleto (admissão ${adm.id}): ${faltantes.length} tipo(s) sem arquivo e ` +
          `sem origem Pandapé para re-baixar.`,
      );
      return `${MOTIVO_DRIVE.SEM_ARQUIVO_SEM_PANDAPE} Tipos sem arquivo: ${faltantes.join(", ")}.`;
    }

    const baixa = await this.pandapeArquivos.baixarArquivosDosTipos(idPrecollaborator, faltantes);
    // Salva na staging o que veio. A partir daqui o fluxo segue NORMAL: o lote sobe pelo mesmo
    // caminho de sempre, com a mesma dedup por md5 do lado do Drive.
    for (const arq of baixa.arquivos) {
      await this.staging.salvar(adm.id, arq.codigoTipo, {
        buffer: arq.buffer,
        originalname: arq.originalname,
      });
    }
    this.logger.log(
      `Re-baixa para arquivamento (admissão ${adm.id}): faltavam=${faltantes.length}, ` +
        `arquivos recuperados=${baixa.arquivos.length}, sem retorno=${baixa.semRetorno.length}.`,
    );

    if (baixa.abortadoPor) return motivoDoAborto(baixa.abortadoPor);
    if (baixa.semRetorno.length > 0) return motivoPandapeSemTipos(baixa.semRetorno);
    return undefined;
  }

  /**
   * Grava o MOTIVO REAL de o arquivamento não ter concluído (OST re-baixar do Pandapé, item 4). É o
   * fim do silêncio: sem isto, "prontuário não criado" e "prontuário criado pela metade" eram
   * indistinguíveis de "ainda não chegou a hora". Alimenta o sinal "Arquivamento No Drive Falhou".
   *
   * NÃO toca documento nenhum: escreve só na linha da admissão. §A.6: motivo é texto de sistema com
   * código de tipo, nunca nome, CPF, arquivo ou URL externa.
   */
  private async registrarFalhaDrive(admissaoId: string, motivo: string): Promise<void> {
    const agora = new Date();
    await this.db
      .update(admissoes)
      .set({ driveFalhaMotivo: limitar(motivo), driveFalhaEm: agora, atualizadoEm: agora })
      .where(eq(admissoes.id, admissaoId));
  }
}

/** Mesma sanitização que o `StagingService` aplica ao gravar (`{codigoTipo}__{uuid}.{ext}`). */
function sanitizarCodigo(codigo: string): string {
  return codigo.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Aborto da re-baixa → motivo gravado. Exportado para o teste travar cada correspondência. */
export function motivoDoAborto(aborto: AbortoBaixa): string {
  switch (aborto) {
    case "QUOTA":
      return MOTIVO_DRIVE.QUOTA_PANDAPE;
    case "TIMEOUT":
      return MOTIVO_DRIVE.TIMEOUT_PANDAPE;
    case "INERTE":
      return MOTIVO_DRIVE.PANDAPE_INERTE;
    default:
      return MOTIVO_DRIVE.API_PANDAPE_FORA;
  }
}
