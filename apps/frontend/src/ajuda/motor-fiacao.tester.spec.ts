/**
 * ─ A FIAÇÃO DO CAMINHO QUE GRAVA, CONFERIDA NA FONTE (§A.6, §A.38) ──────────────────────────────
 *
 * ESCRITO PELO `tester` (§A.38), e é o teste que teria pego a fresta que o `seguranca` achou: a
 * denylist de equipe entrou no NÚCLEO e não entrou no arquivo que GRAVA PNG. A mesma tela, com nome
 * e e-mail de colega real, era recusada pelo caminho de conferência e aprovada, com zero achado, pelo
 * caminho que grava.
 *
 * ┌─ POR QUE ESTE TESTE LÊ CÓDIGO-FONTE, E EM QUE ISSO É LEGÍTIMO ────────────────────────────────┐
 * │ `tools/ajuda/` está FORA de qualquer projeto de teste: o `pnpm-workspace.yaml` tem `apps/*` e   │
 * │ `packages/*`, e o vitest só existe nos dois apps. Ou seja, a casca que abre o navegador e grava │
 * │ o arquivo não tem como ser exercitada por teste nenhum, e foi exatamente ali que o furo morou.  │
 * │                                                                                                │
 * │ Conferir a FONTE é um substituto pobre de exercitar o código, e é o único disponível hoje.      │
 * │ Pobre, mas não inútil: o defeito real não era de lógica, era uma ARGUMENTO QUE NÃO FOI PASSADO, │
 * │ e isso a fonte mostra. Um teste frágil que pega o defeito que aconteceu vale mais que um teste  │
 * │ elegante que não existe. Quando `tools/` ganhar runner, este arquivo é o primeiro a ser          │
 * │ substituído por um teste de verdade, e essa troca é ganho, não retrabalho.                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O TIPO NÃO FECHA, E POR ISSO A CONFERÊNCIA É AQUI ─────────────────────────────────────┐
 * │ Mesmo com `negados` OBRIGATÓRIO em `DependenciasCaptura`, o compilador passa a exigir que o     │
 * │ campo EXISTA, não que ele carregue a lista de verdade: `negados: { nomes: [], emails: [] }`     │
 * │ compila e é o gate cego outra vez, agora com carimbo de tipo. Tipo obrigatório mata o           │
 * │ ESQUECIMENTO (que foi o defeito real); só o teste mata o valor VAZIO.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ_REPO = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIR_TOOLS = path.join(RAIZ_REPO, "tools/ajuda/src");
const DIR_BINS = path.join(DIR_TOOLS, "bin");

const ler = (arquivo: string) => readFileSync(arquivo, "utf8");

/** Sem comentário nem quebra de linha: a conferência é sobre o código, e a chamada pode ser quebrada. */
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

const binsQueChamam = (chamada: string) =>
  readdirSync(DIR_BINS)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ arquivo: f, fonte: ler(path.join(DIR_BINS, f)) }))
    .filter((b) => codigo(b.fonte).includes(`${chamada}(`));

describe("a casca do motor existe e é a que se pretende conferir", () => {
  it("há bin que executa roteiro, e ele é mais de um (conferir e capturar)", () => {
    const bins = binsQueChamam("executarRoteiro");
    expect(bins.length).toBeGreaterThanOrEqual(2);
    expect(bins.map((b) => b.arquivo).sort()).toContain("capturar.ts");
  });
});

describe("FIAÇÃO NA FONTE: todo caminho que executa roteiro passa a denylist adiante", () => {
  /**
   * A VARREDURA É SOBRE TODOS OS BINS, e não sobre `capturar.ts` e `conferir.ts` nomeados à mão: o
   * terceiro bin que alguém escrever amanhã entra aqui sozinho, que é a única forma de a conferência
   * não envelhecer junto com a lista.
   */
  it("nenhuma chamada a `executarRoteiro` omite a denylist", () => {
    const omissas: string[] = [];
    for (const { arquivo, fonte } of binsQueChamam("executarRoteiro")) {
      for (const args of argumentosDe(fonte, "executarRoteiro")) {
        if (!/\bnegados\b/.test(args)) omissas.push(`${arquivo}: executarRoteiro(${args})`);
      }
    }
    expect(omissas).toEqual([]);
  });

  /**
   * A DENYLIST CHEGA AO BIN PELO LOTE, e não por variável montada do lado de fora. É a diferença
   * entre receber a licença de capturar junto com a proteção, e montar as duas separadamente, que é
   * como as duas se desencontram.
   */
  it("o bin que grava recebe a denylist pelo parâmetro de `capturar`, vindo de `executarLote`", () => {
    const fonte = codigo(ler(path.join(DIR_BINS, "capturar.ts")));
    expect(fonte).toMatch(/capturar:\s*async\s*\(\s*roteiro\s*,\s*negados\s*\)/);
    expect(fonte).toContain("executarLote(");
  });

  /**
   * NINGUÉM FABRICA UMA DENYLIST VAZIA NA CASCA. É o furo que o tipo obrigatório NÃO fecha: o campo
   * existe, o compilador aceita, e o gate volta a ficar cego. Se um dia essa linha for necessária de
   * verdade, ela tem de ser uma decisão discutida, e é este teste vermelho que provoca a conversa.
   */
  it("nenhum arquivo da casca fabrica denylist vazia", () => {
    const suspeitos: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const cheio = path.join(dir, e.name);
        if (e.isDirectory()) varrer(cheio);
        else if (e.name.endsWith(".ts")) {
          const plano = codigo(ler(cheio));
          if (/nomes\s*:\s*\[\s*\]\s*,\s*emails\s*:\s*\[\s*\]/.test(plano)) {
            suspeitos.push(path.relative(RAIZ_REPO, cheio));
          }
        }
      }
    };
    varrer(DIR_TOOLS);
    expect(suspeitos).toEqual([]);
  });

  /**
   * O MOTOR ENTREGA A DENYLIST AOS DOIS CAMINHOS, e este é o coração da fresta: eram dois ramos do
   * MESMO arquivo, o de `capturar` (que monta `DependenciasCaptura` e grava) e o de `conferir` (que
   * chama `auditarTexto` direto e nunca grava). A correção que entra em um ramo e não no outro
   * compila, passa no typecheck e é invisível, porque os dois auditam, só que um deles audita sem a
   * lista. O sintoma é o pior possível: o modo que NÃO grava é o mais rígido.
   */
  it("os DOIS ramos do motor recebem a denylist: o que grava e o que só confere", () => {
    const fonte = codigo(ler(path.join(DIR_TOOLS, "motor.ts")));

    // Ramo que GRAVA: a denylist entra nas dependências da peça testada.
    const deps = fonte.match(/DependenciasCaptura\s*=\s*\{([\s\S]*?)\};/);
    expect(deps, "o ramo de captura monta `DependenciasCaptura`").not.toBeNull();
    expect(deps?.[1] ?? "").toMatch(/\bnegados\b/);

    /**
     * Ramo que só CONFERE: a denylist entra na chamada direta ao gate.
     *
     * O NOME DO GATE MUDOU NA RODADA 5 (veto do `seguranca`): o caminho da imagem passou a chamar
     * `auditarTelaDoManual`, e `auditarTexto` ficou sendo a régua COMPLETA, usada pela asserção de
     * população. A varredura aceita os DOIS nomes de propósito: o que esta asserção protege é a
     * denylist ser PASSADA, e ela não pode quebrar a cada renomeação do gate. Nenhuma chamada de
     * auditoria, com qualquer um dos nomes, pode omitir `negados`.
     */
    const auditorias = [
      ...argumentosDe(fonte, "auditarTelaDoManual"),
      ...argumentosDe(fonte, "auditarTexto"),
    ];
    expect(auditorias.length, "o motor audita o texto da tela em algum lugar").toBeGreaterThan(0);
    for (const args of auditorias) expect(args).toMatch(/\bnegados\b/);
  });

  /**
   * A DENYLIST NÃO PODE SER OPCIONAL NO CAMINHO DA CASCA, e esta asserção é a que vira VERMELHA se
   * alguém reintroduzir o `?` que permitiu o esquecimento. O parâmetro de `executarRoteiro` é o ponto
   * exato: era `negados?`, e por isso omiti-lo compilava.
   */
  it("`executarRoteiro` exige a denylist, em vez de aceitar a omissão", () => {
    const fonte = codigo(ler(path.join(DIR_TOOLS, "motor.ts")));
    const assinatura = fonte.match(/export async function executarRoteiro\s*\(([\s\S]*?)\)\s*:/);
    expect(assinatura, "a assinatura de `executarRoteiro` foi encontrada").not.toBeNull();
    expect(assinatura?.[1] ?? "").toMatch(/\bnegados\b/);
    expect(
      assinatura?.[1] ?? "",
      "`negados?` opcional é o que permitiu a omissão silenciosa: o parâmetro é obrigatório",
    ).not.toMatch(/negados\s*\?/);
  });
});
