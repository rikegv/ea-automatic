import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { ATOR_SISTEMA_POS_VEREDITO } from "../auditoria/auditoria.service";

/**
 * COBERTURA DO AVANÇO DA AUDITORIA pela origem (frente Auditoria -> Avanço).
 *
 * O GAP QUE ISTO FECHA. A auditoria AUTOMÁTICA do Portal gravava ENTREGUE e arquivava, mas NÃO
 * chamava `aplicarPosVeredito`, então a frente AUDITORIA ficava presa em ANALISE_PENDENTE com a régua
 * completa. O fio novo está no ramo ENTREGUE, LADO A LADO com o gatilho do arquivamento (mesma
 * condição `destino.estado === "ENTREGUE"`). Este arquivo prova: (1) dispara o pós-veredito só em
 * ENTREGUE; (2) NÃO dispara em SUSPEITO/INCONFORME/PENDENTE; (3) o ator é SISTEMA com id NULO (FK
 * nula na trilha, §A.38); (4) best-effort: o pós-veredito lançar NÃO derruba a confirmação do
 * candidato.
 *
 * Harness espelhado do `portal-gatilho-live.tester.spec.ts`, com o 8º argumento (`auditoria`) somado.
 * §A.6: nenhuma fixture carrega PII real.
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

function montar(
  auditoriaResposta: Record<string, unknown> | null,
  posVeredito?: { aplicarPosVeredito: ReturnType<typeof vi.fn> },
) {
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
    ler: async () => ({
      aceito: true,
      chegada: { tamanhoBytes: 1024 },
      auditoria: auditoriaResposta,
      sugestoes: null,
    }),
  };

  const arquivamento = { talvezArquivarDoVeredito: vi.fn(async () => {}) } as never;
  const aplicarPosVeredito = posVeredito?.aplicarPosVeredito ?? vi.fn(async () => ({}));
  const auditoria = { aplicarPosVeredito } as never;

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    { configurada: () => true, registrar: vi.fn(async () => {}) } as never,
    { sincronizarDocumentosDaRegua: async () => {} } as never,
    arquivamento,
    auditoria,
  );
  return { svc, aplicarPosVeredito };
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

describe("Avanço da auditoria pela origem: só dispara aplicarPosVeredito em ENTREGUE", () => {
  it("VALIDADO sem suspeita (vira ENTREGUE): dispara o pós-veredito com o ator SISTEMA de id NULO", async () => {
    const { svc, aplicarPosVeredito } = montar(VALIDADO_LIMPO);
    await confirmar(svc);
    expect(aplicarPosVeredito).toHaveBeenCalledTimes(1);
    expect(aplicarPosVeredito).toHaveBeenCalledWith("adm-1", ATOR_SISTEMA_POS_VEREDITO);
    // A garantia de FK: o ator é de SISTEMA, id NULO, nunca um id falso.
    expect(ATOR_SISTEMA_POS_VEREDITO.id).toBeNull();
  });

  it("VALIDADO COM suspeita (fica AGUARDANDO_AUDITORIA): NÃO dispara o pós-veredito", async () => {
    const { svc, aplicarPosVeredito } = montar(VALIDADO_SUSPEITO);
    await confirmar(svc);
    expect(aplicarPosVeredito).not.toHaveBeenCalled();
  });

  it("INCONFORME: NÃO dispara o pós-veredito", async () => {
    const { svc, aplicarPosVeredito } = montar(INCONFORME);
    await confirmar(svc);
    expect(aplicarPosVeredito).not.toHaveBeenCalled();
  });

  it("PENDENTE: NÃO dispara o pós-veredito", async () => {
    const { svc, aplicarPosVeredito } = montar(PENDENTE);
    await confirmar(svc);
    expect(aplicarPosVeredito).not.toHaveBeenCalled();
  });

  it("BEST-EFFORT: o pós-veredito lançar NÃO derruba a confirmação do candidato", async () => {
    const aplicarPosVeredito = vi.fn(async () => {
      throw new Error("falha simulada do pos-veredito");
    });
    const { svc } = montar(VALIDADO_LIMPO, { aplicarPosVeredito });
    // Não lança: a confirmação resolve mesmo com o pós-veredito falhando.
    await expect(confirmar(svc)).resolves.toBeDefined();
    expect(aplicarPosVeredito).toHaveBeenCalledTimes(1);
  });
});
