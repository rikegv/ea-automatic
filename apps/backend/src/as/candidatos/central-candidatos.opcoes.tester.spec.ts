import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { CandidatosController } from "./candidatos.controller";
import { bancoDaCentral } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ `GET /as/candidatos/opcoes`: AS OPCOES DE FILTRO VEM DA BASE DE CANDIDATOS, NAO DE `/as/vagas` ─
 *
 * COBERTURA INDEPENDENTE (§A.38), REQUISITO do mapa (item 3, §A.37: opcao de filtro vem de endpoint).
 * A tela cruzava `/as/vagas` para montar os filtros de cliente e de vaga, e a Central de Vagas fez
 * aquela rota devolver so liberadas, encolhendo os filtros. O endpoint novo devolve clientes/cargos/
 * vagas DISTINTOS das candidaturas, SEM filtro de status, e sem dado pessoal (§A.6).
 *
 * O handler e localizado pela ROTA (verbo + caminho), nao pelo nome do metodo: o requisito e
 * `GET opcoes`, e o nome interno e detalhe de implementacao.
 */

const proto = CandidatosController.prototype as unknown as Record<string, unknown>;

function nomeDoHandler(verbo: RequestMethod, caminho: string): string | undefined {
  return Object.getOwnPropertyNames(proto).find((nome) => {
    if (nome === "constructor") return false;
    const fn = proto[nome];
    if (typeof fn !== "function") return false;
    const path = Reflect.getMetadata(PATH_METADATA, fn);
    const method = Reflect.getMetadata(METHOD_METADATA, fn);
    if (path === undefined || method === undefined) return false;
    const caminhos = Array.isArray(path) ? path : [path];
    return method === verbo && caminhos.includes(caminho);
  });
}

describe("a rota GET /as/candidatos/opcoes e de LEITURA, protegida pelo menu, sem @Roles", () => {
  it("existe UM handler GET para `opcoes`", () => {
    const nome = nomeDoHandler(RequestMethod.GET, "opcoes");
    expect(nome, "faltou o GET /as/candidatos/opcoes").toBeDefined();
  });

  it("o handler de opcoes NAO tem @Roles (quem restringe e o menu as-candidatos)", () => {
    const nome = nomeDoHandler(RequestMethod.GET, "opcoes");
    expect(nome).toBeDefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, proto[nome!] as object),
      "um @Roles aqui barraria a leitura normal do modulo; a trava e o MenuGuard",
    ).toBeUndefined();
  });

  it("a controller inteira continua sem @Roles de classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CandidatosController)).toBeUndefined();
  });

  it("opcoes e reivindicada por um menu do A&S (sem @Roles nao quer dizer aberta)", () => {
    const nome = nomeDoHandler(RequestMethod.GET, "opcoes");
    expect(menuDaOperacao("CandidatosController", nome!)).toMatch(/^as-/);
  });

  it("o handler DELEGA ao service e devolve a resposta dele sem alterar", async () => {
    const resposta = {
      clientes: [{ codCliente: "C1", nome: "Soulan Operacao" }],
      cargos: [{ id: "G1", nome: "Auxiliar De Limpeza" }],
      vagas: [{ id: "v1", codigo: "777", nome: "Auxiliar De Limpeza" }],
    };
    const opcoes = vi.fn(async () => resposta as never);
    const controller = new CandidatosController({ opcoes } as never, {} as never, {} as never);
    const nome = nomeDoHandler(RequestMethod.GET, "opcoes")!;

    const saida = await (controller as unknown as Record<string, () => Promise<unknown>>)[nome]!();
    expect(opcoes).toHaveBeenCalledTimes(1);
    expect(saida).toBe(resposta);
  });
});

describe("CandidatosService.opcoes devolve distintos e sem dado pessoal", () => {
  function cenario() {
    return bancoDaCentral({
      candidatos: [
        { id: "p1", nome: "Debora Campos", origem: "PANDAPE", cpf: "11144477735" },
        { id: "p2", nome: "Samara Nunes", origem: "PANDAPE" },
        { id: "p3", nome: "Bianca Souza", origem: "DIGAI" },
      ],
      candidaturas: [
        { id: "k1", candidatoId: "p1", vagaId: "v1", situacao: "ATIVO" },
        { id: "k2", candidatoId: "p2", vagaId: "v1", situacao: "ATIVO" }, // mesma vaga/cliente/cargo
        { id: "k3", candidatoId: "p3", vagaId: "v2", situacao: "DESCARTADO" },
        { id: "k4", candidatoId: "p1", vagaId: "v3", situacao: "ATIVO" }, // vaga em revisao, sem cliente
      ],
      vagas: [
        { id: "v1", codigo: "777", nomeDivulgacao: "Auxiliar De Limpeza", status: "ABERTA", codCliente: "C1", cargoId: "G1" },
        { id: "v2", codigo: "888", nomeDivulgacao: "Operador De Caixa", status: "ABERTA", codCliente: "C2", cargoId: "G2" },
        { id: "v3", codigo: "999", nomeDivulgacao: "Atendente", status: "PENDENTE_REVISAO", codCliente: null, cargoId: null },
      ],
      clientes: [
        { codCliente: "C1", razaoSocial: "Soulan LTDA", nomeOperacao: "Soulan Operacao" },
        { codCliente: "C2", razaoSocial: "Soulan Varejo LTDA", nomeOperacao: "Soulan Varejo" },
      ],
      cargos: [
        { id: "G1", nome: "Auxiliar De Limpeza" },
        { id: "G2", nome: "Operador De Caixa" },
      ],
    });
  }

  it("clientes e cargos vem DISTINTOS (vaga repetida nao duplica)", async () => {
    const { service } = cenario();
    const opcoes = await (service as unknown as { opcoes: () => Promise<{ clientes: unknown[]; cargos: unknown[]; vagas: unknown[] }> }).opcoes();

    expect(opcoes.clientes, "C1 e C2 distintos").toHaveLength(2);
    expect(opcoes.cargos, "G1 e G2 distintos").toHaveLength(2);
    // v1,v2,v3 usadas por candidaturas -> tres vagas distintas.
    expect(opcoes.vagas).toHaveLength(3);
  });

  it("nenhuma opcao carrega dado pessoal: so rotulo e codigo de catalogo (§A.6)", async () => {
    const { service } = cenario();
    const opcoes = await (service as unknown as { opcoes: () => Promise<Record<string, Array<Record<string, unknown>>>> }).opcoes();

    const PROIBIDOS = ["cpf", "email", "telefone", "nomeCandidato", "candidatoNome", "pretensaoSalarial", "motivoDescarte"];
    for (const grupo of Object.values(opcoes)) {
      for (const opcao of grupo) {
        for (const chave of Object.keys(opcao)) {
          expect(chave.toLowerCase().includes("cpf"), `opcao vazou ${chave}`).toBe(false);
          expect(PROIBIDOS.includes(chave), `opcao vazou ${chave}`).toBe(false);
        }
      }
    }
  });
});
