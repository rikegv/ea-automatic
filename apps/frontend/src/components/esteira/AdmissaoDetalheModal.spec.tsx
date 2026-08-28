// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FICHA DA ADMISSÃO: a prop `somenteLeitura` esconde as SETE ações de escrita, e só quando é pedida.
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
//
// `temMenu` devolve FALSE de propósito, e a inversão é a prova: "Alocar em Alto Volume" era gatado
// pelo menu `alto-volume`, que é do Gerencial e nasce só para o SUPER_ADMIN (§A.23), então o
// consultor COMUM não conseguia alocar. Por decisão do diretor (28/08/2026) a ação passou a ser de
// qualquer usuário. Com o `temMenu` falso, se alguém devolver o gate, o botão some e o teste quebra.
/**
 * `isAdmin` é MUTÁVEL de propósito: o segundo describe deste arquivo monta a ficha como CONSULTOR
 * COMUM, que é o caso que a alocação em Alto Volume precisa cobrir. `vi.mock` roda uma vez, então a
 * variável é o único jeito de variar o papel entre os casos.
 */
let ehAdmin = true;

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "t", isAdmin: ehAdmin, usuario: null, temMenu: () => false }),
}));

import { AdmissaoDetalheModal } from "./AdmissaoDetalheModal";

/** As SETE ações de escrita, pelo rótulo com que aparecem na tela. */
const ACOES = [
  /editar uniforme/i,
  /reenviar por correção/i,
  /trocar cliente e cargo/i,
  /corrigir cpf/i,
  /^revisado$/i,
  /gerar link do vt/i,
  // Item 3 da OST dos 3 itens: alocar a admissão num projeto de Alto Volume a qualquer momento.
  // Aparece mesmo com `temMenu` falso: a ação deixou de depender do menu `alto-volume`.
  /alocar em alto volume/i,
];

describe("AdmissaoDetalheModal, prop somenteLeitura", () => {
  beforeEach(() => vi.clearAllMocks());
  // LIMPEZA EXPLÍCITA, e não a automática: o vitest deste projeto roda sem `globals`, então o
  // Testing Library não registra o cleanup sozinho. Sem isto o modal do primeiro caso, que é um
  // PORTAL em `document.body`, sobrevive ao segundo, e o teste acusaria botão escondido como visível.
  afterEach(() => cleanup());

  it("SEM a prop (Esteira, Gerenciador, Não Conformidades) mantém as sete ações", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());
    for (const acao of ACOES) {
      expect(screen.queryByRole("button", { name: acao }), String(acao)).toBeTruthy();
    }
  });

  it("COM a prop (Benefícios) esconde as sete, e a ficha continua legível", async () => {
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

/**
 * ALOCAR EM ALTO VOLUME PARA O CONSULTOR COMUM (correção de 28/08/2026).
 *
 * O DEFEITO TINHA DUAS CAMADAS, e a de baixo era a que enganava: além de o backend reivindicar a
 * escrita para o menu `alto-volume` (do Gerencial, §A.23), o botão morava DENTRO do bloco
 * "Correções", que só renderizava com `isAdmin`. Soltar só a permissão não teria resolvido nada: o
 * consultor continuaria sem ver o botão.
 *
 * O RECORTE É O QUE ESTE TESTE GUARDA. O bloco abriu, mas "Trocar cliente e cargo" e "Corrigir CPF"
 * seguem de Master, porque as rotas das duas são `@Roles` MASTER no backend e apareceriam só para
 * dar 403. Se alguém subir o `isAdmin` de volta para o contêiner, o primeiro caso quebra; se alguém
 * descer as duas de Master junto com a alocação, o segundo quebra.
 */
describe("AdmissaoDetalheModal, alocação em Alto Volume pelo consultor comum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ehAdmin = false;
  });
  afterEach(() => {
    cleanup();
    ehAdmin = true;
  });

  it("o COMUM vê Alocar em Alto Volume", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /alocar em alto volume/i })).toBeTruthy();
  });

  it("e NÃO vê as correções de Master, que continuam restritas", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /trocar cliente e cargo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /corrigir cpf/i })).toBeNull();
  });

  it("no modo leitura (Benefícios) a alocação some também para o COMUM", async () => {
    render(<AdmissaoDetalheModal admissaoId="adm-1" somenteLeitura onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/dados pessoais/i)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /alocar em alto volume/i })).toBeNull();
  });
});
