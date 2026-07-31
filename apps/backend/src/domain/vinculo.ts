/**
 * VÍNCULO CLIENTE ↔ TIPO DE CONTRATO (OST Onda 3, item 7, Caminho 2). Domínio PURO.
 *
 * O PROBLEMA QUE RESOLVE. O diretor precisa do MESMO cliente operando com dois contratos (ex.:
 * Temporário e Terceirizado), cada um com sua régua documental, sua obrigatoriedade, seu benefício
 * padrão e seu assinante. O caminho descartado era cadastrar o cliente duas vezes, o que exigiria
 * trocar a chave primária `clientes.cod_cliente` (6 FKs, 4 uniques, 53 pontos de leitura e todas as
 * rotas de admin). O caminho adotado usa o eixo que JÁ existia e nunca foi ligado: `cliente_vinculos`.
 *
 * A REGRA DE OURO, e o motivo de tudo aqui ser conservador: cliente com UM vínculo (ou nenhum) se
 * comporta EXATAMENTE como antes. São 233 dos 234 clientes de hoje, e nenhuma admissão viva pode
 * mudar de régua por causa desta entrega.
 */

/** Tipos de serviço do vínculo. Espelha o enum `tipo_servico` do banco. */
export const TIPOS_SERVICO = [
  "TEMPORARIO",
  "TERCEIRO",
  "ESTAGIO",
  "INTERNO",
  "FOPAG",
  "APRENDIZ",
] as const;
export type TipoServico = (typeof TIPOS_SERVICO)[number];

/** Rótulo de tela de cada tipo (§A.24: tag em title case, §A.11: sem travessão). */
export const ROTULO_TIPO_SERVICO: Record<TipoServico, string> = {
  TEMPORARIO: "Temporário",
  TERCEIRO: "Terceirizado",
  ESTAGIO: "Estágio",
  INTERNO: "Interno",
  FOPAG: "Fopag",
  APRENDIZ: "Jovem Aprendiz",
};

/** Caixa e acento fora, e o ponto final da abreviação também ("TEMP." -> "temp"). */
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\.$/, "");
}

/**
 * `admissoes.tipo_contrato` -> tipo de serviço do vínculo.
 *
 * ACEITA AS ABREVIAÇÕES DE PROPÓSITO, mesmo depois da normalização da base (item 7, Bloco 1). A
 * normalização arrumou as 2.226 linhas que existiam; esta tolerância protege do que vier DEPOIS, por
 * uma importação nova ou pelo Pandapé, sem exigir que alguém lembre de rodar o script de novo.
 */
const DE_PARA: Record<string, TipoServico> = {
  temporario: "TEMPORARIO",
  temp: "TEMPORARIO",
  terceirizado: "TERCEIRO",
  terceiro: "TERCEIRO",
  terc: "TERCEIRO",
  estagio: "ESTAGIO",
  esta: "ESTAGIO",
  interno: "INTERNO",
  inter: "INTERNO",
  fopag: "FOPAG",
  "jovem aprendiz": "APRENDIZ",
  aprendiz: "APRENDIZ",
  apren: "APRENDIZ",
};

/**
 * O tipo de contrato da admissão vira tipo de serviço do vínculo. `null` quando o tipo está vazio
 * (57 admissões da base) ou quando a grafia não é reconhecida (ex.: "ESTA. FOPAG", que o diretor
 * decidiu manter como está): nesses casos NÃO se adivinha vínculo, e a resolução cai no cliente.
 */
export function tipoServicoDeContrato(tipoContrato: string | null | undefined): TipoServico | null {
  const t = norm(tipoContrato ?? "");
  if (!t) return null;
  return DE_PARA[t] ?? null;
}

/** Um vínculo, no mínimo que a resolução precisa saber. */
export interface VinculoResolvivel {
  id: string;
  tipoServico: string;
  ativo?: boolean;
}

/**
 * Qual vínculo desta admissão? Função PURA: recebe os vínculos do cliente e o tipo de contrato.
 *
 * A REGRA DE OURO mora aqui, em uma linha só: com MENOS DE DOIS vínculos ativos a resposta é `null`,
 * ou seja, "resolva como sempre resolveu, pelo cliente". É o que garante que nenhum dos 233 clientes
 * de um vínculo só sinta esta entrega, mesmo que o vínculo dele exista e tenha tipo.
 *
 * `null` também quando o tipo não casa com vínculo nenhum: a configuração do cliente é o fallback,
 * e nunca se escolhe "o primeiro vínculo da lista", que seria pegar a régua errada em silêncio.
 */
export function vinculoDaAdmissao(
  vinculos: VinculoResolvivel[],
  tipoContrato: string | null | undefined,
): string | null {
  const ativos = vinculos.filter((v) => v.ativo !== false);
  if (ativos.length < 2) return null;
  const tipo = tipoServicoDeContrato(tipoContrato);
  if (!tipo) return null;
  return ativos.find((v) => v.tipoServico === tipo)?.id ?? null;
}

/** O cliente tem escolha a fazer? (2+ vínculos ativos = a tela precisa perguntar o contrato.) */
export function exigeEscolhaDeVinculo(vinculos: VinculoResolvivel[]): boolean {
  return vinculos.filter((v) => v.ativo !== false).length >= 2;
}
