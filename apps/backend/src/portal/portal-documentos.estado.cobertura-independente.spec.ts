import { describe, expect, it, vi } from "vitest";
import type { CampoExtraidoPortal, VereditoDoDocumento } from "@ea/shared-types";
import {
  TETO_REPROVACOES_POR_PENDENCIA,
  AVISO_PENDENCIA_NO_TIME,
} from "../domain/portal-tentativas";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";

/**
 * TESTER INDEPENDENTE (§A.38), escrito A PARTIR DO REQUISITO, em paralelo à construção.
 *
 * AJUSTE 2 do motor do Portal: a casa da trilha vem `AGUARDANDO_VALIDACAO` quando a IA já leu, o
 * veredito não reprovou e o candidato ainda não confirmou. A PRECEDÊNCIA pedida é
 * ACEITO > NO_TIME > AJUSTAR > AGUARDANDO_VALIDACAO > EM_ANALISE > PENDENTE.
 *
 * ┌─ POR QUE ESTE ARQUIVO NÃO TESTA MAIS FORMATO DE DATA ─────────────────────────────────────────┐
 * │ O AJUSTE 1 (data em DD/MM/AAAA) MUDOU DE CAMADA por veto do `seguranca`: saiu do backend e foi │
 * │ para o FRONTEND (display-only). O backend voltou a emitir a data ISO CRUA, byte a byte, e a    │
 * │ prova do formato brasileiro vive agora em `apps/frontend/src/lib/portal-data-br.*.spec.ts` e   │
 * │ no comportamento de `CamposGi.tsx`. Aqui fica só o que é do backend: o ESTADO da casa, e a     │
 * │ garantia de que a projeção NÃO formata a data (senão a camada teria voltado sozinha).          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: fixtures sintéticos, não pertencem a ninguém. §A.11: sem travessão.
 */

const SINTETICO = {
  admissaoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  primeiroNome: "Candidata",
  cargoId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  codCliente: "C9999",
};

type Veredito = VereditoDoDocumento | null;

type LinhaDoc = {
  tipoDocumentoId: string;
  codigo: string;
  nome: string;
  estadoDocumento: string;
  exigencia: string | null;
  clienteVinculoId: string | null;
  reprovacoes: number;
  envioEmAberto: boolean;
  dica: string | null;
  conferenciaId: string | null;
  conferenciaCampos: CampoExtraidoPortal[] | null;
  conferenciaVeredito: Veredito;
  conferenciaConfirmadoEm: Date | null;
};

function campo(valor: string, extra: Partial<CampoExtraidoPortal> = {}): CampoExtraidoPortal {
  return {
    campo: extra.campo ?? "rgDataEmissao",
    rotulo: extra.rotulo ?? "Data de emissao do RG",
    valor,
    confianca: extra.confianca ?? 0.99,
    lido: extra.lido ?? true,
  };
}

const REPROVADO: VereditoDoDocumento = {
  status: "REPROVADO",
  valido: false,
  codigo: "ILEGIVEL",
  mensagem: "Nao deu para ler, reenvie mais nitido.",
};

const APROVADO: VereditoDoDocumento = {
  status: "APROVADO",
  valido: true,
  codigo: "GENERICO",
  mensagem: "ok",
};

function doc(parcial: Partial<LinhaDoc> & { codigo: string }): LinhaDoc {
  const temConf =
    parcial.conferenciaCampos !== undefined ||
    parcial.conferenciaVeredito !== undefined ||
    parcial.conferenciaConfirmadoEm !== undefined ||
    parcial.conferenciaId !== undefined;
  return {
    tipoDocumentoId: parcial.tipoDocumentoId ?? `tipo-${parcial.codigo}`,
    codigo: parcial.codigo,
    nome: parcial.nome ?? parcial.codigo,
    estadoDocumento: parcial.estadoDocumento ?? "PENDENTE",
    exigencia: parcial.exigencia === undefined ? "OBRIGATORIO" : parcial.exigencia,
    clienteVinculoId: parcial.clienteVinculoId ?? null,
    reprovacoes: parcial.reprovacoes ?? 0,
    envioEmAberto: parcial.envioEmAberto ?? false,
    dica: parcial.dica ?? null,
    conferenciaId: parcial.conferenciaId ?? (temConf ? `conf-${parcial.codigo}` : null),
    conferenciaCampos: parcial.conferenciaCampos ?? (temConf ? [] : null),
    conferenciaVeredito: parcial.conferenciaVeredito ?? null,
    conferenciaConfirmadoEm: parcial.conferenciaConfirmadoEm ?? null,
  };
}

const LINK_VIVO = () => ({
  expiraEm: new Date(Date.now() + 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
});

function banco(docs: LinhaDoc[]) {
  const vistos = new WeakSet<object>();
  const capturar = (valor: unknown, nivel = 0) => {
    if (nivel > 8 || valor == null) return;
    if (typeof valor === "string" || typeof valor !== "object") return;
    if (vistos.has(valor as object)) return;
    vistos.add(valor as object);
    for (const v of Object.values(valor as Record<string, unknown>)) capturar(v, nivel + 1);
  };

  const cabecalho = [
    {
      primeiroNome: SINTETICO.primeiroNome,
      cargo: "Auxiliar De Limpeza",
      cliente: "Operacao Sintetica",
      codCliente: SINTETICO.codCliente,
      cargoId: SINTETICO.cargoId,
    },
  ];

  const linhasPara = (proj: Record<string, unknown> | undefined) => {
    const chaves = Object.keys(proj ?? {}).join(",").toLowerCase();
    if (chaves.includes("suspensoate")) return [LINK_VIVO()];
    if (chaves.includes("primeironome")) return cabecalho;
    if (chaves.includes("tipodocumentoid")) return docs;
    return [];
  };

  const cadeia = (linhas: unknown[]): any =>
    new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(linhas).then(ok, erro);
          }
          return (...args: unknown[]) => {
            for (const a of args) capturar(a);
            return cadeia(linhas);
          };
        },
      },
    );

  return { db: { select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)) } as never };
}

function credenciais(docs: LinhaDoc[]) {
  const daPendencia = (tipoDocumentoId: string) => {
    const usadas = docs.find((d) => d.tipoDocumentoId === tipoDocumentoId)?.reprovacoes ?? 0;
    const noTime = usadas >= TETO_REPROVACOES_POR_PENDENCIA;
    return {
      teto: TETO_REPROVACOES_POR_PENDENCIA,
      usadas,
      restantes: Math.max(0, TETO_REPROVACOES_POR_PENDENCIA - usadas),
      noTime,
      aviso: noTime ? AVISO_PENDENCIA_NO_TIME : null,
    };
  };
  return {
    situacaoParaATela: async (_a: string, t: string) => daPendencia(t),
    situacoesParaATela: vi.fn(async (_a: string) => new Map<string, unknown>()),
    situacaoDe: (_m: unknown, t: string) => daPendencia(t),
    cabeOutroArquivoNaPendencia: async (_a: string, t: string) =>
      !(docs.find((d) => d.tipoDocumentoId === t)?.envioEmAberto ?? false),
  } as never;
}

function servico(docs: LinhaDoc[]) {
  const b = banco(docs);
  const trilhaLog = { registrar: vi.fn(async () => {}), configurada: () => true } as never;
  return new PortalDocumentosService(
    b.db,
    credenciais(docs),
    trilhaLog,
    new PortalLinkVivoService(b.db, trilhaLog),
  );
}

const primeiroPasso = async (linha: LinhaDoc) => {
  const { passos } = await servico([linha]).trilha(SINTETICO.admissaoId);
  return passos[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// A CAMADA: o backend emite a data ISO CRUA (o AJUSTE 1 foi para o frontend)
// ─────────────────────────────────────────────────────────────────────────────
describe("a projeção NÃO formata a data: o campo lido sai ISO cru, byte a byte", () => {
  it("uma data ISO chega à tela exatamente como veio da IA, sem virar DD/MM/AAAA", async () => {
    const passo = await primeiroPasso(
      doc({ codigo: "RG", estadoDocumento: "AGUARDANDO_AUDITORIA", conferenciaCampos: [campo("2015-03-14")] }),
    );
    expect(passo.conferencia?.campos[0].valor).toBe("2015-03-14");
    expect(passo.conferencia?.campos[0].valor).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("nenhum valor da projeção sai no formato brasileiro (a formatação é do frontend)", async () => {
    const { passos } = await servico([
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        conferenciaCampos: [
          campo("2015-03-14", { campo: "rgDataEmissao", rotulo: "Data de emissao do RG" }),
          campo("2001/01/05", { campo: "cnhDataValidade", rotulo: "Validade da CNH" }),
        ],
      }),
    ]).trilha(SINTETICO.admissaoId);
    for (const c of passos[0].conferencia?.campos ?? []) {
      expect(c.valor, `${c.campo} nao pode sair em BR pelo backend`).not.toMatch(
        /^\d{2}\/\d{2}\/\d{4}$/,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTE 2: o estado AGUARDANDO_VALIDACAO e a precedência
// ─────────────────────────────────────────────────────────────────────────────
describe("AJUSTE 2: AGUARDANDO_VALIDACAO quando a IA leu e o candidato não confirmou", () => {
  it("conferência pronta a confirmar (veredito nulo, campos > 0, não confirmado) vira AGUARDANDO_VALIDACAO", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        conferenciaVeredito: null,
        conferenciaConfirmadoEm: null,
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("AGUARDANDO_VALIDACAO");
    expect(passo.conferencia?.aguardandoConfirmacao).toBe(true);
  });

  it("veredito EXPLICITAMENTE válido também é AGUARDANDO_VALIDACAO", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        conferenciaVeredito: APROVADO,
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("AGUARDANDO_VALIDACAO");
    // Veredito aprovado NÃO viaja (só o reprovado, para a tela mostrar em "ajustar").
    expect(passo.conferencia?.veredito).toBeNull();
  });

  it("envio chegou mas SEM leitura pronta (sem conferência) continua EM_ANALISE", async () => {
    const passo = await primeiroPasso(doc({ codigo: "RG", estadoDocumento: "AGUARDANDO_AUDITORIA" }));
    expect(passo.estado).toBe("EM_ANALISE");
    expect(passo.conferencia).toBeNull();
  });

  it("conferência existe mas SEM campos lidos ainda continua EM_ANALISE", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        conferenciaVeredito: null,
        conferenciaCampos: [],
      }),
    );
    expect(passo.estado).toBe("EM_ANALISE");
    expect(passo.conferencia?.aguardandoConfirmacao).toBe(false);
  });

  it("documento ENTREGUE é ACEITO, mesmo com conferência pronta: o novo estado não rouba o aceito", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "ENTREGUE",
        conferenciaVeredito: null,
        conferenciaConfirmadoEm: new Date(),
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("ACEITO");
  });

  it("veredito REPROVADO com tentativa sobrando é AJUSTAR, não AGUARDANDO_VALIDACAO", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        reprovacoes: 1,
        conferenciaVeredito: REPROVADO,
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("AJUSTAR");
    expect(passo.conferencia?.veredito).toEqual(REPROVADO);
  });

  it("teto atingido é NO_TIME, mesmo com conferência pronta", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
        conferenciaVeredito: null,
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("NO_TIME");
  });
});

describe("AJUSTE 2: PRECEDÊNCIA ACEITO > NO_TIME > AJUSTAR > AGUARDANDO_VALIDACAO > EM_ANALISE > PENDENTE", () => {
  it("ACEITO vence NO_TIME: ENTREGUE com teto estourado ainda é ACEITO", async () => {
    const passo = await primeiroPasso(
      doc({ codigo: "RG", estadoDocumento: "ENTREGUE", reprovacoes: TETO_REPROVACOES_POR_PENDENCIA }),
    );
    expect(passo.estado).toBe("ACEITO");
  });

  it("ACEITO vence AGUARDANDO_VALIDACAO: ENTREGUE com conferência pronta é ACEITO", async () => {
    const passo = await primeiroPasso(
      doc({ codigo: "RG", estadoDocumento: "ENTREGUE", conferenciaCampos: [campo("2015-03-14")] }),
    );
    expect(passo.estado).toBe("ACEITO");
  });

  it("NO_TIME vence AGUARDANDO_VALIDACAO: teto estourado com conferência pronta é NO_TIME", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        reprovacoes: TETO_REPROVACOES_POR_PENDENCIA,
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("NO_TIME");
  });

  it("AGUARDANDO_VALIDACAO vence EM_ANALISE: a casa que sozinha seria EM_ANALISE sobe para o novo estado", async () => {
    // AGUARDANDO_AUDITORIA sozinho vira EM_ANALISE; com a conferência pronta, o candidato é quem falta.
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "AGUARDANDO_AUDITORIA",
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("AGUARDANDO_VALIDACAO");
  });

  it("AGUARDANDO_VALIDACAO vence o 'não cabe outro arquivo' (que sozinho daria EM_ANALISE)", async () => {
    const passo = await primeiroPasso(
      doc({
        codigo: "RG",
        estadoDocumento: "PENDENTE",
        envioEmAberto: true,
        conferenciaCampos: [campo("2015-03-14")],
      }),
    );
    expect(passo.estado).toBe("AGUARDANDO_VALIDACAO");
  });

  it("EM_ANALISE vence PENDENTE: envio em aberto sem leitura pronta é EM_ANALISE", async () => {
    const passo = await primeiroPasso(doc({ codigo: "RG", estadoDocumento: "PENDENTE", envioEmAberto: true }));
    expect(passo.estado).toBe("EM_ANALISE");
  });

  it("PENDENTE puro continua PENDENTE: nada enviado, nada lido", async () => {
    const passo = await primeiroPasso(doc({ codigo: "RG", estadoDocumento: "PENDENTE" }));
    expect(passo.estado).toBe("PENDENTE");
  });

  it("todo estado devolvido pertence ao contrato de seis, nenhum inventado", async () => {
    const { passos } = await servico([
      doc({ codigo: "RG", estadoDocumento: "ENTREGUE" }),
      doc({ codigo: "CPF", estadoDocumento: "AGUARDANDO_AUDITORIA", conferenciaCampos: [campo("2015-03-14")] }),
      doc({ codigo: "CTPS", estadoDocumento: "PENDENTE" }),
    ]).trilha(SINTETICO.admissaoId);
    for (const p of passos) {
      expect(["ACEITO", "EM_ANALISE", "AGUARDANDO_VALIDACAO", "AJUSTAR", "NO_TIME", "PENDENTE"]).toContain(
        p.estado,
      );
    }
  });
});
