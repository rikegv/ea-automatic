import { describe, expect, it, vi } from "vitest";
import { PortalAcessoEmailService } from "./portal-acesso-email.service";
import { PortalEnvioController } from "./portal-envio.controller";

/**
 * ─ AJUSTE 3: O LINK PARA COPIAR, DIRECIONADO PELO ESTADO DO CANDIDATO (cobertura §A.38/§A.40) ──
 *
 * A frente é: o botão de COPIAR do Gerenciador entrega o link que BATE com o caminho que o
 * candidato consegue concluir. Candidato SEM CPF (marcador PROV) não passa na porta clássica
 * (CPF + nascimento), então recebe a URL NUA do Portal, que abre direto a porta de acesso por
 * e-mail. Candidato COM CPF segue com o link clássico (token no fragmento), intocado.
 *
 * O que se afirma aqui é o COMPORTAMENTO observável, nos dois pontos onde a decisão mora:
 *  1. `PortalAcessoEmailService.linkDirecionadoSemCpf`, que decide e monta a URL nua do PROV;
 *  2. `PortalEnvioController.gerarLink`, que roteia o PROV ANTES da emissão clássica.
 *
 * §A.6: toda URL aqui é SINTÉTICA. A URL nua NÃO é credencial (não tem token), e o teste prova
 * justamente que ela sai SEM o fragmento `#t=` que marcaria um link clássico.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = "https://portal.exemplo.test/portal";

function servico(ehSemCpf: boolean) {
  const config = { get: (c: string) => (c === "PORTAL_LINK_BASE_URL" ? BASE : undefined) };
  const admissoes = { ehAdmissaoSemCpf: vi.fn(async () => ehSemCpf) };
  // A URL nua não emite nem toca banco/correio/trilha; estes dublês EXPLODEM se forem usados, o
  // que torna o teste uma prova de que o caminho do PROV não encosta na emissão.
  const explode = new Proxy(
    {},
    { get: () => () => { throw new Error("o link direcionado NAO pode tocar este colaborador"); } },
  );
  const svc = new PortalAcessoEmailService(
    explode as any, // db
    config as any,
    explode as any, // trilha
    explode as any, // correio
    explode as any, // envio
    explode as any, // identidade
    explode as any, // throttle
    admissoes as any,
  );
  return { svc, admissoes };
}

describe("AJUSTE 3: linkDirecionadoSemCpf (a URL nua do PROV)", () => {
  it("PROV: devolve a URL NUA do Portal, SEM fragmento #t=, sem vencimento, com o bit de direcionado", async () => {
    const { svc, admissoes } = servico(true);
    const r = await svc.linkDirecionadoSemCpf("adm-prov");
    expect(admissoes.ehAdmissaoSemCpf).toHaveBeenCalledWith("adm-prov");
    expect(r).not.toBeNull();
    expect(r!.gerado).toBe(true);
    expect(r!.motivo).toBeNull();
    expect(r!.link).toBe(BASE);
    // A diferença que importa: a porta de e-mail abre com a URL NUA, NUNCA com o token clássico.
    expect(r!.link).not.toContain("#t=");
    expect(r!.link).not.toContain("#");
    expect(r!.expiraEm).toBeNull();
    expect(r!.direcionadoParaEmail).toBe(true);
  });

  it("COM CPF real: ABSTÉM-SE (devolve null) para o caminho clássico seguir inteiro", async () => {
    const { svc } = servico(false);
    expect(await svc.linkDirecionadoSemCpf("adm-cpf")).toBeNull();
  });

  it("sem PORTAL_LINK_BASE_URL a URL sai RELATIVA (/portal), visivelmente incompleta de propósito", async () => {
    const config = { get: () => undefined };
    const admissoes = { ehAdmissaoSemCpf: vi.fn(async () => true) };
    const svc = new PortalAcessoEmailService(
      null as any, config as any, null as any, null as any, null as any, null as any, null as any, admissoes as any,
    );
    const r = await svc.linkDirecionadoSemCpf("adm-prov");
    expect(r!.link).toBe("/portal");
  });

  it("barra final da env é aparada, igual ao link clássico: `.../portal/` e `.../portal` não divergem", async () => {
    const config = { get: (c: string) => (c === "PORTAL_LINK_BASE_URL" ? `${BASE}/` : undefined) };
    const admissoes = { ehAdmissaoSemCpf: vi.fn(async () => true) };
    const svc = new PortalAcessoEmailService(
      null as any, config as any, null as any, null as any, null as any, null as any, null as any, admissoes as any,
    );
    const r = await svc.linkDirecionadoSemCpf("adm-prov");
    expect(r!.link).toBe(BASE);
  });
});

describe("AJUSTE 3: PortalEnvioController.gerarLink roteia o PROV ANTES da emissão", () => {
  const res = { set: vi.fn() } as any;
  const user = { id: "autor-1" } as any;

  it("PROV: devolve o link direcionado e NÃO chama a emissão clássica", async () => {
    const direcionado = {
      gerado: true, motivo: null, link: BASE, expiraEm: null, direcionadoParaEmail: true,
    };
    const envio = { gerarLinkParaCopiar: vi.fn() };
    const acessoEmail = { linkDirecionadoSemCpf: vi.fn(async () => direcionado) };
    const ctrl = new PortalEnvioController(envio as any, acessoEmail as any);

    const r = await ctrl.gerarLink(res, "adm-prov", user);
    expect(acessoEmail.linkDirecionadoSemCpf).toHaveBeenCalledWith("adm-prov");
    expect(envio.gerarLinkParaCopiar).not.toHaveBeenCalled();
    expect(r).toBe(direcionado);
  });

  it("COM CPF real: cai no caminho clássico de emissão, EXATAMENTE como antes", async () => {
    const classico = { gerado: true, motivo: null, link: `${BASE}#t=tok`, expiraEm: "x" };
    const envio = { gerarLinkParaCopiar: vi.fn(async () => classico) };
    const acessoEmail = { linkDirecionadoSemCpf: vi.fn(async () => null) };
    const ctrl = new PortalEnvioController(envio as any, acessoEmail as any);

    const r = await ctrl.gerarLink(res, "adm-cpf", user);
    expect(acessoEmail.linkDirecionadoSemCpf).toHaveBeenCalledWith("adm-cpf");
    expect(envio.gerarLinkParaCopiar).toHaveBeenCalledWith("adm-cpf", "autor-1");
    expect(r).toBe(classico);
  });
});
