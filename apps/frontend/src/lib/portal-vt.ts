import { CODIGO_TIPO_FORMULARIO_VT } from "@ea/shared-types";
import { ApiError } from "./api";

/**
 * A PONTE PARA O FORMULÁRIO DE VT, na tela do candidato. Três funções puras e nenhum estado.
 *
 * ┌─ O QUE A PONTE É ───────────────────────────────────────────────────────────────────────────┐
 * │ O formulário de vale-transporte NÃO foi trazido para dentro do Portal (decisão do diretor:  │
 * │ um parecer mediu que trazê-lo é caro). Na casa do `FORMULARIO_VT` o upload dá lugar a um    │
 * │ BOTÃO: o candidato sai para o app do VT que já está em produção, preenche lá, e a varredura │
 * │ da coleta dá baixa na casa sozinha, com autor SISTEMA, em alguns minutos. A tela não espera │
 * │ a baixa e não promete que ela é imediata.                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ╔═ §A.6: O LINK DO VT É CREDENCIAL, E DE UM TIPO QUE O RESTO DO PORTAL EVITA ═════════════════╗
 * ║ O token do VT viaja em QUERY STRING (`?t=`) e carrega CPF, nome e data de nascimento. O     ║
 * ║ link do próprio Portal usa FRAGMENTO (`#t=`) justamente porque o fragmento não é enviado ao ║
 * ║ servidor, logo não cai em log de proxy, de barreira nem no `Referer`. A query string cai    ║
 * ║ nos três, no servidor do app externo.                                                       ║
 * ║                                                                                              ║
 * ║ POR ISSO, NESTA CAMADA, O LINK NÃO EXISTE EM LUGAR NENHUM ALÉM DA PILHA DE CHAMADA:         ║
 * ║  · não vai para estado do React, `localStorage`, `sessionStorage`, `data-*` nem cookie;     ║
 * ║  · não é escrito em `console`, nem em erro, nem em telemetria (não há telemetria aqui);     ║
 * ║  · não é exibido na tela e não há "copiar link": o botão abre, e só;                        ║
 * ║  · o `<a>` que o abre vive alguns microssegundos e é removido no mesmo turno síncrono.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * §A.11: nenhuma mensagem daqui tem travessão, porque quem as lê é o candidato.
 */

/** A casa do VT é reconhecida pelo CÓDIGO do catálogo, publicado no contrato, nunca por uma
 * string escrita à mão aqui: o dia em que o código for renomeado, a tela acompanha sozinha. */
export function ehCasaDoVt(codigoTipoDocumento: string): boolean {
  return codigoTipoDocumento === CODIGO_TIPO_FORMULARIO_VT;
}

/**
 * Rede fora, servidor fora do ar, resposta sem link. O que o candidato pode fazer é tentar de
 * novo, então é isso que a frase diz.
 */
export const MSG_VT_FALHA_GENERICA =
  "Não foi possível abrir o formulário de vale-transporte agora. Tente de novo em alguns minutos.";

/**
 * A admissão não tem formulário de VT para abrir. É o 404 do emissor, que a rota já devolve sem
 * detalhe nenhum de propósito, e aqui vira a única saída honesta: falar com o RH.
 */
export const MSG_VT_INDISPONIVEL =
  "O formulário de vale-transporte não está disponível para a sua admissão. Fale com o RH.";

/**
 * O QUE O CANDIDATO LÊ QUANDO O BOTÃO NÃO ABRE, e por que a lista de códigos é FECHADA.
 *
 * O 503 e o 422 são os dois casos em que o SERVIDOR já escreveu uma frase para o candidato
 * (`portal-vt.controller.ts` reescreve as recusas internas do emissor exatamente para isso), e
 * essas saem como vieram, no mesmo princípio do resto do Portal: a tela não remonta frase do
 * servidor. O 503 não é hipótese, é o estado da HOMOLOGAÇÃO hoje, onde a chave do VT está vazia.
 *
 * Qualquer outro código cai na frase genérica, e isso é deliberado: a mensagem de um 500 é
 * diagnóstico interno ("Internal server error"), não diz ao candidato o que fazer em seguida e
 * pode descrever a nossa infraestrutura para quem está do lado de fora.
 *
 * 401 e 403 NÃO chegam aqui: a sessão de 30 minutos vencendo é caminho esperado, e quem trata é a
 * página, reabrindo a identificação com o link que ainda tem em memória.
 */
export function mensagemDaFalhaDoVt(erro: unknown): string {
  if (!(erro instanceof ApiError)) return MSG_VT_FALHA_GENERICA;
  if (erro.status === 404) return MSG_VT_INDISPONIVEL;
  if (erro.status === 503 || erro.status === 422) {
    const texto = typeof erro.message === "string" ? erro.message.trim() : "";
    return texto !== "" ? texto : MSG_VT_FALHA_GENERICA;
  }
  return MSG_VT_FALHA_GENERICA;
}

/**
 * ABRE O LINK EM ABA NOVA, e os dois atributos do `rel` são exigência, não hábito.
 *
 * `noopener` É O QUE IMPORTA DE VERDADE, e o risco dele é concreto: sem ele a página aberta
 * recebe `window.opener` e consegue RENAVEGAR a aba do Portal, que é onde o candidato acabou de
 * digitar CPF e data de nascimento. Uma página trocada por um formulário parecido pede os dois de
 * novo, e a pessoa não tem como perceber que a aba de trás mudou enquanto ela olhava a da frente.
 *
 * `noreferrer` vai junto, mas pelo motivo certo: ele NÃO protege o token. Por especificação o
 * navegador nunca inclui o FRAGMENTO no `Referer`, e esta página ainda apaga o `#t=` da barra no
 * primeiro render, então o que vazaria sem ele seria apenas `https://<host>/portal`. Ele fecha
 * essa fresta menor em vez de depender de duas garantias de terceiros.
 *
 * POR QUE UM `<a>` E NÃO `window.open`: com `noopener` o `window.open` devolve `null` por
 * especificação, então ele não distingue "abriu" de "o navegador bloqueou", e a tela não teria o
 * que dizer. O `<a>` também não avisa quando é bloqueado, mas mantém o `rel` literal que a régua
 * pede, e a tela cobre o bloqueio com o recado de "não abriu? toque de novo".
 *
 * O elemento sai do DOM no mesmo turno síncrono do clique, então o link não sobrevive a nada:
 * nem a uma inspeção depois do gesto, nem a uma captura de tela.
 */
export function abrirEmAbaNova(link: string, doc?: Document): void {
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  if (!d || !link) return;
  const a = d.createElement("a");
  a.href = link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  d.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.removeAttribute("href");
    a.remove();
  }
}

/**
 * O TEXTO DO ESCAPE, E POR QUE A CASA DO VT PRECISA DE UM PRÓPRIO.
 *
 * Em toda casa da trilha o link discreto de saída fala de um DOCUMENTO que o candidato pode não
 * ter em mãos agora, e é essa a verdade ali: falta o arquivo. Na casa do VT não falta arquivo
 * nenhum, porque não há arquivo: o vale-transporte é PREENCHIMENTO, feito por ele num formulário.
 * Dizer "não tenho este documento" naquela casa descreve um gesto que não existe, e ainda sugere
 * que ele deveria estar com alguma coisa na mão.
 *
 * É um RAMO, não uma troca global: as demais casas continuam com a frase de sempre, palavra por
 * palavra. §A.11 (sem travessão) e §A.24 (texto de AÇÃO em escrita normal, não é título nem tag).
 */
export const ESCAPE_PADRAO = "Não tenho este documento agora, pular";
export const ESCAPE_VT = "Preencher depois";

export function rotuloDoEscape(codigoTipoDocumento: string): string {
  return ehCasaDoVt(codigoTipoDocumento) ? ESCAPE_VT : ESCAPE_PADRAO;
}
