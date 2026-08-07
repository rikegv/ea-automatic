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
const daSala = (c: string[]) => c.filter((q) => q.includes("from sala_espera s"));

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
    for (const q of dasAdmissoes(consultas)) expect(q).toContain("a.cod_cliente =");
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
    // Vale para todas as consultas de admissões, não só para os KPIs.
    for (const q of dasAdmissoes(consultas)) expect(q).toContain("a.farol_global::text =");
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
    for (const q of dasAdmissoes(consultas)) {
      expect(q).not.toContain("false");
      expect(q).toContain("a.cod_cliente =");
    }
    // E as tabelas de cliente e cargo voltam a ser as das admissões.
    expect(dasAdmissoes(consultas).some((q) => q.includes("a.cod_cliente as chave"))).toBe(true);
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
