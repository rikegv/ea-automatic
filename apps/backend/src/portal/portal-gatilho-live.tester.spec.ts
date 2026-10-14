import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";

/**
 * COBERTURA INDEPENDENTE (§A.38, agente `tester`, NÃO é o autor) do GATILHO LIVE do arquivamento.
 *
 * O GAP QUE ISTO FECHA. A regra do diretor é "o gatilho LIVE só dispara em ENTREGUE, nunca em
 * suspeito/INCONFORME/PENDENTE". A porta-do-portal (`portal-autenticidade.porta-do-portal.tester.
 * spec.ts`) prova que o ESTADO só vira ENTREGUE no caso certo, mas constrói o `PortalCredencialService`
 * com 6 argumentos, SEM a dependência `@Optional() arquivamento` (7º). Então, em TODA a suíte, o ramo
 * `this.arquivamento?.talvezArquivarDoVeredito(...)` (portal-credencial.service.ts:1313) nunca é
 * exercitado: a chamada do arquivamento é `?.` sobre `undefined`, um no-op silencioso. Este arquivo
 * injeta o 7º argumento e assere que o GATILHO é chamado EXATAMENTE quando o documento vira ENTREGUE.
 *
 * Harness espelhado do da porta-do-portal (mesmo db/leitor/armazenamento fakes), com o arquivamento
 * adicionado. §A.6: nenhuma fixture carrega PII real.
 */

const LINHA = {
  id: "cred-1",
  admissaoId: "adm-1",
  tipoDocumentoId: "tipo-1",
  objeto: "opaco/RG__uuid.pdf",
  contentType: "application/pdf",
  bytesConcedidos: 5 * 1024 * 1024,
  confirmadoEm: null as Date | null,
};

function montar(auditoria: Record<string, unknown> | null) {
  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
        ? [{ reprovacoes: 1 }]
        : chaves.includes("emAberto")
          ? [{ emAberto: 0 }]
          : chaves.includes("liberadoEm")
            ? []
            : chaves.includes("descricaoRegra")
              ? [{ descricaoRegra: "O documento deve estar legivel.", categoria: "CONFORMIDADE" }]
              : chaves.includes("nome") && chaves.includes("cpf")
                ? [{ nome: "CANDIDATO TESTE", cpf: "00000000000" }]
                : chaves.includes("codigo") && chaves.includes("nome")
                  ? [{ codigo: "RG", nome: "RG" }]
                  : [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => Promise.resolve(linhas),
      then: (r: (v: unknown) => unknown) => Promise.resolve(linhas).then(r),
    };
    return builder;
  };

  const db = {
    select,
    query: { portalCredenciais: { findFirst: async () => ({ ...LINHA }) } },
    update: () => ({
      set: () => {
        const fim = {
          where: () => fim,
          returning: async () => [{ id: LINHA.id }],
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
        return fim;
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  };

  const armazenamento = {
    consultarMetadado: async (objeto: string) => ({ objeto, bytes: 1024, contentType: "application/pdf" }),
    nomeDoBucket: () => "balde",
    corrigirContentType: async () => true,
    apagarObjeto: async () => true,
  };

  const leitor = {
    configurado: () => true,
    ler: async () => ({ aceito: true, chegada: { tamanhoBytes: 1024 }, auditoria, sugestoes: null }),
  };

  const talvezArquivarDoVeredito = vi.fn(async () => {});
  const arquivamento = { talvezArquivarDoVeredito } as never;

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    { configurada: () => true, registrar: vi.fn(async () => {}) } as never,
    { sincronizarDocumentosDaRegua: async () => {} } as never,
    arquivamento,
  );
  return { svc, talvezArquivarDoVeredito };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({ admissaoId: "adm-1", jtiLink: "jti-1", credencialId: "cred-1", avisoDoNavegador: true });

const VALIDADO_LIMPO = {
  status: "VALIDADO",
  valido: true,
  motivo: "Documento legivel e dentro da validade.",
  autenticidadeSuspeita: false,
};
const VALIDADO_SUSPEITO = {
  status: "VALIDADO",
  valido: true,
  motivo: "Documento legivel e dentro da validade.",
  autenticidadeSuspeita: true,
  autenticidadeMotivo: "Brasao com bordas serrilhadas, fonte fora do padrao do orgao.",
};
const INCONFORME = { status: "INCONFORME", valido: false, motivo: "documento fora do prazo" };
const PENDENTE = { status: "PENDENTE", valido: false, motivo: "imagem ilegivel" };

describe("Gatilho LIVE do arquivamento: só dispara em ENTREGUE", () => {
  it("VALIDADO sem suspeita (vira ENTREGUE): dispara com (admissaoId, tipoDocumentoId)", async () => {
    const { svc, talvezArquivarDoVeredito } = montar(VALIDADO_LIMPO);
    await confirmar(svc);
    expect(talvezArquivarDoVeredito).toHaveBeenCalledTimes(1);
    expect(talvezArquivarDoVeredito).toHaveBeenCalledWith("adm-1", "tipo-1");
  });

  it("VALIDADO COM suspeita (fica AGUARDANDO_AUDITORIA): NÃO dispara", async () => {
    const { svc, talvezArquivarDoVeredito } = montar(VALIDADO_SUSPEITO);
    await confirmar(svc);
    expect(talvezArquivarDoVeredito).not.toHaveBeenCalled();
  });

  it("INCONFORME: NÃO dispara", async () => {
    const { svc, talvezArquivarDoVeredito } = montar(INCONFORME);
    await confirmar(svc);
    expect(talvezArquivarDoVeredito).not.toHaveBeenCalled();
  });

  it("PENDENTE: NÃO dispara", async () => {
    const { svc, talvezArquivarDoVeredito } = montar(PENDENTE);
    await confirmar(svc);
    expect(talvezArquivarDoVeredito).not.toHaveBeenCalled();
  });
});
