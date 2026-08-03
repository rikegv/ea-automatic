import { describe, expect, it, vi } from "vitest";
import { ClicksignGestaoService } from "./clicksign-gestao.service";

/**
 * A LEITURA DE "QUEM ESTÁ DEVENDO" NÃO PODE DERRUBAR A TELA.
 *
 * A consulta é AO VIVO no provedor, então ela tem três jeitos de não dar certo que NÃO são defeito:
 * a admissão ainda não tem envelope, a integração está inerte (sem token) e a Clicksign está fora do
 * ar. Nos três, a tela precisa continuar de pé mostrando o motivo, e não um erro: quem abre o
 * gerenciador está tentando trabalhar a fila inteira, e uma linha ruim não pode levar as outras.
 */

const ENVELOPE = "env-1";

function montar(opts: {
  envelopeId?: string | null;
  ativo?: boolean;
  signers?: Array<{ id: string; nome: string; grupo: number | null }>;
  eventos?: Array<{ signerKey: string; em: string }>;
  explode?: boolean;
  semAdmissao?: boolean;
}) {
  const db = {
    select: () => ({
      from: () => ({
        where: async () =>
          opts.semAdmissao ? [] : [{ envelopeId: opts.envelopeId ?? null }],
      }),
    }),
  };
  const api = {
    estaAtivo: () => opts.ativo ?? true,
    listarSigners: vi.fn(async () => {
      if (opts.explode) throw new Error("Clicksign HTTP 500");
      return opts.signers ?? [];
    }),
    listarEventosAssinatura: vi.fn(async () => {
      if (opts.explode) throw new Error("Clicksign HTTP 500");
      return opts.eventos ?? [];
    }),
  };
  const svc = new ClicksignGestaoService(
    db as never,
    api as never,
    {} as never,
    {} as never,
  );
  return { svc, api };
}

describe("assinantes de um envelope", () => {
  it("devolve cada pessoa com o status dela", async () => {
    const { svc } = montar({
      envelopeId: ENVELOPE,
      signers: [
        { id: "s1", nome: "GABRIEL PIRES VALENTE", grupo: 1 },
        { id: "s2", nome: "Edilaine Carvalho", grupo: 2 },
      ],
      eventos: [{ signerKey: "s1", em: "2026-07-30T17:16:13.410-03:00" }],
    });

    const r = await svc.assinantes("adm-1");

    expect(r.resumo).toEqual({ total: 2, assinaram: 1, pendentes: 1 });
    // Pendente primeiro: é quem o consultor precisa cobrar.
    expect(r.assinantes[0]).toMatchObject({ nome: "Edilaine Carvalho", assinou: false });
    expect(r.assinantes[1]).toMatchObject({ nome: "GABRIEL PIRES VALENTE", assinou: true });
    expect(r.indisponivel).toBeUndefined();
  });

  it("sem envelope: não é erro, é uma admissão que ainda não foi disparada", async () => {
    const { svc, api } = montar({ envelopeId: null });

    const r = await svc.assinantes("adm-1");

    expect(r.assinantes).toEqual([]);
    expect(r.indisponivel).toContain("ainda não tem envelope");
    // E não gasta chamada ao provedor por uma admissão que não tem o que consultar.
    expect(api.listarSigners).not.toHaveBeenCalled();
  });

  it("integração inerte (sem token): avisa em vez de tentar a rede", async () => {
    const { svc, api } = montar({ envelopeId: ENVELOPE, ativo: false });

    const r = await svc.assinantes("adm-1");

    expect(r.indisponivel).toContain("inativa");
    expect(api.listarSigners).not.toHaveBeenCalled();
  });

  it("Clicksign fora do ar: a linha diz o motivo e a tela segue de pé", async () => {
    const { svc } = montar({ envelopeId: ENVELOPE, explode: true });

    const r = await svc.assinantes("adm-1");

    expect(r.assinantes).toEqual([]);
    expect(r.resumo).toEqual({ total: 0, assinaram: 0, pendentes: 0 });
    expect(r.indisponivel).toContain("Não foi possível consultar");
  });

  it("admissão inexistente é 404, e isso continua sendo erro de verdade", async () => {
    const { svc } = montar({ semAdmissao: true });
    await expect(svc.assinantes("nao-existe")).rejects.toThrow("Admissão não encontrada");
  });
});
