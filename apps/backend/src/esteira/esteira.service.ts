import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { normalizeCpf, TERMO_APTO_SEM_ASO } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissaoBeneficio,
  admissoes,
  candidatoAlteracoesLog,
  candidatos,
  cargos,
  clientes,
  motivosDeclinio,
  dadosVagaFolha,
  documentosAdmissao,
  exameAgendamento,
  frenteStatusCatalogo,
  frenteStatusEventos,
  frentesAdmissao,
  naoConformidades,
  passagemAceites,
  reguaDocumental,
  tiposDocumento,
  usuarios,
} from "../db/schema";
import { pendenciasObrigatorias } from "../domain/admissao";
import { recomputeFarolGlobal } from "../admissoes/farol";
import type { FrenteTipo } from "../domain/frentes";
import { podeAbrirCadastro } from "../domain/frentes";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import {
  conclui,
  isReversao,
  isStatusValido,
  reversaoDerrubaCadastro,
  STATUS_CONCLUI,
} from "../domain/esteira";
import type { AgendamentoExameDto } from "./dto/agendamento-exame.dto";
import type { PatchStatusDto } from "./dto/patch-status.dto";
import type { RelatorioClinicaDto } from "./dto/relatorio-clinica.dto";

/** Mapeia o segmento de rota (`auditoria|exame|cadastro`) para o tipo de frente do domínio. */
const ROTA_PARA_TIPO: Record<string, FrenteTipo> = {
  auditoria: "AUDITORIA",
  exame: "EXAME",
  cadastro: "CADASTRO_CONTRATO",
};

export interface EsteiraFiltros {
  // Multi-select (Bloco B): OU dentro do mesmo filtro (inArray). Vazio/ausente = sem filtro.
  codCliente?: string[];
  status?: string[];
  from?: string;
  to?: string;
  /** Busca por candidato (nome ou CPF) — F7. Quando presente, REVELA também as frentes já
   * concluídas (que somem da fila principal — item 1 da 2C). */
  q?: string;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class EsteiraService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reguaCompletude: ReguaCompletudeService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Resolve e valida o segmento de rota; 400 quando inválido. */
  resolverTipo(frente: string): FrenteTipo {
    const tipo = ROTA_PARA_TIPO[frente];
    if (!tipo) {
      throw new BadRequestException("Frente inválida (use auditoria | exame | cadastro)");
    }
    return tipo;
  }

  /**
   * F8/F7 — fila da frente com filtros dinâmicos. Para CADASTRO_CONTRATO o INNER JOIN por tipo já
   * restringe às admissões cuja frente nasceu (gate). KPIs aplicam cliente/período mas NÃO status
   * (para mostrar a distribuição por status).
   */
  async listar(frente: string, filtros: EsteiraFiltros) {
    const tipo = this.resolverTipo(frente);

    // Filtros de cliente/período (compartilhados por itens e KPIs). Regra permanente de importação
    // (§A.3, Regra 2 do declínio): admissões com farol de encerramento por declínio/rescisão NUNCA
    // entram em fila operacional nem nos KPIs da Esteira. Quem declinou não deixa trabalho ativo;
    // segue visível só como histórico no Gerenciador (que é baseado em farol). Vale para declínios
    // importados E futuros/vivos.
    const clientePeriodo = [
      eq(frentesAdmissao.tipo, tipo),
      notInArray(admissoes.farolGlobal, ["DECLINOU", "RESCISAO"]),
    ];
    if (filtros.codCliente?.length) {
      clientePeriodo.push(inArray(admissoes.codCliente, filtros.codCliente));
    }
    if (filtros.from) {
      if (!DATA_RE.test(filtros.from)) throw new BadRequestException("from inválido (YYYY-MM-DD)");
      clientePeriodo.push(gte(admissoes.criadoEm, new Date(`${filtros.from}T00:00:00`)));
    }
    if (filtros.to) {
      if (!DATA_RE.test(filtros.to)) throw new BadRequestException("to inválido (YYYY-MM-DD)");
      const toEnd = new Date(`${filtros.to}T00:00:00`);
      toEnd.setDate(toEnd.getDate() + 1);
      clientePeriodo.push(lt(admissoes.criadoEm, toEnd));
    }

    // Busca por candidato (nome ou CPF) — F7. Revela também as concluídas (ver abaixo).
    const q = filtros.q?.trim();
    const buscandoCandidato = Boolean(q);

    // Itens aplicam também o filtro de status (multi-select, Bloco B: OU dentro do filtro).
    const itensWhere = [...clientePeriodo];
    if (filtros.status?.length) {
      itensWhere.push(inArray(frentesAdmissao.status, filtros.status));
    }
    // Item 1 (2C): ao concluir, o candidato SOME da fila principal. A busca por candidato (ou o
    // filtro explícito PELO status de conclusão) o reexpõe. Com multi-select, basta que UM dos status
    // marcados seja o de conclusão para revelar as concluídas.
    const filtraStatusConclui = Boolean(filtros.status?.includes(STATUS_CONCLUI[tipo]));
    if (!buscandoCandidato && !filtraStatusConclui) {
      const naoConcluida = eq(frentesAdmissao.concluida, false);
      if (tipo === "CADASTRO_CONTRATO") {
        // INT-4: "Aguardando assinatura" (e "Cancelado", à espera de reenvio) é trabalho EM
        // ANDAMENTO mesmo com o Cadastro concluído (CADASTRADO) — o contrato ainda não foi
        // assinado/arquivado. Mantém na fila principal sem depender da busca (igual a qualquer
        // pendente da frente); só some quando ASSINADO/SEM_ENVELOPE.
        //
        // Repare que a regra depende de `concluida` + `clicksign_status`, NUNCA do código do status:
        // por isso a reorganização (0026) não a afeta. O contrato vive no Clicksign, não na frente.
        itensWhere.push(
          or(
            naoConcluida,
            inArray(admissoes.clicksignStatus, ["AGUARDANDO_ASSINATURA", "CANCELADO"]),
          )!,
        );
      } else {
        itensWhere.push(naoConcluida);
      }
    }
    if (q) {
      // Busca rápida (Bloco C): NOME, CPF e CLIENTE (razão/operação/código).
      const cpfDigits = normalizeCpf(q);
      const conds = [
        ilike(candidatos.nome, `%${q}%`),
        ilike(clientes.razaoSocial, `%${q}%`),
        ilike(clientes.nomeOperacao, `%${q}%`),
        ilike(clientes.codCliente, `%${q}%`),
      ];
      if (cpfDigits.length >= 3) conds.push(ilike(candidatos.cpf, `%${cpfDigits}%`));
      itensWhere.push(or(...conds)!);
    }

    const rows = await this.db
      .select({
        admissaoId: admissoes.id,
        frenteId: frentesAdmissao.id,
        candidatoNome: candidatos.nome,
        codCliente: admissoes.codCliente,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        cargoNome: cargos.nome,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
        dataInicio: frentesAdmissao.dataInicio,
        dataConclusao: frentesAdmissao.dataConclusao,
        dataAdmissao: admissoes.dataAdmissao,
        // Coluna "Tipo de contrato" das 3 abas: a régua unificada cobra o campo como pendência
        // obrigatória, então a fila precisa mostrar o que está cobrando. Nullable: admissão criada
        // sem o tipo é justamente a que tem a pendência, e a tela mostra "não informado" (§A.11).
        tipoContrato: admissoes.tipoContrato,
        drivePastaUrl: admissoes.drivePastaUrl,
        driveAsoUrl: admissoes.driveAsoUrl,
        clicksignStatus: admissoes.clicksignStatus,
        contratoAssinadoDriveUrl: admissoes.contratoAssinadoDriveUrl,
        origem: admissoes.origem,
        sinalizador: admissoes.sinalizadorPreenchimento,
        asoValidado: admissoes.asoValidado,
      })
      .from(frentesAdmissao)
      .innerJoin(admissoes, eq(frentesAdmissao.admissaoId, admissoes.id))
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .where(and(...itensWhere))
      .orderBy(asc(admissoes.criadoEm));

    const admissaoIds = rows.map((r) => r.admissaoId);

    // Enriquecimento por frente: ASO (exame), disponibilidade do gate (cadastro) e obrigatórios
    // pendentes (auditoria — sinaliza o aceite ao concluir, gatilho da NC-1).
    const asoSet = tipo === "EXAME" ? await this.asoEntregueSet(admissaoIds) : new Set<string>();
    const agendamentoMap =
      tipo === "EXAME"
        ? await this.agendamentoMap(admissaoIds)
        : new Map<string, AgendamentoResumo>();
    const dispMap =
      tipo === "CADASTRO_CONTRATO" ? await this.disponibilidadeMap(admissaoIds) : new Map();
    const pendSet =
      tipo === "AUDITORIA"
        ? await this.reguaCompletude.obrigatoriosPendentesSet(admissaoIds)
        : new Set<string>();
    // Item 8 — contador de documentos obrigatórios pendentes por admissão (badge da aba Auditoria).
    const docsPendentesMap =
      tipo === "AUDITORIA"
        ? await this.reguaCompletude.obrigatoriosPendentesCountMap(admissaoIds)
        : new Map<string, number>();
    const pendObrigSet =
      tipo === "AUDITORIA" || tipo === "EXAME"
        ? await this.pendenciasSet(admissaoIds)
        : new Set<string>();

    const items = rows.map((r) => {
      const base = {
        admissaoId: r.admissaoId,
        frenteId: r.frenteId,
        candidatoNome: r.candidatoNome,
        codCliente: r.codCliente,
        clienteRazao: r.clienteRazao,
        clienteOperacao: r.clienteOperacao,
        cargoNome: r.cargoNome,
        status: r.status,
        concluida: r.concluida,
        dataInicio: r.dataInicio,
        dataConclusao: r.dataConclusao,
        dataAdmissao: r.dataAdmissao,
        tipoContrato: r.tipoContrato,
        drivePastaUrl: r.drivePastaUrl,
        driveAsoUrl: r.driveAsoUrl,
        clicksignStatus: r.clicksignStatus,
        contratoAssinadoDriveUrl: r.contratoAssinadoDriveUrl,
        origem: r.origem,
        sinalizador: r.sinalizador,
      };
      if (tipo === "EXAME") {
        const ag = agendamentoMap.get(r.admissaoId);
        return {
          ...base,
          asoAnexado: asoSet.has(r.admissaoId),
          asoValidado: r.asoValidado,
          temAgendamento: !!ag?.data,
          reagendamentos: ag?.reagendamentos ?? 0,
          agendamento: ag ?? null,
          temPendencias: pendObrigSet.has(r.admissaoId),
        };
      }
      if (tipo === "CADASTRO_CONTRATO") {
        return { ...base, disponivel: dispMap.get(r.admissaoId) ?? false };
      }
      if (tipo === "AUDITORIA") {
        return {
          ...base,
          obrigatoriosPendentes: pendSet.has(r.admissaoId),
          docsPendentes: docsPendentesMap.get(r.admissaoId) ?? 0,
          temPendencias: pendObrigSet.has(r.admissaoId),
        };
      }
      return base;
    });

    // KPIs por status (cliente/período, sem o filtro de status).
    const statusCatalogo = await this.db
      .select({
        codigo: frenteStatusCatalogo.codigo,
        rotulo: frenteStatusCatalogo.rotulo,
        ordem: frenteStatusCatalogo.ordem,
        conclui: frenteStatusCatalogo.conclui,
      })
      .from(frenteStatusCatalogo)
      .where(eq(frenteStatusCatalogo.tipo, tipo))
      .orderBy(asc(frenteStatusCatalogo.ordem));

    // KPIs contam só quem ainda está EM ANDAMENTO (item 1/6 da 2C — "Total na fila"): exclui as
    // frentes concluídas, que saíram da fila. Mantém cliente/período, ignora o filtro de status.
    const kpiRows = await this.db
      .select({ status: frentesAdmissao.status, n: count() })
      .from(frentesAdmissao)
      .innerJoin(admissoes, eq(frentesAdmissao.admissaoId, admissoes.id))
      .where(and(...clientePeriodo, eq(frentesAdmissao.concluida, false)))
      .groupBy(frentesAdmissao.status);

    const porStatus: Record<string, number> = {};
    for (const c of statusCatalogo) porStatus[c.codigo] = 0;
    let total = 0;
    for (const k of kpiRows) {
      porStatus[k.status] = k.n;
      total += k.n;
    }

    // Item 9 — KPI "com pendências obrigatórias de campo": admissões EM ANDAMENTO (frente não
    // concluída) desta frente, sob o mesmo filtro cliente/período, que têm ≥1 pendência obrigatória
    // (domain `pendenciasObrigatorias`, via `pendenciasSet`). Vale para as três frentes.
    const emAndamentoRows = await this.db
      .select({ admissaoId: frentesAdmissao.admissaoId })
      .from(frentesAdmissao)
      .innerJoin(admissoes, eq(frentesAdmissao.admissaoId, admissoes.id))
      .where(and(...clientePeriodo, eq(frentesAdmissao.concluida, false)));
    const comPendencias = (await this.pendenciasSet(emAndamentoRows.map((r) => r.admissaoId))).size;

    // KPI "Cadastrado" (aba Cadastro, decisão do diretor): quantas JÁ foram cadastradas. Precisa de
    // consulta própria porque `porStatus` conta só `concluida = false`, e "Cadastrado" é o status
    // CONCLUINTE da frente — ali daria sempre 0. Mesmo filtro cliente/período dos demais KPIs, então
    // herda a exclusão de declínio (§A.16). Só a aba Cadastro consulta; as outras não pagam a query.
    let cadastrados = 0;
    if (tipo === "CADASTRO_CONTRATO") {
      const [linha] = await this.db
        .select({ n: count() })
        .from(frentesAdmissao)
        .innerJoin(admissoes, eq(frentesAdmissao.admissaoId, admissoes.id))
        .where(and(...clientePeriodo, eq(frentesAdmissao.concluida, true)));
      cadastrados = linha?.n ?? 0;
    }

    return { items, kpis: { porStatus, total, comPendencias, cadastrados }, statusCatalogo };
  }

  /** Conjunto de admissões com um documento (por código) ENTREGUE (§A.6 — só status). */
  private async docEntregueSet(admissaoIds: string[], codigo: string): Promise<Set<string>> {
    if (admissaoIds.length === 0) return new Set();
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, codigo),
    });
    if (!tipo) return new Set();
    const linhas = await this.db
      .select({ admissaoId: documentosAdmissao.admissaoId })
      .from(documentosAdmissao)
      .where(
        and(
          inArray(documentosAdmissao.admissaoId, admissaoIds),
          eq(documentosAdmissao.tipoDocumentoId, tipo.id),
          eq(documentosAdmissao.estado, "ENTREGUE"),
        ),
      );
    return new Set(linhas.map((l) => l.admissaoId));
  }

  /** Conjunto de admissões com ASO ENTREGUE (regra 7 — só status, nunca o arquivo). */
  private async asoEntregueSet(admissaoIds: string[]): Promise<Set<string>> {
    return this.docEntregueSet(admissaoIds, "ASO");
  }

  /** Agendamento do exame por admissão (para exibir na fila EXAME: data, fornecedor, reagendamentos). */
  private async agendamentoMap(admissaoIds: string[]): Promise<Map<string, AgendamentoResumo>> {
    if (admissaoIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        admissaoId: exameAgendamento.admissaoId,
        data: exameAgendamento.data,
        horario: exameAgendamento.horario,
        nomeClinica: exameAgendamento.nomeClinica,
        local: exameAgendamento.local,
        fornecedor: exameAgendamento.fornecedor,
        reagendamentos: exameAgendamento.reagendamentos,
      })
      .from(exameAgendamento)
      .where(inArray(exameAgendamento.admissaoId, admissaoIds));
    return new Map(rows.map((r) => [r.admissaoId, r]));
  }

  /** Conjunto de admissões com o Termo de Banco ENTREGUE (§A.3 / Fase 4 complemento). */
  private async termoBancoEntregueSet(admissaoIds: string[]): Promise<Set<string>> {
    return this.docEntregueSet(admissaoIds, "TERMO_BANCO");
  }

  /**
   * Quais destas admissões têm pacote de benefícios ESTRUTURADO (§A.17 etapa 4).
   *
   * Em LOTE, no mesmo padrão do `termoBancoEntregueSet`: a lista da esteira avalia a pendência de
   * centenas de linhas de uma vez, e uma consulta por linha viraria N+1.
   */
  private async beneficiosEstruturadosSet(admissaoIds: string[]): Promise<Set<string>> {
    if (admissaoIds.length === 0) return new Set();
    const linhas = await this.db
      .selectDistinct({ admissaoId: admissaoBeneficio.admissaoId })
      .from(admissaoBeneficio)
      .where(inArray(admissaoBeneficio.admissaoId, admissaoIds));
    return new Set(linhas.map((l) => l.admissaoId));
  }

  /** Mapa admissaoId → disponível (AUDITORIA e EXAME concluídas) para a frente de Cadastro. */
  private async disponibilidadeMap(admissaoIds: string[]): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    if (admissaoIds.length === 0) return map;
    const frentes = await this.db
      .select({
        admissaoId: frentesAdmissao.admissaoId,
        tipo: frentesAdmissao.tipo,
        concluida: frentesAdmissao.concluida,
      })
      .from(frentesAdmissao)
      .where(
        and(
          inArray(frentesAdmissao.admissaoId, admissaoIds),
          inArray(frentesAdmissao.tipo, ["AUDITORIA", "EXAME"]),
        ),
      );
    const porAdmissao = new Map<string, { tipo: FrenteTipo; concluida: boolean }[]>();
    for (const f of frentes) {
      const lista = porAdmissao.get(f.admissaoId) ?? [];
      lista.push({ tipo: f.tipo, concluida: f.concluida });
      porAdmissao.set(f.admissaoId, lista);
    }
    for (const id of admissaoIds) {
      map.set(id, podeAbrirCadastro(porAdmissao.get(id) ?? []));
    }
    return map;
  }

  /**
   * F8 — muda o status de uma frente, registra a trilha (frente_status_eventos) e mantém o gate
   * contínuo do Cadastro (regra 3): nascimento lazy quando AUDITORIA e EXAME concluem; reversão
   * que reabre cadastro exige confirmação explícita (409 needsConfirmation).
   */
  async mudarStatus(frenteId: string, dto: PatchStatusDto, user: AuthUser) {
    const frente = await this.db.query.frentesAdmissao.findFirst({
      where: eq(frentesAdmissao.id, frenteId),
    });
    if (!frente) throw new NotFoundException("Frente não encontrada");

    const tipo = frente.tipo;
    const novo = dto.status;
    if (!isStatusValido(tipo, novo)) {
      throw new BadRequestException(`Status inválido para a frente ${tipo}`);
    }

    // Admissão (consultor autor + par cliente/cargo) — base da atribuição das NC (Via 1).
    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, frente.admissaoId),
    });

    // Estado das frentes da admissão ANTES da mudança (para o gate e o alerta).
    const irmas = await this.db
      .select({
        id: frentesAdmissao.id,
        tipo: frentesAdmissao.tipo,
        concluida: frentesAdmissao.concluida,
      })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, frente.admissaoId));

    const cadastroExistente = irmas.find((f) => f.tipo === "CADASTRO_CONTRATO") ?? null;
    const estadoAntes = irmas.map((f) => ({ tipo: f.tipo, concluida: f.concluida }));
    const cadastroAbertoAgora = Boolean(cadastroExistente) && podeAbrirCadastro(estadoAntes);

    // No-op: status igual ao atual — devolve o estado corrente sem escrever.
    if (novo === frente.status) {
      return {
        frente: {
          frenteId: frente.id,
          tipo,
          status: frente.status,
          concluida: frente.concluida,
          dataConclusao: frente.dataConclusao,
        },
        gate: {
          disponivel: podeAbrirCadastro(estadoAntes),
          cadastroId: cadastroExistente?.id ?? null,
          nasceuAgora: false,
        },
        reversao: false,
      };
    }

    const ehReversao = isReversao(tipo, frente.status, novo);
    if (
      ehReversao &&
      reversaoDerrubaCadastro(tipo, frente.status, novo, cadastroAbertoAgora) &&
      !dto.confirmar
    ) {
      throw new ConflictException({
        needsConfirmation: true,
        reason: "reversao",
        message: "Isso reabre pendência num candidato já em cadastro — confirma?",
      });
    }

    // GATE de transição (OST modal de agendamento) — bloqueios DUROS, sem aceite/bypass. São gates de
    // transição de status, NÃO alteram a regra geral "pendências sinalizam, nunca bloqueiam" da criação.
    // (a) AGENDADO exige os dados do exame cadastrados no modal (data preenchida).
    if (
      tipo === "EXAME" &&
      novo === "AGENDADO" &&
      !(await this.temAgendamento(frente.admissaoId))
    ) {
      throw new ConflictException({
        needsConfirmation: false,
        reason: "exameSemAgendamento",
        message:
          "Cadastre as informações do exame (modal de agendamento) antes de marcar como Agendado.",
      });
    }
    // (b) APTO exige ASO ANEXADO e VALIDADO PELA I.A (apto). A validação é da I.A (não flag manual):
    // `asoValidado` vem do veredito da I.A ao anexar/auditar o ASO. Controle por PAPEL:
    //   • COMUM (consultor): trava DURA — só um aviso, SEM opção de liberar sem ASO.
    //   • MASTER e SUPER_ADMIN: podem liberar Apto sem ASO — exige autorização explícita
    //     (needsConfirmation), registrada em seu nome (responsável da transição + NC-2).
    // A trava geral não é afrouxada para o comum; é uma exceção autorizada e rastreada (tela de NC).
    let liberouAptoSemAso = false;
    if (tipo === "EXAME" && conclui(tipo, novo)) {
      const anexado = await this.temAso(frente.admissaoId);
      const asoOk = anexado && admissao?.asoValidado === true;
      if (!asoOk) {
        if (user.papel === "COMUM") {
          throw new ConflictException({
            needsConfirmation: false,
            reason: "aptoSemAsoValidado",
            message: anexado
              ? "O ASO ainda não foi validado pela I.A como apto. Aguarde a leitura da I.A."
              : "Anexe o ASO para liberar como Apto (a I.A valida o documento).",
          });
        }
        // MASTER / SUPER_ADMIN — autorização explícita da liberação sem ASO (fica registrada).
        if (!dto.confirmar) {
          throw new ConflictException({
            needsConfirmation: true,
            reason: "aptoSemAsoSuperAdmin",
            message:
              "Liberar APTO sem ASO validado pela I.A? A liberação fica registrada em seu nome.",
          });
        }
        liberouAptoSemAso = true;
      }
    }

    // Gatilho NC-1 (2C): Auditoria concluída ("análise ok") com obrigatórios pendentes na régua.
    // Cálculo read-only ANTES do tx. Concluir com pendência exige aceite explícito (item 2).
    const faltantesAuditoria =
      tipo === "AUDITORIA" && conclui(tipo, novo) && admissao
        ? await this.reguaCompletude.faltantesObrigatorios(
            frente.admissaoId,
            admissao.codCliente,
            admissao.cargoId,
          )
        : [];
    if (faltantesAuditoria.length > 0 && !dto.confirmar) {
      throw new ConflictException({
        needsConfirmation: true,
        reason: "auditoriaIncompleta",
        message: `Concluir a Auditoria com ${faltantesAuditoria.length} documento(s) obrigatório(s) pendente(s) exige aceite.`,
      });
    }

    // Via 1 × Via 2 do aceite (item 2): a pedido da diretoria → NC nasce PENDENTE de aprovação
    // (com motivo) em vez de penalizar. Motivo é obrigatório nesse caso.
    const geraNc = liberouAptoSemAso || faltantesAuditoria.length > 0;
    if (geraNc && dto.liberacaoDiretoria && !dto.liberacaoMotivo?.trim()) {
      throw new BadRequestException("Informe o motivo da liberação por diretoria.");
    }
    const ncLiberacao =
      geraNc && dto.liberacaoDiretoria
        ? {
            liberacaoStatus: "PENDENTE" as const,
            liberacaoMotivo: dto.liberacaoMotivo!.trim(),
            liberacaoSolicitanteId: user.id,
          }
        : {};

    // S3 — log de aceite por passagem: concluir AUDITORIA/EXAME com campos obrigatórios pendentes
    // da admissão exige aceite e gera trilha permanente (regra 8 — trilha, não penalização).
    const ehPassagem = (tipo === "AUDITORIA" || tipo === "EXAME") && conclui(tipo, novo);
    let pendenciasPassagem: string[] = [];
    if (ehPassagem && admissao) {
      const vaga = await this.db.query.dadosVagaFolha.findFirst({
        where: eq(dadosVagaFolha.admissaoId, frente.admissaoId),
      });
      const termoBancoEntregue = admissao.isBanco
        ? (await this.termoBancoEntregueSet([admissao.id])).has(admissao.id)
        : false;
      pendenciasPassagem = pendenciasObrigatorias({
        codCliente: admissao.codCliente,
        cargoId: admissao.cargoId,
        dataAdmissao: admissao.dataAdmissao,
        tipoContrato: admissao.tipoContrato,
        vagaFolha: {
          salario: vaga?.salario,
          beneficios: vaga?.beneficios,
          escala: vaga?.escala,
          centroCusto: vaga?.centroCusto,
          gestorBp: vaga?.gestorBp,
        },
        isBanco: admissao.isBanco,
        termoBancoEntregue,
        temBeneficioEstruturado: (await this.beneficiosEstruturadosSet([admissao.id])).has(
          admissao.id,
        ),
      });
    }
    if (pendenciasPassagem.length > 0 && !dto.aceitePassagem) {
      throw new ConflictException({
        needsConfirmation: true,
        reason: "passagemComPendencia",
        camposPendentes: pendenciasPassagem,
        message:
          "Estou ciente que estou avançando esta admissão com pendências obrigatórias não preenchidas.",
      });
    }

    const result = await this.db.transaction(async (tx) => {
      const concl = conclui(tipo, novo);
      const agora = new Date();

      const [upd] = await tx
        .update(frentesAdmissao)
        .set({
          status: novo,
          concluida: concl,
          dataConclusao: concl ? agora : null,
          responsavelId: user.id,
          atualizadoEm: agora,
        })
        .where(eq(frentesAdmissao.id, frenteId))
        .returning({
          id: frentesAdmissao.id,
          status: frentesAdmissao.status,
          concluida: frentesAdmissao.concluida,
          dataConclusao: frentesAdmissao.dataConclusao,
        });

      await tx.insert(frenteStatusEventos).values({
        admissaoId: frente.admissaoId,
        frenteId,
        tipo,
        deStatus: frente.status,
        paraStatus: novo,
        reversao: ehReversao,
        autorId: user.id,
      });

      // S3 — trilha de passagem (permanente) quando se avançou com pendências obrigatórias.
      if (pendenciasPassagem.length > 0) {
        await tx.insert(passagemAceites).values({
          admissaoId: frente.admissaoId,
          frenteId,
          tipo,
          deStatus: frente.status,
          paraStatus: novo,
          camposPendentes: pendenciasPassagem.join(", "),
          autorId: user.id,
        });
      }

      // Recalcula o gate com o estado pós-mudança.
      const estadoDepois = irmas.map((f) =>
        f.id === frenteId ? { tipo, concluida: concl } : { tipo: f.tipo, concluida: f.concluida },
      );
      const gateAberto = podeAbrirCadastro(estadoDepois);

      let cadastroId = cadastroExistente?.id ?? null;
      let nasceuAgora = false;
      // Nascimento lazy: só cria se ainda não existe (preserva o trabalho da frente existente).
      if (gateAberto && !cadastroExistente) {
        const [novoCad] = await tx
          .insert(frentesAdmissao)
          .values({
            admissaoId: frente.admissaoId,
            tipo: "CADASTRO_CONTRATO",
            status: "A_CADASTRAR",
            concluida: false,
            dataInicio: agora,
          })
          .returning({ id: frentesAdmissao.id });
        cadastroId = novoCad.id;
        nasceuAgora = true;
      }

      // Gatilhos de não conformidade (2C) — registro aditivo, idempotente por (admissão, tipo).
      let ncCriada: "NC1" | "NC2" | null = null;
      if (liberouAptoSemAso) {
        const [nc] = await tx
          .insert(naoConformidades)
          .values({
            admissaoId: frente.admissaoId,
            tipo: "NC2",
            consultorId: admissao?.consultorId ?? null,
            aceiteTermo: TERMO_APTO_SEM_ASO,
            // Registro da exceção: liberado sem ASO validado pela I.A por Super Admin (autor da
            // transição = frente.responsavelId = user.id, data = criadoEm).
            detalhe:
              "Exame liberado como apto SEM ASO validado pela I.A (autorização de Super Admin).",
            ...ncLiberacao,
          })
          .onConflictDoNothing({
            target: [naoConformidades.admissaoId, naoConformidades.tipo],
          })
          .returning({ id: naoConformidades.id });
        if (nc) ncCriada = "NC2";
      }
      if (faltantesAuditoria.length > 0) {
        const [nc] = await tx
          .insert(naoConformidades)
          .values({
            admissaoId: frente.admissaoId,
            tipo: "NC1",
            consultorId: admissao?.consultorId ?? null,
            detalhe: `Auditoria concluída com ${faltantesAuditoria.length} documento(s) obrigatório(s) pendente(s): ${faltantesAuditoria.join(", ")}.`,
            ...ncLiberacao,
          })
          .onConflictDoNothing({
            target: [naoConformidades.admissaoId, naoConformidades.tipo],
          })
          .returning({ id: naoConformidades.id });
        if (nc) ncCriada = "NC1";
      }

      return { upd, gateAberto, cadastroId, nasceuAgora, ncCriada };
    });

    // Reavalia o farol global (§A.3 / Fase 4 complemento): concluir Auditoria+Exame sem data de
    // admissão leva a BANCO_AGUARDAR; reverter/concluir pode voltar a EM_ADMISSAO. Pós-tx (estado
    // derivado, não transacional com a mudança de frente).
    await recomputeFarolGlobal(this.db, frente.admissaoId);

    return {
      frente: {
        frenteId: result.upd.id,
        tipo,
        status: result.upd.status,
        concluida: result.upd.concluida,
        dataConclusao: result.upd.dataConclusao,
      },
      gate: {
        disponivel: result.gateAberto,
        cadastroId: result.cadastroId,
        nasceuAgora: result.nasceuAgora,
      },
      reversao: ehReversao,
      ncCriada: result.ncCriada,
    };
  }

  /** A admissão tem o ASO registrado como ENTREGUE? (só status — §A.6). */
  private async temAso(admissaoId: string): Promise<boolean> {
    return (await this.asoEntregueSet([admissaoId])).has(admissaoId);
  }

  /** Conjunto de admissões com ≥1 campo obrigatório vazio (S2/S3 — pendências da admissão).
   * Admissão de banco: não cobra data de admissão, cobra o Termo de Banco (§A.3 / Fase 4). */
  private async pendenciasSet(admissaoIds: string[]): Promise<Set<string>> {
    if (admissaoIds.length === 0) return new Set();
    const linhas = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
        dataAdmissao: admissoes.dataAdmissao,
        tipoContrato: admissoes.tipoContrato,
        isBanco: admissoes.isBanco,
        salario: dadosVagaFolha.salario,
        beneficios: dadosVagaFolha.beneficios,
        escala: dadosVagaFolha.escala,
        centroCusto: dadosVagaFolha.centroCusto,
        gestorBp: dadosVagaFolha.gestorBp,
      })
      .from(admissoes)
      .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .where(inArray(admissoes.id, admissaoIds));
    const termoSet = await this.termoBancoEntregueSet(
      linhas.filter((l) => l.isBanco).map((l) => l.id),
    );
    // Em lote: uma consulta para todas as linhas, não uma por linha.
    const beneficioSet = await this.beneficiosEstruturadosSet(linhas.map((l) => l.id));
    const set = new Set<string>();
    for (const l of linhas) {
      const pend = pendenciasObrigatorias({
        codCliente: l.codCliente,
        cargoId: l.cargoId,
        dataAdmissao: l.dataAdmissao,
        tipoContrato: l.tipoContrato,
        vagaFolha: {
          salario: l.salario,
          beneficios: l.beneficios,
          escala: l.escala,
          centroCusto: l.centroCusto,
          gestorBp: l.gestorBp,
        },
        isBanco: l.isBanco,
        termoBancoEntregue: termoSet.has(l.id),
        temBeneficioEstruturado: beneficioSet.has(l.id),
      });
      if (pend.length > 0) set.add(l.id);
    }
    return set;
  }

  /**
   * Item 4 (2C) — detalhe SOMENTE LEITURA de uma admissão para o modal de visualização rápida:
   * cliente, cargo, candidato, status das três frentes, checklist de documentos, sinalizador e
   * data de recebimento. Leitura coletiva (§A.3); CPF retornado para exibição, nunca logado (§A.6).
   */
  async detalhe(admissaoId: string) {
    const [adm] = await this.db
      .select({
        admissaoId: admissoes.id,
        criadoEm: admissoes.criadoEm,
        dataAdmissao: admissoes.dataAdmissao,
        tipoContrato: admissoes.tipoContrato,
        farolGlobal: admissoes.farolGlobal,
        isBanco: admissoes.isBanco,
        origem: admissoes.origem,
        drivePastaUrl: admissoes.drivePastaUrl,
        driveAsoUrl: admissoes.driveAsoUrl,
        clicksignStatus: admissoes.clicksignStatus,
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        contratoAssinadoDriveUrl: admissoes.contratoAssinadoDriveUrl,
        sinalizador: admissoes.sinalizadorPreenchimento,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        candidatoEmail: candidatos.email,
        candidatoTelefone: candidatos.telefone,
        codCliente: admissoes.codCliente,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        cargoId: admissoes.cargoId,
        cargoNome: cargos.nome,
        // Motivo do declínio (Fase 2): nome do catálogo, quando a admissão tem motivo vinculado.
        motivoDeclinio: motivosDeclinio.nome,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .leftJoin(motivosDeclinio, eq(admissoes.motivoDeclinioId, motivosDeclinio.id))
      .where(eq(admissoes.id, admissaoId));

    if (!adm) throw new NotFoundException("Admissão não encontrada");

    const frentes = await this.db
      .select({
        tipo: frentesAdmissao.tipo,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
        dataInicio: frentesAdmissao.dataInicio,
        dataConclusao: frentesAdmissao.dataConclusao,
      })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, admissaoId));

    // Rótulos do catálogo para apresentar os status das frentes de forma legível.
    const catalogo = await this.db
      .select({
        tipo: frenteStatusCatalogo.tipo,
        codigo: frenteStatusCatalogo.codigo,
        rotulo: frenteStatusCatalogo.rotulo,
      })
      .from(frenteStatusCatalogo);
    const rotuloDe = (tipo: string, codigo: string) =>
      catalogo.find((c) => c.tipo === tipo && c.codigo === codigo)?.rotulo ?? codigo;

    // Checklist de documentos: exigência da régua + estado na admissão (regra 7 — só status).
    const documentos = await this.db
      .select({
        nome: tiposDocumento.nome,
        exigencia: reguaDocumental.exigencia,
        estado: documentosAdmissao.estado,
      })
      .from(reguaDocumental)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, reguaDocumental.tipoDocumentoId))
      .leftJoin(
        documentosAdmissao,
        and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          eq(documentosAdmissao.tipoDocumentoId, reguaDocumental.tipoDocumentoId),
        ),
      )
      .where(
        and(
          eq(reguaDocumental.codCliente, adm.codCliente),
          eq(reguaDocumental.cargoId, adm.cargoId),
        ),
      )
      .orderBy(asc(tiposDocumento.nome));

    // S2 — pendências obrigatórias (campos vazios da admissão).
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, admissaoId),
    });
    const termoBancoEntregue = adm.isBanco
      ? (await this.termoBancoEntregueSet([admissaoId])).has(admissaoId)
      : false;
    const pendencias = pendenciasObrigatorias({
      codCliente: adm.codCliente,
      cargoId: adm.cargoId,
      dataAdmissao: adm.dataAdmissao,
      tipoContrato: adm.tipoContrato,
      vagaFolha: {
        salario: vaga?.salario,
        beneficios: vaga?.beneficios,
        escala: vaga?.escala,
        centroCusto: vaga?.centroCusto,
        gestorBp: vaga?.gestorBp,
      },
      isBanco: adm.isBanco,
      termoBancoEntregue,
      temBeneficioEstruturado: (await this.beneficiosEstruturadosSet([admissaoId])).has(admissaoId),
    });

    // S3 — trilha de passagem (avanços com pendência), com autor.
    const passagensRows = await this.db
      .select({
        tipo: passagemAceites.tipo,
        deStatus: passagemAceites.deStatus,
        paraStatus: passagemAceites.paraStatus,
        camposPendentes: passagemAceites.camposPendentes,
        criadoEm: passagemAceites.criadoEm,
        autor: usuarios.nome,
      })
      .from(passagemAceites)
      .leftJoin(usuarios, eq(passagemAceites.autorId, usuarios.id))
      .where(eq(passagemAceites.admissaoId, admissaoId))
      .orderBy(desc(passagemAceites.criadoEm));

    // Trilha de alteração de candidato (OST-EA-GESTAO-USUARIOS): quem mudou o quê, com autor.
    // Nota (§A.6): valorAnterior/valorNovo PODEM conter dado pessoal — exposto só na leitura do
    // detalhe (visão coletiva da esteira), nunca logado no servidor.
    const alteracoesRows = await this.db
      .select({
        campo: candidatoAlteracoesLog.campo,
        valorAnterior: candidatoAlteracoesLog.valorAnterior,
        valorNovo: candidatoAlteracoesLog.valorNovo,
        criadoEm: candidatoAlteracoesLog.criadoEm,
        autorNome: usuarios.nome,
      })
      .from(candidatoAlteracoesLog)
      .leftJoin(usuarios, eq(candidatoAlteracoesLog.autorId, usuarios.id))
      .where(eq(candidatoAlteracoesLog.admissaoId, admissaoId))
      .orderBy(desc(candidatoAlteracoesLog.criadoEm));

    return {
      admissaoId: adm.admissaoId,
      recebidoEm: adm.criadoEm,
      dataAdmissao: adm.dataAdmissao,
      tipoContrato: adm.tipoContrato,
      farolGlobal: adm.farolGlobal,
      // Motivo do declínio (Fase 2): só é usado na tela quando o farol é de declínio; null quando
      // a admissão não tem motivo vinculado (aparece como "não informado").
      motivoDeclinio: adm.motivoDeclinio,
      isBanco: adm.isBanco,
      origem: adm.origem,
      drivePastaUrl: adm.drivePastaUrl,
      driveAsoUrl: adm.driveAsoUrl,
      clicksignStatus: adm.clicksignStatus,
      // Não expõe o ID do envelope (referência técnica interna) — só se já existe (§A.6).
      temEnvelope: Boolean(adm.clicksignEnvelopeId),
      contratoAssinadoDriveUrl: adm.contratoAssinadoDriveUrl,
      sinalizador: adm.sinalizador,
      pendencias,
      passagens: passagensRows.map((p) => ({
        tipo: p.tipo,
        rotulo: rotuloDe(p.tipo, p.paraStatus ?? ""),
        camposPendentes: p.camposPendentes,
        autor: p.autor,
        criadoEm: p.criadoEm,
      })),
      alteracoes: alteracoesRows.map((a) => ({
        campo: a.campo,
        valorAnterior: a.valorAnterior,
        valorNovo: a.valorNovo,
        autorNome: a.autorNome,
        criadoEm: a.criadoEm,
      })),
      candidato: {
        nome: adm.candidatoNome,
        cpf: adm.candidatoCpf,
        email: adm.candidatoEmail,
        telefone: adm.candidatoTelefone,
      },
      cliente: {
        codCliente: adm.codCliente,
        razaoSocial: adm.clienteRazao,
        operacao: adm.clienteOperacao,
      },
      cargo: adm.cargoNome,
      frentes: frentes.map((f) => ({
        tipo: f.tipo,
        status: f.status,
        rotulo: rotuloDe(f.tipo, f.status),
        concluida: f.concluida,
        dataInicio: f.dataInicio,
        dataConclusao: f.dataConclusao,
      })),
      documentos: documentos.map((d) => ({
        nome: d.nome,
        exigencia: d.exigencia,
        estado: d.estado ?? "PENDENTE",
      })),
    };
  }

  /**
   * F8 (Exame) — anexa o ASO e dispara a VALIDAÇÃO PELA I.A (gate de APTO). Registra o ASO como
   * ENTREGUE (anexado) e a I.A lê o documento decidindo apto/inapto → grava `asoValidado`. NÃO
   * persiste o binário (regra 7 / §A.6): só metadados + staging efêmera (expurgada). Robusto: se a
   * I.A estiver indisponível, o ASO fica ANEXADO porém NÃO validado (gate segue travado até revalidar).
   */
  async anexarAso(admissaoId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Arquivo ASO obrigatório (campo 'file')");

    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    const aso = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "ASO"),
    });
    if (!aso) throw new NotFoundException("Tipo de documento ASO não cadastrado");

    // Só metadados — o buffer não é gravado em lugar nenhum (descartado ao fim do handler).
    const nome = file.originalname;
    const tamanho = file.size;
    const registradoEm = new Date();

    await this.db
      .insert(documentosAdmissao)
      .values({
        admissaoId,
        tipoDocumentoId: aso.id,
        estado: "ENTREGUE",
        observacao: `ASO anexado: ${nome} (${tamanho} bytes)`,
      })
      .onConflictDoUpdate({
        target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
        set: {
          estado: "ENTREGUE",
          observacao: `ASO anexado: ${nome} (${tamanho} bytes)`,
          atualizadoEm: registradoEm,
        },
      });

    // Novo ASO → volta a NÃO validado; a I.A revalida na leitura do documento (não é flag manual).
    await this.db
      .update(admissoes)
      .set({ asoValidado: false, atualizadoEm: registradoEm })
      .where(eq(admissoes.id, admissaoId));

    // Validação pela I.A: lê o ASO e decide apto/inapto. VALIDADO → destrava o gate de APTO.
    let iaStatus: string;
    let asoValidado = false;
    try {
      const veredito = await this.auditoria.classificarAso(admissaoId, {
        buffer: file.buffer,
        originalname: nome,
      });
      iaStatus = veredito.status;
      asoValidado = veredito.valido;
      if (asoValidado) {
        await this.db
          .update(admissoes)
          .set({ asoValidado: true, atualizadoEm: new Date() })
          .where(eq(admissoes.id, admissaoId));
      }
    } catch {
      // I.A indisponível → ASO anexado porém NÃO validado (gate travado; reenviar para revalidar).
      iaStatus = "INDISPONIVEL";
    }

    return { ok: true, aso: { nome, registradoEm }, asoValidado, iaStatus };
  }

  // ── Modal de Gestão de Agendamento do Exame (aba EXAME) ──────────────────────

  /** Devolve o agendamento do exame da admissão (ou null se ainda não cadastrado). */
  async obterAgendamento(admissaoId: string) {
    const [row] = await this.db
      .select()
      .from(exameAgendamento)
      .where(eq(exameAgendamento.admissaoId, admissaoId));
    return row ?? null;
  }

  /**
   * Cadastra (1ª vez) OU reagenda (já existe) o agendamento do exame. Reagendar OBRIGA atualizar os
   * dados e INCREMENTA o contador de reagendamentos (sub-status). Sem PII — só logística do exame.
   */
  async salvarAgendamento(admissaoId: string, dto: AgendamentoExameDto) {
    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    const existente = await this.obterAgendamento(admissaoId);
    const agora = new Date();
    const valores = {
      data: dto.data,
      horario: dto.horario,
      nomeClinica: dto.nomeClinica,
      local: dto.local,
      fornecedor: dto.fornecedor,
    };

    if (!existente) {
      const [row] = await this.db
        .insert(exameAgendamento)
        .values({ admissaoId, ...valores })
        .returning();
      return { ok: true, reagendou: false, agendamento: row };
    }

    // Já existe → é reagendamento: incrementa o contador (independe da flag, o registro já existia).
    const [row] = await this.db
      .update(exameAgendamento)
      .set({ ...valores, reagendamentos: existente.reagendamentos + 1, atualizadoEm: agora })
      .where(eq(exameAgendamento.id, existente.id))
      .returning();
    return { ok: true, reagendou: true, agendamento: row };
  }

  /** A admissão tem agendamento de exame com data preenchida? (gate de AGENDADO). */
  private async temAgendamento(admissaoId: string): Promise<boolean> {
    const ag = await this.obterAgendamento(admissaoId);
    return !!ag?.data;
  }

  /**
   * Relatório da clínica — UMA linha por admissão do lote, no layout EXATO do MODELO_DE_AGENDAMENTO
   * do diretor (colunas/ordem/nomes fixos, ver `COLUNAS_RELATORIO`). EMPRESA/CNPJ = empregador do
   * vínculo (view `vw_vinculo_empresa_cnpj`; FOPAG = o próprio cliente); CNPJ CLIENTE = CNPJ do cliente.
   *
   * Preserva a ordem dos `admissaoIds`; ids inexistentes são ignorados em silêncio. §A.6/LGPD:
   * CPF/CNPJ jamais são logados — só devolvidos para exibição/CSV que a clínica consome.
   * `agendamento` sai VAZIO: a data do exame ainda não é modelada — é o campo que a clínica preenche.
   */
  async resolverLinhas(admissaoIds: string[]): Promise<LinhaRelatorioClinica[]> {
    if (admissaoIds.length === 0) {
      throw new BadRequestException("Informe ao menos uma admissão (admissaoIds).");
    }

    // Admissão + candidato + cargo + cliente + folha (setor). LEFT em folha (pode não existir).
    const base = await this.db
      .select({
        admissaoId: admissoes.id,
        nome: candidatos.nome,
        cpf: candidatos.cpf,
        dataNascimento: candidatos.dataNascimento,
        cargo: cargos.nome,
        codCliente: admissoes.codCliente,
        cliente: clientes.razaoSocial,
        cnpjCliente: clientes.cnpj,
        regiao: clientes.descricaoRegiao,
        regiaoCod: clientes.regiao,
        setor: dadosVagaFolha.departamento,
        agendamentoData: exameAgendamento.data,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .leftJoin(exameAgendamento, eq(exameAgendamento.admissaoId, admissoes.id))
      .where(inArray(admissoes.id, admissaoIds));

    // Empregador/CNPJ (EMPRESA/CNPJ) pela view — resolvido por cod_cliente. Raw sql (view fora do schema).
    const codClientes = [...new Set(base.map((b) => b.codCliente))];
    const viewMap = new Map<string, VwVinculoLinha>();
    if (codClientes.length > 0) {
      const rows = (await this.db.execute(sql`
        SELECT cod_cliente, tipo_servico, empresa_resolvida, cnpj_resolvido
        FROM vw_vinculo_empresa_cnpj
        WHERE cod_cliente IN (${sql.join(
          codClientes.map((c) => sql`${c}`),
          sql`, `,
        )})
      `)) as unknown as VwVinculoLinha[];
      for (const r of rows) viewMap.set(r.cod_cliente, r);
    }

    const porAdmissao = new Map<string, (typeof base)[number]>();
    for (const b of base) porAdmissao.set(b.admissaoId, b);

    // Preserva a ordem do input; ignora ids inexistentes silenciosamente.
    const linhas: LinhaRelatorioClinica[] = [];
    for (const id of admissaoIds) {
      const b = porAdmissao.get(id);
      if (!b) continue;
      const vw = viewMap.get(b.codCliente);
      // Estágio NÃO faz exame admissional → fora do relatório da clínica (§ decisão do diretor).
      if (vw?.tipo_servico === "ESTAGIO") continue;
      linhas.push({
        admissaoId: b.admissaoId,
        empresa: vw?.empresa_resolvida ?? "",
        cnpj: vw?.cnpj_resolvido ?? "",
        cod: b.codCliente,
        cliente: b.cliente,
        cnpjCliente: b.cnpjCliente ?? "",
        nome: b.nome,
        setor: b.setor ?? "",
        cargo: b.cargo,
        cpf: formatarCpf(b.cpf),
        dataNascimento: formatarData(b.dataNascimento),
        agendamento: formatarData(b.agendamentoData),
        regiao: b.regiao ?? b.regiaoCod ?? "",
      });
    }
    return linhas;
  }

  /** Preview do relatório da clínica (JSON) — mesma resolução do CSV. */
  async relatorioClinicaPreview(
    dto: RelatorioClinicaDto,
  ): Promise<{ linhas: LinhaRelatorioClinica[] }> {
    return { linhas: await this.resolverLinhas(dto.admissaoIds) };
  }

  /**
   * CSV do relatório da clínica — layout MODELO_DE_AGENDAMENTO (mesmas colunas/ordem/nomes). Separador
   * ';' (padrão BR/Excel), BOM UTF-8 + CRLF. O controller define os headers de download.
   */
  async relatorioClinicaCsv(
    dto: RelatorioClinicaDto,
  ): Promise<{ conteudo: string; nomeArquivo: string }> {
    const linhas = await this.resolverLinhas(dto.admissaoIds);
    const corpo = linhas.map((l) =>
      [
        l.empresa,
        l.cnpj,
        l.cod,
        l.cliente,
        l.cnpjCliente,
        l.nome,
        l.setor,
        l.cargo,
        l.cpf,
        l.dataNascimento,
        l.agendamento,
        l.regiao,
      ]
        .map(escaparCsv)
        .join(";"),
    );
    // BOM UTF-8 + CRLF (convenção do Excel para CSV).
    const conteudo = "﻿" + [COLUNAS_RELATORIO.join(";"), ...corpo].join("\r\n") + "\r\n";
    return { conteudo, nomeArquivo: `relatorio-clinica-${linhas.length}-candidatos.csv` };
  }
}

/** Colunas do relatório da clínica — layout EXATO do MODELO_DE_AGENDAMENTO (ordem e nomes fixos). */
const COLUNAS_RELATORIO = [
  "EMPRESA",
  "CNPJ",
  "COD",
  "CLIENTE",
  "CNPJ CLIENTE",
  "NOME",
  "SETOR",
  "CARGO",
  "CPF",
  "DATA DE NASCIMENTO",
  "AGENDAMENTO",
  "REGIÃO",
] as const;

/** Resumo do agendamento do exame exibido na fila EXAME. */
interface AgendamentoResumo {
  admissaoId: string;
  data: string | null;
  horario: string | null;
  nomeClinica: string | null;
  local: string | null;
  fornecedor: string | null;
  reagendamentos: number;
}

/** Uma linha do relatório da clínica (preview JSON e CSV compartilham este formato). */
export interface LinhaRelatorioClinica {
  admissaoId: string;
  empresa: string;
  cnpj: string;
  cod: string;
  cliente: string;
  cnpjCliente: string;
  nome: string;
  setor: string;
  cargo: string;
  cpf: string;
  dataNascimento: string;
  agendamento: string;
  regiao: string;
}

/** Projeção da view `vw_vinculo_empresa_cnpj` usada pelo relatório. */
interface VwVinculoLinha {
  cod_cliente: string;
  tipo_servico: string | null;
  empresa_resolvida: string | null;
  cnpj_resolvido: string | null;
}

/** Formata CPF real como 000.000.000-00 (só exibição/CSV — nunca logado, §A.6). */
function formatarCpf(cpf: string): string {
  const d = normalizeCpf(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Data ISO (YYYY-MM-DD) → dd/mm/aaaa (padrão BR do modelo). Vazio se ausente. */
function formatarData(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "";
}

/**
 * Escapa uma célula CSV: quoting quando há ';', aspas ou quebra de linha; E neutraliza injeção de
 * fórmula (§ endurecimento de saída) — célula iniciando com = + - @ (ou tab/CR) é prefixada com `'`
 * para o Excel/Sheets tratá-la como texto, não fórmula. NOME/SETOR/CARGO vêm de cadastro editável e o
 * arquivo abre na clínica (parte externa).
 */
function escaparCsv(valor: string): string {
  let v = valor ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[";\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
