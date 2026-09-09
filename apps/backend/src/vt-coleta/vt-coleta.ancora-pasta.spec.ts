import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemColetaVt } from "../ai/ai-client.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { VtColetaService } from "./vt-coleta.service";

/**
 * A COLETA DE VT ARQUIVA COM ÂNCORA, e não pela busca por nome.
 *
 * O QUE ESTA SUITE PROTEGE (condicao travante da auditoria de seguranca, item 1 da OST). A coleta era
 * o UNICO dos quatro chamadores de `arquivarDrive` que nao passava `pastaId`: ela achava a pasta do
 * prontuario so pela BUSCA POR NOME, montada com o nome do candidato e a operacao do cliente. Enquanto
 * o Fopag nunca arquivava, isso quase nao aparecia; destravado o Fopag, a coleta passa a arquivar em
 * admissoes que JA TEM pasta (8 dos 14 arquivos parados, em 4 das 6 admissoes), e ai uma correcao do
 * nome do candidato ou uma edicao de `nome_operacao` faria nascer uma SEGUNDA pasta para a mesma
 * pessoa. Com o link ja gravado em maos, o arquivamento vai direto no destino e nao procura nada.
 *
 * A PRECEDENCIA E A MESMA DA AUDITORIA: o link do prontuario primeiro, o do ASO como segunda ancora,
 * e nada quando nenhum dos dois e um id plausivel (ai a busca por nome volta a ser o caminho, que e
 * exatamente o que se quer para quem ainda nao tem pasta).
 *
 * §A.6: o id de pasta do Drive e referencia, nao e PII, e nenhuma URL externa e logada aqui.
 */

const BUCKET = "bucket-vt";
/** CPF sintetico valido (nao pertence a ninguem). */
const CPF = "52998224725";

const ID_PRONTUARIO = "1PastaDoProntuarioDoCandidato";
const ID_ASO = "1PastaUsadaPeloAsoDoCandidato";

function item(): ItemColetaVt {
  return { id: "obj-1", md5: "md5-1", mimeType: "application/pdf", cpf: CPF, ehPdf: true };
}

function admissao(over: Record<string, unknown> = {}) {
  return {
    id: "adm-1",
    codCliente: "57269",
    cargoId: "cargo-1",
    tipoContrato: "Temporário",
    candidatoNome: "Fulano De Tal",
    clienteOperacao: "Operacao X",
    farolGlobal: "EM_ADMISSAO",
    drivePastaUrl: null,
    driveAsoUrl: null,
    ...over,
  };
}

/** Duplo do `DrivePastaPaiService`: delega ao fallback puro (o roteamento nao e o tema desta suite). */
const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

function montar() {
  const ai = {
    listarColetaVt: vi.fn().mockResolvedValue({ arquivos: [] }),
    baixarColetaVt: vi.fn().mockResolvedValue({ stagingPath: "/staging/x.pdf" }),
    arquivarDrive: vi
      .fn()
      .mockResolvedValue({ pastaUrl: "https://drive/u", arquivados: 1, arquivosIds: ["arq-1"] }),
    dadosColetaVt: vi.fn().mockResolvedValue({ encontrado: false, dados: null }),
  };
  const svc = new VtColetaService(
    {} as never,
    { get: (k: string) => (k === "VT_COLETA_GCS_BUCKET" ? BUCKET : undefined) } as never,
    ai as never,
    { aplicarPosVeredito: vi.fn().mockResolvedValue({}) } as never,
    {
      estaLigado: vi.fn().mockResolvedValue(true),
      marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
      registrarCiclo: vi.fn().mockResolvedValue(undefined),
    } as never,
    { marcarRespondida: vi.fn().mockResolvedValue(undefined) } as never,
    drivePastaPaiFake as never,
  );
  vi.spyOn(svc, "carregarTipoVt").mockResolvedValue({ id: "vt-tipo", nome: "Formulario de VT" });
  vi.spyOn(svc, "vtEstaNaRegua").mockResolvedValue(false);
  vi.spyOn(svc, "upsertLedger").mockResolvedValue(undefined);
  return { svc, ai };
}

/** O payload que a coleta entregou ao arquivamento. */
function payload(ai: { arquivarDrive: { mock: { calls: unknown[][] } } }) {
  return ai.arquivarDrive.mock.calls[0]?.[0] as { pastaId?: unknown; parentFolderId?: unknown };
}

afterEach(() => vi.restoreAllMocks());

describe("a coleta ancora o arquivamento na pasta ja gravada", () => {
  it("com o link do prontuario, manda o `pastaId` e nao depende mais da busca por nome", async () => {
    const { svc, ai } = montar();

    await svc.processarMatch(
      item(),
      admissao({ drivePastaUrl: `https://drive.google.com/drive/folders/${ID_PRONTUARIO}` }) as never,
    );

    expect(payload(ai).pastaId).toBe(ID_PRONTUARIO);
  });

  it("sem o prontuario, cai no link do ASO (a mesma precedencia da Auditoria)", async () => {
    const { svc, ai } = montar();

    await svc.processarMatch(
      item(),
      admissao({ driveAsoUrl: `https://drive.google.com/drive/folders/${ID_ASO}` }) as never,
    );

    expect(payload(ai).pastaId).toBe(ID_ASO);
  });

  it("o prontuario VENCE o ASO quando os dois estao gravados", async () => {
    const { svc, ai } = montar();

    await svc.processarMatch(
      item(),
      admissao({
        drivePastaUrl: `https://drive.google.com/drive/folders/${ID_PRONTUARIO}`,
        driveAsoUrl: `https://drive.google.com/drive/folders/${ID_ASO}`,
      }) as never,
    );

    expect(payload(ai).pastaId).toBe(ID_PRONTUARIO);
  });

  it("sem nenhum link, o payload NAO leva `pastaId` (a busca por nome segue valendo para quem nao tem pasta)", async () => {
    const { svc, ai } = montar();

    await svc.processarMatch(item(), admissao() as never);

    expect(payload(ai)).not.toHaveProperty("pastaId");
    expect(payload(ai).parentFolderId).toBeTruthy();
  });

  it("link ilegivel nao vira ancora inventada: volta ao caminho sem `pastaId`", async () => {
    // Um id CRU continua sendo aceito de proposito (o diretor cola id na acao do Diagnostico). O que
    // nao pode virar ancora e o texto que nao tem forma de id: ali o certo e a busca por nome.
    const { svc, ai } = montar();

    await svc.processarMatch(item(), admissao({ drivePastaUrl: "isto nao e uma pasta" }) as never);

    expect(payload(ai)).not.toHaveProperty("pastaId");
  });
});
