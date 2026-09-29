/**
 * ─ COERÊNCIA DO REGISTRO DE ARTIGOS: A VARREDURA (§7, detectores 3 e 4) ─────────────────────────
 *
 * ESCRITO PELO `tester` (§A.38), e escrito como VARREDURA de propósito: ele itera o registro
 * inteiro, então o artigo 85 entra na conferência SOZINHO, no dia em que alguém o escrever, sem
 * ninguém lembrar de acrescentar um caso aqui. Teste caso a caso em conteúdo que cresce é teste que
 * cobre o que já existia e ignora o que chegou depois.
 *
 * ┌─ O QUE O TYPECHECK NÃO PEGA, E POR ISSO ESTE ARQUIVO EXISTE ─────────────────────────────────┐
 * │ O comentário do `tipos.ts` diz que artigo com `slug` duplicado, sem `fontes` ou apontando para │
 * │ rota inexistente NÃO COMPILA. O tipo `slug: string`, `rotas: string[]` e `fontes: string[]`    │
 * │ não faz nada disso: `[]` é um `string[]` perfeitamente válido, dois artigos com o mesmo `slug` │
 * │ compilam, e `"/admin/reguas"` (com s) é uma string como qualquer outra. Ou o tipo passa a ser  │
 * │ uma união literal derivada das rotas e um `[T, ...T[]]` para `fontes`, ou a conferência é       │
 * │ ESTE teste. As duas coisas juntas é o ideal; nenhuma das duas é o estado de hoje.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PIOR DEFEITO SILENCIOSO DESTA FRENTE: ARTIGO SEM `fontes` ────────────────────────────────┐
 * │ `fontes` é o que liga o artigo aos arquivos de tela que ele ensina, e é o detector 4 da §7, o  │
 * │ único que age ANTES de o print ficar errado. Artigo sem `fontes` não aparece em cruzamento     │
 * │ nenhum: ele fica invisível para a detecção e envelhece em silêncio, ensinando o errado com a   │
 * │ autoridade da casa. E `fontes` apontando para arquivo que não existe mais é o mesmo defeito    │
 * │ com cara de cumprido, que é pior.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ehRoteiroDeProvaDoMotor, ROTEIROS_DE_PROVA_DO_MOTOR } from "./capturas/roteiros-de-prova";
import type { Artigo, Roteiro } from "./tipos";

const RAIZ_REPO = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIR_APP = path.join(RAIZ_REPO, "apps/frontend/src/app");

let ARTIGOS: Artigo[] = [];

beforeAll(async () => {
  let mod: { ARTIGOS?: Artigo[] } | undefined;
  try {
    mod = (await import("./conteudo/registro.gerado")) as { ARTIGOS?: Artigo[] };
  } catch {
    throw new Error(
      "`./conteudo/registro.gerado` ainda não existe (ou não compila). Esperado nesta rodada: o " +
        "registro é GERADO por script (§2.4) e nasce junto do primeiro artigo. Este arquivo fica " +
        "vermelho por AUSÊNCIA de código, não por defeito.",
    );
  }
  if (!Array.isArray(mod?.ARTIGOS)) {
    throw new Error("`registro.gerado` precisa exportar `ARTIGOS: Artigo[]`.");
  }
  ARTIGOS = mod.ARTIGOS;
});

// ── AS ROTAS QUE EXISTEM DE VERDADE, lidas da árvore do App Router ─────────────────────────────
// Derivadas do disco, e não de uma lista escrita à mão: lista à mão envelhece igual ao manual.
function rotasDoApp(): Set<string> {
  const achadas = new Set<string>();
  const andar = (dir: string, rota: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        // Grupo de rota `(app)` não entra na URL; segmento privado `_x` não é rota.
        const seg = entrada.name.startsWith("(")
          ? rota
          : entrada.name.startsWith("_")
            ? null
            : `${rota}/${entrada.name}`;
        if (seg !== null) andar(path.join(dir, entrada.name), seg);
      } else if (entrada.name === "page.tsx") {
        achadas.add(rota === "" ? "/" : rota);
      }
    }
  };
  andar(DIR_APP, "");
  return achadas;
}

describe("o registro de artigos existe e é utilizável", () => {
  it("tem artigo", () => {
    expect(ARTIGOS.length).toBeGreaterThan(0);
  });
});

describe("slug: único no sistema inteiro, porque ele É a URL", () => {
  /**
   * Slug repetido não estoura em lugar nenhum: o segundo artigo simplesmente nunca é alcançado por
   * `/ajuda/<slug>`, e `relacionados` passa a apontar para um dos dois, sem dizer qual. O sintoma é
   * "o link abre o artigo errado", e ninguém liga isso a uma duplicidade.
   */
  it("nenhum slug aparece duas vezes", () => {
    const vistos = new Map<string, number>();
    for (const a of ARTIGOS) vistos.set(a.slug, (vistos.get(a.slug) ?? 0) + 1);
    const repetidos = [...vistos.entries()].filter(([, n]) => n > 1).map(([s]) => s);
    expect(repetidos).toEqual([]);
  });

  it("todo slug é minúsculo, sem acento e sem espaço (ele vai para a URL)", () => {
    const fora = ARTIGOS.filter((a) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)).map((a) => a.slug);
    expect(fora).toEqual([]);
  });
});

describe("relacionados: link interno que aponta para o vazio", () => {
  /**
   * "Artigos Relacionados" com slug inexistente rende uma lista de links que abrem 404, e ela fica
   * no PÉ do artigo, que é o lugar que a revisão humana menos olha.
   */
  it("todo `relacionados` aponta para um slug que existe", () => {
    const existentes = new Set(ARTIGOS.map((a) => a.slug));
    const quebrados: string[] = [];
    for (const a of ARTIGOS) {
      for (const r of a.relacionados) {
        if (!existentes.has(r)) quebrados.push(`${a.slug} -> ${r}`);
      }
    }
    expect(quebrados).toEqual([]);
  });

  it("nenhum artigo se lista como relacionado de si mesmo", () => {
    const auto = ARTIGOS.filter((a) => a.relacionados.includes(a.slug)).map((a) => a.slug);
    expect(auto).toEqual([]);
  });
});

describe("rotas: o detector de ROTA MORTA (§7, detector 3)", () => {
  it("toda rota declarada existe na árvore do App Router", () => {
    const reais = rotasDoApp();
    const mortas: string[] = [];
    for (const a of ARTIGOS) {
      for (const r of a.rotas) {
        if (!reais.has(r)) mortas.push(`${a.slug} -> ${r}`);
      }
    }
    expect(mortas).toEqual([]);
  });

  it("todo artigo declara ao menos uma rota (senão o botão contextual nunca o encontra)", () => {
    const sem = ARTIGOS.filter((a) => a.rotas.length === 0).map((a) => a.slug);
    expect(sem).toEqual([]);
  });

  /**
   * A `/kit` ANTIGA ESTÁ FORA DO MANUAL DE PROPÓSITO (§A.15, §1 regra 4, §11): ela foi tirada do
   * menu e só continua no código porque o reenvio por correção do Clicksign depende dela.
   * Documentar o que foi tirado do menu é ensinar o caminho errado, e a tela existe no disco, então
   * a conferência de rota viva NÃO pega este caso. Ele precisa de linha própria.
   */
  it("nenhum artigo ensina a `/kit` antiga", () => {
    const apontam = ARTIGOS.filter((a) => a.rotas.some((r) => r === "/kit" || r.startsWith("/kit/")));
    expect(apontam.map((a) => a.slug)).toEqual([]);
  });
});

describe("fontes: o detector de artigo velho não pode nascer cego (§7, detector 4)", () => {
  it("todo artigo declara ao menos uma fonte", () => {
    const sem = ARTIGOS.filter((a) => !a.fontes || a.fontes.length === 0).map((a) => a.slug);
    expect(sem).toEqual([]);
  });

  /**
   * FONTE APONTANDO PARA ARQUIVO QUE NÃO EXISTE É PIOR QUE FONTE AUSENTE, porque tem cara de
   * cumprida: o cruzamento com o `git diff` roda, não casa com nada, e devolve "nenhum artigo
   * alcançado" com toda a confiança. O caminho é relativo à raiz do repositório.
   */
  it("toda fonte declarada é um arquivo que existe no repositório", () => {
    const inexistentes: string[] = [];
    for (const a of ARTIGOS) {
      for (const f of a.fontes ?? []) {
        if (!existsSync(path.join(RAIZ_REPO, f))) inexistentes.push(`${a.slug} -> ${f}`);
      }
    }
    expect(inexistentes).toEqual([]);
  });

  it("fonte é caminho relativo à raiz do repositório, nunca absoluto", () => {
    const absolutas: string[] = [];
    for (const a of ARTIGOS) {
      for (const f of a.fontes ?? []) if (f.startsWith("/")) absolutas.push(`${a.slug} -> ${f}`);
    }
    expect(absolutas).toEqual([]);
  });
});

describe("o mínimo para o artigo ser um artigo", () => {
  it("todo artigo tem título, resumo e ao menos um passo", () => {
    const vazios = ARTIGOS.filter(
      (a) => !a.titulo?.trim() || !a.resumo?.trim() || (a.passos ?? []).length === 0,
    ).map((a) => a.slug);
    expect(vazios).toEqual([]);
  });

  /**
   * SEM `termos`, O ARTIGO EXISTE E NÃO É ACHADO. É o defeito que não aparece em revisão nenhuma,
   * porque quem revisa procura pelo título que acabou de escrever (§2.2).
   */
  it("todo artigo declara sinônimos de busca", () => {
    const sem = ARTIGOS.filter((a) => (a.termos ?? []).length === 0).map((a) => a.slug);
    expect(sem).toEqual([]);
  });

  it("`revisadoEm` é data ISO de verdade", () => {
    const ruins = ARTIGOS.filter(
      (a) => !/^\d{4}-\d{2}-\d{2}$/.test(a.revisadoEm ?? "") || Number.isNaN(Date.parse(a.revisadoEm)),
    ).map((a) => a.slug);
    expect(ruins).toEqual([]);
  });

  /**
   * ─ NÍVEL: O CORTE DAS FASES PASSOU A SER POR PROFUNDIDADE, E ISSO TEM CONSEQUÊNCIA MEDÍVEL ────
   *
   * `nivel` é `N1` (o caminho principal: quem ler só os N1 do módulo trabalha) ou `N2` (o recurso
   * secundário, o "cada recurso de cada tela" que o diretor pediu). O tipo já garante que o campo
   * EXISTE e que o valor é um dos dois, então não há teste para isso (garantia que cabe no tipo mora
   * no tipo).
   *
   * O QUE O TIPO NÃO GARANTE é a consequência do corte: um módulo feito SÓ de `N2` não tem caminho
   * principal nenhum, e a fase que entrega "os N1 de todos os módulos" entregaria aquele módulo
   * vazio, sem nada falhar. É a desordem silenciosa que o campo existe para evitar, entrando pela
   * porta de trás.
   */
  it("todo módulo com artigo tem ao menos um `N1` (existe caminho principal para ler)", () => {
    const modulos = [...new Set(ARTIGOS.map((a) => a.modulo))];
    const semCaminhoPrincipal = modulos.filter(
      (m) => !ARTIGOS.some((a) => a.modulo === m && a.nivel === "N1"),
    );
    expect(semCaminhoPrincipal).toEqual([]);
  });

  /**
   * `controles` guarda o RÓTULO LITERAL do controle, e é o que a busca precisa para responder a "o
   * que faz este botão". Entrada vazia ou com espaço sobrando não casa com rótulo nenhum e não
   * aparece em revisão de texto, porque ela não é texto de leitura.
   */
  it("nenhum `controles` tem entrada vazia ou com espaço sobrando", () => {
    const ruins: string[] = [];
    for (const a of ARTIGOS) {
      for (const p of a.passos) {
        for (const c of p.controles ?? []) {
          if (!c.trim() || c !== c.trim()) ruins.push(`${a.slug}: "${c}"`);
        }
      }
    }
    expect(ruins).toEqual([]);
  });

  it("todo print do artigo tem arquivo e legenda", () => {
    const ruins: string[] = [];
    for (const a of ARTIGOS) {
      for (const p of a.passos) {
        if (!p.print) continue;
        if (!p.print.arquivo?.trim() || !p.print.legenda?.trim()) {
          ruins.push(`${a.slug} -> ${p.print.arquivo || "(sem arquivo)"}`);
        }
      }
    }
    expect(ruins).toEqual([]);
  });

  it("dois prints do mesmo artigo não disputam o mesmo arquivo", () => {
    const colisoes: string[] = [];
    for (const a of ARTIGOS) {
      const vistos = new Set<string>();
      for (const p of a.passos) {
        if (!p.print) continue;
        if (vistos.has(p.print.arquivo)) colisoes.push(`${a.slug} -> ${p.print.arquivo}`);
        vistos.add(p.print.arquivo);
      }
    }
    expect(colisoes).toEqual([]);
  });
});

/**
 * ─ AS DUAS TRAVAS DE PRODUTO QUE VALEM PARA TEXTO DE USUÁRIO ───────────────────────────────────
 *
 * Mecânicas e conferíveis, ao contrário do resto da revisão de voz (§11), que é humana. Ficam em
 * bloco separado de propósito: se o coordenador julgar que a §A.24 em título de artigo é decisão do
 * diretor, este bloco sai sem mexer no resto do arquivo.
 */
describe("§A.11 e §A.24 no texto que chega ao usuário", () => {
  const textosDe = (a: Artigo): string[] => [
    a.titulo,
    a.resumo,
    ...(a.preRequisitos ?? []),
    ...a.passos.flatMap((p) => [p.gesto, p.detalhe ?? "", p.print?.legenda ?? ""]),
    ...(a.seDerErrado ?? []).flatMap((s) => [s.sintoma, s.acao]),
    ...(a.regras ?? []),
  ];

  it("travessão é PROIBIDO em todo o texto do artigo (§A.11)", () => {
    const comTravessao: string[] = [];
    for (const a of ARTIGOS) {
      for (const t of textosDe(a)) if (t.includes("—")) comTravessao.push(`${a.slug}: ${t}`);
    }
    expect(comTravessao).toEqual([]);
  });

  /**
   * SIGLA DE FÁBRICA NO TEXTO DE USUÁRIO é o risco mais provável desta frente (§11): o artigo sai
   * escrito na língua de quem construiu, e o operador lê "gate F12" sem ter como saber o que é. A
   * régua da §2.3 é explícita: "o Cadastro só abre depois que Auditoria e Exame fecham".
   */
  it("nenhum texto de usuário cita §A.x, número de fase, F-de-funcionalidade nem INT-x", () => {
    const proibidos = [/§\s*A\.\d/i, /\bINT-\d/i, /\bF\d{1,2}\b/, /\bFase\s+\d/i, /\bOST\b/i];
    const achados: string[] = [];
    for (const a of ARTIGOS) {
      for (const t of textosDe(a)) {
        for (const p of proibidos) if (p.test(t)) achados.push(`${a.slug}: ${t}`);
      }
    }
    expect(achados).toEqual([]);
  });

  it("título em title case (§A.24): toda palavra começa em maiúscula", () => {
    const fora: string[] = [];
    for (const a of ARTIGOS) {
      const palavras = a.titulo.split(/\s+/).filter((p) => p.length > 1);
      // Tolera o token que já carrega maiúscula no meio (iFractal, Ass.Click, eSocial).
      const minusculas = palavras.filter((p) => !/[A-ZÀ-Ü]/.test(p));
      if (minusculas.length > 0) fora.push(`${a.slug}: ${a.titulo}`);
    }
    expect(fora).toEqual([]);
  });
});

/**
 * ─ ARTIGO ⇄ ROTEIRO: O CRUZAMENTO PELO NOME DO ARQUIVO ─────────────────────────────────────────
 *
 * ┌─ POR QUE ESTA VARREDURA SÓ FOI POSSÍVEL DEPOIS DE `alvos` SAIR DO `Print` ───────────────────┐
 * │ Enquanto os `alvos` viviam nos DOIS lados, "todo print tem ao menos um alvo" era afirmável    │
 * │ sobre o artigo, e parecia suficiente. Era pior do que insuficiente: era ENGANOSA, porque o    │
 * │ motor lê o ROTEIRO, então um artigo com três alvos e um roteiro com um só passava no teste e   │
 * │ gerava a imagem com uma seta. Com `alvos` só na `Captura`, a asserção passa a ser sobre quem   │
 * │ governa, e a leitura do coordenador está certa: ela fica MELHOR, não menor.                    │
 * │                                                                                               │
 * │ E, casando os dois lados pelo `arquivo`, caem de graça os dois erros silenciosos que ninguém   │
 * │ tinha como ver antes. Os dois são caros e nenhum dos dois falha sozinho:                      │
 * │   . ARTIGO SEM CAPTURA: o passo reserva o espaço da imagem e nenhum roteiro a produz. O leitor │
 * │     vê o buraco tracejado para sempre, e o `ajuda:conferir` não acusa nada, porque não existe  │
 * │     alvo para deixar de resolver. É o defeito que só aparece na leitura, e a leitura é do      │
 * │     operador, não da fábrica.                                                                 │
 * │   . PNG ÓRFÃO: o roteiro captura uma imagem que nenhum artigo referencia. Custa o tempo de     │
 * │     captura, custa peso no repositório para sempre (§3.4: git guarda), passa pelo gate de PII  │
 * │     como qualquer outra, e ninguém nunca a vê.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESCRITA COMO VARREDURA, e os roteiros são lidos DO DISCO: o artigo 85 e o roteiro 85 entram
 * sozinhos, no dia em que forem escritos, sem ninguém acrescentar um caso aqui. Lista de slug
 * escrita à mão num teste de manutenção envelhece pelo mesmo motivo que o manual envelhece.
 */
describe("artigo ⇄ roteiro: o cruzamento pelo nome do arquivo", () => {
  type Par = { slug: string; roteiro: Roteiro };
  const roteiros: Par[] = [];

  beforeAll(async () => {
    const dir = path.join(RAIZ_REPO, "apps/frontend/src/ajuda/capturas");
    const nomes = readdirSync(dir)
      .filter((f) => f.endsWith(".roteiro.ts"))
      .map((f) => f.replace(/\.roteiro\.ts$/, ""));
    for (const nome of nomes) {
      // A extensão é obrigatória: o Vite só resolve import dinâmico com variável quando o padrão
      // casa um glob concreto, e sem `.ts` ele recusa com "Unknown variable dynamic import".
      const mod = (await import(`./capturas/${nome}.roteiro.ts`)) as { roteiro?: Roteiro };
      if (!mod.roteiro) throw new Error(`\`capturas/${nome}.roteiro.ts\` não exporta \`roteiro\`.`);
      roteiros.push({ slug: mod.roteiro.slug, roteiro: mod.roteiro });
    }
  });

  /** Os prints que os ARTIGOS declaram, como `slug/arquivo`. */
  const printsDosArtigos = (): string[] =>
    ARTIGOS.flatMap((a) =>
      a.passos.filter((p) => p.print).map((p) => `${a.slug}/${p.print!.arquivo}`),
    );

  /**
   * As imagens que os ROTEIROS produzem, como `slug/arquivo`.
   *
   * OS ROTEIROS DE PROVA DO MOTOR SAEM DA CONTA, e a exceção é DECLARADA em código
   * (`capturas/roteiros-de-prova.ts`), com o que ela é e o que ela não é. Ela não cobre roteiro cujo
   * artigo atrasou: esse continua vermelho, que é o defeito que esta varredura existe para pegar.
   */
  const capturasDosRoteiros = (): string[] =>
    roteiros
      .filter((r) => !ehRoteiroDeProvaDoMotor(r.slug))
      .flatMap((r) => r.roteiro.capturas.map((c) => `${r.slug}/${c.arquivo}`));

  it("existe roteiro para ler (a varredura não é vazia)", () => {
    expect(roteiros.length).toBeGreaterThan(0);
    expect(capturasDosRoteiros().length).toBeGreaterThan(0);
  });

  /**
   * A ASSERÇÃO QUE MUDOU DE LADO: o alvo é o que o motor desenha, e o motor lê a `Captura`. Captura
   * sem alvo produz um print sem seta nenhuma, que é uma foto de tela dentro de um passo que diz
   * "clique aqui".
   */
  it("toda `Captura` do roteiro tem arquivo, legenda e ao menos um ALVO", () => {
    const ruins: string[] = [];
    for (const { slug, roteiro } of roteiros) {
      for (const c of roteiro.capturas) {
        if (!c.arquivo?.trim() || !c.legenda?.trim() || (c.alvos ?? []).length === 0) {
          ruins.push(`${slug}/${c.arquivo || "(sem arquivo)"}`);
        }
      }
    }
    expect(ruins).toEqual([]);
  });

  it("todo alvo tem rótulo e um localizador (papel mais nome, ou seletor)", () => {
    const ruins: string[] = [];
    for (const { slug, roteiro } of roteiros) {
      for (const c of roteiro.capturas) {
        for (const alvo of c.alvos ?? []) {
          const temLocalizador = Boolean(alvo.papel ?? alvo.seletor);
          if (!alvo.texto?.trim() || !temLocalizador) ruins.push(`${slug}/${c.arquivo}`);
        }
      }
    }
    expect(ruins).toEqual([]);
  });

  it("PRINT DE ARTIGO SEM CAPTURA: nenhum passo reserva imagem que ninguém produz", () => {
    const produzidas = new Set(capturasDosRoteiros());
    const semCaptura = printsDosArtigos().filter((p) => !produzidas.has(p));
    expect(semCaptura).toEqual([]);
  });

  it("PNG ÓRFÃO: nenhuma captura produz imagem que artigo nenhum referencia", () => {
    const referenciadas = new Set(printsDosArtigos());
    const orfas = capturasDosRoteiros().filter((c) => !referenciadas.has(c));
    expect(orfas).toEqual([]);
  });

  /**
   * ROTEIRO SEM ARTIGO é a forma grosseira do PNG órfão, e vale ter linha própria porque a mensagem
   * é outra: não é uma imagem sobrando, é um roteiro inteiro capturando para ninguém. Um roteiro de
   * prova do motor cai aqui de propósito. Se ele tiver de existir sem artigo, a exceção precisa ser
   * DECLARADA em código e conferível, e não ficar implícita num arquivo que a varredura ignora.
   */
  it("todo roteiro pertence a um artigo que existe, fora os de prova DECLARADOS", () => {
    const existentes = new Set(ARTIGOS.map((a) => a.slug));
    const semArtigo = roteiros
      .filter((r) => !existentes.has(r.slug) && !ehRoteiroDeProvaDoMotor(r.slug))
      .map((r) => r.slug);
    expect(semArtigo).toEqual([]);
  });

  /**
   * A CONTRAPARTIDA DA EXCEÇÃO, para ela não virar gaveta: lista de prova é pequena por natureza, e
   * entrada que já tem artigo não é prova, é roteiro comum fugindo da varredura.
   */
  it("a lista de prova do motor é pequena, e nenhuma entrada dela já tem artigo", () => {
    expect(ROTEIROS_DE_PROVA_DO_MOTOR.length).toBeLessThanOrEqual(3);
    const existentes = new Set(ARTIGOS.map((a) => a.slug));
    expect(ROTEIROS_DE_PROVA_DO_MOTOR.filter((s) => existentes.has(s))).toEqual([]);
  });

  it("a `url` do roteiro é uma rota viva do App Router, e nunca a `/kit` antiga", () => {
    const reais = rotasDoApp();
    const mortas = roteiros
      .filter((r) => !reais.has(r.roteiro.url) || r.roteiro.url.startsWith("/kit"))
      .map((r) => `${r.slug} -> ${r.roteiro.url}`);
    expect(mortas).toEqual([]);
  });

  it("o roteiro captura a tela que o artigo ENSINA (a `url` está entre as `rotas` do artigo)", () => {
    const fora: string[] = [];
    for (const { slug, roteiro } of roteiros) {
      const artigo = ARTIGOS.find((a) => a.slug === slug);
      if (!artigo) continue; // já coberto pela asserção de roteiro sem artigo
      if (!artigo.rotas.includes(roteiro.url)) fora.push(`${slug}: ${roteiro.url}`);
    }
    expect(fora).toEqual([]);
  });

  it("duas capturas do mesmo roteiro não disputam o mesmo arquivo", () => {
    const colisoes: string[] = [];
    for (const { slug, roteiro } of roteiros) {
      const vistos = new Set<string>();
      for (const c of roteiro.capturas) {
        if (vistos.has(c.arquivo)) colisoes.push(`${slug}/${c.arquivo}`);
        vistos.add(c.arquivo);
      }
    }
    expect(colisoes).toEqual([]);
  });

  /**
   * ─ A GARANTIA SUBIU PARA O TIPO, E O TESTE QUE A AFIRMAVA SAIU DAQUI ──────────────────────────
   *
   * Aqui existiam duas asserções, "o print do ARTIGO não declara `preparo` nem `recorte`". Elas eram
   * a trava enquanto `Print` carregava os dois campos e `Captura = Print & { alvos }` os herdava: os
   * dois lados podiam declarar, quem o motor obedecia era o roteiro, e a cópia do artigo governava
   * nada. Agora `preparo` e `recorte` moram só na `Captura`, então declará-los no artigo NÃO COMPILA.
   *
   * TESTE QUE AFIRMA O QUE O COMPILADOR JÁ IMPEDE É RUÍDO, e ruído que envelhece: ele continuaria
   * verde para sempre, sem medir nada, e a próxima pessoa gastaria tempo entendendo por que ele
   * existe. A régua da casa é a de sempre: quando a mesma garantia pode morar no tipo ou no teste,
   * ela mora no tipo, e o teste cobre o que o tipo não alcança.
   *
   * A DIVISÃO QUE PASSOU A VALER, e é ela que impede o terceiro campo de repetir o erro: o ARTIGO
   * declara o que o LEITOR precisa saber (qual imagem, o que ela mostra); a CAPTURA declara o que o
   * MOTOR precisa fazer (onde as setas vão, que estado preparar, o que recortar).
   *
   * O QUE O TIPO NÃO PEGA, E POR ISSO CONTINUA MEDIDO ABAIXO: que o lado que governa esteja
   * POVOADO. `preparo` é opcional por necessidade (a primeira imagem é a tela como ela chega), então
   * nenhum tipo exige que a imagem do meio do wizard tenha preparo. Se ele faltar, a captura
   * acontece com a janela fechada e o print sai da tela errada, sem nada falhar. É o mesmo gênero de
   * defeito que o recorte que não acontece: o dano não é enquadramento feio, é conteúdo errado numa
   * imagem versionada que passou por todos os gates.
   */
  it("imagem que precisa de estado é preparada em ALGUM lado (roteiro ou captura)", () => {
    const semPreparoNenhum: string[] = [];
    for (const { slug, roteiro } of roteiros) {
      const temGeral = (roteiro.preparo ?? []).length > 0;
      for (const c of roteiro.capturas) {
        const temProprio = (c.preparo ?? []).length > 0;
        // Só a PRIMEIRA imagem de um roteiro pode prescindir de preparo: ela é a tela como ela chega.
        const primeira = roteiro.capturas[0]?.arquivo === c.arquivo;
        if (!temGeral && !temProprio && !primeira) semPreparoNenhum.push(`${slug}/${c.arquivo}`);
      }
    }
    expect(semPreparoNenhum).toEqual([]);
  });
});
