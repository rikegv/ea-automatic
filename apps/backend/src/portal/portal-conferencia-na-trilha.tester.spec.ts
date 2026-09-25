import { describe, expect, it, vi } from "vitest";
import type { EstadoPassoPortal } from "@ea/shared-types";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";
import {
  TETO_REPROVACOES_POR_PENDENCIA,
  AVISO_PENDENCIA_NO_TIME,
} from "../domain/portal-tentativas";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), do REQUISITO, em paralelo a construcao. NAO escrevi o codigo.
 *
 * O QUE ESTE ARQUIVO PROVA, pelo lado da LEITURA da trilha (o que a tela reconstroi ao recarregar):
 *  - REQ 1: um documento REPROVADO no Portal (`veredito.valido=false`) com tentativa restante sai
 *    como AJUSTAR, e NAO EM_ANALISE. E o rosto duravel do bug (reprovado ficava preso em "em
 *    analise" e a casa de "substituir" nunca reabria).
 *  - REQ 2 (round-trip): a conferencia persistida volta em `passo.conferencia` com os campos lidos
 *    e o veredito, para a tela reconstruir "conferir" / "ajustar" / "aceito" sem estado React.
 *  - REQ 7 (leitura): a trilha devolve `termoAceito` conforme `portal_termo_aceite`.
 *
 * §A.6: fixtures sinteticos, nada pertence a ninguem.
 */

const ADM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FRASE_VENCIDO = "Este documento está fora da validade. Envie um documento atualizado.";

interface LinhaDoc {
  tipoDocumentoId: string;
  codigo: string;
  nome: string;
  estadoDocumento: string;
  exigencia: string | null;
  clienteVinculoId: string | null;
  dica: string | null;
  reprovacoes: number;
  conferenciaId: string | null;
  conferenciaCampos: unknown;
  conferenciaVeredito: unknown;
  conferenciaConfirmadoEm: Date | null;
}

interface Cenario {
  docs: LinhaDoc[];
  termoAceito?: boolean;
}

const LINK_VIVO = () => ({
  expiraEm: new Date(Date.now() + 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
});

function banco(cenario: Cenario) {
  const cabecalho = [
    {
      primeiroNome: "Candidata",
      cargo: "Auxiliar",
      cliente: "Operacao Sintetica",
      codCliente: "C9999",
      cargoId: "cargo-1",
    },
  ];

  const linhasPara = (proj: Record<string, unknown> | undefined): unknown[] => {
    const chaves = Object.keys(proj ?? {}).join(",").toLowerCase();
    if (chaves.length === 0) return []; // dadosGiConfirmados: select() sem projecao -> vazio
    if (chaves.includes("suspensoate")) return [LINK_VIVO()];
    if (chaves.includes("primeironome")) return cabecalho;
    if (chaves.includes("tipodocumentoid")) return cenario.docs;
    if (chaves === "id") return cenario.termoAceito ? [{ id: "termo-1" }] : []; // termoAceito
    return [];
  };

  const cadeia = (linhas: unknown[]): any =>
    new Proxy(
      {},
      {
        get(_a, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
              Promise.resolve(linhas).then(ok, err);
          }
          return () => cadeia(linhas);
        },
      },
    );

  return { select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)) } as never;
}

function credenciais(docs: LinhaDoc[]) {
  const situacaoDe = (_mapa: unknown, tipoDocumentoId: string) => {
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
    situacoesParaATela: vi.fn(async () => new Map<string, unknown>()),
    situacaoDe,
    // Nao ha envio "em aberto": para o REPROVADO, quem manda a casa para AJUSTAR e o sinal
    // `reprovadoNoPortal`, nao esta regua. Retorno true garante que nao e ela que decide.
    cabeOutroArquivoNaPendencia: vi.fn(async () => true),
  } as never;
}

function servico(cenario: Cenario) {
  const db = banco(cenario);
  const trilhaLog = { registrar: vi.fn(async () => {}), configurada: () => true } as never;
  return new PortalDocumentosService(
    db,
    credenciais(cenario.docs),
    trilhaLog,
    new PortalLinkVivoService(db, trilhaLog),
  );
}

function doc(over: Partial<LinhaDoc> & { codigo: string }): LinhaDoc {
  return {
    tipoDocumentoId: over.tipoDocumentoId ?? `tipo-${over.codigo}`,
    codigo: over.codigo,
    nome: over.nome ?? over.codigo,
    estadoDocumento: over.estadoDocumento ?? "AGUARDANDO_AUDITORIA",
    exigencia: over.exigencia === undefined ? "OBRIGATORIO" : over.exigencia,
    clienteVinculoId: over.clienteVinculoId ?? null,
    dica: over.dica ?? null,
    reprovacoes: over.reprovacoes ?? 0,
    conferenciaId: over.conferenciaId ?? null,
    conferenciaCampos: over.conferenciaCampos ?? null,
    conferenciaVeredito: over.conferenciaVeredito ?? null,
    conferenciaConfirmadoEm: over.conferenciaConfirmadoEm ?? null,
  };
}

const vereditoReprovado = {
  status: "INCONFORME",
  valido: false,
  codigo: "VENCIDO",
  mensagem: FRASE_VENCIDO,
};

const camposLidos = [
  { campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confianca: 0.95, lido: true },
];

const estadoDe = (passos: { codigoTipoDocumento: string; estado: EstadoPassoPortal }[], cod: string) =>
  passos.find((p) => p.codigoTipoDocumento === cod)!.estado;

describe("REQ 1: reprovado no Portal com tentativa restante aparece como AJUSTAR", () => {
  it("um documento em AGUARDANDO_AUDITORIA reprovado pela IA e restante>0 sai AJUSTAR, nao EM_ANALISE", async () => {
    const svc = servico({
      docs: [
        doc({
          codigo: "RG",
          estadoDocumento: "AGUARDANDO_AUDITORIA",
          reprovacoes: 1, // restantes = 2 > 0
          conferenciaId: "conf-1",
          conferenciaCampos: camposLidos,
          conferenciaVeredito: vereditoReprovado,
          conferenciaConfirmadoEm: null,
        }),
      ],
    });

    const trilha = await svc.trilha(ADM);
    expect(estadoDe(trilha.passos, "RG")).toBe("AJUSTAR");
  });

  it("sem conferencia reprovada, o mesmo documento continua EM_ANALISE (regressao do fix)", async () => {
    const svc = servico({
      docs: [doc({ codigo: "RG", estadoDocumento: "AGUARDANDO_AUDITORIA", reprovacoes: 0 })],
    });
    const trilha = await svc.trilha(ADM);
    expect(estadoDe(trilha.passos, "RG")).toBe("EM_ANALISE");
  });

  it("reprovado mas SEM tentativa (teto batido -> noTime) nao vira AJUSTAR, vira NO_TIME", async () => {
    const svc = servico({
      docs: [
        doc({
          codigo: "RG",
          estadoDocumento: "AGUARDANDO_AUDITORIA",
          reprovacoes: TETO_REPROVACOES_POR_PENDENCIA, // restantes = 0
          conferenciaId: "conf-1",
          conferenciaVeredito: vereditoReprovado,
          conferenciaCampos: camposLidos,
        }),
      ],
    });
    const trilha = await svc.trilha(ADM);
    expect(estadoDe(trilha.passos, "RG")).toBe("NO_TIME");
  });
});

describe("REQ 2: a conferencia persistida volta pela trilha (round-trip, sem estado React)", () => {
  it("passo reprovado devolve conferencia com os campos lidos e o veredito redigido", async () => {
    const svc = servico({
      docs: [
        doc({
          codigo: "RG",
          reprovacoes: 1,
          conferenciaId: "conf-1",
          conferenciaCampos: camposLidos,
          conferenciaVeredito: vereditoReprovado,
        }),
      ],
    });
    const trilha = await svc.trilha(ADM);
    const passo = trilha.passos.find((p) => p.codigoTipoDocumento === "RG")!;
    expect(passo.conferencia).not.toBeNull();
    expect(passo.conferencia!.campos).toEqual(camposLidos);
    expect(passo.conferencia!.veredito).toEqual(vereditoReprovado);
    expect(passo.conferencia!.veredito!.mensagem).toBe(FRASE_VENCIDO);
  });

  it("passo aprovado nao confirmado devolve conferencia aguardandoConfirmacao, veredito null", async () => {
    const svc = servico({
      docs: [
        doc({
          codigo: "CPF",
          reprovacoes: 0,
          conferenciaId: "conf-2",
          conferenciaCampos: camposLidos,
          conferenciaVeredito: { status: "VALIDADO", valido: true, codigo: "ACEITO", mensagem: "ok" },
          conferenciaConfirmadoEm: null,
        }),
      ],
    });
    const trilha = await svc.trilha(ADM);
    const passo = trilha.passos.find((p) => p.codigoTipoDocumento === "CPF")!;
    expect(passo.conferencia).not.toBeNull();
    expect(passo.conferencia!.aguardandoConfirmacao).toBe(true);
    expect(passo.conferencia!.veredito).toBeNull();
  });

  it("documento sem envio julgado nao tem conferencia (null)", async () => {
    const svc = servico({ docs: [doc({ codigo: "PIS" })] });
    const trilha = await svc.trilha(ADM);
    expect(trilha.passos.find((p) => p.codigoTipoDocumento === "PIS")!.conferencia).toBeNull();
  });
});

describe("REQ 7 (leitura): a trilha devolve termoAceito conforme portal_termo_aceite", () => {
  it("com linha de aceite, termoAceito = true", async () => {
    const svc = servico({ docs: [doc({ codigo: "RG" })], termoAceito: true });
    expect((await svc.trilha(ADM)).termoAceito).toBe(true);
  });

  it("sem linha de aceite, termoAceito = false (o termo reaparece de proposito)", async () => {
    const svc = servico({ docs: [doc({ codigo: "RG" })], termoAceito: false });
    expect((await svc.trilha(ADM)).termoAceito).toBe(false);
  });
});
