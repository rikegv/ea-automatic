import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executarCicloDeIngestao } from "./ingestao-ciclo";
import type { DependenciasDaVarredura, Escrita, PortaBanco } from "./ingestao-portas";
import {
  criarMatch,
  criarMundo,
  SENTINELA,
  type EstadoDoMundo,
  type Mundo,
} from "./ingestao-varredura.tester-fake";

/**
 * ─ A VARREDURA NUNCA CRIA ADMISSAO (`tester` independente, §A.38/§A.40 regra 2) ─────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CONSERTO EXISTIR. Quem vai consertar e outro agente; este
 * arquivo so fixa a regra, e por construcao os dois primeiros testes FALHAM contra o codigo de hoje.
 *
 * A REGRA, nas palavras do diretor:
 *
 *   "O UNICO GATILHO QUE ENVIA PARA ADMISSAO E O GATILHO DA ESTEIRA, E NAO DAS ATS."
 *
 * A varredura de A&S do Pandape le a ETAPA do funil; o webhook dispara na ACAO de enviar para a
 * admissao. "Contratados" no funil NAO E "enviado para admissao", e foi essa troca que fez a
 * varredura criar 259 pre-admissoes em 01/10/2026, das quais 254 pessoas JA ESTAVAM na esteira
 * (medicao em `docs/AS-259-JA-ESTAO-NA-ESTEIRA.md`).
 *
 * ┌─ POR QUE A ASSERCAO NAO CITA O NOME DA PONTE ────────────────────────────────────────────────┐
 * │ O conserto REMOVE `PortaPonteParaAdmissao`, `ponteParaAdmissao` e os tres contadores do        │
 * │ resumo (`docs/MAPA-ALCANCE-VARREDURA-NAO-CRIA-ADMISSAO.md`). Um teste escrito sobre aqueles    │
 * │ nomes nem COMPILARIA depois, e um teste que nao compila nao protege nada. Entao a prova aqui   │
 * │ e sobre o EFEITO, lido por tres vigias ao mesmo tempo:                                        │
 * │   1. QUALQUER escrita em tabela cujo nome fale de admissao;                                   │
 * │   2. QUALQUER escrita que carregue a coluna `admissao_id` (o elo que a ponte gravava);         │
 * │   3. QUALQUER chamada a uma porta de dependencia que nao seja uma das portas conhecidas do     │
 * │      ciclo (`http`, `banco`, `fila`, `log`), que e como uma ponte injetada aparece.            │
 * │ O item 3 e o que fecha "por qualquer porta": ele nao pergunta COMO a porta se chama, pergunta  │
 * │ se o ciclo chamou alguma coisa fora do conjunto que alimenta o funil.                          │
 * │                                                                                               │
 * │ E A QUARTA TRAVA E DE FRONTEIRA, no fim deste arquivo: nenhum fonte da pasta da varredura      │
 * │ alcanca a API que cria admissao. Sem ela, os tres vigias de cima cobririam so o cenario        │
 * │ fabricado; com ela, nao sobra porta nova para ser inventada depois.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado real. Tudo vem das sentinelas sinteticas do mundo falso.
 */

const VAGA = 9001;
const PASTA_CONTRATADOS = 71;
const PASTA_ADMISSAO = 73;
const PASTA_EM_SELECAO = 72;

/** As portas que o ciclo TEM de usar para alimentar o funil. Qualquer outra e porta de efeito novo. */
const PORTAS_DO_FUNIL = new Set(["http", "banco", "fila", "log"]);

/** O que conta como prova de que uma admissao nasceu, sem citar o nome de nenhuma funcao. */
interface Vigia {
  /** Escritas em tabela de admissao, ou escritas que carregam o elo `admissao_id`. */
  escritasDeAdmissao: Escrita[];
  /** Portas de dependencia chamadas fora do conjunto do funil (uma ponte injetada cai aqui). */
  portasForaDoFunil: string[];
}

/**
 * O BANCO DO MUNDO FALSO, ACRESCIDO DO QUE SO O ESCRITOR SABE, e do vigia.
 *
 * O fake do `tester` devolve `linhasAfetadas`, que vale 1 no nascimento E no update que mudou algo.
 * `criada`, `situacaoNoEa` e `jaTemAdmissao` sao respondidos aqui do MESMO jeito que o repositorio
 * de producao os responde (`ingestao-repositorio.ts`: a linha existia antes desta escrita? qual a
 * situacao dela hoje? ela ja aponta para uma admissao?), sem tocar o arquivo do `tester`.
 */
function bancoVigiado(mundo: Mundo, vigia: Vigia): PortaBanco {
  const original = mundo.deps.banco as unknown as PortaBanco;
  return {
    ...original,
    async escrever(e) {
      const tabelaFalaDeAdmissao = /admiss/i.test(e.tabela);
      const carregaOElo = "admissao_id" in e.valores;
      if (tabelaFalaDeAdmissao || carregaOElo) vigia.escritasDeAdmissao.push(e);

      if (e.tabela !== "as_candidaturas") return original.escrever(e);
      const linhas = mundo.obs.linhas.as_candidaturas ?? [];
      const existente = linhas.find(
        (l) => l.candidato_id === e.valores.candidato_id && l.vaga_id === e.valores.vaga_id,
      );
      const r = await original.escrever(e);
      if (!existente) return { ...r, criada: true };
      return {
        ...r,
        criada: false,
        situacaoNoEa: (existente.situacao as string | null) ?? null,
        jaTemAdmissao: (existente.admissao_id ?? null) !== null,
      };
    },
  };
}

/**
 * ─ O VIGIA DAS PORTAS: UM `Proxy` SOBRE AS DEPENDENCIAS ────────────────────────────────────────
 *
 * Ele anota TODA propriedade de dependencia que o ciclo le e que nao esteja no conjunto do funil. E
 * assim que "a ponte por qualquer porta" fica medida sem nomear a ponte: hoje a leitura de
 * `ponteParaAdmissao` cai aqui; amanha, qualquer porta nova de efeito tambem cai.
 */
function depsVigiadas(base: DependenciasDaVarredura, vigia: Vigia): DependenciasDaVarredura {
  return new Proxy(base, {
    get(alvo, chave) {
      const nome = String(chave);
      const valor = (alvo as unknown as Record<string, unknown>)[nome];
      if (!PORTAS_DO_FUNIL.has(nome) && pareceUmaPorta(valor)) {
        if (!vigia.portasForaDoFunil.includes(nome)) vigia.portasForaDoFunil.push(nome);
      }
      return valor;
    },
  }) as DependenciasDaVarredura;
}

/**
 * PORTA E OBJETO COM METODO, e a distincao importa: `dataDeCorte` tambem e objeto (um `Date`) e
 * seria um vermelho falso. Uma porta de dependencia e reconhecida pelo que ela OFERECE, uma funcao
 * para o ciclo chamar, e e por isso que a busca desce pelo prototipo (classe de Nest tem os metodos
 * la, e nao nas propriedades proprias).
 */
function pareceUmaPorta(valor: unknown): boolean {
  if (valor === null || typeof valor !== "object") return false;
  if (valor instanceof Date || Array.isArray(valor)) return false;
  const nomes = new Set<string>();
  let nivel: object | null = valor;
  while (nivel !== null && nivel !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(nivel)) nomes.add(n);
    nivel = Object.getPrototypeOf(nivel) as object | null;
  }
  const alvo = valor as Record<string, unknown>;
  return [...nomes].some((n) => n !== "constructor" && typeof alvo[n] === "function");
}

/**
 * ─ A PONTE FINGIDA, INJETADA DE PROPOSITO ─────────────────────────────────────────────────────
 *
 * Ela existe para que a violacao seja POSSIVEL: um cenario montado SEM a porta provaria "zero
 * admissao" por omissao, e passaria verde hoje, com o defeito inteiro no lugar. Com ela injetada, o
 * ciclo de hoje a chama, e o teste acusa. Depois do conserto a porta fica ignorada, e o mesmo teste
 * passa sem nenhuma mudanca de forma. A chave e escrita em `Record<string, unknown>` justamente
 * para o arquivo continuar compilando quando o tipo da porta deixar de existir.
 */
function depsComPonteDisponivel(
  base: DependenciasDaVarredura,
  vigia: Vigia,
  chamadas: string[],
): DependenciasDaVarredura {
  const ponte = {
    async criar(candidaturaId: string) {
      chamadas.push(candidaturaId);
      /*
       * ELA ESCREVE O ELO, como o adaptador de producao escreve (`ingestao-ponte-admissao.ts` grava
       * `as_candidaturas.admissao_id` depois de criar a pre-admissao). Sem essa escrita, o vigia de
       * `admissao_id` nunca veria nada e o teste do elo nulo seria vazio: ele passaria hoje, com o
       * defeito inteiro no lugar.
       */
      await base.banco.escrever({
        tabela: "as_candidaturas",
        acao: "update",
        onde: { id: candidaturaId },
        valores: { admissao_id: "admissao-sintetica-1" },
      });
      return { feita: true as const, posicaoExcedida: false };
    },
  };
  const comPonte = {
    ...(base as unknown as Record<string, unknown>),
    ponteParaAdmissao: ponte,
  } as unknown as DependenciasDaVarredura;
  return depsVigiadas(comPonte, vigia);
}

interface Cenario {
  mundo: Mundo;
  deps: DependenciasDaVarredura;
  vigia: Vigia;
  chamadasDaPonte: string[];
}

/**
 * O CENARIO: uma inscricao na pasta que o de/para traduz para `ENVIADO_PARA_ADMISSAO`.
 *
 * AS DUAS CHAVES SAO AS REAIS da casa (`contratados` e `admissao`, medidas em
 * `as_depara_etapa_externa`), e as duas caem na mesma etapa interna `APROVACAO`. E por isso que o
 * cenario e parametrizado pela pasta: um conserto que esquecesse uma das duas passaria no outro.
 */
function cenarioNaPastaDeAdmissao(
  pasta: "contratados" | "admissao",
  over: Partial<EstadoDoMundo> = {},
): Cenario {
  const idDaPasta = pasta === "contratados" ? PASTA_CONTRATADOS : PASTA_ADMISSAO;
  const estado: EstadoDoMundo = {
    vagas: [
      { idVacancy: VAGA, reference: "REF-1", job: "Cargo Sintetico", city: "", numberVacancies: 2 },
    ],
    pastas: {
      [VAGA]: [
        { idVacancyFolder: PASTA_CONTRATADOS, name: "Contratados" },
        { idVacancyFolder: PASTA_ADMISSAO, name: "Admissao" },
        { idVacancyFolder: PASTA_EM_SELECAO, name: "Em Selecao" },
      ],
    },
    matches: {
      [VAGA]: [
        criarMatch({
          idCandidate: 777,
          idMatch: 999,
          idVacancy: VAGA,
          idVacancyFolder: idDaPasta,
          insertDate: "2026-09-10T10:00:00Z",
        }),
      ],
    },
    dePara: {
      contratados: { etapaCodigo: "APROVACAO", situacao: "ENVIADO_PARA_ADMISSAO" },
      admissao: { etapaCodigo: "APROVACAO", situacao: "ENVIADO_PARA_ADMISSAO" },
      "em selecao": { etapaCodigo: "TRIAGEM", situacao: null },
    },
    ...over,
  };
  const mundo = criarMundo(estado);
  const vigia: Vigia = { escritasDeAdmissao: [], portasForaDoFunil: [] };
  const chamadasDaPonte: string[] = [];
  const base = {
    ...(mundo.deps as unknown as DependenciasDaVarredura),
    banco: bancoVigiado(mundo, vigia),
  } as DependenciasDaVarredura;
  return { mundo, deps: depsComPonteDisponivel(base, vigia, chamadasDaPonte), vigia, chamadasDaPonte };
}

/** A candidatura das 259: situacao de envio JA GRAVADA e `admissao_id` NULO. */
const PREEXISTENTES_DAS_259 = {
  vagas: [{ id: "vaga-1", id_vacancy_pandape: VAGA, codigo: "REF-1" }],
  as_candidatos: [{ id: "cand-1", cpf: SENTINELA.cpf, nome: SENTINELA.nome }],
  as_candidaturas: [
    {
      id: "candidatura-1",
      candidato_id: "cand-1",
      vaga_id: "vaga-1",
      etapa: "APROVACAO",
      situacao: "ENVIADO_PARA_ADMISSAO",
      admissao_id: null,
    },
  ],
};

/**
 * Os contadores do resumo, lidos SEM TIPO: eles vao deixar de existir, e `resumo.pontesParaAdmissao`
 * escrito com tipo nao compilaria depois. Lidos assim, somem valendo zero, que e o que se quer.
 */
function contadoresDePonte(resumo: unknown): number {
  const r = resumo as Record<string, unknown>;
  return (
    Number(r.pontesParaAdmissao ?? 0) +
    Number(r.pontesAdiadas ?? 0) +
    Number(r.posicoesExcedidas ?? 0)
  );
}

function provaDeAdmissaoCriada(c: Cenario, resumo: unknown): string[] {
  const provas: string[] = [];
  if (c.chamadasDaPonte.length > 0) {
    provas.push(`a porta de criacao foi chamada ${c.chamadasDaPonte.length}x`);
  }
  for (const e of c.vigia.escritasDeAdmissao) {
    provas.push(`escrita de admissao em ${e.tabela} (${e.acao})`);
  }
  if (contadoresDePonte(resumo) > 0) provas.push("o resumo contou ponte para a admissao");
  const jobs = c.mundo.obs.jobs.filter((j) =>
    /admiss/i.test(`${j.fila} ${JSON.stringify(j.payload ?? {})}`),
  );
  for (const j of jobs) provas.push(`job de admissao na fila ${j.fila}`);
  for (const porta of c.vigia.portasForaDoFunil) {
    provas.push(`porta de dependencia fora do funil: ${porta}`);
  }
  return provas;
}

describe("1. a trava dura: um ciclo COMPLETO na etapa de admissao nao cria admissao nenhuma", () => {
  for (const pasta of ["contratados", "admissao"] as const) {
    it(`pasta "${pasta}" (de/para para ENVIADO_PARA_ADMISSAO): ZERO admissao criada`, async () => {
      const c = cenarioNaPastaDeAdmissao(pasta);
      const resumo = await executarCicloDeIngestao(c.deps);

      // O CICLO RODOU DE VERDADE: sem esta linha, "zero admissao" seria verdade tambem num ciclo
      // que nao chegou a ler a inscricao, e o teste nao valeria nada.
      expect(c.mundo.obs.linhas.as_candidaturas ?? []).toHaveLength(1);
      expect(resumo.erros).toBe(0);

      expect(provaDeAdmissaoCriada(c, resumo)).toEqual([]);
    });
  }

  /*
   * A VOLTA E DE 30 EM 30 MINUTOS. Uma regra que so vale na primeira passada nao e regra: a segunda
   * volta e exatamente a que recriaria a admissao apagada na volta anterior.
   */
  it("a SEGUNDA volta sobre o mesmo estado tambem nao cria nada", async () => {
    const c = cenarioNaPastaDeAdmissao("contratados");
    await executarCicloDeIngestao(c.deps);
    const segundo = await executarCicloDeIngestao(c.deps);
    expect(provaDeAdmissaoCriada(c, segundo)).toEqual([]);
  });
});

describe("2. o caso das 259: candidatura JA enviada e sem admissao nao e recriada", () => {
  it("situacao = ENVIADO_PARA_ADMISSAO com admissao_id NULO nao gera admissao na volta seguinte", async () => {
    const c = cenarioNaPastaDeAdmissao("contratados", {
      preexistentes: PREEXISTENTES_DAS_259,
    });
    const resumo = await executarCicloDeIngestao(c.deps);

    // A linha das 259 CONTINUA UMA: o ciclo passou por ela, nao criou outra candidatura.
    expect(c.mundo.obs.linhas.as_candidaturas ?? []).toHaveLength(1);
    expect(resumo.erros).toBe(0);

    expect(provaDeAdmissaoCriada(c, resumo)).toEqual([]);
  });

  /*
   * O ELO FICA NULO, E ISSO E RESPOSTA, NAO LACUNA (pergunta 1 do diretor no mapa de alcance): o
   * webhook nunca escreveu `as_candidaturas.admissao_id`, e e por isso que as 250 que ele atendeu
   * aparecem com o elo nulo do lado de A&S. A varredura NAO e quem conserta isso: preencher o elo
   * aqui exigiria que ela soubesse qual admissao e a certa, que e a decisao que ela nao tem.
   */
  it("a varredura nao preenche o elo admissao_id por conta propria", async () => {
    const c = cenarioNaPastaDeAdmissao("contratados", {
      preexistentes: PREEXISTENTES_DAS_259,
    });
    const resumo = await executarCicloDeIngestao(c.deps);
    expect((c.mundo.obs.linhas.as_candidaturas ?? [])[0].admissao_id ?? null).toBeNull();
    expect(provaDeAdmissaoCriada(c, resumo)).toEqual([]);
  });
});

describe("3. o funil CONTINUA sendo atualizado (o contrapeso: o conserto nao e desligar a varredura)", () => {
  for (const pasta of ["contratados", "admissao"] as const) {
    it(`pasta "${pasta}": a candidatura e gravada com a etapa e a situacao do de/para`, async () => {
      const c = cenarioNaPastaDeAdmissao(pasta);
      const resumo = await executarCicloDeIngestao(c.deps);

      const candidaturas = c.mundo.obs.linhas.as_candidaturas ?? [];
      expect(candidaturas).toHaveLength(1);
      // A ETAPA e a SITUACAO sao as que o de/para manda, e nao uma peneira nova escrita no conserto.
      expect(candidaturas[0].etapa).toBe("APROVACAO");
      expect(candidaturas[0].situacao).toBe("ENVIADO_PARA_ADMISSAO");
      // A PESSOA tambem entrou: matar o `resolverPessoa` esvaziaria o funil por outro caminho.
      expect(c.mundo.obs.linhas.as_candidatos ?? []).toHaveLength(1);
      expect(resumo.candidaturasCriadas).toBe(1);
      expect(resumo.vagasVarridas).toBe(1);
      expect(resumo.erros).toBe(0);
    });
  }

  /*
   * A ETAPA QUE NAO E DESFECHO TAMBEM CONTINUA ANDANDO. Sem este caso, um conserto que recusasse
   * TODA inscricao da pasta de admissao (em vez de so nao criar admissao) passaria nos de cima.
   */
  it("a pasta que nao pede admissao segue sendo ingerida normalmente", async () => {
    const c = cenarioNaPastaDeAdmissao("contratados", {
      matches: {
        [VAGA]: [
          criarMatch({
            idCandidate: 778,
            idMatch: 1000,
            idVacancy: VAGA,
            idVacancyFolder: PASTA_EM_SELECAO,
            insertDate: "2026-09-10T10:00:00Z",
          }),
        ],
      },
    });
    const resumo = await executarCicloDeIngestao(c.deps);
    const candidaturas = c.mundo.obs.linhas.as_candidaturas ?? [];
    expect(candidaturas).toHaveLength(1);
    expect(candidaturas[0].etapa).toBe("TRIAGEM");
    expect(resumo.erros).toBe(0);
  });
});

/**
 * ─ 4. A FRONTEIRA DA PASTA: NENHUM FONTE DA VARREDURA ALCANCA A CRIACAO DE ADMISSAO ────────────
 *
 * Os cenarios de cima medem o que o ciclo FAZ no lote fabricado. Esta trava mede o que a pasta
 * PODE fazer, e e ela que impede que a porta volte por outro nome depois.
 *
 * `criarPreAdmissaoDoFunil` e o ANCORA ESTAVEL desta asserção, e de proposito: ele NAO morre no
 * conserto (o caminho manual continua chamando-o, com dois chamadores restantes), entao procurar
 * por ele nao e procurar por um nome que vai sumir.
 *
 * ARMADILHA JA PAGA PELA CASA: a varredura de fonte casa COMENTARIO, e a pasta esta cheia de
 * comentario que cita a ponte. Sem tirar os comentarios, isto daria vermelho falso para sempre; e
 * sem o canario, daria verde para qualquer coisa (inclusive para uma leitura que nao leu nada).
 */
const PASTA_DA_VARREDURA = __dirname;
const RAIZ_DO_BACKEND_SRC = join(__dirname, "..", "..");

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/(^|[^:/])\/\/.*$/, "$1"))
    .join("\n");
}

function fontesDaPasta(pasta: string): { nome: string; codigo: string }[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith(".ts"))
    .filter((n) => !n.includes(".spec.") && !n.includes("tester-fake") && !n.startsWith("arnes-"))
    .map((nome) => ({ nome, codigo: semComentarios(readFileSync(join(pasta, nome), "utf8")) }));
}

describe("4. a fronteira: a pasta da varredura nao alcanca a API que cria admissao", () => {
  /*
   * O CANARIO. Sem ele a varredura "prova" qualquer coisa: leitura vazia, comentario comido demais
   * ou pasta errada dariam verde. `criarPreAdmissaoDoFunil` TEM de aparecer no servico de admissoes,
   * fora de comentario, senao e a MEDICAO que esta quebrada, e nao o codigo.
   */
  it("o canario: a API de criacao existe e e encontravel fora de comentario", () => {
    const servico = semComentarios(
      readFileSync(join(RAIZ_DO_BACKEND_SRC, "admissoes", "admissoes.service.ts"), "utf8"),
    );
    expect(servico).toContain("criarPreAdmissaoDoFunil");
  });

  it("o segundo canario: a varredura de fonte LE a pasta certa e ela nao esta vazia", () => {
    const nomes = fontesDaPasta(PASTA_DA_VARREDURA).map((f) => f.nome);
    expect(nomes).toContain("ingestao-ciclo.ts");
    expect(nomes.length).toBeGreaterThan(3);
  });

  it("nenhum fonte da pasta cita a API de criacao de admissao", () => {
    const culpados = fontesDaPasta(PASTA_DA_VARREDURA)
      .filter((f) => /criarPreAdmissao|AdmissoesService/.test(f.codigo))
      .map((f) => f.nome);
    expect(culpados).toEqual([]);
  });

  it("nenhum fonte da pasta escreve o elo admissao_id", () => {
    const culpados = fontesDaPasta(PASTA_DA_VARREDURA)
      .filter((f) => /update\s+as_candidaturas[\s\S]*admissao_id\s*=/.test(f.codigo))
      .map((f) => f.nome);
    expect(culpados).toEqual([]);
  });

  /*
   * O MODULO E A OUTRA METADE DA FRONTEIRA: provider registrado e porta disponivel. `AsModule`
   * CONTINUA importando `AdmissoesModule` (o caminho manual do funil depende dele), entao a
   * asserção e sobre o PROVIDER da ponte, e nao sobre o import do modulo.
   */
  it("o AsModule nao registra provider de ponte para a admissao", () => {
    const modulo = semComentarios(
      readFileSync(join(RAIZ_DO_BACKEND_SRC, "as", "as.module.ts"), "utf8"),
    );
    expect(modulo).toMatch(/AdmissoesModule/);
    expect(modulo).not.toMatch(/Ponte[A-Za-z]*Admissao|Admissao[A-Za-z]*Ponte/i);
  });
});
