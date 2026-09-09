import { describe, expect, it } from "vitest";
import type { AsOcupacaoVaga, VagaStatus } from "@ea/shared-types";
import { origemContagem, preenchidas, vagaEncerrada, type VagaContagem } from "./as-vagas-ocupacao";

/**
 * O QUE ESTE TESTE PROTEGE: as DUAS metades da régua de posições preenchidas (decisão do diretor,
 * 07/09/2026), que se contradizem de propósito e por isso são fáceis de "simplificar" errado.
 *
 * A vaga VIVA lê a ALOCAÇÃO DE AGORA, e a vaga ENCERRADA mantém o número CONGELADO no fechamento.
 * Quem unificar as duas pela derivada zera o histórico inteiro (nas vagas antigas ninguém foi
 * marcado como alocado, então a derivada delas é zero, e a PS-2026-001 passaria de "1 de 3" para
 * "0 de 3"); quem unificar pelo fechamento faz a vaga aberta nunca encher o cilindro. Os dois erros
 * quebram aqui antes de chegar na tela.
 *
 * O TERCEIRO PONTO PROTEGIDO é que CADA CILINDRO LÊ O SEU LADO (08/09). O contrato passou a servir
 * `finalizadasOficial` e `finalizadasBanco`, e o TOTAL (`finalizadas`) não é lido por ninguém: quem
 * voltar a ler o total faz a entrega ao BANCO acender o cilindro OFICIAL, que é o defeito que a vaga
 * real de homologação (5 oficiais, 20 de banco) mostraria na primeira alocação de reserva. O teste
 * "vaga VIVA com entrega só no BANCO" é o que prova isso.
 */

/*
 * O FIXTURE DECLARA O CONTRATO INTEIRO, SEM CAST, e isso é a correção de um risco conhecido. Até
 * 08/09 ele fechava com `as AsOcupacaoVaga` e declarava só os campos que a conta consumia, para
 * compilar contra o contrato antigo e o novo ao mesmo tempo. Isso tinha data de validade: no dia em
 * que a régua passou a ler `finalizadasOficial`, o cast entregaria `undefined`, o `?? 0` da régua
 * transformaria em zero, e o teste falharia com NÚMERO ERRADO em vez de erro de tipo, que é o modo
 * de falha mais caro de ler. Sem cast, campo novo no contrato quebra o TYPECHECK, aqui, apontando o
 * arquivo e a linha.
 *
 * O TOTAL É CALCULADO, NUNCA DIGITADO: `finalizadas === finalizadasOficial + finalizadasBanco` é
 * invariante do contrato, e deixá-lo como parâmetro permitiria escrever um fixture impossível e
 * testar contra ele.
 */
function ocupacao(finalizadasOficial: number, finalizadasBanco: number): AsOcupacaoVaga {
  const finalizadas = finalizadasOficial + finalizadasBanco;
  return {
    vagaId: "v1",
    posicoesOficiais: null,
    ocupadas: finalizadas,
    finalizadas,
    finalizadasOficial,
    finalizadasBanco,
    livres: null,
    emSelecao: 0,
    fora: 0,
    excedida: false,
  };
}

function vaga(
  status: VagaStatus,
  fechadas: number | null,
  fechadasBanco: number | null,
  finalizadasOficial = 0,
  finalizadasBanco = 0,
): VagaContagem {
  return {
    status,
    vagasFechadas: fechadas,
    vagasFechadasBanco: fechadasBanco,
    ocupacao: ocupacao(finalizadasOficial, finalizadasBanco),
  };
}

describe("o fixture respeita a invariante do contrato", () => {
  it("finalizadasOficial + finalizadasBanco é sempre o total", () => {
    const o = ocupacao(3, 4);
    expect(o.finalizadasOficial + o.finalizadasBanco).toBe(o.finalizadas);
    expect(o.finalizadas).toBe(7);
  });
});

describe("quais status encerram a vaga", () => {
  it("RASCUNHO e ABERTA são vaga viva", () => {
    expect(vagaEncerrada("RASCUNHO")).toBe(false);
    expect(vagaEncerrada("ABERTA")).toBe(false);
  });

  it("ENTREGUE, FECHADA e CANCELADA são encerramento", () => {
    expect(vagaEncerrada("ENTREGUE")).toBe(true);
    expect(vagaEncerrada("FECHADA")).toBe(true);
    expect(vagaEncerrada("CANCELADA")).toBe(true);
  });
});

describe("posições preenchidas do lado OFICIAL", () => {
  it("vaga VIVA com alocação lê a derivada, e ignora o contador de fechamento", () => {
    // O 99 nunca deveria existir numa vaga aberta; está aqui para provar que a derivada ganha dele.
    const v = vaga("ABERTA", 99, null, 4);
    expect(preenchidas(v, "oficial")).toBe(4);
    expect(origemContagem(v, "oficial")).toBe("derivada");
  });

  it("vaga VIVA sem alocação nenhuma conta ZERO, e isso É uma contagem", () => {
    const v = vaga("ABERTA", null, null, 0);
    expect(preenchidas(v, "oficial")).toBe(0);
    // A diferença que o `title` do cilindro precisa dizer: contaram zero, ninguém deixou de contar.
    expect(origemContagem(v, "oficial")).toBe("derivada");
  });

  it("RASCUNHO também é vaga viva, e lê a derivada", () => {
    const v = vaga("RASCUNHO", null, null, 1);
    expect(preenchidas(v, "oficial")).toBe(1);
    expect(origemContagem(v, "oficial")).toBe("derivada");
  });

  it("vaga ENCERRADA mantém o número congelado, mesmo com a derivada zerada", () => {
    const v = vaga("ENTREGUE", 1, null, 0);
    expect(preenchidas(v, "oficial")).toBe(1);
    expect(origemContagem(v, "oficial")).toBe("fechamento");
  });

  it("vaga ENCERRADA NÃO passa a mostrar a alocação de agora", () => {
    // Alguém alocado depois do fechamento não pode reescrever o que a vaga entregou.
    const v = vaga("FECHADA", 2, null, 7);
    expect(preenchidas(v, "oficial")).toBe(2);
  });

  it("vaga ENCERRADA com congelado NULO desenha barra vazia e diz que ninguém contou", () => {
    const v = vaga("CANCELADA", null, null, 3);
    expect(preenchidas(v, "oficial")).toBe(0);
    expect(origemContagem(v, "oficial")).toBe("ausente");
  });

  it("congelado ZERO é contagem, e não ausência de contagem", () => {
    const v = vaga("FECHADA", 0, null, 0);
    expect(preenchidas(v, "oficial")).toBe(0);
    expect(origemContagem(v, "oficial")).toBe("fechamento");
  });
});

describe("posições preenchidas do lado BANCO", () => {
  it("vaga VIVA lê a derivada DO BANCO, e não o número digitado", () => {
    // O 99 é o mesmo teste do lado oficial ao contrário: digitado em vaga aberta não manda.
    const v = vaga("ABERTA", null, 99, 0, 3);
    expect(preenchidas(v, "banco")).toBe(3);
    expect(origemContagem(v, "banco")).toBe("derivada");
  });

  it("vaga VIVA sem entrega no banco conta ZERO, e isso É uma contagem", () => {
    const v = vaga("ABERTA", null, null, 0, 0);
    expect(preenchidas(v, "banco")).toBe(0);
    // Era aqui que a tela dizia "a contagem ainda não existe para esta vaga", e ela já existe.
    expect(origemContagem(v, "banco")).toBe("derivada");
  });

  it("vaga ENCERRADA mostra o banco contado no fechamento", () => {
    const v = vaga("ENTREGUE", 3, 2, 0, 0);
    expect(preenchidas(v, "banco")).toBe(2);
    expect(origemContagem(v, "banco")).toBe("fechamento");
  });

  it("vaga ENCERRADA sem banco digitado não tem contagem nenhuma", () => {
    const v = vaga("FECHADA", 2, null, 0, 5);
    expect(preenchidas(v, "banco")).toBe(0);
    expect(origemContagem(v, "banco")).toBe("ausente");
  });
});

/**
 * O DEFEITO MORRENDO: cada cilindro conta o SEU lado. Enquanto os dois liam o total, a entrega feita
 * à reserva acendia o cilindro oficial de uma vaga com zero posição oficial preenchida.
 */
describe("os dois cilindros não se contaminam", () => {
  it("vaga VIVA com entrega SÓ NO BANCO deixa o cilindro oficial em zero", () => {
    // A vaga real da homologação: 5 oficiais vazias, 20 de banco, uma pessoa entregue à reserva.
    const v = vaga("ABERTA", null, null, 0, 1);
    expect(preenchidas(v, "oficial")).toBe(0);
    expect(preenchidas(v, "banco")).toBe(1);
    // E o total, que ninguém lê, é justamente o número que encheria o cilindro errado.
    expect(v.ocupacao.finalizadas).toBe(1);
  });

  it("vaga VIVA com entrega nos DOIS lados dá a cada cilindro o número dele", () => {
    const v = vaga("ABERTA", null, null, 2, 5);
    expect(preenchidas(v, "oficial")).toBe(2);
    expect(preenchidas(v, "banco")).toBe(5);
    expect(v.ocupacao.finalizadas).toBe(7);
  });

  it("vaga ENCERRADA com derivada diferente do congelado mostra os DOIS congelados", () => {
    // Derivada 4 e 6, congelado 1 e 2: o histórico manda nos dois lados, não só no oficial.
    const v = vaga("ENTREGUE", 1, 2, 4, 6);
    expect(preenchidas(v, "oficial")).toBe(1);
    expect(preenchidas(v, "banco")).toBe(2);
    expect(origemContagem(v, "oficial")).toBe("fechamento");
    expect(origemContagem(v, "banco")).toBe("fechamento");
  });
});

/**
 * OS QUATRO CASOS REAIS DA HOMOLOGAÇÃO, na tabela que o diretor vai conferir na tela. Eles não
 * acrescentam régua nenhuma aos testes acima: acrescentam a CALIBRAGEM, que é o que permite abrir a
 * 3120 e comparar linha a linha sem consultar o código. As duas vivas contam zero porque ninguém foi
 * alocado ainda, e as duas encerradas seguem no congelado.
 */
describe("os quatro casos da homologação", () => {
  const casos: {
    nome: string;
    v: VagaContagem;
    metaOficial: number;
    oficial: number;
    metaBanco: number;
    banco: number;
  }[] = [
    {
      nome: "123456 - TESTE",
      v: vaga("ABERTA", null, null, 0, 0),
      metaOficial: 5,
      oficial: 0,
      metaBanco: 20,
      banco: 0,
    },
    {
      nome: "PS-2026-002",
      v: vaga("ABERTA", null, null, 0, 0),
      metaOficial: 2,
      oficial: 0,
      metaBanco: 0,
      banco: 0,
    },
    {
      nome: "PS-2026-001",
      v: vaga("ENTREGUE", 1, 1, 0, 0),
      metaOficial: 3,
      oficial: 1,
      metaBanco: 4,
      banco: 1,
    },
    {
      nome: "PS-2026-003",
      v: vaga("FECHADA", 2, null, 0, 0),
      metaOficial: 2,
      oficial: 2,
      metaBanco: 0,
      banco: 0,
    },
  ];

  for (const caso of casos) {
    it(`${caso.nome} mostra ${caso.oficial} de ${caso.metaOficial} oficiais e ${caso.banco} de ${caso.metaBanco} no banco`, () => {
      expect(preenchidas(caso.v, "oficial")).toBe(caso.oficial);
      expect(preenchidas(caso.v, "banco")).toBe(caso.banco);
    });
  }
});
