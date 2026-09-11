/**
 * ─ O TRANSFORM PURO DA CARGA DO IBGE: lista bruta da fonte para linhas de banco ────────────────
 *
 * ┌─ POR QUE ELE MORA SEPARADO DO RUNNER (pedido do `tester`, aprovado pelo coordenador) ────────┐
 * │ `carga-cidades-ibge.ts` chama `main()` ao ser importado: qualquer teste que o importasse      │
 * │ abriria conexão com o Postgres e sairia para a internet. Aqui não há rede, não há banco e não │
 * │ há relógio, então a idempotência, o descarte do inválido e o caso dos HOMÔNIMOS (cinco "Bom   │
 * │ Jesus", em estados diferentes, que TÊM de sobreviver os cinco) viram teste de mesa.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: dado público de município. Nenhuma informação pessoal passa por este arquivo.
 */

/**
 * A FONTE, CONSTANTE NO CÓDIGO E NUNCA EM VARIÁVEL DE AMBIENTE (condição da auditoria).
 *
 * UMA VARIÁVEL DE AMBIENTE AQUI SERIA UMA PORTA: quem pudesse definir `IBGE_URL` escolheria de onde
 * vêm 5.570 linhas que a tela de abertura de vaga vai oferecer como verdade. A fonte é oficial, é
 * pública e não muda; constante no código, ela é auditável pelo diff.
 *
 * Conferida ao vivo desta VM: responde 200 e devolve 5.571 itens.
 */
export const FONTE_IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

/**
 * AS 27 UNIDADES DA FEDERAÇÃO, digitadas AQUI e não importadas de `@ea/shared-types`.
 *
 * É a única lista deste arquivo que eu deliberadamente NÃO reuso, e a razão é o que ela faz: ela é
 * a régua que decide se a RESPOSTA DA FONTE está sã. Conferir a resposta do IBGE contra uma lista
 * que o próprio sistema pode vir a estender (um "EX" para exterior, por exemplo) faria a validação
 * afrouxar sozinha no dia em que alguém mexesse na outra lista por outro motivo. São 27, são fixas
 * desde 1988, e aqui elas são um invariante e não um catálogo.
 */
export const UFS_IBGE = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/**
 * O PISO DA CONTAGEM. O Brasil tem 5.570 municípios (5.571 com Brasília, que o IBGE devolve como
 * município do DF), e esse número só muda por lei, com anos de tramitação.
 *
 * ELE EXISTE PARA PEGAR A RESPOSTA TRUNCADA, que é o modo de falha que não dá erro: um corte de
 * conexão no meio do JSON, um proxy que devolve página de erro com 200, uma mudança de formato que
 * faz o parse render 40 linhas. Sem o piso, a carga grava o pedaço e volta verde, e o buraco
 * aparece meses depois como "a minha cidade não está na lista".
 */
export const MINIMO_MUNICIPIOS = 5_000;

/** Um item da fonte, com os dois caminhos possíveis da UF (ver `ufDoMunicipio`). */
export interface MunicipioIbge {
  id?: unknown;
  nome?: unknown;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: unknown } } } | null;
  "regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { sigla?: unknown } } } | null;
}

/** A linha como ela entra no banco. `id` é o código do IBGE, que é a chave. */
export interface LinhaCidade {
  id: number;
  nome: string;
  uf: string;
}

export interface TransformIbge {
  linhas: LinhaCidade[];
  /** Os itens que não passaram na validação, com o motivo. Contados, nunca ignorados em silêncio. */
  recusados: { indice: number; motivo: string }[];
  /** Quantos itens vinham repetidos pelo MESMO código do IBGE. */
  duplicados: number;
}

/**
 * A UF, POR DOIS CAMINHOS, e o segundo não é zelo excessivo: o IBGE serve os dois formatos, e
 * municípios criados depois da reforma das regiões (2017) vêm só pelo novo (`regiao-imediata`). Um
 * script que conhecesse um caminho só perderia essas cidades EM SILÊNCIO.
 */
export function ufDoMunicipio(m: MunicipioIbge): string | null {
  const bruta =
    m.microrregiao?.mesorregiao?.UF?.sigla ??
    m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ??
    null;
  if (typeof bruta !== "string") return null;
  const sigla = bruta.trim().toUpperCase();
  return UFS_IBGE.has(sigla) ? sigla : null;
}

/**
 * A LISTA BRUTA VIRANDO LINHAS, COM VALIDAÇÃO LINHA A LINHA (condição da auditoria).
 *
 * TRÊS REGRAS, e cada uma pega um jeito diferente de a fonte mudar embaixo da gente:
 *   . o CÓDIGO tem de ser inteiro de 7 dígitos (é a chave primária, e um `id` de 2 dígitos seria a
 *     resposta de outro endpoint, como o de estados);
 *   . a UF tem de estar entre as 27 (ver `UFS_IBGE`);
 *   . o NOME não pode ser vazio.
 *
 * O QUE NÃO PASSA É CONTADO, NÃO DESCARTADO EM SILÊNCIO. Quem chama decide o que fazer com
 * `recusados`, e o runner ABORTA se houver qualquer um: recusa é sinal de que o formato mudou, e
 * gravar os 5.400 que sobraram seria justamente a carga pela metade que o piso existe para impedir.
 *
 * HOMÔNIMO NÃO É DUPLICATA, e é por isso que a deduplicação é pelo CÓDIGO e nunca pelo nome: há
 * CINCO "Bom Jesus" em estados diferentes (PB, PI, RN, RS e SC, contados na base carregada), e os
 * cinco são municípios de verdade.
 *
 * A DEDUPLICAÇÃO PELO CÓDIGO mantém a PRIMEIRA ocorrência: a fonte não repete códigos hoje, e se
 * repetir, duas linhas com a mesma chave no mesmo `INSERT` são um erro de fonte, não uma escolha a
 * ser feita no meio de uma transação.
 */
export function municipiosDoIbge(bruto: unknown): TransformIbge {
  if (!Array.isArray(bruto)) {
    return { linhas: [], recusados: [{ indice: -1, motivo: "a resposta não é uma lista" }], duplicados: 0 };
  }

  const linhas: LinhaCidade[] = [];
  const recusados: TransformIbge["recusados"] = [];
  const vistos = new Set<number>();
  let duplicados = 0;

  bruto.forEach((item, indice) => {
    const m = (item ?? {}) as MunicipioIbge;
    const id = typeof m.id === "number" ? m.id : Number.NaN;
    if (!Number.isInteger(id) || id < 1_000_000 || id > 9_999_999) {
      recusados.push({ indice, motivo: `código do IBGE inválido: ${String(m.id)}` });
      return;
    }
    const nome = typeof m.nome === "string" ? m.nome.trim() : "";
    if (!nome) {
      recusados.push({ indice, motivo: `município ${id} sem nome` });
      return;
    }
    const uf = ufDoMunicipio(m);
    if (!uf) {
      recusados.push({ indice, motivo: `município ${id} sem UF reconhecível` });
      return;
    }
    if (vistos.has(id)) {
      duplicados += 1;
      return;
    }
    vistos.add(id);
    linhas.push({ id, nome, uf });
  });

  return { linhas, recusados, duplicados };
}
