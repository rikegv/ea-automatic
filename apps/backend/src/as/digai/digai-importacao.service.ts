import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizarChaveExterna } from "../../domain/as-etapa-externa";
import { lerLinhaDePara } from "../../domain/as-etapa-externa";
import {
  ETAPAS_DIGAI,
  chaveDoRegistroDigai,
  desembrulharRespostaDigai,
  erroDoRegistro,
  espelhoDaVagaDigai,
  etapaDoResultadoDigai,
  ingestaoHabilitada,
  planoDaImportacao,
  projetarResultadoDigai,
  situacaoDeNascimentoDigai,
  resumoDaImportacao,
  separarPorFinalizacaoDigai,
  traduzirErroDeBanco,
  type ResultadoDigai,
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

  /** Devolve o id da pessoa, ou `null` quando a ingestao NAO PODE DECIDIR (conflito para revisao). */
  private async resolverPessoa(registro: ResultadoDigai): Promise<string | null> {
    const porIdentidade = await this.repo.candidatoPorIdentidade(registro.userId);
    const porDocumento =
      registro.cpf === null ? null : await this.repo.candidatoPorDocumento(registro.cpf);
    const dados = {
      nome: registro.name ?? "",
      cpf: registro.cpf,
      email: registro.email,
      telefone: registro.phoneNumber,
    };

    if (porIdentidade !== null) {
      if (porDocumento !== null && porDocumento.id !== porIdentidade.id) {
        /*
         * A IDENTIDADE APONTA PARA UMA PESSOA E O DOCUMENTO PARA OUTRA. A ingestao NAO ESCOLHE e
         * NAO FUNDE: fusao de fichas e irreversivel, e o que se junta por engano nao se separa
         * depois porque ninguem sabe mais qual candidatura era de quem. Vira linha de revisao.
         */
        await this.repo.registrarConflito(porIdentidade.id, registro.userId);
        return null;
      }
      /*
       * A ATUALIZACAO E CHAMADA SEMPRE, INCLUSIVE SEM NOME, E ISSO E A RESSALVA D2 (29/09).
       *
       * Ela nao existe so para gravar: e ela que carrega a GUARDA DE ANONIMIZACAO, e o `if` de
       * antes ("so chama quando ha nome") fazia a guarda nao rodar justamente no caso do registro
       * pobre. O fluxo seguia e pendurava candidatura VIVA numa ficha expurgada, o que protege a
       * pessoa do expurgo por tempo indefinido, desfazendo o apagamento pelo lado.
       *
       * Nome vazio nao apaga nome: o repositorio trata o vazio como "nada a dizer" (`nullif`), e a
       * escrita continua condicional, entao a reentrega identica segue sem empurrar o relogio.
       * Ficha anonimizada faz o repositorio LANCAR, e a candidatura nao chega a ser criada.
       */
      await this.repo.atualizarCandidato(porIdentidade.id, dados);
      return porIdentidade.id;
    }

    if (porDocumento !== null) {
      // O DOCUMENTO E O DESEMPATE SECUNDARIO: a identidade nova e ANEXADA a quem ja existe, em vez
      // de partir a mesma pessoa em duas fichas, cada uma com o seu historico e o seu relogio.
      // SEMPRE, pelo mesmo motivo do ramo acima: a chamada e tambem a guarda de anonimizacao.
      await this.repo.atualizarCandidato(porDocumento.id, dados);
      await this.repo.anexarIdentidade(porDocumento.id, registro.userId, new Date());
      return porDocumento.id;
    }

    if (dados.nome.trim() === "") {
      // Sem nome nao ha pessoa a acompanhar (o schema diz que ele e o unico obrigatorio), e inventar
      // um rotulo encheria a base de linhas que ninguem reconhece.
      this.logger.warn(erroDoRegistro(registro, "registro sem identificacao minima"));
      return null;
    }
    const nova = await this.repo.criarCandidato(dados);
    await this.repo.anexarIdentidade(nova.id, registro.userId, new Date());
    return nova.id;
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
