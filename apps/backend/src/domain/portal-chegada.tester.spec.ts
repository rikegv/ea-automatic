import { describe, expect, it } from "vitest";
import { confirmarChegadaObjeto, type MetadadoObjeto } from "./portal-chegada";

/**
 * PORTAL, G3 E VETO V11: O DOCUMENTO NAO FICA ENTREGUE PELA PALAVRA DO NAVEGADOR.
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CODIGO (§A.38/§A.40 regra 2). O modulo
 * `domain/portal-chegada.ts` ainda nao existe, e o contrato que este arquivo fixa e:
 *
 *   confirmarChegadaObjeto({ credencial, metadado, avisoDoNavegador })
 *     -> { entregue: true, bytes, formato } | { entregue: false, motivoCodigo }
 *
 * `metadado` e o resultado da consulta FEITA PELO SERVIDOR ao armazenamento. `null` significa que a
 * consulta nao achou objeto. `avisoDoNavegador` existe no contrato de proposito: ele entra e nao
 * decide nada, e o teste central deste arquivo e exatamente esse.
 *
 * E o mesmo padrao da §A.33: nao carimbar o que nao se verificou. Acreditar no cliente produz
 * admissao com documento ENTREGUE e arquivo nenhum, descoberta so na assinatura do contrato.
 *
 * §A.6: sem PII. Objeto opaco, bytes, formato.
 */

const MB = 1024 * 1024;

/** A credencial que foi assinada para este documento, na forma minima que a confirmacao precisa. */
const CREDENCIAL = {
  objeto: "a1b2c3d4e5f6a7b8/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf",
  tipoAssinado: "application/pdf",
  bytesMax: 2 * MB,
};

const METADADO_BOM: MetadadoObjeto = {
  objeto: CREDENCIAL.objeto,
  bytes: 1_234_567,
  contentType: "application/pdf",
};

describe("A confirmacao e do lado do SERVIDOR (G3, V11)", () => {
  it("NAO entrega com o aviso do navegador e NENHUM objeto no armazenamento", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: null,
      avisoDoNavegador: true,
    });
    expect(r.entregue).toBe(false);
    expect(r.entregue === false && r.motivoCodigo).toBe("OBJETO_AUSENTE");
  });

  it("ENTREGA quando o metadado do servidor confirma, MESMO SEM aviso do navegador", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: METADADO_BOM,
      avisoDoNavegador: false,
    });
    expect(r.entregue).toBe(true);
  });

  it("o aviso do navegador NAO muda o veredicto em nenhum dos dois sentidos", () => {
    const comAviso = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: METADADO_BOM,
      avisoDoNavegador: true,
    });
    const semAviso = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: METADADO_BOM,
      avisoDoNavegador: false,
    });
    expect(comAviso).toEqual(semAviso);
  });
});

describe("O metadado e CONFERIDO contra o que foi assinado, nao so lido", () => {
  it("RECUSA objeto de tamanho ZERO (o 4G que caiu no meio da subida)", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: { ...METADADO_BOM, bytes: 0 },
      avisoDoNavegador: true,
    });
    expect(r.entregue === false && r.motivoCodigo).toBe("TAMANHO");
  });

  it("RECUSA objeto MAIOR do que a faixa assinada", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: { ...METADADO_BOM, bytes: 2 * MB + 1 },
      avisoDoNavegador: true,
    });
    expect(r.entregue === false && r.motivoCodigo).toBe("TAMANHO");
  });

  it("RECUSA objeto com NOME diferente do que nos escolhemos", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: { ...METADADO_BOM, objeto: "outro-candidato/RG__deadbeef.pdf" },
      avisoDoNavegador: true,
    });
    expect(r.entregue === false && r.motivoCodigo).toBe("OBJETO_DIVERGENTE");
  });

  it("RECUSA tipo divergente do assinado", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: { ...METADADO_BOM, contentType: "application/zip" },
      avisoDoNavegador: true,
    });
    expect(r.entregue === false && r.motivoCodigo).toBe("FORMATO");
  });
});

describe("§A.6: o veredicto nao devolve nada que nao possa ir para o log", () => {
  it("nem nome original, nem URL, nem token aparecem na resposta", () => {
    const r = confirmarChegadaObjeto({
      credencial: CREDENCIAL,
      metadado: {
        ...METADADO_BOM,
        ...({
          nomeOriginal: "RG-fulano-de-tal.pdf",
          url: "https://storage.googleapis.com/entrada/obj?X-Goog-Signature=abc",
        } as object),
      },
      avisoDoNavegador: true,
    });
    const alvo = JSON.stringify(r);
    for (const proibido of ["fulano", "https://", "X-Goog-Signature"]) {
      expect(alvo.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });
});
