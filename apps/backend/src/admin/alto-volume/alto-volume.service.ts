import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  admissaoProjeto,
  cargos,
  clientes,
  projetoGrupoEntrada,
  projetoVagaCargo,
  projetosAltoVolume,
} from "../../db/schema";
import type {
  CreateGrupoDto,
  CreateProjetoDto,
  CreateVagaDto,
  UpdateGrupoDto,
  UpdateProjetoDto,
  UpdateVagaDto,
} from "./alto-volume.dto";

/**
 * CADASTRO DE ALTO VOLUME (onda 1): projetos sazonais, seus grupos de entrada e as vagas por cargo.
 *
 * ESTA ONDA É SÓ O CADASTRO. Ela não conta nada, não mede preenchimento e não olha admissão: o
 * vínculo (`admissao_projeto`) só passa a ser ESCRITO na onda 2, pelo flag da Liberação, e só passa
 * a ser LIDO em análise na onda 4. Aqui ele aparece uma única vez, como GUARDA: para não deixar
 * apagar estrutura que já tem gente pendurada nela.
 *
 * INATIVAR PROJETO é exclusão lógica (`ativo=false`), padrão de todo cadastro do sistema: o projeto
 * encerrado sai do seletor da liberação e continua consultável com o histórico inteiro. GRUPO e VAGA
 * são exclusão FÍSICA, e a diferença é proposital: eles são linhas de um PLANO, que muda enquanto o
 * projeto anda ("eram 20 Atendentes, viraram 15"). Manter linha de plano inativa poluiria a soma das
 * vagas com números que o projeto já abandonou.
 *
 * §A.6: nenhuma PII passa por aqui. Cliente por código, cargo e projeto por id, e a única referência
 * a pessoa é o id do usuário que criou o projeto.
 */
@Injectable()
export class AltoVolumeService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ── Projeto ───────────────────────────────────────────────────────────────

  /**
   * Lista os projetos com o RESUMO do cadastro (grupos, cargos, vagas somadas), não com o
   * preenchimento: a lista responde "o que já está cadastrado", e quem responde "como está indo" é
   * a análise da onda 4. Traz ativos e inativos; a tela filtra, como em todo cadastro.
   *
   * As três contagens saem por subconsulta correlacionada em vez de três `left join` com `group by`:
   * o join múltiplo multiplicaria as linhas (um projeto com 3 grupos e 4 vagas viraria 12) e a soma
   * de vagas sairia inflada. É o mesmo motivo pelo qual o Controle Gerencial consulta segmento a
   * segmento em vez de um join só.
   */
  list() {
    return this.db
      .select({
        id: projetosAltoVolume.id,
        codCliente: projetosAltoVolume.codCliente,
        clienteRazaoSocial: clientes.razaoSocial,
        clienteNomeOperacao: clientes.nomeOperacao,
        nome: projetosAltoVolume.nome,
        dataInicio: projetosAltoVolume.dataInicio,
        dataFim: projetosAltoVolume.dataFim,
        ativo: projetosAltoVolume.ativo,
        grupos: sql<number>`(
          select count(*)::int from ${projetoGrupoEntrada}
          where ${projetoGrupoEntrada.projetoId} = ${projetosAltoVolume.id}
        )`,
        cargos: sql<number>`(
          select count(distinct ${projetoVagaCargo.cargoId})::int from ${projetoVagaCargo}
          where ${projetoVagaCargo.projetoId} = ${projetosAltoVolume.id}
        )`,
        vagas: sql<number>`(
          select coalesce(sum(${projetoVagaCargo.quantidade}), 0)::int from ${projetoVagaCargo}
          where ${projetoVagaCargo.projetoId} = ${projetosAltoVolume.id}
        )`,
      })
      .from(projetosAltoVolume)
      .innerJoin(clientes, eq(clientes.codCliente, projetosAltoVolume.codCliente))
      .orderBy(asc(projetosAltoVolume.dataInicio), asc(projetosAltoVolume.nome));
  }

  /** O projeto com os filhos (grupos e vagas), que é o que a tela de cadastro aninhado edita. */
  async obter(id: string) {
    const [projeto] = await this.db
      .select({
        id: projetosAltoVolume.id,
        codCliente: projetosAltoVolume.codCliente,
        clienteRazaoSocial: clientes.razaoSocial,
        clienteNomeOperacao: clientes.nomeOperacao,
        nome: projetosAltoVolume.nome,
        dataInicio: projetosAltoVolume.dataInicio,
        dataFim: projetosAltoVolume.dataFim,
        ativo: projetosAltoVolume.ativo,
      })
      .from(projetosAltoVolume)
      .innerJoin(clientes, eq(clientes.codCliente, projetosAltoVolume.codCliente))
      .where(eq(projetosAltoVolume.id, id));
    if (!projeto) throw new NotFoundException("Projeto não encontrado");

    const grupos = await this.db
      .select({
        id: projetoGrupoEntrada.id,
        rotulo: projetoGrupoEntrada.rotulo,
        dataEntrada: projetoGrupoEntrada.dataEntrada,
      })
      .from(projetoGrupoEntrada)
      .where(eq(projetoGrupoEntrada.projetoId, id))
      .orderBy(asc(projetoGrupoEntrada.dataEntrada));

    const vagas = await this.db
      .select({
        id: projetoVagaCargo.id,
        cargoId: projetoVagaCargo.cargoId,
        cargoNome: cargos.nome,
        grupoId: projetoVagaCargo.grupoId,
        quantidade: projetoVagaCargo.quantidade,
      })
      .from(projetoVagaCargo)
      .innerJoin(cargos, eq(cargos.id, projetoVagaCargo.cargoId))
      .where(eq(projetoVagaCargo.projetoId, id))
      .orderBy(asc(cargos.nome));

    return { ...projeto, grupos, vagas };
  }

  async create(dto: CreateProjetoDto, user: AuthUser) {
    const nome = dto.nome.trim();
    this.validarPeriodo(dto.dataInicio, dto.dataFim);

    const cliente = await this.db.query.clientes.findFirst({
      where: eq(clientes.codCliente, dto.codCliente),
    });
    if (!cliente) throw new NotFoundException("Cliente não encontrado");
    // Cliente inativo é cliente que saiu da operação: deixar abrir projeto nele criaria um projeto
    // que nunca receberá admissão, porque a liberação não oferece cliente inativo.
    if (!cliente.ativo) {
      throw new BadRequestException(
        "Este cliente está inativo. Reative o cliente antes de abrir um projeto de alto volume para ele.",
      );
    }

    const existente = await this.db.query.projetosAltoVolume.findFirst({
      where: and(
        eq(projetosAltoVolume.codCliente, dto.codCliente),
        eq(projetosAltoVolume.nome, nome),
      ),
    });
    // Antecipa o unique do banco com uma mensagem que diz o que fazer, em vez de deixar vazar 500.
    if (existente) {
      throw new ConflictException(
        existente.ativo
          ? "Este cliente já tem um projeto com esse nome."
          : "Este cliente já tem um projeto INATIVO com esse nome. Reative em vez de criar outro.",
      );
    }

    const [row] = await this.db
      .insert(projetosAltoVolume)
      .values({
        codCliente: dto.codCliente,
        nome,
        dataInicio: dto.dataInicio,
        dataFim: dto.dataFim,
        criadoPorId: user.id,
      })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateProjetoDto) {
    const atual = await this.db.query.projetosAltoVolume.findFirst({
      where: eq(projetosAltoVolume.id, id),
    });
    if (!atual) throw new NotFoundException("Projeto não encontrado");

    const nome = dto.nome?.trim();
    // O período é validado com a MISTURA do que veio e do que já existe: editar só a data de fim
    // precisa ser conferida contra o início gravado, senão dá para inverter o período em duas
    // edições que, isoladas, pareciam válidas.
    this.validarPeriodo(dto.dataInicio ?? atual.dataInicio, dto.dataFim ?? atual.dataFim);

    if (nome !== undefined && nome !== atual.nome) {
      const existente = await this.db.query.projetosAltoVolume.findFirst({
        where: and(
          eq(projetosAltoVolume.codCliente, atual.codCliente),
          eq(projetosAltoVolume.nome, nome),
        ),
      });
      if (existente && existente.id !== id) {
        throw new ConflictException("Este cliente já tem um projeto com esse nome.");
      }
    }

    const [row] = await this.db
      .update(projetosAltoVolume)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        ...(dto.dataInicio !== undefined ? { dataInicio: dto.dataInicio } : {}),
        ...(dto.dataFim !== undefined ? { dataFim: dto.dataFim } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(projetosAltoVolume.id, id))
      .returning();
    return row;
  }

  /** INATIVA (exclusão lógica). Preserva grupos, vagas e os vínculos já feitos. */
  async inativar(id: string) {
    const [row] = await this.db
      .update(projetosAltoVolume)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(projetosAltoVolume.id, id))
      .returning({ id: projetosAltoVolume.id });
    if (!row) throw new NotFoundException("Projeto não encontrado");
    return { ok: true, ativo: false };
  }

  async reativar(id: string) {
    const [row] = await this.db
      .update(projetosAltoVolume)
      .set({ ativo: true, atualizadoEm: new Date() })
      .where(eq(projetosAltoVolume.id, id))
      .returning({ id: projetosAltoVolume.id });
    if (!row) throw new NotFoundException("Projeto não encontrado");
    return { ok: true, ativo: true };
  }

  // ── Grupos de entrada ─────────────────────────────────────────────────────

  async criarGrupo(projetoId: string, dto: CreateGrupoDto) {
    await this.exigirProjeto(projetoId);
    const rotulo = dto.rotulo.trim();

    const existente = await this.db.query.projetoGrupoEntrada.findFirst({
      where: and(
        eq(projetoGrupoEntrada.projetoId, projetoId),
        eq(projetoGrupoEntrada.dataEntrada, dto.dataEntrada),
      ),
    });
    if (existente) {
      throw new ConflictException(
        `Este projeto já tem um grupo entrando nesta data ("${existente.rotulo}"). Use o grupo que já existe ou escolha outra data.`,
      );
    }

    const [row] = await this.db
      .insert(projetoGrupoEntrada)
      .values({ projetoId, rotulo, dataEntrada: dto.dataEntrada })
      .returning();
    return row;
  }

  async atualizarGrupo(grupoId: string, dto: UpdateGrupoDto) {
    const atual = await this.db.query.projetoGrupoEntrada.findFirst({
      where: eq(projetoGrupoEntrada.id, grupoId),
    });
    if (!atual) throw new NotFoundException("Grupo não encontrado");

    if (dto.dataEntrada !== undefined && dto.dataEntrada !== atual.dataEntrada) {
      const existente = await this.db.query.projetoGrupoEntrada.findFirst({
        where: and(
          eq(projetoGrupoEntrada.projetoId, atual.projetoId),
          eq(projetoGrupoEntrada.dataEntrada, dto.dataEntrada),
        ),
      });
      if (existente && existente.id !== grupoId) {
        throw new ConflictException("Este projeto já tem um grupo entrando nesta data.");
      }
    }

    const [row] = await this.db
      .update(projetoGrupoEntrada)
      .set({
        ...(dto.rotulo !== undefined ? { rotulo: dto.rotulo.trim() } : {}),
        ...(dto.dataEntrada !== undefined ? { dataEntrada: dto.dataEntrada } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(projetoGrupoEntrada.id, grupoId))
      .returning();
    return row;
  }

  /**
   * REMOVE o grupo (exclusão física). As vagas daquele grupo saem junto, por cascata do banco: são
   * a cota DAQUELA leva, e sem a leva elas não medem nada.
   *
   * A GUARDA existe olhando para a onda 2, não para esta: grupo com admissão já vinculada não é
   * apagado. Como o vínculo tem `on delete set null` no grupo, apagar seria SILENCIOSO, a admissão
   * continuaria no projeto e sumiria do alerta por data de entrada sem ninguém perceber. Barrar aqui
   * é a diferença entre perder o dado e ser avisado de que ele existe.
   */
  async removerGrupo(grupoId: string) {
    const atual = await this.db.query.projetoGrupoEntrada.findFirst({
      where: eq(projetoGrupoEntrada.id, grupoId),
    });
    if (!atual) throw new NotFoundException("Grupo não encontrado");

    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(admissaoProjeto)
      .where(eq(admissaoProjeto.grupoId, grupoId));
    if (n > 0) {
      throw new ConflictException(
        `Este grupo tem ${n} admissão(ões) vinculada(s). Mova essas admissões para outro grupo antes de remover.`,
      );
    }

    await this.db.delete(projetoGrupoEntrada).where(eq(projetoGrupoEntrada.id, grupoId));
    return { ok: true };
  }

  // ── Vagas por cargo ───────────────────────────────────────────────────────

  async criarVaga(projetoId: string, dto: CreateVagaDto) {
    await this.exigirProjeto(projetoId);

    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, dto.cargoId) });
    if (!cargo) throw new NotFoundException("Cargo não encontrado");

    // Grupo de OUTRO projeto seria uma cota pendurada no lugar errado, e o banco não pega isso (a FK
    // só garante que o grupo existe, não que ele é deste projeto).
    if (dto.grupoId) {
      const grupo = await this.db.query.projetoGrupoEntrada.findFirst({
        where: eq(projetoGrupoEntrada.id, dto.grupoId),
      });
      if (!grupo) throw new NotFoundException("Grupo não encontrado");
      if (grupo.projetoId !== projetoId) {
        throw new BadRequestException("O grupo escolhido não pertence a este projeto.");
      }
    }

    const existente = await this.db.query.projetoVagaCargo.findFirst({
      where: and(
        eq(projetoVagaCargo.projetoId, projetoId),
        eq(projetoVagaCargo.cargoId, dto.cargoId),
        dto.grupoId
          ? eq(projetoVagaCargo.grupoId, dto.grupoId)
          : isNull(projetoVagaCargo.grupoId),
      ),
    });
    if (existente) {
      throw new ConflictException(
        dto.grupoId
          ? `Este cargo já tem vagas cadastradas neste grupo (${existente.quantidade}). Edite a quantidade em vez de cadastrar outra linha.`
          : `Este cargo já tem vagas cadastradas no projeto (${existente.quantidade}). Edite a quantidade em vez de cadastrar outra linha.`,
      );
    }

    const [row] = await this.db
      .insert(projetoVagaCargo)
      .values({
        projetoId,
        cargoId: dto.cargoId,
        grupoId: dto.grupoId ?? null,
        quantidade: dto.quantidade,
      })
      .returning();
    return row;
  }

  async atualizarVaga(vagaId: string, dto: UpdateVagaDto) {
    const [row] = await this.db
      .update(projetoVagaCargo)
      .set({ quantidade: dto.quantidade, atualizadoEm: new Date() })
      .where(eq(projetoVagaCargo.id, vagaId))
      .returning();
    if (!row) throw new NotFoundException("Linha de vagas não encontrada");
    return row;
  }

  /**
   * REMOVE a linha de vagas (exclusão física). Nenhuma guarda aqui, e é deliberado: vaga é a META,
   * não o vínculo. Apagar "Caixa 15" não desliga ninguém do projeto, só tira a meta daquele cargo,
   * e o cargo volta a não ser medido. As admissões vinculadas continuam onde estavam.
   */
  async removerVaga(vagaId: string) {
    const [row] = await this.db
      .delete(projetoVagaCargo)
      .where(eq(projetoVagaCargo.id, vagaId))
      .returning({ id: projetoVagaCargo.id });
    if (!row) throw new NotFoundException("Linha de vagas não encontrada");
    return { ok: true };
  }

  // ── Apoio ─────────────────────────────────────────────────────────────────

  /**
   * O período é conferido AQUI, além do `check` que já existe no banco. Os dois não são redundância
   * inútil: o banco recusa com um erro de constraint que o consultor não entende, e esta camada
   * recusa com a frase que diz o que está errado. O banco é a garantia, isto é a explicação.
   */
  private validarPeriodo(dataInicio: string, dataFim: string): void {
    if (dataFim < dataInicio) {
      throw new BadRequestException(
        "O fim do projeto não pode ser antes do início. Confira as duas datas do período.",
      );
    }
  }

  private async exigirProjeto(projetoId: string) {
    const projeto = await this.db.query.projetosAltoVolume.findFirst({
      where: eq(projetosAltoVolume.id, projetoId),
    });
    if (!projeto) throw new NotFoundException("Projeto não encontrado");
    return projeto;
  }
}
