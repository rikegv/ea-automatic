import type { Artigo } from "../../tipos";

/**
 * ─ REABRIR A PENDÊNCIA: desfazer uma aprovação errada ───────────────────────────────────────────
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E O QUE O ARTIGO IRMÃO DEIXOU FORA ─────────────────────────────────┐
 * │ O N1 da aba ("auditar-os-documentos-da-admissao") lista "reabrir a pendência de um documento   │
 * │ que a I.A aprovou errado" entre os recursos que ele NÃO cobre. O botão não aparece lá, e nem o  │
 * │ efeito dele, que é o mais pesado desta janela: reabrir pode RECUAR a frente de Auditoria e      │
 * │ fechar o Cadastro de quem já tinha passado. É essa consequência que esta peça existe para       │
 * │ deixar clara ANTES do clique.                                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE, E A DISTINÇÃO É O CORAÇÃO DAS DUAS PEÇAS ─────────┐
 * │ ASSUMIR o documento como válido é o gesto OPOSTO e tem peça própria. Reabrir RECUSA um        │
 * │ documento que a máquina aceitou; assumir ACEITA um documento que a máquina recusou. As duas se │
 * │ apontam em Relacionados e nenhuma ensina o gesto da outra, porque quem confunde as duas desfaz │
 * │ exatamente o que queria fazer.                                                                  │
 * │                                                                                                 │
 * │ Também fica fora o que devolve TENTATIVA ao candidato no Portal (Solicitar reenvio e Zerar      │
 * │ tentativas): reabrir a pendência e devolver envio são coisas diferentes, e o código é explícito │
 * │ nisso. O artigo diz que são diferentes, e não ensina as outras duas.                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO ─────────────────────────────────────────┐
 * │ Captura vetada pela auditoria de segurança enquanto a homologação não tiver arnês sintético  │
 * │ (a tela mostra documento de pessoa). Texto escrito para funcionar sem imagem; prints em       │
 * │ entrega própria.                                                                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles`: o botão é só ícone (exclamação amarela, o mesmo símbolo de pendência do resto do
 * sistema), então o rótulo declarado é o nome acessível ("Reabrir a pendência do documento"). A
 * pergunta de confirmação abre com o NOME DO DOCUMENTO dentro dela, então o que se cita no texto são
 * as frases fixas do corpo, nunca a linha montada.
 */
export const artigo: Artigo = {
  slug: "reabrir-a-pendencia-de-um-documento",
  titulo: "Reabrir A Pendência De Um Documento",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "O que fazer quando a inteligência artificial aprovou um documento que não servia: devolver aquele documento para pendente, entendendo antes que isso pode recuar a frente de Auditoria e fechar o Cadastro.",
  termos: [
    "reabrir pendencia",
    "reabrir documento",
    "descartar documento",
    "apagar documento",
    "excluir documento",
    "tirar documento",
    "aprovou errado",
    "aprovado errado",
    "documento errado aprovado",
    "cobrar documento de novo",
    "voltar documento para pendente",
    "desfazer aprovacao",
    "pedir documento novamente",
  ],
  preRequisitos: [
    "Ter conferido o arquivo e ter certeza de que o documento aprovado não serve: a ação não pode ser desfeita.",
    "Saber que o candidato precisará enviar o documento de novo, então combine o reenvio antes de reabrir.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional pelo menu da lateral esquerda.",
      controles: ["Esteira Admissional"],
    },
    {
      gesto: "Na aba Auditoria, ache a pessoa e clique em Auditar, na coluna Avanço / Auditoria.",
      controles: ["AUDITORIA", "Avanço / Auditoria", "Auditar"],
    },
    {
      gesto: "Abra o arquivo pelo olho da linha e confirme que o documento aprovado não serve.",
      controles: ["Visualizar documento"],
    },
    {
      gesto: "Clique na exclamação amarela da linha, o Reabrir a pendência do documento.",
      detalhe:
        "O símbolo é o mesmo que o sistema usa para pendência em toda parte, e é de propósito: o documento não é apagado do processo, ele volta a ser cobrado.",
      controles: ["Reabrir a pendência do documento"],
    },
    {
      gesto: "Leia a pergunta de confirmação inteira antes de aceitar.",
      detalhe:
        "Ela avisa que o documento volta a ser cobrado como pendente, que o candidato precisará reenviar o arquivo, que o mesmo arquivo volta a ser aceito e que, sendo o último obrigatório aceito, a frente de Auditoria volta a ficar pendente e o Cadastro, se já estiver aberto, é fechado junto. Termina dizendo que a ação não pode ser desfeita.",
    },
    {
      gesto: "Confirme e leia os avisos que aparecem no alto da janela.",
      detalhe:
        "Quando a frente recua, a janela diz: A frente de Auditoria voltou a ficar pendente. Quando o Cadastro cai junto, ela diz: O Cadastro foi fechado e volta a aguardar a Auditoria. Os dois avisos convivem, porque são dois fatos diferentes.",
    },
    {
      gesto: "Confira a linha: o documento perdeu a etiqueta e o motivo, e voltou a ser cobrado.",
      detalhe:
        "A barra de progresso no alto desconta aquele documento na mesma hora. Qualquer marca de quem tinha assumido o documento à mão também sai.",
      controles: ["obrigatórios validados", "Faltam:", "Auditar documento"],
    },
    {
      gesto: "Peça o documento correto ao candidato e envie pela própria linha quando ele chegar.",
      detalhe:
        "Quando a pendência é do Portal e o candidato já esgotou os envios dele, reabrir aqui não devolve tentativa: isso é outro botão, no bloco de pendência do time da mesma linha.",
      controles: ["Auditar documento"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "Aparece: Falha de rede ao reabrir a pendência do documento. Verifique a conexão e tente de novo.",
      acao: "O pedido não chegou ao sistema e o documento ficou como estava. Clique de novo. Se repetir, confira a conexão e avise a TI.",
    },
    {
      sintoma:
        "A tela recusa dizendo: Este contrato já foi enviado para assinatura. Cancele o envelope na Gestão Das Assinaturas antes de reabrir a pendência do documento.",
      acao: "Existe contrato vivo amarrado a esse pacote de documentos, e mexer nele agora seria dano, não correção. Cancele o envelope na Gestão Das Assinaturas e então reabra a pendência.",
    },
    {
      sintoma:
        "A tela recusa dizendo: Este contrato já foi assinado. A pendência do documento não pode ser reaberta por aqui: trate a correção pelo reenvio por correção.",
      acao: "Contrato assinado não se corrige mexendo no documento: siga o caminho de reenvio por correção, que cancela o envelope errado, corrige e gera um novo.",
    },
    {
      sintoma:
        "A tela recusa dizendo: O kit deste candidato já foi gerado e está na fila de assinatura. Remova o kit da fila antes de reabrir a pendência do documento.",
      acao: "O kit já montado aponta para o pacote atual de documentos. Tire o kit da fila, reabra a pendência, resolva o documento e gere o kit de novo.",
    },
    {
      sintoma:
        "Aparece: Este documento já havia sido arquivado no Drive e NÃO foi removido de lá. O EA não exclui arquivos do Drive: remova manualmente, se for o caso.",
      acao: "O sistema não apaga arquivo do Drive, e avisa em vez de fingir que apagou. Abra a pasta do prontuário e remova o arquivo errado à mão. Acontece com o exame, que é o único documento que sobe ao Drive antes de a régua fechar.",
    },
    {
      sintoma: "Reabri e agora a nova análise diz que não há arquivo para reauditar.",
      acao: "É o esperado: reabrir apaga o arquivo que estava guardado daquele documento. Não há o que reanalisar até chegar arquivo novo, então envie o documento correto pela própria linha.",
    },
    {
      sintoma: "Reabri um documento de admissão já finalizada e a frente não mudou.",
      acao: "Também é o esperado. Admissão finalizada, declinada ou com rescisão não é recalculada nem volta para fila nenhuma: o documento muda, o histórico fica intacto.",
    },
  ],
  regras: [
    "Reabrir não apaga o documento do processo: devolve aquele documento a pendente, para ser cobrado de novo.",
    "A ação não pode ser desfeita, e é por isso que a tela pergunta antes.",
    "O arquivo que estava guardado daquele documento é removido, e com ele a marca que impedia o reenvio do mesmo arquivo: o candidato pode mandar exatamente o mesmo arquivo de novo e ele será analisado.",
    "Qualquer marca de documento assumido à mão também sai, senão a coleta automática continuaria pulando aquele documento para sempre.",
    "Sendo o último obrigatório aceito, a frente de Auditoria volta a ficar pendente e o Cadastro, se já estava aberto, fecha junto, porque o Cadastro só abre com Auditoria e Exame concluídas.",
    "Com contrato já enviado para assinatura, já assinado, ou com o kit na fila, a reabertura é recusada: primeiro se resolve a assinatura.",
    "Admissão finalizada, declinada ou com rescisão não recua: o documento é alterado e a esteira daquela pessoa fica como está.",
    "Reabrir não devolve tentativa ao candidato no Portal. Quem esgotou os envios continua sem caminho até alguém solicitar reenvio ou zerar as tentativas.",
    "Quem reabriu e quando fica registrado na trilha de alterações da admissão.",
  ],
  relacionados: [
    "assumir-um-documento-como-valido",
    "auditar-os-documentos-da-admissao",
    "visualizar-um-documento-da-admissao",
    "reauditar-um-documento",
    "ler-a-regua-obrigatoria-da-admissao",
    "concluir-o-cadastro-e-o-contrato",
    "abrir-o-prontuario-no-drive",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/backend/src/reauditoria/documento-arquivo.service.ts",
    "apps/backend/src/domain/reabertura-documento.ts",
  ],
  revisadoEm: "2026-09-30",
};
