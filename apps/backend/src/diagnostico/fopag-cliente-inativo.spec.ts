import { describe, expect, it, vi } from "vitest";
import { DiagnosticoService } from "./diagnostico.service";

/**
 * CLIENTE INATIVO NÃO ACENDE O SINAL DE PENDÊNCIA (decisão do diretor).
 *
 * O sinal "Cliente Fopag sem pasta-pai" estava cobrando pasta de cliente com quem a Soulan não tem
 * mais relacionamento e que já foi inativado no cadastro. A fonte da verdade passou a ser
 * `clientes.ativo`.
 *
 * POR QUE O TESTE OLHA O SQL, e não o resultado: os dois blocos do sinal filtram DENTRO da consulta,
 * então um fake de banco que devolve linhas prontas passa igual com ou sem o filtro e não trava
 * nada. Ler o SQL emitido é o que pega a remoção do filtro numa refatoração futura.
 *
 * E POR QUE O TESTE APAGA OS COMENTÁRIOS ANTES DE OLHAR: a primeira versão deste arquivo procurava
 * o texto "cli.ativo" na consulta crua e passava mesmo com o filtro removido, porque o COMENTÁRIO
 * que explica a regra também contém esse texto. O teste parecia verde e não travava coisa alguma.
 * Agora ele lê só o SQL executável, e a asserção é sobre a condição inteira.
 */

/** Reconstrói o texto da consulta a partir dos pedaços do objeto SQL do drizzle. */
function textoDaConsulta(q: unknown): string {
  const chunks = (q as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
  return chunks.map((c) => (c?.value !== undefined ? String(c.value) : "")).join("");
}

/** Só o SQL que o banco executa: linhas de comentário (--) fora, espaços colapsados. */
function sqlExecutavel(q: unknown): string {
  return textoDaConsulta(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ");
}

function rodarSinalFopag() {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  } as never;
  const nada = {} as never;
  const pastaPai = { fopagTemPastaPai: vi.fn(async () => false) } as never;
  const s = new DiagnosticoService(db, nada, nada, nada, nada, nada, nada, nada, pastaPai, nada);
  // O método é privado por desenho; o teste o alcança pela chave, sem afrouxar a visibilidade.
  const sinal = (s as unknown as { sinalFopagSemPasta(): Promise<unknown> }).sinalFopagSemPasta();
  return { sinal, consultas };
}

describe("sinal Fopag sem pasta-pai: cliente inativo fica de fora", () => {
  it("as DUAS consultas do sinal exigem cliente ativo no CADASTRO", async () => {
    const { sinal, consultas } = rodarSinalFopag();
    await sinal;

    expect(consultas).toHaveLength(2);
    for (const q of consultas) {
      expect(sqlExecutavel(q)).toContain("cli.ativo = true");
    }
  });

  it("o bloco por admissão viva junta a tabela de clientes para poder filtrar", async () => {
    const { sinal, consultas } = rodarSinalFopag();
    await sinal;

    const bloco1 = sqlExecutavel(consultas[0]);
    // Sem este JOIN o filtro por cadastro não teria como existir neste bloco.
    expect(bloco1).toContain("JOIN clientes cli ON cli.cod_cliente = a.cod_cliente");
    expect(bloco1).toContain("cli.ativo = true");
  });

  it("o bloco do vínculo distingue vínculo ativo de CLIENTE ativo", async () => {
    const { sinal, consultas } = rodarSinalFopag();
    await sinal;

    // v.ativo é o vínculo Fopag em vigor; cli.ativo é o cadastro do cliente. O inativo entrava na
    // fila exatamente por ter vínculo marcado como ativo num cliente já encerrado.
    const bloco2 = sqlExecutavel(consultas[1]);
    expect(bloco2).toContain("v.ativo = true");
    expect(bloco2).toContain("cli.ativo = true");
  });

  it("o sinal mantém a chave e o rótulo que a tela já conhece", async () => {
    const { sinal } = rodarSinalFopag();
    const s = (await sinal) as { chave: string; rotulo: string; total: number };

    expect(s.chave).toBe("fopag-sem-pasta");
    expect(s.rotulo).toBe("Cliente Fopag sem pasta-pai no Drive");
    expect(s.total).toBe(0);
  });
});
