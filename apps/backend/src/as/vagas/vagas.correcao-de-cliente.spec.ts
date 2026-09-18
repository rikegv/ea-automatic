import "reflect-metadata";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";
import { VagasService } from "./vagas.service";
import { bancoDeStatus, erroDe, statusSemente, type LinhaStatus } from "./vaga-status.tester-fake";

/**
 * ─ A CORREÇÃO DA LIBERAÇÃO QUE SÓ TROCA O CLIENTE (achado V1 do `seguranca`, bloqueante) ───────
 *
 * ┌─ O CAMINHO QUE NÃO TINHA TESTE, E O DANO MEDIDO ───────────────────────────────────────────────┐
 * │ A liberação da revisão grava na trilha "Liberada da revisão com o cliente A", com autor. O      │
 * │ Master chama a correção com `{ codCliente: "B" }` e SEM `devolverParaFila`: a vaga passa a ser  │
 * │ do cliente B e a única afirmação consultável continua dizendo A. A trilha não ficava            │
 * │ silenciosa, ficava ERRADA, e trilha errada é lida como verdade. Trocar o cliente de uma vaga    │
 * │ redefine sob qual controlador ficam as candidaturas penduradas nela (§A.6).                      │
 * │                                                                                                 │
 * │ O RAMO QUE DEVOLVIA PARA A FILA JÁ GRAVAVA. O buraco era exatamente o outro, e era o único      │
 * │ ramo sem teste: `corrigirLiberacaoDaRevisao` não era exercitada por spec nenhuma.               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TESTE AFIRMA A PROPRIEDADE (quem, e o par de, para), não o desenho: ele procura a escrita pela
 * TABELA do rastro e pelos VALORES, sem exigir nome de coluna nem ordem de instrução.
 *
 * §A.6: códigos de cliente, um id de usuário interno. Nenhum dado de candidato entra neste arquivo.
 */

const MASTER: AuthUser = {
  id: "user-master",
  email: "master@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

const CLIENTE_A = "CLI-A";
const CLIENTE_B = "CLI-B";

const CATALOGO = (): LinhaStatus[] => statusSemente();

/** O catálogo injetado, fingido, com a RÉGUA DE PRODUÇÃO dentro (mesmo molde do movimento). */
function catalogoDeStatusFingido(linhas: LinhaStatus[]) {
  const regua = new ReguaDeStatusDaVaga(linhas);
  return new Proxy(
    { regua: async () => regua },
    {
      get: (alvo, prop: string) => {
        if (prop in alvo) return (alvo as Record<string, unknown>)[prop];
        if (prop === "then") return undefined;
        return async (...args: unknown[]) => {
          const codigo = args.find((a) => typeof a === "string") as string | undefined;
          if (/codigo/i.test(prop) && /papel/i.test(prop)) return regua.codigoDoPapel(codigo as never);
          const linha = linhas.find((l) => l.codigo === codigo);
          if (linha) return { ...linha };
          return linhas.map((l) => ({ ...l }));
        };
      },
    },
  );
}

/**
 * A VAGA JÁ LIBERADA: está no papel ABERTURA e tem, na trilha, o evento `REVISAO -> ABERTURA`, que
 * é o que a correção exige para não virar uma porta de empurrar qualquer vaga para dentro da fila.
 */
function cenario(clienteAtual: string | null = CLIENTE_A) {
  const linhas = CATALOGO();
  const regua = new ReguaDeStatusDaVaga(linhas);
  const codigoRevisao = regua.codigoDoPapel("REVISAO");
  const codigoAbertura = regua.codigoDoPapel("ABERTURA");
  const banco = bancoDeStatus({
    status: linhas,
    clientes: [{ codCliente: CLIENTE_A }, { codCliente: CLIENTE_B }],
    vagas: [
      {
        id: "vaga-1",
        codigo: "PS-2026-777",
        nomeDivulgacao: "Vaga espelhada do ATS",
        status: codigoAbertura,
        codCliente: clienteAtual,
        posicoesOficiais: 3,
        posicoesBanco: 0,
        vagasFechadas: null,
        vagasFechadasBanco: null,
        dataFechamento: null,
        escolaridade: null,
        regioes: [],
        idiomas: [],
        testes: [],
        criadoEm: new Date("2026-09-15T12:00:00.000Z"),
        atualizadoEm: new Date("2026-09-15T12:00:00.000Z"),
        fechamentoForcadoPorId: null,
        fechamentoForcadoEm: null,
        fechamentoForcadoFaltavam: null,
        canceladaPorId: null,
        canceladaEm: null,
        cancelamentoMotivo: null,
        cancelamentoObservacao: null,
      },
    ],
  });
  banco.eventos.push({
    id: 1,
    vagaId: "vaga-1",
    de: codigoRevisao,
    para: codigoAbertura,
    porId: "user-comum",
    observacao: `Liberada da revisão com o cliente ${clienteAtual}.`,
  });
  const Construtor = VagasService as unknown as new (...a: unknown[]) => VagasService;
  const service = new Construtor(banco.db, catalogoDeEtapasFingido(), catalogoDeStatusFingido(linhas));
  return { banco, service, vaga: banco.vagas[0], codigoRevisao, codigoAbertura };
}

const corrigir = (service: VagasService, dto: Record<string, unknown>) =>
  (service as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)
    .corrigirLiberacaoDaRevisao("vaga-1", dto, MASTER);

/** As escritas de rastro da troca de cliente, seja qual for a coluna em que o valor caiu. */
const rastroDaTroca = (banco: ReturnType<typeof cenario>["banco"]) =>
  banco.escritas.filter((e) => e.tipo === "insert" && e.tabela === "vaga_cliente_correcoes");

describe("a correção que SÓ troca o cliente deixa autor e o par (de, para)", () => {
  it("grava o rastro mesmo sem devolver a vaga para a fila", async () => {
    const { service, banco, vaga } = cenario();
    await corrigir(service, { codCliente: CLIENTE_B });

    expect(vaga.codCliente, "a troca de cliente acontece de verdade neste caminho").toBe(CLIENTE_B);
    const rastro = rastroDaTroca(banco);
    expect(
      rastro,
      "a vaga mudou de dono e nada foi registrado: a trilha continua afirmando o cliente antigo da liberação, e ela é lida como verdade",
    ).toHaveLength(1);

    const valores = Object.values(rastro[0].valores);
    expect(valores, "o rastro diz QUEM trocou, e o autor vem da sessão").toContain(MASTER.id);
    expect(valores, "o rastro diz de QUAL cliente a vaga saiu").toContain(CLIENTE_A);
    expect(valores, "o rastro diz para QUAL cliente ela foi").toContain(CLIENTE_B);
  });

  it("o rastro é gravado DENTRO da mesma transação que troca o cliente", async () => {
    const { service, banco } = cenario();
    await corrigir(service, { codCliente: CLIENTE_B });
    expect(
      rastroDaTroca(banco)[0].naTransacao,
      "rastro fora da transação some quando ela reverte, e sobra a troca sem autor",
    ).toBe(true);
  });

  /**
   * O EVENTO DE STATUS CONTINUA NÃO SENDO INVENTADO. "ABERTA para ABERTA" é um passo que não
   * aconteceu, e ele mudaria a resposta do apagar do catálogo (`vaga-status.service.remover`), que
   * conta eventos com `de = codigo or para = codigo` para escolher entre APAGAR e INATIVAR.
   */
  it("não inventa movimento de status quando a vaga não sai do lugar", async () => {
    const { service, banco, vaga, codigoAbertura } = cenario();
    await corrigir(service, { codCliente: CLIENTE_B });
    expect(vaga.status).toBe(codigoAbertura);
    expect(
      banco.escritas.filter((e) => e.tipo === "insert" && e.tabela === "as_vaga_status_eventos"),
      "correção de cadastro não é passagem por status",
    ).toHaveLength(0);
  });

  it("a vaga que nasceu sem cliente registra a origem NULA, e não um código inventado", async () => {
    const { service, banco } = cenario(null);
    await corrigir(service, { codCliente: CLIENTE_B });
    const valores = rastroDaTroca(banco)[0].valores;
    expect(
      Object.values(valores).some((v) => v === null),
      "sem vínculo antes, o `de` é NULO: é a verdade da vaga espelhada, que chega do ATS sem cliente",
    ).toBe(true);
    expect(Object.values(valores)).toContain(CLIENTE_B);
  });
});

describe("a devolução para a fila continua com a trilha de status, e agora TAMBÉM com o rastro", () => {
  it("devolver trocando o cliente grava as DUAS coisas", async () => {
    const { service, banco, vaga, codigoRevisao } = cenario();
    await corrigir(service, { codCliente: CLIENTE_B, devolverParaFila: true });

    expect(vaga.status, "a vaga volta para a fila de revisão").toBe(codigoRevisao);
    expect(rastroDaTroca(banco), "a troca de cliente é rastreada nos dois ramos").toHaveLength(1);
    const evento = banco.escritas.filter(
      (e) => e.tipo === "insert" && e.tabela === "as_vaga_status_eventos",
    );
    expect(evento, "a devolução é movimento de status de verdade").toHaveLength(1);
    expect(String(evento[0].valores.observacao)).toContain(CLIENTE_B);
  });

  it("devolver SEM trocar o cliente não grava rastro de troca (linha que não é troca não existe)", async () => {
    const { service, banco } = cenario();
    await corrigir(service, { devolverParaFila: true });
    expect(
      rastroDaTroca(banco),
      "sem troca não há o que rastrear, e a linha vazia enche o rastro de ruído",
    ).toHaveLength(0);
  });
});

describe("as recusas continuam recusando ANTES de qualquer escrita", () => {
  it("cliente fora do cadastro é recusado, e nada é gravado", async () => {
    const { service, banco, vaga } = cenario();
    expect(await erroDe(() => corrigir(service, { codCliente: "CLI-INEXISTENTE" }))).not.toBeNull();
    expect(vaga.codCliente).toBe(CLIENTE_A);
    expect(rastroDaTroca(banco)).toHaveLength(0);
  });

  it("nada a corrigir (mesmo cliente, sem devolução) é recusado", async () => {
    const { service, banco } = cenario();
    expect(await erroDe(() => corrigir(service, { codCliente: CLIENTE_A }))).not.toBeNull();
    expect(rastroDaTroca(banco)).toHaveLength(0);
  });
});
