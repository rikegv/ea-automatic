import type { Artigo } from "../../tipos";

/**
 * DESATIVAR E REATIVAR: bloquear a entrada de alguém sem apagar o que a pessoa fez.
 *
 * ┌─ POR QUE O SISTEMA NÃO TEM "EXCLUIR USUÁRIO", E ISSO É DESENHO ──────────────────────────────┐
 * │ A conta aparece na trilha de tudo o que a pessoa fez: quem liberou, quem auditou, quem aceitou. │
 * │ Apagar a conta apagaria a autoria, então o gesto disponível é DESATIVAR, que tranca a entrada e │
 * │ preserva o histórico inteiro. É reversível, e é essa reversibilidade que o artigo ensina.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS DUAS AUTOPROTEÇÕES foram conferidas no código, não na tela: ninguém se desativa
 * (`users.service.ts`, a recusa quando o alvo é o próprio solicitante) e ninguém muda o próprio
 * papel (a recusa seguinte, no mesmo método). A tela ainda desabilita o botão na sua própria linha,
 * mas quem garante é o servidor. Os dois sintomas vivem no bloco da família e não são repetidos.
 *
 * PAPEL: a rota é `@Patch(":id")` dentro da classe `@Roles("SUPER_ADMIN")` de
 * `apps/backend/src/users/users.controller.ts`.
 */
export const artigo: Artigo = {
  slug: "desativar-e-reativar-um-usuario",
  titulo: "Desativar E Reativar Um Usuário",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/usuarios"],
  menus: ["usuarios"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "acesso-e-usuarios",
  resumo:
    "Como bloquear a entrada de quem saiu, sem apagar o histórico do que a pessoa fez, e como devolver o acesso quando ela volta.",
  termos: [
    "desativar usuario",
    "bloquear acesso",
    "pessoa saiu da empresa",
    "tirar acesso",
    "excluir usuario",
    "apagar usuario",
    "reativar usuario",
    "devolver acesso",
    "usuario inativo",
    "desligamento",
  ],
  preRequisitos: [
    "Saber se é bloqueio definitivo ou temporário: o gesto é o mesmo e é reversível nos dois casos.",
  ],
  passos: [
    {
      gesto: "Abra Usuários, na Administração.",
      controles: ["Usuários"],
    },
    {
      gesto: "Ache a pessoa na lista e olhe a coluna Status.",
      detalhe:
        "Ativo é quem entra no sistema; Inativo é quem está bloqueado. Clicar no cabeçalho da coluna junta os inativos de um lado.",
      controles: ["Status", "Ativo", "Inativo"],
    },
    {
      gesto: "Clique em Desativar usuário, o último botão da coluna de ações.",
      controles: ["Desativar usuário"],
    },
    {
      gesto: "Leia a confirmação e clique em Desativar.",
      detalhe:
        "A janela diz o que acontece: o login fica bloqueado e o histórico é preservado. Não é exclusão.",
      controles: ["Desativar"],
    },
    {
      gesto: "Para devolver o acesso, clique em Reativar usuário na linha da pessoa e confirme.",
      detalhe:
        "A pessoa volta com o papel, a área e os menus que tinha: a desativação não apaga nada disso.",
      controles: ["Reativar usuário", "Reativar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você procura como excluir o usuário e não encontra.",
      acao: "Não existe exclusão: a conta aparece na trilha de tudo o que a pessoa fez, e apagá-la apagaria a autoria. Desative, que bloqueia a entrada e mantém o histórico.",
    },
    {
      sintoma: "A pessoa desativada continua aparecendo na lista.",
      acao: "É o esperado, com o status Inativo. É por essa linha que você reativa quando ela voltar.",
    },
    {
      sintoma: "A pessoa voltou e não enxerga os menus que tinha.",
      acao: "A desativação não apaga a marcação de menu. Confira a área e os menus dela na janela de configuração, porque o catálogo pode ter mudado no meio-tempo.",
    },
    {
      sintoma: "O botão de desativar está apagado na linha.",
      acao: "É a sua própria linha. Ninguém se desativa, e a proteção existe para o sistema não ficar sem administrador.",
    },
  ],
  regras: [
    "Desativar bloqueia a entrada e preserva o histórico: não é exclusão, e o sistema não tem exclusão de usuário.",
    "O gesto é reversível: reativar devolve o acesso com o papel, a área e os menus que a pessoa tinha.",
    "Ninguém desativa a si mesmo.",
    "Ninguém altera o próprio papel: a mudança é sempre feita por outro Super Admin.",
  ],
  relacionados: [
    "cadastrar-um-usuario",
    "resetar-a-senha-de-um-usuario",
    "liberar-os-menus-de-um-usuario",
    "entrar-no-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/usuarios/page.tsx",
    "apps/backend/src/users/users.controller.ts",
    "apps/backend/src/users/users.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
