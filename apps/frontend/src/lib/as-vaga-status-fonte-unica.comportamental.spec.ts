import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { VAGA_STATUS_SEMENTE, type VagaStatusItem } from "@ea/shared-types";

/**
 * ─ UMA FONTE SÓ: A TELA NUNCA OFERECE UM STATUS QUE O BACKEND RECUSA (B2, item 7) ───────────────
 *
 * ┌─ O DEFEITO VIVO QUE ESTA ONDA MATA, e ele está no ar hoje ──────────────────────────────────┐
 * │ O seletor de publicação da vaga oferece "Entregue" (`VAGA_STATUS_PUBLICACAO` monta a lista    │
 * │ EXCLUINDO `RASCUNHO`, `FECHADA` e `CANCELADA`, o que deixa `ENTREGUE` dentro), e o backend    │
 * │ recusa com 400 (`travaStatusDaTrilha` aceita só `RASCUNHO` e `ABERTA`). São DUAS listas       │
 * │ escritas à mão, cada uma pela sua régua, e elas discordam: quem clica na opção que a própria  │
 * │ tela ofereceu recebe um erro dizendo que não pode.                                            │
 * │                                                                                              │
 * │ COM O CATÁLOGO É UMA FONTE SÓ: `da_trilha` responde "a trilha de abertura pode gravar este    │
 * │ status?", e as duas pontas leem a MESMA coluna. Este arquivo é o que impede a segunda lista    │
 * │ de renascer.                                                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E O ITEM 4: OS QUATRO FLAGS RESPONDEM PERGUNTAS DIFERENTES ────────────────────────────────┐
 * │ Hoje `encerra` e `recebeCandidato` coincidem nos mesmos três códigos, e a coincidência é      │
 * │ ARMADILHA: um "Stand By" plausível é `recebeCandidato: false` (a vaga pausada não capta gente │
 * │ nova) E `encerra: false` (a vaga continua viva). Quem trocar um pelo outro numa consulta faz  │
 * │ uma vaga PAUSADA ser tratada como TERMINADA: contagem congelada, contador de dias parado, e   │
 * │ na retenção o vínculo daquela pessoa com a vaga dado por encerrado (§A.6).                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2), então nada aqui afirma nome de arquivo nem de função: a
 * busca é por comportamento, e a falha diz o que foi procurado.
 */

const RAIZ_FRONT = new URL("../", import.meta.url).pathname; // apps/frontend/src
const RAIZ_BACK = join(RAIZ_FRONT, "..", "..", "..", "apps", "backend", "src");

function fontes(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next") continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) achados.push(...fontes(caminho));
    else if (/\.tsx?$/.test(entrada) && !entrada.includes(".spec.")) achados.push(caminho);
  }
  return achados;
}

/** Um catálogo de sonda: a semente de hoje mais duas linhas que separam os flags que coincidem. */
const STAND_BY: VagaStatusItem = {
  codigo: "STAND_BY",
  rotulo: "Stand By",
  ordem: 6,
  tom: "wn",
  ativo: true,
  papel: "LIVRE",
  encerra: false,
  recebeCandidato: false,
  daTrilha: false,
  movivelManualmente: true,
};

/** Um LIVRE que a trilha PODE gravar: é ele que prova que a lista vem do catálogo, e não de um `if`. */
const EM_PREPARACAO: VagaStatusItem = {
  ...STAND_BY,
  codigo: "EM_PREPARACAO",
  rotulo: "Em Preparação",
  ordem: 7,
  recebeCandidato: true,
  daTrilha: true,
};

/** Um da trilha, porém INATIVO: o diretor tirou de circulação, e a tela para de oferecer. */
const APOSENTADO: VagaStatusItem = {
  ...EM_PREPARACAO,
  codigo: "APOSENTADO",
  rotulo: "Aposentado",
  ordem: 8,
  ativo: false,
};

const CATALOGO: VagaStatusItem[] = [...VAGA_STATUS_SEMENTE, STAND_BY, EM_PREPARACAO, APOSENTADO];

type Exportado = { modulo: string; nome: string; valor: unknown };

const exportados: Exportado[] = [];
const falhasDeImport: string[] = [];

beforeAll(async () => {
  const candidatos = fontes(join(RAIZ_FRONT, "lib")).filter((c) => {
    const src = readFileSync(c, "utf8");
    return /daTrilha|VagaStatusItem|vagaEncerrada|recebeCandidato/.test(src);
  });
  for (const caminho of candidatos) {
    try {
      const mod = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
      for (const [nome, valor] of Object.entries(mod)) {
        exportados.push({ modulo: caminho.replace(RAIZ_FRONT, ""), nome, valor });
      }
    } catch (e) {
      falhasDeImport.push(`${caminho.replace(RAIZ_FRONT, "")}: ${(e as Error).message}`);
    }
  }
});

/** Chama a função na primeira forma que produzir a resposta conhecida, e reusa essa forma. */
async function resolverChamada<T>(
  candidatos: Exportado[],
  caso: { entrada: [string, VagaStatusItem]; esperado: T },
): Promise<(codigo: string, item: VagaStatusItem) => Promise<unknown>> {
  const formas = [
    (f: (...a: unknown[]) => unknown) => (c: string, _i: VagaStatusItem) => f(c, CATALOGO) as unknown,
    (f: (...a: unknown[]) => unknown) => (_c: string, i: VagaStatusItem) => f(i) as unknown,
    (f: (...a: unknown[]) => unknown) => (c: string, _i: VagaStatusItem) => f(CATALOGO, c) as unknown,
    (f: (...a: unknown[]) => unknown) => (c: string, _i: VagaStatusItem) => f(c) as unknown,
  ];
  const tentativas: string[] = [];
  for (const alvo of candidatos) {
    if (typeof alvo.valor !== "function") continue;
    for (const forma of formas) {
      try {
        const chamar = forma(alvo.valor as (...a: unknown[]) => unknown);
        const r = await chamar(caso.entrada[0], caso.entrada[1]);
        if (r === caso.esperado) return async (c, i) => chamar(c, i);
        tentativas.push(`${alvo.nome} devolveu ${JSON.stringify(r)}`);
      } catch (e) {
        tentativas.push(`${alvo.nome} lançou ${(e as Error).message}`);
      }
    }
  }
  throw new Error(
    `Nenhuma função respondeu ao caso conhecido. Candidatas: ${candidatos.map((c) => `${c.modulo}:${c.nome}`).join(", ") || "nenhuma"}. Tentativas: ${tentativas.join(" | ")}`,
  );
}

// ── 1. O SELETOR DE PUBLICAÇÃO SAI DO `daTrilha` ────────────────────────────

/** A lista que a tela OFERECE na publicação, seja ela função do catálogo ou constante derivada. */
function ofertaDePublicacao(): string[] {
  // O NOME É DE QUEM CONSTRÓI: `...PUBLICACAO`, `statusDaTrilha`, `opcoesDeAbertura`. O que se
  // procura é a LISTA que a tela oferece, e a falha abaixo diz o que foi encontrado no lugar.
  const candidatos = exportados.filter((e) => /public|trilha|abertura/i.test(e.nome));
  const codigos = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    return v.map((x) => (typeof x === "string" ? x : ((x as { codigo?: string })?.codigo ?? ""))).filter(Boolean);
  };
  for (const alvo of candidatos) {
    if (typeof alvo.valor === "function") {
      try {
        const r = codigos((alvo.valor as (c: unknown) => unknown)(CATALOGO));
        if (r) return r;
      } catch {
        /* a próxima candidata */
      }
      continue;
    }
    const r = codigos(alvo.valor);
    if (r) return r;
  }
  throw new Error(
    `Nada exporta a lista de status oferecida na publicação. Exports vistos: ${exportados.map((e) => e.nome).join(", ") || "nenhum"}. Falhas de import: ${falhasDeImport.join(" | ") || "nenhuma"}`,
  );
}

describe("a tela nunca oferece um status que o backend recusa", () => {
  it("a lista de publicação existe e é montada a partir do catálogo", () => {
    expect(ofertaDePublicacao().length).toBeGreaterThan(0);
  });

  /** O defeito vivo: hoje "Entregue" aparece no seletor e o backend devolve 400. */
  it("não oferece ENTREGUE, que a trilha de abertura não grava", () => {
    expect(ofertaDePublicacao()).not.toContain("ENTREGUE");
  });

  it("não oferece nenhum status que encerra a vaga", () => {
    for (const s of CATALOGO.filter((x) => x.encerra)) {
      expect(ofertaDePublicacao(), `${s.codigo} encerra a vaga`).not.toContain(s.codigo);
    }
  });

  it("oferece ABERTA, que é o gesto de publicar", () => {
    expect(ofertaDePublicacao()).toContain("ABERTA");
  });

  /**
   * A DERIVAÇÃO É O REQUISITO, e não a lista de hoje: um status LIVRE que o diretor marque como
   * `da_trilha` entra na tela SOZINHO. Uma lista escrita à mão faria status novo nascer invisível,
   * que é o mesmo defeito com o sinal trocado.
   */
  it("oferece um status LIVRE novo marcado `daTrilha`, sem ninguém editar a tela", () => {
    expect(ofertaDePublicacao()).toContain("EM_PREPARACAO");
  });

  it("não oferece o status `daTrilha` que está INATIVO", () => {
    expect(ofertaDePublicacao()).not.toContain("APOSENTADO");
  });

  it("tudo que ela oferece é `ativo` e `daTrilha` no catálogo", () => {
    const permitidos = CATALOGO.filter((s) => s.ativo && s.daTrilha).map((s) => s.codigo);
    for (const oferecido of ofertaDePublicacao()) {
      expect(permitidos, `a tela oferece ${oferecido}, que o backend recusa`).toContain(oferecido);
    }
  });
});

describe("o outro lado da mesma fonte: o backend pergunta ao catálogo", () => {
  const backend = () =>
    [join(RAIZ_BACK, "as", "vagas", "vagas.service.ts"), join(RAIZ_BACK, "domain", "vaga.ts")]
      .map((c) => readFileSync(c, "utf8"))
      .join("\n");

  it("a régua da trilha vem do catálogo (`daTrilha`), e não de uma lista digitada", () => {
    expect(backend()).toMatch(/daTrilha|da_trilha/);
  });

  /**
   * A LISTA À MÃO É A SEGUNDA FONTE, e é ela que produz a discordância que este arquivo mede. Ela
   * pode continuar existindo como TIPO, mas não como régua: quem decide é a coluna.
   */
  it("a lista fixa `[\"RASCUNHO\", \"ABERTA\"]` não decide mais quem publica", () => {
    const trecho = backend().replace(/\s+/g, " ");
    const literal = /VAGA_STATUS_DA_TRILHA\s*=\s*\[\s*"RASCUNHO"\s*,\s*"ABERTA"\s*\]/;
    expect(
      literal.test(trecho),
      "enquanto esta lista for a régua, a tela e o backend continuam sendo duas fontes",
    ).toBe(false);
  });
});

// ── 2. OS FLAGS NÃO SE CONFUNDEM ────────────────────────────────────────────

describe("`encerra` e `recebeCandidato` respondem perguntas diferentes", () => {
  it("nenhuma lista fixa de encerrados sobrevive no frontend", () => {
    const infratores = fontes(RAIZ_FRONT).filter((c) =>
      /\[\s*"ENTREGUE"\s*,\s*"FECHADA"\s*,\s*"CANCELADA"\s*\]/.test(readFileSync(c, "utf8")),
    );
    expect(
      infratores.map((c) => c.replace(RAIZ_FRONT, "")),
      "a lista dos três encerrados escrita à mão é a cópia que diverge do catálogo no primeiro cadastro do diretor",
    ).toEqual([]);
  });

  it("a vaga PAUSADA não é vaga TERMINADA (Stand By: não recebe, não encerra)", async () => {
    const encerrada = await resolverChamada(
      exportados.filter((e) => /encerrad/i.test(e.nome)),
      { entrada: ["FECHADA", VAGA_STATUS_SEMENTE.find((s) => s.codigo === "FECHADA") as VagaStatusItem], esperado: true },
    );
    expect(
      await encerrada("STAND_BY", STAND_BY),
      "tratar `recebeCandidato: false` como encerramento congela a contagem de uma vaga viva",
    ).toBe(false);
  });

  it("a vaga PAUSADA também não recebe candidato novo", async () => {
    const recebe = await resolverChamada(
      exportados.filter((e) => /recebe/i.test(e.nome)),
      { entrada: ["ABERTA", VAGA_STATUS_SEMENTE.find((s) => s.codigo === "ABERTA") as VagaStatusItem], esperado: true },
    );
    expect(
      await recebe("STAND_BY", STAND_BY),
      "tratar `encerra: false` como `recebeCandidato` deixa entrar gente numa vaga pausada",
    ).toBe(false);
  });
});
