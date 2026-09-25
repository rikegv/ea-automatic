import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createSign } from "node:crypto";
import type { EmailDoLink } from "../domain/portal-envio";

/**
 * O CORREIO DO PORTAL. A única porta por onde o EA manda e-mail, e ela manda UM tipo de e-mail só.
 *
 * ┌─ O EA NUNCA ENVIOU E-MAIL ATÉ AQUI, e é por isso que este arquivo é conservador ────────────┐
 * │ A varredura do backend não achou nenhuma dependência de envio (`nodemailer`, SMTP, SendGrid, │
 * │ Resend): toda ocorrência de "email" no repositório é CAMPO de dado. Este é o primeiro        │
 * │ emissor, e ele nasce com o escopo mais estreito que resolve o pedido: uma caixa remetente,   │
 * │ um destinatário por chamada, corpo montado por função pura, nenhum anexo e nenhuma lista.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ POR QUE GMAIL API COM CONTA DE SERVIÇO, E NENHUMA DEPENDÊNCIA NOVA ════════════════════════
 *
 * Decisão do diretor: reusar a conta de serviço que JÁ existe no projeto `ea-v2-automatic` e a
 * delegação de domínio que JÁ roda em produção no Drive (`ai-service/app/drive.py`). O que falta é
 * habilitar o escopo `gmail.send` e escolher a caixa remetente, e as duas coisas são destrave do
 * diretor. Nada de SDK novo: o fluxo inteiro cabe em `node:crypto` (assinar o JWT) e `fetch`
 * (trocar por token e postar a mensagem), que é como o resto do projeto fala com o Google.
 *
 * ══ NASCE INERTE, E ISSO É ESTADO TESTÁVEL, NÃO INTENÇÃO (exigência S8) ═══════════════════════
 *
 * Sem `PORTAL_CORREIO_SA_EMAIL`, sem `PORTAL_CORREIO_PRIVATE_KEY` ou sem `PORTAL_CORREIO_REMETENTE`,
 * `configurado()` diz NÃO, nenhuma chamada sai e nada lança no boot. É o molde do
 * `PortalEmissorService` e do webhook do Pandapé (§A.5): canal não configurado é RECUSA, nunca
 * "envia depois". E quem chama TEM de perguntar antes de emitir link, senão a recusa deixaria uma
 * credencial viva que ninguém recebeu.
 *
 * ══ ABSTER-SE É O COMPORTAMENTO SEGURO ════════════════════════════════════════════════════════
 *
 * Toda falha (não configurado, tempo limite, rede, token recusado, resposta de erro) devolve
 * `false`. NUNCA lança: quem chama está no meio de um fluxo operacional (o consultor acabou de
 * enviar alguém para a admissão) e uma exceção aqui derrubaria o fato por causa do aviso, que é a
 * lição do `notifications` da Clicksign (§A.5).
 *
 * ┌─ §A.6, A LINHA MAIS DURA DESTE ARQUIVO ─────────────────────────────────────────────────────┐
 * │ NÃO LOGA O DESTINATÁRIO, NÃO LOGA A URL DO LINK, NÃO LOGA O TOKEN DE ACESSO, NÃO LOGA O      │
 * │ CORPO DA MENSAGEM E NÃO LOGA O CORPO DA RESPOSTA DE ERRO. O destinatário é dado pessoal, a   │
 * │ URL é credencial, e o corpo da resposta de erro do Google costuma ECOAR DE VOLTA o que       │
 * │ mandamos, ou seja, é a porta pela qual o endereço volta para o log sem ninguém ter escrito   │
 * │ um `log(email)`. O que vai para o log é o destino da rota e o nome da classe do erro.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Tempo limite padrão. O consultor está na tela esperando o desfecho do clique. */
export const CORREIO_TIMEOUT_MS_PADRAO = 10_000;

const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_ENVIO = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const ESCOPO_ENVIO = "https://www.googleapis.com/auth/gmail.send";

/** base64url sem preenchimento, que é o que o JWT e a API do Gmail exigem. */
function base64url(valor: Buffer | string): string {
  return (typeof valor === "string" ? Buffer.from(valor, "utf8") : valor)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Cabeçalho MIME com valor não ASCII vai em "palavra codificada" (RFC 2047), senão o assunto com
 * acento chega picado. O assunto do link tem "Admissão", então isto não é hipótese.
 */
function cabecalhoCodificado(valor: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(valor)
    ? valor
    : `=?UTF-8?B?${Buffer.from(valor, "utf8").toString("base64")}?=`;
}

/**
 * Tira de um valor de cabeçalho qualquer coisa que possa QUEBRAR LINHA.
 *
 * INJEÇÃO DE CABEÇALHO É O RISCO CLÁSSICO DE QUEM MONTA MIME À MÃO: um `\r\n` dentro do endereço
 * do destinatário acrescenta um `Bcc:` à mensagem, e o e-mail com a credencial de acesso ao
 * prontuário sai com uma cópia para quem escreveu o cadastro. O endereço já passou por
 * `emailEnviavel` (que recusa espaço), mas a defesa mora AQUI porque é aqui que o cabeçalho nasce,
 * e não no chamador que pode mudar amanhã.
 */
function semQuebraDeLinha(valor: string): string {
  return valor.replace(/[\r\n]+/g, " ").trim();
}

@Injectable()
export class PortalCorreioService {
  private readonly log = new Logger(PortalCorreioService.name);

  /** O token de acesso vive ~1 hora. Guardado em memória para não pedir um por e-mail enviado. */
  private token: { valor: string; expiraEmMs: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get contaDeServico(): string {
    return (this.config.get<string>("PORTAL_CORREIO_SA_EMAIL") ?? "").trim();
  }

  /** A caixa DELEGADA, que é quem aparece como remetente. A conta de serviço age em nome dela. */
  private get remetente(): string {
    return (this.config.get<string>("PORTAL_CORREIO_REMETENTE") ?? "").trim();
  }

  /**
   * A chave privada RSA da conta de serviço, em PEM. Aceita as duas formas em que ela costuma
   * chegar num `.env`: com quebras de linha reais ou com `\n` escrito literalmente (que é como o
   * JSON da conta de serviço a traz quando alguém a copia de lá).
   */
  private get chavePrivada(): string {
    const cru = (this.config.get<string>("PORTAL_CORREIO_PRIVATE_KEY") ?? "").trim();
    if (!cru) return "";
    const pem = cru.includes("\\n") ? cru.replace(/\\n/g, "\n") : cru;
    return pem.includes("BEGIN") ? pem : "";
  }

  private get timeoutMs(): number {
    const cru = Number((this.config.get<string>("PORTAL_CORREIO_TIMEOUT_MS") ?? "").trim());
    return Number.isFinite(cru) && cru > 0 ? cru : CORREIO_TIMEOUT_MS_PADRAO;
  }

  /**
   * OS TRÊS, OS TRÊS. Um sem os outros não liga nada: sem a caixa delegada o Google recusa a
   * delegação, e sem a chave não há como assinar o pedido de token.
   *
   * Lido A CADA CHAMADA, e não guardado no construtor, pelo mesmo motivo do `PortalEmissorService`:
   * assim a inércia é avaliada no momento do envio e o teste consegue provar o módulo subindo com
   * o ambiente vazio, sem depender da ordem de construção dos provedores.
   */
  configurado(): boolean {
    return (
      this.contaDeServico.length > 0 && this.remetente.length > 0 && this.chavePrivada.length > 0
    );
  }

  /**
   * Troca a assercao assinada por um token de acesso (fluxo `jwt-bearer` do Google).
   *
   * O `sub` É A CAIXA DELEGADA, e é ele que faz o Google entregar um token que age EM NOME dela.
   * Sem a delegação de domínio concedida no Admin do Workspace para este `client_id` e para este
   * escopo, o Google responde `unauthorized_client` e nada é enviado, que é a inércia correta: a
   * concessão é do diretor, e o código não tem como se autoconceder.
   *
   * O ESCOPO É SÓ `gmail.send`. Não `gmail.modify`, não `gmail.readonly`: o EA precisa mandar e
   * mais nada, e um token com leitura daria ao processo acesso à caixa inteira do remetente.
   */
  private async obterToken(): Promise<string | null> {
    const agora = Date.now();
    // 60 segundos de folga: um token que vence no caminho vira 401 em um envio já contabilizado.
    if (this.token && this.token.expiraEmMs > agora + 60_000) return this.token.valor;

    const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const emSegundos = Math.floor(agora / 1000);
    const corpo = base64url(
      JSON.stringify({
        iss: this.contaDeServico,
        sub: this.remetente,
        scope: ESCOPO_ENVIO,
        aud: URL_TOKEN,
        iat: emSegundos,
        exp: emSegundos + 3600,
      }),
    );

    let assercao: string;
    try {
      const assinatura = createSign("RSA-SHA256")
        .update(`${cabecalho}.${corpo}`)
        .sign(this.chavePrivada);
      assercao = `${cabecalho}.${corpo}.${base64url(assinatura)}`;
    } catch (erro) {
      // §A.6: só o nome da classe. A mensagem do OpenSSL costuma repetir pedaços da chave.
      this.log.error(`falha ao assinar a assercao do correio: ${(erro as Error).name}`);
      return null;
    }

    const resposta = await this.postar(URL_TOKEN, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: assercao,
      }).toString(),
      rotulo: "token",
    });
    if (!resposta) return null;

    const dados = (await this.lerJson(resposta, "token")) as
      | { access_token?: string; expires_in?: number }
      | null;
    const valor = dados?.access_token;
    if (!valor) {
      this.log.error("o Google nao devolveu token de acesso para o correio do portal");
      return null;
    }

    const duracao = Number(dados?.expires_in);
    this.token = {
      valor,
      expiraEmMs: agora + (Number.isFinite(duracao) && duracao > 0 ? duracao : 3600) * 1000,
    };
    return valor;
  }

  /** Um `fetch` com tempo limite e com o log já amordaçado. Devolve `null` em qualquer falha. */
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
        // §A.6: só o rótulo da rota e o status. O corpo do erro do Google ECOA o que mandamos,
        // inclusive o destinatário, e é por ele que o endereço voltaria para o log.
        this.log.error(`o correio do portal foi recusado (${opcoes.rotulo}): ${resposta.status}`);
        return null;
      }
      return resposta;
    } catch (erro) {
      // §A.6: só o nome da classe do erro. A mensagem de rede costuma trazer a URL inteira.
      this.log.error(`falha ao falar com o correio do portal (${opcoes.rotulo}): ${(erro as Error).name}`);
      return null;
    } finally {
      clearTimeout(relogio);
    }
  }

  private async lerJson(resposta: Response, rotulo: string): Promise<unknown | null> {
    try {
      return await resposta.json();
    } catch (erro) {
      this.log.error(`resposta ilegivel do correio do portal (${rotulo}): ${(erro as Error).name}`);
      return null;
    }
  }

  /**
   * ENVIA O E-MAIL DO LINK. Verdadeiro é "o Google aceitou a mensagem"; falso é qualquer outra
   * coisa, e quem chama já sabe tratar o falso (revoga o link recém-emitido, para não deixar
   * credencial viva que ninguém recebeu).
   *
   * O CORPO VEM PRONTO de `domain/portal-envio.ts`, e este método não acrescenta uma palavra a ele.
   * A régua do que o e-mail pode conter (sem CPF, sem nascimento, sem matrícula, com o prazo e com
   * o pedido de não repassar) mora na camada pura, que é onde ela é provada em teste; duplicá-la
   * aqui faria as duas divergirem no primeiro ajuste.
   */
  async enviarLink(destinatario: string, mensagem: EmailDoLink): Promise<boolean> {
    if (!this.configurado()) return false;

    const token = await this.obterToken();
    if (!token) return false;

    const bruto = this.montarMime(semQuebraDeLinha(destinatario), mensagem);
    const resposta = await this.postar(URL_ENVIO, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ raw: base64url(bruto) }),
      rotulo: "envio",
    });
    return resposta !== null;
  }

  /**
   * O MIME, `multipart/alternative`: texto puro e HTML, o MESMO conteúdo nas duas formas.
   *
   * As duas partes existem porque a caixa do candidato pode ser qualquer coisa, inclusive um
   * cliente antigo de celular corporativo que ignora HTML. Um e-mail só em HTML que não renderiza
   * vira uma mensagem em branco, e a pessoa não recebe o endereço que a mensagem existe para levar.
   */
  private montarMime(destinatario: string, mensagem: EmailDoLink): string {
    const fronteira = `ea-portal-${Date.now().toString(36)}`;
    return [
      `From: ${semQuebraDeLinha(this.remetente)}`,
      `To: ${destinatario}`,
      `Subject: ${cabecalhoCodificado(semQuebraDeLinha(mensagem.assunto))}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${fronteira}"`,
      "",
      `--${fronteira}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(mensagem.texto, "utf8").toString("base64"),
      "",
      `--${fronteira}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(mensagem.html, "utf8").toString("base64"),
      "",
      `--${fronteira}--`,
      "",
    ].join("\r\n");
  }

  /** Diagnóstico: diz se o canal está ligado, sem revelar conta, caixa nem chave. */
  descrever(): { configurado: boolean; timeoutMs: number } {
    return { configurado: this.configurado(), timeoutMs: this.timeoutMs };
  }
}
