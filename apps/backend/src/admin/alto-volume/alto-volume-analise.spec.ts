import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { AltoVolumeAnaliseService } from "./alto-volume-analise.service";

/**
 * ALTO VOLUME (onda 4): a análise do projeto.
 *
 * O QUE ESTES TESTES PROTEGEM. Painel de contagem erra em silêncio: ninguém vê stack trace, vê um
 * número plausível e errado. Os casos abaixo são os três jeitos de esse erro nascer aqui.
 *
 * 1. A CONTA NÃO FECHAR na meta: Em Andamento + Concluídas + Faltam tem de dar o Total De Vagas do
 *    projeto, exato, na linha e no total. É a régua do diretor e a primeira asserção do arquivo.
 * 2. O TOTAL não ser a soma das linhas (a tela se contradizendo com ela mesma).
 * 3. Um cargo SUMIR da lista, e são justamente os dois casos que pedem ação: cargo com vaga e
 *    ninguém vinculado (é o que falta contratar) e cargo com gente e sem vaga (erro de cadastro).
 * 4. Declínio voltar para dentro da matemática das vagas, somando ou subtraindo da meta.
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
  /** Status no universo do PROJETO: os vinculados em `admissao_projeto`, onde a conta fecha. */
  status?: Row[];
  /** Declínios no universo cliente + período, FORA da matemática das vagas. */
  declinios?: Row[];
  grupos?: Row[];
}

/**
 * Fake do Drizzle por FILA DE RESULTADOS: a análise dispara cinco leituras em ordem conhecida
 * (projeto, vagas por cargo, status dos vinculados, declínios do cliente no período, grupos), e cada
 * `await` consome a próxima. O encadeamento devolve sempre o mesmo objeto, que é "thenable" como o
 * construtor do Drizzle.
 *
 * A leitura de DECLÍNIO é separada da de status de propósito, e é o que sobrou da correção anterior:
 * declínio não é vinculado (§A.16), então contá-lo entre os vinculados escondia o que o projeto
 * perdeu. Ele segue no recorte maior, agora fora da conta da meta.
 */
function montar(cen: Cenario = {}) {
  const fila: unknown[][] = [
    cen.projeto === null ? [] : [cen.projeto ?? PROJETO_OK],
    cen.vagas ?? [],
    cen.status ?? [],
    cen.declinios ?? [],
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

describe("análise: a conta fecha no total de vagas do projeto", () => {
  /**
   * A RÉGUA DO DIRETOR, com a diretoria olhando: Em Andamento + Concluídas + Faltam = a meta. É a
   * asserção que a frente inteira existe para sustentar, e por isso ela vem antes de qualquer outra.
   */
  it("Em Andamento + Concluídas + Faltam = Total De Vagas, exato", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 },
        { cargoId: "c2", cargoNome: "Vendedor II", vagas: 25 },
      ],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Vendedor I",
          vinculadas: 68,
          concluidas: 30,
          cadastradas: 30,
          emAndamento: 38,
          pausadas: 0,
          emBanco: 0,
        },
        {
          cargoId: "c2",
          cargoNome: "Vendedor II",
          vinculadas: 22,
          concluidas: 13,
          cadastradas: 13,
          emAndamento: 9,
          pausadas: 0,
          emBanco: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);
    const { vagas, concluidas, emAndamento, faltam } = r.totais;

    expect(concluidas + emAndamento + faltam, "a conta tem de fechar na meta").toBe(vagas);
    expect(vagas).toBe(91);
    expect(faltam).toBe(1);
  });

  /**
   * CARGO COM MAIS GENTE DO QUE VAGA é o caso real da Bienal (68 ativos para 66 vagas do Vendedor I),
   * e é onde a conta quebraria em silêncio: travando a linha em zero, a coluna Faltam somaria mais do
   * que o resto real da meta e deixaria de bater com o total logo abaixo dela.
   */
  it("cargo estourado devolve negativo, e a coluna continua somando o total", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 },
        { cargoId: "c2", cargoNome: "Faxineiro(a)", vagas: 4 },
      ],
      status: [
        { cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 68, concluidas: 30, cadastradas: 30, emAndamento: 38, pausadas: 0, emBanco: 0 },
        { cargoId: "c2", cargoNome: "Faxineiro(a)", vinculadas: 2, concluidas: 1, cadastradas: 1, emAndamento: 1, pausadas: 0, emBanco: 0 },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo.find((l) => l.cargoNome === "Vendedor I")?.faltam).toBe(-2);
    expect(r.totais.faltam).toBe(r.porCargo.reduce((s, l) => s + l.faltam, 0));
    expect(r.totais.concluidas + r.totais.emAndamento + r.totais.faltam).toBe(r.totais.vagas);
  });

  it("soma vagas, vinculadas e cada balde", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Atendente", vagas: 57 },
        { cargoId: "c2", cargoNome: "Caixa", vagas: 15 },
      ],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          vinculadas: 50,
          concluidas: 40,
          cadastradas: 45,
          emAndamento: 7,
          pausadas: 2,
          emBanco: 3,
        },
        {
          cargoId: "c2",
          cargoNome: "Caixa",
          vinculadas: 15,
          concluidas: 15,
          cadastradas: 15,
          emAndamento: 0,
          pausadas: 0,
          emBanco: 0,
        },
      ],
      declinios: [{ cargoId: "c1", cargoNome: "Atendente", declinios: 1 }],
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
      // 72 - 65: a meta menos quem está na esteira (régua única, 13/08/2026). Era 10 pela conta
      // antiga (`vagas - concluídas - em andamento`), que ignorava pausada e banco e por isso
      // divergia do número que o card de cada cargo desenhava.
      faltam: 7,
      percentual: 76,
    });
    expect(r.totais.vagas).toBe(r.porCargo.reduce((s, l) => s + l.vagas, 0));
    expect(r.totais.concluidas).toBe(r.porCargo.reduce((s, l) => s + l.concluidas, 0));
    // A IDENTIDADE DA TELA: "Na Esteira + Faltam = Total de Vagas", agora por construção.
    expect(r.totais.vinculadas + r.totais.faltam).toBe(r.totais.vagas);
  });

  /**
   * A EXIGÊNCIA DO DIRETOR, no caso REAL que a expôs (Bienal, print de 13/08/2026): o card grande do
   * topo dizia "Faltam 4" enquanto os cards por cargo somavam 6 (3 + 1 + 2), e "Concluídas 98" era
   * MAIOR que "Na Esteira 96", o que é impossível por definição.
   *
   * Eram duas causas somadas, e este teste trava as duas: (a) o topo e o card faziam contas
   * DIFERENTES para o mesmo número, e (b) "Concluídas" não filtrava farol, então quem fechou o
   * Cadastro e depois declinou entrava em Concluídas e saía do Na Esteira.
   *
   * A fixture reproduz a base real: Vendedor I com 63 na esteira para 66 vagas, Vendedor II com 24
   * para 25 e Faxineiro com 2 para 4. O `concluidas` que chega aqui já vem filtrado pela consulta
   * (é o que a correção do serviço faz), então o teste mede o que a tela lê.
   */
  it("o Faltam do topo é a soma dos Falta dos cargos, e Concluídas nunca passa Na Esteira", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 },
        { cargoId: "c2", cargoNome: "Vendedor II", vagas: 25 },
        { cargoId: "c3", cargoNome: "Faxineiro(a)", vagas: 4 },
        { cargoId: "c4", cargoNome: "Coordenador Financeiro(a)", vagas: 3 },
        { cargoId: "c5", cargoNome: "Assistente de Marketing", vagas: 2 },
        { cargoId: "c6", cargoNome: "Coordenador Comercial", vagas: 2 },
      ],
      status: [
        { cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 63, concluidas: 63, cadastradas: 63, emAndamento: 0, pausadas: 0, emBanco: 0 },
        { cargoId: "c2", cargoNome: "Vendedor II", vinculadas: 24, concluidas: 24, cadastradas: 24, emAndamento: 0, pausadas: 0, emBanco: 0 },
        { cargoId: "c3", cargoNome: "Faxineiro(a)", vinculadas: 2, concluidas: 2, cadastradas: 2, emAndamento: 0, pausadas: 0, emBanco: 0 },
        { cargoId: "c4", cargoNome: "Coordenador Financeiro(a)", vinculadas: 3, concluidas: 3, cadastradas: 3, emAndamento: 0, pausadas: 0, emBanco: 0 },
        { cargoId: "c5", cargoNome: "Assistente de Marketing", vinculadas: 2, concluidas: 2, cadastradas: 2, emAndamento: 0, pausadas: 0, emBanco: 0 },
        { cargoId: "c6", cargoNome: "Coordenador Comercial", vinculadas: 2, concluidas: 2, cadastradas: 2, emAndamento: 0, pausadas: 0, emBanco: 0 },
      ],
      declinios: [{ cargoId: "c1", cargoNome: "Vendedor I", declinios: 26 }],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);
    const porCargo = (nome: string) => r.porCargo.find((l) => l.cargoNome === nome)!;

    // O que cada card mostra, um a um.
    expect(porCargo("Vendedor I").faltam).toBe(3);
    expect(porCargo("Vendedor II").faltam).toBe(1);
    expect(porCargo("Faxineiro(a)").faltam).toBe(2);

    // A EXIGÊNCIA: topo igual à soma dos cards, sem exceção.
    expect(r.totais.faltam, "o topo tem de ser a soma dos cards").toBe(
      r.porCargo.reduce((s, l) => s + l.faltam, 0),
    );
    expect(r.totais.faltam).toBe(6);

    // Concluída é subconjunto de quem está na esteira, no total e em cada cargo.
    expect(r.totais.concluidas).toBeLessThanOrEqual(r.totais.vinculadas);
    for (const l of r.porCargo) expect(l.concluidas).toBeLessThanOrEqual(l.vinculadas);

    // E a conta da tela fecha: 96 na esteira + 6 faltam = 102 vagas.
    expect(r.totais.vinculadas + r.totais.faltam).toBe(r.totais.vagas);
    expect(r.totais.vagas).toBe(102);
    // Declínio segue fora da matemática: 26 no card, zero de efeito na meta.
    expect(r.totais.declinios).toBe(26);
  });

  /**
   * BANCO NÃO CONSOME VAGA, PAUSADA CONSOME (decisão do diretor, 13/08/2026).
   *
   * A distinção não é de estado, é de POSSE DA VAGA. Quem está em banco é reserva: não é dono de
   * vaga nenhuma, então a vaga dele volta a faltar e ele fica visível fora da conta, do mesmo jeito
   * que o declínio. Quem está pausado é o dono DAQUELA vaga, só parado: a vaga não está livre para
   * outra pessoa, então ela segue consumida.
   *
   * ESTA FIXTURE TEM BANCO E PAUSADA DE VERDADE, e é o ponto do teste: nenhuma fixture tinha banco,
   * então a regra nunca era exercitada e a contagem podia mudar de lado sem quebrar nada. Foi
   * exatamente o que aconteceu na sessão que originou esta OST, em que a régua foi descrita errada.
   *
   * O `vinculadas` que chega aqui já é o de quem CONSOME (a consulta exclui `BANCO_AGUARDAR` junto
   * com os terminais); o teste de SQL logo abaixo trava esse filtro na origem.
   */
  it("banco fica fora da conta e pausada fica dentro", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Vendedor I", vagas: 20 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Vendedor I",
          // 12 consomem vaga: 8 concluídas + 1 andando + 3 pausadas.
          vinculadas: 12,
          concluidas: 8,
          cadastradas: 8,
          emAndamento: 1,
          pausadas: 3,
          // 5 em banco, vivas e vinculadas, mas sem vaga.
          emBanco: 5,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    // O BANCO NÃO ENCOSTA NO "FALTAM": 20 vagas menos os 12 que consomem, e não menos 17.
    expect(r.totais.faltam, "banco não pode consumir vaga").toBe(8);
    // A IDENTIDADE DO DIRETOR: ativos + faltam = total, com banco em cima da mesa.
    expect(r.totais.vinculadas + r.totais.faltam).toBe(r.totais.vagas);
    // O banco continua visível, com número próprio: fora da conta não é fora da tela.
    expect(r.totais.emBanco).toBe(5);
    // A pausada continua contada como quem ocupa a vaga (está dentro de `vinculadas`) e mantém o
    // balde próprio, então ela não some nem vira "em andamento".
    expect(r.totais.pausadas).toBe(3);
    expect(r.totais.emAndamento).toBe(1);
    // E concluída nunca passa de quem consome vaga.
    expect(r.totais.concluidas).toBeLessThanOrEqual(r.totais.vinculadas);
  });

  /**
   * A REGRA NA ORIGEM, e não só na aritmética: a fixture acima recebe `vinculadas` pronto, então
   * quem garante que o banco não entrou nesse número é o FILTRO da consulta. Este teste lê o SQL que
   * o serviço monta e exige o recorte, para a regra não poder ser afrouxada sem quebrar nada.
   *
   * O DISCRIMINADOR É O FAROL, não a flag `is_banco`: das 6 admissões em banco da base, 1 chegou lá
   * pela regra automática (Auditoria ok, Exame apto e sem data de admissão) e não tem a marca do
   * usuário. Filtrar pela flag perderia essa.
   */
  it("a consulta exclui BANCO_AGUARDAR de quem consome vaga, e não exclui pausada", async () => {
    const ctx = montar({ vagas: [], status: [] });
    await ctx.service.analise(PROJETO, HOJE);

    const render = (expr: unknown) =>
      new PgDialect().sqlToQuery(expr as never).sql.replace(/\s+/g, " ");
    // A consulta de status por cargo é a que carrega `vinculadas` e `concluidas`.
    const selects = ctx.db.select.mock.calls
      .map((c) => c[0] as Record<string, unknown> | undefined)
      .filter((s): s is Record<string, unknown> => Boolean(s && "vinculadas" in s));
    expect(selects.length, "a consulta de status por cargo tem de existir").toBeGreaterThan(0);

    const vinculadas = render(selects[0].vinculadas);
    const concluidas = render(selects[0].concluidas);

    // Quem consome vaga exclui banco e os dois terminais.
    for (const fora of ["BANCO_AGUARDAR", "DECLINOU", "RESCISAO"]) {
      expect(vinculadas, `${fora} não pode consumir vaga`).toContain(fora);
      expect(concluidas, `${fora} não pode contar como concluída`).toContain(fora);
    }
    // PAUSADA NÃO É EXCLUÍDA: a vaga tem dono, só parado. Se alguém puser `pausada_em` no filtro de
    // quem consome, este teste quebra, que é o alarme desejado.
    expect(vinculadas, "pausada consome vaga").not.toContain("pausada_em");
  });

  it("PAUSADA tem balde próprio e não vira em andamento", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Atendente", vagas: 10 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          vinculadas: 10,
          concluidas: 0,
          cadastradas: 0,
          emAndamento: 6,
          pausadas: 4,
          emBanco: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.pausadas).toBe(4);
    expect(r.totais.emAndamento).toBe(6);
    /**
     * A PAUSADA MUDOU DE LADO EM "FALTAM", e este `expect` existe para que a mudança seja VISÍVEL e
     * não silenciosa. Pela conta antiga (`vagas - concluídas - em andamento`) ela caía no que falta
     * preencher, e o número era 4. Pela régua única (`vagas - na esteira`, decisão de 13/08/2026)
     * ela OCUPA a vaga, porque está na esteira, e o número é 0.
     *
     * As duas leituras são defensáveis: pausada não está andando, mas a vaga também não está livre
     * para outra pessoa. O balde próprio de "Pausadas" continua existindo e mostrando as 4, então a
     * informação não sumiu da tela, só deixou de ser contada como vaga a preencher.
     *
     * CONSEQUÊNCIA ESTRUTURAL: com pausada ou banco no projeto, "Em Andamento + Concluídas + Faltam"
     * deixa de fechar na meta (aqui dá 6, não 10), porque a pausada não está em nenhum dos dois
     * primeiros baldes. Quem fecha SEMPRE agora é "Na Esteira + Faltam = Vagas". Pendente de palavra
     * do diretor: hoje nenhum projeto real tem pausada ou banco vinculado, então nada disso aparece
     * em tela; se ele preferir a leitura antiga, a pausada precisa de tratamento explícito na régua.
     */
    expect(r.totais.faltam).toBe(0);
    expect(r.totais.vinculadas + r.totais.faltam).toBe(r.totais.vagas);
  });
});

/**
 * DECLÍNIO FORA DA MATEMÁTICA (decisão do diretor), e ainda no recorte cliente + período.
 *
 * O caso real da Bienal: 23 declínios do cliente no período, dos quais 22 NUNCA entraram em
 * `admissao_projeto`, porque quem declina não deixa nada ativo na esteira (§A.16). Contá-lo entre os
 * vinculados mostrava UM declínio, e somá-lo à meta faria a conta das vagas passar do total. Ele é
 * informação separada: a vaga que a pessoa declinou continua aberta e já está contada em "Faltam".
 */
describe("análise: declínio é informação separada, não entra na conta das vagas", () => {
  it("os 23 declínios do cliente aparecem no card sem mexer na meta", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 }],
      status: [
        { cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 40, concluidas: 10, cadastradas: 10, emAndamento: 30, pausadas: 0, emBanco: 0 },
      ],
      // Só 1 dos 23 declínios está vinculado ao projeto, como na base real.
      declinios: [{ cargoId: "c1", cargoNome: "Vendedor I", declinios: 23 }],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.declinios, "o card tem de contar os 23, não só o vinculado").toBe(23);
    // A meta não sente o declínio: nem soma nem subtrai, e a conta segue fechando.
    expect(r.totais.vagas).toBe(66);
    expect(r.totais.faltam).toBe(26);
    expect(r.totais.concluidas + r.totais.emAndamento + r.totais.faltam).toBe(r.totais.vagas);
  });

  /**
   * EM BANCO por cargo alimenta o card dividido e o modal (decisão do diretor). Vem do universo do
   * projeto, como todo o resto dos status, então o total é a soma das linhas.
   */
  it("EM BANCO é contado por cargo, para o card dividido e o modal", async () => {
    const ctx = montar({
      vagas: [
        { cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 },
        { cargoId: "c2", cargoNome: "Caixa", vagas: 15 },
      ],
      status: [
        { cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 5, concluidas: 0, cadastradas: 0, emAndamento: 5, pausadas: 0, emBanco: 4 },
        { cargoId: "c2", cargoNome: "Caixa", vinculadas: 3, concluidas: 0, cadastradas: 0, emAndamento: 3, pausadas: 0, emBanco: 1 },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.totais.emBanco).toBe(5);
    expect(r.porCargo.find((l) => l.cargoNome === "Vendedor I")?.emBanco).toBe(4);
    expect(r.porCargo.find((l) => l.cargoNome === "Caixa")?.emBanco).toBe(1);
  });

  /**
   * CADASTRADAS e CONCLUÍDAS são baldes diferentes: "concluída" exige a frente de INTEGRAÇÃO fechada.
   * O card de cadastradas saiu da tela por decisão do diretor, mas o número continua vindo, e igualar
   * os dois faria as concluídas do projeto discordarem do Gerenciador e do KPI do painel.
   */
  it("CADASTRADAS é balde próprio e não vira concluída", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Vendedor I",
          vinculadas: 40,
          concluidas: 0,
          cadastradas: 37,
          emAndamento: 40,
          pausadas: 0,
          emBanco: 0,
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
      status: [
        {
          cargoId: "c7",
          cargoNome: "Faxineiro(a)",
          vinculadas: 3,
          concluidas: 1,
          cadastradas: 1,
          emAndamento: 2,
          pausadas: 0,
          emBanco: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0]).toMatchObject({ cargoNome: "Faxineiro(a)", vagas: 0, vinculadas: 3 });
    // Sem meta não há percentual: zero é honesto, NaN vazaria como largura inválida no cilindro.
    expect(r.porCargo[0].percentual).toBe(0);
    // Sem meta, os três já estão "além da meta": a linha é erro de cadastro, e o negativo diz isso.
    expect(r.porCargo[0].faltam).toBe(-3);
  });

  it("cargo que só tem DECLÍNIO aparece, sem meta e sem gente ativa", async () => {
    const ctx = montar({ declinios: [{ cargoId: "c8", cargoNome: "Repositor", declinios: 4 }] });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0]).toMatchObject({ cargoNome: "Repositor", vagas: 0, vinculadas: 0, declinios: 4 });
    expect(r.totais.declinios).toBe(4);
  });

  it("admissão SEM cargo vira linha própria em vez de ser descartada", async () => {
    const ctx = montar({
      status: [
        {
          cargoId: null,
          cargoNome: null,
          vinculadas: 2,
          concluidas: 0,
          cadastradas: 0,
          emAndamento: 2,
          pausadas: 0,
          emBanco: 0,
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

describe('análise: "faltam" é o RESTO da meta', () => {
  /**
   * A MUDANÇA DE RÉGUA em uma asserção: antes, 57 vinculados sem nenhuma conclusão ainda "faltavam
   * 57", e o card somava 57 + 57 contra uma meta de 57. Quem já está andando ocupa a vaga, então o
   * que falta é zero, e o preenchimento (concluídas sobre a meta) continua em 0% dizendo que ninguém
   * fechou ainda. São duas perguntas diferentes, e agora cada uma responde a sua.
   */
  it("57 em andamento contra 57 vagas não falta ninguém, e o preenchimento segue em zero", async () => {
    const ctx = montar({
      vagas: [{ cargoId: "c1", cargoNome: "Atendente", vagas: 57 }],
      status: [
        {
          cargoId: "c1",
          cargoNome: "Atendente",
          vinculadas: 57,
          concluidas: 0,
          cadastradas: 0,
          emAndamento: 57,
          pausadas: 0,
          emBanco: 0,
        },
      ],
    });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0].faltam).toBe(0);
    expect(r.porCargo[0].percentual).toBe(0);
  });

  it("meta vazia ainda falta a meta inteira", async () => {
    const ctx = montar({ vagas: [{ cargoId: "c1", cargoNome: "Atendente", vagas: 57 }] });

    const r = await ctx.service.analise(PROJETO, HOJE);

    expect(r.porCargo[0].faltam).toBe(57);
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
