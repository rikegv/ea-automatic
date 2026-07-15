import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { isValidCpf, normalizeCpf, type FarolGlobal } from "@ea/shared-types";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatoAlteracoesLog,
  candidatos,
  cargos,
  clienteBeneficioPadrao,
  clientes,
  dadosVagaFolha,
  documentosAdmissao,
  frenteStatusCatalogo,
  frentesAdmissao,
  integracaoPandape,
  reguaDocumental,
} from "../db/schema";
import { calcSinalizadorPreenchimento, STATUS_INICIAL_FRENTE } from "../domain/admissao";
import { parseBeneficiosPadrao } from "../domain/beneficios";
import { FRENTES_AO_NASCER } from "../domain/frentes";
import { recomputeFarolGlobal } from "./farol";
import type { AuthUser } from "../auth/auth.types";
import type { CreateAdmissaoDto } from "./dto/create-admissao.dto";
import type { UpdateAdmissaoDto } from "./dto/update-admissao.dto";

export interface ListarAdmissoesFiltros {
  q?: string;
  codCliente?: string;
  cargoId?: string;
  tipoContrato?: string;
  farol?: string;
  sinalizador?: string;
  concluido?: boolean;
  comPendencias?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Opções de criação por origem (Fase 5 / INT-1). A sync do Pandapé reusa `create` SEM duplicar
 * lógica: marca `origem`, anexa a linha de IntegraçãoPandapé na MESMA transação e desativa o
 * bloqueio por aceite (regra 5 — não-bloqueio: a sync não pode travar por campos pendentes).
 */
export interface CreateAdmissaoOpts {
  origem?: "MANUAL" | "PANDAPE";
  bypassAceite?: boolean;
  pandape?: { idPrecollaborator: string; idMatch?: string; idVacancy?: string; etapa?: string };
}

@Injectable()
export class AdmissoesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * F11 / regra 6 — lookup em tempo real do candidato por CPF. NUNCA 404 (consulta, não recurso):
   * candidato ausente devolve {candidato:null, admissoes:0}. O CPF não é logado (§A.6).
   */
  async lookupCandidato(cpfRaw: string) {
    const cpf = normalizeCpf(cpfRaw);
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, cpf),
    });
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(admissoes)
      .where(eq(admissoes.candidatoCpf, cpf));

    if (!candidato) {
      return { candidato: null, admissoes: 0 };
    }
    return {
      candidato: {
        cpf: candidato.cpf,
        nome: candidato.nome,
        email: candidato.email,
        telefone: candidato.telefone,
      },
      admissoes: total,
    };
  }

  /** F6 — cria a admissão e seus filhos numa transação (nascimento paralelo das frentes — regra 1). */
  async create(dto: CreateAdmissaoDto, user?: AuthUser, opts?: CreateAdmissaoOpts) {
    // a. validação de CPF (F3) — chave técnica de identidade.
    const cpf = normalizeCpf(dto.candidato.cpf);
    if (!isValidCpf(cpf)) {
      throw new BadRequestException("CPF inválido");
    }

    // a.1 W6 — campos obrigatórios. NÃO impede (F4/regra 5), mas exige ACEITE EXPLÍCITO quando há
    // pendências. O log permanente do aceite por passagem é da esteira (S3, marco 3).
    const vf = dto.vagaFolha ?? {};
    const pend: string[] = [];
    if (!vf.salario) pend.push("Salário");
    if (!vf.escala) pend.push("Escala");
    if (!vf.beneficios) pend.push("Benefícios");
    if (!vf.centroCusto) pend.push("Centro de custo");
    if (!vf.gestorBp) pend.push("Gestor / BP");
    if (!dto.tipoContrato) pend.push("Tipo de contrato");
    if (!vf.tempoContrato) pend.push("Tempo de contrato");
    if (!dto.candidato.dataNascimento) pend.push("Data de nascimento");
    if (!dto.candidato.telefone) pend.push("Telefone");
    if (!dto.candidato.email) pend.push("E-mail");
    if (vf.motivo === "Substituição") {
      if (!vf.substituidoNome) pend.push("Nome do substituído");
      if (!vf.substituidoCpf) pend.push("CPF do substituído");
    }
    if (pend.length > 0 && !dto.aceitePendencias && !opts?.bypassAceite) {
      throw new ConflictException({
        needsAceite: true,
        camposPendentes: pend,
        message: "Campos obrigatórios pendentes — aceite explícito necessário (F4).",
      });
    }
    // CPF do substituído, se informado, deve ser válido (dado pessoal — minimização).
    const substituidoCpf = vf.substituidoCpf ? normalizeCpf(vf.substituidoCpf) : null;
    if (substituidoCpf && !isValidCpf(substituidoCpf)) {
      throw new BadRequestException("CPF do substituído inválido");
    }

    const resultado = await this.db.transaction(async (tx) => {
      // b. cliente e cargo precisam existir.
      const cliente = await tx.query.clientes.findFirst({
        where: eq(clientes.codCliente, dto.codCliente),
      });
      if (!cliente) throw new NotFoundException("Cliente não encontrado");

      const cargo = await tx.query.cargos.findFirst({ where: eq(cargos.id, dto.cargoId) });
      if (!cargo) throw new NotFoundException("Cargo não encontrado");

      // c. candidato: insere por CPF, preservando o existente (regra 6 — histórico).
      await tx
        .insert(candidatos)
        .values({
          cpf,
          nome: dto.candidato.nome,
          email: dto.candidato.email ?? null,
          telefone: dto.candidato.telefone ?? null,
          dataNascimento: dto.candidato.dataNascimento ?? null,
          sexo: dto.candidato.sexo ?? null,
        })
        .onConflictDoNothing({ target: candidatos.cpf });
      // Preserva o candidato existente (regra 6); só COMPLETA o sexo quando ainda está vazio (o
      // Reservista da régua padrão depende dele). Não sobrescreve um sexo já informado.
      if (dto.candidato.sexo) {
        await tx
          .update(candidatos)
          .set({ sexo: dto.candidato.sexo })
          .where(and(eq(candidatos.cpf, cpf), isNull(candidatos.sexo)));
      }

      // d. régua do par (cliente + cargo) — define os documentos exigidos (regra 4).
      const regua = await tx
        .select({
          tipoDocumentoId: reguaDocumental.tipoDocumentoId,
          exigencia: reguaDocumental.exigencia,
        })
        .from(reguaDocumental)
        .where(
          and(
            eq(reguaDocumental.codCliente, dto.codCliente),
            eq(reguaDocumental.cargoId, dto.cargoId),
          ),
        );

      // e. sinalizador de preenchimento (F5) — marca, nunca bloqueia (regra 5).
      const sinalizadorPreenchimento = calcSinalizadorPreenchimento({
        candidato: { nome: dto.candidato.nome, cpf },
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        dataAdmissao: dto.dataAdmissao,
        tipoContrato: dto.tipoContrato,
        vagaFolha: { salario: dto.vagaFolha?.salario },
      });

      // f. admissão (entidade central).
      const [admissao] = await tx
        .insert(admissoes)
        .values({
          candidatoCpf: cpf,
          codCliente: dto.codCliente,
          cargoId: dto.cargoId,
          tipoContrato: dto.tipoContrato ?? null,
          dataAdmissao: dto.dataAdmissao ?? null,
          // Consultor que gerou a admissão (Fase 2C) — base da atribuição de NC (Via 1).
          consultorId: user?.id ?? null,
          sinalizadorPreenchimento,
          origem: opts?.origem ?? "MANUAL",
        })
        .returning({ id: admissoes.id });

      const admissaoId = admissao.id;

      // f.1 IntegraçãoPandapé (anexo opcional) — na MESMA transação, só quando a admissão veio do
      // Pandapé (Fase 5 / INT-1). Não persistir URLs do Pandapé aqui (§A.6): só os IDs e a etapa.
      if (opts?.pandape) {
        await tx.insert(integracaoPandape).values({
          admissaoId,
          idPrecollaborator: opts.pandape.idPrecollaborator,
          idMatch: opts.pandape.idMatch,
          idVacancy: opts.pandape.idVacancy,
          etapa: opts.pandape.etapa,
        });
      }

      // g. dados de vaga/folha (1:1). Substituição (W2): CPF do substituído com TTL 48h — o relógio
      // dispara na assinatura do contrato (futuro); por ora marca expurgo em now+48h (placeholder
      // documentado), e o job de expurgo nula o CPF ao vencer (§A.6 — minimização/descarte).
      const ehSubstituicao = vf.motivo === "Substituição" && Boolean(substituidoCpf);
      await tx.insert(dadosVagaFolha).values({
        admissaoId,
        salario: vf.salario ?? null,
        beneficios: vf.beneficios ?? null,
        escala: vf.escala ?? null,
        centroCusto: vf.centroCusto ?? null,
        departamento: vf.departamento ?? null,
        gestorBp: vf.gestorBp ?? null,
        motivo: vf.motivo ?? null,
        tempoContrato: vf.tempoContrato ?? null,
        endereco: vf.endereco ?? null,
        substituidoNome: ehSubstituicao ? (vf.substituidoNome ?? null) : null,
        substituidoCpf: ehSubstituicao ? substituidoCpf : null,
        substituicaoExpurgarEm: ehSubstituicao ? new Date(Date.now() + 48 * 60 * 60 * 1000) : null,
      });

      // h. nascimento paralelo (regra 1 / F12): AUDITORIA + EXAME. CADASTRO_CONTRATO não nasce (regra 3).
      const agora = new Date();
      await tx.insert(frentesAdmissao).values(
        FRENTES_AO_NASCER.map((tipo) => ({
          admissaoId,
          tipo,
          status: STATUS_INICIAL_FRENTE[tipo],
          concluida: false,
          dataInicio: agora,
        })),
      );

      // i. documentos exigidos (OBRIGATORIO/FACULTATIVO) em estado PENDENTE; NAO_OBRIGATORIO é pulado.
      const exigidos = regua.filter(
        (r) => r.exigencia === "OBRIGATORIO" || r.exigencia === "FACULTATIVO",
      );
      if (exigidos.length > 0) {
        await tx.insert(documentosAdmissao).values(
          exigidos.map((r) => ({
            admissaoId,
            tipoDocumentoId: r.tipoDocumentoId,
            estado: "PENDENTE" as const,
          })),
        );
      }

      return {
        admissaoId,
        sinalizadorPreenchimento,
        frentes: [...FRENTES_AO_NASCER],
        documentos: exigidos.length,
      };
    });

    // j. VR/AM viram PADRÃO do cliente (item 4): pré-preenchem a próxima admissão. Best-effort FORA
    // da transação — nunca quebra a criação (envolvido em try/catch). Last write wins por (cliente,
    // benefício). Só valor monetário por cliente, sem PII (§A.6).
    try {
      const padroes = parseBeneficiosPadrao(vf.beneficios);
      for (const p of padroes) {
        await this.db
          .insert(clienteBeneficioPadrao)
          .values({ codCliente: dto.codCliente, beneficio: p.beneficio, valor: p.valor })
          .onConflictDoUpdate({
            target: [clienteBeneficioPadrao.codCliente, clienteBeneficioPadrao.beneficio],
            set: { valor: p.valor, atualizadoEm: new Date() },
          });
      }
    } catch {
      // best-effort: persistir o padrão de benefício nunca invalida uma admissão já criada.
    }

    return resultado;
  }

  /**
   * F10/F7 — Gerenciador: lista paginada de TODAS as admissões com filtros acumulativos + busca
   * global (nome/CPF) + KPIs (total/ativos/concluídos/declinados). "Concluído" = a frente
   * CADASTRO_CONTRATO da admissão está concluída (processo finalizado). Os KPIs aplicam os filtros
   * de cliente/cargo/contrato/sinalizador/período/busca, mas NÃO o farol/concluído (mostram a
   * distribuição e funcionam como botão de filtro). CPF nunca é retornado na lista (só filtra).
   */
  async listar(filtros: ListarAdmissoesFiltros) {
    const page = Math.max(1, Math.floor(filtros.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(filtros.pageSize ?? 20)));

    // Filtros base (compartilhados pela lista e pelos KPIs).
    const base = [];
    if (filtros.codCliente) base.push(eq(admissoes.codCliente, filtros.codCliente));
    if (filtros.cargoId) base.push(eq(admissoes.cargoId, filtros.cargoId));
    if (filtros.tipoContrato) base.push(eq(admissoes.tipoContrato, filtros.tipoContrato));
    if (filtros.sinalizador) {
      base.push(eq(admissoes.sinalizadorPreenchimento, filtros.sinalizador as "PENDENTE"));
    }
    if (filtros.from) {
      if (!DATA_RE.test(filtros.from)) throw new BadRequestException("from inválido (YYYY-MM-DD)");
      base.push(gte(admissoes.dataAdmissao, filtros.from));
    }
    if (filtros.to) {
      if (!DATA_RE.test(filtros.to)) throw new BadRequestException("to inválido (YYYY-MM-DD)");
      base.push(lte(admissoes.dataAdmissao, filtros.to));
    }
    const q = filtros.q?.trim();
    if (q) {
      const cpfDigits = normalizeCpf(q);
      const porNome = ilike(candidatos.nome, `%${q}%`);
      base.push(
        cpfDigits.length >= 3 ? or(porNome, ilike(candidatos.cpf, `%${cpfDigits}%`))! : porNome,
      );
    }

    // "Concluído" = existe frente CADASTRO_CONTRATO concluída.
    const concluidoExpr = sql<boolean>`EXISTS (SELECT 1 FROM frentes_admissao f WHERE f.admissao_id = ${admissoes.id} AND f.tipo = 'CADASTRO_CONTRATO' AND f.concluida = true)`;

    // "Com pendências obrigatórias" = sinalizador de preenchimento diferente de OK (falta campo-núcleo),
    // MAS quem declinou/rescindiu NUNCA conta como pendência em nenhum card (regra permanente de
    // importação, §A.3/Regra 2): pendência é de quem está no processo; o declínio saiu. Fica só como
    // histórico. Mesma exclusão por farol que a Esteira aplica nas filas operacionais.
    const comPendenciaExpr = sql<boolean>`(${admissoes.sinalizadorPreenchimento} <> 'OK' AND ${admissoes.farolGlobal} NOT IN ('DECLINOU', 'RESCISAO'))`;

    // Filtros de status (farol/concluído/pendências): só na lista, não nos KPIs (os cards mostram
    // a distribuição do conjunto base e funcionam como botão de filtro, §A.12).
    const listWhere = [...base];
    if (filtros.farol) listWhere.push(eq(admissoes.farolGlobal, filtros.farol as FarolGlobal));
    if (filtros.concluido) listWhere.push(concluidoExpr);
    if (filtros.comPendencias) listWhere.push(comPendenciaExpr);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .where(listWhere.length ? and(...listWhere) : undefined);

    const items = await this.db
      .select({
        admissaoId: admissoes.id,
        candidatoNome: candidatos.nome,
        codCliente: admissoes.codCliente,
        clienteOperacao: clientes.nomeOperacao,
        clienteRazao: clientes.razaoSocial,
        cargoNome: cargos.nome,
        tipoContrato: admissoes.tipoContrato,
        dataAdmissao: admissoes.dataAdmissao,
        farolGlobal: admissoes.farolGlobal,
        isBanco: admissoes.isBanco,
        origem: admissoes.origem,
        sinalizador: admissoes.sinalizadorPreenchimento,
        concluido: concluidoExpr,
        criadoEm: admissoes.criadoEm,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .where(listWhere.length ? and(...listWhere) : undefined)
      .orderBy(desc(admissoes.criadoEm))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // G4a — status das 3 frentes por admissão da página (colunas Auditoria/Exame/Cadastro).
    const ids = items.map((i) => i.admissaoId);
    const frentesRows = ids.length
      ? await this.db
          .select({
            admissaoId: frentesAdmissao.admissaoId,
            tipo: frentesAdmissao.tipo,
            status: frentesAdmissao.status,
            concluida: frentesAdmissao.concluida,
          })
          .from(frentesAdmissao)
          .where(inArray(frentesAdmissao.admissaoId, ids))
      : [];
    const catalogo = await this.db
      .select({
        tipo: frenteStatusCatalogo.tipo,
        codigo: frenteStatusCatalogo.codigo,
        rotulo: frenteStatusCatalogo.rotulo,
      })
      .from(frenteStatusCatalogo);
    const rotuloDe = (tipo: string, codigo: string) =>
      catalogo.find((c) => c.tipo === tipo && c.codigo === codigo)?.rotulo ?? codigo;
    const frentesPorAdm = new Map<
      string,
      Record<string, { status: string; rotulo: string; concluida: boolean }>
    >();
    for (const f of frentesRows) {
      const m = frentesPorAdm.get(f.admissaoId) ?? {};
      m[f.tipo] = { status: f.status, rotulo: rotuloDe(f.tipo, f.status), concluida: f.concluida };
      frentesPorAdm.set(f.admissaoId, m);
    }
    const itemsComFrentes = items.map((i) => ({
      ...i,
      frentes: frentesPorAdm.get(i.admissaoId) ?? {},
    }));

    // Valores distintos de tipo de contrato (para o filtro Select).
    const tiposContratoRows = await this.db
      .selectDistinct({ tipo: admissoes.tipoContrato })
      .from(admissoes)
      .where(sql`${admissoes.tipoContrato} is not null and ${admissoes.tipoContrato} <> ''`)
      .orderBy(admissoes.tipoContrato);

    // KPIs sobre o conjunto base (sem farol/concluído).
    const [kpi] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        ativos: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'EM_ADMISSAO')::int`,
        declinados: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'DECLINOU')::int`,
        concluidos: sql<number>`count(*) filter (where ${concluidoExpr})::int`,
        comPendencias: sql<number>`count(*) filter (where ${comPendenciaExpr})::int`,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .where(base.length ? and(...base) : undefined);

    return {
      items: itemsComFrentes,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tiposContrato: tiposContratoRows.map((r) => r.tipo).filter((t): t is string => Boolean(t)),
      kpis: {
        total: kpi?.total ?? 0,
        ativos: kpi?.ativos ?? 0,
        concluidos: kpi?.concluidos ?? 0,
        declinados: kpi?.declinados ?? 0,
        comPendencias: kpi?.comPendencias ?? 0,
      },
    };
  }

  /** F10 — campos editáveis de uma admissão (prefill do formulário de edição). */
  async obter(id: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, id),
    });
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, adm.candidatoCpf),
    });
    return {
      admissaoId: adm.id,
      tipoContrato: adm.tipoContrato,
      dataAdmissao: adm.dataAdmissao,
      matricula: adm.matricula,
      farolGlobal: adm.farolGlobal,
      isBanco: adm.isBanco,
      origem: adm.origem,
      // Dados pessoais do candidato (OST — ajuste de escopo): editáveis, exceto o CPF (identidade §A.3).
      candidato: {
        cpf: adm.candidatoCpf,
        nome: candidato?.nome ?? "",
        email: candidato?.email ?? null,
        telefone: candidato?.telefone ?? null,
        dataNascimento: candidato?.dataNascimento ?? null,
      },
      vagaFolha: {
        salario: vaga?.salario ?? null,
        beneficios: vaga?.beneficios ?? null,
        escala: vaga?.escala ?? null,
        centroCusto: vaga?.centroCusto ?? null,
        departamento: vaga?.departamento ?? null,
        gestorBp: vaga?.gestorBp ?? null,
        motivo: vaga?.motivo ?? null,
        tempoContrato: vaga?.tempoContrato ?? null,
        endereco: vaga?.endereco ?? null,
      },
    };
  }

  /**
   * F10 — edita uma admissão (Gerenciador): dados de vaga/folha + contrato/data/matrícula/farol.
   * NÃO altera CPF nem cod_cliente (identidade — §A.3). Recalcula o sinalizador (F5) com os novos
   * valores para a coluna do gerenciador continuar verdadeira.
   */
  async editar(id: string, dto: UpdateAdmissaoDto, user?: AuthUser) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    const candidato = await this.db.query.candidatos.findFirst({
      where: eq(candidatos.cpf, adm.candidatoCpf),
    });
    const vaga = await this.db.query.dadosVagaFolha.findFirst({
      where: eq(dadosVagaFolha.admissaoId, id),
    });

    // Campo "" no payload → limpa (null); ausente → mantém.
    const orNull = (v?: string) =>
      v === undefined ? undefined : v.trim() === "" ? null : v.trim();
    // Valor efetivo de campo texto: ausente (undefined) → mantém o anterior; "" → null; senão trim.
    const efetivo = (v: string | undefined, anterior: string | null) =>
      v === undefined ? anterior : v.trim() === "" ? null : v.trim();

    const result = await this.db.transaction(async (tx) => {
      // Trilha de alteração de candidato (OST-EA-GESTAO-USUARIOS). Compara estado anterior vs novo
      // campo a campo; só campos que MUDARAM viram log (nunca CPF/cod_cliente — imutáveis, §A.3).
      const logs: { campo: string; valorAnterior: string | null; valorNovo: string | null }[] = [];
      const str = (v: unknown): string | null =>
        v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
      const registrar = (campo: string, anterior: unknown, novo: unknown) => {
        const a = str(anterior);
        const n = str(novo);
        if (a !== n) logs.push({ campo, valorAnterior: a, valorNovo: n });
      };

      // Vaga/folha (1:1).
      if (dto.vagaFolha) {
        const vf = dto.vagaFolha;
        const novoSalarioVf =
          vf.salario === undefined ? (vaga?.salario ?? null) : vf.salario || null;
        registrar("salario", vaga?.salario ?? null, novoSalarioVf);
        registrar(
          "beneficios",
          vaga?.beneficios ?? null,
          efetivo(vf.beneficios, vaga?.beneficios ?? null),
        );
        registrar("escala", vaga?.escala ?? null, efetivo(vf.escala, vaga?.escala ?? null));
        registrar(
          "centroCusto",
          vaga?.centroCusto ?? null,
          efetivo(vf.centroCusto, vaga?.centroCusto ?? null),
        );
        registrar(
          "departamento",
          vaga?.departamento ?? null,
          efetivo(vf.departamento, vaga?.departamento ?? null),
        );
        registrar("gestorBp", vaga?.gestorBp ?? null, efetivo(vf.gestorBp, vaga?.gestorBp ?? null));
        registrar("motivo", vaga?.motivo ?? null, efetivo(vf.motivo, vaga?.motivo ?? null));
        registrar(
          "tempoContrato",
          vaga?.tempoContrato ?? null,
          efetivo(vf.tempoContrato, vaga?.tempoContrato ?? null),
        );
        registrar("endereco", vaga?.endereco ?? null, efetivo(vf.endereco, vaga?.endereco ?? null));

        await tx
          .update(dadosVagaFolha)
          .set({
            salario: vf.salario === undefined ? undefined : vf.salario || null,
            beneficios: orNull(vf.beneficios),
            escala: orNull(vf.escala),
            centroCusto: orNull(vf.centroCusto),
            departamento: orNull(vf.departamento),
            gestorBp: orNull(vf.gestorBp),
            motivo: orNull(vf.motivo),
            tempoContrato: orNull(vf.tempoContrato),
            endereco: orNull(vf.endereco),
          })
          .where(eq(dadosVagaFolha.admissaoId, id));
      }

      // Dados pessoais do candidato (OST-EA-GESTAO-USUARIOS — ajuste de escopo): nome/e-mail/telefone/
      // nascimento agora editáveis (antes imutáveis). CPF permanece imutável (identidade, §A.3). O
      // candidato é compartilhado por CPF → a alteração vale para todas as admissões dessa pessoa; o
      // log fica sob ESTA admissão. Cada campo que muda vira uma linha em candidato_alteracoes_log.
      let novoNomeCandidato = candidato?.nome ?? "";
      if (dto.candidato && candidato) {
        const c = dto.candidato;
        // nome é obrigatório (notNull): vazio/ausente mantém o anterior.
        const novoNome =
          c.nome !== undefined && c.nome.trim() !== "" ? c.nome.trim() : candidato.nome;
        const novoEmail = efetivo(c.email, candidato.email ?? null);
        const novoTelefone = efetivo(c.telefone, candidato.telefone ?? null);
        const novoNasc =
          c.dataNascimento === undefined
            ? (candidato.dataNascimento ?? null)
            : c.dataNascimento.trim() === ""
              ? null
              : c.dataNascimento.trim();

        registrar("nome", candidato.nome, novoNome);
        registrar("email", candidato.email ?? null, novoEmail);
        registrar("telefone", candidato.telefone ?? null, novoTelefone);
        registrar("dataNascimento", candidato.dataNascimento ?? null, novoNasc);

        novoNomeCandidato = novoNome;

        await tx
          .update(candidatos)
          .set({
            nome: novoNome,
            email: novoEmail,
            telefone: novoTelefone,
            dataNascimento: novoNasc,
            atualizadoEm: new Date(),
          })
          .where(eq(candidatos.cpf, adm.candidatoCpf));
      }

      const novoTipoContrato =
        dto.tipoContrato === undefined ? adm.tipoContrato : orNull(dto.tipoContrato);
      const novaDataAdmissao =
        dto.dataAdmissao === undefined ? adm.dataAdmissao : orNull(dto.dataAdmissao);
      const novaMatricula = dto.matricula === undefined ? adm.matricula : orNull(dto.matricula);
      // farolGlobal: só loga se veio no dto (ação direta do usuário). O recompute automático pós-
      // transação (recomputeFarolGlobal) é do sistema e NÃO gera log de usuário (OST).
      const novoFarol = (dto.farolGlobal as FarolGlobal) ?? adm.farolGlobal;
      const novoIsBanco = dto.isBanco === undefined ? adm.isBanco : dto.isBanco;

      registrar("tipoContrato", adm.tipoContrato, novoTipoContrato);
      registrar("dataAdmissao", adm.dataAdmissao, novaDataAdmissao);
      registrar("matricula", adm.matricula, novaMatricula);
      if (dto.farolGlobal !== undefined) registrar("farolGlobal", adm.farolGlobal, novoFarol);
      registrar("isBanco", adm.isBanco, novoIsBanco);

      const novoSalario =
        dto.vagaFolha?.salario === undefined
          ? (vaga?.salario ?? null)
          : dto.vagaFolha.salario || null;

      // Recalcula o sinalizador (F5) com os valores efetivos.
      const sinalizador = calcSinalizadorPreenchimento({
        candidato: { nome: novoNomeCandidato, cpf: adm.candidatoCpf },
        codCliente: adm.codCliente,
        cargoId: adm.cargoId,
        dataAdmissao: novaDataAdmissao ?? undefined,
        tipoContrato: novoTipoContrato ?? undefined,
        vagaFolha: { salario: novoSalario ?? undefined },
      });

      const [upd] = await tx
        .update(admissoes)
        .set({
          tipoContrato: novoTipoContrato,
          dataAdmissao: novaDataAdmissao,
          matricula: novaMatricula,
          farolGlobal: novoFarol,
          isBanco: novoIsBanco,
          sinalizadorPreenchimento: sinalizador,
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, id))
        .returning({ id: admissoes.id, sinalizador: admissoes.sinalizadorPreenchimento });

      if (logs.length > 0) {
        await tx.insert(candidatoAlteracoesLog).values(
          logs.map((l) => ({
            admissaoId: id,
            campo: l.campo,
            valorAnterior: l.valorAnterior,
            valorNovo: l.valorNovo,
            autorId: user?.id ?? null,
          })),
        );
      }

      return { admissaoId: upd.id, sinalizador: upd.sinalizador };
    });

    // Editar a data de admissão pode alternar EM_ADMISSAO ↔ BANCO_AGUARDAR (§A.3 / Fase 4
    // complemento). A escolha manual de farol (DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA) é preservada.
    const farolGlobal = await recomputeFarolGlobal(this.db, id);
    return { ...result, farolGlobal };
  }

  /**
   * F10 — deleta uma admissão (Gerenciador). DECISÃO TÉCNICA: **hard delete** — as FKs em cascata
   * (vaga/folha, documentos, frentes, eventos, NCs, integração Pandapé) removem os filhos. Restrito
   * a MASTER/SUPER_ADMIN no controller (ação destrutiva). Soft delete fica como evolução futura.
   */
  async deletar(id: string) {
    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, id) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");
    await this.db.delete(admissoes).where(eq(admissoes.id, id));
    return { deleted: true, id };
  }
}
