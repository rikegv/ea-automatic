import { montarUrlAutorizada, validarParams, GradeDigaiViolada } from "./digai-grade";

/**
 * ─ O CLIENTE DO DIGAI: O UNICO PONTO DE SAIDA PARA A REDE, E ELE NASCE MUDO ────────────────────
 *
 * ┌─ A INTEGRACAO NASCE FECHADA E INERTE, E A CONDICAO E REAL ───────────────────────────────────┐
 * │ Sem `DIGAI_API_TOKEN`, `ativo` e falso e `ler` LANCA antes de tocar a rede. O token FOI       │
 * │ EXPURGADO em 16/09 (`shred`) e nao esta no `.env`, entao este e o estado NORMAL desta peca    │
 * │ hoje, e nao um caso de borda.                                                                 │
 * │                                                                                               │
 * │ O VETO 1 DE 16/09 FOI UM PORTAO QUE TESTAVA CONDICAO IMPOSSIVEL: passava porque a condicao    │
 * │ nunca podia ser satisfeita, e nao porque a guarda funcionava. Aqui a condicao e a ausencia da │
 * │ variavel de ambiente, que e satisfativel dos dois lados, e ha teste para os dois.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA PORTA DE REDE, E ELA NAO CONCATENA URL ─────────────────────────────────────────────────┐
 * │ A URL vem PRONTA de `montarUrlAutorizada`, que e a mesma funcao que autoriza o path (veto C   │
 * │ do `seguranca`). O cliente nao junta `BASE + path` em lugar nenhum: se juntasse, existiria uma │
 * │ string que vai para a rede sem ter passado pela grade, que e exatamente o furo.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NAO HERDA PROXY DO AMBIENTE (veto B, item 1: o `trust_env = False` do Python) ──────────────┐
 * │ Com um agente de proxy ligado, o host pinado DEIXA DE SER GARANTIA e o Bearer de PRODUCAO vai │
 * │ para um servidor que nao e nosso. O `fetch` global do Node NAO le variavel de proxy sozinho:  │
 * │ quem faz isso e um despachante instalado a mao. Este arquivo nao instala nenhum, nao importa  │
 * │ `undici` e nao passa `dispatcher`, e a inspecao adversarial da grade ACUSA qualquer um desses │
 * │ nomes se alguem os trouxer, porque nada disso fica vermelho sozinho quando aparece.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada aqui loga, e nada aqui devolve a URL. Quem precisa dizer que houve falha diz o codigo
 * HTTP e para ai. Verificacao de TLS NUNCA desligada: a proibicao e teste, nao lembranca (§A.33).
 */

/** 30 segundos, o mesmo do Python. Chamada de leitura que passa disso nao esta lenta, esta perdida. */
const TEMPO_LIMITE_MS = 30_000;

export interface OpcoesDoClienteDigai {
  /** O Bearer pronto, uma API key unica por organizacao. Ausente = integracao INERTE. */
  token?: string;
}

export class DigaiCliente {
  private readonly token: string;

  constructor(opcoes: OpcoesDoClienteDigai) {
    this.token = (opcoes.token ?? "").trim();
  }

  /**
   * A INTEGRACAO DIZ ISSO DE SI MESMA, e o valor e usado de verdade: quem orquestra pergunta antes
   * de montar qualquer passada, e uma peca que so descobre a inercia ao falhar gasta uma rodada de
   * fila para aprender o que ja sabia no boot.
   */
  get ativo(): boolean {
    return this.token !== "";
  }

  /**
   * A UNICA PORTA DE LEITURA. Recusa fora da grade ANTES da rede, e so GET.
   *
   * Auth por BEARER PRONTO: nao ha handshake, nao ha POST de token e, portanto, nao ha porta de
   * escrita nenhuma neste arquivo. Residuo de OAuth (`client_secret`, `grant_type`, `oidc/token`) e
   * acusado pela inspecao da grade justamente porque, se ele voltar, o POST volta junto.
   */
  async ler(caminho: string, params?: Record<string, unknown> | null): Promise<unknown> {
    if (!this.ativo) {
      // A MENSAGEM NOMEIA A VARIAVEL, JAMAIS O VALOR. Este e o unico dado sobre a credencial que
      // pode aparecer em qualquer superficie (§A.6).
      throw new GradeDigaiViolada("DIGAI_API_TOKEN ausente: a integracao esta inerte");
    }
    // A ORDEM E A DO PYTHON: autoriza (e ja recebe a URL) e so entao valida a query. Nada sai antes.
    const url = montarUrlAutorizada(caminho, "GET");
    const limpos = validarParams(params);
    const alvo = new URL(url);
    for (const [k, v] of Object.entries(limpos ?? {})) alvo.searchParams.set(k, v);

    const resposta = await fetch(alvo, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      /*
       * A GRADE E PRE-REDE E NAO REAVALIA O DESTINO FINAL: seguir um 3xx executaria um GET em path
       * que a allowlist NUNCA autorizou, e num host que pode nem ser o pinado. `manual` faz o 3xx
       * voltar como resposta, e ele cai no ramo de erro abaixo como qualquer outro codigo.
       */
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    if (!resposta.ok) {
      /*
       * O CODIGO, E NADA ALEM DELE. O corpo do erro do fornecedor ECOA O PATH, e o path pode
       * carregar um identificador que veio do payload dele: repetir o corpo aqui traria de volta
       * para o NOSSO log exatamente o que a grade existe para manter fora do log DELE.
       */
      throw new Error(`leitura do Digai recusada pelo fornecedor: HTTP ${resposta.status}`);
    }
    return resposta.json();
  }
}
