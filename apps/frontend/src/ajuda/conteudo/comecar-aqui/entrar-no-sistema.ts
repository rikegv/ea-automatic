import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 12 de 14: ENTRAR.
 *
 * ┌─ O ÚNICO DOS QUATORZE SEM IMAGEM, E A CAUSA ESTÁ MEDIDA NO MOTOR ────────────────────────────┐
 * │ O motor de captura entra no sistema ANTES de abrir qualquer roteiro, e a tela de entrada rebate   │
 * │ quem já tem sessão para o painel inicial. Um roteiro apontado para ela fotografaria o painel        │
 * │ inicial e falharia ao não achar o campo de e-mail, acusando artigo velho onde o artigo está certo.  │
 * │ A tela de troca de senha é pior ainda: ela só existe para quem está com senha temporária.          │
 * │                                                                                                    │
 * │ ENTÃO O ARTIGO NASCE SEM PRINT, DE PROPÓSITO, e a falta está reportada como pedido de um modo de    │
 * │ captura sem sessão. Reservar imagem que nenhum roteiro produz deixaria um buraco tracejado          │
 * │ permanente na primeira página que o operador novo abre, que é o pior lugar possível para um.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "entrar-no-sistema",
  titulo: "Entrar No Sistema",
  modulo: "COMECAR_AQUI",
  rotas: ["/login", "/trocar-senha"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como entrar com o e-mail e a senha corporativos, o que fazer no primeiro acesso, quando a senha é temporária, e o que fazer quando o acesso é negado.",
  termos: [
    "entrar",
    "login",
    "logar",
    "acessar",
    "senha",
    "primeiro acesso",
    "senha temporaria",
    "trocar senha",
    "mudar senha",
    "esqueci a senha",
    "acesso negado",
    "nao consigo entrar",
    "usuario",
    "email",
  ],
  preRequisitos: [
    "Ter um usuário criado pela administração, com o seu e-mail corporativo.",
    "Estar na rede do grupo ou conectado pelo acesso remoto: o sistema não é aberto na internet.",
  ],
  passos: [
    {
      gesto: "Abra o endereço do sistema no navegador.",
      detalhe: "A tela de entrada aparece sozinha quando você ainda não está conectado.",
    },
    {
      gesto: "Digite o seu e-mail corporativo no campo E-mail.",
      detalhe: "É o mesmo e-mail que você usa no trabalho, escrito por inteiro.",
      controles: ["E-mail"],
    },
    {
      gesto: "Digite a senha no campo Senha.",
      detalhe:
        "O olho ao lado do campo mostra e esconde o que você digitou, para conferir antes de enviar.",
      controles: ["Senha", "Mostrar ou ocultar senha"],
    },
    {
      gesto: "Clique em Entrar.",
      detalhe:
        "O botão fica escrito Entrando enquanto o acesso é conferido. Dando certo, você cai no painel inicial.",
      controles: ["Entrar"],
    },
    {
      gesto: "No primeiro acesso, defina a sua senha.",
      detalhe:
        "Usuário novo entra com senha temporária, e o sistema leva você direto para a troca. Informe a senha temporária, escolha a nova com pelo menos oito caracteres, repita e salve. Enquanto não trocar, nenhuma outra tela abre.",
      controles: [
        "Senha temporária",
        "Nova senha",
        "Confirmar nova senha",
        "Salvar nova senha",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Aparece Acesso Negado, com E-mail ou senha incorretos.",
      acao: "Confira o e-mail por inteiro e use o olho do campo para ver a senha. Persistindo, peça à administração para redefinir a sua senha.",
    },
    {
      sintoma: "Entrei e caí numa tela pedindo para trocar a senha.",
      acao: "É o esperado: a sua senha é temporária. Defina a nova e você segue para o painel.",
    },
    {
      sintoma: "A troca de senha recusa a nova senha.",
      acao: "A nova senha precisa de pelo menos oito caracteres, e os dois campos da nova precisam ser idênticos.",
    },
    {
      sintoma: "A tela não abre de jeito nenhum.",
      acao: "Você provavelmente está fora da rede do grupo. Conecte o acesso remoto e tente outra vez.",
    },
    {
      sintoma: "Esqueci a senha.",
      acao: "Não há recuperação por e-mail. Peça à administração para redefinir: você recebe uma senha temporária e troca no primeiro acesso.",
    },
    {
      sintoma: "Entrei, mas não vejo nenhum menu.",
      acao: "O seu usuário existe e ainda não tem menu liberado. Isso é decisão da diretoria, e quem libera é ela.",
    },
  ],
  regras: [
    "O acesso é com o e-mail corporativo, e cada pessoa tem o seu usuário.",
    "Usuário novo e senha redefinida entram com senha temporária, e a troca é obrigatória antes de qualquer tela.",
    "A nova senha tem no mínimo oito caracteres.",
    "Não há recuperação de senha por e-mail: a redefinição é pedida à administração.",
    "O sistema não é aberto na internet: ele só abre pela rede do grupo ou pelo acesso remoto.",
  ],
  relacionados: ["tema-perfil-e-sair", "por-que-eu-nao-vejo-um-menu"],
  fontes: [
    "apps/frontend/src/app/login/page.tsx",
    "apps/frontend/src/app/trocar-senha/page.tsx",
    "apps/frontend/src/app/(app)/layout.tsx",
  ],
  revisadoEm: "2026-09-28",
};
