import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O `/api/api/` QUE NÃO PODE VOLTAR.
 *
 * `apiFetch` já monta o prefixo (`const BASE = "/api"`), então o caminho passado a ela é RELATIVO
 * (`/admin/clientes`). Quem escreve `apiFetch("/api/admin/...")` produz `/api/api/admin/...`, e o
 * resultado é um 404 que a tela mostra como erro genérico: em 01/09/2026 o cadastro de loja parecia
 * salvar, dava erro, e sumia ao atualizar, porque nunca chegou ao backend.
 *
 * POR QUE ESTE TESTE EXISTE, E POR QUE ELE É DE TEXTO. O gate passou verde no dia do defeito, e não
 * por descuido do gate: `tsc` não olha dentro de uma template string, e não há teste que exercite a
 * chamada de rede de um componente. O controle que pegaria isso é a PROVA VISUAL (§A.13), que naquele
 * dia não rodou. Enquanto a prova visual depende de credencial que nem sempre está à mão, uma
 * varredura de texto é a rede de baixo: barata, determinística e impossível de esquecer.
 *
 * Varre o fonte inteiro do frontend, então vale para toda tela futura, não só para a de lojas.
 */

const RAIZ = new URL("../", import.meta.url).pathname; // apps/frontend/src
const EXTENSOES = [".ts", ".tsx"];

/** Toda chamada de família `apiFetch`/`apiUpload`/`apiOpenInline` com caminho começando em `/api`. */
const CHAMADA_COM_PREFIXO = /\bapi[A-Za-z]*\s*(?:<[^>]*>)?\s*\(\s*[`'"]\/api\//;

function arquivosDeFonte(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosDeFonte(caminho));
    } else if (EXTENSOES.some((e) => entrada.endsWith(e))) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("prefixo da API: apiFetch recebe caminho RELATIVO, nunca começando em /api", () => {
  it("nenhum arquivo do frontend chama a API com o prefixo duplicado", () => {
    const infratores: string[] = [];
    for (const arquivo of arquivosDeFonte(RAIZ)) {
      // O próprio `lib/api.ts` define o BASE e as rotas públicas; ele é a fonte, não um chamador.
      if (arquivo.endsWith("/lib/api.ts") || arquivo.endsWith("/lib/api-prefixo.spec.ts")) continue;
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        if (CHAMADA_COM_PREFIXO.test(linha)) {
          infratores.push(`${arquivo.replace(RAIZ, "")}:${i + 1}  ${linha.trim().slice(0, 90)}`);
        }
      });
    }
    expect(infratores, `chamadas com /api duplicado:\n${infratores.join("\n")}`).toEqual([]);
  });

  /**
   * GUARDA QUE NÃO DETECTA NADA NÃO É GUARDA. Este caso prova que o padrão pega a linha REAL que
   * causou o defeito, e que ele não pega a forma correta. Sem isso, uma edição infeliz do regex
   * deixaria o teste verde para sempre, protegendo coisa nenhuma.
   */
  it("o padrão pega a linha que causou o defeito e ignora a forma correta", () => {
    const defeituosa = 'setLojas(await apiFetch<Loja[]>(`/api/admin/clientes/${cod}/lojas`));';
    const correta = 'setLojas(await apiFetch<Loja[]>(`/admin/clientes/${cod}/lojas`));';
    expect(CHAMADA_COM_PREFIXO.test(defeituosa)).toBe(true);
    expect(CHAMADA_COM_PREFIXO.test(correta)).toBe(false);
    // E as três formas de aspas, porque o próximo erro pode não usar template string.
    expect(CHAMADA_COM_PREFIXO.test(`apiFetch("/api/admin/x")`)).toBe(true);
    expect(CHAMADA_COM_PREFIXO.test(`apiFetch('/api/admin/x')`)).toBe(true);
  });
});
