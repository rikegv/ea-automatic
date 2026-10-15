import { describe, expect, it, vi } from "vitest";
import { PortalAcessoEmailService } from "./portal-acesso-email.service";

/**
 * COBERTURA do desfecho NOVO da porta de e-mail (§A.38): depois de provar a caixa e gravar CPF+data,
 * o candidato ENTRA direto (`ACESSO_ABERTO`), em vez de receber um novo link e reiniciar.
 *
 * O foco é a DELEGAÇÃO e o FALLBACK de `entrarNoAutoatendimento`: a cunhagem da sessão mora em
 * `PortalIdentidadeService.abrirSessaoNoAutoatendimento` (aqui é um dublê), e este serviço só PEDE.
 * As consultas de vínculo/autor (`admissaoVivaDoCandidato`/`autorDoLink`) e o `despacharLink` do
 * fallback são espionados, para o teste medir só a decisão deste método, sem tocar banco.
 */
const CTX = { ip: null, userAgent: null };

function montar(abrir: () => Promise<{ sessao: string; expiraEm: string } | null>) {
  const identidade = { abrirSessaoNoAutoatendimento: vi.fn(abrir) };
  const trilha = { registrar: vi.fn(async () => {}) };
  // Ordem do construtor: db, config, trilha, correio, envio, identidade, throttle, admissoes.
  const svc = new PortalAcessoEmailService(
    null as never,
    null as never,
    trilha as never,
    null as never,
    null as never,
    identidade as never,
    null as never,
    null as never,
  );
  // Isola o método: vínculo e autor resolvem fixo; o fallback é um dublê detectável.
  vi.spyOn(svc as never, "admissaoVivaDoCandidato").mockResolvedValue("adm-1" as never);
  vi.spyOn(svc as never, "autorDoLink").mockResolvedValue("autor-1" as never);
  const registrar = vi.spyOn(svc as never, "registrar").mockResolvedValue(undefined as never);
  const despachar = vi
    .spyOn(svc as never, "despacharLink")
    .mockResolvedValue({ situacao: "LINK_ENVIADO" } as never);
  const entrar = (
    svc as unknown as {
      entrarNoAutoatendimento: (
        candidatoId: string,
        ctx: typeof CTX,
      ) => Promise<{ situacao: string; sessao?: string; expiraEm?: string }>;
    }
  ).entrarNoAutoatendimento.bind(svc);
  return { svc, identidade, trilha, despachar, entrar, registrar };
}

describe("entrarNoAutoatendimento", () => {
  it("abriu a sessão: devolve ACESSO_ABERTO com a sessão e NÃO envia link", async () => {
    const { identidade, despachar, entrar } = montar(async () => ({ sessao: "SESS", expiraEm: "2026-10-15T15:00:00.000Z" }));

    const r = await entrar("cand-1", CTX);

    expect(identidade.abrirSessaoNoAutoatendimento).toHaveBeenCalledWith("adm-1", "autor-1", CTX);
    expect(r).toEqual({ situacao: "ACESSO_ABERTO", sessao: "SESS", expiraEm: "2026-10-15T15:00:00.000Z" });
    expect(despachar).not.toHaveBeenCalled(); // nenhum link é enviado no caminho feliz
  });

  it("porta de sessão desligada / fora do recorte (null): cai no fallback do link", async () => {
    const { despachar, entrar } = montar(async () => null);

    const r = await entrar("cand-1", CTX);

    expect(despachar).toHaveBeenCalledWith("cand-1", CTX);
    expect(r).toEqual({ situacao: "LINK_ENVIADO" });
  });

  it("falha ao abrir a sessão NÃO derruba o fluxo: cai no fallback do link", async () => {
    const { despachar, entrar } = montar(async () => {
      throw new Error("falha inesperada na cunhagem");
    });

    const r = await entrar("cand-1", CTX);

    expect(despachar).toHaveBeenCalledWith("cand-1", CTX);
    expect(r).toEqual({ situacao: "LINK_ENVIADO" });
  });

  it("sem admissão viva pelo vínculo: DADOS_RECEBIDOS, sem tentar abrir sessão", async () => {
    const { svc, identidade, despachar, entrar } = montar(async () => ({ sessao: "x", expiraEm: "y" }));
    vi.spyOn(svc as never, "admissaoVivaDoCandidato").mockResolvedValue(null as never);

    const r = await entrar("cand-1", CTX);

    expect(r).toEqual({ situacao: "DADOS_RECEBIDOS" });
    expect(identidade.abrirSessaoNoAutoatendimento).not.toHaveBeenCalled();
    expect(despachar).not.toHaveBeenCalled();
  });

  it("sem autor para o link: DADOS_RECEBIDOS, registra a recusa e não tenta abrir sessão", async () => {
    const { svc, identidade, entrar, registrar } = montar(async () => ({ sessao: "x", expiraEm: "y" }));
    vi.spyOn(svc as never, "autorDoLink").mockResolvedValue(null as never);

    const r = await entrar("cand-1", CTX);

    expect(r).toEqual({ situacao: "DADOS_RECEBIDOS" });
    expect(identidade.abrirSessaoNoAutoatendimento).not.toHaveBeenCalled();
    // G4: o rastro da recusa fica na trilha, com o motivo de catálogo.
    expect(registrar).toHaveBeenCalledWith("PORTAL_ACESSO_EMAIL_RECUSADO", CTX, {
      motivoCodigo: "SEM_AUTOR_PARA_O_LINK",
    });
  });
});
