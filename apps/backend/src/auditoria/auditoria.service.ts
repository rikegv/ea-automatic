import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { ProgressoRegua } from "@ea/shared-types";
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
import { AiClientService, type ArquivoDrive } from "../ai/ai-client.service";
import { montarNomePasta, resolvePastaPaiId, resolveSubpasta } from "../ai/drive-routing";
import { recomputeFarolGlobal } from "../admissoes/farol";
import { calcSinalizadorPreenchimento } from "../domain/admissao";
import { podeAbrirCadastro } from "../domain/frentes";
import { estadoDocumentoDeAuditoria, limitarMotivo } from "../domain/auditoria";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { StagingService } from "../staging/staging.service";

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
    return adm;
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

    const adm = await this.carregarAdmissao(admissaoId);

    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");

    // 1) Staging efêmera — buffer vai a disco e é descartado (§A.6).
    const stagingPath = await this.staging.salvar(admissaoId, tipo.codigo, file);

    // 2) Regras ATIVAS do tipo (critério de validade — texto, sem PII).
    const regras = await this.db
      .select({ descricaoRegra: regrasAuditoria.descricaoRegra })
      .from(regrasAuditoria)
      .where(
        and(eq(regrasAuditoria.tipoDocumentoId, tipoDocumentoId), eq(regrasAuditoria.ativo, true)),
      );

    // 3) IA — o CPF vai SÓ aqui; nunca é logado.
    const resultado = await this.ai.auditarDocumento({
      stagingPath,
      tipoDocumentoCodigo: tipo.codigo,
      tipoDocumentoNome: tipo.nome,
      candidato: { nome: adm.candidatoNome, cpf: adm.candidatoCpf },
      regras: regras.map((r) => ({ descricaoRegra: r.descricaoRegra })),
    });

    // 4) Persiste SÓ status + motivo (cap 500, sem PII — §A.3 regra 7 / §A.6).
    const estado = estadoDocumentoDeAuditoria(resultado.status);
    const observacao = limitarMotivo(resultado.motivo);
    const agora = new Date();
    await this.db
      .insert(documentosAdmissao)
      .values({ admissaoId, tipoDocumentoId, estado, observacao })
      .onConflictDoUpdate({
        target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
        set: { estado, observacao, atualizadoEm: agora },
      });

    // 4.5) ASO VALIDADO → arquiva imediatamente na subpasta ASO do prontuário (Fase 4 ajustes
    // finais), sem esperar o fechamento da régua. Remove o ASO da staging p/ não duplicar no lote.
    let asoArquivado: { pastaUrl: string } | undefined;
    if (tipo.codigo === "ASO" && resultado.status === "VALIDADO" && adm.driveAsoUrl == null) {
      asoArquivado = await this.arquivarAsoNoDrive(adm, stagingPath, tipo.codigo, tipo.nome);
    }

    // 5) Recalcula o sinalizador da admissão (INCONFORMIDADE domina; senão o cálculo do wizard).
    const sinalizador = await this.recalcularSinalizador(admissaoId, adm);

    // 6) Progresso da régua obrigatória.
    const progresso = await this.reguaCompletude.progresso(admissaoId, adm.codCliente, adm.cargoId);

    // 7) Régua obrigatória completa → conclui a Auditoria AUTOMATICAMENTE (Fase 4 item 2): AUDITORIA
    // passa a ANALISE_OK, abre o gate do Cadastro (regra 3) e reavalia o farol (BANCO_AGUARDAR).
    let auditoriaAuto: { status: string; gateAberto: boolean } | undefined;
    if (progresso.completa) {
      auditoriaAuto = await this.autoConcluirAuditoria(admissaoId, user);
    }

    // 8) Fechou a régua e ainda não arquivou? → arquiva no Drive e expurga a staging.
    let arquivado: { pastaUrl: string } | undefined;
    if (progresso.completa && adm.drivePastaUrl == null) {
      arquivado = await this.arquivarNoDrive(adm);
    }

    return {
      resultado,
      documento: { tipoDocumentoId, estado },
      progresso,
      sinalizador,
      ...(asoArquivado ? { asoArquivado } : {}),
      ...(auditoriaAuto ? { auditoriaAuto } : {}),
      ...(arquivado ? { arquivado } : {}),
    };
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
      nomeFinal: `${nomeTipo}_${adm.candidatoNome}`,
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
  ): Promise<{ pastaUrl: string } | undefined> {
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
        nomeFinal: `${nomeTipo}_${adm.candidatoNome}`,
        subpasta: resolveSubpasta(a.codigoTipo),
      };
    });

    const { pastaUrl } = await this.ai.arquivarDrive({
      parentFolderId: pastaPaiId,
      pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
      arquivos,
    });

    await this.db
      .update(admissoes)
      .set({ drivePastaUrl: pastaUrl, atualizadoEm: new Date() })
      .where(eq(admissoes.id, adm.id));
    await this.staging.removerAdmissao(adm.id);
    this.logger.log(`Régua fechada: documentos arquivados no Drive (admissão ${adm.id}).`);

    return { pastaUrl };
  }
}
