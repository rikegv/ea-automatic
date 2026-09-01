import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { lojaDaLinhaDoLote, validarLojaDoCliente } from "./loja-da-admissao";

/**
 * A INVARIANTE QUE O BANCO NÃO EXPRESSA: a loja tem de ser do MESMO cliente da admissão.
 *
 * A chave estrangeira garante que a loja EXISTE, não que ela seja do cliente certo, e declarar isso
 * no banco exigiria uma composta com `cod_cliente`, que em `admissoes` é nulável. Sem esta guarda,
 * uma admissão do DIA poderia apontar para uma loja do CRM: o Alto Volume somaria aquela pessoa numa
 * loja de outro cliente e NADA acusaria, porque a chave estrangeira está satisfeita. É erro
 * silencioso de contagem, do tipo que a §A.27 existe para impedir.
 *
 * Estes testes cobrem os quatro caminhos de escrita de uma vez, porque os quatro passam por aqui:
 * wizard, liberação individual, liberação em lote e edição.
 */

/** Banco falso: devolve as linhas que o teste mandar, ignorando a query. */
function dbCom(linhas: { id: string; ativo: boolean }[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(linhas),
  };
  return { select: () => chain } as never;
}

describe("validarLojaDoCliente", () => {
  it("SEM loja passa: é o caso normal, a maioria dos clientes não tem lojas", async () => {
    await expect(validarLojaDoCliente(dbCom([]), "56842", undefined)).resolves.toBeUndefined();
    await expect(validarLojaDoCliente(dbCom([]), "56842", null)).resolves.toBeUndefined();
  });

  it("loja ATIVA do cliente certo passa", async () => {
    const db = dbCom([{ id: "loja-1", ativo: true }]);
    await expect(validarLojaDoCliente(db, "56842", "loja-1")).resolves.toBeUndefined();
  });

  it("RECUSA loja de OUTRO cliente: é a trava contra a contaminação cruzada", async () => {
    // A consulta filtra por (id + cod_cliente), então "de outro cliente" chega aqui como zero linhas.
    const db = dbCom([]);
    await expect(validarLojaDoCliente(db, "56566", "loja-do-crm")).rejects.toThrow(
      BadRequestException,
    );
    await expect(validarLojaDoCliente(db, "56566", "loja-do-crm")).rejects.toThrow(
      /não pertence a este cliente/,
    );
  });

  it("RECUSA loja INATIVA: loja fechada não recebe gente nova", async () => {
    const db = dbCom([{ id: "loja-1", ativo: false }]);
    await expect(validarLojaDoCliente(db, "56842", "loja-1")).rejects.toThrow(/inativa/);
  });

  it("RECUSA loja em admissão SEM cliente: não há contra o que validar", async () => {
    // A pré-admissão do Pandapé chega sem cliente. Aceitar loja aí seria criar um vínculo que
    // nenhuma validação futura conseguiria conferir.
    await expect(validarLojaDoCliente(dbCom([]), null, "loja-1")).rejects.toThrow(
      /antes de a admissão ter cliente/,
    );
  });

  it("a mensagem NÃO distingue 'não existe' de 'é de outro cliente'", async () => {
    // Distinguir contaria a quem chama que aquele id existe em algum outro cliente.
    await expect(validarLojaDoCliente(dbCom([]), "56842", "id-qualquer")).rejects.toThrow(
      "A loja escolhida não pertence a este cliente.",
    );
  });
});

describe("lojaDaLinhaDoLote (Q9: cada um para a sua loja)", () => {
  const pares = [
    { admissaoId: "a-1", lojaId: "loja-morumbi" },
    { admissaoId: "a-2", lojaId: "loja-centro" },
  ];

  it("cada admissão recebe a SUA loja, não uma loja do lote", () => {
    expect(lojaDaLinhaDoLote(pares, "a-1")).toBe("loja-morumbi");
    expect(lojaDaLinhaDoLote(pares, "a-2")).toBe("loja-centro");
  });

  it("admissão FORA da lista fica sem loja, e isso é desfecho válido", () => {
    // Mesmo tratamento de qualquer campo em branco do lote: vira pendência individual na esteira e
    // não bloqueia (regra 5). Não é erro, e por isso não lança.
    expect(lojaDaLinhaDoLote(pares, "a-3")).toBeUndefined();
  });

  it("lote sem nenhuma loja informada sai idêntico ao comportamento de antes", () => {
    expect(lojaDaLinhaDoLote(undefined, "a-1")).toBeUndefined();
    expect(lojaDaLinhaDoLote([], "a-1")).toBeUndefined();
  });
});
