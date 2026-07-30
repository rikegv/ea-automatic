import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { alias as aliasedTable } from "drizzle-orm/pg-core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { normalizeCpf, TERMO_APTO_SEM_ASO, type Papel } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { naoPausada } from "../db/admissao-filtros";
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
  clinicasCatalogo,
  exameAgendamento,
  exameAgendamentoEndereco,
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
import { auditoriaParada, horasParado } from "../domain/auditoria-parada";
import { equivalentesDoSlot } from "../domain/documentos-equivalentes";
import { recomputeFarolGlobal } from "../admissoes/farol";
import type { FrenteTipo } from "../domain/frentes";
import { podeAbrirCadastro } from "../domain/frentes";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { pendenciasObrigatoriasSet } from "../regua/pendencias-lote";
import { configDoCliente } from "../regua/pendencia-config.repo";
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
   * concluídas (que somem da fila principal — item 1 da 2C) e as PAUSADAS. */
  q?: string;
  /**
   * Filtro do card "Pausadas" (OST admissão pausada, Bloco 4). true = mostra SÓ as pausadas.
   * Ausente/false = fila normal, que EXCLUI as pausadas. Mesmo mecanismo já usado para a frente
   * concluída: some da fila, reaparece na busca ou no filtro explícito.
   */
  pausadas?: boolean;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Papel por extenso para o texto da NC (registro lido por gente). Mesma grafia da tela de usuários.
 * O detalhe da NC-2 NUNCA fixa o papel: quem libera Apto sem ASO é Master OU Super Admin, e a NC é
 * o registro de responsabilização — dizer o papel errado seria mentir sobre quem autorizou.
 */
const ROTULO_PAPEL: Record<Papel, string> = {
  COMUM: "Consultor",
  MASTER: "Master",
  SUPER_ADMIN: "Super Admin",
};
function rotuloPapel(papel: Papel): string {
  return ROTULO_PAPEL[papel] ?? papel;
}

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
      // AGUARDANDO_LIBERACAO e LIBERACAO_RECUSADA junto de DECLINOU/RESCISAO: pré-admissão e recusada
      // não entram em fila nem KPI da Esteira (nem têm frentes; a exclusão é o cinto reforçado).
      notInArray(admissoes.farolGlobal, [
        "DECLINOU",
        "RESCISAO",
        "AGUARDANDO_LIBERACAO",
        "LIBERACAO_RECUSADA",
      ]),
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

    // PAUSA (OST admissão pausada, ponto 6 dos 6). Os KPIs contam TRABALHO A FAZER, e admissão
    // pausada não vai ser trabalhada agora: sai de TODAS as contagens, sempre, sem exceção de busca.
    // O card "Pausadas" é contado à parte, logo abaixo.
    const kpiWhere = [...clientePeriodo, naoPausada()];

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
    // PAUSA nos ITENS: mesmo mecanismo da frente concluída, três caminhos e nenhum inventado.
    //  - filtro "Pausadas" ligado → mostra SÓ as pausadas (é o card clicável, §A.12);
    //  - busca por candidato → não filtra pausa (a busca REVELA, como já revela as concluídas);
    //  - fila normal → esconde as pausadas.
    // É isto que faz a pausada sumir da fila sem virar admissão fantasma: sempre a um clique.
    if (filtros.pausadas) {
      itensWhere.push(isNotNull(admissoes.pausadaEm));
    } else if (!buscandoCandidato) {
      itensWhere.push(naoPausada());
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
        // PAUSA: vai no item para a coluna Status renderizar a tag "Pausada" (Bloco 5).
        pausadaEm: admissoes.pausadaEm,
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
    // OST B1 / Bloco 6: progresso da régua obrigatória (entregues/total) para a coluna Status da
    // aba Auditoria mostrar QUANTO já foi auditado, em vez de "Análise Pendente" para todo mundo.
    const progressoMap =
      tipo === "AUDITORIA"
        ? await this.reguaCompletude.progressoObrigatoriosMap(admissaoIds)
        : new Map<
            string,
            { entregues: number; total: number; inconformes: number; recebidos: number }
          >();
    // PENDÊNCIAS OBRIGATÓRIAS (campos), calculadas AO VIVO pela régua unificada `pendenciasObrigatorias`
    // (§A.19). É a MESMA fonte que o modal de pendências abre ao clicar no badge, e agora vale para as
    // TRÊS abas, não só Auditoria e Exame: o pill da coluna "Pendências Obrigatórias" precisa dela em
    // qualquer aba, senão a de Cadastro volta a cair no `sinalizador` e a divergir do card.
    const pendObrigSet = await this.pendenciasSet(admissaoIds);

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
        pausadaEm: r.pausadaEm,
        // Sobe no BASE (antes ia só nas abas Auditoria e Exame): é o que alinha o pill da coluna
        // "Pendências Obrigatórias" com o badge que abre a lista, em TODAS as abas.
        temPendencias: pendObrigSet.has(r.admissaoId),
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
          progressoObrigatorios: progressoMap.get(r.admissaoId) ?? {
            entregues: 0,
            total: 0,
            inconformes: 0,
            recebidos: 0,
          },
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
      .where(and(...kpiWhere, eq(frentesAdmissao.concluida, false)))
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
      .where(and(...kpiWhere, eq(frentesAdmissao.concluida, false)));
    const comPendencias = (await this.pendenciasSet(emAndamentoRows.map((r) => r.admissaoId))).size;

    // KPI "Cadastrado" (aba Cadastro, decisão do diretor): quantas JÁ foram cadastradas. Precisa de
    // consulta própria porque `porStatus` conta só `concluida = false`, e "Cadastrado" é o status
    // CONCLUINTE da frente — ali daria sempre 0. Mesmo filtro cliente/período dos demais KPIs, então
    // herda a exclusão de declínio (§A.16). Só a aba Cadastro consulta; as outras não pagam a query.
    //
    // GENERALIZADO na OST do card "Aptas": a mesma contagem serve à aba EXAME, onde o concluinte é
    // APTO. Uma consulta só, feita apenas nas abas que exibem o card (Cadastro e Exame); a Auditoria
    // não paga a query. `cadastrados` mantém o nome por compatibilidade com a tela do Cadastro, e
    // `aptas` é o mesmo número lido pela aba do Exame.
    let cadastrados = 0;
    let aptas = 0;
    if (tipo === "CADASTRO_CONTRATO" || tipo === "EXAME") {
      const [linha] = await this.db
        .select({ n: count() })
        .from(frentesAdmissao)
        .innerJoin(admissoes, eq(frentesAdmissao.admissaoId, admissoes.id))
        .where(and(...kpiWhere, eq(frentesAdmissao.concluida, true)));
      const concluidas = linha?.n ?? 0;
      if (tipo === "CADASTRO_CONTRATO") cadastrados = concluidas;
      else aptas = concluidas;
    }

    // KPI "Pausadas" (OST admissão pausada, Bloco 4): o card que impede a pausada de virar admissão
    // fantasma. Conta as PAUSADAS desta frente ainda EM ANDAMENTO, sob o mesmo cliente/período dos
    // demais cards, e é clicável como filtro (§A.12). Note que usa `clientePeriodo` (que exclui
    // declínio), NÃO `kpiWhere`: aqui a pausa é justamente o que se quer contar.
    const [linhaPausadas] = await this.db
      .select({ n: count() })
      .from(frentesAdmissao)
      .innerJoin(admissoes, eq(frentesAdmissao.admissaoId, admissoes.id))
      .where(
        and(...clientePeriodo, eq(frentesAdmissao.concluida, false), isNotNull(admissoes.pausadaEm)),
      );
    const pausadas = linhaPausadas?.n ?? 0;

    return {
      items,
      kpis: { porStatus, total, comPendencias, cadastrados, aptas, pausadas },
      statusCatalogo,
    };
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
        id: exameAgendamento.id,
        admissaoId: exameAgendamento.admissaoId,
        data: exameAgendamento.data,
        // As colunas de clínica/endereço/horário do PAI são histórico (multi-endereço, OST Onda 2):
        // continuam aqui para a linha antiga não ficar vazia, mas quem manda é `enderecos`.
        horario: exameAgendamento.horario,
        nomeClinica: exameAgendamento.nomeClinica,
        clinicaId: exameAgendamento.clinicaId,
        local: exameAgendamento.local,
        fornecedor: exameAgendamento.fornecedor,
        valor: exameAgendamento.valor,
        previsaoAso: exameAgendamento.previsaoAso,
        reagendamentos: exameAgendamento.reagendamentos,
      })
      .from(exameAgendamento)
      .where(inArray(exameAgendamento.admissaoId, admissaoIds));
    // Endereços em UMA consulta para a página inteira (multi-endereço, OST Onda 2).
    const enderecos = await this.enderecosPorAgendamento(rows.map((r) => r.id));
    return new Map(
      rows.map((r) => [r.admissaoId, { ...r, enderecos: enderecos.get(r.id) ?? [] }]),
    );
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
    // (a) AGENDADO exige o agendamento COMPLETO: data, horário, clínica, local e fornecedor. Antes
    // o guard só olhava a data, então uma linha incompleta gravada fora do modal passava.
    if (tipo === "EXAME" && novo === "AGENDADO") {
      const faltantes = await this.camposAgendamentoFaltantes(frente.admissaoId);
      if (faltantes.length > 0) {
        throw new ConflictException({
          needsConfirmation: false,
          reason: "exameSemAgendamento",
          message: `Cadastre as informações do exame (modal de agendamento) antes de marcar como Agendado. Falta preencher: ${faltantes.join(", ")}.`,
        });
      }
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
      tipo === "AUDITORIA" && conclui(tipo, novo) && admissao?.codCliente && admissao.cargoId
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
          setor: vaga?.setor,
          gestorBp: vaga?.gestorBp,
        },
        isBanco: admissao.isBanco,
        termoBancoEntregue,
        temBeneficioEstruturado: (await this.beneficiosEstruturadosSet([admissao.id])).has(
          admissao.id,
        ),
      }, await configDoCliente(this.db, admissao?.codCliente));
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
            // Registro da exceção: liberado sem ASO validado pela I.A (autor da transição =
            // frente.responsavelId = user.id, data = criadoEm). O papel sai do usuário que
            // confirmou, NUNCA fixo: quem libera é Master OU Super Admin, e a NC é registro
            // permanente de responsabilização — tem de dizer a verdade sobre quem autorizou.
            detalhe: `Exame liberado como apto SEM ASO validado pela I.A (autorização de ${rotuloPapel(user.papel)}).`,
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

  /**
   * Declínio da admissão INTEIRA (OST ajustes, item 3), acionável de qualquer frente. Aplica AO VIVO
   * a regra 2 do §A.16, numa transação: farol DECLINOU + motivo (no MESMO `motivo_declinio_id` do
   * lápis/olho), Auditoria "Declinou" e Exame "Cancelado" (concluida=false, não falseia êxito).
   * A frente de Cadastro NÃO é tocada: a coluna Cadastro segue o farol (ehDeclinio) no Gerenciador.
   * Nenhuma frente fica "aberta"/"Aguardando". O §A.16 tira a admissão de todas as filas.
   */
  async declinarAdmissao(admissaoId: string, motivoDeclinioId: string, autorId?: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    const motivo = await this.db.query.motivosDeclinio.findFirst({
      where: eq(motivosDeclinio.id, motivoDeclinioId),
    });
    if (!motivo) throw new BadRequestException("Motivo de declínio inválido.");

    // Motivo ANTERIOR pelo NOME (não uuid): o histórico é lido por gente, mesmo critério do lápis.
    // Lido ANTES do update, senão o valor some.
    const motivoAnterior = adm.motivoDeclinioId
      ? ((
          await this.db.query.motivosDeclinio.findFirst({
            where: eq(motivosDeclinio.id, adm.motivoDeclinioId),
          })
        )?.nome ?? null)
      : null;

    // REGRA DE OURO (OST declínio não-destrutivo): o declínio é um MARCADOR da ADMISSÃO (farol
    // DECLINOU + motivo). NÃO toca em nenhuma frente — o exame, o prontuário, o ASO, as datas ficam
    // exatamente como estão. A exibição "Declínio" nas colunas é derivada do farol (não do dado).
    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({ farolGlobal: "DECLINOU", motivoDeclinioId, atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));

      // TRILHA DO EVENTO (append-only). O farol e o motivo são sobrescritos NA LINHA da admissão:
      // sem isto, declinar → reativar → declinar de novo apaga o motivo anterior e o "quando" nunca
      // existiu. A data do evento é o `criadoEm` da linha do log. Mesmo formato/tabela do lápis, para
      // o histórico da pessoa ser UM só. O evento é da ADMISSÃO, não é segmentado por frente.
      const linhas: { campo: string; valorAnterior: string | null; valorNovo: string | null }[] =
        [];
      if (adm.farolGlobal !== "DECLINOU") {
        linhas.push({
          campo: "farolGlobal",
          valorAnterior: adm.farolGlobal,
          valorNovo: "DECLINOU",
        });
      }
      if (motivoAnterior !== motivo.nome) {
        linhas.push({
          campo: "motivoDeclinio",
          valorAnterior: motivoAnterior,
          valorNovo: motivo.nome,
        });
      }
      if (linhas.length > 0) {
        await tx
          .insert(candidatoAlteracoesLog)
          .values(linhas.map((l) => ({ ...l, admissaoId, autorId: autorId ?? null })));
      }
    });

    return { admissaoId, farolGlobal: "DECLINOU", motivoDeclinioId };
  }

  // ── PAUSA DA ADMISSÃO (OST admissão pausada) ──────────────────────────────
  /**
   * PAUSA a admissão. Questão interna do cliente, sem declinar (que é encerramento) e sem deixar a
   * admissão rodando nos automáticos.
   *
   * REGRA DE OURO, o irmão da regra do declínio: a pausa é uma FLAG da admissão
   * (`pausada_em`/`pausada_por`/`pausa_motivo`) e NÃO TOCA em frente nenhuma, nem no farol. As três
   * frentes ficam exatamente onde estão, o farol continua derivando por baixo, e é por isso que
   * retomar não precisa restaurar nada: nada foi alterado para começar.
   *
   * SÓ `EM_ADMISSAO` (decisão do diretor): `BANCO_AGUARDAR` já é estado de espera e pausar seria
   * redundante; concluída e declinada não têm o que pausar.
   *
   * O que a pausa NÃO faz: não para a AUDITORIA. O consultor segue auditando documento durante a
   * pausa, de propósito (a pausa é sobre o cliente, não sobre a análise interna).
   *
   * Qualquer consultor pausa (não é ação restrita), como o declínio.
   */
  async pausarAdmissao(admissaoId: string, motivo: string | undefined, autorId?: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    if (adm.pausadaEm) throw new ConflictException("Esta admissão já está pausada.");
    if (adm.farolGlobal !== "EM_ADMISSAO") {
      throw new ConflictException(
        "Só admissão em andamento pode ser pausada (banco, concluída e declinada não entram).",
      );
    }

    const pausaMotivo = motivo?.trim() || null;
    const pausadaEm = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({ pausadaEm, pausadaPor: autorId ?? null, pausaMotivo, atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));

      // TRILHA (append-only), mesma tabela e formato do declínio e do lápis: o histórico da pessoa é
      // UM só. A flag é sobrescrita na linha, então sem isto pausar → retomar → pausar apagaria o
      // motivo anterior e o "quando" nunca teria existido. Quem/quando saem do log (autor + criadoEm).
      const linhas: { campo: string; valorAnterior: string | null; valorNovo: string | null }[] = [
        { campo: "pausa", valorAnterior: null, valorNovo: "Admissão pausada" },
      ];
      if (pausaMotivo) {
        linhas.push({ campo: "motivoPausa", valorAnterior: null, valorNovo: pausaMotivo });
      }
      await tx
        .insert(candidatoAlteracoesLog)
        .values(linhas.map((l) => ({ ...l, admissaoId, autorId: autorId ?? null })));
    });

    return { admissaoId, pausada: true, pausadaEm: pausadaEm.toISOString() };
  }

  /**
   * RETOMA a admissão. Limpa a flag e pronto: como a pausa nunca tocou frente nem farol, cada frente
   * continua no ponto em que estava e o farol já reflete o estado real (inclusive se Auditoria e
   * Exame fecharam DURANTE a pausa, porque a derivação nunca foi congelada). Nada recomeça.
   *
   * O envelope da Clicksign volta à lista de alvos do tick pelo mesmo motivo: ele nunca foi
   * cancelado nem tocado, só deixou de ser consultado enquanto a flag estava de pé.
   *
   * O motivo da pausa é PRESERVADO na linha (`pausa_motivo`) de propósito: apagar jogaria fora o
   * "por quê" da última pausa. Quem quiser o histórico completo tem a trilha.
   */
  async retomarAdmissao(admissaoId: string, autorId?: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    if (!adm.pausadaEm) throw new ConflictException("Esta admissão não está pausada.");

    await this.db.transaction(async (tx) => {
      await tx
        .update(admissoes)
        .set({ pausadaEm: null, pausadaPor: null, atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));

      await tx.insert(candidatoAlteracoesLog).values({
        campo: "pausa",
        valorAnterior: "Admissão pausada",
        valorNovo: "Admissão retomada",
        admissaoId,
        autorId: autorId ?? null,
      });
    });

    return { admissaoId, pausada: false };
  }

  /** A admissão tem o ASO registrado como ENTREGUE? (só status — §A.6). */
  private async temAso(admissaoId: string): Promise<boolean> {
    return (await this.asoEntregueSet([admissaoId])).has(admissaoId);
  }

  /**
   * Conjunto de admissões com ≥1 campo obrigatório vazio (S2/S3). Delega para a FONTE ÚNICA
   * (`regua/pendencias-lote`), que o Gerenciador também usa: era esta lógica morando só aqui, com o
   * Gerenciador decidindo por SQL sobre o enum gravado, que fazia as duas telas divergirem.
   */
  private async pendenciasSet(admissaoIds: string[]): Promise<Set<string>> {
    return pendenciasObrigatoriasSet(this.db, admissaoIds);
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
        // PAUSA (OST admissão pausada): o modal do olho mostra o estado e o motivo; os EVENTOS de
        // pausa/retomada saem da mesma trilha de `alteracoes` que o modal já lista.
        pausadaEm: admissoes.pausadaEm,
        pausaMotivo: admissoes.pausaMotivo,
        // TROCA DE CLIENTE (OST da correção do cliente errado): carimbo não nulo acende o aviso
        // vermelho no modal, até o consultor revisar os documentos e o prontuário.
        trocaClienteEm: admissoes.trocaClienteEm,
        // Observação livre deixada na LIBERAÇÃO (Bloco 3): o recado do consultor para quem tocar a
        // admissão adiante. Não confundir com `documentos_admissao.observacao` (motivo do veredito
        // por documento), que este mesmo detalhe também devolve, dentro de `documentos[]`.
        observacaoLiberacao: admissoes.observacaoLiberacao,
        matricula: admissoes.matricula,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        candidatoEmail: candidatos.email,
        candidatoTelefone: candidatos.telefone,
        candidatoDataNascimento: candidatos.dataNascimento,
        // Nome do banco vindo do formulário do Pandapé (OST do banco no modal do olho).
        candidatoBanco: candidatos.banco,
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
    // O innerJoin cliente+cargo acima já descarta a pré-admissão (AGUARDANDO_LIBERACAO, cliente/cargo
    // nulos): ela é vista na tela de Liberação, nunca neste detalhe da Esteira. Guard explícito.
    if (!adm.codCliente || !adm.cargoId) {
      throw new NotFoundException("Admissão sem cliente/cargo (aguardando liberação).");
    }

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

    // Alias de `usuarios` só para o validador humano do documento: a query já usa `usuarios` para
    // outros papéis, e sem o alias o join colidiria.
    const validadores = aliasedTable(usuarios, "validadores_doc");

    // Checklist de documentos: exigência da régua + estado na admissão (regra 7 — só status).
    const documentos = await this.db
      .select({
        nome: tiposDocumento.nome,
        codigo: tiposDocumento.codigo,
        // Id do tipo do SLOT. A tela usa para auditar/reauditar a linha sem depender do nome.
        tipoDocumentoId: tiposDocumento.id,
        exigencia: reguaDocumental.exigencia,
        estado: documentosAdmissao.estado,
        // Motivo do veredito da IA (BLOCO 2): texto acionável, sem PII (§A.6). Exibido na aba Auditoria.
        observacao: documentosAdmissao.observacao,
        // OST B1 / Bloco 3: QUEM validou o documento à mão. Vai para a TELA (não fica só na trilha),
        // e é o que a reauditoria usa para perguntar antes de deixar a IA sobrescrever (Bloco 4).
        validadoPorNome: validadores.nome,
        validadoEm: documentosAdmissao.validadoEm,
        // OST motivo verdadeiro / Bloco 5: carimbo do último toque no documento. Serve ao marcador
        // de AUDITORIA PARADA (quanto tempo faz que ele está coletado sem veredito).
        atualizadoEm: documentosAdmissao.atualizadoEm,
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
      .leftJoin(validadores, eq(validadores.id, documentosAdmissao.validadoPorId))
      .where(
        and(
          eq(reguaDocumental.codCliente, adm.codCliente),
          eq(reguaDocumental.cargoId, adm.cargoId),
        ),
      )
      .orderBy(asc(tiposDocumento.nome));

    // OST A / Bloco 3 — EQUIVALÊNCIA DE TIPO. Documento recebido num tipo que não está na régua
    // (caso real: "Foto para Crachá") ficava invisível, porque o checklist é montado pela RÉGUA.
    // A linha do slot equivalente ("Foto 3x4") passa a exibir esse documento, e a auditoria/
    // reauditoria daquela linha aponta para o tipo REAL do documento recebido.
    const documentosFinal = await this.preencherSlotsEquivalentes(admissaoId, documentos);

    // Um "agora" só para todo o detalhe: duas linhas do mesmo checklist não podem discordar sobre o
    // limiar de parada por terem sido calculadas com relógios diferentes.
    const agoraDetalhe = new Date();

    // S2 — pendências obrigatórias (campos vazios da admissão).
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, admissaoId),
    });
    // BLOCO 3 do modal (Exame): dados do agendamento (data/horário/clínica/local/valor/previsão ASO),
    // coletados de exame_agendamento. Null quando o exame ainda não foi agendado.
    const agendamento = await this.obterAgendamento(admissaoId);
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
        setor: vaga?.setor,
        gestorBp: vaga?.gestorBp,
      },
      isBanco: adm.isBanco,
      termoBancoEntregue,
      temBeneficioEstruturado: (await this.beneficiosEstruturadosSet([admissaoId])).has(admissaoId),
    }, await configDoCliente(this.db, adm.codCliente));

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
      // PAUSA (OST admissão pausada): estado e motivo na ficha. Os EVENTOS de pausa/retomada (quem,
      // quando) vêm na mesma lista `alteracoes` que o modal já exibe, sem estrutura nova.
      pausadaEm: adm.pausadaEm,
      pausaMotivo: adm.pausaMotivo,
      isBanco: adm.isBanco,
      origem: adm.origem,
      drivePastaUrl: adm.drivePastaUrl,
      driveAsoUrl: adm.driveAsoUrl,
      clicksignStatus: adm.clicksignStatus,
      // Não expõe o ID do envelope (referência técnica interna) — só se já existe (§A.6).
      temEnvelope: Boolean(adm.clicksignEnvelopeId),
      contratoAssinadoDriveUrl: adm.contratoAssinadoDriveUrl,
      sinalizador: adm.sinalizador,
      // Bloco 3: null quando o consultor não escreveu nada — a tela não abre o bloco nesse caso.
      observacaoLiberacao: adm.observacaoLiberacao,
      trocaClienteEm: adm.trocaClienteEm,
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
      matricula: adm.matricula,
      candidato: {
        nome: adm.candidatoNome,
        cpf: adm.candidatoCpf,
        email: adm.candidatoEmail,
        telefone: adm.candidatoTelefone,
        dataNascimento: adm.candidatoDataNascimento,
        // Informação a mais na ficha, não substituição: a auditoria do comprovante bancário pela IA
        // (agência, conta, titularidade) segue exatamente como está.
        banco: adm.candidatoBanco,
      },
      cliente: {
        codCliente: adm.codCliente,
        razaoSocial: adm.clienteRazao,
        operacao: adm.clienteOperacao,
      },
      cargo: adm.cargoNome,
      // BLOCO 2: dados da folha (endereço = o da admissão, decisão do diretor).
      //
      // CENTRO DE CUSTO, DEPARTAMENTO e GESTOR BP entram aqui (OST dos três bugs do modal do olho).
      // Eles JÁ estavam carregados: `vaga` é a linha inteira de `dados_vaga_folha`, e o próprio
      // cálculo de pendências logo acima lê `centroCusto` e `gestorBp` dela. O que faltava era
      // devolvê-los, então o dado existia no servidor e morria antes da resposta. O lápis do
      // Gerenciador (`/admissoes/:id`) sempre os devolveu; era só este detalhe que não.
      vagaFolha: {
        salario: vaga?.salario ?? null,
        escala: vaga?.escala ?? null,
        endereco: vaga?.endereco ?? null,
        centroCusto: vaga?.centroCusto ?? null,
        departamento: vaga?.departamento ?? null,
        setor: vaga?.setor ?? null,
        gestorBp: vaga?.gestorBp ?? null,
      },
      // BLOCO 3: dados do exame coletados do agendamento (só leitura no olho). Null = não agendado.
      exame: agendamento
        ? {
            data: agendamento.data,
            // MULTI-ENDEREÇO (OST Onda 2): a ficha mostra a LISTA. Os campos singulares abaixo são o
            // histórico do agendamento de um endereço só e seguem para não quebrar leitura antiga.
            enderecos: agendamento.enderecos,
            horario: agendamento.horario,
            nomeClinica: agendamento.nomeClinica,
            local: agendamento.local,
            fornecedor: agendamento.fornecedor,
            valor: agendamento.valor,
            previsaoAso: agendamento.previsaoAso,
          }
        : null,
      frentes: frentes.map((f) => ({
        tipo: f.tipo,
        status: f.status,
        rotulo: rotuloDe(f.tipo, f.status),
        concluida: f.concluida,
        dataInicio: f.dataInicio,
        dataConclusao: f.dataConclusao,
      })),
      documentos: documentosFinal.map((d) => ({
        nome: d.nome,
        // Tipo a usar ao auditar/reauditar ESTA linha (pode ser o equivalente, ver Bloco 3).
        tipoDocumentoId: d.tipoDocumentoId,
        exigencia: d.exigencia,
        estado: d.estado ?? "PENDENTE",
        observacao: d.observacao ?? null,
        validadoPorNome: d.validadoEm ? (d.validadoPorNome ?? "não informado") : null,
        validadoEm: d.validadoEm ?? null,
        // OST motivo verdadeiro / Bloco 5: MARCADOR DE TEMPO PARADO. Só é preenchido quando o
        // documento está em AGUARDANDO_AUDITORIA além do limiar (6h), então a tela não precisa saber
        // a regra nem fazer conta: campo ausente significa "nada a sinalizar". Não é contador
        // permanente de coluna (avaliado e recusado), é marcador de anomalia.
        paradoHa: auditoriaParada({ estado: d.estado, atualizadoEm: d.atualizadoEm }, agoraDetalhe)
          ? horasParado(d.atualizadoEm, agoraDetalhe)
          : null,
      })),
    };
  }

  /**
   * OST A / Bloco 3 — preenche um slot VAZIO do checklist com o documento de um tipo equivalente
   * (ver `domain/documentos-equivalentes`). Só age quando o slot não tem documento próprio: um
   * documento no tipo da régua sempre ganha do equivalente. Quando o equivalente entra, a linha passa
   * a carregar o `tipoDocumentoId` REAL do documento recebido, para a tela auditar a coisa certa.
   * §A.6: só códigos, estados e motivo, nada de PII.
   */
  private async preencherSlotsEquivalentes<
    T extends {
      codigo: string;
      tipoDocumentoId: string;
      estado: string | null;
      observacao: string | null;
      validadoPorNome?: string | null;
      validadoEm?: Date | null;
      // Carimbo do documento REAL, para o marcador de auditoria parada valer também no slot
      // preenchido por equivalente (senão o equivalente preso nunca sinalizaria).
      atualizadoEm?: Date | null;
    },
  >(admissaoId: string, linhas: T[]): Promise<T[]> {
    const alvos = linhas.filter((l) => !l.estado && equivalentesDoSlot(l.codigo).length > 0);
    if (alvos.length === 0) return linhas;

    const codigos = [...new Set(alvos.flatMap((l) => [...equivalentesDoSlot(l.codigo)]))];
    const recebidos = await this.db
      .select({
        codigo: tiposDocumento.codigo,
        tipoDocumentoId: tiposDocumento.id,
        estado: documentosAdmissao.estado,
        observacao: documentosAdmissao.observacao,
        validadoPorNome: usuarios.nome,
        validadoEm: documentosAdmissao.validadoEm,
        atualizadoEm: documentosAdmissao.atualizadoEm,
      })
      .from(documentosAdmissao)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, documentosAdmissao.tipoDocumentoId))
      .leftJoin(usuarios, eq(usuarios.id, documentosAdmissao.validadoPorId))
      .where(
        and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          inArray(tiposDocumento.codigo, codigos),
        ),
      );
    if (recebidos.length === 0) return linhas;

    const porCodigo = new Map(recebidos.map((r) => [r.codigo, r]));
    return linhas.map((l) => {
      if (l.estado) return l;
      for (const cod of equivalentesDoSlot(l.codigo)) {
        const achado = porCodigo.get(cod);
        if (!achado) continue;
        return {
          ...l,
          tipoDocumentoId: achado.tipoDocumentoId,
          estado: achado.estado,
          observacao: achado.observacao,
          validadoPorNome: achado.validadoPorNome,
          validadoEm: achado.validadoEm,
          atualizadoEm: achado.atualizadoEm,
        };
      }
      return l;
    });
  }

  /**
   * F8 (Exame) — anexa o ASO e dispara a VALIDAÇÃO PELA I.A (gate de APTO). Registra o ASO como
   * ENTREGUE (anexado) e a I.A lê o documento decidindo apto/inapto → grava `asoValidado`. NÃO
   * persiste o binário (regra 7 / §A.6): só metadados + staging efêmera (expurgada). Robusto: se a
   * I.A estiver indisponível, o ASO fica ANEXADO porém NÃO validado (gate segue travado até revalidar).
   */
  async anexarAso(admissaoId: string, file?: Express.Multer.File, user?: AuthUser) {
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

    // OST visualização/descarte, BLOCO 4 — §A.6. A observação gravada era
    // `ASO anexado: {nome do arquivo} ({bytes})`, e era a ÚNICA porta por onde nome de arquivo
    // entrava em `documentos_admissao`. Nome de arquivo escolhido por quem envia carrega PII na
    // prática (já se viu CPF em nome de arquivo), então o nome SAI e o tamanho FICA: o tamanho é o
    // que serve para conferir que o upload subiu inteiro, e não identifica ninguém.
    //
    // O nome no DRIVE não muda (`{Nome do Tipo}_{nome do candidato}`): lá o nome da pessoa entra de
    // propósito, é o prontuário dela (§A.6, exceção deliberada já registrada).
    const observacaoAso = `ASO anexado (${tamanho} bytes)`;

    await this.db
      .insert(documentosAdmissao)
      .values({
        admissaoId,
        tipoDocumentoId: aso.id,
        estado: "ENTREGUE",
        observacao: observacaoAso,
      })
      .onConflictDoUpdate({
        target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
        set: {
          estado: "ENTREGUE",
          observacao: observacaoAso,
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

    // TRANSIÇÃO PÓS-ASO (OST Onda 2, item 3): com o ASO anexado E VALIDADO pela I.A, a frente vai
    // sozinha para APTO, conclui e abre o gate do Cadastro, tirando a admissão da espera.
    //
    // O GATILHO É O VEREDITO, NÃO O ANEXO, e isso é deliberado (decisão confirmada pelo diretor). O
    // APTO sempre exigiu ASO anexado E validado pela I.A ("é a I.A que valida, não um flag manual"),
    // e disparar no mero anexo contornaria esse controle: bastaria subir qualquer arquivo para
    // concluir a frente. Na prática é o mesmo instante, porque a classificação acontece aqui mesmo,
    // de forma síncrona. I.A indisponível ou veredito reprovado NÃO concluem: a frente fica onde
    // está e o consultor reenvia.
    const aptoAuto = asoValidado ? await this.concluirExamePorAso(admissaoId, user) : undefined;

    return {
      ok: true,
      aso: { nome, registradoEm },
      asoValidado,
      iaStatus,
      ...(aptoAuto ? { aptoAuto } : {}),
    };
  }

  /**
   * Conclui a frente EXAME em APTO por causa do ASO validado (OST Onda 2, transição pós-ASO).
   *
   * Só age quando a frente está num dos estados de espera; frente já concluída, CANCELADA ou ainda em
   * A_AGENDAR não é tocada. Idempotente: repetir o anexo não gera evento novo nem desconclui nada.
   * O gate do Cadastro continua sendo aberto por quem sempre abriu, o `recomputeFarolGlobal` e o
   * nascimento lazy da frente, exatamente como no caminho manual.
   */
  private async concluirExamePorAso(
    admissaoId: string,
    user?: AuthUser,
  ): Promise<{ de: string; para: string } | undefined> {
    const [frente] = await this.db
      .select({
        id: frentesAdmissao.id,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
      })
      .from(frentesAdmissao)
      .where(and(eq(frentesAdmissao.admissaoId, admissaoId), eq(frentesAdmissao.tipo, "EXAME")));
    if (!frente || frente.concluida) return undefined;
    if (!["AGENDADO", "AGUARDANDO_ASO", "ASO_PENDENTE"].includes(frente.status)) return undefined;

    const agora = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(frentesAdmissao)
        .set({ status: "APTO", concluida: true, dataConclusao: agora, atualizadoEm: agora })
        .where(eq(frentesAdmissao.id, frente.id));
      await tx.insert(frenteStatusEventos).values({
        admissaoId,
        frenteId: frente.id,
        tipo: "EXAME",
        deStatus: frente.status,
        paraStatus: "APTO",
        reversao: false,
        autorId: user?.id ?? null,
      });
    });
    await recomputeFarolGlobal(this.db, admissaoId);
    return { de: frente.status, para: "APTO" };
  }

  // ── Modal de Gestão de Agendamento do Exame (aba EXAME) ──────────────────────

  /** Devolve o agendamento do exame da admissão (ou null se ainda não cadastrado). */
  async obterAgendamento(admissaoId: string) {
    const [row] = await this.db
      .select()
      .from(exameAgendamento)
      .where(eq(exameAgendamento.admissaoId, admissaoId));
    if (!row) return null;
    return { ...row, enderecos: await this.enderecosDoAgendamento(row.id) };
  }

  /**
   * Os endereços de UM agendamento, na ordem. É a FONTE DA VERDADE de clínica, endereço e horário
   * desde o multi-endereço (OST Onda 2): as colunas equivalentes no pai são histórico e não são mais
   * escritas.
   */
  private async enderecosDoAgendamento(agendamentoId: string) {
    return this.db
      .select({
        id: exameAgendamentoEndereco.id,
        ordem: exameAgendamentoEndereco.ordem,
        clinicaId: exameAgendamentoEndereco.clinicaId,
        nomeClinica: exameAgendamentoEndereco.nomeClinica,
        local: exameAgendamentoEndereco.local,
        horario: exameAgendamentoEndereco.horario,
        fornecedor: exameAgendamentoEndereco.fornecedor,
      })
      .from(exameAgendamentoEndereco)
      .where(eq(exameAgendamentoEndereco.agendamentoId, agendamentoId))
      .orderBy(asc(exameAgendamentoEndereco.ordem));
  }

  /**
   * Endereços de VÁRIOS agendamentos, em UMA consulta (fila do Exame e planilha da clínica). Uma
   * consulta por linha da fila viraria N+1 na primeira página com 50 candidatos.
   */
  private async enderecosPorAgendamento(
    agendamentoIds: string[],
  ): Promise<Map<string, EnderecoResumo[]>> {
    const mapa = new Map<string, EnderecoResumo[]>();
    if (agendamentoIds.length === 0) return mapa;
    const linhas = await this.db
      .select({
        agendamentoId: exameAgendamentoEndereco.agendamentoId,
        ordem: exameAgendamentoEndereco.ordem,
        nomeClinica: exameAgendamentoEndereco.nomeClinica,
        local: exameAgendamentoEndereco.local,
        horario: exameAgendamentoEndereco.horario,
        fornecedor: exameAgendamentoEndereco.fornecedor,
      })
      .from(exameAgendamentoEndereco)
      .where(inArray(exameAgendamentoEndereco.agendamentoId, agendamentoIds))
      .orderBy(asc(exameAgendamentoEndereco.ordem));
    for (const l of linhas) {
      const lista = mapa.get(l.agendamentoId) ?? [];
      lista.push({
        ordem: l.ordem,
        nomeClinica: l.nomeClinica,
        local: l.local,
        horario: l.horario,
        fornecedor: l.fornecedor,
      });
      mapa.set(l.agendamentoId, lista);
    }
    return mapa;
  }

  /**
   * Cadastra (1ª vez) OU reagenda (já existe) o agendamento do exame. Reagendar OBRIGA atualizar os
   * dados e INCREMENTA o contador de reagendamentos (sub-status). Sem PII — só logística do exame.
   */
  async salvarAgendamento(admissaoId: string, dto: AgendamentoExameDto, user?: AuthUser) {
    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    // Resolve TODAS as clínicas de uma vez e grava o nome junto de cada endereço: se a clínica for
    // inativada depois, o agendamento antigo continua dizendo qual era (OST das clínicas).
    const ids = [...new Set(dto.enderecos.map((e) => e.clinicaId))];
    const catalogo = await this.db
      .select({
        id: clinicasCatalogo.id,
        nome: clinicasCatalogo.nome,
        fornecedor: clinicasCatalogo.fornecedor,
      })
      .from(clinicasCatalogo)
      .where(inArray(clinicasCatalogo.id, ids));
    const porId = new Map(catalogo.map((c) => [c.id, c]));
    for (const e of dto.enderecos) {
      if (!porId.has(e.clinicaId)) {
        throw new NotFoundException("Clínica não encontrada no cadastro.");
      }
    }

    const existente = await this.obterAgendamento(admissaoId);
    const agora = new Date();
    const valores = {
      data: dto.data,
      valor: dto.valor === undefined ? null : dto.valor.toFixed(2),
      previsaoAso: dto.previsaoAso,
    };

    // O PAI guarda o que é do agendamento inteiro (data, fornecedor, valor, previsão). Clínica,
    // endereço e horário vivem na tabela FILHA, uma linha por endereço: é ela a fonte da verdade.
    // As colunas antigas do pai não são mais escritas e ficam com o valor histórico.
    const agendamentoId = await this.db.transaction(async (tx) => {
      let id: string;
      if (!existente) {
        const [row] = await tx
          .insert(exameAgendamento)
          .values({ admissaoId, ...valores })
          .returning({ id: exameAgendamento.id });
        id = row.id;
      } else {
        await tx
          .update(exameAgendamento)
          .set({ ...valores, reagendamentos: existente.reagendamentos + 1, atualizadoEm: agora })
          .where(eq(exameAgendamento.id, existente.id));
        id = existente.id;
      }
      // SUBSTITUI a lista inteira: o modal manda o conjunto completo, então apagar e regravar é o
      // que mantém ordem e remoções coerentes sem diff manual.
      await tx
        .delete(exameAgendamentoEndereco)
        .where(eq(exameAgendamentoEndereco.agendamentoId, id));
      await tx.insert(exameAgendamentoEndereco).values(
        dto.enderecos.map((e, indice) => ({
          agendamentoId: id,
          ordem: indice + 1,
          clinicaId: e.clinicaId,
          nomeClinica: porId.get(e.clinicaId)?.nome ?? null,
          // FORNECEDOR DERIVADO da clínica deste endereço (OST do fornecedor por clínica), copiado
          // aqui pelo mesmo motivo do nome: se a clínica trocar de fornecedor depois, o agendamento
          // antigo continua dizendo com quem foi feito.
          fornecedor: porId.get(e.clinicaId)?.fornecedor ?? null,
          local: e.local,
          horario: e.horario,
        })),
      );
      return id;
    });

    const statusAuto = await this.marcarExameAgendado(admissaoId, user);
    const agendamento = await this.obterAgendamento(admissaoId);
    return {
      ok: true,
      reagendou: Boolean(existente),
      agendamentoId,
      agendamento,
      ...(statusAuto ? { statusAuto } : {}),
    };
  }

  /**
   * AGENDAR É AUTOMÁTICO (OST Onda 2): salvar o agendamento move a frente EXAME para AGENDADO.
   *
   * Antes disto o consultor preenchia o modal e AINDA precisava trocar o status na mão. Duas coisas
   * para o mesmo fato, e a fila mostrava "A Agendar" para quem já tinha exame marcado.
   *
   * O que NÃO é sobrescrito, de propósito:
   *  - frente CONCLUÍDA (APTO): reagendar não desconclui exame que já terminou;
   *  - CANCELADO: é decisão humana de encerrar, não pode ser desfeita por um salvamento;
   *  - quem já está em AGENDADO: não gera evento repetido na trilha.
   * Os dois status de espera do ASO (AGUARDANDO_ASO, ASO_PENDENTE) VOLTAM para AGENDADO, que é o
   * ponto do reagendamento.
   *
   * Idempotente e silencioso: devolve `undefined` quando não havia o que mudar.
   */
  private async marcarExameAgendado(
    admissaoId: string,
    user?: AuthUser,
  ): Promise<{ de: string; para: string } | undefined> {
    const [frente] = await this.db
      .select({
        id: frentesAdmissao.id,
        status: frentesAdmissao.status,
        concluida: frentesAdmissao.concluida,
      })
      .from(frentesAdmissao)
      .where(
        and(eq(frentesAdmissao.admissaoId, admissaoId), eq(frentesAdmissao.tipo, "EXAME")),
      );
    if (!frente) return undefined;
    if (frente.concluida || frente.status === "CANCELADO" || frente.status === "AGENDADO") {
      return undefined;
    }

    const agora = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(frentesAdmissao)
        .set({ status: "AGENDADO", atualizadoEm: agora })
        .where(eq(frentesAdmissao.id, frente.id));
      await tx.insert(frenteStatusEventos).values({
        admissaoId,
        frenteId: frente.id,
        tipo: "EXAME",
        deStatus: frente.status,
        paraStatus: "AGENDADO",
        reversao: false,
        autorId: user?.id ?? null,
      });
    });
    return { de: frente.status, para: "AGENDADO" };
  }

  /**
   * Campos do agendamento que faltam para marcar AGENDADO (gate). Devolve os RÓTULOS do que falta,
   * na ordem do modal, para a mensagem dizer exatamente o que preencher.
   *
   * São os MESMOS 5 campos que o `AgendamentoExameDto` já exige, e é esse o ponto: o DTO fecha o
   * caminho da tela, este guard fecha os outros (seed, backfill, SQL). As colunas de
   * `exame_agendamento` são nullable, então uma linha gravada fora do modal passaria com só a data.
   *
   * `valor` e `previsaoAso` NÃO entram: são opcionais por decisão do diretor (a previsão quem informa
   * é a clínica, e pode não ter respondido no momento do agendamento). Exigi-los aqui travaria um
   * exame legitimamente agendado.
   */
  private async camposAgendamentoFaltantes(admissaoId: string): Promise<string[]> {
    const ag = await this.obterAgendamento(admissaoId);
    if (!ag) return ["data", "endereço do exame"];
    const faltantes: string[] = [];
    if (!ag.data) faltantes.push("data");
    // MULTI-ENDEREÇO (OST Onda 2): o gate passou a olhar a LISTA. Um agendamento sem nenhum endereço
    // não está agendado; e endereço incompleto (sem clínica, sem local ou sem horário) é o mesmo
    // buraco que o gate sempre cobriu, agora por linha.
    if (ag.enderecos.length === 0) {
      faltantes.push("endereço do exame");
    } else {
      // O FORNECEDOR entra aqui, e não mais como campo do pai: ele vem da clínica, então endereço com
      // clínica sem fornecedor cadastrado é endereço incompleto.
      const incompletos = ag.enderecos.filter(
        (e) => !e.nomeClinica || !e.local || !e.horario || !e.fornecedor,
      );
      if (incompletos.length > 0) {
        faltantes.push(
          incompletos.length === ag.enderecos.length
            ? "clínica, local, horário e fornecedor dos endereços"
            : `dados de ${incompletos.length} endereço(s)`,
        );
      }
    }
    return faltantes;
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
        // COLUNA SETOR da planilha da clínica: passa a vir do campo SETOR próprio (OST Onda 2,
        // confirmado pelo diretor). Vinha de `departamento` porque o Setor não existia como campo;
        // agora existe, e o Departamento NÃO entra na planilha (nunca teve coluna lá).
        setor: dadosVagaFolha.setor,
        agendamentoData: exameAgendamento.data,
        agendamentoId: exameAgendamento.id,
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
    const enderecosMapa = await this.enderecosPorAgendamento(
      base.map((b) => b.agendamentoId).filter((id): id is string => Boolean(id)),
    );
    for (const id of admissaoIds) {
      const b = porAdmissao.get(id);
      // `base` já innerJoina cliente/cargo, então uma pré-admissão (cod nulo) nem chega aqui; o guard
      // de codCliente é o que estreita o tipo (nulável desde a Liberação Admissional).
      if (!b || !b.codCliente) continue;
      const vw = viewMap.get(b.codCliente);
      // Estágio NÃO faz exame admissional → fora do relatório da clínica (§ decisão do diretor).
      if (vw?.tipo_servico === "ESTAGIO") continue;
      const base = {
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
        regiao: b.regiao ?? b.regiaoCod ?? "",
      };
      // UMA LINHA POR ENDEREÇO (OST Onda 2, decisão do diretor): três endereços viram três linhas,
      // cada uma com a sua clínica, o seu endereço e o seu horário. Sem endereço nenhum (agendamento
      // antigo ou ainda por marcar), sai UMA linha, como sempre saiu.
      const doAgendamento = b.agendamentoId ? (enderecosMapa.get(b.agendamentoId) ?? []) : [];
      if (doAgendamento.length === 0) {
        linhas.push({ ...base, agendamento: formatarData(b.agendamentoData) });
        continue;
      }
      for (const e of doAgendamento) {
        linhas.push({
          ...base,
          agendamento: [formatarData(b.agendamentoData), e.horario].filter(Boolean).join(" "),
          clinica: e.nomeClinica ?? "",
          endereco: e.local ?? "",
          fornecedor: e.fornecedor ?? "",
        });
      }
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
        l.clinica ?? "",
        l.endereco ?? "",
        l.fornecedor ?? "",
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
  // Colunas novas do multi-endereço (OST Onda 2): com três endereços saem três linhas, e é aqui que
  // a clínica e o endereço de CADA uma aparecem.
  "CLÍNICA",
  "ENDEREÇO",
  "FORNECEDOR",
  "REGIÃO",
] as const;

/** Resumo do agendamento do exame exibido na fila EXAME. */
interface EnderecoResumo {
  ordem: number;
  nomeClinica: string | null;
  local: string | null;
  horario: string | null;
  /** Fornecedor DESTE endereço, derivado da clínica dele. */
  fornecedor: string | null;
}

interface AgendamentoResumo {
  admissaoId: string;
  data: string | null;
  /** Endereços do dia, na ordem. FONTE DA VERDADE de clínica, endereço e horário. */
  enderecos: EnderecoResumo[];
  /** Legado do agendamento de um endereço só. Mantido para não quebrar leitura antiga. */
  horario: string | null;
  nomeClinica: string | null;
  local: string | null;
  fornecedor: string | null;
  valor: string | null;
  previsaoAso: string | null;
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
  /** Clínica, endereço e fornecedor DESTA linha (multi-endereço). Vazios no agendamento antigo. */
  clinica?: string;
  endereco?: string;
  fornecedor?: string;
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
