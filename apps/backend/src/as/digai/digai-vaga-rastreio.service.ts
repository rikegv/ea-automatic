import { Inject, Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { DIGAI_POLLING_INTERVALO_MS } from "../../domain/digai";
import { PandapeApiService } from "../../pandape/pandape-api.service";
import { novoResumo } from "../ingestao-pandape/ingestao-ciclo";
import { IngestaoDeParaCliente } from "../ingestao-pandape/ingestao-depara-cliente.service";

/**
 * ─ A VAGA-ESPELHO DO DIGAI PARA DE NASCER EM BRANCO, E O DADO VEM DE DUAS FONTES ───────────────
 *
 * ┌─ O PROBLEMA, MEDIDO EM PRODUCAO EM 08/10/2026 ───────────────────────────────────────────────┐
 * │ `espelharVaga` cria a vaga com o NUMERO DO PANDAPE e mais nada, porque o contrato do Digai    │
 * │ tem oito campos e so um e de vaga (`partnerJobId`). Resultado: 13 vagas sem codigo, sem       │
 * │ titulo e sem cidade, com 223 candidaturas de 223 pessoas penduradas nelas, todas em           │
 * │ PENDENTE_REVISAO. A varredura do Pandape nunca as alcanca: ela varre so vaga ATIVA            │
 * │ (`VacancyStatus=2`) e as 7 que o ATS ainda conhece estao em status 3, ENCERRADA.              │
 * │                                                                                               │
 * │ NAO E DEFEITO DE GRAVACAO, E FALTA DE FONTE. Entao a correcao nao e mexer no espelho: e ir    │
 * │ buscar o dado onde ele existe, nas duas fontes que a casa ja le.                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS FONTES, E NENHUMA DAS DUAS E NOVA ──────────────────────────────────────────────────┐
 * │ 1. A PLANILHA VIVA DO TIME, pelo de/para de vaga (`IngestaoDeParaCliente`): ela traz natureza,│
 * │    linha de servico, cargo e as duas datas. NAO SE COPIA A LOGICA: chama-se o mesmo metodo    │
 * │    publico que a varredura do Pandape chama, com a MESMA regra de escrita e as MESMAS travas. │
 * │    Para o Digai a `reference` e NULA, porque ele nao tem esse campo: sobra a chave do id.      │
 * │ 2. A LISTA DE VAGAS DO PANDAPE (`/v1/Vacancy/List`): titulo (`job`), cidade (`city`),          │
 * │    posicoes (`numberVacancies`) e o STATUS da vaga no ATS.                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CACHE E OBRIGATORIO, E E DECISAO DO DIRETOR ──────────────────────────────────────────────┐
 * │ A API v1 NAO tem busca por id: `getVacancy` LISTA AS 6.944 VAGAS (9,8 MB, medido) e filtra em │
 * │ memoria. Uma chamada POR VAGA faria 13 vagas custarem 128 MB e queimarem cota de uma          │
 * │ integracao cujo teto de 1.000 requisicoes por 5 minutos e COMPARTILHADO com o webhook que     │
 * │ alimenta a folha: excesso do EA atrasa a folha, e isso e risco de seguranca (sec. A.5).       │
 * │                                                                                               │
 * │ ENTAO: UMA chamada por JANELA, guardada, e todas as filtragens em memoria. A janela e a        │
 * │ propria cadencia do ciclo do Digai (`DIGAI_POLLING_INTERVALO_MS`), para que um ciclo inteiro   │
 * │ (que leva ate ~9 min) gaste UMA listagem, e o ciclo seguinte releia o estado do ATS.           │
 * │                                                                                               │
 * │ O QUE FICA GUARDADO E A PROJECAO, nao o payload: quatro campos por vaga, e `description` e     │
 * │ `tags` sao DESCARTADOS na entrada. Guardar 9,8 MB por 15 minutos para usar 4 campos seria      │
 * │ pagar memoria para carregar texto livre do ATS, que e justamente onde nome de gente aparece.   │
 * │                                                                                               │
 * │ UMA CHAMADA EM VOO POR VEZ: duas candidaturas da mesma volta chegando juntas compartilham a    │
 * │ MESMA promessa, senao o cache "de uma chamada" faria duas na primeira vaga de cada janela.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS QUATRO TRAVAS DA ESCRITA, E TODAS VIVEM NA INSTRUCAO ────────────────────────────────────┐
 * │ 1. CANDIDATURA NUNCA E TOCADA. Todo preenchimento e NA VAGA. A FK de `as_candidaturas` e      │
 * │    RESTRICT e protege as 223 por construcao; aqui nao ha instrucao que as alcance.            │
 * │ 2. SO O QUE ESTA NULO. `coalesce(coluna, valor)` no `set` mais `coluna is null` no `where`,   │
 * │    as duas EM SQL. Um `if` em TypeScript dependeria de uma leitura anterior, e entre a leitura │
 * │    e a escrita cabe o salvamento de uma pessoa; alem disso `if` se perde em refatoracao e     │
 * │    instrucao nao. O `espelharVaga` ja declara essa regra: "escrever qualquer coisa ali         │
 * │    apagaria o que o Pandape ou uma pessoa colocou".                                            │
 * │ 3. VAGA RECUSADA E INTOCAVEL (`recusada_em is null`) e SO VAGA EM REVISAO (papel lido do       │
 * │    catalogo `as_vaga_status`, nunca de um literal). Vaga que uma pessoa ja liberou nao recebe  │
 * │    escrita automatica sem a trilha de edicao que toda gravacao em vaga liberada tem. Sao as    │
 * │    mesmas duas guardas do pre-preenchimento da planilha, achadas la pelo `tester`.             │
 * │ 4. `atualizado_em` FICA DE FORA: a volta passa aqui a cada evento e a cada pagina de ciclo, e  │
 * │    empurrar a coluna seria ruido de escrita, nao renovacao. Mesma regua do de/para.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FALHA DO PANDAPE NAO DERRUBA A INGESTAO DO DIGAI ───────────────────────────────────────────┐
 * │ Lista que nao vem (rede, 429 da cota, credencial ausente, integracao inerte) deixa a vaga      │
 * │ exatamente como nasce hoje, e a VOLTA SEGUINTE TENTA DE NOVO: o preenchimento e por coluna     │
 * │ nula, entao ele e naturalmente retentavel, para sempre, sem marca de controle nenhuma.         │
 * │ Perder o rastreio custa um campo vazio; derrubar a ingestao custa a candidatura da pessoa.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DECLARADO, NAO CONSERTADO: ESTA FRENTE E O TERCEIRO ESCRITOR DE `posicoes_oficiais` ───────┐
 * │ Os outros dois sao `as/vagas/vagas.service.ts` (o gesto humano, com trilha) e                 │
 * │ `as/ingestao-pandape/ingestao-repositorio.ts` (o espelho da varredura do Pandape). Os LEITORES │
 * │ sao `domain/candidatura.ts`, que decide a CAPACIDADE da vaga (quanto ainda cabe), e            │
 * │ `as/ingestao-pandape/ingestao-divergencias.service.ts`, que registra quando o ATS discorda do  │
 * │ que uma pessoa digitou.                                                                        │
 * │                                                                                               │
 * │ ELE NAO REESCREVE (as travas acima), MAS PASSA A PREENCHER vaga que estava NULA, e isso muda a │
 * │ contagem de quanto cabe naquela vaga. E o que o diretor pediu (o numero de posicoes do ATS), e │
 * │ fica escrito aqui porque a pergunta "quem mais escreve este dado?" tem de ter resposta no      │
 * │ arquivo, e nao so no relatorio de uma sessao (§A.40, regra 3). Medido: as 13 vagas de hoje     │
 * │ estao com `posicoes_oficiais = 1`, que e o DEFAULT do banco e nao um nulo, entao nelas esta    │
 * │ coluna nao muda; o preenchimento alcanca a vaga cuja meta foi gravada NULA.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: aqui NAO circula dado de pessoa. O que entra e numero de vaga, titulo de vaga e cidade, e o
 * log diz o NUMERO DA VAGA no ATS e QUAIS COLUNAS foram preenchidas, nunca o valor: titulo de vaga e
 * texto livre do ATS, e a casa ja mediu que campo assim chega com nome de gente dentro.
 */

/** A janela do cache: UMA listagem por ciclo do Digai (a cadencia dele e de 15 minutos). */
export const JANELA_DO_RASTREIO_MS = DIGAI_POLLING_INTERVALO_MS;

/**
 * A VAGA DA LISTA DO PANDAPE, COMO ESTE ARQUIVO A LE.
 *
 * E uma forma ESTRUTURAL de proposito, e nao o tipo do cliente da integracao: ela declara os quatro
 * campos que atravessam e nenhum outro, e e o que mantem `description` e `tags` sem caminho ate aqui.
 * `numberVacancies` e `status` chegam como numero na API real e como texto em alguns registros, e as
 * duas formas sao aceitas no tipo porque as duas chegam.
 */
export interface VagaDaListaDoPandape {
  idVacancy: number | string;
  job?: string;
  city?: string;
  numberVacancies?: number | string;
  status?: number | string;
}

/** A projecao guardada no cache: quatro campos, e o resto do payload nao entra. */
interface RastreioDaVaga {
  titulo: string | null;
  cidade: string | null;
  posicoes: number | null;
  status: number | null;
}

@Injectable()
export class DigaiVagaRastreioService {
  private readonly logger = new Logger("DigaiVagaRastreioService");

  /** O cache da janela: a projecao de cada vaga do ATS, pelo numero. Nulo = janela nao lida ainda. */
  private snapshot: Map<string, RastreioDaVaga> | null = null;
  private validoAte = 0;
  /** A listagem em voo, compartilhada: duas voltas simultaneas nao fazem duas chamadas. */
  private emVoo: Promise<Map<string, RastreioDaVaga> | null> | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pandape: PandapeApiService,
    private readonly planilha: IngestaoDeParaCliente,
  ) {}

  /**
   * O ENRIQUECIMENTO DE UMA VAGA-ESPELHO, nas duas fontes, e NUNCA LANCA.
   *
   * A ORDEM E PLANILHA DEPOIS PANDAPE, e ela nao disputa coluna nenhuma: a planilha preenche
   * natureza, linha de servico, cargo e datas; o Pandape preenche titulo, cidade, posicoes e o
   * status do ATS. Conjuntos disjuntos, duas instrucoes independentes, cada uma com a sua trava de
   * coluna nula. Nenhuma das duas depende de a outra ter dado certo.
   */
  async enriquecer(vagaId: string, numeroDaVagaNoPandape: string): Promise<void> {
    await this.prePreencherPelaPlanilha(vagaId, numeroDaVagaNoPandape);
    await this.rastrearNoPandape(vagaId, numeroDaVagaNoPandape);
  }

  /**
   * A FONTE 1: o de/para da planilha viva, pelo MESMO metodo publico que a varredura do Pandape usa.
   *
   * O RESUMO E DESCARTADO AQUI, e isso e deliberado: os contadores daquele servico pertencem ao
   * resumo do ciclo da VARREDURA, e o resumo da passada do Digai tem contrato proprio, com quatro
   * numeros que a operacao ja le. Acrescentar campo a ele nao foi pedido (sec. A.31), e inventar um
   * contador aqui criaria numero que ninguem consome.
   *
   * A CHAVE VAI COMO NUMERO porque e o contrato daquele metodo, e o `isSafeInteger` e o que impede
   * um `NaN` de viajar: numero de vaga nao numerico (o alfabeto do Digai admite mais do que digito)
   * sai por aqui sem consulta nenhuma, em vez de virar chave "NaN" contra a planilha.
   */
  private async prePreencherPelaPlanilha(vagaId: string, numero: string): Promise<void> {
    const idVacancy = Number(numero);
    if (!Number.isSafeInteger(idVacancy) || idVacancy <= 0) return;
    try {
      await this.planilha.resolverERegistrar(
        vagaId,
        { idVacancy, reference: null },
        novoResumo(),
      );
    } catch {
      /*
       * AQUELE SERVICO NAO LANCA POR DESENHO (toda consulta dele e try/catch com nulo). O catch aqui
       * e a trava de ALCANCE, nao desconfianca: se um dia ele passar a lancar, quem paga nao pode ser
       * a candidatura da pessoa que estava entrando. Nada e logado: o payload da planilha carrega
       * razao social, que em MEI e nome de pessoa natural (sec. A.6).
       */
    }
  }

  /**
   * A FONTE 2: a lista de vagas do ATS, do cache da janela, e a escrita das quatro colunas.
   *
   * ┌─ AS TRES COLUNAS HUMANAS, E A QUARTA, QUE E O ESPELHO ──────────────────────────────────────┐
   * │ `nome_divulgacao`, `cidade_id` e `posicoes_oficiais` sao DIGITAVEIS por gente, entao a regra  │
   * │ e so-preenche-nulo: `coalesce` no `set` e `is null` na condicao, as duas em SQL.               │
   * │                                                                                               │
   * │ `status_pandape` e OUTRA COISA: nasceu com a 0152, nenhuma pessoa a digita e este arquivo e o  │
   * │ unico escritor dela. Congela-la no primeiro valor faria a tela afirmar "ativa" sobre vaga que  │
   * │ o ATS encerrou depois, que e a pergunta que a coluna existe para responder: por isso a         │
   * │ condicao dela e `is distinct from`, e nao `is null`.                                           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ AUSENCIA DE INFORMACAO NAO E MUDANCA DE ESTADO (achado do `tester`) ───────────────────────┐
   * │ Vaga presente na lista SEM o campo de status projeta nulo. Sao DUAS protecoes, e as duas sao  │
   * │ necessarias:                                                                                  │
   * │   . a CONDICAO exclui o nulo, senao `is distinct from null` ficaria verdadeiro sobre a linha   │
   * │     que ja tem 3 e a volta sem informacao viraria escrita;                                     │
   * │   . o `coalesce` no `set` protege o valor conhecido quando a instrucao dispara por OUTRO       │
   * │     disjunto (titulo ainda nulo, por exemplo): sem ele, o 3 viraria NULO e a vaga ENCERRADA    │
   * │     voltaria a nao dizer nada, que e o estado que esta frente existe para acabar.              │
   * │ A condicao sozinha nao basta, e e por isso que o `coalesce` ficou: ele nao impede limpar um    │
   * │ status, porque o ATS nunca manda "limpe", ele manda OUTRO numero.                              │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A CIDADE E RESOLVIDA ANTES DA INSTRUCAO, e nao dentro dela: a condicao tem de perguntar pelo ID
   * RESOLVIDO e nao pelo texto. Perguntando pelo texto, cidade que o ATS tem e o catalogo do IBGE
   * nao faria a instrucao rodar a cada volta para gravar `coalesce(cidade_id, null)`, ou seja escrita
   * e log de uma mudanca que nao houve.
   */
  private async rastrearNoPandape(vagaId: string, numero: string): Promise<void> {
    const lista = await this.listaDaJanela();
    if (lista === null) {
      /*
       * A LISTA NAO VEIO: a vaga fica como nasce hoje e a volta seguinte tenta de novo. O aviso nao
       * se repete por vaga porque a leitura e UMA por janela: quem nao conseguiu ler ja avisou.
       */
      return;
    }
    const vaga = lista.get(numero.trim());
    // O ATS NAO CONHECE ESTA VAGA (vaga apagada la, numero de outra origem): nada a espelhar, e isso
    // nao e erro. Cinco das 13 medidas em producao estao nesse caso, e elas dependem de gente.
    if (vaga === undefined) return;

    const cidadeId = await this.cidade(vaga);
    try {
      const linhas = (await this.db.execute(sql`
        update vagas
           set nome_divulgacao = coalesce(nome_divulgacao, ${vaga.titulo}),
               cidade_id = coalesce(cidade_id, ${cidadeId}::integer),
               posicoes_oficiais = coalesce(posicoes_oficiais, ${vaga.posicoes}::integer),
               -- O ESPELHO DO ATS: ATUALIZAVEL, e protegido do nulo. Ver o cabecalho do metodo.
               status_pandape = coalesce(${vaga.status}::integer, status_pandape)
         where id = ${vagaId}::uuid
           -- VAGA RECUSADA E INTOCAVEL, e VAGA JA LIBERADA tambem: preencher campo e mexer. O papel
           -- vem do catalogo, nunca de um literal. (Sem acento e sem backtick: template literal.)
           and recusada_em is null
           and exists (
             select 1 from as_vaga_status s
              where s.codigo = vagas.status and s.papel = 'REVISAO'
           )
           and ((nome_divulgacao is null and ${vaga.titulo}::text is not null)
             or (posicoes_oficiais is null and ${vaga.posicoes}::integer is not null)
             or (cidade_id is null and ${cidadeId}::integer is not null)
             -- AUSENCIA DE INFORMACAO NAO E MUDANCA DE ESTADO: o nulo sai da condicao.
             or (${vaga.status}::integer is not null
                 and status_pandape is distinct from ${vaga.status}::integer))
        returning id
      `)) as unknown as { id: string }[];
      if (linhas.length > 0) {
        /*
         * O LOG DIZ O NUMERO DA VAGA NO ATS E MAIS NADA DE CONTEUDO. O titulo e a cidade NAO saem
         * daqui: sao texto livre do ATS (sec. A.6, mesma regua de `cargoPorTexto`). Quem quiser ver
         * o valor abre a vaga, atras do menu.
         */
        this.logger.log(`Rastreio do Digai: vaga ${numero} enriquecida pela lista do Pandape.`);
      }
    } catch {
      /*
       * FAIL-CLOSED E NULO, NUNCA PERDA DE INGESTAO. O caso concreto e a FK de `cidade_id` ou o
       * CHECK de `posicoes_oficiais` recusando um valor que o ATS mudou entre a leitura e a escrita:
       * a vaga continua como esta e a volta seguinte tenta de novo. Nada e logado porque o erro do
       * driver carrega `detail` com o VALOR que violou a restricao.
       */
    }
  }

  /**
   * A CIDADE DO EA a partir do texto "Cidade - UF" do ATS. NUNCA LANCA: cidade e um campo a mais, e
   * uma consulta de catalogo que falhou nao pode custar as outras tres colunas.
   */
  private async cidade(vaga: RastreioDaVaga): Promise<number | null> {
    if (vaga.cidade === null) return null;
    try {
      return await this.resolverCidade(vaga.cidade);
    } catch {
      return null;
    }
  }

  /**
   * A CIDADE, RESOLVIDA SEM ACENTO E SEM CAIXA, contra `as_cidades` (a base do IBGE).
   *
   * NAO CASANDO, FICA NULO. Inventar cidade e pior do que nao ter: ela alimenta filtro e contagem
   * regional. O `limit 1` e sobre `(uf, nome)` normalizado, que e chave na pratica.
   *
   * POR QUE A CONSULTA ESTA AQUI E NAO VEM DO REPOSITORIO DA VARREDURA: aquele metodo e privado, e
   * torna-lo publico obrigaria a injetar o repositorio INTEIRO da varredura neste arquivo, com os
   * caminhos de escrita de vaga, de matricula e de encerramento dentro. Alcance de escrita de outra
   * frente nao se abre para resolver um `select` de catalogo (sec. A.26). A `translate` e a mesma
   * do caminho da varredura porque a extensao `unaccent` NAO esta instalada no banco.
   */
  private async resolverCidade(texto: string): Promise<number | null> {
    const partes = texto.split("-");
    if (partes.length < 2) return null;
    const uf = (partes.pop() ?? "").trim().toUpperCase();
    const nome = partes.join("-").trim();
    if (uf.length !== 2 || nome === "") return null;
    const linhas = (await this.db.execute(sql`
      select id from as_cidades
       where uf = ${uf}
         and translate(lower(nome), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
             = ${semAcento(nome)}
       limit 1
    `)) as unknown as { id: number }[];
    return linhas[0]?.id ?? null;
  }

  /**
   * A LISTA DA JANELA: do cache enquanto a janela vale, UMA chamada quando ela vence.
   *
   * ┌─ A JANELA ABRE EM QUALQUER DESFECHO, INCLUSIVE FALHA E LISTA VAZIA (decisao do diretor) ────┐
   * │ A pergunta e `agora < validoAte`, e NAO "tenho foto?". A versao anterior so abria a janela    │
   * │ depois de uma leitura bem-sucedida, e o `tester` mediu o preco disso: com `listarVagas`       │
   * │ lancando (ou devolvendo `[]`, que e o que a integracao inerte e um 500 engolido pelo cliente  │
   * │ produzem), as 13 vagas da volta viravam 13 LISTAGENS de 9,8 MB, ou seja ~128 MB, e isso        │
   * │ acontecia EXATAMENTE quando o ATS esta recusando por 429 de cota. A cota e a COMPARTILHADA    │
   * │ com o webhook que alimenta a folha (§A.5): o remedio aumentava a dose do veneno, e a regra do  │
   * │ diretor ("uma chamada por ciclo") quebrava no unico cenario em que ela importa.               │
   * │                                                                                               │
   * │ LEITURA QUE FALHOU VALE PELO CICLO: o enriquecimento simplesmente NAO ACONTECE neste ciclo e a │
   * │ volta seguinte tenta de novo. Nada se perde: o preenchimento e por coluna nula, logo           │
   * │ retentavel para sempre, sem marca de controle nenhuma. NAO devolver a leitura ao caminho       │
   * │ feliz: e isto que impede a frente de voltar a multiplicar o pedido por 13 sob 429.             │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O CACHE ANTIGO NAO E DESCARTADO por uma leitura que falhou: lista velha vale mais que lista
   * nenhuma, porque titulo de vaga nao muda a cada 15 minutos.
   */
  private async listaDaJanela(): Promise<Map<string, RastreioDaVaga> | null> {
    const agora = Date.now();
    if (agora < this.validoAte) return this.snapshot;
    // A MESMA PROMESSA PARA QUEM CHEGAR JUNTO: sem isto, a primeira vaga de cada janela dispararia
    // uma listagem por volta concorrente, que e exatamente o que o cache existe para impedir.
    if (this.emVoo !== null) return this.emVoo;
    this.emVoo = this.listar();
    try {
      return await this.emVoo;
    } finally {
      this.emVoo = null;
    }
  }

  /**
   * A UNICA chamada ao ATS deste arquivo. Projeta na entrada e guarda a projecao.
   *
   * A JANELA E FECHADA NO `finally`, nos TRES desfechos (lista boa, lista vazia, excecao): e a
   * garantia de "uma chamada por ciclo, haja o que houver" (ver `listaDaJanela`). Fechar a janela so
   * no caminho feliz era o defeito medido pelo `tester`: 13 vagas, 13 listagens, sob 429 de cota.
   */
  private async listar(): Promise<Map<string, RastreioDaVaga> | null> {
    this.validoAte = Date.now() + JANELA_DO_RASTREIO_MS;
    try {
      const lista: readonly VagaDaListaDoPandape[] = await this.pandape.listarVagas();
      /*
       * LISTA VAZIA E "NAO LI", E NAO "O ATS NAO TEM VAGA". A integracao INERTE (sem credencial)
       * devolve `[]` pelo mesmo caminho de uma falha engolida no cliente, e gravar o cache VAZIO
       * afirmaria que o ATS nao tem vaga nenhuma: o medido tem 6.944, logo zero nunca e a verdade
       * dele. A FOTO ANTERIOR SOBREVIVE (nao se troca lista boa por lista vazia), mas A JANELA
       * FICA FECHADA de todo jeito, pelo carimbo da entrada do metodo: o vazio tambem custa uma
       * listagem de 9,8 MB, e 13 vagas pedindo de novo e o defeito de cota que o `tester` mediu.
       */
      if (lista.length === 0) return this.snapshot;
      const mapa = new Map<string, RastreioDaVaga>();
      for (const v of lista) {
        const numero = String(v.idVacancy ?? "").trim();
        if (numero === "") continue;
        mapa.set(numero, {
          titulo: textoOuNulo(v.job),
          cidade: textoOuNulo(v.city),
          posicoes: inteiroPositivoOuNulo(v.numberVacancies),
          status: inteiroOuNulo(v.status),
        });
      }
      this.snapshot = mapa;
      this.logger.log(
        `Rastreio do Digai: lista de vagas do Pandape lida (${mapa.size} vagas), ` +
          `valida por ${Math.round(JANELA_DO_RASTREIO_MS / 60000)} min.`,
      );
      return mapa;
    } catch {
      /*
       * §A.6: nada do erro sobe. O cliente do Pandape ja e a casa do status HTTP, e a URL e o
       * payload dele nao passam por aqui. O cache anterior sobrevive: a vaga da volta seguinte usa a
       * foto da janela passada em vez de ficar sem nada.
       */
      this.logger.warn(
        "Rastreio do Digai: a lista de vagas do Pandape nao veio. A vaga segue sem o rastreio e a " +
          "volta seguinte tenta de novo.",
      );
      return this.snapshot;
    }
  }
}

/** Minusculas e sem acento, do mesmo jeito que a varredura faz, e pelo mesmo motivo (sem `unaccent`). */
function semAcento(v: string): string {
  return v
    .toLowerCase()
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c")
    .replace(/ñ/g, "n");
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  return t === "" ? null : t;
}

/** O CHECK do banco e `posicoes_oficiais > 0`, e a coluna e NULAVEL: zero e negativo viram AUSENCIA. */
function inteiroPositivoOuNulo(valor: unknown): number | null {
  const n = inteiroOuNulo(valor);
  return n !== null && n > 0 ? n : null;
}

/** O codigo cru do fornecedor, como inteiro. Vocabulario DELE: nao se valida contra lista fechada. */
function inteiroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
