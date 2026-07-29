import { Injectable, Logger } from "@nestjs/common";
import { PandapeApiService } from "./pandape-api.service";
import { resolverExtensaoDocumento } from "./mime-documento";
import { resolverTipoDocumento } from "./resolver-tipo-documento";

/**
 * Teto de anexos por TIPO, gêmeo do que o `pandape-sync.service` aplica no pull. Repetido aqui de
 * propósito: este service NÃO depende do sync (é justamente o que evita o ciclo de módulos), então
 * ele carrega o próprio limite em vez de importar a constante de lá.
 */
export const MAX_ARQUIVOS_POR_TIPO = 10;

/** Um anexo baixado, já com o TIPO do EA resolvido. `originalname` é o CÓDIGO do tipo (§A.6). */
export interface ArquivoBaixado {
  codigoTipo: string;
  buffer: Buffer;
  originalname: string;
}

/** Por que a baixa parou antes da hora. Vira motivo gravado em `admissoes.drive_falha_motivo`. */
export type AbortoBaixa = "QUOTA" | "TIMEOUT" | "API_FORA" | "INERTE";

export interface ResultadoBaixa {
  arquivos: ArquivoBaixado[];
  /** Códigos PEDIDOS que o Pandapé não devolveu (formulário ausente ou sem anexo baixável). */
  semRetorno: string[];
  /** Preenchido quando a baixa foi interrompida. Com aborto NÃO se insiste, nem no ciclo seguinte. */
  abortadoPor?: AbortoBaixa;
  /** Chamadas à API do Pandapé gastas (o contrato é UMA por admissão; os downloads não contam). */
  chamadasApi: number;
}

/**
 * RE-BAIXA DE ANEXOS DO PANDAPÉ, por TIPO (OST re-baixar do Pandapé no arquivamento).
 *
 * POR QUE É UM SERVICE PRÓPRIO, e não mais um método do `PandapeSyncService`. O arquivamento no Drive
 * mora no `AuditoriaService`, e o `PandapeModule` JÁ importa o `AuditoriaModule` (o pull reusa a F2).
 * Pendurar a re-baixa no sync e injetar o sync na auditoria fecharia o ciclo
 * Auditoria → Pandapé → Auditoria, que o Nest só resolveria com `forwardRef`. Este service depende
 * APENAS do `PandapeApiService`, então mora num módulo folha que auditoria e reauditoria importam sem
 * ninguém importar de volta.
 *
 * TRAVAS DE COTA (a cota do Pandapé é COMPARTILHADA com o webhook que alimenta a esteira, §A.5):
 *  - UMA única chamada de formulários por admissão, qualquer que seja o número de tipos pedidos;
 *  - downloads SEQUENCIAIS, nunca em paralelo;
 *  - HTTP 429 ABORTA na hora, devolve o que já baixou e NÃO insiste: quem chamou grava o motivo e
 *    acende o sinal, em vez de martelar o limite;
 *  - só se pede o que falta: a lista de códigos vem de fora, já filtrada.
 *
 * O QUE ESTE SERVICE NÃO FAZ, e não pode passar a fazer: **não toca o banco**. Ele não tem `Database`
 * injetado. É a trava estrutural que garante que re-baixar um arquivo jamais reescreve veredito de
 * documento, nem o da IA nem o da validação humana (§ trava crítica da OST).
 *
 * §A.6: a URL do anexo trafega só em memória, nunca é persistida nem logada; o `originalname` é o
 * CÓDIGO do tipo, jamais o nome real do arquivo (que já carregou CPF no acervo real).
 */
@Injectable()
export class PandapeArquivosService {
  private readonly logger = new Logger("PandapeArquivosService");

  /** Mesmo teto do cliente da API, para o download não pendurar o arquivamento indefinidamente. */
  private static readonly TIMEOUT_MS = 30_000;

  constructor(private readonly api: PandapeApiService) {}

  /**
   * Baixa os anexos dos tipos pedidos, agrupados por tipo. UMA chamada de formulários, N downloads.
   *
   * Devolve sempre um resultado (nunca lança): o arquivamento que chama daqui precisa decidir o que
   * gravar como motivo, e uma exceção apagaria a diferença entre "429" e "o tipo não existe lá".
   */
  async baixarArquivosDosTipos(
    idPrecollaborator: string,
    codigos: readonly string[],
  ): Promise<ResultadoBaixa> {
    const pedidos = [...new Set(codigos.filter(Boolean))];
    if (pedidos.length === 0) return { arquivos: [], semRetorno: [], chamadasApi: 0 };

    // TRAVA DE COTA 1: uma chamada só, para todos os tipos.
    const resposta = await this.api.getFormulariosDocumentosComStatus(idPrecollaborator);
    const chamadasApi = resposta.falha === "INERTE" ? 0 : 1;
    const aborto = abortoDaResposta(resposta.status, resposta.falha);
    if (aborto) {
      this.logger.warn(
        `Re-baixa de documentos abortada antes de baixar: motivo=${aborto}, tipos pedidos=${pedidos.length}.`,
      );
      return { arquivos: [], semRetorno: pedidos, abortadoPor: aborto, chamadasApi };
    }

    const formularios = resposta.dados ?? [];
    // Anexos por TIPO do EA. Um mesmo tipo pode vir de mais de um formulário: os anexos se somam,
    // respeitando o teto por tipo.
    const porTipo = new Map<string, string[]>();
    for (const form of formularios) {
      const codigo = resolverTipoDocumento((form.name ?? "").trim());
      if (!codigo || !pedidos.includes(codigo)) continue;
      const urls = (form.documents ?? [])
        .map((d) => d.link ?? d.url)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
      const acumulado = porTipo.get(codigo) ?? [];
      porTipo.set(codigo, [...acumulado, ...urls].slice(0, MAX_ARQUIVOS_POR_TIPO));
    }

    const arquivos: ArquivoBaixado[] = [];
    const comArquivo = new Set<string>();
    let abortadoPor: AbortoBaixa | undefined;

    // TRAVA DE COTA 2: downloads SEQUENCIAIS. O laço quebra inteiro no primeiro 429.
    for (const [codigo, urls] of porTipo) {
      for (const url of urls) {
        const baixado = await this.baixarUm(url);
        if (baixado.aborto) {
          abortadoPor = baixado.aborto;
          break;
        }
        if (!baixado.buffer) continue; // este anexo não veio; os outros do tipo seguem valendo.
        const ext = resolverExtensaoDocumento(baixado.contentType, baixado.buffer);
        arquivos.push({
          codigoTipo: codigo,
          buffer: baixado.buffer,
          originalname: `${codigo}${ext ?? ""}`,
        });
        comArquivo.add(codigo);
      }
      if (abortadoPor) break;
    }

    const semRetorno = pedidos.filter((c) => !comArquivo.has(c));
    // §A.6: contagens e códigos de tipo. Sem id, sem URL, sem nome de arquivo, sem PII.
    this.logger.log(
      `Re-baixa do Pandapé: tipos pedidos=${pedidos.length}, arquivos baixados=${arquivos.length}, ` +
        `tipos sem retorno=${semRetorno.length}, chamadas de API=${chamadasApi}` +
        `${abortadoPor ? `, ABORTADA por ${abortadoPor}` : ""}.`,
    );

    return {
      arquivos,
      semRetorno,
      ...(abortadoPor ? { abortadoPor } : {}),
      chamadasApi,
    };
  }

  /**
   * Baixa UM anexo. A URL do Pandapé é pública e não expira (§A.5), então o download não passa pelo
   * OAuth: é um GET direto, com timeout próprio. Erro de um anexo NÃO derruba os demais; 429 sim,
   * porque insistir contra um limite de cota é o oposto do que se quer.
   */
  private async baixarUm(url: string): Promise<{
    buffer?: Buffer;
    contentType?: string | null;
    aborto?: AbortoBaixa;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PandapeArquivosService.TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 429) return { aborto: "QUOTA" };
      if (!res.ok) {
        // Só o status: a URL nunca vai para o log (§A.6).
        this.logger.warn(`Download de anexo do Pandapé falhou (HTTP ${res.status}), anexo pulado.`);
        return {};
      }
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get("content-type"),
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error("Download de anexo do Pandapé excedeu o tempo limite.");
        return { aborto: "TIMEOUT" };
      }
      this.logger.error("Falha de rede ao baixar anexo do Pandapé.");
      return { aborto: "API_FORA" };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Traduz o desfecho da chamada de formulários em ABORTO, ou `undefined` quando dá para seguir.
 * Exportada para o teste travar a regra do 429 sem precisar de rede.
 */
export function abortoDaResposta(
  status: number | undefined,
  falha: "TIMEOUT" | "REDE" | "SEM_TOKEN" | "INERTE" | undefined,
): AbortoBaixa | undefined {
  if (falha === "INERTE") return "INERTE";
  if (falha === "TIMEOUT") return "TIMEOUT";
  if (falha === "REDE" || falha === "SEM_TOKEN") return "API_FORA";
  if (status === 429) return "QUOTA";
  if (status !== undefined && status >= 400) return "API_FORA";
  return undefined;
}
