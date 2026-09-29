/**
 * ─ COMO UM `Alvo` VIRA UM LOCALIZADOR ──────────────────────────────────────────────────────────
 *
 * Mora em arquivo próprio porque três peças precisam dele (o motor, a coleta do recorte e o preparo),
 * e importar o motor dentro da coleta faria ciclo. Nada aqui decide: só traduz o vocabulário do
 * roteiro para o localizador do Playwright.
 *
 * PAPEL MAIS NOME é o caminho preferido, e o `seletor` é a saída de emergência: o localizador
 * acessível sobrevive a troca de classe, de cor e de layout, que é o que mais muda numa tela viva.
 */
import type { Alvo } from "../../../apps/frontend/src/ajuda/tipos";
import { FalhaDeMotor } from "./ambiente";
import type { Localizador, Pagina } from "./playwright-minimo";

export function descreverAlvo(alvo: Alvo): string {
  if (alvo.papel) return `${alvo.papel} "${String(alvo.nome ?? "")}"`;
  return `seletor "${alvo.seletor ?? ""}"`;
}

export function localizar(page: Pagina, alvo: Alvo): Localizador {
  if (alvo.papel) return page.getByRole(alvo.papel, { name: alvo.nome }).first();
  if (alvo.seletor) return page.locator(alvo.seletor).first();
  throw new FalhaDeMotor(
    `Alvo "${alvo.texto ?? "(sem rótulo)"}" não tem papel nem seletor: não há como encontrá-lo.`,
  );
}
