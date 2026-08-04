import { describe, expect, it } from "vitest";
import { STATUS_INTEGRACAO, STATUS_INTEGRACAO_LABEL, FRENTE } from "@ea/shared-types";
import { kitLiberado, podeAbrirCadastro, type EstadoFrente } from "./frentes";
import { ORDEM_STATUS, STATUS_CONCLUI, conclui, isReversao, isStatusValido } from "./esteira";
import { STATUS_INICIAL_FRENTE } from "./admissao";

/**
 * FRENTE INTEGRAÇÃO, a última etapa da esteira (decisão do diretor). ONDA 1: a fundação.
 *
 * O TESTE QUE MAIS IMPORTA AQUI É O DO PARALELISMO. A integração roda AO MESMO TEMPO que a
 * assinatura do contrato, e não depois dela: às vezes o candidato está em integração e aproveita-se
 * para reforçar a assinatura. Isso significa que o gate do kit (`kitLiberado`, que libera o envelope
 * da Clicksign) NÃO pode passar a exigir a integração. Como ele resolve por NOME de frente, e não
 * por contagem, a frente nova entrou sem tocar nele; estes testes travam esse comportamento para que
 * uma refatoração futura não transforme o paralelo em sequência e pare a assinatura.
 */

const f = (tipo: EstadoFrente["tipo"], concluida: boolean): EstadoFrente => ({ tipo, concluida });
const TRES_CONCLUIDAS: EstadoFrente[] = [
  f("AUDITORIA", true),
  f("EXAME", true),
  f("CADASTRO_CONTRATO", true),
];

describe("a integração NÃO entra no gate do kit (roda em paralelo com a assinatura)", () => {
  it("kit liberado com as três frentes, mesmo SEM a integração existir", () => {
    expect(kitLiberado(TRES_CONCLUIDAS)).toBe(true);
  });

  it("kit CONTINUA liberado com a integração aberta: a assinatura não espera por ela", () => {
    expect(kitLiberado([...TRES_CONCLUIDAS, f("INTEGRACAO", false)])).toBe(true);
  });

  it("integração concluída também não muda o gate do kit", () => {
    expect(kitLiberado([...TRES_CONCLUIDAS, f("INTEGRACAO", true)])).toBe(true);
  });

  it("o gate do Cadastro segue olhando só Auditoria e Exame", () => {
    expect(podeAbrirCadastro([f("AUDITORIA", true), f("EXAME", true), f("INTEGRACAO", false)])).toBe(
      true,
    );
    expect(podeAbrirCadastro([f("AUDITORIA", true), f("EXAME", false), f("INTEGRACAO", true)])).toBe(
      false,
    );
  });
});

describe("catálogo e máquina de estados da INTEGRAÇÃO", () => {
  it("a frente existe no domínio", () => {
    expect(FRENTE).toContain("INTEGRACAO");
  });

  it("nasce A Agendar, como o Exame: a frente existe antes de ter data", () => {
    expect(STATUS_INICIAL_FRENTE.INTEGRACAO).toBe("A_AGENDAR");
  });

  it("REALIZADO é o único concluinte, e concluir aqui é o fim da esteira", () => {
    expect(STATUS_CONCLUI.INTEGRACAO).toBe("REALIZADO");
    expect(conclui("INTEGRACAO", "REALIZADO")).toBe(true);
    for (const s of ["A_AGENDAR", "AGENDADO", "DECLINOU", "RESCISAO"]) {
      expect(conclui("INTEGRACAO", s)).toBe(false);
    }
  });

  it("os desfechos usam os nomes dos faróis existentes, sem inventar CANCELADA", () => {
    expect(STATUS_INTEGRACAO).toContain("DECLINOU");
    expect(STATUS_INTEGRACAO).toContain("RESCISAO");
    expect(STATUS_INTEGRACAO).not.toContain("CANCELADA");
    expect(STATUS_INTEGRACAO).not.toContain("CANCELADO");
  });

  it("a progressão do catálogo bate com os status declarados", () => {
    expect(ORDEM_STATUS.INTEGRACAO).toEqual([...STATUS_INTEGRACAO]);
    for (const s of STATUS_INTEGRACAO) expect(isStatusValido("INTEGRACAO", s)).toBe(true);
    expect(isStatusValido("INTEGRACAO", "APTO")).toBe(false);
  });

  it("voltar de Agendado para A Agendar é reversão; avançar não é", () => {
    expect(isReversao("INTEGRACAO", "AGENDADO", "A_AGENDAR")).toBe(true);
    expect(isReversao("INTEGRACAO", "A_AGENDAR", "AGENDADO")).toBe(false);
    expect(isReversao("INTEGRACAO", "AGENDADO", "REALIZADO")).toBe(false);
  });

  it("todo status tem rótulo em Title Case (§A.24)", () => {
    for (const s of STATUS_INTEGRACAO) {
      const r = STATUS_INTEGRACAO_LABEL[s];
      expect(r).toBeTruthy();
      expect(r[0]).toBe(r[0].toUpperCase());
    }
  });
});
