import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { executarGatilhoGi, type FuncionarioSelecao } from "../domain/portal-dados-gi";

export interface GiEnvioResultado {
  enviado: boolean;
  /** Código fechado do desfecho, para a tela/trilha. Nunca carrega PII. */
  motivo: "GI_NAO_CONFIGURADO" | "GI_CLIENTE_PECA_3_PENDENTE";
}

/**
 * PORTAL→GI, PEÇA 3 (O GATILHO PREPARADO, INERTE): o ponto único por onde o EA "manda a pessoa para
 * a folha". Ele é chamado de DOIS lugares (o fechamento da auditoria e o botão manual do time), e os
 * dois chamam ESTE serviço, que hoje é NO-OP.
 *
 * NASCE FECHADO, no molde do webhook do Pandapé e do `PortalCorreioService`: sem cliente do GI e sem
 * credencial, `configurado()` diz não e o envio não acontece. Não há hardcode, não há chamada de
 * rede, não há montagem de payload quando não está configurado (fail-closed: nem a PII é tocada). O
 * cliente do GI (`FuncionarioSelecao`, fila BullMQ, OAuth2 de 2h, idempotência por CPF/admissão,
 * de/para de cidade/banco) é a PEÇA 3, bloqueada por insumo do fornecedor (reconexão do GI, §A.9).
 *
 * QUANDO A PEÇA 3 LIGAR, é aqui que ela entra: ler `admissao_dados_gi` + `candidatos`, montar o
 * payload com `montarFuncionarioSelecao` (`domain/gi-funcionario-selecao.ts`, já pronto e testado),
 * enfileirar, e re-carimbar `admissao_dados_gi.expurgar_em` para "envio + margem". Até lá, este
 * serviço é inerte de propósito, e é isso que permite ligar o GATILHO agora sem risco.
 *
 * §A.6: o log NUNCA leva PII (nem o `admissaoId`, que não agrega e é adivinhável). A URL/host/token
 * do GI, quando existirem (peça 3), nunca serão persistidos nem logados, mesmo padrão de
 * Pandapé/Clicksign.
 */
@Injectable()
export class EnviarParaGiService {
  private readonly log = new Logger("EnviarParaGiService");

  constructor(private readonly config: ConfigService) {}

  /**
   * Só há cliente do GI quando a URL E o segredo estiverem no ambiente. Sem os dois, nasce fechado.
   * (Mesmo padrão do `configurado()`/`configurada()` do correio e da trilha do Portal.)
   */
  private configurado(): boolean {
    const url = (this.config.get<string>("GI_API_URL") ?? "").trim();
    const segredo = (this.config.get<string>("GI_API_TOKEN") ?? "").trim();
    return url.length > 0 && segredo.length > 0;
  }

  /**
   * O GATILHO. Chamado no fechamento da auditoria (automático) e pelo botão manual do time. Hoje
   * é NO-OP: sem GI configurado, e sem o cliente da peça 3, não há para onde enviar.
   *
   * IDEMPOTENTE por construção (é no-op), e a peça 3 manterá a idempotência por CPF/admissão: rodar
   * o gatilho duas vezes sobre a mesma admissão não pode criar dois registros na folha.
   */
  async enviar(_admissaoId: string): Promise<GiEnvioResultado> {
    const configurado = this.configurado();
    // Delega ao GATILHO puro do domínio (`executarGatilhoGi`, coberto pelo contrato do tester). Sem
    // GI configurado, ele não chama cliente nenhum e loga sem PII; a `pessoa` fica vazia porque o
    // gatilho não a lê enquanto está inerte (só a peça 3 montaria e enviaria o payload).
    const r = await executarGatilhoGi(
      {
        enviarAoGi: async (_payload: FuncionarioSelecao) => ({}),
        log: (mensagem: string) => this.log.log(mensagem),
      },
      { giConfigurado: configurado, pessoa: {} },
    );
    return {
      enviado: r.enviado,
      motivo: configurado ? "GI_CLIENTE_PECA_3_PENDENTE" : "GI_NAO_CONFIGURADO",
    };
  }
}
