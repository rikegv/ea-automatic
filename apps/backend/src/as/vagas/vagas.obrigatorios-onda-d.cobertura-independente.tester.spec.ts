import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { bancoFingidoDeStatus, semente } from "../vaga-status/vaga-status.fake-db";
import { VagaStatusService, type ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ ONDA D: O SERVIDOR RECUSA PUBLICAR SEM CLIENTE E SEM PREVISÃO, E O RASCUNHO CONTINUA PASSANDO ─
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CÓDIGO (§A.38/§A.40 regra 2), por quem NÃO implementa.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, SE JÁ HÁ O TESTE DA RÉGUA PURA ──────────────────────────────┐
 * │ A RÉGUA PURA NÃO PROVA QUE O SERVIDOR A CHAMA. `vagaPendencias` pode acusar a falta do       │
 * │ cliente com perfeição e a publicação passar assim mesmo, se a guarda do service ler outra    │
 * │ lista, receber outro objeto, ou simplesmente não ser chamada no caminho do publicar. O que a │
 * │ operação sente é a RECUSA, e é ela que este arquivo mede, na guarda de verdade.              │
 * │                                                                                              │
 * │ E A METADE QUE MAIS IMPORTA É A OUTRA: o RASCUNHO CONTINUA SALVANDO VAZIO (§A.3 regra 5, o   │
 * │ não-bloqueio). Um obrigatório novo cobrado cedo demais transforma "salve como rascunho e     │
 * │ volte depois" em parede, e essa é a regressão que ninguém percebe até a operação travar.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A GUARDA É CHAMADA DIRETO, com o banco NULO: assim a prova é sobre a régua e a ordem, e não
 * depende de nenhuma ida ao banco. É a mesma técnica de `vagas.publicacao-uma-fonte-so.spec.ts`.
 *
 * §A.6: nenhum dado pessoal. Código de cliente fictício, rótulos de campo e nomes de status.
 */

type Campos = Record<string, unknown>;

function montar() {
  const banco = bancoFingidoDeStatus({ status: semente() });
  const catalogo = new VagaStatusService(banco.db as Database);
  const vagas = new VagasService(
    null as unknown as Database,
    catalogoDeEtapasFingido() as never,
    catalogo as never,
  );
  return { catalogo, vagas };
}

/** A guarda dos obrigatórios, chamada direto. Devolve a mensagem da recusa, ou `null` se passou. */
function recusa(
  vagas: VagasService,
  regua: ReguaDeStatusDaVaga,
  campos: Campos,
  status: string,
): string | null {
  try {
    (
      vagas as unknown as {
        travaObrigatorios: (r: ReguaDeStatusDaVaga, c: Campos, s: string) => void;
      }
    ).travaObrigatorios(regua, campos, status);
    return null;
  } catch (e) {
    expect(e, "a recusa de campo obrigatório é 400, não 500").toBeInstanceOf(BadRequestException);
    return (e as BadRequestException).message;
  }
}

/** Uma vaga com TUDO preenchido, inclusive os dois obrigatórios novos da Onda D. */
function completa(): Campos {
  return {
    codigo: "PV900002",
    nomeDivulgacao: "Auxiliar De Loja",
    cargoId: "11111111-1111-4111-8111-111111111111",
    posicoesOficiais: 2,
    natureza: "NOVA",
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: 3,
    status: "ABERTA",
    dataAbertura: "2026-09-12",
    codCliente: "9001",
    dataLimite: "2026-10-01",
  };
}

describe("PUBLICAR: o servidor recusa a vaga sem cliente", () => {
  it("recusa, e a mensagem DIZ qual campo falta e em que passo", async () => {
    const { catalogo, vagas } = montar();
    const msg = recusa(vagas, await catalogo.regua(), { ...completa(), codCliente: null }, "ABERTA");

    expect(msg, "publicar sem cliente tem de ser recusado").not.toBeNull();
    expect(msg).toContain("Passo 1 · A Vaga: falta o Cliente");
  });

  it("recusa também quando o cliente vem em branco, e não só nulo", async () => {
    const { catalogo, vagas } = montar();
    const regua = await catalogo.regua();
    expect(recusa(vagas, regua, { ...completa(), codCliente: "" }, "ABERTA")).toContain("Cliente");
    expect(recusa(vagas, regua, { ...completa(), codCliente: "   " }, "ABERTA")).toContain(
      "Cliente",
    );
  });

  it("com o cliente escolhido, a publicação passa", async () => {
    const { catalogo, vagas } = montar();
    expect(recusa(vagas, await catalogo.regua(), completa(), "ABERTA")).toBeNull();
  });
});

describe("PUBLICAR: o servidor recusa a vaga sem previsão de entrega", () => {
  it("recusa, e a mensagem cita o passo 2 e o rótulo da operação", async () => {
    const { catalogo, vagas } = montar();
    const msg = recusa(vagas, await catalogo.regua(), { ...completa(), dataLimite: null }, "ABERTA");

    expect(msg, "publicar sem previsão de entrega tem de ser recusado").not.toBeNull();
    expect(msg).toContain("Passo 2 · Quem Pediu: falta a Previsão de entrega");
  });

  it("preenchida a previsão, a publicação passa", async () => {
    const { catalogo, vagas } = montar();
    expect(
      recusa(vagas, await catalogo.regua(), { ...completa(), dataLimite: "2026-12-31" }, "ABERTA"),
    ).toBeNull();
  });
});

describe("RASCUNHO: o não-bloqueio continua inteiro (§A.3 regra 5)", () => {
  it("salva rascunho SEM cliente e SEM previsão, sem reclamar", async () => {
    const { catalogo, vagas } = montar();
    expect(
      recusa(
        vagas,
        await catalogo.regua(),
        { ...completa(), codCliente: null, dataLimite: null, status: "RASCUNHO" },
        "RASCUNHO",
      ),
      "o rascunho não cobra obrigatório: é 'salve e volte depois'",
    ).toBeNull();
  });

  it("salva rascunho VAZIO, que é o caso de quem só tem o telefone do cliente na mão", async () => {
    const { catalogo, vagas } = montar();
    expect(recusa(vagas, await catalogo.regua(), {}, "RASCUNHO")).toBeNull();
  });
});

describe("a mensagem da recusa", () => {
  it("lista TODAS as pendências de uma vez, não a primeira que falhou", async () => {
    const { catalogo, vagas } = montar();
    const msg = recusa(
      vagas,
      await catalogo.regua(),
      { ...completa(), codCliente: "", dataLimite: "", codigo: "" },
      "ABERTA",
    );

    expect(msg).toContain("Cliente");
    expect(msg).toContain("Previsão de entrega");
    expect(msg).toContain("Código da vaga");
  });

  it("mantém a ORDEM DA TRILHA: o que é do passo 1 vem antes do que é do passo 2", async () => {
    const { catalogo, vagas } = montar();
    const msg =
      recusa(
        vagas,
        await catalogo.regua(),
        { ...completa(), codCliente: "", dataLimite: "" },
        "ABERTA",
      ) ?? "";

    expect(msg.indexOf("falta o Cliente")).toBeGreaterThanOrEqual(0);
    expect(msg.indexOf("falta o Cliente")).toBeLessThan(msg.indexOf("falta a Previsão de entrega"));
  });

  it("NÃO usa travessão (§A.11) e não devolve o valor digitado, só o rótulo do campo", async () => {
    const { catalogo, vagas } = montar();
    const msg =
      recusa(
        vagas,
        await catalogo.regua(),
        { ...completa(), codCliente: "", nomeDivulgacao: "" },
        "ABERTA",
      ) ?? "";

    expect(msg).not.toContain("—");
    expect(msg, "a recusa fala de campos, não ecoa o formulário").not.toContain("PV900002");
  });

  /**
   * REGRESSÃO ESCRITA À MÃO (não derivada da constante): cada obrigatório que já existia continua
   * barrando a publicação, citado pelo rótulo que a tela mostra.
   */
  it.each([
    ["codigo", "Código da vaga"],
    ["nomeDivulgacao", "Nome de divulgação"],
    ["cargoId", "Cargo"],
    ["natureza", "Natureza"],
    ["sazonalidade", "Sazonalidade"],
    ["linhaServicoId", "Linha de serviço"],
    ["dataAbertura", "Data de abertura"],
  ])("continua recusando a publicação sem %s", async (campo, rotulo) => {
    const { catalogo, vagas } = montar();
    const msg = recusa(vagas, await catalogo.regua(), { ...completa(), [campo]: "" }, "ABERTA");
    expect(msg).toContain(rotulo);
  });

  it("continua recusando a publicação com ZERO posição oficial", async () => {
    const { catalogo, vagas } = montar();
    const msg = recusa(
      vagas,
      await catalogo.regua(),
      { ...completa(), posicoesOficiais: 0 },
      "ABERTA",
    );
    expect(msg).toContain("Nº de posições oficiais");
  });
});
