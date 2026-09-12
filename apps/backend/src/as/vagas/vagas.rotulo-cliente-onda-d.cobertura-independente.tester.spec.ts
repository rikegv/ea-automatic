import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { cargos, clientes } from "../../db/schema";
import { VagasService } from "./vagas.service";

/**
 * ─ ONDA D, ITEM 4: O NOME DO CLIENTE NÃO CARREGA MAIS O CÓDIGO ─────────────────────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CÓDIGO (§A.40 regra 2), por quem não implementa.
 *
 * O REQUISITO, em uma frase: o `rotulo` que `opcoes()` devolve passa a ser SÓ o nome de operação
 * (caindo na razão social quando não há nome de operação), sem o `${codCliente} - ` na frente. O
 * `codCliente` continua no payload, porque ele é o VALOR do seletor: tirá-lo do rótulo não pode
 * tirá-lo do dado, ou o seletor deixa de saber o que gravar.
 *
 * ┌─ POR QUE UM BANCO FINGIDO, E NÃO UMA LEITURA DO ARQUIVO ────────────────────────────────────┐
 * │ Conferir o texto do `vagas.service.ts` provaria que a interpolação sumiu da LINHA, e não que │
 * │ a RESPOSTA mudou. O que a tela consome é a resposta: um rótulo montado em outro ponto, ou o  │
 * │ código voltando por um `??` de fallback, passaria por uma varredura de texto e chegaria à    │
 * │ operação. O fake responde por TABELA, então a asserção é sobre o que o endpoint devolve.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O DESEMPATE, DECIDIDO PELO DIRETOR EM 12/09, E POR QUE ELE EXISTE ─────────────────────────┐
 * │ MEDIDO: dos 232 clientes ATIVOS, 138 estão em 27 nomes de operação REPETIDOS, e o maior grupo │
 * │ tem 52 rótulos idênticos. Pior: 15 clientes repetem o nome E O CNPJ (os pares `X` contra      │
 * │ `X-TEMP.`), e ali só o `cod_cliente` separa. Com o campo virando OBRIGATÓRIO na mesma onda, o │
 * │ consultor passa a ser obrigado a escolher numa lista que não lhe diz o que escolher.          │
 * │                                                                                               │
 * │ A RESPOSTA TEM DUAS METADES, e só a primeira é deste arquivo: o BACKEND passa a devolver o    │
 * │ `cnpj` junto do item (o dado do desempate), e a TELA decide o desenho (nome puro quando único;│
 * │ segunda linha com CNPJ quando o nome repete; segunda linha com o código quando nome e CNPJ    │
 * │ repetem). O que se prova aqui é que o DADO chega, e que o rótulo continua limpo.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes de cliente FICTÍCIOS, nenhum dado pessoal, nenhum CNPJ real.
 */

interface ClienteFingido {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  cnpj?: string | null;
  enderecoPadrao?: string | null;
  escalaPadrao?: string | null;
}

/**
 * UM BANCO QUE RESPONDE POR TABELA. Cada cadeia `select().from(t).where().orderBy()` é aguardada,
 * e o que ela devolve depende SÓ de `t`: assim a ordem interna do `Promise.all` do serviço pode
 * mudar sem este teste mentir. Tabela que ninguém ensinou devolve lista vazia, que é o certo aqui
 * (catálogos que esta prova não olha).
 */
function bancoDeOpcoes(clientesFingidos: ClienteFingido[]) {
  const porTabela = new Map<string, unknown[]>([
    [getTableName(clientes), clientesFingidos],
    [getTableName(cargos), [{ id: "c1", nome: "Auxiliar De Loja" }]],
  ]);

  const cadeia = () => {
    let tabela = "";
    const alvo = {
      from(t: unknown) {
        tabela = getTableName(t as Parameters<typeof getTableName>[0]);
        return alvo;
      },
      where: () => alvo,
      orderBy: () => alvo,
      innerJoin: () => alvo,
      leftJoin: () => alvo,
      then: <T,>(ok: (v: unknown[]) => T, falha?: (e: unknown) => T) =>
        Promise.resolve(porTabela.get(tabela) ?? []).then(ok, falha),
    };
    return alvo;
  };

  return {
    select: cadeia,
    selectDistinctOn: cadeia,
  } as unknown as Database;
}

function servico(clientesFingidos: ClienteFingido[]) {
  return new VagasService(bancoDeOpcoes(clientesFingidos), null as never, null as never);
}

const UM: ClienteFingido = {
  codCliente: "9001",
  razaoSocial: "COMERCIO FICTICIO LTDA",
  nomeOperacao: "LOJA CENTRO FICTICIA",
  // CNPJ FICTÍCIO, dígito verificador sem valor: é o dado do desempate, não um documento de
  // ninguém (§A.6: dado de empresa, não de pessoa).
  cnpj: "11222333000181",
  enderecoPadrao: null,
  escalaPadrao: null,
};

describe("opcoes(): o rótulo do cliente", () => {
  it("é SÓ o nome de operação, sem o código na frente", async () => {
    const [cliente] = (await servico([UM]).opcoes()).clientes;

    expect(cliente.rotulo).toBe("LOJA CENTRO FICTICIA");
    expect(cliente.rotulo).not.toContain("9001");
    expect(cliente.rotulo).not.toContain(" - ");
  });

  it("cai na RAZÃO SOCIAL quando o cliente não tem nome de operação, e ainda assim sem o código", async () => {
    const [cliente] = (
      await servico([{ ...UM, nomeOperacao: null }]).opcoes()
    ).clientes;

    expect(cliente.rotulo).toBe("COMERCIO FICTICIO LTDA");
    expect(cliente.rotulo).not.toContain("9001");
  });

  it("MANTÉM o `codCliente` no payload: ele é o VALOR do seletor, não o rótulo", async () => {
    const [cliente] = (await servico([UM]).opcoes()).clientes;
    expect(cliente.codCliente).toBe("9001");
  });

  /**
   * RECOMENDAÇÃO DO `tester`, E ELA NÃO ESTÁ NA LETRA DA OST. MEDIDO em produção (12/09): dos 232
   * clientes ativos, 11 têm `nome_operacao` NULO (o fallback da razão social é o que os salva, e
   * nenhum deles tem razão social vazia) e ZERO têm nome de operação em BRANCO. Então este caso não
   * está no ar hoje; ele é a defesa de um campo que ACABOU DE VIRAR OBRIGATÓRIO: opção com rótulo
   * em branco é opção invisível numa lista que a pessoa é obrigada a usar. Custo de satisfazer: o
   * fallback tratar branco como ausência, como a régua dos obrigatórios já faz em todo lugar.
   */
  it("RECOMENDAÇÃO: nome de operação EM BRANCO cai na razão social, em vez de virar rótulo vazio", async () => {
    const [cliente] = (
      await servico([{ ...UM, nomeOperacao: "  ", razaoSocial: "RAZAO FICTICIA SA" }]).opcoes()
    ).clientes;

    expect(cliente.rotulo.trim(), "rótulo em branco deixaria a opção invisível na lista").toBe(
      "RAZAO FICTICIA SA",
    );
    expect(cliente.rotulo).not.toContain("9001");
  });

  /**
   * O DADO DO DESEMPATE CHEGA À TELA. Sem o `cnpj` no item, a tela não tem como desenhar a segunda
   * linha dos 138 clientes de nome repetido, e a única saída dela seria remontar o rótulo com o
   * código, que é exatamente o que o item 4 acabou de tirar.
   */
  it("devolve o CNPJ junto do item de cliente, que é o dado do desempate", async () => {
    const [cliente] = (await servico([UM]).opcoes()).clientes;
    expect(cliente).toHaveProperty("cnpj");
    expect((cliente as { cnpj?: string | null }).cnpj).toBe("11222333000181");
  });

  it("o cliente sem CNPJ cadastrado não quebra o item: vem nulo, e a tela decide o que fazer", async () => {
    const [cliente] = (await servico([{ ...UM, cnpj: null }]).opcoes()).clientes;
    expect((cliente as { cnpj?: string | null }).cnpj ?? null).toBeNull();
  });

  /**
   * OS DOIS CASOS QUE O DESEMPATE PRECISA RESOLVER, do lado do DADO (o desenho é do frontend):
   * nome repetido com CNPJ diferente, e nome E CNPJ repetidos (os 15 pares `X` / `X-TEMP.`). Em
   * ambos o rótulo do backend é o MESMO texto de propósito, e o que distingue vem nos campos.
   */
  it("nome repetido: os rótulos são iguais, e o CNPJ é o que separa as opções", async () => {
    const { clientes: lista } = await servico([
      UM,
      { ...UM, codCliente: "9002", cnpj: "44555666000177" },
    ]).opcoes();

    expect(lista[0].rotulo).toBe(lista[1].rotulo);
    expect((lista[0] as { cnpj?: string }).cnpj).not.toBe((lista[1] as { cnpj?: string }).cnpj);
  });

  it("nome E CNPJ repetidos: só o `codCliente` separa, e ele continua no payload", async () => {
    const { clientes: lista } = await servico([UM, { ...UM, codCliente: "9001-TEMP." }]).opcoes();

    expect(lista[0].rotulo).toBe(lista[1].rotulo);
    expect((lista[0] as { cnpj?: string }).cnpj).toBe((lista[1] as { cnpj?: string }).cnpj);
    expect(lista.map((c) => c.codCliente)).toEqual(["9001", "9001-TEMP."]);
  });

  it("não usa travessão no rótulo (§A.11)", async () => {
    const [cliente] = (await servico([UM]).opcoes()).clientes;
    expect(cliente.rotulo).not.toContain("—");
  });
});
