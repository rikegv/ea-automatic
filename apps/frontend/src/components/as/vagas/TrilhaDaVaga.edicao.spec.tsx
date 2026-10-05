// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ O MODO EDIÇÃO DA TRILHA: A VAGA JÁ LIBERADA (frente do CRUD da vaga liberada) ────────────────
 *
 * Três coisas afirmadas pela ponta em que elas se manifestam:
 *  1. a FRONTEIRA A&S/ADM (decisão 3): com gente enviada para a admissão, os campos que a ponte
 *     copia ficam em leitura e o aviso aparece no topo; sem ninguém enviado, nada trava;
 *  2. o CORPO da edição: vai para `PATCH /as/vagas/:id/editar`, com os dois responsáveis, sem
 *     status, sem contraparte, sem código e sem os campos travados;
 *  3. a CONFIRMAÇÃO pedida pelo servidor (409 `CONFIRMAR_*`): o diálogo aparece e o reenvio leva a
 *     flag, inclusive as duas em sequência.
 */

import {
  AS_VAGA_CAMPOS_DA_ADMISSAO,
  type AsVagaEdicaoPrevia,
  type VagaDetalhe,
} from "@ea/shared-types";
import { ApiError } from "@/lib/api";
import type { AsVagaStatus } from "@/lib/as-status-vaga";
import type { CatalogosDaTrilha } from "./TrilhaDaVaga";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

vi.mock("@/lib/as-cidades", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-cidades")>("@/lib/as-cidades");
  return { ...real, useCidades: () => ({ cidades: [], carregando: false, erro: null }) };
});

import { TrilhaDaVaga } from "./TrilhaDaVaga";

const STATUS_ABERTA = {
  id: 1,
  codigo: "ABERTA",
  rotulo: "Aberta",
  ordem: 1,
  tom: "ok",
  daTrilha: true,
  encerra: false,
  recebeCandidato: true,
  papel: "ABERTURA",
  ativo: true,
} as unknown as AsVagaStatus;

const CATALOGOS: CatalogosDaTrilha = {
  opcoes: {
    cargos: [{ id: "c1", nome: "Operador" }],
    clientes: [],
    beneficios: [],
    motivos: ["Aumento de quadro"],
    consultores: [],
    escalas: ["12x36"],
    comerciais: [],
  },
  contexto: {
    papelAs: "CONSULTOR",
    nome: "Fulano",
    contraparte: [{ id: "r1", nome: "Recrutadora Um" }],
  },
  segmentos: [],
  optClientes: [
    { value: "1", label: "Cliente Um" },
    { value: "2", label: "Cliente Dois" },
  ],
  optCargos: [{ value: "c1", label: "Operador" }],
  statusVaga: [STATUS_ABERTA],
  linhasAtivas: [],
  carregandoLinhas: false,
} as unknown as CatalogosDaTrilha;

const VAGA = {
  id: "vaga-1",
  codigo: "PS-2026-001",
  status: "ABERTA",
  codCliente: "1",
  cargoId: "c1",
  nomeDivulgacao: "Operador De Caixa",
  posicoesOficiais: 3,
  posicoesBanco: 0,
  salarioAbertura: "2500.00",
  localTrabalho: "Rua Sintética, 1",
  observacoes: "Texto antigo",
  consultorNome: "Consultor Um",
  recruiterNome: "Recrutadora Um",
  beneficios: [],
  idiomasExigidos: [],
  idiomas: [],
  etapasPs: [],
  regioes: [],
  genero: "INDIFERENTE",
  testes: [],
  sazonalidade: "OPERACAO_PADRAO",
  confidencial: false,
  divulgarEmpresa: true,
} as unknown as VagaDetalhe;

function previa(enviados: number): AsVagaEdicaoPrevia {
  return {
    vagaId: "vaga-1",
    editavel: true,
    motivoNaoEditavel: null,
    enviadosParaAdmissao: enviados,
    camposTravadosPelaAdmissao: enviados > 0 ? [...AS_VAGA_CAMPOS_DA_ADMISSAO] : [],
    entrevistasComOCliente: 0,
    posicoesOficiais: 3,
    posicoesBanco: 0,
    alocados: 0,
    entregues: 0,
    consultorId: "u1",
    recruiterId: "r1",
  };
}

/** A rede por rota: a prévia, as listas de responsáveis, e a gravação pela fila `respostasDaEdicao`. */
function rede(p: AsVagaEdicaoPrevia, respostasDaEdicao: Array<() => unknown>) {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.endsWith("/edicao-previa")) return p;
    if (path === "/as/vagas/consultores") return [{ id: "u1", nome: "Consultor Um" }];
    if (path === "/as/vagas/recrutadores") return [{ id: "r1", nome: "Recrutadora Um" }];
    if (path.endsWith("/editar")) {
      const proxima = respostasDaEdicao.shift();
      return proxima ? proxima() : { vagaId: "vaga-1", camposAlterados: 1, entrevistasRemovidas: 0 };
    }
    throw new Error(`rota inesperada: ${path}`);
  });
}

function chamadasDeEdicao() {
  return (apiFetch.mock.calls as unknown as [string, { method?: string; body?: Record<string, unknown> }][])
    .filter(([path]) => path.endsWith("/editar"));
}

function montar(onGravada = vi.fn()) {
  render(
    <TrilhaDaVaga
      modo={{ tipo: "edicao", vaga: VAGA }}
      catalogos={CATALOGOS}
      token="t"
      onFechar={vi.fn()}
      onGravada={onGravada}
    />,
  );
  return onGravada;
}

async function esperarPrevia() {
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Salvar alterações" }) as HTMLButtonElement).disabled).toBe(false),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("modo edição: a fronteira A&S/ADM", () => {
  it("com gente enviada para a admissão, trava os campos copiados e avisa no topo", async () => {
    rede(previa(2), []);
    montar();
    await esperarPrevia();

    expect(screen.getByText(/Esta vaga já mandou 2 pessoas para a admissão/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Editar Vaga" })).toBeTruthy();
    // Passo 1: cliente e cargo em leitura; o nome da vaga continua editável.
    expect((screen.getByRole("combobox", { name: /Cliente da vaga/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Cargo da vaga/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByDisplayValue("Operador De Caixa") as HTMLInputElement).readOnly).toBe(false);
    // O código é sempre leitura na edição.
    expect((screen.getByDisplayValue("PS-2026-001") as HTMLInputElement).readOnly).toBe(true);
    // Sem Status e sem proposta da planilha.
    expect(screen.queryByRole("button", { name: /Status da vaga/ })).toBeNull();

    // Passo 4 (Condições): salário e local de trabalho em leitura.
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect((screen.getByLabelText(/^Salário de abertura/) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText("Local de trabalho") as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it("sem ninguém enviado, nada trava e não há aviso", async () => {
    rede(previa(0), []);
    montar();
    await esperarPrevia();

    expect(screen.queryByText(/Esta vaga já mandou/)).toBeNull();
    expect((screen.getByRole("combobox", { name: /Cliente da vaga/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Cargo da vaga/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("o corpo sai sem status, contraparte, código e campos travados, e com os responsáveis", async () => {
    rede(previa(2), []);
    const onGravada = montar();
    await esperarPrevia();

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(onGravada).toHaveBeenCalled());

    const [[path, opcoes]] = chamadasDeEdicao();
    expect(path).toBe("/as/vagas/vaga-1/editar");
    expect(opcoes.method).toBe("PATCH");
    const corpo = opcoes.body ?? {};
    for (const fora of ["status", "contraparteId", "codigo", ...AS_VAGA_CAMPOS_DA_ADMISSAO]) {
      expect(corpo).not.toHaveProperty(fora);
    }
    expect(corpo.consultorId).toBe("u1");
    expect(corpo.recruiterId).toBe("r1");
    expect(corpo.nomeDivulgacao).toBe("Operador De Caixa");
    expect(corpo.confirmarTrocaDeCliente).toBeUndefined();
  });
});

describe("modo edição: a confirmação pedida pelo servidor", () => {
  const trocaDeCliente = () => {
    throw new ApiError("Conflict", 409, {
      codigo: "CONFIRMAR_TROCA_DE_CLIENTE",
      mensagem: "Confirme a troca.",
      entrevistas: 3,
    });
  };
  const abaixoDoAlocado = () => {
    throw new ApiError("Conflict", 409, {
      codigo: "CONFIRMAR_ABAIXO_DO_ALOCADO",
      mensagem: "Confirme a redução.",
      alocados: 2,
      entregues: 1,
    });
  };

  it("troca de cliente: mostra quantas entrevistas caem e reenvia com a confirmação", async () => {
    rede(previa(0), [trocaDeCliente]);
    const onGravada = montar();
    await esperarPrevia();

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(
      await screen.findByText(
        "Trocar o cliente apaga 3 entrevistas marcadas com o cliente anterior. A troca e a remoção ficam registradas na trilha da vaga.",
      ),
    ).toBeTruthy();
    expect(onGravada).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Trocar cliente" }));
    await waitFor(() => expect(onGravada).toHaveBeenCalled());

    const envios = chamadasDeEdicao();
    expect(envios).toHaveLength(2);
    expect(envios[0][1].body?.confirmarTrocaDeCliente).toBeUndefined();
    expect(envios[1][1].body?.confirmarTrocaDeCliente).toBe(true);
  });

  it("as duas confirmações em sequência: o terceiro envio leva as duas flags", async () => {
    rede(previa(0), [trocaDeCliente, abaixoDoAlocado]);
    const onGravada = montar();
    await esperarPrevia();

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    fireEvent.click(await screen.findByRole("button", { name: "Trocar cliente" }));
    expect(await screen.findByText(/A vaga já tem 2 pessoas alocadas e 1 entregue/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reduzir assim mesmo" }));
    await waitFor(() => expect(onGravada).toHaveBeenCalled());

    const ultimo = chamadasDeEdicao()[2][1].body ?? {};
    expect(ultimo.confirmarTrocaDeCliente).toBe(true);
    expect(ultimo.confirmarAbaixoDoAlocado).toBe(true);
  });

  it("cancelar a confirmação não reenvia nada", async () => {
    rede(previa(0), [trocaDeCliente]);
    const onGravada = montar();
    await esperarPrevia();

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByRole("button", { name: "Trocar cliente" });
    // Dois "Cancelar" na tela (o do rodapé e o do diálogo): o do diálogo é o último montado.
    const cancelar = screen.getAllByRole("button", { name: "Cancelar" });
    fireEvent.click(cancelar[cancelar.length - 1]);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Trocar cliente" })).toBeNull(),
    );
    expect(chamadasDeEdicao()).toHaveLength(1);
    expect(onGravada).not.toHaveBeenCalled();
  });

  it("recusa que não é confirmação mostra a frase do servidor no formulário", async () => {
    rede(previa(2), [
      () => {
        throw new ApiError("Conflict", 409, {
          codigo: "CAMPO_DA_ADMISSAO",
          mensagem: "O motivo agora é do time de ADM.",
          campos: ["motivo"],
        });
      },
    ]);
    const onGravada = montar();
    await esperarPrevia();

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("O motivo agora é do time de ADM.")).toBeTruthy();
    expect(onGravada).not.toHaveBeenCalled();
  });
});
