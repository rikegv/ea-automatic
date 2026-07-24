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
import { montarNomePasta, resolvePastaPaiId, resolveSubpasta } from "../ai/drive-routing";
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
 * Orquestração da auditoria documental incremental (F2 / INT-3, Fase 4). Por documento:
 * staging → IA → grava SÓ o estado/motivo (§A.3 regra 7) → recalcula sinalizador e progresso →
 * ao fechar a régua obrigatória, arquiva no Drive e expurga a staging. O CPF do candidato só
 * trafega para a chamada da IA, NUNCA é logado (§A.6).
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger("AuditoriaService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly staging: StagingService,
    private readonly ai: AiClientService,
    private readonly reguaCompletude: ReguaCompletudeService,
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
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
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
   */
  private async gravarFalhaDeAuditoria(
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
   * documento que FECHAVA a régua, a frente AUDITORIA não ia sozinha para "Análise finalizada" e os
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
        // O caso real: a régua fechou, a frente foi a "Análise finalizada" na tela, e o envio ao
        // Drive morreu no 16º arquivo com um erro do Google. Como a exceção subia, a requisição da
        // validação humana terminava em erro DEPOIS de já ter gravado tudo, e o consultor ficava
        // com a tela dizendo "finalizada" e o prontuário vazio. Ninguém era avisado.
        // Agora: o que já foi persistido continua valendo, a staging NÃO é expurgada, a URL segue
        // nula (então a próxima ação na admissão tenta de novo) e o consultor recebe um AVISO.
        try {
          arquivado = await this.arquivarNoDrive(adm);
        } catch (err) {
          avisoDrive = this.avisoFalhaDrive(err, adm.id);
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
  private avisoFalhaDrive(err: unknown, admissaoId: string): string {
    const familia = familiaDaFalha(err);
    const detalhe = err instanceof Error ? err.message : "erro";
    this.logger.error(
      `Arquivamento no Drive FALHOU (admissão ${admissaoId}): família=${familia}. ` +
        `Staging preservada e URL não gravada, então a próxima ação na admissão tenta de novo. ` +
        `Detalhe: ${detalhe}`,
    );
    return (
      "Auditoria concluída e salva, mas o envio ao Drive falhou: os documentos continuam guardados " +
      "aqui e o sistema tentará de novo na próxima ação desta admissão. Se insistir, avise a TI."
    );
  }

  /**
   * Classifica UM ASO pela IA para o gate de APTO da esteira — devolve SÓ o veredito (apto/inapto),
   * sem persistir estado de documento nem arquivar (isso é da auditoria da régua). Reusa a staging
   * efêmera + regras ativas do ASO + motor de IA. §A.6: buffer só na staging (expurgado no finally);
   * CPF vai apenas no payload da IA e nunca é logado.
   */
  async classificarAso(admissaoId: string, arquivo: { buffer: Buffer; originalname: string }) {
    const adm = await this.carregarAdmissao(admissaoId);
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "ASO"),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento ASO não cadastrado");

    const stagingPath = await this.staging.salvar(admissaoId, tipo.codigo, arquivo);
    try {
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
      return { status: resultado.status, valido: resultado.status === "VALIDADO" };
    } finally {
      await this.staging.removerArquivo(stagingPath).catch(() => undefined);
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
    const pastaPaiId = resolvePastaPaiId(adm.tipoContrato, adm.codCliente);
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
    const { pastaUrl } = await this.ai.arquivarDrive({
      parentFolderId: pastaPaiId,
      pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
      arquivos: [arquivo],
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
   */
  private async arquivarNoDrive(
    adm: Awaited<ReturnType<AuditoriaService["carregarAdmissao"]>>,
  ): Promise<{ pastaUrl: string; pastaJaExistia?: boolean; ignorados?: number } | undefined> {
    const pastaPaiId = resolvePastaPaiId(adm.tipoContrato, adm.codCliente);
    if (!pastaPaiId) {
      this.logger.warn(
        `Arquivamento ignorado: sem pasta-pai do Drive para contrato/cliente da admissão ${adm.id}.`,
      );
      return undefined;
    }

    const arquivosStaging = await this.staging.listar(adm.id);
    if (arquivosStaging.length === 0) return undefined;

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
    });
    const { pastaUrl } = resultado;

    await this.db
      .update(admissoes)
      .set({ drivePastaUrl: pastaUrl, atualizadoEm: new Date() })
      .where(eq(admissoes.id, adm.id));
    await this.staging.removerAdmissao(adm.id);
    // §A.6: contagens e id de admissão, nunca nome de arquivo nem de pessoa. `ignorados` é a medida
    // direta da duplicação EVITADA: a staging guarda uma cópia por auditoria do mesmo documento.
    this.logger.log(
      `Régua fechada: documentos arquivados no Drive (admissão ${adm.id}). ` +
        `enviados=${resultado.arquivados}, ignorados por já existirem=${resultado.ignorados ?? 0}, ` +
        `pasta reutilizada=${resultado.pastaJaExistia ? "sim" : "não"}.`,
    );

    return {
      pastaUrl,
      ...(resultado.pastaJaExistia ? { pastaJaExistia: true } : {}),
      ...(resultado.ignorados ? { ignorados: resultado.ignorados } : {}),
    };
  }
}
