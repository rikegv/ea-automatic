import {
  lerLinhaDePara,
  marcaDeChaveExterna,
  normalizarChaveExterna,
  ehFonteExterna,
  type LinhaDeParaEtapaExternaCrua,
} from "../../domain/as-etapa-externa";
import {
  cteQueEscreveEm,
  setDaEscrita,
} from "../candidatos/retencao-texto-livre.tester-fake";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A INGESTÃO DO PANDAPÉ POR VARREDURA ─────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é o mesmo dos arquivos de retenção,
 * e pelo mesmo motivo registrado neles: nome que ninguém mais escolheria é a trava mais barata
 * contra dois agentes gravarem o mesmo arquivo em silêncio (§A.39).
 *
 * ┌─ ESTE ARQUIVO NASCE ANTES DO CÓDIGO QUE ELE MEDE (§A.40, regra 2) ──────────────────────────┐
 * │ O ingestor NÃO EXISTE. O que existe é o requisito, medido contra a API real em               │
 * │ `docs/PLANO-INGESTAO-PANDAPE-VARREDURA.md`. O contrato abaixo nomeia as PROPRIEDADES que     │
 * │ aquele documento exige, e o teste comportamental ao lado o aplica a duas coisas:              │
 * │   1. uma REFERÊNCIA sabidamente correta escrita aqui, que ele tem de APROVAR, mais 27         │
 * │      MUTANTES dela, que ele tem de REPROVAR cada um pela regra nomeada. Sem isso, "meu        │
 * │      contrato pega o defeito?" seria opinião;                                                 │
 * │   2. o ingestor de PRODUÇÃO, que ainda não existe, e por isso nasce VERMELHO.                 │
 * │                                                                                               │
 * │ A REFERÊNCIA NÃO É A IMPLEMENTAÇÃO ESPERADA. Quem constrói pode escrever outra coisa, desde   │
 * │ que as propriedades valham. Ela existe para dar ao contrato um comportamento CORRETO para     │
 * │ aprovar e uma base de onde derivar os mutantes.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE SE MEDE É EFEITO, NUNCA TEXTO ────────────────────────────────────────────────────────┐
 * │ Não há Postgres nesta suíte e não há API do Pandapé. O mundo abaixo é um fake que ANOTA:      │
 * │ toda requisição (com o VERBO), toda escrita (com as COLUNAS e os VALORES), todo job           │
 * │ enfileirado e toda linha de log. As afirmações recaem sobre esse registro, e não sobre o      │
 * │ código do ingestor: procurar a palavra `atualizado_em` no fonte ficaria verde com o defeito   │
 * │ aberto no dia em que alguém escrevesse a mesma coisa por outro caminho.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: NENHUM dado real entra aqui. Não há CPF, nome, e-mail, telefone nem payload do Pandapé:
 * o que circula são SENTINELAS inventadas, cuja única função é ser procurada nos lugares onde ela
 * não pode aparecer.
 */

// ── 1. AS SENTINELAS (§A.6): VALORES INVENTADOS, FEITOS PARA SEREM PROCURADOS ──────────────────

/**
 * Cada sentinela é um valor que NÃO é dado de ninguém e que o contrato persegue nos sinks em que
 * ele não pode aparecer. Elas são propositalmente feias e únicas: uma sentinela que pudesse ser
 * confundida com texto comum daria falso negativo em silêncio.
 */
export const SENTINELA = {
  cpf: "cpf-sintetico-aaaa",
  nome: "PrimeiroNomeSintetico",
  sobrenome: "SobrenomeSintetico",
  email: "email-sintetico-aaaa",
  telefone: "telefone-sintetico-aaaa",
  resumo: "resumo-de-curriculo-sintetico-texto-livre",
  experiencia: "experiencia-sintetica-com-empresa-e-salario",
  estudo: "estudo-sintetico-texto-livre",
  endereco: "endereco-sintetico-aaaa",
  raca: "sensivel-art11-raca-sintetico",
  orientacao: "sensivel-art11-orientacao-sintetico",
  genero: "sensivel-art11-genero-sintetico",
  deficiencia: "sensivel-art11-deficiencia-sintetico",
} as const;

/**
 * OS QUATRO CAMPOS DO ART. 11, PELO NOME QUE A API USA.
 *
 * A perseguição é por NOME DE CAMPO e por VALOR, e as duas são necessárias: quem copia o objeto
 * inteiro leva o nome junto, e quem "só guarda o que interessa" pode levar o valor com outro nome.
 */
export const CAMPOS_SENSIVEIS = [
  "idRace",
  "idSexualOrientation",
  "idGenderIdentity",
  "hasDeficiency",
  "deficiencies",
] as const;

/** As sentinelas de DADO PESSOAL, que podem ir ao banco e NUNCA ao log nem ao payload da fila. */
export const SENTINELAS_PESSOAIS: string[] = [
  SENTINELA.cpf,
  SENTINELA.nome,
  SENTINELA.sobrenome,
  SENTINELA.email,
  SENTINELA.telefone,
];

/** As sentinelas de DADO SENSÍVEL e de TEXTO LIVRE, que não podem ir a lugar NENHUM. */
export const SENTINELAS_PROIBIDAS_EM_TODO_LUGAR: string[] = [
  SENTINELA.raca,
  SENTINELA.orientacao,
  SENTINELA.genero,
  SENTINELA.deficiencia,
  SENTINELA.resumo,
  SENTINELA.experiencia,
  SENTINELA.estudo,
  SENTINELA.endereco,
];

// ── 2. O MUNDO FALSO: O QUE A API DEVOLVE ──────────────────────────────────────────────────────

export interface VagaCrua {
  idVacancy: number;
  reference: string;
  job: string;
  city: string;
  numberVacancies: number;
}

export interface PastaCrua {
  idVacancyFolder: number;
  name: string;
}

/** O item de `/v2/matches`, com os 58 campos resumidos no que importa para a medição. */
export type MatchCru = Record<string, unknown>;

/**
 * UM ITEM COM TUDO O QUE A API MANDA, inclusive o que a plataforma não pode tocar.
 *
 * O item vem GORDO de propósito: a armadilha que o plano descreve (seção 7) é o gesto natural de
 * salvar o objeto que veio. Um fake que devolvesse só os nove campos projetados tornaria o defeito
 * IMPOSSÍVEL de cometer no teste e VERDE em produção, que é o pior resultado possível.
 */
export function criarMatch(over: Partial<MatchCru> & { idCandidate: number; idMatch: number; idVacancy: number; idVacancyFolder: number; insertDate: string }): MatchCru {
  return {
    name: SENTINELA.nome,
    surname: SENTINELA.sobrenome,
    cpf: SENTINELA.cpf,
    email: SENTINELA.email,
    phone: SENTINELA.telefone,
    phone2: SENTINELA.telefone,
    birthDate: "1990-01-01",
    cep: "00000-000",
    address: SENTINELA.endereco,
    addressNumber: "0",
    addressComplement: SENTINELA.endereco,
    latitude: -0.1,
    longitude: -0.2,
    location2: "SP",
    location3: "Cidade Sintetica",
    maritalStatus: 1,
    children: 0,
    nationality: 1,
    summary: SENTINELA.resumo,
    experiences: [{ company: SENTINELA.experiencia, salary: 1 }],
    studies: [{ course: SENTINELA.estudo }],
    languages: [],
    skills: [],
    salaryMin: 1,
    salaryMax: 2,
    licenses: [],
    vehicles: [],
    socialNetworks: [],
    modifyDate: "2026-09-01T00:00:00Z",
    idRace: SENTINELA.raca,
    idSexualOrientation: SENTINELA.orientacao,
    idGenderIdentity: SENTINELA.genero,
    hasDeficiency: true,
    deficiencies: [SENTINELA.deficiencia],
    ...over,
  };
}

// ── 3. AS PORTAS: O CONTRATO DE DEPENDÊNCIA DO INGESTOR ────────────────────────────────────────

/**
 * A porta HTTP recebe o VERBO como primeiro argumento, e isso é DESENHO DE TESTE, não conveniência.
 *
 * Uma porta que só oferecesse `get()` tornaria a regra "GET apenas" verdadeira por tipagem, e o
 * teste que a prova seria teatro. A API tem `POST /v1/Match/UpdateFolder` e
 * `PATCH /v2/matches/{id}/update`, que ESCREVEM no funil de um ATS de terceiro: o verbo tem de ser
 * POSSÍVEL de emitir aqui para que a proibição dele seja MEDIDA.
 */
export interface PortaHttp {
  requisitar(
    metodo: string,
    caminho: string,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface Escrita {
  tabela: string;
  acao: "insert" | "upsert" | "update" | "delete";
  valores: Record<string, unknown>;
  /** As colunas que identificam a linha no upsert. */
  chaveDeConflito?: string[];
  /** A linha alvo do update. */
  onde?: Record<string, unknown>;
  /**
   * AS COLUNAS COMPARADAS ANTES DE ESCREVER, que é o `where ... is distinct from` do plano (§8.2).
   * Ausente quer dizer escrita INCONDICIONAL, e é assim que o fake distingue as duas.
   */
  comparaAntes?: string[];
  /** Upsert que não atualiza nada quando a linha já existe. */
  aoConflitoNadaFaz?: boolean;
}

export interface PortaBanco {
  identidadeExterna(fonte: string, identificador: string): Promise<{ candidatoId: string } | null>;
  candidatoPorCpf(cpf: string): Promise<{ id: string } | null>;
  /**
   * A ARMADILHA, e ela está aqui de propósito.
   *
   * O plano proíbe casar pessoa por NOME, e o schema registra o veto. Uma porta que não oferecesse
   * a busca por nome tornaria a proibição inexequível e o teste dela decorativo. Ela existe para
   * que o mutante possa cometer o erro e o contrato possa flagrá-lo.
   */
  candidatoPorNome(nome: string): Promise<{ id: string } | null>;
  vagaPorIdPandape(idVacancy: number): Promise<{ id: string } | null>;
  vagaPorCodigo(codigo: string): Promise<{ id: string } | null>;
  deParaEtapa(chave: string): Promise<LinhaDeParaEtapaExternaCrua | null>;
  clientePorVaga(idVacancy: number): Promise<string | null>;
  marcaDaVaga(idVacancy: number): Promise<string | null>;
  escrever(e: Escrita): Promise<{ linhasAfetadas: number; id: string }>;
}

export interface PortaFila {
  enfileirar(fila: string, payload: unknown): Promise<void>;
}

export interface PortaLog {
  info(texto: string, dados?: unknown): void;
  erro(texto: string, dados?: unknown): void;
}

export interface DependenciasDaIngestao {
  http: PortaHttp;
  banco: PortaBanco;
  fila: PortaFila;
  log: PortaLog;
  agora(): Date;
  /**
   * O MARCO INICIAL DA INGESTÃO, e ele é o que separa "só os novos" de "os 137.654".
   *
   * É uma data FIXA, de configuração, e não `agora() menos alguma coisa`: a segunda forma faria o
   * conjunto ingerido depender da HORA EM QUE A VARREDURA FOI LIGADA, e duas vagas varridas em
   * momentos diferentes teriam cortes diferentes sem ninguém decidir isso.
   */
  dataDeCorte: Date;
}

export interface ResumoDoCiclo {
  vagasVarridas: number;
  paginasLidas: number;
  pessoasCriadas: number;
  candidaturasCriadas: number;
  /** As chaves normalizadas que não têm de/para. Registro para o diretor mapear, nunca escrita. */
  etapasNaoMapeadas: string[];
  /** Quantos casos foram para revisão humana em vez de o ciclo escolher sozinho. */
  conflitosParaRevisao: number;
  erros: number;
}

export type Ingestor = (deps: DependenciasDaIngestao) => Promise<ResumoDoCiclo>;

// ── 4. O MUNDO OBSERVADO ───────────────────────────────────────────────────────────────────────

export interface Requisicao {
  metodo: string;
  caminho: string;
}

export interface LinhaDeLog {
  nivel: "info" | "erro";
  texto: string;
  dados?: unknown;
}

export interface Observado {
  requisicoes: Requisicao[];
  escritas: Escrita[];
  efetivas: { escrita: Escrita; linhasAfetadas: number }[];
  jobs: { fila: string; payload: unknown }[];
  logs: LinhaDeLog[];
  linhas: Record<string, Record<string, unknown>[]>;
}

export interface EstadoDoMundo {
  vagas: VagaCrua[];
  pastas: Record<number, PastaCrua[]>;
  matches: Record<number, MatchCru[]>;
  dePara: Record<string, LinhaDeParaEtapaExternaCrua>;
  /** Linhas que já existem no banco antes do ciclo. */
  preexistentes?: Record<string, Record<string, unknown>[]>;
  /** A escrita nesta tabela explode, com o erro do driver carregando o CPF. */
  falharAoEscreverEm?: string;
  paginaDe?: number;
}

export interface Mundo {
  deps: DependenciasDaIngestao;
  obs: Observado;
  /** Roda outro ciclo sobre o MESMO estado, que é como a reentrega é medida. */
  rodar(ingestor: Ingestor, agora?: Date): Promise<ResumoDoCiclo>;
}

/**
 * O ESTADO CRU DE CADA MUNDO, para que um cenário possa MUDAR o que a API devolve entre dois
 * ciclos sem zerar o banco fake. É assim que "reentrega que MUDA de verdade" é medida: o mesmo
 * banco, o mesmo candidato, e um campo diferente chegando na volta seguinte.
 */
const MUNDOS_E_ESTADOS = new WeakMap<Mundo, EstadoDoMundo>();

const CORTE_PADRAO = new Date("2026-09-01T00:00:00.000Z");
const AGORA_PADRAO = new Date("2026-09-18T12:00:00.000Z");

/** O erro que o driver do Postgres levanta, com o valor ofensor no `detail` e nos parâmetros. */
function erroDeDriverComCpf(): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    detail: `Key (cpf)=(${SENTINELA.cpf}) already exists.`,
    query: `insert into as_candidatos (nome, cpf) values ('${SENTINELA.nome}', '${SENTINELA.cpf}')`,
    parameters: [SENTINELA.nome, SENTINELA.cpf],
  });
}

export function criarMundo(estado: EstadoDoMundo): Mundo {
  const obs: Observado = {
    requisicoes: [],
    escritas: [],
    efetivas: [],
    jobs: [],
    logs: [],
    linhas: {},
  };
  for (const [tabela, linhas] of Object.entries(estado.preexistentes ?? {})) {
    obs.linhas[tabela] = linhas.map((l) => ({ ...l }));
  }
  let sequencia = 0;
  let agoraAtual = AGORA_PADRAO;
  const tamanhoDaPagina = estado.paginaDe ?? 200;

  const tabela = (nome: string): Record<string, unknown>[] => {
    obs.linhas[nome] = obs.linhas[nome] ?? [];
    return obs.linhas[nome];
  };

  const casa = (linha: Record<string, unknown>, chave: Record<string, unknown>): boolean =>
    Object.entries(chave).every(([k, v]) => linha[k] === v);

  const banco: PortaBanco = {
    async identidadeExterna(fonte, identificador) {
      const l = tabela("as_identidades_externas").find(
        (x) => x.fonte === fonte && String(x.identificador) === String(identificador),
      );
      return l ? { candidatoId: String(l.candidato_id) } : null;
    },
    async candidatoPorCpf(cpf) {
      const l = tabela("as_candidatos").find((x) => x.cpf === cpf);
      return l ? { id: String(l.id) } : null;
    },
    async candidatoPorNome(nome) {
      const l = tabela("as_candidatos").find((x) => x.nome === nome);
      return l ? { id: String(l.id) } : null;
    },
    async vagaPorIdPandape(idVacancy) {
      const l = tabela("vagas").find((x) => x.id_vacancy_pandape === idVacancy);
      return l ? { id: String(l.id) } : null;
    },
    async vagaPorCodigo(codigo) {
      const l = tabela("vagas").find((x) => x.codigo === codigo);
      return l ? { id: String(l.id) } : null;
    },
    async deParaEtapa(chave) {
      return estado.dePara[chave] ?? null;
    },
    async clientePorVaga() {
      // MEDIDO: não existe caminho de API para o cliente da vaga (plano, seção 4.2).
      return null;
    },
    async marcaDaVaga(idVacancy) {
      const l = tabela("as_varredura_vagas").find((x) => x.id_vacancy_pandape === idVacancy);
      return l ? (l.ultimo_insert_date as string) : null;
    },
    async escrever(e) {
      obs.escritas.push(e);
      if (estado.falharAoEscreverEm === e.tabela) throw erroDeDriverComCpf();
      const alvo = tabela(e.tabela);

      const achar = (): Record<string, unknown> | undefined => {
        if (e.acao === "upsert" && e.chaveDeConflito) {
          const chave = Object.fromEntries(e.chaveDeConflito.map((k) => [k, e.valores[k]]));
          return alvo.find((l) => casa(l, chave));
        }
        if (e.onde) return alvo.find((l) => casa(l, e.onde as Record<string, unknown>));
        return undefined;
      };

      const existente = achar();
      if (!existente) {
        sequencia += 1;
        const id = `linha-${sequencia}`;
        // OS CARIMBOS SÃO DEFAULT DO BANCO: só mudam se o ingestor os CITAR, que é exatamente o
        // que o plano proíbe. O fake reproduz isso para que a citação seja visível no estado.
        const linha: Record<string, unknown> = {
          id,
          ...e.valores,
          criado_em: e.valores.criado_em ?? agoraAtual.toISOString(),
          atualizado_em: e.valores.atualizado_em ?? agoraAtual.toISOString(),
        };
        alvo.push(linha);
        obs.efetivas.push({ escrita: e, linhasAfetadas: 1 });
        return { linhasAfetadas: 1, id };
      }

      if (e.aoConflitoNadaFaz) {
        obs.efetivas.push({ escrita: e, linhasAfetadas: 0 });
        return { linhasAfetadas: 0, id: String(existente.id) };
      }
      const comparadas = e.comparaAntes;
      const identica =
        comparadas !== undefined &&
        comparadas.every((c) => existente[c] === e.valores[c]);
      if (identica) {
        obs.efetivas.push({ escrita: e, linhasAfetadas: 0 });
        return { linhasAfetadas: 0, id: String(existente.id) };
      }
      Object.assign(existente, e.valores);
      obs.efetivas.push({ escrita: e, linhasAfetadas: 1 });
      return { linhasAfetadas: 1, id: String(existente.id) };
    },
  };

  const http: PortaHttp = {
    async requisitar(metodo, caminho, params) {
      obs.requisicoes.push({ metodo, caminho });
      if (caminho.includes("vacancy-folders")) {
        const id = Number(params?.idVacancy ?? 0);
        return { data: estado.pastas[id] ?? [] };
      }
      if (caminho.includes("/v2/matches")) {
        const id = Number(params?.IdVacancy ?? 0);
        const lista = [...(estado.matches[id] ?? [])].sort((a, b) =>
          String(b.insertDate).localeCompare(String(a.insertDate)),
        );
        const pagina = Number(params?.Page ?? 1);
        const tam = Number(params?.PageSize ?? tamanhoDaPagina);
        return { data: lista.slice((pagina - 1) * tam, pagina * tam) };
      }
      if (caminho.includes("/v2/vacancies")) return { data: estado.vagas };
      return { data: [] };
    },
  };

  const deps: DependenciasDaIngestao = {
    http,
    banco,
    fila: {
      async enfileirar(fila, payload) {
        obs.jobs.push({ fila, payload });
      },
    },
    log: {
      info: (texto, dados) => obs.logs.push({ nivel: "info", texto, dados }),
      erro: (texto, dados) => obs.logs.push({ nivel: "erro", texto, dados }),
    },
    agora: () => agoraAtual,
    dataDeCorte: CORTE_PADRAO,
  };

  const mundo: Mundo = {
    deps,
    obs,
    async rodar(ingestor, agora) {
      agoraAtual = agora ?? AGORA_PADRAO;
      return ingestor(deps);
    },
  };
  MUNDOS_E_ESTADOS.set(mundo, estado);
  return mundo;
}

// ── 5. A VARREDURA DE SENTINELA: ONDE O VALOR NÃO PODE APARECER ────────────────────────────────

/**
 * Procura sentinelas e nomes de campo sensível em QUALQUER coisa, fundo adentro.
 *
 * O `Error` é tratado à parte porque `JSON.stringify` de um erro devolve `{}`: quem logasse o erro
 * cru do driver passaria batido por uma varredura ingênua, e é justamente o caminho de erro que o
 * plano manda vigiar (o `detail` carrega o valor que violou a restrição).
 */
export function acharSentinelas(valor: unknown, procurados: string[]): string[] {
  const achados = new Set<string>();
  const visitar = (v: unknown, profundidade: number): void => {
    if (v === null || v === undefined || profundidade > 8) return;
    if (typeof v === "string") {
      for (const p of procurados) if (v.includes(p)) achados.add(p);
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") return;
    if (v instanceof Error) {
      visitar(v.message, profundidade + 1);
      for (const k of Object.keys(v)) {
        visitar((v as unknown as Record<string, unknown>)[k], profundidade + 1);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visitar(x, profundidade + 1);
      return;
    }
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if ((CAMPOS_SENSIVEIS as readonly string[]).includes(k)) achados.add(`campo:${k}`);
        visitar(x, profundidade + 1);
      }
    }
  };
  visitar(valor, 0);
  return [...achados];
}

// ── 6. AS COLUNAS PERMITIDAS: A PROJEÇÃO, EXPLÍCITA ────────────────────────────────────────────

/**
 * A PROJEÇÃO É UMA LISTA DO QUE PODE, e não uma lista do que não pode.
 *
 * A diferença é a regra inteira da seção 7 do plano: "o que a gente não usa fica lá" é como
 * orientação sexual de 137 mil pessoas entra numa base de recrutamento sem ninguém decidir isso.
 * Coluna nova numa destas tabelas fica VERMELHA por construção, e quem a quiser tem de vir aqui
 * declará-la, que é o ponto em que alguém lê o que passa.
 */
export const COLUNAS_PERMITIDAS: Record<string, string[]> = {
  as_candidatos: ["nome", "cpf", "email", "telefone", "data_nascimento", "cidade", "uf"],
  as_identidades_externas: ["fonte", "identificador", "candidato_id", "coletado_em"],
  as_candidaturas: [
    "candidato_id",
    "vaga_id",
    "etapa",
    "situacao",
    "motivo_descarte",
    "fonte",
    "origem",
  ],
  vagas: [
    "id_vacancy_pandape",
    "codigo",
    "nome_divulgacao",
    "cidade_id",
    "posicoes_oficiais",
    "cod_cliente",
    "cargo_id",
    "status",
  ],
  as_varredura_vagas: ["id_vacancy_pandape", "ultimo_insert_date", "ultima_varredura_em"],
};

/** Colunas que guardam TEXTO DIGITADO, e que por isso precisam ser alcançadas pelo expurgo. */
export function ehColunaDeTextoLivre(coluna: string): boolean {
  return /resumo|summary|curriculo|experiencia|observac|descricao|motivo|anotac/.test(coluna);
}

/** O expurgo de produção alcança esta coluna desta tabela? Lido do SQL real da retenção. */
export function expurgoAlcanca(sqlDoExpurgo: string, tabelaAlvo: string, coluna: string): boolean {
  const cte = cteQueEscreveEm(sqlDoExpurgo, tabelaAlvo);
  if (!cte) return false;
  return new RegExp(`\\b${coluna}\\s*=`).test(setDaEscrita(cte.corpo));
}

// ── 7. O CONTRATO: AS PROPRIEDADES, EM REGRAS NOMEADAS ─────────────────────────────────────────

export interface OpcoesDaAuditoria {
  /** O SQL REAL da varredura de retenção, para o cruzamento de texto livre. Opcional. */
  sqlDoExpurgo?: string;
}

/**
 * Roda o ingestor pelos cenários e devolve a lista das VIOLAÇÕES. Vazia é o contrato cumprido.
 *
 * Cada regra carrega, na própria string, o dano que ela causa em produção: é essa frase que alguém
 * vai ler no vermelho, e ela vale mais do que o nome do teste que falhou.
 */
export async function auditarIngestor(
  ingestor: Ingestor,
  opcoes: OpcoesDaAuditoria = {},
): Promise<string[]> {
  const v: string[] = [];
  const mundos: Mundo[] = [];

  v.push(...(await cenarioBase(ingestor, mundos)));
  v.push(...(await cenarioDesempatePorCpf(ingestor, mundos)));
  v.push(...(await cenarioConflito(ingestor, mundos)));
  v.push(...(await cenarioMudancaDeVerdade(ingestor, mundos)));
  v.push(...(await cenarioCorteDeterministico(ingestor, mundos)));
  v.push(...(await cenarioErroDoDriver(ingestor, mundos)));
  v.push(...(await cenarioGrafiaDiferente(ingestor, mundos)));

  for (const m of mundos) v.push(...regrasGlobais(m, opcoes));
  return [...new Set(v)];
}

// ── 7.1 OS CENÁRIOS ────────────────────────────────────────────────────────────────────────────

const VAGA_A: VagaCrua = {
  idVacancy: 9001,
  reference: "1234567",
  job: "Cargo Sintetico",
  city: "Cidade Sintetica - SP",
  numberVacancies: 3,
};

const PASTAS_A: PastaCrua[] = [
  { idVacancyFolder: 71, name: "Triados" },
  { idVacancyFolder: 72, name: "Entrevista Inteligente" },
  { idVacancyFolder: 73, name: "" },
];

const DEPARA_SEMEADO: Record<string, LinhaDeParaEtapaExternaCrua> = {
  triados: { etapaCodigo: "TRIAGEM", situacao: null, motivoPadrao: null, ativo: true },
  "pre selecionados": {
    etapaCodigo: "ENTREVISTA_SOULAN",
    situacao: null,
    motivoPadrao: null,
    ativo: true,
  },
};

/** O item novo (depois do corte), o item de pasta sem tradução, o item vazio e o passivo antigo. */
function matchesDoCenarioBase(): MatchCru[] {
  return [
    criarMatch({ idCandidate: 111, idMatch: 900111, idVacancy: 9001, idVacancyFolder: 71, insertDate: "2026-09-10T10:00:00Z" }),
    criarMatch({ idCandidate: 222, idMatch: 900222, idVacancy: 9001, idVacancyFolder: 72, insertDate: "2026-09-09T10:00:00Z" }),
    criarMatch({ idCandidate: 555, idMatch: 900555, idVacancy: 9001, idVacancyFolder: 71, insertDate: "2026-09-07T10:00:00Z", cpf: null }),
    criarMatch({ idCandidate: 333, idMatch: 900333, idVacancy: 9001, idVacancyFolder: 73, insertDate: "2026-09-08T10:00:00Z" }),
    criarMatch({ idCandidate: 444, idMatch: 900444, idVacancy: 9001, idVacancyFolder: 71, insertDate: "2026-02-01T10:00:00Z" }),
  ];
}

/**
 * UMA VAGA QUE JÁ EXISTE COM O MESMO `reference`, e ela não é enfeite.
 *
 * MEDIDO: o `reference` tem 558 valores distintos em 587 vagas, ou seja ele REPETE. Sem esta linha
 * no mundo, casar a vaga pelo código devolveria a própria vaga espelhada e o mutante do casamento
 * errado ficaria VERDE, medindo nada.
 */
/**
 * UMA PESSOA QUE JÁ EXISTE COM O MESMO NOME, e ela é a ARMADILHA DO NOME.
 *
 * Sem ela, "casar por nome" não teria como dar errado no teste: não haveria homônimo com quem
 * casar, e o mutante ficaria verde medindo nada. Ela não tem CPF de propósito, que é o caso real em
 * que a tentação aparece (veio inscrição sem CPF, e o nome está ali, parecendo suficiente).
 */
const PESSOA_HOMONIMA = {
  id: "pessoa-homonima-que-nao-e-a-mesma",
  nome: `${SENTINELA.nome} ${SENTINELA.sobrenome}`,
  cpf: null,
  criado_em: "2025-01-01T00:00:00.000Z",
  atualizado_em: "2025-01-01T00:00:00.000Z",
};

const VAGA_HOMONIMA = {
  id: "vaga-que-ja-existia",
  id_vacancy_pandape: 8888,
  codigo: VAGA_A.reference,
  nome_divulgacao: "Outra Vaga Sintetica",
  criado_em: "2025-01-01T00:00:00.000Z",
  atualizado_em: "2025-01-01T00:00:00.000Z",
};

function mundoBase(over: Partial<EstadoDoMundo> = {}): Mundo {
  const { preexistentes, ...resto } = over;
  return criarMundo({
    vagas: [VAGA_A],
    pastas: { 9001: PASTAS_A },
    matches: { 9001: matchesDoCenarioBase() },
    dePara: DEPARA_SEMEADO,
    preexistentes: {
      vagas: [{ ...VAGA_HOMONIMA }],
      as_candidatos: [{ ...PESSOA_HOMONIMA }],
      ...(preexistentes ?? {}),
    },
    ...resto,
  });
}

function linhasDe(m: Mundo, t: string): Record<string, unknown>[] {
  return m.obs.linhas[t] ?? [];
}

function candidaturasDe(m: Mundo): Record<string, unknown>[] {
  return linhasDe(m, "as_candidaturas");
}

/**
 * O CENÁRIO QUE CARREGA A TRAVA DO DIARIO, a dedup, a etapa fail-closed e o corte.
 *
 * Ele roda DUAS VEZES sobre o MESMO mundo, que é a única forma de medir reentrega: a varredura dá
 * uma volta a cada 30 minutos, então "o segundo ciclo" não é hipótese, é o regime.
 */
async function cenarioBase(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m = mundoBase();
  mundos.push(m);

  const primeiro = await m.rodar(ingestor);
  const fotoDepoisDoPrimeiro = JSON.stringify(m.obs.linhas);
  const escritasAntes = m.obs.efetivas.length;

  const segundo = await m.rodar(ingestor, new Date("2026-09-18T12:30:00.000Z"));

  // ── A TRAVA DO DIARIO ────────────────────────────────────────────────────
  const efetivasNoSegundo = m.obs.efetivas
    .slice(escritasAntes)
    .filter((x) => x.linhasAfetadas > 0 && x.escrita.tabela === "as_candidatos");
  if (efetivasNoSegundo.length > 0) {
    v.push(
      "REENTREGA_IDENTICA_ESCREVE: o segundo ciclo, sobre o MESMO payload, ainda escreve em `as_candidatos`. O furo 1 de LGPD renasce pela porta do lado: o relógio do expurgo de quem não tem candidatura é `greatest(criado_em, atualizado_em)`, e uma volta a cada 30 minutos o empurra 48 vezes por dia, para sempre. A pessoa nunca expira. O upsert tem de ser CONDICIONAL, com a comparação campo a campo no SQL, e não um `if` em TypeScript.",
    );
  }

  const candidatos = linhasDe(m, "as_candidatos");
  // SÓ AS LINHAS QUE O CICLO CRIOU: as preexistentes do mundo têm carimbo antigo por construção, e
  // cobrá-las aqui reprovaria implementação correta pelo estado do cenário, que é ruído.
  const criadosPeloCiclo = candidatos.filter((c) => String(c.id).startsWith("linha-"));
  if (criadosPeloCiclo.some((c) => c.criado_em !== "2026-09-18T12:00:00.000Z")) {
    v.push(
      "CRIADO_EM_HISTORICO: o candidato nasceu com `criado_em` diferente do instante da coleta. Se a data do ATS entrar aí, a pessoa nasce com o prazo de 2 anos possivelmente JÁ VENCIDO e é anonimizada na varredura seguinte. É irreversível.",
    );
  }
  if (JSON.stringify(m.obs.linhas) !== fotoDepoisDoPrimeiro) {
    v.push(
      "CICLO_NAO_IDEMPOTENTE: rodar o mesmo payload duas vezes mudou o estado do banco. Com uma volta a cada 30 minutos, qualquer diferença aqui vira crescimento infinito de linha, de carimbo ou de histórico.",
    );
  }

  const identidades = linhasDe(m, "as_identidades_externas");
  if (identidades.some((i) => i.coletado_em !== "2026-09-18T12:00:00.000Z")) {
    v.push(
      "COLETADO_EM_NAO_EXPLICITO: `as_identidades_externas.coletado_em` não recebeu o instante REAL da coleta. Deixar o default do banco responder faz a linha jurar que o dado foi coletado no dia em que a carga rodou, e é esse carimbo que diz há quanto tempo o consentimento existe.",
    );
  }

  // ── DEDUP ───────────────────────────────────────────────────────────────
  /*
   * A CONTA: uma pessoa homônima já existia, e o mundo tem DUAS inscrições ingeríveis (a que traz
   * CPF e a que não traz), ambas de gente nova. Três linhas, então, e nem duas nem quatro: quatro é
   * a identidade ignorada duplicando a cada volta, duas é o nome sendo usado como chave.
   */
  if (candidatos.length !== 3) {
    v.push(
      `PESSOA_DUPLICADA: o mundo tem uma pessoa preexistente e duas inscrições novas, e o banco ficou com ${candidatos.length} pessoas em vez de 3. A chave é (PANDAPE, idCandidate): confundi-la com o idMatch (a INSCRIÇÃO) duplica gente a cada vaga em que a pessoa se inscreve, e ignorá-la duplica a cada volta da varredura, de 30 em 30 minutos.`,
    );
  }
  const donos = new Set(identidades.map((i) => String(i.candidato_id)));
  if (donos.size !== identidades.length) {
    v.push(
      "PESSOA_DUPLICADA: duas identidades externas diferentes apontam para a MESMA pessoa. Dois `idCandidate` distintos são duas pessoas para o Pandapé, e juntá-las aqui é fusão automática, que é irreversível.",
    );
  }
  for (const id of ["111", "555"]) {
    const ident = identidades.find((i) => String(i.identificador) === id);
    if (ident && String(ident.candidato_id) === PESSOA_HOMONIMA.id) {
      v.push(
        "CASOU_POR_NOME: a inscrição foi anexada a uma pessoa que já existia SÓ porque o nome bate. Nome é chave fraca, e o veto está no schema: dois homônimos viram uma pessoa só, com o histórico de seleção de duas, e a fusão não se desfaz porque ninguém sabe mais qual candidatura era de quem. A inscrição sem CPF cria pessoa NOVA, e é isso mesmo.",
      );
    }
  }
  const identificadores = identidades.map((i) => String(i.identificador));
  if (new Set(identificadores).size !== identificadores.length) {
    v.push(
      "PESSOA_DUPLICADA: há identificador externo repetido. O `unique (fonte, identificador)` existe justamente para isto, e o ciclo não pode depender de o banco recusar a escrita para estar correto.",
    );
  }
  if (identidades.some((i) => !ehFonteExterna(String(i.fonte)))) {
    v.push(
      "FONTE_FORA_DO_VOCABULARIO: a identidade foi gravada com uma fonte que não está na lista fechada `FONTES_EXTERNAS`. `PANDAPE`, `Pandape` e `pandape` viram três origens do mesmo sistema, cada uma com o seu unique próprio, e a mesma pessoa duplica sem que nada falhe.",
    );
  }

  // ── A ETAPA, FAIL-CLOSED ────────────────────────────────────────────────
  const etapas = candidaturasDe(m).map((k) => String(k.etapa));
  if (etapas.some((e) => e !== "TRIAGEM")) {
    v.push(
      "ETAPA_CHUTADA: entrou candidatura que não deveria entrar, ou entrou com a etapa errada. Só a inscrição da pasta COM de/para pode virar candidatura. Medido: 35% das inscrições estão hoje em pasta sem tradução, e escrever `CAPTACAO` nelas grava no histórico de uma PESSOA um movimento que ninguém fez, contaminando o funil inteiro sem ninguém descobrir.",
    );
  }
  if (etapas.length === 0) {
    v.push(
      "ETAPA_MAPEADA_NAO_INGERIDA: a inscrição que ESTÁ na pasta traduzida também não entrou. Fail-closed que recusa tudo não é fail-closed, é ingestão desligada: o ciclo passa a custar 660 requisições por volta para não escrever nada.",
    );
  }
  /*
   * ┌─ A REGRA MUDOU DEPOIS DO ACHADO R1 DO `seguranca`, E MUDOU PARA MAIS ESTRITA ───────────────┐
   * │ ELA EXIGIA A CHAVE CRUA no resumo, e o resumo termina em log PERMANENTE (a varredura escreve│
   * │ a lista a cada passada). Nome de pasta é TEXTO LIVRE digitado no ATS: "Reservados Fulano de │
   * │ Tal" punha nome de candidato num log fora do alcance do `aplicarRetencao`. A exigência agora │
   * │ é a MARCA da chave (`marcaDeChaveExterna`), que é estável e não carrega o texto.             │
   * │                                                                                             │
   * │ AS DUAS METADES CONTINUAM MEDIDAS, e é por isso que são duas conferências: o registro TEM de│
   * │ existir (senão a recusa fail-closed vira perda silenciosa de 35% da entrada) e ele NÃO pode  │
   * │ ser o texto cru. Trocar uma pela outra reabriria um dos dois defeitos.                       │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const naoMapeadas = new Set(primeiro.etapasNaoMapeadas.concat(segundo.etapasNaoMapeadas));
  if ([...naoMapeadas].some((k) => k.includes("entrevista"))) {
    v.push(
      "CHAVE_CRUA_NO_RESUMO: o resumo do ciclo carrega o NOME da pasta do ATS, e ele termina no log da aplicação, que é permanente e está fora do alcance do `aplicarRetencao`. Nome de pasta é texto livre digitado lá fora e chega com nome de gente dentro. O que pode sair daqui é a MARCA da chave.",
    );
  }
  if (!naoMapeadas.has(marcaDeChaveExterna("entrevista inteligente"))) {
    v.push(
      "ETAPA_NAO_MAPEADA_NAO_REGISTRADA: a pasta sem de/para não foi registrada no resumo do ciclo, pela MARCA dela. Recusar a inscrição sem registrar nada deixa quem opera sem saber que há configuração faltando, e a recusa vira perda silenciosa de 35% da entrada.",
    );
  }
  if (linhasDe(m, "as_depara_etapa_externa").length > 0) {
    v.push(
      "DEPARA_CRIADO_PELO_CICLO: o ciclo criou linha de de/para sozinho, copiando o nome que a API devolveu. `rotulo_externo` e `motivo_padrao` são CONFIGURAÇÃO REVISADA: o valor acaba dentro da candidatura de uma pessoa, e um duto automático do ATS para cá leva texto de terceiro para dentro da base sem ninguém ler o que passa.",
    );
  }

  // ── SÓ OS NOVOS ─────────────────────────────────────────────────────────
  if (identificadores.includes("444")) {
    v.push(
      "PASSIVO_INGERIDO: entrou inscrição anterior à data de corte. São 137.654 inscrições vivas nas vagas ativas, e o passivo antigo não é 'só um pouco mais de dado': é gente que nunca falou com a Soulan entrando numa base cujo relógio de retenção já está correndo.",
    );
  }

  // ── A VAGA ESPELHADA ────────────────────────────────────────────────────
  const vagas = linhasDe(m, "vagas");
  const espelhadas = vagas.filter((x) => x.id_vacancy_pandape === VAGA_A.idVacancy);
  if (espelhadas.length !== 1) {
    v.push(
      "VAGA_DUPLICADA: a vaga espelhada não é única por `id_vacancy_pandape`. A volta seguinte chega em 30 minutos, e a tela da Central de Vagas passa a contar a mesma vaga várias vezes.",
    );
  }
  if (espelhadas.some((x) => x.cod_cliente !== null && x.cod_cliente !== undefined)) {
    v.push(
      "COD_CLIENTE_INVENTADO: a vaga entrou com `cod_cliente` preenchido, e não existe caminho de API para o cliente da vaga (medido: `clients/requests` devolve zero itens, e `idCompanyExternal` é o id da Soulan). A coluna é nulável DE PROPÓSITO: a vaga entra marcada para vínculo manual, e inventar cliente é proibido (§A.5).",
    );
  }
  const idDaEspelhada = espelhadas.length === 1 ? espelhadas[0].id : null;
  if (candidaturasDe(m).some((k) => k.vaga_id !== idDaEspelhada)) {
    v.push(
      "VAGA_NAO_CASADA_PELO_ID: a candidatura aponta para vaga que não é a espelhada por `id_vacancy_pandape`. Casar por código ou por nome de divulgação junta vagas diferentes: o `reference` tem 558 valores distintos em 587 vagas, ou seja ele REPETE.",
    );
  }
  return v;
}

/** CPF que já existe sem identidade: anexa a identidade à pessoa, não cria uma segunda. */
async function cenarioDesempatePorCpf(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m = mundoBase({
    preexistentes: {
      as_candidatos: [
        { ...PESSOA_HOMONIMA },
        {
          id: "pessoa-que-ja-existe",
          nome: `${SENTINELA.nome} ${SENTINELA.sobrenome}`,
          cpf: SENTINELA.cpf,
          email: SENTINELA.email,
          telefone: SENTINELA.telefone,
          data_nascimento: "1990-01-01",
          cidade: "Cidade Sintetica",
          uf: "SP",
          criado_em: "2025-01-01T00:00:00.000Z",
          atualizado_em: "2025-01-01T00:00:00.000Z",
        },
      ],
    },
  });
  mundos.push(m);
  await m.rodar(ingestor);

  const candidatos = linhasDe(m, "as_candidatos");
  const identidade = linhasDe(m, "as_identidades_externas").find(
    (i) => String(i.identificador) === "111",
  );
  if (candidatos.filter((c) => c.cpf === SENTINELA.cpf).length !== 1) {
    v.push(
      "CPF_NAO_DESEMPATA: veio CPF que já existe na base e o ciclo criou uma SEGUNDA pessoa com o mesmo CPF. O CPF é o desempate secundário quando não há identidade `(PANDAPE, idCandidate)`, e ignorá-lo parte a mesma pessoa em duas fichas, cada uma com o seu histórico e o seu relógio de retenção.",
    );
  }
  if (identidade && String(identidade.candidato_id) !== "pessoa-que-ja-existe") {
    v.push(
      "CPF_NAO_DESEMPATA: a identidade nova não foi anexada à pessoa que já existia. Ela ficou pendurada em outra ficha, e a partir daí as duas divergem em silêncio.",
    );
  }
  const relogio = candidatos.find((c) => c.id === "pessoa-que-ja-existe");
  if (relogio && relogio.atualizado_em !== "2025-01-01T00:00:00.000Z") {
    v.push(
      "REENTREGA_IDENTICA_ESCREVE: anexar a identidade mexeu no `atualizado_em` de uma pessoa cujos dados não mudaram. É o relógio do expurgo andando de graça, que é o furo 1 de volta.",
    );
  }
  return v;
}

/** Identidade aponta para uma pessoa, CPF aponta para outra. O ciclo NÃO escolhe. */
async function cenarioConflito(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m = mundoBase({
    preexistentes: {
      as_candidatos: [
        { id: "pessoa-a", nome: "Pessoa Sintetica A", cpf: "cpf-sintetico-de-outra-pessoa", criado_em: "2025-01-01T00:00:00.000Z", atualizado_em: "2025-01-01T00:00:00.000Z" },
        { id: "pessoa-b", nome: "Pessoa Sintetica B", cpf: SENTINELA.cpf, criado_em: "2025-01-01T00:00:00.000Z", atualizado_em: "2025-01-01T00:00:00.000Z" },
      ],
      as_identidades_externas: [
        { id: "ident-a", fonte: "PANDAPE", identificador: "111", candidato_id: "pessoa-a", coletado_em: "2025-01-01T00:00:00.000Z" },
      ],
    },
  });
  mundos.push(m);
  const resumo = await m.rodar(ingestor);

  const a = linhasDe(m, "as_candidatos").find((c) => c.id === "pessoa-a");
  const b = linhasDe(m, "as_candidatos").find((c) => c.id === "pessoa-b");
  if (!a || !b) {
    v.push(
      "CONFLITO_DECIDIDO_SOZINHO: uma das duas pessoas sumiu. Fusão automática de duas fichas é IRREVERSÍVEL: o que se junta por engano não se separa depois, porque ninguém sabe mais qual candidatura era de quem.",
    );
  }
  if (a && a.cpf === SENTINELA.cpf) {
    v.push(
      "CONFLITO_DECIDIDO_SOZINHO: o ciclo escreveu o CPF do conflito na pessoa da identidade. Ele escolheu um dos dois lados em silêncio, e o erro só aparece quando alguém abrir a ficha e não reconhecer a pessoa.",
    );
  }
  if (resumo.conflitosParaRevisao < 1) {
    v.push(
      "CONFLITO_NAO_REGISTRADO: o conflito não foi para revisão humana. Não escolher está certo; não escolher E não avisar é perder a inscrição toda volta, em silêncio, para sempre.",
    );
  }
  return v;
}

/** Mudou de verdade, tem de escrever. Sem isto, "nunca escrever" passaria pelo contrato. */
async function cenarioMudancaDeVerdade(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m = mundoBase();
  mundos.push(m);
  await m.rodar(ingestor);

  const antes = linhasDe(m, "as_candidatos").find((c) => c.cpf === SENTINELA.cpf);
  const idDaPessoa = antes ? antes.id : null;
  const marcaAntes = m.obs.efetivas.length;

  // O telefone muda no ATS. Este é o caso em que a escrita É devida.
  const m2 = m;
  const estadoNovo = criarMatch({
    idCandidate: 111,
    idMatch: 900111,
    idVacancy: 9001,
    idVacancyFolder: 71,
    insertDate: "2026-09-10T10:00:00Z",
    phone: "telefone-sintetico-bbbb",
  });
  // Substitui o item no mundo, mantendo o estado do banco.
  await trocarMatch(m2, 9001, 900111, estadoNovo);
  await m2.rodar(ingestor, new Date("2026-09-18T13:00:00.000Z"));

  const depois = linhasDe(m2, "as_candidatos").find((c) => c.id === idDaPessoa);
  const houveEscrita = m2.obs.efetivas
    .slice(marcaAntes)
    .some((x) => x.linhasAfetadas > 0 && x.escrita.tabela === "as_candidatos");
  if (!houveEscrita || !depois || depois.telefone !== "telefone-sintetico-bbbb") {
    v.push(
      "REENTREGA_QUE_MUDA_NAO_ESCREVE: o telefone mudou no ATS e a ficha não mudou. A trava da reentrega idêntica não pode virar `nunca escreve`: o dado que muda de verdade tem de chegar, senão a ingestão é um relógio parado que também está certo duas vezes por dia.",
    );
  }
  return v;
}

async function trocarMatch(m: Mundo, idVacancy: number, idMatch: number, novo: MatchCru): Promise<void> {
  const estado = MUNDOS_E_ESTADOS.get(m);
  if (!estado) return;
  const lista = estado.matches[idVacancy] ?? [];
  const i = lista.findIndex((x) => x.idMatch === idMatch);
  if (i >= 0) lista[i] = novo;
}

/** O corte não pode depender da hora em que a varredura foi ligada. */
async function cenarioCorteDeterministico(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m1 = mundoBase();
  const m2 = mundoBase();
  mundos.push(m1, m2);
  await m1.rodar(ingestor, new Date("2026-09-18T12:00:00.000Z"));
  await m2.rodar(ingestor, new Date("2026-12-18T12:00:00.000Z"));

  const ids = (m: Mundo): string =>
    linhasDe(m, "as_identidades_externas")
      .map((i) => String(i.identificador))
      .sort()
      .join(",");
  if (ids(m1) !== ids(m2)) {
    v.push(
      "CORTE_NAO_DETERMINISTICO: rodar o MESMO payload em dois momentos ingeriu conjuntos diferentes. O corte é uma data FIXA de configuração, nunca `agora menos alguma coisa`: da segunda forma, duas vagas varridas com dez minutos de diferença têm cortes diferentes, e religar a varredura muda o que entra sem ninguém decidir isso.",
    );
  }
  return v;
}

/** O caminho de ERRO, que é onde o CPF vaza sem ninguém perceber. */
async function cenarioErroDoDriver(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m = mundoBase({ falharAoEscreverEm: "as_candidatos" });
  mundos.push(m);
  try {
    await m.rodar(ingestor);
  } catch {
    v.push(
      "CICLO_MORRE_NO_PRIMEIRO_ERRO: uma falha de escrita de UMA pessoa derrubou a volta inteira. A volta leva 26 minutos e cobre 621 vagas: uma linha ruim não pode impedir as outras 137 mil.",
    );
  }
  return v;
}

/** A grafia diferente TEM de mapear, senão o fail-closed vira recusa de tudo. */
async function cenarioGrafiaDiferente(ingestor: Ingestor, mundos: Mundo[]): Promise<string[]> {
  const v: string[] = [];
  const m = criarMundo({
    vagas: [VAGA_A],
    pastas: { 9001: [{ idVacancyFolder: 71, name: "Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)" }] },
    matches: {
      9001: [
        criarMatch({ idCandidate: 555, idMatch: 900555, idVacancy: 9001, idVacancyFolder: 71, insertDate: "2026-09-10T10:00:00Z" }),
      ],
    },
    dePara: DEPARA_SEMEADO,
  });
  mundos.push(m);
  await m.rodar(ingestor);
  const k = candidaturasDe(m);
  if (k.length !== 1 || k[0].etapa !== "ENTREVISTA_SOULAN") {
    v.push(
      "ETAPA_NAO_NORMALIZADA: a pasta escrita com acento, caixa irregular e instrução entre parênteses não casou com o de/para semeado. Os nomes de pasta são TEXTO LIVRE de quem abriu a vaga: casar por igualdade crua faz a tradução funcionar numa vaga e falhar na vaga do lado, e o sintoma aparece meses depois como `a etapa da pessoa parou de andar`.",
    );
  }
  return v;
}

// ── 7.2 AS REGRAS GLOBAIS, cobradas sobre TODOS os cenários ────────────────────────────────────

function regrasGlobais(m: Mundo, opcoes: OpcoesDaAuditoria): string[] {
  const v: string[] = [];

  // ── GET APENAS ──────────────────────────────────────────────────────────
  for (const r of m.obs.requisicoes) {
    if (r.metodo.toUpperCase() !== "GET") {
      v.push(
        `VERBO_QUE_ESCREVE: a ingestão emitiu ${r.metodo.toUpperCase()} em \`${r.caminho}\`. A API tem \`POST /v1/Match/UpdateFolder\` e \`PATCH /v2/matches/{id}/update\`, que MOVEM CANDIDATO no funil de um ATS de terceiro. Escrever lá altera o trabalho de quem opera a vaga, não é desfazível por nós, e nada do nosso lado falha quando acontece. Esta frente é GET apenas, e a trava é de código, não de disciplina.`,
      );
    }
    if (/updatefolder|\/update\b/i.test(r.caminho)) {
      v.push(
        `CAMINHO_DE_ESCRITA: a ingestão chamou \`${r.caminho}\`, que é endpoint de ESCRITA no Pandapé. O verbo certo num caminho que escreve continua sendo escrita: o que está proibido é o efeito, e não a letra do método.`,
      );
    }
  }

  // ── A TRAVA DOS CARIMBOS: as colunas não podem nem ser CITADAS ──────────
  for (const e of m.obs.escritas) {
    if (e.tabela !== "as_candidatos") continue;
    if ("atualizado_em" in e.valores) {
      v.push(
        "INGESTOR_CITA_ATUALIZADO_EM: a escrita em `as_candidatos` lista `atualizado_em`. A coluna tem default e NÃO tem `$onUpdate`, então basta não citá-la: citar é escolher empurrar o relógio do expurgo a cada volta, 48 vezes por dia, e a pessoa sem candidatura nunca mais expira.",
      );
    }
    if ("criado_em" in e.valores) {
      v.push(
        "INGESTOR_CITA_CRIADO_EM: a escrita em `as_candidatos` lista `criado_em`. Escrever a data em que a pessoa se inscreveu no ATS (que na amostra chega a 2026-02, e em vaga antiga é muito anterior) faz ela nascer com o prazo de 2 anos possivelmente JÁ VENCIDO, e a varredura seguinte a anonimiza. Irreversível.",
      );
    }
    if ("banco_talentos" in e.valores) {
      v.push(
        "BANCO_TALENTOS_ESCRITO: o ingestor escreveu `as_candidatos.banco_talentos`. O schema já o proíbe com todas as letras: a ingestão insere SEM usuário autor, e o único escritor daquela coluna é `aplicarRetencao`, com cadeado de SUPER_ADMIN. Uma ingestão que marca banco de talentos concede retenção estendida a 137 mil pessoas sem ninguém decidir isso.",
      );
    }
  }

  // ── §A.6: A PROJEÇÃO EXPLÍCITA ──────────────────────────────────────────
  for (const e of m.obs.escritas) {
    const permitidas = COLUNAS_PERMITIDAS[e.tabela];
    if (!permitidas) continue;
    const extras = Object.keys(e.valores).filter(
      (c) => !permitidas.includes(c) && c !== "criado_em" && c !== "atualizado_em" && c !== "banco_talentos",
    );
    if (extras.length > 0) {
      v.push(
        `PROJECAO_NAO_EXPLICITA: a escrita em \`${e.tabela}\` levou colunas fora da projeção (${extras.join(", ")}). \`/v2/matches\` devolve o currículo inteiro, 58 campos, e o gesto natural de quem liga integração é salvar o objeto que veio. É assim que endereço, latitude, salário pretendido e o resumo de 137 mil pessoas entram numa base de recrutamento sem ninguém decidir isso. A projeção é uma LISTA DO QUE PODE, declarada campo a campo.`,
      );
    }
    for (const coluna of Object.keys(e.valores)) {
      if (!ehColunaDeTextoLivre(coluna)) continue;
      if (!opcoes.sqlDoExpurgo) continue;
      const tabelaDoExpurgo = e.tabela;
      if (!expurgoAlcanca(opcoes.sqlDoExpurgo, tabelaDoExpurgo, coluna)) {
        v.push(
          `TEXTO_LIVRE_FORA_DO_EXPURGO: a ingestão grava texto livre em \`${tabelaDoExpurgo}.${coluna}\`, e a varredura de retenção NÃO alcança essa coluna. O DIARIO já registra como terceiro furo que texto livre sobrevive à anonimização; despejar currículo aqui multiplica aquele furo por 137 mil, e a varredura nunca volta a uma linha carimbada para consertar.`,
        );
      }
    }
  }

  // ── §A.6: O SENSÍVEL NÃO CHEGA A LUGAR NENHUM ──────────────────────────
  const proibidas = SENTINELAS_PROIBIDAS_EM_TODO_LUGAR;
  const sinks: { nome: string; valor: unknown; tambemPessoal: boolean }[] = [
    { nome: "no banco", valor: m.obs.escritas.map((e) => e.valores), tambemPessoal: false },
    { nome: "no payload de job da fila", valor: m.obs.jobs, tambemPessoal: true },
    { nome: "no log", valor: m.obs.logs, tambemPessoal: true },
  ];
  for (const s of sinks) {
    const achados = acharSentinelas(s.valor, [
      ...proibidas,
      ...(s.tambemPessoal ? SENTINELAS_PESSOAIS : []),
    ]);
    const sensiveis = achados.filter(
      (a) => a.startsWith("campo:") || proibidas.includes(a),
    );
    if (sensiveis.length > 0) {
      v.push(
        `SENSIVEL_VAZOU: dado do art. 11 ou texto livre de curriculo apareceu ${s.nome} (${sensiveis.join(", ")}). Os quatro campos do art. 11 (idRace, idSexualOrientation, idGenderIdentity, deficiencies) e o texto livre do curriculo (summary, experiences, studies) nao podem chegar a banco, log, payload de job nem mensagem de erro. O payload do job vive no Redis e SOBREVIVE ao job: e banco de dados com outro nome.`,
      );
    }
    const pessoais = achados.filter((a) => SENTINELAS_PESSOAIS.includes(a));
    if (s.tambemPessoal && pessoais.length > 0) {
      v.push(
        `PII_EM_LOG: CPF, nome, e-mail ou telefone apareceu ${s.nome}. O caminho de ERRO é o mais provável, e é o menos vigiado: o objeto de erro do driver carrega o \`detail\` com o valor que violou a restrição e a \`query\` com os parâmetros, então \`log.erro(e)\` publica o CPF sem ninguém escrever a palavra CPF em lugar nenhum. O log do ciclo conta vaga, página e contagem, e mais nada.`,
      );
    }
  }
  return v;
}

// ── 8. A REFERÊNCIA SABIDAMENTE CORRETA, E OS MUTANTES ─────────────────────────────────────────

export type Defeito =
  | "CITA_ATUALIZADO_EM"
  | "CITA_CRIADO_EM_HISTORICO"
  | "UPSERT_INCONDICIONAL"
  | "NUNCA_ESCREVE"
  | "COLETADO_EM_PELO_DEFAULT"
  | "IGNORA_A_IDENTIDADE"
  | "CASA_POR_NOME"
  | "IGNORA_O_CPF"
  | "FUNDE_O_CONFLITO"
  | "DESCARTA_O_CONFLITO_EM_SILENCIO"
  | "ETAPA_INICIAL_QUANDO_NAO_MAPEIA"
  | "CRIA_DEPARA_SOZINHO"
  | "NAO_REGISTRA_A_CHAVE"
  | "REGISTRA_A_CHAVE_CRUA"
  | "FONTE_COM_OUTRA_GRAFIA"
  | "CHAVE_CRUA_SEM_NORMALIZAR"
  | "GRAVA_O_ITEM_INTEIRO"
  | "GUARDA_O_RESUMO_DO_CURRICULO"
  | "ENFILEIRA_O_ITEM_CRU"
  | "LOGA_O_NOME"
  | "LOGA_O_ERRO_CRU"
  | "MARCA_BANCO_DE_TALENTOS"
  | "INGERE_O_PASSIVO"
  | "CORTE_PELO_AGORA"
  | "PARA_NA_MARCA_DE_AGUA"
  | "DUPLICA_A_VAGA"
  | "INVENTA_COD_CLIENTE"
  | "CASA_VAGA_PELO_CODIGO"
  | "PATCH_DE_ETAPA"
  | "MOVE_A_PASTA";

const COLUNAS_DO_CANDIDATO = ["nome", "cpf", "email", "telefone", "data_nascimento", "cidade", "uf"];

/**
 * A PROJEÇÃO, EXPLÍCITA: os nove campos da seção 7 do plano, e mais nada.
 *
 * O resto do item (58 campos) morre no escopo desta função. É deliberado que ela devolva um objeto
 * NOVO: devolver o mesmo objeto com campos ignorados deixaria o currículo inteiro vivo na memória
 * do processo, pronto para ser logado por quem escrever `log.info('item', item)` meses depois.
 */
function projetar(item: MatchCru): Record<string, unknown> {
  return {
    idCandidate: item.idCandidate,
    name: item.name,
    surname: item.surname,
    cpf: item.cpf,
    email: item.email,
    phone: item.phone,
    birthDate: item.birthDate,
    location3: item.location3,
    location2: item.location2,
    idVacancy: item.idVacancy,
    idVacancyFolder: item.idVacancyFolder,
    insertDate: item.insertDate,
  };
}

export function criarIngestorDeReferencia(defeito: Defeito | null = null): Ingestor {
  const com = (d: Defeito): boolean => defeito === d;

  return async (deps: DependenciasDaIngestao): Promise<ResumoDoCiclo> => {
    const resumo: ResumoDoCiclo = {
      vagasVarridas: 0,
      paginasLidas: 0,
      pessoasCriadas: 0,
      candidaturasCriadas: 0,
      etapasNaoMapeadas: [],
      conflitosParaRevisao: 0,
      erros: 0,
    };

    const lista = (await deps.http.requisitar("GET", "/v2/vacancies", {
      VacancyStatus: 2,
      Page: 1,
      PageSize: 1000,
    })) as { data: VagaCrua[] };

    for (const vaga of lista.data) {
      resumo.vagasVarridas += 1;

      // ── A VAGA ESPELHADA ────────────────────────────────────────────────
      const codCliente = com("INVENTA_COD_CLIENTE")
        ? "SOULAN"
        : await deps.banco.clientePorVaga(vaga.idVacancy);
      const valoresDaVaga = {
        id_vacancy_pandape: vaga.idVacancy,
        codigo: vaga.reference,
        nome_divulgacao: vaga.job,
        cidade_id: vaga.city,
        posicoes_oficiais: vaga.numberVacancies,
        cod_cliente: codCliente,
        cargo_id: null,
        status: "RASCUNHO",
      };
      const gravadaVaga = await deps.banco.escrever(
        com("DUPLICA_A_VAGA")
          ? { tabela: "vagas", acao: "insert", valores: valoresDaVaga }
          : {
              tabela: "vagas",
              acao: "upsert",
              chaveDeConflito: ["id_vacancy_pandape"],
              comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
              valores: valoresDaVaga,
            },
      );
      const achada = com("CASA_VAGA_PELO_CODIGO")
        ? await deps.banco.vagaPorCodigo(vaga.reference)
        : await deps.banco.vagaPorIdPandape(vaga.idVacancy);
      const vagaId = achada ? achada.id : gravadaVaga.id;

      // ── AS PASTAS, UMA VEZ POR VAGA, CACHEADAS ──────────────────────────
      const pastas = (await deps.http.requisitar("GET", "/v2/vacancy-folders", {
        idVacancy: vaga.idVacancy,
      })) as { data: PastaCrua[] };
      const nomeDaPasta = new Map<number, string>(
        pastas.data.map((p) => [p.idVacancyFolder, p.name]),
      );

      if (com("MOVE_A_PASTA")) {
        await deps.http.requisitar("GET", "/v1/Match/UpdateFolder", { idVacancy: vaga.idVacancy });
      }

      // ── O CORTE ─────────────────────────────────────────────────────────
      /*
       * ─ O CORTE E A DATA FIXA, E A MARCA DE ÁGUA NÃO PULA LEITURA ────────────────────────────
       *
       * O plano tem as duas coisas escritas, e elas parecem uma: a marca de água (seção 6, item 2)
       * pararia de paginar no que já foi ingerido, e a ressalva logo abaixo desfaz isso, porque
       * MOVER ALGUÉM DE PASTA NÃO ALTERA O `insertDate`. A conta do próprio plano fecha a favor de
       * ler tudo: a volta completa custa 660 requisições e a incremental 622, ou seja 6% de
       * diferença, e "só os novos" vira otimização de ESCRITA, não de leitura.
       *
       * QUEM PULAR A LEITURA PELA MARCA NUNCA MAIS VÊ MUDANÇA NENHUMA daquela inscrição: nem a
       * troca de etapa, nem o telefone corrigido. O mutante `PARA_NA_MARCA_DE_AGUA` é exatamente
       * esse caminho, e ele existe porque é o mais fácil de escrever lendo a seção 6 pela metade.
       */
      const marcaGravada = await deps.banco.marcaDaVaga(vaga.idVacancy);
      const corteBase = com("CORTE_PELO_AGORA")
        ? new Date(deps.agora().getTime() - 90 * 24 * 3600 * 1000).toISOString()
        : deps.dataDeCorte.toISOString();
      const corte = com("INGERE_O_PASSIVO")
        ? "1970-01-01T00:00:00.000Z"
        : com("PARA_NA_MARCA_DE_AGUA") && marcaGravada && marcaGravada > corteBase
          ? marcaGravada
          : corteBase;

      let pagina = 1;
      let maiorInsert = marcaGravada ?? corteBase;
      let acabou = false;
      while (!acabou && pagina <= 20) {
        const resposta = (await deps.http.requisitar("GET", "/v2/matches", {
          IdVacancy: vaga.idVacancy,
          Page: pagina,
          PageSize: 200,
        })) as { data: MatchCru[] };
        resumo.paginasLidas += 1;
        if (resposta.data.length === 0) break;

        for (const item of resposta.data) {
          const p = projetar(item);
          const insertDate = String(p.insertDate);
          if (insertDate <= corte) {
            acabou = true;
            continue;
          }
          if (insertDate > maiorInsert) maiorInsert = insertDate;
          try {
            await ingerirUm(deps, resumo, p, item, vagaId, nomeDaPasta, com);
          } catch (e) {
            resumo.erros += 1;
            if (com("LOGA_O_ERRO_CRU")) {
              deps.log.erro("falha ao ingerir a inscricao", { erro: e });
            } else {
              deps.log.erro("falha ao ingerir a inscricao", {
                vaga: vaga.idVacancy,
                codigo: (e as { code?: string }).code ?? "desconhecido",
              });
            }
          }
        }
        pagina += 1;
      }

      await deps.banco.escrever({
        tabela: "as_varredura_vagas",
        acao: "upsert",
        chaveDeConflito: ["id_vacancy_pandape"],
        comparaAntes: ["ultimo_insert_date"],
        valores: { id_vacancy_pandape: vaga.idVacancy, ultimo_insert_date: maiorInsert },
      });
      deps.log.info("vaga varrida", { vaga: vaga.idVacancy, paginas: pagina - 1 });
    }
    return resumo;
  };
}

/** Uma inscrição: etapa primeiro (fail-closed), pessoa depois, candidatura por último. */
async function ingerirUm(
  deps: DependenciasDaIngestao,
  resumo: ResumoDoCiclo,
  p: Record<string, unknown>,
  itemCru: MatchCru,
  vagaId: string,
  nomeDaPasta: Map<number, string>,
  com: (d: Defeito) => boolean,
): Promise<void> {
  // ── A ETAPA, E ELA DECIDE SE A INSCRIÇÃO ENTRA ─────────────────────────
  const nomeCru = nomeDaPasta.get(Number(p.idVacancyFolder)) ?? "";
  const chave = com("CHAVE_CRUA_SEM_NORMALIZAR") ? nomeCru : normalizarChaveExterna(nomeCru);
  const linha = chave === "" ? null : await deps.banco.deParaEtapa(chave);
  const resolucao = lerLinhaDePara(linha);
  if (!resolucao.mapeada) {
    if (!com("NAO_REGISTRA_A_CHAVE") && chave !== "") {
      // A MARCA, nunca a chave: o resumo termina em log permanente (achado R1 do `seguranca`).
      resumo.etapasNaoMapeadas.push(
        com("REGISTRA_A_CHAVE_CRUA") ? chave : marcaDeChaveExterna(chave),
      );
    }
    if (com("CRIA_DEPARA_SOZINHO")) {
      await deps.banco.escrever({
        tabela: "as_depara_etapa_externa",
        acao: "insert",
        valores: { fonte: "PANDAPE", chave, rotulo_externo: nomeCru, etapa_codigo: "CAPTACAO" },
      });
    }
    if (!com("ETAPA_INICIAL_QUANDO_NAO_MAPEIA")) return;
  }
  const etapa = resolucao.mapeada && resolucao.etapaCodigo ? resolucao.etapaCodigo : "CAPTACAO";
  const situacao = (resolucao.mapeada && resolucao.situacao) || "ATIVO";
  const motivo = (resolucao.mapeada && resolucao.motivoPadrao) || null;

  // ── A PESSOA ────────────────────────────────────────────────────────────
  const fonte = com("FONTE_COM_OUTRA_GRAFIA") ? "Pandape" : "PANDAPE";
  const identificador = String(p.idCandidate);
  const nome = `${String(p.name)} ${String(p.surname)}`.trim();
  const valoresDoCandidato: Record<string, unknown> = {
    nome,
    cpf: p.cpf,
    email: p.email,
    telefone: p.phone,
    data_nascimento: p.birthDate,
    cidade: p.location3,
    uf: p.location2,
  };
  if (com("GRAVA_O_ITEM_INTEIRO")) Object.assign(valoresDoCandidato, itemCru);
  if (com("GUARDA_O_RESUMO_DO_CURRICULO")) valoresDoCandidato.resumo_curriculo = itemCru.summary;
  if (com("CITA_ATUALIZADO_EM")) valoresDoCandidato.atualizado_em = deps.agora().toISOString();
  if (com("CITA_CRIADO_EM_HISTORICO")) valoresDoCandidato.criado_em = String(p.insertDate);
  if (com("MARCA_BANCO_DE_TALENTOS")) valoresDoCandidato.banco_talentos = true;

  const porIdentidade = com("IGNORA_A_IDENTIDADE")
    ? null
    : await deps.banco.identidadeExterna(fonte, identificador);
  const porNome = com("CASA_POR_NOME") ? await deps.banco.candidatoPorNome(nome) : null;
  const porCpf = com("IGNORA_O_CPF") ? null : await deps.banco.candidatoPorCpf(String(p.cpf));

  let candidatoId: string;
  if (porIdentidade) {
    // CONFLITO: a identidade aponta para uma pessoa e o CPF para outra.
    if (porCpf && porCpf.id !== porIdentidade.candidatoId) {
      if (com("FUNDE_O_CONFLITO")) {
        await deps.banco.escrever({
          tabela: "as_candidatos",
          acao: "update",
          onde: { id: porIdentidade.candidatoId },
          comparaAntes: COLUNAS_DO_CANDIDATO,
          valores: valoresDoCandidato,
        });
        return;
      }
      if (!com("DESCARTA_O_CONFLITO_EM_SILENCIO")) resumo.conflitosParaRevisao += 1;
      return;
    }
    candidatoId = porIdentidade.candidatoId;
    if (com("NUNCA_ESCREVE")) return;
    await deps.banco.escrever({
      tabela: "as_candidatos",
      acao: "update",
      onde: { id: candidatoId },
      comparaAntes: com("UPSERT_INCONDICIONAL") ? undefined : COLUNAS_DO_CANDIDATO,
      valores: valoresDoCandidato,
    });
  } else {
    const existente = porNome ?? porCpf;
    if (existente) {
      candidatoId = existente.id;
      await deps.banco.escrever({
        tabela: "as_candidatos",
        acao: "update",
        onde: { id: candidatoId },
        comparaAntes: com("UPSERT_INCONDICIONAL") ? undefined : COLUNAS_DO_CANDIDATO,
        valores: valoresDoCandidato,
      });
    } else {
      const nova = await deps.banco.escrever({
        tabela: "as_candidatos",
        acao: "insert",
        valores: valoresDoCandidato,
      });
      candidatoId = nova.id;
      resumo.pessoasCriadas += 1;
    }
    await deps.banco.escrever({
      tabela: "as_identidades_externas",
      acao: "upsert",
      chaveDeConflito: ["fonte", "identificador"],
      aoConflitoNadaFaz: true,
      valores: {
        fonte,
        identificador,
        candidato_id: candidatoId,
        ...(com("COLETADO_EM_PELO_DEFAULT") ? {} : { coletado_em: deps.agora().toISOString() }),
      },
    });
  }

  // ── A CANDIDATURA ───────────────────────────────────────────────────────
  const gravada = await deps.banco.escrever({
    tabela: "as_candidaturas",
    acao: "upsert",
    chaveDeConflito: ["candidato_id", "vaga_id"],
    comparaAntes: ["etapa", "situacao", "motivo_descarte"],
    valores: {
      candidato_id: candidatoId,
      vaga_id: vagaId,
      etapa,
      situacao,
      motivo_descarte: motivo,
      fonte,
    },
  });
  if (gravada.linhasAfetadas > 0) resumo.candidaturasCriadas += 1;

  if (com("ENFILEIRA_O_ITEM_CRU")) await deps.fila.enfileirar("pandape-varredura", itemCru);
  if (com("LOGA_O_NOME")) deps.log.info("pessoa ingerida", { nome });
  if (com("PATCH_DE_ETAPA")) {
    await deps.http.requisitar("PATCH", `/v2/matches/${String(itemCru.idMatch)}/update`, {});
  }
}

// ── 9. OS MUTANTES ─────────────────────────────────────────────────────────────────────────────

export interface MutanteDaIngestao {
  nome: string;
  dano: string;
  defeito: Defeito;
  regraEsperada: string;
}

export const MUTANTES_DA_INGESTAO: MutanteDaIngestao[] = [
  {
    nome: "1. o upsert do candidato cita `atualizado_em`",
    dano: "o relógio do expurgo de quem não tem candidatura é `greatest(criado_em, atualizado_em)`: com uma volta a cada 30 minutos, são 48 renovações por dia por pessoa, e ela NUNCA expira. É o furo 1 de LGPD reaberto pela porta do lado.",
    defeito: "CITA_ATUALIZADO_EM",
    regraEsperada: "INGESTOR_CITA_ATUALIZADO_EM",
  },
  {
    nome: "2. o ingestor grava o `criado_em` histórico do ATS",
    dano: "a pessoa nasce com o prazo de 2 anos possivelmente JÁ VENCIDO e é anonimizada na varredura seguinte. Irreversível, e silencioso.",
    defeito: "CITA_CRIADO_EM_HISTORICO",
    regraEsperada: "INGESTOR_CITA_CRIADO_EM",
  },
  {
    nome: "3. o upsert é INCONDICIONAL, sem a comparação campo a campo",
    dano: "reentrega que não muda nada escreve assim mesmo. É o caso que o DIARIO nomeia: o `where ... is distinct from` tem de viver no SQL, porque um `if` em TypeScript resolve o caso comum e perde a corrida entre dois ciclos.",
    defeito: "UPSERT_INCONDICIONAL",
    regraEsperada: "REENTREGA_IDENTICA_ESCREVE",
  },
  {
    nome: "4. o ingestor nunca atualiza pessoa que já existe",
    dano: "é o remédio que mata o doente: a trava da reentrega idêntica vira `nunca escreve`, e o telefone que mudou no ATS nunca chega. Este mutante existe para que a regra 3 não possa ser satisfeita por imobilidade.",
    defeito: "NUNCA_ESCREVE",
    regraEsperada: "REENTREGA_QUE_MUDA_NAO_ESCREVE",
  },
  {
    nome: "5. `coletado_em` fica com o default do banco",
    dano: "a linha passa a jurar que o dado foi coletado no dia em que a carga rodou, e é esse carimbo que diz há quanto tempo o consentimento existe.",
    defeito: "COLETADO_EM_PELO_DEFAULT",
    regraEsperada: "COLETADO_EM_NAO_EXPLICITO",
  },
  {
    nome: "6. a identidade `(PANDAPE, idCandidate)` é ignorada",
    dano: "a mesma pessoa vira uma ficha nova a cada volta da varredura, de 30 em 30 minutos.",
    defeito: "IGNORA_A_IDENTIDADE",
    regraEsperada: "PESSOA_DUPLICADA",
  },
  {
    nome: "7. o ciclo casa pessoa por NOME",
    dano: "nome é chave fraca, e o veto já está no schema: dois homônimos viram uma pessoa só, com o histórico de seleção de duas, e a fusão não se desfaz.",
    defeito: "CASA_POR_NOME",
    regraEsperada: "CASOU_POR_NOME",
  },
  {
    nome: "8. o CPF não é usado como desempate",
    dano: "a pessoa que já está na base ganha uma segunda ficha, cada uma com o seu relógio de retenção e o seu histórico.",
    defeito: "IGNORA_O_CPF",
    regraEsperada: "CPF_NAO_DESEMPATA",
  },
  {
    nome: "9. o conflito é resolvido em silêncio, a favor da identidade",
    dano: "o ciclo escolhe um dos dois lados sozinho. Fusão automática de duas pessoas é IRREVERSÍVEL: o que se junta por engano não se separa, porque ninguém sabe mais qual candidatura era de quem.",
    defeito: "FUNDE_O_CONFLITO",
    regraEsperada: "CONFLITO_DECIDIDO_SOZINHO",
  },
  {
    nome: "10. o conflito é descartado sem registro",
    dano: "não escolher está certo; não escolher E não avisar perde a inscrição a cada volta, para sempre, sem ninguém saber que existe um caso a resolver.",
    defeito: "DESCARTA_O_CONFLITO_EM_SILENCIO",
    regraEsperada: "CONFLITO_NAO_REGISTRADO",
  },
  {
    nome: "11. pasta sem de/para vira candidatura na etapa inicial",
    dano: "medido: 35% das inscrições estão em pasta sem tradução. Escrever `CAPTACAO` nelas grava no histórico de uma pessoa um movimento que ninguém fez, e depois não há como distinguir quem estava mesmo na Captação de quem foi parar lá por falta de tradução.",
    defeito: "ETAPA_INICIAL_QUANDO_NAO_MAPEIA",
    regraEsperada: "ETAPA_CHUTADA",
  },
  {
    nome: "12. o ciclo cria a linha de de/para sozinho",
    dano: "`rotulo_externo` e `motivo_padrao` são configuração REVISADA, e o valor acaba dentro da candidatura de uma pessoa. Um duto automático do ATS para cá leva texto de terceiro para dentro da base sem ninguém ler o que passa.",
    defeito: "CRIA_DEPARA_SOZINHO",
    regraEsperada: "DEPARA_CRIADO_PELO_CICLO",
  },
  {
    nome: "13b. a chave não mapeada é registrada COM O NOME CRU DA PASTA",
    dano: "o nome da pasta é texto livre do ATS e o resumo termina no log da aplicação, que é permanente e não é alcançado pelo `aplicarRetencao`. Uma pasta \"Reservados Fulano de Tal\" grava nome de candidato ali para sempre (achado R1 do `seguranca`).",
    defeito: "REGISTRA_A_CHAVE_CRUA",
    regraEsperada: "CHAVE_CRUA_NO_RESUMO",
  },
  {
    nome: "13. a chave não mapeada não é registrada no resumo",
    dano: "o fail-closed sem registro vira perda silenciosa de 35% da entrada, e o diretor fica sem o insumo para mapear as 15 chaves que faltam.",
    defeito: "NAO_REGISTRA_A_CHAVE",
    regraEsperada: "ETAPA_NAO_MAPEADA_NAO_REGISTRADA",
  },
  {
    nome: "14. a identidade é gravada com a fonte em outra grafia",
    dano: "`PANDAPE` e `Pandape` viram duas origens do mesmo sistema, cada uma com o seu `unique (fonte, identificador)` próprio: a mesma pessoa duplica sem que nada falhe.",
    defeito: "FONTE_COM_OUTRA_GRAFIA",
    regraEsperada: "FONTE_FORA_DO_VOCABULARIO",
  },
  {
    nome: "15. a chave da etapa é o nome CRU, sem normalizar",
    dano: "os nomes de pasta são texto livre de quem abriu a vaga, com acento, caixa irregular e instrução entre parênteses. A tradução funciona numa vaga e falha na vaga do lado, e o sintoma aparece meses depois.",
    defeito: "CHAVE_CRUA_SEM_NORMALIZAR",
    regraEsperada: "ETAPA_NAO_NORMALIZADA",
  },
  {
    nome: "16. o item inteiro da API é gravado no candidato",
    dano: "é o gesto natural de quem liga integração, e é assim que endereço, latitude, salário pretendido, currículo e ORIENTAÇÃO SEXUAL de 137 mil pessoas entram numa base de recrutamento sem ninguém decidir isso.",
    defeito: "GRAVA_O_ITEM_INTEIRO",
    regraEsperada: "PROJECAO_NAO_EXPLICITA",
  },
  {
    nome: "17. o resumo do currículo é guardado numa coluna nova",
    dano: "texto livre novo que o expurgo não alcança é retenção PERMANENTE: o DIARIO já registra o furo, e este o multiplicaria por 137 mil.",
    defeito: "GUARDA_O_RESUMO_DO_CURRICULO",
    regraEsperada: "TEXTO_LIVRE_FORA_DO_EXPURGO",
  },
  {
    nome: "18. o item cru é enfileirado para o worker",
    dano: "o payload do job vive no Redis e SOBREVIVE ao job: é banco de dados com outro nome, e ali estariam os quatro campos do art. 11 mais o currículo inteiro.",
    defeito: "ENFILEIRA_O_ITEM_CRU",
    regraEsperada: "SENSIVEL_VAZOU",
  },
  {
    nome: "19. o log do ciclo cita o nome da pessoa",
    dano: "§A.6: o log conta vaga, página e contagem, e mais nada. Nome em log é dado pessoal em arquivo que ninguém expurga.",
    defeito: "LOGA_O_NOME",
    regraEsperada: "PII_EM_LOG",
  },
  {
    nome: "20. o erro do driver é logado cru",
    dano: "O CAMINHO MENOS VIGIADO DE TODOS: o erro do Postgres carrega `detail` com o valor que violou a restrição e `query` com os parâmetros, então `log.erro(e)` publica o CPF sem ninguém escrever a palavra CPF em lugar nenhum.",
    defeito: "LOGA_O_ERRO_CRU",
    regraEsperada: "PII_EM_LOG",
  },
  {
    nome: "21. o ingestor marca banco de talentos",
    dano: "o schema proíbe com todas as letras: a ingestão insere SEM usuário autor, e o único escritor daquela coluna é `aplicarRetencao`, com cadeado de SUPER_ADMIN. Marcar aqui concede retenção estendida a 137 mil pessoas sem ninguém decidir isso.",
    defeito: "MARCA_BANCO_DE_TALENTOS",
    regraEsperada: "BANCO_TALENTOS_ESCRITO",
  },
  {
    nome: "22. o ciclo ingere o passivo antigo",
    dano: "137.654 inscrições vivas entram de uma vez, com o relógio de retenção já correndo, e o funil passa a contar gente que nunca falou com a Soulan.",
    defeito: "INGERE_O_PASSIVO",
    regraEsperada: "PASSIVO_INGERIDO",
  },
  {
    nome: "23. o corte é `agora menos 90 dias` em vez da data fixa",
    dano: "duas vagas varridas em momentos diferentes passam a ter cortes diferentes, e religar a varredura muda o que entra sem ninguém decidir isso.",
    defeito: "CORTE_PELO_AGORA",
    regraEsperada: "CORTE_NAO_DETERMINISTICO",
  },
  {
    nome: "29. a leitura para na marca de água, e a volta deixa de ser completa",
    dano: "MOVER ALGUÉM DE PASTA NÃO ALTERA O `insertDate`, e a lista não vem ordenada por `modifyDate`: quem para de ler no que já ingeriu nunca mais vê mudança nenhuma daquela inscrição, nem a troca de etapa nem o dado corrigido. A volta completa custa 660 requisições contra 622 da incremental, 6% de diferença, e é por isso que o plano manda ler tudo e escrever só o que mudou.",
    defeito: "PARA_NA_MARCA_DE_AGUA",
    regraEsperada: "REENTREGA_QUE_MUDA_NAO_ESCREVE",
  },
  {
    nome: "24. a vaga é inserida sem chave de conflito",
    dano: "a volta seguinte chega em 30 minutos: a Central de Vagas passa a contar a mesma vaga 48 vezes por dia.",
    defeito: "DUPLICA_A_VAGA",
    regraEsperada: "VAGA_DUPLICADA",
  },
  {
    nome: "25. a vaga nasce com um `cod_cliente` inventado",
    dano: "não existe caminho de API para o cliente da vaga (medido). Inventar é proibido pela §A.5, e aqui não inventar nem custa adiar: a coluna é nulável de propósito e a vaga entra marcada para vínculo manual.",
    defeito: "INVENTA_COD_CLIENTE",
    regraEsperada: "COD_CLIENTE_INVENTADO",
  },
  {
    nome: "26. a vaga é casada pelo `reference` em vez do `idVacancy`",
    dano: "o `reference` tem 558 valores distintos em 587 vagas, ou seja ele REPETE: casar por ele junta vagas diferentes, e as candidaturas vão para a vaga errada.",
    defeito: "CASA_VAGA_PELO_CODIGO",
    regraEsperada: "VAGA_NAO_CASADA_PELO_ID",
  },
  {
    nome: "27. a ingestão emite PATCH no funil do Pandapé",
    dano: "ESCREVE NO ATS DE TERCEIRO: move candidato de etapa no sistema de quem opera a vaga, não é desfazível por nós, e nada do nosso lado falha quando acontece.",
    defeito: "PATCH_DE_ETAPA",
    regraEsperada: "VERBO_QUE_ESCREVE",
  },
  {
    nome: "28. a ingestão chama o endpoint de mover pasta, ainda que por GET",
    dano: "o verbo certo num caminho que escreve continua sendo escrita: o que está proibido é o efeito no funil de terceiro, e não a letra do método.",
    defeito: "MOVE_A_PASTA",
    regraEsperada: "CAMINHO_DE_ESCRITA",
  },
];
