import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GiRecusaContratacao } from "../domain/portal-dados-gi";
import {
  ADM_SELECT,
  USER,
  contratacaoDeFolhaCompleta,
  montarArnesAutomatico,
  transicaoArmada,
} from "./gi-automatico.arnes";

/**
 * INVARIANTE 4: AS SEIS GUARDAS CONTINUAM MORDENDO NO CAMINHO AUTOMATICO.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), ANTES de o
 * `backend` escrever o codigo.
 *
 * ┌─ O QUE ESTE ARQUIVO IMPEDE, e e um erro de desenho inteiro, nao um bug ────────────────────────┐
 * │ As seis recusas de FOLHA foram construidas ENCOSTADAS no `POST` do gatilho MANUAL, que era a    │
 * │ unica porta de envio real. O gatilho automatico agora passa a ser o CAMINHO PRINCIPAL. Se ele   │
 * │ virar uma porta PARALELA ao manual (codigo novo que monta e dispara por conta propria), as seis │
 * │ guardas ficam do lado de fora, e a porta principal passa a ser a MAIS FROUXA das duas.          │
 * │                                                                                                │
 * │ O dano de cada uma das seis e o mesmo e e irreversivel: campo de folha com `default` no         │
 * │ fornecedor. Empresa/filial omitidas gravam `0` e criam registro orfao. Salario sem unidade vira │
 * │ MENSAL de R$ 9,34. Horista sem jornada vira 9,34 vezes ZERO horas. Cliente final nao resolvido  │
 * │ grava `0`, que e referencia a cliente INEXISTENTE. Nenhuma dessas falhas avisa.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TODO cenario aqui e a TRANSICAO PERFEITA com a flag ARMADA: frente nao concluida, regua fechando
 * nesta chamada, `GI_DISPARO_ARMADO=true`. E de proposito, porque so assim as guardas sao
 * exercitadas de verdade: com a flag desarmada o fluxo para ANTES delas, e o teste passaria com as
 * seis apagadas.
 *
 * O arnes esta em `gi-automatico.arnes.ts`. §A.6: toda entrada sintetica, CPF da faixa reservada
 * 999. §A.11: nenhum travessao.
 */

afterEach(() => vi.restoreAllMocks());

/** Cada linha e uma das seis: o nome da recusa e o patch MINIMO da contratacao que a provoca. */
const AS_SEIS: Array<{
  recusa: GiRecusaContratacao;
  patch: Partial<Parameters<typeof contratacaoDeFolhaCompleta>[0]>;
  dano: string;
}> = [
  {
    recusa: "GI_SEM_EMPRESA_FILIAL",
    patch: { vinculos: [] },
    dano: "empresa e filial omitidas gravam 0 no fornecedor e criam registro orfao, calado",
  },
  {
    recusa: "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
    // `1/37` e valido campo a campo e NAO existe no fornecedor: e o que checagem campo a campo perde.
    patch: { vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "37", ativo: true }] },
    dano: "o par nao existe no GI, e campo a campo os dois valores parecem validos",
  },
  {
    recusa: "GI_SALARIO_INVALIDO",
    patch: { salario: "0" },
    dano: "salario zero em folha e salario ERRADO, nao campo vazio",
  },
  {
    recusa: "GI_SALARIO_SEM_UNIDADE",
    patch: { salarioUnidade: null },
    dano: "o tipoSalario do GI tem default M: salario de hora entra como MENSAL, em silencio",
  },
  {
    recusa: "GI_SALARIO_HORISTA_SEM_JORNADA",
    patch: {
      salario: "9.34",
      salarioUnidade: "HORA",
      jornadaHorasMes: null,
      jornadaHorasSem: null,
    },
    dano: "qtdeHorasMes/Sem tem default 0: o horista entra como 9,34 vezes ZERO horas",
  },
  {
    recusa: "GI_CLIENTE_NAO_RESOLVIDO",
    patch: { codCliente: null },
    dano: "codigoCliente tem default 0, e 0 nao e vazio: e referencia a cliente INEXISTENTE",
  },
];

describe("INVARIANTE 4: no caminho AUTOMATICO, cada uma das seis guardas continua recusando", () => {
  for (const { recusa, patch, dano } of AS_SEIS) {
    it(`${recusa}: ZERO chamada ao cliente do GI e ZERO carimbo`, async () => {
      const ctx = montarArnesAutomatico(
        transicaoArmada({ contratacao: contratacaoDeFolhaCompleta(patch) }),
      );

      await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

      expect(
        ctx.criar,
        `a guarda ${recusa} nao morde no caminho AUTOMATICO: ${dano}`,
      ).not.toHaveBeenCalled();
      expect(
        ctx.marcarEnviado,
        `${recusa} recusou e ainda assim carimbou a idempotencia: a admissao nunca mais seria tentada`,
      ).not.toHaveBeenCalled();
    });
  }

  it("sem nome E sem CPF: o automatico nao manda pessoa VAZIA para a folha", async () => {
    /**
     * Nao e uma das seis recusas de contratacao, e entra aqui pelo mesmo motivo: e uma guarda do
     * manual que o automatico nao pode deixar do lado de fora.
     */
    const ctx = montarArnesAutomatico(transicaoArmada({ pessoa: { nome: null, cpf: null } }));

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(ctx.criar, "o automatico mandou uma pessoa sem nome e sem CPF para a folha").not.toHaveBeenCalled();
  });

  it("o CONTROLE do grupo: com a contratacao completa, a mesma transicao ENVIA", async () => {
    /**
     * Sem este teste os seis de cima passariam com o gatilho automatico desligado, que e exatamente o
     * estado de hoje. Ele e o que garante que "nao enviou" la acima significa "a guarda recusou", e
     * nao "nada envia nunca".
     */
    const ctx = montarArnesAutomatico(transicaoArmada());

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "o grupo de controle nao enviou: os seis testes acima nao estao medindo as guardas",
    ).toHaveBeenCalledTimes(1);
  });

  it("a LISTA FECHADA de recusas continua com estas SEIS, nem mais nem menos", async () => {
    /**
     * VARREDURA DO FONTE sobre a uniao `GiRecusaContratacao`, que e a lista autoritativa. Uma recusa
     * APAGADA para "deixar o automatico passar" reprova aqui, e uma recusa NOVA tambem, porque
     * recusa nova no caminho principal precisa de teste proprio em vez de nascer sem ninguem olhar.
     *
     * Os comentarios saem ANTES do casamento: ha blocos de documentacao citando os codigos entre
     * aspas logo acima da uniao, e sem a limpeza a varredura conta codigo que nao e declaracao.
     */
    const fonte = readFileSync(join(__dirname, "..", "domain", "portal-dados-gi.ts"), "utf8");
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const bloco = /export type GiRecusaContratacao =([\s\S]*?);/.exec(semComentarios)?.[1];
    expect(bloco, "a uniao GiRecusaContratacao mudou de forma e a varredura parou de medir").toBeTruthy();
    const codigos = [...(bloco ?? "").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);

    expect(codigos).toEqual(AS_SEIS.map((g) => g.recusa));
  });
});
