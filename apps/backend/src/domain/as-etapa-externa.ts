import { CANDIDATURA_SITUACOES, type CandidaturaSituacao } from "@ea/shared-types";

/**
 * ─ O VOCABULÁRIO DO DE/PARA DE ETAPA EXTERNA (A&S, fundação da plataforma unificadora) ─────────
 *
 * ESTE ARQUIVO É DOMÍNIO PURO: nenhuma consulta, nenhuma injeção, nenhum Nest. Ele responde duas
 * perguntas, e só elas: "qual é a CHAVE de um nome que veio de fora?" e "o que uma linha de de/para
 * quer dizer?". Quem vai ao banco é `as/depara/depara-etapa-externa.service.ts`.
 *
 * ┌─ POR QUE A CHAVE É NORMALIZADA, E NÃO O NOME CRU ──────────────────────────────────────────────┐
 * │ Os nomes das pastas do Pandapé são TEXTO LIVRE, escritos por quem abriu a vaga, e mudam DE     │
 * │ VAGA PARA VAGA. Os dez nomes reais medidos na API da conta (mapa de alcance, seção 3) vêm com  │
 * │ caixa irregular no meio da palavra (`Pré-selecionadoS`), com vírgula (`SHORT LIST,             │
 * │ ENCAMINHADOS CLIENTE`), com acento e com instrução entre parênteses. Casar por igualdade de    │
 * │ texto cru faria o de/para funcionar numa vaga e falhar na vaga do lado, em silêncio, e o       │
 * │ sintoma seria "a etapa da pessoa parou de andar", meses depois de alguém digitar um espaço a   │
 * │ mais.                                                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * AS FONTES EXTERNAS, em lista FECHADA.
 *
 * ELA É O ÚNICO LUGAR ONDE A LISTA EXISTE, e o CHECK das duas tabelas novas é DERIVADO daqui
 * (`db/schema/tables.ts`). Uma lista digitada no banco e outra no código concordam por coincidência
 * até a primeira fonte nova, e aí `DIGAI`, `digai` e `Digai` viram três origens diferentes do mesmo
 * sistema, cada uma arrastando o seu `unique (fonte, identificador)` próprio: a mesma pessoa
 * duplicaria sem que nada falhasse.
 *
 * NÃO MORA NO `shared-types` DE PROPÓSITO: aquele arquivo é de DONO ÚNICO (§A.39, o dono é o
 * coordenador) e esta frente não tem tela nem rota, logo o frontend não precisa saber desta lista.
 */
export const FONTES_EXTERNAS = ["PANDAPE", "DIGAI"] as const;
export type FonteExterna = (typeof FONTES_EXTERNAS)[number];

/** Fail-closed: o que não estiver na lista NÃO é fonte, e não vira consulta ao de/para. */
export function ehFonteExterna(v: string): v is FonteExterna {
  return (FONTES_EXTERNAS as readonly string[]).includes(v);
}

/**
 * A CHAVE DE BUSCA de um nome de etapa vindo de fora: sem acento, sem o que está entre parênteses,
 * minúsculas, pontuação virando espaço, espaços colapsados.
 *
 * ┌─ ESTA FUNÇÃO TEM UMA GÊMEA, E QUEM MEXER NUMA PRECISA OLHAR A OUTRA ───────────────────────────┐
 * │ A gêmea é `normalizarLabel`, em `pandape/resolver-tipo-documento.ts`, que normaliza RÓTULO DE   │
 * │ DOCUMENTO do Pandapé e está em produção. O corpo é o mesmo, e a duplicação é DELIBERADA: o     │
 * │ módulo de A&S nasce ISOLADO do módulo da Admissão (decisão registrada em `as/as.module.ts`, a  │
 * │ mesma disciplina que deixou o Alto Volume nascer sem quebrar Esteira e Gerenciador), e importar │
 * │ dali criaria a primeira dependência de código entre os dois, por uma função de dez linhas.      │
 * │                                                                                                │
 * │ O QUE A DUPLICAÇÃO COBRA, e está escrito aqui para ninguém descobrir sozinho: as duas          │
 * │ respondem sobre o MESMO ATS, então uma correção de normalização que valha para um lado quase   │
 * │ sempre vale para o outro. Mexeu aqui, abra a gêmea; mexeu lá, abra esta.                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PARÊNTESE SAI, E HÁ UM CASO REAL QUE PROVA QUE ISSO IMPORTA: a etapa
 * `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` carrega INSTRUÇÃO PARA QUEM OPERA A VAGA, não
 * o nome da etapa. Mantendo o parêntese, a mesma etapa em duas vagas (uma com a instrução, outra
 * sem) viraria duas chaves distintas, e o diretor teria de mapear a mesma coisa duas vezes.
 *
 * MINÚSCULAS, e não maiúsculas, por UMA razão prática: é o que a gêmea faz, e as duas chaves
 * conviverão nos mesmos olhos por muito tempo. O que importa é a chave ser INSENSÍVEL à caixa, e
 * qualquer um dos dois lados resolve isso; divergir da gêmea só criaria uma diferença para alguém
 * tropeçar.
 */
export function normalizarChaveExterna(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * UMA LINHA DO DE/PARA, do jeito que ela sai do banco e do jeito que o domínio a entende.
 *
 * OS DOIS CAMPOS SÃO NULÁVEIS E O BANCO EXIGE UM DELES (CHECK), porque nem toda etapa externa é um
 * caneco do funil: `Descartados` não move a pessoa de etapa, muda o DESFECHO dela, e forçar uma
 * etapa ali escreveria no histórico um movimento que não aconteceu.
 */
export interface LinhaDeParaEtapaExterna {
  etapaCodigo: string | null;
  situacao: CandidaturaSituacao | null;
  /**
   * O MOTIVO QUE A INGESTÃO VAI GRAVAR na candidatura quando esta pasta externa chegar. Nulo é o
   * normal, e é o estado de toda pasta que não é descarte.
   *
   * ┌─ ELE EXISTE PORQUE O DESFECHO SOZINHO NÃO CONTA A HISTÓRIA (decisão do diretor, 17/09/2026) ┐
   * │ `RETORNO NEGATIVO` e `Descartados` caem no MESMO desfecho (`DESCARTADO`) e são coisas       │
   * │ diferentes: uma é o cliente recusando, a outra é a seleção descartando. Quem lê a tela      │
   * │ depois precisa saber qual foi, e o vocabulário fechado de situações não pode crescer por    │
   * │ causa da tradução de UMA fonte. O motivo é o campo certo para a diferença.                   │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * §A.6: é TEXTO DE CONFIGURAÇÃO REVISADA, nunca cópia automática de campo vindo da API. O valor
   * acaba dentro da candidatura de uma PESSOA, e um duto automático do ATS para cá levaria dado de
   * terceiro para dentro da base sem ninguém ler o que passa.
   */
  motivoPadrao: string | null;
}

/**
 * O QUE O RESOLVEDOR DEVOLVE.
 *
 * `mapeada: false` NÃO É ERRO, é resposta: é o estado normal das cinco etapas do Pandapé que o
 * diretor ainda não decidiu, e o chamador tem de saber não fazer nada com ela.
 */
export type ResolucaoEtapaExterna =
  | { mapeada: false }
  | ({ mapeada: true } & LinhaDeParaEtapaExterna);

/** A resposta de quem não sabe. Constante nomeada para o fail-closed ser LIDO, não deduzido. */
export const NAO_MAPEADA: ResolucaoEtapaExterna = { mapeada: false };

/**
 * A LEITURA DE UMA LINHA, como função PURA, para a regra ser testável sem banco.
 *
 * ┌─ FAIL-CLOSED, E É A REGRA INTEIRA DESTA PEÇA ──────────────────────────────────────────────────┐
 * │ SEM LINHA, NÃO MAPEADA. Nunca "a etapa parecida", nunca "a primeira do funil", nunca um        │
 * │ `?? 'CAPTACAO'` de conveniência. Chutar o caneco escreveria no histórico de uma PESSOA um       │
 * │ movimento que ninguém fez, e histórico de seleção não se desfaz: a trilha passaria a afirmar    │
 * │ que alguém foi para a entrevista que nunca teve.                                                │
 * │                                                                                                 │
 * │ LINHA INATIVA TAMBÉM É NÃO MAPEADA, e por isso o `ativo` é filtrado na CONSULTA e conferido     │
 * │ aqui: desligar um de/para é o gesto que o diretor tem para dizer "pare de confiar nesta         │
 * │ tradução", e uma leitura que ignorasse o flag transformaria esse gesto em nada.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function lerLinhaDePara(
  linha: LinhaDeParaEtapaExternaCrua | null | undefined,
): ResolucaoEtapaExterna {
  if (!linha || linha.ativo === false) return NAO_MAPEADA;
  const etapaCodigo = linha.etapaCodigo ?? null;
  // A SITUAÇÃO É PENEIRADA ANTES DA GUARDA, e a ordem é o que torna a guarda honesta: peneirar
  // depois deixaria passar uma linha cuja única informação é uma situação DESCONHECIDA, como se
  // ela estivesse mapeada para coisa nenhuma.
  const situacao = situacaoConhecida(linha.situacao ?? null);
  // A LINHA VAZIA É TRATADA COMO AUSENTE, e não como "mapeada para nada". O CHECK do banco já
  // impede que ela exista, e esta guarda é a segunda fechadura: uma linha que escapasse por SQL
  // cru viraria um "mapeada: true" que não diz o que fazer, e o chamador acreditaria nela.
  if (etapaCodigo === null && situacao === null) return NAO_MAPEADA;
  // O MOTIVO NÃO DECIDE NADA, ELE ACOMPANHA. Ele é peneirado DEPOIS da guarda de propósito: uma
  // linha que só tenha motivo, sem etapa e sem desfecho, continua sendo NÃO MAPEADA, porque motivo
  // não diz o que fazer com a pessoa. Aceitá-lo como destino faria o chamador achar que tem ordem.
  return { mapeada: true, etapaCodigo, situacao, motivoPadrao: motivoLimpo(linha.motivoPadrao) };
}

/**
 * A LINHA COMO ELA SAI DO BANCO, com o motivo OPCIONAL.
 *
 * O opcional aqui não é folga: a coluna nasceu na migration 0111, depois da tabela, e um chamador
 * que leia só as colunas antigas continua sendo um chamador legítimo, que recebe motivo nulo. O que
 * NÃO é opcional é o resultado: `ResolucaoEtapaExterna` sempre traz o campo, nulo quando não há.
 */
export type LinhaDeParaEtapaExternaCrua = Omit<LinhaDeParaEtapaExterna, "motivoPadrao"> & {
  motivoPadrao?: string | null;
  ativo?: boolean;
};

/**
 * MOTIVO EM BRANCO É MOTIVO AUSENTE, e a limpeza mora aqui por ser a mesma armadilha da §A.40 na
 * frente da Central de Vagas: um campo obrigatório que qualquer um contorna com três espaços. Uma
 * configuração salva com espaços viraria um `motivo_descarte` visualmente vazio na candidatura de
 * uma pessoa, indistinguível de "ninguém preencheu" para quem lê, e distinto dele para quem filtra.
 */
function motivoLimpo(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * A SITUAÇÃO SÓ VALE SE FOR DO VOCABULÁRIO. Fail-closed pela mesma razão do bloco acima: a coluna
 * é `varchar` com CHECK, e um valor que tenha entrado por SQL cru antes de o CHECK existir viraria
 * uma situação inexistente gravada na candidatura, que a FK não pega porque não há FK aqui.
 */
function situacaoConhecida(v: string | null): CandidaturaSituacao | null {
  if (v === null) return null;
  return (CANDIDATURA_SITUACOES as readonly string[]).includes(v)
    ? (v as CandidaturaSituacao)
    : null;
}
