import { describe, expect, it } from "vitest";
import {
  JANELA_DE_REENVIO_MS,
  entregueHaPouco,
  instanteDaEntrega,
} from "./portal-envio";

/**
 * ══ A JANELA PASSOU A CONTAR DA ENTREGA, E NÃO DO E-MAIL (correção do achado 14) ══════════════
 *
 * O critério antigo olhava só `enviado_em`, carimbo que SÓ o caminho do e-mail escreve. O link
 * entregue À MÃO (o botão "gerar link", que devolve a URL na tela e nasce sem esse carimbo) ficava
 * de fora da janela, e um clique em "enviar por e-mail" segundos depois REVOGAVA a URL que o
 * consultor tinha acabado de entregar. Os dois botões ficam lado a lado na coluna de Ações.
 *
 * §A.6: nada aqui tem pessoa dentro. São carimbos de tempo.
 */

const AGORA = Date.now();

describe("instanteDaEntrega: o carimbo que serve às DUAS entregas", () => {
  it("entrega por e-mail: vale o `enviado_em`", () => {
    const enviadoEm = new Date(AGORA - 1_000);
    expect(instanteDaEntrega({ enviadoEm, criadoEm: new Date(AGORA - 5_000) })).toBe(enviadoEm);
  });

  it("entrega à mão: sem `enviado_em`, vale o nascimento da linha", () => {
    const criadoEm = new Date(AGORA - 5_000);
    expect(instanteDaEntrega({ enviadoEm: null, criadoEm })).toBe(criadoEm);
  });

  it("sem carimbo nenhum, não há entrega a proteger", () => {
    expect(instanteDaEntrega({})).toBeNull();
  });
});

describe("entregueHaPouco: quem acabou de receber o link não é atropelado", () => {
  it("link ENTREGUE À MÃO agora há pouco está dentro da janela (era a fresta)", () => {
    expect(entregueHaPouco({ enviadoEm: null, criadoEm: new Date(AGORA - 5_000) }, AGORA)).toBe(
      true,
    );
  });

  it("link enviado por e-mail agora há pouco continua dentro da janela", () => {
    expect(entregueHaPouco({ enviadoEm: new Date(AGORA - 5_000) }, AGORA)).toBe(true);
  });

  /**
   * O VÃO ENTRE EMITIR E CARIMBAR: a linha nasce no `insert` e o `enviado_em` só é escrito depois
   * de o correio aceitar a mensagem. Contando da criação, esse pedaço também fica coberto, que é
   * o que a auditoria tinha deixado como "meio cumprido".
   */
  it("linha recém-criada e ainda sem carimbo de envio já está protegida", () => {
    expect(entregueHaPouco({ enviadoEm: null, criadoEm: new Date(AGORA - 200) }, AGORA)).toBe(true);
  });

  it("passada a janela, o reenvio legítimo volta a passar, pelas duas portas", () => {
    const fora = new Date(AGORA - JANELA_DE_REENVIO_MS - 1);
    expect(entregueHaPouco({ criadoEm: fora }, AGORA)).toBe(false);
    expect(entregueHaPouco({ enviadoEm: fora, criadoEm: fora }, AGORA)).toBe(false);
  });

  it("sem carimbo nenhum não segura ninguém", () => {
    expect(entregueHaPouco({}, AGORA)).toBe(false);
  });
});
