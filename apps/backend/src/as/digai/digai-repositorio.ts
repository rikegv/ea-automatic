import { Inject, Injectable } from "@nestjs/common";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import type { LinhaDeParaEtapaExternaCrua } from "../../domain/as-etapa-externa";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import { EtapasFunilService } from "../etapas/etapas-funil.service";

/**
 * ─ O LADO DO BANCO DA INGESTAO DO DIGAI: O UNICO PONTO EM QUE ELA ESCREVE ──────────────────────
 *
 * ┌─ POR QUE O DIGAI TEM REPOSITORIO PROPRIO, E NAO REUSA O DO PANDAPE (secao A.26) ─────────────┐
 * │ `ingestao-repositorio.ts` e codigo JA VALIDADO e em producao, e o `deParaEtapa` dele FIXA     │
 * │ `fonte = 'PANDAPE'` dentro do SQL (linha 131). Parametrizar aquela consulta alcancaria a      │
 * │ varredura do Pandape inteira por um ganho de dez linhas, que e exatamente o tipo de alcance    │
 * │ que a secao A.26 manda perguntar antes. Este arquivo usa as MESMAS TABELAS e o MESMO dominio,  │
 * │ e nao toca em uma linha daquele.                                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ TODO `insert` TEM LISTA NOMINAL DE COLUNAS, E NUNCA ESPALHAMENTO DO OBJETO ─────────────────┐
 * │ E o que mantem `banco_talentos` FORA DO ALCANCE da ingestao: aquela coluna concede RETENCAO   │
 * │ PERPETUA a uma pessoa, o unico escritor dela e `aplicarRetencao` (com cadeado de SUPER_ADMIN e │
 * │ trilha), e a proibicao so e exequivel enquanto a coluna nao for citada em insert nenhum. Um    │
 * │ espalhamento a concederia a 12.445 pessoas no dia em que alguem acrescentasse a chave ao       │
 * │ objeto, sem nada falhar.                                                                       │
 * │                                                                                                │
 * │ `criado_por_id` FICA NULO, e isso e a verdade: nao houve autor humano. Um "usuario de sistema" │
 * │ ja esta VETADO nesta casa, e faria a trilha afirmar que ALGUEM cadastrou quem ninguem          │
 * │ cadastrou.                                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum metodo daqui loga. As excecoes dizem o que aconteceu, sem citar o valor.
 */
@Injectable()
export class DigaiRepositorio {
  /** A fonte externa desta ingestao, do vocabulario FECHADO. `Digai` e `digai` seriam outras duas. */
  private static readonly FONTE = "DIGAI";

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly vagaStatus: VagaStatusService,
    private readonly etapas: EtapasFunilService,
  ) {}

  // ── LEITURA ──────────────────────────────────────────────────────────────────────────────────

  /**
   * O DE/PARA, ja filtrado por fonte `DIGAI` e por `ativo`.
   *
   * Desligar uma linha e o gesto que o diretor tem para dizer "pare de confiar nesta traducao", e
   * uma leitura que ignorasse o flag transformaria esse gesto em nada.
   */
  async deParaEtapa(chave: string): Promise<LinhaDeParaEtapaExternaCrua | null> {
    const linhas = (await this.db.execute(sql`
      select etapa_codigo, situacao, motivo_padrao, ativo
        from as_depara_etapa_externa
       where fonte = ${DigaiRepositorio.FONTE} and chave_externa = ${chave} and ativo = true
       limit 1
    `)) as unknown as {
      etapa_codigo: string | null;
      situacao: string | null;
      motivo_padrao: string | null;
      ativo: boolean;
    }[];
    const l = linhas[0];
    if (!l) return null;
    return {
      etapaCodigo: l.etapa_codigo,
      situacao: (l.situacao ?? null) as LinhaDeParaEtapaExternaCrua["situacao"],
      motivoPadrao: l.motivo_padrao,
      ativo: l.ativo,
    };
  }

  /** A pessoa que ja tem identidade do Digai. Chave: o par (fonte, identificador). */
  async candidatoPorIdentidade(identificador: string): Promise<{ id: string } | null> {
    const linhas = (await this.db.execute(sql`
      select candidato_id from as_identidades_externas
       where fonte = ${DigaiRepositorio.FONTE} and identificador = ${identificador}
       limit 1
    `)) as unknown as { candidato_id: string }[];
    const achada = linhas[0];
    return achada ? { id: achada.candidato_id } : null;
  }

  /**
   * ─ O DESEMPATE SECUNDARIO, E ELE E FAIL-CLOSED EM DUAS FRENTES ────────────────────────────────
   *
   * 1. DOCUMENTO INVALIDO NAO DESEMPATA. Um lixo repetido no ATS (`00000000000`) casaria pessoas
   *    DIFERENTES entre si, e fusao de fichas e irreversivel: o que se junta por engano nao se
   *    separa depois, porque ninguem sabe mais qual candidatura era de quem.
   * 2. FICHA JA ANONIMIZADA NAO E ALVO. O expurgo nula o documento, entao ela nao casaria de
   *    qualquer jeito; a clausula e a segunda fechadura, e esta escrita para ser lida junto da
   *    guarda do `update` mais abaixo.
   *
   * ┌─ O QUE ESTA GUARDA NAO FAZ, e o texto anterior deixava isso no ar (ressalva 3, 29/09) ─────┐
   * │ Ela protege contra REESCRITA, e nao contra RECOLETA. O expurgo APAGA as linhas de           │
   * │ `as_identidades_externas` junto com a anonimizacao, entao a pessoa ja expurgada nao casa    │
   * │ nem por identidade nem por documento: uma candidatura NOVA vinda do Digai a RECRIA como     │
   * │ ficha nova, com nome, e-mail e telefone completos, e o relogio de retencao recomeca do zero.│
   * │                                                                                             │
   * │ ISSO E O COMPORTAMENTO ACEITO, e nao um defeito escondido: e o mesmo do Pandape, ja         │
   * │ validado, e a razao e de base legal, nao de codigo. Quem se candidata de novo entrega o     │
   * │ dado de novo, e a coleta nova tem finalidade propria. O que NAO pode acontecer, e e o que a │
   * │ clausula garante, e o dado voltar para a ficha ANTIGA, desfazendo o expurgo sem que ninguem │
   * │ tenha se candidatado a nada.                                                                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async candidatoPorDocumento(valor: string): Promise<{ id: string } | null> {
    const limpo = documentoParaBanco(valor);
    if (limpo === null) return null;
    const linhas = (await this.db.execute(sql`
      select id from as_candidatos
       where cpf = ${limpo} and anonimizado_em is null
       limit 1
    `)) as unknown as { id: string }[];
    const achada = linhas[0];
    return achada ? { id: achada.id } : null;
  }

  // ── ESCRITA ──────────────────────────────────────────────────────────────────────────────────

  /**
   * ─ A PESSOA NOVA. `origem = 'DIGAI'` SO AQUI, E NUNCA NA ATUALIZACAO ──────────────────────────
   *
   * A origem nao e dado que veio no registro: e a ASSINATURA DE QUEM ESTA ESCREVENDO. Sem esta
   * linha, a base juraria que os cadastros foram feitos a mao (`MANUAL` e o default da coluna), e a
   * pergunta "de onde veio esta pessoa" passaria a ter resposta errada.
   *
   * NA ATUALIZACAO ELA NAO ENTRA, e a assimetria e deliberada: quem foi cadastrado a mao, ou veio
   * do Pandape, e depois apareceu no Digai continua tendo a origem que teve. Reescrever a origem
   * apagaria o fato. E a mesma assimetria de `ingestao-repositorio.ts:227`.
   */
  async criarCandidato(dados: {
    nome: string;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
  }): Promise<{ id: string }> {
    const linhas = (await this.db.execute(sql`
      insert into as_candidatos (nome, cpf, email, telefone, origem)
      values (
        ${dados.nome.trim()},
        ${documentoParaBanco(dados.cpf)},
        ${textoOuNulo(dados.email)},
        ${textoOuNulo(dados.telefone)},
        'DIGAI'
      )
      returning id
    `)) as unknown as { id: string }[];
    const criada = linhas[0];
    if (!criada) throw new Error("O cadastro pela ingestao do Digai nao devolveu linha.");
    return { id: criada.id };
  }

  /**
   * ─ A ATUALIZACAO DA PESSOA, E AQUI MORA O VETO A DO `seguranca` ───────────────────────────────
   *
   * ┌─ A PROTECAO CONTRA "A EDICAO TRAZ DE VOLTA DADO APAGADO" NAO E PROPRIEDADE DO `editar` ─────┐
   * │ Ela e a MESMA CLAUSULA, repetida A MAO em cada escritor de `as_candidatos`. Nao ha guarda no │
   * │ schema, nao ha trigger. Ate 29/09/2026 eram TRES escritores (`candidatos.service.ts:372,420, │
   * │ 430` e `ingestao-repositorio.ts:239,257`), e A INGESTAO DO DIGAI E O QUARTO. Nascer sem a    │
   * │ clausula faria o furo renascer na primeira linha.                                            │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ SAO DUAS METADES, E NENHUMA BASTA SOZINHA ─────────────────────────────────────────────────┐
   * │ 1. `and anonimizado_em is null` NO `where`: e a que vale contra a CORRIDA, porque leitura e  │
   * │    escrita nao sao atomicas e a varredura de retencao roda sozinha;                          │
   * │ 2. ZERO LINHA AFETADA VIRANDO RECUSA EXPLICITA: a clausula sozinha seria PIOR do que nada,   │
   * │    porque atualizaria zero linhas EM SILENCIO e o chamador seguiria em frente pendurando uma │
   * │    candidatura nova numa ficha expurgada.                                                     │
   * │                                                                                               │
   * │ E ZERO LINHA TEM DUAS CAUSAS, QUE NAO SAO A MESMA COISA: reentrega identica (o normal, e o    │
   * │ que a escrita condicional existe para produzir) ou ficha anonimizada (recusa). Distinguir     │
   * │ custa uma leitura e e o que impede a segunda de passar por sucesso.                           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A ESCRITA E CONDICIONAL DE VERDADE, no SQL e nao num `if` do TypeScript: a reentrega que nao
   * muda nada NAO pode escrever, senao cada volta empurra `atualizado_em`, que e insumo do relogio
   * do expurgo, e ninguem que a ingestao tocar expira mais.
   */
  async atualizarCandidato(
    id: string,
    dados: { nome: string; cpf: string | null; email: string | null; telefone: string | null },
  ): Promise<{ linhasAfetadas: number }> {
    const alvo = id.trim();
    if (alvo === "") throw new Error("Atualizacao de candidato sem linha alvo.");
    const valorNome = dados.nome.trim();
    const doc = documentoParaBanco(dados.cpf);
    const correio = textoOuNulo(dados.email);
    const fone = textoOuNulo(dados.telefone);

    /*
     * ─ NOME VAZIO NAO APAGA O NOME, E ESSA E A RESSALVA D2 DO `seguranca` (29/09) ───────────────
     *
     * Antes, o chamador so chamava este metodo QUANDO havia nome, e por isso a guarda de
     * anonimizacao NUNCA rodava no caso do nome vazio: o fluxo seguia direto para a candidatura,
     * pendurando linha VIVA numa ficha possivelmente anonimizada. Candidatura viva em vaga nao
     * encerrada PROTEGE a pessoa do expurgo, entao o efeito era desfazer o expurgo pelo lado.
     *
     * A correcao e chamar SEMPRE, e para isso o nome vazio precisa ser inofensivo aqui: o
     * `nullif` mais `coalesce` faz o vazio significar "nao tenho o que dizer sobre o nome", e nunca
     * "apague o nome". A mesma expressao vai na comparacao, senao a escrita condicional acharia
     * diferenca onde nao ha e empurraria `atualizado_em`, que e o relogio do expurgo.
     */
    const linhas = (await this.db.execute(sql`
      update as_candidatos
         set nome = coalesce(nullif(${valorNome}, ''), nome),
             cpf = coalesce(${doc}, cpf),
             email = coalesce(${correio}, email),
             telefone = coalesce(${fone}, telefone),
             atualizado_em = now()
       where id = ${alvo}::uuid
         and anonimizado_em is null
         and (nome, cpf, email, telefone)
             is distinct from (
               coalesce(nullif(${valorNome}, ''), nome),
               coalesce(${doc}, cpf),
               coalesce(${correio}, email),
               coalesce(${fone}, telefone)
             )
      returning id
    `)) as unknown as { id: string }[];
    if (linhas.length > 0) return { linhasAfetadas: 1 };

    const anonimizada = (await this.db.execute(sql`
      select 1 as marca from as_candidatos
       where id = ${alvo}::uuid and anonimizado_em is not null
    `)) as unknown as { marca: number }[];
    if (anonimizada.length > 0) {
      throw new Error(
        "Cadastro anonimizado pela retencao: a ingestao do Digai nao regrava dado pessoal.",
      );
    }
    return { linhasAfetadas: 0 };
  }

  /**
   * A IDENTIDADE EXTERNA E IMUTAVEL: existindo o par (fonte, identificador), nada e reescrito.
   *
   * Reescrever moveria a identidade de uma pessoa para outra em silencio, que e a fusao que o
   * registro de conflito existe para impedir.
   *
   * `coletado_em` EXPLICITO, e nao o `default now()`: e este carimbo que responde, a um titular que
   * perguntar, ha quanto tempo o dado existe aqui. Deixar o default responder faria a linha jurar
   * que a coleta aconteceu no dia em que a carga rodou.
   *
   * ┌─ A CLAUSULA DE ANONIMIZACAO, RESSALVA D1 DO `seguranca` (29/09) ─────────────────────────────┐
   * │ Este era o UNICO insert do modulo sem `anonimizado_em is null`. Entre a leitura que escolheu │
   * │ a pessoa e esta escrita ha uma janela, e a varredura de retencao roda sozinha nela: a linha  │
   * │ de identidade externa que o expurgo acabou de apagar renascia, apontando para uma ficha      │
   * │ anonimizada. E auto-curavel (a proxima varredura apaga de novo), e a guarda custa uma        │
   * │ clausula, entao nao ha razao para deixar a janela aberta.                                     │
   * │                                                                                               │
   * │ O `insert ... select ... where exists` e o que torna a condicao ATOMICA com a escrita. Um     │
   * │ `if` em TypeScript antes do insert seria a mesma corrida com mais linhas.                     │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async anexarIdentidade(candidatoId: string, identificador: string, em: Date): Promise<void> {
    await this.db.execute(sql`
      insert into as_identidades_externas (candidato_id, fonte, identificador, coletado_em)
      select
        ${candidatoId}::uuid,
        ${DigaiRepositorio.FONTE},
        ${identificador},
        ${em.toISOString()}::timestamptz
      where exists (
        select 1 from as_candidatos
         where id = ${candidatoId}::uuid and anonimizado_em is null
      )
      on conflict (fonte, identificador) do nothing
    `);
  }

  /**
   * O CONFLITO IDENTIDADE CONTRA DOCUMENTO: uma linha por caso, sem documento e sem nome.
   *
   * O ciclo NAO ESCOLHE e NAO FUNDE, e nao escolher SEM AVISAR seria perder a pessoa a cada volta
   * sem ninguem saber que ha um caso a resolver. Os dois ids tecnicos bastam a quem for resolver, e
   * nenhum dado pessoal novo e criado para isso. A chave de conflito e o que impede um caso
   * irresolvido de virar uma linha nova a cada entrega.
   */
  async registrarConflito(candidatoId: string, identificador: string): Promise<void> {
    await this.db.execute(sql`
      insert into as_ingestao_conflitos (candidato_id, fonte, identificador)
      values (${candidatoId}::uuid, ${DigaiRepositorio.FONTE}, ${identificador})
      on conflict (fonte, identificador) do nothing
    `);
  }

  /**
   * ─ A VAGA ESPELHADA, QUE CONVERGE COM A DO PANDAPE PELA MESMA CHAVE ───────────────────────────
   *
   * O `partnerJobId` do Digai E o id da vaga do Pandape (confirmado pelo Ivan), entao a busca e por
   * `vagas.id_vacancy_pandape` e as duas ingestoes chegam na MESMA LINHA. Coluna propria do Digai
   * duplicaria a vaga e dividiria as candidaturas entre as duas sem ninguem notar.
   *
   * NAO ADOTA E NAO SOBRESCREVE. Existindo vaga com aquele numero, ela e REUSADA como esta: o
   * Digai nao tem titulo, cidade nem numero de posicoes para oferecer, entao nao ha o que atualizar
   * e escrever qualquer coisa ali apagaria o que o Pandape ou uma pessoa colocou.
   *
   * O STATUS VEM DO PAPEL, e nunca de um literal: o CODIGO e editavel pelo diretor e a FK de
   * `vagas.status` e RESTRICT, entao um `'PENDENTE_REVISAO'` gravado direto pararia de valer no dia
   * em que o catalogo fosse renomeado, derrubando a ingestao inteira.
   */
  async espelharVaga(idVacancyPandape: string): Promise<{ id: string }> {
    const existentes = (await this.db.execute(sql`
      select id from vagas where id_vacancy_pandape = ${idVacancyPandape} limit 1
    `)) as unknown as { id: string }[];
    const existente = existentes[0];
    if (existente) return { id: existente.id };

    const regua = await this.vagaStatus.regua();
    const codigoDaFila = regua.codigoDoPapel("REVISAO");
    const linhas = (await this.db.execute(sql`
      insert into vagas (id_vacancy_pandape, cod_cliente, cargo_id, status)
      values (${idVacancyPandape}, null, null, ${codigoDaFila})
      returning id
    `)) as unknown as { id: string }[];
    const criada = linhas[0];
    if (!criada) throw new Error("A vaga espelhada do Digai nao devolveu linha.");
    return { id: criada.id };
  }

  /**
   * ─ A CANDIDATURA, E AQUI O `on conflict` DO BANCO NAO SERVE ───────────────────────────────────
   *
   * O unique de `(candidato_id, vaga_id)` e PARCIAL, restrito as situacoes VIVAS. Uma candidatura
   * ja DESCARTADA fica FORA do indice, entao o `on conflict` nao a enxergaria e a ingestao
   * inseriria uma linha nova a cada entrega, sem nada falhar, porque cada uma delas e legitima para
   * o banco. A busca explicita por (candidato, vaga) alcanca as duas populacoes.
   *
   * A CANDIDATURA QUE JA EXISTE NAO E MOVIDA. O Digai diz de que ESTAGIO DE TRIAGEM a pessoa veio,
   * e nao para onde ela deve ir no nosso funil: sobrescrever a etapa de quem ja esta em entrevista
   * seria o ATS de triagem desfazendo o trabalho de quem opera a vaga. Reentrega identica nao
   * escreve nada, e e por isso que o relogio do expurgo nao anda a cada volta.
   */
  async garantirCandidatura(dados: {
    candidatoId: string;
    vagaId: string;
    etapaCodigo: string | null;
    situacao: string;
  }): Promise<{ criada: boolean; id: string }> {
    const existentes = (await this.db.execute(sql`
      select id from as_candidaturas
       where candidato_id = ${dados.candidatoId}::uuid and vaga_id = ${dados.vagaId}::uuid
       order by criado_em desc
       limit 1
    `)) as unknown as { id: string }[];
    const existente = existentes[0];
    if (existente) return { criada: false, id: existente.id };

    /*
     * A ETAPA DE NASCIMENTO SAI DO CATALOGO QUANDO O DE/PARA NAO A RESOLVE, e nunca de um literal:
     * `as_candidaturas.etapa` e NOT NULL, a linha precisa nascer em algum caneco, e quem responde e
     * `as_etapas_funil` (a linha que o diretor marcou como porta de entrada). Este modulo LE aquele
     * catalogo e nunca escreve nele.
     */
    const caneco = dados.etapaCodigo ?? (await this.etapas.etapaInicial()).codigo;
    /*
     * ┌─ A CLAUSULA DE ANONIMIZACAO VAI AQUI TAMBEM, E ELA FECHA A ULTIMA JANELA ─────────────────┐
     * │ `atualizarCandidato` ja recusa ficha anonimizada, mas ele roda ANTES desta linha, e entre │
     * │ os dois existe uma janela: a passada do expurgo pode anonimizar a ficha no meio. Sem esta │
     * │ clausula, a candidatura VIVA nasceria apontando para uma ficha ja expurgada, e candidatura│
     * │ viva em vaga nao encerrada protege a pessoa do expurgo PARA SEMPRE: o relogio de retencao │
     * │ nunca mais volta a correr. Nao e vazamento (a PII ja foi apagada), e por isso a janela era │
     * │ residual e nao veto, mas o custo de fecha-la e uma clausula, e o `insert ... select ...   │
     * │ where exists` a torna ATOMICA com a escrita, do mesmo jeito que `anexarIdentidade`.       │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const linhas = (await this.db.execute(sql`
      insert into as_candidaturas (candidato_id, vaga_id, etapa, situacao)
      select
        ${dados.candidatoId}::uuid,
        ${dados.vagaId}::uuid,
        ${caneco},
        ${dados.situacao}::candidatura_situacao
      where exists (
        select 1 from as_candidatos
         where id = ${dados.candidatoId}::uuid and anonimizado_em is null
      )
      returning id
    `)) as unknown as { id: string }[];
    const criada = linhas[0];
    /*
     * ZERO LINHA AQUI E RECUSA, NAO ERRO DE BANCO: o unico jeito de o `insert ... select` nao
     * devolver linha e o `where exists` ter reprovado, ou seja, a ficha foi anonimizada entre o
     * plano e a escrita. A frase diz isso, e nao carrega o id da pessoa (secao A.6).
     */
    if (!criada) {
      throw new Error(
        "A candidatura da ingestao do Digai foi RECUSADA: a ficha do candidato esta anonimizada.",
      );
    }
    return { criada: true, id: criada.id };
  }

  // ── O CURSOR DO POLLING, QUE E MEDICAO E NAO DECISAO ─────────────────────────────────────────

  /**
   * ─ GRAVA O QUE A LISTAGEM DISSE SOBRE UM SCREENING, E NADA DECIDE POR ISSO ────────────────────
   *
   * ┌─ O QUE VAI PARA A TABELA, E POR QUE SO ISSO ────────────────────────────────────────────────┐
   * │ `screening_id`, o `updatedAt` que a LISTAGEM devolveu e o `total` de candidatos visto no     │
   * │ ultimo ciclo. Tres colunas, zero dado de pessoa: um screening nao e de ninguem, e o `total`  │
   * │ e contagem. Nada aqui entra no expurgo porque nada aqui e PII (secao A.6).                    │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ FALHA AQUI NAO DERRUBA O CICLO, E ISSO E DELIBERADO ───────────────────────────────────────┐
   * │ O cursor nao decide nada hoje (ver `CursorDoScreeningDigai`, em `domain/digai.ts`): ele e a  │
   * │ MEDICAO que um dia permitira pular screening sem mudanca. Derrubar a varredura porque a      │
   * │ medicao falhou seria trocar "perdi um numero" por "perdi as pessoas daquela passada", que e  │
   * │ exatamente a troca errada. Quem chama trata o `false` como aviso.                             │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async registrarCursorDoScreening(dados: {
    screeningId: string;
    updatedAt: string | null;
    total: number;
  }): Promise<boolean> {
    try {
      await this.db.execute(sql`
        insert into as_digai_screening_cursor (screening_id, updated_at_externo, total_visto, visto_em)
        values (${dados.screeningId}, ${textoOuNulo(dados.updatedAt)}, ${dados.total}, now())
        on conflict (screening_id) do update
           set updated_at_externo = excluded.updated_at_externo,
               total_visto = excluded.total_visto,
               visto_em = now()
      `);
      return true;
    } catch {
      /*
       * SEM `err` NA MAO E SEM LOG AQUI. A excecao do driver carrega `detail` e `query`, e este
       * arquivo nao loga por regra; quem avisa e o chamador, com contagem e sem valor.
       */
      return false;
    }
  }

  /** O cursor de um screening, para comparar ciclo a ciclo. Ausente = nunca foi visto. */
  async cursorDoScreening(screeningId: string): Promise<{
    updatedAt: string | null;
    total: number;
  } | null> {
    try {
      const linhas = (await this.db.execute(sql`
        select updated_at_externo, total_visto
          from as_digai_screening_cursor
         where screening_id = ${screeningId}
         limit 1
      `)) as unknown as { updated_at_externo: string | null; total_visto: number | null }[];
      const l = linhas[0];
      return l ? { updatedAt: l.updated_at_externo, total: l.total_visto ?? 0 } : null;
    } catch {
      return null;
    }
  }
}

/** Onze digitos com verificador valido, ou nulo. Documento invalido nunca vira chave de nada. */
function documentoParaBanco(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpo = normalizeCpf(v);
  return limpo.length === 11 && isValidCpf(limpo) ? limpo : null;
}

/** Texto util, ou nulo. Vazio e ausente sao a mesma coisa para toda escrita daqui. */
function textoOuNulo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
