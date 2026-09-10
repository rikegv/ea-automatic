import { describe, expect, it } from "vitest";
import { CANDIDATURA_SITUACOES, VAGA_STATUS } from "@ea/shared-types";
import { tomDaSituacao, tomDoStatusVaga } from "@/lib/as-candidatos-visual";

/**
 * §A.12: o ícone da pill acompanha o ESTADO REAL e nunca é fixo. Quem escolhe o ícone é a
 * `StatusPill` a partir do TOM, então testar o tom é testar o ícone.
 */
describe("tomDaSituacao (o ícone acompanha o estado real, §A.12)", () => {
  it("ALOCADO é ENTREGA, e por isso é check verde e não a exclamação de trabalho em andamento", () => {
    expect(tomDaSituacao("ALOCADO")).toBe("ok");
  });

  it("quem ocupa posição na vaga é êxito: aprovado, alocado e enviado para admissão", () => {
    expect(tomDaSituacao("APROVADO")).toBe("ok");
    expect(tomDaSituacao("ENVIADO_PARA_ADMISSAO")).toBe("ok");
  });

  it("quem saiu sem êxito é o X vermelho, e os dois motivos de saída pesam igual", () => {
    expect(tomDaSituacao("DESCARTADO")).toBe("dg");
    expect(tomDaSituacao("DESISTIU")).toBe("dg");
  });

  it("só quem segue em seleção fica na exclamação amarela de trabalho em andamento", () => {
    const amarelos = CANDIDATURA_SITUACOES.filter((s) => tomDaSituacao(s) === "wn");
    expect(amarelos).toEqual(["ATIVO"]);
  });

  it("toda situação do catálogo tem tom: nenhuma pill nasce sem cor decidida", () => {
    for (const s of CANDIDATURA_SITUACOES) expect(tomDaSituacao(s)).toBeTruthy();
  });
});

/**
 * ─ O QUE SAIU DAQUI, E POR QUE NÃO É PERDA DE COBERTURA ─────────────────────────────────────────
 *
 * ESTE ARQUIVO TINHA UM BLOCO DE `tomDaEtapa`, e ele mudou de casa junto com a função:
 * `lib/as-etapas.spec.ts` guarda a mesma régua contra o catálogo, com o fallback que a exaustividade
 * do compilador não cobre mais. Repetir aqui seria duas cópias divergindo no primeiro ajuste.
 *
 * UM DAQUELES CASOS MORREU DE PROPÓSITO, E VALE DIZER QUAL: "cada etapa tem um tom DIFERENTE das
 * outras". Ele guardava uma verdade que a paleta fechada garantia por acidente (cinco tons para
 * cinco etapas), e o diretor decidiu o contrário ao mandar a lista ser dele: com o funil editável,
 * a COR PODE REPETIR em etapas distantes na fila, porque quem lê se orienta pela ordem e pelo rótulo
 * escrito na pill. Mantê-lo faria o gate recusar a sexta etapa que o gerenciador existe para criar.
 *
 * O QUE NÃO SE PERDEU: "nenhuma etapa usa o vermelho de recusa" continua travado, e num lugar mais
 * forte do que este teste. O `dg` está FORA de `ETAPA_TONS` no vocabulário compartilhado, então ele
 * é recusado pelo CHECK do banco, pelo DTO do serviço e pelo seletor de cor da tela, e o fallback
 * ter de fugir do vermelho é afirmado em `as-etapas.spec.ts`.
 */
describe("tomDoStatusVaga (o resto do mapa visual segue intacto)", () => {
  it("todo status de vaga tem tom", () => {
    for (const s of VAGA_STATUS) expect(tomDoStatusVaga(s)).toBeTruthy();
  });
});
