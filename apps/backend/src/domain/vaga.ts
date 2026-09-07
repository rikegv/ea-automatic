/**
 * REGRAS DE DOMÍNIO DA VAGA (A&S, Central de Vagas, onda 1).
 *
 * Funções PURAS, testáveis sem banco e sem HTTP, no mesmo padrão do resto de `domain/`. A tela e o
 * service consomem daqui; nenhuma delas reimplementa a régua por conta própria.
 */

import type { VagaEscolaridade, VagaStatus } from "@ea/shared-types";

/**
 * NORMALIZAÇÃO DO CÓDIGO. Aparar espaço e subir a caixa é o mínimo para o mesmo código digitado de
 * duas formas ("sl123" e "SL123 ") não virar dois códigos diferentes.
 *
 * A CAIXA ALTA É DELIBERADA e vem da base real: além dos números puros, existe a família `SL...`, e
 * foi exatamente ali que uma limpeza anterior apagou as letras e transformou códigos distintos no
 * mesmo número. Aqui as letras ficam, apenas padronizadas.
 */
export function normalizarCodigoVaga(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/**
 * A TRAVA DE DUPLICIDADE: UM CÓDIGO = UM PROCESSO SELETIVO (correção do diretor, 21/08).
 *
 * O código é o número que o Pandapé gera para UMA abertura, digitado à mão pelo consultor. Cada
 * processo gera um número novo, ninguém reaproveita: então o mesmo cliente com o mesmo cargo tem
 * códigos DIFERENTES a cada abertura, e isso é o correto.
 *
 * O QUE ESTA FUNÇÃO SUBSTITUI: a trava anterior era "um código = um cargo" (barrava o mesmo código
 * apontando para cargos diferentes e liberava o código repetido no mesmo cargo). Ela contradizia o
 * mundo real nas duas pontas: proibia o que acontece e permitia o que não pode. A régua certa não
 * olha o cargo, olha o número: código já usado no sistema é duplicidade, ponto.
 *
 * ALCANCE: vale do CADASTRO NOVO PARA FRENTE. A importação da base (onda 3) NÃO passa por aqui, de
 * propósito, porque a base histórica traz códigos repetidos e travar a importação perderia vaga; lá
 * a linha conflitante entra marcada para revisão. É pelo mesmo motivo que o banco tem índice comum,
 * e não unique, em `vagas.codigo`.
 */
export function codigoJaUsado(codigo: string, existentes: string[]): boolean {
  const alvo = normalizarCodigoVaga(codigo);
  return existentes.some((e) => normalizarCodigoVaga(e) === alvo);
}

/**
 * A CONTRAPARTE DA ABERTURA (frente 2 da OST de 22/08).
 *
 * Toda vaga tem os dois lados preenchidos, e nunca os dois na mão: quem abre é carimbado pelo PAPEL
 * DE A&S da sessão, e a trilha pede só o lado oposto. Recruiter abrindo grava `recruiter = eu` e
 * escolhe o consultor; consultor abrindo grava `consultor = eu` e escolhe o recruiter.
 *
 * POR QUE UMA FUNÇÃO PURA, e não um `if` no service: é a régua que a tela e o backend precisam
 * responder igual. A tela usa para saber qual seletor desenhar, o service para saber em qual coluna
 * carimbar, e as duas leem daqui.
 *
 * `papelAs` nulo é quem não trabalha em A&S: devolve os dois lados vazios, e quem decide o que fazer
 * com isso é o service (hoje, barrar a abertura com mensagem clara).
 */
export function ladosDaVaga(
  papelAs: "CONSULTOR" | "RECRUITER" | null | undefined,
  quemAbreId: string,
  contraparteId: string | null | undefined,
): { consultorId: string | null; recruiterId: string | null } {
  if (papelAs === "RECRUITER") {
    return { recruiterId: quemAbreId, consultorId: contraparteId ?? null };
  }
  if (papelAs === "CONSULTOR") {
    return { consultorId: quemAbreId, recruiterId: contraparteId ?? null };
  }
  return { consultorId: null, recruiterId: null };
}

/**
 * A TRAVA DO FECHAMENTO: não se fecha mais vaga do que se abriu.
 *
 * O nº de vagas fechadas é quantas posições foram preenchidas de fato, então ele cabe dentro da meta
 * e nunca acima dela. Vazio (ninguém informou) não é erro: só o número maior que a meta é.
 *
 * ESTA FUNÇÃO CONTINUA SENDO A PRIMITIVA de UM lado só, e é de propósito: com os dois contadores da
 * vaga (25/08) quem o serviço chama é a `excessoDePosicoes` logo abaixo, que aplica esta mesma régua
 * duas vezes, uma por lado. Manter a primitiva separada é o que deixa a régua de "cabe na meta"
 * escrita e testada em um lugar só, em vez de copiada para o oficial e para o banco.
 */
export function vagasFechadasExcedemPosicoes(
  vagasFechadas: number | null | undefined,
  posicoes: number,
): boolean {
  if (vagasFechadas === null || vagasFechadas === undefined) return false;
  return vagasFechadas > posicoes;
}

/** Os dois lados do contador da vaga, do jeito que a vaga os guarda. */
export interface ContadoresDaVaga {
  /** Meta de contratações de verdade. Nula no rascunho, e aí não há teto a exceder. */
  posicoesOficiais: number | null | undefined;
  /** Meta do excedente aprovado que fica reservado. Zero é resposta, não lacuna. */
  posicoesBanco: number | null | undefined;
}

/** O que foi preenchido de fato, um número por lado. Vazio é "ninguém informou", não zero. */
export interface FechamentoDaVaga {
  vagasFechadas: number | null | undefined;
  vagasFechadasBanco: number | null | undefined;
}

/** Qual lado estourou e por quanto, para a mensagem falar do contador certo. */
export interface ExcessoDePosicoes {
  lado: "OFICIAIS" | "BANCO";
  meta: number;
  informado: number;
}

/**
 * A TRAVA DO FECHAMENTO COM OS DOIS CONTADORES (decisão do diretor, 25/08).
 *
 * OS DOIS LADOS SÃO CONFERIDOS SEPARADAMENTE, e essa é a regra inteira: sobrar vaga no banco não
 * autoriza estourar o oficial, e sobrar no oficial não autoriza estourar o banco. Somar as duas metas
 * e comparar com a soma das contagens passaria "12 oficiais e 1 banco" numa vaga de 10 oficiais e 10
 * de banco, que é exatamente a contratação a mais que a trava existe para impedir.
 *
 * A ORDEM DA CONFERÊNCIA É OFICIAL PRIMEIRO porque é o lado que representa contratação de verdade:
 * quando os dois estouram, o erro que a pessoa lê é o que custa mais caro.
 *
 * META NULA (rascunho) NÃO TEM TETO A EXCEDER: ausência de meta não é meta zero, e recusar o
 * fechamento por causa dela inventaria uma trava que ninguém configurou. META DE BANCO AUSENTE, essa
 * sim, VALE ZERO: a coluna é NOT NULL DEFAULT 0 no banco, então "sem banco" é uma resposta, e fechar
 * uma posição de banco numa vaga que não reservou nenhuma é excesso legítimo.
 *
 * Devolve `null` quando está tudo dentro da meta, ou o lado que estourou. Não monta a mensagem: quem
 * escreve para a pessoa é o serviço, que é quem sabe falar HTTP.
 */
export function excessoDePosicoes(
  fechamento: FechamentoDaVaga,
  contadores: ContadoresDaVaga,
): ExcessoDePosicoes | null {
  const { posicoesOficiais, posicoesBanco } = contadores;

  if (
    posicoesOficiais !== null &&
    posicoesOficiais !== undefined &&
    vagasFechadasExcedemPosicoes(fechamento.vagasFechadas, posicoesOficiais)
  ) {
    return { lado: "OFICIAIS", meta: posicoesOficiais, informado: fechamento.vagasFechadas! };
  }

  const metaBanco = posicoesBanco ?? 0;
  if (vagasFechadasExcedemPosicoes(fechamento.vagasFechadasBanco, metaBanco)) {
    return { lado: "BANCO", meta: metaBanco, informado: fechamento.vagasFechadasBanco! };
  }

  return null;
}

/**
 * O STATUS DORMENTE, LIDO DE VOLTA (item 8 do mapa do time, 07/09).
 *
 * "VAGA_BANCO" saiu da lista de status (`VAGA_STATUS`, no shared-types) e nada mais o escreve: o DTO
 * valida contra aquela lista, então nenhuma vaga nova pode nascer com ele. O valor, porém, CONTINUA
 * no enum do Postgres, porque `ALTER TYPE ... DROP VALUE` não existe.
 *
 * POR QUE UMA CONVERSÃO EXPLÍCITA, e não um `as VagaStatus` na hora de montar a listagem: o cast
 * calaria o compilador e deixaria o valor cru chegar à tela, onde `VAGA_STATUS_LABEL[status]` daria
 * `undefined` (pill sem texto) e a contagem dos cards faria `undefined + 1`, ou seja, um KPI escrito
 * NaN. O jeito de uma linha esquecida não derrubar a tela é traduzi-la na entrada, uma vez só.
 *
 * TRADUZ PARA "ABERTA" porque era isso que a vaga de banco era: uma vaga VIVA que reservava posições
 * excedentes. O que dizia quantas eram nunca foi o status, e sim o CONTADOR `posicoes_banco`, que
 * segue existindo e não foi tocado. Nenhuma informação se perde na tradução.
 *
 * HOJE ELA NUNCA DISPARA: ZERO linhas usavam o status quando ele saiu, conferido em produção e em
 * homologação. Ela existe para o caso de uma linha antiga aparecer, não para o caso comum.
 */
export function statusVivoDaVaga(status: string): VagaStatus {
  return status === "VAGA_BANCO" ? "ABERTA" : (status as VagaStatus);
}

/**
 * A ESCOLARIDADE DORMENTE, LIDA DE VOLTA (item 3 do mapa do time, 07/09). Mesma história do status
 * acima, e por isso o mesmo tratamento, em vez de um cast.
 *
 * O "TECNICO" solto saiu da lista oferecida quando ela ganhou Técnico Incompleto, Cursando e
 * Completo: mantê-lo daria TRÊS opções de Técnico na tela, com o consultor adivinhando qual usar.
 *
 * TRADUZ PARA "TECNICO_COMPLETO" porque era isso que a exigência dizia: vaga que pedia "Técnico"
 * pedia o curso técnico CONCLUÍDO. Traduzir para o incompleto afrouxaria uma exigência que ninguém
 * afrouxou, e é o erro que custa caro dos dois: melhor manter a régua onde ela estava.
 *
 * ZERO vagas usavam o valor quando ele saiu, conferido nos dois bancos. Isto é rede, não caminho.
 */
export function escolaridadeVivaDaVaga(
  escolaridade: string | null,
): VagaEscolaridade | null {
  if (escolaridade === null) return null;
  return escolaridade === "TECNICO" ? "TECNICO_COMPLETO" : (escolaridade as VagaEscolaridade);
}
