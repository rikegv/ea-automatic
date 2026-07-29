import { describe, expect, it } from "vitest";
import {
  limitar,
  MAX_MOTIVO_DRIVE,
  motivoFalhaEnvioDrive,
  motivoPandapeSemTipos,
  MOTIVO_DRIVE,
  tiposFaltantesNoArquivamento,
} from "./drive-arquivamento";

/**
 * FUNÇÃO PURA DO "QUAIS TIPOS FALTAM" (OST re-baixar do Pandapé).
 *
 * É a decisão que governa a cota do Pandapé: o que esta função devolver é EXATAMENTE o que será
 * pedido de volta lá. Um falso positivo aqui gasta cota compartilhada com o webhook da esteira; um
 * falso negativo devolve o buraco (prontuário incompleto em silêncio).
 */
describe("tiposFaltantesNoArquivamento — o que o prontuário ainda não tem", () => {
  it("staging completa não pede nada de volta (o Pandapé nem é chamado)", () => {
    const faltantes = tiposFaltantesNoArquivamento({
      entregues: ["RG", "CPF", "CTPS"],
      naStaging: ["RG", "CPF", "CTPS"],
    });
    expect(faltantes).toEqual([]);
  });

  it("pede SÓ o que falta, nunca o acervo inteiro", () => {
    const faltantes = tiposFaltantesNoArquivamento({
      entregues: ["RG", "CPF", "CTPS", "COMPROVANTE_RESIDENCIA"],
      naStaging: ["RG", "CTPS"],
    });
    expect(faltantes).toEqual(["COMPROVANTE_RESIDENCIA", "CPF"]);
  });

  it("FACULTATIVO entregue conta igual (decisão do diretor: se foi coletado e validado, vai)", () => {
    // Cartão SUS e CNH não são obrigatórios da régua; estando ENTREGUE, vão ao prontuário.
    const faltantes = tiposFaltantesNoArquivamento({
      entregues: ["RG", "CARTAO_SUS", "CNH"],
      naStaging: ["RG"],
    });
    expect(faltantes).toEqual(["CARTAO_SUS", "CNH"]);
  });

  it("staging vazia pede TODOS os entregues (é o cenário do buraco: TTL de 48h estourado)", () => {
    const faltantes = tiposFaltantesNoArquivamento({
      entregues: ["RG", "CPF"],
      naStaging: [],
    });
    expect(faltantes).toEqual(["CPF", "RG"]);
  });

  it("ASO já arquivado no Drive NÃO é pedido de volta (economia de cota)", () => {
    const faltantes = tiposFaltantesNoArquivamento({
      entregues: ["ASO", "RG"],
      naStaging: [],
      jaNoDrive: ["ASO"],
    });
    expect(faltantes).toEqual(["RG"]);
  });

  it("nada ENTREGUE, nada a pedir", () => {
    expect(tiposFaltantesNoArquivamento({ entregues: [], naStaging: [] })).toEqual([]);
  });

  it("saída é única e ordenada (motivo e log precisam ser estáveis entre execuções)", () => {
    const faltantes = tiposFaltantesNoArquivamento({
      entregues: ["CTPS", "RG", "CTPS", "CPF"],
      naStaging: [],
    });
    expect(faltantes).toEqual(["CPF", "CTPS", "RG"]);
  });
});

describe("motivos gravados — o fim do silêncio", () => {
  it("motivo de tipo não devolvido nomeia os tipos, e nada além disso (§A.6)", () => {
    const motivo = motivoPandapeSemTipos(["CPF", "CTPS"]);
    expect(motivo).toContain("CPF");
    expect(motivo).toContain("CTPS");
    expect(motivo).not.toMatch(/https?:\/\//); // nenhuma URL
  });

  it("motivo de falha do envio carrega o detalhe real", () => {
    expect(motivoFalhaEnvioDrive("DESCONHECIDA, 500 do Google")).toContain("500 do Google");
  });

  it("nenhum motivo fixo usa travessão (§A.11)", () => {
    for (const texto of Object.values(MOTIVO_DRIVE)) {
      expect(texto).not.toContain("—");
    }
    expect(motivoPandapeSemTipos(["RG"])).not.toContain("—");
    expect(motivoFalhaEnvioDrive("erro")).not.toContain("—");
  });

  it("motivo é capado, para não estourar a coluna com um stack trace inteiro", () => {
    expect(limitar("x".repeat(5000))).toHaveLength(MAX_MOTIVO_DRIVE);
  });
});
