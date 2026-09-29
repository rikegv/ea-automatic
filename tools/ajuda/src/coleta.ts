/**
 * ─ DE ONDE O GATE LÊ, DO LADO DO NAVEGADOR REAL ────────────────────────────────────────────────
 *
 * ┌─ O TEXTO AUDITADO É PRODUZIDO PELA MESMA FUNÇÃO TESTADA, E NÃO POR UMA CÓPIA DELA ───────────┐
 * │ `textoAuditavel` vive no frontend porque é lá que existe runner de teste (o `tester` escreveu   │
 * │ 36 casos sobre ela). Reescrevê-la aqui dentro, em `page.evaluate`, criaria uma SEGUNDA          │
 * │ implementação: a testada e a que roda de verdade. Elas divergiriam no primeiro ajuste, e a que  │
 * │ vaza é sempre a que ninguém testa.                                                             │
 * │                                                                                                │
 * │ Dentro da página faz-se só o que SÓ o navegador sabe fazer: ler a PROPRIEDADE `.value` dos      │
 * │ campos (ela não existe no HTML servido), jogá-la no atributo e descartar o campo de senha. O    │
 * │ HTML volta para cá, é montado num DOM de verdade (happy-dom, o mesmo do teste) e passa pela     │
 * │ função TESTADA.                                                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O GATE RODA DENTRO DO RECORTE, e a ordem importa ────────────────────────────────────────────┐
 * │ Sete telas do sistema não podem virar imagem inteira (Diagnóstico, Controle Gerencial, Alto    │
 * │ Volume, Usuários, Sala De Espera, a ficha da admissão e o wizard de Nova Admissão): elas        │
 * │ mostram gente e precisam ser ensinadas. O `recorte` do print resolve isso, e o gate audita      │
 * │ EXATAMENTE a caixa que vira imagem. Recortar sem auditar o recorte troca o vazamento grande     │
 * │ por um pequeno, e o pequeno é o que ninguém revisa.                                            │
 * │                                                                                                │
 * │ Recorte pedido e NÃO encontrado é falha dura: cair para a página inteira seria silenciosamente  │
 * │ mais permissivo do que o roteiro pediu, e mais permissivo em silêncio é como o dado escapa.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { pathToFileURL } from "node:url";
import {
  contarLinhasDeDados,
  type ContagemDaArea,
} from "../../../apps/frontend/src/ajuda/captura";
import { textoAuditavel } from "../../../apps/frontend/src/ajuda/pii";
import type { Alvo } from "../../../apps/frontend/src/ajuda/tipos";
import { FalhaDeMotor } from "./ambiente";
import { descreverAlvo, localizar } from "./localizador";
import type { Pagina } from "./playwright-minimo";

const HAPPY_DOM = "/home/henrique/apps/ea-automatic/apps/frontend/node_modules/happy-dom/lib/index.js";

type JanelaDeLeitura = { document: { createElement(tag: string): Element & { innerHTML: string } } };

/**
 * Copia o valor de campo (propriedade) para atributo e remove a senha. Só isso roda na página, e
 * roda SEMPRE a partir de um elemento: a página inteira é o `body`, o recorte é o elemento dele.
 * Uma implementação só, para o caminho recortado e o caminho inteiro não divergirem.
 */
const TRANSFORMAR = (raiz: Element): string => {
  const copia = raiz.cloneNode(true) as HTMLElement;
  const originais = Array.from(raiz.querySelectorAll("input, textarea, select"));
  const copias = Array.from(copia.querySelectorAll("input, textarea, select"));
  for (let i = 0; i < originais.length; i += 1) {
    const original = originais[i] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const alvo = copias[i];
    if (!alvo) continue;
    // CREDENCIAL NUNCA ENTRA NO TEXTO AUDITADO (§A.6): auditá-la a imprimiria na mensagem de erro do
    // motor e no log, que é onde ela sobreviveria.
    if ((original.getAttribute("type") ?? "").toLowerCase() === "password") {
      alvo.remove();
      continue;
    }
    const valor =
      original instanceof HTMLSelectElement
        ? (original.selectedOptions[0]?.textContent ?? "")
        : (original.value ?? "");
    if (valor) alvo.setAttribute("value", String(valor));
  }
  // O `innerHTML`, e não o `outerHTML`: reinjetar uma string que começa com `<body>` faz o parser
  // DESCARTAR a tag, e o conteúdo embaixo dela some em silêncio, que é o pior defeito possível num
  // gate (ele aprova porque não viu).
  return copia.innerHTML;
};

async function raizDaArea(page: Pagina, recorte?: Alvo) {
  const loc = recorte ? localizar(page, recorte) : page.locator("body");
  if (recorte && (await loc.count().catch(() => 0)) === 0) {
    throw new FalhaDeMotor(
      `RECORTE NÃO ENCONTRADO (${descreverAlvo(recorte)}). O gate audita a caixa que vira imagem, ` +
        `então sem a caixa não há captura. Cair para a tela inteira seria mais permissivo do que o ` +
        `roteiro pediu, e numa tela recortada a tela inteira é justamente o que não pode sair.`,
    );
  }
  return loc;
}

/** Monta o DOM de leitura (happy-dom, o mesmo do teste) a partir do HTML da área. */
async function domDaArea(page: Pagina, recorte?: Alvo): Promise<Element> {
  const loc = await raizDaArea(page, recorte);
  const html = await loc.evaluate<string, null>(TRANSFORMAR, null);
  const modulo = (await import(pathToFileURL(HAPPY_DOM).href)) as { Window: new () => JanelaDeLeitura };
  const janela = new modulo.Window();
  const raiz = janela.document.createElement("div");
  raiz.innerHTML = html;
  return raiz;
}

/**
 * ─ QUANTAS LINHAS TEM A ÁREA QUE VAI VIRAR IMAGEM ──────────────────────────────────────────────
 *
 * MESMA CAIXA DO RECORTE, e é por isso que esta função fica ao lado de `lerTextoAuditavel` e recebe o
 * mesmo `Alvo`: medir a lista numa região e fotografar outra é o mesmo defeito que auditar uma região
 * e fotografar outra (ver `motor.ts`). Recorte pedido e não encontrado é falha dura, aqui também.
 *
 * A CONTAGEM EM SI **NÃO MORA AQUI**: ela é `contarLinhasDeDados`, no frontend, onde existe runner de
 * teste. É a mesma razão de `textoAuditavel` viver lá, e é a peça com todas as armadilhas de DOM
 * (`thead`, `colSpan`, `.list-head`, `.row`). Esta casca só monta o DOM e chama. E quem DECIDE é
 * `conferirListaPovoada`, também lá: casca não decide nada.
 */
export async function contarLinhasDaArea(
  page: Pagina,
  recorte?: Alvo,
): Promise<ContagemDaArea> {
  return contarLinhasDeDados(await domDaArea(page, recorte));
}

export async function lerTextoAuditavel(page: Pagina, recorte?: Alvo): Promise<string> {
  return textoAuditavel(await domDaArea(page, recorte));
}
