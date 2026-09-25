import { describe, expect, it } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { cabeOutroArquivo } from "../domain/portal-arquivo-unico";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), do REQUISITO, em paralelo a construcao. NAO escrevi o codigo.
 *
 * REQ 9: a guarda de servidor (UM ARQUIVO POR TIPO) recusa o SEGUNDO envio de um documento cujo
 * envio esta em aberto (chegou, ainda nao reprovado, ex.: aprovado/em analise) e ACEITA um novo
 * envio depois de o anterior ter sido REPROVADO (reprovado nao conta como "em aberto"). E a mesma
 * regua que a trilha le para reabrir a casa de "substituir" (ligada ao REQ 1: reprovado -> AJUSTAR).
 *
 * DOIS NIVEIS: a regua pura (`cabeOutroArquivo`) e a leitura do servidor
 * (`cabeOutroArquivoNaPendencia`), que le SO `portal_credenciais` (confirmado e nao reprovado).
 * Persistir a conferencia NAO participa desta conta (C10).
 *
 * §A.6: contagem e booleano, nada pessoal.
 */

describe("REQ 9 (regua pura): so cabe arquivo novo quando nao ha envio em aberto", () => {
  it("zero envio em aberto -> cabe (aceita)", () => {
    expect(cabeOutroArquivo({ enviosEmAberto: 0 })).toBe(true);
  });
  it("um envio em aberto -> nao cabe (recusa o segundo)", () => {
    expect(cabeOutroArquivo({ enviosEmAberto: 1 })).toBe(false);
  });
});

/**
 * O servidor le a conta de `portal_credenciais`: `marcoDaReabertura` (liberadoEm) e
 * `enviosEmAbertoDaPendencia` (count de confirmado e nao reprovado). O dublê responde por projecao.
 */
function servico(emAberto: number) {
  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("liberadoEm")
      ? [] // sem reabertura: marco nulo
      : chaves.includes("emAberto")
      ? [{ emAberto }]
      : [];
    const builder = {
      from: () => builder,
      where: () => Promise.resolve(linhas),
      then: (r: (v: unknown) => unknown) => Promise.resolve(linhas).then(r),
    };
    return builder;
  };
  const db = { select } as never;
  return new PortalCredencialService(
    db,
    { get: () => "pepper" } as never,
    {} as never,
    { configurado: () => false } as never,
    { configurada: () => true, registrar: async () => {} } as never,
  );
}

describe("REQ 9 (servidor): a leitura recusa o aprovado/em analise e aceita apos reprovado", () => {
  it("APROVADO / em analise (envio confirmado e nao reprovado em aberto): NAO cabe outro", async () => {
    const svc = servico(1);
    expect(await svc.cabeOutroArquivoNaPendencia("adm-1", "tipo-1")).toBe(false);
  });

  it("REPROVADO (reprovado_em some da conta de em aberto): cabe outro (aceita o reenvio)", async () => {
    const svc = servico(0);
    expect(await svc.cabeOutroArquivoNaPendencia("adm-1", "tipo-1")).toBe(true);
  });
});
