import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { VtColetaService } from "./vt-coleta.service";

/**
 * A COLETA GRAVA O LINK DO ARQUIVO NO DRIVE (`vt_coleta.drive_url`).
 *
 * O QUE ISTO RESOLVE: o formulário era arquivado e o EA não guardava ONDE. O único rastro era
 * "arquivado em tal hora", sem o "aqui", e quem precisava do documento caçava pasta a pasta no
 * Drive. Com a URL gravada, a tela de Benefícios abre o formulário no botão.
 *
 * É O LINK DO ARQUIVO, NÃO O DA PASTA. O arquivamento sempre devolveu `pastaUrl`, e ele não serve:
 * levaria à pasta do funcionário, onde ainda seria preciso achar o arquivo entre os outros.
 *
 * O CASO QUE MAIS IMPORTA É O SEGUNDO TESTE. O scheduler varre o bucket em ciclo, então o MESMO
 * arquivo é reprocessado. Na segunda passada o conteúdo já está no destino, nada sobe, e o
 * arquivamento não devolve id nenhum. Se a coleta regravasse `null` ali, o link gravado na primeira
 * passada seria apagado e o botão da tela morreria sozinho, sem ninguém mexer em nada.
 */

const BUCKET = "bucket-vt";
const URL_ESPERADA = "https://drive.google.com/file/d/arq-777/view";

function montar(arquivosIds: string[] | undefined) {
  const ai = {
    listarColetaVt: vi.fn().mockResolvedValue({ arquivos: [] }),
    baixarColetaVt: vi.fn().mockResolvedValue({ stagingPath: "/staging/x.pdf" }),
    arquivarDrive: vi.fn().mockResolvedValue({
      pastaUrl: "https://drive.google.com/drive/folders/pasta-do-funcionario",
      arquivados: 1,
      ...(arquivosIds === undefined ? {} : { arquivosIds }),
    }),
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
    // Serviço de SOLICITAÇÃO: duplo mínimo. Fechar o pedido é trilha, não a entrega, então o que
    // importa nestes testes é que a gravação do formulário não dependa dele para acontecer.
    { marcarRespondida: vi.fn().mockResolvedValue(undefined) } as never,
  );
  const upsertLedger = vi.spyOn(svc, "upsertLedger").mockResolvedValue(undefined);
  vi.spyOn(svc as never, "carregarTipoVt" as never).mockResolvedValue({
    id: "vt-tipo",
    nome: "Formulario de VT",
  } as never);
  vi.spyOn(svc as never, "vtEstaNaRegua" as never).mockResolvedValue(false as never);
  return { svc, upsertLedger };
}

const ADMISSAO = {
  id: "adm-1",
  tipoContrato: "Temporário",
  codCliente: "57269",
  candidatoNome: "Fulano De Tal",
  clienteOperacao: "CIA DAS LETRAS",
  cargoId: "cargo-1",
};

describe("coleta de VT, link do arquivo no Drive", () => {
  it("arquivou agora: grava a URL montada a partir do id que o arquivamento devolveu", async () => {
    const { svc, upsertLedger } = montar(["arq-777"]);

    await svc.processarMatch({ id: "obj-1", md5: "md5-1" } as never, ADMISSAO as never);

    expect(upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", driveUrl: URL_ESPERADA }),
    );
  });

  it("nada subiu (conteúdo já no destino): NÃO manda URL, para não apagar a que já está gravada", async () => {
    const { svc, upsertLedger } = montar([]);

    await svc.processarMatch({ id: "obj-1", md5: "md5-1" } as never, ADMISSAO as never);

    const dados = upsertLedger.mock.calls[0][1] as { driveUrl?: string };
    // `undefined`, e não `null`: é essa distinção que o upsert usa para PRESERVAR o link anterior.
    expect(dados.driveUrl).toBeUndefined();
  });

  it("arquivamento antigo, sem o campo na resposta: também preserva em vez de apagar", async () => {
    const { svc, upsertLedger } = montar(undefined);

    await svc.processarMatch({ id: "obj-1", md5: "md5-1" } as never, ADMISSAO as never);

    const dados = upsertLedger.mock.calls[0][1] as { driveUrl?: string };
    expect(dados.driveUrl).toBeUndefined();
  });
});
