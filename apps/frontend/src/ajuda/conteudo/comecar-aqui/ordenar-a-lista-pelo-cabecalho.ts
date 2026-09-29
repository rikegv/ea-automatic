import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 2 de 14: ORDENAR.
 *
 * O padrão mais repetido do sistema inteiro: 251 colunas ordenáveis em 38 telas, todas saindo do
 * mesmo par (`ColunaOrdenavel` mais `useOrdenacao`). Um artigo cobre as 251.
 *
 * ÂNCORA: Integração Por Cliente, que é tabela de CLIENTE (código, razão social, operação) e não de
 * pessoa, então a imagem do cabeçalho inteiro sai sem recorte.
 */
export const artigo: Artigo = {
  slug: "ordenar-a-lista-pelo-cabecalho",
  titulo: "Ordenar A Lista Pelo Cabeçalho",
  modulo: "COMECAR_AQUI",
  rotas: [
    "/admin/integracao-clientes",
    "/gerenciador",
    "/esteira",
    "/assinaturas",
    "/admin/dicas-documento",
    "/as/vagas",
    "/as/candidatos",
  ],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como colocar a lista na ordem que você precisa clicando no título da coluna, e como inverter a ordem no segundo clique.",
  termos: [
    "ordenar",
    "ordem",
    "classificar",
    "alfabetica",
    "a a z",
    "z a a",
    "crescente",
    "decrescente",
    "maior para o menor",
    "por data",
    "mais antigo",
    "mais recente",
    "por nome",
    "seta na coluna",
  ],
  preRequisitos: [
    "Estar em qualquer tela com tabela. Toda tabela do sistema ordena por clique.",
    "Nada mais. Ordenar não altera dado nenhum.",
  ],
  passos: [
    {
      gesto: "Olhe o par de setas apagado ao lado do título de cada coluna.",
      detalhe:
        "Esse par de setas é o convite ao clique: onde ele aparece, a coluna ordena. Coluna sem setas não ordena, e normalmente é a de ações.",
      controles: ["Código", "Razão Social", "Operação", "Exige Integração"],
      print: {
        arquivo: "01-cabecalho-ordenavel.png",
        legenda: "Passo 1: o cabeçalho da tabela, com o par de setas em cada coluna que ordena.",
      },
    },
    {
      gesto: "Clique no título da coluna para ordenar por ela.",
      detalhe:
        "O primeiro clique ordena do menor para o maior: A a Z no texto, do menor para o maior no número, do mais antigo para o mais recente na data. O título fica destacado e só a seta da direção atual acende.",
      controles: ["Razão Social"],
      print: {
        arquivo: "02-ordem-crescente.png",
        legenda: "Passo 2: a coluna ativa destacada, com a seta da direção apontando para cima.",
      },
    },
    {
      gesto: "Clique no mesmo título de novo para inverter.",
      detalhe:
        "O segundo clique vira a ordem para o maior primeiro, o Z antes do A, a data mais recente no topo. Passar o mouse sobre o título diz em palavras qual é a ordem atual.",
      controles: ["Razão Social"],
      print: {
        arquivo: "03-ordem-invertida.png",
        legenda: "Passo 3: a mesma coluna, agora com a ordem invertida.",
      },
    },
    {
      gesto: "Clique em outra coluna quando quiser trocar o critério.",
      detalhe:
        "A ordenação é de uma coluna por vez: escolher outra solta a anterior. Não existe ordenar por duas colunas ao mesmo tempo. No Gerenciador são Candidato, Cliente, Cargo, Projeto e Data adm.; na Central De Vagas, Vaga e Cliente. Em todas o gesto é o mesmo.",
      /*
       * OS CABEÇALHOS DAS OUTRAS TELAS ENTRAM AQUI, e não no passo 1, porque o passo 1 é a ÂNCORA
       * (a tela que virou imagem) e misturar coluna de outra tela na legenda dela descreveria uma
       * imagem que não existe. Este passo é justamente o de trocar de coluna, então é onde citar
       * coluna de tela diferente diz a verdade.
       *
       * A CAIXA É A DO COMPONENTE, não a da tela: o cabeçalho é escrito "Candidato" e "Data adm." no
       * código, e a tabela o desenha em maiúscula por estilo. Copiar o estilo daria a entender que a
       * palavra muda de tela para tela, e ela não muda, e o casamento do detector ignora caixa.
       */
      controles: ["Candidato", "Cliente", "Cargo", "Data adm.", "Projeto", "Vaga"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Cliquei e a lista não mudou de ordem.",
      acao: "Confira se a coluna tem o par de setas. Colunas de ação e de ícone não ordenam.",
    },
    {
      sintoma: "Ordenei e voltei para a primeira página da lista.",
      acao: "É o comportamento certo. A ordem é nova, então continuar na página sete da ordem antiga não diria nada.",
    },
    {
      sintoma: "A ordem parece errada em uma coluna de data.",
      acao: "Linha sem data preenchida vai para o fim da lista, nas duas direções. Ela não tem por onde ser comparada.",
    },
    {
      sintoma: "Ordenei, mas só as linhas desta página mudaram de lugar.",
      acao: "Nas telas paginadas a ordem é aplicada no conjunto todo antes de montar a página, então isso não acontece. Se acontecer, recarregue a tela.",
    },
  ],
  regras: [
    "Toda tabela do sistema ordena por clique no título da coluna.",
    "Uma coluna por vez: escolher outra solta a anterior.",
    "O primeiro clique ordena do menor para o maior, o segundo inverte.",
    "Ordenar não muda nada do que está guardado, e ninguém mais vê a sua ordem.",
    "Trocar a ordem volta para a primeira página da lista.",
  ],
  relacionados: ["ler-a-linha-da-tabela", "filtrar-uma-lista", "virar-a-pagina-da-lista"],
  fontes: [
    "apps/frontend/src/components/ui/ColunaOrdenavel.tsx",
    "apps/frontend/src/lib/ordenacao.ts",
    "apps/frontend/src/app/(app)/admin/integracao-clientes/page.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
