import type { Artigo } from "../../tipos";

/**
 * QUEM EXIGE INTEGRAÇÃO, e o artigo carrega a advertência que a tela merece.
 *
 * O QUE ELA COBRE: o padrão (todo cliente exige), o desmarcar por linha, o desmarcar de vários pela
 * seleção, e o EFEITO real na esteira.
 *
 * O EFEITO FOI MEDIDO NO CÓDIGO, e não deduzido, porque esta é a tela cujo alcance já quebrou a
 * contagem de três telas ao mesmo tempo. O que foi lido, e o que sustenta cada regra abaixo:
 *   - `integracao-clientes.service.ts`: a tela lista SÓ clientes ativos; ausência de linha vale
 *     "exige"; desmarcar grava uma linha, marcar de volta apaga a linha.
 *   - `nascimento-cadastro.ts`: quando o gate do Cadastro abre, a porta única cria o Cadastro e,
 *     SÓ se o cliente exige, a frente de Integração. A frente de ponto nasce para todos, sem flag.
 *   - `esteira.service.ts`: ao concluir o Cadastro de um cliente que NÃO exige, o farol é carimbado
 *     como concluída na mesma transação. É a correção do defeito antigo, em que o carimbo morava só
 *     na transição da Integração e, sem a frente, nunca era alcançado.
 *   - duas guardas, escritas no texto porque a operação esbarra nelas: admissão SEM cliente não é
 *     carimbada, e quando o exame foi liberado sem o documento do exame o carimbo espera.
 *
 * O QUE ELA NÃO COBRE: operar a fila de integração (agendar, desconsiderar, ler o farol de cor), que
 * são artigos da trilha de admissão.
 */
export const artigo: Artigo = {
  slug: "definir-quem-exige-integracao",
  titulo: "Definir Quem Exige Integração",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/integracao-clientes"],
  menus: ["integracao-clientes"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "cadastros-do-cliente",
  resumo:
    "Como dizer quais clientes exigem integração e quais não exigem, e o que muda na esteira para quem não exige: a admissão fecha no cadastro e não passa pela fila de integração.",
  termos: [
    "exige integracao",
    "nao exige integracao",
    "tirar cliente da integracao",
    "cliente sem integracao",
    "integracao por cliente",
    "admissao nao aparece na integracao",
    "admissao fecha no cadastro",
  ],
  preRequisitos: [
    "Saber quais clientes de fato fazem integração: desmarcar tira as próximas admissões daquela fila.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Integração Por Cliente pelo Menu Gerencial.",
      detalhe:
        "O topo mostra quantos clientes ativos existem e quantos já estão sem integração.",
      controles: ["Integração Por Cliente"],
    },
    {
      gesto: "Procure o cliente pelo nome, pela operação ou pelo código.",
      controles: ["Buscar por nome, operação ou código"],
    },
    {
      gesto: "Para um cliente só, clique no interruptor da coluna de exigência, na própria linha.",
      detalhe: "A alteração vale na hora, e o aviso verde no topo confirma o que mudou.",
      controles: ["Código", "Razão Social", "Operação", "Exige Integração"],
    },
    {
      gesto:
        "Para vários de uma vez, marque a caixa de cada cliente e use os botões que aparecem no topo.",
      detalhe:
        "Um botão tira os selecionados da exigência, o outro devolve. O número entre parênteses é quantos estão selecionados.",
      controles: ["Não exigir", "Exigir", "Limpar seleção"],
    },
    {
      gesto: "Leia a confirmação e clique em Confirmar.",
      detalhe:
        "A confirmação diz quantos clientes são alcançados e o que acontece com as próximas admissões deles.",
      controles: ["Confirmar Alteração", "Confirmar", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Desmarquei o cliente e a admissão dele continua na fila de integração.",
      acao: "A mudança vale para as próximas admissões. As que já criaram a frente continuam nela, e saem pelo caminho normal daquela fila.",
    },
    {
      sintoma: "O cliente não aparece na lista.",
      acao: "Esta tela lista só clientes ativos, porque não há admissão nova para cliente encerrado. Reative o cliente na tela de Clientes e volte aqui.",
    },
    {
      sintoma: "Cliquei no interruptor da linha e a alteração entrou sem perguntar nada.",
      acao: "É assim de propósito: o interruptor da linha vale para um cliente só. A confirmação existe no caminho da seleção múltipla, que alcança vários de uma vez.",
    },
    {
      sintoma:
        "O cliente não exige integração, a admissão terminou o cadastro e não apareceu como concluída.",
      acao: "Confira duas coisas. Se o exame foi liberado sem o documento do exame, o carimbo de concluída espera esse documento chegar. E se a admissão está sem cliente preenchido, o sistema não carimba, porque não há regra de cliente a aplicar.",
    },
  ],
  regras: [
    "Todo cliente nasce exigindo integração: a equipe desmarca quem não exige.",
    "A tela lista somente os clientes ativos.",
    "Para o cliente que não exige, a frente de integração não nasce: a admissão fecha no cadastro e vai para o Gerenciador, sem passar pela fila de integração.",
    "Ao concluir o cadastro de um cliente que não exige, a admissão já é carimbada como concluída, sem depender de nenhuma etapa seguinte.",
    "A alteração vale para as próximas admissões; as que já estão na frente de integração não são afetadas.",
    "A frente de ponto nasce para todos os clientes, exijam integração ou não.",
    "Quando o exame foi liberado sem o documento do exame, o carimbo de concluída espera esse documento.",
    "Admissão sem cliente preenchido não recebe o carimbo de concluída, porque não há regra de cliente a aplicar.",
  ],
  relacionados: [
    "acompanhar-a-integracao",
    "desconsiderar-a-integracao",
    "ler-o-farol-de-cor-da-fila-de-integracao",
    "o-mapa-das-frentes-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "inativar-e-reativar-um-cliente",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/integracao-clientes/page.tsx",
    "apps/backend/src/admin/integracao-clientes/integracao-clientes.service.ts",
    "apps/backend/src/esteira/nascimento-cadastro.ts",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
