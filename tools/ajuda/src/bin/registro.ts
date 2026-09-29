/**
 * ─ `ajuda:registro`: GERA OS DOIS BARRIS, QUE NUNCA SÃO EDITADOS À MÃO ─────────────────────────
 *
 * `conteudo/registro.gerado.ts` (os artigos) e `conteudo/familias.gerado.ts` (os blocos
 * compartilhados por família). Os dois pelo mesmo motivo, abaixo.
 *
 * ┌─ POR QUE ESTE ARQUIVO É GERADO, E NÃO MANTIDO ───────────────────────────────────────────────┐
 * │ O barrel dos artigos é o ÚNICO arquivo que todo agente de conteúdo tocaria, e a §A.39 descreve │
 * │ exatamente esse modo de falha: dois agentes escrevendo o mesmo arquivo se sobrescrevem em       │
 * │ silêncio, e o segundo a gravar apaga o primeiro sem que nada falhe. Gerando, a colisão deixa    │
 * │ de existir por construção, em vez de depender de disciplina.                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CONVENÇÃO É CONFERIDA, NÃO SUPOSTA: cada artigo mora em `conteudo/<modulo>/<slug>.ts` e exporta
 * `export const artigo: Artigo`, com o `slug` igual ao nome do arquivo. Fora disso, o gerador falha
 * dizendo o arquivo, em vez de produzir um barrel que não compila.
 */
import fs from "node:fs";
import path from "node:path";
import { FalhaDeMotor, raizDoRepositorio } from "../ambiente";

const CABECALHO = `/* ARQUIVO GERADO por \`pnpm ajuda:registro\`. NÃO EDITE À MÃO.
 *
 * Ele é o barrel dos artigos da Central de Ajuda. É gerado, e não mantido, porque seria o único
 * arquivo que todo agente de conteúdo tocaria: dois agentes no mesmo arquivo se sobrescrevem em
 * silêncio (§A.39). Acrescentou artigo? Rode o comando.
 */`;

type Encontrado = { modulo: string; slug: string; importar: string; identificador: string };

function varrer(base: string): Encontrado[] {
  if (!fs.existsSync(base)) return [];
  const achados: Encontrado[] = [];
  for (const modulo of fs.readdirSync(base).sort()) {
    const pasta = path.join(base, modulo);
    if (!fs.statSync(pasta).isDirectory()) continue;
    // `familias` NÃO é módulo de artigo: é o outro barrel, varrido por `varrerFamilias`. Sem esta
    // linha, o gerador exigiria `export const artigo` de um arquivo de família e falharia.
    if (modulo === PASTA_DAS_FAMILIAS) continue;
    for (const arquivo of fs.readdirSync(pasta).sort()) {
      if (!arquivo.endsWith(".ts") || arquivo.endsWith(".spec.ts")) continue;
      const slug = arquivo.replace(/\.ts$/, "");
      const fonte = fs.readFileSync(path.join(pasta, arquivo), "utf8");
      if (!/export\s+const\s+artigo\b/.test(fonte)) {
        throw new FalhaDeMotor(
          `${modulo}/${arquivo} não exporta \`artigo\`. A convenção é ` +
            `\`export const artigo: Artigo\`, e ela é conferida aqui para o barrel nunca nascer quebrado.`,
        );
      }
      const declarado = fonte.match(/slug:\s*"([^"]+)"/)?.[1];
      if (declarado && declarado !== slug) {
        throw new FalhaDeMotor(
          `${modulo}/${arquivo} declara o slug "${declarado}", diferente do nome do arquivo ` +
            `("${slug}"). O slug vira a URL e a pasta dos prints: divergir quebra os dois.`,
        );
      }
      achados.push({
        modulo,
        slug,
        importar: `./${modulo}/${slug}`,
        identificador: `artigo_${slug.replace(/[^A-Za-z0-9]/g, "_")}`,
      });
    }
  }
  const repetidos = achados.map((a) => a.slug).filter((s, i, l) => l.indexOf(s) !== i);
  if (repetidos.length > 0) {
    throw new FalhaDeMotor(`Slug repetido entre módulos: ${[...new Set(repetidos)].join(", ")}.`);
  }
  return achados;
}

const PASTA_DAS_FAMILIAS = "familias";

const CABECALHO_FAMILIAS = `/* ARQUIVO GERADO por \`pnpm ajuda:registro\`. NÃO EDITE À MÃO.
 *
 * Ele é o barrel das FAMÍLIAS de artigos (o bloco "Antes De Começar" e "Se Der Errado" que todos os
 * artigos de uma mesma tela têm igual). Gerado pelo mesmo motivo do barrel dos artigos: seria o
 * único arquivo que todo agente de conteúdo tocaria (§A.39). Acrescentou família? Rode o comando.
 */`;

type FamiliaEncontrada = { codigo: string; importar: string; identificador: string };

/**
 * ─ A VARREDURA DAS FAMÍLIAS, com as MESMAS duas conferências dos artigos ───────────────────────
 *
 * Exporta `familia`, e o `codigo` declarado é igual ao nome do arquivo. A segunda importa mais aqui
 * do que nos artigos: é o `codigo` que o artigo escreve em `familia`, então divergir produz artigo
 * que aponta para família inexistente, e o bloco compartilhado simplesmente não aparece na tela,
 * sem nada falhar.
 */
function varrerFamilias(base: string): FamiliaEncontrada[] {
  const pasta = path.join(base, PASTA_DAS_FAMILIAS);
  if (!fs.existsSync(pasta)) return [];
  const achados: FamiliaEncontrada[] = [];
  for (const arquivo of fs.readdirSync(pasta).sort()) {
    if (!arquivo.endsWith(".ts") || arquivo.endsWith(".spec.ts")) continue;
    const codigo = arquivo.replace(/\.ts$/, "");
    const fonte = fs.readFileSync(path.join(pasta, arquivo), "utf8");
    if (!/export\s+const\s+familia\b/.test(fonte)) {
      throw new FalhaDeMotor(
        `${PASTA_DAS_FAMILIAS}/${arquivo} não exporta \`familia\`. A convenção é ` +
          `\`export const familia: FamiliaDeArtigos\`, e ela é conferida aqui para o barrel nunca ` +
          `nascer quebrado.`,
      );
    }
    const declarado = fonte.match(/codigo:\s*"([^"]+)"/)?.[1];
    if (declarado && declarado !== codigo) {
      throw new FalhaDeMotor(
        `${PASTA_DAS_FAMILIAS}/${arquivo} declara o código "${declarado}", diferente do nome do ` +
          `arquivo ("${codigo}"). É o código que os artigos escrevem em \`familia\`: divergir faz o ` +
          `bloco compartilhado sumir da tela sem nada falhar.`,
      );
    }
    achados.push({
      codigo,
      importar: `./${PASTA_DAS_FAMILIAS}/${codigo}`,
      identificador: `familia_${codigo.replace(/[^A-Za-z0-9]/g, "_")}`,
    });
  }
  return achados;
}

function main(): void {
  const base = path.join(raizDoRepositorio(), "apps/frontend/src/ajuda/conteudo");
  const achados = varrer(base);
  const linhas = [
    CABECALHO,
    ``,
    `import type { Artigo } from "../tipos";`,
    ...achados.map((a) => `import { artigo as ${a.identificador} } from "${a.importar}";`),
    ``,
    `export const ARTIGOS: Artigo[] = [`,
    ...achados.map((a) => `  ${a.identificador},`),
    `];`,
    ``,
    `export const ARTIGO_POR_SLUG: Record<string, Artigo> = Object.fromEntries(`,
    `  ARTIGOS.map((a) => [a.slug, a]),`,
    `);`,
    ``,
  ];
  fs.mkdirSync(base, { recursive: true });
  const destino = path.join(base, "registro.gerado.ts");
  fs.writeFileSync(destino, linhas.join("\n"));
  console.log(`[ajuda] registro gerado com ${achados.length} artigo(s): ${destino}`);

  const familias = varrerFamilias(base);
  const linhasFamilias = [
    CABECALHO_FAMILIAS,
    ``,
    `import type { FamiliaDeArtigos } from "../tipos";`,
    ...familias.map((f) => `import { familia as ${f.identificador} } from "${f.importar}";`),
    ``,
    `export const FAMILIAS: FamiliaDeArtigos[] = [`,
    ...familias.map((f) => `  ${f.identificador},`),
    `];`,
    ``,
    `export const FAMILIA_POR_CODIGO: Record<string, FamiliaDeArtigos> = Object.fromEntries(`,
    `  FAMILIAS.map((f) => [f.codigo, f]),`,
    `);`,
    ``,
  ];
  const destinoFamilias = path.join(base, "familias.gerado.ts");
  fs.writeFileSync(destinoFamilias, linhasFamilias.join("\n"));
  console.log(
    `[ajuda] famílias geradas com ${familias.length} bloco(s) compartilhado(s): ${destinoFamilias}`,
  );
}

try {
  main();
} catch (erro: unknown) {
  console.error(`\n[ajuda] FALHOU\n${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exit(1);
}
