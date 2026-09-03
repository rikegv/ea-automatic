import { describe, expect, it } from "vitest";
import { carimboDoGrupo } from "./grupo-da-admissao";

/**
 * O CARIMBO DO GRUPO, testado no ponto único por onde os QUATRO caminhos de escrita passam: wizard,
 * liberação (individual e lote), entrada do Pandapé e troca de cliente.
 *
 * O que estes testes protegem é a decisão do diretor de CARIMBAR em vez de derivar na leitura: o
 * grupo gravado é o da época, e nunca muda quando a loja troca de grupo depois. Quem quebrar isso
 * quebra aqui, e não em produção seis meses depois, quando o relatório do trimestre passado começar
 * a dar outro número.
 */

/** Banco falso: devolve as linhas que o teste mandar, ignorando a query. */
function dbCom(linhas: { grupoId: string }[]) {
  const chain = {
    from: () => chain,
    where: () => Promise.resolve(linhas),
  };
  return { select: () => chain } as never;
}

describe("carimboDoGrupo", () => {
  it("cliente MEMBRO devolve o id do grupo", async () => {
    const db = dbCom([{ grupoId: "grupo-corifeu" }]);
    await expect(carimboDoGrupo(db, "56450")).resolves.toBe("grupo-corifeu");
  });

  it("cliente SEM grupo devolve null, e isso é o caso normal, não pendência", async () => {
    await expect(carimboDoGrupo(dbCom([]), "51272")).resolves.toBeNull();
  });

  it("admissão SEM cliente devolve null sem nem consultar: é a pré-admissão do Pandapé", async () => {
    // Banco que EXPLODE se for consultado: prova que o caminho sem cliente nem chega ao banco, que é
    // o que faz a entrada do Pandapé (cliente nulo) continuar funcionando igual.
    const dbQueExplode = {
      select: () => {
        throw new Error("não deveria consultar o banco sem cliente");
      },
    } as never;
    await expect(carimboDoGrupo(dbQueExplode, null)).resolves.toBeNull();
    await expect(carimboDoGrupo(dbQueExplode, undefined)).resolves.toBeNull();
    await expect(carimboDoGrupo(dbQueExplode, "")).resolves.toBeNull();
  });
});
