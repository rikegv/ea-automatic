import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  cunharBilhete,
  carregarChavePrivadaBilhete,
  ordenarCabecalhos,
  type DadosBilhete,
} from "./portal-bilhete";

/**
 * O CLIENTE DO EMISSOR. A única porta por onde o EA fala com quem assina.
 *
 * O EMISSOR NUNCA RECEBE O ARQUIVO. Ele converte bilhete válido em URL assinada, consulta metadado,
 * corrige tipo de conteúdo e apaga objeto. O byte do candidato vai do navegador direto ao balde e
 * não entra em função nenhuma, que é a condição VS7 e o veto que continua de pé desde o parecer da
 * troca do modelo do VT.
 *
 * NASCE INERTE, e isso é ESTADO TESTADO e não intenção. Sem `PORTAL_EMISSOR_URL` ou sem a chave
 * privada do bilhete, `configurado()` diz não, nenhuma chamada sai e nada lança no boot. Não existe
 * endereço de emissor padrão e não existe melhor esforço: emissor não configurado é RECUSA, nunca
 * tentativa. É o molde do webhook do Pandapé (§A.5), que nasce fechado e sem hardcode.
 *
 * ABSTER-SE É O COMPORTAMENTO SEGURO. Toda falha (não configurado, tempo limite, rede, resposta de
 * erro, corpo ilegível) devolve `null`. Quem chama já sabe tratar o nulo: a credencial não é
 * entregue, o documento continua pendente, e a próxima tentativa resolve. Inventar sucesso na dúvida
 * é o dano irreversível e silencioso da §A.33 em outra roupa.
 *
 * §A.6, E É A LINHA MAIS DURA DESTE ARQUIVO: NÃO LOGA O BILHETE, NÃO LOGA A URL, NÃO LOGA O NOME DO
 * OBJETO. O bilhete é credencial, a URL é credencial, e o nome do objeto identifica o envio de uma
 * pessoa. O que vai para o log é o destino da rota e o nome da classe do erro, e nada mais. O corpo
 * da resposta de erro também não vai: ele pode ecoar de volta o que mandamos.
 */

/** Tempo limite padrão. Curto de propósito: o candidato está na tela esperando (risco R3). */
export const EMISSOR_TIMEOUT_MS_PADRAO = 8_000;

/**
 * O ÚNICO destino aceitável para uma URL de escrita. Fixado aqui, e não deduzido da resposta.
 *
 * VETO V6, E ELE É O MAIS CARO DESTA FRENTE. Antes o EA conferia os CABEÇALHOS que voltavam e NÃO
 * conferia a URL, que é o campo que decide PARA ONDE OS BYTES VÃO. Emissor comprometido, ou resposta
 * adulterada em trânsito, devolvia a URL de outro domínio com os mesmos cabeçalhos: o candidato
 * enviava o documento de identidade dele para um terceiro, a consulta de metadado depois dizia que
 * o objeto não chegou, o documento continuava pendente e ele enviava de novo. NADA FALHAVA, que é a
 * forma exata do dano da §A.33.
 *
 * E isso anulava justamente a condição B2: a identidade que só cria objeto existe para que um
 * emissor comprometido NÃO consiga obter documento nenhum, e redirecionar o envio é a única rota que
 * devolve os bytes a ele.
 */
const GCS_HOST = "storage.googleapis.com";

/** O que o emissor devolve quando o destino é assinar escrita. */
export interface UrlAssinada {
  url: string;
  /** Exatamente os cabeçalhos que o navegador TEM de reproduzir. Faltou um, o Google recusa. */
  cabecalhos: Record<string, string>;
  expiraEm: Date;
}

/** A resposta crua de assinar escrita, antes de a data virar `Date`. */
interface RespostaAssinatura {
  url?: string;
  cabecalhos?: Record<string, string>;
  expiraEm?: string;
}

/**
 * A resposta de consulta de metadado. `existe` falso significa objeto ausente, não falha.
 *
 * `objeto` É O ECO, E ELE É OBRIGATÓRIO NO CONTRATO. Ver a conferência em `consultarMetadado`.
 */
export interface RespostaMetadado {
  /** Eco do objeto consultado. Ausente ou diferente do pedido, a resposta é RECUSADA. */
  objeto?: string;
  existe?: boolean;
  bytes?: number;
  contentType?: string;
  geracao?: number | null;
}

/** A resposta das operações de curadoria que só dizem se deu certo. */
export interface RespostaOk {
  ok?: boolean;
}

/**
 * VETO V6: a URL devolvida aponta para o NOSSO balde, o NOSSO objeto, por `https`, ou não serve.
 *
 * Aceita as duas formas que o armazenamento do Google usa, a de caminho
 * (`storage.googleapis.com/{balde}/{objeto}`) e a de domínio virtual
 * (`{balde}.storage.googleapis.com/{objeto}`), e mais nenhuma. A comparação do caminho é por
 * IGUALDADE, não por conter: "contém o nome do objeto" passaria numa URL de outro domínio que
 * carregasse o nosso nome num parâmetro.
 */
export function urlDeEscritaConfere(url: string, bucket: string, objeto: string): boolean {
  if (!bucket || !objeto) return false;
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    return false;
  }
  if (endereco.protocol !== "https:") return false;

  let caminho: string;
  try {
    caminho = decodeURIComponent(endereco.pathname);
  } catch {
    return false;
  }

  if (endereco.hostname === GCS_HOST) return caminho === `/${bucket}/${objeto}`;
  if (endereco.hostname === `${bucket}.${GCS_HOST}`) return caminho === `/${objeto}`;
  return false;
}

@Injectable()
export class PortalEmissorService {
  private readonly log = new Logger(PortalEmissorService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * O endereço do emissor, e ele é EXIGIDO EM `https`.
   *
   * O bilhete É uma credencial e viaja no corpo do pedido: em claro, quem estiver no caminho o
   * copia e troca por uma URL de escrita dentro dos 60 segundos. Endereço que não seja `https` é
   * tratado como NÃO CONFIGURADO, ou seja, o portal fica inerte, em vez de falar em claro.
   *
   * A ÚNICA EXCEÇÃO É O LOOPBACK LITERAL (`127.0.0.1`, `::1`, `localhost`), e ela é estreita de
   * propósito: ali o bilhete não sai da máquina, então não há caminho onde ser copiado. É a mesma
   * régua que o navegador usa para tratar `localhost` como contexto seguro. Em produção o emissor
   * roda no nosso projeto do Google e é sempre `https`; o loopback só existe para o servidor falso
   * dos testes, e deixar essa porta aberta em claro para a internet seria trocar o veto por um
   * descuido de configuração.
   */
  private get baseUrl(): string {
    const cru = (this.config.get<string>("PORTAL_EMISSOR_URL") ?? "").trim().replace(/\/+$/, "");
    if (!cru) return "";
    let endereco: URL;
    try {
      endereco = new URL(cru);
    } catch {
      return "";
    }
    if (endereco.protocol === "https:") return cru;
    const loopback = ["127.0.0.1", "::1", "[::1]", "localhost"].includes(endereco.hostname);
    return endereco.protocol === "http:" && loopback ? cru : "";
  }

  private get kid(): string {
    return (this.config.get<string>("PORTAL_EMISSOR_KID") ?? "").trim();
  }

  private get timeoutMs(): number {
    const cru = Number((this.config.get<string>("PORTAL_EMISSOR_TIMEOUT_MS") ?? "").trim());
    return Number.isFinite(cru) && cru > 0 ? cru : EMISSOR_TIMEOUT_MS_PADRAO;
  }

  /**
   * A chave privada do bilhete, recarregada a cada uso em vez de guardada no construtor. É de
   * propósito: assim a inércia é avaliada no momento do pedido, e o teste consegue provar o módulo
   * subindo com o ambiente vazio sem depender da ordem de construção dos provedores.
   */
  private chave() {
    return carregarChavePrivadaBilhete(
      this.config.get<string>("PORTAL_EMISSOR_BILHETE_PRIVATE_KEY"),
    );
  }

  /** Endereço e chave, os dois. Um sem o outro não liga nada. */
  configurado(): boolean {
    return this.baseUrl.length > 0 && this.chave() !== null;
  }

  /**
   * Cunha o bilhete e o troca com o emissor. Uma rota por destino, porque destino diferente é
   * IDENTIDADE diferente do lado de lá (condições B2 e B3): quem assina a credencial do candidato
   * não pode ser quem apaga.
   *
   * O corpo é só o bilhete. Método, objeto e cabeçalhos viajam DENTRO dele, assinados, e é isso que
   * impede o emissor de escolher qualquer um dos três (condição B1).
   */
  private async trocar<T>(dados: DadosBilhete): Promise<T | null> {
    const base = this.baseUrl;
    const chave = this.chave();
    if (!base || !chave) return null;

    const bilhete = cunharBilhete(dados, chave, this.kid);
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), this.timeoutMs);
    try {
      const resposta = await fetch(`${base}/${dados.destino}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bilhete }),
        signal: controle.signal,
      });
      if (!resposta.ok) {
        // §A.6: só o destino e o status. O corpo do erro pode devolver o que mandamos.
        this.log.error(`emissor do portal recusou (${dados.destino}): ${resposta.status}`);
        return null;
      }
      return (await resposta.json()) as T;
    } catch (erro) {
      // §A.6: só o nome da classe do erro. A mensagem de rede costuma trazer a URL inteira.
      this.log.error(`falha ao falar com o emissor do portal (${dados.destino}): ${(erro as Error).name}`);
      return null;
    } finally {
      clearTimeout(relogio);
    }
  }

  /**
   * Destino `assinar-escrita`. Devolve a URL que o NAVEGADOR usa, mais os cabeçalhos obrigatórios.
   *
   * DUAS CONFERÊNCIAS, E NENHUMA DELAS É OPCIONAL.
   *
   * A PRIMEIRA, OS CABEÇALHOS. O emissor não pode acrescentar, remover nem reordenar nenhum deles
   * (condição B1). Divergência aqui significa que a régua saiu de `domain/portal-credencial.ts` e
   * virou confiança no emissor, que é exatamente o rebaixamento que o parecer vetou. E a comparação
   * é contra o que DE FATO FOI ASSINADO, ou seja, o mapa já normalizado que entrou no bilhete, e não
   * contra o mapa cru que o chamador passou: hoje o domínio emite tudo em minúsculas e os dois
   * coincidem, mas no dia em que um cabeçalho nascer com maiúscula a conferência reprovaria um
   * emissor honesto.
   *
   * A SEGUNDA, A URL, E É O VETO V6. O campo que decide para onde os bytes vão é conferido antes de
   * sair daqui: esquema, domínio do armazenamento do Google, o balde que NÓS configuramos e o nome
   * do objeto que NÓS escolhemos. Divergiu, recusa.
   */
  async assinarEscrita(dados: DadosBilhete): Promise<UrlAssinada | null> {
    const resposta = await this.trocar<RespostaAssinatura>(dados);
    if (!resposta?.url) return null;

    const devolvidos = resposta.cabecalhos ?? {};
    const assinados = ordenarCabecalhos(dados.cabecalhos);
    const mesmos =
      Object.keys(devolvidos).length === Object.keys(assinados).length &&
      Object.entries(assinados).every(([nome, valor]) => devolvidos[nome] === valor);
    if (!mesmos) {
      // Sem nomes e sem valores no log: o que importa registrar é que a régua divergiu.
      this.log.error("emissor do portal devolveu cabecalhos diferentes dos assinados pelo EA");
      return null;
    }

    if (!urlDeEscritaConfere(resposta.url, dados.bucket, dados.objeto)) {
      // §A.6: nem a URL devolvida, nem o balde, nem o objeto vão para o log. O que se registra é
      // que o destino não era o nosso, que é a única informação acionável.
      this.log.error("emissor do portal devolveu URL para destino diferente do nosso armazenamento");
      return null;
    }

    const expira = new Date(resposta.expiraEm ?? "");
    return {
      url: resposta.url,
      cabecalhos: assinados,
      expiraEm: Number.isNaN(expira.getTime()) ? new Date(dados.absEpoch * 1000) : expira,
    };
  }

  /**
   * Destino `metadado`. A palavra do navegador não entra nesta conta, quem responde é o balde.
   *
   * O ECO DO OBJETO É OBRIGATÓRIO, E É CONFERIDO AQUI. `domain/portal-chegada.ts` recusa quando o
   * objeto do metadado difere do da credencial, e trata isso como o pior desfecho possível. Essa
   * conferência só vale alguma coisa se o nome vier do OUTRO LADO: montada com o nosso próprio
   * objeto ela é tautologia, nunca falha, e um emissor que responda sobre outro objeto confirmaria
   * uma chegada que não houve, deixando o documento apontando para o vazio.
   *
   * Eco AUSENTE é recusa, não é tolerância: resposta sem o campo é contrato velho ou resposta
   * inventada, e as duas terminam na mesma confirmação falsa.
   */
  async consultarMetadado(dados: DadosBilhete): Promise<RespostaMetadado | null> {
    const resposta = await this.trocar<RespostaMetadado>(dados);
    if (!resposta) return null;
    if (resposta.objeto !== dados.objeto) {
      this.log.error("emissor do portal respondeu metadado sem o eco do objeto consultado");
      return null;
    }
    return resposta;
  }

  /** Destino `corrigir-tipo`. Exigência 10: o tipo corrigido por nós, depois da leitura. */
  async corrigirTipo(dados: DadosBilhete): Promise<boolean> {
    const resposta = await this.trocar<RespostaOk>(dados);
    return resposta?.ok === true;
  }

  /** Destino `apagar`. Outra rota e OUTRA identidade, nunca a que assina a credencial (B3). */
  async apagar(dados: DadosBilhete): Promise<boolean> {
    const resposta = await this.trocar<RespostaOk>(dados);
    return resposta?.ok === true;
  }

  /** Diagnóstico: diz se o emissor está ligado, sem revelar endereço nem chave. */
  descrever(): { configurado: boolean; timeoutMs: number } {
    return { configurado: this.configurado(), timeoutMs: this.timeoutMs };
  }
}
