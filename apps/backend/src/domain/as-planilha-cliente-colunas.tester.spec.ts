import { describe, expect, it } from "vitest";
import {
  CAMPOS_DA_PLANILHA_DE_CLIENTE,
  CABECALHOS_DA_PLANILHA_DE_CLIENTE,
  conferirCabecalhoDaPlanilha,
  lerLinhaProjetadaDoAiService,
  projetarLinhaDaPlanilha,
} from "./as-planilha-cliente-colunas";

/**
 * ─ A LISTA BRANCA DE COLUNAS DA PLANILHA (§A.6), TESTADA ANTES DE O CÓDIGO EXISTIR ─────────────
 *
 * §A.40 REGRA 2: vermelho de propósito. `domain/as-planilha-cliente-colunas.ts` não existe ainda.
 *
 * ┌─ O REQUISITO, E POR QUE ELE É DE LISTA BRANCA E NÃO DE LISTA NEGRA ──────────────────────────┐
 * │ A planilha tem 65 COLUNAS. Quatro podem atravessar a rede: código da vaga, cliente, cargo e   │
 * │ status. Salário, consultor, recrutador e nome de candidato NÃO SAEM.                          │
 * │                                                                                               │
 * │ LISTA NEGRA É O MODO DE FALHA, e ele é por OMISSÃO: a planilha é mantida pelo time, que        │
 * │ acrescenta coluna quando precisa, e nenhuma lista negra escrita hoje conhece a coluna de       │
 * │ amanhã. No dia em que alguém criar "PRETENSAO SALARIAL" ou "CONTATO DO CANDIDATO", a lista     │
 * │ negra deixa passar, e o vazamento é silencioso: nada falha, o dado só começa a aparecer do     │
 * │ outro lado da rede e, de lá, em log de erro.                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE OS TESTES LEEM OS CABEÇALHOS DO PRÓPRIO MÓDULO ────────────────────────────────────┐
 * │ §A.6, e a régua é a mesma da §A.46: conteúdo real da planilha não entra em arquivo versionado. │
 * │ Os nomes de coluna de verdade ficam no módulo, que é código de configuração; o teste pergunta  │
 * │ a ele quais são e monta a linha sintética em cima disso. Isso NÃO torna os testes              │
 * │ tautológicos, porque o que eles afirmam é outra coisa: a CARDINALIDADE da lista (quatro, e     │
 * │ estes quatro campos) e o COMPORTAMENTO diante de coluna que a lista não conhece.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** O canário: uma marca que não existe em lugar nenhum, para ser procurada no resultado inteiro. */
const CANARIO = "CANARIO-NAO-PODE-ATRAVESSAR-9z9z9z";

/** Uma linha crua sintética: as 4 colunas permitidas, mais o que não pode sair. */
function linhaCrua(extras: Record<string, unknown> = {}): Record<string, unknown> {
  const h = CABECALHOS_DA_PLANILHA_DE_CLIENTE;
  return {
    [h.codigo]: "900001",
    [h.cliente]: "CLIENTE TESTE LTDA",
    [h.cargo]: "CARGO TESTE",
    [h.status]: "ABERTA",
    ...extras,
  };
}

const tudoQueSaiu = (v: unknown) => JSON.stringify(v);

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A LISTA É FECHADA, E É ELA A SUPERFÍCIE DE AUDITORIA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a lista branca tem QUATRO campos, e são estes quatro", () => {
  it("quatro, nem cinco", () => {
    /*
     * DEFEITO QUE PEGA: a quinta coluna entrando "porque é útil" (o consultor responsável é o pedido
     * mais natural do mundo numa tela de revisão). Esta asserção é o ponto em que alguém tem de
     * mudar um número e explicar por quê, o que é exatamente o que a §A.31 pede: propor, não entregar
     * em silêncio.
     *
     * MUTANTE QUE ISTO MATA: acrescentar um campo à lista sem tocar em nada mais.
     */
    expect([...CAMPOS_DA_PLANILHA_DE_CLIENTE].sort()).toEqual(
      ["cargo", "cliente", "codigo", "status"].sort(),
    );
    expect(Object.keys(CABECALHOS_DA_PLANILHA_DE_CLIENTE).sort()).toEqual(
      [...CAMPOS_DA_PLANILHA_DE_CLIENTE].sort(),
    );
  });

  it("nenhum campo da lista tem nome de dado pessoal nem de valor", () => {
    /*
     * A SEGUNDA FECHADURA, e ela é grosseira de propósito: o teste acima é por igualdade e cai se
     * alguém reescrever a lista inteira (uma refatoração grande, um merge mal resolvido). Esta
     * sobrevive a isso e continua barrando a classe de dado que a §A.6 nomeia.
     *
     * MUTANTE QUE ISTO MATA: reescrever a lista trocando `cargo` por `salario` e corrigir o teste de
     * cima "para ficar verde", que é o que acontece quando o teste de cima é o único.
     */
    const proibido = /salario|salário|cpf|candidat|consultor|recrutad|telefone|email|e-mail|nasc/i;
    for (const campo of CAMPOS_DA_PLANILHA_DE_CLIENTE) {
      expect(campo, `campo de lista branca com nome de dado vedado: ${campo}`).not.toMatch(proibido);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A PROJEÇÃO: O QUE A LISTA NÃO CONHECE NÃO ATRAVESSA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("projetarLinhaDaPlanilha: o resultado tem as quatro chaves e mais nada", () => {
  it("as quatro colunas permitidas passam", () => {
    const projetada = projetarLinhaDaPlanilha(linhaCrua());

    expect(Object.keys(projetada).sort()).toEqual([...CAMPOS_DA_PLANILHA_DE_CLIENTE].sort());
    expect(projetada).toMatchObject({ codigo: "900001", status: "ABERTA" });
  });

  it("COLUNA QUE A LISTA NÃO CONHECE não atravessa, e este é o teste da lista BRANCA", () => {
    /*
     * ┌─ O ÚNICO TESTE DESTE ARQUIVO QUE DISTINGUE LISTA BRANCA DE LISTA NEGRA ──────────────────┐
     * │ O cabeçalho sintético abaixo não é "salário" nem "consultor": é um nome que NINGUÉM        │
     * │ previu, que é o caso real de uma planilha viva mantida à mão. Uma lista negra, por perfeita │
     * │ que seja, passa VERDE em todos os outros testes e FALHA aqui, porque ela não tem como       │
     * │ conhecer a coluna que o time vai criar na semana que vem.                                   │
     * │                                                                                            │
     * │ A ASSERÇÃO É POR VALOR E SOBRE O RESULTADO SERIALIZADO, não por chave: um `{ ...crua }` com │
     * │ renomeação, um campo `cru` guardado "para depuração", um `Object.assign` ao contrário, todos │
     * │ passam numa conferência de chaves conhecidas e todos levam as 65 colunas pela rede.         │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `const { SALARIO, CONSULTOR, ...resto } = crua; return resto;`
     */
    const projetada = projetarLinhaDaPlanilha(
      linhaCrua({ "COLUNA QUE O TIME CRIOU DEPOIS": CANARIO }),
    );

    expect(tudoQueSaiu(projetada)).not.toContain(CANARIO);
    expect(Object.keys(projetada).sort()).toEqual([...CAMPOS_DA_PLANILHA_DE_CLIENTE].sort());
  });

  it("as colunas nomeadamente vedadas também não atravessam, uma a uma", () => {
    /*
     * REDUNDANTE COM O TESTE ACIMA POR CONSTRUÇÃO, E ELE EXISTE ASSIM MESMO: é o teste que NOMEIA o
     * que a §A.6 desta frente proíbe, e é o que um auditor futuro vai procurar. Cada cabeçalho aqui é
     * SINTÉTICO (não é o texto real da planilha, §A.46) e o valor é o canário.
     */
    for (const vedada of [
      "SALARIO SINTETICO",
      "CONSULTOR SINTETICO",
      "RECRUTADOR SINTETICO",
      "CANDIDATO APROVADO SINTETICO",
      "CPF SINTETICO",
      "TELEFONE SINTETICO",
    ]) {
      const projetada = projetarLinhaDaPlanilha(linhaCrua({ [vedada]: CANARIO }));
      expect(tudoQueSaiu(projetada), `a coluna ${vedada} atravessou`).not.toContain(CANARIO);
    }
  });

  it("a FORMA é estável: CÉLULA ausente na linha vira NULO, e não chave faltando", () => {
    /*
     * ┌─ A DISTINÇÃO QUE A PRÓXIMA PESSOA VAI CONFUNDIR, E ESTÁ AQUI PARA ELA ───────────────────┐
     * │ CABEÇALHO ausente é falha do DOCUMENTO e FAZ A LEITURA FALHAR (seção 4, bloqueio 6 da      │
     * │ auditoria). CÉLULA ausente é falha de UMA LINHA, e vira nulo. São camadas diferentes: a     │
     * │ primeira significa "esta planilha não é a que eu pensava" e não tem conserto automático; a  │
     * │ segunda significa "esta vaga não tem esse dado", que é o estado de 158 delas.               │
     * │                                                                                            │
     * │ Colapsar as duas nas duas direções dá defeito: falhar por célula vazia derruba a leitura    │
     * │ inteira por uma linha incompleta; aceitar cabeçalho faltando é justamente o que a leitura    │
     * │ por posição faz, e é o furo da seção 4.                                                     │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * DEFEITO QUE PEGA: a planilha é viva, então célula vazia e coluna renomeada acontecem. Objeto com
     * chave faltando faz o consumidor do outro lado da rede ler `undefined` onde o contrato dizia
     * `string | null`, e `undefined` passa por qualquer `if (!valor)` e MORRE em `JSON.stringify`
     * (a chave desaparece), o que transforma um dado ausente em campo inexistente três camadas depois.
     *
     * MUTANTE QUE ISTO MATA: montar o objeto condicionalmente (`...(v ? { campo: v } : {})`).
     */
    const h = CABECALHOS_DA_PLANILHA_DE_CLIENTE;
    const semCliente = { ...linhaCrua() };
    delete semCliente[h.cliente];

    const projetada = projetarLinhaDaPlanilha(semCliente);

    expect(Object.keys(projetada).sort()).toEqual([...CAMPOS_DA_PLANILHA_DE_CLIENTE].sort());
    expect(projetada.cliente).toBeNull();
    expect(projetada.cliente).not.toBeUndefined();
  });

  it("célula em branco é NULO, e não string vazia", () => {
    /*
     * MESMA RAZÃO DA RÉGUA DE PRECEDÊNCIA (`valorDeComparacao`): vazio é ausência, e duas leituras
     * diferentes de "vazio" é como nasce a divergência fantasma entre nulo e `""`.
     */
    const h = CABECALHOS_DA_PLANILHA_DE_CLIENTE;
    const projetada = projetarLinhaDaPlanilha(linhaCrua({ [h.cliente]: "   " }));

    expect(projetada.cliente).toBeNull();
  });

  it("o cabeçalho com espaço em volta continua sendo o mesmo cabeçalho", () => {
    /*
     * DECISÃO QUE EU CONGELEI, e está na lista de gaps: o export CSV do Google e a digitação humana
     * produzem cabeçalho com espaço e com caixa variável, e isso foi MEDIDO nos VALORES (`' 1587726'`).
     * Se o casamento de cabeçalho for por igualdade crua, a frente inteira para de funcionar no dia em
     * que alguém encostar na primeira linha da planilha, e o sintoma é "parou de casar tudo".
     *
     * O QUE A TOLERÂNCIA NÃO PODE FAZER é alargar a lista: a tolerância é no RECONHECIMENTO de um
     * cabeçalho da lista, nunca na aceitação de cabeçalho de fora, e é o teste do canário acima que
     * guarda esse limite.
     *
     * MUTANTE QUE ISTO MATA: `crua[h.codigo]` direto, sem normalizar as chaves da linha crua.
     */
    const h = CABECALHOS_DA_PLANILHA_DE_CLIENTE;
    const projetada = projetarLinhaDaPlanilha({
      [` ${h.codigo} `]: "900001",
      [h.cliente.toLowerCase()]: "CLIENTE TESTE LTDA",
      [h.cargo]: "CARGO TESTE",
      [h.status]: "ABERTA",
    });

    expect(projetada.codigo).toBe("900001");
    expect(projetada.cliente).toBe("CLIENTE TESTE LTDA");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. A SEGUNDA PROJEÇÃO, DO LADO DO BACKEND: FAIL-CLOSED NAS DUAS PONTAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("lerLinhaProjetadaDoAiService: quem recebe também peneira", () => {
  it("campo a mais que chegou pela rede é DESCARTADO na entrada", () => {
    /*
     * ┌─ A DUPLA PROJEÇÃO NÃO É REDUNDÂNCIA, É PROFUNDIDADE, E A CASA JÁ DECIDIU ISSO ───────────┐
     * │ `domain/pandape-varredura-projecao.ts` carrega a doutrina por escrito, para a entrada do    │
     * │ Pandapé: projeta na borda que toca a rede E projeta de novo antes de escrever. A razão é     │
     * │ concreta aqui: a projeção do `ai-service` é PYTHON, em outro deploy, com outro ciclo de      │
     * │ release. Um dia ele sobe com uma coluna a mais (por engano, por depuração, por "o time pediu │
     * │ o consultor na tela") e o backend, confiando, grava e loga o que recebeu.                    │
     * │                                                                                             │
     * │ §A.6 FAIL-CLOSED: quem recebe não confia em quem manda, mesmo sendo a mesma casa.            │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `return payload as LinhaProjetada`, que é o que um DTO sem
     * `forbidNonWhitelisted` faz, e que fica verde em qualquer teste de caminho feliz.
     */
    const lida = lerLinhaProjetadaDoAiService({
      codigo: "900001",
      cliente: "CLIENTE TESTE LTDA",
      cargo: "CARGO TESTE",
      status: "ABERTA",
      salario: CANARIO,
      consultor: CANARIO,
      colunaNovaQueNinguemPreviu: CANARIO,
    });

    expect(tudoQueSaiu(lida)).not.toContain(CANARIO);
    expect(Object.keys(lida ?? {}).sort()).toEqual([...CAMPOS_DA_PLANILHA_DE_CLIENTE].sort());
  });

  it("payload que não é objeto não derruba nem vira linha", () => {
    /*
     * DEFEITO QUE PEGA: o `ai-service` fora do ar devolve HTML de erro, e um proxy devolve texto. Um
     * `Object.keys(payload)` sobre `null` lança no meio de uma varredura, onde o chamador engole o
     * erro e soma um contador: a frente passa a não resolver nada, em silêncio.
     */
    for (const lixo of [null, undefined, "", "<html>", 7, []]) {
      expect(lerLinhaProjetadaDoAiService(lixo as never)).toBeNull();
    }
  });

  it("a RECUSA não carrega o conteúdo recusado, e isto é §A.6 na mensagem de erro", () => {
    /*
     * ┌─ O RISCO 4 DO MAPA DE ALCANCE, VIRADO EM TESTE ──────────────────────────────────────────┐
     * │ São 1,9 MB de dado operacional, com salário e nome de candidato dentro. A forma clássica de  │
     * │ ele acabar em log não é um `console.log` deliberado: é `throw new Error("linha inválida: " + │
     * │ JSON.stringify(linha))`, escrito de boa-fé para a depuração ficar fácil, e lido pelo         │
     * │ `catch` que já existe e já loga a mensagem. Dali não sai nunca mais, e está fora do alcance  │
     * │ de qualquer rotina de expurgo.                                                               │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: qualquer interpolação do payload na mensagem.
     *
     * O CANÁRIO VAI NUMA COLUNA DESCONHECIDA, e não numa permitida: pôr o canário em `cliente` (o
     * que eu fiz na primeira versão) faz o teste cair contra uma implementação CORRETA, porque aquela
     * coluna PODE atravessar. O que se afirma aqui é sobre o conteúdo RECUSADO, nunca sobre o aceito.
     */
    let mensagem = "";
    try {
      const r = lerLinhaProjetadaDoAiService({ colunaDesconhecida: CANARIO } as never);
      mensagem = tudoQueSaiu(r);
    } catch (e) {
      mensagem = String((e as Error).message ?? e);
    }

    expect(mensagem).not.toContain(CANARIO);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. O CABEÇALHO É A ÚNICA ÂNCORA: NUNCA POSIÇÃO, E FALTANDO UM, A LEITURA FALHA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("conferirCabecalhoDaPlanilha: a planilha é editada por gente, e colunas se mexem", () => {
  const cabecalhoCompleto = () => Object.values(CABECALHOS_DA_PLANILHA_DE_CLIENTE);

  it("o cabeçalho esperado passa, em qualquer ORDEM", () => {
    /*
     * ┌─ BLOQUEIO 6 DA AUDITORIA, E O DANO É O PIOR DESTA FRENTE INTEIRA ────────────────────────┐
     * │ Ler por POSIÇÃO ("as colunas 3, 7, 12 e 40") é o caminho mais curto num CSV de 65 colunas.  │
     * │ A planilha é editada à mão, e INSERIR UMA COLUNA NO MEIO reordena tudo o que vem depois: as  │
     * │ "4 colunas permitidas" passam a ser salário e nome de candidato, e NADA FALHA. A §A.6 vira   │
     * │ violação silenciosa por um gesto de planilha que ninguém considera uma mudança de sistema.   │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: qualquer leitura por índice. Embaralhar a ordem é a forma de pegá-la,
     * porque a leitura por posição passa na ordem natural e só quebra depois, em produção.
     */
    expect(() => conferirCabecalhoDaPlanilha(cabecalhoCompleto())).not.toThrow();
    expect(() => conferirCabecalhoDaPlanilha([...cabecalhoCompleto()].reverse())).not.toThrow();
  });

  it("coluna NOVA no meio não quebra nada, e não desloca a leitura", () => {
    const h = CABECALHOS_DA_PLANILHA_DE_CLIENTE;
    const comIntrusa = [h.codigo, "COLUNA NOVA DO TIME", h.cliente, h.cargo, "OUTRA", h.status];

    expect(() => conferirCabecalhoDaPlanilha(comIntrusa)).not.toThrow();

    const projetada = projetarLinhaDaPlanilha({
      [h.codigo]: "900001",
      "COLUNA NOVA DO TIME": CANARIO,
      [h.cliente]: "CLIENTE TESTE LTDA",
      [h.cargo]: "CARGO TESTE",
      OUTRA: CANARIO,
      [h.status]: "ABERTA",
    });

    expect(projetada).toMatchObject({ codigo: "900001", cliente: "CLIENTE TESTE LTDA" });
    expect(tudoQueSaiu(projetada)).not.toContain(CANARIO);
  });

  it("CABEÇALHO ESPERADO AUSENTE: a leitura FALHA, e não devolve o que achou", () => {
    /*
     * A OUTRA METADE DO BLOQUEIO 6. Devolver "o que achou" quando uma coluna foi RENOMEADA é o modo
     * de falha mais caro que existe aqui: a leitura devolve 3.533 linhas com o campo nulo, o de/para
     * conclui que a planilha não cobre nada, o resumo do ciclo registra "não casou" para as 470 vagas,
     * e o sintoma é indistinguível de "a planilha está vazia". Ninguém vai procurar uma coluna
     * renomeada a partir disso.
     *
     * MUTANTE QUE ISTO MATA: `return linhas.map(projetar)` sem conferir o cabeçalho.
     */
    for (const campo of CAMPOS_DA_PLANILHA_DE_CLIENTE) {
      const faltando = cabecalhoCompleto().filter(
        (c) => c !== CABECALHOS_DA_PLANILHA_DE_CLIENTE[campo],
      );
      expect(
        () => conferirCabecalhoDaPlanilha(faltando),
        `a leitura seguiu sem a coluna ${campo}`,
      ).toThrow();
    }
  });

  it("a FALHA diz qual coluna falta e NÃO carrega conteúdo de linha", () => {
    /*
     * §A.6 na mensagem de erro, que é por onde o conteúdo vaza de boa-fé. A mensagem precisa ser ÚTIL
     * (o conserto é renomear uma coluna na planilha, e quem vai fazer isso precisa saber qual), e o
     * nome do CABEÇALHO é metadado de configuração, não dado de pessoa. O que não entra é CÉLULA.
     */
    const h = CABECALHOS_DA_PLANILHA_DE_CLIENTE;
    let mensagem = "";
    try {
      conferirCabecalhoDaPlanilha([h.cliente, h.cargo, h.status, `${CANARIO} COLUNA`]);
    } catch (e) {
      mensagem = String((e as Error).message ?? e);
    }

    expect(mensagem).toContain(h.codigo);
    expect(mensagem).not.toContain(CANARIO);
  });

  it("cabeçalho vazio FALHA, e não é lido como planilha sem linhas", () => {
    /*
     * DEFEITO QUE PEGA: a credencial perde o acesso, o export devolve corpo vazio ou uma página de
     * erro, e o CSV parseado dá zero colunas. Tratar isso como "planilha sem dado" faria a frente
     * parar de propor em silêncio, e o diretor veria a tela de revisão esvaziar sem nenhum alarme.
     */
    expect(() => conferirCabecalhoDaPlanilha([])).toThrow();
  });
});
