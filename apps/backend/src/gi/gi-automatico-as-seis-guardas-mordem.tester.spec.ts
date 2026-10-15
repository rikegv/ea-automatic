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
 * INVARIANTE 4: AS GUARDAS DE FOLHA CONTINUAM MORDENDO NO CAMINHO AUTOMATICO.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), ANTES de o
 * `backend` escrever o codigo.
 *
 * ⚠️ ERAM SEIS, SAO CINCO QUE MORDEM (decisao do diretor, 14/10/2026, permanente): a recusa por
 * UNIDADE nao declarada (`GI_SALARIO_SEM_UNIDADE`) FOI REMOVIDA. Unidade nula PASSA e o G.I aplica o
 * default dele (a unidade e cadastrada depois na Folha). O motivo continua no TYPE `GiRecusaContratacao`
 * e no mapa de mensagens por compatibilidade, mas `recusaDaContratacaoGi` NUNCA mais o retorna. As
 * CINCO que seguem mordendo estao em `AS_QUE_MORDEM`; a varredura do fim do arquivo prova que a UNIDADE
 * nao esta entre elas, e um teste proprio prova que, com unidade nula, o automatico ENVIA.
 *
 * ┌─ O QUE ESTE ARQUIVO IMPEDE, e e um erro de desenho inteiro, nao um bug ────────────────────────┐
 * │ As recusas de FOLHA foram construidas ENCOSTADAS no `POST` do gatilho MANUAL, que era a         │
 * │ unica porta de envio real. O gatilho automatico agora passa a ser o CAMINHO PRINCIPAL. Se ele   │
 * │ virar uma porta PARALELA ao manual (codigo novo que monta e dispara por conta propria), as      │
 * │ guardas ficam do lado de fora, e a porta principal passa a ser a MAIS FROUXA das duas.          │
 * │                                                                                                │
 * │ O dano de cada uma e o mesmo e e irreversivel: campo de folha com `default` no                  │
 * │ fornecedor. Empresa/filial omitidas gravam `0` e criam registro orfao. Horista sem jornada vira │
 * │ 9,34 vezes ZERO horas. Cliente final nao resolvido grava `0`, que e referencia a cliente        │
 * │ INEXISTENTE. Nenhuma dessas falhas avisa.                                                       │
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

/**
 * A RECUSA de UNIDADE que SAIU (decisao do diretor, 14/10/2026). Continua no TYPE e no mapa de
 * mensagens, mas `recusaDaContratacaoGi` nunca mais a retorna. A varredura do fim do arquivo prova que
 * ela NAO esta entre as que mordem, e `o CONTROLE da unidade` prova que, com unidade nula, o automatico
 * ENVIA.
 */
const RECUSA_REMOVIDA: GiRecusaContratacao = "GI_SALARIO_SEM_UNIDADE";

/** Cada linha e uma das que MORDEM: o nome da recusa e o patch MINIMO da contratacao que a provoca. */
const AS_QUE_MORDEM: Array<{
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

describe("INVARIANTE 4: no caminho AUTOMATICO, cada guarda de folha continua recusando", () => {
  for (const { recusa, patch, dano } of AS_QUE_MORDEM) {
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
     * Nao e uma das recusas de contratacao, e entra aqui pelo mesmo motivo: e uma guarda do
     * manual que o automatico nao pode deixar do lado de fora.
     */
    const ctx = montarArnesAutomatico(transicaoArmada({ pessoa: { nome: null, cpf: null } }));

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(ctx.criar, "o automatico mandou uma pessoa sem nome e sem CPF para a folha").not.toHaveBeenCalled();
  });

  it("a UNIDADE nula NAO trava mais o automatico: a mesma transicao ENVIA (regra nova do diretor)", async () => {
    /**
     * O CONTRAPONTO da remocao: onde antes `GI_SALARIO_SEM_UNIDADE` recusava, agora o automatico ENVIA
     * com `tipoSalario` nulo, e o G.I aplica o default dele. Prova que a recusa saiu de verdade do
     * caminho PRINCIPAL, nao so que deixou de constar da lista `AS_QUE_MORDEM`.
     */
    const ctx = montarArnesAutomatico(
      transicaoArmada({ contratacao: contratacaoDeFolhaCompleta({ salarioUnidade: null }) }),
    );

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "unidade nula ainda trava o automatico: a recusa GI_SALARIO_SEM_UNIDADE nao foi removida",
    ).toHaveBeenCalledTimes(1);
    expect(ctx.marcarEnviado).toHaveBeenCalledTimes(1);
  });

  it("o CONTROLE do grupo: com a contratacao completa, a mesma transicao ENVIA", async () => {
    /**
     * Sem este teste os de cima passariam com o gatilho automatico desligado, que e exatamente o
     * estado de hoje. Ele e o que garante que "nao enviou" la acima significa "a guarda recusou", e
     * nao "nada envia nunca".
     */
    const ctx = montarArnesAutomatico(transicaoArmada());

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "o grupo de controle nao enviou: os testes acima nao estao medindo as guardas",
    ).toHaveBeenCalledTimes(1);
  });

  it("a LISTA FECHADA do TYPE mantem as SEIS, e a UNIDADE nao esta entre as que MORDEM", async () => {
    /**
     * VARREDURA DO FONTE sobre a uniao `GiRecusaContratacao`, a lista autoritativa dos codigos LEGAIS.
     * Ela mantem SEIS: as cinco que mordem MAIS `GI_SALARIO_SEM_UNIDADE`, que continua no TYPE por
     * compatibilidade (tela/trilha/mapa de mensagens) embora `recusaDaContratacaoGi` nunca mais o
     * retorne. Uma recusa APAGADA do TYPE reprova aqui, e uma recusa NOVA tambem, porque recusa nova no
     * caminho principal precisa de teste proprio em vez de nascer sem ninguem olhar.
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

    // O TYPE mantem as SEIS, na ordem da cadeia, com a UNIDADE retida entre salario invalido e horista
    // sem jornada (o lugar que ela ocupava quando ainda mordia).
    expect(codigos).toEqual([
      "GI_SEM_EMPRESA_FILIAL",
      "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
      "GI_SALARIO_INVALIDO",
      "GI_SALARIO_SEM_UNIDADE",
      "GI_SALARIO_HORISTA_SEM_JORNADA",
      "GI_CLIENTE_NAO_RESOLVIDO",
    ]);
    // A RETIDA NAO MORDE: nao esta na lista das que recusam no automatico.
    expect(AS_QUE_MORDEM.map((g) => g.recusa), "a unidade voltou a morder").not.toContain(
      RECUSA_REMOVIDA,
    );
  });
});
