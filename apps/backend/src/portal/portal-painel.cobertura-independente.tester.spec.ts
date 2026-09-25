import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { farolGlobalEnum } from "../db/schema/enums";
import {
  contarPainel,
  estadoDoLinkNoPainel,
  PAGINA_MAXIMA_INDICE_PAINEL,
  PAGINA_MAXIMA_PAINEL,
  recorteDaPagina,
  type FatoDaAdmissaoNoPainel,
} from "../domain/portal-painel";
import { FAROIS_FORA_DO_PAINEL, PortalPainelService } from "./portal-painel.service";

/**
 * COBERTURA INDEPENDENTE (§A.38) DO GERENCIADOR DO PORTAL.
 *
 * Este arquivo NÃO foi escrito por quem escreveu o serviço, e ele testa contra o REQUISITO do
 * diretor, não contra o código: "não é só emitir link, é um painel de acompanhamento. Contadores:
 * quantos ENCAMINHADOS, quantos ACESSARAM, quantos CONCLUÍRAM, quantos precisam de INTERVENÇÃO
 * HUMANA, quantos NÃO ACESSARAM. E o status de cada um naquele momento".
 *
 * O que ele ataca, e que o arquivo do autor não fecha:
 *  1. A ADMISSÃO COM VÁRIOS LINKS. O autor prova UM caso de reemissão; aqui se prova que a pessoa
 *     não é CONTADA DUAS VEZES (nem no funil, nem no total, nem na lista) e que o acesso antigo não
 *     é apagado, inclusive com três links e com outras admissões no mesmo recorte.
 *  2. O RECORTE DE FAROL pelos dois lados: quem está fora está fora, e NENHUM FAROL VIVO caiu na
 *     lista de exclusão por engano. Com CANÁRIO sobre o enum, para farol novo obrigar uma decisão.
 *  3. INTERVENÇÃO HUMANA ORTOGONAL, provada por DIFERENÇA (ligar `noTime` não move os outros
 *     quatro), e não só pelo caso "caiu e concluiu".
 *  4. A SOMA `encaminhados = acessaram + naoAcessaram`, sobre 300 recortes gerados, e não sobre
 *     um exemplo.
 *  5. M1 e L1 por OUTRO CAMINHO (é para isso que esta rodada existe): régua ausente do mapa,
 *     sobre-entrega, página gigante chegando ao `OFFSET` que o serviço manda ao banco.
 *
 * §A.6: tudo aqui é id técnico, contagem e carimbo. Nenhum CPF, nenhum nome real.
 */

const DIR = __dirname;
const CODIGO_SERVICO = semComentarios(readFileSync(join(DIR, "portal-painel.service.ts"), "utf8"));
const CODIGO_ESTEIRA = readFileSync(join(DIR, "..", "esteira", "esteira.service.ts"), "utf8");
const FONTE_CONTRATO = readFileSync(
  join(DIR, "..", "..", "..", "..", "packages", "shared-types", "src", "index.ts"),
  "utf8",
);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// O BANCO DE MENTIRINHA DESTE ARQUIVO, E ELE É DIFERENTE DO DO AUTOR DE PROPÓSITO
//
// O do autor ignora `.limit()` e `.offset()`, então a paginação do SERVIÇO (não a da função pura)
// fica sem prova: o achado L1 foi fechado no domínio e nunca foi seguido até o número que o
// serviço entrega ao driver. Este aqui REGISTRA limite e deslocamento, aplica os dois, e aplica
// também o recorte de farol, que é o que permite provar que o declínio não entra em contador
// nenhum nem na lista.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const HOJE = Date.now();
const rel = (ms: number) => new Date(HOJE + ms);

interface LinkFake {
  admissaoId: string;
  criadoEm: Date;
  expiraEm: Date;
  revogadoEm?: Date | null;
  suspensoAte?: Date | null;
  primeiroAcessoEm?: Date | null;
  ultimoAcessoEm?: Date | null;
}

interface DadosFake {
  links: LinkFake[];
  /** Farol por admissão. Ausente = `EM_ADMISSAO` (viva). */
  farol?: Record<string, string>;
  noTime?: string[];
}

/** O que o serviço mandou ao driver, para as asserções de paginação. */
interface Espiao {
  limites: number[];
  deslocamentos: number[];
}

function banco(dados: DadosFake, espiao: Espiao = { limites: [], deslocamentos: [] }) {
  const farolDe = (id: string) => dados.farol?.[id] ?? "EM_ADMISSAO";
  const vivos = dados.links.filter(
    (l) => !(FAROIS_FORA_DO_PAINEL as readonly string[]).includes(farolDe(l.admissaoId)),
  );
  const admissoesComLink = [...new Set(vivos.map((l) => l.admissaoId))];

  const resolver = (projecao: Record<string, unknown>, estado: Espiao): unknown[] => {
    const tem = (c: string) => Object.keys(projecao).includes(c);

    if (tem("total")) return [{ total: admissoesComLink.length }];
    if (tem("acessou")) {
      return admissoesComLink.map((admissaoId) => ({
        admissaoId,
        acessou: vivos.some((l) => l.admissaoId === admissaoId && l.primeiroAcessoEm != null),
      }));
    }
    if (tem("encaminhadoEm")) {
      const linhas = admissoesComLink
        .map((admissaoId) => {
          const meus = vivos.filter((l) => l.admissaoId === admissaoId);
          const acessos = meus.map((l) => l.ultimoAcessoEm).filter((d): d is Date => d != null);
          return {
            admissaoId,
            ultimoAcessoEm: acessos.length
              ? new Date(Math.max(...acessos.map((d) => d.getTime())))
              : null,
            encaminhadoEm: new Date(Math.max(...meus.map((l) => l.criadoEm.getTime()))),
          };
        })
        .sort((a, b) => b.encaminhadoEm.getTime() - a.encaminhadoEm.getTime());
      const inicio = estado.deslocamentos.at(-1) ?? 0;
      const limite = estado.limites.at(-1) ?? linhas.length;
      return linhas.slice(inicio, inicio + limite);
    }
    if (tem("nome")) {
      return admissoesComLink.map((admissaoId) => ({
        admissaoId,
        nome: `Sintético ${admissaoId}`,
        cargo: "Auxiliar",
        cliente: "Operação 1",
      }));
    }
    if (tem("expiraEm")) return vivos;
    if (tem("admissaoId")) {
      return (dados.noTime ?? [])
        .filter((id) => admissoesComLink.includes(id))
        .map((admissaoId) => ({ admissaoId }));
    }
    return [];
  };

  const cadeia = (projecao: Record<string, unknown>): unknown => {
    const local: Espiao = { limites: [], deslocamentos: [] };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(projecao, local)).then(ok, erro);
          }
          if (prop === "limit") {
            return (n: number) => {
              local.limites.push(n);
              espiao.limites.push(n);
              return proxy;
            };
          }
          if (prop === "offset") {
            return (n: number) => {
              local.deslocamentos.push(n);
              espiao.deslocamentos.push(n);
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };

  return {
    select: (p: Record<string, unknown> = {}) => cadeia(p),
    selectDistinct: (p: Record<string, unknown> = {}) => cadeia(p),
  } as never;
}

/** A régua é do `ReguaCompletudeService` (§A.19); o painel só consome. Padrão: 10 obrigatórios. */
function regua(dados: {
  progresso?: Record<string, { entregues: number; total: number }>;
  proximo?: Record<string, string | null>;
  /** Quando `true`, o mapa NÃO traz a chave: é o caminho do `?? { entregues: 0, total: 0 }`. */
  mapaVazio?: boolean;
}) {
  return {
    progressoObrigatoriosMap: async (ids: string[]) =>
      dados.mapaVazio
        ? new Map()
        : new Map(ids.map((id) => [id, dados.progresso?.[id] ?? { entregues: 0, total: 10 }])),
    proximoObrigatorioPendenteMap: async (ids: string[]) =>
      new Map(ids.map((id) => [id, dados.proximo?.[id] ?? null])),
  } as never;
}

const servico = (dados: DadosFake, r = regua({}), espiao?: Espiao) =>
  new PortalPainelService(banco(dados, espiao), r);

const fato = (f: Partial<FatoDaAdmissaoNoPainel> = {}): FatoDaAdmissaoNoPainel => ({
  acessou: false,
  obrigatorios: 10,
  obrigatoriosPendentes: 0,
  noTime: false,
  ...f,
});

// ══ 1. A ADMISSÃO COM MAIS DE UM LINK ════════════════════════════════════════════════════════

/**
 * O CENÁRIO REAL: o consultor reemite porque "o candidato não recebeu". Cada reemissão cria LINHA
 * NOVA. Se os contadores olhassem linha de link em vez de admissão, a mesma pessoa apareceria três
 * vezes em ENCAMINHADOS, duas em NÃO ACESSARAM (os links novos, sem carimbo) e o funil mentiria
 * para cima justamente em quem deu mais trabalho.
 */
describe("reemissão: três links, UMA pessoa", () => {
  const tresLinks: LinkFake[] = [
    {
      admissaoId: "adm-reemitida",
      criadoEm: rel(-300_000),
      expiraEm: rel(-200_000),
      revogadoEm: rel(-200_000),
      primeiroAcessoEm: rel(-250_000),
      ultimoAcessoEm: rel(-240_000),
    },
    {
      admissaoId: "adm-reemitida",
      criadoEm: rel(-200_000),
      expiraEm: rel(-100_000),
      revogadoEm: rel(-100_000),
    },
    { admissaoId: "adm-reemitida", criadoEm: rel(-1_000), expiraEm: rel(3_600_000) },
  ];

  it("o funil conta a pessoa UMA vez, e o acesso do link morto continua valendo", async () => {
    const r = await servico({ links: tresLinks }).resumo();
    expect(r.encaminhados).toBe(1);
    expect(r.acessaram).toBe(1);
    expect(r.naoAcessaram).toBe(0);
    expect(r.acessaram + r.naoAcessaram).toBe(r.encaminhados);
  });

  it("a LISTA devolve uma linha só, com o último acesso de QUALQUER link e o estado do vigente", async () => {
    const pagina = await servico({ links: tresLinks }).listar({});
    expect(pagina.total).toBe(1);
    expect(pagina.itens).toHaveLength(1);
    expect(pagina.itens[0].admissaoId).toBe("adm-reemitida");
    // O carimbo veio do PRIMEIRO link, que já está revogado. Ler só o vigente devolveria `null`.
    expect(pagina.itens[0].ultimoAcessoEm).toBe(rel(-240_000).toISOString());
    // E o estado é o do link NOVO, que é o que o consultor pode usar agora.
    expect(pagina.itens[0].estadoLink).toBe("VIVO");
  });

  /**
   * A MESMA CONTA COM VIZINHOS: uma admissão de três links e duas de um link. Se a agregação
   * escapasse, ENCAMINHADOS iria a 5 e o total da lista divergiria do card.
   */
  it("com outras admissões no recorte, o funil e o total da lista continuam concordando", async () => {
    const dados: DadosFake = {
      links: [
        ...tresLinks,
        { admissaoId: "adm-b", criadoEm: rel(-50_000), expiraEm: rel(3_600_000) },
        {
          admissaoId: "adm-c",
          criadoEm: rel(-40_000),
          expiraEm: rel(3_600_000),
          primeiroAcessoEm: rel(-30_000),
          ultimoAcessoEm: rel(-30_000),
        },
      ],
    };
    const r = await servico(dados).resumo();
    const pagina = await servico(dados).listar({});
    expect(r.encaminhados).toBe(3);
    expect(r.acessaram).toBe(2);
    expect(r.naoAcessaram).toBe(1);
    expect(pagina.total).toBe(r.encaminhados);
    expect(pagina.itens).toHaveLength(3);
    expect(new Set(pagina.itens.map((i) => i.admissaoId)).size).toBe(3);
  });

  /**
   * O FUNIL E A TABELA TÊM DE CONTAR A MESMA GENTE. O card lê `primeiro_acesso_em` (`bool_or`) e a
   * linha lê `max(ultimo_acesso_em)`: são COLUNAS DIFERENTES para a mesma pergunta, e o operador vê
   * as duas na mesma tela. Esta é a asserção que pega o dia em que uma delas mudar sozinha.
   */
  it("ACESSARAM do card = linhas com último acesso não nulo na tabela", async () => {
    const dados: DadosFake = {
      links: [
        ...tresLinks,
        { admissaoId: "adm-b", criadoEm: rel(-50_000), expiraEm: rel(3_600_000) },
        {
          admissaoId: "adm-c",
          criadoEm: rel(-40_000),
          expiraEm: rel(3_600_000),
          primeiroAcessoEm: rel(-30_000),
          ultimoAcessoEm: rel(-30_000),
        },
      ],
    };
    const r = await servico(dados).resumo();
    const itens = (await servico(dados).listar({})).itens;
    expect(itens.filter((i) => i.ultimoAcessoEm !== null)).toHaveLength(r.acessaram);
    expect(itens.filter((i) => i.ultimoAcessoEm === null)).toHaveLength(r.naoAcessaram);
  });

  /**
   * A AGREGAÇÃO É DO BANCO, e o banco de mentirinha não prova isso: ele agrega por conta própria.
   * Sem estas asserções de texto, trocar `count(distinct` por `count(`, ou tirar o `groupBy`,
   * passaria verde em todo teste de serviço deste repositório e só apareceria com dois links na
   * produção. É aqui que a reemissão fica travada de verdade.
   */
  it("a régua da agregação está na CONSULTA: distinct, group by, bool_or e max", () => {
    expect(CODIGO_SERVICO).toMatch(/count\(distinct \$\{portalLinks\.admissaoId\}\)/);
    expect((CODIGO_SERVICO.match(/\.groupBy\(portalLinks\.admissaoId\)/g) ?? []).length).toBe(2);
    expect(CODIGO_SERVICO).toMatch(/bool_or\(\$\{portalLinks\.primeiroAcessoEm\} is not null\)/);
    expect(CODIGO_SERVICO).toMatch(/max\(\$\{portalLinks\.ultimoAcessoEm\}\)/);
    expect(CODIGO_SERVICO).toMatch(/max\(\$\{portalLinks\.criadoEm\}\)/);
  });
});

// ══ 2. O RECORTE DE FAROL, PELOS DOIS LADOS ══════════════════════════════════════════════════

describe("§A.16: o recorte de farol, pelos dois lados", () => {
  const VIVOS = ["EM_ADMISSAO", "BANCO_AGUARDAR", "ADMISSAO_CONCLUIDA"] as const;

  it("toda exclusão é um farol que EXISTE no enum (erro de digitação não exclui ninguém)", () => {
    for (const farol of FAROIS_FORA_DO_PAINEL) {
      expect(farolGlobalEnum.enumValues as readonly string[]).toContain(farol);
    }
  });

  /**
   * O LADO QUE NINGUÉM TESTA: o falso positivo da exclusão. Tirar um farol VIVO da lista some com
   * gente da fila de trabalho sem erro nenhum, e o painel encolhe em silêncio, que é o modo de
   * falha mais caro desta tela (o candidato fica sem cobrança e ninguém percebe).
   */
  it.each(VIVOS)("`%s` NÃO pode estar na exclusão: é admissão viva", (farol) => {
    expect(FAROIS_FORA_DO_PAINEL as readonly string[]).not.toContain(farol);
  });

  /**
   * CANÁRIO. Farol novo no enum cai aqui, e a pessoa é obrigada a decidir se ele entra no painel.
   * Sem isso, um farol futuro (terminal, digamos) entra na fila por omissão.
   */
  it("o enum é o conhecido: farol novo obriga uma decisão sobre o painel", () => {
    expect([...farolGlobalEnum.enumValues].sort()).toEqual([
      "ADMISSAO_CONCLUIDA",
      "AGUARDANDO_LIBERACAO",
      "BANCO_AGUARDAR",
      "DECLINOU",
      "EM_ADMISSAO",
      "LIBERACAO_RECUSADA",
      "RESCISAO",
    ]);
  });

  it("a exclusão do painel é a MESMA da Esteira, como o comentário afirma", () => {
    for (const farol of FAROIS_FORA_DO_PAINEL) {
      expect(CODIGO_ESTEIRA).toContain(`"${farol}"`);
    }
  });

  /**
   * O FILTRO EM CADA UMA DAS TRÊS CONSULTAS, e não três vezes em uma. O autor conta ocorrências
   * (`toBe(3)`), o que passa igual se as três estiverem no mesmo `where`. Aqui cada consulta é
   * localizada pela sua PROJEÇÃO e o filtro é exigido dentro dela.
   */
  it.each([
    ["o recorte do funil", "acessou: sql<boolean>"],
    ["o total da lista", "total: sql<number>"],
    ["a página", "encaminhadoEm: sql<Date>"],
  ])("%s aplica o filtro de farol", (_nome, ancora) => {
    const inicio = CODIGO_SERVICO.indexOf(ancora);
    expect(inicio).toBeGreaterThan(0);
    expect(CODIGO_SERVICO.slice(inicio, inicio + 700)).toContain(
      "notInArray(admissoes.farolGlobal",
    );
  });

  it.each([...FAROIS_FORA_DO_PAINEL])(
    "admissão em `%s` com link emitido não conta e não aparece",
    async (farol) => {
      const dados: DadosFake = {
        links: [
          {
            admissaoId: "adm-fora",
            criadoEm: rel(-10_000),
            expiraEm: rel(3_600_000),
            primeiroAcessoEm: rel(-5_000),
            ultimoAcessoEm: rel(-5_000),
          },
          { admissaoId: "adm-viva", criadoEm: rel(-9_000), expiraEm: rel(3_600_000) },
        ],
        farol: { "adm-fora": farol },
        noTime: ["adm-fora"],
      };
      const r = await servico(dados).resumo();
      expect(r).toEqual({
        encaminhados: 1,
        acessaram: 0,
        naoAcessaram: 1,
        concluiram: 0,
        intervencaoHumana: 0,
      });
      const pagina = await servico(dados).listar({});
      expect(pagina.total).toBe(1);
      expect(pagina.itens.map((i) => i.admissaoId)).toEqual(["adm-viva"]);
    },
  );

  /**
   * O CONTRÁRIO, que é o que prova que o recorte não come gente: as três admissões vivas ficam,
   * inclusive a que já foi admitida e a que está no banco.
   */
  it.each(VIVOS)("admissão em `%s` PERMANECE no painel", async (farol) => {
    const dados: DadosFake = {
      links: [{ admissaoId: "adm-viva", criadoEm: rel(-1_000), expiraEm: rel(3_600_000) }],
      farol: { "adm-viva": farol },
    };
    expect((await servico(dados).resumo()).encaminhados).toBe(1);
    expect((await servico(dados).listar({})).itens).toHaveLength(1);
  });
});

// ══ 3. INTERVENÇÃO HUMANA É ORTOGONAL ════════════════════════════════════════════════════════

/**
 * ORTOGONAL quer dizer: ligar `noTime` não move NENHUM dos outros quatro. O autor prova o caso
 * "caiu e concluiu"; isso é um exemplo, não a ortogonalidade. Aqui a prova é por DIFERENÇA, sobre
 * as oito combinações de (acessou × concluiu × noTime).
 */
describe("INTERVENÇÃO HUMANA é ortogonal aos outros quatro", () => {
  const combinacoes = [
    { acessou: false, obrigatoriosPendentes: 3 },
    { acessou: false, obrigatoriosPendentes: 0 },
    { acessou: true, obrigatoriosPendentes: 3 },
    { acessou: true, obrigatoriosPendentes: 0 },
    { acessou: true, obrigatorios: 0, obrigatoriosPendentes: 0 },
  ];

  it.each(combinacoes.map((c, i) => [i, c] as const))(
    "combinação %i: ligar `noTime` não muda encaminhados, acessaram, naoAcessaram nem concluiram",
    (_i, c) => {
      const sem = contarPainel([fato({ ...c, noTime: false })]);
      const com = contarPainel([fato({ ...c, noTime: true })]);
      expect({ ...com, intervencaoHumana: 0 }).toEqual({ ...sem, intervencaoHumana: 0 });
      expect(sem.intervencaoHumana).toBe(0);
      expect(com.intervencaoHumana).toBe(1);
    },
  );

  it("quem caiu para o time e NUNCA acessou conta em intervenção E em não acessaram", () => {
    const c = contarPainel([fato({ acessou: false, obrigatoriosPendentes: 4, noTime: true })]);
    expect(c.intervencaoHumana).toBe(1);
    expect(c.naoAcessaram).toBe(1);
    expect(c.acessaram).toBe(0);
    expect(c.concluiram).toBe(0);
  });

  it("intervenção pode chegar a 100% do recorte sem quebrar a soma dos outros", () => {
    const c = contarPainel([
      fato({ acessou: true, noTime: true }),
      fato({ acessou: false, noTime: true }),
    ]);
    expect(c.intervencaoHumana).toBe(2);
    expect(c.encaminhados).toBe(2);
    expect(c.acessaram + c.naoAcessaram).toBe(2);
  });

  /**
   * A REABERTURA É A METADE QUE FALTA DO CONTADOR: pendência devolvida ao candidato (`liberado_em`
   * preenchido) não é mais intervenção EM ABERTO. As duas condições estão na consulta, e nenhuma é
   * redundante: sem `caiu_em is not null`, o destravamento preventivo do Master (linha que existe
   * sem queda nenhuma) entraria no contador.
   */
  it("as duas condições da intervenção estão na consulta: caiu e não foi reaberta", () => {
    const inicio = CODIGO_SERVICO.indexOf("portalPendenciasNoTime.admissaoId");
    const bloco = CODIGO_SERVICO.slice(inicio, inicio + 500);
    expect(bloco).toContain("isNotNull(portalPendenciasNoTime.caiuEm)");
    expect(bloco).toMatch(/portalPendenciasNoTime\.liberadoEm\} is null/);
    expect(CODIGO_SERVICO).toContain("selectDistinct");
  });

  it("no serviço, a pendência reaberta não aparece e a lista carrega o mesmo `noTime` do card", async () => {
    const dados: DadosFake = {
      links: [
        { admissaoId: "adm-caiu", criadoEm: rel(-2_000), expiraEm: rel(3_600_000) },
        { admissaoId: "adm-ok", criadoEm: rel(-1_000), expiraEm: rel(3_600_000) },
      ],
      noTime: ["adm-caiu"],
    };
    expect((await servico(dados).resumo()).intervencaoHumana).toBe(1);
    const itens = (await servico(dados).listar({})).itens;
    expect(itens.filter((i) => i.noTime).map((i) => i.admissaoId)).toEqual(["adm-caiu"]);
  });
});

// ══ 4. A SOMA NUNCA DIVERGE ══════════════════════════════════════════════════════════════════

/**
 * NÃO ACESSARAM É DERIVADO, e é essa a única razão de a soma fechar. O risco futuro é alguém
 * "otimizar" isso numa sexta consulta. Aqui a invariante é varrida sobre 300 recortes gerados com
 * semente fixa, incluindo valores que não deveriam existir (pendentes negativo, pendentes maior
 * que o total), porque contador que recebe lixo ainda assim não pode inventar número.
 */
describe("a invariante do funil, sobre 300 recortes gerados", () => {
  it("encaminhados = acessaram + naoAcessaram, e concluiram nunca passa de acessaram", () => {
    let semente = 20260920;
    const proximo = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente / 2147483648;
    };

    for (let caso = 0; caso < 300; caso += 1) {
      const quantos = Math.floor(proximo() * 12);
      const fatos: FatoDaAdmissaoNoPainel[] = [];
      for (let i = 0; i < quantos; i += 1) {
        const obrigatorios = Math.floor(proximo() * 4);
        fatos.push({
          acessou: proximo() < 0.5,
          obrigatorios,
          obrigatoriosPendentes: Math.floor(proximo() * 5) - 1,
          noTime: proximo() < 0.3,
        });
      }
      const c = contarPainel(fatos);
      expect(c.encaminhados).toBe(fatos.length);
      expect(c.acessaram + c.naoAcessaram).toBe(c.encaminhados);
      expect(c.concluiram).toBeLessThanOrEqual(c.acessaram);
      expect(c.intervencaoHumana).toBeLessThanOrEqual(c.encaminhados);
      for (const valor of Object.values(c)) {
        expect(Number.isInteger(valor)).toBe(true);
        expect(valor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("no SERVIÇO a soma também fecha, com links repetidos e farol misturado", async () => {
    const dados: DadosFake = {
      links: [
        { admissaoId: "a1", criadoEm: rel(-9_000), expiraEm: rel(3_600_000) },
        {
          admissaoId: "a1",
          criadoEm: rel(-8_000),
          expiraEm: rel(3_600_000),
          primeiroAcessoEm: rel(-7_000),
          ultimoAcessoEm: rel(-7_000),
        },
        { admissaoId: "a2", criadoEm: rel(-6_000), expiraEm: rel(3_600_000) },
        { admissaoId: "a3", criadoEm: rel(-5_000), expiraEm: rel(3_600_000) },
        { admissaoId: "a3", criadoEm: rel(-4_000), expiraEm: rel(3_600_000) },
        { admissaoId: "a4", criadoEm: rel(-3_000), expiraEm: rel(3_600_000) },
      ],
      farol: { a4: "DECLINOU" },
    };
    const r = await servico(dados).resumo();
    expect(r.encaminhados).toBe(3);
    expect(r.acessaram + r.naoAcessaram).toBe(r.encaminhados);
    expect((await servico(dados).listar({})).total).toBe(r.encaminhados);
  });
});

// ══ 5. M1 POR OUTRO CAMINHO ══════════════════════════════════════════════════════════════════

describe("M1 (régua vazia não conclui): tentativas de reabrir por outro caminho", () => {
  /**
   * O CAMINHO QUE O AUTOR NÃO EXERCITA: a régua nem responde pelo id. O serviço cai no
   * `?? { entregues: 0, total: 0 }`, que é literalmente a régua vazia do M1, só que por OMISSÃO em
   * vez de por cadastro. Se a régua algum dia parar de pré-semear os ids, este é o caminho por
   * onde "concluiu, 0 de 0" volta.
   */
  it("id AUSENTE do mapa de progresso não conclui, mesmo com acesso", async () => {
    const dados: DadosFake = {
      links: [
        {
          admissaoId: "adm-sem-mapa",
          criadoEm: rel(-10_000),
          expiraEm: rel(3_600_000),
          primeiroAcessoEm: rel(-5_000),
          ultimoAcessoEm: rel(-5_000),
        },
      ],
    };
    const r = await servico(dados, regua({ mapaVazio: true })).resumo();
    expect(r.acessaram).toBe(1);
    expect(r.concluiram).toBe(0);

    const [linha] = (await servico(dados, regua({ mapaVazio: true })).listar({})).itens;
    expect(linha.obrigatorios).toBe(0);
    expect(linha.aceitos).toBe(0);
    expect(linha.documentoAtual).toBeNull();
  });

  it("régua vazia conta em ACESSARAM e some só de CONCLUÍRAM: a pessoa continua visível", () => {
    const c = contarPainel([
      fato({ acessou: true, obrigatorios: 0, obrigatoriosPendentes: 0 }),
      fato({ acessou: true, obrigatorios: 10, obrigatoriosPendentes: 0 }),
    ]);
    expect(c.encaminhados).toBe(2);
    expect(c.acessaram).toBe(2);
    expect(c.concluiram).toBe(1);
  });

  /**
   * SOBRE-ENTREGA (entregues maior que o total): pendentes vira NEGATIVO, e ela CONCLUI.
   *
   * ESTA ASSERÇÃO FOI INVERTIDA pelo COORDENADOR em 20/09/2026, e o porquê fica registrado aqui
   * porque a redação anterior chamava o `=== 0` de "direção segura". Ela deixou de ser segura
   * quando a ABA nasceu: "não conclui" agora significa FICAR PARA SEMPRE na frente de trabalho, e
   * sobre-entrega quer dizer que TODO obrigatório da régua está aceito (entregues maior que o
   * total acontece quando a régua ENCOLHE depois da entrega, por um documento deixar de ser
   * obrigatório). Prender a pessoa na fila por uma mudança de régua que não é dela é o pior dos
   * dois erros, e o M1 continua fechado pelo outro lado da conjunção: régua VAZIA (`obrigatorios`
   * igual a zero) não conclui, e isso segue travado nos testes acima.
   */
  it("SOBRE-ENTREGA conclui: entregou MAIS do que a régua cobra é coleta completa", () => {
    // Com `aceitos` informado (é o que o serviço sempre faz, `portal-painel.service.ts`), a
    // comparação é `>=`: régua que encolheu depois da entrega não pode prender a pessoa na fila.
    expect(
      contarPainel([
        fato({ acessou: true, obrigatorios: 2, obrigatoriosPendentes: -1, aceitos: 3 }),
      ]).concluiram,
    ).toBe(1);
  });

  it("pendente NEGATIVO sem `aceitos` NÃO conclui: ali o número é dado quebrado, não sobre-entrega", () => {
    // A distinção é do domínio e é deliberada: sem saber quantos foram aceitos, negativo só pode
    // ser chamador defeituoso, e dado quebrado não conclui nada.
    expect(
      contarPainel([fato({ acessou: true, obrigatorios: 2, obrigatoriosPendentes: -1 })])
        .concluiram,
    ).toBe(0);
  });

  it("régua VAZIA continua NÃO concluindo, mesmo com pendente zero (o M1 segue fechado)", () => {
    expect(
      contarPainel([fato({ acessou: true, obrigatorios: 0, obrigatoriosPendentes: 0 })]).concluiram,
    ).toBe(0);
  });

  it("a régua é CONSUMIDA, nunca recalculada aqui (§A.19)", () => {
    expect(CODIGO_SERVICO).toContain("this.regua.progressoObrigatoriosMap");
    expect(CODIGO_SERVICO).toContain("this.regua.proximoObrigatorioPendenteMap");
    expect(CODIGO_SERVICO).not.toMatch(/reguaDocumental|regua_documental|OBRIGATORIO/);
  });

  it("a conjunção do contador exige as TRÊS condições, e não duas", () => {
    const fonte = semComentarios(
      readFileSync(join(DIR, "..", "domain", "portal-painel.ts"), "utf8"),
    );
    expect(fonte).toMatch(
      /fato\.acessou && fato\.obrigatorios > 0 && fato\.obrigatoriosPendentes === 0/,
    );
  });
});

// ══ 6. L1 POR OUTRO CAMINHO, ATÉ O NÚMERO QUE VAI AO BANCO ═══════════════════════════════════

describe("L1 (página absurda): o teto seguido até o `OFFSET` que o serviço manda ao driver", () => {
  /**
   * O AUTOR PARA NA FUNÇÃO PURA. O `bigint out of range` aconteceu no BANCO, então o que precisa
   * ser provado é o número que chega ao `.offset()`. O banco de mentirinha deste arquivo registra
   * esse número justamente para isto.
   */
  it.each(["1e19", "99999999999999999999", "  1e19  ", "9007199254740993"])(
    "`pagina=%s` chega ao driver como deslocamento dentro da faixa do inteiro",
    async (pagina) => {
      const espiao: Espiao = { limites: [], deslocamentos: [] };
      const p = await servico({ links: [] }, regua({}), espiao).listar({ pagina, tamanho: "100" });
      expect(espiao.deslocamentos).toHaveLength(1);
      const deslocamento = espiao.deslocamentos[0];
      expect(Number.isSafeInteger(deslocamento)).toBe(true);
      expect(deslocamento).toBeLessThan(2_147_483_647);
      expect(deslocamento).toBe((PAGINA_MAXIMA_INDICE_PAINEL - 1) * PAGINA_MAXIMA_PAINEL);
      // E a resposta conta a verdade sobre onde parou, em vez de ecoar a página pedida.
      expect(p.pagina).toBe(PAGINA_MAXIMA_INDICE_PAINEL);
    },
  );

  /**
   * O PARÂMETRO REPETIDO (`?pagina=1&pagina=1e19`) chega ao Express como ARRAY, e o tipo declarado
   * (`number | string`) não impede isso em tempo de execução. `Number(["1e19"])` é 1e19, ou seja,
   * o array de um elemento ATRAVESSA a normalização. O teto é o que segura, e é por isso que ele
   * precisa ser provado com essa entrada e não só com texto.
   */
  it("parâmetro repetido (array) não escapa do teto", () => {
    expect(recorteDaPagina({ pagina: ["1e19"] as never, tamanho: ["500"] as never })).toEqual({
      limite: PAGINA_MAXIMA_PAINEL,
      deslocamento: (PAGINA_MAXIMA_INDICE_PAINEL - 1) * PAGINA_MAXIMA_PAINEL,
    });
    // Array de dois vira `NaN`, e `NaN` cai no padrão seguro.
    expect(recorteDaPagina({ pagina: ["1", "2"] as never })).toEqual({
      limite: 25,
      deslocamento: 0,
    });
  });

  it("o pior caso possível dos dois tetos juntos ainda cabe no inteiro do Postgres", () => {
    const r = recorteDaPagina({
      pagina: Number.MAX_SAFE_INTEGER,
      tamanho: Number.MAX_SAFE_INTEGER,
    });
    expect(r.limite).toBe(PAGINA_MAXIMA_PAINEL);
    expect(r.deslocamento).toBeLessThan(2_147_483_647);
  });

  /** Varredura de lixo: nada lança, nada sai da faixa, nada volta fracionário. */
  it.each([
    "0x10",
    "1e309",
    "-1e19",
    "Infinity",
    "-Infinity",
    "NaN",
    "1,5",
    "2.9",
    "1e4",
    " ",
    "null",
    "[]",
    "{}",
    "true",
  ])("`pagina=%s` cai numa faixa segura sem lançar", (valor) => {
    const r = recorteDaPagina({ pagina: valor, tamanho: valor });
    expect(Number.isSafeInteger(r.limite)).toBe(true);
    expect(Number.isSafeInteger(r.deslocamento)).toBe(true);
    expect(r.limite).toBeGreaterThanOrEqual(1);
    expect(r.limite).toBeLessThanOrEqual(PAGINA_MAXIMA_PAINEL);
    expect(r.deslocamento).toBeGreaterThanOrEqual(0);
    expect(r.deslocamento).toBeLessThan(2_147_483_647);
  });

  /**
   * A PÁGINA 2 PRECISA ENTREGAR A PÁGINA 2. O teste de paginação do autor só exercita lista vazia,
   * então o recorte nunca foi seguido até o resultado: limite e deslocamento poderiam estar
   * trocados na chamada e nada falharia.
   */
  it("a página 2 traz o item seguinte, na ordem do encaminhamento mais recente", async () => {
    const dados: DadosFake = {
      links: [
        { admissaoId: "a-antiga", criadoEm: rel(-30_000), expiraEm: rel(3_600_000) },
        { admissaoId: "b-meio", criadoEm: rel(-20_000), expiraEm: rel(3_600_000) },
        { admissaoId: "c-nova", criadoEm: rel(-10_000), expiraEm: rel(3_600_000) },
      ],
    };
    const p1 = await servico(dados).listar({ pagina: 1, tamanho: 1 });
    const p2 = await servico(dados).listar({ pagina: 2, tamanho: 1 });
    const p3 = await servico(dados).listar({ pagina: 3, tamanho: 1 });
    expect(p1.itens.map((i) => i.admissaoId)).toEqual(["c-nova"]);
    expect(p2.itens.map((i) => i.admissaoId)).toEqual(["b-meio"]);
    expect(p3.itens.map((i) => i.admissaoId)).toEqual(["a-antiga"]);
    // O TOTAL é do recorte inteiro, e não da página: é ele que a tela usa para paginar.
    for (const p of [p1, p2, p3]) expect(p.total).toBe(3);
    expect(p2.pagina).toBe(2);
    expect(p2.tamanho).toBe(1);
  });

  it("página além do fim devolve lista vazia, com o total do recorte inteiro", async () => {
    const dados: DadosFake = {
      links: [{ admissaoId: "unica", criadoEm: rel(-1_000), expiraEm: rel(3_600_000) }],
    };
    const p = await servico(dados).listar({ pagina: 99, tamanho: 10 });
    expect(p.itens).toEqual([]);
    expect(p.total).toBe(1);
  });
});

// ══ 7. O STATUS DE CADA UM "NAQUELE MOMENTO" ═════════════════════════════════════════════════

/**
 * O requisito pede "o status de cada funcionário naquele momento, onde ele está na trilha". Na
 * linha isso é o par (progresso da régua + próximo documento) mais o estado do link. O autor prova
 * a linha feliz; o que falta é o estado do link quando há VÁRIOS links, que é o caso que a
 * reemissão cria todo dia.
 */
describe("o estado do link quando a admissão tem vários", () => {
  it("o vigente é o MAIS RECENTE, mesmo que um link antigo ainda esteja vivo", async () => {
    const dados: DadosFake = {
      links: [
        { admissaoId: "adm", criadoEm: rel(-10_000), expiraEm: rel(3_600_000) },
        {
          admissaoId: "adm",
          criadoEm: rel(-1_000),
          expiraEm: rel(3_600_000),
          revogadoEm: rel(-500),
        },
      ],
    };
    const [linha] = (await servico(dados).listar({})).itens;
    // REVOGADO, e não VIVO: a ação do consultor é reemitir, não esperar.
    expect(linha.estadoLink).toBe("REVOGADO");
  });

  it("suspenso no link vigente aparece como SUSPENSO, sem a data de fim atravessar", async () => {
    const dados: DadosFake = {
      links: [
        {
          admissaoId: "adm",
          criadoEm: rel(-10_000),
          expiraEm: rel(-5_000),
          primeiroAcessoEm: rel(-9_000),
          ultimoAcessoEm: rel(-9_000),
        },
        {
          admissaoId: "adm",
          criadoEm: rel(-1_000),
          expiraEm: rel(3_600_000),
          suspensoAte: rel(900_000),
        },
      ],
    };
    const [linha] = (await servico(dados).listar({})).itens;
    expect(linha.estadoLink).toBe("SUSPENSO");
    expect(JSON.stringify(linha)).not.toContain(rel(900_000).toISOString());
    // E o acesso do link vencido continua contando: suspensão não apaga história.
    expect(linha.ultimoAcessoEm).toBe(rel(-9_000).toISOString());
  });

  /**
   * DOIS LINKS COM O MESMO `criado_em`. O desempate é `>` estrito, então vence o PRIMEIRO que o
   * banco devolver, e o banco não promete ordem sem `ORDER BY`. É improvável (dois links no mesmo
   * milissegundo) e o impacto é só o rótulo da coluna, mas a asserção existe para que a escolha
   * fique ESCRITA: hoje é "o primeiro da varredura".
   */
  it("empate de `criado_em` resolve pelo primeiro devolvido (comportamento hoje, não garantia)", async () => {
    const mesmo = rel(-1_000);
    const dados: DadosFake = {
      links: [
        { admissaoId: "adm", criadoEm: mesmo, expiraEm: rel(3_600_000) },
        { admissaoId: "adm", criadoEm: mesmo, expiraEm: rel(3_600_000), revogadoEm: rel(-1) },
      ],
    };
    expect((await servico(dados).listar({})).itens[0].estadoLink).toBe("VIVO");
  });

  it("os estados da coluna são exatamente os do contrato publicado", () => {
    // CINCO desde 20/09/2026: `BLOQUEADO` entrou na lista que já existia (e não numa lista nova ao
    // lado, que deixaria duas verdades sobre o mesmo estado). Ele é ato humano e REVERSÍVEL, ao
    // contrário do REVOGADO, que é terminal, e do SUSPENSO, que é do sistema e passa sozinho.
    const estados = new Set(
      [
        estadoDoLinkNoPainel({ expiraEm: rel(3_600_000) }, HOJE),
        estadoDoLinkNoPainel({ expiraEm: rel(-1) }, HOJE),
        estadoDoLinkNoPainel({ revogadoEm: rel(-1) }, HOJE),
        estadoDoLinkNoPainel({ expiraEm: rel(3_600_000), suspensoAte: rel(1_000) }, HOJE),
        estadoDoLinkNoPainel(undefined, HOJE),
        estadoDoLinkNoPainel(null, HOJE),
      ].map(String),
    );
    const publicados = (
      FONTE_CONTRATO.match(/export const ESTADOS_LINK_PAINEL = \[([^\]]+)\]/)?.[1] ?? ""
    )
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean);
    expect(publicados.sort()).toEqual(["BLOQUEADO", "REVOGADO", "SUSPENSO", "VENCIDO", "VIVO"]);
    for (const e of estados) expect(publicados).toContain(e);
  });
});

// ══ 8. O CONTRATO PUBLICADO E O QUE O SERVIÇO DEVOLVE ════════════════════════════════════════

/**
 * O SERVIÇO DECLARA TIPO LOCAL e o contrato mora em `shared-types` (do coordenador, §A.39). Nada
 * amarra os dois: acrescentar um campo de um lado e esquecer o outro compila nos dois, e o defeito
 * só aparece na tela. Aqui a amarração é feita por COMPARAÇÃO DE CHAVES em tempo de execução.
 */
describe("o contrato de `shared-types` e o objeto que o serviço devolve", () => {
  const camposDaInterface = (nome: string): string[] => {
    const inicio = FONTE_CONTRATO.indexOf(`export interface ${nome} {`);
    expect(inicio, `interface ${nome} não encontrada em shared-types`).toBeGreaterThan(0);
    const corpo = FONTE_CONTRATO.slice(inicio, FONTE_CONTRATO.indexOf("\n}", inicio));
    return [...semComentarios(corpo).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]).sort();
  };

  it("a LINHA devolvida tem exatamente os campos de `LinhaDoPainelPortal`", async () => {
    const dados: DadosFake = {
      links: [
        {
          admissaoId: "adm",
          criadoEm: rel(-1_000),
          expiraEm: rel(3_600_000),
          primeiroAcessoEm: rel(-500),
          ultimoAcessoEm: rel(-500),
        },
      ],
    };
    const [linha] = (await servico(dados).listar({})).itens;
    expect(Object.keys(linha).sort()).toEqual(camposDaInterface("LinhaDoPainelPortal"));
  });

  it("o FUNIL devolvido tem exatamente os cinco campos de `ContadoresDoPainelPortal`", async () => {
    const r = await servico({
      links: [{ admissaoId: "adm", criadoEm: rel(-1_000), expiraEm: rel(3_600_000) }],
    }).resumo();
    expect(Object.keys(r).sort()).toEqual(camposDaInterface("ContadoresDoPainelPortal"));
  });

  it("a PÁGINA devolvida tem exatamente os campos de `PaginaDoPainelPortal`", async () => {
    const p = await servico({ links: [] }).listar({});
    expect(Object.keys(p).sort()).toEqual(camposDaInterface("PaginaDoPainelPortal"));
  });

  /**
   * §A.6 pelo objeto, e não pelo texto do arquivo: o autor varre a FONTE atrás de campo proibido,
   * o que não pega um campo que nasça de um `select *` ou de um espalhamento. Esta asserção olha o
   * que sai.
   */
  it("nada de Sala De Segurança atravessa no objeto serializado", async () => {
    const dados: DadosFake = {
      links: [
        {
          admissaoId: "adm",
          criadoEm: rel(-1_000),
          expiraEm: rel(3_600_000),
          suspensoAte: rel(900_000),
          primeiroAcessoEm: rel(-500),
          ultimoAcessoEm: rel(-500),
        },
      ],
    };
    const serializado = JSON.stringify(await servico(dados).listar({}));
    for (const proibido of ["cpf", "ip", "ua_hash", "uaHash", "tentativa", "suspensoAte", "geo"]) {
      expect(serializado.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });
});

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
