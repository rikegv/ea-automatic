/**
 * ─ O DETECTOR DE CONTROLE ÓRFÃO: A COBERTURA DO MANUAL VIRA NÚMERO ─────────────────────────────
 *
 * ┌─ A PERGUNTA QUE ORIGINOU ESTA PEÇA, E POR QUE OPINAR NÃO SERVE ──────────────────────────────┐
 * │ O diretor perguntou se o manual cobre CADA RECURSO DE CADA TELA. A fábrica respondeu com um     │
 * │ inventário de 84 peças, feito por julgamento, e a medição seguinte mostrou que ele estava pela  │
 * │ METADE (196). Não foi má-fé nem descuido: é que "a tela está coberta?" é uma pergunta que a     │
 * │ cabeça de quem escreveu o artigo responde contra a própria suposição, sempre com sim.           │
 * │                                                                                                │
 * │ Então a resposta deixa de ser opinião: o motor ENUMERA os controles desenhados em cada tela e   │
 * │ compara com os `Passo.controles` que os artigos daquela rota DECLARAM. O que existe na tela e   │
 * │ em artigo nenhum é lacuna MEDIDA, com rota e rótulo.                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ARQUIVO É O NÚCLEO PURO, e a razão de ele morar no frontend é a mesma do gate de PII: `tools/`
 * não está no `pnpm-workspace.yaml` e não roda no `pnpm test`, então um detector escrito lá dentro
 * seria INAUDITÁVEL, e §A.38 exige que quem confere não seja quem escreveu. Aqui ele é uma função de
 * duas listas de rótulos; quem abre o navegador e lê o DOM é a casca, em `tools/ajuda/`.
 *
 * ┌─ MODO RELATÓRIO AGORA, FALHA DURA NA FASE 6 ─────────────────────────────────────────────────┐
 * │ Hoje existem 3 artigos e centenas de controles. Ligar a falha dura agora travaria toda frente   │
 * │ do sistema por lacunas que a própria construção do manual vai fechar nas Fases 1 a 5. O modo    │
 * │ duro é UMA CONSTANTE (`COBERTURA_E_FALHA_DURA`), no espírito do `GRAVACAO_VETADA`: quem liga    │
 * │ liga em um lugar, deliberadamente, e o teste do modo duro já existe desde hoje.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { normalizarRotulo } from "./busca";
import { artigosDaRotaEm, normalizarRota } from "./rotas";
import type { Artigo } from "./tipos";

/** Fase 0 a 5: o detector MEDE. Fase 6: ele REPROVA. Uma linha, um lugar, decisão declarada. */
export const COBERTURA_E_FALHA_DURA = false;

/** Um controle como o navegador o entrega: o rótulo desenhado e o papel acessível dele. */
export type ControleDaTela = { rotulo: string; papel: string };

/** O que a casca traz de uma tela: a rota e os controles que estavam desenhados nela. */
export type TelaEnumerada = { rota: string; controles: ControleDaTela[] };

/**
 * ─ AS TRÊS CLASSES, E ELAS SÃO O RECORTE QUE IMPEDE O RELATÓRIO DE SER RUÍDO ───────────────────
 *
 * ┌─ O PROBLEMA: UM DETECTOR QUE ACUSA 800 LACUNAS NÃO É LIDO POR NINGUÉM ───────────────────────┐
 * │ A medição do `arquiteto` já tinha achado o porquê: das 803 ações do sistema, a MAIORIA não é    │
 * │ recurso novo, é o MESMO recurso repetido. 251 colunas ordenáveis saem de um `ColunaOrdenavel`,  │
 * │ 69 campos de filtro saem de um `FiltroTrigger`. Contar "Filtros" como órfão em 10 telas é       │
 * │ contar dez vezes um artigo que a Fase 1 escreve uma vez, e ainda empurra para o fim da lista o  │
 * │ botão que realmente não tem dono.                                                              │
 * │                                                                                                │
 * │ E CONTAR A MOLDURA É PIOR AINDA: o menu da lateral, o tema, o perfil e o botão de ajuda estão   │
 * │ em TODAS as telas, porque vêm do mesmo `layout`. Sem separá-los, cada tela nasce com o mesmo    │
 * │ punhado de órfãos e o número total fica dominado por eles.                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CLASSIFICAÇÃO É MEDIDA, E NÃO UMA LISTA DE PALAVRAS QUE ALGUÉM ESCREVEU. O critério é a
 * UBIQUIDADE do rótulo entre as telas enumeradas, que é observável e se atualiza sozinha quando o
 * sistema muda:
 *
 *   MOLDURA           — aparece em quase TODAS as telas. Não é recurso da tela, é a casca do
 *                       sistema (menu, tema, perfil, sair). Conta UMA vez no sistema inteiro.
 *   PADRAO_DO_SISTEMA — repete em VÁRIAS telas, mas não em todas: filtro, ordenação, busca, lote,
 *                       exportar, paginação. É o balde da Fase 1. Conta UMA vez no sistema inteiro.
 *   PROPRIO           — aparece em uma ou duas telas. É o recurso específico daquela tela, e é ele
 *                       que o artigo da tela tem de nomear. Conta por (rota, rótulo).
 *
 * POR QUE LISTA DE PALAVRAS SERIA PIOR, e é a tentação óbvia: ela é opinião outra vez, com o mesmo
 * defeito que produziu o inventário de 84. Botão que alguém esqueceu de pôr na lista vira órfão para
 * sempre, e botão que alguém pôs por engano fica invisível para sempre. A ubiquidade não esquece nem
 * perdoa ninguém, e quando a moldura mudar, ela muda com a moldura.
 */
export type ClasseDeControle = "MOLDURA" | "PADRAO_DO_SISTEMA" | "PROPRIO";

/**
 * OS DOIS LIMITES DA CLASSIFICAÇÃO, com número e com motivo.
 *
 * `fracaoDeMoldura` em 0,85, e não 1,0, porque a moldura NÃO é perfeitamente ubíqua na prática: três
 * telas internas não usam o `PageHead` (`/esteira`, `/diretoria`, `/diretoria/alto-volume`), o menu
 * da lateral é filtrado por permissão, e uma tela que falhe ao carregar derruba a contagem de todos
 * os rótulos dela. Exigir 100% faria a moldura inteira cair em PADRAO_DO_SISTEMA no primeiro
 * soluço, e o número mudaria por motivo que não é o manual.
 *
 * `telasParaPadrao` em 3 porque 2 é o limite do que um artigo de tela cobre com uma MENÇÃO ("o filtro
 * desta tela tem campo de cliente"), e 3 é onde passa a valer a pena um artigo de padrão. É o mesmo
 * corte que o inventário usou quando disse "um artigo mais uma linha por tela que tem campo próprio".
 *
 * `minimoDeTelasParaMoldura` em 10 é a trava contra o caso degenerado, e ele apareceu em teste antes
 * de aparecer em produção: medindo UMA tela, todo rótulo dela está em 100% das telas, então TUDO
 * viraria moldura e a tela mediria zero controle próprio. Abaixo de 10 telas o sinal de ubiquidade
 * não distingue casca de padrão, e a escolha conservadora é PADRAO_DO_SISTEMA: ele também conta uma
 * vez só, também é reportado, e só muda o balde a que a lacuna é atribuída. Medir uma tela sozinha é
 * caso real (`--rota=/esteira`, para conferir uma frente), e ali o número tem de continuar de pé.
 */
export type LimitesDeCobertura = {
  fracaoDeMoldura: number;
  telasParaPadrao: number;
  minimoDeTelasParaMoldura: number;
};

export const LIMITES_PADRAO: LimitesDeCobertura = {
  fracaoDeMoldura: 0.85,
  telasParaPadrao: 3,
  minimoDeTelasParaMoldura: 10,
};

export type DependenciasCobertura = {
  telas: TelaEnumerada[];
  artigos: Artigo[];
  /**
   * ─ O GATE DE PII APLICADO AO RÓTULO, E ELE NÃO É OPCIONAL (§A.6) ─────────────────────────────
   *
   * ┌─ POR QUE UM RELATÓRIO DE BOTÕES PODE VAZAR NOME DE PESSOA ────────────────────────────────┐
   * │ Botão de LINHA de tabela carrega o dado da linha no nome acessível: "Abrir a ficha de <nome │
   * │ do candidato>", "Ver prontuário de <nome>". O relatório vai para o log da fábrica e para um │
   * │ arquivo, e log é onde o dado sobrevive. Então o rótulo reprovado pelo gate NÃO entra no     │
   * │ relatório: ele é contado em `rotulosOmitidosPeloGate` e descartado.                         │
   * │                                                                                            │
   * │ E DESCARTAR É TAMBÉM O CERTO PELA MEDIÇÃO, não só pela privacidade: rótulo que muda com o   │
   * │ dado da linha não é nome de controle, é conteúdo. Ele nunca poderia ser declarado por um     │
   * │ artigo, e como órfão seria uma lacuna impossível de fechar.                                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * É FUNÇÃO INJETADA, e obrigatória, pela mesma razão que `negados` é obrigatório no motor: opcional,
   * o caminho que gera o relatório de verdade pode deixar de passá-la sem que nada acuse, e a
   * proteção volta a ser a de antes em silêncio.
   */
  aprovarRotulo: (rotulo: string) => boolean;
  /**
   * OS VALORES DE CATÁLOGO DO SISTEMA, já normalizados por `prepararCatalogo`. É a poda R2 (ver
   * `analisarRotulo`), e a lista vem do BANCO, pelo mesmo caminho que o gate de PII já usa.
   *
   * OPCIONAL, e aqui o opcional é o lado ESTRITO, ao contrário do `aprovarRotulo`: sem ele nada é
   * podado, então o relatório acusa MAIS lacuna, nunca menos. Quem esquecer de passá-lo recebe ruído,
   * não um número inflado para cima.
   */
  catalogo?: Set<string>;
  /**
   * OS NOMES DE PESSOA do banco (candidatos e usuários), já normalizados por `prepararCatalogo`. É a
   * poda R3, e vale a mesma régua do catálogo: opcional, e a ausência é o lado ESTRITO (sem ela nada
   * é podado, e o relatório acusa mais, nunca menos).
   *
   * §A.6: eles ficam em MEMÓRIA e são retirados da chave e da exibição antes de qualquer linha do
   * relatório. O gate de PII continua por cima, como segunda barreira.
   */
  pessoas?: Set<string>;
  limites?: LimitesDeCobertura;
};

/** Como uma tela saiu da medição. Ver `RESPOSTA_AO_CONTROLES_OPCIONAL`. */
export type SituacaoDaTela = "MEDIDA" | "SEM_ARTIGO" | "N1_MUDO";

export type RelatorioDeTela = {
  rota: string;
  situacao: SituacaoDaTela;
  /** Slugs dos artigos que ensinam esta rota. */
  artigos: string[];
  /** Controles PRÓPRIOS desta tela (a moldura e os padrões são contados no sistema, não aqui). */
  propriosTotal: number;
  propriosCobertos: number;
  /** Os rótulos próprios que artigo nenhum declara. Já passaram pelo gate de PII. */
  orfaos: string[];
};

export type BaldeDoSistema = { total: number; cobertos: number; orfaos: string[] };

export type RelatorioDeCobertura = {
  telasEnumeradas: number;
  /** Bruto: cada controle desenhado em cada tela, antes de qualquer recorte. É o número honesto. */
  controlesEnumerados: number;
  rotulosOmitidosPeloGate: number;
  moldura: BaldeDoSistema;
  padroes: BaldeDoSistema;
  /** O balde que decide o tamanho do manual: recurso específico de tela, contado por (rota, rótulo). */
  proprios: { total: number; cobertos: number };
  /**
   * EM QUANTAS TELAS existe o controle cujo rótulo inteiro é dado (página, opção de lista). FORA da
   * conta de cobertura de propósito: não há rótulo para um artigo declarar, e contá-lo criava a única
   * dívida impossível de quitar. Ver `CHAVE_DE_ROTULO_SO_VALOR`.
   */
  rotulosSoValor: number;
  /** A conta que o diretor lê: os três baldes somados, na unidade em que cada um é ensinado. */
  cobertura: { total: number; cobertos: number; percentual: number };
  telas: RelatorioDeTela[];
  /** A régua do `controles` opcional. Ver `RESPOSTA_AO_CONTROLES_OPCIONAL`. */
  artigosN1Mudos: Array<{ slug: string; rotas: string[] }>;
  rotasSemArtigo: string[];
};

/**
 * ─ A RÉGUA DO `controles` OPCIONAL, que era a pergunta de desenho aberta ────────────────────────
 *
 * ┌─ O FURO QUE O `tester` APONTOU ───────────────────────────────────────────────────────────────┐
 * │ `Passo.controles` é opcional. Um artigo escrito numa tela cheia de botões, sem declarar um       │
 * │ único controle, é INVISÍVEL para um detector ingênuo: ele não tem com o que comparar, "pula" a   │
 * │ tela, e a lacuna deixa de aparecer como lacuna. Pior: se o percentual fosse calculado só sobre  │
 * │ as telas que declararam algo, um artigo mudo MELHORARIA o número, porque tiraria do              │
 * │ denominador justamente a tela que ninguém documentou.                                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A DECISÃO, e ela é a sugestão do `tester` levada até o fim: **A RÉGUA VALE POR ARTIGO `N1`.**
 *
 *   1. O campo CONTINUA OPCIONAL no tipo, e isso é deliberado. Torná-lo obrigatório forçaria todo
 *      passo a declarar algo, inclusive o passo que não clica em nada ("confira o veredito", "espere
 *      a fila atualizar"), e o custo disso seria rótulo inventado para satisfazer o compilador.
 *      Rótulo inventado é pior que campo vazio: ele MENTE para o detector, que passa a dar a tela
 *      como coberta.
 *   2. A OBRIGAÇÃO É DO ARTIGO `N1`, NÃO DO PASSO. `N1` é, por definição da §5 do desenho, o caminho
 *      principal da tela: quem lê só os N1 consegue trabalhar. Um N1 que não nomeia um único controle
 *      não descreve o caminho principal de nada. Então N1 com zero `controles` é DEFEITO, reportado
 *      com nome e rota (`artigosN1Mudos`), e a tela dele é marcada `N1_MUDO`.
 *   3. `N2` PODE DECLARAR POUCO OU NADA, e isso não é defeito: ele é o recurso secundário, cobre um
 *      canto da tela de propósito, e exigir dele a mesma completude apagaria a diferença entre os
 *      dois níveis, que é o que organiza as fases.
 *   4. A UNIDADE DE CONTA É A TELA, NUNCA O ARTIGO. Toda tela enumerada entra no denominador, mesmo
 *      a que não tem artigo nenhum (`SEM_ARTIGO`) e a que tem artigo mudo (`N1_MUDO`). É isso que
 *      fecha o furo: artigo mudo não some do relatório, ele aparece com 0% e com o motivo.
 *
 * POR QUE NÃO BASTARIA DEIXAR A ARITMÉTICA RESOLVER, que é a objeção justa: se toda tela entra no
 * denominador, o artigo mudo já pesa 0% e o número não mente. Verdade, mas o número diz "esta tela
 * está descoberta", e a pessoa que abre o relatório vê uma tela com artigo escrito e conclui que o
 * detector está errado. `artigosN1Mudos` é o que traduz "0% numa tela que tem artigo" em "o artigo
 * existe e não nomeou nada", que é a frase que manda alguém consertar em vez de discutir a medição.
 */
export const RESPOSTA_AO_CONTROLES_OPCIONAL =
  "O campo segue opcional no tipo; a régua de completude é do artigo N1, que não pode declarar zero " +
  "controle. N2 pode. Toda tela enumerada entra no denominador, inclusive a sem artigo e a de N1 mudo.";

/**
 * ─ O VALOR QUE O CONTROLE MOSTRA NÃO É O NOME DELE, E AS DUAS REGRAS SAÍRAM DA MEDIÇÃO ─────────
 *
 * ┌─ O QUE A PRIMEIRA ENUMERAÇÃO REAL DEVOLVEU, E ELA CORRIGIU O DESENHO ────────────────────────┐
 * │ Os órfãos vinham assim, e nenhum deles é nome de controle:                                      │
 * │                                                                                                │
 * │   "1812 Auditorias Finalizadas"        o card de KPI, clicável como filtro (§A.12), leva a       │
 * │                                        CONTAGEM no nome acessível;                              │
 * │   "Editar ADVANCE BIONICS"             o botão de LINHA leva o nome do cliente daquela linha;    │
 * │   "· ALCOOL FERREIRA S A(1 cargo)"     a linha da régua, idem;                                  │
 * │   "Abrir a gestão da vaga SIM-2026-0501"  o código da vaga daquela linha.                        │
 * │                                                                                                │
 * │ NENHUM ARTIGO PODE DECLARAR ESSES RÓTULOS, porque eles mudam com o dado. Como órfãos, eram      │
 * │ lacuna IMPOSSÍVEL de fechar, e o relatório nunca chegaria a zero por defeito da medição, não por │
 * │ falta de manual. Sem esta régua a tela da régua documental acusava 272 lacunas, a do iFractal   │
 * │ 133 e a da diretoria 444, quase todas o mesmo botão repetido linha a linha.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS DUAS REGRAS SÃO GERAIS, e as duas são medidas em vez de escritas à mão:
 *
 *   R1. TOKEN QUE CONTÉM DÍGITO É VALOR. Vale para a contagem do card, para o badge da aba, para a
 *       paginação e para o código de vaga. Nome de controle no EA não carrega número.
 *   R2. VALOR DE CATÁLOGO É DADO. A lista de clientes, cargos, lojas e cidades vem do BANCO, e é a
 *       MESMA que o gate de PII já lê para dispensar o que não é pessoa (§A.6). Então ela não é uma
 *       lista de palavras que alguém escreveu e vai envelhecer: cliente novo entra sozinho, e o
 *       botão da linha dele já nasce reduzido ao nome do botão.
 *
 * E O QUE SOBRA DEPOIS DA PODA É O NOME: "Editar ADVANCE BIONICS" vira "Editar", que repete em
 * dezenas de telas e cai no balde da Fase 1, que é onde ele tem de estar. Podar é melhor que
 * DESCARTAR o rótulo inteiro justamente por isso: descartando, o "Editar" da linha deixaria de ser
 * contado em lugar nenhum.
 *
 * O CASO EM QUE NÃO SOBRA NADA CONTINUA SENDO TRATADO, em vez de desaparecer: rótulo que é só número
 * é a PAGINAÇÃO, que é padrão do sistema com artigo próprio na Fase 1. Sem esse desvio, a poda
 * deixaria a chave vazia e a paginação sairia da conta em silêncio, que é o defeito que este arquivo
 * inteiro existe para não cometer.
 *
 * A PODA FICA AQUI, E NÃO EM `normalizarRotulo`: a busca indexa PALAVRA, e para ela um token a mais
 * não atrapalha. O que precisa da régua é a COMPARAÇÃO entre o desenhado e o declarado.
 */

/**
 * Valor de catálogo com menos de 4 letras não poda: "AM", "II", "SP" e "I" são valores reais de
 * catálogo e aparecem DENTRO de nome de controle legítimo. Podar por eles cortaria o nome ao meio.
 */
const MINIMO_DE_VALOR_DE_CATALOGO = 4;

/** Até seis tokens: é o maior nome de cliente medido na base ("ASSOCIAÇÃO ..." e afins). */
const MAXIMO_DE_TOKENS_DE_CATALOGO = 6;

/**
 * ─ O CONTROLE CUJO RÓTULO INTEIRO É DADO, E ELE SAI DA CONTA DE COBERTURA ──────────────────────
 *
 * ┌─ A LACUNA QUE NÃO FECHAVA NUNCA, E POR QUE ISSO É PIOR DO QUE PARECE ───────────────────────┐
 * │ O número de página, a opção do painel de filtro com a sua contagem ("Ajudante Geral 782"), a  │
 * │ célula que é só valor: são controles reais, e o rótulo deles é DADO, não nome. A primeira       │
 * │ versão os juntava numa chave canônica e os deixava no denominador, esperando que algum artigo   │
 * │ os "cobrisse". NENHUM PODE: não existe rótulo para declarar, e o que um autor escrevesse        │
 * │ ("1", "3") seria lixo no índice da busca e cobriria a classe por acidente.                     │
 * │                                                                                                │
 * │ LACUNA IMPOSSÍVEL DE FECHAR É O QUE FAZ ALGUÉM DESLIGAR O DETECTOR, e esse é o custo real: o   │
 * │ relatório nunca chegaria a zero, a falha dura da Fase 6 nunca poderia ser ligada, e a régua     │
 * │ inteira viraria decoração. É o mesmo raciocínio que podou os 458 falsos órfãos da primeira      │
 * │ rodada, levado até o fim.                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENTÃO ELES SAEM DO DENOMINADOR E VIRAM UMA LINHA PRÓPRIA (`rotulosSoValor`), exatamente como o
 * controle SEM NOME ACESSÍVEL, que a casca já reporta à parte: os dois são controles que existem e
 * que nenhum artigo tem como nomear. Sair da conta **não é** varrer para baixo do tapete, é dizer a
 * verdade: cobri-los não é tarefa de documentação, e contá-los como dívida mede a coisa errada.
 *
 * O QUE OS ENSINA CONTINUA EXISTINDO, e é por isso que isto não perde nada: a paginação é ensinada
 * pelo artigo do PADRÃO ("Virar A Página Da Lista"), pelo rótulo dos controles que TÊM nome (as setas
 * de avançar e voltar). É o padrão que se aprende, nunca o número desenhado no botão.
 */
export const CHAVE_DE_ROTULO_SO_VALOR = "\u0000rotulo-so-valor";

/** O nome da CLASSE, e não uma amostra dela: amostra imprimiria o dado de uma linha no relatório. */
export const ROTULO_SO_VALOR = "(controle cujo rotulo e so valor: pagina, contagem, opcao de lista)";

/**
 * ─ O CONECTOR QUE SOBRA DEPOIS DA PODA ─────────────────────────────────────────────────────────
 *
 * "Ver ficha de Fulano" podado vira "ver ficha de", e nenhum autor escreve o "de" solto: ele
 * declararia "Ver ficha". Sem esta regra, a poda conserta o rótulo e cria um segundo desencontro, um
 * token depois. O corte é só no FIM e só se sobrar alguma coisa.
 */
const CONECTORES_FINAIS = new Set(["de", "da", "do", "das", "dos", "para", "em", "no", "na", "com"]);

/**
 * ─ R3: O NOME DA PESSOA TAMBÉM É DADO, E ESSE É O CASO MAIS GRAVE DOS TRÊS ─────────────────────
 *
 * ┌─ POR QUE ELE NÃO PODIA CONTINUAR CONTANDO COMO LACUNA ──────────────────────────────────────┐
 * │ Os órfãos eram "Ver ficha de <nome>", "Editar admissão de <nome>", "Mudar status de <nome>".  │
 * │ Nenhum artigo pode declarar isso, e aqui são DOIS motivos somados, não um: o nome muda a cada  │
 * │ linha (como o cliente e a contagem), E escrevê-lo no artigo seria DADO PESSOAL DENTRO DO       │
 * │ MANUAL (§A.6). A lacuna não é só impossível de fechar: a única forma de "fechá-la" seria uma   │
 * │ violação.                                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A FONTE É A MESMA DO GATE, e isso importa: os nomes vêm do BANCO, pelo mesmo caminho que monta a
 * allowlist de candidatos e a denylist da equipe. Pessoa nova entra sozinha, e o botão da linha dela
 * já nasce podado. Não há lista escrita à mão para envelhecer.
 *
 * O NOME NUNCA CHEGA AO RELATÓRIO, e é isso que a poda garante: ele é retirado da chave E da
 * exibição antes de qualquer linha ser impressa. O gate de PII continua rodando por cima, como
 * segunda barreira, e é ele que pega o que a poda não conhecer.
 *
 * ERRO POSSÍVEL, declarado: um controle cujo rótulo COINCIDA com um nome de pessoa seria podado e
 * deixaria de ser cobrado. É o lado menos seguro da poda, e está contido pelo mínimo de 4 letras e
 * pela exigência de casar a sequência INTEIRA de tokens, nunca um pedaço.
 */
export type PodaDeValores = {
  /** Cliente, cargo, loja, cidade. Ver R2 em `analisarRotulo`. */
  catalogo?: Set<string>;
  /** Nome de pessoa (candidato e usuário do time). Ver R3. */
  pessoas?: Set<string>;
};

/** O catálogo normalizado, pronto para a poda. Quem lê o banco é a casca. */
export function prepararCatalogo(valores: string[]): Set<string> {
  const pronto = new Set<string>();
  for (const valor of valores) {
    const chave = normalizarRotulo(valor);
    if (chave.replace(/ /g, "").length >= MINIMO_DE_VALOR_DE_CATALOGO) pronto.add(chave);
  }
  return pronto;
}

export type RotuloAnalisado = {
  /** A chave de comparação: normalizada e podada. É ela que casa tela com artigo. */
  chave: string;
  /** Nada sobrou depois da poda: o rótulo era só valor (paginação, código, nome de cliente). */
  soValor: boolean;
  /** O que vai para o relatório: o rótulo original, podado, com a caixa preservada. */
  exibir: string;
};

export function analisarRotulo(rotulo: string, poda: PodaDeValores = {}): RotuloAnalisado {
  const cru = rotulo.trim().split(/\s+/).filter(Boolean);
  const bruto = normalizarRotulo(rotulo);
  const normalizados = bruto.split(" ").filter(Boolean);
  // A NORMALIZAÇÃO É TOKEN A TOKEN, então os dois arranjos andam juntos. Quando não andam (rótulo com
  // pontuação solta que virou token vazio), a exibição cai para o rótulo cru: melhor um rótulo feio
  // do que um rótulo remontado errado.
  const alinhados = cru.length === normalizados.length;

  const chaveTokens: string[] = [];
  const exibirTokens: string[] = [];
  const { catalogo, pessoas } = poda;
  let i = 0;
  while (i < normalizados.length) {
    // R1: token com dígito é valor.
    if (/[0-9]/.test(normalizados[i])) {
      i += 1;
      continue;
    }
    // R2 e R3: a maior sequência de tokens que É um valor de catálogo OU um nome de pessoa sai fora,
    // da esquerda para a direita. As duas listas vêm do banco e podam do mesmo jeito.
    let podou = 0;
    const maximo = Math.min(MAXIMO_DE_TOKENS_DE_CATALOGO, normalizados.length - i);
    for (let n = maximo; n >= 1 && podou === 0; n -= 1) {
      const trecho = normalizados.slice(i, i + n).join(" ");
      if (catalogo?.has(trecho) || pessoas?.has(trecho)) podou = n;
    }
    if (podou > 0) {
      i += podou;
      continue;
    }
    chaveTokens.push(normalizados[i]);
    if (alinhados) exibirTokens.push(cru[i]);
    i += 1;
  }

  // O CONECTOR SOLTO NO FIM sai junto: "Ver ficha de Fulano" tem de virar "Ver ficha", que é o que
  // um autor escreve, e não "Ver ficha de", que seria um segundo desencontro um token depois.
  while (chaveTokens.length > 1 && CONECTORES_FINAIS.has(chaveTokens[chaveTokens.length - 1])) {
    chaveTokens.pop();
    exibirTokens.pop();
  }

  const chave = chaveTokens.join(" ");
  /**
   * ─ NADA SOBROU: O RÓTULO INTEIRO ERA DADO, E ISSO É **UMA** CLASSE DE CONTROLE ────────────────
   *
   * ┌─ A TERCEIRA VOLTA DO MESMO DEFEITO, E FOI A MEDIÇÃO QUE A ACHOU ──────────────────────────┐
   * │ Esta linha caía no rótulo CRU, e o efeito era o oposto do pretendido: cada variante voltava   │
   * │ a ser um controle diferente. A medição da Fase 1 mostrou o balde de padrão com 466 entradas,  │
   * │ e a inspeção mostrou o que eram: "Ajudante Geral 782", "Advogada II 3", "Ajudante de Higiene  │
   * │ 35" (as opções do painel de filtro, cada cargo com a sua contagem) e "102 23", "35 28" (os    │
   * │ números de página). Todas tinham sido podadas até o vazio, e todas voltavam pelo rótulo cru.  │
   * │                                                                                             │
   * │ ELAS SÃO **UM** CONTROLE, NÃO SEISCENTOS: a opção de lista e o número de página se aprendem  │
   * │ uma vez, e nenhum artigo pode declarar "Ajudante Geral 782" como rótulo, porque amanhã são    │
   * │ 783. Então a chave é CANÔNICA, e o balde de padrão volta a dizer o que ele mede.             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * E O RÓTULO EXIBIDO NÃO É UMA AMOSTRA, é o nome da classe: imprimir "Ajudante Geral 782" aqui
   * seria mostrar o dado de uma linha como se fosse o nome de um controle, que é o que a poda desfez.
   */
  // RÓTULO VAZIO NÃO É "SÓ VALOR", É NADA. Um `controles: ["  "]` declarado por engano não pode virar
  // a declaração da classe de rótulo-só-valor, ou o artigo passaria a cobrir a paginação sem querer.
  if (!chave) {
    if (!bruto) return { chave: "", soValor: false, exibir: "" };
    return { chave: CHAVE_DE_ROTULO_SO_VALOR, soValor: true, exibir: ROTULO_SO_VALOR };
  }
  return { chave, soValor: false, exibir: alinhados && exibirTokens.length > 0 ? exibirTokens.join(" ") : chave };
}

/** A chave de comparação, que é o que os dois lados (tela e artigo) precisam concordar. */
export function chaveDeControle(rotulo: string, poda: PodaDeValores = {}): { chave: string; soValor: boolean } {
  const { chave, soValor } = analisarRotulo(rotulo, poda);
  return { chave, soValor };
}

/**
 * Os rótulos que um artigo declara, pela MESMA chave da tela (mesma poda, mesma normalização). Vazio
 * quando ele não declara nada. A poda dos DOIS lados não é simetria estética: um artigo que escreva
 * "Editar cliente ADVANCE BIONICS" tem de casar com o botão de linha de qualquer cliente.
 */
export function controlesDeclarados(artigo: Artigo, poda: PodaDeValores = {}): Set<string> {
  const declarados = new Set<string>();
  for (const passo of artigo.passos) {
    for (const rotulo of passo.controles ?? []) {
      const { chave } = chaveDeControle(rotulo, poda);
      /**
       * A CHAVE-SÓ-VALOR NÃO PODE SER DECLARADA, e recusá-la aqui é o outro lado do conserto: sem
       * esta linha, um artigo que escrevesse um nome de cargo ou um número em `controles` seria
       * podado até o vazio e passaria a "cobrir" a classe inteira dos rótulos de dado, por acidente.
       * Declaração que não sobrevive à poda é declaração de um DADO, e dado não é nome de controle.
       */
      if (chave && chave !== CHAVE_DE_ROTULO_SO_VALOR) declarados.add(chave);
    }
  }
  return declarados;
}

export function classificar(
  telasComORotulo: number,
  telasEnumeradas: number,
  somenteNumero: boolean,
  limites: LimitesDeCobertura,
): ClasseDeControle {
  const podeSerMoldura = telasEnumeradas >= limites.minimoDeTelasParaMoldura;
  if (podeSerMoldura && telasComORotulo >= Math.ceil(limites.fracaoDeMoldura * telasEnumeradas)) {
    return "MOLDURA";
  }
  if (telasComORotulo >= limites.telasParaPadrao) return "PADRAO_DO_SISTEMA";
  // Paginação: o número de páginas depende de quantas linhas a tela tem hoje, então ele nunca
  // repetiria o suficiente para ser reconhecido como padrão pela ubiquidade.
  if (somenteNumero) return "PADRAO_DO_SISTEMA";
  return "PROPRIO";
}

/**
 * ─ A MEDIÇÃO ───────────────────────────────────────────────────────────────────────────────────
 *
 * Uma passada para contar em quantas telas cada rótulo aparece (é isso que classifica), outra para
 * atribuir cobertura. Padrão e moldura são comparados contra a união de TODOS os artigos, porque o
 * artigo que ensina o filtro é do módulo de padrões e não da tela; o próprio é comparado só contra
 * os artigos DAQUELA rota, porque é ali que ele tem de ser nomeado.
 */
export function medirCobertura(deps: DependenciasCobertura): RelatorioDeCobertura {
  const limites = deps.limites ?? LIMITES_PADRAO;
  const telasEnumeradas = deps.telas.length;

  let controlesEnumerados = 0;
  let rotulosOmitidosPeloGate = 0;

  const poda: PodaDeValores = { catalogo: deps.catalogo, pessoas: deps.pessoas };

  // chave do controle → um rótulo legível para exibir, e as rotas em que ele aparece.
  const ocorrencias = new Map<string, { exibir: string; soValor: boolean; rotas: Set<string> }>();
  const porTela = new Map<string, Set<string>>();

  for (const tela of deps.telas) {
    const rota = normalizarRota(tela.rota);
    const chavesDaTela = new Set<string>();
    for (const controle of tela.controles) {
      controlesEnumerados += 1;
      if (!deps.aprovarRotulo(controle.rotulo)) {
        rotulosOmitidosPeloGate += 1;
        continue;
      }
      const { chave, soValor, exibir } = analisarRotulo(controle.rotulo, poda);
      if (!chave) continue;
      chavesDaTela.add(chave);
      const registro = ocorrencias.get(chave) ?? { exibir, soValor, rotas: new Set<string>() };
      registro.rotas.add(rota);
      ocorrencias.set(chave, registro);
    }
    porTela.set(rota, chavesDaTela);
  }

  /** A união do que TODOS os artigos declaram. É contra ela que moldura e padrão são medidos. */
  const declaradosNoSistema = new Set<string>();
  for (const artigo of deps.artigos) {
    for (const chave of controlesDeclarados(artigo, poda)) declaradosNoSistema.add(chave);
  }

  const moldura: BaldeDoSistema = { total: 0, cobertos: 0, orfaos: [] };
  const padroes: BaldeDoSistema = { total: 0, cobertos: 0, orfaos: [] };
  const classePorChave = new Map<string, ClasseDeControle>();

  /** Quantas telas desenham o controle cujo rótulo inteiro é dado. Fora da conta, ver a constante. */
  let telasComRotuloSoValor = 0;

  for (const [chave, registro] of ocorrencias) {
    /**
     * O RÓTULO-SÓ-VALOR SAI DA CONTA ANTES DE QUALQUER CLASSIFICAÇÃO. Ele não é lacuna: não existe
     * rótulo para um artigo declarar, e mantê-lo no denominador criava a única dívida que nunca
     * poderia ser quitada. Vira contagem própria, como o controle sem nome acessível.
     */
    if (chave === CHAVE_DE_ROTULO_SO_VALOR) {
      telasComRotuloSoValor = registro.rotas.size;
      classePorChave.set(chave, "PADRAO_DO_SISTEMA");
      continue;
    }
    const classe = classificar(registro.rotas.size, telasEnumeradas, registro.soValor, limites);
    classePorChave.set(chave, classe);
    if (classe === "PROPRIO") continue;
    const balde = classe === "MOLDURA" ? moldura : padroes;
    balde.total += 1;
    if (declaradosNoSistema.has(chave)) balde.cobertos += 1;
    else balde.orfaos.push(registro.exibir);
  }
  moldura.orfaos.sort((a, b) => a.localeCompare(b, "pt-BR"));
  padroes.orfaos.sort((a, b) => a.localeCompare(b, "pt-BR"));

  const telas: RelatorioDeTela[] = [];
  const artigosN1MudosPorSlug = new Map<string, { slug: string; rotas: string[] }>();
  const rotasSemArtigo: string[] = [];
  let propriosTotal = 0;
  let propriosCobertos = 0;

  for (const tela of deps.telas) {
    const rota = normalizarRota(tela.rota);
    const artigos = artigosDaRotaEm(deps.artigos, rota);
    const declaradosDaRota = new Set<string>();
    for (const artigo of artigos) {
      for (const chave of controlesDeclarados(artigo, poda)) declaradosDaRota.add(chave);
    }

    const n1Mudos = artigos.filter((a) => a.nivel === "N1" && controlesDeclarados(a, poda).size === 0);
    for (const artigo of n1Mudos) {
      artigosN1MudosPorSlug.set(artigo.slug, { slug: artigo.slug, rotas: artigo.rotas });
    }

    let situacao: SituacaoDaTela = "MEDIDA";
    if (artigos.length === 0) {
      situacao = "SEM_ARTIGO";
      rotasSemArtigo.push(rota);
    } else if (n1Mudos.length > 0 || artigos.every((a) => controlesDeclarados(a, poda).size === 0)) {
      // Artigo escrito e nada nomeado: a tela mede 0%, e ela precisa dizer POR QUÊ, ou quem lê o
      // relatório conclui que o detector errou (ver `RESPOSTA_AO_CONTROLES_OPCIONAL`).
      situacao = "N1_MUDO";
    }

    let total = 0;
    let cobertos = 0;
    const orfaos: string[] = [];
    for (const chave of porTela.get(rota) ?? []) {
      if (classePorChave.get(chave) !== "PROPRIO") continue;
      total += 1;
      if (declaradosDaRota.has(chave)) cobertos += 1;
      else orfaos.push(ocorrencias.get(chave)?.exibir ?? chave);
    }
    orfaos.sort((a, b) => a.localeCompare(b, "pt-BR"));
    propriosTotal += total;
    propriosCobertos += cobertos;
    telas.push({
      rota,
      situacao,
      artigos: artigos.map((a) => a.slug),
      propriosTotal: total,
      propriosCobertos: cobertos,
      orfaos,
    });
  }

  const total = moldura.total + padroes.total + propriosTotal;
  const cobertos = moldura.cobertos + padroes.cobertos + propriosCobertos;
  return {
    telasEnumeradas,
    controlesEnumerados,
    rotulosOmitidosPeloGate,
    moldura,
    padroes,
    proprios: { total: propriosTotal, cobertos: propriosCobertos },
    rotulosSoValor: telasComRotuloSoValor,
    cobertura: {
      total,
      cobertos,
      percentual: total === 0 ? 0 : Math.round((cobertos / total) * 1000) / 10,
    },
    telas: telas.sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR")),
    artigosN1Mudos: [...artigosN1MudosPorSlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    rotasSemArtigo: rotasSemArtigo.sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

/** Na Fase 6 isto vira a condição de saída do comando. Hoje responde e ninguém obedece. */
export function reprovaEmModoDuro(relatorio: RelatorioDeCobertura): boolean {
  return (
    relatorio.cobertura.cobertos < relatorio.cobertura.total ||
    relatorio.artigosN1Mudos.length > 0 ||
    relatorio.rotasSemArtigo.length > 0
  );
}

/**
 * ─ O RESUMO QUE O DIRETOR LÊ, e ele tem de CABER ───────────────────────────────────────────────
 *
 * Despejar os órfãos de 47 telas são centenas de linhas que ninguém lê, e relatório que não é lido é
 * o mesmo que detector que não existe. Então: os totais primeiro, a decisão depois, e a lista por
 * tela LIMITADA, ordenada pelo que falta mais. O detalhe completo é assunto do arquivo em disco, e o
 * resumo diz onde ele está.
 *
 * §A.11: sem travessão. §A.6: cada rótulo aqui já passou pelo gate de PII na medição.
 */
export function resumirParaDiretor(
  relatorio: RelatorioDeCobertura,
  opcoes: { telas?: number; orfaosPorTela?: number } = {},
): string {
  const limiteTelas = opcoes.telas ?? 12;
  const limiteOrfaos = opcoes.orfaosPorTela ?? 6;
  const l: string[] = [];
  const c = relatorio.cobertura;

  l.push(
    `COBERTURA DO MANUAL: ${c.cobertos} de ${c.total} controles (${c.percentual.toFixed(1)}%), ` +
      `em ${relatorio.telasEnumeradas} telas.`,
  );
  l.push(
    `Controles desenhados nas telas, bruto: ${relatorio.controlesEnumerados}. ` +
      `${relatorio.rotulosOmitidosPeloGate} rótulo(s) omitido(s) pelo gate de dado pessoal ` +
      `(rótulo de linha carrega o dado da linha, §A.6).`,
  );
  l.push("");
  l.push("POR BALDE, e é ele que diz quanto trabalho cada lacuna custa:");
  l.push(
    `  MOLDURA (a casca do sistema, um artigo cobre todas as telas): ` +
      `${relatorio.moldura.cobertos} de ${relatorio.moldura.total}.`,
  );
  l.push(
    `  PADRAO DO SISTEMA (repete em 3 telas ou mais, balde da Fase 1): ` +
      `${relatorio.padroes.cobertos} de ${relatorio.padroes.total}.`,
  );
  l.push(
    `  PROPRIO DA TELA (o que exige artigo de tela): ` +
      `${relatorio.proprios.cobertos} de ${relatorio.proprios.total}.`,
  );
  if (relatorio.rotulosSoValor > 0) {
    l.push(
      `  FORA DA CONTA: o controle cujo rotulo inteiro e DADO (numero de pagina, opcao de lista com ` +
        `contagem) aparece em ${relatorio.rotulosSoValor} tela(s). Nao ha rotulo para um artigo ` +
        `declarar, entao ele nao e lacuna: o padrao que o ensina e outro controle, com nome.`,
    );
  }

  if (relatorio.artigosN1Mudos.length > 0) {
    l.push("");
    l.push(
      `ARTIGO N1 QUE NAO NOMEIA CONTROLE (${relatorio.artigosN1Mudos.length}): a tela dele mede 0% ` +
        `porque o artigo existe e nao declarou nenhum rotulo.`,
    );
    for (const a of relatorio.artigosN1Mudos.slice(0, 10)) l.push(`  ${a.slug} (${a.rotas.join(", ")})`);
  }

  const comLacuna = relatorio.telas
    .filter((t) => t.propriosTotal > t.propriosCobertos)
    .sort((a, b) => b.propriosTotal - b.propriosCobertos - (a.propriosTotal - a.propriosCobertos));
  l.push("");
  l.push(
    `TELAS COM LACUNA PROPRIA: ${comLacuna.length} de ${relatorio.telasEnumeradas}. ` +
      `${relatorio.rotasSemArtigo.length} tela(s) ainda sem nenhum artigo.`,
  );
  for (const tela of comLacuna.slice(0, limiteTelas)) {
    const amostra = tela.orfaos.slice(0, limiteOrfaos).join(", ");
    const resto = tela.orfaos.length > limiteOrfaos ? ` e mais ${tela.orfaos.length - limiteOrfaos}` : "";
    l.push(
      `  ${tela.rota}: ${tela.propriosCobertos}/${tela.propriosTotal} ` +
        `[${tela.situacao}] ${amostra}${resto}`,
    );
  }
  if (comLacuna.length > limiteTelas) {
    l.push(`  ... e mais ${comLacuna.length - limiteTelas} tela(s) no arquivo completo.`);
  }
  return l.join("\n");
}
