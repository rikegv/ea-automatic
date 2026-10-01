import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropostaDeClienteDaVaga } from "@ea/shared-types";
import {
  conferenciaDaProposta,
  marcaDaPropostaNaFila,
  propostaDaVaga,
} from "./as-proposta-cliente";

/**
 * ─ A RÉGUA DA PROPOSTA DE CLIENTE, EM FUNÇÃO PURA ──────────────────────────────────────────────
 *
 * O que estes testes travam é o que a auditoria chamou de condição C1 e o que o diretor chamou de
 * "o time só confere": a proposta é UMA PROPOSTA até alguém adotá-la, e os dois casos de cobertura
 * (com código e só com nome) são estados DIFERENTES, nunca o mesmo com um campo vazio.
 *
 * ┌─ AS TAGS SAÍRAM DA TELA (decisão do diretor, 01/10/2026) ───────────────────────────────────┐
 * │ A fila mostra o NOME do cliente, ou "Sem Cliente", e nada mais; a caixa da trilha perdeu as │
 * │ pills de estado e ficou só com o texto. Saiu com elas a comparação dos rótulos contra o      │
 * │ `ESTADO_DA_PROPOSTA_LABEL`, que não tem mais o que proteger.                                 │
 * │                                                                                              │
 * │ A RÉGUA DOS CASOS CONTINUA INTEIRA, e é o que estes testes cobrem: ela é que decide se a      │
 * │ caixa propõe um código para confirmar ou manda a pessoa escolher no seletor.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const COM_CODIGO: PropostaDeClienteDaVaga = {
  codClienteProposto: "0123",
  nomeClienteProposto: "Companhia Siderúrgica Exemplo",
  origem: "PLANILHA_ID_VAGA",
  conferida: false,
};

const SO_NOME: PropostaDeClienteDaVaga = {
  codClienteProposto: null,
  nomeClienteProposto: "Gerdau Unidade Exemplo",
  origem: "PLANILHA_REQUISICAO",
  conferida: false,
};

describe("a leitura da proposta que vem na vaga", () => {
  it("devolve a proposta quando ela tem nome", () => {
    expect(propostaDaVaga({ propostaDeCliente: COM_CODIGO })).toEqual(COM_CODIGO);
  });

  it("devolve nulo quando a vaga não traz proposta nenhuma", () => {
    expect(propostaDaVaga({ codCliente: null })).toBeNull();
    expect(propostaDaVaga({ propostaDeCliente: null })).toBeNull();
    expect(propostaDaVaga(undefined)).toBeNull();
  });

  /**
   * FAIL-CLOSED, e não é zelo de tipo: proposta sem nome desenharia uma caixa dizendo "a planilha
   * diz que é este cliente" com o nome em branco, que afirma mais do que se sabe.
   */
  it("recusa proposta sem nome, inclusive nome em branco", () => {
    expect(propostaDaVaga({ propostaDeCliente: { ...COM_CODIGO, nomeClienteProposto: "" } })).toBeNull();
    expect(
      propostaDaVaga({ propostaDeCliente: { ...COM_CODIGO, nomeClienteProposto: "   " } }),
    ).toBeNull();
  });
});

describe("a conferência da proposta, cruzada com o que a pessoa escolheu", () => {
  const CATALOGO = new Set(["0123", "0456"]);

  it("sem proposta, não há nada a mostrar", () => {
    expect(conferenciaDaProposta(null, "", CATALOGO)).toEqual({ tipo: "SEM_PROPOSTA" });
  });

  /** O caso das 158: código no catálogo, seletor vazio. É aqui, e SÓ aqui, que se oferece confirmar. */
  it("proposta com código e seletor vazio fica A CONFERIR, com o código à mão", () => {
    expect(conferenciaDaProposta(COM_CODIGO, "", CATALOGO)).toEqual({
      tipo: "COM_CODIGO",
      proposta: COM_CODIGO,
      codigo: "0123",
    });
  });

  /** O caso das 154: sabe-se QUEM é, falta o cadastro. Não é defeito e não é o caso de cima. */
  it("proposta só com nome é um estado próprio, e não o estado de cima com campo vazio", () => {
    const c = conferenciaDaProposta(SO_NOME, "", CATALOGO);
    expect(c.tipo).toBe("SO_NOME");
  });

  /**
   * O código proposto pode ter saído do catálogo (cliente inativado depois de a planilha ser
   * escrita). Confirmar gravaria um código que o seletor não oferece, então a vaga cai no caso do
   * nome, que é o que ela de fato é.
   */
  it("código que o catálogo não tem mais NÃO é oferecido para confirmar", () => {
    const c = conferenciaDaProposta(COM_CODIGO, "", new Set(["0456"]));
    expect(c.tipo).toBe("SO_NOME");
  });

  it("adotada a proposta, o estado passa a dizer que foi confirmada", () => {
    expect(conferenciaDaProposta(COM_CODIGO, "0123", CATALOGO)).toEqual({
      tipo: "CONFIRMADA",
      proposta: COM_CODIGO,
    });
  });

  it("escolheu outro cliente, vale a escolha da pessoa, e a tela diz isso", () => {
    expect(conferenciaDaProposta(COM_CODIGO, "0456", CATALOGO)).toEqual({
      tipo: "ESCOLHA_PROPRIA",
      proposta: COM_CODIGO,
      codigoEscolhido: "0456",
    });
  });

  it("na proposta só com nome, qualquer escolha é escolha da pessoa", () => {
    const c = conferenciaDaProposta(SO_NOME, "0456", CATALOGO);
    expect(c.tipo).toBe("ESCOLHA_PROPRIA");
  });

  /** Sem o catálogo na mão (a coluna da fila), não se pode descartar o código: ele vale. */
  it("sem catálogo informado, a proposta com código fica A CONFERIR", () => {
    expect(conferenciaDaProposta(COM_CODIGO, "").tipo).toBe("COM_CODIGO");
  });
});

describe("a marca da coluna Cliente na fila", () => {
  it("cliente vinculado é vínculo, e a proposta nem é consultada", () => {
    expect(
      marcaDaPropostaNaFila({
        codCliente: "0999",
        clienteNome: "Cliente Já Vinculado",
        propostaDeCliente: COM_CODIGO,
      }),
    ).toEqual({ tipo: "VINCULADO", nome: "Cliente Já Vinculado" });
  });

  it("distingue os dois casos de proposta", () => {
    expect(marcaDaPropostaNaFila({ codCliente: null, propostaDeCliente: COM_CODIGO })).toEqual({
      tipo: "PROPOSTA_COM_CODIGO",
      nome: COM_CODIGO.nomeClienteProposto,
    });
    expect(marcaDaPropostaNaFila({ codCliente: null, propostaDeCliente: SO_NOME })).toEqual({
      tipo: "PROPOSTA_SEM_CODIGO",
      nome: SO_NOME.nomeClienteProposto,
    });
  });

  it("sem cliente e sem proposta, a célula segue como estava antes desta frente", () => {
    expect(marcaDaPropostaNaFila({ codCliente: null, clienteNome: null })).toEqual({
      tipo: "SEM_CLIENTE",
    });
  });
});

/*
 * ─ A COLUNA CLIENTE DA FILA É TEXTO PURO, E ISSO É DECISÃO DO DIRETOR (01/10/2026) ─────────────
 *
 * "Sem tag, sem ícone, sem nada. Informação demais atrapalha; a fila é para bater o olho e saber
 * qual vaga tem cliente e qual não tem."
 *
 * O CHECK VERDE SAIU, e ele dizia uma coisa falsa: proposta não conferida aparecia com o mesmo
 * ícone de aprovação de um cliente que uma pessoa escolheu. Nenhum ícone afirma menos que um errado.
 *
 * ESTA TRAVA É DE FONTE porque o defeito que ela previne é de RENDERIZAÇÃO, e quem "melhora" a
 * tela um dia vai achar natural devolver a pill para a coluna ficar igual às outras. A garantia da
 * auditoria não mora aqui: ela mora no MODAL (seletor nasce vazio, e `codCliente` é o primeiro dos
 * onze obrigatórios), e é lá que ela é asserida.
 */
describe("a coluna Cliente da fila de revisão não tem marca visual", () => {
  const fonte = readFileSync(
    new URL("../app/(app)/as/vagas-pendentes-revisao/page.tsx", import.meta.url),
    "utf8",
  );
  /* Sem comentário: o arquivo FALA de pill e de ícone em prosa, para contar a decisão, e a varredura
     ingênua casaria a própria explicação. Já custou rodada nesta casa, quatro vezes num dia só. */
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("não renderiza `StatusPill` em lugar nenhum da tela", () => {
    expect(codigo).not.toContain("StatusPill");
  });

  it("CANÁRIO: a célula ainda existe, senão o teste acima passa por tela vazia", () => {
    expect(codigo).toContain("marcaDaPropostaNaFila");
    expect(codigo).toContain("Sem Cliente");
  });
});
