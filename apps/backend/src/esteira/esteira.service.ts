import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { normalizeCpf, TERMO_APTO_SEM_ASO } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  cargos,
  clientes,
  dadosVagaFolha,
  documentosAdmissao,
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
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import {
  conclui,
  isReversao,
  isStatusValido,
  reversaoDerrubaCadastro,
  STATUS_CONCLUI,
} from "../domain/esteira";
import type { PatchStatusDto } from "./dto/patch-status.dto";

/** Mapeia o segmento de rota (`auditoria|exame|cadastro`) para o tipo de frente do domínio. */
const ROTA_PARA_TIPO: Record<string, FrenteTipo> = {
  auditoria: "AUDITORIA",
  exame: "EXAME",
  cadastro: "CADASTRO_CONTRATO",
};

export interface EsteiraFiltros {
  codCliente?: string;
  status?: string;
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

    // Filtros de cliente/período (compartilhados por itens e KPIs).
    const clientePeriodo = [eq(frentesAdmissao.tipo, tipo)];
    if (filtros.codCliente) {
      clientePeriodo.push(eq(admissoes.codCliente, filtros.codCliente));
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

    // Itens aplicam também o filtro de status.
    const itensWhere = [...clientePeriodo];
    if (filtros.status) {
      itensWhere.push(eq(frentesAdmissao.status, filtros.status));
    }
    // Item 1 (2C): ao concluir, o candidato SOME da fila principal. A busca por candidato (ou o
    // filtro explícito pelo status de conclusão) o reexpõe — fica acessível pela busca avançada.
    if (!buscandoCandidato && filtros.status !== STATUS_CONCLUI[tipo]) {
      itensWhere.push(eq(frentesAdmissao.concluida, false));
    }
    if (q) {
      const cpfDigits = normalizeCpf(q);
      const porNome = ilike(candidatos.nome, `%${q}%`);
      itensWhere.push(
        cpfDigits.length >= 3 ? or(porNome, ilike(candidatos.cpf, `%${cpfDigits}%`))! : porNome,
      );
    }

    const rows = await this.db
      .select({
        admissaoId: admissoes.id,
        frenteId: frentesAdmissao.id,
        candidatoNome: candidatos.nome,
        codCliente: admissoes.codCliente,
        clienteRazao: clientes.razaoSocial,
        cargoNome: cargos.nome,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
        dataInicio: frentesAdmissao.dataInicio,
        dataConclusao: frentesAdmissao.dataConclusao,
        dataAdmissao: admissoes.dataAdmissao,
        drivePastaUrl: admissoes.drivePastaUrl,
        driveAsoUrl: admissoes.driveAsoUrl,
        sinalizador: admissoes.sinalizadorPreenchimento,
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
    const dispMap =
      tipo === "CADASTRO_CONTRATO" ? await this.disponibilidadeMap(admissaoIds) : new Map();
    const pendSet =
      tipo === "AUDITORIA"
        ? await this.reguaCompletude.obrigatoriosPendentesSet(admissaoIds)
        : new Set<string>();
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
        cargoNome: r.cargoNome,
        status: r.status,
        concluida: r.concluida,
        dataInicio: r.dataInicio,
        dataConclusao: r.dataConclusao,
        dataAdmissao: r.dataAdmissao,
        drivePastaUrl: r.drivePastaUrl,
        driveAsoUrl: r.driveAsoUrl,
        sinalizador: r.sinalizador,
      };
      if (tipo === "EXAME") {
        return {
          ...base,
          asoAnexado: asoSet.has(r.admissaoId),
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

    return { items, kpis: { porStatus, total }, statusCatalogo };
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

  /** Conjunto de admissões com o Termo de Banco ENTREGUE (§A.3 / Fase 4 complemento). */
  private async termoBancoEntregueSet(admissaoIds: string[]): Promise<Set<string>> {
    return this.docEntregueSet(admissaoIds, "TERMO_BANCO");
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

    // Gatilho NC-2 (2C item 2): marcar EXAME como "apto" SEM ASO anexado exige aceite explícito do
    // consultor. O aceite É o gatilho da NC-2 (registra autor + data + termo). Bloqueia até o aceite.
    const exigeAceiteAso =
      tipo === "EXAME" && conclui(tipo, novo) && !(await this.temAso(frente.admissaoId));
    if (exigeAceiteAso && !dto.confirmar) {
      throw new ConflictException({
        needsConfirmation: true,
        reason: "aptoSemAso",
        message: TERMO_APTO_SEM_ASO,
      });
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
    const geraNc = exigeAceiteAso || faltantesAuditoria.length > 0;
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
        vagaFolha: { salario: vaga?.salario, beneficios: vaga?.beneficios, escala: vaga?.escala },
        isBanco: admissao.isBanco,
        termoBancoEntregue,
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
      if (exigeAceiteAso) {
        const [nc] = await tx
          .insert(naoConformidades)
          .values({
            admissaoId: frente.admissaoId,
            tipo: "NC2",
            consultorId: admissao?.consultorId ?? null,
            aceiteTermo: TERMO_APTO_SEM_ASO,
            detalhe: "Exame marcado como apto sem ASO anexado.",
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
        isBanco: admissoes.isBanco,
        salario: dadosVagaFolha.salario,
        beneficios: dadosVagaFolha.beneficios,
        escala: dadosVagaFolha.escala,
      })
      .from(admissoes)
      .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .where(inArray(admissoes.id, admissaoIds));
    const termoSet = await this.termoBancoEntregueSet(
      linhas.filter((l) => l.isBanco).map((l) => l.id),
    );
    const set = new Set<string>();
    for (const l of linhas) {
      const pend = pendenciasObrigatorias({
        codCliente: l.codCliente,
        cargoId: l.cargoId,
        dataAdmissao: l.dataAdmissao,
        vagaFolha: { salario: l.salario, beneficios: l.beneficios, escala: l.escala },
        isBanco: l.isBanco,
        termoBancoEntregue: termoSet.has(l.id),
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
        drivePastaUrl: admissoes.drivePastaUrl,
        driveAsoUrl: admissoes.driveAsoUrl,
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
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
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
      vagaFolha: { salario: vaga?.salario, beneficios: vaga?.beneficios, escala: vaga?.escala },
      isBanco: adm.isBanco,
      termoBancoEntregue,
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

    return {
      admissaoId: adm.admissaoId,
      recebidoEm: adm.criadoEm,
      dataAdmissao: adm.dataAdmissao,
      tipoContrato: adm.tipoContrato,
      farolGlobal: adm.farolGlobal,
      isBanco: adm.isBanco,
      drivePastaUrl: adm.drivePastaUrl,
      driveAsoUrl: adm.driveAsoUrl,
      sinalizador: adm.sinalizador,
      pendencias,
      passagens: passagensRows.map((p) => ({
        tipo: p.tipo,
        rotulo: rotuloDe(p.tipo, p.paraStatus ?? ""),
        camposPendentes: p.camposPendentes,
        autor: p.autor,
        criadoEm: p.criadoEm,
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
   * F8 (Exame) — registra o ASO como ENTREGUE. NÃO persiste o binário (regra 7 / §A.6): lê só
   * metadados (nome e tamanho) e descarta o buffer. Sem motor de IA (Fase 4).
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

    return { ok: true, aso: { nome, registradoEm } };
  }
}
