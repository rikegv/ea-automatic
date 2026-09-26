import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SITUACOES_COM_MOTIVO_DE_CATALOGO, motivoVemDoCatalogo } from "@ea/shared-types";
import { SITUACOES_DE_SAIDA } from "../../domain/candidatura";
import {
  bancoFingido,
  linhaFingida,
  usuarioFingido,
} from "../candidatos/fronteira-encerrada.tester-fake";
import {
  MOTIVOS_DESCARTE_SEMEADOS,
  MOTIVO_DE_DESCARTE_FORA_DO_CATALOGO,
  MOTIVO_DE_DESCARTE_VALIDO,
} from "./motivos-descarte.fake";

/**
 * ─ O DESCARTE PASSOU A SER CONFERIDO CONTRA O CATÁLOGO, E O HISTÓRICO ANTIGO NÃO FOI TOCADO ─────
 *
 * O QUE ESTE ARQUIVO AFIRMA, em uma frase: a régua nova vale para ESCRITA NOVA, e só para o DESCARTE.
 *
 * ┌─ AS TRÊS PROPRIEDADES, E POR QUE NENHUMA DAS TRÊS É ÓBVIA ─────────────────────────────────┐
 * │ 1. O MOTIVO FORA DA LISTA É RECUSADO, e recusado no SERVIDOR. Antes desta frente o campo    │
 * │    era texto livre, e o seletor da tela era a única barreira: qualquer chamada direta à     │
 * │    rota gravava o que quisesse no campo que a auditoria lê depois. É o mesmo furo que o     │
 * │    ajuste 7 já pagou uma vez neste mesmo DTO.                                               │
 * │ 2. O RECORTE É O DESCARTE, e o resto da saída continua aceitando PROSA. Alargá-lo           │
 * │    derrubaria a ponte A&S para Admissão, recusando o envio de toda pessoa aprovada cuja     │
 * │    explicação não estivesse numa lista de desfechos negativos (§A.26).                      │
 * │ 3. O MOTIVO ANTIGO CONTINUA LEGÍVEL. `motivo_descarte` guardou texto livre por toda a vida  │
 * │    da coluna, a migration não o reescreve, não há FK e nenhuma LEITURA confere o gravado    │
 * │    contra o catálogo. É a propriedade que mais importa e a mais fácil de quebrar sem        │
 * │    perceber, porque quebrá-la não dá erro: só torna ilegível o passado.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O CATÁLOGO DO FAKE É A SEMENTE DA MIGRATION 0129, e não uma lista inventada: um teste que passasse
 * com "motivo de teste" provaria que a conferência existe e não provaria que ela confere contra o
 * que está no banco de verdade.
 *
 * §A.6: motivos de processo e um CPF de teste que o próprio fake já usava. Nada novo.
 */

const CONSULTOR = usuarioFingido("COMUM");

/** Um cenário de uma candidatura viva, pronta para receber o desfecho. */
function cenarioVivo(over: Parameters<typeof linhaFingida>[0] = {}) {
  return bancoFingido({ candidaturas: [linhaFingida({ situacao: "ATIVO", ...over })] });
}

describe("1. o motivo do DESCARTE é conferido contra o catálogo, no servidor", () => {
  it.each([...MOTIVOS_DESCARTE_SEMEADOS])("aceita %s, que está no catálogo ativo", async (nome) => {
    const b = cenarioVivo();

    await b.service.registrarSaida("cand-1", { situacao: "DESCARTADO", motivo: nome }, CONSULTOR);

    expect(b.updateDa("cand-1")).toMatchObject({
      situacao: "DESCARTADO",
      motivoDescarte: nome,
    });
  });

  it("RECUSA o texto livre que não está no catálogo, com 400 e frase de lista", async () => {
    const b = cenarioVivo();

    const erro = await b.service
      .registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_FORA_DO_CATALOGO },
        CONSULTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro as BadRequestException).message)).toMatch(/lista/i);
  });

  /**
   * NADA É GRAVADO NA RECUSA, e esta asserção é o par obrigatório da de cima: uma recusa que
   * acontecesse DEPOIS da escrita deixaria a candidatura encerrada com o motivo recusado dentro, e o
   * 400 na tela seria mentira. A conferência roda ANTES de qualquer transação, de propósito.
   */
  it("a recusa não grava NADA: nem a situação, nem o evento de histórico", async () => {
    const b = cenarioVivo();

    await b.service
      .registrarSaida("cand-1", { situacao: "DESCARTADO", motivo: "qualquer coisa" }, CONSULTOR)
      .catch(() => null);

    expect(b.updates).toHaveLength(0);
    expect(b.inserts).toHaveLength(0);
    expect(b.situacaoDe("cand-1")).toBe("ATIVO");
  });

  /**
   * O MOTIVO INATIVADO É RECUSADO COMO QUALQUER OUTRO DE FORA. Este é o caso que a tela esconde: o
   * diretor tira "Stand By" de circulação, o seletor deixa de oferecê-lo, e a aba que já estava
   * aberta continua com o valor antigo carregado. A conferência lê SÓ OS ATIVOS (`listarAtivos`),
   * então o envio de uma tela velha é recusado em vez de gravado.
   */
  it("o motivo que existe mas está INATIVO é recusado (o catálogo lido é o dos ATIVOS)", async () => {
    const b = bancoFingido({ candidaturas: [linhaFingida({ situacao: "ATIVO" })] });

    // "Motivo Aposentado" não está entre os semeados: é o que uma linha inativa parece para quem
    // consulta o catálogo ativo, que é exatamente o recorte que `motivosDeDescarteAtivos` faz.
    await expect(
      b.service.registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: "Motivo Aposentado" },
        CONSULTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("2. o recorte é o DESCARTE, e os outros desfechos continuam aceitando prosa", () => {
  /**
   * A LISTA É LIDA DO VOCABULÁRIO, e não redigitada: é a mesma constante que a tela lê para decidir
   * entre o seletor e a caixa de texto. Se a tela e o servidor lessem listas diferentes, a tela
   * ofereceria o que a rota recusa, que é o defeito clássico do par catálogo/formulário.
   */
  it("hoje o recorte é exatamente DESCARTADO, e ele é um desfecho de saída de verdade", () => {
    expect([...SITUACOES_COM_MOTIVO_DE_CATALOGO]).toEqual(["DESCARTADO"]);
    for (const s of SITUACOES_COM_MOTIVO_DE_CATALOGO) expect(SITUACOES_DE_SAIDA).toContain(s);
  });

  it.each(SITUACOES_DE_SAIDA.filter((s) => !motivoVemDoCatalogo(s)))(
    "%s continua aceitando texto livre, porque ali o campo pede PROSA",
    async (situacao) => {
      const b = bancoFingido({
        candidaturas: [linhaFingida({ situacao: "APROVADO" })],
        posicoesOficiais: 5,
      });

      await b.service.registrarSaida(
        "cand-1",
        { situacao, motivo: "Fechou com o cliente na entrevista final" },
        CONSULTOR,
      );

      expect(b.updateDa("cand-1")).toMatchObject({ situacao });
    },
  );

  /**
   * ┌─ A REGRESSÃO QUE ESTE TESTE EXISTE PARA PEGAR, e ela já custou caro uma vez neste módulo ──┐
   * │ Alargar a conferência para `ENVIADO_PARA_ADMISSAO` derrubaria a PONTE A&S para Esteira:    │
   * │ toda pessoa aprovada passaria a precisar de uma explicação escolhida numa lista de         │
   * │ desfechos NEGATIVOS ("Reprovado", "Faltante"...). O sintoma seria um 400 na operação, no    │
   * │ gesto mais importante do funil, e nenhum teste de catálogo o pegaria.                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o envio para a admissão NÃO é conferido contra o catálogo (a ponte continua passando)", () => {
    expect(motivoVemDoCatalogo("ENVIADO_PARA_ADMISSAO")).toBe(false);
  });
});

describe("3. o histórico antigo, escrito em texto livre, continua legível", () => {
  const ANTIGO = "reprovado na entrevista com o cliente";

  /**
   * ┌─ A PROPRIEDADE 3 SE PROVA PELA CONTAGEM DE CHAMADORES, e a escolha é deliberada ───────────┐
   * │ "A leitura não confere o motivo contra o catálogo" é uma afirmação sobre a AUSÊNCIA de um  │
   * │ comportamento, e afirmar ausência com um cenário de banco fingido prova só que AQUELE      │
   * │ caminho não confere. O que se quer garantir é mais forte: que NENHUM caminho confira.       │
   * │                                                                                            │
   * │ A CONSULTA DO CATÁLOGO É A ÚNICA PORTA POSSÍVEL para uma conferência, então contá-la        │
   * │ responde a pergunta inteira: enquanto `motivosDeDescarteAtivos` tiver UM chamador de        │
   * │ produção, e esse chamador for a ESCRITA, nenhuma leitura pode estar escondendo, marcando ou │
   * │ recusando o texto livre que já está gravado. Um chamador novo derruba este teste e obriga a │
   * │ decisão a ser tomada de propósito, em vez de entrar de carona.                              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o catálogo tem UM chamador de produção, e ele é a ESCRITA da saída", () => {
    const raiz = join(__dirname, "..", "..");
    const chamadores: string[] = [];
    const varrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          varrer(caminho);
          continue;
        }
        if (!entrada.name.endsWith(".ts")) continue;
        // Specs e fakes ficam de fora: a pergunta é sobre o que RODA em produção.
        if (/\.spec\.ts$|\.fake\.ts$|tester-fake\.ts$/.test(entrada.name)) continue;
        // O próprio arquivo que a DEFINE não é chamador dela.
        if (caminho.endsWith(join("motivos-descarte", "motivos-descarte.service.ts"))) continue;
        // A CHAMADA, e não a MENÇÃO: o parêntese é o que separa a invocação de um comentário que
        // cita a função pelo nome (o `as.module.ts` cita, para explicar por que ela não é injetada).
        if (readFileSync(caminho, "utf8").includes("motivosDeDescarteAtivos(")) {
          chamadores.push(relative(raiz, caminho));
        }
      }
    };
    varrer(raiz);

    expect(chamadores).toEqual([join("as", "candidatos", "candidatos.service.ts")]);
  });

  /**
   * E O TEXTO ANTIGO REALMENTE NÃO PASSARIA NA ESCRITA DE HOJE. Sem esta asserção, a de cima
   * poderia estar protegendo um motivo que por acaso já está na lista, e não o texto livre de
   * verdade que a coluna guardou por toda a vida dela.
   */
  it("o motivo antigo é exatamente o tipo de texto que a escrita de hoje recusa", async () => {
    expect([...MOTIVOS_DESCARTE_SEMEADOS]).not.toContain(ANTIGO);

    const b = cenarioVivo();
    await expect(
      b.service.registrarSaida("cand-1", { situacao: "DESCARTADO", motivo: ANTIGO }, CONSULTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * E O MOTIVO ANTIGO SOBREVIVE A UMA ESCRITA NOVA NA MESMA PESSOA: descartar de novo, agora com um
   * motivo do catálogo, grava o novo sem "consertar" retroativamente o que estava lá. Reescrever o
   * passado para caber no vocabulário de hoje é exatamente o que a migration se recusou a fazer.
   */
  it("uma saída nova, válida, não reescreve nenhuma outra linha", async () => {
    const b = bancoFingido({
      candidaturas: [
        linhaFingida({ id: "cand-1", situacao: "ATIVO" }),
        linhaFingida({ id: "cand-2", situacao: "DESCARTADO", motivoDescarte: ANTIGO }),
      ],
    });

    await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO },
      CONSULTOR,
    );

    expect(b.updateDa("cand-1")).toMatchObject({ motivoDescarte: MOTIVO_DE_DESCARTE_VALIDO });
    expect(b.updateDa("cand-2")).toBeNull();
    expect(b.linhas.find((l) => l.id === "cand-2")?.motivoDescarte).toBe(ANTIGO);
  });
});
