import type { Artigo } from "../../tipos";

/**
 * RESETAR A SENHA: o gesto de quem esqueceu a senha ou precisa de uma nova.
 *
 * ┌─ NENHUMA SENHA APARECE NESTE ARQUIVO, NEM COMO EXEMPLO ──────────────────────────────────────┐
 * │ O artigo descreve o MECANISMO (o sistema gera, mostra uma vez, exige a troca no acesso          │
 * │ seguinte) e o CAMPO onde a senha aparece. Escrever um valor, ainda que inventado, ensinaria o   │
 * │ formato e viraria exemplo copiado.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA PEÇA NÃO COBRE: a troca da própria senha pelo usuário, que acontece no acesso e é
 * assunto de `entrar-no-sistema`. Aqui é a administração agindo sobre a conta de outra pessoa.
 *
 * PAPEL, conferido no backend: a rota do reset é `@Post(":id/reset-senha")` dentro da classe
 * `@Roles("SUPER_ADMIN")` de `apps/backend/src/users/users.controller.ts`.
 */
export const artigo: Artigo = {
  slug: "resetar-a-senha-de-um-usuario",
  titulo: "Resetar A Senha De Um Usuário",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/usuarios"],
  menus: ["usuarios"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "acesso-e-usuarios",
  resumo:
    "Como gerar uma senha temporária nova para quem perdeu a sua, e o que acontece com a senha antiga no momento em que a nova é gerada.",
  termos: [
    "resetar senha",
    "esqueci a senha",
    "trocar senha de alguem",
    "gerar senha nova",
    "senha temporaria",
    "pessoa nao consegue entrar",
    "desbloquear acesso",
    "nova senha",
  ],
  preRequisitos: [
    "Ter certeza de que é a pessoa certa pedindo: o reset invalida a senha atual dela na hora.",
  ],
  passos: [
    {
      gesto: "Abra Usuários, na Administração.",
      controles: ["Usuários"],
    },
    {
      gesto: "Ache a pessoa na lista e clique em Resetar Senha, na coluna de ações.",
      detalhe: "Use a busca do navegador ou ordene pela coluna Nome para achar mais rápido.",
      controles: ["Resetar Senha"],
    },
    {
      gesto: "Confirme em Gerar nova senha.",
      detalhe:
        "A partir daqui a senha anterior deixa de valer, mesmo que a pessoa a lembre depois.",
      controles: ["Gerar nova senha"],
    },
    {
      gesto: "Copie a senha que aparece no bloco e entregue à pessoa.",
      detalhe:
        "Ela é mostrada uma única vez e o sistema não a guarda em texto: fechando o bloco, não há como vê-la de novo, só gerar outra.",
      controles: ["Copiar"],
    },
    {
      gesto: "Avise que a troca é obrigatória no próximo acesso.",
      detalhe:
        "A senha entregue é temporária: ao entrar, a pessoa é levada direto para a tela de definir a senha dela.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você fechou o bloco antes de copiar a senha.",
      acao: "Não há como recuperar a que foi gerada. Repita o reset e copie a nova.",
    },
    {
      sintoma: "A pessoa diz que a senha não funciona.",
      acao: "Confira se ela não está tentando a senha antiga, que deixou de valer no reset, e se não sobrou espaço no começo ou no fim ao colar. Persistindo, gere outra.",
    },
    {
      sintoma: "A pessoa entrou e o sistema já pediu uma senha nova.",
      acao: "É o esperado. A senha entregue é temporária e a troca acontece no primeiro acesso.",
    },
    {
      sintoma: "A pessoa entra e é barrada mesmo com a senha certa.",
      acao: "Confira o status dela na coluna Status. Conta inativa não entra, e o caminho é reativar antes.",
    },
  ],
  regras: [
    "Resetar invalida a senha anterior no ato.",
    "A senha nova é temporária: o sistema obriga a troca no acesso seguinte.",
    "A senha aparece uma única vez, no momento do reset, e não é exibida outra vez.",
    "Resetar a senha não muda papel, área nem menus da pessoa.",
  ],
  relacionados: [
    "cadastrar-um-usuario",
    "desativar-e-reativar-um-usuario",
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
