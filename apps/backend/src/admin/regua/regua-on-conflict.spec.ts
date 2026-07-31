import { describe, expect, it } from "vitest";
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  clienteBeneficioPadrao,
  clientePendenciaConfig,
  reguaDocumental,
} from "../../db/schema";

/**
 * INCIDENTE DE PRODUÇÃO: criar régua documental devolvia 500 para TODOS os papéis.
 *
 * `PostgresError: there is no unique or exclusion constraint matching the ON CONFLICT specification`.
 *
 * CAUSA. A migração do vínculo (0056) trocou a PRIMARY KEY composta de `regua_documental` por um
 * `id` próprio mais DOIS índices unique PARCIAIS: `uq_regua_cliente` (WHERE cliente_vinculo_id IS
 * NULL) e `uq_regua_vinculo` (WHERE IS NOT NULL). O Postgres NÃO infere índice parcial a partir de
 * `ON CONFLICT (colunas)`: é preciso repetir o mesmo predicado. Sem ele, o upsert deixou de casar com
 * qualquer constraint e passou a estourar. A mesma migração fez o mesmo com `cliente_pendencia_config`
 * e `cliente_beneficio_padrao`, então os três upserts quebraram juntos (um deles em silêncio, porque
 * vivia dentro de um `catch` best-effort).
 *
 * POR QUE ESTE TESTE EXISTE, e por que ele olha o SQL. Nenhum teste de serviço com banco falso pegaria
 * isto: o defeito só aparece quando o Postgres de verdade tenta inferir o índice. Aqui a query é
 * MONTADA de verdade (mesmo construtor do serviço) e o SQL gerado é inspecionado, sem conexão nenhuma.
 */
const db = drizzle(postgres("postgres://ninguem@127.0.0.1:1/nada", { max: 1 }));

describe("ON CONFLICT das tabelas com índice unique PARCIAL", () => {
  it("régua documental: o upsert carrega o predicado do índice parcial", () => {
    const { sql } = db
      .insert(reguaDocumental)
      .values({
        codCliente: "0060",
        cargoId: "00000000-0000-0000-0000-000000000001",
        tipoDocumentoId: "00000000-0000-0000-0000-000000000002",
        exigencia: "OBRIGATORIO",
      })
      .onConflictDoUpdate({
        target: [
          reguaDocumental.codCliente,
          reguaDocumental.cargoId,
          reguaDocumental.tipoDocumentoId,
        ],
        targetWhere: isNull(reguaDocumental.clienteVinculoId),
        set: { exigencia: "OBRIGATORIO", atualizadoEm: new Date() },
      })
      .toSQL();

    expect(sql).toContain("on conflict");
    // É esta cláusula que faltava e derrubou a tela.
    expect(sql.toLowerCase()).toMatch(/on conflict[^)]*\)\s*where\s+[^ ]*"cliente_vinculo_id" is null/);
  });

  it("SEM o predicado o SQL sai como saía antes: é a assinatura do defeito", () => {
    const { sql } = db
      .insert(reguaDocumental)
      .values({
        codCliente: "0060",
        cargoId: "00000000-0000-0000-0000-000000000001",
        tipoDocumentoId: "00000000-0000-0000-0000-000000000002",
        exigencia: "OBRIGATORIO",
      })
      .onConflictDoUpdate({
        target: [
          reguaDocumental.codCliente,
          reguaDocumental.cargoId,
          reguaDocumental.tipoDocumentoId,
        ],
        set: { exigencia: "OBRIGATORIO" },
      })
      .toSQL();

    // Documenta o contraste: sem `where`, o Postgres não acha índice e responde 500.
    expect(sql.toLowerCase()).not.toMatch(/where\s+[^ ]*"cliente_vinculo_id" is null/);
  });

  it("configuração de pendência por cliente: mesmo predicado", () => {
    const { sql } = db
      .insert(clientePendenciaConfig)
      .values({ codCliente: "0060", chave: "CENTRO_CUSTO", obrigatorio: false })
      .onConflictDoUpdate({
        target: [clientePendenciaConfig.codCliente, clientePendenciaConfig.chave],
        targetWhere: isNull(clientePendenciaConfig.clienteVinculoId),
        set: { obrigatorio: false },
      })
      .toSQL();

    expect(sql.toLowerCase()).toMatch(/on conflict[^)]*\)\s*where\s+[^ ]*"cliente_vinculo_id" is null/);
  });

  it("padrão de benefício do cliente: mesmo predicado (este falhava em SILÊNCIO)", () => {
    const { sql } = db
      .insert(clienteBeneficioPadrao)
      .values({ codCliente: "0060", beneficio: "VR", valor: "44.00" })
      .onConflictDoUpdate({
        target: [clienteBeneficioPadrao.codCliente, clienteBeneficioPadrao.beneficio],
        targetWhere: isNull(clienteBeneficioPadrao.clienteVinculoId),
        set: { valor: "44.00" },
      })
      .toSQL();

    expect(sql.toLowerCase()).toMatch(/on conflict[^)]*\)\s*where\s+[^ ]*"cliente_vinculo_id" is null/);
  });
});
