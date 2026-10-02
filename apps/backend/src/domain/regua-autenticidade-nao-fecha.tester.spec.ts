import { describe, expect, it } from "vitest";
import { calcularProgressoRegua, faltantesObrigatorios, type DocReguaEstado } from "./regua";

/**
 * CANÁRIO/INVARIANTE (§A.38): "A RÉGUA NÃO FECHA COM SUSPEITO ABERTO."
 *
 * Quando a IA aprova mas suspeita da autenticidade, o documento vai a `AGUARDANDO_AUDITORIA` (ver
 * `decidirDestino`), NÃO a `ENTREGUE`. Este arquivo prova a OUTRA ponta do mesmo requisito: um
 * obrigatório em `AGUARDANDO_AUDITORIA` NÃO conta como entregue, então a régua NÃO fica completa, a
 * frente AUDITORIA não auto-conclui e NADA sobe ao Drive.
 *
 * NATUREZA DESTE TESTE: é um GUARDA de invariante, não um canário que falha hoje. `regua.ts` já só
 * considera `ENTREGUE` como entregue, então ele é VERDE hoje por construção. É exatamente essa
 * propriedade que faz o desenho do `decidirDestino` funcionar sem tocar a régua: mandar o suspeito
 * para `AGUARDANDO_AUDITORIA` basta para barrá-lo. Se alguém um dia passar a contar
 * `AGUARDANDO_AUDITORIA` como entregue, este teste fica VERMELHO e denuncia o vazamento do suspeito
 * para o fechamento da frente.
 */
describe("régua não fecha com documento suspeito (AGUARDANDO_AUDITORIA)", () => {
  const base: DocReguaEstado[] = [
    { nome: "RG", exigencia: "OBRIGATORIO", estado: "ENTREGUE" },
    { nome: "CPF", exigencia: "OBRIGATORIO", estado: "ENTREGUE" },
  ];

  it("um obrigatório em AGUARDANDO_AUDITORIA NÃO conta como entregue → régua incompleta", () => {
    const docs: DocReguaEstado[] = [
      ...base,
      { nome: "Comprovante de residência", exigencia: "OBRIGATORIO", estado: "AGUARDANDO_AUDITORIA" },
    ];

    const progresso = calcularProgressoRegua(docs);

    expect(progresso.completa).toBe(false);
    expect(progresso.obrigatoriosEntregues).toBe(2); // o suspeito NÃO entra na contagem
    expect(progresso.obrigatoriosTotal).toBe(3);
    expect(faltantesObrigatorios(docs)).toContain("Comprovante de residência");
  });

  it("só quando o suspeito for resolvido para ENTREGUE (validação humana) a régua fecha", () => {
    const docs: DocReguaEstado[] = [
      ...base,
      { nome: "Comprovante de residência", exigencia: "OBRIGATORIO", estado: "ENTREGUE" },
    ];

    const progresso = calcularProgressoRegua(docs);

    expect(progresso.completa).toBe(true);
    expect(faltantesObrigatorios(docs)).toHaveLength(0);
  });
});
