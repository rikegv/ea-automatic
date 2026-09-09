import { describe, expect, it } from "vitest";
import type { AsOcupacaoVaga, VagaStatus } from "@ea/shared-types";
import {
  TRILHA_DESFECHO_ROTULO,
  TRILHA_PROCESSO_ROTULO,
  desfechoDaVaga,
  processoDaVaga,
  trilhaDaVaga,
  type VagaTrilha,
} from "./as-vaga-trilha";

/**
 * O QUE ESTE TESTE PROTEGE: que os DOIS EIXOS da trilha continuem independentes.
 *
 * O erro fácil, e o que o desenho mandou evitar, é tratar "processo seletivo concluído" e "vaga
 * fechada" como degraus da mesma fila. Eles não são: a vaga que preencheu todas as posições SEGUE
 * ABERTA, e a vaga fechada pode ter fechado sem entregar nada. Quem unificar os dois eixos quebra
 * aqui, antes de a tela dizer ao consultor que uma vaga viva está encerrada.
 *
 * O SEGUNDO PONTO PROTEGIDO é a fonte do número: a trilha lê `preenchidas`, a MESMA régua validada
 * que enche o cilindro da tabela. Os casos de vaga encerrada provam isso de lado, já que ali o
 * número vem do carimbo do fechamento e não da alocação de agora.
 */

/*
 * O FIXTURE DECLARA O CONTRATO INTEIRO, SEM CAST, como o da régua de ocupação. Ele fechava com
 * `as AsOcupacaoVaga` e declarava só `finalizadas`, e isso quebrou exatamente como estava previsto:
 * quando a régua passou a ler `finalizadasOficial` (08/09), o campo ausente virava `undefined`, o
 * `?? 0` da régua transformava em zero, e dois testes daqui falhavam com NÚMERO ERRADO em vez de
 * erro de tipo. Sem cast, campo novo no contrato quebra o typecheck apontando esta linha.
 *
 * A TRILHA CONTA O LADO OFICIAL (`preenchidas(v, "oficial")`), então o número do fixture é o das
 * posições oficiais entregues, e o banco fica em zero. O total é calculado, nunca digitado, porque
 * `finalizadas === finalizadasOficial + finalizadasBanco` é invariante do contrato.
 */
function ocupacao(finalizadas: number): AsOcupacaoVaga {
  return {
    vagaId: "v1",
    posicoesOficiais: null,
    ocupadas: finalizadas,
    finalizadas,
    finalizadasOficial: finalizadas,
    finalizadasBanco: 0,
    livres: null,
    emSelecao: 0,
    fora: 0,
    excedida: false,
  };
}

function vaga(p: {
  status: VagaStatus;
  meta?: number | null;
  fechadas?: number | null;
  finalizadas?: number;
  enviar?: boolean;
  dataFechamento?: string | null;
}): VagaTrilha {
  return {
    status: p.status,
    posicoesOficiais: p.meta === undefined ? 3 : p.meta,
    vagasFechadas: p.fechadas ?? null,
    vagasFechadasBanco: null,
    enviarParaAdmissao: p.enviar ?? false,
    dataFechamento: p.dataFechamento ?? null,
    ocupacao: ocupacao(p.finalizadas ?? 0),
  };
}

describe("eixo 1: o processo seletivo", () => {
  it("rascunho não começou o processo", () => {
    expect(processoDaVaga(vaga({ status: "RASCUNHO" }))).toBe("RASCUNHO");
  });

  it("aberta com posições faltando é vaga aberta", () => {
    expect(processoDaVaga(vaga({ status: "ABERTA", meta: 3, finalizadas: 2 }))).toBe("VAGA_ABERTA");
  });

  it("aberta com todas as posições entregues é PROCESSO CONCLUÍDO, e continua ABERTA", () => {
    const v = vaga({ status: "ABERTA", meta: 3, finalizadas: 3 });
    expect(processoDaVaga(v)).toBe("PROCESSO_CONCLUIDO");
    // O ponto inteiro do eixo 2: concluir o processo NÃO encerra a vaga.
    expect(desfechoDaVaga(v)).toBe("AINDA_NAO_ENCERRADA");
  });

  it("entregar MAIS que a meta também é processo concluído, e não some", () => {
    expect(processoDaVaga(vaga({ status: "ABERTA", meta: 2, finalizadas: 5 }))).toBe(
      "PROCESSO_CONCLUIDO",
    );
  });

  it("meta NULA nunca conclui: sem meta não há o que comparar", () => {
    expect(processoDaVaga(vaga({ status: "ABERTA", meta: null, finalizadas: 4 }))).toBe(
      "VAGA_ABERTA",
    );
  });

  it("meta ZERO nunca conclui: zero de zero não é entrega", () => {
    expect(processoDaVaga(vaga({ status: "ABERTA", meta: 0, finalizadas: 0 }))).toBe("VAGA_ABERTA");
  });

  it("vaga encerrada tem o processo encerrado, qualquer que seja a contagem", () => {
    expect(processoDaVaga(vaga({ status: "ENTREGUE", fechadas: 1 }))).toBe("PROCESSO_ENCERRADO");
    expect(processoDaVaga(vaga({ status: "FECHADA", fechadas: 0 }))).toBe("PROCESSO_ENCERRADO");
    expect(processoDaVaga(vaga({ status: "CANCELADA" }))).toBe("PROCESSO_ENCERRADO");
  });
});

describe("eixo 2: o desfecho", () => {
  it("vaga viva não tem desfecho", () => {
    expect(desfechoDaVaga(vaga({ status: "RASCUNHO" }))).toBe("AINDA_NAO_ENCERRADA");
    expect(desfechoDaVaga(vaga({ status: "ABERTA" }))).toBe("AINDA_NAO_ENCERRADA");
  });

  it("encerrada com o envio marcado é ENVIADA PARA ADMISSÃO", () => {
    expect(desfechoDaVaga(vaga({ status: "ENTREGUE", fechadas: 2, enviar: true }))).toBe(
      "ENVIADA_PARA_ADMISSAO",
    );
  });

  it("encerrada com entrega e SEM envio finaliza na A&S", () => {
    expect(desfechoDaVaga(vaga({ status: "ENTREGUE", fechadas: 2, enviar: false }))).toBe(
      "FINALIZADA_NA_AS",
    );
  });

  it("encerrada sem nenhuma posição preenchida é FECHADA SEM ENTREGA", () => {
    expect(desfechoDaVaga(vaga({ status: "FECHADA", fechadas: 0 }))).toBe("FECHADA_SEM_ENTREGA");
  });

  it("cancelada vence o envio marcado: vaga cancelada não entregou nada", () => {
    expect(desfechoDaVaga(vaga({ status: "CANCELADA", fechadas: 3, enviar: true }))).toBe(
      "CANCELADA",
    );
  });

  it("a contagem do desfecho é a do FECHAMENTO, e não a alocação de agora", () => {
    // Alguém alocado depois do fechamento não pode transformar "fechada sem entrega" em entrega.
    expect(desfechoDaVaga(vaga({ status: "FECHADA", fechadas: 0, finalizadas: 7 }))).toBe(
      "FECHADA_SEM_ENTREGA",
    );
  });
});

describe("a frase de apoio diz o que o rótulo não cabe", () => {
  it("a intenção de admissão vem com a ressalva de que ninguém confirmou", () => {
    const t = trilhaDaVaga(vaga({ status: "ENTREGUE", fechadas: 1, enviar: true }));
    expect(t.desfecho.frase).toContain("ainda não confirma");
  });

  it("a vaga aberta diz quantas posições faltam, no plural certo", () => {
    expect(trilhaDaVaga(vaga({ status: "ABERTA", meta: 1, finalizadas: 0 })).processo.frase).toBe(
      "A vaga está aberta, com 0 de 1 posição oficial preenchida.",
    );
  });

  it("o processo encerrado carrega a data do fechamento quando ela existe", () => {
    const t = trilhaDaVaga(vaga({ status: "FECHADA", fechadas: 2, dataFechamento: "2026-08-25" }));
    expect(t.processo.frase).toContain("25/08/2026");
  });

  it("§A.11: nenhum rótulo nem nenhuma frase da trilha usa travessão", () => {
    const casos: VagaTrilha[] = [
      vaga({ status: "RASCUNHO" }),
      vaga({ status: "ABERTA", meta: null }),
      vaga({ status: "ABERTA", meta: 0 }),
      vaga({ status: "ABERTA", meta: 3, finalizadas: 3 }),
      vaga({ status: "ENTREGUE", fechadas: 1, enviar: true }),
      vaga({ status: "ENTREGUE", fechadas: 1 }),
      vaga({ status: "FECHADA", fechadas: 0 }),
      vaga({ status: "CANCELADA" }),
    ];
    const textos = [
      ...Object.values(TRILHA_PROCESSO_ROTULO),
      ...Object.values(TRILHA_DESFECHO_ROTULO),
      ...casos.flatMap((c) => {
        const t = trilhaDaVaga(c);
        return [t.processo.frase, t.desfecho.frase];
      }),
    ];
    for (const texto of textos) expect(texto).not.toContain("—");
  });
});

/**
 * OS QUATRO CASOS REAIS DA HOMOLOGAÇÃO, lidos do banco em 08/09/2026. Eles não acrescentam régua
 * nenhuma: acrescentam a CALIBRAGEM, que é o que permite abrir a 3120 e conferir linha a linha sem
 * ler código. Nenhuma vaga de homologação está em "Processo Seletivo Concluído" nem em "Enviada
 * Para Admissão", e os dois casos abaixo cobrem o que a tela ainda não tem como mostrar.
 */
describe("os quatro casos da homologação", () => {
  const casos: { nome: string; v: VagaTrilha; processo: string; desfecho: string }[] = [
    {
      nome: "123456 - TESTE (aberta, 5 oficiais, ninguém alocado)",
      v: vaga({ status: "ABERTA", meta: 5, finalizadas: 0 }),
      processo: "Vaga Aberta",
      desfecho: "Ainda Não Encerrada",
    },
    {
      nome: "PS-2026-001 (entregue, contada 1 de 3 no fechamento)",
      v: vaga({ status: "ENTREGUE", meta: 3, fechadas: 1, dataFechamento: "2026-08-25" }),
      processo: "Processo Seletivo Encerrado",
      desfecho: "Finalizada Na A&S",
    },
    {
      nome: "PS-2026-002 (aberta, 2 oficiais)",
      v: vaga({ status: "ABERTA", meta: 2, finalizadas: 0 }),
      processo: "Vaga Aberta",
      desfecho: "Ainda Não Encerrada",
    },
    {
      nome: "PS-2026-003 (fechada, contada 2 de 2)",
      v: vaga({ status: "FECHADA", meta: 2, fechadas: 2 }),
      processo: "Processo Seletivo Encerrado",
      desfecho: "Finalizada Na A&S",
    },
  ];

  for (const caso of casos) {
    it(`${caso.nome} mostra ${caso.processo} e ${caso.desfecho}`, () => {
      const t = trilhaDaVaga(caso.v);
      expect(t.processo.rotulo).toBe(caso.processo);
      expect(t.desfecho.rotulo).toBe(caso.desfecho);
    });
  }
});
