/**
 * ─ CARREGAR OS ROTEIROS, QUE SÃO A ENTRADA DO MOTOR ────────────────────────────────────────────
 *
 * O roteiro mora AO LADO do artigo (`apps/frontend/src/ajuda/capturas/<slug>.roteiro.ts`) e é
 * versionado junto, porque roteiro e artigo envelhecem juntos: o passo que deixou de existir na tela
 * é o mesmo passo que saiu do texto.
 *
 * A CONVENÇÃO É UMA SÓ, e ela é CONFERIDA, não suposta: cada arquivo exporta `export const roteiro:
 * Roteiro`, e o `slug` tem de bater com o nome do arquivo. Arquivo que foge disso derruba o
 * carregamento com o motivo, em vez de sumir em silêncio da lista.
 */
import fs from "node:fs";
import path from "node:path";
import {
  conferirPrintsUnicos,
  slugDoArquivoDeRoteiro,
} from "../../../apps/frontend/src/ajuda/captura";
import type { Roteiro } from "../../../apps/frontend/src/ajuda/tipos";
import { FalhaDeMotor, raizDoRepositorio } from "./ambiente";

export function pastaDosRoteiros(): string {
  return path.join(raizDoRepositorio(), "apps/frontend/src/ajuda/capturas");
}

export async function carregarRoteiros(slugs?: string[]): Promise<Roteiro[]> {
  const pasta = pastaDosRoteiros();
  if (!fs.existsSync(pasta)) return [];
  const arquivos = fs
    .readdirSync(pasta)
    .filter((f) => f.endsWith(".roteiro.ts"))
    .sort();
  const roteiros: Roteiro[] = [];
  for (const arquivo of arquivos) {
    // `<slug>.roteiro.ts` ou `<slug>.2.roteiro.ts`: o sufixo numérico é a CONTINUAÇÃO do mesmo artigo
    // em outra tela. Ver `slugDoArquivoDeRoteiro`, que é a peça testada.
    const esperado = slugDoArquivoDeRoteiro(arquivo);
    if (!esperado) continue;
    if (slugs && !slugs.includes(esperado)) continue;
    const modulo = (await import(path.join(pasta, arquivo))) as { roteiro?: Roteiro };
    const roteiro = modulo.roteiro;
    if (!roteiro) {
      throw new FalhaDeMotor(
        `${arquivo} não exporta \`roteiro\`. A convenção é \`export const roteiro: Roteiro\`.`,
      );
    }
    if (roteiro.slug !== esperado) {
      throw new FalhaDeMotor(
        `${arquivo} declara o slug "${roteiro.slug}", que não bate com o nome do arquivo ` +
          `("${esperado}"). O slug é a pasta dos prints: divergir espalha imagem órfã.`,
      );
    }
    roteiros.push(roteiro);
  }
  if (slugs) {
    const faltando = slugs.filter((s) => !roteiros.some((r) => r.slug === s));
    if (faltando.length > 0) {
      throw new FalhaDeMotor(`Roteiro não encontrado: ${faltando.join(", ")} (em ${pasta}).`);
    }
  }
  /**
   * COLISÃO DE NOME DE IMAGEM entre roteiros do MESMO slug. É o único risco novo que o multi-arquivo
   * traz, e ele é silencioso: o segundo print gravaria em cima do primeiro e o artigo mostraria a
   * imagem errada, sem nada falhar. Por isso falha AQUI, no carregamento, antes de abrir navegador.
   */
  const colisoes = conferirPrintsUnicos(roteiros);
  if (colisoes.length > 0) {
    throw new FalhaDeMotor(
      `IMAGEM DECLARADA DUAS VEZES no mesmo artigo:\n` +
        colisoes.map((c) => `  ${c.slug}/${c.arquivo} (${c.vezes}x)`).join("\n") +
        `\n  Um artigo pode ter vários roteiros (\`<slug>.2.roteiro.ts\`, para outra tela), e os ` +
        `prints caem todos na mesma pasta: nome repetido grava um em cima do outro em silêncio.`,
    );
  }
  return roteiros;
}
