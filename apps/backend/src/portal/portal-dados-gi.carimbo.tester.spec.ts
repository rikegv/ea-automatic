import { describe, expect, it } from "vitest";
import {
  carimbarConfirmacaoHumana,
  filtrarCamposGi,
  type CampoSubmetidoGi,
} from "../domain/dados-gi-campos";
import {
  montarFuncionarioSelecao,
  montarGravacaoDadosGi,
  montarPessoaParaGi,
  type DadosGiParaPessoa,
  type DeParaGi,
} from "../domain/portal-dados-gi";

/**
 * COBERTURA INDEPENDENTE (§A.38) do conserto da OPÇÃO 2 (Rike, 14/10/2026): submeter o Portal É a
 * confirmação humana. O bug era um descompasso de contrato: o navegador manda `{campo, valor}` e
 * nunca `confirmadoPorHumano`, e `montarGravacaoDadosGi` só persiste com `confirmadoPorHumano===true`
 * → base-wide 0 campos persistidos. `carimbarConfirmacaoHumana` carimba no limite HTTP.
 *
 * §A.6: todos os valores aqui são SINTÉTICOS e declarados; nenhum é dado de pessoa real.
 */

// Exatamente o que o navegador envia hoje: só chave e valor, sem `confirmadoPorHumano`, sem rótulo.
const WIRE: CampoSubmetidoGi[] = [
  { campo: "rgNumero", valor: "11222333" },
  { campo: "rgOrgaoEmissor", valor: "SSP" },
  { campo: "rgUf", valor: "SP" },
  { campo: "cidadeRg", valor: "SANTOS" },
  { campo: "rgDataEmissao", valor: "2015-05-20" },
  { campo: "naturalidade", valor: "SP" },
  { campo: "nomeMae", valor: "FULANA SINTETICA" },
  { campo: "pis", valor: "12345678901" },
  { campo: "vazio_proposital", valor: "   " },
];

const deparaNulo: DeParaGi = {
  codigoCidade: () => null,
  codigoMunicipioIbge: () => null,
};

function gravar(campos: Parameters<typeof montarGravacaoDadosGi>[0]["campos"]) {
  const g = montarGravacaoDadosGi({
    admissaoDaSessao: "adm-sintetica",
    jtiLink: "jti-sintetico",
    campos,
    agora: new Date("2026-10-14T12:00:00Z"),
  });
  return { g, filtrado: filtrarCamposGi(g.valores) };
}

describe("OPCAO 2: carimbo da confirmacao humana no limite HTTP", () => {
  it("SEM carimbo (o bug): o payload cru do front descarta TUDO", () => {
    // O front manda `{campo, valor}`; forcado ao tipo do dominio, `confirmadoPorHumano` e undefined.
    const { g, filtrado } = gravar(WIRE as unknown as Parameters<typeof gravar>[0]);
    expect(g.rotulosAceitos).toHaveLength(0);
    expect(Object.keys(filtrado.update)).toHaveLength(0);
  });

  it("COM carimbo: o dossie inteiro persiste, inclusive os 5 campos do RG", () => {
    const { g, filtrado } = gravar(carimbarConfirmacaoHumana(WIRE));
    // As COLUNAS do RG (nomes de propriedade de admissao_dados_gi), §A.6: so nomes de campo.
    expect(filtrado.update).toHaveProperty("rgNumero");
    expect(filtrado.update).toHaveProperty("rgOrgaoEmissor");
    expect(filtrado.update).toHaveProperty("rgUf");
    expect(filtrado.update).toHaveProperty("rgCidade"); // cidadeRg -> coluna rgCidade
    expect(filtrado.update).toHaveProperty("rgDataEmissao");
    // e o resto do dossie
    expect(filtrado.update).toHaveProperty("naturalidade");
    expect(filtrado.update).toHaveProperty("filiacaoNomeMae");
    expect(filtrado.update).toHaveProperty("pis");
    // o aceite passa a existir (era 0 base-wide)
    expect(g.rotulosAceitos.length).toBeGreaterThanOrEqual(8);
    // VETO V12 intacto: campo so-espaco NAO persiste
    expect(g.descartados).toContain("vazio_proposital");
  });

  it("o RG persistido SEGUE preenchido no payload do envio ao G.I", () => {
    const { filtrado } = gravar(carimbarConfirmacaoHumana(WIRE));
    // O que lerPessoa leria de admissao_dados_gi (as colunas = chaves de DadosGiParaPessoa).
    const pessoa = montarPessoaParaGi(
      { nome: "NOME SINTETICO", cpf: "00000000000" },
      filtrado.update as unknown as DadosGiParaPessoa,
    );
    const payload = montarFuncionarioSelecao(pessoa, deparaNulo, undefined, {
      apiSincAdmissaoDigital: false,
    });
    for (const campo of ["rg", "orgaoRG", "cidadeRG", "ufrg", "dtExpedicaoRG"] as const) {
      expect(payload[campo], `payload.${campo}`).toBeTruthy();
    }
  });
});

describe("CTPS: a chave da data de expedicao e a que a IA EMITE (ctpsDataExpedicao), nao ctpsData", () => {
  // A IA (`ai-service/app/portal_extracao.py`) emite `ctpsDataExpedicao`; o front ecoa a chave da
  // sugestao. Enquanto a allowlist so conhecia `ctpsData`, a data da CTPS era descartada em silencio.
  it("ctpsDataExpedicao persiste na COLUNA ctpsData (alinhamento 15/10/2026)", () => {
    const { filtrado } = gravar(
      carimbarConfirmacaoHumana([
        { campo: "ctpsNumero", valor: "1234567" },
        { campo: "ctpsDataExpedicao", valor: "2016-08-10" },
      ]),
    );
    expect(filtrado.update).toHaveProperty("ctpsNumero");
    // A chave do vocabulario e `ctpsDataExpedicao`; a COLUNA gravada e `ctpsData`.
    expect(filtrado.update).toHaveProperty("ctpsData", "2016-08-10");
  });

  it("a chave ANTIGA `ctpsData` NAO grava mais nada (era a fonte do descarte silencioso)", () => {
    const { filtrado } = gravar(carimbarConfirmacaoHumana([{ campo: "ctpsData", valor: "2016-08-10" }]));
    expect(filtrado.update).not.toHaveProperty("ctpsData");
  });
});
