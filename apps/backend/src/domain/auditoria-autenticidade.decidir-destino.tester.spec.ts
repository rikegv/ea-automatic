import { describe, expect, it } from "vitest";
// CANÁRIO (§A.38/§A.40): escrito ANTES do código, pelo tester, do REQUISITO. A importação abaixo
// NÃO existe hoje em `domain/auditoria.ts` — `decidirDestino` será uma função PURA nova. Enquanto o
// backend não a construir, `decidirDestino` chega `undefined` e cada caso falha com "is not a
// function". Quando o backend a exportar com a tabela-verdade do requisito, a suíte fica verde.
import { decidirDestino } from "./auditoria";

/**
 * AUTENTICIDADE DE DOCUMENTO (frente do Portal) — a função PURA que decide o destino.
 *
 * O REQUISITO (decisão do diretor, desenho do arquiteto): a IA passa a devolver
 * `autenticidadeSuspeita: boolean` ORTOGONAL ao `status`. `decidirDestino(status, suspeita)` traduz
 * o par para `{ estado, conferirAutenticidade }`:
 *
 *   status      | suspeita | estado                | conferirAutenticidade
 *   ------------|----------|-----------------------|----------------------
 *   VALIDADO    | false    | ENTREGUE              | false   (caminho feliz)
 *   VALIDADO    | true     | AGUARDANDO_AUDITORIA  | true    (NUNCA ENTREGUE)
 *   INCONFORME  | qualquer | INCONFORME            | false   (reprovado já puxa humano)
 *   PENDENTE    | qualquer | PENDENTE              | false   (como hoje)
 *
 * O caso CRÍTICO é a segunda linha: um documento que a IA aprovou mas suspeita de forjado NÃO pode
 * virar ENTREGUE, porque ENTREGUE zera a pendência da régua e fecharia a frente AUDITORIA sozinha
 * (§A.3 regra 2 complemento), abrindo o gate do Cadastro com um documento possivelmente falso dentro.
 */
describe("decidirDestino — tabela-verdade da autenticidade (função pura)", () => {
  it("VALIDADO + suspeita=false → ENTREGUE, conferir=false (caminho feliz)", () => {
    expect(decidirDestino("VALIDADO", false)).toEqual({
      estado: "ENTREGUE",
      conferirAutenticidade: false,
    });
  });

  it("CRÍTICO: VALIDADO + suspeita=true → AGUARDANDO_AUDITORIA + conferir=true, NUNCA ENTREGUE", () => {
    const d = decidirDestino("VALIDADO", true);
    expect(d).toEqual({ estado: "AGUARDANDO_AUDITORIA", conferirAutenticidade: true });
    // Reforço explícito do invariante que a frente inteira existe para garantir:
    expect(d.estado).not.toBe("ENTREGUE");
    expect(d.conferirAutenticidade).toBe(true);
  });

  it("INCONFORME + suspeita=false → INCONFORME, conferir=false", () => {
    expect(decidirDestino("INCONFORME", false)).toEqual({
      estado: "INCONFORME",
      conferirAutenticidade: false,
    });
  });

  it("INCONFORME + suspeita=true → ainda INCONFORME, conferir=false (o reprovado já puxa humano)", () => {
    // Suspeita sobre um documento JÁ reprovado não cria uma segunda fila: ele já vai ao humano pelo
    // fluxo normal do INCONFORME. A marca de autenticidade é reservada ao caso em que a IA aprovaria.
    expect(decidirDestino("INCONFORME", true)).toEqual({
      estado: "INCONFORME",
      conferirAutenticidade: false,
    });
  });

  it("PENDENTE → PENDENTE, conferir=false (comportamento de hoje, suspeita não altera)", () => {
    expect(decidirDestino("PENDENTE", false)).toEqual({
      estado: "PENDENTE",
      conferirAutenticidade: false,
    });
    expect(decidirDestino("PENDENTE", true)).toEqual({
      estado: "PENDENTE",
      conferirAutenticidade: false,
    });
  });
});
