import { sql, type SQL } from "drizzle-orm";
import type { OrigemDaPropostaDeCliente, PropostaDeClienteDaVaga } from "@ea/shared-types";

/**
 * ─ A PROPOSTA DE CLIENTE DO LADO DA REVISÃO: QUEM A MOSTRA E QUEM REGISTRA O ACEITE ────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE SEPARADO DA `VagasService` ─────────────────────────────────────┐
 * │ A proposta tem LISTA BRANCA DE LEITORES, e ela é verificada por varredura de fonte            │
 * │ (`depara-cliente.fonte-e-inercia.tester.spec.ts`): o de/para, o schema e a TELA DE REVISÃO.    │
 * │ A `VagasService` NÃO está na lista, e não deve estar: ela é o arquivo que escreve              │
 * │ `cod_cliente`, e a regra inteira desta frente é que a proposta não tem caminho até lá. Um      │
 * │ `coalesce(cod_cliente, cliente_proposto)` escrito de boa-fé dentro dela ("se não tem cliente,  │
 * │ usa o proposto") é o furo completo, e seria invisível na revisão de código.                     │
 * │                                                                                                │
 * │ A liberação, então, PERGUNTA a este arquivo, e o que volta para ela é um CÓDIGO DE PROCEDÊNCIA, │
 * │ nunca o cliente proposto. Ela não tem como usar o que não recebe.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A PROPOSTA NUNCA CHEGA À TELA COMO SE FOSSE VALOR GRAVADO (condição C1 da auditoria) ───────┐
 * │ `PropostaDeClienteDaVaga.conferida` é `false` NO TIPO. Sem essa marca, a proposta chegaria     │
 * │ pré-preenchida no seletor igual a um cliente já vinculado, quem libera assinaria a escolha da   │
 * │ planilha sem ter conferido, e a trilha passaria a afirmar que uma PESSOA escolheu.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o nome do cliente é RAZÃO SOCIAL vinda de célula de texto livre, e razão social de MEI é
 * nome de pessoa natural. Ele desce para a TELA, atrás do menu, e NUNCA entra em log nem na trilha:
 * o que vai para a observação do evento é um CÓDIGO.
 */

/** O mínimo de banco que estas funções pedem, para a liberação passar a transação dela. */
export interface ExecutorDeSql {
  execute(consulta: SQL): Promise<unknown>;
}

/**
 * DE ONDE VEIO O CLIENTE COM QUE A VAGA SAIU DA FILA, em lista fechada.
 *
 * ┌─ A PERGUNTA QUE ISTO RESPONDE É A DO ITEM 8, E ELA SÓ APARECE NO DIA RUIM ───────────────────┐
 * │ Quando uma linha da planilha estiver errada, a única pergunta que importa é "esse cliente foi  │
 * │ ESCOLHIDO ou foi ACEITO?", porque é ela que diz QUANTAS vagas herdaram o mesmo erro. Sem o      │
 * │ código na trilha, a investigação começa do zero e termina em "não dá para saber".               │
 * │                                                                                                │
 * │ A PROCEDÊNCIA DISTINGUE AS DUAS CHAVES, e não só "veio da planilha": a `reference` casa pela    │
 * │ CADEIA DE REABERTURA e é inferência mais fraca que a direta, então um erro que entrou por ela   │
 * │ tem alcance diferente de um que entrou pelo id da vaga.                                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const PROCEDENCIAS_DO_CLIENTE_DA_LIBERACAO = [
  /** A pessoa escolheu o cliente. Não havia proposta, ou ela propunha outro. */
  "ESCOLHIDO",
  /** A pessoa aceitou a proposta que casou pelo `idVacancy`. */
  "ACEITO_DEPARA_ID_VAGA",
  /** A pessoa aceitou a proposta que casou pela `reference` (cadeia de reabertura). */
  "ACEITO_DEPARA_REQUISICAO",
] as const;
export type ProcedenciaDoClienteDaLiberacao =
  (typeof PROCEDENCIAS_DO_CLIENTE_DA_LIBERACAO)[number];

const PROCEDENCIA_POR_ORIGEM: Record<OrigemDaPropostaDeCliente, ProcedenciaDoClienteDaLiberacao> = {
  PLANILHA_ID_VAGA: "ACEITO_DEPARA_ID_VAGA",
  PLANILHA_REQUISICAO: "ACEITO_DEPARA_REQUISICAO",
};

/**
 * A PROCEDÊNCIA DO CLIENTE ACEITO, e o CARIMBO do aceite na mesma passagem.
 *
 * ┌─ POR QUE ELA LÊ E ESCREVE, em vez de só ler ──────────────────────────────────────────────────┐
 * │ A trilha guarda o código em TEXTO, que responde "foi aceito?" para UMA vaga. A pergunta do dia │
 * │ ruim é QUANTAS vagas herdaram a mesma linha errada, e isso é uma CONTAGEM: ela precisa de       │
 * │ coluna, não de `like` em observação. `cliente_proposto_estado = 'CONFIRMADO'` é essa coluna.    │
 * │                                                                                                │
 * │ ELA SÓ ESCREVE O ESTADO, e nada mais: nem `cod_cliente`, nem a proposta, nem `atualizado_em`    │
 * │ (que é o relógio do expurgo de quem está dentro da vaga). E só quando o valor aceito é          │
 * │ EXATAMENTE o proposto, senão a vaga teria a proposta de um cliente marcada como confirmada      │
 * │ enquanto saiu da fila com outro.                                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA LANÇA: a liberação é o caminho humano que já funciona, e ela não pode falhar porque uma
 * coluna de proposta não respondeu. Sem resposta, a procedência é `ESCOLHIDO`, que é a verdade
 * conservadora (ninguém pode afirmar que houve aceite de proposta).
 */
export async function procedenciaDoClienteNaLiberacao(
  tx: ExecutorDeSql,
  vagaId: string,
  clienteFinal: string,
): Promise<ProcedenciaDoClienteDaLiberacao> {
  let linha: { cliente_proposto: string | null; cliente_proposto_origem: string | null } | undefined;
  try {
    const linhas = (await tx.execute(sql`
      select cliente_proposto, cliente_proposto_origem
        from vagas
       where id = ${vagaId}::uuid
       limit 1
    `)) as unknown as {
      cliente_proposto: string | null;
      cliente_proposto_origem: string | null;
    }[];
    linha = linhas[0];
  } catch {
    return "ESCOLHIDO";
  }
  const proposto = (linha?.cliente_proposto ?? "").trim();
  const origem = (linha?.cliente_proposto_origem ?? "") as OrigemDaPropostaDeCliente | "";
  if (proposto === "" || origem === "") return "ESCOLHIDO";
  if (proposto.toUpperCase() !== clienteFinal.trim().toUpperCase()) return "ESCOLHIDO";
  const procedencia = PROCEDENCIA_POR_ORIGEM[origem];
  if (procedencia === undefined) return "ESCOLHIDO";
  try {
    await tx.execute(sql`
      update vagas
         set cliente_proposto_estado = 'CONFIRMADO'
       where id = ${vagaId}::uuid
         and cliente_proposto_estado is distinct from 'CONFIRMADO'
    `);
  } catch {
    /* O carimbo é registro, não trava: a liberação não falha por ele. A trilha já guarda o código. */
  }
  return procedencia;
}

/**
 * A FRASE QUE ENTRA NA OBSERVAÇÃO DA TRILHA, nomeada aqui para a liberação não montar texto sobre a
 * proposta (e, com isso, não precisar citá-la).
 *
 * §A.11: sem travessão. §A.6: um código de cliente, um código de procedência, e nada mais. Nenhum
 * nome de empresa e nenhum dado de candidato.
 */
export function fraseDaProcedenciaDoCliente(
  clienteFinal: string,
  procedencia: ProcedenciaDoClienteDaLiberacao,
): string {
  return `Liberada da revisão com o cliente ${clienteFinal}. Procedência do cliente: ${procedencia}.`;
}

/** A proposta de UMA vaga, como a tela de revisão a recebe. Nula quando não há proposta. */
export async function propostaDeClienteDaVaga(
  db: ExecutorDeSql,
  vagaId: string,
): Promise<PropostaDeClienteDaVaga | null> {
  const propostas = await propostasDeClienteDasVagas(db, [vagaId]);
  return propostas[vagaId] ?? null;
}

/**
 * AS PROPOSTAS DE UM LOTE DE VAGAS, para a fila de revisão não fazer uma consulta por linha.
 *
 * A CONSULTA É POR LOTE E POR `id`, nunca uma varredura da tabela inteira: a tela já sabe quais
 * vagas está mostrando, e devolver proposta de vaga que ninguém pediu é dado atravessando sem
 * necessidade (§A.6, minimização).
 */
export async function propostasDeClienteDasVagas(
  db: ExecutorDeSql,
  vagaIds: readonly string[],
): Promise<Record<string, PropostaDeClienteDaVaga>> {
  const ids = [...new Set(vagaIds.filter((id) => id.trim() !== ""))];
  if (ids.length === 0) return {};
  const lista = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const linhas = (await db.execute(sql`
    select id, cliente_proposto, cliente_proposto_nome, cliente_proposto_origem
      from vagas
     where id in (${lista})
       and cliente_proposto_nome is not null
  `)) as unknown as {
    id: string;
    cliente_proposto: string | null;
    cliente_proposto_nome: string;
    cliente_proposto_origem: string;
  }[];
  const saida: Record<string, PropostaDeClienteDaVaga> = {};
  for (const l of linhas) {
    saida[l.id] = {
      codClienteProposto: l.cliente_proposto,
      nomeClienteProposto: l.cliente_proposto_nome,
      origem: l.cliente_proposto_origem as OrigemDaPropostaDeCliente,
      /*
       * SEMPRE `false`, E É ASSIM QUE O TIPO A DECLARA. O estado `CONFIRMADO` da coluna registra que
       * alguém ACEITOU a proposta numa liberação PASSADA; ele não torna a proposta "conferida" para
       * a tela de hoje, e devolver `true` aqui faria o seletor apresentá-la como valor já escolhido.
       */
      conferida: false,
    };
  }
  return saida;
}
