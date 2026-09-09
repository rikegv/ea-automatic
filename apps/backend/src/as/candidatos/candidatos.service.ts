import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  AsCandidaturaEtapaItem,
  AsCandidatoFicha,
  AsCandidatoListItem,
  AsCandidaturaEncerrada,
  AsCandidaturaItem,
  AsContatoItem,
  AsOcupacaoVaga,
  AsPainelVaga,
  AsReentradaPrecisaCiencia,
  CandidaturaSituacao,
} from "@ea/shared-types";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidatos,
  asCandidaturaEtapas,
  asCandidaturas,
  asContatos,
  usuarios,
  vagas,
} from "../../db/schema";
import {
  movimentoPermitido,
  cabeMaisUm,
  decidirAlocacao,
  ocupacaoDaVaga,
  ocupadasPorLado,
  ACEITE_BANCO_COM_OFICIAIS_ABERTAS,
  vagaRecebeCandidato,
  SITUACOES_VIVAS,
  SITUACOES_QUE_CONSOMEM_POSICAO,
  candidaturaViva,
  consomePosicao,
  finalizaPosicao,
  ladoDaCandidatura,
  ocupaPosicao,
  oficiaisAindaAbertas,
  tetoDoLado,
  type PosicaoLado,
  type SituacaoQueOcupaPosicao,
} from "../../domain/candidatura";
import { ordenarLinhaDoTempo, tipoDoEvento } from "../../domain/candidatura-historico";
import type {
  AlocarEmVagaDto,
  BuscarCandidatosDto,
  CriarCandidatoDto,
  EditarCandidatoDto,
  FinalizarPosicaoDto,
  MoverEtapaDto,
  RegistrarContatoDto,
  RegistrarSaidaDto,
  TrocarVagaDto,
} from "./candidatos.dto";

/**
 * CENTRAL DE CANDIDATOS (A&S, onda 1): a pessoa, a candidatura e o histórico.
 *
 * A OCUPAÇÃO DA VAGA É SEMPRE DERIVADA, NUNCA ARMAZENADA. Não existe coluna "ocupadas" em lugar
 * nenhum: toda vez que a pergunta é feita, as candidaturas são contadas. É a mesma decisão que a
 * vaga já tinha tomado com os contadores dela, pelo mesmo motivo: um contador guardado é um segundo
 * número, e dois números que deveriam ser iguais acabam discordando.
 *
 * §A.6, E ESTE MÓDULO É O CASO MAIS SENSÍVEL DO SISTEMA ATÉ AQUI, porque guarda dado pessoal de quem
 * AINDA NÃO É FUNCIONÁRIO. As regras aplicadas aqui, e o lugar exato de cada uma:
 *   1. CPF NUNCA EM LOG. Este arquivo não tem `Logger` nenhum, e é deliberado: sem logger não há
 *      como o CPF vazar por um `logger.debug` acrescentado com pressa numa correção futura.
 *   2. CPF NUNCA EM MENSAGEM DE ERRO. Toda frase de erro fala do CPF sem repetir o número, incluindo
 *      a de duplicidade, que é a que mais tentaria repetir ("o CPF X já existe").
 *   3. CPF NUNCA EM URL NEM EM QUERY STRING. A busca é POST e o número viaja no CORPO. Não existe
 *      rota GET de listagem neste módulo, para não sobrar a porta em que alguém acrescentaria
 *      `?cpf=` sem pensar.
 *   4. MINIMIZAÇÃO NO RETORNO. A LISTA não devolve CPF, e-mail, telefone nem data de nascimento:
 *      devolve `temCpf`, um booleano. O número sai só na FICHA de um candidato.
 *   5. GUARD DE ÁREA cobrindo tudo: a controller inteira é reivindicada pelo menu `as-candidatos`,
 *      leitura incluída, e o menu nasce só para o SUPER_ADMIN (§A.23).
 */
/**
 * O ID DO CANDIDATO, QUALIFICADO À MÃO, para uso DENTRO de subconsulta correlacionada.
 *
 * O PORQUÊ, MEDIDO E NÃO DEDUZIDO. Numa consulta de UMA tabela só, o drizzle renderiza a coluna
 * interpolada de formas diferentes conforme o lugar:
 *   - no WHERE, ele QUALIFICA: `where "as_candidaturas"."candidato_id" = "as_candidatos"."id"`, e a
 *     correlação funciona (foi assim que os filtros por vaga e "sem candidatura" sempre funcionaram);
 *   - na LISTA DO SELECT, ele NÃO qualifica: `where "candidato_id" = "id"`. Dentro da subconsulta os
 *     dois nomes resolvem contra `as_candidaturas`, a comparação vira `candidato_id = id` da própria
 *     tabela, nunca casa, e o contador dá SEMPRE ZERO. Medido: uma pessoa com candidatura ATIVA
 *     aparecia com 0.
 *
 * É o mesmo defeito do livreto de grupos e da tela do iFractal, os dois na lista do select (lá o
 * contador exibia o TOTAL DA BASE em todas as linhas, porque a comparação virava sempre verdadeira).
 *
 * Qualificar à mão vale para os três pontos, e não só para o quebrado: um filtro que hoje está certo
 * por causa de um detalhe de renderização não é um filtro que se possa confiar amanhã.
 */
const ID_DO_CANDIDATO = sql`${asCandidatos}.${sql.identifier("id")}`;

@Injectable()
export class CandidatosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ── A PESSOA ──────────────────────────────────────────────────────────────

  /**
   * CADASTRAR, com DEDUP POR CPF.
   *
   * O DEDUP TEM DUAS CAMADAS, e as duas importam. A primeira é esta consulta, que existe para a
   * pessoa receber uma frase em português e o `candidatoId` de quem já está cadastrado, para a tela
   * poder oferecer "abrir o cadastro existente". A segunda é o UNIQUE PARCIAL no banco, que é o que
   * de fato garante: dois cliques simultâneos passam pela primeira camada juntos, e é a segunda que
   * derruba o segundo. Por isso a violação de unique é capturada e traduzida logo abaixo, em vez de
   * virar erro 500.
   *
   * §A.6: nem a consulta nem a mensagem repetem o número.
   */
  async criar(dto: CriarCandidatoDto, criadoPorId: string): Promise<AsCandidatoFicha> {
    const cpf = this.cpfOuNulo(dto.cpf);

    if (cpf) {
      const [existente] = await this.db
        .select({ id: asCandidatos.id, nome: asCandidatos.nome })
        .from(asCandidatos)
        .where(eq(asCandidatos.cpf, cpf));
      if (existente) throw this.conflitoDeCpf(existente.id, existente.nome);
    }

    let id: string;
    try {
      const [row] = await this.db
        .insert(asCandidatos)
        .values({
          nome: dto.nome.trim(),
          cpf,
          email: texto(dto.email),
          telefone: texto(dto.telefone),
          dataNascimento: texto(dto.dataNascimento),
          cidade: texto(dto.cidade),
          uf: dto.uf ?? null,
          origem: dto.origem ?? "MANUAL",
          idCandidatePandape: texto(dto.idCandidatePandape),
          criadoPorId,
        })
        .returning({ id: asCandidatos.id });
      id = row.id;
    } catch (err) {
      // A SEGUNDA CAMADA DO DEDUP chegando: a corrida entre dois cadastros simultâneos com o mesmo
      // CPF. Sem esta tradução, o consultor veria um 500 e teria certeza de que o sistema quebrou.
      throw this.traduzirUnique(err);
    }

    return this.ficha(id);
  }

  /**
   * EDITAR a ficha. Mesmo dedup do cadastro, porque preencher o CPF depois é o caminho normal aqui:
   * a pessoa entra sem CPF na captação e informa o número quando o processo avança.
   */
  async editar(id: string, dto: EditarCandidatoDto): Promise<AsCandidatoFicha> {
    const atual = await this.db.query.asCandidatos.findFirst({ where: eq(asCandidatos.id, id) });
    if (!atual) throw new NotFoundException("Candidato não encontrado.");

    const cpf = dto.cpf === undefined ? atual.cpf : this.cpfOuNulo(dto.cpf);
    if (cpf && cpf !== atual.cpf) {
      const [outro] = await this.db
        .select({ id: asCandidatos.id, nome: asCandidatos.nome })
        .from(asCandidatos)
        .where(and(eq(asCandidatos.cpf, cpf), ne(asCandidatos.id, id)));
      if (outro) throw this.conflitoDeCpf(outro.id, outro.nome);
    }

    try {
      await this.db
        .update(asCandidatos)
        .set({
          nome: dto.nome?.trim() ?? atual.nome,
          cpf,
          email: dto.email === undefined ? atual.email : texto(dto.email),
          telefone: dto.telefone === undefined ? atual.telefone : texto(dto.telefone),
          dataNascimento:
            dto.dataNascimento === undefined ? atual.dataNascimento : texto(dto.dataNascimento),
          cidade: dto.cidade === undefined ? atual.cidade : texto(dto.cidade),
          uf: dto.uf === undefined ? atual.uf : (dto.uf ?? null),
          origem: dto.origem ?? atual.origem,
          atualizadoEm: new Date(),
        })
        .where(eq(asCandidatos.id, id));
    } catch (err) {
      throw this.traduzirUnique(err);
    }

    return this.ficha(id);
  }

  /**
   * BUSCAR, e o resultado é DELIBERADAMENTE POBRE (§A.6, minimização).
   *
   * A lista devolve `temCpf`, um booleano, e nenhum identificador direto. A lista é a superfície que
   * mais circula (fica aberta na tela, entra em captura de tela, é a primeira coisa que alguém
   * pediria para exportar), e nada nela precisa do número: quem precisa é a ficha, que é uma pessoa
   * por vez e um clique deliberado.
   *
   * A BUSCA POR CPF É EXATA, sobre o CPF INTEIRO. Busca parcial por CPF ("termina em 789") seria
   * vazamento por sondagem: com poucas tentativas se confirma o número de alguém que se suspeita
   * estar na base.
   */
  async buscar(dto: BuscarCandidatosDto): Promise<AsCandidatoListItem[]> {
    const filtros = [];

    if (dto.cpf) {
      const cpf = this.cpfOuNulo(dto.cpf);
      // CPF preenchido e inválido devolve NADA, em vez de ignorar o filtro e listar a base inteira.
      if (!cpf) return [];
      filtros.push(eq(asCandidatos.cpf, cpf));
    }

    const nome = dto.nome?.trim();
    if (nome) {
      // Sem acento e sem caixa, para "joao" achar "João". `unaccent` não está instalado no banco,
      // então a comparação é feita com `translate`, que resolve o alfabeto que interessa aqui.
      filtros.push(
        sql`translate(lower(${asCandidatos.nome}), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
            like ${"%" + semAcento(nome) + "%"}`,
      );
    }
    if (dto.origem) filtros.push(eq(asCandidatos.origem, dto.origem));

    if (dto.vagaId) {
      filtros.push(
        sql`exists (select 1 from ${asCandidaturas}
                    where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
                      and ${asCandidaturas.vagaId} = ${dto.vagaId})`,
      );
    }

    /**
     * QUEM NÃO ESTÁ EM VAGA NENHUMA: a lista de escolha do botão "Alocar candidato".
     *
     * ┌─ A RÉGUA APERTOU (ajuste 1 do diretor), e o motivo é o caminho novo ao lado ──────────────┐
     * │ ANTES: "sem candidatura VIVA". Quem tinha sido descartado ou tinha desistido continuava    │
     * │ na lista, porque na época ESTA era a única porta: barrá-lo aqui o deixaria sem caminho     │
     * │ nenhum de volta.                                                                          │
     * │                                                                                           │
     * │ AGORA: "sem candidatura NENHUMA". O que mudou foi a existência do "Trazer De Volta", que   │
     * │ nasce na LINHA da pessoa encerrada e leva à reentrada, com o processo anterior à vista. Com│
     * │ ele, quem já esteve numa vaga tem porta própria, e misturá-lo aqui só engorda uma lista    │
     * │ que existe para achar CANDIDATO SOLTO.                                                    │
     * │                                                                                           │
     * │ OS DOIS CAMINHOS SÃO EXCLUDENTES POR CONSTRUÇÃO, e é isso que impede o beco: quem tem      │
     * │ candidatura sai daqui e aparece no outro; quem não tem aparece aqui e não precisa do outro.│
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * `not exists` E NÃO `count(...) = 0`: o Postgres para na primeira linha encontrada, enquanto a
     * contagem percorreria todas as candidaturas da pessoa para descobrir o mesmo.
     *
     * §A.6: o retorno é o MESMO da busca normal, com `temCpf` no lugar do número. A tela de escolha
     * mostra nome, cidade/UF e o booleano, e é tudo o que ela precisa para o consultor escolher.
     */
    if (dto.semCandidatura) {
      filtros.push(
        sql`not exists (select 1 from ${asCandidaturas}
                         where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO})`,
      );
    }

    const linhas = await this.db
      .select({
        id: asCandidatos.id,
        nome: asCandidatos.nome,
        origem: asCandidatos.origem,
        cidade: asCandidatos.cidade,
        uf: asCandidatos.uf,
        // O BOOLEANO NO LUGAR DO NÚMERO: a resposta que a tela precisa, sem o dado que ela não usa.
        temCpf: sql<boolean>`${asCandidatos.cpf} is not null`,
        criadoEm: asCandidatos.criadoEm,
        // A LISTA DAS VIVAS VEM DA CONSTANTE, e não escrita aqui dentro: era uma das cinco cópias
        // desta régua, e cópia concorda com a fonte por coincidência. `inArray` produz a mesma
        // cláusula `in (...)` de antes, com a coluna qualificada do mesmo jeito.
        candidaturasAtivas: sql<number>`(
          select count(*)::int from ${asCandidaturas}
           where ${asCandidaturas.candidatoId} = ${ID_DO_CANDIDATO}
             and ${inArray(asCandidaturas.situacao, SITUACOES_VIVAS)})`,
      })
      .from(asCandidatos)
      .where(filtros.length > 0 ? and(...filtros) : undefined)
      .orderBy(desc(asCandidatos.criadoEm))
      .limit(200);

    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      origem: l.origem,
      cidade: l.cidade,
      uf: l.uf,
      temCpf: Boolean(l.temCpf),
      candidaturasAtivas: Number(l.candidaturasAtivas ?? 0),
      criadoEm: l.criadoEm.toISOString(),
    }));
  }

  /** A FICHA: o único lugar em que o CPF e os dados de contato saem do backend. */
  async ficha(id: string): Promise<AsCandidatoFicha> {
    const c = await this.db.query.asCandidatos.findFirst({ where: eq(asCandidatos.id, id) });
    if (!c) throw new NotFoundException("Candidato não encontrado.");

    return {
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      email: c.email,
      telefone: c.telefone,
      dataNascimento: c.dataNascimento,
      cidade: c.cidade,
      uf: c.uf,
      origem: c.origem,
      criadoEm: c.criadoEm.toISOString(),
      anonimizadoEm: c.anonimizadoEm ? c.anonimizadoEm.toISOString() : null,
      candidaturas: await this.candidaturasDoCandidato(id),
    };
  }

  // ── A CANDIDATURA ─────────────────────────────────────────────────────────

  /**
   * ALOCAR a pessoa numa vaga. Nasce em `CAPTACAO` e `ATIVO`, e ATIVO NÃO CONSOME POSIÇÃO: por isso
   * alocar não passa pela trava 1. Uma vaga de 10 recebe 40 currículos sem travar, que é o normal.
   *
   * TRAVA 2 (vaga fechada) e TRAVA 3 (duplicata) atuam aqui. A trava 3 tem duas camadas, como o
   * dedup do CPF: a consulta, que produz a frase legível, e o UNIQUE PARCIAL `uq_as_candidaturas_viva`
   * do banco, que é o que de fato garante contra o duplo clique. Sem o unique, dois cliques rápidos
   * criariam duas linhas e a contagem de posições ocupadas passaria a mentir.
   *
   * A REENTRADA EM VAGA JÁ ENCERRADA É PERMITIDA, COM AVISO (ajuste do diretor). A trava 3 deixou de
   * ser "esta pessoa não pode aparecer duas vezes nesta vaga" e passou a ser "esta pessoa não pode
   * estar DUAS VEZES VIVA nesta vaga". Quem foi DESCARTADO ou DESISTIU no passado volta, e o passado
   * fica: a linha anterior NÃO é reaproveitada nem apagada, nasce uma candidatura nova em CAPTACAO e
   * o histórico continua consultável, que é o ponto todo de deixá-lo lá.
   *
   * A RECUSA DA PRIMEIRA TENTATIVA NÃO É BUROCRACIA. Alocar quem já foi descartado naquela mesma vaga
   * costuma ser engano (a pessoa foi escolhida de novo numa lista sem que ninguém lembrasse do
   * descarte), e a decisão muda conforme o MOTIVO e a DATA do descarte anterior. O 409 devolve os
   * dois, e o consultor decide com eles na tela em vez de descobrir depois.
   *
   * ALOCA POR `id` DO CANDIDATO, E NÃO EXIGE CPF (ajuste 2 do diretor). A chave da tabela sempre foi
   * o `id`; o CPF é opcional desde o primeiro dia, e nada neste caminho o lê. O beco sem saída não
   * estava aqui: estava em NÃO EXISTIR uma lista de onde escolher a pessoa sem passar pelo dedup por
   * CPF. Quem abriu essa porta foi o filtro `semCandidatura` da busca, logo acima. Este método fica
   * como está, e este parágrafo existe para que a garantia seja EXPLÍCITA: quem acrescentar aqui uma
   * exigência de CPF fecha o beco de novo.
   */
  async alocar(
    candidatoId: string,
    dto: AlocarEmVagaDto,
    alocadoPorId: string,
  ): Promise<AsCandidaturaItem> {
    const candidato = await this.db.query.asCandidatos.findFirst({
      where: eq(asCandidatos.id, candidatoId),
    });
    if (!candidato) throw new NotFoundException("Candidato não encontrado.");

    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, dto.vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    // TRAVA 2: vaga encerrada não recebe candidato novo. FECHADA, CANCELADA e ENTREGUE.
    if (!vagaRecebeCandidato(vaga.status)) {
      throw new ConflictException("Esta vaga está Fechada e não recebe candidato novo.");
    }

    // TRAVA 3, primeira camada: a frase legível e o aviso de reentrada. A garantia é o unique
    // parcial, logo abaixo. A régua de quem está vivo e quem só esteve é do domínio
    // (`decidirAlocacao`), e NÃO é reescrita aqui: uma segunda lista de situações neste arquivo
    // divergiria da primeira no dia em que o vocabulário mudasse.
    const anteriores = await this.db
      .select({
        id: asCandidaturas.id,
        situacao: asCandidaturas.situacao,
        motivo: asCandidaturas.motivoDescarte,
        encerradaEm: asCandidaturas.atualizadoEm,
      })
      .from(asCandidaturas)
      .where(
        and(
          eq(asCandidaturas.candidatoId, candidatoId),
          eq(asCandidaturas.vagaId, dto.vagaId),
        ),
      );

    const decisao = decidirAlocacao(anteriores);
    if (decisao.tipo === "JA_ESTA") {
      throw new ConflictException("Esta pessoa já está nesta vaga.");
    }
    if (decisao.tipo === "REENTRADA" && !dto.cienteReentrada) {
      throw this.reentradaPrecisaCiencia(decisao.anterior);
    }

    let id: string;
    try {
      /*
       * A CANDIDATURA E O PRIMEIRO EVENTO DO HISTORICO NASCEM NA MESMA TRANSAÇÃO, e não é zelo
       * decorativo: candidatura sem evento de ENTRADA apareceria na ficha como uma linha do tempo
       * vazia, dizendo que a pessoa nunca entrou em lugar nenhum. Ou as duas escritas, ou nenhuma.
       */
      id = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(asCandidaturas)
          .values({
            candidatoId,
            vagaId: dto.vagaId,
            idMatchPandape: texto(dto.idMatchPandape),
            alocadoPorId,
          })
          .returning({ id: asCandidaturas.id, etapa: asCandidaturas.etapa });

        await tx.insert(asCandidaturaEtapas).values({
          candidaturaId: row.id,
          // ENTRADA: `etapaDe` nula é o que diz "nasceu aqui", em vez de "veio de algum lugar".
          etapaDe: null,
          etapaPara: row.etapa,
          situacao: null,
          porId: alocadoPorId,
        });

        return row.id;
      });
    } catch (err) {
      // TRAVA 3, segunda camada: o duplo clique que passou pelas duas consultas ao mesmo tempo.
      throw this.traduzirUnique(err);
    }

    return this.candidatura(id);
  }

  /**
   * MOVER DE ETAPA, pela régua do domínio. A etapa é onde a pessoa está no funil, e mudá-la NÃO muda
   * a situação: quem foi para `APROVACAO` continua `ATIVO` até alguém aprovar de fato. Isso é o que
   * mantém a etapa e a ocupação independentes, e é por isso que chegar na última etapa do funil não
   * consome posição nenhuma.
   *
   * O MOVIMENTO É LIVRE desde 27/08 (decisão do diretor): qualquer etapa para qualquer outra, para a
   * frente, para trás e com pulo, porque a operação real não é linear. A régua está em
   * `movimentoPermitido`, no domínio, e a justificativa inteira mora lá.
   *
   * ┌─ QUEM SE MOVE: TODA CANDIDATURA VIVA, e não só a `ATIVO` (correção do modelo de posição) ──┐
   * │ A RÉGUA ERA `situacao !== "ATIVO"`, com a frase "já foi encerrada e não avança mais". Ela   │
   * │ MENTIA para o `APROVADO` desde sempre (ser aprovado não encerra processo nenhum) e passaria │
   * │ a mentir para o `ALOCADO`, que é o estado que o diretor definiu como o oposto disso: o      │
   * │ alocado PREENCHE a posição e CONTINUA no funil.                                            │
   * │                                                                                            │
   * │ A RÉGUA CERTA É `candidaturaViva`, a MESMA fonte única do `shared-types` que a ocupação da  │
   * │ vaga e a trava de duplicata já leem. Uma segunda lista aqui divergiria dela no primeiro dia │
   * │ em que o vocabulário ganhasse uma situação nova, e é este módulo que já pagou por isso.     │
   * │                                                                                            │
   * │ A CONTAGEM DA VAGA CONTINUA FORA DE ALCANCE, que é a garantia que a régua antiga protegia:  │
   * │ mover de etapa escreve SÓ a coluna `etapa`, e a ocupação deriva de `situacao`. Andar no     │
   * │ funil não desfaz aprovação nenhuma nem solta posição nenhuma, com qualquer régua das duas.  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async moverEtapa(
    candidaturaId: string,
    dto: MoverEtapaDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");
    if (!candidaturaViva(c.situacao)) {
      throw new ConflictException(
        "Esta candidatura foi encerrada sem êxito e não anda mais no funil. Para trazer a pessoa de volta, aloque-a de novo na vaga.",
      );
    }

    /*
     * A ÚNICA RECUSA QUE SOBROU: mover para a etapa em que a pessoa JÁ ESTÁ. Com o funil livre não há
     * mais "avanço não permitido" a explicar, então a frase deixou de mandar recarregar a página:
     * quem clicou na etapa atual não está com a tela desatualizada, está clicando no próprio lugar.
     */
    if (!movimentoPermitido(c.etapa, dto.etapa)) {
      throw new BadRequestException("Esta candidatura já está nesta etapa.");
    }

    /*
     * O MOVIMENTO E O REGISTRO DELE, NA MESMA TRANSAÇÃO. A coluna `etapa` é sobrescrita, então o
     * evento é a ÚNICA memória de que a pessoa esteve na etapa anterior: gravar um sem o outro
     * perderia o caminho justamente no gesto que o cria.
     */
    await this.db.transaction(async (tx) => {
      await tx
        .update(asCandidaturas)
        .set({ etapa: dto.etapa, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, candidaturaId));

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: c.etapa,
        etapaPara: dto.etapa,
        // MOVIMENTO: `situacao` nula. Mover de etapa não muda situação, e essa independência é o que
        // mantém a ocupação da vaga fora do alcance desta operação.
        situacao: null,
        porId,
      });
    });

    return this.candidatura(candidaturaId);
  }

  /**
   * APROVAR: a operação que CONSOME POSIÇÃO, e onde vivem as travas 1 e 4.
   *
   * ┌─ A TRAVA 4, QUE É A QUE MAIS IMPORTA E A QUE SE COSTUMA ERRAR ─────────────────────────────┐
   * │                                                                                            │
   * │ O CENÁRIO: dois consultores aprovam o 10º e o 11º candidato de uma vaga de 10 ao mesmo      │
   * │ tempo. Cada um lê "9 ocupadas", cada um conclui "ainda cabe", os dois gravam, e a vaga fecha│
   * │ com 11. Isso funciona em toda demonstração e falha na primeira sexta-feira movimentada.     │
   * │                                                                                            │
   * │ POR QUE UMA CONSULTA SOLTA ANTES DO INSERT NÃO RESOLVE: ela responde sobre o passado. Entre │
   * │ o `select count(*)` e o `update`, a outra transação faz exatamente a mesma coisa, e as duas │
   * │ leram um estado em que ainda cabia.                                                        │
   * │                                                                                            │
   * │ COMO ESTÁ RESOLVIDO AQUI, e a ordem é a regra inteira:                                     │
   * │   1. abre a TRANSAÇÃO;                                                                     │
   * │   2. trava a LINHA DA VAGA com `SELECT ... FOR UPDATE`;                                    │
   * │   3. SÓ DEPOIS conta as ocupadas;                                                          │
   * │   4. decide e grava;                                                                       │
   * │   5. fecha a transação, e só aí a linha da vaga é liberada.                                │
   * │                                                                                            │
   * │ A vaga é o RECURSO DISPUTADO, então é a linha dela que serializa a disputa. A segunda       │
   * │ transação fica bloqueada no passo 2 até a primeira terminar, e quando ela finalmente conta, │
   * │ conta o número JÁ ATUALIZADO: cai na trava 1 e recebe a mensagem de vaga cheia. As duas     │
   * │ requisições continuam sendo atendidas; o que não acontece é as duas passarem.               │
   * │                                                                                            │
   * │ TRAVAR A LINHA DA CANDIDATURA NÃO RESOLVERIA: são candidaturas DIFERENTES, e dois locks em  │
   * │ linhas diferentes não se enxergam. É a vaga que precisa ser travada, e é o `FOR UPDATE` na  │
   * │ vaga que faz a fila existir.                                                               │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async aprovar(candidaturaId: string, porId: string): Promise<AsCandidaturaItem> {
    /*
     * ┌─ AS DUAS GUARDAS QUE FALTAVAM AQUI (achado da auditoria, 08/09) ──────────────────────────┐
     * │ ATÉ AQUI A APROVAÇÃO NÃO CONFERIA SITUAÇÃO NENHUMA, e as duas consequências eram caras:   │
     * │                                                                                          │
     * │ 1. APROVAR QUEM JÁ FOI ENTREGUE DESFAZIA A ENTREGA. `ALOCADO` virava `APROVADO`, a        │
     * │    contagem de entregues CAÍA, o cilindro da tela esvaziava e a vaga que estava completa  │
     * │    voltava a exigir um Master para fechar. Quem barra isso é a régua de não retroceder    │
     * │    entrega, que mora no caminho travado e vale para TODO chamador, não só para este.      │
     * │                                                                                          │
     * │ 2. APROVAR UM DESCARTADO RESSUSCITAVA A LINHA MORTA e pulava a ciência de reentrada, que  │
     * │    é exatamente o buraco que a finalização de posição fechou com `exigeCandidaturaViva` e │
     * │    que a aprovação nunca recebeu. Quem foi recusado e volta a ser escolhido tem UM         │
     * │    caminho, o da `alocar`, que mostra o motivo e a data do encerramento anterior.         │
     * │                                                                                          │
     * │ É O MECANISMO QUE JÁ EXISTE, e não um segundo: a mesma opção da `finalizarPosicao`,       │
     * │ conferida DENTRO da transação, sob a linha da vaga já travada.                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    await this.mudarSituacaoOcupandoPosicao(candidaturaId, "APROVADO", null, porId, undefined, {
      exigeCandidaturaViva: true,
    });
    return this.candidatura(candidaturaId);
  }

  /**
   * ─ FINALIZAR POSIÇÃO: a posição da vaga é ENTREGUE, com nome e sobrenome ──────────────────────
   *
   * O QUE ELA RESOLVE. Até aqui, o ÚNICO jeito de dizer "esta posição foi preenchida" era FECHAR a
   * vaga com um número digitado à mão, e fechar bloqueia: a vaga entregue para de receber candidato
   * (`STATUS_QUE_NAO_RECEBEM`). Quem tinha 5 posições e entregou a primeira ficava entre mentir o
   * número ou fechar cedo demais. Com esta operação, entregar uma posição é um fato por pessoa, e a
   * vaga continua aberta enquanto sobrar posição.
   *
   * ELA NÃO É UMA SAÍDA, e é por isso que ela não passa pelo `registrarSaida`: o candidato ALOCADO
   * CONTINUA NO FUNIL. O `@IsIn` do `RegistrarSaidaDto` recusa `ALOCADO` de propósito, então nem
   * corpo montado fora da tela entra por lá.
   *
   * ELA PASSA PELO CAMINHO TRAVADO, e isto é a regra mais cara deste arquivo: `ALOCADO` consome
   * posição, então gravá-lo por fora de `mudarSituacaoOcupandoPosicao` reabriria a corrida entre dois
   * consultores que o `SELECT ... FOR UPDATE` do passo 2 existe para fechar. O comentário de 30
   * linhas da `aprovar`, logo acima, explica por que uma consulta solta antes do update não resolve.
   *
   * SEM MOTIVO, de propósito (`null`): entregar a posição é o desfecho bem-sucedido, e não tem
   * justificativa a dar. Quem precisa de motivo é a saída, que encerra o processo de alguém.
   *
   * ┌─ SÓ CANDIDATURA VIVA FINALIZA POSIÇÃO, e esta trava faltava (achado da auditoria) ─────────┐
   * │ SEM ELA, uma candidatura DESCARTADA ia direto a `ALOCADO`. Quem foi descartado e volta a    │
   * │ ser escolhido tem UM caminho, o da `alocar`: ela mostra o MOTIVO e a DATA do descarte e     │
   * │ exige a ciência de reentrada, porque escolher de novo quem já foi recusado costuma ser      │
   * │ engano de lista. Finalizar posição por cima da linha morta pulava essa conversa inteira e   │
   * │ ainda ressuscitava a candidatura ENCERRADA em vez de abrir a nova que o histórico espera.   │
   * │                                                                                            │
   * │ O DADO NUNCA CHEGOU A FICAR TORTO, e é isso que faz disto uma correção de RECUSA e não de   │
   * │ integridade: o índice parcial `uq_as_candidaturas_viva` já impedia duas vivas do mesmo par  │
   * │ pessoa/vaga. O que ele NÃO impedia era o caso da pessoa sem outra candidatura viva ali, e   │
   * │ nesse caso a linha morta virava ALOCADO consumindo posição, sem ninguém ser avisado.        │
   * │                                                                                            │
   * │ A RÉGUA É `candidaturaViva`, do domínio, a MESMA da `trocarVaga`. Não se escreve aqui uma   │
   * │ segunda lista de quem está vivo: ela divergiria da primeira no dia em que o vocabulário     │
   * │ mudasse, que é o defeito que este módulo já pagou cinco vezes.                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async finalizarPosicao(
    candidaturaId: string,
    dto: FinalizarPosicaoDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    try {
      await this.mudarSituacaoOcupandoPosicao(
        candidaturaId,
        "ALOCADO",
        null,
        porId,
        {
          lado: dto.lado ?? "OFICIAL",
          cienteBancoComOficiaisAbertas: dto.cienteBancoComOficiaisAbertas === true,
        },
        // TRAVA 5, PRIMEIRA CAMADA (ver o parágrafo "SÓ CANDIDATURA VIVA FINALIZA", acima).
        { exigeCandidaturaViva: true },
      );
    } catch (err) {
      /*
       * TRAVA 5, SEGUNDA CAMADA: a mesma divisão de trabalho da `alocar`, e pelo mesmo motivo.
       *
       * A primeira camada recusa com a frase de gente; esta traduz a violação do índice parcial
       * `uq_as_candidaturas_viva` na fresta que a primeira não cobre. A fresta é estreita e existe:
       * a `alocar` NÃO trava a linha da vaga, então ela pode criar a segunda candidatura viva do
       * par pessoa/vaga entre a leitura desta transação e a gravação dela. Sem esta camada, aquele
       * encontro chega na tela como 500 com erro cru de banco, em vez da frase que a `alocar`
       * devolveria no mesmo caso.
       *
       * `traduzirUnique` DEVOLVE O ERRO INTACTO quando não reconhece a restrição, então as recusas
       * legítimas de dentro da transação (vaga cheia, aviso do banco, candidatura não encontrada)
       * passam por aqui sem mudar de forma nem de status.
       */
      throw this.traduzirUnique(err);
    }
    return this.candidatura(candidaturaId);
  }

  /**
   * ─ TROCAR A VAGA DA CANDIDATURA (item 5 do diretor, só MASTER e SUPER_ADMIN) ─────────────────
   *
   * ┌─ O QUE ELA É, E O QUE ELA NÃO É ───────────────────────────────────────────────────────────┐
   * │ CORRIGE, não recomeça. O candidato foi alocado na vaga ERRADA, e o único caminho era o      │
   * │ "Trazer De Volta", que cria uma SEGUNDA candidatura e devolve a pessoa para a Captação.     │
   * │ Aquilo está certo para RECOMEÇO e errado para CORREÇÃO: o processo não recomeçou, ele       │
   * │ estava anotado no lugar errado. Aqui a MESMA linha muda de vaga e a ETAPA fica onde estava. │
   * │                                                                                            │
   * │ OS DOIS CAMINHOS CONVIVEM DE PROPÓSITO: este mantém, aquele duplica.                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ POR QUE NÃO HÁ CONTAGEM A ATUALIZAR, e este é o achado da investigação (§A.27) ───────────┐
   * │ A ocupação NUNCA é armazenada: `ocupacaoDaVaga` conta as linhas APROVADO/ENVIADO_PARA_ADMISSAO toda    │
   * │ vez que alguém pergunta. Então trocar o `vagaId` já deixa as DUAS vagas certas na leitura   │
   * │ seguinte, sem ninguém decrementar a origem nem incrementar o destino. Não existe contador   │
   * │ para dessincronizar, e é exatamente por isso que o módulo recusou guardar um desde o        │
   * │ primeiro dia.                                                                              │
   * │                                                                                            │
   * │ O CILINDRO DA CENTRAL DE VAGAS TAMBÉM NÃO SE MOVE: ele lê `vagas_fechadas`, o contador do   │
   * │ FECHAMENTO, e não as candidaturas.                                                         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ A CONCORRÊNCIA: TRAVA SÓ O DESTINO ───────────────────────────────────────────────────────┐
   * │ A origem apenas PERDE um ocupante, e perder ocupante não viola restrição nenhuma: não há o  │
   * │ que proteger lá. Travar as duas vagas abriria risco de DEADLOCK (duas trocas em sentidos    │
   * │ opostos travando na ordem inversa) sem comprar garantia alguma. O recurso disputado é a     │
   * │ vaga de DESTINO, e é a linha dela que serializa a disputa, como na aprovação.               │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async trocarVaga(
    candidaturaId: string,
    dto: TrocarVagaDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");

      // TRAVA 4 DESTA OPERAÇÃO: só candidatura VIVA troca. Quem já saiu do processo não tem vaga a
      // corrigir, tem processo a recomeçar, e para isso existe o "Trazer De Volta".
      if (!candidaturaViva(c.situacao)) {
        throw new ConflictException(
          "Esta candidatura já foi encerrada e não troca de vaga. Para trazer a pessoa de volta, use Trazer De Volta, que abre um processo novo.",
        );
      }

      if (c.vagaId === dto.vagaId) {
        throw new BadRequestException("Esta candidatura já está nesta vaga.");
      }

      // ── A LINHA DA VAGA DE DESTINO É TRAVADA ANTES DE QUALQUER CONTAGEM. Daqui até o fim da
      // transação, nenhuma outra aprovação ou troca nesta mesma vaga passa deste ponto.
      const [destino] = await tx
        .select({ id: vagas.id, status: vagas.status, posicoesOficiais: vagas.posicoesOficiais })
        .from(vagas)
        .where(eq(vagas.id, dto.vagaId))
        .for("update");
      if (!destino) throw new NotFoundException("Vaga de destino não encontrada.");

      // TRAVA 1: a vaga de destino recebe candidato? FECHADA, CANCELADA e ENTREGUE não recebem.
      if (!vagaRecebeCandidato(destino.status)) {
        throw new ConflictException(
          "Esta vaga não recebe candidato: ela está encerrada. Escolha uma vaga aberta.",
        );
      }

      /*
       * TRAVA 3, ANTES DO UNIQUE: a pessoa já tem candidatura VIVA na vaga de destino?
       *
       * O índice parcial `uq_as_candidaturas_viva` barraria isso de qualquer jeito, e é ele a
       * autoridade. A consulta existe para a frase: sem ela o consultor receberia um erro de banco
       * traduzido genericamente, em vez de "esta pessoa já está nesta vaga".
       */
      const [jaEsta] = await tx
        .select({ id: asCandidaturas.id })
        .from(asCandidaturas)
        .where(
          and(
            eq(asCandidaturas.candidatoId, c.candidatoId),
            eq(asCandidaturas.vagaId, dto.vagaId),
            inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
          ),
        );
      if (jaEsta) {
        throw new ConflictException(
          "Esta pessoa já está nesta vaga. Não dá para trocar para uma vaga em que ela já tem processo aberto.",
        );
      }

      /*
       * TRAVA 2: cabe mais um no destino? SÓ QUANDO A CANDIDATURA CONSOME POSIÇÃO.
       *
       * Candidatura ATIVO não ocupa nada (`consomePosicao`), então exigir posição livre para movê-la
       * repetiria o erro que a trava 1 existe para evitar: 40 currículos numa vaga de 10 é o normal
       * da operação, e travar a ENTRADA significaria só poder olhar 10 pessoas para escolher 10.
       * Quem consome posição passa pela mesma contagem da aprovação, e QUEM SÃO ELES NÃO SE DIGITA
       * AQUI: a contagem lê `SITUACOES_QUE_CONSOMEM_POSICAO`, a mesma lista de que `consomePosicao`
       * é derivada. Com a lista escrita à mão, a pergunta do `if` e a pergunta do SQL eram duas, e
       * bastava uma situação nova entrar em uma delas para a trava contar menos gente do que existe.
       *
       * ┌─ ESTA CONTAGEM AINDA É TOTAL, E A DA MUDANÇA DE SITUAÇÃO NÃO É MAIS. É deliberado ─────┐
       * │ A separação por lado de 08/09 alcançou `mudarSituacaoOcupandoPosicao`, que é onde os    │
       * │ dois defeitos foram MEDIDOS. Aqui, a troca de vaga (correção de Master) continua        │
       * │ medindo o TOTAL contra a meta oficial, e a consequência é conhecida e estreita: mover   │
       * │ para outra vaga alguém que está no BANCO pode ser recusado por uma meta oficial cheia,  │
       * │ mesmo que a vaga de destino tenha reserva sobrando. É uma RECUSA (fail-closed), nunca   │
       * │ uma posição a mais, e nenhuma linha em produção tem lado BANCO hoje.                    │
       * │                                                                                        │
       * │ NÃO FOI MEXIDO AQUI PORQUE ESTE CAMINHO NÃO TEM TESTE NENHUM e é código validado        │
       * │ (§A.26): a correção é a mesma de lá (contar com `group by posicao_lado`, ler            │
       * │ `posicoes_banco` do destino e usar `tetoDoLado` com `ladoDaCandidatura(c.posicaoLado)`),│
       * │ e ela está reportada ao coordenador para virar decisão do diretor, com teste junto.     │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (consomePosicao(c.situacao)) {
        const [{ ocupadas }] = await tx
          .select({ ocupadas: sql<number>`count(*)::int` })
          .from(asCandidaturas)
          .where(
            and(
              eq(asCandidaturas.vagaId, dto.vagaId),
              inArray(asCandidaturas.situacao, SITUACOES_QUE_CONSOMEM_POSICAO),
              // A exclusão é por segurança de borda: a candidatura ainda está na vaga ANTIGA neste
              // ponto, então ela não entraria nesta contagem de qualquer forma.
              ne(asCandidaturas.id, candidaturaId),
            ),
          );

        if (!cabeMaisUm(Number(ocupadas), destino.posicoesOficiais)) {
          if (destino.posicoesOficiais === null || destino.posicoesOficiais === undefined) {
            throw new ConflictException(
              "A vaga de destino ainda não tem o número de posições definido. Informe as posições dela antes de mover alguém já aprovado.",
            );
          }
          const n = destino.posicoesOficiais;
          throw new ConflictException(
            n === 1
              ? "A vaga de destino tem 1 posição e ela já está preenchida. Esta pessoa ocupa posição, então a troca deixaria a vaga acima do limite."
              : `A vaga de destino tem ${n} posições e as ${n} já estão preenchidas. Esta pessoa ocupa posição, então a troca deixaria a vaga acima do limite.`,
          );
        }
      }

      await tx
        .update(asCandidaturas)
        // A ETAPA NÃO ENTRA NESTE `set`, e é a garantia central da operação: quem estava na
        // Entrevista Cliente continua na Entrevista Cliente, na vaga certa.
        .set({ vagaId: dto.vagaId, atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, candidaturaId));

      /*
       * O RASTRO (opção b, decisão do diretor), na MESMA transação.
       *
       * É a única operação do módulo que muda a que VAGA a candidatura pertence, mantendo linha e
       * etapa. Sem o evento, uma correção de Master em dado VIVO não deixaria marca nenhuma, e daqui
       * a três meses ninguém saberia que a pessoa esteve em outra vaga.
       *
       * `etapaPara` RECEBE A ETAPA ATUAL, que não mudou: é o que deixa explícito na linha do tempo
       * que a troca NÃO mexeu na etapa.
       */
      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: null,
        etapaPara: c.etapa,
        situacao: null,
        vagaDe: c.vagaId,
        vagaPara: dto.vagaId,
        motivo: texto(dto.motivo),
        porId,
      });
    });

    return this.candidatura(candidaturaId);
  }

  /**
   * REGISTRAR SAÍDA, de QUALQUER etapa: DESCARTADO, DESISTIU ou ENVIADO_PARA_ADMISSAO.
   *
   * `ENVIADO_PARA_ADMISSAO` É A SAÍDA DIFERENTE e vai pelo caminho travado, porque ela consome posição como a
   * aprovação. `DESCARTADO` e `DESISTIU` liberam posição em vez de consumir, então não precisam da
   * trava: elas nunca fazem a vaga estourar.
   *
   * ┌─ QUEM ESCOLHE O CAMINHO É A RÉGUA, e não o nome da situação (achado do tester, 08/09) ─────┐
   * │ ERA `dto.situacao === "ENVIADO_PARA_ADMISSAO"`, uma comparação com um nome digitado, e o    │
   * │ perigo estava a UMA linha de distância: bastava alguém acrescentar `"ALOCADO"` à lista de   │
   * │ saídas, achando que unificava as rotas, para a alocação cair no `update` direto. Sem        │
   * │ `FOR UPDATE`, sem `cabeMaisUm`, sem lado e sem aceite: vaga de 5 aceitando 6 alocados, em   │
   * │ silêncio, porque a trava não teria sido burlada, apenas não consultada.                     │
   * │                                                                                            │
   * │ PERGUNTANDO A `ocupaPosicao` (que é `consomePosicao` com o tipo estreitado), toda situação   │
   * │ que consome posição entra no caminho travado SOZINHA, no dia em que for criada.             │
   * │                                                                                            │
   * │ HOJE A RESPOSTA É IDÊNTICA À DE ANTES, e é isso que faz disto correção sem mudança de       │
   * │ comportamento: das três saídas aceitas, só `ENVIADO_PARA_ADMISSAO` consome posição.         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async registrarSaida(
    candidaturaId: string,
    dto: RegistrarSaidaDto,
    porId: string,
  ): Promise<AsCandidaturaItem> {
    if (ocupaPosicao(dto.situacao)) {
      await this.mudarSituacaoOcupandoPosicao(
        candidaturaId,
        dto.situacao,
        texto(dto.motivo),
        porId,
      );
      return this.candidatura(candidaturaId);
    }

    const c = await this.db.query.asCandidaturas.findFirst({
      where: eq(asCandidaturas.id, candidaturaId),
    });
    if (!c) throw new NotFoundException("Candidatura não encontrada.");

    /*
     * A SAÍDA E O DESFECHO NO HISTÓRICO, NA MESMA TRANSAÇÃO. `etapaPara` recebe a etapa em que a
     * pessoa ESTAVA (`c.etapa`), e é isso que faz "descartado na Triagem" existir como frase: depois
     * desta gravação a etapa some da leitura viva da tela (peça P1), e sem o evento o lugar onde a
     * decisão foi tomada se perderia para sempre.
     */
    await this.db.transaction(async (tx) => {
      await tx
        .update(asCandidaturas)
        .set({ situacao: dto.situacao, motivoDescarte: texto(dto.motivo), atualizadoEm: new Date() })
        .where(eq(asCandidaturas.id, candidaturaId));

      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: null,
        etapaPara: c.etapa,
        situacao: dto.situacao,
        motivo: texto(dto.motivo),
        porId,
      });
    });

    return this.candidatura(candidaturaId);
  }

  /**
   * O CAMINHO TRAVADO, UM SÓ, para toda situação que ocupa posição da vaga.
   *
   * UM CAMINHO SÓ É DELIBERADO: duplicar a sequência lock/conta/decide para cada uma delas
   * garantiria que uma das cópias perderia a trava na primeira correção feita só na outra. A trava
   * mais importante do módulo mora em UM lugar.
   *
   * `ALOCADO` ENTROU NA ASSINATURA, e é por aqui que a finalização de posição vai passar quando a
   * rota dela existir (etapa 2). Um caminho novo que gravasse `ALOCADO` fora daqui reabriria
   * exatamente a corrida entre dois consultores que o `FOR UPDATE` do passo 2 existe para fechar,
   * e o comentário da `aprovar` descreve em 30 linhas por que uma consulta solta não resolve.
   */
  private async mudarSituacaoOcupandoPosicao(
    candidaturaId: string,
    novaSituacao: SituacaoQueOcupaPosicao,
    motivo: string | null,
    porId: string,
    posicao?: { lado: PosicaoLado; cienteBancoComOficiaisAbertas: boolean },
    /*
     * A EXIGÊNCIA DE CANDIDATURA VIVA É DO CHAMADOR, e nasce DESLIGADA de propósito.
     *
     * QUEM A LIGA HOJE: a finalização de posição e a APROVAÇÃO. A aprovação passou a ligá-la na
     * auditoria de 08/09, e o motivo está escrito na `aprovar`: sem ela, aprovar um DESCARTADO
     * ressuscitava a linha morta e pulava a ciência de reentrada, que é a conversa que a `alocar`
     * existe para ter.
     *
     * QUEM NÃO A LIGA: o avanço para a esteira (`registrarSaida` com `ENVIADO_PARA_ADMISSAO`), que
     * segue com a régua exata de antes. Ligá-la ali é mudança de comportamento em caminho já
     * validado e fora do recorte desta rodada, então virou proposta ao diretor, não código.
     *
     * DENTRO DA TRANSAÇÃO, E NÃO ANTES DELA: a leitura que decide é a mesma que já existe aqui, sob
     * a linha da vaga travada. Uma consulta solta em `finalizarPosicao` custaria uma ida a mais ao
     * banco para responder sobre um instante anterior ao da gravação.
     */
    opcoes?: { exigeCandidaturaViva: boolean },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");
      if (c.situacao === novaSituacao) {
        throw new ConflictException(
          "Esta candidatura já está nesta situação. Recarregue a página.",
        );
      }
      // TRAVA 5: quem saiu do processo não tem posição a entregar, tem processo a recomeçar, e o
      // recomeço passa pela `alocar`, que é onde a ciência de reentrada é pedida.
      if (opcoes?.exigeCandidaturaViva && !candidaturaViva(c.situacao)) {
        throw new ConflictException(
          "Esta candidatura já foi encerrada e não recebe posição. Para trazer a pessoa de volta, aloque-a de novo na vaga, que é onde o sistema mostra o motivo do encerramento anterior.",
        );
      }

      /*
       * ┌─ TRAVA 7: A ENTREGA NÃO ANDA PARA TRÁS, e esta vale para TODO chamador ────────────────┐
       * │ O CASO CONCRETO, medido na auditoria: aprovar alguém que já estava `ALOCADO`. A posição │
       * │ entregue virava posição apenas RESERVADA, `finalizadasOficial` CAÍA, o cilindro da tela │
       * │ esvaziava e a vaga que já tinha entregue tudo voltava a precisar de um Master para      │
       * │ fechar. Nada falhava, nada avisava, e o número simplesmente mudava.                     │
       * │                                                                                        │
       * │ POR QUE ELA NÃO É UMA OPÇÃO DO CHAMADOR, como a trava 5: porque não existe chamador     │
       * │ para quem desfazer uma entrega esteja certo. Deixá-la ligada por parâmetro seria pedir  │
       * │ que o próximo caminho novo lembrasse de ligá-la, e foi exatamente assim que a aprovação │
       * │ ficou sem a trava 5.                                                                   │
       * │                                                                                        │
       * │ A RÉGUA É `finalizaPosicao`, do vocabulário compartilhado, nos DOIS lados da pergunta:  │
       * │ recusa só quando a situação ATUAL entrega e a NOVA não entrega. Por construção ela não  │
       * │ alcança nenhum caminho legítimo de hoje: o avanço do alocado para a esteira entrega dos │
       * │ dois lados e passa, e aprovar quem está `ATIVO` não parte de entrega nenhuma.           │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      if (finalizaPosicao(c.situacao) && !finalizaPosicao(novaSituacao)) {
        throw new ConflictException(
          "Esta candidatura já entregou a posição da vaga, e a entrega não volta atrás por aqui. Se a pessoa saiu do processo, registre a saída dela.",
        );
      }

      // ── PASSO 2 DA TRAVA 4: a LINHA DA VAGA é travada ANTES de qualquer contagem. Daqui até o
      // fim da transação, nenhuma outra aprovação nesta mesma vaga passa deste ponto.
      const [vaga] = await tx
        .select({
          id: vagas.id,
          status: vagas.status,
          posicoesOficiais: vagas.posicoesOficiais,
          // A META DE BANCO entra na leitura porque ela é metade do teto: quem finaliza posição no
          // banco é medido contra oficiais mais banco (`tetoDoLado`).
          posicoesBanco: vagas.posicoesBanco,
        })
        .from(vagas)
        .where(eq(vagas.id, c.vagaId))
        .for("update");
      if (!vaga) throw new NotFoundException("Vaga não encontrada.");

      /*
       * ── PASSO 3: contar POR LADO, agora que a linha está travada.
       *
       * A CONTAGEM EXCLUI A PRÓPRIA CANDIDATURA, senão mover quem já estava aprovado contaria a
       * mesma pessoa duas vezes e seria recusado por ela mesma numa vaga cheia.
       *
       * A LISTA É A CONSTANTE `SITUACOES_QUE_CONSOMEM_POSICAO`, e esta é a cópia que mais custava
       * caro das cinco: é ESTA contagem que a trava 1 usa para decidir se ainda cabe alguém. Uma
       * situação nova que consumisse posição e não estivesse escrita aqui faria a vaga aceitar gente
       * a mais em silêncio, com a trava intacta e a conta errada.
       *
       * ┌─ POR QUE ELA VIROU UM `group by posicao_lado` (defeito MEDIDO, corrigido em 08/09) ────┐
       * │ ERA UM `count(*)` SEM LADO, e esse número único era medido contra DOIS tetos            │
       * │ diferentes. Na vaga real de homologação (5 oficiais, 20 de banco) isso produzia dois    │
       * │ erros ao mesmo tempo:                                                                  │
       * │   1. o AVISO do banco contava o total, então ele dizia 5, 4, 3, 2, 1 e SUMIA na quinta  │
       * │      alocação de banco, com as 5 oficiais ainda vazias;                                 │
       * │   2. com 20 no banco, o candidato do lado OFICIAL era medido em 20 contra 5 e recusado  │
       * │      com "as 5 posições já estão preenchidas", tendo ZERO posição oficial preenchida.   │
       * │      A vaga travava justamente para o que ela existe para fazer.                        │
       * │                                                                                        │
       * │ AGORA CADA LADO É MEDIDO CONTRA A OCUPAÇÃO DELE. Para as linhas de hoje nada muda: com  │
       * │ `posicao_lado` nulo em todas, `ocupadas.OFICIAL` é exatamente o `count(*)` de antes     │
       * │ (`ladoDaCandidatura` dobra o nulo em OFICIAL) e `ocupadas.BANCO` é zero.                │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const linhasOcupadas = await tx
        .select({
          lado: asCandidaturas.posicaoLado,
          quantas: sql<number>`count(*)::int`,
        })
        .from(asCandidaturas)
        .where(
          and(
            eq(asCandidaturas.vagaId, c.vagaId),
            inArray(asCandidaturas.situacao, SITUACOES_QUE_CONSOMEM_POSICAO),
            ne(asCandidaturas.id, candidaturaId),
          ),
        )
        .groupBy(asCandidaturas.posicaoLado);

      // O NULO NÃO VIRA UM TERCEIRO LADO: quem o dobra em OFICIAL é o domínio, em um lugar só.
      const ocupadas = ocupadasPorLado(linhasOcupadas);

      /*
       * ─ DE QUAL LADO DA META ESTA POSIÇÃO SAI ────────────────────────────────────────────────
       *
       * QUANDO A OPERAÇÃO ESCOLHE (a finalização de posição), vale a escolha do consultor. QUANDO
       * ELA NÃO ESCOLHE (a aprovação e o avanço para a esteira), vale o lado JÁ GRAVADO na
       * candidatura, e nulo vale `OFICIAL`.
       *
       * LER O LADO GRAVADO NÃO É ZELO, É O QUE IMPEDE UM BECO SEM SAÍDA: quem foi alocado no BANCO
       * de uma vaga com as oficiais cheias seria medido contra a meta oficial ao avançar para a
       * esteira, e o avanço seria recusado numa vaga que tem reserva de sobra. A pessoa ficaria
       * presa no estado em que entrou.
       *
       * HOJE A COLUNA É NULA EM TODAS AS LINHAS, então este bloco devolve `OFICIAL` para todo mundo
       * e a régua continua sendo exatamente a de antes. Ele só muda de resposta para as linhas que
       * a finalização com lado BANCO criar daqui para frente.
       */
      const lado: PosicaoLado = posicao?.lado ?? ladoDaCandidatura(c.posicaoLado);

      /*
       * O AVISO DO BANCO (decisão do diretor): ele AVISA e NÃO BLOQUEIA.
       *
       * Alocar no banco enquanto sobra posição OFICIAL é decisão legítima e cara de reverter, então
       * o consultor recebe o número na frente e decide. A ciência volta no corpo, como a da
       * reentrada, e a segunda chamada passa.
       *
       * SÓ VALE PARA A ESCOLHA EXPLÍCITA (`posicao` presente): quando o lado vem do que já está
       * gravado, a decisão já foi tomada e confirmada uma vez, e repetir o aviso a cada avanço da
       * mesma pessoa transformaria a confirmação em clique automático.
       */
      // A CONTA É SOBRE AS OFICIAIS, e não sobre o total: é o lado OFICIAL que continua aberto
      // quando alguém vai para o banco, e era o total que fazia o aviso sumir na quinta alocação.
      const oficiaisAbertas = oficiaisAindaAbertas(ocupadas.OFICIAL, vaga.posicoesOficiais);
      const guardaDoBancoDispara = posicao?.lado === "BANCO" && oficiaisAbertas > 0;
      if (guardaDoBancoDispara && !posicao.cienteBancoComOficiaisAbertas) {
        throw this.bancoComOficiaisAbertas(oficiaisAbertas);
      }

      /*
       * O QUE VAI PARA O LOG DE ACEITE, e ele só existe quando uma guarda foi DE FATO destravada.
       *
       * `cienteBancoComOficiaisAbertas` sozinho não basta como gatilho: um corpo montado fora da
       * tela pode mandar a ciência sempre, e registrar "aceite" onde o aviso nem apareceu encheria a
       * trilha de linhas que não descrevem decisão nenhuma. O gatilho é a guarda ter disparado
       * (`guardaDoBancoDispara`) E a ciência ter vindo, que é exatamente o caso em que o consultor
       * leu o número e passou por cima dele.
       */
      const aceiteRegistrado =
        guardaDoBancoDispara && posicao.cienteBancoComOficiaisAbertas
          ? // O NOME DA GUARDA VEM DO DOMÍNIO, e não é digitado aqui: é o mesmo nome de que o CHECK
            // do banco é derivado, e duas escritas do mesmo nome divergem na primeira guarda nova.
            { aceite: ACEITE_BANCO_COM_OFICIAIS_ABERTAS, aceiteNumero: oficiaisAbertas }
          : {};

      // ── PASSO 4: decidir, com a régua do domínio, e gravar. A ocupação medida é a DO LADO, contra
      // o teto DAQUELE lado: uma contagem e um teto que respondem sobre a mesma coisa.
      const teto = tetoDoLado(lado, vaga.posicoesOficiais, vaga.posicoesBanco);
      if (!cabeMaisUm(ocupadas[lado], teto)) {
        // META AUSENTE não é vaga cheia, é vaga sem meta: a frase precisa dizer o que fazer.
        if (vaga.posicoesOficiais === null || vaga.posicoesOficiais === undefined) {
          throw new ConflictException(
            "Esta vaga ainda não tem o número de posições definido. Informe as posições da vaga antes de aprovar.",
          );
        }
        /*
         * A TRAVA 1, com a frase que o diretor definiu para o lado OFICIAL, intocada.
         *
         * O LADO BANCO GANHA FRASE PRÓPRIA porque o teto dele é outro, e ela fala SÓ do número de
         * banco: com o teto próprio, quem é recusado na reserva de uma vaga de 5 oficiais e 20 de
         * banco esbarrou em 20, e citar os 5 oficiais mandaria o consultor conferir o campo errado.
         *
         * BANCO ZERO TEM FRASE PRÓPRIA porque é um problema diferente: não é reserva cheia, é
         * reserva que ninguém dimensionou, e "as 0 já estão preenchidas" não é português nem
         * instrução. Antes, o teto cumulativo deixava essa alocação consumir uma posição OFICIAL em
         * silêncio, que é justamente o que a separação por lado veio acabar.
         */
        const n = vaga.posicoesOficiais;
        if (lado === "BANCO") {
          const banco = vaga.posicoesBanco ?? 0;
          if (banco === 0) {
            throw new ConflictException(
              "Esta vaga não tem posição de banco reservada. Defina as posições de banco da vaga antes de alocar alguém na reserva.",
            );
          }
          throw new ConflictException(
            banco === 1
              ? "Esta vaga tem 1 posição de banco e ela já está preenchida. Aumente as posições de banco da vaga ou libere alguém."
              : `Esta vaga tem ${banco} posições de banco e as ${banco} já estão preenchidas. Aumente as posições de banco da vaga ou libere alguém.`,
          );
        }
        throw new ConflictException(
          n === 1
            ? "Esta vaga tem 1 posição e ela já está preenchida. Reprove alguém ou aumente as posições da vaga."
            : `Esta vaga tem ${n} posições e as ${n} já estão preenchidas. Reprove alguém ou aumente as posições da vaga.`,
        );
      }

      await tx
        .update(asCandidaturas)
        .set({
          situacao: novaSituacao,
          motivoDescarte: motivo ?? c.motivoDescarte,
          /*
           * O LADO SÓ É ESCRITO POR QUEM O ESCOLHEU, e é por isso que ele entra condicionalmente em
           * vez de sempre: a aprovação e o avanço para a esteira NÃO escolhem lado, e escrever
           * `OFICIAL` neles apagaria em silêncio o `BANCO` de quem já estava na reserva.
           */
          ...(posicao ? { posicaoLado: posicao.lado } : {}),
          atualizadoEm: new Date(),
        })
        .where(eq(asCandidaturas.id, candidaturaId));

      /*
       * O DESFECHO ENTRA NO HISTÓRICO DENTRO DA TRANSAÇÃO JÁ ABERTA, e portanto sob a mesma linha de
       * vaga travada da trava 4. Não há custo novo de concorrência: a transação existia, o insert só
       * entrou nela. Se a trava recusar, nada foi gravado, nem o estado nem o evento.
       *
       * ┌─ O ACEITE DO AVISO DE BANCO DEIXA LOG PERMANENTE (decisão do diretor, §A.3 regra 8) ───┐
       * │ ATÉ AQUI A CONFIRMAÇÃO ERA LIDA E JOGADA FORA. O consultor destravava a guarda mais     │
       * │ cara de desfazer do módulo (mandar alguém para a reserva com posição oficial em aberto) │
       * │ e não sobrava rastro nenhum de quem decidiu, quando, nem o que ele estava vendo.        │
       * │                                                                                        │
       * │ O EVENTO JÁ ERA GRAVADO AQUI: o que faltava era o QUALIFICADOR da decisão, não o        │
       * │ registro dela. Por isso o log estende esta linha em vez de abrir tabela nova, e por     │
       * │ isso ele nasce na mesma transação: ou o aceite e a mudança de situação existem os dois, │
       * │ ou não existe nenhum dos dois.                                                          │
       * │                                                                                        │
       * │ QUEM (`por_id`, usuário interno), QUANDO (`ocorrido_em`), O LADO (`posicao_lado`) e o   │
       * │ NÚMERO (`aceite_numero`: quantas posições oficiais estavam abertas no instante da       │
       * │ decisão). §A.6: nada de candidato, nada de CPF, nada de nome de pessoa, nada de URL.    │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      await tx.insert(asCandidaturaEtapas).values({
        candidaturaId,
        etapaDe: null,
        etapaPara: c.etapa,
        situacao: novaSituacao,
        motivo,
        porId,
        /*
         * O LADO SÓ ENTRA QUANDO ALGUÉM O ESCOLHEU, e pela mesma razão de a candidatura só o gravar
         * aí: a aprovação e o avanço para a esteira não escolhem lado, e carimbar `OFICIAL` neles
         * faria a linha do tempo afirmar uma decisão que ninguém tomou.
         */
        ...(posicao ? { posicaoLado: posicao.lado } : {}),
        ...aceiteRegistrado,
      });
    });
  }

  // ── O HISTÓRICO ───────────────────────────────────────────────────────────

  /**
   * Registrar contato. Pende da CANDIDATURA, nunca da pessoa: ver a tabela para o porquê.
   *
   * O CARIMBO DO ÚLTIMO CONTATO É ESCRITO AQUI, NA MESMA TRANSAÇÃO DO INSERT, e é o ajuste 1 do
   * diretor. Antes, o registro de contato não tocava a candidatura, e a coluna "último contato" da
   * listagem mostrava `atualizado_em`, que se move com etapa e com saída e NÃO se move com contato.
   *
   * NA MESMA TRANSAÇÃO porque as duas escritas são UM fato: contato gravado sem o carimbo faria a
   * listagem continuar mentindo, e carimbo sem o contato inventaria uma conversa que não existe no
   * histórico. Ou as duas, ou nenhuma.
   *
   * O CARIMBO SÓ ANDA PARA FRENTE (`greatest`), e isso importa porque `ocorrido_em` é a data do FATO,
   * não a da digitação: a ligação de ontem registrada hoje entra no histórico no lugar certo da linha
   * do tempo, mas NÃO pode puxar "falamos pela última vez em" para trás. Um `set` direto faria a
   * pessoa parecer mais fria do que está, que é justamente a leitura errada que a coluna existe para
   * evitar.
   *
   * `atualizado_em` NÃO É TOCADO, de propósito: são duas perguntas diferentes ("quando esta
   * candidatura andou" e "quando falamos com esta pessoa"), e responder as duas com um campo só
   * perderia uma delas.
   */
  async registrarContato(
    candidaturaId: string,
    dto: RegistrarContatoDto,
    registradoPorId: string,
  ): Promise<AsContatoItem> {
    const ocorridoEm = dto.ocorridoEm ? new Date(dto.ocorridoEm) : new Date();

    const contatoId = await this.db.transaction(async (tx) => {
      const c = await tx.query.asCandidaturas.findFirst({
        where: eq(asCandidaturas.id, candidaturaId),
      });
      if (!c) throw new NotFoundException("Candidatura não encontrada.");

      const [row] = await tx
        .insert(asContatos)
        .values({
          candidaturaId,
          tipo: dto.tipo,
          resumo: dto.resumo.trim(),
          ocorridoEm,
          registradoPorId,
        })
        .returning({ id: asContatos.id });

      await tx
        .update(asCandidaturas)
        .set({
          ultimoContatoEm: sql`greatest(coalesce(${asCandidaturas.ultimoContatoEm}, ${ocorridoEm.toISOString()}::timestamptz), ${ocorridoEm.toISOString()}::timestamptz)`,
        })
        .where(eq(asCandidaturas.id, candidaturaId));

      return row.id;
    });

    const [item] = await this.listarContatos(candidaturaId, contatoId);
    return item;
  }

  /**
   * A LINHA DO TEMPO DAS ETAPAS de uma candidatura (peça P3 do bug 1).
   *
   * DO MAIS ANTIGO PARA O MAIS NOVO, ao contrário do histórico de contato logo abaixo, e a diferença
   * é de leitura: contato se lê "o que houve por último", caminho se lê "por onde a pessoa passou",
   * que é uma narrativa e só faz sentido do começo.
   *
   * A ORDENAÇÃO FINAL É DO DOMÍNIO (`ordenarLinhaDoTempo`), e não só do `order by`. O banco ordena
   * por tempo; o domínio desempata os eventos do MESMO instante colocando a entrada antes do
   * desfecho. Sem isso, alocar e descartar no mesmo segundo (que é o caso da semente do backfill)
   * mostraria a saída antes da entrada em metade das vezes.
   *
   * O TIPO DE CADA EVENTO NÃO VEM DO BANCO: é derivado aqui, pela mesma função que o teste afirma.
   */
  async listarHistoricoEtapas(candidaturaId: string): Promise<AsCandidaturaEtapaItem[]> {
    /*
     * OS DOIS JOINS DE VAGA existem para a linha do tempo poder DIZER O NOME das vagas na troca, em
     * vez de mostrar dois identificadores. `leftJoin` nos dois porque as colunas são nulas em todo
     * evento que não é troca, e porque o `ON DELETE SET NULL` permite que a vaga tenha sumido sem o
     * evento sumir junto.
     */
    const vagaDe = alias(vagas, "vaga_de_join");
    const vagaPara = alias(vagas, "vaga_para_join");

    const linhas = await this.db
      .select({
        h: asCandidaturaEtapas,
        autor: usuarios.nome,
        vagaDeNome: vagaDe.nomeDivulgacao,
        vagaDeCodigo: vagaDe.codigo,
        vagaParaNome: vagaPara.nomeDivulgacao,
        vagaParaCodigo: vagaPara.codigo,
      })
      .from(asCandidaturaEtapas)
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturaEtapas.porId))
      .leftJoin(vagaDe, eq(vagaDe.id, asCandidaturaEtapas.vagaDe))
      .leftJoin(vagaPara, eq(vagaPara.id, asCandidaturaEtapas.vagaPara))
      .where(eq(asCandidaturaEtapas.candidaturaId, candidaturaId))
      .orderBy(asCandidaturaEtapas.ocorridoEm);

    const eventos = linhas.map((l) => ({
      id: l.h.id,
      candidaturaId: l.h.candidaturaId,
      etapaDe: l.h.etapaDe,
      etapaPara: l.h.etapaPara,
      situacao: l.h.situacao,
      motivo: l.h.motivo,
      porNome: l.autor,
      /*
       * ─ O LOG DO ACEITE SAI NA RESPOSTA (§A.3 regra 8: permanente E CONSULTÁVEL) ──────────────
       *
       * ERA GRAVA-E-ESQUECE. A consulta acima já seleciona a tabela INTEIRA, então estes três
       * campos sempre chegaram do banco, e este `map` os DESCARTAVA. O aceite existia só para quem
       * abrisse o banco à mão, e "permanente" sem "consultável" cumpre metade da regra.
       *
       * E A TELA JÁ PROMETIA O CONTRÁRIO, com estas palavras: "o aceite fica registrado no
       * histórico desta candidatura". Uma tela que promete trilha e não a exibe é pior do que
       * trilha nenhuma, porque quem confia nela para de conferir.
       *
       * §A.6: sai o NOME DA GUARDA, o LADO e um NÚMERO, e o autor sai do `por_id`, que é usuário
       * interno. Nenhum dado de candidato, nenhum CPF, nenhuma URL. É o mesmo recorte com que o
       * `esteira.service` devolve os aceites de passagem.
       */
      posicaoLado: l.h.posicaoLado,
      aceite: l.h.aceite,
      aceiteNumero: l.h.aceiteNumero,
      vagaDe: l.h.vagaDe,
      vagaPara: l.h.vagaPara,
      // O rótulo cai para o CÓDIGO quando não há nome de divulgação, e para "não informado" (§A.11)
      // quando a vaga foi apagada e o SET NULL levou o ponteiro.
      vagaDeRotulo: l.vagaDeNome ?? l.vagaDeCodigo ?? null,
      vagaParaRotulo: l.vagaParaNome ?? l.vagaParaCodigo ?? null,
      ocorridoEm: l.h.ocorridoEm,
    }));

    return ordenarLinhaDoTempo(eventos).map((e) => ({
      ...e,
      tipo: tipoDoEvento(e),
      ocorridoEm: e.ocorridoEm.toISOString(),
    }));
  }

  /**
   * O HISTÓRICO da candidatura, do mais recente para o mais antigo pelo que ACONTECEU (`ocorrido_em`),
   * e não pelo que foi digitado: ligação de ontem registrada hoje aparece no lugar dela na linha do
   * tempo, que é o que faz o histórico ser lido como história.
   */
  async listarContatos(candidaturaId: string, apenasId?: string): Promise<AsContatoItem[]> {
    const filtros = [eq(asContatos.candidaturaId, candidaturaId)];
    if (apenasId) filtros.push(eq(asContatos.id, apenasId));

    const linhas = await this.db
      .select({
        c: asContatos,
        autor: usuarios.nome,
      })
      .from(asContatos)
      .leftJoin(usuarios, eq(usuarios.id, asContatos.registradoPorId))
      .where(and(...filtros))
      .orderBy(desc(asContatos.ocorridoEm));

    return linhas.map(({ c, autor }) => ({
      id: c.id,
      candidaturaId: c.candidaturaId,
      tipo: c.tipo,
      resumo: c.resumo,
      ocorridoEm: c.ocorridoEm.toISOString(),
      registradoPorNome: autor,
      criadoEm: c.criadoEm.toISOString(),
    }));
  }

  // ── O PAINEL DA VAGA ──────────────────────────────────────────────────────

  /**
   * A OCUPAÇÃO DE UMA VAGA, calculada na hora, mais quem está nela.
   *
   * ESTA É A LEITURA, e ela NÃO é a trava. A trava conta de novo, dentro da transação e com a linha
   * travada, e é assim de propósito: o número que a tela mostra é uma fotografia de um instante, e
   * decidir a partir de uma fotografia é exatamente o defeito que a trava 4 existe para impedir.
   */
  async painelVaga(vagaId: string): Promise<AsPainelVaga> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");

    const candidaturas = await this.candidaturasDaVaga(vagaId);

    /*
     * O LADO DE CADA CANDIDATURA VEM DE UMA LEITURA PRÓPRIA, e não da lista acima, porque
     * `AsCandidaturaItem` (o que a tela recebe) não carrega `posicao_lado`: acrescentá-lo ali é
     * mudança de contrato, e o contrato não é deste caminho.
     *
     * A CONSULTA A MAIS CUSTA UMA IDA AO BANCO, e é o painel de UMA vaga, com dezenas de linhas.
     * O caso caro é a LISTAGEM, e lá o lado entrou no `group by` que já existia, sem consulta nova
     * (`vagas.service.ocupacaoPorVaga`).
     *
     * §A.6: duas colunas de processo. Nenhum dado de candidato sai desta consulta.
     */
    const lados = await this.db
      .select({
        situacao: asCandidaturas.situacao,
        posicaoLado: asCandidaturas.posicaoLado,
      })
      .from(asCandidaturas)
      .where(eq(asCandidaturas.vagaId, vagaId));

    const derivada = ocupacaoDaVaga(vaga.posicoesOficiais, lados);

    const ocupacao: AsOcupacaoVaga = {
      vagaId,
      posicoesOficiais: vaga.posicoesOficiais,
      ...derivada,
    };
    return { ocupacao, candidaturas };
  }

  // ── LEITURAS INTERNAS ─────────────────────────────────────────────────────

  private async candidatura(id: string): Promise<AsCandidaturaItem> {
    const [item] = await this.candidaturasPor(eq(asCandidaturas.id, id));
    if (!item) throw new NotFoundException("Candidatura não encontrada.");
    return item;
  }

  private candidaturasDoCandidato(candidatoId: string): Promise<AsCandidaturaItem[]> {
    return this.candidaturasPor(eq(asCandidaturas.candidatoId, candidatoId));
  }

  private candidaturasDaVaga(vagaId: string): Promise<AsCandidaturaItem[]> {
    return this.candidaturasPor(eq(asCandidaturas.vagaId, vagaId));
  }

  /**
   * A leitura das candidaturas com a pessoa, a vaga e o autor JÁ RESOLVIDOS em nome, em uma consulta.
   *
   * §A.6: esta consulta NÃO seleciona o CPF, mesmo tendo a tabela do candidato disponível pelo join.
   * O nome basta para a tela da candidatura, e o que não é selecionado não tem como vazar.
   */
  private async candidaturasPor(filtro: ReturnType<typeof eq>): Promise<AsCandidaturaItem[]> {
    const linhas = await this.db
      .select({
        c: asCandidaturas,
        candidatoNome: asCandidatos.nome,
        vagaCodigo: vagas.codigo,
        vagaNome: vagas.nomeDivulgacao,
        autor: usuarios.nome,
      })
      .from(asCandidaturas)
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturas.alocadoPorId))
      .where(filtro)
      .orderBy(desc(asCandidaturas.alocadoEm));

    return linhas.map(({ c, ...l }) => ({
      id: c.id,
      candidatoId: c.candidatoId,
      candidatoNome: l.candidatoNome,
      vagaId: c.vagaId,
      vagaCodigo: l.vagaCodigo,
      vagaNome: l.vagaNome,
      etapa: c.etapa,
      situacao: c.situacao,
      motivoDescarte: c.motivoDescarte,
      alocadoEm: c.alocadoEm.toISOString(),
      alocadoPorNome: l.autor,
      atualizadoEm: c.atualizadoEm.toISOString(),
      // O CARIMBO DESNORMALIZADO, e é ele que mata o N+1: a alternativa seria um `max(ocorrido_em)`
      // de `as_contatos` POR LINHA, e com 200 linhas na tela isso é uma consulta por linha.
      ultimoContatoEm: c.ultimoContatoEm ? c.ultimoContatoEm.toISOString() : null,
    }));
  }

  // ── HIGIENE ───────────────────────────────────────────────────────────────

  /**
   * CPF normalizado, ou `null` quando não veio. Vazio é caso NORMAL aqui (a pessoa ainda não deu o
   * número), mas CPF PREENCHIDO E INVÁLIDO é erro: gravar onze dígitos quaisquer faria o dedup casar
   * a identidade errada, que é pior do que não casar.
   *
   * O VALIDADOR É O DO SHARED-TYPES (`isValidCpf`), o mesmo do resto do sistema. Não existe um
   * segundo validador de CPF neste módulo, e não deve existir: dois validadores divergem.
   *
   * §A.6: a mensagem NÃO REPETE O NÚMERO recebido, senão o dado pessoal viajaria na resposta de erro
   * e, dali, para qualquer log de cliente HTTP.
   */
  private cpfOuNulo(bruto?: string | null): string | null {
    const cpf = normalizeCpf(bruto ?? "");
    if (!cpf) return null;
    if (!isValidCpf(cpf)) {
      throw new BadRequestException("O CPF não confere. Confira os dígitos e informe de novo.");
    }
    return cpf;
  }

  /**
   * O CONFLITO DE CPF, com o `candidatoId` de quem já está cadastrado para a tela poder oferecer
   * "abrir o cadastro existente" em vez de deixar a pessoa procurando.
   *
   * §A.6: devolve o id e o NOME, nunca o CPF. A frase mais natural de escrever aqui seria "o CPF
   * 123.456.789-01 já está cadastrado", e ela colocaria o número na resposta de erro, que é o lugar
   * de onde ele mais facilmente cai num log.
   */
  private conflitoDeCpf(candidatoId: string, nome: string): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: "Conflict",
      message: `Já existe um candidato cadastrado com este CPF: ${nome}. Abra o cadastro dele em vez de criar outro.`,
      candidatoId,
    });
  }

  /**
   * A RECUSA DA PRIMEIRA TENTATIVA DE REENTRADA, com o que o consultor precisa para decidir.
   *
   * `needsConfirmation: true`, E A SIMETRIA COM A TRAVA DE ENCERRAMENTO DA VAGA É DE PROPÓSITO: lá o
   * campo é `false`, porque não existe "confirmar mesmo assim" (a vaga não fecha com gente em seleção
   * dentro). Aqui é `true`, porque existe. O campo diz a verdade sobre o que a tela pode oferecer, e
   * é por isso que ele não é sempre `true` nem sempre `false`.
   *
   * A MENSAGEM DIZ QUANDO E COMO, e não só "esta pessoa já esteve aqui". Descartada há uma semana por
   * perfil não aderente e desistente de seis meses atrás são decisões diferentes, e quem decide é o
   * consultor: sem a data e o motivo na frente dele, o aviso vira um clique automático.
   *
   * O CARIMBO É `atualizado_em` DA CANDIDATURA ANTERIOR, que é o momento em que a saída foi
   * registrada. Não existe coluna própria de "encerrada em" nesta tabela, e criar uma não estava no
   * pedido: quando existir, é só ela que muda de lugar aqui.
   *
   * §A.6: situação, data e motivo. SEM CPF, sem e-mail, sem telefone. O motivo é texto do PROCESSO
   * ("perfil não aderente"), escrito no descarte, e não ficha da pessoa.
   */
  private reentradaPrecisaCiencia(anterior: {
    situacao: CandidaturaSituacao;
    motivo: string | null;
    encerradaEm: Date | null;
  }): ConflictException {
    const situacao = anterior.situacao as AsCandidaturaEncerrada["situacao"];
    const quando = anterior.encerradaEm ? dataBr(anterior.encerradaEm) : null;

    const comoEQuando =
      situacao === "DESISTIU"
        ? `desistiu desta vaga${quando ? ` em ${quando}` : ""}`
        : `foi descartada desta vaga${quando ? ` em ${quando}` : ""}`;
    // PONTUAÇÃO FINAL DO MOTIVO REMOVIDA antes de emendar a frase: o motivo é texto livre digitado no
    // descarte e costuma terminar em ponto, o que produzia "próxima abertura.. A reentrada".
    const motivo = anterior.motivo?.replace(/[.;,\s]+$/, "") ?? null;
    const porque = motivo ? `, com o motivo registrado: ${motivo}` : ", sem motivo registrado";

    const corpo: AsReentradaPrecisaCiencia = {
      needsConfirmation: true,
      reason: "reentradaAposEncerramento",
      message:
        `Esta pessoa já ${comoEQuando}${porque}. ` +
        "A reentrada é permitida e o processo anterior fica no histórico. " +
        "Confirme que está ciente para alocar de novo.",
      anterior: {
        situacao,
        encerradaEm: anterior.encerradaEm ? anterior.encerradaEm.toISOString() : null,
        motivo: anterior.motivo,
      },
    };

    return new ConflictException(corpo);
  }

  /**
   * O AVISO DE ALOCAR NO BANCO COM POSIÇÃO OFICIAL AINDA ABERTA.
   *
   * `needsConfirmation: true`, e a simetria com o aviso de reentrada logo acima é de propósito: a
   * tela lê o mesmo campo para saber se pode oferecer "confirmar mesmo assim". Aqui é `true` porque
   * existe confirmação; na trava de encerramento da vaga é `false`, porque lá não existe. O campo
   * diz a verdade sobre o que a tela pode oferecer, e é por isso que ele não é sempre um dos dois.
   *
   * A FRASE DIZ O NÚMERO, e não só "ainda há posição oficial aberta": sobrar UMA posição e sobrarem
   * DOZE são decisões diferentes, e sem o número na frente o aviso vira clique automático. É a mesma
   * razão de o aviso de reentrada trazer a data e o motivo.
   *
   * §A.6: um número de posições da vaga e mais nada. Nenhum dado de candidato entra aqui.
   */
  private bancoComOficiaisAbertas(abertas: number): ConflictException {
    const quantas =
      abertas === 1 ? "1 posição oficial aberta" : `${abertas} posições oficiais abertas`;
    return new ConflictException({
      needsConfirmation: true,
      reason: "bancoComOficiaisAbertas",
      message:
        `Esta vaga ainda tem ${quantas}. ` +
        "Alocar no banco deixa a posição oficial em aberto. " +
        "Confirme que é isso mesmo que você quer.",
      oficiaisAbertas: abertas,
    });
  }

  /**
   * A VIOLAÇÃO DE UNIQUE virando frase de gente. É o que faz a corrida entre dois cliques chegar na
   * tela como explicação, e não como erro 500.
   *
   * §A.6: a mensagem do Postgres NÃO é repassada. Ela traz o VALOR que violou o índice (o CPF, no
   * caso de `uq_as_candidatos_cpf`), e repassá-la publicaria o número na resposta de erro.
   */
  private traduzirUnique(err: unknown): Error {
    const nome = String((err as { constraint_name?: string })?.constraint_name ?? "");
    if (nome === "uq_as_candidatos_cpf") {
      return new ConflictException(
        "Já existe um candidato cadastrado com este CPF. Recarregue a página e procure por ele.",
      );
    }
    // A FRASE CONTINUA CORRETA depois da troca pelo unique PARCIAL: o índice só existe para as
    // situações VIVAS, então violá-lo quer dizer exatamente que a pessoa JÁ ESTÁ na vaga, e não que
    // ela um dia esteve. O caso do "esteve" nunca chega aqui: ele é decidido antes, com o aviso.
    if (nome === "uq_as_candidaturas_viva") {
      return new ConflictException("Esta pessoa já está nesta vaga.");
    }
    if (nome === "uq_as_candidatos_id_candidate_pandape") {
      return new ConflictException("Já existe um candidato com este código do Pandapé.");
    }
    if (nome === "uq_as_candidaturas_id_match_pandape") {
      return new ConflictException("Já existe uma candidatura com este código de match do Pandapé.");
    }
    return err instanceof Error ? err : new Error("Falha ao gravar.");
  }
}

/**
 * A DATA COMO O CONSULTOR LÊ, no fuso de São Paulo.
 *
 * FUSO EXPLÍCITO, e não o do processo: o backend roda em UTC, e "25/08 às 21h" viraria 26/08 na
 * frase. Um dia de diferença no aviso muda a leitura de "foi ontem" para "foi anteontem".
 */
function dataBr(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Texto opcional: em branco é ausência, não string vazia gravada no banco. */
function texto(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Minúsculas sem acento, para a busca por nome casar "joao" com "João". */
function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
