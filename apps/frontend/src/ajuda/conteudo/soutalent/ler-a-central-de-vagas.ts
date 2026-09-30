import type { Artigo } from "../../tipos";

/**
 * ─ N1 DA CENTRAL DE VAGAS 1 de 2: LER A TELA ───────────────────────────────────────────────────
 *
 * ┌─ O QUE ESTE ARTIGO ENSINA, E O QUE ELE DE PROPÓSITO NÃO ENSINA ───────────────────────────────┐
 * │ Aqui está a LEITURA: as três faixas de indicador do topo, as dez colunas da tabela e o que      │
 * │ cada pill de status quer dizer. O GESTO de filtrar, de ordenar pelo cabeçalho, de buscar, de    │
 * │ usar o card como filtro, de virar a página e de ler a linha da tabela já é artigo do módulo     │
 * │ Começar Aqui, e é o MESMO em dez telas: reexplicar aqui criaria a segunda aula de filtro, que   │
 * │ diverge da primeira no ajuste seguinte do componente. Os seis estão em `relacionados`.          │
 * │                                                                                                 │
 * │ O GESTO de abrir o painel da vaga é o artigo irmão (`abrir-o-painel-da-vaga`), e os gestos do    │
 * │ funil (adicionar, mover, finalizar posição, registrar saída, enviar para admissão) têm artigo   │
 * │ próprio cada um. Este artigo para na porta, que é o botão da coluna Ações.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS RÓTULOS DESTA TELA VÊM DE **CADASTRO**, E ISSO MUDA COMO O ARTIGO OS DECLARA ─────────────┐
 * │ A pill de status e o card de etapa não têm rótulo escrito no código: eles saem dos catálogos    │
 * │ que a diretoria edita (`as_vaga_status` e `as_etapas_funil`), e o código só sabe o PAPEL de      │
 * │ cada linha. Os rótulos declarados em `controles` são, então, os do cadastro em uso, e não uma    │
 * │ lista fixa: o texto dos passos diz isso com todas as letras, para quem lê não concluir que       │
 * │ falta status quando a diretoria renomear um ou criar outro.                                      │
 * │                                                                                                 │
 * │ TRÊS RÓTULOS FORAM MEDIDOS NA TELA E **NÃO EXISTEM NO CÓDIGO** com essa grafia ("Etapa           │
 * │ Cliente", "Contratado", "Candidatura"). A semente do catálogo escreve "Entrevista Cliente", e    │
 * │ o vocabulário de situação escreve "Aprovado", "Alocado", "Descartado", "Desistiu" e "Enviado     │
 * │ Para Admissão". Eles estão declarados porque são o que a pessoa LÊ, e a divergência foi          │
 * │ reportada ao coordenador: quem decide se o cadastro muda ou se o artigo muda não é o redator.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS TÍTULOS DE COLUNA SÃO DECLARADOS COMO A TELA OS ESCREVE ("Posições", "Consultor Responsável",
 * "SLA De Entrega"). A tela os desenha em caixa alta por ESTILO, não por texto, então a caixa alta
 * que aparece em comentário de código ("POSIÇÕES") não é rótulo de nada.
 *
 * ┌─ O ARTIGO GANHOU IMAGEM EM 30/09/2026, E O BLOQUEIO QUE O IMPEDIA CAIU ───────────────────────┐
 * │ Ele nasceu SEM print, e a causa era de DADO: `as_candidatos` e `as_candidaturas` tinham ZERO    │
 * │ linha na homologação, e print de tela vazia PARECE pronto, que é pior do que print faltando.    │
 * │ O arnês sintético de A&S (`arnes-seed-as-manual`) povoou as duas, e a auditoria liberou as      │
 * │ rotas do módulo.                                                                                │
 * │                                                                                                 │
 * │ O TEXTO CONTINUA FUNCIONANDO SOZINHO, e isso não mudou: nenhum passo diz "veja na figura", cada │
 * │ faixa e cada coluna é nomeada pelo rótulo que a pessoa lê na tela, e a ordem dos passos é a      │
 * │ ordem em que a tela é lida. A imagem confirma o texto, nunca o substitui.                        │
 * │                                                                                                 │
 * │ O RECORTE ACABOU SENDO DE **POPULAÇÃO**, E NÃO DE PIXEL: a coluna Consultor Responsável escreve │
 * │ nome de usuário do time, então o roteiro busca `SIM-AS-2026` e deixa na tela só as vagas do      │
 * │ arnês, cujo consultor é a conta de captura. A justificativa inteira está no roteiro.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum travessão, e a célula sem preenchimento é "não informado". §A.24: title case em
 * título e em etiqueta; botão que é ação fica em escrita normal ("Limpar seleção").
 */
export const artigo: Artigo = {
  slug: "ler-a-central-de-vagas",
  titulo: "Ler A Central De Vagas",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-vagas",
  resumo:
    "Como ler a Central De Vagas: as três faixas de indicador do topo, o que cada coluna da tabela diz, o que cada pill de status significa e onde ver quantas vagas e quantas posições estão abertas.",
  termos: [
    "central de vagas",
    "lista de vagas",
    "quantas vagas abertas",
    "quantas posicoes abertas",
    "vaga parada",
    "vaga pausada",
    "vaga em revisao",
    "vaga atrasada",
    "prazo da vaga",
    "sla",
    "quem e o consultor da vaga",
    "quantos candidatos na vaga",
    "posicoes de banco",
    "cards de vaga",
    "indicadores de vaga",
    "ler a tela de vagas",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Clique em Central De Vagas, no menu da lateral esquerda.",
      detalhe:
        "A tela abre mostrando as vagas vivas. A vaga encerrada volta para a lista quando você escolhe o status dela no filtro.",
      controles: ["Central De Vagas"],
    },
    {
      gesto: "Leia a primeira faixa do topo, Status: ela conta VAGAS.",
      print: {
        arquivo: "01-faixas-de-indicador.png",
        legenda:
          "As três faixas do topo: Status conta vagas, Inserção Por Etapa e Desfechos contam gente.",
      },
      detalhe:
        "O primeiro card é dividido no meio: à esquerda quantas vagas, à direita quantas posições, porque uma vaga de dez posições são dez contratações a fazer. Com um status escolhido no filtro, os dois passam a dizer No Recorte.",
      controles: [
        "Status",
        "Vagas Abertas",
        "Posições Abertas",
        "Vagas No Recorte",
        "Posições No Recorte",
      ],
    },
    {
      gesto: "Reconheça a pill de status de cada vaga pelo nome que o cadastro dá a ela.",
      detalhe:
        "Rascunho é vaga guardada, Aberta é vaga captando gente, Entregue e Fechada encerram com entrega e sem entrega, Cancelada é o encerramento sem processo, e Pendente De Revisão é a vaga que entrou sozinha e ninguém conferiu ainda. Quem nomeia os status é a diretoria, então esta lista pode ganhar nome novo.",
      controles: [
        "Rascunho",
        "Aberta",
        "Entregue",
        "Fechada",
        "Cancelada",
        "Pendente De Revisão",
      ],
    },
    {
      gesto: "Leia a segunda faixa, Inserção Por Etapa: ela conta GENTE em seleção.",
      detalhe:
        "Cada card é uma etapa do funil, na ordem do processo, e o nome vem do cadastro da diretoria. Stand By é a etapa de quem ficou parado no processo. Card marcado Inativa é etapa fora de circulação que ainda tem alguém parado dentro.",
      /*
       * "Stand By" É ETAPA, E NÃO STATUS DA VAGA, e a troca é fácil de fazer: o mesmo texto existe
       * como etapa do funil (semente da migration 0111, em `as_etapas_funil`) e como nome de motivo
       * de descarte. A vaga PAUSADA é outra coisa, e o catálogo de status não tem essa linha.
       */
      controles: ["Inserção Por Etapa", "Etapa", "Etapa Cliente", "Stand By", "Inativa"],
    },
    {
      gesto: "Leia a terceira faixa, Desfechos: o que já foi decidido sobre quem passou pela vaga.",
      detalhe:
        "Quem está em seleção é contado na etapa; quem já recebeu decisão é contado aqui. Ninguém é contado nas duas faixas ao mesmo tempo.",
      controles: [
        "Desfechos",
        "Aprovados",
        "Alocados",
        "Contratado",
        "Candidatura",
        "Descartados Pela Seleção",
        "Desistentes",
        "Enviados Para Admissão",
        "Limpar seleção",
      ],
    },
    {
      gesto: "Leia a linha da tabela da esquerda para a direita.",
      print: {
        arquivo: "02-colunas-da-tabela.png",
        legenda: "O cabeçalho da tabela, com as colunas que identificam e situam a vaga.",
      },
      detalhe:
        "Código é o número do processo seletivo, Vaga é o nome de divulgação, Cliente é o nome da operação e Vínculo é o tipo de contratação. A coluna Cargo não existe nesta tabela: o cargo aparece no painel da vaga, e continua servindo de filtro e de busca.",
      controles: [
        "Código",
        "Vaga",
        "Cliente",
        "Vínculo",
        "Posições",
        "Status",
        "Consultor Responsável",
        "Data De Abertura",
        "SLA De Entrega",
        "Ações",
      ],
    },
    {
      gesto: "Na coluna Posições, leia as três linhas: Oficiais, Banco e Candidatos Em Processo.",
      detalhe:
        "As duas primeiras são metas e têm barra, que enche conforme as posições são entregues. A terceira é gente trabalhando no funil, sem meta: ela não é uma posição a cumprir.",
      controles: ["Oficiais", "Banco", "Candidatos Em Processo"],
    },
    {
      gesto: "Na coluna SLA De Entrega, use a cor antes do número.",
      detalhe:
        "Vermelho é prazo vencido, amarelo é prazo curto (dois dias ou menos), texto normal é prazo em dia e tom apagado é vaga sem previsão de entrega combinada. A vaga encerrada fica discreta, porque ali o número é histórico. E a vaga que já foi entregue escreve entregue no lugar da contagem: o prazo PARA quando ela sai das suas mãos, em vez de continuar correndo e vencer sozinha enquanto o cliente decide. No filtro, essa mesma situação se chama Vaga Entregue. Reabrindo a vaga, você informa uma previsão nova e o prazo volta a contar a partir dela.",
      controles: ["Prazo Vencido", "Prazo Curto", "No Prazo", "Sem Previsão", "Vaga Entregue", "Vaga Encerrada"],
    },
    {
      /*
       * A PORTA, E SÓ A PORTA. O que existe dentro do painel é o artigo irmão, e os gestos do funil
       * são um artigo cada. Declarar aqui o rótulo acessível do botão ("Abrir a gestão da vaga")
       * tiraria da peça 2 justamente o controle que ela existe para ensinar.
       */
      gesto: "Achou a vaga? Clique em Gestão Da Vaga, na coluna Ações.",
      print: {
        arquivo: "03-botao-de-gestao-da-vaga.png",
        legenda: "O botão da coluna Ações, o único da linha, que abre a vaga inteira.",
      },
      detalhe:
        "É o único botão da linha, e ele abre a vaga inteira: a ficha, a trilha do processo e quem está nela.",
      controles: ["Gestão Da Vaga"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A lista diz Nenhuma vaga corresponde ao filtro aplicado. Ajuste os filtros ou limpe todos.",
      acao: "Algum recorte está ligado. Confira se há card aceso nas três faixas, clique em Limpar seleção ao lado do título Desfechos e limpe também os campos do filtro ao lado da busca.",
    },
    {
      sintoma: "A tela diz Nenhuma vaga cadastrada ainda. Use o botão Abrir vaga.",
      acao: "Aí não é recorte: a base está vazia de verdade. A primeira abertura é feita pelo botão que a própria frase indica.",
    },
    {
      sintoma: "A soma dos cards não fecha com o número de vagas que eu esperava.",
      acao: "Os cards contam o que o recorte deixou passar, nunca a base inteira, e a vaga encerrada só entra na conta quando você escolhe o status dela no filtro. Leia o rodapé da lista: ele diz quantas passaram e de quantas.",
    },
    {
      sintoma: "A coluna Consultor Responsável diz não informado.",
      acao: "A vaga foi aberta sem escolher o consultor do outro lado. Não é erro de carregamento, é preenchimento que falta, e ele é feito no painel da vaga.",
    },
    {
      sintoma: "A coluna SLA De Entrega diz não informado.",
      acao: "Aquela vaga não tem previsão de entrega combinada, então não há prazo a cobrar. Para ver todas de uma vez, escolha Sem Previsão no filtro de SLA De Entrega.",
    },
    {
      sintoma: "Um card de etapa está marcado Inativa.",
      acao: "Aquela etapa saiu de circulação e não recebe mais ninguém, mas ainda tem gente parada dentro. Clique no card para ver quais vagas são, e mova essas pessoas para uma etapa viva.",
    },
  ],
  regras: [
    "A tela mostra as vagas vivas. A encerrada volta para a lista quando o status dela é escolhido no filtro.",
    "Os cards contam o recorte que está à vista, e não a base inteira.",
    "A faixa Status conta vagas. As faixas Inserção Por Etapa e Desfechos contam gente.",
    "Quem está em seleção é contado na etapa e quem já recebeu decisão é contado no desfecho, então ninguém aparece nas duas faixas.",
    "Uma vaga com dez posições são dez contratações, e é por isso que o primeiro card conta vagas e posições lado a lado.",
    "Posições de banco são contadas separadas das posições oficiais.",
    "Os nomes dos status e das etapas vêm de cadastro da diretoria: eles podem ser renomeados e podem nascer novos.",
    "Célula sem preenchimento diz não informado, em qualquer coluna da tabela.",
  ],
  relacionados: [
    "abrir-o-painel-da-vaga",
    "abrir-uma-vaga-nova",
    "ler-a-central-de-candidatos",
    "filtrar-uma-lista",
    "filtrar-pelo-card-de-indicador",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
    "virar-a-pagina-da-lista",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/frontend/src/lib/as-vagas-funil.ts",
    "apps/frontend/src/lib/as-vaga-sla.ts",
    "apps/frontend/src/lib/as-status-vaga.ts",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
