import { describe, expect, it } from "vitest";
import { resolverPrePreenchimento } from "./pre-preenchimento-liberacao";

/**
 * O BUG QUE ESTE TESTE SEGURA (reportado pelo diretor em 06/08/2026).
 *
 * O match partindo da Sala GRAVAVA o cliente na admissão (`cod_cliente = 56675`, provado no banco) e
 * a tela de Liberação abria com o campo VAZIO. O dado existia e era invisível: a fila não devolvia
 * `codCliente`, e a abertura do modal só olhava o vínculo feito na própria sessão.
 *
 * O valor central da funcionalidade é o cliente VIAJAR da Sala para a Liberação. Gravar sem exibir
 * não entrega nada, e é pior que não gravar: dá a impressão de que funcionou.
 */
describe("resolverPrePreenchimento", () => {
  it("usa o que a ADMISSÃO já trazia, que é a sugestão vinda da Sala (o bug)", () => {
    const r = resolverPrePreenchimento(
      { codCliente: "56675", cargoId: "cargo-1" },
      undefined, // ninguém vinculou nesta sessão: veio de um match feito antes, pela Sala
    );
    expect(r).toEqual({ codCliente: "56675", cargoId: "cargo-1" });
  });

  it("o vínculo feito AGORA vence o que a admissão trazia", () => {
    const r = resolverPrePreenchimento(
      { codCliente: "56675", cargoId: "cargo-1" },
      { codCliente: "1002", cargoId: "cargo-2" },
    );
    expect(r).toEqual({ codCliente: "1002", cargoId: "cargo-2" });
  });

  it("admissão SEM sugestão nenhuma abre vazia, como sempre foi (§A.26)", () => {
    const r = resolverPrePreenchimento({ codCliente: null, cargoId: null }, undefined);
    expect(r).toEqual({ codCliente: "", cargoId: "" });
  });

  it("preenche só o que existe: cliente sugerido sem cargo não inventa cargo", () => {
    const r = resolverPrePreenchimento({ codCliente: "56675", cargoId: null }, undefined);
    expect(r).toEqual({ codCliente: "56675", cargoId: "" });
  });
});
