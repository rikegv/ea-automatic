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
import {
  admissoes,
  cargos,
  clientes,
  grupoClienteCargoMeta,
  grupoClienteMembros,
  gruposCliente,
} from "../../db/schema";
import type {
  AtualizarGrupoClienteDto,
  CriarGrupoClienteDto,
  DefinirMembrosDto,
  DefinirMetaCargoDto,
} from "./grupos-cliente.dto";
import { carimboDoGrupo } from "../../admissoes/grupo-da-admissao";
import {
  admissaoConcluidaSql,
  admissaoEmAndamentoExclusivoSql,
} from "../../db/expressoes-admissao";
import { efeitosDaGravacao, nomeGrupoNormalizado, resumoDosEfeitos } from "./grupo-cliente";

/**
 * GRUPOS DE CLIENTE (cenário 2). Ver `docs/DESENHO-CENARIO-2-GRUPO.md`.
 *
 * O grupo é EIXO DE LEITURA: serve para filtrar, agrupar e analisar. E AGORA TAMBÉM CARREGA META
 * (decisão do diretor, Alto Volume por grupo): a meta é o alvo de admissões do grupo na esteira, e o
 * painel por grupo responde `faltam = meta - naEsteira`. A meta pode ser cadastrada POR CARGO (ajuste
 * 5, tabela `grupo_cliente_cargo_meta`), e aí o total do grupo é a SOMA das metas por cargo. Fora o
 * carimbo (etapa 3) e a meta (do grupo e por cargo, nunca da admissão), nada aqui escreve em admissão.
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
        meta: gruposCliente.meta,
        ativo: gruposCliente.ativo,
        membros: sql<number>`count(distinct ${grupoClienteMembros.codCliente})::int`,
        admissoesCarimbadas: sql<number>`count(distinct ${admissoes.id})::int`,
      })
      .from(gruposCliente)
      .leftJoin(grupoClienteMembros, eq(grupoClienteMembros.grupoId, gruposCliente.id))
      .leftJoin(admissoes, eq(admissoes.grupoClienteId, gruposCliente.id))
      .groupBy(
        gruposCliente.id,
        gruposCliente.nome,
        gruposCliente.descricao,
        gruposCliente.meta,
        gruposCliente.ativo,
      )
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

  /**
   * O PAINEL DO GRUPO: a meta contra o que o grupo tem na esteira (Alto Volume por grupo). É a
   * pergunta "das N admissões que este grupo deve ter, quantas já estão na esteira e quantas faltam",
   * no total e, quando há meta por cargo (ajuste 5), também por cargo.
   *
   * É LEITURA PARALELA, zero escrita (§A.26), e as contagens saem das MESMAS expressões
   * compartilhadas do Painel e do Alto Volume (`admissaoConcluidaSql`,
   * `admissaoEmAndamentoExclusivoSql`), importadas e não copiadas, pelo motivo de
   * `db/expressoes-admissao`: um balde só, contado de um jeito só, em toda superfície. O que muda é
   * o UNIVERSO, que aqui é `grupo_cliente_id = :id`, agregado num total do grupo em vez de por
   * cargo ou por loja.
   *
   * A RÉGUA É A MESMA DO DASH DE PROJETO (`alto-volume-analise.service`, `statusPorCargoVinculados`),
   * porque o diretor pediu reusar a MESMA lógica. Em concreto:
   * - `naEsteira` exclui os TRÊS (DECLINOU, RESCISAO, BANCO_AGUARDAR), igual ao `vinculadas` do
   *   projeto: banco não é trabalho ativo de preenchimento, é admissão parada esperando data. É o
   *   denominador do `faltam`.
   * - `ativos` é IGUAL a `naEsteira` por construção (os dois já excluem banco), e o campo segue na
   *   resposta para a tela ler "X ativos, Y em banco" com `emBanco` ao lado.
   * - `emBanco` é recorte SEPARADO (BANCO_AGUARDAR).
   * - `concluidas` carrega o MESMO filtro de farol do projeto (correção de 13/08/2026): sem ele,
   *   "concluídas" olha as FRENTES e "na esteira" olha o FAROL, e uma declinada com o Cadastro fechado
   *   faria "Concluídas > Na Esteira", que é impossível por definição.
   * - `declinios` é recorte SEPARADO, informação ao lado: não entra em `naEsteira` nem no `faltam`.
   *
   * `faltam = meta - naEsteira`, a MESMA forma do projeto (`vagas - vinculadas`), e é NULL quando o
   * grupo não tem meta (os legados, ex. CAGC): sem alvo não há o que faltar, e zero mentiria dizendo
   * "não falta ninguém".
   *
   * §A.6: a resposta é contagem e o nome/meta do grupo. Nenhum CPF, nenhum nome de candidato,
   * nenhum CNPJ individual. Esta tela responde QUANTOS, não QUEM.
   */
  async analise(id: string) {
    const grupo = await this.db.query.gruposCliente.findFirst({ where: eq(gruposCliente.id, id) });
    if (!grupo) throw new NotFoundException("Grupo não encontrado.");

    const [c] = await this.db
      .select({
        // OS TRÊS FORA (DECLINOU, RESCISAO, BANCO_AGUARDAR): o mesmo filtro do `vinculadas` do projeto.
        naEsteira: sql<number>`count(*) filter (
          where ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        emBanco: sql<number>`count(*) filter (where ${admissoes.farolGlobal} = 'BANCO_AGUARDAR')::int`,
        // O MESMO PAR DO PROJETO: a expressão compartilhada mais o filtro de farol, sem o qual
        // "concluídas" poderia passar de "na esteira" na mesma linha.
        concluidas: sql<number>`count(*) filter (
          where ${admissaoConcluidaSql}
            and ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        emAndamento: sql<number>`count(*) filter (where ${admissaoEmAndamentoExclusivoSql})::int`,
        pausadas: sql<number>`count(*) filter (where ${admissoes.pausadaEm} is not null)::int`,
        declinios: sql<number>`count(*) filter (
          where ${admissoes.farolGlobal} in ('DECLINOU', 'RESCISAO')
        )::int`,
      })
      .from(admissoes)
      .where(eq(admissoes.grupoClienteId, id));

    const naEsteira = Number(c?.naEsteira ?? 0);

    /*
     * A MESMA ANÁLISE, QUEBRADA POR CARGO. Mesmo universo (`grupo_cliente_id = :id`), mesma régua de
     * farol do `totais` (as MESMAS expressões compartilhadas e os MESMOS recortes literais, não uma
     * segunda régua para divergir), agora agregada por `cargo_id`. Left join em `cargos` só para o
     * nome; `cargoId` null vira "Sem Cargo".
     *
     * §A.6: contagem + id/nome do cargo. Nenhum CPF, candidato ou CNPJ.
     */
    const linhasPorCargo = await this.db
      .select({
        cargoId: admissoes.cargoId,
        cargoNome: cargos.nome,
        naEsteira: sql<number>`count(*) filter (
          where ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        concluidas: sql<number>`count(*) filter (
          where ${admissaoConcluidaSql}
            and ${admissoes.farolGlobal} not in ('DECLINOU', 'RESCISAO', 'BANCO_AGUARDAR')
        )::int`,
        emAndamento: sql<number>`count(*) filter (where ${admissaoEmAndamentoExclusivoSql})::int`,
        pausadas: sql<number>`count(*) filter (where ${admissoes.pausadaEm} is not null)::int`,
        declinios: sql<number>`count(*) filter (
          where ${admissoes.farolGlobal} in ('DECLINOU', 'RESCISAO')
        )::int`,
      })
      .from(admissoes)
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(eq(admissoes.grupoClienteId, id))
      .groupBy(admissoes.cargoId, cargos.nome);

    /*
     * A META POR CARGO (ajuste 5): quantas vagas o grupo quer em cada cargo. O cargo com meta mas sem
     * ninguém na esteira TEM de aparecer na tabela (vagas = meta, naEsteira = 0, faltam = meta), então
     * não basta somar à agregação de admissões: é uma UNIÃO dos cargos das duas fontes. Só cargo real
     * (`cargo_id`), nunca o "Sem Cargo", recebe meta.
     */
    const metasCargo = await this.db
      .select({ cargoId: grupoClienteCargoMeta.cargoId, cargoNome: cargos.nome, meta: grupoClienteCargoMeta.meta })
      .from(grupoClienteCargoMeta)
      .innerJoin(cargos, eq(cargos.id, grupoClienteCargoMeta.cargoId))
      .where(eq(grupoClienteCargoMeta.grupoId, id));

    const metaPorCargo = new Map<string, { cargoNome: string; meta: number }>();
    for (const m of metasCargo) {
      metaPorCargo.set(m.cargoId, { cargoNome: m.cargoNome, meta: Number(m.meta) });
    }

    // União dos cargos: os que têm admissão e os que têm meta. Chave "sem-cargo" para o `cargoId` null,
    // que nunca tem meta.
    type LinhaCargo = {
      cargoId: string | null;
      cargoNome: string;
      vagas: number | null;
      naEsteira: number;
      concluidas: number;
      emAndamento: number;
      pausadas: number;
      declinios: number;
      faltam: number | null;
    };
    const porCargoMapa = new Map<string, LinhaCargo>();
    for (const l of linhasPorCargo) {
      const chave = l.cargoId ?? "__sem-cargo";
      porCargoMapa.set(chave, {
        cargoId: l.cargoId ?? null,
        cargoNome: l.cargoNome ?? "Sem Cargo",
        vagas: null,
        naEsteira: Number(l.naEsteira ?? 0),
        concluidas: Number(l.concluidas ?? 0),
        emAndamento: Number(l.emAndamento ?? 0),
        pausadas: Number(l.pausadas ?? 0),
        declinios: Number(l.declinios ?? 0),
        faltam: null,
      });
    }
    // Aplica a meta por cargo, criando a linha se o cargo não tem admissão ainda (vagas sem gente).
    for (const [cargoId, { cargoNome, meta: metaDoCargo }] of metaPorCargo) {
      const linha = porCargoMapa.get(cargoId) ?? {
        cargoId,
        cargoNome,
        vagas: null,
        naEsteira: 0,
        concluidas: 0,
        emAndamento: 0,
        pausadas: 0,
        declinios: 0,
        faltam: null,
      };
      linha.vagas = metaDoCargo;
      linha.faltam = metaDoCargo - linha.naEsteira;
      porCargoMapa.set(cargoId, linha);
    }

    const porCargo = [...porCargoMapa.values()].sort((a, b) => {
      // "Sem Cargo" (cargoId null) por último; o resto alfabético.
      if (a.cargoId === null) return 1;
      if (b.cargoId === null) return -1;
      return a.cargoNome.localeCompare(b.cargoNome, "pt-BR");
    });

    /*
     * O TOTAL DO GRUPO passa a ser a SOMA das metas por cargo quando elas existem (decisão do
     * diretor, ajuste 5); sem nenhuma meta por cargo, cai no total único do grupo
     * (`grupos_cliente.meta`), que é o legado. Nenhuma meta em lugar nenhum => null, e o `faltam`
     * também, nunca zero.
     */
    const somaMetasCargo = metasCargo.reduce((a, m) => a + Number(m.meta), 0);
    const meta = metaPorCargo.size > 0 ? somaMetasCargo : (grupo.meta ?? null);

    return {
      grupo: { id: grupo.id, nome: grupo.nome, meta },
      totais: {
        meta,
        naEsteira,
        // IGUAL a naEsteira por construção (os dois excluem banco); mantido na resposta para a tela.
        ativos: naEsteira,
        emBanco: Number(c?.emBanco ?? 0),
        concluidas: Number(c?.concluidas ?? 0),
        emAndamento: Number(c?.emAndamento ?? 0),
        pausadas: Number(c?.pausadas ?? 0),
        declinios: Number(c?.declinios ?? 0),
        // Sem meta, sem faltam: NULL, não zero, pelo motivo acima.
        faltam: meta === null ? null : meta - naEsteira,
      },
      porCargo,
    };
  }

  /**
   * AS METAS POR CARGO DO GRUPO (ajuste 5): a lista que o livreto edita, só os cargos que já têm
   * meta definida neste grupo. O catálogo completo de cargos a tela busca à parte (`admin/cargos`);
   * aqui vem só o que foi cadastrado, para a tela saber quais já têm valor. §A.6: id/nome de cargo e
   * número, sem PII.
   */
  async listarMetasCargo(grupoId: string) {
    const grupo = await this.db.query.gruposCliente.findFirst({ where: eq(gruposCliente.id, grupoId) });
    if (!grupo) throw new NotFoundException("Grupo não encontrado.");
    return this.db
      .select({
        cargoId: grupoClienteCargoMeta.cargoId,
        cargoNome: cargos.nome,
        meta: grupoClienteCargoMeta.meta,
      })
      .from(grupoClienteCargoMeta)
      .innerJoin(cargos, eq(cargos.id, grupoClienteCargoMeta.cargoId))
      .where(eq(grupoClienteCargoMeta.grupoId, grupoId))
      .orderBy(asc(cargos.nome));
  }

  /**
   * DEFINE (upsert) ou REMOVE a meta de um cargo no grupo. `meta` nulo (ou ausente) apaga a linha,
   * que é o "sem meta" daquele cargo; `meta >= 1` grava. A trava do inteiro >= 1 fica no DTO, a mesma
   * régua do total do grupo. Upsert na chave `(grupo_id, cargo_id)`, garantida pelo índice único.
   */
  async definirMetaCargo(grupoId: string, cargoId: string, dto: DefinirMetaCargoDto) {
    const grupo = await this.db.query.gruposCliente.findFirst({ where: eq(gruposCliente.id, grupoId) });
    if (!grupo) throw new NotFoundException("Grupo não encontrado.");
    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, cargoId) });
    if (!cargo) throw new NotFoundException("Cargo não encontrado.");

    if (dto.meta == null) {
      await this.db
        .delete(grupoClienteCargoMeta)
        .where(
          and(
            eq(grupoClienteCargoMeta.grupoId, grupoId),
            eq(grupoClienteCargoMeta.cargoId, cargoId),
          ),
        );
    } else {
      await this.db
        .insert(grupoClienteCargoMeta)
        .values({ grupoId, cargoId, meta: dto.meta })
        .onConflictDoUpdate({
          target: [grupoClienteCargoMeta.grupoId, grupoClienteCargoMeta.cargoId],
          set: { meta: dto.meta, atualizadoEm: new Date() },
        });
    }

    /*
     * O TOTAL ÚNICO DO GRUPO ACOMPANHA A SOMA (decisão do diretor: o total do grupo é a soma das
     * metas por cargo). Assim o livreto, a lista e o Gerenciador leem o mesmo total sem precisar
     * recalcular. Quando a ÚLTIMA meta por cargo é removida, o total único fica no último valor
     * (o legado), em vez de cair para zero, que a régua "meta >= 1" não aceitaria.
     */
    const totalPorCargo = await this.somaMetasCargo(grupoId);
    if (totalPorCargo !== null) {
      await this.db
        .update(gruposCliente)
        .set({ meta: totalPorCargo, atualizadoEm: new Date() })
        .where(eq(gruposCliente.id, grupoId));
    }
    return { grupoId, cargoId, meta: dto.meta ?? null, totalDoGrupo: totalPorCargo ?? grupo.meta ?? null };
  }

  /** A SOMA das metas por cargo de um grupo, ou null quando ele não tem nenhuma meta por cargo. */
  private async somaMetasCargo(grupoId: string): Promise<number | null> {
    const [linha] = await this.db
      .select({
        soma: sql<number | null>`sum(${grupoClienteCargoMeta.meta})::int`,
        qtd: sql<number>`count(*)::int`,
      })
      .from(grupoClienteCargoMeta)
      .where(eq(grupoClienteCargoMeta.grupoId, grupoId));
    return Number(linha?.qtd ?? 0) > 0 ? Number(linha?.soma ?? 0) : null;
  }

  async criar(dto: CriarGrupoClienteDto) {
    const nome = dto.nome.trim().replace(/\s+/g, " ");
    await this.exigirNomeLivre(nome, null);
    const [row] = await this.db
      .insert(gruposCliente)
      .values({ nome, descricao: dto.descricao?.trim() || null, meta: dto.meta })
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
        // META: só é escrita quando veio no patch. O `atualizadoEm` abaixo é o carimbo de edição
        // auditável que o cadastro de admin já usa (não há tabela de log de catálogo neste domínio;
        // o padrão vizinho carimba só a data, e é esse o padrão).
        ...(dto.meta !== undefined ? { meta: dto.meta } : {}),
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
