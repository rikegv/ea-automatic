/**
 * COPIAR PARA A ÁREA DE TRANSFERÊNCIA, COM CAMINHO DE RESERVA.
 *
 * ┌─ O DEFEITO QUE ISTO CONSERTA, E ELE FOI MEDIDO ─────────────────────────────────────────────┐
 * │ `navigator.clipboard` só EXISTE em CONTEXTO SEGURO (https, ou localhost). A homologação é    │
 * │ `http://10.18.117.235:3120`, que não é nenhum dos dois: ali o objeto é `undefined`, a        │
 * │ chamada estoura, e o botão "Copiar" do modal do link não fazia absolutamente nada. Pior:     │
 * │ o `catch` engolia o erro em silêncio, então a tela não dizia que falhou. Quem testasse em    │
 * │ `localhost` veria funcionando e concluiria que está tudo certo.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RESERVA é a de sempre: um `<textarea>` fora da vista, selecionado, com `document.execCommand`.
 * É API obsoleta e é justamente por isso que ela serve: é a única que funciona em http simples, e
 * nenhum navegador a removeu. Ela vem DEPOIS, nunca antes, porque o caminho moderno é o correto
 * onde existe (não depende de foco, não mexe na seleção do usuário).
 *
 * O RESULTADO É EXPLÍCITO, e não um booleano solto: quem chama precisa distinguir "copiei" de
 * "não deu, selecione e copie na mão", que é a única mensagem honesta quando os dois caminhos
 * falham (§A.11, sem travessão).
 *
 * §A.6: o texto copiado pode ser CREDENCIAL (a URL do portal do candidato). Ele não é logado, não
 * é guardado e não entra em mensagem de erro nenhuma.
 */

export type ResultadoDaCopia = "copiado" | "falhou";

/** O caminho moderno existe? Fora de contexto seguro, `navigator.clipboard` é `undefined`. */
function temApiModerna(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
}

/**
 * A RESERVA. Um textarea fora da vista, selecionado, `execCommand("copy")`.
 *
 * `position: fixed` com `opacity: 0` e não `display: none`: elemento escondido de verdade não é
 * selecionável, e sem seleção o `execCommand` não copia nada. O `readOnly` evita o teclado virtual
 * no celular, e o `left` negativo tira o elemento da vista sem rolar a página.
 */
function copiarPelaReserva(texto: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, texto.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    // O elemento sai SEMPRE, inclusive quando a cópia estoura: textarea órfão com credencial
    // dentro é exatamente o que a §A.6 não admite.
    area.remove();
  }
}

/** Copia `texto`, tentando a API moderna e caindo na reserva. Nunca lança. */
export async function copiarTexto(texto: string): Promise<ResultadoDaCopia> {
  if (temApiModerna()) {
    try {
      await navigator.clipboard.writeText(texto);
      return "copiado";
    } catch {
      // Contexto seguro e permissão negada: ainda vale tentar a reserva, que não pede permissão.
    }
  }
  return copiarPelaReserva(texto) ? "copiado" : "falhou";
}

/** A frase honesta de quando nem a reserva deu. Sem travessão (§A.11). */
export const AVISO_COPIA_FALHOU =
  "Não foi possível copiar automaticamente. Selecione o texto do campo e copie com Ctrl+C.";
