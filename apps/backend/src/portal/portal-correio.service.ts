import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EmailDoCodigo, EmailDoLink } from "../domain/portal-envio";
import { LOGO_SOULAN_BASE64, LOGO_SOULAN_CID } from "./portal-logo";

/**
 * Um anexo do SendGrid, no formato que a API pede (`attachments[]`). Usado só para o logo inline do
 * e-mail do LINK: `disposition: "inline"` + `content_id` fazem o HTML exibi-lo por `cid:`.
 */
interface AnexoSendGrid {
  content: string;
  type: string;
  filename: string;
  disposition: "inline" | "attachment";
  content_id: string;
}

/**
 * O ANEXO DO LOGO, pronto para o e-mail do LINK. É o único anexo do correio, e vai SÓ no link: o
 * e-mail do código não leva imagem (continua fora de escopo, régua própria em `portal-envio.ts`).
 */
const ANEXO_LOGO_LINK: AnexoSendGrid = {
  content: LOGO_SOULAN_BASE64,
  type: "image/png",
  filename: "logo-soulan.png",
  disposition: "inline",
  content_id: LOGO_SOULAN_CID,
};

/**
 * O CORREIO DO PORTAL. A única porta por onde o EA manda e-mail, e ela manda UM tipo de e-mail só.
 *
 * ┌─ POR QUE SENDGRID, E O GMAIL SAIU DE VEZ ───────────────────────────────────────────────────┐
 * │ O desenho original era Gmail API com conta de serviço (JWT `gmail.send`), que dependia da     │
 * │ DELEGAÇÃO DE DOMÍNIO no Admin do Workspace. Essa delegação nunca veio (o `client_id` do        │
 * │ correio não foi autorizado no escopo `gmail.send`), então o canal ficou inerte sem culpa do    │
 * │ código. O envio passou a sair pelo SendGrid, cujo domínio remetente já está autenticado, e     │
 * │ o Gmail saiu inteiro: não há mais JWT, chave privada de conta de serviço nem token do Google   │
 * │ neste arquivo. O fluxo cabe em um `fetch` com cabeçalho `Authorization: Bearer`.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ NASCE INERTE, E ISSO É ESTADO TESTÁVEL, NÃO INTENÇÃO (exigência S8) ═══════════════════════
 *
 * Sem `PORTAL_CORREIO_SENDGRID_API_KEY` ou sem `PORTAL_CORREIO_REMETENTE`, `configurado()` diz NÃO,
 * nenhuma chamada sai e nada lança no boot. É o molde do `PortalEmissorService` e do webhook do
 * Pandapé (§A.5): canal não configurado é RECUSA, nunca "envia depois". E quem chama TEM de
 * perguntar antes de emitir link/código, senão a recusa deixaria uma credencial viva que ninguém
 * recebeu.
 *
 * ══ ABSTER-SE É O COMPORTAMENTO SEGURO ════════════════════════════════════════════════════════
 *
 * Toda falha (não configurado, tempo limite, rede, chave recusada, resposta de erro) devolve
 * `false`. NUNCA lança: quem chama está no meio de um fluxo operacional (o consultor acabou de
 * enviar alguém para a admissão, ou o candidato acabou de pedir o código) e uma exceção aqui
 * derrubaria o fato por causa do aviso, que é a lição do `notifications` da Clicksign (§A.5).
 *
 * ┌─ §A.6, A LINHA MAIS DURA DESTE ARQUIVO ─────────────────────────────────────────────────────┐
 * │ NÃO LOGA O DESTINATÁRIO, NÃO LOGA A URL DO LINK, NÃO LOGA O CÓDIGO, NÃO LOGA O CORPO DA       │
 * │ MENSAGEM, NÃO LOGA O CORPO DA RESPOSTA DE ERRO E NÃO LOGA A CHAVE. O destinatário é dado      │
 * │ pessoal, o link e o código são credencial, e o corpo da resposta de erro do SendGrid costuma  │
 * │ ECOAR DE VOLTA o endereço que mandamos, ou seja, é a porta pela qual ele voltaria para o log  │
 * │ sem ninguém ter escrito um `log(email)`. O que vai para o log é o rótulo da rota e o status.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Tempo limite padrão. O consultor, ou o candidato, está na tela esperando o desfecho do clique. */
export const CORREIO_TIMEOUT_MS_PADRAO = 10_000;

const URL_ENVIO = "https://api.sendgrid.com/v3/mail/send";

/** Nome exibido no remetente quando nada é configurado. O endereço vem de `PORTAL_CORREIO_REMETENTE`. */
const REMETENTE_NOME_PADRAO = "Portal do Candidato Soulan";

/**
 * Tira de um valor de destinatário qualquer coisa que possa QUEBRAR LINHA.
 *
 * O endereço já passou por `emailEnviavel` (que recusa espaço), mas a defesa mora AQUI porque é
 * aqui que ele entra no corpo da requisição, e não no chamador que pode mudar amanhã. Com o SendGrid
 * o endereço viaja dentro de JSON, então não há injeção de cabeçalho MIME como no Gmail; ainda
 * assim um `\r\n` num endereço é sinal de valor malformado, e normalizá-lo é barato.
 */
function semQuebraDeLinha(valor: string): string {
  return valor.replace(/[\r\n]+/g, " ").trim();
}

@Injectable()
export class PortalCorreioService {
  private readonly log = new Logger(PortalCorreioService.name);

  constructor(private readonly config: ConfigService) {}

  /** A chave de API do SendGrid. Vai no cabeçalho `Authorization: Bearer`, e NUNCA em log. */
  private get chave(): string {
    return (this.config.get<string>("PORTAL_CORREIO_SENDGRID_API_KEY") ?? "").trim();
  }

  /** O endereço remetente, que precisa ser de domínio autenticado no SendGrid. */
  private get remetente(): string {
    return (this.config.get<string>("PORTAL_CORREIO_REMETENTE") ?? "").trim();
  }

  /** O nome exibido do remetente. Opcional: vazio cai no padrão. */
  private get remetenteNome(): string {
    const cru = (this.config.get<string>("PORTAL_CORREIO_REMETENTE_NOME") ?? "").trim();
    return cru.length > 0 ? cru : REMETENTE_NOME_PADRAO;
  }

  private get timeoutMs(): number {
    const cru = Number((this.config.get<string>("PORTAL_CORREIO_TIMEOUT_MS") ?? "").trim());
    return Number.isFinite(cru) && cru > 0 ? cru : CORREIO_TIMEOUT_MS_PADRAO;
  }

  /**
   * OS DOIS, OS DOIS. Sem a chave não há como autenticar no SendGrid; sem o remetente o SendGrid
   * recusa a mensagem (remetente tem de ser de domínio autenticado).
   *
   * Lido A CADA CHAMADA, e não guardado no construtor, pelo mesmo motivo do `PortalEmissorService`:
   * assim a inércia é avaliada no momento do envio e o teste consegue provar o módulo subindo com
   * o ambiente vazio, sem depender da ordem de construção dos provedores.
   */
  configurado(): boolean {
    return this.chave.length > 0 && this.remetente.length > 0;
  }

  /**
   * Um `fetch` com tempo limite e com o log já amordaçado. Devolve `null` em qualquer falha.
   *
   * §A.6: no erro só o rótulo da rota e o status entram no log. O corpo do erro do SendGrid ECOA o
   * destinatário, e é por ele que o endereço voltaria para o log.
   */
  private async postar(
    url: string,
    opcoes: { headers: Record<string, string>; body: string; rotulo: string },
  ): Promise<Response | null> {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), this.timeoutMs);
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: opcoes.headers,
        body: opcoes.body,
        signal: controle.signal,
      });
      if (!resposta.ok) {
        this.log.error(`o correio do portal foi recusado (${opcoes.rotulo}): ${resposta.status}`);
        return null;
      }
      return resposta;
    } catch (erro) {
      // §A.6: só o nome da classe do erro. A mensagem de rede costuma trazer a URL inteira.
      this.log.error(
        `falha ao falar com o correio do portal (${opcoes.rotulo}): ${(erro as Error).name}`,
      );
      return null;
    } finally {
      clearTimeout(relogio);
    }
  }

  /**
   * MONTA O CORPO DO SENDGRID E POSTA. A espinha das duas portas públicas (`enviarLink`,
   * `enviarCodigo`), que continuam irmãs para que a régua de cada mensagem tenha um dono só.
   *
   * O CORPO VEM PRONTO de `domain/portal-envio.ts`, e este método não acrescenta uma palavra a ele.
   * A régua do que cada e-mail pode conter mora na camada pura, que é onde ela é provada em teste.
   *
   * SendGrid: `content` exige texto puro ANTES do HTML (é a ordem que a API pede). Sucesso é 2xx
   * (o SendGrid devolve 202); qualquer outra coisa é `false`, e o chamador trata o `false`
   * (revoga o link/código recém-emitido).
   */
  private async postarMensagem(
    destinatario: string,
    mensagem: EmailDoLink | EmailDoCodigo,
    anexos?: AnexoSendGrid[],
  ): Promise<boolean> {
    if (!this.configurado()) return false;

    const corpo = JSON.stringify({
      personalizations: [{ to: [{ email: semQuebraDeLinha(destinatario) }] }],
      from: { email: this.remetente, name: this.remetenteNome },
      subject: semQuebraDeLinha(mensagem.assunto),
      content: [
        { type: "text/plain", value: mensagem.texto },
        { type: "text/html", value: mensagem.html },
      ],
      // `attachments` só entra quando há anexo: o e-mail do código não leva nenhum, e um campo vazio
      // só polui o corpo. O logo do link é inline (CID), referenciado pelo HTML por `cid:`.
      ...(anexos && anexos.length > 0 ? { attachments: anexos } : {}),
    });

    const resposta = await this.postar(URL_ENVIO, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.chave}` },
      body: corpo,
      rotulo: "envio",
    });
    return resposta !== null;
  }

  /**
   * ENVIA O E-MAIL DO LINK. Verdadeiro é "o SendGrid aceitou a mensagem"; falso é qualquer outra
   * coisa, e quem chama já sabe tratar o falso (revoga o link recém-emitido, para não deixar
   * credencial viva que ninguém recebeu).
   */
  async enviarLink(destinatario: string, mensagem: EmailDoLink): Promise<boolean> {
    // O e-mail do LINK leva o logo da Soulan como anexo inline (CID). É o ÚNICO e-mail com anexo.
    return this.postarMensagem(destinatario, mensagem, [ANEXO_LOGO_LINK]);
  }

  /**
   * ENVIA O E-MAIL DO CÓDIGO DA PORTA DE E-MAIL. MÉTODO IRMÃO de `enviarLink`, e não um parâmetro
   * dele, para que a régua de cada mensagem continue tendo um dono só.
   *
   * §A.6: o `mensagem` recebido carrega o CÓDIGO, que é credencial. Ele atravessa em memória, vai
   * para dentro do corpo do SendGrid e morre ali. NÃO é logado, NÃO é persistido e NÃO volta em
   * resposta de rota nenhuma (condição C9).
   */
  async enviarCodigo(destinatario: string, mensagem: EmailDoCodigo): Promise<boolean> {
    return this.postarMensagem(destinatario, mensagem);
  }

  /** Diagnóstico: diz se o canal está ligado, sem revelar chave, remetente nem corpo. */
  descrever(): { configurado: boolean; timeoutMs: number } {
    return { configurado: this.configurado(), timeoutMs: this.timeoutMs };
  }
}
