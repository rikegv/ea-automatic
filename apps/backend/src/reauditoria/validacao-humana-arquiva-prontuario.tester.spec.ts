import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { AuditoriaService } from "../auditoria/auditoria.service";
import type { PortalArquivamentoService } from "../portal/portal-arquivamento.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";

/**
 * TESTER INDEPENDENTE (§A.38) do AJUSTE A: documento aprovado À MÃO (validação humana) também dispara
 * o arquivamento do Portal, pelo tipo recém-validado. Antes, só o caminho do candidato arquivava, e o
 * suspeito validado à mão ficava fora do prontuário.
 *
 * Trava três coisas: (1) `talvezArquivarDoVeredito` é chamado com (admissaoId, tipoDocumentoId) quando
 * o doc vira ENTREGUE; (2) a validação NÃO quebra se o arquivamento lançar (best-effort, ação do
 * consultor é soberana); (3) sem o serviço injetado (inerte/binding ausente) a validação segue igual.
 */

const USER: AuthUser = { id: "u1", email: "c@soulan.com.br", papel: "COMUM", senhaTemporaria: false };
const TIPO = { id: "tipo-esc", codigo: "COMPROV_ESCOLARIDADE", nome: "Comprovante de Escolaridade" };

function makeDb() {
  const db = {
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(TIPO) },
      documentosAdmissao: { findFirst: vi.fn(async () => ({ estado: "AGUARDANDO_AUDITORIA" })) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Fulano", email: USER.email }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue({ codCliente: "C-1", cargoId: "cargo-1" }) },
    },
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) =>
        "campo" in v ? Promise.resolve(undefined) : { onConflictDoUpdate: async () => undefined },
    })),
    select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => Promise.resolve([]) }) }) })),
  };
  return db;
}

const auditoria = {
  aplicarPosVeredito: vi.fn().mockResolvedValue({ progresso: { completa: true } }),
} as unknown as AuditoriaService;

describe("validação humana arquiva o prontuário do Portal (AJUSTE A)", () => {
  it("chama talvezArquivarDoVeredito com (admissaoId, tipoDocumentoId) ao virar ENTREGUE", async () => {
    const talvez = vi.fn(async () => {});
    const arquivamento = { talvezArquivarDoVeredito: talvez } as unknown as PortalArquivamentoService;
    const svc = new ValidacaoHumanaService(makeDb() as never, auditoria, arquivamento);
    const r = await svc.validar("adm-77", TIPO.id, USER);
    expect(r.documento.estado).toBe("ENTREGUE");
    expect(talvez).toHaveBeenCalledTimes(1);
    expect(talvez).toHaveBeenCalledWith("adm-77", TIPO.id);
  });

  it("BEST-EFFORT: se o arquivamento lançar, a validação humana NÃO quebra", async () => {
    const talvez = vi.fn(async () => {
      throw new Error("instancia 8027 fora");
    });
    const arquivamento = { talvezArquivarDoVeredito: talvez } as unknown as PortalArquivamentoService;
    const svc = new ValidacaoHumanaService(makeDb() as never, auditoria, arquivamento);
    const r = await svc.validar("adm-77", TIPO.id, USER);
    expect(r.documento.estado).toBe("ENTREGUE"); // validou mesmo com o arquivamento falhando
    expect(talvez).toHaveBeenCalledOnce();
  });

  it("sem o serviço injetado (inerte), a validação segue e não lança", async () => {
    const svc = new ValidacaoHumanaService(makeDb() as never, auditoria);
    const r = await svc.validar("adm-77", TIPO.id, USER);
    expect(r.documento.estado).toBe("ENTREGUE");
  });
});
