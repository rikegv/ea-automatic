import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_RECUSA_DE_ENVIO, type MotivoDeRecusaDeEnvio } from "@ea/shared-types";
import {
  avisoDaRecusa,
  corpoDoEmailDoLink,
  emailEnviavel,
  mascararEmail,
} from "../domain/portal-envio";
import { CPF_SINTETICO, EMAIL_SINTETICO, URL_SINTETICA } from "./portal-envio.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38/§A.40) DAS FUNÇÕES PURAS DO ENVIO DO LINK ─────────────────────
 *
 * Escrito ANTES do código, contra o REQUISITO, por quem não vai implementá-lo. Enquanto
 * `domain/portal-envio.ts` não existir, este arquivo falha na IMPORTAÇÃO, e isso é o desenho.
 *
 * O que ele protege, e o que acontece na produção se cair:
 *  - a MÁSCARA (regra 11). Máscara frouxa é o endereço em claro na tela, no relatório do lote e em
 *    qualquer print que alguém cole em outro lugar. O caso de 1 e 2 letras é o que toda
 *    implementação ingênua vaza, porque "primeira + última" de uma conta de 2 letras é a conta
 *    inteira.
 *  - a DISTINÇÃO ENTRE AS DUAS RECUSAS (regra 2). `SEM_EMAIL` é "o cadastro está vazio, alguém
 *    precisa preencher"; `EMAIL_INVALIDO` é "tem coisa escrita e está errada". Coladas num
 *    booleano, o RH persegue o problema errado, e a segunda some do relatório do lote.
 *  - o TEXTO QUE VAI AO HUMANO: sem travessão (§A.11) e sem PII (§A.6).
 */

/**
 * O QUE `emailEnviavel` DEVOLVE ainda não está no contrato de tipos, então esta função NORMALIZA
 * as formas plausíveis (o motivo direto, `{ motivo }`, `{ ok, motivo }`) e RECUSA a forma que não
 * atende ao requisito: um booleano puro, que por construção não distingue as duas recusas.
 */
function motivoDe(resposta: unknown): MotivoDeRecusaDeEnvio | null {
  if (resposta === null || resposta === undefined || resposta === true) return null;
  if (resposta === false) {
    throw new Error(
      "`emailEnviavel` devolveu um booleano: a forma não distingue SEM_EMAIL de EMAIL_INVALIDO (regra 2)",
    );
  }
  if (typeof resposta === "string") return resposta as MotivoDeRecusaDeEnvio;
  const o = resposta as { ok?: boolean; motivo?: MotivoDeRecusaDeEnvio | null };
  if (o.motivo !== undefined) return o.motivo;
  return o.ok ? null : ("SEM_EMAIL" as MotivoDeRecusaDeEnvio);
}

const local = (mascarado: string) => mascarado.split("@")[0] ?? "";

describe("mascararEmail: o endereço nunca aparece em claro (regra 11, §A.6)", () => {
  it("nunca devolve o endereço inteiro", () => {
    expect(mascararEmail(EMAIL_SINTETICO)).not.toBe(EMAIL_SINTETICO);
  });

  it("some com a conta e preserva o domínio, que é o que dá utilidade à conferência", () => {
    const m = mascararEmail("fulano.detal@exemplo-sintetico.test") ?? "";
    expect(m.endsWith("@exemplo-sintetico.test"), "o domínio é o que o RH confere").toBe(true);
    expect(local(m)).not.toBe("fulano.detal");
    expect(local(m)).toContain("*");
  });

  /**
   * A CONTA CURTA É O CASO QUE VAZA. "primeira + asteriscos + última" aplicado a `ab` devolve
   * `ab`: a máscara não mascarou nada e ninguém repara, porque o formato parece certo. Em três
   * letras (`ana`) o resultado é `a****a`, que expõe DUAS das três e deixa uma por adivinhar,
   * achado da auditoria que moveu o corte de dois para três.
   */
  it.each(["a", "ab", "jo", "ana", "rh1"])("a conta de até 3 letras (`%s`) não sobrevive à máscara", (conta) => {
    const m = mascararEmail(`${conta}@exemplo-sintetico.test`) ?? "";
    const visivel = local(m);
    expect(visivel, "a conta curta apareceu em claro").not.toBe(conta);
    for (const letra of conta) {
      expect(visivel.includes(letra), `a letra "${letra}" da conta continua visível`).toBe(false);
    }
  });

  it("não inventa endereço quando não há: vazio e nulo viram nulo", () => {
    expect(mascararEmail(null as never)).toBeNull();
    expect(mascararEmail("")).toBeNull();
    expect(mascararEmail("   ")).toBeNull();
  });

  /** Lixo no cadastro não pode virar máscara com cara de endereço válido na tela. */
  it("o que não é endereço não vira máscara plausível", () => {
    expect(mascararEmail("sem-arroba")).not.toBe("s*******a");
  });
});

describe("emailEnviavel: as duas recusas são DISTINTAS (regra 2)", () => {
  it("cadastro vazio é SEM_EMAIL", () => {
    expect(motivoDe(emailEnviavel(null as never))).toBe("SEM_EMAIL");
    expect(motivoDe(emailEnviavel(""))).toBe("SEM_EMAIL");
    expect(motivoDe(emailEnviavel("   "))).toBe("SEM_EMAIL");
  });

  it.each(["fulano.detal@", "@exemplo.test", "fulano detal@exemplo.test", "sem-arroba", "a@b"])(
    "`%s` é EMAIL_INVALIDO, e não SEM_EMAIL",
    (entrada) => {
      expect(motivoDe(emailEnviavel(entrada))).toBe("EMAIL_INVALIDO");
    },
  );

  it("endereço bom passa, inclusive com espaço em volta", () => {
    expect(motivoDe(emailEnviavel(EMAIL_SINTETICO))).toBeNull();
    expect(motivoDe(emailEnviavel(`  ${EMAIL_SINTETICO}  `))).toBeNull();
  });

  it("o motivo devolvido pertence ao catálogo fechado do contrato", () => {
    for (const entrada of ["", "sem-arroba", EMAIL_SINTETICO]) {
      const m = motivoDe(emailEnviavel(entrada));
      if (m !== null) expect(MOTIVOS_DE_RECUSA_DE_ENVIO).toContain(m);
    }
  });
});

describe("avisoDaRecusa: fala com o humano sem carregar PII (§A.6) e sem travessão (§A.11)", () => {
  it.each(MOTIVOS_DE_RECUSA_DE_ENVIO)("`%s` tem frase própria, e ela é única", (motivo) => {
    const frase = avisoDaRecusa(motivo);
    expect(typeof frase).toBe("string");
    expect(frase.trim().length, "motivo sem frase deixa a tela dizendo o código cru").toBeGreaterThan(0);
  });

  it("nenhuma frase se repete: código distinto que diz a mesma coisa não ajuda ninguém", () => {
    const frases = MOTIVOS_DE_RECUSA_DE_ENVIO.map((m) => avisoDaRecusa(m));
    expect(new Set(frases).size).toBe(frases.length);
  });

  /**
   * S11: nenhuma mensagem de erro ecoa o endereço, inclusive a lista de falhas do lote, que é
   * justamente o texto que alguém copia inteiro e cola em outro lugar.
   */
  it("nenhuma frase carrega arroba, endereço ou CPF", () => {
    for (const motivo of MOTIVOS_DE_RECUSA_DE_ENVIO) {
      const frase = avisoDaRecusa(motivo);
      expect(frase).not.toContain("@");
      expect(frase).not.toContain(EMAIL_SINTETICO);
      expect(frase).not.toContain(CPF_SINTETICO);
    }
  });

  it("nenhuma frase usa travessão (§A.11, regra permanente)", () => {
    for (const motivo of MOTIVOS_DE_RECUSA_DE_ENVIO) {
      expect(avisoDaRecusa(motivo)).not.toContain("—");
    }
  });
});

describe("corpoDoEmailDoLink: leva a credencial e NADA mais", () => {
  /** Tolerante ao nome do parâmetro: o contrato de tipos não fixou a assinatura desta função. */
  const corpo = () =>
    JSON.stringify(
      corpoDoEmailDoLink({
        nome: "Candidato Sintético",
        url: URL_SINTETICA,
        link: URL_SINTETICA,
        expiraEm: new Date("2026-09-24T12:00:00.000Z"),
      } as never),
    );

  it("o link vai dentro: sem ele o e-mail não serve para nada", () => {
    expect(corpo()).toContain(URL_SINTETICA);
  });

  it("o CPF NÃO vai dentro (§A.6): e-mail é canal que atravessa provedor de terceiro", () => {
    expect(corpo()).not.toContain(CPF_SINTETICO);
  });

  it("o texto não usa travessão (§A.11): é texto que chega ao candidato", () => {
    expect(corpo()).not.toContain("—");
  });

  it("diz o prazo, porque o link morre em 72 horas e o candidato precisa saber", () => {
    expect(/72|hora|prazo|expira/i.test(corpo())).toBe(true);
  });
});
