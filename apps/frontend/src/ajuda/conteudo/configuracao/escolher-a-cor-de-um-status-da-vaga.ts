import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: trocar a cor da etiqueta de um status da vaga e saber onde essa cor
 * aparece depois. A cor sai de uma paleta fechada, e é escolhida na própria linha da tabela.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . MOVER A VAGA de um status para outro, que é operação do dia a dia e já tem peça de outra
 *     frente. Escolher a cor de um status não muda nenhuma vaga de lugar.
 *   . CRIAR, RENOMEAR E EXCLUIR status, que estão em `manter-os-status-da-vaga`.
 */
export const artigo: Artigo = {
  slug: "escolher-a-cor-de-um-status-da-vaga",
  titulo: "Escolher A Cor De Um Status Da Vaga",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/status-vaga"],
  menus: ["as-status-vaga"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "Como trocar a cor da etiqueta de um status da vaga, quais cores existem e onde essa cor aparece depois na Central De Vagas.",
  termos: [
    "cor do status",
    "mudar a cor do status",
    "trocar cor da vaga",
    "etiqueta colorida",
    "status vermelho",
    "status verde",
    "cor da pill",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Status Da Vaga pelo Menu Gerencial e ache a linha pela coluna Status.",
      detalhe:
        "A etiqueta desenhada na coluna Status já aparece na cor de hoje, que é a mesma que a Central De Vagas mostra.",
      controles: ["Status", "Cor"],
    },
    {
      gesto: "Abra o seletor da coluna Cor naquela linha e escolha o tom.",
      detalhe:
        "A paleta é fechada e cada tom tem um ponto da cor ao lado do nome. A troca é salva no ato, sem botão de confirmar.",
      controles: ["Cor", "Neutro", "Azul", "Amarelo", "Vermelho", "Laranja", "Verde"],
    },
    {
      gesto: "Confira a etiqueta na coluna Status antes de sair da tela.",
      detalhe: "É ali que a cor nova se confere: a etiqueta é desenhada igual à que a operação vai ver.",
      controles: ["Status"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Troquei a cor e a Central De Vagas continua mostrando a cor antiga.",
      acao: "Recarregue a tela da Central De Vagas. A lista de status é lida na abertura da tela, então uma tela que já estava aberta continua desenhando a cor que leu antes.",
    },
    {
      sintoma: "Não encontro a cor que eu queria no seletor.",
      acao: "A paleta é fechada e não há campo de cor livre. Cada tom oferecido tem par para o tema claro e para o escuro, o que uma cor digitada à mão não teria.",
    },
  ],
  regras: [
    "A cor vale para a etiqueta daquele status onde quer que ela apareça na Central De Vagas: na coluna de status, nos cards e nos seletores.",
    "A cor é escolhida de uma paleta fechada. Não existe campo para digitar uma cor.",
    "Trocar a cor não muda nada do que o status faz nem move nenhuma vaga: é só a aparência da etiqueta.",
    "A cor pode ser trocada em qualquer linha, inclusive nas que têm papel de sistema.",
  ],
  relacionados: [
    "manter-os-status-da-vaga",
    "ler-a-central-de-vagas",
    "mover-o-status-da-vaga",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/status-vaga/page.tsx",
    "apps/backend/src/as/vaga-status/vaga-status.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
