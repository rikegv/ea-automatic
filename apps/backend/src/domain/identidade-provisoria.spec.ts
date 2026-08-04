import { describe, expect, it } from "vitest";
import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import {
  FAROL_COM_IDENTIDADE_PROVISORIA,
  derivarCpfProvisorio,
  ehCpfProvisorio,
  podeReceberIdentidadeProvisoria,
} from "./identidade-provisoria";

/**
 * IDENTIDADE PROVISÓRIA (Opção 1a, decisão do diretor).
 *
 * As três proteções que o diretor exigiu ANTES da construção estão travadas aqui:
 *  (a) o identificador é determinístico, então rodar a carga duas vezes não duplica;
 *  (b) a reconciliação futura consegue reencontrar o registro pela mesma tripla;
 *  (c) o provisório NUNCA aparece em fila de trabalho, KPI ou envelope de assinatura.
 *
 * A trava (c) é testada pela mecânica que a garante, e não por opinião: o provisório só nasce em
 * farol de encerramento (que a Esteira, o Gerenciador e o gate do kit já excluem) e nunca passa em
 * `isValidCpf` nem na regra dos 11 dígitos, que é exatamente a condição usada pelo mascaramento do
 * Clicksign e pelos dois formatadores de exibição.
 */

const NOME = "MARIA DAS DORES DE SOUZA";
const CLIENTE = "56966";
const DATA = "2026-07-15";

describe("(a) identificador determinístico", () => {
  it("mesma tripla devolve sempre o mesmo identificador", () => {
    const a = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    const b = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    expect(a).toBe(b);
  });

  it("ignora acento, caixa e espaço repetido: a mesma pessoa não ganha dois registros", () => {
    const cru = derivarCpfProvisorio("  José   da Silva ", CLIENTE, DATA);
    const limpo = derivarCpfProvisorio("JOSE DA SILVA", CLIENTE, DATA);
    expect(cru).toBe(limpo);
  });

  it("muda quando muda o cliente, o nome ou a data", () => {
    const base = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    expect(derivarCpfProvisorio(NOME, "57073", DATA)).not.toBe(base);
    expect(derivarCpfProvisorio("OUTRA PESSOA", CLIENTE, DATA)).not.toBe(base);
    expect(derivarCpfProvisorio(NOME, CLIENTE, "2026-07-16")).not.toBe(base);
  });

  it("data ausente é um caso válido e estável (declínio costuma não ter data)", () => {
    expect(derivarCpfProvisorio(NOME, CLIENTE, null)).toBe(
      derivarCpfProvisorio(NOME, CLIENTE, undefined),
    );
  });

  it("cabe em candidatos.cpf: exatamente 11 caracteres, com o prefixo PROV", () => {
    const id = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    expect(id).toHaveLength(11);
    expect(id.startsWith("PROV")).toBe(true);
    expect(id).toMatch(/^PROV[0-9A-Z]{7}$/);
  });

  it("não colide em volume muito acima do caso real (48 declínios)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(derivarCpfProvisorio(`PESSOA NUMERO ${i}`, CLIENTE, DATA));
    expect(ids.size).toBe(5000);
  });
});

describe("(c) o provisório fica fora de fila, KPI e envelope", () => {
  it("NUNCA passa por CPF válido: nenhum caminho que exige CPF o aceita", () => {
    const id = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    expect(isValidCpf(id)).toBe(false);
  });

  it("nunca tem 11 dígitos, que é a condição usada pelo Clicksign e pelos formatadores", () => {
    // `mascararCpf` do clicksign-api e os dois formatadores de exibição fazem exatamente isto:
    // se `normalizeCpf(x).length !== 11`, omitem o campo ou devolvem o valor cru.
    const id = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    expect(normalizeCpf(id).length).not.toBe(11);
  });

  it("só nasce em farol de encerramento, que já é excluído de fila e KPI", () => {
    expect([...FAROL_COM_IDENTIDADE_PROVISORIA].sort()).toEqual(["DECLINOU", "RESCISAO"]);
    expect(podeReceberIdentidadeProvisoria("DECLINOU", "")).toBe(true);
    expect(podeReceberIdentidadeProvisoria("RESCISAO", "")).toBe(true);
  });

  it("recusa admissão VIVA, mesmo sem CPF: essas ficam para correção na origem", () => {
    expect(podeReceberIdentidadeProvisoria("EM_ADMISSAO", "")).toBe(false);
    expect(podeReceberIdentidadeProvisoria("ADMISSAO_CONCLUIDA", "")).toBe(false);
    expect(podeReceberIdentidadeProvisoria("BANCO_AGUARDAR", "")).toBe(false);
    expect(podeReceberIdentidadeProvisoria("AGUARDANDO_LIBERACAO", "")).toBe(false);
  });

  it("recusa quando o CPF real existe: identidade provisória é último recurso", () => {
    expect(podeReceberIdentidadeProvisoria("DECLINOU", "529.982.247-25")).toBe(false);
    expect(podeReceberIdentidadeProvisoria("DECLINOU", "52998224725")).toBe(false);
  });

  it("aceita quando o CPF está presente mas é inválido (dígito errado)", () => {
    expect(podeReceberIdentidadeProvisoria("DECLINOU", "52998224726")).toBe(true);
    expect(podeReceberIdentidadeProvisoria("DECLINOU", "111")).toBe(true);
  });
});

describe("(b) reconhecimento para a reconciliação futura", () => {
  it("distingue provisório de CPF real", () => {
    expect(ehCpfProvisorio(derivarCpfProvisorio(NOME, CLIENTE, DATA))).toBe(true);
    expect(ehCpfProvisorio("52998224725")).toBe(false);
    expect(ehCpfProvisorio("")).toBe(false);
    expect(ehCpfProvisorio(null)).toBe(false);
    expect(ehCpfProvisorio(undefined)).toBe(false);
  });

  it("a carga futura reencontra o registro derivando a MESMA tripla", () => {
    // É isto que substitui a busca por nome no banco: a chave primária é reconstruível.
    const naCargaDeHoje = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    const naCargaDeAmanha = derivarCpfProvisorio(NOME, CLIENTE, DATA);
    expect(naCargaDeAmanha).toBe(naCargaDeHoje);
    expect(ehCpfProvisorio(naCargaDeAmanha)).toBe(true);
  });
});
