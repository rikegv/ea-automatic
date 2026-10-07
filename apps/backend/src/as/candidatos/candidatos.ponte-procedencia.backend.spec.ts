import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { asCandidaturaEtapas } from "../../db/schema";
import { bancoFingido, linhaFingida, usuarioFingido } from "./fronteira-encerrada.tester-fake";

/**
 * ─ O ENVIO PARA A ADMISSÃO REGISTRA SOBRE QUAIS CAMPOS DA PLANILHA ALGUÉM AGIU (0147) ───────────
 *
 * ┌─ O BURACO MEDIDO: 69% DOS ENVIOS NÃO PASSAM PELA LIBERAÇÃO ─────────────────────────────────┐
 * │ 273 de 394 envios para a admissão (medição do `seguranca`) saem de vaga ainda em             │
 * │ PENDENTE_REVISAO, pela PONTE do funil (`registrarSaida`), sem nunca passar pelo "Liberar      │
 * │ Vaga". Como a trilha de procedência só era escrita na liberação, no caminho DOMINANTE não     │
 * │ ficava registrado quem agiu sobre valores vindos da planilha.                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O EVENTO MORA EM `as_candidatura_etapas`, no DESFECHO que a transação do envio já gravava, e não
 * em tabela nova nem em `as_vaga_status_eventos`: o envio NÃO move o status da vaga, e aquela tabela
 * é contada por `de`/`para` para decidir se um status do catálogo pode ser APAGADO.
 *
 * O QUE ESTES TESTES FIXAM:
 *   1. o evento carrega o retrato (`procedenciaPlanilha`) com os campos de origem PLANILHA;
 *   2. o autor é o da SESSÃO (`por_id`), nunca do corpo;
 *   3. vaga sem campo nenhum da planilha grava LISTA VAZIA, e não nulo (é o denominador);
 *   4. §A.6: nem nome, nem CPF, nem valor de campo entram no evento;
 *   5. o envio NÃO mudou de comportamento: nenhum status de vaga foi tocado por este registro.
 */

const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;
const ONZE_DIGITOS = /\d{11}/;

/** O cenário do caminho feliz do envio: alguém alocado, com CPF válido, indo para a esteira. */
function cenario(procedenciaDaVaga: readonly string[]) {
  return bancoFingido({
    candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
    procedenciaDaVaga,
  });
}

async function enviar(b: ReturnType<typeof cenario>, usuarioId = "user-1") {
  await b.service.registrarSaida(
    "cand-1",
    { situacao: ENVIO, motivo: "foi para a esteira" } as never,
    usuarioFingido("COMUM", usuarioId) as never,
  );
  return b.eventoDe("cand-1");
}

describe("ponte do funil: o envio para a admissão grava o retrato da procedência", () => {
  it("grava QUAIS campos daquela vaga vinham da planilha, em nome de campo", async () => {
    const evento = await enviar(cenario(["natureza", "cargo", "dataLimite"]));

    expect(evento?.situacao).toBe(ENVIO);
    expect(evento?.procedenciaPlanilha).toEqual(["natureza", "cargo", "dataLimite"]);
  });

  it("o campo NÃO carimbado fica fora do retrato: a lista é dos que vieram, não dos cinco", async () => {
    const evento = await enviar(cenario(["linhaServico"]));
    expect(evento?.procedenciaPlanilha).toEqual(["linhaServico"]);
  });

  it("o autor é o da SESSÃO, e é ele que responde pelo gesto", async () => {
    const evento = await enviar(cenario(["cargo"]), "user-da-sessao");
    // `por_id` vem do `@CurrentUser` que a controller repassa, nunca do corpo: autoria é trilha.
    expect(evento?.porId).toBe("user-da-sessao");
  });

  it("vaga SEM campo nenhum da planilha grava LISTA VAZIA, e não nulo", async () => {
    // O vazio é o DENOMINADOR: ele diz "envio medido, e nenhum campo veio da planilha". Nulo diria
    // "este evento não é um envio", que é o estado dos eventos anteriores a esta frente e dos
    // desfechos que não são envio. Achatar os dois tiraria o total da contagem.
    const evento = await enviar(cenario([]));
    expect(evento?.procedenciaPlanilha).toEqual([]);
    expect(evento?.procedenciaPlanilha).not.toBeNull();
    expect(evento?.procedenciaPlanilha).not.toBeUndefined();
  });

  it("§A.6: o evento não carrega nome de candidato, CPF nem valor de campo", async () => {
    const b = cenario(["natureza", "cargo"]);
    const evento = await enviar(b);
    const serializado = JSON.stringify(evento);

    // O nome que o fake dá ao candidato do funil, e o CPF válido padrão dele.
    expect(serializado).not.toContain("Fulano");
    expect(serializado).not.toMatch(ONZE_DIGITOS);
    // E nenhum VALOR dos cinco campos: o retrato é de NOME DE CAMPO. O token do enum de natureza
    // ("EFETIVA") e qualquer UUID de cargo ficariam de fora por construção.
    expect(serializado).not.toContain("EFETIVA");
    expect(serializado).not.toContain("PLANILHA");
  });

  it("o registro NÃO altera o que o envio faz: a candidatura vai a ENVIADO como sempre", async () => {
    // §A.47 e §A.14: o gatilho da esteira fica como está. Esta frente só ACRESCENTA registro, e
    // nenhum status, papel ou liberação se move por causa dela.
    const b = cenario(["cargo"]);
    await enviar(b);
    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
    // E o evento é UM só: o retrato estendeu a linha que já existia, não abriu uma segunda.
    const eventos = b.inserts.filter((i) => i.tabela === asCandidaturaEtapas);
    expect(eventos).toHaveLength(1);
  });
});
