import { Injectable, Logger } from "@nestjs/common";
import {
  DIGAI_TETO_PAGINAS_POR_SCREENING,
  DIGAI_TETO_REQ_POR_CICLO,
  planoDaVarredura,
  proximaPaginaDigai,
  totalDeclaradoDigai,
} from "../../domain/digai";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiRepositorio } from "./digai-repositorio";

/**
 * ─ O CICLO DO POLLING: A VARREDURA QUE SUBSTITUIU O WEBHOOK COMO CAMINHO VIGENTE ───────────────
 *
 * ┌─ POR QUE CONSULTA PERIODICA, E NAO O WEBHOOK QUE JA ESTA CONSTRUIDO (decisao do diretor) ────┐
 * │ O webhook FUNCIONA e FICA NO LUGAR, intocado. O que ele tem e uma dependencia de terceiro que │
 * │ o diretor nao quer: o listener precisa ser cadastrado no painel do fornecedor pelo Ivan, e    │
 * │ ate la nao chega evento nenhum. O caminho VIGENTE passa a ser este, e `DIGAI_WEBHOOK_TOKEN`   │
 * │ DEIXOU DE SER NECESSARIO PARA OPERAR: sem ele o receptor segue fail-closed e inerte, e a      │
 * │ ingestao roda igual. Querendo o webhook de volta um dia, basta pedir o cadastro e configurar  │
 * │ o token: nao ha nada a construir.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ESTE SERVICO NAO ENFILEIRA NADA, E ISSO E DESENHO E NAO OMISSAO ────────────────────────────┐
 * │ Ele DEVOLVE o que a passada seguinte precisa (a proxima pagina da listagem, os screenings a   │
 * │ varrer, a proxima pagina de um screening) e quem enfileira e a `DigaiFilaService`. Duas       │
 * │ razoes, nesta ordem:                                                                           │
 * │  1. CICLO SEM CICLO DE DEPENDENCIA: a fila ja depende de quem processa; se quem processa       │
 * │     dependesse da fila, seria `forwardRef` para sempre;                                        │
 * │  2. o ciclo inteiro fica EXERCITAVEL SEM REDIS: o teto, a paginacao e o portao da admissao     │
 * │     sao provados com o cliente dublado, sem nada sair para a rede e sem fila de pe.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UM JOB E UMA REQUISICAO, E E POR ISSO QUE O LIMITER CONTINUA VALENDO ───────────────────────┐
 * │ `digai.queue.ts` avisa que o limiter do BullMQ conta JOBS, e que um job com varias chamadas   │
 * │ HTTP passa por baixo dele. Um unico job que varresse os 528 screenings faria 682 requisicoes  │
 * │ contadas como UMA, e os 90/min viravam decoracao. Por isso o ciclo e leque: `executarTick` le │
 * │ UMA pagina da listagem, `executarPaginaDeScreening` le UMA pagina de resultados.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o log daqui e CONTAGEM e identificador tecnico de screening. Nenhum campo de pessoa, em
 * nenhum ramo, nem no de erro. Quem projeta a pessoa e o dominio, e ela nunca chega a este texto.
 */
@Injectable()
export class DigaiVarreduraService {
  private readonly logger = new Logger("DigaiVarreduraService");

  constructor(
    private readonly importacao: DigaiImportacaoService,
    private readonly repo: DigaiRepositorio,
  ) {}

  /**
   * ─ O TICK: UMA PAGINA DA LISTAGEM, E O LEQUE QUE SAI DELA ──────────────────────────────────────
   *
   * Gasta UMA requisicao (a listagem) e devolve o leque ja ORCADO: cada screening sai com quantas
   * paginas ele pode ler, e o que sobra segue para a proxima pagina da listagem.
   *
   * ┌─ O ORCAMENTO VIAJA, E E POR ISSO QUE O TETO PASSOU A VALER (veto do `seguranca`, 29/09) ────┐
   * │ Antes o teto era aplicado SO aqui, cobrando 1 requisicao por screening, e a folha do leque   │
   * │ pedia ate 20 paginas sem consultar orcamento nenhum: o teto autorizava 1 + N x 20 requisicoes.│
   * │ Agora o orcamento entra pelo payload, e repartir e o unico ponto que decide: a soma do que   │
   * │ este plano autoriza nunca passa do que ele recebeu.                                           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async executarTick(
    pagina: number,
    orcamento: number = DIGAI_TETO_REQ_POR_CICLO,
  ): Promise<{
    inerte: boolean;
    screenings: Array<{ screeningId: string; paginasPermitidas: number }>;
    foraDoTeto: number;
    proximaPaginaDaListagem: number | null;
    orcamentoRestante: number;
  }> {
    const vazio = {
      inerte: true,
      screenings: [] as Array<{ screeningId: string; paginasPermitidas: number }>,
      foraDoTeto: 0,
      proximaPaginaDaListagem: null,
      orcamentoRestante: 0,
    };
    if (!this.importacao.podeLer) {
      this.logger.log("Varredura do Digai INERTE: DIGAI_API_TOKEN nao configurado.");
      return vazio;
    }

    const { screenings, total } = await this.importacao.listarScreenings(pagina);
    const lidos = screenings.length;

    /*
     * A LISTAGEM TEM PROXIMA PAGINA? A pergunta vem ANTES da reparticao, porque ela MUDA a regra:
     * com listagem paginada nao se sabe quantos screenings ainda virao, entao esta pagina fica
     * conservadora (uma pagina por screening) e o resto do orcamento segue adiante. Era o furo B do
     * veto: cada pagina de listagem recomecava com o orcamento cheio.
     */
    const declarado = totalDeclaradoDigai({ total });
    const haMaisListagem = declarado !== null && lidos > 0 && lidos < declarado;

    /*
     * ─ A LISTAGEM TEM O MESMO BURACO, E POR ISSO O AVISO E NAS DUAS SUPERFICIES ──────────────────
     *
     * Sumindo o `total`, `haMaisListagem` vira `false`, `foraDoTeto` e 0, `estourou` e `false`, e o
     * que sairia seria um `log` INFORMATIVO dizendo "20 screening(s) lido(s)" como se fosse a base
     * inteira. O silencio aqui e mais caro que na folha: perde-se o screening todo, e nao paginas
     * dele. Parar continua certo (nao se inventa paginacao); calar, nao.
     */
    if (declarado === null && lidos > 0) {
      this.logger.warn(
        `Varredura do Digai: a LISTAGEM da pagina ${pagina} veio SEM o campo 'total'. A paginacao ` +
          `PARA por abstencao e NAO se sabe se ha mais screenings alem dos ${lidos} vistos. ` +
          `Conferir o contrato do fornecedor.`,
      );
    }

    /*
     * ─ OS `total` DO CICLO ANTERIOR, LIDOS ANTES DE QUALQUER ESCRITA ─────────────────────────────
     *
     * E o insumo da REPARTICAO POR NECESSIDADE: cada screening leva a cota de que precisa
     * (`ceil(total x 1,1 / 100)`) em vez de uma fatia igual. UMA consulta para a tabela inteira,
     * que e pequena por construcao e nao tem PII.
     *
     * FALHAR AQUI NAO DERRUBA O CICLO: o repositorio devolve mapa VAZIO, todo mundo vira
     * desconhecido e a reparticao degenera na IGUALITARIA, que e exatamente o comportamento
     * anterior. Degradacao para o desenho antigo, e nao para o silencio.
     */
    const totaisConhecidos = await this.repo.totaisConhecidos();

    const plano = planoDaVarredura({
      screenings,
      orcamento,
      haProximaPaginaDaListagem: haMaisListagem,
      totaisConhecidos,
    });
    if (plano.estourou) {
      this.logger.warn(
        `Varredura do Digai ATINGIU O TETO de ${DIGAI_TETO_REQ_POR_CICLO} requisicoes por ciclo: ` +
          `${plano.varrer.length} screening(s) na fila, ${plano.foraDoTeto} fora desta passada. ` +
          `A base do fornecedor cresceu; reveja o teto e a cadencia em domain/digai.ts.`,
      );
    }

    /*
     * O CURSOR E GRAVADO AQUI, com o `updatedAt` que a LISTAGEM devolveu, e ELE NAO PULA NADA: o
     * plano acima nao o consulta, de proposito. Nao esta provado que o `updatedAt` do SCREENING se
     * mexe quando um CANDIDATO finaliza, e pular o screening "sem mudanca" deixaria de fora
     * exatamente quem acabou de finalizar, para sempre e sem nada falhar. Gravar custa uma tabela e
     * e a medicao que um dia responde a pergunta; pular sem prova perde gente em silencio.
     */
    let cursoresPerdidos = 0;
    for (const item of plano.varrer) {
      /*
       * SEM `total`: o tick nao o mede, e desde 29/09 ele NAO PODE ZERA-LO. Zerando, o screening
       * CORTADO (que nao tem pagina 1 nesta passada) ficaria com `total = 0` de pe e voltaria a
       * receber cota de desconhecido para sempre. Quem escreve o `total` e quem o mediu.
       */
      const ok = await this.repo.registrarCursorDoScreening({
        screeningId: item.screening.id,
        updatedAt: item.screening.updatedAt,
      });
      if (!ok) cursoresPerdidos += 1;
    }
    if (cursoresPerdidos > 0) {
      this.logger.warn(
        `Varredura do Digai: ${cursoresPerdidos} cursor(es) nao gravado(s). O ciclo SEGUE: ` +
          `o cursor e medicao, e perder a medicao nao pode custar as pessoas da passada.`,
      );
    }

    /*
     * A PROXIMA PAGINA DA LISTAGEM SO SAI SE SOBROU ORCAMENTO. Sem sobra, ela e CORTE e vira log:
     * pedir a pagina seguinte com orcamento zero seria o furo B de volta, por dentro.
     */
    let proxima: number | null = null;
    if (haMaisListagem) {
      if (plano.orcamentoRestante > 0) proxima = pagina + 1;
      else {
        this.logger.warn(
          `Varredura do Digai: a LISTAGEM foi CORTADA na pagina ${pagina} por falta de orcamento ` +
            `(${lidos} de ${declarado ?? 0} screening(s) vistos). Os demais NAO ficam para o ` +
            `proximo ciclo: com o mesmo orcamento, o proximo corta no mesmo ponto. Suba o teto.`,
        );
      }
    }

    /*
     * ─ O CORTE POR ORCAMENTO NA REPARTICAO REGISTRA, PELA MESMA REGUA DO `CORTE_ORCAMENTO` ───────
     *
     * Repartir por necessidade nao e repartir sem teto: passando a soma das necessidades do
     * orcamento, todo mundo encolhe na mesma fracao (maior resto) e ALGUEM le menos do que precisa.
     * A perda e RECORRENTE e o proximo ciclo NAO a recupera, porque ele rele da pagina 1 com a
     * mesma cota e o fornecedor NAO ORDENA os resultados. Corte que nao aparece no log e perda
     * silenciosa, que e o modo de falha mais caro desta ingestao.
     */
    if (plano.cortadosPorOrcamento > 0) {
      this.logger.warn(
        `Varredura do Digai: a REPARTICAO POR NECESSIDADE nao coube no orcamento e ` +
          `${plano.cortadosPorOrcamento} de ${plano.varrer.length} screening(s) receberam MENOS ` +
          `paginas do que precisavam (corte proporcional, todos encolhem na mesma fracao). A perda ` +
          `e RECORRENTE e o proximo ciclo NAO a recupera. Reveja o teto por ciclo e a cadencia.`,
      );
    }

    const maiorCota = plano.varrer.reduce((m, i) => Math.max(m, i.paginasPermitidas), 0);
    this.logger.log(
      `Varredura do Digai, pagina ${pagina} da listagem: ${lidos} screening(s) lido(s), ` +
        `${plano.varrer.length} na fila desta passada, ${plano.paginasAutorizadas} pagina(s) ` +
        `autorizada(s) por necessidade (maior cota ${maiorCota}), ${plano.foraDoTeto} fora do teto, ` +
        `${plano.orcamentoRestante} requisicao(oes) de orcamento restante.`,
    );

    return {
      inerte: false,
      screenings: plano.varrer.map((i) => ({
        screeningId: i.screening.id,
        paginasPermitidas: i.paginasPermitidas,
      })),
      foraDoTeto: plano.foraDoTeto,
      proximaPaginaDaListagem: proxima,
      orcamentoRestante: plano.orcamentoRestante,
    };
  }

  /**
   * ─ A FOLHA DO LEQUE: UMA PAGINA DE RESULTADOS DE UM SCREENING ──────────────────────────────────
   *
   * Gasta UMA requisicao, projeta pela allowlist (dentro do leitor), entrega ao `importar`, que
   * aplica o PORTAO DA ADMISSAO (`separarPorFinalizacaoDigai`) na primeira linha, e devolve a
   * proxima pagina quando ha mais.
   *
   * A PAGINACAO E DE VERDADE: o `total` declarado decide, e nao a impressao de que uma pagina basta.
   * MEDIDO EM 29/09: A PAGINA DO FORNECEDOR E DE 100 (um screening com `total` 273 devolveu 100 na
   * pagina 1), e 78 dos 528 screenings passam de 100, o maior com 1.225 candidatos. Presumir uma
   * pagina perderia todo mundo da segunda em diante, em silencio, JA HOJE e nao um dia.
   */
  async executarPaginaDeScreening(
    screeningId: string,
    pagina: number,
    paginasPermitidas: number = 1,
  ): Promise<{ inerte: boolean; lidos: number; proximaPagina: number | null }> {
    if (!this.importacao.podeLer) return { inerte: true, lidos: 0, proximaPagina: null };

    const { registros, total } = await this.importacao.lerPaginaDeResultados(screeningId, pagina);
    const resumo = await this.importacao.importar(registros);

    /*
     * O CURSOR GANHA O `total` VISTO NESTA PASSADA, na primeira pagina. E o segundo numero que a
     * medicao pede: comparar ciclo a ciclo "o `updatedAt` mudou?" contra "o `total` mudou?" e o que
     * responde se algum dos dois serve de cursor. Falha ao gravar NAO derruba a passada.
     *
     * ┌─ SEM `total`, O CURSOR NAO E ESCRITO, E ISSO FOI REVISTO A PEDIDO (e mantido) ─────────────┐
     * │ A alternativa seria carimbar `total_visto = 0`, e ela e PIOR do que nao escrever: o ciclo   │
     * │ seguinte leria "o total caiu de 58 para 0" e concluiria que o screening esvaziou. Medicao   │
     * │ FALSA e pior que medicao AUSENTE, porque a falsa e usada. O `updatedAt`, que e a outra      │
     * │ metade do cursor, JA foi gravado pelo tick e nao se perde aqui.                              │
     * │                                                                                             │
     * │ E A AUSENCIA DEIXOU DE SER MUDA: o `warn` de abstencao logo abaixo e o registro de que a    │
     * │ medicao nao aconteceu. Era essa a lacuna real, e nao a linha do banco.                       │
     * └───────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    if (pagina === 1 && total !== null) {
      const cursor = await this.repo.cursorDoScreening(screeningId);
      await this.repo.registrarCursorDoScreening({
        screeningId,
        updatedAt: cursor?.updatedAt ?? null,
        total,
      });
    }

    const lidos = registros.length;
    // O acumulado assume pagina cheia ate aqui, que e o que o fornecedor faz: `pagina x lidos`.
    // Errar para MAIS pararia cedo e perderia gente, entao o produto usa o tamanho DESTA pagina,
    // que e o maior que se pode afirmar sem medir o tamanho de pagina do fornecedor.
    const acumulados = pagina * lidos;
    const decisao = proximaPaginaDigai({
      total,
      lidosAcumulados: acumulados,
      itensNaPagina: lidos,
      paginaAtual: pagina,
      paginasPermitidas,
      tetoDePaginas: DIGAI_TETO_PAGINAS_POR_SCREENING,
    });

    /*
     * ─ O CORTE REGISTRA, E ESSE E O SEGUNDO VETO DO `seguranca` (29/09) ──────────────────────────
     *
     * Antes, "acabou" e "fui cortado" devolviam o MESMO `null`, sem log: um screening com mais
     * paginas do que o teto perdia todo mundo dali em diante sem erro e sem alarme. Cortar e uma
     * decisao nossa, e decisao nossa que deixa gente de fora tem de aparecer. §A.6: o que sai e o
     * id do screening (que nao e de ninguem), a pagina e a contagem.
     *
     * ─ A FRASE "OS DEMAIS FICAM PARA O PROXIMO CICLO" ERA FALSA, E DESARMAVA QUEM LIA ───────────
     *
     * Ela saiu daqui em 29/09 porque a MEDICAO DA ORDENACAO a derrubou: o fornecedor NAO ordena os
     * resultados (tres screenings medidos, `total` 275, 135 e 167, todos com as datas misturadas
     * dentro da pagina e com a pagina 2 trazendo gente MAIS NOVA que a pagina 1). Sem ordenacao, o
     * ciclo seguinte rele da pagina 1 com a MESMA cota e corta O MESMO CONJUNTO: nao e adiamento,
     * e perda recorrente, e quem cai fora e SORTEADO, podendo ser quem acabou de finalizar.
     *
     * LOG QUE DESARMA E PIOR QUE LOG NENHUM, porque quem le arquiva o aviso como rotina. E o mesmo
     * modo de falha do `SEM_TOTAL` que saia como termino normal, voltando pela porta do TEXTO em
     * vez da do valor de retorno.
     */
    if (decisao.cortada) {
      const porque =
        decisao.motivo === "CORTE_TETO"
          ? `teto anti-laco de ${DIGAI_TETO_PAGINAS_POR_SCREENING} pagina(s) por screening`
          : `orcamento de ${paginasPermitidas} pagina(s) concedido a este screening nesta passada`;
      this.logger.warn(
        `Varredura do Digai: screening ${screeningId} CORTADO na pagina ${pagina} pelo ${porque}. ` +
          `${acumulados} de ${total ?? 0} candidato(s) lidos; os demais NAO ficam para o proximo ` +
          `ciclo: a perda e RECORRENTE e o proximo ciclo NAO a recupera (ele rele da pagina 1 com ` +
          `a mesma cota, e o fornecedor NAO ordena os resultados). Suba a cota (teto por ciclo) ou ` +
          `reparta por necessidade.`,
      );
    }

    /*
     * ─ A ABSTENCAO TAMBEM REGISTRA, E ELA E O SEGUNDO VETO DA RODADA (29/09) ─────────────────────
     *
     * `SEM_TOTAL` saia com `cortada: false` e NAO gerava linha nenhuma, em nivel nenhum. Mudando a
     * forma da resposta, o fornecedor faria a ingestao ler a pagina 1 de cada screening (~4% da
     * base) e NADA ficaria vermelho, amarelo ou contado. Nao se sabe se acabou nao e ter acabado.
     *
     * WARN, e nao ERROR: nada falhou tecnicamente (o HTTP respondeu 200 e os registros desta pagina
     * foram ingeridos de verdade). O que se perdeu foi a CAPACIDADE DE SABER se ha mais, e isso e
     * um aviso para conferir o contrato do fornecedor, nao um incidente da passada.
     */
    if (decisao.abstencao) {
      this.logger.warn(
        `Varredura do Digai: screening ${screeningId} pagina ${pagina} veio SEM o campo 'total'. ` +
          `A paginacao PARA por abstencao (nao se inventa paginacao sem total) e NAO se sabe se ha ` +
          `mais: ${lidos} registro(s) desta pagina foram ingeridos. Conferir o contrato do fornecedor.`,
      );
    }
    const proxima = decisao.proxima;

    if (resumo.escritos + resumo.adiados + resumo.ignorados + resumo.naoFinalizaram > 0) {
      /*
       * §A.6: contagem e o id tecnico do SCREENING, que nao e de ninguem. Os quatro desfechos saem
       * juntos pela mesma razao do log da fila: imprimir tres de quatro faria a soma nao fechar com
       * o total lido, e diferenca sem nome vira "sumiu no caminho".
       */
      this.logger.log(
        `Varredura do Digai, screening ${screeningId} pagina ${pagina}: ${lidos} lido(s), ` +
          `${resumo.escritos} escrito(s), ${resumo.adiados} adiado(s), ` +
          `${resumo.ignorados} ja conhecido(s), ${resumo.naoFinalizaram} fora da regua de admissao.`,
      );
    }

    return { inerte: false, lidos, proximaPagina: proxima };
  }
}
