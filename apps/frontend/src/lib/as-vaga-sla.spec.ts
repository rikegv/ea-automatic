import { describe, expect, it } from "vitest";
import { ordemDoSla, slaCongelado, slaDaVaga, SLA_ESTADOS, SLA_ESTADO_LABEL } from "./as-vaga-sla";

/**
 * O QUE ESTE TESTE PROTEGE: os TRÊS casos em que esta coluna erra, e o congelamento herdado.
 *
 * Os três são silenciosos: nenhum quebra a tela, todos mentem. "0 dias" numa vaga sem previsão diz
 * que a entrega é hoje; "0 dias" numa vencida esconde o atraso; e um prazo que continua correndo
 * numa vaga fechada pinta de vermelho, em um mês, todo trabalho que já terminou no prazo.
 */
const HOJE = "2026-09-11";
const viva = (previsao: string | null) => ({
  dataLimite: previsao,
  dataFechamento: null,
});

describe("slaDaVaga: previsão ausente", () => {
  it("diz 'não informado', nunca traço e nunca zero dias", () => {
    const s = slaDaVaga(viva(null), false, HOJE);
    expect(s.estado).toBe("SEM_PREVISAO");
    expect(s.texto).toBe("não informado");
    expect(s.dias).toBeNull();
    expect(s.texto).not.toContain("0 dias");
    expect(s.texto).not.toContain("—");
  });

  it("data inválida cai no mesmo estado, em vez de virar NaN na tela", () => {
    expect(slaDaVaga(viva("data-torta"), false, HOJE).texto).toBe("não informado");
  });
});

describe("slaDaVaga: prazo vencido é estado próprio", () => {
  it("não vira zero dias, e diz há quanto tempo venceu", () => {
    const s = slaDaVaga(viva("2026-09-06"), false, HOJE);
    expect(s.estado).toBe("VENCIDO");
    expect(s.dias).toBe(-5);
    expect(s.texto).toBe("vencido há 5 dias");
  });

  it("vencido ontem concorda no singular", () => {
    expect(slaDaVaga(viva("2026-09-10"), false, HOJE).texto).toBe("vencido há 1 dia");
  });

  /* VENCIDO E VENCENDO HOJE SÃO COISAS DIFERENTES, e é o achatamento das duas em "0 dias" que este
     teste impede: uma pede ação imediata, a outra já passou do combinado. */
  it("vencer HOJE não é o mesmo que estar vencido", () => {
    const hoje = slaDaVaga(viva(HOJE), false, HOJE);
    expect(hoje.estado).toBe("ATENCAO");
    expect(hoje.texto).toBe("vence hoje");
    expect(slaDaVaga(viva("2026-09-10"), false, HOJE).estado).toBe("VENCIDO");
  });
});

describe("slaDaVaga: o selo de atenção, em 2 dias ou menos", () => {
  it("dois dias ainda acende", () => {
    const s = slaDaVaga(viva("2026-09-13"), false, HOJE);
    expect(s.estado).toBe("ATENCAO");
    expect(s.texto).toBe("faltam 2 dias");
  });

  it("um dia acende e concorda no singular", () => {
    expect(slaDaVaga(viva("2026-09-12"), false, HOJE).texto).toBe("faltam 1 dia");
  });

  it("três dias NÃO acende, que é a borda do limite", () => {
    const s = slaDaVaga(viva("2026-09-14"), false, HOJE);
    expect(s.estado).toBe("NO_PRAZO");
    expect(s.texto).toBe("faltam 3 dias");
  });
});

/**
 * ─ O CONGELAMENTO, HERDADO DA COLUNA QUE SAI ──────────────────────────────────────────────────
 *
 * "Dias Em Aberto" congelava no fechamento por decisão do diretor. Sem o equivalente aqui, toda
 * vaga encerrada apareceria VENCIDA um mês depois, cobrando trabalho que terminou no prazo.
 */
describe("slaDaVaga: vaga encerrada congela no fechamento", () => {
  const encerrada = (previsao: string, fechamento: string | null) => ({
    dataLimite: previsao,
    dataFechamento: fechamento,
  });

  it("entregue ANTES da previsão mostra a folga, e não um prazo correndo", () => {
    const s = slaDaVaga(encerrada("2026-09-20", "2026-09-15"), true, HOJE);
    expect(s.estado).toBe("ENCERRADA");
    expect(s.dias).toBe(5);
    expect(s.texto).toBe("5 dias de folga");
  });

  it("entregue DEPOIS da previsão mostra o atraso congelado", () => {
    const s = slaDaVaga(encerrada("2026-09-01", "2026-09-04"), true, HOJE);
    expect(s.estado).toBe("ENCERRADA");
    expect(s.dias).toBe(-3);
    expect(s.texto).toBe("3 dias de atraso");
  });

  /* O PONTO DO CONGELAMENTO: a mesma vaga, encerrada, NÃO pode ser lida como vencida só porque o
     calendário andou. Viva ela estaria vencida há 10 dias; encerrada ela terminou com folga. */
  it("o relógio para: a mesma previsão dá VENCIDO viva e folga encerrada", () => {
    const previsao = "2026-09-01";
    expect(slaDaVaga(viva(previsao), false, HOJE).estado).toBe("VENCIDO");
    const fechada = slaDaVaga(encerrada(previsao, "2026-08-30"), true, HOJE);
    expect(fechada.estado).toBe("ENCERRADA");
    expect(fechada.texto).toBe("2 dias de folga");
  });

  it("encerrada sem data de encerramento não inventa conta", () => {
    const s = slaDaVaga(encerrada("2026-09-01", null), true, HOJE);
    expect(s.estado).toBe("ENCERRADA");
    expect(s.dias).toBeNull();
    expect(s.texto).toBe("não informado");
  });

  it("encerrada SEM previsão continua sendo 'sem previsão', e não uma margem inventada", () => {
    const s = slaDaVaga({ dataLimite: null, dataFechamento: "2026-09-05" }, true, HOJE);
    expect(s.estado).toBe("SEM_PREVISAO");
    expect(s.texto).toBe("não informado");
  });
});

/**
 * ─ O CONGELAMENTO DA VAGA ENTREGUE (30/09) ─────────────────────────────────────────────────────
 *
 * O QUE ESTE BLOCO PROTEGE: a vaga ENTREGUE voltando a contar prazo. No catálogo de produção ela tem
 * `encerra = false` (está viva: é de lá que se fecha e se cancela, e ela ainda capta gente), então
 * ela caía no ramo da contagem regressiva e virava "Prazo Vencido" sozinha, só esperando o cliente
 * responder. Nada falhava: a tela cobrava um time que não estava mais trabalhando naquela vaga.
 *
 * E O CONSERTO NÃO PODE VIRAR "ENCERRADA": a etiqueta afirmaria um encerramento que ninguém
 * registrou, e é isso que o teste da etiqueta própria trava.
 */
describe("slaDaVaga: a vaga entregue congela, e não é a mesma coisa que encerrada", () => {
  it("entregue para de contar, mesmo com a previsão já vencida", () => {
    /* A MESMA VAGA, A MESMA PREVISÃO VENCIDA, O MESMO HOJE: o que muda é só o congelamento da
       entrega, e é ele que tira o "Prazo Vencido" de cima de quem entregou. */
    const previsao = "2026-08-20";
    expect(slaDaVaga(viva(previsao), false, HOJE).estado).toBe("VENCIDO");

    const s = slaDaVaga(viva(previsao), false, HOJE, true);
    expect(s.estado).toBe("ENTREGUE");
    expect(s.texto).toBe("entregue");
    expect(s.texto).not.toContain("vencido");
    expect(s.dias).toBeNull();
  });

  it("a etiqueta dela é própria, e não a da vaga encerrada", () => {
    expect(SLA_ESTADO_LABEL.ENTREGUE).toBe("Vaga Entregue");
    expect(SLA_ESTADO_LABEL.ENTREGUE).not.toBe(SLA_ESTADO_LABEL.ENCERRADA);
    // §A.37: o estado novo é opção do filtro, senão não dá para perguntar quem está entregue.
    expect(SLA_ESTADOS).toContain("ENTREGUE");
  });

  it("o texto do congelamento não diz que a vaga está encerrada, porque ela não está", () => {
    const s = slaDaVaga(viva("2026-08-20"), false, HOJE, true);
    expect(s.detalhe).toContain("entregue");
    expect(s.detalhe).not.toContain("encerrada");
    expect(s.detalhe).not.toContain("—");
  });

  it("a vaga ABERTA continua contando: o congelamento não escapou para quem está aberto", () => {
    const s = slaDaVaga(viva("2026-09-20"), false, HOJE, false);
    expect(s.estado).toBe("NO_PRAZO");
    expect(s.dias).toBe(9);
    // O padrão do parâmetro é "não entregue": quem não passa nada continua contando.
    expect(slaDaVaga(viva("2026-09-20"), false, HOJE).estado).toBe("NO_PRAZO");
  });

  /* PRECEDÊNCIA: um status de papel ENTREGA que TAMBÉM encerre cai no ramo da encerrada, porque lá
     existe data de fechamento, e com data a régua diz a MARGEM, que é mais do que "o prazo parou". */
  it("quando os dois congelamentos valem, a encerrada ganha, porque ela tem a margem", () => {
    const s = slaDaVaga({ dataLimite: "2026-09-20", dataFechamento: "2026-09-15" }, true, HOJE, true);
    expect(s.estado).toBe("ENCERRADA");
    expect(s.texto).toBe("5 dias de folga");
  });

  it("entregue sem previsão continua sendo 'sem previsão', como a encerrada já fazia", () => {
    expect(slaDaVaga(viva(null), false, HOJE, true).estado).toBe("SEM_PREVISAO");
  });

  /* QUEM DECIDE O TOM DISCRETO DA CÉLULA É ESTA PERGUNTA, e não uma lista de estados dentro do JSX:
     a tela pinta de vermelho o que cobra, e congelado não é cobrança. */
  it("o congelamento é uma pergunta só, e ela vale para os dois estados que param o prazo", () => {
    expect(slaCongelado("ENTREGUE")).toBe(true);
    expect(slaCongelado("ENCERRADA")).toBe(true);
    expect(slaCongelado("VENCIDO")).toBe(false);
    expect(slaCongelado("ATENCAO")).toBe(false);
    expect(slaCongelado("NO_PRAZO")).toBe(false);
    expect(slaCongelado("SEM_PREVISAO")).toBe(false);
  });

  it("não disputa urgência com quem ainda tem prazo correndo", () => {
    /* SEM NÚMERO NÃO HÁ POSIÇÃO NA ESCALA, e é isso que tira a entregue da fila do que pega fogo:
       `useOrdenacao` manda o nulo para o fim nas duas direções. */
    expect(ordemDoSla(slaDaVaga(viva("2026-08-20"), false, HOJE, true))).toBeNull();
    expect(ordemDoSla(slaDaVaga(viva("2026-08-20"), false, HOJE))).toBe(-22);
  });
});

/**
 * ─ A VAGA REABERTA CONTA CONTRA O PRAZO NOVO, E ESTE É O DEFEITO QUE A REABERTURA CORRIGE ──────
 *
 * A SLA é uma contagem REGRESSIVA, então "zerar a SLA" não existe: existe PRAZO NOVO. Reabrir sem
 * prazo novo devolveria a vaga contando contra a previsão ANTIGA, que quase sempre já passou, e ela
 * nasceria "Prazo Vencido" sem ninguém ter atrasado nada.
 */
describe("slaDaVaga: a vaga reaberta conta contra a previsão NOVA", () => {
  const PREVISAO_ANTIGA = "2026-08-20";
  const PREVISAO_NOVA = "2026-09-25";

  it("com o prazo velho ela nasceria vencida, e com o prazo novo ela nasce no prazo", () => {
    const comPrazoVelho = slaDaVaga(viva(PREVISAO_ANTIGA), false, HOJE);
    expect(comPrazoVelho.estado).toBe("VENCIDO");

    const reaberta = slaDaVaga(viva(PREVISAO_NOVA), false, HOJE);
    expect(reaberta.estado).toBe("NO_PRAZO");
    expect(reaberta.dias).toBe(14);
    expect(reaberta.texto).toBe("faltam 14 dias");
  });

  it("e ela volta a contar: reaberta NÃO fica congelada como entregue", () => {
    const reaberta = slaDaVaga(viva(PREVISAO_NOVA), false, HOJE, false);
    expect(reaberta.estado).not.toBe("ENTREGUE");
    expect(reaberta.dias).not.toBeNull();
  });
});

describe("ordemDoSla (§A.29)", () => {
  it("quanto menor, mais urgente: o vencido vem antes do que falta", () => {
    const vencido = ordemDoSla(slaDaVaga(viva("2026-09-01"), false, HOJE)) as number;
    const curto = ordemDoSla(slaDaVaga(viva("2026-09-12"), false, HOJE)) as number;
    const longe = ordemDoSla(slaDaVaga(viva("2026-10-30"), false, HOJE)) as number;
    expect(vencido).toBeLessThan(curto);
    expect(curto).toBeLessThan(longe);
  });

  /* AUSÊNCIA DE PRAZO NÃO É UM PRAZO ENORME: nula, ela vai para o fim nas duas direções, que é o
     mesmo tratamento que a coluna antiga dava ao rascunho sem data de abertura. */
  it("sem previsão devolve nulo, para o `useOrdenacao` mandar a linha para o fim", () => {
    expect(ordemDoSla(slaDaVaga(viva(null), false, HOJE))).toBeNull();
  });
});

describe("o vocabulário do filtro (§A.37)", () => {
  it("todo estado tem etiqueta, inclusive o valor especial da coluna", () => {
    for (const e of SLA_ESTADOS) {
      expect(SLA_ESTADO_LABEL[e]).toBeTruthy();
      expect(SLA_ESTADO_LABEL[e]).not.toContain("—");
    }
    // "Sem Previsão" é opção como qualquer outra: sem ela não dá para perguntar quem está sem prazo.
    expect(SLA_ESTADOS).toContain("SEM_PREVISAO");
  });

  it("nenhum texto do SLA usa travessão (§A.11)", () => {
    const casos = [
      slaDaVaga(viva(null), false, HOJE),
      slaDaVaga(viva("2026-09-01"), false, HOJE),
      slaDaVaga(viva("2026-09-12"), false, HOJE),
      slaDaVaga(viva("2026-10-30"), false, HOJE),
      slaDaVaga({ dataLimite: "2026-09-20", dataFechamento: "2026-09-15" }, true, HOJE),
      slaDaVaga(viva("2026-08-20"), false, HOJE, true),
    ];
    for (const c of casos) {
      expect(c.texto).not.toContain("—");
      expect(c.detalhe).not.toContain("—");
    }
  });
});

/**
 * ─ OS TRÊS DEFEITOS QUE A AUDITORIA DE TESTE ACHOU NESTA RÉGUA ────────────────────────────────
 *
 * Os três passavam em toda a suíte anterior, porque a conta estava certa: o que estava errado era
 * o que se fazia com o número depois.
 */
describe("a vaga encerrada não disputa urgência com a viva (defeitos 1 e 2)", () => {
  const encerrada = (previsao: string, fechamento: string) => ({
    dataLimite: previsao,
    dataFechamento: fechamento,
  });
  const chave = (v: Parameters<typeof slaDaVaga>[0], enc: boolean) =>
    ordemDoSla(slaDaVaga(v, enc, HOJE)) as number;

  /* O CASO MEDIDO PELO TESTER: encerrada com 9 dias de atraso contra viva vencida há 3. Na escala
     única, a terminada ia para o TOPO da fila de urgência. */
  it("encerrada com atraso NÃO vem antes de uma viva vencida", () => {
    const encerradaAtrasada = chave(encerrada("2026-08-20", "2026-08-29"), true);
    const vivaVencida = chave(viva("2026-09-08"), false);
    expect(vivaVencida).toBeLessThan(encerradaAtrasada);
  });

  it("encerrada com folga NÃO se intercala entre as vivas no prazo", () => {
    const encerradaFolga = chave(encerrada("2026-09-20", "2026-09-15"), true);
    const vivaLonge = chave(viva("2026-12-31"), false);
    expect(vivaLonge).toBeLessThan(encerradaFolga);
  });

  it("as vivas ficam TODAS antes das encerradas, em bloco", () => {
    const vivas = ["2026-09-01", "2026-09-12", "2026-12-31"].map((d) => chave(viva(d), false));
    const encerradas = [
      chave(encerrada("2026-08-20", "2026-08-29"), true),
      chave(encerrada("2026-09-20", "2026-09-15"), true),
    ];
    expect(Math.max(...vivas)).toBeLessThan(Math.min(...encerradas));
  });

  /* O HISTÓRICO NÃO PERDE A ORDEM: dentro do bloco das encerradas, quem atrasou mais vem primeiro.
     Era o que a coluna antiga entregava, e não podia se perder no conserto. */
  it("entre encerradas, a ordem pela margem continua valendo", () => {
    const atraso9 = chave(encerrada("2026-08-20", "2026-08-29"), true);
    const atraso2 = chave(encerrada("2026-08-20", "2026-08-22"), true);
    const folga5 = chave(encerrada("2026-09-20", "2026-09-15"), true);
    expect(atraso9).toBeLessThan(atraso2);
    expect(atraso2).toBeLessThan(folga5);
  });

  it("sem prazo continua devolvendo nulo, para ir ao fim nas duas direções", () => {
    expect(ordemDoSla(slaDaVaga(viva(null), false, HOJE))).toBeNull();
    expect(
      ordemDoSla(slaDaVaga({ dataLimite: "2026-09-01", dataFechamento: null }, true, HOJE)),
    ).toBeNull();
  });
});

describe("a frase não culpa o campo errado (defeito 3)", () => {
  it("com a previsão VÁLIDA e o relógio ilegível, não manda corrigir a vaga", () => {
    const s = slaDaVaga(viva("2026-09-20"), false, "hoje-quebrado");
    expect(s.estado).toBe("SEM_PREVISAO");
    expect(s.detalhe).toContain("está preenchida e correta");
    expect(s.detalhe).not.toContain("não é uma data válida");
  });

  it("com a previsão de fato inválida, continua apontando o campo certo", () => {
    const s = slaDaVaga(viva("data-torta"), false, HOJE);
    expect(s.detalhe).toContain("não é uma data válida");
  });
});
