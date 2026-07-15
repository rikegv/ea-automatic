import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, gte, ilike, inArray, lt, ne, or } from "drizzle-orm";
import { normalizeCpf } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  cargos,
  clientes,
  naoConformidades,
  usuarios,
} from "../db/schema";
import { ncSituacao, penalizaConsultor } from "../domain/nao-conformidade";
import type {
  DecidirLiberacaoDto,
  RegistrarNc3Dto,
  SolicitarLiberacaoDto,
} from "./dto/nc.dto";

export interface NcFiltros {
  // Busca rápida (Bloco C): nome, CPF ou cliente, num campo só.
  q?: string;
  // Multi-select (Bloco B): OU dentro do mesmo filtro. Vazio/ausente = sem filtro.
  tipo?: string[];
  consultorId?: string[];
  situacao?: string[];
  codCliente?: string[];
  from?: string;
  to?: string;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class NaoConformidadesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Lista de NCs (com filtros) + contador penalizante por consultor (gestão). */
  async listar(filtros: NcFiltros) {
    const where = [];
    if (filtros.tipo?.length) {
      where.push(inArray(naoConformidades.tipo, filtros.tipo as ("NC1" | "NC2" | "NC3")[]));
    }
    if (filtros.consultorId?.length) {
      where.push(inArray(naoConformidades.consultorId, filtros.consultorId));
    }
    if (filtros.codCliente?.length) where.push(inArray(admissoes.codCliente, filtros.codCliente));
    const q = filtros.q?.trim();
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
      where.push(or(...conds)!);
    }
    if (filtros.from) {
      if (!DATA_RE.test(filtros.from)) throw new BadRequestException("from inválido (YYYY-MM-DD)");
      where.push(gte(naoConformidades.criadoEm, new Date(`${filtros.from}T00:00:00`)));
    }
    if (filtros.to) {
      if (!DATA_RE.test(filtros.to)) throw new BadRequestException("to inválido (YYYY-MM-DD)");
      const toEnd = new Date(`${filtros.to}T00:00:00`);
      toEnd.setDate(toEnd.getDate() + 1);
      where.push(lt(naoConformidades.criadoEm, toEnd));
    }

    const rows = await this.db
      .select({
        id: naoConformidades.id,
        admissaoId: naoConformidades.admissaoId,
        tipo: naoConformidades.tipo,
        status: naoConformidades.status,
        detalhe: naoConformidades.detalhe,
        aceiteTermo: naoConformidades.aceiteTermo,
        flagSemKit: naoConformidades.flagSemKit,
        flagSemAssinatura: naoConformidades.flagSemAssinatura,
        flagCadastroNaoMarcado: naoConformidades.flagCadastroNaoMarcado,
        liberacaoStatus: naoConformidades.liberacaoStatus,
        liberacaoMotivo: naoConformidades.liberacaoMotivo,
        criadoEm: naoConformidades.criadoEm,
        resolvidoEm: naoConformidades.resolvidoEm,
        consultorId: naoConformidades.consultorId,
        consultorNome: usuarios.nome,
        candidatoNome: candidatos.nome,
        dataAdmissao: admissoes.dataAdmissao,
        codCliente: admissoes.codCliente,
        clienteRazao: clientes.razaoSocial,
        cargoNome: cargos.nome,
      })
      .from(naoConformidades)
      .innerJoin(admissoes, eq(naoConformidades.admissaoId, admissoes.id))
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .innerJoin(cargos, eq(admissoes.cargoId, cargos.id))
      .leftJoin(usuarios, eq(naoConformidades.consultorId, usuarios.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(naoConformidades.criadoEm));

    const items = rows
      .map((r) => ({
        ...r,
        situacao: ncSituacao(r.status, r.liberacaoStatus),
        penaliza: penalizaConsultor(r.liberacaoStatus),
      }))
      .filter((r) => !filtros.situacao?.length || filtros.situacao.includes(r.situacao));

    // Contador penalizante por consultor (independe dos filtros de exibição) — visão de gestão.
    const contadorRows = await this.db
      .select({
        consultorId: naoConformidades.consultorId,
        consultorNome: usuarios.nome,
        total: count(),
      })
      .from(naoConformidades)
      .leftJoin(usuarios, eq(naoConformidades.consultorId, usuarios.id))
      .where(ne(naoConformidades.liberacaoStatus, "APROVADA"))
      .groupBy(naoConformidades.consultorId, usuarios.nome)
      .orderBy(desc(count()));

    return { items, contadores: contadorRows };
  }

  /** NC-3 manual (Cadastro incompleto). Associa o consultor que GEROU a admissão (Via 1). */
  async registrarNc3(dto: RegistrarNc3Dto, user: AuthUser) {
    const flags = {
      flagSemKit: dto.flagSemKit ?? false,
      flagSemAssinatura: dto.flagSemAssinatura ?? false,
      flagCadastroNaoMarcado: dto.flagCadastroNaoMarcado ?? false,
    };
    if (!flags.flagSemKit && !flags.flagSemAssinatura && !flags.flagCadastroNaoMarcado) {
      throw new BadRequestException("Marque ao menos uma flag de cadastro incompleto.");
    }

    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, dto.admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    const rotulos: string[] = [];
    if (flags.flagSemKit) rotulos.push("sem kit adicionado");
    if (flags.flagSemAssinatura) rotulos.push("finalizada sem assinatura");
    if (flags.flagCadastroNaoMarcado) rotulos.push("cadastro não marcado como realizado");
    const detalhe = dto.detalhe?.trim() || `Cadastro incompleto: ${rotulos.join("; ")}.`;

    // Via 2 (item 2) — a pedido da diretoria: NC nasce PENDENTE de aprovação (com motivo).
    if (dto.liberacaoDiretoria && !dto.liberacaoMotivo?.trim()) {
      throw new BadRequestException("Informe o motivo da liberação por diretoria.");
    }
    const liberacao = dto.liberacaoDiretoria
      ? {
          liberacaoStatus: "PENDENTE" as const,
          liberacaoMotivo: dto.liberacaoMotivo!.trim(),
          liberacaoSolicitanteId: user.id,
        }
      : {};

    const [nc] = await this.db
      .insert(naoConformidades)
      .values({
        admissaoId: dto.admissaoId,
        tipo: "NC3",
        consultorId: admissao.consultorId ?? null,
        detalhe,
        ...flags,
        ...liberacao,
      })
      .onConflictDoNothing({ target: [naoConformidades.admissaoId, naoConformidades.tipo] })
      .returning({ id: naoConformidades.id });

    if (!nc) {
      throw new ConflictException("Já existe uma NC de Cadastro registrada para esta admissão.");
    }
    return { id: nc.id, tipo: "NC3" as const };
  }

  /** Resolve a NC (fecha a pendência). O REGISTRO PERMANECE no histórico (gestão por consultor). */
  async resolver(id: string, user: AuthUser) {
    const nc = await this.requireNc(id);
    if (nc.status === "RESOLVIDA") return { id, status: "RESOLVIDA" as const };
    await this.db
      .update(naoConformidades)
      .set({
        status: "RESOLVIDA",
        resolvidoPor: user.id,
        resolvidoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(naoConformidades.id, id));
    return { id, status: "RESOLVIDA" as const };
  }

  /** Via 2 — consultor flaga liberação por determinação da diretoria (motivo). Vai à supervisão. */
  async solicitarLiberacao(id: string, dto: SolicitarLiberacaoDto, user: AuthUser) {
    const nc = await this.requireNc(id);
    if (nc.liberacaoStatus === "APROVADA") {
      throw new ConflictException("Liberação já aprovada pela diretoria.");
    }
    await this.db
      .update(naoConformidades)
      .set({
        liberacaoStatus: "PENDENTE",
        liberacaoMotivo: dto.motivo.trim(),
        liberacaoSolicitanteId: user.id,
        liberacaoAprovadorId: null,
        liberacaoDecididoEm: null,
        atualizadoEm: new Date(),
      })
      .where(eq(naoConformidades.id, id));
    return { id, liberacaoStatus: "PENDENTE" as const };
  }

  /** Supervisão decide a liberação. Aprovada: exceção reconhecida (não penaliza). Reprovada: Via 1. */
  async decidirLiberacao(id: string, dto: DecidirLiberacaoDto, user: AuthUser) {
    const nc = await this.requireNc(id);
    if (nc.liberacaoStatus !== "PENDENTE") {
      throw new ConflictException("Não há liberação pendente para decidir nesta NC.");
    }
    const novo = dto.aprovar ? "APROVADA" : "REPROVADA";
    await this.db
      .update(naoConformidades)
      .set({
        liberacaoStatus: novo,
        liberacaoAprovadorId: user.id,
        liberacaoDecididoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(naoConformidades.id, id));
    return { id, liberacaoStatus: novo };
  }

  private async requireNc(id: string) {
    const nc = await this.db.query.naoConformidades.findFirst({
      where: eq(naoConformidades.id, id),
    });
    if (!nc) throw new NotFoundException("Não conformidade não encontrada");
    return nc;
  }
}
