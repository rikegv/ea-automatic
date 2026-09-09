/**
 * ─ AS AÇÕES EM MASSA DA VAGA: o cliente HTTP e as réguas do RESULTADO (grupo 1 da A&S) ─────────
 *
 * ┌─ O LOTE É PARCIAL, E É POR ISSO QUE ESTE ARQUIVO EXISTE ────────────────────────────────────┐
 * │ As quatro rotas em massa devolvem `AsResultadoEmMassa`: o que foi APLICADO e, linha a linha, │
 * │ o que FALHOU e por quê. Uma tela que só mostrasse "pronto" esconderia justamente a metade    │
 * │ que o consultor precisa ver, que é quem ficou de fora. As funções de leitura do resultado    │
 * │ moram aqui, e não dentro do componente, porque são exatamente o tipo de régua que erra em    │
 * │ silêncio: um plural errado passa despercebido, e um "0 aplicadas" desenhado como sucesso     │
 * │ mente. Aqui elas têm teste.                                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ARQUIVO SEPARADO DE `as-candidatos.ts`, e isso é deliberado: aquele é o cliente da Central de
 * Candidatos, validado e consumido por três telas. As rotas em massa nasceram nesta frente, com
 * corpo próprio e um contrato de retorno que nenhuma ação individual usa. Acrescentá-las lá dentro
 * misturaria duas superfícies com ciclos de vida diferentes (§A.26).
 *
 * §A.6, E ELA MOLDA O QUE ESTE ARQUIVO PODE MOSTRAR: a falha traz `alvoId` (id técnico) e um motivo
 * de PROCESSO, nunca CPF e nunca o texto que alguém escreveu sobre outra pessoa. O NOME que a tela
 * exibe ao lado da falha vem da lista que ela JÁ tem em memória, e não de uma busca nova: pedir a
 * ficha de cada falha para escrever um nome traria o CPF de todo mundo de volta para o navegador.
 *
 * §A.11 (sem travessão em texto de tela), §A.24 (as frases daqui são apoio, escrita normal).
 */

import { apiFetch } from "@/lib/api";
import { registrarSaida } from "@/lib/as-candidatos";
import type { PosicaoLado } from "@/lib/as-vaga-acoes";
import type { AsResultadoEmMassa, CandidaturaEtapa } from "@ea/shared-types";

/**
 * OS TRÊS DESFECHOS DA SAÍDA, DERIVADOS DA AÇÃO INDIVIDUAL em vez de redigitados.
 *
 * A lista já existe em `registrarSaida` (que por sua vez espelha `SITUACOES_DE_SAIDA` do domínio do
 * backend). Escrevê-la de novo aqui criaria a terceira cópia da mesma régua, e a cópia nova
 * concordaria com as outras por coincidência até o dia em que um desfecho fosse acrescentado a uma
 * só. Derivar do tipo da função garante que a divergência vire erro de compilação.
 */
export type SaidaEmLote = Parameters<typeof registrarSaida>[1];

// ── O CLIENTE HTTP DAS QUATRO ROTAS ─────────────────────────────────────────

/**
 * ADICIONAR CANDIDATOS AO FUNIL DA VAGA. A VAGA VEM NA ROTA: o lote é sempre de uma vaga só.
 *
 * ELA NÃO CONSOME POSIÇÃO, e o rótulo do botão que a dispara diz isso com todas as letras: quem
 * entra nasce `ATIVO`, e `ATIVO` não ocupa nada. Quem entrega a posição é a finalização, que é outro
 * botão de propósito (decisão do diretor).
 *
 * `cienteReentrada` SÓ ENTRA QUANDO É VERDADEIRO, a mesma disciplina da ação individual: a primeira
 * tentativa vai sempre sem o campo, que é o que faz a recusa da reentrada aparecer em vez de ser
 * atravessada em silêncio por trinta pessoas de uma vez.
 */
export function adicionarCandidatosEmLote(
  vagaId: string,
  candidatoIds: string[],
  token: string | null,
  opts: { cienteReentrada?: boolean } = {},
): Promise<AsResultadoEmMassa> {
  const body: Record<string, unknown> = { candidatoIds };
  if (opts.cienteReentrada) body.cienteReentrada = true;
  return apiFetch<AsResultadoEmMassa>(`/as/candidatos/vaga/${vagaId}/candidaturas/lote`, {
    method: "POST",
    token,
    body,
  });
}

/**
 * FINALIZAR POSIÇÃO EM MASSA: N posições da vaga são ENTREGUES, e a meta é CONSUMIDA.
 *
 * A VAGA VAI SEMPRE NO CORPO, e mandá-la é o que liga duas proteções do backend: ele recusa o lote
 * INTEIRO quando a vaga já está encerrada (um problema só, da vaga, que não deve virar trinta falhas
 * idênticas) e recusa a LINHA cuja candidatura não é daquela vaga (seleção misturada, tela
 * desatualizada). O campo é opcional no contrato por causa do teste; a tela SEMPRE opera dentro de
 * uma vaga, então ela sempre tem o id e sempre o manda.
 */
export function finalizarPosicaoEmLote(
  candidaturaIds: string[],
  token: string | null,
  opts: { vagaId: string; lado?: PosicaoLado; cienteBancoComOficiaisAbertas?: boolean },
): Promise<AsResultadoEmMassa> {
  const body: Record<string, unknown> = { candidaturaIds, vagaId: opts.vagaId };
  if (opts.lado) body.lado = opts.lado;
  if (opts.cienteBancoComOficiaisAbertas) body.cienteBancoComOficiaisAbertas = true;
  return apiFetch<AsResultadoEmMassa>("/as/candidatos/candidaturas/lote/finalizar-posicao", {
    method: "POST",
    token,
    body,
  });
}

/**
 * DESVINCULAR EM MASSA, e ENVIAR PARA ADMISSÃO em massa: as duas são a mesma rota de saída.
 *
 * O MOTIVO É UM SÓ PARA A SELEÇÃO INTEIRA, gravado em cada linha, porque é o desfecho comum que
 * originou o lote. Ele vai APARADO, com a mesma régua da tela individual: o backend também apara
 * antes de validar, e mandar `"   "` daqui só moveria a recusa para o 400.
 */
export function registrarSaidaEmLote(
  candidaturaIds: string[],
  situacao: SaidaEmLote,
  motivo: string,
  token: string | null,
): Promise<AsResultadoEmMassa> {
  return apiFetch<AsResultadoEmMassa>("/as/candidatos/candidaturas/lote/saida", {
    method: "POST",
    token,
    body: { candidaturaIds, situacao, motivo: motivo.trim() },
  });
}

/** MOVER NO FUNIL EM MASSA. PATCH, como a rota individual: é a mesma propriedade que muda. */
export function moverEtapaEmLote(
  candidaturaIds: string[],
  etapa: CandidaturaEtapa,
  token: string | null,
): Promise<AsResultadoEmMassa> {
  return apiFetch<AsResultadoEmMassa>("/as/candidatos/candidaturas/lote/etapa", {
    method: "PATCH",
    token,
    body: { candidaturaIds, etapa },
  });
}

// ── A LEITURA DO RESULTADO ──────────────────────────────────────────────────

/** O tom com que o resultado do lote se apresenta. É ele que decide o ícone e a cor da faixa. */
export type TomDoResultado = "ok" | "parcial" | "nada";

/**
 * O LOTE DEU CERTO, DEU CERTO PELA METADE, OU NÃO DEU?
 *
 * TRÊS ESTADOS E NÃO DOIS, e o terceiro é o que a tela mais precisa distinguir: um lote em que NADA
 * foi aplicado não é "parcialmente concluído", é uma recusa inteira, e desenhá-lo com o check verde
 * de sucesso é a forma mais direta de o consultor achar que entregou trinta posições que não
 * entregou.
 */
export function tomDoResultado(r: AsResultadoEmMassa): TomDoResultado {
  if (r.aplicadas === 0) return "nada";
  return r.falhas.length === 0 ? "ok" : "parcial";
}

/**
 * A FRASE DO RESULTADO, com as DUAS metades sempre ditas: quantas foram e quantas não foram.
 *
 * O PLURAL É CALCULADO, e não resolvido com "(s)": a tela é lida por quem opera o dia inteiro, e
 * "1 linha(s)" é o tipo de descuido que faz uma interface parecer um relatório de banco de dados.
 *
 * §A.11: sem travessão. §A.24: isto é frase de apoio, escrita normal.
 */
export function resumoDoLote(r: AsResultadoEmMassa): string {
  const aplicadas =
    r.aplicadas === 1 ? "1 linha aplicada" : `${r.aplicadas} linhas aplicadas`;
  if (r.falhas.length === 0) return `${aplicadas}. Nenhuma falhou.`;
  const falhas =
    r.falhas.length === 1 ? "1 linha não foi aplicada" : `${r.falhas.length} linhas não foram aplicadas`;
  return `${aplicadas}. ${falhas}, e o motivo de cada uma está abaixo.`;
}

/**
 * O NOME DE QUEM FALHOU, TIRADO DA MEMÓRIA DA TELA (§A.6).
 *
 * A resposta traz `alvoId` e nada mais, de propósito: o backend não repete nome nem CPF numa lista
 * de trinta linhas que vai para a tela, para a área de transferência e para o log de qualquer
 * cliente HTTP no caminho. Quem tem o nome é a tela, que acabou de listar aquelas pessoas, e é dela
 * que ele sai.
 *
 * DESCONHECIDO VIRA "não informado", nunca o id cru: o id é técnico e não diz nada a quem lê, e
 * imprimir um UUID no meio de uma frase em português é como um dado interno vaza para a tela sem
 * nada falhar. §A.11 proíbe o travessão como marcador de vazio, então o marcador é a palavra.
 */
export function nomeDoAlvo(alvoId: string, nomes: Map<string, string>): string {
  return nomes.get(alvoId) ?? "não informado";
}
