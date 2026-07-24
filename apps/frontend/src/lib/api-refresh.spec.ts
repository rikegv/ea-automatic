// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  apiUpload,
  definirTokenDaSessao,
  registrarGanchosDeSessao,
} from "./api";

/**
 * REFRESH DE SESSÃO NO CLIENTE HTTP (OST do refresh, Bloco 6).
 *
 * O caso real que originou a frente: o consultor passou mais de 15 minutos preenchendo o modal do
 * lote com 9 admissões e, ao clicar, tomou "Token de acesso inválido ou expirado". O access token
 * vive 15 minutos e não era renovado depois do mount; o refresh token, válido por 7 dias, existia e
 * ninguém usava.
 *
 * O que esta suíte trava:
 *  - 401 renova e REENVIA, e quem chamou nem vê o erro;
 *  - o CORPO GRANDE é reenviado ÍNTEGRO (o modal do lote não se perde);
 *  - anti-loop: refresh que falha não vira tentativa infinita;
 *  - renovação EM VOO COMPARTILHADA: N requisições com 401 disparam UM refresh;
 *  - upload (multipart) tem o mesmo tratamento do JSON;
 *  - mensagem ACIONÁVEL quando a sessão acaba de verdade.
 */

interface Chamada {
  url: string;
  init: RequestInit;
}

function resposta(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(corpo),
  } as unknown as Response;
}

/**
 * Backend fake: só aceita o token vigente. `expirarApos` simula o token da sessão vencendo, que é o
 * cenário real (o access morre enquanto o formulário está aberto).
 */
function backend(opts: { tokenValido: string; refreshOk?: boolean; novoToken?: string }) {
  const chamadas: Chamada[] = [];
  const refreshOk = opts.refreshOk ?? true;
  const novoToken = opts.novoToken ?? "token-novo";
  let tokenAceito = opts.tokenValido;

  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    chamadas.push({ url: u, init });

    if (u.endsWith("/auth/refresh")) {
      if (!refreshOk) return resposta(401, { message: "Sessão expirada" });
      tokenAceito = novoToken;
      return resposta(200, { accessToken: novoToken, user: { id: "u1", email: "a@b.c" } });
    }

    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Bearer ${tokenAceito}`) {
      return resposta(401, { message: "Token de acesso inválido ou expirado" });
    }
    return resposta(200, { ok: true });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { chamadas, fetchMock };
}

/** Corpo grande, no formato do lote real: 9 admissões + os campos do modal. */
const CORPO_DO_LOTE = {
  admissaoIds: Array.from({ length: 9 }, (_, i) => `adm-${i + 1}`),
  codCliente: "51709",
  cargoId: "cargo-atendente",
  tipoContrato: "Temporário",
  dataAdmissao: "2026-08-01",
  vagaFolha: { salario: "2500.00", escala: "12x36", centroCusto: "CC-1", gestorBp: "Fulano" },
  pacoteBeneficios: [
    { beneficioId: "vr-id", valor: 25 },
    { beneficioId: "vt-id", valor: 10 },
  ],
};

beforeEach(() => {
  // A sessão tem um token JÁ VENCIDO do ponto de vista do backend fake.
  definirTokenDaSessao("token-velho");
  registrarGanchosDeSessao({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  definirTokenDaSessao(null);
  registrarGanchosDeSessao({});
});

describe("cliente HTTP: renovação e reenvio em 401", () => {
  it("401 renova e REENVIA: quem chamou recebe o resultado, sem ver erro", async () => {
    const { chamadas } = backend({ tokenValido: "token-que-nao-e-o-da-sessao" });

    const r = await apiFetch<{ ok: boolean }>("/admissoes/liberar-lote", {
      method: "PATCH",
      body: CORPO_DO_LOTE,
    });

    expect(r).toEqual({ ok: true });
    const rotas = chamadas.map((c) => c.url);
    expect(rotas).toHaveLength(3); // 1ª tentativa (401) → refresh → reenvio
    expect(rotas[1]).toContain("/auth/refresh");
    expect((chamadas[2].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-novo",
    );
  });

  it("o CORPO GRANDE é reenviado ÍNTEGRO (o modal do lote não se perde)", async () => {
    const { chamadas } = backend({ tokenValido: "outro" });

    await apiFetch("/admissoes/liberar-lote", { method: "PATCH", body: CORPO_DO_LOTE });

    const primeiro = chamadas[0].init.body as string;
    const reenvio = chamadas[2].init.body as string;
    expect(reenvio).toBe(primeiro); // byte a byte
    const enviado = JSON.parse(reenvio);
    expect(enviado.admissaoIds).toHaveLength(9);
    expect(enviado).toEqual(CORPO_DO_LOTE);
    expect(chamadas[2].init.method).toBe("PATCH"); // método preservado
  });

  it("ANTI-LOOP: refresh que falha não gera tentativa infinita, e a sessão encerra", async () => {
    const { chamadas } = backend({ tokenValido: "outro", refreshOk: false });
    const expirou = vi.fn();
    registrarGanchosDeSessao({ aoExpirar: expirou });

    await expect(apiFetch("/esteira/auditoria", { method: "GET" })).rejects.toBeInstanceOf(ApiError);

    // Exatamente 2 chamadas: a original e UM refresh. Nenhuma terceira.
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1].url).toContain("/auth/refresh");
    expect(expirou).toHaveBeenCalledTimes(1);
  });

  it("RENOVAÇÃO COMPARTILHADA: 5 requisições simultâneas com 401 disparam UM único refresh", async () => {
    const { chamadas } = backend({ tokenValido: "outro" });

    await Promise.all([
      apiFetch("/a"),
      apiFetch("/b"),
      apiFetch("/c"),
      apiFetch("/d"),
      apiFetch("/e"),
    ]);

    const refreshes = chamadas.filter((c) => c.url.includes("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
    // 5 originais + 1 refresh + 5 reenvios.
    expect(chamadas).toHaveLength(11);
  });

  it("o token renovado é devolvido ao AuthProvider (o estado da tela acompanha)", async () => {
    backend({ tokenValido: "outro", novoToken: "token-fresquinho" });
    const renovou = vi.fn();
    registrarGanchosDeSessao({ aoRenovar: renovou });

    await apiFetch("/qualquer");

    expect(renovou).toHaveBeenCalledWith("token-fresquinho", { id: "u1", email: "a@b.c" });
  });

  it("UPLOAD (multipart) tem o mesmo tratamento: renova, reenvia e mantém o MESMO FormData", async () => {
    const { chamadas } = backend({ tokenValido: "outro" });
    const fd = new FormData();
    fd.append("tipoDocumentoId", "tipo-1");

    await apiUpload("/esteira/auditoria/adm-1/documento", fd);

    expect(chamadas).toHaveLength(3);
    expect(chamadas[2].init.body).toBe(fd); // mesma referência, arquivo preservado
    expect((chamadas[2].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-novo",
    );
  });

  it("sessão acabada de verdade: mensagem ACIONÁVEL, não o texto cru do guard", async () => {
    backend({ tokenValido: "outro", refreshOk: false });

    const erro = await apiFetch("/qualquer").catch((e) => e as ApiError);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(401);
    expect((erro as ApiError).message).toContain("Sua sessão expirou");
    expect((erro as ApiError).message).not.toContain("Token de acesso inválido");
  });

  it("401 na PRÓPRIA rota de sessão não entra no ciclo (sem retry, sem loop)", async () => {
    const { chamadas } = backend({ tokenValido: "outro", refreshOk: false });

    await expect(apiFetch("/auth/refresh", { method: "POST" })).rejects.toBeInstanceOf(ApiError);

    expect(chamadas).toHaveLength(1);
  });

  it("requisição com token VÁLIDO não renova nada (o caminho feliz segue com 1 chamada)", async () => {
    const { chamadas } = backend({ tokenValido: "token-velho" });

    await apiFetch("/qualquer");

    expect(chamadas).toHaveLength(1);
  });
});
