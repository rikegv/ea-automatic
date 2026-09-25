import { describe, expect, it, vi } from "vitest";
import {
  executarCaminhoDoArquivo,
  type PortasCaminhoDoArquivo,
} from "./portal-caminho-arquivo";

/**
 * PORTAL: A ORDEM DO CAMINHO. GRAVA PRIMEIRO, LE DEPOIS, E FALHA DE LEITURA NAO DESFAZ NADA.
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CODIGO (§A.38/§A.40 regra 2). O modulo
 * `domain/portal-caminho-arquivo.ts` ainda nao existe. O contrato fixado aqui e um ORQUESTRADOR PURO
 * com portas injetadas, para que a ordem seja testavel sem nuvem, sem banco e sem rede:
 *
 *   executarCaminhoDoArquivo(portas, contexto)
 *     -> { entregue: boolean, sugestao: Sugestao | null, motivoCodigo?: string }
 *
 *   portas = { consultarMetadado, lerComIa, marcarEntregue, apagarObjeto, registrarEvento }
 *
 * POR QUE A ORDEM E ESTA (secao 3 de `docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md`): a assimetria de
 * dano decide. Ler primeiro deixa campos na tela de um arquivo que nao subiu, que e entrega falsa e
 * silenciosa, o mesmo padrao da §A.33. Gravar primeiro, no pior caso, da digitacao manual.
 *
 * SE A CONSTRUCAO NAO EXPUSER ESSAS PORTAS, o teste da ORDEM vira teste de integracao com nuvem, e
 * ai ninguem o escreve. A forma da funcao e parte do requisito, nao preferencia de teste.
 */

const CONTEXTO = {
  credencial: {
    objeto: "a1b2c3d4e5f6a7b8/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf",
    tipoAssinado: "application/pdf",
    bytesMax: 10 * 1024 * 1024,
  },
  codigoTipoDocumento: "RG",
  avisoDoNavegador: true,
};

const METADADO_BOM = {
  objeto: CONTEXTO.credencial.objeto,
  bytes: 512_000,
  contentType: "application/pdf",
};

function portas(over: Partial<PortasCaminhoDoArquivo> = {}) {
  const ordem: string[] = [];
  const base: PortasCaminhoDoArquivo = {
    consultarMetadado: vi.fn(async () => {
      ordem.push("consultarMetadado");
      return METADADO_BOM;
    }),
    lerComIa: vi.fn(async () => {
      ordem.push("lerComIa");
      return {
        campos: [
          { campo: "numero", rotulo: "Numero", valor: "12.345.678-9", confianca: 0.9, lido: true },
        ],
        origem: "IA" as const,
      };
    }),
    marcarEntregue: vi.fn(async () => {
      ordem.push("marcarEntregue");
    }),
    apagarObjeto: vi.fn(async () => {
      ordem.push("apagarObjeto");
      return true;
    }),
    registrarEvento: vi.fn(async (tipo: string) => {
      ordem.push(`evento:${tipo}`);
    }),
  };
  return { p: { ...base, ...over }, ordem };
}

describe("A ordem: confirmacao do lado do servidor ANTES da leitura", () => {
  it("consulta o metadado antes de mandar a IA ler", async () => {
    const { p, ordem } = portas();
    await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(ordem.indexOf("consultarMetadado")).toBeGreaterThanOrEqual(0);
    expect(ordem.indexOf("consultarMetadado")).toBeLessThan(ordem.indexOf("lerComIa"));
  });

  it("objeto AUSENTE: a IA nunca e chamada e nada vai a ENTREGUE", async () => {
    const { p } = portas({ consultarMetadado: vi.fn(async () => null) });
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.lerComIa).not.toHaveBeenCalled();
    expect(p.marcarEntregue).not.toHaveBeenCalled();
    expect(r.entregue).toBe(false);
    expect(r.sugestao).toBeNull();
  });
});

describe("A leitura que FALHA nao desfaz o arquivo gravado nem mente sobre a entrega", () => {
  it("leitura com erro: o objeto NAO e apagado", async () => {
    const { p } = portas({
      lerComIa: vi.fn(async () => {
        throw new Error("parser derrubou");
      }),
    });
    await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.apagarObjeto).not.toHaveBeenCalled();
  });

  it("leitura com erro: o documento segue ENTREGUE (a chegada foi confirmada) e a sugestao e nula", async () => {
    const { p } = portas({
      lerComIa: vi.fn(async () => {
        throw new Error("tempo limite do leitor");
      }),
    });
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.marcarEntregue).toHaveBeenCalledTimes(1);
    expect(r.entregue).toBe(true);
    expect(r.sugestao).toBeNull();
    expect(r.motivoCodigo).toBe("EXTRACAO_FALHOU");
  });

  it("a falha da leitura vira EVENTO, nao excecao para o candidato", async () => {
    const { p, ordem } = portas({
      lerComIa: vi.fn(async () => {
        throw new Error("PDF malformado");
      }),
    });
    await expect(executarCaminhoDoArquivo(p, CONTEXTO)).resolves.toBeTruthy();
    expect(ordem.some((o) => o.startsWith("evento:"))).toBe(true);
  });
});

describe("A sugestao da IA nunca e dado final (G5, V12)", () => {
  it("volta marcada como sugestao, sem confirmacao humana", async () => {
    const { p } = portas();
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(r.sugestao).not.toBeNull();
    expect(r.sugestao?.origem).toBe("IA");
    expect(r.sugestao?.confirmadoPorHumano).toBe(false);
  });

  it("marcar ENTREGUE nao recebe os campos lidos: quem grava campo e a confirmacao humana", async () => {
    const { p } = portas();
    await executarCaminhoDoArquivo(p, CONTEXTO);
    const argumento = JSON.stringify(
      (p.marcarEntregue as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] ?? [],
    );
    expect(argumento).not.toContain("12.345.678-9");
  });
});
