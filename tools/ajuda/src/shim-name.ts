/**
 * ─ O REMENDO DO `__name`, e ele é ARTEFATO DE FERRAMENTA, não desenho ──────────────────────────
 *
 * O `tsx` compila com `keepNames` do esbuild, que envolve toda função nomeada num helper
 * (`const f = __name((x) => ..., "f")`) para preservar `Function.name`. Quando essa função vai para
 * dentro do navegador por `page.evaluate`, o helper NÃO vai com ela: o corpo serializado chama
 * `__name`, que não existe na página, e o erro que aparece é um `ReferenceError` que não tem nada a
 * ver com o código escrito.
 *
 * As saídas ruins seriam escrever o código da página SEM nenhuma função nomeada (ilegível, e uma
 * linha nova volta a quebrar) ou declarar `__name` dentro do próprio callback (o compilador
 * envolveria a própria declaração e daria erro de inicialização). O remendo é declarar a IDENTIDADE
 * no `globalThis` da página, por EXPRESSÃO (string não passa pelo compilador), antes de cada
 * `evaluate` que leva função nomeada. Some a cada navegação, então se reaplica.
 */
import type { Pagina } from "./playwright-minimo";

export async function garantirShimDeNome(page: Pagina): Promise<void> {
  await page.evaluate<void>(
    "globalThis.__name = globalThis.__name || ((alvo) => alvo)",
  );
}
