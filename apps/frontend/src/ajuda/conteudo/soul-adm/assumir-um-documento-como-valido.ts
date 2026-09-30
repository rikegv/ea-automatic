import type { Artigo } from "../../tipos";

/**
 * ─ ASSUMIR COMO VÁLIDO: o veredito humano sobre o veredito da máquina ───────────────────────────
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E O QUE O ARTIGO IRMÃO DEIXOU FORA ─────────────────────────────────┐
 * │ O N1 da aba ("auditar-os-documentos-da-admissao") lista "assumir o documento como válido por   │
 * │ decisão do consultor" entre os recursos que ele deliberadamente NÃO cobre. Nem o botão nem o    │
 * │ efeito dele aparecem lá. Esta é a peça daquele botão.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA CORREÇÃO DE PREMISSA, MEDIDA NO CÓDIGO ───────────────────────────────────────────────┐
 * │ O pedido descrevia este gesto como "exceção de Master". NÃO É. `validacao-humana.service.ts`  │
 * │ é explícito ("QUEM PODE: qualquer consultor, sem restrição de perfil, decisão do diretor") e o │
 * │ controller da rota não tem restrição de papel; na tela, o botão Validar aparece para qualquer  │
 * │ sessão, sem depender do perfil. O que É exceção de Master na MESMA janela é outro botão,       │
 * │ "Zerar tentativas", que devolve ao candidato o teto inteiro de envios no Portal, e esse sim só │
 * │ aparece para Master e Super Admin. Escrever "só Master valida" faria o manual barrar quem tem  │
 * │ o direito, então o artigo diz o que o código faz, e a divergência foi reportada.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ──────────────────────────────────────────────────┐
 * │ REABRIR a pendência é o gesto OPOSTO e tem peça própria. A distinção entre os dois é o       │
 * │ coração das duas peças: assumir como válido ACEITA um documento que a máquina recusou;        │
 * │ reabrir a pendência RECUSA um documento que a máquina aceitou. Uma aponta a outra em          │
 * │ Relacionados, e nenhuma ensina o gesto da outra.                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO ─────────────────────────────────────────┐
 * │ Captura vetada pela auditoria de segurança enquanto a homologação não tiver arnês sintético  │
 * │ (a tela mostra documento de pessoa). Texto escrito para funcionar sem imagem; prints em       │
 * │ entrega própria.                                                                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles`: "Validar" é o rótulo do botão, escrita normal porque é comando. A marca que fica na
 * linha é "Validado por" mais o NOME de quem assumiu, e o mesmo vale para o motivo gravado
 * ("Validado manualmente por"): §A.6, o que se declara é a parte estável, nunca o nome.
 */
export const artigo: Artigo = {
  slug: "assumir-um-documento-como-valido",
  titulo: "Assumir Um Documento Como Válido",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "O que fazer quando o documento está certo e a inteligência artificial insiste em recusar: assumir o documento como válido por sua decisão, assinando com o seu nome, e destravar a régua.",
  termos: [
    "validar documento",
    "validar na mao",
    "aprovar documento",
    "aprovar na mao",
    "assumir documento",
    "forcar aprovacao",
    "ia errou",
    "documento esta certo",
    "recusou errado",
    "liberar documento",
    "destravar documento",
    "validado por",
    "aprovacao manual",
  ],
  preRequisitos: [
    "Ter olhado o arquivo e ter certeza de que o documento está correto: a decisão passa a ser sua e fica registrada com o seu nome.",
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
      gesto: "Abra o arquivo pelo olho da linha e confira o documento antes de decidir.",
      detalhe:
        "Este é o passo que não se pula. O sistema não confere nada depois de você: quem assume responde pelo documento.",
      controles: ["Visualizar documento"],
    },
    {
      gesto: "Leia o motivo escrito abaixo da linha para entender o que a máquina recusou.",
      detalhe:
        "Às vezes a recusa aponta um erro que não está no documento, e sim no cadastro do candidato. Nesse caso corrija o cadastro e peça nova análise, em vez de assumir.",
      controles: ["Inconforme"],
    },
    {
      gesto: "Clique em Validar, na linha do documento.",
      detalhe:
        "O botão diz, ao passar o mouse: Assumir este documento como válido, por decisão sua. Não há confirmação extra, então o clique já vale.",
      controles: ["Validar"],
    },
    {
      gesto: "Confira a marca que passou a aparecer na linha, com Validado por e o seu nome.",
      detalhe:
        "A marca fica visível para quem abrir a janela depois, e o registro guarda quem assumiu e quando. O botão Validar desaparece daquela linha, porque a decisão já existe.",
      controles: ["Validado por", "Validado"],
    },
    {
      gesto: "Leia a barra de progresso no alto: o documento passa a contar como entregue.",
      detalhe:
        "Se ele era o que faltava, a régua obrigatória fecha e a frente de Auditoria conclui sozinha, com o prontuário indo para o Drive pelo mesmo caminho da análise automática.",
      controles: ["obrigatórios validados", "Régua completa"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Aparece: Falha de rede ao validar o documento. Verifique a conexão e tente de novo.",
      acao: "A decisão não foi registrada, e nada mudou no documento. Clique de novo em Validar. Se repetir, confira a conexão e avise a TI.",
    },
    {
      sintoma: "Não vejo o botão Validar na linha.",
      acao: "Aquele documento já foi assumido por alguém, e a linha mostra por quem. O botão sai de propósito: não faz sentido assumir duas vezes o mesmo documento. Discordando da decisão, o caminho é pedir nova análise ou reabrir a pendência.",
    },
    {
      sintoma: "Assumi o documento errado.",
      acao: "Use Reabrir a pendência do documento naquela linha: ela apaga a marca de quem assumiu e devolve o documento a pendente. Leia antes a peça de reabrir, porque isso pode recuar a frente e fechar o Cadastro.",
    },
    {
      sintoma: "Assumi como válido e a frente não concluiu.",
      acao: "Ainda falta outro obrigatório. A barra de progresso no alto da janela diz quantos faltam e quais são. A frente fecha sozinha só quando todos os obrigatórios estiverem validados.",
    },
    {
      sintoma: "A régua fechou pela minha decisão e o aviso diz que ainda não há pasta no Drive.",
      acao: "Os documentos seguem guardados e o sistema tenta enviar de novo na próxima ação. Nada foi perdido. Se continuar assim, avise a TI.",
    },
  ],
  regras: [
    "Qualquer pessoa do time pode assumir um documento como válido: não é exceção de Master e não depende de perfil.",
    "A decisão fica registrada com o seu nome e a data, aparece na própria linha do documento para quem abrir depois, e entra na trilha de alterações da admissão.",
    "Assumir só escreve para frente: o documento passa a entregue, nunca volta atrás por este botão.",
    "Depois de assumido, a coleta automática e os processos em lote param de mexer naquele documento, e a nova análise por inteligência artificial só acontece com aceite explícito de quem pedir.",
    "Documento assumido conta na régua obrigatória igual a um aprovado pela máquina: fechando a régua, a frente de Auditoria conclui sozinha e o prontuário é arquivado no Drive.",
    "Assumir de novo o mesmo documento não duplica nada: apenas reafirma a marca, atualizando quem assumiu e quando.",
    "Não confunda com Zerar tentativas, que aparece na mesma janela e é exceção de Master: aquele devolve envios ao candidato no Portal, este resolve o veredito do documento.",
  ],
  relacionados: [
    "reabrir-a-pendencia-de-um-documento",
    "auditar-os-documentos-da-admissao",
    "visualizar-um-documento-da-admissao",
    "reauditar-um-documento",
    "ler-a-regua-obrigatoria-da-admissao",
    "acompanhar-a-conferencia-do-portal",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/backend/src/reauditoria/validacao-humana.service.ts",
    "apps/backend/src/reauditoria/reauditoria.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
