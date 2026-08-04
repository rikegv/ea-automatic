import { describe, expect, it, vi } from "vitest";
import { GerencialService } from "./gerencial.service";

/**
 * PAINEL DA DIRETORIA. Trava as duas regras que sustentam o painel inteiro.
 *
 * 1. TUDO É FILTRO E TUDO SE RELACIONA: o recorte escolhido entra em TODAS as consultas, então KPIs,
 *    tabelas e gráficos falam sempre do mesmo conjunto. Filtros combinam entre si.
 * 2. UM GRÁFICO NÃO FILTRA A SI MESMO: clicar no dia 12 recorta os KPIs e as tabelas, mas o gráfico
 *    de dias continua mostrando os 31. Sem isto, a barra clicada viraria a única do gráfico e não
 *    haveria como trocar de dia sem limpar o filtro.
 *
 * O teste lê o SQL MONTADO (os pedaços de texto do template do drizzle), que é onde a regra vive.
 */

/** Junta os pedaços de texto de um SQL do drizzle, ignorando os parâmetros. */
function textoDo(sqlObj: unknown): string {
  const chunks = (sqlObj as { queryChunks?: unknown[] })?.queryChunks ?? [];
  const partes: string[] = [];
  const andar = (lista: unknown[]) => {
    for (const c of lista) {
      if (typeof c === "string") partes.push(c);
      else if (c && typeof c === "object") {
        const v = (c as { value?: unknown; queryChunks?: unknown[] }).queryChunks;
        if (Array.isArray(v)) andar(v);
        else if (Array.isArray((c as { value?: unknown[] }).value)) {
          partes.push(String((c as { value: unknown[] }).value.join("")));
        }
      }
    }
  };
  andar(chunks);
  return partes.join(" ").replace(/\s+/g, " ");
}

/** Fake do drizzle: não executa nada, só guarda o SQL de cada consulta. */
function fakeDb() {
  const consultas: string[] = [];
  const execute = vi.fn(async (sqlObj: unknown) => {
    consultas.push(textoDo(sqlObj));
    return [] as unknown[];
  });
  return { db: { execute } as never, consultas };
}

// Identifica cada consulta pelo APELIDO que ela projeta, não por um trecho de condição: a condição
// também aparece nas outras consultas quando o filtro está ativo, e o teste casaria com a errada.
const doGraficoDeDias = (c: string[]) => c.find((q) => q.includes("as dia,"))!;
const doGraficoDeMeses = (c: string[]) => c.find((q) => q.includes("as ano,"))!;
const dosKpis = (c: string[]) => c.find((q) => q.includes("as trabalhadas"))!;

describe("painel da diretoria: o recorte", () => {
  it("sem filtro, nenhuma consulta recorta nada", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    expect(dosKpis(consultas)).toContain("where true");
  });

  it("o filtro escolhido entra em TODAS as consultas (KPIs, tabelas e gráficos)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060" });
    expect(consultas.length).toBeGreaterThanOrEqual(8);
    for (const q of consultas) expect(q).toContain("a.cod_cliente =");
  });

  it("filtros COMBINAM entre si (cliente + farol + mês)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060", farol: "DECLINOU", mes: 3, ano: 2026 });
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("a.cod_cliente =");
    expect(kpis).toContain("a.farol_global::text =");
    expect(kpis).toContain("extract(month from a.data_admissao) =");
    expect(kpis).toContain("extract(year from a.data_admissao) =");
  });

  it("o gráfico de DIAS não se auto-filtra, mas os KPIs sim", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ dia: 12 });
    expect(dosKpis(consultas)).toContain("extract(day from a.data_admissao) =");
    // A série de dias agrupa por dia; o recorte por dia NÃO pode estar no `where` dela.
    const serie = doGraficoDeDias(consultas);
    expect(serie).toContain("group by");
    expect(serie).not.toContain("extract(day from a.data_admissao) =");
  });

  it("o gráfico de MESES não se auto-filtra, mas os KPIs sim", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ mes: 3, ano: 2026 });
    expect(dosKpis(consultas)).toContain("extract(month from a.data_admissao) =");
    expect(doGraficoDeMeses(consultas)).not.toContain("extract(month from a.data_admissao) =");
  });

  it("um filtro NÃO vaza para o outro gráfico: dia recorta a série de meses", async () => {
    // O dia não é o eixo do gráfico de meses, então ali ele vale normalmente.
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ dia: 12 });
    expect(doGraficoDeMeses(consultas)).toContain("extract(day from a.data_admissao) =");
  });

  /**
   * O CARD DE KPI COMO FILTRO (ajuste 4). Três dos cinco cards contam um CONJUNTO de faróis, e o card
   * tem de filtrar exatamente o que conta: se "Em Admissão" soma EM_ADMISSAO + BANCO_AGUARDAR e o
   * filtro levasse só um deles, o número do card e o do painel filtrado se contradiriam.
   */
  it("o farol aceita LISTA e vira um OR de igualdades (card de KPI que conta mais de um farol)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ farol: "EM_ADMISSAO,BANCO_AGUARDAR" });
    const kpis = dosKpis(consultas);
    expect(kpis.match(/a\.farol_global::text =/g)).toHaveLength(2);
    expect(kpis).toContain("or");
    // Vale para o painel inteiro, não só para os KPIs.
    for (const q of consultas) expect(q).toContain("a.farol_global::text =");
  });

  it("farol com um valor só segue como igualdade simples (clique na linha da tabela)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ farol: "DECLINOU" });
    expect(dosKpis(consultas).match(/a\.farol_global::text =/g)).toHaveLength(1);
  });

  /**
   * O KPI "AGUARDANDO LIBERAÇÃO" CONTA SÓ QUEM AGUARDA. `LIBERACAO_RECUSADA` é desfecho encerrado:
   * somá-la mostrava no painel pré-admissões "a liberar" que já tinham sido tratadas. A recusa
   * continua no acervo e na tabela de Farol, que agrupa o farol cru e não filtra status nenhum.
   */
  it("o KPI de aguardando liberação NÃO soma as recusadas", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("a.farol_global = 'AGUARDANDO_LIBERACAO'");
    expect(kpis).not.toContain("LIBERACAO_RECUSADA");
  });

  it("a tabela de Farol continua mostrando a recusa (agrupa o farol cru, sem excluir status)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const segFarol = consultas.find((q) => q.includes("as chave, a.farol_global::text as rotulo"))!;
    expect(segFarol).toContain("group by");
    expect(segFarol).not.toContain("LIBERACAO_RECUSADA");
  });

  it("período entra como intervalo de data_admissao (a data do negócio, não a da carga)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ de: "2026-01-01", ate: "2026-01-31" });
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("a.data_admissao >=");
    expect(kpis).toContain("a.data_admissao <=");
    expect(kpis).not.toContain("criado_em");
  });
});

/**
 * CARD CONTRATO POR STATUS (decisão do diretor). Antes o card quebrava por TIPO de contrato
 * (temporário, terceiro); agora mostra em que ponto do contrato a admissão está.
 *
 * O card consolida DUAS TRILHAS PARALELAS que vivem em lugares diferentes: o Cadastro é frente
 * (`frentes_admissao`), a Assinatura NÃO é frente (`admissoes.clicksign_status`, INT-4). É por isso
 * que a chave de cada linha carrega o prefixo da trilha: sem ele, "CADASTRADO" e "ASSINADO" seriam
 * ambíguos na hora de montar o filtro.
 */
describe("painel da diretoria: card Contrato por status", () => {
  it("o tipo de contrato saiu do recorte de vez", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    for (const q of consultas) expect(q).not.toContain("a.tipo_contrato");
  });

  it("devolve as 4 linhas em ordem de PROCESSO, não por contagem", async () => {
    const { db } = fakeDb();
    const r = await new GerencialService(db).painel({});
    expect(r.segmentos.contrato.map((l) => l.rotulo)).toEqual([
      "A Cadastrar",
      "Cadastrado",
      "Aguardando Assinatura",
      "Assinado",
    ]);
  });

  it("cada linha carrega a trilha na chave (o filtro depende disso)", async () => {
    const { db } = fakeDb();
    const r = await new GerencialService(db).painel({});
    expect(r.segmentos.contrato.map((l) => l.chave)).toEqual([
      "CAD:A_CADASTRAR",
      "CAD:CADASTRADO",
      "ASS:AGUARDANDO_ASSINATURA",
      "ASS:ASSINADO",
    ]);
  });

  it("o card lê as duas fontes: a frente de Cadastro e o estado do envelope", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const card = consultas.find((q) => q.includes("as a_cadastrar"))!;
    expect(card).toContain("fc.status = 'A_CADASTRAR'");
    expect(card).toContain("a.clicksign_status::text = 'ASSINADO'");
  });

  it("clicar numa linha de CADASTRO filtra pela frente, e o filtro alcança TODO o painel", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ contrato: "CAD:A_CADASTRAR" });
    for (const q of consultas) expect(q).toContain("fc.status =");
    expect(dosKpis(consultas)).not.toContain("clicksign_status::text = $");
  });

  it("clicar numa linha de ASSINATURA filtra pelo envelope, não pela frente", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ contrato: "ASS:ASSINADO" });
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("a.clicksign_status::text =");
    expect(kpis).not.toContain("fc.status =");
  });

  it("valor sem trilha não vira filtro (não deixa passar recorte malformado)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ contrato: "CADASTRADO" });
    expect(dosKpis(consultas)).toContain("where true");
  });

  it("o join da frente de Cadastro é LEFT e por tipo, para não multiplicar linha nem perder admissão", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    expect(dosKpis(consultas)).toContain(
      "left join frentes_admissao fc on fc.admissao_id = a.id and fc.tipo = 'CADASTRO_CONTRATO'",
    );
  });
});
