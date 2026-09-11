import { describe, expect, it } from "vitest";
import {
  DIAS_DE_ATENCAO,
  ordemDoSla,
  slaDaVaga,
  SLA_ESTADOS,
  SLA_ESTADO_LABEL,
  type EstadoDoSla,
  type Sla,
} from "./as-vaga-sla";

/**
 * ─ O SLA DA VAGA: COBERTURA INDEPENDENTE (§A.38), e ela é DELIBERADAMENTE OUTRA ───────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO NÃO REPETE O `as-vaga-sla.spec.ts` ───────────────────────────────────┐
 * │ Aquele arquivo é do AUTOR da régua, e está bom: previsão ausente, vencido, a borda do selo e  │
 * │ o congelamento estão lá. Repetir aquilo daria duas cópias da MESMA suposição, que é           │
 * │ exatamente o que a §A.38 diz que teste do próprio autor faz bem (regressão) e mal             │
 * │ (mal-entendido de requisito): se a suposição estiver errada, os dois arquivos passam juntos.  │
 * │                                                                                              │
 * │ ENTÃO AQUI SÓ ENTRA O QUE AQUELE ARQUIVO NÃO PODE PEGAR, por construção:                     │
 * │   1. o FECHAMENTO do vocabulário (todo estado que a régua PRODUZ é oferecido pelo filtro);    │
 * │   2. a ORDENAÇÃO misturando vaga viva e vaga encerrada, que é onde "prazo correndo em vaga    │
 * │      fechada" volta pela porta dos fundos;                                                    │
 * │   3. as bordas ESCRITAS À MÃO, sem derivar de `DIAS_DE_ATENCAO`;                              │
 * │   4. o `hoje` inválido, que é a entrada que ninguém testa porque ninguém a imagina errada.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11 (sem travessão), §A.24 (etiqueta em title case), §A.28/§A.37 (o filtro oferece o
 * vocabulário, não as linhas carregadas), §A.29 (a coluna ordena).
 */

const HOJE = "2026-09-11";

const viva = (dataLimite: string | null) => ({ dataLimite, dataFechamento: null });
const encerrada = (dataLimite: string | null, dataFechamento: string | null) => ({
  dataLimite,
  dataFechamento,
});

/**
 * ─ OS CENÁRIOS DE VERDADE, e é daqui que sai o fechamento do vocabulário ──────────────────────
 *
 * A lista é de ENTRADAS, não de estados: é isso que a impede de encolher junto com a constante que
 * ela testa. Se alguém remover um estado de `SLA_ESTADOS`, estas entradas continuam existindo e
 * continuam produzindo o estado removido, e o teste de fechamento fica vermelho.
 */
const CENARIOS: { nome: string; sla: () => Sla }[] = [
  { nome: "sem previsão", sla: () => slaDaVaga(viva(null), false, HOJE) },
  { nome: "previsão ilegível", sla: () => slaDaVaga(viva("qualquer coisa"), false, HOJE) },
  { nome: "vencido", sla: () => slaDaVaga(viva("2026-09-01"), false, HOJE) },
  { nome: "vence hoje", sla: () => slaDaVaga(viva(HOJE), false, HOJE) },
  { nome: "falta 1 dia", sla: () => slaDaVaga(viva("2026-09-12"), false, HOJE) },
  { nome: "faltam 2 dias", sla: () => slaDaVaga(viva("2026-09-13"), false, HOJE) },
  { nome: "faltam 3 dias", sla: () => slaDaVaga(viva("2026-09-14"), false, HOJE) },
  { nome: "faltam 40 dias", sla: () => slaDaVaga(viva("2026-10-21"), false, HOJE) },
  {
    nome: "encerrada com folga",
    sla: () => slaDaVaga(encerrada("2026-09-20", "2026-09-10"), true, HOJE),
  },
  {
    nome: "encerrada com atraso",
    sla: () => slaDaVaga(encerrada("2026-09-01", "2026-09-10"), true, HOJE),
  },
  {
    nome: "encerrada sem data de fechamento",
    sla: () => slaDaVaga(encerrada("2026-09-20", null), true, HOJE),
  },
  { nome: "encerrada sem previsão", sla: () => slaDaVaga(encerrada(null, "2026-09-10"), true, HOJE) },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. O FECHAMENTO DO VOCABULÁRIO: nada que a régua produz pode ficar fora do filtro
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("todo estado que a régua PRODUZ é oferecido pelo filtro", () => {
  /**
   * ─ O TESTE QUE UM LAÇO SOBRE `SLA_ESTADOS` NUNCA CONSEGUE FAZER ─────────────────────────────
   *
   * Iterar `SLA_ESTADOS` responde "todo estado OFERECIDO tem etiqueta". A pergunta que importa é a
   * INVERSA: "todo estado PRODUZIDO é oferecido?". Um estado que a régua devolve e o filtro não
   * lista produz uma linha na tabela que NENHUMA combinação de filtro alcança, e o time conclui que
   * a vaga sumiu. §A.37 diz isso de outro jeito: as opções vêm do vocabulário, e o vocabulário tem
   * de conter o que a régua sabe dizer.
   *
   * E É ESTE O MODO DE FALHA QUE EU MEDI NA ONDA PASSADA: teste derivado da constante que ele testa
   * encolhe junto com ela, em silêncio. Aqui a fonte são ENTRADAS, não a constante.
   */
  it("nenhum cenário real produz um estado fora de SLA_ESTADOS", () => {
    const produzidos = new Set<EstadoDoSla>(CENARIOS.map((c) => c.sla().estado));
    const oferecidos = new Set<EstadoDoSla>(SLA_ESTADOS);
    const orfaos = [...produzidos].filter((e) => !oferecidos.has(e));
    expect(
      orfaos,
      `estado produzido e não oferecido no filtro: a linha fica inalcançável`,
    ).toEqual([]);
  });

  /**
   * O CONTRÁRIO TAMBÉM É DEFEITO, e é mais barato de cometer: uma opção de filtro que NENHUMA vaga
   * pode ter é um clique que só sabe devolver lista vazia. Os doze cenários abaixo cobrem os cinco
   * estados de hoje, então a lista não pode ter um sexto sem alguém explicar quem o produz.
   */
  it("nenhuma opção do filtro é impossível de acontecer", () => {
    const produzidos = new Set<EstadoDoSla>(CENARIOS.map((c) => c.sla().estado));
    const impossiveis = SLA_ESTADOS.filter((e) => !produzidos.has(e));
    expect(
      impossiveis,
      "opção de filtro que nenhum cenário produz é um clique que só devolve vazio",
    ).toEqual([]);
  });

  /**
   * ESCRITO À MÃO: os cinco estados de hoje. Sem isto, remover um estado do vocabulário E o cenário
   * que o produz deixaria os dois testes acima verdes, afirmando menos do que afirmavam. É a lição
   * medida na onda passada, aplicada ao catálogo desta.
   */
  it("ESCRITO À MÃO: o vocabulário de hoje tem cinco estados, do mais urgente ao histórico", () => {
    expect([...SLA_ESTADOS]).toEqual([
      "VENCIDO",
      "ATENCAO",
      "NO_PRAZO",
      "SEM_PREVISAO",
      "ENCERRADA",
    ]);
  });

  /** §A.24: etiqueta é title case. §A.11: travessão é proibido em qualquer texto apresentável. */
  it("ESCRITO À MÃO: as cinco etiquetas, em title case", () => {
    expect(SLA_ESTADO_LABEL.VENCIDO).toBe("Prazo Vencido");
    expect(SLA_ESTADO_LABEL.ATENCAO).toBe("Prazo Curto");
    expect(SLA_ESTADO_LABEL.NO_PRAZO).toBe("No Prazo");
    expect(SLA_ESTADO_LABEL.SEM_PREVISAO).toBe("Sem Previsão");
    expect(SLA_ESTADO_LABEL.ENCERRADA).toBe("Vaga Encerrada");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A ORDENAÇÃO MISTURANDO VIVA E ENCERRADA: é aqui que o prazo volta a correr
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a vaga encerrada não disputa urgência com a vaga viva", () => {
  /**
   * ─ O REQUISITO DO DIRETOR, DITO POR ELE: "um SLA correndo numa vaga fechada é cobrança sobre
   *   trabalho que acabou" ────────────────────────────────────────────────────────────────────
   *
   * O congelamento do TEXTO já está feito e testado pelo autor. O que nenhum teste olha é a
   * ORDENAÇÃO: `ordemDoSla` devolve `sla.dias`, e na vaga ENCERRADA esse número é a MARGEM
   * congelada, na MESMA escala dos dias que faltam numa vaga viva.
   *
   * A CONSEQUÊNCIA É CONCRETA: uma vaga encerrada com 9 dias de atraso (`dias = -9`) ordena como
   * MAIS urgente do que uma vaga VIVA vencida há 3 dias (`dias = -3`). Quem ordenar a coluna de SLA
   * para achar o que está pegando fogo recebe, no topo da lista, processos que terminaram, e o que
   * está de fato aberto desce. A coluna existe para responder "o que eu tenho de resolver hoje".
   *
   * O TESTE AFIRMA A PROPRIEDADE, e não um número: encerrada nunca ordena na frente de viva. Se a
   * construção resolver com nulo (mandando a encerrada para o fim, como a coluna antiga fazia com o
   * rascunho), passa; se resolver com um deslocamento de escala, passa também.
   */
  it("uma encerrada com muito atraso NÃO aparece na frente de uma viva vencida", () => {
    const vivaVencida = slaDaVaga(viva("2026-09-08"), false, HOJE); // vencida há 3 dias
    const encerradaAtrasada = slaDaVaga(encerrada("2026-09-01", "2026-09-10"), true, HOJE); // -9

    const ordemViva = ordemDoSla(vivaVencida);
    const ordemEncerrada = ordemDoSla(encerradaAtrasada);

    expect(ordemViva).not.toBeNull();
    if (ordemEncerrada === null) return; // nulo manda para o fim: comportamento aceito.
    expect(
      ordemEncerrada,
      "a encerrada está disputando urgência com quem ainda tem trabalho a fazer",
    ).toBeGreaterThan(ordemViva as number);
  });

  /**
   * O ESPELHO, para o caso não passar por acidente com números que já estavam ordenados: a encerrada
   * com FOLGA também não pode se misturar com as vivas no meio da escala. Uma encerrada com 10 dias
   * de folga (`dias = 10`) cairia exatamente entre duas vagas vivas no prazo.
   */
  it("uma encerrada com folga NÃO se intercala entre as vagas vivas no prazo", () => {
    const vivaCurta = slaDaVaga(viva("2026-09-16"), false, HOJE); // faltam 5
    const vivaLonga = slaDaVaga(viva("2026-10-11"), false, HOJE); // faltam 30
    const encerradaFolga = slaDaVaga(encerrada("2026-09-20", "2026-09-10"), true, HOJE); // +10

    const ordemEncerrada = ordemDoSla(encerradaFolga);
    if (ordemEncerrada === null) return; // nulo manda para o fim: comportamento aceito.

    const entreAsDuas =
      ordemEncerrada > (ordemDoSla(vivaCurta) as number) &&
      ordemEncerrada < (ordemDoSla(vivaLonga) as number);
    expect(entreAsDuas, "a encerrada caiu no meio da fila das vivas").toBe(false);
  });

  /** SEM PREVISÃO vai para o fim nas duas direções: ausência de prazo não é um prazo enorme. */
  it("sem previsão devolve nulo, e não um número que a coloque em algum lugar da escala", () => {
    expect(ordemDoSla(slaDaVaga(viva(null), false, HOJE))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. AS BORDAS, ESCRITAS À MÃO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o limite do selo, sem derivar da constante", () => {
  /**
   * ─ POR QUE OS NÚMEROS ESTÃO AQUI EM VEZ DE `DIAS_DE_ATENCAO` ────────────────────────────────
   *
   * Um teste escrito como `viva(hoje + DIAS_DE_ATENCAO)` passa com QUALQUER valor da constante: ele
   * afirma que a régua concorda consigo mesma, e não que o limite é o que o diretor pediu. Mudar a
   * constante para 7 deixaria a suíte inteira verde com um selo que acende a semana toda.
   *
   * A DECISÃO DO DIRETOR É "2 DIAS OU MENOS", então é 2 e 3 que estão escritos, à mão. A constante
   * entra numa asserção só, que é a que liga as duas pontas.
   */
  it("ESCRITO À MÃO: a constante do limite é 2", () => {
    expect(DIAS_DE_ATENCAO).toBe(2);
  });

  it("ESCRITO À MÃO: 2 dias acende o selo", () => {
    expect(slaDaVaga(viva("2026-09-13"), false, HOJE).estado).toBe("ATENCAO");
  });

  it("ESCRITO À MÃO: 3 dias NÃO acende", () => {
    expect(slaDaVaga(viva("2026-09-14"), false, HOJE).estado).toBe("NO_PRAZO");
  });

  it("ESCRITO À MÃO: hoje acende, e ontem já é vencido", () => {
    expect(slaDaVaga(viva("2026-09-11"), false, HOJE).estado).toBe("ATENCAO");
    expect(slaDaVaga(viva("2026-09-10"), false, HOJE).estado).toBe("VENCIDO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. AS DUAS PROIBIÇÕES DO DIRETOR, VARRIDAS EM TODOS OS CENÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("nenhum cenário escreve zero dias nem travessão", () => {
  /**
   * "0 DIAS" É A MENTIRA MAIS CONVINCENTE DESTA COLUNA: ela parece um número de verdade, e some no
   * meio dos outros. O diretor a proibiu nos dois casos em que ela apareceria sozinha (previsão
   * ausente e prazo vencido), e a varredura cobre TODOS os cenários porque a próxima porta de
   * entrada dela é a que ninguém está olhando.
   */
  it("nenhum texto de SLA contém a expressão zero dias", () => {
    for (const c of CENARIOS) {
      const { texto, detalhe } = c.sla();
      expect(texto, c.nome).not.toMatch(/\b0 dias?\b/);
      expect(detalhe, c.nome).not.toMatch(/\b0 dias?\b/);
    }
  });

  /** §A.11: travessão proibido, e a célula vazia diz "não informado". */
  it("nenhum texto de SLA usa travessão, e o vazio é a palavra", () => {
    for (const c of CENARIOS) {
      const s = c.sla();
      expect(s.texto, c.nome).not.toContain("—");
      expect(s.detalhe, c.nome).not.toContain("—");
      expect(s.texto.trim(), c.nome).not.toBe("");
      if (s.dias === null) expect(s.texto, c.nome).toBe("não informado");
    }
  });

  /** Todo cenário tem a frase inteira para o `title`: célula sem explicação é recusa sem motivo. */
  it("todo cenário traz o detalhe, e ele não é a repetição do texto curto", () => {
    for (const c of CENARIOS) {
      const s = c.sla();
      expect(s.detalhe.length, c.nome).toBeGreaterThan(s.texto.length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A ENTRADA QUE NINGUÉM IMAGINA ERRADA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o hoje inválido não é confundido com previsão inválida", () => {
  /**
   * ─ O DEFEITO É DE FRASE, E FRASE ERRADA MANDA A PESSOA CONSERTAR O CAMPO CERTO ──────────────
   *
   * `emDias` devolve nulo quando QUALQUER das duas datas não parseia, e o caminho de nulo escreve
   * "A previsão de entrega registrada não é uma data válida". Com um `hoje` quebrado (fuso, locale,
   * relógio da máquina), a tela acusa o campo da VAGA, que está perfeito, e o consultor vai editar
   * uma vaga que não tem problema nenhum.
   *
   * A ASSERÇÃO É CONSERVADORA de propósito: não exijo uma frase específica, exijo que a frase NÃO
   * culpe a previsão quando a previsão está correta. Se a construção decidir que este caso não vale
   * o tratamento, a conversa é sobre a frase, e não sobre a régua.
   */
  it("com previsão válida e hoje ilegível, a frase não culpa a previsão", () => {
    const s = slaDaVaga(viva("2026-09-20"), false, "não é data");
    if (s.dias !== null) return; // a régua se virou: não há frase errada a cobrar.
    expect(
      s.detalhe,
      "a frase manda consertar a previsão da vaga, que está correta",
    ).not.toMatch(/previsão de entrega registrada não é uma data válida/i);
  });

  /** Previsão ilegível DE VERDADE continua caindo no estado de sem previsão, e não em NaN na tela. */
  it("previsão ilegível continua sendo sem previsão, e nunca NaN", () => {
    const s = slaDaVaga(viva("data-torta"), false, HOJE);
    expect(s.estado).toBe("SEM_PREVISAO");
    expect(s.texto).not.toMatch(/nan/i);
  });
});
