import { describe, expect, it } from "vitest";
import { fraseDaReabertura, fraseDaReaberturaDeEntrega } from "./as-vaga-reabertura";

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

/**
 * ─ A REABERTURA DA VAGA ENTREGUE (30/09) ───────────────────────────────────────────────────────
 *
 * O QUE ESTE BLOCO PROTEGE: a tela falando de um CANCELAMENTO que não existe. A vaga entregue nunca
 * foi cancelada, então qualquer frase das cinco de cima estaria bem escrita e seria falsa nela, que
 * é exatamente o modo de falha que este arquivo existe para impedir.
 *
 * E PROTEGE O AVISO QUE O DIRETOR PEDIU: quem clica precisa ler, ANTES de confirmar, que a vaga volta
 * para Aberta e que os candidatos voltam para o começo do funil.
 */
describe("fraseDaReaberturaDeEntrega", () => {
  it("nunca fala de cancelamento, porque não houve cancelamento nenhum", () => {
    for (const quantos of [0, 3]) {
      const r = fraseDaReaberturaDeEntrega(quantos);
      expect(r.frase.toLowerCase(), String(quantos)).not.toContain("cancelamento");
      expect(r.frase.toLowerCase(), String(quantos)).not.toContain("cancelada");
    }
  });

  it("diz o que vai acontecer: volta para Aberta e os candidatos voltam para o começo do funil", () => {
    const r = fraseDaReaberturaDeEntrega(0);
    expect(r.frase).toContain("volta para Aberta");
    expect(r.frase).toContain("começo do funil");
    expect(r.frase).toContain("nova triagem");
    expect(r.frase).toContain("reprova a entrega");
  });

  /* A ETAPA DE DESTINO NÃO É PROMETIDA COMO LEI: no serviço ela é a etapa marcada como destino da
     reabertura no catálogo, e esta tela não lê esse flag. Dizer "hoje é a Triagem" é verdade nos dois
     casos; dizer "vai para a Triagem" seria prometer sobre um dado que a tela não tem. */
  it("nomeia a Triagem como o estado de hoje, e não como promessa", () => {
    expect(fraseDaReaberturaDeEntrega(0).frase).toContain("que hoje é a Triagem");
  });

  it("não fala de quem marcar quando não há ninguém a oferecer", () => {
    const r = fraseDaReaberturaDeEntrega(0);
    expect(r.frase).toContain("Não há ninguém para trazer de volta");
    expect(r.frase).not.toContain("quem você marcar");
    const comGente = fraseDaReaberturaDeEntrega(2);
    expect(comGente.frase).toContain("quem você marcar");
  });

  /* O AMARELO CONTINUA SENDO DO CASO DE INFORMAÇÃO INCOMPLETA SOBRE PESSOA (o `SEM_ORIGEM` com
     gente), e não deste: aqui a informação está completa, e a frase avisa do efeito. */
  it("não acende alerta, e a régua do amarelo segue valendo", () => {
    expect(fraseDaReaberturaDeEntrega(0).alerta).toBe(false);
    expect(fraseDaReaberturaDeEntrega(2).alerta).toBe(false);
    expect(fraseDaReabertura("SEM_ORIGEM", 2).alerta).toBe(true);
  });

  // §A.11
  it("nenhuma das frases carrega travessão", () => {
    expect(fraseDaReaberturaDeEntrega(0).frase).not.toContain("—");
    expect(fraseDaReaberturaDeEntrega(2).frase).not.toContain("—");
  });
});
