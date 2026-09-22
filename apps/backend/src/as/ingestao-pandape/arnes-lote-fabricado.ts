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
 *   <fase> é uma de: 2 | 3 | 4 | 5-fecha | 5-volta | todas | simulacao
 *   As cinco primeiras são as do `docs/GUIA-VALIDACAO-INGESTAO-PANDAPE.md`, e `todas` roda só
 *   elas. A `simulacao` é o LOTE DE VITRINE (ver `A SIMULAÇÃO`), e fica FORA do `todas` de
 *   propósito: ela troca a lista de vagas ativas inteira, e o ciclo encerra o que não está nela.
 *
 * §A.6: TUDO AQUI É SINTÉTICO. Nenhum CPF, nome, e-mail ou telefone de pessoa real entra neste
 * arquivo, nem "só para ilustrar o formato". Ver o bloco `A GENTE FABRICADA`.
 *
 * ┌─ O PREDICADO ÚNICO DO LOTE: UMA LINHA DE SQL RESPONDE "ISTO ESTÁ AQUI DENTRO?" ────────────────┐
 * │                                                                                                │
 * │   select count(*) from as_identidades_externas where identificador like 'ARNES-%';             │
 * │                                                                                                │
 * │ TODA pessoa escrita por este arquivo, sem exceção, é alcançada por ele: o ciclo anexa a        │
 * │ identidade externa a cada pessoa que ingere (`anexarIdentidade`), e o `idCandidate` de toda    │
 * │ pessoa fabricada nasce com o prefixo `ARNES-`. Vale inclusive para quem entra SEM CPF, que é a │
 * │ maior parte do lote de simulação.                                                               │
 * │                                                                                                │
 * │ NÃO DEPENDE DO NOME NEM DO CPF de propósito: o nome é texto editável por tela (o prefixo       │
 * │ `SIMULADO` some no dia em que alguém corrigir um cadastro) e o CPF a maior parte do lote não   │
 * │ tem. As vagas têm o seu par: `select count(*) from vagas where codigo like 'SIM-VAGA-%' or     │
 * │ codigo like 'ARNES-VAGA-%';`                                                                    │
 * │                                                                                                │
 * │ O CAMINHO DE VAZAMENTO QUE ISTO COBRE é o de alguém restaurar um dump de homologação dentro de │
 * │ produção: contagem ZERO em produção é a prova de que nada disto passou, e ela não depende de   │
 * │ ninguém lembrar como o lote foi montado.                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COMO RECRIAR O LOTE DO ZERO (o re-clone da homologação dá DROP DATABASE e apaga tudo isto) ───┐
 * │ Um comando, e não arqueologia. Do diretório `apps/backend` da homologação:                     │
 * │                                                                                                │
 * │   DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" \                                │
 * │     npx tsx src/as/ingestao-pandape/arnes-lote-fabricado.ts simulacao                          │
 * │                                                                                                │
 * │ Ele é IDEMPOTENTE: rodar de novo sobre um lote que já existe devolve `pessoas novas=0`. Para   │
 * │ ter também as quatro pessoas das fases do guia, rodar `todas` antes. Para APAGAR o lote, o     │
 * │ mesmo predicado de cima é o alcance, e o expurgo é manual e deliberado: o arnês não apaga.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
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
  /**
   * NULO NA MAIOR PARTE DO LOTE, E ISSO É A CORREÇÃO DE UM VETO, não economia de digitação.
   *
   * ┌─ NÃO EXISTE FAIXA DE CPF RESERVADA PARA TESTE ─────────────────────────────────────────────┐
   * │ `999xxxxxxxx` com dígito verificador válido é estruturalmente EMISSÍVEL: cada um destes      │
   * │ números é, ou pode vir a ser, de uma pessoa real. Com quatro, é curiosidade; com dezenas ou  │
   * │ centenas, é um bloco de identificadores de terceiros numa base, sem base legal (§A.6).       │
   * │                                                                                              │
   * │ E O DANO É CONCRETO, não teórico: `uq_as_candidatos_cpf` é ÚNICO e a ingestão DESEMPATA POR  │
   * │ CPF (`resolverPessoa`). Uma pessoa real cujo CPF caísse na faixa seria FUNDIDA com o registro │
   * │ fabricado, e fusão de ficha não se desfaz.                                                    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA: um bloco PEQUENO, FIXO e documentado (ver `VAGA_COM_CPF_DA_SIMULACAO`), só o bastante
   * para exercitar dedup, conflito e busca por CPF. TODO o resto entra com `cpf` NULO, que é estado
   * previsto (a coluna é nulável e a tela já renderiza o candidato sem CPF).
   *
   * CPF COM DÍGITO QUEBRADO NÃO SERVE DE MEIO-TERMO: `cpfParaBanco` trata CPF inválido como AUSENTE
   * em silêncio, então ele exercitaria o caminho do nulo enquanto alguém acredita estar exercitando
   * o do CPF.
   */
  cpf: string | null;
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

/**
 * O PREFIXO DO NOME, E ELE É A ÚNICA MARCA QUE A TELA MOSTRA.
 *
 * ┌─ MEDIDO: NA LISTA, NADA MAIS DENUNCIA O DADO FABRICADO ────────────────────────────────────────┐
 * │ O repositório escreve `origem = 'PANDAPE'` fixo, o enum de origem não tem valor para           │
 * │ "fabricado", o CPF não sai na lista (só na ficha) e a 3120 não tem tarja de ambiente. Sobra o  │
 * │ nome.                                                                                           │
 * │                                                                                                 │
 * │ CAIXA ALTA, PALAVRA QUE NÃO É NOME DE GENTE, E NA FRENTE. O nome anterior (`Arnes Alfa          │
 * │ Sintetico`) falhava duas vezes: "Arnes" é jargão da casa, que um leitor de fora lê como         │
 * │ sobrenome, e "Sintetico" ficava no FIM, que é justamente o pedaço que a coluna estreita corta.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const PREFIXO_SIMULADO = "SIMULADO";

function pessoa(
  sequencia: number,
  apelido: string,
  /** Sem CPF é o PADRÃO do lote. Ver o bloco de `PessoaFabricada.cpf`: o CPF é a exceção rara. */
  comCpf = false,
): PessoaFabricada {
  return {
    // O identificador externo é o que casa com `as_identidades_externas`, e ele nasce marcado:
    // qualquer um que veja `ARNES-...` na base sabe de onde a linha veio. É ELE o predicado único
    // do lote (ver o cabeçalho), e por isso ele não muda de forma nem para a vitrine.
    idCandidate: `ARNES-${String(sequencia).padStart(6, "0")}`,
    name: PREFIXO_SIMULADO,
    surname: apelido,
    cpf: comCpf ? cpfSintetico(sequencia) : null,
    email: `arnes.${apelido.toLowerCase()}@exemplo.invalid`,
    phone: "00000000000",
    birthDate: "1990-01-01",
  };
}

/**
 * AS QUATRO DO GUIA CONTINUAM COM CPF, e são QUATRO: é com elas que as fases 2 e 3 medem o dedup
 * por CPF e o conflito identidade-contra-CPF. Quatro identificadores fixos é o bloco mínimo que
 * exercita o caminho, e é a ordem de grandeza que o veto do CPF admite.
 */
const ALFA = pessoa(1, "Alfa Sintetico", true);
const BRAVO = pessoa(2, "Bravo Sintetico", true);
const CHARLIE = pessoa(3, "Charlie Sintetico", true);
const DELTA = pessoa(4, "Delta Sintetico", true);

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

function inscricao(
  p: PessoaFabricada,
  idVacancyFolder: number,
  idVacancy: number = VAGA_PRINCIPAL,
): Record<string, unknown> {
  return {
    idCandidate: p.idCandidate,
    name: p.name,
    surname: p.surname,
    cpf: p.cpf,
    email: p.email,
    phone: p.phone,
    birthDate: p.birthDate,
    idVacancy,
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


// ══ A SIMULAÇÃO ════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O LOTE DE VITRINE: doze vagas e cinquenta e duas pessoas, para a tela ter o que mostrar ─────
 *
 * ┌─ PARA QUE ELE EXISTE, E POR QUE NÃO É MAIS UMA FASE DO GUIA ───────────────────────────────────┐
 * │ As fases 2 a 5 provam COMPORTAMENTO (não duplica, não inventa etapa, encerra e reabre), e para │
 * │ isso quatro pessoas bastam. Esta fase não prova nada: ela ENCHE a homologação, para o diretor  │
 * │ olhar o funil, o cilindro das posições, os KPIs e a Central de Candidatos com volume que se    │
 * │ parece com o de um dia de operação, ANTES de a ingestão real ser ligada.                       │
 * │                                                                                                │
 * │ O CAMINHO DE ESCRITA É O MESMO, E ISSO É O PONTO: mesma porta fabricada, mesmo ciclo, mesmo    │
 * │ de/para lido do banco, mesmo repositório, mesmas guardas. Um script de `insert` à parte encheria│
 * │ a tela com linhas que a ingestão de verdade nunca produziria, e o diretor validaria uma tela   │
 * │ que não corresponde ao sistema.                                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6: A TELA TEM DE DIZER QUE É SIMULAÇÃO, E NÃO SÓ O BANCO ──────────────────────────────────┐
 * │ Um print da homologação circula. Por isso a marca não fica só no CPF `999` e no domínio        │
 * │ `.invalid`, que ninguém vê na Central de Candidatos: ela está no PRIMEIRO NOME de cada pessoa  │
 * │ (`SIMULADO`, caixa alta, palavra que não é nome de gente) e no nome de divulgação de cada vaga.   │
 * │ Quem olhar a lista, o funil ou o cilindro lê a palavra antes de ler qualquer outra coisa.       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELA ENCERRA, E ISSO NÃO É EFEITO COLATERAL ESCONDIDO: a lista de vagas ativas deste lote
 * são as doze da simulação, então as vagas espelhadas das outras fases (990001 e 990002) saem das
 * ativas e o ciclo as encerra, que é exatamente o que ele faz em produção. É reversível rodando
 * `5-volta`. Por isso a simulação fica FORA do `todas`.
 */

/**
 * AS CINCO PASTAS, uma por etapa mapeada do funil.
 *
 * OS NOMES SÃO OS DO DE/PARA SEMEADO, e a caixa é irregular de propósito (é assim que o Pandapé os
 * devolve): quem casa é a chave NORMALIZADA, e não o texto cru. Se uma linha de de/para for
 * inativada no banco, a pasta correspondente para de entrar, e o resumo acusa a pasta sem tradução
 * em vez de a etapa sumir em silêncio.
 */
const PASTA_SIM_CAPTACAO = 992001;
const PASTA_SIM_TRIAGEM = 992002;
const PASTA_SIM_ENTREVISTA_SOULAN = 992003;
const PASTA_SIM_ENTREVISTA_CLIENTE = 992004;
const PASTA_SIM_APROVACAO = 992005;

const PASTAS_DA_SIMULACAO = [
  { idVacancyFolder: PASTA_SIM_CAPTACAO, name: "Lead" },
  { idVacancyFolder: PASTA_SIM_TRIAGEM, name: "TRIADOS" },
  { idVacancyFolder: PASTA_SIM_ENTREVISTA_SOULAN, name: "Entrevista Soulan" },
  { idVacancyFolder: PASTA_SIM_ENTREVISTA_CLIENTE, name: "Encaminhados Cliente" },
  { idVacancyFolder: PASTA_SIM_APROVACAO, name: "Contratados" },
];

/** Quantas pessoas cada vaga recebe em cada uma das cinco pastas, na ordem de `PASTAS_DA_SIMULACAO`. */
interface VagaDaSimulacao {
  idVacancy: number;
  codigo: string;
  titulo: string;
  /** `posicoes_oficiais`. Nulo não existe aqui: toda vaga da vitrine tem meta, senão não há cilindro. */
  posicoes: number;
  captacao: number;
  triagem: number;
  entrevistaSoulan: number;
  entrevistaCliente: number;
  /**
   * A pasta `Contratados` traduz para a etapa APROVACAO **e** para o desfecho
   * `ENVIADO_PARA_ADMISSAO`, que é o que FINALIZA posição: é esta coluna, e só ela, que enche o
   * cilindro. As três primeiras vagas existem para o cilindro mostrar os três estados que ele sabe
   * mostrar: posição sobrando, posição no limite e posição EXCEDIDA.
   */
  aprovacao: number;
}

/**
 * OS IDS SÃO FIXOS E ALTOS (`9910xx`), pelo mesmo motivo dos das outras fases: fixos para a segunda
 * rodada ser idêntica à primeira (idempotência), altos para não colidirem com id de vaga real.
 *
 * OS TÍTULOS SÃO CARGOS GENÉRICOS DE OPERAÇÃO, inventados, e nenhum deles é a cópia de uma vaga
 * real da conta: a vitrine precisa parecer plausível, não precisa ser verdadeira.
 */
const VAGAS_DA_SIMULACAO: VagaDaSimulacao[] = [
  // Cilindro com posição SOBRANDO: 2 entregues em 5 posições.
  { idVacancy: 991001, codigo: "SIM-VAGA-01", titulo: "Operador De Loja", posicoes: 5, captacao: 3, triagem: 2, entrevistaSoulan: 1, entrevistaCliente: 1, aprovacao: 2 },
  // Cilindro NO LIMITE: 3 entregues em 3 posições.
  { idVacancy: 991002, codigo: "SIM-VAGA-02", titulo: "Auxiliar De Limpeza", posicoes: 3, captacao: 2, triagem: 1, entrevistaSoulan: 1, entrevistaCliente: 0, aprovacao: 3 },
  // Cilindro EXCEDIDO: 4 entregues em 2 posições. O domínio permite (`excedida`), e a tela precisa
  // ser olhada justamente nesse estado, que é o que ninguém vê até acontecer em produção.
  { idVacancy: 991003, codigo: "SIM-VAGA-03", titulo: "Repositor De Mercadorias", posicoes: 2, captacao: 1, triagem: 1, entrevistaSoulan: 1, entrevistaCliente: 1, aprovacao: 4 },
  { idVacancy: 991004, codigo: "SIM-VAGA-04", titulo: "Atendente De Loja", posicoes: 8, captacao: 4, triagem: 2, entrevistaSoulan: 1, entrevistaCliente: 1, aprovacao: 0 },
  { idVacancy: 991005, codigo: "SIM-VAGA-05", titulo: "Porteiro Noturno", posicoes: 1, captacao: 1, triagem: 0, entrevistaSoulan: 0, entrevistaCliente: 0, aprovacao: 0 },
  { idVacancy: 991006, codigo: "SIM-VAGA-06", titulo: "Recepcionista", posicoes: 4, captacao: 2, triagem: 1, entrevistaSoulan: 1, entrevistaCliente: 0, aprovacao: 0 },
  { idVacancy: 991007, codigo: "SIM-VAGA-07", titulo: "Auxiliar De Cozinha", posicoes: 6, captacao: 2, triagem: 2, entrevistaSoulan: 1, entrevistaCliente: 1, aprovacao: 0 },
  { idVacancy: 991008, codigo: "SIM-VAGA-08", titulo: "Motorista Entregador", posicoes: 2, captacao: 1, triagem: 1, entrevistaSoulan: 0, entrevistaCliente: 0, aprovacao: 0 },
  { idVacancy: 991009, codigo: "SIM-VAGA-09", titulo: "Estoquista", posicoes: 10, captacao: 1, triagem: 1, entrevistaSoulan: 1, entrevistaCliente: 0, aprovacao: 0 },
  { idVacancy: 991010, codigo: "SIM-VAGA-10", titulo: "Vigilante Patrimonial", posicoes: 1, captacao: 1, triagem: 0, entrevistaSoulan: 0, entrevistaCliente: 0, aprovacao: 0 },
  // A vaga VAZIA é de propósito: cilindro zerado e funil sem ninguém também são estados de tela.
  { idVacancy: 991011, codigo: "SIM-VAGA-11", titulo: "Fiscal De Prevencao", posicoes: 3, captacao: 0, triagem: 0, entrevistaSoulan: 0, entrevistaCliente: 0, aprovacao: 0 },
  { idVacancy: 991012, codigo: "SIM-VAGA-12", titulo: "Jovem Aprendiz Administrativo", posicoes: 20, captacao: 0, triagem: 1, entrevistaSoulan: 1, entrevistaCliente: 1, aprovacao: 0 },
];

/**
 * A ÚNICA VAGA DA VITRINE CUJA GENTE NASCE COM CPF, e ela é a PRIMEIRA da tabela.
 *
 * SÃO NOVE PESSOAS, uma em cada uma das cinco etapas mapeadas (3 + 2 + 1 + 1 + 2), que é o bloco
 * pequeno, fixo e documentado que o veto do CPF pede: dá para exercitar dedup, conflito e busca por
 * CPF em toda etapa do funil sem criar um bloco de identificadores de terceiros do tamanho do lote.
 * As outras onze vagas inteiras entram com `cpf` NULO.
 */
const VAGA_COM_CPF_DA_SIMULACAO = 0;

/**
 * A PRIMEIRA SEQUÊNCIA DA VITRINE. Começa em 2001 para não encostar nas quatro pessoas das fases do
 * guia (1 a 4): o CPF e o `idCandidate` saem da sequência, e repetir um número faria a vitrine
 * reescrever a pessoa da fase 2 em vez de criar a dela.
 */
const PRIMEIRA_SEQUENCIA_DA_SIMULACAO = 2001;

/** A ordem em que as pessoas são distribuídas, e ela é fixa: é dela que vem a idempotência. */
const DISTRIBUICAO: { pasta: number; quantas: (v: VagaDaSimulacao) => number }[] = [
  { pasta: PASTA_SIM_CAPTACAO, quantas: (v) => v.captacao },
  { pasta: PASTA_SIM_TRIAGEM, quantas: (v) => v.triagem },
  { pasta: PASTA_SIM_ENTREVISTA_SOULAN, quantas: (v) => v.entrevistaSoulan },
  { pasta: PASTA_SIM_ENTREVISTA_CLIENTE, quantas: (v) => v.entrevistaCliente },
  { pasta: PASTA_SIM_APROVACAO, quantas: (v) => v.aprovacao },
];

/**
 * O LOTE DA VITRINE, montado a cada chamada e SEMPRE IGUAL.
 *
 * NADA AQUI É SORTEADO, e a ausência do acaso é o que torna a fase idempotente: a sequência da
 * pessoa sai da posição dela na tabela acima, então a segunda rodada produz o MESMO `idCandidate`,
 * o MESMO CPF e a MESMA pasta, e o ciclo reconhece todo mundo pela identidade externa. Duas rodadas
 * devolvem `pessoas novas=0 candidaturas=0`.
 */
export function loteDaSimulacao(): Lote {
  const inscricoes: Record<number, Record<string, unknown>[]> = {};
  let sequencia = PRIMEIRA_SEQUENCIA_DA_SIMULACAO;

  for (const [indice, vaga] of VAGAS_DA_SIMULACAO.entries()) {
    const lista: Record<string, unknown>[] = [];
    for (const faixa of DISTRIBUICAO) {
      for (let i = 0; i < faixa.quantas(vaga); i += 1) {
        // §A.6: "SIMULADO Candidato 0007" é o que a Central de Candidatos mostra. A palavra vem
        // PRIMEIRO porque é o primeiro pedaço lido numa coluna de nome, inclusive quando a coluna
        // é estreita e corta o resto.
        const p = pessoa(
          sequencia,
          `Candidato ${String(sequencia).padStart(4, "0")}`,
          indice === VAGA_COM_CPF_DA_SIMULACAO,
        );
        lista.push(inscricao(p, faixa.pasta, vaga.idVacancy));
        sequencia += 1;
      }
    }
    inscricoes[vaga.idVacancy] = lista;
  }

  const pessoas = sequencia - PRIMEIRA_SEQUENCIA_DA_SIMULACAO;
  return {
    descricao: `a vitrine: ${VAGAS_DA_SIMULACAO.length} vagas e ${pessoas} pessoas, espalhadas pelas cinco etapas mapeadas`,
    vagasAtivas: VAGAS_DA_SIMULACAO.map((v) => ({
      idVacancy: v.idVacancy,
      reference: v.codigo,
      // O nome que aparece na TELA. O MESMO prefixo do nome da pessoa, para a LINHA INTEIRA ser
      // lida como simulada: um print desta base pode circular, e a vaga é a outra metade da linha.
      job: `${PREFIXO_SIMULADO} ${v.titulo}`,
      city: null,
      numberVacancies: v.posicoes,
    })),
    inscricoes,
    pastas: PASTAS_DA_SIMULACAO,
  };
}

// ══ AS FASES ═══════════════════════════════════════════════════════════════════════════════════

/**
 * AS FASES DO GUIA DE VALIDAÇÃO, e são só estas que o `todas` roda, na ordem.
 *
 * A SIMULAÇÃO FICA DE FORA DELA de propósito: ela troca a lista de vagas ativas inteira, e o ciclo
 * encerra a vaga espelhada que saiu da lista. Rodada dentro do `todas`, ela desfaria o estado que a
 * fase `5-volta` acabou de montar, e quem lesse o resultado veria a fase 5 falhando sem ter falhado.
 */
export const FASES_DO_GUIA = ["2", "3", "4", "5-fecha", "5-volta"] as const;

export const FASES = [...FASES_DO_GUIA, "simulacao"] as const;
export type Fase = (typeof FASES)[number];

interface Lote {
  vagasAtivas: Record<string, unknown>[];
  inscricoes: Record<number, Record<string, unknown>[]>;
  descricao: string;
  /**
   * AS PASTAS QUE A PORTA DEVOLVE. Ausente, valem as `PASTAS` das fases do guia.
   *
   * Ela entrou no lote, e não ficou constante global, porque a fase de SIMULAÇÃO precisa das cinco
   * pastas que traduzem para as cinco etapas do funil, e as fases do guia precisam continuar com
   * exatamente as quatro delas (a quarta sem de/para é a fase 4 inteira). Um conjunto só serviria
   * mal aos dois: acrescentar pasta às fases do guia mudaria o que a fase 4 mede.
   */
  pastas?: { idVacancyFolder: number; name: string }[];
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
    case "simulacao":
      return loteDaSimulacao();
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
      if (caminho === CAMINHO_PASTAS) return { data: lote.pastas ?? PASTAS };
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
      ? [...FASES_DO_GUIA]
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
    /*
     * O SAL DA MARCA DE PASTA, lido da variável `AS_MARCA_SAL` do ambiente em que o arnês roda.
     *
     * SEM VALOR PADRÃO DE CONVENIÊNCIA, e o `?? ""` não é um: ele apenas entrega a AUSÊNCIA ao
     * ciclo, que RECUSA rodar sem sal, de propósito, em vez de marcar pasta sem chave. Inventar um
     * literal aqui faria o arnês produzir marcas que nenhum outro ambiente reproduz, e ainda poria
     * uma chave dentro do repositório.
     *
     * O VALOR NÃO SAI DAQUI: não é logado, não é impresso no resumo e não entra em teste. Só o
     * NOME da variável pode ser dito em voz alta, que é a mesma disciplina da URL do banco logo
     * acima (dela só sai o nome do database, nunca a senha).
     */
    salDaMarca: process.env.AS_MARCA_SAL ?? "",
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
