import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import {
  DE_PARA_GI_VAZIO,
  montarContratacaoGi,
  type ContratacaoGi,
  type FuncionarioSelecao,
  type ParEmpresaFilialConhecido,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * A TRAVA DO DISPARO E O CAMINHO DO GATILHO AUTOMATICO.
 *
 * ⚠️ ESTE ARQUIVO MUDOU DE REQUISITO em 05/10/2026, e a mudanca esta registrada aqui de proposito.
 * Ele nasceu como "INVARIANTE 1: O GATILHO AUTOMATICO NUNCA ENVIA", escrito a partir do requisito de
 * entao. O DIRETOR DECIDIU O OPOSTO: o caminho PRINCIPAL do envio ao GI passou a ser o AUTOMATICO, no
 * fechamento da auditoria, e o clique manual de Master ficou como alternativa. Entao o invariante
 * "nunca envia" DEIXOU DE VALER e os testes que o mediam sairam, um por um, nomeados abaixo.
 *
 * O NOME DO ARQUIVO ficou defasado (ele diz "nunca-envia"); o conteudo nao. Renomear e decisao do
 * coordenador, que e o dono do recorte.
 *
 * O QUE SOBROU, porque continua sendo verdade e continua valendo a pena medir:
 *  1. O CANARIO: com o GI configurado e a flag ARMADA, a porta manual envia UMA vez. Sem ele, nenhum
 *     `not.toHaveBeenCalled()` deste arquivo prova coisa alguma, porque um duble quebrado faria todos
 *     passarem por acidente.
 *  2. A TRAVA `GI_DISPARO_ARMADO`: desarmada, NENHUM dos dois gatilhos cria no fornecedor. Esta e a
 *     garantia mais forte da frente e nao foi afrouxada pela decisao do diretor.
 *  3. A OPERABILIDADE: admissao declinada, rescindida, concluida ou PAUSADA nao vai para a folha,
 *     mesmo com a flag armada e a regua completa.
 *  4. A VARREDURA DO FONTE: a auditoria chama o gatilho AUTOMATICO, e a porta manual tem um chamador
 *     so, o controller do botao.
 *
 * O QUE SAIU, e por que:
 *  - "GI configurado E armado: GI_AUTOMATICO_INERTE e ZERO chamada": o desfecho
 *    `GI_AUTOMATICO_INERTE` deixou de existir, e a premissa (automatico inerte) foi revogada.
 *  - "nem LE a pessoa, nem a contratacao, nem consulta idempotencia": o automatico agora LE os tres,
 *    porque passa pela mesma cadeia de guardas do manual (`jaEnviado` incluido).
 *  - "o automatico so toca `configurado()` no cliente do GI": ele agora chama
 *    `criarFuncionarioSelecao`, que era justamente o que aquele Proxy proibia.
 *  - "UMA LEVA de 50 fechamentos: ZERO chamada no total": o medo da LEVA continua legitimo, e a
 *    protecao MUDOU DE LUGAR. Ela nao e mais "o automatico e no-op": e o GATE DE TRANSICAO, que mora
 *    no `auditoria.service` (UPDATE condicional, `rowCount === 1`) e nao neste servico. A leva passou
 *    a ser medida onde a protecao vive, em `gi-fechamento-da-auditoria-envia.tester.spec.ts`
 *    (invariante 2), que roda o pos-veredito inteiro. Medir a leva AQUI, chamando `enviar()` 50
 *    vezes, mediria a ausencia de uma guarda que nunca foi deste metodo.
 *
 * §A.6: toda entrada e SINTETICA. CPF da faixa reservada 999 (classe que a Receita nunca emitiu), nome
 * inventado, dominio de homologacao, salario inventado. §A.11: nenhum travessao.
 */

const ADM = "33333333-3333-3333-3333-333333333333";

/** Nada aqui existe: CPF da faixa reservada 999, nome inventado, dominio de homologacao. */
const PESSOA: PessoaParaGi = {
  nome: "Quenivaldo Brossimar Tulhante",
  cpf: "99911122233",
  email: "quenivaldo@homolog.local",
};

/** O par `1/4`, REAL, medido em `Empresa/GetAll` no fornecedor. */
const PAR_CONHECIDO: ParEmpresaFilialConhecido = (empresa, filial) => empresa === 1 && filial === 4;

/**
 * Uma admissao COMPLETA: passa por TODAS as guardas do passo 6 de proposito. E isso que faz o gatilho
 * ser a UNICA variavel do experimento, e o que permite afirmar que, pela porta manual, este mesmo
 * cenario envia de verdade.
 */
function contratacaoCompleta(): ContratacaoGi {
  return montarContratacaoGi({
    salario: "2750.00",
    salarioUnidade: "MENSAL",
    dataAdmissao: "2026-11-03",
    tipoContrato: "Temporário",
    vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true }],
    codCliente: "123",
  });
}

/**
 * O servico com o GI CONFIGURADO e o disparo ARMADO: o estado MAIS PERIGOSO que existe, e o unico em
 * que a pergunta deste arquivo tem sentido. Se o automatico fosse capaz de enviar, e aqui que enviaria.
 */
function cenarioArmadoEConfigurado() {
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const marcarEnviado = vi.fn(async () => {});
  const lerPessoa = vi.fn(async () => PESSOA);
  const lerContratacao = vi.fn(async () => contratacaoCompleta());
  const jaEnviado = vi.fn(async () => false);
  const giApi = { configurado: () => true, criarFuncionarioSelecao: criar } as unknown as GiApiService;
  // Porta nova da cadeia (06/10/2026): leitura AUTORITATIVA de farol, pausa e origem.
  const lerEstado = vi.fn(async () => ({ farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem: "MANUAL" }));
  const leitor = { jaEnviado, lerPessoa, lerContratacao, marcarEnviado, lerEstado } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k],
  } as unknown as ConfigService;
  return {
    svc: new EnviarParaGiService(config, giApi, leitor, depara),
    criar,
    marcarEnviado,
    lerPessoa,
    lerContratacao,
    jaEnviado,
    // Os dubles saem junto para que o cenario DESARMADO reuse exatamente estes, trocando so a flag:
    // dois conjuntos de duble divergem, e a divergencia e que faz um teste medir outra coisa.
    giApi,
    leitor,
    depara,
  };
}

/** O MESMO cenario, com a flag DESARMADA: e a trava que a decisao do diretor NAO afrouxou. */
function cenarioDesarmado() {
  const base = cenarioArmadoEConfigurado();
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "false" })[k],
  } as unknown as ConfigService;
  return { ...base, svc: new EnviarParaGiService(config, base.giApi, base.leitor, base.depara) };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O CANARIO: o espiao MORDE. Sem este teste, nenhum `not.toHaveBeenCalled()` abaixo prova nada.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("CANARIO do espiao: o mesmo dubleh, pela porta MANUAL, ENVIA", () => {
  it("enviarManual com GI configurado e disparo ARMADO chama criarFuncionarioSelecao UMA vez", async () => {
    const { svc, criar, marcarEnviado } = cenarioArmadoEConfigurado();

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(criar, "o dubleh nao chega ao POST: os testes do automatico passariam por acidente").toHaveBeenCalledTimes(1);
    expect(marcarEnviado).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O AUTOMATICO: ZERO chamada, no estado mais perigoso que existe
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("a TRAVA do disparo e a OPERABILIDADE no gatilho AUTOMATICO", () => {
  const VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-sintetico" };

  it("flag DESARMADA: monta e PARA, ZERO chamada ao cliente do GI", async () => {
    const { svc, criar, marcarEnviado } = cenarioDesarmado();

    const r = await svc.enviar(ADM, VIVO);

    expect(r).toEqual({ enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" });
    expect(criar, "a flag desarmada deixou de travar o automatico").not.toHaveBeenCalled();
    expect(marcarEnviado, "carimbou envio que nao aconteceu").not.toHaveBeenCalled();
  });

  it("flag DESARMADA tambem trava a porta MANUAL (a trava nao e so do automatico)", async () => {
    const { svc, criar } = cenarioDesarmado();

    const r = await svc.enviarManual(ADM, "autor-sintetico");

    expect(r).toEqual({ enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("farol NAO VIVO (declinio, rescisao, concluida) nao vai para a folha, nem armado", async () => {
    /**
     * MEDIDO na producao em 05/10/2026: existe admissao com a regua obrigatoria COMPLETA e a frente
     * AUDITORIA `concluida = false` cujo farol e DECLINOU ou RESCISAO, e ela esta DENTRO das
     * candidatas do runner em lote (`drive_pasta_url` nulo). Sem esta guarda, o runner faria a
     * transicao acontecer e mandaria um declinado para a folha do fornecedor.
     */
    for (const farol of ["DECLINOU", "RESCISAO", "ADMISSAO_CONCLUIDA"]) {
      const { svc, criar, marcarEnviado } = cenarioArmadoEConfigurado();

      const r = await svc.enviar(ADM, { ...VIVO, farolGlobal: farol });

      expect(r.enviado, `farol ${farol} foi enviado ao GI`).toBe(false);
      expect(r.motivo).toBe("GI_ADMISSAO_NAO_OPERAVEL");
      expect(criar, `farol ${farol} chegou ao POST do fornecedor`).not.toHaveBeenCalled();
      expect(marcarEnviado).not.toHaveBeenCalled();
    }
  });

  it("admissao PAUSADA nao vai para a folha, mesmo com o farol vivo e a flag armada", async () => {
    /**
     * A pausa e sobre o CLIENTE, e AUDITAR admissao pausada continua permitido por decisao do
     * diretor. MANDAR PARA A FOLHA, nao: sao perguntas diferentes, e `admissaoOperavel` cobre as
     * duas de uma vez.
     */
    const { svc, criar } = cenarioArmadoEConfigurado();

    const r = await svc.enviar(ADM, { ...VIVO, pausadaEm: new Date("2026-10-01T12:00:00Z") });

    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    expect(criar, "uma admissao pausada foi mandada para a folha").not.toHaveBeenCalled();
  });

  it("GI NAO configurado: desfecho GI_NAO_CONFIGURADO e ZERO chamada", async () => {
    const criar = vi.fn(
      async (_p: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
        ok: true,
        funcionarioSelecaoId: "GI-SINTETICO",
      }),
    );
    const giApi = { configurado: () => false, criarFuncionarioSelecao: criar } as unknown as GiApiService;
    const leitor = {} as unknown as GiLeitorService;
    const depara = { ...DE_PARA_GI_VAZIO } as unknown as GiDeParaService;
    const config = { get: () => "true" } as unknown as ConfigService;

    const r = await new EnviarParaGiService(config, giApi, leitor, depara).enviar(ADM, VIVO);

    expect(r).toEqual({ enviado: false, motivo: "GI_NAO_CONFIGURADO" });
    expect(criar).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A VARREDURA DO FONTE: o ponto de chamada da auditoria e o AUTOMATICO, e nao a porta manual
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("o fechamento da auditoria chama o AUTOMATICO, nunca a porta manual", () => {
  /**
   * POR QUE ESTA VARREDURA EXISTE, e ela e a metade que os dubles nao cobrem: todo teste acima prova
   * que `enviar()` e inerte. Nenhum deles impede que alguem, amanha, troque a linha da auditoria por
   * `enviarManual(...)`, que ENVIA. O invariante do diretor e sobre o CAMINHO, nao sobre um metodo.
   *
   * Comentarios sao tirados antes de asserir: fonte deste repositorio e densamente comentado, e
   * `enviarManual` aparece em prosa explicativa em varios arquivos.
   */
  const SRC = join(__dirname, "..");

  it("auditoria.service.ts chama `enviar(` e NAO menciona `enviarManual` em codigo", () => {
    const fonte = semComentarios(readFileSync(join(SRC, "auditoria", "auditoria.service.ts"), "utf8"));

    expect(fonte, "a auditoria deixou de chamar o gatilho automatico").toMatch(/enviarParaGi\s*\.\s*enviar\s*\(/);
    expect(fonte, "a auditoria passou a chamar a porta de ENVIO REAL no fechamento da regua").not.toMatch(
      /enviarManual/,
    );
  });

  it("a porta MANUAL e chamada so pelo controller do botao, em todo o backend", () => {
    /**
     * Lista derivada de varredura, nao escrita a mao: qualquer arquivo novo que passe a chamar
     * `enviarManual` aparece aqui e reprova, e a reprovacao e o pedido de revisao, nao um estorvo.
     *
     * O padrao exige o PONTO (`.enviarManual(`), que e a CHAMADA. Sem ele, a varredura casaria a
     * DECLARACAO do metodo no proprio servico, e um arquivo em que o metodo so existe passaria a contar
     * como chamador: a lista ficaria permanentemente "errada" e alguem a afrouxaria.
     */
    const chamadores = arquivosQueChamam(SRC, /\.\s*enviarManual\s*\(/);

    expect(chamadores.sort()).toEqual(["gi/enviar-para-gi.controller.ts"]);
  });
});

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Varre o `src` do backend e devolve os caminhos relativos (fora de spec) cujo CODIGO casa o padrao. */
function arquivosQueChamam(raiz: string, padrao: RegExp): string[] {
  const achados: string[] = [];
  const andar = (dir: string): void => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome !== "node_modules") andar(caminho);
        continue;
      }
      if (!nome.endsWith(".ts") || nome.includes(".spec.")) continue;
      if (padrao.test(semComentarios(readFileSync(caminho, "utf8")))) {
        achados.push(caminho.slice(raiz.length + 1));
      }
    }
  };
  andar(raiz);
  return achados;
}
