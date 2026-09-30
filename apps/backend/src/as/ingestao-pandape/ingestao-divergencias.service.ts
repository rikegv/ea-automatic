import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import {
  CAMPO_DE_DIVERGENCIA_LABEL,
  type CampoDeDivergencia,
  type DecisaoDeDivergencia,
  type DivergenciaDaIngestaoItem,
  type DivergenciasDaIngestaoPagina,
  type EscopoDeDivergencia,
  type KpisDeDivergencias,
  type OpcoesDeFiltroDeDivergencias,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { CandidatosService } from "../candidatos/candidatos.service";
import { VagasService } from "../vagas/vagas.service";
import type { FiltroDeDivergencias } from "./ingestao-divergencias.dto";

/**
 * ─ A FILA DE DIVERGENCIAS DA INGESTAO: LISTAR E RESOLVER ───────────────────────────────────────
 *
 * ┌─ O DEFEITO QUE ESTA FILA EXISTE PARA MATAR (medido em 30/09/2026) ──────────────────────────┐
 * │ A varredura do Pandapé SOBRESCREVIA CEGO a etapa e a situação da candidatura, e os quatro     │
 * │ campos da vaga já liberada. O `where ... is distinct from` do repositório NÃO era proteção,   │
 * │ era o GATILHO: existia só para não empurrar `atualizado_em`, e comparava valor com valor,     │
 * │ nunca autor com autor. O time avançava a pessoa três etapas e em até 30 minutos ela VOLTAVA,  │
 * │ em 24 das 27 pastas do de/para, SEM NADA FALHAR.                                              │
 * │                                                                                             │
 * │ A régua do diretor: O EA VENCE, e a diferença vira linha aqui. Nada é sobrescrito em silêncio.│
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `ADOTADO_ATS` APLICA O VALOR PELO CAMINHO HUMANO NORMAL, E ISSO É A REGRA ─────────────────┐
 * │ Adotar é um CLIQUE DO TIME e tem de valer como tal: `moverEtapa` para a etapa, `editarPosicoes`│
 * │ para as posições da vaga, `trocarVaga` para a vaga do candidato. Escrever a coluna direto daria │
 * │ valor certo com a PROCEDENCIA ERRADA, que é letra por letra o defeito que esta fila existe     │
 * │ para matar: dado trocado sem autor, sem data e sem trilha.                                     │
 * │                                                                                             │
 * │ E ISSO TEM UM PREÇO QUE FICA DECLARADO: campo cujo caminho humano NÃO aceita o estado atual da │
 * │ linha NÃO É ADOTÁVEL por aqui (ver `aplicarPeloCaminhoHumano`), e a rota devolve 409 dizendo    │
 * │ onde a correção se faz à mão. Recusar é melhor do que abrir uma segunda porta de escrita.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada aqui vai a log. `valor_ea` e `valor_ats` são código, rótulo de vaga ou número (lista
 * FECHADA `CAMPOS_DE_DIVERGENCIA` mais o CHECK do banco), e o NOME do candidato é lido por JOIN em
 * `as_candidatos`, nunca copiado para a tabela da fila: o expurgo que anonimiza a ficha já apaga o
 * nome que a fila mostra, sem ninguém precisar voltar aqui.
 */
@Injectable()
export class IngestaoDivergenciasService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly candidatos: CandidatosService,
    private readonly vagas: VagasService,
  ) {}

  /**
   * A FILA, com os filtros múltiplos (§A.28) e os KPIs.
   *
   * OS KPIS SÃO CONTADOS SEM OS FILTROS DE PROPÓSITO: eles respondem "quanto trabalho existe", e um
   * KPI que encolhe junto com o filtro deixa de responder isso (é o mesmo raciocínio dos cards
   * clicáveis da §A.12: o card é o filtro, então ele não pode já vir filtrado).
   */
  async listar(filtro: FiltroDeDivergencias): Promise<DivergenciasDaIngestaoPagina> {
    const condicoes = [sql`true`];
    if (filtro.estado === "ABERTAS") condicoes.push(sql`d.resolvido_em is null`);
    if (filtro.estado === "RESOLVIDAS") condicoes.push(sql`d.resolvido_em is not null`);
    if (filtro.escopo?.length) {
      condicoes.push(sql`d.escopo in (${sql.join(filtro.escopo.map((e) => sql`${e}`), sql`, `)})`);
    }
    if (filtro.campo?.length) {
      condicoes.push(sql`d.campo in (${sql.join(filtro.campo.map((c) => sql`${c}`), sql`, `)})`);
    }
    /*
     * ┌─ O FILTRO DE CLIENTE E O DE VAGA CASAM CONTRA A MESMA EXPRESSAO QUE A CELULA MOSTRA ───────┐
     * │ A vaga da linha é `coalesce(c.vaga_id, d.vaga_id)` (escopo CANDIDATURA olha a vaga da        │
     * │ candidatura, escopo VAGA olha a coluna da própria divergência), e o cliente é o `nome_operacao│
     * │ ` com o `razao_social` de reserva. Filtrar por outra expressão faria a tela mostrar um valor  │
     * │ e a consulta procurar outro, que é a forma silenciosa de um filtro mentir.                    │
     * │                                                                                             │
     * │ CADA VALOR É UM PARAMETRO, e nunca uma lista interpolada no texto: é a mesma lição já paga em │
     * │ `encerrarAusentes` (drizzle sobre postgres-js não liga array de JS a array de Postgres), e    │
     * │ assim não há escape a acertar nem injeção possível por construção.                            │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (filtro.cliente?.length) {
      const nomes = sql.join(filtro.cliente.map((n) => sql`${n}`), sql`, `);
      condicoes.push(sql`exists (
        select 1 from vagas vf
          left join clientes clf on clf.cod_cliente = vf.cod_cliente
         where vf.id = coalesce(c.vaga_id, d.vaga_id)
           and coalesce(clf.nome_operacao, clf.razao_social) in (${nomes}))`);
    }
    if (filtro.vaga?.length) {
      const ids = sql.join(filtro.vaga.map((v) => sql`${v}::uuid`), sql`, `);
      condicoes.push(sql`coalesce(c.vaga_id, d.vaga_id) in (${ids})`);
    }

    return {
      itens: (await this.linhas(sql.join(condicoes, sql` and `))).map((l) => this.item(l)),
      kpis: await this.kpis(),
    };
  }

  /**
   * O SELECT DA FILA, EM UM LUGAR SÓ, com o `where` recebido por parâmetro.
   *
   * ELE É COMPARTILHADO PELA LISTA E PELO `obter` de propósito: uma segunda consulta para devolver a
   * linha recém-resolvida divergiria da primeira no primeiro campo novo, e a tela passaria a receber
   * um item diferente conforme o caminho que o produziu.
   */
  /*
   * ┌─ O TETO DE 500 LINHAS, E E ELE A RAZAO DE O FILTRO DE CLIENTE E DE VAGA SER SERVER-SIDE ────┐
   * │ Recortar cliente e vaga NA TELA só seria honesto se a lista chegasse COMPLETA, e ela não      │
   * │ chega: passado o teto, a tela filtraria um conjunto JA TRUNCADO, e as divergências daquele     │
   * │ cliente que ficaram de fora simplesmente não apareceriam, sem nada indicar isso. É o mesmo     │
   * │ defeito da §A.28 ("filtro que a consulta ignora é pior que filtro nenhum"), um degrau abaixo.  │
   * │ E o teto é alcançável de verdade: a varredura roda até 48 vezes por dia e cada campo           │
   * │ divergente é uma linha.                                                                        │
   * │                                                                                              │
   * │ OS KPIS E O CATALOGO DAS OPCOES NAO SOFREM DISSO, e é por isso que eles são contados fora      │
   * │ daqui: os dois são agregados do conjunto INTEIRO, sem teto, em consulta própria.               │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * NENHUM COMENTARIO DENTRO DO TEMPLATE `sql`, e o motivo é concreto: um acento grave no texto do
   * comentário FECHA a template literal, e o resultado não é um erro de SQL, é um erro de TypeScript
   * em outro lugar do arquivo. Já aconteceu ao escrever este mesmo bloco.
   */
  private async linhas(onde: ReturnType<typeof sql>): Promise<LinhaDaFila[]> {
    return (await this.db.execute(sql`
      select d.id,
             d.escopo,
             d.campo,
             d.valor_ea,
             d.valor_ats,
             d.candidatura_id,
             d.vaga_id,
             d.ocorrencias,
             d.primeira_em,
             d.ultima_em,
             d.resolvido_em,
             d.decisao,
             -- O NOME DA PESSOA VEM POR JOIN, e nunca de uma cópia na tabela da fila: o expurgo que
             -- anonimiza a ficha já apaga o que a tela mostra (§A.6).
             cand.nome as candidato_nome,
             coalesce(v.nome_divulgacao, v.codigo) as vaga_nome,
             coalesce(cl.nome_operacao, cl.razao_social) as cliente_nome,
             u.nome as resolvido_por_nome
        from as_ingestao_divergencias d
        left join as_candidaturas c on c.id = d.candidatura_id
        left join as_candidatos cand on cand.id = c.candidato_id
        left join vagas v on v.id = coalesce(c.vaga_id, d.vaga_id)
        left join clientes cl on cl.cod_cliente = v.cod_cliente
        left join usuarios u on u.id = d.resolvido_por_id
       where ${onde}
       order by d.resolvido_em is not null, d.ocorrencias desc, d.ultima_em desc
       limit 500
    `)) as unknown as LinhaDaFila[];
  }

  /**
   * MANTER O EA: fecha a linha e NÃO escreve nada no dado.
   *
   * ELA É A SAÍDA MAIS COMUM, e é a que confirma a régua: o time olhou, o EA está certo, e o valor do
   * ATS é descartado. Nenhuma coluna de candidatura ou de vaga é tocada.
   */
  async manterEa(id: string, autorId: string): Promise<DivergenciaDaIngestaoItem> {
    await this.exigirAberta(id);
    await this.fechar(id, autorId, "MANTIDO_EA");
    return this.obter(id);
  }

  /**
   * ADOTAR O ATS: aplica o valor PELO CAMINHO HUMANO e só então fecha a linha.
   *
   * ┌─ A ORDEM É APLICAR, DEPOIS FECHAR, E ELA NÃO É NEGOCIÁVEL ─────────────────────────────────┐
   * │ Fechar antes deixaria a linha fora da fila com o dado INTACTO se a aplicação falhasse (vaga  │
   * │ encerrada, etapa inativada no catálogo, posição acima do teto), e ninguém mais voltaria      │
   * │ àquele caso: ele sairia da fila sem ter sido resolvido. Falhando a aplicação, a exceção sobe │
   * │ com a frase do caminho humano e a linha CONTINUA aberta, que é o lado seguro.                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async adotarAts(id: string, autorId: string): Promise<DivergenciaDaIngestaoItem> {
    const linha = await this.exigirAberta(id);
    await this.aplicarPeloCaminhoHumano(linha, autorId);
    await this.fechar(id, autorId, "ADOTADO_ATS");
    return this.obter(id);
  }

  /**
   * ─ O DESPACHO DA ADOCAO, E A LISTA DE CAMPOS ADOTAVEIS É FECHADA ───────────────────────────────
   *
   * ┌─ POR QUE TRÊS CAMPOS SÃO ADOTAVEIS E CINCO NÃO SÃO ────────────────────────────────────────┐
   * │ ADOTAVEIS, porque existe UMA chamada humana que aplica o valor com autor, trilha e derivação: │
   * │   . `etapa`                   -> `CandidatosService.moverEtapa` (grava o evento de funil e     │
   * │                                  deriva o status da vaga, exatamente como o clique da tela);   │
   * │   . `vaga_posicoes_oficiais`  -> `VagasService.editarPosicoes` (valida o excesso e grava o     │
   * │                                  rastro de redução de meta);                                  │
   * │   . `vaga_do_candidato`       -> `CandidatosService.trocarVaga` (MOVE a candidatura de volta   │
   * │                                  para a vaga do ATS; era `alocar`, e `alocar` INSERIA uma      │
   * │                                  segunda candidatura viva, ver o bloco daquele ramo).          │
   * │                                                                                             │
   * │ NÃO ADOTAVEIS, e a recusa é HONESTA em vez de uma segunda porta de escrita:                   │
   * │   . `situacao`: o caminho humano é `registrarSaida`, que EXIGE motivo do CATÁLOGO             │
   * │     (`motivos_descarte`, migration 0129). O que o ATS traz é a frase genérica do de/para, que  │
   * │     não está no catálogo: adotar aqui teria de escrever a coluna direto ou inventar um motivo, │
   * │     e as duas coisas são o defeito que a fila existe para matar. Quem concorda com o ATS       │
   * │     descarta a pessoa pela tela, escolhendo o motivo. (`motivo_descarte` NÃO APARECE nesta     │
   * │     lista porque deixou de ser `CampoDeDivergencia` no veto do `seguranca`: a trava dele ficou, │
   * │     a linha de fila saiu. Ver `domain/as-precedencia-ingestao.ts`.)                            │
   * │   . `vaga_codigo`, `vaga_nome_divulgacao`, `vaga_cidade`: o único escritor humano é            │
   * │     `VagasService.atualizar`, e ele só aceita vaga de papel RASCUNHO ou REVISAO. A            │
   * │     divergência de vaga só NASCE quando a vaga JÁ SAIU da revisão, ou seja o caminho humano   │
   * │     recusaria 100% dos casos. O caminho de verdade é o Master devolver a vaga à revisão       │
   * │     (`corrigir-revisao`), corrigir e liberar de novo, e é isso que a frase do 409 diz.        │
   * │                                                                                             │
   * │ ESTA É UMA DECISÃO DE IMPLEMENTACAO QUE FICA DECLARADA, e não um esquecimento: a alternativa  │
   * │ era escrever a coluna direto nesses cinco, o que daria o valor certo com a procedência        │
   * │ errada. Ampliar a lista é frente do diretor, não da fábrica (§A.31).                          │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  private async aplicarPeloCaminhoHumano(linha: LinhaDaFila, autorId: string): Promise<void> {
    const campo = linha.campo as CampoDeDivergencia;

    if (campo === "etapa") {
      if (!linha.candidatura_id) {
        throw new ConflictException("Esta divergência não aponta para uma candidatura.");
      }
      const etapa = (linha.valor_ats ?? "").trim();
      if (etapa === "") {
        throw new ConflictException(
          "O ATS não trouxe etapa nesta divergência, então não há valor a adotar. Use Manter O EA.",
        );
      }
      // O CAMINHO DA TELA, IGUALZINHO: ele grava `as_candidatura_etapas`, exige vaga em processo e
      // deriva o status da vaga. É por isso que adotar vale como clique do time.
      await this.candidatos.moverEtapa(linha.candidatura_id, { etapa }, autorId);
      return;
    }

    if (campo === "vaga_posicoes_oficiais") {
      if (!linha.vaga_id) throw new ConflictException("Esta divergência não aponta para uma vaga.");
      const posicoes = Number(linha.valor_ats);
      if (!Number.isInteger(posicoes) || posicoes < 1) {
        throw new ConflictException(
          "O número de posições que o ATS trouxe não é válido, então não há valor a adotar. Use Manter O EA.",
        );
      }
      /*
       * `posicoes_banco` VAI COMO ESTÁ, e não como zero: o DTO pede os dois números e o lado banco é
       * decisão INTERNA que o ATS não conhece. Mandar zero apagaria a meta de banco que alguém
       * dimensionou, o que seria uma segunda alteração que ninguém pediu (§A.14).
       */
      const atual = (await this.db.execute(sql`
        select posicoes_banco from vagas where id = ${linha.vaga_id}::uuid limit 1
      `)) as unknown as { posicoes_banco: number | null }[];
      await this.vagas.editarPosicoes(
        linha.vaga_id,
        { posicoesOficiais: posicoes, posicoesBanco: atual[0]?.posicoes_banco ?? 0 },
        autorId,
      );
      return;
    }

    if (campo === "vaga_do_candidato") {
      if (!linha.candidatura_id || !linha.vaga_id) {
        throw new ConflictException("Esta divergência não aponta para candidatura e vaga.");
      }
      /*
       * ┌─ `trocarVaga`, E **NAO** `alocar`. A PRIMEIRA VERSAO USAVA `alocar` E RECRIAVA A DUPLICATA ┐
       * │ QUE ESTA FRENTE EXISTE PARA MATAR (veto V3 do `seguranca`, 30/09/2026).                     │
       * │                                                                                            │
       * │ O CAMINHO EXATO DO DEFEITO, e ele é o caminho FELIZ desta linha de fila, não uma borda:     │
       * │ a divergência só NASCE depois de `trocarVaga` ter MOVIDO a candidatura (ela faz `update` de │
       * │ `vaga_id`, com ZERO insert), então NAO SOBRA linha em (candidato, vaga do ATS). `alocar`    │
       * │ busca justamente por aquele par, não acha nada, `decidirAlocacao` devolve LIVRE e ele       │
       * │ INSERE. A candidatura viva na vaga de destino continua lá: a pessoa passa a estar VIVA EM   │
       * │ DUAS VAGAS, consumindo DUAS posições, e a nova nasce na etapa INICIAL, perdendo o avanço    │
       * │ que o time fez no funil. O comentário antigo afirmava "candidatura VIVA continua barrada",  │
       * │ e era FALSO neste cenário: não há candidatura viva naquele par para barrar.                  │
       * │                                                                                            │
       * │ `trocarVaga` É O CAMINHO HUMANO HONESTO, e o fecho é exato: ele MOVE a linha que existe (um │
       * │ `update`, não um insert), tem a trava de "só candidatura VIVA troca", respeita o unique      │
       * │ parcial de candidatura viva no destino, e grava `vaga_de`/`vaga_para` na trilha, que é A    │
       * │ MESMA trilha que a trava do `escreverCandidatura` LE para detectar a transferência. Ou seja │
       * │ a adoção passa a ser o inverso exato do gesto que gerou a divergência, e não um gesto novo. │
       * │                                                                                            │
       * │ O `cienteReentrada: true` CAIU JUNTO, e a ressalva R2 do `seguranca` era essa: aquele flag  │
       * │ afirma uma ciência que nenhum modal pediu ao consultor. `trocarVaga` não tem o campo, e o   │
       * │ `motivo` dele fica AUSENTE de propósito, porque é PROSA opcional (§A.6) e a adoção não tem  │
       * │ frase de gente a registrar: quem registra a procedência é a trilha, com autor e data.       │
       * └────────────────────────────────────────────────────────────────────────────────────────────┘
       */
      await this.candidatos.trocarVaga(linha.candidatura_id, { vagaId: linha.vaga_id }, autorId);
      return;
    }

    if (campo === "situacao") {
      throw new ConflictException(
        "A situação não é adotada por esta fila: quem sai do funil sai pela ficha do candidato, escolhendo o motivo do catálogo. Concordando com o ATS, registre a saída na ficha e depois feche esta linha com Manter O EA.",
      );
    }

    throw new ConflictException(
      "Este campo da vaga não é adotado por esta fila: a vaga já foi liberada, e os campos de abertura só voltam a ser editáveis quando um Master devolve a vaga para a revisão. Corrija a vaga por lá e depois feche esta linha com Manter O EA.",
    );
  }

  /**
   * ─ O CATALOGO DAS OPCOES DE FILTRO, E ELE VEM DO SERVIDOR (§A.37) ──────────────────────────────
   *
   * ┌─ POR QUE NAO SE DERIVA DAS LINHAS JA CARREGADAS ────────────────────────────────────────────┐
   * │ Derivar da página é o defeito que a §A.37 existe para matar: a lista ENCOLHE assim que o       │
   * │ primeiro valor é escolhido (a página passa a ter só aquele cliente), e não há como somar o     │
   * │ segundo sem limpar o filtro. Filtro múltiplo (§A.28) com catálogo derivado da página é, na     │
   * │ prática, filtro de um valor só.                                                               │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * DERIVADO DA FILA INTEIRA, SEM FILTRO, pelo mesmo motivo dos KPIs: o catálogo responde "o que
   * existe para escolher", e um catálogo que já viesse recortado pela escolha anterior não responde
   * isso. Inclui as RESOLVIDAS de propósito, porque o estado é um dos filtros e o time alterna entre
   * a fila e o histórico sem que as opções de cliente e de vaga sumam do seletor.
   *
   * ┌─ §A.6: NENHUM NOME DE CANDIDATO ENTRA AQUI ────────────────────────────────────────────────┐
   * │ Cliente é pessoa JURIDICA e vaga é vaga. A lista devolve `nome_operacao` (ou `razao_social`) e │
   * │ nome de divulgação da vaga, e nada mais. Um catálogo por CANDIDATO publicaria a lista de quem  │
   * │ está na fila num endpoint só de opções, o que é dado pessoal sem uso de filtro.                │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `value` DO CLIENTE É O NOME, e não um id, e a razão é do contrato: `DivergenciaDaIngestaoItem`
   * carrega `clienteNome` e NÃO carrega `clienteId`, então é o nome que a célula mostra e é por ele
   * que a tela filtra. A vaga tem `vagaId`, então ali o `value` é o id e o nome é só rótulo.
   */
  async opcoes(): Promise<OpcoesDeFiltroDeDivergencias> {
    const linhas = (await this.db.execute(sql`
      select distinct
             coalesce(cl.nome_operacao, cl.razao_social) as cliente_nome,
             v.id as vaga_id,
             coalesce(v.nome_divulgacao, v.codigo) as vaga_nome
        from as_ingestao_divergencias d
        left join as_candidaturas c on c.id = d.candidatura_id
        left join vagas v on v.id = coalesce(c.vaga_id, d.vaga_id)
        left join clientes cl on cl.cod_cliente = v.cod_cliente
    `)) as unknown as {
      cliente_nome: string | null;
      vaga_id: string | null;
      vaga_nome: string | null;
    }[];

    /*
     * A DEDUPLICACAO E A ORDEM SAO FEITAS AQUI, e não com dois `select distinct ... order by`: a
     * consulta é UMA porque as duas listas saem da MESMA árvore de joins, e um segundo `select` com a
     * mesma árvore é a chance de as duas divergirem na primeira mudança. `Map` porque a vaga tem
     * chave (o id) e o cliente é o próprio valor.
     */
    const clientes = new Set<string>();
    const vagas = new Map<string, string>();
    for (const l of linhas) {
      // A LINHA SEM CLIENTE OU SEM VAGA NAO VIRA OPCAO VAZIA: a vaga espelhada nasce sem cliente
      // (§A.5, o de/para é insumo do diretor), e uma opção de rótulo vazio no seletor é uma opção que
      // ninguém consegue interpretar nem desmarcar.
      const cliente = (l.cliente_nome ?? "").trim();
      if (cliente !== "") clientes.add(cliente);
      const vagaNome = (l.vaga_nome ?? "").trim();
      if (l.vaga_id && vagaNome !== "") vagas.set(l.vaga_id, vagaNome);
    }
    const ordenar = (a: { label: string }, b: { label: string }) =>
      a.label.localeCompare(b.label, "pt-BR");
    return {
      clientes: [...clientes].map((nome) => ({ value: nome, label: nome })).sort(ordenar),
      vagas: [...vagas]
        .map(([value, label]) => ({ value, label }))
        .sort(ordenar),
    };
  }

  // ── LEITURA AUXILIAR ─────────────────────────────────────────────────────────────────────────

  private async kpis(): Promise<KpisDeDivergencias> {
    const linhas = (await this.db.execute(sql`
      select count(*) filter (where resolvido_em is null)::int as abertas,
             count(*) filter (where resolvido_em is not null)::int as resolvidas,
             count(*) filter (where resolvido_em is null and ocorrencias > 1)::int as reincidentes
        from as_ingestao_divergencias
    `)) as unknown as KpisDeDivergencias[];
    return linhas[0] ?? { abertas: 0, resolvidas: 0, reincidentes: 0 };
  }

  /**
   * A LINHA AINDA ABERTA, ou 409.
   *
   * RESOLVER DUAS VEZES NÃO É IDEMPOTENTE, É PERIGOSO no ramo do `ADOTADO_ATS`: a segunda chamada
   * aplicaria o valor de novo pelo caminho humano (uma segunda alocação, um segundo movimento de
   * etapa), gravando um segundo evento de trilha que ninguém pediu. A recusa é explícita.
   */
  private async exigirAberta(id: string): Promise<LinhaDaFila> {
    /*
     * A FORMA DO UUID E CONFERIDA ANTES DA CONSULTA (ressalva R3 do `seguranca`, 30/09/2026).
     *
     * O id vem do PATH e entra com `::uuid`: texto torto ali estoura 22P02 no driver, e o cliente
     * recebe 500 em vez de 404. A régua é a mesma que a controller aplica à lista de vagas do filtro,
     * e ela mora AQUI, e não só na controller, porque é este método que interpola o valor: guarda no
     * ponto que escreve é a que sobrevive a um segundo chamador.
     */
    if (!FORMA_DE_UUID.test(id)) throw new NotFoundException("Divergência não encontrada.");
    const linhas = (await this.db.execute(sql`
      select id, escopo, campo, valor_ea, valor_ats, candidatura_id, vaga_id,
             ocorrencias, primeira_em, ultima_em, resolvido_em, decisao
        from as_ingestao_divergencias where id = ${id}::uuid limit 1
    `)) as unknown as LinhaDaFila[];
    const linha = linhas[0];
    if (!linha) throw new NotFoundException("Divergência não encontrada.");
    if (linha.resolvido_em !== null) {
      throw new ConflictException("Esta divergência já foi resolvida. Recarregue a página.");
    }
    return linha;
  }

  /**
   * O FECHAMENTO, e `resolvido_em` e `decisao` VÃO JUNTOS porque o banco exige (o CHECK
   * `ck_as_ingestao_divergencias_resolucao`): linha fechada sem decisão não diz nada, e decisão sem
   * carimbo sairia da fila pela tela e continuaria DENTRO do índice de idempotência, fazendo a próxima
   * volta da varredura INCREMENTAR uma linha que alguém já resolveu.
   *
   * O `where resolvido_em is null` FECHA A CORRIDA de dois consultores clicando ao mesmo tempo: o
   * segundo não reescreve a decisão do primeiro.
   */
  private async fechar(id: string, autorId: string, decisao: DecisaoDeDivergencia): Promise<void> {
    const linhas = (await this.db.execute(sql`
      update as_ingestao_divergencias
         set resolvido_em = now(),
             resolvido_por_id = ${autorId}::uuid,
             decisao = ${decisao},
             atualizado_em = now()
       where id = ${id}::uuid
         and resolvido_em is null
      returning id
    `)) as unknown as { id: string }[];
    if (linhas.length === 0) {
      throw new ConflictException("Esta divergência já foi resolvida. Recarregue a página.");
    }
  }

  private async obter(id: string): Promise<DivergenciaDaIngestaoItem> {
    const linha = (await this.linhas(sql`d.id = ${id}::uuid`))[0];
    if (!linha) throw new NotFoundException("Divergência não encontrada.");
    return this.item(linha);
  }

  /** A linha crua virando o item do contrato. O rótulo vem pronto, para a célula não recalcular. */
  private item(l: LinhaDaFila): DivergenciaDaIngestaoItem {
    const campo = l.campo as CampoDeDivergencia;
    return {
      id: l.id,
      escopo: l.escopo as EscopoDeDivergencia,
      campo,
      campoRotulo: CAMPO_DE_DIVERGENCIA_LABEL[campo] ?? campo,
      valorEa: l.valor_ea ?? null,
      valorAts: l.valor_ats ?? null,
      candidaturaId: l.candidatura_id ?? null,
      candidatoNome: l.candidato_nome ?? null,
      vagaId: l.vaga_id ?? null,
      vagaNome: l.vaga_nome ?? null,
      clienteNome: l.cliente_nome ?? null,
      ocorrencias: l.ocorrencias,
      primeiraEm: emIso(l.primeira_em),
      ultimaEm: emIso(l.ultima_em),
      resolvidoEm: l.resolvido_em === null ? null : emIso(l.resolvido_em),
      resolvidoPorNome: l.resolvido_por_nome ?? null,
      decisao: (l.decisao ?? null) as DecisaoDeDivergencia | null,
    };
  }
}

/** A forma do uuid, nomeada uma vez. Ver a guarda em `exigirAberta` (ressalva R3 do `seguranca`). */
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A forma crua que o driver devolve. Os nomes são os da coluna, de propósito. */
interface LinhaDaFila {
  id: string;
  escopo: string;
  campo: string;
  valor_ea: string | null;
  valor_ats: string | null;
  candidatura_id: string | null;
  vaga_id: string | null;
  ocorrencias: number;
  primeira_em: Date | string;
  ultima_em: Date | string;
  resolvido_em: Date | string | null;
  decisao: string | null;
  candidato_nome?: string | null;
  vaga_nome?: string | null;
  cliente_nome?: string | null;
  resolvido_por_nome?: string | null;
}

/** O carimbo em ISO, aceitando `Date` (o que o driver devolve) e texto (o que um fake devolve). */
function emIso(valor: Date | string): string {
  return valor instanceof Date ? valor.toISOString() : String(valor);
}
