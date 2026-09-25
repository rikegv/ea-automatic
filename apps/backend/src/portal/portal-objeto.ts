import { createHash, randomUUID } from "node:crypto";

/**
 * O NOME DO OBJETO NO ARMAZENAMENTO, ESCOLHIDO POR NÓS.
 *
 * O candidato nunca informa caminho nem nome, e isso não é preferência de organização. Nome vindo
 * do cliente é travessia de caminho (`../` sobe de pasta) e é sobrescrita de objeto alheio, e o
 * nome de arquivo ORIGINAL é PII por si só: já foi visto CPF em nome de arquivo do Pandapé
 * (`documento_arquivos_coletados` documenta a medição). Aqui ele é descartado, nunca chega ao
 * armazenamento e nunca chega ao banco. É o item U13 do documento de regras.
 *
 * FORMATO: `{admissaoOpaca}/{codigoTipo}__{uuid}.{ext}`.
 *
 * `admissaoOpaca` é um HASH COM PEPPER do id da admissão, e não o id. O motivo é o veto V4: o nome
 * do objeto atravessa o log do armazenamento do Google, que é um terceiro, e um identificador
 * interno reversível ali é identificador nosso circulando em log alheio. O hash agrupa os arquivos
 * do mesmo candidato numa pasta (que é o que a operação precisa) sem dizer a ninguém de fora de
 * quem é a pasta. O caminho de volta, do objeto para a admissão, é a tabela `portal_credenciais`,
 * que é nossa e tem RBAC.
 */

/** Tamanho do segmento opaco. 32 hex são 128 bits, folga de sobra contra colisão. */
const TAMANHO_OPACO = 32;

export function admissaoOpaca(admissaoId: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:portal-objeto:${admissaoId}`).digest("hex").slice(0, TAMANHO_OPACO);
}

/**
 * Monta o caminho do objeto. `codigoTipo` vem do catálogo `tipos_documento` (§A.3), que é vivo, e é
 * saneado aqui: só letra, número e sublinhado sobrevivem. Um código com barra viraria pasta nova, e
 * a régua documental é editável pela tela de administração, então o saneamento é do lado de cá.
 */
export function montarCaminhoObjeto(
  admissaoId: string,
  codigoTipo: string,
  extensao: string,
  pepper: string,
  uuid: string = randomUUID(),
): string {
  const codigo = codigoTipo.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 60);
  return `${admissaoOpaca(admissaoId, pepper)}/${codigo}__${uuid}.${extensao}`;
}
