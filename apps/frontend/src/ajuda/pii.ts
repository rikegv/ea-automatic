/**
 * ─ O GATE DE DADO PESSOAL DO PRINT: ALLOWLIST, FAIL-CLOSED (§A.6, §A.38, §3.4 do DESENHO) ───────
 *
 * ┌─ POR QUE ESTE MÓDULO MORA AQUI, E NÃO EM `tools/ajuda/` ─────────────────────────────────────┐
 * │ O gate PRECISA de teste, e `tools/` não tem runner: o `pnpm-workspace.yaml` lista só            │
 * │ `apps/backend`, `apps/frontend` e `packages/*`, e o vitest existe só nos dois apps. Um gate de  │
 * │ PII em `tools/` seria INAUDITÁVEL, e a exigência da §A.38 (o teste do gate é escrito pelo       │
 * │ `tester`, não pelo autor) ficaria impossível de cumprir. Então o NÚCLEO PURO é do frontend, e    │
 * │ em `tools/ajuda/` fica só a casca do Playwright, que importa daqui.                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A RECUSA É FALHA DURA, E NUNCA AVISO ───────────────────────────────────────────────┐
 * │ Print vai para o repositório e GIT GUARDA PARA SEMPRE: um PNG com CPF real não se desfaz com um │
 * │ commit de remoção, e a foto segue no histórico de todo clone. Mesma régua da §A.33: abster-se é │
 * │ seguro, gravar errado é IRREVERSÍVEL.                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE PERMITE É A ALLOWLIST; O QUE DISPARA A PERGUNTA É A FORMA ────────────────────────────┐
 * │ CPF, e-mail, telefone, CEP e os valores de rótulo sensível são decididos SÓ pela allowlist: o   │
 * │ valor está na lista do arnês (ou é máscara declarada da interface) ou é recusado. Não existe    │
 * │ "parece sintético".                                                                            │
 * │                                                                                                │
 * │ NOME é o caso em que a allowlist sozinha não fecha, e vale dizer por quê em vez de finge que    │
 * │ fecha: a tela da casa é inteira em title case (§A.24), então "Gestão Das Assinaturas" e         │
 * │ "Soulan Serviços Terceirizados Ltda" têm exatamente a forma de um nome de pessoa. Exigir que    │
 * │ TODA sequência capitalizada esteja numa lista recusaria a interface inteira, e o `seguranca`    │
 * │ mostrou que esse extremo é tão defeito quanto o oposto: é ele que gera a pressão para           │
 * │ enfraquecer o gate. Então o nome tem DOIS passos: um LÉXICO decide se aquilo parece nome de      │
 * │ pessoa (sobrenome ou prenome brasileiro comum ao lado de outra palavra capitalizada), e aí a     │
 * │ ALLOWLIST decide se ele pode aparecer. O léxico não é o que autoriza: é o que faz a pergunta.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ACHADO CARREGA O VALOR, e isso é para a MENSAGEM do motor, não para log persistido: quem grava
 * veredito em arquivo grava o `tipo`, nunca o `valor` (§A.6).
 */

// ── O CONTRATO ──────────────────────────────────────────────────────────────────────────────────

/**
 * O QUE O ARNÊS DECLARA TER CRIADO. É a única fonte de "pode aparecer".
 *
 * `mascaras` NÃO é conveniência: são as máscaras e os exemplos que a própria interface já mostra
 * (`placeholder` de Nova Admissão, Sala De Espera, Assinante Da Empresa e Portal). Elas violam a
 * régua literal (o CPF de máscara é prefixo 000, `email@soulan.com.br` não termina em `.invalid`) e
 * não são dado de ninguém. A exceção é LITERAL, valor a valor: `000.000.000-01` continua recusado.
 */
export type AllowlistArnes = {
  nomes: string[];
  cpfs: string[];
  emails: string[];
  telefones?: string[];
  datasNascimento?: string[];
  enderecos?: string[];
  /**
   * ─ O GESTOR **SINTÉTICO** QUE O PRÓPRIO ARNÊS CRIA (régua `ROTULO`, 28/09/2026) ────────────────
   *
   * O campo `dados_vaga_folha.gestor_bp` é dado de TERCEIRO e é protegido pela ESTRUTURA: a regra de
   * rótulo `GESTOR` recusa a imagem que DESENHA o campo, qualquer que seja o valor (ver
   * `REGRAS_DE_ROTULO` e a régua `ROTULO` em `lote.ts`). O arnês, porém, PREENCHE aquele campo nas
   * telas que ele mesmo monta, e sem poder declarar o valor que criou a tela do arnês seria recusada
   * por um dado que não é de ninguém, que é a degeneração "recusa tudo" descrita neste arquivo.
   *
   * ELE NÃO ENTRA EM `nomes`, e a separação é a mesma de `enderecos`: um saco só de "permitidos"
   * transforma uma dispensa estreita em larga sem ninguém perceber. Gestor sintético com FORMA de
   * nome de pessoa precisa ser declarado nos DOIS (aqui, para a regra de rótulo; em `nomes`, para o
   * léxico), e isso é proposital: são duas autorizações distintas, e cada uma aparece no diff.
   */
  gestores?: string[];
  salarios?: string[];
  contasBancarias?: string[];
  matriculas?: string[];
  /**
   * AS SENHAS QUE O ARNÊS CRIOU (credencial do iFractal, §A.6). Declarar uma senha REAL aqui é
   * proibido pelo mesmo motivo de declarar um usuário do time: a allowlist é o que PODE APARECER no
   * print, e credencial de gente não pode aparecer em lugar nenhum.
   */
  senhas?: string[];
  mascaras?: string[];
};

/**
 * ─ O CONJUNTO QUE O GATE **PROCURA**, e não o que ele permite (correção de premissa, 27/09/2026) ──
 *
 * ┌─ O DEFEITO QUE ISTO CONSERTA ────────────────────────────────────────────────────────────────┐
 * │ Os usuários da homologação são REAIS: são o time do diretor testando o sistema, e eles têm de   │
 * │ PERMANECER (não se apaga, não se altera, não se desativa). A primeira versão tratava a tabela   │
 * │ `usuarios` como a `candidatos`, exigindo população 100% sintética, e o desenho tinha ainda um    │
 * │ segundo furo, pior: `montarAllowlist` recebia `[...candidatos, ...usuarios]`, então o nome e o   │
 * │ e-mail corporativo de cada colega entravam na lista do que PODE APARECER no print.              │
 * │                                                                                                │
 * │ A correção inverte o papel da tabela `usuarios`: ela deixa de ser fonte de allowlist e passa a  │
 * │ ser fonte de DENYLIST. O motor lê `usuarios` no arranque e monta o conjunto de nomes e e-mails   │
 * │ a PROCURAR em cada imagem. Achou, recusa aquela imagem, com falha dura, como já faz com CPF.    │
 * │                                                                                                │
 * │ A propriedade que faz isso sobreviver: o conjunto vem da TABELA, nunca de lista escrita à mão,  │
 * │ então usuário novo do time entra na proteção sozinho, sem ninguém lembrar de cadastrá-lo.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A DENYLIST GANHA DE TUDO, e é isso que a torna um controle: ela é conferida antes e por fora da
 * allowlist, do léxico de nome e das famílias sintéticas de e-mail. Medido na homologação em
 * 27/09/2026: 27 dos 33 usuários têm e-mail `@homolog.local`, que o gate DISPENSA por ser família
 * sintética declarada. Se a denylist respeitasse essa dispensa, ela não protegeria justamente a maior
 * parte do time. O único jeito de um nome sair da denylist é ele estar DECLARADO pelo arnês, e quem
 * declara é a conta sintética de captura, que não é de ninguém.
 */
export type NegadosDeEquipe = {
  nomes: string[];
  emails: string[];
  /**
   * ─ OS NOMES VINDOS DE **COLUNA DE TEXTO LIVRE**, E POR QUE ELES SÃO OUTRA COISA ────────────────
   *
   * ┌─ O FALSO POSITIVO MEDIDO QUE ORIGINOU A SEPARAÇÃO (28/09/2026, execução real) ──────────────┐
   * │ Com os 431 valores de `dados_vaga_folha.gestor_bp` somados a `nomes`, a tela                   │
   * │ `/admin/integracao-clientes` foi RECUSADA por `NOME_DE_USUARIO: raful - cozinha`. Aquilo não é  │
   * │ nome de pessoa: é nome de OPERAÇÃO. **108 dos 390** valores de duas ou mais palavras são assim   │
   * │ (medido pelo coordenador). O estrago não veio da BUSCA na imagem: veio da SUBTRAÇÃO, porque      │
   * │ `montarVocabularioDoSistema` descarta por CONTENÇÃO, e aqueles 108 derrubaram a dispensa de       │
   * │ clientes homônimos, fazendo o léxico recusar a tela por um catálogo que ele antes dispensava.    │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A SUBTRAÇÃO EXISTE PARA PROTEGER O **COLEGA** cujo nome coincide com um valor de catálogo, e isso
   * vale para `usuarios` e `comerciais`, que são PESSOAS, uma a uma, cadastradas como tal. Uma coluna
   * de texto livre não é uma lista de pessoas: é um campo em que alguém digita o que quiser, e usá-la
   * para PODAR o catálogo é emprestar a ela uma autoridade que ela não tem.
   *
   * ENTÃO A REGRA É: estes nomes entram na BUSCA de cada imagem (`negadosEncontrados`, igual aos
   * outros, sem dispensa nenhuma) e **NUNCA** na subtração do vocabulário (`contemNomeNegado`). A
   * separação é um campo EXPLÍCITO no tipo, e não uma segunda lista solta ao lado, justamente para o
   * caminho errado exigir um ato de escrita: quem quiser podar catálogo com isto tem de trocar o campo
   * no código, e o diff mostra.
   */
  nomesDeColuna?: string[];
};

/**
 * ─ O VOCABULÁRIO DO SISTEMA QUE **NÃO É PESSOA** (correção do falso positivo, 27/09/2026) ───────
 *
 * ┌─ O DEFEITO MEDIDO, E POR QUE ELE É TÃO GRAVE QUANTO UM VAZAMENTO ────────────────────────────┐
 * │ O léxico de nome pergunta "isto parece nome de gente?" olhando prenome e sobrenome brasileiros │
 * │ ao lado de outra palavra capitalizada. Três telas reais reprovaram por isso, e NENHUMA delas    │
 * │ mostrava pessoa nenhuma:                                                                       │
 * │   . `/esteira`        NOME: "BC CAMPINAS PARQUE D PEDRO SHOPPING"  (é `cliente_lojas.nome`)     │
 * │   . `/admin/tarifas`  NOME: "Ferraz de Vasconcelos" e "São Paulo"  (são `as_cidades.nome`)      │
 * │ "Campinas", "Ferraz" e "Pedro" são sobrenome e prenome de verdade; loja e cidade não são gente. │
 * │                                                                                                │
 * │ Um gate que recusa tudo NÃO protege ninguém e impede o manual inteiro, e é exatamente essa      │
 * │ pressão que faz alguém afrouxar o gate de verdade mais adiante. A degeneração é um defeito de   │
 * │ segurança, não um incômodo de usabilidade.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CORREÇÃO É POR CATÁLOGO LIDO DO BANCO, NUNCA POR EXCEÇÃO ESCRITA À MÃO ───────────────────┐
 * │ Mesma propriedade que torna a denylist confiável: a fonte é a TABELA. Cidade nova, cliente novo │
 * │ e loja nova entram sozinhos, e ninguém precisa lembrar de editar uma lista. Lista escrita à mão │
 * │ envelhece no primeiro cadastro e volta a recusar a tela.                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS TRAVAS QUE IMPEDEM ISTO DE VIRAR UMA PORTA ─────────────────────────────────────────┐
 * │ 1. A DISPENSA É PELO **VALOR INTEIRO**, nunca por pedaço. O trecho que a tela mostra tem de ser │
 * │    IGUAL, inteiro, a uma entrada do catálogo. Aceitar "contido em" faria o cliente              │
 * │    "MARIA SILVA COMERCIO LTDA" liberar o nome "Maria Silva" de uma pessoa, que é precisamente o │
 * │    risco de um catálogo homônimo de gente. É a mesma régua da subtração literal da conta de     │
 * │    captura: valor a valor, nunca família.                                                      │
 * │ 2. A DENYLIST GANHA DA ALLOWLIST, SEMPRE, e por DOIS caminhos independentes:                    │
 * │    (a) `negadosEncontrados` roda ANTES e POR FORA daqui, então nome de colega recusa a imagem   │
 * │        mesmo que também seja entrada de catálogo, e o catálogo não tem como apagar esse achado; │
 * │    (b) `montarVocabularioDoSistema` JÁ NASCE subtraído: entrada de catálogo que contenha nome   │
 * │        de alguém do time é descartada na montagem e nunca chega a dispensar nada.               │
 * │    Uma trava sozinha bastaria; as duas existem porque a (b) depende de quem monta e a (a) não.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELE SÓ VALE PARA **NOME**, e isso é desenho: catálogo não dispensa CPF, e-mail, telefone, CEP nem
 * valor de rótulo sensível. Cidade não tem CPF, e misturar as coisas num saco só de "permitidos" é
 * como uma dispensa estreita vira uma larga sem ninguém perceber.
 */
export type VocabularioDoSistema = { valores: string[] };

export type TipoAchadoPii =
  | "NOME_DE_USUARIO"
  | "EMAIL_DE_USUARIO"
  | "CPF"
  | "EMAIL"
  | "TELEFONE"
  | "NOME"
  | "NASCIMENTO"
  | "ENDERECO"
  /**
   * O CAMPO DO GESTOR (`dados_vaga_folha.gestor_bp`), que é dado de TERCEIRO e o que o diretor mandou
   * MANTER protegido em 28/09/2026. O achado é emitido pela regra de rótulo `GESTOR`, e ele recusa a
   * imagem que DESENHA o campo: a proteção é estrutural, não por lista de valores conhecidos.
   */
  | "GESTOR"
  | "SALARIO"
  | "CONTA_BANCARIA"
  | "MATRICULA"
  | "SENHA"
  | "CEP"
  | "TELA_VAZIA"
  /**
   * ─ A LISTA VAZIA: O ÚNICO ESTADO QUE PASSA NO GATE **POR CONSTRUÇÃO** ─────────────────────────
   *
   * Lista sem linha não tem dado pessoal nenhum, então ela é APROVADA por um gate que funciona
   * perfeitamente. É a mesma armadilha do `TELA_VAZIA` acima, só que DISFARÇADA, porque "Nenhuma
   * admissão com os filtros atuais" **é** texto: o gate vê conteúdo, aprova, e o manual ganha um
   * print que ensina uma tela onde não há nada para ver.
   *
   * QUEM O EMITE é `acharListaVazia` (`captura.ts`), e não `auditarTexto`: a contagem de linhas nasce
   * da MESMA caixa do recorte, e a régua precisa dela, que `auditarTexto` não recebe. O tipo mora aqui
   * para o achado ser descrito e deduplicado pelo mesmo caminho dos outros (`descreverAchados`).
   *
   * NÃO É VALOR MORTO NO ENUM: `conferirListaPovoada` constrói o achado e o imprime na recusa. Enum com
   * membro que ninguém emite é cobertura IMAGINÁRIA, o oposto do que esta frente construiu.
   */
  | "LISTA_VAZIA"
  | "ALLOWLIST_VAZIA";

export type AchadoPii = { tipo: TipoAchadoPii; valor: string };

export type VeredictoPii = { aprovado: boolean; achados: AchadoPii[] };

// ── NORMALIZAÇÃO ────────────────────────────────────────────────────────────────────────────────

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const achatar = (t: string) => semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
const soDigitos = (t: string) => t.replace(/\D/g, "");

function listaAchatada(valores: string[] | undefined): Set<string> {
  return new Set((valores ?? []).map(achatar).filter(Boolean));
}
function listaDeDigitos(valores: string[] | undefined): Set<string> {
  return new Set((valores ?? []).map(soDigitos).filter(Boolean));
}

// ── O LÉXICO QUE FAZ A PERGUNTA (não é ele que autoriza) ─────────────────────────────────────────

const SOBRENOMES = new Set(
  (
    "silva santos oliveira souza sousa lima pereira ferreira alves rodrigues costa gomes martins " +
    "araujo melo barbosa ribeiro carvalho almeida lopes soares fernandes vieira monteiro cardoso " +
    "rocha moreira nunes marques machado freitas cavalcante cavalcanti " +
    "duarte teixeira correia correa cunha pinto moura azevedo batista miranda ramos reis andrade " +
    "borges castro mendes farias sales neves aguiar brito xavier siqueira bezerra queiroz tavares " +
    "coelho pires fonseca macedo guimaraes antunes figueiredo camargo bastos peixoto sampaio leite " +
    "mota matos medeiros paiva prado salgado vasconcelos viana amaral garcia goncalves jesus leal " +
    "magalhaes menezes pacheco rezende resende sena simoes valadares veloso petrocelli caetano " +
    "bandeira chaves damaceno damasceno dantas godoi godoy guedes ferraz juliao lacerda motta " +
    "padilha paz perez pontes portela quintino rangel sardinha sobrinho tenorio trindade valente " +
    "verissimo zanetti"
  ).split(" "),
);

const PRENOMES = new Set(
  (
    "ana maria joao jose carlos paulo pedro lucas marcos luiz luis antonio francisco rafael gabriel " +
    "daniel bruno felipe rodrigo fernando gustavo eduardo leonardo mateus matheus thiago tiago " +
    "vinicius andre alexandre roberto ricardo sergio marcelo julio cesar juliana fernanda mariana " +
    "patricia camila aline amanda bruna carla claudia cristina daniela debora eliane erica fabiana " +
    "gabriela jessica larissa leticia luciana marcia michele monica natalia priscila renata " +
    "rosana sabrina sandra simone tatiane vanessa vera viviane henrique jorge raimundo sebastiao " +
    "wagner wellington washington juliano"
  ).split(" "),
);

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

// ── AS EXPRESSÕES ───────────────────────────────────────────────────────────────────────────────

/** CPF com máscara, e CPF cru de 11 dígitos. Os dois, porque o cru é o que mais escapa. */
const RE_CPF = /(?<![\d/])(?:\d{3}[.\s]\d{3}[.\s]\d{3}[-\s]\d{2}|\d{11})(?![\d/-])/g;
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
/**
 * TELEFONE precisa de DDD explícito ou do nono dígito (grupo de 5). Sem isso, a forma `\d{4}-\d{4}`
 * captura código de vaga ("SIM-2026-0501") e ano-sequência, e o gate passa a recusar a esteira
 * inteira por causa de um código que não é de ninguém.
 */
const RE_TELEFONE = /(?<!\d)(?:\(\d{2}\)\s?\d{4,5}-\d{4}|\d{2}[\s-]\d{4,5}-\d{4}|\d{5}-\d{4})(?!\d)/g;
const RE_CEP = /(?<!\d)\d{5}-\d{3}(?!\d)/g;
const RE_DINHEIRO = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const RE_DATA = /(?<!\d)\d{2}\/\d{2}\/\d{4}(?!\d)/g;
const RE_NUMERO_DE_CONTA = /(?<!\d)\d{4,}(?:-\d)?(?!\d)/g;
/** Sequência capitalizada, com as ligações do português no meio. */
/** NÃO atravessa quebra de linha: `\s` juntaria o fim de uma linha com o começo da outra e
 *  fabricaria "nome" a partir de duas células de tabela que nada têm a ver uma com a outra. */
const RE_CAPITALIZADO =
  /\b[A-ZÀ-Ý][A-Za-zÀ-ÿ']+(?:[ \t]+(?:de|da|do|das|dos|e|[A-ZÀ-Ý][A-Za-zÀ-ÿ']*))+\b/g;

/**
 * OS RÓTULOS SENSÍVEIS, e por que a regra deles é por RÓTULO e não por forma: "15/03/1988" e
 * "01/10/2026" têm a mesma forma, e um é data de nascimento e o outro é a data de admissão que o
 * manual PRECISA mostrar; "R$ 1.518,00" pode ser salário ou tarifa de VT. Regra de forma recusaria
 * as duas coisas e cairia no extremo "recusa tudo".
 */
type RegraDeRotulo = {
  tipo: TipoAchadoPii;
  rotulo: RegExp;
  formas: RegExp[];
  permitidos: (a: AllowlistArnes) => string[] | undefined;
  /** Endereço não tem forma: o valor é o resto da frase, até o separador. */
  restoDaFrase?: boolean;
  /**
   * ─ O VALOR ESTÁ NA **CÉLULA SEGUINTE**, e não no resto da frase (regra da SENHA) ────────────────
   *
   * `restoDaFrase` não alcança o caso da tabela: o rótulo vem de um `placeholder` ou de um
   * `aria-label`, que o `textoAuditavel` emite entre quebras de linha, e o VALOR do campo vem no
   * segmento SEGUINTE. Com `restoDaFrase`, o resto da linha do rótulo é vazio e nada é conferido.
   */
  proximoToken?: boolean;
  /**
   * ─ O VALOR SEM FORMA QUE CAIU NA **CÉLULA SEGUINTE** (regra do GESTOR) ─────────────────────────
   *
   * `restoDaFrase` só alcança o valor que está na MESMA linha do rótulo, e MEDIDO no código de
   * produção isso deixa metade dos casos de fora: em `EditAdmissaoModal` (`Campo rotulo="Gestor / BP"`
   * com um `<input>` dentro) e em `AdmissaoDetalheModal` (`Campo rotulo="Gestor BP" valor=...`) o
   * rótulo e o valor saem de `textoAuditavel` em SEGMENTOS SEPARADOS, porque cada um é um elemento de
   * bloco (e o valor do input vem do caminho `\n${valor}\n`). O resto da linha do rótulo é VAZIO, e
   * sem esta flag a regra aprovaria exatamente a tela que desenha o campo.
   *
   * É a mesma lição de `proximoToken` (SENHA), com a diferença que importa: lá o valor tem FORMA
   * (`RE_FORMA_DE_SENHA` separa a credencial das palavras de interface), aqui não tem nenhuma, então o
   * PRIMEIRO segmento não vazio depois do rótulo é o valor. Isso torna a regra mais barulhenta de
   * propósito: o lado errado dela é recusar um print a mais (reversível), não gravar PII de terceiro
   * no git (irreversível, §A.6, §A.33).
   *
   * SÓ A REGRA DO GESTOR A USA. `ENDERECO` tem o MESMO buraco medido e NÃO foi tocado nesta rodada:
   * mudar o comportamento dele alcança código já validado e teste que esta sessão não pode editar
   * (§A.14, §A.26). Fica REPORTADO ao coordenador, não consertado de lado.
   */
  segmentoSeguinte?: boolean;
  /**
   * ─ O VALOR COLHIDO SÓ É ACHADO SE TIVER **FORMA DE NOME DE PESSOA** (regra do GESTOR) ───────────
   *
   * ┌─ A MEDIÇÃO QUE OBRIGOU ISTO (`ajuda:conferir`, 4 roteiros, 28/09/2026) ─────────────────────┐
   * │ A colheita por rótulo recusou TRÊS telas com valor que não é de pessoa nenhuma:                 │
   * │ `GESTOR: Tempo de contrato`, `GESTOR: Uniforme` (rótulos do campo SEGUINTE, colhidos quando o    │
   * │ campo do gestor está VAZIO) e `GESTOR: GESTOR SIMULADO` (o gestor sintético do próprio arnês).   │
   * │ Tela recusada por dado que não é de ninguém é a degeneração "recusa tudo" deste arquivo, e é ela  │
   * │ que gera a pressão para afrouxar o gate de verdade mais adiante.                                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O TESTE É O **MESMO** `pareceNomeDePessoa` que o detector de nome usa, reusado e não reescrito:
   * duas réguas de "isto parece gente?" divergem no primeiro ajuste, e a que fica para trás vira o
   * buraco. Ele não é lista de exceção: nenhum daqueles três tem prenome ou sobrenome do léxico.
   *
   * ┌─ O CUSTO É REAL E FICA **DECLARADO**, no espírito do residual dos 11 dígitos ────────────────┐
   * │ A regra deixa de cobrir o valor que não tem forma de nome: os de UMA palavra (41 dos 431, medidos)│
   * │ e o nome cujo prenome e sobrenome o léxico não conhece. A COMPENSAÇÃO é a outra camada: o gestor  │
   * │ voltou à DENYLIST (`REGUA_DAS_COLUNAS_DE_PESSOA`, `lote.ts`), que é busca LITERAL e não depende do │
   * │ léxico. As duas se cobrem: a denylist pega o que ESTÁ no banco, esta pega o que é NOVO, o que nem  │
   * │ está no banco ainda e o que entrou depois do arranque do lote. A contagem exata de cada camada    │
   * │ está no relatório da rodada 4 e foi medida contra a homologação.                                │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  exigeFormaDeNome?: boolean;
  /**
   * ─ OU O VALOR É, LITERALMENTE, UM VALOR CONHECIDO DA COLUNA (rodada 5, decisão do coordenador) ──
   *
   * ┌─ O BURACO QUE ISTO FECHA, achado pela cobertura independente ────────────────────────────────┐
   * │ Com as duas camadas ligadas, uma fatia continuava passando com ZERO achado: valor de UMA palavra. │
   * │ A denylist de coluna não o procura (`variantesDeNomeDeUsuario` devolve `[]` para uma palavra, e   │
   * │ isso é decisão antiga e correta: procurar "Fernando" solto recusaria meia interface), e a regra de │
   * │ rótulo o descartava por `exigeFormaDeNome`. É a MESMA fatia dos 41 de 431 que motivou a troca de   │
   * │ instrumento, reaberta por outro caminho: "as duas camadas se cobrem" era verdade só para o valor   │
   * │ com forma de nome.                                                                              │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA: o valor colhido ao lado do rótulo vira achado se tiver forma de nome **OU** se for IGUAL,
   * como SEGMENTO INTEIRO e normalizado, a um valor conhecido da coluna (`nomesDeColuna`).
   *
   * ┌─ POR QUE AMARRADA AO RÓTULO, e não busca literal na tela inteira ────────────────────────────┐
   * │ Os valores de uma palavra não são todos gente: a coluna carrega nome de OPERAÇÃO junto (medido:   │
   * │ 108 dos 390 de duas ou mais palavras não têm forma de pessoa, e foi daí que nasceu o                │
   * │ `raful - cozinha`). Procurar "COZINHA" na tela inteira recusaria qualquer tela que escreva a       │
   * │ palavra, pelo MESMO mecanismo que a rodada 4 acabou de consertar. Amarrada ao rótulo, a igualdade  │
   * │ só dispara onde está escrito "Gestor": o alcance é o CAMPO, e o falso positivo fica impossível por │
   * │ construção.                                                                                     │
   * │                                                                                                │
   * │ IGUALDADE, NUNCA CONTENÇÃO. Contenção é exatamente como o `raful - cozinha` nasceu (a variante    │
   * │ casando como prefixo do nome de um cliente).                                                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O ÚNICO RESIDUAL QUE SOBRA, e fica ESCRITO ────────────────────────────────────────────────┐
   * │ Valor de UMA palavra que AINDA NÃO ESTÁ no banco no momento do lote (gestor cadastrado depois do  │
   * │ arranque, com nome de uma palavra que o léxico não conhece). Ele não é procurado em lugar nenhum  │
   * │ deste gate, por uma decisão documentada e deliberada: nome de uma palavra não vira busca, porque  │
   * │ isso recusaria meia interface. As outras TRÊS classes estão cobertas: forma de nome (rótulo,      │
   * │ esteja no banco ou não), 2+ palavras que o léxico não conhece (denylist de coluna, literal) e     │
   * │ uma palavra que ESTÁ no banco (esta igualdade).                                                  │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  valorConhecidoDaColuna?: boolean;
  /**
   * ─ ENDEREÇO: O VALOR COLHIDO SÓ É ACHADO SE TIVER **FORMA DE ENDEREÇO** ────────────────────────
   *
   * É a MESMA correção que `exigeFormaDeNome` fez na regra `GESTOR`, e pelo mesmo motivo: a régua que
   * decide o que é PII não muda, muda o que a regra aceita como VALOR do campo. Conserta a COLHEITA,
   * nunca o critério de dispensa, que continua sendo só a allowlist.
   *
   * ┌─ O QUE A RÉGUA ANTERIOR (`exigeNumeroOuVirgula`) DEIXAVA PASSAR, MEDIDO ─────────────────────┐
   * │ `ImportarLojasModal.tsx:219` escreve, em prosa: "A leitura entende quais colunas são o nome, o   │
   * │ endereço e o código, e você confere e corrige antes de gravar. Nada é gravado sem o seu aceite." │
   * │ O rótulo casa em "endereço", o `restoDaFrase` leva O RESTO DA FRASE como se fosse o valor do     │
   * │ campo, e a antiga régua o aprovava como endereço por causa das VÍRGULAS do texto corrido. Não    │
   * │ havia endereço nenhum na tela: era prosa. O buraco já estava registrado neste arquivo.          │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A RÉGUA NOVA É MAIS ESTREITA QUE A ANTIGA, e é por isso que ela é aceitável: "tem uma vírgula em
   * algum lugar" é satisfeito por qualquer frase do idioma; "tem forma de endereço" exige um dos três
   * sinais que endereço de tela real carrega e prosa de interface não carrega (ver `pareceEndereco`).
   *
   * ┌─ O RESIDUAL, DECLARADO, no espírito do residual dos 11 dígitos ─────────────────────────────┐
   * │ Endereço sem tipo de logradouro, sem CEP e sem número depois da vírgula deixa de ser colhido     │
   * │ ("Logradouro: Centro"). É o preço da régua estreita, e é o MESMO preço que a antiga já pagava    │
   * │ ("Logradouro: Rua Sem Numero" passava antes e agora RECUSA, porque tem "Rua"): na prática esta   │
   * │ régua cobre MAIS endereço de verdade do que a que ela substitui, e menos prosa. O conserto certo,│
   * │ se doer, é o roteiro recortar a tela, e nunca voltar a colher o resto do rótulo como valor.      │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  exigeFormaDeEndereco?: boolean;
};

/**
 * ─ O QUE TEM FORMA DE CREDENCIAL, e por que a régua não é "o próximo segmento qualquer" ──────────
 *
 * TOKEN ÚNICO (senha não tem espaço), de 4 a 64 caracteres, e com pelo menos um DÍGITO ou símbolo de
 * senha. Essa última condição é o que separa o valor da credencial das PALAVRAS DE INTERFACE que
 * também aparecem depois do rótulo: "Entrar", "Salvar", "Esqueci" e o próprio placeholder "senha" são
 * só letras, e a tela de login (onde o campo é `type=password` e nem é auditado) deixa de ser recusada
 * por um botão.
 *
 * O RESIDUAL, DECLARADO: senha só de letras não é pega. É o preço de não recusar toda tela com um
 * rótulo de senha, e ele é pequeno onde importa, porque a credencial que o sistema GERA para o
 * iFractal tem dígito. Quem quiser fechar isso fecha na origem: o campo devia ser `type="password"`.
 */
const RE_FORMA_DE_SENHA = /^(?=[^\s]*[\d@#$%&*!?])[^\s]{4,64}$/u;

/**
 * ─ O RÓTULO É PALAVRA INTEIRA (`\b`), E ISSO ERA UM DEFEITO MEDIDO ──────────────────────────────
 *
 * ┌─ O CASO REAL (achado do `seguranca`, 28/09/2026) ────────────────────────────────────────────┐
 * │ `conta` sem `\b` casa DENTRO de "contagem", e um dos roteiros do manual fotografa exatamente   │
 * │ "a contagem das linhas marcadas". Qualquer número de 4 dígitos na vizinhança daquela frase      │
 * │ (um código de vaga, um total, um ano) virava um achado `CONTA_BANCARIA`, e a tela era recusada  │
 * │ por um rótulo que não existe ali.                                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PLURAL CONTINUA CASANDO (`contas?`, `sal[aá]rios?`): a tela escreve tanto "Conta" quanto
 * "Contas", e exigir singular trocaria um falso positivo por um falso NEGATIVO, que é o lado que não
 * se aceita. A borda remove a casa DENTRO de outra palavra, não a flexão.
 *
 * ┌─ E A BORDA **NÃO** É `\b`, POR UM CASO QUE O `tester` TRAVOU ────────────────────────────────┐
 * │ `\b` exige que o vizinho não seja LETRA NEM DÍGITO, e a tabela da casa parte a célula em dois   │
 * │ nós (`<span>Conta</span><span>87421-6</span>`), que o `textoAuditavel` CONCATENA: o rótulo chega │
 * │ colado no valor, "Conta87421-6". Com `\b`, o rótulo de VERDADE deixaria de disparar justamente   │
 * │ ali, e falso negativo em gate de PII é dado no repositório para sempre (§A.6), que é o oposto do │
 * │ que a correção queria. A borda é "não colado a LETRA" (`\p{L}`): mata "contagem",                │
 * │ "Contabilidade", "Agenciamento", "Pixel", "Descontar" e "Renascimento", e preserva o valor       │
 * │ numérico colado.                                                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
/**
 * ─ O MARCADOR DE CÉLULA VAZIA **NÃO É VALOR DE NINGUÉM** ────────────────────────────────────────
 *
 * MEDIDO no código, não suposto: `AdmissaoDetalheModal` escreve `gestorBp || "não informado"`
 * (o marcador da §A.12) e o `Linha` de `ApresentacaoIntegracaoModal` desenha `—` quando o valor é
 * nulo. Sem esta dispensa, TODA tela com o campo VAZIO seria recusada com um achado cujo "valor" é o
 * texto fixo da interface, e o gate degeneraria justamente onde não há dado nenhum a proteger.
 *
 * A DISPENSA É LITERAL E CURTA, no espírito das máscaras da interface: ela cobre o marcador INTEIRO,
 * então "não informado" passa e "não informado, falar com Ana Souza" continua sendo um achado.
 */
const MARCADORES_DE_CELULA_VAZIA = ["não informado", "—", "-"];

const REGRAS_DE_ROTULO: RegraDeRotulo[] = [
  {
    tipo: "NASCIMENTO",
    rotulo: /(?<!\p{L})(?:nascimento(?!\p{L})|nasc\.)/giu,
    formas: [RE_DATA],
    permitidos: (a) => a.datasNascimento,
  },
  {
    tipo: "SALARIO",
    rotulo: /(?<!\p{L})(?:sal[aá]rios?|pretens[aã]o|remunera[cç][aã]o|valor bruto)(?!\p{L})/giu,
    formas: [RE_DINHEIRO],
    permitidos: (a) => a.salarios,
  },
  {
    tipo: "CONTA_BANCARIA",
    rotulo: /(?<!\p{L})(?:ag[eê]ncias?|contas?|pix)(?!\p{L})/giu,
    formas: [RE_NUMERO_DE_CONTA],
    permitidos: (a) => a.contasBancarias,
  },
  {
    tipo: "MATRICULA",
    rotulo: /(?<!\p{L})matr[ií]culas?(?!\p{L})/giu,
    formas: [RE_NUMERO_DE_CONTA],
    permitidos: (a) => a.matriculas,
  },
  /**
   * ─ SENHA: A CREDENCIAL QUE **É DESENHADA NO PNG** (veto do `seguranca`, 28/09/2026) ─────────────
   *
   * ┌─ O FURO, MEDIDO E NÃO DEDUZIDO ──────────────────────────────────────────────────────────────┐
   * │ A aba iFractal da Esteira renderiza a senha num `<input>` **sem `type="password"`**            │
   * │ (`app/(app)/esteira/page.tsx:2261-2269`). Duas consequências que se SOMAM: o valor aparece na   │
   * │ IMAGEM, e a exclusão de campo de senha do `textoAuditavel` NÃO se aplica, porque ela casa por    │
   * │ `type=password`. Sem esta regra, `auditarTexto("Login\nSenha\nSou@2026\njoao.silva")` voltava    │
   * │ APROVADO, com ZERO achados. O menu `esteira` está concedido à conta de captura; a homologação    │
   * │ tem 1 credencial, a produção tem 124.                                                          │
   * │                                                                                                │
   * │ O comentário daquela tela ("a senha aparece porque é descartável, e NUNCA é logada") é anterior  │
   * │ ao manual. Credencial em PNG versionado é PIOR que em log: o git guarda para sempre e nenhum     │
   * │ commit desfaz (§A.6, mesma régua irreversível da §A.33).                                        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ESTA REGRA É OUTRA COISA QUE A EXCLUSÃO POR `type=password`, e as duas convivem: a exclusão
   * protege o campo que É senha (e impede a senha de entrar na mensagem de erro e no log); esta protege
   * o VALOR QUE APARECE AO LADO DO RÓTULO, que é caso diferente e é o único que existe quando a tela
   * desenha a credencial em texto claro.
   */
  {
    tipo: "SENHA",
    rotulo: /(?<!\p{L})(?:senhas?|password)(?!\p{L})/giu,
    formas: [],
    permitidos: (a) => a.senhas,
    proximoToken: true,
  },
  /**
   * ─ GESTOR: O CAMPO DE TERCEIRO QUE O DIRETOR MANDOU MANTER PROTEGIDO (28/09/2026) ───────────────
   *
   * ┌─ POR QUE A PROTEÇÃO É POR **RÓTULO** E NÃO POR LISTA DE VALORES ─────────────────────────────┐
   * │ `dados_vaga_folha.gestor_bp` já era protegido por DENYLIST (os 431 valores da base entravam no    │
   * │ conjunto que o gate procura). Três medições reprovaram aquele instrumento, e as três estão         │
   * │ escritas na régua `ROTULO` de `lote.ts`: (1) a denylist não cobria 36 dos 431, porque              │
   * │ `variantesDeNomeDeUsuario` ignora nome de UMA palavra; (2) inflar a denylist de 44 para 475 nomes  │
   * │ levava `montarVocabularioDoSistema` de 11,4 s para 252,8 s POR ROTEIRO; (3) ela recusou            │
   * │ `/admin/integracao-clientes` por `raful - cozinha`, que é nome de OPERAÇÃO, não de pessoa.        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ESTA REGRA É MAIS FORTE, e não mais fraca: a denylist só pegava o valor que ela CONHECIA, e só com
   * duas palavras. Esta recusa a imagem que DESENHA O CAMPO, então ela cobre os 431 valores, o gestor
   * cadastrado DEPOIS do arranque do lote (a remontagem relê `usuarios` e `comerciais`, nunca
   * `gestor_bp`), o de uma palavra, e o valor que ainda nem está no banco. E ela não tem falso positivo
   * sobre catálogo, porque não procura VALOR: procura RÓTULO.
   *
   * OS RÓTULOS FORAM MEDIDOS NO CÓDIGO DAS TELAS QUE DESENHAM O CAMPO, um por um:
   *   . `"Gestor BP"`   -> `ApresentacaoIntegracaoModal.tsx:144`, `AdmissaoDetalheModal.tsx:200-201`
   *                        e `:1115`;
   *   . `"Gestor / BP"` -> `EditAdmissaoModal.tsx:748`, `nova/page.tsx:1059` ("Gestor / BP *"),
   *                        `PendenciasModal.tsx:21`, `liberacao/page.tsx:1995` e `:2513`;
   *   . `"gestor_bp"`   -> a chave crua, `AdmissaoDetalheModal.tsx:201` (o de/para de rótulos).
   * O sufixo é OPCIONAL para o rótulo sobreviver a uma tela nova que escreva só "Gestor", e ele é
   * consumido junto quando existe: sem isso, o "BP" sobraria DENTRO do valor e a declaração do arnês
   * (`gestores`) nunca casaria, recusando a tela do próprio arnês.
   *
   * `bp` SOLTO TAMBÉM CASA, e isso custa zero hoje: `grep -n "\bBP\b"` em `apps/frontend/src` não
   * acha NENHUMA ocorrência fora de "gestor", então não há tela para falsear. Ele existe para o dia em
   * que uma coluna se chamar só "BP". A borda dele exige não-LETRA **e não-DÍGITO** dos dois lados
   * (`\p{N}`, diferente das outras regras deste arquivo): sem o dígito, `(?<!\p{L})bp` casaria dentro
   * de hash de build e de classe de CSS ("4bp"), e o payload do Next é auditado de propósito.
   */
  {
    tipo: "GESTOR",
    rotulo:
      /(?<!\p{L})(?:gestor(?:es)?(?:\s*[/_-]\s*bp|\s+bp)?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])bp(?![\p{L}\p{N}]))/giu,
    formas: [],
    // O QUE O ARNÊS DECLAROU, mais o marcador de célula vazia (que não é valor de ninguém).
    permitidos: (a) => [...(a.gestores ?? []), ...MARCADORES_DE_CELULA_VAZIA],
    restoDaFrase: true,
    segmentoSeguinte: true,
    exigeFormaDeNome: true,
    valorConhecidoDaColuna: true,
  },
  {
    tipo: "ENDERECO",
    rotulo: /(?<!\p{L})(?:endere[cç]os?|logradouro|bairro|complemento)(?!\p{L})/giu,
    formas: [],
    permitidos: (a) => a.enderecos,
    restoDaFrase: true,
    exigeFormaDeEndereco: true,
  },
];

// ── AS REGRAS ───────────────────────────────────────────────────────────────────────────────────

/**
 * ─ O RUN DE 11 DÍGITOS ESTÁ DENTRO DE UM TOKEN QUE TEM LETRA (hash de build, id, slug) ──────────
 *
 * ┌─ MEDIDO NA HOMOLOGAÇÃO, 27/09/2026, NA ROTA `/as/vagas` ────────────────────────────────────┐
 * │ O gate recusou a tela com `CPF: 19899567558`. Não era CPF de ninguém: era o pedaço do nome de  │
 * │ um arquivo de build que o Next embute no payload da própria página,                           │
 * │ `static/chunks/9699-45b7d19899567558.js`. O run de 11 dígitos começa DEPOIS de um `d`.        │
 * │                                                                                               │
 * │ E ATENÇÃO, porque a saída óbvia estava FECHADA: parar de auditar `<script>` seria reabrir um   │
 * │ buraco que o `tester` já travou de propósito (`pii.tester.spec.ts`), porque é justamente ali   │
 * │ que o Next embute a RESPOSTA CRUA DA API, com nome e CPF de verdade. O script continua sendo   │
 * │ auditado; o que muda é só o reconhecimento do que é um número APRESENTADO.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÓ VALE PARA A FORMA CRUA (11 dígitos colados). A forma COM MÁSCARA nunca passa por aqui, e isso
 * importa: expandir o token sobre `123.456.789-09` faria um rótulo colado ("CPF123.456.789-09")
 * esconder um CPF de verdade, que é o erro oposto e muito pior.
 *
 * ┌─ O RESIDUAL É UMA **DECISÃO**, E NÃO UM ACASO QUE SOBROU ────────────────────────────────────┐
 * │ Um hash cujo pedaço sejam 11 dígitos SEM nenhuma letra colada continua sendo indistinguível de │
 * │ um CPF pela FORMA, e CONTINUA RECUSANDO A TELA. Isso foi ESCOLHIDO, não esquecido: quando os   │
 * │ dois casos são idênticos para o gate, ele erra para o lado de recusar, que é o lado reversível │
 * │ (print a menos se refaz; PNG com CPF no git não volta, §A.6, §A.33).                           │
 * │                                                                                                │
 * │ O CONSERTO PROIBIDO, e é o que alguém vai propor: NÃO afrouxe a régua para "11 dígitos dentro  │
 * │ de um caminho de arquivo" nem para "dentro de um token com hífen". As duas formas cobrem CPF   │
 * │ cru de verdade no payload da API, que é exatamente o que o `tester` travou. Recusa por hash é  │
 * │ um print a menos; dispensa por forma parecida é um CPF a mais no repositório, para sempre.     │
 * │ O conserto CERTO, se doer, é o roteiro recortar a tela, nunca a régua ceder.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function dentroDeTokenComLetra(texto: string, inicio: number, fim: number): boolean {
  let i = inicio;
  while (i > 0 && /[A-Za-z0-9]/.test(texto[i - 1] as string)) i -= 1;
  let f = fim;
  while (f < texto.length && /[A-Za-z0-9]/.test(texto[f] as string)) f += 1;
  return /[A-Za-z]/.test(texto.slice(i, f));
}

/**
 * ─ O NÚMERO CRU DE 11 DÍGITOS SÓ É CPF SE **FECHAR O DÍGITO VERIFICADOR** ───────────────────────
 *
 * ┌─ O DEFEITO MEDIDO, por dois agentes em telas diferentes (28/09/2026) ────────────────────────┐
 * │ `/liberacao`, print da fila: **8 achados `CPF`**. Conferidos no banco, os 8 são exatamente        │
 * │ `candidatos.telefone` das 8 pré-admissões aguardando (`11910000471`, `11910002346`, ...). Os CPFs │
 * │ DE VERDADE daquela fila são da família `200`, que a allowlist já dispensa. `/sala-espera`, outro   │
 * │ agente: `telefone: '11920000045'` acusado como CPF, enquanto o `cpf: '80000004588'` da mesma linha │
 * │ é que era o CPF. CELULAR DE SÃO PAULO TEM 11 DÍGITOS, exatamente como CPF, e `RE_CPF` casa.       │
 * │ Efeito: nenhum recorte que contenha a coluna Telefone passa, e ela é a quinta de onze colunas da   │
 * │ Liberação. Quatro roteiros travados.                                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE ISTO NÃO AFROUXA O GATE: **CPF REAL SEMPRE FECHA O VERIFICADOR** ─────────────────────
 *
 * O gate existe para impedir que CPF de pessoa real entre num PNG versionado, e CPF emitido tem os dois
 * dígitos verificadores calculados por construção: nenhum CPF de verdade deixa de ser acusado por esta
 * régua. O que deixa de ser acusado é número de 11 dígitos que NÃO É um CPF válido, ou seja telefone,
 * protocolo e código. Os sete telefones medidos acima: todos com verificador INVÁLIDO. O CPF sintético
 * `80000004588` da mesma linha: VÁLIDO, e continua sendo acusado.
 *
 * ─ O RECORTE É MAIS ESTREITO DO QUE FOI PROPOSTO, e é de propósito: **SÓ A FORMA CRUA** ─────────
 *
 * A forma COM MÁSCARA (`123.456.789-09`) continua sendo acusada com verificador ou sem, e isso não é
 * excesso de zelo: número escrito com máscara de CPF É uma afirmação de que aquilo é um CPF, e telefone
 * nenhum é escrito `119.100.004-71`. Exigir o verificador ali só criaria uma forma de ESCONDER um CPF
 * do gate (bastaria um dígito trocado no dado de origem), sem resolver nenhum falso positivo medido.
 *
 * ┌─ O CPF PARTIDO EM DOIS ELEMENTOS CONTINUA SENDO PEGO, e é por isso que o recorte é este ─────┐
 * │ A tabela da casa parte a célula em dois `<span>` (`123.456.` + `789-09`), e `textoAuditavel`       │
 * │ concatena inline justamente para isso. O resultado concatenado é a forma COM MÁSCARA, que não passa │
 * │ por esta função. O caso está provado por execução e não por leitura.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ A RÉGUA JÁ É A DO PROJETO, e o gate era o único lugar fora dela ──────────────────────────────
 *
 * O arnês só cria CPF sintético "com dígito válido" (`tools/ajuda/allowlist-arnes.json`, `arnes-*`) e a
 * Clicksign exige o dígito validado no signatário (§A.5). Tratar qualquer 11 dígitos como CPF era a
 * inconsistência.
 *
 * ┌─ EFEITO COLATERAL BEM-VINDO, e ele NÃO substitui a guarda que já existia ────────────────────┐
 * │ O `19899567558` do nome de chunk do Next (o falso positivo que originou `dentroDeTokenComLetra`)   │
 * │ também tem verificador inválido. `dentroDeTokenComLetra` FICA: ela pega o hash cujo pedaço de 11   │
 * │ dígitos calhe de fechar o verificador, que é ~1 em 100. Duas camadas, cada uma pegando o que a     │
 * │ outra não pega.                                                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DÍGITO REPETIDO (`00000000000`, `11111111111`) NÃO é CPF válido, e a régua o descarta pela mesma
 * porta: a Receita não emite, e aquilo é marcador de tela vazia e placeholder, não dado de ninguém.
 *
 * ┌─ O RESIDUAL, MEDIDO NA HOMOLOGAÇÃO (28/09/2026) E NÃO ESTIMADO ──────────────────────────────┐
 * │ 1 em ~100 números de 11 dígitos fecha o verificador por acaso, e isso não é teoria: dos **2.689**  │
 * │ telefones crus de `candidatos`, **2.662 (99%)** deixaram de ser falso positivo e **27 (1,0%)**     │
 * │ continuam sendo acusados como CPF. Um deles, `11910001171`, é o único achado de CPF que sobrou nos │
 * │ roteiros da Liberação (conferido no banco: é `candidatos.telefone`, não é CPF de ninguém).        │
 * │                                                                                                │
 * │ O CONSERTO DESSES 27 **NÃO É AQUI**, e é importante que fique escrito: afrouxar mais a régua do   │
 * │ CPF para excluí-los exigiria saber que aquilo é telefone, e o gate só vê o número na tela. O       │
 * │ conserto certo é de DADO, no arnês que gera o telefone sintético (`1191` + contador): gerar o      │
 * │ número já com verificador de CPF INVÁLIDO zera o residual sem tocar o gate. Fica PROPOSTO, não     │
 * │ feito: aquele arnês é de outra frente (§A.14, §A.31).                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function fechaVerificadorDeCpf(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;
  const d = [...digitos].map(Number) as number[];
  for (const [ate, peso] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += (d[i] as number) * (peso - i);
    const esperado = ((soma * 10) % 11) % 10;
    if (esperado !== d[ate]) return false;
  }
  return true;
}

function cpfsRecusados(texto: string, a: AllowlistArnes): AchadoPii[] {
  const permitidos = new Set([...listaDeDigitos(a.cpfs), ...listaDeDigitos(a.mascaras)]);
  const achados: AchadoPii[] = [];
  for (const m of texto.matchAll(RE_CPF)) {
    const digitos = soDigitos(m[0]);
    if (digitos.length !== 11) continue;
    if (permitidos.has(digitos)) continue;
    const cru = /^\d{11}$/.test(m[0]);
    const inicio = m.index ?? 0;
    if (cru && dentroDeTokenComLetra(texto, inicio, inicio + m[0].length)) continue;
    // O VERIFICADOR SÓ É EXIGIDO DA FORMA CRUA. Ver `fechaVerificadorDeCpf`.
    if (cru && !fechaVerificadorDeCpf(digitos)) continue;
    achados.push({ tipo: "CPF", valor: m[0] });
  }
  return achados;
}

function emailsRecusados(texto: string, a: AllowlistArnes): AchadoPii[] {
  const permitidos = new Set([
    ...[...listaAchatada(a.emails)],
    ...[...listaAchatada(a.mascaras)],
  ]);
  const achados: AchadoPii[] = [];
  for (const m of texto.matchAll(RE_EMAIL)) {
    const valor = achatar(m[0]);
    // `.invalid` (RFC 2606) e `@homolog.local` são as famílias sintéticas declaradas; tudo o mais
    // precisa estar na lista LITERAL, e por isso o domínio de uma máscara não libera a família.
    if (valor.endsWith(".invalid") || valor.endsWith("@homolog.local")) continue;
    if (permitidos.has(valor)) continue;
    achados.push({ tipo: "EMAIL", valor: m[0] });
  }
  return achados;
}

function telefonesRecusados(texto: string, a: AllowlistArnes): AchadoPii[] {
  const permitidos = new Set([...listaDeDigitos(a.telefones), ...listaDeDigitos(a.mascaras)]);
  const achados: AchadoPii[] = [];
  for (const m of texto.matchAll(RE_TELEFONE)) {
    if (permitidos.has(soDigitos(m[0]))) continue;
    achados.push({ tipo: "TELEFONE", valor: m[0] });
  }
  return achados;
}

function cepsRecusados(texto: string, a: AllowlistArnes): AchadoPii[] {
  const permitidos = new Set([
    ...listaAchatada(a.mascaras),
    ...listaAchatada(a.enderecos),
  ]);
  const achados: AchadoPii[] = [];
  for (const m of texto.matchAll(RE_CEP)) {
    if (permitidos.has(achatar(m[0]))) continue;
    achados.push({ tipo: "CEP", valor: m[0] });
  }
  return achados;
}

/**
 * ─ O QUE **NÃO** É VALOR DE CAMPO, e os dois filtros existem por medição ────────────────────────
 *
 * 1. SEM LETRA NEM DÍGITO não é valor: o `*` de campo obrigatório ("Gestor / BP *") e o `:` sobravam
 *    como "valor" do rótulo, e a tela era recusada por pontuação. A busca segue para o segmento
 *    seguinte, que é onde o valor de verdade está nesse formato de tela. O MARCADOR de célula vazia
 *    ("—") é exceção e continua sendo LIDO, porque é ele que dispensa o campo em branco: quem o
 *    pulasse por ser pontuação iria inventar um achado com o rótulo do campo de baixo (medido).
 * 2. UM RÓTULO DE OUTRO CAMPO não é valor. Com o campo VAZIO (formulário em branco de `/nova`), o
 *    primeiro segmento depois do rótulo é o rótulo do campo VIZINHO, e emiti-lo como achado recusaria
 *    a tela apontando um campo que nem é o dela.
 *
 * ┌─ O RESIDUAL FICA **DECLARADO**, como o dos 11 dígitos sem letra colada ──────────────────────┐
 * │ O filtro 2 conhece só os rótulos DESTE arquivo. Campo de gestor VAZIO seguido de um rótulo que não │
 * │ está em `REGRAS_DE_ROTULO` ("Motivo", "Setor") ainda produz um achado `GESTOR` com o nome daquele   │
 * │ rótulo, e a tela é recusada. Isso é ESCOLHIDO, não esquecido: o lado errado desta regra é um print  │
 * │ a menos (reversível) e não PII de terceiro no git (irreversível, §A.6, §A.33). Se doer na execução  │
 * │ real, o conserto CERTO é o arnês preencher o campo e DECLARAR o valor em `gestores`, ou o roteiro   │
 * │ recortar a tela. Nunca a régua ceder.                                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const temConteudo = (t: string) => /[\p{L}\p{N}]/u.test(t);

// Ancorados e compilados UMA vez: o rótulo é conferido a cada ocorrência, e compilar em laço é o
// custo que a correção de `montarVocabularioDoSistema` acabou de tirar de outro lugar.
const ROTULOS_ANCORADOS = REGRAS_DE_ROTULO.map((r) => new RegExp(`^(?:${r.rotulo.source})$`, "iu"));

const ehRotuloDeCampo = (t: string) => ROTULOS_ANCORADOS.some((re) => re.test(t.trim()));

/**
 * O valor vizinho de um rótulo sensível tem de estar na allowlist.
 *
 * `negados` chega aqui por causa de `valorConhecidoDaColuna` (ver o contrato da regra): é o balde
 * `nomesDeColuna`, e ele é conferido por IGUALDADE do segmento inteiro, nunca por contenção. Ausente,
 * a regra continua valendo pelo lado da FORMA DE NOME, que é o lado que não depende de leitura
 * nenhuma: o caminho que GRAVA (`bin/capturar.ts`) sempre o passa, e a prova é de execução, não de
 * leitura (foi a denylist de coluna que recusou telas reais nas rodadas 4 e 5).
 */
function valoresDeRotuloRecusados(
  texto: string,
  a: AllowlistArnes,
  negados?: NegadosDeEquipe,
): AchadoPii[] {
  const achados: AchadoPii[] = [];
  const mascaras = listaAchatada(a.mascaras);
  // IGUALDADE NORMALIZADA (sem acento, caixa dobrada, espaço colapsado), que é o que `achatar` faz, e
  // é a MESMA normalização das outras listas deste arquivo.
  const valoresDaColuna = listaAchatada(negados?.nomesDeColuna);
  for (const regra of REGRAS_DE_ROTULO) {
    const permitidos = new Set([...listaAchatada(regra.permitidos(a)), ...mascaras]);
    /**
     * ─ O TRECHO DE UM VALOR JÁ DISPENSADO NÃO REABRE A PERGUNTA (regra do GESTOR) ────────────────
     *
     * MEDIDO ao provar a regra nova: um valor que CONTENHA a palavra do rótulo (o gestor sintético
     * chamado "Gestor Sintetico Do Arnes", ou um "Ana Silva (BP)" da base real) faz o rótulo casar uma
     * SEGUNDA vez DENTRO do próprio valor, e o "valor" daquela segunda vez é o texto VIZINHO, que não
     * tem nada a ver com o campo. Efeito: a tela do ARNÊS, que declarou o valor, é recusada por um
     * achado inventado no campo seguinte, que é a degeneração "recusa tudo" deste arquivo.
     *
     * A janela dispensada é registrada e o rótulo casado DENTRO dela é ignorado. Isto vale **só** para
     * a regra com `segmentoSeguinte` (hoje, GESTOR): mexer nisso para `ENDERECO` alcançaria
     * comportamento já validado e teste que esta sessão não pode editar (§A.14, §A.26).
     */
    const dispensados: Array<[number, number]> = [];
    for (const rotulo of texto.matchAll(regra.rotulo)) {
      const ondeORotuloCasou = rotulo.index ?? 0;
      if (
        regra.segmentoSeguinte &&
        dispensados.some(([a0, b0]) => ondeORotuloCasou >= a0 && ondeORotuloCasou < b0)
      ) {
        continue;
      }
      const inicio = ondeORotuloCasou + rotulo[0].length;
      // A janela para no separador: sem isso, o valor de um rótulo vizinho seria lido como se fosse
      // deste, e a recusa apontaria o campo errado.
      const resto = texto.slice(inicio, inicio + 160).split(/[\n·|;]/)[0] ?? "";
      /**
       * O VALOR NA CÉLULA SEGUINTE (regra da SENHA). Olha os TRÊS primeiros segmentos depois do
       * rótulo, e não só o primeiro, porque o mesmo campo emite `aria-label`, `placeholder` e valor, em
       * segmentos separados: o rótulo casa no primeiro, e o valor está dois depois.
       */
      if (regra.proximoToken) {
        const segmentos = texto
          .slice(inicio, inicio + 200)
          .split(/[\n·|;\t]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);
        for (const candidato of segmentos) {
          if (!RE_FORMA_DE_SENHA.test(candidato)) continue;
          if (permitidos.has(achatar(candidato))) continue;
          achados.push({ tipo: regra.tipo, valor: candidato });
        }
        continue;
      }
      if (regra.restoDaFrase) {
        let valor = resto.replace(/^[:\s-]+/, "").trim();
        /**
         * O VALOR CAIU NA CÉLULA SEGUINTE (ver `segmentoSeguinte`): rótulo e valor são elementos de
         * BLOCO diferentes, então `textoAuditavel` os separa por `\n` e o resto da linha é vazio.
         * Olha só o PRIMEIRO segmento não vazio, e não os três de `proximoToken`, porque aqui o valor
         * não tem forma que o distinga: varrer mais segmentos pegaria o rótulo do campo VIZINHO e a
         * recusa apontaria o campo errado.
         */
        if (regra.segmentoSeguinte && !temConteudo(valor)) {
          // O PRIMEIRO segmento não vazio, e SÓ ele: varrer mais pegaria o VALOR do campo vizinho, e a
          // recusa apontaria o campo errado (foi medido: "Gestor / BP *" vazio, seguido de "Salário" e
          // de "R$ 0,00", virava um achado de GESTOR com o salário dentro).
          valor =
            texto
              .slice(inicio, inicio + 200)
              .split(/[\n·|;\t]/)
              .map((t) => t.replace(/^[:\s-]+/, "").trim())
              // PONTUAÇÃO PURA NÃO CONTA como o segmento do valor (o `*` de campo obrigatório sai numa
              // célula só), MAS o marcador de célula vazia conta, senão a busca passa por cima dele e
              // vai inventar um achado no campo de baixo.
              .find((t) => t.length > 0 && (permitidos.has(achatar(t)) || temConteudo(t))) ?? "";
        }
        if (!valor) continue;
        // A DISPENSA VEM ANTES DOS FILTROS, e a ordem importa: o marcador de célula vazia ("—") é
        // pontuação, e filtrá-lo como "sem conteúdo" antes de dispensá-lo faria a busca cair no
        // segmento seguinte e inventar um achado com o rótulo do campo de baixo.
        if (permitidos.has(achatar(valor))) {
          const onde = texto.indexOf(valor, inicio);
          if (onde >= 0) dispensados.push([onde, onde + valor.length]);
          continue;
        }
        // OS DOIS PRIMEIROS FILTROS SÓ VALEM PARA A REGRA COM `segmentoSeguinte` (hoje, GESTOR).
        if (regra.segmentoSeguinte && (!temConteudo(valor) || ehRotuloDeCampo(valor))) continue;
        // FORMA DE NOME (GESTOR) e FORMA DE ENDEREÇO (ENDERECO): ver `exigeFormaDeNome` e
        // `exigeFormaDeEndereco`. As duas consertam a COLHEITA, nunca o critério de dispensa.
        if (
          regra.exigeFormaDeNome &&
          !pareceNomeDePessoa(valor) &&
          !(regra.valorConhecidoDaColuna && valoresDaColuna.has(achatar(valor)))
        ) {
          continue;
        }
        if (regra.exigeFormaDeEndereco && !pareceEndereco(valor)) continue;
        achados.push({ tipo: regra.tipo, valor });
        continue;
      }
      for (const forma of regra.formas) {
        for (const m of resto.matchAll(forma)) {
          if (permitidos.has(achatar(m[0]))) continue;
          if (regra.tipo === "SALARIO" && listaAchatada(a.salarios).has(achatar(m[0]))) continue;
          achados.push({ tipo: regra.tipo, valor: m[0] });
        }
      }
    }
  }
  return achados;
}

/**
 * ─ O TESTE DE ENDEREÇO, irmão de `pareceNomeDePessoa` e usado pela regra `ENDERECO` ─────────────
 *
 * ┌─ O FALSO POSITIVO QUE ELE EXISTE PARA FECHAR, medido ────────────────────────────────────────┐
 * │ `ImportarLojasModal.tsx:219` escreve, em PROSA: "A leitura entende quais colunas são o nome, o    │
 * │ endereço e o código, e você confere e corrige antes de gravar. Nada é gravado sem o seu aceite."  │
 * │ O rótulo casa em "endereço", o `restoDaFrase` leva o RESTO DA FRASE como se fosse o valor do campo │
 * │ e a régua anterior (`exigeNumeroOuVirgula`, "tem dígito OU vírgula") o aprovava como endereço por │
 * │ causa das VÍRGULAS do texto corrido. Não havia endereço nenhum na tela.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E O VETO DO `seguranca` SOBRE A PRIMEIRA TENTATIVA, que é o que dita a forma desta régua ────┐
 * │ A primeira versão exigia TIPO DE LOGRADOURO, CEP ou "número depois da vírgula com espaço", e ficou │
 * │ mais FROUXA que a régua que substituía: QUATRO formas reais de endereço, medidas uma a uma,        │
 * │ recusavam antes e passavam depois. `"Endereço: <bairro>,123"` (vírgula sem espaço),                │
 * │ `"Endereço: <bairro> 250"`, `"Endereço: <bairro> 45B"` e `"Bairro: <bairro>, sn"`. Endereço de     │
 * │ candidato NÃO está na liberação do diretor: ele liberou o detector de NOME, e só.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ A RÉGUA, e o sinal PRINCIPAL é o DÍGITO, porque endereço é NUMERADO e prosa não é ─────────────
 *
 * Basta UM dos quatro sinais:
 *
 *   1. **NÚMERO DE PORTA**: dígito que vem depois de VÍRGULA, de ESPAÇO ou do início do valor, com
 *      letra opcional. Cobre as quatro formas do veto: `<bairro>,123`, `<bairro> 250`, `<bairro> 45B`
 *      e o número da casa de `Rua das Flores, 123`.
 *   2. **`SN` / `S/N`**, o "sem número". É a única forma de endereço real SEM dígito nenhum, e sem ela
 *      `"Bairro: <bairro>, sn"` (medido) voltaria a passar.
 *   3. **TIPO DE LOGRADOURO OU DE COMPLEMENTO**, por palavra inteira ("Rua", "Avenida", "Apto"). Pega
 *      o endereço escrito sem número ("Logradouro: Rua Sem Numero"), que a régua ANTIGA já deixava
 *      passar: este sinal é ganho líquido sobre ela.
 *   4. **FORMA DE CEP** (`01310-100`), que é FORMATO e não palavra.
 *
 * ┌─ AS DUAS LARGURAS QUE PRECISARAM SER DESFEITAS, e as duas produziam falso positivo de CLASSE ─┐
 * │ (a) `cep` ESTAVA na lista de tipo de logradouro, e a PALAVRA "CEP" no meio de uma frase virava     │
 * │     sinal de endereço: `"O bairro é preenchido automaticamente pelo CEP informado pelo candidato."`│
 * │     era recusada inteira. CEP é um FORMATO, não um tipo de logradouro, e o formato já tem régua    │
 * │     PRÓPRIA no gate. A palavra saiu; o sinal 4 é o que resta dela, e é o certo.                   │
 * │ (b) O sinal 1 aceitava QUALQUER dígito em qualquer posição, o que é muito mais largo que "número   │
 * │     de porta" e transformava qualquer frase com um número num endereço. Agora o dígito tem de vir  │
 * │     onde o número da casa vem: depois de vírgula, de espaço ou no começo do valor.                │
 * │ DÓI JUSTAMENTE NAS TELAS DO MANUAL: quem EXPLICA o preenchimento por CEP é a importação de lojas e │
 * │ o cadastro, que são duas telas que o manual precisa fotografar.                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LISTA DO SINAL 3 É DELIBERADAMENTE SEM os termos que também são continuação de RÓTULO:
 * "residencial", "de trabalho" e "de correspondência" ficam de fora, senão o conserto de
 * `ENDERECO: de trabalho` (medido, duas telas) seria desfeito por esta porta.
 *
 * ┌─ POR QUE DINHEIRO E PORCENTAGEM SÃO SUBTRAÍDOS ANTES DE PROCURAR O DÍGITO ───────────────────┐
 * │ "R$ 1.518,00" e "12,5%" são o que aparece ao lado do rótulo de endereço numa ficha, e contá-los     │
 * │ como "número da casa" faria todo salário virar achado de `ENDERECO`: a degeneração "recusa tudo"    │
 * │ deste arquivo. A subtração é por FORMA (dinheiro, decimal de dois dígitos, porcentagem), não por    │
 * │ lista de exceção, e o que sobra depois dela é o número que endereço de verdade carrega.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O RESIDUAL, DECLARADO, no espírito do residual dos 11 dígitos ─────────────────────────────┐
 * │ (a) Endereço cujo ÚNICO número tenha forma de dinheiro ou de decimal ("Endereço: 1.518,00") deixa   │
 * │     de ser colhido. Não é forma de endereço nenhuma, e o preço de não subtrair é alto e diário.     │
 * │ (b) Endereço sem dígito, sem `sn` e sem tipo de logradouro ("Logradouro: Centro") deixa de ser      │
 * │     colhido. A régua ANTIGA também não o pegava (não tem dígito nem vírgula), então isto não é      │
 * │     perda desta rodada.                                                                            │
 * │ (c) Prosa em que um número ocupe a posição do número de porta ("Endereço, veja o passo 2") passa a  │
 * │     ser colhida. É recusa A MAIS, o lado reversível (§A.6, §A.33), e o conserto é o roteiro         │
 * │     recortar a tela. Prosa SEM número, inclusive a que FALA em CEP, passa: é a classe (a) acima.     │
 * │ O conserto ERRADO, se doer, é afrouxar de volta para "dígito OU vírgula": era ele que aprovava a    │
 * │ prosa inteira do idioma.                                                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const RE_TIPO_DE_LOGRADOURO =
  /(?<![\p{L}\p{N}])(?:rua|avenida|av|alameda|travessa|rodovia|estrada|pra[cç]a|largo|viela|viaduto|marginal|ladeira|apto|apartamento|bloco|quadra|lote|conjunto|andar)(?![\p{L}\p{N}])/iu;
/** O "sem número". Ver o sinal 2: é a única forma real de endereço sem dígito nenhum. */
const RE_SEM_NUMERO = /(?<![\p{L}\p{N}])s\.?\/?n[º°]?\.?(?![\p{L}\p{N}])/iu;
/** CEP com ou sem hífen. Ver o sinal 4. */
const RE_FORMA_DE_CEP_NO_VALOR = /(?<!\d)\d{5}-?\d{3}(?!\d)/;
/**
 * DINHEIRO, DECIMAL E PORCENTAGEM, subtraídos antes de procurar o dígito. Ver o bloco acima.
 * A ordem importa: o prefixo `R$` sai junto do número, senão o `$` sobra e não atrapalha, mas o
 * decimal de `1.518,00` tem de sair INTEIRO para não deixar um `1` solto passando por número de casa.
 */
const RE_DINHEIRO_OU_PORCENTAGEM = /r\$\s*[\d.]*\d(?:[.,]\d+)?|\d+(?:\.\d{3})*[.,]\d+\s*%?|\d+\s*%/giu;

/**
 * O NÚMERO DE PORTA. Ver o sinal 1: o dígito tem de estar ONDE o número da casa fica, depois de
 * vírgula, de espaço ou no começo do valor, com o `nº` e a letra de complemento (`45B`) opcionais.
 */
const RE_NUMERO_DE_PORTA = /(?:^|[,\s])\s*(?:n[º°.]?\s*)?\d/u;

function pareceEndereco(trecho: string): boolean {
  const semValores = trecho.replace(RE_DINHEIRO_OU_PORCENTAGEM, " ");
  return (
    RE_NUMERO_DE_PORTA.test(semValores) ||
    RE_SEM_NUMERO.test(trecho) ||
    RE_TIPO_DE_LOGRADOURO.test(trecho) ||
    RE_FORMA_DE_CEP_NO_VALOR.test(trecho)
  );
}

/**
 * ─ O TESTE DE NOME, EXTRAÍDO PARA SER APLICADO **DUAS VEZES** ──────────────────────────────────
 *
 * Ele roda no segmento inteiro (curto-circuito: segmento que não parece nome não tem fragmento que
 * pareça, porque todo fragmento tem MENOS palavras que o segmento) e em cada FRAGMENTO que sobra da
 * subtração do catálogo. É o MESMO teste nos dois lugares, de propósito: a correção da segmentação
 * não afrouxa a régua de nome, ela só decide sobre que texto a régua é aplicada.
 */
function pareceNomeDePessoa(trecho: string): boolean {
  const palavras = trecho
    .split(/\s+/)
    .map((p) => achatar(p.replace(/[^A-Za-zÀ-ÿ']/g, "")))
    .filter(Boolean);
  const relevantes = palavras.filter((p) => !LIGACOES.has(p));
  if (relevantes.length < 2) return false;
  return relevantes.some((p) => SOBRENOMES.has(p)) || relevantes.some((p) => PRENOMES.has(p));
}

/**
 * ─ NORMALIZAÇÃO **1 PARA 1 POR CARACTERE**, e é ela que torna a subtração por SPAN possível ─────
 *
 * `achatar` NÃO serve aqui: ele faz NFD (que EXPANDE "ç" em dois code units) e colapsa runs de
 * espaço, então os índices do texto normalizado deixam de corresponder aos do texto original. Com
 * índice torto, a subtração recortaria o pedaço errado, e recortar errado numa DISPENSA é abrir o
 * gate no lugar errado.
 *
 * Esta função devolve uma string do MESMO comprimento: cada caractere vira a versão sem marca e em
 * caixa baixa dele, e quando essa versão não couber em um caractere (caso raro, `ß` -> `ss`) o
 * original é preservado, porque perder o alinhamento é pior do que perder uma dispensa.
 */
function planoAlinhado(texto: string): string {
  let saida = "";
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i] as string;
    const sem = c
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    saida += sem.length === 1 ? sem : c.toLowerCase().length === 1 ? c.toLowerCase() : c;
  }
  return saida;
}

/** Palavra a palavra, com `\s+` no meio: o DOM parte o valor entre dois nós e a tela desenha um só. */
const RE_CACHE = new Map<string, RegExp>();
function expressaoDoValor(plano: string): RegExp | null {
  const cache = RE_CACHE.get(plano);
  if (cache) return cache;
  const palavras = plano.split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return null;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${palavras.map(escapar).join("\\s+")}(?![\\p{L}\\p{N}])`,
    "gu",
  );
  RE_CACHE.set(plano, re);
  return re;
}

/**
 * ─ PALAVRA DO CATÁLOGO -> VALORES QUE A CONTÊM, E **ENTRADA DE UMA PALAVRA NÃO ENTRA** ──────────
 *
 * O índice existe por velocidade (sem ele cada segmento varreria os ~6.100 valores), mas o filtro de
 * UMA PALAVRA é de SEGURANÇA, e ele nasce com esta correção:
 *
 * ┌─ O FURO QUE A SUBTRAÇÃO CRIA E A IGUALDADE NÃO TINHA (travado pelo `tester`) ────────────────┐
 * │ O catálogo TEM entradas de uma palavra: `as_cidades` traz "Barbosa", "Cardoso" e "Tarumã",      │
 * │ cidades reais de SP com sobrenome brasileiro por nome, e razão social de uma palavra é comum.   │
 * │ Se elas pudessem subtrair span, PICARIAM o nome de uma pessoa: tirando "Barbosa" e "Cardoso" de │
 * │ "Ana Barbosa Cardoso" sobra "Ana", uma palavra só, que morre no `relevantes.length < 2` e       │
 * │ DISPENSA gente de verdade. Seria trocar um falso positivo por um VAZAMENTO.                    │
 * │                                                                                                │
 * │ MEDIDO CONTRA O CATÁLOGO REAL (`seguranca`, 28/09/2026), e é por isso que este filtro NÃO é     │
 * │ sobra a ser "simplificada": dos 6.117 valores, 2.873 têm UMA palavra, e 42 deles são prenome ou │
 * │ sobrenome do léxico. Sem o filtro, esses 42 dispensavam 192 de 192 nomes de duas palavras e     │
 * │ 864 de 864 de três palavras. COM o filtro, a dispensa legítima não perde nada: 97 razões        │
 * │ sociais em 3 formas, zero recusa a mais. É rigor a custo zero.                                 │
 * │                                                                                                │
 * │ O filtro é de graça: `montarVocabularioDoSistema` já registra que entrada de uma palavra nunca  │
 * │ era consultada, porque o léxico não dispara com uma palavra só. O que era inofensivo na          │
 * │ igualdade inteira passa a ser ATIVO na subtração.                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
/**
 * O ÍNDICE É MEMOIZADO POR OBJETO DE VOCABULÁRIO (`WeakMap`), e não é micro-otimização: a medição de
 * cobertura chama o gate UMA VEZ POR RÓTULO de tela (milhares por rodada) com o MESMO vocabulário de
 * ~6.100 valores. Remontar o índice em cada chamada transformaria a régua nova em minutos de relógio.
 * `WeakMap` para o índice morrer com o vocabulário, sem cache que envelhece.
 */
const INDICE_MEMO = new WeakMap<VocabularioDoSistema, Map<string, string[]>>();

function indexarCatalogo(valores: string[]): Map<string, string[]> {
  const indice = new Map<string, string[]>();
  for (const bruto of valores) {
    const plano = achatar(bruto);
    if (!plano) continue;
    const palavras = plano.split(/\s+/).filter(Boolean);
    if (palavras.length < 2) continue;
    for (const palavra of new Set(palavras)) {
      const lista = indice.get(palavra);
      if (lista) lista.push(plano);
      else indice.set(palavra, [plano]);
    }
  }
  return indice;
}

/**
 * ─ O QUE DO SEGMENTO ESTÁ COBERTO POR UMA OCORRÊNCIA **VERBATIM** DE UM VALOR DO CATÁLOGO ───────
 *
 * A busca acontece numa JANELA em volta do segmento (o valor pode começar antes dele e terminar
 * depois), e só as ocorrências que INTERSECTAM o segmento contam, clipadas a ele.
 */
function spansDoCatalogo(
  plano: string,
  inicio: number,
  fim: number,
  indice: Map<string, string[]>,
): Array<[number, number]> {
  const palavras = new Set(
    plano
      .slice(inicio, fim)
      .split(/\s+/)
      .map((p) => p.replace(/[^\p{L}\p{N}']/gu, ""))
      .filter(Boolean),
  );
  const candidatos = new Set<string>();
  for (const palavra of palavras) for (const v of indice.get(palavra) ?? []) candidatos.add(v);
  const spans: Array<[number, number]> = [];
  for (const candidato of candidatos) {
    const re = expressaoDoValor(candidato);
    if (!re) continue;
    const folga = candidato.length + 8; // `\s+` pode casar mais de um espaço por palavra
    const janelaInicio = Math.max(0, inicio - folga);
    const janela = plano.slice(janelaInicio, Math.min(plano.length, fim + folga));
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(janela)) !== null) {
      const a = janelaInicio + m.index;
      const b = a + m[0].length;
      if (b <= inicio || a >= fim) continue;
      spans.push([Math.max(a, inicio), Math.min(b, fim)]);
    }
  }
  return spans;
}

/** O que sobra do segmento depois de subtrair os spans cobertos. */
function fragmentosRestantes(
  texto: string,
  inicio: number,
  fim: number,
  spans: Array<[number, number]>,
): string[] {
  if (spans.length === 0) return [texto.slice(inicio, fim)];
  const ordenados = [...spans].sort((x, y) => x[0] - y[0]);
  const restos: string[] = [];
  let cursor = inicio;
  for (const [a, b] of ordenados) {
    if (a > cursor) restos.push(texto.slice(cursor, a));
    cursor = Math.max(cursor, b);
  }
  if (cursor < fim) restos.push(texto.slice(cursor, fim));
  return restos.map((r) => r.trim()).filter(Boolean);
}

/** Nome: o léxico pergunta, a allowlist responde. */
function nomesRecusados(
  texto: string,
  a: AllowlistArnes,
  vocabulario?: VocabularioDoSistema,
): AchadoPii[] {
  // Os ENDEREÇOS declarados entram aqui porque topônimo e prenome se confundem ("Sao Paulo",
  // "Santo André", "Rua Duarte"): o endereço do arnês é conteúdo declarado, e o trecho contido nele
  // está autorizado pelo mesmo ato.
  const permitidos = [
    ...listaAchatada(a.nomes),
    ...listaAchatada(a.mascaras),
    ...listaAchatada(a.enderecos),
  ];
  /**
   * ─ O CATÁLOGO DISPENSA POR **OCORRÊNCIA VERBATIM NO PRÓPRIO TEXTO**, POR SPAN ──────────────────
   *
   * ┌─ POR QUE A DISPENSA POR IGUALDADE DO SEGMENTO FOI SUBSTITUÍDA (medido, 28/09/2026) ─────────┐
   * │ O detector recorta SEGMENTOS capitalizados, e o segmento quase nunca é o valor do catálogo:    │
   * │ dos 205 valores de cliente da homologação, 47 segmentos eram recusados com o catálogo já       │
   * │ carregado, porque o recorte começa no meio do valor, ou para antes do fim dele (`S.A.`, barra, │
   * │ dígito, hífen). Remendar o recorte para aceitar `S.A.` resolvia 24 e deixava 23, por quatro    │
   * │ causas diferentes: é conserto que envelhece, e cada envelhecimento vira pressão para afrouxar. │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A CORREÇÃO É **MAIS ESTRITA** QUE A ANTERIOR, e é isso que a torna aceitável: a dispensa deixa de
   * ser "o segmento PARECE com uma entrada do catálogo" e passa a ser "o valor INTEIRO da entrada
   * ESTÁ na tela, ali, naquele lugar". Antes, um segmento igual a uma entrada era dispensado mesmo
   * vindo de OUTRA célula; agora não: o que dispensa é a ocorrência literal do valor cobrindo aquele
   * pedaço do texto auditado.
   *
   * O QUE CONTINUA SENDO FLAGRADO (conferido pelo `seguranca`): pessoa na tela cujo homônimo só
   * existe no catálogo; pessoa colada a um valor de catálogo; e `Selecionar Ana Souza Pereira`, que é
   * o padrão de 8 telas. Note que isso DISPENSA a ideia de uma lista de verbos: "Selecionar" sobra
   * como UMA palavra e morre no `relevantes.length < 2` que já existia.
   *
   * `textoAuditavel` e `RE_CAPITALIZADO` NÃO FORAM TOCADOS (condição do `seguranca`): é o que preserva
   * o CPF partido em dois elementos e as réguas de CPF, e-mail, telefone e CEP. E a dispensa continua
   * valendo SÓ PARA NOME.
   */
  const memo = vocabulario ? INDICE_MEMO.get(vocabulario) : undefined;
  const indice = memo ?? indexarCatalogo(vocabulario?.valores ?? []);
  if (vocabulario && !memo) INDICE_MEMO.set(vocabulario, indice);
  const plano = planoAlinhado(texto);
  const achados: AchadoPii[] = [];
  const vistos = new Set<string>();
  for (const m of texto.matchAll(RE_CAPITALIZADO)) {
    const bruto = m[0];
    const trecho = bruto.trim();
    if (!trecho) continue;
    // CURTO-CIRCUITO: fragmento tem menos palavras que o segmento, então segmento que não parece
    // nome não tem fragmento que pareça. Isto não é só velocidade: é o que garante que a subtração
    // nunca INVENTE um achado que a régua anterior não faria.
    if (!pareceNomeDePessoa(trecho)) continue;
    const planoDoTrecho = achatar(trecho);
    // A ALLOWLIST é o que autoriza. Aceita o trecho contido num nome declarado (a tela mostra
    // "Mariana Alves" numa coluna estreita) e o nome declarado contido no trecho.
    // SÓ o declarado autoriza, e a leniência é de UMA direção: o trecho pode ser um PEDAÇO de um
    // nome declarado (a coluna estreita mostra "Mariana Alves"), nunca um nome declarado MAIS
    // sobrenome. "Maria Souza" é máscara da interface; "Maria Souza Pereira" é uma pessoa.
    if (permitidos.some((n) => n === planoDoTrecho || n.includes(planoDoTrecho))) continue;
    const inicio = (m.index ?? 0) + bruto.indexOf(trecho);
    const fim = inicio + trecho.length;
    // O VOCABULÁRIO DO SISTEMA, por último. Ele não alcança a denylist: um nome de colega que também
    // seja entrada de catálogo já foi achado por `negadosEncontrados`, que roda antes e por fora, e
    // aquele achado não passa por aqui para ser desfeito.
    const spans = spansDoCatalogo(plano, inicio, fim, indice);
    for (const fragmento of fragmentosRestantes(texto, inicio, fim, spans)) {
      const planoDoFragmento = achatar(fragmento);
      if (!planoDoFragmento || vistos.has(planoDoFragmento)) continue;
      if (!pareceNomeDePessoa(fragmento)) continue;
      if (permitidos.some((n) => n === planoDoFragmento || n.includes(planoDoFragmento))) continue;
      vistos.add(planoDoFragmento);
      achados.push({ tipo: "NOME", valor: fragmento });
    }
  }
  return achados;
}

// ── A DENYLIST DE EQUIPE: O QUE O GATE PROCURA EM CADA IMAGEM ───────────────────────────────────

/**
 * O texto de busca perde as LIGAÇÕES ("de", "da", "dos"), e o nome procurado também. Sem isso,
 * "Ana De Souza" na tela não casaria com "Ana Souza" da tabela, que é exatamente a diferença entre
 * como o nome está cadastrado e como a coluna estreita o desenha. Fabricar vizinhança removendo
 * "das" de "Gestão Das Assinaturas" é inofensivo: nenhum par assim é nome de colega.
 */
function semLigacoes(texto: string): string {
  return achatar(texto)
    .split(/\s+/)
    .filter((p) => p && !LIGACOES.has(p))
    .join(" ");
}

/**
 * ─ A BUSCA DA DENYLIST NÃO ATRAVESSA **QUEBRA DE LINHA** (conserto de falso positivo, 28/09/2026) ─
 *
 * ┌─ O CASO MEDIDO PELA COBERTURA INDEPENDENTE ──────────────────────────────────────────────────┐
 * │ O texto auditado `"Joao\nPereira"` são DUAS CÉLULAS, de colunas diferentes, que nada têm a ver    │
 * │ uma com a outra. `semLigacoes` normalizava o espaço em branco ANTES de procurar, o `\n` virava um  │
 * │ espaço, e a busca casava o colega `"Joao Pereira"` da denylist: tela RECUSADA sem que houvesse    │
 * │ pessoa nenhuma nela.                                                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * É A MESMA CLASSE DO `raful - cozinha`, e o custo dela não é um print a menos: é a PRESSÃO FUTURA
 * PARA AFROUXAR A DENYLIST, que é justamente a camada que o diretor NÃO liberou (ele liberou o dado do
 * CANDIDATO, §A.6, não o do colega). Falso positivo numa proteção que precisa ficar é o caminho mais
 * curto para alguém desligá-la inteira.
 *
 * ─ POR QUE ISTO **ESTREITA** A BUSCA SEM PERDER UM CASO REAL, conferido em `textoAuditavel` ──────
 *
 * `textoAuditavel` CONCATENA elemento INLINE e só empurra `\n` em elemento de BLOCO (`TAGS_DE_BLOCO`)
 * e em torno de atributo lido e de valor de campo. Logo o nome partido em dois `<span>` DENTRO da
 * mesma célula continua chegando COLADO, que é o caso que a normalização existe para pegar ("Ana De
 * Souza" casando a colega "Ana Souza"). O que deixa de casar é só o que atravessa duas CÉLULAS, e ali
 * nunca houve um nome. É a MESMA doutrina do `RE_CAPITALIZADO`, que já não atravessa `\n` de propósito.
 *
 * ┌─ O RESIDUAL, DECLARADO: `<br/>` é BLOCO, então nome quebrado por `<br/>` deixa de ser achado ─┐
 * │ Visualmente aquilo é UM nome, e no PNG apareceria inteiro. MEDIDO na produção: existe **UM** `<br/>`│
 * │ em todo `apps/frontend/src` (`app/login/page.tsx:78`), num título decorativo, sem nome de gente.   │
 * │ Nome de pessoa em coluna estreita é truncado por CSS nesta casa, não quebrado por `<br/>`. Se um dia│
 * │ aparecer, o conserto é tirar `BR` de `TAGS_DE_BLOCO`, e não voltar a normalizar o `\n`.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ OS TRÊS BALDES, e o terceiro já estava coberto ───────────────────────────────────────────────
 *
 * `nomes` e `nomesDeColuna` passam os dois por aqui (`compilarBusca` junta as duas origens). O balde
 * de `emails` NÃO precisa de conserto e não recebeu nenhum: `RE_EMAIL` é uma classe de caracteres que
 * não admite espaço nem `\n`, então ele nunca atravessou célula. Mexer nele seria mudança sem efeito.
 */
function blocosDeBusca(texto: string): string[] {
  const blocos: string[] = [];
  for (const bruto of texto.split("\n")) {
    const bloco = semLigacoes(bruto);
    if (bloco) blocos.push(bloco);
  }
  return blocos;
}

/**
 * ─ O QUE **NÃO** FOI CONSERTADO, e fica registrado como CUSTO ACEITO ────────────────────────────
 *
 * A mesma cobertura achou um segundo caso da família do falso positivo: o colega `Sao Pedro Alves` na
 * denylist faz a variante `Sao Pedro` recusar a tela do catálogo `Loja Sao Pedro`, porque
 * `ehTermoDoSistema` (corretamente) não dispensa termo que PARECE GENTE.
 *
 * **ISSO FICA, e é o lado certo do erro.** Dispensar ali seria liberar nome de colega por coincidência
 * com valor de catálogo, que é exatamente o vazamento que aquela guarda existe para fechar (o
 * "MARIA SILVA COMERCIO LTDA" liberando a pessoa "Maria Silva"). Um print a menos se refaz; nome de
 * colega no git não volta (§A.6, §A.33). O conserto certo, se doer, é o roteiro recortar a tela.
 */

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * AS VARIANTES DE UM NOME DE USUÁRIO. O cadastro traz o nome completo; a tela mostra pedaços dele
 * (saudação, avatar, coluna "criado por", seletor de responsável). Procurar só a forma completa
 * deixaria passar o print que mostra "prenome + sobrenome", que é a forma mais comum na interface.
 *
 * NOME DE UMA PALAVRA SÓ NÃO ENTRA, e é uma decisão, não um esquecimento: procurar "Fernando"
 * isolado recusaria qualquer tela que cite um primeiro nome, inclusive dos candidatos sintéticos, e
 * um gate que recusa tudo é o que gera pressão para afrouxar o gate (§A.6, o extremo oposto).
 */
export function variantesDeNomeDeUsuario(nome: string): string[] {
  const palavras = semLigacoes(nome).split(" ").filter(Boolean);
  if (palavras.length < 2) return [];
  const variantes = new Set<string>([palavras.join(" ")]);
  variantes.add(`${palavras[0]} ${palavras[palavras.length - 1]}`);
  for (let i = 0; i + 1 < palavras.length; i += 1) variantes.add(`${palavras[i]} ${palavras[i + 1]}`);
  return [...variantes];
}

/**
 * OS ACHADOS DA DENYLIST. Conferidos ANTES e POR FORA de toda permissão: nem a allowlist, nem o
 * léxico de nome, nem a família `@homolog.local` tiram um usuário real daqui.
 *
 * O ACHADO CARREGA O VALOR (é como o motor diz o que recusou, na mensagem), e por isso o chamador
 * grava o `tipo`, nunca o `valor`, em qualquer coisa que sobreviva ao processo (§A.6).
 */
/**
 * AS VARIANTES QUE A BUSCA DA IMAGEM PROCURA, memoizadas POR OBJETO de denylist (`WeakMap`, mesma
 * régua do índice de catálogo). `auditarTexto` é chamado uma vez por rótulo de tela, e a denylist com
 * o gestor tem ~1.500 variantes: compilar tudo a cada chamada é o custo que já derrubou esta frente
 * uma vez. O `WeakMap` morre com a denylist, sem cache que envelhece.
 *
 * AS DUAS ORIGENS ENTRAM AQUI, e é o ponto: na BUSCA, o valor de coluna vale tanto quanto o nome de
 * colega. O que ele não faz é PODAR o catálogo (ver `montarVocabularioDoSistema`).
 */
type BuscaCompilada = { compilados: NegadoCompilado[]; dePessoa: Set<string> };
const BUSCA_MEMO = new WeakMap<NegadosDeEquipe, BuscaCompilada>();

function compilarBusca(negados: NegadosDeEquipe): BuscaCompilada {
  const dePessoa = compilarNegados(negados.nomes ?? []);
  const deColuna = compilarNegados(negados.nomesDeColuna ?? []);
  const nomesDePessoa = new Set(dePessoa.map((c) => c.variante));
  // A VARIANTE QUE VEM DAS DUAS ORIGENS CONTA COMO PESSOA (o `dePessoa` vem primeiro e o
  // `nomesDePessoa` a marca): quem é colega não perde a proteção por também estar numa coluna.
  return {
    compilados: [...dePessoa, ...deColuna.filter((c) => !nomesDePessoa.has(c.variante))],
    dePessoa: nomesDePessoa,
  };
}

/**
 * ─ O VOCABULÁRIO INTEIRO NUMA STRING SÓ, para perguntar "isto é termo do sistema?" ──────────────
 *
 * Só é consultado DEPOIS de um achado (ver `ehTermoDoSistema`), que é caso raro, então o custo de
 * varrer a string grande não entra no caminho quente. Memoizado por objeto de vocabulário, igual ao
 * índice de dispensa. O `\n` entre os valores impede a busca de atravessar dois valores vizinhos e
 * fabricar um termo que não existe em nenhum deles.
 */
const CATALOGO_ACHATADO_MEMO = new WeakMap<VocabularioDoSistema, string>();

function catalogoAchatado(vocabulario: VocabularioDoSistema): string {
  const memo = CATALOGO_ACHATADO_MEMO.get(vocabulario);
  if (memo) return memo;
  const blob = vocabulario.valores.map((v) => semLigacoes(v)).join("\n");
  CATALOGO_ACHATADO_MEMO.set(vocabulario, blob);
  return blob;
}

/**
 * ─ A TRAVA DO `raful - cozinha`, MEDIDA NA EXECUÇÃO REAL (rodada 4, 28/09/2026) ─────────────────
 *
 * ┌─ A CAUSA VERDADEIRA, E ELA NÃO ERA A QUE SE SUPUNHA ─────────────────────────────────────────┐
 * │ Supunha-se que o falso positivo vinha da PODA do catálogo. Medido: não vinha. `RAFUL - COZINHA`  │
 * │ é um valor REAL de `dados_vaga_folha.gestor_bp` (alguém digitou o nome da OPERAÇÃO no campo do    │
 * │ gestor), e `variantesDeNomeDeUsuario` o quebra em janelas de duas palavras. A tela                │
 * │ `/admin/integracao-clientes` mostra os clientes `RAFUL - COZINHA CENTRAL`, `RAFUL - PAULISTA` e   │
 * │ mais quatro: a variante casa como PREFIXO do nome do cliente, com a borda satisfeita pelo espaço  │
 * │ seguinte. A BUSCA achava sozinha, e nenhuma trava de poda a alcançaria.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA É A MAIS ESTREITA QUE RESOLVE, e ela é conjunção de DUAS condições:
 *   1. o negado veio de COLUNA DE TEXTO LIVRE (nunca de `usuarios`/`comerciais`: pessoa cadastrada
 *      NUNCA sai da denylist, e essa é a propriedade que não se toca); **e**
 *   2. a variante NÃO tem forma de nome de pessoa (mesmo `pareceNomeDePessoa` do detector); **e**
 *   3. a variante é, literalmente, pedaço do VOCABULÁRIO DO SISTEMA (cliente, loja, cidade, cargo).
 *
 * ┌─ POR QUE A CONDIÇÃO 2 É INDISPENSÁVEL, e é ela que salva a doutrina do arquivo ──────────────┐
 * │ Sem ela, isto seria dispensa por CONTENÇÃO de nome, que este arquivo proíbe em letras maiúsculas: │
 * │ o cliente "MARIA SILVA COMERCIO LTDA" passaria a liberar a pessoa "Maria Silva". Com ela, nome com │
 * │ forma de pessoa continua sendo procurado SEMPRE, esteja ou não dentro de um valor de catálogo, e a │
 * │ leniência fica restrita ao que não parece gente E é vocabulário do sistema, que é exatamente o     │
 * │ "RAFUL - COZINHA" medido.                                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RESIDUAL, DECLARADO: gestor cujo nome NÃO tem forma de pessoa (o léxico não conhece o prenome) e
 * que POR COINCIDÊNCIA seja pedaço de um valor de catálogo deixa de ser procurado. É a interseção de
 * duas coisas improváveis, e o campo dele continua protegido pela regra de rótulo `GESTOR`.
 */
function ehTermoDoSistema(variante: string, vocabulario: VocabularioDoSistema | undefined): boolean {
  if (!vocabulario) return false;
  if (pareceNomeDePessoa(variante)) return false;
  /*
   * ─ A BORDA DE PALAVRA, e ela ESTREITA a dispensa (achado do `seguranca`, 28/09/2026) ───────────
   *
   * `includes` cru é SUBSTRING: a variante podia casar a cavalo entre o fim de uma palavra e o começo
   * da seguinte DENTRO de um mesmo valor de catálogo, e a dispensa ficava mais larga do que a frase
   * que a descreve ("a variante É uma entrada do catálogo"). O `\n` entre valores já impedia
   * atravessar DOIS valores; isto fecha o caso de dentro de um.
   *
   * A BORDA É A MESMA DO RESTO DO ARQUIVO, `(?<![\p{L}\p{N}])` e `(?![\p{L}\p{N}])`, e pelo mesmo
   * motivo de lá: ela recusa a casa dentro de outra palavra e preserva o valor colado a pontuação,
   * que é como a tabela da casa parte a célula. Estreitar a dispensa é o lado SEGURO: no máximo
   * produz falso positivo, nunca vazamento.
   */
  const escapada = variante.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapada}(?![\\p{L}\\p{N}])`, "u").test(
    catalogoAchatado(vocabulario),
  );
}

function negadosEncontrados(
  texto: string,
  negados: NegadosDeEquipe | undefined,
  vocabulario?: VocabularioDoSistema,
): AchadoPii[] {
  if (!negados) return [];
  const achados: AchadoPii[] = [];
  // UM ALVO POR BLOCO, e não um blob normalizado: ver `blocosDeBusca`.
  const alvos = blocosDeBusca(texto);
  const memo = BUSCA_MEMO.get(negados);
  const busca = memo ?? compilarBusca(negados);
  if (!memo) BUSCA_MEMO.set(negados, busca);
  for (const { variante, re } of busca.compilados) {
    // Condição NECESSÁRIA do match (ver `contemNomeNegado`): quem não está no texto nem chega ao motor.
    if (!alvos.some((alvo) => alvo.includes(variante) && re.test(alvo))) continue;
    // A TRAVA SÓ ALCANÇA O QUE VEIO DE COLUNA (ver `ehTermoDoSistema`). Pessoa cadastrada em
    // `usuarios`/`comerciais` é procurada sempre, e nada a dispensa.
    if (!busca.dePessoa.has(variante) && ehTermoDoSistema(variante, vocabulario)) continue;
    achados.push({ tipo: "NOME_DE_USUARIO", valor: variante });
  }
  const proibidos = listaAchatada(negados.emails);
  if (proibidos.size > 0) {
    for (const m of texto.matchAll(RE_EMAIL)) {
      const valor = achatar(m[0]);
      if (!proibidos.has(valor)) continue;
      achados.push({ tipo: "EMAIL_DE_USUARIO", valor: m[0] });
    }
  }
  return achados;
}

/**
 * ─ A DENYLIST **NUNCA ENCOLHE** DENTRO DE UM LOTE ──────────────────────────────────────────────
 *
 * A proteção é remontada a cada roteiro (ver os comandos em `tools/ajuda/src/bin/`), e remontar de
 * uma leitura nova abre a pergunta "e se a leitura nova vier MENOR?". Vem menor quando alguém é
 * removido da tabela, quando a consulta volta torta, ou quando o banco pisca no meio do lote. A
 * resposta é esta função: o conjunto novo é SOMADO ao anterior, nunca o substitui.
 *
 * O EFEITO É ASSIMÉTRICO DE PROPÓSITO, e é o que se quer: usuário CADASTRADO no meio do lote entra
 * na proteção na imagem seguinte; usuário que SUMIR da leitura continua protegido até o fim do lote.
 * Os dois lados erram para o lado de recusar a imagem, que é o lado reversível (§A.33, §A.6): print
 * a menos se refaz, print com nome de colega no git não volta.
 */
export function unirNegados(a: NegadosDeEquipe, b: NegadosDeEquipe): NegadosDeEquipe {
  // OS TRÊS CONJUNTOS SOMAM, CADA UM NO SEU: unir `nomesDeColuna` dentro de `nomes` reabriria o
  // `raful - cozinha` pela porta da união, que é o jeito mais silencioso de a separação morrer.
  return {
    nomes: [...new Set([...(a.nomes ?? []), ...(b.nomes ?? [])])],
    emails: [...new Set([...(a.emails ?? []), ...(b.emails ?? [])])],
    nomesDeColuna: [...new Set([...(a.nomesDeColuna ?? []), ...(b.nomesDeColuna ?? [])])],
  };
}

/**
 * ─ AS EXPRESSÕES DA DENYLIST, COMPILADAS **UMA VEZ** (correção de custo, 28/09/2026) ─────────────
 *
 * ┌─ O QUE ISTO CONSERTA, MEDIDO E NÃO SUPOSTO ──────────────────────────────────────────────────┐
 * │ `montarVocabularioDoSistema` varre ~6.100 valores de catálogo e, para CADA um, perguntava a       │
 * │ `contemNomeNegado` se ele contém alguém da denylist. A versão anterior refazia, DENTRO desse laço, │
 * │ o trabalho que não depende do valor: derivava as variantes de cada nome (`semLigacoes` + split +   │
 * │ montagem do `Set`) e COMPILAVA um `RegExp` novo por par (valor, variante). Com 475 nomes na        │
 * │ denylist isso levava **252,8 s** por chamada, e a chamada acontece UMA VEZ POR ROTEIRO            │
 * │ (`protecao-por-roteiro.ts`): um lote de ~400 imagens viraria horas.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CORREÇÃO É DE ALGORITMO, E **NÃO MUDA A SEMÂNTICA EM UM VALOR**: as mesmas variantes, a mesma
 * expressão, o mesmo texto alvo, o mesmo veredito. O que muda é ONDE o trabalho acontece: cada lado é
 * normalizado UMA vez (as variantes aqui, o valor no laço de quem chama) e a comparação roda sobre o já
 * normalizado. A duplicata de variante é descartada no `Set` porque testá-la duas vezes nunca muda um
 * booleano (era assim antes também, por `variantesDeNomeDeUsuario` devolver um `Set` achatado).
 *
 * O QUE **NÃO** SE FAZ AQUI: mover a remontagem da proteção para o arranque do lote. Está escrito em
 * `tools/ajuda/src/protecao-por-roteiro.ts` por que aquilo é um FURO (o colega cadastrado no meio do
 * lote ficaria fora da denylist com o gate verde). Custo alto se conserta por algoritmo, como aqui.
 */
type NegadoCompilado = { variante: string; re: RegExp };

function compilarNegados(nomes: string[]): NegadoCompilado[] {
  const vistos = new Set<string>();
  const compilados: NegadoCompilado[] = [];
  for (const nome of nomes) {
    for (const variante of variantesDeNomeDeUsuario(nome)) {
      if (vistos.has(variante)) continue;
      vistos.add(variante);
      compilados.push({
        variante,
        re: new RegExp(`(?<![\\p{L}\\p{N}])${escapar(variante)}(?![\\p{L}\\p{N}])`, "u"),
      });
    }
  }
  return compilados;
}

/**
 * Uma variante de nome negado aparece no texto, como palavra inteira.
 *
 * ┌─ O PRÉ-FILTRO É UMA CONDIÇÃO **NECESSÁRIA**, e é por isso que ele não afrouxa nada ───────────┐
 * │ A expressão é o LITERAL da variante (`escapar` neutraliza todo metacaractere) cercado de          │
 * │ lookarounds. Logo, casar a expressão IMPLICA que a variante está no alvo como SUBSTRING: o        │
 * │ `includes` é condição necessária, nunca suficiente, e quem decide continua sendo a expressão (é   │
 * │ ela que exige a borda de palavra inteira). Descartar o que o `includes` já nega não pode mudar um  │
 * │ veredito, e tira o custo do caminho: a variante que não está no valor nem chega ao motor de regex. │
 * │                                                                                                │
 * │ Medido no catálogo real (6.117 valores): com 121 variantes, 11,4 s -> ~0,3 s.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function contemNomeNegado(texto: string, compilados: NegadoCompilado[]): boolean {
  if (compilados.length === 0) return false;
  // A MESMA FRONTEIRA DURA DA BUSCA (ver `blocosDeBusca`): as duas leem o mesmo texto e não podem
  // discordar sobre onde um nome começa e acaba, senão a subtração poda por um match que a busca não faz.
  const alvos = blocosDeBusca(texto);
  for (const { variante, re } of compilados) {
    if (alvos.some((alvo) => alvo.includes(variante) && re.test(alvo))) return true;
  }
  return false;
}

/**
 * ─ MONTAR O VOCABULÁRIO, JÁ SUBTRAÍDO DA DENYLIST ──────────────────────────────────────────────
 *
 * `negados` é **OBRIGATÓRIO**, e não é cerimônia: é a mesma lição do segundo veto do `seguranca`
 * sobre o `negados?` opcional em `DependenciasCaptura`. Enquanto a subtração dependesse da memória
 * de quem monta, esquecê-la não quebraria typecheck nem teste, e o catálogo passaria a abrigar o
 * nome de um colega em silêncio. Agora o compilador cobra, e "não há ninguém a subtrair" só existe
 * como ato escrito (`{ nomes: [], emails: [] }`), que aparece no diff.
 *
 * A SUBTRAÇÃO É POR **CONTENÇÃO**, e aqui a direção se inverte de propósito: na DISPENSA, contenção
 * seria leniência (liberar um pedaço), então ela é proibida; na SUBTRAÇÃO, contenção é RIGOR
 * (descartar mais), então ela é o que se usa. Cliente "CLINICA DR JOAO SILVA LTDA" com um "João
 * Silva" no time sai inteiro do catálogo, e aquela tela volta a ser recusada, que é o certo.
 *
 * VALOR DE UMA PALAVRA SÓ TAMBÉM ENTRA no catálogo, e não é descuido: o léxico de nome nunca dispara
 * com uma palavra só (`relevantes.length < 2`), então uma entrada de uma palavra simplesmente nunca
 * é consultada. Filtrá-la seria trabalho sem efeito.
 */
export function montarVocabularioDoSistema(
  valores: Array<string | null | undefined>,
  negados: NegadosDeEquipe,
): VocabularioDoSistema {
  /**
   * SÓ `negados.nomes` PODA O CATÁLOGO. `nomesDeColuna` (o gestor) fica DE FORA, e é essa linha que
   * impede o `raful - cozinha` de voltar: ver o bloco de `nomesDeColuna` em `NegadosDeEquipe`. A
   * proteção daqueles valores é a BUSCA na imagem, que não passa por aqui.
   *
   * As expressões são compiladas ANTES do laço: o que não depende do valor do catálogo não pode ser
   * refeito ~6.100 vezes. Mesma semântica, custo de outra ordem.
   */
  const expressoes = compilarNegados(negados.nomes ?? []);
  const limpos = new Set<string>();
  for (const bruto of valores) {
    const valor = (bruto ?? "").trim();
    if (!valor) continue;
    if (contemNomeNegado(valor, expressoes)) continue;
    limpos.add(valor);
  }
  return { valores: [...limpos] };
}

/**
 * ─ A CHAVE DO DETECTOR GENÉRICO DE NOME ────────────────────────────────────────────────────────
 *
 * ┌─ ISTO É DECISÃO DO DIRETOR, DE 28/09/2026, E NÃO ESQUECIMENTO ───────────────────────────────┐
 * │ Ele autorizou DESLIGAR a pesquisa de nomes do gate do manual, "desde que tudo continue          │
 * │ funcionando". O FUNDAMENTO é dele e está escrito aqui para a próxima sessão não ter de adivinhar:│
 * │ o manual é INTERNO, quem o lê já acessa o sistema, o time está coberto por confidencialidade     │
 * │ assinada (LGPD) e JÁ MANIPULA o dado do candidato NA FONTE. O print do manual não expõe a essa   │
 * │ pessoa nada que ela não veja, com mais detalhe, na própria tela de trabalho dela.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE UMA CHAVE, E NÃO A REMOÇÃO DA CHAMADA ───────────────────────────────────────────────
 *
 * Chamada removida é indistinguível de chamada esquecida: seis meses depois, alguém lê `auditarTexto`,
 * não encontra o detector de nome, conclui que o gate tem um buraco e o "conserta" de volta, desfazendo
 * a decisão do diretor sem saber que existiu uma. A chave DECLARA o ato, no lugar em que a pergunta
 * nasce, e torna o caminho de volta uma palavra (`"DESLIGADO"` -> `"LIGADO"`), sem reconstituir código.
 * Ela também mantém `nomesRecusados` REFERENCIADO, o que preserva o léxico e os testes dele vivos e
 * compiláveis em vez de virarem código morto que a próxima limpeza apaga.
 *
 * ─ O QUE SAI, E É SÓ ISTO: a INFERÊNCIA POR LÉXICO sobre texto solto ───────────────────────────
 *
 * O gate CONTINUA recusando, sem nenhuma mudança: CPF, e-mail, telefone, CEP, TODOS os valores de
 * rótulo (nascimento, salário, conta, matrícula, **senha**, endereço e **gestor**), a DENYLIST DE
 * EQUIPE (nome e e-mail de colega real, lidos de `usuarios` e de `as_comerciais`, busca literal que
 * não depende de léxico nenhum), a denylist de COLUNA de pessoa (`gestor_bp` e as outras fontes),
 * `TELA_VAZIA`, `LISTA_VAZIA` e `ALLOWLIST_VAZIA`.
 *
 * ─ AS OUTRAS DUAS CHAMADAS DO LÉXICO FICAM DE PÉ, e apagá-lo quebraria as duas ──────────────────
 *
 *   . `exigeFormaDeNome` (regra de rótulo `GESTOR`): decide se o valor colhido ao lado do rótulo
 *     "Gestor" é gente. O campo do gestor é dado de TERCEIRO que o diretor mandou MANTER protegido na
 *     rodada anterior, e essa proteção é justamente o léxico.
 *   . `ehTermoDoSistema` (dispensa por vocabulário de catálogo): impede que um valor de catálogo
 *     LIBERE uma pessoa por contenção. Sem o léxico ali, o cliente "MARIA SILVA COMERCIO LTDA" volta a
 *     dispensar a pessoa "Maria Silva", que é um vazamento MEDIDO e fechado nesta mesma semana.
 *
 * Por isso o desligamento é desta CHAMADA, e não do léxico: `pareceNomeDePessoa`, `PRENOMES`,
 * `SOBRENOMES` e a própria `nomesRecusados` continuam existindo e testados.
 */
const DETECTOR_GENERICO_DE_NOME: "LIGADO" | "DESLIGADO" = "DESLIGADO";

/**
 * ─ AUDITAR TEXTO ───────────────────────────────────────────────────────────────────────────────
 *
 * DUAS RECUSAS QUE PARECEM EXCESSO E SÃO O CONTRÁRIO:
 *
 *   . TELA SEM TEXTO recusa. Texto vazio é PII-limpo por definição, e é justamente por isso que
 *     aprová-lo é a armadilha: a causa realista é a captura ter acontecido antes da tela carregar.
 *     Aprovar significa gravar 400 PNGs em branco com carimbo de gate verde.
 *   . ALLOWLIST VAZIA recusa. É o dia em que o arnês falhou (seed que não rodou, import errado), e
 *     falhar ABERTO exatamente nesse dia é o pior momento possível.
 */
export function auditarTexto(
  texto: string,
  allow: AllowlistArnes,
  negados?: NegadosDeEquipe,
  /**
   * O VOCABULÁRIO DO SISTEMA QUE NÃO É PESSOA (cidade, cliente, loja, cargo). OPCIONAL, e aqui o
   * opcional é o lado SEGURO, ao contrário do `negados`: ausente, nada é dispensado e o gate fica
   * mais estrito, não menos. Quem esquece de passá-lo recebe falso positivo, não vazamento.
   */
  vocabulario?: VocabularioDoSistema,
): VeredictoPii {
  // A RÉGUA COMPLETA, e não há como pedir menos por aqui. Ver `auditarTelaDoManual`.
  return auditar(texto, allow, negados, vocabulario, true);
}

function auditar(
  texto: string,
  allow: AllowlistArnes,
  negados: NegadosDeEquipe | undefined,
  vocabulario: VocabularioDoSistema | undefined,
  comDetectorDeNome: boolean,
): VeredictoPii {
  const conteudo = (texto ?? "").trim();
  if (!conteudo) {
    return { aprovado: false, achados: [{ tipo: "TELA_VAZIA", valor: "(tela sem texto)" }] };
  }
  const listaVazia =
    (allow.nomes?.length ?? 0) === 0 &&
    (allow.cpfs?.length ?? 0) === 0 &&
    (allow.emails?.length ?? 0) === 0;
  if (listaVazia) {
    return {
      aprovado: false,
      achados: [{ tipo: "ALLOWLIST_VAZIA", valor: "(o arnês não declarou nada)" }],
    };
  }
  // DEDUPE por tipo mais valor: o mesmo dado aparece na tela e no atributo do mesmo elemento, e
  // repetir o achado só faz a mensagem da recusa ficar mais difícil de ler.
  const achados = deduplicar([
    // A DENYLIST PRIMEIRO, e por fora de toda permissão: usuário real do time não é dispensado por
    // allowlist, por léxico nem por família sintética de e-mail.
    ...negadosEncontrados(texto, negados, vocabulario),
    ...cpfsRecusados(texto, allow),
    ...emailsRecusados(texto, allow),
    ...telefonesRecusados(texto, allow),
    ...cepsRecusados(texto, allow),
    ...valoresDeRotuloRecusados(texto, allow, negados),
    // A RÉGUA COMPLETA, SEMPRE. Quem pode dispensar o detector de nome é `auditarTelaDoManual`, e
    // ele precisa PEDIR: ver `DETECTOR_GENERICO_DE_NOME`.
    ...(comDetectorDeNome ? nomesRecusados(texto, allow, vocabulario) : []),
  ]);
  return { aprovado: achados.length === 0, achados };
}

/**
 * ─ O GATE **DA IMAGEM**, e é o ÚNICO lugar em que a chave do diretor vale ────────────────────────
 *
 * ┌─ O VETO DO `seguranca` QUE OBRIGOU ESTA SEPARAÇÃO (28/09/2026) ──────────────────────────────┐
 * │ A primeira versão do desligamento pôs a chave DENTRO de `auditarTexto`, e `auditarTexto` tem       │
 * │ QUATRO consumidores, não um. Um deles é `linhaForaDoPadrao` (`lote.ts`), que é quem decide se o    │
 * │ LOTE COMEÇA, e ela roda sobre `candidatos` e sobre as QUATRO fontes em régua `ASSERCAO`:           │
 * │ `dados_vaga_folha.substituido`, `assinante_empresa`, `admissao_dados_gi.filiacao` e                │
 * │ `vagas.solicitante`. São dado de TERCEIRO, a mesma classe do gestor que o diretor mandou MANTER.   │
 * │ Com a chave global, a asserção passou a APROVAR base com linha de pessoa sem CPF e sem e-mail, e o │
 * │ fail-closed ficou inerte na dimensão NOME. Não havia vazamento (as quatro fontes têm 0, 1, 0 e 0   │
 * │ linhas): o que se perdeu foi o CONTROLE, que existe para o dia do RE-CLONE.                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE A SAÍDA É UMA FUNÇÃO NOVA, e não um parâmetro em `auditarTexto` ──────────────────────
 *
 * A régua pedida era "falhe para o lado seguro quando alguém esquecer de passar o parâmetro", a mesma
 * do `negados` obrigatório e da `ReguaDeUsuarios`. Parâmetro com default falha para o lado seguro
 * SÓ ENQUANTO o default for o estrito, e aí o caminho da imagem tem de passá-lo em três lugares: quem
 * escrever o quarto esquece, e o esquecimento é SILENCIOSO (só torna o gate mais estrito, o print
 * recusa, alguém "conserta" mudando o default). Aqui é o contrário: `auditarTexto` **não tem** como
 * ficar leniente, nem por engano, nem por refatoração; a leniência só existe em uma função com NOME
 * PRÓPRIO, que diz no nome que é o gate da imagem do manual. Quem chamar a errada fica mais estrito.
 *
 * ─ QUEM CHAMA QUEM, medido e declarado ──────────────────────────────────────────────────────────
 *
 *   . `captura.ts` e `motor.ts` (o gate por imagem) e `auditarDom`: CHAMAM ESTA. É o alvo do ato do
 *     diretor, porque o que está em jogo é o print do manual interno.
 *   . `lote.ts` / `linhaForaDoPadrao` (a asserção de população): chama `auditarTexto`, a régua
 *     COMPLETA, e continua reprovando a base por NOME. É o veto, e é o que fica de pé.
 *   . `bin/cobertura.ts` (o rótulo impresso no artigo): chama `auditarTexto`, e isto é DECLARADO, não
 *     esquecimento. Aquele texto é escrito pela fábrica, não é tela de ninguém, e manter a régua
 *     completa ali não custa print nenhum.
 */
export function auditarTelaDoManual(
  texto: string,
  allow: AllowlistArnes,
  negados?: NegadosDeEquipe,
  vocabulario?: VocabularioDoSistema,
): VeredictoPii {
  return auditar(texto, allow, negados, vocabulario, DETECTOR_GENERICO_DE_NOME === "LIGADO");
}

// ── DE ONDE O GATE LÊ ───────────────────────────────────────────────────────────────────────────

const TAGS_DE_BLOCO = new Set([
  "ADDRESS","ARTICLE","ASIDE","BLOCKQUOTE","BR","BUTTON","CAPTION","DD","DIV","DL","DT","FIELDSET",
  "FIGCAPTION","FIGURE","FOOTER","FORM","H1","H2","H3","H4","H5","H6","HEADER","HR","LI","MAIN",
  "NAV","OL","OPTION","P","PRE","SECTION","TABLE","TBODY","TD","TFOOT","TH","THEAD","TR","UL",
]);

const ATRIBUTOS_LIDOS = ["title", "aria-label", "alt", "placeholder"];

/**
 * ─ O TEXTO QUE O GATE AUDITA, E ELE NÃO É O `innerText` ────────────────────────────────────────
 *
 * ┌─ O FURO QUE GRAVAVA PII DE VERDADE ──────────────────────────────────────────────────────────┐
 * │ `innerText` e `textContent` NÃO ENXERGAM VALOR DE CAMPO: num input controlado do React o valor  │
 * │ mora na PROPRIEDADE `.value`, e é ali que está o CPF digitado nas telas que o manual precisa    │
 * │ ensinar (`nova`, `sala-espera`, `assinante-empresa`, `portal/Identificacao`). E o valor APARECE  │
 * │ no PNG: é o texto desenhado dentro da caixa. Era o único furo que grava PII sem nenhuma outra    │
 * │ condição.                                                                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DUAS DECISÕES FINAS, e as duas mudam o resultado:
 *   . ELEMENTO INLINE É CONCATENADO, BLOCO É SEPARADO. A tabela da casa parte o dado em dois
 *     `<span>` (`123.456.` + `789-09`), e lendo nó por nó o gate não vê CPF nenhum enquanto a pessoa
 *     lê o número inteiro no print. Ao mesmo tempo, colar tudo fabricaria CPF juntando duas colunas
 *     numéricas vizinhas, e aí o gate recusaria qualquer tabela.
 *   . CAMPO DE SENHA NUNCA ENTRA. Não é exceção ao furo acima, é complemento: auditar a senha a
 *     carrega em memória e, no primeiro achado, a IMPRIME na mensagem de erro e no log, que é onde
 *     ela sobrevive (§A.6). Print de tela de login se resolve não digitando senha.
 */
export function textoAuditavel(raiz: Element): string {
  const partes: string[] = [];

  const ehSenha = (el: Element) =>
    el.tagName === "INPUT" && (el.getAttribute("type") ?? "").toLowerCase() === "password";

  const visitar = (no: Node): void => {
    if (no.nodeType === 3) {
      partes.push(no.nodeValue ?? "");
      return;
    }
    if (no.nodeType !== 1) return;
    const el = no as Element;
    if (ehSenha(el)) return;
    const bloco = TAGS_DE_BLOCO.has(el.tagName);
    if (bloco) partes.push("\n");

    for (const nome of ATRIBUTOS_LIDOS) {
      const v = el.getAttribute(nome);
      if (v && v.trim()) partes.push(`\n${v.trim()}\n`);
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      // A PROPRIEDADE primeiro (React), o ATRIBUTO depois (HTML servido). Os dois aparecem no print.
      const propriedade = (el as unknown as { value?: unknown }).value;
      const atributo = el.getAttribute("value");
      for (const v of [propriedade, atributo]) {
        if (typeof v === "string" && v.trim()) partes.push(`\n${v.trim()}\n`);
      }
    }
    for (const filho of Array.from(el.childNodes)) visitar(filho);
    if (bloco) partes.push("\n");
  };

  visitar(raiz);
  return partes.join("").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function deduplicar(achados: AchadoPii[]): AchadoPii[] {
  const vistos = new Set<string>();
  return achados.filter((a) => {
    const chave = `${a.tipo}|${a.valor}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/** O gate, do jeito que o motor usa: lê a raiz da captura e audita o que ela realmente mostra. */
export function auditarDom(
  raiz: Element,
  allow: AllowlistArnes,
  negados?: NegadosDeEquipe,
  vocabulario?: VocabularioDoSistema,
): VeredictoPii {
  // O DOM é a CASCA DO GATE POR IMAGEM, então ele segue a régua da imagem.
  return auditarTelaDoManual(textoAuditavel(raiz), allow, negados, vocabulario);
}

/** Uma linha por achado, com o TIPO na frente. Para a MENSAGEM do motor, não para log persistido. */
export function descreverAchados(achados: AchadoPii[]): string {
  return achados.map((a) => `  . ${a.tipo}: ${a.valor}`).join("\n");
}
