/**
 * ─ A ASSERÇÃO DE ARRANQUE DO LOTE: A POPULAÇÃO INTEIRA, ANTES DO PRIMEIRO PRINT ────────────────
 *
 * ┌─ O FURO QUE ESTA PEÇA FECHA, E É O MAIS PERIGOSO DE TODOS ───────────────────────────────────┐
 * │ A homologação está anonimizada HOJE. Isso é ESTADO, não CONTROLE: ninguém o impõe, e o           │
 * │ re-clone da produção o desfaz em um comando, que é rotina conhecida deste projeto. As travas do  │
 * │ desenho conferem a URL base (3120) e o NOME do database (`ea_automatic_homolog`), e AS DUAS       │
 * │ CONTINUAM VERDADEIRAS numa base recém-clonada e cheia de gente real. O motor arrancaria feliz, e │
 * │ o gate por tela seria a única barreira, no cenário em que ele tem 400 chances de errar uma vez.  │
 * │                                                                                                 │
 * │ A trava certa é de POPULAÇÃO e vem ANTES da primeira captura: existe UMA linha fora do padrão    │
 * │ sintético em `candidatos` ou em `usuarios`, o lote inteiro não começa. Falha dura, uma vez, no   │
 * │ arranque, em vez de 400 decisões individuais.                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MOTIVO DA RECUSA NÃO CARREGA O QUE ELE ACHOU. A mensagem vai para o log do CI, que é onde o dado
 * sobrevive: ela diz a TABELA e a CONTAGEM, nunca o nome, o CPF ou o e-mail encontrados (§A.6).
 */
import { auditarTexto, unirNegados, type AllowlistArnes, type NegadosDeEquipe } from "./pii";

/**
 * AS VARIANTES DE UM NOME DE USUÁRIO saem daqui também, e a implementação mora em `pii.ts` porque é
 * lá que elas são PROCURADAS. O reexport é nominal, e não `export *`: quem monta a denylist e quem a
 * confere encontram as três peças (`montarNegadosDeEquipe`, `nomeExibidoDoEmail` e as variantes) no
 * mesmo módulo, sem inverter a dependência (este arquivo já importa `pii`, e o contrário seria ciclo).
 */
export { variantesDeNomeDeUsuario } from "./pii";

/** Uma linha de pessoa, do jeito mínimo que a conferência precisa ver. */
export type LinhaPessoa = { nome?: string; cpf?: string; email?: string };

/**
 * ─ AS TRÊS TABELAS DE GENTE, E `comerciais` ENTROU DEPOIS (achado do `seguranca`, 28/09/2026) ────
 *
 * ┌─ POR QUE `as_comerciais` É TABELA DE PESSOA ─────────────────────────────────────────────────┐
 * │ O menu `clientes`, concedido à conta de captura, entrega `ClientesController.comerciais`, e o   │
 * │ `rotulo` daquela tabela é NOME DE PESSOA por natureza (é o comercial responsável). Medido: 3    │
 * │ linhas com forma de nome, NENHUMA delas em `usuarios`, logo nenhuma na denylist. O gate as      │
 * │ pegava só pelo LÉXICO, que é a proteção mais fraca do desenho: comercial cadastrado amanhã com  │
 * │ prenome fora da lista de ~80 nomes passa, e vai para PNG no git, que guarda para sempre.        │
 * │                                                                                                │
 * │ A RÉGUA DELA É A DE `usuarios`, NUNCA A DE `candidatos`: o comercial é real e PERMANECE, então  │
 * │ ele não pode BARRAR o lote por população (isso reprovaria a base para sempre, mandando           │
 * │ "anonimizar" uma tabela que não tem o que anonimizar). Ele vira o que o gate PROCURA em cada     │
 * │ imagem.                                                                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O EFEITO DE SEGUNDA ORDEM é o mais valioso: `montarVocabularioDoSistema` subtrai por CONTENÇÃO,
 * então cliente ou loja batizado com o nome de um comercial sai SOZINHO da dispensa do catálogo.
 */
export type TabelaDePessoas = "candidatos" | "usuarios" | "comerciais";

/**
 * ─ AS FAMÍLIAS SINTÉTICAS DE CPF, E POR QUE ELAS PRECISAM EXISTIR AQUI ──────────────────────────
 *
 * Para a TELA, a allowlist de CPF é literal: o número está na lista do arnês ou é recusado. Para a
 * BASE não pode ser, e a razão é aritmética: a homologação tem 2.691 candidatos, e exigir que cada
 * CPF esteja numa lista literal significaria declarar 2.691 números só para provar que a base é
 * sintética. Pior, a lista viria da própria base, e a conferência ficaria circular.
 *
 * A régua da base é FAMÍLIA DECLARADA, no mesmo espírito do `.invalid` que o gate já aceita para
 * e-mail: `200` e `PRO` são o que a anonimização do clone escreve, `999` é o que os arneses escrevem.
 * Medido na homologação em 27/09/2026, não suposto. CPF fora dessas famílias reprova o lote.
 */
export const PREFIXOS_CPF_SINTETICO = ["200", "999", "PRO"];

/**
 * ─ AS DUAS TABELAS SÃO COISAS DIFERENTES, E A RÉGUA DELAS TAMBÉM (correção de premissa, 27/09/2026)
 *
 * ┌─ O DEFEITO DE ARQUITETURA QUE ISTO CONSERTA ─────────────────────────────────────────────────┐
 * │ A primeira versão exigia ZERO linha fora do padrão sintético nas DUAS tabelas. Os usuários da  │
 * │ homologação, porém, são REAIS: são o time do diretor testando o sistema, e eles têm de          │
 * │ PERMANECER (não se apaga, não se altera, não se desativa nenhum). Com isso, a asserção NUNCA    │
 * │ passaria, e o lote nunca começaria: uma trava que, aplicada ao mundo real, impede a frente       │
 * │ inteira. A intenção estava certa; a régua para `usuarios` estava errada.                        │
 * │                                                                                                │
 * │ `candidatos`: RÉGUA ESTRITA, inalterada. Candidato real não precisa existir na homologação para │
 * │ o manual funcionar, e ele aparece em quase toda tela. Uma linha fora do padrão e o lote inteiro  │
 * │ recusa.                                                                                        │
 * │ `usuarios`: o nome e o e-mail deixam de BARRAR o lote e passam a ser o que o gate PROCURA em     │
 * │ cada imagem (`NegadosDeEquipe`, ver `pii.ts`). Recusa por imagem, não por população.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O CPF DE `usuarios` FICA NA RÉGUA ESTRITA, **e hoje esse controle é INERTE**. Dizer que ele
 * "continua estrito", como a primeira redação desta seção dizia, é uma falsa garantia, e o
 * `seguranca` cobrou a correção: a tabela `usuarios` **não tem coluna `cpf`**, e a consulta de
 * `base-sintetica.ts` seleciona `null as cpf` para manter a forma da linha. Logo `cpfForaDoPadrao`
 * nunca dispara para ela. Não é vazamento (não há CPF ali para vazar); é controle que existe para o
 * dia em que a coluna aparecer, e que precisa estar descrito como inerte para ninguém confiar nele.
 * O que a detecção por imagem cobre de fato é NOME e E-MAIL.
 *
 * O PADRÃO É `ESTRITA` NAS DUAS TABELAS, de propósito: afrouxar `usuarios` é um ato DECLARADO por
 * quem chama, e ele vem acompanhado da denylist que substitui a trava. Esquecer de declarar falha
 * para o lado seguro.
 */
export type ReguaDeUsuarios = "ESTRITA" | "DETECCAO_POR_IMAGEM";

/**
 * ─ AS **COLUNAS** DE PESSOA, ALÉM DAS TRÊS TABELAS (segundo veto do `seguranca`, 28/09/2026) ─────
 *
 * ┌─ O FURO: A ASSERÇÃO OLHAVA DUAS TABELAS, E A PII ESTAVA EM COLUNAS DE OUTRAS ─────────────────┐
 * │ `dados_vaga_folha.gestor_bp` é PII REAL DE TERCEIRO (o gestor do cliente) e não tinha barreira   │
 * │ nenhuma. Medido: **413 dos 414 valores distintos da homologação são byte-idênticos à produção**,  │
 * │ 94 carregam e-mail corporativo real, e **107 dos 431 passam pelo gate INTEIRO com zero achados**  │
 * │ (36 por serem uma palavra, que o léxico nunca dispara; 71 por serem nome real que o léxico não    │
 * │ conhece). É desenhado em três telas (`AdmissaoDetalheModal`, `EditAdmissaoModal`,                 │
 * │ `ApresentacaoIntegracaoModal`). A asserção aprovava a base porque só olhava `candidatos` e        │
 * │ `usuarios`.                                                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CRITÉRIO, QUE É DELE E FICA ESCRITO PARA NÃO SER REINVENTADO ──────────────────────────────┐
 * │ ASSERÇÃO para fonte cuja população a fábrica pode legitimamente exigir 100% SINTÉTICA.          │
 * │ DENYLIST para gente REAL que tem de PERMANECER (o time, os comerciais).                        │
 * │ PODA nunca é proteção, é só relatório: podar o rótulo esconde o furo do relatório e o valor       │
 * │ continua indo para o PNG.                                                                      │
 * │                                                                                                │
 * │ `gestor_bp` era o único que entrava nos DOIS (asserção E denylist). Pela decisão do diretor de    │
 * │ 28/09/2026 ele saiu da ASSERÇÃO e ficou com DUAS camadas que se cobrem: a DENYLIST (busca literal,  │
 * │ pega o que ESTÁ no banco, léxico conhecendo ou não) e a REGRA DE RÓTULO do gate (pega o que é NOVO, │
 * │ o que nem está no banco e o que entrou depois do arranque). Ver `REGUA_DAS_COLUNAS_DE_PESSOA`.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AMOSTRA VAZIA AQUI **NÃO** REPROVA, ao contrário das três tabelas, e a diferença é deliberada: três
 * destas fontes estão VAZIAS hoje (`admissao_dados_gi.filiacao`, `vagas.solicitante`,
 * `substituido_nome`), e a asserção foi escrita AGORA justamente porque é o momento mais barato: passa
 * hoje e começa a proteger no dia em que o fluxo encher. Exigir linha delas travaria o lote por um
 * fluxo que ainda não existe.
 */
export type ColunaDePessoa =
  | "dados_vaga_folha.gestor_bp"
  | "dados_vaga_folha.motivo"
  | "dados_vaga_folha.substituido"
  | "sala_espera"
  | "as_candidatos"
  | "assinante_empresa"
  | "admissao_dados_gi.filiacao"
  | "vagas.solicitante";

/**
 * A ordem é só a da mensagem; a régua de cada uma está em `REGUA_DAS_COLUNAS_DE_PESSOA`, e é ela que
 * decide se a fonte é LIDA, se ela REPROVA e se ela alimenta a denylist.
 */
export const COLUNAS_DE_PESSOA: ColunaDePessoa[] = [
  "dados_vaga_folha.gestor_bp",
  "dados_vaga_folha.motivo",
  "dados_vaga_folha.substituido",
  "sala_espera",
  "as_candidatos",
  "assinante_empresa",
  "admissao_dados_gi.filiacao",
  "vagas.solicitante",
];

/**
 * ─ AS TRÊS RÉGUAS DE UMA COLUNA DE PESSOA (decisão do diretor, 28/09/2026) ──────────────────────
 *
 * ┌─ O FUNDAMENTO, QUE É DELE E FICA ESCRITO PARA NÃO SER REINVENTADO ───────────────────────────┐
 * │ O manual é INTERNO. Os dados tratados pelo time interno já estão protegidos por LGPD           │
 * │ (confidencialidade assinada), e quem tem acesso ao sistema JÁ manipula o dado do candidato na   │
 * │ FONTE (G.I e plataforma): um print de tela não lhe mostra nada que ele não veja no sistema.     │
 * │ Ele decidiu, explicitamente, NÃO fazer anonimização recorrente, porque isso viraria manutenção  │
 * │ eterna de uma base que o re-clone desfaz em um comando.                                        │
 * │                                                                                                │
 * │ O QUE PERMANECE PROTEGIDO, e é o bom senso que ele manteve: credencial/senha, e o campo do      │
 * │ GESTOR (`dados_vaga_folha.gestor_bp`), que é dado de TERCEIRO. Terceiro não assinou nada, não é  │
 * │ o time e não precisa estar na homologação.                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `ASSERCAO`: a fonte é LIDA e linha fora do padrão REPROVA o lote ──────────────────────────┐
 * │ É a régua de fonte cuja população a fábrica pode legitimamente exigir 100% SINTÉTICA, porque o   │
 * │ fluxo que a enche ainda não existe (`filiacao`, `solicitante`, `substituido`: ZERO linha medida   │
 * │ hoje) ou porque ela é residual (`assinante_empresa`: 1 linha, que passa). Custa nada agora e      │
 * │ começa a proteger sozinha no dia em que o fluxo encher, que é o dia em que ninguém lembraria de   │
 * │ escrever a asserção.                                                                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `DENYLIST`: a fonte é LIDA, alimenta o que o gate PROCURA, e NUNCA reprova ─────────────────┐
 * │ É a régua do `gestor_bp`: 431 valores medidos, 413 byte-idênticos à produção, 94 com e-mail        │
 * │ corporativo real. Barrar o lote por eles seria mandar a fábrica anonimizar recorrentemente, que é   │
 * │ o que o diretor recusou; deixar de lê-los seria desligar a proteção que ele mandou MANTER. Então a  │
 * │ leitura CONTINUA, o valor entra na busca de cada imagem, e o veredito da base não é afetado.       │
 * │                                                                                                │
 * │ ┌─ A TRAVA QUE FEZ ESTA RÉGUA VOLTAR A SER USÁVEL (rodada 4, 28/09/2026) ────────────────────┐   │
 * │ │ Na primeira versão, o valor do gestor entrava em `nomes`, junto com os colegas do time, e isso │   │
 * │ │ RECUSOU TELA: `/admin/integracao-clientes` caiu por `NOME_DE_USUARIO: raful - cozinha`, que é  │   │
 * │ │ nome de OPERAÇÃO. A causa NÃO era a busca na imagem: era a PODA do catálogo                    │   │
 * │ │ (`montarVocabularioDoSistema` descarta por contenção), porque 108 dos 390 valores do gestor não │   │
 * │ │ têm forma de pessoa e derrubavam a dispensa de clientes homônimos.                             │   │
 * │ │ Hoje a origem é explícita (`montarNegadosDeEquipe(..., "COLUNA")` -> `nomesDeColuna`): o valor  │   │
 * │ │ de coluna entra na BUSCA e NUNCA na poda. Ver `NegadosDeEquipe` em `pii.ts`.                   │   │
 * │ └──────────────────────────────────────────────────────────────────────────────────────────────┘   │
 * │                                                                                                │
 * │ O CUSTO TAMBÉM ERA PROIBITIVO e foi consertado no ALGORITMO, não na régua: com o gestor dentro, a  │
 * │ montagem do vocabulário ia de ~11 s para ~253 s POR ROTEIRO. Hoje são ~0,9 s com os 475 nomes, por  │
 * │ compilar as expressões uma vez e por um pré-filtro que é condição NECESSÁRIA do match (`pii.ts`).  │
 * │                                                                                                │
 * │ O QUE ESTA RÉGUA **NÃO** COBRE, e por isso a outra camada existe: nome de UMA palavra (41 dos 431), │
 * │ que `variantesDeNomeDeUsuario` nunca procura, e o gestor cadastrado DEPOIS do arranque do lote (a   │
 * │ remontagem relê `usuarios` e `comerciais`, nunca `gestor_bp`). Esses são o território da REGRA DE   │
 * │ RÓTULO `GESTOR` (`REGRAS_DE_ROTULO`, `pii.ts`), que recusa a imagem que DESENHA o campo e não       │
 * │ depende de conhecer o valor. As duas camadas se cobrem; nenhuma delas sozinha cobre tudo.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `ROTULO`: a fonte NÃO é lida, e quem a protege é a REGRA DE RÓTULO do gate ──────────────────┐
 * │ **HOJE NENHUMA FONTE USA ESTA RÉGUA, e o registro de por que ela existe é o que impede o próximo   │
 * │ a lê-la de reinventar a discussão.** Ela nasceu na rodada 3 para o `gestor_bp`, na tentativa de     │
 * │ proteger o campo SÓ pela estrutura (o gate recusa a imagem que DESENHA o campo, qualquer que seja o │
 * │ valor), sem ler a coluna. A rodada 4 mediu e mostrou que a resposta certa não é UMA das camadas, é  │
 * │ AS DUAS: a regra de rótulo continua de pé (ela é do gate e não depende de régua nenhuma), e a       │
 * │ leitura VOLTOU, agora com a trava de origem que separa busca de poda (ver `DENYLIST` acima).       │
 * │                                                                                                │
 * │ ELA NÃO É SINÔNIMO DE `LIBERADA`, e confundir as duas é o erro a evitar: `LIBERADA` não tem        │
 * │ proteção NENHUMA (é ato do diretor, o dado pode aparecer no print); `ROTULO` é "a proteção mora no  │
 * │ gate, não na leitura". As duas coincidem só na mecânica (a fonte não é consultada), por razões      │
 * │ opostas: uma porque não há o que proteger, a outra porque ler o valor não é o jeito de protegê-lo. │
 * │                                                                                                │
 * │ QUANDO ELA SERIA A RÉGUA CERTA: fonte de texto livre cuja leitura custe caro ou não exista (coluna │
 * │ de outro sistema, campo que o EA só desenha), e cujo CAMPO tenha rótulo estável na interface.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `LIBERADA`: a fonte NÃO é lida, não reprova, e NÃO alimenta a denylist ─────────────────────┐
 * │ É dado de CANDIDATO e de PROCESSO, exatamente o que a decisão do diretor liberou: `sala_espera`   │
 * │ (53 linhas), `as_candidatos` (13) e `dados_vaga_folha.motivo` (42), que eram as três fontes que    │
 * │ somavam com o gestor as 372 linhas que REPROVAVAM o lote hoje.                                    │
 * │                                                                                                │
 * │ ELA NÃO ALIMENTA A DENYLIST, E ISSO É CONTROLE, NÃO ECONOMIA. `montarNegadosDeEquipe` SUBTRAI o   │
 * │ que a allowlist declara; jogar valor de candidato naquele caminho arrisca cruzar um colega         │
 * │ HOMÔNIMO e tirá-lo da proteção. Liberar o candidato nunca pode custar a proteção do time, então a  │
 * │ fonte liberada sai do circuito inteiro em vez de entrar pela porta da denylist.                    │
 * │                                                                                                │
 * │ `LIBERADA` É **ATO DO DIRETOR**, NUNCA DEFAULT. Nenhuma fonte chega aqui por conveniência de       │
 * │ implementação, por teste vermelho ou por pressa de destravar um lote: chega por decisão dele,      │
 * │ datada, escrita neste bloco. Na dúvida, a fonte é `ASSERCAO`, que falha para o lado seguro.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O MAPA É `Record<ColunaDePessoa, ...>` DE PROPÓSITO: FONTE NOVA SEM RÉGUA NÃO COMPILA ──────┐
 * │ Uma lista (`ColunaDePessoa[]`) deixaria a fonte declarada amanhã nascer sem régua, em silêncio, e  │
 * │ o modo de falha desta frente é exatamente esse: controle que nasce INERTE e ninguém percebe. Com   │
 * │ o `Record`, quem acrescenta uma fonte é obrigado pelo compilador a DIZER qual é a régua dela, no    │
 * │ mesmo commit. Fonte nova nunca nasce liberada por esquecimento.                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SAIR DA ASSERÇÃO **NÃO** SIGNIFICA QUE O PNG GRAVA, E CONFUNDIR ISSO É O PRÓXIMO ERRO ──────┐
 * │ São DUAS camadas, independentes. Esta é a de POPULAÇÃO: ela decide se o lote COMEÇA. A outra é o    │
 * │ gate POR IMAGEM (`auditarTexto`), que audita o texto de CADA tela e tem um detector de nome por     │
 * │ LÉXICO, que não sabe nem quer saber desta régua. Nome real vindo de `sala_espera`, de               │
 * │ `as_candidatos` ou de um `motivo` de substituição pode continuar RECUSANDO a imagem, e é para isso  │
 * │ que o detector existe.                                                                            │
 * │                                                                                                │
 * │ A ORDEM DECIDIDA É: liberar a asserção, RODAR `ajuda:conferir`, MEDIR o que o gate por imagem       │
 * │ recusa, e só ENTÃO decidir. Nada de afrouxar o gate por suposição, e nada de tratar este mapa como  │
 * │ se ele fosse permissão de gravar.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export type ReguaDaColunaDePessoa = "ASSERCAO" | "DENYLIST" | "ROTULO" | "LIBERADA";

export const REGUA_DAS_COLUNAS_DE_PESSOA: Record<ColunaDePessoa, ReguaDaColunaDePessoa> = {
  // PII DE TERCEIRO: o gestor do cliente, protegido por DUAS camadas que se cobrem (ver o bloco
  // `DENYLIST` acima). É LIDO, e o valor entra na busca da imagem como `nomesDeColuna`, que é a trava
  // que impede a poda do catálogo (a causa medida do falso positivo `raful - cozinha`).
  "dados_vaga_folha.gestor_bp": "DENYLIST",
  // Dado de PROCESSO do candidato, liberado pelo diretor em 28/09/2026 (42 linhas medidas).
  "dados_vaga_folha.motivo": "LIBERADA",
  // Dado de CANDIDATO, liberado pelo diretor em 28/09/2026 (53 linhas medidas).
  "sala_espera": "LIBERADA",
  // Dado de CANDIDATO, liberado pelo diretor em 28/09/2026 (13 linhas medidas).
  "as_candidatos": "LIBERADA",
  // As quatro abaixo seguem como estavam: ZERO ou 1 linha hoje, então a asserção passa e continua de
  // pé para o dia em que o fluxo encher. O diretor não as mencionou, e silêncio não é liberação.
  "dados_vaga_folha.substituido": "ASSERCAO",
  "assinante_empresa": "ASSERCAO",
  "admissao_dados_gi.filiacao": "ASSERCAO",
  "vagas.solicitante": "ASSERCAO",
};

export type DependenciasLote = {
  allowlist: AllowlistArnes;
  /**
   * ─ A LEITURA DAS COLUNAS DE PESSOA ─────────────────────────────────────────────────────────────
   *
   * ┌─ OPCIONAL **HOJE**, E É DÍVIDA DECLARADA, NÃO DESENHO ──────────────────────────────────────┐
   * │ Pela régua do `negados`, controle assim nasce obrigatório, para o compilador cobrar quem        │
   * │ esquecer. Aqui é opcional por PROCESSO e por mais nada: torná-lo obrigatório quebra os          │
   * │ `*.tester.spec.ts` (eles montam o objeto de dependências inteiro), e a §A.38 proíbe esta sessão │
   * │ de editar arquivo de teste do `tester`. O fechamento é dele, no mesmo commit em que acrescentar  │
   * │ a fonte aos `deps` dos testes.                                                                 │
   * │                                                                                                │
   * │ As cascas reais (`bin/capturar.ts` e `bin/conferir.ts`) SEMPRE a passam.                        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  amostrarColunaDePessoa?: (fonte: ColunaDePessoa) => Promise<LinhaPessoa[]>;
  /**
   * Ver `ReguaDeUsuarios`. Ausente, as TRÊS tabelas seguem na régua estrita (fail-closed). A régua
   * declarada vale para `usuarios` E para `comerciais`: as duas são gente REAL que PERMANECE.
   */
  reguaDeUsuarios?: ReguaDeUsuarios;
  /** As famílias de CPF sintético. Sobrescrever é decisão consciente, não configuração de rotina. */
  prefixosCpfSintetico?: string[];
  /** Lê a população de uma tabela. Quem consulta o banco é a casca, não este módulo. */
  amostrarPessoas: (tabela: TabelaDePessoas) => Promise<LinhaPessoa[]>;
  /** Só para a mensagem: a asserção NÃO decide por eles, e é esse o ponto (ver o bloco acima). */
  baseUrl?: string;
  databaseUrl?: string;
};

export type VeredictoDeBase = {
  aprovado: boolean;
  motivo?: string;
  totalForaDoPadrao: number;
  tabelas: TabelaDePessoas[];
  /** As COLUNAS de pessoa reprovadas (ver `ColunaDePessoa`). Separadas das tabelas de propósito: o
   *  conserto delas é outro (anonimizar a coluna), e a mensagem precisa dizer qual é qual. */
  colunas?: ColunaDePessoa[];
  /**
   * O QUE O GATE TEM DE PROCURAR NAS IMAGENS, montado a partir da tabela `usuarios` lida aqui.
   *
   * ELE SAI DAQUI, e não de um arquivo de configuração, por duas razões: usuário novo do time entra
   * na proteção sozinho (a fonte é a tabela), e quem afrouxa a régua de `usuarios` recebe, no mesmo
   * ato, a denylist que substitui a trava. Não há como pedir o afrouxamento e ficar sem a proteção.
   */
  negados: NegadosDeEquipe;
};

const TABELAS: TabelaDePessoas[] = ["candidatos", "usuarios", "comerciais"];

/**
 * A linha é sintética quando NADA nela é recusado pelo MESMO gate que audita as telas. Reusar o gate
 * aqui não é economia: é a garantia de que a base e a tela concordam sobre o que é dado de pessoa.
 * A única folga é a família de CPF (ver `PREFIXOS_CPF_SINTETICO` acima).
 */
function linhaForaDoPadrao(
  linha: LinhaPessoa,
  allow: AllowlistArnes,
  prefixos: string[],
): boolean {
  const campos = [linha.nome, linha.cpf, linha.email].filter(Boolean) as string[];
  if (campos.length === 0) return true; // linha sem nada não prova nada: fail-closed
  const cpf = (linha.cpf ?? "").replace(/\D/g, "");
  const cpfDeFamiliaSintetica =
    !!linha.cpf && prefixos.some((p) => linha.cpf!.startsWith(p) || cpf.startsWith(p));
  const comFamilia: AllowlistArnes = cpfDeFamiliaSintetica
    ? { ...allow, cpfs: [...allow.cpfs, linha.cpf as string] }
    : allow;
  return !auditarTexto(campos.join("\n"), comFamilia).aprovado;
}

/**
 * A linha tem CPF, e o CPF não é de família sintética.
 *
 * INERTE PARA `usuarios` HOJE, e isso é para ser lido como aviso: aquela tabela não tem coluna `cpf`,
 * e a consulta real devolve `null as cpf`. Esta função só passa a ter efeito ali no dia em que a
 * coluna existir, e é para esse dia que ela está escrita.
 */
function cpfForaDoPadrao(linha: LinhaPessoa, prefixos: string[]): boolean {
  if (!linha.cpf) return false;
  const cru = linha.cpf.replace(/\D/g, "");
  return !prefixos.some((p) => linha.cpf!.startsWith(p) || cru.startsWith(p));
}

/** Uma linha SEM NADA não prova nada: é consulta que voltou torta, e fail-closed é a resposta. */
const linhaVazia = (l: LinhaPessoa) => !l.nome && !l.cpf && !l.email;

const achatar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * ─ A DENYLIST, MONTADA DA TABELA INTEIRA (não só das linhas "fora do padrão") ────────────────────
 *
 * VALE PARA `usuarios` E PARA `comerciais`, e a função é a MESMA de propósito: as duas são gente real
 * que permanece na base, e a régua delas é idêntica (o que muda é só de onde a linha vem). Quem chama
 * SOMA os dois resultados com `unirNegados`, para a segunda leitura nunca apagar a primeira.
 *
 * TODA linha de `usuarios` entra, e isso é o ponto: 27 dos 33 usuários da homologação têm e-mail
 * `@homolog.local`, que o gate DISPENSA por ser família sintética declarada (medido em 27/09/2026).
 * Uma denylist montada só com "o que reprovaria" deixaria de fora justamente a maior parte do time,
 * porque o e-mail deles já passa. Quem é pessoa não se decide pela forma do e-mail.
 *
 * O QUE SAI DA DENYLIST é só o que o ARNÊS DECLAROU: a conta sintética de captura aparece na tela
 * (saudação, avatar, autoria de quem fez o quê), e sem essa subtração o gate recusaria a própria
 * conta que captura. A subtração é do que o arnês declarou, valor a valor, nunca de família.
 *
 * ┌─ A `origem`, E POR QUE ELA NÃO É UM DETALHE DE IMPLEMENTAÇÃO ────────────────────────────────┐
 * │ `"PESSOA"` (o padrão) é a linha vinda de uma TABELA DE GENTE: `usuarios` e `comerciais`, em que    │
 * │ cada linha É uma pessoa cadastrada. O nome dela entra em `nomes`, que a busca procura na imagem E   │
 * │ que PODA o catálogo (cliente batizado com o nome de um colega sai da dispensa, que é o certo).     │
 * │                                                                                                │
 * │ `"COLUNA"` é a linha vinda de uma COLUNA DE TEXTO LIVRE (`dados_vaga_folha.gestor_bp`). O nome vai  │
 * │ para `nomesDeColuna`: a busca na imagem é IDÊNTICA, e a poda do catálogo NÃO acontece. Medido:      │
 * │ 108 dos 390 valores do gestor não têm forma de pessoa (são nome de OPERAÇÃO), e podar o catálogo     │
 * │ com eles recusou `/admin/integracao-clientes` por `raful - cozinha`. Ver `NegadosDeEquipe`.        │
 * │                                                                                                │
 * │ O PADRÃO É `"PESSOA"` porque esquecer o argumento tem de falhar para o lado da PROTEÇÃO MAIOR (a    │
 * │ poda a mais recusa uma tela; a poda a menos deixaria um colega homônimo sair da dispensa).         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function montarNegadosDeEquipe(
  usuarios: LinhaPessoa[],
  allow: AllowlistArnes,
  origem: "PESSOA" | "COLUNA" = "PESSOA",
): NegadosDeEquipe {
  /**
   * O QUE O ARNÊS DECLAROU SAI DA DENYLIST, e para a origem COLUNA isso inclui `gestores`.
   *
   * MEDIDO na execução real (rodada 4): sem esta linha, o gestor sintético do próprio arnês
   * (`GESTOR SIMULADO`, `arnes-seed-manual.ts:284`) entrava na denylist de coluna pela leitura de
   * `gestor_bp` e RECUSAVA `/gerenciador` com `NOME_DE_USUARIO: gestor simulado`. Declarar em
   * `gestores` tem de valer nas DUAS pontas: a regra de rótulo dispensa, e a denylist não o procura.
   */
  const declarados = new Set(
    [
      ...(allow.nomes ?? []),
      ...(allow.emails ?? []),
      ...(origem === "COLUNA" ? (allow.gestores ?? []) : []),
    ].map(achatar),
  );
  const nomes = new Set<string>();
  const emails = new Set<string>();
  for (const u of usuarios) {
    if (u.nome && !declarados.has(achatar(u.nome))) nomes.add(u.nome);
    if (!u.email || declarados.has(achatar(u.email))) continue;
    emails.add(u.email);
    // O NOME DERIVADO DO E-MAIL SEGUE A MESMA ORIGEM do nome cadastrado: ele é a forma que a interface
    // DESENHA daquele mesmo registro, então mandá-lo para `nomes` quando a origem é COLUNA seria a
    // poda do catálogo voltando pela porta do e-mail (94 dos 431 valores do gestor têm e-mail dentro).
    const derivado = nomeExibidoDoEmail(u.email);
    if (derivado && !declarados.has(achatar(derivado))) nomes.add(derivado);
  }
  // O E-MAIL NÃO SE DIVIDE POR ORIGEM: ele nunca poda catálogo nenhum (`contemNomeNegado` só olha
  // nome), e a busca por e-mail na imagem é literal e não tem falso positivo sobre catálogo.
  if (origem === "COLUNA") return { nomes: [], emails: [...emails], nomesDeColuna: [...nomes] };
  return { nomes: [...nomes], emails: [...emails] };
}

/**
 * ─ O NOME QUE A TELA MOSTRA NÃO É O NOME DO CADASTRO, E ISSO FOI MEDIDO ─────────────────────────
 *
 * A barra lateral desenha o usuário logado com `displayName(user.email)`
 * (`components/shell/Sidebar.tsx`): ela parte o pedaço antes do `@`, quebra em `.`, `_` e `-` e
 * capitaliza. O painel inicial faz o mesmo com o primeiro pedaço. Ou seja, o que aparece em TODA tela
 * é derivado do E-MAIL, e pode nem ser o `nome` da tabela.
 *
 * Procurar só o `nome` do cadastro deixaria passar exatamente a forma mais onipresente do nome de um
 * colega: a da barra lateral, que sai em todo print. Então a denylist reproduz a derivação da
 * interface, em vez de supor que as duas formas coincidem.
 */
export function nomeExibidoDoEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const partes = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  // UMA palavra só não vira busca: "Rike" isolado recusaria meia interface (mesma razão de
  // `variantesDeNomeDeUsuario` exigir duas palavras).
  return partes.length >= 2 ? partes.join(" ") : "";
}

export async function conferirBaseAntesDoLote(deps: DependenciasLote): Promise<VeredictoDeBase> {
  let total = 0;
  const sujas: TabelaDePessoas[] = [];
  const vazias: TabelaDePessoas[] = [];
  let negados: NegadosDeEquipe = { nomes: [], emails: [] };

  // AS TRÊS TABELAS, SEMPRE, sem parar na primeira: `usuarios` é a que todo mundo esquece, e ela
  // aparece em print (tela de Usuários, seletor de responsável, "criado por", canto do cabeçalho).
  for (const tabela of TABELAS) {
    const linhas = await deps.amostrarPessoas(tabela);
    if (linhas.length === 0) {
      // AMOSTRA VAZIA NÃO É PROVA DE LIMPEZA: é consulta que falhou, credencial errada ou tabela
      // renomeada. Aprovar transformaria erro de leitura em licença para capturar.
      vazias.push(tabela);
      continue;
    }
    const prefixos = deps.prefixosCpfSintetico ?? PREFIXOS_CPF_SINTETICO;
    // A RÉGUA DE `usuarios` E DE `comerciais` É OUTRA quando a detecção por imagem está declarada:
    // nome e e-mail dessa gente REAL deixam de barrar o lote e viram o que o gate PROCURA em cada
    // imagem. O CPF continua estrito, e a linha vazia continua reprovando (consulta torta não é base
    // limpa, e leitura torta de `comerciais` seria a proteção nova desligada em silêncio).
    const porImagem =
      (tabela === "usuarios" || tabela === "comerciais") &&
      deps.reguaDeUsuarios === "DETECCAO_POR_IMAGEM";
    // SOMA, nunca substitui: as duas tabelas alimentam a MESMA denylist, e a segunda não pode apagar
    // a primeira (é a mesma régua do `unirNegados`, que existe para a proteção nunca encolher).
    if (porImagem) {
      negados = unirNegados(negados, montarNegadosDeEquipe(linhas, deps.allowlist));
    }
    const fora = linhas.filter((l) =>
      porImagem
        ? linhaVazia(l) || cpfForaDoPadrao(l, prefixos)
        : linhaForaDoPadrao(l, deps.allowlist, prefixos),
    ).length;
    if (fora > 0) {
      total += fora;
      sujas.push(tabela);
    }
  }

  /**
   * AS COLUNAS DE PESSOA, depois das três tabelas (o `negados` das tabelas já está montado, e a fonte
   * de régua `DENYLIST` SOMA nele, nunca substitui). Cada fonte é tratada pela régua declarada em
   * `REGUA_DAS_COLUNAS_DE_PESSOA`, e o mapa ser um `Record` da união fecha o caso: não existe fonte
   * sem régua, então não existe fonte caindo num ramo por omissão. Amostra vazia é ACEITA (ver
   * `ColunaDePessoa`).
   */
  const colunasSujas: ColunaDePessoa[] = [];
  if (deps.amostrarColunaDePessoa) {
    const prefixos = deps.prefixosCpfSintetico ?? PREFIXOS_CPF_SINTETICO;
    for (const fonte of COLUNAS_DE_PESSOA) {
      const regua = REGUA_DAS_COLUNAS_DE_PESSOA[fonte];
      // `LIBERADA` E `ROTULO` NÃO SÃO LIDAS, e o `continue` vem ANTES da consulta de propósito: assim
      // não existe sequer um array com aquele valor dentro deste escopo, e nenhuma linha futura pode,
      // por descuido, encaminhá-lo para a allowlist que monta a denylist (ver o bloco da régua).
      //
      // AS DUAS CAEM NO MESMO `continue` POR RAZÕES OPOSTAS, e é por isso que elas são réguas
      // DIFERENTES em vez de um valor só: `LIBERADA` não é lida porque não há o que proteger (ato do
      // diretor); `ROTULO` não é lida porque LER O VALOR NÃO É O JEITO DE PROTEGÊ-LO, e quem a protege
      // é a regra de rótulo `GESTOR` do gate, que recusa a imagem que desenha o campo.
      if (regua === "LIBERADA" || regua === "ROTULO") continue;
      const linhas = await deps.amostrarColunaDePessoa(fonte);
      if (linhas.length === 0) continue;
      if (regua === "DENYLIST") {
        // LÊ e PROTEGE, sem julgar a população: o valor vira o que o gate procura em cada imagem, e o
        // veredito da base não é tocado (nem `total`, nem `colunasSujas`). É a decisão do diretor de
        // 28/09/2026 escrita em duas linhas: o gestor continua protegido e deixa de barrar o lote.
        //
        // `"COLUNA"` NÃO É DETALHE: é a origem que manda o nome para `nomesDeColuna`, que entra na
        // BUSCA de cada imagem e NUNCA na poda do catálogo. Omiti-la aqui reabre, em silêncio, o falso
        // positivo medido (`raful - cozinha`, `/admin/integracao-clientes`). Ver `NegadosDeEquipe`.
        negados = unirNegados(negados, montarNegadosDeEquipe(linhas, deps.allowlist, "COLUNA"));
        continue;
      }
      // Linha sem conteúdo aqui é coluna NULA, que é normal (motivo em branco, substituído ausente), e
      // não consulta torta: por isso ela é ignorada em vez de reprovar, ao contrário das tabelas.
      const fora = linhas.filter(
        (l) => !linhaVazia(l) && linhaForaDoPadrao(l, deps.allowlist, prefixos),
      ).length;
      if (fora > 0) {
        total += fora;
        colunasSujas.push(fonte);
      }
    }
  }

  if (vazias.length > 0) {
    return {
      aprovado: false,
      totalForaDoPadrao: total,
      tabelas: [...sujas, ...vazias],
      negados,
      motivo:
        `A amostra de ${vazias.join(" e ")} voltou VAZIA. Zero linha não é base limpa: é consulta ` +
        `que falhou, credencial errada ou tabela renomeada. O lote não começa.`,
    };
  }
  if (sujas.length > 0 || colunasSujas.length > 0) {
    return {
      aprovado: false,
      totalForaDoPadrao: total,
      tabelas: sujas,
      colunas: colunasSujas,
      negados,
      motivo:
        `BASE REPROVADA PARA CAPTURA: ${total} linha(s) fora do padrão sintético em ` +
        `${[...sujas, ...colunasSujas].join(" e ")}. A URL ser a da homologação e o database ter o ` +
        `nome de homologação NÃO ` +
        `provam o conteúdo: depois de um re-clone as duas coisas continuam verdadeiras e a base está ` +
        `cheia de gente. O conserto é anonimizar o DADO da homologação, nunca afrouxar o gate (§A.6).`,
    };
  }
  return { aprovado: true, totalForaDoPadrao: 0, tabelas: [], negados };
}

export class FalhaDeLote extends Error {}

/**
 * O lote: confere a base e só então captura, roteiro por roteiro.
 *
 * A DENYLIST VAI PARA O CHAMADOR PELO MESMO CAMINHO DA APROVAÇÃO (segundo argumento de `capturar`),
 * e não por uma variável que ele monta do lado de fora: quem captura não tem como receber a licença
 * de rodar sem receber, no mesmo ato, o conjunto que o gate precisa procurar em cada imagem.
 */
export async function executarLote<R extends { slug: string }>(
  roteiros: R[],
  deps: DependenciasLote & {
    capturar: (roteiro: R, negados: NegadosDeEquipe) => Promise<void>;
  },
): Promise<void> {
  const veredicto = await conferirBaseAntesDoLote(deps);
  if (!veredicto.aprovado) {
    throw new FalhaDeLote(`${veredicto.motivo ?? "base reprovada"} Nenhuma captura foi executada.`);
  }
  for (const roteiro of roteiros) await deps.capturar(roteiro, veredicto.negados);
}
