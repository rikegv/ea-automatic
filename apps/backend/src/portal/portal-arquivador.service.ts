import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DriveSubpasta } from "@ea/shared-types";

/**
 * O CLIENTE DO ARQUIVADOR DO PORTAL, que é uma TERCEIRA instância do `ai-service`, dedicada.
 *
 * POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE É IRMÃO DO `PortalLeitorService` E NÃO UM MÉTODO NO
 * `AiClientService`: a separação de capacidade é o centro do Desenho 1 (frente Prontuário Drive) e
 * da postura VS3 (docs/PARECER-SEGURANCA-PORTAL-CONSTRUIDO.md). Três instâncias, três papéis:
 *  - a da OPERAÇÃO (8000) tem banco e Drive DELEGADO e atende a auditoria da esteira;
 *  - a do LEITOR (8020) é magra, lê o balde e AUDITA, SEM Drive (quem abre arquivo hostil não
 *    segura a chave do prontuário);
 *  - a do ARQUIVADOR (esta) é magra, lê o balde e ESCREVE o prontuário, "cega" (copia bytes, não
 *    interpreta), com a service account `ea-portal-arquivador`, que tem leitura só no balde e
 *    escrita só nas pastas-pai do prontuário por compartilhamento (sem delegação domain-wide).
 *
 * Reaproveitar a base/token de qualquer outra instância desfaria o isolamento: um token que vale em
 * duas faz de quem comprometer uma delas um cliente legítimo da outra. Por isso a base e o token são
 * VARIÁVEIS PRÓPRIAS (`PORTAL_ARQUIVADOR_URL` / `PORTAL_ARQUIVADOR_TOKEN`), sem fallback.
 *
 * NASCE INERTE (condição 6). Sem as duas variáveis, `configurado()` diz não e o arquivamento do
 * Portal simplesmente não dispara, sem quebrar o boot. A chave da conta e o binding de IAM são do
 * diretor (§A.0); enquanto não existirem, esta ponte fica desligada.
 *
 * §A.6: o pedido carrega `objeto` (nome OPACO do balde, sem PII) e `nomeFinal` (que leva o nome do
 * candidato, a exceção já registrada do prontuário). Nenhum dos dois é logado aqui. O que volta são
 * contagens e ids de pasta do Drive, que não são dado pessoal.
 */

/** Um objeto confirmado no balde, a copiar para o prontuário. */
export interface ObjetoParaArquivar {
  objeto: string;
  nomeFinal: string;
  subpasta: DriveSubpasta;
}

export interface PedidoDeArquivamento {
  bucket: string;
  parentFolderId: string;
  pastaNome: string;
  /** Âncora: id da pasta que a admissão já tem gravada. Quando vem, vai direto nela (sem busca). */
  pastaId?: string | null;
  itens: ObjetoParaArquivar[];
}

/** Espelha o `ArquivamentoDrive` do ai-service. Ids de pasta/arquivo não são PII. */
export interface RespostaDoArquivador {
  pastaUrl: string;
  arquivados: number;
  arquivosIds: string[];
  ignorados: number;
  pastaJaExistia: boolean;
  duplicatas: string[];
  falhas: number;
  motivoFalhas: string[];
}

@Injectable()
export class PortalArquivadorService {
  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>("PORTAL_ARQUIVADOR_URL") ?? "").trim().replace(/\/+$/, "");
  }

  private get token(): string {
    return (this.config.get<string>("PORTAL_ARQUIVADOR_TOKEN") ?? "").trim();
  }

  configurado(): boolean {
    return this.baseUrl.length > 0 && this.token.length > 0;
  }

  /**
   * Chama `POST /portal/arquivar` na instância do arquivador. Lança quando não está configurado,
   * quando a rede falha ou quando o arquivador devolve erro HTTP, e lançar é o comportamento certo:
   * quem chama (`PortalArquivamentoService`) trata a falha como "não arquivou ainda" e deixa para a
   * próxima tentativa, exatamente como o runner retro é idempotente pela dedup de md5.
   */
  async arquivar(pedido: PedidoDeArquivamento): Promise<RespostaDoArquivador> {
    if (!this.configurado()) throw new Error("arquivador do portal nao configurado");

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 120_000);
    try {
      const res = await fetch(`${this.baseUrl}/portal/arquivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": this.token },
        body: JSON.stringify(pedido),
        signal: controle.signal,
      });
      if (!res.ok) {
        // §A.6: só o status. O corpo do erro pode ecoar detalhe do documento ou do candidato.
        throw new Error(`arquivador do portal respondeu ${res.status}`);
      }
      return (await res.json()) as RespostaDoArquivador;
    } finally {
      clearTimeout(relogio);
    }
  }

  /**
   * VISUALIZAÇÃO na Auditoria: baixa os BYTES de um objeto do balde pela mesma conta cega, para o
   * backend servir INLINE ao auditor. Lança quando não configurado ou em erro HTTP. §A.6: só o
   * status no erro; o nome do objeto não é logado aqui.
   */
  async baixarDocumento(pedido: {
    bucket: string;
    objeto: string;
  }): Promise<{ bytes: Buffer; contentType: string }> {
    if (!this.configurado()) throw new Error("arquivador do portal nao configurado");

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 120_000);
    try {
      const res = await fetch(`${this.baseUrl}/portal/documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": this.token },
        body: JSON.stringify(pedido),
        signal: controle.signal,
      });
      if (!res.ok) {
        throw new Error(`arquivador do portal (documento) respondeu ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      return { bytes: buf, contentType };
    } finally {
      clearTimeout(relogio);
    }
  }

  /** Diagnóstico: diz se o arquivador está ligado, sem revelar token nem URL completa. */
  descrever(): { configurado: boolean } {
    return { configurado: this.configurado() };
  }
}
