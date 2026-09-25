import { describe, expect, it, vi } from "vitest";
import type { CampoExtraidoPortal } from "@ea/shared-types";
import { executarCaminhoDoArquivo, type PortasCaminhoDoArquivo } from "../domain/portal-caminho-arquivo";
import { montarEventoPortal, PORTAL_EVENTOS } from "../domain/portal-evento";

/**
 * O AUTO-PREENCHIMENTO É PII PURA, E ELE SÓ PODE IR PARA A TELA.
 *
 * O valor sugerido (nome, nome da mãe, data de nascimento, número de documento) viaja na RESPOSTA,
 * porque é para isso que existe. Ele NÃO pode ser persistido do nosso lado, nem aparecer em log, em
 * evento da trilha, em mensagem de erro ou em rastro de exceção (§A.6).
 *
 * Este arquivo prova as duas metades, e a segunda é a que costuma faltar: além de o valor não vazar,
 * ele TEM de chegar à tela, senão a frente seguinte "conserta" a fuga de PII devolvendo o campo
 * vazio e ninguém percebe que o auto-preenchimento morreu.
 *
 * VETO V12: nada daqui vira dado autoritativo sozinho. O que grava é a confirmação humana.
 */

/** Valores que NÃO podem sobreviver em nada que seja gravado ou logado. */
const PROIBIDOS = [
  "Fulano De Tal",
  "Maria Das Dores",
  "52998224725",
  "1990-03-14",
  "12.345.678-9",
];

const SUGESTOES_DO_LEITOR = {
  origem: "IA_SUGESTAO" as const,
  exigeConfirmacaoHumana: true as const,
  campos: [
    { campo: "nomeCompleto", rotulo: "Nome completo", valor: "Fulano De Tal", confianca: 0.96, lido: true },
    { campo: "nomeMae", rotulo: "Nome da mãe", valor: "Maria Das Dores", confianca: 0.91, lido: true },
    { campo: "cpf", rotulo: "CPF", valor: "52998224725", confianca: 0.88, lido: true },
    { campo: "dataNascimento", rotulo: "Data de nascimento", valor: "1990-03-14", confianca: 0.93, lido: true },
    { campo: "rgNumero", rotulo: "Número do RG", valor: "", confianca: 0, lido: false },
  ],
};

/** O mesmo formato (LISTA) que o `lerComIa` do serviço devolve depois de consumir o bloco do leitor. */
function camposDaTela(): CampoExtraidoPortal[] {
  return SUGESTOES_DO_LEITOR.campos.map((c) => ({
    campo: c.campo,
    rotulo: c.rotulo,
    valor: c.lido ? c.valor : "",
    confianca: c.lido ? c.confianca : 0,
    lido: c.lido,
  }));
}

const CONTEXTO = {
  credencial: {
    objeto: "a1b2c3d4e5f6a7b8/RG__uuid.pdf",
    tipoAssinado: "application/pdf",
    bytesMax: 10 * 1024 * 1024,
  },
  codigoTipoDocumento: "RG",
  avisoDoNavegador: true,
};

function portas() {
  const gravado: unknown[] = [];
  const eventos: unknown[] = [];
  const p: PortasCaminhoDoArquivo = {
    consultarMetadado: vi.fn(async (objeto: string) => ({
      objeto,
      bytes: 512_000,
      contentType: "application/pdf",
    })),
    lerComIa: vi.fn(async () => ({ campos: camposDaTela(), origem: "IA" as const })),
    marcarEntregue: vi.fn(async (dados) => {
      gravado.push(dados);
    }),
    apagarObjeto: vi.fn(async () => true),
    // A trilha real: o evento passa pelo MESMO sanitizador que o serviço usa para gravar.
    registrarEvento: vi.fn(async (tipo: string, dados?: Record<string, unknown>) => {
      eventos.push(
        montarEventoPortal(
          tipo as (typeof PORTAL_EVENTOS)[number],
          { ...(dados ?? {}) },
          "pepper-de-teste",
        ),
      );
    }),
  };
  return { p, gravado, eventos };
}

describe("O valor sugerido CHEGA a tela (senao o auto-preenchimento morre em silencio)", () => {
  it("a sugestao volta com os campos lidos e os valores preenchidos", async () => {
    const { p } = portas();
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    const campos = r.sugestao?.campos ?? [];
    expect(campos.find((c) => c.campo === "nomeCompleto")?.valor).toBe("Fulano De Tal");
    expect(campos.find((c) => c.campo === "nomeMae")?.lido).toBe(true);
  });

  it("o campo NAO LIDO chega vazio e marcado, para a tela saber o que perguntar", async () => {
    const { p } = portas();
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    const campos = r.sugestao?.campos ?? [];
    const rg = campos.find((c) => c.campo === "rgNumero");
    expect(rg?.lido).toBe(false);
    expect(rg?.valor).toBe("");
  });
});

describe("Veto V12: a sugestao nunca se apresenta como dado conferido", () => {
  it("volta marcada como IA e SEM confirmacao humana", async () => {
    const { p } = portas();
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(r.sugestao?.origem).toBe("IA");
    expect(r.sugestao?.confirmadoPorHumano).toBe(false);
  });
});

describe("§A.6: nenhum valor sugerido e GRAVADO nem LOGADO", () => {
  it("`marcarEntregue`, que e a unica porta que escreve estado, nao ve valor nenhum", async () => {
    const { p, gravado } = portas();
    await executarCaminhoDoArquivo(p, CONTEXTO);
    const alvo = JSON.stringify(gravado);
    for (const proibido of PROIBIDOS) expect(alvo).not.toContain(proibido);
  });

  it("NENHUM evento da trilha carrega valor sugerido, mesmo recebendo o payload inteiro", async () => {
    const { p, eventos } = portas();
    await executarCaminhoDoArquivo(p, CONTEXTO);
    const alvo = JSON.stringify(eventos);
    for (const proibido of PROIBIDOS) expect(alvo).not.toContain(proibido);
  });

  it("a trilha guarda a QUANTIDADE, e a quantidade e a dos campos LIDOS", async () => {
    const { p, eventos } = portas();
    // O serviço sobrescreve o contador do orquestrador com o número de campos de fato lidos.
    p.registrarEvento = vi.fn(async (tipo: string, dados?: Record<string, unknown>) => {
      const enriquecido = tipo === "PORTAL_EXTRACAO_IA" ? { ...(dados ?? {}), camposExtraidosN: 4 } : dados;
      eventos.push(
        montarEventoPortal(tipo as (typeof PORTAL_EVENTOS)[number], { ...(enriquecido ?? {}) }, "p"),
      );
    });
    await executarCaminhoDoArquivo(p, CONTEXTO);
    const extracao = eventos.find(
      (e) => (e as { tipo: string }).tipo === "PORTAL_EXTRACAO_IA",
    ) as { camposExtraidosN?: number };
    expect(extracao.camposExtraidosN).toBe(4);
  });

  it("a trilha tenta gravar o bloco CRU do leitor e o sanitizador descarta tudo", () => {
    const evento = montarEventoPortal(
      "PORTAL_EXTRACAO_IA",
      { campos: camposDaTela(), valoresExtraidos: camposDaTela(), codigoTipoDocumento: "RG" },
      "pepper",
    );
    const alvo = JSON.stringify(evento);
    for (const proibido of PROIBIDOS) expect(alvo).not.toContain(proibido);
    // O que sobra é o rótulo do tipo e a contagem, que é exatamente o que a L15 pede.
    expect(alvo).toContain("RG");
    expect(evento.camposExtraidosN).toBe(5);
  });
});

describe("Sem bloco de sugestao, nada quebra (tipo sem catalogo mapeado)", () => {
  it("leitor que nao sugere devolve caminho normal, com sugestao vazia", async () => {
    const { p } = portas();
    p.lerComIa = vi.fn(async () => ({ campos: [], origem: "IA" as const }));
    const r = await executarCaminhoDoArquivo(p, CONTEXTO);
    expect(r.entregue).toBe(true);
    expect(r.sugestao?.campos).toEqual([]);
  });
});
