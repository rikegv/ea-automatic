import { describe, expect, it } from "vitest";
import {
  exigeEscolhaDeVinculo,
  tipoServicoDeContrato,
  vinculoDaAdmissao,
} from "./vinculo";
import { canonicoDe, MAPA_GRAFIAS } from "../db/normaliza-tipo-contrato";

/**
 * VÍNCULO CLIENTE ↔ TIPO DE CONTRATO (OST Onda 3, item 7, Caminho 2).
 *
 * O que estes testes protegem é a REGRA DE OURO da entrega: cliente com um vínculo só se comporta
 * exatamente como antes. Se ela quebrar, 233 dos 234 clientes mudam de régua sem ninguém ter pedido,
 * e é o tipo de estrago que só aparece semanas depois, na auditoria de alguém.
 */

const TEMP = { id: "v-temp", tipoServico: "TEMPORARIO" };
const TERC = { id: "v-terc", tipoServico: "TERCEIRO" };

describe("tipoServicoDeContrato", () => {
  it.each([
    ["Temporário", "TEMPORARIO"],
    ["Terceirizado", "TERCEIRO"],
    ["Estágio", "ESTAGIO"],
    ["Interno", "INTERNO"],
    ["Fopag", "FOPAG"],
    ["Jovem Aprendiz", "APRENDIZ"],
  ])("canônico %s -> %s", (contrato, esperado) => {
    expect(tipoServicoDeContrato(contrato)).toBe(esperado);
  });

  it.each([
    ["TEMP.", "TEMPORARIO"],
    ["TERC.", "TERCEIRO"],
    ["INTER.", "INTERNO"],
    ["ESTA.", "ESTAGIO"],
    ["APREN.", "JOVEM"],
  ])("aceita a abreviação da carga: %s", (contrato, _ignorado) => {
    // A base foi normalizada, mas uma importação nova pode trazer a abreviação de volta. Aceitar
    // aqui é o que impede a admissão de perder o vínculo por causa de um ponto final.
    void _ignorado;
    expect(tipoServicoDeContrato(contrato)).not.toBeNull();
  });

  it("tipo vazio ou desconhecido NÃO vira vínculo (não se adivinha contrato)", () => {
    expect(tipoServicoDeContrato(null)).toBeNull();
    expect(tipoServicoDeContrato("")).toBeNull();
    // "ESTA. FOPAG" é o caso que o diretor decidiu NÃO converter: mistura dois conceitos.
    expect(tipoServicoDeContrato("ESTA. FOPAG")).toBeNull();
  });
});

describe("vinculoDaAdmissao (a REGRA DE OURO)", () => {
  it("cliente SEM vínculo resolve pelo cliente (null)", () => {
    expect(vinculoDaAdmissao([], "Temporário")).toBeNull();
  });

  it("cliente com UM vínculo resolve pelo cliente, mesmo que o tipo case", () => {
    // É o caso de 233 dos 234 clientes de hoje: nada muda para eles, por construção.
    expect(vinculoDaAdmissao([TEMP], "Temporário")).toBeNull();
  });

  it("cliente com DOIS vínculos resolve pelo tipo de contrato da admissão", () => {
    expect(vinculoDaAdmissao([TEMP, TERC], "Temporário")).toBe("v-temp");
    expect(vinculoDaAdmissao([TEMP, TERC], "Terceirizado")).toBe("v-terc");
  });

  it("dois vínculos e tipo VAZIO: não escolhe nenhum (não chuta o primeiro da lista)", () => {
    expect(vinculoDaAdmissao([TEMP, TERC], null)).toBeNull();
    expect(vinculoDaAdmissao([TEMP, TERC], "")).toBeNull();
  });

  it("dois vínculos e tipo que não casa com nenhum: cai no cliente", () => {
    expect(vinculoDaAdmissao([TEMP, TERC], "Estágio")).toBeNull();
  });

  it("vínculo INATIVO não conta nem para exigir escolha nem para resolver", () => {
    const inativo = { ...TERC, ativo: false };
    expect(exigeEscolhaDeVinculo([TEMP, inativo])).toBe(false);
    expect(vinculoDaAdmissao([TEMP, inativo], "Terceirizado")).toBeNull();
  });
});

describe("exigeEscolhaDeVinculo (o gatilho do seletor da tela)", () => {
  it("zero ou um vínculo: a tela NÃO pergunta nada", () => {
    expect(exigeEscolhaDeVinculo([])).toBe(false);
    expect(exigeEscolhaDeVinculo([TEMP])).toBe(false);
  });

  it("dois ou mais: a tela pergunta", () => {
    expect(exigeEscolhaDeVinculo([TEMP, TERC])).toBe(true);
  });
});

describe("normalização da grafia (Bloco 1) e o vínculo falam a MESMA língua", () => {
  it("todo destino do mapa de normalização resolve um tipo de serviço", () => {
    // É a costura entre os dois blocos: se alguém acrescentar uma grafia ao mapa cujo canônico o
    // vínculo não conhece, a admissão normalizada ficaria sem vínculo possível. Isto quebra antes.
    for (const grafia of Object.keys(MAPA_GRAFIAS)) {
      const canonico = canonicoDe(grafia);
      expect(canonico).not.toBeNull();
      expect(tipoServicoDeContrato(canonico)).not.toBeNull();
    }
  });
});
