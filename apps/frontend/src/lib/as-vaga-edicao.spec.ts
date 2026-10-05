import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  confirmacoesDepoisDe,
  corpoDaEdicao,
  podeExcluirVagaPeloPapel,
  recrutadoresDaEdicao,
  recusaDaEdicao,
} from "./as-vaga-edicao";

/**
 * AS RÉGUAS PURAS DA FRENTE DO CRUD DA VAGA LIBERADA, do lado da tela.
 * O comportamento da trilha está em `TrilhaDaVaga.edicao.spec.tsx`; o do modal de exclusão em
 * `ExcluirVagaModal.spec.tsx`.
 */

describe("excluir vaga: só o SUPER_ADMIN vê o botão", () => {
  it("SUPER_ADMIN vê; MASTER, COMUM e sessão sem papel não veem", () => {
    expect(podeExcluirVagaPeloPapel("SUPER_ADMIN")).toBe(true);
    expect(podeExcluirVagaPeloPapel("MASTER")).toBe(false);
    expect(podeExcluirVagaPeloPapel("COMUM")).toBe(false);
    expect(podeExcluirVagaPeloPapel(undefined)).toBe(false);
    expect(podeExcluirVagaPeloPapel(null)).toBe(false);
  });

  /* A RÉGUA SÓ VALE SE A CENTRAL DE VAGAS A USA: a ação "excluir" precisa estar dentro do `if` dela,
     e não solta na lista de ações. Lido do fonte porque a página não monta isolada em teste. */
  it("a ação de excluir da Central de Vagas está atrás da régua do papel", () => {
    const fonte = readFileSync(join(__dirname, "..", "app", "(app)", "as", "vagas", "page.tsx"), "utf8");
    const bloco = /if \(podeExcluirVagaPeloPapel\(user\?\.papel\)\) \{\s*lista\.push\(\{\s*id: "excluir",/;
    expect(bloco.test(fonte)).toBe(true);
    expect(fonte.match(/id: "excluir"/g)).toHaveLength(1);
  });
});

describe("o corpo da edição", () => {
  const trilha = {
    codigo: "PS-1",
    status: "ABERTA",
    contraparteId: "x",
    envioShortlist: "2026-09-01",
    regiaoEstado: "SP",
    codCliente: "1",
    cargoId: "c1",
    nomeDivulgacao: "Operador",
    observacoes: undefined,
    posicoesOficiais: undefined,
    posicoesBanco: 0,
    beneficios: [],
  };

  it("tira o que a edição nunca escreve e os travados, e esvaziado vira null", () => {
    const corpo = corpoDaEdicao(
      trilha,
      new Set(["codCliente"]),
      { consultorId: "u1", recruiterId: "" },
      {},
    );
    for (const fora of ["codigo", "status", "contraparteId", "envioShortlist", "codCliente"]) {
      expect(corpo).not.toHaveProperty(fora);
    }
    expect(corpo.cargoId).toBe("c1");
    expect(corpo.observacoes).toBeNull();
    // Posição em branco nunca zera a meta: continua ausente.
    expect(corpo).not.toHaveProperty("posicoesOficiais");
    expect(corpo.posicoesBanco).toBe(0);
    expect(corpo.consultorId).toBe("u1");
    expect(corpo.recruiterId).toBeNull();
    expect(corpo).not.toHaveProperty("confirmarTrocaDeCliente");
  });

  it("leva as confirmações já dadas", () => {
    const corpo = corpoDaEdicao(
      trilha,
      new Set(),
      { consultorId: "", recruiterId: "" },
      { confirmarTrocaDeCliente: true, confirmarAbaixoDoAlocado: true },
    );
    expect(corpo.confirmarTrocaDeCliente).toBe(true);
    expect(corpo.confirmarAbaixoDoAlocado).toBe(true);
  });
});

describe("o 409 da edição", () => {
  it("reconhece pelo código e lê a frase de `mensagem`", () => {
    const n = recusaDaEdicao(
      new ApiError("Conflict", 409, { codigo: "CONFIRMAR_TROCA_DE_CLIENTE", mensagem: "Confirme.", entrevistas: 2 }),
    );
    expect(n?.codigo).toBe("CONFIRMAR_TROCA_DE_CLIENTE");
    expect(n?.mensagem).toBe("Confirme.");
    expect(confirmacoesDepoisDe({ confirmarAbaixoDoAlocado: true }, n!)).toEqual({
      confirmarAbaixoDoAlocado: true,
      confirmarTrocaDeCliente: true,
    });
  });

  it("ignora 409 de outra origem e erro que não é 409", () => {
    expect(recusaDaEdicao(new ApiError("x", 409, { codigo: "OUTRA_COISA" }))).toBeNull();
    expect(recusaDaEdicao(new ApiError("x", 400, { codigo: "VAGA_NAO_EDITAVEL" }))).toBeNull();
    expect(recusaDaEdicao(new Error("rede"))).toBeNull();
  });
});

describe("a lista de recrutadores", () => {
  it("vem da rota de recrutadores; o atual entra mesmo fora da lista", () => {
    const lista = recrutadoresDaEdicao(
      [{ id: "r1", nome: "Recrutadora" }],
      "r9",
      "Recrutador Antigo",
    );
    expect(lista.map((p) => p.id)).toEqual(["r9", "r1"]);
  });
});
