/**
 * ─ A BUSCA DA CENTRAL DE AJUDA, POR TEXTO E SEM I.A ────────────────────────────────────────────
 *
 * Decisão do diretor: a busca do manual é por texto. Nada de I.A aqui, nem de índice remoto: o
 * conteúdo é um punhado de objetos tipados que já vivem no pacote da tela, e procurar neles é
 * varrer uma lista.
 *
 * ┌─ O QUE DECIDE SE ESTA BUSCA PRESTA É A NORMALIZAÇÃO, E NÃO O ALGORITMO ──────────────────────┐
 * │ Quem está travado numa tela digita com pressa e sem acento: escreve "demissao", "beneficio",  │
 * │ "declinio", "aso". Comparar as duas pontas cruas devolveria "nada encontrado" para palavras    │
 * │ que estão escritas no artigo, e "nada encontrado" ensina a pessoa a não usar a busca de novo.  │
 * │ Por isso os DOIS lados passam pelo mesmo `normalizar`: minúsculas e sem diacrítico.            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O SEGUNDO PONTO É O CAMPO `termos`, E ELE É SINÔNIMO, NÃO RESUMO ──────────────────────────┐
 * │ O artigo do exame se chama "Anexar O ASO", e a pessoa procura por "atestado", "médico",       │
 * │ "clínica", "exame admissional". Nenhuma dessas palavras está no título, e todas levam ao      │
 * │ mesmo lugar. Um manual que só responde ao próprio vocabulário não é achado, e por isso os     │
 * │ `termos` pesam mais que o resumo: eles são a pergunta da pessoa, escrita como ela faz.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ PREFIXO DE PALAVRA, E NÃO PEDAÇO SOLTO ────────────────────────────────────────────────────┐
 * │ A pessoa vê o resultado enquanto digita, então "libera" precisa achar "Liberar" e "atest"     │
 * │ precisa achar "atestado". Por outro lado, casar pedaço no MEIO da palavra faria duas letras    │
 * │ quaisquer acharem meio manual, então a régua é prefixo de PALAVRA, nas duas pontas.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TODOS OS TERMOS DA CONSULTA PRECISAM BATER (E lógico). Procurar "exame apto" tem de devolver o
 * artigo que fala das duas coisas, e não tudo o que fala de uma.
 */

import type { Artigo } from "./tipos";

/** Minúsculas e sem acento, dos dois lados da comparação. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Quebra a consulta em termos, já normalizados, sem vazios. */
export function termosDaConsulta(consulta: string): string[] {
  return normalizar(consulta)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function palavras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * ─ O RÓTULO DE CONTROLE É QUEBRADO DIFERENTE, E A RAZÃO É A PONTUAÇÃO DENTRO DA PALAVRA ────────
 *
 * Rótulo de tela carrega ponto e barra no MEIO do nome: "Analisar Com I.A", "N/A", "Ver Régua".
 * Quebrando pelo mesmo `palavras` de todo o resto, "I.A" viraria os tokens "i" e "a", e quem digita
 * "ia", que é como a pessoa escreve, não acharia nada. Por isso aqui a quebra é pelo ESPAÇO e a
 * pontuação é removida DENTRO de cada pedaço: "I.A" vira "ia", e o prefixo volta a funcionar.
 *
 * Isto não vale para os outros campos de propósito: eles são texto corrido, onde o ponto separa
 * frase e juntar as duas pontas criaria palavra que ninguém escreveu.
 *
 * ┌─ UMA NORMALIZAÇÃO SÓ, E ELA MORA AQUI PORQUE AQUI ELA JÁ EXISTIA ───────────────────────────┐
 * │ O DETECTOR DE CONTROLE ÓRFÃO (`cobertura.ts`) compara o rótulo que está DESENHADO na tela com  │
 * │ o rótulo que o artigo DECLAROU, e ele precisa da mesma régua: "Analisar Com I.A" na tela e     │
 * │ "Analisar com I.A." no artigo são o MESMO botão. Escrever aquela comparação lá dentro criaria  │
 * │ uma SEGUNDA normalização, e a divergência entre as duas teria o pior sintoma possível: a busca  │
 * │ acha o artigo pelo rótulo e o detector acusa o mesmo rótulo como lacuna, ou o contrário.        │
 * │                                                                                               │
 * │ Então `normalizarRotulo` é a peça, ela é exportada, e `palavrasDeControle` passou a ser um      │
 * │ derivado dela em vez de uma cópia. Ela fica AQUI, e não em `cobertura.ts`, porque `normalizar`  │
 * │ já mora aqui e a dependência contrária faria ciclo.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function normalizarRotulo(rotulo: string): string {
  return normalizar(rotulo)
    .split(/\s+/)
    .map((pedaco) => pedaco.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean)
    .join(" ");
}

function palavrasDeControle(rotulos: string[]): string[] {
  return rotulos.flatMap((rotulo) => normalizarRotulo(rotulo).split(" ")).filter(Boolean);
}

/**
 * ─ O RANKING, DO CAMPO MAIS FORTE PARA O MAIS FRACO ────────────────────────────────────────────
 *
 * Título, sinônimo, resumo, gesto de passo, corpo. A ordem importa porque a primeira linha é a
 * única que a maioria clica: uma palavra citada de passagem no corpo de um artigo longo não pode
 * ficar acima do artigo que tem aquela palavra no título.
 */
export type CampoDeBusca = "titulo" | "controles" | "termos" | "resumo" | "passos" | "corpo";

const CAMPOS: CampoDeBusca[] = ["titulo", "controles", "termos", "resumo", "passos", "corpo"];

/**
 * ─ ONDE `controles` ENTRA NO RANKING, E POR QUÊ ────────────────────────────────────────────────
 *
 * Entre o TÍTULO e os SINÔNIMOS, e as duas fronteiras são deliberadas.
 *
 * ACIMA DE `termos` porque quem digita o rótulo literal não está tateando: está lendo a palavra
 * desenhada na tela, com o mouse em cima dela, e quer aquele controle especificamente. Sinônimo é
 * chute de vocabulário ("atestado" para o ASO) e acerta um assunto; rótulo é citação e acerta um
 * botão. Entre o artigo que CHAMA aquilo de algo parecido e o artigo que ENSINA exatamente aquele
 * botão, é o segundo que a pessoa quer.
 *
 * ABAIXO do TÍTULO porque o título é o assunto inteiro do artigo, e o controle é um gesto dentro
 * dele. Um artigo pode citar "Salvar" num passo intermediário sem ser sobre salvar nada; com peso
 * maior que o do título, o rótulo genérico repetido em dezenas de telas passaria a mandar na lista, e
 * o artigo que se CHAMA "Validar Por Humano" cairia abaixo de outro que só clica naquele botão de
 * passagem. Rótulo genérico é comum; título é único.
 */
const PESO: Record<CampoDeBusca, number> = {
  titulo: 100,
  controles: 85,
  termos: 70,
  resumo: 50,
  passos: 30,
  corpo: 20,
};

/**
 * O ÍNDICE: o artigo mais as palavras de cada campo dele, quebradas uma vez só. O "corpo" junta o
 * que não é título, sinônimo, resumo nem gesto: pré-requisitos, "Se Der Errado" e regras, que é
 * justamente onde o time procura quando travou.
 */
export type ItemIndice = {
  artigo: Artigo;
  palavras: Record<CampoDeBusca, string[]>;
  /** As palavras dos campos que ENSINAM o assunto. Ver `ENSINAM` logo abaixo. */
  ensinam: string[];
};

/**
 * ─ O QUE ENSINA O ASSUNTO, E O QUE SÓ MENCIONA ─────────────────────────────────────────────────
 *
 * ┌─ O DEFEITO QUE ESTA LISTA CONSERTA, MEDIDO NA TELA ──────────────────────────────────────────┐
 * │ Procurar "auditoria" devolvia "Anexar O ASO Na Aba Exame", que é um artigo sobre EXAME. A busca │
 * │ não errou: a palavra está escrita lá, no detalhe de um passo ("não sai de lá porque a auditoria │
 * │ andou") e em duas regras ("o Cadastro só abre depois que a Auditoria e o Exame fecham").        │
 * │ MENCIONAR NÃO É ENSINAR, e apresentar menção como resultado é pior que não achar nada: o "nada  │
 * │ encontrado" dizia a verdade, e a menção PROMETE o que não entrega. A pessoa abre, lê doze passos │
 * │ sobre ASO e conclui que o manual é ruim.                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENSINAM o assunto: o TÍTULO (o artigo é sobre aquilo), os `termos` (a pessoa chama aquilo assim), o
 * RESUMO (a promessa do artigo), os `controles` (o artigo ensina aquele botão) e o GESTO do passo (o
 * artigo manda fazer aquilo). SÓ MENCIONAM: o DETALHE do passo, os pré-requisitos, o "se der errado" e
 * as regras, que são o contexto ao redor e citam o sistema inteiro.
 *
 * O detalhe fica FORA de propósito, e é ele o caso do diretor: detalhe é a explicação do porquê, e é
 * ali que o artigo bom cita as outras frentes. Com 196 peças, artigo bom cita assunto alheio o tempo
 * todo, então tratar citação como ensino faz o manual mentir em escala.
 *
 * ISTO NÃO MEXE NA RÉGUA DE CASAMENTO NEM NOS PESOS: nada aqui muda o que a busca acha, nem a
 * pontuação de nada. É uma segunda leitura do MESMO casamento, para a tela poder dizer de onde ele
 * veio.
 */
function palavrasQueEnsinam(artigo: Artigo): string[] {
  return [
    ...palavras(artigo.titulo),
    ...palavras(artigo.termos.join(" ")),
    ...palavras(artigo.resumo),
    ...palavras(artigo.passos.map((p) => p.gesto).join(" ")),
    ...palavrasDeControle(artigo.passos.flatMap((p) => p.controles ?? [])),
  ];
}

export function indexar(artigos: Artigo[]): ItemIndice[] {
  return artigos.map((artigo) => ({
    artigo,
    ensinam: palavrasQueEnsinam(artigo),
    palavras: {
      titulo: palavras(artigo.titulo),
      // O RÓTULO LITERAL DE CADA CONTROLE dos passos. Sem esta linha, o artigo ENSINA o botão e não
      // é ACHADO por ele: "Revalidar" num passo do meio não está no título, nem no resumo, nem nos
      // sinônimos, e era o campo declarado que ninguém consumia.
      controles: palavrasDeControle(artigo.passos.flatMap((p) => p.controles ?? [])),
      termos: palavras(artigo.termos.join(" ")),
      resumo: palavras(artigo.resumo),
      passos: palavras(artigo.passos.map((p) => `${p.gesto} ${p.detalhe ?? ""}`).join(" ")),
      corpo: palavras(
        [
          ...artigo.preRequisitos,
          ...artigo.seDerErrado.flatMap((s) => [s.sintoma, s.acao]),
          ...artigo.regras,
        ].join(" "),
      ),
    },
  }));
}

export type ResultadoBusca = {
  artigo: Artigo;
  /** Quanto maior, mais provável que seja este o artigo procurado. */
  pontos: number;
  /** A frase que a tela mostra embaixo do título, escolhida por onde bateu. */
  trecho: string;
  /**
   * VERDADEIRO quando alguma palavra da consulta só foi achada no contexto do artigo (detalhe,
   * pré-requisito, "se der errado", regra) e em NENHUM campo que ensina. A tela marca esse resultado
   * como menção e o separa dos que ensinam. Ver `palavrasQueEnsinam`.
   */
  mencaoIncidental: boolean;
};

/**
 * Procura e ordena. Consulta vazia devolve lista vazia de propósito: a tela mostra o sumário
 * inteiro quando ninguém digitou nada, e um "resultado" sem pergunta seria ruído.
 */
export function buscar(consulta: string, indice: ItemIndice[]): ResultadoBusca[] {
  const termos = termosDaConsulta(consulta);
  if (termos.length === 0) return [];

  const achados: ResultadoBusca[] = [];

  for (const item of indice) {
    let pontos = 0;
    let bateuTudo = true;
    const soMencionados: string[] = [];

    for (const termo of termos) {
      let melhor = 0;
      for (const campo of CAMPOS) {
        if (item.palavras[campo].some((p) => p.startsWith(termo))) {
          melhor = Math.max(melhor, PESO[campo]);
        }
      }
      if (melhor === 0) {
        bateuTudo = false;
        break;
      }
      pontos += melhor;
      /**
       * BASTA UMA PALAVRA SÓ MENCIONADA para o resultado ser menção, e não é rigor gratuito: quem
       * digita "auditoria exame" quer as duas coisas ENSINADAS no mesmo lugar. O artigo que ensina o
       * exame e só cita a auditoria responde metade da pergunta, e apresentá-lo como resposta cheia é
       * a mesma promessa vazia do caso de uma palavra.
       */
      if (!item.ensinam.some((p) => p.startsWith(termo))) soMencionados.push(termo);
    }

    if (!bateuTudo) continue;
    /**
     * O TRECHO DA MENÇÃO É O DA PALAVRA MENCIONADA, e não o da palavra ensinada. Em "auditoria
     * exame", o resumo do artigo do ASO casa por "exame" e seria escolhido, deixando na tela uma
     * frase sem "auditoria" dentro, que é exatamente a frase que não explica nada. Mostrando a linha
     * da palavra mencionada, o grifo e a tag contam a mesma história.
     */
    // UM resultado por artigo, mesmo quando a palavra bate em quatro campos dele.
    achados.push({
      artigo: item.artigo,
      pontos,
      trecho: trechoDoResultado(item.artigo, soMencionados.length > 0 ? soMencionados : termos),
      mencaoIncidental: soMencionados.length > 0,
    });
  }

  /**
   * ─ A MENÇÃO NÃO É PUNIDA NA PONTUAÇÃO, ELA VAI PARA OUTRO BLOCO NA TELA ──────────────────────
   *
   * Decisão, e o argumento é mensurável: o PESO NÃO RESOLVE ISSO SOZINHO. Gesto e detalhe dividem o
   * mesmo peso `passos` (30), então a menção escrita num detalhe EMPATA com o artigo que ensina
   * aquilo no gesto, e o empate é desfeito pelo slug, em ordem alfabética. Ou seja: hoje a menção
   * pode aparecer ACIMA de quem ensina por causa da primeira letra do slug, que é sorteio.
   *
   * Descontar pontos da menção também não serve: o desconto teria de ser grande o bastante para
   * vencer 100 pontos de título, e aí ele deixa de ser ajuste de relevância e passa a ser uma
   * segunda régua escondida dentro da primeira, com dois números para manter em acordo.
   *
   * Então a ordenação por pontos continua INTACTA (ela é a autoridade sobre relevância, e os testes
   * do `tester` provam que ela é monotônica), e a honestidade vira EIXO SEPARADO: a tela mostra os
   * que ensinam, depois um bloco de menções, cada bloco na ordem de pontos. Duas perguntas
   * diferentes, duas respostas diferentes, nenhuma delas adivinhando a outra.
   *
   * Empate resolvido pelo slug, para a lista não dançar entre duas digitadas iguais.
   */
  return achados.sort(
    (a, b) => b.pontos - a.pontos || a.artigo.slug.localeCompare(b.artigo.slug, "pt-BR"),
  );
}

/**
 * A frase de apoio do resultado. Prefere o RESUMO quando ele fala do que foi procurado; senão, o
 * passo que fala, porque mostrar a linha que bateu é o que responde "por que este artigo apareceu".
 * Nunca devolve vazio: resultado sem frase nenhuma parece resultado errado.
 *
 * ┌─ A FRASE É O TRECHO QUE BATEU, ATÉ O FIM DA LISTA DE CAMPOS ─────────────────────────────────┐
 * │ Antes a varredura parava no "se der errado", e o casamento vindo de uma REGRA ou de um          │
 * │ PRÉ-REQUISITO caía no fim da função e devolvia o resumo do artigo, que não tem a palavra        │
 * │ procurada dentro. Era esse o resultado que o diretor abriu: título de ASO, frase de ASO, e a    │
 * │ palavra "auditoria" em nenhum dos dois. A tela grifa o que bateu, então a frase tem de ser a    │
 * │ que bateu, e não a mais bonita do artigo.                                                      │
 * │                                                                                               │
 * │ Pelo mesmo motivo o passo devolve o DETALHE quando foi o detalhe que casou: devolver o gesto    │
 * │ nesse caso mostra uma linha sem a palavra, e a pessoa não tem como saber por que aquilo veio.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function trechoDoResultado(artigo: Artigo, termos: string[]): string {
  const casa = (texto: string) => {
    const lista = palavras(texto);
    return termos.some((t) => lista.some((p) => p.startsWith(t)));
  };
  // O rótulo bate pela régua dele (pontuação removida dentro da palavra), senão o resultado achado
  // por "ia" mostraria uma frase que não explica por que ele apareceu.
  const casaControle = (rotulos?: string[]) => {
    if (!rotulos || rotulos.length === 0) return false;
    const lista = palavrasDeControle(rotulos);
    return termos.some((t) => lista.some((p) => p.startsWith(t)));
  };
  if (casa(artigo.resumo) && artigo.resumo.trim()) return artigo.resumo;
  /**
   * QUEM ACHOU PELO RÓTULO QUER SABER O QUE AQUELE CONTROLE FAZ, então a frase de apoio é o GESTO do
   * passo que usa o controle, e não o resumo do artigo: é ela que responde "o que faz este botão".
   */
  const pelaAcao = artigo.passos.find((p) => casa(p.gesto) || casaControle(p.controles));
  if (pelaAcao) return pelaAcao.gesto;
  const peloDetalhe = artigo.passos.find((p) => casa(p.detalhe ?? ""));
  if (peloDetalhe?.detalhe) return peloDetalhe.detalhe;
  const erro = artigo.seDerErrado.find((s) => casa(s.sintoma) || casa(s.acao));
  if (erro) return casa(erro.sintoma) ? erro.sintoma : erro.acao;
  const regra = artigo.regras.find(casa);
  if (regra) return regra;
  const preRequisito = artigo.preRequisitos.find(casa);
  if (preRequisito) return preRequisito;
  return artigo.resumo.trim() || artigo.titulo;
}

export type PedacoRealcado = { texto: string; forte: boolean };

/**
 * Parte o texto nos trechos que bateram, para a tela grifar o que a pessoa digitou. Devolve pedaços
 * em vez de marcação de propósito: a tela monta os elementos, e nada aqui vira HTML injetado.
 *
 * O GRIFO SEGUE A MESMA RÉGUA DA BUSCA, prefixo de palavra. Grifar o miolo de uma palavra que a
 * busca não casou faria a tela explicar errado por que aquele resultado apareceu.
 *
 * O MAPA DE ÍNDICES existe porque a normalização não é 1 para 1: um caractere acentuado pode render
 * duas unidades no NFD, e recortar o original pelo índice do normalizado destacaria a sílaba
 * vizinha. Cada letra normalizada guarda de qual letra original ela veio.
 */
export function realcar(texto: string, termos: string[]): PedacoRealcado[] {
  const limpos = termos.filter(Boolean);
  if (limpos.length === 0) return [{ texto, forte: false }];

  let norm = "";
  const mapa: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    for (const letra of normalizar(texto[i])) {
      norm += letra;
      mapa.push(i);
    }
  }

  const marcado = new Array<boolean>(texto.length).fill(false);
  const inicioDePalavra = (i: number) => i === 0 || !/[a-z0-9]/.test(norm[i - 1]);

  for (const termo of limpos) {
    let de = norm.indexOf(termo);
    while (de !== -1) {
      if (inicioDePalavra(de)) {
        for (let i = de; i < de + termo.length && i < mapa.length; i++) marcado[mapa[i]] = true;
      }
      de = norm.indexOf(termo, de + 1);
    }
  }

  const pedacos: PedacoRealcado[] = [];
  let atual = "";
  let forte = marcado[0] ?? false;
  for (let i = 0; i < texto.length; i++) {
    if (marcado[i] === forte) {
      atual += texto[i];
    } else {
      if (atual) pedacos.push({ texto: atual, forte });
      atual = texto[i];
      forte = marcado[i];
    }
  }
  if (atual) pedacos.push({ texto: atual, forte });
  return pedacos;
}
