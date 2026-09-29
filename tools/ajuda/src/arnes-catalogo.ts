/**
 * ─ O ARNÊS DO ARTIGO DE CATÁLOGO: GARANTIR UM ITEM INATIVO PARA "REATIVAR" APONTAR ─────────────
 *
 * ┌─ O QUE FALTAVA, E POR QUE NÃO ERA DEFEITO DO ARTIGO ─────────────────────────────────────────┐
 * │ O roteiro "manter-um-catalogo-do-sistema" ensina os quatro gestos do catálogo, e o quinto é     │
 * │ REATIVAR. O botão de reativar só é desenhado na linha de um item INATIVO, e a homologação tinha │
 * │ os 26 motivos de declínio ATIVOS (medido em 27/09/2026). O motor falhava com "ALVO NÃO          │
 * │ ENCONTRADO", que é a mensagem do detector de artigo velho, quando o artigo estava certo e o que │
 * │ faltava era PREPARAÇÃO DE DADO.                                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CONSERTO É ARNÊS, E **NUNCA** INATIVAR UM ITEM DE VERDADE ────────────────────────────────┐
 * │ Inativar "ASO INAPTO" para tirar uma foto tira um motivo de circulação para quem está operando  │
 * │ a homologação, e o efeito colateral sobrevive à captura: ninguém religa o que foi desligado por │
 * │ um print. O arnês cria um item que é SÓ DELE, reconhecível pelo nome, e mexe apenas nele.       │
 * │                                                                                                │
 * │ IDEMPOTENTE POR CONSTRUÇÃO: roda quantas vezes for, e o resultado é sempre "existe exatamente   │
 * │ um item de exemplo, inativo". Preparo não idempotente acumula linha a cada rodada, e com 400    │
 * │ imagens isso é um catálogo poluído em uma tarde.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE NOME, E NÃO UM MOTIVO PLAUSÍVEL ───────────────────────────────────────────────┐
 * │ O item aparece no print do manual, então ele ENSINA. Um nome plausível ("ADMISSÃO CANCELADA")   │
 * │ ensinaria um motivo de declínio que não existe, com a autoridade da casa. O nome diz o que ele  │
 * │ é. E ele não dispara o léxico de nome do gate: nenhuma das palavras é prenome ou sobrenome      │
 * │ brasileiro, então a tela não é recusada por causa dele.                                        │
 * │ §A.11 (travessão proibido) e §A.24 respeitados no texto que chega à tela.                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a escrita é num catálogo de PROCESSO, nunca em tabela de pessoa, e só na base cujo nome é o
 * de homologação (`urlDaHomologacao` recusa qualquer outra, inclusive a produção).
 */
import { pathToFileURL } from "node:url";
import { urlDaHomologacao } from "./base-sintetica";

const POSTGRES_ESM =
  "/home/henrique/apps/ea-automatic/apps/backend/node_modules/postgres/src/index.js";

/** O item do arnês, reconhecível pelo nome. Nenhum outro registro é tocado. */
export const ITEM_INATIVO_DE_EXEMPLO = "EXEMPLO DO MANUAL (ITEM INATIVO)";

type Consulta = {
  unsafe(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  end(): Promise<void>;
};

/**
 * Garante que o catálogo de motivos de declínio tenha o item de exemplo, INATIVO.
 *
 * Devolve o que fez, para o pulso do comando dizer se preparou ou se já estava pronto: preparo que
 * roda em silêncio é preparo que ninguém percebe quando para de rodar.
 */
export async function garantirItemInativoDeExemplo(): Promise<"criado" | "inativado" | "ja-estava"> {
  const url = urlDaHomologacao();
  const modulo = (await import(pathToFileURL(POSTGRES_ESM).href)) as {
    default: (u: string, o?: unknown) => Consulta;
  };
  const sql = modulo.default(url, { max: 1, idle_timeout: 5 });
  try {
    const existentes = await sql.unsafe(
      `select id, ativo from motivos_declinio where nome = $1`,
      [ITEM_INATIVO_DE_EXEMPLO],
    );
    if (existentes.length === 0) {
      await sql.unsafe(`insert into motivos_declinio (nome, ativo) values ($1, false)`, [
        ITEM_INATIVO_DE_EXEMPLO,
      ]);
      return "criado";
    }
    if (existentes.some((l) => l.ativo === true)) {
      // O artigo ENSINA a reativar, então alguém pode ter reativado este item ao seguir o manual.
      // O arnês o devolve ao estado que a captura precisa, e continua sem tocar em nenhum outro.
      await sql.unsafe(`update motivos_declinio set ativo = false where nome = $1`, [
        ITEM_INATIVO_DE_EXEMPLO,
      ]);
      return "inativado";
    }
    return "ja-estava";
  } finally {
    await sql.end().catch(() => undefined);
  }
}
