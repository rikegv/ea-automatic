import { describe, expect, it } from "vitest";
import {
  efeitosDaGravacao,
  nomeGrupoNormalizado,
  resumoDosEfeitos,
  type MembroAtual,
} from "./grupo-cliente";

/**
 * O QUE ESTES TESTES PROTEGEM. O grupo é a camada que faz 98 códigos iguais virarem uma leitura só,
 * e o erro que importa aqui é silencioso: um CNPJ contado em dois grupos infla a soma do painel sem
 * quebrar nada, e ninguém descobre até uma reunião. A chave do banco impede o estado; estes testes
 * garantem que a TELA diz a verdade sobre o que vai acontecer antes de gravar.
 */

const CORIFEU = "grupo-corifeu";
const FREI = "grupo-frei";

const membros: MembroAtual[] = [
  { codCliente: "100", grupoId: CORIFEU, grupoNome: "CAGC Corifeu" },
  { codCliente: "200", grupoId: FREI, grupoNome: "CAGC Frei Caneca" },
];

describe("nomeGrupoNormalizado: a mesma régua do índice único", () => {
  it("caixa, pontas e espaços repetidos viram a mesma coisa", () => {
    // As três grafias reais do Corifeu na produção de hoje.
    expect(nomeGrupoNormalizado("CAGC CORIFEU ")).toBe("CAGC CORIFEU");
    expect(nomeGrupoNormalizado("cagc corifeu")).toBe("CAGC CORIFEU");
    expect(nomeGrupoNormalizado("CAGC   Corifeu")).toBe("CAGC CORIFEU");
  });

  it("acento NÃO é removido, porque o índice do banco também não remove", () => {
    // Se a função removesse e o índice não, a tela aceitaria um nome que o banco recusaria depois.
    expect(nomeGrupoNormalizado("CAGC Ribeirão")).toBe("CAGC RIBEIRÃO");
  });
});

describe("efeitosDaGravacao: a prévia que a tela mostra antes de gravar", () => {
  /**
   * A SELEÇÃO É A LISTA COMPLETA de quem fica no grupo depois de salvar, e não um "acrescente
   * estes". O livreto trabalha por marcação: quem está marcado fica, quem foi desmarcado sai. Por
   * isso o 100, que já é do Corifeu, entra em toda seleção que não pretende tirá-lo.
   */
  it("cliente sem grupo nenhum ENTRA", () => {
    expect(efeitosDaGravacao(CORIFEU, ["100", "999"], membros)).toEqual([
      { codCliente: "100", efeito: "JA_ESTA" },
      { codCliente: "999", efeito: "ENTRA" },
    ]);
  });

  it("cliente de OUTRO grupo TROCA, e a prévia diz de onde ele sai", () => {
    // É a frase que o diretor pediu: "SAI de CAGC Frei Caneca e entra em CAGC Corifeu".
    expect(efeitosDaGravacao(CORIFEU, ["100", "200"], membros)).toContainEqual({
      codCliente: "200",
      efeito: "TROCA",
      deGrupoId: FREI,
      deGrupoNome: "CAGC Frei Caneca",
    });
  });

  it("cliente que já é deste grupo não vira nada", () => {
    expect(efeitosDaGravacao(CORIFEU, ["100"], membros)).toEqual([
      { codCliente: "100", efeito: "JA_ESTA" },
    ]);
  });

  it("desmarcar UM e manter os outros tira só o desmarcado", () => {
    // O caso real do engano: salvar o grupo com uma marcação a menos não pode ser silencioso.
    const comDois: MembroAtual[] = [
      { codCliente: "100", grupoId: CORIFEU, grupoNome: "CAGC Corifeu" },
      { codCliente: "101", grupoId: CORIFEU, grupoNome: "CAGC Corifeu" },
    ];
    expect(efeitosDaGravacao(CORIFEU, ["100"], comDois)).toEqual([
      { codCliente: "100", efeito: "JA_ESTA" },
      { codCliente: "101", efeito: "SAI" },
    ]);
  });

  it("desmarcar quem estava marca SAI, e ele fica SEM grupo", () => {
    // Ficar sem grupo é estado válido. Atribuir a outro grupo por conta própria seria invenção.
    expect(efeitosDaGravacao(CORIFEU, [], membros)).toEqual([
      { codCliente: "100", efeito: "SAI" },
    ]);
  });

  it("NÃO mexe em quem é de outro grupo e não foi selecionado", () => {
    // O 200 é do Frei Caneca e não entrou na lista: salvar o Corifeu não pode encostar nele.
    const efeitos = efeitosDaGravacao(CORIFEU, ["100"], membros);
    expect(efeitos.some((e) => e.codCliente === "200")).toBe(false);
  });

  it("uma gravação real mistura os quatro efeitos, e o resumo conta cada um", () => {
    const efeitos = efeitosDaGravacao(CORIFEU, ["100", "200", "999"], membros);
    expect(resumoDosEfeitos(efeitos)).toEqual({ entram: 1, trocam: 1, saem: 0, jaEstao: 1 });
  });

  it("id repetido na seleção não vira efeito repetido", () => {
    const efeitos = efeitosDaGravacao(CORIFEU, ["100", "999", "999"], membros);
    expect(efeitos.filter((e) => e.codCliente === "999")).toHaveLength(1);
  });
});
