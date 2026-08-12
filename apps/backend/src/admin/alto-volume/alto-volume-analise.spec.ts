import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AltoVolumeAnaliseService } from "./alto-volume-analise.service";

/**
 * ALTO VOLUME (onda 4): a análise do projeto.
 *
 * O QUE ESTES TESTES PROTEGEM. Painel de contagem erra em silêncio: ninguém vê stack trace, vê um
 * número plausível e errado. Os casos abaixo são os três jeitos de esse erro nascer aqui.
 *
 * 1. O TOTAL não ser a soma das linhas (a tela se contradizendo com ela mesma).
 * 2. Um cargo SUMIR da lista, e são justamente os dois casos que pedem ação: cargo com vaga e
 *    ninguém vinculado (é o que falta contratar) e cargo com gente e sem vaga (erro de cadastro).
 * 3. "Faltam" medir contra quem está vinculado em vez de contra a META, que faria o projeto parecer
 *    completo assim que todo mundo entrasse na esteira, antes de qualquer admissão fechar.
 *
 * O termômetro tem bateria própria porque ele é conta de data, e conta de data erra em borda: o dia
 * exato do fim, o projeto que ainda não começou e o prazo vencido.
 */

const PROJETO = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

const PROJETO_OK: Row = {
  id: PROJETO,
  nome: "BIENAL DOS LIVROS",
  codCliente: "57269",
  clienteRazaoSocial: "EDITORA SCHWARCZ S.A.",
  clienteNomeOperacao: "CIA DAS LETRAS",
  dataInicio: "2026-09-01",
  dataFim: "2026-09-13",
  ativo: true,
};

interface Cenario {
  projeto?: Row | null;
  vagas?: Row[];
  /** Vínculo com o projeto: responde só "Na Esteira" e o preenchimento da meta. */
  vinculadas?: Row[];
  /** Status no universo cliente + período, o MESMO recorte do Controle Gerencial. */
  status?: Row[];
  grupos?: Row[];
}

/**
 * Fake do Drizzle por FILA DE RESULTADOS: a análise dispara cinco leituras em ordem conhecida
 * (projeto, vagas por cargo, vínculos por cargo, status por cargo, grupos), e cada `await` consome a
 * próxima. O encadeamento devolve sempre o mesmo objeto, que é "thenable" como o construtor do
 * Drizzle.
 *
 * A leitura de STATUS é separada da de VÍNCULO de propósito, e é o coração da correção: declínio não
 * é vinculado (§A.16), então contar status entre os vinculados escondia o que o projeto perdeu.
 */
function montar(cen: Cenario = {}) {
  const fila: unknown[][] = [
    cen.projeto === null ? [] : [cen.projeto ?? PROJETO_OK],
    cen.vagas ?? [],
    cen.vinculadas ?? [],
    cen.status ?? [],
    cen.grupos ?? [],
  ];
  let i = 0;

  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy"]) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(fila[Math.min(i++, fila.length - 1)]);

  const db = { select: vi.fn(() => chain) };
  return { db, service: new AltoVolumeAnaliseService(db as never) };
}

const HOJE = new Date("2026-09-05T12:00:00Z");

describe("análise: os totais são a soma das linhas", () => {
  it("soma vagas, vinculadas e cada balde", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Atendente", vagas: 57 },
        { cargoId: "c2", cargoNome: "Caixa", vagas: 15 },
      ],
      vinculadas: [
        { cargoId: "c1", cargoNome: "Atendente", vinculadas: 50 },
        { cargoId: "c2", cargoNome: "Caixa", vinculadas: 15 },
      ],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          concluidas: 40,
          cadastradas: 45,
          emAndamento: 7,
          pausadas: 2,
          declinios: 1,
          emBanco: 3,
        },
        {
          cargoId: "c2",
          cargoNome: "Caixa",
          concluidas: 15,
          cadastradas: 15,
          emAndamento: 0,
          pausadas: 0,
          declinios: 0,
          emBanco: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais).toEqual({
      vagas: 72,
      vinculadas: 65,
      concluidas: 55,
      cadastradas: 60,
      emAndamento: 7,
      pausadas: 2,
      declinios: 1,
      emBanco: 3,
      faltam: 17,
      percentual: 76,
    });
    expect(r.totais.vagas).toBe(r.porCargo.reduce((s, l) => s + l.vagas, 0));
    expect(r.totais.concluidas).toBe(r.porCargo.reduce((s, l) => s + l.concluidas, 0));
  });

  it("PAUSADA tem balde próprio e não vira em andamento", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Atendente", vagas: 10 }],
      vinculadas: [{ cargoId: "c1", cargoNome: "Atendente", vinculadas: 10 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          concluidas: 0,
          cadastradas: 0,
          emAndamento: 6,
          pausadas: 4,
          declinios: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.pausadas).toBe(4);
    expect(r.totais.emAndamento).toBe(6);
  });
});

/**
 * O DEFEITO QUE ORIGINOU A SEPARAÇÃO DOS UNIVERSOS (achado do diretor, conferido contra o Controle
 * Gerencial filtrado por cliente e período). O caso real da Bienal: 23 declínios do cliente no
 * período, dos quais 22 NUNCA entraram em `admissao_projeto`, porque quem declina não deixa nada
 * ativo na esteira (§A.16). A análise contava status entre os vinculados e mostrava UM declínio: o
 * projeto tinha perdido 23 pessoas e a tela dizia que tinha perdido uma.
 */
describe("análise: os baldes de status são do universo cliente + período, não do vínculo", () => {
  it("declínio NÃO vinculado conta no balde (era o buraco: 23 viravam 1)", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 }],
      // Só 1 dos 23 declínios está vinculado ao projeto, como na base real.
      vinculadas: [{ cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 70 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Vendedor I",
          concluidas: 0,
          cadastradas: 37,
          emAndamento: 99,
          pausadas: 0,
          declinios: 23,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.declinios, "o balde tem de contar os 23, não só o vinculado").toBe(23);
    // O vínculo segue respondendo o Na Esteira, sem ser contaminado pelo universo maior.
    expect(r.totais.vinculadas).toBe(70);
    expect(r.totais.vagas).toBe(66);
  });

  /**
   * EM BANCO por cargo alimenta o card dividido e o modal (decisão do diretor). Vem do mesmo universo
   * cliente + período dos demais status, então o total é a soma das linhas, como todo o resto.
   */
  it("EM BANCO é contado por cargo, para o card dividido e o modal", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 },
        { cargoId: "c2", cargoNome: "Caixa", vagas: 15 },
      ],
      status: [
        { cargoId: "c1", cargoNome: "Vendedor I", concluidas: 0, cadastradas: 0, emAndamento: 5, pausadas: 0, declinios: 2, emBanco: 4 },
        { cargoId: "c2", cargoNome: "Caixa", concluidas: 0, cadastradas: 0, emAndamento: 3, pausadas: 0, declinios: 0, emBanco: 1 },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.emBanco).toBe(5);
    expect(r.porCargo.find((l) => l.cargoNome === "Vendedor I")?.emBanco).toBe(4);
    expect(r.porCargo.find((l) => l.cargoNome === "Caixa")?.emBanco).toBe(1);
  });

  /**
   * CADASTRADAS e CONCLUÍDAS são baldes diferentes: "concluída" exige a frente de INTEGRAÇÃO fechada,
   * e as 37 da Bienal estão cadastradas esperando integração. Se alguém igualar as duas, o número de
   * concluídas do projeto passa a discordar do Gerenciador e do KPI do painel.
   */
  it("CADASTRADAS é balde próprio e não vira concluída", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 }],
      vinculadas: [{ cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 70 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Vendedor I",
          concluidas: 0,
          cadastradas: 37,
          emAndamento: 99,
          pausadas: 0,
          declinios: 23,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.cadastradas).toBe(37);
    expect(r.totais.concluidas).toBe(0);
  });
});

describe("análise: nenhum cargo some da lista", () => {
  it("cargo COM vaga e SEM ninguém vinculado aparece (é o que falta contratar)", async () => {
    const ctx = montar({ vagas: [{ cargoId: "c9", cargoNome: "Estoquista", vagas: 8 }] });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo).toHaveLength(1);
    expect(r.porCargo[0]).toMatchObject({ cargoNome: "Estoquista", vagas: 8, vinculadas: 0, faltam: 8 });
  });

  it("cargo COM gente e SEM vaga cadastrada aparece (erro de cadastro à vista)", async () => {
    const ctx = montar({
      vinculadas: [
        {
          cargoId: "c7",
          cargoNome: "Faxineiro(a)",
          vinculadas: 3,
          concluidas: 1,
          emAndamento: 2,
          pausadas: 0,
          declinios: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0]).toMatchObject({ cargoNome: "Faxineiro(a)", vagas: 0, vinculadas: 3 });
    // Sem meta não há percentual: zero é honesto, NaN vazaria como largura inválida no cilindro.
    expect(r.porCargo[0].percentual).toBe(0);
    expect(r.porCargo[0].faltam).toBe(0);
  });

  it("admissão SEM cargo vira linha própria em vez de ser descartada", async () => {
    const ctx = montar({
      vinculadas: [
        {
          cargoId: null,
          cargoNome: null,
          vinculadas: 2,
          concluidas: 0,
          emAndamento: 2,
          pausadas: 0,
          declinios: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0]).toMatchObject({ cargoId: null, cargoNome: "não informado", vinculadas: 2 });
    expect(r.totais.vinculadas).toBe(2);
  });

  it("ordena pela maior meta, que é como o time lê o projeto", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Caixa", vagas: 15 },
        { cargoId: "c2", cargoNome: "Atendente", vagas: 57 },
        { cargoId: "c3", cargoNome: "Vendedor I", vagas: 10 },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo.map((l) => l.cargoNome)).toEqual(["Atendente", "Caixa", "Vendedor I"]);
  });
});

describe('análise: "faltam" é contra a META, não contra o vínculo', () => {
  it("57 vinculados e nenhuma concluída ainda faltam 57", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Atendente", vagas: 57 }],
      vinculadas: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          vinculadas: 57,
          concluidas: 0,
          emAndamento: 57,
          pausadas: 0,
          declinios: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0].faltam).toBe(57);
    expect(r.porCargo[0].percentual).toBe(0);
  });

  it("mais concluídas que vagas não vira número negativo", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Atendente", vagas: 5 }],
      vinculadas: [{ cargoId: "c1", cargoNome: "Atendente", vinculadas: 7 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          concluidas: 7,
          cadastradas: 7,
          emAndamento: 0,
          pausadas: 0,
          declinios: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0].faltam).toBe(0);
    expect(r.porCargo[0].percentual).toBe(140);
  });
});

describe("termômetro", () => {
  const comHoje = async (hoje: string) => {
    const ctx = montar();
    const r = await ctx.service.analise(PROJETO, new Date(`${hoje}T12:00:00Z`));
    return r.termometro;
  };

  /**
   * TUDO AQUI É DIA ÚTIL (decisão do diretor), e o projeto de teste é o caso real: 01/09 a 13/09 de
   * 2026 são 13 dias corridos e apenas 8 dias úteis, porque caem dois fins de semana e o feriado da
   * Independência (07/09, uma segunda). Os números abaixo saem desse calendário, não de arredondamento.
   */
  it("conta os dias ÚTEIS que faltam, sem contar o dia de hoje", async () => {
    // Sábado 05/09: restam 08, 09, 10 e 11 (06 é domingo, 07 é feriado, 12 e 13 são fim de semana).
    expect((await comHoje("2026-09-05")).diasRestantes).toBe(4);
    // No último dia não resta prazo nenhum para trabalhar.
    expect((await comHoje("2026-09-13")).diasRestantes).toBe(0);
  });

  it("projeto que ainda não começou não gastou prazo, e o total é em dias úteis", async () => {
    const t = await comHoje("2026-08-11");
    expect(t.decorridos).toBe(0);
    expect(t.percentualDecorrido).toBe(0);
    expect(t.totalDias).toBe(8);
  });

  /**
   * NÚMERO CONFERIDO PELO DIRETOR: em 11/08/2026, faltam 15 dias úteis para a Bienal abrir (01/09).
   * Conta hoje e para na véspera. Depois que o projeto abre, a contagem zera e a pergunta passa a ser
   * o prazo até o fim.
   */
  it("antes de abrir, conta os dias úteis QUE FALTAM PARA COMEÇAR, incluindo hoje", async () => {
    expect((await comHoje("2026-08-11")).diasParaInicio).toBe(15);
    // Véspera da abertura: resta o próprio dia de hoje.
    expect((await comHoje("2026-08-31")).diasParaInicio).toBe(1);
    // No dia da abertura e depois dele, não falta mais nada para começar.
    expect((await comHoje("2026-09-01")).diasParaInicio).toBe(0);
    expect((await comHoje("2026-09-10")).diasParaInicio).toBe(0);
  });

  it("o decorrido também é em dia útil: fim de semana não gasta prazo", async () => {
    // Sexta 04/09 e domingo 06/09 têm o MESMO decorrido (01 a 04), porque nada andou no fim de semana.
    expect((await comHoje("2026-09-04")).decorridos).toBe(4);
    expect((await comHoje("2026-09-06")).decorridos).toBe(4);
  });

  it("as faixas: mais de 7 é ok, até 7 é atenção, até 3 é crítico, vencido é encerrado", async () => {
    expect((await comHoje("2026-08-31")).situacao).toBe("ok"); // 8 dias úteis pela frente
    expect((await comHoje("2026-09-01")).situacao).toBe("atencao"); // 7
    expect((await comHoje("2026-09-07")).situacao).toBe("atencao"); // 4
    expect((await comHoje("2026-09-11")).situacao).toBe("critico"); // 0
    expect((await comHoje("2026-09-14")).situacao).toBe("encerrado");
  });
});

describe("alerta por grupo", () => {
  it("projeto sem turma devolve lista vazia (a tela não desenha a seção)", async () => {
    const ctx = montar();
    const r = await ctx.service.analise(PROJETO, HOJE);
    expect(r.grupos).toEqual([]);
  });

  it("turma que já entrou conta atrasadas; turma futura não", async () => {
    const ctx = montar({
      grupos: [
        { id: "g1", rotulo: "Grupo 1", dataEntrada: "2026-09-01", vagas: 10, vinculadas: 10, concluidas: 6, entrou: true },
        { id: "g2", rotulo: "Grupo 2", dataEntrada: "2026-09-20", vagas: 5, vinculadas: 4, concluidas: 0, entrou: false },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.grupos[0]).toMatchObject({ rotulo: "Grupo 1", atrasadas: 4, percentual: 60 });
    expect(r.grupos[1]).toMatchObject({ rotulo: "Grupo 2", atrasadas: 0 });
  });
});

describe("análise: guarda", () => {
  it("projeto inexistente é 404", async () => {
    const ctx = montar({ projeto: null });
    await expect(ctx.service.analise(PROJETO, HOJE)).rejects.toBeInstanceOf(NotFoundException);
  });
});
