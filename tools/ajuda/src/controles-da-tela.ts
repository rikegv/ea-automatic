/**
 * ─ A CASCA DO DETECTOR: ENUMERAR OS CONTROLES DESENHADOS NA TELA ────────────────────────────────
 *
 * ┌─ ESTE ARQUIVO NÃO DECIDE NADA, E É O MESMO DESENHO DO GATE DE PII ──────────────────────────┐
 * │ A comparação, a classificação e a conta vivem em `apps/frontend/src/ajuda/cobertura.ts`,      │
 * │ porque `tools/` não está no `pnpm-workspace.yaml` e não roda no `pnpm test`: um detector       │
 * │ escrito aqui dentro seria INAUDITÁVEL, e a §A.38 exige que quem confere não seja quem escreveu.│
 * │ Aqui fica só o que SÓ o navegador sabe fazer, que é olhar o DOM.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O NOME É APROXIMADO, E DIZER ISSO É PARTE DA MEDIÇÃO ───────────────────────────────────────┐
 * │ O nome acessível "de verdade" sai do algoritmo de accname do navegador, que é longo e cuja     │
 * │ superfície programática mudou entre versões do Playwright (e o Playwright aqui vive FORA do    │
 * │ repositório, carregado por import dinâmico: depender de uma API recente dele é depender da     │
 * │ máquina). Então a leitura é a aproximação que cobre o sistema real: `aria-label`, o texto do    │
 * │ elemento, o `title`, o `alt` da imagem dentro dele e o `placeholder` do campo de seleção.       │
 * │                                                                                                │
 * │ A CONSEQUÊNCIA ESTÁ ACEITA E É DO LADO SEGURO: a aproximação erra por EXCESSO (às vezes lê      │
 * │ mais texto do que o leitor de tela leria), e excesso vira lacuna a mais no relatório, nunca     │
 * │ lacuna a menos. Um detector que erra escondendo lacuna é pior que não ter detector.             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS PAPÉIS SÃO OS QUATRO DO DESENHO (§1.4): `button`, `link`, `tab`, `combobox`. Somam-se o `select`
 * nativo (a §A.35 o proíbe em tela nova, mas ele ainda existe em tela antiga, e o que ainda existe é
 * o que precisa de manual) e o `summary`, que é o cabeçalho clicável de um bloco recolhível.
 */
import { FalhaDeMotor } from "./ambiente";
import { garantirShimDeNome } from "./shim-name";
import type { Pagina } from "./playwright-minimo";

export type ControleLido = { rotulo: string; papel: string };

/**
 * ─ O LIMITE DE TAMANHO DO RÓTULO, e ele é de MEDIÇÃO, não de estética ──────────────────────────
 *
 * Um `<a>` que embrulha um cartão inteiro tem como "texto" o cartão inteiro. Isso não é nome de
 * controle, é conteúdo, e ele nunca poderia ser declarado por um artigo: como órfão, seria uma
 * lacuna impossível de fechar, que é o tipo de linha que faz alguém parar de ler o relatório.
 */
const MAXIMO_DE_CARACTERES = 60;

/**
 * Roda DENTRO da página. Sem função nomeada aqui: ver `shim-name.ts` para o motivo (o `tsx` envolve
 * função nomeada num helper que não existe no navegador). O shim é reaplicado a cada navegação.
 */
const LER: (raiz: Element, maximo: number) => ControleLido[] = (raiz, maximo) => {
  const SELETOR = [
    "button",
    "a[href]",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="combobox"]',
    "select",
    "summary",
  ].join(", ");

  const papelDe = (el: Element): string => {
    const explicito = el.getAttribute("role");
    if (explicito) return explicito;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "select") return "combobox";
    if (tag === "summary") return "button";
    return "button";
  };

  const vistos = new Set<string>();
  const saida: ControleLido[] = [];

  for (const el of Array.from(raiz.querySelectorAll(SELETOR))) {
    const html = el as HTMLElement;
    // INVISÍVEL NÃO É CONTROLE DA TELA. Modal fechado, aba não selecionada e menu recolhido vivem no
    // DOM: contá-los mediria uma tela que ninguém está vendo, e infla o denominador com o que o
    // artigo daquela tela não tem como ensinar ali.
    if (html.hidden) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const caixa = html.getBoundingClientRect();
    if (caixa.width < 1 || caixa.height < 1) continue;

    const rotulo = (
      el.getAttribute("aria-label") ??
      (html.innerText || el.textContent || "").replace(/\s+/g, " ") ??
      ""
    ).trim();
    const alternativo = (
      el.getAttribute("title") ??
      el.querySelector("img")?.getAttribute("alt") ??
      el.getAttribute("placeholder") ??
      ""
    ).trim();
    const escolhido = (rotulo || alternativo).replace(/\s+/g, " ").trim();
    // CONTROLE SEM NOME É ACHADO, e não é órfão de manual: é defeito de acessibilidade, e ele vai
    // para uma contagem PRÓPRIA na casca, porque não há rótulo para o artigo declarar.
    if (!escolhido) {
      saida.push({ rotulo: "", papel: papelDe(el) });
      continue;
    }
    if (escolhido.length > maximo) continue;
    const chave = `${papelDe(el)}::${escolhido.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ rotulo: escolhido, papel: papelDe(el) });
  }
  return saida;
};

export type LeituraDaTela = {
  rota: string;
  controles: ControleLido[];
  /** Controle desenhado e SEM nome acessível. Não é lacuna de manual, é defeito de acessibilidade. */
  semNome: number;
  /** Onde a navegação parou de verdade. Rebate (permissão, sessão) é medido, não suposto. */
  rotaEfetiva: string;
};

export async function lerControlesDaTela(page: Pagina, rota: string): Promise<LeituraDaTela> {
  await garantirShimDeNome(page);
  const brutos = await page.locator("body").evaluate<ControleLido[], number>(LER, MAXIMO_DE_CARACTERES);
  if (!Array.isArray(brutos)) {
    throw new FalhaDeMotor(`A enumeração de ${rota} não devolveu lista. O navegador falhou a leitura.`);
  }
  const semNome = brutos.filter((c) => !c.rotulo).length;
  return {
    rota,
    controles: brutos.filter((c) => c.rotulo),
    semNome,
    rotaEfetiva: new URL(page.url()).pathname,
  };
}
