import { describe, expect, it } from "vitest";
import {
  LIMITES_PORTAL,
  emitirCredencialEscrita,
  estadoEmissaoInicial,
  validarUsoCredencial,
  type EstadoEmissaoLink,
} from "./portal-credencial";

/**
 * PORTAL DO CANDIDATO, CAMADA G: A CREDENCIAL DE ESCRITA E OS TRES TETOS.
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CODIGO (§A.38/§A.40 regra 2), por um agente que NAO e o
 * autor da implementacao. Nada aqui foi derivado de ler a construcao: os numeros vem da decisao do
 * diretor (10 MB por arquivo, 25 arquivos por link, 60 MB somados) e as travas vem do G1, do G2 e
 * dos vetos V10 e V2 de `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`.
 *
 * O CONTRATO QUE ESTE ARQUIVO FIXA (o modulo `domain/portal-credencial.ts` ainda nao existe):
 *
 *   estadoEmissaoInicial(): EstadoEmissaoLink
 *   emitirCredencialEscrita(entrada): { ok: true, credencial, estado } | { ok: false, motivoCodigo }
 *   validarUsoCredencial(credencial, tentativa, agoraMs): { ok: true } | { ok: false, motivoCodigo }
 *
 * POR QUE O ESTADO ENTRA E SAI DA EMISSAO, e nao da confirmacao: a auditoria apontou que contar na
 * confirmacao torna ILIMITADO pedir credencial e nunca enviar nada. A assinatura da funcao e o que
 * impede isso de voltar: quem quiser contar na chegada precisa mudar o contrato e quebrar o teste
 * "26 pedidos sem um unico envio".
 *
 * §A.6: nenhum dado pessoal aqui. Identificador opaco, codigo de tipo de documento e bytes.
 */

const MB = 1024 * 1024;
const T0 = Date.UTC(2026, 8, 18, 12, 0, 0);

/** Um pedido padrao. O `uuid` entra por parametro para o nome do objeto ser deterministico no teste. */
function pedido(over: Partial<Parameters<typeof emitirCredencialEscrita>[0]> = {}) {
  return {
    estado: estadoEmissaoInicial(),
    admissaoIdOpaco: "a1b2c3d4e5f6a7b8",
    codigoTipoDocumento: "RG",
    contentType: "application/pdf",
    bytes: 1 * MB,
    agoraMs: T0,
    uuid: "0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b",
    ...over,
  };
}

/** Emite N credenciais em sequencia, avancando o relogio para nao esbarrar no teto de RITMO. */
function emitirEmSerie(
  quantidade: number,
  bytesCada: number,
): { ultima: ReturnType<typeof emitirCredencialEscrita>; estado: EstadoEmissaoLink } {
  let estado = estadoEmissaoInicial();
  let ultima = emitirCredencialEscrita(pedido({ bytes: bytesCada }));
  for (let i = 0; i < quantidade; i++) {
    ultima = emitirCredencialEscrita(pedido({ estado, bytes: bytesCada, agoraMs: T0 + i * 60_000 }));
    if (ultima.ok) estado = ultima.estado;
  }
  return { ultima, estado };
}

describe("LIMITES_PORTAL: os tres numeros do diretor, escritos a mao", () => {
  it("10 MB por arquivo, 25 arquivos por link, 60 MB somados", () => {
    expect(LIMITES_PORTAL.BYTES_MAX_ARQUIVO).toBe(10 * MB);
    expect(LIMITES_PORTAL.ARQUIVOS_MAX_POR_LINK).toBe(25);
    expect(LIMITES_PORTAL.BYTES_MAX_SOMADOS).toBe(60 * MB);
  });
});

describe("Teto 1, tamanho por arquivo: a borda exata", () => {
  it("ACEITA exatamente 10 MB", () => {
    expect(emitirCredencialEscrita(pedido({ bytes: 10 * MB })).ok).toBe(true);
  });

  it("RECUSA 10 MB mais UM byte", () => {
    const r = emitirCredencialEscrita(pedido({ bytes: 10 * MB + 1 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivoCodigo).toBe("TAMANHO");
  });

  it("RECUSA tamanho ausente, zero ou negativo (sem tamanho nao ha faixa para assinar)", () => {
    for (const bytes of [0, -1]) {
      expect(emitirCredencialEscrita(pedido({ bytes })).ok).toBe(false);
    }
  });
});

describe("Teto 2, quantidade por link: contada na EMISSAO, nao na chegada", () => {
  it("o 25 passa e o 26 nao, mesmo SEM NENHUM envio confirmado", () => {
    const { estado, ultima } = emitirEmSerie(25, 1 * MB);
    expect(ultima.ok).toBe(true);
    expect(estado.emitidas).toBe(25);

    const vigesimoSexto = emitirCredencialEscrita(
      pedido({ estado, bytes: 1 * MB, agoraMs: T0 + 25 * 60_000 }),
    );
    expect(vigesimoSexto.ok).toBe(false);
    expect(vigesimoSexto.ok === false && vigesimoSexto.motivoCodigo).toBe("QUANTIDADE");
  });

  it("a credencial emitida e NAO usada continua ocupando a vaga (o furo apontado pela auditoria)", () => {
    const { estado } = emitirEmSerie(25, 1 * MB);
    // Nenhuma confirmacao de chegada aconteceu em nenhum momento deste teste.
    expect((estado as { confirmadas?: number }).confirmadas ?? 0).toBe(0);
    const r = emitirCredencialEscrita(pedido({ estado, agoraMs: T0 + 90 * 60_000 }));
    expect(r.ok === false && r.motivoCodigo).toBe("QUANTIDADE");
  });
});

describe("Teto 3, soma de 60 MB por link", () => {
  it("RECUSA a emissao que faria a soma CONCEDIDA ultrapassar 60 MB", () => {
    const { estado } = emitirEmSerie(6, 10 * MB);
    expect(estado.bytesConcedidos).toBe(60 * MB);

    const estouro = emitirCredencialEscrita(
      pedido({ estado, bytes: 1, agoraMs: T0 + 10 * 60_000 }),
    );
    expect(estouro.ok).toBe(false);
    expect(estouro.ok === false && estouro.motivoCodigo).toBe("SOMA");
  });

  it("a soma acumula o CONCEDIDO, nao o entregue: 7 pedidos de 9 MB batem no teto", () => {
    const { ultima } = emitirEmSerie(7, 9 * MB);
    expect(ultima.ok).toBe(false);
    expect(ultima.ok === false && ultima.motivoCodigo).toBe("SOMA");
  });
});

describe("Teto de RITMO, tambem na emissao (U3)", () => {
  it("RECUSA a 11 emissao dentro do mesmo minuto", () => {
    let estado = estadoEmissaoInicial();
    for (let i = 0; i < 10; i++) {
      const r = emitirCredencialEscrita(pedido({ estado, bytes: 1 * MB, agoraMs: T0 + i * 100 }));
      expect(r.ok).toBe(true);
      if (r.ok) estado = r.estado;
    }
    const r11 = emitirCredencialEscrita(pedido({ estado, bytes: 1 * MB, agoraMs: T0 + 1_100 }));
    expect(r11.ok).toBe(false);
    expect(r11.ok === false && r11.motivoCodigo).toBe("RITMO");
  });

  it("passado o minuto, o ritmo libera de novo (o candidato lento nao e punido)", () => {
    let estado = estadoEmissaoInicial();
    for (let i = 0; i < 10; i++) {
      const r = emitirCredencialEscrita(pedido({ estado, bytes: 1 * MB, agoraMs: T0 + i * 100 }));
      if (r.ok) estado = r.estado;
    }
    const depois = emitirCredencialEscrita(
      pedido({ estado, bytes: 1 * MB, agoraMs: T0 + 61_000 }),
    );
    expect(depois.ok).toBe(true);
  });
});

describe("O que a credencial autoriza, e sobretudo o que ela NAO autoriza (G1, G2, V10)", () => {
  const emitida = emitirCredencialEscrita(pedido());

  it("emite objeto UNICO, com nome escolhido por NOS, sob o identificador opaco", () => {
    expect(emitida.ok).toBe(true);
    if (!emitida.ok) return;
    expect(emitida.credencial.objeto).toBe("a1b2c3d4e5f6a7b8/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf");
  });

  it("NAO le, NAO lista, NAO sobrescreve, e escreve por um metodo so", () => {
    if (!emitida.ok) throw new Error("emissao deveria ter passado");
    const c = emitida.credencial;
    expect(c.permiteLeitura).toBe(false);
    expect(c.permiteListagem).toBe(false);
    expect(c.permiteSobrescrita).toBe(false);
    expect(c.metodo).toBe("PUT");
  });

  it("a nao sobrescrita esta DENTRO do que foi assinado, nao so no objeto de retorno", () => {
    if (!emitida.ok) throw new Error("emissao deveria ter passado");
    // Omitir um cabecalho nao assinado e gratis para o cliente. So vale o que entra na assinatura.
    expect(emitida.credencial.cabecalhosAssinados["x-goog-if-generation-match"]).toBe("0");
  });

  it("TIPO e FAIXA DE TAMANHO entram na assinatura (V2 no modelo novo)", () => {
    if (!emitida.ok) throw new Error("emissao deveria ter passado");
    const h = emitida.credencial.cabecalhosAssinados;
    expect(h["content-type"]).toBe("application/pdf");
    expect(h["x-goog-content-length-range"]).toBe(`0,${1 * MB}`);
  });

  it("PRAZO CURTO, na ordem de minutos, nunca de horas", () => {
    if (!emitida.ok) throw new Error("emissao deveria ter passado");
    const duracaoMs = emitida.credencial.expiraEm - T0;
    expect(duracaoMs).toBeGreaterThan(0);
    expect(duracaoMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it("o nome do objeto nao carrega CPF, nome do candidato nem nome de arquivo original (V4)", () => {
    const r = emitirCredencialEscrita(
      pedido({
        // Se a implementacao aceitar estes campos, eles nao podem chegar ao objeto.
        ...({ cpf: "529.982.247-25", nome: "Fulano De Tal", nomeOriginal: "RG-fulano.pdf" } as object),
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const alvo = JSON.stringify(r.credencial);
    for (const proibido of ["529", "52998224725", "Fulano", "RG-fulano"]) {
      expect(alvo).not.toContain(proibido);
    }
  });
});

describe("O uso da credencial: o cliente nao troca o que foi assinado", () => {
  const emitida = emitirCredencialEscrita(pedido({ bytes: 2 * MB }));
  const credencial = emitida.ok ? emitida.credencial : null;

  it("ACEITA o uso exatamente como assinado", () => {
    if (!credencial) throw new Error("emissao deveria ter passado");
    const r = validarUsoCredencial(
      credencial,
      { metodo: "PUT", contentType: "application/pdf", bytes: 2 * MB },
      T0 + 1_000,
    );
    expect(r.ok).toBe(true);
  });

  it("RECUSA o cliente que troca o TIPO", () => {
    if (!credencial) throw new Error("emissao deveria ter passado");
    const r = validarUsoCredencial(
      credencial,
      { metodo: "PUT", contentType: "application/zip", bytes: 2 * MB },
      T0 + 1_000,
    );
    expect(r.ok === false && r.motivoCodigo).toBe("FORMATO");
  });

  it("RECUSA o cliente que manda MAIS bytes do que a faixa assinada", () => {
    if (!credencial) throw new Error("emissao deveria ter passado");
    const r = validarUsoCredencial(
      credencial,
      { metodo: "PUT", contentType: "application/pdf", bytes: 2 * MB + 1 },
      T0 + 1_000,
    );
    expect(r.ok === false && r.motivoCodigo).toBe("TAMANHO");
  });

  it("RECUSA GET, LIST e DELETE (A15, o vazamento em massa deste modelo)", () => {
    if (!credencial) throw new Error("emissao deveria ter passado");
    for (const metodo of ["GET", "LIST", "DELETE"] as const) {
      const r = validarUsoCredencial(
        credencial,
        { metodo, contentType: "application/pdf", bytes: 2 * MB },
        T0 + 1_000,
      );
      expect(r.ok === false && r.motivoCodigo).toBe("METODO");
    }
  });

  it("EXPIRADA nao serve mais, nem um milissegundo depois", () => {
    if (!credencial) throw new Error("emissao deveria ter passado");
    const r = validarUsoCredencial(
      credencial,
      { metodo: "PUT", contentType: "application/pdf", bytes: 2 * MB },
      credencial.expiraEm + 1,
    );
    expect(r.ok === false && r.motivoCodigo).toBe("EXPIRADA");
  });
});
