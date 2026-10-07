import { describe, expect, it } from "vitest";
import {
  SITUACOES_CUJO_DESVINCULO_E_DE_MASTER,
  desvinculoEhDeMaster,
} from "../../domain/candidatura";
import { bancoDaCentral } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ A AUTORIZACAO DA ACAO EM MASSA E A MESMA DA UNITARIA, INCLUSIVE NO MODO-FILTRO (§A.38) ───────
 *
 * COBERTURA INDEPENDENTE, escrita ANTES do codigo a partir do REQUISITO do mapa
 * (`docs/MAPA-ALCANCE-PAGINACAO-SERVIDOR-CANDIDATOS-VAGAS.md`, secao 3.3, "RBAC MANTIDO EM MASSA").
 *
 * ┌─ O RISCO QUE ESTE ARQUIVO EXISTE PARA PEGAR ──────────────────────────────────────────────────┐
 * │ No EA, a autorizacao do DESVINCULO de quem ENTREGOU posicao (ALOCADO/ENVIADO_PARA_ADMISSAO) NAO │
 * │ mora em `@Roles` na rota: mora no SERVICE, linha a linha, em `registrarSaida` (ela le o PAPEL   │
 * │ do usuario e recusa o COMUM). O gate do cancelamento de vaga era contornavel justamente por     │
 * │ desvincular os entregues antes. Um modo-filtro que resolvesse o conjunto e escrevesse DIRETO,   │
 * │ sem passar pela MESMA `registrarSaida` com o MESMO usuario, reabriria esse contorno em MASSA:   │
 * │ um COMUM descartaria todos os ALOCADO de uma vaga de uma vez, sem Master nenhum ser consultado. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O CONTRATO: o metodo de saida em massa POR FILTRO recebe o `AuthUser` (nao so o id) e delega a
 * `registrarSaida` POR LINHA, entao a linha que o unitario recusaria volta em `falharam`, nunca
 * aplicada. Os nomes do modo-filtro sao PROPOSTA (ver `candidatos.acao-em-massa-sem-teto`).
 */

describe("a regra de autorizacao do desvinculo (a ancora que o modo-filtro NAO pode afrouxar)", () => {
  it("desvincular quem ENTREGOU posicao e acao de Master; quem esta EM SELECAO, nao", () => {
    // A regra mora no dominio, derivada de `finalizaPosicao`: ALOCADO e ENVIADO_PARA_ADMISSAO
    // entregam posicao, entao o desvinculo deles e de Master. ATIVO esta em selecao, e de qualquer um.
    expect(desvinculoEhDeMaster("ALOCADO")).toBe(true);
    expect(desvinculoEhDeMaster("ENVIADO_PARA_ADMISSAO")).toBe(true);
    expect(desvinculoEhDeMaster("ATIVO")).toBe(false);
    expect(desvinculoEhDeMaster("DESCARTADO")).toBe(false);

    expect(
      [...SITUACOES_CUJO_DESVINCULO_E_DE_MASTER].sort(),
      "a lista de situacoes master-only e a MESMA fonte que a acao em massa tem de respeitar.",
    ).toEqual(["ALOCADO", "ENVIADO_PARA_ADMISSAO"]);
  });
});

describe("o metodo de saida em massa POR FILTRO existe e carrega o usuario (nao so o id)", () => {
  it("o service expoe `registrarSaidaPorFiltro`, por onde a autorizacao unitaria e reaplicada", () => {
    const svc = bancoDaCentral({ candidatos: [] }).service as unknown as Record<string, unknown>;
    const metodo = svc["registrarSaidaPorFiltro"];
    expect(
      typeof metodo,
      "A saida em massa por filtro `registrarSaidaPorFiltro` ainda nao existe. Ela DEVE receber o AuthUser e delegar a `registrarSaida` por linha, para a trava de Master do desvinculo de ALOCADO/ENVIADO_PARA_ADMISSAO valer em massa exatamente como vale no unitario. Sem isso, um COMUM descartaria os entregues de uma vaga inteira de uma vez. Enquanto nao existir, este teste e a especificacao dela.",
    ).toBe("function");
  });

  it("o metodo recebe pelo menos DOIS argumentos (o corpo do filtro E o usuario)", () => {
    const svc = bancoDaCentral({ candidatos: [] }).service as unknown as Record<string, unknown>;
    const metodo = svc["registrarSaidaPorFiltro"];
    // `fn.length` so e legivel quando o metodo ja existe; enquanto nao existe, o teste acima falha
    // primeiro e este fica pendurado na mesma causa. Dois argumentos = (filtro, user), como o lote
    // `registrarSaidaEmLote(dto, user)`: o usuario NUNCA pode sumir da assinatura do modo-filtro.
    if (typeof metodo === "function") {
      expect(
        (metodo as (...a: unknown[]) => unknown).length,
        "sem o usuario na assinatura, a trava de papel nao tem o que ler e o COMUM descarta entregue em massa.",
      ).toBeGreaterThanOrEqual(2);
    } else {
      expect(typeof metodo, "`registrarSaidaPorFiltro` ainda nao existe (ver o teste acima).").toBe(
        "function",
      );
    }
  });
});
