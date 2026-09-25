import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * O CLIENTE DO LEITOR DO PORTAL, que é uma SEGUNDA instância do `ai-service`, dedicada.
 *
 * POR QUE ESTE ARQUIVO EXISTE EM VEZ DE UM MÉTODO NOVO NO `AiClientService`: o isolamento é o ponto
 * inteiro da exigência 3. A instância da operação (porta 8000) carrega a credencial do banco e a do
 * Drive delegado e atende a auditoria da esteira; a do portal (porta 8020) é magra, sem banco e sem
 * Drive, porque é ela que abre arquivo de origem externa, possivelmente hostil. Reaproveitar
 * `AI_SERVICE_URL` e `AI_SERVICE_TOKEN` desfaria metade do isolamento: um token que vale nas duas
 * faz de quem comprometer a instância exposta um cliente legítimo da instância que tem as chaves da
 * casa. Por isso a base e o token são VARIÁVEIS PRÓPRIAS, e não há fallback para as da operação.
 *
 * NASCE INERTE. Sem `PORTAL_LEITOR_URL` e `PORTAL_LEITOR_TOKEN`, `configurado()` diz não e o
 * caminho segue pelo ramo já testado (sugestão nula, documento confirmado, objeto intacto), sem
 * quebrar o boot.
 *
 * §A.6: o pedido CARREGA nome e CPF do candidato, porque é com eles que a régua de auditoria
 * confere o documento, exatamente como na esteira. Eles transitam em memória, não são logados aqui
 * em hipótese nenhuma, e o que volta são rótulos e números, nunca o texto do documento.
 */

/** O bloco de chegada que o leitor devolve. Números e rótulos, nunca nome de objeto nem valor. */
export interface ChegadaDoLeitor {
  tamanhoBytes: number;
  mimeDetectado?: string | null;
  tipoDeclarado?: string | null;
  md5?: string | null;
  criadoEm?: string | null;
  geracao?: number | null;
  paginas?: number | null;
  largura?: number | null;
  altura?: number | null;
  conteudoAtivo?: string[];
}

/**
 * UM campo do auto-preenchimento. `lido: false` com `valor` vazio é resposta NORMAL e frequente: a
 * IA não leu aquele campo com confiança suficiente e NÃO chutou. O consumidor mostra o campo em
 * branco para a pessoa digitar. Campo chutado num formulário de admissão vira dado errado no
 * eSocial, que é multa; campo vazio custa dez segundos de digitação.
 *
 * §A.6: `valor` é PII PURA. Ele existe para viajar até a tela do candidato e mais nada. Não pode ser
 * persistido, não pode entrar em log, em evento da trilha, em mensagem de erro nem em rastro de
 * exceção.
 */
export interface SugestaoCampoDoLeitor {
  campo: string;
  rotulo: string;
  valor: string;
  confianca: number;
  lido: boolean;
}

/**
 * O bloco de auto-preenchimento. Os dois campos fixos existem por causa do veto V12: eles viajam em
 * toda resposta para que nenhum consumidor, agora ou daqui a um ano, trate isto como dado conferido.
 */
export interface SugestoesDoLeitor {
  origem: "IA_SUGESTAO";
  exigeConfirmacaoHumana: true;
  campos: SugestaoCampoDoLeitor[];
}

export interface RespostaDoLeitor {
  /** `false` com `recusa` preenchido é resposta NORMAL (arquivo que não serve), não erro nosso. */
  aceito: boolean;
  recusa?: string | null;
  motivo?: string;
  chegada: ChegadaDoLeitor;
  auditoria?: {
    valido: boolean;
    status: string;
    motivo: string;
    camposConferidos?: string[];
    divergenciasCadastro?: string[];
  } | null;
  /**
   * ACRÉSCIMO do leitor, não troca: `auditoria` responde "este documento serve?" e continua igual;
   * `sugestoes` responde "e o que está escrito nele?", que é a metade do auto-preenchimento.
   *
   * Nulo quando não houve leitura (arquivo recusado, sem regra ativa) ou quando o tipo de documento
   * não tem catálogo de campos mapeado. Nulo é normal e silencioso: a tela simplesmente não sugere.
   */
  sugestoes?: SugestoesDoLeitor | null;
}

export interface PedidoDeLeitura {
  bucket: string;
  objeto: string;
  tipoDocumentoCodigo: string;
  tipoDocumentoNome: string;
  candidato: { nome: string; cpf: string };
  regras: { descricaoRegra: string }[];
}

/** Recusa do leitor mapeada para o vocabulário fechado da trilha (`PORTAL_MOTIVOS`). */
export const MOTIVO_POR_RECUSA: Record<string, string> = {
  TEMPO: "TEMPO",
  PAGINAS: "PAGINAS",
  DIMENSAO: "DIMENSAO",
  PROTEGIDO_SENHA: "PROTEGIDO_SENHA",
  SENHA: "PROTEGIDO_SENHA",
  CONTEUDO_ATIVO: "CONTEUDO_ATIVO",
  FORMATO: "FORMATO",
  HEIC: "HEIC",
  TAMANHO: "TAMANHO",
};

@Injectable()
export class PortalLeitorService {
  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return (this.config.get<string>("PORTAL_LEITOR_URL") ?? "").trim().replace(/\/+$/, "");
  }

  private get token(): string {
    return (this.config.get<string>("PORTAL_LEITOR_TOKEN") ?? "").trim();
  }

  configurado(): boolean {
    return this.baseUrl.length > 0 && this.token.length > 0;
  }

  /**
   * Chama `POST /portal/ler`. Lança quando não está configurado, quando a rede falha ou quando o
   * leitor devolve erro HTTP, e lançar é o comportamento certo: o orquestrador
   * (`domain/portal-caminho-arquivo.ts`) já trata a leitura que falha do jeito decidido, sem
   * desfazer a chegada já confirmada e sem apagar o arquivo.
   *
   * O tempo limite é nosso além de ser dele: o leitor mata o processo filho no estouro, mas uma
   * instância travada antes disso prenderia a requisição do candidato indefinidamente.
   */
  async ler(pedido: PedidoDeLeitura): Promise<RespostaDoLeitor> {
    if (!this.configurado()) throw new Error("leitor do portal nao configurado");

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 90_000);
    try {
      const res = await fetch(`${this.baseUrl}/portal/ler`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": this.token },
        body: JSON.stringify(pedido),
        signal: controle.signal,
      });
      if (!res.ok) {
        // §A.6: só o status. O corpo do erro pode ecoar detalhe do documento ou do candidato.
        throw new Error(`leitor do portal respondeu ${res.status}`);
      }
      return (await res.json()) as RespostaDoLeitor;
    } finally {
      clearTimeout(relogio);
    }
  }

  /** Diagnóstico: diz se o leitor está ligado, sem revelar token nem URL completa. */
  descrever(): { configurado: boolean } {
    return { configurado: this.configurado() };
  }
}
