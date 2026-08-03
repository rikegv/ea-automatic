import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import type { ProgressoRegua, ResultadoAuditoria } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  clientes,
  dadosVagaFolha,
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
import { TravaPorChave } from "../domain/trava-por-chave";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { recomputeFarolGlobal } from "../admissoes/farol";
import { calcSinalizadorPreenchimento } from "../domain/admissao";
import { podeAbrirCadastro } from "../domain/frentes";
import {
  ESTADO_AGUARDANDO_AUDITORIA,
  estadoDocumentoDeAuditoria,
  limitarMotivo,
} from "../domain/auditoria";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { StagingService } from "../staging/staging.service";
import { PandapeArquivosService, type AbortoBaixa } from "../pandape/pandape-arquivos.service";
import {
  limitar,
  motivoFalhaEnvioDrive,
  motivoPandapeSemTipos,
  MOTIVO_DRIVE,
  motivoEnvioParcial,
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
      try {
        resultado = await this.auditarComRetentativa({
          stagingPaths: stagingAuditaveis,
          tipoDocumentoCodigo: tipo.codigo,
          tipoDocumentoNome: tipo.nome,
          candidato: { nome: adm.candidatoNome, cpf: adm.candidatoCpf },
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
    }

    return {
      progresso,
      sinalizador,
      ...(auditoriaAuto ? { auditoriaAuto } : {}),
      ...(arquivado ? { arquivado } : {}),
      ...(avisoDrive ? { avisoDrive } : {}),
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
   * Apaga da staging os arquivos de UM tipo daquela admissão. Usado pelo reenvio do ASO, onde o
   * novo arquivo substitui o antigo. Falha ao remover não derruba o fluxo: o TTL de 48h da staging
   * pega o resto. §A.6: nada de caminho no log.
   */
  private async limparStagingDoTipo(admissaoId: string, codigoTipo: string): Promise<void> {
    const alvo = codigoTipo.replace(/[^a-zA-Z0-9_-]/g, "_");
    const arquivos = (await this.staging.listar(admissaoId)).filter((a) => a.codigoTipo === alvo);
    for (const a of arquivos) {
      await this.staging.removerArquivo(a.caminho).catch(() => undefined);
    }
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
    const estadoDepois = frentes.map((f) =>
      f.tipo === "AUDITORIA"
        ? { tipo: f.tipo, concluida: true }
        : { tipo: f.tipo, concluida: f.concluida },
    );
    const gateAberto = podeAbrirCadastro(estadoDepois);

    // Já concluída → nada a fazer (idempotente).
    if (!auditoria || auditoria.concluida) {
      return { status: auditoria?.status ?? "ANALISE_OK", gateAberto };
    }

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
      // Nascimento lazy do Cadastro quando o gate abre (regra 3) e ainda não existe.
      if (gateAberto && !frentes.some((f) => f.tipo === "CADASTRO_CONTRATO")) {
        await tx.insert(frentesAdmissao).values({
          admissaoId,
          tipo: "CADASTRO_CONTRATO",
          status: "A_CADASTRAR",
          concluida: false,
          dataInicio: agora,
        });
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
   */
  private async arquivarNoDrive(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
  ): Promise<ResultadoArquivamento> {
    // TRAVA POR ADMISSÃO (OST da duplicação, item 4): duas execuções simultâneas da MESMA admissão
    // eram a causa provada das pastas duplicadas. A segunda espera a primeira e, quando chega a vez
    // dela, o link já está gravado e vira âncora. A releitura da admissão dentro da trava é o que
    // torna isso verdade: sem ela, a segunda ainda usaria o `adm` carregado ANTES da espera.
    return this.travaArquivamento.executar(adm.id, async () =>
      this.arquivarNoDriveSemTrava(await this.carregarAdmissao(adm.id)),
    );
  }

  private async arquivarNoDriveSemTrava(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
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

    const arquivosStaging = await this.staging.listar(adm.id);
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
    if (!parcial) await this.staging.removerAdmissao(adm.id);
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
  private async completarStagingParaArquivamento(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
  ): Promise<string | undefined> {
    // Tipos ENTREGUES da admissão (obrigatórios E facultativos). Só código de tipo, sem PII.
    // `validadoEm` vem junto: documento validado à MÃO é aceito SEM arquivo (ver `aceitosSemArquivo`).
    const linhasEntregues = await this.db
      .select({ codigo: tiposDocumento.codigo, validadoEm: documentosAdmissao.validadoEm })
      .from(documentosAdmissao)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, documentosAdmissao.tipoDocumentoId))
      .where(
        and(eq(documentosAdmissao.admissaoId, adm.id), eq(documentosAdmissao.estado, "ENTREGUE")),
      );
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
