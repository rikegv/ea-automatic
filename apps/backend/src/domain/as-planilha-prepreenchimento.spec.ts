import { describe, expect, it } from "vitest";
import type { VagaNatureza } from "@ea/shared-types";
import {
  agregarPrePreenchimentoPorCodigo,
  cargoDaPlanilha,
  codigoDeLinhaDeServicoDaPlanilha,
  dataDaPlanilha,
  naturezaDaPlanilha,
  normalizarTextoDaPlanilha,
  temAlgoAPrePreencher,
  CAMPOS_DO_PRE_PREENCHIMENTO,
  PROCEDENCIA_DA_PLANILHA,
  type CargoDoCatalogo,
  type CatalogosDoPrePreenchimento,
  type LinhaDaPlanilhaParaPrePreenchimento,
} from "./as-planilha-prepreenchimento";

/**
 * ─ A RÉGUA DO PRÉ-PREENCHIMENTO, MEDIDA COMO FUNÇÃO PURA ───────────────────────────────────────
 *
 * ┌─ O QUE ESTE ARQUIVO PROVA, E A ORDEM É A DA IMPORTÂNCIA ─────────────────────────────────────┐
 * │ 1. A ABSTENÇÃO É POR CAMPO: ambiguidade no tipo de vaga NÃO apaga a célula do mesmo código.    │
 * │    É a régua dura da frente, e é a única que, quebrada, destrói dado bom em silêncio.          │
 * │ 2. O QUE NÃO CASA SE ABSTÉM, e nunca cai no rótulo mais parecido nem em `cast`.                 │
 * │ 3. O CARGO AMBÍGUO NO CATÁLOGO SE ABSTÉM (nome normalizado colidindo com dois `cargo_id`), e   │
 * │    NUNCA escolhe "o primeiro", que é o padrão errado do `cargoPorTexto` da ingestão.            │
 * │ 4. AS DATAS SÃO LITERAIS, inclusive vencidas, e nenhuma delas olha o relógio.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: TODO dado aqui é SINTÉTICO. Códigos de vaga na faixa 9xxxxx, cargos inventados, nenhum CPF,
 * nenhum nome de pessoa, nenhum salário, nenhum nome real de cliente.
 *
 * §A.46: o teste não traz CONTEÚDO REAL da planilha. Os textos de "Tipo de Vaga" e de "Célula" são
 * valores de VOCABULÁRIO (rótulo de classificação, não célula de pessoa), e são exatamente o de/para
 * que o diretor aprovou, então eles PRECISAM estar escritos aqui: é a tabela de tradução que o teste
 * existe para travar.
 */

/* Os dois cargos que NÃO colidem, e o par que COLIDE depois de normalizado (acento e pontuação). */
const CARGO_A = "11111111-1111-4111-8111-111111111111";
const CARGO_B = "22222222-2222-4222-8222-222222222222";
const COLIDE_1 = "33333333-3333-4333-8333-333333333333";
const COLIDE_2 = "44444444-4444-4444-8444-444444444444";
const CARGO_INATIVO = "55555555-5555-4555-8555-555555555555";

const CARGOS: readonly CargoDoCatalogo[] = [
  { id: CARGO_A, nome: "Analista De Teste Sintetico", ativo: true },
  { id: CARGO_B, nome: "Tecnico De Teste Sintetico Noturno", ativo: true },
  /*
   * A COLISÃO MEDIDA EM PRODUÇÃO, REPRODUZIDA SINTETICAMENTE: 5 nomes do catálogo de cargos
   * normalizam para a MESMA chave e apontam para `cargo_id` diferentes. Aqui, acento e pontuação são
   * o que separa os dois nomes, e a normalização os junta.
   */
  { id: COLIDE_1, nome: "Operador Sintetico", ativo: true },
  { id: COLIDE_2, nome: "Óperador-Sintético", ativo: true },
  { id: CARGO_INATIVO, nome: "Cargo Sintetico Fora De Circulacao", ativo: false },
];

const LINHAS_SERVICO = [
  { id: 1, codigo: "PONTUAIS_ESTRATEGICAS" },
  { id: 2, codigo: "RPO_BPO" },
  { id: 3, codigo: "ALTO_VOLUME" },
  { id: 4, codigo: "SOUFAST" },
  { id: 5, codigo: "ONESHOT" },
];

const CATALOGOS: CatalogosDoPrePreenchimento = { cargos: CARGOS, linhasServico: LINHAS_SERVICO };

/** Uma linha sintética da planilha. Tudo nulo por padrão: ausência é o estado normal. */
function linha(
  over: Partial<LinhaDaPlanilhaParaPrePreenchimento> = {},
): LinhaDaPlanilhaParaPrePreenchimento {
  return {
    codigo: "900001",
    tipoVaga: null,
    celulaAtendimento: null,
    cargo: null,
    dataAbertura: null,
    slaEntrega: null,
    ...over,
  };
}

const um = (linhas: LinhaDaPlanilhaParaPrePreenchimento[], chave = "900001") => {
  const r = agregarPrePreenchimentoPorCodigo(linhas, CATALOGOS).get(chave);
  if (r === undefined) throw new Error(`o código ${chave} não saiu do agregador`);
  return r;
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. O DE/PARA DO TIPO DE VAGA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("naturezaDaPlanilha: o de/para aprovado pelo diretor, e nada além dele", () => {
  it("os SETE valores medidos na planilha casam, com acento e com caixa qualquer", () => {
    const esperado: [string, VagaNatureza][] = [
      ["Efetiva", "EFETIVA"],
      ["Temporária", "TEMPORARIA"],
      ["Reposição Efetiva", "REPOSICAO_EFETIVA"],
      ["Estágio", "ESTAGIO"],
      ["Terceira", "TERCEIRA"],
      ["Reposição Temporária", "REPOSICAO_TEMPORARIA"],
      ["Vaga Banco", "VAGA_BANCO"],
    ];
    for (const [bruto, alvo] of esperado) {
      expect(naturezaDaPlanilha(bruto), bruto).toBe(alvo);
      /* A planilha é digitada por gente: caixa e espaço sobrando não podem derrubar o casamento. */
      expect(naturezaDaPlanilha(`  ${bruto.toUpperCase()}  `), bruto).toBe(alvo);
      expect(naturezaDaPlanilha(bruto.toLowerCase()), bruto).toBe(alvo);
    }
  });

  it("`Reposição Temporária` NÃO cai em `REPOSICAO`, e é por isso que o enum ganhou o valor novo", () => {
    /*
     * MUTANTE QUE ISTO MATA: mapear "reposicao temporaria" para `REPOSICAO` "porque é quase isso". O
     * diretor decidiu criar o par (migration 0145) justamente para não achatar: achatar perde a
     * classificação que uma pessoa já fez na fonte, e ninguém recupera a distinção depois.
     */
    expect(naturezaDaPlanilha("Reposição Temporária")).toBe("REPOSICAO_TEMPORARIA");
    expect(naturezaDaPlanilha("Reposição Efetiva")).toBe("REPOSICAO_EFETIVA");
  });

  it("o que NÃO está no de/para se ABSTÉM, e nunca cai no rótulo mais parecido", () => {
    /*
     * ┌─ O DEFEITO QUE ISTO IMPEDE É O PIOR DA FRENTE ──────────────────────────────────────────┐
     * │ "Efetivo", "Reposição" e "Temp" PARECEM com valores do enum, e um casamento aproximado    │
     * │ aceitaria os três. O valor chega na tela com cara de trabalho feito, e quem confere uma   │
     * │ fila confirma em lote o que já está escrito. Vazio é conferível; errado não é.             │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    for (const bruto of ["Efetivo", "Reposição", "Temp", "CLT", "PJ", "Xpto", "???", ""]) {
      expect(naturezaDaPlanilha(bruto), bruto).toBeNull();
    }
    expect(naturezaDaPlanilha(null)).toBeNull();
    expect(naturezaDaPlanilha(undefined)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. O DE/PARA DA CÉLULA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("codigoDeLinhaDeServicoDaPlanilha: os seis valores medidos, e CINCO destinos", () => {
  it("`PONTUAIS` e `ESTRATÉGICA` vão para o MESMO destino, e isso é a decisão do diretor", () => {
    expect(codigoDeLinhaDeServicoDaPlanilha("PONTUAIS")).toBe("PONTUAIS_ESTRATEGICAS");
    expect(codigoDeLinhaDeServicoDaPlanilha("ESTRATÉGICA")).toBe("PONTUAIS_ESTRATEGICAS");
  });

  it("os separadores da planilha não atrapalham: `PROJETOS | ONE SHOT` e `RPO / BPO`", () => {
    /*
     * A pontuação vira espaço na normalização, então barra, pipe e hífen deixam de distinguir. É
     * tolerância no RECONHECIMENTO, nunca na aceitação: a lista continua fechada.
     */
    expect(codigoDeLinhaDeServicoDaPlanilha("PROJETOS | ONE SHOT")).toBe("ONESHOT");
    expect(codigoDeLinhaDeServicoDaPlanilha("Projetos / One Shot")).toBe("ONESHOT");
    expect(codigoDeLinhaDeServicoDaPlanilha("RPO / BPO")).toBe("RPO_BPO");
    expect(codigoDeLinhaDeServicoDaPlanilha("rpo-bpo")).toBe("RPO_BPO");
    expect(codigoDeLinhaDeServicoDaPlanilha("ALTO VOLUME")).toBe("ALTO_VOLUME");
    expect(codigoDeLinhaDeServicoDaPlanilha("SOUFAST")).toBe("SOUFAST");
  });

  it("célula desconhecida se ABSTÉM", () => {
    for (const bruto of ["PONTUAL", "ESTRATEGIA", "PROJETOS", "BPO", "", null]) {
      expect(codigoDeLinhaDeServicoDaPlanilha(bruto), String(bruto)).toBeNull();
    }
  });

  it("código que o CATÁLOGO não tem se abstém: o `id` nunca é inventado", () => {
    /*
     * MUTANTE QUE ISTO MATA: devolver um `id` fixo, ou o primeiro do catálogo, quando o código
     * canônico não está lá. É o fail-closed do bloqueio 5 da auditoria, de graça: o catálogo entra
     * por argumento, então a ausência é visível.
     */
    const semPontuais = { cargos: CARGOS, linhasServico: [{ id: 9, codigo: "SOUFAST" }] };
    const r = agregarPrePreenchimentoPorCodigo([linha({ celulaAtendimento: "PONTUAIS" })], semPontuais);
    expect(r.get("900001")?.valores.linhaServicoId).toBeNull();
    expect(r.get("900001")?.veredictos.linhaServico).toBe("NAO_CASOU");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O CARGO: A DISCIPLINA DO CLIENTE, REUSADA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("cargoDaPlanilha: exato vence prefixo, piso do prefixo, AMBÍGUO SE ABSTÉM", () => {
  it("o nome exato casa, tolerando acento, caixa e pontuação", () => {
    expect(cargoDaPlanilha("Analista De Teste Sintetico", CARGOS)).toEqual({
      cargoId: CARGO_A,
      grau: "EXATO",
    });
    expect(cargoDaPlanilha("ANALISTA DE TESTE SINTÉTICO", CARGOS)?.cargoId).toBe(CARGO_A);
  });

  it("DOIS `cargo_id` para o MESMO nome normalizado: ABSTÉM-SE, e não escolhe o primeiro", () => {
    /*
     * ┌─ O PADRÃO ERRADO QUE ISTO PROÍBE TEM NOME E ENDEREÇO ────────────────────────────────────┐
     * │ `cargoPorTexto` (`as/ingestao-pandape/ingestao-repositorio.ts`) resolve o empate com       │
     * │ `order by nome limit 1`, isto é ESCOLHE SOZINHO, em silêncio, pela ordem da consulta. O    │
     * │ `cargo_id` decide a régua documental `(cod_cliente + cargo)` e o nome da pasta do           │
     * │ prontuário no Drive, e arquivamento no Drive não se desfaz (§A.33).                         │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: qualquer `find`/`[0]` sobre os candidatos. E a ORDEM é invertida no
     * segundo `expect` de propósito: resultado que muda com a ordem do catálogo é resultado que muda
     * quando alguém cadastra um cargo novo, e isso não aparece em teste que use uma ordem só.
     */
    expect(cargoDaPlanilha("Operador Sintetico", CARGOS)).toBeNull();
    expect(cargoDaPlanilha("Operador Sintetico", [...CARGOS].reverse())).toBeNull();
  });

  it("cargo INATIVO se abstém, e continua CONTANDO para a ambiguidade", () => {
    /*
     * A ORDEM DAS DUAS COISAS É A REGRA. Tirar o inativo do catálogo ANTES de casar faria um par
     * colidente virar casamento único, e o módulo passaria a propor um cargo que o catálogo esconde.
     */
    expect(cargoDaPlanilha("Cargo Sintetico Fora De Circulacao", CARGOS)).toBeNull();
    const comColisaoEscondida: CargoDoCatalogo[] = [
      { id: CARGO_A, nome: "Repetido Sintetico", ativo: true },
      { id: CARGO_B, nome: "Repetido Sintetico", ativo: false },
    ];
    expect(cargoDaPlanilha("Repetido Sintetico", comColisaoEscondida)).toBeNull();
  });

  it("o PREFIXO é calculado mas NÃO preenche: o veredicto é `SO_PROPOSTA`", () => {
    /*
     * A régua do cliente, decidida pelo diretor: só o EXATO preenche; o PREFIXO fica como proposta, e
     * a procedência distingue o grau. O cargo não tem coluna de proposta, então o prefixo é
     * registrado no veredicto e o valor NÃO é escrito. Achatar exato com prefixo é o que se proíbe.
     */
    expect(cargoDaPlanilha("Tecnico De Teste Sintetico", CARGOS)).toEqual({
      cargoId: CARGO_B,
      grau: "PREFIXO",
    });
    const r = um([linha({ cargo: "Tecnico De Teste Sintetico" })]);
    expect(r.valores.cargoId, "o prefixo virou valor gravado").toBeNull();
    expect(r.veredictos.cargo).toBe("SO_PROPOSTA");
  });

  it("o sufixo depois do hífen NÃO é cortado: `Analista - Noturno` não casa com `Analista`", () => {
    /*
     * ┌─ O QUE SE REUSA É A DISCIPLINA, NÃO A NORMALIZAÇÃO DE NOME DE CLIENTE ──────────────────┐
     * │ `normalizarNomeDeClienteParaCasamento` corta `(anotação)` e o sufixo de CIDADE depois de  │
     * │ " - ", e aquelas duas etapas existem porque razão social traz `(filial)` e `- Campinas`.   │
     * │ Aplicadas a CARGO, fariam "Analista De Teste Sintetico - Noturno" casar EXATO com o cargo  │
     * │ "Analista De Teste Sintetico", que é OUTRO cargo. Normalizar antes torna as duas inertes.  │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: passar o texto CRU para `proporCasamentoDeCliente`.
     */
    const casado = cargoDaPlanilha("Analista De Teste Sintetico - Noturno", CARGOS);
    expect(casado?.grau, "o sufixo foi cortado e o casamento virou EXATO").not.toBe("EXATO");
  });

  it("nome curto não vira prefixo de nada: o piso do prefixo é herdado junto", () => {
    /* `Ana` é prefixo de um monte de cargo, e prefixo curto é coincidência de alfabeto. */
    expect(cargoDaPlanilha("Ana", CARGOS)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. AS DATAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("dataDaPlanilha: `DD/MM/AAAA` literal, inclusive vencida, e nada mais", () => {
  it("converte para ISO, com e sem zero à frente", () => {
    expect(dataDaPlanilha("01/02/2026")).toBe("2026-02-01");
    expect(dataDaPlanilha("1/2/2026")).toBe("2026-02-01");
    expect(dataDaPlanilha(" 31/12/2025 ")).toBe("2025-12-31");
  });

  it("DATA VENCIDA ENTRA, e é a decisão do diretor (97 medidas no passado)", () => {
    /*
     * MUTANTE QUE ISTO MATA: filtrar por futuro, ou trocar por `hoje` "para não ficar estranho na
     * tela". O campo registra o que a planilha diz; inventar prazo é a tela afirmar um compromisso
     * que ninguém assumiu. E a função é PURA: não há relógio a consultar para decidir isso.
     */
    expect(dataDaPlanilha("15/03/2019")).toBe("2019-03-15");
  });

  it("dia que não existe no calendário se ABSTÉM, em vez de derrubar a instrução", () => {
    /*
     * Sem esta guarda o Postgres recusaria o `::date`, a escrita cairia no `catch` que protege a
     * ingestão e a vaga ficaria SEM NENHUM dos cinco campos, de 30 em 30 minutos, em silêncio.
     */
    for (const bruto of ["31/02/2026", "30/02/2026", "00/01/2026", "01/13/2026", "32/01/2026"]) {
      expect(dataDaPlanilha(bruto), bruto).toBeNull();
    }
  });

  it("formato que não é o da planilha se ABSTÉM, e nada é adivinhado", () => {
    for (const bruto of ["2026-02-01", "01-02-2026", "fev/2026", "01/02/26", "", "x", null]) {
      expect(dataDaPlanilha(bruto), String(bruto)).toBeNull();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 5. A RÉGUA DURA: A ABSTENÇÃO É POR CAMPO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a abstenção é POR CAMPO, e nunca por linha", () => {
  it("o mesmo código com DOIS tipos de vaga abstém o TIPO e PRESERVA a célula e o cargo", () => {
    /*
     * ┌─ A REGRA INTEIRA DESTA FRENTE, EM UM TESTE ──────────────────────────────────────────────┐
     * │ Medido na planilha real: 37 códigos dão dois tipos, 29 duas células, 49 dois cargos, e os  │
     * │ três conjuntos são DIFERENTES. Colapsar a abstenção para a linha inteira jogaria fora 29   │
     * │ células boas por causa de 37 tipos contraditórios.                                         │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: um `if (algumCampoAmbiguo) return nada;`.
     */
    const r = um([
      linha({
        tipoVaga: "Efetiva",
        celulaAtendimento: "PONTUAIS",
        cargo: "Analista De Teste Sintetico",
        dataAbertura: "01/02/2026",
      }),
      linha({
        tipoVaga: "Temporária",
        celulaAtendimento: "PONTUAIS",
        cargo: "Analista De Teste Sintetico",
        dataAbertura: "01/02/2026",
      }),
    ]);

    expect(r.valores.natureza, "o tipo contraditório foi escolhido").toBeNull();
    expect(r.veredictos.natureza).toBe("AMBIGUO_NA_PLANILHA");
    expect(r.valores.linhaServicoId, "a ambiguidade do tipo apagou a célula").toBe(1);
    expect(r.valores.cargoId, "a ambiguidade do tipo apagou o cargo").toBe(CARGO_A);
    expect(r.valores.dataAbertura).toBe("2026-02-01");
  });

  it("a ambiguidade de CADA UM dos cinco campos não contamina os outros quatro", () => {
    /*
     * A FORMA FORTE do teste acima, campo a campo: sem ela, uma implementação que só protegesse o
     * caso do tipo passaria verde e a contaminação voltaria pelo lado da data.
     */
    const base = {
      tipoVaga: "Efetiva",
      celulaAtendimento: "PONTUAIS",
      cargo: "Analista De Teste Sintetico",
      dataAbertura: "01/02/2026",
      slaEntrega: "15/03/2026",
    };
    const conflitos: Record<string, Partial<LinhaDaPlanilhaParaPrePreenchimento>> = {
      natureza: { tipoVaga: "Estágio" },
      linhaServico: { celulaAtendimento: "ALTO VOLUME" },
      cargo: { cargo: "Tecnico De Teste Sintetico Noturno" },
      dataAbertura: { dataAbertura: "02/02/2026" },
      dataLimite: { slaEntrega: "16/03/2026" },
    };
    for (const campo of CAMPOS_DO_PRE_PREENCHIMENTO) {
      const r = um([linha(base), linha({ ...base, ...conflitos[campo] })]);
      expect(r.veredictos[campo], `${campo} não se absteve`).toBe("AMBIGUO_NA_PLANILHA");
      for (const outro of CAMPOS_DO_PRE_PREENCHIMENTO) {
        if (outro === campo) continue;
        expect(
          r.veredictos[outro],
          `a ambiguidade de ${campo} contaminou ${outro}`,
        ).toBe("PREENCHIDO");
      }
    }
  });

  it("DOIS TEXTOS que apontam para o MESMO destino NÃO são ambiguidade", () => {
    /*
     * A contagem de distintos é sobre o ALVO, não sobre o texto. Consequência medida e desejada:
     * "PONTUAIS" (128 linhas) e "ESTRATÉGICA" (16) vão para a mesma linha de serviço, então o código
     * que tenha as duas concorda consigo mesmo.
     *
     * MUTANTE QUE ISTO MATA: contar distintos sobre o texto cru, que abster-ia 16 códigos bons.
     */
    const r = um([
      linha({ celulaAtendimento: "PONTUAIS" }),
      linha({ celulaAtendimento: "ESTRATÉGICA" }),
    ]);
    expect(r.valores.linhaServicoId).toBe(1);
    expect(r.veredictos.linhaServico).toBe("PREENCHIDO");
  });

  it("AUSÊNCIA NÃO É DISCORDÂNCIA: célula vazia entre linhas iguais não abstém o campo", () => {
    /*
     * ┌─ A ASSIMETRIA DELIBERADA DO AGREGADOR ──────────────────────────────────────────────────┐
     * │ A planilha é editada à mão e célula em branco é o estado normal de centenas de linhas (868 │
     * │ só na coluna de código, medido). Tratar o vazio como uma segunda opinião faria UMA célula  │
     * │ em branco entre 40 linhas iguais abster o campo inteiro, e o pré-preenchimento nasceria    │
     * │ quase todo vazio sem ninguém entender por quê.                                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * O MESMO VALE PARA O TEXTO QUE NÃO CASA: "Xpto" é ausência de informação reconhecível, não uma
     * opinião contrária.
     */
    const r = um([
      linha({ tipoVaga: "Efetiva" }),
      linha({ tipoVaga: null }),
      linha({ tipoVaga: "   " }),
      linha({ tipoVaga: "Xpto" }),
    ]);
    expect(r.valores.natureza).toBe("EFETIVA");
    expect(r.veredictos.natureza).toBe("PREENCHIDO");
  });

  it("`AUSENTE` e `NAO_CASOU` são veredictos DIFERENTES, e os dois se abstêm", () => {
    /*
     * No banco os dois viram o MESMO nulo, e é por isso que o veredicto existe: "a planilha não
     * disse" é lacuna do time, "a planilha disse algo que não reconheço" é de/para a corrigir. Sem a
     * distinção, pré-preenchimento que PAROU de chegar fica indistinguível de planilha sem a coluna.
     */
    expect(um([linha({})]).veredictos.natureza).toBe("AUSENTE");
    expect(um([linha({ tipoVaga: "Xpto" })]).veredictos.natureza).toBe("NAO_CASOU");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 6. A CHAVE, E O QUE NÃO ENTRA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a chave do mapa é o CÓDIGO normalizado, a mesma do espelho", () => {
  it("o espaço à frente medido na planilha (`' 900001'`) casa com a mesma chave", () => {
    const mapa = agregarPrePreenchimentoPorCodigo(
      [linha({ codigo: " 900001", tipoVaga: "Efetiva" })],
      CATALOGOS,
    );
    expect(mapa.get("900001")?.valores.natureza).toBe("EFETIVA");
  });

  it("linha SEM código legível é DESCARTADA, e não vira um balde", () => {
    /*
     * MUTANTE QUE ISTO MATA: agrupar as linhas sem código sob `""` ou `null`. O código é a única
     * chave que liga a linha à vaga, e um balde faria 868 linhas de clientes diferentes agregarem
     * juntas, produzindo ambiguidade falsa (ou, pior, um valor único vindo de outra vaga).
     */
    const mapa = agregarPrePreenchimentoPorCodigo(
      [
        linha({ codigo: null, tipoVaga: "Efetiva" }),
        linha({ codigo: "   ", tipoVaga: "Estágio" }),
        linha({ codigo: "900002", tipoVaga: "Terceira" }),
      ],
      CATALOGOS,
    );
    expect([...mapa.keys()]).toEqual(["900002"]);
    expect(mapa.get("900002")?.valores.natureza).toBe("TERCEIRA");
  });

  it("cada código é agregado SOZINHO: a contradição de um não alcança o outro", () => {
    const mapa = agregarPrePreenchimentoPorCodigo(
      [
        linha({ codigo: "900001", tipoVaga: "Efetiva" }),
        linha({ codigo: "900001", tipoVaga: "Estágio" }),
        linha({ codigo: "900002", tipoVaga: "Efetiva" }),
      ],
      CATALOGOS,
    );
    expect(mapa.get("900001")?.valores.natureza).toBeNull();
    expect(mapa.get("900002")?.valores.natureza).toBe("EFETIVA");
  });

  it("planilha vazia devolve mapa vazio, e não lança", () => {
    expect(agregarPrePreenchimentoPorCodigo([], CATALOGOS).size).toBe(0);
  });
});

describe("as bordas do módulo", () => {
  it("`temAlgoAPrePreencher` só é verdade quando algum dos cinco tem valor", () => {
    /* É esta pergunta que impede o escritor de mandar instrução ao banco sem nada a escrever. */
    expect(temAlgoAPrePreencher(um([linha({})]).valores)).toBe(false);
    expect(temAlgoAPrePreencher(um([linha({ slaEntrega: "15/03/2026" })]).valores)).toBe(true);
  });

  it("a procedência tem UM valor, e ele é o do CHECK do banco", () => {
    /*
     * MUTANTE QUE ISTO MATA: um literal digitado à mão no escritor (`PLANILHA_VIVA`, `SPREADSHEET`)
     * que o CHECK recusa. O banco fingido dos testes do escritor passaria, e a escrita falharia em
     * produção, de 30 em 30 minutos, engolida pelo `catch` que protege a ingestão.
     */
    expect(PROCEDENCIA_DA_PLANILHA).toBe("PLANILHA");
  });

  it("os CINCO campos, e são estes cinco: a cardinalidade é a superfície de auditoria", () => {
    expect([...CAMPOS_DO_PRE_PREENCHIMENTO].sort()).toEqual(
      ["cargo", "dataAbertura", "dataLimite", "linhaServico", "natureza"].sort(),
    );
  });

  it("a normalização não distingue acento, caixa nem pontuação, e colapsa espaço", () => {
    expect(normalizarTextoDaPlanilha("  Reposição   Temporária!  ")).toBe("reposicao temporaria");
    expect(normalizarTextoDaPlanilha(null)).toBe("");
  });
});
