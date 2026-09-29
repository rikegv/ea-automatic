/**
 * ─ O VOCABULÁRIO DA CENTRAL DE AJUDA ────────────────────────────────────────────────────────────
 *
 * ARQUIVO DE DONO ÚNICO, O COORDENADOR (§A.39). Ele é lido por três camadas que trabalham em
 * paralelo (o conteúdo dos artigos, a tela que os renderiza e o motor que captura os prints), e é
 * exatamente o tipo de arquivo que dois agentes sobrescrevem em silêncio se cada um escrever o seu
 * pedaço. Precisa de campo novo, o pedido vem ao coordenador.
 *
 * ┌─ POR QUE O CONTEÚDO É TYPESCRIPT, E NÃO MARKDOWN ────────────────────────────────────────────┐
 * │ Markdown pareceria a escolha óbvia para um manual, e é a errada aqui por três razões, na       │
 * │ ordem em que pesam:                                                                            │
 * │                                                                                                │
 * │   1. O CAMPO OBRIGATÓRIO É OBRIGATÓRIO DE VERDADE. Artigo que ESQUECE `fontes`, `rotas` ou     │
 * │      `passos` não compila, e em markdown o esquecimento passa calado.                          │
 * │   2. O MANUAL PRECISA SABER O QUE ELE ENSINA. `fontes` e `rotas` não são enfeite: são a        │
 * │      máquina que detecta artigo VELHO. Texto solto não tem como apontar para um arquivo de     │
 * │      tela e avisar que aquela tela mudou.                                                      │
 * │   3. O frontend não tem renderizador de markdown nas dependências, e trazer MDX puxa uma       │
 * │      cadeia de build nova para resolver um problema que o tipo já resolve.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O TIPO **NÃO** GARANTE, E ESTE BLOCO EXISTE PORQUE EU AFIRMEI O CONTRÁRIO ────────────┐
 * │ A primeira redação deste arquivo dizia que artigo "sem `fontes`, com `slug` repetido ou       │
 * │ apontando para rota que não existe NÃO COMPILA". A cobertura independente conferiu e me       │
 * │ desmentiu: com `slug: string`, `rotas: string[]` e `fontes: string[]`, os TRÊS compilam, e     │
 * │ compilam porque `[]` é um `string[]` perfeitamente válido e `"/rota/que/nao/existe"` é uma     │
 * │ string perfeitamente válida.                                                                   │
 * │                                                                                                │
 * │ FICA CORRIGIDO EM VEZ DE APERTADO, e a escolha é deliberada: dava para transformar `rotas`     │
 * │ numa união literal de todas as rotas do app e `fontes` numa tupla não vazia, e o custo seria   │
 * │ um tipo que precisa ser regerado a cada tela nova, para cobrir três erros que uma VARREDURA    │
 * │ do registro pega de uma vez e com mensagem em português.                                       │
 * │                                                                                                │
 * │ QUEM CONFERE DE VERDADE é `registro.coerencia.tester.spec.ts`: slug duplicado, `relacionados` │
 * │ apontando para artigo inexistente, rota morta e artigo sem `fontes`. Comentário que promete    │
 * │ garantia que não existe é pior que comentário nenhum, porque a próxima sessão confia nele e    │
 * │ deixa de escrever a verificação que falta.                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum texto daqui chega ao usuário com travessão. §A.24: título e etiqueta em title case.
 * §A.6: NADA neste arquivo, e nada em artigo nenhum, carrega dado de pessoa real. O print é gerado
 * contra o arnês sintético, e o motor recusa gravar imagem que contenha CPF, nome ou e-mail de fora
 * dele, porque print vai para o repositório e repositório guarda para sempre.
 */

/** Os módulos do sumário. A ordem aqui é a ordem em que a Central de Ajuda os lista. */
export const MODULOS_AJUDA = [
  "COMECAR_AQUI",
  "SOUL_ADM",
  "SOUTALENT",
  "PAINEIS",
  "CONFIGURACAO",
] as const;
export type ModuloAjuda = (typeof MODULOS_AJUDA)[number];

/** O rótulo de cada módulo na tela (§A.24, title case). */
export const MODULO_AJUDA_LABEL: Record<ModuloAjuda, string> = {
  COMECAR_AQUI: "Começar Aqui",
  SOUL_ADM: "Soul ADM",
  SOUTALENT: "SouTalent",
  PAINEIS: "Painéis",
  CONFIGURACAO: "Configuração",
};

/**
 * ─ O QUE A SETA VERMELHA APONTA ────────────────────────────────────────────────────────────────
 *
 * ┌─ O ALVO É DESCRITO PELO ELEMENTO, NUNCA POR PIXEL, E É ISSO QUE SUSTENTA A §A.43 ────────────┐
 * │ Um print anotado à mão é uma imagem: quando a tela muda, ele vira um desenho errado que       │
 * │ alguém precisa refazer, e ninguém refaz. Descrevendo o alvo por PAPEL e NOME, o print é       │
 * │ REGERADO por comando, e o dia em que o botão sumir da tela o motor FALHA em vez de gravar     │
 * │ uma imagem sem a seta. É por isso que o alvo não encontrado é falha dura: ele É o detector    │
 * │ de artigo velho, e detector que apenas avisa não é detector, é ruído que ninguém lê.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * PREFIRA SEMPRE `papel` MAIS `nome`: o localizador acessível sobrevive a troca de classe, de cor e
 * de layout, que é o que mais muda numa tela viva. O `seletor` é a saída de emergência para o que
 * não tem papel acessível, e usá-lo é assumir que aquele print quebra mais cedo.
 */
export type Alvo = {
  /**
   * `spinbutton` É O PAPEL DO CAMPO NUMÉRICO (`<input type="number">`), e ele NÃO é um `textbox`.
   * Sem ele na lista, um roteiro que aponte um contador (as posições da vaga, por exemplo) só tem a
   * saída do `seletor`, que é a que quebra mais cedo. *(Medido em 27/09/2026, no roteiro
   * "abrir-uma-vaga-nova".)*
   */
  papel?:
    | "button"
    | "link"
    | "tab"
    | "textbox"
    | "spinbutton"
    | "combobox"
    | "cell"
    | "heading";
  nome?: string | RegExp;
  /** Só quando não há papel acessível. Seletor de teste é preferível a seletor de classe. */
  seletor?: string;
  /** O rótulo vermelho desenhado ao lado da marcação. Curto: ele é uma etiqueta, não uma frase. */
  texto: string;
  forma?: "elipse" | "retangulo";
  /** SUGESTÃO de lado. O motor pode ignorar por falta de espaço ou por colisão com outro rótulo. */
  lado?: "esquerda" | "direita" | "acima" | "abaixo";
};

/**
 * ─ UMA IMAGEM DO ARTIGO, E ELA NÃO DECLARA MAIS OS ALVOS ───────────────────────────────────────
 *
 * ┌─ A DUPLICAÇÃO QUE FOI TIRADA DAQUI, E POR QUE ELA ERA PERIGOSA ──────────────────────────────┐
 * │ Na primeira redação, o `Print` do ARTIGO e a captura do ROTEIRO carregavam os mesmos `alvos`, │
 * │ e quem o motor lê é o ROTEIRO. Ou seja: o artigo carregava uma cópia que não governava nada.  │
 * │ Com três pilotos dá para manter as duas iguais à mão. Com 84 artigos e 400 imagens, elas      │
 * │ divergem, e a divergência é SILENCIOSA: o artigo descreveria uma seta e a imagem mostraria    │
 * │ outra, sem nada falhar, que é a forma mais cara de erro deste projeto inteiro.                │
 * │                                                                                               │
 * │ Levantado pelo `frontend` ao fechar os roteiros dos pilotos, com a observação certa: "hoje eu │
 * │ mantenho os dois iguais à mão".                                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENTÃO O ARTIGO DIZ **QUAL IMAGEM** E **O QUE ELA MOSTRA**; o roteiro diz **ONDE AS SETAS VÃO**.
 * Uma fonte só para cada coisa, e quem precisa das duas é só o motor.
 */
export type Print = {
  /** Nome do arquivo dentro de `public/ajuda/<slug>/`. Numerado, para a ordem ser óbvia no disco. */
  arquivo: string;
  legenda: string;
};

/*
 * ─ POR QUE `preparo` E `recorte` NÃO ESTÃO AQUI, E SIM NA `Captura` ────────────────────────────
 *
 * ELES ESTIVERAM AQUI, E ERA O MESMO DEFEITO DOS `alvos`, REPETIDO. A cobertura independente mediu
 * e mostrou: com os dois campos no `Print`, a `Captura` os herdava e OS DOIS LADOS podiam declarar
 * o mesmo estado. Hoje seria inofensivo, porque o lado que fica vazio é justamente o que não
 * governa. Invertido, não é: um artigo que declara `recorte` e uma captura que não declara produz
 * um texto prometendo imagem recortada e uma imagem de tela INTEIRA.
 *
 * E NO `recorte` ISSO É PIOR QUE UMA SETA A MENOS, que é a razão de eu ter corrigido em vez de
 * documentar: o recorte É a medida de privacidade das telas que mostram gente, e o gate audita
 * DENTRO da caixa. Recorte que não acontece não é um enquadramento feio, é a tela inteira, com
 * nome de pessoa, entrando num PNG versionado.
 *
 * A REGRA GERAL QUE FICA, e ela vale para o próximo campo que alguém quiser acrescentar: o ARTIGO
 * declara o que o LEITOR precisa saber (qual imagem, o que ela mostra); a CAPTURA declara o que o
 * MOTOR precisa fazer (onde as setas vão, que estado preparar, o que recortar). Campo que os dois
 * lados podem declarar é campo que diverge em silêncio.
 */

/**
 * UM PASSO DO PASSO A PASSO.
 *
 * O `gesto` é o que a pessoa FAZ, escrito no imperativo e começando por verbo ("Clique em Abrir
 * Vaga"), porque é assim que se lê um manual com a mão no mouse. O `detalhe` é o porquê, e ele é
 * OPCIONAL de propósito: passo que precisa de três linhas de explicação normalmente é dois passos.
 */
export type Passo = {
  gesto: string;
  detalhe?: string;
  print?: Print;
  /**
   * ─ OS RÓTULOS LITERAIS DOS CONTROLES QUE ESTE PASSO USA ────────────────────────────────────────
   *
   * ┌─ POR QUE `termos` NÃO RESOLVIA, E ESTE CAMPO PRECISOU EXISTIR ──────────────────────────────┐
   * │ O diretor testou o manual e perguntou pelo que ele chama de "cada recurso": "como filtro     │
   * │ isso", "o que esse botão faz". Eu respondi que a saída era a BUSCA mais os SINÔNIMOS, e o    │
   * │ `arquiteto` mediu e corrigiu a metade que faltava: `termos` é escrito pensando em SINÔNIMO   │
   * │ ("atestado" para "ASO"), e quem pergunta "o que esse botão faz" digita o RÓTULO EXATO que    │
   * │ está na tela. O rótulo de um controle que é passo intermediário não estava indexado em lugar │
   * │ nenhum, então a pessoa procurava por ele e não achava nada, mesmo com o artigo pronto.       │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ESCREVA O RÓTULO COMO A TELA O ESCREVE, letra por letra. Não é sinônimo, não é descrição: é o
   * texto do botão, da aba, da coluna ou do campo. O sinônimo continua em `termos`, do artigo.
   *
   * ELE TAMBÉM ALIMENTA DUAS COISAS QUE A PESSOA VÊ: o índice "Nesta Tela" do painel contextual, que
   * é gerado daqui e não escrito à mão, e o link direto para o passo, porque achar o artigo certo e
   * cair no topo de doze passos ainda deixa a pessoa caçando.
   *
   * E É ELE QUE TORNA A COBERTURA MENSURÁVEL: o motor enumera os controles da tela e compara com o
   * que os artigos declaram. Controle que existe na tela e em artigo nenhum é lacuna MEDIDA, e não
   * opinião. Foi opinião não medida que produziu o primeiro inventário, e ele saiu pela metade.
   */
  controles?: string[];
};

/** Para quem o artigo foi escrito. Muda o tom, nunca a profundidade do passo a passo. */
export type PublicoAjuda = "OPERACAO" | "GESTAO" | "AMBOS";

/**
 * ─ UM BLOCO COMPARTILHADO POR FAMÍLIA DE ARTIGOS ───────────────────────────────────────────────
 *
 * É a parte que TODOS os artigos de uma mesma tela ou aba têm igual: o pré-requisito de chegar ali e
 * os erros que aquela tela dá. Mora em `conteudo/familias.ts`, uma entrada por família.
 *
 * ELE NÃO SUBSTITUI O BLOCO DO ARTIGO, SOMA COM ELE. Artigo sem nada de próprio fica só com o da
 * família; artigo com um erro exclusivo escreve esse erro e herda os outros.
 */
export type FamiliaDeArtigos = {
  /** O código que o artigo escreve em `familia`. Kebab case, como os slugs. */
  codigo: string;
  /** O rótulo humano da família, para a mensagem da varredura de coerência. */
  rotulo: string;
  preRequisitos: string[];
  seDerErrado: Array<{ sintoma: string; acao: string }>;
};

export type Artigo = {
  /** Único no sistema inteiro. É ele que vira a URL `/ajuda/<slug>`. */
  slug: string;
  titulo: string;
  modulo: ModuloAjuda;
  /**
   * AS ROTAS QUE ESTE ARTIGO ENSINA, e elas fazem dois trabalhos: alimentam o botão de ajuda
   * contextual (a tela pergunta "quem me ensina?") e alimentam o detector de ROTA MORTA, que
   * acusa o artigo que ficou ensinando uma tela que não existe mais.
   */
  rotas: string[];
  /** Códigos de menu necessários para executar o que o artigo ensina. Lidos do registro de menus. */
  menus: string[];
  publico: PublicoAjuda;
  /**
   * ─ A PROFUNDIDADE DO ARTIGO, e é ela que define a ORDEM DAS FASES ─────────────────────────────
   *
   * `N1` é o CAMINHO PRINCIPAL: quem ler só os N1 de um módulo consegue trabalhar. `N2` é o recurso
   * secundário, que é justamente o "cada recurso de cada tela" que o diretor pediu.
   *
   * ┌─ POR QUE ISSO É CAMPO E NÃO ORGANIZAÇÃO DE PASTA ───────────────────────────────────────────┐
   * │ O inventário dobrou, e com 196 peças o corte por MÓDULO entregaria um Soul ADM exaustivo e   │
   * │ ZERO SouTalent por meses. Cortando por PROFUNDIDADE, o manual cobre o sistema INTEIRO já na  │
   * │ terceira fase, raso, e só então aprofunda. Quem opera prefere um manual que responde a tudo  │
   * │ pela metade a um que responde a metade por inteiro.                                          │
   * │                                                                                              │
   * │ O EFEITO COLATERAL É REAL e está aceito: cada tela é visitada duas vezes, uma por nível.     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  nivel: "N1" | "N2";
  /**
   * ─ A FAMÍLIA DO ARTIGO, e ela existe para que 87 artigos não nasçam com o MESMO bloco copiado ──
   *
   * ┌─ O PROBLEMA MEDIDO NO DESENHO, e ele é de DIVERGÊNCIA, não de digitação ────────────────────┐
   * │ Todo artigo da aba Auditoria tem o mesmo pré-requisito ("a admissão já precisa estar          │
   * │ liberada") e os mesmos três erros comuns. Com 8 artigos naquela aba, o bloco é escrito 8      │
   * │ vezes; no primeiro ajuste de regra, alguém corrige 3 e esquece 5, e o manual passa a ensinar  │
   * │ duas coisas diferentes sobre a MESMA tela, sem nada falhar. É o modo de erro mais caro desta  │
   * │ frente, e é o mesmo dos `alvos` e do `recorte`: dado que dois lugares podem declarar.         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O ARTIGO DECLARA A FAMÍLIA E ESCREVE SÓ O QUE É DELE. Quem SOMA os dois é o registro
   * (`artigoResolvido`, em `registro.ts`), na leitura, e é por isso que `preRequisitos` e
   * `seDerErrado` continuam sendo listas simples de texto: a tela, a busca e a cobertura leem o
   * artigo JÁ resolvido e não precisam saber que família existe.
   *
   * ORDEM DA SOMA, e ela é fixa: primeiro o bloco da FAMÍLIA, depois o do artigo. O comum vem antes
   * do particular, que é a ordem em que a pessoa lê.
   *
   * FAMÍLIA QUE NÃO EXISTE NO REGISTRO É ERRO, conferido por varredura (o typecheck não pega, pelo
   * mesmo motivo de `rotas` e `fontes` não pegarem: `string` é `string`).
   */
  familia?: string;
  resumo: string;
  /**
   * SINÔNIMOS DE BUSCA, e o critério é duro: escreva o que a PESSOA digita, não o que a TELA
   * escreve. Quem procura "demitir" não digita "registrar saída da candidatura", e um manual que
   * só responde ao próprio vocabulário é um manual que não é achado.
   */
  termos: string[];
  preRequisitos: string[];
  passos: Passo[];
  /** O que fazer quando dá errado. É a parte que o time mais usa e a que os manuais mais esquecem. */
  seDerErrado: Array<{ sintoma: string; acao: string }>;
  /** As regras de negócio que valem ali, em português de operação, sem jargão de código. */
  regras: string[];
  /** `slug` de artigos irmãos. Conferido no typecheck contra o registro gerado. */
  relacionados: string[];
  /**
   * OS ARQUIVOS DE TELA QUE ESTE ARTIGO ENSINA. É a máquina de detecção da §A.43: quando uma frente
   * mexe num desses arquivos, o manual entra na conta da MESMA entrega. Sem isto, a detecção
   * dependeria de alguém lembrar, e é justamente a lembrança que falha.
   */
  fontes: string[];
  /** Data da última conferência humana do CONTEÚDO, no formato ISO. Não é a data do print. */
  revisadoEm: string;
};

/**
 * ─ O ROTEIRO DE CAPTURA, que é o que o motor executa ───────────────────────────────────────────
 *
 * Ele mora AO LADO do artigo e é versionado junto, porque roteiro e artigo envelhecem juntos: o
 * passo que deixou de existir na tela é o mesmo passo que saiu do texto.
 */
export type GestoDePreparo = {
  /**
   * ─ `subirArquivo` ENTROU PORQUE TRÊS PASSOS FICAVAM SEM IMAGEM ──────────────────────────────
   *
   * Pedido pelo `frontend` ao escrever o artigo de importar planilha: o ciclo de PRÉVIA daquela
   * tela (as colunas reconhecidas, o que a IA entendeu, o que vai ser criado) só existe DEPOIS de
   * um arquivo subir. Sem este gesto, o artigo ensina cinco passos e ilustra dois.
   *
   * O ARQUIVO É SINTÉTICO E VERSIONADO JUNTO DO ROTEIRO, nunca um arquivo de verdade de alguém: o
   * que sobe aqui aparece na tela, e o que aparece na tela vai para o print, que vai para o
   * repositório (§A.6). O gate de dado pessoal continua valendo sobre o resultado, então planilha
   * com gente real é recusada na hora de gravar, que é o lado seguro.
   */
  acao: "clicar" | "digitar" | "abrirAba" | "rolarAte" | "subirArquivo";
  alvo: Alvo;
  /** Para `digitar`, o texto. Para `subirArquivo`, o caminho do arquivo sintético do roteiro. */
  valor?: string;
};

/**
 * UMA CAPTURA DO ROTEIRO: a imagem do artigo MAIS as setas, que é o que o motor precisa.
 *
 * É AQUI, E SÓ AQUI, QUE OS ALVOS VIVEM. O artigo referencia a imagem pelo `arquivo`, e o motor
 * casa os dois por esse nome. Alvo declarado em dois lugares é alvo que diverge.
 */
export type Captura = Print & {
  alvos: Alvo[];
  /**
   * ─ O PREPARO DESTA IMAGEM, quando ela exige um estado diferente do resto do roteiro ──────────
   *
   * ┌─ POR QUE ELE EXISTE AQUI, E NÃO SÓ NO ROTEIRO ───────────────────────────────────────────┐
   * │ O `Roteiro` também tem `preparo`, e ele resolve o caso comum: o roteiro inteiro acontece   │
   * │ num estado só de tela. O que ele NÃO resolve é o artigo que ATRAVESSA estados, e esse é o  │
   * │ caso normal de um passo a passo: a abertura de vaga mostra a lista ANTES do formulário, o  │
   * │ formulário NO MEIO e o botão de publicar NO FIM. Com o preparo só no roteiro, um artigo    │
   * │ desses exigiria três roteiros para o mesmo artigo, e aí roteiro e artigo deixariam de      │
   * │ envelhecer juntos, que é a propriedade inteira que faz a §A.43 funcionar.                   │
   * │                                                                                             │
   * │ ELE É OPCIONAL E ACUMULATIVO: o preparo do roteiro roda primeiro e vale para todas as       │
   * │ imagens; este roda depois, e só para esta. Imagem que não declara nada herda o estado do    │
   * │ roteiro, que continua sendo o caso mais comum e o mais barato de capturar.                   │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * Pedido pelo `frontend` ao escrever os roteiros dos pilotos, com o caso real na mão: sem este
   * campo, duas das quatro imagens da abertura de vaga ficavam sem como ser capturadas.
   */
  preparo?: GestoDePreparo[];
  /**
   * ─ CAPTURAR SÓ UM PEDAÇO DA TELA, e este campo é uma exigência de §A.6, não de estética ───────
   *
   * ┌─ AS TELAS QUE NÃO PODEM VIRAR IMAGEM INTEIRA ────────────────────────────────────────────┐
   * │ A auditoria de segurança levantou a lista: Diagnóstico Do Sistema, Controle Gerencial,    │
   * │ Alto Volume, a administração de Usuários, a Sala De Espera, a ficha da admissão e o       │
   * │ wizard de Nova Admissão. Todas mostram gente, e todas precisam ser ENSINADAS. Sem recorte │
   * │ só restariam duas saídas ruins: publicar a tela inteira com nome de pessoa dentro, ou      │
   * │ deixar sete telas do sistema sem manual.                                                   │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O RECORTE NÃO DISPENSA O GATE, E ESTA É A PARTE QUE NÃO PODE SER ESQUECIDA: o gate de dado
   * pessoal roda DENTRO da caixa recortada, nunca antes dela. Recortar sem auditar o recorte só
   * troca o vazamento grande por um pequeno, e o pequeno é o que ninguém revisa.
   *
   * O alvo é o mesmo vocabulário do resto: descreve-se o ELEMENTO que delimita a caixa, não
   * coordenadas, pelo mesmo motivo de sempre. Coordenada envelhece na primeira mudança de layout;
   * elemento que some vira falha dura, que é o detector de artigo velho.
   *
   * Pedido pelo `devops` ao fechar o motor, com a coleta já preparada para receber o escopo.
   */
  recorte?: Alvo;
  /**
   * ─ ESTA IMAGEM PODE MOSTRAR UMA LISTA VAZIA? (dono: coordenador, pedido em 28/09/2026) ─────────
   *
   * ┌─ POR QUE O CAMPO SUBIU PARA CÁ, E POR QUE ELE NÃO NASCEU AQUI ───────────────────────────────┐
   * │ A régua vive em `captura.ts` (`ReguaDeLinhas`) e o motor já a lê. Ela ficou FORA deste         │
   * │ contrato de propósito enquanto NENHUM artigo precisava dela: campo declarável que ninguém      │
   * │ declara é convite para alguém marcá-lo só para destravar uma captura, e a recusa por lista     │
   * │ vazia existe justamente porque **print de tela vazia PARECE pronto**, que é pior do que print  │
   * │ faltando.                                                                                     │
   * │                                                                                               │
   * │ O PRIMEIRO CASO REAL CHEGOU, e é legítimo: a janela "Enviar Link Do Portal" lista só quem NÃO  │
   * │ tem link, e na homologação toda admissão viva já tem o seu. A janela está CORRETA e vazia, e o │
   * │ passo que ela ilustra existe. Sem o campo, o artigo perde a imagem de um passo que acontece.   │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AUSENTE, VALE `AO_MENOS_UMA`, e é esse o ponto: a exceção é ATO ESCRITO, aparece no diff e pode
   * ser perguntada em revisão. Declarar `PODE_SER_VAZIA` só é honesto quando o artigo ENSINA aquele
   * estado ou quando o vazio é o estado CORRETO da tela, nunca quando o arnês não povoou a fila.
   */
  linhasEsperadas?: "AO_MENOS_UMA" | "PODE_SER_VAZIA";
};

export type Roteiro = {
  slug: string;
  /** A rota, sem o domínio. O motor a resolve contra a homologação, nunca contra a produção. */
  url: string;
  /**
   * O ARNÊS DE DADO SINTÉTICO exigido por esta captura. Tela vazia não ensina nada, e tela com dado
   * real não pode virar imagem no repositório. O nome aponta para o arnês que prepara o cenário.
   */
  arnes?: string;
  /** O que fazer ANTES do clique do print: abrir o modal, trocar de aba, digitar na busca. */
  preparo?: GestoDePreparo[];
  capturas: Captura[];
};
