import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  conferirCabecalhoDaPlanilha,
  lerLinhaProjetadaDoAiService,
  type LinhaProjetadaDaPlanilha,
} from "../../domain/as-planilha-cliente-colunas";

/**
 * ─ A LEITURA DA PLANILHA VIVA DO TIME: O BACKEND CONSOME, O `ai-service` TOCA O DRIVE ──────────
 *
 * ┌─ POR QUE A LEITURA NÃO É AQUI, E ISSO NÃO É PREFERÊNCIA ─────────────────────────────────────┐
 * │ O backend (Node) NÃO TEM `googleapis`, `google-auth-library`, nem biblioteca de planilha ou de │
 * │ zip, e o `ai-service` (Python) tem a credencial, a biblioteca de auth do Google e já expõe     │
 * │ rotas que o backend consome. Instalar dependência de Drive no backend para ler uma planilha    │
 * │ seria arrastar uma credencial com ESCOPO DE ESCRITA no Drive da empresa para dentro do         │
 * │ processo que serve as rotas autenticadas.                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUEM DECIDE É O BACKEND, E O `ai-service` NÃO JULGA NADA (contrato medido, 01/10/2026) ─────┐
 * │ Os valores chegam CRUS, só com `strip`: `' 1587726'` chega como `'1587726'`, mas `SL0012`      │
 * │ chega como está, e NADA é normalizado, casado ou julgado do outro lado. O que é chave válida,  │
 * │ o que é a família `SL...` a rejeitar, o que é ambíguo e o que discorda entre as duas chaves é  │
 * │ decidido aqui, com TESTE PURO (`domain/as-depara-cliente-vaga.ts`).                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A SEGUNDA PENEIRA, E ELA É FAIL-CLOSED (§A.6) ──────────────────────────────────────────────┐
 * │ A projeção do outro lado é PYTHON, em outro deploy, com outro ciclo de release: um dia ele     │
 * │ sobe com uma coluna a mais (por engano, por depuração, por "o time pediu o consultor na tela") │
 * │ e o backend, confiando, grava e loga o que recebeu. Toda linha passa por                       │
 * │ `lerLinhaProjetadaDoAiService`, e o CABEÇALHO devolvido é conferido contra a lista branca antes │
 * │ de qualquer linha ser lida. Quem recebe não confia em quem manda, mesmo sendo a mesma casa.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NASCE INERTE: sem `AS_PLANILHA_VIVA_FILE_ID` no ambiente, nenhuma requisição é feita e nenhuma
 * linha é lida. Não há identificador no código (§A.5: sem insumo a porta nasce fechada, sem
 * hardcode), e isso também é o que impede a sincronização de apontar para a planilha errada por um
 * valor esquecido num commit.
 *
 * §A.6: NADA do corpo da resposta entra em log, em nenhum nível, nem em mensagem de erro. São 1,9 MB
 * de dado operacional com salário, consultor e nome de candidato aprovado dentro, e a forma clássica
 * de isso virar log permanente não é um `console.log` deliberado, é um `throw new Error("resposta
 * inesperada: " + corpo)` escrito de boa-fé para a depuração ficar fácil.
 */

/** O que a leitura devolve, já peneirado pela lista branca. */
export interface PlanilhaVivaLida {
  /** Quantas linhas úteis o outro lado contou. Número, nunca conteúdo. */
  totalLinhas: number;
  linhas: LinhaProjetadaDaPlanilha[];
}

/**
 * POR QUE A LEITURA FALHOU, em três famílias, e cada uma tem uma AÇÃO diferente:
 *  . `TRANSITORIA` (503): o Drive não respondeu. Retentar na volta seguinte resolve;
 *  . `DEFINITIVA` (422, 413): cabeçalho faltando ou repetido, formato inesperado, planilha acima do
 *    teto. RETENTAR NÃO MUDA NADA, e insistir só gasta a cota da credencial;
 *  . `INALCANCAVEL`: o `ai-service` fora do ar, proxy devolvendo HTML, rota ainda não publicada.
 *
 * NENHUMA DELAS APAGA NADA, e isso é requisito: planilha ilegível hoje não pode destruir a proposta
 * de ontem. Quem escreve é a sincronização, e ela só escreve DEPOIS de uma leitura completa.
 */
export const FAMILIAS_DE_FALHA_DA_PLANILHA = [
  "TRANSITORIA",
  "DEFINITIVA",
  "INALCANCAVEL",
] as const;
export type FamiliaDeFalhaDaPlanilha = (typeof FAMILIAS_DE_FALHA_DA_PLANILHA)[number];

export class FalhaDaPlanilhaViva extends Error {
  constructor(
    readonly familia: FamiliaDeFalhaDaPlanilha,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "FalhaDaPlanilhaViva";
  }
}

/** O nome da variável que destrava a leitura. É o NOME que pode ir a log, nunca o valor. */
export const VARIAVEL_DO_ARQUIVO_DA_PLANILHA = "AS_PLANILHA_VIVA_FILE_ID";

/**
 * ┌─ ESTA CLASSE NÃO TEM `Logger`, E A AUSÊNCIA É DELIBERADA ────────────────────────────────────┐
 * │ Ela é o ÚNICO ponto do backend que segura o corpo da planilha (1,9 MB de dado operacional, com │
 * │ salário, consultor e nome de candidato aprovado dentro). Um logger declarado aqui é uma arma   │
 * │ carregada: a forma clássica de aquele corpo virar log permanente não é um `console.log`         │
 * │ deliberado, é `this.logger.error("resposta inesperada", corpo)` escrito de boa-fé para a        │
 * │ depuração ficar fácil, e dali ele não sai mais (o log está fora do alcance do expurgo).         │
 * │                                                                                                │
 * │ QUEM REGISTRA É A SINCRONIZAÇÃO (`depara-cliente.service.ts`), e ela registra CONTAGEM: linhas │
 * │ lidas, chaves, criadas, atualizadas, malformadas, internas do EA, vazias, ambíguas. Nenhuma     │
 * │ dessas contagens precisa do corpo, e nenhuma delas nomeia o que foi recusado. As falhas sobem   │
 * │ daqui como FAMÍLIA mais uma frase padrão sobre coluna e status, que é o que ela loga.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class PlanilhaVivaService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fileId: string;
  /** A leitura inteira é de 1,9 MB e passa por uma rede local; 60s é folga, não expectativa. */
  private static readonly TIMEOUT_MS = 60_000;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("AI_SERVICE_URL") ?? "http://localhost:8000").replace(
      /\/+$/,
      "",
    );
    this.token = config.get<string>("INTERNAL_TOKEN") ?? "";
    this.fileId = (config.get<string>(VARIAVEL_DO_ARQUIVO_DA_PLANILHA) ?? "").trim();
  }

  /** A porta nasce FECHADA sem o identificador da planilha, e quem pergunta é a sincronização. */
  estaAtiva(): boolean {
    return this.fileId !== "";
  }

  /**
   * A LEITURA. Lança `FalhaDaPlanilhaViva`, nunca um erro cru do `fetch`: a família é o que o
   * chamador usa para decidir entre retentar e parar, e um erro sem família é falha sem motivo.
   */
  async ler(): Promise<PlanilhaVivaLida> {
    if (!this.estaAtiva()) {
      throw new FalhaDaPlanilhaViva(
        "DEFINITIVA",
        `Leitura da planilha INERTE: ${VARIAVEL_DO_ARQUIVO_DA_PLANILHA} não configurada.`,
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PlanilhaVivaService.TIMEOUT_MS);
    let resposta: Response;
    try {
      resposta = await fetch(`${this.baseUrl}/planilha-viva/ler`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": this.token },
        body: JSON.stringify({ fileId: this.fileId }),
        signal: controller.signal,
      });
    } catch (err) {
      /* §A.6: só o NOME do erro de rede. Nem corpo, nem URL completa, nem o identificador. */
      throw new FalhaDaPlanilhaViva(
        "INALCANCAVEL",
        `ai-service inalcançável para a leitura da planilha (${err instanceof Error ? err.name : "erro"}).`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resposta.ok) {
      /*
       * O STATUS DECIDE A FAMÍLIA, E O CORPO NÃO É LIDO. O `detail` do outro lado é texto padrão por
       * contrato, mas depender disso para montar mensagem abriria o caminho de um dia interpolar o
       * que o provedor devolveu, que é por onde conteúdo de célula viaja para o log.
       */
      const familia: FamiliaDeFalhaDaPlanilha = resposta.status === 503 ? "TRANSITORIA" : "DEFINITIVA";
      throw new FalhaDaPlanilhaViva(
        familia,
        `A leitura da planilha foi recusada (HTTP ${resposta.status}).`,
      );
    }

    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      throw new FalhaDaPlanilhaViva("DEFINITIVA", "A resposta da leitura da planilha não é JSON.");
    }
    return this.peneirar(corpo);
  }

  /**
   * O CORPO VIRANDO LINHAS, com o CABEÇALHO conferido ANTES de qualquer linha.
   *
   * CABEÇALHO ESPERADO AUSENTE FAZ A LEITURA FALHAR, e não devolve "o que achou": devolver 3.532
   * linhas com o campo nulo faria o de/para concluir que a planilha não cobre nada, e o sintoma
   * ficaria indistinguível de "a planilha está vazia". Ninguém procura uma coluna renomeada a partir
   * disso, e a sincronização passaria a limpar proposta boa.
   */
  private peneirar(corpo: unknown): PlanilhaVivaLida {
    if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
      throw new FalhaDaPlanilhaViva("DEFINITIVA", "A resposta da leitura da planilha não é objeto.");
    }
    const bruto = corpo as { colunas?: unknown; linhas?: unknown; totalLinhas?: unknown };
    const colunas = bruto.colunas;
    if (colunas === null || typeof colunas !== "object" || Array.isArray(colunas)) {
      throw new FalhaDaPlanilhaViva(
        "DEFINITIVA",
        "A resposta da leitura da planilha não declarou as colunas que usou.",
      );
    }
    /*
     * A CONFERÊNCIA É SOBRE OS CABEÇALHOS QUE O OUTRO LADO DIZ TER USADO, e é por isso que o
     * contrato os devolve: sem isso, uma coluna renomeada na planilha chegaria aqui como coluna
     * simplesmente ausente em todas as linhas, que é indistinguível de planilha vazia. A mensagem
     * nomeia a COLUNA (metadado de configuração), nunca uma célula.
     */
    try {
      conferirCabecalhoDaPlanilha(
        Object.values(colunas as Record<string, unknown>).map((v) => String(v ?? "")),
      );
    } catch (err) {
      /*
       * A FAMÍLIA É `DEFINITIVA`: retentar não renomeia coluna nenhuma, e insistir de 30 em 30
       * minutos só gastaria a cota da credencial. A MENSAGEM do domínio é reaproveitada porque ela
       * só carrega NOME DE COLUNA, que é metadado de configuração, e é ela que diz o que consertar.
       */
      throw new FalhaDaPlanilhaViva(
        "DEFINITIVA",
        err instanceof Error ? err.message : "A planilha não tem as colunas esperadas.",
      );
    }

    if (!Array.isArray(bruto.linhas)) {
      throw new FalhaDaPlanilhaViva("DEFINITIVA", "A resposta da leitura da planilha não traz linhas.");
    }
    const linhas: LinhaProjetadaDaPlanilha[] = [];
    for (const cru of bruto.linhas) {
      const lida = lerLinhaProjetadaDoAiService(cru);
      if (lida !== null) linhas.push(lida);
    }
    return {
      totalLinhas: typeof bruto.totalLinhas === "number" ? bruto.totalLinhas : linhas.length,
      linhas,
    };
  }
}
