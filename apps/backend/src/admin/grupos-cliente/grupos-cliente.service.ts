import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { admissoes, clientes, grupoClienteMembros, gruposCliente } from "../../db/schema";
import type {
  AtualizarGrupoClienteDto,
  CriarGrupoClienteDto,
  DefinirMembrosDto,
} from "./grupos-cliente.dto";
import { carimboDoGrupo } from "../../admissoes/grupo-da-admissao";
import { efeitosDaGravacao, nomeGrupoNormalizado, resumoDosEfeitos } from "./grupo-cliente";

/**
 * GRUPOS DE CLIENTE (cenário 2). Ver `docs/DESENHO-CENARIO-2-GRUPO.md`.
 *
 * O grupo é EIXO DE LEITURA: serve para filtrar, agrupar e analisar. Não é projeto, não é meta, e
 * nada aqui escreve em admissão fora do carimbo (que é etapa 3).
 */
@Injectable()
export class GruposClienteService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * A LISTA, com os dois números que dizem se o grupo está montado: quantos CNPJs ele tem e quantas
   * admissões já foram carimbadas com ele. O segundo é o que impede alguém de inativar um grupo
   * achando que está vazio.
   */
  async listar() {
    /*
     * OS DOIS NÚMEROS SAEM DE JOIN COM `count(distinct)`, e NÃO de subconsulta correlacionada. A
     * primeira versão usava subconsulta com a tabela interpolada, e o SQL saía SEM QUALIFICAR:
     * `select count(*) from "admissoes" where "grupo_cliente_id" = "id"`. Dentro da subconsulta os
     * dois nomes resolvem contra `admissoes`, então a comparação virava
     * `admissoes.grupo_cliente_id = admissoes.id`, sempre falsa, e o contador dava SEMPRE ZERO.
     *
     * O defeito ficou invisível enquanto nenhuma admissão tinha carimbo (etapa 1: zero em toda a
     * base), e apareceu no minuto seguinte ao backfill da etapa 3: a tela dizia "0 admissões no
     * histórico" para um grupo com 164. O `membros` escapou por sorte, porque
     * `grupo_cliente_membros` não tem coluna `id` e o nome caía na tabela de fora.
     *
     * `count(distinct)` é obrigatório aqui: são DOIS left joins sobre a mesma linha de grupo, então
     * um `count(*)` cru multiplicaria membros por admissões.
     */
    const linhas = await this.db
      .select({
        id: gruposCliente.id,
        nome: gruposCliente.nome,
        descricao: gruposCliente.descricao,
        ativo: gruposCliente.ativo,
        membros: sql<number>`count(distinct ${grupoClienteMembros.codCliente})::int`,
        admissoesCarimbadas: sql<number>`count(distinct ${admissoes.id})::int`,
      })
      .from(gruposCliente)
      .leftJoin(grupoClienteMembros, eq(grupoClienteMembros.grupoId, gruposCliente.id))
      .leftJoin(admissoes, eq(admissoes.grupoClienteId, gruposCliente.id))
      .groupBy(gruposCliente.id, gruposCliente.nome, gruposCliente.descricao, gruposCliente.ativo)
      .orderBy(asc(gruposCliente.nome));
    return linhas;
  }

  /** O grupo com os membros dele, que é o que o livreto abre do lado esquerdo. */
  async obter(id: string) {
    const grupo = await this.db.query.gruposCliente.findFirst({ where: eq(gruposCliente.id, id) });
    if (!grupo) throw new NotFoundException("Grupo não encontrado.");

    const membros = await this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        cnpj: clientes.cnpj,
      })
      .from(grupoClienteMembros)
      .innerJoin(clientes, eq(clientes.codCliente, grupoClienteMembros.codCliente))
      .where(eq(grupoClienteMembros.grupoId, id))
      .orderBy(asc(clientes.razaoSocial), asc(clientes.codCliente));

    return { ...grupo, membros };
  }

  /**
   * O CATÁLOGO DO LADO DIREITO DO LIVRETO: todo cliente ATIVO, já dizendo de qual grupo ele é hoje.
   *
   * O grupo atual vem junto de propósito: é o que permite a tela marcar "SAI de CAGC Frei Caneca"
   * sem uma segunda consulta por linha, e é o que a prévia confere no servidor antes de gravar.
   */
  async catalogoDeClientes() {
    return this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
        cnpj: clientes.cnpj,
        grupoId: grupoClienteMembros.grupoId,
        grupoNome: gruposCliente.nome,
      })
      .from(clientes)
      .leftJoin(grupoClienteMembros, eq(grupoClienteMembros.codCliente, clientes.codCliente))
      .leftJoin(gruposCliente, eq(gruposCliente.id, grupoClienteMembros.grupoId))
      .where(eq(clientes.ativo, true))
      .orderBy(asc(clientes.razaoSocial), asc(clientes.codCliente));
  }

  /** O grupo de UM cliente, para a ficha mostrar em leitura. */
  async grupoDoCliente(codCliente: string) {
    const [linha] = await this.db
      .select({
        id: gruposCliente.id,
        nome: gruposCliente.nome,
        ativo: gruposCliente.ativo,
      })
      .from(grupoClienteMembros)
      .innerJoin(gruposCliente, eq(gruposCliente.id, grupoClienteMembros.grupoId))
      .where(eq(grupoClienteMembros.codCliente, codCliente));
    return linha ?? null;
  }

  async criar(dto: CriarGrupoClienteDto) {
    const nome = dto.nome.trim().replace(/\s+/g, " ");
    await this.exigirNomeLivre(nome, null);
    const [row] = await this.db
      .insert(gruposCliente)
      .values({ nome, descricao: dto.descricao?.trim() || null })
      .returning();
    return row;
  }

  /**
   * RENOMEAR VALE PARA O HISTÓRICO (decisão do diretor), e é por isso que não há nada a fazer aqui
   * além de trocar o nome: o carimbo da admissão é o ID, então corrigir a grafia corrige todas as
   * telas de uma vez, para frente e para trás. Para dizer OUTRA coisa, o caminho é criar outro grupo.
   */
  async atualizar(id: string, dto: AtualizarGrupoClienteDto) {
    const atual = await this.db.query.gruposCliente.findFirst({ where: eq(gruposCliente.id, id) });
    if (!atual) throw new NotFoundException("Grupo não encontrado.");

    const nome = dto.nome === undefined ? undefined : dto.nome.trim().replace(/\s+/g, " ");
    if (nome !== undefined) await this.exigirNomeLivre(nome, id);

    const [row] = await this.db
      .update(gruposCliente)
      .set({
        ...(nome !== undefined ? { nome } : {}),
        ...(dto.descricao !== undefined ? { descricao: dto.descricao.trim() || null } : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(gruposCliente.id, id))
      .returning();
    return row;
  }

  /**
   * A PRÉVIA: o que vai acontecer com cada cliente, ANTES de gravar.
   *
   * Roda no servidor, e não só na tela, porque o grupo atual de cada CNPJ pode ter mudado enquanto o
   * livreto estava aberto. A prévia é a verdade do momento da gravação, não a do momento em que a
   * tela abriu.
   */
  async previaMembros(grupoId: string, dto: DefinirMembrosDto) {
    const grupo = await this.db.query.gruposCliente.findFirst({
      where: eq(gruposCliente.id, grupoId),
    });
    if (!grupo) throw new NotFoundException("Grupo não encontrado.");

    const codClientes = [...new Set(dto.codClientes)];
    await this.exigirClientesExistentes(codClientes);

    const membrosAtuais = await this.db
      .select({
        codCliente: grupoClienteMembros.codCliente,
        grupoId: grupoClienteMembros.grupoId,
        grupoNome: gruposCliente.nome,
      })
      .from(grupoClienteMembros)
      .innerJoin(gruposCliente, eq(gruposCliente.id, grupoClienteMembros.grupoId));

    const efeitos = efeitosDaGravacao(grupoId, codClientes, membrosAtuais);
    const rotulos = await this.rotulosDe(efeitos.map((e) => e.codCliente));
    /*
     * QUANTAS ADMISSÕES CADA LINHA MOVE. Salvar o grupo carimba as admissões dos CNPJs afetados, e
     * quem confirma precisa ver o tamanho disso ANTES: "entra 1 CNPJ" e "entram 164 admissões" são
     * frases muito diferentes para o mesmo clique.
     */
    const porCliente = await this.admissoesPorCliente(efeitos.map((e) => e.codCliente));
    const soma = (tipo: string) =>
      efeitos.filter((e) => e.efeito === tipo).reduce((a, e) => a + (porCliente.get(e.codCliente) ?? 0), 0);

    return {
      grupo: { id: grupo.id, nome: grupo.nome },
      resumo: {
        ...resumoDosEfeitos(efeitos),
        // ENTRA e TROCA carimbam; SAI descarimba. JA_ESTA não aparece porque não muda nada para
        // quem confirma, embora a gravação convirja o carimbo dele também (ver `definirMembros`).
        admissoesACarimbar: soma("ENTRA") + soma("TROCA"),
        admissoesADescarimbar: soma("SAI"),
      },
      efeitos: efeitos.map((e) => ({
        ...e,
        ...rotulos.get(e.codCliente),
        admissoes: porCliente.get(e.codCliente) ?? 0,
      })),
    };
  }

  /**
   * GRAVA a lista completa de membros do grupo.
   *
   * UPSERT NA CHAVE `cod_cliente`: é o banco que garante "um grupo só por cliente", então trocar de
   * grupo é uma linha atualizada e nunca duas linhas convivendo. Numa transação, porque a saída de
   * quem foi desmarcado e a entrada dos novos são a MESMA decisão do consultor.
   *
   * E CARIMBA AS ADMISSÕES DO CNPJ, no mesmo instante, E TROCA O APELIDO DO CLIENTE PELO NOME DO
   * GRUPO (decisões do diretor, e elas mudaram a regra anterior deste método, que não encostava em
   * admissão nem em cliente).
   *
   * POR QUE MUDOU: o cadastro está sendo MONTADO agora, e as admissões nunca tiveram grupo. Sem o
   * carimbo ao vincular, criar um grupo e ticar os CNPJs não aparecia em lugar nenhum: nem no
   * Controle Gerencial, nem no Gerenciador, porque as duas telas leem o carimbo. O backfill só
   * alcançou os grupos que existiam no dia em que rodou. E o caso segue acontecendo: cliente novo
   * sem grupo, admissão conclui, e o grupo é criado depois.
   *
   * O "GRUPO DA ÉPOCA" CONTINUA VALENDO COMO PRINCÍPIO. O que ele descreve é o que acontece SOZINHO:
   * nenhuma rotina automática reescreve carimbo. Trocar um CNPJ de grupo de propósito é ação humana,
   * consciente, com prévia dizendo quantas admissões se movem, e é disciplina de quem administra o
   * cadastro, não trava do sistema.
   *
   * A CONVERGÊNCIA É POR CNPJ, e usa a MESMA função que o wizard, a liberação, a troca de cliente e
   * o Pandapé usam (`carimboDoGrupo`): para cada CNPJ tocado, o carimbo das admissões dele passa a
   * ser o que aquela função responde depois da gravação. Isso resolve os quatro casos de uma vez
   * (entra, troca, sai e o que já estava mas nunca foi carimbado) sem uma segunda régua para
   * divergir da primeira.
   */
  async definirMembros(grupoId: string, dto: DefinirMembrosDto) {
    const previa = await this.previaMembros(grupoId, dto);
    const codClientes = [...new Set(dto.codClientes)];

    await this.db.transaction(async (tx) => {
      // Primeiro tira quem saiu deste grupo: são só os que estavam nele e não vieram na lista.
      const saindo = previa.efeitos.filter((e) => e.efeito === "SAI").map((e) => e.codCliente);
      if (saindo.length > 0) {
        await tx
          .delete(grupoClienteMembros)
          .where(
            and(
              eq(grupoClienteMembros.grupoId, grupoId),
              inArray(grupoClienteMembros.codCliente, saindo),
            ),
          );
      }
      if (codClientes.length > 0) {
        await tx
          .insert(grupoClienteMembros)
          .values(codClientes.map((codCliente) => ({ codCliente, grupoId })))
          .onConflictDoUpdate({
            target: grupoClienteMembros.codCliente,
            set: { grupoId },
          });
      }

      /*
       * O CARIMBO, DEPOIS DA ASSOCIAÇÃO E DENTRO DA MESMA TRANSAÇÃO. A ordem importa: `carimboDoGrupo`
       * lê `grupo_cliente_membros`, então ela precisa enxergar o que acabou de ser escrito, e por isso
       * recebe o `tx` e não o `db`. Se a transação falhar, vínculo e carimbo voltam juntos.
       *
       * TOCA SÓ O QUE MUDA (`is distinct from`), então salvar o mesmo grupo duas vezes não reescreve
       * 164 linhas de novo, e o `atualizado_em` das admissões não é movido à toa.
       */
      const tocados = [...new Set([...codClientes, ...saindo])];
      for (const cod of tocados) {
        const grupoDoCnpj = await carimboDoGrupo(tx, cod);
        await tx
          .update(admissoes)
          .set({ grupoClienteId: grupoDoCnpj })
          .where(
            and(
              eq(admissoes.codCliente, cod),
              sql`${admissoes.grupoClienteId} is distinct from ${grupoDoCnpj}`,
            ),
          );
      }

      /*
       * O APELIDO DO CLIENTE PASSA A SER O NOME DO GRUPO (decisão do diretor).
       *
       * POR QUÊ: o `nome_operacao` é texto livre, e cada pessoa escreveu do seu jeito. Foram NOVE
       * grafias para o mesmo CAGC, e é isso que fazia cada leitura por texto dar um número diferente.
       * Vinculado ao grupo, o apelido deixa de ser opinião e passa a ser o nome do grupo, igual em
       * todas as telas que o mostram.
       *
       * SÓ QUEM ESTÁ NO GRUPO. Quem SAI mantém o apelido que estava, e o diretor ajusta na mão no
       * editar do cliente: o nome original não é preservado em lugar nenhum, e isso é decisão
       * consciente dele. Restaurar exigiria guardar um "apelido de antes" que ninguém mais leria.
       */
      if (codClientes.length > 0) {
        await tx
          .update(clientes)
          .set({ nomeOperacao: previa.grupo.nome })
          .where(
            and(
              inArray(clientes.codCliente, codClientes),
              sql`${clientes.nomeOperacao} is distinct from ${previa.grupo.nome}`,
            ),
          );
      }
    });

    // As contagens da prévia são o que a tela devolve como aviso: são as MESMAS que acabaram de
    // acontecer, porque a gravação seguiu exatamente o que ela previu.
    return { ...previa.resumo, total: codClientes.length };
  }

  /** Nome duplicado é recusado com a frase do problema, não com erro de constraint. */
  private async exigirNomeLivre(nome: string, exceto: string | null) {
    const normalizado = nomeGrupoNormalizado(nome);
    const existentes = await this.db
      .select({ id: gruposCliente.id, nome: gruposCliente.nome })
      .from(gruposCliente);
    const colide = existentes.find(
      (g) => nomeGrupoNormalizado(g.nome) === normalizado && g.id !== exceto,
    );
    if (colide) {
      throw new ConflictException(`Já existe um grupo chamado "${colide.nome}".`);
    }
  }

  private async exigirClientesExistentes(codClientes: string[]) {
    if (codClientes.length === 0) return;
    const achados = await this.db
      .select({ codCliente: clientes.codCliente })
      .from(clientes)
      .where(inArray(clientes.codCliente, codClientes));
    if (achados.length !== codClientes.length) {
      const set = new Set(achados.map((c) => c.codCliente));
      const faltando = codClientes.filter((c) => !set.has(c));
      throw new BadRequestException(`Cliente não encontrado: ${faltando.slice(0, 5).join(", ")}.`);
    }
  }

  /**
   * QUANTAS ADMISSÕES CADA CNPJ TEM, em UMA consulta.
   *
   * Alimenta a prévia, que é onde quem administra o cadastro vê o alcance do clique antes de
   * confirmar. Uma consulta por CNPJ viraria N+1 numa tela que lista 226 deles.
   *
   * §A.6: código de cliente e contagem. Nenhum dado pessoal.
   */
  private async admissoesPorCliente(codClientes: string[]): Promise<Map<string, number>> {
    if (codClientes.length === 0) return new Map();
    const linhas = await this.db
      .select({ codCliente: admissoes.codCliente, n: sql<number>`count(*)::int` })
      .from(admissoes)
      .where(inArray(admissoes.codCliente, codClientes))
      .groupBy(admissoes.codCliente);
    return new Map(linhas.map((l) => [l.codCliente as string, Number(l.n)]));
  }

  private async rotulosDe(codClientes: string[]) {
    if (codClientes.length === 0) return new Map<string, { razaoSocial: string; nomeOperacao: string | null }>();
    const linhas = await this.db
      .select({
        codCliente: clientes.codCliente,
        razaoSocial: clientes.razaoSocial,
        nomeOperacao: clientes.nomeOperacao,
      })
      .from(clientes)
      .where(inArray(clientes.codCliente, codClientes));
    return new Map(
      linhas.map((l) => [l.codCliente, { razaoSocial: l.razaoSocial, nomeOperacao: l.nomeOperacao }]),
    );
  }
}
