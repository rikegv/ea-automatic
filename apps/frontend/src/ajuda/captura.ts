/**
 * ─ UMA CAPTURA: RESOLVE TUDO, AUDITA, E SÓ DEPOIS GRAVA ────────────────────────────────────────
 *
 * ┌─ POR QUE AS DEPENDÊNCIAS ENTRAM POR PARÂMETRO, e isso NÃO é preciosismo ─────────────────────┐
 * │ Sem a costura, as duas regras duras desta peça ("alvo perdido derruba" e "nenhum PNG parcial")   │
 * │ só se conferem subindo um navegador de verdade: teste lento, instável, que ninguém roda no gate, │
 * │ e a regra volta a depender de leitura de código. Com a costura, a regra é medida em              │
 * │ milissegundos e QUEBRA quando alguém a afrouxar. A casca do Playwright vive em `tools/ajuda/` e  │
 * │ injeta as implementações reais aqui.                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ORDEM É O REQUISITO, e não um detalhe de implementação:
 *   1. RESOLVER TODOS OS ALVOS. Alvo que não resolve derruba a captura, com o artigo, o arquivo e o
 *      alvo na mensagem. É o detector de artigo velho: print sem seta ensina o errado com a
 *      autoridade da casa, e quem foi ensinado errado não desconfia.
 *   2. LER E AUDITAR O TEXTO DA TELA. Antes de existir byte no disco: PNG gravado e apagado depois já
 *      foi gravado, e se o passo seguinte for um `git add` do diretório, ele entra no commit.
 *   3. ANOTAR, CAPTURAR, GRAVAR. Nesta ordem, uma vez, com tudo já conferido.
 */
import {
  auditarTelaDoManual,
  descreverAchados,
  type AchadoPii,
  type AllowlistArnes,
  type NegadosDeEquipe,
  type VocabularioDoSistema,
} from "./pii";
import type { Alvo, Captura, Print } from "./tipos";

/** A caixa do elemento na tela, resolvida pelo localizador FORA do navegador. */
export type Caixa = { x: number; y: number; largura: number; altura: number };

/**
 * ─ O QUE A ÁREA CAPTURADA TEM DE LISTA, MEDIDO NO NAVEGADOR ────────────────────────────────────
 *
 * `listas` é quantos contêineres de lista existem na área (tabela, cabeçalho de lista); `linhas` é
 * quantas linhas de DADO elas têm. Os dois são necessários, e não só o segundo: um print de
 * formulário legitimamente tem ZERO linha, e exigir linha dele recusaria metade do manual. O que não
 * se aceita é lista PRESENTE e vazia.
 */
export type ContagemDaArea = { listas: number; linhas: number };

/**
 * ─ A CONTAGEM É **NÚCLEO PURO**, e mora aqui pelo mesmo motivo que `textoAuditavel` ─────────────
 *
 * ┌─ POR QUE ELA NÃO PODE VIVER EM `tools/ajuda/` ──────────────────────────────────────────────┐
 * │ `tools/` não está no `pnpm-workspace.yaml` e não tem runner de teste, e esta é a peça com TODAS │
 * │ as armadilhas do DOM: `thead` (o cabeçalho não é linha de dado), `colSpan` (o estado vazio é     │
 * │ desenhado como UMA linha dentro do `tbody`), `.list-head` e `.row` do design system. Uma peça    │
 * │ assim em `tools/` seria INAUDITÁVEL, e a §A.38 exige que quem a trave em teste não seja quem a   │
 * │ escreveu. A casca do Playwright só monta o DOM e chama esta função.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE CONTA, medido no repositório em 28/09/2026 e não deduzido: `<tbody><tr>` é o idioma dominante
 * das tabelas da casa (53 usos) e `.row` o secundário (7), com `.list-head` marcando o cabeçalho de
 * lista do design system.
 *
 * A LINHA DE `colSpan` ÚNICO **NÃO É LINHA DE DADO**, e é ela que engana a régua: o estado vazio vive
 * dentro do `tbody`, como `<tr><td colSpan={10}>Nenhum cliente neste filtro.</td></tr>` (24 arquivos,
 * 30 ocorrências; o `Carregando…` idêntico em 30 arquivos). Contada como linha, a fila vazia passaria
 * no achado duro que existe justamente para pegá-la.
 */
export function contarLinhasDeDados(raiz: Element): ContagemDaArea {
  const listas = raiz.querySelectorAll("table, [role='table'], .list-head").length;
  const candidatas = new Set<Element>([
    ...Array.from(raiz.querySelectorAll("tbody tr")),
    ...Array.from(raiz.querySelectorAll("[class~='row'], [role='row']")),
  ]);
  let linhas = 0;
  for (const linha of candidatas) {
    // Cabeçalho nunca é dado: contá-lo faria toda tabela vazia ter "uma linha".
    if (linha.closest("thead")) continue;
    if (linha.classList.contains("list-head")) continue;
    const celulas = Array.from(linha.children);
    const soUma = celulas.length === 1 ? celulas[0] : undefined;
    const span = Number(soUma?.getAttribute("colspan") ?? "1");
    // Uma célula só, esticada por todas as colunas: é o slot de MENSAGEM (vazio, carregando, erro).
    if (soUma && span > 1) continue;
    linhas += 1;
  }
  return { listas, linhas };
}

/**
 * ─ A EXPECTATIVA DE LINHA É **DECLARADA PELO PRINT**, E A AUSÊNCIA É O LADO ESTRITO ─────────────
 *
 * Mesmo idioma do `ReguaDeUsuarios` (`lote.ts`): o padrão é o fail-closed, e a exceção só existe
 * como ATO ESCRITO, que aparece no diff e pode ser perguntado em revisão. O artigo que um dia queira
 * ENSINAR o estado vazio ("o que aparece quando o filtro não acha nada") declara
 * `PODE_SER_VAZIA` explicitamente; quem não declara nada exige pelo menos uma linha.
 */
export type ReguaDeLinhas = "AO_MENOS_UMA" | "PODE_SER_VAZIA";

/**
 * ─ A DECLARAÇÃO SUBIU PARA `Captura` EM 28/09/2026, E ESTE ALIAS FICOU ─────────────────────────
 *
 * O campo `linhasEsperadas` era lido daqui como extensão opcional, porque `tipos.ts` tem DONO ÚNICO
 * (o coordenador) e nenhum artigo precisava da exceção. **O primeiro caso real chegou** (a janela
 * "Enviar Link Do Portal" lista só quem não tem link, e na homologação todos têm), o dono foi
 * acionado, e o campo agora está no contrato.
 *
 * O ALIAS CONTINUA porque ele é o que este módulo consome, e trocá-lo por `Captura` em toda parte
 * seria mexer em código validado para não ganhar nada. Ele deixou de ACRESCENTAR campo e passou a
 * ser o nome local do mesmo tipo.
 */
export type CapturaComLinhas = Captura & { linhasEsperadas?: ReguaDeLinhas };

/**
 * ─ O ESTADO VAZIO ESCRITO EM PALAVRAS, e é ele que engana o gate ────────────────────────────────
 *
 * A casa escreve o vazio como "Nenhuma admissão com os filtros atuais", "Nenhuma etapa cadastrada",
 * "Nenhuma clínica neste filtro" (medido em `apps/frontend/src`: a família `Nenhum...` é o idioma do
 * vazio no sistema inteiro). Como é TEXTO, `TELA_VAZIA` nunca dispara.
 *
 * EXIGE UMA PALAVRA DEPOIS, e isso não é detalhe: "Nenhum" SOZINHO é opção de seletor ("Grupo:
 * Nenhum") e aparece em tela de formulário perfeitamente cheia. Sem a palavra seguinte, a régua
 * recusaria prints legítimos, e gate que recusa tudo é o que gera pressão para afrouxar o gate.
 */
const RE_VAZIO_ESCRITO = /\bnenhum(?:a|as|os)?\b\s+\p{L}+/iu;

/**
 * ─ E `Carregando…`, QUE É A CAPTURA QUE ACONTECEU ANTES DA TELA CARREGAR ────────────────────────
 *
 * Mesma família do vazio, causa diferente e igualmente realista: a tabela ainda está buscando. É a
 * mesma razão de o `TELA_VAZIA` existir, e aqui ela reaparece com texto dentro, então nada dispara.
 * Medido: o `Carregando…` dentro do `<tbody>` aparece em 30 arquivos do repositório.
 */
const RE_CARREGANDO = /\bcarregando\b/iu;

export type DependenciasCaptura = {
  allowlist: AllowlistArnes;
  /**
   * ─ O QUE O GATE PROCURA, E ELE É **OBRIGATÓRIO** (segundo veto do `seguranca`, 27/09/2026) ──────
   *
   * Nome e e-mail dos usuários REAIS da homologação, montados da tabela `usuarios` pela asserção de
   * arranque (`lote.ts`). Eles não podem aparecer em print nenhum, e o conjunto vem da TABELA para
   * que usuário novo do time entre na proteção sozinho.
   *
   * ┌─ POR QUE NÃO É OPCIONAL, e isto é a correção que impede a repetição ─────────────────────────┐
   * │ Enquanto era `negados?`, esquecer de passar a denylist no caminho que GRAVA não quebrava nada:  │
   * │ o typecheck passava e os 128 testes passavam, e o gate silenciosamente voltava a ser o de antes.│
   * │ Foi exatamente o furo que o `seguranca` achou na primeira rodada desta correção. PARÂMETRO      │
   * │ OPCIONAL EM CONTROLE DE SEGURANÇA É FAIL-OPEN SILENCIOSO: agora o compilador cobra.            │
   * │                                                                                                │
   * │ "Nenhum usuário a procurar" continua sendo possível, mas passa a ser um ATO escrito            │
   * │ (`{ nomes: [], emails: [] }`), que aparece no diff e pode ser perguntado em revisão.           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  negados: NegadosDeEquipe;
  /**
   * O VOCABULÁRIO DO SISTEMA QUE NÃO É PESSOA (cidade, cliente, loja, cargo), lido do banco.
   *
   * OPCIONAL, ao contrário do `negados`, e a assimetria é o desenho: ele é uma DISPENSA, então
   * esquecê-lo deixa o gate MAIS estrito (falso positivo, tela recusada), nunca mais permissivo.
   * `negados` é uma PROIBIÇÃO, e esquecê-lo seria fail-open silencioso, que foi o furo de 27/09.
   */
  vocabulario?: VocabularioDoSistema;
  /** Resolve a caixa do alvo. `null` significa "não existe mais na tela". */
  resolverAlvo: (alvo: Alvo) => Promise<Caixa | null>;
  /** O texto AUDITÁVEL da região que vai ser capturada (valor de campo incluído, senha excluída). */
  lerTextoDaTela: () => Promise<string>;
  /**
   * ─ A CONTAGEM DE LINHAS DA **ÁREA CAPTURADA**, e ela é **OBRIGATÓRIA** ─────────────────────────
   *
   * Nasce da MESMA caixa do recorte, pelo motivo já escrito em `motor.ts`: auditar uma região e
   * fotografar outra é o pior dos dois mundos, e medir a lista numa terceira seria o mesmo defeito.
   *
   * ┌─ OPCIONAL **HOJE**, E ISSO É UMA DÍVIDA DECLARADA, NÃO UM DESENHO ──────────────────────────┐
   * │ Pela régua do `negados` (veto do `seguranca`, 27/09), controle assim nasce OBRIGATÓRIO: o       │
   * │ compilador é que tem de cobrar quem esquecer de passá-lo no caminho que GRAVA. Aqui ele é       │
   * │ opcional por um motivo de PROCESSO e por mais nenhum: torná-lo obrigatório quebra              │
   * │ `captura.tester.spec.ts` (o `depsFelizes` monta o objeto inteiro), e a §A.38 proíbe esta sessão │
   * │ de editar arquivo de teste do `tester`.                                                        │
   * │                                                                                                │
   * │ ENQUANTO ISSO, A REGRA NÃO FICA SEM DENTE: ausente, a conferência ainda recusa o VAZIO ESCRITO  │
   * │ ("Nenhuma admissão com os filtros atuais"), que é como a casa desenha lista vazia na prática. O │
   * │ que se perde é só a tabela renderizada com corpo vazio E sem frase. A casca real SEMPRE passa a  │
   * │ contagem (`motor.ts`, nos dois caminhos).                                                      │
   * │                                                                                                │
   * │ FECHAMENTO: o `tester` acrescenta a contagem ao `depsFelizes` na rodada dele, e o campo vira    │
   * │ obrigatório no mesmo commit.                                                                    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  contarLinhasDaArea?: () => Promise<ContagemDaArea>;
  /** Desenha as marcações, já com as caixas resolvidas. */
  anotar: (marcacoes: Array<{ alvo: Alvo; caixa: Caixa }>) => Promise<void>;
  capturarPng: () => Promise<Buffer>;
  gravar: (caminho: string, imagem: Buffer) => Promise<void>;
};

/**
 * ─ AS OPÇÕES DO NAVEGADOR DE CAPTURA ───────────────────────────────────────────────────────────
 *
 * ┌─ NEM TRACE, NEM VÍDEO, NEM HAR, e a trava é uma CONSTANTE de propósito ──────────────────────┐
 * │ O trace do Playwright grava SNAPSHOT DO DOM a cada ação, e o snapshot carrega valor de campo em │
 * │ texto claro: a SENHA digitada no login da captura, mais tudo o que o gate recusou por tela. O   │
 * │ vídeo grava a navegação inteira, inclusive telas de passagem que nunca viraram print e por isso │
 * │ nunca passaram por gate nenhum. E o trace é o primeiro artefato que alguém anexa a um relatório │
 * │ de falha, nascido de um `trace: "on"` colocado às três da manhã. Sendo constante exportada e     │
 * │ conferida em teste, ligar o trace quebra o gate ANTES de existir arquivo.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As três que TÊM de estar: 1600x1000, escala 2 e tema claro (consertos 5 e 6 do plano). Sem elas o
 * motor não é determinístico e o diff do git acusa mudança em print que ninguém mexeu.
 */
export const OPCOES_NAVEGADOR_CAPTURA = {
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  reducedMotion: "reduce",
  locale: "pt-BR",
} as const;

export class FalhaDeCaptura extends Error {}

function descreverAlvo(alvo: Alvo): string {
  if (alvo.papel) return `${alvo.papel} "${String(alvo.nome ?? "")}"`;
  return `seletor "${alvo.seletor ?? ""}"`;
}

/** O caminho do print dentro de `public/ajuda/<slug>/`. */
export function caminhoDoPrint(slug: string, print: Print): string {
  return `apps/frontend/public/ajuda/${slug}/${print.arquivo}`;
}

/**
 * ─ UM ARTIGO PODE TER MAIS DE UM ROTEIRO, E A SAÍDA FOI MULTI-ARQUIVO, NÃO MULTI-ROTA ──────────
 *
 * ┌─ O PROBLEMA MEDIDO ──────────────────────────────────────────────────────────────────────────┐
 * │ `Roteiro` tem UMA `url`, e o carregador exigia que o nome do arquivo fosse exatamente o slug.    │
 * │ Consequência: um artigo tem imagem de UMA tela só. Foi isso que tirou o print do contrato        │
 * │ assinado de "abrir-o-prontuario-no-drive", que ensina o logo do Drive na Esteira E o contrato    │
 * │ assinado na tela de assinaturas: duas telas, um artigo.                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A SAÍDA ÓBVIA SERIA UM `url` POR IMAGEM (`Captura.url`), E ELA FOI RECUSADA. Mexe no contrato, que
 * tem dono único (§A.39), e paga um preço de desenho: com rota por imagem, o `preparo` do ROTEIRO
 * deixa de fazer sentido (ele vale "para todas as imagens", e imagens passariam a estar em telas
 * diferentes), e o estado de roteiro que o motor reconstrói entre imagens deixa de ser um estado só.
 *
 * ENTÃO A MESMA COISA SE ESCREVE SEM CONTRATO NOVO: `<slug>.roteiro.ts` e `<slug>.2.roteiro.ts` são
 * DOIS roteiros do MESMO artigo, cada um com a sua `url` e o seu preparo. Os prints caem na mesma
 * pasta, porque `caminhoDoPrint` usa o slug; o artigo continua referenciando imagem por NOME; e cada
 * imagem continua capturável sozinha, que é a propriedade que faz a §A.43 funcionar.
 *
 * O RISCO NOVO É COLISÃO DE NOME DE IMAGEM entre os dois arquivos, e ele é real: dois roteiros do
 * mesmo slug declarando `01-x.png` gravariam um em cima do outro, em silêncio. Por isso o carregador
 * confere, e é `conferirPrintsUnicos` que responde.
 */
export function slugDoArquivoDeRoteiro(nome: string): string | null {
  const base = nome.endsWith(".roteiro.ts") ? nome.slice(0, -".roteiro.ts".length) : null;
  if (!base) return null;
  // `<slug>.2`, `<slug>.3`: o sufixo numérico é a continuação do MESMO artigo, em outra tela.
  const continuacao = /^(.+)\.([0-9]+)$/.exec(base);
  return continuacao ? continuacao[1] : base;
}

/**
 * Dois roteiros do mesmo slug não podem declarar a mesma imagem: o segundo gravaria em cima do
 * primeiro e ninguém veria. Devolve as colisões, por slug e por arquivo.
 */
export function conferirPrintsUnicos(
  roteiros: Array<{ slug: string; capturas: Array<{ arquivo: string }> }>,
): Array<{ slug: string; arquivo: string; vezes: number }> {
  const contagem = new Map<string, number>();
  for (const roteiro of roteiros) {
    for (const captura of roteiro.capturas) {
      const chave = `${roteiro.slug}\u0000${captura.arquivo}`;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
  }
  return [...contagem.entries()]
    .filter(([, vezes]) => vezes > 1)
    .map(([chave, vezes]) => {
      const [slug, arquivo] = chave.split("\u0000");
      return { slug, arquivo, vezes };
    });
}

/** A pasta ÚNICA dos arquivos que o gesto `subirArquivo` pode subir. */
export const PASTA_DOS_ARQUIVOS_DE_PREPARO = "apps/frontend/src/ajuda/capturas/arquivos";

/**
 * ─ O ARQUIVO QUE O GESTO `subirArquivo` SOBE, E A TRAVA É DE §A.6 ──────────────────────────────
 *
 * ┌─ POR QUE O CAMINHO NÃO PODE SER LIVRE ───────────────────────────────────────────────────────┐
 * │ O que sobe aparece na tela, e o que aparece na tela vira PNG versionado, que o git guarda para  │
 * │ sempre. Um roteiro que pudesse apontar para qualquer lugar do disco subiria, num descuido de     │
 * │ uma linha, a planilha real que alguém deixou em `~/Downloads`, com nome e CPF de gente dentro.   │
 * │ O gate de dado pessoal audita a tela DEPOIS e provavelmente recusaria, mas a régua deste projeto │
 * │ é não depender da última barreira quando a primeira é de graça (mesma lógica da §A.33).          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENTÃO O ARQUIVO É SINTÉTICO E VERSIONADO AO LADO DO ROTEIRO, numa pasta só, e o `valor` do gesto é
 * só o NOME dele. Caminho absoluto, subida de diretório e pasta vazia são recusados aqui, antes de o
 * navegador ver o arquivo. Fail-closed: sem `valor`, o gesto não roda.
 */
export function caminhoDoArquivoDePreparo(valor: string | undefined, origem: string): string {
  const nome = (valor ?? "").trim();
  if (!nome) {
    throw new FalhaDeCaptura(
      `GESTO \`subirArquivo\` SEM ARQUIVO (${origem}). O \`valor\` do gesto é o nome do arquivo ` +
        `sintético dentro de \`${PASTA_DOS_ARQUIVOS_DE_PREPARO}\`, e sem ele não há o que subir.`,
    );
  }
  if (nome.startsWith("/") || /^[a-zA-Z]:/.test(nome) || nome.startsWith("~")) {
    throw new FalhaDeCaptura(
      `CAMINHO ABSOLUTO RECUSADO no \`subirArquivo\` (${origem}): "${nome}". O que sobe aparece na ` +
        `tela e vira PNG versionado (§A.6), então só sobe arquivo SINTÉTICO versionado em ` +
        `\`${PASTA_DOS_ARQUIVOS_DE_PREPARO}\`. Declare só o nome do arquivo.`,
    );
  }
  if (nome.split("/").some((p) => p === ".." || p === ".")) {
    throw new FalhaDeCaptura(
      `SUBIDA DE DIRETÓRIO RECUSADA no \`subirArquivo\` (${origem}): "${nome}". O arquivo tem de ` +
        `estar dentro de \`${PASTA_DOS_ARQUIVOS_DE_PREPARO}\`, e escapar dali é justamente o que a ` +
        `trava impede.`,
    );
  }
  return `${PASTA_DOS_ARQUIVOS_DE_PREPARO}/${nome}`;
}

/**
 * ─ PRINT DE LISTA VAZIA É ACHADO DURO, E NÃO UM PRINT FEIO ──────────────────────────────────────
 *
 * ┌─ POR QUE ISTO É REGRA DE GATE, E NÃO DE QUALIDADE VISUAL ────────────────────────────────────┐
 * │ A tela vazia é o ÚNICO estado que passa no gate de dado pessoal **por construção**: lista sem   │
 * │ linha não tem PII nenhuma, então o gate aprova porque está certo, não porque falhou. É a mesma  │
 * │ armadilha do `TELA_VAZIA`, disfarçada, porque "Nenhuma admissão com os filtros atuais" É texto. │
 * │                                                                                                │
 * │ E a causa realista é sempre uma das duas que importam: o ARNÊS não rodou (a fila que o roteiro   │
 * │ precisava não existe) ou a busca do preparo não casou nada. Nos dois casos o print sai mudo e     │
 * │ entra no manual ensinando uma tela onde não há nada para ver, com carimbo de gate verde.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DUAS FORMAS DO MESMO ESTADO, e as duas contam:
 *   . LISTA PRESENTE E SEM LINHA (a tabela existe, o corpo está vazio);
 *   . O VAZIO ESCRITO EM PALAVRAS, que é o que a casa faz na prática (a tabela nem é renderizada, no
 *     lugar dela vai a frase). Sem esta segunda, a contagem de linhas veria zero lista e zero linha e
 *     não teria como distinguir isso de um print de formulário.
 *
 * ┌─ O VAZIO ESCRITO **VENCE A CONTAGEM**, e é o `tester` que provou por que ───────────────────────┐
 * │ O idioma DOMINANTE das tabelas da casa desenha o vazio DENTRO do `<tbody>`, como UMA linha:      │
 * │ `<tr><td colSpan={10}>Nenhum cliente neste filtro.</td></tr>` (medido: 24 arquivos, 30            │
 * │ ocorrências; o `Carregando…` idêntico em 30 arquivos). A contagem devolve `{listas:1, linhas:1}`, │
 * │ então uma régua que saísse no `linhas > 0` seria contornada justamente pelo jeito que a MAIOR     │
 * │ parte das telas escreve o vazio, e o achado duro novo nasceria inerte.                          │
 * │                                                                                                │
 * │ Por isso a ordem é: declaração explícita primeiro, VAZIO ESCRITO depois, contagem por último.    │
 * │ O preço é recusar um print cuja área tenha linha de dado E a frase do vazio de outra lista; é     │
 * │ recusa A MAIS, que se resolve com recorte ou com a declaração, e recusa a mais é o lado           │
 * │ reversível (print a menos se refaz; print mudo no manual ensina errado).                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function acharListaVazia(
  texto: string,
  contagem: ContagemDaArea,
  regua: ReguaDeLinhas,
): AchadoPii | null {
  if (regua === "PODE_SER_VAZIA") return null;
  const vazioEscrito = RE_VAZIO_ESCRITO.test(texto) || RE_CARREGANDO.test(texto);
  if (!vazioEscrito && contagem.linhas > 0) return null;
  if (!vazioEscrito && contagem.listas === 0) return null;
  return {
    tipo: "LISTA_VAZIA",
    // §A.6: o VALOR aqui é contagem e estado, nunca conteúdo de célula.
    valor:
      `${contagem.listas} lista(s), ${contagem.linhas} linha(s) de dado` +
      `${vazioEscrito ? `, com o estado vazio ou "Carregando" escrito na tela` : ""}`,
  };
}

export function conferirListaPovoada(
  slug: string,
  print: CapturaComLinhas,
  texto: string,
  contagem: ContagemDaArea,
): void {
  const achado = acharListaVazia(texto, contagem, print.linhasEsperadas ?? "AO_MENOS_UMA");
  if (!achado) return;
  throw new FalhaDeCaptura(
    `CAPTURA RECUSADA: LISTA VAZIA. Artigo "${slug}", print "${print.arquivo}". 1 achado(s):\n` +
      `${descreverAchados([achado])}\n` +
      `  Nada foi gravado. Lista sem linha PASSA no gate de dado pessoal por construção (não há PII ` +
      `em lista vazia), então esta recusa é a única que pega o caso (§A.6, mesma régua do TELA_VAZIA).\n` +
      `  Conserto: rodar o arnês que povoa a fila deste roteiro, ou conferir a busca do preparo. Se o ` +
      `artigo ENSINA o estado vazio, ele declara \`linhasEsperadas: "PODE_SER_VAZIA"\`, e a exceção ` +
      `passa a aparecer no diff.`,
  );
}

export async function executarCaptura(
  slug: string,
  /**
   * `Captura`, e não `Print`: os alvos vivem NO ROTEIRO, e só lá (o artigo referencia a imagem pelo
   * `arquivo`). Alvo declarado em dois lugares é alvo que diverge em silêncio, e com 84 artigos a
   * divergência aparece como seta apontando para o lugar errado, não como erro.
   */
  print: CapturaComLinhas,
  deps: DependenciasCaptura,
): Promise<string> {
  // 1. TODOS os alvos, ANTES de qualquer efeito. Validar dentro do laço de desenho já desenhou a
  //    primeira seta quando descobre o problema, e a tentação é salvar o que deu certo: sai o pior
  //    print possível, uma seta certa e uma faltando, com cara de print completo.
  const marcacoes: Array<{ alvo: Alvo; caixa: Caixa }> = [];
  for (const alvo of print.alvos) {
    const caixa = await deps.resolverAlvo(alvo);
    if (!caixa) {
      throw new FalhaDeCaptura(
        `ALVO NÃO ENCONTRADO. Artigo "${slug}", print "${print.arquivo}", alvo ` +
          `${descreverAlvo(alvo)} (rótulo "${alvo.texto}").\n` +
          `  A tela mudou e o artigo ficou velho: corrija o roteiro e o texto na MESMA entrega ` +
          `(§A.43). O motor não grava print sem a marcação.`,
      );
    }
    marcacoes.push({ alvo, caixa });
  }

  // 2. O GATE, antes de existir imagem.
  const texto = await deps.lerTextoDaTela();
  conferirListaPovoada(
    slug,
    print,
    texto,
    // Ausente, a contagem é ZERO e a régua recai sobre o vazio ESCRITO (ver a nota do campo).
    deps.contarLinhasDaArea ? await deps.contarLinhasDaArea() : { listas: 0, linhas: 0 },
  );
  const veredicto = auditarTelaDoManual(texto, deps.allowlist, deps.negados, deps.vocabulario);
  if (!veredicto.aprovado) {
    // GENTE DO TIME TEM CONSERTO PRÓPRIO, e dizer o conserto errado aqui seria pior que não dizer
    // nada: os usuários da homologação são REAIS e têm de PERMANECER, então "povoar pelo arnês" e
    // "declarar na allowlist" são justamente o que NÃO se faz com eles.
    const deEquipe = veredicto.achados.some(
      (a) => a.tipo === "NOME_DE_USUARIO" || a.tipo === "EMAIL_DE_USUARIO",
    );
    throw new FalhaDeCaptura(
      `CAPTURA RECUSADA PELO GATE DE DADO PESSOAL. Artigo "${slug}", print "${print.arquivo}". ` +
        `${veredicto.achados.length} achado(s):\n${descreverAchados(veredicto.achados)}\n` +
        `  Nada foi gravado. Print entra no git e git guarda para sempre (§A.6).\n` +
        (deEquipe
          ? `  ACHADO DE USUÁRIO REAL DO TIME. Eles PERMANECEM na homologação: não se apaga, não se ` +
            `altera, não se desativa, e não se declara na allowlist. O conserto é RECORTAR a tela ` +
            `para o controle que o passo ensina, usar só a linha sintética, ou descrever o passo sem ` +
            `print.\n`
          : "") +
        `  Conserto: povoar pelo arnês sintético, recortar a tela, ou declarar a máscara da ` +
        `interface na allowlist. Afrouxar o gate não é conserto.`,
    );
  }

  // 3. Agora sim.
  await deps.anotar(marcacoes);
  const imagem = await deps.capturarPng();
  const caminho = caminhoDoPrint(slug, print);
  await deps.gravar(caminho, imagem);
  return caminho;
}
