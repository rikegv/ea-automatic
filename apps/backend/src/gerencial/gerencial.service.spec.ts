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

/**
 * As consultas que leem ADMISSÕES, que são as que passam pelo `base()`/`condicoes()`. A Sala de
 * Espera é consulta PARALELA sobre outra tabela (`sala_espera`, alias `s`), então as regras de
 * recorte abaixo, que falam de colunas de `admissoes`, valem para este grupo e não para ela. A Sala
 * tem asserções próprias, no bloco do fim: o que ela sabe responder ela responde, o que não sabe ela
 * não finge.
 */
const dasAdmissoes = (c: string[]) => c.filter((q) => q.includes("from admissoes a"));
/**
 * As consultas de admissão MENOS a do próprio card, identificada pelo que ela projeta. Existe porque
 * "um card não filtra a si mesmo" (onda 5): a consulta dele deixa de aplicar o próprio campo de
 * propósito, e cobrá-la junto com as outras acusaria como falha o comportamento decidido.
 */
const dasAdmissoesFora = (c: string[], projecao: string) =>
  dasAdmissoes(c).filter((q) => !q.includes(projecao));
const daSala = (c: string[]) => c.filter((q) => q.includes("from sala_espera s"));

/**
 * COMO SE RECONHECE A CONSULTA DO CARD CLIENTE, depois da unificação por grupo (cenário 2).
 *
 * Ela projetava `a.cod_cliente as chave`, e passou a projetar um `case`: linha de grupo sai como
 * `GRUPO:<id>`, linha de cliente sai como o código puro, na MESMA tabela. O marcador mudou de lugar,
 * o comportamento testado não: o card continua sendo o único que não se filtra, e todas as outras
 * consultas continuam aplicando o cliente escolhido.
 */
const PROJECAO_CARD_CLIENTE = "'GRUPO:' || a.grupo_cliente_id";

describe("painel da diretoria: o recorte", () => {
  it("sem filtro, nenhuma consulta recorta nada", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    expect(dosKpis(consultas)).toContain("where true");
  });

  it("o filtro escolhido entra em TODAS as consultas (KPIs, tabelas e gráficos)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060" });
    expect(dasAdmissoes(consultas).length).toBeGreaterThanOrEqual(8);
    // Menos a consulta do próprio card de Cliente, que desde a onda 5 não se filtra: é o que deixa
    // as outras opções na tela para o Ctrl escolher a segunda.
    for (const q of dasAdmissoesFora(consultas, PROJECAO_CARD_CLIENTE)) {
      expect(q).toContain("a.cod_cliente =");
    }
    // A Sala honra o MESMO cliente, com a coluna dela: o recorte vale para o painel inteiro, ainda
    // que a consulta seja outra.
    for (const q of daSala(consultas)) expect(q).toContain("s.cod_cliente =");
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
    // Vale para as consultas de admissões, não só para os KPIs (menos a do próprio card de Farol).
    for (const q of dasAdmissoesFora(consultas, "a.farol_global::text as rotulo")) {
      expect(q).toContain("a.farol_global::text =");
    }
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

  /**
   * Db que devolve as quatro contagens do card. Necessário desde o ajuste do diretor: o card ficou
   * REATIVO, então linha zerada não aparece, e um db que devolve vazio devolve card vazio.
   */
  function comCadastro(a_cadastrar: number, cadastrado: number, aguardando: number, assinado: number) {
    const execute = vi.fn(async (sqlObj: unknown) => {
      const q = textoDo(sqlObj);
      if (q.includes("as a_cadastrar")) {
        return [{ a_cadastrar, cadastrado, aguardando, assinado }] as unknown[];
      }
      return [] as unknown[];
    });
    return { execute } as never;
  }

  it("devolve as linhas em ordem de CONTAGEM, maior primeiro", async () => {
    const r = await new GerencialService(comCadastro(3, 40, 7, 25)).painel({});
    expect(r.segmentos.contrato.map((l) => l.rotulo)).toEqual([
      "Cadastrado",
      "Assinado",
      "Aguardando Assinatura",
      "A Cadastrar",
    ]);
  });

  it("cada linha carrega a trilha na chave (o filtro depende disso)", async () => {
    const r = await new GerencialService(comCadastro(4, 3, 2, 1)).painel({});
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

/**
 * MULTI-SELEÇÃO (onda 5): com Ctrl, o usuário escolhe mais de uma condição no MESMO card, e o painel
 * recarrega com a seleção combinada.
 *
 * A regra que sustenta o painel inteiro: **OR DENTRO DO CAMPO, AND ENTRE CAMPOS**. Dois clientes é
 * "um ou o outro" (somam); um cliente com um cargo é "os dois ao mesmo tempo" (cruzam). Errar isso
 * não quebra a tela, o que é pior: dá número errado nas 8 consultas ao mesmo tempo e em silêncio,
 * porque todas herdam do mesmo `condicoes()`.
 *
 * Estes testes foram escritos ANTES do código (§A.26), e o terceiro bloco é o mais importante: com
 * UM valor só, o SQL tem de sair idêntico ao de hoje, porque é assim que 99% dos cliques do painel
 * continuam funcionando.
 */
describe("painel da diretoria: o grupo de cliente (cenário 2)", () => {
  it("o grupo entra em TODAS as consultas, MENOS na do card Cliente", async () => {
    // A tabela Cliente carrega as duas dimensões depois da unificação, então "nada filtra a si
    // mesmo" vale para ela nos dois sentidos: filtrar por grupo não pode deixá-la com uma linha só,
    // senão não haveria como trocar de grupo.
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ grupoClienteId: "g-1" });
    for (const q of dasAdmissoesFora(consultas, PROJECAO_CARD_CLIENTE)) {
      expect(q).toContain("a.grupo_cliente_id =");
    }
    const cardCliente = dasAdmissoes(consultas).find((q) => q.includes(PROJECAO_CARD_CLIENTE))!;
    expect(cardCliente).toBeDefined();
    expect(cardCliente).not.toContain("a.grupo_cliente_id =");
  });

  it("grupo e cliente CONVIVEM: o filtro de CNPJ individual não foi substituído", async () => {
    // Decisão do diretor, e é o ponto que mais importa nesta frente: o grupo é ADIÇÃO. Quem quiser
    // um CNPJ específico continua filtrando por cliente, e os dois recortes se somam.
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ grupoClienteId: "g-1", codCliente: "0060" });
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("a.grupo_cliente_id =");
    expect(kpis).toContain("a.cod_cliente =");
  });

  it("a tabela Cliente unifica: linha de grupo sai prefixada, linha de CNPJ sai crua", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const cardCliente = dasAdmissoes(consultas).find((q) => q.includes(PROJECAO_CARD_CLIENTE))!;
    // O `case` é o que faz a MESMA tabela responder pelas duas dimensões.
    expect(cardCliente).toContain("when a.grupo_cliente_id is not null");
    expect(cardCliente).toContain("else a.cod_cliente end as chave");
    // E o rótulo da linha de grupo é o NOME do grupo, não o código do CNPJ.
    expect(cardCliente).toContain("then gr.nome");
  });
});

describe("painel da diretoria: multi-seleção no mesmo card", () => {
  /** Quantas vezes uma coluna aparece na condição, que é como se enxerga o OR montado. */
  const vezes = (q: string, coluna: string): number => q.match(new RegExp(coluna.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0;

  const CAMPOS = [
    { nome: "cliente", filtro: { codCliente: "0060,0071" }, coluna: "a.cod_cliente =", projecao: PROJECAO_CARD_CLIENTE },
    { nome: "cargo", filtro: { cargoId: "cargo-1,cargo-2" }, coluna: "a.cargo_id =", projecao: "a.cargo_id::text as chave" },
    { nome: "exame", filtro: { exame: "APTO,AGENDADO" }, coluna: "fe.status =", projecao: "coalesce(cat.rotulo" },
    { nome: "auditoria", filtro: { auditoria: "ANALISE_OK,ANALISE_PENDENTE" }, coluna: "fa.status =", projecao: "coalesce(cata.rotulo" },
    { nome: "farol", filtro: { farol: "EM_ADMISSAO,DECLINOU" }, coluna: "a.farol_global::text =", projecao: "a.farol_global::text as rotulo" },
  ];

  for (const c of CAMPOS) {
    it(`${c.nome}: dois valores viram um OR entre parênteses, nas consultas que aplicam o campo`, async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel(c.filtro);
      const alcancadas = dasAdmissoesFora(consultas, c.projecao);
      expect(alcancadas.length).toBeGreaterThanOrEqual(6);
      for (const q of alcancadas) {
        expect(vezes(q, c.coluna)).toBe(2);
        expect(q).toContain("or");
        // Entre parênteses, senão o OR vazaria para fora e ligaria com o AND dos outros campos,
        // trazendo linha que o recorte não pediu.
        expect(q).toMatch(/\(\s*[a-z]+\.[a-z_:]+.*or.*\)/);
      }
    });

    it(`${c.nome}: UM valor só sai igual ao de hoje, sem OR`, async () => {
      const { db, consultas } = fakeDb();
      const [campo, valor] = Object.entries(c.filtro)[0] as [string, string];
      await new GerencialService(db).painel({ [campo]: valor.split(",")[0] });
      for (const q of dasAdmissoesFora(consultas, c.projecao)) expect(vezes(q, c.coluna)).toBe(1);
    });
  }

  it("AND entre campos: a multi-seleção de um card não afrouxa o recorte do outro", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({
      codCliente: "0060,0071",
      cargoId: "cargo-1",
      exame: "APTO,AGENDADO",
    });
    const kpis = dosKpis(consultas);
    expect(vezes(kpis, "a.cod_cliente =")).toBe(2);
    expect(vezes(kpis, "fe.status =")).toBe(2);
    expect(vezes(kpis, "a.cargo_id =")).toBe(1);
    // Três campos, três condições ligadas por and.
    expect(vezes(kpis, " and ")).toBeGreaterThanOrEqual(2);
  });

  it("espaço e vírgula sobrando não viram condição vazia (a tela monta a lista concatenando)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: " 0060 , ,0071, " });
    expect(vezes(dosKpis(consultas), "a.cod_cliente =")).toBe(2);
  });

  it("lista só de lixo não filtra nada, em vez de filtrar por vazio", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: " , , " });
    expect(dosKpis(consultas)).toContain("where true");
  });

  /**
   * O CARD CADASTRO É A EXCEÇÃO, e ela é do domínio, não do código: ele consolida DUAS TRILHAS
   * PARALELAS que vivem em colunas diferentes (a frente `CADASTRO_CONTRATO` e o `clicksign_status`
   * da admissão), e a mesma admissão pode estar nas duas ao mesmo tempo.
   *
   * Regra do diretor: OU dentro da trilha, E entre trilhas. Duas linhas de Cadastro somam, como em
   * qualquer card; uma de Cadastro com uma de Assinatura CRUZA, e responde "quem já cadastrei e
   * ainda não assinou". Somar as trilhas devolveria um número que quase não muda (todo assinado já
   * está cadastrado: 1.573 com ou sem a segunda escolha), ou seja, uma pergunta sem resposta.
   */
  describe("card Cadastro, as duas trilhas", () => {
    it("duas linhas da MESMA trilha somam (OR dentro da trilha)", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({ contrato: "CAD:A_CADASTRAR,CAD:CADASTRADO" });
      const kpis = dosKpis(consultas);
      expect(vezes(kpis, "fc.status =")).toBe(2);
      expect(kpis).toMatch(/\(\s*fc\.status = .*or.*fc\.status = .*\)/);
      expect(kpis).not.toContain("clicksign_status");
    });

    it("duas linhas de ASSINATURA também somam entre si", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({
        contrato: "ASS:AGUARDANDO_ASSINATURA,ASS:ASSINADO",
      });
      const kpis = dosKpis(consultas);
      expect(vezes(kpis, "a.clicksign_status::text =")).toBe(2);
      expect(kpis).not.toContain("fc.status =");
    });

    it("uma de cada trilha CRUZA: duas condições separadas, ligadas por and", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({ contrato: "CAD:CADASTRADO,ASS:ASSINADO" });
      const kpis = dosKpis(consultas);
      expect(vezes(kpis, "fc.status =")).toBe(1);
      expect(vezes(kpis, "a.clicksign_status::text =")).toBe(1);
      // O and é o que separa as trilhas; um OR aqui juntaria os dois conjuntos em vez de cruzá-los.
      expect(kpis).toMatch(/fc\.status = .* and .*clicksign_status/);
    });

    it("duas de uma trilha com uma da outra: soma dentro, cruza fora", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({
        contrato: "CAD:A_CADASTRAR,CAD:CADASTRADO,ASS:ASSINADO",
      });
      const kpis = dosKpis(consultas);
      expect(vezes(kpis, "fc.status =")).toBe(2);
      expect(vezes(kpis, "a.clicksign_status::text =")).toBe(1);
      expect(kpis).toMatch(/\(\s*fc\.status = .*or.*\).* and .*clicksign_status/);
    });

    it("UM valor só segue idêntico ao de hoje, em cada trilha", async () => {
      for (const [valor, coluna, ausente] of [
        ["CAD:CADASTRADO", "fc.status =", "clicksign_status"],
        ["ASS:ASSINADO", "a.clicksign_status::text =", "fc.status ="],
      ] as const) {
        const { db, consultas } = fakeDb();
        await new GerencialService(db).painel({ contrato: valor });
        expect(vezes(dosKpis(consultas), coluna)).toBe(1);
        expect(dosKpis(consultas)).not.toContain(ausente);
      }
    });

    it("valor sem trilha continua sem virar filtro, mesmo no meio de uma lista válida", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({ contrato: "CADASTRADO,CAD:CADASTRADO" });
      const kpis = dosKpis(consultas);
      expect(vezes(kpis, "fc.status =")).toBe(1);
    });
  });

  /**
   * UM CARD NÃO FILTRA A SI MESMO (decisão do diretor na onda 5), pela mesma razão que os dois
   * GRÁFICOS já não filtravam desde o começo: se o card encolhesse para a linha escolhida, não
   * sobraria onde clicar para escolher a segunda, e o Ctrl não teria como funcionar.
   *
   * A regra é cirúrgica: o card deixa de aplicar O PRÓPRIO campo e continua aplicando TODOS os
   * outros. Os KPIs e os gráficos seguem aplicando tudo, inclusive o campo do card, senão o número do
   * topo passaria a contar gente que o recorte excluiu.
   */
  describe("um card não filtra a si mesmo", () => {
    const CARDS = [
      { nome: "Cliente", acha: PROJECAO_CARD_CLIENTE, proprio: "a.cod_cliente =", filtro: { codCliente: "0060" } },
      { nome: "Farol", acha: "a.farol_global::text as rotulo", proprio: "a.farol_global::text =", filtro: { farol: "DECLINOU" } },
      { nome: "Auditoria", acha: "coalesce(cata.rotulo", proprio: "fa.status =", filtro: { auditoria: "ANALISE_OK" } },
      { nome: "Exame", acha: "coalesce(cat.rotulo", proprio: "fe.status =", filtro: { exame: "APTO" } },
      { nome: "Cargo", acha: "a.cargo_id::text as chave", proprio: "a.cargo_id =", filtro: { cargoId: "cargo-1" } },
      { nome: "Cadastro", acha: "as a_cadastrar", proprio: "fc.status =", filtro: { contrato: "CAD:CADASTRADO" } },
    ];

    for (const c of CARDS) {
      it(`${c.nome}: a consulta dele ignora o próprio campo`, async () => {
        // A comparação é contra a MESMA consulta SEM filtro, e não contra a ausência do texto: o card
        // de Cadastro projeta `fc.status = 'A_CADASTRAR'` na própria contagem, então procurar o
        // trecho acusaria uma condição que não existe.
        const sem = fakeDb();
        await new GerencialService(sem.db).painel({});
        const com = fakeDb();
        await new GerencialService(com.db).painel(c.filtro);
        const cardSem = sem.consultas.find((q) => q.includes(c.acha))!;
        const cardCom = com.consultas.find((q) => q.includes(c.acha))!;
        expect(cardCom).toBeDefined();
        expect(vezes(cardCom, c.proprio)).toBe(vezes(cardSem, c.proprio));
        // Mas os KPIs continuam aplicando, senão o número do topo mentiria.
        expect(vezes(dosKpis(com.consultas), c.proprio)).toBeGreaterThan(
          vezes(dosKpis(sem.consultas), c.proprio),
        );
      });

      it(`${c.nome}: e continua aplicando os filtros dos OUTROS campos`, async () => {
        const { db, consultas } = fakeDb();
        await new GerencialService(db).painel({ ...c.filtro, codCliente: "0060", cargoId: "cargo-9" });
        const doCard = consultas.find((q) => q.includes(c.acha))!;
        if (c.proprio !== "a.cod_cliente =") expect(doCard).toContain("a.cod_cliente =");
        if (c.proprio !== "a.cargo_id =") expect(doCard).toContain("a.cargo_id =");
      });
    }

    it("os gráficos seguem com a regra deles: não filtram o próprio eixo, filtram o resto", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({ dia: 12, mes: 3, codCliente: "0060" });
      expect(doGraficoDeDias(consultas)).not.toContain("extract(day from a.data_admissao) =");
      expect(doGraficoDeDias(consultas)).toContain("a.cod_cliente =");
      expect(doGraficoDeMeses(consultas)).not.toContain("extract(month from a.data_admissao) =");
    });

    it("o recorte da Sala continua zerando TODAS as consultas de admissão, inclusive as dos cards", async () => {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel({ sala: true });
      for (const q of dasAdmissoes(consultas)) expect(q).toContain("false");
    });
  });

  it("a multi-seleção NÃO vaza para as consultas da Sala, que têm coluna própria", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060,0071" });
    for (const q of daSala(consultas)) {
      expect(vezes(q, "s.cod_cliente =")).toBe(2);
      expect(q).not.toContain("a.cod_cliente");
    }
  });
});

/**
 * CARD AUDITORIA (onda 4), o único que precisou MEXER NO `base()` depois do painel validado.
 *
 * O risco desta onda não é o card, é o join: `base()` alimenta as 8 consultas, e um join que
 * multiplicasse linha inflaria TODOS os números de uma vez, calado. O que impede é o mesmo unique
 * `(admissao_id, tipo)` que já sustenta EXAME e CADASTRO, e o `LEFT`, que mantém na conta a admissão
 * sem frente de auditoria. Os testes abaixo travam a FORMA do join; a prova de que nenhum número
 * mudou foi feita comparando a resposta da API em três recortes, antes e depois (ver DIARIO).
 */
describe("painel da diretoria: card Auditoria", () => {
  it("o join é LEFT, por tipo e com apelido próprio (não multiplica linha nem perde admissão)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    for (const q of dasAdmissoes(consultas)) {
      expect(q).toContain("left join frentes_admissao fa on fa.admissao_id = a.id and fa.tipo = 'AUDITORIA'");
      expect(q).toContain(
        "left join frente_status_catalogo cata on cata.tipo = 'AUDITORIA' and cata.codigo = fa.status",
      );
    }
  });

  it("os joins que já existiam seguem intactos, com os mesmos apelidos", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("left join frentes_admissao fe on fe.admissao_id = a.id and fe.tipo = 'EXAME'");
    expect(kpis).toContain(
      "left join frentes_admissao fc on fc.admissao_id = a.id and fc.tipo = 'CADASTRO_CONTRATO'",
    );
    expect(kpis).toContain("left join clientes cl on cl.cod_cliente = a.cod_cliente");
    expect(kpis).toContain("left join cargos cg on cg.id = a.cargo_id");
  });

  it("SEM filtro de auditoria, o recorte segue vazio: o join novo não filtra sozinho", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    expect(dosKpis(consultas)).toContain("where true");
    expect(dosKpis(consultas)).not.toContain("fa.status =");
  });

  it("o card lê o status da frente e o rótulo do CATÁLOGO, ordenando por contagem", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const card = consultas.find((q) => q.includes("coalesce(cata.rotulo"))!;
    expect(card).toContain("fa.status as chave");
    expect(card).toContain("and fa.status is not null");
    expect(card).toContain("order by 3 desc");
  });

  it("clicar numa linha filtra pela frente de AUDITORIA, e alcança o painel inteiro", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ auditoria: "ANALISE_PENDENTE" });
    // Menos a consulta do próprio card, que não se filtra (onda 5).
    for (const q of dasAdmissoesFora(consultas, "coalesce(cata.rotulo")) expect(q).toContain("fa.status =");
    // E não se confunde com a frente de Exame, que tem apelido próprio.
    expect(dosKpis(consultas)).not.toContain("fe.status =");
  });

  it("COMBINA com os demais filtros, como qualquer outro card", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ auditoria: "AGUARDA_REENVIO", codCliente: "0060" });
    const kpis = dosKpis(consultas);
    expect(kpis).toContain("fa.status =");
    expect(kpis).toContain("a.cod_cliente =");
  });

  it("a Sala sai da conta quando o recorte é de auditoria, que ela não sabe responder", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ auditoria: "ANALISE_PENDENTE" });
    expect(daSala(consultas)).toHaveLength(0);
  });
});

/**
 * A SALA DE ESPERA NO PAINEL (onda 3). Três regras sustentam esta parte:
 *
 * 1. É CONSULTA PARALELA: lê `sala_espera`, nunca entra no `base()` (que parte de `admissoes`). O
 *    teste trava isso olhando o FROM de cada consulta.
 * 2. NÃO DOBRA CONTAGEM: registro da Sala já vinculado a uma admissão está contado do lado das
 *    admissões, então pendentes e declínios exigem `admissao_id is null`.
 * 3. NÃO FINGE O QUE NÃO SABE: a Sala não tem data de admissão, farol, contrato nem exame. Com um
 *    desses filtros ligado ela sai da conta, em vez de responder ignorando o recorte.
 */
describe("painel da diretoria: a Sala de Espera", () => {
  /** O db falso devolve linha vazia, então os números saem 0; aqui interessa o SQL e o formato. */
  function comContagens(pendentes: number, emAdmissao: number, declinios: number) {
    const consultas: string[] = [];
    const execute = vi.fn(async (sqlObj: unknown) => {
      const q = textoDo(sqlObj);
      consultas.push(q);
      if (q.includes("as pendentes")) {
        return [{ pendentes, em_admissao: emAdmissao, declinios }] as unknown[];
      }
      if (q.includes("as trabalhadas")) {
        return [
          {
            trabalhadas: 10,
            aguardando_liberacao: 0,
            em_admissao: 0,
            ativos: 0,
            declinios: 7,
          },
        ] as unknown[];
      }
      return [] as unknown[];
    });
    return { db: { execute } as never, consultas };
  }

  it("lê sala_espera em consulta PARALELA, sem passar pelo base() das admissões", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const sala = daSala(consultas);
    expect(sala.length).toBeGreaterThanOrEqual(1);
    // A prova de que não encostou no base(): nenhuma consulta da Sala junta `admissoes a`.
    for (const q of sala) expect(q).not.toContain("from admissoes a");
  });

  it("NÃO DOBRA CONTAGEM: pendentes e declínios exigem registro SEM admissão vinculada", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const q = daSala(consultas).find((c) => c.includes("as pendentes"))!;
    expect(q).toContain("st.encerra = false and s.admissao_id is null)::int as pendentes");
    expect(q).toContain("st.encerra = true and s.admissao_id is null)::int as declinios");
    // "Em admissão" é justamente o vinculado, e por isso NUNCA soma com o lado das admissões.
    expect(q).toContain("s.admissao_id is not null)::int as em_admissao");
  });

  it("o KPI conta só quem está AGUARDANDO: declinado e cancelado ficam fora dos pendentes", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    const q = daSala(consultas).find((c) => c.includes("as pendentes"))!;
    // `encerra` vem do CATÁLOGO: quem encerra (Declinou, Desistiu, Canceladas) não é pendência.
    expect(q).toContain("st.encerra = false");
    expect(q).toContain("join sala_espera_status st");
  });

  it("o sub-status é lido SEMPRE, e do CATÁLOGO: é ele que vira linha na tabela de Farol", async () => {
    const semFiltro = fakeDb();
    await new GerencialService(semFiltro.db).painel({});
    const sub = daSala(semFiltro.consultas).find((q) => q.includes("group by"))!;
    expect(sub).toBeDefined();
    // Rótulo do catálogo, não lista fixa no código: o diretor cria e renomeia status por tela.
    expect(sub).toContain("st.nome as rotulo");
    // Só a fila viva: encerrado e vinculado ficam de fora do desdobramento.
    expect(sub).toContain("st.encerra = false and s.admissao_id is null");
  });

  it("filtrando um cliente, as linhas da Sala mostram as contagens DAQUELE cliente", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060" });
    const sub = daSala(consultas).find((q) => q.includes("group by"))!;
    expect(sub).toContain("s.cod_cliente =");
  });

  it("com um FAROL de admissão filtrado, as linhas da Sala saem da tabela", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ farol: "ADMISSAO_CONCLUIDA" });
    // A tabela passa a falar de um farol da esteira, e quem aguarda na Sala não está nele.
    expect(daSala(consultas).some((q) => q.includes("group by"))).toBe(false);
  });

  it("a Sala honra cliente e cargo, que é o que ela tem", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060", cargoId: "cargo-1" });
    const q = daSala(consultas).find((c) => c.includes("as pendentes"))!;
    expect(q).toContain("s.cod_cliente =");
    expect(q).toContain("s.cargo_id =");
  });

  it("com filtro que a Sala NÃO sabe responder (exame, contrato, período), ela sai da conta", async () => {
    for (const filtro of [{ exame: "APTO" }, { contrato: "CAD:CADASTRADO" }, { de: "2026-01-01" }]) {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel(filtro);
      expect(daSala(consultas)).toHaveLength(0);
    }
  });

  it("CARD DE DECLÍNIOS consolidado: soma a parcela da Sala ao declínio das admissões", async () => {
    const { db } = comContagens(4, 2, 3);
    const r = await new GerencialService(db).painel({});
    // 7 das admissões + 3 da Sala, num número só, sem segmentar a origem na tela.
    expect(r.kpis.declinios).toBe(10);
    expect(r.sala).toMatchObject({ pendentes: 4, emAdmissao: 2, declinios: 3 });
  });

  it("filtrando o farol DECLINOU, a parcela da Sala CONTINUA somando", async () => {
    const { db } = comContagens(4, 2, 3);
    const r = await new GerencialService(db).painel({ farol: "DECLINOU" });
    expect(r.kpis.declinios).toBe(10);
  });

  it("filtrando por GRUPO, a Sala sai da conta inteira (ela não sabe responder por grupo)", async () => {
    // MEDIDO em produção antes da correção: filtrando o RAIA CAGC CORIFEU, o card de declínios
    // mostrava 67, sendo 35 do grupo e 32 da Sala INTEIRA, que não tem nada com aquele grupo. A Sala
    // não tem carimbo (quem está na fila ainda não tem admissão), então ela entra na mesma régua do
    // período e do exame: fica de fora, em vez de entrar ignorando o recorte.
    const { db, consultas } = comContagens(4, 2, 3);
    const r = await new GerencialService(db).painel({ grupoClienteId: "g-1" });
    expect(daSala(consultas)).toHaveLength(0);
    expect(r.kpis.declinios).toBe(7);
  });

  it("filtrando OUTRO farol, a parcela da Sala NÃO entra (o recorte pediu o contrário)", async () => {
    const { db } = comContagens(4, 2, 3);
    const r = await new GerencialService(db).painel({ farol: "ADMISSAO_CONCLUIDA" });
    expect(r.kpis.declinios).toBe(7);
  });
});

/**
 * A SALA NÃO CONTAMINA AS CONSULTAS DE ADMISSÕES, e este bloco é a trava disso.
 *
 * A primeira tentativa fazia o card da Sala filtrar as admissões por `cod_cliente in (quem tem gente
 * na Sala)`, e o painel respondia com as admissões CONCLUÍDAS daqueles clientes: dado verdadeiro,
 * resposta errada. A ponte entre as duas tabelas não existe, e inventá-la é o erro que estes testes
 * impedem de voltar (§A.26).
 */
describe("painel da diretoria: a Sala não contamina as consultas de admissões", () => {
  it("nenhuma consulta de admissões junta ou subconsulta a Sala, em nenhum recorte", async () => {
    for (const filtro of [
      {},
      { codCliente: "0060" },
      { cargoId: "cargo-1" },
      { salaStatus: "status-1" },
      { sala: true },
    ]) {
      const { db, consultas } = fakeDb();
      await new GerencialService(db).painel(filtro);
      for (const q of dasAdmissoes(consultas)) {
        expect(q).not.toContain("from sala_espera s");
        expect(q).not.toContain("a.cod_cliente in (");
      }
    }
  });

  it("sem filtro, o recorte das admissões continua vazio (`where true`)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({});
    expect(dosKpis(consultas)).toContain("where true");
  });
});

/**
 * O SUB-STATUS DA SALA CLICADO (linha da Sala dentro da tabela de Farol). O painel passa a responder
 * pela SALA: quem está naquele status, em qual cliente e em qual cargo. O lado das admissões sai
 * inteiro, porque quem está na fila da Sala ainda não tem admissão.
 */
describe("painel da diretoria: o sub-status da Sala clicado", () => {
  it("ZERA o lado das admissões em vez de puxar a esteira dos mesmos clientes", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ salaStatus: "status-1" });
    for (const q of dasAdmissoes(consultas)) expect(q).toContain("false");
  });

  it("recorta a Sala pelo status, e é ele que responde cliente e cargo", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ salaStatus: "status-1" });
    const daSalaAqui = daSala(consultas);
    for (const q of daSalaAqui) expect(q).toContain("s.status_id =");
    // Cliente e cargo passam a ser lidos da Sala, com o nome do catálogo de cada um.
    expect(daSalaAqui.some((q) => q.includes("s.cod_cliente as chave"))).toBe(true);
    expect(daSalaAqui.some((q) => q.includes("s.cargo_id::text as chave"))).toBe(true);
    // Sempre a fila viva: encerrado e já vinculado ficam fora das duas tabelas.
    for (const q of daSalaAqui.filter((c) => c.includes("as chave"))) {
      expect(q).toContain("st.encerra = false and s.admissao_id is null");
    }
  });

  it("COMBINA com o cliente filtrado: aquele status DENTRO daquele cliente", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ salaStatus: "status-1", codCliente: "0060" });
    for (const q of daSala(consultas)) {
      expect(q).toContain("s.cod_cliente =");
      expect(q).toContain("s.status_id =");
    }
  });

  it("DESLIGADO, o SQL das admissões sai idêntico ao de antes (§A.26)", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ codCliente: "0060" });
    for (const q of dasAdmissoes(consultas)) expect(q).not.toContain("false");
    // O card de Cliente não se filtra (onda 5); todas as outras aplicam o cliente escolhido.
    for (const q of dasAdmissoesFora(consultas, PROJECAO_CARD_CLIENTE)) {
      expect(q).toContain("a.cod_cliente =");
    }
    // E as tabelas de cliente e cargo voltam a ser as das admissões.
    expect(dasAdmissoes(consultas).some((q) => q.includes(PROJECAO_CARD_CLIENTE))).toBe(true);
    expect(dasAdmissoes(consultas).some((q) => q.includes("a.cargo_id::text as chave"))).toBe(true);
  });
});

/**
 * O CARD DA SALA CLICADO: o mesmo recorte da linha de sub-status, só que da fila inteira. O card e a
 * linha compartilham o mecanismo de propósito, senão passariam a divergir na primeira manutenção.
 */
describe("painel da diretoria: o card da Sala clicado", () => {
  it("recorta pela Sala INTEIRA e zera o lado das admissões", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ sala: true });
    for (const q of dasAdmissoes(consultas)) expect(q).toContain("false");
    // Sem escolher situação: o recorte não fixa status nenhum.
    for (const q of daSala(consultas)) expect(q).not.toContain("s.status_id =");
    // Cliente e cargo passam a ser lidos da Sala, como no recorte por sub-status.
    expect(daSala(consultas).some((q) => q.includes("s.cod_cliente as chave"))).toBe(true);
    expect(daSala(consultas).some((q) => q.includes("s.cargo_id::text as chave"))).toBe(true);
  });

  it("COMBINA com o cliente filtrado", async () => {
    const { db, consultas } = fakeDb();
    await new GerencialService(db).painel({ sala: true, codCliente: "0060" });
    for (const q of daSala(consultas)) expect(q).toContain("s.cod_cliente =");
  });
});

/**
 * O CARD CADASTRO REAGE AO RECORTE (ajuste do diretor). Ele sempre CONTOU pelo recorte; o que ficava
 * congelado era a apresentação, com as quatro linhas na tela mesmo zeradas, enquanto os demais cards
 * encolhiam para o que existe.
 */
describe("painel da diretoria: o card Cadastro reativo", () => {
  /** Fixa as quatro contagens da consulta do card, para valer a ordem e o que some. */
  function comCadastro(l: {
    a_cadastrar: number;
    cadastrado: number;
    aguardando: number;
    assinado: number;
  }) {
    const execute = vi.fn(async (sqlObj: unknown) => {
      const q = textoDo(sqlObj);
      if (q.includes("as a_cadastrar")) return [l] as unknown[];
      return [] as unknown[];
    });
    return { execute } as never;
  }

  it("linha sem dado no recorte SAI da tela", async () => {
    const db = comCadastro({ a_cadastrar: 0, cadastrado: 12, aguardando: 0, assinado: 5 });
    const r = await new GerencialService(db).painel({ farol: "ADMISSAO_CONCLUIDA" });
    expect(r.segmentos.contrato.map((c) => c.chave)).toEqual(["CAD:CADASTRADO", "ASS:ASSINADO"]);
  });

  it("ordena por contagem, maior primeiro", async () => {
    const db = comCadastro({ a_cadastrar: 3, cadastrado: 40, aguardando: 7, assinado: 25 });
    const r = await new GerencialService(db).painel({});
    expect(r.segmentos.contrato.map((c) => c.total)).toEqual([40, 25, 7, 3]);
  });

  it("no empate, mantém a ordem do processo", async () => {
    const db = comCadastro({ a_cadastrar: 5, cadastrado: 5, aguardando: 5, assinado: 9 });
    const r = await new GerencialService(db).painel({});
    expect(r.segmentos.contrato.map((c) => c.chave)).toEqual([
      "ASS:ASSINADO",
      "CAD:A_CADASTRAR",
      "CAD:CADASTRADO",
      "ASS:AGUARDANDO_ASSINATURA",
    ]);
  });

  it("recorte sem cadastro nenhum deixa o card vazio, como os outros", async () => {
    const db = comCadastro({ a_cadastrar: 0, cadastrado: 0, aguardando: 0, assinado: 0 });
    const r = await new GerencialService(db).painel({ salaStatus: "status-1" });
    expect(r.segmentos.contrato).toEqual([]);
  });
});
