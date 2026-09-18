import { Injectable } from "@nestjs/common";
import { PandapeApiService } from "../../pandape/pandape-api.service";
import type { PastaProjetada } from "../../domain/pandape-varredura-projecao";
import { CAMINHO_INSCRICOES, CAMINHO_PASTAS, CAMINHO_VAGAS } from "./ingestao-ciclo";
import type { PortaHttp } from "./ingestao-portas";

/**
 * ─ O LADO DA REDE DA VARREDURA: GET APENAS, E A TRAVA É DE CÓDIGO ──────────────────────────────
 *
 * ┌─ A REGRA MAIS CARA DESTA FRENTE, E POR QUE ELA MORA AQUI ────────────────────────────────────┐
 * │ A API do Pandapé tem `POST /v1/Match/UpdateFolder` e `PATCH /v2/matches/{id}/update`, que     │
 * │ MOVEM CANDIDATO NO FUNIL de um ATS de TERCEIRO. Escrever lá altera o trabalho de quem opera a │
 * │ vaga, não é desfazível por nós, e NADA DO NOSSO LADO FALHA quando acontece.                    │
 * │                                                                                                │
 * │ Esta frente é GET APENAS. As duas guardas abaixo são independentes de propósito: uma recusa o  │
 * │ VERBO e a outra recusa o CAMINHO, porque o verbo certo num caminho que escreve continua sendo  │
 * │ escrita. O que está proibido é o EFEITO no funil de terceiro, não a letra do método.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CACHE DAS PASTAS, E O QUE ELE CUSTA SE NÃO EXISTIR ───────────────────────────────────────┐
 * │ MEDIDO: o `idVacancyFolder` não é compartilhado entre vagas, então a tradução id para nome é  │
 * │ UMA chamada POR VAGA. Sem cache, o ciclo pagaria uma chamada por PÁGINA: 1.086 requisições a   │
 * │ mais por volta, que estouram o orçamento de 1.500 contado no plano.                            │
 * │                                                                                                │
 * │ A INVALIDAÇÃO TEM DUAS PORTAS. A explícita (`recarregar`) é a que importa: quem abriu a vaga   │
 * │ criou uma pasta nova no meio da volta, e o ciclo percebe porque um `idVacancyFolder` do item   │
 * │ não está no mapa. A por tempo é a rede de segurança para o resto.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class IngestaoHttp implements PortaHttp {
  /** 12 horas: longo porque a pasta nova tem a invalidação EXPLÍCITA, que é a porta de verdade. */
  private static readonly VALIDADE_DO_CACHE_MS = 12 * 60 * 60 * 1000;

  private readonly pastas = new Map<number, { em: number; lista: PastaProjetada[] }>();

  constructor(private readonly api: PandapeApiService) {}

  async requisitar(
    metodo: string,
    caminho: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (metodo.toUpperCase() !== "GET") {
      throw new Error(
        `A ingestão do Pandapé é GET apenas. Verbo recusado: ${metodo.toUpperCase()}.`,
      );
    }
    // A ALLOWLIST DE CAMINHO É A SEGUNDA TRAVA: caminho fora destes três não sai daqui, nem por GET.
    if (caminho === CAMINHO_VAGAS) return { data: await this.api.listarVagasAtivas() };
    if (caminho === CAMINHO_PASTAS) {
      const idVacancy = inteiro(params.idVacancy);
      if (idVacancy === null) return { data: [] };
      return { data: await this.pastasDaVaga(idVacancy, params.recarregar === true) };
    }
    if (caminho === CAMINHO_INSCRICOES) {
      const idVacancy = inteiro(params.IdVacancy);
      const page = inteiro(params.Page) ?? 1;
      const pageSize = inteiro(params.PageSize) ?? 200;
      if (idVacancy === null) return { data: [] };
      return { data: await this.api.listarInscricoesDaVaga(idVacancy, page, pageSize) };
    }
    throw new Error(`A ingestão do Pandapé não chama este caminho: ${caminho}.`);
  }

  private async pastasDaVaga(idVacancy: number, recarregar: boolean): Promise<PastaProjetada[]> {
    const guardada = this.pastas.get(idVacancy);
    const valida =
      guardada !== undefined &&
      Date.now() - guardada.em < IngestaoHttp.VALIDADE_DO_CACHE_MS;
    if (!recarregar && valida && guardada) return guardada.lista;
    const lista = await this.api.listarPastasDaVaga(idVacancy);
    // LISTA VAZIA NÃO SUBSTITUI CACHE BOM: uma falha de rede devolve `[]` por aqui, e guardá-la
    // apagaria a tradução de etapa da vaga inteira por 12 horas. A inscrição fica sem tradução por
    // uma volta (fail-closed, nada é escrito), e a volta seguinte tenta de novo.
    if (lista.length === 0 && guardada) return guardada.lista;
    this.pastas.set(idVacancy, { em: Date.now(), lista });
    return lista;
  }
}

function inteiro(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
