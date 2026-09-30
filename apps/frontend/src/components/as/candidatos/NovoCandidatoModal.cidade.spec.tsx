// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ A CIDADE DO CANDIDATO SAI DO TEXTO LIVRE (OST da Central de Vagas, item 7) ───────────────────
 *
 * ┌─ O DEFEITO QUE A OST MATA ──────────────────────────────────────────────────────────────────┐
 * │ A abertura de vaga já escolhia a cidade na lista do IBGE; o cadastro de candidato perguntava  │
 * │ a mesma coisa num campo aberto. Duas telas perguntando de dois jeitos é como "Guarulhos",     │
 * │ "guarulhos" e "Guarulhos/SP" passam a ser três cidades na mesma base, e nenhuma filtrável.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE TESTE É DE COMPONENTE ────────────────────────────────────────────────────────┐
 * │ As três réguas da OST moram no JSX, e nenhuma delas é função exportada: o campo FECHADO       │
 * │ enquanto não há UF, a lista FILTRADA pela UF, e a cidade LIMPA quando o estado troca. Régua   │
 * │ que só existe dentro do JSX é régua que ninguém afirma, e é assim que ela some numa           │
 * │ refatoração sem nada ficar vermelho.                                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A QUARTA AFIRMAÇÃO É A QUE PROTEGE O SERVIDOR: o que viaja no corpo continua sendo o NOME da
 * cidade, texto, e não o id do IBGE. Trocar a forma do valor faria a rota de criação passar a
 * receber um número num campo `varchar`, e a tela não tem autorização para mudar o contrato.
 *
 * §A.6: o CPF deste teste é um número de teste, e sai da tela sempre no CORPO de um POST.
 */

const { criarCandidato } = vi.hoisted(() => ({
  criarCandidato: vi.fn(async () => ({ id: "pessoa-1" })),
}));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return {
    ...real,
    criarCandidato,
    buscarCandidatos: vi.fn(async () => ({ itens: [], total: 0 })),
    alocarEmVaga: vi.fn(),
    moverEtapa: vi.fn(),
    registrarContato: vi.fn(),
  };
});

/**
 * O CATÁLOGO DE ETAPAS VEM DA REDE, e sem dublê ele sairia buscando a lista no meio do teste. Só
 * `useEtapas` é dublado: o resto do módulo é função pura, e trocá-la faria o teste afirmar o dublê.
 */
vi.mock("@/lib/as-etapas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-etapas")>("@/lib/as-etapas");
  return {
    ...real,
    useEtapas: () => ({
      etapas: [],
      ativas: [],
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

/**
 * ─ AS CIDADES, DUBLADAS POR UF, e é O DUBLÊ QUE PROVA O FILTRO ─────────────────────────────────
 *
 * Cada estado devolve cidades DIFERENTES de propósito: se a tela pedisse a lista sem passar a UF,
 * ou passasse a UF errada, o teste veria a cidade do outro estado. A UF pedida fica registrada em
 * `ufsPedidas`, e é assim que se afirma que NADA é pedido antes de o estado ser escolhido.
 */
const ufsPedidas: (string | null | undefined)[] = [];
const POR_UF: Record<string, { id: number; nome: string }[]> = {
  SP: [
    { id: 3550308, nome: "São Paulo" },
    { id: 3518800, nome: "Guarulhos" },
  ],
  MG: [{ id: 3106200, nome: "Belo Horizonte" }],
};

vi.mock("@/lib/as-cidades", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-cidades")>("@/lib/as-cidades");
  return {
    ...real,
    useCidades: (uf: string | null | undefined) => {
      ufsPedidas.push(uf);
      return { cidades: uf ? (POR_UF[uf] ?? []) : [], carregando: false, erro: null };
    },
  };
});

/**
 * A SESSÃO, DUBLADA: o modal lê `isSuperAdmin` para decidir se oferece o banco de talentos, e sem o
 * dublê o `useAuth` estoura fora do provedor. NÃO É super admin aqui de propósito: a concessão de
 * retenção permanente não tem nada a ver com a cidade, e ligá-la acrescentaria uma caixa ao teste.
 */
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    token: "t",
    isSuperAdmin: false,
    isAdmin: false,
    usuario: null,
    temMenu: () => true,
  }),
}));

import { NovoCandidatoModal } from "./NovoCandidatoModal";

function montar() {
  const onSalvo = vi.fn();
  render(<NovoCandidatoModal vagasAbertas={[]} token="t" onClose={vi.fn()} onSalvo={onSalvo} />);
  return { onSalvo };
}

/** Abre o seletor pelo seu nome acessível e clica na opção pedida. */
function escolher(nomeDoCampo: RegExp, opcao: string) {
  fireEvent.click(screen.getByRole("combobox", { name: nomeDoCampo }));
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  ufsPedidas.length = 0;
});

describe("a cidade do candidato", () => {
  it("nasce fechada, dizendo o que fazer, enquanto a UF não foi escolhida", () => {
    montar();

    expect(screen.getByText(/Escolha a UF ao lado para buscar a cidade/i)).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /^cidade$/i })).toBeNull();
    // NADA é pedido ao servidor antes do estado: são 5.570 municípios no país.
    expect(ufsPedidas.every((uf) => !uf)).toBe(true);
  });

  it("deixou de ser texto livre: não há mais campo aberto de cidade", () => {
    montar();
    expect(screen.queryByPlaceholderText(/cidade onde a pessoa mora/i)).toBeNull();
  });

  it("oferece as cidades DO ESTADO escolhido, e não as de outro", () => {
    montar();
    escolher(/^uf$/i, "SP");

    fireEvent.click(screen.getByRole("combobox", { name: /^cidade$/i }));
    expect(screen.getByRole("option", { name: "Guarulhos" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Belo Horizonte" })).toBeNull();
  });

  /**
   * A REGRA QUE UM RENOMEIO DE ESTADO QUEBRARIA EM SILÊNCIO: escolher "Guarulhos" e depois corrigir
   * a UF para MG deixaria a pessoa morando numa cidade que não existe no estado dela, e o formulário
   * não teria como acusar.
   */
  it("limpa a cidade escolhida quando a UF troca", () => {
    montar();
    escolher(/^uf$/i, "SP");
    escolher(/^cidade$/i, "Guarulhos");
    expect(screen.getByRole("combobox", { name: /^cidade$/i }).textContent).toContain("Guarulhos");

    escolher(/^uf$/i, "MG");
    expect(screen.getByRole("combobox", { name: /^cidade$/i }).textContent).not.toContain(
      "Guarulhos",
    );
  });

  it("manda o NOME da cidade no corpo, como texto, e não o id do IBGE", async () => {
    montar();
    fireEvent.change(screen.getByPlaceholderText(/nome de quem está sendo cadastrado/i), {
      target: { value: "Fulano De Tal" },
    });
    escolher(/^uf$/i, "SP");
    escolher(/^cidade$/i, "Guarulhos");

    fireEvent.click(screen.getAllByRole("button", { name: /salvar sem vaga/i })[0]);

    await waitFor(() => expect(criarCandidato).toHaveBeenCalledTimes(1));
    const [corpo] = criarCandidato.mock.calls[0] as unknown as [{ cidade?: string; uf?: string }];
    expect(corpo.cidade).toBe("Guarulhos");
    expect(corpo.uf).toBe("SP");
  });
});
