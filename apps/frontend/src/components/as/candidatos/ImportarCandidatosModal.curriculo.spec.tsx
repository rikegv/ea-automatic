// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PreviaImportCandidato,
  PreviaImportCurriculo,
  ResultadoImportCurriculo,
} from "@ea/shared-types";

/**
 * ─ O RAMO DE CURRÍCULO do mesmo modal de importação ─────────────────────────────────────────────
 *
 * A fonte "Currículo (PDF ou Word)" vive ao lado da planilha, no MESMO modal e no MESMO trilho de
 * cinco passos. O que estes testes travam, e que só existe dentro do JSX:
 *
 *  1. A ESCOLHA DA FONTE NÃO QUEBRA A PLANILHA: escolher "Planilha" segue pelo caminho histórico
 *     (previa tabular, passo de de/para), byte a byte.
 *  2. A REVISÃO DE VALOR: um currículo = uma linha editável; o lote todo numa tabela.
 *  3. O EDITOR DE N TELEFONES: adicionar e remover.
 *  4. ERRO DE LEITURA de um arquivo NÃO trava a linha: ela segue editável para digitar na mão.
 *  5. O APLICAR manda os candidatos EDITADOS (JSON) para a rota de currículo.
 *
 * As chamadas de API são mockadas: `apiUpload` (prévia, multipart) e `apiFetch` (aplicar, JSON).
 */

const { apiUpload, apiFetch } = vi.hoisted(() => ({ apiUpload: vi.fn(), apiFetch: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiUpload, apiFetch };
});

import { ImportarCandidatosModal } from "./ImportarCandidatosModal";

const PREVIA_PLANILHA: PreviaImportCandidato = {
  cabecalho: ["Nome", "CPF"],
  amostra: [["Fulano De Tal", "111"]],
  totalLinhas: 1,
  sugestao: {
    mapa: {
      nome: 0,
      cpf: 1,
      email: null,
      telefone: null,
      nascimento: null,
      cidade: null,
      uf: null,
    },
    confianca: "ALTA",
    observacao: "",
  },
  abaUsada: "Planilha1",
  abasDisponiveis: ["Planilha1"],
  linhaCabecalho: 1,
  descartadasPorTeto: 0,
  assinaturaCabecalho: "assinatura-da-aba-conferida",
};

const PREVIA_CURRICULO: PreviaImportCurriculo = {
  itens: [
    {
      indice: 0,
      arquivo: "curriculo-ana.pdf",
      candidato: {
        nome: "Ana Sintetica",
        cpf: "",
        email: "ana@homolog.test",
        telefones: ["11999990000"],
        nascimento: "",
        cidade: "São Paulo",
        uf: "SP",
      },
      confianca: { cpf: "BAIXA" },
    },
    {
      indice: 1,
      arquivo: "curriculo-bruno.docx",
      candidato: {
        nome: "",
        cpf: "",
        email: "",
        telefones: [],
        nascimento: "",
        cidade: "",
        uf: "",
      },
      confianca: {},
      erroLeitura: "Arquivo não pôde ser lido.",
    },
  ],
};

const RESULTADO_CURRICULO: ResultadoImportCurriculo = {
  contagem: { total: 2, novos: 2, duplicadosCpf: 0, semCpf: 0, invalidos: 0 },
  importados: 2,
  reaproveitados: 0,
  vinculados: 0,
  ignorados: 0,
  linhas: [{ indice: 0, nome: "Ana Editada", status: "IMPORTADO" }],
};

const FILE_ANA = new File(["pdf"], "curriculo-ana.pdf", { type: "application/pdf" });
const FILE_BRUNO = new File(["docx"], "curriculo-bruno.docx", {
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  render(
    <ImportarCandidatosModal
      vagasAbertas={[]}
      token="tok"
      onClose={() => {}}
      onImportado={() => {}}
    />,
  );
}

/** Escolhe a fonte Currículo + cenário Sem Vaga, avança e devolve o input de arquivo do lote. */
function abrirNoUploadCurriculo() {
  renderModal();
  fireEvent.click(screen.getByRole("button", { name: /Currículo/ }));
  fireEvent.click(screen.getByRole("button", { name: /Sem Vaga/ }));
  fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
  return screen.getByLabelText("Currículos em PDF ou Word") as HTMLInputElement;
}

describe("ImportarCandidatosModal, a escolha da fonte", () => {
  it("mantém o caminho da planilha intacto quando a fonte é Planilha", async () => {
    apiUpload.mockResolvedValueOnce(PREVIA_PLANILHA);

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^Planilha/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sem Vaga/ }));
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));

    // É o input de planilha (não o de currículo) e a leitura chama a rota histórica.
    const input = screen.getByLabelText("Planilha de candidatos") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["nome;cpf"], "base.csv", { type: "text/csv" })] },
    });

    await screen.findByText("Colunas Da Planilha");
    expect(apiUpload).toHaveBeenCalledWith(
      "/as/candidatos/importar/previa",
      expect.any(FormData),
      "tok",
    );
  });
});

describe("ImportarCandidatosModal, a revisão de currículo", () => {
  it("renderiza uma linha editável por currículo do lote", async () => {
    apiUpload.mockResolvedValueOnce(PREVIA_CURRICULO);

    const input = abrirNoUploadCurriculo();
    fireEvent.change(input, { target: { files: [FILE_ANA, FILE_BRUNO] } });

    await screen.findByLabelText("Nome do currículo curriculo-ana.pdf");

    // Um campo de nome por arquivo, pré-preenchido com o que a IA leu.
    const nomeAna = screen.getByLabelText(
      "Nome do currículo curriculo-ana.pdf",
    ) as HTMLInputElement;
    const nomeBruno = screen.getByLabelText(
      "Nome do currículo curriculo-bruno.docx",
    ) as HTMLInputElement;
    expect(nomeAna.value).toBe("Ana Sintetica");
    expect(nomeBruno.value).toBe("");
    expect(screen.getByText("curriculo-ana.pdf")).toBeTruthy();
    expect(screen.getByText("curriculo-bruno.docx")).toBeTruthy();

    // O lote foi ao backend como multipart, um `files` por arquivo.
    expect(apiUpload).toHaveBeenCalledWith(
      "/as/candidatos/importar-curriculo/previa",
      expect.any(FormData),
      "tok",
    );
    const form = apiUpload.mock.calls[0][1] as FormData;
    expect(form.getAll("files")).toHaveLength(2);
  });

  it("adiciona e remove telefones do editor de N telefones", async () => {
    apiUpload.mockResolvedValueOnce(PREVIA_CURRICULO);

    const input = abrirNoUploadCurriculo();
    fireEvent.change(input, { target: { files: [FILE_ANA, FILE_BRUNO] } });
    await screen.findByLabelText("Nome do currículo curriculo-ana.pdf");

    // Ana começa com um telefone; adicionar cria o segundo campo.
    expect(screen.getByLabelText("Telefone 1")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar telefone" })[0]);
    expect(screen.getByLabelText("Telefone 2")).toBeTruthy();

    // Remover o segundo tira o campo de novo.
    fireEvent.click(screen.getByRole("button", { name: "Remover telefone 2" }));
    expect(screen.queryByLabelText("Telefone 2")).toBeNull();
  });

  it("mantém a linha com erro de leitura editável", async () => {
    apiUpload.mockResolvedValueOnce(PREVIA_CURRICULO);

    const input = abrirNoUploadCurriculo();
    fireEvent.change(input, { target: { files: [FILE_ANA, FILE_BRUNO] } });
    await screen.findByLabelText("Nome do currículo curriculo-ana.pdf");

    // O aviso aparece, e o campo da linha com erro aceita digitação na mão.
    expect(screen.getByText("Arquivo não pôde ser lido.")).toBeTruthy();
    const nomeBruno = screen.getByLabelText(
      "Nome do currículo curriculo-bruno.docx",
    ) as HTMLInputElement;
    fireEvent.change(nomeBruno, { target: { value: "Bruno Sintetico" } });
    expect(nomeBruno.value).toBe("Bruno Sintetico");
  });
});

describe("ImportarCandidatosModal, o aplicar do currículo", () => {
  it("manda os candidatos editados em JSON para a rota de currículo", async () => {
    apiUpload.mockResolvedValueOnce(PREVIA_CURRICULO);
    apiFetch.mockResolvedValueOnce(RESULTADO_CURRICULO);

    const input = abrirNoUploadCurriculo();
    fireEvent.change(input, { target: { files: [FILE_ANA, FILE_BRUNO] } });
    await screen.findByLabelText("Nome do currículo curriculo-ana.pdf");

    // Edita o nome da Ana antes de gravar.
    fireEvent.change(screen.getByLabelText("Nome do currículo curriculo-ana.pdf"), {
      target: { value: "Ana Editada" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Avançar" })); // → confirmação
    fireEvent.click(screen.getByRole("button", { name: /^Importar/ })); // → aplicar

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [rota, opts] = apiFetch.mock.calls[0] as [
      string,
      {
        method: string;
        body: { cenario: string; candidatos: { nome: string; telefones: string[] }[] };
      },
    ];
    expect(rota).toBe("/as/candidatos/importar-curriculo/aplicar");
    expect(opts.method).toBe("POST");
    expect(opts.body.cenario).toBe("SEM_VAGA");
    // O valor EDITADO vai no corpo, com os telefones limpos (sem vazios).
    expect(opts.body.candidatos[0].nome).toBe("Ana Editada");
    expect(opts.body.candidatos[0].telefones).toEqual(["11999990000"]);

    await screen.findByText("Importados");
  });
});
