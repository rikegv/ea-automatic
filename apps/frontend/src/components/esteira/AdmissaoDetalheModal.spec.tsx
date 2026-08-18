// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FICHA DA ADMISSÃO: a prop `somenteLeitura` esconde as SEIS ações de escrita, e só quando é pedida.
 *
 * POR QUE ESTE TESTE EXISTE (§A.26). A prop entrou para a tela de BENEFÍCIOS, mas o componente é o
 * mesmo que a ESTEIRA, o GERENCIADOR e as NÃO CONFORMIDADES montam. Se o padrão da prop virasse
 * `true`, ou se alguém trocasse um `&& !somenteLeitura` por `|| somenteLeitura`, as três telas
 * perderiam as ações em silêncio: são botões que ninguém testa e que só somem quando alguém precisa
 * deles, na operação. O primeiro caso deste arquivo é justamente o das três telas de hoje, montando
 * o modal SEM a prop, e ele quebra se as ações sumirem.
 */

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
  // AGUARDANDO_ASSINATURA é o que faz aparecer o "Reenviar Por Correção".
  clicksignStatus: "AGUARDANDO_ASSINATURA",
  temEnvelope: true,
  contratoAssinadoDriveUrl: null,
  observacaoLiberacao: null,
  // Carimbo não nulo = aviso de troca na tela, que é onde vive o botão "Revisado".
  trocaClienteEm: "2026-08-10T12:00:00.000Z",
  matricula: "60256",
  candidato: {
    nome: "Fulano De Tal",
    cpf: "39053344705",
    email: null,
    telefone: null,
    dataNascimento: null,
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

// isAdmin true: sem ele o bloco "Correções" (trocar cliente e corrigir CPF) nem seria renderizado, e
// o teste passaria por falta de permissão em vez de por causa da prop.
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "t", isAdmin: true, usuario: null }),
}));

import { AdmissaoDetalheModal } from "./AdmissaoDetalheModal";

/** As seis ações de escrita, pelo rótulo com que aparecem na tela. */
const ACOES = [
  /editar uniforme/i,
  /reenviar por correção/i,
  /trocar cliente e cargo/i,
  /corrigir cpf/i,
  /^revisado$/i,
  /gerar link do vt/i,
];

describe("AdmissaoDetalheModal, prop somenteLeitura", () => {
  beforeEach(() => vi.clearAllMocks());
  // LIMPEZA EXPLÍCITA, e não a automática: o vitest deste projeto roda sem `globals`, então o
  // Testing Library não registra o cleanup sozinho. Sem isto o modal do primeiro caso, que é um
  // PORTAL em `document.body`, sobrevive ao segundo, e o teste acusaria botão escondido como visível.
  afterEach(() => cleanup());

  it("SEM a prop (Esteira, Gerenciador, Não Conformidades) mantém as seis ações", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());
    for (const acao of ACOES) {
      expect(screen.queryByRole("button", { name: acao }), String(acao)).toBeTruthy();
    }
  });

  it("COM a prop (Benefícios) esconde as seis, e a ficha continua legível", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" somenteLeitura onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());
    for (const acao of ACOES) {
      expect(screen.queryByRole("button", { name: acao }), String(acao)).toBeNull();
    }
    // O DADO permanece: esconder ação não é esconder ficha.
    expect(screen.getByText(/trabalho e cadastro/i)).toBeTruthy();
    expect(screen.getByText("Separador")).toBeTruthy();
    // O AVISO de troca fica; só o botão dele saiu.
    expect(screen.getByText(/troca de cliente ou cargo/i)).toBeTruthy();
  });
});
