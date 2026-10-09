import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { asCandidaturas } from "../../db/schema";
import { ehCpfProvisorio } from "@ea/shared-types";
import {
  bancoFingido,
  linhaFingida,
  usuarioFingido,
} from "./fronteira-encerrada.tester-fake";

/**
 * ─ PONTE A&S -> ADM: O ENVIO SEM CPF DEIXOU DE SER RECUSADO (regra MUDOU em 09/10/2026) ──────────
 *
 * ┌─ A REGRA INVERTEU, e este arquivo foi reescrito para a regra NOVA ──────────────────────────────┐
 * │ ANTES (até 08/10/2026): `registrarSaida`, no ramo `ENVIADO_PARA_ADMISSAO`, RECUSAVA quando o    │
 * │ candidato não tinha CPF válido (a pré-admissão nasce pela chave de identidade, o CPF, §A.3).     │
 * │ AGORA (decisão do diretor, 09/10/2026, destravamento do envio sem CPF): em vez de recusar, o    │
 * │ envio DERIVA UM MARCADOR PROVISÓRIO por candidato (`PROV`+7) e PROSSEGUE. A admissão nasce com   │
 * │ o marcador, estacionada em AGUARDANDO_LIBERACAO, e o candidato preenche o CPF real depois no      │
 * │ portal (a ponte `corrigirCpf` reaponta e some o marcador órfão). A LIBERAÇÃO continua recusando  │
 * │ o marcador (`isValidCpf` o reprova), então nada avança de fase sem CPF real.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO FIXA AGORA (verificação independente, §A.38/§A.40):
 *   1. sem CPF válido o envio NÃO FALHA mais: ele consome a posição e a candidatura vira ENVIADO;
 *   2. com CPF presente porém INVÁLIDO, mesmo desfecho (o inválido também leva ao marcador);
 *   3. §A.6: nenhum efeito carrega um número de 11 dígitos (o marcador tem letras, não é número).
 *
 * ┌─ POR QUE A ADMISSÃO NÃO É CRIADA NESTE DUBLÊ, e por que isso está CERTO ────────────────────────┐
 * │ `bancoFingido` constrói `CandidatosService` SEM a `AdmissoesService` (o 5º argumento). Então     │
 * │ `this.admissoes` é `undefined` e `criarPreAdmissaoDoFunil` NÃO é chamado: este dublê cobre o     │
 * │ caminho de `candidatos.service` (derivar o PROV e consumir a posição), não a criação da          │
 * │ admissão. "Criar ACEITA PROV (nasce AGUARDANDO_LIBERACAO)" e "liberar RECUSA PROV" são medidos   │
 * │ direto contra a `AdmissoesService` em `admissoes.ponte-cpf-provisorio.backend.spec.ts`.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const ENVIO = "ENVIADO_PARA_ADMISSAO" as const;

/** Uma sequência de 11 dígitos, que é a forma que um CPF vazaria numa frase ou numa escrita. */
const ONZE_DIGITOS = /\d{11}/;

async function erroDe(p: Promise<unknown>): Promise<unknown> {
  return p.then(() => null).catch((e: unknown) => e);
}

describe("ponte A&S -> ADM: enviar para a esteira SEM CPF agora DERIVA PROV e prossegue", () => {
  it("a candidatura de alguém SEM CPF VAI para a esteira: o envio NÃO é mais recusado", async () => {
    const b = bancoFingido({
      candidaturas: [linhaFingida({ id: "cand-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" })],
      // `null` modela o candidato do funil SEM CPF. Antes isto barrava o envio; agora deriva o PROV.
      cpfDoFunil: null,
    });

    const erro = await erroDe(
      b.service.registrarSaida(
        "cand-1",
        { situacao: ENVIO, motivo: "foi para a esteira" } as never,
        usuarioFingido("COMUM") as never,
      ),
    );

    // NÃO falhou: o ramo do PROV prosseguiu em vez de lançar.
    expect(erro).toBeNull();
    // A posição FOI consumida: a candidatura avançou para ENVIADO_PARA_ADMISSAO.
    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
    expect(
      b.updates.some((u) => u.tabela === asCandidaturas && u.valores.situacao === ENVIO),
    ).toBe(true);
  });

  it("CPF presente mas INVÁLIDO: também deriva o marcador e prossegue, sem vazar o número", async () => {
    // 11 uns: onze dígitos que `isValidCpf` reprova (dígito verificador não fecha). Como não é válido,
    // o envio cai no ramo do marcador provisório, igual ao caso sem CPF.
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

    expect(erro).toBeNull();
    expect(b.situacaoDe("cand-1")).toBe(ENVIO);
    // §A.6: o número (sintético) do CPF inválido não reaparece em nenhuma escrita da candidatura.
    for (const u of b.updates) {
      expect(JSON.stringify(u.valores)).not.toContain(CPF_INVALIDO);
    }
  });

  it("§A.6: nenhuma escrita da candidatura carrega um número de 11 dígitos (o marcador tem letras)", async () => {
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

    for (const u of b.updates) {
      expect(JSON.stringify(u.valores)).not.toMatch(ONZE_DIGITOS);
    }
  });

  it("o marcador provisório é, de fato, reconhecido como provisório (nunca um CPF real)", () => {
    // Fixa o contrato do detector que a ponte usa: `PROV`+7 é provisório, 11 dígitos nunca é.
    expect(ehCpfProvisorio("PROVABCDEFG")).toBe(true);
    expect(ehCpfProvisorio("52998224725")).toBe(false);
  });
});
