import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { asCandidaturas } from "../../db/schema";
import {
  bancoFingido,
  linhaFingida,
  usuarioFingido,
} from "./fronteira-encerrada.tester-fake";

/**
 * ─ PONTE A&S -> ADM, RISCO b: A GUARDA DE CPF NO ENVIO PARA A ESTEIRA (`tester` §A.38/§A.40) ─────
 *
 * ESCRITO A PARTIR DO REQUISITO, como verificação INDEPENDENTE da guarda que a ponte A&S -> ADM
 * construiu em paralelo: `registrarSaida`, no ramo `ENVIADO_PARA_ADMISSAO`, valida o CPF do
 * candidato ANTES de `mudarSituacaoOcupandoPosicao`. A admissão nasce pela chave de identidade
 * (o CPF, §A.3); enviar sem CPF válido criaria uma admissão órfã de identidade DEPOIS de já ter
 * consumido a posição da vaga, deixando a vaga furada e a esteira quebrada. Este arquivo prova,
 * sem ter escrito a guarda, que a ordem (recusar ANTES de consumir) e o §A.6 são honrados.
 *
 * A REGRA QUE ESTES TESTES FIXAM:
 *   1. sem CPF válido, o envio FALHA com mensagem PRÓPRIA;
 *   2. a falha é ANTES de consumir a posição: a candidatura NÃO vai a `ENVIADO_PARA_ADMISSAO`, e a
 *      linha da vaga não recebe a entrega (ordem importa: consumir e depois falhar deixa a vaga
 *      furada, que é o dano exato do risco b);
 *   3. §A.6: nem a mensagem nem qualquer efeito carregam o número do CPF.
 *
 * ┌─ POR QUE `bancoFingido`, E O QUE ELE FIXA SEM QUE EU CONTROLE O CPF ────────────────────────┐
 * │ O dublê da fronteira encerrada é o único que modela o caminho travado inteiro (leitura da    │
 * │ vaga com FOR UPDATE, contagem por lado, escrita da candidatura e do histórico). Ele devolve  │
 * │ o candidato do funil SEM CPF (`asCandidatos.findFirst` -> `{ id, nome }`), que é EXATAMENTE   │
 * │ o cenário "sem CPF válido" do requisito. Não preciso injetar CPF para provar o risco b: a     │
 * │ ausência já é a violação.                                                                     │
 * │                                                                                              │
 * │ GAP REPORTADO AO COORDENADOR: o caso "CPF PRESENTE mas inválido, e o número NÃO vaza na       │
 * │ mensagem" precisa de um dublê que devolva um CPF inválido, o que este fake não permite. Fica  │
 * │ como `.todo` abaixo, para o autor da ponte (ou o dono do fake) expor um override de CPF.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;

/** Uma sequência de 11 dígitos, que é a forma que um CPF vazado tomaria numa frase de erro. */
const ONZE_DIGITOS = /\d{11}/;

async function erroDe(p: Promise<unknown>): Promise<unknown> {
  return p.then(() => null).catch((e: unknown) => e);
}

function mensagemDe(erro: unknown): string {
  const resp = (erro as { getResponse?: () => unknown })?.getResponse?.();
  if (resp && typeof resp === "object" && "message" in resp) {
    return String((resp as { message: unknown }).message);
  }
  return String((erro as { message?: unknown })?.message ?? erro);
}

describe("ponte A&S -> ADM (risco b): enviar para a esteira SEM CPF válido não consome posição", () => {
  it("a candidatura de alguém SEM CPF não vai para a esteira: o envio é RECUSADO", async () => {
    // ALOCADO/OFICIAL é o caso de consumo do caminho travado. É por ele que se mede o risco b: sem
    // a guarda a linha viraria ENVIADO; com a guarda (o dublê devolve candidato SEM CPF), ela tem
    // de continuar ALOCADA.
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
      // O override de CPF que este arquivo pediu: `null` modela o candidato do funil SEM CPF, que é
      // a violação do risco b. Sem ele, o fake usa o CPF válido padrão e o gate não teria o que barrar.
      cpfDoFunil: null,
    });

    const erro = await erroDe(
      b.service.registrarSaida(
        "cand-1",
        { situacao: ENVIO, motivo: "foi para a esteira" } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    // 1. FALHOU: sem a guarda, resolveria e consumiria; com a guarda, rejeita.
    expect(erro).not.toBeNull();
  });

  it("a posição NÃO é consumida: a candidatura continua ALOCADA e nada vira ENVIADO", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
      cpfDoFunil: null,
    });

    await erroDe(
      b.service.registrarSaida(
        "cand-1",
        { situacao: ENVIO, motivo: "foi para a esteira" } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    // 2. A ORDEM É A REGRA: recusar ANTES de consumir. A linha fica no estado anterior...
    expect(b.situacaoDe("cand-1")).toBe("ALOCADO");
    // ...e nenhuma escrita levou a candidatura a ENVIADO_PARA_ADMISSAO.
    const virouEnvio = b.updates.some(
      (u) => u.tabela === asCandidaturas && u.valores.situacao === ENVIO,
    );
    expect(virouEnvio).toBe(false);
  });

  it("§A.6: a frase da recusa não carrega o número do CPF", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
      cpfDoFunil: null,
    });

    const erro = await erroDe(
      b.service.registrarSaida(
        "cand-1",
        { situacao: ENVIO, motivo: "foi para a esteira" } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    // Sem a guarda, `erro` seria null (a operação resolveria) e não haveria frase a inspecionar.
    // Com a guarda, há mensagem própria e ela é limpa de CPF.
    expect(erro).not.toBeNull();
    expect(mensagemDe(erro)).not.toMatch(ONZE_DIGITOS);
  });

  /**
   * O GAP FECHADO: CPF PRESENTE, PORÉM INVÁLIDO, e o número NÃO reaparece em NENHUM efeito.
   *
   * O `bancoFingido` GANHOU o override de CPF que este arquivo pediu (`cpfDoFunil`), então o caso
   * agora é exprimível sem dublê próprio: um CPF sintético de dígito inválido entra pela ponte, a
   * guarda recusa, e o número sintético é procurado na frase de erro. §A.6 exige que ele não esteja
   * lá, e é isso que o teste prova.
   */
  it("CPF presente mas inválido: recusa e o número sintético não aparece na mensagem", async () => {
    // 11 uns: onze dígitos que um `isValidCpf` REPROVA (dígito verificador não fecha). Se a guarda
    // vazasse o número, ele apareceria na frase e o regex de onze dígitos casaria.
    const CPF_INVALIDO = "11111111111";
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
      cpfDoFunil: CPF_INVALIDO,
    });

    const erro = await erroDe(
      b.service.registrarSaida(
        "cand-1",
        { situacao: ENVIO, motivo: "foi para a esteira" } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    expect(erro).not.toBeNull();
    // A candidatura não avançou, e nenhuma escrita a levou a ENVIADO.
    expect(b.situacaoDe("cand-1")).toBe("ALOCADO");
    expect(
      b.updates.some((u) => u.tabela === asCandidaturas && u.valores.situacao === ENVIO),
    ).toBe(false);
    // §A.6: nem a mensagem carrega o número (sintético) do CPF.
    expect(mensagemDe(erro)).not.toContain(CPF_INVALIDO);
    expect(mensagemDe(erro)).not.toMatch(ONZE_DIGITOS);
  });
});
