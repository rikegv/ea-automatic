import { describe, expect, it } from "vitest";
import { fraseDaReabertura } from "./as-vaga-reabertura";

/**
 * O QUE ESTE TESTE PROTEGE: a tela PROMETENDO mais do que o dado sustenta.
 *
 * A reabertura ressuscita gente, e a decisão é do Master lendo a tela. Uma frase que diga "cada
 * pessoa volta para onde estava" no cancelamento ANTIGO (que não gravou onde ninguém estava) faz o
 * Master escolher achando que está desfazendo um gesto, quando na verdade está reescolhendo a
 * pessoa. Nada falha, nada avisa, e a trilha registra a escolha dele.
 */
describe("fraseDaReabertura", () => {
  it("promete volta exata SÓ quando a origem foi registrada", () => {
    const r = fraseDaReabertura("COM_ORIGEM", 3);
    expect(r.frase).toContain("volta exatamente para a situação em que estava");
    expect(r.alerta).toBe(false);
  });

  it("no cancelamento antigo, ADMITE que não sabe e diz que a pessoa volta em seleção", () => {
    const r = fraseDaReabertura("SEM_ORIGEM", 2);
    expect(r.frase).toContain("NÃO SABE");
    expect(r.frase).toContain("volta em seleção");
    expect(r.frase).not.toContain("exatamente");
    // É o único caso que acende alerta: decisão sobre pessoa com informação incompleta.
    expect(r.alerta).toBe(true);
  });

  it("quando o cancelamento não encerrou ninguém, não oferece nada", () => {
    const r = fraseDaReabertura("NINGUEM_DESCARTADO", 0);
    expect(r.frase).toContain("não encerrou o processo de ninguém");
    expect(r.frase).toContain("sem ninguém restaurado");
    expect(r.alerta).toBe(false);
  });

  /* O QUARTO CASO, MEDIDO NA HOMOLOGAÇÃO EM 11/09: a vaga cancelada `1234567` responde
     `SEM_ORIGEM` com a lista VAZIA. Um mapa por `origem` falaria de "quem você marcar" embaixo de
     uma lista sem ninguém para marcar. */
  it("não fala de quem marcar quando a lista do cancelamento antigo vem vazia", () => {
    const r = fraseDaReabertura("SEM_ORIGEM", 0);
    expect(r.frase).toContain("não há saída registrada nesta vaga");
    expect(r.frase).toContain("sem ninguém restaurado");
    expect(r.frase).not.toContain("Quem você marcar");
    // Sem ninguém a escolher, não há decisão arriscada a sinalizar.
    expect(r.alerta).toBe(false);
  });

  it("com origem registrada e lista vazia, diz o que vê em vez de prometer", () => {
    const r = fraseDaReabertura("COM_ORIGEM", 0);
    expect(r.frase).toContain("não há ninguém para trazer de volta");
    expect(r.alerta).toBe(false);
  });

  // §A.11: travessão proibido em qualquer texto que chegue ao usuário.
  it("nenhuma das frases carrega travessão", () => {
    const todas = (["COM_ORIGEM", "SEM_ORIGEM", "NINGUEM_DESCARTADO"] as const).flatMap((o) => [
      fraseDaReabertura(o, 0).frase,
      fraseDaReabertura(o, 2).frase,
    ]);
    for (const f of todas) expect(f).not.toContain("—");
  });
});
