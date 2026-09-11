import { describe, expect, it } from "vitest";
import {
  ACEITES_REGISTRAVEIS,
  ACEITE_BANCO_COM_OFICIAIS_ABERTAS,
  ACEITE_REABERTURA_SEM_ORIGEM,
  ACEITE_REENTRADA,
  POSICAO_LADOS,
  cabeMaisUm,
  ladoDaCandidatura,
  ocupadasPorLado,
  oficiaisAindaAbertas,
  tetoDoLado,
} from "./candidatura";

/**
 * ─ O LADO DA POSIÇÃO: OFICIAL OU BANCO ──────────────────────────────────────────────────────────
 *
 * A régua pura da finalização de posição, testada sem banco e sem HTTP. O que ela decide, e o que
 * cada teste protege:
 *   - o lado AUSENTE vale OFICIAL, que é o que toda candidatura de hoje já é;
 *   - cada lado tem TETO PRÓPRIO, medido contra a ocupação DAQUELE lado;
 *   - a conta do AVISO diz quantas posições oficiais continuam abertas se a pessoa for para o banco;
 *   - o nulo do banco vira OFICIAL na dobra por lado, e nunca um terceiro lado.
 */

describe("ladoDaCandidatura", () => {
  /**
   * O CASO QUE SUSTENTA A COLUNA NULÁVEL: sem esta coalescência, a migration precisaria reescrever
   * toda linha existente para dizer o que elas já são.
   */
  it("nulo e indefinido valem OFICIAL", () => {
    expect(ladoDaCandidatura(null)).toBe("OFICIAL");
    expect(ladoDaCandidatura(undefined)).toBe("OFICIAL");
  });

  it("BANCO é o único valor que sai do padrão", () => {
    expect(ladoDaCandidatura("BANCO")).toBe("BANCO");
    expect(ladoDaCandidatura("OFICIAL")).toBe("OFICIAL");
  });

  /**
   * VALOR ESTRANHO CAI EM OFICIAL, e isto é fail-closed: o lado desconhecido é medido contra o teto
   * MENOR (a meta oficial), e não contra o maior. O CHECK do banco já impede a linha de existir;
   * esta é a segunda trava, para o dia em que alguém escrever pelo psql.
   */
  it("valor desconhecido cai no lado de teto MENOR", () => {
    expect(ladoDaCandidatura("QUALQUER_COISA")).toBe("OFICIAL");
  });

  it("os dois lados são exatamente estes, e não mais", () => {
    expect([...POSICAO_LADOS]).toEqual(["OFICIAL", "BANCO"]);
  });
});

describe("tetoDoLado", () => {
  it("OFICIAL tem por teto a meta oficial, e o banco não entra", () => {
    expect(tetoDoLado("OFICIAL", 5, 20)).toBe(5);
  });

  /**
   * ─ O TETO DO BANCO É PRÓPRIO, E NÃO MAIS CUMULATIVO (decisão de desenho, 08/09) ───────────────
   *
   * O CUMULATIVO (banco medido contra oficiais MAIS banco) existia porque só havia UMA contagem de
   * ocupação: com um número e dois tetos, somar as metas era o único jeito de os dois lados
   * conviverem. A contagem passou a ser por lado, e a premissa acabou.
   *
   * MANTER O CUMULATIVO COM CONTAGEM POR LADO INFLARIA A VAGA: o banco compararia a ocupação DO
   * BANCO (até 20) contra 25, aceitando 25 na reserva, e o oficial aceitaria mais 5 por cima. A vaga
   * de 25 posições receberia 30, porque a meta oficial seria somada duas vezes.
   *
   * O TOTAL DA VAGA NÃO MUDOU: 5 oficiais mais 20 de banco continuam sendo 25 pessoas, agora ditas
   * uma vez cada.
   */
  it("BANCO tem por teto a meta DE BANCO, e a oficial não entra", () => {
    expect(tetoDoLado("BANCO", 5, 20)).toBe(20);
  });

  it("os dois tetos somados são a capacidade da vaga, sem contar a oficial duas vezes", () => {
    const oficial = tetoDoLado("OFICIAL", 5, 20) ?? 0;
    const banco = tetoDoLado("BANCO", 5, 20) ?? 0;
    expect(oficial + banco).toBe(25);
  });

  /**
   * BANCO ZERO É TETO ZERO, e é resposta, não lacuna: a vaga que não reservou banco não tem para
   * onde mandar alguém na reserva. O cumulativo antigo devolvia a meta OFICIAL aqui, e era assim que
   * uma alocação de banco consumia uma posição oficial em silêncio.
   */
  it("banco ausente vale zero, e zero não empresta posição oficial", () => {
    expect(tetoDoLado("BANCO", 3, 0)).toBe(0);
    expect(tetoDoLado("BANCO", 3, null)).toBe(0);
    expect(tetoDoLado("BANCO", 3, undefined)).toBe(0);
    expect(cabeMaisUm(0, tetoDoLado("BANCO", 3, 0))).toBe(false);
  });

  /**
   * META OFICIAL NULA DEVOLVE NULO NOS DOIS LADOS, e este fail-closed fica de pé mesmo com o teto do
   * banco não dependendo mais da meta oficial: vaga sem posições definidas é rascunho, e entregar
   * posição num rascunho é o caso em que a trava recusa pedindo a meta. Quem transforma o nulo na
   * frase que pede para definir as posições é o service, e `cabeMaisUm` já recusa por ele.
   */
  it("meta oficial nula não tem teto em lado nenhum", () => {
    expect(tetoDoLado("OFICIAL", null, 20)).toBeNull();
    expect(tetoDoLado("BANCO", null, 20)).toBeNull();
    expect(cabeMaisUm(0, tetoDoLado("BANCO", null, 20))).toBe(false);
  });
});

/**
 * ─ A DOBRA DO NULO, EM UM LUGAR SÓ ──────────────────────────────────────────────────────────────
 *
 * O banco devolve três valores possíveis na coluna e o domínio tem dois lados. Quem resolve isso é
 * `ocupadasPorLado`, e é por isso que nenhuma consulta escreve `coalesce(posicao_lado, 'OFICIAL')`
 * em SQL: seria a régua do lado copiada para fora do domínio, onde teste nenhum a alcança.
 */
describe("ocupadasPorLado", () => {
  it("dobra o nulo em OFICIAL e soma cada lado separado", () => {
    expect(
      ocupadasPorLado([
        { lado: null, quantas: 3 },
        { lado: "OFICIAL", quantas: 2 },
        { lado: "BANCO", quantas: 7 },
      ]),
    ).toEqual({ OFICIAL: 5, BANCO: 7 });
  });

  /** O lado vazio é o que a trava mais consulta, então ele volta como zero, e nunca `undefined`. */
  it("devolve os dois lados mesmo quando ninguém está em um deles", () => {
    expect(ocupadasPorLado([])).toEqual({ OFICIAL: 0, BANCO: 0 });
    expect(ocupadasPorLado([{ lado: "BANCO", quantas: 4 }])).toEqual({ OFICIAL: 0, BANCO: 4 });
  });

  /** O `count(*)` pode chegar como texto do driver, e um `+` sobre texto concatenaria em vez de somar. */
  it("soma contagem que vem como texto", () => {
    expect(ocupadasPorLado([{ lado: "BANCO", quantas: "2" }, { lado: "BANCO", quantas: 3 }])).toEqual(
      { OFICIAL: 0, BANCO: 5 },
    );
  });

  /** Valor estranho cai no lado de teto MENOR, a mesma direção fail-closed de `ladoDaCandidatura`. */
  it("valor desconhecido soma no OFICIAL", () => {
    expect(ocupadasPorLado([{ lado: "QUALQUER_COISA", quantas: 1 }])).toEqual({
      OFICIAL: 1,
      BANCO: 0,
    });
  });
});

describe("oficiaisAindaAbertas", () => {
  /**
   * A CONTA DO AVISO. `ocupadasOficiaisSemEsta` exclui a candidatura que está sendo movida de
   * propósito: se ela vai para o banco, a posição oficial que ela poderia ter ocupado CONTINUA
   * aberta, e é isso que o consultor precisa ler antes de decidir.
   */
  it("diz quantas posições oficiais continuam abertas", () => {
    expect(oficiaisAindaAbertas(0, 5)).toBe(5);
    expect(oficiaisAindaAbertas(3, 5)).toBe(2);
  });

  /**
   * ─ O DEFEITO MEDIDO, MORTO NA RÉGUA PURA: o aviso que mentia e depois sumia ────────────────────
   *
   * A VAGA REAL DE HOMOLOGAÇÃO tem 5 oficiais e 20 de banco. Alocando UM A UM NO BANCO, as posições
   * oficiais continuam TODAS vazias: a ocupação que cresce é a do BANCO.
   *
   * COM O TOTAL (o defeito), a conta recebia 1, 2, 3, 4, 5 e respondia 5, 4, 3, 2, 1 e ZERO na
   * quinta, e o aviso parava de disparar exatamente no caso que ele existe para dar. COM A OCUPAÇÃO
   * OFICIAL, ela responde 5 as vinte vezes, porque é isso que está acontecendo.
   */
  it("alocar vinte no BANCO não fecha nenhuma posição oficial, e o aviso continua dizendo 5", () => {
    const ocupadasOficiais = 0;
    for (let noBanco = 0; noBanco <= 20; noBanco++) {
      expect(oficiaisAindaAbertas(ocupadasOficiais, 5)).toBe(5);
      // E o que o defeito fazia, dito aqui para o teste explicar o que ele protege: com o TOTAL, o
      // aviso zera na quinta alocação de banco, com as 5 oficiais intactas.
      if (noBanco >= 5) expect(oficiaisAindaAbertas(noBanco, 5)).toBe(0);
    }
  });

  it("oficiais cheias não avisam nada", () => {
    expect(oficiaisAindaAbertas(5, 5)).toBe(0);
  });

  /** PISO EM ZERO: vaga excedida não tem "menos uma posição aberta", tem nenhuma. */
  it("vaga excedida devolve zero, e não número negativo", () => {
    expect(oficiaisAindaAbertas(7, 5)).toBe(0);
  });

  /**
   * SEM META, SEM AVISO. Não é omissão: sem meta oficial não existe posição oficial aberta a
   * informar, e a trava recusa a operação logo depois de qualquer forma.
   */
  it("meta nula não avisa", () => {
    expect(oficiaisAindaAbertas(0, null)).toBe(0);
    expect(oficiaisAindaAbertas(0, undefined)).toBe(0);
  });
});

/**
 * ─ OS ACEITES REGISTRÁVEIS: a lista que o BANCO também conhece ─────────────────────────────────
 *
 * ELES SÃO STRINGS COMPILADAS DENTRO DE UM CHECK no Postgres (migration 0097), e `ALTER TYPE` não
 * alcança CHECK: renomear um destes valores em código NÃO renomeia nada no banco, e a primeira
 * gravação depois do rename seria recusada pela restrição, em produção, na frente do consultor.
 *
 * É POR ISSO QUE OS VALORES SÃO FIXADOS AQUI, letra por letra. Este teste é o aviso de que mexer
 * neles é mexer no banco junto, e não uma renomeação interna.
 */
describe("ACEITES_REGISTRAVEIS", () => {
  it("são exatamente estes três, com estas letras, porque o CHECK do banco tem as mesmas", () => {
    expect(ACEITE_BANCO_COM_OFICIAIS_ABERTAS).toBe("BANCO_COM_OFICIAIS_ABERTAS");
    expect(ACEITE_REENTRADA).toBe("REENTRADA");
    expect(ACEITE_REABERTURA_SEM_ORIGEM).toBe("REABERTURA_SEM_ORIGEM");
    expect([...ACEITES_REGISTRAVEIS]).toEqual([
      "BANCO_COM_OFICIAIS_ABERTAS",
      "REENTRADA",
      "REABERTURA_SEM_ORIGEM",
    ]);
  });
});

/*
 * ─ O TERCEIRO VALOR ENTROU NA ONDA B3, E ESTA GUARDA DISPAROU CERTO ────────────────────────────
 *
 * `REABERTURA_SEM_ORIGEM` é o aceite do Master que traz alguém de volta num cancelamento ANTERIOR
 * ao registro de origem, isto é, quando o sistema ADMITE que não sabe onde a pessoa estava. Ali ele
 * não está desfazendo o próprio gesto, está REESCOLHENDO a pessoa, e por isso a escolha fica
 * registrada, no mesmo espírito da ciência de reentrada.
 *
 * A LISTA FOI ATUALIZADA JUNTO COM O BANCO, que é exatamente o que o bloco acima exige: a migration
 * `0105_as_aceite_da_reabertura_sem_origem.sql` reconstrói o CHECK com os três valores. Atualizar um
 * lado só é o defeito que esta guarda existe para pegar, e foi ela que pegou.
 */
