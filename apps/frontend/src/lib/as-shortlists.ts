"use client";

/**
 * ─ A SHORTLIST DA VAGA, DO LADO DA TELA (Frente E, pontos 10 e 11) ─────────────────────────────
 *
 * ┌─ O QUE ESTE MÓDULO GUARDA, E O QUE ELE DELIBERADAMENTE NÃO GUARDA ──────────────────────────┐
 * │ ELE NÃO ESCREVE NENHUM NÚMERO DE RÉGUA. O mínimo sugerido e a pergunta "esta lista é curta?" │
 * │ vêm de `SHORTLIST_MINIMO_SUGERIDO` e `shortlistCurta`, do vocabulário compartilhado, que é o  │
 * │ MESMO que o servidor lê antes de recusar. Um `< 3` escrito aqui faria a tela avisar sobre um  │
 * │ limite que a rota não conhece no dia em que o diretor pedir quatro.                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O AVISO DA LISTA CURTA NÃO BLOQUEIA: a rota devolve 409 com o número medido POR ELA (sob a trava
 * da vaga, contando só quem ainda está vivo), a tela mostra a pergunta e REENVIA a mesma chamada com
 * `cienteShortlistCurta`. Por isso a tela não antecipa a recusa a partir do que ela marcou: a
 * contagem que vale é a do servidor, e adivinhá-la aqui só criaria uma segunda régua para divergir.
 *
 * §A.6: id de vaga, id de candidatura, um número, uma data e um motivo de processo. O item da
 * shortlist carrega o NOME de quem foi apresentado ao cliente, porque é disso que a lista é feita;
 * nada mais de dado pessoal entra ou sai daqui.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AsShortlist,
  AsShortlistCurtaPrecisaCiencia,
  VagaStatusItem,
} from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { vagaEmProcesso } from "@/lib/as-status-vaga";

/** O que a tela manda no envio. `enviadaEm` é a data do envio ao cliente, no formato do campo. */
export interface EnvioDeShortlist {
  candidaturaIds: string[];
  enviadaEm: string;
  /**
   * O ID DO MOTIVO NO CATÁLOGO. Ausente no primeiro envio, obrigatório do segundo em diante.
   *
   * ERA TEXTO LIVRE E VIROU CATÁLOGO (decisão do diretor): o que viaja é o ID, e não o nome, porque
   * é o id que sustenta a contagem e sobrevive ao diretor renomear a linha. É a diferença deliberada
   * para o motivo de DESCARTE, que continua viajando por nome porque é o nome que fica gravado na
   * candidatura; aqui a shortlist guarda a chave e lê o nome por junção.
   */
  motivoReenvioId?: string;
  cienteShortlistCurta?: boolean;
}

export function listarShortlists(vagaId: string, token: string | null): Promise<AsShortlist[]> {
  return apiFetch<AsShortlist[]>(`/as/vagas/${vagaId}/shortlists`, { token });
}

export function enviarShortlist(
  vagaId: string,
  envio: EnvioDeShortlist,
  token: string | null,
): Promise<AsShortlist> {
  const body: Record<string, unknown> = {
    candidaturaIds: envio.candidaturaIds,
    enviadaEm: envio.enviadaEm,
  };
  /* O MOTIVO SÓ VIAJA QUANDO EXISTE: a PRIMEIRA shortlist RECUSA o campo em vez de ignorá-lo
     ("não há envio anterior a justificar"), então mandar string vazia ali viraria um 400. */
  if (envio.motivoReenvioId) body.motivoReenvioId = envio.motivoReenvioId;
  if (envio.cienteShortlistCurta) body.cienteShortlistCurta = true;
  return apiFetch<AsShortlist>(`/as/vagas/${vagaId}/shortlists`, { method: "POST", token, body });
}

// ── AS RÉGUAS PURAS: testáveis sem rede ─────────────────────────────────────

/**
 * QUAL É O NÚMERO DO PRÓXIMO ENVIO. `max + 1`, exatamente como o servidor calcula sob a trava.
 *
 * ELE É LIDO PARA DUAS PERGUNTAS DA TELA (pedir ou não o motivo do reenvio, e escrever "Shortlist 1"
 * ou "Reenvio 2" no cabeçalho do formulário), NUNCA para decidir a gravação: quem numera de verdade
 * é a transação, e entre a leitura da tela e o clique outro consultor pode ter mandado a dele.
 */
export function proximoNumeroDeShortlist(enviadas: readonly AsShortlist[]): number {
  return enviadas.reduce((maior, s) => Math.max(maior, s.numero), 0) + 1;
}

/**
 * O MOTIVO DO REENVIO É EXIGIDO A PARTIR DO SEGUNDO ENVIO, e a pergunta tem nome próprio porque ela
 * é feita em dois lugares do formulário (mostrar o campo e travar o botão). Duas comparações soltas
 * divergiriam na primeira correção.
 */
export function exigeMotivoDeReenvio(numero: number): boolean {
  return numero > 1;
}

/**
 * COMO A LISTA SE CHAMA NA TELA: a primeira é a "Shortlist 1", as seguintes são "Reenvio N".
 *
 * É TAG, então title case (§A.24). §A.11: sem travessão.
 */
export function rotuloDaShortlist(numero: number): string {
  return numero === 1 ? "Shortlist 1" : `Reenvio ${numero}`;
}

/**
 * ─ O CAMPO "ENVIO DA SHORTLIST" DA TRILHA AINDA É DIGITÁVEL? ──────────────────────────────────
 *
 * ┌─ ELE DEIXOU DE SER DIGITAÇÃO E VIROU CONSEQUÊNCIA ──────────────────────────────────────────┐
 * │ `vagas.envio_shortlist` era um campo de data preenchido à mão na abertura, que dizia "alguma │
 * │ coisa foi enviada em tal dia" e mais nada: não sabia quem foi, nem quantos, nem se houve     │
 * │ reenvio. Com a shortlist de verdade, quem o escreve é o ENVIO, com a data do envio mais       │
 * │ recente, e ele continua respondendo a mesma pergunta sem ninguém digitar.                     │
 * │                                                                                              │
 * │ O CAMPO NÃO FOI DERRUBADO porque as vagas HISTÓRICAS nunca terão shortlist: aquela data é a  │
 * │ única resposta que essas linhas têm, e a trilha continua sendo por onde ela entra enquanto a │
 * │ vaga não foi publicada.                                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA É O ESPELHO EXATO DA DIVISÃO DO SERVIDOR, e é ela que prova que os dois escritores nunca
 * disputam o campo: a trilha só alcança vaga de papel RASCUNHO ou REVISAO, e o envio de shortlist
 * só é aceito em vaga de papel ABERTURA ou ENTREGA (`vagaEmProcesso`). Vaga que ainda NÃO EXISTE
 * (abertura nova, clone) não tem status, e ali o campo é editável: ela nasce em rascunho.
 */
export function envioDeShortlistEditavel(
  statusDaVaga: string | null | undefined,
  catalogo?: readonly VagaStatusItem[],
): boolean {
  if (!statusDaVaga) return true;
  return !vagaEmProcesso(statusDaVaga, catalogo);
}

/**
 * A RECUSA DA PRIMEIRA TENTATIVA DE MANDAR UMA LISTA CURTA, EM QUALQUER ENVIO.
 *
 * "PRIMEIRA TENTATIVA" É A DO CLIQUE, E NÃO A DA SHORTLIST 1: a pergunta vale para TODO envio,
 * inclusive reenvio (decisão do diretor). Depois de transferência e descarte, reenvio curto é o
 * caso normal, e era justamente ele que a régua antiga deixava passar calado.
 *
 * MESMO DESENHO DE `reentradaPrecisaCiencia` E `bancoPrecisaCiencia` (em `as-candidatos`): 409 com
 * `needsConfirmation`, os campos conferidos um a um, e `null` para qualquer outra coisa. Sem a
 * conferência, um 409 de outra natureza (a vaga saiu do processo entre a abertura e o clique) seria
 * lido como "confirme para enviar assim mesmo", e o reenvio com a ciência levaria a um segundo erro.
 */
export function shortlistCurtaPrecisaCiencia(err: unknown): AsShortlistCurtaPrecisaCiencia | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const corpo = err.data as Partial<AsShortlistCurtaPrecisaCiencia> | undefined;
  if (corpo?.needsConfirmation !== true) return null;
  if (typeof corpo.quantidade !== "number" || typeof corpo.minimoSugerido !== "number") return null;
  if (typeof corpo.mensagem !== "string") return null;
  return corpo as AsShortlistCurtaPrecisaCiencia;
}

// ── O GANCHO DA LEITURA ─────────────────────────────────────────────────────

export interface EstadoDasShortlists {
  shortlists: AsShortlist[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

/**
 * AS SHORTLISTS DE UMA VAGA, buscadas SÓ QUANDO ALGUÉM PRECISA DELAS (`ativo`).
 *
 * SEM MEMÓRIA DE MÓDULO, ao contrário do catálogo de etapas: isto não é catálogo, é o histórico de
 * UMA vaga, e ele muda no instante em que alguém manda a lista. Guardar em módulo faria o envio
 * recém-feito só aparecer depois de recarregar a página.
 */
export function useShortlists(
  vagaId: string,
  token: string | null,
  ativo = true,
): EstadoDasShortlists {
  const [shortlists, setShortlists] = useState<AsShortlist[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    setCarregando(true);
    setErro(null);
    try {
      setShortlists(await listarShortlists(vagaId, token));
    } catch (e) {
      setErro(
        e instanceof ApiError ? e.message : "Não foi possível carregar as shortlists desta vaga.",
      );
    } finally {
      setCarregando(false);
    }
  }, [vagaId, token, ativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { shortlists, carregando, erro, recarregar: carregar };
}
