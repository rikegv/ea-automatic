import { describe, expect, it } from "vitest";
import {
  VAGA_OBRIGATORIOS,
  textoPendencia,
  vagaPendencias,
  type VagaCamposObrigatorios,
  type VagaPendencia,
} from "@ea/shared-types";

/**
 * ─ ONDA D: CLIENTE E PREVISÃO DE ENTREGA VIRAM OBRIGATÓRIOS PARA PUBLICAR ──────────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CÓDIGO (§A.38/§A.40 regra 2), por um agente que NÃO é o
 * autor da implementação. Nada aqui foi derivado de ler o que a construção fez: os valores exatos
 * (rótulo, artigo, passo, âncora) vêm da OST, e é por isso que eles estão escritos À MÃO abaixo.
 *
 * ┌─ O PONTO CEGO QUE ESTE ARQUIVO EXISTE PARA NÃO REPETIR (registro de 11/09) ─────────────────┐
 * │ TESTE DERIVADO DA CONSTANTE NÃO REPROVA QUEM APAGA UMA ENTRADA DELA. Um laço sobre           │
 * │ `VAGA_OBRIGATORIOS` ("para cada obrigatório, a régua acusa quando falta") fica VERDE se      │
 * │ alguém remover `codCliente` da lista: o laço encolhe junto, em silêncio, e a régua passa a   │
 * │ deixar publicar vaga sem cliente com a suíte inteira verde.                                   │
 * │                                                                                              │
 * │ ENTÃO OS DOIS CAMPOS NOVOS TÊM CASO ESCRITO À MÃO, citando o nome do campo como TEXTO. Quem  │
 * │ tirar a entrada da lista quebra estes testes, que é o comportamento que se quer.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal. Nome de campo, rótulo de tela e lista de pendência.
 *
 * NOTA DE EXECUÇÃO: o backend lê `@ea/shared-types` pelo `dist`, não pelo `src`. Entrada nova na
 * régua só aparece aqui depois de `pnpm --filter @ea/shared-types build`; sem isso o vermelho é de
 * build, não de comportamento.
 */

/** A vaga com TUDO preenchido, INCLUSIVE os dois obrigatórios novos da Onda D. */
const COMPLETA: VagaCamposObrigatorios & Record<string, unknown> = {
  codigo: "PV900001",
  nomeDivulgacao: "Auxiliar De Loja",
  cargoId: "11111111-1111-4111-8111-111111111111",
  posicoesOficiais: 2,
  natureza: "NOVA",
  sazonalidade: "OPERACAO_PADRAO",
  linhaServicoId: 3,
  status: "ABERTA",
  dataAbertura: "2026-09-12",
  // ── OS DOIS DA ONDA D ──
  codCliente: "9001",
  dataLimite: "2026-10-01",
};

function achar(campo: string): VagaPendencia | undefined {
  return VAGA_OBRIGATORIOS.find((p) => p.campo === campo);
}

function campos(v: Partial<Record<string, unknown>>): VagaPendencia[] {
  return vagaPendencias({ ...COMPLETA, ...v } as VagaCamposObrigatorios);
}

// ── TRAVA DE COMPILAÇÃO: a régua precisa SABER LER os dois campos ───────────────────────────────
// `vagaPendencias` indexa o objeto por TEXTO, então o compilador não protege o nome. Estas duas
// linhas quebram o `typecheck` se o campo não existir no contrato que a régua declara ler, que é o
// jeito de o erro aparecer no lugar exato em vez de virar "pendência eterna em toda vaga".
const _aReguaLeOCliente: keyof VagaCamposObrigatorios = "codCliente";
const _aReguaLeAPrevisao: keyof VagaCamposObrigatorios = "dataLimite";
void _aReguaLeOCliente;
void _aReguaLeAPrevisao;

describe("ITEM 1: o Cliente é obrigatório para PUBLICAR", () => {
  it("a régua tem a entrada `codCliente`, com o rótulo, o artigo, o passo e a âncora da OST", () => {
    expect(achar("codCliente")).toEqual({
      campo: "codCliente",
      rotulo: "Cliente",
      artigo: "o",
      passo: 0,
      passoRotulo: "A Vaga",
      ancora: "vaga-cliente",
    });
  });

  it("acusa a falta do cliente, e acusa SÓ ela quando o resto está completo", () => {
    expect(campos({ codCliente: null }).map((p) => p.campo)).toEqual(["codCliente"]);
    expect(campos({ codCliente: "" }).map((p) => p.campo)).toEqual(["codCliente"]);
    expect(campos({ codCliente: undefined }).map((p) => p.campo)).toEqual(["codCliente"]);
  });

  it("espaço em branco no cliente é ausência, e não escolha", () => {
    expect(campos({ codCliente: "   " }).map((p) => p.campo)).toEqual(["codCliente"]);
  });

  it("escolhido o cliente, a pendência some", () => {
    expect(campos({ codCliente: "9001" })).toEqual([]);
  });

  it("escreve a frase que o rodapé mostra, em português e sem travessão (§A.11)", () => {
    const p = achar("codCliente")!;
    expect(textoPendencia(p)).toBe("Passo 1 · A Vaga: falta o Cliente");
    expect(textoPendencia(p)).not.toContain("—");
  });
});

describe("ITEM 2: a Previsão de entrega é obrigatória para PUBLICAR", () => {
  it("a régua tem a entrada `dataLimite`, com o rótulo, o artigo, o passo e a âncora da OST", () => {
    expect(achar("dataLimite")).toEqual({
      campo: "dataLimite",
      rotulo: "Previsão de entrega",
      artigo: "a",
      passo: 1,
      passoRotulo: "Quem Pediu",
      ancora: "vaga-previsao-entrega",
    });
  });

  it("acusa a falta da previsão, e acusa SÓ ela quando o resto está completo", () => {
    expect(campos({ dataLimite: null }).map((p) => p.campo)).toEqual(["dataLimite"]);
    expect(campos({ dataLimite: "" }).map((p) => p.campo)).toEqual(["dataLimite"]);
    expect(campos({ dataLimite: "   " }).map((p) => p.campo)).toEqual(["dataLimite"]);
  });

  it("preenchida a data, a pendência some", () => {
    expect(campos({ dataLimite: "2026-10-01" })).toEqual([]);
  });

  it("escreve a frase do passo 2, com o artigo feminino", () => {
    const p = achar("dataLimite")!;
    expect(textoPendencia(p)).toBe("Passo 2 · Quem Pediu: falta a Previsão de entrega");
    expect(textoPendencia(p)).not.toContain("—");
  });

  /**
   * A PREVISÃO NÃO DEPENDE MAIS DA SAZONALIDADE, e isso é de 21/08: a amarração com a vaga sazonal
   * foi removida, e o campo vale em QUALQUER vaga. A régua nova não pode reintroduzir o "só quando
   * sazonal" por um caminho novo, senão volta o prazo que só é cobrado em metade das vagas.
   */
  it("cobra a previsão em vaga de operação padrão, e não só na sazonal", () => {
    expect(campos({ sazonalidade: "OPERACAO_PADRAO", dataLimite: "" }).map((p) => p.campo)).toEqual([
      "dataLimite",
    ]);
    expect(campos({ sazonalidade: "SAZONAL", dataLimite: "" }).map((p) => p.campo)).toEqual([
      "dataLimite",
    ]);
  });
});

describe("a régua inteira, com os dois campos novos dentro", () => {
  it("vaga completa não acusa nada", () => {
    expect(vagaPendencias(COMPLETA as VagaCamposObrigatorios)).toEqual([]);
  });

  it("LISTA OS DOIS DE UMA VEZ, e não um por ida ao servidor", () => {
    const faltando = campos({ codCliente: "", dataLimite: "" }).map((p) => p.campo);
    expect(faltando).toContain("codCliente");
    expect(faltando).toContain("dataLimite");
    expect(faltando).toHaveLength(2);
  });

  it("devolve na ORDEM DA TRILHA: o cliente (passo 1) antes da previsão (passo 2)", () => {
    const passos = campos({ codCliente: "", dataLimite: "" }).map((p) => p.passo);
    expect(passos).toEqual([...passos].sort((a, b) => a - b));
    expect(campos({ codCliente: "", dataLimite: "" }).map((p) => p.campo)).toEqual([
      "codCliente",
      "dataLimite",
    ]);
  });

  /**
   * REGRESSÃO, ESCRITA À MÃO E NÃO DERIVADA DA LISTA: os obrigatórios que já existiam continuam
   * cobrados, um por um, citados pelo nome. Um laço sobre a constante encolheria junto com ela.
   */
  it.each([
    "codigo",
    "nomeDivulgacao",
    "cargoId",
    "posicoesOficiais",
    "natureza",
    "sazonalidade",
    "linhaServicoId",
    "status",
    "dataAbertura",
  ])("o obrigatório que já existia continua cobrado: %s", (campo) => {
    expect(campos({ [campo]: campo === "posicoesOficiais" ? 0 : "" }).map((p) => p.campo)).toEqual([
      campo,
    ]);
  });

  it("a vaga vazia acusa TODOS, inclusive os dois novos", () => {
    const todos = vagaPendencias({}).map((p) => p.campo);
    expect(todos).toContain("codCliente");
    expect(todos).toContain("dataLimite");
    expect(todos).toEqual(VAGA_OBRIGATORIOS.map((p) => p.campo));
  });

  it("cada obrigatório tem âncora PRÓPRIA, senão o clique da pendência cai no campo errado", () => {
    const ancoras = VAGA_OBRIGATORIOS.map((p) => p.ancora);
    expect(new Set(ancoras).size).toBe(ancoras.length);
  });

  it("o contador de banco continua FORA da régua: zero banco é resposta, não lacuna", () => {
    expect(VAGA_OBRIGATORIOS.map((p) => p.campo)).not.toContain("posicoesBanco");
  });
});
