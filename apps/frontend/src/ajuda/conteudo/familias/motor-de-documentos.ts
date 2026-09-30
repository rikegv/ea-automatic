import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o que configura o motor de documentos.
 *
 * Reúne as regras do kit, as regras de auditoria e as pastas do Drive. As três telas são fáceis de
 * confundir, e a família existe para dizer a divisão UMA vez:
 *
 *   a RÉGUA diz QUAIS documentos são exigidos;
 *   a REGRA DE AUDITORIA diz SE cada documento está válido;
 *   o KIT diz o que vai para assinatura;
 *   a PASTA DO DRIVE diz ONDE o arquivado vai parar.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "motor-de-documentos",
  rotulo: "Motor De Documentos",
  preRequisitos: [
    "Ter o menu daquela tela liberado para o seu usuário, e ser Master ou Super Admin.",
    "Entender a divisão entre régua, regra de auditoria e kit: elas se parecem e fazem coisas diferentes.",
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema diz que já existe um kit com esse nome.",
      acao: "Cada tipo de vínculo tem um kit só. Procure o kit existente e renomeie, em vez de criar outro.",
    },
    {
      sintoma:
        "O sistema diz que já existe esse título no kit.",
      acao: "O dicionário do kit não aceita título repetido. Confira a lista antes de acrescentar.",
    },
    {
      sintoma:
        "O sistema recusa a reordenação dos documentos do kit.",
      acao: "A sua aba está desatualizada. Recarregue a página e arraste de novo.",
    },
    {
      sintoma:
        "Você colou o link do Drive e o sistema não reconheceu.",
      acao: "Cole o endereço da PASTA, o que contém a palavra folders, ou só o identificador dela. Link de arquivo não serve.",
    },
    {
      sintoma:
        "Você validou a pasta e o sistema disse que não conseguiu.",
      acao: "A conta de serviço não enxerga aquela pasta, e nada foi salvo. Compartilhe a pasta com a conta de serviço no Drive e valide de novo.",
    },
    {
      sintoma:
        "O sistema diz que a regra não foi encontrada.",
      acao: "A regra foi excluída enquanto a sua tela estava aberta. Recarregue a página.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
