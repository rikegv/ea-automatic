import {
  lerLinhaDePara,
  normalizarChaveExterna,
  type FonteExterna,
} from "../../domain/as-etapa-externa";
import type {
  DependenciasDaVarredura,
  Escrita,
  ResumoDoCiclo,
} from "./ingestao-portas";
import {
  projetarInscricao,
  projetarPasta,
  projetarVaga,
  type InscricaoProjetada,
  type VagaProjetada,
} from "../../domain/pandape-varredura-projecao";

/**
 * ─ A INGESTÃO DO PANDAPÉ POR VARREDURA: O CICLO, SEM NEST E SEM BANCO ──────────────────────────
 *
 * Requisito medido contra a API real em `docs/PLANO-INGESTAO-PANDAPE-VARREDURA.md`, mais a seção
 * RESOLUÇÃO DOS VETOS, que prevalece sobre o corpo do plano. 621 vagas ativas, 137.654 inscrições
 * vivas, 58 campos por inscrição, 35% das inscrições em pasta sem tradução, volta a cada 30 minutos.
 *
 * ┌─ O ARQUIVO NÃO IMPORTA NADA DE INFRAESTRUTURA, E É ISSO QUE O TORNA AUDITÁVEL ───────────────┐
 * │ Todo efeito passa pelas quatro portas (`ingestao-portas.ts`). O contrato do `tester` roda este │
 * │ ciclo contra um mundo falso que ANOTA requisição, escrita, job e log, e afirma sobre o         │
 * │ REGISTRO, nunca sobre o texto do fonte: procurar a palavra `atualizado_em` no código ficaria    │
 * │ verde com o defeito aberto no dia em que alguém escrevesse a mesma coisa por outro caminho.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS FORMAS DE RODAR, E POR QUE ELAS COMPARTILHAM CADA LINHA DE LÓGICA ──────────────────┐
 * │ `executarCicloDeIngestao` dá a volta inteira em uma chamada, e é o que o contrato audita.      │
 * │ Em PRODUÇÃO a volta é ROLANTE: um job de DESCOBERTA (`descobrirVagasAtivas`) e um job por      │
 * │ PÁGINA (`varrerPaginaDaVaga`), porque o limiter do BullMQ conta JOBS e não requisições: uma    │
 * │ volta inteira dentro de um job só passaria por baixo do limiter e daria o pico que a §A.5      │
 * │ existe para impedir (o excesso do EA atrasa o webhook que alimenta a folha).                   │
 * │                                                                                                │
 * │ AS DUAS CHAMAM AS MESMAS DUAS FUNÇÕES. O que difere é só quem controla o laço, e é por isso    │
 * │ que a auditoria do ciclo monolítico vale para o caminho de produção.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de pessoal sai daqui. O log conta vaga, página e quantidade; o payload do job é
 * `{ idVacancy, page }` e nada mais; e o erro do driver passa pelo funil `mensagemDoErro`, porque o
 * `detail` do Postgres carrega o VALOR que violou a restrição e a `query` carrega os parâmetros.
 */

/** A fonte desta ingestão, do vocabulário FECHADO. `Pandape` e `pandape` seriam outras duas. */
const FONTE: FonteExterna = "PANDAPE";

/** Medido: `PageSize=200` é o mais rápido de RELÓGIO (1,45s contra 3,44s do 1.000). */
export const TAMANHO_DA_PAGINA = 200;

/**
 * TETO DE PÁGINAS POR VAGA, e ele é uma trava de laço, não uma régua de negócio. A maior vaga medida
 * tem 5.451 inscrições, ou 28 páginas; o teto é folgado e existe só para que uma API que devolva
 * sempre a mesma página não gire para sempre.
 */
const MAXIMO_DE_PAGINAS = 200;

/** Os três caminhos que a varredura lê. Nenhum deles escreve no funil do Pandapé (GET apenas). */
export const CAMINHO_VAGAS = "/v2/vacancies";
export const CAMINHO_PASTAS = "/v2/vacancy-folders";
export const CAMINHO_INSCRICOES = "/v2/matches";

/** As tabelas escritas, nomeadas uma vez. */
const T_CANDIDATOS = "as_candidatos";
const T_IDENTIDADES = "as_identidades_externas";
const T_CANDIDATURAS = "as_candidaturas";
const T_VAGAS = "vagas";
const T_MARCA = "as_varredura_vagas";
const T_CONFLITOS = "as_ingestao_conflitos";

/**
 * AS COLUNAS DO CANDIDATO QUE A INGESTÃO ESCREVE, e a lista é a projeção inteira.
 *
 * `criado_em` e `atualizado_em` NÃO ESTÃO AQUI, E A AUSÊNCIA É A TRAVA DO DIARIO: as duas têm
 * `default now()` e NÃO têm `$onUpdate` (`db/schema/tables.ts`), então o Drizzle não as toca
 * sozinho. Basta não citá-las.
 *   - citar `atualizado_em` empurraria o relógio do expurgo de quem não tem candidatura
 *     (`greatest(criado_em, atualizado_em)`) 48 vezes por dia, e a pessoa NUNCA expiraria;
 *   - citar `criado_em` com o `insertDate` do ATS faria a pessoa nascer com o prazo de 2 anos
 *     possivelmente JÁ VENCIDO, e a varredura seguinte a anonimizaria. Irreversível.
 *
 * `banco_talentos` também não está, e o schema proíbe com todas as letras: a ingestão insere SEM
 * usuário autor, e o único escritor daquela coluna é `aplicarRetencao`, com cadeado de SUPER_ADMIN.
 *
 * `origem` NÃO É ESCRITA PELO CICLO, e sim pelo REPOSITÓRIO (`ingestao-repositorio.ts`): ela não é
 * dado que veio no item, é a assinatura de QUEM ESTÁ ESCREVENDO, e o ciclo não tem como saber por
 * qual adaptador ele está ligado.
 */
const COLUNAS_DO_CANDIDATO = ["nome", "cpf", "email", "telefone", "data_nascimento"] as const;

/** O que cada função de varredura devolve para quem controla o laço. */
export interface ResultadoDaPagina {
  /** A próxima página a ler, ou `null` quando esta vaga acabou nesta volta. */
  proximaPagina: number | null;
}

/** Uma vaga espelhada, já casada com a linha do EA. */
export interface VagaEspelhada {
  idVacancy: number;
  vagaId: string;
}

export function novoResumo(): ResumoDoCiclo {
  return {
    vagasVarridas: 0,
    paginasLidas: 0,
    pessoasCriadas: 0,
    candidaturasCriadas: 0,
    etapasNaoMapeadas: [],
    conflitosParaRevisao: 0,
    erros: 0,
  };
}

/**
 * A VOLTA INTEIRA, em uma chamada. É esta função que o contrato do `tester` audita.
 *
 * A LEITURA É SEMPRE COMPLETA, e o "só os novos" é otimização de ESCRITA, não de leitura. O plano
 * mede por quê: MOVER ALGUÉM DE PASTA NÃO ALTERA O `insertDate`, e a lista não vem ordenada por
 * `modifyDate`. Quem parasse de paginar na marca de água nunca mais veria mudança nenhuma daquela
 * inscrição, nem a troca de etapa nem o telefone corrigido. A volta completa custa 660 requisições
 * contra 622 da incremental, 6% de diferença, e é por isso que se lê tudo e se escreve só o que
 * mudou.
 */
export async function executarCicloDeIngestao(
  deps: DependenciasDaVarredura,
): Promise<ResumoDoCiclo> {
  const resumo = novoResumo();
  const vagas = await descobrirVagasAtivas(deps, resumo);
  for (const vaga of vagas) {
    let pagina: number | null = 1;
    while (pagina !== null && pagina <= MAXIMO_DE_PAGINAS) {
      const r: ResultadoDaPagina = await varrerPaginaDaVaga(deps, vaga, pagina, resumo);
      pagina = r.proximaPagina;
    }
  }
  return resumo;
}

/**
 * A FRONTEIRA DO CICLO: UMA chamada, as vagas ATIVAS, e nada mais.
 *
 * Espelha cada vaga ativa e, no fim, ENCERRA as espelhadas que saíram da lista. Devolve o par
 * (idVacancy, id da vaga do EA) de tudo que deve ser varrido nesta volta.
 */
export async function descobrirVagasAtivas(
  deps: DependenciasDaVarredura,
  resumo: ResumoDoCiclo,
): Promise<VagaEspelhada[]> {
  const resposta = await deps.http.requisitar("GET", CAMINHO_VAGAS, {
    VacancyStatus: 2,
    Page: 1,
    PageSize: 1000,
  });
  const cruas = listaDaResposta(resposta);
  const espelhadas: VagaEspelhada[] = [];
  const ativos: number[] = [];

  for (const crua of cruas) {
    const vaga = projetarVaga(crua);
    if (vaga === null) continue;
    resumo.vagasVarridas += 1;
    ativos.push(vaga.idVacancy);
    try {
      const vagaId = await espelharVaga(deps, vaga);
      espelhadas.push({ idVacancy: vaga.idVacancy, vagaId });
    } catch (err) {
      // UMA VAGA RUIM NÃO DERRUBA A VOLTA: são 621, e a volta leva 26 minutos.
      resumo.erros += 1;
      deps.log.erro("falha ao espelhar a vaga", {
        vaga: vaga.idVacancy,
        motivo: mensagemDoErro(err),
      });
    }
  }

  /*
   * ─ O CICLO DE VIDA DA VAGA ESPELHADA, E ELE É O ACHADO 8 DO `seguranca` ────────────────────
   *
   * A vaga que SAIU da lista de ativas encerrou no ATS, e o espelho acompanha. Sem isso, a cláusula
   * de proteção do expurgo (`retencao-candidatos.service.ts`,
   * `(s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null)`) deixa TODA pessoa viva
   * numa vaga espelhada protegida PARA SEMPRE, com CPF, e-mail, telefone e nascimento, sem nada
   * falhar e sem tela nenhuma acusar. Com 137.654 inscrições, é o furo 1 de LGPD renascendo sobre a
   * população dominante.
   *
   * ┌─ A LISTA VAZIA NÃO ENCERRA NINGUÉM, E ESTA GUARDA É O OPOSTO DO DEFEITO ACIMA ───────────┐
   * │ Um GET que falhe, um token que expire ou um corpo inesperado devolvem lista VAZIA por aqui.│
   * │ Encerrar "todas as ausentes" nesse instante carimbaria `encerrada_em` em TODAS as vagas    │
   * │ espelhadas de uma vez e ligaria o relógio de retenção de 137 mil pessoas por causa de uma   │
   * │ falha de rede. O erro cai para o lado de NÃO encerrar, que é a mesma direção fail-closed do │
   * │ resto desta frente.                                                                        │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  if (ativos.length > 0 && deps.cicloDeVida) {
    try {
      const encerradas = await deps.cicloDeVida.encerrarAusentes(ativos);
      if (encerradas > 0) deps.log.info("vagas espelhadas encerradas", { encerradas });
    } catch (err) {
      resumo.erros += 1;
      deps.log.erro("falha ao encerrar vagas espelhadas ausentes", { motivo: mensagemDoErro(err) });
    }
  }
  return espelhadas;
}

/**
 * UMA PÁGINA DE UMA VAGA. É a unidade de trabalho da fila: um job, uma requisição de lista.
 *
 * A PARADA TEM DUAS RAZÕES, e as duas são de ESCRITA e não de leitura:
 *   1. o item ficou anterior ou igual à DATA DE CORTE (a lista vem ordenada por `insertDate`
 *      decrescente, medido), então o resto da vaga é passivo antigo e não entra;
 *   2. a página veio MENOR que o tamanho pedido, que é o fim da lista. Ler mais uma página só para
 *      ver o vazio custaria 621 requisições por volta, e a volta já tem orçamento contado.
 */
export async function varrerPaginaDaVaga(
  deps: DependenciasDaVarredura,
  vaga: VagaEspelhada,
  pagina: number,
  resumo: ResumoDoCiclo,
): Promise<ResultadoDaPagina> {
  const resposta = await deps.http.requisitar("GET", CAMINHO_INSCRICOES, {
    IdVacancy: vaga.idVacancy,
    Page: pagina,
    PageSize: TAMANHO_DA_PAGINA,
  });
  const itens = listaDaResposta(resposta);
  resumo.paginasLidas += 1;
  if (itens.length === 0) return { proximaPagina: null };

  let pastas = await nomesDasPastas(deps, vaga.idVacancy);
  /*
   * A PASTA CRIADA NO MEIO DA VOLTA, e é ela que justifica o cache ter invalidação EXPLÍCITA.
   *
   * O mapa de pastas é cacheado por vaga (senão a volta pagaria uma chamada por PÁGINA, 1.086 a
   * mais). Quem abriu a vaga pode criar uma pasta depois de o cache ter sido enchido, e o sintoma
   * seria uma inscrição sem tradução de etapa que NUNCA entra, em silêncio, até o cache vencer.
   * O item diz qual é a pasta dele: se ela não está no mapa, o mapa é recarregado UMA vez.
   */
  const desconhecida = itens.some((cru) => {
    const id = Number((cru as { idVacancyFolder?: unknown }).idVacancyFolder);
    return Number.isFinite(id) && !pastas.has(id);
  });
  if (desconhecida) pastas = await nomesDasPastas(deps, vaga.idVacancy, true);
  const marca = await deps.banco.marcaDaVaga(vaga.idVacancy);
  const corte = deps.dataDeCorte.toISOString();
  let maior = marca;
  let acabou = false;

  for (const cru of itens) {
    const inscricao = projetarInscricao(cru);
    if (inscricao === null) continue;
    if (!ehPosterior(inscricao.insertDate, corte)) {
      // SÓ OS NOVOS: daqui para baixo a lista é passivo antigo (137.654 inscrições vivas).
      acabou = true;
      continue;
    }
    if (maior === null || ehPosterior(inscricao.insertDate, maior)) maior = inscricao.insertDate;
    try {
      await ingerirInscricao(deps, resumo, inscricao, vaga.vagaId, pastas);
    } catch (err) {
      /*
       * §A.6 NO CAMINHO MENOS VIGIADO DE TODOS. O erro do driver carrega `detail` com o VALOR que
       * violou a restrição (num insert de candidato, esse valor é o CPF) e `query` com os
       * parâmetros: `log.erro(err)` publicaria o CPF sem ninguém escrever a palavra CPF em lugar
       * nenhum. Só a MENSAGEM sai daqui, pelo mesmo funil do expurgo.
       */
      resumo.erros += 1;
      deps.log.erro("falha ao ingerir a inscricao", {
        vaga: vaga.idVacancy,
        pagina,
        motivo: mensagemDoErro(err),
      });
    }
  }

  /*
   * A MARCA DE ÁGUA É REGISTRO, E NÃO PARADA DE LEITURA (ver o bloco do topo). Ela só é escrita
   * quando ANDA PARA FRENTE: gravar o máximo de uma página mais antiga puxaria a marca para trás, e
   * regravar o mesmo valor a cada 30 minutos seria escrita inútil na base, para sempre.
   */
  if (maior !== null && maior !== marca) {
    await deps.banco.escrever({
      tabela: T_MARCA,
      acao: "upsert",
      chaveDeConflito: ["id_vacancy_pandape"],
      comparaAntes: ["ultimo_insert_date"],
      valores: { id_vacancy_pandape: vaga.idVacancy, ultimo_insert_date: maior },
    });
  }

  const fim = acabou || itens.length < TAMANHO_DA_PAGINA;
  return { proximaPagina: fim ? null : pagina + 1 };
}

// ── A VAGA ESPELHADA ───────────────────────────────────────────────────────────────────────────

/**
 * A VAGA ENTRA COM `cod_cliente` NULO, e isto não contradiz a §A.5: é a MESMA régua em outra tabela.
 *
 * Na Admissão, `cod_cliente` é OBRIGATÓRIO, então adiar é o único caminho honesto. Em `vagas` a
 * coluna é NULÁVEL DE PROPÓSITO (o schema diz por quê, com o número: só 31 de 164 clientes casaram
 * com o cadastro do EA), e a decisão registrada é "vaga sem cliente resolvido ENTRA, marcada para
 * vínculo manual". INVENTAR `cod_cliente` continua PROIBIDO, e aqui não inventar nem custa adiar.
 *
 * MEDIDO: não existe caminho de API para o cliente da vaga. `GET /v2/clients/requests?idVacancy=`
 * devolveu HTTP 200 com ZERO itens em 5 de 5 vagas, e `idCompanyExternal` tem um único valor
 * distinto nas 587 vagas (é o id da Soulan, não o do cliente final).
 */
async function espelharVaga(deps: DependenciasDaVarredura, vaga: VagaProjetada): Promise<string> {
  const codCliente = await deps.banco.clientePorVaga(vaga.idVacancy);
  const gravada = await deps.banco.escrever({
    tabela: T_VAGAS,
    acao: "upsert",
    /*
     * A CHAVE É O `idVacancy`, E NUNCA O `reference`. Medido: o `reference` tem 558 valores
     * distintos em 587 vagas, ou seja ele REPETE, e casar por ele juntaria vagas diferentes e
     * mandaria as candidaturas para a vaga errada. `codigo` é atributo de origem, não identidade.
     */
    chaveDeConflito: ["id_vacancy_pandape"],
    comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
    valores: {
      id_vacancy_pandape: vaga.idVacancy,
      codigo: vaga.reference,
      nome_divulgacao: vaga.job,
      /*
       * O TEXTO DA CIDADE ("Cidade - UF"), e quem o converte no código do IBGE é o REPOSITÓRIO, que
       * é quem conhece `as_cidades`. Não resolvendo, a coluna fica nula: vaga espelhada sem cidade
       * é vaga marcada para vínculo manual, como a sem cliente.
       */
      cidade_id: vaga.city,
      posicoes_oficiais: vaga.numberVacancies,
      cod_cliente: codCliente,
      cargo_id: null,
      /*
       * NASCE `RASCUNHO`, e o nome aqui é o PAPEL, não o código: quem traduz papel em código é o
       * repositório, contra `as_vaga_status`, porque o diretor renomeia código e a trilha pergunta
       * pelo papel (é a régua que `vagas.service` já segue).
       *
       * POR QUE RASCUNHO: a vaga espelhada nasce sem cliente, sem cargo e sem linha de serviço, ou
       * seja reprovada pela régua `vagaPendencias` do próprio domínio. Nascer ABERTA a publicaria
       * incompleta na Central de Vagas e misturaria, na contagem da tela, o que o time abriu com o
       * que o ATS espelhou. RASCUNHO tem `recebe_candidato = true`, então a candidatura entra desde
       * o primeiro ciclo, e tem `da_trilha = true`, então promovê-la depois é movimento que a
       * trilha já aceita. A escolha entre RASCUNHO e ABERTA é do diretor; a fábrica adota RASCUNHO
       * por ora, e é reversível.
       */
      status: "RASCUNHO",
    },
  });
  return gravada.id;
}

// ── A INSCRIÇÃO ────────────────────────────────────────────────────────────────────────────────

/**
 * UMA INSCRIÇÃO: a ETAPA primeiro (porque é ela que decide se entra), a PESSOA depois, a
 * CANDIDATURA por último.
 */
async function ingerirInscricao(
  deps: DependenciasDaVarredura,
  resumo: ResumoDoCiclo,
  inscricao: InscricaoProjetada,
  vagaId: string,
  pastas: Map<number, string>,
): Promise<void> {
  /*
   * ─ A ETAPA É FAIL-CLOSED, E SEM DE/PARA NADA É ESCRITO ────────────────────────────────────
   *
   * Nem candidato, nem identidade externa, nem candidatura. Medido: 35% das inscrições estão hoje
   * em pasta sem tradução, e são 15 chaves faltando, que são INSUMO DO DIRETOR. Ingerir a pessoa e
   * segurar só a candidatura coletaria dado de cerca de 48 mil pessoas para uso nenhum, o que é o
   * contrário da minimização (§A.6). Escrever `CAPTACAO` nelas seria pior ainda: gravaria no
   * histórico de uma PESSOA um movimento que ninguém fez, e depois não haveria como distinguir quem
   * estava mesmo na Captação de quem foi parar lá por falta de tradução.
   *
   * A CHAVE É NORMALIZADA (`normalizarChaveExterna`), e não o nome cru: os nomes de pasta são texto
   * livre de quem abriu a vaga, com acento, caixa irregular e instrução entre parênteses
   * (`Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)`). Casar por igualdade crua faria a tradução
   * funcionar numa vaga e falhar na vaga do lado, e o sintoma apareceria meses depois como "a etapa
   * da pessoa parou de andar".
   */
  const nomeCru = inscricao.idVacancyFolder === null ? "" : (pastas.get(inscricao.idVacancyFolder) ?? "");
  const chave = normalizarChaveExterna(nomeCru);
  const linha = chave === "" ? null : await deps.banco.deParaEtapa(chave);
  const resolucao = lerLinhaDePara(linha);
  if (!resolucao.mapeada) {
    /*
     * A RECUSA SEM REGISTRO VIRA PERDA SILENCIOSA DE 35% DA ENTRADA. A chave (que é NOME DE PASTA,
     * nunca dado de pessoa) volta no resumo do ciclo para o diretor mapear uma a uma. O ciclo NÃO
     * cria linha de de/para sozinho: `rotulo_externo` e `motivo_padrao` são configuração REVISADA,
     * e o valor acaba dentro da candidatura de uma pessoa.
     */
    if (chave !== "" && !resumo.etapasNaoMapeadas.includes(chave)) {
      resumo.etapasNaoMapeadas.push(chave);
    }
    return;
  }

  const nome = `${inscricao.name} ${inscricao.surname}`.trim();
  if (nome === "") {
    // Sem nome não há pessoa a acompanhar (o schema diz que ele é o único obrigatório), e inventar
    // um rótulo encheria a base de linhas que ninguém reconhece.
    resumo.erros += 1;
    deps.log.erro("inscricao sem nome, nao ingerida", { vaga: inscricao.idVacancy });
    return;
  }

  const candidatoId = await resolverPessoa(deps, resumo, inscricao, nome);
  if (candidatoId === null) return;

  await gravarCandidatura(deps, resumo, {
    candidatoId,
    vagaId,
    etapa: resolucao.etapaCodigo,
    situacao: resolucao.situacao,
    motivo: resolucao.motivoPadrao,
  });
}

/**
 * O DEDUP, NA ORDEM, E ELE É FAIL-CLOSED: identidade primeiro, CPF como desempate, NOME NUNCA.
 *
 * Devolve o id da pessoa, ou `null` quando o ciclo NÃO PODE DECIDIR (conflito) e a inscrição fica
 * para revisão humana.
 */
async function resolverPessoa(
  deps: DependenciasDaVarredura,
  resumo: ResumoDoCiclo,
  inscricao: InscricaoProjetada,
  nome: string,
): Promise<string | null> {
  const identificador = inscricao.idCandidate;
  const valores: Record<string, unknown> = {
    nome,
    cpf: inscricao.cpf,
    email: inscricao.email,
    telefone: inscricao.phone,
    data_nascimento: inscricao.birthDate,
  };
  const comparaAntes = [...COLUNAS_DO_CANDIDATO];

  const porIdentidade = await deps.banco.identidadeExterna(FONTE, identificador);
  const porCpf = inscricao.cpf === null ? null : await deps.banco.candidatoPorCpf(inscricao.cpf);

  if (porIdentidade) {
    /*
     * ─ O CONFLITO: A IDENTIDADE APONTA PARA UMA PESSOA E O CPF PARA OUTRA ────────────────────
     *
     * O CICLO NÃO ESCOLHE E NÃO FUNDE. Fusão automática de duas fichas é IRREVERSÍVEL: o que se
     * junta por engano não se separa depois, porque ninguém sabe mais qual candidatura era de quem.
     * E não escolher SEM AVISAR seria perder a inscrição a cada volta, para sempre, sem ninguém
     * saber que existe um caso a resolver: por isso ele vira linha de revisão.
     *
     * A LINHA DE REVISÃO NÃO CARREGA O CPF NEM O NOME, no molde de `as_retencao_eventos` (que não
     * tem campo de observação livre, e a ausência é a defesa). Os dois ids técnicos bastam para
     * quem for resolver, e nenhum dado pessoal novo é criado para isso.
     */
    if (porCpf && porCpf.id !== porIdentidade.candidatoId) {
      resumo.conflitosParaRevisao += 1;
      await deps.banco.escrever({
        tabela: T_CONFLITOS,
        acao: "upsert",
        // A MESMA INSCRIÇÃO VOLTA A CADA 30 MINUTOS: sem a chave de conflito, um único caso
        // irresolvido viraria 48 linhas por dia, para sempre.
        chaveDeConflito: ["fonte", "identificador"],
        aoConflitoNadaFaz: true,
        valores: {
          candidato_id: porIdentidade.candidatoId,
          fonte: FONTE,
          identificador,
        },
      });
      return null;
    }
    await escreverPessoa(deps, {
      tabela: T_CANDIDATOS,
      acao: "update",
      onde: { id: porIdentidade.candidatoId },
      comparaAntes,
      valores,
    });
    return porIdentidade.candidatoId;
  }

  if (porCpf) {
    // O CPF É O DESEMPATE SECUNDÁRIO: a identidade nova é ANEXADA a quem já existe, em vez de
    // partir a mesma pessoa em duas fichas, cada uma com o seu histórico e o seu relógio.
    await escreverPessoa(deps, {
      tabela: T_CANDIDATOS,
      acao: "update",
      onde: { id: porCpf.id },
      comparaAntes,
      valores,
    });
    await anexarIdentidade(deps, porCpf.id, identificador);
    return porCpf.id;
  }

  /*
   * NÃO HÁ IDENTIDADE E NÃO HÁ CPF QUE CASE: pessoa NOVA, e é isso mesmo.
   *
   * NÃO SE CASA POR NOME, e o veto está no schema: nome é chave fraca. A tentação aparece
   * exatamente aqui (veio inscrição sem CPF e o nome está ali, parecendo suficiente), e o preço de
   * ceder é que dois homônimos viram uma pessoa só, com o histórico de seleção de duas.
   */
  const nova = await escreverPessoa(deps, { tabela: T_CANDIDATOS, acao: "insert", valores });
  resumo.pessoasCriadas += 1;
  await anexarIdentidade(deps, nova.id, identificador);
  return nova.id;
}

/** O `insert`/`update` da pessoa, num ponto só, para a lista de colunas ter um dono. */
async function escreverPessoa(
  deps: DependenciasDaVarredura,
  escrita: Escrita,
): Promise<{ linhasAfetadas: number; id: string }> {
  return deps.banco.escrever(escrita);
}

/**
 * A IDENTIDADE EXTERNA, com `coletado_em` EXPLÍCITO.
 *
 * Deixar o `default now()` responder faria a linha jurar que o dado foi coletado no dia em que a
 * carga rodou, e é esse carimbo que responde, a um titular que perguntar, há quanto tempo o dado
 * existe aqui (exigência E5 do protocolo LGPD).
 *
 * `aoConflitoNadaFaz` porque a linha de identidade é IMUTÁVEL: o par (fonte, identificador) já
 * existe apontando para alguém, e reescrevê-lo seria mover a identidade de uma pessoa para outra em
 * silêncio, que é a fusão que o bloco do conflito existe para impedir.
 */
async function anexarIdentidade(
  deps: DependenciasDaVarredura,
  candidatoId: string,
  identificador: string,
): Promise<void> {
  await deps.banco.escrever({
    tabela: T_IDENTIDADES,
    acao: "upsert",
    chaveDeConflito: ["fonte", "identificador"],
    aoConflitoNadaFaz: true,
    valores: {
      fonte: FONTE,
      identificador,
      candidato_id: candidatoId,
      coletado_em: deps.agora().toISOString(),
    },
  });
}

/**
 * A CANDIDATURA, E AQUI A ESCRITA CONDICIONAL É O RAMO PRINCIPAL DO RELÓGIO DO EXPURGO.
 *
 * `as_candidaturas.atualizado_em` é o insumo do `max(greatest(...))` de
 * `retencao-candidatos.service.ts`, e o ingestor precisa LEGITIMAMENTE escrever etapa e situação
 * aqui: "basta não citar a coluna" NÃO VALE neste ponto. A escrita tem de ser condicional DE
 * VERDADE, comparando campo a campo no SQL, senão 48 voltas por dia por pessoa empurram o relógio e
 * todo mundo que a ingestão tocar deixa de expirar. Dano colateral do mesmo defeito: a tela lê
 * `encerradaEm: asCandidaturas.atualizadoEm` e passaria a mentir a data de encerramento.
 *
 * ┌─ O QUE O DE/PARA NÃO DIZ, A INGESTÃO NÃO ESCREVE ────────────────────────────────────────────┐
 * │ Pasta mapeada só para DESFECHO (`Descartados`, `RETORNO NEGATIVO`) não tem etapa: a coluna    │
 * │ não entra no `set`, e a pessoa fica no caneco em que estava, em vez de voltar para a Captação │
 * │ por efeito colateral da tradução. Do mesmo modo, pasta que não é desfecho não escreve         │
 * │ `situacao` nem `motivo_descarte`: escrever `ATIVO` por padrão RESSUSCITARIA quem um humano    │
 * │ descartou no EA, e escrever `null` no motivo APAGARIA a frase que alguém digitou.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
async function gravarCandidatura(
  deps: DependenciasDaVarredura,
  resumo: ResumoDoCiclo,
  dados: {
    candidatoId: string;
    vagaId: string;
    etapa: string | null;
    situacao: string | null;
    motivo: string | null;
  },
): Promise<void> {
  const valores: Record<string, unknown> = {
    candidato_id: dados.candidatoId,
    vaga_id: dados.vagaId,
  };
  if (dados.etapa !== null) valores.etapa = dados.etapa;
  if (dados.situacao !== null) valores.situacao = dados.situacao;
  if (dados.motivo !== null) valores.motivo_descarte = dados.motivo;

  const gravada = await deps.banco.escrever({
    tabela: T_CANDIDATURAS,
    acao: "upsert",
    // A IDEMPOTÊNCIA DA CANDIDATURA É (candidato, vaga), que o banco já garante para as situações
    // vivas. O `idMatch` NÃO É RESSUSCITADO: ele foi derrubado na migration 0112 de propósito, e
    // guardá-lo em `as_identidades_externas` faria um id de INSCRIÇÃO colidir um dia com um id de
    // PESSOA dentro do mesmo `unique (fonte, identificador)`.
    chaveDeConflito: ["candidato_id", "vaga_id"],
    comparaAntes: ["etapa", "situacao", "motivo_descarte"].filter((c) => c in valores),
    valores,
  });
  if (gravada.linhasAfetadas > 0) resumo.candidaturasCriadas += 1;
}

// ── LEITURA AUXILIAR ───────────────────────────────────────────────────────────────────────────

/**
 * O MAPA `idVacancyFolder` PARA NOME, por vaga.
 *
 * MEDIDO, E MUDA O DESENHO: o `idVacancyFolder` NÃO É COMPARTILHADO ENTRE VAGAS (zero sobreposição
 * em amostra de 6 vagas), então este é um mapa POR VAGA, e não um dicionário global. A chamada é
 * barata (0,38s) e o adaptador de produção a CACHEIA por `idVacancy`, com vida longa: sem o cache,
 * a volta pagaria uma chamada por página em vez de uma por vaga.
 */
async function nomesDasPastas(
  deps: DependenciasDaVarredura,
  idVacancy: number,
  recarregar = false,
): Promise<Map<number, string>> {
  const resposta = await deps.http.requisitar("GET", CAMINHO_PASTAS, { idVacancy, recarregar });
  const mapa = new Map<number, string>();
  for (const cru of listaDaResposta(resposta)) {
    const pasta = projetarPasta(cru);
    if (pasta !== null) mapa.set(pasta.idVacancyFolder, pasta.name);
  }
  return mapa;
}

/**
 * A LISTA DE DENTRO DA RESPOSTA, sem confiar no formato.
 *
 * Aceita `{ data: [...] }` e o array cru, porque as duas formas aparecem na API do Pandapé conforme
 * a versão do endpoint. Qualquer outra coisa vira lista VAZIA, e a direção é a mesma do resto: o que
 * não é reconhecido não é ingerido.
 */
function listaDaResposta(resposta: unknown): Record<string, unknown>[] {
  const bruto = Array.isArray(resposta)
    ? resposta
    : (resposta as { data?: unknown } | null)?.data;
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
}

/**
 * "a" É POSTERIOR A "b"? Compara como INSTANTE quando os dois são datas legíveis, e como TEXTO
 * quando não são.
 *
 * A API entrega `insertDate` em ISO, e o corte também é ISO, então a comparação de texto já
 * ordenaria certo na maioria dos casos. A comparação por instante existe para o caso em que a API
 * varia o sufixo (com e sem `Z`): ali o texto compararia `T10:00:00` com `T10:00:00.000Z` e
 * decidiria pelo caractere, não pelo tempo.
 */
function ehPosterior(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta > tb;
  return a > b;
}

/**
 * A MENSAGEM, E NADA MAIS, do que quer que tenha sido lançado.
 *
 * §A.6 EM UMA LINHA, e é o mesmo funil de `retencao-candidatos.service.ts`: o erro do driver carrega
 * o `detail` do Postgres (o VALOR que violou a restrição) e a `query` (o SQL com os parâmetros).
 * Numa ingestão que mexe em CPF, e-mail e telefone, publicar qualquer um dos dois seria vazar
 * justamente o dado que a minimização existe para conter. Só `message` sai daqui, e o que não for
 * `Error` vira um rótulo fixo em vez de um `String(err)` que serializaria o objeto inteiro.
 */
export function mensagemDoErro(err: unknown): string {
  return err instanceof Error ? err.message : "erro sem mensagem";
}
