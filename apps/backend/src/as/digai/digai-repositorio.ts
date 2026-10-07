import { Inject, Injectable } from "@nestjs/common";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import type { LinhaDeParaEtapaExternaCrua } from "../../domain/as-etapa-externa";
import { emailParaDesempateDigai } from "../../domain/digai";
import { ehNumeroPandapeDuplicado } from "../../domain/vaga-numero-pandape-unico";
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

  /**
   * ─ O DEGRAU 3, O E-MAIL, E ELE E O MAIS DESCONFIADO DOS TRES ──────────────────────────────────
   *
   * Depois da identidade externa e do CPF, antes de criar ficha nova. Medido em 02/10/2026
   * (`docs/MAPA-DEDUP-DIGAI-CHAVES.md`): 82% da populacao do Digai JA ESTA na plataforma e 84% dela
   * nao tem CPF, entao sem este degrau a ingestao abriria 18.722 fichas para gente que ja tem uma,
   * cada uma com o seu historico e o seu relogio de retencao.
   *
   * SAO QUATRO FECHADURAS, e cada uma fecha um modo de falha diferente:
   *
   * 1. E-MAIL QUE NAO PRESTA NAO VIRA CHAVE, e a recusa acontece ANTES do banco
   *    (`emailParaDesempateDigai`, dominio puro). Mesmo precedente do `documentoParaBanco`.
   * 2. FICHA JA ANONIMIZADA NAO E ALVO (`anonimizado_em is null`): o expurgo nao se desfaz pelo
   *    lado, recebendo dado novo na ficha antiga. E a mesma clausula repetida a mao em todo
   *    escritor de `as_candidatos`, porque nao ha guarda no schema nem trigger.
   * 3. CPF PRESENTE NOS DOIS LADOS E DIFERENTE NAO FUNDE, e esta e a guarda que o mapa original
   *    nao tinha (emenda E-4). O caso real: registro com CPF que nao casa ficha nenhuma, e-mail
   *    que casa a ficha B, e a ficha B tem OUTRO CPF. CPF diferente dos dois lados e a prova de
   *    que sao pessoas DIFERENTES, e e o mesmo argumento que condenou nome + vaga (247 homonimos).
   *    Exposicao medida: 653 registros chegam a este degrau com um CPF na mao que nao casou nada.
   *
   *    A COMPARACAO MORA NO SQL, e isso tambem e §A.6: assim o CPF da OUTRA pessoa nunca e lido
   *    para dentro do processo. Pedir a coluna para comparar em TypeScript traria para a memoria
   *    da aplicacao um documento de quem o registro nem alcanca.
   * 4. MAIS DE UMA FICHA CASANDO O MESMO E-MAIL E ABSTENCAO, NUNCA ESCOLHA (emenda E-7). Nao ha
   *    indice unico em `as_candidatos.email`, entao `limit 1` sem `order by` (o que o degrau do CPF
   *    faz, e la e seguro porque o CPF E unico) escolheria ficha ARBITRARIA. Ordenar seria PIOR que
   *    nao ordenar: ordem deterministica ESCOLHE, e aqui escolher e o risco.
   *
   *    ┌─ A CONTAGEM VEM ANTES DO FILTRO, E ESTE FOI UM VETO DA AUDITORIA ─────────────────────┐
   *    │ A primeira versao filtrava por CPF no `where` e contava o que SOBRAVA, que e outra      │
   *    │ grandeza: a guarda 5 CEGAVA a guarda 7. O caso real: ficha A com `cpf = X` e a ficha B  │
   *    │ com `cpf` nulo, as duas com o MESMO endereco, e um registro com `cpf = Y` (valido, que  │
   *    │ nao casa nada). A guarda 5 descartava A, sobrava UMA linha, a ambiguidade nao disparava │
   *    │ e o registro era fundido em B.                                                          │
   *    │                                                                                          │
   *    │ E duas fichas com o mesmo endereco sao exatamente a prova de que, ALI, o endereco NAO   │
   *    │ identifica uma pessoa so, que e a unica base deste degrau. A pergunta "quantas fichas   │
   *    │ carregam este endereco?" nao pode depender do CPF de quem esta perguntando.             │
   *    │                                                                                          │
   *    │ `count(*) over ()` e avaliado ANTES do `limit`, entao o `limit 2` continua barato e o   │
   *    │ total e o de verdade. A guarda 5 desce para a PROJECAO, como BOOLEANO (`passa_guarda`): │
   *    │ a decisao segue no banco e o documento da outra pessoa continua sem ser lido para a     │
   *    │ memoria da aplicacao (§A.6). O que sai da consulta e um `id`, um numero e um sim/nao.   │
   *    └──────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `{ ambiguo: true }` nao e luxo de tipo: sem ele, a abstencao chegaria ao chamador como `null`
   * e seria indistinguivel de "ninguem casou", que e o caso em que se CRIA ficha. Sao decisoes
   * opostas, e quem decide precisa saber qual das duas chegou.
   */
  async candidatoPorEmail(
    valor: string,
    cpfDoRegistro: string | null,
  ): Promise<{ id: string } | { ambiguo: true } | null> {
    const limpo = emailParaDesempateDigai(valor);
    if (limpo === null) return null;
    const doc = documentoParaBanco(cpfDoRegistro);
    const linhas = (await this.db.execute(sql`
      select id,
             count(*) over () as total,
             (${doc}::text is null or cpf is null or cpf = ${doc}) as passa_guarda
        from as_candidatos
       where lower(btrim(email)) = ${limpo}
         and anonimizado_em is null
       limit 2
    `)) as unknown as { id: string; total: unknown; passa_guarda: unknown }[];
    const primeira = linhas[0];
    if (primeira === undefined) return null;
    if (inteiroDoBanco(primeira.total) > 1) return { ambiguo: true };
    return booleanoDoBanco(primeira.passa_guarda) ? { id: primeira.id } : null;
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
     * ─ A ORDEM DO `coalesce` DE `cpf` E `email` E INVERTIDA DE PROPOSITO, E ELA E UMA GUARDA ─────
     *
     * ANTES: `cpf = coalesce(${doc}, cpf)`. `coalesce` com valor novo NAO NULO devolve o NOVO, ou
     * seja aquilo SUBSTITUIA o documento da ficha, e nao preenchia o vazio. Enquanto o casamento
     * era so por identidade externa estavel, o registro ERA a mesma pessoa e substituir era
     * inofensivo (e no Pandape a escrita e ainda mais direta, sem `coalesce`, e la esta certo pelo
     * mesmo motivo).
     *
     * COM O DEGRAU DO E-MAIL ISSO DEIXA DE SER VERDADE, e o estrago e auto-alimentado: uma passada
     * poderia gravar o e-mail da pessoa B na ficha da pessoa A; na passada seguinte, DUAS fichas
     * compartilhariam aquele endereco e o degrau 3 cairia na abstencao por ambiguidade, ou pior,
     * escolheria. A chave envenena a si mesma.
     *
     * AGORA: `coalesce(cpf, ${doc})`. O valor ja gravado VENCE, e o novo so entra onde havia nulo.
     * PREENCHER VAZIO, SIM; TROCAR IDENTIDADE, NAO. Valor igual ao que ja esta la nao e troca, e
     * cai no mesmo caminho sem escrever nada, porque a escrita segue condicional.
     *
     * NOME E TELEFONE NAO MUDAM DE REGRA: nenhum dos dois e chave de fusao (telefone casa 15.786
     * pares e 85% deles sao pessoas diferentes, e e exatamente por isso que ele NAO decide nada), e
     * o nome e o campo que a ingestao existe para manter em dia.
     *
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
             cpf = coalesce(cpf, ${doc}),
             email = coalesce(email, ${correio}),
             telefone = coalesce(${fone}, telefone),
             atualizado_em = now()
       where id = ${alvo}::uuid
         and anonimizado_em is null
         and (nome, cpf, email, telefone)
             is distinct from (
               coalesce(nullif(${valorNome}, ''), nome),
               coalesce(cpf, ${doc}),
               coalesce(email, ${correio}),
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
    /*
     * ┌─ O UNIQUE DO NUMERO (0150): LEU "NAO EXISTE", PERDEU A CORRIDA, RELE E SEGUE COM A VAGA ───┐
     * │ A busca acima e o insert sao DOIS passos, entao duas entregas simultaneas do mesmo          │
     * │ `partnerJobId` (ou uma entrega concorrente com a varredura do Pandape, que casa pela MESMA  │
     * │ chave) leem as duas "nao existe" e as duas tentam inserir. Antes do indice, a segunda criava │
     * │ a vaga GEMEA e as candidaturas ficavam partidas entre as duas; agora ela bate em 23505.      │
     * │                                                                                             │
     * │ ISTO NAO E ERRO DE USUARIO E NAO TEM MENSAGEM: ninguem digitou nada. O desfecho e o MESMO do │
     * │ caminho de cima, reusar a vaga que existe, e o contrato do metodo nao muda (ele devolve a    │
     * │ vaga daquele numero, nao "a vaga que eu criei"). SO a nossa violacao e tratada: outro erro   │
     * │ sobe intacto, senao falha de banco viraria vaga inexistente devolvida como existente.        │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    let linhas: { id: string }[];
    try {
      linhas = (await this.db.execute(sql`
        insert into vagas (id_vacancy_pandape, cod_cliente, cargo_id, status)
        values (${idVacancyPandape}, null, null, ${codigoDaFila})
        returning id
      `)) as unknown as { id: string }[];
    } catch (err) {
      if (!ehNumeroPandapeDuplicado(err)) throw err;
      const releitura = (await this.db.execute(sql`
        select id from vagas where id_vacancy_pandape = ${idVacancyPandape} limit 1
      `)) as unknown as { id: string }[];
      const vencedora = releitura[0];
      if (!vencedora) {
        throw new Error(
          "O numero da vaga do Digai colidiu no banco e a releitura nao achou a vaga vencedora.",
        );
      }
      return { id: vencedora.id };
    }
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
    /**
     * ─ AUSENTE E "NAO MEDI AGORA", E NAO "ZERO" (29/09/2026, reparticao por necessidade) ───────
     *
     * O TICK chama sem `total`, porque a LISTAGEM nao diz quantos candidatos um screening tem. Ate
     * aqui ele gravava `0` e contava com a pagina 1 para repor o numero no mesmo ciclo, e isso
     * deixou de ser inocente quando o `total` passou a REPARTIR ORCAMENTO: o screening CORTADO nao
     * tem pagina 1, entao o `0` do tick ficaria de pe, e ele receberia cota de desconhecido para
     * sempre. Fome permanente causada pela propria medicao.
     *
     * Sem `total`, o `update` PRESERVA o `total_visto` que ja estava la, e o `insert` usa o padrao
     * 0 da coluna (que o dominio le como DESCONHECIDO, nao como vazio).
     */
    total?: number;
  }): Promise<boolean> {
    try {
      const total = typeof dados.total === "number" ? Math.max(0, Math.trunc(dados.total)) : null;
      await this.db.execute(sql`
        insert into as_digai_screening_cursor (screening_id, updated_at_externo, total_visto, visto_em)
        values (${dados.screeningId}, ${textoOuNulo(dados.updatedAt)}, ${total ?? 0}, now())
        on conflict (screening_id) do update
           set updated_at_externo = excluded.updated_at_externo,
               total_visto = coalesce(${total}, as_digai_screening_cursor.total_visto),
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

  /**
   * ─ OS `total` DE TODOS OS SCREENINGS, DE UMA VEZ, PORQUE A REPARTICAO PRECISA DELES JUNTOS ───
   *
   * ┌─ POR QUE UMA CONSULTA E NAO 528 ────────────────────────────────────────────────────────────┐
   * │ `planoDaVarredura` reparte o orcamento OLHANDO A BASE INTEIRA: a necessidade de um screening │
   * │ so vira cota depois de comparada com a soma de todas. Ler um a um seria 528 ida-e-voltas ao  │
   * │ banco DENTRO do job da listagem, que e o job mais curto do ciclo e o que segura a cadencia.  │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A TABELA INTEIRA SAI NUMA VEZ, e ela e pequena por construcao: uma linha por screening JA
   * VISTO, tres colunas, zero PII (secao A.6). Filtrar pelos ids desta pagina economizaria nada e
   * custaria uma lista de 528 parametros.
   *
   * FALHA DEVOLVE MAPA VAZIO, e isso e fail-safe e nao fail-closed: sem `total` conhecido todo
   * mundo vira DESCONHECIDO, a reparticao degenera na IGUALITARIA de antes e o ciclo roda. Perder
   * a medicao nao pode custar as pessoas da passada.
   */
  async totaisConhecidos(): Promise<Map<string, number>> {
    try {
      const linhas = (await this.db.execute(sql`
        select screening_id, total_visto
          from as_digai_screening_cursor
      `)) as unknown as { screening_id: string; total_visto: number | null }[];
      const mapa = new Map<string, number>();
      for (const l of linhas) {
        const total = Number(l.total_visto ?? 0);
        if (typeof l.screening_id === "string" && Number.isFinite(total)) {
          mapa.set(l.screening_id, total);
        }
      }
      return mapa;
    } catch {
      return new Map();
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

/**
 * ─ A LEITURA DO QUE O DRIVER DEVOLVE E EXPLICITA, E NAO CONFIA NA FORMA ────────────────────────
 *
 * `count(*)` e `bigint`, e o driver devolve bigint como TEXTO para nao perder precisao, enquanto
 * `boolean` chega como boolean. Como as duas colunas vem da MESMA consulta e com formas diferentes,
 * nao se presume nenhuma: o `0` em caso de forma inesperada seria fail-OPEN na contagem (nao
 * dispararia a ambiguidade), entao a contagem desconhecida vira 2, que ABSTEM.
 */
function inteiroDoBanco(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return 2;
}

/** Verdadeiro so quando o banco disse verdadeiro. Qualquer outra forma NAO desempata. */
function booleanoDoBanco(v: unknown): boolean {
  return v === true || v === "t" || v === "true";
}

/** Texto util, ou nulo. Vazio e ausente sao a mesma coisa para toda escrita daqui. */
function textoOuNulo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
