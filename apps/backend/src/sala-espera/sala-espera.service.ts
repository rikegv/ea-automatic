import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { cargos, clientes, salaEspera, salaEsperaStatus } from "../db/schema";
import type { SalaEsperaDto, SalaEsperaStatusDto } from "./sala-espera.dto";
import type { AuthUser } from "../auth/auth.types";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";

/**
 * SALA DE ESPERA: o candidato anunciado pelo cliente ou pela Seleção ANTES de se candidatar no
 * Pandapé. É PRÉ-PROCESSO, e a fase que hoje é invisível para a diretoria.
 *
 * NÃO É ADMISSÃO, e a tabela é própria justamente por isso: o registro não tem CPF, e `admissoes`
 * exige um (a chave de `candidatos` é o próprio CPF). Nada aqui toca a esteira.
 *
 * A FILA MOSTRA SÓ O QUE ESTÁ EM ABERTO, e "aberto" tem duas condições, não uma:
 *  - o status NÃO é terminal (`encerra = false`), e
 *  - o registro ainda não foi VINCULADO a uma admissão (`admissao_id IS NULL`).
 * A segunda só passa a acontecer na onda 3 (match manual), mas o filtro já nasce completo: deixar
 * para depois seria plantar o vazamento e esperar alguém notar.
 *
 * §A.6: nome e telefone do candidato são dados pessoais, mas não há CPF nem documento. Nenhum deles
 * vai para log.
 */
@Injectable()
export class SalaEsperaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ── Catálogo de status (Gerencial) ────────────────────────────────────────

  /** Todos os status, inclusive inativos: é a tela de manutenção do catálogo. */
  listarStatus() {
    return this.db
      .select()
      .from(salaEsperaStatus)
      .orderBy(asc(salaEsperaStatus.ordem), asc(salaEsperaStatus.nome));
  }

  /** Só os ATIVOS, para os seletores da tela da Sala. */
  listarStatusAtivos() {
    return this.db
      .select({
        id: salaEsperaStatus.id,
        nome: salaEsperaStatus.nome,
        encerra: salaEsperaStatus.encerra,
      })
      .from(salaEsperaStatus)
      .where(eq(salaEsperaStatus.ativo, true))
      .orderBy(asc(salaEsperaStatus.ordem), asc(salaEsperaStatus.nome));
  }

  async criarStatus(dto: SalaEsperaStatusDto) {
    const [row] = await this.db
      .insert(salaEsperaStatus)
      .values({
        nome: dto.nome.trim(),
        encerra: dto.encerra ?? false,
        ativo: dto.ativo ?? true,
        ordem: dto.ordem ?? 0,
      })
      .returning();
    return row;
  }

  async atualizarStatus(id: string, dto: Partial<SalaEsperaStatusDto>) {
    const [row] = await this.db
      .update(salaEsperaStatus)
      .set({
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.encerra !== undefined ? { encerra: dto.encerra } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        ...(dto.ordem !== undefined ? { ordem: dto.ordem } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(salaEsperaStatus.id, id))
      .returning();
    if (!row) throw new NotFoundException("Status não encontrado.");
    return row;
  }

  // ── Registros da Sala ─────────────────────────────────────────────────────

  /**
   * A fila. `incluirEncerrados` abre o histórico (o que declinou, desistiu ou já virou admissão),
   * que é o que a onda 4 vai consumir; o padrão é só o trabalho em aberto, para a tela não poluir.
   */
  async listar(incluirEncerrados = false) {
    const base = this.db
      .select({
        id: salaEspera.id,
        nome: salaEspera.nome,
        telefone: salaEspera.telefone,
        cpf: salaEspera.cpf,
        dataNascimento: salaEspera.dataNascimento,
        email: salaEspera.email,
        dataRecebimento: salaEspera.dataRecebimento,
        origem: salaEspera.origem,
        codCliente: salaEspera.codCliente,
        clienteRazao: clientes.razaoSocial,
        clienteOperacao: clientes.nomeOperacao,
        cargoId: salaEspera.cargoId,
        cargoNome: cargos.nome,
        statusId: salaEspera.statusId,
        statusNome: salaEsperaStatus.nome,
        statusEncerra: salaEsperaStatus.encerra,
        admissaoId: salaEspera.admissaoId,
        vinculadoEm: salaEspera.vinculadoEm,
        criadoEm: salaEspera.criadoEm,
      })
      .from(salaEspera)
      .innerJoin(salaEsperaStatus, eq(salaEsperaStatus.id, salaEspera.statusId))
      .leftJoin(clientes, eq(clientes.codCliente, salaEspera.codCliente))
      .leftJoin(cargos, eq(cargos.id, salaEspera.cargoId));

    if (incluirEncerrados) return base.orderBy(asc(salaEspera.dataRecebimento));
    return base
      .where(and(eq(salaEsperaStatus.encerra, false), isNull(salaEspera.admissaoId)))
      .orderBy(asc(salaEspera.dataRecebimento));
  }

  async criar(dto: SalaEsperaDto, user: AuthUser) {
    await this.validarReferencias(dto);
    const [row] = await this.db
      .insert(salaEspera)
      .values({
        nome: dto.nome.trim(),
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        telefone: dto.telefone?.trim() || null,
        cpf: this.cpfOuNulo(dto.cpf),
        dataNascimento: dto.dataNascimento || null,
        email: dto.email?.trim() || null,
        dataRecebimento: dto.dataRecebimento,
        origem: dto.origem,
        statusId: dto.statusId,
        criadoPorId: user?.id ?? null,
      })
      .returning();
    return row;
  }

  async atualizar(id: string, dto: SalaEsperaDto) {
    await this.validarReferencias(dto);
    const [row] = await this.db
      .update(salaEspera)
      .set({
        nome: dto.nome.trim(),
        codCliente: dto.codCliente,
        cargoId: dto.cargoId,
        telefone: dto.telefone?.trim() || null,
        cpf: this.cpfOuNulo(dto.cpf),
        dataNascimento: dto.dataNascimento || null,
        email: dto.email?.trim() || null,
        dataRecebimento: dto.dataRecebimento,
        origem: dto.origem,
        statusId: dto.statusId,
        atualizadoEm: new Date(),
      })
      .where(eq(salaEspera.id, id))
      .returning();
    if (!row) throw new NotFoundException("Registro não encontrado.");
    return row;
  }

  /**
   * CPF normalizado, ou `null` quando não veio. Vazio é caso NORMAL aqui (o candidato ainda não se
   * candidatou), mas CPF PREENCHIDO E INVÁLIDO é erro: o match da onda 3 casaria pela identidade
   * errada, que é pior do que não casar. §A.6: a mensagem não repete o valor recebido.
   */
  private cpfOuNulo(bruto?: string): string | null {
    const cpf = normalizeCpf(bruto ?? "");
    if (!cpf) return null;
    if (!isValidCpf(cpf)) throw new BadRequestException("CPF inválido.");
    return cpf;
  }

  /**
   * Cliente, cargo e status precisam existir. A checagem é explícita para o erro chegar legível na
   * tela, em vez de um 500 de chave estrangeira.
   */
  private async validarReferencias(dto: SalaEsperaDto) {
    const [cli] = await this.db
      .select({ cod: clientes.codCliente })
      .from(clientes)
      .where(eq(clientes.codCliente, dto.codCliente));
    if (!cli) throw new BadRequestException("Cliente não encontrado.");
    const [carg] = await this.db.select({ id: cargos.id }).from(cargos).where(eq(cargos.id, dto.cargoId));
    if (!carg) throw new BadRequestException("Cargo não encontrado.");
    const [st] = await this.db
      .select({ id: salaEsperaStatus.id })
      .from(salaEsperaStatus)
      .where(eq(salaEsperaStatus.id, dto.statusId));
    if (!st) throw new BadRequestException("Status não encontrado.");
  }
}
