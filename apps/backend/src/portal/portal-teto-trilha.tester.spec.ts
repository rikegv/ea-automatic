import { describe, expect, it } from "vitest";
import {
  PORTAL_EVENTOS,
  PORTAL_MOTIVOS,
  montarEventoPortal,
} from "../domain/portal-evento";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * REQUISITO 2, ITENS 5 E 6: o teto de tentativas do Portal tem de FICAR REGISTRADO (quantas
 * tentativas houve, e quando a pendência caiu para a fila do time) SEM carregar dado pessoal.
 *
 * O registro não pode nascer num log solto: a trilha do Portal tem UMA porta de entrada, e ela
 * sanitiza por ALLOWLIST (`domain/portal-evento.ts`). Evento fora dela é evento sem régua de PII.
 *
 * O QUE ESTE ARQUIVO PROVA HOJE, e por que ele é VERMELHO antes do código: o vocabulário fechado
 * de motivos (`PORTAL_MOTIVOS`) NÃO tem `TENTATIVAS_ESGOTADAS`, então a recusa do teto chegaria na
 * trilha com `motivoCodigo: null`, indistinguível de "recusado, ninguém sabe por quê". O evento
 * existiria e não diria nada, que é a pior forma de um registro existir.
 */

describe("O MOTIVO DO TETO TEM DE EXISTIR NO VOCABULÁRIO FECHADO DA TRILHA", () => {
  it("PORTAL_MOTIVOS inclui TENTATIVAS_ESGOTADAS", () => {
    expect(PORTAL_MOTIVOS as readonly string[]).toContain("TENTATIVAS_ESGOTADAS");
  });

  it("o motivo ATRAVESSA a sanitização, em vez de virar null", () => {
    const evento = montarEventoPortal("PORTAL_LIMITE_ATINGIDO", {
      jtiLink: "jti-1",
      motivoCodigo: "TENTATIVAS_ESGOTADAS",
      codigoTipoDocumento: "RG",
      tentativaN: 3,
    });
    expect(evento.motivoCodigo).toBe("TENTATIVAS_ESGOTADAS");
    expect(evento.resultado).toBe("RECUSADO");
  });
});

describe("O REGISTRO DIZ QUANTAS TENTATIVAS E EM QUE PENDÊNCIA", () => {
  it("o evento de limite já existe, e é o que a queda para o time usa", () => {
    // Não se cria evento novo por criar: `PORTAL_LIMITE_ATINGIDO` é exatamente esta situação, e a
    // Sala De Segurança já o lê.
    expect(PORTAL_EVENTOS as readonly string[]).toContain("PORTAL_LIMITE_ATINGIDO");
  });

  it("a contagem e o tipo de documento atravessam a allowlist", () => {
    const evento = montarEventoPortal("PORTAL_LIMITE_ATINGIDO", {
      jtiLink: "jti-1",
      motivoCodigo: "TENTATIVAS_ESGOTADAS",
      codigoTipoDocumento: "COMPROVANTE_RESIDENCIA",
      tentativaN: 3,
      regra: "TENTATIVAS_ESGOTADAS",
    });
    // `tentativaN` responde "quantas", `codigoTipoDocumento` responde "de qual pendência", e o
    // `criado_em` da própria linha responde "quando caiu para o time".
    expect(evento.dados.tentativaN).toBe(3);
    expect(evento.dados.codigoTipoDocumento).toBe("COMPROVANTE_RESIDENCIA");
    expect(evento.jtiLink).toBe("jti-1");
  });
});

describe("§A.6: o registro do teto não vaza dado pessoal, nem por campo novo", () => {
  it("nome, CPF, e-mail, nome de arquivo e caminho do objeto NÃO atravessam", () => {
    const evento = montarEventoPortal("PORTAL_LIMITE_ATINGIDO", {
      jtiLink: "jti-1",
      motivoCodigo: "TENTATIVAS_ESGOTADAS",
      codigoTipoDocumento: "RG",
      tentativaN: 3,
      // Tudo abaixo é o que um chamador distraído passaria junto. Nada disto pode sobreviver.
      nome: "Fulano de Tal",
      cpfCru: "52998224725",
      email: "fulano@exemplo.com",
      nomeArquivo: "RG FULANO 529.982.247-25.pdf",
      objeto: "opaco/RG__uuid.pdf",
      motivoDaReprovacao: "documento ilegível de Fulano de Tal",
    });

    const serializado = JSON.stringify(evento);
    for (const pii of ["Fulano", "52998224725", "529.982.247-25", "exemplo.com", "RG__uuid"]) {
      expect(serializado).not.toContain(pii);
    }
  });

  it("o CPF do candidato, quando informado, vira HASH e nunca o número", () => {
    const evento = montarEventoPortal("PORTAL_LIMITE_ATINGIDO", {
      jtiLink: "jti-1",
      cpf: "52998224725",
      motivoCodigo: "TENTATIVAS_ESGOTADAS",
      tentativaN: 3,
    });
    expect(evento.candidatoHash).toBeTruthy();
    expect(evento.candidatoHash).not.toContain("52998224725");
    expect(evento.candidatoHash).toMatch(/^[0-9a-f]{32}$/);
  });
});
