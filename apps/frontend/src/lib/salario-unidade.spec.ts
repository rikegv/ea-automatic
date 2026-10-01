import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exigeJornada,
  jornadaImpedeSalvar,
  jornadaParaCampo,
  jornadaParaNumero,
  maskJornada,
  OPCOES_SALARIO_UNIDADE,
  problemaDaJornada,
  ROTULO_SALARIO_UNIDADE,
  SALARIO_UNIDADES,
  TETO_JORNADA,
} from "./salario-unidade";

/**
 * A UNIDADE DO SALÁRIO NA TELA, e a prova de que ela NÃO divergiu do servidor.
 *
 * A frente existe porque 7 admissões vivas carregavam salário de HORA (9,34 e 10,90) num campo que o
 * GI lê como MENSAL por default. O risco que ESTE arquivo cobre é o seguinte: a tela oferecer uma
 * unidade que o servidor recusa, ou deixar de oferecer uma que ele aceita. Nos dois casos o time
 * declara e acha que declarou.
 */

const FONTE_BACKEND = join(
  __dirname,
  "..",
  "..",
  "..",
  "backend",
  "src",
  "domain",
  "portal-dados-gi.ts",
);

/**
 * Lê `SALARIO_UNIDADES_EA` do backend SEM importar o módulo (o domínio de lá arrasta dependências de
 * servidor). Os comentários são removidos ANTES da busca: comentário que fala do assunto já fez
 * varredura de fonte mentir neste repositório, nos DOIS sentidos.
 */
function unidadesDoBackend(): string[] {
  const cru = readFileSync(FONTE_BACKEND, "utf8");
  const semComentario = cru.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const m = /SALARIO_UNIDADES_EA[^=]*=\s*\[([^\]]*)\]/.exec(semComentario);
  if (!m) throw new Error("não achei SALARIO_UNIDADES_EA no domínio do backend");
  return [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
}

describe("o vocabulário da unidade é o MESMO do servidor", () => {
  it("são SETE, e exatamente as sete do backend, na mesma ordem", () => {
    const backend = unidadesDoBackend();
    expect(backend).toHaveLength(7);
    expect([...SALARIO_UNIDADES]).toEqual(backend);
  });

  it("toda unidade tem rótulo, e nenhum rótulo tem travessão (§A.11)", () => {
    for (const u of SALARIO_UNIDADES) {
      const r = ROTULO_SALARIO_UNIDADE[u];
      expect(r, u).toBeTruthy();
      expect(r).not.toContain("—");
    }
  });

  it("o rótulo é TAG, então começa com maiúscula (§A.24)", () => {
    for (const u of SALARIO_UNIDADES) {
      expect(ROTULO_SALARIO_UNIDADE[u][0]).toBe(ROTULO_SALARIO_UNIDADE[u][0].toUpperCase());
    }
  });

  it("as opções do Select cobrem as sete, e o `value` é o vocabulário do EA (nunca a letra do GI)", () => {
    expect(OPCOES_SALARIO_UNIDADE.map((o) => o.value)).toEqual([...SALARIO_UNIDADES]);
    for (const o of OPCOES_SALARIO_UNIDADE) expect(o.value).not.toHaveLength(1);
  });
});

describe("só HORA pede jornada", () => {
  it("HORA pede, as outras seis não, e o não declarado também não", () => {
    expect(exigeJornada("HORA")).toBe(true);
    for (const u of SALARIO_UNIDADES.filter((x) => x !== "HORA")) {
      expect(exigeJornada(u), u).toBe(false);
    }
    expect(exigeJornada(null)).toBe(false);
    expect(exigeJornada("")).toBe(false);
  });
});

describe("a régua da jornada: as duas ou nenhuma, e nunca zero", () => {
  it("unidade que não é HORA nunca reclama, mesmo com os campos vazios", () => {
    expect(problemaDaJornada("MENSAL", "", "")).toBeNull();
    expect(problemaDaJornada(null, "", "")).toBeNull();
  });

  it("HORA com as duas preenchidas passa", () => {
    expect(problemaDaJornada("HORA", "220", "44")).toBeNull();
    expect(problemaDaJornada("HORA", "220,00", "44,00")).toBeNull();
  });

  it("HORA com as duas vazias reclama das duas", () => {
    const f = problemaDaJornada("HORA", "", "");
    expect(f).toBeTruthy();
    expect(f).toContain("mês");
    expect(f).toContain("semana");
  });

  it("UMA só é recusada, e a frase diz QUAL falta", () => {
    expect(problemaDaJornada("HORA", "220", "")).toContain("semanal");
    expect(problemaDaJornada("HORA", "", "44")).toContain("mensal");
  });

  it("ZERO é recusado como ausência, porque zero É o default do fornecedor", () => {
    expect(problemaDaJornada("HORA", "0", "44")).toBeTruthy();
    expect(problemaDaJornada("HORA", "220", "0")).toBeTruthy();
    expect(problemaDaJornada("HORA", "0,00", "0,00")).toBeTruthy();
  });

  it("acima do teto FÍSICO é recusado (espelha o CHECK da 0140)", () => {
    expect(problemaDaJornada("HORA", String(TETO_JORNADA.mes + 1), "44")).toContain("mensal");
    expect(problemaDaJornada("HORA", "220", String(TETO_JORNADA.sem + 1))).toContain("semanal");
    expect(problemaDaJornada("HORA", String(TETO_JORNADA.mes), String(TETO_JORNADA.sem))).toBeNull();
  });

  it("nenhuma frase tem travessão (§A.11)", () => {
    const frases = [
      problemaDaJornada("HORA", "", ""),
      problemaDaJornada("HORA", "220", ""),
      problemaDaJornada("HORA", "", "44"),
      problemaDaJornada("HORA", "99999", "44"),
      problemaDaJornada("HORA", "220", "9999"),
    ];
    for (const f of frases) expect(f ?? "").not.toContain("—");
  });
});

describe("o campo de jornada não repete o bug do salário com ponto", () => {
  it("o numeric do banco chega em pt-BR no campo", () => {
    expect(jornadaParaCampo("220.00")).toBe("220,00");
    expect(jornadaParaCampo(44)).toBe("44,00");
  });

  it("vazio, nulo e zero viram campo vazio (zero não é jornada declarada)", () => {
    expect(jornadaParaCampo(null)).toBe("");
    expect(jornadaParaCampo(undefined)).toBe("");
    expect(jornadaParaCampo("")).toBe("");
    expect(jornadaParaCampo("0.00")).toBe("");
  });

  it("IDEMPOTÊNCIA: abrir, salvar e reabrir não muda o valor", () => {
    const doBanco = "220.00";
    const noCampo = jornadaParaCampo(doBanco);
    const salvo = jornadaParaNumero(noCampo);
    expect(salvo).toBe(doBanco);
    expect(jornadaParaCampo(salvo)).toBe(noCampo);
  });

  it("a máscara aceita hora inteira sem virar centavo (o contrário do salário)", () => {
    expect(maskJornada("220")).toBe("220");
    expect(maskJornada("44")).toBe("44");
    expect(maskJornada("1a2b")).toBe("12");
    expect(maskJornada("220,005")).toBe("220,00");
    expect(maskJornada("")).toBe("");
  });

  it("campo vazio vira omissão, nunca zero no corpo", () => {
    expect(jornadaParaNumero("")).toBeUndefined();
    expect(jornadaParaNumero("   ")).toBeUndefined();
    expect(jornadaParaNumero("abc")).toBeUndefined();
  });
});

describe("o que IMPEDE salvar respeita a regra 5 (não-bloqueio)", () => {
  it("HORA com as duas vazias é PENDÊNCIA, não trava: a tela avisa e o salvamento segue", () => {
    expect(problemaDaJornada("HORA", "", "")).toBeTruthy();
    expect(jornadaImpedeSalvar("HORA", "", "")).toBe(false);
  });

  it("uma hora só TRAVA: é contradição declarada, não campo esperando preenchimento", () => {
    expect(jornadaImpedeSalvar("HORA", "220", "")).toBe(true);
    expect(jornadaImpedeSalvar("HORA", "", "44")).toBe(true);
  });

  it("zero digitado TRAVA, porque zero é o default do fornecedor", () => {
    expect(jornadaImpedeSalvar("HORA", "0", "44")).toBe(true);
  });

  it("acima do teto TRAVA antes do CHECK do banco devolver erro de Postgres", () => {
    expect(jornadaImpedeSalvar("HORA", "9999", "44")).toBe(true);
  });

  it("jornada completa não trava, e unidade que não é HORA nunca trava", () => {
    expect(jornadaImpedeSalvar("HORA", "220", "44")).toBe(false);
    expect(jornadaImpedeSalvar("MENSAL", "", "")).toBe(false);
    expect(jornadaImpedeSalvar(null, "220", "")).toBe(false);
  });
});
