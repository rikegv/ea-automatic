import { describe, expect, it } from "vitest";
import {
  normalizarNomeDeClienteParaCasamento,
  proporCasamentoDeCliente,
} from "./as-depara-cliente-nome";

/**
 * ─ A CURADORIA DOS NOMES DE CLIENTE: A FÁBRICA PROPÕE, O TIME CONFIRMA ─────────────────────────
 *
 * §A.40 REGRA 2: vermelho de propósito. `domain/as-depara-cliente-nome.ts` não existe ainda.
 *
 * O REQUISITO (regra 6): 95 nomes distintos na planilha, 20 casando exato com o catálogo de 251 e 27
 * por prefixo depois de tirar `(filial)` e `- cidade`. A fábrica PROPÕE e o time CONFIRMA na tela.
 *
 * ┌─ A FRASE DO REQUISITO QUE É A REGRA INTEIRA DESTE ARQUIVO ───────────────────────────────────┐
 * │ "Proposta não confirmada NÃO é a mesma coisa que confirmada." Toda a diferença entre uma       │
 * │ curadoria útil e um vínculo inventado mora nesse campo, e é por isso que ele é afirmado aqui E │
 * │ do outro lado (`as-depara-cliente-vaga.tester.spec.ts`, "proposta NÃO CONFIRMADA não resolve   │
 * │ nada"): uma ponta sozinha cai na primeira refatoração.                                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes de cliente SINTÉTICOS. Nenhuma razão social real, nenhum nome de pessoa.
 */

/** O catálogo sintético, no formato que o EA tem: código e razão social. */
const CATALOGO = [
  { codCliente: "CLI-TESTE-1", razaoSocial: "ALFA SERVICOS LTDA" },
  { codCliente: "CLI-TESTE-2", razaoSocial: "BETA LOGISTICA S.A." },
  { codCliente: "CLI-TESTE-3", razaoSocial: "BETA LOGISTICA NORDESTE LTDA" },
  { codCliente: "CLI-TESTE-4", razaoSocial: "GAMA COMERCIO DE ALIMENTOS" },
] as const;

describe("normalizarNomeDeClienteParaCasamento: o que é nome e o que é anotação de quem digitou", () => {
  it("tira o que está entre parênteses, que é anotação e não nome", () => {
    /*
     * DEFEITO QUE PEGA: `(filial)` é instrução de quem preencheu a planilha, igual ao
     * `(MANTER SE HOUVER QUESTIONÁRIO)` que a casa já enfrentou no de/para de etapa
     * (`as-etapa-externa.ts`, com a mesma solução). Mantido, o MESMO cliente aparece como dois nomes
     * distintos, e o diretor mapeia duas vezes a mesma coisa.
     *
     * MUTANTE QUE ISTO MATA: apagar o `replace(/\([^)]*\)/g, " ")`.
     */
    expect(normalizarNomeDeClienteParaCasamento("ALFA SERVICOS LTDA (filial)")).toBe(
      normalizarNomeDeClienteParaCasamento("ALFA SERVICOS LTDA"),
    );
  });

  it("tira o sufixo de cidade depois do hífen", () => {
    /*
     * MUTANTE QUE ISTO MATA: apagar o corte do sufixo. Ele vale 27 dos 47 palpites (medido), ou seja
     * mais da metade da curadoria: sem ele, o time monta na mão o que a fábrica podia propor, que é o
     * oposto do princípio 7 do mapa de alcance.
     *
     * E O HÍFEN DENTRO DO NOME NÃO PODE SER CORTADO: `BETA-LOGISTICA` sem espaços em volta do hífen é
     * nome, não sufixo, e um `split("-")[0]` levaria metade do nome embora. É por isso que o par
     * negativo está no mesmo teste.
     */
    expect(normalizarNomeDeClienteParaCasamento("ALFA SERVICOS LTDA - SAO PAULO")).toBe(
      normalizarNomeDeClienteParaCasamento("ALFA SERVICOS LTDA"),
    );
    expect(normalizarNomeDeClienteParaCasamento("ALFA-SERVICOS")).not.toBe(
      normalizarNomeDeClienteParaCasamento("ALFA"),
    );
  });

  it("acento, caixa e espaço repetido não distinguem nomes", () => {
    expect(normalizarNomeDeClienteParaCasamento("  Gama   Comércio  de Alimentos ")).toBe(
      normalizarNomeDeClienteParaCasamento("GAMA COMERCIO DE ALIMENTOS"),
    );
  });

  it("nome vazio normaliza para vazio, e vazio não é nome", () => {
    /*
     * DEFEITO QUE PEGA: a célula de cliente em branco. Normalizada para `""`, ela casaria por PREFIXO
     * com TODO o catálogo (string vazia é prefixo de tudo), e o primeiro palpite seria um cliente ao
     * acaso. É o caminho mais curto que existe para propor um vínculo sem fundamento nenhum.
     */
    expect(normalizarNomeDeClienteParaCasamento("   ")).toBe("");
    expect(normalizarNomeDeClienteParaCasamento("(filial)")).toBe("");
  });
});

describe("proporCasamentoDeCliente: palpite com grau declarado, e NUNCA confirmado", () => {
  it("o casamento exato é EXATO, e vem com confirmado FALSO", () => {
    /*
     * ┌─ O MUTANTE MAIS CARO DESTA FRENTE, E ELE É DE UMA PALAVRA ────────────────────────────────┐
     * │ `confirmado: true` por default, ou o campo simplesmente ausente e lido como verdadeiro do    │
     * │ outro lado. Os 47 palpites viram vínculo real na primeira volta da varredura, antes de        │
     * │ ninguém olhar, e cada vaga nasce pendurada no cliente que a fábrica ACHOU. Desfazer exige    │
     * │ saber quais vínculos vieram de palpite, informação que o `true` acabou de apagar.            │
     * │                                                                                             │
     * │ POR QUE A ASSERÇÃO É `toBe(false)` E NÃO `toBeFalsy()`: `undefined` é falsy e passaria, e é  │
     * │ exatamente o estado que o outro lado leria como "não sei" (e, em metade das implementações,  │
     * │ como "tanto faz").                                                                          │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const p = proporCasamentoDeCliente("alfa servicos ltda", CATALOGO);

    expect(p).toMatchObject({ tipo: "EXATO", codCliente: "CLI-TESTE-1" });
    expect(p.confirmado).toBe(false);
  });

  it("o prefixo é PREFIXO, e o grau é parte da proposta", () => {
    /*
     * POR QUE O GRAU VIAJA JUNTO: quem confere 95 linhas na tela precisa saber onde olhar com cuidado.
     * Exato é conferência de um segundo; prefixo é onde `BETA LOGISTICA` e `BETA LOGISTICA NORDESTE`
     * moram, e é onde o erro humano de confirmação vai acontecer.
     *
     * MUTANTE QUE ISTO MATA: devolver só o `codCliente`, achatando os dois graus num só.
     *
     * O NOME SINTÉTICO AQUI É PREFIXO DE VERDADE, e isto me custou uma rodada ao provar o arquivo: a
     * primeira versão usava o nome COMPLETO com sufixo de cidade, que depois da normalização casa
     * EXATO, não por prefixo. O teste ficava vermelho contra uma implementação CORRETA, que é o pior
     * defeito que um teste pode ter: ele manda consertar o que está certo.
     */
    const p = proporCasamentoDeCliente("GAMA COMERCIO (filial) - CAMPINAS", CATALOGO);

    expect(p).toMatchObject({ tipo: "PREFIXO", codCliente: "CLI-TESTE-4", confirmado: false });
  });

  it("prefixo que serve a DOIS clientes não propõe nenhum", () => {
    /*
     * ┌─ O CASO QUE O CATÁLOGO SINTÉTICO EXISTE PARA CRIAR ──────────────────────────────────────┐
     * │ `BETA LOGISTICA` é prefixo de DOIS clientes do catálogo. Propor o primeiro é propor o        │
     * │ cliente errado em metade dos casos, e a proposta errada é PIOR que a ausência de proposta:   │
     * │ ela vem preenchida na tela, com cara de trabalho feito, e quem confere 95 linhas confirma em │
     * │ lote o que já está escrito. A régua da §A.33 vale igual: abster-se é o comportamento seguro. │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `catalogo.find(c => c.razaoSocial.startsWith(nome))`, que é a
     * implementação de uma linha e devolve o primeiro da lista, isto é a ordem do catálogo.
     */
    const p = proporCasamentoDeCliente("BETA LOGISTICA", CATALOGO);

    expect(p.tipo).toBe("AMBIGUO");
    expect(p).not.toHaveProperty("codCliente", "CLI-TESTE-2");
    expect(p).not.toHaveProperty("codCliente", "CLI-TESTE-3");
  });

  it("o EXATO vence o prefixo quando os dois existem", () => {
    /*
     * `BETA LOGISTICA S.A.` casa EXATO com um cliente e, ao mesmo tempo, é prefixo de outro quando se
     * tira a pontuação. Sem a ordem explícita, o par cairia como ambíguo e o time perderia um dos 20
     * casamentos CERTOS, que são os que não exigem conferência nenhuma.
     *
     * MUTANTE QUE ISTO MATA: avaliar prefixo antes de exato, ou somar os dois conjuntos de candidatos
     * antes de decidir.
     */
    const p = proporCasamentoDeCliente("beta logistica s a", CATALOGO);

    expect(p).toMatchObject({ tipo: "EXATO", codCliente: "CLI-TESTE-2" });
  });

  it("nome curto demais não propõe nada", () => {
    /*
     * DEFEITO QUE PEGA: `"A"` é prefixo de um monte de razão social, e `"BE"` de duas aqui. Prefixo
     * curto não é informação, é coincidência de alfabeto, e ele é o que transformaria a curadoria em
     * ruído: dezenas de propostas sem fundamento misturadas com as 47 boas, e o time perderia a
     * confiança na tela inteira.
     *
     * MUTANTE QUE ISTO MATA: remover o piso de comprimento. Qual é o piso é decisão do construtor;
     * que exista um é requisito, e é o que esta asserção afirma.
     */
    for (const curto of ["A", "BE", "GA"]) {
      expect(proporCasamentoDeCliente(curto, CATALOGO).tipo, `propôs a partir de "${curto}"`).toBe(
        "SEM_PALPITE",
      );
    }
  });

  it("nome que não parece com nada: SEM_PALPITE, e não o mais parecido", () => {
    /*
     * MUTANTE QUE ISTO MATA: qualquer distância de edição, qualquer "o mais parecido ganha". A
     * curadoria é de 95 nomes e o catálogo tem 251: um casamento aproximado sempre encontra ALGO, e
     * aqui o custo de propor errado é um vínculo de cliente, que é o campo pelo qual a admissão
     * inteira é faturada.
     */
    expect(proporCasamentoDeCliente("OMEGA TRANSPORTES RAPIDOS", CATALOGO).tipo).toBe("SEM_PALPITE");
  });

  it("NENHUM tipo de proposta nasce confirmado, nem o exato", () => {
    /*
     * A VARREDURA DOS QUATRO TIPOS, e ela é o que fecha a regra: o teste do EXATO sozinho deixa de pé
     * uma implementação que marcasse `confirmado: true` no ramo do PREFIXO, que é justamente o ramo
     * incerto, e é o ramo em que o atalho é mais tentador ("é só um prefixo, o time ajusta depois").
     */
    const nomes = [
      "alfa servicos ltda",
      "GAMA COMERCIO (filial) - CAMPINAS",
      "BETA LOGISTICA",
      "OMEGA TRANSPORTES RAPIDOS",
      "A",
    ];
    for (const nome of nomes) {
      expect(proporCasamentoDeCliente(nome, CATALOGO).confirmado, `"${nome}" nasceu confirmado`).toBe(
        false,
      );
    }
  });

  it("a proposta não depende da ORDEM do catálogo", () => {
    /*
     * DEFEITO QUE PEGA: resultado que muda com a ordem da lista é resultado que muda quando alguém
     * cadastra um cliente novo. A curadoria roda uma vez e é confirmada à mão, então uma instabilidade
     * assim não aparece em teste nenhum e aparece seis meses depois, como "o de/para do cliente X
     * mudou sozinho".
     *
     * MUTANTE QUE ISTO MATA: `find` em vez de coletar todos e conferir unicidade.
     */
    const invertido = [...CATALOGO].reverse();

    expect(proporCasamentoDeCliente("BETA LOGISTICA", invertido).tipo).toBe("AMBIGUO");
    expect(proporCasamentoDeCliente("alfa servicos ltda", invertido)).toMatchObject({
      tipo: "EXATO",
      codCliente: "CLI-TESTE-1",
    });
  });
});
