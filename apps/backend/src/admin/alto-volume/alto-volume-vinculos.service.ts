import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, gte, inArray, isNull, lte, notInArray } from "drizzle-orm";
import type { AuthUser } from "../../auth/auth.types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  admissaoProjeto,
  admissoes,
  candidatos,
  cargos,
  clientes,
  projetoGrupoEntrada,
  projetosAltoVolume,
  usuarios,
} from "../../db/schema";
import type {
  AtualizarVinculoDto,
  VincularAdmissaoDto,
  VincularEmLoteDto,
} from "./alto-volume.dto";

/**
 * ALTO VOLUME (onda 3): VÍNCULO POR CORREÇÃO, feito de dentro da tela do projeto.
 *
 * O QUE ESTA ONDA CONSERTA. Na onda 2 o vínculo nasce no flag da Liberação, e o flag depende de o
 * consultor lembrar dele na hora. Quem esquece, ou marca o projeto errado, hoje não tem conserto: a
 * admissão existe, está certa na esteira, e simplesmente não conta em projeto nenhum. Esta onda é o
 * conserto POSTERIOR, e ele acontece aqui e não na Liberação de propósito, porque quem descobre o
 * erro é quem olha o preenchimento do projeto, não quem está liberando o próximo candidato.
 *
 * §A.26, e é o motivo de este serviço ser um arquivo separado: a onda 3 escreve em UMA tabela só,
 * `admissao_projeto`. Ela NÃO toca `aplicarLiberacao`, não toca o `AltoVolumeService` da onda 1, não
 * altera admissão, frente, documento nem farol. Desvincular alguém do projeto não mexe em um único
 * campo da admissão: ela continua na esteira exatamente como estava, só deixa de contar no recorte
 * do projeto. É a mesma promessa da onda 1 ("nenhuma coluna nova em `admissoes`"), agora na escrita.
 *
 * A LISTA DE "ADMISSÕES SEM PROJETO" é o mesmo join do preenchimento, NEGADO: quem é do cliente do
 * projeto, entra dentro do período dele e NÃO tem linha de vínculo. Ela é consulta paralela
 * (`left join` + `is null`), não encosta na Esteira nem no Gerenciador, e por isso pode ser lida a
 * qualquer momento sem risco para a operação.
 *
 * NOME DA TELA x NOME DO CÓDIGO: a tela diz "Admissões Sem Projeto" e "adicionar adm ao projeto"
 * (linguagem da operação, decisão do diretor); o método continua `listarOrfaos` porque é o nome do
 * join que ele executa. Rota e identificador NÃO foram renomeados de propósito: são contrato entre
 * camadas, e trocá-los mexeria no menu, no guard e nos testes sem mudar nada para quem usa.
 *
 * §A.6: as listas devolvem nome do candidato e cargo, que é o mínimo para o time reconhecer a
 * pessoa que vai vincular. CPF NÃO SAI DAQUI, nem em máscara: a tela é de conferência de projeto,
 * não de identificação de pessoa, e o id da admissão já é chave suficiente para a ação.
 */
@Injectable()
export class AltoVolumeVinculosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * FAROIS QUE NÃO ENTRAM na lista de "Admissões Sem Projeto".
   *
   * `DECLINOU`/`RESCISAO` saem por §A.16, que é literal ("declínio nunca entra em fila operacional
   * nem conta como pendência em NENHUM card/KPI, em nenhuma superfície") e essa lista É uma
   * fila de trabalho. `AGUARDANDO_LIBERACAO`/`LIBERACAO_RECUSADA` são pré-admissão: a de espera nem
   * cliente tem ainda, e a recusada é terminal como o declínio.
   *
   * O recorte vale para a SUGESTÃO (quem a tela oferece para adicionar), não para o vínculo já feito:
   * quem foi vinculado na liberação e declinou depois continua aparecendo entre os vinculados, com o
   * farol à vista, e pode ser desvinculado normalmente.
   */
  private static readonly FORA_DA_FILA = [
    "DECLINOU",
    "RESCISAO",
    "AGUARDANDO_LIBERACAO",
    "LIBERACAO_RECUSADA",
  ] as const;

  // ── Leitura ───────────────────────────────────────────────────────────────

  /**
   * As admissões JÁ VINCULADAS ao projeto, com a trilha de como cada vínculo nasceu.
   *
   * A origem (`LIBERACAO` ou `CORRECAO`) vem junto e é o que dá sentido à tela: um projeto cheio de
   * `CORRECAO` está dizendo que o flag da Liberação não está sendo usado, e isso é informação de
   * processo, não enfeite.
   */
  async listarVinculos(projetoId: string) {
    await this.exigirProjeto(projetoId);

    return this.db
      .select({
        id: admissaoProjeto.id,
        admissaoId: admissaoProjeto.admissaoId,
        candidatoNome: candidatos.nome,
        // CLIENTE na linha (decisão do diretor): sempre com o código na frente, que é por ele que o
        // time reconhece o cliente. Os três campos saem soltos, como no resto do sistema, e quem
        // monta o rótulo é a tela.
        codCliente: admissoes.codCliente,
        clienteRazaoSocial: clientes.razaoSocial,
        clienteNomeOperacao: clientes.nomeOperacao,
        cargoNome: cargos.nome,
        dataAdmissao: admissoes.dataAdmissao,
        farolGlobal: admissoes.farolGlobal,
        grupoId: admissaoProjeto.grupoId,
        grupoRotulo: projetoGrupoEntrada.rotulo,
        origem: admissaoProjeto.origem,
        vinculadoEm: admissaoProjeto.vinculadoEm,
        vinculadoPorNome: usuarios.nome,
      })
      .from(admissaoProjeto)
      .innerJoin(admissoes, eq(admissoes.id, admissaoProjeto.admissaoId))
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(projetoGrupoEntrada, eq(projetoGrupoEntrada.id, admissaoProjeto.grupoId))
      .leftJoin(usuarios, eq(usuarios.id, admissaoProjeto.vinculadoPorId))
      .where(eq(admissaoProjeto.projetoId, projetoId))
      .orderBy(asc(admissoes.dataAdmissao), asc(candidatos.nome));
  }

  /**
   * ADMISSÕES SEM PROJETO: quem tinha tudo para estar no projeto e não está.
   *
   * O CRITÉRIO, e ele é deliberadamente o mesmo da SUGESTÃO da liberação: cliente do projeto + data
   * de admissão dentro do período. O que muda é a negação do vínculo (`left join` + `is null`), que
   * transforma a sugestão em lista de conserto.
   *
   * Admissão SEM data de admissão não aparece, e isso é consequência do critério, não descuido: sem
   * data não há como afirmar que ela cai no período do projeto. Quem estiver nesse caso se resolve
   * preenchendo a data (a admissão passa a aparecer aqui) ou pela troca de projeto, se já estiver
   * vinculada em outro.
   *
   * ANTI-JOIN e não `not exists` por gosto: os dois planejam igual no Postgres, e o `left join`
   * mantém a consulta na mesma forma das demais leituras deste módulo.
   */
  async listarOrfaos(projetoId: string) {
    const projeto = await this.exigirProjeto(projetoId);

    return this.db
      .select({
        admissaoId: admissoes.id,
        candidatoNome: candidatos.nome,
        codCliente: admissoes.codCliente,
        clienteRazaoSocial: clientes.razaoSocial,
        clienteNomeOperacao: clientes.nomeOperacao,
        cargoNome: cargos.nome,
        dataAdmissao: admissoes.dataAdmissao,
        farolGlobal: admissoes.farolGlobal,
        tipoContrato: admissoes.tipoContrato,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .leftJoin(admissaoProjeto, eq(admissaoProjeto.admissaoId, admissoes.id))
      .where(
        and(
          eq(admissoes.codCliente, projeto.codCliente),
          gte(admissoes.dataAdmissao, projeto.dataInicio),
          lte(admissoes.dataAdmissao, projeto.dataFim),
          // A NEGAÇÃO do join: sem linha de vínculo em projeto NENHUM. Quem já está em outro projeto
          // não entra nesta lista: é caso de troca, e aparece na lista do projeto onde está.
          isNull(admissaoProjeto.id),
          notInArray(admissoes.farolGlobal, [...AltoVolumeVinculosService.FORA_DA_FILA]),
        ),
      )
      .orderBy(asc(admissoes.dataAdmissao), asc(candidatos.nome));
  }

  /**
   * ALOCAÇÃO DE UMA ADMISSÃO, vista DA FICHA (OST dos 3 itens, item 3).
   *
   * O QUE ESTA LEITURA RESOLVE. A onda 3 já sabia vincular e desvincular, mas só de dentro da tela do
   * projeto, e a tela do projeto só OFERECE quem cai no recorte dela (mesmo cliente E data de
   * admissão dentro do período, ver `listarOrfaos`). Quem ficou fora desse recorte (data de admissão
   * vazia, ou fora do período, ou o consultor que está olhando a ficha e não o projeto) não tinha por
   * onde entrar no projeto. Esta leitura inverte o sentido da pergunta: em vez de "quem falta neste
   * projeto", ela responde "em que projeto esta admissão está, e em quais ela poderia estar".
   *
   * NENHUMA REGRA NOVA (§A.19/§A.26). A escrita continua sendo `vincular`/`desvincular`, intactas,
   * com as mesmas cinco recusas: é por elas que o vínculo passa, venha da tela do projeto ou da
   * ficha. Aqui só se LÊ. O `unique` de `admissao_id` continua sendo a garantia final de que ninguém
   * conta duas vezes, e `vinculo` já vem preenchido justamente para a tela mostrar onde a admissão
   * está antes de qualquer clique.
   *
   * PROJETOS OFERECIDOS: os ATIVOS do cliente da admissão, sem filtro de período. O período fica à
   * vista (`dataInicio`/`dataFim`) para quem decide, mas não recusa: a admissão vinculada conta no
   * projeto pela régua de `admissao_projeto`, que nunca olhou data de admissão (ver
   * `alto-volume-analise.service`). Filtrar por período aqui reproduziria o buraco que esta leitura
   * existe para fechar. Cliente sem projeto ativo devolve lista vazia, e a tela diz isso.
   *
   * §A.6: devolve id de admissão, código de cliente, rótulos de catálogo (projeto, grupo, cargo) e o
   * nome do USUÁRIO que vinculou (trilha). Nenhum CPF, e nenhum nome de candidato: quem abriu a ficha
   * já está olhando a pessoa, esta leitura não precisa repetir a identificação dela.
   */
  async alocacaoDaAdmissao(admissaoId: string) {
    const [admissao] = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        clienteRazaoSocial: clientes.razaoSocial,
        clienteNomeOperacao: clientes.nomeOperacao,
        cargoNome: cargos.nome,
        dataAdmissao: admissoes.dataAdmissao,
        farolGlobal: admissoes.farolGlobal,
      })
      .from(admissoes)
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(eq(admissoes.id, admissaoId));
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    const [vinculo] = await this.db
      .select({
        id: admissaoProjeto.id,
        projetoId: admissaoProjeto.projetoId,
        projetoNome: projetosAltoVolume.nome,
        projetoAtivo: projetosAltoVolume.ativo,
        grupoId: admissaoProjeto.grupoId,
        grupoRotulo: projetoGrupoEntrada.rotulo,
        origem: admissaoProjeto.origem,
        vinculadoEm: admissaoProjeto.vinculadoEm,
        vinculadoPorNome: usuarios.nome,
      })
      .from(admissaoProjeto)
      .innerJoin(projetosAltoVolume, eq(projetosAltoVolume.id, admissaoProjeto.projetoId))
      .leftJoin(projetoGrupoEntrada, eq(projetoGrupoEntrada.id, admissaoProjeto.grupoId))
      .leftJoin(usuarios, eq(usuarios.id, admissaoProjeto.vinculadoPorId))
      .where(eq(admissaoProjeto.admissaoId, admissaoId));

    // Admissão ainda sem cliente (pré-admissão) não tem projeto a oferecer: projeto é POR cliente.
    const projetos = admissao.codCliente
      ? await this.db
          .select({
            id: projetosAltoVolume.id,
            // `codCliente` e `ativo` saem juntos, e não são enfeite: a ficha reaproveita o
            // `sugerirProjetoPorPeriodo`/`projetosDoCliente` que a Liberação já usa (§A.19, regra
            // única), e essas duas funções pedem os dois campos. Sem eles a tela teria de recriar a
            // sugestão por período por conta própria, que é exatamente a régua paralela a evitar.
            codCliente: projetosAltoVolume.codCliente,
            ativo: projetosAltoVolume.ativo,
            nome: projetosAltoVolume.nome,
            dataInicio: projetosAltoVolume.dataInicio,
            dataFim: projetosAltoVolume.dataFim,
          })
          .from(projetosAltoVolume)
          .where(
            and(
              eq(projetosAltoVolume.codCliente, admissao.codCliente),
              eq(projetosAltoVolume.ativo, true),
            ),
          )
          .orderBy(asc(projetosAltoVolume.dataInicio), asc(projetosAltoVolume.nome))
      : [];

    // Grupos de entrada de cada projeto oferecido, numa consulta só: a tela precisa deles para o
    // segundo seletor, e N consultas por projeto seria N vezes a mesma varredura.
    const grupos = projetos.length
      ? await this.db
          .select({
            id: projetoGrupoEntrada.id,
            projetoId: projetoGrupoEntrada.projetoId,
            rotulo: projetoGrupoEntrada.rotulo,
          })
          .from(projetoGrupoEntrada)
          .where(
            inArray(
              projetoGrupoEntrada.projetoId,
              projetos.map((p) => p.id),
            ),
          )
          .orderBy(asc(projetoGrupoEntrada.rotulo))
      : [];

    return {
      admissao,
      vinculo: vinculo ?? null,
      projetos: projetos.map((p) => ({
        ...p,
        grupos: grupos.filter((g) => g.projetoId === p.id).map((g) => ({ id: g.id, rotulo: g.rotulo })),
      })),
    };
  }

  // ── Escrita ───────────────────────────────────────────────────────────────

  /**
   * VINCULA uma admissão ao projeto DEPOIS do fato, com origem `CORRECAO`.
   *
   * As quatro recusas são as mesmas da onda 2, e pelo mesmo motivo: vínculo torto é pior que uma
   * ação que para e explica, porque a partir dele a contagem do projeto mente sem ninguém perceber.
   * A quinta recusa é só desta onda: admissão que já está em OUTRO projeto não é vinculada por cima.
   * O unique do banco garantiria o resultado, mas com um erro de constraint que o time não entende,
   * e sem oferecer o caminho certo (desvincular, ou trocar de projeto pela linha do outro projeto).
   */
  async vincular(projetoId: string, dto: VincularAdmissaoDto, user: AuthUser) {
    const projeto = await this.exigirProjetoAtivo(projetoId);
    const admissao = await this.exigirAdmissaoDoCliente(dto.admissaoId, projeto.codCliente);
    await this.exigirGrupoDoProjeto(dto.grupoId ?? null, projetoId);

    const existente = await this.db.query.admissaoProjeto.findFirst({
      where: eq(admissaoProjeto.admissaoId, admissao.id),
    });
    if (existente) {
      throw new ConflictException(
        existente.projetoId === projetoId
          ? "Esta admissão já está neste projeto."
          : "Esta admissão já está em outro projeto. Abra o projeto em que ela está e use trocar, ou desvincule ela de lá antes de adicionar aqui.",
      );
    }

    const [row] = await this.db
      .insert(admissaoProjeto)
      .values({
        admissaoId: admissao.id,
        projetoId,
        grupoId: dto.grupoId ?? null,
        origem: "CORRECAO",
        vinculadoPorId: user.id,
      })
      .returning();
    return row;
  }

  /**
   * ADICIONA VÁRIAS admissões ao projeto de uma vez, com origem `CORRECAO`.
   *
   * POR QUE EM LOTE, e não N chamadas da tela: o caso real desta onda é uma leva inteira que ficou
   * sem projeto (a Bienal entrou com 100 pessoas no mesmo dia). Cem requisições seriam cem
   * validações do mesmo projeto e do mesmo grupo, e qualquer uma que falhasse no meio deixaria o
   * time sem saber onde parou.
   *
   * PROJETO E GRUPO SÃO VALIDADOS UMA VEZ, antes do laço, como faz a liberação em lote: eles são os
   * mesmos para as N. O que é por admissão (existir, ser do cliente, não estar em outro projeto) é
   * conferido item a item.
   *
   * UMA ADMISSÃO RUIM NÃO DERRUBA O LOTE. Ela volta em `falhas`, com o motivo em texto, e as demais
   * entram. O contrário seria pior no caso real: uma pessoa já vinculada em outro projeto faria as
   * outras noventa e nove voltarem sem explicação. Quem falhou fica na lista da tela, visível, para
   * ser resolvida uma a uma.
   *
   * O INSERT É ÚNICO para as que passaram, então ou entram todas as aprovadas ou nenhuma: o unique
   * de `admissao_id` continua sendo a garantia final contra corrida.
   */
  async vincularEmLote(projetoId: string, dto: VincularEmLoteDto, user: AuthUser) {
    const projeto = await this.exigirProjetoAtivo(projetoId);
    await this.exigirGrupoDoProjeto(dto.grupoId ?? null, projetoId);

    // Ids repetidos no mesmo pedido viram uma linha só: o unique recusaria o segundo e o lote
    // inteiro cairia por um clique duplo na tela.
    const ids = [...new Set(dto.admissaoIds)];
    const aprovadas: string[] = [];
    const falhas: { admissaoId: string; motivo: string }[] = [];

    for (const admissaoId of ids) {
      const admissao = await this.db.query.admissoes.findFirst({
        where: eq(admissoes.id, admissaoId),
      });
      if (!admissao) {
        falhas.push({ admissaoId, motivo: "Admissão não encontrada." });
        continue;
      }
      if (admissao.codCliente !== projeto.codCliente) {
        falhas.push({ admissaoId, motivo: "A admissão é de outro cliente." });
        continue;
      }
      const existente = await this.db.query.admissaoProjeto.findFirst({
        where: eq(admissaoProjeto.admissaoId, admissaoId),
      });
      if (existente) {
        falhas.push({
          admissaoId,
          motivo:
            existente.projetoId === projetoId
              ? "Esta admissão já está neste projeto."
              : "Esta admissão já está em outro projeto.",
        });
        continue;
      }
      aprovadas.push(admissaoId);
    }

    if (aprovadas.length > 0) {
      await this.db.insert(admissaoProjeto).values(
        aprovadas.map((admissaoId) => ({
          admissaoId,
          projetoId,
          grupoId: dto.grupoId ?? null,
          origem: "CORRECAO" as const,
          vinculadoPorId: user.id,
        })),
      );
    }

    return { adicionadas: aprovadas.length, falhas };
  }

  /**
   * TROCA o projeto e/ou o grupo de um vínculo que já existe.
   *
   * Por que a troca é UMA operação e não "desvincular + vincular": entre as duas o vínculo não
   * existiria, e é exatamente nesse intervalo que a pessoa some da contagem dos dois projetos. O
   * `update` mantém a linha (e o unique de `admissao_id`) durante a mudança inteira.
   *
   * `grupoId` distingue TRÊS entradas, e a distinção é necessária: ausente = mantém o grupo atual,
   * `null` = tira do grupo e deixa na cota do projeto inteiro, uuid = move para aquele grupo. Sem o
   * `null` explícito não haveria como desfazer um grupo escolhido por engano.
   *
   * A origem passa a `CORRECAO` mesmo quando o vínculo nasceu na liberação, e o autor e a data são
   * regravados: é o que a trilha tem de dizer. Um vínculo mexido à mão não é mais o que a liberação
   * gravou, e continuar exibindo `LIBERACAO` esconderia justamente o que interessa.
   */
  async atualizarVinculo(vinculoId: string, dto: AtualizarVinculoDto, user: AuthUser) {
    const atual = await this.db.query.admissaoProjeto.findFirst({
      where: eq(admissaoProjeto.id, vinculoId),
    });
    if (!atual) throw new NotFoundException("Vínculo não encontrado");

    const projetoId = dto.projetoId ?? atual.projetoId;
    // O grupo só sobrevive à troca de projeto se o projeto for o mesmo: grupo é do projeto, e manter
    // o antigo apontaria a leva de um projeto dentro de outro.
    const grupoId =
      dto.grupoId !== undefined
        ? dto.grupoId
        : projetoId === atual.projetoId
          ? atual.grupoId
          : null;

    if (projetoId !== atual.projetoId) {
      const destino = await this.exigirProjetoAtivo(projetoId);
      await this.exigirAdmissaoDoCliente(atual.admissaoId, destino.codCliente);
    }
    await this.exigirGrupoDoProjeto(grupoId, projetoId);

    if (projetoId === atual.projetoId && grupoId === atual.grupoId) {
      throw new BadRequestException("Nada mudou: escolha outro projeto ou outro grupo de entrada.");
    }

    const [row] = await this.db
      .update(admissaoProjeto)
      .set({
        projetoId,
        grupoId,
        origem: "CORRECAO",
        vinculadoPorId: user.id,
        vinculadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .where(eq(admissaoProjeto.id, vinculoId))
      .returning();
    return row;
  }

  /**
   * DESVINCULA (exclusão física da linha de vínculo).
   *
   * Física, e não lógica como a inativação do projeto, porque o vínculo não é cadastro: ele é a
   * afirmação "esta pessoa conta neste projeto". Vínculo desligado que continuasse na tabela teria
   * de ser filtrado em toda contagem da onda 4, e o primeiro lugar que esquecesse o filtro contaria
   * gente que não é do projeto. A admissão não é tocada: segue na esteira, intacta.
   */
  async desvincular(vinculoId: string) {
    const [row] = await this.db
      .delete(admissaoProjeto)
      .where(eq(admissaoProjeto.id, vinculoId))
      .returning({ id: admissaoProjeto.id });
    if (!row) throw new NotFoundException("Vínculo não encontrado");
    return { ok: true };
  }

  // ── Apoio ─────────────────────────────────────────────────────────────────

  private async exigirProjeto(projetoId: string) {
    const projeto = await this.db.query.projetosAltoVolume.findFirst({
      where: eq(projetosAltoVolume.id, projetoId),
    });
    if (!projeto) throw new NotFoundException("Projeto de Alto Volume não encontrado.");
    return projeto;
  }

  /**
   * Projeto INATIVO não recebe vínculo, nem por correção. É a mesma recusa da liberação (onda 2), e
   * a mensagem oferece a saída em vez de só barrar: reativar, corrigir, inativar de novo. Deixar
   * escrever em projeto encerrado abriria a porta para mexer no histórico de um projeto fechado sem
   * que nada na tela indicasse que ele estava fechado.
   */
  private async exigirProjetoAtivo(projetoId: string) {
    const projeto = await this.exigirProjeto(projetoId);
    if (!projeto.ativo) {
      throw new BadRequestException(
        "Este projeto de Alto Volume está inativo. Reative o projeto para corrigir os vínculos dele.",
      );
    }
    return projeto;
  }

  /** A admissão existe e é do MESMO cliente do projeto (a regra que o banco não tem como garantir). */
  private async exigirAdmissaoDoCliente(admissaoId: string, codCliente: string) {
    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada");
    if (admissao.codCliente !== codCliente) {
      throw new BadRequestException(
        "Esta admissão é de outro cliente. O projeto de Alto Volume só recebe admissões do cliente dele.",
      );
    }
    return admissao;
  }

  /** Grupo nulo é a cota do projeto inteiro; preenchido tem de ser grupo DAQUELE projeto. */
  private async exigirGrupoDoProjeto(grupoId: string | null, projetoId: string) {
    if (!grupoId) return;
    const grupo = await this.db.query.projetoGrupoEntrada.findFirst({
      where: eq(projetoGrupoEntrada.id, grupoId),
    });
    if (!grupo) throw new NotFoundException("Grupo de entrada não encontrado");
    if (grupo.projetoId !== projetoId) {
      throw new BadRequestException("O grupo de entrada escolhido não pertence a este projeto.");
    }
  }
}
