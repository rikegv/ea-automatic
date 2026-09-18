/**
 * ─ A PROJEÇÃO DA VARREDURA DO PANDAPÉ, E ELA É O CORAÇÃO DO §A.6 DESTA FRENTE ──────────────────────────────────────────
 *
 * `GET /v2/matches` NÃO devolve um resumo: devolve o CURRÍCULO INTEIRO, 58 campos por inscrição,
 * com `summary` (texto livre), `experiences` (empresa, cargo e salário), `studies`, endereço,
 * latitude, longitude, e QUATRO CAMPOS DE DADO PESSOAL SENSÍVEL do art. 11 da LGPD: `idRace`,
 * `idSexualOrientation`, `idGenderIdentity` e `deficiencies`.
 *
 * ┌─ A PROJEÇÃO É UMA LISTA DO QUE PODE, MONTADA CAMPO A CAMPO ──────────────────────────────────┐
 * │ NUNCA por espalhamento com `delete` dos sensíveis, e a diferença não é de estilo: o           │
 * │ espalhamento carrega o campo NOVO que a API passar a devolver amanhã, e ninguém revisa         │
 * │ integração que não quebrou. Com a lista positiva, campo novo simplesmente não existe deste     │
 * │ lado, e quem quiser um tem de vir aqui declará-lo, que é o ponto em que alguém lê o que passa. │
 * │                                                                                                │
 * │ O OBJETO DEVOLVIDO É NOVO, e isso também é deliberado: devolver o mesmo objeto com campos      │
 * │ "ignorados" deixaria o currículo inteiro vivo na memória do processo, pronto para ser logado   │
 * │ por quem escrever `log.info('item', item)` daqui a seis meses.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PRECEDENTE DA CASA está em `pandape/pandape-api.service.ts`, no
 * `getFormulariosDocumentosComStatus`, que lê o formulário do Pandapé e devolve só o que o EA
 * consome (§A.6 na resposta bancária: o formulário traz agência e conta, e o EA lê só o nome do
 * banco).
 *
 * ┌─ CIDADE E UF FICARAM DE FORA, E É DECISÃO MEDIDA, NÃO ESQUECIMENTO ──────────────────────────┐
 * │ O plano mapeia `location3`/`location2` para `as_candidatos.cidade`/`uf`, e esses dois nomes   │
 * │ NÃO APARECEM na lista de campos medidos contra a API real (o que foi medido foi `cep`,        │
 * │ `address`, `addressNumber`, `latitude`, `longitude`). Na API, `Location2` e `Location3` são   │
 * │ DICIONÁRIOS (`/v2/dictionaries/location2` e `location3`, estado e cidade), o que torna        │
 * │ provável que no item eles venham como ID e não como nome.                                     │
 * │                                                                                               │
 * │ ERRAR AQUI É CARO E SILENCIOSO: pegar `address` por engano põe LOGRADOURO dentro de `cidade`, │
 * │ que é justamente a coluna que o expurgo PRESERVA de propósito (cidade e UF sozinhas não       │
 * │ identificam ninguém e sustentam a estatística regional). O dado pessoal sobreviveria à         │
 * │ anonimização, sem nada falhar.                                                                │
 * │                                                                                               │
 * │ Enquanto o nome real não for CONFIRMADO contra a API, as duas colunas não são escritas. Elas  │
 * │ são nuláveis, ninguém depende delas para a ingestão funcionar, e acrescentá-las depois é uma  │
 * │ linha aqui. O caso está reportado ao coordenador.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** O item cru, como a API entrega: 58 campos, dos quais quatro são do art. 11. */
export type ItemCruDeMatch = Record<string, unknown>;

/**
 * O QUE SOBRA DE UMA INSCRIÇÃO DEPOIS DA PROJEÇÃO. Tipo de retorno EXPLÍCITO, e é ele que faz o
 * compilador recusar o campo novo que alguém tente carregar junto.
 */
export interface InscricaoProjetada {
  idCandidate: string;
  /** Primeiro nome e sobrenome, as duas metades do `as_candidatos.nome`. */
  name: string;
  surname: string;
  /** Chave técnica. NUNCA em log, nunca em payload de fila, nunca em mensagem de erro (§A.6). */
  cpf: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  idVacancy: number;
  idVacancyFolder: number | null;
  /** Só para o corte e para a marca de água. NÃO vai para `criado_em` (trava do DIARIO). */
  insertDate: string;
}

/** A vaga, projetada: seis campos dos muitos que `/v2/vacancies` devolve. */
export interface VagaProjetada {
  idVacancy: number;
  reference: string | null;
  job: string | null;
  city: string | null;
  numberVacancies: number | null;
}

/** A pasta, projetada: o id e o nome, que é a entrada do de/para de etapa. */
export interface PastaProjetada {
  idVacancyFolder: number;
  name: string;
}

/*
 * ─ POR QUE ESTE ARQUIVO MORA EM `domain/`, E NÃO DENTRO DA INGESTÃO ────────────────────────────
 *
 * Ele é lido pelos DOIS LADOS da frente: pelo `PandapeApiService` (em `pandape/`, que é quem toca a
 * rede e precisa de um TIPO DE RETORNO projetado) e pelo ciclo da ingestão (em `as/`, que projeta de
 * novo antes de escrever). `domain/` é a camada pura que as duas podem importar sem criar aresta
 * entre os módulos: `as/` nasceu ISOLADO do módulo da Admissão, e uma importação direta de `as/` por
 * `pandape/` abriria essa porta por uma função de projeção.
 *
 * A DUPLA PROJEÇÃO NÃO É REDUNDÂNCIA, É PROFUNDIDADE: a primeira impede que o currículo inteiro
 * saia do cliente HTTP, e a segunda impede que ele entre na escrita, inclusive se alguém ligar o
 * ciclo em outro cliente um dia.
 */

function texto(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * A INSCRIÇÃO, CAMPO A CAMPO. Dez campos entram; os outros quarenta e oito morrem aqui.
 *
 * `idCandidate` vira TEXTO porque é chave de terceiro e vai para `as_identidades_externas`, cuja
 * coluna é `varchar`: o schema diz, com todas as letras, que o identificador é guardado COMO A
 * ORIGEM O ESCREVE, nunca reformatado. Já `idVacancy` continua NÚMERO porque é ele que casa com a
 * lista de vagas e com a chave da varredura.
 */
export function projetarInscricao(item: ItemCruDeMatch): InscricaoProjetada | null {
  const idCandidate = texto(item.idCandidate);
  const idVacancy = numero(item.idVacancy);
  const insertDate = texto(item.insertDate);
  // FAIL-CLOSED: sem pessoa, sem vaga ou sem data de inscrição não há o que ingerir, e chutar
  // qualquer um dos três criaria linha órfã ou pessoa duplicada. A inscrição é descartada e o ciclo
  // segue, que é o comportamento do resto do arquivo diante de item ruim.
  if (idCandidate === null || idVacancy === null || insertDate === null) return null;
  return {
    idCandidate,
    name: texto(item.name) ?? "",
    surname: texto(item.surname) ?? "",
    cpf: texto(item.cpf),
    email: texto(item.email),
    phone: texto(item.phone),
    birthDate: texto(item.birthDate),
    idVacancy,
    idVacancyFolder: numero(item.idVacancyFolder),
    insertDate,
  };
}

/** A vaga, campo a campo. `numberVacancies` sai como veio; quem trata o zero é o repositório. */
export function projetarVaga(item: Record<string, unknown>): VagaProjetada | null {
  const idVacancy = numero(item.idVacancy);
  if (idVacancy === null) return null;
  return {
    idVacancy,
    reference: texto(item.reference),
    job: texto(item.job),
    city: texto(item.city),
    numberVacancies: numero(item.numberVacancies),
  };
}

/** A pasta, campo a campo. Sem nome não há chave de de/para, e a pasta é descartada. */
export function projetarPasta(item: Record<string, unknown>): PastaProjetada | null {
  const id = numero(item.idVacancyFolder);
  const nome = texto(item.name);
  if (id === null || nome === null) return null;
  return { idVacancyFolder: id, name: nome };
}
