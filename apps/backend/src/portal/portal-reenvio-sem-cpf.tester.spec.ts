import { describe, expect, it, vi } from "vitest";
import { PortalAcessoEmailService } from "./portal-acesso-email.service";
import { PortalEnvioController } from "./portal-envio.controller";
import { AdmissoesService } from "../admissoes/admissoes.service";
import { corpoDoConviteDePrimeiroAcesso } from "../domain/portal-envio";
import type { AuthUser } from "../auth/auth.types";

/**
 * COBERTURA DO ITEM 1: o reenvio de quem está SEM CPF (marcador PROV) é roteado para a PORTA DE
 * E-MAIL (convite de primeiro acesso), em vez do link clássico (CPF + nascimento), que o candidato
 * sem CPF nunca consegue passar.
 *
 * O REQUISITO (redação do diretor): antes de reenviar, a plataforma verifica se o candidato tem CPF
 * real. SEM CPF (PROV) manda o convite de primeiro acesso por e-mail; COM CPF real segue o fluxo
 * normal. A decisão REUSA `ehCpfProvisorio` (nunca um segundo caminho), e a porta de e-mail não
 * pode passar a ler a coluna de CPF da esteira (trava 1 de `portal-acesso-email.travas`).
 *
 * Construção por `Object.create` do protótipo: exercita o MÉTODO sem subir o container de injeção,
 * que é o que mantém este arquivo fora do caminho crítico (§A.40) e independente do autor (§A.38).
 */

// ── `AdmissoesService.ehAdmissaoSemCpf`: a decisão "é provisório?", pelo id ─────────────────────

function admissoesComFicha(
  ficha: { candidatoCpf: string; farolGlobal: string } | undefined,
): AdmissoesService {
  const svc = Object.create(AdmissoesService.prototype) as AdmissoesService;
  (svc as unknown as { db: unknown }).db = {
    query: { admissoes: { findFirst: vi.fn().mockResolvedValue(ficha) } },
  };
  return svc;
}

describe("AdmissoesService.ehAdmissaoSemCpf: admissão VIVA com marcador, pelo id, só booleano", () => {
  it("PROV + farol VIVO (EM_ADMISSAO) é sem CPF", async () => {
    const svc = admissoesComFicha({ candidatoCpf: "PROVABC1234", farolGlobal: "EM_ADMISSAO" });
    expect(await svc.ehAdmissaoSemCpf("adm-1")).toBe(true);
  });

  it("PROV + BANCO_AGUARDAR (também vivo) é sem CPF", async () => {
    const svc = admissoesComFicha({ candidatoCpf: "PROVABC1234", farolGlobal: "BANCO_AGUARDAR" });
    expect(await svc.ehAdmissaoSemCpf("adm-1")).toBe(true);
  });

  it("PROV mas DECLINOU NÃO roteia: o marcador PROV também é de declínio, e reenvio é de vivo", async () => {
    const svc = admissoesComFicha({ candidatoCpf: "PROVABC1234", farolGlobal: "DECLINOU" });
    expect(await svc.ehAdmissaoSemCpf("adm-1")).toBe(false);
  });

  it("PROV mas RESCISAO também não roteia", async () => {
    const svc = admissoesComFicha({ candidatoCpf: "PROVABC1234", farolGlobal: "RESCISAO" });
    expect(await svc.ehAdmissaoSemCpf("adm-1")).toBe(false);
  });

  it("CPF real (vivo) NÃO é sem CPF", async () => {
    const svc = admissoesComFicha({ candidatoCpf: "11144477735", farolGlobal: "EM_ADMISSAO" });
    expect(await svc.ehAdmissaoSemCpf("adm-1")).toBe(false);
  });

  it("admissão inexistente devolve false (o envio trata o NotFound como hoje)", async () => {
    const svc = admissoesComFicha(undefined);
    expect(await svc.ehAdmissaoSemCpf("adm-1")).toBe(false);
  });
});

// ── `PortalAcessoEmailService.rotearReenvioSemCpf`: o roteamento em si ──────────────────────────

interface FakeDeps {
  semCpf: boolean;
  email: string | null;
  nome?: string;
  correioConfigurado?: boolean;
  enviarLink?: ReturnType<typeof vi.fn>;
}

function roteadorCom(deps: FakeDeps): {
  svc: PortalAcessoEmailService;
  enviarLink: ReturnType<typeof vi.fn>;
  logErro: ReturnType<typeof vi.fn>;
} {
  const svc = Object.create(PortalAcessoEmailService.prototype) as PortalAcessoEmailService;
  const enviarLink = deps.enviarLink ?? vi.fn().mockResolvedValue(true);
  const logErro = vi.fn();
  // A consulta do e-mail é uma cadeia drizzle que resolve na linha do vínculo (ou vazio).
  const linhas = deps.email === null ? [] : [{ email: deps.email, nome: deps.nome ?? "Maria Teste" }];
  const cadeia = {
    from: () => cadeia,
    innerJoin: () => cadeia,
    where: () => cadeia,
    orderBy: () => cadeia,
    limit: () => Promise.resolve(linhas),
  };
  const alvo = svc as unknown as Record<string, unknown>;
  alvo.admissoes = { ehAdmissaoSemCpf: vi.fn().mockResolvedValue(deps.semCpf) };
  alvo.db = { select: () => cadeia };
  alvo.config = { get: (k: string) => (k === "PORTAL_LINK_BASE_URL" ? "https://portal.test/portal" : undefined) };
  alvo.correio = { configurado: () => deps.correioConfigurado ?? true, enviarLink };
  alvo.log = { error: logErro };
  return { svc, enviarLink, logErro };
}

describe("PortalAcessoEmailService.rotearReenvioSemCpf: roteia o reenvio do PROV", () => {
  it("COM CPF real se abstém (devolve null, o link clássico segue)", async () => {
    const { svc, enviarLink } = roteadorCom({ semCpf: false, email: "x@homolog.local" });
    expect(await svc.rotearReenvioSemCpf("adm-1")).toBeNull();
    expect(enviarLink).not.toHaveBeenCalled();
  });

  it("SEM CPF + e-mail + correio ligado: manda o CONVITE ao e-mail do FUNIL e mascara o destino", async () => {
    const { svc, enviarLink } = roteadorCom({ semCpf: true, email: "fulano@homolog.local" });
    const r = await svc.rotearReenvioSemCpf("adm-1");
    expect(r).toEqual({
      convitePrimeiroAcesso: true,
      enviado: true,
      motivo: null,
      destinoMascarado: expect.stringMatching(/\*/),
    });
    // Foi para o e-mail do FUNIL (o que a porta de e-mail resolve), e com o CORPO DO CONVITE, não o
    // do link clássico: o assunto é o do primeiro acesso.
    expect(enviarLink).toHaveBeenCalledTimes(1);
    const [destino, mensagem] = enviarLink.mock.calls[0];
    expect(destino).toBe("fulano@homolog.local");
    expect(mensagem.assunto).toBe("Primeiro Acesso Ao Portal Do Candidato");
    // §A.6: o destino volta MASCARADO na resposta, nunca o endereço em claro.
    expect(r?.destinoMascarado).not.toBe("fulano@homolog.local");
  });

  it("SEM CPF e SEM e-mail no funil: não manda nada, avisa SEM_EMAIL_NO_FUNIL", async () => {
    const { svc, enviarLink } = roteadorCom({ semCpf: true, email: null });
    const r = await svc.rotearReenvioSemCpf("adm-1");
    expect(r).toEqual({
      convitePrimeiroAcesso: true,
      enviado: false,
      motivo: "SEM_EMAIL_NO_FUNIL",
      destinoMascarado: null,
    });
    expect(enviarLink).not.toHaveBeenCalled();
  });

  it("SEM CPF + correio inerte (homolog): recusa CANAL_INDISPONIVEL sem fingir envio", async () => {
    const { svc, enviarLink } = roteadorCom({
      semCpf: true,
      email: "fulano@homolog.local",
      correioConfigurado: false,
    });
    const r = await svc.rotearReenvioSemCpf("adm-1");
    expect(r?.enviado).toBe(false);
    expect(r?.motivo).toBe("CANAL_INDISPONIVEL");
    expect(enviarLink).not.toHaveBeenCalled();
  });

  it("SEM CPF + correio estoura: FALHA_NO_ENVIO, e o log leva só o nome da classe (§A.6)", async () => {
    const enviarLink = vi.fn().mockRejectedValue(new Error("fulano@homolog.local recusado"));
    const { svc, logErro } = roteadorCom({ semCpf: true, email: "fulano@homolog.local", enviarLink });
    const r = await svc.rotearReenvioSemCpf("adm-1");
    expect(r?.enviado).toBe(false);
    expect(r?.motivo).toBe("FALHA_NO_ENVIO");
    // O log NUNCA repete a mensagem do erro (que aqui carrega o endereço): só o nome da classe.
    const logado = logErro.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logado).not.toContain("fulano@homolog.local");
    expect(logado).toContain("Error");
  });
});

// ── O corpo do CONVITE (§A.6/§A.11): leva a URL nua, sem travessão, sem CPF/credencial ──────────

describe("corpoDoConviteDePrimeiroAcesso: leva a URL do portal, sem travessão nem valor de CPF", () => {
  const corpo = corpoDoConviteDePrimeiroAcesso({
    nome: "Maria Teste",
    url: "https://portal.test/portal",
  });

  it("o assunto é o do primeiro acesso, em Title Case (§A.24)", () => {
    expect(corpo.assunto).toBe("Primeiro Acesso Ao Portal Do Candidato");
  });

  it("texto e HTML carregam a URL NUA do portal (sem token no fragmento)", () => {
    expect(corpo.texto).toContain("https://portal.test/portal");
    expect(corpo.html).toContain("https://portal.test/portal");
    // a URL do convite não leva token de link (o `#` de credencial é da porta clássica).
    expect(corpo.texto).not.toMatch(/#l=/);
  });

  it("NÃO contém travessão em lugar nenhum (§A.11)", () => {
    expect(corpo.assunto).not.toContain("—");
    expect(corpo.texto).not.toContain("—");
    expect(corpo.html).not.toContain("—");
  });

  it("o nome vai ESCAPADO no HTML (texto de terceiro não injeta marcação)", () => {
    const comTag = corpoDoConviteDePrimeiroAcesso({ nome: "<b>x</b>", url: "https://portal.test/portal" });
    expect(comTag.html).not.toContain("<b>x</b>");
    expect(comTag.html).toContain("&lt;b&gt;");
  });
});

// ── O controller roteia o PROV ANTES do envio do link, e cai no clássico quando não é PROV ──────

describe("PortalEnvioController.enviar: roteia o PROV antes, e só então envia o link clássico", () => {
  const user = { id: "user-1" } as AuthUser;
  const convite = { convitePrimeiroAcesso: true as const, enviado: true, motivo: null, destinoMascarado: "f****o@x" };

  it("quando `rotearReenvioSemCpf` resolve, devolve o convite e NÃO emite o link", async () => {
    const acessoEmail = { rotearReenvioSemCpf: vi.fn().mockResolvedValue(convite) };
    const envio = { enviarParaAdmissao: vi.fn() };
    const ctrl = new PortalEnvioController(envio as never, acessoEmail as never);
    const r = await ctrl.enviar("adm-1", user);
    expect(r).toBe(convite);
    expect(acessoEmail.rotearReenvioSemCpf).toHaveBeenCalledWith("adm-1");
    expect(envio.enviarParaAdmissao).not.toHaveBeenCalled();
  });

  it("quando NÃO é PROV (null), cai no envio do link clássico, MANUAL, com o autor da sessão", async () => {
    const acessoEmail = { rotearReenvioSemCpf: vi.fn().mockResolvedValue(null) };
    const resultadoLink = { enviado: true };
    const envio = { enviarParaAdmissao: vi.fn().mockResolvedValue(resultadoLink) };
    const ctrl = new PortalEnvioController(envio as never, acessoEmail as never);
    const r = await ctrl.enviar("adm-1", user);
    expect(r).toBe(resultadoLink);
    expect(envio.enviarParaAdmissao).toHaveBeenCalledWith("adm-1", "user-1", "MANUAL");
  });
});
