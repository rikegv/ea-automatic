import "dotenv/config";
import { count } from "drizzle-orm";
import { createDb } from "./client";
import { asCidades } from "./schema";
import { FONTE_IBGE, MINIMO_MUNICIPIOS, municipiosDoIbge } from "./cidades-ibge";

/**
 * ─ A CARGA DOS MUNICÍPIOS DO IBGE (Onda C) ──────────────────────────────────────────────────────
 *
 * RODA UMA VEZ E GRAVA NO BANCO. A tela de abertura de vaga NUNCA chama o IBGE: se o serviço deles
 * estiver fora do ar (ou lento, que é pior), a vaga não pode deixar de ser aberta por causa disso.
 * A partir daqui a fonte da verdade é a tabela `as_cidades`.
 *
 * Uso: `pnpm --filter @ea/backend db:carga:cidades ea_automatic_homolog`
 *
 * ┌─ A TRAVA DE BASE, e ela nasceu de uma medição, não de zelo ───────────────────────────────────┐
 * │ NENHUMA carga desta casa tem trava de base, e o `DATABASE_URL` do `.env` aponta para          │
 * │ PRODUÇÃO. Um `db:carga:cidades` digitado sem pensar gravaria 5.570 linhas na base real, e     │
 * │ ninguém saberia até alguém procurar. Então esta carga EXIGE QUE A BASE SEJA NOMEADA no        │
 * │ comando, e confere o nome contra `current_database()`: a conexão tem de ser a que o operador  │
 * │ DISSE que era.                                                                                 │
 * │                                                                                                │
 * │ A ALLOWLIST É A SEGUNDA METADE. Ela pega o erro de digitação ("ea_automatic_homolog2") antes  │
 * │ de ele virar uma base nova criada por engano, e deixa explícito, no diff, quais bases esta    │
 * │ carga pode tocar.                                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS OUTRAS CONDIÇÕES DA AUDITORIA, e por que cada uma está aqui ──────────────────────────────┐
 * │ URL CONSTANTE NO CÓDIGO (`FONTE_IBGE`), nunca em variável de ambiente: quem definisse a       │
 * │ variável escolheria de onde vem a "verdade" que a tela vai oferecer.                          │
 * │                                                                                                │
 * │ CONTAGEM AFIRMADA ANTES DE ESCREVER: resposta truncada ABORTA, e nada é gravado. O            │
 * │ `ON CONFLICT DO NOTHING` não pode mascarar isso, porque a decisão de abortar acontece ANTES   │
 * │ de qualquer `INSERT`.                                                                          │
 * │                                                                                                │
 * │ VALIDAÇÃO LINHA A LINHA (`municipiosDoIbge`), e QUALQUER recusa aborta: item recusado é sinal │
 * │ de mudança de formato, e gravar o resto seria a carga pela metade com cara de sucesso.        │
 * │                                                                                                │
 * │ TRANSAÇÃO ÚNICA: os seis lotes entram juntos ou não entram. Sem ela, uma queda no quarto lote │
 * │ deixaria a base com 4.000 municípios e nenhum registro de que faltam os outros.                │
 * │                                                                                                │
 * │ `AbortSignal` COM TIMEOUT: sem ele, um IBGE lento deixaria o script pendurado para sempre.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IDEMPOTENTE E RE-EXECUTÁVEL, pelo código do IBGE, que é a chave primária. `DO NOTHING`, e não
 * `DO UPDATE`: uma recarga nunca REESCREVE o que já está lá. É a direção segura, porque uma resposta
 * adulterada ou truncada que passasse pelas travas acima só poderia ACRESCENTAR município, nunca
 * renomear os que a operação já usa. Corrigir a grafia de um nome é limpeza deliberada, não efeito
 * colateral de rodar a carga de novo.
 *
 * §A.6: dado público, sem nenhuma informação pessoal. Nada é persistido além de código, nome e UF.
 */

/**
 * AS BASES QUE ESTA CARGA PODE TOCAR. Produção está na lista de propósito (a carga precisa rodar lá
 * um dia), e o que a protege é a EXIGÊNCIA DE SER NOMEADA: ninguém escreve `ea_automatic` no
 * terminal por acidente.
 */
const BASES_PERMITIDAS = new Set(["ea_automatic", "ea_automatic_homolog"]);

const COMO_USAR =
  "Uso: pnpm --filter @ea/backend db:carga:cidades <base>\n" +
  `  <base> precisa ser uma de: ${[...BASES_PERMITIDAS].join(", ")}\n` +
  "  e precisa ser a MESMA base para a qual o DATABASE_URL aponta.";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const pedida = process.argv[2]?.trim();
  if (!pedida) {
    throw new Error(
      "Esta carga exige que a base seja NOMEADA no comando, porque o DATABASE_URL padrão aponta " +
        `para produção e escrever 5.570 linhas na base errada é irreversível.\n${COMO_USAR}`,
    );
  }
  if (!BASES_PERMITIDAS.has(pedida)) {
    throw new Error(`Base "${pedida}" não está na lista permitida.\n${COMO_USAR}`);
  }

  const { sql, db } = createDb(url, 1);
  try {
    // A CONEXÃO TEM DE SER A QUE O OPERADOR DISSE QUE ERA. É aqui que a trava realmente fecha: o
    // nome pedido é conferido contra o banco a que ESTA conexão chegou, não contra o texto da URL
    // (que pode ter um `?options=` mudando o destino, ou apontar para um pgbouncer).
    const [{ base }] = await sql<{ base: string }[]>`SELECT current_database() AS base`;
    if (base !== pedida) {
      throw new Error(
        `A conexão chegou na base "${base}", e você pediu "${pedida}". NADA foi gravado. ` +
          "Confira o DATABASE_URL antes de rodar de novo.",
      );
    }

    const resposta = await fetch(FONTE_IBGE, { signal: AbortSignal.timeout(30_000) });
    if (!resposta.ok) {
      throw new Error(`IBGE respondeu ${resposta.status}. A carga NÃO foi aplicada; tente de novo.`);
    }

    const { linhas, recusados, duplicados } = municipiosDoIbge(await resposta.json());

    // RECUSA É MUDANÇA DE FORMATO, e não linha ruim isolada: aborta antes de escrever.
    if (recusados.length > 0) {
      const amostra = recusados.slice(0, 5).map((r) => `#${r.indice}: ${r.motivo}`);
      throw new Error(
        `${recusados.length} itens da fonte não passaram na validação. NADA foi gravado.\n` +
          amostra.join("\n"),
      );
    }

    // A CONTAGEM, AFIRMADA ANTES DE QUALQUER `INSERT` (ver o cabeçalho).
    if (linhas.length < MINIMO_MUNICIPIOS) {
      throw new Error(
        `A fonte devolveu apenas ${linhas.length} municípios, abaixo do piso de ${MINIMO_MUNICIPIOS}. ` +
          "Isso não é a base completa (resposta truncada ou formato mudado), então NADA foi gravado.",
      );
    }

    /*
     * TRANSAÇÃO ÚNICA, EM LOTES. Os lotes existem porque são 5.571 linhas com três parâmetros cada,
     * e um `INSERT` único estouraria o limite de parâmetros do Postgres (65.535). A transação existe
     * porque os lotes precisam entrar como UMA coisa só.
     */
    await db.transaction(async (tx) => {
      const LOTE = 1_000;
      for (let i = 0; i < linhas.length; i += LOTE) {
        await tx
          .insert(asCidades)
          .values(linhas.slice(i, i + LOTE))
          .onConflictDoNothing({ target: asCidades.id });
      }
    });

    const [{ total }] = await db.select({ total: count() }).from(asCidades);
    console.log(
      `[carga-cidades-ibge] base ${base} | ${linhas.length} municípios válidos na fonte` +
        (duplicados > 0 ? ` (${duplicados} códigos repetidos, ignorados)` : "") +
        ` | ${total} na tabela.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
