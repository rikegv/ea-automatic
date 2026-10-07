import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizarChaveExterna } from "../../domain/as-etapa-externa";
import { lerLinhaDePara } from "../../domain/as-etapa-externa";
import {
  ETAPAS_DIGAI,
  chaveDoRegistroDigai,
  classificarDedupDigai,
  desembrulharRespostaDigai,
  emailParaDesempateDigai,
  erroDoRegistro,
  espelhoDaVagaDigai,
  etapaDoResultadoDigai,
  ingestaoHabilitada,
  planoDaImportacao,
  projetarResultadoDigai,
  projetarScreeningDigai,
  situacaoDeNascimentoDigai,
  resumoDaImportacao,
  separarPorFinalizacaoDigai,
  totalDeclaradoDigai,
  traduzirErroDeBanco,
  type ResultadoDigai,
  type ScreeningDigai,
} from "../../domain/digai";
import { DigaiCliente } from "./digai.cliente";
import { DigaiRepositorio } from "./digai-repositorio";

/**
 * ─ A INGESTAO DO DIGAI: A SEGUNDA CHAMADA, O PLANO E A ESCRITA IDEMPOTENTE ─────────────────────
 *
 * ┌─ POR QUE EXISTE UMA SEGUNDA CHAMADA, e ela nao e desperdicio ────────────────────────────────┐
 * │ O evento `NEW_APPLICATION` NAO TRAZ o `partnerJobId`, que e o unico elo com a vaga. Sem ele   │
 * │ nao ha onde pendurar a candidatura, e inventar continua proibido (secao A.5). Entao o worker  │
 * │ busca o resto pelo `screeningId` (mais o `attemptId`, quando o evento o traz), que sao os     │
 * │ unicos identificadores tecnicos que o receptor deixou passar.                                 │
 * │                                                                                               │
 * │ E ELA E DO WORKER, e nunca da rota: quem roda sob o limiter e a FILA. Na rota, a chamada       │
 * │ furaria o teto e ainda amarraria a nossa resposta ao tempo do fornecedor, transformando        │
 * │ qualquer lentidao dele em reentrega dele.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DOIS PORTOES, E ELES NAO SAO REDUNDANTES ───────────────────────────────────────────────────┐
 * │ `DIGAI_API_TOKEN` ausente: nada SAI para a rede (o cliente nasce mudo).                       │
 * │ `DIGAI_INGESTAO_ATIVA` ausente: nada e ESCRITO no banco, mesmo com credencial e mesmo com      │
 * │ leitura bem-sucedida. Uma integracao que comeca a escrever no dia em que o token chega nao foi │
 * │ LIGADA, foi SURPREENDIDA, e o universo medido e de 12.445 pessoas.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o log daqui e CONTAGEM e ID TECNICO. Nenhum campo de pessoa, inclusive no caminho de erro,
 * que passa por `traduzirErroDeBanco` (o `detail` do driver carrega o VALOR que violou a restricao)
 * e por `erroDoRegistro` (que so ecoa o identificador tecnico).
 */
/**
 * ─ O RESUMO DE UMA PASSADA, E ELE TEM QUATRO CASOS E NAO TRES ──────────────────────────────────
 *
 * ESCRITO, ADIADO, IGNORADO e NAO FINALIZOU. Os quatro existem porque cada um tem MOTIVO distinto,
 * e motivo e o que o log precisa dizer: ADIADO e falta de elo com a vaga (reprocessavel quando o
 * `partnerJobId` aparecer), IGNORADO e quem a base ja conhece, e NAO FINALIZOU e a regua de
 * admissao de hoje (`INGERIR_SOMENTE_QUEM_FINALIZOU`, em `domain/digai.ts`).
 *
 * Sem o quarto numero a soma nao fecha com o total lido, e diferenca sem nome vira "sumiu no
 * caminho", que e o modo de falha mais caro de uma ingestao silenciosa.
 */
export interface ResumoDaPassadaDigai {
  escritos: number;
  adiados: number;
  ignorados: number;
  /** Recusados pela regua de admissao: triagem NAO finalizada. Nada foi escrito por causa deles. */
  naoFinalizaram: number;
}

/** A passada que nao chegou a acontecer (portao da credencial, ou evento sem registro). */
const PASSADA_VAZIA: ResumoDaPassadaDigai = {
  escritos: 0,
  adiados: 0,
  ignorados: 0,
  naoFinalizaram: 0,
};

@Injectable()
export class DigaiImportacaoService {
  private readonly logger = new Logger("DigaiImportacaoService");

  private readonly cliente: DigaiCliente;

  constructor(
    private readonly config: ConfigService,
    private readonly repo: DigaiRepositorio,
  ) {
    this.cliente = new DigaiCliente({ token: this.config.get<string>("DIGAI_API_TOKEN") });
  }

  /** A integracao esta ligada dos DOIS lados? Quem orquestra pergunta antes de gastar uma volta. */
  get ativa(): boolean {
    return this.cliente.ativo && this.escritaLiberada;
  }

  /**
   * PODE SAIR PARA A REDE? E o PRIMEIRO portao, sozinho, e ele existe separado de `ativa` porque a
   * varredura precisa saber se vale a pena LER mesmo quando a escrita esta desligada: ler com a
   * escrita fechada e justamente como se liga uma ingestao de 12.445 pessoas sem surpresa.
   */
  get podeLer(): boolean {
    return this.cliente.ativo;
  }

  /** O SEGUNDO PORTAO, lido do ambiente na borda e decidido pelo dominio puro. */
  private get escritaLiberada(): boolean {
    return ingestaoHabilitada({
      DIGAI_INGESTAO_ATIVA: this.config.get<string>("DIGAI_INGESTAO_ATIVA"),
    });
  }

  /**
   * ─ A SEGUNDA CHAMADA: O QUE O EVENTO NAO TROUXE ────────────────────────────────────────────────
   *
   * A leitura e por `screeningId` mais `userId`, que e o endpoint que a grade autoriza e que a
   * varredura provou responder. O caminho e montado com identificadores que JA passaram pelo
   * alfabeto fechado no receptor, e a grade confere de novo: as duas fechaduras sao de proposito.
   *
   * A PROJECAO POR ALLOWLIST ACONTECE AQUI, antes de o dado chegar ao dominio, e de novo no
   * repositorio, que so cita colunas nominalmente. E a mesma repeticao que o Pandape faz, e ela e o
   * que mantem `stages` e os campos de julgamento sem caminho ate o banco, o log ou a fila.
   */
  async buscarRegistro(ids: {
    screeningId: string;
    userId: string;
  }): Promise<ResultadoDigai | null> {
    /*
     * ─ A ROTA DO PAR E `v1`, E ISSO FOI MEDIDO. NAO "CONSERTAR" PARA v2 ─────────────────────────
     *
     * Sondagem da producao do fornecedor em 29/09/2026, no MESMO par (screening mais usuario):
     *   GET /api/v2/public/screenings/{id}/users/{id}/results  ->  HTTP 404
     *   GET /api/v1/public/screenings/{id}/users/{id}/results  ->  HTTP 200
     *
     * A RAZAO ANTIGA DE PREFERIR v2 NAO SE APLICA A ESTA ROTA. A v1 era evitada porque a LISTAGEM
     * v1 nao trazia os campos que interessam; o registro UNICO da v1 traz `cpf`, `appliedAt` e
     * `partnerUserId`, conferido campo a campo. A LISTAGEM continua em v2
     * (`/api/v2/public/screenings/{id}/results`, que responde 200): A VERSAO E POR ROTA, NAO POR
     * INTEGRACAO, e uniformizar as duas quebra uma das duas.
     *
     * A grade autoriza `v\d+` nos dois casos, entao ela nao pega esta troca: quem pega e o
     * comentario e o teste. Um 404 aqui nao para nada, so faz a ingestao parecer "sem evento".
     */
    const resposta = await this.cliente.ler(
      `/api/v1/public/screenings/${ids.screeningId}/users/${ids.userId}/results`,
    );
    /*
     * ESTA ROTA DEVOLVE UM REGISTRO PLANO dentro de `data.value`, e nao uma lista. A lista e lida
     * assim mesmo porque desembrulhar e de graca e porque o mesmo metodo serve a rota de listagem;
     * quem conhece o formato do fornecedor e `desembrulharRespostaDigai`, e so ela.
     */
    const { conteudo, lista } = desembrulharRespostaDigai(resposta);
    for (const cru of lista) {
      const projetado = projetarResultadoDigai(cru);
      if (projetado !== null && projetado.userId === ids.userId) return projetado;
    }
    const unico = projetarResultadoDigai(conteudo);
    return unico !== null && unico.userId === ids.userId ? unico : null;
  }

  /**
   * ─ A LISTAGEM DE SCREENINGS: A PRIMEIRA REQUISICAO DO CICLO DO POLLING ─────────────────────────
   *
   * ┌─ A ROTA E `v1`, E A VERSAO E POR ROTA (a mesma armadilha de `buscarRegistro`) ──────────────┐
   * │ `GET /api/v1/public/screenings?page=1` respondeu 200 em 29/09/2026, com `data.value` valendo │
   * │ `{ page, total, screenings: [...] }` e 522 screenings numa unica pagina. Uniformizar isto    │
   * │ para v2 por simetria quebraria a listagem, do mesmo jeito que uniformizar o registro unico   │
   * │ para v2 o quebra (la a v2 devolve 404).                                                       │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `page` VAI POR PARAMETRO, e nao colado no caminho: a query tem porta propria (`validarParams`,
   * com coleira de nome, tamanho e conteudo), e query embutida no path e a porta sem coleira.
   *
   * A PROJECAO POR ALLOWLIST ACONTECE AQUI: dos 17 campos do screening, dois atravessam (`id` e
   * `updatedAt`). `webAccessLink` e `whatsappAccessLink` ficam de fora com razao propria, sao URL de
   * acesso, na mesma regua da URL do Pandape (secao A.6).
   */
  async listarScreenings(pagina: number): Promise<{ screenings: ScreeningDigai[]; total: number | null }> {
    const resposta = await this.cliente.ler("/api/v1/public/screenings", { page: pagina });
    const { conteudo, lista } = desembrulharRespostaDigai(resposta);
    const screenings: ScreeningDigai[] = [];
    for (const cru of lista) {
      const projetado = projetarScreeningDigai(cru);
      if (projetado !== null) screenings.push(projetado);
    }
    return { screenings, total: totalDeclaradoDigai(conteudo) };
  }

  /**
   * ─ UMA PAGINA DE RESULTADOS DE UM SCREENING: A FOLHA DO LEQUE ──────────────────────────────────
   *
   * ┌─ AQUI A ROTA E `v2`, E ISSO NAO E INCONSISTENCIA ───────────────────────────────────────────┐
   * │ `GET /api/v2/public/screenings/{id}/results?page=1` devolve `{ page, total, candidates }` em  │
   * │ `data.value`. A LISTAGEM de resultados e v2; o REGISTRO UNICO do par (screening, usuario) e  │
   * │ v1, porque a v2 daquela rota devolve 404. As duas coisas foram medidas no mesmo dia, no       │
   * │ mesmo screening: a versao e por ROTA, nao por integracao.                                     │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * DEVOLVE O `total` DECLARADO junto dos registros, porque e ele que decide se ha proxima pagina
   * (`haProximaPaginaDigai`). O chamador nao presume que uma pagina basta: a PAGINA MEDIDA em 29/09
   * e de 100, e 78 dos 528 screenings passam disso (o maior com 1.225). A amostra antiga, de 58 de
   * 58 numa pagina so, e exatamente o tipo de amostra que induz a presuncao contraria.
   */
  async lerPaginaDeResultados(
    screeningId: string,
    pagina: number,
  ): Promise<{ registros: ResultadoDigai[]; total: number | null }> {
    const resposta = await this.cliente.ler(
      `/api/v2/public/screenings/${screeningId}/results`,
      { page: pagina },
    );
    const { conteudo, lista } = desembrulharRespostaDigai(resposta);
    const registros: ResultadoDigai[] = [];
    for (const cru of lista) {
      const projetado = projetarResultadoDigai(cru);
      if (projetado !== null) registros.push(projetado);
    }
    return { registros, total: totalDeclaradoDigai(conteudo) };
  }

  /**
   * ─ O CICLO DE UM EVENTO, DA FILA ATE O BANCO ───────────────────────────────────────────────────
   *
   * A ordem e: busca, plano, escrita. Planejar ANTES de escrever e a diferenca entre "nao duplicou"
   * e "estourou a transacao no meio do lote e perdeu as linhas boas", porque o unique de
   * `as_candidaturas` e PARCIAL e so cobre as situacoes vivas.
   */
  async processarEvento(ids: {
    screeningId: string;
    userId: string;
  }): Promise<ResumoDaPassadaDigai> {
    if (!this.cliente.ativo) {
      this.logger.log("Ingestao do Digai INERTE: DIGAI_API_TOKEN nao configurado.");
      return PASSADA_VAZIA;
    }
    const registro = await this.buscarRegistro(ids);
    if (registro === null) {
      this.logger.warn(`Evento do Digai sem registro correspondente (usuario ${ids.userId}).`);
      return PASSADA_VAZIA;
    }
    return this.importar([registro]);
  }

  /**
   * A IMPORTACAO DE UM LOTE JA PROJETADO. Idempotente pelo `userId`, que a varredura provou estavel
   * (o documento aparece DEPOIS no MESMO registro, entao chave por documento duplicaria exatamente
   * quem finalizou a triagem).
   */
  async importar(registros: ResultadoDigai[]): Promise<ResumoDaPassadaDigai> {
    /*
     * ─ O PORTAO DA ADMISSAO VEM ANTES DE TUDO, E E POR ISSO QUE ELE PROTEGE ─────────────────────
     *
     * A regua e do DOMINIO (`separarPorFinalizacaoDigai`), e a decisao de hoje e do diretor: SO
     * entra quem FINALIZOU a triagem. Separar AQUI, na primeira linha, e o que garante que quem nao
     * finalizou nao vira pessoa, nem candidatura, nem vaga: ele nao chega a ser consultado no
     * banco, nao entra no plano e nao tem espelho de vaga criado. Filtrar mais adiante deixaria a
     * leitura da base acontecer por causa de quem nunca ia ser escrito.
     *
     * COMO SE ABRE PARA OS DEMAIS: `INGERIR_SOMENTE_QUEM_FINALIZOU`, em `domain/digai.ts`. Uma
     * linha, e nada aqui muda.
     */
    const { admitidos, naoFinalizaram } = separarPorFinalizacaoDigai(registros);
    if (naoFinalizaram.length > 0) {
      /*
       * §A.6: CONTAGEM e mais nada. Nem o `userId`, que aqui nao serve para investigar (nao houve
       * falha a investigar: houve regra aplicada), e que sairia uma vez por linha do lote.
       *
       * A CONTAGEM TEM NOME PROPRIO, e nao se soma a `adiados`: adiado e falta de elo com a vaga e
       * e reprocessavel; este NAO foi adiado, foi RECUSADO pela regua de hoje. Confundir os dois
       * faria quem le o log procurar um `partnerJobId` que nunca faltou.
       */
      this.logger.log(
        `Ingestao do Digai: ${naoFinalizaram.length} registro(s) fora da regua de admissao ` +
          `(triagem nao finalizada). Nada foi escrito por causa deles.`,
      );
    }

    if (!this.escritaLiberada) {
      /*
       * O SEGUNDO PORTAO FECHA AQUI, DEPOIS DA LEITURA E ANTES DA ESCRITA, de proposito: assim a
       * integracao pode ser exercitada de ponta a ponta com credencial, sem tocar uma linha do
       * banco, que e o unico jeito honesto de ligar uma ingestao de 12.445 pessoas.
       */
      const resumo = resumoDaImportacao(registros);
      this.logger.log(
        `Ingestao do Digai DESLIGADA (DIGAI_INGESTAO_ATIVA ausente): ${resumo.total} registro(s) lido(s), zero escrito(s).`,
      );
      return {
        escritos: 0,
        adiados: admitidos.length,
        ignorados: 0,
        naoFinalizaram: naoFinalizaram.length,
      };
    }

    const jaImportados = await this.chavesConhecidas(admitidos);
    const plano = planoDaImportacao({ registros: admitidos, jaImportados });
    const porChave = new Map(admitidos.map((r) => [chaveDoRegistroDigai(r), r]));

    let escritos = 0;
    for (const item of plano.criar) {
      const registro = porChave.get(item.chave);
      if (registro === undefined) continue;
      try {
        await this.gravar(registro);
        escritos += 1;
      } catch (err) {
        /*
         * §A.6 NO CAMINHO MENOS VIGIADO DE TODOS. O erro do driver carrega `detail` com o VALOR que
         * violou a restricao e `query` com os parametros: um `logger.error(err)` publicaria o
         * documento da pessoa sem ninguem escrever a palavra documento em lugar nenhum. So a
         * mensagem TRADUZIDA sai daqui, e o identificador do registro vem pelo funil proprio.
         */
        this.logger.error(erroDoRegistro(registro, traduzirErroDeBanco(err)));
      }
    }
    if (plano.adiar.length > 0) {
      // ADIAR E REPROCESSAVEL: o registro volta a ser criavel quando o elo com a vaga aparecer.
      // Adiamento que marcasse o registro como processado seria descarte com outro nome.
      this.logger.warn(
        `Ingestao do Digai: ${plano.adiar.length} registro(s) adiado(s) por falta de elo com a vaga.`,
      );
    }
    return {
      escritos,
      adiados: plano.adiar.length,
      ignorados: plano.ignorar.length,
      naoFinalizaram: naoFinalizaram.length,
    };
  }

  /** As chaves que a base ja conhece. Uma consulta por registro, e o lote de hoje e pequeno. */
  private async chavesConhecidas(registros: ResultadoDigai[]): Promise<string[]> {
    const conhecidas: string[] = [];
    for (const r of registros) {
      const achado = await this.repo.candidatoPorIdentidade(r.userId);
      if (achado !== null) conhecidas.push(r.userId);
    }
    return conhecidas;
  }

  /**
   * ─ A GRAVACAO DE UM REGISTRO: ETAPA, PESSOA, VAGA, CANDIDATURA ────────────────────────────────
   *
   * A ETAPA VEM PRIMEIRO PORQUE E ELA QUE DECIDE SE ENTRA. Sem de/para, NADA e escrito: nem pessoa,
   * nem identidade, nem candidatura. Ingerir a pessoa e segurar so a candidatura coletaria dado de
   * gente para uso nenhum, que e o contrario da minimizacao (protocolo, secao 3).
   *
   * O DEDUP E FAIL-CLOSED E NESTA ORDEM: identidade primeiro, documento como desempate, NOME NUNCA.
   * Nome e chave fraca, e casar por ele funde homonimos sem volta.
   */
  private async gravar(registro: ResultadoDigai): Promise<void> {
    const chaveExterna = normalizarChaveExterna(etapaDoResultadoDigai(registro));
    const resolucao = lerLinhaDePara(await this.repo.deParaEtapa(chaveExterna));
    if (!resolucao.mapeada) {
      /*
       * FAIL-CLOSED COM REGISTRO. A recusa sem aviso vira perda silenciosa, e o que sobe aqui e a
       * CHAVE do de/para, que e texto de CONFIGURACAO nossa (as duas linhas de `ETAPAS_DIGAI`),
       * nunca texto livre vindo do fornecedor: nao ha nome de pessoa que caiba nela.
       */
      this.logger.warn(
        `Ingestao do Digai sem de/para para a chave '${chaveExterna}'. Nada foi escrito. ` +
          `Chaves esperadas: ${ETAPAS_DIGAI.map((e) => e.chaveExterna).join(", ")}.`,
      );
      return;
    }

    const espelho = espelhoDaVagaDigai(registro);
    if (espelho === null) return;

    const pessoaId = await this.resolverPessoa(registro);
    if (pessoaId === null) return;

    /*
     * ─ A SITUACAO DE NASCIMENTO NAO CONSOME POSICAO, E AGORA ISSO E CODIGO E NAO PROMESSA ───────
     *
     * A ocupacao da vaga e DERIVADA (`consomePosicao`), e trazer triagem numa situacao que consome
     * TRANCA a vaga sem gerar erro nenhum: o numero que decide se ainda cabe alguem passaria a
     * contar quem so foi triado. O valor podia vir da LINHA do de/para, que e dado editavel, entao
     * o comentario antigo so valia para o fallback. `situacaoDeNascimentoDigai` assere os dois.
     */
    const nascimento = situacaoDeNascimentoDigai(resolucao.situacao);
    if (nascimento.descartada) {
      // O AVISO E SOBRE CONFIGURACAO, e cita a chave do de/para, que e texto nosso: nao ha nome de
      // pessoa que caiba nele (§A.6). Sem o aviso, a linha errada seguiria ignorada para sempre.
      this.logger.warn(
        `Ingestao do Digai: a linha de de/para da chave '${chaveExterna}' traz situacao que CONSUME ` +
          `posicao da vaga. Ela foi descartada e o nascimento usou a situacao padrao. Corrija a linha.`,
      );
    }

    const vaga = await this.repo.espelharVaga(String(espelho.id_vacancy_pandape));
    await this.repo.garantirCandidatura({
      candidatoId: pessoaId,
      vagaId: vaga.id,
      etapaCodigo: resolucao.etapaCodigo,
      situacao: nascimento.situacao,
    });
  }

  /**
   * ─ RESOLVER A PESSOA: CLASSIFICA PELA REGUA PURA, DEPOIS APLICA OS EFEITOS ─────────────────────
   *
   * Devolve o id da pessoa, ou `null` quando a ingestao NAO PODE DECIDIR (conflito para revisao).
   *
   * A DECISAO E `classificarDedupDigai` (`domain/digai.ts`), PURA E SEM EFEITO. Este metodo so a
   * alimenta com o resultado das consultas e depois escreve o que o desfecho manda. A mesma funcao
   * e consumida pelo harness de medicao (dry-run somente-leitura), e e ela que garante que o que a
   * medicao conta e EXATAMENTE o que a ingestao faria. A ordem dos degraus (identidade, CPF, e-mail,
   * ficha nova) e a razao de cada ramo vivem la, junto da decisao; aqui ficam so os EFEITOS.
   */
  private async resolverPessoa(registro: ResultadoDigai): Promise<string | null> {
    const dados = {
      nome: registro.name ?? "",
      cpf: registro.cpf,
      email: registro.email,
      telefone: registro.phoneNumber,
    };

    const porIdentidade = await this.repo.candidatoPorIdentidade(registro.userId);
    const porDocumento =
      registro.cpf === null ? null : await this.repo.candidatoPorDocumento(registro.cpf);

    /*
     * ─ O E-MAIL E CONSULTADO SO QUANDO A IDENTIDADE NAO RESOLVEU, E ISSO E A LAZINESS DOS DEGRAUS ─
     *
     * O degrau de cima SEMPRE vence o de baixo: quando a identidade externa ja decidiu, o e-mail
     * NEM E PERGUNTADO (o teste "o e-mail nem e consultado" trava isso). A guarda `porIdentidade
     * === null` e o que preserva esse comportamento depois de a decisao virar funcao pura.
     *
     * A REGUA DO E-MAIL E APLICADA AQUI (`emailParaDesempateDigai`), e nao no banco: quem decide
     * "este endereco serve?" e o DOMINIO, e nao a sorte de a consulta nao achar nada. O CPF do
     * registro VAI JUNTO, e o parametro e OBRIGATORIO: a guarda do CPF divergente (emenda E-4) e
     * avaliada no banco, onde o documento da outra pessoa nao precisa ser trazido para a memoria da
     * aplicacao, e parametro opcional faria o chamador que o esquecesse APAGAR a guarda sem erro.
     */
    let porEmail: Awaited<ReturnType<DigaiRepositorio["candidatoPorEmail"]>> = null;
    if (porIdentidade === null) {
      const correio = emailParaDesempateDigai(registro.email);
      porEmail =
        correio === null ? null : await this.repo.candidatoPorEmail(correio, registro.cpf);
    }

    const desfecho = classificarDedupDigai({ porIdentidade, porDocumento, porEmail });

    switch (desfecho.tipo) {
      case "COLISAO_IDENTIDADE_DOCUMENTO":
      case "COLISAO_CPF_EMAIL":
        /*
         * DUAS CHAVES APONTAM PARA DUAS PESSOAS DIFERENTES E IDENTIFICADAS. A ingestao NAO ESCOLHE e
         * NAO FUNDE: fusao de fichas e irreversivel, e o que se junta por engano nao se separa mais
         * porque ninguem sabe qual candidatura era de quem. Vira linha de revisao, ancorada na ponta
         * da chave mais forte (a identidade, ou o CPF). §A.6: so o `userId` viaja no conflito.
         * MEDIDO em 02/10/2026: 121 colisoes CPF-contra-e-mail reais entre os 3.723 em que as duas
         * chaves casam. Nao e hipotese.
         */
        await this.repo.registrarConflito(desfecho.ancora, registro.userId);
        return null;

      case "CASOU_IDENTIDADE":
        /*
         * A ATUALIZACAO E CHAMADA SEMPRE, INCLUSIVE SEM NOME (ressalva D2, 29/09): ela carrega a
         * GUARDA DE ANONIMIZACAO, e pular a chamada quando o nome e vazio pendurava candidatura VIVA
         * numa ficha expurgada, desfazendo o expurgo pelo lado. Nome vazio nao apaga nome (o
         * repositorio trata o vazio com `nullif`), e a reentrega identica nao empurra o relogio.
         */
        await this.repo.atualizarCandidato(desfecho.pessoaId, dados);
        return desfecho.pessoaId;

      case "CASOU_CPF":
        /*
         * O CPF E O DESEMPATE PRIMARIO: a identidade nova e ANEXADA a quem ja existe, em vez de
         * partir a mesma pessoa em duas fichas. `atualizarCandidato` tambem aqui pelo motivo do ramo
         * de identidade: a chamada e tambem a guarda de anonimizacao.
         */
        await this.repo.atualizarCandidato(desfecho.pessoaId, dados);
        await this.repo.anexarIdentidade(desfecho.pessoaId, registro.userId, new Date());
        return desfecho.pessoaId;

      case "CASOU_CPF_COM_EMAIL_AMBIGUO":
        /*
         * ─ O CPF RESOLVEU, MAS O E-MAIL CASOU DUAS FICHAS: O CPF DECIDE, E O ENDERECO NAO SE PROPAGA ─
         *
         * O CPF e unico no banco, logo casar por ele e EXATO, e a ambiguidade do e-mail e RUIDO, nao
         * evidencia de que sejam duas pessoas (por isso aqui NAO se abstem; a abstencao prenderia o
         * registro em todo ciclo por duas linhas que nem sao dele).
         *
         * O ENDERECO NAO E PROPAGADO POR ESTE CAMINHO (`email: null`), e isso e cavalete da auditoria
         * (veto V-3): sabe-se que aquele endereco JA esta em duas fichas, e grava-lo numa terceira
         * (via `coalesce(email, novo)`) pioraria a ambiguidade que acabou de ser detectada. O resto
         * dos dados segue, porque quem casou foi o CPF. A ambiguidade vira conflito ancorado na ficha
         * do CPF (`candidato_id` e NOT NULL, e so aqui ha ficha legitima para ancorar).
         *
         * §A.6: so o `userId`. A palavra e "a chave forte" e nao "o documento" porque a varredura de
         * PII procura a pista "documento" por substring, e a frase em prosa a reprovaria mesmo sem
         * logar documento nenhum (mesmo precedente do `job.name` em `digai-fila.service.ts`).
         */
        this.logger.warn(
          `Ingestao do Digai: mais de um cadastro carrega o contato do usuario ${registro.userId}. ` +
            `A chave forte resolveu a pessoa, o contato NAO e propagado por este caminho, e o caso ` +
            `fica registrado para revisao humana.`,
        );
        await this.repo.registrarConflito(desfecho.pessoaId, registro.userId);
        await this.repo.atualizarCandidato(desfecho.pessoaId, { ...dados, email: null });
        await this.repo.anexarIdentidade(desfecho.pessoaId, registro.userId, new Date());
        return desfecho.pessoaId;

      case "CASOU_EMAIL_LIMPO":
        /*
         * ─ O DEGRAU 3: O E-MAIL DESEMPATOU, E ELE SO ANEXA A IDENTIDADE. NAO ESCREVE DADO ──────────
         *
         * Sem este degrau, 82% da populacao do Digai (ja na plataforma, e em 84% dos casos sem CPF)
         * ganharia uma SEGUNDA ficha. Com ele, a ficha que ja existe e reusada.
         *
         * POR QUE AQUI NAO SE CHAMA `atualizarCandidato` (veto da auditoria, V-2): `atualizarCandidato`
         * grava `cpf = coalesce(cpf, novo)` e o nome. No degrau 2 isso e legitimo (quem casou foi o
         * CPF, unico e exato); AQUI quem casou foi a chave MAIS FRACA, e escrever identidade de
         * terceiro por decisao dela envenena `uq_as_candidatos_cpf` em cascata: o CPF do registro
         * viraria dado da ficha de OUTRA pessoa, a ficha verdadeira daquele CPF nunca mais nasceria
         * (23505 capturado, registro pulado em silencio), e `candidatoPorDocumento` passaria a mentir.
         *
         * ┌─ A DECISAO 5b (diretor, 07/10/2026) E O QUE O CODIGO DE FATO FAZ: NAO SAO A MESMA COISA ─┐
         * │ A decisao: o e-mail LIMPO PODE preencher o CPF vazio (caminho seguro, uma ficha), e o     │
         * │ AMBIGUO nunca. A premissa de como isso aconteceria (MAPA-VERDE E-4): "no ciclo seguinte a │
         * │ identidade anexada faz o registro casar pelo DEGRAU 1, e `cpf = coalesce(cpf, novo)`      │
         * │ preenche o nulo". ESSA PREMISSA ESTA ERRADA, e foi MEDIDA em teste (07/10): o registro    │
         * │ de `userId` ja conhecido e IGNORADO em `chavesConhecidas`/`planoDaImportacao` ANTES de    │
         * │ `gravar`, entao o degrau 1 (e o `coalesce` dele) NAO roda no ciclo seguinte. O teste      │
         * │ existente `digai-dedup-ordem-das-chaves` ja afirma "identidade conhecida: o registro e    │
         * │ IGNORADO". Logo, HOJE, o e-mail LIMPO anexa a identidade e o CPF vazio da ficha           │
         * │ permanece vazio: a ingestao do Digai NAO o preenche em ciclo nenhum (o degrau 1 so e      │
         * │ alcancado na CORRIDA entre as duas leituras, nao na reentrega normal).                    │
         * │                                                                                            │
         * │ DECISAO DO DIRETOR (07/10/2026): NAO PREENCHE, por decisao de SEGURANCA. O CPF vazio      │
         * │ PERMANECE vazio, o e-mail NUNCA escreve CPF de ninguem, e o veto V-2 FICA de pe.           │
         * │ Fundamento: e-mail nao e identidade confiavel (6 e-mails ja medidos com 12 CPFs) e        │
         * │ escrever CPF a partir de e-mail e irreversivel. Os 117 casos (so o e-mail casa, sem CPF   │
         * │ na base) ficam com CPF vazio e entram pelo acesso por e-mail do Portal quando precisarem.  │
         * │ O COMPORTAMENTO DE HOJE E O DECIDIDO: nada muda, a auditoria anterior segue valida, e      │
         * │ esta linha existe para a proxima sessao NAO reabrir por achar que foi descuido.            │
         * └─────────────────────────────────────────────────────────────────────────────────────────┘
         *
         * O e-mail AMBIGUO continua NUNCA preenchendo, e isso o codigo faz certo: ele nem anexa
         * identidade (ver `EMAIL_AMBIGUO_SEM_ANCORA`), entao nao casa por identidade em ciclo nenhum.
         * A guarda de anonimizacao nao fica descoberta: `anexarIdentidade` tem o
         * `where exists (... anonimizado_em is null)` atomico, e `candidatoPorEmail` ja recusa ficha
         * anonimizada.
         */
        await this.repo.anexarIdentidade(desfecho.pessoaId, registro.userId, new Date());
        return desfecho.pessoaId;

      case "EMAIL_AMBIGUO_SEM_ANCORA":
        /*
         * O e-mail casou DUAS fichas e nenhuma chave forte resolveu. A ingestao NAO ESCOLHE e NAO
         * FUNDE, e tambem NAO registra conflito: `as_ingestao_conflitos.candidato_id` e NOT NULL, e
         * carimbar a linha com uma das fichas ambiguas seria a escolha arbitraria que a guarda
         * recusa. Fica o aviso, com o `userId` e mais nada (§A.6). Decisao mantida pelo coordenador.
         */
        this.logger.warn(
          `Ingestao do Digai: mais de um cadastro carrega o contato do usuario ${registro.userId}, ` +
            `e nenhuma chave forte resolveu. A ingestao NAO escolhe e NAO funde: fica para revisao.`,
        );
        return null;

      case "NOVA":
        if (dados.nome.trim() === "") {
          // Sem nome nao ha pessoa a acompanhar (o schema diz que ele e o unico obrigatorio), e
          // inventar um rotulo encheria a base de linhas que ninguem reconhece.
          this.logger.warn(erroDoRegistro(registro, "registro sem identificacao minima"));
          return null;
        }
        {
          const nova = await this.repo.criarCandidato(dados);
          await this.repo.anexarIdentidade(nova.id, registro.userId, new Date());
          return nova.id;
        }
    }
  }

  /*
   * ─ `resumirParaLog` FOI REMOVIDO, E A REMOCAO E A CORRECAO ──────────────────────────────────
   *
   * ┌─ O QUE ELE ERA, e por que nao podia ficar ───────────────────────────────────────────────┐
   * │ `resumirParaLog(valor: unknown)` delegava a `mascararParaLog` e NAO TINHA UM UNICO         │
   * │ CONSUMIDOR em `src/`: era porta aberta sem dono. Como aceitava `unknown`, ela dava passagem │
   * │ ao caminho de STRING da mascara, e a camada 2 (`redigirPorForma`) NAO ALCANCA NOME: texto   │
   * │ solto do fornecedor atravessaria inteiro. A garantia de que ninguem faria isso era          │
   * │ DISCIPLINA, e disciplina nao sobrevive a proxima sessao.                                    │
   * │                                                                                             │
   * │ ESCOLHEU-SE REMOVER, e nao criar uma segunda porta para texto nosso: porta nova sem         │
   * │ consumidor e a MESMA arma carregada com outro nome (secao A.31, nao se constroi o que       │
   * │ ninguem pediu). No dia em que a casa precisar logar texto de CONFIGURACAO NOSSA, cria-se a  │
   * │ porta COM o chamador, e o nome dela dira que e texto nosso.                                 │
   * │                                                                                             │
   * │ O MECANISMO que substitui a disciplina esta em `mascararParaLog`, que passou a aceitar SO   │
   * │ ESTRUTURA (objeto ou lista) no tipo, e a SUPRIMIR POR INTEIRO qualquer outra coisa em       │
   * │ tempo de execucao. O que a camada 1 nao pode inspecionar, nao sai.                          │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
}

/*
 * A LEITURA DO ENVELOPE SAIU DAQUI, e o lugar dela e `domain/digai.ts`
 * (`desembrulharRespostaDigai`). A versao que morava neste arquivo aceitava `array no topo`,
 * `{ results: [] }` e `{ data: [] }`, e o fornecedor nao devolve NENHUMA DAS TRES: ela lia lista
 * vazia de toda resposta real, e a ingestao inteira saia por "sem registro correspondente", sem
 * erro e sem alarme.
 */
