import { describe, expect, it } from "vitest";
import { CANDIDATURA_SITUACOES, VAGA_STATUS_SEMENTE } from "@ea/shared-types";
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
describe("tomDoStatusVaga (a cor do status passou a vir do catálogo do diretor)", () => {
  it("todo status do catálogo tem tom, e é o tom que o diretor escolheu", () => {
    for (const s of VAGA_STATUS_SEMENTE) {
      expect(tomDoStatusVaga(s.codigo, VAGA_STATUS_SEMENTE)).toBe(s.tom);
    }
  });

  /**
   * O STATUS QUE A TELA AINDA NÃO CONHECE (criado em outra sessão, ou inativado e fora da leitura)
   * NÃO PODE SAIR SEM COR: a pill ficaria sem classe, cinza e sem ícone, sem nada falhar. O fallback
   * é o NEUTRO, e nunca o vermelho, que nesta casa é RECUSA (§A.12).
   */
  it("status fora do catálogo cai no neutro, e nunca no vermelho de recusa", () => {
    expect(tomDoStatusVaga("STATUS_QUE_NAO_EXISTE", VAGA_STATUS_SEMENTE)).toBe("nt");
  });

  it("o catálogo vazio não derruba a régua: ela responde neutro para todo mundo", () => {
    expect(tomDoStatusVaga("ABERTA", [])).toBe("nt");
  });
});
