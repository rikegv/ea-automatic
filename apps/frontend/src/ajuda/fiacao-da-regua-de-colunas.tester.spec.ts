/**
 * ─ A FIAÇÃO DA RÉGUA NOVA ATÉ O CAMINHO QUE **GRAVA** (OST do desbloqueio, 28/09/2026) ───────────
 *
 * ESCRITO PELO `tester` (§A.38). Irmão de `motor-fiacao.tester.spec.ts`, e pela mesma razão: o modo de
 * falha DOCUMENTADO desta frente é a correção que entra no núcleo testado e NÃO chega a
 * `tools/ajuda/src/bin/capturar.ts`. Aconteceu antes, com a denylist de equipe: o caminho que só
 * CONFERIA ficou rígido e o caminho que GRAVAVA PNG ficou cego, e nada falhou em lugar nenhum.
 *
 * ┌─ POR QUE ESTE ARQUIVO LÊ CÓDIGO-FONTE, E EM QUE ISSO É LEGÍTIMO ─────────────────────────────┐
 * │ `tools/ajuda/` está FORA de qualquer projeto de teste (o `pnpm-workspace.yaml` tem `apps/*` e   │
 * │ `packages/*`), então a casca que abre o navegador e grava o arquivo não tem runner. Conferir a   │
 * │ FONTE é substituto pobre de exercitar o código, e é o único disponível. Pobre, não inútil: o     │
 * │ defeito desta classe nunca é de lógica, é ARGUMENTO QUE NÃO FOI PASSADO, e isso a fonte mostra.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE A OST PÕE EM RISCO, E É O QUE ESTE ARQUIVO VIGIA ─────────────────────────────────────┐
 * │ Duas coisas podem se desfazer em silêncio ao liberar as fontes:                                 │
 * │   1. `gestor_bp` deixar de ser LIDO (em vez de deixar de barrar). O sintoma é ZERO: base          │
 * │      aprovada, lote rodando, e 431 valores de PII de terceiro sem ninguém procurando por eles.   │
 * │   2. a régua ser REESCRITA na casca, em vez de consumida de `lote.ts`. Aí passam a existir duas   │
 * │      verdades, e a que grava PNG é a que ninguém testa.                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLUNAS_DE_PESSOA, REGUA_DAS_COLUNAS_DE_PESSOA } from "./lote";

const RAIZ_REPO = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIR_TOOLS = path.join(RAIZ_REPO, "tools/ajuda/src");
const DIR_BINS = path.join(DIR_TOOLS, "bin");
const LOTE_TS = path.join(RAIZ_REPO, "apps/frontend/src/ajuda/lote.ts");

const ler = (arquivo: string) => readFileSync(arquivo, "utf8");

/** Sem comentário nem quebra de linha: a conferência é sobre o CÓDIGO, e a chamada pode ser quebrada. */
const codigo = (fonte: string) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ");

/** Os argumentos de uma chamada, achando o parêntese que fecha. Regex não equilibra parêntese. */
function argumentosDe(fonte: string, chamada: string): string[] {
  const achados: string[] = [];
  const plano = codigo(fonte);
  let de = plano.indexOf(`${chamada}(`);
  while (de !== -1) {
    let i = de + chamada.length + 1;
    let nivel = 1;
    while (i < plano.length && nivel > 0) {
      if (plano[i] === "(") nivel += 1;
      if (plano[i] === ")") nivel -= 1;
      i += 1;
    }
    achados.push(plano.slice(de + chamada.length + 1, i - 1));
    de = plano.indexOf(`${chamada}(`, i);
  }
  return achados;
}

const arquivosDeTools = (): string[] => {
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const cheio = path.join(dir, e.name);
      if (e.isDirectory()) varrer(cheio);
      else if (e.name.endsWith(".ts")) achados.push(cheio);
    }
  };
  varrer(DIR_TOOLS);
  return achados;
};

/**
 * AS FONTES QUE O NÚCLEO REALMENTE LÊ. `LIBERADA` e `ROTULO` não são consultadas (a primeira porque o
 * dado pode aparecer, a segunda porque ler o valor deixou de ser o jeito de protegê-lo), então exigir
 * consulta para elas seria exigir código morto, e código morto vira remoção, e a remoção derruba quem
 * ainda o chama por outro caminho. A exigência é só sobre o que é lido.
 */
const FONTES_LIDAS = COLUNAS_DE_PESSOA.filter((f) =>
  ["ASSERCAO", "DENYLIST"].includes(REGUA_DAS_COLUNAS_DE_PESSOA[f]),
);

describe("a régua mora em `lote.ts`, e é LÁ que a decisão é tomada", () => {
  /**
   * MAPA DECLARADO E NÃO CONSUMIDO é proteção imaginária com cara de código: ele documenta uma régua
   * que ninguém aplica, e o próximo a ler acredita nele. A asserção é sobre o CORPO da função, e não
   * sobre o arquivo, porque a menção no comentário não decide nada.
   */
  it("`conferirBaseAntesDoLote` CONSOME `REGUA_DAS_COLUNAS_DE_PESSOA` no corpo", () => {
    const plano = codigo(ler(LOTE_TS));
    const corpo = plano.slice(plano.indexOf("export async function conferirBaseAntesDoLote"));
    expect(corpo.length).toBeGreaterThan(0);
    expect(corpo).toContain("REGUA_DAS_COLUNAS_DE_PESSOA[");
  });

  /**
   * A CASCA NÃO REESCREVE A RÉGUA. Duas verdades sobre quem é liberado é o pior resultado possível
   * desta OST: a que grava PNG seria a que não tem runner de teste. A casca LÊ (consultas) e a regra
   * DECIDE, e essa separação está escrita no cabeçalho de `base-sintetica.ts`.
   */
  it("nenhum arquivo de `tools/ajuda/src` declara régua própria por fonte", () => {
    const suspeitos: string[] = [];
    for (const arquivo of arquivosDeTools()) {
      const plano = codigo(ler(arquivo));
      if (/\b(LIBERADA|ASSERCAO|ROTULO)\b/.test(plano)) suspeitos.push(path.relative(RAIZ_REPO, arquivo));
    }
    expect(suspeitos).toEqual([]);
  });
});

describe("FIAÇÃO: o bin que GRAVA continua lendo as colunas de pessoa", () => {
  /**
   * OS DOIS PONTOS DO MESMO ARQUIVO, e é aqui que a fresta anterior morou: `capturar.ts` chama a
   * conferência DUAS vezes, uma como prévia (para falhar antes de abrir navegador) e outra por dentro
   * de `executarLote` (a peça testada, que garante a ordem). Passar a leitura em uma e esquecer na
   * outra compila, e o ramo esquecido é justamente o que autoriza a gravação.
   */
  it("`capturar.ts` passa `amostrarColunaDePessoa` na prévia E em `executarLote`", () => {
    const fonte = ler(path.join(DIR_BINS, "capturar.ts"));
    for (const chamada of ["conferirBaseAntesDoLote", "executarLote"]) {
      const args = argumentosDe(fonte, chamada);
      expect(args.length, `${chamada} é chamada em capturar.ts`).toBeGreaterThan(0);
      for (const a of args) expect(a).toMatch(/\bamostrarColunaDePessoa\b/);
    }
  });

  /**
   * A VARREDURA É SOBRE TODOS OS BINS, e não sobre dois nomeados à mão: o terceiro bin que alguém
   * escrever amanhã entra aqui sozinho, que é a única forma de a conferência não envelhecer junto com
   * a lista.
   */
  it("nenhuma chamada de bin a `conferirBaseAntesDoLote` ou a `executarLote` omite a leitura das colunas", () => {
    const omissas: string[] = [];
    for (const arquivo of readdirSync(DIR_BINS).filter((f) => f.endsWith(".ts"))) {
      const fonte = ler(path.join(DIR_BINS, arquivo));
      for (const chamada of ["conferirBaseAntesDoLote", "executarLote"]) {
        for (const args of argumentosDe(fonte, chamada)) {
          if (!/\bamostrarColunaDePessoa\b/.test(args)) omissas.push(`${arquivo}: ${chamada}(...)`);
        }
      }
    }
    expect(omissas).toEqual([]);
  });

  /**
   * ─ TODA FONTE LIDA TEM DE TER CONSULTA, E O `gestor_bp` SAIU DESSA LISTA (rodada 3) ──────────
   *
   * Fonte de régua lida (`ASSERCAO`, `DENYLIST`) sem consulta na casca é a asserção nascendo VAZIA, e
   * o veredito fica APROVADO do mesmo jeito, porque amostra vazia de coluna é aceita de propósito. É
   * o modo de falha mais silencioso desta frente: nada quebra, nada avisa, e a proteção deixou de
   * existir.
   *
   * ┌─ O QUE MUDOU AQUI, E POR QUE A ASSERÇÃO DO GESTOR SAIU EM VEZ DE SER ENFRAQUECIDA ──────────┐
   * │ Até a rodada 2 esta asserção exigia a consulta de `dados_vaga_folha.gestor_bp`, porque a régua  │
   * │ dele era `DENYLIST` e o valor precisava ser LIDO. Com a régua `ROTULO` ele não é mais lido, e     │
   * │ manter a exigência amarraria a casca a uma consulta que o núcleo nunca chama. A proteção dele    │
   * │ passou a ser conferida onde ela agora mora: a regra de rótulo, em                                │
   * │ `regra-de-rotulo-do-gestor.tester.spec.ts`.                                                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("`base-sintetica.ts` tem consulta para toda fonte que o núcleo LÊ", () => {
    const fonte = ler(path.join(DIR_TOOLS, "base-sintetica.ts"));
    const bloco = fonte.slice(fonte.indexOf("CONSULTAS_DE_COLUNA"));
    expect(FONTES_LIDAS.length, "nenhuma fonte lida é um conjunto vazio suspeito").toBeGreaterThan(0);
    for (const coluna of FONTES_LIDAS) {
      expect(bloco, `sem consulta para ${coluna}`).toContain(`"${coluna}"`);
    }
  });

  /**
   * FONTE DECLARADA E SEM CONSULTA continua sendo FALHA DURA na casca, com o nome da fonte. Ela é a
   * rede que pega a fonte nova que alguém acrescentar a `lote.ts` sem leitura: sem ela, a asserção
   * nasceria inerte, em silêncio, que é o modo de falha desta frente inteira.
   */
  it("a falha dura de fonte sem consulta continua de pé", () => {
    const plano = codigo(ler(path.join(DIR_TOOLS, "base-sintetica.ts")));
    expect(plano).toMatch(/if\s*\(\s*!consulta\s*\)/);
    expect(plano).toContain("COLUNA DE PESSOA SEM CONSULTA");
  });
});

describe("FIAÇÃO: a allowlist que monta a denylist vem SÓ da declaração do arnês", () => {
  /**
   * ─ O FURO QUE MAIS CARA SAI SE ABRIR, VIGIADO NO PONTO ONDE ELE ABRIRIA ─────────────────────
   *
   * `montarNegadosDeEquipe` SUBTRAI o que a allowlist declara. Basta alguém somar uma fonte de DADO
   * (candidato, sala de espera, `as_candidatos`) à allowlist usada na conferência para um colega do
   * time com nome igual ao de um candidato SAIR da proteção, sem nenhum sintoma. A régua de hoje é
   * `montarAllowlist([], declaracao)`: lista vazia de população, só a declaração.
   */
  it("nenhuma chamada a `montarAllowlist` soma população que não seja `candidatos`", () => {
    const suspeitas: string[] = [];
    for (const arquivo of arquivosDeTools()) {
      // A DECLARAÇÃO da própria função não é chamada: ali os "argumentos" são os parâmetros tipados.
      if (path.basename(arquivo) === "allowlist.ts") continue;
      for (const args of argumentosDe(ler(arquivo), "montarAllowlist")) {
        const primeiro = args.split(",")[0].trim();
        const aceito = primeiro === "[]" || /^(populacao\.)?candidatos$/.test(primeiro);
        if (!aceito) suspeitas.push(`${path.relative(RAIZ_REPO, arquivo)}: montarAllowlist(${args})`);
      }
    }
    expect(suspeitas).toEqual([]);
  });

  it("a conferência da base em `capturar.ts` usa a allowlist PROVISÓRIA, não a final", () => {
    const fonte = ler(path.join(DIR_BINS, "capturar.ts"));
    for (const chamada of ["conferirBaseAntesDoLote", "executarLote"]) {
      for (const args of argumentosDe(fonte, chamada)) {
        expect(args).toMatch(/allowlist:\s*allowlistProvisoria/);
      }
    }
  });
});
