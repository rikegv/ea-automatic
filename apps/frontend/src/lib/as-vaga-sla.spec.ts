import { describe, expect, it } from "vitest";
import { ordemDoSla, slaDaVaga, SLA_ESTADOS, SLA_ESTADO_LABEL } from "./as-vaga-sla";

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
