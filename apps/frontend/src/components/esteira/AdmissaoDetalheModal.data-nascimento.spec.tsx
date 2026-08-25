// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DATA DE NASCIMENTO NA FICHA: o dia exibido é o dia GUARDADO, em qualquer fuso.
 *
 * O BUG QUE ESTE ARQUIVO TRANCA. A ficha formatava a data de nascimento com `new Date(d)`, que
 * parseia "1995-05-31" como MEIA-NOITE UTC. Exibido em UTC-3 (Brasil), isso volta um dia e vira
 * "30/05/1995". A tela de EDIÇÃO (lápis) sempre mostrou a string crua, então a MESMA pessoa
 * aparecia com duas datas de nascimento diferentes conforme a tela que se abrisse.
 *
 * POR QUE ISSO ERA CARO, e não um detalhe cosmético: o formulário de VT identifica o candidato por
 * CPF + data de nascimento e compara STRING com STRING no backend. Uma ficha que mostra um dia a
 * menos faz o RH ditar o dia errado e o candidato tomar "Dados não encontrados" sem que nada no
 * sistema pareça quebrado. O dado no banco sempre esteve certo; quem mentia era a ficha.
 *
 * O FUSO É FIXADO DE PROPÓSITO. Em UTC o código velho passaria (offset zero não desloca nada), e o
 * teste daria a falsa impressão de cobrir o caso. Fixando America/Sao_Paulo, este arquivo falha
 * contra o código velho e passa contra o novo, que formata por partes e ignora fuso.
 */

const NASCIMENTO = "1995-05-31";

const detalhe = {
  admissaoId: "adm-1",
  recebidoEm: "2026-08-01T12:00:00.000Z",
  dataAdmissao: "2026-08-17",
  tipoContrato: "Temporário",
  farolGlobal: "EM_ADMISSAO",
  motivoDeclinio: null,
  origem: "MANUAL",
  sinalizador: "OK",
  drivePastaUrl: null,
  driveAsoUrl: null,
  clicksignStatus: "SEM_ENVELOPE",
  temEnvelope: false,
  contratoAssinadoDriveUrl: null,
  observacaoLiberacao: null,
  trocaClienteEm: null,
  matricula: null,
  candidato: {
    nome: "Fulano De Tal",
    cpf: "39053344705",
    email: null,
    telefone: null,
    dataNascimento: NASCIMENTO,
    banco: null,
  },
  cliente: { codCliente: "51569", razaoSocial: "Cliente Teste", operacao: null },
  cargo: "Separador",
  vagaFolha: { salario: "1650.00", escala: null, endereco: null },
  uniforme: { possui: null, camiseta: null, calca: null, bota: null },
  exame: null,
  frentes: [],
  pendencias: [],
  passagens: [],
  alteracoes: [],
};

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch: vi.fn(async () => detalhe), apiOpenInline: vi.fn() };
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "t", isAdmin: true, usuario: null, temMenu: () => true }),
}));

import { AdmissaoDetalheModal } from "./AdmissaoDetalheModal";

describe("AdmissaoDetalheModal, data de nascimento", () => {
  beforeAll(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterEach(() => cleanup());

  it("exibe o dia guardado, sem recuar um dia por fuso negativo", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());

    expect(screen.getByText("31/05/1995")).toBeTruthy();
    // A prova de que o desvio NÃO está só escondido atrás de outro rótulo.
    expect(screen.queryByText("30/05/1995")).toBeNull();
  });
});
