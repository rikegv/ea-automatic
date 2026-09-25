import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_RECUSA_DE_ENVIO,
  ORIGENS_DE_ENVIO_DO_LINK,
  RECORTES_DO_PAINEL_PORTAL,
} from "@ea/shared-types";
import { avisoDaRecusa, enviadoHaPouco, JANELA_DE_REENVIO_MS } from "./portal-envio";
import {
  CARDS_DO_PAINEL,
  contarPainel,
  noCard,
  recorteDoCard,
  type CardDoPainel,
  type FatoDaAdmissaoNoPainel,
} from "./portal-painel";

/**
 * A RÉGUA DO CARD E A JANELA DO REENVIO, provadas sem banco.
 *
 * §A.6: tudo aqui é booleano, contagem e carimbo de tempo. Não há nome, e-mail, CPF nem URL.
 */

const fato = (f: Partial<FatoDaAdmissaoNoPainel> = {}): FatoDaAdmissaoNoPainel => ({
  acessou: false,
  obrigatorios: 10,
  obrigatoriosPendentes: 0,
  noTime: false,
  ...f,
});

describe("o vocabulário do recorte é UM só, dos dois lados", () => {
  /**
   * O contrato publica os CINCO valores (o vazio incluído, que é "todos"); o domínio conhece os
   * QUATRO que recortam. Divergindo o batismo, a tela manda um valor que o servidor recusa com
   * 400, e o sintoma na tela é a tabela vazia sem ninguém entender por quê.
   */
  it("os quatro cards do domínio são os do contrato, tirando o vazio", () => {
    expect([...CARDS_DO_PAINEL].sort()).toEqual(
      RECORTES_DO_PAINEL_PORTAL.filter(Boolean).slice().sort(),
    );
  });

  it("vazio e ausência são `todos`; desconhecido é RECUSA, e as três respostas são distintas", () => {
    expect(recorteDoCard("")).toBeNull();
    expect(recorteDoCard(null)).toBeNull();
    expect(recorteDoCard(undefined)).toBeNull();
    expect(recorteDoCard("   ")).toBeNull();
    expect(recorteDoCard("acessaram")).toBe("acessaram");
    // `undefined` é "pediram algo que não existe", e quem chama devolve 400. Virar `null` aqui
    // seria devolver a lista inteira como se o recorte tivesse sido aplicado (§A.28).
    expect(recorteDoCard("ACESSARAM")).toBeUndefined();
    expect(recorteDoCard("encaminhados")).toBeUndefined();
    expect(recorteDoCard("concluiu")).toBeUndefined();
  });
});

describe("o CARD e o CONTADOR são a mesma régua, e não duas que concordam por enquanto", () => {
  /**
   * 400 recortes sorteados, no mesmo molde do teste da régua de conclusão: cada card é contado
   * pelos dois caminhos (o contador e o filtro por `noCard`), e os dois têm de bater sempre.
   */
  it.each([...CARDS_DO_PAINEL])("`%s` conta igual pelos dois caminhos", (card: CardDoPainel) => {
    let semente = 20260921;
    const proximo = (teto: number) => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente % teto;
    };
    for (let caso = 0; caso < 400; caso += 1) {
      const fatos: FatoDaAdmissaoNoPainel[] = [];
      for (let i = 0; i < 1 + proximo(8); i += 1) {
        const obrigatorios = proximo(4);
        const aceitos = proximo(6);
        fatos.push(
          fato({
            acessou: proximo(2) === 1,
            obrigatorios,
            obrigatoriosPendentes: obrigatorios - aceitos,
            aceitos,
            noTime: proximo(2) === 1,
          }),
        );
      }
      expect(fatos.filter((f) => noCard(card, f)).length, `caso ${caso}`).toBe(
        contarPainel(fatos)[card],
      );
    }
  });

  it("`naoAcessaram` é a negação exata de `acessaram`, sem terceira possibilidade", () => {
    for (const acessou of [true, false]) {
      const f = fato({ acessou });
      expect(noCard("acessaram", f)).toBe(!noCard("naoAcessaram", f));
    }
  });

  it("CONCLUÍRAM continua exigindo acesso e régua existente (achado M1)", () => {
    expect(noCard("concluiram", fato({ acessou: false, aceitos: 10 }))).toBe(false);
    expect(noCard("concluiram", fato({ acessou: true, obrigatorios: 0, aceitos: 0 }))).toBe(false);
    expect(noCard("concluiram", fato({ acessou: true, obrigatorios: 2, aceitos: 2 }))).toBe(true);
  });
});

describe("a JANELA do reenvio (item b da S15)", () => {
  const AGORA = Date.now();

  it("sem carimbo de envio não há janela: o reenvio de quem nunca recebeu continua livre", () => {
    expect(enviadoHaPouco(null, AGORA)).toBe(false);
    expect(enviadoHaPouco(undefined, AGORA)).toBe(false);
  });

  it("o e-mail que acabou de sair está DENTRO da janela", () => {
    expect(enviadoHaPouco(new Date(AGORA - 1_000), AGORA)).toBe(true);
    expect(enviadoHaPouco(new Date(AGORA - (JANELA_DE_REENVIO_MS - 1)), AGORA)).toBe(true);
  });

  it("passada a janela, o reenvio volta a ser uma decisão de quem opera", () => {
    expect(enviadoHaPouco(new Date(AGORA - JANELA_DE_REENVIO_MS), AGORA)).toBe(false);
    expect(enviadoHaPouco(new Date(AGORA - 30 * 60_000), AGORA)).toBe(false);
  });

  /** Relógio torto não pode virar reenvio duplicado: abster-se é a direção segura. */
  it("carimbo no futuro conta como dentro da janela", () => {
    expect(enviadoHaPouco(new Date(AGORA + 60_000), AGORA)).toBe(true);
  });

  it("carimbo ilegível não trava o envio", () => {
    expect(enviadoHaPouco("não é data", AGORA)).toBe(false);
  });

  it("a janela é curta o bastante para não atrapalhar o reenvio legítimo", () => {
    expect(JANELA_DE_REENVIO_MS).toBeGreaterThanOrEqual(2 * 60_000);
    expect(JANELA_DE_REENVIO_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("as frases e os códigos novos do contrato", () => {
  it("TODO motivo tem frase própria, e nenhuma cai no ramo genérico", () => {
    const generica = avisoDaRecusa(null);
    for (const motivo of MOTIVOS_DE_RECUSA_DE_ENVIO) {
      expect(avisoDaRecusa(motivo), motivo).not.toBe(generica);
    }
  });

  /** As duas abstenções dizem coisas diferentes: é essa a razão de serem dois códigos. */
  it("a frase da janela não é a frase do link já aberto", () => {
    expect(avisoDaRecusa("ENVIADO_HA_POUCO")).not.toBe(avisoDaRecusa("LINK_VIVO_EM_USO"));
  });

  it("nenhuma frase usa travessão (§A.11)", () => {
    for (const motivo of [...MOTIVOS_DE_RECUSA_DE_ENVIO, null]) {
      expect(avisoDaRecusa(motivo)).not.toContain("—");
    }
  });

  /** `varchar(20)` na 0122: código mais longo que isso seria truncado pelo banco em silêncio. */
  it("todo código de origem cabe na coluna", () => {
    for (const origem of ORIGENS_DE_ENVIO_DO_LINK) expect(origem.length).toBeLessThanOrEqual(20);
  });
});
