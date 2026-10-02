import { describe, expect, it } from "vitest";
import {
  AVISO_SUSPEITA_AUTENTICIDADE,
  ROTULO_SUSPEITA_AUTENTICIDADE,
  limitarMotivo,
  observacaoDoVeredito,
} from "./auditoria";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40 regra 2). Esta funcao e NOVA e nao tinha teste nenhum: medido por
 * `grep observacaoDoVeredito`, os unicos arquivos que a mencionavam eram os DOIS escritores
 * (`auditoria.service.ts` e `portal-credencial.service.ts`) e a propria `domain/auditoria.ts`.
 *
 * ELA E A SAIDA ESCOLHIDA PARA UMA MARCA QUE ERA ESCRITA E NUNCA LIDA (mapa de alcance, secao 4,
 * saida (a)): nenhuma tela mostra `conferir_autenticidade`, entao o aviso de suspeita entra na
 * `observacao` do proprio veredito, prefixado. E a unica coisa que faz o humano da fila saber que ha
 * o que conferir, e por isso ela merece regua propria.
 *
 * NOTA DE PROCESSO, porque muda a leitura do placar: o autor endureceu esta funcao DURANTE a minha
 * rodada. A versao de 17:06 de 02/10 recebia `autenticidadeMotivo` e INTERPOLAVA o criterio da IA na
 * `observacao`; a de 17:20 tirou o parametro da assinatura e passou a emitir TEXTO FIXO
 * (`AVISO_SUSPEITA_AUTENTICIDADE`). Este arquivo foi reescrito contra a versao endurecida, e o O4
 * abaixo e justamente a trava para a interpolacao nao voltar.
 *
 * OS QUATRO REQUISITOS QUE A DOCUMENTACAO DELA AFIRMA, e que este arquivo transforma em trava:
 *  O1  SEM suspeita o texto nao muda UM BYTE: tem de sair identico a `limitarMotivo(motivo)`, que e
 *      o que os dois chamadores ja gravavam. Se divergir, TODO documento sem suspeita teve a
 *      observacao alterada, que e regressao silenciosa em codigo validado (§A.26).
 *  O2  A ORDEM E A PRIORIDADE NO CORTE: o aviso vem PRIMEIRO, entao o cap de tamanho so come a
 *      cauda. Motivo gigante NAO pode empurrar o aviso para fora.
 *  O3  O CAP vale para o texto final, com default 500 e configuravel pelo chamador.
 *  O4  §A.6 POR CONSTRUCAO: nada que a IA escreveu entra na `observacao`. O aviso e texto NOSSO, e a
 *      funcao nem aceita o criterio. E a diferenca entre "PII-free porque o modelo obedeceu" e
 *      "PII-free porque nao ha onde o texto dele caber".
 */

const MOTIVO = "Documento legivel, dentro da validade e com os campos conferidos.";

// ── O1: sem suspeita, byte a byte ────────────────────────────────────────────────────────────

describe("O1: sem suspeita, a observacao sai IDENTICA ao que se gravava antes", () => {
  for (const motivo of [
    MOTIVO,
    "",
    "  motivo com espacos  ",
    "x".repeat(900),
    null,
    undefined,
  ] as Array<string | null | undefined>) {
    it(`motivo ${JSON.stringify(String(motivo).slice(0, 20))}: igual a limitarMotivo`, () => {
      expect(observacaoDoVeredito({ motivo, suspeita: false })).toBe(limitarMotivo(motivo));
    });
  }

  it("sem suspeita, o aviso NAO aparece (quem decide e decidirDestino, nao esta funcao)", () => {
    const texto = observacaoDoVeredito({ motivo: MOTIVO, suspeita: false });
    expect(texto).not.toContain(ROTULO_SUSPEITA_AUTENTICIDADE);
  });
});

// ── O2: a ordem e a prioridade no corte ──────────────────────────────────────────────────────

describe("O2: o aviso vem primeiro e o cap so come a cauda", () => {
  it("com suspeita, o texto COMECA com o aviso inteiro e o motivo vai na cauda", () => {
    const texto = observacaoDoVeredito({ motivo: MOTIVO, suspeita: true });
    expect(texto.startsWith(AVISO_SUSPEITA_AUTENTICIDADE)).toBe(true);
    expect(texto).toBe(`${AVISO_SUSPEITA_AUTENTICIDADE} Motivo do veredito: ${MOTIVO}`);
  });

  it("motivo GIGANTE nao empurra o aviso para fora (o requisito explicito)", () => {
    const texto = observacaoDoVeredito({ motivo: "y".repeat(10_000), suspeita: true });
    expect(texto).toHaveLength(500);
    // O aviso INTEIRO sobrevive, nao so o rotulo: e ele que diz ao humano o que fazer.
    expect(texto.startsWith(AVISO_SUSPEITA_AUTENTICIDADE)).toBe(true);
  });

  it("qualquer tamanho de motivo preserva o aviso completo", () => {
    for (const n of [0, 1, 100, 450, 499, 500, 501, 5_000]) {
      const texto = observacaoDoVeredito({ motivo: "y".repeat(n), suspeita: true });
      expect(texto.startsWith(AVISO_SUSPEITA_AUTENTICIDADE)).toBe(true);
      expect(texto.length).toBeLessThanOrEqual(500);
    }
  });
});

// ── O3: o cap ────────────────────────────────────────────────────────────────────────────────

describe("O3: o cap vale para o texto final e e configuravel", () => {
  it("o default e 500", () => {
    expect(observacaoDoVeredito({ motivo: "y".repeat(5_000), suspeita: true })).toHaveLength(500);
  });

  it("o chamador pode apertar o cap, e o inicio continua sendo o rotulo", () => {
    const texto = observacaoDoVeredito({ motivo: MOTIVO, suspeita: true }, 40);
    expect(texto).toHaveLength(40);
    expect(AVISO_SUSPEITA_AUTENTICIDADE.startsWith(texto)).toBe(true);
  });
});

// ── O4: §A.6 POR CONSTRUCAO, e a trava para a interpolacao nao voltar ────────────────────────

describe("O4: nada que a IA escreveu entra na observacao (§A.6 por construcao)", () => {
  it("suspeita sem motivo: SO o aviso fixo, sem cauda orfa e sem pontuacao duplicada", () => {
    const texto = observacaoDoVeredito({ motivo: "", suspeita: true });
    expect(texto).toBe(AVISO_SUSPEITA_AUTENTICIDADE);
    expect(texto).not.toContain("Motivo do veredito:");
    expect(texto).not.toContain("..");
    expect(texto).not.toContain(": .");
  });

  /**
   * O CRITERIO HOSTIL: a IA "justifica" a suspeita citando o que leu. Nao e cenario improvavel, e o
   * proprio ai-service admite a possibilidade ao redigir CPF por defesa em profundidade
   * (`gemini.py:532`, `_redigir_pii`, que cobre SO CPF). Carrega CPF, nome e RG de proposito.
   * §A.6: CPF de familia reservada, nome fora do lexico real.
   */
  const CRITERIO_HOSTIL =
    "O CPF 000.000.000-00 (00000000000) de CANDIDATO DE TESTE SINTETICO e o RG 12.345.678-9 estao sobrepostos.";
  const PII_PROIBIDA = [
    "000.000.000-00",
    "00000000000",
    "CANDIDATO DE TESTE SINTETICO",
    "12.345.678-9",
  ];

  it("CANARIO: criterio HOSTIL da IA nao aparece na observacao, em NENHUM caminho", () => {
    // HOJE ISSO E GARANTIDO PELA ASSINATURA, e e por isso que merece canario: se alguem
    // reintroduzir o parametro amanha e voltar a interpolar (foi o estado de 17:06 de 02/10), este
    // teste fica VERMELHO antes de chegar em producao.
    //
    // O `as never` e deliberado: ele simula o chamador que PASSA o campo. Hoje a funcao o ignora,
    // porque ele nao existe na entrada; se voltar a existir e for usado, as asercoes abaixo mordem.
    const caminhos: Array<[string, string]> = [
      [
        "com motivo",
        observacaoDoVeredito({
          motivo: MOTIVO,
          suspeita: true,
          autenticidadeMotivo: CRITERIO_HOSTIL,
        } as never),
      ],
      [
        "sem motivo",
        observacaoDoVeredito({
          motivo: "",
          suspeita: true,
          autenticidadeMotivo: CRITERIO_HOSTIL,
        } as never),
      ],
      [
        "com cap apertado",
        observacaoDoVeredito(
          { motivo: MOTIVO, suspeita: true, autenticidadeMotivo: CRITERIO_HOSTIL } as never,
          500,
        ),
      ],
      [
        "sem suspeita",
        observacaoDoVeredito({
          motivo: MOTIVO,
          suspeita: false,
          autenticidadeMotivo: CRITERIO_HOSTIL,
        } as never),
      ],
    ];

    for (const [rotulo, texto] of caminhos) {
      for (const proibida of PII_PROIBIDA) {
        expect(texto, `caminho "${rotulo}" vazou "${proibida}"`).not.toContain(proibida);
      }
      // Varredura por FORMA, nao so pela fixture: nenhum formato de CPF ou de RG pode sair daqui.
      expect(texto, rotulo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      expect(texto, rotulo).not.toMatch(/\d{11}/);
      expect(texto, rotulo).not.toMatch(/\d{2}\.\d{3}\.\d{3}-[\dxX]/);
    }
  });

  it("passar o campo extra NAO muda um byte do texto produzido", () => {
    const comCriterio = observacaoDoVeredito({
      motivo: MOTIVO,
      suspeita: true,
      autenticidadeMotivo: CRITERIO_HOSTIL,
    } as never);
    const semCriterio = observacaoDoVeredito({ motivo: MOTIVO, suspeita: true });
    expect(comCriterio).toBe(semCriterio);
  });

  it("a observacao do suspeito e EXATAMENTE aviso fixo mais o motivo do veredito, e nada mais", () => {
    // A igualdade EXATA e o que fecha a porta: qualquer texto a mais, de qualquer origem, quebra.
    expect(observacaoDoVeredito({ motivo: MOTIVO, suspeita: true })).toBe(
      `${AVISO_SUSPEITA_AUTENTICIDADE} Motivo do veredito: ${MOTIVO}`,
    );
  });

  it("o aviso e TEXTO FIXO: as duas constantes concordam e o rotulo abre a frase", () => {
    expect(AVISO_SUSPEITA_AUTENTICIDADE.startsWith(ROTULO_SUSPEITA_AUTENTICIDADE)).toBe(true);
    expect(observacaoDoVeredito({ motivo: "", suspeita: true })).toBe(AVISO_SUSPEITA_AUTENTICIDADE);
  });

  it("§A.24 (title case no rotulo) e §A.11 (sem travessao)", () => {
    expect(ROTULO_SUSPEITA_AUTENTICIDADE).toBe("Suspeita De Autenticidade");
    expect(AVISO_SUSPEITA_AUTENTICIDADE).not.toContain("—");
  });
});
