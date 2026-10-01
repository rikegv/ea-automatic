import { describe, expect, it } from "vitest";

/**
 * O DE/PARA DO VÍNCULO: `admissoes.tipo_contrato` (TEXTO LIVRE do EA) → `vinculo` (1 caractere da
 * lista fechada do GI).
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40 regra 2), em paralelo à construção, e NÃO
 * a partir do código. A régua aqui é a autorizada pelo diretor em 01/10/2026:
 *
 *     Temporário → 4 | Terceirizado, Interno, Fopag → 1 | Estágio → J | Jovem Aprendiz → H
 *
 * E as três travas que o requisito exige, nesta ordem de importância:
 *
 *  1. `ESTA. FOPAG` sai NULO. É ambíguo (Estágio? Fopag?), são 5 admissões na produção, e é EXATAMENTE
 *     o valor que um casamento aproximado (`includes`/`startsWith`) erraria CALADO. Ver a CHECAGEM DE
 *     MUTAÇÃO no fim do arquivo, que prova que este teste tem dente.
 *  2. valor VAZIO e valor DESCONHECIDO saem NULOS, nunca adivinhados.
 *  3. o que sai cabe em 1 caractere E pertence à lista fechada de 18 valores do contrato.
 *
 * §A.6: `tipo_contrato` não é PII (é classificação de contrato, não dado de pessoa). Nenhum CPF, nome
 * ou dado pessoal entra neste arquivo.
 *
 * ⚠️ ASSINATURA: quando este arquivo foi escrito, o de/para do vínculo NÃO EXISTIA como função
 * exportada. O resolvedor abaixo PROCURA a implementação nos lugares plausíveis e, não achando,
 * FALHA dizendo qual assinatura foi assumida (em vez de inventar uma e dar um vermelho mudo).
 */

// ── O resolvedor da implementação (some quando a construção fixar a assinatura) ──────────────────

/** A assinatura ASSUMIDA: função pura, texto livre entra, código de 1 caractere ou nulo sai. */
type MapearVinculo = (valor: string | null | undefined) => string | null;

const ASSINATURA_ASSUMIDA =
  "mapearVinculoGi(tipoContrato: string | null | undefined): string | null, " +
  "exportada de src/gi/gi-vinculo.ts (ou metodo `vinculo()` de GiDeParaService)";

/** Módulos onde a implementação pode ter nascido, na ordem de preferência. */
const MODULOS: readonly string[] = [
  "./gi-vinculo",
  "./gi-vinculo.service",
  "./gi-depara.service",
  "../domain/portal-dados-gi",
  "../domain/gi-vinculo",
];

/** Nomes de export (função pura) que o requisito admitiria. */
const NOMES_FUNCAO: readonly string[] = [
  "mapearVinculoGi",
  "mapearVinculo",
  "vinculoGi",
  "codigoVinculoGi",
  "deParaVinculo",
  "vinculoDoTipoContrato",
  "mapearTipoContratoParaVinculo",
];

/** Nomes de método de instância (quando o de/para virou serviço). */
const NOMES_METODO: readonly string[] = ["vinculo", "codigoVinculo", "mapearVinculo"];

interface Achado {
  onde: string;
  mapear: MapearVinculo;
}

let achadoMemo: Achado | null | undefined;

async function procurar(): Promise<Achado | null> {
  for (const modulo of MODULOS) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(modulo)) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const nome of NOMES_FUNCAO) {
      const v = mod[nome];
      if (typeof v === "function" && v.length <= 1) {
        return { onde: `${modulo}#${nome}`, mapear: v as MapearVinculo };
      }
    }
    // Classe/serviço: instancia com um ConfigService falso (todo `get` devolve vazio).
    for (const [nomeExport, v] of Object.entries(mod)) {
      if (typeof v !== "function" || !/^[A-Z]/.test(nomeExport)) continue;
      let inst: Record<string, unknown>;
      try {
        const Ctor = v as unknown as new (...args: unknown[]) => Record<string, unknown>;
        inst = new Ctor({ get: () => undefined });
      } catch {
        continue;
      }
      for (const metodo of NOMES_METODO) {
        const m = inst[metodo];
        if (typeof m === "function") {
          return {
            onde: `${modulo}#${nomeExport}.${metodo}()`,
            mapear: (valor) => (m as MapearVinculo).call(inst, valor),
          };
        }
      }
    }
  }
  return null;
}

async function mapear(valor: string | null | undefined): Promise<string | null> {
  if (achadoMemo === undefined) achadoMemo = await procurar();
  if (!achadoMemo) {
    throw new Error(
      `O DE/PARA DO VINCULO NAO FOI ENCONTRADO. Assinatura assumida pelo teste: ${ASSINATURA_ASSUMIDA}. ` +
        `Procurado em: ${MODULOS.join(", ")} com os nomes ${NOMES_FUNCAO.join("/")}.`,
    );
  }
  return achadoMemo.mapear(valor);
}

// ── O contrato: a lista fechada dos 18 valores de `vinculo` ─────────────────────────────────────

/** Copiado da `description` de `vinculo` em `TB_FuncionarioSelecaoAPI` (01/10/2026). */
const VINCULOS_DO_CONTRATO: readonly string[] = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "C", "D", "E", "F", "G", "H", "I", "J", "K",
];

// ── OS 12 VALORES MEDIDOS NA PRODUÇÃO EM 01/10/2026 (a tabela-guarda) ──────────────────────────

/**
 * A tabela é EXAUSTIVA sobre o medido, e o `esperado: null` é informação, não lacuna: ele AFIRMA que
 * o valor tem de sair vazio. Valor novo que aparecer na produção e não estiver aqui é LACUNA DE
 * TESTE (visível), e não código errado chegando na folha (invisível). É essa a troca que a tabela faz.
 */
const MEDIDOS: ReadonlyArray<{
  valor: string;
  admissoes: number;
  esperado: string | null;
  porque: string;
}> = [
  { valor: "Temporário", admissoes: 2389, esperado: "4", porque: "limpo; 4 = Temporário (Lei 6.019)" },
  { valor: "Terceirizado", admissoes: 212, esperado: "1", porque: "limpo; 1 = Contrato CLT" },
  { valor: "Fopag", admissoes: 204, esperado: "1", porque: "limpo; 1 = Contrato CLT" },
  { valor: "TEMP.", admissoes: 77, esperado: "4", porque: "sujeira da carga; normaliza para TEMPORARIO" },
  { valor: "", admissoes: 67, esperado: null, porque: "AUSENTE: nao se adivinha vinculo" },
  { valor: "Interno", admissoes: 29, esperado: "1", porque: "limpo; 1 = Contrato CLT" },
  { valor: "Jovem Aprendiz", admissoes: 12, esperado: "H", porque: "limpo; H = Menor Aprendiz 10.097" },
  { valor: "Estágio", admissoes: 12, esperado: "J", porque: "limpo; J = Estagiario Nova Lei 11.788" },
  { valor: "FOPAG", admissoes: 7, esperado: "1", porque: "so a caixa difere" },
  {
    valor: "ESTA. FOPAG",
    admissoes: 5,
    esperado: null,
    porque: "AMBIGUO (Estagio? Fopag?): a fabrica NAO decide regra de folha",
  },
  { valor: "APREN.", admissoes: 1, esperado: "H", porque: "sujeira da carga; normaliza para APRENDIZ" },
  { valor: "TERC.", admissoes: 1, esperado: "1", porque: "sujeira da carga; normaliza para TERCEIRIZADO" },
];

describe("de/para do vinculo: a TABELA-GUARDA dos 12 valores medidos na producao", () => {
  it("a tabela cobre os 12 valores medidos, e a soma bate com as 3016 admissoes", () => {
    // Guarda da própria tabela: valor somado errado aqui faria o teste medir outra base.
    expect(MEDIDOS).toHaveLength(12);
    expect(new Set(MEDIDOS.map((m) => m.valor)).size).toBe(12);
    expect(MEDIDOS.reduce((s, m) => s + m.admissoes, 0)).toBe(3016);
  });

  for (const m of MEDIDOS) {
    const rotulo = m.valor === "" ? "(vazio)" : m.valor;
    it(`"${rotulo}" (${m.admissoes} adm) -> ${m.esperado ?? "NULO"} :: ${m.porque}`, async () => {
      expect(await mapear(m.valor)).toBe(m.esperado);
    });
  }

  it("todo codigo emitido pela tabela pertence a lista FECHADA de 18 valores do contrato", async () => {
    for (const m of MEDIDOS) {
      const saida = await mapear(m.valor);
      if (saida === null) continue;
      expect(VINCULOS_DO_CONTRATO, `valor ${m.valor}`).toContain(saida);
    }
  });

  it("todo codigo emitido cabe em 1 caractere (maxLength do contrato)", async () => {
    for (const m of MEDIDOS) {
      const saida = await mapear(m.valor);
      if (saida === null) continue;
      expect(saida.length, `valor ${m.valor} saiu "${saida}"`).toBe(1);
    }
  });

  it("os quatro codigos autorizados sao exatamente 4, 1, J e H, e nada mais", async () => {
    // Fecha o conjunto da SAÍDA: um código a mais (um `7`, por exemplo) e este teste denuncia. A
    // dúvida do `7` (CLT Prazo Determinado) é pergunta aberta ao diretor, NÃO decisão da fábrica.
    const emitidos = new Set<string>();
    for (const m of MEDIDOS) {
      const saida = await mapear(m.valor);
      if (saida !== null) emitidos.add(saida);
    }
    expect([...emitidos].sort()).toEqual(["1", "4", "H", "J"]);
  });
});

// ── O VALOR AMBÍGUO: o teste mais importante do arquivo ────────────────────────────────────────

describe("de/para do vinculo: ESTA. FOPAG e AMBIGUO e sai NULO", () => {
  /**
   * POR QUE ESTE É O TESTE MAIS IMPORTANTE: `ESTA. FOPAG` contém a palavra FOPAG inteira e o prefixo
   * de ESTÁGIO. Qualquer casamento aproximado o resolve com confiança total e resposta errada, e o
   * erro vai para a FOLHA de 5 pessoas sem nada falhar em lugar nenhum. A fábrica não decide regra de
   * folha (§A.0): vai como pergunta ao diretor, e até a resposta o campo fica VAZIO.
   */
  it("ESTA. FOPAG sai NULO", async () => {
    expect(await mapear("ESTA. FOPAG")).toBeNull();
  });

  it("nao casa com Fopag nem com Estagio, em nenhuma variacao de caixa ou espaco", async () => {
    for (const variacao of ["ESTA. FOPAG", "esta. fopag", "  ESTA.   FOPAG  ", "Esta. Fopag"]) {
      expect(await mapear(variacao), `variacao "${variacao}"`).toBeNull();
    }
  });

  it("e os dois valores LIMPOS que ele parece seguem resolvendo normalmente", async () => {
    // Guarda contra o conserto grosseiro (nulificar tudo que contenha FOPAG para fazer o teste de
    // cima passar): `Fopag` e `Estágio` continuam tendo de resolver.
    expect(await mapear("Fopag")).toBe("1");
    expect(await mapear("Estágio")).toBe("J");
  });
});

// ── A NORMALIZAÇÃO, valor por valor ───────────────────────────────────────────────────────────

describe("de/para do vinculo: normalizacao (caixa, acento, ponto final, espaco)", () => {
  it("caixa nao importa", async () => {
    for (const v of ["TEMPORÁRIO", "temporário", "TeMpOrÁrIo"]) {
      expect(await mapear(v), v).toBe("4");
    }
  });

  it("acento nao importa", async () => {
    expect(await mapear("TEMPORARIO")).toBe("4");
    expect(await mapear("Estagio")).toBe("J");
  });

  it("ponto final e espaco nas BORDAS nao importam", async () => {
    expect(await mapear("  TEMP.  ")).toBe("4");
    expect(await mapear("TERC.")).toBe("1");
    expect(await mapear("APREN.")).toBe("H");
    expect(await mapear(" Jovem Aprendiz ")).toBe("H");
  });

  it("espaco INTERNO em excesso e colapsado", async () => {
    /**
     * ⚠️ ESTE É O ÚNICO ITEM DA NORMALIZAÇÃO PEDIDA NO REQUISITO QUE NÃO SE APOIA EM DADO MEDIDO:
     * nenhum dos 12 valores da produção tem espaço duplo interno. Ele está aqui porque o requisito
     * lista "espaço colapsado" entre as quatro normalizações exigidas, e porque a próxima grafia pode
     * vir do Pandapé ou de uma importação nova, onde ninguém controla o espaçamento.
     *
     * Se este teste for o único vermelho desta casa, o veredito é do coordenador: ou a normalização
     * ganha o `replace(/\s+/g, " ")`, ou o requisito perde este item por escrito. O que NÃO serve é
     * apagar o teste, porque aí o item some sem decisão.
     */
    expect(await mapear("Jovem   Aprendiz")).toBe("H");
  });

  it("as quatro abreviacoes da carga casam com o valor limpo correspondente", async () => {
    expect(await mapear("TEMP.")).toBe(await mapear("Temporário"));
    expect(await mapear("TERC.")).toBe(await mapear("Terceirizado"));
    expect(await mapear("APREN.")).toBe(await mapear("Jovem Aprendiz"));
    expect(await mapear("FOPAG")).toBe(await mapear("Fopag"));
  });
});

// ── O FAIL-CLOSED do valor que a tabela não conhece ───────────────────────────────────────────

describe("de/para do vinculo: ausente e desconhecido saem NULOS, nunca adivinhados", () => {
  it("vazio, espaco, nulo e undefined saem NULOS", async () => {
    for (const v of ["", "   ", null, undefined]) {
      expect(await mapear(v), `entrada ${JSON.stringify(v)}`).toBeNull();
    }
  });

  it("valor DESCONHECIDO sai NULO, nao o default do primeiro item da tabela", async () => {
    // "PJ" e "Cooperado" não existem na produção hoje e não estão autorizados. O dia em que
    // aparecerem, o certo é o campo ficar vazio e alguém decidir, não o de/para chutar CLT.
    for (const v of ["PJ", "Cooperado", "Autonomo", "CLT", "Efetivo", "4", "1"]) {
      expect(await mapear(v), `entrada "${v}"`).toBeNull();
    }
  });

  it("valor PARCIAL nao casa: nao e prefixo, nao e substring", async () => {
    /**
     * Estes três são a prova de que o casamento é por valor NORMALIZADO INTEIRO, e não aproximado. Um
     * de/para por `includes` devolveria código para os três (ver a checagem de mutação).
     *
     * CORREÇÃO DO PRÓPRIO TESTE (01/10/2026): `"TEMP"` estava nesta lista e NÃO pertence a ela. Ele
     * não é prefixo acidental: é CHAVE EXATA da tabela, porque a normalização tira o ponto final da
     * abreviação e `"TEMP."` e `"TEMP"` colapsam na mesma chave. O teste estava errado, não o produto,
     * e o certo era mover o valor para o teste abaixo, que é onde ele prova a coisa certa.
     */
    for (const v of ["TEMPORARIO DE OBRA", "FOPAG ESTAGIO", "APRENDIZ JOVEM DE 2026"]) {
      expect(await mapear(v), `entrada "${v}"`).toBeNull();
    }
  });

  it("as abreviacoes SEM o ponto final tambem casam (a mesma chave normalizada)", async () => {
    expect(await mapear("TEMP")).toBe("4");
    expect(await mapear("TERC")).toBe("1");
    expect(await mapear("APREN")).toBe("H");
    expect(await mapear("ESTA")).toBe("J");
    expect(await mapear("INTER")).toBe("1");
  });
});

// ── CHECAGEM DE MUTAÇÃO: o teste do ESTA. FOPAG tem dente? ────────────────────────────────────

describe("checagem de mutacao: um casamento por includes MORRE neste arquivo", () => {
  /**
   * O MUTANTE, escrito aqui dentro de propósito: é a implementação ingênua e plausível que alguém
   * escreveria de boa-fé para "resolver a sujeira da carga de uma vez", e é o defeito que esta casa
   * existe para pegar. Ele NÃO toca o produto: é um boneco local.
   */
  function mutanteIncludes(valor: string | null | undefined): string | null {
    const t = (valor ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .trim();
    if (!t) return null;
    if (t.includes("TEMP")) return "4";
    if (t.includes("TERC")) return "1";
    if (t.includes("FOPAG")) return "1";
    if (t.includes("INTERN")) return "1";
    if (t.includes("ESTA")) return "J";
    if (t.includes("APREN")) return "H";
    return null;
  }

  /** O mesmo mutante com a ordem invertida, porque a ordem das cláusulas muda a resposta errada. */
  function mutanteIncludesEstagioPrimeiro(valor: string | null | undefined): string | null {
    const t = (valor ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .trim();
    if (!t) return null;
    if (t.includes("ESTA")) return "J";
    if (t.includes("FOPAG")) return "1";
    if (t.includes("TEMP")) return "4";
    if (t.includes("TERC")) return "1";
    if (t.includes("APREN")) return "H";
    if (t.includes("INTERN")) return "1";
    return null;
  }

  it("o mutante passaria nos 10 valores NAO-ambiguos: e por isso que ele e perigoso", () => {
    const naoAmbiguos = MEDIDOS.filter((m) => m.valor !== "ESTA. FOPAG");
    const divergentes = naoAmbiguos
      .filter((m) => mutanteIncludes(m.valor) !== m.esperado)
      .map((m) => m.valor);
    // Se esta lista fosse grande, o mutante seria óbvio e nenhum teste precisaria pegá-lo. Ela é
    // VAZIA: o `includes` acerta 11 dos 12 valores da produção, o que é exatamente o que faz um
    // defeito assim sobreviver a uma revisão de código.
    expect(divergentes).toEqual([]);
  });

  it("MAS o mutante MORRE no ESTA. FOPAG, nas duas ordens de clausula", () => {
    // RESULTADO DA CHECAGEM: o teste do valor ambíguo FALHARIA com o mutante. Ele tem dente.
    expect(mutanteIncludes("ESTA. FOPAG")).toBe("1"); // erraria para Fopag (CLT)
    expect(mutanteIncludesEstagioPrimeiro("ESTA. FOPAG")).toBe("J"); // erraria para Estágio
    // Os dois são NÃO-NULOS, e o requisito exige NULO: o `expect(...).toBeNull()` do describe
    // anterior reprova os dois. Inverter a ordem das cláusulas só troca de erro, não conserta.
    expect(mutanteIncludes("ESTA. FOPAG")).not.toBeNull();
    expect(mutanteIncludesEstagioPrimeiro("ESTA. FOPAG")).not.toBeNull();
  });

  it("o mutante tambem morre nos valores PARCIAIS, segunda rede da mesma armadilha", () => {
    // "TEMPORARIO DE OBRA" e "FOPAG ESTAGIO" são valores que ainda não existem na produção. O
    // mutante os resolveria com confiança; o requisito manda deixar vazio.
    expect(mutanteIncludes("TEMPORARIO DE OBRA")).toBe("4");
    expect(mutanteIncludes("FOPAG ESTAGIO")).toBe("1");
    expect(mutanteIncludesEstagioPrimeiro("FOPAG ESTAGIO")).toBe("J");
  });
});
