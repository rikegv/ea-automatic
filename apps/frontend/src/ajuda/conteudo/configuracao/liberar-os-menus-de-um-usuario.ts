import type { Artigo } from "../../tipos";

/**
 * LIBERAR MENU: a peça mais sensível do módulo, porque é a que CONCEDE acesso.
 *
 * ┌─ AS DUAS COISAS QUE ESTE ARTIGO EXISTE PARA ENSINAR ─────────────────────────────────────────┐
 * │ 1. RECARREGUE ANTES DE SALVAR. A janela grava a marcação sobre o catálogo que a PÁGINA         │
 * │    carregou. Hoje o servidor preserva o menu que nasceu depois de a página abrir, e pode até    │
 * │    recusar o salvamento de uma aba velha pedindo recarga, mas quem trabalha com a aba aberta    │
 * │    desde a véspera marca sobre uma lista que não é mais a de hoje. Recarregar é o gesto que     │
 * │    torna a régua irrelevante, e é por isso que ele é um PASSO e não uma nota de rodapé.         │
 * │ 2. MENU NOVO NASCE SÓ PARA O SUPER ADMIN, e liberar é decisão da diretoria, pessoa a pessoa.    │
 * │    Menu que não aparece para os demais NÃO é defeito, e dizer isso aqui evita o chamado.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARTIGO NÃO FAZ, E É REGRA E NÃO ESTILO: ele NÃO ensina nenhum contorno de trava de
 * papel. Caixa desabilitada é explicada (o que significa o rótulo ao lado dela) e o artigo para ali:
 * o caminho é pedir à diretoria, nunca driblar a marcação.
 *
 * O LADO DE QUEM NÃO TEM o menu é outro artigo, `por-que-eu-nao-vejo-um-menu`, e os dois se citam.
 * Este é o lado de quem CONCEDE.
 *
 * PAPEL, conferido no backend: `@Roles("SUPER_ADMIN")` na classe de
 * `apps/backend/src/users/users.controller.ts`, que cobre inclusive a gravação da marcação. A
 * afirmação mora no bloco da família, e não é repetida aqui.
 */
export const artigo: Artigo = {
  slug: "liberar-os-menus-de-um-usuario",
  titulo: "Liberar Os Menus De Um Usuário",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/usuarios"],
  menus: ["usuarios"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "acesso-e-usuarios",
  resumo:
    "Como conceder e tirar menus de uma pessoa, por que recarregar a página antes de salvar, e por que um menu novo aparece só para a diretoria até ela liberar quem usa.",
  termos: [
    "liberar acesso",
    "liberar menu",
    "dar permissao",
    "permissao de menu",
    "fulano nao ve o menu",
    "sumiu o menu dele",
    "ele nao tem acesso a tela",
    "conceder tela",
    "marcar menu",
    "area de atuacao",
    "tirar acesso",
    "menu novo nao aparece",
  ],
  preRequisitos: [
    "Ter a decisão da diretoria sobre quais menus aquela pessoa vai usar: a concessão é dela, nunca da equipe.",
  ],
  passos: [
    {
      gesto: "Abra Usuários, na Administração.",
      controles: ["Usuários"],
    },
    {
      gesto: "Recarregue a página antes de continuar.",
      detalhe:
        "A janela de menus trabalha com a lista que a página carregou. Recarregando, você marca sobre o catálogo de hoje, e não sobre o de quando a aba foi aberta.",
    },
    {
      gesto: "Ache a pessoa na lista e clique em Configurar menus de acesso, na coluna de ações.",
      detalhe: "É o botão do meio, entre o de editar e o de resetar a senha.",
      controles: ["Configurar menus de acesso"],
    },
    {
      gesto: "Confira a Área De Atuação, no topo da janela.",
      detalhe:
        "A área governa a lista abaixo: menu de outra área aparece apagado, com o aviso de que é de outra área, e não fica acessível nem marcado. Marque a área antes de marcar o menu.",
      controles: ["Área De Atuação"],
    },
    {
      gesto: "Marque os menus, grupo por grupo.",
      detalhe:
        "Os menus vêm separados em Operação, Atração e Seleção e Administração, na mesma ordem da barra lateral. O rodapé mostra quantos estão marcados.",
      controles: ["Operação", "Atração e Seleção", "Administração"],
    },
    {
      gesto: "Leia o rótulo ao lado de qualquer caixa apagada antes de insistir nela.",
      detalhe:
        "Somente super admin e somente administração são travas de papel: aquele menu não pode ser concedido a esse papel, e marcar ali não daria acesso nenhum. Se a pessoa precisa daquela tela, o caminho é a diretoria decidir o papel dela, nunca contornar a marcação.",
    },
    {
      gesto: "Clique em Salvar menus.",
      detalhe:
        "A barra lateral da pessoa passa a mostrar só o que ficou marcado, e as telas não liberadas continuam barradas mesmo com o endereço na mão.",
      controles: ["Salvar menus"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A caixa de um menu está apagada e não deixa marcar.",
      acao: "Leia o rótulo ao lado. Outra área se resolve marcando a área lá em cima. Somente super admin e somente administração são travas de papel: aquele menu não é concedível a esse papel, e a decisão é da diretoria.",
    },
    {
      sintoma: "Você marcou o menu e a pessoa continua sem enxergar a tela.",
      acao: "Confira a Área De Atuação dela: menu fora da área não fica acessível nem marcado. Peça também para ela sair e entrar de novo, porque a barra lateral é montada no acesso.",
    },
    {
      sintoma: "Um menu que existe no sistema não aparece na lista da janela.",
      acao: "A página está com um catálogo antigo. Feche a janela, recarregue a página de usuários e abra de novo.",
    },
    {
      sintoma: "A pessoa é Master e você não sabe se precisa marcar.",
      acao: "O Master já enxerga os menus da área dele sem marcação. A exceção são os menus de configuração de catálogo, que exigem a marcação nominal aqui, inclusive para ele: é assim que cada catálogo é concedido pessoa a pessoa.",
    },
  ],
  regras: [
    "Menu novo nasce visível só para o Super Admin. Ele não aparecer para os demais não é defeito: é a diretoria ainda não ter liberado.",
    "A liberação é individual: cada pessoa tem o seu conjunto de menus.",
    "A área é o teto e vem antes da marcação: menu de outra área não fica acessível nem marcado.",
    "O Super Admin enxerga todos os menus, de todas as áreas, independentemente do que estiver marcado aqui.",
    "A janela grava sobre o catálogo que a página carregou. Recarregar antes de salvar é o que garante que você está marcando a lista de hoje.",
    "Menu restrito por papel não é liberável por esta tela, e marcar a caixa não concederia o acesso.",
  ],
  relacionados: [
    "por-que-eu-nao-vejo-um-menu",
    "cadastrar-um-usuario",
    "definir-a-area-de-um-menu",
    "desativar-e-reativar-um-usuario",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/usuarios/page.tsx",
    "apps/frontend/src/components/admin/ConfigMenusModal.tsx",
    "apps/backend/src/users/users.controller.ts",
    "apps/backend/src/auth/menus.service.ts",
    "apps/backend/src/domain/menus.ts",
  ],
  revisadoEm: "2026-09-30",
};
