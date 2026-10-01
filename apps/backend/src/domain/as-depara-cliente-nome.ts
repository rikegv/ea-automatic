/**
 * ─ A CURADORIA DOS NOMES DE CLIENTE: A FÁBRICA PROPÕE, O TIME CONFIRMA ─────────────────────────
 *
 * O princípio 7 do mapa de alcance, na letra: tudo que a fábrica pode fazer sozinha, ela faz, e o
 * time nunca monta do zero. Medido em 01/10/2026: 95 nomes distintos na planilha, 20 casando EXATO
 * com o catálogo de 251 clientes e 27 por PREFIXO depois de tirar `(filial)` e `- cidade`.
 *
 * ┌─ A FRASE QUE É A REGRA INTEIRA DESTE ARQUIVO ────────────────────────────────────────────────┐
 * │ PROPOSTA NÃO CONFIRMADA NÃO É A MESMA COISA QUE CONFIRMADA. Toda a diferença entre uma         │
 * │ curadoria útil e um vínculo inventado mora nisso: `confirmado` nasce FALSO em todos os quatro   │
 * │ tipos, inclusive no EXATO, e quem confirma é gente, com autor e data (ver o schema do           │
 * │ de/para). Um `true` por conveniência faria os 47 palpites virarem vínculo na primeira volta da  │
 * │ varredura, antes de ninguém olhar, e desfazer exigiria saber quais vínculos vieram de palpite,  │
 * │ informação que o `true` acabou de apagar.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ABSTER-SE É O COMPORTAMENTO SEGURO, E A PROPOSTA ERRADA É PIOR QUE A AUSÊNCIA DE PROPOSTA ──┐
 * │ Ela vem preenchida na tela, com cara de trabalho feito, e quem confere 95 linhas confirma em    │
 * │ lote o que já está escrito. Por isso: prefixo que serve a DOIS clientes não propõe nenhum, e    │
 * │ não existe nenhuma forma de casamento aproximado aqui. Distância de edição SEMPRE acha ALGO     │
 * │ num catálogo de 251 nomes, e o custo de errar é o campo pelo qual a admissão é faturada e por   │
 * │ onde a régua documental e a pasta do Drive são escolhidas (§A.33: o que não se desfaz).         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOMÍNIO PURO: sem Nest, sem banco, sem relógio, resultado determinístico por argumento. Em
 * particular, o resultado NÃO DEPENDE DA ORDEM do catálogo: resultado que muda com a ordem da lista
 * é resultado que muda quando alguém cadastra um cliente novo, e uma instabilidade assim não aparece
 * em teste nenhum e aparece seis meses depois como "o de/para do cliente X mudou sozinho".
 */

/** Uma entrada do catálogo do EA. Um MESMO código pode entrar por mais de um nome (ver abaixo). */
export interface ClienteDoCatalogo {
  codCliente: string;
  /**
   * O nome pelo qual este código pode ser reconhecido.
   *
   * O CHAMADOR PODE PASSAR O MESMO CÓDIGO DUAS VEZES, uma com a razão social e outra com o nome da
   * operação, e isso é deliberado: o schema de `vagas.cod_cliente` registra que a base usa NOME
   * COMERCIAL contra RAZÃO SOCIAL, que é a causa medida de só 31 de 164 clientes terem casado. Duas
   * entradas do MESMO código não criam ambiguidade, porque a ambiguidade é contada por CÓDIGO
   * DISTINTO, nunca por entrada.
   */
  razaoSocial: string;
}

/**
 * O GRAU DO PALPITE, e ele VIAJA JUNTO porque quem confere 95 linhas precisa saber onde olhar com
 * cuidado: exato é conferência de um segundo, prefixo é onde o erro humano de confirmação acontece.
 * Achatar os dois graus num só devolve uma tela em que tudo parece igualmente seguro.
 */
export const TIPOS_DE_CASAMENTO_DE_CLIENTE = [
  "EXATO",
  "PREFIXO",
  "AMBIGUO",
  "SEM_PALPITE",
] as const;
export type TipoDeCasamentoDeCliente = (typeof TIPOS_DE_CASAMENTO_DE_CLIENTE)[number];

/**
 * A PROPOSTA. `confirmado` é `false` NO TIPO, e não só no valor: é a trava que impede o outro lado
 * de ler `undefined` (falsy, e em metade das implementações "tanto faz") como permissão.
 */
export type PropostaDeCasamentoDeCliente =
  | { tipo: "EXATO" | "PREFIXO"; codCliente: string; confirmado: false }
  | { tipo: "AMBIGUO" | "SEM_PALPITE"; confirmado: false };

/**
 * O PISO DE COMPRIMENTO DO PREFIXO, e ele existe porque prefixo curto não é informação, é
 * coincidência de alfabeto. `"A"` é prefixo de um monte de razão social; dezenas de propostas sem
 * fundamento misturadas com as 47 boas fariam o time perder a confiança na tela inteira.
 *
 * ELE NÃO SE APLICA AO CASAMENTO EXATO, de propósito: igualdade de string inteira não tem
 * coincidência a temer, e um piso ali jogaria fora o casamento certo de um cliente de nome curto.
 */
const PISO_DO_PREFIXO = 6;

/**
 * O NOME, NORMALIZADO PARA CASAMENTO.
 *
 * A ORDEM DAS ETAPAS É PARTE DA REGRA, e ela não é intercambiável:
 *  1. o que está entre PARÊNTESES sai primeiro, porque é ANOTAÇÃO de quem preencheu (`(filial)`), e
 *     é o mesmo problema que o de/para de etapa já enfrentou com `(MANTER SE HOUVER QUESTIONÁRIO)`.
 *     Mantido, o MESMO cliente aparece como dois nomes e o diretor mapeia duas vezes a mesma coisa;
 *  2. o SUFIXO DE CIDADE depois do hífen CERCADO DE ESPAÇOS sai em seguida, e ele vale 27 dos 47
 *     palpites (medido), ou seja mais da metade da curadoria. O corte acontece ANTES de a pontuação
 *     virar espaço porque é o espaço em volta do hífen que distingue sufixo de nome: `BETA-LOGISTICA`
 *     é NOME, e um `split("-")[0]` levaria metade dele embora;
 *  3. acento, caixa, pontuação e espaço repetido só então deixam de distinguir nomes.
 *
 * NOME VAZIO NORMALIZA PARA VAZIO, E VAZIO NÃO É NOME: `""` é prefixo de TODO o catálogo, e sem a
 * guarda do chamador o primeiro palpite sairia ao acaso. É o caminho mais curto que existe para
 * propor um vínculo sem fundamento nenhum.
 */
export function normalizarNomeDeClienteParaCasamento(nome: string): string {
  const semAnotacao = (nome ?? "").replace(/\([^)]*\)/g, " ");
  const semSufixoDeCidade = semAnotacao.split(/\s+-\s+/)[0] ?? "";
  return semSufixoDeCidade
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Os códigos DISTINTOS de um conjunto de entradas. É por eles que a ambiguidade é contada. */
function codigosDistintos(entradas: readonly ClienteDoCatalogo[]): string[] {
  return [...new Set(entradas.map((e) => e.codCliente.trim()))].filter((c) => c !== "");
}

/**
 * O PALPITE PARA UM NOME DA PLANILHA.
 *
 * O EXATO VENCE O PREFIXO, e a ordem é explícita em vez de emergir do encadeamento: `BETA LOGISTICA
 * S.A.` casa EXATO com um cliente e é prefixo de outro, e sem a precedência o par cairia como
 * ambíguo, perdendo um dos 20 casamentos CERTOS, que são justamente os que não exigem conferência.
 *
 * O CONJUNTO INTEIRO DE CANDIDATOS É COLETADO ANTES DE DECIDIR, e nunca um `find`: o `find` devolve
 * o primeiro da lista, isto é a ORDEM DO CATÁLOGO, e com isso a decisão passa a mudar quando alguém
 * cadastra um cliente novo.
 */
export function proporCasamentoDeCliente(
  nome: string,
  catalogo: readonly ClienteDoCatalogo[],
): PropostaDeCasamentoDeCliente {
  const alvo = normalizarNomeDeClienteParaCasamento(nome);
  if (alvo === "") return { tipo: "SEM_PALPITE", confirmado: false };

  const normalizados = catalogo.map((c) => ({
    entrada: c,
    nome: normalizarNomeDeClienteParaCasamento(c.razaoSocial),
  }));

  const exatos = normalizados.filter((c) => c.nome !== "" && c.nome === alvo);
  const decidir = (
    candidatos: typeof normalizados,
    tipo: "EXATO" | "PREFIXO",
  ): PropostaDeCasamentoDeCliente | null => {
    if (candidatos.length === 0) return null;
    const codigos = codigosDistintos(candidatos.map((c) => c.entrada));
    if (codigos.length === 0) return null;
    // ABSTÉM-SE: dois clientes para o mesmo nome é propor o errado em metade dos casos.
    if (codigos.length > 1) return { tipo: "AMBIGUO", confirmado: false };
    return { tipo, codCliente: codigos[0] as string, confirmado: false };
  };

  const porExato = decidir(exatos, "EXATO");
  if (porExato) return porExato;

  if (alvo.length < PISO_DO_PREFIXO) return { tipo: "SEM_PALPITE", confirmado: false };
  /*
   * O PREFIXO TERMINA EM FRONTEIRA DE PALAVRA (`alvo + " "`), e não em qualquer posição: sem isso,
   * `alfa` casaria com `alfafa comercio`, que é outro cliente. A direção é UMA SÓ, o nome da planilha
   * sendo prefixo do nome do catálogo, que é a direção medida nos 27 casos; a direção inversa (o
   * nome da planilha mais longo que o do catálogo) está PROPOSTA ao diretor e não implementada,
   * porque cada direção nova dobra a chance de propor um cliente errado (§A.31).
   */
  const prefixos = normalizados.filter((c) => c.nome.startsWith(`${alvo} `));
  const porPrefixo = decidir(prefixos, "PREFIXO");
  if (porPrefixo) return porPrefixo;

  return { tipo: "SEM_PALPITE", confirmado: false };
}
