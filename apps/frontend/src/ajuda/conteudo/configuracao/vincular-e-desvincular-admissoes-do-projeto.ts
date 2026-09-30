import type { Artigo } from "../../tipos";

/**
 * VÍNCULOS: quem conta no projeto, e a trava que impede a mesma pessoa de contar duas vezes.
 *
 * ┌─ A TRAVA É O ASSUNTO DESTA PEÇA, E ELA FOI CONFERIDA NO CÓDIGO ──────────────────────────────┐
 * │ Uma admissão fica em UM projeto só. O serviço recusa vincular quem já está em outro e devolve a  │
 * │ frase que diz o caminho (trocar, ou desvincular de lá antes), e a lista de Admissões Sem Projeto │
 * │ nem oferece essas pessoas. É essa trava que sustenta a contagem do projeto: sem ela, a mesma     │
 * │ pessoa apareceria na meta de dois projetos e os dois estariam errados sem ninguém perceber.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA PEÇA NÃO REEXPLICA: marcar várias linhas, que tem artigo próprio
 * (`agir-em-varias-linhas-de-uma-vez`). Aqui só se diz o que cada ação em lote faz.
 *
 * §A.6: as duas tabelas mostram o nome do candidato, e o texto fala sempre em COLUNA e em BUSCA,
 * nunca em uma pessoa vista na tela.
 *
 * FAMÍLIA: sem família até a família do cadastro de Alto Volume existir.
 *
 * PAPEL, conferido no backend: as ações em lote e a leitura das duas listas são governadas pelo menu
 * `alto-volume` (`domain/menus.ts`). Vincular e desvincular UMA admissão ficam fora dessa exigência
 * de propósito, porque são também o botão da ficha da admissão, que o consultor usa sem ter este
 * menu. Na prática, para trabalhar POR ESTA TELA é preciso o menu, porque as duas listas dependem
 * dele.
 */
export const artigo: Artigo = {
  slug: "vincular-e-desvincular-admissoes-do-projeto",
  titulo: "Vincular E Desvincular Admissões Do Projeto",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/alto-volume"],
  menus: ["alto-volume"],
  familia: "alto-volume-cadastro",
  publico: "GESTAO",
  nivel: "N1",
  resumo:
    "Como colocar admissões dentro do projeto e tirá-las de lá, uma a uma ou em lote, e por que o sistema recusa quem já está em outro projeto.",
  termos: [
    "vincular admissao",
    "desvincular",
    "tirar do projeto",
    "colocar no projeto",
    "admissao sem projeto",
    "alocar em alto volume",
    "trocar de projeto",
    "contar duas vezes",
    "ja esta em outro projeto",
    "quem esta no projeto",
  ],
  preRequisitos: [
    "Ter o menu Alto Volume liberado para o seu usuário.",
    "O projeto precisa estar ativo: em projeto inativo os vínculos ficam só de leitura.",
  ],
  passos: [
    {
      gesto: "Abra Alto Volume e clique em grupos e vagas na linha do projeto.",
      controles: ["grupos e vagas"],
    },
    {
      gesto: "Desça até Vínculos Do Projeto.",
      detalhe:
        "A seção tem duas listas: Admissões No Projeto, que é quem já conta, e Admissões Sem Projeto, que é quem poderia contar e ainda não conta.",
      controles: ["Vínculos Do Projeto", "Admissões No Projeto", "Admissões Sem Projeto"],
    },
    {
      gesto: "Na lista de baixo, ache a pessoa e clique em adicionar adm ao projeto.",
      detalhe:
        "A lista traz as admissões do cliente do projeto cuja data de admissão cai dentro do período, e que não estão em projeto nenhum. Use a busca por nome e o filtro por cliente para estreitar.",
      controles: ["adicionar adm ao projeto", "Buscar candidato pelo nome", "Todos Os Clientes"],
    },
    {
      gesto: "Para entrar com várias de uma vez, marque as caixas e clique em Adicionar selecionadas ao projeto.",
      detalhe:
        "A confirmação diz quantas vão entrar. Quem já estiver em outro projeto não entra, e a tela avisa.",
      controles: ["Adicionar selecionadas ao projeto"],
    },
    {
      gesto: "Quando o projeto tiver levas, escolha a leva em Adicionar ao grupo antes de adicionar.",
      detalhe: "Sem escolher, a pessoa entra na cota do projeto inteiro.",
      controles: ["Adicionar ao grupo"],
    },
    {
      gesto: "Para tirar alguém, clique em desvincular na linha dela, na lista de cima, e confirme.",
      detalhe:
        "A admissão continua exatamente como está na esteira: ela só deixa de contar neste projeto e volta para a lista de Admissões Sem Projeto.",
      controles: ["desvincular", "Desvincular"],
    },
    {
      gesto: "Para tirar várias, marque as caixas e use Desvincular.",
      detalhe: "A confirmação diz quantas saem e para onde elas voltam.",
      controles: ["Desvincular As Selecionadas", "limpar seleção"],
    },
    {
      gesto: "Para mudar alguém de projeto ou de leva, clique em trocar na linha dela.",
      detalhe:
        "É o caminho de quem já está em outro projeto: em vez de vincular por cima, você troca, e a pessoa continua contando em um lugar só. Em lote, o botão é Trocar de projeto.",
      controles: ["trocar", "Trocar Projeto Do Vínculo", "Trocar de projeto"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que esta admissão já está em outro projeto.",
      acao: "Uma admissão fica em um projeto só, e é isso que impede a mesma pessoa de contar duas vezes. Abra o projeto em que ela está e use trocar, ou desvincule de lá antes de adicionar aqui.",
    },
    {
      sintoma: "A pessoa não aparece na lista de Admissões Sem Projeto.",
      acao: "A lista só traz quem é do cliente do projeto, tem data de admissão dentro do período e não está em projeto nenhum. Faltando a data, ou estando fora do período, o caminho é alocar pela ficha da admissão.",
    },
    {
      sintoma: "Você adicionou várias e entraram menos do que o esperado.",
      acao: "As que já estavam em outro projeto não entram, e a tela avisa quais foram. Trate cada uma pela troca, dentro do projeto em que ela está.",
    },
    {
      sintoma: "As ações sumiram e a linha mostra projeto inativo.",
      acao: "Projeto inativo deixa os vínculos só de leitura. Reative o projeto para corrigir quem entra e quem sai dele.",
    },
    {
      sintoma: "Você desvinculou alguém por engano.",
      acao: "Nada se perdeu: a admissão voltou para a lista de Admissões Sem Projeto, na mesma tela. Adicione de novo.",
    },
  ],
  regras: [
    "Uma admissão fica em um projeto só: é essa trava que protege a contagem do projeto.",
    "Quem já está em outro projeto não aparece na lista de sem projeto e é recusado ao adicionar. O caminho é trocar, ou desvincular de lá antes.",
    "Desvincular não muda nada na esteira: a admissão só deixa de contar neste projeto.",
    "A lista de sem projeto é do cliente do projeto e do período dele, e traz apenas quem não está em projeto nenhum.",
    "Projeto inativo deixa os vínculos só de leitura.",
  ],
  relacionados: [
    "cadastrar-um-projeto-de-alto-volume",
    "cadastrar-os-grupos-de-entrada-do-projeto",
    "cadastrar-as-vagas-por-cargo",
    "agir-em-varias-linhas-de-uma-vez",
    "ler-a-ficha-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/alto-volume/page.tsx",
    "apps/backend/src/admin/alto-volume/alto-volume.controller.ts",
    "apps/backend/src/admin/alto-volume/alto-volume-vinculos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
