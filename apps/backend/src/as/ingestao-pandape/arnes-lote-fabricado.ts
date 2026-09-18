import "dotenv/config";
import { createDb } from "../../db/client";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import {
  CAMINHO_INSCRICOES,
  CAMINHO_PASTAS,
  CAMINHO_VAGAS,
  executarCicloDeIngestao,
} from "./ingestao-ciclo";
import type { DependenciasDaVarredura, PortaHttp, ResumoDoCiclo } from "./ingestao-portas";
import { IngestaoRepositorio } from "./ingestao-repositorio";

/**
 * ─ O ARNÊS DO LOTE FABRICADO: a varredura inteira, com um lote inventado no lugar do ATS ────────
 *
 * ┌─ POR QUE ELE EXISTE, E POR QUE NÃO SE VALIDA COM DADO REAL NA HOMOLOGAÇÃO ────────────────────┐
 * │ O `seguranca` vetou rodar a varredura REAL na 3120: o database `ea_automatic_homolog` é       │
 * │ declarado, na própria unidade systemd, como "clone ANONIMIZADO". Escrever nome, CPF, e-mail e │
 * │ telefone de candidatos de verdade ali torna essa frase FALSA enquanto ela continua escrita, e  │
 * │ quem confiar nela depois (ao tirar dump, ao depurar, ao compartilhar tela) quebra em silêncio. │
 * │                                                                                                │
 * │ O QUE MUDA PARA QUEM VALIDA: NADA. Só a porta HTTP é substituída. O ciclo é o mesmo, o de/para │
 * │ é o mesmo (lido do banco), o repositório é o mesmo, as guardas são as mesmas e a escrita é a   │
 * │ real. O que não se vê é o nome de gente de verdade, que é justamente o que não é preciso ver   │
 * │ para validar a tela.                                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS TRAVAS, E CADA UMA FECHA UM JEITO DIFERENTE DE ISTO DAR ERRADO ──────────────────────┐
 * │ 1. ELE NÃO RODA SOZINHO. Não é registrado em módulo nenhum, não é alcançável por rota nenhuma, │
 * │    não é importado por nada e `main()` só dispara quando ESTE arquivo é o programa executado    │
 * │    (`require.main === module`). Um arnês que escreve e que pudesse subir junto com o app seria  │
 * │    uma segunda porta de escrita, e segunda porta de escrita é o achado mais caro da casa.       │
 * │ 2. NÃO É TESTE. O nome do arquivo não casa com o padrão do vitest de propósito: entrar na       │
 * │    suíte faria a suíte exigir um Postgres vivo e escrever em banco a cada `pnpm test`.          │
 * │ 3. RECUSA PRODUÇÃO, e a recusa é por ALLOWLIST (fail-closed): nome de database que ele não     │
 * │    reconhece é recusado, e não aceito por omissão. Ver `conferirDatabase`.                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMO SE RODA (da raiz do repositório):
 *
 *   DATABASE_URL='postgres://ea:...@127.0.0.1:5433/ea_automatic_homolog' \
 *     npx tsx apps/backend/src/as/ingestao-pandape/arnes-lote-fabricado.ts <fase>
 *
 *   <fase> é uma de: 2 | 3 | 4 | 5-fecha | 5-volta | todas
 *   As fases são as do `docs/GUIA-VALIDACAO-INGESTAO-PANDAPE.md`.
 *
 * §A.6: TUDO AQUI É SINTÉTICO. Nenhum CPF, nome, e-mail ou telefone de pessoa real entra neste
 * arquivo, nem "só para ilustrar o formato". Ver o bloco `A GENTE FABRICADA`.
 */

// ══ A GUARDA DE PRODUÇÃO ═══════════════════════════════════════════════════════════════════════

/**
 * OS DATABASES EM QUE O ARNÊS PODE ESCREVER, por ALLOWLIST.
 *
 * ┌─ POR QUE ALLOWLIST, E NÃO "RECUSA SE FOR `ea_automatic`" ─────────────────────────────────────┐
 * │ Uma denylist só protege do nome que alguém lembrou de escrever nela. O `DATABASE_URL` que este │
 * │ processo lê vem do `.env` do backend, que em qualquer máquina de quem desenvolve aponta para o │
 * │ banco de trabalho, e o gesto que provoca o acidente é o mais banal possível: rodar o arnês sem │
 * │ exportar a URL. Com allowlist, o nome que ninguém previu é RECUSADO, que é a direção certa     │
 * │ para uma ferramenta cujo único efeito é ESCREVER pessoa e candidatura no banco.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `ea_automatic` (produção) não casa: o padrão exige o sufixo, e o sufixo é o que separa o banco de
 * verdade dos bancos de ensaio.
 */
export const DATABASES_DO_ARNES = /^ea_automatic_(homolog|arnes|ensaio|teste)[a-z0-9_]*$/;

/** O nome do database de produção, nomeado para a recusa dizer POR QUE recusou. */
export const DATABASE_DE_PRODUCAO = "ea_automatic";

/**
 * Devolve o nome do database, ou LANÇA. Nunca devolve "provavelmente pode".
 *
 * A URL NÃO É IMPRESSA EM LUGAR NENHUM: ela carrega a senha do banco. Só o NOME do database sai
 * daqui, que é o que a pessoa precisa ler para entender a recusa.
 */
export function conferirDatabase(url: string | undefined): string {
  const texto = (url ?? "").trim();
  if (texto === "") {
    throw new Error("O arnês recusou: DATABASE_URL não está definida.");
  }
  let nome: string;
  try {
    nome = decodeURIComponent(new URL(texto).pathname.replace(/^\//, "")).trim();
  } catch {
    throw new Error("O arnês recusou: DATABASE_URL ilegível.");
  }
  if (nome === DATABASE_DE_PRODUCAO) {
    throw new Error(
      `O arnês recusou: "${DATABASE_DE_PRODUCAO}" é o database de PRODUÇÃO. O arnês escreve, e o que ele escreve é fabricado.`,
    );
  }
  if (!DATABASES_DO_ARNES.test(nome)) {
    throw new Error(
      `O arnês recusou o database "${nome}": ele não está na allowlist (${DATABASES_DO_ARNES.source}). Fail-closed: nome desconhecido é recusado, nunca aceito por omissão.`,
    );
  }
  return nome;
}

// ══ A GENTE FABRICADA ══════════════════════════════════════════════════════════════════════════

/**
 * ┌─ §A.6: NADA AQUI VEIO DE PESSOA NENHUMA, E A FORMA DE CADA CAMPO DIZ ISSO SOZINHA ────────────┐
 * │ NOME: inventado, alfabeto fonético, com a palavra "Sintetico" colada. Ninguém confunde com     │
 * │       gente de verdade ao olhar a Central de Candidatos.                                        │
 * │ CPF:  gerado, com dígito verificador VÁLIDO porque a coluna e as consultas tratam CPF como     │
 * │       chave técnica, e um valor malformado testaria o caminho errado. O prefixo é `999`, a      │
 * │       ponta mais alta da faixa, e a sequência é fixa e conhecida, para quem for limpar o banco  │
 * │       depois achar tudo por `cpf like '999%'`.                                                  │
 * │ EMAIL: domínio `.invalid`, que a RFC 2606 reserva JUSTAMENTE para não existir. Não há como ele  │
 * │       ser o endereço de alguém, e não há como mandar mensagem para ele por engano.               │
 * │ TELEFONE: onze zeros. Não é discável, e não é de ninguém.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
interface PessoaFabricada {
  idCandidate: string;
  name: string;
  surname: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;
}

/** O dígito verificador do CPF, para o sintético ser VÁLIDO e não só bem formatado. */
function digitosVerificadores(base9: string): string {
  const calcular = (digitos: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < digitos.length; i += 1) {
      soma += Number(digitos[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calcular(base9, 10);
  const d2 = calcular(`${base9}${d1}`, 11);
  return `${d1}${d2}`;
}

function cpfSintetico(sequencia: number): string {
  const base = `999${String(sequencia).padStart(6, "0")}`;
  return `${base}${digitosVerificadores(base)}`;
}

function pessoa(sequencia: number, apelido: string): PessoaFabricada {
  return {
    // O identificador externo é o que casa com `as_identidades_externas`, e ele nasce marcado:
    // qualquer um que veja `ARNES-...` na base sabe de onde a linha veio.
    idCandidate: `ARNES-${String(sequencia).padStart(6, "0")}`,
    name: "Arnes",
    surname: `${apelido} Sintetico`,
    cpf: cpfSintetico(sequencia),
    email: `arnes.${apelido.toLowerCase()}@exemplo.invalid`,
    phone: "00000000000",
    birthDate: "1990-01-01",
  };
}

const ALFA = pessoa(1, "Alfa");
const BRAVO = pessoa(2, "Bravo");
const CHARLIE = pessoa(3, "Charlie");
const DELTA = pessoa(4, "Delta");

// ══ O LOTE ═════════════════════════════════════════════════════════════════════════════════════

/**
 * OS IDS SÃO ALTOS E FIXOS, na faixa `99xxxx`, para não colidirem com id de vaga real do Pandapé
 * caso o arnês e a varredura de verdade um dia convivam no mesmo banco de ensaio. Fixos, e não
 * sorteados, porque a fase 3 (a repetição) só prova alguma coisa se o lote for IDÊNTICO.
 */
const VAGA_PRINCIPAL = 990001;
/**
 * A SEGUNDA VAGA EXISTE SÓ POR CAUSA DA FASE 5, e a razão é uma guarda do próprio ciclo: lista de
 * ativas VAZIA não encerra ninguém (senão uma falha de rede carimbaria `encerrada_em` em todas as
 * vagas espelhadas de uma vez). Para a principal SAIR das ativas, alguma outra precisa ficar.
 */
const VAGA_SENTINELA = 990002;

/** As pastas da vaga. As três primeiras têm de/para ATIVO; a quarta não tem, e é a fase 4. */
const PASTA_LEAD = 990101;
const PASTA_TRIADOS = 990102;
const PASTA_ENTREVISTA = 990103;
const PASTA_SEM_TRADUCAO = 990104;

/**
 * OS NOMES DAS PASTAS VÊM COM CAIXA IRREGULAR DE PROPÓSITO: é assim que o Pandapé os devolve, e é
 * o que prova que quem casa é a chave NORMALIZADA (`normalizarChaveExterna`) e não o texto cru.
 */
const PASTAS = [
  { idVacancyFolder: PASTA_LEAD, name: "Lead" },
  { idVacancyFolder: PASTA_TRIADOS, name: "TRIADOS" },
  { idVacancyFolder: PASTA_ENTREVISTA, name: "Entrevista Soulan" },
  { idVacancyFolder: PASTA_SEM_TRADUCAO, name: "PASTA FABRICADA DO ARNES" },
];

/** A data de inscrição do lote. FIXA, pelo mesmo motivo dos ids: a fase 3 repete o lote inteiro. */
const INSERT_DATE = "2026-09-15T10:00:00Z";

function inscricao(p: PessoaFabricada, idVacancyFolder: number): Record<string, unknown> {
  return {
    idCandidate: p.idCandidate,
    name: p.name,
    surname: p.surname,
    cpf: p.cpf,
    email: p.email,
    phone: p.phone,
    birthDate: p.birthDate,
    idVacancy: VAGA_PRINCIPAL,
    idVacancyFolder,
    insertDate: INSERT_DATE,
  };
}

const TRES_ETAPAS_MAPEADAS = [
  inscricao(ALFA, PASTA_LEAD),
  inscricao(BRAVO, PASTA_TRIADOS),
  inscricao(CHARLIE, PASTA_ENTREVISTA),
];

const O_QUARTO_SEM_TRADUCAO = inscricao(DELTA, PASTA_SEM_TRADUCAO);

const VAGA_PRINCIPAL_CRUA = {
  idVacancy: VAGA_PRINCIPAL,
  reference: "ARNES-VAGA-1",
  job: "Vaga Fabricada Do Arnes",
  city: null,
  numberVacancies: 3,
};

const VAGA_SENTINELA_CRUA = {
  idVacancy: VAGA_SENTINELA,
  reference: "ARNES-VAGA-2",
  job: "Vaga Sentinela Do Arnes",
  city: null,
  numberVacancies: 1,
};

export const FASES = ["2", "3", "4", "5-fecha", "5-volta"] as const;
export type Fase = (typeof FASES)[number];

interface Lote {
  vagasAtivas: Record<string, unknown>[];
  inscricoes: Record<number, Record<string, unknown>[]>;
  descricao: string;
}

/** O lote de cada fase do guia de validação. */
export function loteDaFase(fase: Fase): Lote {
  switch (fase) {
    case "2":
    case "3":
      return {
        descricao:
          fase === "2"
            ? "uma vaga e tres candidatos, um em cada etapa mapeada"
            : "o MESMO lote da fase 2, de novo (ninguem pode duplicar)",
        vagasAtivas: [VAGA_PRINCIPAL_CRUA],
        inscricoes: { [VAGA_PRINCIPAL]: TRES_ETAPAS_MAPEADAS },
      };
    case "4":
      return {
        descricao: "um quarto candidato em pasta SEM de/para (ele nao pode ser escrito)",
        vagasAtivas: [VAGA_PRINCIPAL_CRUA],
        inscricoes: { [VAGA_PRINCIPAL]: [...TRES_ETAPAS_MAPEADAS, O_QUARTO_SEM_TRADUCAO] },
      };
    case "5-fecha":
      return {
        descricao: "a vaga principal SAI das ativas (a sentinela fica, senao nada encerra)",
        vagasAtivas: [VAGA_SENTINELA_CRUA],
        inscricoes: { [VAGA_SENTINELA]: [] },
      };
    case "5-volta":
      return {
        descricao: "a vaga principal VOLTA para as ativas",
        vagasAtivas: [VAGA_PRINCIPAL_CRUA, VAGA_SENTINELA_CRUA],
        inscricoes: { [VAGA_PRINCIPAL]: TRES_ETAPAS_MAPEADAS, [VAGA_SENTINELA]: [] },
      };
  }
}

/**
 * A PORTA HTTP FABRICADA. É a ÚNICA peça substituída, e ela responde exatamente o que a porta real
 * responderia: os três caminhos da allowlist, no formato `{ data: [...] }`.
 *
 * O VERBO CONTINUA SENDO CONFERIDO, mesmo sem rede do outro lado: esta frente é GET APENAS, e um
 * arnês que aceitasse verbo de escrita deixaria de provar o caminho real no ponto que mais importa.
 */
export function portaHttpFabricada(lote: Lote): PortaHttp {
  return {
    async requisitar(metodo, caminho, params = {}) {
      if (metodo.toUpperCase() !== "GET") {
        throw new Error(`A ingestão do Pandapé é GET apenas. Verbo recusado: ${metodo}.`);
      }
      if (caminho === CAMINHO_VAGAS) return { data: lote.vagasAtivas };
      if (caminho === CAMINHO_PASTAS) return { data: PASTAS };
      if (caminho === CAMINHO_INSCRICOES) {
        const idVacancy = Number(params.IdVacancy);
        const pagina = Number(params.Page ?? 1);
        // Página 2 em diante é vazia: o lote cabe inteiro na primeira, e o ciclo para sozinho
        // quando a página vem menor que o tamanho pedido.
        if (pagina > 1) return { data: [] };
        return { data: lote.inscricoes[idVacancy] ?? [] };
      }
      throw new Error(`A ingestão do Pandapé não chama este caminho: ${caminho}.`);
    },
  };
}

// ══ A EXECUÇÃO ═════════════════════════════════════════════════════════════════════════════════

/**
 * A DATA DE CORTE DO ARNÊS: bem anterior ao `insertDate` do lote, para as quatro inscrições
 * passarem pelo corte. Em produção ela é decisão do diretor e não tem default (a varredura nasce
 * inerte sem ela); aqui ela é parte do lote fabricado, e não sai deste arquivo.
 */
const DATA_DE_CORTE = new Date("2026-01-01T00:00:00Z");

async function rodarFase(
  deps: Omit<DependenciasDaVarredura, "http">,
  fase: Fase,
): Promise<ResumoDoCiclo> {
  const lote = loteDaFase(fase);
  console.log("");
  console.log(`FASE ${fase}: ${lote.descricao}`);
  console.log("=".repeat(78));
  const resumo = await executarCicloDeIngestao({ ...deps, http: portaHttpFabricada(lote) });
  console.log(
    `  vagas=${resumo.vagasVarridas} paginas=${resumo.paginasLidas} ` +
      `pessoas novas=${resumo.pessoasCriadas} candidaturas=${resumo.candidaturasCriadas} ` +
      `conflitos=${resumo.conflitosParaRevisao} erros=${resumo.erros}`,
  );
  if (resumo.etapasNaoMapeadas.length > 0) {
    // MARCA da pasta, nunca o nome dela: o nome é texto livre do ATS (achado R1 do `seguranca`).
    // O registro é o que impede a recusa fail-closed de virar perda silenciosa.
    console.log(`  pastas sem de/para: ${resumo.etapasNaoMapeadas.join(" | ")}`);
  }
  return resumo;
}

async function main(): Promise<void> {
  const nomeDoBanco = conferirDatabase(process.env.DATABASE_URL);
  const pedida = (process.argv[2] ?? "").trim();
  const fases: Fase[] =
    pedida === "todas"
      ? [...FASES]
      : (FASES as readonly string[]).includes(pedida)
        ? [pedida as Fase]
        : [];
  if (fases.length === 0) {
    throw new Error(`Fase inválida: "${pedida}". Use uma de: ${FASES.join(" | ")} | todas.`);
  }

  console.log(`[arnes] database: ${nomeDoBanco} (allowlist conferida)`);
  const { sql, db } = createDb(process.env.DATABASE_URL as string, 1);
  const etapas = new EtapasFunilService(db);
  const repo = new IngestaoRepositorio(db, new VagaStatusService(db), etapas);

  const deps: Omit<DependenciasDaVarredura, "http"> = {
    banco: repo,
    // O CICLO MONOLÍTICO NÃO ENFILEIRA (ele mesmo pagina), e a porta está aqui só por contrato.
    // Ela LANÇA em vez de engolir: se um dia o ciclo passar a enfileirar, o arnês reclama em vez
    // de perder metade do lote em silêncio.
    fila: {
      enfileirar: () => {
        throw new Error("O arnês não tem fila: o ciclo monolítico pagina sozinho.");
      },
    },
    log: {
      info: (texto, dados) => console.log(`  [info] ${texto} ${resumir(dados)}`),
      erro: (texto, dados) => console.log(`  [erro] ${texto} ${resumir(dados)}`),
    },
    agora: () => new Date(),
    dataDeCorte: DATA_DE_CORTE,
    cicloDeVida: repo,
    etapaInicial: async () => (await etapas.etapaInicial()).codigo,
  };

  for (const fase of fases) await rodarFase(deps, fase);
  console.log("");
  await sql.end();
}

/** §A.6: o mesmo achatamento do serviço de produção. Só chave e valor curto, nada aninhado. */
function resumir(dados: unknown): string {
  if (dados === null || dados === undefined) return "";
  if (typeof dados !== "object") return String(dados);
  return Object.entries(dados as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "object" ? "[objeto]" : String(v)}`)
    .join(" ");
}

// A TRAVA 1: só dispara quando ESTE arquivo é o programa executado. Importar não roda nada, e
// nenhum boot do app pode acordar o arnês por engano.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[arnes] falhou: ${err instanceof Error ? err.message : "erro sem mensagem"}`);
    process.exit(1);
  });
}
