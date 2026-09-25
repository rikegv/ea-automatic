import { describe, expect, it } from "vitest";
import { montarEventoPortal } from "./portal-evento";

/**
 * PORTAL, CAMADA L: NENHUM EVENTO CARREGA PII. ISTO E TESTE, NAO AFIRMACAO.
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CODIGO (§A.38/§A.40 regra 2). O modulo
 * `domain/portal-evento.ts` ainda nao existe. Contrato fixado:
 *
 *   montarEventoPortal(tipo, dadosCrus) -> EventoPortal
 *
 * A funcao e a UNICA porta de entrada da trilha do portal. Ela recebe o que o chamador tiver na mao,
 * inclusive PII, e devolve o registro ja reduzido: hash de candidato, hash de IP, codigo de motivo.
 * O desenho e esse de proposito. Sanitizar no ponto de escrita e o que impede que o proximo evento
 * novo nasca vazando, porque nao ha outro caminho para gravar.
 *
 * §A.6 e secao 9 de `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`: nunca, em campo nenhum, CPF cru,
 * data de nascimento, nome, e-mail, telefone, nome de arquivo original, conteudo do arquivo, token,
 * cabecalho de autorizacao, URL assinada do armazenamento, texto extraido pela IA.
 */

/** Tudo o que NAO pode sobreviver em campo nenhum de nenhum evento. */
const PROIBIDOS = [
  "52998224725",
  "529.982.247-25",
  "Fulano De Tal",
  "fulano@exemplo.com.br",
  "11987654321",
  "1990-03-14",
  "RG-fulano-de-tal.pdf",
  "eyJhbGciOiJIUzI1NiIs",
  "https://storage.googleapis.com/entrada/obj?X-Goog-Signature=abc",
  "X-Goog-Signature",
  "12.345.678-9",
  "Bearer ",
];

/** Um payload deliberadamente sujo: e assim que o chamador real vai ter os dados na mao. */
const SUJO = {
  cpf: "529.982.247-25",
  nome: "Fulano De Tal",
  email: "fulano@exemplo.com.br",
  telefone: "11987654321",
  dataNascimento: "1990-03-14",
  nomeArquivoOriginal: "RG-fulano-de-tal.pdf",
  token: "eyJhbGciOiJIUzI1NiIs.payload.assinatura",
  authorization: "Bearer eyJhbGciOiJIUzI1NiIs",
  urlAssinada: "https://storage.googleapis.com/entrada/obj?X-Goog-Signature=abc",
  valoresExtraidos: { numero: "12.345.678-9", nome: "Fulano De Tal" },
  ip: "203.0.113.45",
  userAgent: "Mozilla/5.0 (iPhone)",
  jtiLink: "8b1d0f3a-2c4e-4a7b-9f10-33aa55bb77cc",
  codigoTipoDocumento: "RG",
  bytes: 512_000,
  bytesMax: 10 * 1024 * 1024,
  tipoPermitido: "application/pdf",
};

const TIPOS = [
  "PORTAL_LINK_ABERTO",
  "PORTAL_LINK_RECUSADO",
  "PORTAL_IDENTIFICACAO_OK",
  "PORTAL_IDENTIFICACAO_FALHA",
  "PORTAL_SESSAO_EMITIDA",
  "PORTAL_CREDENCIAL_EMITIDA",
  "PORTAL_CREDENCIAL_RECUSADA",
  "PORTAL_OBJETO_CONFIRMADO",
  "PORTAL_OBJETO_NAO_CONFIRMADO",
  "PORTAL_UPLOAD_RECUSADO",
  "PORTAL_EXTRACAO_IA",
  "PORTAL_LIMITE_ATINGIDO",
] as const;

describe("Nenhum evento do portal carrega PII, em nenhum campo (§A.6)", () => {
  for (const tipo of TIPOS) {
    it(`${tipo} sai limpo mesmo recebendo um payload sujo`, () => {
      const evento = montarEventoPortal(tipo, SUJO);
      const serializado = JSON.stringify(evento);
      for (const proibido of PROIBIDOS) {
        expect(serializado).not.toContain(proibido);
      }
    });
  }

  it("o CPF vira hash, e o hash nao e reversivel por inspecao nem igual ao CPF", () => {
    const evento = montarEventoPortal("PORTAL_IDENTIFICACAO_OK", SUJO);
    expect(evento.candidatoHash).toMatch(/^[0-9a-f]{32}$/);
    expect(evento.candidatoHash).not.toContain("52998224725");
  });

  it("o mesmo CPF gera o mesmo hash, e CPFs diferentes geram hashes diferentes", () => {
    const a = montarEventoPortal("PORTAL_IDENTIFICACAO_OK", SUJO).candidatoHash;
    const b = montarEventoPortal("PORTAL_IDENTIFICACAO_OK", SUJO).candidatoHash;
    const c = montarEventoPortal("PORTAL_IDENTIFICACAO_OK", {
      ...SUJO,
      cpf: "111.444.777-35",
    }).candidatoHash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

/**
 * A ALLOWLIST DE NOME NAO DIZ NADA SOBRE O VALOR, e `origem` era a fresta.
 *
 * Achado da auditoria do envio do link: num arquivo cuja razao de existir e ser lista FECHADA, um
 * campo que aceita qualquer string e convite. Os dois chamadores de hoje passam `"MANUAL"` (fixo
 * no handler) e `"AUTOMATICO"` (carimbado pelo servico), entao nenhuma PII passa por aqui neste
 * instante; a defesa existe porque `montarEventoPortal` recebe o payload SUJO e nao pode depender
 * de quem chama.
 */
describe("`origem` tambem e conferida no VALOR, e nao so no nome (§A.6)", () => {
  it("os dois codigos do envio atravessam", () => {
    for (const origem of ["MANUAL", "AUTOMATICO"]) {
      const evento = montarEventoPortal("PORTAL_LINK_ENVIADO", { origem });
      expect(evento.dados.origem).toBe(origem);
    }
  });

  it("qualquer outra coisa e DESCARTADA, inclusive quando parece dado", () => {
    for (const forjada of [
      "fulano@exemplo-sintetico.test",
      "52998224725",
      "manual",
      "",
      "AUTOMATICO ",
    ]) {
      const evento = montarEventoPortal("PORTAL_LINK_ENVIADO", { origem: forjada });
      expect(
        evento.dados.origem,
        `\`${forjada}\` atravessou como origem. A trilha perder um rotulo e o lado certo de errar`,
      ).toBeUndefined();
    }
  });
});

describe("O motivo nunca vira oraculo (L6, V7)", () => {
  it("identificacao que falhou registra sempre NAO_CASOU, mesmo sabendo o motivo real", () => {
    const inexistente = montarEventoPortal("PORTAL_IDENTIFICACAO_FALHA", {
      ...SUJO,
      motivoReal: "CPF_INEXISTENTE",
    });
    const dataErrada = montarEventoPortal("PORTAL_IDENTIFICACAO_FALHA", {
      ...SUJO,
      motivoReal: "DATA_NASCIMENTO_ERRADA",
    });
    expect(inexistente.motivoCodigo).toBe("NAO_CASOU");
    expect(dataErrada.motivoCodigo).toBe("NAO_CASOU");
  });

  it("o motivo e codigo curto de enum, nunca texto livre vindo de fora", () => {
    const e = montarEventoPortal("PORTAL_UPLOAD_RECUSADO", {
      ...SUJO,
      motivoCodigo: "o arquivo RG-fulano-de-tal.pdf do CPF 529.982.247-25 falhou",
    });
    expect(e.motivoCodigo ?? "").not.toContain("fulano");
    expect(e.motivoCodigo ?? "").not.toContain("529");
  });
});

describe("O evento da credencial registra o teto concedido, nunca a credencial (L21)", () => {
  it("guarda tipo de documento, bytes maximos e tipo permitido", () => {
    const e = montarEventoPortal("PORTAL_CREDENCIAL_EMITIDA", SUJO);
    const serializado = JSON.stringify(e);
    expect(serializado).toContain("RG");
    expect(serializado).toContain(String(10 * 1024 * 1024));
  });

  it("nao guarda a URL assinada nem o caminho completo do objeto", () => {
    const e = montarEventoPortal("PORTAL_CREDENCIAL_EMITIDA", {
      ...SUJO,
      objeto: "a1b2c3d4e5f6a7b8/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf",
    });
    const serializado = JSON.stringify(e);
    expect(serializado).not.toContain("storage.googleapis.com");
    expect(serializado).not.toContain("0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b");
  });
});

describe("O que a IA leu nao vai para a trilha (L15)", () => {
  it("registra a quantidade de campos, nunca os valores", () => {
    const e = montarEventoPortal("PORTAL_EXTRACAO_IA", SUJO);
    const serializado = JSON.stringify(e);
    expect(serializado).not.toContain("12.345.678-9");
    expect(e.camposExtraidosN).toBe(2);
  });
});
