/**
 * ROTEIRO DE CAPTURA: "Abrir O Prontuário No Google Drive".
 *
 * ┌─ O LOCALIZADOR AQUI **NÃO PODE** SER PAPEL MAIS NOME, E O MOTIVO É PRIVACIDADE ──────────────┐
 * │ O rótulo acessível do controle é "Abrir prontuário de <NOME DA PESSOA> no Google Drive": casar   │
 * │ por ele poria nome de gente dentro deste arquivo, que é versionado. O aviso do controle (o texto  │
 * │ que aparece ao passar o mouse) é fixo e sem nome, então é ele que serve de seletor.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE A FILA PRECISA TER, E É O QUE O ARNÊS ENTREGA ────────────────────────────────────────┐
 * │ O logo só existe na linha cuja PASTA JÁ NASCEU, o que acontece quando a régua de obrigatórios    │
 * │ fecha. Sem uma linha sintética nesse estado, o alvo não resolve e o motor falha, que é o          │
 * │ comportamento certo: alvo que não resolve é o detector de artigo velho, não um print sem seta.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A BUSCA POR `999000` ENTRA NO PREPARO porque a imagem é da FILA, com linha de pessoa: os candidatos
 * do arnês têm CPF da família 999 e a busca casa CPF por pedaço, então a fila fica sintética. O gate
 * continua sendo a garantia; a busca só é o que torna a captura possível sem recorte.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "abrir-o-prontuario-no-drive",
  url: "/esteira",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "clicar", alvo: { papel: "button", nome: "AUDITORIA", texto: "" } },
    {
      acao: "digitar",
      alvo: { seletor: 'input[aria-label="Buscar por nome, CPF ou cliente"]', texto: "" },
      valor: "999000",
    },
  ],
  capturas: [
    {
      arquivo: "01-logo-do-drive-na-linha.png",
      legenda: "Passo 1: o logo do Drive na coluna de ações da linha.",
      alvos: [
        {
          seletor: 'a[title="Abrir prontuário no Google Drive"]',
          texto: "1. Abra o prontuário",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
