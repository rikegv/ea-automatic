import type { MotivoDeRecusaDaChaveDaPlanilha } from "@ea/shared-types";

/**
 * ─ O DE/PARA DE CLIENTE DA VAGA: DUAS CHAVES, FAIL-CLOSED, E ABSTENÇÃO NO EMPATE ───────────────
 *
 * ┌─ O QUE ESTE ARQUIVO PRODUZ É **PROPOSTA**, E PROPOSTA NÃO DECIDE NADA ───────────────────────┐
 * │ Nada aqui escreve `vagas.cod_cliente`, e nenhum consumidor deste resultado tem como alcançá-la. │
 * │ A auditoria do mapa VETOU o desenho que escrevia a coluna, e a medição que sustenta o veto é    │
 * │ esta: `candidatos.service.ts` lê `vagas.cod_cliente` com `innerJoin` e SEM FILTRO DE STATUS, e  │
 * │ o valor desce para `cod_cliente` da pré-admissão. Dali ele decide a RÉGUA DOCUMENTAL e o NOME   │
 * │ DA PASTA do prontuário no Drive. Cliente errado é CONTROLADOR errado (§A.6), e arquivamento no  │
 * │ Drive não se desfaz (§A.33).                                                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FONTE É SUJA, E É SUJA DE UM JEITO MEDIDO (01/10/2026) ───────────────────────────────────┐
 * │ 2.663 das 3.532 linhas úteis têm código; 861 códigos numéricos distintos depois de normalizar; │
 * │ o espaço à frente existe de verdade (`' 1587726'`); 147 valores não numéricos (`SL00000049`,    │
 * │ "Vaga interna", "-"); 868 linhas SEM código, que não são erro de ninguém.                       │
 * │                                                                                                │
 * │ NADA DISSO É IGNORADO EM SILÊNCIO (bloqueio 3 da auditoria): cada classe tem CONTADOR PRÓPRIO,  │
 * │ porque as ações são diferentes. Malformado é linha para o time consertar na planilha; família   │
 * │ interna é vaga do EA que nunca vai casar e não é erro de ninguém; vazio é o normal de 868        │
 * │ linhas. Um contador só junta as três e não aciona nenhuma, e um contador que grita todo dia é um │
 * │ contador que ninguém lê, inclusive no dia em que ele estiver certo.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6: O RESUMO CONTA, E NUNCA NOMEIA ───────────────────────────────────────────────────────┐
 * │ Pedida a contagem, o reflexo é entregar a LISTA ("para o time saber QUAIS consertar"), e a      │
 * │ lista termina no log do ciclo, que é permanente e está FORA do alcance do `aplicarRetencao`. A  │
 * │ coluna é TEXTO LIVRE digitado por gente, e nesta casa texto livre de ATS JÁ CHEGOU COM NOME DE  │
 * │ PESSOA DENTRO (achado R1 do `seguranca`, que originou `marcaDeChaveExterna`). Então TODO campo   │
 * │ do resumo é NÚMERO: não é só que o valor não sai, é que não existe campo por onde sair.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOMÍNIO PURO: sem Nest, sem banco, sem rede, sem relógio.
 */

// ── 1. A CLASSIFICAÇÃO DA CHAVE ────────────────────────────────────────────────────────────────

/**
 * O QUE AQUELA CÉLULA É, em lista FECHADA de quatro.
 *
 * `VAZIA` É SEPARADA DE `MALFORMADO`, e a distinção é de CONTABILIDADE, que é como esta frente vai
 * ser julgada: são 868 linhas em branco medidas, e contá-las como "linhas para consertar" faria o
 * resumo gritar todo dia por um estado que é rotina.
 */
export type ClassificacaoDoCodigoDaPlanilha =
  | { tipo: "CHAVE"; chave: string }
  | { tipo: "CODIGO_INTERNO_EA" }
  | { tipo: "MALFORMADO" }
  | { tipo: "VAZIA" };

/**
 * A FAMÍLIA `SL...` É CÓDIGO INTERNO DO EA, E NÃO LIXO DE DIGITAÇÃO. Achado da auditoria:
 * `db/schema/tables.ts` registra, na própria coluna, que `vagas.codigo` carrega "o número do
 * Pandapé, OU a família `SL...`", isto é, código de vaga nascida DENTRO do EA.
 *
 * POR QUE ELA TEM MOTIVO SEPARADO, e não cai no "não numérico" genérico: quem vê `SL...` na planilha
 * e sabe que `vagas.codigo` também guarda `SL...` vai querer casar os dois. Isso seria uma TERCEIRA
 * CHAVE que ninguém desenhou, contra uma coluna REPETÍVEL de propósito e DIGITADA por gente, e
 * penduraria a vaga de um cliente no cliente de outro. O motivo nomeado transforma essa tentação
 * numa conversa, em vez de num commit.
 */
const FAMILIA_INTERNA_DO_EA = /^sl\d+$/i;

/**
 * SÓ CASA NÚMERO INTEIRO POSITIVO, SEM ZERO À FRENTE, e cada recusa abaixo tem um defeito atrás:
 *  . `0` passaria por qualquer "só dígitos" e viraria chave legítima, e duas linhas com `0` e
 *    clientes diferentes criariam ambiguidade FANTASMA numa chave que não existe;
 *  . `900001.0` e `900.001` são o que uma planilha produz quando a coluna é formatada como número.
 *    Adivinhar ("tira o ponto", "corta o decimal") é INVENTAR chave a partir de dado corrompido, e é
 *    assim que se chega a cliente errado sem violar a §A.5 na letra. Recusar é o fail-closed: a vaga
 *    cai na revisão, que é onde ela já cai hoje;
 *  . zero à frente não casaria com `String(idVacancy)` de nenhuma vaga de qualquer jeito, então
 *    aceitá-lo só criaria entrada de mapa que infla a cobertura relatada sem resolver vaga nenhuma.
 */
const CHAVE_DE_VAGA = /^[1-9]\d*$/;

/**
 * A CLASSIFICAÇÃO, e ela é a ÚNICA régua: `normalizarCodigoDeVaga` é definida EM TERMOS dela, de
 * propósito. Duas funções respondendo sobre a mesma coluna, cada uma com sua expressão regular, é
 * como nasce a divergência silenciosa: o mapa ganharia uma entrada que o resumo jura ter descartado,
 * e os dois lados continuariam verdes.
 *
 * O NÚMERO E O TEXTO DO NÚMERO VIRAM A MESMA CHAVE, e isso resolve um defeito concreto: o
 * `idVacancy` chega da API como NÚMERO e o da planilha chega como TEXTO. Mapa com chave numérica
 * consultado com texto não casa NUNCA, e o resultado seria zero vaga resolvida com o de/para
 * carregado e aparentemente correto.
 */
export function classificarCodigoDaPlanilha(valor: unknown): ClassificacaoDoCodigoDaPlanilha {
  if (valor === null || valor === undefined) return { tipo: "VAZIA" };
  if (typeof valor !== "string" && typeof valor !== "number") return { tipo: "MALFORMADO" };
  const texto = String(valor).trim();
  if (texto === "") return { tipo: "VAZIA" };
  if (FAMILIA_INTERNA_DO_EA.test(texto)) return { tipo: "CODIGO_INTERNO_EA" };
  if (!CHAVE_DE_VAGA.test(texto)) return { tipo: "MALFORMADO" };
  return { tipo: "CHAVE", chave: texto };
}

/** A chave, ou NULO. Devolve valor SE E SOMENTE SE a classificação é `CHAVE` (ver acima). */
export function normalizarCodigoDeVaga(valor: unknown): string | null {
  const c = classificarCodigoDaPlanilha(valor);
  return c.tipo === "CHAVE" ? c.chave : null;
}

/**
 * A TRADUÇÃO PARA O VOCABULÁRIO COMPARTILHADO (`MOTIVOS_DE_RECUSA_DA_CHAVE_DA_PLANILHA`).
 *
 * ELA MORA AQUI E NÃO NO RESUMO, porque o resumo é só número (ver o bloco do topo): quem precisa
 * nomear a recusa para a TELA, atrás do menu, pergunta a esta função. `VAZIA` não é recusa, é
 * ausência, e por isso devolve nulo.
 */
export function motivoDeRecusaDaChave(
  tipo: ClassificacaoDoCodigoDaPlanilha["tipo"],
): MotivoDeRecusaDaChaveDaPlanilha | null {
  if (tipo === "MALFORMADO") return "NAO_NUMERICO";
  if (tipo === "CODIGO_INTERNO_EA") return "FAMILIA_INTERNA_SL";
  return null;
}

// ── 2. O MAPA ──────────────────────────────────────────────────────────────────────────────────

/** Uma linha do de/para, já curada: o código da planilha, o nome, o palpite e se foi CONFIRMADO. */
export interface LinhaDoDeParaDeCliente {
  codigo: unknown;
  nomeCliente: string | null;
  codCliente: string | null;
  /** NUNCA assuma verdadeiro por ausência: palpite não confirmado não entrega código (ver abaixo). */
  confirmado: boolean;
}

/**
 * UMA ENTRADA DO MAPA. `ambigua` é a abstenção MATERIALIZADA: a entrada existe (a chave foi vista) e
 * não resolve, que é diferente de a chave não estar na planilha. As duas conversas são diferentes, e
 * misturá-las manda o time procurar uma contradição que não existe.
 */
export type EntradaDoDeParaDeCliente =
  | { ambigua: true }
  | {
      ambigua: false;
      nomeCliente: string;
      /** Só preenchido quando a curadoria foi CONFIRMADA **e** o código existe no catálogo do EA. */
      codCliente: string | null;
    };

export type MapaDeParaDeCliente = ReadonlyMap<string, EntradaDoDeParaDeCliente>;

/** TODO CAMPO É NÚMERO, e isso é estrutural (§A.6): não existe campo por onde o cru sair. */
export interface ResumoDoDeParaDeCliente {
  /** Quantas chaves distintas viraram entrada utilizável no mapa. */
  chaves: number;
  /** Texto que não é chave nem família conhecida. Linha para o time consertar na planilha. */
  malformados: number;
  /** Família `SL...`: vaga do EA, que nunca vai casar, e não é erro de ninguém. */
  codigosInternos: number;
  /** Célula em branco. É o normal de 868 linhas medidas. */
  vazios: number;
  /** Chaves em que a planilha diz DUAS coisas. Abstém-se, e conta. */
  ambiguos: number;
  /** Chaves cujo código confirmado não existe (mais) no catálogo do EA. Degradam para só nome. */
  clientesForaDoCatalogo: number;
}

/** O código do cliente, comparável: a curadoria e o catálogo são digitados em lugares diferentes. */
function chaveDeCliente(cod: string): string {
  return cod.trim().toUpperCase();
}

/**
 * O NOME, SÓ PARA COMPARAR. A planilha é digitada por VÁRIAS pessoas, e `"alfa servicos ltda "` e
 * `"ALFA SERVICOS LTDA"` são o MESMO cliente: tratá-los como dois produz ambiguidade FANTASMA, que é
 * o pior falso positivo possível, porque ESCONDE uma proposta correta.
 */
export function nomeComparavelDeCliente(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * AS LINHAS DA PLANILHA VIRANDO UM MAPA DE UMA ENTRADA POR CHAVE, com o resumo do que foi recusado.
 *
 * ┌─ O MUTANTE NATURAL DESTA FUNÇÃO É A PRÓPRIA ESTRUTURA DE DADO ───────────────────────────────┐
 * │ `Map<string, string>` com `set` repetido não tem nem um `if` para auditar: ele escolhe O         │
 * │ ÚLTIMO, isto é a ORDEM DAS LINHAS da planilha. A tela passaria a propor clientes diferentes     │
 * │ conforme alguém reordena a planilha, e a instabilidade não teria autor.                         │
 * │                                                                                                │
 * │ E A AMBIGUIDADE É POR CLIENTES DISTINTOS, NUNCA POR CONTAGEM DE LINHAS. A planilha tem 3.532    │
 * │ linhas para cerca de 470 vagas: a linha é por CANDIDATO, então código repetido é o NORMAL.      │
 * │ Detectar por `vistos > 1` passaria em todo teste de duas linhas e, na planilha real, marcaria   │
 * │ QUASE TODA CHAVE como ambígua, com o sintoma "o de/para não resolve nada", indistinguível de    │
 * │ credencial errada ou planilha vazia.                                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A AMBIGUIDADE DE UMA CHAVE NÃO CONTAMINA AS OUTRAS, e nada aqui LANÇA: desistir do lote por uma
 * linha digitada errada entregaria zero de 312, de novo com o sintoma genérico.
 *
 * O CÓDIGO É CONFERIDO CONTRA O CATÁLOGO ANTES DE PROPOR (bloqueio 5 da auditoria), e o fail-closed
 * é NULO MAIS CONTAGEM: um `throw` aqui derrubaria a varredura inteira por causa de uma linha de
 * planilha, e a frente de PREENCHIMENTO viraria perda de INGESTÃO. Catálogo vazio (consulta que
 * falhou) degrada 158 propostas com código para 158 só com nome, e a tela continua útil.
 */
export function montarMapaDePara(
  linhas: readonly LinhaDoDeParaDeCliente[],
  opcoes: { clientesDoCatalogo: readonly string[] },
): { mapa: MapaDeParaDeCliente; resumo: ResumoDoDeParaDeCliente } {
  const resumo: ResumoDoDeParaDeCliente = {
    chaves: 0,
    malformados: 0,
    codigosInternos: 0,
    vazios: 0,
    ambiguos: 0,
    clientesForaDoCatalogo: 0,
  };
  /** O catálogo indexado pela forma comparável, devolvendo o valor CANÔNICO (o do catálogo). */
  const catalogo = new Map<string, string>();
  for (const cod of opcoes.clientesDoCatalogo) {
    const k = chaveDeCliente(cod);
    if (k !== "" && !catalogo.has(k)) catalogo.set(k, cod.trim());
  }

  interface Acumulado {
    nomes: Map<string, string>;
    codigos: Map<string, string>;
    foraDoCatalogo: boolean;
  }
  const grupos = new Map<string, Acumulado>();

  for (const linha of linhas) {
    const classe = classificarCodigoDaPlanilha(linha.codigo);
    if (classe.tipo === "VAZIA") {
      resumo.vazios += 1;
      continue;
    }
    if (classe.tipo === "MALFORMADO") {
      resumo.malformados += 1;
      continue;
    }
    if (classe.tipo === "CODIGO_INTERNO_EA") {
      resumo.codigosInternos += 1;
      continue;
    }
    /*
     * NOME VAZIO NÃO CRIA ENTRADA E NÃO É UMA SEGUNDA OPINIÃO. Com muitas linhas por vaga, uma
     * célula de cliente em branco ao lado de uma preenchida apagaria o de/para daquela vaga inteira
     * se entrasse na contagem de clientes distintos, e o motivo registrado seria "ambíguo", que
     * manda o time procurar uma contradição que não existe.
     */
    const nome = (linha.nomeCliente ?? "").trim();
    if (nome === "") continue;

    const grupo = grupos.get(classe.chave) ?? {
      nomes: new Map<string, string>(),
      codigos: new Map<string, string>(),
      foraDoCatalogo: false,
    };
    if (!grupo.nomes.has(nomeComparavelDeCliente(nome))) grupo.nomes.set(nomeComparavelDeCliente(nome), nome);

    /*
     * PALPITE NÃO CONFIRMADO NEM É LIDO. O código só entra no grupo quando a curadoria foi
     * confirmada por gente, e é por isso que ele não aparece em NENHUM lugar do resultado da
     * resolução: um código guardado em qualquer canto do objeto é um código que a tela pode mostrar
     * e alguém pode confirmar em lote.
     */
    const cod = (linha.codCliente ?? "").trim();
    if (linha.confirmado && cod !== "") {
      const canonico = catalogo.get(chaveDeCliente(cod));
      if (canonico === undefined) grupo.foraDoCatalogo = true;
      else if (!grupo.codigos.has(chaveDeCliente(cod)))
        grupo.codigos.set(chaveDeCliente(cod), canonico);
    }
    grupos.set(classe.chave, grupo);
  }

  const mapa = new Map<string, EntradaDoDeParaDeCliente>();
  for (const [chave, grupo] of grupos) {
    if (grupo.nomes.size > 1 || grupo.codigos.size > 1) {
      resumo.ambiguos += 1;
      mapa.set(chave, { ambigua: true });
      continue;
    }
    if (grupo.foraDoCatalogo) resumo.clientesForaDoCatalogo += 1;
    const nomeCliente = [...grupo.nomes.values()][0];
    if (nomeCliente === undefined) continue;
    resumo.chaves += 1;
    mapa.set(chave, {
      ambigua: false,
      nomeCliente,
      codCliente: [...grupo.codigos.values()][0] ?? null,
    });
  }

  return { mapa, resumo };
}

// ── 3. A RESOLUÇÃO, COM AS DUAS CHAVES ─────────────────────────────────────────────────────────

/** Por qual chave a proposta casou. É parte do resultado, e não enfeite (ver abaixo). */
export type ChaveQueCasou = "ID_VACANCY" | "REFERENCE";

/**
 * POR QUE A PROPOSTA NÃO SAIU, em lista fechada, e os três motivos são AÇÕES diferentes:
 *  . `NAO_CASOU`: a planilha não tem esta vaga. 158 das 470, e o insumo é para o TIME (alguém
 *    preenche a linha lá). É o comportamento de hoje, preservado;
 *  . `SEM_CHAVE`: a vaga chegou sem chave utilizável. É defeito da LEITURA do ATS, e o conserto é de
 *    CÓDIGO. Um motivo só mistura as duas conversas, e a primeira tem 158 linhas, então a segunda
 *    desapareceria dentro dela;
 *  . `AMBIGUO`: a planilha diz duas coisas. Abstém-se, e conta.
 */
export type MotivoDeNaoPropor = "NAO_CASOU" | "SEM_CHAVE" | "AMBIGUO";

/**
 * A RESOLUÇÃO. SÃO DOIS CASOS DE PROPOSTA, e não um, e a tela precisa dos dois (medido): 158 das 470
 * vagas recebem proposta COM CÓDIGO e 154 recebem NOME SEM CÓDIGO, porque 59 dos 95 nomes não
 * existem no catálogo da Admissão, incluindo as 11 variantes de Gerdau, nenhuma cadastrada.
 *
 * SUPRIMIR O NOME JUNTO COM O CÓDIGO jogaria fora a parte caríssima do trabalho, que é descobrir
 * QUAL cliente é. Dizer "66% resolvido" misturaria os dois e a validação visual pareceria regressão.
 */
export type ResolucaoDoClienteDaVaga =
  | {
      proposta: "COM_CODIGO";
      codCliente: string;
      nomeCliente: string;
      chave: ChaveQueCasou;
      /** As duas chaves casaram com clientes DIFERENTES. Vale o id da vaga, e isto é CONTADO. */
      discordanciaEntreChaves: boolean;
    }
  | {
      proposta: "SO_NOME";
      nomeCliente: string;
      chave: ChaveQueCasou;
      discordanciaEntreChaves: boolean;
    }
  | { proposta: "NENHUMA"; motivo: MotivoDeNaoPropor };

/**
 * ─ `idVacancy` PRIMEIRO, `reference` DEPOIS, E A SEGUNDA SÓ COMO BUSCA ────────────────────────
 *
 * ┌─ VÁLIDA PARA CONSULTA, PROIBIDA COMO IDENTIDADE, e a distinção não é formal ──────────────────┐
 * │ A `reference` REPETE (442 valores distintos nas 470 abertas, 7 repetidos cobrindo 35 vagas), e │
 * │ por isso ela NUNCA identifica a LINHA da vaga: casar a vaga por ela juntaria vagas diferentes e │
 * │ mandaria candidatura para a vaga errada, o que é dano a dado de pessoa. O comentário do ciclo   │
 * │ que diz isso continua valendo inteiro.                                                          │
 * │                                                                                                │
 * │ BUSCAR O CLIENTE É OUTRA OPERAÇÃO, e é permitida: a `reference` é o id da vaga ANTERIOR da       │
 * │ cadeia de reabertura, e a cadeia é do mesmo cliente. Medido: ZERO divergência de cliente entre  │
 * │ as vagas que compartilham uma `reference`, e ZERO entre as duas chaves nas 263 que casam pelas   │
 * │ duas. Ela acrescenta 49 vagas, levando a cobertura de 263 para 312.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ORDEM É FIXA E EXPLÍCITA, e não emerge da iteração de um `Map`: o zero de divergência é ESTADO
 * de uma planilha viva (apareceu uma linha nova entre a cópia da manhã e a leitura da tarde), não
 * invariante. Sem a ordem escrita, o mesmo par proporia clientes diferentes em dias diferentes, e a
 * tela de revisão mostraria resposta instável sem motivo. A DISCORDÂNCIA É CONTADA, nunca descartada
 * em silêncio.
 *
 * CHAVE PRIMÁRIA AMBÍGUA NÃO CAI PARA A `reference`, e isto é decisão escrita: com o `idVacancy`
 * dizendo duas coisas, a planilha está ERRADA sobre esta vaga, e resolver pela cadeia de reabertura
 * nesse estado é usar a chave FRACA para contornar a contradição que a chave FORTE acabou de
 * revelar, deixando a proposta indistinguível de um casamento limpo.
 */
export function resolverClienteDaVaga(
  mapa: MapaDeParaDeCliente,
  chaves: { idVacancy: number | null; reference: string | null },
): ResolucaoDoClienteDaVaga {
  const chaveId = normalizarCodigoDeVaga(chaves.idVacancy);
  const chaveRef = normalizarCodigoDeVaga(chaves.reference);
  if (chaveId === null && chaveRef === null) return { proposta: "NENHUMA", motivo: "SEM_CHAVE" };

  const porId = chaveId === null ? undefined : mapa.get(chaveId);
  const porRef = chaveRef === null || chaveRef === chaveId ? undefined : mapa.get(chaveRef);

  if (porId?.ambigua === true) return { proposta: "NENHUMA", motivo: "AMBIGUO" };
  const escolhida: { entrada: EntradaDoDeParaDeCliente; chave: ChaveQueCasou } | null = porId
    ? { entrada: porId, chave: "ID_VACANCY" }
    : porRef
      ? { entrada: porRef, chave: "REFERENCE" }
      : null;
  if (escolhida === null) return { proposta: "NENHUMA", motivo: "NAO_CASOU" };
  if (escolhida.entrada.ambigua) return { proposta: "NENHUMA", motivo: "AMBIGUO" };

  const outra = escolhida.chave === "ID_VACANCY" ? porRef : undefined;
  const discordanciaEntreChaves =
    outra !== undefined && outra.ambigua === false && discordam(escolhida.entrada, outra);

  const entrada = escolhida.entrada;
  if (entrada.codCliente === null) {
    return {
      proposta: "SO_NOME",
      nomeCliente: entrada.nomeCliente,
      chave: escolhida.chave,
      discordanciaEntreChaves,
    };
  }
  return {
    proposta: "COM_CODIGO",
    codCliente: entrada.codCliente,
    nomeCliente: entrada.nomeCliente,
    chave: escolhida.chave,
    discordanciaEntreChaves,
  };
}

/** Duas entradas discordam quando falam de clientes diferentes, pelo código ou pelo nome. */
function discordam(
  a: Extract<EntradaDoDeParaDeCliente, { ambigua: false }>,
  b: Extract<EntradaDoDeParaDeCliente, { ambigua: false }>,
): boolean {
  if (a.codCliente !== null && b.codCliente !== null) {
    return chaveDeCliente(a.codCliente) !== chaveDeCliente(b.codCliente);
  }
  return nomeComparavelDeCliente(a.nomeCliente) !== nomeComparavelDeCliente(b.nomeCliente);
}
