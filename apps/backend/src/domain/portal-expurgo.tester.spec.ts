import { describe, expect, it, vi } from "vitest";
import { executarCaminhoDoArquivo, type PortasCaminhoDoArquivo } from "./portal-caminho-arquivo";
import { PORTAL_EVENTOS, montarEventoPortal } from "./portal-evento";

/**
 * CONDICAO B6: O EXPURGO NUNCA ASSUME QUE O OBJETO EXISTE, E NUNCA DERRUBA O CAMINHO AO FALHAR.
 *
 * TESTE INDEPENDENTE (§A.38), escrito a partir do REQUISITO e em paralelo a construcao (§A.40
 * regra 2). O contrato exigido aqui muda o das portas de hoje: `apagarObjeto` passa a DEVOLVER se
 * apagou (`Promise<boolean>`), porque um expurgo que nao diz se funcionou nao pode virar evento.
 * Ver `docs/DESENHO-PORTAL-HIBRIDO.md` secao 6 e item 8 da secao 11.1.
 *
 * O QUE ESTE ARQUIVO PEGA E O TESTE DO AUTOR NAO PEGA. O expurgo e a primeira coisa do modulo que
 * APAGA, e o modo de falha dele nao e falhar: e falhar alto. O padrao da casa e o da INT-4, onde a
 * falha ao notificar nao desfaz o envelope (§A.5), e o oposto disso ja custou caro na casa (§A.33).
 * Somado a isso, `reauditoria/documento-arquivo.service.ts:195-207` devolve documento a `PENDENTE`
 * SEM guarda de estado, por fora do Portal: o caminho tem de conviver com o objeto ja apagado, com
 * o documento remexido por outra frente, e seguir sem derrubar o candidato que esta na tela.
 */

const OBJETO = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf";

const CONTEXTO = {
  credencial: { objeto: OBJETO, tipoAssinado: "application/pdf", bytesMax: 10 * 1024 * 1024 },
  codigoTipoDocumento: "RG",
  avisoDoNavegador: true,
};

/** Metadado que NAO casa com o assinado: e o ramo em que o expurgo acontece. */
const METADADO_DIVERGENTE = { objeto: OBJETO, bytes: 40 * 1024 * 1024, contentType: "application/pdf" };
const METADADO_BOM = { objeto: OBJETO, bytes: 512_000, contentType: "application/pdf" };

type Eventos = { tipo: string; dados?: Record<string, unknown> }[];

function portas(over: Partial<PortasCaminhoDoArquivo> = {}) {
  const eventos: Eventos = [];
  const base = {
    consultarMetadado: vi.fn(async () => METADADO_DIVERGENTE),
    lerComIa: vi.fn(async () => ({
      campos: [{ campo: "numero", rotulo: "Numero", valor: "12.345.678-9", confianca: 0.9, lido: true }],
      origem: "IA" as const,
    })),
    marcarEntregue: vi.fn(async () => {}),
    apagarObjeto: vi.fn(async () => true),
    registrarEvento: vi.fn(async (tipo: string, dados?: Record<string, unknown>) => {
      eventos.push({ tipo, dados });
    }),
  } as unknown as PortasCaminhoDoArquivo;
  return { p: { ...base, ...over } as PortasCaminhoDoArquivo, eventos };
}

/** O evento do expurgo que falhou. O nome e da construcao; o vocabulario fechado e do requisito. */
function eventoDeFalhaAoApagar(eventos: Eventos) {
  return eventos.find(({ tipo }) => /APAG|EXPURG|REMO/i.test(tipo));
}

describe("B6: o expurgo acontece no ramo certo", () => {
  it("chegada recusada COM objeto: apaga uma vez, e so o objeto daquela credencial", async () => {
    const { p } = portas();
    await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.apagarObjeto).toHaveBeenCalledTimes(1);
    expect(p.apagarObjeto).toHaveBeenCalledWith(OBJETO);
  });

  it("chegada recusada SEM objeto: nao tenta apagar o que nunca existiu", async () => {
    const { p } = portas({ consultarMetadado: vi.fn(async () => null) });
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.apagarObjeto).not.toHaveBeenCalled();
    expect(r.entregue).toBe(false);
  });

  it("chegada confirmada: nada e apagado", async () => {
    const { p } = portas({ consultarMetadado: vi.fn(async () => METADADO_BOM) });
    await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.apagarObjeto).not.toHaveBeenCalled();
  });
});

describe("B6: falhar ao apagar NAO derruba o caminho", () => {
  it("apagar que devolve falso: o caminho termina normalmente", async () => {
    const { p } = portas({ apagarObjeto: vi.fn(async () => false) as never });
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(r.entregue).toBe(false);
    expect(r.motivoCodigo).toBeDefined();
  });

  it("apagar que LANCA: a excecao morre ali, o candidato nao ve erro de infraestrutura", async () => {
    const { p } = portas({
      apagarObjeto: vi.fn(async () => {
        throw new Error("403 do armazenamento");
      }) as never,
    });
    await expect(executarCaminhoDoArquivo(p, CONTEXTO)).resolves.toBeDefined();
  });

  it("a falha vira EVENTO, e o tipo esta no vocabulario fechado", async () => {
    const { p, eventos } = portas({ apagarObjeto: vi.fn(async () => false) as never });
    await executarCaminhoDoArquivo(p, CONTEXTO);
    const evento = eventoDeFalhaAoApagar(eventos);
    expect(
      evento,
      "objeto que ficou para tras sem evento e lacuna invisivel: a rede de 30 dias e que pagaria a conta, e ninguem saberia",
    ).toBeDefined();
    expect(
      (PORTAL_EVENTOS as readonly string[]).includes(evento?.tipo ?? ""),
      `\`${evento?.tipo}\` precisa estar em PORTAL_EVENTOS, senao a trilha grava tipo fora do vocabulario`,
    ).toBe(true);
  });

  it("apagar que LANCA tambem vira evento", async () => {
    const { p, eventos } = portas({
      apagarObjeto: vi.fn(async () => {
        throw new Error("403 do armazenamento");
      }) as never,
    });
    await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(eventoDeFalhaAoApagar(eventos)).toBeDefined();
  });

  it("§A.6: o evento do expurgo nao carrega o caminho do objeto, so o prefixo", async () => {
    const { p, eventos } = portas({ apagarObjeto: vi.fn(async () => false) as never });
    await executarCaminhoDoArquivo(p, CONTEXTO);
    const evento = eventoDeFalhaAoApagar(eventos);
    const texto = JSON.stringify(evento?.dados ?? {});
    expect(texto.includes(OBJETO), "o envio exato identifica o candidato no registro de acesso de um terceiro").toBe(false);
    expect(texto.includes("RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b")).toBe(false);
  });
});

describe("B6: nenhum caminho assume que o objeto continua la", () => {
  it("depois de apagar, nada mais e feito com aquele objeto", async () => {
    const { p } = portas();
    await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(p.lerComIa).not.toHaveBeenCalled();
    expect(p.marcarEntregue).not.toHaveBeenCalled();
  });

  it("objeto que sumiu por fora entre a confirmacao e a leitura nao derruba o caminho", async () => {
    // O documento pode ter voltado a `PENDENTE` por outra frente, e o objeto pode ter sido apagado
    // pela rede de 30 dias ou pela curadoria. O leitor devolve erro, e isso ja e tratado; o que
    // este teste trava e que o caminho NAO tente apagar de novo nem reprovar o que ja foi gravado.
    const { p } = portas({
      consultarMetadado: vi.fn(async () => METADADO_BOM),
      lerComIa: vi.fn(async () => {
        throw new Error("404 do armazenamento");
      }),
    });
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(r.entregue).toBe(true);
    expect(p.apagarObjeto).not.toHaveBeenCalled();
  });

  it("documento devolvido a PENDENTE por fora: marcar entregue sem efeito nao quebra o caminho", async () => {
    // `reauditoria/documento-arquivo.service.ts:195-207` escreve `PENDENTE` sem guarda de estado.
    // Quando isso acontece no meio do caminho, a atualizacao do Portal simplesmente nao acha linha,
    // e o caminho segue: abster-se, nunca falhar alto em cima do candidato.
    const { p } = portas({
      consultarMetadado: vi.fn(async () => METADADO_BOM),
      marcarEntregue: vi.fn(async () => {
        /* zero linhas afetadas, e isso nao e erro */
      }),
    });
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(r.entregue).toBe(true);
  });

  it("marcar entregue que LANCA nao pode levar o objeto CONFIRMADO junto", async () => {
    // O objeto ja chegou e ja foi conferido pelo lado do servidor. Se a gravacao do estado falhar,
    // o comportamento seguro e ABSTER-SE: o documento continua pendente e a proxima tentativa
    // confirma. Apagar aqui trocaria um incomodo por uma perda, que e o padrao da §A.33.
    const { p } = portas({
      consultarMetadado: vi.fn(async () => METADADO_BOM),
      marcarEntregue: vi.fn(async () => {
        throw new Error("conflito de estado");
      }),
    });
    await executarCaminhoDoArquivo(p, CONTEXTO).catch(() => undefined);
    expect(p.apagarObjeto, "objeto confirmado nunca e apagado por falha de gravacao de estado").not.toHaveBeenCalled();
  });
});

describe("§A.6 na trilha do expurgo: o caminho do objeto nao atravessa", () => {
  it("o campo `caminho` sai da allowlist da trilha", () => {
    // Item 9 da secao 11.1 do desenho: a auditoria anterior pediu a remocao enquanto ninguem o usa.
    const evento = montarEventoPortal("PORTAL_OBJETO_NAO_CONFIRMADO", {
      codigoTipoDocumento: "RG",
      caminho: OBJETO,
      motivoCodigo: "OBJETO_DIVERGENTE",
    });
    expect(JSON.stringify(evento).includes(OBJETO)).toBe(false);
    expect("caminho" in evento.dados).toBe(false);
  });

  it("objeto, url e bilhete nunca atravessam, com qualquer nome", () => {
    const evento = montarEventoPortal("PORTAL_OBJETO_NAO_CONFIRMADO", {
      objeto: OBJETO,
      url: "https://storage.googleapis.com/entrada/obj?X-Goog-Signature=abc",
      bilhete: "eyJhbGciOiJFZERTQSJ9.eyJvYmoiOiJ4In0.assinatura",
      codigoTipoDocumento: "RG",
    });
    const texto = JSON.stringify(evento);
    expect(texto.includes(OBJETO)).toBe(false);
    expect(texto.includes("X-Goog-Signature")).toBe(false);
    expect(texto.includes("eyJhbGciOiJFZERTQSJ9")).toBe(false);
  });
});
