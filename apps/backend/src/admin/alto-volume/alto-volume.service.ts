import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  admissaoProjeto,
  cargos,
  clienteLojas,
  clientes,
  projetoGrupoEntrada,
  projetoVagaCargo,
  projetosAltoVolume,
} from "../../db/schema";
import type {
  CreateGrupoDto,
  CreateProjetoDto,
  CreateVagaDto,
  RemoverVagasEmLoteDto,
  UpdateGrupoDto,
  UpdateProjetoDto,
  UpdateVagaDto,
} from "./alto-volume.dto";
import {
  conferirDistribuicao,
  metaDoCargo,
  motivoCotasAntes,
  totalDistribuido,
} from "./meta-detalhamento";

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
        // LOJA da cota (meta por loja). Nulo = a linha vale para o cargo no projeto inteiro. O NOME
        // vem junto para a tela não precisar de uma segunda busca só para desenhar a linha.
        lojaId: projetoVagaCargo.lojaId,
        lojaNome: clienteLojas.nome,
        cargoNome: cargos.nome,
        grupoId: projetoVagaCargo.grupoId,
        quantidade: projetoVagaCargo.quantidade,
      })
      .from(projetoVagaCargo)
      .innerJoin(cargos, eq(cargos.id, projetoVagaCargo.cargoId))
      // LEFT: a cota sem loja é o caso normal, e um inner apagaria todas as metas não detalhadas.
      .leftJoin(clienteLojas, eq(clienteLojas.id, projetoVagaCargo.lojaId))
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
    const projeto = await this.exigirProjeto(projetoId);

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

    // A LOJA precisa ser deste cliente, pelo mesmo motivo da admissão: a chave estrangeira garante
    // que ela existe, não que ela seja do cliente do projeto. Cota pendurada na loja de outro cliente
    // inflaria o quadro de um projeto com a unidade de outro, e nada acusaria.
    if (dto.lojaId) {
      const loja = await this.db.query.clienteLojas.findFirst({
        where: eq(clienteLojas.id, dto.lojaId),
      });
      if (!loja) throw new NotFoundException("Loja não encontrada");
      if (loja.codCliente !== projeto.codCliente) {
        throw new BadRequestException("A loja escolhida não pertence ao cliente deste projeto.");
      }
    }

    // TODAS as linhas deste cargo neste projeto: é sobre elas que a invariante do detalhamento único
    // decide, e é delas que sai a meta do cargo.
    const doCargo = await this.db
      .select({
        id: projetoVagaCargo.id,
        lojaId: projetoVagaCargo.lojaId,
        grupoId: projetoVagaCargo.grupoId,
        quantidade: projetoVagaCargo.quantidade,
      })
      .from(projetoVagaCargo)
      .where(
        and(
          eq(projetoVagaCargo.projetoId, projetoId),
          eq(projetoVagaCargo.cargoId, dto.cargoId),
        ),
      );

    const existente = doCargo.find(
      (l) =>
        (l.grupoId ?? null) === (dto.grupoId ?? null) && (l.lojaId ?? null) === (dto.lojaId ?? null),
    );
    if (existente) {
      throw new ConflictException(
        dto.lojaId
          ? `Esta loja já tem vagas deste cargo (${existente.quantidade}). Edite a quantidade em vez de cadastrar outra linha.`
          : dto.grupoId
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
        lojaId: dto.lojaId ?? null,
        quantidade: dto.quantidade,
      })
      .returning();
    return row;
  }

  /**
   * DETALHAR UM CARGO POR LOJA, numa transação. É a ação que a tela chama quando o diretor distribui
   * a meta entre as lojas.
   *
   * SUBSTITUI, não soma (decisão 1 do diretor): a linha geral do cargo é APAGADA na mesma transação
   * em que as cotas entram. É por isso que a meta do cargo, que continua sendo a soma das linhas,
   * passa a valer o total distribuído sem nenhum código especial no cálculo.
   *
   * Lista VAZIA desfaz o detalhamento: apaga as cotas e o cargo volta a não ter meta, pronto para
   * receber a linha única de novo.
   */
  async detalharVagasPorLoja(
    projetoId: string,
    cargoId: string,
    cotas: { lojaId: string; quantidade: number }[],
  ) {
    const projeto = await this.exigirProjeto(projetoId);

    const lojas = await this.db
      .select({ id: clienteLojas.id, codCliente: clienteLojas.codCliente })
      .from(clienteLojas)
      .where(eq(clienteLojas.codCliente, projeto.codCliente));
    const validas = new Set(lojas.map((l) => l.id));
    for (const c of cotas) {
      if (!validas.has(c.lojaId)) {
        throw new BadRequestException("Uma das lojas não pertence ao cliente deste projeto.");
      }
    }
    // Duas cotas para a mesma loja seriam duas linhas somando na mesma unidade, e o unique parcial
    // do banco pegaria, mas com erro que o time não entende.
    if (new Set(cotas.map((c) => c.lojaId)).size !== cotas.length) {
      throw new BadRequestException("A mesma loja aparece duas vezes na distribuição.");
    }

    // A META DO CARGO, que é o total a repartir. Sai das linhas SEM loja, que é o que a regra A
    // define como o número fixo.
    const linhasDoCargo = await this.db
      .select({ lojaId: projetoVagaCargo.lojaId, quantidade: projetoVagaCargo.quantidade })
      .from(projetoVagaCargo)
      .where(
        and(eq(projetoVagaCargo.projetoId, projetoId), eq(projetoVagaCargo.cargoId, cargoId)),
      );
    const meta = metaDoCargo(linhasDoCargo);

    // A TRAVA DOS DOIS LADOS (regra A): a soma tem de fechar EXATAMENTE o total do cargo. Nem menos
    // (sobrou vaga sem loja) nem mais (prometeu mais do que o projeto tem). Loja com zero é válida.
    const problema = conferirDistribuicao(meta, cotas);
    if (problema) throw new BadRequestException(problema);

    return this.db.transaction(async (tx) => {
      // Fora só as COTAS antigas. A linha geral do cargo FICA: na regra A ela é o total fixo, e as
      // lojas repartem dentro dele. Apagá-la (como fazia a regra anterior) deixaria o cargo sem meta.
      await tx
        .delete(projetoVagaCargo)
        .where(
          and(
            eq(projetoVagaCargo.projetoId, projetoId),
            eq(projetoVagaCargo.cargoId, cargoId),
            isNotNull(projetoVagaCargo.lojaId),
          ),
        );
      // LOJA COM ZERO é decisão válida ("aqui não contrata"), mas não vira LINHA: o `check
      // quantidade > 0` do banco a recusaria, e uma cota de zero não acrescenta informação ao
      // quadro. A trava já conferiu a soma com ela incluída, que é onde o zero importa.
      const gravaveis = cotas.filter((c) => c.quantidade > 0);
      if (gravaveis.length === 0) return { cotas: 0, meta, distribuido: totalDistribuido(cotas) };
      await tx.insert(projetoVagaCargo).values(
        gravaveis.map((c) => ({
          projetoId,
          cargoId,
          grupoId: null,
          lojaId: c.lojaId,
          quantidade: c.quantidade,
        })),
      );
      return { cotas: gravaveis.length, meta, distribuido: totalDistribuido(cotas) };
    });
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
  /**
   * REMOVE VÁRIAS linhas de vagas de uma vez (peça 3 do pacote de usabilidade).
   *
   * POR QUE EXISTE: distribuir um cargo por loja cria uma linha POR LOJA, então um cargo em quinze
   * lojas vira dezesseis linhas. Desfazer isso clicando "remover" dezesseis vezes, cada uma com sua
   * confirmação, é o retrabalho que esta rota corta.
   *
   * UMA LINHA RUIM NÃO DERRUBA O LOTE, a mesma régua do lote de vínculos: ela volta em `falhas` com
   * o motivo em texto, e as outras saem. O contrário faria uma linha já apagada por outra aba
   * cancelar a remoção das quinze restantes.
   *
   * A TRAVA DA META (regra A, §A.27) É RESPEITADA AQUI, e ela é de ORDEM, não de seleção. Apagar a
   * linha GERAL de um cargo que ainda tem cotas de loja deixaria as cotas órfãs: o cargo ficaria sem
   * meta e as lojas continuariam prometendo vagas de um cargo que não está mais no projeto, e o
   * painel da diretoria leria isso como plano. Então a linha geral SÓ SAI depois que as cotas
   * saírem, em outra operação. Selecionar as duas juntas NÃO burla a ordem: as cotas saem, a linha
   * do cargo fica, e o clique seguinte a remove. O lote NUNCA apaga o que não foi selecionado.
   */
  async removerVagasEmLote(projetoId: string, dto: RemoverVagasEmLoteDto) {
    await this.exigirProjeto(projetoId);

    // Ids repetidos viram um só: o mesmo clique duplo que o lote de vínculos já previa.
    const ids = [...new Set(dto.vagaIds)];

    // TODAS as linhas do projeto, e não só as selecionadas: é preciso enxergar as cotas que FICARAM
    // de fora da seleção para decidir se a linha geral pode sair.
    const doProjeto = await this.db
      .select({
        id: projetoVagaCargo.id,
        cargoId: projetoVagaCargo.cargoId,
        lojaId: projetoVagaCargo.lojaId,
        grupoId: projetoVagaCargo.grupoId,
      })
      .from(projetoVagaCargo)
      .where(eq(projetoVagaCargo.projetoId, projetoId));
    const porId = new Map(doProjeto.map((v) => [v.id, v]));

    const aprovadas: string[] = [];
    const falhas: { vagaId: string; motivo: string }[] = [];

    for (const vagaId of ids) {
      const linha = porId.get(vagaId);
      if (!linha) {
        falhas.push({ vagaId, motivo: "Linha de vagas não encontrada neste projeto." });
        continue;
      }
      if (!linha.lojaId) {
        // A ORDEM É OBRIGATÓRIA (decisão do diretor): cota primeiro, linha do cargo depois. NÃO
        // basta selecionar as duas juntas. Contar as cotas que EXISTEM, e não as que ficariam de
        // fora da seleção, é o que fecha a porta do "remover tudo junto": num lote único não há como
        // garantir a ordem entre as linhas, e a tela ficaria ensinando um caminho que o banco não
        // faz. Removidas as cotas, a linha do cargo sai no clique seguinte.
        const cotas = doProjeto.filter((v) => v.cargoId === linha.cargoId && v.lojaId).length;
        if (cotas > 0) {
          falhas.push({ vagaId, motivo: motivoCotasAntes(cotas) });
          continue;
        }
      }
      aprovadas.push(vagaId);
    }

    if (aprovadas.length > 0) {
      await this.db.delete(projetoVagaCargo).where(inArray(projetoVagaCargo.id, aprovadas));
    }

    return { removidas: aprovadas.length, falhas };
  }

  /**
   * REMOVE UMA linha de vagas.
   *
   * A MESMA TRAVA DO LOTE VALE AQUI, e a ausência dela era um buraco: a remoção uma a uma apagava a
   * linha geral de um cargo distribuído por loja sem perguntar nada, deixando as cotas órfãs. Sem
   * esta guarda, o caminho individual seria a porta aberta ao lado da porta fechada.
   */
  async removerVaga(vagaId: string) {
    const linha = await this.db.query.projetoVagaCargo.findFirst({
      where: eq(projetoVagaCargo.id, vagaId),
    });
    if (!linha) throw new NotFoundException("Linha de vagas não encontrada");

    if (!linha.lojaId) {
      const cotas = await this.db
        .select({ id: projetoVagaCargo.id })
        .from(projetoVagaCargo)
        .where(
          and(
            eq(projetoVagaCargo.projetoId, linha.projetoId),
            eq(projetoVagaCargo.cargoId, linha.cargoId),
            isNotNull(projetoVagaCargo.lojaId),
          ),
        );
      if (cotas.length > 0) throw new BadRequestException(motivoCotasAntes(cotas.length));
    }

    await this.db.delete(projetoVagaCargo).where(eq(projetoVagaCargo.id, vagaId));
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
