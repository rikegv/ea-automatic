import type { MotivoDeRecusaDeEnvio, ResultadoDoEnvioDoLink } from "@ea/shared-types";

/**
 * A TAXONOMIA DA EMISSAO AUTOMATICA DO LINK, EM FUNCAO PURA (frente A.1, decisao do diretor).
 *
 * Quem classifica o desfecho de `enviarParaAdmissao(...,"AUTOMATICO")` e ESTE arquivo, e nao o
 * gancho nem o worker, porque os dois precisam concordar bit a bit: o gancho carimba e enfileira,
 * o worker (retry) re-chama e re-classifica, e uma regra escrita duas vezes diverge no primeiro
 * ajuste. Funcao pura = testavel sem banco, sem fila e sem e-mail (prova dos tres desfechos em
 * teste, independente do canal estar ligado).
 *
 * §A.6: o desfecho carrega SO o CODIGO do motivo (catalogo fechado). Nenhum e-mail, link, CPF, nome.
 */

/** O codigo que vai para a coluna `admissoes.portal_link_falha_motivo` e para a trilha. */
export type MotivoDaFalhaDoLink = MotivoDeRecusaDeEnvio | "EXCECAO_INESPERADA";

export type DesfechoDaEmissao =
  /** `enviado: true`. O link saiu: LIMPA o estado de falha (falha_em, motivo, tentativas). */
  | { readonly tipo: "SUCESSO" }
  /**
   * (a) RECUSA LEGITIMA, nao e falha: fluxo-2 (pandape direto, sem portal), link vivo ja em uso,
   * janela de reenvio, ou pre-admissao sem regua. NAO carimba e NAO retenta.
   */
  | { readonly tipo: "IGNORAR"; readonly motivo: MotivoDeRecusaDeEnvio | null }
  /**
   * CARIMBA o estado consultavel. `retry: true` = (b) falha transitoria (canal fora, excecao);
   * `retry: false` = (c) dado faltando (e-mail invalido/ausente), vira fila de "corrigir e reemitir".
   */
  | { readonly tipo: "CARIMBA"; readonly retry: boolean; readonly motivo: MotivoDaFalhaDoLink };

/**
 * Classifica o RESULTADO de uma emissao que NAO lancou excecao. Excecao inesperada e tratada pelo
 * chamador (gancho/worker) como `{ tipo: "CARIMBA", retry: true, motivo: "EXCECAO_INESPERADA" }`,
 * que e o que `desfechoDeExcecao()` abaixo devolve, para os dois caminhos nao redigitarem a regra.
 */
export function classificarEmissao(resultado: ResultadoDoEnvioDoLink): DesfechoDaEmissao {
  if (resultado.enviado) return { tipo: "SUCESSO" };

  const motivo = resultado.motivo;

  // (a) Recusas legitimas. `null` e o fluxo-2 (a trava do choke point devolve motivo nulo de
  // proposito, so loga o codigo). As demais sao abstencoes: ja existe link vivo, ou nao ha o que
  // coletar (pre-admissao sem regua). Nenhuma delas e "o candidato ficou sem o link por erro".
  if (
    motivo === null ||
    motivo === "LINK_VIVO_EM_USO" ||
    motivo === "ENVIADO_HA_POUCO" ||
    motivo === "SEM_ADMISSAO"
  ) {
    return { tipo: "IGNORAR", motivo };
  }

  // (c) Dado faltando: o e-mail nao da para enviar. Carimba para o ADM ver no Gerenciador, corrigir
  // o e-mail e reemitir. Retry nao resolveria (o dado nao muda sozinho).
  if (motivo === "SEM_EMAIL" || motivo === "EMAIL_INVALIDO") {
    return { tipo: "CARIMBA", retry: false, motivo };
  }

  // (b) Falha transitoria: canal de e-mail fora, ou o envio falhou e o link foi revogado. Carimba e
  // retenta (backoff exponencial); esgotadas as tentativas, o estado de falha fica consultavel.
  if (motivo === "CANAL_INDISPONIVEL" || motivo === "FALHA_NO_ENVIO") {
    return { tipo: "CARIMBA", retry: true, motivo };
  }

  // Motivo novo que alguem acrescente ao contrato e nao mapeie aqui: trata como transitorio
  // (carimba + retry) em vez de sumir em silencio. E o lado seguro de errar, e o teste exaustivo
  // (um caso por valor de `MOTIVOS_DE_RECUSA_DE_ENVIO`) pega o buraco antes de chegar na operacao.
  return { tipo: "CARIMBA", retry: true, motivo };
}

/** O desfecho de uma excecao inesperada que escapou de `enviarParaAdmissao`. Sempre (b). */
export function desfechoDeExcecao(): DesfechoDaEmissao {
  return { tipo: "CARIMBA", retry: true, motivo: "EXCECAO_INESPERADA" };
}
