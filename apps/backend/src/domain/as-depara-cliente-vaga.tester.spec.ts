import { describe, expect, it } from "vitest";
import type { CasoDaPropostaDeCliente, EstadoDaPropostaDeCliente } from "@ea/shared-types";
import {
  classificarCodigoDaPlanilha,
  montarMapaDePara,
  normalizarCodigoDeVaga,
  resolverClienteDaVaga,
} from "./as-depara-cliente-vaga";

/**
 * ─ O DE/PARA DE CLIENTE DA VAGA, TESTADO A PARTIR DO REQUISITO, ANTES DE O CÓDIGO EXISTIR ──────
 *
 * §A.40 REGRA 2: este arquivo nasce VERMELHO de propósito. `domain/as-depara-cliente-vaga.ts` ainda
 * NÃO existe, e o `import` acima aponta para onde ele vai nascer. Quem constrói faz passar; quem
 * testou não escreveu (§A.38).
 *
 * §A.6: NENHUM dado real da planilha aqui. Códigos na faixa sintética 9xxxxx, clientes
 * `CLI-TESTE-n`, nomes inventados. Nenhum CPF, nenhum nome de pessoa, nenhum salário.
 *
 * ┌─ O QUE ESTE ARQUIVO NÃO TESTA, E É A MUDANÇA DE DESENHO DO MEIO DA FRENTE ───────────────────┐
 * │ A primeira versão testava PRECEDÊNCIA: "a planilha não sobrescreve `vagas.cod_cliente`         │
 * │ escolhido a mão". Depois do veto da auditoria, o de/para NÃO ESCREVE AQUELA COLUNA EM NENHUM   │
 * │ CAMINHO: ele grava uma PROPOSTA inerte, e só a tela de revisão a lê.                           │
 * │                                                                                                │
 * │ Isso é mais FORTE, e por isso muda de arquivo: deixa de ser uma régua a comparar e passa a ser  │
 * │ uma PROPRIEDADE ESTRUTURAL a provar, "não existe caminho que alcance a coluna". Propriedade     │
 * │ estrutural não se prova com dado de entrada, se prova sobre a FONTE, e ela está em              │
 * │ `as/ingestao-pandape/depara-cliente.fonte-e-inercia.tester.spec.ts`.                            │
 * │                                                                                                │
 * │ A RAZÃO DE A COLUNA SER INTOCÁVEL, medida pela auditoria, fica registrada aqui porque é ela que │
 * │ dá peso ao outro arquivo: `vagas.cod_cliente` é lido por `candidatos.service.ts` com            │
 * │ `innerJoin` e SEM FILTRO DE STATUS, e vai direto para `cod_cliente` da pré-admissão. Dali ele    │
 * │ decide a RÉGUA DOCUMENTAL e a PASTA DO PRONTUÁRIO no Drive. Cliente errado é controlador        │
 * │ errado, e arquivamento no Drive não se desfaz.                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ── O DADO SINTÉTICO, DECLARADO ────────────────────────────────────────────────────────────────

const COD_A = "CLI-TESTE-1";
const COD_B = "CLI-TESTE-2";
/** Os "idVacancy" sintéticos. Faixa 9xxxxx, fora da faixa real medida. */
const VAGA_1 = 900001;
const VAGA_2 = 900002;
const NOME_A = "ALFA SERVICOS LTDA";
const NOME_B = "BETA LOGISTICA SA";
/** O catálogo de clientes do EA, como lista de códigos existentes (bloqueio 5 da auditoria). */
const CATALOGO = [COD_A, COD_B] as const;

/**
 * Uma linha do de/para, já curada: o código da planilha, o NOME do cliente como a planilha o
 * escreve, o código do catálogo quando a curadoria casou, e se aquele casamento foi CONFIRMADO.
 */
const linha = (
  codigo: unknown,
  nomeCliente: string | null,
  codCliente: string | null = null,
  confirmado = false,
) => ({ codigo, nomeCliente, codCliente, confirmado });

/** Atalho: o par (mapa, resumo) que a construção do de/para devolve. */
const de = (linhas: ReturnType<typeof linha>[], catalogo: readonly string[] = CATALOGO) =>
  montarMapaDePara(linhas, { clientesDoCatalogo: catalogo });

const mapaDe = (linhas: ReturnType<typeof linha>[], catalogo?: readonly string[]) =>
  de(linhas, catalogo).mapa;

const tudoQueSaiu = (v: unknown) => JSON.stringify(v);

/**
 * ─ O ACOPLAMENTO COM O VOCABULÁRIO OFICIAL, E POR QUE ELE É POR **TIPO** E NÃO POR VALOR ────────
 *
 * `CASOS_DA_PROPOSTA_DE_CLIENTE` e `ESTADOS_DA_PROPOSTA_DE_CLIENTE` vivem no `shared-types`, que é
 * arquivo de DONO ÚNICO (§A.39, o dono é o coordenador). Eu NÃO os importo como VALOR, e isso foi
 * MEDIDO, não escolhido por estilo: o backend não tem config de vitest, então `@ea/shared-types`
 * resolve pelo `package.json` para o **dist**, e constante nova chega `undefined` em tempo de
 * execução até alguém rodar o build do pacote. Uma sonda temporária imprimiu exatamente isso:
 * `ESTADOS: undefined | CASOS: undefined`, com uma constante antiga resolvendo normalmente ao lado.
 *
 * ENTÃO O TESTE FICARIA VERMELHO PELO MOTIVO ERRADO, que é a classe de defeito que este arquivo
 * inteiro existe para evitar: ninguém consegue distinguir "o de/para está errado" de "o pacote não
 * foi buildado", e o segundo manda procurar bug onde não tem.
 *
 * `import type` É ERASADO pelo transformador (zero efeito em execução) e CONFERIDO pelo typecheck,
 * que resolve o alias para o **fonte** (`tsconfig.json` do backend aponta para
 * `packages/shared-types/src/index.ts`). As duas listas abaixo são anotadas com os tipos oficiais:
 * aparecer um TERCEIRO caso, ou alguém renomear `SO_NOME`, quebra o typecheck aqui, enquanto os
 * literais na linha continuam sendo o que o teste afirma de verdade sobre o dado.
 */
const CASOS_QUE_EU_AFIRMO: readonly CasoDaPropostaDeCliente[] = ["COM_CODIGO", "SO_NOME"];
const ESTADOS_QUE_A_TELA_MOSTRA: readonly EstadoDaPropostaDeCliente[] = ["PROPOSTO", "CONFIRMADO"];

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A CLASSIFICAÇÃO DA CHAVE: A FONTE É SUJA, E É SUJA DE UM JEITO MEDIDO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("classificarCodigoDaPlanilha: o que é chave, o que é de OUTRA família, e o que é lixo", () => {
  it("o espaço à frente NÃO impede o casamento", () => {
    /*
     * DEFEITO QUE PEGA: o valor `' 1587726'` existe na coluna de código (medido). Sem a aparagem, a
     * chave do mapa nasce com o espaço, a consulta pergunta sem ele, e a vaga cai na revisão como se
     * não estivesse na planilha. O sintoma é o pior possível: não é erro, são dezenas de vagas que
     * "simplesmente não casaram", e ninguém confere uma por uma.
     *
     * MUTANTE QUE ISTO MATA: `String(v)` sem `.trim()`.
     */
    expect(classificarCodigoDaPlanilha(" 900001")).toEqual({ tipo: "CHAVE", chave: "900001" });
    expect(classificarCodigoDaPlanilha("900001 ")).toEqual({ tipo: "CHAVE", chave: "900001" });
    expect(classificarCodigoDaPlanilha("\t900001\n")).toEqual({ tipo: "CHAVE", chave: "900001" });
  });

  it("o número vira a MESMA chave que o texto do número", () => {
    /*
     * DEFEITO QUE PEGA: o `idVacancy` chega da API como NÚMERO e o da planilha chega como TEXTO. Mapa
     * com chave numérica consultado com texto (ou o contrário) não casa NUNCA, e o resultado é zero
     * vaga resolvida com o de/para carregado e aparentemente correto.
     */
    expect(classificarCodigoDaPlanilha(900001)).toEqual({ tipo: "CHAVE", chave: "900001" });
    expect(normalizarCodigoDeVaga(900001)).toBe(normalizarCodigoDeVaga("900001"));
  });

  it("a família `SL...` é REJEITADA COM MOTIVO PRÓPRIO, porque é código INTERNO do EA", () => {
    /*
     * ┌─ CORREÇÃO DE FATO DA AUDITORIA, E ELA MUDA O TESTE, NÃO SÓ O COMENTÁRIO ──────────────────┐
     * │ `SL00000049` NÃO é lixo de digitação. `db/schema/tables.ts` registra que `vagas.codigo`     │
     * │ carrega "o número do Pandapé, OU a família `SL...`": é código de origem de vaga nascida     │
     * │ DENTRO do EA.                                                                               │
     * │                                                                                             │
     * │ POR QUE ISSO PRECISA DE MOTIVO SEPARADO, e não de um "não numérico" genérico: alguém que    │
     * │ veja `SL...` na planilha e saiba que `vagas.codigo` também guarda `SL...` vai querer casar   │
     * │ os dois. Isso seria uma TERCEIRA CHAVE que ninguém desenhou, contra uma coluna REPETÍVEL de  │
     * │ propósito e DIGITADA por gente, e penduraria a vaga de um cliente no cliente de outro. O     │
     * │ motivo nomeado é o que transforma essa tentação numa conversa em vez de num commit.          │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: classificar `SL...` como MALFORMADO. Fica verde em qualquer teste que
     * só confira "não virou chave", e apaga a distinção no resumo do ciclo: a contagem de malformados
     * passa a misturar erro de digitação com código de outra família, e deixa de dizer o que quer
     * dizer ("há linha para consertar na planilha").
     */
    for (const sl of ["SL00000049", "sl00000049", " SL00000049 "]) {
      expect(classificarCodigoDaPlanilha(sl), `rejeitou ${sl} pelo motivo errado`).toEqual({
        tipo: "CODIGO_INTERNO_EA",
      });
    }
    expect(normalizarCodigoDeVaga("SL00000049")).toBeNull();
  });

  it("texto que não é chave nem família conhecida é MALFORMADO", () => {
    /*
     * São 147 valores não numéricos medidos na coluna. Aceitá-los criaria entrada de mapa com chave
     * `"vaga interna"`: inofensiva sozinha (ninguém consulta por ela), e caríssima de lado, porque
     * ela CONTA na detecção de ambiguidade e na cobertura, e o relatório passa a dizer que o de/para
     * cobre mais do que cobre.
     */
    for (const sujo of ["Vaga interna", "-", "n/a", "#N/D", "900001-A"]) {
      expect(classificarCodigoDaPlanilha(sujo), `aceitou ${sujo}`).toEqual({ tipo: "MALFORMADO" });
    }
  });

  it("célula VAZIA é VAZIA, e não malformada", () => {
    /*
     * DEFEITO QUE PEGA, e é de CONTABILIDADE, que é como esta frente vai ser julgada: a planilha tem
     * 3.533 linhas e célula em branco é rotina. Contar branco como malformado faria o resumo do ciclo
     * anunciar milhares de "linhas para consertar", e um contador que grita todo dia é um contador
     * que ninguém lê, inclusive no dia em que ele estiver certo.
     *
     * MUTANTE QUE ISTO MATA: colapsar VAZIA em MALFORMADO.
     */
    for (const vazio of ["", "   ", null, undefined]) {
      expect(classificarCodigoDaPlanilha(vazio)).toEqual({ tipo: "VAZIA" });
    }
  });

  it("zero, negativo e número com separador não são identidade de vaga", () => {
    /*
     * `0` passaria por qualquer "só dígitos" e viraria chave legítima: duas linhas com `0` e clientes
     * diferentes criariam ambiguidade FANTASMA numa chave que não existe.
     *
     * `900001.0` e `900.001` são o que uma planilha produz quando alguém formata a coluna como
     * número. Adivinhar ("tira o ponto", "corta o decimal") é inventar chave a partir de dado
     * corrompido, e é assim que se chega a cliente errado sem violar a §A.5 na letra. RECUSAR é o
     * fail-closed: a vaga cai na revisão, que é onde ela já cai hoje.
     *
     * MUTANTE QUE ISTO MATA: `Number(texto)` + `String(n)`, que transforma `"900001.0"` em `"900001"`
     * (chave inventada, em silêncio) e `"900.001"` em `900.001` (outro número, pior ainda).
     */
    for (const n of ["0", 0, "-900001", "900001.0", "900.001", "900001,0", 900001.5]) {
      expect(classificarCodigoDaPlanilha(n), `aceitou ${String(n)}`).not.toMatchObject({
        tipo: "CHAVE",
      });
    }
  });

  it("`normalizarCodigoDeVaga` devolve chave SE E SOMENTE SE a classificação é CHAVE", () => {
    /*
     * POR QUE ESTE TESTE EXISTE: duas funções respondendo sobre a mesma coluna é como nasce a
     * divergência silenciosa. Se a normalização aceitar `SL...` e a classificação rejeitar, o mapa
     * ganha uma entrada que o resumo jura ter descartado, e os dois lados continuam verdes.
     *
     * MUTANTE QUE ISTO MATA: implementar as duas em separado, cada uma com sua expressão regular.
     */
    for (const v of [" 900001", 900001, "SL00000049", "Vaga interna", "", "0", "900001.0"]) {
      const c = classificarCodigoDaPlanilha(v);
      const n = normalizarCodigoDeVaga(v);
      if (c.tipo === "CHAVE") expect(n).toBe(c.chave);
      else expect(n, `normalizou o que a classificação recusou: ${String(v)}`).toBeNull();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. AS DUAS CHAVES, E A ORDEM ENTRE ELAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("resolverClienteDaVaga: idVacancy primeiro, reference depois, e só como BUSCA", () => {
  it("casa pelo idVacancy quando ele está na planilha", () => {
    const mapa = mapaDe([linha(VAGA_1, NOME_A, COD_A, true)]);

    const r = resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null });

    expect(r).toMatchObject({ proposta: "COM_CODIGO", codCliente: COD_A, chave: "ID_VACANCY" });
  });

  it("casa pela REFERENCE quando o idVacancy não está, e DIZ qual chave usou", () => {
    /*
     * DEFEITO QUE PEGA: a segunda chave é o que leva a cobertura de 263 para 312 vagas (medido). Uma
     * implementação que só olhasse o `idVacancy` passaria em todo teste de caminho feliz e entregaria
     * 16% menos do que o diretor aprovou, sem nada vermelho.
     *
     * A CHAVE USADA FAZ PARTE DO RESULTADO, e não é enfeite: a `reference` casa por CADEIA DE
     * REABERTURA e é inferência mais fraca que a direta. Quem for conferir uma proposta errada na
     * tela precisa saber por qual porta ela entrou, e sem isso a investigação começa do zero.
     */
    const mapa = mapaDe([linha(VAGA_2, NOME_B, COD_B, true)]);

    const r = resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: String(VAGA_2) });

    expect(r).toMatchObject({ proposta: "COM_CODIGO", codCliente: COD_B, chave: "REFERENCE" });
  });

  it("o idVacancy VENCE a reference quando as duas casam com clientes DIFERENTES", () => {
    /*
     * ┌─ A REGRA QUE A AUDITORIA FIXOU, E ELA É SOBRE IDENTIDADE X BUSCA ─────────────────────────┐
     * │ A `reference` REPETE: 442 valores distintos em 470 vagas, 7 repetidos cobrindo 35 vagas      │
     * │ (medido), e por isso ela NUNCA identifica a LINHA da vaga, o que o comentário do ciclo já     │
     * │ dizia e continua valendo. Usá-la para PROCURAR o cliente é outra operação, e é permitida.    │
     * │                                                                                              │
     * │ MAS A ORDEM TEM DE SER FIXA. Hoje a divergência entre as duas chaves é ZERO (medido), então  │
     * │ este teste não corrige dado: ele impede que a ordem EMERJA da iteração de um `Map`, que muda  │
     * │ com a ordem das linhas da planilha. Sem ele, o mesmo par passaria a propor clientes           │
     * │ diferentes em dias diferentes, e a tela de revisão mostraria resposta instável sem motivo.    │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: inverter a ordem dos dois ramos (fica verde em tudo, menos aqui).
     */
    const mapa = mapaDe([linha(VAGA_1, NOME_A, COD_A, true), linha(VAGA_2, NOME_B, COD_B, true)]);

    const r = resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: String(VAGA_2) });

    expect(r).toMatchObject({ codCliente: COD_A, chave: "ID_VACANCY" });
  });

  it("a chave normaliza dos DOIS lados: planilha com espaço casa com vaga sem espaço", () => {
    /*
     * DEFEITO QUE PEGA, e é o mais fácil de escrever errado: normalizar na CONSTRUÇÃO e esquecer na
     * CONSULTA, ou o contrário. Metade da normalização é pior que nenhuma, porque o teste da
     * normalização passa isolado (seção 1 verde) e o casamento continua falhando.
     *
     * MUTANTE QUE ISTO MATA: `mapa.get(String(reference))` em vez de `mapa.get(normalizar(...))`.
     */
    const mapa = mapaDe([linha(" 900002 ", NOME_B, COD_B, true)]);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: "900002" })).toMatchObject({
      proposta: "COM_CODIGO",
      codCliente: COD_B,
    });
  });

  it("não casou NADA: não propõe, e não inventa (§A.5)", () => {
    /*
     * REGRA 3 DO REQUISITO, e é ela que protege o comportamento de hoje: 158 vagas continuam caindo na
     * revisão sem proposta, exatamente como caem agora.
     *
     * MUTANTE QUE ISTO MATA: qualquer `?? primeiroClienteDoMapa`, qualquer "cliente padrão", qualquer
     * `[...mapa.values()][0]` de conveniência. Numa proposta de cliente isso não é palpite ruim: é
     * uma resposta pronta na tela, com cara de trabalho feito, para alguém confirmar em lote.
     */
    const r = resolverClienteDaVaga(mapaDe([linha(VAGA_1, NOME_A, COD_A, true)]), {
      idVacancy: 999999,
      reference: "888888",
    });

    expect(r).toMatchObject({ proposta: "NENHUMA", motivo: "NAO_CASOU" });
  });

  it("vaga sem nenhuma chave utilizável é SEM_CHAVE, e isso é distinto de NÃO CASOU", () => {
    /*
     * POR QUE OS DOIS MOTIVOS SÃO SEPARADOS: "a planilha não tem esta vaga" é insumo para o time
     * (alguém preenche a linha lá); "a vaga chegou sem chave" é defeito da leitura do ATS, e o
     * conserto é de código. Um motivo só mistura as duas conversas, e a primeira tem 158 linhas, então
     * a segunda desaparece dentro dela.
     */
    const r = resolverClienteDaVaga(mapaDe([linha(VAGA_1, NOME_A, COD_A, true)]), {
      idVacancy: 0,
      reference: "Vaga interna",
    });

    expect(r).toMatchObject({ proposta: "NENHUMA", motivo: "SEM_CHAVE" });
  });

  it("linha sem NOME de cliente não cria entrada nenhuma", () => {
    /*
     * MUTANTE QUE ISTO MATA: criar a entrada sem conferir o cliente, o que faria a vaga "resolver para
     * nada" com `proposta` preenchida. O chamador que confia no campo deixa de registrar que aquela
     * vaga precisa de gente, e ela some da fila sem ter sido resolvida.
     */
    const mapa = mapaDe([linha(VAGA_1, null), linha(VAGA_2, "   ")]);

    for (const id of [VAGA_1, VAGA_2]) {
      expect(resolverClienteDaVaga(mapa, { idVacancy: id, reference: null })).toMatchObject({
        proposta: "NENHUMA",
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. OS DOIS CASOS DA TELA, E A PROPOSTA NÃO CONFIRMADA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("proposta COM código e proposta SÓ NOME são casos distintos", () => {
  it("os casos que eu afirmo são EXATAMENTE os do vocabulário, e são DOIS", () => {
    /*
     * POR QUE ISTO NÃO É TAUTOLOGIA: o que se afirma é a CARDINALIDADE. Um terceiro caso
     * (`COM_CNPJ`, `PROVAVEL`, o que a próxima frente inventar) entra no `shared-types` sem nada
     * quebrar, e a tela passa a ter um estado que NENHUM teste meu cobre: ninguém descobre que a
     * régua de "proposta não é confirmação" não vale para ele. Aqui o terceiro caso quebra o
     * typecheck na declaração acima, e a contagem quebra este `it`.
     *
     * §A.6 de passagem: nenhum dos dois casos carrega dado pessoal (um é código de cliente, o outro
     * é razão social), e é por isso que os dois podem atravessar a rede e aparecer na tela.
     */
    expect(CASOS_QUE_EU_AFIRMO).toHaveLength(2);
    expect(ESTADOS_QUE_A_TELA_MOSTRA).toHaveLength(2);
    // E o estado NUNCA é o terceiro valor silencioso: não existe "proposta meio confirmada".
    expect(ESTADOS_QUE_A_TELA_MOSTRA).not.toContain("PARCIAL");
  });

  it("curadoria CONFIRMADA dá proposta com código", () => {
    expect(
      resolverClienteDaVaga(mapaDe([linha(VAGA_1, NOME_A, COD_A, true)]), {
        idVacancy: VAGA_1,
        reference: null,
      }),
    ).toMatchObject({ proposta: "COM_CODIGO", codCliente: COD_A, nomeCliente: NOME_A });
  });

  it("curadoria NÃO CONFIRMADA não dá código, e o NOME ainda vale", () => {
    /*
     * ┌─ A FRASE DO REQUISITO QUE É A REGRA INTEIRA: PROPOSTA NÃO É CONFIRMAÇÃO ──────────────────┐
     * │ A curadoria dos 95 nomes produz PALPITE (20 exatos, 27 por prefixo). Palpite não vira código │
     * │ de cliente, porque `cod_cliente` é o campo pelo qual a admissão é faturada e por onde a      │
     * │ régua documental e a pasta do Drive são escolhidas.                                          │
     * │                                                                                              │
     * │ E O NOME CONTINUA SENDO ENTREGUE, que é o ponto que o quadro medido revela: 154 das 470 vagas │
     * │ têm NOME e não têm código (59 dos 95 nomes não existem no catálogo da Admissão, incluindo as  │
     * │ 11 variantes de Gerdau). Suprimir o nome junto com o código jogaria fora a parte caríssima do │
     * │ trabalho, que é descobrir QUAL cliente é. A tela mostra dois casos; o código entrega dois.    │
     * │                                                                                              │
     * │ MUTANTE QUE ISTO MATA, e é o de UMA PALAVRA: `confirmado` ausente ou lido como verdadeiro. Os │
     * │ 47 palpites viram código na primeira volta da varredura, antes de ninguém olhar, e desfazer   │
     * │ exige saber quais vieram de palpite, informação que o `true` acabou de apagar.                │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const r = resolverClienteDaVaga(mapaDe([linha(VAGA_1, NOME_A, COD_A, false)]), {
      idVacancy: VAGA_1,
      reference: null,
    });

    expect(r).toMatchObject({ proposta: "SO_NOME", nomeCliente: NOME_A });
    // A ASSERÇÃO NEGATIVA É SOBRE O RESULTADO INTEIRO, e não sobre um campo: um `codCliente` guardado
    // em qualquer canto do objeto é um código que a tela pode mostrar e alguém pode confirmar em lote.
    expect(tudoQueSaiu(r)).not.toContain(COD_A);
  });

  it("nome sem nenhum palpite de código também é proposta SÓ NOME", () => {
    const r = resolverClienteDaVaga(mapaDe([linha(VAGA_1, "OMEGA TRANSPORTES", null, false)]), {
      idVacancy: VAGA_1,
      reference: null,
    });

    expect(r).toMatchObject({ proposta: "SO_NOME", nomeCliente: "OMEGA TRANSPORTES" });
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. A AMBIGUIDADE: ZERO HOJE, E O CÓDIGO NÃO PODE SUPOR ISSO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("um código apontando para DOIS clientes não propõe, e não escolhe um", () => {
  it("dois clientes distintos no mesmo código: AMBIGUO, e nunca o primeiro nem o último", () => {
    /*
     * REGRA 5 DO REQUISITO. Hoje é zero, e a auditoria lembrou por que isso não autoriza supor: o
     * zero é a fotografia de uma planilha que o time edita DURANTE O DIA, e isso foi provado nesta
     * frente (apareceu uma linha nova entre a cópia da manhã e a leitura da tarde).
     *
     * MUTANTE QUE ISTO MATA, e é o NATURAL: `Map<string, string>` com `set` repetido. Ele não tem nem
     * um `if` para auditar, é a ESTRUTURA DE DADO que escolhe, e ela escolhe O ÚLTIMO, isto é, a ordem
     * das linhas da planilha. A tela passaria a propor clientes diferentes conforme alguém reordena a
     * planilha, e a instabilidade não teria autor.
     */
    const mapa = mapaDe([linha(VAGA_1, NOME_A, COD_A, true), linha(VAGA_1, NOME_B, COD_B, true)]);

    const r = resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null });

    expect(r).toMatchObject({ proposta: "NENHUMA", motivo: "AMBIGUO" });
    expect(tudoQueSaiu(r)).not.toContain(COD_A);
    expect(tudoQueSaiu(r)).not.toContain(COD_B);
  });

  it("a MESMA linha repetida NÃO é ambiguidade: é o FORMATO da planilha", () => {
    /*
     * ┌─ O DEFEITO MAIS CARO DESTA SEÇÃO, E ELE SÓ APARECE NA ESCALA REAL ───────────────────────┐
     * │ A planilha tem 3.533 LINHAS para cerca de 470 vagas (medido): a linha é por candidato, não   │
     * │ por vaga. Logo código repetido é o NORMAL, e não a exceção.                                  │
     * │                                                                                              │
     * │ MUTANTE QUE ISTO MATA: detectar ambiguidade por CONTAGEM DE LINHAS (`vistos > 1`) em vez de   │
     * │ por CLIENTES DISTINTOS. Ele passa em todo teste de duas linhas e, na planilha real, marca     │
     * │ QUASE TODA CHAVE como ambígua: a cobertura cai de 312 para perto de zero, e o sintoma é "o    │
     * │ de/para não resolve nada", indistinguível de credencial errada ou planilha vazia.             │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const mapa = mapaDe([
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(" 900001", NOME_A, COD_A, true),
      linha(VAGA_1, NOME_A, COD_A, true),
    ]);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null })).toMatchObject({
      proposta: "COM_CODIGO",
      codCliente: COD_A,
    });
  });

  it("linha SEM cliente ao lado de uma COM cliente não cria ambiguidade", () => {
    /*
     * DEFEITO QUE PEGA: ausência não é uma segunda opinião. Com muitas linhas por vaga, uma célula de
     * cliente em branco apagaria o de/para daquela vaga inteira, e o motivo registrado seria
     * "ambíguo", que manda o time procurar uma contradição que não existe.
     *
     * MUTANTE QUE ISTO MATA: juntar os clientes num `Set` antes de peneirar vazio e nulo.
     */
    const mapa = mapaDe([
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(VAGA_1, null),
      linha(VAGA_1, "  "),
    ]);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null })).toMatchObject({
      proposta: "COM_CODIGO",
    });
  });

  it("o mesmo cliente escrito com caixa e espaço diferentes é UM cliente", () => {
    /*
     * DEFEITO QUE PEGA: a planilha é digitada por várias pessoas. `"alfa servicos ltda "` e
     * `"ALFA SERVICOS LTDA"` são o mesmo cliente, e tratá-los como dois produz ambiguidade FANTASMA,
     * que é o pior falso positivo: ESCONDE uma proposta correta e manda alguém conferir uma
     * contradição inexistente.
     *
     * MUTANTE QUE ISTO MATA: comparar o nome cru em vez do normalizado.
     */
    const mapa = mapaDe([
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(VAGA_1, ` ${NOME_A.toLowerCase()} `, COD_A, true),
    ]);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null })).toMatchObject({
      proposta: "COM_CODIGO",
    });
  });

  it("a ambiguidade de UMA chave não contamina as outras", () => {
    /*
     * DEFEITO QUE PEGA: a reação natural a dado contraditório é desistir do lote. Desistir do mapa
     * inteiro por uma linha digitada errada entregaria zero de 312, de novo com o sintoma genérico de
     * "não resolve nada".
     *
     * MUTANTE QUE ISTO MATA: lançar exceção ao detectar ambiguidade, ou devolver mapa vazio.
     */
    const mapa = mapaDe([
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(VAGA_1, NOME_B, COD_B, true),
      linha(VAGA_2, NOME_B, COD_B, true),
    ]);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null })).toMatchObject({
      proposta: "NENHUMA",
    });
    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_2, reference: null })).toMatchObject({
      proposta: "COM_CODIGO",
      codCliente: COD_B,
    });
  });

  it("chave primária AMBÍGUA não cai para a reference", () => {
    /*
     * ┌─ DECISÃO QUE EU CONGELEI, E ELA ESTÁ NA MINHA LISTA DE GAPS ─────────────────────────────┐
     * │ Com o `idVacancy` dizendo duas coisas, a planilha está ERRADA sobre esta vaga. Resolver pela │
     * │ cadeia de reabertura nesse estado é usar a chave FRACA para contornar a contradição que a    │
     * │ chave FORTE acabou de revelar, e a proposta gravada fica indistinguível de um casamento      │
     * │ limpo.                                                                                      │
     * │                                                                                             │
     * │ SE O DIRETOR DECIDIR O CONTRÁRIO, é UMA LINHA para mudar aqui, e esse é o ponto: a decisão   │
     * │ fica ESCRITA, em vez de emergir do encadeamento dos `if`.                                    │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const mapa = mapaDe([
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(VAGA_1, NOME_B, COD_B, true),
      linha(VAGA_2, NOME_B, COD_B, true),
    ]);

    expect(
      resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: String(VAGA_2) }),
    ).toMatchObject({ proposta: "NENHUMA", motivo: "AMBIGUO" });
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 5. O RESUMO: O QUE FOI DESCARTADO É CONTADO, E O VALOR CRU NÃO SAI
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o descarte não é silencioso, e a contagem não carrega o conteúdo", () => {
  /** O canário: uma marca que não existe em lugar nenhum, procurada no resumo inteiro. */
  const CANARIO = "CANARIO-NAO-PODE-SAIR-9z9z9z";

  it("malformado, família interna e vazio são contados SEPARADAMENTE", () => {
    /*
     * ┌─ BLOQUEIO 3 DA AUDITORIA: DESCARTE EM SILÊNCIO É PERDA QUE NINGUÉM MEDE ─────────────────┐
     * │ Sem contagem, a diferença entre "a planilha não cobre estas vagas" e "a leitura está jogando │
     * │ linha fora" é INVISÍVEL, e as duas se parecem muito: nos dois casos a vaga cai na revisão.  │
     * │ O molde é o `etapasNaoMapeadas` do mesmo ciclo, que já existe por essa razão.                │
     * │                                                                                             │
     * │ E OS TRÊS SÃO AÇÕES DIFERENTES: malformado é linha para o time consertar na planilha;        │
     * │ família interna é vaga do EA que nunca vai casar e não é erro de ninguém; vazio é o normal.   │
     * │ Um contador só junta as três e não aciona nenhuma.                                           │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `continue` sem somar, que é a linha que qualquer um escreve primeiro.
     */
    const { resumo } = de([
      linha("Vaga interna", NOME_A, COD_A, true),
      linha("#N/D", NOME_A, COD_A, true),
      linha("SL00000049", NOME_A, COD_A, true),
      linha("", NOME_A, COD_A, true),
      linha(VAGA_1, NOME_A, COD_A, true),
    ]);

    expect(resumo).toMatchObject({ malformados: 2, codigosInternos: 1, vazios: 1, chaves: 1 });
  });

  it("a ambiguidade também é contada", () => {
    const { resumo } = de([
      linha(VAGA_1, NOME_A, COD_A, true),
      linha(VAGA_1, NOME_B, COD_B, true),
      linha(VAGA_2, NOME_B, COD_B, true),
    ]);

    expect(resumo).toMatchObject({ ambiguos: 1 });
  });

  it("O RESUMO NÃO CARREGA NENHUM VALOR CRU DA PLANILHA", () => {
    /*
     * ┌─ §A.6, E ESTE É O TESTE QUE IMPEDE A CORREÇÃO ERRADA DO TESTE ACIMA ─────────────────────┐
     * │ Pedida a contagem, o reflexo é entregar a LISTA ("para o time saber QUAIS consertar"), e a   │
     * │ lista vai para o log do ciclo, que é permanente e está FORA do alcance do `aplicarRetencao`. │
     * │ A coluna é TEXTO LIVRE digitado por gente, e nesta casa texto livre do ATS JÁ CHEGOU COM     │
     * │ NOME DE PESSOA DENTRO: é o achado R1 do `seguranca`, que originou `marcaDeChaveExterna`.     │
     * │                                                                                             │
     * │ O CAMINHO PERMITIDO, se a lista for necessária, é a MARCA COM SAL que já existe, nunca o     │
     * │ valor em claro. Aqui eu afirmo a parte que não depende dessa decisão: o cru não sai.         │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `resumo.malformadosVistos.push(String(l.codigo))`.
     */
    const { resumo } = de([
      linha(`Vaga interna ${CANARIO}`, NOME_A, COD_A, true),
      linha(VAGA_1, `${NOME_A} ${CANARIO}`, COD_A, true),
    ]);

    expect(tudoQueSaiu(resumo)).not.toContain(CANARIO);
  });

  it("todo contador é NÚMERO, e nenhum campo do resumo é texto livre", () => {
    /*
     * A FECHADURA ESTRUTURAL do teste acima: o canário prova que AQUELE valor não saiu; esta prova
     * que não existe CAMPO por onde sair. Um resumo com campo de texto é o convite para a próxima
     * frente pendurar ali "só o primeiro exemplo, para facilitar".
     */
    const { resumo } = de([linha("Vaga interna", NOME_A, COD_A, true), linha(VAGA_1, NOME_A)]);

    for (const [campo, valor] of Object.entries(resumo)) {
      expect(typeof valor, `o resumo tem campo não numérico: ${campo}`).toBe("number");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 6. O CATÁLOGO DE CLIENTES: FAIL-CLOSED É NULO MAIS CONTAGEM, NUNCA EXCEÇÃO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("código que o catálogo do EA não tem não vira proposta com código", () => {
  it("degrada para SÓ NOME e conta, sem lançar", () => {
    /*
     * ┌─ BLOQUEIO 5 DA AUDITORIA, E O DANO É PERDA DE INGESTÃO ──────────────────────────────────┐
     * │ `vagas.cod_cliente` tem FK para `clientes` (`drizzle/0082_as_central_de_vagas.sql:36`). Um  │
     * │ código que a curadoria conheceu e o catálogo não tem MAIS (cliente inativado, código         │
     * │ recadastrado) derrubaria o insert da vaga de 30 em 30 minutos, e A VAGA PARARIA DE ENTRAR:   │
     * │ a frente de PREENCHIMENTO viraria perda de INGESTÃO, que é muito pior do que não propor.     │
     * │                                                                                             │
     * │ VALE MESMO COM A PROPOSTA FORA DA COLUNA: a tela oferece confirmar, o caminho humano escreve │
     * │ `cod_cliente`, e a FK recusa na cara de quem clicou. Conferir aqui é o que impede a tela de  │
     * │ prometer o que o banco não aceita.                                                          │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `throw` quando o código não está no catálogo, que é o fail-closed
     * ERRADO, e derruba a varredura inteira por causa de uma linha de planilha.
     */
    const { mapa, resumo } = de(
      [linha(VAGA_1, NOME_A, "CLI-TESTE-QUE-NAO-EXISTE", true)],
      CATALOGO,
    );

    const r = resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null });

    expect(r).toMatchObject({ proposta: "SO_NOME", nomeCliente: NOME_A });
    expect(tudoQueSaiu(r)).not.toContain("CLI-TESTE-QUE-NAO-EXISTE");
    expect(resumo).toMatchObject({ clientesForaDoCatalogo: 1 });
  });

  it("catálogo VAZIO não derruba nada, e não propõe código nenhum", () => {
    /*
     * DEFEITO QUE PEGA: a leitura do catálogo falha (banco lento, consulta trocada) e devolve lista
     * vazia. Um código de proposta sobrevivendo a isso proporia o que o banco não tem; uma exceção
     * pararia a varredura. O certo é a degradação: 158 propostas com código viram 158 propostas só com
     * nome, e a tela continua útil.
     */
    const { mapa } = de([linha(VAGA_1, NOME_A, COD_A, true)], []);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null })).toMatchObject({
      proposta: "SO_NOME",
    });
  });

  it("o catálogo é conferido sem distinguir caixa e espaço", () => {
    /*
     * MUTANTE QUE ISTO MATA: comparar com `includes` cru sobre valor não normalizado. `cod_cliente` é
     * digitado em dois lugares diferentes (curadoria e catálogo), e um espaço no fim transformaria
     * 158 propostas com código em 158 só com nome, sem nada falhar e sem ninguém entender por quê.
     */
    const { mapa } = de([linha(VAGA_1, NOME_A, ` ${COD_A.toLowerCase()} `, true)], CATALOGO);

    expect(resolverClienteDaVaga(mapa, { idVacancy: VAGA_1, reference: null })).toMatchObject({
      proposta: "COM_CODIGO",
      codCliente: COD_A,
    });
  });
});
